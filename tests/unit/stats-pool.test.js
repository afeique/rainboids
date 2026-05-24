/**
 * tests/unit/stats-pool.test.js
 *
 * Verifies the STATS export in weapon-data.js.
 *
 * 6.28.0 / 6.30.0 redesign — PASSIVE is now the WAVE-CLEAR REWARD pool
 * ONLY (no shop tab, no gold cost). Offensive traits (Rapid Fire, Multi
 * Shot, Explosive, Executioner, Iron Will) were dropped from passives —
 * they are now per-weapon upgrades. The passive pool is purely the eight
 * defensive / utility stats, and they carry NO `cost` (reward-only) and
 * NO `hidden` flag (the old retired-but-reserved IDs are gone).
 *
 * Acceptance criteria:
 *   - STATS exports the 8 stat IDs
 *   - Each entry has the reward-card shape (id, name, description,
 *     maxStacks, icon, passive: true) — no cost
 *   - STAT_CARD_IDS matches the pool the survivor cards draw from
 *   - Offensive traits are NOT in the passive pool
 *
 * weapon-data.js is a pure module with no browser dependencies, so no
 * shims are needed.
 */

import {
    STATS,
    STAT_CARD_IDS,
    getStats,
    PRIMARY_UPGRADES,
    POWER_UPGRADES,
} from '../../js/modules/combat/weapon-data.js';

// ---------------------------------------------------------------------------
// STATS export
// ---------------------------------------------------------------------------

describe('STATS (6.30.0 — wave-reward stat pool)', () => {
    test('is exported as an object', () => {
        expect(STATS).toBeDefined();
        expect(typeof STATS).toBe('object');
        expect(STATS).not.toBeNull();
    });

    // The 8 defensive / utility stats that make up the reward pool.
    const EXPECTED_PASSIVE_IDS = [
        'CRIT_CHANCE', 'CRIT_DAMAGE', 'HEALTH_BOOST', 'SHIELD_BOOST',
        'VAMPIRISM', 'THORNS', 'DODGE', 'SPEED_BOOST',
    ];

    test.each(EXPECTED_PASSIVE_IDS)('contains expected ID %s', (id) => {
        expect(STATS[id]).toBeDefined();
        expect(STATS[id].id).toBe(id);
    });

    test('the pool is EXACTLY those 8 stats (no extras)', () => {
        expect(Object.keys(STATS).sort()).toEqual([...EXPECTED_PASSIVE_IDS].sort());
    });

    test('every entry has the reward-card shape (no cost — reward-only)', () => {
        for (const [key, upg] of Object.entries(STATS)) {
            expect(upg.id).toBe(key);                          // key matches id
            expect(typeof upg.name).toBe('string');
            expect(upg.name.length).toBeGreaterThan(0);
            expect(typeof upg.description).toBe('string');
            expect(typeof upg.maxStacks).toBe('number');
            expect(upg.maxStacks).toBeGreaterThanOrEqual(1);
            expect(upg.passive).toBe(true);
            expect(typeof upg.icon).toBe('string');
            // 6.30.0 — passives are reward-only; they carry no gold cost.
            expect(upg.cost).toBeUndefined();
        }
    });

    test('keeps stat IDs stable for back-compat with getPowerupStacks()', () => {
        // Guards against an accidental rename in a future refactor —
        // getPowerupStacks() keys off these IDs.
        expect(STATS.THORNS.id).toBe('THORNS');
        expect(STATS.HEALTH_BOOST.id).toBe('HEALTH_BOOST');
        expect(STATS.VAMPIRISM.id).toBe('VAMPIRISM');
        expect(STATS.DODGE.id).toBe('DODGE');
    });

    test('offensive traits are NOT passives anymore (per-weapon upgrades now)', () => {
        // 6.28.0 — Rapid Fire / Multi Shot / Explosive / Executioner /
        // Iron Will were removed from the passive pool.
        for (const id of ['RAPID_FIRE', 'MULTI_SHOT', 'EXPLOSIVE', 'EXECUTIONER', 'IRON_WILL']) {
            expect(STATS[id]).toBeUndefined();
        }
    });

    test('no passive carries a hidden flag (retired-reserved IDs are gone)', () => {
        for (const upg of Object.values(STATS)) {
            expect(upg.hidden).toBeFalsy();
        }
    });
});

// ---------------------------------------------------------------------------
// STAT_CARD_IDS — the ordered survivor-card draw pool
// ---------------------------------------------------------------------------

