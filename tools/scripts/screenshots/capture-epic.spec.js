// Captures a series of epic in-game screenshots into `screenshots/` for
// dev-diary / marketing use. Composes scenes deliberately via cheats
// and direct pool spawning rather than relying on organic gameplay
// (organic play takes minutes to reach interesting moments; this gives
// us boss fights, particle storms, and full powerup-stacks within a
// few seconds per shot).
//
// Run from repo root:
//   npx playwright test tools/scripts/screenshots/capture-epic.spec.js \
//       --project=qa --workers=1 --reporter=line
//
// All shots land in screenshots/epic-*.png at viewport resolution
// (1280x720 by default — see playwright.config.js `use.viewport`).

import { test } from '@playwright/test';
import { loadGame, startGame } from '../../../tests/helpers/game-helpers.js';
import { GameAI } from '../../../tests/helpers/game-ai.js';

test.setTimeout(180_000); // big timeout — we walk through many scenes

const SHOT_DIR = 'screenshots';

// Helper: spawn one enemy of a given type at a screen-relative point.
async function spawnEnemy(page, type, sx, sy) {
    return page.evaluate(({ type, sx, sy }) => {
        const ge = window.gameEngine;
        const x = ge.camera.x + sx;
        const y = ge.camera.y + sy;
        return !!ge.enemyPool.get(x, y, type, 1);
    }, { type, sx, sy });
}

// Helper: bestow several powerup stacks on the player so the HUD reads
// thick and the player visibly fires faster / has multi-shot etc.
async function stackPowerups(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        // Add stacks if the player API exposes that, otherwise fall back
        // to whatever direct fields exist.
        const stacks = {
            RAPID_FIRE: 5, MULTI_SHOT: 3, HOMING: 1, BIG_BULLETS: 2,
            SPEED_BOOST: 2, PIERCING: 1, EXPLOSIVE: 1, CRIT_CHANCE: 3,
            LONG_RANGE: 2, SHIELD_BOOST: 2,
        };
        for (const [id, count] of Object.entries(stacks)) {
            if (typeof p.addPowerupStacks === 'function') {
                p.addPowerupStacks(id, count);
            } else if (p.powerupStacks) {
                p.powerupStacks[id] = (p.powerupStacks[id] || 0) + count;
            }
        }
    });
}

