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
import { MAX_WAVES, BOSS_WAVES } from '../../../js/modules/core/constants.js';

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
