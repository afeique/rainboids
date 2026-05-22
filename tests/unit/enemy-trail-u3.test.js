/**
 * tests/unit/enemy-trail-u3.test.js — Phase A.E10-U3 Plaguebearer acid trail.
 *
 * Pins the pure `trailDrop` cadence/gate helper + the PLAGUEBEARER trailHazard
 * config that makes the S2 HazardField live.
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
}

import { describe, expect, test } from '@jest/globals';
import { trailDrop } from '../../js/modules/enemy/movement.js';
import { ENEMY_TYPES } from '../../js/modules/enemy/enemy-data.js';
import { isElement } from '../../js/modules/combat/elements.js';

describe('A.E10-U3 trailDrop cadence', () => {
    const TH = { element: 'TOXIC', radius: 70, dps: 6, lifeMs: 3500, intervalMs: 600 };

    test('no config → never drops', () => {
        expect(trailDrop(null, 0, 1000)).toEqual({ drop: false, nextAt: 0 });
    });

    test('before the next scheduled time → no drop, schedule unchanged', () => {
        const r = trailDrop(TH, 5000, 4800);
        expect(r.drop).toBe(false);
        expect(r.nextAt).toBe(5000);
    });

    test('at/after the scheduled time → drop + advance by intervalMs', () => {
        const r = trailDrop(TH, 5000, 5000);
        expect(r.drop).toBe(true);
        expect(r.nextAt).toBe(5000 + 600);
    });

    test('defaults to 600ms interval when unspecified', () => {
        const r = trailDrop({ element: 'TOXIC' }, 0, 1000);
        expect(r.drop).toBe(true);
        expect(r.nextAt).toBe(1000 + 600);
    });
});

describe('A.E10-U3 Plaguebearer config', () => {
    test('PLAGUEBEARER has a valid Toxic trailHazard; other types do not trail', () => {
        const th = ENEMY_TYPES.PLAGUEBEARER.trailHazard;
        expect(th).toBeTruthy();
        expect(isElement(th.element)).toBe(true);
        expect(th.element).toBe('TOXIC');
        expect(th.radius).toBeGreaterThan(0);
        expect(th.dps).toBeGreaterThan(0);
        expect(th.lifeMs).toBeGreaterThan(0);
        // a sampling of non-trailing types
        for (const t of ['HUNTER', 'WARDEN', 'CINDER', 'TESLA_WRAITH']) {
            expect(ENEMY_TYPES[t].trailHazard).toBeUndefined();
        }
    });
});
