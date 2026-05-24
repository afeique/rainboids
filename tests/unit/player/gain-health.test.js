/**
 * tests/unit/player/gain-health.test.js — 6.149.0 canonical heal entry point.
 *
 * Player.gainHealth(amount) clamps to the effective max and credits ANY surplus
 * (overflow past max) to the spare-tank accumulator. This is the bug fix that
 * makes "overflow → regain a tank" hold for EVERY heal source, not just health
 * orbs + regen. Browser shims mirror the shift-dash sibling suite.
 */
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { vibrate: undefined };

import { beforeEach, describe, expect, test } from '@jest/globals';
import { Player } from '../../../js/modules/player/player.js';

function freshPlayer() {
    const p = new Player();
    p.credited = [];
    p.gameEngine = { accumulateOverflowToTank: (c) => p.credited.push(c) };
    return p;
}

describe('Player.gainHealth — overflow → tank crediting', () => {
    let p;
    let cap;
    beforeEach(() => {
        p = freshPlayer();
        cap = p.getEffectiveMaxHealth();
    });

    test('a heal below max raises HP and credits no overflow', () => {
        p.health = cap - 10;
        const r = p.gainHealth(6);
        expect(p.health).toBe(cap - 4);
        expect(r).toEqual({ healed: 6, overflow: 0 });
        expect(p.credited).toEqual([]);
    });

    test('a heal that exactly reaches max credits nothing', () => {
        p.health = cap - 5;
        const r = p.gainHealth(5);
        expect(p.health).toBe(cap);
        expect(r.overflow).toBe(0);
        expect(p.credited).toEqual([]);
    });

    test('a heal past max clamps HP and credits the surplus', () => {
        p.health = cap - 5;
        const r = p.gainHealth(20); // 5 heals, 15 overflow
        expect(p.health).toBe(cap);
        expect(r.healed).toBe(5);
        expect(r.overflow).toBe(15);
        expect(p.credited).toEqual([15]);
    });

    test('healing while already at max credits the FULL amount', () => {
        p.health = cap;
        const r = p.gainHealth(12);
        expect(p.health).toBe(cap);
        expect(r.healed).toBe(0);
        expect(r.overflow).toBe(12);
        expect(p.credited).toEqual([12]);
    });

    test('a non-positive amount is a no-op', () => {
        p.health = cap - 3;
        expect(p.gainHealth(0)).toEqual({ healed: 0, overflow: 0 });
        expect(p.gainHealth(-5)).toEqual({ healed: 0, overflow: 0 });
        expect(p.health).toBe(cap - 3);
        expect(p.credited).toEqual([]);
    });

    test('safe when no engine accumulator is wired (still clamps)', () => {
        p.gameEngine = null;
        p.health = cap - 2;
        expect(() => p.gainHealth(10)).not.toThrow();
        expect(p.health).toBe(cap);
    });
});
