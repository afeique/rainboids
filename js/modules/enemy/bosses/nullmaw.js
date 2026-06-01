// NULLMAW THE DEVOURER — stage 9-27 boss (BOSS-13).
//
// A VOID boss built on the SHIPPED chassis, mirroring THE HARBINGER / MAELSTROM
// shape: data + a thin, pure driver over boss-phases / boss-parts / boss-intro.
// It owns no engine deps and never touches the cores. What makes Nullmaw
// *Nullmaw*:
//
//   • THE MAW — the core is gated by a single front MAW weak-point (shieldsCore:
//     true). While the maw lives the core is invulnerable, so the player must
//     break the maw open to reach the core. Each phase re-arms a fresh, tougher
//     maw (the core re-shields per phase) and the final phase enrages.
//
//   • PROJECTILE-EAT CONE — a telegraphed cadence where the maw OPENS and
//     ABSORBS player bullets that fly into its front cone. Feeding it is
//     punished: every absorbed bullet raises a MAW-SHIELD counter (the maw heals
//     / hardens), so spamming bullets at an open maw is a trap. Beams + melee
//     conceptually bypass (only `bullet`-type projectiles are eaten). The pure
//     `mawAbsorbs(boss, projectile)` helper is the contract the engine + the
//     unit test key off: true ONLY for a bullet-type inside the cone while open.
//
//   • GRAVITY PULL — a telegraphed pull cadence. A pure, now-driven state
//     machine cycles IDLE → TELEGRAPH (wind-up) → PULL (active drag) → cooldown.
//     `boss.pullTelegraph` warns; `boss.pullActive` is the drag window.
//
//   • IMPLOSION — a big telegraphed nuke fired near each phase's end (when the
//     phase's HP is nearly spent). `boss.implosionTelegraph` winds up, then
//     FIRES once per phase. The actual blast is the engine's job once spawning
//     lands; the telegraph→fire edge is the contract here.
//
// SELF-CONTAINED + PURE + HEADLESS: everything is driven through the chassis'
// public API with an explicit `now`, so the whole boss is deterministic in unit
// tests (no DOM, no RAF). Spawn wiring (registry + wave hook) is BOSS-04's job;
// this file deliberately does NOT register itself anywhere.

import {
    initBossPhases,
    updateBossPhases,
    currentPhase,
    currentPhaseIndex,
    isFinalPhase,
} from '../boss-phases.js';
import {
    initBossParts,
    updateBossParts,
    coreBlocksDamage,
    livingPartCount,
    livingParts,
} from '../boss-parts.js';
import {
    initBossIntro,
    updateBossIntro,
    initBossDeath,
    updateBossDeath,
} from '../boss-intro.js';
import { drawNullmaw } from './render/nullmaw-render.js';

// ── Tuning ──────────────────────────────────────────────────────────────────
// Most of the fight is spent breaking the maw open (the core is gated while the
// maw lives). HP cut ~35% (1300 → 850) — core + per-phase maw both trimmed — for
// shorter, snappier boss fights that don't drag.
export const NULLMAW_MAX_HEALTH = 850;

// THE MAW weak-point per phase: a single front gate, tougher each phase. It sits
// at a boss-local offset and rotates with the boss so it always faces forward.
// `coneHalfAngle` is the half-width (rad) of the projectile-eat cone; `coneRange`
// is how far in front the cone reaches. Each phase widens + lengthens the cone
// (the maw gets greedier) while the maw itself gets tougher.
const PHASE_MAW = [
    // Phase 0 — opening: a modest maw, narrow cone.
    { hp: 80, radius: 34, offset: 70, coneHalfAngle: 0.45, coneRange: 520 },
    // Phase 1 — mid: tougher maw, wider/longer cone.
    { hp: 105, radius: 36, offset: 66, coneHalfAngle: 0.55, coneRange: 600 },
    // Phase 2 — enrage: heaviest maw, widest/longest cone.
    { hp: 135, radius: 40, offset: 62, coneHalfAngle: 0.70, coneRange: 720 },
];

// HP fractions at which each phase opens (descending — boss-phases convention).
const PHASE_GATES = [1.0, 0.62, 0.3];

