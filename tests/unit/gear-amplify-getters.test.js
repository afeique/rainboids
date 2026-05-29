// T26 — gear amplification folded into the effective-stat getters (§2.1).
//
// Verifies the contract: equipped gear affixes `{ stat, pct }` AMPLIFY the
// invested SP for that stat (never flat), ramped by the per-run level —
//   effective = SP_value × (1 + ampPct × levelRamp(level))
// so gear is DORMANT at level 1, reaches FULL strength at LEVEL_SOFTCAP, and
// amplifies NOTHING for a stat with no invested SP. Exercised through the real
// progression getters (getEffectiveMaxHealth / getEffectiveShield) and the
// player-facing getSpStatValue (spStatTotal), which external consumers
// (combat-manager THORNS/VAMPIRISM, lifecycle DODGE, power-level) inherit.

import * as progression from '../../js/modules/player/progression.js';
import { LEVEL_SOFTCAP } from '../../js/modules/core/gear-scaling.js';

// Minimal player stub matching how the getters read state.
function makePlayer({ spStats = {}, equippedItems = {}, level = 1 } = {}) {
    return {
        maxHealth: 40,
        shield: 15,
        spStats,
        equippedItems,
        level,
        getPowerupStacks: () => 0,
        getPassiveMod: () => 0,
        getPassiveMaxHpMult: () => 1,
    };
}

// One gear item carrying a single `{ stat, pct }` amplifier affix.
function gear(stat, pct) {
    return { affixes: [{ stat, pct }] };
}

describe('T26 — gear amplifies invested SP, level-ramped', () => {
    // HEALTH SP: 10 pts × (400/20) = 200 raw max-HP from SP.
    const spHealth10 = { HEALTH: 5 };

    test('level 1 → gear DORMANT (levelRamp 0): effective = raw SP only', () => {
        const p = makePlayer({
            spStats: spHealth10,
            equippedItems: { hull: gear('HEALTH', 50) }, // +50% HEALTH amp
            level: 1,
        });
        // base 40 + SP 200 × (1 + 0.5×0) = 240
        expect(progression.getEffectiveMaxHealth.call(p)).toBe(240);
    });

    test('level LEVEL_SOFTCAP → gear at FULL strength (levelRamp 1)', () => {
        const p = makePlayer({
            spStats: spHealth10,
            equippedItems: { hull: gear('HEALTH', 50) },
            level: LEVEL_SOFTCAP,
        });
        // base 40 + SP 200 × (1 + 0.5×1) = 40 + 300 = 340
        expect(progression.getEffectiveMaxHealth.call(p)).toBe(340);
    });

    test('no invested SP → gear amplifies NOTHING (amplifySP(0,…)=0)', () => {
        const p = makePlayer({
            spStats: { HEALTH: 0 },
            equippedItems: { hull: gear('HEALTH', 80) },
            level: LEVEL_SOFTCAP,
        });
        // base 40 + SP 0 × (1+0.8) = 40
        expect(progression.getEffectiveMaxHealth.call(p)).toBe(40);
    });

    test('amp stacks across multiple equipped affixes on the same stat', () => {
        const p = makePlayer({
            spStats: { TOUGHNESS: 4 }, // 4 × (50/10) = 20 raw % DR (8.29.0 cap=10)
            equippedItems: {
                a: gear('TOUGHNESS', 30),
                b: gear('TOUGHNESS', 20), // total +50% amp
            },
            level: LEVEL_SOFTCAP,
        });
        // base shield 15 + SP 20 × (1 + 0.5) = 15 + 30 = 45 (< 75 cap)
        expect(progression.getEffectiveShield.call(p)).toBe(45);
    });

    test('a different stat is unaffected by the gear amp (stat-scoped)', () => {
        const p = makePlayer({
            spStats: { HEALTH: 5 },
            equippedItems: { hull: gear('CRIT_CHANCE', 90) }, // amps CRIT, not HEALTH
            level: LEVEL_SOFTCAP,
        });
        // HEALTH gets no amp from a CRIT affix → 40 + 200 = 240
        expect(progression.getEffectiveMaxHealth.call(p)).toBe(240);
    });

    test('getSpStatValue (external consumers) returns the gear-amplified value', () => {
        const p = makePlayer({
            spStats: { THORNS: 5 }, // 5 × (100/10) = 50 raw % (8.29.0 cap=10)
            equippedItems: { a: gear('THORNS', 40) }, // +40% amp
            level: LEVEL_SOFTCAP,
        });
        // 50 × (1 + 0.4) = 70
        expect(progression.spStatTotal.call(p, 'THORNS')).toBeCloseTo(70, 6);
    });
});

describe('T28 — socketed Matrices amplify SP stats (+ resonance)', () => {
    // vital@hull@t1 = +12% HEALTH; vital@cockpit@t1 = +8% HEALTH.
    const spHealth10 = { HEALTH: 5 }; // 200 raw max-HP from SP

    test('a socketed Matrix adds its per-slot %-amp to the stat', () => {
        const p = makePlayer({
            spStats: spHealth10,
            equippedItems: { hull: { slot: 'hull', affixes: [], matrix: { id: 'vital', tier: 1 } } },
            level: LEVEL_SOFTCAP,
        });
        // +12% HEALTH → 200 × 1.12 = 224 → base 40 = 264
        expect(progression.getEffectiveMaxHealth.call(p)).toBe(40 + 224);
    });

    test('Matrix amp stacks with gear affix amp on the same stat', () => {
        const p = makePlayer({
            spStats: spHealth10,
            equippedItems: {
                hull: { slot: 'hull', affixes: [{ stat: 'HEALTH', pct: 8 }], matrix: { id: 'vital', tier: 1 } },
            },
            level: LEVEL_SOFTCAP,
        });
        // affix +8% + matrix +12% = +20% → 200 × 1.20 = 240 → base 40 = 280
        expect(progression.getEffectiveMaxHealth.call(p)).toBe(40 + 240);
    });

    test('resonance: 2 pieces of the same Matrix add a flat +3% to each line', () => {
        const p = makePlayer({
            spStats: spHealth10,
            equippedItems: {
                cockpit: { slot: 'cockpit', affixes: [], matrix: { id: 'vital', tier: 1 } },
                hull:    { slot: 'hull',    affixes: [], matrix: { id: 'vital', tier: 1 } },
            },
            level: LEVEL_SOFTCAP,
        });
        // cockpit 8+3, hull 12+3 = 26% → 200 × 1.26 = 252 → base 40 = 292
        expect(progression.getEffectiveMaxHealth.call(p)).toBe(40 + 252);
    });

    test('an empty socket contributes nothing (matrix amp only when filled)', () => {
        const p = makePlayer({
            spStats: spHealth10,
            equippedItems: { hull: { slot: 'hull', affixes: [], sockets: 1 } }, // no matrix
            level: LEVEL_SOFTCAP,
        });
        expect(progression.getEffectiveMaxHealth.call(p)).toBe(40 + 200);
    });
});
