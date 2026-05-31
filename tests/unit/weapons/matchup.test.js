// Unit tests for the weapon-vs-enemy-archetype matchup layer.
// Verifies:
//   1. ENEMY_ARCHETYPE covers all 29 enemy types (and matches enemy-data.js).
//   2. matchupMultiplier defaults to 1.0 for unknown weapon / enemy / both.
//   3. Documented strong (>1) and weak (<1) cases resolve as designed.
//   4. EVERY (weaponClass × archetype) multiplier sits within [0.6, 1.5].

import {
    ENEMY_ARCHETYPE,
    WEAPON_CLASS,
    matchupMultiplier,
    MATCHUP,
    MATCHUP_MIN,
    MATCHUP_MAX,
} from '../../../js/modules/combat/matchup-data.js';
import { ENEMY_TYPES } from '../../../js/modules/enemy/enemy-data.js';
import { PRIMARY_WEAPONS } from '../../../js/modules/combat/weapon-data.js';

// The 29 grouped enemy types (per the design brief / enemy-data.js brain blocks).
const ALL_29_TYPES = [
    // BRUTE
    'GUARDIAN', 'PROWLER', 'TITAN', 'GLACIER', 'WARDEN',
    // INTERCEPTOR
    'HUNTER', 'STALKER', 'FROST_LANCE', 'TESLA_WRAITH', 'PHANTOM',
    // SWARMER
    'WASP', 'CINDER',
    // SNIPER
    'SENTINEL', 'DRIFTER', 'NULL_DRONE',
    // ORBITER
    'WEAVER', 'PRISM_MIRROR',
    // SUPPORT
    'LUMEN_DRONE', 'CONDUIT_NODE', 'SPORE_CARRIER',
    // SPECIAL
    'TANGERINE', 'ASHEN_DETONATOR', 'PLAGUEBEARER', 'HYDRA', 'DEVOURER',
    'LEECH', 'JUGGERNAUT', 'THORNBACK', 'WRAITHWORM',
];

const ALL_ARCHETYPES = [
    'BRUTE', 'INTERCEPTOR', 'SWARMER', 'SNIPER', 'ORBITER', 'SUPPORT', 'SPECIAL',
];

describe('ENEMY_ARCHETYPE coverage', () => {
    test('covers all 29 documented enemy types', () => {
        expect(ALL_29_TYPES).toHaveLength(29);
        for (const type of ALL_29_TYPES) {
            expect(ENEMY_ARCHETYPE[type]).toBeDefined();
            expect(ALL_ARCHETYPES).toContain(ENEMY_ARCHETYPE[type]);
        }
    });

    test('has exactly the 29 documented keys (no extras, no omissions)', () => {
        expect(Object.keys(ENEMY_ARCHETYPE).sort()).toEqual([...ALL_29_TYPES].sort());
    });

    test('every enemy-data.js NON-boss type is mapped (stays in sync)', () => {
        // ENEMY_TYPES is the live roster of grunt types (bosses are defined
        // separately under enemy/bosses/). Every type the game can spawn as a
        // grunt should resolve to an archetype, or the matchup silently no-ops
        // for it. This guards against a new enemy type being added without a
        // matchup assignment.
        for (const type of Object.keys(ENEMY_TYPES)) {
            expect(ENEMY_ARCHETYPE[type]).toBeDefined();
        }
    });
});

describe('WEAPON_CLASS coverage', () => {
    test('every PRIMARY_WEAPONS id is classified', () => {
        for (const id of Object.keys(PRIMARY_WEAPONS)) {
            expect(WEAPON_CLASS[id]).toBeDefined();
        }
    });
});

describe('matchupMultiplier — graceful defaults', () => {
    test('unknown weapon id → 1.0', () => {
        expect(matchupMultiplier('NOT_A_WEAPON', 'TITAN')).toBe(1.0);
    });
    test('unknown enemy type → 1.0', () => {
        expect(matchupMultiplier('RAIL_DRIVER', 'NOT_AN_ENEMY')).toBe(1.0);
    });
    test('both unknown → 1.0', () => {
        expect(matchupMultiplier('NOT_A_WEAPON', 'NOT_AN_ENEMY')).toBe(1.0);
    });
    test('null / undefined / empty args → 1.0 (never NaN, never breaks damage)', () => {
        expect(matchupMultiplier(undefined, 'TITAN')).toBe(1.0);
        expect(matchupMultiplier('RAIL_DRIVER', undefined)).toBe(1.0);
        expect(matchupMultiplier(null, null)).toBe(1.0);
        expect(matchupMultiplier('', '')).toBe(1.0);
    });
    test('MATCHUP alias === matchupMultiplier', () => {
        expect(MATCHUP).toBe(matchupMultiplier);
    });
});

