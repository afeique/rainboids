// Phase U2 — pre-run BUILD loadout readiness. Pins the pure helper that drives
// the BUILD footer status line + START-RUN gating: a run is startable once at
// least one PRIMARY is equipped; `complete` means all three categories are set.
import { describe, expect, test } from '@jest/globals';
import { loadoutReadiness } from '../../../js/modules/shop/shop-dom.js';
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
