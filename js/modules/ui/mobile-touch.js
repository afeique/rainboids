// MobileTouchHandler — touch input for the 5.100.0 mobile control
// model: virtual analog stick (drag-to-move) + tap-anywhere for the
// power weapon. Auto-aim and auto-fire run continuously on the player
// side (see `js/modules/player/player.js`).
//
// Touch classification on each new touch:
//   1. HUD button hit → button action (unchanged from 5.94/5.99 model).
//   2. Radial menu open → wedge hover (unchanged).
//   3. Inside the analog stick base zone → start a stick session.
//   4. Otherwise → "tap candidate" — if it ends within TAP_MS with
//      drift < DRAG_CANCEL_PX, fires the power weapon (Model F).
//
// Auto-aim handles primary firing — the player never has to tell the
// game what to shoot at. They just dodge.
//
// Pre-5.100 behavior:
//   - 5.94: tap-to-aim-and-fire (one shot per tap)
//   - 5.97: press-and-hold continuous fire + drag-to-aim
//   These are removed. The 5.100 model is a clean break: the player
//   never aims manually on mobile.

import { isMobile } from '../platform/platform-detect.js';
import { GAME_STATES } from '../core/constants.js';

const TAP_MS = 350;              // release within this = tap (Model F power)
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
     * 5.100.0 — Pulse the power-weapon fire flag for one tick. Mirrors
     * the desktop right-click / Space behavior. The weapons update
     * loop (`updateChargingSystem`) reads `input.fireSecondary` and
     * dispatches the cooldown-based power weapon. Charge-based weapons
     * auto-fire on full charge from the Player.update side (see the
     * 5.92 mobile auto-fire path, narrowed in 5.100 to charge-only).
     */
    _firePowerWeapon() {
        const ge = this.engine;
        const input = ge && ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        input.fireSecondary = true;
        const release = () => { input.fireSecondary = false; };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(release));
        } else {
            setTimeout(release, 32);
        }
    }

    // ── Event handlers ──────────────────────────────────────────────────

    _onTouchStart(e) {
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

        // 'tap' branch — fire the power weapon iff this was a quick
        // release with minimal drift. Otherwise discard (failed drag).
        const elapsed = Date.now() - this._startTime;
        if (!this._dragged && elapsed <= TAP_MS) {
            this._firePowerWeapon();
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
