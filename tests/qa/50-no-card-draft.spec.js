/**
 * QA-50: the in-run CARD DRAFT + post-card QUICK-BUY are gone (looter pivot T70).
 *
 * Power now comes from looted gear/traits, so the per-wave "pick a powerup card"
 * draft (#wave-pick-overlay) and its post-card shop-suggest overlay
 * (#shop-suggest-overlay) were removed entirely. The per-stage choose-moment is
 * the run stage DRAFT (a separate system, kept). This spec guards the removal:
 * the overlay stubs and engine methods are gone, no draft DOM is reachable, and
 * the game still advances through waves without them.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-50: card draft removed', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        await loadGame(page);
    });

    test('the card-draft / shop-suggest overlays + engine methods are gone', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            return {
                wavePickStub: !!document.getElementById('wave-pick-overlay'),
                shopSuggestStub: !!document.getElementById('shop-suggest-overlay'),
                hasOpenMenu: typeof ge.openWaveClearPowerupsMenu === 'function',
                hasOpenPick: typeof ge.openWavePickOverlay === 'function',
                hasClosePick: typeof ge.closeWavePickOverlay === 'function',
                hasShopSuggest: typeof ge.openShopSuggestOverlay === 'function',
                draftCardsInDom: document.querySelectorAll('.wave-pick-card, .shop-suggest-skip').length,
            };
        });
        expect(r.wavePickStub).toBe(false);
        expect(r.shopSuggestStub).toBe(false);
        expect(r.hasOpenMenu).toBe(false);
        expect(r.hasOpenPick).toBe(false);
        expect(r.hasClosePick).toBe(false);
        expect(r.hasShopSuggest).toBe(false);
        expect(r.draftCardsInDom).toBe(0);
    });

    test('a wave clear advances the run without any card overlay (no soft-lock)', async ({ page }) => {
        await startGame(page);
        const r = await page.evaluate(async () => {
            const ge = window.gameEngine;
            // Clear the field and let the wave-complete path run. Force the
            // wave-clear check; the run must NOT stall on a card overlay.
            ge.enemyPool.activeObjects.length = 0;
            ge.asteroidPool.activeObjects.length = 0;
            if (typeof ge.checkWaveComplete === 'function') ge.checkWaveComplete();
            // Wait out the 2.7s advance timer + a margin.
            await new Promise((res) => setTimeout(res, 3200));
            return {
                state: ge.game.state,
                wavePickShown: !!document.querySelector('.wave-pick-card'),
                anyCardOverlay: !!(document.getElementById('wave-pick-overlay') || document.getElementById('shop-suggest-overlay')),
            };
        });
        // No card overlay ever appears; the run is in a live/advancing state.
        expect(r.wavePickShown).toBe(false);
        expect(r.anyCardOverlay).toBe(false);
        expect(['PLAYING', 'WAVE_TRANSITION', 'PAUSED']).toContain(r.state);

        const fatal = page._jsErrors.filter((m) =>
            !/sfxr|Audio|audio|Font|net::ERR|favicon|ResizeObserver/i.test(m));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toEqual([]);
    });
});