// PROJECTILE-EAT cadence per phase (ms). The maw is mostly CLOSED; on a cadence
// it OPENS for `openMs` (the absorb window), telegraphing first for `windupMs`.
// Each phase opens the maw sooner + longer (greedier). Tighter cooldown = more
// frequent feeding traps.
const PHASE_EAT = [
    { windupMs: 900, openMs: 1600, cooldownMs: 4200 },
    { windupMs: 750, openMs: 1900, cooldownMs: 3400 },
    { windupMs: 550, openMs: 2300, cooldownMs: 2600 },
];

// GRAVITY-PULL cadence per phase (ms). IDLE → TELEGRAPH (wind-up warning) →
// PULL (active drag) → cooldown. Each phase pulls harder + more often.
const PHASE_PULL = [
    { telegraphMs: 1100, pullMs: 1400, cooldownMs: 5000, strength: 1.0 },
    { telegraphMs: 900, pullMs: 1700, cooldownMs: 4000, strength: 1.35 },
    { telegraphMs: 650, pullMs: 2100, cooldownMs: 3000, strength: 1.8 },
];

// IMPLOSION fires once per phase, near the END of that phase's HP band. The
// telegraph winds up while the boss's HP within the phase falls below a small
// threshold; then it FIRES once. `windupMs` is the wind-up; enrage shortens it.
const IMPLOSION_WINDUP_MS = 1500;
const ENRAGE_IMPLOSION_MUL = 0.6;
// Trigger the IMPLOSION wind-up when HP drops within this fraction of the NEXT
// phase gate (i.e. "near the phase end"). For the final phase, near 0.
const IMPLOSION_HP_MARGIN = 0.05;

export const EAT_CLOSED = 'CLOSED';
export const EAT_WINDUP = 'WINDUP';
export const EAT_OPEN = 'OPEN';

export const PULL_IDLE = 'IDLE';
export const PULL_TELEGRAPH = 'TELEGRAPH';
export const PULL_ACTIVE = 'ACTIVE';

// Bullet-type projectile kinds the maw can eat. Beams + melee bypass — they are
// NOT in this set (the helper checks membership). Modeled as a string `type` on
// the projectile, matching the engine's bullet/beam/melee taxonomy.
const ABSORBABLE_TYPES = new Set(['bullet']);

// ── THE MAW weak-point (parts script) ───────────────────────────────────────
// A single front gate that shields the core and rotates with the boss so it
// always faces "forward" (boss.angle). Destroying it opens the core-damage
// window; each new phase re-arms a fresh, tougher maw.
export function mawScriptForPhase(phaseIdx) {
    const cfg = PHASE_MAW[phaseIdx] || PHASE_MAW[PHASE_MAW.length - 1];
    return [
        {
            id: `p${phaseIdx}-maw`,
            name: 'The Maw',
            maxHealth: cfg.hp,
            radius: cfg.radius,
            shieldsCore: true,          // core is invuln while the maw lives
            element: 'VOID',
            // Front-mounted weak-point: a boss-local offset rotated by boss.angle
            // so the maw tracks the boss's facing.
            offset: { x: cfg.offset, y: 0 },
            rotateWithBoss: true,
        },
    ];
}

// Re-arm the maw for a phase. Wrapped so phase onEnter handlers (and the initial
// spawn) share one code path. `now` flows through to boss-parts so the part
// clock restarts cleanly at each phase.
function armPhaseMaw(boss, phaseIdx, ctx, now) {
    initBossParts(boss, mawScriptForPhase(phaseIdx), ctx, now);
}

