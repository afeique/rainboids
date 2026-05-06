/**
 * Showcase screenshots — title screen, starfield-only stills, and a
 * series of action shots staged with randomized in-game state. Run:
 *
 *   npx playwright test --project screenshots -g showcase
 *
 * Stills are written to /screenshots/ at the project root.
 */

import { test } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SHOT_DIR = path.resolve(__dirname, '..', '..', 'screenshots');
const shot = (name) => path.join(SHOT_DIR, `${name}.png`);

async function tick(page, frames = 30) {
    await page.evaluate(async (n) => {
        for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
    }, frames);
}

// Strip every entity pool except the field/HUD background — used for
// "starfield only" shots. Particles cleared too so no leftover sparkles.
async function clearAllEntities(page) {
    await page.evaluate(() => {
        const ge = window.gameEngine;
        const pools = [
            ge.enemyPool, ge.asteroidPool, ge.bulletPool, ge.enemyBulletPool,
            ge.particlePool, ge.lineDebrisPool, ge.powerupPool,
        ];
        for (const p of pools) {
            if (!p) continue;
            for (const o of [...(p.activeObjects || [])]) p.release(o);
        }
        // Hide the player ship for a pure-starfield frame.
        if (ge.player) ge.player.active = false;
    });
}

// Stage a single random "live action" frame: enemies, asteroids, player
// firing bullets, occasional power weapon, partial health, gold orbs, and
// powerup HUD items. Variability is high so each call paints a different
// scenario.
async function stageAction(page, opts = {}) {
    await page.evaluate((opts) => {
        const ge = window.gameEngine;
        // Wipe whatever wave-init spawned so we can stage from scratch.
        for (const e of [...ge.enemyPool.activeObjects]) ge.enemyPool.release(e);
        for (const a of [...ge.asteroidPool.activeObjects]) ge.asteroidPool.release(a);
        for (const b of [...ge.bulletPool.activeObjects]) ge.bulletPool.release(b);
        for (const eb of [...ge.enemyBulletPool.activeObjects]) ge.enemyBulletPool.release(eb);
        for (const cs of [...ge.colorStarPool.activeObjects]) {
            if (cs.isCollectible) ge.colorStarPool.release(cs);
        }

        const W = ge.gameField.width;
        const H = ge.gameField.height;

        // Player setup — varied position, partial health, mid-game gold.
        ge.player.active = true;
        ge.player.x = W * (0.20 + Math.random() * 0.40);
        ge.player.y = H * (0.30 + Math.random() * 0.40);
        ge.player.angle = Math.random() * Math.PI * 2;
        ge.player.health = Math.max(8, Math.floor(ge.player.maxHealth * (opts.healthFrac ?? 0.4 + Math.random() * 0.5)));
        ge.player.level = opts.level ?? (3 + Math.floor(Math.random() * 8));
        ge.game.money = opts.money ?? Math.floor(800 + Math.random() * 12000);

        // Camera — center on player so the staged action lands in view.
        ge.camera.x = Math.max(0, Math.min(W - ge.width, ge.player.x - ge.width / 2));
        ge.camera.y = Math.max(0, Math.min(H - ge.height, ge.player.y - ge.height / 2));

        // Enemies — mix of types in a viewport-relative spread.
        const enemyTypes = opts.enemyTypes ?? ['HUNTER', 'WASP', 'WEAVER', 'STALKER', 'DRIFTER', 'GUARDIAN'];
        const enemyCount = opts.enemyCount ?? (5 + ((Math.random() * 6) | 0));
        for (let i = 0; i < enemyCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 240 + Math.random() * 380;
            const x = ge.player.x + Math.cos(angle) * dist;
            const y = ge.player.y + Math.sin(angle) * dist;
            const type = enemyTypes[(Math.random() * enemyTypes.length) | 0];
            const e = ge.enemyPool.get();
            if (e) {
                e.reset(
                    Math.max(50, Math.min(W - 50, x)),
                    Math.max(50, Math.min(H - 50, y)),
                    type, ge.game.enemyLevel, ge,
                );
                e.warping = false;
                e.active = true;
            }
        }

        // Boss option
        if (opts.boss) {
            const bx = ge.player.x + 320;
            const by = ge.player.y;
            const e = ge.enemyPool.get();
            if (e) {
                e.reset(
                    Math.max(80, Math.min(W - 80, bx)),
                    Math.max(80, Math.min(H - 80, by)),
                    opts.boss, ge.game.enemyLevel, ge,
                );
                e.warping = false;
                e.active = true;
                if (typeof ge.applyEnemyLevelScaling === 'function') {
                    ge.applyEnemyLevelScaling(e, { bossTier: 1 });
                }
            }
        }

        // Asteroids — spread, varied sizes.
        const astCount = opts.astCount ?? (4 + ((Math.random() * 6) | 0));
        for (let i = 0; i < astCount; i++) {
            const x = Math.random() * W;
            const y = Math.random() * H;
            const r = 22 + Math.random() * 36;
            ge.asteroidPool.get(x, y, r, 1);
        }

        // Player bullets in flight — fan angles around the player's facing.
        const bulletCount = 8 + ((Math.random() * 8) | 0);
        for (let i = 0; i < bulletCount; i++) {
            const spread = (Math.random() - 0.5) * 0.6;
            const a = ge.player.angle + spread;
            const dist = 40 + Math.random() * 380;
            const bx = ge.player.x + Math.cos(a) * dist;
            const by = ge.player.y + Math.sin(a) * dist;
            const b = ge.bulletPool.get();
            if (b && typeof b.reset === 'function') {
                b.reset(bx, by, a, 12, '#88ddff', ge);
                b.active = true;
            }
        }

        // Enemy bullets — sprinkle some in flight to add danger feel.
        const ebCount = 6 + ((Math.random() * 6) | 0);
        for (let i = 0; i < ebCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 120 + Math.random() * 320;
            const ex = ge.player.x + Math.cos(angle) * dist;
            const ey = ge.player.y + Math.sin(angle) * dist;
            const eb = ge.enemyBulletPool.get();
            if (eb && typeof eb.reset === 'function') {
                eb.reset(ex, ey, angle + Math.PI, 4, '#ff5555', ge);
                eb.active = true;
            }
        }

        // Collectible gold + health orbs scattered for visual richness.
        if (typeof ge.createMoneyOrb === 'function') {
            for (let i = 0; i < 6 + ((Math.random() * 5) | 0); i++) {
                const x = ge.player.x + (Math.random() - 0.5) * 600;
                const y = ge.player.y + (Math.random() - 0.5) * 400;
                ge.createMoneyOrb(
                    Math.max(40, Math.min(W - 40, x)),
                    Math.max(40, Math.min(H - 40, y)),
                    5 + Math.floor(Math.random() * 16),
                );
            }
        }
        if (typeof ge.createHealthOrb === 'function') {
            for (let i = 0; i < 2 + ((Math.random() * 2) | 0); i++) {
                const x = ge.player.x + (Math.random() - 0.5) * 500;
                const y = ge.player.y + (Math.random() - 0.5) * 360;
                ge.createHealthOrb(
                    Math.max(40, Math.min(W - 40, x)),
                    Math.max(40, Math.min(H - 40, y)),
                    1 + Math.floor(Math.random() * 2),
                );
            }
        }

        // Powerup HUD — random selection of stacks for visual loadout.
        // 5.78.2 — DROPS-category seeds (MEDPACK, PAYDAY) removed.
        const allTypes = [
            'RAPID_FIRE', 'MULTI_SHOT', 'BIG_BULLETS', 'CRIT_CHANCE',
            'CRIT_DAMAGE', 'HOMING', 'PIERCING', 'SHIELD_BOOST',
            'EXPLOSIVE', 'LONG_RANGE', 'KNOCKBACK', 'SPEED_BOOST',
            'HEALTH_BOOST', 'HEALTH_DROP_FREQUENCY',
        ];
        const picks = allTypes.sort(() => Math.random() - 0.5).slice(0, 6 + ((Math.random() * 5) | 0));
        for (const type of picks) {
            const p = ge.powerupPool.get(0, 0, type);
            if (p && p.config) {
                const stacks = 1 + Math.floor(Math.random() * 4);
                for (let i = 0; i < stacks; i++) ge.player.addPowerup(type, p.config);
                p.active = false;
            }
        }

        // Killstreak for the streak HUD readout.
        ge.killStreakCount = 5 + ((Math.random() * 14) | 0);
        ge.killStreakTimer = Date.now() - Math.floor(Math.random() * 4000);

        // Sync powerup HUD DOM for the visible badges.
        if (typeof ge.syncPowerupHUD === 'function') ge.syncPowerupHUD();
    }, opts);
}

