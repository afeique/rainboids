// BOSS-08 — GEMINI (stage 4-12, Pyro+Cryo twin boss).
//
// The twin boss, built as data + a thin driver over the SHIPPED boss chassis
// cores (boss-phases / boss-parts / boss-intro). These tests drive the boss
// headlessly through those runners with a stub boss + an explicit `now`
// (mirroring the harbinger / aegis / iron-throne test style) and assert the BOSS
// DoD plus the GEMINI-specific twin mechanics:
//   • phases advance in order (HP-gated)
//   • the LINK (core) is invulnerable while EITHER twin lives, vulnerable only
//     once BOTH twins are cleared
//   • OPPOSITE-RESIST gating: the PYRO twin resists Pyro / is weak to Cryo, and
//     the CRYO twin resists Cryo / is weak to Pyro → you must bring both elements
//   • TETHER: `boss.tetherActive` is true while both twins live, false once one dies
//   • PARTNER-ENRAGE: killing one twin enrages the survivor (`boss.partnerEnraged`)
//   • each phase RE-ARMS a fresh, tougher twin pair (tether re-links)
//   • the boss-wide enrage fires in the final phase (exactly once)
//   • HP can reach 0 — the boss is KILLABLE by bringing both counter-elements
import { describe, expect, test } from '@jest/globals';
import {
    GEMINI,
    GEMINI_MAX_HEALTH,
    PYRO_TWIN,
    CRYO_TWIN,
    initGemini,
    updateGemini,
    coreVulnerable,
    oppositeElement,
    twinScriptForPhase,
    twinWeakness,
    isTwinWeakness,
    resolveTwinDamage,
    isTetherActive,
    isPartnerEnraged,
    survivingTwin,
    isEnraged,
    geminiTwin,
    geminiTwinList,
    geminiLivingTwins,
    geminiIsFinalPhase,
    armGeminiDeath,
    tickGeminiDeath,
    buildPhaseScript,
} from '../../../js/modules/enemy/bosses/gemini.js';
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
import { elementalMultiplier } from '../../../js/modules/combat/elements.js';

// Plain headless stub — no DOM. Matches the chassis' boss-shape expectations
// (active/!dying/!warping gating + position for orbit math).
const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    x: 0, y: 0, angle: 0, ...over,
});

// Clear BOTH currently-living twins by bringing BOTH counter-elements: each twin
// is hit only with the element it's WEAK to (the opposite element → full damage),
// routed through the chassis part-damage path (as the collision pipeline will).
// Asserts that a SAME-element hit on each twin would have done strictly less.
// Returns how many twins fell.
function clearBothTwins(boss) {
    const twins = livingParts(boss);
    for (const t of twins) {
        const weak = twinWeakness(t);          // the OPPOSITE element
        const same = t.element;                // the element it embodies (resisted)
        const weakDmg = resolveTwinDamage(t, 1000, weak);
        const sameDmg = resolveTwinDamage(t, 1000, same);
        expect(weakDmg).toBeGreaterThan(sameDmg);
        damageBossPart(boss, t, resolveTwinDamage(t, 1e9, weak));
    }
    return twins.length;
}

