// THE PRISMARCH / OMEGA — the FINAL boss (BOSS-14, stage 10-30, ALL 7 ELEMENTS).
//
// The capstone fight: a FIVE-ASPECT GAUNTLET. Where the earlier bosses are
// single-element duels, the Prismarch cycles through FIVE elemental ASPECTS in
// sequence — each a full HP-gated phase that re-arms a fresh, themed weak-point
// ring AND swaps in a different SIGNATURE TELEGRAPHED ATTACK. The aspect order
// walks the elemental wheel:
//
//   Aspect 0 — PYRO    (the opening; burns)
//   Aspect 1 — CRYO    (chills + shatters)
//   Aspect 2 — VOLT    (chains)
//   Aspect 3 — TOXIC   (corrodes)
//   Aspect 4 — VOID + RADIANT finale (the ENRAGE — both ends of the wheel)
//
// All seven elements (KINETIC baseline chassis + the six aspect elements) are
// represented across the gauntlet, satisfying the "all 7" spec. The final aspect
// (VOID/RADIANT) is the ENRAGE: every attack tightens its cadence and the boss
// flags homing fire.
//
// Each aspect's identity, mirroring lumen / maelstrom:
//   • THEMED WEAK-POINTS — an orbiting ring of `shieldsCore:true` parts carrying
//     the aspect's element (metadata for the renderer + the caller's damage
//     pipeline). While any shields the core, the core is invulnerable, so each
//     aspect must be "broken" before its core window opens. Each phase REPLACES
//     the ring (initBossParts re-call) with a leaner, tougher, faster set.
//   • A SIGNATURE TELEGRAPHED ATTACK — a pure, now-driven cadence machine that
//     cycles IDLE → TELEGRAPH (wind-up warning) → FIRE → cooldown, re-armed per
//     aspect with that aspect's cadence + element. The telegraph flag is the
//     contract the renderer / firing path (and the unit test) key off; the actual
//     bullet pattern is the engine's job once spawning lands.
//
// SELF-CONTAINED + PURE + HEADLESS: data + a thin driver over the SHIPPED boss
// chassis cores (boss-phases / boss-parts / boss-intro). It never touches them
// and adds no engine deps. Everything is driven through the chassis' public API
// with an explicit `now`, so the whole boss is deterministic in unit tests (no
// DOM, no RAF).
//
// FINAL-BOSS NOTE: the descriptor sets `isFinalBoss: true` and this module
// exposes a `prismarchReachedFinalAspect(boss)` read-through + a death sequence
// via boss-intro. It deliberately does NOT wire run-complete / death cinematic /
// run summary — that integration is BOSS-04's job. Spawn wiring is BOSS-04's job
// too; this file does NOT register itself anywhere.

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
import { ELEMENT_IDS } from '../../combat/elements.js';

// ── Tuning (placeholder-but-reasonable; balance is a later task) ────────────
// The final boss is a long fight: FIVE aspects, each gating its core behind a
// themed ring. Core HP is large; most of the wall clock is spent breaking each
// aspect's ring before its core window opens. Conservative + easy to retune.
export const PRISMARCH_MAX_HEALTH = 2500;

// How many aspects make up the gauntlet (= phase count). FIVE, per the spec.
export const ASPECT_COUNT = 5;

// The five aspects, in walk-the-wheel order. Each names its element + a flavour
// label; `final: true` marks the enrage aspect. KINETIC (the chassis baseline)
// + these six aspect elements = all seven elements across the fight.
export const ASPECTS = [
    { id: 'pyre',    name: 'Aspect of Pyre',    element: 'PYRO'    },
    { id: 'frost',   name: 'Aspect of Frost',   element: 'CRYO'    },
    { id: 'storm',   name: 'Aspect of Storm',   element: 'VOLT'    },
    { id: 'blight',  name: 'Aspect of Blight',  element: 'TOXIC'   },
    // Finale: the two poles of the wheel (VOID + RADIANT). The ring is themed
    // VOID; the signature attack is RADIANT — and this aspect ENRAGES.
    { id: 'omega',   name: 'OMEGA',             element: 'VOID', secondaryElement: 'RADIANT', final: true },
];

// Themed weak-point ring per aspect: fewer parts but tougher + faster orbit each
// aspect. `speed` is rad/s (boss-parts orbit math); alternating sign reads as two
// counter-rotating arcs early, tightening into a fast single ring at the finale.
const ASPECT_RING = [
    // Aspect 0 — PYRO: a wide, slow 6-facet ring.
    { count: 6, radius: 160, hp: 70,  speed: 0.45, partRadius: 20 },
    // Aspect 1 — CRYO: 5 facets, tighter.
    { count: 5, radius: 142, hp: 90,  speed: 0.7,  partRadius: 20 },
    // Aspect 2 — VOLT: 4 facets, faster.
    { count: 4, radius: 124, hp: 115, speed: 1.0,  partRadius: 22 },
    // Aspect 3 — TOXIC: 3 facets, heavier.
    { count: 3, radius: 106, hp: 145, speed: 1.3,  partRadius: 24 },
    // Aspect 4 — OMEGA finale: 2 heavy facets, fast counter-spin.
    { count: 2, radius: 90,  hp: 190, speed: 1.7,  partRadius: 26 },
];

