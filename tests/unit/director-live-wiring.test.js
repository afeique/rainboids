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

    test('M2: a no-clock wave fed at the neutral default does NOT push D_hp up', () => {
        const dir = createDirector();
        const TARGET = 35000;
        // Feed the exact outcome the M2 guard produces (full HP, neutral clear
        // speed, no hits) for several waves past cold-start. A neutral signal
        // must leave D_hp parked at 1.0 — proving the guard can't spike.
        const neutral = () => buildDirectorOutcome({
            actualClearTime: TARGET,
            hpRetainedFrac: 1.0,
            hitsSurvived: 4, // == expectedHits default → neutral Pd too
            deaths: 0,
        });
        for (let i = 0; i < 7; i++) tickWave(dir, neutral());
        expect(dir.wave).toBe(7);
        expect(getDifficulty(dir).D_hp).toBeCloseTo(1.0, 6);
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
