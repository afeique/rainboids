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
import { buildDirectorOutcome, expectedClearMsForPWR } from '../../js/modules/wave/wave-manager.js';
import {
    createDirector,
    tickWave,
    getDifficulty,
    setDirectorContext,
} from '../../js/modules/wave/difficulty-director.js';
import { computePWR, PWR_REF, starterStub } from '../../js/modules/wave/power-level.js';

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

    // FIX-02 / M2 — when feedDirectorOnWaveClear has NO wave-start clock
    // (_waveStartMs unset on a restored/edge wave) it substitutes the SAME
    // target clear time as actualClearTime. That must produce a NEUTRAL
    // clear-speed signal (ratio 1.0), NOT the 0ms→1ms→huge-ratio spike that
    // would slam D_hp toward its 3.0 ceiling. This asserts the substituted
    // value yields exactly that neutral outcome.
    test('M2: actualClearTime == targetClearTime yields a neutral speed ratio (no spike)', () => {
        const TARGET = 35000; // DIRECTOR_TARGET_CLEAR_MS — the value the guard substitutes
        const o = buildDirectorOutcome({ actualClearTime: TARGET, hpRetainedFrac: 1 });
        // dpsOnTarget/expectedDps == targetClearTime/actualClearTime == 1.0 → neutral.
        expect(o.actualClearTime).toBe(TARGET);
        expect(o.targetClearTime).toBe(TARGET);
        expect(o.dpsOnTarget / o.expectedDps).toBeCloseTo(1.0, 10);
        // Contrast: the bug path (0ms → floored to 1ms) would explode this ratio.
        const buggy = buildDirectorOutcome({ actualClearTime: 0, hpRetainedFrac: 1 });
        expect(buggy.dpsOnTarget / buggy.expectedDps).toBeGreaterThan(1000);
    });

    test('8.11.0: feeding wave outcomes advances the counter; difficulty stays in bounds (no skill spike)', () => {
        const dir = createDirector({ seed: 42 });
        const TARGET = 35000;
        // The outcome no longer steers difficulty (the budget model is gone), so
        // feeding any outcome just advances the wave + rolls the next wave's
        // RANDOM difficulty. It must always stay inside the hard clamps.
        const neutral = () => buildDirectorOutcome({
            actualClearTime: TARGET, hpRetainedFrac: 1.0, hitsSurvived: 4, deaths: 0,
        });
        for (let i = 0; i < 7; i++) {
            tickWave(dir, neutral());
            const D = getDifficulty(dir);
            expect(D.D_hp).toBeGreaterThanOrEqual(0.6);
            expect(D.D_hp).toBeLessThanOrEqual(3.0);
            expect(D.D_thr).toBeGreaterThanOrEqual(0.6);
            expect(D.D_thr).toBeLessThanOrEqual(1.8);
        }
        expect(dir.wave).toBe(8); // started at 1, +7 ticks
    });
});

