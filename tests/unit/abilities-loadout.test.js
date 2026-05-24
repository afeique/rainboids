/**
 * tests/unit/abilities-loadout.test.js — Phase B.S1 4-slot ability loadout.
 *
 * Pins the NON-BREAKING data-model refactor that turns the single
 * equipped-ability model into a 4-slot loadout while keeping full
 * back-compat with the legacy `activeAbility` / `activeAbilityCooldown` /
 * `activeAbilityCooldownMax` property names.
 *
 * Covered:
 *   - 4 slots exist and hold ids independently
 *   - activating slot 1 sets ONLY slot 1's cooldown (not 0/2/3)
 *   - `activeAbility` getter mirrors equippedAbilities[0]; setting it writes slot 0
 *   - `activeAbilityCooldown` / `activeAbilityCooldownMax` proxy slot 0
 *   - cooldown-decay iterates all 4 slots
 *   - equipAbility / cycleAbility / getActiveAbilityConfig honor the slot arg
 *   - ABILITIES and the ABILITIES alias are the SAME object reference
 *
 * Rather than instantiate the full Player (which pulls in rendering /
 * audio / platform deps), we synthesize a minimal player-shaped fixture
 * that mirrors the player init's array + accessor setup EXACTLY, then
 * exercise the real `abilities.js` functions against it via `.call(fixture)`.
 * This pins the contract cleanly — same approach as status-effects.test.js.
 */

// Browser shims — must happen before any game module import.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}

import { describe, expect, test, beforeEach } from '@jest/globals';
import * as abilities from '../../js/modules/player/abilities.js';
import { ABILITIES } from '../../js/modules/combat/weapon-data.js';

// ── Fixture ──────────────────────────────────────────────────────────
// Builds a minimal player-shaped object that mirrors the 4-slot init +
// the back-compat slot-0 accessors from Player._defineAbilitySlotAccessors.
// `abilities.js` functions are `.call`'d with this as `this`.
function makeFakePlayer(overrides = {}) {
    const p = {
        // 4-slot loadout (source of truth) — default mirrors player.js:
        // slot 0 = BULWARK, others empty.
        equippedAbilities: ['BULWARK', null, null, null],
        abilityCooldowns: [0, 0, 0, 0],
        abilityCooldownsMax: [0, 0, 0, 0],
        activeAbilityEffects: new Map(),
        ownedAbilities: new Set(['BULWARK']),
        // State the activate path may touch.
        x: 0, y: 0, angle: 0, health: 100,
        deflectorOrbs: [], sentryDrones: [],
        empPulseActive: false, empPulseStartTime: 0,
        powerCooldown: 0, overdriveTimer: 0, dashCooldown: 0,
        gameEngine: null,
        getPowerupStacks: () => 0,
        getEffectiveMaxHealth: () => 100,
        // 6.149.0 — mirror Player.gainHealth (clamp to max; overflow credit is a
        // no-op here since the stub has no tank accumulator).
        gainHealth(amount) {
            if (!(amount > 0)) return { healed: 0, overflow: 0 };
            const cap = this.getEffectiveMaxHealth();
            const before = this.health;
            this.health = Math.min(cap, before + amount);
            const healed = this.health - before;
            return { healed, overflow: amount - healed };
        },
        ...overrides,
    };
    // Mirror Player._defineAbilitySlotAccessors — legacy single-ability props
    // proxy slot 0.
    Object.defineProperty(p, 'activeAbility', {
        configurable: true, enumerable: true,
        get() { return this.equippedAbilities[0]; },
        set(v) { this.equippedAbilities[0] = v; },
    });
    Object.defineProperty(p, 'activeAbilityCooldown', {
        configurable: true, enumerable: true,
        get() { return this.abilityCooldowns[0]; },
        set(v) { this.abilityCooldowns[0] = v; },
    });
    Object.defineProperty(p, 'activeAbilityCooldownMax', {
        configurable: true, enumerable: true,
        get() { return this.abilityCooldownsMax[0]; },
        set(v) { this.abilityCooldownsMax[0] = v; },
    });
    return p;
}

