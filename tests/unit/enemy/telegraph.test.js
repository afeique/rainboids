/**
 * tests/unit/enemy/telegraph.test.js — SYS-11 / ENMY-01 generalized
 * telegraphed strike. Pins the pure wind-up → strike → recover → idle state
 * machine (createTelegraph defaults/overrides, start gating, phase progression
 * at exact `now` offsets, isStriking window, clamped progress, non-mutating
 * reads) with fake timestamps.
 */

import { describe, expect, test } from '@jest/globals';
import {
    createTelegraph,
    startTelegraph,
    tickTelegraph,
    telegraphPhase,
    isStriking,
    telegraphProgress,
    TELEGRAPH_DEFAULTS,
    TELEGRAPH_PHASES,
} from '../../../js/modules/enemy/telegraph.js';

const NOW = 10000;

describe('SYS-11 createTelegraph', () => {
    test('defaults from TELEGRAPH_DEFAULTS, idle, no startedAt', () => {
        const t = createTelegraph();
        expect(t.windupMs).toBe(TELEGRAPH_DEFAULTS.windupMs);
        expect(t.strikeMs).toBe(TELEGRAPH_DEFAULTS.strikeMs);
        expect(t.recoverMs).toBe(TELEGRAPH_DEFAULTS.recoverMs);
        expect(t.phase).toBe('idle');
        expect(t.startedAt).toBeNull();
    });

    test('defaults are sensible (600 / 200 / 400)', () => {
        expect(TELEGRAPH_DEFAULTS).toEqual({ windupMs: 600, strikeMs: 200, recoverMs: 400 });
        expect(TELEGRAPH_PHASES).toEqual(['idle', 'windup', 'strike', 'recover']);
    });

    test('opts override individual durations; missing ones fall back', () => {
        const t = createTelegraph({ windupMs: 100, strikeMs: 50, recoverMs: 30 });
        expect(t.windupMs).toBe(100);
        expect(t.strikeMs).toBe(50);
        expect(t.recoverMs).toBe(30);

        const partial = createTelegraph({ strikeMs: 999 });
        expect(partial.windupMs).toBe(TELEGRAPH_DEFAULTS.windupMs);
        expect(partial.strikeMs).toBe(999);
        expect(partial.recoverMs).toBe(TELEGRAPH_DEFAULTS.recoverMs);
    });
});

describe('SYS-11 startTelegraph', () => {
    test('idle → windup at now', () => {
        const t = createTelegraph();
        startTelegraph(t, NOW);
        expect(t.startedAt).toBe(NOW);
        expect(t.phase).toBe('windup');
        expect(telegraphPhase(t, NOW)).toBe('windup');
    });

    test('ignored while already running (does not reset startedAt)', () => {
        const t = createTelegraph({ windupMs: 100, strikeMs: 50, recoverMs: 30 });
        startTelegraph(t, NOW);
        // mid-windup re-start should be a no-op
        startTelegraph(t, NOW + 50);
        expect(t.startedAt).toBe(NOW);
        // also ignored during strike + recover
        startTelegraph(t, NOW + 120); // strike
        expect(t.startedAt).toBe(NOW);
        startTelegraph(t, NOW + 160); // recover
        expect(t.startedAt).toBe(NOW);
    });

    test('can re-start once it has lapsed back to idle', () => {
        const t = createTelegraph({ windupMs: 100, strikeMs: 50, recoverMs: 30 });
        startTelegraph(t, NOW);
        tickTelegraph(t, NOW + 1000); // well past recoverEnd → idle, clears startedAt
        expect(t.phase).toBe('idle');
        startTelegraph(t, NOW + 1000);
        expect(t.startedAt).toBe(NOW + 1000);
        expect(t.phase).toBe('windup');
    });
});