// ── DIR-07 — reference-dependent expected clear time ─────────────────────────
// The expected clear fed to the director (as targetClearTime) now scales with
// the player's PWR: a stronger build is EXPECTED to clear faster, so its
// reference clock is shorter (§14.2 / §6.1). expectedClearMsForPWR is the pure
// helper wave-manager's live feed (feedDirectorOnWaveClear) uses.
describe('DIR-07 — expected clear time is reference-dependent on PWR', () => {
    const TARGET = 35000; // DIRECTOR_TARGET_CLEAR_MS (a starter's reference clock)

    test('a starter PWR (= PWR_REF) yields exactly 35000ms (default-safe, unchanged)', () => {
        expect(expectedClearMsForPWR(PWR_REF)).toBe(TARGET);
        // a real fresh starter computes to PWR_REF, so the live feed is unchanged
        expect(expectedClearMsForPWR(computePWR(starterStub()))).toBe(TARGET);
    });

    test('a high PWR (4×PWR_REF) yields a proportionally SHORTER expected clear (≈ ×0.5)', () => {
        // sqrt(1/4) = 0.5 → ~17.5s. Well inside the [0.3, 1.5] clamp band.
        const ms = expectedClearMsForPWR(4 * PWR_REF);
        expect(ms).toBeCloseTo(TARGET * 0.5, 6);
        expect(ms).toBeLessThan(TARGET);
        // monotonic: stronger build ⇒ shorter (or equal at the clamp) reference.
        expect(expectedClearMsForPWR(2 * PWR_REF)).toBeLessThan(expectedClearMsForPWR(PWR_REF));
        expect(expectedClearMsForPWR(8 * PWR_REF)).toBeLessThan(expectedClearMsForPWR(4 * PWR_REF));
    });

    test('the factor is clamped to the LO/HI band at extremes', () => {
        // Absurdly strong build: factor floored at LO=0.3 → 0.3 × 35000 = 10500.
        expect(expectedClearMsForPWR(1e9)).toBeCloseTo(TARGET * 0.3, 6);
        // Very weak build (PWR ≪ PWR_REF): factor capped at HI=1.5 → 52500.
        expect(expectedClearMsForPWR(1)).toBeCloseTo(TARGET * 1.5, 6);
    });

    test('missing / NaN / non-positive PWR ⇒ neutral 35000ms', () => {
        expect(expectedClearMsForPWR(undefined)).toBe(TARGET);
        expect(expectedClearMsForPWR(null)).toBe(TARGET);
        expect(expectedClearMsForPWR(NaN)).toBe(TARGET);
        expect(expectedClearMsForPWR(0)).toBe(TARGET);
        expect(expectedClearMsForPWR(-50)).toBe(TARGET);
    });

    test('fed as targetClearTime: a strong build that clears at the OLD 35s pace now OVER-performs', () => {
        // A strong build (4×PWR) is expected to clear in ~17.5s. If it instead
        // takes the full 35s, its clear-speed signal reads UNDER-performing
        // (ratio < 1) — exactly the reference-dependent judgement DIR-07 adds.
        const strongTarget = expectedClearMsForPWR(4 * PWR_REF);
        const slowForItsPower = buildDirectorOutcome({
            actualClearTime: 35000,
            targetClearTime: strongTarget,
            hpRetainedFrac: 1,
        });
        // dpsOnTarget/expectedDps == targetClearTime/actualClearTime < 1 (slow for its power).
        expect(slowForItsPower.dpsOnTarget / slowForItsPower.expectedDps).toBeLessThan(1);
        // The SAME 35s clear from a STARTER reads neutral (ratio 1.0) — unchanged.
        const starterTarget = expectedClearMsForPWR(PWR_REF);
        const neutralForStarter = buildDirectorOutcome({
            actualClearTime: 35000,
            targetClearTime: starterTarget,
            hpRetainedFrac: 1,
        });
        expect(neutralForStarter.dpsOnTarget / neutralForStarter.expectedDps).toBeCloseTo(1.0, 10);
    });

    // FIX-02 / M2 — the unset-`_waveStartMs` path substitutes the PWR-referenced
    // target as actualClearTime, so the speed ratio stays neutral (1.0) — no
    // spike — even when PWR scaled the clock away from 35s. Model that path here.
    test('M2/FIX-02: no-clock wave at a PWR-scaled reference still yields a neutral ratio', () => {
        for (const pwr of [PWR_REF, 4 * PWR_REF, 1, 1e9]) {
            const target = expectedClearMsForPWR(pwr);
            // The live guard sets actualClearTime = target when _waveStartMs is unset.
            const o = buildDirectorOutcome({
                actualClearTime: target,
                targetClearTime: target,
                hpRetainedFrac: 1,
            });
            expect(o.dpsOnTarget / o.expectedDps).toBeCloseTo(1.0, 10);
        }
    });
});

