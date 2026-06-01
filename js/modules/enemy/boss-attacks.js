// enemy/boss-attacks.js — wire each boss's SIGNATURE telegraphed attack to
// actually FIRE bullets (the doc's per-boss ATK-n tracks).
//
// Background: every modular boss runs a telegraphed-attack STATE MACHINE in its
// `_bossDriver` (Conduct Rain, Disjunction, Adaptive Purge, Annihilation Beam,
// Corrode Cloud, turret volleys, …). Those machines set telegraph/fire flags
// and the per-boss renderers already draw the wind-up — but nothing consumed
// the FIRE edge to spawn the distinctive bullet pattern, so bosses fell back to
// the generic TITAN sweep_laser only. This module is that missing consumer.
//
// Design:
//   • `updateBossAttacks(boss, gameEngine, now)` is called once per frame from
//     enemy.js's boss branch, AFTER the boss driver has advanced its state.
//   • It detects the FIRE EDGE for the boss (a fireCount increment, or a
//     boolean firing-window 0→1 transition) using per-boss latch fields stashed
//     on the boss (`_atkFireSeen*`), so a multi-frame firing window fires its
//     pattern exactly ONCE per cycle.
//   • On the edge it emits the boss's signature pattern via the shared emitters
//     below, which spawn through the normal `enemyBulletPool` so the bullets
//     collide, carry the boss element, and skip the firing boss (shooter tag).
//
// Additive + safe: a boss with no entry here simply keeps its generic chassis
// fire. Pure dispatch — never throws into the game loop (enemy.js wraps the
// boss update in try/catch, and we guard the pool here too).

// ── Shared bullet emitters ───────────────────────────────────────────────────

// Spawn one enemy bullet from (x,y) traveling at `angle` with `speed`.
// Tags element + shooter; bumps radius/glow so boss shots read as heavier.
function emitBullet(gameEngine, boss, x, y, angle, speed, opts = {}) {
    const pool = gameEngine && gameEngine.enemyBulletPool;
    if (!pool || typeof pool.get !== 'function') return null;
    // Stamp the element so EnemyBullet.reset() tags the shot (drives the
    // player's elemental resistance), mirroring firing.js shoot().
    gameEngine._activeShotElement = opts.element || boss.element || 'KINETIC';
    gameEngine._activeShotPattern = opts.pattern || 'boss_attack';
    const b = pool.get();
    if (!b) return null;
    const color = opts.color || boss.glowColor || boss.color || '#ffffff';
    b.reset(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, !!opts.explosive);
    b.shooter = boss;                       // no self-collision
    // Heavier, more visible boss ordnance.
    if (typeof b.radius === 'number') b.radius = opts.radius || 11;
    b.glowRadius = opts.glowRadius || 24;
    // Level-scaled damage when the boss exposes the helper; else a sane default.
    const base = opts.damage || 3;
    b.damage = (typeof boss.getLevelScaledDamage === 'function')
        ? boss.getLevelScaledDamage(base)
        : base;
    return b;
}

// Radial NOVA: `count` bullets evenly around the circle from the boss center,
// optionally phase-offset. Used for omnidirectional pressure bursts.
function emitRadial(gameEngine, boss, count, speed, opts = {}) {
    const n = Math.max(1, count | 0);
    const base = opts.angleOffset || 0;
    for (let i = 0; i < n; i++) {
        const a = base + (i / n) * Math.PI * 2;
        const r = boss.radius || 48;
        emitBullet(gameEngine, boss, boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r, a, speed, opts);
    }
}

// ── Edge detection ────────────────────────────────────────────────────────────

// Rising edge of a boolean firing window, latched per `key` on the boss.
// Returns true exactly on the frame the window turns on.
function firingEdge(boss, key, on) {
    const latch = '_atkSeen_' + key;
    const was = !!boss[latch];
    boss[latch] = !!on;
    return !!on && !was;
}

// Edge of a monotonically-increasing fire counter, latched per `key`.
// Returns true once per increment (handles multi-step jumps as a single fire).
function counterEdge(boss, key, count) {
    const latch = '_atkCount_' + key;
    const prev = boss[latch] || 0;
    boss[latch] = count;
    return count > prev;
}

// ── Per-boss signature attacks ────────────────────────────────────────────────
// Keyed by bossId. Each handler reads the boss's already-computed state flags
// and, on the FIRE edge, emits its pattern. Cadence/telegraph timing is owned by
// the boss driver; this only spawns the bullets when the driver says "fire".

const ATTACKS = {
    // MAELSTROM — CONDUCT RAIN: the storm discharges a VOLT nova outward from
    // the eye on each strike. The ring count + speed scale with the aspect/phase
    // implicitly via the boss being enraged (relentless finale).
    MAELSTROM(boss, ge) {
        if (!firingEdge(boss, 'conductRain', boss.conductRainFiring)) return;
        const enraged = !!boss._enraged;
        emitRadial(ge, boss, enraged ? 20 : 14, enraged ? 4.6 : 3.8, {
            element: 'VOLT',
            color: '#c89bff',
            // Slight per-strike rotation so successive novas interleave gaps.
            angleOffset: (boss._atkCount_conductNova = (boss._atkCount_conductNova || 0) + 0.32),
        });
    },
};

// ── Frame entry point ─────────────────────────────────────────────────────────

// Called once per frame for a modular boss (enemy.js boss branch), after the
// boss driver advanced its state. No-op for bosses without an ATTACKS entry.
export function updateBossAttacks(boss, gameEngine, now) {
    if (!boss || !gameEngine) return;
    if (boss.warping || boss._deathFlash > 0) return;   // not while warping in / dying
    const handler = boss.bossId && ATTACKS[boss.bossId];
    if (!handler) return;
    try {
        handler(boss, gameEngine, now);
    } finally {
        // Clear the element/pattern stamps so subsequent non-boss bullet spawns
        // don't inherit a stale tag (mirrors firing.js shoot()'s finally).
        gameEngine._activeShotElement = null;
        gameEngine._activeShotPattern = null;
    }
}

// Exposed for unit tests.
export const _internal = { firingEdge, counterEdge, emitRadial, emitBullet, ATTACKS };
