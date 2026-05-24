// Phase U2 — pre-run BUILD loadout readiness. Pins the pure helper that drives
// the BUILD footer status line + START-RUN gating: a run is startable once at
// least one PRIMARY is equipped; `complete` means all three categories are set.
import { describe, expect, test } from '@jest/globals';
import { loadoutReadiness, nextTab } from '../../../js/modules/shop/shop-dom.js';
import { LOADOUT_SLOTS } from '../../../js/modules/shop/armory.js';

describe('loadoutReadiness', () => {
    test('empty selection is not ready', () => {
        const r = loadoutReadiness({});
        expect(r.ready).toBe(false);
        expect(r.complete).toBe(false);
        expect(r.primaries).toBe(0);
        expect(r.slots).toBe(LOADOUT_SLOTS);
    });

    test('a single primary makes it startable but not complete', () => {
        const r = loadoutReadiness({ primaries: ['PULSE_CANNON'] });
        expect(r.ready).toBe(true);
        expect(r.complete).toBe(false);
        expect(r.primaries).toBe(1);
    });

    test('powers/abilities without a primary are still not ready', () => {
        const r = loadoutReadiness({ powers: ['NOVA_BLAST'], abilities: ['BULWARK'] });
        expect(r.ready).toBe(false);
        expect(r.powers).toBe(1);
        expect(r.abilities).toBe(1);
    });

    test('one of each is complete', () => {
        const r = loadoutReadiness({
            primaries: ['PULSE_CANNON'],
            powers: ['NOVA_BLAST'],
            abilities: ['BULWARK'],
        });
        expect(r.ready).toBe(true);
        expect(r.complete).toBe(true);
    });

    test('counts reflect multi-select up to the slot cap', () => {
        const r = loadoutReadiness({
            primaries: ['A', 'B', 'C', 'D'],
            powers: ['E', 'F'],
            abilities: ['G'],
        });
        expect(r.primaries).toBe(4);
        expect(r.powers).toBe(2);
        expect(r.abilities).toBe(1);
        expect(r.complete).toBe(true);
    });

    test('tolerates a null/garbage selection', () => {
        expect(loadoutReadiness(null).ready).toBe(false);
        expect(loadoutReadiness(undefined).primaries).toBe(0);
        expect(loadoutReadiness({ primaries: 'nope' }).primaries).toBe(0);
    });
});

describe('nextTab (U3 keyboard tab cycling)', () => {
    const PRERUN = ['gear', 'primary', 'power', 'defense', 'passive'];
    const INRUN = ['primary', 'power', 'defense', 'passive'];

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
