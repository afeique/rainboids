// Input handling for keyboard and touch controls
import { triggerHapticFeedback } from './utils.js';

export class InputHandler {
    constructor() {
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            fire: false,
            fireSecondary: false, // Right-click: release charged shot
            aimX: window.innerWidth / 2,
            aimY: window.innerHeight / 2,
            screenAimX: window.innerWidth / 2,
            screenAimY: window.innerHeight / 2,
            skill1: false,
            skill2: false,
            skill3: false,
            skill4: false,
        };
        
        
        this.gameEngine = null; // Will be set by game engine
        
        this.setupKeyboardControls();
        this.setupMouseControls();
        this.setupTouchControls();
    }
    
    isMobile() {
        return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
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
                return;
            }
            
            // Track when mouse was last moved
            this.lastMouseMoveTime = Date.now();
            
            // Console log to verify mouse is working on desktop
            if (Math.random() < 0.01) {
            }
            
            // Store screen coordinates for UI elements
            this.input.screenAimX = e.clientX;
            this.input.screenAimY = e.clientY;
            
            // Convert screen coordinates to world coordinates for gameplay
            if (this.gameEngine && this.gameEngine.screenToWorldCoordinates) {
                const worldCoords = this.gameEngine.screenToWorldCoordinates(e.clientX, e.clientY);
                this.input.aimX = worldCoords.x;
                this.input.aimY = worldCoords.y;
                
            } else {
                // Fallback to screen coordinates if no camera system
                this.input.aimX = e.clientX;
                this.input.aimY = e.clientY;
            }
            
            // Update cursor style based on what's under it (use world coordinates)
            if (this.gameEngine && this.gameEngine.checkCursorTarget) {
                const target = this.gameEngine.checkCursorTarget(this.input.aimX, this.input.aimY);
                
                // Set cursor state in game engine for canvas-based rendering
                if (this.gameEngine.setCursorState) {
                    this.gameEngine.setCursorState(target === 'enemy' || target === 'asteroid');
                }
            }
        });
        // Prevent right-click context menu on the game canvas
        document.addEventListener('contextmenu', e => {
            e.preventDefault();
        });
        document.addEventListener('mousedown', e => {
            if (isMobile()) return;
            if (e.button === 2) {
                // Right-click: fire charged shot (secondary)
                this.input.fireSecondary = true;
            }
        });
        document.addEventListener('mouseup', e => {
            if (isMobile()) return;
            if (e.button === 2) {
                this.input.fireSecondary = false;
            }
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
            // Defense skill activation (number keys 1-4, only without Shift)
            case 'Digit1':
                if (!e.shiftKey) this.input.skill1 = true;
                break;
            case 'Digit2':
                if (!e.shiftKey) this.input.skill2 = true;
                break;
            case 'Digit3':
                if (!e.shiftKey) this.input.skill3 = true;
                break;
            case 'Digit4':
                if (!e.shiftKey) this.input.skill4 = true;
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
        this.joystickBaseEl = null; // Cached DOM ref
        this.joystickHandleEl = null; // Cached DOM ref
        
        // Multi-touch detection and fallback
        this.touchSupported = 'ontouchstart' in window;
        this.maxTouchPoints = navigator.maxTouchPoints || 1;
        
        // Pure two-finger system - no static joystick elements needed
        
        // Test multi-touch capability
        this.testMultiTouch();

        document.addEventListener('touchstart', e => {
            // Let pause overlay handle its own touches so click events fire on buttons
            if (e.target.closest && e.target.closest('#pause-overlay')) return;
            e.preventDefault();

            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;

                // Check for pause button tap before starting joystick
                if (this.gameEngine && this.gameEngine.pauseButtonRect) {
                    const r = this.gameEngine.pauseButtonRect;
                    if (touch.clientX >= r.x && touch.clientX <= r.x + r.w &&
                        touch.clientY >= r.y && touch.clientY <= r.y + r.h) {
                        this.gameEngine.togglePause();
                        triggerHapticFeedback(30);
                        continue;
                    }
                }

                // Store touch info
                this.activeTouches.set(touchId, {
                    x: touch.clientX,
                    y: touch.clientY,
                    startX: touch.clientX,
                    startY: touch.clientY
                });

                if (this.joystickTouchId === null) {
                    // First touch - set up movement joystick
                    this.joystickTouchId = touchId;
                    this.joystickCenter = { x: touch.clientX, y: touch.clientY };
                    this.showDynamicJoystick(touch.clientX, touch.clientY);
                    triggerHapticFeedback(20);
                }
                // Additional touches ignored — aiming is handled automatically
            }

        }, { passive: false });

        document.addEventListener('touchmove', e => {
            // Allow native scroll inside pause overlay
            if (e.target.closest && e.target.closest('#pause-overlay')) return;
            e.preventDefault();
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                if (!this.activeTouches.has(touchId)) {
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
                    }
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', e => {
            if (e.target.closest && e.target.closest('#pause-overlay')) return;
            e.preventDefault();
            
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                const touchId = touch.identifier;
                
                this.activeTouches.delete(touchId);
                
                if (touchId === this.joystickTouchId) {
                    // Joystick touch ended
                    this.joystickTouchId = null;
                    this.joystickCenter = null;
                    this.hideDynamicJoystick();
                    // Only reset movement input if we're on mobile (touch controls)
                    // Don't interfere with keyboard input on desktop
                    if (this.isMobile()) {
                        this.input.up = false;
                        this.input.down = false;
                        this.input.left = false;
                        this.input.right = false;
                    }
                }
            }
            
            // If both fingers are lifted, reset the system
            if (this.activeTouches.size === 0) {
                this.resetDynamicJoystick();
            }
            
        }, { passive: false });
    }
    
    testMultiTouch() {

        if (navigator.maxTouchPoints) {
        }

        // Test if touch events fire properly
        let testTouchCount = 0;
        const testHandler = (e) => {
            testTouchCount++;
            if (testTouchCount >= 3) {
                document.removeEventListener('touchstart', testHandler);
                document.removeEventListener('touchmove', testHandler);
                document.removeEventListener('touchend', testHandler);
            }
        };

        document.addEventListener('touchstart', testHandler, { passive: false });
        document.addEventListener('touchmove', testHandler, { passive: false });
        document.addEventListener('touchend', testHandler, { passive: false });

        // Cleanup listeners after 10 seconds to avoid memory leak
        setTimeout(() => {
            document.removeEventListener('touchstart', testHandler);
            document.removeEventListener('touchmove', testHandler);
            document.removeEventListener('touchend', testHandler);
        }, 10000);

    }
    
    showDynamicJoystick(x, y) {
        // Create or show dynamic joystick visual at the touch position
        let joystickBase = this.joystickBaseEl;
        let joystickHandle = this.joystickHandleEl;

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

            this.joystickBaseEl = joystickBase;
            this.joystickHandleEl = joystickHandle;
        }

        joystickBase.style.left = x + 'px';
        joystickBase.style.top = y + 'px';
        joystickBase.style.display = 'block';
        
        joystickHandle.style.left = x + 'px';
        joystickHandle.style.top = y + 'px';
        joystickHandle.style.display = 'block';
    }
    
    updateDynamicJoystick(dx, dy) {
        const joystickHandle = this.joystickHandleEl;
        if (joystickHandle && this.joystickCenter) {
            joystickHandle.style.left = (this.joystickCenter.x + dx) + 'px';
            joystickHandle.style.top = (this.joystickCenter.y + dy) + 'px';
        }
    }

    hideDynamicJoystick() {
        if (this.joystickBaseEl) this.joystickBaseEl.style.display = 'none';
        if (this.joystickHandleEl) this.joystickHandleEl.style.display = 'none';
    }

    resetDynamicJoystick() {
        // Hide dynamic joystick
        if (this.joystickBaseEl) this.joystickBaseEl.style.display = 'none';
        if (this.joystickHandleEl) this.joystickHandleEl.style.display = 'none';
        
        // Reset state
        this.joystickCenter = null;
        this.joystickTouchId = null;
        this.aimTouchId = null;

        // Reset input state - only reset movement keys on mobile to avoid interfering with keyboard
        if (this.isMobile()) {
            this.input.up = false;
            this.input.down = false;
            this.input.left = false;
            this.input.right = false;
        }
        this.input.fire = false;
    }
    
    // Update aim coordinates when player moves to maintain relative aiming direction
    updateAimForPlayerMovement(deltaX, deltaY) {
        // Only update if mouse hasn't moved recently (within last 100ms)
        const now = Date.now();
        if (!this.lastMouseMoveTime || (now - this.lastMouseMoveTime) > 100) {
            this.input.aimX += deltaX;
            this.input.aimY += deltaY;
            // Also update screen coordinates for UI consistency
            this.input.screenAimX += deltaX;
            this.input.screenAimY += deltaY;
        }
    }
    
    getInput() {
        return this.input;
    }
    
    reset() {
        // Only reset movement keys on mobile to avoid interfering with keyboard input
        if (this.isMobile()) {
            this.input.up = false;
            this.input.down = false;
            this.input.left = false;
            this.input.right = false;
        }
        this.input.fire = false;
        
        // Reset touch state
        if (this.activeTouches) {
            this.activeTouches.clear();
        }
        this.resetDynamicJoystick();
    }
} 