// LUMEN THE PRISM SOVEREIGN — stage 3-9 boss (BOSS-07).
//
// A radiant fight built on light + refraction. RADIANT element. The Sovereign's
// core hides behind a RING OF SHIELD DRONES — orbiting weak-points that shield
// (conceptually reflect/refract) the core. While any drone lives the core is
// invulnerable, so the player must clear the ring to open a firing window. Each
// phase re-arms a FRESH drone set: fewer drones, but tougher + faster, so the
// window opens slower as the fight escalates. The signature attack is
// DISJUNCTION — a telegraphed PURGE-style sweep that winds up (drones flare, a
// telegraph flag latches) and then FIRES on a cadence. The final phase enrages:
// faster cadence, homing fire.
//
// SELF-CONTAINED + PURE: this module is data + a thin driver over the SHIPPED
// boss chassis cores — it never touches them and adds no engine deps. It owns:
//   • a phase-script consumed by boss-phases.js   (HP-gated, 3 phases)
//   • per-phase parts-scripts consumed by boss-parts.js (orbiting shield drones,
//     re-armed on each phase enter so the core re-shields)
//   • a DISJUNCTION cadence driver (wind-up telegraph → fire), advanced per-frame
//     with the same explicit `now` as the chassis, so it stays deterministic
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
import { drawLumen } from './render/lumen-render.js';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Most of the fight is spent clearing drones (the core is gated while they
// live). HP cut ~35% (1100 → 720) — core + per-phase drones both trimmed — for
// shorter, snappier boss fights that don't drag.
export const LUMEN_MAX_HEALTH = 720;

// Shield-drone ring per phase: fewer drones but tougher + faster spin each
// phase. `speed` is rad/s (boss-parts orbit math); alternating sign reads as two
// counter-rotating sets early, tightening to a single fast ring at enrage.
const PHASE_DRONES = [
    // Phase 0 — opening: a wide, slow 6-drone prism ring.
    { count: 6, radius: 150, hp: 35, speed: 0.5, partRadius: 18 },
    // Phase 1 — mid: 4 drones, tighter + faster.
    { count: 4, radius: 125, hp: 50, speed: 0.9, partRadius: 20 },
    // Phase 2 — enrage: 3 heavy drones, fast counter-spin.
    { count: 3, radius: 100, hp: 75, speed: 1.5, partRadius: 22 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.65, 0.3];

// DISJUNCTION cadence (ms). Each cycle: a `windupMs` telegraph (drones flare,
// the telegraph flag latches) then an instantaneous FIRE, then the cooldown to
// the next telegraph. Enrage tightens the cadence (see ENRAGE_CADENCE_MUL).
const DISJUNCTION_WINDUP_MS = 1200;
const DISJUNCTION_COOLDOWN_MS = 4500; // gap between fire and next telegraph
const ENRAGE_CADENCE_MUL = 0.6;       // final phase: faster cadence

// Build the orbiting shield-drone parts-script for a given phase index. Each
// drone shields the core and orbits the core centre; phases past 0 alternate
// spin direction so the ring reads as counter-rotating.
function droneScriptForPhase(phaseIdx) {
    const cfg = PHASE_DRONES[phaseIdx] || PHASE_DRONES[PHASE_DRONES.length - 1];
    const drones = [];
    for (let i = 0; i < cfg.count; i++) {
        const dir = (i % 2 === 0) ? 1 : -1; // counter-rotating pairs
        drones.push({
            id: `p${phaseIdx}-drone-${i}`,
            name: `Shield Drone ${i + 1}`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,        // core reflects/blocks while this drone lives
            element: 'RADIANT',
            // Orbiting weak-point: evenly spaced around the ring.
            orbit: {
                radius: cfg.radius,
                speed: cfg.speed * dir,
                phase: (Math.PI * 2 * i) / cfg.count,
            },
        });
    }
    return drones;
}

// Re-arm the drone ring for a phase. Wrapped so phase onEnter handlers (and the
// initial spawn) share one code path. `now` flows through to boss-parts so the
// orbit clock restarts cleanly at each phase.
function armPhaseDrones(boss, phaseIdx, ctx, now) {
    initBossParts(boss, droneScriptForPhase(phaseIdx), ctx, now);
}

// ── DISJUNCTION (telegraphed PURGE-style sweep on a cadence) ─────────────────
// A self-contained timing driver, separate from the chassis, advanced per-frame
// with the shared `now`. State lives on `boss._disjunction`:
//   { nextTelegraphAt, fireAt, telegraph, fireCount }
// Cycle: COOLDOWN → (now >= nextTelegraphAt) latch telegraph + schedule fireAt
//        → (now >= fireAt) FIRE (clear telegraph, bump count, schedule next).
// The telegraph flag (`boss.disjunctionTelegraph`) is the contract the renderer
// / firing code keys off; the unit test asserts the telegraph→fire transition.
function disjunctionCadenceMs(boss) {
    return boss && boss._enraged ? ENRAGE_CADENCE_MUL : 1;
}

function initDisjunction(boss, now) {
    boss._disjunction = {
        // First telegraph after one cooldown so the fight doesn't open mid-sweep.
        nextTelegraphAt: now + DISJUNCTION_COOLDOWN_MS,
        fireAt: 0,
        telegraph: false,
        fireCount: 0,
    };
    boss.disjunctionTelegraph = false;
}

// Advance the DISJUNCTION cadence. Returns 'telegraph' or 'fire' on the frame an
// edge happens (for FX hooks), else null. Pure timing — no DOM.
function updateDisjunction(boss, ctx, now) {
    const st = boss && boss._disjunction;
    if (!st) return null;
    const mul = disjunctionCadenceMs(boss);
    // FIRE edge: telegraph wound up and its fire time has arrived.
    if (st.telegraph && now >= st.fireAt) {
        st.telegraph = false;
        boss.disjunctionTelegraph = false;
        st.fireCount += 1;
        st.lastFireAt = now;
        st.nextTelegraphAt = now + DISJUNCTION_COOLDOWN_MS * mul;
        return 'fire';
    }
    // TELEGRAPH edge: cooldown elapsed → start the wind-up.
    if (!st.telegraph && now >= st.nextTelegraphAt) {
        st.telegraph = true;
        boss.disjunctionTelegraph = true;
        st.fireAt = now + DISJUNCTION_WINDUP_MS * mul;
        return 'telegraph';
    }
    return null;
}

export function isDisjunctionTelegraphing(boss) {
    return !!(boss && boss.disjunctionTelegraph);
}
export function disjunctionFireCount(boss) {
    return (boss && boss._disjunction) ? boss._disjunction.fireCount : 0;
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms that phase's drone ring; the final phase additionally flips
// the enrage flag. Each handler reads `now` off the boss so the orbit + cadence
// clocks stay deterministic in tests (boss-phases passes no `now` into onEnter).
export function buildPhaseScript() {
    return [
        {
            id: 'lumen-p0',
            name: 'Refraction',
            // Phase 0 is the spawn phase; armed by initLumen, not here.
            onEnter: () => {},
        },
        {
            id: 'lumen-p1',
            name: 'Dispersion',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => armPhaseDrones(boss, 1, ctx, boss._now || Date.now()),
        },
        {
            id: 'lumen-p2',
            name: 'Total Internal Reflection',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                armPhaseDrones(boss, 2, ctx, boss._now || Date.now());
                triggerEnrage(boss, ctx);
            },
        },
    ];
}

// ── Enrage (final-phase escalation) ─────────────────────────────────────────
// Latched so it fires exactly once. Tightens the DISJUNCTION cadence, bumps fire
// rate + flags homing so the engine-side AI/firing (wired later) can read it;
// the flags themselves are the contract the rest of the game keys off.
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
        { id: 'prism-bloom', name: 'Prism Bloom', durationMs: 1500 },
        { id: 'name-card', name: 'LUMEN THE PRISM SOVEREIGN', durationMs: 2200 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'drones-shatter', name: 'Drones Shatter', durationMs: 900 },
        { id: 'core-fracture', name: 'Prism Fractures', durationMs: 1100 },
        { id: 'white-out', name: 'White-Out', durationMs: 1300 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const LUMEN = {
    id: 'LUMEN',
    name: 'LUMEN THE PRISM SOVEREIGN',
    stage: 3,           // appears from stage 3 (tier 3-9 band)
    tierBand: [3, 9],
    element: 'RADIANT',
    maxHealth: LUMEN_MAX_HEALTH,
    size: 104,
    color: '#ffee88',   // RADIANT tint (matches ELEMENTS.RADIANT.color)
    glowColor: '#fff6c0',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    draw: drawLumen,         // 9.1.x per-boss custom renderer (cathedral lens-array)
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    droneScriptForPhase,
    initBoss: initLumen,
    updateBoss: updateLumen,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the phase script, the phase-0 drone ring, the
// DISJUNCTION cadence, and the intro sequence. Death is armed lazily by
// tickLumenDeath / armLumenDeath.
export function initLumen(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = LUMEN.id;
    boss.name = LUMEN.name;
    boss.element = LUMEN.element;
    boss.maxHealth = LUMEN.maxHealth;
    boss.health = LUMEN.maxHealth;
    boss.size = boss.size || LUMEN.size;
    boss._enraged = false;
    boss._now = now;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhaseDrones(boss, 0, ctx, now);          // phase-0 drone ring
    initDisjunction(boss, now);                 // arm the DISJUNCTION cadence
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, phases, then the DISJUNCTION cadence
// (in that order) with one shared `now`. Stashes `now` on the boss so phase
// onEnter handlers can restart the orbit/cadence clocks deterministically.
// Returns whether the core is currently killable (no shielding drones); the
// caller's damage pipeline ORs in phase-transition + intro invuln.
export function updateLumen(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateBossPhases(boss, ctx, now);
    updateDisjunction(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the CORE (all this phase's drones are
// down). Drones always reachable regardless. Mirrors boss-parts' coreBlocksDamage
// but framed positively for the firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function lumenCurrentPhase(boss) {
    return currentPhase(boss);
}
export function lumenLivingDrones(boss) {
    return livingPartCount(boss);
}
export function lumenIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss.
export function armLumenDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickLumenDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default LUMEN;
