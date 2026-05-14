// MobileTouchHandler — replaces the desktop mouse + keyboard input
// pipeline on touch devices. Bound to the gameCanvas; coexists with the
// keyboard handlers in InputHandler (which are inert on a phone because
// there's no keyboard).
//
// 5.94.0 — Mobile mode is now a stationary-ship tower-defense game.
// Auto-pilot was removed and the player can't move. The only gameplay
// inputs are:
//
//   • Tap anywhere on the canvas → aim at the touch point and fire one
//     shot of the primary weapon AND the equipped power weapon (if it's
//     ready / fully charged). The power weapon's existing auto-fire
//     gate (Player.update) also continues to set fireSecondary the
//     moment the weapon is ready — both pathways are idempotent.
//   • HUD button taps (SHOP / STATS / PAUSE / PRM / PWR) route to the
//     matching action and DO NOT fall through to fire-a-shot. The
//     PRM and PWR buttons open the existing weapon radial in primary
//     or power mode respectively (replacing the long-press radial
//     gesture from 5.91–5.93).
//
// Long-press radial behaviour is REMOVED. Long presses on empty canvas
// are a no-op (no fire on release; the tap window already passed).
// Press-and-drag is also a no-op — the player can't move, so dragging
// the aim before release doesn't help anything.
//
// Why no on-screen joystick: the player ship is stationary. There's
// nothing to drive. Aim + fire is the only interaction loop.

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

        // 5.94.0 — Tap-to-aim-and-fire: the press itself is the fire
        // event. Pre-aim immediately so even a finger that hovers gets
        // the ship facing the target; release will not fire again
        // (one-shot per touch). This deviates from 5.91-5.93 where
        // touchend fired — but with a stationary ship there's no value
        // to delaying the shot, and pressing-to-fire feels snappier on
        // a tower-defense control loop.
        this._fireAtTap(x, y);
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

        // 5.94.0 — Tap-to-aim-and-fire already fired at touchstart.
        // touchend is now a no-op for the firing pipeline; just clean
        // up state so the next touch is fresh.
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
        this._reset();
    }

    _reset() {
        this._touchId = null;
        this._dragged = false;
        this._hudPressedId = null;
    }

    /**
     * 5.94.0 — The tap action. Aim the ship at the tap point and pulse
     * both `input.fire` and `input.fireSecondary` for one frame so the
     * primary weapon fires immediately and any ready/charged power
     * weapon fires too. Both flags are released on the next
     * requestAnimationFrame so they don't chain a stream of bullets
     * from a single tap.
     */
    _fireAtTap(canvasX, canvasY) {
        const ge = this.engine;
        const input = ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
        const player = ge.player;

        // Convert canvas-space to world-space.
        const w = this._worldCoords(canvasX, canvasY);

        // If the tap landed on (or near) an entity, snap the aim to its
        // centre — "tap the asteroid, kill the asteroid" feels much
        // better than "tap-near-asteroid, fire off into space".
        const hit = this._hitEntity(w.x, w.y);
        if (hit) {
            input.aimX = hit.x;
            input.aimY = hit.y;
            input.screenAimX = canvasX;
            input.screenAimY = canvasY;
            if (ge.handleEntityTargeting) {
                ge.handleEntityTargeting(hit.x, hit.y);
            }
        } else {
            input.aimX = w.x;
            input.aimY = w.y;
            input.screenAimX = canvasX;
            input.screenAimY = canvasY;
        }

        // 5.95.1 — Stash the last-touched canvas coordinates on the
        // engine so the mobile reticle renderer (hud/mobile-reticle.js)
        // can draw a crosshair at the touch point on every subsequent
        // frame, independent of whether `input.screenAimX/Y` gets reset
        // by other systems (the radial menu, for instance, recenters
        // it). Persist forever after the first tap — the reticle is a
        // "where you'll fire next" indicator, not a touch-active flash.
        ge._mobileLastTouchCanvasX = canvasX;
        ge._mobileLastTouchCanvasY = canvasY;

        // 5.94.0 — Snap the player's facing immediately so visual
        // feedback fires this frame instead of waiting for Player.update
        // to recompute the angle from aimX/aimY. Player.update will set
        // this.angle again from atan2(aimY, aimX) (same formula) so the
        // double-write is byte-for-byte equivalent.
        if (player && typeof player.x === 'number' && typeof player.y === 'number') {
            player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
        }

        // Pulse fire for ~1 logic tick. Both primary and (any ready /
        // charged) power weapon will fire on this tick. The existing
        // Mobile UX v2 auto-fire path also sets fireSecondary; both
        // pathways converge on the same charging-system pipeline and
        // setting the flag twice in a frame is idempotent.
        input.fire = true;
        input.fireSecondary = true;
        const release = () => {
            input.fire = false;
            input.fireSecondary = false;
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(release));
        } else {
            setTimeout(release, 32);
        }
    }
}
