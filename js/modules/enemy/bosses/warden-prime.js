// THE WARDEN PRIME — stage 8-24 boss (BOSS-12).
//
// The anti-meta wall. A heavy adaptive core ringed by SHIELD-NODE weak-points,
// built around the WARDEN enemy's ADAPTIVE RESIST idea scaled up to a boss: the
// Prime tracks the element you keep hitting it with over a sliding window and
// RAISES its resistance to your most-used element while leaving the others low —
// so a one-element build walls itself and you are forced to ROTATE. Its
// signature attack is the ADAPTIVE PURGE: a telegraphed sweep on a cadence that,
// when it fires, RESETS the learned resists and SPIKES a fresh adaptation to
// whatever you've been spamming — punishing tunnel-vision twice. Three HP-gated
// phases (the shield-node ring re-arms fewer/tougher each phase) and a final
// phase ENRAGE (faster purge cadence + sharper, stickier adaptation).
//
// SELF-CONTAINED + PURE: this module is data + a thin driver over the SHIPPED
// boss chassis cores — it never touches them and adds no engine deps. It owns:
//   • a phase-script consumed by boss-phases.js   (HP-gated, 3 phases)
//   • per-phase parts-scripts consumed by boss-parts.js (orbiting shield nodes,
//     re-armed on each phase enter so the core re-shields)
//   • an ADAPTIVE PURGE cadence driver (wind-up telegraph → fire), advanced
//     per-frame with the same explicit `now` as the chassis, so it stays
//     deterministic in tests (no DOM, no RAF)
//   • a sliding-window ADAPTIVE RESIST model (recordElementHit / wardenResist),
//     pure functions over `boss._adapt`, mirroring the WARDEN enemy's adapt loop
//   • intro + death sequences consumed by boss-intro.js
// Everything is driven through the chassis' public API with an explicit `now`,
// so the whole boss is headless + deterministic for unit tests.
//
// Spawn wiring (registry + wave hook) is BOSS-04's job; this file deliberately
// does NOT register itself anywhere. It also does NOT edit the WARDEN enemy or
// the shipped elements.js — the adapt model here is a self-contained re-implement
// of the same idea, scoped to this boss.

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
import { drawWardenPrime } from './render/warden-prime-render.js';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Most of the fight is spent clearing shield nodes (the core is gated while they
// live) AND rotating elements past the adaptive wall. HP cut ~35% (1500 → 980) —
// core + per-phase nodes both trimmed — for shorter, snappier boss fights that
// don't drag.
export const WARDEN_PRIME_MAX_HEALTH = 980;

// Shield-node ring per phase: fewer nodes but tougher + faster spin each phase.
// `speed` is rad/s (boss-parts orbit math); alternating sign reads as two
// counter-rotating sets early, tightening to a single fast ring at enrage.
const PHASE_NODES = [
    // Phase 0 — opening: a wide, slow 5-node lattice.
    { count: 5, radius: 155, hp: 45, speed: 0.5, partRadius: 20 },
    // Phase 1 — mid: 4 nodes, tighter + faster.
    { count: 4, radius: 130, hp: 60, speed: 0.95, partRadius: 22 },
    // Phase 2 — enrage: 3 heavy nodes, fast counter-spin.
    { count: 3, radius: 105, hp: 85, speed: 1.5, partRadius: 24 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.62, 0.3];

// ── ADAPTIVE RESIST model (sliding window over recent element usage) ─────────
// The WARDEN enemy bumps a resist toward a cap on every same-element hit and
// decays when you stop. The Prime scales that to a window: it remembers the last
// N element hits and resists the MOST-USED element in that window (and only that
// one strongly), so a build that spams one element walls itself while every
// other element stays cheap — forcing a rotation. State lives on `boss._adapt`:
//   { window: [el, el, ...], cap, perHitStep, windowSize }
// `recordElementHit` pushes a hit (trimming the window); `wardenResist` derives
// the live resist for an element from the window contents — PURE w.r.t. the
// window, so a test can feed a sequence and assert the spammed element climbs
// while others stay near zero.

// Known elements the Prime can adapt to (matches elements.js taxonomy, but kept
// local so this module owns no shipped-core dependency).
export const WARDEN_ELEMENTS = ['KINETIC', 'PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID', 'RADIANT'];

const ADAPT_WINDOW_SIZE = 8;   // how many recent hits the wall "remembers"
const ADAPT_PER_HIT_STEP = 0.12; // resist gained per window-hit of an element
const ADAPT_CAP = 0.75;        // hard ceiling on a single adapted resist
const ENRAGE_ADAPT_STEP_MUL = 1.5; // final phase: adaptation bites harder/faster
const ENRAGE_ADAPT_CAP = 0.9;      // final phase: a higher wall

function initAdapt(boss) {
    boss._adapt = {
        window: [],
        windowSize: ADAPT_WINDOW_SIZE,
        perHitStep: ADAPT_PER_HIT_STEP,
        cap: ADAPT_CAP,
    };
}

/**
 * Record that the player just hit the Prime with `element`. Pushes onto the
 * sliding window (oldest hits fall off once it's full). PURE over `boss._adapt`
 * — no DOM, no timers — so a test can feed a deterministic sequence. No-op for
 * an unknown element or an uninitialised boss.
 */
export function recordElementHit(boss, element) {
    if (!boss || !element) return false;
    if (!boss._adapt) initAdapt(boss);
    if (!WARDEN_ELEMENTS.includes(element)) return false;
    const st = boss._adapt;
    st.window.push(element);
    if (st.window.length > st.windowSize) {
        st.window.splice(0, st.window.length - st.windowSize);
    }
    return true;
}

/**
 * The Prime's CURRENT resist to `element`, derived from the sliding window:
 * resist scales with how many of the last `windowSize` hits used this element,
 * clamped to the cap. An element you barely use stays near 0 (cheap); the one
 * you spam climbs toward the cap (the wall). Returns a number in [0, cap].
 * PURE over `boss._adapt`.
 */
export function wardenResist(boss, element) {
    if (!boss || !boss._adapt || !element) return 0;
    const st = boss._adapt;
    let count = 0;
    for (const e of st.window) if (e === element) count += 1;
    if (count <= 0) return 0;
    return Math.min(st.cap, count * st.perHitStep);
}

/** The element the Prime is currently MOST resistant to (the live wall), or null. */
export function wardenMostResistedElement(boss) {
    if (!boss || !boss._adapt) return null;
    let best = null;
    let bestR = 0;
    for (const el of WARDEN_ELEMENTS) {
        const r = wardenResist(boss, el);
        if (r > bestR) { bestR = r; best = el; }
    }
    return best;
}

/**
 * Live resist MAP (only the non-zero entries) for the renderer / damage path to
 * read — mirrors the shape the collision pipeline already understands. Derived
 * fresh from the window each call; never stored as a fixed profile.
 */
export function wardenResistMap(boss) {
    const map = {};
    if (!boss || !boss._adapt) return map;
    for (const el of WARDEN_ELEMENTS) {
        const r = wardenResist(boss, el);
        if (r > 0) map[el] = r;
    }
    return map;
}

// Build the orbiting shield-node parts-script for a given phase index. Each node
// shields the core and orbits the core centre; phases past 0 alternate spin
// direction so the ring reads as counter-rotating.
function nodeScriptForPhase(phaseIdx) {
    const cfg = PHASE_NODES[phaseIdx] || PHASE_NODES[PHASE_NODES.length - 1];
    const nodes = [];
    for (let i = 0; i < cfg.count; i++) {
        const dir = (i % 2 === 0) ? 1 : -1; // counter-rotating pairs
        nodes.push({
            id: `p${phaseIdx}-node-${i}`,
            name: `Shield Node ${i + 1}`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,        // core invuln while this node lives
            element: 'VOID',          // the Prime's defensive tint (adaptive core)
            orbit: {
                radius: cfg.radius,
                speed: cfg.speed * dir,
                phase: (Math.PI * 2 * i) / cfg.count,
            },
        });
    }
    return nodes;
}

// Re-arm the node ring for a phase. Wrapped so phase onEnter handlers (and the
// initial spawn) share one code path. `now` flows through to boss-parts so the
// orbit clock restarts cleanly at each phase.
function armPhaseNodes(boss, phaseIdx, ctx, now) {
    initBossParts(boss, nodeScriptForPhase(phaseIdx), ctx, now);
}

// ── ADAPTIVE PURGE (telegraphed sweep on a cadence) ──────────────────────────
// A self-contained timing driver, separate from the chassis, advanced per-frame
// with the shared `now`. State lives on `boss._purge`:
//   { nextTelegraphAt, fireAt, telegraph, fireCount }
// Cycle: COOLDOWN → (now >= nextTelegraphAt) latch telegraph + schedule fireAt
//        → (now >= fireAt) FIRE. On FIRE the Prime PURGES its learned resists
//        (clears the window) then SPIKES a fresh adaptation to the element the
//        player has been spamming most — so the purge both punishes the current
//        meta AND immediately re-walls it. The telegraph flag
//        (`boss.purgeTelegraph`) is the contract the renderer / firing code keys
//        off; the unit test asserts the telegraph→fire transition + the spike.
const PURGE_WINDUP_MS = 1300;     // telegraph wind-up before the sweep lands
const PURGE_COOLDOWN_MS = 5000;   // gap between a fire and the next telegraph
const ENRAGE_CADENCE_MUL = 0.6;   // final phase: faster purge cadence

function purgeCadenceMul(boss) {
    return boss && boss._enraged ? ENRAGE_CADENCE_MUL : 1;
}

function initPurge(boss, now) {
    boss._purge = {
        // First telegraph after one cooldown so the fight doesn't open mid-sweep.
        nextTelegraphAt: now + PURGE_COOLDOWN_MS,
        fireAt: 0,
        telegraph: false,
        fireCount: 0,
        lastFireAt: 0,
    };
    boss.purgeTelegraph = false;
}

// On FIRE: reset the learned wall, then re-spike to the player's current
// most-used element so the adaptation snaps back fresh + sticky (a full window's
// worth of that element). No-op if the player hasn't hit anything yet.
function applyPurge(boss) {
    if (!boss || !boss._adapt) return;
    const st = boss._adapt;
    // The element the player leaned on hardest this cycle (before we reset).
    const target = mostUsedElement(boss);
    // PURGE: wipe the learned resists.
    st.window = [];
    // Final phase: a harsher, stickier wall.
    if (boss._enraged) {
        st.perHitStep = ADAPT_PER_HIT_STEP * ENRAGE_ADAPT_STEP_MUL;
        st.cap = ENRAGE_ADAPT_CAP;
    }
    // SPIKE: re-seed a full window of the spammed element so the wall is
    // instantly high again — the player can't just keep spamming through it.
    if (target) {
        for (let i = 0; i < st.windowSize; i++) st.window.push(target);
    }
}

// The element with the most hits in the current window (the live "meta"), or
// null on an empty window. Ties resolve to the first element in WARDEN_ELEMENTS.
function mostUsedElement(boss) {
    if (!boss || !boss._adapt || boss._adapt.window.length === 0) return null;
    const counts = {};
    for (const e of boss._adapt.window) counts[e] = (counts[e] || 0) + 1;
    let best = null;
    let bestC = 0;
    for (const el of WARDEN_ELEMENTS) {
        const c = counts[el] || 0;
        if (c > bestC) { bestC = c; best = el; }
    }
    return best;
}

// Advance the ADAPTIVE PURGE cadence. Returns 'telegraph' or 'fire' on the frame
// an edge happens (for FX hooks), else null. Pure timing — no DOM.
function updatePurge(boss, ctx, now) {
    const st = boss && boss._purge;
    if (!st) return null;
    const mul = purgeCadenceMul(boss);
    // FIRE edge: telegraph wound up and its fire time has arrived.
    if (st.telegraph && now >= st.fireAt) {
        st.telegraph = false;
        boss.purgeTelegraph = false;
        st.fireCount += 1;
        st.lastFireAt = now;
        st.nextTelegraphAt = now + PURGE_COOLDOWN_MS * mul;
        applyPurge(boss);
        return 'fire';
    }
    // TELEGRAPH edge: cooldown elapsed → start the wind-up.
    if (!st.telegraph && now >= st.nextTelegraphAt) {
        st.telegraph = true;
        boss.purgeTelegraph = true;
        st.fireAt = now + PURGE_WINDUP_MS * mul;
        return 'telegraph';
    }
    return null;
}

export function isPurgeTelegraphing(boss) {
    return !!(boss && boss.purgeTelegraph);
}
export function purgeFireCount(boss) {
    return (boss && boss._purge) ? boss._purge.fireCount : 0;
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms that phase's node ring; the final phase additionally flips
// the enrage flag. Each handler reads `now` off the boss so the orbit + cadence
// clocks stay deterministic in tests (boss-phases passes no `now` into onEnter).
export function buildPhaseScript() {
    return [
        {
            id: 'warden-prime-p0',
            name: 'Assess',
            // Phase 0 is the spawn phase; armed by initWardenPrime, not here.
            onEnter: () => {},
        },
        {
            id: 'warden-prime-p1',
            name: 'Recalibrate',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => armPhaseNodes(boss, 1, ctx, boss._now || Date.now()),
        },
        {
            id: 'warden-prime-p2',
            name: 'Total Lockdown',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                armPhaseNodes(boss, 2, ctx, boss._now || Date.now());
                triggerEnrage(boss, ctx);
            },
        },
    ];
}

// ── Enrage (final-phase escalation) ─────────────────────────────────────────
// Latched so it fires exactly once. Tightens the PURGE cadence, sharpens the
// adaptation (bigger per-hit step + higher cap, applied to the live model), bumps
// fire rate + flags homing so the engine-side AI/firing (wired later) can read
// it; the flags themselves are the contract the rest of the game keys off.
export function triggerEnrage(boss, _ctx = null) {
    if (!boss || boss._enraged) return false;
    boss._enraged = true;
    boss._enragedAt = boss._now || Date.now();
    // Sharper, stickier adaptive wall in the final phase.
    if (boss._adapt) {
        boss._adapt.perHitStep = ADAPT_PER_HIT_STEP * ENRAGE_ADAPT_STEP_MUL;
        boss._adapt.cap = ENRAGE_ADAPT_CAP;
    }
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
        { id: 'lockdown', name: 'Lockdown', durationMs: 1500 },
        { id: 'name-card', name: 'THE WARDEN PRIME', durationMs: 2200 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'nodes-fail', name: 'Shield Nodes Fail', durationMs: 900 },
        { id: 'wall-collapse', name: 'Adaptive Wall Collapses', durationMs: 1100 },
        { id: 'core-meltdown', name: 'Core Meltdown', durationMs: 1300 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const WARDEN_PRIME = {
    id: 'WARDEN_PRIME',
    name: 'THE WARDEN PRIME',
    stage: 8,            // appears from stage 8 (tier 8-24 band)
    tierBand: [8, 24],
    element: 'VOID',     // adaptive/defensive core tint
    maxHealth: WARDEN_PRIME_MAX_HEALTH,
    size: 112,
    color: '#cfa8ff',    // matches the WARDEN enemy's adaptive violet
    glowColor: '#e0c8ff',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    draw: drawWardenPrime,         // 9.1.x per-boss custom renderer (panopticon)
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    nodeScriptForPhase,
    initBoss: initWardenPrime,
    updateBoss: updateWardenPrime,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the adaptive-resist model, the phase script,
// the phase-0 node ring, the ADAPTIVE PURGE cadence, and the intro sequence.
// Death is armed lazily by tickWardenPrimeDeath / armWardenPrimeDeath.
export function initWardenPrime(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = WARDEN_PRIME.id;
    boss.name = WARDEN_PRIME.name;
    boss.element = WARDEN_PRIME.element;
    boss.adaptive = true;
    boss.maxHealth = WARDEN_PRIME.maxHealth;
    boss.health = WARDEN_PRIME.maxHealth;
    boss.size = boss.size || WARDEN_PRIME.size;
    boss._enraged = false;
    boss._now = now;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initAdapt(boss);                            // adaptive resist starts empty
    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhaseNodes(boss, 0, ctx, now);           // phase-0 node ring
    initPurge(boss, now);                       // arm the ADAPTIVE PURGE cadence
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, phases, then the ADAPTIVE PURGE cadence
// (in that order) with one shared `now`. Stashes `now` on the boss so phase
// onEnter handlers can restart the orbit/cadence clocks deterministically.
// Returns whether the core is currently killable (no shielding nodes); the
// caller's damage pipeline ORs in phase-transition + intro invuln.
export function updateWardenPrime(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateBossPhases(boss, ctx, now);
    updatePurge(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the CORE (all this phase's nodes are
// down). Nodes always reachable regardless. Mirrors boss-parts' coreBlocksDamage
// but framed positively for the firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function wardenPrimeCurrentPhase(boss) {
    return currentPhase(boss);
}
export function wardenPrimeLivingNodes(boss) {
    return livingPartCount(boss);
}
export function wardenPrimeIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss.
export function armWardenPrimeDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickWardenPrimeDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default WARDEN_PRIME;
