// CD-16 / T15 (R-THREATUI) — Threat-Level HUD meter.
//
// A small canvas-drawn row of 5 chevron pips near the top-center of the
// screen (by the wave/stage indicator) that surfaces, at a glance, how hard
// the Adaptive Difficulty Director is currently pushing the player:
//
//   • a row of 5 CHEVRON PIPS — filled up to the current level, hollow/dim
//     above it
//   • a COOL→HOT color ramp — cyan at level 1 → gold at 3 → red at 5
//   • a PULSE on the active pip(s) + a brief "THREAT ↑/↓" TOAST when the level
//     changes at wave start (increase = pulse + bright toast, decrease/mercy =
//     subtler), nothing when unchanged
//   • a small NUMERIC label so the pips are never the only channel (a11y)
//
// This module CONSUMES RUN-04's `getThreatLevel(state)` (1..5) from
// difficulty-director.js. The director is NOT yet instantiated in the live
// game (that wiring lands in RUN-01/RUN-05), so `drawThreatLevelHook` is
// DEFENSIVE: it resolves a director state if one exists, falls back to a
// debug/test override (`this._debugThreatLevel`), and otherwise NO-OPS
// silently until the director is wired live.
//
// `computeThreatLayout`, `threatPipColor`, and `updateThreatAnim` are PURE
// (no canvas, no DOM, no globals) so they are fully unit-testable;
// `drawThreatLevel` does all the 2D rendering. Canvas text stays the pixel
// font (Press Start 2P) to match the rest of the canvas HUD.

import { getThreatLevel } from '../wave/difficulty-director.js';

/** The threat meter shows 5 pips (matches difficulty-director THREAT_PIPS). */
export const THREAT_PIP_COUNT = 5;

/** Toast lifetime (ms) and active-pip pulse window (ms). */
export const TOAST_MS = 1600;
export const PULSE_MS = 450;
// A decrease (mercy) gets a shorter, subtler pulse window.
const PULSE_DECREASE_MS = 220;

/**
 * Cool→hot ramp, one hot color per pip level (index 0 = level 1 … index 4 =
 * level 5). cyan → teal → gold → orange → red. The endpoints (cyan/gold/red)
 * are the design anchors; the in-betweens (teal, orange) are interpolated.
 */
export const THREAT_COLORS = Object.freeze([
    '#33ddff', // 1 — cyan
    '#5fe6b0', // 2 — teal (cyan→gold)
    '#ffd700', // 3 — gold
    '#ff8c33', // 4 — orange (gold→red)
    '#ff3344', // 5 — red
]);

// Clamp a 1..5 level to its valid integer range.
function clampLevel(level) {
    const n = Math.round(Number(level));
    if (!Number.isFinite(n)) return 1;
    return n < 1 ? 1 : n > THREAT_PIP_COUNT ? THREAT_PIP_COUNT : n;
}

