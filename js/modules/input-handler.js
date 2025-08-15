// Input handling for keyboard and touch controls
import { triggerHapticFeedback } from './utils.js';

export class InputHandler {
    constructor() {
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            fire: false, // Keep for potential future use
            aimX: window.innerWidth / 2, // Default to center of screen
            aimY: window.innerHeight / 2,
        };
        
        console.log(`📱 InputHandler initialized with default aim: (${this.input.aimX}, ${this.input.aimY})`);
        
        this.gameEngine = null; // Will be set by game engine
        
        this.setupKeyboardControls();
        this.setupMouseControls();
        this.setupTouchControls();
    }
    
    setupKeyboardControls() {
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
    }

    
    setupMouseControls() {
        // Check if this is a mobile device
        const isMobile = () => {
            return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
        };
        
        document.addEventListener('mousemove', e => {
            // Skip mouse input on mobile devices to prevent interference with touch
            if (isMobile()) {
                console.log('📱 Ignoring mouse event on mobile device');
                return;
            }
            
            this.input.aimX = e.clientX;
            this.input.aimY = e.clientY;
            
            // Update cursor style based on what's under it
            if (this.gameEngine) {
                const target = this.gameEngine.checkCursorTarget(e.clientX, e.clientY);
                const body = document.body;
                
                if (target === 'enemy') {
                    body.classList.add('cursor-red');
                } else {
                    body.classList.remove('cursor-red');
                }
            }
        });
        document.addEventListener('mousedown', e => {
            // Skip mouse input on mobile devices
            if (isMobile()) {
                console.log('📱 Ignoring mouse down on mobile device');
                return;
            }
            this.input.fire = true;
        });
        document.addEventListener('mouseup', e => {
            // Skip mouse input on mobile devices
            if (isMobile()) {
                console.log('📱 Ignoring mouse up on mobile device');
                return;
            }
            this.input.fire = false;
        });
    }
    
    handleKeyDown(e) {
        if (e.code === 'Escape') {
            // Let the game handle pause
            return;
        }
        
        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.input.up = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.input.down = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.input.left = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.input.right = true;
                break;
        }
    }
    
    handleKeyUp(e) {
        switch (e.code) {
            case 'ArrowUp':
            case 'KeyW':
                this.input.up = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                this.input.down = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                this.input.left = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                this.input.right = false;
                break;
        }
    }
    
    setupTouchControls() {
        // Dynamic joystick system - first touch sets joystick center, second touch aims
        this.activeTouches = new Map(); // Track all active touches
        this.joystickTouchId = null; // Touch ID for movement
        this.aimTouchId = null; // Touch ID for aiming
        this.joystickCenter = null; // Dynamic center position
        this.joystickMaxDist = 80; // Fixed joystick radius
        
        // Multi-touch detection and fallback
        this.touchSupported = 'ontouchstart' in window;
        this.maxTouchPoints = navigator.maxTouchPoints || 1;
        console.log(`📱 Touch info: Supported=${this.touchSupported}, MaxPoints=${this.maxTouchPoints}`);
        
        // Pure two-finger system - no static joystick elements needed
        
        // Test multi-touch capability
        this.testMultiTouch();

        document.addEventListener('touchstart', e => {
            e.preventDefault();
            console.log(`📱 TouchStart: ${e.changedTouches.length} new touches, total active: ${e.touches.length}`);
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                console.log(`📱 Processing touch ID ${touchId} at (${touch.clientX}, ${touch.clientY})`);
                
                // Store touch info
                this.activeTouches.set(touchId, {
                    x: touch.clientX,
                    y: touch.clientY,
                    startX: touch.clientX,
                    startY: touch.clientY
                });
                
                if (this.joystickTouchId === null) {
                    // First touch - set up joystick
                    this.joystickTouchId = touchId;
                    this.joystickCenter = { x: touch.clientX, y: touch.clientY };
                    this.showDynamicJoystick(touch.clientX, touch.clientY);
                    triggerHapticFeedback(20);
                    console.log(`📱 First touch: Joystick center set at (${touch.clientX}, ${touch.clientY}) with ID ${touchId}`);
                } else if (this.aimTouchId === null) {
                    // Second touch - set up aiming
                    this.aimTouchId = touchId;
                    this.input.fire = true;
                    this.input.aimX = touch.clientX;
                    this.input.aimY = touch.clientY;
                    triggerHapticFeedback(15);
                    console.log(`📱 Second touch: Aiming started at (${touch.clientX}, ${touch.clientY}) with ID ${touchId}`);
                } else {
                    console.log(`📱 Third+ touch ignored: ID ${touchId}`);
                }
            }
            
            console.log(`📱 Active touches: ${this.activeTouches.size}, Joystick: ${this.joystickTouchId}, Aim: ${this.aimTouchId}`);
        }, { passive: false });

        document.addEventListener('touchmove', e => {
            e.preventDefault();
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                if (!this.activeTouches.has(touchId)) {
                    console.log(`📱 TouchMove: Unknown touch ID ${touchId}, skipping`);
                    continue;
                }
                
                // Update touch position
                this.activeTouches.set(touchId, {
                    ...this.activeTouches.get(touchId),
                    x: touch.clientX,
                    y: touch.clientY
                });
                
                if (touchId === this.joystickTouchId && this.joystickCenter) {
                    // Handle joystick movement
                    let dx = touch.clientX - this.joystickCenter.x;
                    let dy = touch.clientY - this.joystickCenter.y;
                    const dist = Math.hypot(dx, dy);
                    
                    if (dist > this.joystickMaxDist) {
                        dx = (dx / dist) * this.joystickMaxDist;
                        dy = (dy / dist) * this.joystickMaxDist;
                    }
                    
                    this.updateDynamicJoystick(dx, dy);
                    
                    const normalizedX = dx / this.joystickMaxDist;
                    const normalizedY = dy / this.joystickMaxDist;
                    
                    // WASD-style mobile controls
                    this.input.up = normalizedY < -0.2;
                    this.input.down = normalizedY > 0.2;
                    this.input.left = normalizedX < -0.2;
                    this.input.right = normalizedX > 0.2;
                    
                    // Throttled movement logging
                    if (Math.random() < 0.01) { // 1% of moves logged
                        console.log(`📱 Joystick move: (${normalizedX.toFixed(2)}, ${normalizedY.toFixed(2)}) up:${this.input.up} down:${this.input.down} left:${this.input.left} right:${this.input.right}`);
                    }
                } else if (touchId === this.aimTouchId) {
                    // Handle aiming
                    const oldAimX = this.input.aimX;
                    const oldAimY = this.input.aimY;
                    this.input.aimX = touch.clientX;
                    this.input.aimY = touch.clientY;
                    
                    // Throttled aim logging
                    if (Math.random() < 0.02) { // 2% of aims logged
                        console.log(`📱 AIM UPDATE: (${oldAimX}, ${oldAimY}) → (${touch.clientX}, ${touch.clientY})`);
                    }
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', e => {
            e.preventDefault();
            console.log(`📱 TouchEnd: ${e.changedTouches.length} ended touches, remaining active: ${e.touches.length}`);
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                console.log(`📱 Ending touch ID ${touchId}`);
                this.activeTouches.delete(touchId);
                
                if (touchId === this.joystickTouchId) {
                    // Joystick touch ended
                    this.joystickTouchId = null;
                    this.input.up = false;
                    this.input.down = false;
                    this.input.left = false;
                    this.input.right = false;
                    console.log(`📱 Joystick touch ended (ID ${touchId})`);
                } else if (touchId === this.aimTouchId) {
                    // Aim touch ended
                    this.aimTouchId = null;
                    this.input.fire = false;
                    console.log(`📱 Aiming touch ended (ID ${touchId})`);
                }
            }
            
            // If both fingers are lifted, reset the system
            if (this.activeTouches.size === 0) {
                this.resetDynamicJoystick();
                console.log('📱 All touches ended - joystick reset');
            }
            
            console.log(`📱 Touch state after end: Active touches: ${this.activeTouches.size}, Joystick: ${this.joystickTouchId}, Aim: ${this.aimTouchId}`);
        }, { passive: false });
    }
    
    testMultiTouch() {
        console.log('📱 Testing multi-touch capability...');
        console.log(`📱 window.TouchEvent: ${typeof window.TouchEvent !== 'undefined'}`);
        console.log(`📱 window.touches: ${typeof window.touches}`);
        console.log(`📱 Document touch events supported: ${typeof document.ontouchstart !== 'undefined'}`);
        
        if (navigator.maxTouchPoints) {
            console.log(`📱 Navigator reports max touch points: ${navigator.maxTouchPoints}`);
        }
        
        // Test if touch events fire properly
        let testTouchCount = 0;
        const testHandler = (e) => {
            testTouchCount++;
            console.log(`📱 Test touch event ${testTouchCount}: ${e.type}, touches: ${e.touches ? e.touches.length : 'N/A'}`);
            if (testTouchCount >= 3) {
                document.removeEventListener('touchstart', testHandler);
                document.removeEventListener('touchmove', testHandler);
                document.removeEventListener('touchend', testHandler);
            }
        };
        
        document.addEventListener('touchstart', testHandler, { passive: false });
        document.addEventListener('touchmove', testHandler, { passive: false });
        document.addEventListener('touchend', testHandler, { passive: false });
        
        console.log('📱 Multi-touch test handlers installed (will auto-remove after 3 events)');
    }
    
    showDynamicJoystick(x, y) {
        // Create or show dynamic joystick visual at the touch position
        let joystickBase = document.getElementById('dynamic-joystick-base');
        let joystickHandle = document.getElementById('dynamic-joystick-handle');
        
        if (!joystickBase) {
            // Create dynamic joystick elements
            joystickBase = document.createElement('div');
            joystickBase.id = 'dynamic-joystick-base';
            joystickBase.style.cssText = `
                position: fixed;
                width: ${this.joystickMaxDist * 2}px;
                height: ${this.joystickMaxDist * 2}px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.2);
                z-index: 1000;
                pointer-events: none;
                transform: translate(-50%, -50%);
            `;
            document.body.appendChild(joystickBase);
            
            joystickHandle = document.createElement('div');
            joystickHandle.id = 'dynamic-joystick-handle';
            joystickHandle.style.cssText = `
                position: fixed;
                width: 30px;
                height: 30px;
                background: rgba(255, 255, 255, 0.7);
                border-radius: 50%;
                z-index: 1001;
                pointer-events: none;
                transform: translate(-50%, -50%);
            `;
            document.body.appendChild(joystickHandle);
        }
        
        joystickBase.style.left = x + 'px';
        joystickBase.style.top = y + 'px';
        joystickBase.style.display = 'block';
        
        joystickHandle.style.left = x + 'px';
        joystickHandle.style.top = y + 'px';
        joystickHandle.style.display = 'block';
    }
    
    updateDynamicJoystick(dx, dy) {
        const joystickHandle = document.getElementById('dynamic-joystick-handle');
        if (joystickHandle && this.joystickCenter) {
            joystickHandle.style.left = (this.joystickCenter.x + dx) + 'px';
            joystickHandle.style.top = (this.joystickCenter.y + dy) + 'px';
        }
    }
    
    resetDynamicJoystick() {
        // Hide dynamic joystick
        const joystickBase = document.getElementById('dynamic-joystick-base');
        const joystickHandle = document.getElementById('dynamic-joystick-handle');
        
        if (joystickBase) joystickBase.style.display = 'none';
        if (joystickHandle) joystickHandle.style.display = 'none';
        
        // Reset state
        this.joystickCenter = null;
        this.joystickTouchId = null;
        this.aimTouchId = null;
        
        // Reset input state
        this.input.up = false;
        this.input.down = false;
        this.input.left = false;
        this.input.right = false;
        this.input.fire = false;
    }
    
    getInput() {
        return { ...this.input };
    }
    
    reset() {
        this.input.up = false;
        this.input.down = false;
        this.input.left = false;
        this.input.right = false;
        this.input.fire = false;
        
        // Reset touch state
        if (this.activeTouches) {
            this.activeTouches.clear();
        }
        this.resetDynamicJoystick();
    }
} 