// ── PROJECTILE-EAT cone (telegraphed absorb cadence) ─────────────────────────
// A pure state machine on `boss.maw`, advanced by elapsed `now`. The maw is
// mostly CLOSED; it telegraphs (WINDUP) then OPENS for an absorb window, then
// cools down. While OPEN, `boss.mawOpen` is true and bullets that enter the cone
// are eaten (raising `boss.mawShield` / `boss.absorbed`). Re-armed per phase.
//
// Exposed flags the engine + the unit test read:
//   boss.maw.state    — EAT_CLOSED | EAT_WINDUP | EAT_OPEN
//   boss.mawOpen      — true during the OPEN absorb window
//   boss.mawShield    — counter that RISES while fed (punishes feeding)
//   boss.absorbed     — total bullets absorbed (alias view of the count)
export function armMawCone(boss, phaseIdx, now) {
    const cfg = PHASE_EAT[phaseIdx] || PHASE_EAT[PHASE_EAT.length - 1];
    const cone = PHASE_MAW[phaseIdx] || PHASE_MAW[PHASE_MAW.length - 1];
    boss.maw = {
        phaseIdx,
        windupMs: cfg.windupMs,
        openMs: cfg.openMs,
        cooldownMs: cfg.cooldownMs,
        coneHalfAngle: cone.coneHalfAngle,
        coneRange: cone.coneRange,
        state: EAT_CLOSED,
        // First wind-up begins after the initial cooldown so the fight doesn't
        // open with the maw already gaping.
        nextAt: now + cfg.cooldownMs,
    };
    boss.mawOpen = false;
    // Preserve any shield/absorb the boss has accrued across phases (feeding
    // carries forward — the punishment is cumulative). Seed on first arm.
    if (typeof boss.mawShield !== 'number') boss.mawShield = 0;
    if (typeof boss.absorbed !== 'number') boss.absorbed = 0;
    return true;
}

// Advance the projectile-eat state machine. Pure + deterministic on `now`;
// resolves any number of transitions crossed in a single frame. No-op while the
// boss is mid-intro / dying / warping.
export function updateMawCone(boss, now) {
    const m = boss && boss.maw;
    if (!m) return;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return;

    let guard = 0;
    while (now >= m.nextAt && guard++ < 8) {
        if (m.state === EAT_CLOSED) {
            // Cooldown elapsed → begin the open telegraph (the warning).
            m.state = EAT_WINDUP;
            m.nextAt += m.windupMs;
        } else if (m.state === EAT_WINDUP) {
            // Wind-up elapsed → the maw gapes open (the absorb window).
            m.state = EAT_OPEN;
            m.nextAt += m.openMs;
        } else { // EAT_OPEN
            // Open window done → snap shut, cool down.
            m.state = EAT_CLOSED;
            m.nextAt += m.cooldownMs;
        }
    }
    boss.mawOpen = (m.state === EAT_OPEN);
}

export function mawConeState(boss) {
    return (boss && boss.maw) ? boss.maw.state : EAT_CLOSED;
}
export function isMawOpen(boss) {
    return !!(boss && boss.mawOpen);
}
export function isMawTelegraphing(boss) {
    return !!(boss && boss.maw && boss.maw.state === EAT_WINDUP);
}
export function mawShield(boss) {
    return (boss && typeof boss.mawShield === 'number') ? boss.mawShield : 0;
}
export function absorbedCount(boss) {
    return (boss && typeof boss.absorbed === 'number') ? boss.absorbed : 0;
}

// PURE cone test: is `projectile` inside the maw's front absorb cone right now?
// Independent of open/closed state (geometry only) — `mawAbsorbs` layers the
// open + bullet-type gates on top. Cone apex sits at the maw's world position
// (or the boss centre as a fallback), pointing along `boss.angle`.
function _coneApex(boss) {
    // Prefer the living maw part's world position so the cone tracks the maw.
    const parts = livingParts(boss);
    for (const p of parts) {
        if (p && p.shieldsCore) return { x: p.x, y: p.y };
    }
    return { x: boss.x || 0, y: boss.y || 0 };
}

export function projectileInCone(boss, projectile) {
    const m = boss && boss.maw;
    if (!m || !projectile) return false;
    const apex = _coneApex(boss);
    const dx = (projectile.x || 0) - apex.x;
    const dy = (projectile.y || 0) - apex.y;
    const dist = Math.hypot(dx, dy);
    if (dist > m.coneRange) return false;
    if (dist < 1e-6) return true; // sitting on the apex → inside
    // Angle between the maw's facing and the apex→projectile vector.
    const facing = boss.angle || 0;
    const toProj = Math.atan2(dy, dx);
    let diff = toProj - facing;
    // Normalize to [-π, π].
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) <= m.coneHalfAngle;
}