// Dim/desaturated variant of a hot ramp color, used for unfilled pips so the
// pip row still reads as a 5-slot gauge with the top slots "empty".
function dimColor(hex) {
    let h = String(hex || '#33ddff').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    // Desaturate toward gray, then darken — a hollow, "not yet reached" look.
    const gray = (r + g + b) / 3;
    const mix = (c) => Math.round((c * 0.4 + gray * 0.6) * 0.42);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * PURE — color for pip `pipIndex` (0..4) at the current `level` (1..5). Filled
 * pips (pipIndex < level) use the hot ramp color for THAT pip's slot; unfilled
 * pips (pipIndex >= level) use a dim/desaturated version.
 */
export function threatPipColor(pipIndex, level) {
    const lvl = clampLevel(level);
    const idx = Math.max(0, Math.min(THREAT_PIP_COUNT - 1, pipIndex | 0));
    const hot = THREAT_COLORS[idx];
    return pipIndex < lvl ? hot : dimColor(hot);
}

/**
 * PURE layout helper — no canvas access. Lays out the 5-pip chevron row
 * centered top-center within `viewW`, plus a small numeric label.
 *
 * @param {number} level  current threat level (clamped to [1,5])
 * @param {number} viewW  viewport width in px
 * @param {object} [opts] optional overrides: { pipW, pipH, gap, y }
 * @returns {{
 *   pips: Array<{x:number,y:number,w:number,h:number,filled:boolean,color:string}>,
 *   label: string,
 *   x: number, y: number, w: number, h: number
 * }}
 */
export function computeThreatLayout(level, viewW, opts = {}) {
    const lvl = clampLevel(level);
    const pipW = opts.pipW != null ? opts.pipW : 16;
    const pipH = opts.pipH != null ? opts.pipH : 12;
    const gap = opts.gap != null ? opts.gap : 6;
    // Default y: below the boss-healthbar band (y≈16) so the two don't collide
    // when both are visible. ~92 px sits under the top-center info area.
    const y = opts.y != null ? opts.y : 92;

    const totalW = THREAT_PIP_COUNT * pipW + (THREAT_PIP_COUNT - 1) * gap;
    const x = Math.round((viewW - totalW) / 2);

    const pips = [];
    for (let i = 0; i < THREAT_PIP_COUNT; i++) {
        const px = x + i * (pipW + gap);
        pips.push({
            x: px,
            y,
            w: pipW,
            h: pipH,
            filled: i < lvl,
            color: threatPipColor(i, lvl),
        });
    }

    return {
        pips,
        label: `THREAT ${lvl}/${THREAT_PIP_COUNT}`,
        x,
        y,
        w: totalW,
        h: pipH,
    };
}

/**
 * PURE state machine for the pulse + toast. `anim` holds
 * `{ shownLevel, pulseUntil, toast, toastUntil }`. On a CHANGE from
 * `anim.shownLevel` → `level`:
 *   • increase ⇒ toast 'THREAT ↑', pulse for PULSE_MS
 *   • decrease ⇒ toast 'THREAT ↓', pulse for the shorter PULSE_DECREASE_MS
 *   • toastUntil = now + TOAST_MS in both cases
 *   • shownLevel updated to `level`
 * When UNCHANGED: nothing fires (no toast, no pulse refresh). Returns the
 * (mutated) `anim` for convenience.
 */
export function updateThreatAnim(anim, level, now) {
    const lvl = clampLevel(level);
    if (anim.shownLevel == null) {
        // First observation: adopt the level silently (no toast on boot).
        anim.shownLevel = lvl;
        return anim;
    }
    if (lvl > anim.shownLevel) {
        anim.toast = 'THREAT ↑';
        anim.toastUntil = now + TOAST_MS;
        anim.pulseUntil = now + PULSE_MS;
        anim.shownLevel = lvl;
    } else if (lvl < anim.shownLevel) {
        anim.toast = 'THREAT ↓';
        anim.toastUntil = now + TOAST_MS;
        anim.pulseUntil = now + PULSE_DECREASE_MS;
        anim.shownLevel = lvl;
    }
    // Unchanged: leave any in-flight toast/pulse alone; expiry is time-based.
    return anim;
}

// Draw a single filled/hollow chevron pip (a right-pointing ">" arrow head
// inscribed in the pip's rect), tinted by `color`.
function drawChevron(ctx, pip, filled, color, alpha) {
    const { x, y, w, h } = pip;
    const midY = y + h / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    // ">" shape: two strokes meeting at the right-center point.
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, midY);
    ctx.lineTo(x, y + h);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (filled) {
        // A filled chevron: close back through a notch so it reads as a solid
        // arrow head rather than an open caret.
        ctx.lineTo(x + w * 0.42, midY);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.stroke();
    } else {
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
    }
    ctx.restore();
}

/**
 * Render the threat meter: the 5 chevron pips, an active-pip pulse while
 * `now < anim.pulseUntil`, the "THREAT ↑/↓" toast while `now < anim.toastUntil`,
 * and the small numeric label beneath. Engine-agnostic: a raw 2D context, the
 * level, viewport width, the anim state, and `now` (ms).
 */
