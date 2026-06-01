// GEMINI — stage 4-12 boss (BOSS-08).
//
// The Pyro+Cryo TWIN boss. Two large weak-point cores orbit the central LINK:
//   • the PYRO twin — strongly resists Pyro, but is WEAK to Cryo
//   • the CRYO twin — strongly resists Cryo, but is WEAK to Pyro
// Because the twins carry OPPOSITE resists, neither can be efficiently killed by
// the element it embodies — the player must bring BOTH counter-elements and
// split fire across the pair. The central LINK (the boss core) is invulnerable
// while EITHER twin still lives (both twins are `shieldsCore` parts), so the
// core only opens once the pair is fully shed.
//
// TWO signature mechanics on top of the Harbinger/Aegis/Iron-Throne template:
//   • TETHER — while BOTH twins live they are linked: `boss.tetherActive` is
//     true (a flag the renderer draws an energy beam off, and the AI/firing path
//     keys shared attacks off). The instant one twin dies the tether snaps.
//   • PARTNER-ENRAGE — when ONE twin dies the SURVIVING twin ENRAGES: it is
//     buffed (a damage/fire-rate bump flagged on the part and the boss). Modeled
//     as `boss.partnerEnraged` (the surviving twin's id) + `part.partnerEnraged`
//     on the survivor instance, exposed through `survivingTwin` / `isPartnerEnraged`.
//
// Each of the 3 HP-gated phases RE-ARMS a fresh, tougher twin PAIR (so the
// opposite-resist puzzle resets harder, and the tether re-links). The final
// phase additionally ENRAGES the whole boss.
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
    getBossPart,
} from '../boss-parts.js';
import {
    initBossIntro,
    updateBossIntro,
    initBossDeath,
    updateBossDeath,
} from '../boss-intro.js';

