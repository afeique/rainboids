/**
 * QA-10: Per-run card draft (Phase R3)
 *
 * Validates the wave-clear card overlay shows relevance-filtered weapon +
 * ability powerup cards (not the old PASSIVE stat cards) and applies a pick.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

async function setLoadoutAndDraft(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        // Known loadout: Pulse Cannon primary, Charge Shot power, Bulwark ability.
        p.ownedPrimaries = new Set(['PULSE_CANNON']);
        p.ownedPowers = new Set(['CHARGE_SHOT']);
        p.equippedAbilities = ['BULWARK', null, null, null];
        ge.openWavePickOverlay();
        const cards = [...document.querySelectorAll('#wave-pick-cards .wave-pick-card')]
            .map((c) => c.querySelector('.wave-pick-card-name')?.textContent || '');
        const ov = document.getElementById('wave-pick-overlay');
        return { cards, display: ov && ov.style.display };
    });
}

test.describe('QA-10: Card draft (Phase R3)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('draft overlay opens with 1–4 cards (W4: 1 primary + 1 power + 2 ability)', async ({ page }) => {
        const r = await setLoadoutAndDraft(page);
        expect(r.display).toBe('flex');
        expect(r.cards.length).toBeGreaterThanOrEqual(1);
        expect(r.cards.length).toBeLessThanOrEqual(4);
    });

    test('cards are relevance-filtered to the equipped loadout', async ({ page }) => {
        // With only Pulse/Charge/Bulwark equipped, no card should belong to a
        // weapon/ability the player is NOT carrying (e.g. Storm Needles).
        const names = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.ownedPrimaries = new Set(['PULSE_CANNON']);
            p.ownedPowers = new Set(['CHARGE_SHOT']);
            p.equippedAbilities = ['BULWARK', null, null, null];
            // run several drafts and collect every offered card name
            const seen = new Set();
            for (let i = 0; i < 12; i++) {
                ge.openWavePickOverlay();
                for (const c of document.querySelectorAll('#wave-pick-cards .wave-pick-card')) {
                    seen.add(c.querySelector('.wave-pick-card-name')?.textContent || '');
                }
                // close overlay between draws
                const ov = document.getElementById('wave-pick-overlay');
                if (ov) ov.style.display = 'none';
            }
            return [...seen];
        });
        // Storm Needles upgrade names ("Needle ...") must never appear.
        expect(names.some((n) => /needle/i.test(n))).toBe(false);
    });

    test('clicking a card applies a powerup stack', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.ownedPrimaries = new Set(['PULSE_CANNON']);
            p.ownedPowers = new Set(['CHARGE_SHOT']);
            p.equippedAbilities = ['BULWARK', null, null, null];
            const before = p.powerups ? p.powerups.size : 0;
            ge.openWavePickOverlay();
            const card = document.querySelector('#wave-pick-cards .wave-pick-card');
            if (card) card.click();
            const after = p.powerups ? p.powerups.size : 0;
            return { before, after };
        });
        expect(r.after).toBeGreaterThan(r.before);
    });

    test('no fatal JS errors through the draft flow', async ({ page }) => {
        await setLoadoutAndDraft(page);
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});

test.describe('QA-10b: In-run gold sinks at the card moment (Phase R4)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
    });

    test('paid REROLL deducts run-gold and is once per offer', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.ownedPrimaries = new Set(['PULSE_CANNON']);
            p.ownedPowers = new Set(['CHARGE_SHOT']);
            p.equippedAbilities = ['BULWARK', null, null, null];
            ge.game.money = 5000;
            ge.openWavePickOverlay();
            const rerollBtn = () => [...document.querySelectorAll('#wave-pick-actions .wave-pick-action-btn')]
                .find((b) => /REROLL/.test(b.textContent));
            const before = ge.game.money;
            rerollBtn().click();
            const afterFirst = ge.game.money;
            const disabledAfter = rerollBtn().disabled;
            return { before, afterFirst, disabledAfter };
        });
        expect(r.afterFirst).toBe(r.before - 200);
        expect(r.disabledAfter).toBe(true); // once per offer
    });

    test('REPAIR KIT heals and deducts run-gold', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.ownedPrimaries = new Set(['PULSE_CANNON']);
            p.ownedPowers = new Set(['CHARGE_SHOT']);
            p.equippedAbilities = ['BULWARK', null, null, null];
            ge.game.money = 5000;
            p.health = 1; // hurt
            const maxHp = p.getEffectiveMaxHealth();
            ge.openWavePickOverlay();
            const repairBtn = [...document.querySelectorAll('#wave-pick-actions .wave-pick-action-btn')]
                .find((b) => /REPAIR/.test(b.textContent));
            const goldBefore = ge.game.money;
            repairBtn.click();
            return { goldBefore, goldAfter: ge.game.money, health: p.health, maxHp };
        });
        expect(r.goldAfter).toBe(r.goldBefore - 250);
        expect(r.health).toBeGreaterThan(1); // healed
    });

    test('buying +CARD grants a bonus pick (6th/7th card)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.ownedPrimaries = new Set(['PULSE_CANNON']);
            p.ownedPowers = new Set(['CHARGE_SHOT']);
            p.equippedAbilities = ['BULWARK', null, null, null];
            ge.game.money = 5000;
            ge._extraCardsThisRun = 0;
            ge.openWavePickOverlay();
            const extraBtn = [...document.querySelectorAll('#wave-pick-actions .wave-pick-action-btn')]
                .find((b) => /\+CARD/.test(b.textContent));
            const goldBefore = ge.game.money;
            extraBtn.click();
            const pendingAfterBuy = ge._bonusPickPending;
            // now take a pick — should NOT close (re-draws for the bonus pick)
            document.querySelector('#wave-pick-cards .wave-pick-card').click();
            const ov = document.getElementById('wave-pick-overlay');
            return {
                spent: goldBefore - ge.game.money,
                pendingAfterBuy,
                pendingAfterPick: ge._bonusPickPending,
                stillOpen: ov && ov.style.display === 'flex',
            };
        });
        expect(r.spent).toBe(600); // first extra card
        expect(r.pendingAfterBuy).toBe(1);
        expect(r.pendingAfterPick).toBe(0); // consumed by the pick
        expect(r.stillOpen).toBe(true);     // re-drew instead of closing
    });

    test('Revive Token: buying it then dying revives instead of game over', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.ownedPrimaries = new Set(['PULSE_CANNON']);
            p.ownedPowers = new Set(['CHARGE_SHOT']);
            p.equippedAbilities = ['BULWARK', null, null, null];
            ge.game.money = 5000;
            ge._revivesThisRun = 0;
            ge.openWavePickOverlay();
            const reviveBtn = [...document.querySelectorAll('#wave-pick-actions .wave-pick-action-btn')]
                .find((b) => /REVIVE ·/.test(b.textContent));
            reviveBtn.click();
            const tokenAfterBuy = !!p._reviveToken;
            // now die — the token should cheat death
            p.health = 0;
            ge.handlePlayerDeath();
            return {
                tokenAfterBuy,
                tokenAfterDeath: !!p._reviveToken,
                health: p.health,
                state: ge.game.state,
            };
        });
        expect(r.tokenAfterBuy).toBe(true);
        expect(r.tokenAfterDeath).toBe(false); // consumed
        expect(r.health).toBeGreaterThan(0);   // revived
        expect(r.state).not.toBe('GAME_OVER');
    });

    test('no fatal JS errors through the gold-sink flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.ownedPrimaries = new Set(['PULSE_CANNON']);
            p.ownedPowers = new Set(['CHARGE_SHOT']);
            p.equippedAbilities = ['BULWARK', null, null, null];
            ge.game.money = 5000;
            p.health = 5;
            ge.openWavePickOverlay();
            for (const b of document.querySelectorAll('#wave-pick-actions .wave-pick-action-btn')) {
                if (!b.disabled) b.click();
            }
        });
        const fatal = page._jsErrors.filter((m) =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
