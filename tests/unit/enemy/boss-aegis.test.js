// BOSS-06 — THE AEGIS (stage 2-6, armor / KINETIC chassis).
//
// The armor boss, built as data + a thin driver over the SHIPPED boss chassis
// cores (boss-phases / boss-parts / boss-intro). These tests drive the boss
// headlessly through those runners with a stub boss + an explicit `now`
// (mirroring the harbinger / boss-phases / boss-parts test style) and assert the
// BOSS DoD plus the AEGIS-specific armor mechanics:
//   • phases advance in order (HP-gated)
//   • the core is invulnerable while armor plates live, vulnerable once shed
//   • each phase re-arms a fresh (smaller, tougher) plate wall — the PLATE-SHED
//   • ROTATING PLATE-GAP: one ring slot is left empty per phase
//   • CORRODE-BYPASS: a Toxic hit ignores plate armor + reaches the core even
//     while plates live
//   • enrage fires in the final phase (exactly once)
//   • HP can reach 0 — the boss is killable
import { describe, expect, test } from '@jest/globals';
import {
    AEGIS,
    AEGIS_MAX_HEALTH,
    BYPASS_ELEMENT,
    initAegis,
    updateAegis,
    coreVulnerable,
    coreDamageableBy,
    isCorrodeBypass,
    resolvePlateDamage,
    isEnraged,
    aegisLivingPlates,
    aegisPlateList,
    aegisIsFinalPhase,
    armAegisDeath,
    tickAegisDeath,
    buildPhaseScript,
} from '../../../js/modules/enemy/bosses/aegis.js';
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

