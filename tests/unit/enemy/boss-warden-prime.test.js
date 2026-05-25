// BOSS-12 — THE WARDEN PRIME (stage 8-24, adaptive resist wall, ADAPTIVE PURGE).
//
// The anti-meta boss, built as data + a thin driver over the SHIPPED boss
// chassis cores (boss-phases / boss-parts / boss-intro) plus two self-contained
// drivers: a sliding-window ADAPTIVE RESIST model and an ADAPTIVE PURGE cadence.
// These tests drive the boss headlessly through those runners with a stub boss
// + an explicit `now` (mirroring the lumen / harbinger test style) and assert
// the BOSS DoD + the WARDEN PRIME spec:
//   • phases advance in order (HP-gated)
//   • the core is invulnerable while shield nodes live, vulnerable once cleared
//   • each phase re-arms a fresh, smaller node set (core re-shields per phase)
//   • ADAPTIVE RESIST climbs for the spammed element while others stay low, and
//     switching elements lets the old wall fade (the forced rotation)
//   • ADAPTIVE PURGE telegraphs (wind-up) then FIRES on a cadence, resetting +
//     re-spiking the learned wall
//   • enrage fires in the final phase (exactly once) + tightens the cadence
//   • HP can reach 0 — the boss is killable
import { describe, expect, test } from '@jest/globals';
import {
    WARDEN_PRIME,
    WARDEN_PRIME_MAX_HEALTH,
    WARDEN_ELEMENTS,
    initWardenPrime,
    updateWardenPrime,
    coreVulnerable,
    isEnraged,
    isPurgeTelegraphing,
    purgeFireCount,
    recordElementHit,
    wardenResist,
    wardenMostResistedElement,
    wardenResistMap,
    wardenPrimeLivingNodes,
    wardenPrimeIsFinalPhase,
    armWardenPrimeDeath,
    tickWardenPrimeDeath,
    buildPhaseScript,
} from '../../../js/modules/enemy/bosses/warden-prime.js';
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