export function drawThreatLevel(ctx, level, viewW, anim, now) {
    const lvl = clampLevel(level);
    const L = computeThreatLayout(lvl, viewW);
    const pulsing = anim && now < (anim.pulseUntil || 0);
    // Pulse strength: a bell across the pulse window so it swells then settles.
    let pulse = 0;
    if (pulsing) {
        const remain = (anim.pulseUntil - now);
        const frac = Math.max(0, Math.min(1, remain / PULSE_MS));
        pulse = Math.sin(frac * Math.PI);
    }

    ctx.save();

    // ── Pips ────────────────────────────────────────────────────────────────
    for (let i = 0; i < L.pips.length; i++) {
        const pip = L.pips[i];
        const isActive = i === lvl - 1; // the highest filled pip
        const baseAlpha = pip.filled ? 1 : 0.85;
        drawChevron(ctx, pip, pip.filled, pip.color, baseAlpha);

        // Pulse halo on the active (highest-filled) pip(s) when pulsing.
        if (pulse > 0 && isActive && pip.filled) {
            ctx.save();
            ctx.globalAlpha = pulse * 0.7;
            ctx.shadowColor = pip.color;
            ctx.shadowBlur = 8 + 12 * pulse;
            drawChevron(ctx, pip, true, pip.color, 1);
            ctx.restore();
        }
    }

    // ── Numeric label (a11y — pips are never the only channel) ───────────────
    const labelY = L.y + L.h + 4;
    const labelX = L.x + L.w / 2;
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillStyle = 'rgba(208, 226, 245, 0.92)';
    ctx.strokeText(L.label, labelX, labelY);
    ctx.fillText(L.label, labelX, labelY);

    // ── Toast ("THREAT ↑" / "THREAT ↓") ──────────────────────────────────────
    if (anim && anim.toast && now < (anim.toastUntil || 0)) {
        const remain = anim.toastUntil - now;
        // Fade out over the last 35% of the toast lifetime.
        const t = remain / TOAST_MS; // 1 → 0
        const alpha = t > 0.35 ? 1 : t / 0.35;
        const up = anim.toast.indexOf('↑') !== -1;
        const toastY = L.y - 12;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        // Increase = hot red-orange; decrease = cool cyan (subtler cue).
        ctx.fillStyle = up ? '#ff6644' : '#66ddff';
        ctx.strokeText(anim.toast, labelX, toastY);
        ctx.fillText(anim.toast, labelX, toastY);
        ctx.restore();
    }

    ctx.restore();
}

/**
 * Engine-side glue — call with `.call(engine)` from the HUD draw path.
 *
 * Resolves the threat level DEFENSIVELY:
 *   1. a live director state (this.difficultyDirector / this.waveManager.director
 *      / this.game.difficultyDirector) → getThreatLevel(state)
 *   2. else a numeric debug/test override (this._debugThreatLevel /
 *      this.game._debugThreatLevel) — lets QA exercise the HUD before the
 *      director is wired live
 *   3. else NO-OP (return) — nothing to show until RUN-01/RUN-05 wire it.
 *
 * Maintains anim state on `this._threatAnim`, and after drawing sets
 * `this._threatLevelDrawn` as a queryable marker for QA.
 */
export function drawThreatLevelHook() {
    // 1. Live director state (several possible mount points).
    const dirState =
        (this.difficultyDirector && this.difficultyDirector.cfg ? this.difficultyDirector : null)
        || (this.waveManager && this.waveManager.director ? this.waveManager.director : null)
        || (this.game && this.game.difficultyDirector ? this.game.difficultyDirector : null);

    let level = null;
    if (dirState) {
        try {
            level = getThreatLevel(dirState);
        } catch (_) {
            level = null;
        }
    }

    // 2. Debug/test override.
    if (level == null) {
        const dbg = (typeof this._debugThreatLevel === 'number')
            ? this._debugThreatLevel
            : (this.game && typeof this.game._debugThreatLevel === 'number'
                ? this.game._debugThreatLevel
                : null);
        if (dbg != null) level = dbg;
    }

    // 3. No-op until something supplies a level.
    if (level == null) return;

    const now = Date.now();
    if (!this._threatAnim) {
        this._threatAnim = { shownLevel: null, pulseUntil: 0, toast: null, toastUntil: 0 };
    }
    updateThreatAnim(this._threatAnim, level, now);
    drawThreatLevel(this.ctx, level, this.width, this._threatAnim, now);
    this._threatLevelDrawn = clampLevel(level);
}
