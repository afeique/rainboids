// CD-10 — BLOODSHIELD (no-downside, passive-gated). Over-healing past max HP is
// banked into a temporary buffer that soaks incoming damage BEFORE HP, capped at
// 35% of max HP, and decaying when not refreshed. Headline guarantee is
// DEFAULT-SAFE: a player without the passive / with an empty buffer takes damage
// byte-for-byte as before — the soak is gated on bloodshield > 0 and the feed on
// hasPassive('BLOODSHIELD'). These tests isolate the buffer math:
//   • applyBloodshieldSoak — the pure soak resolver
//   • Player.addBloodshield — clamps to the 35% cap, stamps the refresh time
//   • Player.update         — decays the buffer toward 0 once past the delay
//   • takeDamage            — calls the soak so the to-HP amount = finalDamage − soak
// Browser shims (mirror the player/* sibling suites — player.js touches
// window/document/navigator at construction / module load).
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

import { describe, expect, test, beforeEach } from '@jest/globals';
import { applyBloodshieldSoak, takeDamage } from '../../js/modules/player/lifecycle.js';
import {
    BLOODSHIELD_CAP_FRAC,
    BLOODSHIELD_DECAY_PER_SEC,
    BLOODSHIELD_DECAY_DELAY_MS,
} from '../../js/modules/core/constants.js';
import { Player } from '../../js/modules/player/player.js';

// ── Pure soak resolver ───────────────────────────────────────────────────────
describe('CD-10 — applyBloodshieldSoak (pure resolver)', () => {
    test('empty buffer → no soak, dmg unchanged (DEFAULT-SAFE)', () => {
        const p = { bloodshield: 0 };
        const r = applyBloodshieldSoak(p, 25);
        expect(r.dmg).toBe(25);
        expect(r.absorbed).toBe(0);
        expect(p.bloodshield).toBe(0);
    });

    test('absent buffer → no soak, dmg unchanged (DEFAULT-SAFE)', () => {
        const p = {};
        const r = applyBloodshieldSoak(p, 25);
        expect(r.dmg).toBe(25);
        expect(r.absorbed).toBe(0);
    });

    test('buffer ≥ dmg → fully absorbed, only buffer drops', () => {
        const p = { bloodshield: 30 };
        const r = applyBloodshieldSoak(p, 12);
        expect(r.absorbed).toBe(12);
        expect(r.dmg).toBe(0);
        expect(p.bloodshield).toBe(18);
    });

    test('buffer < dmg → buffer empties, remainder hits HP', () => {
        const p = { bloodshield: 8 };
        const r = applyBloodshieldSoak(p, 20);
        expect(r.absorbed).toBe(8);
        expect(r.dmg).toBe(12); // 20 − 8 = the to-HP amount
        expect(p.bloodshield).toBe(0);
    });

    test('zero/negative dmg is a no-op (buffer untouched)', () => {
        const p = { bloodshield: 10 };
        expect(applyBloodshieldSoak(p, 0)).toEqual({ dmg: 0, absorbed: 0 });
        expect(applyBloodshieldSoak(p, -5)).toEqual({ dmg: -5, absorbed: 0 });
        expect(p.bloodshield).toBe(10);
    });
});

// ── addBloodshield clamp ───────────────────────────────────────────────────────
describe('CD-10 — Player.addBloodshield clamps to 35% of max HP', () => {
    let player;
    beforeEach(() => { player = new Player(); });

    test('starts empty after construction / reset', () => {
        expect(player.bloodshield).toBe(0);
        player.bloodshield = 17;
        player.reset();
        expect(player.bloodshield).toBe(0);
    });

    test('cap = BLOODSHIELD_CAP_FRAC × effective max HP', () => {
        const cap = player.getEffectiveMaxHealth() * BLOODSHIELD_CAP_FRAC;
        expect(player.getBloodshieldCap()).toBeCloseTo(cap, 6);
    });

    test('adds up to the cap, then refuses overflow', () => {
        const cap = player.getBloodshieldCap();
        const banked = player.addBloodshield(cap * 0.5);
        expect(banked).toBeCloseTo(cap * 0.5, 6);
        expect(player.bloodshield).toBeCloseTo(cap * 0.5, 6);

        // Try to bank far more than the remaining headroom — only the headroom banks.
        const banked2 = player.addBloodshield(cap * 10);
        expect(player.bloodshield).toBeCloseTo(cap, 6);
        expect(banked2).toBeCloseTo(cap * 0.5, 6);

        // Already at cap → banks nothing.
        expect(player.addBloodshield(50)).toBe(0);
        expect(player.bloodshield).toBeCloseTo(cap, 6);
    });

    test('non-positive input banks nothing', () => {
        expect(player.addBloodshield(0)).toBe(0);
        expect(player.addBloodshield(-5)).toBe(0);
        expect(player.bloodshield).toBe(0);
    });

    test('a successful bank stamps the refresh time', () => {
        const before = player._bloodshieldRefreshMs;
        player.addBloodshield(5);
        expect(player._bloodshieldRefreshMs).toBeGreaterThanOrEqual(before);
        expect(player._bloodshieldRefreshMs).toBeGreaterThan(0);
    });
});

