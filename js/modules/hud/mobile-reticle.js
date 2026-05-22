// 5.95.1 — Mobile reticle.
//
// Replaces the desktop laser-pointer aim trace (hud/cursor.js
// drawLaserPointerAim) on mobile / touch sessions. The desktop trace
// shows where a primary-weapon shot would land; on mobile we instead
// show a crosshair circle at the LAST TOUCHED canvas coordinate so the
// player can see exactly where their next tap is queued.
//
// Why a separate render pass instead of repurposing the desktop trace:
//   - The desktop laser-pointer is drawn inside the camera transform
//     (world space) so it stays anchored to the ship as the camera
//     moves. The mobile reticle is anchored to the screen/canvas
//     coordinate of the user's finger and must be drawn AFTER the
//     ctx.restore() that ends the camera transform.
//   - The desktop trace computes the bullet's max range and finds
//     hit/pierce targets along the ray. The mobile reticle is a fixed
//     screen-space crosshair with no projection math at all.
//
// Source coordinates: `engine._mobileLastTouchCanvasX/Y` populated by
// MobileTouchHandler._fireAtTap (ui/mobile-touch.js). Falls back to the
// input.screenAimX/Y if the touch coordinates haven't been seeded yet
// (e.g., engine started but no tap has landed yet — the reticle parks
// at the screen centre as a neutral default).
//
// State gating: only draws during PLAYING / WAVE_TRANSITION, and only
// when no radial menu is open (the radial owns the screen during a
// long-press selection, so the reticle would clutter the UI). Mobile-
// only — the caller (game-engine.js draw loop) already gates on
// isMobile() so this module assumes the gate has already been checked.

import { GAME_STATES } from '../core/constants.js';

// Visual constants. The 24-px reticle reads as a clear "aim here"
// indicator at typical phone DPRs without obscuring the entity the
// player is about to shoot. Outer ring + inner cross is the classic
// crosshair shape — matches the desktop drawDefaultCrosshair muscle
// memory for users who play on both platforms.
const RETICLE_RADIUS = 24;
const RETICLE_LINE_WIDTH = 2;
const RETICLE_COLOR_OUTER = 'rgba(0, 255, 255, 0.85)'; // cyan
const RETICLE_COLOR_INNER = 'rgba(0, 255, 255, 0.55)'; // softer cyan
const CROSS_HALF_LEN = 10;
const CENTER_DOT_RADIUS = 2;

/**
 * Draw the mobile aiming reticle at the last-touched canvas
 * coordinates. Called from the game-engine draw loop AFTER the camera
 * transform is restored, so coordinates are screen / canvas space.
 *
 * `this` is bound to the GameEngine instance (matches the rest of the
 * hud/*.js dispatcher pattern). Reads:
 *   - this.ctx          — Canvas2D rendering context
 *   - this.game.state   — gated to PLAYING / WAVE_TRANSITION
 *   - this.radialMenu   — suppressed when a radial selection is open
 *   - this._mobileLastTouchCanvasX/Y — seeded by mobile-touch.js
 *   - this.inputHandler.input.screenAimX/Y — fallback source
 *   - this.canvas       — for the screen-centre fallback
 */
export function drawMobileReticle() {
    const ctx = this.ctx;
    if (!ctx) return;

    // Only show the reticle during active play. Title screen / pause /
    // shop / game over each draw their own UI; the reticle would be
    // misleading there.
    const state = this.game && this.game.state;
    if (state !== GAME_STATES.PLAYING && state !== GAME_STATES.WAVE_TRANSITION) return;

    // Radial menu owns the screen during a selection — don't clutter.
    if (this.radialMenu && this.radialMenu.isOpen && this.radialMenu.isOpen()) return;

    // Under the gamepad control scheme, aiming moves to the right stick —
    // the touch reticle (anchored to the last tap) would be a stale,
    // misleading crosshair, so suppress it. The desktop-style laser sight
    // / cone takes over (opt-in via the ASSISTS tab). When the player has a
    // pad connected but chose the touch scheme, the reticle stays.
    if (this.controlScheme === 'gamepad') return;

    // Source: prefer the explicit last-touch cache (set by every tap).
    // Fall back to the live input screenAimX/Y. Fall back further to the
    // screen centre so the reticle is visible even on first frame before
    // any tap.
    let x = this._mobileLastTouchCanvasX;
    let y = this._mobileLastTouchCanvasY;
    if (typeof x !== 'number' || typeof y !== 'number') {
        const input = this.inputHandler && this.inputHandler.input;
        if (input && typeof input.screenAimX === 'number') {
            x = input.screenAimX;
            y = input.screenAimY;
        }
    }
    if (typeof x !== 'number' || typeof y !== 'number') {
        const canvas = this.canvas;
        if (!canvas) return;
        x = canvas.width / 2;
        y = canvas.height / 2;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = RETICLE_LINE_WIDTH;

    // Outer ring — main target indicator.
    ctx.strokeStyle = RETICLE_COLOR_OUTER;
    ctx.beginPath();
    ctx.arc(x, y, RETICLE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Inner crosshair — four short ticks gapped from the centre so the
    // entity directly under the reticle stays legible.
    ctx.strokeStyle = RETICLE_COLOR_INNER;
    const gap = 4; // gap from centre dot
    ctx.beginPath();
    // Top tick
    ctx.moveTo(x, y - gap);
    ctx.lineTo(x, y - gap - CROSS_HALF_LEN);
    // Bottom tick
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + gap + CROSS_HALF_LEN);
    // Left tick
    ctx.moveTo(x - gap, y);
    ctx.lineTo(x - gap - CROSS_HALF_LEN, y);
    // Right tick
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + gap + CROSS_HALF_LEN, y);
    ctx.stroke();

    // Centre dot — pinpoint anchor.
    ctx.fillStyle = RETICLE_COLOR_OUTER;
    ctx.beginPath();
    ctx.arc(x, y, CENTER_DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}
