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
            // Arrow-key aiming: hold ←/→ to rotate the ship's aim. Up arrow
            // mirrors L-click (primary fire); Down arrow mirrors Space /
            // R-click (power weapon).
            rotateLeft: false,
            rotateRight: false,
            fire: false,
            fireSecondary: false,
            activateSkill: false,
            aimX: window.innerWidth / 2,
            aimY: window.innerHeight / 2,
            screenAimX: window.innerWidth / 2,
            screenAimY: window.innerHeight / 2,
        };

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
            // Suppress fire while a radial menu (E/R/F held) is open — that
            // click is the user committing a radial selection, not a fire.
            const radialOpen = this.gameEngine && this.gameEngine.radialMenu && this.gameEngine.radialMenu.isOpen();
            // Left mouse button — primary fire.
            if (e.button === 0 && !radialOpen) {
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
            case 'KeyW':
                this.input.up = true;
                break;
            case 'KeyS':
                this.input.down = true;
                break;
            case 'KeyA':
                this.input.left = true;
                break;
            case 'KeyD':
                this.input.right = true;
                break;
            // Arrow keys aim & fire (5.74). Left/Right rotate the ship's
            // aim (handled in player.js); Up mirrors L-click; Down
            // mirrors Space / R-click. preventDefault stops the page
            // from scrolling when the canvas is focused.
            case 'ArrowLeft':
                this.input.rotateLeft = true;
                e.preventDefault();
                break;
            case 'ArrowRight':
                this.input.rotateRight = true;
                e.preventDefault();
                break;
            case 'ArrowUp':
                this.input.fire = true;
                e.preventDefault();
                break;
            case 'ArrowDown':
                this.input.fireSecondary = true;
                e.preventDefault();
                break;
            // SPACE (5.64.14) — POWER weapon trigger. Continuous-state
            // input mirroring right-click: hold to charge, release to
            // fire. preventDefault stops the page from scrolling.
            case 'Space':
                this.input.fireSecondary = true;
                e.preventDefault();
                break;
            // Q (5.68.4) — activate the equipped defense skill. One-
            // shot pulse consumed in the player update loop. Was TAB
            // in 5.64.14–5.68.3; moved to Q so it sits naturally
            // under the left hand on WASD (no pinky stretch).
            case 'KeyQ':
                if (!e.shiftKey) {
                    this.input.activateSkill = true;
                }
                break;
        }
    }

    handleKeyUp(e) {
        switch (e.code) {
            case 'KeyW':
                this.input.up = false;
                break;
            case 'KeyS':
                this.input.down = false;
                break;
            case 'KeyA':
                this.input.left = false;
                break;
            case 'KeyD':
                this.input.right = false;
                break;
            case 'ArrowLeft':
                this.input.rotateLeft = false;
                break;
            case 'ArrowRight':
                this.input.rotateRight = false;
                break;
            case 'ArrowUp':
                this.input.fire = false;
                break;
            case 'ArrowDown':
                this.input.fireSecondary = false;
                break;
            case 'Space':
                this.input.fireSecondary = false;
                break;
            // Q is consumed as a one-shot activateSkill pulse by the
            // player update loop, so no keyup reset is needed.
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
