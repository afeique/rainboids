// BOSS-05 — THE HARBINGER (stage 1-3, KINETIC).
//
// The first concrete boss, built as data + a thin driver over the SHIPPED boss
// chassis cores (boss-phases / boss-parts / boss-intro). These tests drive the
// boss headlessly through those runners with a stub boss + an explicit `now`
// (mirroring the boss-phases / boss-parts test style) and assert the BOSS DoD:
//   • phases advance in order (HP-gated)
//   • the core is invulnerable while bolt-heads live, vulnerable once cleared
//   • each phase re-arms a fresh bolt ring (core re-shields per phase)
//   • enrage fires in the final phase (exactly once)
//   • HP can reach 0 — the boss is killable
import { describe, expect, test } from '@jest/globals';
import {
    HARBINGER,
    HARBINGER_MAX_HEALTH,
    initHarbinger,
    updateHarbinger,
    coreVulnerable,
    isEnraged,
    harbingerLivingBolts,
    harbingerIsFinalPhase,
    armHarbingerDeath,
    tickHarbingerDeath,
    buildPhaseScript,
} from '../../../js/modules/enemy/bosses/harbinger.js';
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

// Destroy every currently-living bolt-head, routing damage through the chassis
// part-damage path (as the collision pipeline will). Returns how many fell.
function clearAllBolts(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('harbinger — descriptor', () => {
    test('exposes a clean KINETIC descriptor with chassis factory hooks', () => {
        expect(HARBINGER.id).toBe('HARBINGER');
        expect(HARBINGER.element).toBe('KINETIC');
        expect(HARBINGER.isBoss).toBe(true);
        expect(HARBINGER.isFinalBoss).toBe(false);
        expect(HARBINGER.maxHealth).toBe(HARBINGER_MAX_HEALTH);
        expect(typeof HARBINGER.initBoss).toBe('function');
        expect(typeof HARBINGER.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(HARBINGER.phaseCount).toBe(3);
    });
});

describe('harbinger — init', () => {
    test('seeds full HP, enters phase 0, arms a bolt ring, plays intro', () => {
        const b = stubBoss();
        expect(initHarbinger(b, null, 0)).toBe(true);
        expect(b.health).toBe(HARBINGER_MAX_HEALTH);
        expect(b.maxHealth).toBe(HARBINGER_MAX_HEALTH);
        expect(b.element).toBe('KINETIC');
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('harbinger-p0');
        // Phase-0 bolt ring is up → core is shielded.
        expect(harbingerLivingBolts(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
    });
});

describe('harbinger — core invuln while bolts live', () => {
    test('core is shielded with bolts up and vulnerable once they are cleared', () => {
        const b = stubBoss();
        initHarbinger(b, null, 0);
        // Bolts shield the core.
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        // Clear the ring → core opens.
        const fell = clearAllBolts(b);
        expect(fell).toBeGreaterThan(0);
        expect(harbingerLivingBolts(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('each new phase re-arms a fresh ring → the core re-shields', () => {
        const b = stubBoss();
        initHarbinger(b, null, 0);
        clearAllBolts(b);
        expect(coreVulnerable(b)).toBe(true);

        // Drop HP past the phase-1 gate; tick the boss → phase 1 re-arms bolts.
        b.health = HARBINGER_MAX_HEALTH * 0.5;
        let now = 20000; // well past the intro + any prior invuln window
        updateHarbinger(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(harbingerLivingBolts(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false); // re-shielded by the new ring
    });
});

describe('harbinger — phases advance in order + enrage', () => {
    test('phases trip 0→1→2 as HP descends, enrage fires once on the final phase', () => {
        const b = stubBoss();
        initHarbinger(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        // Cross the phase-1 gate.
        b.health = HARBINGER_MAX_HEALTH * 0.55;
        now += 10000;
        updateHarbinger(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false); // not yet final

        // Cross the phase-2 (final) gate → enrage.
        b.health = HARBINGER_MAX_HEALTH * 0.25;
        now += 10000;
        updateHarbinger(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(harbingerIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableHomingBullets).toBe(true);

        // Enrage is latched — staying in the final phase does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateHarbinger(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initHarbinger(b, null, 0);
        b.health = 1; // below every gate at once
        updateHarbinger(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(harbingerIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });
});

describe('harbinger — killable (HP can reach 0)', () => {
    test('full run: clear bolts each phase, whittle HP to 0, play death sequence', () => {
        const b = stubBoss();
        const done = [];
        initHarbinger(b, null, 0);

        let now = 20000; // past intro
        // Walk down through all three phases; in each, clear the ring then chip
        // the core. The phase-transition invuln window is respected by advancing
        // `now` well past it before applying core damage.
        const targets = [
            HARBINGER_MAX_HEALTH * 0.55, // → trips phase 1
            HARBINGER_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                           // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateHarbinger(b, null, now); // advance phase + re-arm ring

            // Phase gating: core invuln until this phase's bolts are cleared.
            if (harbingerLivingBolts(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                clearAllBolts(b);
            }
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(harbingerIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armHarbingerDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickHarbingerDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