describe('gemini — descriptor', () => {
    test('exposes a clean twin descriptor with chassis factory hooks', () => {
        expect(GEMINI.id).toBe('GEMINI');
        expect(GEMINI.isBoss).toBe(true);
        expect(GEMINI.isFinalBoss).toBe(false);
        expect(GEMINI.maxHealth).toBe(GEMINI_MAX_HEALTH);
        expect(GEMINI.tierBand).toEqual([4, 12]);
        expect(GEMINI.twinElements).toEqual([PYRO_TWIN, CRYO_TWIN]);
        expect(typeof GEMINI.initBoss).toBe('function');
        expect(typeof GEMINI.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(GEMINI.phaseCount).toBe(3);
        // The two twins embody opposite elements.
        expect(oppositeElement(PYRO_TWIN)).toBe(CRYO_TWIN);
        expect(oppositeElement(CRYO_TWIN)).toBe(PYRO_TWIN);
    });
});

describe('gemini — init', () => {
    test('seeds full HP, enters phase 0, arms two twins, links tether, plays intro', () => {
        const b = stubBoss();
        expect(initGemini(b, null, 0)).toBe(true);
        expect(b.health).toBe(GEMINI_MAX_HEALTH);
        expect(b.maxHealth).toBe(GEMINI_MAX_HEALTH);
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('gemini-p0');
        // Phase-0 pair is up → the LINK is shielded; exactly two twins.
        expect(geminiLivingTwins(b)).toBe(2);
        expect(coreVulnerable(b)).toBe(false);
        // Tether links while both live; no partner-enrage yet; boss not enraged.
        expect(isTetherActive(b)).toBe(true);
        expect(isPartnerEnraged(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
    });
});

describe('gemini — opposite-resist twins', () => {
    test('every phase has exactly two twins (PYRO + CRYO) with OPPOSITE resists', () => {
        for (let phase = 0; phase < 3; phase++) {
            const script = twinScriptForPhase(phase);
            expect(script).toHaveLength(2);

            const pyro = script.find((t) => t.element === PYRO_TWIN);
            const cryo = script.find((t) => t.element === CRYO_TWIN);
            expect(pyro).toBeTruthy();
            expect(cryo).toBeTruthy();

            // PYRO twin: RESISTS Pyro (positive) but WEAK to Cryo (negative).
            expect(pyro.resist[PYRO_TWIN]).toBeGreaterThan(0.5);
            expect(pyro.resist[CRYO_TWIN]).toBeLessThan(0);
            expect(pyro.weakness).toBe(CRYO_TWIN);

            // CRYO twin: the MIRROR — resists Cryo but weak to Pyro.
            expect(cryo.resist[CRYO_TWIN]).toBeGreaterThan(0.5);
            expect(cryo.resist[PYRO_TWIN]).toBeLessThan(0);
            expect(cryo.weakness).toBe(PYRO_TWIN);
        }
    });

    test('a twin takes FULL+bonus damage from its OPPOSITE element, REDUCED from its OWN', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        const pyro = geminiTwin(b, PYRO_TWIN);
        const cryo = geminiTwin(b, CRYO_TWIN);

        // Cryo (the counter) wrecks the PYRO twin; Pyro barely scratches it.
        const cryoVsPyro = resolveTwinDamage(pyro, 100, CRYO_TWIN);
        const pyroVsPyro = resolveTwinDamage(pyro, 100, PYRO_TWIN);
        expect(cryoVsPyro).toBeGreaterThanOrEqual(100); // weakness → full + bonus
        expect(pyroVsPyro).toBeLessThan(100);           // same element → resisted
        expect(cryoVsPyro).toBeGreaterThan(pyroVsPyro);

        // The CRYO twin is the exact mirror — Pyro wrecks it, Cryo is resisted.
        const pyroVsCryo = resolveTwinDamage(cryo, 100, PYRO_TWIN);
        const cryoVsCryo = resolveTwinDamage(cryo, 100, CRYO_TWIN);
        expect(pyroVsCryo).toBeGreaterThanOrEqual(100);
        expect(cryoVsCryo).toBeLessThan(100);
        expect(pyroVsCryo).toBeGreaterThan(cryoVsCryo);

        // Matches the shipped elements.elementalMultiplier exactly.
        expect(cryoVsPyro).toBeCloseTo(100 * elementalMultiplier(pyro.resist, CRYO_TWIN), 6);
        expect(pyroVsCryo).toBeCloseTo(100 * elementalMultiplier(cryo.resist, PYRO_TWIN), 6);
    });

    test('isTwinWeakness recognizes string / object / array element shapes', () => {
        const pyro = twinScriptForPhase(0).find((t) => t.element === PYRO_TWIN);
        expect(pyro.weakness).toBe(CRYO_TWIN);
        expect(isTwinWeakness(pyro, CRYO_TWIN)).toBe(true);
        expect(isTwinWeakness(pyro, PYRO_TWIN)).toBe(false);
        expect(isTwinWeakness(pyro, { element: CRYO_TWIN })).toBe(true);
        expect(isTwinWeakness(pyro, { element: PYRO_TWIN })).toBe(false);
        expect(isTwinWeakness(pyro, [PYRO_TWIN, CRYO_TWIN])).toBe(true);
        expect(isTwinWeakness(pyro, { elements: [PYRO_TWIN, CRYO_TWIN] })).toBe(true);
        expect(isTwinWeakness(pyro, null)).toBe(false);
    });

    test('hitting a twin with its OWN element barely chips it (need the opposite)', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        const pyro = geminiTwin(b, PYRO_TWIN);
        const before = pyro.health;
        // One same-element (Pyro) hit of 100 raw damage on the Pyro twin.
        damageBossPart(b, pyro, resolveTwinDamage(pyro, 100, PYRO_TWIN));
        const chipped = before - pyro.health;
        expect(pyro.alive).toBe(true);
        expect(chipped).toBeLessThan(before);
        expect(chipped).toBeLessThan(100); // resisted
    });
});

describe('gemini — LINK invuln while EITHER twin lives', () => {
    test('core is shielded while either twin lives, open only once BOTH cleared', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        // Kill ONE twin — the LINK MUST stay shielded (the survivor still gates it).
        const twins = livingParts(b);
        damageBossPart(b, twins[0], 1e9);
        updateGemini(b, null, 10000); // tick so the tether/partner-enrage recompute
        expect(geminiLivingTwins(b)).toBe(1);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        // Kill the survivor → the LINK finally opens.
        damageBossPart(b, survivingTwin(b), 1e9);
        updateGemini(b, null, 10001);
        expect(geminiLivingTwins(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });
});

describe('gemini — tether + partner-enrage', () => {
    test('tether is live while both twins survive, snaps when one dies', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        expect(isTetherActive(b)).toBe(true);

        // Kill one twin → tether snaps.
        const twins = livingParts(b);
        damageBossPart(b, twins[0], 1e9);
        updateGemini(b, null, 10000);
        expect(isTetherActive(b)).toBe(false);
    });

    test('killing ONE twin ENRAGES the survivor (partner-enrage), latched once', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        expect(isPartnerEnraged(b)).toBe(false);

        // Kill the PYRO twin → the CRYO twin (survivor) enrages.
        const pyro = geminiTwin(b, PYRO_TWIN);
        damageBossPart(b, pyro, 1e9);
        updateGemini(b, null, 10000);

        expect(isPartnerEnraged(b)).toBe(true);
        const survivor = survivingTwin(b);
        expect(survivor).toBeTruthy();
        expect(survivor.element).toBe(CRYO_TWIN);
        expect(survivor.partnerEnraged).toBe(true);
        // The boss records WHICH twin survived + got buffed.
        expect(b.partnerEnraged).toBe(CRYO_TWIN);
        // The survivor is buffed (harder + faster) for the engine to read.
        expect(survivor.enrageDamageMul).toBeGreaterThan(1);
        expect(survivor.enrageFireMul).toBeLessThan(1);

        // Latched: re-ticking does not re-fire / re-stamp the partner-enrage.
        const at = b._partnerEnragedAt;
        updateGemini(b, null, 15000);
        expect(b._partnerEnragedAt).toBe(at);
    });

    test('re-arming a fresh pair clears partner-enrage + re-links the tether', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        // Lose a twin → partner-enrage + tether snap.
        damageBossPart(b, livingParts(b)[0], 1e9);
        updateGemini(b, null, 10000);
        expect(isPartnerEnraged(b)).toBe(true);
        expect(isTetherActive(b)).toBe(false);

        // Drop HP past the phase-1 gate → fresh pair re-arms.
        b.health = GEMINI_MAX_HEALTH * 0.5;
        updateGemini(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(geminiLivingTwins(b)).toBe(2);
        // Fresh pair → tether re-linked, no survivor enrage carried over.
        expect(isTetherActive(b)).toBe(true);
        expect(isPartnerEnraged(b)).toBe(false);
    });
});

