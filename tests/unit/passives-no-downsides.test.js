// §6c no-downsides passive rework (batch 1) — verifies the three penalties
// removed in batch 1 are GONE while every keystone's upside stays intact:
//
//   1. HOARDERS_GREED — old +15% damage-taken penalty removed; +100% gold-find
//      upside (getGoldFindMultiplier ×2) unchanged.
//   2. FRENZY        — old +30% damage-taken penalty removed; +8%/nearby-enemy
//      OUTGOING upside (frenzyMult) unchanged.
//   3. TWIN_CAST     — old +30% energy-cost penalty removed; fires-twice upside
//      unchanged. twinCastEnergyCost(base, true) === base.
//
// The headline assertion is BEHAVIORAL: a player carrying FRENZY (or
// HOARDERS_GREED) takes EXACTLY the same incoming damage as a baseline player
// with no passive — proving the lifecycle.takeDamage penalty branch is gone, not
// merely that a string field was deleted.

// Browser shims (player.js touches window/document/navigator at module load via
// the import graph) — mirror the player/* sibling suites.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { vibrate: undefined };

import { describe, expect, test } from '@jest/globals';
import { takeDamage } from '../../js/modules/player/lifecycle.js';
import { twinCastEnergyCost } from '../../js/modules/player/weapons.js';
import { frenzyMult, frenzyNearbyCount } from '../../js/modules/combat/collision-system.js';
import * as progression from '../../js/modules/player/progression.js';
import { PASSIVES } from '../../js/modules/combat/passive-data.js';

// Minimal engine `this` stub for lifecycle.takeDamage: no director (D_thr = 1),
// no shield, no items, desktop (mobile mult = 1 at wave 6). So scaledDamage =
// damageAmount and finalDamage = round(damageAmount) — clean math. `hasPassive`
// is parameterized so a single stub models baseline vs. FRENZY vs. HOARDERS.
// None of the relevant passives grant dodge, so dodgeChance = 0 (deterministic).
function makeEngine({ passive = null, health = 100 } = {}) {
    const player = {
        invincible: false,
        health,
        maxHealth: 100,
        bloodshield: 0,
        _ablativeReady: false,
        getEffectiveShield: () => 0,
        getEffectiveMaxHealth: () => 100,
        getPowerupStacks: () => 0,
        getItemAffixTotal: () => 0,
        getSpStatValue: () => 0,
        getElementResist: () => 0,
        hasPassive: (id) => passive != null && id === passive,
        isDashIFrameActive: () => false,
        activeAbilityEffects: new Map(),
        x: 0, y: 0, radius: 12,
    };
    return {
        player,
        game: { stats: { totalDamageTaken: 0 }, currentWave: 6 },
        events: { emit: () => {} },
        _breakKillStreak: () => {},
    };
}

describe('§6c batch 1 — FRENZY no longer increases damage taken', () => {
    test('FRENZY takes the SAME damage as a no-passive baseline (old +30% gone)', () => {
        const baseline = makeEngine({ passive: null });
        const frenzy = makeEngine({ passive: 'FRENZY' });
        const dealtBase = takeDamage.call(baseline, 40);
        const dealtFrenzy = takeDamage.call(frenzy, 40);
        // Old behavior would have been 40 * 1.30 = 52. New behavior: identical 40.
        expect(dealtBase).toBe(40);
        expect(dealtFrenzy).toBe(40);
        expect(dealtFrenzy).toBe(dealtBase);
        expect(frenzy.player.health).toBe(baseline.player.health);
    });

    test('FRENZY outgoing crowd-damage upside is intact (frenzyMult > 1 with nearby enemies)', () => {
        const enemy = (x, y) => ({ x, y, active: true, _deathFlash: 0, warping: false });
        const count = frenzyNearbyCount([enemy(10, 0), enemy(0, 20), enemy(30, 0)], 0, 0);
        expect(count).toBe(3);
        expect(frenzyMult(count)).toBeGreaterThan(1);     // upside still applies
        expect(frenzyMult(count)).toBeCloseTo(1 + 3 * 0.08, 5);
    });
});

describe('§6c batch 1 — HOARDERS_GREED no longer increases damage taken', () => {
    test('HOARDERS_GREED takes the SAME damage as a no-passive baseline (old +15% gone)', () => {
        const baseline = makeEngine({ passive: null });
        const greed = makeEngine({ passive: 'HOARDERS_GREED' });
        const dealtBase = takeDamage.call(baseline, 40);
        const dealtGreed = takeDamage.call(greed, 40);
        // Old behavior would have been 40 * 1.15 = 46. New behavior: identical 40.
        expect(dealtBase).toBe(40);
        expect(dealtGreed).toBe(40);
        expect(dealtGreed).toBe(dealtBase);
        expect(greed.player.health).toBe(baseline.player.health);
    });

    test('HOARDERS_GREED gold-find upside is intact (×2)', () => {
        const base = { hasPassive: () => false, gameEngine: null };
        const greed = { hasPassive: (id) => id === 'HOARDERS_GREED', gameEngine: null };
        const b = progression.getGoldFindMultiplier.call(base);
        const g = progression.getGoldFindMultiplier.call(greed);
        expect(g).toBeCloseTo(b * 2, 5);
        expect(g).toBeGreaterThan(b); // still boosted
    });
});

describe('§6c batch 1 — TWIN_CAST fires twice for normal cost', () => {
    test('twinCastEnergyCost is a no-op with the passive (base cost preserved)', () => {
        expect(twinCastEnergyCost(20, true)).toBe(20);
        expect(twinCastEnergyCost(20, false)).toBe(20);
    });
});

describe('§6c batches 1–3 — downside string fields removed from the registry', () => {
    test('batches 1–3 keystones no longer carry a `downside`', () => {
        // b1: HOARDERS_GREED/FRENZY/TWIN_CAST · b2: GUNSLINGER/PURIST · b3: FAILSAFE/EYE_OF_THE_STORM
        for (const id of ['HOARDERS_GREED', 'FRENZY', 'TWIN_CAST', 'GUNSLINGER', 'PURIST',
            'FAILSAFE', 'EYE_OF_THE_STORM']) {
            expect(PASSIVES[id]).toBeDefined();
            expect('downside' in PASSIVES[id]).toBe(false);
        }
    });

    test('GUNSLINGER no longer carries the slot-disabling hook (no-powers/abilities removed)', () => {
        expect(PASSIVES.GUNSLINGER.hooks || []).not.toContain('disableSlots');
    });

    test('FAILSAFE no longer carries the −15% max-HP penalty (maxHpMult removed; per-hit cap stays)', () => {
        expect('maxHpMult' in PASSIVES.FAILSAFE).toBe(false);
    });

    test('the remaining 4 harsh-downside keystones STILL carry their downside (later batches)', () => {
        for (const id of ['GLASS_CANNON', 'OVERFLOW_CAPACITOR', 'GRAVITY_WELL', 'HEAT_SINK']) {
            expect('downside' in PASSIVES[id]).toBe(true);
            expect(typeof PASSIVES[id].downside).toBe('string');
            expect(PASSIVES[id].downside.length).toBeGreaterThan(0);
        }
    });
});
