// BOSS-11 — THE IRON THRONE (stage 7-21, element-cycling turret fortress).
//
// The element-cycling boss, built as data + a thin driver over the SHIPPED boss
// chassis cores (boss-phases / boss-parts / boss-intro). These tests drive the
// boss headlessly through those runners with a stub boss + an explicit `now`
// (mirroring the harbinger / aegis test style) and assert the BOSS DoD plus the
// IRON THRONE-specific element-cycle mechanics:
//   • phases advance in order (HP-gated)
//   • the core is invulnerable while ANY of the four turrets lives, vulnerable
//     only once all four are cleared
//   • PER-TURRET ELEMENT WEAKNESS: each turret takes FULL (bonus) damage from its
//     own weakness element and heavily REDUCED damage from any other element, and
//     no two turrets in a set share a weakness → the player must element-cycle
//   • each phase RE-ARMS a fresh, tougher, rotated four-turret set
//   • a turret-fire cadence is stubbed as a readable clock
//   • enrage fires in the final phase (exactly once)
//   • HP can reach 0 — the boss is KILLABLE by cycling elements to shed turrets
import { describe, expect, test } from '@jest/globals';
import {
    IRON_THRONE,
    IRON_THRONE_MAX_HEALTH,
    TURRET_COUNT,
    initIronThrone,
    updateIronThrone,
    coreVulnerable,
    resolveTurretDamage,
    isTurretWeakness,
    turretWeakness,
    turretWeaknessFor,
    turretScriptForPhase,
    tickTurretFire,
    turretFireDue,
    isEnraged,
    ironThroneLivingTurrets,
    ironThroneTurretList,
    ironThroneIsFinalPhase,
    armIronThroneDeath,
    tickIronThroneDeath,
    buildPhaseScript,
} from '../../../js/modules/enemy/bosses/iron-throne.js';
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
import { elementalMultiplier, ELEMENT_IDS } from '../../../js/modules/combat/elements.js';

// Plain headless stub — no DOM. Matches the chassis' boss-shape expectations
// (active/!dying/!warping gating + position for orbit math).
const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    x: 0, y: 0, angle: 0, ...over,
});

// Clear every currently-living turret BY CYCLING ELEMENTS: each turret is hit
// only with its own weakness element (full damage), routed through the chassis
// part-damage path (as the collision pipeline will). Asserts that an off-element
// hit on the SAME turret would have done strictly less. Returns how many fell.
function cycleClearAllTurrets(boss) {
    const turrets = livingParts(boss);
    for (const t of turrets) {
        const weak = turretWeakness(t);
        // The weakness deals full (bonus) damage; an off-element hit is reduced.
        const offEl = ELEMENT_IDS.find((e) => e !== weak);
        const weakDmg = resolveTurretDamage(t, 1000, weak);
        const offDmg = resolveTurretDamage(t, 1000, offEl);
        expect(weakDmg).toBeGreaterThan(offDmg);
        // Apply the resolved weakness damage through the chassis (lethal).
        damageBossPart(boss, t, resolveTurretDamage(t, 1e9, weak));
    }
    return turrets.length;
}

