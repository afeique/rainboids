// BOSS-04 — Generic modular-boss renderer.
//
// The 10 boss descriptor modules carry GEOMETRY data (core size, element tint,
// weak-point parts via boss-parts.js) but no draw code — they are pure data +
// thin drivers over the shipped chassis. This module is the one renderer that
// turns any of them into pixels:
//
//   • CORE — a layered, element-tinted disc (additive glow halo + filled body +
//     ring), sized from the descriptor. A phase/enrage tint reads the boss's
//     phase index + `_enraged` flag so the core visibly "heats up" late-fight.
//   • WEAK-POINTS — each LIVING part (from boss-parts.livingParts) drawn at its
//     tracked world position as a small tinted node with an HP-fraction arc, so
//     the player can see what to shoot and how close it is to falling.
//
// Engine-agnostic + defensive: a raw 2D context + the boss. Skips cleanly when
// the boss isn't a drawable modular boss. The engine's enemy draw path calls
// `drawModularBoss(ctx, boss)` for any enemy carrying a `bossId` (the modular
// boss marker set at spawn); regular enemies + the legacy tier-boss path are
// untouched.

import { ELEMENTS, DEFAULT_ELEMENT } from '../combat/elements.js';
import { livingParts } from './boss-parts.js';
import { currentPhaseIndex } from './boss-phases.js';

// Element tint, resolved from the shared element taxonomy (same fallback as
// the healthbar so the core + bar match).
function elementColor(element) {
    const e = ELEMENTS[element] || ELEMENTS[DEFAULT_ELEMENT];
    return (e && e.color) || '#dfe7f0';
}

// True when this enemy is a modular boss we own the rendering for. Keyed on the
// `bossId` stamp the spawner writes (NOT the legacy `isBoss`/`bossTier` enemies).
export function isModularBoss(boss) {
    return !!(boss && boss.bossId && boss.isBoss);
}

// Hex → {r,g,b}; tolerant of #rgb / #rrggbb. Falls back to a neutral grey.
function _hexRgb(hex) {
    if (typeof hex !== 'string') return { r: 200, g: 210, b: 220 };
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (!isFinite(n)) return { r: 200, g: 210, b: 220 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Draw a modular boss: core disc + living weak-points. No-op for non-modular
 * bosses. World-space — the caller has already applied the camera transform
 * (this runs inside the same enemy draw pass as every other entity).
 */
export function drawModularBoss(ctx, boss) {
    if (!isModularBoss(boss)) return;
    // While the boss is mid-death-flash or warping, let the standard enemy
    // draw path own the silhouette so we don't double-draw.
    if (boss._deathFlash > 0 || boss.warping) return;

    const cx = boss.x || 0;
    const cy = boss.y || 0;
    // Core radius: explicit `radius`, else half the descriptor `size`, else 48.
    const coreR = boss.radius || (boss.size ? boss.size / 2 : 48);
    const tint = elementColor(boss.element);
    const glow = boss.glowColor || tint;
    const { r, g, b } = _hexRgb(tint);

    // Enrage / late-phase heat: brighten the core glow as phases advance.
    const phaseIdx = currentPhaseIndex(boss);
    const phaseCount = Math.max(1, (boss.phaseCount | 0) || (Array.isArray(boss.phaseScript) ? boss.phaseScript.length : 1));
    const heat = Math.min(1, phaseIdx / Math.max(1, phaseCount - 1));
    const enraged = !!boss._enraged;
    // Slow breathing pulse so the core feels alive; faster + stronger when enraged.
    const t = (boss._now || Date.now()) * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 6 : 2.2));

    ctx.save();

    // ── Glow halo (additive) ──
    ctx.globalCompositeOperation = 'lighter';
    const haloR = coreR * (1.6 + heat * 0.4 + pulse * 0.15);
    const haloA = 0.22 + heat * 0.18 + (enraged ? 0.15 : 0) + pulse * 0.08;
    const grad = ctx.createRadialGradient(cx, cy, coreR * 0.3, cx, cy, haloR);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${haloA})`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // ── Core body ──
    const bodyA = 0.55 + heat * 0.25;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bodyA})`;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    // Dark inner well for contrast.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    // ── Core ring (rotates with the boss `angle` for motion) ──
    ctx.strokeStyle = glow;
    ctx.lineWidth = Math.max(2, coreR * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.stroke();

    // Spoke marks on the ring so rotation reads.
    const ang = boss.angle || 0;
    const spokes = 6;
    ctx.lineWidth = Math.max(1.5, coreR * 0.04);
    for (let i = 0; i < spokes; i++) {
        const a = ang + (i / spokes) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * coreR * 0.55, cy + Math.sin(a) * coreR * 0.55);
        ctx.lineTo(cx + Math.cos(a) * coreR * 0.95, cy + Math.sin(a) * coreR * 0.95);
        ctx.stroke();
    }

    // ── Living weak-points ──
    const parts = livingParts(boss);
    for (const part of parts) {
        const px = part.x || cx;
        const py = part.y || cy;
        const pr = part.radius || 16;
        const partTint = elementColor(part.element || boss.element);
        const { r: pR, g: pG, b: pB } = _hexRgb(partTint);

        // Shielding parts get a brighter, "protect the core" read; bonus weak
        // points (shieldsCore=false) draw dimmer.
        const shield = part.shieldsCore !== false;
        const baseA = shield ? 0.85 : 0.55;

        // Node body.
        ctx.fillStyle = `rgba(${pR}, ${pG}, ${pB}, ${baseA})`;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        // Outline.
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // HP arc — fraction of the part's remaining HP, drawn as a ring sweep.
        const hp = (part.maxHealth > 0) ? Math.max(0, Math.min(1, part.health / part.maxHealth)) : 1;
        if (hp < 1) {
            ctx.strokeStyle = `rgba(${pR}, ${pG}, ${pB}, 1)`;
            ctx.lineWidth = Math.max(2, pr * 0.22);
            ctx.beginPath();
            ctx.arc(px, py, pr + 3, -Math.PI / 2, -Math.PI / 2 + hp * Math.PI * 2);
            ctx.stroke();
        }

        // A faint tether line back to the core so the player groups the parts
        // with the boss they orbit.
        ctx.strokeStyle = `rgba(${pR}, ${pG}, ${pB}, 0.25)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();
    }

    ctx.restore();
}
