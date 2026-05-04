// Input handling — keyboard + mouse only. Mobile / touch was removed; the
// desktop-only gate in main.js stops the game from initializing on touch
// devices, so this file does not need to handle them at all.

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
            // 5.64.11 — replaced 4-slot skill bindings with single-equipped
            // model. SPACE pulses activateSkill, tap-SHIFT pulses cycleSkill.
            activateSkill: false,
            cycleSkill: false,
        };

        // Shift-tap-to-cycle bookkeeping (see handleKeyDown/Up).
        this._shiftDownAt = 0;
        this._shiftWithKey = false;

        this.gameEngine = null; // Set by GameEngine after construction.
        this.lastMouseMoveTime = 0;

        this.setupKeyboardControls();
        this.setupMouseControls();
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
            // Right mouse button — power weapon. (5.64.11 removed the
            // Space binding; Space is now skill-activate. Power weapon
            // is right-click only.)
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
            // Spacebar — activates the equipped defense skill (5.64.11
            // moved from power weapon to skill activation; power weapon
            // is now right-click only). preventDefault stops the page
            // from scrolling.
            case 'Space':
                this.input.activateSkill = true;
                e.preventDefault();
                break;
            // Shift (5.64.11) — TAP shift to cycle to the next defense
            // skill. We track a press timestamp + "did another key fire
            // while shift was held" flag; on shift-keyup we only cycle
            // if no other key was pressed AND the press was a brief tap
            // (<300ms). That way shift+letter cheat combos still work
            // without triggering skill cycle.
            case 'ShiftLeft':
            case 'ShiftRight':
                if (this._shiftDownAt === 0) {
                    this._shiftDownAt = Date.now();
                    this._shiftWithKey = false;
                }
                break;
        }
        // Track "shift was held while another key fired" for the tap-to-
        // cycle gate above.
        if (e.shiftKey && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') {
            this._shiftWithKey = true;
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
                // activateSkill is consumed as a one-shot pulse by the
                // player update loop, so no keyup reset is needed.
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                if (this._shiftDownAt > 0) {
                    const held = Date.now() - this._shiftDownAt;
                    if (!this._shiftWithKey && held < 300) {
                        this.input.cycleSkill = true;
                    }
                    this._shiftDownAt = 0;
                    this._shiftWithKey = false;
                }
                break;
        }
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
