// CD-04 — ABLATIVE PLATING (powerup-gated). While the ABLATIVE_PLATING powerup
// is held, the FIRST damaging hit each wave is fully blocked (0 damage), then the
// plate is spent until the next wave recharges it. Headline guarantee is
// DEFAULT-SAFE: a player without the powerup — or one whose plate is already spent
// — takes damage byte-for-byte as before. The block sits AFTER the dodge / invuln /
// i-frame guards in lifecycle.takeDamage so a dodged / i-framed hit never wastes the
// plate. These tests isolate:
//   • the POWERUP_TYPES entry (shape / sane fields)
//   • the takeDamage gate (held + ready → 0 + flag flips; spent / unheld → normal)
// Browser shims (player.js touches window/document/navigator at module load) — kept
// in case the import graph reaches it; mirror the player/* sibling suites.
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
import { POWERUP_TYPES } from '../../js/modules/world/powerup.js';

// ── POWERUP_TYPES entry ─────────────────────────────────────────────────────────
describe('CD-04 — ABLATIVE_PLATING powerup entry', () => {
    test('exists with sane fields', () => {
        const e = POWERUP_TYPES.ABLATIVE_PLATING;
        expect(e).toBeDefined();
        expect(typeof e.name).toBe('string');
        expect(typeof e.displayName).toBe('string');
        expect(e.category).toBe('DEFENSE');
        expect(e.maxStacks).toBe(1);
        expect(typeof e.icon).toBe('string');
        expect(e.icon.length).toBeGreaterThan(0);
        expect(typeof e.color).toBe('string');
        expect(Array.isArray(e.gradientColors)).toBe(true);
        expect(e.gradientColors.length).toBeGreaterThanOrEqual(2);
        expect(typeof e.description).toBe('string');
        expect(e.description.length).toBeGreaterThan(0);
        expect(typeof e.duration).toBe('number');
        expect(typeof e.spCost).toBe('number');
    });
});

// ── takeDamage gate ───────────────────────────────────────────────────────────────
describe('CD-04 — takeDamage ablative gate', () => {
    // Minimal engine `this` stub: no director (D_thr = 1), no shield, no items /
    // passives, desktop (mobile mult = 1). So scaledDamage = damageAmount and
    // finalDamage = round(damageAmount) — clean math. `getPowerupStacks` is
    // parameterized so a single stub can model held / unheld.
    function makeEngine({ ablativeReady = true, hasAblative = false, health = 100 } = {}) {
        const player = {
            invincible: false,
            health,
            maxHealth: 100,
            bloodshield: 0,
            _ablativeReady: ablativeReady,
            getEffectiveShield: () => 0,
            getEffectiveMaxHealth: () => 100,
            getPowerupStacks: (type) => (type === 'ABLATIVE_PLATING' && hasAblative ? 1 : 0),
            getItemAffixTotal: () => 0,
            getSpStatValue: () => 0,
            getElementResist: () => 0,
            hasPassive: () => false,
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

    test('held + ready → hit fully negated (0) and plate flips spent', () => {
        const eng = makeEngine({ ablativeReady: true, hasAblative: true });
        const dealt = takeDamage.call(eng, 25);
        expect(dealt).toBe(0);                       // hit fully blocked
        expect(eng.player.health).toBe(100);         // HP untouched
        expect(eng.player._ablativeReady).toBe(false); // plate spent
    });

    test('held but spent (_ablativeReady=false) → normal damage', () => {
        const eng = makeEngine({ ablativeReady: false, hasAblative: true });
        const dealt = takeDamage.call(eng, 25);
        expect(dealt).toBe(25);                       // full damage lands
        expect(eng.player.health).toBe(75);
        expect(eng.player._ablativeReady).toBe(false); // stays spent
    });

    test('DEFAULT-SAFE: no powerup held → normal damage even if ready', () => {
        const eng = makeEngine({ ablativeReady: true, hasAblative: false });
        const dealt = takeDamage.call(eng, 25);
        expect(dealt).toBe(25);                        // full damage lands
        expect(eng.player.health).toBe(75);
        expect(eng.player._ablativeReady).toBe(true);  // flag untouched (inert)
    });

    test('a second hit after the plate is spent takes full damage', () => {
        const eng = makeEngine({ ablativeReady: true, hasAblative: true });
        const first = takeDamage.call(eng, 25);
        const second = takeDamage.call(eng, 25);
        expect(first).toBe(0);                         // first blocked
        expect(second).toBe(25);                       // second lands
        expect(eng.player.health).toBe(75);
        expect(eng.player._ablativeReady).toBe(false);
    });
});
