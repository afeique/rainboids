/**
 * tests/unit/enemy-shapes-u1.test.js — Phase A.E10-U1 distinct enemy silhouettes.
 *
 * The 7 new elemental enemy types (CINDER, GLACIER, FROST_LANCE,
 * ASHEN_DETONATOR, TESLA_WRAITH, PLAGUEBEARER, WARDEN) used to reuse existing
 * shapes (and actually fell through to the HUNTER triangle in the live
 * drawEnemyShape switch). U1 gives each its own draw method. This pins that:
 *   (a) every NEW shape name in SHAPE_DRAW_MAP resolves to a function exported
 *       by js/modules/enemy/shapes.js,
 *   (b) each new type's visual.shape is one of the new names AND present in
 *       SHAPE_DRAW_MAP,
 *   (c) each new draw method runs without throwing when called with
 *       `this` = a mock enemy and a no-op 2D context (the same .call(this, ctx)
 *       + centered-at-origin convention the other shape drawers use).
 */

// Modules touch `window` at import time; shim it for the Node/Jest env.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}

import { describe, expect, test } from '@jest/globals';
import { ENEMY_TYPES, SHAPE_DRAW_MAP } from '../../js/modules/enemy/enemy-data.js';
import * as shapes from '../../js/modules/enemy/shapes.js';

// The 7 new shape names introduced by U1 → their draw-method names.
const NEW_SHAPE_NAMES = {
    cinder_ember: 'drawCinderEmber',
    ice_crystal:  'drawIceCrystal',
    icicle_lance: 'drawIcicleLance',
    cracked_bomb: 'drawCrackedBomb',
    arc_node:     'drawArcNode',
    plague_sac:   'drawPlagueSac',
    prism_facet:  'drawPrismFacet',
};

// The 7 new enemy types that should now own a distinct shape.
const NEW_TYPES = {
    CINDER:          'cinder_ember',
    GLACIER:         'ice_crystal',
    FROST_LANCE:     'icicle_lance',
    ASHEN_DETONATOR: 'cracked_bomb',
    TESLA_WRAITH:    'arc_node',
    PLAGUEBEARER:    'plague_sac',
    WARDEN:          'prism_facet',
};

// A 2D-context mock: every method is a no-op, every property accepts any value,
// and createRadialGradient (used by some drawers) returns a stub gradient.
function makeMockCtx() {
    const gradient = { addColorStop() {} };
    return new Proxy({}, {
        get(_t, prop) {
            if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
                return () => gradient;
            }
            // Any accessed member is a callable no-op; reads of style props are fine.
            return () => {};
        },
        set() { return true; },
    });
}

function makeMockEnemy() {
    return { radius: 20, color: '#fff', glowColor: '#0ff', config: { visual: {} } };
}

describe('A.E10-U1 — new enemy shape names map to real draw functions', () => {
    test('every new shape name in SHAPE_DRAW_MAP resolves to an exported function', () => {
        for (const [shapeName, methodName] of Object.entries(NEW_SHAPE_NAMES)) {
            expect(SHAPE_DRAW_MAP[shapeName]).toBe(methodName);
            expect(typeof shapes[methodName]).toBe('function');
        }
    });
});

describe('A.E10-U1 — each new enemy type uses a new distinct shape', () => {
    for (const [type, shapeName] of Object.entries(NEW_TYPES)) {
        test(`${type}.visual.shape === '${shapeName}' and is registered`, () => {
            const def = ENEMY_TYPES[type];
            expect(def).toBeDefined();
            expect(def.visual.shape).toBe(shapeName);
            // It's one of the NEW names (not a reused legacy shape)…
            expect(Object.keys(NEW_SHAPE_NAMES)).toContain(def.visual.shape);
            // …and present in SHAPE_DRAW_MAP.
            expect(SHAPE_DRAW_MAP[def.visual.shape]).toBeDefined();
        });
    }

    test('the 7 new shapes are all distinct from each other', () => {
        const used = Object.values(NEW_TYPES);
        expect(new Set(used).size).toBe(used.length);
    });
});

describe('A.E10-U1 — new draw methods run without throwing', () => {
    for (const [shapeName, methodName] of Object.entries(NEW_SHAPE_NAMES)) {
        test(`${methodName} (${shapeName}) draws without throwing`, () => {
            const fn = shapes[methodName];
            const ctx = makeMockCtx();
            expect(() => fn.call(makeMockEnemy(), ctx)).not.toThrow();
        });
    }
});