// THE contract the engine + the unit test assert: does the maw ABSORB this
// projectile? True ONLY for a bullet-type projectile inside the cone while the
// maw is OPEN. Beams / melee (non-bullet types) bypass; a closed maw eats
// nothing; bullets outside the cone fly past. Pure — no mutation.
export function mawAbsorbs(boss, projectile) {
    if (!boss || !projectile) return false;
    if (!isMawOpen(boss)) return false;
    // Beams + melee bypass — only bullet-type projectiles are eaten.
    const type = projectile.type || 'bullet';
    if (!ABSORBABLE_TYPES.has(type)) return false;
    return projectileInCone(boss, projectile);
}

// FEED the maw: call when a projectile is confirmed absorbed (the engine routes
// the would-be hit here instead of damaging anything). Raises the maw-shield +
// absorbed counters — "punishes feeding the maw." Returns the new shield value.
// `gain` is the shield raised per absorbed bullet (default 1).
export function feedMaw(boss, gain = 1) {
    if (!boss) return 0;
    if (typeof boss.mawShield !== 'number') boss.mawShield = 0;
    if (typeof boss.absorbed !== 'number') boss.absorbed = 0;
    boss.absorbed += 1;
    boss.mawShield += (gain > 0 ? gain : 0);
    return boss.mawShield;
}

// Convenience the engine can call once per absorbed projectile: test + feed in
// one shot. Returns true (and feeds) iff the projectile was absorbed.
export function tryAbsorb(boss, projectile, gain = 1) {
    if (!mawAbsorbs(boss, projectile)) return false;
    feedMaw(boss, gain);
    return true;
}

// ── GRAVITY PULL (telegraphed pull cadence) ─────────────────────────────────
// A pure state machine on `boss.pull`, advanced by elapsed `now`. IDLE →
// TELEGRAPH (wind-up warning) → ACTIVE (the drag window) → cooldown. Re-armed
// per phase (stronger + more frequent). The engine reads `boss.pullActive` to
// apply the drag toward the boss; `boss.pullTelegraph` is the warning.
export function armGravityPull(boss, phaseIdx, now) {
    const cfg = PHASE_PULL[phaseIdx] || PHASE_PULL[PHASE_PULL.length - 1];
    boss.pull = {
        phaseIdx,
        telegraphMs: cfg.telegraphMs,
        pullMs: cfg.pullMs,
        cooldownMs: cfg.cooldownMs,
        strength: cfg.strength,
        state: PULL_IDLE,
        nextAt: now + cfg.cooldownMs,
        pulls: 0,
    };
    boss.pullTelegraph = false;
    boss.pullActive = false;
    return true;
}

export function updateGravityPull(boss, now) {
    const p = boss && boss.pull;
    if (!p) return;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return;

    let guard = 0;
    while (now >= p.nextAt && guard++ < 8) {
        if (p.state === PULL_IDLE) {
            p.state = PULL_TELEGRAPH;
            p.nextAt += p.telegraphMs;
        } else if (p.state === PULL_TELEGRAPH) {
            p.state = PULL_ACTIVE;
            p.pulls += 1;
            p.nextAt += p.pullMs;
        } else { // PULL_ACTIVE
            p.state = PULL_IDLE;
            p.nextAt += p.cooldownMs;
        }
    }
    boss.pullTelegraph = (p.state === PULL_TELEGRAPH);
    boss.pullActive = (p.state === PULL_ACTIVE);
}

export function pullState(boss) {
    return (boss && boss.pull) ? boss.pull.state : PULL_IDLE;
}
export function isPullTelegraphing(boss) {
    return !!(boss && boss.pullTelegraph);
}
export function isPullActive(boss) {
    return !!(boss && boss.pullActive);
}

// ── IMPLOSION (big telegraphed attack near each phase's end) ─────────────────
// State on `boss.implosion`: a once-per-phase telegraph→fire. The wind-up arms
// when HP drops "near the phase end" (within IMPLOSION_HP_MARGIN of the next
// gate, or near 0 in the final phase). Then it FIRES once after `windupMs`.
// Exposed flags: `boss.implosionTelegraph` (wind-up), and `boss.implosion.fired`
// (latched per phase). Each new phase re-arms a fresh implosion.
export function armImplosion(boss, phaseIdx, now) {
    boss.implosion = {
        phaseIdx,
        state: 'IDLE',     // IDLE → TELEGRAPH → FIRED
        fireAt: 0,
        fired: false,
        fireCount: (boss.implosion && boss.implosion.fireCount) || 0,
    };
    boss.implosionTelegraph = false;
    return true;
}