describe('gemini — twin re-arm (tougher each phase)', () => {
    test('each new phase re-arms a fresh, TOUGHER twin pair → LINK re-shields', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        const phase0HP = geminiTwinList(b)[0].maxHealth;

        clearBothTwins(b);
        expect(coreVulnerable(b)).toBe(true);

        // Drop HP past the phase-1 gate; tick → phase 1 re-arms a fresh pair.
        b.health = GEMINI_MAX_HEALTH * 0.5;
        updateGemini(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(geminiLivingTwins(b)).toBe(2);
        expect(coreVulnerable(b)).toBe(false);
        // Tougher: more HP than phase 0.
        const phase1HP = geminiTwinList(b)[0].maxHealth;
        expect(phase1HP).toBeGreaterThan(phase0HP);
        // Still opposite-resist (PYRO + CRYO, mirrored).
        const elems = geminiTwinList(b).map((t) => t.element).sort();
        expect(elems).toEqual([CRYO_TWIN, PYRO_TWIN]);
    });
});

describe('gemini — phases advance in order + final-phase enrage', () => {
    test('phases trip 0→1→2 as HP descends; enrage fires once on the final phase', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        // Cross the phase-1 gate.
        b.health = GEMINI_MAX_HEALTH * 0.55;
        now += 10000;
        updateGemini(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false); // not yet final

        // Cross the phase-2 (final) gate → enrage.
        b.health = GEMINI_MAX_HEALTH * 0.25;
        now += 10000;
        updateGemini(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(geminiIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableHomingBullets).toBe(true);

        // Boss-wide enrage is latched — staying final does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateGemini(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initGemini(b, null, 0);
        b.health = 1; // below every gate at once
        updateGemini(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(geminiIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });
});

describe('gemini — killable by bringing both counter-elements', () => {
    test('full run: clear both opposite-resist twins each phase, whittle HP to 0', () => {
        const b = stubBoss();
        const done = [];
        initGemini(b, null, 0);

        let now = 20000; // past intro
        const targets = [
            GEMINI_MAX_HEALTH * 0.55, // → trips phase 1
            GEMINI_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                        // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateGemini(b, null, now); // advance phase + re-arm a fresh pair

            // LINK invuln until BOTH opposite-resist twins are shed (need Pyro AND Cryo).
            if (geminiLivingTwins(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                const fell = clearBothTwins(b);
                expect(fell).toBe(2); // exactly two twins per phase
            }
            // After both twins fall the LINK opens (re-evaluate via a tick).
            updateGemini(b, null, now + 1);
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(geminiIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armGeminiDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickGeminiDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
