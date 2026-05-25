/**
 * tests/unit/enemy/conduit-node.test.js — ENMY-08 Conduit Node.
 *
 * The Volt HEAL-aura support: it channels energy to mend nearby ALLY enemies
 * (the SYS-7 ally-aura `kind:'heal'` path in support-aura.js — the HEAL
 * counterpart to LUMEN_DRONE's SHIELD aura). Asserts the type/element/affinity
 * data, then drives runAura directly to confirm a wounded ally inside the
 * radius regains HP (clamped to maxHealth) while out-of-range / self / inactive
 * allies are NOT healed.
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
import { runAura } from '../../../js/modules/enemy/support-aura.js';
import { ENEMY_TYPES } from '../../../js/modules/enemy/enemy-data.js';

const NOW = 10000;
function node(aura) { return { x: 0, y: 0, active: true, aura }; }
function ally(x, y, extra = {}) { return { x, y, active: true, ...extra }; }

describe('CONDUIT_NODE config', () => {
    test('exists as a Volt support with a valid HEAL aura', () => {
        const d = ENEMY_TYPES.CONDUIT_NODE;
        expect(d).toBeTruthy();
        expect(d.name).toBe('Conduit Node');
        expect(d.element).toBe('VOLT');
        expect(d.aura).toBeTruthy();
        expect(d.aura.kind).toBe('heal');
        expect(d.aura.radius).toBeGreaterThan(0);
        expect(d.aura.amount).toBeGreaterThan(0);
        expect(d.aura.intervalMs).toBeGreaterThan(0);
        // It's a distinct HEAL support — NOT a shield (that's LUMEN_DRONE) and
        // NOT a player-suppress drone (that's NULL_DRONE).
        expect(d.suppressAura).toBeUndefined();
        // Sane standoff stats: modest-but-beefy HP, slow, keeps distance.
        expect(d.health).toBeGreaterThanOrEqual(8);
        expect(d.speed).toBeLessThanOrEqual(2);
        expect(d.movePattern).toBe('keep_distance');
    });

    test('element is VOLT and the affinity map resists Volt + is weak to Cryo', () => {
        const d = ENEMY_TYPES.CONDUIT_NODE;
        expect(d.element).toBe('VOLT');
        expect(d.resist).toBeTruthy();
        expect(Object.keys(d.resist).length).toBeGreaterThan(0);
        expect(d.resist.VOLT).toBeGreaterThan(0);   // Volt-tough
        expect(d.resist.CRYO).toBeLessThan(0);       // freeze locks the channel
    });
});

describe('CONDUIT_NODE heal aura (runAura, kind:heal)', () => {
    test('heals a wounded ally inside the radius, clamped to maxHealth', () => {
        const d = ENEMY_TYPES.CONDUIT_NODE;
        const sup = node(d.aura);
        const inRadius = Math.max(1, d.aura.radius - 1);
        const hurt = ally(inRadius * 0.5, 0, { health: 4, maxHealth: 10 });
        const nearlyFull = ally(inRadius * 0.5, 1, { health: 10 - (d.aura.amount * 0.5), maxHealth: 10 });
        const n = runAura(sup, [sup, hurt, nearlyFull], NOW);
        expect(n).toBe(2);                                // both in-radius allies counted
        expect(hurt.health).toBe(4 + d.aura.amount);      // mended by exactly `amount`
        expect(nearlyFull.health).toBe(10);               // capped at maxHealth (no overheal)
    });

    test('does NOT heal an out-of-range ally', () => {
        const d = ENEMY_TYPES.CONDUIT_NODE;
        const sup = node(d.aura);
        const far = ally(d.aura.radius + 100, 0, { health: 4, maxHealth: 10 });
        const n = runAura(sup, [sup, far], NOW);
        expect(n).toBe(0);
        expect(far.health).toBe(4);                       // untouched
    });

    test('does NOT heal itself or an inactive ally', () => {
        const d = ENEMY_TYPES.CONDUIT_NODE;
        // Give the support its own HP fields to prove self-skip isn't just a
        // missing-field no-op.
        const sup = { x: 0, y: 0, active: true, aura: d.aura, health: 3, maxHealth: 10 };
        const dead = ally(5, 0, { active: false, health: 2, maxHealth: 10 });
        const n = runAura(sup, [sup, dead], NOW);
        expect(n).toBe(0);
        expect(sup.health).toBe(3);                       // support never heals itself
        expect(dead.health).toBe(2);                      // inactive ally skipped
    });
});
