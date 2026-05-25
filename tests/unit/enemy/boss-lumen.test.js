// BOSS-07 — LUMEN THE PRISM SOVEREIGN (stage 3-9, RADIANT).
//
// A radiant boss built as data + a thin driver over the SHIPPED boss chassis
// cores (boss-phases / boss-parts / boss-intro) plus a self-contained
// DISJUNCTION cadence driver. These tests drive the boss headlessly through
// those runners with a stub boss + an explicit `now` (mirroring the
// boss-phases / boss-parts / harbinger test style) and assert the BOSS DoD:
//   • phases advance in order (HP-gated)
//   • the core is invulnerable while shield drones live, vulnerable once cleared
//   • each phase re-arms a fresh, smaller drone set (core re-shields per phase)
//   • DISJUNCTION telegraphs (wind-up) then FIRES on a cadence
//   • enrage fires in the final phase (exactly once) + tightens the cadence
//   • HP can reach 0 — the boss is killable
import { describe, expect, test } from '@jest/globals';
import {
    LUMEN,
    LUMEN_MAX_HEALTH,
    initLumen,
    updateLumen,
    coreVulnerable,
    isEnraged,
    isDisjunctionTelegraphing,
    disjunctionFireCount,
    lumenLivingDrones,
    lumenIsFinalPhase,
    armLumenDeath,
    tickLumenDeath,
    buildPhaseScript,
} from '../../../js/modules/enemy/bosses/lumen.js';
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
// (active/!dying/!warping gating + position for orbit math).
const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    x: 0, y: 0, angle: 0, ...over,
});