// The two twins + their element identities. Each twin RESISTS the element it
// embodies and is WEAK to the OPPOSITE element — that opposition is the whole
// fight (you must bring both Pyro AND Cryo). Stable part-id prefixes too.
export const PYRO_TWIN = 'PYRO';
export const CRYO_TWIN = 'CRYO';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Most of the fight is spent grinding the twin pair (the LINK is gated while
// either twin lives, and each twin resists its own element). HP cut ~35%
// (1300 → 850) — core + both twins per phase trimmed — for shorter, snappier
// boss fights that don't drag.
export const GEMINI_MAX_HEALTH = 850;

// How resistant a twin is to the element it embodies (0..1; 1 = immune). High
// enough that same-element fire is mostly wasted → forces the opposite element.
// Bumped per phase below.
const SAME_ELEMENT_RESIST = [0.85, 0.92, 0.96];

// How WEAK a twin is to the OPPOSITE element (NEGATIVE resist → a damage BONUS
// via elementalMultiplier, capped at 2). Constant across phases.
const OPPOSITE_WEAKNESS = -0.5;

// Twin pair per phase: TOUGHER (more HP) + MORE RESISTANT (higher same-element
// resist) + a faster co-orbit each phase. `speed` is rad/s (boss-parts orbit
// math); the two twins orbit the LINK in opposition (half a turn apart).
const PHASE_TWINS = [
    // Phase 0 — opening: a wide, slow pair.
    { radius: 150, hp: 170, speed: 0.45, partRadius: 34 },
    // Phase 1 — mid: tighter + tougher + faster.
    { radius: 125, hp: 235, speed: 0.75, partRadius: 34 },
    // Phase 2 — enrage: tight, heavy, fast co-spin.
    { radius: 100, hp: 310, speed: 1.15, partRadius: 36 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.6, 0.3];

// The opposite element a twin embodying `el` is weak to (its counter).
export function oppositeElement(el) {
    return el === PYRO_TWIN ? CRYO_TWIN : PYRO_TWIN;
}

// Build the resist map for a twin embodying `selfEl`: a high resist to its OWN
// element and a NEGATIVE resist (weakness) to the OPPOSITE element. Pure data —
// the damage pipeline resolves the multiplier via elements.elementalMultiplier.
function twinResistMap(phaseIdx, selfEl) {
    const same = SAME_ELEMENT_RESIST[phaseIdx] != null
        ? SAME_ELEMENT_RESIST[phaseIdx]
        : SAME_ELEMENT_RESIST[SAME_ELEMENT_RESIST.length - 1];
    const oppEl = oppositeElement(selfEl);
    const resist = {};
    resist[selfEl] = same;          // resists its own element
    resist[oppEl] = OPPOSITE_WEAKNESS; // weak to the opposite → a damage bonus
    return resist;
}

// Build the two-twin parts-script for a given phase index. Both twins shield the
// LINK (core), co-orbit the centre half a turn apart, and carry OPPOSITE resists
// (PYRO twin resists Pyro / weak to Cryo; CRYO twin vice-versa). `weakness` is the
// element the twin must be hit with. Phases alternate co-orbit direction.
export function twinScriptForPhase(phaseIdx) {
    const cfg = PHASE_TWINS[phaseIdx] || PHASE_TWINS[PHASE_TWINS.length - 1];
    const dir = (phaseIdx % 2 === 0) ? 1 : -1; // alternate co-spin direction per phase
    const elems = [PYRO_TWIN, CRYO_TWIN];
    return elems.map((selfEl, i) => ({
        id: `p${phaseIdx}-twin-${selfEl}`,
        name: `${selfEl} Twin`,
        maxHealth: cfg.hp,
        radius: cfg.partRadius,
        shieldsCore: true,
        // The twin's embodied element + the OPPOSITE element it's weak to.
        element: selfEl,
        weakness: oppositeElement(selfEl),
        resist: twinResistMap(phaseIdx, selfEl),
        // The two twins co-orbit the LINK half a turn (PI) apart.
        orbit: {
            radius: cfg.radius,
            speed: cfg.speed * dir,
            phase: i * Math.PI,
        },
    }));
}

// Re-arm (REPLACE) the twin pair for a phase. Wrapped so phase onEnter handlers
// and the initial spawn share one code path. `now` flows through to boss-parts so
// the orbit clock restarts cleanly. Re-links the tether (both twins fresh) and
// clears any prior partner-enrage (a NEW pair starts un-enraged).
function armPhaseTwins(boss, phaseIdx, ctx, now) {
    initBossParts(boss, twinScriptForPhase(phaseIdx), ctx, now);
    boss.partnerEnraged = null;     // fresh pair → no survivor yet
    refreshTether(boss);            // both twins live → tether links
}

// ── Tether + partner-enrage (the twin-relationship mechanics) ───────────────
// The tether is LIVE while BOTH twins survive; it snaps the instant one dies.
// Recomputes `boss.tetherActive` from the current living-twin count and, when a
// twin has JUST been lost (exactly one left), ENRAGES the survivor.
export function refreshTether(boss) {
    if (!boss) return false;
    const living = livingParts(boss);
    const both = living.length >= 2;
    boss.tetherActive = both;
    if (!both && living.length === 1) enragePartner(boss, living[0]);
    return both;
}

// PARTNER-ENRAGE: buff the SURVIVING twin when its partner dies. Latched per
// survivor instance so it fires exactly once. Buffs the part (a damage + fire
// multiplier the engine firing/damage path reads) and records the survivor on
// the boss as `boss.partnerEnraged` (the twin's element id) for the HUD / AI.
export function enragePartner(boss, survivor) {
    if (!boss || !survivor || survivor.partnerEnraged) return false;
    survivor.partnerEnraged = true;
    survivor.enrageDamageMul = 1.6;   // hits harder…
    survivor.enrageFireMul = 0.6;     // …and faster (lower cooldown)
    boss.partnerEnraged = survivor.element || survivor.id || true;
    boss._partnerEnragedAt = boss._now || Date.now();
    return true;
}

// True if the surviving twin is partner-enraged (read-through for HUD / AI).
export function isPartnerEnraged(boss) {
    return !!(boss && boss.partnerEnraged);
}

// True while both twins survive and the link tether is live.
export function isTetherActive(boss) {
    return !!(boss && boss.tetherActive);
}

// The lone surviving twin part instance once its partner has died, else null.
export function survivingTwin(boss) {
    const living = livingParts(boss);
    return living.length === 1 ? living[0] : null;
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms (replaces) that phase's twin pair (tougher, tether re-linked);
// the final phase additionally flips the boss-wide enrage flag. Each handler reads
// `now` off the boss so the orbit clock stays deterministic in tests (boss-phases
// passes no `now` into onEnter).
export function buildPhaseScript() {
    return [
        {
            id: 'gemini-p0',
            name: 'Twin Stars',
            // Phase 0 is the spawn phase; armed by initGemini, not here.
            onEnter: () => {},
        },
        {
            id: 'gemini-p1',
            name: 'Reforged Pair',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => armPhaseTwins(boss, 1, ctx, boss._now || Date.now()),
        },
        {
            id: 'gemini-p2',
            name: 'Eclipse',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                armPhaseTwins(boss, 2, ctx, boss._now || Date.now());
                triggerEnrage(boss, ctx);
            },
        },
    ];
}

// ── Enrage (final-phase, boss-wide escalation) ──────────────────────────────
// Distinct from PARTNER-enrage (per-twin, on a partner death). This is the
// whole-boss final-phase enrage. Latched so it fires exactly once. Bumps fire
// rate + flags homing for the engine firing path (wired later); the flag itself
// is the contract the rest of the game keys off.
export function triggerEnrage(boss, _ctx = null) {
    if (!boss || boss._enraged) return false;
    boss._enraged = true;
    boss._enragedAt = boss._now || Date.now();
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
        { id: 'name-card', name: 'GEMINI', durationMs: 2000 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'twins-collapse', name: 'Twins Collapse', durationMs: 900 },
        { id: 'link-shatter', name: 'Link Shatters', durationMs: 1100 },
        { id: 'supernova', name: 'Supernova', durationMs: 1200 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const GEMINI = {
    id: 'GEMINI',
    name: 'GEMINI',
    stage: 4,           // appears from stage 4 (tier 4-12 band)
    tierBand: [4, 12],
    element: 'PYRO',    // chassis tint; the FIGHT is Pyro vs Cryo opposition
    maxHealth: GEMINI_MAX_HEALTH,
    size: 116,
    color: '#ff5522',   // PYRO/CRYO duality — Pyro tint (matches ELEMENTS.PYRO.color)
    glowColor: '#66ccff', // …with a CRYO glow (ELEMENTS.CRYO.color)
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    twinElements: [PYRO_TWIN, CRYO_TWIN],
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    twinScriptForPhase,
    oppositeElement,
    initBoss: initGemini,
    updateBoss: updateGemini,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the phase script, the phase-0 twin pair (tether
// linked), and the intro sequence. Death is armed lazily by tickGeminiDeath.
export function initGemini(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = GEMINI.id;
    boss.name = GEMINI.name;
    boss.element = GEMINI.element;
    boss.maxHealth = GEMINI.maxHealth;
    boss.health = GEMINI.maxHealth;
    boss.size = boss.size || GEMINI.size;
    boss._enraged = false;
    boss.tetherActive = false;
    boss.partnerEnraged = null;
    boss._now = now;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhaseTwins(boss, 0, ctx, now);          // phase-0 twin pair + tether
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, phases (in that order), then recompute the
// tether/partner-enrage from the current living-twin count — all with one shared
// `now`. Stashes `now` on the boss so phase onEnter handlers can restart the orbit
// clock deterministically. Returns whether the core (LINK) is currently killable
// (both twins down).
export function updateGemini(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateBossPhases(boss, ctx, now);
    refreshTether(boss); // re-evaluate tether + trigger partner-enrage on a loss
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the LINK (core) — both twins are down.
// Mirrors boss-parts' coreBlocksDamage but framed positively for firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// ── Opposite-resist resolution (the Pyro-vs-Cryo counterplay) ───────────────
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

// The element a twin is WEAK to, accepting BOTH the script def shape (the raw twin
// def carries `weakness`) AND a live chassis part instance (whose `def` references
// the original twin def — the chassis copies element + resist onto the instance,
// but the weakness rides on `def`). Returns null if neither carries one.
export function twinWeakness(twin) {
    if (!twin) return null;
    return twin.weakness || (twin.def && twin.def.weakness) || null;
}

// True if `src`'s element matches a twin's weakness (string / object / array
// element shapes accepted). Works on both script defs and live part instances.
export function isTwinWeakness(twin, src) {
    if (!twin) return false;
    const weak = twinWeakness(twin);
    if (!weak) return false;
    if (!src) return false;
    if (typeof src === 'string') return src === weak;
    if (Array.isArray(src)) return src.includes(weak);
    if (Array.isArray(src.elements)) return src.elements.includes(weak);
    return src.element === weak;
}

// Effective damage for a hit of `amount` against a twin, honoring its per-element
// resist via the SHIPPED elements.elementalMultiplier:
//   • the OPPOSITE element (its weakness) → full + bonus (multiplier > 1)
//   • the SAME element (what it embodies)  → heavily reduced (near-immune)
//   • no element / unknown                 → reduced (treated as off-element)
// Pure helper the collision pipeline calls before damageBossPart; returned so the
// test can assert "opposite = full damage, same-element = reduced".
export function resolveTwinDamage(twin, amount, src) {
    if (!twin || !(amount > 0)) return 0;
    const resistMap = twin.resist || (twin.def && twin.def.resist) || null;
    const el = _srcElement(src);
    let mult = 1;
    if (resistMap && el) {
        const r = resistMap[el];
        if (r) mult = Math.min(2, Math.max(0, 1 - r)); // mirrors elementalMultiplier
    } else if (resistMap && !el) {
        // No element id → treat as off-element (resisted, not free).
        const anyKey = Object.keys(resistMap).find((k) => resistMap[k] > 0);
        if (anyKey) mult = Math.min(2, Math.max(0, 1 - resistMap[anyKey]));
    }
    return amount * mult;
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function geminiCurrentPhase(boss) {
    return currentPhase(boss);
}
export function geminiLivingTwins(boss) {
    return livingPartCount(boss);
}
export function geminiTwinList(boss) {
    return livingParts(boss);
}
export function geminiTwin(boss, element) {
    // The twin part for the current phase by its embodied element.
    const phaseIdx = (boss && boss._phaseState) ? boss._phaseState.index : 0;
    return getBossPart(boss, `p${phaseIdx}-twin-${element}`);
}
export function geminiIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the intro,
// so both can live on one boss.
export function armGeminiDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickGeminiDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default GEMINI;
