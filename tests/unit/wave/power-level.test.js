// DIR-01 — Power Level (PWR) estimator (§14.1). These tests pin the
// estimator's authoritative contracts:
//   • a FRESH STARTER build reads ≈ PWR_REF (100) — the calibration anchor;
//   • the GEOMETRIC blend COMPRESSES one-dimensional builds — a glass-nuke
//     (huge offense, ~0 defense) does NOT out-PWR a balanced build despite
//     vastly higher raw offense (the §4.1 worked example);
//   • a "god" build strong on BOTH axes lands ≳ 2× a merely-designed build
//     (the multiplicative cross-term blow-up);
//   • divide-by-zero / NaN guards (shield=100%, zero fire-rate, missing
//     getters) all stay finite;
//   • monotonicity — adding offense raises PWR; adding survivability raises PWR.

import {
    computePWR,
    offense,
    survivability,
    utility,
    starterStub,
    calibrateKpwr,
    K_PWR,
    PWR_REF,
    SUSTAIN_WINDOW,
    KEYSTONE_W,
    MODULAR_W,
    BASE_U,
} from '../../../js/modules/wave/power-level.js';

// ── stub factory ─────────────────────────────────────────────────────────────
// A player-like object exposing the effective-stat getters computePWR reads.
// `over` overrides any field. Getters return what the REAL player getters do:
//   crit chance / crit damage / shield in PERCENT; damage / fireRate in raw
//   weapon units; health in HP. Direct fields (multishot, dodgeFrac, …) feed
//   the derived readers.
function makeStub(over = {}) {
    const o = {
        damage: 1.2,
        fireRateMs: 400,
        critChancePct: 8,
        critDamagePct: 200,
        maxHealth: 40,
        shieldPct: 15,
        regen: 0,
        maxEnergy: 100,
        lives: 4,
        multishotStacks: 0,
        pierceCount: 0,
        explosive: false,
        dodgeFrac: 0,
        lifestealFrac: 0,
        powerDPS: 1.0,
        abilityU: 0,
        passiveU: 0,
        ...over,
    };
    return {
        activePrimary: 'PULSE_CANNON',
        getEffectivePrimaryDamage: () => o.damage,
        getEffectivePrimaryFireRate: () => o.fireRateMs,
        getEffectiveCritChance: () => o.critChancePct,
        getEffectiveCritDamage: () => o.critDamagePct,
        getEffectiveMaxHealth: () => o.maxHealth,
        getEffectiveShield: () => o.shieldPct,
        getEffectiveRegen: () => o.regen,
        getPowerupStacks: () => 0,
        getItemAffixTotal: () => 0,
        hasPassive: () => false,
        maxEnergy: o.maxEnergy,
        lives: o.lives,
        multishotStacks: o.multishotStacks,
        pierceCount: o.pierceCount,
        explosive: o.explosive,
        dodgeFrac: o.dodgeFrac,
        lifestealFrac: o.lifestealFrac,
        powerDPS: o.powerDPS,
        abilityU: o.abilityU,
        passiveU: o.passiveU,
    };
}

// Canonical reference builds (mirroring tests/stress/build-model.mjs archetypes).
const STARTER = () => makeStub();

const BALANCED = () => makeStub({
    damage: 1.2 * 6, critChancePct: 30, critDamagePct: 260, multishotStacks: 1,
    pierceCount: 1, maxHealth: 40 * 4, shieldPct: 45, dodgeFrac: 0.20, lives: 4,
    lifestealFrac: 0.05, regen: 1, powerDPS: 8, abilityU: 4, passiveU: 4,
});

const CRIT_ASSASSIN = () => makeStub({
    damage: 1.2 * 14, critChancePct: 50, critDamagePct: 300, multishotStacks: 1,
    pierceCount: 1, maxHealth: 40 * 3, shieldPct: 40, dodgeFrac: 0.20, lives: 4,
    lifestealFrac: 0.10, regen: 1, powerDPS: 6, abilityU: 5, passiveU: 6,
});

// Glass nuke: enormous offense, fragile (1 life, base HP, base shield, no dodge).
const GLASS_NUKE = () => makeStub({
    damage: 1.2 * 30, critChancePct: 50, critDamagePct: 320, multishotStacks: 2,
    pierceCount: 2, maxHealth: 40, shieldPct: 15, dodgeFrac: 0, lives: 1,
    lifestealFrac: 0, regen: 0, powerDPS: 4, abilityU: 2, passiveU: 3,
});

// Synergy god: maxed on BOTH axes.
const SYNERGY_GOD = () => makeStub({
    damage: 1.2 * 40, critChancePct: 55, critDamagePct: 340, multishotStacks: 2,
    pierceCount: 2, maxHealth: 600, shieldPct: 75, dodgeFrac: 0.50, lives: 4,
    lifestealFrac: 0.25, regen: 2, powerDPS: 10, abilityU: 6, passiveU: 9,
});