// Destroy every currently-living shield drone, routing damage through the
// chassis part-damage path (as the collision pipeline will). Returns how many
// fell.
function clearAllDrones(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('lumen — descriptor', () => {
    test('exposes a clean RADIANT descriptor with chassis factory hooks', () => {
        expect(LUMEN.id).toBe('LUMEN');
        expect(LUMEN.element).toBe('RADIANT');
        expect(LUMEN.isBoss).toBe(true);
        expect(LUMEN.isFinalBoss).toBe(false);
        expect(LUMEN.maxHealth).toBe(LUMEN_MAX_HEALTH);
        expect(LUMEN.tierBand).toEqual([3, 9]);
        expect(typeof LUMEN.initBoss).toBe('function');
        expect(typeof LUMEN.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(LUMEN.phaseCount).toBe(3);
    });
});

describe('lumen — init', () => {
    test('seeds full HP, enters phase 0, arms a drone ring, plays intro', () => {
        const b = stubBoss();
        expect(initLumen(b, null, 0)).toBe(true);
        expect(b.health).toBe(LUMEN_MAX_HEALTH);
        expect(b.maxHealth).toBe(LUMEN_MAX_HEALTH);
        expect(b.element).toBe('RADIANT');
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('lumen-p0');
        // Phase-0 drone ring is up → core is shielded.
        expect(lumenLivingDrones(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
        // DISJUNCTION starts idle (no telegraph, no fire yet).
        expect(isDisjunctionTelegraphing(b)).toBe(false);
        expect(disjunctionFireCount(b)).toBe(0);
    });
});

describe('lumen — core invuln while shield drones live', () => {
    test('core is shielded with drones up and vulnerable once they are cleared', () => {
        const b = stubBoss();
        initLumen(b, null, 0);
        // Drones shield the core.
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        // Clear the ring → core opens.
        const fell = clearAllDrones(b);
        expect(fell).toBeGreaterThan(0);
        expect(lumenLivingDrones(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('each new phase re-arms a fresh, smaller ring → the core re-shields', () => {
        const b = stubBoss();
        initLumen(b, null, 0);
        const phase0Drones = lumenLivingDrones(b);
        clearAllDrones(b);
        expect(coreVulnerable(b)).toBe(true);

        // Drop HP past the phase-1 gate; tick the boss → phase 1 re-arms drones.
        b.health = LUMEN_MAX_HEALTH * 0.5;
        let now = 20000; // well past the intro + any prior invuln window
        updateLumen(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        const phase1Drones = lumenLivingDrones(b);
        expect(phase1Drones).toBeGreaterThan(0);
        expect(phase1Drones).toBeLessThan(phase0Drones); // fewer + tougher each phase
        expect(coreVulnerable(b)).toBe(false); // re-shielded by the new ring
    });
});

describe('lumen — DISJUNCTION telegraph → fire cadence', () => {
    test('winds up a telegraph, then fires; latched flag flips across the edge', () => {
        const b = stubBoss();
        initLumen(b, null, 0);

        // Idle through the initial cooldown — no telegraph yet.
        updateLumen(b, null, 1000);
        expect(isDisjunctionTelegraphing(b)).toBe(false);
        expect(disjunctionFireCount(b)).toBe(0);

        // After the cooldown elapses, the telegraph latches (wind-up begins).
        updateLumen(b, null, 5000);
        expect(isDisjunctionTelegraphing(b)).toBe(true);
        expect(disjunctionFireCount(b)).toBe(0); // not fired during wind-up

        // Mid wind-up: still telegraphing, still not fired.
        updateLumen(b, null, 5800);
        expect(isDisjunctionTelegraphing(b)).toBe(true);
        expect(disjunctionFireCount(b)).toBe(0);

        // Once the wind-up completes, it FIRES: telegraph clears, count bumps.
        updateLumen(b, null, 7000);
        expect(isDisjunctionTelegraphing(b)).toBe(false);
        expect(disjunctionFireCount(b)).toBe(1);

        // The cadence repeats — a second telegraph then a second fire.
        updateLumen(b, null, 13000);
        expect(isDisjunctionTelegraphing(b)).toBe(true);
        updateLumen(b, null, 16000);
        expect(isDisjunctionTelegraphing(b)).toBe(false);
        expect(disjunctionFireCount(b)).toBe(2);
    });
});

describe('lumen — phases advance in order + enrage', () => {
    test('phases trip 0→1→2 as HP descends, enrage fires once on the final phase', () => {
        const b = stubBoss();
        initLumen(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        // Cross the phase-1 gate.
        b.health = LUMEN_MAX_HEALTH * 0.6;
        now += 10000;
        updateLumen(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false); // not yet final

        // Cross the phase-2 (final) gate → enrage.
        b.health = LUMEN_MAX_HEALTH * 0.25;
        now += 10000;
        updateLumen(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(lumenIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableHomingBullets).toBe(true);

        // Enrage is latched — staying in the final phase does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateLumen(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initLumen(b, null, 0);
        b.health = 1; // below every gate at once
        updateLumen(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(lumenIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });

    test('enrage tightens the DISJUNCTION cadence (faster than baseline)', () => {
        // Baseline boss: measure ticks-to-second-fire at normal cadence.
        const base = stubBoss();
        initLumen(base, null, 0);
        let bn = 0;
        // Step the cadence finely until two fires have happened.
        while (disjunctionFireCount(base) < 2 && bn < 60000) {
            bn += 100; updateLumen(base, null, bn);
        }
        const baselineTwoFiresAt = bn;

        // Enraged boss from the start: same cadence machinery, tighter timing.
        const rage = stubBoss();
        initLumen(rage, null, 0);
        rage._enraged = true; // pretend already enraged for cadence purposes
        let rn = 0;
        while (disjunctionFireCount(rage) < 2 && rn < 60000) {
            rn += 100; updateLumen(rage, null, rn);
        }
        const enragedTwoFiresAt = rn;

        expect(disjunctionFireCount(base)).toBe(2);
        expect(disjunctionFireCount(rage)).toBe(2);
        // Enraged cadence reaches the second fire sooner.
        expect(enragedTwoFiresAt).toBeLessThan(baselineTwoFiresAt);
    });
});

describe('lumen — killable (HP can reach 0)', () => {
    test('full run: clear drones each phase, whittle HP to 0, play death sequence', () => {
        const b = stubBoss();
        const done = [];
        initLumen(b, null, 0);

        let now = 20000; // past intro
        // Walk down through all three phases; in each, clear the ring then chip
        // the core. The phase-transition invuln window is respected by advancing
        // `now` well past it before applying core damage.
        const targets = [
            LUMEN_MAX_HEALTH * 0.6,  // → trips phase 1
            LUMEN_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                       // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateLumen(b, null, now); // advance phase + re-arm ring

            // Phase gating: core invuln until this phase's drones are cleared.
            if (lumenLivingDrones(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                clearAllDrones(b);
            }
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(lumenIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armLumenDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickLumenDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
