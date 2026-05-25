// BOSS-13 — NULLMAW THE DEVOURER (stage 9-27, VOID).
//
// A VOID boss built as data + a thin driver over the SHIPPED boss chassis cores
// (boss-phases / boss-parts / boss-intro). These tests drive the boss headlessly
// through those runners with a stub boss + an explicit `now` (mirroring the
// boss-phases / boss-parts / maelstrom test style) and assert the BOSS DoD plus
// Nullmaw's signature mechanics:
//   • phases advance in order (HP-gated)
//   • the core is invulnerable while THE MAW lives, vulnerable once broken
//   • each phase re-arms a fresh, tougher maw (core re-shields per phase)
//   • PROJECTILE-EAT cone: bullets are absorbed ONLY while the maw is OPEN and
//     inside the cone; beams/melee bypass; feeding raises the maw-shield counter
//   • GRAVITY PULL telegraphs (wind-up) before it goes active, on a cadence
//   • IMPLOSION telegraphs near the phase end, then fires once per phase
//   • enrage fires in the final phase (exactly once)
//   • HP can reach 0 — the boss is killable
import { describe, expect, test } from '@jest/globals';
import {
    NULLMAW,
    NULLMAW_MAX_HEALTH,
    EAT_CLOSED,
    EAT_WINDUP,
    EAT_OPEN,
    PULL_IDLE,
    PULL_TELEGRAPH,
    PULL_ACTIVE,
    initNullmaw,
    updateNullmaw,
    mawScriptForPhase,
    armMawCone,
    updateMawCone,
    mawConeState,
    isMawOpen,
    isMawTelegraphing,
    mawAbsorbs,
    projectileInCone,
    feedMaw,
    tryAbsorb,
    mawShield,
    absorbedCount,
    armGravityPull,
    updateGravityPull,
    pullState,
    isPullTelegraphing,
    isPullActive,
    armImplosion,
    updateImplosion,
    isImplosionTelegraphing,
    implosionFired,
    implosionFireCount,
    coreVulnerable,
    isEnraged,
    nullmawLivingMaws,
    nullmawIsFinalPhase,
    armNullmawDeath,
    tickNullmawDeath,
    buildPhaseScript,
} from '../../../js/modules/enemy/bosses/nullmaw.js';
import {
    currentPhaseIndex,
    currentPhase,
    phaseBlocksDamage,
} from '../../../js/modules/enemy/boss-phases.js';
import {
    livingParts,
    damageBossPart,
    coreBlocksDamage,
} from '../../../js/modules/enemy/boss-parts.js';

// Plain headless stub — no DOM. Matches the chassis' boss-shape expectations
// (active/!dying/!warping gating + position for the offset/cone math).
const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    x: 0, y: 0, angle: 0, ...over,
});

