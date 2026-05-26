// Energy-synergy powerups — SURGE_BATTERY + FLUX.
//
//   • SURGE_BATTERY (1-stack) — the FIRST power weapon each wave costs 0 energy;
//     recharges at wave start. (Cost zero-out + per-wave recharge are exercised in
//     the live game by tests/qa/43-energy-powerups.spec.js.)
//   • FLUX — each power cast grants a stacking +energy-regen buff that fades when
//     casting stops. The per-stack regen bonus is applied in
//     getEffectiveEnergyRegenMult; the fade window is FLUX_WINDOW_MS.
//
// This unit suite validates the two POWERUP_TYPES entries (sane fields), the
// getEffectiveEnergyRegenMult Flux bonus (DEFAULT-SAFE: 0 stacks → 1 + REACTOR%
// only; with stacks → adds stacks × FLUX_PER_STACK, full → +FLUX_MAX × PER), and a
// pure model of the Flux window-expiry decay.
import * as progression from '../../js/modules/player/progression.js';
import { POWERUP_TYPES } from '../../js/modules/world/powerup.js';
import { SP_STATS, SP_STAT_MAX_POINTS } from '../../js/modules/core/sp-stats.js';
import { FLUX_PER_STACK, FLUX_MAX_STACKS, FLUX_WINDOW_MS } from '../../js/modules/core/constants.js';

const FULL = SP_STAT_MAX_POINTS; // 20 — a fully-invested stat

// Minimal player stub matching how progression getters read state.
function makePlayer({ spStats = {}, fluxStacks = 0 } = {}) {
    return {
        maxEnergy: 100,
        energy: 0,
        _fluxStacks: fluxStacks,
        spStats: { ...Object.fromEntries(SP_STATS.map((s) => [s.id, 0])), ...spStats },
    };
}

describe('POWERUP_TYPES — SURGE_BATTERY + FLUX entries', () => {
    test('SURGE_BATTERY exists with sane fields', () => {
        const p = POWERUP_TYPES.SURGE_BATTERY;
        expect(p).toBeDefined();
        expect(p.effect).toBe('surgeBattery');
        expect(p.maxStacks).toBe(1); // 1-stack per spec
        expect(p.category).toBe('OFFENSE');
        expect(p.icon).toBe('bolt'); // energy/bolt icon
        expect(typeof p.description).toBe('string');
        expect(p.description.length).toBeGreaterThan(0);
        expect(typeof p.color).toBe('string');
        expect(Array.isArray(p.gradientColors)).toBe(true);
    });

    test('FLUX exists with sane fields', () => {
        const p = POWERUP_TYPES.FLUX;
        expect(p).toBeDefined();
        expect(p.effect).toBe('flux');
        expect(p.category).toBe('OFFENSE');
        expect(p.icon).toBe('bolt'); // energy/bolt icon
        expect(typeof p.description).toBe('string');
        expect(p.description.length).toBeGreaterThan(0);
        expect(typeof p.color).toBe('string');
        expect(Array.isArray(p.gradientColors)).toBe(true);
        expect(p.maxStacks).toBeGreaterThanOrEqual(1);
    });
});

describe('FLUX consts', () => {
    test('sane defaults', () => {
        expect(FLUX_PER_STACK).toBeGreaterThan(0);
        expect(FLUX_MAX_STACKS).toBeGreaterThanOrEqual(1);
        expect(FLUX_WINDOW_MS).toBe(4000); // "fades in 4s"
    });
});

describe('getEffectiveEnergyRegenMult — FLUX bonus (DEFAULT-SAFE)', () => {
    test('default-safe: 0 Flux stacks, 0 REACTOR → 1 (byte-for-byte)', () => {
        expect(progression.getEffectiveEnergyRegenMult.call(makePlayer())).toBe(1);
    });

    test('default-safe: 0 Flux stacks → 1 + REACTOR% only (Flux is +0)', () => {
        // 10 REACTOR pts → +0.5; no Flux → still exactly 1.5.
        expect(progression.getEffectiveEnergyRegenMult.call(
            makePlayer({ spStats: { REACTOR: 10 } }))).toBe(1.5);
    });

    test('with Flux stacks → adds stacks × FLUX_PER_STACK on top of REACTOR', () => {
        // 1 stack → +FLUX_PER_STACK over baseline (no REACTOR).
        expect(progression.getEffectiveEnergyRegenMult.call(
            makePlayer({ fluxStacks: 1 }))).toBeCloseTo(1 + FLUX_PER_STACK, 10);
        // 3 stacks atop full REACTOR (×2 base) → 2 + 3 × PER.
        expect(progression.getEffectiveEnergyRegenMult.call(
            makePlayer({ spStats: { REACTOR: FULL }, fluxStacks: 3 })))
            .toBeCloseTo(2 + 3 * FLUX_PER_STACK, 10);
    });

    test('full Flux ramp → +FLUX_MAX_STACKS × FLUX_PER_STACK', () => {
        expect(progression.getEffectiveEnergyRegenMult.call(
            makePlayer({ fluxStacks: FLUX_MAX_STACKS })))
            .toBeCloseTo(1 + FLUX_MAX_STACKS * FLUX_PER_STACK, 10);
    });

    test('missing _fluxStacks (legacy player) is treated as 0 — default-safe', () => {
        const p = makePlayer();
        delete p._fluxStacks; // simulate a player constructed before the field existed
        expect(progression.getEffectiveEnergyRegenMult.call(p)).toBe(1);
    });
});

// Pure model of the player.update Flux decay: the whole ramp fades to 0 once the
// FLUX_WINDOW_MS window elapses with no fresh cast. Mirrors the gated block in
// player.js (no work at 0 stacks; reset to 0 past the window).
function fluxDecayStep(stacks, refreshMs, now, windowMs = FLUX_WINDOW_MS) {
    if (stacks > 0 && now - (refreshMs || 0) > windowMs) return 0;
    return stacks;
}

describe('FLUX decay — window expiry (pure model)', () => {
    test('within the window: stacks persist', () => {
        expect(fluxDecayStep(3, 1000, 1000 + FLUX_WINDOW_MS - 1)).toBe(3);
        expect(fluxDecayStep(3, 1000, 1000)).toBe(3); // same frame as the cast
    });

    test('past the window: the whole ramp fades to 0', () => {
        expect(fluxDecayStep(3, 1000, 1000 + FLUX_WINDOW_MS + 1)).toBe(0);
        expect(fluxDecayStep(FLUX_MAX_STACKS, 0, FLUX_WINDOW_MS + 1)).toBe(0);
    });

    test('0 stacks is a no-op regardless of elapsed time (default-safe)', () => {
        expect(fluxDecayStep(0, 0, 1e9)).toBe(0);
    });
});
