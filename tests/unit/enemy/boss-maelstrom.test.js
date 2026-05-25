// BOSS-09 — MAELSTROM THE STORM CROWN (stage 5-15, VOLT).
//
// A VOLT boss built as data + a thin driver over the SHIPPED boss chassis cores
// (boss-phases / boss-parts / boss-intro). These tests drive the boss headlessly
// through those runners with a stub boss + an explicit `now` (mirroring the
// boss-phases / boss-parts / harbinger test style) and assert the BOSS DoD plus
// Maelstrom's signature mechanics:
//   • phases advance in order (HP-gated)
//   • the core is invulnerable while conduit nodes live, vulnerable once cleared
//   • each phase re-arms a fresh, leaner node ring (core re-shields per phase)
//   • CONDUCT rain telegraphs (wind-up) before it fires, on a per-phase cadence
//   • enrage fires in the final phase (exactly once)
//   • HP can reach 0 — the boss is killable
import { describe, expect, test } from '@jest/globals';
import {
    MAELSTROM,
    MAELSTROM_MAX_HEALTH,
    RAIN_IDLE,
    RAIN_TELEGRAPH,
    RAIN_FIRE,
    initMaelstrom,
    updateMaelstrom,
    armConductRain,
    updateConductRain,
    conductRainState,
    isConductRainTelegraphing,
    isConductRainFiring,
    coreVulnerable,
    isEnraged,
    maelstromLivingNodes,
    maelstromIsFinalPhase,
    armMaelstromDeath,
    tickMaelstromDeath,
    buildPhaseScript,
    nodeScriptForPhase,
} from '../../../js/modules/enemy/bosses/maelstrom.js';
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

