// BOSS-01 — Always-visible boss healthbar.
//
// A boss is a flagged enemy (`isBoss`) carrying a display `name`,
// `health`/`maxHealth`, a phase script (see boss-phases.js) and an `element`.
// This module renders a top-center bar that surfaces, at a glance:
//
//   • the boss NAME (Press Start 2P, matching the rest of the canvas HUD)
//   • a SEGMENTED HP bar — one segment per phase, with the active phase's
//     segment highlighted so the player can read "which phase am I in"
//   • PHASE PIPS beneath the bar (filled = entered, hollow = upcoming)
//   • an ELEMENT TINT pulled from combat/elements.js
//
// `computeBossHealthbarLayout` is PURE (no canvas, no DOM) so it is fully
// unit-testable; `drawBossHealthbar` does all the 2D rendering.
//
// The layout reads phase state in two compatible ways so both a live boss and
// a lightweight test stub work:
//   • live boss  → boss-phases.js accessors (`_phaseState.index`,
//                  `phaseScript.length`)
//   • stub/test  → explicit `phaseIndex` / `phaseCount` fields

import { ELEMENTS, DEFAULT_ELEMENT } from '../combat/elements.js';

// Element tint, resolved from the shared element taxonomy. Unknown / missing
// elements fall back to KINETIC's neutral blue-white so the bar always tints.
export function bossElementColor(element) {
    const e = ELEMENTS[element] || ELEMENTS[DEFAULT_ELEMENT];
    return (e && e.color) || '#dfe7f0';
}

// Resolve {current, total} phase counts from either shape.
function resolvePhases(boss) {
    // Live boss: phase script + runner state.
    if (Array.isArray(boss.phaseScript) && boss.phaseScript.length > 0) {
        const total = boss.phaseScript.length;
        const idx = (boss._phaseState && typeof boss._phaseState.index === 'number')
            ? boss._phaseState.index
            : 0;
        return { current: Math.max(0, Math.min(total - 1, idx)), total };
    }
    // Stub / test shape: explicit phaseCount + phaseIndex.
    const total = Math.max(1, (boss.phaseCount | 0) || 1);
    const idx = Math.max(0, Math.min(total - 1, (boss.phaseIndex | 0) || 0));
    return { current: idx, total };
}

/**
 * PURE layout helper — no canvas access.
 *
 * @param {object} boss   a boss-flagged enemy (or a stub with the same fields)
 * @param {number} viewW  the viewport width in px
 * @returns {{
 *   name: string,
 *   hpFraction: number,                 // 0..1, clamped
 *   segments: number,                   // = phase count
 *   phasePips: { total: number, current: number },
 *   elementColor: string,               // hex tint
 *   x: number, y: number, w: number, h: number  // bar rect (top-center)
 * }}
 */
export function computeBossHealthbarLayout(boss, viewW) {
    const maxHealth = (typeof boss.maxHealth === 'number' && boss.maxHealth > 0)
        ? boss.maxHealth
        : 1;
    const health = (typeof boss.health === 'number') ? boss.health : maxHealth;
    const hpFraction = Math.max(0, Math.min(1, health / maxHealth));

    const { current, total } = resolvePhases(boss);

    // Bar geometry: a wide top-center bar. Width caps at 640 px so it doesn't
    // span an ultrawide monitor; min 220 px so it stays a meaningful target on
    // a narrow phone. 16 px top margin leaves room above the top-center
    // enemy-info panel band that drawTargetInfo occupies (y≈24+).
    const w = Math.max(220, Math.min(640, Math.round(viewW * 0.6)));
    const h = 14;
    const x = Math.round((viewW - w) / 2);
    const y = 16;

    // Prefer an explicit display name, falling back to the enemy config name.
    const name = boss.name
        || (boss.config && boss.config.name)
        || 'BOSS';

    return {
        name: String(name).toUpperCase(),
        hpFraction,
        segments: total,
        phasePips: { total, current },
        elementColor: bossElementColor(boss.element),
        x, y, w, h,
    };
}

// True when a boss reference is worth drawing: present, flagged, alive.
export function isDrawableBoss(boss) {
    return !!(boss && boss.isBoss && boss.active && (boss.health == null || boss.health > 0));
}

/**
 * Render the boss healthbar at the top-center of the canvas. Skips cleanly when
 * `boss` is null / inactive. Engine-agnostic: takes a raw 2D context, the boss,
 * and the viewport width.
 */
export function drawBossHealthbar(ctx, boss, viewW) {
    if (!isDrawableBoss(boss)) return;

    const L = computeBossHealthbarLayout(boss, viewW);
    const { x, y, w, h, hpFraction, segments, phasePips, elementColor, name } = L;

    ctx.save();

    // ── Boss name (centered above the bar) ──────────────────────────────────
    const nameFontSize = 16;
    const nameY = y - 6;
    ctx.font = `${nameFontSize}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    const nameCx = x + w / 2;
    ctx.strokeText(name, nameCx, nameY);
    ctx.fillStyle = elementColor;
    ctx.fillText(name, nameCx, nameY);

    // ── Bar track ───────────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x, y, w, h);

    // ── HP fill — tinted by element ─────────────────────────────────────────
    if (hpFraction > 0) {
        const fillW = Math.max(1, Math.round(w * hpFraction));
        ctx.fillStyle = elementColor;
        ctx.fillRect(x, y, fillW, h);
        // Top highlight strip for a touch of depth.
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.fillRect(x, y, fillW, 2);
    }

    // ── Segment dividers (one segment per phase; highlight the active one) ───
    if (segments > 1) {
        const segW = w / segments;
        // Highlight the active phase's segment with a brighter band so the
        // player can read current-phase position along the bar.
        const activeStart = x + segW * phasePips.current;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fillRect(activeStart, y, segW, h);
        // Divider lines.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        for (let i = 1; i < segments; i++) {
            ctx.fillRect(Math.round(x + segW * i), y, 1, h);
        }
    }

    // ── Bar border ──────────────────────────────────────────────────────────
    ctx.strokeStyle = elementColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // ── Phase pips (beneath the bar — filled = entered) ──────────────────────
    if (phasePips.total > 1) {
        const pipR = 4;
        const pipGap = 14;
        const pipsW = (phasePips.total - 1) * pipGap;
        let pipX = x + w / 2 - pipsW / 2;
        const pipY = y + h + 9;
        for (let i = 0; i < phasePips.total; i++) {
            ctx.beginPath();
            ctx.arc(pipX, pipY, pipR, 0, Math.PI * 2);
            if (i <= phasePips.current) {
                ctx.fillStyle = elementColor;
                ctx.fill();
            } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            pipX += pipGap;
        }
    }

    ctx.restore();
}

/**
 * Engine-side hook: find the active boss in the enemy pool and draw its bar.
 * Designed to be called with `.call(engine)` from the HUD draw path. Tiny by
 * design — the bar only appears while a boss-flagged enemy is alive.
 */
export function drawBossHealthbarHook() {
    const pool = this.enemyPool;
    if (!pool || !pool.activeObjects) return;
    let boss = null;
    for (const e of pool.activeObjects) {
        if (isDrawableBoss(e)) { boss = e; break; }
    }
    if (!boss) return;
    drawBossHealthbar(this.ctx, boss, this.width);
}
