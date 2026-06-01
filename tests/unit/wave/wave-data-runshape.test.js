/**
 * tests/unit/wave/wave-data-runshape.test.js
 *
 * Pins the non-default-run-shape invariants for getWaveConfig + the stage-final
 * boss marker, updated for the fixed 50-wave campaign (10 boss blocks × 5
 * waves). The campaign shape itself (block roles, boss tiers, finale) is pinned
 * by campaign-50.test.js; this file pins the EDGE behaviour:
 *
 *   1. getWaveConfig past MAX_WAVES (50) does NOT fall back to wave-1's trivial
 *      opener. It CYCLES the authored 50-wave pattern (mod 50), so an
 *      endless/debug caller keeps varied, escalating content. On desktop both
 *      in-range and cycled waves return the authored entry BY REFERENCE (no
 *      defensive copy); only the mobile path clones to thin escort counts.
 *
 *   2. isBossWave(wave, wps) is the run-aware stage-final marker. For a
 *      non-default wps (6), the stage-finals move to 6, 12, 18, … — and those
 *      waves are boss-eligible while the default wps=5 positions are NOT (wave 5
 *      is mid-stage when wps=6). Combined with the wave-manager spawn-path, this
 *      is what actually drives the boss spawn.
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
import { MAX_WAVES, WAVES_PER_STAGE } from '../../../js/modules/core/constants.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

// Force DESKTOP for every test so getWaveConfig returns the raw authored
// config (no mobile thinning) and the assertions compare WAVE_DATA shapes
// directly.
beforeEach(() => { _resetUrlOverrideForTests(false); });
afterEach(() => { _resetUrlOverrideForTests(null); });

describe('getWaveConfig — within the authored campaign (≤ MAX_WAVES)', () => {
    test('waves 1..MAX_WAVES return a deep-equal copy of their authored entry', () => {
        for (let w = 1; w <= MAX_WAVES; w++) {
            expect(getWaveConfig(w)).toEqual(WAVE_DATA[w]);
        }
    });

    test('on desktop getWaveConfig returns the authored entry by reference (in-range AND cycled)', () => {
        // 9.11.0 — on desktop, getWaveConfig does NOT defensively copy: an
        // in-range wave returns the shared authored entry, and a past-MAX wave
        // returns the cycled authored entry — both by REFERENCE. (Only the mobile
        // path clones, to thin escort counts.) Callers treat these as read-only.
        expect(getWaveConfig(1)).toBe(WAVE_DATA[1]);
        // wave 51 cycles to authored wave 1 ((51-1)%50+1) and is the SAME object.
        expect(getWaveConfig(51, 5000)).toBe(WAVE_DATA[1]);
        // wave 55 cycles to authored wave 5 (a boss wave) — also by reference.
        expect(getWaveConfig(55, 5000)).toBe(WAVE_DATA[5]);
    });

    test('wave 50 is the authored finale; past it the run cycles', () => {
        expect(getWaveConfig(50, 50)).toEqual(WAVE_DATA[50]);
        expect(WAVE_DATA[50]).toBeDefined();
        // Past MAX the run CYCLES (it does NOT clamp to the finale):
        // wave 55 → authored wave 5 ((55-1)%50+1).
        expect(getWaveConfig(55, 50)).toEqual(WAVE_DATA[5]);
    });
});

describe('getWaveConfig — past MAX_WAVES synthesizes by CYCLING (not wave-1 fallback)', () => {
    // A long run needs a maxWaves big enough that the wave isn't clamped.
    const LONG = 5000;

    // Past-MAX waves cycle the authored 1..50 pattern. On desktop the cycled
    // config is the authored entry BY REFERENCE; these assertions compare by
    // VALUE (.toEqual) since that holds for both the desktop (ref) and mobile
    // (thinned copy) paths.
    test('wave 51 cycles to WAVE_DATA[1] (cycle wraps at 50)', () => {
        expect(getWaveConfig(51, LONG)).toEqual(WAVE_DATA[1]);
    });

    test('getWaveConfig(55) ≈ WAVE_DATA[5] shape — an authored stage-final wave', () => {
        const cfg = getWaveConfig(55, LONG);
        expect(cfg).toEqual(WAVE_DATA[5]);
        // And it is decidedly NOT the trivial wave-1 opener.
        expect(cfg).not.toEqual(WAVE_DATA[1]);
        // wave 5 is a stage-final wave (isBossWave predicate); wave 1 is not.
        expect(isBossWave(5, 5)).toBe(true);
        expect(isBossWave(1, 5)).toBe(false);
    });

    test('the cycle maps wave (50k + r) → WAVE_DATA[r] across several laps', () => {
        for (const [w, key] of [
            [52, 2], [55, 5], [100, 50], [101, 1], [150, 50], [151, 1], [203, 3],
        ]) {
            expect(getWaveConfig(w, LONG)).toEqual(WAVE_DATA[key]);
        }
    });

    test('past-50 waves are NOT uniformly the trivial wave-1 config', () => {
        // Sample a spread of past-campaign waves; at least one must differ from
        // wave-1 (a clamp/fallback bug would make ALL of them === wave-1).
        const sampled = [55, 63, 78, 90, 122, 140].map((w) => getWaveConfig(w, LONG));
        const anyNonTrivial = sampled.some(
            (cfg) => JSON.stringify(cfg) !== JSON.stringify(WAVE_DATA[1]));
        expect(anyNonTrivial).toBe(true);
    });
});

describe('isBossWave — stage-finals for a non-default wps are boss-eligible', () => {
    test('default wps=5: stage-finals are 5,10,…,50 (unchanged)', () => {
        for (let w = 1; w <= MAX_WAVES; w++) {
            expect(isBossWave(w)).toBe(w % WAVES_PER_STAGE === 0);
        }
    });

    test('wps=6: stage-finals move to 6,12,18,… and the wps=5 positions are NOT bosses', () => {
        expect(isBossWave(6, 6)).toBe(true);
        expect(isBossWave(12, 6)).toBe(true);
        expect(isBossWave(18, 6)).toBe(true);
        // The default-wps positions (5, 10) are mid-stage for wps=6.
        expect(isBossWave(5, 6)).toBe(false);
        expect(isBossWave(10, 6)).toBe(false);
    });

    test('wps=6 past wave 50: cycled content still presents stage-finals as boss waves', () => {
        // Combined with the wave-manager spawn-path, the boss spawn is driven by
        // this marker — so a long wps=6 run keeps getting bosses past wave 50.
        expect(isBossWave(54, 6)).toBe(true);
        expect(isBossWave(60, 6)).toBe(true);
        expect(isBossWave(120, 6)).toBe(true);
        expect(isBossWave(55, 6)).toBe(false);
    });
});