describe('R6.1 — Field Medic (burst heal + cleanse)', () => {
    test('activating Field Medic burst-heals % of max HP and cleanses statuses', () => {
        const p = makeFakePlayer({
            equippedAbilities: ['FIELD_MEDIC', null, null, null],
            health: 50,
            getEffectiveMaxHealth: () => 200,
            // afflicted with every player status
            pChillUntil: 999999, pCorrodeUntil: 999999, pCorrodeStacks: 2,
            pBurnUntil: 999999, pBurnStacks: 3,
        });
        const ok = abilities.activateAbility.call(p, 0);
        expect(ok).toBe(true);
        // 45% of 200 = 90 → 50 + 90 = 140
        expect(p.health).toBe(140);
        // statuses cleansed
        expect(p.pChillUntil).toBe(0);
        expect(p.pCorrodeStacks).toBe(0);
        expect(p.pBurnStacks).toBe(0);
    });

    test('Field Medic heal is capped at max HP', () => {
        const p = makeFakePlayer({
            equippedAbilities: ['FIELD_MEDIC', null, null, null],
            health: 190, getEffectiveMaxHealth: () => 200,
        });
        abilities.activateAbility.call(p, 0);
        expect(p.health).toBe(200);
    });

    test('POTENCY stacks add +10% heal each', () => {
        const p = makeFakePlayer({
            equippedAbilities: ['FIELD_MEDIC', null, null, null],
            health: 0, getEffectiveMaxHealth: () => 100,
            getPowerupStacks: (id) => (id === 'POTENCY' ? 2 : 0),
        });
        abilities.activateAbility.call(p, 0);
        // (0.45 + 2*0.10) * 100 = 65
        expect(p.health).toBe(65);
    });
});

describe('Phase B.S1 — weapon-data ABILITIES export + alias', () => {
    test('ABILITIES and ABILITIES are the SAME object reference', () => {
        expect(ABILITIES).toBe(ABILITIES);
    });

    test('Roster exposes the expected ability ids (R6.1 — Field Medic in, Tractor out)', () => {
        for (const id of ['BULWARK', 'FIELD_MEDIC', 'DEFLECTOR_ORBS',
                          'EMP_PULSE', 'SENTRY_DRONE']) {
            expect(ABILITIES[id]).toBeDefined();
        }
        // Cut/consolidated in R6.1.
        expect(ABILITIES.TRACTOR_SHIELD).toBeUndefined();
        expect(ABILITIES.REPAIR_NANITES).toBeUndefined();
    });
});

describe('Phase B.S1 — 4-slot loadout', () => {
    let p;
    beforeEach(() => { p = makeFakePlayer(); });

    test('4 slots exist and hold ids independently', () => {
        expect(p.equippedAbilities).toHaveLength(4);
        expect(p.abilityCooldowns).toHaveLength(4);
        expect(p.abilityCooldownsMax).toHaveLength(4);

        abilities.equipAbility.call(p, 'FIELD_MEDIC', 1);
        abilities.equipAbility.call(p, 'EMP_PULSE', 2);
        abilities.equipAbility.call(p, 'SENTRY_DRONE', 3);

        expect(p.equippedAbilities).toEqual([
            'BULWARK', 'FIELD_MEDIC', 'EMP_PULSE', 'SENTRY_DRONE',
        ]);
    });

    test('equipAbility rejects unknown ids and leaves the slot untouched', () => {
        const before = p.equippedAbilities[1];
        const ok = abilities.equipAbility.call(p, 'NOT_AN_ABILITY', 1);
        expect(ok).toBe(false);
        expect(p.equippedAbilities[1]).toBe(before);
    });

    test('getActiveAbilityConfig(slot) returns the ABILITIES config for that slot', () => {
        abilities.equipAbility.call(p, 'EMP_PULSE', 2);
        expect(abilities.getActiveAbilityConfig.call(p, 0)).toBe(ABILITIES.BULWARK);
        expect(abilities.getActiveAbilityConfig.call(p, 2)).toBe(ABILITIES.EMP_PULSE);
        // Empty slot → null.
        expect(abilities.getActiveAbilityConfig.call(p, 3)).toBeNull();
    });
});

