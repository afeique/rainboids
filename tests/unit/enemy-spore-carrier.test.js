/**
 * tests/unit/enemy-spore-carrier.test.js — Phase E8c Spore Carrier.
 *
 * The drone-spawn cadence (reuses the generic trailDrop interval gate) + the
 * SPORE_CARRIER config. The actual spawn routes through the S3 requestEnemySpawn
 * (tested separately).
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

describe('E8c Spore Carrier spawn cadence (via the generic interval gate)', () => {
    const SP = { type: 'WASP', intervalMs: 4000, cap: 16 };

    test('does not spawn before the interval, spawns at it + advances', () => {
        expect(trailDrop(SP, 5000, 4000).drop).toBe(false);
        const r = trailDrop(SP, 5000, 5000);
        expect(r.drop).toBe(true);
        expect(r.nextAt).toBe(5000 + 4000);
    });
});

describe('SPORE_CARRIER config', () => {
    test('is a Toxic spawner with a valid, capped WASP spawner', () => {
        const s = ENEMY_TYPES.SPORE_CARRIER;
        expect(s.element).toBe('TOXIC');
        expect(s.resist.TOXIC).toBeGreaterThan(0);
        expect(s.spawner).toBeTruthy();
        expect(s.spawner.type).toBe('WASP');                 // reuses an existing renderable type
        expect(ENEMY_TYPES[s.spawner.type]).toBeTruthy();    // the spawned type exists
        expect(s.spawner.intervalMs).toBeGreaterThan(0);
        expect(s.spawner.cap).toBeGreaterThan(0);            // capped so it can't flood
        expect(isElement(s.element)).toBe(true);
    });
});
