// MobileTouchHandler — replaces the desktop mouse + keyboard input
// pipeline on touch devices. Bound to the gameCanvas; coexists with the
// keyboard handlers in InputHandler (which are inert on a phone because
// there's no keyboard).
//
// Two gestures matter:
//
//   • Short tap (release within TAP_MS, no significant drag) → aim the
//     primary weapon at the tap point and fire one shot. If the tap lands
//     on an active asteroid or enemy, snap the aim to that entity's
//     centre for a satisfying "I tapped the thing → it died" feel.
//
//   • Long press (held > LONG_PRESS_MS without drifting) → open the
//     existing RadialMenu in "primary weapon" mode. Drag while held to
//     hover a wedge; release on the wedge to select; release outside the
//     radial to cancel. We reuse the existing RadialMenu drawing + slice
//     math — only the input pipeline differs.
//
// Why no on-screen joystick: spec deliberately uses an auto-pilot for
// movement. The player's only inputs are tap (aim/fire) and long-press
// (weapon picker). Keep it simple.

import { isMobile } from '../platform/platform-detect.js';
import { GAME_STATES } from '../core/constants.js';

const TAP_MS = 220;              // release within this = tap
const LONG_PRESS_MS = 300;       // hold past this = radial menu
const DRAG_CANCEL_PX = 18;       // movement past this cancels long-press
const SNAP_RADIUS_PX = 48;       // tap within this of entity centre snaps

// 5.92.0 — touch hardening: gameplay touch gestures (tap-to-shoot,
// long-press radial) only run during PLAYING / WAVE_TRANSITION. The
// TITLE_SCREEN / PAUSED / SHOP / GAME_OVER / GAME_COMPLETE states have
// their own touch handlers (DOM buttons / canvas-button bar) and the
// gameplay handlers would interfere — e.g. opening the weapon radial
// from inside the pause menu, or firing a shot through the game-over
// screen and resuming play. Tracking this set up front makes the
// guard a single `has()` call.
const PLAYABLE_STATES = new Set([GAME_STATES.PLAYING, GAME_STATES.WAVE_TRANSITION]);

export class MobileTouchHandler {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.enabled = false;

        // Active-touch state. Only the first finger that hits the canvas
        // drives input; secondary fingers are ignored. Multi-touch
        // gestures (pinch / two-finger) are reserved for future use.
        this._touchId = null;
        this._startX = 0;            // canvas-space start coordinates
        this._startY = 0;
        this._startTime = 0;
        this._dragged = false;
        this._longPressTimer = null; // setTimeout handle
        this._radialOpened = false;  // did this touch open the radial?

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
    // touch (tap-to-shoot, long-press radial) is meaningful. Falsey
    // states include the title screen (its own button hit-test runs
    // in event-setup), pause / shop / game-over (DOM overlays own
    // input), and any transition where Player.update isn't ticking.
    _isPlayableState() {
        const state = this.engine && this.engine.game && this.engine.game.state;
        return PLAYABLE_STATES.has(state);
    }

    // 5.92.0 — hit-test the bottom-center canvas HUD button bar
    // (SHOP / STATS / PAUSE). On mobile this bar is the primary
    // navigation surface, so taps that land on a button must NOT
    // fall through to fire-a-shot. Returns the button id ('shop' /
    // 'stats' / 'pause') or null. The rect map is populated by
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
    // identically on touch and mouse.
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

    _clearLongPressTimer() {
        if (this._longPressTimer !== null) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
    }

    _openRadial() {
        const ge = this.engine;
        if (!ge.radialMenu || ge.radialMenu.isOpen()) return;
        ge.radialMenu.openFor('primary');
        this._radialOpened = true;
        // Park the screen aim at the centre of the screen so the inner
        // dead-zone is the initial hover state — the user must drag a
        // wedge to highlight it, matching the desktop "click to select"
        // affordance.
        const input = ge.inputHandler && ge.inputHandler.input;
        if (input) {
            input.screenAimX = ge.width / 2;
            input.screenAimY = ge.height / 2;
        }
    }

