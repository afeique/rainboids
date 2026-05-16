/**
 * tests/unit/sim/wave.test.js — pure-function tests for js/sim/wave.js.
 *
 * Pins the wave-pacing decision (≤2-enemy advance trigger, 12 s
 * stale-fallback) and the wave phase machine (intro → spawning →
 * clearing → complete) so the legacy wave-manager pacing stays
 * byte-for-byte equivalent. The test file is companion to
 * `tests/unit/wave.test.js` (which covers the static wave-data
 * lookups) — this file covers the dynamic step.
 *
 * Companion to agent A's `tests/unit/sim/ship.test.js` (the model for
 * Round-2 sim tests).
 */

import {
    updateWave,
    getWaveConfig,
    getEnemyLevel,
    getAsteroidLevel,
    isBossWave,
    SUB_WAVE_ADVANCE_ENEMY_THRESHOLD,
    SUB_WAVE_ADVANCE_STALE_MS,
} from '../../../js/sim/wave.js';
import { freshWaveState } from '../../../js/sim/state.js';
import { MAX_WAVES, BOSS_WAVES, GAME_STATES } from '../../../js/modules/core/constants.js';
import { tryAdvanceSubWave } from '../../../js/modules/wave/wave-manager.js';

// ---------------------------------------------------------------------------
// Helpers — minimal context bag matching the WaveUpdateContext shape.
// ---------------------------------------------------------------------------

function ctx({ enemyCount = 0, dt = 1 / 60, ships = [], rng = null } = {}) {
    return { enemyCount, dt, ships, rng };
}

// ---------------------------------------------------------------------------
// freshWaveState() factory.
// ---------------------------------------------------------------------------

describe('freshWaveState() factory', () => {
    test('returns a wave state with sensible defaults', () => {
        const w = freshWaveState(1);
        expect(w.number).toBe(1);
        expect(w.startedAtTick).toBe(0);
        expect(w.subWaveIndex).toBe(0);
        expect(w.spawnTimer).toBe(0);
        expect(w.phase).toBe('intro');
    });

    test('clamps wave number to >= 1', () => {
        expect(freshWaveState(0).number).toBe(1);
        expect(freshWaveState(-5).number).toBe(1);
    });

    test('respects overrides', () => {
        const w = freshWaveState(5, { phase: 'spawning', subWaveIndex: 2 });
        expect(w.number).toBe(5);
        expect(w.phase).toBe('spawning');
        expect(w.subWaveIndex).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// updateWave() — phase machine.
// ---------------------------------------------------------------------------

describe('updateWave() — phase machine', () => {
    test("'intro' phase is a no-op (waiting for wrapper to flip → spawning)", () => {
        const wave = freshWaveState(1, { phase: 'intro' });
        const events = [];
        updateWave(wave, ctx(), events);
        expect(wave.phase).toBe('intro');
        expect(events).toHaveLength(0);
    });

    test("'complete' phase is a no-op (terminal)", () => {
        const wave = freshWaveState(1, { phase: 'complete', subWaveIndex: 99 });
        const events = [];
        updateWave(wave, ctx(), events);
        expect(wave.phase).toBe('complete');
        expect(events).toHaveLength(0);
    });

    test("'clearing' transitions to 'complete' when enemies reach zero, emits wave_clear", () => {
        const wave = freshWaveState(1, { phase: 'clearing' });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 0 }), events);
        expect(wave.phase).toBe('complete');
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: 'wave_clear', wave: 1 });
    });

    test("'clearing' stays in 'clearing' while enemies remain", () => {
        const wave = freshWaveState(1, { phase: 'clearing' });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 5 }), events);
        expect(wave.phase).toBe('clearing');
        expect(events).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// updateWave() — sub-wave advance.
// ---------------------------------------------------------------------------