// Destroy every currently-living armor plate, routing damage through the
// chassis part-damage path (as the collision pipeline will). Returns how many
// fell. Plate armor resist is irrelevant here — we deal raw lethal damage.
function clearAllPlates(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('aegis — descriptor', () => {
    test('exposes a clean armor descriptor with chassis factory hooks', () => {
        expect(AEGIS.id).toBe('AEGIS');
        expect(AEGIS.element).toBe('KINETIC');
        expect(AEGIS.isBoss).toBe(true);
        expect(AEGIS.isFinalBoss).toBe(false);
        expect(AEGIS.maxHealth).toBe(AEGIS_MAX_HEALTH);
        expect(AEGIS.tierBand).toEqual([2, 6]);
        expect(AEGIS.bypassElement).toBe(BYPASS_ELEMENT);
        expect(typeof AEGIS.initBoss).toBe('function');
        expect(typeof AEGIS.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(AEGIS.phaseCount).toBe(3);
    });
});

describe('aegis — init', () => {
    test('seeds full HP, enters phase 0, arms a plate wall, plays intro', () => {
        const b = stubBoss();
        expect(initAegis(b, null, 0)).toBe(true);
        expect(b.health).toBe(AEGIS_MAX_HEALTH);
        expect(b.maxHealth).toBe(AEGIS_MAX_HEALTH);
        expect(b.element).toBe('KINETIC');
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('aegis-p0');
        // Phase-0 plate wall is up → core is shielded.
        expect(aegisLivingPlates(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
    });
});

describe('aegis — rotating plate-gap', () => {
    test('the plate ring leaves exactly one slot empty (the gap)', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        // Phase 0 is a 6-slot wall with one gap → 5 plates.
        const plates = aegisPlateList(b);
        expect(plates).toHaveLength(5);
        // No plate occupies the gap slot (slot 0): ids encode the slot.
        const slotIds = plates.map((p) => p.id);
        expect(slotIds).not.toContain('p0-plate-0'); // gap slot is empty
        expect(slotIds).toContain('p0-plate-1');
    });

    test('plates orbit (the gap sweeps) — positions change as time advances', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        const before = aegisPlateList(b).map((p) => ({ id: p.id, x: p.x, y: p.y }));
        updateAegis(b, null, 3000); // advance the orbit clock
        const after = aegisPlateList(b);
        // At least one plate has moved → the ring (and its gap) is rotating.
        const moved = after.some((p) => {
            const prev = before.find((q) => q.id === p.id);
            return prev && (Math.abs(prev.x - p.x) > 1e-6 || Math.abs(prev.y - p.y) > 1e-6);
        });
        expect(moved).toBe(true);
    });
});

describe('aegis — core invuln while plates live', () => {
    test('core is shielded with plates up and vulnerable once they are cleared', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        // Plates shield the core.
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        // Clear the wall → core opens.
        const fell = clearAllPlates(b);
        expect(fell).toBeGreaterThan(0);
        expect(aegisLivingPlates(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('each new phase re-arms a fresh wall (plate-shed) → core re-shields', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        const phase0Plates = aegisLivingPlates(b);
        clearAllPlates(b);
        expect(coreVulnerable(b)).toBe(true);

        // Drop HP past the phase-1 gate; tick the boss → phase 1 sheds + re-arms.
        b.health = AEGIS_MAX_HEALTH * 0.5;
        const now = 20000; // well past the intro + any prior invuln window
        updateAegis(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(aegisLivingPlates(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false); // re-shielded by the new wall
        // Plate-shed = the wall thins (fewer plates than the previous phase).
        expect(aegisLivingPlates(b)).toBeLessThan(phase0Plates);
    });
});

describe('aegis — CORRODE bypass (armor counterplay)', () => {
    test('plates carry a KINETIC armor resist; CORRODE ignores it', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        const plate = aegisPlateList(b)[0];
        // Armor: the plate resists KINETIC.
        expect(plate.resist.KINETIC).toBeGreaterThan(0);

        // A plain KINETIC hit is reduced by the armor resist…
        const kinetic = resolvePlateDamage(plate, 100, 'KINETIC');
        expect(kinetic).toBeLessThan(100);
        // …while a CORRODE (Toxic) hit bypasses the resist → full damage.
        const corrode = resolvePlateDamage(plate, 100, BYPASS_ELEMENT);
        expect(corrode).toBe(100);
        expect(corrode).toBeGreaterThan(kinetic);
    });

    test('isCorrodeBypass recognizes string / object / array element shapes', () => {
        expect(isCorrodeBypass(BYPASS_ELEMENT)).toBe(true);
        expect(isCorrodeBypass('KINETIC')).toBe(false);
        expect(isCorrodeBypass({ element: BYPASS_ELEMENT })).toBe(true);
        expect(isCorrodeBypass({ element: 'PYRO' })).toBe(false);
        expect(isCorrodeBypass([BYPASS_ELEMENT, 'KINETIC'])).toBe(true); // multi-element
        expect(isCorrodeBypass({ elements: ['CRYO', BYPASS_ELEMENT] })).toBe(true);
        expect(isCorrodeBypass(null)).toBe(false);
    });

    test('CORRODE reaches the CORE through living plates; plain hits do not', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        // Plates are up.
        expect(coreBlocksDamage(b)).toBe(true);
        // A plain KINETIC hit cannot reach the core while plates live…
        expect(coreDamageableBy(b, 'KINETIC')).toBe(false);
        // …but a CORRODE hit bypasses the armor wall and reaches the core.
        expect(coreDamageableBy(b, BYPASS_ELEMENT)).toBe(true);

        // Once the wall is shed, ANY element reaches the core.
        clearAllPlates(b);
        expect(coreDamageableBy(b, 'KINETIC')).toBe(true);
        expect(coreDamageableBy(b, BYPASS_ELEMENT)).toBe(true);
    });

    test('CORRODE-bypass kill: chip the CORE through living armor to 0 HP', () => {
        const b = stubBoss();
        const done = [];
        initAegis(b, null, 0);
        // Never touch the plates — purely exploit CORRODE through the wall.
        let now = 20000; // past intro
        // Each gate trips, sheds a fresh wall, but CORRODE keeps reaching the core.
        const targets = [
            AEGIS_MAX_HEALTH * 0.55, // → phase 1
            AEGIS_MAX_HEALTH * 0.25, // → phase 2 (final, enrage)
            0,                       // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateAegis(b, null, now); // advance phase + re-arm (shed) wall
            // Plates are up every phase, yet CORRODE can damage the core.
            expect(aegisLivingPlates(b)).toBeGreaterThan(0);
            expect(coreDamageableBy(b, BYPASS_ELEMENT)).toBe(true);
            now += 5000; // clear the transition invuln window
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // CORRODE damage the pipeline would apply to the core
        }
        expect(b.health).toBe(0); // killable via CORRODE bypass alone
        expect(aegisIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        b.active = false; b._deathFlash = 1;
        expect(armAegisDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickAegisDeath(b, null, now + 99999);
        expect(done).toEqual(['victory']);
    });
});

describe('aegis — phases advance in order + enrage', () => {
    test('phases trip 0→1→2 as HP descends, enrage fires once on the final phase', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        // Cross the phase-1 gate.
        b.health = AEGIS_MAX_HEALTH * 0.55;
        now += 10000;
        updateAegis(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false); // not yet final

        // Cross the phase-2 (final) gate → enrage.
        b.health = AEGIS_MAX_HEALTH * 0.25;
        now += 10000;
        updateAegis(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(aegisIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableHomingBullets).toBe(true);

        // Enrage is latched — staying in the final phase does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateAegis(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        b.health = 1; // below every gate at once
        updateAegis(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(aegisIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });
});

describe('aegis — killable (HP can reach 0)', () => {
    test('full run: shed + clear plates each phase, whittle HP to 0, play death', () => {
        const b = stubBoss();
        const done = [];
        initAegis(b, null, 0);

        let now = 20000; // past intro
        // Walk down through all three phases; in each, clear the wall then chip
        // the core. The phase-transition invuln window is respected by advancing
        // `now` well past it before applying core damage.
        const targets = [
            AEGIS_MAX_HEALTH * 0.55, // → trips phase 1
            AEGIS_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                       // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateAegis(b, null, now); // advance phase + re-arm (shed) wall

            // Phase gating: core invuln until this phase's plates are cleared.
            if (aegisLivingPlates(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                clearAllPlates(b);
            }
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(aegisIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armAegisDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickAegisDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
