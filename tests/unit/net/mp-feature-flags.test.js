/**
 * tests/unit/net/mp-feature-flags.test.js — unit tests for the MP
 * ability-allowlist helper.
 *
 * `mp-feature-flags.js` is pure config + a `isAbilityMpSafe` helper
 * that the engine-driver / weapon-pickup layer will consult to
 * suppress abilities that lack full Rust-mirror parity. These tests
 * pin the contract:
 *   - Known-unsafe abilities (power weapons + defense skills) return false.
 *   - Known-safe primary weapons return true.
 *   - Unknown IDs default to true (the helper flags known-unsafe; it
 *     does not gate the unknown).
 *
 * The lists themselves track Phase 2.5 collision-pair progress in
 * `docs/Multiplayer Coordination – 2026-05-09.md`; as Rust mirrors
 * land, abilities migrate from UNSAFE → SAFE and these tests should
 * be updated in lock-step.
 */

import { describe, expect, test } from '@jest/globals';

import {
    MP_SAFE_ABILITIES,
    MP_UNSAFE_ABILITIES_LIST,
    isAbilityMpSafe,
} from '../../../js/net/mp-feature-flags.js';

describe('mp-feature-flags', () => {
    test('LANCE_BEAM is known-unsafe and returns false', () => {
        expect(isAbilityMpSafe('LANCE_BEAM')).toBe(false);
    });

    test('PULSE_CANNON is known-safe primary weapon and returns true', () => {
        expect(isAbilityMpSafe('PULSE_CANNON')).toBe(true);
    });

    test('unknown ability IDs default to true (conservative-permissive)', () => {
        expect(isAbilityMpSafe('NOT_A_REAL_ABILITY')).toBe(true);
        expect(isAbilityMpSafe('')).toBe(true);
        expect(isAbilityMpSafe('definitely-unknown-id-xyz')).toBe(true);
    });

    test('all six defense skills are in the unsafe list and return false', () => {
        const defenseSkills = [
            'BULWARK',
            'REPAIR_NANITES',
            'PHASE_DASH',
            'DEFLECTOR_ORBS',
            'EMP_PULSE',
            'TRACTOR_SHIELD',
        ];
        for (const id of defenseSkills) {
            expect(MP_UNSAFE_ABILITIES_LIST).toContain(id);
            expect(isAbilityMpSafe(id)).toBe(false);
        }
    });

    test('all power weapons are in the unsafe list and return false', () => {
        const powerWeapons = [
            'CHARGE_SHOT',
            'MINE_LAYER',
            'NOVA_BLAST',
            'MISSILE_SALVO',
            'LANCE_BEAM',
            'LIGHTNING_ARC',
        ];
        for (const id of powerWeapons) {
            expect(MP_UNSAFE_ABILITIES_LIST).toContain(id);
            expect(isAbilityMpSafe(id)).toBe(false);
        }
    });

    test('all listed primary weapons are MP-safe', () => {
        // Sanity check that the safe set matches the documented
        // contract — primary weapons only.
        const primaries = [
            'PULSE_CANNON',
            'STORM_NEEDLES',
            'SCATTER_GUN',
            'RAIL_DRIVER',
        ];
        for (const id of primaries) {
            expect(MP_SAFE_ABILITIES.has(id)).toBe(true);
            expect(isAbilityMpSafe(id)).toBe(true);
        }
    });

    test('safe and unsafe lists are disjoint', () => {
        for (const id of MP_UNSAFE_ABILITIES_LIST) {
            expect(MP_SAFE_ABILITIES.has(id)).toBe(false);
        }
    });
});
