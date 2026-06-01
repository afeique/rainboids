// enemy/bosses/render/iron-throne-render.js — THE IRON THRONE siege-citadel (9.1.x).
//
// A colossal walking fortress-ziggurat: stacked iron tiers with warm torch-glow
// accents and an animated heraldic banner, an armored KING enthroned at the peak
// (royal-gold radial), bristling with orbiting GUN BATTERIES — the four turret
// weak-points (boss-parts, shieldsCore). Each turret is weak to exactly one
// element (turret.element) and is tinted that element's colour so the player
// reads which counter to cycle. A volley (`boss._turretFire.firing`) flashes
// muzzle-heat at the batteries. As batteries fall the fortress LISTS (tilts) and
// the king flares; the throne is the exposed core once all guns are down. Drawn
// in world space (the enemy pass is already inside the camera transform),
// following the prototype structure + boss-gfx grammar.

import { livingParts } from '../../boss-parts.js';
import { currentPhaseIndex } from '../../boss-phases.js';
import {
    hexRgb, rgba, radialGlow, layeredCore, beveledPanel,
} from './boss-gfx.js';

const IRON = { dark: '#2a2f38', mid: '#5a6470', bright: '#9aa6b6' };
const TORCH = { dark: '#3a1a06', mid: '#ff9a3a', bright: '#ffe0a0', glow: '#ffb24a' };
const KING = { dark: '#5a3e08', mid: '#ffcc33', bright: '#fff4c0', glow: '#ffd84a' };
const BANNER = '#9a1f2a';
// Per-element weakness tint (matches ELEMENTS.*.color) so each battery signals
// the counter-element to hit it with.
const ELEM_TINT = {
    KINETIC: '#dfe7f0', PYRO: '#ff5522', CRYO: '#66ccff', VOLT: '#a855ff',
    TOXIC: '#88ff44', VOID: '#7744dd', RADIANT: '#ffee88',
};

