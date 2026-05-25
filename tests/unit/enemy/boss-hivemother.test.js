// BOSS-10 — THE HIVEMOTHER (stage 6-18, TOXIC).
//
// A TOXIC boss built as data + a thin driver over the SHIPPED boss chassis cores
// (boss-phases / boss-parts / boss-intro). These tests drive the boss headlessly
// through those runners with a stub boss + an explicit `now` (mirroring the
// boss-phases / boss-parts / harbinger / maelstrom test style) and assert the
// BOSS DoD plus the Hivemother's signature mechanics:
//   • phases advance in order (HP-gated)
//   • the core is invulnerable while egg-sacs live, vulnerable once cleared
//   • each phase re-arms a fresh, leaner egg-sac clutch (core re-shields)
//   • egg-sacs hatch adds on a per-sac cadence (addsSpawned counter + spawnPending)
//   • DESTROYING a sac permanently halts ITS spawns
//   • CORRODE clouds telegraph (wind-up) before they fire, on a per-phase cadence
//   • enrage fires in the final phase (exactly once)
//   • HP can reach 0 — the boss is killable
import { describe, expect, test } from '@jest/globals';
import {
    HIVEMOTHER,
    HIVEMOTHER_MAX_HEALTH,
    CLOUD_IDLE,
    CLOUD_TELEGRAPH,
    CLOUD_FIRE,
    initHivemother,
    updateHivemother,
    armSacSpawns,
    updateSacSpawns,
    sacIsHatching,
    armCorrodeClouds,
    updateCorrodeClouds,
    corrodeCloudState,
    isCorrodeCloudTelegraphing,
    isCorrodeCloudFiring,
    coreVulnerable,
    isEnraged,
    hivemotherLivingSacs,
    hivemotherIsFinalPhase,
    armHivemotherDeath,
    tickHivemotherDeath,
    buildPhaseScript,
    sacScriptForPhase,
} from '../../../js/modules/enemy/bosses/hivemother.js';
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

// Destroy every currently-living egg-sac, routing damage through the chassis
// part-damage path (as the collision pipeline will). Returns how many fell.
function clearAllSacs(boss) {
    const parts = livingParts(boss);
    for (const p of parts) damageBossPart(boss, p, 1e9);
    return parts.length;
}

describe('hivemother — descriptor', () => {
    test('exposes a clean TOXIC descriptor with chassis factory hooks', () => {
        expect(HIVEMOTHER.id).toBe('HIVEMOTHER');
        expect(HIVEMOTHER.element).toBe('TOXIC');
        expect(HIVEMOTHER.isBoss).toBe(true);
        expect(HIVEMOTHER.isFinalBoss).toBe(false);
        expect(HIVEMOTHER.maxHealth).toBe(HIVEMOTHER_MAX_HEALTH);
        expect(HIVEMOTHER.tierBand).toEqual([6, 18]);
        expect(typeof HIVEMOTHER.initBoss).toBe('function');
        expect(typeof HIVEMOTHER.updateBoss).toBe('function');
        // ~3-phase fight.
        expect(buildPhaseScript()).toHaveLength(3);
        expect(HIVEMOTHER.phaseCount).toBe(3);
    });

    test('egg-sac clutches get leaner / tougher each phase (brood thins-but-hardens)', () => {
        const p0 = sacScriptForPhase(0);
        const p1 = sacScriptForPhase(1);
        const p2 = sacScriptForPhase(2);
        // Fewer sacs each phase.
        expect(p0.length).toBeGreaterThan(p1.length);
        expect(p1.length).toBeGreaterThan(p2.length);
        // All sacs shield the core, carry the TOXIC element, orbit, and embed a
        // hatch cadence.
        for (const s of [...p0, ...p1, ...p2]) {
            expect(s.shieldsCore).toBe(true);
            expect(s.element).toBe('TOXIC');
            expect(s.orbit).toBeTruthy();
            expect(s.spawn).toBeTruthy();
            expect(s.spawn.intervalMs).toBeGreaterThan(0);
        }
        // Tougher each phase (more HP).
        expect(p2[0].maxHealth).toBeGreaterThan(p1[0].maxHealth);
        expect(p1[0].maxHealth).toBeGreaterThan(p0[0].maxHealth);
    });
});

