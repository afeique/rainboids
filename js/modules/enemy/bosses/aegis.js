// THE AEGIS — stage 2-6 boss (BOSS-06).
//
// The armor boss. KINETIC element (no dedicated "armor" id in elements.js, so
// KINETIC is the chassis element + the plates carry a strong KINETIC resist to
// SELL the "armored" identity). A patient, defensive fight: a heavy core sealed
// behind a wall of rotating ARMOR PLATES (weak-point parts, `shieldsCore:true`).
// The plates carry a ROTATING GAP — one ring index per phase is left empty — so
// the gap sweeps around the core and periodically exposes a brief damage window
// even before the plates are shed. Destroy the plates to permanently expose the
// core; or exploit CORRODE (Toxic) to chew through the armor's resist.
//
// THREE signature mechanics on top of the Harbinger template:
//   • ROTATING PLATE-GAP — the plate ring omits one slot (`GAP_INDEX`), so the
//     core is reachable through the gap as it sweeps (a positional weak window
//     the AI/aim code reads, distinct from the all-plates-down core open).
//   • CORRODE-BYPASS — plates have a high KINETIC `resist` (armor) AND a
//     `corrodeBypass` flag. A CORRODE/Toxic source ignores the resist and can
//     even reach the CORE through living plates: `coreDamageableBy(boss, src)`
//     is true when the hit carries CORRODE, regardless of plates. This is the
//     element-counterplay the boss DoD asks for.
//   • PLATE-SHED — every phase enter re-arms a FRESH plate set that is SMALLER
//     (fewer plates) but TOUGHER (more HP + more resist) than the last, so the
//     wall thins-but-hardens as the fight escalates. Final phase enrages.
//
// SELF-CONTAINED + PURE: data + a thin driver over the SHIPPED boss chassis
// cores (boss-phases / boss-parts / boss-intro). It never touches them and adds
// no engine deps. Driven through the chassis public API with an explicit `now`,
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
    livingParts,
    livingPartCount,
} from '../boss-parts.js';
import {
    initBossIntro,
    updateBossIntro,
    initBossDeath,
    updateBossDeath,
} from '../boss-intro.js';

// The element a CORRODE source carries (Toxic). Plates resist KINETIC but
// CORRODE bypasses that resist — the boss's intended counterplay element.
export const BYPASS_ELEMENT = 'TOXIC';

// ── Tuning (placeholder-but-reasonable; balance is a later task) ────────────
// Core HP is large but most of the fight is spent grinding the armored plates
// (core is gated while they live, and the plates resist KINETIC), so wall-clock
// kill time lands in the 45–120s boss band. Conservative + easy to retune.
export const AEGIS_MAX_HEALTH = 1100;