describe('exported constants', () => {
    test('§14.1 blend weights and floor are as specified', () => {
        expect(PWR_REF).toBe(100);
        expect(SUSTAIN_WINDOW).toBe(4);
        expect(KEYSTONE_W).toBe(3);
        expect(MODULAR_W).toBe(1);
        expect(BASE_U).toBe(10);
    });

    test('K_PWR is the calibrated scale (~4.46) and reproducible', () => {
        expect(K_PWR).toBeGreaterThan(4.4);
        expect(K_PWR).toBeLessThan(4.5);
        // calibrateKpwr against the canonical starter reproduces it exactly.
        expect(calibrateKpwr(starterStub(), PWR_REF)).toBeCloseTo(K_PWR, 9);
    });
});

describe('calibration anchor — fresh starter ≈ 100', () => {
    test('starterStub() reads exactly PWR_REF', () => {
        expect(computePWR(starterStub())).toBe(100);
    });

    test('a plain {} player (all defaults) also reads ≈ 100', () => {
        // Every reader falls back to the starter default → same anchor.
        expect(computePWR({})).toBe(100);
    });

    test('the local STARTER stub matches within a few points', () => {
        expect(computePWR(STARTER())).toBeGreaterThanOrEqual(96);
        expect(computePWR(STARTER())).toBeLessThanOrEqual(104);
    });

    test('starter sub-scores match the §14.1 worked numbers', () => {
        const s = starterStub();
        // O = 1.2 · 2.5 · 1 · (1 + 0.08·(2−1)) · 1 + 0.6·1.0 = 3.84
        expect(offense(s)).toBeCloseTo(3.84, 5);
        // S = 40 / (1−0.15) / (1−0) · 4 = 188.235…
        expect(survivability(s)).toBeCloseTo(188.2353, 3);
        // U = 10 + 0 + 0 + (100/12·2 + 100/50) = 28.666…
        expect(utility(s)).toBeCloseTo(28.6667, 3);
    });
});

describe('geometric blend COMPRESSES one-dimensional builds (§4.1)', () => {
    test('glass nuke has vastly higher offense than the balanced build', () => {
        // The premise of the worked example: raw offense is wildly lopsided.
        expect(offense(GLASS_NUKE())).toBeGreaterThan(10 * offense(BALANCED()));
    });

    test('…yet does NOT out-PWR the balanced build', () => {
        const nuke = computePWR(GLASS_NUKE());
        const balanced = computePWR(BALANCED());
        expect(nuke).toBeLessThanOrEqual(balanced);
    });

    test('…and does NOT out-PWR the designed crit-assassin either', () => {
        expect(computePWR(GLASS_NUKE())).toBeLessThan(computePWR(CRIT_ASSASSIN()));
    });

    test('a pure-tank (huge S, tiny O) is likewise compressed below balanced', () => {
        const tank = makeStub({
            damage: 1.2 * 1.5, critChancePct: 15, critDamagePct: 220,
            maxHealth: 40 * 9.75, shieldPct: 75, dodgeFrac: 0.50, lives: 4,
            regen: 2, lifestealFrac: 0.05, powerDPS: 2, abilityU: 3, passiveU: 4,
        });
        // Far higher survivability than balanced…
        expect(survivability(tank)).toBeGreaterThan(5 * survivability(BALANCED()));
        // …but lower PWR (one-axis build, offense-starved → blend compresses it).
        expect(computePWR(tank)).toBeLessThan(computePWR(BALANCED()));
    });
});

describe('cross-term — a god build ≳ 2× a designed build', () => {
    test('synergy god ≥ 2× the crit-assassin', () => {
        expect(computePWR(SYNERGY_GOD())).toBeGreaterThanOrEqual(2 * computePWR(CRIT_ASSASSIN()));
    });

    test('synergy god ≥ 2× the balanced build', () => {
        expect(computePWR(SYNERGY_GOD())).toBeGreaterThanOrEqual(2 * computePWR(BALANCED()));
    });

    test('synergy god dwarfs the glass nuke despite comparable offense', () => {
        // Comparable raw offense, but the god is strong on S+U too → blow-up.
        expect(computePWR(SYNERGY_GOD())).toBeGreaterThan(4 * computePWR(GLASS_NUKE()));
    });
});