// HP fractions at which each aspect opens (descending — boss-phases convention).
// Five evenly-ish-spaced gates from full to nearly-dead.
const ASPECT_GATES = [1.0, 0.8, 0.6, 0.4, 0.2];

// Signature-attack cadence per aspect (ms). Each aspect's attack cycles
// IDLE → TELEGRAPH (wind-up warning) → FIRE (strike) → cooldown → IDLE. The
// cadence tightens aspect-to-aspect; the finale is relentless and the ENRAGE
// shortens every interval further (see ENRAGE_CADENCE_MUL).
const ASPECT_ATTACK = [
    // Aspect 0 — Cinder Storm (PYRO): long telegraph, infrequent.
    { id: 'cinder-storm',  telegraphMs: 1600, fireMs: 600, cooldownMs: 4200 },
    // Aspect 1 — Glacial Lance (CRYO): quicker wind-up.
    { id: 'glacial-lance', telegraphMs: 1400, fireMs: 600, cooldownMs: 3600 },
    // Aspect 2 — Arc Cascade (VOLT): snappier.
    { id: 'arc-cascade',   telegraphMs: 1200, fireMs: 600, cooldownMs: 3000 },
    // Aspect 3 — Venom Bloom (TOXIC): faster still.
    { id: 'venom-bloom',   telegraphMs: 1000, fireMs: 700, cooldownMs: 2600 },
    // Aspect 4 — Annihilation Beam (RADIANT/VOID finale): snap telegraph, relentless.
    { id: 'annihilation',  telegraphMs: 800,  fireMs: 800, cooldownMs: 2000 },
];

// Enrage cadence multiplier: the finale shortens every signature-attack interval.
const ENRAGE_CADENCE_MUL = 0.6;

export const ATTACK_IDLE = 'IDLE';
export const ATTACK_TELEGRAPH = 'TELEGRAPH';
export const ATTACK_FIRE = 'FIRE';

// Aspect descriptor by index (clamped so an out-of-range index reuses the last).
export function aspectFor(aspectIdx) {
    return ASPECTS[aspectIdx] || ASPECTS[ASPECTS.length - 1];
}

// ── Themed weak-point ring (consumed by boss-parts.js) ──────────────────────
// Build the orbiting facet parts-script for a given aspect index. Every facet
// shields the core and orbits the core centre, carrying that aspect's element as
// metadata. Facets are evenly spaced; aspects alternate spin direction so the
// ring reads as counter-rotating.
export function ringScriptForAspect(aspectIdx) {
    const cfg = ASPECT_RING[aspectIdx] || ASPECT_RING[ASPECT_RING.length - 1];
    const aspect = aspectFor(aspectIdx);
    const facets = [];
    for (let i = 0; i < cfg.count; i++) {
        const dir = (i % 2 === 0) ? 1 : -1; // counter-rotating pairs
        facets.push({
            id: `a${aspectIdx}-facet-${i}`,
            name: `${aspect.name} Facet ${i + 1}`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,        // core invulnerable while this facet lives
            element: aspect.element,  // themed metadata for renderer + damage pipe
            aspectId: aspect.id,
            // Orbiting weak-point: evenly spaced around the ring.
            orbit: {
                radius: cfg.radius,
                speed: cfg.speed * dir,
                phase: (Math.PI * 2 * i) / cfg.count,
            },
        });
    }
    return facets;
}

// Re-arm (REPLACE) the facet ring for an aspect. Wrapped so phase onEnter
// handlers and the initial spawn share one code path. `now` flows through to
// boss-parts so the orbit clock restarts cleanly at each aspect.
function armAspectRing(boss, aspectIdx, ctx, now) {
    initBossParts(boss, ringScriptForAspect(aspectIdx), ctx, now);
}