// Destroy every currently-living shield node, routing damage through the chassis
// part-damage path (as the collision pipeline will). Returns how many fell.
function clearAllNodes(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('warden prime — descriptor', () => {
    test('exposes a clean adaptive descriptor with chassis factory hooks', () => {
        expect(WARDEN_PRIME.id).toBe('WARDEN_PRIME');
        expect(WARDEN_PRIME.isBoss).toBe(true);
        expect(WARDEN_PRIME.isFinalBoss).toBe(false);
        expect(WARDEN_PRIME.maxHealth).toBe(WARDEN_PRIME_MAX_HEALTH);
        expect(WARDEN_PRIME.tierBand).toEqual([8, 24]);
        expect(typeof WARDEN_PRIME.initBoss).toBe('function');
        expect(typeof WARDEN_PRIME.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(WARDEN_PRIME.phaseCount).toBe(3);
    });
});

describe('warden prime — init', () => {
    test('seeds full HP, enters phase 0, arms a node ring, empty adapt, plays intro', () => {
        const b = stubBoss();
        expect(initWardenPrime(b, null, 0)).toBe(true);
        expect(b.health).toBe(WARDEN_PRIME_MAX_HEALTH);
        expect(b.maxHealth).toBe(WARDEN_PRIME_MAX_HEALTH);
        expect(b.adaptive).toBe(true);
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('warden-prime-p0');
        // Phase-0 node ring is up → core is shielded.
        expect(wardenPrimeLivingNodes(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
        // Adaptive resist starts empty → no wall to any element yet.
        for (const el of WARDEN_ELEMENTS) expect(wardenResist(b, el)).toBe(0);
        expect(wardenMostResistedElement(b)).toBe(null);
        expect(wardenResistMap(b)).toEqual({});
        // ADAPTIVE PURGE starts idle.
        expect(isPurgeTelegraphing(b)).toBe(false);
        expect(purgeFireCount(b)).toBe(0);
    });
});

describe('warden prime — core invuln while shield nodes live', () => {
    test('core is shielded with nodes up and vulnerable once they are cleared', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        const fell = clearAllNodes(b);
        expect(fell).toBeGreaterThan(0);
        expect(wardenPrimeLivingNodes(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('each new phase re-arms a fresh, smaller ring → the core re-shields', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);
        const phase0Nodes = wardenPrimeLivingNodes(b);
        clearAllNodes(b);
        expect(coreVulnerable(b)).toBe(true);

        b.health = WARDEN_PRIME_MAX_HEALTH * 0.5;
        updateWardenPrime(b, null, 20000); // past intro + any prior invuln window
        expect(currentPhaseIndex(b)).toBe(1);
        const phase1Nodes = wardenPrimeLivingNodes(b);
        expect(phase1Nodes).toBeGreaterThan(0);
        expect(phase1Nodes).toBeLessThan(phase0Nodes); // fewer + tougher each phase
        expect(coreVulnerable(b)).toBe(false); // re-shielded by the new ring
    });
});

describe('warden prime — ADAPTIVE RESIST (the anti-meta wall)', () => {
    test('spamming one element climbs ITS resist while others stay near zero', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);

        // Feed a sequence dominated by PYRO (the player tunnel-visioning fire).
        for (let i = 0; i < 6; i++) recordElementHit(b, 'PYRO');
        const pyro = wardenResist(b, 'PYRO');
        expect(pyro).toBeGreaterThan(0.3);                 // the wall has gone up
        expect(wardenMostResistedElement(b)).toBe('PYRO'); // PYRO is the wall

        // Every OTHER element is still cheap (you can punch through by rotating).
        for (const el of WARDEN_ELEMENTS) {
            if (el === 'PYRO') continue;
            expect(wardenResist(b, el)).toBe(0);
            expect(wardenResist(b, el)).toBeLessThan(pyro);
        }
    });

    test('more same-element hits → a higher wall (monotonic), clamped to a cap', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);
        let prev = 0;
        for (let i = 1; i <= 4; i++) {
            recordElementHit(b, 'CRYO');
            const r = wardenResist(b, 'CRYO');
            expect(r).toBeGreaterThanOrEqual(prev); // climbs as you keep spamming
            prev = r;
        }
        // Way past the window: still capped, never runaway.
        for (let i = 0; i < 50; i++) recordElementHit(b, 'CRYO');
        expect(wardenResist(b, 'CRYO')).toBeLessThanOrEqual(0.75 + 1e-9);
    });

    test('rotating elements forces the wall to MOVE — old wall fades as new one rises', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);

        // Lean on VOLT first → VOLT becomes the wall.
        for (let i = 0; i < 8; i++) recordElementHit(b, 'VOLT');
        expect(wardenMostResistedElement(b)).toBe('VOLT');
        const voltWall = wardenResist(b, 'VOLT');

        // Then switch to TOXIC for a full window → TOXIC overtakes, VOLT fades out
        // of the sliding window entirely (the forced rotation).
        for (let i = 0; i < 8; i++) recordElementHit(b, 'TOXIC');
        expect(wardenMostResistedElement(b)).toBe('TOXIC');
        expect(wardenResist(b, 'TOXIC')).toBeGreaterThan(0.3);
        expect(wardenResist(b, 'VOLT')).toBeLessThan(voltWall); // old wall faded
        expect(wardenResist(b, 'VOLT')).toBe(0);                // fully out of window
    });

    test('recordElementHit rejects unknown elements and a missing boss', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);
        expect(recordElementHit(b, 'PLASMA_BOGUS')).toBe(false);
        expect(recordElementHit(null, 'PYRO')).toBe(false);
        expect(wardenResist(b, 'PLASMA_BOGUS')).toBe(0);
    });
});