describe('divide-by-zero / NaN guards — never throw, never NaN', () => {
    const cases = {
        'null': null,
        'undefined': undefined,
        'empty object': {},
        'shield = 100% (would /0 in EHP)': { getEffectiveShield: () => 100 },
        'shield > 100%': { getEffectiveShield: () => 250 },
        'dodge = 100%': { dodgeFrac: 1 },
        'zero fire-rate (would /0 in sps)': { getEffectivePrimaryFireRate: () => 0 },
        'negative fire-rate': { getEffectivePrimaryFireRate: () => -50 },
        'zero max health': { getEffectiveMaxHealth: () => 0 },
        'NaN getters': {
            getEffectivePrimaryDamage: () => NaN,
            getEffectiveCritChance: () => NaN,
            getEffectiveMaxHealth: () => NaN,
            getEffectiveShield: () => NaN,
        },
        'getters throw-free missing (partial stub)': { getEffectiveCritChance: () => 25 },
        'maxEnergy zero': { maxEnergy: 0 },
        'negative lives': { lives: -3 },
    };

    for (const [label, player] of Object.entries(cases)) {
        test(`computePWR is a finite non-negative integer for: ${label}`, () => {
            expect(() => computePWR(player)).not.toThrow();
            const v = computePWR(player);
            expect(Number.isFinite(v)).toBe(true);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
        });
    }

    test('sub-scores stay positive & finite under shield=100% / fireRate=0', () => {
        const p = { getEffectiveShield: () => 100, getEffectivePrimaryFireRate: () => 0 };
        expect(Number.isFinite(offense(p))).toBe(true);
        expect(offense(p)).toBeGreaterThan(0);
        expect(Number.isFinite(survivability(p))).toBe(true);
        expect(survivability(p)).toBeGreaterThan(0);
        expect(Number.isFinite(utility(p))).toBe(true);
        expect(utility(p)).toBeGreaterThan(0);
    });
});

describe('monotonicity', () => {
    test('adding offense (more damage) raises PWR', () => {
        const base = computePWR(makeStub());
        const more = computePWR(makeStub({ damage: 1.2 * 3 }));
        expect(more).toBeGreaterThan(base);
    });

    test('faster fire-rate (shorter interval) raises PWR', () => {
        const base = computePWR(makeStub());
        const faster = computePWR(makeStub({ fireRateMs: 200 }));
        expect(faster).toBeGreaterThan(base);
    });

    test('more multishot raises PWR', () => {
        const base = computePWR(makeStub());
        const more = computePWR(makeStub({ multishotStacks: 3 }));
        expect(more).toBeGreaterThan(base);
    });

    test('adding survivability (more max HP) raises PWR', () => {
        const base = computePWR(makeStub());
        const tankier = computePWR(makeStub({ maxHealth: 200 }));
        expect(tankier).toBeGreaterThan(base);
    });

    test('more shield raises PWR', () => {
        const base = computePWR(makeStub());
        const shielded = computePWR(makeStub({ shieldPct: 60 }));
        expect(shielded).toBeGreaterThan(base);
    });

    test('more dodge raises PWR', () => {
        const base = computePWR(makeStub());
        const dodgy = computePWR(makeStub({ dodgeFrac: 0.4 }));
        expect(dodgy).toBeGreaterThan(base);
    });

    test('adding utility (an active keystone passive) raises PWR', () => {
        const base = computePWR(makeStub());
        const withKeystone = computePWR(makeStub({ passiveU: KEYSTONE_W }));
        expect(withKeystone).toBeGreaterThan(base);
    });

    test('a keystone passive raises PWR more than a modular one', () => {
        const modular = computePWR(makeStub({ passiveU: MODULAR_W }));
        const keystone = computePWR(makeStub({ passiveU: KEYSTONE_W }));
        expect(keystone).toBeGreaterThan(modular);
    });
});

describe('passive utility via live activePassives + PASSIVES map', () => {
    test('a keystone in activePassives weights KEYSTONE_W; modular weights MODULAR_W', () => {
        const PASSIVES = {
            BIG_KEYSTONE: { tags: ['keystone', 'offense'] },
            SMALL_MODULAR: { tags: ['offense'] },
        };
        const onlyKeystone = computePWR(makeStub({
            // override passiveU by NOT setting it, instead provide the live path
        }));
        // Build two stubs that read the live activePassives path (passiveU unset).
        const base = { ...makeStub() };
        delete base.passiveU;

        const keystonePlayer = { ...base, PASSIVES, activePassives: new Set(['BIG_KEYSTONE']) };
        const modularPlayer = { ...base, PASSIVES, activePassives: new Set(['SMALL_MODULAR']) };

        expect(utility(keystonePlayer)).toBeGreaterThan(utility(modularPlayer));
        // keystone contributes KEYSTONE_W (3) vs modular MODULAR_W (1).
        expect(utility(keystonePlayer) - utility(modularPlayer)).toBeCloseTo(KEYSTONE_W - MODULAR_W, 6);
        expect(onlyKeystone).toBeGreaterThan(0);
    });
});

describe('ability utility via live equippedAbilities + ABILITIES map', () => {
    test('equipped abilities contribute Σ potency/sqrt(cooldownSec)', () => {
        const ABILITIES = {
            BULWARK: { cooldown: 20000, damageReduction: 0.5 },
        };
        const base = { ...makeStub() };
        delete base.abilityU;
        const withAbility = {
            ...base,
            ABILITIES,
            equippedAbilities: ['BULWARK', null, null, null],
        };
        const withoutAbility = { ...base, ABILITIES, equippedAbilities: [null, null, null, null] };
        expect(utility(withAbility)).toBeGreaterThan(utility(withoutAbility));
    });
});
