// Phase R5 — loadout selection helpers (pure, no DOM).
import { toggleSelection, normalizeLoadout, LOADOUT_SLOTS } from '../../js/modules/shop/armory.js';

describe('Loadout — toggleSelection', () => {
    test('adds an id not present', () => {
        expect(toggleSelection(['A'], 'B', 4)).toEqual(['A', 'B']);
    });
    test('removes an id already present', () => {
        expect(toggleSelection(['A', 'B'], 'A', 4)).toEqual(['B']);
    });
    test('ignores adds beyond the cap', () => {
        const full = ['A', 'B', 'C', 'D'];
        expect(toggleSelection(full, 'E', 4)).toEqual(full);
    });
    test('can still remove at the cap', () => {
        expect(toggleSelection(['A', 'B', 'C', 'D'], 'B', 4)).toEqual(['A', 'C', 'D']);
    });
    test('does not mutate the input', () => {
        const a = ['A'];
        toggleSelection(a, 'B', 4);
        expect(a).toEqual(['A']);
    });
});

describe('Loadout — normalizeLoadout', () => {
    // Meta with some purchased unlocks on top of the base kit.
    const meta = {
        unlockedPrimaries: ['STORM_NEEDLES', 'SCATTER_GUN'],
        unlockedPowers: ['NOVA_BLAST'],
        unlockedAbilities: ['EMP_PULSE', 'SENTRY_DRONE'],
    };

    test('keeps only unlocked ids', () => {
        const out = normalizeLoadout({ primaries: ['PULSE_CANNON', 'NOT_OWNED', 'STORM_NEEDLES'] }, meta);
        expect(out.primaries).toEqual(['PULSE_CANNON', 'STORM_NEEDLES']);
    });

    test('dedupes and clamps to LOADOUT_SLOTS', () => {
        const many = ['PULSE_CANNON', 'PULSE_CANNON', 'STORM_NEEDLES', 'SCATTER_GUN'];
        const out = normalizeLoadout({ primaries: many }, meta);
        expect(out.primaries).toEqual(['PULSE_CANNON', 'STORM_NEEDLES', 'SCATTER_GUN']);
        expect(out.primaries.length).toBeLessThanOrEqual(LOADOUT_SLOTS);
    });

    test('guarantees at least one per category (fallback to first unlocked)', () => {
        const out = normalizeLoadout({}, meta);
        expect(out.primaries.length).toBeGreaterThanOrEqual(1);
        expect(out.powers.length).toBeGreaterThanOrEqual(1);
        expect(out.abilities.length).toBeGreaterThanOrEqual(1);
        // base items are always available
        expect(out.primaries).toContain('PULSE_CANNON');
    });

    test('every chosen id is from the unlocked pool (locked ids dropped)', () => {
        // 6.x — BULWARK / FIELD_MEDIC are no longer free base kit, so with a
        // meta that only owns EMP_PULSE + SENTRY_DRONE they're filtered out.
        const out = normalizeLoadout({ abilities: ['BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE'] }, meta);
        expect(out.abilities).toEqual(['EMP_PULSE', 'SENTRY_DRONE']);
    });
});
