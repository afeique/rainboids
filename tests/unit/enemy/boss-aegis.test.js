// THE AEGIS — stage 2 boss (9.1.0 "massive maneuver-around" redesign).
//
// Headless tests over the shipped chassis (boss-phases / boss-parts / boss-intro)
// with a stub boss + explicit `now`. The 9.1.0 redesign replaced the old armor /
// CORRODE-bypass element gating with a PURE POSITIONING fight:
//   • a dome of armor petals on the FRONT arc shields the core
//   • the dome TRACKS the player (boss.angle eases toward the player)
//   • the reactor is only vulnerable from BEHIND — when the player is in the
//     rear arc, the petals stop shielding and the core takes damage
//   • phases shed-and-harden: P0 (7 petals) → P1 (5) → P2 (shield shed, enrage)
//   • the boss is killable; the death sequence runs to completion
import { describe, expect, test } from '@jest/globals';
import {
    AEGIS,
    AEGIS_MAX_HEALTH,
    initAegis,
    updateAegis,
    coreVulnerable,
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

const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    x: 0, y: 0, angle: 0, radius: 170, ...over,
});
const stubCtx = (px, py) => ({ player: { x: px, y: py, active: true, radius: 15 } });

function clearAllPlates(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('aegis — descriptor', () => {
    test('clean positioning-fight descriptor with chassis hooks + custom renderer', () => {
        expect(AEGIS.id).toBe('AEGIS');
        expect(AEGIS.element).toBe('KINETIC'); // tint only — no element gating
        expect(AEGIS.isBoss).toBe(true);
        expect(AEGIS.isFinalBoss).toBe(false);
        expect(AEGIS.maxHealth).toBe(AEGIS_MAX_HEALTH);
        expect(AEGIS.tierBand).toEqual([2, 6]);
        // 9.1.0 — no element-lock fields.
        expect(AEGIS.bypassElement).toBeUndefined();
        expect(typeof AEGIS.initBoss).toBe('function');
        expect(typeof AEGIS.updateBoss).toBe('function');
        expect(typeof AEGIS.draw).toBe('function'); // per-boss renderer
        expect(buildPhaseScript()).toHaveLength(3);
        expect(AEGIS.phaseCount).toBe(3);
    });
});

describe('aegis — init', () => {
    test('seeds full HP, enters phase 0, raises a 7-petal front dome, shields core', () => {
        const b = stubBoss();
        expect(initAegis(b, null, 0)).toBe(true);
        expect(b.health).toBe(AEGIS_MAX_HEALTH);
        expect(b.element).toBe('KINETIC');
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('aegis-p0');
        // P0 dome = 7 petals across the front arc; no gap-slot scheme.
        expect(aegisLivingPlates(b)).toBe(7);
        const ids = aegisPlateList(b).map((p) => p.id);
        expect(ids).toContain('p0-plate-0');
        expect(ids).toContain('p0-plate-6');
        // Petals shield the core at rest.
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
        // Spawn anchor captured for the hold-position behaviour.
        expect(b._anchorX).toBe(0);
        expect(b._anchorY).toBe(0);
    });
});

describe('aegis — tracking dome', () => {
    test('the dome re-aims toward the player (boss.angle eases toward them)', () => {
        const b = stubBoss({ angle: 0 });
        initAegis(b, null, 0);
        // Player directly below → target facing = +PI/2. One short frame should
        // ease the facing a little in that direction (capped turn rate).
        updateAegis(b, stubCtx(0, 1000), 16);
        expect(b.angle).toBeGreaterThan(0);
        expect(b.angle).toBeLessThan(Math.PI / 2);
    });
});

describe('aegis — rear-arc reactor (the positioning mechanic)', () => {
    test('reactor stays CLOSED while the player faces the shield', () => {
        const b = stubBoss({ angle: 0 }); // shield-face points +x
        initAegis(b, null, 0);
        updateAegis(b, stubCtx(1000, 0), 16); // player in front
        expect(b._reactorOpen).toBe(false);
        expect(coreVulnerable(b)).toBe(false); // petals shield the core
    });

    test('reactor OPENS when the player flanks to the rear arc', () => {
        const b = stubBoss({ angle: 0 }); // shield-face points +x, rear = -x
        initAegis(b, null, 0);
        updateAegis(b, stubCtx(-1000, 0), 16); // player behind
        expect(b._reactorOpen).toBe(true);
        expect(coreVulnerable(b)).toBe(true); // petals stop shielding → core open
    });

    test('grinding the petals down is a valid alternate opening', () => {
        const b = stubBoss({ angle: 0 });
        initAegis(b, null, 0);
        // Player in front (reactor would be closed) — but destroy every petal.
        clearAllPlates(b);
        expect(aegisLivingPlates(b)).toBe(0);
        updateAegis(b, stubCtx(1000, 0), 16);
        expect(coreVulnerable(b)).toBe(true); // no shielding parts → core open
    });
});

describe('aegis — phases shed-and-harden + enrage', () => {
    test('phases trip 0→1→2 as HP descends; P2 sheds the shield + enrages once', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(aegisLivingPlates(b)).toBe(7);

        // Phase 1 — fewer, tougher petals.
        b.health = AEGIS_MAX_HEALTH * 0.55;
        now += 10000;
        updateAegis(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(aegisLivingPlates(b)).toBe(5);
        expect(isEnraged(b)).toBe(false);

        // Phase 2 — shield shed entirely → core exposed; enrage.
        b.health = AEGIS_MAX_HEALTH * 0.25;
        now += 10000;
        updateAegis(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(aegisIsFinalPhase(b)).toBe(true);
        expect(aegisLivingPlates(b)).toBe(0);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);

        // Enrage is latched.
        const at = b._enragedAt;
        now += 5000;
        updateAegis(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in one frame still resolve to the final phase', () => {
        const b = stubBoss();
        initAegis(b, null, 0);
        b.health = 1;
        updateAegis(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(aegisIsFinalPhase(b)).toBe(true);
        expect(aegisLivingPlates(b)).toBe(0);
        expect(isEnraged(b)).toBe(true);
    });
});

describe('aegis — killable (HP can reach 0)', () => {
    test('full run: open the core each phase, whittle HP to 0, play death', () => {
        const b = stubBoss();
        const done = [];
        initAegis(b, null, 0);

        let now = 20000;
        const targets = [
            AEGIS_MAX_HEALTH * 0.55, // → phase 1
            AEGIS_MAX_HEALTH * 0.25, // → phase 2 (final, enrage)
            0,                       // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateAegis(b, null, now); // advance phase + re-arm/shed
            if (aegisLivingPlates(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                clearAllPlates(b);
            }
            expect(coreVulnerable(b)).toBe(true);
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target;
        }
        expect(b.health).toBe(0);
        expect(aegisIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        b.active = false; b._deathFlash = 1;
        expect(armAegisDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickAegisDeath(b, null, now + 99999);
        expect(done).toEqual(['victory']);
    });
});
