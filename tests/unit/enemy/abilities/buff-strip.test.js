// SYS-8 / ENMY-05 — player-buff removal (Leech) unit tests.
//
// Drives the pure helpers headlessly with stub players + an explicit `now` and a
// deterministic rng. Asserts the DoD: listStrippablePowerups excludes expired +
// unstrippable; pickStripTarget is null when empty and deterministic under a
// stub rng; stripPlayerBuff deletes the activePowerups entry, stamps the
// suppression, and returns { stripped, until }; an explicit key strips that one;
// no-eligible returns { stripped: null }; isBuffSuppressed lapses at `now`; and
// absent activePowerups/skillSlots never throw.
import { describe, expect, test } from '@jest/globals';
import {
    STRIP_DURATION_MS,
    LEECH_DEFAULTS,
    listStrippablePowerups,
    pickStripTarget,
    stripPlayerBuff,
    isBuffSuppressed,
} from '../../../../js/modules/enemy/abilities/buff-strip.js';

const NOW = 1000;

// A player with three powerups: one open-ended (no expiresAt), one expiring in
// the future, one already expired, plus an unstrippable one.
function makePlayer(overrides = {}) {
    return {
        activePowerups: {
            RAPID_FIRE: {},                          // no expiresAt → active
            SHIELD_BOOST: { expiresAt: NOW + 5000 }, // future → active
            HOMING: { expiresAt: NOW - 1 },          // past → expired
            INVINCIBLE: { unstrippable: true },      // flagged → never strip
        },
        ...overrides,
    };
}

describe('exported surface', () => {
    test('STRIP_DURATION_MS and LEECH_DEFAULTS are present and sane', () => {
        expect(STRIP_DURATION_MS).toBe(5000);
        expect(LEECH_DEFAULTS).toEqual({ durationMs: STRIP_DURATION_MS });
    });
});

describe('listStrippablePowerups', () => {
    test('returns only active, non-expired, strippable keys', () => {
        const player = makePlayer();
        const keys = listStrippablePowerups(player, NOW);
        expect(keys.sort()).toEqual(['RAPID_FIRE', 'SHIELD_BOOST']);
    });

    test('excludes a powerup whose expiresAt equals now (boundary = expired)', () => {
        const player = { activePowerups: { FOO: { expiresAt: NOW } } };
        expect(listStrippablePowerups(player, NOW)).toEqual([]);
    });

    test('excludes unstrippable entries even when active', () => {
        const player = { activePowerups: { FOO: { unstrippable: true } } };
        expect(listStrippablePowerups(player, NOW)).toEqual([]);
    });

    test('absent activePowerups returns [] (no throw)', () => {
        expect(listStrippablePowerups({}, NOW)).toEqual([]);
        expect(listStrippablePowerups(null, NOW)).toEqual([]);
    });

    test('ignores null/undefined buff entries', () => {
        const player = { activePowerups: { FOO: null, BAR: {} } };
        expect(listStrippablePowerups(player, NOW)).toEqual(['BAR']);
    });
});

describe('pickStripTarget', () => {
    test('returns null when nothing is eligible', () => {
        expect(pickStripTarget({ activePowerups: {} }, NOW, () => 0)).toBeNull();
        expect(pickStripTarget({}, NOW, () => 0)).toBeNull();
    });

    test('deterministic with a stub rng: () => 0 picks index 0', () => {
        const player = makePlayer();
        const eligible = listStrippablePowerups(player, NOW);
        expect(pickStripTarget(player, NOW, () => 0)).toBe(eligible[0]);
    });

    test('rng near 1 picks the last eligible key (clamped in-range)', () => {
        const player = makePlayer();
        const eligible = listStrippablePowerups(player, NOW);
        // rng() = 0.999... → floor(0.999 * len) = len - 1
        const last = pickStripTarget(player, NOW, () => 0.999999);
        expect(last).toBe(eligible[eligible.length - 1]);
    });

    test('rng exactly 1 stays in range (clamped, no undefined)', () => {
        const player = makePlayer();
        const eligible = listStrippablePowerups(player, NOW);
        expect(pickStripTarget(player, NOW, () => 1)).toBe(eligible[eligible.length - 1]);
    });

    test('defaults rng to Math.random when omitted', () => {
        const player = { activePowerups: { ONLY: {} } };
        // Single eligible key → result is deterministic regardless of rng.
        expect(pickStripTarget(player, NOW)).toBe('ONLY');
    });
});

