// BOSS-14 — THE PRISMARCH / OMEGA (stage 10-30, ALL 7 ELEMENTS, the FINAL boss).
//
// A FIVE-ASPECT GAUNTLET built as data + a thin driver over the SHIPPED boss
// chassis cores (boss-phases / boss-parts / boss-intro) plus a self-contained
// per-aspect signature-attack cadence machine. These tests drive the boss
// headlessly through those runners with a stub boss + an explicit `now`
// (mirroring the lumen / maelstrom / iron-throne test style) and assert the
// BOSS DoD + the BOSS-14 spec:
//   • ALL FIVE aspects advance in order (HP-gated)
//   • each aspect re-arms a fresh, themed weak-point ring (core re-shields)
//   • the core is invulnerable while facets live, vulnerable once cleared
//   • each aspect's SIGNATURE ATTACK telegraphs (wind-up) then FIRES on a cadence
//   • the FINAL aspect (OMEGA) enrages (exactly once)
//   • `isFinalBoss` is set on the descriptor + the live boss
//   • prismarchReachedFinalAspect(boss) reads true at the gauntlet's end
//   • HP can reach 0 — the boss is killable, and the death sequence runs
import { describe, expect, test } from '@jest/globals';
import {
    PRISMARCH,
    PRISMARCH_MAX_HEALTH,
    ASPECT_COUNT,
    ASPECTS,
    initPrismarch,
    updatePrismarch,
    coreVulnerable,
    isEnraged,
    isFinalBoss,
    armSignatureAttack,
    updateSignatureAttack,
    signatureState,
    isSignatureTelegraphing,
    isSignatureFiring,
    signatureFireCount,
    signatureAttackId,
    prismarchLivingFacets,
    prismarchIsFinalPhase,
    prismarchReachedFinalAspect,
    prismarchCurrentAspect,
    ringScriptForAspect,
    armPrismarchDeath,
    tickPrismarchDeath,
    buildPhaseScript,
    buildDeathScript,
    ATTACK_IDLE,
    ATTACK_TELEGRAPH,
    ATTACK_FIRE,
} from '../../../js/modules/enemy/bosses/prismarch.js';
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
import { ELEMENT_IDS } from '../../../js/modules/combat/elements.js';

// Plain headless stub — no DOM. Matches the chassis' boss-shape expectations
// (active/!dying/!warping gating + position for orbit math).
const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    x: 0, y: 0, angle: 0, ...over,
});