// Armor-plate ring per phase: FEWER plates but TOUGHER + more RESISTANT each
// phase (the wall thins-but-hardens). `speed` is rad/s (boss-parts orbit math),
// alternating sign reads as a heavy ring grinding into a fast counter-spin at
// enrage. `kineticResist` (0..1) is the armor: 1 = immune, 0 = neutral. CORRODE
// always bypasses it. `slots` is how many ring positions exist; ONE of them is
// left empty (the rotating GAP), so `count` plates fill `slots - 1` positions.
const PHASE_PLATES = [
    // Phase 0 — opening: a thick, slow 6-slot wall (5 plates + 1 gap).
    { slots: 6, radius: 140, hp: 90,  speed: 0.45, partRadius: 26, kineticResist: 0.55 },
    // Phase 1 — mid: 5-slot wall (4 plates + gap), tighter + tougher.
    { slots: 5, radius: 120, hp: 130, speed: 0.75, partRadius: 26, kineticResist: 0.70 },
    // Phase 2 — enrage: 4-slot wall (3 plates + gap), fast counter-spin, near-immune.
    { slots: 4, radius: 100, hp: 180, speed: 1.25, partRadius: 28, kineticResist: 0.85 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.6, 0.3];

// Which ring slot is left empty (the rotating GAP). Index 0 keeps the gap at the
// ring's phase-anchor; the whole ring orbits, so the gap sweeps with it.
const GAP_INDEX = 0;

// Build the rotating armor-plate parts-script for a given phase index. Plates
// fill every ring slot EXCEPT `GAP_INDEX` (the rotating gap). Each plate shields
// the core, orbits the core centre, carries the phase's KINETIC armor resist,
// and is flagged `corrodeBypass` so the damage pipeline knows Toxic ignores it.
function plateScriptForPhase(phaseIdx) {
    const cfg = PHASE_PLATES[phaseIdx] || PHASE_PLATES[PHASE_PLATES.length - 1];
    const dir = (phaseIdx % 2 === 0) ? 1 : -1; // alternate spin direction per phase
    const plates = [];
    for (let slot = 0; slot < cfg.slots; slot++) {
        if (slot === GAP_INDEX) continue; // leave the gap empty
        plates.push({
            id: `p${phaseIdx}-plate-${slot}`,
            name: `Armor Plate ${slot + 1}`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,
            element: 'KINETIC',
            // Armor: high KINETIC resist. CORRODE (Toxic) bypasses it — see
            // resolvePlateMultiplier / the `corrodeBypass` flag below.
            resist: { KINETIC: cfg.kineticResist },
            corrodeBypass: true,
            // Rotating weak-point: evenly spaced around the ring, orbiting; the
            // empty GAP_INDEX slot sweeps with the ring as a positional window.
            orbit: {
                radius: cfg.radius,
                speed: cfg.speed * dir,
                phase: (Math.PI * 2 * slot) / cfg.slots,
            },
        });
    }
    return plates;
}

// Re-arm (or RE-PLACE) the plate wall for a phase = the PLATE-SHED. Wrapped so
// phase onEnter handlers and the initial spawn share one code path. `now` flows
// through to boss-parts so the orbit clock restarts cleanly at each phase.
function armPhasePlates(boss, phaseIdx, ctx, now) {
    initBossParts(boss, plateScriptForPhase(phaseIdx), ctx, now);
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms (sheds + replaces) that phase's plate wall; the final phase
// additionally flips the enrage flag. Each handler reads `now` off the boss so
// the orbit clock stays deterministic in tests (boss-phases passes no `now`).
export function buildPhaseScript() {
    return [
        {
            id: 'aegis-p0',
            name: 'Bulwark',
            // Phase 0 is the spawn phase; armed by initAegis, not here.
            onEnter: () => {},
        },
        {
            id: 'aegis-p1',
            name: 'Shed',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => armPhasePlates(boss, 1, ctx, boss._now || Date.now()),
        },
        {
            id: 'aegis-p2',
            name: 'Last Wall',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                armPhasePlates(boss, 2, ctx, boss._now || Date.now());
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
    boss.firingCooldownMul = 0.5;
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
        { id: 'name-card', name: 'THE AEGIS', durationMs: 2000 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'plates-shatter', name: 'Plates Shatter', durationMs: 900 },
        { id: 'core-breach', name: 'Core Breach', durationMs: 1100 },
        { id: 'supernova', name: 'Supernova', durationMs: 1200 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const AEGIS = {
    id: 'AEGIS',
    name: 'THE AEGIS',
    stage: 2,           // appears from stage 2 (tier 2-6 band)
    tierBand: [2, 6],
    element: 'KINETIC',
    maxHealth: AEGIS_MAX_HEALTH,
    size: 108,
    color: '#dfe7f0',   // KINETIC tint (matches ELEMENTS.KINETIC.color)
    glowColor: '#aebed4',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    bypassElement: BYPASS_ELEMENT,
    gapIndex: GAP_INDEX,
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    plateScriptForPhase,
    initBoss: initAegis,
    updateBoss: updateAegis,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the phase script, the phase-0 plate wall, and
// the intro sequence. Death is armed lazily by tickAegisDeath / armAegisDeath.
export function initAegis(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = AEGIS.id;
    boss.name = AEGIS.name;
    boss.element = AEGIS.element;
    boss.maxHealth = AEGIS.maxHealth;
    boss.health = AEGIS.maxHealth;
    boss.size = boss.size || AEGIS.size;
    boss._enraged = false;
    boss._now = now;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhasePlates(boss, 0, ctx, now);          // phase-0 plate wall
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, and phases (in that order) with one
// shared `now`. Stashes `now` on the boss so phase onEnter handlers can restart
// the orbit clock deterministically. Returns whether the core is currently
// killable by a plain (non-CORRODE) hit — i.e. all this phase's plates are down.
export function updateAegis(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateBossPhases(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// True when a PLAIN (non-CORRODE) player hit should reach the CORE — all this
// phase's plates are down. Mirrors boss-parts' coreBlocksDamage but framed
// positively for the firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// ── CORRODE-bypass: the armor counterplay ───────────────────────────────────
// A damaging source's element id. Tolerant of either a bare string, a
// `{ element }` shape, or an array of elements (W1 multi-element attunements) —
// the boss only cares whether CORRODE/Toxic is present.
function _carriesBypass(src) {
    if (!src) return false;
    if (typeof src === 'string') return src === BYPASS_ELEMENT;
    if (Array.isArray(src)) return src.includes(BYPASS_ELEMENT);
    if (Array.isArray(src.elements)) return src.elements.includes(BYPASS_ELEMENT);
    return src.element === BYPASS_ELEMENT;
}

// True if a hit carrying `src`'s element is CORRODE (and so bypasses armor).
export function isCorrodeBypass(src) {
    return _carriesBypass(src);
}

// The CORE can be DAMAGED by `src` when EITHER the plates are all down (plain
// path) OR the hit carries CORRODE (bypass path — Toxic chews through armor and
// reaches the core even while plates live). This is the contract the damage
// pipeline ORs into its core-gate, and the test asserts directly.
export function coreDamageableBy(boss, src) {
    if (!coreBlocksDamage(boss)) return true;   // plates down → core open to anyone
    return _carriesBypass(src);                 // plates up → only CORRODE gets through
}

// Effective damage multiplier for a hit of `amount` against a plate, honoring
// its armor resist UNLESS the hit carries CORRODE (which bypasses the resist
// entirely → full damage). Pure helper the collision pipeline can call before
// damageBossPart; returned so the test can assert "CORRODE ignores armor".
export function resolvePlateDamage(plate, amount, src) {
    if (!plate || !(amount > 0)) return 0;
    if (_carriesBypass(src)) return amount;     // CORRODE bypasses armor → full
    const resist = plate.resist && plate.resist.KINETIC ? plate.resist.KINETIC : 0;
    const mult = Math.min(2, Math.max(0, 1 - resist)); // mirrors elementalMultiplier
    return amount * mult;
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function aegisCurrentPhase(boss) {
    return currentPhase(boss);
}
export function aegisLivingPlates(boss) {
    return livingPartCount(boss);
}
export function aegisPlateList(boss) {
    return livingParts(boss);
}
export function aegisIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss.
export function armAegisDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickAegisDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default AEGIS;
