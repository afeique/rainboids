// Input handling — keyboard + mouse + touch (Rainaxian 6.4+).
// Touch press-drag provides analog 2D movement on mobile. The drag origin
// is the initial touch point; the current finger position relative to that
// origin gives a normalized vector consumed in player.update.

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
            // Touch analog drag — set by setupTouchControls below.
            // touchActive: finger currently down on the playfield.
            // touchVecX/Y: normalized [-1..1] vector from drag origin.
            touchActive: false,
            touchVecX: 0,
            touchVecY: 0,
        };

        this.gameEngine = null; // Set by GameEngine after construction.
        this.lastMouseMoveTime = 0;
        this._touchOrigin = null;
        this._touchId = null;

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
            this.lastMouseMoveTime = Date.now();

            this.input.screenAimX = e.clientX;
            this.input.screenAimY = e.clientY;

            if (this.gameEngine && this.gameEngine.screenToWorldCoordinates) {
                const worldCoords = this.gameEngine.screenToWorldCoordinates(e.clientX, e.clientY);
                this.input.aimX = worldCoords.x;
                this.input.aimY = worldCoords.y;
            } else {
                this.input.aimX = e.clientX;
                this.input.aimY = e.clientY;
            }

            if (this.gameEngine && this.gameEngine.checkCursorTarget) {
                const target = this.gameEngine.checkCursorTarget(this.input.aimX, this.input.aimY);
                if (this.gameEngine.setCursorState) {
                    this.gameEngine.setCursorState(target === 'enemy' || target === 'asteroid');
                }
            }
        });

        document.addEventListener('contextmenu', e => {
            e.preventDefault();
        });

        document.addEventListener('mousedown', e => {
            // Left mouse button — primary fire.
            if (e.button === 0) {
                this.input.fire = true;
            }
            // Right mouse button — power weapon (also accepts Space, see
            // handleKeyDown / handleKeyUp).
            if (e.button === 2) {
                this.input.fireSecondary = true;
            }
        });

        document.addEventListener('mouseup', e => {
            if (e.button === 0) {
                this.input.fire = false;
            }
            if (e.button === 2) {
                this.input.fireSecondary = false;
            }
        });

        // Ensure fire stops if the cursor leaves the window mid-click.
        window.addEventListener('blur', () => {
            this.input.fire = false;
            this.input.fireSecondary = false;
        });
    }

    handleKeyDown(e) {
        if (e.code === 'Escape') {
            // Pause is handled by the engine's own listener.
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
            // Spacebar — alternate power-weapon trigger (mirrors right-click).
            // preventDefault stops the page from scrolling.
            case 'Space':
                this.input.fireSecondary = true;
                e.preventDefault();
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
            case 'Space':
                this.input.fireSecondary = false;
                break;
        }
    }

    setupTouchControls() {
        // Drag-radius (px) at which touchVec saturates at ±1.
        const MAX_RADIUS = 90;
        // Dead zone — taps within this radius produce 0 vector to avoid jitter.
        const DEADZONE = 8;

        const canvas = document.getElementById('gameCanvas') || document;

        const onStart = (e) => {
            // Only accept the first finger so multitouch doesn't fight.
            if (this._touchId !== null) return;
            const t = e.changedTouches[0];
            this._touchId = t.identifier;
            this._touchOrigin = { x: t.clientX, y: t.clientY };
            this.input.touchActive = true;
            this.input.touchVecX = 0;
            this.input.touchVecY = 0;
            // Tap also pulls fire trigger so charge-shot patterns still work.
            this.input.fire = true;
            e.preventDefault();
        };

        const onMove = (e) => {
            if (this._touchId === null || !this._touchOrigin) return;
            for (const t of e.changedTouches) {
                if (t.identifier !== this._touchId) continue;
                const dx = t.clientX - this._touchOrigin.x;
                const dy = t.clientY - this._touchOrigin.y;
                const dist = Math.hypot(dx, dy);
                if (dist < DEADZONE) {
                    this.input.touchVecX = 0;
                    this.input.touchVecY = 0;
                } else {
                    const k = Math.min(1, dist / MAX_RADIUS);
                    const ang = Math.atan2(dy, dx);
                    this.input.touchVecX = Math.cos(ang) * k;
                    this.input.touchVecY = Math.sin(ang) * k;
                }
                e.preventDefault();
                break;
            }
        };

        const onEnd = (e) => {
            for (const t of e.changedTouches) {
                if (t.identifier !== this._touchId) continue;
                this._touchId = null;
                this._touchOrigin = null;
                this.input.touchActive = false;
                this.input.touchVecX = 0;
                this.input.touchVecY = 0;
                this.input.fire = false;
                e.preventDefault();
                break;
            }
        };

        canvas.addEventListener('touchstart', onStart, { passive: false });
        canvas.addEventListener('touchmove',  onMove,  { passive: false });
        canvas.addEventListener('touchend',   onEnd,   { passive: false });
        canvas.addEventListener('touchcancel',onEnd,   { passive: false });
    }

    // Update aim coordinates when player moves to maintain relative aiming direction.
    updateAimForPlayerMovement(deltaX, deltaY) {
        // Only update if mouse hasn't moved recently (within last 100ms).
        const now = Date.now();
        if (!this.lastMouseMoveTime || (now - this.lastMouseMoveTime) > 100) {
            this.input.aimX += deltaX;
            this.input.aimY += deltaY;
            this.input.screenAimX += deltaX;
            this.input.screenAimY += deltaY;
        }
    }

    getInput() {
        return this.input;
    }

    reset() {
        this.input.fire = false;
    }
}