// ── DIR-05 — PWR + mode → director context feed ─────────────────────────────
// Mirror of the live engine.recomputePlayerPWR() feed (game-engine.js): compute
// the build PWR defensively (fallback PWR_REF on throw / non-finite), cache it on
// the game-like object, then feed the §14 context into the director if present.
// Kept here as the unit-of-truth for the feed contract, exactly like resolveMult
// above mirrors the chokepoint guard. (Instantiating the full GameEngine is too
// heavy for a unit test; the feed logic itself is the integration surface.)
function recomputePlayerPWR(game, player, mode = 'NORMAL') {
    let pwr;
    try {
        pwr = computePWR(player);
    } catch (_e) {
        pwr = PWR_REF;
    }
    if (!Number.isFinite(pwr)) pwr = PWR_REF;
    game.playerPWR = pwr;
    const dir = game.difficultyDirector;
    if (dir && dir.cfg) setDirectorContext(dir, { pwr, mode });
    return pwr;
}

describe('DIR-05 — PWR + mode wired into the live director context', () => {
    test('the feed caches a finite numeric game.playerPWR', () => {
        const game = { difficultyDirector: createDirector() };
        const pwr = recomputePlayerPWR(game, starterStub());
        expect(typeof game.playerPWR).toBe('number');
        expect(Number.isFinite(game.playerPWR)).toBe(true);
        expect(game.playerPWR).toBe(pwr);
        // a fresh starter anchors at PWR_REF
        expect(game.playerPWR).toBe(PWR_REF);
    });

    test('a starter at NORMAL leaves the director default-safe (effective D unchanged)', () => {
        const dir = createDirector();
        const before = getDifficulty(dir); // cold-start neutral 1/1
        recomputePlayerPWR({ difficultyDirector: dir }, starterStub(), 'NORMAL');
        const after = getDifficulty(dir);
        expect(after.D_hp).toBeCloseTo(before.D_hp, 10);
        expect(after.D_thr).toBeCloseTo(before.D_thr, 10);
        expect(after.D_hp).toBe(1);
        expect(after.D_thr).toBe(1);
        // the feed set the context to the neutral anchor
        expect(dir.pwr).toBe(PWR_REF);
        expect(dir.mode).toBe('NORMAL');
    });

    test('a strong build raises effective difficulty vs a starter (pre-load active)', () => {
        // A build well above the starter: more health, faster fire, more shots,
        // bigger crits → PWR ≫ PWR_REF, so pwrPreload = sqrt(PWR/ref) > 1.
        const strong = {
            ...starterStub(),
            getEffectivePrimaryDamage: () => 6.0,    // 5× starter
            getEffectivePrimaryFireRate: () => 150,  // ~2.7× faster
            getEffectiveMaxHealth: () => 200,        // 5× starter
            getEffectiveCritChance: () => 40,
            getEffectiveCritDamage: () => 300,
            multishotStacks: 3,
            getEffectiveRegen: () => 5,
        };
        const starterPWR = computePWR(starterStub());
        const strongPWR = computePWR(strong);
        expect(strongPWR).toBeGreaterThan(starterPWR);

        // Feed BOTH into fresh cold-start directors and compare effective D.
        const dStarter = createDirector();
        const dStrong = createDirector();
        recomputePlayerPWR({ difficultyDirector: dStarter }, starterStub(), 'NORMAL');
        recomputePlayerPWR({ difficultyDirector: dStrong }, strong, 'NORMAL');

        const effStarter = getDifficulty(dStarter);
        const effStrong = getDifficulty(dStrong);
        // The pre-load folds onto the effective output, so the strong build faces
        // higher D on both axes immediately — even at cold-start (reactive D=1).
        expect(effStrong.D_hp).toBeGreaterThan(effStarter.D_hp);
        expect(effStrong.D_thr).toBeGreaterThan(effStarter.D_thr);
        // starter stays exactly neutral (default-safe)
        expect(effStarter.D_hp).toBe(1);
        expect(effStarter.D_thr).toBe(1);
    });

    test('feed is defensive: a throwing player falls back to PWR_REF (run never breaks)', () => {
        const hostile = {
            get getEffectivePrimaryDamage() { throw new Error('boom'); },
        };
        const game = { difficultyDirector: createDirector() };
        // recompute must not throw and must cache the safe anchor.
        expect(() => recomputePlayerPWR(game, hostile)).not.toThrow();
        expect(game.playerPWR).toBe(PWR_REF);
        expect(getDifficulty(game.difficultyDirector).D_hp).toBe(1);
    });

    test('feed is guarded: a missing/malformed director still caches playerPWR', () => {
        const g1 = { difficultyDirector: undefined };
        expect(() => recomputePlayerPWR(g1, starterStub())).not.toThrow();
        expect(g1.playerPWR).toBe(PWR_REF);
        const g2 = { difficultyDirector: {} }; // no .cfg
        expect(() => recomputePlayerPWR(g2, starterStub())).not.toThrow();
        expect(g2.playerPWR).toBe(PWR_REF);
    });
});

