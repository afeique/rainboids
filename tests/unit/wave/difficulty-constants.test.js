/**
 * tests/unit/wave/difficulty-constants.test.js — DIR-02: the Adaptive
 * Difficulty Director's §14.5 absolute baseline curve + §14.6 constants table.
 *
 * Pure / deterministic: pins the baseline curve anchors (wave-30 ≈ 15.4,
 * wave-90 ≈ 65), strict monotonicity across waves 1..100, the §14.2 PWR
 * pre-load clamp behavior, per-mode lookups with NORMAL fallback, and that the
 * exported config tables are frozen.
 */

import { describe, expect, test } from '@jest/globals';
import {
    baseline,
    pwrPreload,
    DIFFICULTY_CONSTANTS,
    MODES,
    DEFAULT_MODE,
    PWR_REF,
    PWR_PRELOAD_MIN,
    PWR_PRELOAD_MAX,
    A,
    B,
    modeBand,
    modeBase,
    modeRate,
    modeMult,
    modeResist,
    affixChance,
    modeReward,
    MODE_BAND,
    MODE_BASE,
    MODE_RESIST,
    AFFIX_CHANCE,
    MODE_REWARD,
} from '../../../js/modules/wave/difficulty-constants.js';

// ── §14.5 baseline curve ──────────────────────────────────────────────
describe('baseline(wave) — §14.5 absolute monotonic curve', () => {
    test('anchors: baseline(30) ≈ 15.4', () => {
        expect(baseline(30)).toBeCloseTo(15.4, 1); // |Δ| < 0.05
        expect(baseline(30)).toBeGreaterThan(14.9);
        expect(baseline(30)).toBeLessThan(15.9);
    });

    test('anchors: baseline(90) ≈ 65 (±2)', () => {
        expect(Math.abs(baseline(90) - 65)).toBeLessThan(2);
    });

    test('baseline(1) is small (≈ 1.21)', () => {
        const b1 = baseline(1);
        expect(b1).toBeGreaterThan(1);
        expect(b1).toBeLessThan(1.5);
        expect(b1).toBeCloseTo(1 + A + B, 6);
    });

    test('strictly monotonic increasing across waves 1..100', () => {
        let prev = -Infinity;
        for (let w = 1; w <= 100; w++) {
            const cur = baseline(w);
            expect(cur).toBeGreaterThan(prev);
            prev = cur;
        }
    });

    test('guards wave < 1 → clamps to baseline(1)', () => {
        const b1 = baseline(1);
        expect(baseline(0)).toBe(b1);
        expect(baseline(-5)).toBe(b1);
        expect(baseline(0.3)).toBe(b1);
        expect(baseline(NaN)).toBe(b1);
        expect(baseline(undefined)).toBe(b1);
    });

    test('matches the closed-form 1 + A*w + B*w^1.5', () => {
        for (const w of [1, 5, 30, 90, 100]) {
            expect(baseline(w)).toBeCloseTo(1 + A * w + B * Math.pow(w, 1.5), 9);
        }
    });
});

