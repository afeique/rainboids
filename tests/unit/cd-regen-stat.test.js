// CD sustain axis (CD-08) — the REGENERATION SP stat.
// A permanent passive HP-regen source that feeds getEffectiveRegen alongside
// the REGEN powerup + item affixes, sharing the same combat-gated 3 HP/s
// ceiling. Headline guarantee is DEFAULT-SAFE: 0 points → no regen contribution,
// so out-of-combat healing behaves exactly as before.
import * as progression from '../../js/modules/player/progression.js';
import { spStatValue, SP_STATS, SP_STAT_MAX_POINTS } from '../../js/modules/core/sp-stats.js';

const FULL = SP_STAT_MAX_POINTS; // 20 — a fully-invested stat

// Minimal player stub matching how getEffectiveRegen reads state. No REGEN
// powerup, no item regen affixes, no passive mods → regen comes only from the
// REGENERATION SP stat, so the stat's contribution is isolated.
function makePlayer(spStats = {}, { regenStacks = 0, itemRegen = 0 } = {}) {
    return {
        getPowerupStacks: (id) => (id === 'REGEN' ? regenStacks : 0),
        getItemAffixTotal: (key) => (key === 'regen' ? itemRegen : 0),
        // no getPassiveMod → _passiveMod returns 0
        spStats: { ...Object.fromEntries(SP_STATS.map((s) => [s.id, 0])), ...spStats },
    };
}

describe('CD-08 — REGENERATION stat definition', () => {
    test('spStatValue: 0 → 0, full → +2 HP/s', () => {
        expect(spStatValue('REGENERATION', 0)).toBe(0);
        expect(spStatValue('REGENERATION', FULL)).toBe(2);
    });

    test('surfaced in SP_STATS with the right cap/icon', () => {
        const def = SP_STATS.find((s) => s.id === 'REGENERATION');
        expect(def).toBeTruthy();
        expect(def.max).toBe(2);
        expect(def.icon).toBe('sparkle');
        expect(typeof def.label).toBe('function');
    });

    test('scales linearly with points (5 pts → +1 HP/s, half the 10-pt cap)', () => {
        expect(spStatValue('REGENERATION', 5)).toBe(1);
    });
});

describe('CD-08 — getEffectiveRegen folds in the REGENERATION stat', () => {
    // 6.x — every player has a 0.5 HP/s BASELINE passive regen; the stat /
    // powerups / items stack on top of it.
    const BASE = 0.5;
    test('baseline-only: 0 pts + no powerups/items → 0.5 HP/s baseline', () => {
        expect(progression.getEffectiveRegen.call(makePlayer())).toBe(BASE);
    });

    test('full REGENERATION + baseline → 2.5 HP/s', () => {
        expect(progression.getEffectiveRegen.call(makePlayer({ REGENERATION: FULL }))).toBe(2 + BASE);
    });

    test('partial REGENERATION (5 pts, half the 10-pt cap) + baseline → 1.5 HP/s', () => {
        expect(progression.getEffectiveRegen.call(makePlayer({ REGENERATION: 5 }))).toBe(1 + BASE);
    });

    test('stacks with the REGEN powerup, sharing the 3 HP/s cap', () => {
        // baseline 0.5 + REGENERATION 2 + 4× REGEN powerup (2.0) = 4.5 → capped at 3.0.
        const p = makePlayer({ REGENERATION: FULL }, { regenStacks: 4 });
        expect(progression.getEffectiveRegen.call(p)).toBe(3);
    });

    test('the REGENERATION stat adds nothing when un-allocated (baseline + powerup only)', () => {
        // baseline 0.5 + 2× REGEN powerup (1.0) = 1.5; 0 REGENERATION adds nothing.
        const p = makePlayer({ REGENERATION: 0 }, { regenStacks: 2 });
        expect(progression.getEffectiveRegen.call(p)).toBe(1 + BASE);
    });
});
