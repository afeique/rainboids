// Main entry point for the Rainboids game
import { AssetLoader } from './modules/asset-loader.js';
import { AudioManager } from './modules/audio-manager.js';
import { InputHandler } from './modules/input-handler.js';
import { UIManager } from './modules/ui-manager.js';
import { GameEngine } from './modules/game-engine.js';
import { GAME_STATES } from './modules/constants.js';

class RainboidsGame {
    constructor() {
        this.canvas = null;
        this.audioManager = null;
        this.inputHandler = null;
        this.uiManager = null;
        this.gameEngine = null;
        this.assetLoader = null;
        this.loadingScreen = null;
    }
    
    async init() {
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        
        this.setupLoadingScreen();
        
        await this.loadAssets();
        
        this.hideLoadingScreen();
        
        this.setupCanvas();
        
        await this.setupAudio();
        
        this.setupManagers();
        
        this.setupGameEngine();
        
        this.setupStartHandlers();
        
        this.start();
    }
    
    setupLoadingScreen() {
        this.loadingScreen = document.getElementById('loading-screen');
        this.assetLoader = new AssetLoader();
        
        // Set up progress callback
        this.assetLoader.setProgressCallback((progress) => {
            const progressBar = document.getElementById('loading-progress');
            const loadingText = document.getElementById('loading-text');
            
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }
            
            if (loadingText) {
                loadingText.textContent = `Loading... ${Math.round(progress)}%`;
            }
        });
    }
    
    async loadAssets() {
        const success = await this.assetLoader.loadAllAssets();
        
        if (!success) {
        }
        
        // Debug: Check if canvas exists and is visible
        const canvas = document.getElementById('gameCanvas');
        if (canvas) {
        } else {
        }
    }
    
    hideLoadingScreen() {
        if (this.loadingScreen) {
            this.loadingScreen.style.display = 'none';
        }
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
            // Continue without audio rather than blocking the game
        }

        const backgroundMusic = document.getElementById('background-music');
        if (backgroundMusic) {
            this.audioManager.setBackgroundMusic(backgroundMusic);
        }
    }
    
    setupManagers() {
        this.inputHandler = new InputHandler();
        this.uiManager = new UIManager();
        // Pass audio manager to UI manager for SFX controls
        this.uiManager.setAudioManager(this.audioManager);
    }
    
    setupGameEngine() {
        this.gameEngine = new GameEngine(
            this.canvas,
            this.uiManager,
            this.audioManager,
            this.inputHandler
        );
        window.gameEngine = this.gameEngine;
        window.game = this.gameEngine; // Expose for UI access
    }
    
    setupStartHandlers() {
        
        const startGame = () => {
            
            if (this.gameEngine.game.state !== GAME_STATES.TITLE_SCREEN) {
                return;
            }
            
            // Remove start event listeners immediately to prevent multiple triggers
            window.removeEventListener('keydown', startGame);
            window.removeEventListener('click', startGame);
            window.removeEventListener('touchstart', startGame);
            
            // this.uiManager.hideTitleScreen();
            this.audioManager.initializeAudio();
            this.uiManager.startMusic();
            this.gameEngine.init();
            this.gameEngine.game.state = GAME_STATES.PLAYING;
        };
        
        window.addEventListener('keydown', startGame);
        window.addEventListener('click', startGame);
        window.addEventListener('touchstart', startGame);
    }
    
    start() {
        this.gameEngine.start();
        
        // Make gameEngine accessible for debugging
        window.gameEngine = this.gameEngine;
    }
}

// Initialize the game when the script loads
const game = new RainboidsGame();
(async () => {
    try {
        await game.init();
    } catch (error) {
    console.error('Failed to initialize game:', error);
    }
})(); 