// Phase P6 — Kindling passive. A player burn/corrode also catches one nearby
// enemy. kindlingTarget is the pure spread picker: the NEAREST active enemy
// within KINDLING_RADIUS that isn't the source and isn't already carrying the
// status (skipped via its `untilKey` timer vs `now`).
import { describe, expect, test } from '@jest/globals';
import { kindlingTarget, KINDLING_RADIUS } from '../../js/modules/combat/combat-manager.js';

const NOW = 1000;
function e(x, y, opts = {}) {
    return { x, y, active: true, warping: false, _deathFlash: 0, brnUntil: 0, corrodeUntil: 0, ...opts };
}

describe('Kindling — status spread target picker', () => {
    test('null / empty inputs → null', () => {
        expect(kindlingTarget(null, e(0, 0), 'brnUntil', NOW)).toBe(null);
        expect(kindlingTarget([], e(0, 0), 'brnUntil', NOW)).toBe(null);
        expect(kindlingTarget([e(1, 1)], null, 'brnUntil', NOW)).toBe(null);
    });

    test('picks the nearest fresh enemy within radius', () => {
        const src = e(0, 0);
        const near = e(30, 0);
        const far = e(90, 0);
        const got = kindlingTarget([src, far, near], src, 'brnUntil', NOW);
        expect(got).toBe(near);
    });

    test('never returns the source itself', () => {
        const src = e(0, 0);
        const got = kindlingTarget([src], src, 'brnUntil', NOW);
        expect(got).toBe(null);
    });

    test('skips enemies already carrying the status (untilKey > now)', () => {
        const src = e(0, 0);
        const burning = e(10, 0, { brnUntil: NOW + 500 }); // closest but already burning
        const fresh = e(40, 0);
        const got = kindlingTarget([src, burning, fresh], src, 'brnUntil', NOW);
        expect(got).toBe(fresh);
    });

    test('an EXPIRED status (untilKey <= now) is eligible again', () => {
        const src = e(0, 0);
        const expired = e(15, 0, { brnUntil: NOW - 1 });
        const got = kindlingTarget([src, expired], src, 'brnUntil', NOW);
        expect(got).toBe(expired);
    });

    test('respects the per-status key — corrode spread ignores burn timers', () => {
        const src = e(0, 0);
        const burningButNotCorroded = e(20, 0, { brnUntil: NOW + 999, corrodeUntil: 0 });
        const got = kindlingTarget([src, burningButNotCorroded], src, 'corrodeUntil', NOW);
        expect(got).toBe(burningButNotCorroded);
    });

    test('out-of-range enemies are not picked', () => {
        const src = e(0, 0);
        const far = e(KINDLING_RADIUS + 5, 0);
        expect(kindlingTarget([src, far], src, 'brnUntil', NOW)).toBe(null);
    });

    test('skips inactive / warping / death-flashing enemies', () => {
        const src = e(0, 0);
        const dead = e(10, 0, { active: false });
        const warping = e(12, 0, { warping: true });
        const flashing = e(14, 0, { _deathFlash: 8 });
        const live = e(50, 0);
        const got = kindlingTarget([src, dead, warping, flashing, live], src, 'brnUntil', NOW);
        expect(got).toBe(live);
    });
});
