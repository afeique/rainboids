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
            skill1: false,
            skill2: false,
            skill3: false,
            skill4: false,
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
            if (e.button === 2) {
                this.input.fireSecondary = true;
            }
        });

        document.addEventListener('mouseup', e => {
            if (e.button === 2) {
                this.input.fireSecondary = false;
            }
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