test.describe('Showcase screenshots', () => {

    test.beforeEach(async ({ page }) => {
        page.on('pageerror', (err) => console.warn('[page error]', err.message));
        await loadGame(page);
    });

    test('00-title-screen', async ({ page }) => {
        // Title screen — let the wavy text/animation settle a couple seconds.
        await tick(page, 180);
        await page.screenshot({ path: shot('00-title-screen'), fullPage: false });
    });

    // Three starfield-only frames. Each test re-rolls the nebula
    // palette + lens-flare layer, so different scenes show up.
    for (const idx of [1, 2, 3]) {
        test(`starfield-${idx}`, async ({ page }) => {
            await startGame(page);
            // Park state in WAVE_TRANSITION so the empty-enemy-pool
            // wave-clear check in updateWaveSystem doesn't fire and
            // pop the powerups menu. Mark waveComplete=true as a
            // belt-and-suspenders against the recovery branch.
            await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.game.state = 'WAVE_TRANSITION';
                ge.game.waveComplete = true;
                // Hide pause / shop overlays / DOM HUD readouts so the
                // frame is purely the WebGL starfield + nebula.
                for (const id of ['pause-overlay', 'shop-overlay', 'powerup-hud', 'hud-pause-btn', 'hud-shop-btn']) {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                }
                if (ge.starfieldRenderer && ge.starfieldRenderer.clear) ge.starfieldRenderer.clear();
                if (typeof ge.generateInitialColorStars === 'function') ge.generateInitialColorStars();
                if (typeof ge.generateBackgroundStars === 'function') ge.generateBackgroundStars();
                if (typeof ge._populateWebGLNebula === 'function') ge._populateWebGLNebula();
                const neb = window.nebulaRenderer
                    || (ge.uiManager && ge.uiManager.nebulaRenderer);
                if (neb && typeof neb.generate === 'function') {
                    neb.generate(ge.gameField.width, ge.gameField.height);
                }
            });
            await clearAllEntities(page);
            await tick(page, 60);
            await page.screenshot({ path: shot(`starfield-${idx}`), fullPage: false });
        });
    }

    test('action-01-wave-skirmish', async ({ page }) => {
        await startGame(page);
        await stageAction(page, {
            healthFrac: 0.65,
            level: 4,
            money: 1850,
            enemyCount: 7,
            astCount: 6,
            enemyTypes: ['HUNTER', 'WASP', 'WEAVER', 'STALKER'],
        });
        await tick(page, 16);
        await page.screenshot({ path: shot('action-01-wave-skirmish'), fullPage: false });
    });

    test('action-02-bullet-hell', async ({ page }) => {
        await startGame(page);
        await stageAction(page, {
            healthFrac: 0.35,
            level: 9,
            money: 5800,
            enemyCount: 11,
            astCount: 8,
            enemyTypes: ['HUNTER', 'WASP', 'STALKER', 'DRIFTER', 'GUARDIAN'],
        });
        await tick(page, 16);
        await page.screenshot({ path: shot('action-02-bullet-hell'), fullPage: false });
    });

    test('action-03-low-health-clutch', async ({ page }) => {
        await startGame(page);
        await stageAction(page, {
            healthFrac: 0.18,
            level: 7,
            money: 3200,
            enemyCount: 9,
            astCount: 5,
        });
        await tick(page, 16);
        await page.screenshot({ path: shot('action-03-low-health-clutch'), fullPage: false });
    });

    test('action-04-titan-boss', async ({ page }) => {
        await startGame(page);
        await stageAction(page, {
            healthFrac: 0.55,
            level: 12,
            money: 9200,
            enemyCount: 4,
            astCount: 6,
            boss: 'TITAN',
            enemyTypes: ['HUNTER', 'GUARDIAN', 'STALKER'],
        });
        await tick(page, 24);
        await page.screenshot({ path: shot('action-04-titan-boss'), fullPage: false });
    });

    test('action-05-prowler-pack', async ({ page }) => {
        await startGame(page);
        await stageAction(page, {
            healthFrac: 0.5,
            level: 8,
            money: 6400,
            enemyCount: 6,
            astCount: 7,
            enemyTypes: ['PROWLER', 'TANGERINE', 'DRIFTER'],
        });
        await tick(page, 16);
        await page.screenshot({ path: shot('action-05-prowler-pack'), fullPage: false });
    });

    test('action-06-gold-rush', async ({ page }) => {
        // Same as a normal action shot, but with extra gold orbs scattered.
        await startGame(page);
        await stageAction(page, {
            healthFrac: 0.85,
            level: 10,
            money: 14500,
            enemyCount: 4,
            astCount: 4,
        });
        await page.evaluate(() => {
            const ge = window.gameEngine;
            for (let i = 0; i < 18; i++) {
                const x = ge.player.x + (Math.random() - 0.5) * 700;
                const y = ge.player.y + (Math.random() - 0.5) * 480;
                ge.createMoneyOrb(
                    Math.max(40, Math.min(ge.gameField.width - 40, x)),
                    Math.max(40, Math.min(ge.gameField.height - 40, y)),
                    8 + Math.floor(Math.random() * 14),
                );
            }
        });
        await tick(page, 16);
        await page.screenshot({ path: shot('action-06-gold-rush'), fullPage: false });
    });

    test('action-07-mixed-fleet', async ({ page }) => {
        await startGame(page);
        await stageAction(page, {
            healthFrac: 0.7,
            level: 6,
            money: 2400,
            enemyCount: 9,
            astCount: 7,
            enemyTypes: ['HUNTER', 'WASP', 'WEAVER', 'STALKER', 'DRIFTER', 'GUARDIAN', 'TANGERINE'],
        });
        await tick(page, 16);
        await page.screenshot({ path: shot('action-07-mixed-fleet'), fullPage: false });
    });
});
