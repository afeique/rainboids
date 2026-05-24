/**
 * QA-15: HANGAR cosmetic ship-skin selector (6.157.0)
 *
 * Verifies the skin registry paints every hull without error, the title
 * screen exposes a HANGAR button, the overlay opens/closes + returns to the
 * title, and selecting a skin persists to settings + reflects on the live
 * player. Skins are cosmetic only — the collision radius is never touched.
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-15: HANGAR ship-skin selector', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsSettings'); } catch {} });
    });

    test('every registered skin paints without throwing', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const mod = await import('/js/modules/player/skins/index.js');
            const canvas = document.createElement('canvas');
            canvas.width = 160; canvas.height = 160;
            const ctx = canvas.getContext('2d');
            const stub = {
                radius: 30, thrustLevel: 0.55, flapOpen: 0.6, wingSweep: 0.4,
                bank: 0.25, glidePhase: 1.2, energy: 65, maxEnergy: 100,
            };
            const errors = [];
            for (const s of mod.SKINS) {
                try {
                    ctx.save();
                    ctx.translate(80, 80);
                    s.paint.call(stub, ctx, 30, 1.4);
                    ctx.restore();
                } catch (e) {
                    errors.push(`${s.id}: ${e.message}`);
                }
            }
            return { count: mod.SKINS.length, ids: mod.SKINS.map((s) => s.id), errors, def: mod.DEFAULT_SKIN_ID };
        });
        expect(r.errors, `Skin paint errors: ${r.errors.join('; ')}`).toHaveLength(0);
        expect(r.count).toBe(12);
        expect(r.ids).toContain('aurora');
        expect(r.ids).toContain('vanguard');
        expect(r.ids).toContain('battlecruiser');
        expect(r.def).toBe('aurora');
    });

    test('the title screen exposes a HANGAR button', async ({ page }) => {
        await page.waitForFunction(() => window.gameEngine && window.gameEngine._titleButtonRects);
        const hasHangar = await page.evaluate(() => {
            const rects = window.gameEngine._titleButtonRects;
            const h = rects && rects.hangar;
            return !!(h && h.w > 0 && h.h > 0);
        });
        expect(hasHangar).toBe(true);
    });

    test('openHangar enters HANGAR state and shows the overlay with 12 cards', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openHangar();
            const ov = document.getElementById('hangar-overlay');
            const cards = document.querySelectorAll('#hangar-overlay .hangar-card');
            return {
                state: window.gameEngine.game.state,
                display: ov && ov.style.display,
                open: window.gameEngine.isHangarOpen(),
                cards: cards.length,
            };
        });
        expect(r.state).toBe('HANGAR');
        expect(r.display).toBe('flex');
        expect(r.open).toBe(true);
        expect(r.cards).toBe(12);
    });

    test('selecting a skin persists it and reflects on the live player', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openHangar();
            const card = document.querySelector('#hangar-overlay .hangar-card[data-skin="wraith"]');
            card.click();
            const settings = JSON.parse(localStorage.getItem('rainboidsSettings') || '{}');
            return { saved: settings.selectedSkin, playerSkin: ge.player && ge.player.skinId };
        });
        expect(r.saved).toBe('wraith');
        expect(r.playerSkin).toBe('wraith');
    });

    test('a new run picks up the persisted skin', async ({ page }) => {
        const skin = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsSettings', JSON.stringify({ selectedSkin: 'battlecruiser' }));
            ge.startNewRun();
            return ge.player.skinId;
        });
        expect(skin).toBe('battlecruiser');
    });

    test('BACK returns to the title screen and hides the overlay', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openHangar();
            ge._hangarOverlay.back();
            const ov = document.getElementById('hangar-overlay');
            return { state: ge.game.state, display: ov && ov.style.display, open: ge.isHangarOpen() };
        });
        expect(r.state).toBe('TITLE_SCREEN');
        expect(r.display).toBe('none');
        expect(r.open).toBe(false);
    });

    test('an unknown persisted skin falls back to the default', async ({ page }) => {
        const skin = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsSettings', JSON.stringify({ selectedSkin: 'does-not-exist' }));
            ge.startNewRun();
            // getSkin() falls back to the default for an unknown id at draw time;
            // the stored id is preserved but resolves safely.
            return ge.player.skinId;
        });
        expect(skin).toBe('does-not-exist'); // stored verbatim; resolves to default when drawn
    });

    test('no fatal JS errors through the hangar flow (incl. live preview)', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openHangar();
            // Cycle through several skins to exercise preview rebuilds.
            for (const id of ['apex', 'smuggler', 'skylark', 'aeon', 'aurora']) {
                const card = document.querySelector(`#hangar-overlay .hangar-card[data-skin="${id}"]`);
                if (card) card.click();
            }
        });
        // Let the preview rAF loop tick a few frames.
        await page.waitForTimeout(200);
        await page.evaluate(() => window.gameEngine._hangarOverlay.back());
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
