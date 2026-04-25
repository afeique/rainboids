// Main entry point for the Rainboids game
import { AudioManager } from './modules/audio/audio-manager.js';
import { InputHandler } from './modules/ui/input-handler.js';
import { UIManager } from './modules/ui/ui-manager.js';
import { GameEngine } from './modules/game-engine.js';
import { GAME_STATES } from './modules/core/constants.js';

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

        // Wait for sfxr to be ready with a timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('sfxr library timeout')), 5000);
        });

        const sfxrPromise = new Promise(resolve => {
            const checkSfxr = () => {
                if (typeof sfxr !== 'undefined' && sfxr && (sfxr.generate || Object.keys(sfxr).length > 0)) {
                    resolve();
                } else {
                    setTimeout(checkSfxr, 100);
                }
            };
            checkSfxr();
        });

        try {
            await Promise.race([sfxrPromise, timeoutPromise]);
            this.audioManager.init();
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
            window.removeEventListener('touchstart', startGame);

            this.audioManager.initializeAudio();
            this.uiManager.startMusic();
            this.gameEngine.init();
        };

        window.addEventListener('keydown', startGame);
        window.addEventListener('click', startGame);
        window.addEventListener('touchstart', startGame);
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