describe('warden prime — ADAPTIVE PURGE telegraph → fire cadence', () => {
    test('winds up a telegraph, then fires; latched flag flips across the edge', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);

        // Idle through the initial cooldown — no telegraph yet.
        updateWardenPrime(b, null, 1000);
        expect(isPurgeTelegraphing(b)).toBe(false);
        expect(purgeFireCount(b)).toBe(0);

        // After the cooldown elapses, the telegraph latches (wind-up begins).
        updateWardenPrime(b, null, 5500);
        expect(isPurgeTelegraphing(b)).toBe(true);
        expect(purgeFireCount(b)).toBe(0); // not fired during wind-up

        // Mid wind-up: still telegraphing, still not fired.
        updateWardenPrime(b, null, 6200);
        expect(isPurgeTelegraphing(b)).toBe(true);
        expect(purgeFireCount(b)).toBe(0);

        // Once the wind-up completes, it FIRES: telegraph clears, count bumps.
        updateWardenPrime(b, null, 7500);
        expect(isPurgeTelegraphing(b)).toBe(false);
        expect(purgeFireCount(b)).toBe(1);

        // The cadence repeats — a second telegraph then a second fire.
        updateWardenPrime(b, null, 13000);
        expect(isPurgeTelegraphing(b)).toBe(true);
        updateWardenPrime(b, null, 15000);
        expect(isPurgeTelegraphing(b)).toBe(false);
        expect(purgeFireCount(b)).toBe(2);
    });

    test('a PURGE fire resets the learned wall then re-spikes to the spammed element', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);

        // Player has been leaning on RADIANT and also dabbled in CRYO.
        for (let i = 0; i < 5; i++) recordElementHit(b, 'RADIANT');
        recordElementHit(b, 'CRYO');
        const radiantBefore = wardenResist(b, 'RADIANT');
        expect(radiantBefore).toBeGreaterThan(0);
        expect(wardenResist(b, 'CRYO')).toBeGreaterThan(0);

        // Drive the cadence to its first FIRE (telegraph latches ~5s, fires ~6.3s).
        updateWardenPrime(b, null, 5500); // telegraph
        expect(isPurgeTelegraphing(b)).toBe(true);
        updateWardenPrime(b, null, 7500); // fire
        expect(purgeFireCount(b)).toBe(1);

        // The PURGE wiped the dabbled element and re-spiked HARD to the meta one.
        expect(wardenResist(b, 'CRYO')).toBe(0);                 // purged out
        expect(wardenMostResistedElement(b)).toBe('RADIANT');    // re-walled
        expect(wardenResist(b, 'RADIANT')).toBeGreaterThanOrEqual(radiantBefore);
    });
});

describe('warden prime — phases advance in order + enrage', () => {
    test('phases trip 0→1→2 as HP descends, enrage fires once on the final phase', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        b.health = WARDEN_PRIME_MAX_HEALTH * 0.6;
        now += 10000;
        updateWardenPrime(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false); // not yet final

        b.health = WARDEN_PRIME_MAX_HEALTH * 0.25;
        now += 10000;
        updateWardenPrime(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(wardenPrimeIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableHomingBullets).toBe(true);

        // Enrage is latched — staying in the final phase does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateWardenPrime(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initWardenPrime(b, null, 0);
        b.health = 1; // below every gate at once
        updateWardenPrime(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(wardenPrimeIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });

    test('enrage tightens the ADAPTIVE PURGE cadence (faster than baseline)', () => {
        // Baseline boss: measure ticks-to-second-fire at normal cadence.
        const base = stubBoss();
        initWardenPrime(base, null, 0);
        let bn = 0;
        while (purgeFireCount(base) < 2 && bn < 60000) {
            bn += 100; updateWardenPrime(base, null, bn);
        }
        const baselineTwoFiresAt = bn;

        // Enraged boss from the start: same machinery, tighter timing.
        const rage = stubBoss();
        initWardenPrime(rage, null, 0);
        rage._enraged = true; // pretend already enraged for cadence purposes
        let rn = 0;
        while (purgeFireCount(rage) < 2 && rn < 60000) {
            rn += 100; updateWardenPrime(rage, null, rn);
        }
        const enragedTwoFiresAt = rn;

        expect(purgeFireCount(base)).toBe(2);
        expect(purgeFireCount(rage)).toBe(2);
        expect(enragedTwoFiresAt).toBeLessThan(baselineTwoFiresAt);
    });
});

describe('warden prime — killable (HP can reach 0)', () => {
    test('full run: clear nodes each phase, whittle HP to 0, play death sequence', () => {
        const b = stubBoss();
        const done = [];
        initWardenPrime(b, null, 0);

        let now = 20000; // past intro
        const targets = [
            WARDEN_PRIME_MAX_HEALTH * 0.6,  // → trips phase 1
            WARDEN_PRIME_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                              // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateWardenPrime(b, null, now); // advance phase + re-arm ring

            if (wardenPrimeLivingNodes(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                clearAllNodes(b);
            }
            expect(coreVulnerable(b)).toBe(true);

            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(wardenPrimeIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armWardenPrimeDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickWardenPrimeDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