describe('updateWave() — sub-wave advance trigger', () => {
    test('does not spawn when enemyCount > 2 and elapsed < 12 s', () => {
        const wave = freshWaveState(1, { phase: 'spawning' });
        const events = [];
        // 5 enemies left, 1/60 s elapsed — neither trigger fires.
        updateWave(wave, ctx({ enemyCount: 5, dt: 1 / 60 }), events);
        expect(wave.subWaveIndex).toBe(0);
        expect(events).toHaveLength(0);
        // spawnTimer should accumulate ~16ms.
        expect(wave.spawnTimer).toBeGreaterThan(0);
        expect(wave.spawnTimer).toBeLessThanOrEqual(20);
    });

    test('spawns when enemyCount ≤ 2 (player has the field mostly cleared)', () => {
        const wave = freshWaveState(1, { phase: 'spawning' });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 2 }), events);
        expect(wave.subWaveIndex).toBe(1);
        expect(events.length).toBeGreaterThan(0);
        expect(events.every(e => e.type === 'enemy_spawn')).toBe(true);
        expect(wave.spawnTimer).toBe(0);
    });

    test('spawns when 12 s elapsed even with enemies still alive', () => {
        const wave = freshWaveState(1, {
            phase: 'spawning',
            spawnTimer: SUB_WAVE_ADVANCE_STALE_MS,
        });
        const events = [];
        // 10 enemies still alive — would normally block the advance.
        updateWave(wave, ctx({ enemyCount: 10 }), events);
        expect(wave.subWaveIndex).toBe(1);
        expect(events.length).toBeGreaterThan(0);
    });

    test('SUB_WAVE_ADVANCE_ENEMY_THRESHOLD is 2 (verbatim from wave-manager.js)', () => {
        expect(SUB_WAVE_ADVANCE_ENEMY_THRESHOLD).toBe(2);
    });

    test('SUB_WAVE_ADVANCE_STALE_MS is 12000 (verbatim from wave-manager.js)', () => {
        expect(SUB_WAVE_ADVANCE_STALE_MS).toBe(12000);
    });
});

// ---------------------------------------------------------------------------
// updateWave() — enemy_spawn event shape.
// ---------------------------------------------------------------------------

describe('updateWave() — enemy_spawn event shape', () => {
    test('emits one enemy_spawn event per group in the sub-wave', () => {
        // Wave 1 sub-wave 0 has one group: { type: 'HUNTER', count: 3 }.
        const wave = freshWaveState(1, { phase: 'spawning' });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 0 }), events);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            type: 'enemy_spawn',
            enemyType: 'HUNTER',
            count: 3,
            level: 1,
            wave: 1,
            subWaveIndex: 0,
        });
    });

    test('emits one event per group when sub-wave has multiple groups', () => {
        // Wave 1 sub-wave 1 has two groups (HUNTER ×2, WASP ×2).
        const wave = freshWaveState(1, { phase: 'spawning', subWaveIndex: 1 });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 0 }), events);
        // 5.101.0 — sub-wave content here is still HUNTER + WASP. The
        // expectation is "≥2 spawn events whose types include HUNTER &
        // WASP", which is robust to future per-wave tweaks.
        expect(events.length).toBeGreaterThanOrEqual(2);
        const types = new Set(events.map(e => e.enemyType));
        expect(types.has('HUNTER')).toBe(true);
        expect(types.has('WASP')).toBe(true);
    });

    test('boss waves carry isBoss + bossTier through the event', () => {
        // 6.1.0 — Wave 3 (stage 1-3) is the first boss wave now; the
        // final sub-wave (index 1, since wave 3 has 2 sub-waves)
        // contains the TITAN boss with bossTier=1.
        const wave = freshWaveState(3, { phase: 'spawning', subWaveIndex: 1 });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 0 }), events);
        const bossEvent = events.find(e => e.enemyType === 'TITAN');
        expect(bossEvent).toBeDefined();
        expect(bossEvent.isBoss).toBe(true);
        expect(bossEvent.bossTier).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// updateWave() — phase transitions on last sub-wave.
// ---------------------------------------------------------------------------

describe('updateWave() — last sub-wave transition', () => {
    test('all sub-waves spawned + enemies remain → moves to clearing', () => {
        // 5.101.0 — derive `pastLast` from the live wave config so this
        // test stays valid as wave 1's sub-wave count changes.
        const wave1Cfg = getWaveConfig(1);
        const pastLast = wave1Cfg.subWaves.length;
        const wave = freshWaveState(1, {
            phase: 'spawning',
            subWaveIndex: pastLast,
        });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 4 }), events);
        expect(wave.phase).toBe('clearing');
        // No enemy_spawn — we're done spawning.
        expect(events.filter(e => e.type === 'enemy_spawn')).toHaveLength(0);
    });

    test('all sub-waves spawned + zero enemies → jumps straight to complete', () => {
        const wave1Cfg = getWaveConfig(1);
        const pastLast = wave1Cfg.subWaves.length;
        const wave = freshWaveState(1, {
            phase: 'spawning',
            subWaveIndex: pastLast,
        });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 0 }), events);
        expect(wave.phase).toBe('complete');
        expect(events).toContainEqual({ type: 'wave_clear', wave: 1 });
    });
});

