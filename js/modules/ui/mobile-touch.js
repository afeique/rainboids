// MobileTouchHandler — touch input for the 6.1.1 mobile control
// model: virtual analog stick (drag-to-move) + tap-anywhere-to-DASH.
// Auto-aim + auto-fire run continuously (unified `autoFire` assist,
// forced true on mobile, covers BOTH primary AND power weapons), so
// the player's job on mobile is purely DODGING. Tap to dash through
// danger; the game handles everything else.
//
// Touch classification on each new touch:
//   1. HUD button hit → button action.
//   2. Radial menu open → wedge hover.
//   3. Inside the analog stick base zone → start a stick session.
//   4. Otherwise → "tap candidate" — if it ends within TAP_MS with
//      drift < DRAG_CANCEL_PX, triggers a DASH (i-frame burst, same
//      mechanism the desktop SHIFT key uses).
//
// Pre-6.1.1 behavior:
//   - 5.94: tap-to-aim-and-fire (one shot per tap)
//   - 5.97: press-and-hold continuous fire + drag-to-aim
//   - 5.100–6.1.0: tap to fire power weapon (autoPower toggle for
//     fully-automated power firing)
//   - 6.1.1: tap to DASH. Power weapon auto-fires via the unified
//     autoFire assist (autoPower was retired).

import { isMobile } from '../platform/platform-detect.js';
import { GAME_STATES } from '../core/constants.js';

const TAP_MS = 350;              // release within this = tap (triggers dash)
const DRAG_CANCEL_PX = 16;       // drift past this = not a tap

// 5.100.0 — Gameplay touch only runs in PLAYING / WAVE_TRANSITION. The
// title screen / pause / shop / game-over / wave-pick overlays own
// their own touch surfaces and the stick / power-tap would conflict.
const PLAYABLE_STATES = new Set([GAME_STATES.PLAYING, GAME_STATES.WAVE_TRANSITION]);

export class MobileTouchHandler {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.enabled = false;

