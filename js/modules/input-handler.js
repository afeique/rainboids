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
        const joystickArea = document.getElementById('joystick-area');
        const joystickHandle = document.getElementById('joystick-handle');
        const musicInfoBox = document.getElementById('music-info');

        const isTouchOnUI = (touch) => {
            const target = touch.target;
            return joystickArea.contains(target) || 
                   musicInfoBox.contains(target);
        };

        document.addEventListener('touchstart', e => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (!isTouchOnUI(touch)) {
                    this.input.fire = true;
                    this.input.aimX = touch.clientX;
                    this.input.aimY = touch.clientY;
                    break; 
                }
            }
        }, { passive: false });

        document.addEventListener('touchmove', e => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (!isTouchOnUI(touch)) {
                    this.input.aimX = touch.clientX;
                    this.input.aimY = touch.clientY;
                    break;
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', e => {
            this.input.fire = false;
        }, { passive: false });
        
        // Enhanced joystick handlers for movement
        joystickArea.addEventListener('touchstart', e => {
            e.preventDefault();
            triggerHapticFeedback(20);
            this.joystickActive = true;
            this.joystickMaxDist = joystickArea.clientWidth / 2.5;
        }, { passive: false });
        
        joystickArea.addEventListener('touchend', e => {
            e.preventDefault();
            this.joystickActive = false;
            this.input.up = false;
            this.input.down = false;
            this.input.left = false;
            this.input.right = false;
            joystickHandle.style.transform = `translate(0px, 0px) translate(-50%, -50%)`;
        }, { passive: false });
        
        joystickArea.addEventListener('touchmove', e => {
            if (!this.joystickActive) return;
            e.preventDefault();
            const rect = joystickArea.getBoundingClientRect();
            const touch = e.targetTouches[0];
            const centerX = joystickArea.offsetWidth / 2;
            const centerY = joystickArea.offsetHeight / 2;
            let dx = touch.clientX - rect.left - centerX;
            let dy = touch.clientY - rect.top - centerY;
            const dist = Math.hypot(dx, dy);
            if (dist > this.joystickMaxDist) {
                dx = (dx / dist) * this.joystickMaxDist;
                dy = (dy / dist) * this.joystickMaxDist;
            }
            joystickHandle.style.transform = `translate(${dx}px, ${dy}px) translate(-50%, -50%)`;
            const normalizedX = dx / this.joystickMaxDist;
            const normalizedY = dy / this.joystickMaxDist;
            
            this.input.up = normalizedY < -0.2;
            this.input.down = normalizedY > 0.2;
            this.input.left = normalizedX < -0.2;
            this.input.right = normalizedX > 0.2;
        }, { passive: false });
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
    }
} 