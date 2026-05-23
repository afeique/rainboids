/**
 * QA-08: pre-run BUILD flow + gold economy (Phase R2 / Phase W0)
 *
 * The pre-run screen is now the bubble UPGRADE TREE in BUILD mode (the flat
 * ARMORY list is retired). Verifies NEW GAME → BUILD → run, account-gold
 * unlock purchasing (logic still on ArmoryOverlay, the gear/unlock host),
 * run-gold starting at 0, and run-end banking.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame, getGameState } from '../helpers/game-helpers.js';

test.describe('QA-08: BUILD screen + gold economy', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        // Start from a clean meta wallet for deterministic assertions.
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('openArmory enters BUILD mode and shows the tree overlay', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const ov = document.getElementById('shop-overlay');
            const footer = document.getElementById('shop-prerun-footer');
            return {
                state: window.gameEngine.game.state,
                display: ov && ov.style.display,
                footer: footer && footer.style.display,
                open: window.gameEngine.isArmoryOpen(),
            };
        });
        expect(r.state).toBe('ARMORY');
        expect(r.display).toBe('flex');
        expect(r.footer).toBe('flex');
        expect(r.open).toBe(true);
    });

    test('BACK from the BUILD tree returns to the title screen', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            ge.cancelPreRunToTitle();
            const ov = document.getElementById('shop-overlay');
            return { state: ge.game.state, display: ov && ov.style.display, open: ge.isArmoryOpen() };
        });
        expect(r.state).toBe('TITLE_SCREEN');
        expect(r.display).toBe('none');
        expect(r.open).toBe(false);
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

test.describe('QA-08b: Stash + Cores salvage (Phase R8)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('run loot is committed to the persistent stash at run end', async ({ page }) => {
        await startGame(page);
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.player.runCollected = [
                { slot: 'cockpit', level: 5, rarity: 'rare', name: 'Test Core',
                  affixes: [{ type: 'hp', value: 20, label: '+20 HP' }] },
            ];
            ge._runGoldBanked = false;
            ge.game.state = 'GAME_OVER'; // banks gold + commits loot
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { stashLen: (meta.stash || []).length, collected: ge.player.runCollected.length };
        });
        expect(r.stashLen).toBe(1);
        expect(r.collected).toBe(0); // cleared after commit
    });

    test('salvaging a stash item grants Cores and removes it', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                cores: 0,
                stash: [{ slot: 'hull', level: 10, rarity: 'legendary', name: 'Big Plate',
                          affixes: [{ type: 'hp', value: 50, label: '+50' }, { type: 'toughness', value: 3, label: '+3%' }] }],
            }));
            ge.openArmory();
            const gained = ge._armoryOverlay.salvage(0);
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { gained, cores: ge.game.cores, metaCores: meta.cores, stashLen: (meta.stash || []).length };
        });
        expect(r.gained).toBeGreaterThan(0);
        expect(r.cores).toBe(r.gained);
        expect(r.metaCores).toBe(r.gained);
        expect(r.stashLen).toBe(0);
    });

    test('Cores earned via salvage persist across reload', async ({ page }) => {
        // Earn cores through the real salvage path (updates both game.cores
        // and meta), then reload — boot must re-seed game.cores from meta so
        // a title autosave can't clobber it back to 0.
        const earned = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                cores: 0,
                stash: [{ slot: 'hull', level: 12, rarity: 'epic', name: 'Bulwark Plate',
                          affixes: [{ type: 'hp', value: 60, label: '+60' }] }],
            }));
            ge.openArmory();
            return ge._armoryOverlay.salvage(0); // sets game.cores + meta.cores
        });
        expect(earned).toBeGreaterThan(0);
        await page.reload();
        await page.waitForFunction(() => !!window.gameEngine);
        const cores = await page.evaluate(() => window.gameEngine.game.cores);
        expect(cores).toBe(earned);
    });

    test('no fatal JS errors through the stash/salvage flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                cores: 10,
                stash: [{ slot: 'cockpit', level: 3, rarity: 'common', name: 'Scrap', affixes: [{ type: 'hp', value: 5, label: '+5' }] }],
            }));
            ge.openArmory();
            ge._armoryOverlay.render();
            ge._armoryOverlay.salvageAllBelowEquipped();
            ge._armoryOverlay.salvage(0);
        });
        const fatal = page._jsErrors.filter(m =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});

test.describe('QA-08c: Equipment — no auto-equip + Armory equip (Phase R8.2/R8.3)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('drops no longer auto-equip mid-run (R8.2)', async ({ page }) => {
        await startGame(page);
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            p.equippedItems = { cockpit: null, hull: null, shielding: null, chassis: null, nanites: null };
            p.runCollected = [];
            const item = { slot: 'cockpit', level: 9, rarity: 'epic', name: 'Should Not Equip',
                           affixes: [{ type: 'hp', value: 99, label: '+99 HP' }] };
            p.registerItemDrop(item);
            return {
                equipped: p.equippedItems.cockpit,
                collected: p.runCollected.length,
                feed: (p.lootFeed || []).length,
            };
        });
        expect(r.equipped).toBeNull();   // NOT auto-equipped
        expect(r.collected).toBe(1);     // accrued for the stash
        expect(r.feed).toBeGreaterThan(0); // shown in the feed
    });

    test('equipping a stash item in the Armory persists it for the next run', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                equippedItems: {},
                stash: [{ slot: 'hull', level: 8, rarity: 'rare', name: 'Plating',
                          affixes: [{ type: 'hp', value: 40, label: '+40' }] }],
            }));
            ge.openArmory();
            const ok = ge._armoryOverlay.equip(0);
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, equippedHull: meta.equippedItems.hull, stashLen: (meta.stash || []).length };
        });
        expect(r.ok).toBe(true);
        expect(r.equippedHull && r.equippedHull.name).toBe('Plating');
        expect(r.stashLen).toBe(0);
    });

    test('unequip returns the item to the stash', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                equippedItems: { chassis: { slot: 'chassis', level: 4, rarity: 'common', name: 'Frame', affixes: [{ type: 'toughness', value: 2, label: '+2%' }] } },
                stash: [],
            }));
            ge.openArmory();
            const ok = ge._armoryOverlay.unequip('chassis');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, equippedChassis: meta.equippedItems.chassis, stashLen: (meta.stash || []).length };
        });
        expect(r.ok).toBe(true);
        expect(r.equippedChassis).toBeNull();
        expect(r.stashLen).toBe(1);
    });

    test('equipped gear applies to the run via applyPersistentProfile', async ({ page }) => {
        const equippedName = await page.evaluate(() => {
            localStorage.setItem('rainboidsMeta', JSON.stringify({
                equippedItems: { cockpit: { slot: 'cockpit', level: 10, rarity: 'legendary', name: 'Run Core', affixes: [{ type: 'hp', value: 75, label: '+75' }] } },
            }));
            const ge = window.gameEngine;
            ge.startNewRun(); // init → applyPersistentProfile loads equippedItems
            const it = ge.player.equippedItems.cockpit;
            return it && it.name;
        });
        expect(equippedName).toBe('Run Core');
    });
});

test.describe('QA-08d: Cores crafting — reroll + tier-up (Phase R8.6/R8.8)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('reroll consumes Cores and re-rolls the affixes within tier', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // A legendary hull (3 affixes) so reroll keeps 3.
            const item = { slot: 'hull', level: 10, rarity: 'legendary', name: 'Old',
                affixes: [{ type: 'hp', value: 1, label: '+1' }, { type: 'toughness', value: 1, label: '+1%' }, { type: 'regen', value: 0.1, label: '+0.1' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 100, stash: [item] }));
            ge.openArmory();
            const before = ge.game.cores;
            const ok = ge._armoryOverlay.reroll(0);
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, before, after: ge.game.cores, affixCount: meta.stash[0].affixes.length, rarity: meta.stash[0].rarity };
        });
        expect(r.ok).toBe(true);
        expect(r.after).toBeLessThan(r.before);   // Cores spent
        expect(r.affixCount).toBe(3);              // legendary tier bound preserved
        expect(r.rarity).toBe('legendary');        // rarity unchanged by reroll
    });

    test('tier-up raises rarity and consumes Cores', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const item = { slot: 'shielding', level: 10, rarity: 'common', name: 'Base',
                affixes: [{ type: 'hp', value: 5, label: '+5' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 100, stash: [item] }));
            ge.openArmory();
            const before = ge.game.cores;
            const ok = ge._armoryOverlay.tierUp(0);
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, before, after: ge.game.cores, rarity: meta.stash[0].rarity, affixCount: meta.stash[0].affixes.length };
        });
        expect(r.ok).toBe(true);
        expect(r.rarity).toBe('rare');             // common → rare
        expect(r.affixCount).toBe(2);              // rare tier affix count
        expect(r.after).toBeLessThan(r.before);    // Cores spent
    });

    test('crafting is rejected without enough Cores', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const item = { slot: 'hull', level: 10, rarity: 'epic', name: 'X', affixes: [{ type: 'hp', value: 5, label: '+5' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 1, stash: [item] }));
            ge.openArmory();
            return { reroll: ge._armoryOverlay.reroll(0), tierUp: ge._armoryOverlay.tierUp(0), cores: ge.game.cores };
        });
        expect(r.reroll).toBe(false);
        expect(r.tierUp).toBe(false);
        expect(r.cores).toBe(1); // untouched
    });

    test('no fatal JS errors through the crafting flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const item = { slot: 'hull', level: 10, rarity: 'common', name: 'X', affixes: [{ type: 'hp', value: 5, label: '+5' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 9999, stash: [item] }));
            ge.openArmory();
            ge._armoryOverlay.tierUp(0);
            ge._armoryOverlay.reroll(0);
        });
        const fatal = page._jsErrors.filter(m =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