// ── Signature telegraphed attack (per-aspect cadence machine) ───────────────
// A pure state machine on `boss.signature`, advanced purely by elapsed `now`,
// re-armed each aspect with that aspect's cadence + element. The boss's own
// update calls updateSignatureAttack each frame.
//
// Cycle: IDLE --(cooldown)--> TELEGRAPH (wind-up) --(telegraphMs)--> FIRE
//        --(fireMs)--> IDLE (cooldown) ...
// Exposed flags the engine + the unit test read:
//   boss.signature.state    — ATTACK_IDLE | ATTACK_TELEGRAPH | ATTACK_FIRE
//   boss.signatureTelegraph — true during the wind-up window
//   boss.signatureFiring    — true during the strike window
//   boss.signature.fires    — count of completed strikes (FIRE entries)
//   boss.signature.attackId — the active aspect's attack id (e.g. 'cinder-storm')
export function armSignatureAttack(boss, aspectIdx, now) {
    const cfg = ASPECT_ATTACK[aspectIdx] || ASPECT_ATTACK[ASPECT_ATTACK.length - 1];
    const aspect = aspectFor(aspectIdx);
    const mul = boss && boss._enraged ? ENRAGE_CADENCE_MUL : 1;
    boss.signature = {
        aspectIdx,
        attackId: cfg.id,
        element: aspect.secondaryElement || aspect.element, // finale attack = RADIANT
        telegraphMs: cfg.telegraphMs * mul,
        fireMs: cfg.fireMs * mul,
        cooldownMs: cfg.cooldownMs * mul,
        state: ATTACK_IDLE,
        // First wind-up begins after the initial cooldown so the aspect doesn't
        // open mid-strike.
        nextAt: now + cfg.cooldownMs * mul,
        fires: 0,
    };
    boss.signatureTelegraph = false;
    boss.signatureFiring = false;
    return true;
}

// Advance the signature-attack state machine. Pure + deterministic on `now`;
// resolves any number of transitions crossed in a single frame (so a big `now`
// jump still lands in a consistent state). No-op while mid-intro / dying.
export function updateSignatureAttack(boss, now) {
    const s = boss && boss.signature;
    if (!s) return null;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return null;

    let edge = null;
    let guard = 0;
    while (now >= s.nextAt && guard++ < 8) {
        if (s.state === ATTACK_IDLE) {
            s.state = ATTACK_TELEGRAPH;      // cooldown elapsed → wind-up
            s.nextAt += s.telegraphMs;
            edge = 'telegraph';
        } else if (s.state === ATTACK_TELEGRAPH) {
            s.state = ATTACK_FIRE;           // wind-up elapsed → strike
            s.fires += 1;
            s.nextAt += s.fireMs;
            edge = 'fire';
        } else { // ATTACK_FIRE
            s.state = ATTACK_IDLE;           // strike done → cooldown
            s.nextAt += s.cooldownMs;
            edge = 'idle';
        }
    }
    boss.signatureTelegraph = (s.state === ATTACK_TELEGRAPH);
    boss.signatureFiring = (s.state === ATTACK_FIRE);
    return edge;
}

export function signatureState(boss) {
    return (boss && boss.signature) ? boss.signature.state : ATTACK_IDLE;
}
export function isSignatureTelegraphing(boss) {
    return !!(boss && boss.signatureTelegraph);
}
export function isSignatureFiring(boss) {
    return !!(boss && boss.signatureFiring);
}
export function signatureFireCount(boss) {
    return (boss && boss.signature) ? boss.signature.fires : 0;
}
export function signatureAttackId(boss) {
    return (boss && boss.signature) ? boss.signature.attackId : null;
}

// ── Phase script (consumed by boss-phases.js) — FIVE aspects ────────────────
// Each aspect onEnter re-arms that aspect's ring + swaps in its signature attack.
// The final aspect additionally flips the enrage flag (which, since it precedes
// the re-arm, tightens that aspect's signature cadence). Each handler reads `now`
// off the boss so the orbit/cadence clocks stay deterministic in tests
// (boss-phases passes no `now` into onEnter).
export function buildPhaseScript() {
    const phases = [];
    for (let i = 0; i < ASPECT_COUNT; i++) {
        const aspect = ASPECTS[i];
        if (i === 0) {
            // Aspect 0 is the spawn aspect; armed by initPrismarch, not here.
            phases.push({ id: `prismarch-${aspect.id}`, name: aspect.name, onEnter: () => {} });
            continue;
        }
        const aspectIdx = i;
        const isFinal = !!aspect.final;
        phases.push({
            id: `prismarch-${aspect.id}`,
            name: aspect.name,
            enterAtHpFraction: ASPECT_GATES[i],
            onEnter: (boss, ctx) => {
                const now = boss._now || Date.now();
                // Enrage BEFORE re-arming the finale so its signature cadence is
                // already tightened when armSignatureAttack reads `_enraged`.
                if (isFinal) triggerEnrage(boss, ctx);
                armAspectRing(boss, aspectIdx, ctx, now);
                armSignatureAttack(boss, aspectIdx, now);
            },
        });
    }
    return phases;
}