describe('hivemother — init', () => {
    test('seeds full HP, enters phase 0, arms sacs + spawns + clouds, plays intro', () => {
        const b = stubBoss();
        expect(initHivemother(b, null, 0)).toBe(true);
        expect(b.health).toBe(HIVEMOTHER_MAX_HEALTH);
        expect(b.maxHealth).toBe(HIVEMOTHER_MAX_HEALTH);
        expect(b.element).toBe('TOXIC');
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('hivemother-p0');
        // Phase-0 sac clutch is up → core is shielded.
        expect(hivemotherLivingSacs(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false);
        expect(isEnraged(b)).toBe(false);
        // Spawn machine armed; no adds hatched yet.
        expect(b.addsSpawned).toBe(0);
        expect(b.spawnPending).toBe(false);
        // CORRODE clouds armed + start idle (in cooldown).
        expect(b.corrodeCloud).toBeTruthy();
        expect(corrodeCloudState(b)).toBe(CLOUD_IDLE);
        expect(isCorrodeCloudTelegraphing(b)).toBe(false);
    });
});

describe('hivemother — core invuln while egg-sacs live', () => {
    test('core is shielded with sacs up and vulnerable once they are cleared', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        expect(coreBlocksDamage(b)).toBe(true);
        expect(coreVulnerable(b)).toBe(false);

        const fell = clearAllSacs(b);
        expect(fell).toBeGreaterThan(0);
        expect(hivemotherLivingSacs(b)).toBe(0);
        expect(coreBlocksDamage(b)).toBe(false);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('partial sac clear keeps the core shielded — all sacs must fall', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        const sacs = livingParts(b);
        expect(sacs.length).toBeGreaterThan(1);
        for (let i = 0; i < sacs.length - 1; i++) damageBossPart(b, sacs[i], 1e9);
        expect(hivemotherLivingSacs(b)).toBe(1);
        expect(coreVulnerable(b)).toBe(false);
        damageBossPart(b, sacs[sacs.length - 1], 1e9);
        expect(coreVulnerable(b)).toBe(true);
    });

    test('each new phase re-arms a fresh clutch → the core re-shields', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        clearAllSacs(b);
        expect(coreVulnerable(b)).toBe(true);

        b.health = HIVEMOTHER_MAX_HEALTH * 0.5;
        const now = 30000; // well past intro + any prior invuln window
        updateHivemother(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(hivemotherLivingSacs(b)).toBeGreaterThan(0);
        expect(coreVulnerable(b)).toBe(false); // re-shielded by the new clutch
    });
});

describe('hivemother — egg-sac spawn cadence', () => {
    test('a living sac hatches one add per interval after its initial delay', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        const sacCount = hivemotherLivingSacs(b);
        const cfg = sacScriptForPhase(0)[0].spawn; // shared per-phase cadence
        const delay = cfg.delayMs;
        const interval = cfg.intervalMs;

        // Before the first hatch warm-up elapses, nothing has hatched.
        updateSacSpawns(b, delay - 1);
        expect(b.addsSpawned).toBe(0);
        expect(b.spawnPending).toBe(false);

        // First hatch window: every living sac hatches exactly once.
        updateSacSpawns(b, delay + 1);
        expect(b.addsSpawned).toBe(sacCount);
        expect(b.spawnPending).toBe(true);

        // No new interval has elapsed yet → no new hatch (and spawnPending clears).
        updateSacSpawns(b, delay + interval - 1);
        expect(b.addsSpawned).toBe(sacCount);
        expect(b.spawnPending).toBe(false);

        // Second interval crossed → every living sac hatches again.
        updateSacSpawns(b, delay + interval + 1);
        expect(b.addsSpawned).toBe(sacCount * 2);
        expect(b.spawnPending).toBe(true);
    });

    test('spawnPending is a per-frame flag — it does not stick across quiet frames', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        const cfg = sacScriptForPhase(0)[0].spawn;
        updateSacSpawns(b, cfg.delayMs + 1);   // hatch frame
        expect(b.spawnPending).toBe(true);
        updateSacSpawns(b, cfg.delayMs + 2);   // quiet frame
        expect(b.spawnPending).toBe(false);
    });

    test('a big now-jump resolves all crossed intervals at once (deterministic)', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        const sacCount = hivemotherLivingSacs(b);
        const cfg = sacScriptForPhase(0)[0].spawn;
        // Jump far past several intervals in one frame.
        const intervals = 4;
        const now = cfg.delayMs + cfg.intervalMs * (intervals - 1) + 1;
        updateSacSpawns(b, now);
        // Each living sac hatched `intervals` times.
        expect(b.addsSpawned).toBe(sacCount * intervals);
    });

    test('spawns do not advance while the boss is dying / warping', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        b._deathFlash = 1; // boss is dying
        updateSacSpawns(b, 1e9);
        expect(b.addsSpawned).toBe(0);
        expect(b.spawnPending).toBe(false);
    });
});

