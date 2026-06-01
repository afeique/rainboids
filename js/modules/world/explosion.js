// world/explosion.js — procedural fireball + smoke explosion (10.1.0).
//
// Spawns a CLUSTER of overlapping `fireballPuff` billboards (see particle.js)
// that together read as a volumetric 3D fireball: each puff is a lit-sphere
// gradient that expands and ramps colour from white-hot → orange → deep red
// (additive fire) and then crosses over into a drifting warm-grey smoke puff
// that billows, rises, and fades to nothing. Replaces the old explosion stack
// (plasma-core layers + standalone smoke + lingering embers) with ONE cohesive
// effect that fully resolves and leaves nothing lingering behind.
//
// Pure spawn helper — no engine `this`, no DOM. Takes the particle pool so it
// is trivially unit-testable and reusable from any death/impact site.
import { random } from '../core/utils.js';

/**
 * Spawn a fireball+smoke explosion centred on (x, y).
 *
 * @param {object} pool   particle pool with .get(x, y, type, ...args)
 * @param {number} x, y   blast centre (world coords)
 * @param {object} opts
 *   radius : blast size in px (drives puff size + count). Default 30.
 *   power  : 0..1 intensity → ejecta speed + spread. Default 1.
 *   puffs  : override the auto-derived puff count.
 *   hueShift: degrees added to the puffs' fire hue (e.g. cool blue plasma).
 */
export function spawnExplosion(pool, x, y, opts = {}) {
    if (!pool || typeof pool.get !== 'function') return;
    const radius = Math.max(8, opts.radius || 30);
    const power = opts.power != null ? opts.power : 1;
    const hueShift = opts.hueShift || 0;
    // More + bigger puffs for bigger blasts, but bounded so a wave-clear of
    // many kills can't flood the pool.
    const total = opts.puffs || Math.min(18, Math.round(5 + radius / 8));
    const coreN = Math.max(3, Math.round(total * 0.55));
    const ejectaN = Math.max(2, total - coreN);

    // ── Core fireball: big, slow puffs packed near the centre. These carry the
    //    bright white-hot body and the bulk of the smoke cloud. ──
    for (let i = 0; i < coreN; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = random(0, radius * 0.40);
        const pr = random(radius * 0.45, radius * 0.80);
        const p = pool.get(x + Math.cos(a) * d, y + Math.sin(a) * d, 'fireballPuff', pr);
        if (!p) continue;
        const sp = random(0.3, 1.4) * power;
        p.vel = { x: Math.cos(a) * sp, y: Math.sin(a) * sp };
        p.maxRadius = pr * random(1.6, 2.4);
        p._decay = random(0.016, 0.024);                  // core lingers (smoke)
        if (hueShift) p._fireHue += hueShift;
    }

    // ── Ejecta: smaller, faster puffs flung outward → a ragged fire edge and
    //    smoke trails. Shorter life so the rim resolves before the core. ──
    for (let i = 0; i < ejectaN; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = random(radius * 0.30, radius * 0.70);
        const pr = random(radius * 0.25, radius * 0.50);
        const p = pool.get(x + Math.cos(a) * d, y + Math.sin(a) * d, 'fireballPuff', pr);
        if (!p) continue;
        const sp = random(1.6, 3.6) * power;
        p.vel = { x: Math.cos(a) * sp, y: Math.sin(a) * sp };
        p.maxRadius = pr * random(1.8, 2.8);
        p._decay = random(0.024, 0.032);
        p.life = random(0.85, 1.0);
        p._smokeStart = 0.5 + Math.random() * 0.12;
        if (hueShift) p._fireHue += hueShift;
    }
}
