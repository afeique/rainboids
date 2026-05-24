/**
 * QA-16: font system + SETTINGS screen (6.158.0)
 *
 * Verifies the font registry, applyFonts() writing :root CSS variables,
 * the title SETTINGS button + overlay, the pause DISPLAY tab, and that
 * picking a font persists (rainboidsSettings) + applies live. Menus only —
 * canvas text is intentionally untouched.
 */

import { test, expect } from '@playwright/test';
import { loadGame } from '../helpers/game-helpers.js';

test.describe('QA-16: font system + SETTINGS', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsSettings'); } catch {} });
    });

    test('font registry exposes pixel + modern fonts with defaults', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const m = await import('/js/modules/ui/font-settings.js');
            return {
                count: m.FONTS.length,
                ids: m.FONTS.map((f) => f.id),
                kinds: [...new Set(m.FONTS.map((f) => f.kind))],
                defH: m.DEFAULT_HEADER_FONT,
                defB: m.DEFAULT_BODY_FONT,
            };
        });
        expect(r.count).toBeGreaterThanOrEqual(8);
        expect(r.ids).toEqual(expect.arrayContaining(['press-start-2p', 'silkscreen', 'roboto', 'montserrat', 'inter', 'helvetica']));
        expect(r.kinds).toEqual(expect.arrayContaining(['pixel', 'modern']));
        expect(r.defH).toBe('press-start-2p');
        expect(r.defB).toBe('silkscreen');
    });

    test('applyFonts writes the :root font variables', async ({ page }) => {
        const vars = await page.evaluate(async () => {
            const m = await import('/js/modules/ui/font-settings.js');
            m.applyFonts();
            const cs = getComputedStyle(document.documentElement);
            return {
                header: cs.getPropertyValue('--font-header').trim(),
                body: cs.getPropertyValue('--font-body').trim(),
            };
        });
        expect(vars.header).toContain('Press Start 2P');
        expect(vars.body).toContain('Silkscreen');
    });

    test('the title screen exposes a SETTINGS button', async ({ page }) => {
        await page.waitForFunction(() => window.gameEngine && window.gameEngine._titleButtonRects);
        const ok = await page.evaluate(() => {
            const s = window.gameEngine._titleButtonRects.settings;
            return !!(s && s.w > 0 && s.h > 0);
        });
        expect(ok).toBe(true);
    });

    test('openSettings shows the overlay with header + body pickers', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openSettings();
            const ov = document.getElementById('settings-overlay');
            const selects = document.querySelectorAll('#settings-overlay .font-select');
            return {
                state: window.gameEngine.game.state,
                display: ov && ov.style.display,
                open: window.gameEngine.isSettingsOpen(),
                selects: selects.length,
            };
        });
        expect(r.state).toBe('SETTINGS');
        expect(r.display).toBe('flex');
        expect(r.open).toBe(true);
        expect(r.selects).toBe(2);
    });

    test('picking a header font persists it and rewrites --font-header', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openSettings();
            const sel = document.querySelector('#settings-overlay .font-select'); // first = header
            sel.value = 'roboto';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            const cs = getComputedStyle(document.documentElement);
            const settings = JSON.parse(localStorage.getItem('rainboidsSettings') || '{}');
            return { header: cs.getPropertyValue('--font-header').trim(), saved: settings.headerFont };
        });
        expect(r.header).toContain('Roboto');
        expect(r.saved).toBe('roboto');
    });

    test('the pause menu has a DISPLAY tab with the font pickers', async ({ page }) => {
        const r = await page.evaluate(() => {
            const tabBtn = document.querySelector('.pause-tab[data-tab="display"]');
            const content = document.getElementById('display-tab');
            const selects = content ? content.querySelectorAll('.font-select') : [];
            return { tab: !!tabBtn, content: !!content, selects: selects.length };
        });
        expect(r.tab).toBe(true);
        expect(r.content).toBe(true);
        expect(r.selects).toBe(2);
    });

    test('BACK returns to the title screen and hides the overlay', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openSettings();
            ge._settingsOverlay.back();
            const ov = document.getElementById('settings-overlay');
            return { state: ge.game.state, display: ov && ov.style.display, open: ge.isSettingsOpen() };
        });
        expect(r.state).toBe('TITLE_SCREEN');
        expect(r.display).toBe('none');
        expect(r.open).toBe(false);
    });

    test('a persisted body font is applied on boot', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('rainboidsSettings', JSON.stringify({ bodyFont: 'inter' })));
        await page.reload();
        await page.waitForFunction(() => !!window.gameEngine);
        const body = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim());
        expect(body).toContain('Inter');
    });

    test('no fatal JS errors through the settings flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openSettings();
            const [h, b] = document.querySelectorAll('#settings-overlay .font-select');
            for (const v of ['montserrat', 'helvetica', 'system', 'press-start-2p']) {
                h.value = v; h.dispatchEvent(new Event('change', { bubbles: true }));
            }
            b.value = 'fira-code'; b.dispatchEvent(new Event('change', { bubbles: true }));
            const reset = document.querySelector('#settings-overlay .font-btn--reset');
            if (reset) reset.click();
            ge._settingsOverlay.back();
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