describe('STAT_CARD_IDS', () => {
    test('matches the STATS keys (every reward is a real passive)', () => {
        expect(Array.isArray(STAT_CARD_IDS)).toBe(true);
        expect(STAT_CARD_IDS.length).toBe(Object.keys(STATS).length);
        for (const id of STAT_CARD_IDS) {
            expect(STATS[id]).toBeDefined();
        }
    });
});

// ---------------------------------------------------------------------------
// getStats() iteration
// ---------------------------------------------------------------------------

describe('getStats() iteration', () => {
    test('returns an array of every non-hidden entry by default', () => {
        const visible = getStats();
        expect(Array.isArray(visible)).toBe(true);
        expect(visible.length).toBeGreaterThan(0);
        for (const upg of visible) {
            expect(upg.hidden).toBeFalsy();
        }
    });

    test('every returned upgrade has passive: true', () => {
        for (const upg of getStats({ includeHidden: true })) {
            expect(upg.passive).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Phase 2 — per-weapon HOMING / PIERCING upgrades
// ---------------------------------------------------------------------------

describe('Per-weapon HOMING / PIERCING (6.28.0 redesign)', () => {
    // 6.28.0 — all four kinetic primaries now get Homing AND Piercing as
    // shared-trait upgrades; Charge Shot gets both; Missile Salvo gets
    // pierce (its homing is innate).
    const HOMING_IDS = [
        ['PULSE_CANNON',  'PULSE_HOMING'],
        ['STORM_NEEDLES', 'NEEDLE_HOMING'],
        ['SCATTER_GUN',   'SCATTER_HOMING'],
        ['RAIL_DRIVER',   'RAIL_HOMING'],
        ['CHARGE_SHOT',   'CHARGE_HOMING'],
    ];
    const PIERCING_IDS = [
        ['PULSE_CANNON',  'PULSE_PIERCING'],
        ['STORM_NEEDLES', 'NEEDLE_PIERCING'],
        ['SCATTER_GUN',   'SCATTER_PIERCING'],
        ['RAIL_DRIVER',   'RAIL_PIERCING'],
        ['CHARGE_SHOT',   'CHARGE_PIERCING'],
        ['MISSILE_SALVO', 'MISSILE_PIERCING'],
    ];

    test.each(HOMING_IDS)('HOMING upgrade for %s is bound to weapon %s', (weaponId, upgId) => {
        const upg = PRIMARY_UPGRADES[upgId] || POWER_UPGRADES[upgId];
        expect(upg).toBeDefined();
        expect(upg.weapon).toBe(weaponId);
        expect(typeof upg.cost).toBe('number');
        expect(upg.cost).toBeGreaterThan(0);
        expect(upg.maxStacks).toBeGreaterThanOrEqual(2);
    });

    test.each(PIERCING_IDS)('PIERCING upgrade for %s is bound to weapon %s', (weaponId, upgId) => {
        const upg = PRIMARY_UPGRADES[upgId] || POWER_UPGRADES[upgId];
        expect(upg).toBeDefined();
        expect(upg.weapon).toBe(weaponId);
        expect(typeof upg.cost).toBe('number');
        expect(upg.cost).toBeGreaterThan(0);
        expect(upg.maxStacks).toBeGreaterThanOrEqual(2);
    });

    test('weapons that do NOT receive HOMING / PIERCING have no per-weapon upgrade', () => {
        // The beam / lobbed / area power weapons don't get seek or pierce.
        const noHomingWeapons = [
            'LANCE_BEAM', 'MINE_LAYER', 'NOVA_BLAST', 'LIGHTNING_ARC',
            'MISSILE_SALVO', 'CLUSTER_LAUNCHER',
        ];
        const noPiercingWeapons = [
            'LANCE_BEAM', 'MINE_LAYER', 'NOVA_BLAST', 'LIGHTNING_ARC',
            'CLUSTER_LAUNCHER',
        ];
        const allUpgrades = { ...PRIMARY_UPGRADES, ...POWER_UPGRADES };
        for (const weapon of noHomingWeapons) {
            const matches = Object.values(allUpgrades).filter(
                u => u.weapon === weapon && /HOMING$/.test(u.id)
            );
            expect(matches).toHaveLength(0);
        }
        for (const weapon of noPiercingWeapons) {
            const matches = Object.values(allUpgrades).filter(
                u => u.weapon === weapon && /PIERCING$/.test(u.id)
            );
            expect(matches).toHaveLength(0);
        }
    });
});
