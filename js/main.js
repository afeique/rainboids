// Main entry point for the Rainboids game
import { AudioManager } from './modules/audio/audio-manager.js';
import { InputHandler } from './modules/ui/input-handler.js';
import { UIManager } from './modules/ui/ui-manager.js';
import { GameEngine } from './modules/game-engine.js';
import { GAME_STATES } from './modules/core/constants.js';
import { VERSION } from './modules/core/version.js';
import { isMobile as _isMobilePlatform } from './modules/platform/platform-detect.js';
import { buildStaticDom } from './modules/ui/static-dom.js';
import { applyFonts } from './modules/ui/font-settings.js';
import { mountMobileTutorial } from './modules/ui/mobile-tutorial.js';

// 5.91.0 — Rainboids now supports a full mobile-mode overhaul (auto-
// pilot + tap-to-shoot + long-press weapon radial). The desktop-only
// gate now only fires for an in-between class of device that is touch-
// capable but doesn't quite hit the mobile threshold (e.g. a hybrid
// laptop with a touchscreen and a 1280px viewport) — those still
// benefit from the mouse-and-keyboard experience.
//
// The order is:
//   1. `?mobile=1` URL override → run the game with mobile mode.
//   2. `?mobile=0` URL override → run the game with desktop mode.
//   3. isMobile() (touch + small viewport) → run with mobile mode.
//   4. Otherwise: desktop. Never blocked.
function shouldBlockDesktopOnly() {
    // Mobile-mode handles touch entirely, so it's never the blocked case.
    if (_isMobilePlatform()) return false;
    // Keep the legacy classification for the borderline "touch + small
    // viewport but not quite a phone" case (which used to hit the 1024px
    // breakpoint). We now widen the desktop bucket — only block when the
    // viewport is genuinely tiny (<720px on the long axis) AND the device
    // is touch-only. This is essentially "an older tablet that doesn't
    // hit isMobile()'s 900px ceiling".
    const veryNarrow = window.innerWidth < 720;
    const touchOnly = window.matchMedia &&
        window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    return touchOnly && veryNarrow;
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

        if (shouldBlockDesktopOnly()) {
            showDesktopOnlyMessage();
            return;
        }

        // 5.100.2 — Populate the stubbed overlay containers before
        // any UI module's constructor walks the DOM. Without this,
        // UIManager / StatsOverlay would find empty <div> stubs and
        // every getElementById('music-play-pause' etc.) would return
        // null. See js/modules/ui/static-dom.js for the markup
        // builders that own this previously-static content.
        buildStaticDom();
        // 6.158.0 — apply the saved menu fonts to :root before any UI shows.
        applyFonts();

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
        // Shared "leaving the title screen" prelude — runs the same audio
        // warm-up, button chime, and event-listener teardown for every
        // launch path (solo, continue, or online).
        const consumeTitleScreen = ({ chime } = {}) => {
            _gameStarted = true;
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup',   onMouseUp);
            window.removeEventListener('click',     onClick);
            window.removeEventListener('mousemove', onMove);
            // 6.18.2 — Plug touchstart listener leak. onTouchWarmAudio
            // was registered alongside the other title-screen listeners
            // but never removed; after leaving the title screen it
            // continued firing on every touch for the rest of the
            // session (cheap no-op once audio is warm, but a leak all
            // the same and a footgun if the handler ever grows).
            window.removeEventListener('touchstart', onTouchWarmAudio);

            this.audioManager.initializeAudio();
            this.uiManager.startMusic();
            if (chime) {
                try { this.audioManager.playSound(chime); } catch {}
            }
        };
        // Phase R2 — expose the title teardown so the ARMORY's START RUN can
        // finalize the title-screen exit (the armory opens over a still-live
        // title so BACK can return to it).
        this.gameEngine._finalizeTitleExit = () => consumeTitleScreen({});

        const launch = (mode) => {
            if (_gameStarted) return;
            if (this.gameEngine.game.state !== GAME_STATES.TITLE_SCREEN) return;

            const ge = this.gameEngine;
            const wantContinue = mode === 'continue' && ge.hasSavedRun?.();
            if (mode === 'continue' && !wantContinue) return; // disabled button click

            if (wantContinue) {
                // CONTINUE resumes mid-run — full teardown + straight to the run.
                consumeTitleScreen({ chime: 'coin' });
                const start = () => ge.startContinueRun?.();
                if (typeof ge.triggerTitleStart === 'function') {
                    if (!ge.triggerTitleStart(start)) start();
                } else {
                    start();
                }
                return;
            }
            // Phase R2 — NEW GAME opens the ARMORY first (TITLE → ARMORY →
            // run). Init audio on this gesture but keep the title live
            // underneath so the armory's BACK returns to it; the armory's
            // START RUN performs the final teardown (_finalizeTitleExit).
            try { this.gameEngine.audioManager?.initializeAudio?.(); } catch {}
            try { this.gameEngine.uiManager?.startMusic?.(); } catch {}
            try { this.gameEngine.audioManager?.playSound?.('powerup'); } catch {}
            ge.openArmory?.();
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
            if (rects.tutorial && hit(rects.tutorial)) return 'tutorial';
            if (rects.hangar   && hit(rects.hangar))   return 'hangar';
            if (rects.settings && hit(rects.settings)) return 'settings';
            return null;
        };

        // (Multiplayer shelved — the /mp navigation handler was removed.
        // See /multiplayer/RESTORE.md to bring it back.)

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
            // 6.28.0 — TUTORIAL button opens the tutorial overlay (does
            // not start a run).
            if (id === 'tutorial') {
                const ov = document.getElementById('tutorial-overlay');
                if (ov) ov.style.display = 'flex';
                try { this.audioManager.playSound?.('coin'); } catch {}
                return;
            }
            // 6.157.0 — HANGAR button opens the cosmetic ship-skin selector.
            if (id === 'hangar') {
                try { this.audioManager.playSound?.('coin'); } catch {}
                ge().openHangar?.();
                return;
            }
            // 6.158.0 — SETTINGS button opens the fonts/display settings.
            if (id === 'settings') {
                try { this.audioManager.playSound?.('coin'); } catch {}
                ge().openSettings?.();
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
            if (hovered === 'continue') return launch('continue');
            if (hovered === 'newGame')  return launch('new');
            launch(g.hasSavedRun?.() ? 'continue' : 'new');
        };

        // 5.92.1 — Mobile audio fix. The mousemove/mousedown/keydown
        //   warmers above never fire on touch devices (iOS Safari fires
        //   touch events, not synthetic mouse events, until a tap is
        //   completed). Without a touchstart-path warmer the AudioContext
        //   stays suspended for the entire session and mobile players
        //   hear nothing. This listener is dedicated and passive so it
        //   never blocks scroll or interferes with the gameplay touch
        //   handler in js/modules/ui/mobile-touch.js (which uses
        //   { passive: false }) — they're independent listeners on the
        //   same event.
        const onTouchWarmAudio = (e) => {
            if (!_audioWarmed) {
                _audioWarmed = true;
                try { this.audioManager.initializeAudio(); } catch {}
            }
        };

        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup',   onMouseUp);
        window.addEventListener('click',     onClick);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchstart', onTouchWarmAudio, { passive: true });
    }

    start() {
        this.gameEngine.start();
        window.gameEngine = this.gameEngine;
        // MB-3 — first-run mobile tutorial. Mounted once the title screen is
        // up; mountMobileTutorial() self-gates on isMobile() + the "seen"
        // localStorage flag, so desktop and repeat-visit mobile players never
        // see it. The overlay sits over the title and is dismissed with one
        // tap (which also primes the audio-unlock gesture).
        mountMobileTutorial();
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