// Destroy every currently-living conduit node, routing damage through the chassis
// part-damage path (as the collision pipeline will). Returns how many fell.
function clearAllNodes(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('maelstrom — descriptor', () => {
    test('exposes a clean VOLT descriptor with chassis factory hooks', () => {
        expect(MAELSTROM.id).toBe('MAELSTROM');
        expect(MAELSTROM.element).toBe('VOLT');
        expect(MAELSTROM.isBoss).toBe(true);
        expect(MAELSTROM.isFinalBoss).toBe(false);
        expect(MAELSTROM.maxHealth).toBe(MAELSTROM_MAX_HEALTH);
        expect(MAELSTROM.tierBand).toEqual([5, 15]);
        expect(typeof MAELSTROM.initBoss).toBe('function');
        expect(typeof MAELSTROM.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(MAELSTROM.phaseCount).toBe(3);
    });

    test('conduit-node rings get leaner / faster each phase', () => {
        const p0 = nodeScriptForPhase(0);
        const p1 = nodeScriptForPhase(1);
        const p2 = nodeScriptForPhase(2);
        // Fewer nodes each phase.
        expect(p0.length).toBeGreaterThan(p1.length);
        expect(p1.length).toBeGreaterThan(p2.length);
        // All nodes shield the core + carry the VOLT element.
        for (const n of [...p0, ...p1, ...p2]) {
            expect(n.shieldsCore).toBe(true);
            expect(n.element).toBe('VOLT');
            expect(n.orbit).toBeTruthy();
        }
        // Faster orbit each phase (magnitude).
        const spd = (n) => Math.abs(n.orbit.speed);
        expect(spd(p2[0])).toBeGreaterThan(spd(p1[0]));
        expect(spd(p1[0])).toBeGreaterThan(spd(p0[0]));
    });
});

describe('maelstrom — init', () => {
    test('seeds full HP, enters phase 0, arms a node ring + rain, plays intro', () => {
        const b = stubBoss();
        expect(initMaelstrom(b, null, 0)).toBe(true);
        expect(b.health).toBe(MAELSTROM_MAX_HEALTH);
        expect(b.maxHealth).toBe(MAELSTROM_MAX_HEALTH);
        expect(b.element).toBe('VOLT');
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('maelstrom-p0');
        // Phase-0 node ring is up → core is shielded.
        expect(maelstromLivingNodes(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
        // CONDUCT rain is armed + starts idle (in cooldown).
        expect(b.conductRain).toBeTruthy();
        expect(conductRainState(b)).toBe(RAIN_IDLE);
        expect(isConductRainTelegraphing(b)).toBe(false);
    });
});

describe('maelstrom — core invuln while nodes live', () => {
    test('core is shielded with nodes up and vulnerable once they are cleared', () => {
        const b = stubBoss();
        initMaelstrom(b, null, 0);
        // Nodes shield the core.
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        // Clear the ring → core opens.
        const fell = clearAllNodes(b);
        expect(fell).toBeGreaterThan(0);
        expect(maelstromLivingNodes(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('partial node clear keeps the core shielded — full sequence is required', () => {
        const b = stubBoss();
        initMaelstrom(b, null, 0);
        const nodes = livingParts(b);
        expect(nodes.length).toBeGreaterThan(1);
        // Destroy all but one node → core still shielded.
        for (let i = 0; i < nodes.length - 1; i++) damageBossPart(b, nodes[i], 1e9);
        expect(maelstromLivingNodes(b)).toBe(1);
        expect(coreVulnerable(b)).toBe(false);
        // Last node falls → window opens.
        damageBossPart(b, nodes[nodes.length - 1], 1e9);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('each new phase re-arms a fresh ring → the core re-shields', () => {
        const b = stubBoss();
        initMaelstrom(b, null, 0);
        clearAllNodes(b);
        expect(coreVulnerable(b)).toBe(true);

        // Drop HP past the phase-1 gate; tick the boss → phase 1 re-arms nodes.
        b.health = MAELSTROM_MAX_HEALTH * 0.5;
        const now = 20000; // well past the intro + any prior invuln window
        updateMaelstrom(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(maelstromLivingNodes(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false); // re-shielded by the new ring
    });
});

describe('maelstrom — CONDUCT rain telegraph → fire', () => {
    test('rain cycles IDLE → TELEGRAPH (wind-up) → FIRE → IDLE on its cadence', () => {
        const b = stubBoss();
        // Arm rain directly (phase 0 cadence) at t=0; drive purely on `now`.
        armConductRain(b, 0, 0);
        expect(conductRainState(b)).toBe(RAIN_IDLE);

        const r = b.conductRain;
        // Still in cooldown just before the first wind-up.
        updateConductRain(b, r.cooldownMs - 1);
        expect(conductRainState(b)).toBe(RAIN_IDLE);
        expect(isConductRainTelegraphing(b)).toBe(false);

        // Cooldown elapsed → telegraph wind-up begins (the warning).
        updateConductRain(b, r.cooldownMs + 1);
        expect(conductRainState(b)).toBe(RAIN_TELEGRAPH);
        expect(isConductRainTelegraphing(b)).toBe(true);
        expect(isConductRainFiring(b)).toBe(false);

        // Wind-up elapsed → the strike fires.
        updateConductRain(b, r.cooldownMs + r.telegraphMs + 1);
        expect(conductRainState(b)).toBe(RAIN_FIRE);
        expect(isConductRainTelegraphing(b)).toBe(false);
        expect(isConductRainFiring(b)).toBe(true);
        expect(b.conductRain.strikes).toBe(1);

        // Strike done → back to idle for the next cooldown.
        updateConductRain(b, r.cooldownMs + r.telegraphMs + r.fireMs + 1);
        expect(conductRainState(b)).toBe(RAIN_IDLE);
        expect(isConductRainFiring(b)).toBe(false);
    });

    test('rain NEVER fires without first telegraphing (no instant strike)', () => {
        const b = stubBoss();
        armConductRain(b, 0, 0);
        const r = b.conductRain;
        // Jump a long way forward: the machine resolves transitions in order, so
        // it must have passed through TELEGRAPH before FIRE — strikes count only
        // ever increments out of the telegraph state.
        let sawTelegraphBeforeFire = true;
        // Step through fine-grained ticks across the first full cycle and assert
        // a FIRE is always immediately preceded (within the same cycle) by a
        // TELEGRAPH window having been observed.
        let observedTelegraph = false;
        for (let now = 0; now <= r.cooldownMs + r.telegraphMs + r.fireMs; now += 50) {
            updateConductRain(b, now);
            if (conductRainState(b) === RAIN_TELEGRAPH) observedTelegraph = true;
            if (conductRainState(b) === RAIN_FIRE && !observedTelegraph) {
                sawTelegraphBeforeFire = false;
            }
        }
        expect(observedTelegraph).toBe(true);
        expect(sawTelegraphBeforeFire).toBe(true);
        expect(b.conductRain.strikes).toBeGreaterThanOrEqual(1);
    });

    test('rain cadence tightens with each phase (enrage rains fastest)', () => {
        const b0 = stubBoss(); armConductRain(b0, 0, 0);
        const b2 = stubBoss(); armConductRain(b2, 2, 0);
        // Cooldown between strikes shrinks phase-over-phase.
        expect(b2.conductRain.cooldownMs).toBeLessThan(b0.conductRain.cooldownMs);
        expect(b2.conductRain.telegraphMs).toBeLessThan(b0.conductRain.telegraphMs);
    });

    test('rain is re-armed (cadence tightens) when a new phase is entered', () => {
        const b = stubBoss();
        initMaelstrom(b, null, 0);
        const p0Cooldown = b.conductRain.cooldownMs;
        // Trip the phase-2 (final) gate in one frame.
        b.health = 1;
        updateMaelstrom(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(b.conductRain.phaseIdx).toBe(2);
        expect(b.conductRain.cooldownMs).toBeLessThan(p0Cooldown);
    });

    test('rain does not advance while the boss is dying / warping', () => {
        const b = stubBoss();
        armConductRain(b, 0, 0);
        b._deathFlash = 1; // boss is dying
        updateConductRain(b, 1e9);
        expect(conductRainState(b)).toBe(RAIN_IDLE);
        expect(b.conductRain.strikes).toBe(0);
    });
});

describe('maelstrom — phases advance in order + enrage', () => {
    test('phases trip 0→1→2 as HP descends, enrage fires once on the final phase', () => {
        const b = stubBoss();
        initMaelstrom(b, null, 0);
        let now = 20000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        // Cross the phase-1 gate.
        b.health = MAELSTROM_MAX_HEALTH * 0.55;
        now += 10000;
        updateMaelstrom(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false); // not yet final

        // Cross the phase-2 (final) gate → enrage.
        b.health = MAELSTROM_MAX_HEALTH * 0.25;
        now += 10000;
        updateMaelstrom(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(maelstromIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enableChainLightning).toBe(true);

        // Enrage is latched — staying in the final phase does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateMaelstrom(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initMaelstrom(b, null, 0);
        b.health = 1; // below every gate at once
        updateMaelstrom(b, null, 20000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(maelstromIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });
});

describe('maelstrom — killable (HP can reach 0)', () => {
    test('full run: clear nodes each phase, whittle HP to 0, play death sequence', () => {
        const b = stubBoss();
        const done = [];
        initMaelstrom(b, null, 0);

        let now = 20000; // past intro
        // Walk down through all three phases; in each, clear the ring then chip
        // the core. The phase-transition invuln window is respected by advancing
        // `now` well past it before applying core damage.
        const targets = [
            MAELSTROM_MAX_HEALTH * 0.55, // → trips phase 1
            MAELSTROM_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                           // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateMaelstrom(b, null, now); // advance phase + re-arm ring/rain

            // Phase gating: core invuln until this phase's nodes are cleared.
            if (maelstromLivingNodes(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                clearAllNodes(b);
            }
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(maelstromIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armMaelstromDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickMaelstromDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});
