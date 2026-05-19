/**
 * tests/unit/passive-upgrades.test.js — Phase 1 (2026-05-19)
 *
 * Verifies the new PASSIVE_UPGRADES export in weapon-data.js. PASSIVE
 * is the fourth upgrade category alongside PRIMARY / POWER / SKILL —
 * always-on, weapon-agnostic, skill-agnostic.
 *
 * Acceptance criteria (from the plan doc):
 *   - PASSIVE_UPGRADES exports correctly
 *   - All expected IDs are present
 *   - getPassiveUpgrades() iterates and filters hidden entries
 *   - Each entry has the minimum shape required by the shop builder
 *     (id, name, description, cost, maxStacks, icon, passive: true)
 *
 * weapon-data.js is a pure module with no browser dependencies, so no
 * shims are needed.
 */

import {
    PASSIVE_UPGRADES,
    getPassiveUpgrades,
    PRIMARY_UPGRADES,
    POWER_UPGRADES,
} from '../../js/modules/combat/weapon-data.js';

// ---------------------------------------------------------------------------
// PASSIVE_UPGRADES export
// ---------------------------------------------------------------------------

describe('PASSIVE_UPGRADES (Phase 1 — 2026-05-19)', () => {
    test('is exported as an object', () => {
        expect(PASSIVE_UPGRADES).toBeDefined();
        expect(typeof PASSIVE_UPGRADES).toBe('object');
        expect(PASSIVE_UPGRADES).not.toBeNull();
    });

    // The plan-doc list of IDs that must live in PASSIVE.
    const EXPECTED_PASSIVE_IDS = [
        // Offensive passives
        'RAPID_FIRE', 'MULTI_SHOT', 'CRIT_CHANCE', 'CRIT_DAMAGE',
        'EXPLOSIVE', 'EXECUTIONER',
        // Defensive passives
        'HEALTH_BOOST', 'SHIELD_BOOST', 'VAMPIRISM', 'THORNS', 'IRON_WILL',
        // Retired-but-reserved
        'SPEED_BOOST', 'LONG_RANGE', 'SPARE_SHIP',
    ];

    test.each(EXPECTED_PASSIVE_IDS)('contains expected ID %s', (id) => {
        expect(PASSIVE_UPGRADES[id]).toBeDefined();
        expect(PASSIVE_UPGRADES[id].id).toBe(id);
    });

    test('every entry has the minimum required shape', () => {
        for (const [key, upg] of Object.entries(PASSIVE_UPGRADES)) {
            expect(upg.id).toBe(key);                          // key matches id
            expect(typeof upg.name).toBe('string');
            expect(upg.name.length).toBeGreaterThan(0);
            expect(typeof upg.description).toBe('string');
            expect(typeof upg.cost).toBe('number');
            expect(upg.cost).toBeGreaterThanOrEqual(0);
            expect(typeof upg.maxStacks).toBe('number');
            expect(upg.maxStacks).toBeGreaterThanOrEqual(1);
            expect(upg.passive).toBe(true);
            expect(typeof upg.icon).toBe('string');
        }
    });

    test('keeps IDs UNCHANGED (no rename) for back-compat with getPowerupStacks()', () => {
        // The plan locks in: "Keep the IDs themselves UNCHANGED — only
        // the category they live in changes." This guards against an
        // accidental rename in a future refactor.
        const id = PASSIVE_UPGRADES.THORNS.id;
        expect(id).toBe('THORNS');
        expect(PASSIVE_UPGRADES.HEALTH_BOOST.id).toBe('HEALTH_BOOST');
        expect(PASSIVE_UPGRADES.VAMPIRISM.id).toBe('VAMPIRISM');
        expect(PASSIVE_UPGRADES.RAPID_FIRE.id).toBe('RAPID_FIRE');
    });

    test('retired IDs (SPEED_BOOST / LONG_RANGE / SPARE_SHIP) are marked hidden', () => {
        // These IDs are reserved for future restoration; the shop
        // browse path filters them via `cfg.hidden`.
        expect(PASSIVE_UPGRADES.SPEED_BOOST.hidden).toBe(true);
        expect(PASSIVE_UPGRADES.LONG_RANGE.hidden).toBe(true);
        expect(PASSIVE_UPGRADES.SPARE_SHIP.hidden).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getPassiveUpgrades() iteration
// ---------------------------------------------------------------------------

describe('getPassiveUpgrades() iteration', () => {
    test('returns an array of every non-hidden entry by default', () => {
        const visible = getPassiveUpgrades();
        expect(Array.isArray(visible)).toBe(true);
        expect(visible.length).toBeGreaterThan(0);
        // No hidden entries surface by default.
        for (const upg of visible) {
            expect(upg.hidden).toBeFalsy();
        }
    });

    test('respects { includeHidden: true } and surfaces retired IDs', () => {
        const all = getPassiveUpgrades({ includeHidden: true });
        const ids = all.map(u => u.id);
        expect(ids).toEqual(expect.arrayContaining([
            'SPEED_BOOST', 'LONG_RANGE', 'SPARE_SHIP',
        ]));
    });

    test('every returned upgrade has passive: true', () => {
        for (const upg of getPassiveUpgrades({ includeHidden: true })) {
            expect(upg.passive).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Phase 2 — per-weapon HOMING / PIERCING upgrades
// ---------------------------------------------------------------------------

describe('Per-weapon HOMING / PIERCING (Phase 2 — 2026-05-19)', () => {
    // Applicability matrix from the plan doc + user spec.
    const HOMING_IDS = [
        ['PULSE_CANNON',  'PULSE_HOMING'],
        ['STORM_NEEDLES', 'NEEDLE_HOMING'],
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
        // From the plan's applicability matrix.
        const noHomingWeapons = [
            'SCATTER_GUN', 'RAIL_DRIVER', 'LANCE_BEAM', 'MINE_LAYER',
            'NOVA_BLAST', 'LIGHTNING_ARC',
        ];
        const noPiercingWeapons = [
            'LANCE_BEAM', 'MINE_LAYER', 'NOVA_BLAST', 'LIGHTNING_ARC',
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