// ---------------------------------------------------------------------------
// getWaveConfig() — re-export parity (must agree with wave-data.js).
// ---------------------------------------------------------------------------

describe('getWaveConfig() — re-export from wave-data.js', () => {
    test('returns the wave 1 config with subWaves array', () => {
        const cfg = getWaveConfig(1);
        expect(cfg).toBeDefined();
        expect(Array.isArray(cfg.subWaves)).toBe(true);
        expect(cfg.subWaves.length).toBeGreaterThan(0);
    });

    test('boss waves are flagged with isBossWave=true', () => {
        for (const w of BOSS_WAVES) {
            expect(getWaveConfig(w).isBossWave).toBe(true);
        }
    });

    test('clamps wave numbers > MAX_WAVES to the last wave', () => {
        const cfg21 = getWaveConfig(MAX_WAVES + 1);
        const cfg20 = getWaveConfig(MAX_WAVES);
        expect(cfg21).toEqual(cfg20);
    });

    test('isBossWave() is exact set [5,10,15,20]', () => {
        for (let w = 1; w <= MAX_WAVES; w++) {
            const expected = BOSS_WAVES.includes(w);
            expect(isBossWave(w)).toBe(expected);
        }
    });

    test('getEnemyLevel matches wave number 1..20 directly', () => {
        for (let w = 1; w <= MAX_WAVES; w++) {
            expect(getEnemyLevel(w)).toBe(w);
        }
    });

    test('getAsteroidLevel ramps every other wave (ceil(w/2))', () => {
        expect(getAsteroidLevel(1)).toBe(1);
        expect(getAsteroidLevel(2)).toBe(1);
        expect(getAsteroidLevel(3)).toBe(2);
        expect(getAsteroidLevel(4)).toBe(2);
        expect(getAsteroidLevel(20)).toBe(10);
        // 5.101.0 — campaign expanded to 30 waves; the ceil(w/2) curve
        // continues without a plateau, so wave 30 = level 15.
        expect(getAsteroidLevel(MAX_WAVES)).toBe(Math.ceil(MAX_WAVES / 2));
    });
});

// ---------------------------------------------------------------------------
// updateWave() — full-wave drive (smoke test).
// ---------------------------------------------------------------------------

