// MAELSTROM THE STORM CROWN — stage 5-15 boss (BOSS-09).
//
// A VOLT boss built on the SHIPPED chassis, mirroring THE HARBINGER's shape:
// data + a thin, pure driver over boss-phases / boss-parts / boss-intro. It owns
// no engine deps and never touches the cores. What makes Maelstrom *Maelstrom*:
//
//   • CONDUIT NODES — the core is ringed by charged nodes (shieldsCore:true).
//     While any node lives the core is invulnerable, so the player must clear
//     the ring to open a core-damage window. Each phase re-arms a fresh, leaner
//     ring (fewer / tougher / faster-orbiting nodes) and the final phase enrages.
//
//   • CONDUCT RAIN — a telegraphed area attack on a cadence. A pure, now-driven
//     state machine cycles IDLE → TELEGRAPH (wind-up) → FIRE → cooldown → IDLE,
//     re-armed per phase with a tighter cadence each time. The telegraph is the
//     contract the rest of the game (and the unit test) keys off; the actual
//     bullet pattern is the engine's job once spawning lands.
//
// SELF-CONTAINED + PURE + HEADLESS: everything is driven through the chassis'
// public API with an explicit `now`, so the whole boss is deterministic in unit
// tests (no DOM, no RAF). Spawn wiring (registry + wave hook) is BOSS-04's job;
// this file deliberately does NOT register itself anywhere.

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
import { drawMaelstrom } from './render/maelstrom-render.js';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Most of the fight is spent clearing conduit nodes (the core is gated while
// they live). HP cut ~35% (1100 → 720) — core + per-phase nodes both trimmed —
// for shorter, snappier boss fights that don't drag.
export const MAELSTROM_MAX_HEALTH = 720;

// Conduit-node ring per phase: fewer nodes but tougher + faster orbit each
// phase. `speed` is rad/s (boss-parts orbit math); alternating sign reads as two
// counter-rotating arcs early, tightening to a single fast crown at enrage.
const PHASE_NODES = [
    // Phase 0 — opening: a wide, slow 5-node crown.
    { count: 5, radius: 140, hp: 35, speed: 0.5, partRadius: 20 },
    // Phase 1 — mid: 4 nodes, tighter + faster.
    { count: 4, radius: 116, hp: 50, speed: 0.9, partRadius: 20 },
    // Phase 2 — enrage: 3 heavy nodes, fast counter-spin.
    { count: 3, radius: 94, hp: 70, speed: 1.5, partRadius: 22 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.6, 0.3];

// CONDUCT-rain cadence per phase (ms). The wind-up TELEGRAPH gives the player
// warning; FIRE is the strike window; then a cooldown back to IDLE. Each phase
// shortens the cooldown (rain comes faster) — the enrage phase is relentless.
const PHASE_RAIN = [
    // Phase 0 — telegraph long, rain rarely.
    { telegraphMs: 1600, fireMs: 600, cooldownMs: 4200 },
    // Phase 1 — quicker wind-up, more frequent.
    { telegraphMs: 1300, fireMs: 600, cooldownMs: 3200 },
    // Phase 2 — enrage: snap telegraph, relentless.
    { telegraphMs: 900, fireMs: 700, cooldownMs: 2200 },
];

export const RAIN_IDLE = 'IDLE';
export const RAIN_TELEGRAPH = 'TELEGRAPH';
export const RAIN_FIRE = 'FIRE';

// Build the conduit-node parts-script for a given phase index. Each node shields
// the core and orbits the core centre; phases alternate spin direction so the
// crown reads as counter-rotating. Destroying nodes (ideally in sequence) is
// what opens the core-damage window.
export function nodeScriptForPhase(phaseIdx) {
    const cfg = PHASE_NODES[phaseIdx] || PHASE_NODES[PHASE_NODES.length - 1];
    const nodes = [];
    for (let i = 0; i < cfg.count; i++) {
        const dir = (i % 2 === 0) ? 1 : -1; // counter-rotating arcs
        nodes.push({
            id: `p${phaseIdx}-node-${i}`,
            name: `Conduit Node ${i + 1}`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,
            element: 'VOLT',
            // Rotating weak-point: evenly spaced around the crown, orbiting.
            orbit: {
                radius: cfg.radius,
                speed: cfg.speed * dir,
                phase: (Math.PI * 2 * i) / cfg.count,
            },
            // Sequence ordering hint for the renderer / AI (lit in this order).
            sequenceIndex: i,
        });
    }
    return nodes;
}

// Re-arm the conduit ring for a phase. Wrapped so phase onEnter handlers (and the
// initial spawn) share one code path. `now` flows through to boss-parts so the
// orbit clock restarts cleanly at each phase.
function armPhaseNodes(boss, phaseIdx, ctx, now) {
    initBossParts(boss, nodeScriptForPhase(phaseIdx), ctx, now);
}

// ── CONDUCT rain (telegraphed area attack) ──────────────────────────────────
// A pure state machine on `boss.conductRainTelegraph` / `boss.conductRain`,
// advanced purely by elapsed `now`. Re-armed per phase (the cooldown/telegraph
// cadence tightens). The boss's own update calls updateConductRain each frame.
//
// Cycle: IDLE --(cooldown)--> TELEGRAPH (wind-up) --(telegraphMs)--> FIRE
//        --(fireMs)--> IDLE (cooldown) ...
// Exposed flags the engine + the unit test read:
//   boss.conductRain.state                 — RAIN_IDLE | RAIN_TELEGRAPH | RAIN_FIRE
//   boss.conductRainTelegraph              — true during the wind-up window
//   boss.conductRainFiring                 — true during the strike window
//   boss.conductRain.strikes               — count of completed strikes (FIRE entries)
export function armConductRain(boss, phaseIdx, now) {
    const cfg = PHASE_RAIN[phaseIdx] || PHASE_RAIN[PHASE_RAIN.length - 1];
    boss.conductRain = {
        phaseIdx,
        telegraphMs: cfg.telegraphMs,
        fireMs: cfg.fireMs,
        cooldownMs: cfg.cooldownMs,
        state: RAIN_IDLE,
        // First wind-up begins after the initial cooldown.
        nextAt: now + cfg.cooldownMs,
        strikes: 0,
    };
    boss.conductRainTelegraph = false;
    boss.conductRainFiring = false;
    return true;
}

// Advance the CONDUCT-rain state machine. Pure + deterministic on `now`; resolves
// any number of transitions crossed in a single frame (so a big `now` jump still
// lands in a consistent state). No-op while the boss is mid-intro / dying.
export function updateConductRain(boss, now) {
    const r = boss && boss.conductRain;
    if (!r) return;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return;

    let guard = 0;
    while (now >= r.nextAt && guard++ < 8) {
        if (r.state === RAIN_IDLE) {
            // Cooldown elapsed → begin the telegraph wind-up.
            r.state = RAIN_TELEGRAPH;
            r.nextAt += r.telegraphMs;
        } else if (r.state === RAIN_TELEGRAPH) {
            // Wind-up elapsed → strike.
            r.state = RAIN_FIRE;
            r.strikes += 1;
            r.nextAt += r.fireMs;
        } else { // RAIN_FIRE
            // Strike done → back to idle for the cooldown.
            r.state = RAIN_IDLE;
            r.nextAt += r.cooldownMs;
        }
    }
    boss.conductRainTelegraph = (r.state === RAIN_TELEGRAPH);
    boss.conductRainFiring = (r.state === RAIN_FIRE);
}

export function conductRainState(boss) {
    return (boss && boss.conductRain) ? boss.conductRain.state : RAIN_IDLE;
}
export function isConductRainTelegraphing(boss) {
    return !!(boss && boss.conductRainTelegraph);
}
export function isConductRainFiring(boss) {
    return !!(boss && boss.conductRainFiring);
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms that phase's conduit ring + tightens the CONDUCT-rain cadence;
// the final phase additionally flips the enrage flag. Each handler reads `now`
// off the boss so the orbit/rain clocks stay deterministic in tests (boss-phases
// passes no `now` into onEnter).
export function buildPhaseScript() {
    return [
        {
            id: 'maelstrom-p0',
            name: 'Gathering Storm',
            // Phase 0 is the spawn phase; armed by initMaelstrom, not here.
            onEnter: () => {},
        },
        {
            id: 'maelstrom-p1',
            name: 'Tempest',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => {
                const now = boss._now || Date.now();
                armPhaseNodes(boss, 1, ctx, now);
                armConductRain(boss, 1, now);
            },
        },
        {
            id: 'maelstrom-p2',
            name: 'Storm Crown',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                const now = boss._now || Date.now();
                armPhaseNodes(boss, 2, ctx, now);
                armConductRain(boss, 2, now);
                triggerEnrage(boss, ctx);
            },
        },
    ];
}

// ── Enrage (final-phase escalation) ─────────────────────────────────────────
// Latched so it fires exactly once. Bumps fire rate + flags chain-lightning so
// the engine-side AI/firing (wired later) can read it; the flag itself is the
// contract the rest of the game keys off.
export function triggerEnrage(boss, _ctx = null) {
    if (!boss || boss._enraged) return false;
    boss._enraged = true;
    boss._enragedAt = boss._now || Date.now();
    // Hooks the engine firing path will honor once spawning lands (BOSS-04+).
    boss.firingCooldownMul = 0.5;
    boss.enableChainLightning = true;
    return true;
}

export function isEnraged(boss) {
    return !!(boss && boss._enraged);
}

// ── Intro / death sequences (consumed by boss-intro.js) ─────────────────────
export function buildIntroScript() {
    return [
        { id: 'warp-in', name: 'Warp-In', durationMs: 1400 },
        { id: 'name-card', name: 'MAELSTROM THE STORM CROWN', durationMs: 2200 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'nodes-discharge', name: 'Conduit Nodes Discharge', durationMs: 900 },
        { id: 'crown-collapse', name: 'Crown Collapses', durationMs: 1100 },
        { id: 'storm-burst', name: 'Storm Burst', durationMs: 1300 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const MAELSTROM = {
    id: 'MAELSTROM',
    name: 'MAELSTROM THE STORM CROWN',
    stage: 5,           // appears from stage 5 (tier 5-15 band)
    tierBand: [5, 15],
    element: 'VOLT',
    maxHealth: MAELSTROM_MAX_HEALTH,
    size: 104,
    color: '#a855ff',   // VOLT tint (matches ELEMENTS.VOLT.color)
    glowColor: '#c89bff',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    draw: drawMaelstrom,         // 9.1.x per-boss custom renderer (living vortex)
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    nodeScriptForPhase,
    initBoss: initMaelstrom,
    updateBoss: updateMaelstrom,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the phase script, the phase-0 conduit ring, the
// phase-0 CONDUCT-rain cadence, and the intro sequence. Death is armed lazily by
// tickMaelstromDeath / armMaelstromDeath.
export function initMaelstrom(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = MAELSTROM.id;
    boss.name = MAELSTROM.name;
    boss.element = MAELSTROM.element;
    boss.maxHealth = MAELSTROM.maxHealth;
    boss.health = MAELSTROM.maxHealth;
    boss.size = boss.size || MAELSTROM.size;
    boss._enraged = false;
    boss._now = now;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhaseNodes(boss, 0, ctx, now);   // phase-0 conduit ring
    armConductRain(boss, 0, now);       // phase-0 rain cadence
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, CONDUCT-rain, and phases (in that order)
// with one shared `now`. Stashes `now` on the boss so phase onEnter handlers can
// restart the orbit/rain clocks deterministically. Returns whether the core is
// currently killable (parts gate only; the caller's damage pipeline ORs in the
// intro / phase-transition invuln windows).
export function updateMaelstrom(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateConductRain(boss, now);
    updateBossPhases(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the CORE (all this phase's nodes are
// down). Nodes always reachable regardless. Mirrors boss-parts' coreBlocksDamage
// but framed positively for the firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function maelstromCurrentPhase(boss) {
    return currentPhase(boss);
}
export function maelstromLivingNodes(boss) {
    return livingPartCount(boss);
}
export function maelstromIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss.
export function armMaelstromDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickMaelstromDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default MAELSTROM;
