// Offscreen-canvas cache for the HUD layer.
//
// The HUD redraws lots of vector chrome every frame (status panel,
// triforce, money readout, powerup bar, off-screen indicators, HUD
// buttons, etc.). Most of that content only changes when a stat
// changes — i.e., most frames have IDENTICAL HUD pixels to the
// previous frame.
//
// This cache renders the HUD into a dedicated offscreen canvas. The
// engine wrapper around drawHUD computes a "HUD signature" each frame
// — a tiny string of all the values that affect HUD content — and
// only re-runs the expensive vector draw when the signature changes.
// Stable frames just blit the cached canvas via drawImage (a single
// GPU-side copy), which is cheap compared to dozens of beginPath /
// fill / stroke calls.
//
// Wins are real on idle gameplay (no recent damage, no popup
// animation) — the HUD signature stabilizes and drawHUD runs maybe
// 1 frame out of every 10–60. When wave messages or level-up text
// animate, the signature ticks every frame (via the time-decay value
// embedded in the signature) so the cache invalidates correctly and
// animated content stays smooth.

export class HUDCache {
    constructor(width, height) {
        this._canvas = (typeof document !== 'undefined')
            ? document.createElement('canvas')
            : null;
        if (this._canvas) {
            this._canvas.width = Math.max(1, width | 0);
            this._canvas.height = Math.max(1, height | 0);
            this._ctx = this._canvas.getContext('2d');
        } else {
            this._ctx = null;
        }
        this._dirty = true;
        this._lastSignature = null;
    }

    /**
     * Resize the offscreen canvas to match the main canvas. Idempotent
     * — when w/h match the current size, this is a no-op (no realloc,
     * no clear).
     */
    resize(width, height) {
        if (!this._canvas) return;
        const w = Math.max(1, width | 0);
        const h = Math.max(1, height | 0);
        if (this._canvas.width === w && this._canvas.height === h) return;
        this._canvas.width = w;
        this._canvas.height = h;
        this._dirty = true;
    }

    getContext() { return this._ctx; }
    getCanvas() { return this._canvas; }
    isDirty() { return this._dirty; }
    markDirty() { this._dirty = true; }
    markClean() { this._dirty = false; }

    /**
     * Signature-based dirty-check: returns true if the signature
     * differs from last invalidation. Caller uses this to decide
     * whether to re-run the expensive draw. Stores the new signature
     * either way so the next call compares against THIS frame's value.
     */
    invalidateIfChanged(signature) {
        if (signature !== this._lastSignature) {
            this._dirty = true;
            this._lastSignature = signature;
            return true;
        }
        return false;
    }

    /**
     * Clear the offscreen canvas. Caller invokes before redraw so the
     * cache holds only the new frame's HUD, not the old frame's stale
     * pixels showing through transparent regions.
     */
    clear() {
        if (!this._ctx) return;
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
}
