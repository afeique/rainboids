// THE IRON THRONE — stage 7-21 boss (BOSS-11).
//
// The element-cycling boss. A fortress core ringed by FOUR PER-ELEMENT TURRETS
// (weak-point parts, `shieldsCore:true`). Each turret is strongly resistant to
// MOST elements but WEAK to exactly ONE — and no two turrets share the same
// weakness — so the player cannot brute-force the ring with a single element:
// they must CYCLE elements, hitting each turret with its own counter. The core
// is invulnerable while ANY turret lives; clearing all four opens a core-damage
// window (the phase). Each phase re-arms a FRESH four-turret set (tougher, with
// a DIFFERENT weakness rotation) so the cycling puzzle resets harder. Final
// phase enrages.
//
// THE signature mechanic on top of the Harbinger/Aegis template:
//   • PER-TURRET ELEMENT WEAKNESS — every turret carries a `resist` map: a high
//     resist for most elements and a NEGATIVE resist (a weakness) for one. A hit
//     of the turret's weakness element does FULL (in fact bonus) damage; any
//     other element is heavily reduced. `resolveTurretDamage(turret, amount, src)`
//     is the pure helper the collision pipeline calls before damageBossPart, and
//     the test asserts "weakness = full, off-element = reduced".
//   • CORE-INVULN-WHILE-TURRETS-LIVE — straight from the chassis' coreBlocksDamage:
//     while any of the four turrets shields the core it cannot be touched.
//   • TURRET RE-ARM — every phase enter REPLACES the four-turret set (initBossParts
//     re-called) with a tougher set whose weaknesses are rotated, so the cycle
//     order changes between phases.
//
// A turret-fire attack pattern is stubbed as flags + a per-frame cadence clock
// the engine firing path (wired later) and the unit test can read; this module
// does not actually spawn bullets.
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
import { ELEMENT_IDS } from '../../combat/elements.js';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Most of the fight is spent CYCLING elements to shed the four turrets (the core
// is gated while they live, and each turret resists all but its own
// counter-element). HP cut ~35% (1500 → 980) — core + per-phase turrets both
// trimmed — for shorter, snappier boss fights that don't drag.
export const IRON_THRONE_MAX_HEALTH = 980;

// How many turrets ring the core every phase. The whole identity is "four
// per-element weak-points you must counter individually", so this is fixed at 4.
export const TURRET_COUNT = 4;

// Resist value applied to every element a turret is NOT weak to. Near-immune
// (1 = fully immune) so off-element fire is almost wasted — this is what FORCES
// the element cycle. Bumped per phase below.
const OFF_ELEMENT_RESIST = [0.85, 0.92, 0.96];

// Weakness value (NEGATIVE resist) for a turret's counter-element → a damage
// BONUS via elementalMultiplier (resist < 0 → multiplier > 1, capped at 2).
const WEAKNESS_RESIST = -0.5;

// Per-phase turret weakness ROTATION. Each phase picks four DISTINCT element ids
// (one weakness per turret, no repeats within a set), and the set DIFFERS between
// phases so the cycle order resets when the ring re-arms. The spec's example
// (Pyro / Cryo / Volt / Toxic) is phase 0.
const PHASE_WEAKNESSES = [
    // Phase 0 — the canonical four counters from the spec.
    ['PYRO', 'CRYO', 'VOLT', 'TOXIC'],
    // Phase 1 — rotate the set: drop one, bring in VOID; tougher resists.
    ['CRYO', 'VOLT', 'TOXIC', 'VOID'],
    // Phase 2 — enrage: the hardest, all-different again, including RADIANT.
    ['VOLT', 'TOXIC', 'VOID', 'RADIANT'],
];

// Turret ring per phase: same four turrets, but TOUGHER (more HP) + MORE
// RESISTANT (higher off-element resist) + faster orbit each phase. `speed` is
// rad/s (boss-parts orbit math); alternating sign reads as a slow ring tightening
// into a fast counter-spin at enrage.
const PHASE_TURRETS = [
    // Phase 0 — opening: a wide, slow ring.
    { radius: 150, hp: 70, speed: 0.5, partRadius: 26 },
    // Phase 1 — mid: tighter + tougher + faster.
    { radius: 125, hp: 105, speed: 0.85, partRadius: 26 },
    // Phase 2 — enrage: tight, heavy, fast counter-spin.
    { radius: 100, hp: 145, speed: 1.35, partRadius: 28 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.6, 0.3];

// Turret-fire cadence (ms between volleys) per phase — TIGHTENS each phase, and
// the enrage halves it again (see triggerEnrage). Stubbed as a clock the engine
// firing path reads; this module never spawns bullets.
const PHASE_FIRE_INTERVAL_MS = [2200, 1700, 1200];

// The element a turret in slot `i` is weak to, for the given phase. Pure lookup
// over PHASE_WEAKNESSES (with a clamp so an out-of-range phase reuses the last).
export function turretWeaknessFor(phaseIdx, slot) {
    const set = PHASE_WEAKNESSES[phaseIdx] || PHASE_WEAKNESSES[PHASE_WEAKNESSES.length - 1];
    return set[slot % set.length];
}

// Build the per-element turret resist map for a turret weak to `weakEl` in the
// given phase: a high resist for EVERY other known element, and a NEGATIVE
// resist (weakness) for `weakEl`. Pure data — the damage pipeline resolves the
// multiplier via elements.elementalMultiplier.
function turretResistMap(phaseIdx, weakEl) {
    const off = OFF_ELEMENT_RESIST[phaseIdx] != null
        ? OFF_ELEMENT_RESIST[phaseIdx]
        : OFF_ELEMENT_RESIST[OFF_ELEMENT_RESIST.length - 1];
    const resist = {};
    for (const id of ELEMENT_IDS) resist[id] = off;
    resist[weakEl] = WEAKNESS_RESIST; // the one counter → a damage bonus
    return resist;
}

// Build the four-turret parts-script for a given phase index. Each turret
// shields the core, orbits the core centre, and carries a per-element resist map
// whose single weakness is its slot's counter-element for this phase. Turrets are
// evenly spaced around the ring; phases alternate spin direction.
export function turretScriptForPhase(phaseIdx) {
    const cfg = PHASE_TURRETS[phaseIdx] || PHASE_TURRETS[PHASE_TURRETS.length - 1];
    const dir = (phaseIdx % 2 === 0) ? 1 : -1; // alternate spin direction per phase
    const turrets = [];
    for (let slot = 0; slot < TURRET_COUNT; slot++) {
        const weakEl = turretWeaknessFor(phaseIdx, slot);
        turrets.push({
            id: `p${phaseIdx}-turret-${slot}`,
            name: `${weakEl} Turret`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,
            // The turret's own "theme" element + its weakness map. The weakness
            // is the counter the player must cycle to; everything else is resisted.
            element: weakEl,
            weakness: weakEl,
            resist: turretResistMap(phaseIdx, weakEl),
            // Rotating weak-point: evenly spaced around the ring, orbiting.
            orbit: {
                radius: cfg.radius,
                speed: cfg.speed * dir,
                phase: (Math.PI * 2 * slot) / TURRET_COUNT,
            },
        });
    }
    return turrets;
}

// Re-arm (REPLACE) the turret ring for a phase. Wrapped so phase onEnter handlers
// and the initial spawn share one code path. `now` flows through to boss-parts so
// the orbit clock restarts cleanly at each phase. Also resets the turret-fire
// cadence for the phase.
function armPhaseTurrets(boss, phaseIdx, ctx, now) {
    initBossParts(boss, turretScriptForPhase(phaseIdx), ctx, now);
    armTurretFire(boss, phaseIdx, now);
}

// ── Turret-fire attack pattern (stubbed as flags + cadence clock) ───────────
// Sets the volley interval for the phase + a `_nextFireAt` deadline. The engine
// firing path (wired later) and the unit test read these; nothing is spawned
// here. `tickTurretFire` advances the clock and flags when a volley is "due".
function armTurretFire(boss, phaseIdx, now) {
    const interval = PHASE_FIRE_INTERVAL_MS[phaseIdx] != null
        ? PHASE_FIRE_INTERVAL_MS[phaseIdx]
        : PHASE_FIRE_INTERVAL_MS[PHASE_FIRE_INTERVAL_MS.length - 1];
    boss._turretFire = {
        intervalMs: interval,
        nextFireAt: now + interval,
        volleyCount: 0,
        firing: false,
    };
}

// Per-frame turret-fire cadence advance. Marks a volley "due" (`firing = true`)
// when the deadline passes, counts it, and re-arms the next deadline (honoring
// the enrage fire-rate multiplier). Pure clock — the engine spawns the actual
// bullets off this flag.
export function tickTurretFire(boss, now) {
    const tf = boss && boss._turretFire;
    if (!tf) return false;
    tf.firing = false;
    if (now >= tf.nextFireAt) {
        tf.firing = true;
        tf.volleyCount += 1;
        const mul = boss._enraged ? (boss.firingCooldownMul || 1) : 1;
        tf.nextFireAt = now + Math.max(1, tf.intervalMs * mul);
    }
    return tf.firing;
}

// True if a turret volley is "due" this frame (read by the engine firing path).
export function turretFireDue(boss) {
    return !!(boss && boss._turretFire && boss._turretFire.firing);
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms (replaces) that phase's four-turret ring with a rotated, tougher
// set; the final phase additionally flips the enrage flag. Each handler reads
// `now` off the boss so the orbit/fire clocks stay deterministic in tests
// (boss-phases passes no `now` into onEnter).
export function buildPhaseScript() {
    return [
        {
            id: 'iron-throne-p0',
            name: 'Coronation',
            // Phase 0 is the spawn phase; armed by initIronThrone, not here.
            onEnter: () => {},
        },
        {
            id: 'iron-throne-p1',
            name: 'Re-Armament',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => armPhaseTurrets(boss, 1, ctx, boss._now || Date.now()),
        },
        {
            id: 'iron-throne-p2',
            name: 'Last Decree',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                armPhaseTurrets(boss, 2, ctx, boss._now || Date.now());
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
        { id: 'name-card', name: 'THE IRON THRONE', durationMs: 2000 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'turrets-blow', name: 'Turrets Detonate', durationMs: 900 },
        { id: 'throne-crack', name: 'Throne Cracks', durationMs: 1100 },
        { id: 'supernova', name: 'Supernova', durationMs: 1200 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const IRON_THRONE = {
    id: 'IRON_THRONE',
    name: 'THE IRON THRONE',
    stage: 7,           // appears from stage 7 (tier 7-21 band)
    tierBand: [7, 21],
    element: 'KINETIC', // chassis element; the FIGHT is about cycling the turret counters
    maxHealth: IRON_THRONE_MAX_HEALTH,
    size: 120,
    color: '#dfe7f0',   // KINETIC tint (matches ELEMENTS.KINETIC.color)
    glowColor: '#aebed4',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    turretCount: TURRET_COUNT,
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    turretScriptForPhase,
    turretWeaknessFor,
    initBoss: initIronThrone,
    updateBoss: updateIronThrone,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the phase script, the phase-0 turret ring + fire
// cadence, and the intro sequence. Death is armed lazily by tickIronThroneDeath.
export function initIronThrone(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = IRON_THRONE.id;
    boss.name = IRON_THRONE.name;
    boss.element = IRON_THRONE.element;
    boss.maxHealth = IRON_THRONE.maxHealth;
    boss.health = IRON_THRONE.maxHealth;
    boss.size = boss.size || IRON_THRONE.size;
    boss._enraged = false;
    boss._now = now;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhaseTurrets(boss, 0, ctx, now);          // phase-0 turret ring + fire cadence
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, phases (in that order) + the turret-fire
// cadence, all with one shared `now`. Stashes `now` on the boss so phase onEnter
// handlers can restart the orbit/fire clocks deterministically. Returns whether
// the core is currently killable (all turrets down).
export function updateIronThrone(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateBossPhases(boss, ctx, now);
    tickTurretFire(boss, now);
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the CORE — all four turrets are down.
// Mirrors boss-parts' coreBlocksDamage but framed positively for firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// ── Per-turret element-weakness resolution (the element-cycle counterplay) ──
// A damaging source's element id. Tolerant of a bare string, a `{ element }`
// shape, an `{ elements: [...] }` array (W1 multi-element attunements), or a bare
// array of ids — returns the first present element id (or null).
function _srcElement(src) {
    if (!src) return null;
    if (typeof src === 'string') return src;
    if (Array.isArray(src)) return src.length ? src[0] : null;
    if (Array.isArray(src.elements)) return src.elements.length ? src.elements[0] : null;
    return src.element || null;
}

// The element a turret is weak to, accepting BOTH the script def shape (the
// raw turret def carries `weakness`) AND a live chassis part instance (whose
// `def` references the original turret def — the chassis only copies element +
// resist onto the instance, so the weakness rides on `def`). Returns null if
// neither carries one.
export function turretWeakness(turret) {
    if (!turret) return null;
    return turret.weakness || (turret.def && turret.def.weakness) || null;
}

// True if `src`'s element matches a turret's weakness (string / object / array
// element shapes accepted — any present element counts as a match). Works on
// both script defs and live part instances.
export function isTurretWeakness(turret, src) {
    if (!turret) return false;
    const weak = turretWeakness(turret);
    if (!weak) return false;
    if (!src) return false;
    if (typeof src === 'string') return src === weak;
    if (Array.isArray(src)) return src.includes(weak);
    if (Array.isArray(src.elements)) return src.elements.includes(weak);
    return src.element === weak;
}

// Effective damage for a hit of `amount` against a turret, honoring its
// per-element resist via the SHIPPED elements.elementalMultiplier:
//   • the turret's weakness element → full + bonus (multiplier > 1)
//   • any other element             → heavily reduced (near-immune off-element)
//   • no element / unknown          → reduced by the off-element resist too
// Pure helper the collision pipeline calls before damageBossPart; returned so the
// test can assert "weakness = full damage, off-element = reduced".
export function resolveTurretDamage(turret, amount, src) {
    if (!turret || !(amount > 0)) return 0;
    const resistMap = turret.resist || (turret.def && turret.def.resist) || null;
    const el = _srcElement(src);
    // Mirror elements.elementalMultiplier exactly (clamped to [0, 2]).
    let mult = 1;
    if (resistMap && el) {
        const r = resistMap[el];
        if (r) mult = Math.min(2, Math.max(0, 1 - r));
    } else if (resistMap && !el) {
        // No element id on the hit → treat as off-element (resisted, not free).
        // Use any off-element resist value present for a sensible reduction.
        const anyKey = Object.keys(resistMap).find((k) => resistMap[k] > 0);
        if (anyKey) mult = Math.min(2, Math.max(0, 1 - resistMap[anyKey]));
    }
    return amount * mult;
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function ironThroneCurrentPhase(boss) {
    return currentPhase(boss);
}
export function ironThroneLivingTurrets(boss) {
    return livingPartCount(boss);
}
export function ironThroneTurretList(boss) {
    return livingParts(boss);
}
export function ironThroneIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss.
export function armIronThroneDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickIronThroneDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default IRON_THRONE;
