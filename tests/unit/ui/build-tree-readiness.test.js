// Phase U2 / 8.x — pre-run BUILD loadout readiness. Weapons are equipped gear
// now (the primary comes from the equipped weapon item, powers are auto-granted),
// so the pre-run menu no longer picks weapons and a run is ALWAYS startable.
// The only remaining pick is the optional abilities, which `complete` reflects.
import { describe, expect, test } from '@jest/globals';
import { loadoutReadiness, nextTab } from '../../../js/modules/shop/shop-dom.js';
import { LOADOUT_SLOTS } from '../../../js/modules/shop/armory.js';

describe('loadoutReadiness', () => {
    test('empty selection is still startable (weapons are equipped gear)', () => {
        const r = loadoutReadiness({});
        expect(r.ready).toBe(true);
        expect(r.complete).toBe(false);
        expect(r.abilities).toBe(0);
        expect(r.slots).toBe(LOADOUT_SLOTS);
    });

    test('picking at least one ability marks it complete', () => {
        const r = loadoutReadiness({ abilities: ['BULWARK'] });
        expect(r.ready).toBe(true);
        expect(r.complete).toBe(true);
        expect(r.abilities).toBe(1);
    });

    test('primaries/powers in the selection are ignored', () => {
        const r = loadoutReadiness({ primaries: ['PULSE_CANNON'], powers: ['NOVA_BLAST'] });
        expect(r.ready).toBe(true);
        expect(r.complete).toBe(false);
        expect(r.abilities).toBe(0);
    });

    test('ability count reflects multi-select up to the slot cap', () => {
        const r = loadoutReadiness({ abilities: ['A', 'B', 'C', 'D'] });
        expect(r.abilities).toBe(4);
        expect(r.complete).toBe(true);
    });

    test('tolerates a null/garbage selection but stays startable', () => {
        expect(loadoutReadiness(null).ready).toBe(true);
        expect(loadoutReadiness(undefined).abilities).toBe(0);
        expect(loadoutReadiness({ abilities: 'nope' }).abilities).toBe(0);
    });
});

describe('nextTab (U3 keyboard tab cycling)', () => {
    const PRERUN = ['gear', 'primary', 'power', 'abilities', 'passive'];
    const INRUN = ['primary', 'power', 'abilities', 'passive'];

    test('steps forward and wraps at the end', () => {
        expect(nextTab(PRERUN, 'gear', 1)).toBe('primary');
        expect(nextTab(PRERUN, 'passive', 1)).toBe('gear');
    });

    test('steps backward and wraps at the start', () => {
        expect(nextTab(PRERUN, 'primary', -1)).toBe('gear');
        expect(nextTab(PRERUN, 'gear', -1)).toBe('passive');
    });

    test('in-run list excludes GEAR (4 tabs)', () => {
        expect(nextTab(INRUN, 'passive', 1)).toBe('primary');
        expect(nextTab(INRUN, 'primary', -1)).toBe('passive');
    });

    test('a current tab not in the list falls back to stepping from index 0', () => {
        expect(nextTab(INRUN, 'gear', 1)).toBe('power'); // treated as index 0 → +1
    });

    test('empty/garbage tab lists are returned unchanged', () => {
        expect(nextTab([], 'primary', 1)).toBe('primary');
        expect(nextTab(null, 'primary', 1)).toBe('primary');
    });
});