// ── Enrage (final-aspect escalation) ────────────────────────────────────────
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
        { id: 'reality-tear', name: 'Reality Tears', durationMs: 1600 },
        { id: 'name-card', name: 'THE PRISMARCH', durationMs: 2400 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

// The death sequence is grander than a regular boss (it's the run finale): each
// aspect's facets blow out in sequence, then the prism shatters, then a final
// white-out before the victory beat. BOSS-04 wires the run-complete / cinematic
// onto this sequence's onComplete; this module just exposes it.
export function buildDeathScript() {
    return [
        { id: 'aspects-shatter', name: 'Aspects Shatter', durationMs: 1100 },
        { id: 'prism-collapse', name: 'Prism Collapses', durationMs: 1300 },
        { id: 'omega-burst', name: 'Omega Burst', durationMs: 1500 },
        { id: 'white-out', name: 'White-Out', durationMs: 1200 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// All seven elements represented across the fight (for the renderer / codex /
// the unit test). KINETIC is the chassis baseline; the six aspect elements
// (PYRO/CRYO/VOLT/TOXIC/VOID/RADIANT) walk the wheel across the gauntlet.
export const PRISMARCH_ELEMENTS = ELEMENT_IDS.slice();

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const PRISMARCH = {
    id: 'PRISMARCH',
    name: 'THE PRISMARCH',
    stage: 10,           // appears from stage 10 (tier 10-30 band)
    tierBand: [10, 30],
    element: 'VOID',     // chassis element; the FIGHT walks all seven aspects
    elements: PRISMARCH_ELEMENTS, // all 7 represented across the gauntlet
    maxHealth: PRISMARCH_MAX_HEALTH,
    size: 140,
    color: '#7744dd',    // VOID tint (matches ELEMENTS.VOID.color)
    glowColor: '#b08cff',
    isBoss: true,
    isFinalBoss: true,   // THE final boss — BOSS-04 keys run-complete off this
    phaseCount: ASPECT_COUNT,
    aspectCount: ASPECT_COUNT,
    aspects: ASPECTS,
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    ringScriptForAspect,
    initBoss: initPrismarch,
    updateBoss: updatePrismarch,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the FIVE-aspect phase script, the aspect-0 ring
// + signature attack, and the intro sequence. Death is armed lazily by
// tickPrismarchDeath / armPrismarchDeath.
export function initPrismarch(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.isFinalBoss = true;
    boss.bossId = PRISMARCH.id;
    boss.name = PRISMARCH.name;
    boss.element = PRISMARCH.element;
    boss.maxHealth = PRISMARCH.maxHealth;
    boss.health = PRISMARCH.maxHealth;
    boss.size = boss.size || PRISMARCH.size;
    boss._enraged = false;
    boss._now = now;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armAspectRing(boss, 0, ctx, now);       // aspect-0 (PYRO) ring
    armSignatureAttack(boss, 0, now);       // aspect-0 signature attack
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, the signature attack, and phases (in
// that order) with one shared `now`. Stashes `now` on the boss so phase onEnter
// handlers can restart the orbit/cadence clocks deterministically. Returns
// whether the core is currently killable (parts gate only; the caller's damage
// pipeline ORs in the intro / phase-transition invuln windows).
export function updatePrismarch(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateSignatureAttack(boss, now);
    updateBossPhases(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the CORE (this aspect's ring is down).
// Facets always reachable regardless. Mirrors boss-parts' coreBlocksDamage but
// framed positively for the firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// ── Convenience read-throughs (thin wrappers over chassis) ──────────────────
export function prismarchCurrentPhase(boss) {
    return currentPhase(boss);
}
export function prismarchLivingFacets(boss) {
    return livingPartCount(boss);
}
export function prismarchIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// The active aspect descriptor (element/name/etc.) for the HUD / renderer.
export function prismarchCurrentAspect(boss) {
    const phase = currentPhase(boss);
    if (!phase || !boss || !boss._phaseState) return aspectFor(0);
    return aspectFor(boss._phaseState.index);
}

// FINAL-BOSS read-through (the spec's required hook). True once the boss has
// entered the fifth/final aspect (OMEGA). BOSS-04 keys run-complete off this +
// the death sequence; this module only exposes the flag.
export function prismarchReachedFinalAspect(boss) {
    return isFinalPhase(boss);
}

// True if the descriptor / instance is the final boss. Convenience for spawner.
export function isFinalBoss(boss) {
    if (boss === PRISMARCH) return true;
    return !!(boss && boss.isFinalBoss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss. BOSS-04 supplies the onComplete that
// fires the run-complete / cinematic / summary — this module just runs the beats.
export function armPrismarchDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickPrismarchDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default PRISMARCH;
