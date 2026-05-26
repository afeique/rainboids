// THE HARBINGER — stage 1-3 boss (BOSS-05).
//
// The first concrete boss. KINETIC element. A blunt, honest fight: a heavy
// core ringed by rotating BOLT-HEAD weak-points. While any bolt-head still
// shields it the core takes only a reduced "chip" of incoming damage
// (HARBINGER_CORE_CHIP) rather than being fully immune — so fire is never
// wasted — but clearing the bolts is still what opens the core to full damage
// (and stops their attacks). Three phases, fewer bolts each phase, and an
// ENRAGE in the final phase.
//
// SELF-CONTAINED + PURE: this module is data + a thin driver over the SHIPPED
// boss chassis cores — it never touches them and adds no engine deps. It owns:
//   • a phase-script consumed by boss-phases.js   (HP-gated, 3 phases)
//   • per-phase parts-scripts consumed by boss-parts.js (rotating bolt-heads,
//     re-armed on each phase enter so the core re-shields)
//   • intro + death sequences consumed by boss-intro.js
// Everything is driven through the chassis' public API with an explicit `now`,
// so the whole boss is headless + deterministic for unit tests (no DOM, no RAF).
//
// Spawn wiring (registry + wave hook) is BOSS-04's job; this file deliberately
// does NOT register itself anywhere.

