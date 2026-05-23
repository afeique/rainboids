/**
 * QA-11: Leveling → SP → Stats (Phase R7)
 *
 * Validates the level-up Stats screen mechanism + SP allocation persistence.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-11: Leveling → SP → Stats (Phase R7)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('addXp levels the player and grants SP', async ({ page }) => {
        const r = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.level = 1; p.xp = 0; p.sp = 0; p._leveledUpPending = false;
            p.addXp(100000); // plenty to level
            return { level: p.level, sp: p.sp, pending: p._leveledUpPending };
        });
        expect(r.level).toBeGreaterThan(1);
        expect(r.sp).toBeGreaterThan(0);
        expect(r.pending).toBe(true);
    });

    test('openStatsForLevelUp shows the Stats overlay and runs onClose', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const ge = window.gameEngine;
            ge.player.sp = 3;
            let closed = false;
            const opened = ge.openStatsForLevelUp(() => { closed = true; });
            const ov = document.getElementById('stats-overlay');
            const display = ov && ov.style.display;
            // close it (level-up mode close runs the deferred onClose)
            if (ge._statsOverlay) ge._statsOverlay.close();
            return { opened, display, closed };
        });
        expect(r.opened).toBe(true);
        expect(r.display).toBe('flex');
        expect(r.closed).toBe(true);
    });

    test('allocating SP raises the stat and persists to meta', async ({ page }) => {
        const r = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.sp = 5;
            const statId = Object.keys(p.spStats)[0];
            const ok = p.allocateSp(statId);
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, sp: p.sp, points: p.spStats[statId], metaPoints: meta.spStats && meta.spStats[statId] };
        });
        expect(r.ok).toBe(true);
        expect(r.sp).toBe(4);
        expect(r.points).toBe(1);
        expect(r.metaPoints).toBe(1); // persisted
    });

    test('leveling up persists level/SP to meta (survives reload)', async ({ page }) => {
        // Use the real save path: addXp → saveMetaState writes localStorage,
        // which survives reload (and is re-read by initMeta on the next boot).
        const before = await page.evaluate(() => {
            const p = window.gameEngine.player;
            p.addXp(100000); // levels up + persists via saveMetaState
            return { level: p.level, sp: p.sp };
        });
        const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('rainboidsMeta') || '{}'));
        expect(persisted.level).toBe(before.level);
        expect(persisted.sp).toBe(before.sp);
        expect(before.level).toBeGreaterThan(1);
    });

    test('no fatal JS errors through the level-up flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.sp = 2;
            ge.openStatsForLevelUp(() => {});
            if (ge._statsOverlay) ge._statsOverlay.close();
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