// ── §14.2 PWR pre-load ────────────────────────────────────────────────
describe('pwrPreload — §14.2 (PWR/REF)^0.5 clamped [0.8, 3.0]', () => {
    test('pwrPreload(100) ≈ 1.0 (starter at reference)', () => {
        expect(pwrPreload(100)).toBeCloseTo(1.0, 6);
        expect(pwrPreload(PWR_REF)).toBeCloseTo(1.0, 6);
    });

    test('pwrPreload(6807) clamps to ceiling 3.0', () => {
        // sqrt(6807/100) ≈ 8.25 → clamps to PWR_PRELOAD_MAX.
        expect(pwrPreload(6807)).toBe(PWR_PRELOAD_MAX);
        expect(pwrPreload(6807)).toBe(3.0);
    });

    test('pwrPreload(50) clamps to floor 0.8', () => {
        // sqrt(50/100) ≈ 0.707 → clamps up to PWR_PRELOAD_MIN.
        expect(pwrPreload(50)).toBe(PWR_PRELOAD_MIN);
        expect(pwrPreload(50)).toBe(0.8);
    });

    test('monotone increasing inside the unclamped band', () => {
        // 64 → sqrt(0.64)=0.8 (floor edge); 900 → sqrt(9)=3.0 (ceiling edge).
        expect(pwrPreload(64)).toBeCloseTo(0.8, 6);
        expect(pwrPreload(900)).toBeCloseTo(3.0, 6);
        expect(pwrPreload(225)).toBeCloseTo(1.5, 6); // sqrt(2.25)=1.5
        expect(pwrPreload(200)).toBeGreaterThan(pwrPreload(150));
    });

    test('custom ref normalizes to 1.0 at ref', () => {
        expect(pwrPreload(250, 250)).toBeCloseTo(1.0, 6);
    });

    test('degenerate PWR (0 / NaN / negative) → floor', () => {
        expect(pwrPreload(0)).toBe(PWR_PRELOAD_MIN);
        expect(pwrPreload(NaN)).toBe(PWR_PRELOAD_MIN);
        expect(pwrPreload(-10)).toBe(PWR_PRELOAD_MIN);
    });
});

// ── §14.6 modes + per-mode lookups ────────────────────────────────────
describe('modes & per-mode lookups (§14.6)', () => {
    test('canonical MODES order + default NORMAL', () => {
        expect(MODES).toEqual(['EASY', 'NORMAL', 'HARD', 'EPIC', 'LEGENDARY']);
        expect(DEFAULT_MODE).toBe('NORMAL');
    });

    test('modeBand returns the right bands', () => {
        expect(modeBand('EASY')).toEqual([0.15, 0.40]);
        expect(modeBand('NORMAL')).toEqual([0.30, 0.55]);
        expect(modeBand('HARD')).toEqual([0.45, 0.70]);
        expect(modeBand('EPIC')).toEqual([0.55, 0.80]);
        expect(modeBand('LEGENDARY')).toEqual([0.65, 0.90]);
    });

    test('modeBase returns the right static multipliers', () => {
        expect(modeBase('EASY')).toBe(0.8);
        expect(modeBase('NORMAL')).toBe(1.0);
        expect(modeBase('HARD')).toBe(1.25);
        expect(modeBase('EPIC')).toBe(1.6);
        expect(modeBase('LEGENDARY')).toBe(2.0);
    });

    test('modeResist / affixChance / modeReward spot-checks', () => {
        expect(modeResist('LEGENDARY')).toBe(0.5);
        expect(modeResist('EASY')).toBe(0);
        expect(affixChance('EASY')).toBe(0);
        expect(affixChance('HARD')).toBe(0.3);
        expect(modeReward('LEGENDARY')).toBe(2.2);
        expect(modeReward('NORMAL')).toBe(1.0);
    });

    test('modeRate: DOWN_RATE > UP_RATE for every mode (anti-death-spiral)', () => {
        for (const m of MODES) {
            const [up, down] = modeRate(m);
            expect(down).toBeGreaterThanOrEqual(up);
        }
        expect(modeRate('NORMAL')).toEqual([0.05, 0.10]);
    });

    test('modeMult: MIN < MAX for every mode', () => {
        for (const m of MODES) {
            const [lo, hi] = modeMult(m);
            expect(hi).toBeGreaterThan(lo);
        }
        expect(modeMult('NORMAL')).toEqual([0.6, 2.5]);
    });

    test('unknown mode falls back to NORMAL on every accessor', () => {
        const unknown = 'NIGHTMARE';
        expect(modeBand(unknown)).toEqual(modeBand('NORMAL'));
        expect(modeBase(unknown)).toBe(modeBase('NORMAL'));
        expect(modeRate(unknown)).toEqual(modeRate('NORMAL'));
        expect(modeMult(unknown)).toEqual(modeMult('NORMAL'));
        expect(modeResist(unknown)).toBe(modeResist('NORMAL'));
        expect(affixChance(unknown)).toBe(affixChance('NORMAL'));
        expect(modeReward(unknown)).toBe(modeReward('NORMAL'));
        expect(modeBase(undefined)).toBe(modeBase('NORMAL'));
    });
});

