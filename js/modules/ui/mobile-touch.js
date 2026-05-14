// MobileTouchHandler — replaces the desktop mouse + keyboard input
// pipeline on touch devices. Bound to the gameCanvas; coexists with the
// keyboard handlers in InputHandler (which are inert on a phone because
// there's no keyboard).
//
// 5.97.0 — Press-and-hold continuous fire. Touch-down starts continuous
// primary fire (input.fire held true) at the tapped point; touchmove
// updates the aim every frame so the ship tracks the finger across the
// screen; touchend / touchcancel release fire. Power weapons keep
// auto-firing whenever they're ready (the auto-fire gate in
// Player.update already sets `input.fireSecondary` on a hot weapon).
//
// Pre-5.97 (5.94.0) behavior was one tap → one shot via a 2-frame rAF
// pulse. We retained the tap-snap behavior: a touch that lands on an
// asteroid / enemy snaps the aim to its centre so the player can
// "trace" targets with their finger and still hit dead-on. The radial
// menu, HUD button bar, and PRM/PWR side-buttons all retain their
// pre-existing tap semantics — only empty-canvas touches enter the
// continuous-fire path.

import { isMobile } from '../platform/platform-detect.js';
import { GAME_STATES } from '../core/constants.js';

const TAP_MS = 400;              // release within this = tap (generous)
const DRAG_CANCEL_PX = 24;       // drift past this = treat as drag, not tap
const SNAP_RADIUS_PX = 48;       // tap within this of entity centre snaps

// 5.92.0 — touch hardening: gameplay touch gestures (tap-to-fire) only
// run during PLAYING / WAVE_TRANSITION. The TITLE_SCREEN / PAUSED /
// SHOP / GAME_OVER / GAME_COMPLETE states have their own touch handlers
// (DOM buttons / canvas-button bar) and the gameplay handlers would
// interfere. Tracking this set up front makes the guard a single
// `has()` call.
const PLAYABLE_STATES = new Set([GAME_STATES.PLAYING, GAME_STATES.WAVE_TRANSITION]);

export class MobileTouchHandler {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.enabled = false;

