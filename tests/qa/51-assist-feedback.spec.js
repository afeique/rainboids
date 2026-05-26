/**
 * QA-51: AI Co-Pilot auto-cast feedback (FB-1, P7)
 *
 * The Assist System auto-fires abilities and stamps
 * `player._lastAssistCast = { id, slot, t }`. FB-1 surfaces that on the HUD:
 *   - a per-slot pip flash (engine._assistCastFlash = { slot, until }),
 *   - a short "↑ NAME" toast (engine._assistToast).
 *
 * These tests boot a real run, simulate an auto-cast by writing the same stamp
 * the Co-Pilot writes, drive a HUD frame (engine.drawHUD()), and assert the
 * feedback state the render arms. The DEFAULT-SAFE case (no _lastAssistCast)
 * arms nothing.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

test.describe('QA-51: Co-Pilot auto-cast feedback', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await startGame(page);
    });

    test('a new auto-cast arms the pip flash + assist toast', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            // Reset feedback state so we measure a clean arm.
            ge._assistCastFlash = null;
            ge._assistToast = null;
            ge._lastAssistCastSeenT = undefined;
            // Simulate the stamp the Assist System writes on a BULWARK cast.
            p._lastAssistCast = { id: 'BULWARK', slot: 0, t: Date.now() };
            ge.drawHUD();
            return {
                flashSlot: ge._assistCastFlash ? ge._assistCastFlash.slot : null,
                flashUntilFuture: ge._assistCastFlash ? ge._assistCastFlash.until > Date.now() : false,
                toastTitle: ge._assistToast ? ge._assistToast.title : null,
                seenT: ge._lastAssistCastSeenT,
                castT: p._lastAssistCast.t,
            };
        });
        expect(r.flashSlot).toBe(0);
        expect(r.flashUntilFuture).toBe(true);
        expect(r.toastTitle).toBe('Bulwark');
        expect(r.seenT).toBe(r.castT); // detector recorded the timestamp
    });

    test('default-safe: no _lastAssistCast arms no feedback', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge._assistCastFlash = null;
            ge._assistToast = null;
            ge._lastAssistCastSeenT = undefined;
            // Ensure no stamp exists (a player not using the Co-Pilot).
            delete ge.player._lastAssistCast;
            ge.drawHUD();
            return {
                flash: ge._assistCastFlash,
                toast: ge._assistToast,
            };
        });
        expect(r.flash == null).toBe(true);
        expect(r.toast == null).toBe(true);
    });

    test('the same cast does not re-fire on later frames (edge-triggered)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            ge._assistCastFlash = null;
            ge._assistToast = null;
            ge._lastAssistCastSeenT = undefined;
            p._lastAssistCast = { id: 'EMP_PULSE', slot: 1, t: Date.now() };
            ge.drawHUD();                  // first frame arms the flash
            // Clear the flash to detect any erroneous re-arm on the next frame.
            ge._assistCastFlash = null;
            ge.drawHUD();                  // same stamp → must NOT re-arm
            return { reArmed: ge._assistCastFlash != null };
        });
        expect(r.reArmed).toBe(false);
    });

    test('a fresh cast (new timestamp) re-fires the feedback', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const p = ge.player;
            ge._assistCastFlash = null;
            ge._assistToast = null;
            ge._lastAssistCastSeenT = undefined;
            p._lastAssistCast = { id: 'EMP_PULSE', slot: 1, t: 1000 };
            ge.drawHUD();
            const firstSlot = ge._assistCastFlash ? ge._assistCastFlash.slot : null;
            // A genuinely new cast on a different slot + timestamp.
            p._lastAssistCast = { id: 'FIELD_MEDIC', slot: 2, t: 2000 };
            ge._assistCastFlash = null;
            ge.drawHUD();
            return {
                firstSlot,
                secondSlot: ge._assistCastFlash ? ge._assistCastFlash.slot : null,
                toastTitle: ge._assistToast ? ge._assistToast.title : null,
            };
        });
        expect(r.firstSlot).toBe(1);
        expect(r.secondSlot).toBe(2);
        expect(r.toastTitle).toBe('Field Medic');
    });

    test('no fatal JS errors through the HUD draw with feedback active', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player._lastAssistCast = { id: 'BULWARK', slot: 0, t: Date.now() };
            ge.drawHUD();
            ge.drawHUD();
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
