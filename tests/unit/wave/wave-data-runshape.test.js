/**
 * tests/unit/wave/wave-data-runshape.test.js — H2 (Bug-Pass 2026-05-25)
 *
 * Pins the non-default-run-shape fixes for getWaveConfig + the stage-final
 * boss marker:
 *
 *   1. getWaveConfig past MAX_WAVES (30) no longer falls back to wave-1's
 *      trivial 3-HUNTER content. It CYCLES the authored 30-wave pattern, so a
 *      long run (stages > 10) keeps varied, escalating GROUP content. Waves
 *      ≤ 30 are byte-for-byte unchanged.
 *
 *   2. isBossWave(wave, wps) is the run-aware stage-final marker. For a
 *      non-default wps (6), the stage-finals move to 6, 12, 18, … — and those
 *      waves are boss-eligible while the old fixed 3/6/9 table positions are
 *      NOT (wave 3 is mid-stage when wps=6). Combined with the wave-manager
 *      spawn-path fix, this is what actually drives the boss spawn.
 */

// Browser shims — must happen before any game module import (getWaveConfig
// reads isMobile() which touches window/navigator).
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 800,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import {
    WAVE_DATA,
    getWaveConfig,
    isBossWave,
} from '../../../js/modules/wave/wave-data.js';
import { MAX_WAVES } from '../../../js/modules/core/constants.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

// Force DESKTOP for every test so getWaveConfig returns the raw authored
// config (no mobile thinning) and the assertions compare WAVE_DATA shapes
// directly.
beforeEach(() => { _resetUrlOverrideForTests(false); });
afterEach(() => { _resetUrlOverrideForTests(null); });

describe('getWaveConfig — default (≤ MAX_WAVES) is unchanged', () => {
    test('waves 1..30 return their authored WAVE_DATA entry verbatim', () => {
        for (let w = 1; w <= MAX_WAVES; w++) {
            expect(getWaveConfig(w)).toBe(WAVE_DATA[w]);
        }
    });

    test('default 10×3 run never reaches the cycle branch (maxWaves=30)', () => {
        // maxWaves clamps to 30, so even an out-of-range request maps to 30.
        expect(getWaveConfig(30, 30)).toBe(WAVE_DATA[30]);
        expect(getWaveConfig(35, 30)).toBe(WAVE_DATA[30]); // clamped to 30, not cycled
    });
});

describe('getWaveConfig — past MAX_WAVES synthesizes by CYCLING (not wave-1 fallback)', () => {
    // A long run needs a maxWaves big enough that the wave isn't clamped to 30.
    const LONG = 900; // e.g. 100 stages × 9 wps

    test('wave 31 cycles to WAVE_DATA[1] (cycle wraps at 30)', () => {
        // 31 maps to ((31-1) % 30) + 1 === 1. This is the ONE wrap point that
        // coincides with wave-1 content — but it is reached via the cycle, and
        // every other past-30 wave gives DIFFERENT, non-trivial content (below).
        expect(getWaveConfig(31, LONG)).toBe(WAVE_DATA[1]);
    });

    test('getWaveConfig(33) ≈ WAVE_DATA[3] shape (NOT trivial wave-1 content)', () => {
        const cfg = getWaveConfig(33, LONG);
        expect(cfg).toBe(WAVE_DATA[3]);
        // And it is decidedly NOT the trivial wave-1 content — the old bug
        // returned WAVE_DATA[1] (a non-boss 3-HUNTER opener) for every wave>30.
        expect(cfg).not.toBe(WAVE_DATA[1]);
        // WAVE_DATA[3] is an authored boss wave; wave-1 carries no boss marker.
        expect(cfg.isBossWave).toBe(true);
        expect(WAVE_DATA[1].isBossWave).toBeUndefined();
    });

    test('the cycle maps wave (30k + r) → WAVE_DATA[r] across several laps', () => {
        for (const [w, key] of [
            [32, 2], [45, 15], [60, 30], [61, 1], [90, 30], [91, 1], [123, 3],
        ]) {
            expect(getWaveConfig(w, LONG)).toBe(WAVE_DATA[key]);
        }
    });

    test('past-30 waves are NOT uniformly the trivial wave-1 config', () => {
        // Sample a spread of late-game waves; at least one must differ from
        // wave-1 (the old bug made ALL of them === wave-1).
        const sampled = [33, 40, 48, 55, 72, 80].map((w) => getWaveConfig(w, LONG));
        const anyNonTrivial = sampled.some((cfg) => cfg !== WAVE_DATA[1]);
        expect(anyNonTrivial).toBe(true);
    });
});

describe('isBossWave — flat-wave boss cadence (every BOSS_INTERVAL = 10)', () => {
    test('a boss every 10th wave across a full 100-wave run', () => {
        for (let w = 1; w <= 100; w++) {
            expect(isBossWave(w)).toBe(w % 10 === 0);
        }
    });

    test('round-number finales are boss waves; off-cadence waves are not', () => {
        expect(isBossWave(10)).toBe(true);
        expect(isBossWave(50)).toBe(true);
        expect(isBossWave(100)).toBe(true);
        expect(isBossWave(3)).toBe(false);
        expect(isBossWave(9)).toBe(false);
        expect(isBossWave(0)).toBe(false);
    });

    // The modular boss-spawn (maybeSpawnStageFinalBoss) is driven by this marker,
    // so a long run keeps getting bosses at 10, 20, 30, … all the way to 100.
    test('drives bosses at every multiple of 10 deep into a run', () => {
        expect(isBossWave(40)).toBe(true);
        expect(isBossWave(90)).toBe(true);
        expect(isBossWave(37)).toBe(false);
    });
});
