/**
 * QA-08: Armory pre-run flow + gold economy (Phase R2)
 *
 * Verifies the NEW GAME → ARMORY → run flow, account-gold unlock
 * purchasing, run-gold starting at 0, and run-end banking.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, getGameState } from '../helpers/game-helpers.js';

test.describe('QA-08: Armory + gold economy', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        // Start from a clean meta wallet for deterministic assertions.
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('openArmory enters ARMORY state and shows the overlay', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const ov = document.getElementById('armory-overlay');
            return { state: window.gameEngine.game.state, display: ov && ov.style.display };
        });
        expect(r.state).toBe('ARMORY');
        expect(r.display).toBe('flex');
    });

    test('BACK from the armory returns to the title screen', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge._armoryOverlay.back();
            const ov = document.getElementById('armory-overlay');
            return { state: ge.game.state, display: ov && ov.style.display };
        });
        expect(r.state).toBe('TITLE_SCREEN');
        expect(r.display).toBe('none');
    });

    test('buying an unlock deducts account-gold and persists it', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 5000;
            ge._armoryOverlay.render();
            const ok = ge._armoryOverlay.buy('primaries', 'STORM_NEEDLES');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, gold: ge.game.accountGold, unlocked: meta.unlockedPrimaries || [], metaGold: meta.accountGold };
        });
        expect(r.ok).toBe(true);
        expect(r.gold).toBe(5000 - 1200);
        expect(r.unlocked).toContain('STORM_NEEDLES');
        expect(r.metaGold).toBe(3800);
    });

    test('cannot buy an unlock you cannot afford', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 10;
            ge._armoryOverlay.render();
            const ok = ge._armoryOverlay.buy('abilities', 'EMP_PULSE');
            return { ok, gold: ge.game.accountGold };
        });
        expect(r.ok).toBe(false);
        expect(r.gold).toBe(10);
    });

    test('a purchased unlock joins the owned pool on the next run', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 5000;
            ge._armoryOverlay.buy('primaries', 'STORM_NEEDLES');
            // Begin the run and read the owned pool.
            ge.startNewRun();
            return [...ge.player.ownedPrimaries];
        });
        expect(r).toContain('PULSE_CANNON'); // base
        expect(r).toContain('STORM_NEEDLES'); // purchased
    });

    test('run-gold starts at 0 on a fresh run', async ({ page }) => {
        await startGame(page);
        const money = await page.evaluate(() => window.gameEngine.game.money);
        expect(money).toBe(0);
    });

    test('run-end banks leftover run-gold into the account wallet', async ({ page }) => {
        await startGame(page);
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.accountGold = 1000;
            ge.game.money = 450;
            ge._runGoldBanked = false;
            ge.game.state = 'GAME_OVER'; // onEnter hook banks
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { gold: ge.game.accountGold, metaGold: meta.accountGold };
        });
        expect(r.gold).toBe(1450);
        expect(r.metaGold).toBe(1450);
    });

    test('banking is idempotent within a run (no double-bank)', async ({ page }) => {
        await startGame(page);
        const gold = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.accountGold = 1000;
            ge.game.money = 200;
            ge._runGoldBanked = false;
            ge.bankRunGold();
            ge.bankRunGold(); // second call must be a no-op
            return ge.game.accountGold;
        });
        expect(gold).toBe(1200);
    });

    test('no fatal JS errors through the armory flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.game.accountGold = 9999;
            ge._armoryOverlay.render();
            ge._armoryOverlay.buy('powers', 'NOVA_BLAST');
            ge._armoryOverlay.back();
        });
        const fatal = page._jsErrors.filter(m =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
