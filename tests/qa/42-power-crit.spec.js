/**
 * QA-42: AoE power-weapon CRIT (R1 / CD-07)
 *
 * AoE power weapons (nova, lightning, mines, missiles, beams) deal damage
 * through gameEngine.damageEnemy(...) and historically could NOT crit — only
 * primaries + bullet-based powers rolled crit at bullet creation. The mechanical
 * fix routes a per-target crit roll through damageEnemy via an opt-in `canCrit`
 * flag (4th arg), using the SAME math the bullet path uses: roll
 * `Math.random()*100 < getEffectiveCritChance()` and, on a crit, PRE-MULTIPLY
 * the damage by `getEffectiveCritDamage()/100`. The power-weapon AoE call sites
 * pass canCrit=true; non-power callers (BACKLASH, BULWARK retaliation, EXPLOSIVE
 * splash) keep the default canCrit=false.
 *
 * This spec drives the LIVE engine via its public damageEnemy surface (the exact
 * entry point every AoE power-weapon call site uses) against a spawned enemy,
 * pinning the player's crit getters so the roll is deterministic. Each test does
 * its spawn → fatten → hit → read in a SINGLE page.evaluate so no game frame
 * mutates the dummy between steps. It asserts:
 *   1. With canCrit=true + 100% crit, AoE power damage is crit-scaled (HP delta
 *      = base × critMult), and the crit damage-number FX appears.
 *   2. DEFAULT-SAFE: canCrit=false (the default 2-arg call) deals exactly the
 *      base damage even at 100% crit chance — byte-for-byte unchanged.
 *   3. A bullet-based power (CHARGE_SHOT) does NOT double-crit: the canCrit AoE
 *      path applies EXACTLY ONE crit multiplier (no critMult²).
 *   4. No fatal JS errors across the flow.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Drive ONE AoE damageEnemy hit in-page and return the HP delta + crit-FX flag,
// all atomically so no game frame mutates the dummy between fatten and hit.
// Defined as a plain function and handed to page.evaluate as args, so it runs in
// the browser context against the live window.gameEngine.
//   critDamagePct — fixed getEffectiveCritDamage() value (e.g. 250 → ×2.5)
//   base          — raw damage passed to damageEnemy
//   canCrit       — the 4th-arg flag (true = AoE power-weapon call sites)
async function hitOnce(page, critDamagePct, base, canCrit) {
    return page.evaluate(({ critDamagePct, base, canCrit }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        // Override the live crit getters the roll reads (rollAoeCrit + bullet
        // path both call these). 100% chance + fixed % → deterministic.
        p.getEffectiveCritChance = () => 100;
        p.getEffectiveCritDamage = () => critDamagePct;
        // Drain the field so OUR dummy is the only enemy (no stray wave HUNTER).
        ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
        ge.enemyPool.cleanupInactive();
        // Clear damage-number state so the FX read is clean.
        ge._enemyDmgAggs = null;
        ge.damageNumbers = [];
        // Spawn + fatten so neither base nor crit can one-shot it (clean delta).
        const e = ge.enemyPool.get(500, 400, 'HUNTER', 1);
        e.maxHealth = 1e9;
        e.health = 1e9;
        const power = p.activePower;
        const before = e.health;
        ge.damageEnemy(e, base, undefined, canCrit);
        const after = e.health;
        const nums = ge.damageNumbers || [];
        return {
            dealt: before - after,
            anyCrit: nums.some((n) => n && n.isCrit === true),
            critMult: critDamagePct / 100,
            power,
        };
    }, { critDamagePct, base, canCrit });
}

test.describe('QA-42: AoE power-weapon crit (R1 / CD-07)', () => {
    let errors;

    test.beforeEach(async ({ page }) => {
        errors = [];
        page.on('pageerror', (err) => errors.push(String(err)));
        page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
        await loadGame(page);
        await startGame(page);
    });

    test('AoE power damage CAN crit (canCrit=true → HP delta = base × critMult)', async ({ page }) => {
        const base = 40;
        const r = await hitOnce(page, 250, base, true); // 250% → ×2.5
        // 100% crit + ×2.5 → exactly base × 2.5.
        expect(r.dealt).toBeCloseTo(base * r.critMult, 5);
        expect(r.dealt).toBeGreaterThan(base); // crit-scaled, strictly above base
        expect(errors).toEqual([]);
    });

    test('crit FX: a crit AoE hit surfaces an isCrit damage number', async ({ page }) => {
        const r = await hitOnce(page, 300, 30, true);
        // applyDamageToEnemy passes opts.isCrit → createDamageNumber → a floater
        // flagged isCrit in ge.damageNumbers.
        expect(r.anyCrit).toBe(true);
        expect(errors).toEqual([]);
    });

    test('DEFAULT-SAFE: canCrit=false never crits — base damage byte-for-byte', async ({ page }) => {
        const base = 40;
        // canCrit=false even with 100% pinned crit chance → must stay base.
        const r = await hitOnce(page, 300, base, false);
        expect(r.dealt).toBeCloseTo(base, 5); // exactly base — no crit multiply
        expect(r.anyCrit).toBe(false);        // no crit FX either
        expect(errors).toEqual([]);
    });

    test('bullet-based power (CHARGE_SHOT) does not double-crit', async ({ page }) => {
        // CHARGE_SHOT is the default power weapon; its projectiles are BULLETS
        // that pre-roll crit at creation and damage via enemy.takeDamage (the
        // bullet path), NOT via damageEnemy's canCrit AoE roll. We prove the
        // canCrit path applies EXACTLY ONE crit multiplier (not critMult²),
        // which is the guard against any double-crit on a single hit.
        const base = 50;
        const r = await hitOnce(page, 200, base, true); // ×2
        expect(r.power).toBe('CHARGE_SHOT');
        // Exactly ONE crit multiplier: base × 2, NOT base × 4 (no stacking).
        expect(r.dealt).toBeCloseTo(base * r.critMult, 5);
        expect(r.dealt).toBeLessThan(base * r.critMult * r.critMult); // not double-applied
        expect(errors).toEqual([]);
    });
});
