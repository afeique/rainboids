// Main entry point for the Rainboids game
import { AudioManager } from './modules/audio/audio-manager.js';
import { InputHandler } from './modules/ui/input-handler.js';
import { UIManager } from './modules/ui/ui-manager.js';
import { GameEngine } from './modules/game-engine.js';
import { GAME_STATES } from './modules/core/constants.js';

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
        const startGame = () => {
            if (_gameStarted) return;
            _gameStarted = true;

            if (this.gameEngine.game.state !== GAME_STATES.TITLE_SCREEN) {
                return;
            }

            window.removeEventListener('keydown', startGame);
            window.removeEventListener('click', startGame);

            // Audio + music initialization must run inside the user gesture
            // stack (autoplay policy), so we kick those off NOW. The title
            // launch animation then plays out — RAINBOIDS spirals in a
            // circle, zooms toward the viewer, fades to black — and only
            // when the screen is fully black does init() fire to start the
            // run. The wave-1 intro overlay (already opaque from frame 1)
            // takes over from the fade so the transition is seamless.
            this.audioManager.initializeAudio();
            this.uiManager.startMusic();

            const launched = this.gameEngine.triggerTitleStart(() => {
                this.gameEngine.init();
            });
            if (!launched) {
                this.gameEngine.init();
            }
        };

        window.addEventListener('keydown', startGame);
        window.addEventListener('click', startGame);
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
