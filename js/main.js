// Main entry point for the Rainboids game
import { AudioManager } from './modules/audio/audio-manager.js';
import { InputHandler } from './modules/ui/input-handler.js';
import { UIManager } from './modules/ui/ui-manager.js';
import { GameEngine } from './modules/game-engine.js';
import { GAME_STATES } from './modules/core/constants.js';
import { VERSION } from './modules/core/version.js';
import { openMultiplayerModal } from './net/multiplayer-modal.js';
import { SESSION_STORAGE_KEY } from './net/ws-client.js';

// Rainboids is mouse-and-keyboard only. If the browser is a phone or tablet
// (coarse pointer, no hover, OR small viewport), we show a "desktop only"
// message and never initialize the game — so no audio download, no canvas
// loop, no input handlers.
function isMobileOrTabletDevice() {
    if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
    if (window.innerWidth < 1024) return true;
    return false;
}

function showDesktopOnlyMessage() {
    const block = document.getElementById('desktop-only-block');
    if (block) block.style.display = 'flex';
    document.body.classList.add('desktop-only-blocked');
}

class RainboidsGame {
    constructor() {
        this.canvas = null;
        this.audioManager = null;
        this.inputHandler = null;
        this.uiManager = null;
        this.gameEngine = null;
    }

    async init() {
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }

        if (isMobileOrTabletDevice()) {
            showDesktopOnlyMessage();
            return;
        }

