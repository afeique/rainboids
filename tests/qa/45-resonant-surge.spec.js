/**
 * QA-45: energy-synergy powerup — RESONANT_SURGE.
 *
 *   • RESONANT_SURGE (1-stack) — while held, applying an elemental status (burn /
 *     corrode / chill / conduct / mark) to an enemy that did NOT already have it
 *     active grants +6 power energy (element builds fuel power builds). The gated
 *     grants live in the combat-manager status applicators; they fire ONLY on a
 *     NEW application — re-procs on an already-afflicted enemy grant nothing.
 *
 * Exercised LIVE on the running game: spawn an enemy, hold (or not) the powerup,
 * set energy below the cap so a +6 grant is observable (addEnergy clamps to the
 * CAPACITOR-boosted max), then drive a status via the combat-manager applicator
 * with the live engine as `this` (so `this.player` resolves to the real player,
 * exactly the context the grant + the existing Kindling block expect). Verifies:
 *   • holder + a FRESH burn → player energy rises by ~6
 *   • holder + re-applying burn to the SAME (already-burning) enemy → no further
 *     grant (no-spam-on-reapply)
 *   • DEFAULT-SAFE: WITHOUT the powerup, a fresh status grants nothing
 *   • a second element (conduct) on a fresh enemy also grants
 * plus: no fatal JS errors through the flow.
 *
 * NOTE on the driver: the engine's `applyBurn`/`applyConduct` wrapper methods
 * (game-engine.js) forward to `combat.applyBurn(...)` WITHOUT `.call(this, ...)`,
 * so when reached through the bullet-hit / attunement path `this` inside the
 * applicator is the combat MODULE (not the engine) and `this.player` is undefined
 * — the same wrapper-layer gap that leaves the existing Kindling block in
 * applyBurn/applyCorrode inert through that path (sibling wrappers like
 * `harvestBonus` DO `.call(this, ...)`, and their `this.player.addEnergy` works).
 * To exercise the grant against the REAL player object graph, this test imports
 * the live combat-manager module (the same ES-module singleton the game uses — its
 * frameClock is the live clock) and invokes the applicator with the engine as
 * `this`, exactly the context the feature (and Kindling) are written for. The
 * import is the game's own instance (not a copy), so enemy/timer state is shared.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// The engine's status-applicator wrappers (game-engine.js) call
// `combat.applyBurn(...)` WITHOUT `.call(this, ...)`, so the applicator's `this`
// is the combat module (no `.player`) when reached through the live hit path —
// the same reason the existing Kindling block in applyBurn/applyCorrode is inert
// there. Sibling wrappers like `harvestBonus` DO forward `this` (and their
// `this.player.addEnergy` works), so this is a wrapper-layer asymmetry. To
// exercise the grant against the real player object graph we install a tiny
// forwarding driver in the page: it imports the live combat module and invokes
// the applicator with the engine as `this`, exactly the context the feature
// (and Kindling) expect. Test-only — source is untouched.
async function installForwardingDriver(page) {
    return page.evaluate(async () => {
        const ge = window.gameEngine;
        // Resolve the combat-manager module URL from the running page and import it,
        // so we can call the applicator with `this === ge` (forwarding the context
        // the engine wrappers drop). Path mirrors the module layout under /js.
        const url = new URL('./js/modules/combat/combat-manager.js', window.location.href).href;
        const combat = await import(url);
        window.__rsApply = {
            burn: (enemy, dmg) => combat.applyBurn.call(ge, enemy, dmg),
            conduct: (enemy) => combat.applyConduct.call(ge, enemy),
            corrode: (enemy) => combat.applyCorrode.call(ge, enemy),
            chill: (enemy) => combat.applyChill.call(ge, enemy),
            mark: (enemy) => combat.applyMark.call(ge, enemy),
        };
        return true;
    });
}

// Hold (or drop) RESONANT_SURGE on the live player, spawn a fresh HUNTER, and set
// energy well below the cap so a +6 grant is fully observable (not clamped). Drop
// any other energy-affecting powerups so the delta is purely the RESONANT_SURGE
// grant. Returns the spawned enemy index + the starting energy.
async function prime(page, { held = true, startEnergy = 10 } = {}) {
    return page.evaluate(({ held, startEnergy }) => {
        const ge = window.gameEngine;
        const p = ge.player;
        if (held) p.powerups.set('RESONANT_SURGE', { stacks: 1 });
        else p.powerups.delete('RESONANT_SURGE');
        // Remove other energy-synergy powerups so they can't perturb the delta.
        p.powerups.delete('SURGE_BATTERY');
        p.powerups.delete('FLUX');
        p.powerups.delete('OVERFLOW_DISCHARGE');
        // Park energy below the cap so +6 lands inside the clamp.
        const max = p.getEffectiveMaxEnergy();
        p.energy = Math.min(startEnergy, Math.max(0, max - 50));
        // Spawn a single fresh enemy with no active statuses.
        const x = ge.gameField.width / 2;
        const y = ge.gameField.height / 2;
        const e = ge.enemyPool.get(x, y, 'HUNTER', 1);
        // Defensive: clear any status timers/stacks the pool may have carried, and
        // clear the spawn-warp / death-flash gates so the applicators don't early-
        // return (a freshly pooled enemy is mid spawn-warp; the applicators no-op on
        // warping / death-flashing / inactive enemies).
        e.active = true; e.warping = false; e._deathFlash = 0;
        e.brnStacks = 0; e.brnUntil = 0;
        e.corrodeStacks = 0; e.corrodeUntil = 0;
        e.chillUntil = 0; e.conductUntil = 0; e.markUntil = 0;
        window.__rsEnemy = e;
        return {
            held: p.getPowerupStacks('RESONANT_SURGE') > 0,
            energy: p.energy,
            max,
        };
    }, { held, startEnergy });
}

// NOTE: each apply helper re-clears the spawn-warp / death-flash gates on the
// parked enemy IMMEDIATELY before applying a status — the running update loop can
// re-arm `_deathFlash` / `warping` between prime() and the apply, which would make
// the applicator early-return. Health is topped up so the enemy can't flip to a
// death state mid-test.

// Apply burn to the parked enemy (via the forwarding driver) and return the delta.
async function applyBurnToEnemy(page, dmg = 12) {
    return page.evaluate((dmg) => {
        const ge = window.gameEngine;
        const p = ge.player;
        const e = window.__rsEnemy;
        e.active = true; e.warping = false; e._deathFlash = 0;
        if (e.maxHealth) e.health = e.maxHealth;
        const before = p.energy;
        window.__rsApply.burn(e, dmg);
        return { before, after: p.energy, delta: p.energy - before, brnUntil: e.brnUntil };
    }, dmg);
}

// Apply conduct to the parked enemy (via the forwarding driver) and return the delta.
async function applyConductToEnemy(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        const e = window.__rsEnemy;
        e.active = true; e.warping = false; e._deathFlash = 0;
        if (e.maxHealth) e.health = e.maxHealth;
        const before = p.energy;
        window.__rsApply.conduct(e);
        return { before, after: p.energy, delta: p.energy - before, conductUntil: e.conductUntil };
    });
}

test.describe('QA-45: RESONANT_SURGE energy-synergy powerup', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            for (const k of Object.keys(p.spStats)) p.spStats[k] = 0; // clean 0-SP baseline
        });
        await installForwardingDriver(page);
    });

    test('holder + a FRESH burn grants ~6 energy', async ({ page }) => {
        const start = await prime(page, { held: true });
        expect(start.held).toBe(true);
        const r = await applyBurnToEnemy(page);
        expect(r.delta).toBeCloseTo(6, 5); // RESONANT_SURGE_ENERGY
    });

    test('re-applying burn to the SAME (already-burning) enemy does NOT grant again', async ({ page }) => {
        await prime(page, { held: true });
        const first = await applyBurnToEnemy(page);  // fresh → +6
        const second = await applyBurnToEnemy(page);  // re-proc → +0
        const third = await applyBurnToEnemy(page);   // re-proc → +0
        expect(first.delta).toBeCloseTo(6, 5);
        expect(second.delta).toBe(0);
        expect(third.delta).toBe(0);
    });

    test('DEFAULT-SAFE: without the powerup, a fresh burn grants nothing', async ({ page }) => {
        const start = await prime(page, { held: false });
        expect(start.held).toBe(false);
        const r = await applyBurnToEnemy(page);
        expect(r.delta).toBe(0);
    });

    test('a second element (conduct) on a fresh enemy also grants ~6', async ({ page }) => {
        await prime(page, { held: true });
        const r = await applyConductToEnemy(page);
        expect(r.delta).toBeCloseTo(6, 5);
        // Re-applying conduct to the same (already-conducting) enemy → no spam.
        const again = await applyConductToEnemy(page);
        expect(again.delta).toBe(0);
    });

    test('no fatal JS errors through the resonant-surge flow', async ({ page }) => {
        await prime(page, { held: true });
        await applyBurnToEnemy(page);
        await applyBurnToEnemy(page);
        await applyConductToEnemy(page);
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