    // Update the radial's hover position from a finger location while a
    // long-press radial is open. The radial reads `input.screenAimX/Y`
    // for its hit-test, so we forward the live coords each frame.
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
        // mouseup / click listeners in main.js. Calling preventDefault
        // here would suppress those synthesized clicks and the title
        // screen / pause / shop / game-over canvas-rendered buttons
        // would never receive input. Only gameplay touches (during
        // PLAYING / WAVE_TRANSITION) need preventDefault to suppress
        // the native double-tap-zoom + 300ms tap delay.
        if (!this._isPlayableState()) {
            return;
        }
        e.preventDefault();
        if (this._touchId !== null) return; // already tracking a finger
        const t = e.changedTouches[0];
        if (!t) return;
        const { x, y } = this._canvasCoords(t);

        // 5.92.0 — bottom-center HUD button bar gets first crack at the
        // touch. The bar is drawn every frame during PLAYING /
        // WAVE_TRANSITION / PAUSED (drawHudButtons in hud-buttons.js),
        // and the desktop click handler routes these IDs explicitly. We
        // mirror that on touch so SHOP/STATS/PAUSE never fall through
        // to fire-a-shot.
        const hudHit = this._hitHudButton(x, y);
        if (hudHit) {
            // Stash the press so the renderer can show a visible
            // depression while the finger is held, and run the action
            // on touchend (matches the desktop mousedown→mouseup
            // commit flow).
            this.engine._hudPressedButton = hudHit;
            this._touchId = t.identifier;
            this._startX = x;
            this._startY = y;
            this._startTime = Date.now();
            this._dragged = false;
            this._radialOpened = false;
            this._hudPressedId = hudHit;
            return;
        }

        // If the radial is already open from a previous gesture, treat
        // this touch as a hover update — the user is mid-selection.
        if (this.engine.radialMenu && this.engine.radialMenu.isOpen()) {
            this._touchId = t.identifier;
            this._startX = x;
            this._startY = y;
            this._startTime = Date.now();
            this._dragged = true; // skip tap path on release
            this._radialOpened = true;
            this._updateRadialHover(x, y);
            return;
        }

        this._touchId = t.identifier;
        this._startX = x;
        this._startY = y;
        this._startTime = Date.now();
        this._dragged = false;
        this._radialOpened = false;
        this._hudPressedId = null;

        // Pre-aim at the touch point so the very first frame of the auto-
        // pilot driving sees the intended facing. Helps when the user
        // taps slightly behind the ship — by the time the release fires,
        // the ship has rotated to point at the target.
        const input = this.engine.inputHandler && this.engine.inputHandler.input;
        if (input) {
            input.screenAimX = x;
            input.screenAimY = y;
            const w = this._worldCoords(x, y);
            input.aimX = w.x;
            input.aimY = w.y;
        }