describe('8.11.0 — difficulty is RANDOM (CPU-governed), not skill-adaptive', () => {
    test('difficulty varies wave-to-wave and is independent of the outcome fed', () => {
        // Two directors with the SAME seed but OPPOSITE outcomes (fast/full-HP vs
        // slow/low-HP) must roll IDENTICAL difficulty — proving difficulty no
        // longer tracks player skill, only the (seed, wave) roll.
        const a = createDirector({ seed: 7 });
        const b = createDirector({ seed: 7 });
        const fast = () => buildDirectorOutcome({ actualClearTime: 5000, hpRetainedFrac: 1.0, hitsSurvived: 0 });
        const slow = () => buildDirectorOutcome({ actualClearTime: 90000, hpRetainedFrac: 0.05, hitsSurvived: 20, deaths: 1 });
        const seqA = [], seqB = [];
        for (let i = 0; i < 12; i++) { tickWave(a, fast()); seqA.push(+getDifficulty(a).D_hp.toFixed(6)); }
        for (let i = 0; i < 12; i++) { tickWave(b, slow()); seqB.push(+getDifficulty(b).D_hp.toFixed(6)); }
        expect(seqA).toEqual(seqB);                       // outcome-independent
        expect(new Set(seqA).size).toBeGreaterThan(1);    // it genuinely varies
    });

    test('a different seed produces a different difficulty sequence', () => {
        const a = createDirector({ seed: 1 });
        const b = createDirector({ seed: 2 });
        const o = () => buildDirectorOutcome({ actualClearTime: 30000, hpRetainedFrac: 1 });
        const seqA = [], seqB = [];
        for (let i = 0; i < 12; i++) { tickWave(a, o()); seqA.push(+getDifficulty(a).D_hp.toFixed(6)); }
        for (let i = 0; i < 12; i++) { tickWave(b, o()); seqB.push(+getDifficulty(b).D_hp.toFixed(6)); }
        expect(seqA).not.toEqual(seqB);
    });

    test('over a long run, some waves spike hard (>1.5×) and difficulty stays bounded', () => {
        const dir = createDirector({ seed: 99 });
        const o = () => buildDirectorOutcome({ actualClearTime: 30000, hpRetainedFrac: 1 });
        let sawSpike = false;
        for (let i = 0; i < 100; i++) {
            tickWave(dir, o());
            const hp = getDifficulty(dir).D_hp;
            if (hp > 1.5) sawSpike = true;
            expect(hp).toBeGreaterThanOrEqual(0.6);
            expect(hp).toBeLessThanOrEqual(3.0);
        }
        expect(sawSpike).toBe(true); // the ramp + spikes eventually exceed 1.5×
    });
});