        // Active touch state — single finger only.
        this._touchId = null;
        this._startX = 0;
        this._startY = 0;
        this._startTime = 0;
        this._dragged = false;
        this._hudPressedId = null;
        // Classification of the active touch session:
        //   'stick' — drives the analog stick
        //   'hud'   — pressed a HUD button
        //   'radial'— radial menu open at touchstart
        //   'tap'   — empty-canvas touch; will fire power weapon if
        //             released as a tap within TAP_MS + DRAG_CANCEL_PX
        this._touchKind = null;

        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove  = this._onTouchMove.bind(this);
        this._onTouchEnd   = this._onTouchEnd.bind(this);
        this._onTouchCancel = this._onTouchCancel.bind(this);
    }

    /**
     * Attach listeners. Call once at game start; no-op on desktop.
     */
    install() {
        if (this.enabled) return;
        if (!isMobile()) return;
        const canvas = this.engine.canvas;
        if (!canvas) return;

        canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
        canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
        canvas.addEventListener('touchend',   this._onTouchEnd,   { passive: false });
        canvas.addEventListener('touchcancel', this._onTouchCancel, { passive: false });

        this.enabled = true;
    }

    // ── Internal helpers ────────────────────────────────────────────────

    _canvasCoords(touch) {
        const rect = this.engine.canvas.getBoundingClientRect();
        const x = (touch.clientX - rect.left) * (this.engine.canvas.width  / rect.width);
        const y = (touch.clientY - rect.top)  * (this.engine.canvas.height / rect.height);
        return { x, y };
    }

    _isPlayableState() {
        const state = this.engine && this.engine.game && this.engine.game.state;
        return PLAYABLE_STATES.has(state);
    }

    // Hit-test the canvas HUD buttons (SHOP / STATS / PAUSE). Mobile
    // dropped the PRM/PWR side buttons in 5.100, so only three buttons
    // remain. Returns the button id or null.
    _hitHudButton(canvasX, canvasY) {
        const rects = this.engine && this.engine._hudButtonRects;
        if (!rects) return null;
        for (const k of Object.keys(rects)) {
            const r = rects[k];
            if (canvasX >= r.x && canvasX <= r.x + r.w &&
                canvasY >= r.y && canvasY <= r.y + r.h) {
                return r.id;
            }
        }
        return null;
    }

    // Hit-test the GAME OVER screen buttons (newGame / restartWave),
    // mirroring event-setup.js's desktop `_gameOverHitId`.
    _hitGameOverButton(canvasX, canvasY) {
        const rects = this.engine && this.engine._gameOverButtonRects;
        if (!rects) return null;
        for (const id of ['newGame', 'restartWave']) {
            const r = rects[id];
            if (!r || r.disabled) continue;
            if (canvasX >= r.x && canvasX <= r.x + r.w &&
                canvasY >= r.y && canvasY <= r.y + r.h) {
                return id;
            }
        }
        return null;
    }

    // Mirror the desktop click handler for SHOP / STATS / PAUSE so
    // mobile and mouse paths share the same end action.
    _runHudButtonAction(id) {
        const ge = this.engine;
        if (!ge) return;
        if (id === 'shop') {
            if (ge.game.state === GAME_STATES.SHOP) {
                if (ge.closeShopAndReturn) ge.closeShopAndReturn();
            } else if (ge.openShop) {
                ge.openShop();
            }
        } else if (id === 'stats') {
            if (ge.toggleStatsScreen) ge.toggleStatsScreen();
        } else if (id === 'pause') {
            if (ge.togglePause) ge.togglePause();
        }
    }

    _updateRadialHover(canvasX, canvasY) {
        const ge = this.engine;
        const input = ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        input.screenAimX = canvasX;
        input.screenAimY = canvasY;
    }

    /**
     * 5.100.0 — Set the stick input on the shared inputHandler.input
     * object so player.update can read it without a stick reference.
     */
    _writeStickInput() {
        const ge = this.engine;
        const input = ge && ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        if (ge.analogStick) {
            input.stickInput = ge.analogStick.getInput();
        } else {
            input.stickInput = { x: 0, y: 0, magnitude: 0 };
        }
    }

    /**
     * 6.1.3 — Tap-to-DASH, now DIRECTED. The tap's canvas coords are
     * captured and written to `input.dashTargetScreenX/Y` alongside
     * the `input.dashPulse = true` one-shot signal; player.update()
     * converts them to world coords via the engine's
     * screenToWorldCoordinates helper and passes the world position
     * down to _triggerDash, which dashes in the direction of the tap
     * relative to the ship instead of the aim/velocity direction.
     *
     * Pre-6.1.3 (6.1.1–6.1.2): tap dashed in the current aim or
     * velocity direction — useful for momentum dodges but not for
     * tapping where you want to GO. The directed version makes mobile
     * dodging feel like a teleport pointer.
     */
    _triggerDash(tapX, tapY) {
        const ge = this.engine;
        const input = ge && ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        input.dashPulse = true;
        if (typeof tapX === 'number' && typeof tapY === 'number') {
            input.dashTargetScreenX = tapX;
            input.dashTargetScreenY = tapY;
        } else {
            input.dashTargetScreenX = null;
            input.dashTargetScreenY = null;
        }
        // Player.update consumes the pulse + target on the very next
        // tick, but double-rAF the clear in case the input is read
        // before player.update fires (defensive against tick ordering).
        const release = () => {
            input.dashPulse = false;
            input.dashTargetScreenX = null;
            input.dashTargetScreenY = null;
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(release));
        } else {
            setTimeout(release, 32);
        }
    }

    // ── Event handlers ──────────────────────────────────────────────────

    _onTouchStart(e) {
        // GAME OVER restart — the canvas game-over buttons (newGame /
        // restartWave) had no mobile dispatcher, so mobile players were
        // stranded on the death screen. Hit-test them BEFORE the
        // playable-state guard (GAME_OVER is not a playable state).
        if (this.engine && this.engine.game
            && this.engine.game.state === GAME_STATES.GAME_OVER) {
            const t0 = e.changedTouches[0];
            if (!t0) return;
            e.preventDefault();
            const { x: gx, y: gy } = this._canvasCoords(t0);
            const id = this._hitGameOverButton(gx, gy);
            if (id && typeof this.engine.triggerGameOverAction === 'function') {
                this.engine.triggerGameOverAction(id);
            }
            return;
        }

        if (!this._isPlayableState()) return;
        e.preventDefault();
        if (this._touchId !== null) return; // single-finger only
        const t = e.changedTouches[0];
        if (!t) return;
        const { x, y } = this._canvasCoords(t);

        // 1) HUD button bar.
        const hudHit = this._hitHudButton(x, y);
        if (hudHit) {
            this.engine._hudPressedButton = hudHit;
            this._touchId = t.identifier;
            this._startX = x;
            this._startY = y;
            this._startTime = Date.now();
            this._dragged = false;
            this._hudPressedId = hudHit;
            this._touchKind = 'hud';
            return;
        }

        // 2) Radial menu open.
        if (this.engine.radialMenu && this.engine.radialMenu.isOpen()) {
            this._touchId = t.identifier;
            this._startX = x;
            this._startY = y;
            this._startTime = Date.now();
            this._dragged = true;
            this._touchKind = 'radial';
            this._updateRadialHover(x, y);
            return;
        }

        // 3) Analog stick zone.
        if (this.engine.analogStick && this.engine.analogStick.onTouchStart(x, y)) {
            this._touchId = t.identifier;
            this._startX = x;
            this._startY = y;
            this._startTime = Date.now();
            this._dragged = false;
            this._touchKind = 'stick';
            this._writeStickInput();
            return;
        }

        // 4) Power-weapon tap candidate. Tracking only — fires on release
        //    iff the touch ended quickly with no drift.
        this._touchId = t.identifier;
        this._startX = x;
        this._startY = y;
        this._startTime = Date.now();
        this._dragged = false;
        this._touchKind = 'tap';
    }

    _onTouchMove(e) {
        if (!this._isPlayableState()) return;
        if (this._touchId === null) return;
        let t = null;
        for (const ct of e.changedTouches) {
            if (ct.identifier === this._touchId) { t = ct; break; }
        }
        if (!t) return;
        e.preventDefault();

        const { x, y } = this._canvasCoords(t);

        if (this._touchKind === 'hud') {
            // Drag-out cancels the HUD press visual; commit only if the
            // release lands back on the original button.
            const overHit = this._hitHudButton(x, y);
            this.engine._hudPressedButton = (overHit === this._hudPressedId) ? this._hudPressedId : null;
            return;
        }

        if (this._touchKind === 'radial') {
            this._updateRadialHover(x, y);
            return;
        }

        if (this._touchKind === 'stick') {
            if (this.engine.analogStick) {
                this.engine.analogStick.onTouchMove(x, y);
                this._writeStickInput();
            }
            return;
        }

        // 'tap' branch — track drag distance so the touchend handler
        // can decide tap-vs-drag.
        const dx = x - this._startX;
        const dy = y - this._startY;
        if (dx * dx + dy * dy > DRAG_CANCEL_PX * DRAG_CANCEL_PX) {
            this._dragged = true;
        }
    }

    _onTouchEnd(e) {
        if (this._touchId === null) return;
        let t = null;
        for (const ct of e.changedTouches) {
            if (ct.identifier === this._touchId) { t = ct; break; }
        }
        if (!t) return;
        e.preventDefault();

        const { x, y } = this._canvasCoords(t);
        const ge = this.engine;
        const input = ge.inputHandler && ge.inputHandler.input;

        if (this._touchKind === 'hud') {
            const releaseHit = this._hitHudButton(x, y);
            ge._hudPressedButton = null;
            if (releaseHit === this._hudPressedId) {
                this._runHudButtonAction(releaseHit);
            }
            this._reset();
            return;
        }

        if (this._touchKind === 'radial') {
            if (input) {
                input.screenAimX = x;
                input.screenAimY = y;
            }
            const cx = ge.width / 2;
            const cy = ge.height / 2;
            const dx = x - cx;
            const dy = y - cy;
            const d2 = dx * dx + dy * dy;
            const outer = Math.min(ge.width, ge.height) * 0.24;
            if (d2 > outer * outer) {
                ge.radialMenu.cancel();
            } else {
                ge.radialMenu.handleClick();
            }
            this._reset();
            return;
        }

        if (this._touchKind === 'stick') {
            if (ge.analogStick) ge.analogStick.onTouchEnd();
            this._writeStickInput(); // zeroes the input on release
            this._reset();
            return;
        }

        // 6.1.3 — 'tap' branch DASHES in the direction of the tap.
        // Pass the release coords through so the dash heads TOWARD
        // where the player tapped (player.update converts to world
        // and computes the angle from ship to target).
        const elapsed = Date.now() - this._startTime;
        if (!this._dragged && elapsed <= TAP_MS) {
            this._triggerDash(x, y);
        }
        this._reset();
    }

    _onTouchCancel(e) {
        if (this._touchId === null) return;
        e.preventDefault();
        if (this.engine.radialMenu && this.engine.radialMenu.isOpen()) {
            this.engine.radialMenu.cancel();
        }
        if (this.engine) this.engine._hudPressedButton = null;
        if (this.engine.analogStick) this.engine.analogStick.onTouchEnd();
        this._writeStickInput();
        this._reset();
    }

    _reset() {
        this._touchId = null;
        this._dragged = false;
        this._hudPressedId = null;
        this._touchKind = null;
    }
}