describe('SYS-11 phase progression', () => {
    // windup 100 [0,100), strike 50 [100,150), recover 30 [150,180), idle >=180
    const make = () => {
        const t = createTelegraph({ windupMs: 100, strikeMs: 50, recoverMs: 30 });
        startTelegraph(t, NOW);
        return t;
    };

    test('telegraphPhase at boundaries', () => {
        const t = make();
        expect(telegraphPhase(t, NOW)).toBe('windup');         // elapsed 0
        expect(telegraphPhase(t, NOW + 99)).toBe('windup');
        expect(telegraphPhase(t, NOW + 100)).toBe('strike');   // windup end
        expect(telegraphPhase(t, NOW + 149)).toBe('strike');
        expect(telegraphPhase(t, NOW + 150)).toBe('recover');  // strike end
        expect(telegraphPhase(t, NOW + 179)).toBe('recover');
        expect(telegraphPhase(t, NOW + 180)).toBe('idle');     // recover end → idle
        expect(telegraphPhase(t, NOW + 500)).toBe('idle');
    });

    test('tickTelegraph drives windup→strike→recover→idle and clears on idle', () => {
        const t = make();
        expect(tickTelegraph(t, NOW + 10)).toBe('windup');
        expect(t.phase).toBe('windup');
        expect(t.startedAt).toBe(NOW);

        expect(tickTelegraph(t, NOW + 120)).toBe('strike');
        expect(t.phase).toBe('strike');

        expect(tickTelegraph(t, NOW + 160)).toBe('recover');
        expect(t.phase).toBe('recover');

        expect(tickTelegraph(t, NOW + 200)).toBe('idle');
        expect(t.phase).toBe('idle');
        expect(t.startedAt).toBeNull(); // lapsed → cleared
    });

    test('before startedAt (negative elapsed) reads idle', () => {
        const t = make();
        expect(telegraphPhase(t, NOW - 50)).toBe('idle');
    });
});

describe('SYS-11 isStriking', () => {
    test('true only inside the strike window', () => {
        const t = createTelegraph({ windupMs: 100, strikeMs: 50, recoverMs: 30 });
        startTelegraph(t, NOW);
        expect(isStriking(t, NOW + 50)).toBe(false);   // windup
        expect(isStriking(t, NOW + 99)).toBe(false);
        expect(isStriking(t, NOW + 100)).toBe(true);   // strike start
        expect(isStriking(t, NOW + 149)).toBe(true);
        expect(isStriking(t, NOW + 150)).toBe(false);  // recover
        expect(isStriking(t, NOW + 500)).toBe(false);  // idle
    });

    test('false for a fresh idle telegraph', () => {
        expect(isStriking(createTelegraph(), NOW)).toBe(false);
    });
});

describe('SYS-11 telegraphProgress', () => {
    const make = () => {
        const t = createTelegraph({ windupMs: 100, strikeMs: 50, recoverMs: 30 });
        startTelegraph(t, NOW);
        return t;
    };

    test('0→1 within the windup phase', () => {
        const t = make();
        expect(telegraphProgress(t, NOW)).toBe(0);
        expect(telegraphProgress(t, NOW + 50)).toBeCloseTo(0.5);
        expect(telegraphProgress(t, NOW + 99)).toBeCloseTo(0.99);
    });

    test('resets to 0 at each phase start (per-phase, not global)', () => {
        const t = make();
        expect(telegraphProgress(t, NOW + 100)).toBe(0);          // strike start
        expect(telegraphProgress(t, NOW + 125)).toBeCloseTo(0.5); // strike mid
        expect(telegraphProgress(t, NOW + 150)).toBe(0);          // recover start
        expect(telegraphProgress(t, NOW + 165)).toBeCloseTo(0.5); // recover mid
    });

    test('idle reads 0, clamped at phase ends', () => {
        const t = make();
        expect(telegraphProgress(t, NOW + 500)).toBe(0);  // idle
        expect(telegraphProgress(t, NOW - 50)).toBe(0);   // before start
        expect(telegraphProgress(createTelegraph(), NOW)).toBe(0);
    });
});

describe('SYS-11 purity', () => {
    test('telegraphPhase / isStriking / telegraphProgress do not mutate state', () => {
        const t = createTelegraph({ windupMs: 100, strikeMs: 50, recoverMs: 30 });
        startTelegraph(t, NOW);
        const snapshot = { ...t };
        telegraphPhase(t, NOW + 120);
        isStriking(t, NOW + 120);
        telegraphProgress(t, NOW + 120);
        expect(t).toEqual(snapshot); // phase still 'windup', startedAt unchanged
    });
});