describe('hivemother — destroying a sac halts ITS spawns', () => {
    test('a destroyed sac stops hatching while survivors keep going', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        const sacs = livingParts(b);
        const sacCount = sacs.length;
        const cfg = sacScriptForPhase(0)[0].spawn;

        // First hatch: all sacs hatch once.
        updateSacSpawns(b, cfg.delayMs + 1);
        expect(b.addsSpawned).toBe(sacCount);

        // Destroy ONE sac, then prune its schedule via an update tick. Its
        // hatch-tracking convenience read flips off.
        const victim = sacs[0];
        expect(sacIsHatching(b, victim.id)).toBe(true);
        damageBossPart(b, victim, 1e9);
        updateSacSpawns(b, cfg.delayMs + 2); // prune the dead sac (quiet frame)
        expect(sacIsHatching(b, victim.id)).toBe(false);

        // Next interval: only the SURVIVORS hatch (sacCount - 1), not the dead one.
        const before = b.addsSpawned;
        updateSacSpawns(b, cfg.delayMs + cfg.intervalMs + 1);
        expect(b.addsSpawned - before).toBe(sacCount - 1);
    });

    test('destroying ALL sacs halts ALL spawns entirely', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        const cfg = sacScriptForPhase(0)[0].spawn;
        clearAllSacs(b);
        updateSacSpawns(b, cfg.delayMs + 2); // prune all dead sacs
        const before = b.addsSpawned;
        // Even a huge time jump hatches nothing — every sac is dead.
        updateSacSpawns(b, cfg.delayMs + cfg.intervalMs * 50);
        expect(b.addsSpawned).toBe(before);
        expect(b.spawnPending).toBe(false);
    });
});

describe('hivemother — CORRODE clouds telegraph → fire', () => {
    test('clouds cycle IDLE → TELEGRAPH (wind-up) → FIRE → IDLE on cadence', () => {
        const b = stubBoss();
        // Arm clouds directly (phase 0 cadence) at t=0; drive purely on `now`.
        armCorrodeClouds(b, 0, 0);
        expect(corrodeCloudState(b)).toBe(CLOUD_IDLE);

        const c = b.corrodeCloud;
        // Still in cooldown just before the first wind-up.
        updateCorrodeClouds(b, c.cooldownMs - 1);
        expect(corrodeCloudState(b)).toBe(CLOUD_IDLE);
        expect(isCorrodeCloudTelegraphing(b)).toBe(false);

        // Cooldown elapsed → telegraph wind-up begins (the warning).
        updateCorrodeClouds(b, c.cooldownMs + 1);
        expect(corrodeCloudState(b)).toBe(CLOUD_TELEGRAPH);
        expect(isCorrodeCloudTelegraphing(b)).toBe(true);
        expect(isCorrodeCloudFiring(b)).toBe(false);

        // Wind-up elapsed → the cloud blooms (fire).
        updateCorrodeClouds(b, c.cooldownMs + c.telegraphMs + 1);
        expect(corrodeCloudState(b)).toBe(CLOUD_FIRE);
        expect(isCorrodeCloudTelegraphing(b)).toBe(false);
        expect(isCorrodeCloudFiring(b)).toBe(true);
        expect(b.corrodeCloud.blooms).toBe(1);

        // Bloom done → back to idle for the next cooldown.
        updateCorrodeClouds(b, c.cooldownMs + c.telegraphMs + c.fireMs + 1);
        expect(corrodeCloudState(b)).toBe(CLOUD_IDLE);
        expect(isCorrodeCloudFiring(b)).toBe(false);
    });

    test('clouds NEVER fire without first telegraphing (no instant bloom)', () => {
        const b = stubBoss();
        armCorrodeClouds(b, 0, 0);
        const c = b.corrodeCloud;
        let observedTelegraph = false;
        let sawTelegraphBeforeFire = true;
        for (let now = 0; now <= c.cooldownMs + c.telegraphMs + c.fireMs; now += 50) {
            updateCorrodeClouds(b, now);
            if (corrodeCloudState(b) === CLOUD_TELEGRAPH) observedTelegraph = true;
            if (corrodeCloudState(b) === CLOUD_FIRE && !observedTelegraph) {
                sawTelegraphBeforeFire = false;
            }
        }
        expect(observedTelegraph).toBe(true);
        expect(sawTelegraphBeforeFire).toBe(true);
        expect(b.corrodeCloud.blooms).toBeGreaterThanOrEqual(1);
    });

    test('cloud cadence tightens with each phase (enrage clouds fastest)', () => {
        const b0 = stubBoss(); armCorrodeClouds(b0, 0, 0);
        const b2 = stubBoss(); armCorrodeClouds(b2, 2, 0);
        expect(b2.corrodeCloud.cooldownMs).toBeLessThan(b0.corrodeCloud.cooldownMs);
        expect(b2.corrodeCloud.telegraphMs).toBeLessThan(b0.corrodeCloud.telegraphMs);
    });

    test('clouds are re-armed (cadence tightens) when a new phase is entered', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        const p0Cooldown = b.corrodeCloud.cooldownMs;
        b.health = 1; // trip the final gate in one frame
        updateHivemother(b, null, 30000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(b.corrodeCloud.phaseIdx).toBe(2);
        expect(b.corrodeCloud.cooldownMs).toBeLessThan(p0Cooldown);
    });

    test('clouds do not advance while the boss is dying / warping', () => {
        const b = stubBoss();
        armCorrodeClouds(b, 0, 0);
        b._deathFlash = 1; // boss is dying
        updateCorrodeClouds(b, 1e9);
        expect(corrodeCloudState(b)).toBe(CLOUD_IDLE);
        expect(b.corrodeCloud.blooms).toBe(0);
    });
});