test('capture epic screenshots', async ({ page }) => {
    page.on('console', m => {
        if (m.type() === 'error') console.log('[browser-error]', m.text());
    });

    await loadGame(page);

    // ── 01: title screen (before startGame) ──────────────────────────
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT_DIR}/epic-01-title.png`, omitBackground: false });

    await startGame(page);
    await page.waitForTimeout(1500);

    // Cheat: god-mode / one-punch-kills so we can compose without dying
    await page.evaluate(() => {
        const ge = window.gameEngine;
        ge.cheats = ge.cheats || {};
        ge.cheats.invincible = true;
        ge.cheats.onePunchMan = false; // we want the explosions to look real
        ge.game.money = 5000;
        ge.player.skillPoints = 30;
    });

    // ── 02: combat density — spawn 8 hunters in a ring around player
    await page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        const radius = 280;
        const types = ['HUNTER','HUNTER','GUARDIAN','WASP','HUNTER','GUARDIAN','WASP','HUNTER'];
        for (let i = 0; i < types.length; i++) {
            const angle = (i / types.length) * Math.PI * 2;
            const x = p.x + Math.cos(angle) * radius;
            const y = p.y + Math.sin(angle) * radius;
            ge.enemyPool.get(x, y, types[i], 1);
        }
    });
    // Let the AI fire a beat so we catch bullets in flight
    const ai = new GameAI(page);
    await ai.run(2200);
    await page.screenshot({ path: `${SHOT_DIR}/epic-02-combat-density.png` });

    // ── 03: powerup stack + particle storm ──────────────────────────
    await stackPowerups(page);
    await page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        // sprinkle more enemies near the player so combat is dense
        const ring = 220;
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            ge.enemyPool.get(
                p.x + Math.cos(a) * ring,
                p.y + Math.sin(a) * ring,
                'HUNTER', 1
            );
        }
    });
    await ai.run(1800);
    await page.screenshot({ path: `${SHOT_DIR}/epic-03-powerup-storm.png` });

    // ── 04: lightning arc tether — equip + fire ─────────────────────
    await page.evaluate(() => {
        const ge = window.gameEngine;
        if (ge.player.equipPrimary) ge.player.equipPrimary('LIGHTNING_ARC');
        // Spawn a target near the player so the arc has something to grab
        const p = ge.player;
        ge.enemyPool.get(p.x + 200, p.y - 30, 'GUARDIAN', 1);
        ge.enemyPool.get(p.x + 220, p.y + 50, 'STALKER', 1);
        ge.inputHandler.input.fire = true;
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOT_DIR}/epic-04-lightning-arc.png` });
    await page.evaluate(() => { window.gameEngine.inputHandler.input.fire = false; });

    // ── 05: rail driver double-helix ────────────────────────────────
    await page.evaluate(() => {
        const ge = window.gameEngine;
        if (ge.player.equipPrimary) ge.player.equipPrimary('RAIL_DRIVER');
        const p = ge.player;
        // line up a row of targets so the helix has visible reach
        for (let i = 0; i < 4; i++) {
            ge.enemyPool.get(p.x + 250 + i * 90, p.y + (i % 2 ? -40 : 40), 'HUNTER', 1);
        }
        ge.inputHandler.input.fire = true;
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOT_DIR}/epic-05-rail-helix.png` });
    await page.evaluate(() => { window.gameEngine.inputHandler.input.fire = false; });

    // ── 06: nova blast — equip power weapon and detonate ────────────
    await page.evaluate(() => {
        const ge = window.gameEngine;
        if (ge.player.equipPower) ge.player.equipPower('NOVA_BLAST');
        // Surround with enemies so the blast has visible impact
        const p = ge.player;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            ge.enemyPool.get(p.x + Math.cos(a) * 180, p.y + Math.sin(a) * 180, 'HUNTER', 1);
        }
        ge.inputHandler.input.firePower = true;
    });
    await page.waitForTimeout(280);
    await page.evaluate(() => { window.gameEngine.inputHandler.input.firePower = false; });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${SHOT_DIR}/epic-06-nova-blast.png` });

    // ── 07: TITAN boss confrontation ────────────────────────────────
    await page.evaluate(() => {
        const ge = window.gameEngine;
        // Clear screen then drop a TITAN
        if (ge.enemyPool.activeObjects) {
            for (const e of [...ge.enemyPool.activeObjects]) {
                if (e.type !== 'TITAN') ge.enemyPool.release(e);
            }
        }
        const p = ge.player;
        ge.enemyPool.get(p.x + 400, p.y, 'TITAN', 1);
        if (ge.player.equipPrimary) ge.player.equipPrimary('LANCE_BEAM');
    });
    await ai.run(1800);
    await page.screenshot({ path: `${SHOT_DIR}/epic-07-titan-boss.png` });

    // ── 08: shop UI between waves ───────────────────────────────────
    await page.evaluate(() => {
        const ge = window.gameEngine;
        ge.game.money = 8000;
        ge.player.skillPoints = 40;
        if (ge.openShop) ge.openShop();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOT_DIR}/epic-08-shop.png` });
    // Close shop
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // ── 09: radial weapon menu (hold R) ─────────────────────────────
    await page.keyboard.down('r');
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOT_DIR}/epic-09-radial-menu.png` });
    await page.keyboard.up('r');
    await page.waitForTimeout(200);

    // ── 10: enemy variety — one of each type ────────────────────────
    await page.evaluate(() => {
        const ge = window.gameEngine;
        // Clear current enemies
        if (ge.enemyPool.activeObjects) {
            for (const e of [...ge.enemyPool.activeObjects]) ge.enemyPool.release(e);
        }
        const p = ge.player;
        const types = ['HUNTER','GUARDIAN','WASP','STALKER','DRIFTER',
                       'PROWLER','WEAVER','SENTINEL','TANGERINE','TITAN'];
        // Distribute around the player
        for (let i = 0; i < types.length; i++) {
            const a = (i / types.length) * Math.PI * 2;
            const r = types[i] === 'TITAN' ? 380 : 260;
            ge.enemyPool.get(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, types[i], 1);
        }
        if (ge.player.equipPrimary) ge.player.equipPrimary('SCATTER_GUN');
    });
    await ai.run(1500);
    await page.screenshot({ path: `${SHOT_DIR}/epic-10-enemy-variety.png` });

    await ai.stop?.();
});
