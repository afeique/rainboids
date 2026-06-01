// THE HIVEMOTHER — stage 6-18 boss (BOSS-10).
//
// A TOXIC boss built on the SHIPPED chassis, mirroring THE HARBINGER /
// MAELSTROM shape: data + a thin, pure driver over boss-phases / boss-parts /
// boss-intro. It owns no engine deps and never touches the cores. What makes
// the Hivemother *the Hivemother*:
//
//   • EGG-SAC weak-points — the core is ringed by bloated egg-sacs
//     (shieldsCore:true). While any sac lives the core is invulnerable, so the
//     player must lance the sacs to open a core-damage window. But each sac is
//     ALSO a spawner: on a per-sac cadence it hatches a manageable trickle of
//     adds. The spawn is modelled as a pure, `now`-driven state machine per sac
//     that increments a shared `boss.addsSpawned` counter and raises a
//     `boss.spawnPending` flag (the contract the engine spawner — wired later —
//     consumes). DESTROYING a sac permanently halts ITS spawns: a dead sac never
//     hatches again. "Egg-sacs cancellable, adds manageable."
//
//   • CORRODE clouds — a telegraphed area attack on a cadence. A pure, now-driven
//     state machine cycles IDLE → TELEGRAPH (wind-up) → FIRE → cooldown → IDLE
//     (mirroring Maelstrom's CONDUCT rain), re-armed per phase with a tighter
//     cadence each time. The telegraph is the contract the rest of the game (and
//     the unit test) keys off; the actual cloud pattern is the engine's job once
//     spawning lands.
//
//   • Phases re-arm FEWER but TOUGHER egg-sacs (the brood thins-but-hardens);
//     the final phase enrages.
//
// SELF-CONTAINED + PURE + HEADLESS: everything is driven through the chassis'
// public API with an explicit `now`, so the whole boss is deterministic in unit
// tests (no DOM, no RAF). Spawn wiring (registry + wave hook) is BOSS-04's job;
// this file deliberately does NOT register itself anywhere — it raises flags +
// counters the engine spawner consumes, but spawns nothing itself.

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
    livingParts,
    livingPartCount,
} from '../boss-parts.js';
import {
    initBossIntro,
    updateBossIntro,
    initBossDeath,
    updateBossDeath,
} from '../boss-intro.js';
import { drawHivemother } from './render/hivemother-render.js';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Most of the fight is spent lancing egg-sacs (the core is gated while they
// live) AND managing the trickle of adds they hatch. HP cut ~35% (1200 → 780) —
// core + per-phase sacs both trimmed — for shorter, snappier boss fights that
// don't drag.
export const HIVEMOTHER_MAX_HEALTH = 780;

// Egg-sac ring per phase: FEWER sacs but TOUGHER + slower-to-hatch each phase
// (the brood thins-but-hardens). `speed` is rad/s (boss-parts orbit math);
// alternating sign reads as two counter-drifting clutches early, tightening to a
// single heavy clutch at enrage. `spawnIntervalMs` is how often a LIVING sac
// hatches one add; `spawnDelayMs` is the first-hatch warm-up after a (re)arm so
// the player gets a beat before the brood starts trickling.
const PHASE_SACS = [
    // Phase 0 — opening: a wide, slow 5-sac clutch hatching briskly.
    { count: 5, radius: 140, hp: 40,  speed: 0.4, partRadius: 24, spawnIntervalMs: 2600, spawnDelayMs: 1800 },
    // Phase 1 — mid: 4 sacs, tougher + hatching a touch slower.
    { count: 4, radius: 118, hp: 60,  speed: 0.7, partRadius: 24, spawnIntervalMs: 3000, spawnDelayMs: 1600 },
    // Phase 2 — enrage: 3 heavy sacs, hatching slowest individually (but the
    // CORRODE clouds + enrage make up for it).
    { count: 3, radius: 96,  speed: 1.2, hp: 85, partRadius: 26, spawnIntervalMs: 3400, spawnDelayMs: 1400 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.6, 0.3];

// CORRODE-cloud cadence per phase (ms). The wind-up TELEGRAPH gives the player
// warning; FIRE is the cloud-bloom window; then a cooldown back to IDLE. Each
// phase shortens the cooldown (clouds come faster) — the enrage phase is the
// most poisonous.
const PHASE_CLOUD = [
    // Phase 0 — telegraph long, clouds rare.
    { telegraphMs: 1700, fireMs: 700, cooldownMs: 4400 },
    // Phase 1 — quicker wind-up, more frequent.
    { telegraphMs: 1300, fireMs: 700, cooldownMs: 3300 },
    // Phase 2 — enrage: snap telegraph, relentless.
    { telegraphMs: 900,  fireMs: 800, cooldownMs: 2200 },
];

// CORRODE-cloud state-machine states (exported for the engine + the unit test).
export const CLOUD_IDLE = 'IDLE';
export const CLOUD_TELEGRAPH = 'TELEGRAPH';
export const CLOUD_FIRE = 'FIRE';

// ── Egg-sac weak-points (parts + per-sac spawn state machine) ────────────────
// Build the egg-sac parts-script for a given phase index. Each sac shields the
// core, orbits the core centre, carries the TOXIC element, and embeds a private
// `spawn` cadence block (read by the spawn state machine). Phases alternate spin
// direction so the clutch reads as counter-drifting.
export function sacScriptForPhase(phaseIdx) {
    const cfg = PHASE_SACS[phaseIdx] || PHASE_SACS[PHASE_SACS.length - 1];
    const sacs = [];
    for (let i = 0; i < cfg.count; i++) {
        const dir = (i % 2 === 0) ? 1 : -1; // counter-drifting clutches
        sacs.push({
            id: `p${phaseIdx}-sac-${i}`,
            name: `Egg-Sac ${i + 1}`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,
            element: 'TOXIC',
            // Rotating weak-point: evenly spaced around the clutch, orbiting.
            orbit: {
                radius: cfg.radius,
                speed: cfg.speed * dir,
                phase: (Math.PI * 2 * i) / cfg.count,
            },
            // Per-sac hatch cadence (read by the spawn state machine). The first
            // hatch lands after `spawnDelayMs`, then one every `spawnIntervalMs`.
            spawn: {
                intervalMs: cfg.spawnIntervalMs,
                delayMs: cfg.spawnDelayMs,
            },
        });
    }
    return sacs;
}

// Re-arm (RE-PLACE) the egg-sac clutch for a phase, then (re)seed the per-sac
// spawn state machine so each fresh sac's hatch clock restarts cleanly. Wrapped
// so phase onEnter handlers + the initial spawn share one code path. `now` flows
// through to boss-parts (orbit clock) AND the spawn clocks.
function armPhaseSacs(boss, phaseIdx, ctx, now) {
    initBossParts(boss, sacScriptForPhase(phaseIdx), ctx, now);
    armSacSpawns(boss, now);
}

// Seed the egg-sac spawn state machine against the CURRENT (just-armed) parts.
// Each living sac gets its own `nextHatchAt = now + delayMs`. Re-arming the
// parts (per phase) REPLACES the part set, so this REPLACES the spawn schedule
// to match (re-arm). The aggregate `boss.addsSpawned` counter is preserved
// across phases (it's a lifetime tally the engine spawner reads); the per-sac
// schedules are what reset. `boss.spawnPending` is the per-frame "hatch now"
// flag the engine spawner consumes + clears.
export function armSacSpawns(boss, now = Date.now()) {
    const sacs = livingParts(boss);
    const schedule = {};
    for (const sac of sacs) {
        const cfg = (sac.def && sac.def.spawn) || null;
        const delay = cfg && cfg.delayMs >= 0 ? cfg.delayMs : 2000;
        const interval = cfg && cfg.intervalMs > 0 ? cfg.intervalMs : 2600;
        schedule[sac.id] = {
            id: sac.id,
            intervalMs: interval,
            nextHatchAt: now + delay,
        };
    }
    boss._sacSpawn = { schedule };
    if (typeof boss.addsSpawned !== 'number') boss.addsSpawned = 0;
    boss.spawnPending = false;
    return true;
}

// Advance the egg-sac spawn state machine. Pure + deterministic on `now`: for
// each LIVING sac whose `nextHatchAt` has elapsed, hatch one add (bump
// `boss.addsSpawned`, raise `boss.spawnPending`) and roll the clock forward by
// its interval — resolving any number of intervals crossed in one frame (a big
// `now` jump still lands consistently). A DESTROYED sac is skipped: once a sac
// dies it never hatches again (its schedule entry is pruned), so destroying a
// sac permanently halts ITS spawns. No-op while the boss is mid-intro / dying.
//
// `boss.spawnPending` is a per-frame flag: it's raised on a frame that hatched
// ≥1 add and is OTHERWISE cleared, so the engine spawner can read-and-act each
// frame without it sticking. The lifetime tally `boss.addsSpawned` is the
// durable count the test + spawner assert against.
export function updateSacSpawns(boss, now = Date.now()) {
    const ss = boss && boss._sacSpawn;
    if (!ss) return 0;
    boss.spawnPending = false;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return 0;

    // Living sacs by id (only these may hatch).
    const live = new Set(livingParts(boss).map((p) => p.id));
    let hatchedThisFrame = 0;
    for (const id of Object.keys(ss.schedule)) {
        if (!live.has(id)) {
            // Sac is dead → prune its schedule; it will never hatch again.
            delete ss.schedule[id];
            continue;
        }
        const s = ss.schedule[id];
        let guard = 0;
        while (now >= s.nextHatchAt && guard++ < 64) {
            boss.addsSpawned += 1;
            hatchedThisFrame += 1;
            s.nextHatchAt += s.intervalMs;
        }
    }
    boss.spawnPending = hatchedThisFrame > 0;
    return hatchedThisFrame;
}

// How many adds a given sac is scheduled to keep hatching (1 if still live + in
// the schedule, 0 once destroyed/pruned). A convenience read for the AI / HUD.
export function sacIsHatching(boss, sacId) {
    const ss = boss && boss._sacSpawn;
    return !!(ss && ss.schedule[sacId]);
}

// ── CORRODE clouds (telegraphed area attack) ────────────────────────────────
// A pure state machine on `boss.corrodeCloudTelegraph` / `boss.corrodeCloud`,
// advanced purely by elapsed `now`. Re-armed per phase (the cooldown/telegraph
// cadence tightens). The boss's own update calls updateCorrodeClouds each frame.
//
// Cycle: IDLE --(cooldown)--> TELEGRAPH (wind-up) --(telegraphMs)--> FIRE
//        --(fireMs)--> IDLE (cooldown) ...
// Exposed flags the engine + the unit test read:
//   boss.corrodeCloud.state          — CLOUD_IDLE | CLOUD_TELEGRAPH | CLOUD_FIRE
//   boss.corrodeCloudTelegraph       — true during the wind-up window
//   boss.corrodeCloudFiring          — true during the cloud-bloom window
//   boss.corrodeCloud.blooms         — count of completed blooms (FIRE entries)
export function armCorrodeClouds(boss, phaseIdx, now) {
    const cfg = PHASE_CLOUD[phaseIdx] || PHASE_CLOUD[PHASE_CLOUD.length - 1];
    boss.corrodeCloud = {
        phaseIdx,
        telegraphMs: cfg.telegraphMs,
        fireMs: cfg.fireMs,
        cooldownMs: cfg.cooldownMs,
        state: CLOUD_IDLE,
        // First wind-up begins after the initial cooldown.
        nextAt: now + cfg.cooldownMs,
        blooms: 0,
    };
    boss.corrodeCloudTelegraph = false;
    boss.corrodeCloudFiring = false;
    return true;
}

// Advance the CORRODE-cloud state machine. Pure + deterministic on `now`;
// resolves any number of transitions crossed in a single frame (so a big `now`
// jump still lands in a consistent state). No-op while the boss is mid-intro /
// dying.
export function updateCorrodeClouds(boss, now) {
    const c = boss && boss.corrodeCloud;
    if (!c) return;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return;

    let guard = 0;
    while (now >= c.nextAt && guard++ < 8) {
        if (c.state === CLOUD_IDLE) {
            // Cooldown elapsed → begin the telegraph wind-up.
            c.state = CLOUD_TELEGRAPH;
            c.nextAt += c.telegraphMs;
        } else if (c.state === CLOUD_TELEGRAPH) {
            // Wind-up elapsed → cloud blooms (fire).
            c.state = CLOUD_FIRE;
            c.blooms += 1;
            c.nextAt += c.fireMs;
        } else { // CLOUD_FIRE
            // Bloom done → back to idle for the cooldown.
            c.state = CLOUD_IDLE;
            c.nextAt += c.cooldownMs;
        }
    }
    boss.corrodeCloudTelegraph = (c.state === CLOUD_TELEGRAPH);
    boss.corrodeCloudFiring = (c.state === CLOUD_FIRE);
}

export function corrodeCloudState(boss) {
    return (boss && boss.corrodeCloud) ? boss.corrodeCloud.state : CLOUD_IDLE;
}
export function isCorrodeCloudTelegraphing(boss) {
    return !!(boss && boss.corrodeCloudTelegraph);
}
export function isCorrodeCloudFiring(boss) {
    return !!(boss && boss.corrodeCloudFiring);
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms (re-places) that phase's egg-sac clutch + spawn schedule +
// tightens the CORRODE-cloud cadence; the final phase additionally flips the
// enrage flag. Each handler reads `now` off the boss so the orbit/spawn/cloud
// clocks stay deterministic in tests (boss-phases passes no `now` into onEnter).
export function buildPhaseScript() {
    return [
        {
            id: 'hivemother-p0',
            name: 'Gestation',
            // Phase 0 is the spawn phase; armed by initHivemother, not here.
            onEnter: () => {},
        },
        {
            id: 'hivemother-p1',
            name: 'Brood Swarm',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => {
                const now = boss._now || Date.now();
                armPhaseSacs(boss, 1, ctx, now);
                armCorrodeClouds(boss, 1, now);
            },
        },
        {
            id: 'hivemother-p2',
            name: 'Toxic Bloom',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                const now = boss._now || Date.now();
                armPhaseSacs(boss, 2, ctx, now);
                armCorrodeClouds(boss, 2, now);
                triggerEnrage(boss, ctx);
            },
        },
    ];
}

// ── Enrage (final-phase escalation) ─────────────────────────────────────────
// Latched so it fires exactly once. Bumps fire rate, flags a poison aura, and
// tightens the brood's hatch cadence so the engine-side AI/firing (wired later)
// can read it; the flags themselves are the contract the rest of the game keys
// off.
export function triggerEnrage(boss, _ctx = null) {
    if (!boss || boss._enraged) return false;
    boss._enraged = true;
    boss._enragedAt = boss._now || Date.now();
    // Hooks the engine firing path will honor once spawning lands (BOSS-04+).
    boss.firingCooldownMul = 0.55;
    boss.enablePoisonAura = true;
    // The brood hatches faster under enrage.
    boss.spawnRateMul = 0.7;
    return true;
}

export function isEnraged(boss) {
    return !!(boss && boss._enraged);
}

// ── Intro / death sequences (consumed by boss-intro.js) ─────────────────────
export function buildIntroScript() {
    return [
        { id: 'warp-in', name: 'Warp-In', durationMs: 1400 },
        { id: 'name-card', name: 'THE HIVEMOTHER', durationMs: 2200 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'sacs-rupture', name: 'Egg-Sacs Rupture', durationMs: 900 },
        { id: 'brood-collapse', name: 'Brood Collapses', durationMs: 1100 },
        { id: 'toxic-burst', name: 'Toxic Burst', durationMs: 1300 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const HIVEMOTHER = {
    id: 'HIVEMOTHER',
    name: 'THE HIVEMOTHER',
    stage: 6,           // appears from stage 6 (tier 6-18 band)
    tierBand: [6, 18],
    element: 'TOXIC',
    maxHealth: HIVEMOTHER_MAX_HEALTH,
    size: 112,
    color: '#88ff44',   // TOXIC tint (matches ELEMENTS.TOXIC.color)
    glowColor: '#b6ff8a',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    draw: drawHivemother,         // 9.1.x per-boss custom renderer (brood leviathan)
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    sacScriptForPhase,
    initBoss: initHivemother,
    updateBoss: updateHivemother,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the phase script, the phase-0 egg-sac clutch +
// spawn schedule, the phase-0 CORRODE-cloud cadence, and the intro sequence.
// Death is armed lazily by tickHivemotherDeath / armHivemotherDeath.
export function initHivemother(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = HIVEMOTHER.id;
    boss.name = HIVEMOTHER.name;
    boss.element = HIVEMOTHER.element;
    boss.maxHealth = HIVEMOTHER.maxHealth;
    boss.health = HIVEMOTHER.maxHealth;
    boss.size = boss.size || HIVEMOTHER.size;
    boss._enraged = false;
    boss._now = now;
    boss.addsSpawned = 0;
    boss.spawnPending = false;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhaseSacs(boss, 0, ctx, now);    // phase-0 egg-sac clutch + spawn schedule
    armCorrodeClouds(boss, 0, now);     // phase-0 cloud cadence
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, egg-sac spawns, CORRODE clouds, and
// phases (in that order) with one shared `now`. Stashes `now` on the boss FIRST
// so phase onEnter handlers can restart the orbit/spawn/cloud clocks
// deterministically. Returns whether the core is currently killable (parts gate
// only; the caller's damage pipeline ORs in the intro / phase-transition invuln
// windows).
export function updateHivemother(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateSacSpawns(boss, now);
    updateCorrodeClouds(boss, now);
    updateBossPhases(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the CORE (all this phase's egg-sacs are
// down). Sacs always reachable regardless. Mirrors boss-parts' coreBlocksDamage
// but framed positively for the firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function hivemotherCurrentPhase(boss) {
    return currentPhase(boss);
}
export function hivemotherLivingSacs(boss) {
    return livingPartCount(boss);
}
export function hivemotherIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss.
export function armHivemotherDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickHivemotherDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default HIVEMOTHER;