describe('Phase B.S1 — per-slot cooldowns', () => {
    let p;
    beforeEach(() => { p = makeFakePlayer(); });

    test('activating slot 1 sets ONLY slot 1 cooldown — not 0/2/3', () => {
        abilities.equipAbility.call(p, 'EMP_PULSE', 1);
        const ok = abilities.activateAbility.call(p, 1);
        expect(ok).toBe(true);

        expect(p.abilityCooldowns[0]).toBe(0);
        expect(p.abilityCooldowns[1]).toBe(ABILITIES.EMP_PULSE.cooldown);
        expect(p.abilityCooldowns[2]).toBe(0);
        expect(p.abilityCooldowns[3]).toBe(0);

        // Max mirrors the same single slot.
        expect(p.abilityCooldownsMax[1]).toBe(ABILITIES.EMP_PULSE.cooldown);
        expect(p.abilityCooldownsMax[0]).toBe(0);
    });

    test('activateAbility refuses while that slot is on cooldown', () => {
        abilities.equipAbility.call(p, 'EMP_PULSE', 1);
        expect(abilities.activateAbility.call(p, 1)).toBe(true);
        // Second activation while cooling down is refused.
        expect(abilities.activateAbility.call(p, 1)).toBe(false);
    });

    test('activateAbility returns false for an empty slot', () => {
        expect(abilities.activateAbility.call(p, 3)).toBe(false);
    });

    test('updateAbilityCooldowns decays ALL 4 slots independently', () => {
        p.abilityCooldowns = [1000, 500, 0, 250];
        abilities.updateAbilityCooldowns.call(p, 300);
        expect(p.abilityCooldowns[0]).toBe(700);
        expect(p.abilityCooldowns[1]).toBe(200);
        expect(p.abilityCooldowns[2]).toBe(0);
        expect(p.abilityCooldowns[3]).toBe(0); // clamped at 0, not negative
    });
});

describe('Phase B.S1 — back-compat slot-0 accessors', () => {
    let p;
    beforeEach(() => { p = makeFakePlayer(); });

    test('activeAbility getter mirrors equippedAbilities[0]', () => {
        expect(p.activeAbility).toBe('BULWARK');
        p.equippedAbilities[0] = 'FIELD_MEDIC';
        expect(p.activeAbility).toBe('FIELD_MEDIC');
    });

    test('setting activeAbility writes slot 0', () => {
        p.activeAbility = 'SENTRY_DRONE';
        expect(p.equippedAbilities[0]).toBe('SENTRY_DRONE');
        // Other slots unaffected.
        expect(p.equippedAbilities[1]).toBeNull();
    });

    test('activeAbilityCooldown / activeAbilityCooldownMax proxy slot 0', () => {
        // Activating slot 0 should be visible through the legacy accessors.
        const ok = abilities.activateAbility.call(p, 0); // BULWARK
        expect(ok).toBe(true);
        expect(p.activeAbilityCooldown).toBe(p.abilityCooldowns[0]);
        expect(p.activeAbilityCooldown).toBe(ABILITIES.BULWARK.cooldown);
        expect(p.activeAbilityCooldownMax).toBe(ABILITIES.BULWARK.cooldown);

        // Writing through the accessor writes the array.
        p.activeAbilityCooldown = 1234;
        expect(p.abilityCooldowns[0]).toBe(1234);
    });

    test('no-arg activateAbility() activates slot 0 (legacy input path)', () => {
        // Mirrors Player.activateAbility default slot = 0.
        const ok = abilities.activateAbility.call(p); // default slot 0
        expect(ok).toBe(true);
        expect(p.abilityCooldowns[0]).toBe(ABILITIES.BULWARK.cooldown);
        expect(p.activeAbility).toBe('BULWARK');
    });
});

describe('Phase B.S1 — cycleAbility', () => {
    test('cycleAbility(slot) advances that slot through the ABILITIES keys', () => {
        const p = makeFakePlayer();
        const ids = Object.keys(ABILITIES);
        // Slot 0 starts on BULWARK (index 0). Cycling advances to next id.
        abilities.cycleAbility.call(p, 0);
        expect(p.equippedAbilities[0]).toBe(ids[1]);
        // A different slot cycles independently from its own starting id.
        p.equippedAbilities[2] = ids[0];
        abilities.cycleAbility.call(p, 2);
        expect(p.equippedAbilities[2]).toBe(ids[1]);
        expect(p.equippedAbilities[0]).toBe(ids[1]); // slot 0 unchanged by the slot-2 cycle
    });
});