describe('iron-throne — descriptor', () => {
    test('exposes a clean element-cycle descriptor with chassis factory hooks', () => {
        expect(IRON_THRONE.id).toBe('IRON_THRONE');
        expect(IRON_THRONE.isBoss).toBe(true);
        expect(IRON_THRONE.isFinalBoss).toBe(false);
        expect(IRON_THRONE.maxHealth).toBe(IRON_THRONE_MAX_HEALTH);
        expect(IRON_THRONE.tierBand).toEqual([7, 21]);
        expect(IRON_THRONE.turretCount).toBe(TURRET_COUNT);
        expect(TURRET_COUNT).toBe(4);
        expect(typeof IRON_THRONE.initBoss).toBe('function');
        expect(typeof IRON_THRONE.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(IRON_THRONE.phaseCount).toBe(3);
    });
});

describe('iron-throne — init', () => {
    test('seeds full HP, enters phase 0, arms four turrets, plays intro', () => {
        const b = stubBoss();
        expect(initIronThrone(b, null, 0)).toBe(true);
        expect(b.health).toBe(IRON_THRONE_MAX_HEALTH);
        expect(b.maxHealth).toBe(IRON_THRONE_MAX_HEALTH);
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('iron-throne-p0');
        // Phase-0 ring is up → core is shielded; exactly four turrets.
        expect(ironThroneLivingTurrets(b)).toBe(4);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
    });
});

describe('iron-throne — four per-element turrets', () => {
    test('every phase has four turrets with FOUR DISTINCT weaknesses', () => {
        for (let phase = 0; phase < 3; phase++) {
            const script = turretScriptForPhase(phase);
            expect(script).toHaveLength(4);
            const weaknesses = script.map((t) => t.weakness);
            // No two turrets in a set share a weakness → forces an element cycle.
            expect(new Set(weaknesses).size).toBe(4);
            // Every weakness is a real element id.
            for (const w of weaknesses) expect(ELEMENT_IDS).toContain(w);
            // turretWeaknessFor agrees with the built script slot-for-slot.
            for (let slot = 0; slot < 4; slot++) {
                expect(turretWeaknessFor(phase, slot)).toBe(script[slot].weakness);
            }
        }
    });

    test('phase 0 uses the canonical Pyro / Cryo / Volt / Toxic counters', () => {
        const script = turretScriptForPhase(0);
        expect(script.map((t) => t.weakness)).toEqual(['PYRO', 'CRYO', 'VOLT', 'TOXIC']);
    });

    test('each turret is near-immune to its non-weakness elements', () => {
        const script = turretScriptForPhase(0);
        for (const t of script) {
            // Every off-element resist is strongly positive (heavy reduction)…
            for (const id of ELEMENT_IDS) {
                if (id === t.weakness) continue;
                expect(t.resist[id]).toBeGreaterThan(0.5);
            }
            // …and the weakness is a NEGATIVE resist (a damage bonus).
            expect(t.resist[t.weakness]).toBeLessThan(0);
        }
    });
});

describe('iron-throne — per-turret element-weakness gating', () => {
    test('a turret takes FULL+bonus damage from its weakness, REDUCED otherwise', () => {
        const b = stubBoss();
        initIronThrone(b, null, 0);
        const turret = ironThroneTurretList(b)[0];
        const weak = turretWeakness(turret);
        const off = ELEMENT_IDS.find((e) => e !== weak);

        const weakDmg = resolveTurretDamage(turret, 100, weak);
        const offDmg = resolveTurretDamage(turret, 100, off);

        // Weakness → at least full (multiplier ≥ 1, here a bonus > 100).
        expect(weakDmg).toBeGreaterThanOrEqual(100);
        // Off-element → heavily reduced (resist near-immune).
        expect(offDmg).toBeLessThan(100);
        expect(weakDmg).toBeGreaterThan(offDmg);
        // Matches the shipped elements.elementalMultiplier exactly.
        expect(weakDmg).toBeCloseTo(100 * elementalMultiplier(turret.resist, weak), 6);
        expect(offDmg).toBeCloseTo(100 * elementalMultiplier(turret.resist, off), 6);
    });

    test('isTurretWeakness recognizes string / object / array element shapes', () => {
        const turret = turretScriptForPhase(0)[0]; // weak to PYRO
        expect(turret.weakness).toBe('PYRO');
        expect(isTurretWeakness(turret, 'PYRO')).toBe(true);
        expect(isTurretWeakness(turret, 'CRYO')).toBe(false);
        expect(isTurretWeakness(turret, { element: 'PYRO' })).toBe(true);
        expect(isTurretWeakness(turret, { element: 'VOLT' })).toBe(false);
        expect(isTurretWeakness(turret, ['CRYO', 'PYRO'])).toBe(true);
        expect(isTurretWeakness(turret, { elements: ['VOLT', 'PYRO'] })).toBe(true);
        expect(isTurretWeakness(turret, null)).toBe(false);
    });

    test('hitting a turret with the WRONG element barely chips it (cycle needed)', () => {
        const b = stubBoss();
        initIronThrone(b, null, 0);
        const turret = ironThroneTurretList(b)[0];
        const wrong = ELEMENT_IDS.find((e) => e !== turretWeakness(turret));
        const before = turret.health;
        // One off-element hit of 100 raw damage.
        damageBossPart(b, turret, resolveTurretDamage(turret, 100, wrong));
        const chipped = before - turret.health;
        // Off-element chip is small relative to the turret's HP → it survives.
        expect(turret.alive).toBe(true);
        expect(chipped).toBeLessThan(before);
        expect(chipped).toBeLessThan(100); // resisted
    });
});

describe('iron-throne — core invuln while ANY turret lives', () => {
    test('core is shielded with turrets up, vulnerable only once all four cleared', () => {
        const b = stubBoss();
        initIronThrone(b, null, 0);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        // Kill three of four turrets — the core MUST stay shielded.
        const turrets = livingParts(b);
        for (let i = 0; i < 3; i++) damageBossPart(b, turrets[i], 1e9);
        expect(ironThroneLivingTurrets(b)).toBe(1);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        // Kill the last one → core finally opens.
        damageBossPart(b, turrets[3], 1e9);
        expect(ironThroneLivingTurrets(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });
});

describe('iron-throne — turret re-arm (tougher + rotated each phase)', () => {
    test('each new phase re-arms a fresh four-turret set → core re-shields', () => {
        const b = stubBoss();
        initIronThrone(b, null, 0);
        const phase0HP = ironThroneTurretList(b)[0].maxHealth;
        const phase0Weaknesses = ironThroneTurretList(b).map((t) => turretWeakness(t));

        cycleClearAllTurrets(b);
        expect(coreVulnerable(b)).toBe(true);

        // Drop HP past the phase-1 gate; tick → phase 1 re-arms a fresh ring.
        b.health = IRON_THRONE_MAX_HEALTH * 0.5;
        updateIronThrone(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(1);
        // Fresh full four-turret set, core re-shielded.
        expect(ironThroneLivingTurrets(b)).toBe(4);
        expect(coreVulnerable(b)).toBe(false);
        // Tougher: more HP than phase 0.
        const phase1HP = ironThroneTurretList(b)[0].maxHealth;
        expect(phase1HP).toBeGreaterThan(phase0HP);
        // Rotated: the weakness set DIFFERS from phase 0.
        const phase1Weaknesses = ironThroneTurretList(b).map((t) => turretWeakness(t));
        expect(phase1Weaknesses).not.toEqual(phase0Weaknesses);
    });
});

describe('iron-throne — turret-fire cadence (stub)', () => {
    test('a volley becomes due once the interval elapses, then re-arms', () => {
        const b = stubBoss();
        initIronThrone(b, null, 0);
        // Just after init: no volley is due yet.
        expect(turretFireDue(b)).toBe(false);
        const interval = b._turretFire.intervalMs;
        expect(interval).toBeGreaterThan(0);

        // Before the deadline: still not due.
        tickTurretFire(b, interval - 1);
        expect(turretFireDue(b)).toBe(false);
        expect(b._turretFire.volleyCount).toBe(0);

        // At/after the deadline: a volley fires + the clock re-arms.
        tickTurretFire(b, interval + 1);
        expect(turretFireDue(b)).toBe(true);
        expect(b._turretFire.volleyCount).toBe(1);
        // Next deadline moved forward by one interval.
        expect(b._turretFire.nextFireAt).toBeGreaterThan(interval + 1);
    });
});

describe('iron-throne — phases advance in order + enrage', () => {
    test('phases trip 0→1→2 as HP descends; enrage fires once on the final phase', () => {
        const b = stubBoss();
        initIronThrone(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        // Cross the phase-1 gate.
        b.health = IRON_THRONE_MAX_HEALTH * 0.55;
        now += 10000;
        updateIronThrone(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false); // not yet final

        // Cross the phase-2 (final) gate → enrage.
        b.health = IRON_THRONE_MAX_HEALTH * 0.25;
        now += 10000;
        updateIronThrone(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(ironThroneIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableHomingBullets).toBe(true);

        // Enrage is latched — staying in the final phase does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateIronThrone(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initIronThrone(b, null, 0);
        b.health = 1; // below every gate at once
        updateIronThrone(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(ironThroneIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });
});

describe('iron-throne — killable by cycling elements', () => {
    test('full run: cycle elements to clear turrets each phase, whittle HP to 0', () => {
        const b = stubBoss();
        const done = [];
        initIronThrone(b, null, 0);

        let now = 20000; // past intro
        // Walk down through all three phases; in each, CYCLE elements to shed the
        // four turrets (each hit with its own weakness), then chip the core. The
        // phase-transition invuln is respected by advancing `now` past it.
        const targets = [
            IRON_THRONE_MAX_HEALTH * 0.55, // → trips phase 1
            IRON_THRONE_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                             // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateIronThrone(b, null, now); // advance phase + re-arm a fresh ring

            // Core invuln until this phase's four turrets are CYCLED down.
            if (ironThroneLivingTurrets(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                const fell = cycleClearAllTurrets(b);
                expect(fell).toBe(4); // four per-element turrets per phase
            }
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(ironThroneIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armIronThroneDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickIronThroneDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