describe('stripPlayerBuff', () => {
    test('deletes the chosen entry, stamps suppression, returns { stripped, until }', () => {
        const player = makePlayer();
        const result = stripPlayerBuff(player, NOW, { rng: () => 0 });
        const expectedKey = listStrippablePowerups(makePlayer(), NOW)[0];

        expect(result.stripped).toBe(expectedKey);
        expect(result.until).toBe(NOW + STRIP_DURATION_MS);
        expect(player.activePowerups[expectedKey]).toBeUndefined();
        expect(player._buffSuppressed[expectedKey]).toBe(NOW + STRIP_DURATION_MS);
    });

    test('uses a custom durationMs when provided', () => {
        const player = makePlayer();
        const result = stripPlayerBuff(player, NOW, { rng: () => 0, durationMs: 2000 });
        expect(result.until).toBe(NOW + 2000);
        expect(player._buffSuppressed[result.stripped]).toBe(NOW + 2000);
    });

    test('honors an explicit eligible key', () => {
        const player = makePlayer();
        const result = stripPlayerBuff(player, NOW, { key: 'SHIELD_BOOST' });
        expect(result.stripped).toBe('SHIELD_BOOST');
        expect(player.activePowerups.SHIELD_BOOST).toBeUndefined();
        // The non-targeted powerup is left intact.
        expect(player.activePowerups.RAPID_FIRE).toBeDefined();
    });

    test('explicit key that is not eligible (expired) → { stripped: null }', () => {
        const player = makePlayer();
        const result = stripPlayerBuff(player, NOW, { key: 'HOMING' });
        expect(result).toEqual({ stripped: null });
        // Nothing suppressed, nothing else removed.
        expect(player._buffSuppressed).toBeUndefined();
        expect(player.activePowerups.RAPID_FIRE).toBeDefined();
    });

    test('explicit key that is unstrippable → { stripped: null }', () => {
        const player = makePlayer();
        const result = stripPlayerBuff(player, NOW, { key: 'INVINCIBLE' });
        expect(result).toEqual({ stripped: null });
        expect(player.activePowerups.INVINCIBLE).toBeDefined();
    });

    test('no eligible powerups → { stripped: null }, no suppression stamp', () => {
        const player = { activePowerups: {} };
        const result = stripPlayerBuff(player, NOW, { rng: () => 0 });
        expect(result).toEqual({ stripped: null });
        expect(player._buffSuppressed).toBeUndefined();
    });

    test('null player → { stripped: null } (no throw)', () => {
        expect(stripPlayerBuff(null, NOW)).toEqual({ stripped: null });
    });

    test('preserves an existing _buffSuppressed map and adds to it', () => {
        const player = makePlayer({ _buffSuppressed: { OLD: NOW + 100 } });
        stripPlayerBuff(player, NOW, { key: 'RAPID_FIRE' });
        expect(player._buffSuppressed.OLD).toBe(NOW + 100);
        expect(player._buffSuppressed.RAPID_FIRE).toBe(NOW + STRIP_DURATION_MS);
    });

    test('also deactivates a matching skillSlots buff (best-effort)', () => {
        const player = makePlayer({
            skillSlots: [
                { id: 'RAPID_FIRE', buffActive: true },
                { id: 'OTHER', buffActive: true },
                null,
                { id: 'EMPTY' },
            ],
        });
        stripPlayerBuff(player, NOW, { key: 'RAPID_FIRE' });
        expect(player.skillSlots[0].buffActive).toBe(false);
        // An unrelated slot is untouched.
        expect(player.skillSlots[1].buffActive).toBe(true);
    });

    test('absent skillSlots / activePowerups never throw', () => {
        // No activePowerups at all → nothing eligible, graceful null.
        expect(() => stripPlayerBuff({}, NOW, { rng: () => 0 })).not.toThrow();
        expect(stripPlayerBuff({}, NOW, { rng: () => 0 })).toEqual({ stripped: null });
        // activePowerups present but skillSlots absent → still works.
        const player = { activePowerups: { ONLY: {} } };
        expect(() => stripPlayerBuff(player, NOW, { key: 'ONLY' })).not.toThrow();
        expect(player.activePowerups.ONLY).toBeUndefined();
    });
});

describe('isBuffSuppressed', () => {
    test('true before expiry, false at/after expiry', () => {
        const player = makePlayer();
        stripPlayerBuff(player, NOW, { key: 'RAPID_FIRE' }); // until = NOW + 5000
        expect(isBuffSuppressed(player, 'RAPID_FIRE', NOW + 1)).toBe(true);
        expect(isBuffSuppressed(player, 'RAPID_FIRE', NOW + 4999)).toBe(true);
        // Boundary: equal to `until` is NOT suppressed (strictly greater).
        expect(isBuffSuppressed(player, 'RAPID_FIRE', NOW + STRIP_DURATION_MS)).toBe(false);
        expect(isBuffSuppressed(player, 'RAPID_FIRE', NOW + 6000)).toBe(false);
    });

    test('false for a key that was never suppressed', () => {
        const player = makePlayer();
        expect(isBuffSuppressed(player, 'NOPE', NOW)).toBe(false);
    });

    test('absent _buffSuppressed / null player → false (no throw)', () => {
        expect(isBuffSuppressed({}, 'X', NOW)).toBe(false);
        expect(isBuffSuppressed(null, 'X', NOW)).toBe(false);
    });
});