        this.setupCanvas();
        await this.setupAudio();
        this.setupManagers();
        this.setupGameEngine();
        this.setupStartHandlers();
        this.start();
    }

    setupCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }
    }

    async setupAudio() {
        this.audioManager = new AudioManager();
        try {
            await this.audioManager.init();
        } catch (error) {
            console.warn('⚠️ Audio setup failed, continuing without sound:', error);
        }

        const backgroundMusic = document.getElementById('background-music');
        if (backgroundMusic) {
            this.audioManager.setBackgroundMusic(backgroundMusic);
        }
    }

    setupManagers() {
        this.inputHandler = new InputHandler();
        this.uiManager = new UIManager();
        this.uiManager.setAudioManager(this.audioManager);
    }

    setupGameEngine() {
        this.gameEngine = new GameEngine(
            this.canvas,
            this.uiManager,
            this.audioManager,
            this.inputHandler
        );
        this.uiManager.setGameEngine(this.gameEngine);
        window.gameEngine = this.gameEngine;
        window.game = this.gameEngine;
    }

    setupStartHandlers() {
        let _gameStarted = false;
        // 5.79.9 — set on the first title-screen user gesture (mousemove
        //   or keydown) so the AudioContext.resume() promise has time
        //   to settle before NEW GAME / CONTINUE is clicked. Without
        //   this, the click chime fires 100-300 ms late on first load.
        let _audioWarmed = false;

        // 5.79.0 — Title screen requires an explicit click on NEW GAME
        //   or CONTINUE. The old "press any key to start" auto-launch
        //   was removed so the player can read the title and inspect
        //   their save before committing. The only keyboard shortcut
        //   left is Enter / Space, which acts like a click on the
        //   currently-hovered button (if any).
        const launch = (mode) => {
            if (_gameStarted) return;
            if (this.gameEngine.game.state !== GAME_STATES.TITLE_SCREEN) return;

            const ge = this.gameEngine;
            const wantContinue = mode === 'continue' && ge.hasSavedRun?.();
            if (mode === 'continue' && !wantContinue) return; // disabled button click

            _gameStarted = true;
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup',   onMouseUp);
            window.removeEventListener('click',     onClick);
            window.removeEventListener('mousemove', onMove);

            this.audioManager.initializeAudio();
            this.uiManager.startMusic();

            // 5.79.2 — title button chime SFX. NEW GAME plays the
            //   heroic powerup ding ("starting fresh"); CONTINUE
            //   plays the coin chime ("you're already in"). Both
            //   ride on the existing SFX manifest — no new audio
            //   assets needed.
            try {
                if (wantContinue) this.audioManager.playSound('coin');
                else              this.audioManager.playSound('powerup');
            } catch {}

            const startFn = () => wantContinue ? ge.startContinueRun() : ge.startNewRun();
            const launched = ge.triggerTitleStart(() => startFn());
            if (!launched) startFn();
        };

        const ge = () => this.gameEngine;
        const hitId = (e) => {
            const g = ge();
            if (g.game.state !== GAME_STATES.TITLE_SCREEN) return null;
            const rects = g._titleButtonRects;
            if (!rects) return null;
            const rect = g.canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) * (g.canvas.width  / rect.width);
            const my = (e.clientY - rect.top)  * (g.canvas.height / rect.height);
            const hit = (r) => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
            if (rects.newGame  && hit(rects.newGame))  return 'newGame';
            if (rects.continue && hit(rects.continue) && !rects.continue.disabled) return 'continue';
            if (rects.multiplayer && hit(rects.multiplayer) && !rects.multiplayer.disabled) return 'multiplayer';
            return null;
        };

        // 5.81+ — open the v1 Hello/Welcome modal. Does NOT call launch();
        // multiplayer is purely additive WIP and must not start a solo run.
        const openMultiplayer = () => {
            const ge = this.gameEngine;
            if (ge.game.state !== GAME_STATES.TITLE_SCREEN) return;
            let session = null;
            try { session = localStorage.getItem(SESSION_STORAGE_KEY); } catch {}
            openMultiplayerModal({
                clientVersion: VERSION,
                displayName: 'Pilot',
                session,
            });
        };

        const onMove = (e) => {
            const g = ge();
            if (g.game.state !== GAME_STATES.TITLE_SCREEN) return;
            g._titleHoveredButton = hitId(e);
            // 5.79.9 — Pre-warm the audio context on the FIRST title-
            //   screen mousemove (counts as a user gesture in every
            //   modern browser). This way by the time the user clicks
            //   NEW GAME or CONTINUE, the AudioContext.resume() has
            //   already settled — no delay between click and chime.
            //   Without this, the first playSound() after a fresh page
            //   load fires before the resume promise resolves and the
            //   chime arrives 100-300 ms late.
            if (!_audioWarmed) {
                _audioWarmed = true;
                try { this.audioManager.initializeAudio(); } catch {}
            }
        };

        // Mousedown flips the button into "pressed" state (deeper color
        // change). Mouseup clears it. The actual launch fires on click
        // so a drag-out cancels.
        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            // 5.79.9 — Warm audio if the user clicked before any
            //   mousemove fired (rare but possible on some platforms).
            if (!_audioWarmed) {
                _audioWarmed = true;
                try { this.audioManager.initializeAudio(); } catch {}
            }
            const id = hitId(e);
            if (!id) return;
            ge()._titlePressedButton = id;
        };
        const onMouseUp = () => {
            ge()._titlePressedButton = null;
        };

        const onClick = (e) => {
            if (e.button !== 0 && e.button !== undefined) return;
            const id = hitId(e);
            if (!id) return;
            if (id === 'multiplayer') {
                openMultiplayer();
                return;
            }
            launch(id === 'newGame' ? 'new' : 'continue');
        };

        const onKey = (e) => {
            // 5.79.9 — Any keydown on the title screen warms up the
            //   audio context (counts as a user gesture). Lets keyboard
            //   activation paths also avoid the cold-start sound delay.
            if (!_audioWarmed) {
                _audioWarmed = true;
                try { this.audioManager.initializeAudio(); } catch {}
            }
            // Enter / Space activate the currently-hovered button (if
            // any), or default to the first available action — Continue
            // when a save exists, otherwise New Game. All other keys
            // are ignored on the title screen.
            if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'NumpadEnter') return;
            e.preventDefault();
            const g = ge();
            const hovered = g._titleHoveredButton;
            if (hovered === 'multiplayer') return openMultiplayer();
            if (hovered === 'continue') return launch('continue');
            if (hovered === 'newGame')  return launch('new');
            launch(g.hasSavedRun?.() ? 'continue' : 'new');
        };

        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup',   onMouseUp);
        window.addEventListener('click',     onClick);
        window.addEventListener('mousemove', onMove);
    }

    start() {
        this.gameEngine.start();
        window.gameEngine = this.gameEngine;
    }
}

const game = new RainboidsGame();
(async () => {
    try {
        await game.init();
    } catch (error) {
        console.error('Failed to initialize game:', error);
    }
})();