describe('hivemother — phases advance in order + enrage', () => {
    test('phases trip 0→1→2 as HP descends, enrage fires once on the final phase', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        let now = 30000; // past intro

        expect(currentPhaseIndex(b)).toBe(0);
        expect(isEnraged(b)).toBe(false);

        b.health = HIVEMOTHER_MAX_HEALTH * 0.55;
        now += 10000;
        updateHivemother(b, null, now);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(isEnraged(b)).toBe(false); // not yet final

        b.health = HIVEMOTHER_MAX_HEALTH * 0.25;
        now += 10000;
        updateHivemother(b, null, now);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(hivemotherIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
        expect(b.firingCooldownMul).toBeLessThan(1);
        expect(b.enablePoisonAura).toBe(true);

        // Enrage is latched — staying in the final phase does not re-fire it.
        const at = b._enragedAt;
        now += 5000;
        updateHivemother(b, null, now);
        expect(b._enragedAt).toBe(at);
    });

    test('several gates crossed in ONE frame still resolve in order to the final phase', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        b.health = 1; // below every gate at once
        updateHivemother(b, null, 30000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(hivemotherIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);
    });
});

describe('hivemother — killable (HP can reach 0)', () => {
    test('full run: clear sacs each phase, whittle HP to 0, play death sequence', () => {
        const b = stubBoss();
        const done = [];
        initHivemother(b, null, 0);

        let now = 30000; // past intro
        const targets = [
            HIVEMOTHER_MAX_HEALTH * 0.55, // → trips phase 1
            HIVEMOTHER_MAX_HEALTH * 0.25, // → trips phase 2 (final, enrage)
            0,                            // → killed
        ];
        for (const target of targets) {
            now += 10000;
            updateHivemother(b, null, now); // advance phase + re-arm clutch/clouds

            // Phase gating: core invuln until this phase's sacs are cleared.
            if (hivemotherLivingSacs(b) > 0) {
                expect(coreVulnerable(b)).toBe(false);
                clearAllSacs(b);
            }
            expect(coreVulnerable(b)).toBe(true);

            // Transition invuln must have elapsed → core damage now lands.
            now += 5000;
            expect(phaseBlocksDamage(b, now)).toBe(false);
            b.health = target; // the caller's damage pipeline would do this
        }

        expect(b.health).toBe(0);          // killable
        expect(hivemotherIsFinalPhase(b)).toBe(true);
        expect(isEnraged(b)).toBe(true);

        // Death detonation sequence runs to completion + fires onComplete once.
        b.active = false; b._deathFlash = 1; // boss is dying
        expect(armHivemotherDeath(b, null, now, () => done.push('victory'))).toBe(true);
        tickHivemotherDeath(b, null, now + 99999); // past every death beat
        expect(done).toEqual(['victory']);
    });
});

describe('hivemother — re-arm semantics (armSacSpawns replaces the schedule)', () => {
    test('re-arming sac spawns resets per-sac clocks but preserves the lifetime tally', () => {
        const b = stubBoss();
        initHivemother(b, null, 0);
        const cfg = sacScriptForPhase(0)[0].spawn;
        // Hatch a couple rounds.
        updateSacSpawns(b, cfg.delayMs + cfg.intervalMs + 1);
        const tally = b.addsSpawned;
        expect(tally).toBeGreaterThan(0);

        // Re-arm against the current sacs at a new `now`; the lifetime tally is
        // preserved, the per-sac schedule restarts (so nothing hatches until the
        // fresh delay elapses again).
        const reArmNow = 100000;
        armSacSpawns(b, reArmNow);
        expect(b.addsSpawned).toBe(tally);
        updateSacSpawns(b, reArmNow + cfg.delayMs - 1);
        expect(b.addsSpawned).toBe(tally); // still warming up
        updateSacSpawns(b, reArmNow + cfg.delayMs + 1);
        expect(b.addsSpawned).toBeGreaterThan(tally); // fresh round hatched
    });
});
