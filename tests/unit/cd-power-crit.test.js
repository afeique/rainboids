// R1 / CD-07 — AoE POWER-WEAPON CRIT. AoE power weapons (nova, lightning, mines,
// missiles, beams) deal damage through damageEnemy(...) and historically could
// NOT crit; only primaries + bullet-based powers rolled crit at bullet creation
// (weapons.js createBullet). The mechanical fix routes a per-target crit roll
// through damageEnemy via an opt-in `canCrit` flag, using the SAME math the
// bullet path uses: roll `Math.random()*100 < getEffectiveCritChance()` and, on
// a crit, PRE-MULTIPLY damage by `getEffectiveCritDamage()/100`. The crit is
// pre-multiplied at the caller (applyDamageToEnemy only renders the crit FX from
// `opts.isCrit`), so this matches bullets byte-for-byte with no double-multiply.
//
// Headline guarantee is DEFAULT-SAFE: a player with 0 crit chance (or no crit
// getters, or no player at all) deals AoE power damage byte-for-byte as before.
// These tests isolate the pure crit-roll resolver `rollAoeCrit` with an injected
// RNG so the crit / no-crit branches are deterministic.
import { describe, expect, test } from '@jest/globals';
import { rollAoeCrit } from '../../js/modules/combat/collision-system.js';

// A minimal player stand-in: fixed crit chance + crit damage % getters, exactly
// the surface rollAoeCrit reads (mirrors player.getEffectiveCritChance /
// getEffectiveCritDamage).
function mkPlayer(critChance, critDamagePct = 250) {
    return {
        getEffectiveCritChance: () => critChance,
        getEffectiveCritDamage: () => critDamagePct,
    };
}

// ── DEFAULT-SAFE: 0 crit chance / no player / no getters ─────────────────────
describe('CD-07 — rollAoeCrit DEFAULT-SAFE (no crit ⇒ damage unchanged)', () => {
    test('0 crit chance never crits — damage byte-for-byte unchanged', () => {
        const p = mkPlayer(0, 300);
        // Force the lowest possible roll (rng()=0 → 0 < 0 is false at 0% chance).
        const r = rollAoeCrit(p, 100, () => 0);
        expect(r.isCrit).toBe(false);
        expect(r.damage).toBe(100);
    });

    test('null player → no crit, damage unchanged', () => {
        const r = rollAoeCrit(null, 100, () => 0);
        expect(r.isCrit).toBe(false);
        expect(r.damage).toBe(100);
    });

    test('player missing crit getters → no crit, damage unchanged', () => {
        const r = rollAoeCrit({}, 100, () => 0);
        expect(r.isCrit).toBe(false);
        expect(r.damage).toBe(100);
    });

    test('high crit chance but the roll FAILS → no crit, damage unchanged', () => {
        const p = mkPlayer(50, 300);
        // rng()=0.99 → 99 < 50 is false → no crit.
        const r = rollAoeCrit(p, 100, () => 0.99);
        expect(r.isCrit).toBe(false);
        expect(r.damage).toBe(100);
    });
});

// ── Crit math: damage × (critDamage / 100), matching the bullet path ─────────
describe('CD-07 — rollAoeCrit crit math (damage × critDamage%)', () => {
    test('a winning roll multiplies damage by getEffectiveCritDamage()/100', () => {
        const p = mkPlayer(50, 250); // 250% crit damage → ×2.5
        // rng()=0 → 0 < 50 is true → crit.
        const r = rollAoeCrit(p, 100, () => 0);
        expect(r.isCrit).toBe(true);
        expect(r.damage).toBeCloseTo(250, 5); // 100 × 2.50
    });

    test('matches the bullet path exactly (damage *= critDamage/100)', () => {
        const critDamagePct = 300;
        const p = mkPlayer(100, critDamagePct);
        const base = 42;
        const r = rollAoeCrit(p, base, () => 0);
        // Bullet path: bullet.damage *= this.getEffectiveCritDamage() / 100
        expect(r.damage).toBeCloseTo(base * (critDamagePct / 100), 5);
        expect(r.isCrit).toBe(true);
    });

    test('roll exactly at the boundary: rng*100 strictly LESS THAN chance', () => {
        const p = mkPlayer(50, 200);
        // rng()=0.5 → 50 < 50 is FALSE (strict <), mirroring the bullet path.
        expect(rollAoeCrit(p, 100, () => 0.5).isCrit).toBe(false);
        // rng()=0.4999 → 49.99 < 50 is TRUE.
        expect(rollAoeCrit(p, 100, () => 0.4999).isCrit).toBe(true);
    });

    test('default rng (Math.random) is wired up — guaranteed crit at 100% chance', () => {
        const p = mkPlayer(100, 200);
        // No injected rng: exercises the production default. At 100% chance any
        // Math.random() in [0,1) gives rng*100 < 100, so it always crits.
        const r = rollAoeCrit(p, 80);
        expect(r.isCrit).toBe(true);
        expect(r.damage).toBeCloseTo(160, 5); // 80 × 2.0
    });
});