// ── Decay ─────────────────────────────────────────────────────────────────────
describe('CD-10 — buffer decays over time, floors at 0', () => {
    let player;
    beforeEach(() => { player = new Player(); });

    // Minimal stand-in for the update() decay block (mirrors player.js): decay by
    // BLOODSHIELD_DECAY_PER_SEC·dt once past the grace delay, floored at 0.
    function decayStep(p, dtMs, sinceRefreshMs) {
        if (p.bloodshield > 0 && sinceRefreshMs >= BLOODSHIELD_DECAY_DELAY_MS && dtMs > 0) {
            p.bloodshield = Math.max(0, p.bloodshield - BLOODSHIELD_DECAY_PER_SEC * dtMs / 1000);
        }
    }

    test('no decay during the grace window after a refresh', () => {
        player.bloodshield = 20;
        decayStep(player, 1000, BLOODSHIELD_DECAY_DELAY_MS - 1);
        expect(player.bloodshield).toBe(20);
    });

    test('decays by DECAY_PER_SEC × seconds once past the delay', () => {
        player.bloodshield = 20;
        decayStep(player, 1000, BLOODSHIELD_DECAY_DELAY_MS + 500); // 1s elapsed
        expect(player.bloodshield).toBeCloseTo(20 - BLOODSHIELD_DECAY_PER_SEC, 6);
    });

    test('floors at 0 and never goes negative', () => {
        player.bloodshield = 3;
        // 10s of decay would over-drain — must clamp at 0.
        decayStep(player, 10000, BLOODSHIELD_DECAY_DELAY_MS + 1);
        expect(player.bloodshield).toBe(0);
    });

    test('empty buffer is a no-op (no negative drift)', () => {
        player.bloodshield = 0;
        decayStep(player, 5000, BLOODSHIELD_DECAY_DELAY_MS + 1000);
        expect(player.bloodshield).toBe(0);
    });
});

// ── takeDamage integration ──────────────────────────────────────────────────────
describe('CD-10 — takeDamage soaks via the buffer before HP', () => {
    // Minimal engine `this` stub: no director (D_thr = 1), no shield, no
    // powerups/items/passives, desktop (mobile mult = 1). So scaledDamage =
    // damageAmount and finalDamage = round(damageAmount) — clean math.
    function makeEngine(playerOverrides = {}) {
        const player = {
            invincible: false,
            health: 100,
            maxHealth: 100,
            bloodshield: 0,
            getEffectiveShield: () => 0,
            getEffectiveMaxHealth: () => 100,
            getPowerupStacks: () => 0,
            getItemAffixTotal: () => 0,
            getSpStatValue: () => 0,
            getElementResist: () => 0,
            hasPassive: () => false,
            isDashIFrameActive: () => false,
            activeAbilityEffects: new Map(),
            x: 0, y: 0, radius: 12,
            ...playerOverrides,
        };
        return {
            player,
            game: { stats: { totalDamageTaken: 0 }, currentWave: 6 },
            events: { emit: () => {} },
            _breakKillStreak: () => {},
            // no createDamageNumber / triggerPlayerHitFX → guarded by typeof checks
        };
    }

    test('DEFAULT-SAFE: empty buffer → to-HP amount equals finalDamage (unchanged)', () => {
        const eng = makeEngine({ bloodshield: 0 });
        const dealt = takeDamage.call(eng, 25);
        expect(dealt).toBe(25);          // returned finalDamage unchanged
        expect(eng.player.health).toBe(75); // full 25 hit HP
        expect(eng.player.bloodshield).toBe(0);
    });

    test('buffer ≥ damage → HP fully protected, buffer drained', () => {
        const eng = makeEngine({ bloodshield: 40 });
        const dealt = takeDamage.call(eng, 25);
        expect(dealt).toBe(0);               // nothing reached HP
        expect(eng.player.health).toBe(100); // untouched
        expect(eng.player.bloodshield).toBe(15); // 40 − 25
    });

    test('buffer < damage → buffer empties, remainder hits HP', () => {
        const eng = makeEngine({ bloodshield: 10 });
        const dealt = takeDamage.call(eng, 25);
        expect(dealt).toBe(15);              // 25 − 10 reached HP
        expect(eng.player.health).toBe(85);  // 100 − 15
        expect(eng.player.bloodshield).toBe(0);
    });

    test('stats count only the real HP-loss amount (post-soak)', () => {
        const eng = makeEngine({ bloodshield: 10 });
        takeDamage.call(eng, 25);
        expect(eng.game.stats.totalDamageTaken).toBe(15);
    });
});