import {
    initBossPhases,
    updateBossPhases,
    currentPhase,
    isFinalPhase,
} from '../boss-phases.js';
import {
    initBossParts,
    updateBossParts,
    coreBlocksDamage,
    livingPartCount,
} from '../boss-parts.js';
import {
    initBossIntro,
    updateBossIntro,
    initBossDeath,
    updateBossDeath,
} from '../boss-intro.js';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Most of the fight is spent clearing bolts (the core is damage-gated while any
// bolt still shields it), so total kill time = bolt HP across all 3 phases +
// core HP. 6.225.6 — the original 900 core + 60/80/110 bolts made the Harbinger
// read as a slow, low-threat meatbag (~1600 effective HP). Cut both the core and
// the per-phase bolt HP so the core opens up sooner and the fight lands at the
// LOW end of the 45–120s boss-DoD band rather than dragging past it.
export const HARBINGER_MAX_HEALTH = 520;

// Fraction of incoming damage the CORE still takes while bolt-heads shield it.
// 6.225.7 — the old all-or-nothing gate (core fully immune until every bolt was
// cleared) made fire feel wasted; the bolts were also small + fast and hard to
// land shots on. Now the core always bleeds a chip, so every hit registers and
// the boss reads as "taking damage" the whole fight. Clearing the bolts removes
// the penalty (full damage) and shuts off their attacks, so they still matter.
export const HARBINGER_CORE_CHIP = 0.4;

// Bolt-head ring per phase. 6.225.7 — bigger colliders + slower spin so they're
// actually hittable (the collider radius == the rendered radius in boss-render,
// so larger reads bigger AND catches more shots). `speed` is rad/s (boss-parts
// orbit math); alternating sign reads as two counter-rotating sets early,
// tightening to a single ring at enrage.
const PHASE_BOLTS = [
    // Phase 0 — opening: a wide, slow 4-bolt ring.
    { count: 4, radius: 130, hp: 38, speed: 0.4, partRadius: 34 },
    // Phase 1 — mid: 3 bolts, tighter.
    { count: 3, radius: 110, hp: 50, speed: 0.55, partRadius: 36 },
    // Phase 2 — enrage: 2 heavy bolts, counter-spin (still readable).
    { count: 2, radius: 96, hp: 66, speed: 0.8, partRadius: 40 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.6, 0.3];

// Build the rotating bolt-head parts-script for a given phase index. Each bolt
// shields the core and orbits the core centre; phases past 0 alternate spin
// direction so the ring reads as counter-rotating.
function boltScriptForPhase(phaseIdx) {
    const cfg = PHASE_BOLTS[phaseIdx] || PHASE_BOLTS[PHASE_BOLTS.length - 1];
    const bolts = [];
    for (let i = 0; i < cfg.count; i++) {
        const dir = (i % 2 === 0) ? 1 : -1; // counter-rotating pairs
        bolts.push({
            id: `p${phaseIdx}-bolt-${i}`,
            name: `Bolt-Head ${i + 1}`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,
            element: 'KINETIC',
            // Rotating weak-point: evenly spaced around the ring, orbiting.
            orbit: {
                radius: cfg.radius,
                speed: cfg.speed * dir,
                phase: (Math.PI * 2 * i) / cfg.count,
            },
        });
    }
    return bolts;
}

// Re-arm the bolt ring for a phase. Wrapped so phase onEnter handlers (and the
// initial spawn) share one code path. `now` flows through to boss-parts so the
// orbit clock restarts cleanly at each phase.
function armPhaseBolts(boss, phaseIdx, ctx, now) {
    initBossParts(boss, boltScriptForPhase(phaseIdx), ctx, now);
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms that phase's bolt ring; the final phase additionally flips
// the enrage flag. Each handler reads `now` off the boss so the orbit clock
// stays deterministic in tests (boss-phases passes no `now` into onEnter).
export function buildPhaseScript() {
    return [
        {
            id: 'harbinger-p0',
            name: 'Awakening',
            // Phase 0 is the spawn phase; armed by initHarbinger, not here.
            onEnter: () => {},
        },
        {
            id: 'harbinger-p1',
            name: 'Fracture',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => armPhaseBolts(boss, 1, ctx, boss._now || Date.now()),
        },
        {
            id: 'harbinger-p2',
            name: 'Cataclysm',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                armPhaseBolts(boss, 2, ctx, boss._now || Date.now());
                triggerEnrage(boss, ctx);
            },
        },
    ];
}

// ── Enrage (final-phase escalation) ─────────────────────────────────────────
// Latched so it fires exactly once. Bumps fire rate + flags homing so the
// engine-side AI/firing (wired later) can read it; the flag itself is the
// contract the rest of the game keys off.
export function triggerEnrage(boss, _ctx = null) {
    if (!boss || boss._enraged) return false;
    boss._enraged = true;
    boss._enragedAt = boss._now || Date.now();
    // Hooks the engine firing path will honor once spawning lands (BOSS-04+).
    boss.firingCooldownMul = 0.55;
    boss.enableHomingBullets = true;
    return true;
}

export function isEnraged(boss) {
    return !!(boss && boss._enraged);
}

// ── Intro / death sequences (consumed by boss-intro.js) ─────────────────────
export function buildIntroScript() {
    return [
        { id: 'warp-in', name: 'Warp-In', durationMs: 1400 },
        { id: 'name-card', name: 'THE HARBINGER', durationMs: 2000 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'bolts-blow', name: 'Bolt-Heads Detonate', durationMs: 900 },
        { id: 'core-crack', name: 'Core Cracks', durationMs: 1100 },
        { id: 'supernova', name: 'Supernova', durationMs: 1200 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const HARBINGER = {
    id: 'HARBINGER',
    name: 'THE HARBINGER',
    stage: 1,           // appears from stage 1 (tier 1-3 band)
    tierBand: [1, 3],
    element: 'KINETIC',
    maxHealth: HARBINGER_MAX_HEALTH,
    size: 96,
    color: '#dfe7f0',   // KINETIC tint (matches ELEMENTS.KINETIC.color)
    glowColor: '#aebed4',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    boltScriptForPhase,
    initBoss: initHarbinger,
    updateBoss: updateHarbinger,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the phase script, the phase-0 bolt ring, and
// the intro sequence. Death is armed lazily by tickHarbingerDeath / armDeath.
export function initHarbinger(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = HARBINGER.id;
    boss.name = HARBINGER.name;
    boss.element = HARBINGER.element;
    boss.maxHealth = HARBINGER.maxHealth;
    boss.health = HARBINGER.maxHealth;
    boss.size = boss.size || HARBINGER.size;
    // Core bleeds a chip of damage even while shielded (see HARBINGER_CORE_CHIP).
    // The collision damage path reads this off the boss; absent/0 on other bosses
    // means they keep the full hard gate.
    boss.coreChipFactor = HARBINGER_CORE_CHIP;
    boss._enraged = false;
    boss._now = now;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhaseBolts(boss, 0, ctx, now);          // phase-0 bolt ring
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, and phases (in that order) with one
// shared `now`. Stashes `now` on the boss so phase onEnter handlers can restart
// the orbit clock deterministically. Returns whether the core is currently
// killable (no shielding bolts + not phase-transition invuln is handled by the
// caller's damage pipeline; this is the parts gate only).
export function updateHarbinger(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateBossPhases(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the CORE (all this phase's bolts are
// down). Bolts always reachable regardless. Mirrors boss-parts' coreBlocksDamage
// but framed positively for the firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function harbingerCurrentPhase(boss) {
    return currentPhase(boss);
}
export function harbingerLivingBolts(boss) {
    return livingPartCount(boss);
}
export function harbingerIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss.
export function armHarbingerDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickHarbingerDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default HARBINGER;
