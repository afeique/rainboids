// CD-04 (T2) — sustain powerups: REGENERATOR + LIFE_ON_KILL. Both tie to systems
// already shipped (the regen ceiling + the on-kill heal hook) and the headline
// guarantee is DEFAULT-SAFE:
//   • REGENERATOR raises the effective-regen ceiling 3.0 → 5.0 HP/s while held,
//     read as a gated cap in progression.getEffectiveRegen. Without the powerup
//     the cap stays the existing 3.0 — byte-for-byte as before.
//   • LIFE_ON_KILL heals a small FLAT amount per kill while held; the on-kill
//     heal is gated on getPowerupStacks('LIFE_ON_KILL') > 0 in
//     combat-manager.onEnemyKill, so a non-holder does zero extra work.
// This suite isolates the regen-cap conditional with a stubbed player and
// asserts the two POWERUP_TYPES entries exist with sane fields.
import { describe, expect, test } from '@jest/globals';
import * as progression from '../../js/modules/player/progression.js';
import { POWERUP_TYPES } from '../../js/modules/world/powerup.js';
import { LIFE_ON_KILL_HEAL } from '../../js/modules/combat/combat-manager.js';

// Minimal player stub matching how getEffectiveRegen reads state. `regen` sources
// are funneled through item-affix regen (a clean single dial >3 HP/s), and the
// REGENERATOR powerup is toggled via getPowerupStacks so the cap path is isolated.
function makePlayer({ hasRegenerator = false, itemRegen = 0, regenStacks = 0 } = {}) {
    return {
        getPowerupStacks: (id) => {
            if (id === 'REGEN') return regenStacks;
            if (id === 'REGENERATOR') return hasRegenerator ? 1 : 0;
            return 0;
        },
        getItemAffixTotal: (key) => (key === 'regen' ? itemRegen : 0),
        // no getPassiveMod / spStats → _passiveMod + _spVal contribute 0
    };
}

describe('CD-04 — POWERUP_TYPES entries (REGENERATOR + LIFE_ON_KILL)', () => {
    test('REGENERATOR exists with a sane shape', () => {
        const e = POWERUP_TYPES.REGENERATOR;
        expect(e).toBeTruthy();
        expect(e.displayName).toBe('Regenerator');
        expect(typeof e.description).toBe('string');
        expect(e.description.length).toBeGreaterThan(0);
        expect(typeof e.color).toBe('string');
        expect(typeof e.icon).toBe('string');
        expect(e.category).toBe('DEFENSE');
        expect(e.maxStacks).toBeGreaterThanOrEqual(1);
        expect(typeof e.rarity).toBe('number');
        expect(e.duration).toBeGreaterThan(0);
    });

    test('LIFE_ON_KILL exists with a sane shape', () => {
        const e = POWERUP_TYPES.LIFE_ON_KILL;
        expect(e).toBeTruthy();
        expect(e.displayName).toBe('Life on Kill');
        expect(typeof e.description).toBe('string');
        expect(e.description.length).toBeGreaterThan(0);
        expect(typeof e.color).toBe('string');
        expect(typeof e.icon).toBe('string');
        expect(e.category).toBe('DEFENSE');
        expect(e.maxStacks).toBeGreaterThanOrEqual(1);
        expect(typeof e.rarity).toBe('number');
        expect(e.duration).toBeGreaterThan(0);
    });

    test('LIFE_ON_KILL_HEAL is a small positive flat amount (2–3 HP)', () => {
        expect(LIFE_ON_KILL_HEAL).toBeGreaterThanOrEqual(2);
        expect(LIFE_ON_KILL_HEAL).toBeLessThanOrEqual(3);
    });
});

describe('CD-04 — REGENERATOR raises the regen cap (getEffectiveRegen)', () => {
    test('DEFAULT-SAFE: no REGENERATOR → capped at 3.0 even with regen sources >3', () => {
        // 10 HP/s of item regen, no powerup → must clamp to the base 3.0 cap.
        const p = makePlayer({ hasRegenerator: false, itemRegen: 10 });
        expect(progression.getEffectiveRegen.call(p)).toBe(3.0);
    });

    test('BOOSTED: REGENERATOR held → cap rises to 5.0, regen can reach 5', () => {
        // 10 HP/s of item regen + the powerup → clamps to the boosted 5.0 cap.
        const p = makePlayer({ hasRegenerator: true, itemRegen: 10 });
        expect(progression.getEffectiveRegen.call(p)).toBe(5.0);
    });

    test('BOOSTED but below the new cap → not clamped (returns the raw regen)', () => {
        // 4 HP/s item regen + 0.5 baseline = 4.5; REGENERATOR raises the cap to
        // 5 → 4.5 passes through un-clamped.
        const p = makePlayer({ hasRegenerator: true, itemRegen: 4 });
        expect(progression.getEffectiveRegen.call(p)).toBe(4.5);
    });

    test('DEFAULT-SAFE: 4 HP/s without the powerup still clamps to 3.0', () => {
        const p = makePlayer({ hasRegenerator: false, itemRegen: 4 });
        expect(progression.getEffectiveRegen.call(p)).toBe(3.0);
    });
});