// Break every currently-living maw, routing damage through the chassis
// part-damage path (as the collision pipeline will). Returns how many fell.
function breakAllMaws(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('nullmaw — descriptor', () => {
    test('exposes a clean VOID descriptor with chassis factory hooks', () => {
        expect(NULLMAW.id).toBe('NULLMAW');
        expect(NULLMAW.element).toBe('VOID');
        expect(NULLMAW.isBoss).toBe(true);
        expect(NULLMAW.isFinalBoss).toBe(false);
        expect(NULLMAW.maxHealth).toBe(NULLMAW_MAX_HEALTH);
        expect(NULLMAW.tierBand).toEqual([9, 27]);
        expect(typeof NULLMAW.initBoss).toBe('function');
        expect(typeof NULLMAW.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(NULLMAW.phaseCount).toBe(3);
    });

    test('the maw gates the core, carries VOID, and gets tougher each phase', () => {
        const m0 = mawScriptForPhase(0);
        const m1 = mawScriptForPhase(1);
        const m2 = mawScriptForPhase(2);
        // A single front maw per phase.
        expect(m0).toHaveLength(1);
        expect(m1).toHaveLength(1);
        expect(m2).toHaveLength(1);
        // Each maw shields the core, is VOID, and front-mounted (rotates w/ boss).
        for (const m of [m0[0], m1[0], m2[0]]) {
            expect(m.shieldsCore).toBe(true);
            expect(m.element).toBe('VOID');
            expect(m.rotateWithBoss).toBe(true);
            expect(m.offset).toBeTruthy();
        }
        // Tougher maw each phase.
        expect(m1[0].maxHealth).toBeGreaterThan(m0[0].maxHealth);
        expect(m2[0].maxHealth).toBeGreaterThan(m1[0].maxHealth);
    });
});

describe('nullmaw — init', () => {
    test('seeds full HP, enters phase 0, arms a maw + cadences, plays intro', () => {
        const b = stubBoss();
        expect(initNullmaw(b, null, 0)).toBe(true);
        expect(b.health).toBe(NULLMAW_MAX_HEALTH);
        expect(b.maxHealth).toBe(NULLMAW_MAX_HEALTH);
        expect(b.element).toBe('VOID');
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('nullmaw-p0');
        // Phase-0 maw is up → core is shielded.
        expect(nullmawLivingMaws(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
        // Eat-cone armed + starts closed (in cooldown).
        expect(b.maw).toBeTruthy();
        expect(mawConeState(b)).toBe(EAT_CLOSED);
        expect(isMawOpen(b)).toBe(false);
        // Pull + implosion armed + idle.
        expect(b.pull).toBeTruthy();
        expect(pullState(b)).toBe(PULL_IDLE);
        expect(b.implosion).toBeTruthy();
        expect(isImplosionTelegraphing(b)).toBe(false);
        // Absorb counters seeded.
        expect(mawShield(b)).toBe(0);
        expect(absorbedCount(b)).toBe(0);
    });
});

describe('nullmaw — core invuln while the maw lives', () => {
    test('core is shielded with the maw up and vulnerable once it is broken', () => {
        const b = stubBoss();
        initNullmaw(b, null, 0);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        const fell = breakAllMaws(b);
        expect(fell).toBeGreaterThan(0);
        expect(nullmawLivingMaws(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('each new phase re-arms a fresh maw → the core re-shields', () => {
        const b = stubBoss();
        initNullmaw(b, null, 0);
        breakAllMaws(b);
        expect(coreVulnerable(b)).toBe(true);

        // Drop HP past the phase-1 gate; tick the boss → phase 1 re-arms the maw.
        b.health = NULLMAW_MAX_HEALTH * 0.5;
        const now = 20000; // well past the intro + any prior invuln window
        updateNullmaw(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(nullmawLivingMaws(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false); // re-shielded by the new maw
    });
});

describe('nullmaw — projectile-eat cone (mawAbsorbs)', () => {
    // Open the maw deterministically: arm at t=0 then tick past cooldown+windup.
    function openMaw(b, phaseIdx = 0) {
        armMawCone(b, phaseIdx, 0);
        const m = b.maw;
        updateMawCone(b, m.cooldownMs + m.windupMs + 1);
        return m;
    }

    test('a bullet inside the cone is absorbed ONLY while the maw is OPEN', () => {
        const b = stubBoss({ x: 0, y: 0, angle: 0 });
        armMawCone(b, 0, 0);
        // Bullet straight ahead, in range — but the maw is CLOSED → not absorbed.
        const bullet = { type: 'bullet', x: 100, y: 0 };
        expect(isMawOpen(b)).toBe(false);
        expect(mawAbsorbs(b, bullet)).toBe(false);

        // Open the maw → now the same bullet is absorbed.
        const m = b.maw;
        updateMawCone(b, m.cooldownMs + m.windupMs + 1);
        expect(isMawOpen(b)).toBe(true);
        expect(mawAbsorbs(b, bullet)).toBe(true);

        // Close it again → no longer absorbed.
        updateMawCone(b, m.cooldownMs + m.windupMs + m.openMs + 1);
        expect(isMawOpen(b)).toBe(false);
        expect(mawAbsorbs(b, bullet)).toBe(false);
    });

    test('only bullets inside the cone are absorbed (geometry gate)', () => {
        const b = stubBoss({ x: 0, y: 0, angle: 0 });
        const m = openMaw(b, 0);

        // Dead ahead, in range → in cone.
        expect(projectileInCone(b, { x: 100, y: 0 })).toBe(true);
        // Behind the maw (opposite the facing) → outside the cone.
        expect(projectileInCone(b, { x: -100, y: 0 })).toBe(false);
        // Far off to the side beyond the half-angle → outside the cone.
        expect(projectileInCone(b, { x: 50, y: 400 })).toBe(false);
        // Beyond the cone range → outside.
        expect(projectileInCone(b, { x: m.coneRange + 50, y: 0 })).toBe(false);

        // mawAbsorbs layers open + type on top of geometry.
        expect(mawAbsorbs(b, { type: 'bullet', x: 100, y: 0 })).toBe(true);
        expect(mawAbsorbs(b, { type: 'bullet', x: -100, y: 0 })).toBe(false);
    });

    test('beams and melee BYPASS the maw (only bullet-type is eaten)', () => {
        const b = stubBoss({ x: 0, y: 0, angle: 0 });
        openMaw(b, 0);
        const ahead = { x: 100, y: 0 };
        // A bullet dead ahead is eaten...
        expect(mawAbsorbs(b, { ...ahead, type: 'bullet' })).toBe(true);
        // ...but a beam / melee in the exact same spot passes through.
        expect(mawAbsorbs(b, { ...ahead, type: 'beam' })).toBe(false);
        expect(mawAbsorbs(b, { ...ahead, type: 'melee' })).toBe(false);
    });

    test('the cone tracks the boss facing (angle)', () => {
        const b = stubBoss({ x: 0, y: 0, angle: Math.PI }); // facing -x
        openMaw(b, 0);
        // Now "ahead" is -x; +x is behind.
        expect(mawAbsorbs(b, { type: 'bullet', x: -100, y: 0 })).toBe(true);
        expect(mawAbsorbs(b, { type: 'bullet', x: 100, y: 0 })).toBe(false);
    });

    test('feeding the maw raises the maw-shield counter (punishes feeding)', () => {
        const b = stubBoss({ x: 0, y: 0, angle: 0 });
        openMaw(b, 0);
        expect(mawShield(b)).toBe(0);
        expect(absorbedCount(b)).toBe(0);

        // Feed a handful of bullets via tryAbsorb (test + feed).
        const bullet = { type: 'bullet', x: 100, y: 0 };
        for (let i = 0; i < 5; i++) {
            expect(tryAbsorb(b, bullet)).toBe(true);
        }
        expect(absorbedCount(b)).toBe(5);
        expect(mawShield(b)).toBeGreaterThan(0);

        // A bullet OUTSIDE the cone is not absorbed → no feed.
        const before = mawShield(b);
        expect(tryAbsorb(b, { type: 'bullet', x: -100, y: 0 })).toBe(false);
        expect(mawShield(b)).toBe(before);
        expect(absorbedCount(b)).toBe(5);
    });

    test('feedMaw directly raises shield + absorbed regardless of geometry', () => {
        const b = stubBoss();
        initNullmaw(b, null, 0);
        feedMaw(b, 3);
        expect(absorbedCount(b)).toBe(1);
        expect(mawShield(b)).toBe(3);
    });

    test('the eat-cone cycles CLOSED → WINDUP → OPEN → CLOSED on its cadence', () => {
        const b = stubBoss();
        armMawCone(b, 0, 0);
        const m = b.maw;
        expect(mawConeState(b)).toBe(EAT_CLOSED);

        // Telegraph (wind-up) begins after the cooldown — the warning.
        updateMawCone(b, m.cooldownMs + 1);
        expect(mawConeState(b)).toBe(EAT_WINDUP);
        expect(isMawTelegraphing(b)).toBe(true);
        expect(isMawOpen(b)).toBe(false);

        // Wind-up elapsed → the maw gapes open.
        updateMawCone(b, m.cooldownMs + m.windupMs + 1);
        expect(mawConeState(b)).toBe(EAT_OPEN);
        expect(isMawOpen(b)).toBe(true);

        // Open window done → snaps shut.
        updateMawCone(b, m.cooldownMs + m.windupMs + m.openMs + 1);
        expect(mawConeState(b)).toBe(EAT_CLOSED);
        expect(isMawOpen(b)).toBe(false);
    });

    test('the maw NEVER opens without first telegraphing (no instant gape)', () => {
        const b = stubBoss();
        armMawCone(b, 0, 0);
        const m = b.maw;
        let observedWindup = false;
        let openWithoutWindup = false;
        for (let now = 0; now <= m.cooldownMs + m.windupMs + m.openMs; now += 50) {
            updateMawCone(b, now);
            if (mawConeState(b) === EAT_WINDUP) observedWindup = true;
            if (mawConeState(b) === EAT_OPEN && !observedWindup) openWithoutWindup = true;
        }
        expect(observedWindup).toBe(true);
        expect(openWithoutWindup).toBe(false);
    });

    test('the eat-cone does not advance while the boss is dying', () => {
        const b = stubBoss();
        armMawCone(b, 0, 0);
        b._deathFlash = 1;
        updateMawCone(b, 1e9);
        expect(mawConeState(b)).toBe(EAT_CLOSED);
        expect(isMawOpen(b)).toBe(false);
    });
});

describe('nullmaw — gravity pull telegraph → active', () => {
    test('pull cycles IDLE → TELEGRAPH (wind-up) → ACTIVE → IDLE on its cadence', () => {
        const b = stubBoss();
        armGravityPull(b, 0, 0);
        const p = b.pull;
        expect(pullState(b)).toBe(PULL_IDLE);

        // In cooldown just before the first wind-up.
        updateGravityPull(b, p.cooldownMs - 1);
        expect(pullState(b)).toBe(PULL_IDLE);
        expect(isPullTelegraphing(b)).toBe(false);

        // Cooldown elapsed → telegraph wind-up (the warning).
        updateGravityPull(b, p.cooldownMs + 1);
        expect(pullState(b)).toBe(PULL_TELEGRAPH);
        expect(isPullTelegraphing(b)).toBe(true);
        expect(isPullActive(b)).toBe(false);

        // Wind-up elapsed → the pull goes active (the drag).
        updateGravityPull(b, p.cooldownMs + p.telegraphMs + 1);
        expect(pullState(b)).toBe(PULL_ACTIVE);
        expect(isPullTelegraphing(b)).toBe(false);
        expect(isPullActive(b)).toBe(true);
        expect(b.pull.pulls).toBe(1);

        // Pull done → back to idle.
        updateGravityPull(b, p.cooldownMs + p.telegraphMs + p.pullMs + 1);
        expect(pullState(b)).toBe(PULL_IDLE);
        expect(isPullActive(b)).toBe(false);
    });

    test('pull NEVER goes active without first telegraphing', () => {
        const b = stubBoss();
        armGravityPull(b, 0, 0);
        const p = b.pull;
        let observedTelegraph = false;
        let activeWithoutTelegraph = false;
        for (let now = 0; now <= p.cooldownMs + p.telegraphMs + p.pullMs; now += 50) {
            updateGravityPull(b, now);
            if (pullState(b) === PULL_TELEGRAPH) observedTelegraph = true;
            if (pullState(b) === PULL_ACTIVE && !observedTelegraph) activeWithoutTelegraph = true;
        }
        expect(observedTelegraph).toBe(true);
        expect(activeWithoutTelegraph).toBe(false);
    });

    test('pull cadence tightens + strengthens with each phase', () => {
        const b0 = stubBoss(); armGravityPull(b0, 0, 0);
        const b2 = stubBoss(); armGravityPull(b2, 2, 0);
        expect(b2.pull.cooldownMs).toBeLessThan(b0.pull.cooldownMs);
        expect(b2.pull.strength).toBeGreaterThan(b0.pull.strength);
    });

    test('pull does not advance while the boss is warping', () => {
        const b = stubBoss();
        armGravityPull(b, 0, 0);
        b.warping = true;
        updateGravityPull(b, 1e9);
        expect(pullState(b)).toBe(PULL_IDLE);
        expect(b.pull.pulls).toBe(0);
    });
});

describe('nullmaw — IMPLOSION telegraph → fire near the phase end', () => {
    test('implosion arms its wind-up only when HP nears the phase end, then fires once', () => {
        const b = stubBoss();
        initNullmaw(b, null, 0);
        // Full HP, early in phase 0 → no implosion telegraph yet.
        updateImplosion(b, 1000);
        expect(isImplosionTelegraphing(b)).toBe(false);
        expect(implosionFired(b)).toBe(false);

        // Drop HP near the END of phase 0 (just above the phase-1 gate) → arm.
        b.health = NULLMAW_MAX_HEALTH * 0.63;
        const edge = updateImplosion(b, 2000);
        expect(edge).toBe('telegraph');
        expect(isImplosionTelegraphing(b)).toBe(true);
        expect(implosionFired(b)).toBe(false);

        // Wind-up elapses → it FIRES once.
        const fireEdge = updateImplosion(b, 2000 + 99999);
        expect(fireEdge).toBe('fire');
        expect(isImplosionTelegraphing(b)).toBe(false);
        expect(implosionFired(b)).toBe(true);
        expect(implosionFireCount(b)).toBe(1);

        // Latched for the phase — further ticks do not re-fire.
        expect(updateImplosion(b, 2000 + 200000)).toBe(null);
        expect(implosionFireCount(b)).toBe(1);
    });

    test('implosion NEVER fires without first telegraphing', () => {
        const b = stubBoss();
        armImplosion(b, 0, 0);
        b.maxHealth = NULLMAW_MAX_HEALTH;
        b.health = NULLMAW_MAX_HEALTH; // full → no trigger yet
        expect(updateImplosion(b, 1000)).toBe(null);
        expect(implosionFired(b)).toBe(false);
        // Now drop to near the phase end and watch the ordering.
        b.health = NULLMAW_MAX_HEALTH * 0.62;
        expect(updateImplosion(b, 2000)).toBe('telegraph');
        // It cannot be "fired" the same instant it telegraphs.
        expect(implosionFired(b)).toBe(false);
    });

    test('a fresh implosion re-arms per phase (final-phase fires near death)', () => {
        const b = stubBoss();
        initNullmaw(b, null, 0);
        // Jump straight to the final phase.
        b.health = 1;
        updateNullmaw(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(b.implosion.phaseIdx).toBe(2);
        // In the final phase at ~0 HP the implosion arms then fires.
        const e1 = updateImplosion(b, 30000);
        expect(e1).toBe('telegraph');
        const e2 = updateImplosion(b, 30000 + 99999);
        expect(e2).toBe('fire');
        expect(implosionFired(b)).toBe(true);
    });
});

describe('nullmaw — phases advance in order + enrage', () => {
    test('phases trip 0→1→2 as HP descends, enrage fires once on the final phase', () => {
        const b = stubBoss();
        initNullmaw(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        // Cross the phase-1 gate.
        b.health = NULLMAW_MAX_HEALTH * 0.55;
        now += 10000;
        updateNullmaw(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false);

        // Cross the phase-2 (final) gate → enrage.
        b.health = NULLMAW_MAX_HEALTH * 0.25;
        now += 10000;
        updateNullmaw(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(nullmawIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableVoidBullets).toBe(true);

        // Enrage is latched — staying in the final phase does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateNullmaw(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initNullmaw(b, null, 0);
        b.health = 1; // below every gate at once
        updateNullmaw(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(nullmawIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });
});

describe('nullmaw — killable (HP can reach 0)', () => {
    test('full run: break the maw each phase, whittle HP to 0, play death sequence', () => {
        const b = stubBoss();
        const done = [];
        initNullmaw(b, null, 0);

        let now = 20000; // past intro
        const targets = [
            NULLMAW_MAX_HEALTH * 0.55, // → trips phase 1
            NULLMAW_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                         // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateNullmaw(b, null, now); // advance phase + re-arm maw/cadences

            // Phase gating: core invuln until this phase's maw is broken.
            if (nullmawLivingMaws(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                breakAllMaws(b);
            }
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(nullmawIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armNullmawDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickNullmawDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