describe('matchupMultiplier — documented strong cases (>1)', () => {
    // PRECISION strong vs SNIPER, SUPPORT, BRUTE
    test('RAIL_DRIVER (PRECISION) > 1 vs SENTINEL (SNIPER)', () => {
        expect(matchupMultiplier('RAIL_DRIVER', 'SENTINEL')).toBeGreaterThan(1);
    });
    test('PULSE_CANNON (PRECISION) > 1 vs LUMEN_DRONE (SUPPORT)', () => {
        expect(matchupMultiplier('PULSE_CANNON', 'LUMEN_DRONE')).toBeGreaterThan(1);
    });
    test('RAIL_DRIVER (PRECISION) > 1 vs TITAN (BRUTE)', () => {
        expect(matchupMultiplier('RAIL_DRIVER', 'TITAN')).toBeGreaterThan(1);
    });
    // SPREAD strong vs SWARMER, ORBITER
    test('SCATTER_GUN (SPREAD) > 1 vs WASP (SWARMER)', () => {
        expect(matchupMultiplier('SCATTER_GUN', 'WASP')).toBeGreaterThan(1);
    });
    test('STORM_NEEDLES (SPREAD) > 1 vs WEAVER (ORBITER)', () => {
        expect(matchupMultiplier('STORM_NEEDLES', 'WEAVER')).toBeGreaterThan(1);
    });
    // AOE strong vs SWARMER, SUPPORT
    test('CLUSTER_LAUNCHER (AOE) > 1 vs CINDER (SWARMER)', () => {
        expect(matchupMultiplier('CLUSTER_LAUNCHER', 'CINDER')).toBeGreaterThan(1);
    });
    test('FLAK_CANNON (AOE) > 1 vs SPORE_CARRIER (SUPPORT)', () => {
        expect(matchupMultiplier('FLAK_CANNON', 'SPORE_CARRIER')).toBeGreaterThan(1);
    });
    // BOUNCE strong vs ORBITER, SWARMER
    test('RICOCHET (BOUNCE) > 1 vs PRISM_MIRROR (ORBITER)', () => {
        expect(matchupMultiplier('RICOCHET', 'PRISM_MIRROR')).toBeGreaterThan(1);
    });
    test('BOOMERANG (BOUNCE) > 1 vs WASP (SWARMER)', () => {
        expect(matchupMultiplier('BOOMERANG', 'WASP')).toBeGreaterThan(1);
    });
    // UTILITY strong vs SWARMER
    test('GRAVITY_LANCE (UTILITY) > 1 vs WASP (SWARMER)', () => {
        expect(matchupMultiplier('GRAVITY_LANCE', 'WASP')).toBeGreaterThan(1);
    });
    // RAMP strong vs BRUTE
    test('SPIN_CANNON (RAMP) > 1 vs GUARDIAN (BRUTE)', () => {
        expect(matchupMultiplier('SPIN_CANNON', 'GUARDIAN')).toBeGreaterThan(1);
    });
});

describe('matchupMultiplier — documented weak cases (<1)', () => {
    // PRECISION weak vs SWARMER (overkill, slow)
    test('RAIL_DRIVER (PRECISION) < 1 vs WASP (SWARMER)', () => {
        expect(matchupMultiplier('RAIL_DRIVER', 'WASP')).toBeLessThan(1);
    });
    // SPREAD weak vs BRUTE (pellets underwhelm a tank)
    test('SCATTER_GUN (SPREAD) < 1 vs TITAN (BRUTE)', () => {
        expect(matchupMultiplier('SCATTER_GUN', 'TITAN')).toBeLessThan(1);
    });
    // AOE weak vs lone fast INTERCEPTOR
    test('CLUSTER_LAUNCHER (AOE) < 1 vs HUNTER (INTERCEPTOR)', () => {
        expect(matchupMultiplier('CLUSTER_LAUNCHER', 'HUNTER')).toBeLessThan(1);
    });
    // UTILITY weak vs BRUTE
    test('GRAVITY_LANCE (UTILITY) < 1 vs PROWLER (BRUTE)', () => {
        expect(matchupMultiplier('GRAVITY_LANCE', 'PROWLER')).toBeLessThan(1);
    });
    // RAMP weak vs INTERCEPTOR (no time to spool)
    test('SPIN_CANNON (RAMP) < 1 vs STALKER (INTERCEPTOR)', () => {
        expect(matchupMultiplier('SPIN_CANNON', 'STALKER')).toBeLessThan(1);
    });
});

describe('matchupMultiplier — band invariant', () => {
    test('every (weapon × type) multiplier is within [0.6, 1.5]', () => {
        for (const weaponId of Object.keys(WEAPON_CLASS)) {
            for (const type of ALL_29_TYPES) {
                const m = matchupMultiplier(weaponId, type);
                expect(m).toBeGreaterThanOrEqual(MATCHUP_MIN);
                expect(m).toBeLessThanOrEqual(MATCHUP_MAX);
            }
        }
    });

    test('SPECIAL archetype is neutral (1.0) for every weapon class', () => {
        const specials = ALL_29_TYPES.filter(t => ENEMY_ARCHETYPE[t] === 'SPECIAL');
        expect(specials.length).toBeGreaterThan(0);
        for (const weaponId of Object.keys(WEAPON_CLASS)) {
            for (const type of specials) {
                expect(matchupMultiplier(weaponId, type)).toBe(1.0);
            }
        }
    });
});