// The HP threshold (absolute) at which this phase's IMPLOSION arms its wind-up:
// "near the phase end". For non-final phases that's just above the NEXT gate; for
// the final phase it's a sliver above 0.
function _implosionTriggerHp(boss, phaseIdx) {
    const maxH = boss.maxHealth || 1;
    const nextGate = PHASE_GATES[phaseIdx + 1];
    if (typeof nextGate === 'number') {
        return maxH * (nextGate + IMPLOSION_HP_MARGIN);
    }
    // Final phase — fire near death.
    return maxH * IMPLOSION_HP_MARGIN;
}

function implosionWindup(boss) {
    return IMPLOSION_WINDUP_MS * (boss && boss._enraged ? ENRAGE_IMPLOSION_MUL : 1);
}

// Advance the IMPLOSION state. Pure on `now` + the boss's current HP. Returns
// 'telegraph' or 'fire' on the frame an edge happens (for FX hooks), else null.
export function updateImplosion(boss, now) {
    const im = boss && boss.implosion;
    if (!im) return null;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return null;

    // FIRE edge: wound up + the fire time arrived.
    if (im.state === 'TELEGRAPH' && now >= im.fireAt) {
        im.state = 'FIRED';
        im.fired = true;
        im.fireCount += 1;
        im.firedAt = now;
        boss.implosionTelegraph = false;
        return 'fire';
    }
    // TELEGRAPH edge: HP fell near the phase end → start the wind-up (once).
    if (im.state === 'IDLE') {
        const triggerHp = _implosionTriggerHp(boss, im.phaseIdx);
        if ((boss.health || 0) <= triggerHp) {
            im.state = 'TELEGRAPH';
            im.fireAt = now + implosionWindup(boss);
            boss.implosionTelegraph = true;
            return 'telegraph';
        }
    }
    return null;
}

export function isImplosionTelegraphing(boss) {
    return !!(boss && boss.implosionTelegraph);
}
export function implosionFired(boss) {
    return !!(boss && boss.implosion && boss.implosion.fired);
}
export function implosionFireCount(boss) {
    return (boss && boss.implosion) ? boss.implosion.fireCount : 0;
}

// ── Phase script (consumed by boss-phases.js) ───────────────────────────────
// onEnter re-arms that phase's maw + eat-cone + pull + implosion (a fresh,
// tighter cadence each phase); the final phase additionally flips the enrage
// flag. Each handler reads `now` off the boss so all the clocks stay
// deterministic in tests (boss-phases passes no `now` into onEnter).
function enterPhase(boss, ctx, phaseIdx) {
    const now = boss._now || Date.now();
    armPhaseMaw(boss, phaseIdx, ctx, now);
    armMawCone(boss, phaseIdx, now);
    armGravityPull(boss, phaseIdx, now);
    armImplosion(boss, phaseIdx, now);
}

export function buildPhaseScript() {
    return [
        {
            id: 'nullmaw-p0',
            name: 'Hunger',
            // Phase 0 is the spawn phase; armed by initNullmaw, not here.
            onEnter: () => {},
        },
        {
            id: 'nullmaw-p1',
            name: 'Famine',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => enterPhase(boss, ctx, 1),
        },
        {
            id: 'nullmaw-p2',
            name: 'The Devouring',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                enterPhase(boss, ctx, 2);
                triggerEnrage(boss, ctx);
            },
        },
    ];
}

// ── Enrage (final-phase escalation) ─────────────────────────────────────────
// Latched so it fires exactly once. Bumps fire rate + flags a void-bullet mode
// so the engine-side AI/firing (wired later) can read it; the flag itself is the
// contract the rest of the game keys off.
export function triggerEnrage(boss, _ctx = null) {
    if (!boss || boss._enraged) return false;
    boss._enraged = true;
    boss._enragedAt = boss._now || Date.now();
    // Hooks the engine firing path will honor once spawning lands (BOSS-04+).
    boss.firingCooldownMul = 0.5;
    boss.enableVoidBullets = true;
    return true;
}

