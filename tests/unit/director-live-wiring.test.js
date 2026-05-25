/**
 * tests/unit/director-live-wiring.test.js — RUN-05a (wire the Adaptive
 * Difficulty Director LIVE).
 *
 * Covers the NEW integration surface, NOT the director internals (those are in
 * difficulty-director.test.js):
 *   1. buildDirectorOutcome — the PURE per-wave outcome builder extracted into
 *      wave-manager.js. Proves the DPS proxy + clamps + clearedFullHp derivation.
 *   2. The "absent director ⇒ ×1.0" safety guard at both chokepoints (modeled
 *      here as the same resolve-with-default logic the live code uses): a missing
 *      / malformed director resolves to a 1.0 multiplier.
 *   3. Sanity end-to-end: feeding a fast-clear / high-HP outcome over several
 *      waves through the REAL director raises D_hp (the live feed will do this).
 */

import { describe, expect, test } from '@jest/globals';
import { buildDirectorOutcome } from '../../js/modules/wave/wave-manager.js';
import {
    createDirector,
    tickWave,
    getDifficulty,
} from '../../js/modules/wave/difficulty-director.js';

// Mirror of the live "resolve a multiplier, default 1.0 without a director"
// guard used at BOTH chokepoints (directorHpMult in wave-manager.js and
// directorThreatMult in lifecycle.js). Kept here as the unit-of-truth for the
// safety contract: absent / malformed director ⇒ exactly 1.0.
function resolveMult(dir, axis) {
    if (!dir || !dir.cfg) return 1;
    const d = getDifficulty(dir)[axis];
    return Number.isFinite(d) && d > 0 ? d : 1;
}

describe('RUN-05a — absent-director safety guard (×1.0 everywhere)', () => {
    test('no director ⇒ D_hp / D_thr multipliers default to 1.0', () => {
        expect(resolveMult(undefined, 'D_hp')).toBe(1);
        expect(resolveMult(null, 'D_thr')).toBe(1);
        expect(resolveMult({}, 'D_hp')).toBe(1);          // missing .cfg
        expect(resolveMult({ cfg: {} }, 'D_hp')).toBe(1); // no D_hp → not finite → 1
    });

    test('a fresh director (cold-start) resolves to exactly 1.0 on both axes', () => {
        const dir = createDirector();
        expect(resolveMult(dir, 'D_hp')).toBe(1);
        expect(resolveMult(dir, 'D_thr')).toBe(1);
    });
});

describe('RUN-05a — buildDirectorOutcome (pure outcome builder)', () => {
    test('DPS proxy: dpsOnTarget/expectedDps == targetClearTime/actualClearTime', () => {
        const o = buildDirectorOutcome({
            actualClearTime: 10000, // 10s clear
            hpRetainedFrac: 0.6,
            hitsSurvived: 4,
        });
        // proxy: 1/actual vs 1/target → ratio == target/actual
        expect(o.dpsOnTarget).toBeCloseTo(1 / 10000, 10);
        expect(o.expectedDps).toBeCloseTo(1 / 35000, 10);
        expect(o.dpsOnTarget / o.expectedDps).toBeCloseTo(35000 / 10000, 6);
        // default baselines surfaced
        expect(o.targetClearTime).toBe(35000);
        expect(o.expectedHpRetainedFrac).toBe(0.6);
        expect(o.expectedHits).toBe(4);
    });

    test('clamps hpRetainedFrac to [0,1] and floors clear time at 1ms', () => {
        const hi = buildDirectorOutcome({ actualClearTime: 0, hpRetainedFrac: 5 });
        expect(hi.hpRetainedFrac).toBe(1);
        expect(hi.actualClearTime).toBe(1); // floored so 1/actual is finite
        const lo = buildDirectorOutcome({ actualClearTime: 5000, hpRetainedFrac: -3 });
        expect(lo.hpRetainedFrac).toBe(0);
    });

    test('clearedFullHp derives from hpRetainedFrac ≥ 0.99', () => {
        expect(buildDirectorOutcome({ actualClearTime: 5000, hpRetainedFrac: 1 }).clearedFullHp).toBe(true);
        expect(buildDirectorOutcome({ actualClearTime: 5000, hpRetainedFrac: 0.995 }).clearedFullHp).toBe(true);
        expect(buildDirectorOutcome({ actualClearTime: 5000, hpRetainedFrac: 0.6 }).clearedFullHp).toBe(false);
    });

    test('missing / non-finite signals fall back to safe neutrals', () => {
        const o = buildDirectorOutcome({});
        expect(o.actualClearTime).toBe(1);    // floored
        expect(o.hpRetainedFrac).toBe(1);     // default full
        expect(o.hitsSurvived).toBe(0);
        expect(o.deaths).toBe(0);
    });
});

describe('RUN-05a — sanity: live feed of fast-clear/high-HP outcomes raises D_hp', () => {
    test('several fast, full-HP wave clears push D_hp above 1.0 (post cold-start)', () => {
        const dir = createDirector();
        // Build the outcome exactly as the live wave-clear feed does: a fast
        // clear (10s vs 35s target) at full HP with no hits taken — an
        // over-performing offense profile the director should answer with more
        // HP to chew through.
        const fastFullHp = () => buildDirectorOutcome({
            actualClearTime: 10000,
            hpRetainedFrac: 1.0,
            hitsSurvived: 0,
            deaths: 0,
        });
        // Cold-start holds D=1 for waves 1–2; adaptation begins at wave 3.
        tickWave(dir, fastFullHp());
        tickWave(dir, fastFullHp());
        expect(getDifficulty(dir).D_hp).toBe(1);
        // A few more waves and D_hp must climb.
        for (let i = 0; i < 5; i++) tickWave(dir, fastFullHp());
        expect(dir.wave).toBe(7);
        expect(getDifficulty(dir).D_hp).toBeGreaterThan(1);
        // …but still inside the hard clamp.
        expect(getDifficulty(dir).D_hp).toBeLessThanOrEqual(3.0);
    });
});
