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
            aimX: 0,
            aimY: 0,
        };
        
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
        document.addEventListener('mousemove', e => {
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
            this.input.fire = true;
        });
        document.addEventListener('mouseup', e => {
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
        
        // Pure two-finger system - no static joystick elements needed

        document.addEventListener('touchstart', e => {
            e.preventDefault();
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
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
                    console.log('📱 Joystick center set at', touch.clientX, touch.clientY);
                } else if (this.aimTouchId === null) {
                    // Second touch - set up aiming
                    this.aimTouchId = touchId;
                    this.input.fire = true;
                    this.input.aimX = touch.clientX;
                    this.input.aimY = touch.clientY;
                    triggerHapticFeedback(15);
                    console.log('📱 Aiming started at', touch.clientX, touch.clientY);
                }
            }
        }, { passive: false });

        document.addEventListener('touchmove', e => {
            e.preventDefault();
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                if (!this.activeTouches.has(touchId)) continue;
                
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
                } else if (touchId === this.aimTouchId) {
                    // Handle aiming
                    this.input.aimX = touch.clientX;
                    this.input.aimY = touch.clientY;
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', e => {
            e.preventDefault();
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                this.activeTouches.delete(touchId);
                
                if (touchId === this.joystickTouchId) {
                    // Joystick touch ended
                    this.joystickTouchId = null;
                    this.input.up = false;
                    this.input.down = false;
                    this.input.left = false;
                    this.input.right = false;
                    console.log('📱 Joystick touch ended');
                } else if (touchId === this.aimTouchId) {
                    // Aim touch ended
                    this.aimTouchId = null;
                    this.input.fire = false;
                    console.log('📱 Aiming touch ended');
                }
                
                // If both fingers are lifted, reset the system
                if (this.activeTouches.size === 0) {
                    this.resetDynamicJoystick();
                    console.log('📱 All touches ended - joystick reset');
                }
            }
        }, { passive: false });
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