// ── §14.6 constants table integrity / freeze ──────────────────────────
describe('DIFFICULTY_CONSTANTS table (§14.6)', () => {
    test('contains the documented baseline + pre-load constants', () => {
        expect(DIFFICULTY_CONSTANTS.A).toBe(0.15);
        expect(DIFFICULTY_CONSTANTS.B).toBe(0.06);
        expect(DIFFICULTY_CONSTANTS.PWR_REF).toBe(100);
        expect(DIFFICULTY_CONSTANTS.SUSTAIN_WINDOW).toBe(4);
        expect(DIFFICULTY_CONSTANTS.PWR_PRELOAD_MIN).toBe(0.8);
        expect(DIFFICULTY_CONSTANTS.PWR_PRELOAD_MAX).toBe(3.0);
    });

    test('passive + pressure-signal weights', () => {
        expect(DIFFICULTY_CONSTANTS.KEYSTONE_W).toBe(3);
        expect(DIFFICULTY_CONSTANTS.MODULAR_W).toBe(1);
        const { W_HP, W_DMG, W_CLEAR, W_ND } = DIFFICULTY_CONSTANTS;
        expect([W_HP, W_DMG, W_CLEAR, W_ND]).toEqual([0.40, 0.25, 0.20, 0.15]);
        // pressure weights sum to 1.0 (P is a clean [0,1] index)
        expect(W_HP + W_DMG + W_CLEAR + W_ND).toBeCloseTo(1.0, 9);
    });

    test('enemyPower knob exponents sum to 1.0', () => {
        const e = DIFFICULTY_CONSTANTS.ENEMY_POWER_EXP;
        expect(e.hp).toBe(0.50);
        expect(e.dmg).toBe(0.30);
        expect(e.density).toBe(0.20);
        expect(e.hp + e.dmg + e.density).toBeCloseTo(1.0, 9);
    });

    test('composer + reward/depth constants', () => {
        expect(DIFFICULTY_CONSTANTS.ROSTER_CAP).toBe(40);
        expect(DIFFICULTY_CONSTANTS.ELITE_FRACTION).toBe(0.5);
        expect(DIFFICULTY_CONSTANTS.DEPTH_RATE).toBe(0.02);
        expect(DIFFICULTY_CONSTANTS.DEPTH_BIAS).toBe(0.04);
    });

    test('table + every per-mode sub-table is frozen (deep)', () => {
        expect(Object.isFrozen(DIFFICULTY_CONSTANTS)).toBe(true);
        expect(Object.isFrozen(MODE_BAND)).toBe(true);
        expect(Object.isFrozen(MODE_BASE)).toBe(true);
        expect(Object.isFrozen(MODE_RESIST)).toBe(true);
        expect(Object.isFrozen(AFFIX_CHANCE)).toBe(true);
        expect(Object.isFrozen(MODE_REWARD)).toBe(true);
        expect(Object.isFrozen(MODES)).toBe(true);
        expect(Object.isFrozen(MODE_BAND.NORMAL)).toBe(true); // nested band array
    });

    test('mutation attempts are silently ignored (frozen)', () => {
        'use strict';
        const before = MODE_BASE.NORMAL;
        try { MODE_BASE.NORMAL = 999; } catch { /* strict throw is fine */ }
        expect(MODE_BASE.NORMAL).toBe(before);
        try { DIFFICULTY_CONSTANTS.A = 999; } catch { /* strict throw is fine */ }
        expect(DIFFICULTY_CONSTANTS.A).toBe(0.15);
    });
});
