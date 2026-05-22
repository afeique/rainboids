// Input handling — keyboard + mouse only. Mobile / touch was removed; the
// desktop-only gate in main.js stops the game from initializing on touch
// devices, so this file does not need to handle them at all.

import { isMobile } from '../platform/platform-detect.js';

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
            // 5.93.0 — SHIFT-key dash. `shift` is the continuous-state
            // mirror of the Shift key (held → true). `dashPulse` is the
            // one-shot rising-edge pulse consumed once per dash trigger
            // by Player.update — set on Shift keydown (without auto-repeat),
            // cleared after consumption. Mirrors the activateSkill pulse
            // pattern so Player owns the cooldown / already-dashing guards.
            shift: false,
            dashPulse: false,
            aimX: window.innerWidth / 2,
            aimY: window.innerHeight / 2,
            screenAimX: window.innerWidth / 2,
            screenAimY: window.innerHeight / 2,
            // Analog twin-stick channels. `stickInput` is the normalized
            // movement vector (left stick / mobile touch stick); `aimStick`
            // is the right-stick aim vector. `gamepadActive` is true only
            // while a gamepad is the engaged input device (see
            // GamepadHandler) — it gates the analog movement + aim model in
            // player.js so an idle pad never overrides mouse/keyboard/touch.
            stickInput: { x: 0, y: 0, magnitude: 0 },
            aimStick: { x: 0, y: 0, magnitude: 0 },
            gamepadActive: false,
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
            // 5.95.x — On mobile (touch devices), browsers synthesize
            // mousemove events from touch events using PAGE coords. Those
            // synthesized events would overwrite the touch handler's
            // correctly-computed `input.aimX/Y` (set in `_fireAtTap` in
            // mobile-touch.js) with page-coord-based world coords that
            // don't match where the user actually tapped. Result: the
            // ship rotates to face the synthesized event's position, NOT
            // the user's tap. Bail unconditionally on mobile — the touch
            // handler owns aim there.
            if (isMobile()) return;

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
            // 5.95.x — Bail on mobile; the touch handler owns fire input.
            // Synthesized mousedown/mouseup from touch events would race
            // the touch handler's one-shot rAF release pattern.
            if (isMobile()) return;
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
            if (isMobile()) return;
            if (e.button === 0) {
                this.input.fire = false;
            }
            if (e.button === 2) {
                this.input.fireSecondary = false;
            }
        });

        // Ensure fire stops if the cursor leaves the window mid-click.
        // Also clear the Shift state so a window-blur mid-Shift-hold
        // doesn't leave a stale `shift = true` — the user lifted (or
        // alt-tabbed away) and any subsequent dash should be a fresh
        // press, not a continuation. The dashPulse one-shot is cleared
        // here too for the same reason.
        window.addEventListener('blur', () => {
            this.input.fire = false;
            this.input.fireSecondary = false;
            this.input.shift = false;
            this.input.dashPulse = false;
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
            // TAB (6.x) — activate the equipped defense ability/skill.
            // One-shot pulse consumed by Player.update (cooldown guard
            // lives in activateSkill). preventDefault stops Tab from
            // moving DOM focus off the canvas. Auto-repeat ignored so
            // holding Tab doesn't spam re-activations.
            case 'Tab':
                if (!e.repeat) this.input.activateSkill = true;
                e.preventDefault();
                break;
            // 5.93.0 — SHIFT triggers the core dash movement primitive.
            // Set `shift` (continuous-state mirror) so callers can read
            // the held state if needed, plus a one-shot `dashPulse` on
            // the rising edge so Player.update can fire exactly one dash
            // per Shift press (cooldown + already-dashing guards live in
            // Player._triggerDash). Auto-repeat (e.repeat) is ignored so
            // holding Shift doesn't spam dashes — one press, one dash.
            case 'ShiftLeft':
            case 'ShiftRight':
                this.input.shift = true;
                if (!e.repeat) {
                    this.input.dashPulse = true;
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
            // 5.93.0 — SHIFT release clears the continuous-state mirror.
            // The dashPulse one-shot is consumed by Player.update and
            // cleared there, so no keyup-side reset is needed for it.
            case 'ShiftLeft':
            case 'ShiftRight':
                this.input.shift = false;
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
