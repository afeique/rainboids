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
        console.log('🚀 Starting game initialization...');
        
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            console.log('⏳ Waiting for DOM...');
            await new Promise(resolve => {
                document.addEventListener('DOMContentLoaded', resolve);
            });
        }
        console.log('✅ DOM ready');
        
        this.setupLoadingScreen();
        console.log('✅ Loading screen set up');
        
        await this.loadAssets();
        console.log('✅ Assets loaded');
        
        this.hideLoadingScreen();
        console.log('✅ Loading screen hidden');
        
        this.setupCanvas();
        console.log('✅ Canvas set up');
        
        await this.setupAudio();
        console.log('✅ Audio set up');
        
        this.setupManagers();
        console.log('✅ Managers set up');
        
        this.setupGameEngine();
        console.log('✅ Game engine set up');
        
        this.setupStartHandlers();
        console.log('✅ Start handlers set up');
        
        this.start();
        console.log('✅ Game started - should be on title screen now');
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
        console.log('🔊 Creating AudioManager...');
        this.audioManager = new AudioManager();

        console.log('🔊 Waiting for sfxr library...');
        
        // Wait for sfxr to be ready with a timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('sfxr library timeout')), 5000);
        });
        
        const sfxrPromise = new Promise(resolve => {
            const checkSfxr = () => {
                console.log('🔊 Checking sfxr...', typeof sfxr, sfxr && Object.keys(sfxr));
                if (typeof sfxr !== 'undefined' && sfxr && (sfxr.generate || Object.keys(sfxr).length > 0)) {
                    console.log('✅ sfxr is ready!');
                    resolve();
                } else {
                    setTimeout(checkSfxr, 100);
                }
            };
            checkSfxr();
        });

        try {
            await Promise.race([sfxrPromise, timeoutPromise]);
            console.log('🔊 Initializing audio manager...');
            this.audioManager.init();
            console.log('✅ Audio initialized successfully!');
        } catch (error) {
            console.warn('⚠️ Audio setup failed, continuing without sound:', error);
            // Continue without audio rather than blocking the game
        }

        const backgroundMusic = document.getElementById('background-music');
        if (backgroundMusic) {
            this.audioManager.setBackgroundMusic(backgroundMusic);
        }
        console.log('🔊 Audio setup complete');
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
        console.log('🎮 Setting up start handlers...');
        console.log('🎮 Current game state:', this.gameEngine.game.state);
        
        const startGame = () => {
            console.log('🎯 Start game triggered! Current state:', this.gameEngine.game.state);
            
            if (this.gameEngine.game.state !== GAME_STATES.TITLE_SCREEN) {
                console.log('❌ Not in title screen, ignoring. Current state:', this.gameEngine.game.state);
                return;
            }
            
            // Remove start event listeners immediately to prevent multiple triggers
            window.removeEventListener('keydown', startGame);
            window.removeEventListener('click', startGame);
            window.removeEventListener('touchstart', startGame);
            console.log('✅ Event listeners removed');
            
            console.log('✅ Starting game transition...');
            this.uiManager.hideTitleScreen();
            this.audioManager.initializeAudio();
            this.uiManager.startMusic();
            this.gameEngine.init();
            this.gameEngine.game.state = GAME_STATES.PLAYING;
            console.log('✅ Game state changed to:', this.gameEngine.game.state);
        };
        
        window.addEventListener('keydown', startGame);
        window.addEventListener('click', startGame);
        window.addEventListener('touchstart', startGame);
        console.log('✅ Event listeners added for keydown, click, and touchstart');
    }
    
    start() {
        this.gameEngine.start();
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