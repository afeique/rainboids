// 5.100.0 — Virtual analog stick for mobile drag-to-move control.
//
// Renders a translucent base + handle in canvas-space. Tracks one
// active touch session; the handle follows the touch point within the
// base radius. Output: normalized 2D vector (x, y in [-1, 1]) plus
// magnitude (0..1).
//
// Public API (no global state — instance methods):
//   const stick = new AnalogStick({ side: 'left' });
//   stick.resize(canvasW, canvasH);             // recompute base pos
//   stick.setSide('left' | 'right');            // reposition
//   stick.contains(canvasX, canvasY);           // hit test (with slop)
//   stick.onTouchStart(canvasX, canvasY);       // returns true if claimed
//   stick.onTouchMove(canvasX, canvasY);
//   stick.onTouchEnd();
//   stick.getInput();                           // { x, y, magnitude }
//   stick.draw(ctx);
//
// Visual design (intentionally simple, readable on a 360-wide phone):
//   - Outer ring: translucent dark fill + light-blue stroke
//   - Inner dotted ring: faint guide
//   - Handle: radial-gradient sphere with a white-cyan-blue stop chain
//   - Fades in slightly when active so the player gets a "grabbed" cue
//
// Side preference is owned by the caller (via setSide). This module
// just renders + reports.

// Geometry constants. Tuned for a typical phone (360-430 px wide
// portrait). All values are in canvas pixels.
const BASE_RADIUS = 72;
const HANDLE_RADIUS = 34;
const BASE_MARGIN = 28;       // distance from canvas left/right edge
const BASE_BOTTOM_OFFSET = 130; // distance from canvas bottom (clears
                                // the bottom HUD button bar)
const HIT_SLOP = 28;          // generous touch-target slop around base

export class AnalogStick {
    constructor({ side = 'left' } = {}) {
        this.side = (side === 'right') ? 'right' : 'left';
        // Base center in canvas coords (set by resize()).
        this.baseX = 0;
        this.baseY = 0;
        // Handle position relative to base center.
        this.dx = 0;
        this.dy = 0;
        // Touch session state.
        this.active = false;
        // Fade alpha (smoothed toward target each draw).
        this._alpha = 0.55;
        this._targetAlpha = 0.55;
    }

    /**
     * Move the stick to the opposite side. Pair with localStorage on
     * the caller to persist across sessions.
     */
    setSide(side) {
        this.side = (side === 'right') ? 'right' : 'left';
    }

    /**
     * Compute the stick's base position. Call on init AND on every
     * canvas resize / orientationchange.
     */
    resize(canvasW, canvasH) {
        const x = this.side === 'left'
            ? BASE_MARGIN + BASE_RADIUS
            : canvasW - BASE_MARGIN - BASE_RADIUS;
        const y = canvasH - BASE_BOTTOM_OFFSET - BASE_RADIUS / 2;
        this.baseX = Math.round(x);
        this.baseY = Math.round(y);
    }

    /**
     * Hit test — is the touch inside the stick's activation zone?
     * Includes HIT_SLOP slop so the player doesn't have to nail the
     * exact base circle.
     */
    contains(x, y) {
        const dx = x - this.baseX;
        const dy = y - this.baseY;
        const r = BASE_RADIUS + HIT_SLOP;
        return dx * dx + dy * dy <= r * r;
    }

    /**
     * Begin a touch session. Returns true if the touch is inside the
     * stick zone (caller should NOT route the touch elsewhere). False
     * otherwise (caller can treat the touch as a normal canvas tap).
     */
    onTouchStart(canvasX, canvasY) {
        if (!this.contains(canvasX, canvasY)) return false;
        this.active = true;
        this._targetAlpha = 1.0;
        this._updateHandle(canvasX, canvasY);
        return true;
    }

    onTouchMove(canvasX, canvasY) {
        if (!this.active) return;
        this._updateHandle(canvasX, canvasY);
    }

    onTouchEnd() {
        if (!this.active) return;
        this.active = false;
        this._targetAlpha = 0.55;
        this.dx = 0;
        this.dy = 0;
    }

    _updateHandle(x, y) {
        let dx = x - this.baseX;
        let dy = y - this.baseY;
        const mag = Math.hypot(dx, dy);
        if (mag > BASE_RADIUS) {
            const k = BASE_RADIUS / mag;
            dx *= k;
            dy *= k;
        }
        this.dx = dx;
        this.dy = dy;
    }

    /**
     * Normalized input vector. x and y are in [-1, 1] (clamped to the
     * base radius). magnitude is 0..1 — how far the player has
     * deflected the stick.
     */
    getInput() {
        const x = this.dx / BASE_RADIUS;
        const y = this.dy / BASE_RADIUS;
        const magnitude = Math.min(1, Math.hypot(x, y));
        return { x, y, magnitude };
    }

    /**
     * Render the stick. Called from the engine's HUD draw pass after
     * the camera transform is restored — coordinates are canvas-space.
     */
    draw(ctx) {
        // Smooth alpha lerp toward target. 0.18 per frame ≈ 60% in 90 ms.
        this._alpha += (this._targetAlpha - this._alpha) * 0.18;
        if (this._alpha < 0.02) return;

        const bx = this.baseX;
        const by = this.baseY;

        ctx.save();
        ctx.globalAlpha = this._alpha;

        // ── Base ring ─────────────────────────────────────────────
        // Filled translucent dark, stroked in light blue. The fill
        // gives the stick weight; the stroke gives it definition
        // against the starfield.
        ctx.fillStyle = 'rgba(6, 14, 32, 0.45)';
        ctx.strokeStyle = 'rgba(140, 200, 255, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(bx, by, BASE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // ── Inner guide ring ──────────────────────────────────────
        // Faint inner circle a few px in from the base so the handle
        // has a "rail" to read against.
        ctx.strokeStyle = 'rgba(140, 200, 255, 0.30)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, by, BASE_RADIUS - 10, 0, Math.PI * 2);
        ctx.stroke();

        // ── Handle ────────────────────────────────────────────────
        // Radial gradient gives the handle a subtle sphere look.
        const hx = bx + this.dx;
        const hy = by + this.dy;
        const grad = ctx.createRadialGradient(
            hx - HANDLE_RADIUS * 0.35, hy - HANDLE_RADIUS * 0.35, 2,
            hx, hy, HANDLE_RADIUS
        );
        grad.addColorStop(0,   'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.55, 'rgba(150, 215, 255, 0.92)');
        grad.addColorStop(1,   'rgba(30, 90, 170, 0.92)');
        ctx.fillStyle = grad;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tiny center pip on the handle so the player can read the
        // deflection direction at a glance.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(hx, hy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Constants exposed for tests + the side-flip button hit-test.
export const ANALOG_STICK_GEOM = Object.freeze({
    BASE_RADIUS,
    HANDLE_RADIUS,
    BASE_MARGIN,
    BASE_BOTTOM_OFFSET,
    HIT_SLOP,
});