export function isEnraged(boss) {
    return !!(boss && boss._enraged);
}

// ── Intro / death sequences (consumed by boss-intro.js) ─────────────────────
export function buildIntroScript() {
    return [
        { id: 'void-rift', name: 'Void Rift', durationMs: 1500 },
        { id: 'name-card', name: 'NULLMAW THE DEVOURER', durationMs: 2200 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}

export function buildDeathScript() {
    return [
        { id: 'maw-collapse', name: 'The Maw Collapses', durationMs: 1000 },
        { id: 'core-unravel', name: 'Core Unravels', durationMs: 1100 },
        { id: 'void-implosion', name: 'Void Implosion', durationMs: 1400 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Descriptor (what BOSS-04's registry will read) ──────────────────────────
export const NULLMAW = {
    id: 'NULLMAW',
    name: 'NULLMAW THE DEVOURER',
    stage: 9,           // appears from stage 9 (tier 9-27 band)
    tierBand: [9, 27],
    element: 'VOID',
    maxHealth: NULLMAW_MAX_HEALTH,
    size: 112,
    color: '#7744dd',   // VOID tint (matches ELEMENTS.VOID.color)
    glowColor: '#a98bf0',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    draw: drawNullmaw,         // 9.1.x per-boss custom renderer (devourer leviathan)
    // Factory hooks the chassis + (later) the spawner use.
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    mawScriptForPhase,
    initBoss: initNullmaw,
    updateBoss: updateNullmaw,
};

// ── Driver: wire a freshly-spawned boss object to the shipped chassis ───────
// `boss` is any object the engine treats as a boss (the unit test uses a plain
// stub). Establishes core stats, the phase script, the phase-0 maw, the phase-0
// eat-cone / pull / implosion cadences, and the intro sequence. Death is armed
// lazily by tickNullmawDeath / armNullmawDeath.
export function initNullmaw(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = NULLMAW.id;
    boss.name = NULLMAW.name;
    boss.element = NULLMAW.element;
    boss.maxHealth = NULLMAW.maxHealth;
    boss.health = NULLMAW.maxHealth;
    boss.size = boss.size || NULLMAW.size;
    boss._enraged = false;
    boss._now = now;
    boss.mawShield = 0;
    boss.absorbed = 0;
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhaseMaw(boss, 0, ctx, now);   // phase-0 maw weak-point
    armMawCone(boss, 0, now);         // phase-0 projectile-eat cadence
    armGravityPull(boss, 0, now);     // phase-0 gravity-pull cadence
    armImplosion(boss, 0, now);       // phase-0 implosion (arms near phase end)
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

// Per-frame tick: advance intro, parts, eat-cone, pull, implosion, then phases
// (in that order) with one shared `now`. Stashes `now` on the boss FIRST so
// phase onEnter handlers can restart all the clocks deterministically. Returns
// whether the core is currently killable (parts gate only; the caller's damage
// pipeline ORs in the intro / phase-transition invuln windows).
export function updateNullmaw(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    updateBossIntro(boss, ctx, now);
    updateBossParts(boss, ctx, now);
    updateMawCone(boss, now);
    updateGravityPull(boss, now);
    updateImplosion(boss, now);
    updateBossPhases(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// True when player damage should reach the CORE (this phase's maw is broken).
// The maw is always reachable regardless. Mirrors boss-parts' coreBlocksDamage
// but framed positively for the firing/HUD code.
export function coreVulnerable(boss) {
    return !coreBlocksDamage(boss);
}

// Convenience read-throughs for the HUD / spawner (thin wrappers over chassis).
export function nullmawCurrentPhase(boss) {
    return currentPhase(boss);
}
export function nullmawCurrentPhaseIndex(boss) {
    return currentPhaseIndex(boss);
}
export function nullmawLivingMaws(boss) {
    return livingPartCount(boss);
}
export function nullmawIsFinalPhase(boss) {
    return isFinalPhase(boss);
}

// Arm + tick the death detonation sequence (called by the engine when the core
// reaches 0 HP; the unit test drives it directly). Independent key from the
// intro, so both can live on one boss.
export function armNullmawDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickNullmawDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

export default NULLMAW;