        // Active-touch state. Only the first finger that hits the canvas
        // drives input; secondary fingers are ignored.
        this._touchId = null;
        this._startX = 0;            // canvas-space start coordinates
        this._startY = 0;
        this._startTime = 0;
        this._dragged = false;
        this._hudPressedId = null;

        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove  = this._onTouchMove.bind(this);
        this._onTouchEnd   = this._onTouchEnd.bind(this);
        this._onTouchCancel = this._onTouchCancel.bind(this);
    }

    /**
     * Attach listeners. Call once at game start; no-op on desktop so the
     * existing mouse / keyboard pipeline runs untouched.
     */
    install() {
        if (this.enabled) return;
        if (!isMobile()) return;
        const canvas = this.engine.canvas;
        if (!canvas) return;

        // `passive: false` lets us call preventDefault() inside the
        // handler to suppress the native double-tap-zoom + 300ms tap
        // delay. The handlers below all preventDefault unconditionally
        // for canvas touches — we own this surface.
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

    // 5.92.0 — true iff the engine is in a state where gameplay
    // touch is meaningful. Falsey states include the title screen,
    // pause / shop / game-over, and any transition where Player.update
    // isn't ticking.
    _isPlayableState() {
        const state = this.engine && this.engine.game && this.engine.game.state;
        return PLAYABLE_STATES.has(state);
    }

    // Hit-test ALL canvas HUD buttons (SHOP / STATS / PAUSE / PRM /
    // PWR). On mobile this is the primary navigation surface, so taps
    // that land on a button must NOT fall through to fire-a-shot.
    // Returns the button id (one of 'shop' / 'stats' / 'pause' /
    // 'prm' / 'pwr') or null. The rect map is populated by
    // hud-buttons.js::drawHudButtons each frame.
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

    // Run the action wired to a HUD-button tap. Mirrors the desktop
    // click handler in event-setup.js so SHOP/STATS/PAUSE behave
    // identically on touch and mouse. PRM/PWR (5.94.0) open the
    // existing radial menu in primary / power mode respectively.
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
        } else if (id === 'prm') {
            // 5.94.0 — open primary-weapon radial.
            if (ge.radialMenu && ge.radialMenu.openFor) {
                ge.radialMenu.openFor('primary');
                // Park screen aim at centre so the dead zone is the
                // initial hover state — user drags out to highlight a
                // wedge.
                const input = ge.inputHandler && ge.inputHandler.input;
                if (input) {
                    input.screenAimX = ge.width / 2;
                    input.screenAimY = ge.height / 2;
                }
            }
        } else if (id === 'pwr') {
            // 5.94.0 — open power-weapon radial.
            if (ge.radialMenu && ge.radialMenu.openFor) {
                ge.radialMenu.openFor('power');
                const input = ge.inputHandler && ge.inputHandler.input;
                if (input) {
                    input.screenAimX = ge.width / 2;
                    input.screenAimY = ge.height / 2;
                }
            }
        }
    }

    _worldCoords(canvasX, canvasY) {
        if (this.engine.screenToWorldCoordinates) {
            return this.engine.screenToWorldCoordinates(canvasX, canvasY);
        }
        return { x: canvasX, y: canvasY };
    }

    // Find the nearest active asteroid or enemy whose centre is within
    // SNAP_RADIUS_PX of the world-space tap point. Returns the entity (so
    // the caller can also use it to set the targeted-entity HUD) or null.
    _hitEntity(worldX, worldY) {
        const ge = this.engine;
        let best = null;
        let bestD2 = SNAP_RADIUS_PX * SNAP_RADIUS_PX;
        const test = (obj) => {
            if (!obj || !obj.active) return;
            const r = obj.radius || 12;
            const dx = obj.x - worldX;
            const dy = obj.y - worldY;
            const d2 = dx * dx + dy * dy;
            // Snap if inside the entity's body OR inside SNAP_RADIUS.
            const limit = Math.max(r * r, bestD2);
            if (d2 < limit) {
                bestD2 = d2;
                best = obj;
            }
        };
        if (ge.asteroidPool) for (const a of ge.asteroidPool.activeObjects) test(a);
        if (ge.enemyPool)    for (const e of ge.enemyPool.activeObjects)    test(e);
        return best;
    }

    // Update the radial's hover position from a finger location while a
    // radial is open. The radial reads `input.screenAimX/Y` for its
    // hit-test, so we forward the live coords each frame.
    _updateRadialHover(canvasX, canvasY) {
        const ge = this.engine;
        const input = ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        input.screenAimX = canvasX;
        input.screenAimY = canvasY;
    }

    // ── Event handlers ──────────────────────────────────────────────────

    _onTouchStart(e) {
        // 5.92.1 — Non-playable states (TITLE_SCREEN / PAUSED / SHOP /
        // GAME_OVER / GAME_COMPLETE / ORIENTATION_LOCK / WAVE_TRANSITION
        // intro) bail BEFORE preventDefault so the browser can still
        // synthesize a click event for the window-level mousedown /
        // mouseup / click listeners in main.js.
        if (!this._isPlayableState()) {
            return;
        }
        e.preventDefault();
        if (this._touchId !== null) return; // already tracking a finger
        const t = e.changedTouches[0];
        if (!t) return;
        const { x, y } = this._canvasCoords(t);

        // HUD button bar gets first crack at the touch. Includes
        // SHOP/STATS/PAUSE and the 5.94.0 PRM/PWR side-buttons.
        const hudHit = this._hitHudButton(x, y);
        if (hudHit) {
            this.engine._hudPressedButton = hudHit;
            this._touchId = t.identifier;
            this._startX = x;
            this._startY = y;
            this._startTime = Date.now();
            this._dragged = false;
            this._hudPressedId = hudHit;
            return;
        }

        // If a radial is already open (user pressed PRM or PWR a moment
        // ago), this touch is a hover update — user is mid-selection.
        if (this.engine.radialMenu && this.engine.radialMenu.isOpen()) {
            this._touchId = t.identifier;
            this._startX = x;
            this._startY = y;
            this._startTime = Date.now();
            this._dragged = true; // skip tap-to-fire on release
            this._updateRadialHover(x, y);
            return;
        }

        this._touchId = t.identifier;
        this._startX = x;
        this._startY = y;
        this._startTime = Date.now();
        this._dragged = false;
        this._hudPressedId = null;

        // 5.97.0 — Press-and-hold continuous fire. Seed aim + start the
        // continuous fire session. touchmove will retarget; touchend
        // will release input.fire.
        this._setAimFromTouch(x, y);
        this._beginContinuousFire();
    }

    _onTouchMove(e) {
        // Bail before preventDefault during non-playable states.
        if (!this._isPlayableState()) {
            return;
        }
        if (this._touchId === null) return;
        let t = null;
        for (const ct of e.changedTouches) {
            if (ct.identifier === this._touchId) { t = ct; break; }
        }
        if (!t) return;
        e.preventDefault();

        const { x, y } = this._canvasCoords(t);

        // HUD-button drag tracking. If the press started on a HUD
        // button and the finger drifts off the button (or another
        // button), clear the depressed visual state; the touchend
        // commit-test will only run the action if the release lands
        // back on the original button.
        if (this._hudPressedId) {
            const overHit = this._hitHudButton(x, y);
            this.engine._hudPressedButton = (overHit === this._hudPressedId) ? this._hudPressedId : null;
            return;
        }

        // If the radial is open, every move is a hover update.
        if (this.engine.radialMenu && this.engine.radialMenu.isOpen()) {
            this._updateRadialHover(x, y);
            return;
        }

        const dx = x - this._startX;
        const dy = y - this._startY;
        if (dx * dx + dy * dy > DRAG_CANCEL_PX * DRAG_CANCEL_PX) {
            this._dragged = true;
        }

        // 5.97.0 — Drag-to-aim. Update aim every move so the ship
        // tracks the finger while the player traces across the screen.
        // Continuous fire was already set by touchstart; this just
        // retargets it.
        this._setAimFromTouch(x, y);
    }

    _onTouchEnd(e) {
        // Bail before preventDefault if we never started tracking this
        // touch (non-playable state at touchstart).
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

        // 5.92.0 — HUD button commit. If the press started on a HUD
        // button AND the release lands on the SAME button, run the
        // action (matches desktop mousedown→mouseup pattern: drag-out
        // cancels, drag-back-in commits).
        if (this._hudPressedId) {
            const releaseHit = this._hitHudButton(x, y);
            ge._hudPressedButton = null;
            if (releaseHit === this._hudPressedId) {
                this._runHudButtonAction(releaseHit);
            }
            this._hudPressedId = null;
            this._reset();
            return;
        }

        // Radial commit / cancel. If a radial is open and the user
        // releases their finger, hit-test the wedge and either commit
        // (handleClick) or cancel (outside the ring).
        if (ge.radialMenu && ge.radialMenu.isOpen()) {
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

        // 5.97.0 — Release continuous-fire and reset.
        this._endContinuousFire();
        this._reset();
    }

    _onTouchCancel(e) {
        // Bail before preventDefault if we never started tracking this
        // touch (non-playable state).
        if (this._touchId === null) return;
        e.preventDefault();
        if (this.engine.radialMenu && this.engine.radialMenu.isOpen()) {
            this.engine.radialMenu.cancel();
        }
        if (this.engine) this.engine._hudPressedButton = null;
        this._hudPressedId = null;
        // 5.97.0 — Cancel must also release the held primary fire flag
        // so an interrupted touch (call, system swipe) doesn't leave
        // input.fire stuck on.
        this._endContinuousFire();
        this._reset();
    }

    _reset() {
        this._touchId = null;
        this._dragged = false;
        this._hudPressedId = null;
    }

    /**
     * 5.97.0 — Aim from the touch point. Handles snap-to-entity and
     * sets every aim-related field the rest of the engine consumes
     * (world-space aimX/Y, canvas-space screenAimX/Y, the reticle
     * cache, and the player's angle for immediate visual feedback).
     */
    _setAimFromTouch(canvasX, canvasY) {
        const ge = this.engine;
        const input = ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        const player = ge.player;

        const w = this._worldCoords(canvasX, canvasY);
        const hit = this._hitEntity(w.x, w.y);
        if (hit) {
            input.aimX = hit.x;
            input.aimY = hit.y;
            if (ge.handleEntityTargeting) {
                ge.handleEntityTargeting(hit.x, hit.y);
            }
        } else {
            input.aimX = w.x;
            input.aimY = w.y;
        }
        input.screenAimX = canvasX;
        input.screenAimY = canvasY;

        // Reticle cache (drawn AFTER the camera transform — see
        // hud/mobile-reticle.js).
        ge._mobileLastTouchCanvasX = canvasX;
        ge._mobileLastTouchCanvasY = canvasY;

        // Snap player facing right now so the move-and-aim trace shows
        // the ship rotating with the finger without a 1-frame lag.
        if (player && typeof player.x === 'number' && typeof player.y === 'number') {
            player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
        }
    }

    /**
     * 5.97.0 — Begin continuous fire. Holds `input.fire` true; the
     * primary weapon's fire-rate gate in weapons.updateChargingSystem
     * paces the bullets. `fireSecondary` is NOT held here — the mobile
     * auto-fire path in Player.update already pulses it the frame any
     * equipped power weapon becomes ready, which is the right rhythm
     * for cooldown- and charge-based powers alike.
     */
    _beginContinuousFire() {
        const ge = this.engine;
        const input = ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        input.fire = true;
    }

    /**
     * 5.97.0 — Release the held primary-fire flag. Called from
     * touchend / touchcancel and from any branch that needs to bail
     * out of the firing path (HUD button commit, radial open).
     */
    _endContinuousFire() {
        const ge = this.engine;
        const input = ge && ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        input.fire = false;
    }
}