export function drawIronThrone(ctx, boss) {
    const x = boss.x || 0;
    const y = boss.y || 0;
    const R = boss.radius || (boss.size ? boss.size / 2 : 120);
    const t = (boss._now || Date.now()) * 0.001;
    const enraged = !!boss._enraged;
    const firing = !!(boss._turretFire && boss._turretFire.firing);  // volley due
    const phaseIdx = currentPhaseIndex(boss);
    const heat = Math.min(1, phaseIdx / 2) + (enraged ? 0.25 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * (enraged ? 5 : 2.2));
    const hpFrac = boss.maxHealth > 0 ? Math.max(0, boss.health / boss.maxHealth) : 1;
    const turrets = livingParts(boss);
    // The fortress LISTS (tilts) more as batteries fall / phases advance.
    const list = Math.sin(t * 0.6) * (0.04 + heat * 0.10) * (1 - turrets.length / 4 + 0.25);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(list);   // the whole citadel tilts as it crumbles

    // ── 1 · Torch-glow aura (warm fortress light) ──
    radialGlow(ctx, 0, 0, R * 0.5, R * (1.9 + heat * 0.4 + pulse * 0.15),
        TORCH.glow, 0.10 + heat * 0.14 + pulse * 0.05);

    // ── 2 · Stacked iron tiers (the ziggurat body) ──
    const tierCount = 3;
    for (let i = tierCount - 1; i >= 0; i--) {
        const f = i / (tierCount - 1);          // 0 = base (widest), 1 = top
        const tw = R * (1.05 - 0.42 * f);       // tier half-width
        const th = R * 0.30;                    // tier half-height
        const ty = R * 0.55 - i * R * 0.5;      // stacked upward
        const sheen = ctx.createLinearGradient(0, ty - th, 0, ty + th);
        sheen.addColorStop(0, rgba(hexRgb(IRON.bright), 0.96));
        sheen.addColorStop(0.5, rgba(hexRgb(IRON.mid), 0.95));
        sheen.addColorStop(1, rgba(hexRgb(IRON.dark), 0.97));
        ctx.fillStyle = sheen;
        ctx.beginPath();
        ctx.moveTo(-tw, ty + th);
        ctx.lineTo(-tw * 0.82, ty - th);
        ctx.lineTo(tw * 0.82, ty - th);
        ctx.lineTo(tw, ty + th);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba(hexRgb(IRON.bright), 0.4);
        ctx.lineWidth = Math.max(1.5, R * 0.025);
        ctx.stroke();
        // Torch dots along the tier lip.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let k = -1; k <= 1; k += 2) {
            const fl = 0.5 + 0.5 * Math.sin(t * 4 + i + k);
            ctx.fillStyle = rgba(hexRgb(TORCH.bright), 0.5 + 0.3 * fl);
            ctx.beginPath();
            ctx.arc(k * tw * 0.7, ty - th, R * 0.03 + R * 0.02 * fl, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ── 3 · Heraldic banner (animated cloth wave) hanging down the front ──
    {
        const bw = R * 0.34, bx = 0, by0 = -R * 0.2, by1 = R * 0.75;
        ctx.fillStyle = rgba(hexRgb(BANNER), 0.92);
        ctx.beginPath();
        ctx.moveTo(bx - bw, by0);
        ctx.lineTo(bx + bw, by0);
        const segs = 5;
        for (let s = 0; s <= segs; s++) {
            const u = s / segs;
            const wave = Math.sin(t * 2 + u * 4) * R * 0.05 * u;
            ctx.lineTo(bx + bw + wave, by0 + (by1 - by0) * u);
        }
        // notched bottom
        ctx.lineTo(bx + wavedNotch(bx, bw, by1, t), by1 - R * 0.08);
        for (let s = segs; s >= 0; s--) {
            const u = s / segs;
            const wave = Math.sin(t * 2 + u * 4 + Math.PI) * R * 0.05 * u;
            ctx.lineTo(bx - bw + wave, by0 + (by1 - by0) * u);
        }
        ctx.closePath();
        ctx.fill();
        // Gold crest stripe.
        ctx.strokeStyle = rgba(hexRgb(KING.mid), 0.7);
        ctx.lineWidth = Math.max(1.5, R * 0.03);
        ctx.beginPath();
        ctx.moveTo(bx, by0 + R * 0.06);
        ctx.lineTo(bx, by1 - R * 0.12);
        ctx.stroke();
    }

    // ── 4 · The KING enthroned at the peak (royal-gold radial) ──
    {
        const kx = 0, ky = -R * 0.75;
        const exposed = turrets.length === 0;    // guns down → king vulnerable
        layeredCore(ctx, kx, ky, R * (0.20 + (exposed ? 0.06 : 0)), KING,
            heat + (exposed ? 0.4 : 0), pulse);
        if (exposed) {
            radialGlow(ctx, kx, ky, R * 0.12, R * (0.6 + pulse * 0.2), KING.glow,
                0.3 + 0.3 * pulse);
        }
    }

    // ── 5 · Gun batteries — the orbiting turret weak-points (element-tinted) ──
    // Drawn in the UN-rotated frame so they sit at their real world positions:
    // undo the list tilt for the parts (their x/y are world-space already).
    ctx.restore();           // back to world space (no translate/rotate)
    ctx.save();
    for (const part of turrets) {
        const px = part.x, py = part.y;
        const pr = part.radius || 26;
        const ph = part.maxHealth > 0 ? Math.max(0.15, part.health / part.maxHealth) : 1;
        const tint = ELEM_TINT[part.element] || IRON.bright;
        const outward = Math.atan2(py - y, px - x);

        // Battery housing (beveled metal panel facing outward).
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(outward);
        beveledPanel(ctx, pr * 0.8, pr * 1.05, IRON, 0.85 + 0.15 * ph);
        // Barrel cluster pointing outward.
        ctx.fillStyle = rgba(hexRgb(IRON.dark), 0.95);
        for (let b = -1; b <= 1; b++) {
            ctx.fillRect(pr * 0.3, b * pr * 0.32 - pr * 0.08, pr * 0.9, pr * 0.16);
        }
        // Muzzle-heat glow at the barrel tips (flares on a volley).
        const muzzle = firing ? 1 : (0.2 + 0.3 * pulse);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(hexRgb(TORCH.bright), 0.5 * muzzle);
        for (let b = -1; b <= 1; b++) {
            ctx.beginPath();
            ctx.arc(pr * 1.25, b * pr * 0.32, pr * (0.18 + 0.18 * muzzle), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        ctx.restore();

        // Element-weakness tint ring (signals which counter to use).
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(hexRgb(tint), 0.5 * ph + 0.2 + 0.2 * pulse);
        ctx.lineWidth = Math.max(1.5, pr * 0.14);
        ctx.beginPath();
        ctx.arc(px, py, pr * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Scorch as the battery is worn down.
        if (ph < 0.99) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = `rgba(8,8,10,${0.5 * (1 - ph)})`;
            ctx.beginPath();
            ctx.arc(px, py, pr * 1.0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── 6 · Floating ash + muzzle smoke (ambient) ──
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 10; k++) {
        const a = t * 0.25 + (k / 10) * Math.PI * 2;
        const rr = R * (1.3 + 0.4 * ((t * 0.08 + k * 0.4) % 1));
        const ax = x + Math.cos(a) * rr, ay = y + Math.sin(a) * rr - R * 0.2;
        ctx.fillStyle = rgba(hexRgb(TORCH.glow), 0.10 * (0.5 + 0.5 * Math.sin(t + k)));
        ctx.beginPath();
        ctx.arc(ax, ay, 1.5 + 1.5 * Math.abs(Math.sin(t * 1.5 + k)), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── 7 · Low-HP / enrage crackle on the throne ──
    if (hpFrac < 0.35 || enraged) {
        radialGlow(ctx, x, y - R * 0.75, R * 0.15, R * (0.7 + pulse * 0.3), '#ff7a3a',
            0.16 + 0.18 * pulse);
    }

    ctx.restore();
}

// Tiny helper: the wavy bottom-notch x of the banner (kept local + pure).
function wavedNotch(bx, bw, by1, t) {
    return bx + Math.sin(t * 2) * bw * 0.1;
}

export default drawIronThrone;
