/**
 * Capture stills for blog-article-on-fun.md.
 *
 * Each test below positions the game into a state matching one of the
 * article's themes, then writes a PNG to /screenshots/ in the project
 * root. Run with:
 *
 *   npx playwright test --project screenshots
 *
 * Or:
 *
 *   npx playwright test --project screenshots -g "01"
 *
 * Screenshots are written via page.screenshot() with `path` pointing
 * at the project's screenshots/ directory.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, spawnAsteroids, spawnEnemies } from '../helpers/game-helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// /tests/screenshots/capture.spec.js → /screenshots/
const SHOT_DIR = path.resolve(__dirname, '..', '..', 'screenshots');

const shot = (name) => path.join(SHOT_DIR, `${name}.png`);

// Quick deterministic delay helper — game uses requestAnimationFrame so
// we wait a few render frames after pushing state.
async function tick(page, frames = 30) {
    await page.evaluate(async (n) => {
        for (let i = 0; i < n; i++) {
            await new Promise(r => requestAnimationFrame(r));
        }
    }, frames);
}

test.describe('Blog article screenshots', () => {

    test.beforeEach(async ({ page }) => {
        page.on('pageerror', (err) => console.warn('[page error]', err.message));
        await loadGame(page);
    });

    test('01-title-screen', async ({ page }) => {
        // Pre-game shot — title screen / canvas before init().
        await tick(page, 60);
        await page.screenshot({ path: shot('01-title-screen'), fullPage: false });
    });

    test('02-asteroids-wireframe', async ({ page }) => {
        // Article opener: 3D wireframe asteroids on the dark canvas.
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            // Clear any wave entities for a clean asteroid showcase.
            for (const e of [...ge.enemyPool.activeObjects]) ge.enemyPool.release(e);
            for (const a of [...ge.asteroidPool.activeObjects]) ge.asteroidPool.release(a);
            // Spawn a balanced field of varied-size asteroids.
            for (let i = 0; i < 9; i++) {
                const x = 200 + (i % 3) * 320 + (Math.random() - 0.5) * 80;
                const y = 180 + Math.floor(i / 3) * 200 + (Math.random() - 0.5) * 60;
                const r = 25 + Math.random() * 35;
                ge.asteroidPool.get(x, y, r, 1);
            }
        });
        await tick(page, 90);
        await page.screenshot({ path: shot('02-asteroids-wireframe'), fullPage: false });
    });

    test('03-bullet-hell-density', async ({ page }) => {
        // Wave-1 frenetic intro: many enemies + many asteroids on screen.
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            for (const e of [...ge.enemyPool.activeObjects]) ge.enemyPool.release(e);
            for (const a of [...ge.asteroidPool.activeObjects]) ge.asteroidPool.release(a);
            // 8 hunters scattered, 12 asteroids — close to the wave-1
            // density set during the bullet-hell pass.
            const types = ['HUNTER', 'WASP', 'WEAVER'];
            for (let i = 0; i < 8; i++) {
                const x = 150 + Math.random() * (ge.gameField.width - 300);
                const y = 100 + Math.random() * (ge.gameField.height - 200);
                ge.enemyPool.get(x, y, types[i % types.length], 1);
            }
            for (let i = 0; i < 12; i++) {
                const x = Math.random() * ge.gameField.width;
                const y = Math.random() * ge.gameField.height;
                ge.asteroidPool.get(x, y, 25 + Math.random() * 35, 1);
            }
        });
        await tick(page, 90);
        await page.screenshot({ path: shot('03-bullet-hell-density'), fullPage: false });
    });

    test('04-hud-with-powerups', async ({ page }) => {
        // HUD shot showing top-left column (lives/level/coins/PRM-PWR
        // squares) and bottom-left powerup badge row with abbreviations.
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.money = 1240;
            ge.player.level = 4;
            // Simulate having picked up several powerups so the HUD
            // shows a row of abbreviation badges (RPD, MUL, BIG, SHLD,
            // CRIT, KNCK, etc.). addPowerup makes them permanent stacks.
            const types = ['RAPID_FIRE', 'MULTI_SHOT', 'BIG_BULLETS', 'SHIELD_BOOST',
                           'CRIT_CHANCE', 'KNOCKBACK', 'PIERCING', 'LONG_RANGE'];
            for (const t of types) {
                const cfg = ge.player.powerups.get(t)?.config
                    // Pull config from the canonical POWERUP_TYPES via a powerup
                    // pool item if no shop config — simplest: reuse the global.
                    ?? (ge.powerupPool && ge.powerupPool.activeObjects[0]?.config);
            }
            // Easier: drive addPowerup through the public path with a
            // synthetic config object that has the expected fields.
            // The HUD reads name/icon/abbr/description from config.
            // POWERUP_TYPES is the source of truth — import it via the
            // game's own bookkeeping.
        });
        // Wire up powerups via the player's addPowerup which expects
        // the actual POWERUP_TYPES config — easiest path: spawn a
        // Powerup object, read its config, then directly addPowerup.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const POWERUP_TYPES_LIST = ['RAPID_FIRE', 'MULTI_SHOT', 'BIG_BULLETS',
                'SHIELD_BOOST', 'CRIT_CHANCE', 'KNOCKBACK', 'PIERCING', 'LONG_RANGE'];
            for (const type of POWERUP_TYPES_LIST) {
                const p = ge.powerupPool.get(0, 0, type);
                if (p && p.config) {
                    // Stack 2-4 of each for visible numbers
                    const stacks = 1 + Math.floor(Math.random() * 3);
                    for (let i = 0; i < stacks; i++) {
                        ge.player.addPowerup(type, p.config);
                    }
                    p.active = false;
                }
            }
        });
        await tick(page, 60);
        // Force the HUD-DOM to sync at least one frame.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            if (typeof ge.syncPowerupHUD === 'function') ge.syncPowerupHUD();
        });
        await tick(page, 30);
        await page.screenshot({ path: shot('04-hud-with-powerups'), fullPage: false });
    });

    test('05-pause-shop', async ({ page }) => {
        // The shop overlay — slimmed to 4 tabs (HELP/PRIMARY/POWER/
        // DEFENSE/ABILITIES) after offense + drops moved to powerups.
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.money = 8500;
            ge.player.skillPoints = 6;
            ge.openShop();
        });
        await tick(page, 30);
        await page.screenshot({ path: shot('05-pause-shop'), fullPage: false });
    });

    test('06-powerups-pause-tab', async ({ page }) => {
        // The Powerups menu (a pause-menu tab) showing stacks per
        // powerup with "Name (ABV)" formatting and category sub-tabs.
        await startGame(page);
        // Stack a few powerups so the screen has owned + locked rows.
        await page.evaluate(() => {
            const ge = window.gameEngine;
            // 5.78.2 — DROPS-category seeds (MEDPACK, PAYDAY) removed.
            const seed = ['RAPID_FIRE', 'MULTI_SHOT', 'CRIT_CHANCE',
                          'KNOCKBACK', 'HEALTH_BOOST', 'SHIELD_BOOST'];
            for (const type of seed) {
                const p = ge.powerupPool.get(0, 0, type);
                if (p && p.config) {
                    for (let i = 0; i < 1 + Math.floor(Math.random() * 4); i++) {
                        ge.player.addPowerup(type, p.config);
                    }
                    p.active = false;
                }
            }
            // Pause and switch to Powerups tab.
            ge.togglePause();
            window.uiManager?.switchTab?.('powerups');
        });
        await tick(page, 30);
        // The pause overlay is a DOM panel — switch directly via dataset.
        await page.evaluate(() => {
            // Trigger via clicking the powerups tab button.
            const btn = document.querySelector('.pause-tab[data-tab="powerups"]');
            if (btn) btn.click();
        });
        await tick(page, 30);
        await page.screenshot({ path: shot('06-powerups-pause-tab'), fullPage: false });
    });

    test('07-mine-explosion', async ({ page }) => {
        // Seeker Mines mid-detonation — the chunky armed mine with
        // its trigger ring + magnetic field, surrounded by enemies
        // about to be ripped apart.
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            // Equip Mine Layer (it's free per the streamlined design).
            ge.player.ownedPowers.add('MINE_LAYER');
            ge.player.equipPower('MINE_LAYER');
            // Drop an armed mine right where the player is.
            const cfg = ge.PRIMARY_WEAPONS_LIST?.MINE_LAYER
                || (window.POWER_WEAPONS && window.POWER_WEAPONS.MINE_LAYER)
                || { mineRadius: 60, blastRadius: 80, mineDamage: 3, cooldown: 4000 };
            ge.player.layMine(cfg);
            // Force-arm the mine and put it in the urgent-blink state
            // for a more dramatic still.
            const m = ge.player.activeMines[ge.player.activeMines.length - 1];
            if (m) {
                m.armed = true;
                m.armTimer = 0;
                m.lifeTimer = 1200; // < URGENT_MS so it's pulsing red
            }
            // Cluster a few enemies near the mine.
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2;
                const x = ge.player.x + Math.cos(a) * 80;
                const y = ge.player.y + Math.sin(a) * 80;
                ge.enemyPool.get(x, y, 'HUNTER', 1);
            }
        });
        await tick(page, 30);
        await page.screenshot({ path: shot('07-mine-explosion'), fullPage: false });
    });

    test('08-lance-beam', async ({ page }) => {
        // Lance Beam mid-fire — sustained zig-zag energy beam after the
        // grow-in animation finishes. Capture during steady state with
        // an asteroid field in front of the player.
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.ownedPrimaries.add('LANCE_BEAM');
            ge.player.equipPrimary('LANCE_BEAM');
            // Aim toward right side of screen
            ge.player.angle = 0;
            ge.player.x = 250;
            ge.player.y = ge.gameField.height / 2;
            // Fan an asteroid line in front of the player so the beam
            // visibly intersects multiple targets.
            for (let i = 0; i < 5; i++) {
                ge.asteroidPool.get(
                    400 + i * 130,
                    ge.player.y + (Math.random() - 0.5) * 40,
                    25 + Math.random() * 25,
                    1,
                );
            }
            // Manually start the beam and bypass the grow-in window.
            const cfg = (ge._weaponCfg && ge._weaponCfg.LANCE_BEAM)
                || { beamDuration: 2000, damage: 0.06, beamWidth: 6, color: '#44ff44', range: 0.6 };
            if (typeof ge.player.startLanceBeam === 'function') {
                ge.player.startLanceBeam(ge.audioManager, cfg);
            } else {
                ge.player.beamActive = true;
                ge.player.beamTimer = 1500;
                ge.player.beamMaxDuration = 2000;
                ge.player.beamAngle = 0;
                ge.player.beamCurrentWidth = 6;
            }
            // Skip past the 150ms grow-in so the beam renders at full
            // size for the still.
            ge.player.beamTimer = (ge.player.beamMaxDuration || 2000) - 400;
        });
        await tick(page, 12);
        await page.screenshot({ path: shot('08-lance-beam'), fullPage: false });
    });

    test('09-pause-menu-tabs', async ({ page }) => {
        // Pause menu hub — tabs across the top, action buttons (SHOP /
        // RESUME) at the very top.
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.money = 1620;
            ge.togglePause();
        });
        await tick(page, 30);
        await page.screenshot({ path: shot('09-pause-menu-tabs'), fullPage: false });
    });

    test('10-music-player', async ({ page }) => {
        // The music player tab — shows the layout work (centered
        // play/prev/next, shuffle + random on left, repeat on right,
        // buffered fill ghost on the progress bar).
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.togglePause();
        });
        await tick(page, 20);
        await page.evaluate(() => {
            const btn = document.querySelector('.pause-tab[data-tab="music"]');
            if (btn) btn.click();
        });
        await tick(page, 30);
        await page.screenshot({ path: shot('10-music-player'), fullPage: false });
    });

    test('11-hud-tooltip-hover', async ({ page }) => {
        // Hover state on a powerup HUD badge — shows the contextual
        // description tooltip. Stack a couple powerups so a badge
        // exists, then move mouse over it.
        await startGame(page);
        await page.evaluate(() => {
            const ge = window.gameEngine;
            for (const type of ['CRIT_CHANCE', 'KNOCKBACK', 'PIERCING', 'BIG_BULLETS']) {
                const p = ge.powerupPool.get(0, 0, type);
                if (p && p.config) {
                    ge.player.addPowerup(type, p.config);
                    ge.player.addPowerup(type, p.config);
                    p.active = false;
                }
            }
            if (typeof ge.syncPowerupHUD === 'function') ge.syncPowerupHUD();
        });
        await tick(page, 30);
        // Use page.mouse directly — locator.hover() can fail if Playwright
        // thinks the element is occluded by the canvas. We just need the
        // CSS :hover state to fire so the ::after tooltip pops.
        const badge = page.locator('.powerup-hud-item').first();
        await expect(badge).toBeVisible({ timeout: 3000 });
        const box = await badge.boundingBox();
        if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        }
        await tick(page, 12);
        await page.screenshot({ path: shot('11-hud-tooltip-hover'), fullPage: false });
    });
});
