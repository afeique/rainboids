/**
 * tests/unit/skills-loadout.test.js — Phase B.S1 4-slot skill loadout.
 *
 * Pins the NON-BREAKING data-model refactor that turns the single
 * equipped-skill model into a 4-slot loadout while keeping full
 * back-compat with the legacy `activeSkill` / `activeSkillCooldown` /
 * `activeSkillCooldownMax` property names.
 *
 * Covered:
 *   - 4 slots exist and hold ids independently
 *   - activating slot 1 sets ONLY slot 1's cooldown (not 0/2/3)
 *   - `activeSkill` getter mirrors equippedSkills[0]; setting it writes slot 0
 *   - `activeSkillCooldown` / `activeSkillCooldownMax` proxy slot 0
 *   - cooldown-decay iterates all 4 slots
 *   - equipSkill / cycleSkill / getActiveSkillConfig honor the slot arg
 *   - SKILLS and the DEFENSE_SKILLS alias are the SAME object reference
 *
 * Rather than instantiate the full Player (which pulls in rendering /
 * audio / platform deps), we synthesize a minimal player-shaped fixture
 * that mirrors the player init's array + accessor setup EXACTLY, then
 * exercise the real `skills.js` functions against it via `.call(fixture)`.
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
import * as skills from '../../js/modules/player/skills.js';
import { SKILLS, DEFENSE_SKILLS } from '../../js/modules/combat/weapon-data.js';

// ── Fixture ──────────────────────────────────────────────────────────
// Builds a minimal player-shaped object that mirrors the 4-slot init +
// the back-compat slot-0 accessors from Player._defineSkillSlotAccessors.
// `skills.js` functions are `.call`'d with this as `this`.
function makeFakePlayer(overrides = {}) {
    const p = {
        // 4-slot loadout (source of truth) — default mirrors player.js:
        // slot 0 = BULWARK, others empty.
        equippedSkills: ['BULWARK', null, null, null],
        skillCooldowns: [0, 0, 0, 0],
        skillCooldownsMax: [0, 0, 0, 0],
        activeSkillEffects: new Map(),
        ownedSkills: new Set(['BULWARK']),
        // State the activate path may touch.
        x: 0, y: 0, angle: 0, health: 100,
        deflectorOrbs: [], sentryDrones: [],
        empPulseActive: false, empPulseStartTime: 0,
        powerCooldown: 0, overdriveTimer: 0, dashCooldown: 0,
        gameEngine: null,
        getPowerupStacks: () => 0,
        getEffectiveMaxHealth: () => 100,
        ...overrides,
    };
    // Mirror Player._defineSkillSlotAccessors — legacy single-skill props
    // proxy slot 0.
    Object.defineProperty(p, 'activeSkill', {
        configurable: true, enumerable: true,
        get() { return this.equippedSkills[0]; },
        set(v) { this.equippedSkills[0] = v; },
    });
    Object.defineProperty(p, 'activeSkillCooldown', {
        configurable: true, enumerable: true,
        get() { return this.skillCooldowns[0]; },
        set(v) { this.skillCooldowns[0] = v; },
    });
    Object.defineProperty(p, 'activeSkillCooldownMax', {
        configurable: true, enumerable: true,
        get() { return this.skillCooldownsMax[0]; },
        set(v) { this.skillCooldownsMax[0] = v; },
    });
    return p;
}

describe('Phase B.S1 — weapon-data SKILLS export + alias', () => {
    test('SKILLS and DEFENSE_SKILLS are the SAME object reference', () => {
        expect(DEFENSE_SKILLS).toBe(SKILLS);
    });

    test('Alias exposes the expected skill ids', () => {
        for (const id of ['BULWARK', 'REPAIR_NANITES', 'DEFLECTOR_ORBS',
                          'EMP_PULSE', 'TRACTOR_SHIELD', 'SENTRY_DRONE']) {
            expect(SKILLS[id]).toBeDefined();
            expect(DEFENSE_SKILLS[id]).toBe(SKILLS[id]);
        }
    });
});

describe('Phase B.S1 — 4-slot loadout', () => {
    let p;
    beforeEach(() => { p = makeFakePlayer(); });

    test('4 slots exist and hold ids independently', () => {
        expect(p.equippedSkills).toHaveLength(4);
        expect(p.skillCooldowns).toHaveLength(4);
        expect(p.skillCooldownsMax).toHaveLength(4);

        skills.equipSkill.call(p, 'REPAIR_NANITES', 1);
        skills.equipSkill.call(p, 'EMP_PULSE', 2);
        skills.equipSkill.call(p, 'SENTRY_DRONE', 3);

        expect(p.equippedSkills).toEqual([
            'BULWARK', 'REPAIR_NANITES', 'EMP_PULSE', 'SENTRY_DRONE',
        ]);
    });

    test('equipSkill rejects unknown ids and leaves the slot untouched', () => {
        const before = p.equippedSkills[1];
        const ok = skills.equipSkill.call(p, 'NOT_A_SKILL', 1);
        expect(ok).toBe(false);
        expect(p.equippedSkills[1]).toBe(before);
    });

    test('getActiveSkillConfig(slot) returns the SKILLS config for that slot', () => {
        skills.equipSkill.call(p, 'EMP_PULSE', 2);
        expect(skills.getActiveSkillConfig.call(p, 0)).toBe(SKILLS.BULWARK);
        expect(skills.getActiveSkillConfig.call(p, 2)).toBe(SKILLS.EMP_PULSE);
        // Empty slot → null.
        expect(skills.getActiveSkillConfig.call(p, 3)).toBeNull();
    });
});

describe('Phase B.S1 — per-slot cooldowns', () => {
    let p;
    beforeEach(() => { p = makeFakePlayer(); });

    test('activating slot 1 sets ONLY slot 1 cooldown — not 0/2/3', () => {
        skills.equipSkill.call(p, 'EMP_PULSE', 1);
        const ok = skills.activateSkill.call(p, 1);
        expect(ok).toBe(true);

        expect(p.skillCooldowns[0]).toBe(0);
        expect(p.skillCooldowns[1]).toBe(SKILLS.EMP_PULSE.cooldown);
        expect(p.skillCooldowns[2]).toBe(0);
        expect(p.skillCooldowns[3]).toBe(0);

        // Max mirrors the same single slot.
        expect(p.skillCooldownsMax[1]).toBe(SKILLS.EMP_PULSE.cooldown);
        expect(p.skillCooldownsMax[0]).toBe(0);
    });

    test('activateSkill refuses while that slot is on cooldown', () => {
        skills.equipSkill.call(p, 'EMP_PULSE', 1);
        expect(skills.activateSkill.call(p, 1)).toBe(true);
        // Second activation while cooling down is refused.
        expect(skills.activateSkill.call(p, 1)).toBe(false);
    });

    test('activateSkill returns false for an empty slot', () => {
        expect(skills.activateSkill.call(p, 3)).toBe(false);
    });

    test('updateSkillCooldowns decays ALL 4 slots independently', () => {
        p.skillCooldowns = [1000, 500, 0, 250];
        skills.updateSkillCooldowns.call(p, 300);
        expect(p.skillCooldowns[0]).toBe(700);
        expect(p.skillCooldowns[1]).toBe(200);
        expect(p.skillCooldowns[2]).toBe(0);
        expect(p.skillCooldowns[3]).toBe(0); // clamped at 0, not negative
    });
});

describe('Phase B.S1 — back-compat slot-0 accessors', () => {
    let p;
    beforeEach(() => { p = makeFakePlayer(); });

    test('activeSkill getter mirrors equippedSkills[0]', () => {
        expect(p.activeSkill).toBe('BULWARK');
        p.equippedSkills[0] = 'REPAIR_NANITES';
        expect(p.activeSkill).toBe('REPAIR_NANITES');
    });

    test('setting activeSkill writes slot 0', () => {
        p.activeSkill = 'TRACTOR_SHIELD';
        expect(p.equippedSkills[0]).toBe('TRACTOR_SHIELD');
        // Other slots unaffected.
        expect(p.equippedSkills[1]).toBeNull();
    });

    test('activeSkillCooldown / activeSkillCooldownMax proxy slot 0', () => {
        // Activating slot 0 should be visible through the legacy accessors.
        const ok = skills.activateSkill.call(p, 0); // BULWARK
        expect(ok).toBe(true);
        expect(p.activeSkillCooldown).toBe(p.skillCooldowns[0]);
        expect(p.activeSkillCooldown).toBe(SKILLS.BULWARK.cooldown);
        expect(p.activeSkillCooldownMax).toBe(SKILLS.BULWARK.cooldown);

        // Writing through the accessor writes the array.
        p.activeSkillCooldown = 1234;
        expect(p.skillCooldowns[0]).toBe(1234);
    });

    test('no-arg activateSkill() activates slot 0 (legacy input path)', () => {
        // Mirrors Player.activateSkill default slot = 0.
        const ok = skills.activateSkill.call(p); // default slot 0
        expect(ok).toBe(true);
        expect(p.skillCooldowns[0]).toBe(SKILLS.BULWARK.cooldown);
        expect(p.activeSkill).toBe('BULWARK');
    });
});

describe('Phase B.S1 — cycleSkill', () => {
    test('cycleSkill(slot) advances that slot through the SKILLS keys', () => {
        const p = makeFakePlayer();
        const ids = Object.keys(SKILLS);
        // Slot 0 starts on BULWARK (index 0). Cycling advances to next id.
        skills.cycleSkill.call(p, 0);
        expect(p.equippedSkills[0]).toBe(ids[1]);
        // A different slot cycles independently from its own starting id.
        p.equippedSkills[2] = ids[0];
        skills.cycleSkill.call(p, 2);
        expect(p.equippedSkills[2]).toBe(ids[1]);
        expect(p.equippedSkills[0]).toBe(ids[1]); // slot 0 unchanged by the slot-2 cycle
    });
});
