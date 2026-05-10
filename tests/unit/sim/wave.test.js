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
        expect(events).toHaveLength(2);
        const types = events.map(e => e.enemyType).sort();
        expect(types).toEqual(['HUNTER', 'WASP']);
    });

    test('boss waves carry isBoss + bossTier through the event', () => {
        // Wave 5 is the first boss wave; sub-wave 2 contains the TITAN boss.
        const wave = freshWaveState(5, { phase: 'spawning', subWaveIndex: 2 });
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
        // Wave 1 has 2 sub-waves. Set subWaveIndex=2 so we're past the last.
        const wave = freshWaveState(1, {
            phase: 'spawning',
            subWaveIndex: 2,
        });
        const events = [];
        updateWave(wave, ctx({ enemyCount: 4 }), events);
        expect(wave.phase).toBe('clearing');
        // No enemy_spawn — we're done spawning.
        expect(events.filter(e => e.type === 'enemy_spawn')).toHaveLength(0);
    });

    test('all sub-waves spawned + zero enemies → jumps straight to complete', () => {
        const wave = freshWaveState(1, {
            phase: 'spawning',
            subWaveIndex: 2,
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
    });
});

// ---------------------------------------------------------------------------
// updateWave() — full-wave drive (smoke test).
// ---------------------------------------------------------------------------

describe('updateWave() — full-wave drive smoke test', () => {
    test('wave 1 fully drains all sub-waves and transitions to complete', () => {
        const wave = freshWaveState(1, { phase: 'spawning' });
        let events = [];

        // First tick: zero enemies → spawn sub-wave 0.
        updateWave(wave, ctx({ enemyCount: 0 }), events);
        const firstSpawnEvents = events.filter(e => e.type === 'enemy_spawn');
        expect(firstSpawnEvents.length).toBeGreaterThan(0);
        expect(wave.subWaveIndex).toBe(1);

        // Second tick: zero enemies → spawn sub-wave 1.
        events = [];
        updateWave(wave, ctx({ enemyCount: 0 }), events);
        expect(wave.subWaveIndex).toBe(2);
        expect(events.filter(e => e.type === 'enemy_spawn').length).toBeGreaterThan(0);

        // Third tick: zero enemies, all sub-waves out → complete.
        events = [];
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
        // Tick 0: 0 enemies → both spawn sub-wave 0 (HUNTER ×3).
        // Tick 1: 5 enemies → both skip (>2 and elapsed<12s).
        // Tick 2: 2 enemies → both spawn sub-wave 1 (HUNTER ×2 + WASP ×2).
        // Tick 3: 0 enemies → both: all sub-waves spawned, no further spawns.
        const enemyCountVec = [0, 5, 2, 0];

        const pure = drivePure(1, enemyCountVec);
        const legacy = makeLegacyStub(1, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        // Sanity: parity is meaningless if neither path actually spawned.
        expect(pure.spawns.length).toBe(3); // 1 group + 2 groups across 2 spawns
        expect(pure.spawns[0]).toEqual({ enemyType: 'HUNTER', count: 3 });
    });

    test('wave 5 — boss sub-wave preserves bossTier on both paths', () => {
        // 4 ticks of clean sweep: every tick has 0 enemies, so every
        // sub-wave fires immediately. Wave 5 has 3 sub-waves, the last
        // contains the TITAN bossTier=1 escort.
        const enemyCountVec = [0, 0, 0, 0];

        const pure = drivePure(5, enemyCountVec);
        const legacy = makeLegacyStub(5, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);

        // TITAN with bossTier=1 must show up in both — that's the
        // load-bearing field for boss instantiation downstream.
        const pureBoss = pure.spawns.find(e => e.enemyType === 'TITAN');
        const legacyBoss = legacy.recorded.find(e => e.enemyType === 'TITAN');
        expect(pureBoss).toBeDefined();
        expect(legacyBoss).toBeDefined();
        expect(pureBoss.bossTier).toBe(1);
        expect(legacyBoss.bossTier).toBe(1);
    });

    test('wave 3 — 20-tick mixed scenario produces identical spawn sequences', () => {
        // Realistic-ish: enemies tick down between sub-waves, occasionally
        // staying high. Wave 3 has 3 sub-waves with varied groups.
        // The invariant: same enemyCount inputs → same spawn outputs.
        const enemyCountVec = [
            0,                          // t0:  spawn sub-wave 0 (HUNTER ×4)
            6, 6, 5, 4, 3,              // t1-5: enemies decreasing, no spawn
            2,                          // t6:  spawn sub-wave 1 (WASP ×4)
            8, 7, 6, 5, 4, 3,           // t7-12: enemies high after spawn
            2,                          // t13: spawn sub-wave 2 (HUNTER ×3 + WASP ×2)
            5, 4, 3, 2, 1, 0,           // t14-19: clearing, no more spawns
        ];

        const pure = drivePure(3, enemyCountVec);
        const legacy = makeLegacyStub(3, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        // Wave 3: 1 group + 1 group + 2 groups = 4 spawn calls total.
        expect(pure.spawns.length).toBe(4);
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

    test('wave 10 — twin-boss: bossTier=2 carries through both paths', () => {
        // Wave 10 has 3 sub-waves; the last contains TITAN ×2 with
        // bossTier=2. Drives a clean sweep so both paths emit every
        // sub-wave back-to-back.
        const enemyCountVec = [0, 0, 0, 0];

        const pure = drivePure(10, enemyCountVec);
        const legacy = makeLegacyStub(10, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        const titan = pure.spawns.find(e => e.enemyType === 'TITAN');
        expect(titan).toEqual({ enemyType: 'TITAN', count: 2, bossTier: 2 });
    });

    test('wave 7 — multi-type sub-waves preserve group ordering', () => {
        // Wave 7 sub-waves have 1, 2, and 3 groups respectively. Spawn
        // ordering within a sub-wave is significant (downstream code
        // assumes the FIRST group's enemy is the "lead" for the wave),
        // so we lock that the per-group order matches between paths.
        const enemyCountVec = [0, 0, 0, 0];

        const pure = drivePure(7, enemyCountVec);
        const legacy = makeLegacyStub(7, enemyCountVec);
        for (let i = 0; i < enemyCountVec.length; i++) legacy.tick();

        expect(pure.spawns).toEqual(legacy.recorded);
        // Wave 7 sub-wave 1 starts with TANGERINE (per wave-data.js:70).
        // Its first spawn after sub-wave 0 is exactly that.
        const subWave0Groups = getWaveConfig(7).subWaves[0].length;
        expect(pure.spawns[subWave0Groups]).toEqual({
            enemyType: 'TANGERINE',
            count: 3,
        });
    });
});