        // Schedule the long-press promotion. Cleared if the finger moves
        // too far OR releases first.
        this._clearLongPressTimer();
        this._longPressTimer = setTimeout(() => {
            this._longPressTimer = null;
            // Only promote if the same finger is still down + hasn't drifted.
            if (this._touchId !== t.identifier) return;
            if (this._dragged) return;
            this._openRadial();
        }, LONG_PRESS_MS);
    }

    _onTouchMove(e) {
        // 5.92.1 — Same guard as _onTouchStart: bail before
        // preventDefault during non-playable states so synthesized
        // click events still reach window-level handlers. The _touchId
        // check below will also bail in non-playable states (since
        // _onTouchStart didn't set _touchId), but checking state first
        // is the explicit invariant.
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

        // 5.92.0 — HUD-button drag tracking. If the press started on a
        // HUD button and the finger drifts off the button (or another
        // button), clear the depressed visual state; the touchend
        // commit-test will only run the action if the release lands
        // back on the original button. Mirrors the desktop "drag-out
        // cancels" pattern.
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
            // Drag cancels the pending long-press. The release will be
            // treated as a no-op (not a tap, not a radial commit).
            this._clearLongPressTimer();
        }

        // Keep the aim pointer following the finger during a drag — this
        // way if the player keeps the finger down (e.g. tracking a moving
        // target before releasing) the ship faces correctly. The release
        // itself is the fire event.
        const input = this.engine.inputHandler && this.engine.inputHandler.input;
        if (input) {
            input.screenAimX = x;
            input.screenAimY = y;
            const w = this._worldCoords(x, y);
            input.aimX = w.x;
            input.aimY = w.y;
        }
    }

    _onTouchEnd(e) {
        // 5.92.1 — Bail before preventDefault if we never started
        // tracking this touch (non-playable state at touchstart) so
        // the browser still synthesizes a click event for the
        // title/pause/shop/game-over button hit-tests on window.
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
        this._clearLongPressTimer();

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

        // Case 1: radial is open. Treat this release as the commit.
        if (ge.radialMenu && ge.radialMenu.isOpen()) {
            if (input) {
                input.screenAimX = x;
                input.screenAimY = y;
            }
            // Mobile rule (5.91 spec): release outside the radial's
            // outer ring cancels without changing equipment. The desktop
            // click handler allows clicks "anywhere outside the dead
            // zone" to commit, which is a reasonable mouse default but
            // surprising on touch (any stray finger off the radial would
            // change equipment). Hit-test against the visible ring
            // before forwarding to handleClick().
            const cx = ge.width / 2;
            const cy = ge.height / 2;
            const dx = x - cx;
            const dy = y - cy;
            const d2 = dx * dx + dy * dy;
            // _outerRadius() is internal; mirror its formula here. If the
            // RadialMenu refactors its sizing we'll have one place to
            // adjust (and the same constant is also used by the radial
            // when it draws the ring).
            const outer = Math.min(ge.width, ge.height) * 0.24;
            if (d2 > outer * outer) {
                ge.radialMenu.cancel();
            } else {
                ge.radialMenu.handleClick();
            }
            this._reset();
            return;
        }

        // Case 2: short tap. Aim + fire one shot.
        const now = Date.now();
        const heldMs = now - this._startTime;
        if (!this._dragged && heldMs < TAP_MS) {
            this._fireAtTap(x, y);
        }
        this._reset();
    }

    _onTouchCancel(e) {
        // 5.92.1 — Same as _onTouchEnd: bail before preventDefault if
        // we never started tracking this touch (non-playable state)
        // so the browser doesn't suppress synthesized click events on
        // the title / pause / shop / game-over canvas buttons.
        if (this._touchId === null) return;
        // Treat cancel like a release-without-commit. If the radial was
        // open we close it without changing the equipped weapon; tap
        // gestures are simply abandoned.
        e.preventDefault();
        this._clearLongPressTimer();
        if (this.engine.radialMenu && this.engine.radialMenu.isOpen()) {
            this.engine.radialMenu.cancel();
        }
        // Clear any HUD button press state so the renderer stops
        // showing a depressed button.
        if (this.engine) this.engine._hudPressedButton = null;
        this._hudPressedId = null;
        this._reset();
    }

    _reset() {
        this._touchId = null;
        this._dragged = false;
        this._radialOpened = false;
        this._hudPressedId = null;
    }

    _fireAtTap(canvasX, canvasY) {
        const ge = this.engine;
        const input = ge.inputHandler && ge.inputHandler.input;
        if (!input) return;
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
            // Drive the targeted-entity HUD the same way the desktop
            // click handler does, so the target outline + info panel
            // light up after a tap.
            if (ge.handleEntityTargeting) {
                ge.handleEntityTargeting(hit.x, hit.y);
            }
        } else {
            input.aimX = w.x;
            input.aimY = w.y;
            input.screenAimX = canvasX;
            input.screenAimY = canvasY;
        }

        // Pulse fire for ~1 logic tick — long enough for weapons.js's
        // edge-detector to register a shot but short enough not to chain
        // a stream of bullets from a single tap. The Player.update path
        // reads input.fire at the start of each tick; setting true here
        // and clearing it on the next requestAnimationFrame matches the
        // "single shot per tap" contract from the spec.
        input.fire = true;
        // Schedule the release. We can't simply clear it in this handler
        // because Player.update may not have run yet for this frame.
        // Two rAF frames is safely past one logic tick.
        const release = () => { input.fire = false; };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(release));
        } else {
            setTimeout(release, 32);
        }
    }
}