describe('updateWave() — full-wave drive smoke test', () => {
    test('wave 1 fully drains all sub-waves and transitions to complete', () => {
        // 5.101.0 — Wave 1 has N sub-waves (currently 3). Spawn each one
        // until every group has fired, then verify the next tick
        // transitions to 'complete' + emits wave_clear. Total spawn
        // count needs to be at least N (one spawn event per sub-wave).
        const wave1Cfg = getWaveConfig(1);
        const totalSubWaves = wave1Cfg.subWaves.length;
        const wave = freshWaveState(1, { phase: 'spawning' });
        let totalSpawnEvents = 0;
        // Each spawning tick must increment subWaveIndex by exactly 1
        // and emit at least one enemy_spawn event. After totalSubWaves
        // ticks we should have all sub-waves out.
        for (let i = 0; i < totalSubWaves; i++) {
            const events = [];
            const prevIdx = wave.subWaveIndex;
            updateWave(wave, ctx({ enemyCount: 0 }), events);
            expect(wave.subWaveIndex).toBe(prevIdx + 1);
            const spawns = events.filter(e => e.type === 'enemy_spawn');
            expect(spawns.length).toBeGreaterThan(0);
            totalSpawnEvents += spawns.length;
        }
        expect(totalSpawnEvents).toBeGreaterThan(0);
        // Final tick: zero enemies + all sub-waves out → complete.
        const events = [];
        updateWave(wave, ctx({ enemyCount: 0 }), events);
        expect(wave.phase).toBe('complete');
        expect(events).toContainEqual({ type: 'wave_clear', wave: 1 });
    });

    test('null wave returns null without crashing', () => {
        const events = [];
        expect(() => updateWave(null, ctx(), events)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// Replay parity — pure `updateWave` ↔ legacy `tryAdvanceSubWave`.
//
// Drives BOTH paths through the same input sequence (per-tick enemy
// count) and asserts the spawn sequences match in (enemyType, count,
// bossTier) tuples. Pins behavioral parity so the wave-manager wiring
// swap (#39) is provably safe — once these tests pass against the
// legacy path, swapping `WaveManager.updateWaveSystem` to drive
// `updateWave` + drain `enemy_spawn` events cannot regress sub-wave
// pacing or content.
//
// Time semantics: pure `updateWave` accumulates `ctx.dt` into
// `wave.spawnTimer` (ms); legacy `tryAdvanceSubWave` reads
// `Date.now() - lastSubWaveSpawnAt`. The enemy-count trigger (≤2
// enemies) is path-independent — both paths fire on the same tick
// for the same input. The stale-fallback test arms each path with
// its own clock at the threshold.
// ---------------------------------------------------------------------------

function makeLegacyStub(waveNumber, enemyCountVec, opts = {}) {
    let tickIdx = 0;
    const recorded = [];
    const stub = {
        game: {
            state: GAME_STATES.PLAYING,
            currentWave: waveNumber,
            waveComplete: false,
            subWaveIndex: opts.subWaveIndex !== undefined ? opts.subWaveIndex : 0,
            // Default to "now" so elapsed≈0 at first tick — only the
            // ≤2-enemy branch fires unless the test overrides this.
            lastSubWaveSpawnAt: opts.lastSubWaveSpawnAt !== undefined
                ? opts.lastSubWaveSpawnAt
                : Date.now(),
        },
        enemyPool: {
            // Read fresh each tick so the test can drive a vector.
            get activeObjects() {
                return { length: enemyCountVec[tickIdx] | 0 };
            },
        },
        // Swallow the ui:show-message phase toast spawnSubWave emits
        // for sub-wave > 0.
        events: { emit() {} },
        spawnLeveledEnemies(type, count, opts2 = {}) {
            const e = { enemyType: type, count: count | 0 };
            if (opts2.bossTier) e.bossTier = opts2.bossTier | 0;
            recorded.push(e);
        },
    };
    return {
        stub,
        recorded,
        tick() {
            tryAdvanceSubWave.call(stub);
            tickIdx += 1;
        },
    };
}

function pureSpawnsFromEvents(events) {
    const out = [];
    for (const ev of events) {
        if (ev.type !== 'enemy_spawn') continue;
        const e = { enemyType: ev.enemyType, count: ev.count | 0 };
        if (ev.bossTier) e.bossTier = ev.bossTier | 0;
        out.push(e);
    }
    return out;
}

function drivePure(waveNumber, enemyCountVec, overrides = {}) {
    const wave = freshWaveState(waveNumber, { phase: 'spawning', ...overrides });
    const all = [];
    for (const enemyCount of enemyCountVec) {
        const events = [];
        updateWave(wave, ctx({ enemyCount }), events);
        all.push(...events);
    }
    return { wave, events: all, spawns: pureSpawnsFromEvents(all) };
}

describe('replay parity — updateWave ↔ legacy tryAdvanceSubWave', () => {
    test('wave 1 — ≤2-enemy advance produces identical spawn sequence', () => {
        // 5.101.0 — wave 1 now has 3 sub-waves; extend the input vec so
        // every sub-wave gets a chance to spawn. The invariant is the
        // pure ↔ legacy spawn parity, not a hard-coded length.
        const enemyCountVec = [0, 5, 2, 5, 2, 0];

        const pure = drivePure(1, enemyCountVec);
        const legacy = makeLegacyStub(1, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        // Sanity: parity is meaningless if neither path actually spawned.
        expect(pure.spawns.length).toBeGreaterThan(0);
        expect(pure.spawns[0]).toEqual({ enemyType: 'HUNTER', count: 3 });
    });

    test('wave 3 (stage 1-3) — boss sub-wave preserves bossTier on both paths', () => {
        // 6.1.0 — Wave 3 is the first boss wave under the stage system
        // (stage 1-3). 2 sub-waves: escort, then TITAN bossTier=1.
        const enemyCountVec = [0, 0, 0];

        const pure = drivePure(3, enemyCountVec);
        const legacy = makeLegacyStub(3, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);

        const pureBoss = pure.spawns.find(e => e.enemyType === 'TITAN');
        const legacyBoss = legacy.recorded.find(e => e.enemyType === 'TITAN');
        expect(pureBoss).toBeDefined();
        expect(legacyBoss).toBeDefined();
        expect(pureBoss.bossTier).toBe(1);
        expect(legacyBoss.bossTier).toBe(1);
    });

    test('wave 3 — 20-tick mixed scenario produces identical spawn sequences', () => {
        // Realistic-ish: enemies tick down between sub-waves, occasionally
        // staying high. Wave 3 now has 4 sub-waves (5.101.0) with varied
        // groups. The invariant: same enemyCount inputs → same spawn
        // outputs across pure ↔ legacy.
        const enemyCountVec = [
            0,                          // t0:  spawn sub-wave 0
            6, 6, 5, 4, 3,              // t1-5: enemies decreasing, no spawn
            2,                          // t6:  spawn sub-wave 1
            8, 7, 6, 5, 4, 3,           // t7-12: enemies high after spawn
            2,                          // t13: spawn sub-wave 2
            5, 4, 3,                    // t14-16: high again
            2,                          // t17: spawn sub-wave 3
            2, 1, 0,                    // t18-20: clearing
        ];

        const pure = drivePure(3, enemyCountVec);
        const legacy = makeLegacyStub(3, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        // 5.101.0 — Don't hard-code the spawn count; just assert ≥ the
        // number of sub-waves (one spawn call per group across all
        // sub-waves).
        const wave3Cfg = getWaveConfig(3);
        expect(pure.spawns.length).toBeGreaterThanOrEqual(wave3Cfg.subWaves.length);
    });

    test('12s stale-fallback: both paths fire on the time trigger', () => {
        // Single-tick scenario: 10 enemies still alive (≤2 trigger blocked),
        // but each path has its spawn-timer pre-armed at the 12 s
        // threshold. After the wave-manager wiring swap, the wrapper
        // shares the pure step's spawnTimer accumulator — no more
        // wallclock comparison — so we arm both sides identically.
        const enemyCountVec = [10];

        const pure = drivePure(1, enemyCountVec, {
            spawnTimer: SUB_WAVE_ADVANCE_STALE_MS,
        });

        const legacy = makeLegacyStub(1, enemyCountVec);
        legacy.stub._waveState = freshWaveState(1, {
            phase: 'spawning',
            subWaveIndex: 0,
            spawnTimer: SUB_WAVE_ADVANCE_STALE_MS,
        });
        legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        expect(pure.spawns.length).toBeGreaterThan(0);
    });

    test('past-final sub-wave: neither path emits further spawns', () => {
        const wave1Cfg = getWaveConfig(1);
        const totalSubWaves = wave1Cfg.subWaves.length;
        const enemyCountVec = [0, 0, 0];

        const pure = drivePure(1, enemyCountVec, {
            subWaveIndex: totalSubWaves,
        });
        const legacy = makeLegacyStub(1, enemyCountVec, {
            subWaveIndex: totalSubWaves,
        });
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual([]);
        expect(legacy.recorded).toEqual([]);
        // Pure additionally transitions phase to 'complete' and emits
        // a wave_clear event — that's wrapper-level sequencing that the
        // legacy path delegates to updateWaveSystem (see allSubWavesSpawned
        // gate at wave-manager.js:64). Out of scope for this parity check.
    });

    test('wave 12 (stage 4-3) — twin-boss: bossTier=2 carries through both paths', () => {
        // 6.1.0 — Wave 12 is the new twin-boss stage final (was wave 10).
        // 2 sub-waves: escort, then TITAN ×2 bossTier=2.
        const enemyCountVec = [0, 0, 0];

        const pure = drivePure(12, enemyCountVec);
        const legacy = makeLegacyStub(12, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        const titan = pure.spawns.find(e => e.enemyType === 'TITAN');
        expect(titan).toEqual({ enemyType: 'TITAN', count: 2, bossTier: 2 });
    });

    test('wave 7 (stage 3-1) — multi-type sub-waves preserve group ordering', () => {
        // 6.1.0 — Wave 7 (stage 3-1) introduces STALKER. Sub-waves:
        //   0: [STALKER 2]
        //   1: [STALKER 2, HUNTER 3]
        //   2: [STALKER 2, GUARDIAN 2, WASP 2]
        // Verify per-group ordering matches between pure and legacy.
        const enemyCountVec = [0, 0, 0, 0];

        const pure = drivePure(7, enemyCountVec);
        const legacy = makeLegacyStub(7, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        // Sub-wave 1's first spawn is STALKER (count: 2) — same enemy
        // as sub-wave 0 (since stage 3 introduces STALKER) but the
        // grouping test is about ordering, not type variety.
        const subWave0Groups = getWaveConfig(7).subWaves[0].length;
        expect(pure.spawns[subWave0Groups]).toEqual({
            enemyType: 'STALKER',
            count: 2,
        });
    });
});