// Destroy every currently-living facet, routing damage through the chassis
// part-damage path (as the collision pipeline will). Returns how many fell.
function clearAllFacets(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('prismarch — descriptor (the FINAL boss)', () => {
    test('exposes a clean VOID descriptor with chassis factory hooks + isFinalBoss', () => {
        expect(PRISMARCH.id).toBe('PRISMARCH');
        expect(PRISMARCH.element).toBe('VOID');
        expect(PRISMARCH.isBoss).toBe(true);
        // THE defining flag for BOSS-14: this is the final boss.
        expect(PRISMARCH.isFinalBoss).toBe(true);
        expect(PRISMARCH.maxHealth).toBe(PRISMARCH_MAX_HEALTH);
        expect(PRISMARCH.tierBand).toEqual([10, 30]);
        expect(typeof PRISMARCH.initBoss).toBe('function');
        expect(typeof PRISMARCH.updateBoss).toBe('function');
        // FIVE-aspect gauntlet (not the usual three phases).
        expect(ASPECT_COUNT).toBe(5);
        expect(buildPhaseScript()).toHaveLength(5);
        expect(PRISMARCH.phaseCount).toBe(5);
        expect(PRISMARCH.aspectCount).toBe(5);
        // isFinalBoss read-through recognises the descriptor.
        expect(isFinalBoss(PRISMARCH)).toBe(true);
    });

    test('the five aspects walk the elemental wheel; all 7 elements are represented', () => {
        expect(ASPECTS).toHaveLength(5);
        const aspectEls = ASPECTS.map((a) => a.element);
        expect(aspectEls).toEqual(['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID']);
        // The finale also carries a secondary (RADIANT) element + the final flag.
        const finale = ASPECTS[4];
        expect(finale.final).toBe(true);
        expect(finale.secondaryElement).toBe('RADIANT');
        // The six aspect elements + the finale's secondary cover everything but
        // KINETIC (the chassis baseline); the descriptor's `elements` list then
        // declares all seven represented across the fight.
        const aspectRepresented = new Set([...aspectEls, finale.secondaryElement]);
        for (const id of ELEMENT_IDS) {
            if (id === 'KINETIC') continue; // baseline; not one of the six aspects
            expect(aspectRepresented.has(id)).toBe(true);
        }
        // The descriptor declares ALL SEVEN elements (KINETIC + the six aspects).
        expect(PRISMARCH.elements).toEqual(ELEMENT_IDS);
        for (const id of ELEMENT_IDS) expect(PRISMARCH.elements).toContain(id);
    });
});

describe('prismarch — init', () => {
    test('seeds full HP, enters aspect 0, arms a themed ring + attack, plays intro', () => {
        const b = stubBoss();
        expect(initPrismarch(b, null, 0)).toBe(true);
        expect(b.health).toBe(PRISMARCH_MAX_HEALTH);
        expect(b.maxHealth).toBe(PRISMARCH_MAX_HEALTH);
        expect(b.element).toBe('VOID');
        // The live boss is flagged the final boss + recognised by the read-through.
        expect(b.isFinalBoss).toBe(true);
        expect(isFinalBoss(b)).toBe(true);

        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('prismarch-pyre');
        // Aspect-0 (PYRO) ring is up → core is shielded.
        expect(prismarchLivingFacets(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
        // Aspect-0 facets carry the PYRO theme.
        for (const f of livingParts(b)) expect(f.element).toBe('PYRO');
        // Signature attack starts idle + armed with aspect-0's attack id.
        expect(signatureState(b)).toBe(ATTACK_IDLE);
        expect(isSignatureTelegraphing(b)).toBe(false);
        expect(signatureFireCount(b)).toBe(0);
        expect(signatureAttackId(b)).toBe('cinder-storm');
        // Aspect descriptor read-through points at aspect 0.
        expect(prismarchCurrentAspect(b).element).toBe('PYRO');
        // Not yet at the final aspect.
        expect(prismarchReachedFinalAspect(b)).toBe(false);
    });
});

describe('prismarch — themed ring per aspect (leaner + tougher each aspect)', () => {
    test('ringScriptForAspect produces fewer, tougher facets carrying that element', () => {
        const counts = [];
        const els = ['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID'];
        for (let i = 0; i < ASPECT_COUNT; i++) {
            const ring = ringScriptForAspect(i);
            counts.push(ring.length);
            // Every facet shields the core + carries the aspect element.
            for (const f of ring) {
                expect(f.shieldsCore).toBe(true);
                expect(f.element).toBe(els[i]);
                expect(f.orbit).toBeTruthy();
            }
        }
        // Strictly decreasing facet count as the gauntlet escalates.
        for (let i = 1; i < counts.length; i++) {
            expect(counts[i]).toBeLessThan(counts[i - 1]);
        }
    });

    test('core shielded with facets up, vulnerable once cleared', () => {
        const b = stubBoss();
        initPrismarch(b, null, 0);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        const fell = clearAllFacets(b);
        expect(fell).toBeGreaterThan(0);
        expect(prismarchLivingFacets(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('partial facet clear keeps the core shielded — the whole ring is required', () => {
        const b = stubBoss();
        initPrismarch(b, null, 0);
        const facets = livingParts(b);
        expect(facets.length).toBeGreaterThan(1);
        for (let i = 0; i < facets.length - 1; i++) damageBossPart(b, facets[i], 1e9);
        expect(prismarchLivingFacets(b)).toBe(1);
        expect(coreVulnerable(b)).toBe(false);
        damageBossPart(b, facets[facets.length - 1], 1e9);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('each new aspect re-arms a fresh themed ring → the core re-shields', () => {
        const b = stubBoss();
        initPrismarch(b, null, 0);
        const aspect0Facets = prismarchLivingFacets(b);
        clearAllFacets(b);
        expect(coreVulnerable(b)).toBe(true);

        // Drop HP past the aspect-1 gate; tick → aspect 1 (CRYO) re-arms the ring.
        b.health = PRISMARCH_MAX_HEALTH * 0.75;
        const now = 20000; // well past the intro + any prior invuln window
        updatePrismarch(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        const aspect1Facets = prismarchLivingFacets(b);
        expect(aspect1Facets).toBeGreaterThan(0);
        expect(aspect1Facets).toBeLessThan(aspect0Facets); // leaner each aspect
        expect(coreVulnerable(b)).toBe(false);             // re-shielded
        // The new ring carries the CRYO theme + the signature attack swapped.
        for (const f of livingParts(b)) expect(f.element).toBe('CRYO');
        expect(signatureAttackId(b)).toBe('glacial-lance');
        expect(prismarchCurrentAspect(b).element).toBe('CRYO');
    });
});

describe('prismarch — signature attack telegraph → fire', () => {
    test('cycles IDLE → TELEGRAPH (wind-up) → FIRE → IDLE on its cadence', () => {
        const b = stubBoss();
        // Arm the aspect-0 attack directly at t=0; drive purely on `now`.
        armSignatureAttack(b, 0, 0);
        expect(signatureState(b)).toBe(ATTACK_IDLE);

        const s = b.signature;
        // Still in cooldown just before the first wind-up.
        updateSignatureAttack(b, s.cooldownMs - 1);
        expect(signatureState(b)).toBe(ATTACK_IDLE);
        expect(isSignatureTelegraphing(b)).toBe(false);

        // Cooldown elapsed → telegraph wind-up begins (the warning).
        updateSignatureAttack(b, s.cooldownMs + 1);
        expect(signatureState(b)).toBe(ATTACK_TELEGRAPH);
        expect(isSignatureTelegraphing(b)).toBe(true);
        expect(isSignatureFiring(b)).toBe(false);
        expect(signatureFireCount(b)).toBe(0); // not fired during wind-up

        // Wind-up elapsed → the strike fires.
        updateSignatureAttack(b, s.cooldownMs + s.telegraphMs + 1);
        expect(signatureState(b)).toBe(ATTACK_FIRE);
        expect(isSignatureTelegraphing(b)).toBe(false);
        expect(isSignatureFiring(b)).toBe(true);
        expect(signatureFireCount(b)).toBe(1);

        // Strike done → back to idle for the next cooldown.
        updateSignatureAttack(b, s.cooldownMs + s.telegraphMs + s.fireMs + 1);
        expect(signatureState(b)).toBe(ATTACK_IDLE);
        expect(isSignatureFiring(b)).toBe(false);
    });

    test('NEVER fires without first telegraphing (no instant strike)', () => {
        const b = stubBoss();
        armSignatureAttack(b, 0, 0);
        const s = b.signature;
        let observedTelegraph = false;
        let firedAfterTelegraph = false;
        for (let now = 0; now <= s.cooldownMs + s.telegraphMs + s.fireMs; now += 25) {
            updateSignatureAttack(b, now);
            if (signatureState(b) === ATTACK_TELEGRAPH) observedTelegraph = true;
            if (signatureState(b) === ATTACK_FIRE && observedTelegraph) {
                firedAfterTelegraph = true;
            }
        }
        expect(observedTelegraph).toBe(true);
        expect(firedAfterTelegraph).toBe(true);
        expect(signatureFireCount(b)).toBe(1);
    });

    test('through the boss update path: telegraph latches then fires, count bumps', () => {
        const b = stubBoss();
        initPrismarch(b, null, 0);

        // Idle through the initial cooldown — no telegraph yet.
        updatePrismarch(b, null, 1000);
        expect(isSignatureTelegraphing(b)).toBe(false);
        expect(signatureFireCount(b)).toBe(0);

        // After the cooldown elapses, the telegraph latches.
        updatePrismarch(b, null, 4500);
        expect(isSignatureTelegraphing(b)).toBe(true);
        expect(signatureFireCount(b)).toBe(0);

        // Once the wind-up completes it FIRES: telegraph clears, count bumps.
        updatePrismarch(b, null, 7000);
        expect(isSignatureTelegraphing(b)).toBe(false);
        expect(signatureFireCount(b)).toBe(1);
    });
});

describe('prismarch — all five aspects advance in order + enrage on the finale', () => {
    test('aspects trip 0→1→2→3→4 as HP descends, enrage fires once on OMEGA', () => {
        const b = stubBoss();
        initPrismarch(b, null, 0);
        let now = 20000; // past intro

        // Walk down through every gate, one aspect at a time.
        const expectedEls = ['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID'];
        const gates = [0.8, 0.6, 0.4, 0.2];
        let idx = 0;
        for (const gate of gates) {
            idx += 1;
            b.health = PRISMARCH_MAX_HEALTH * gate;
            now += 10000;
            updatePrismarch(b, null, now);
            expect(currentPhaseIndex(b)).toBe(idx);
            expect(prismarchCurrentAspect(b).element).toBe(expectedEls[idx]);
            // Enrage only on the final aspect.
            if (idx < ASPECT_COUNT - 1) {
                expect(isEnraged(b)).toBe(false);
                expect(prismarchReachedFinalAspect(b)).toBe(false);
            }
        }

        // Now on the final aspect (OMEGA) → enraged + reached-final reads true.
        expect(currentPhaseIndex(b)).toBe(4);
        expect(prismarchIsFinalPhase(b)).toBe(true);
        expect(prismarchReachedFinalAspect(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableHomingBullets).toBe(true);
        // Finale signature attack is the RADIANT/VOID annihilation beam.
        expect(signatureAttackId(b)).toBe('annihilation');
        expect(b.signature.element).toBe('RADIANT');

        // Enrage is latched — staying in the final aspect does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updatePrismarch(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final aspect', () => {
        const b = stubBoss();
        initPrismarch(b, null, 0);
        b.health = 1; // below every gate at once
        updatePrismarch(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(ASPECT_COUNT - 1);
        expect(prismarchIsFinalPhase(b)).toBe(true);
        expect(prismarchReachedFinalAspect(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        // Every phase onEnter fired in order (the final aspect's ring is up).
        expect(prismarchLivingFacets(b)).toBeGreaterThan(0);
    });

    test('enrage tightens the signature cadence (faster than baseline)', () => {
        // Baseline boss: time-to-second-fire at the finale (aspect 4) cadence.
        const base = stubBoss();
        base.active = true; base._deathFlash = 0; base.warping = false;
        armSignatureAttack(base, 4, 0);
        let bn = 0;
        while (signatureFireCount(base) < 2 && bn < 60000) {
            bn += 50; updateSignatureAttack(base, bn);
        }
        const baselineTwoFiresAt = bn;

        // Enraged boss: same aspect-4 cadence machinery, tighter timing.
        const rage = stubBoss();
        rage._enraged = true; // pretend already enraged before arming
        armSignatureAttack(rage, 4, 0);
        let rn = 0;
        while (signatureFireCount(rage) < 2 && rn < 60000) {
            rn += 50; updateSignatureAttack(rage, rn);
        }
        const enragedTwoFiresAt = rn;

        expect(signatureFireCount(base)).toBe(2);
        expect(signatureFireCount(rage)).toBe(2);
        expect(enragedTwoFiresAt).toBeLessThan(baselineTwoFiresAt);
    });
});

describe('prismarch — killable (HP can reach 0) + the finale death sequence', () => {
    test('full gauntlet: break each aspect, whittle HP to 0, run the death sequence', () => {
        const b = stubBoss();
        const done = [];
        initPrismarch(b, null, 0);

        let now = 20000; // past intro
        // Walk down through all five aspects; in each, break the ring then chip the
        // core. The phase-transition invuln window is respected by advancing `now`
        // well past it before applying core damage.
        const targets = [
            PRISMARCH_MAX_HEALTH * 0.8, // → trips aspect 1
            PRISMARCH_MAX_HEALTH * 0.6, // → trips aspect 2
            PRISMARCH_MAX_HEALTH * 0.4, // → trips aspect 3
            PRISMARCH_MAX_HEALTH * 0.2, // → trips aspect 4 (final, enrage)
            0,                          // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updatePrismarch(b, null, now); // advance aspect + re-arm ring

            // Aspect gating: core invuln until this aspect's ring is broken.
            if (prismarchLivingFacets(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                clearAllFacets(b);
            }
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);                          // killable
        expect(prismarchIsFinalPhase(b)).toBe(true);
        expect(prismarchReachedFinalAspect(b)).toBe(true); // reached the finale
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        // (BOSS-04 wires run-complete onto THIS onComplete — here we just verify
        // the sequence runs the beats and completes.)
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(buildDeathScript().length).toBeGreaterThan(0);
        expect(armPrismarchDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickPrismarchDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
