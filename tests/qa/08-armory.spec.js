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
            ge.game.accountGold = 20000;
            ge._armoryOverlay.render();
            const ok = ge._armoryOverlay.buy('primaries', 'STORM_NEEDLES');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, gold: ge.game.accountGold, unlocked: meta.unlockedPrimaries || [], metaGold: meta.accountGold };
        });
        expect(r.ok).toBe(true);
        expect(r.gold).toBe(20000 - 10000); // 7.0.0 — flat 10k per weapon unlock
        expect(r.unlocked).toContain('STORM_NEEDLES');
        expect(r.metaGold).toBe(10000);
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
            ge.game.accountGold = 20000;
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
            ge.game.accountGold = 99999;
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

test.describe('QA-08e: BUILD chrome — Cores readout + readiness/START gating (Phase U)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('pre-run header shows the Cores readout + BUILD title', async ({ page }) => {
        const r = await page.evaluate(() => {
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 42 }));
            window.gameEngine.openArmory();
            const box = document.getElementById('shop-tree-cores');
            const amt = document.getElementById('shop-cores-amount');
            const title = document.querySelector('.shop-tree-title');
            return {
                vis: box && getComputedStyle(box).visibility,
                cores: amt && amt.textContent,
                title: title && title.textContent,
            };
        });
        expect(r.vis).toBe('visible');
        expect(r.cores).toBe('42');
        expect(r.title).toBe('BUILD YOUR LOADOUT');
    });

    test('the Cores readout is hidden in the in-run shop', async ({ page }) => {
        await startGame(page);
        const r = await page.evaluate(() => {
            window.gameEngine.openShop();
            const box = document.getElementById('shop-tree-cores');
            const title = document.querySelector('.shop-tree-title');
            return { vis: box && getComputedStyle(box).visibility, title: title && title.textContent };
        });
        expect(r.vis).toBe('hidden');
        expect(r.title).toBe('UPGRADES');
    });

    test('START is enabled with a default loadout (has a primary)', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const btn = document.getElementById('shop-prerun-start');
            return { disabled: btn.disabled, text: btn.textContent };
        });
        expect(r.disabled).toBe(false);
        expect(r.text).toContain('START RUN');
    });

    test('keyboard cycles BUILD tabs (◂ ▸ / Tab) + shows the pre-run hint & relabeled legend', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const tree = document.getElementById('shop-tree');
            const fire = (code, shift = false) => document.dispatchEvent(
                new KeyboardEvent('keydown', { code, shiftKey: shift, bubbles: true, cancelable: true }));
            const start = tree.dataset.activeTab;
            fire('ArrowRight'); const afterRight = tree.dataset.activeTab;
            fire('ArrowLeft');  const afterLeft = tree.dataset.activeTab;
            fire('Tab');        const afterTab = tree.dataset.activeTab;        // power
            fire('ArrowLeft'); fire('ArrowLeft'); const wrapped = tree.dataset.activeTab; // power→primary→gear
            const hint = document.getElementById('shop-prerun-hint');
            const firstLegend = document.querySelector('.shop-tree-legend-label');
            return {
                start, afterRight, afterLeft, afterTab, wrapped,
                hintShown: hint && hint.style.display !== 'none',
                hintLen: hint ? hint.textContent.length : 0,
                legend0: firstLegend && firstLegend.textContent,
            };
        });
        expect(r.start).toBe('primary');
        expect(r.afterRight).toBe('power');
        expect(r.afterLeft).toBe('primary');
        expect(r.afterTab).toBe('power');
        expect(r.wrapped).toBe('gear');
        expect(r.hintShown).toBe(true);
        expect(r.hintLen).toBeGreaterThan(10);
        expect(r.legend0).toBe('Locked'); // pre-run legend relabel (was "Too expensive")
    });

    test('deselecting every primary disables START with a SELECT-A-PRIMARY cue', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            // Click each equipped primary parent to toggle it off (the tree
            // re-renders on each click, so re-query in a loop).
            let guard = 0, node;
            // 7.0.0 — compact list marks the equipped pick with `shop-node--equipped`.
            while ((node = document.querySelector('#shop-tree-primary .shop-node--parent.shop-node--equipped')) && guard++ < 12) {
                node.click();
            }
            const btn = document.getElementById('shop-prerun-start');
            const status = document.getElementById('shop-prerun-status');
            return {
                disabled: btn.disabled,
                text: btn.textContent,
                status: status.textContent,
                warn: status.classList.contains('shop-prerun-status--warn'),
            };
        });
        expect(r.disabled).toBe(true);
        expect(r.text).toBe('SELECT A PRIMARY');
        expect(r.warn).toBe(true);
        expect(r.status).toContain('PRIMARY 0/');
    });
});

test.describe('QA-08f: PASSIVES cluster + loadout carry (Phase P4)', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(err.message));
        await loadGame(page);
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
    });

    test('BUILD has a PASSIVES tab + a populated rule-passive cluster', async ({ page }) => {
        const r = await page.evaluate(() => {
            window.gameEngine.openArmory();
            const tab = document.querySelector('.shop-tree-tab[data-tab="passiveskills"]');
            const nodes = document.querySelectorAll('#shop-tree-passiveskills .shop-node--passive');
            const starters = [...nodes].map((n) => n.dataset.id);
            return {
                tabLabel: tab && tab.textContent,
                tabVisible: tab && getComputedStyle(tab).display !== 'none',
                count: nodes.length,
                hasOpportunist: starters.includes('OPPORTUNIST'),
                hasKeystone: starters.includes('GLASS_CANNON'),
            };
        });
        expect(r.tabLabel).toBe('PASSIVES');
        expect(r.tabVisible).toBe(true);
        expect(r.count).toBeGreaterThan(10);
        expect(r.hasOpportunist).toBe(true); // base starter (slot-deliverable)
        expect(r.hasKeystone).toBe(true);    // keystones are slot-deliverable too
    });

    test('the PASSIVES tab is hidden in the in-run shop', async ({ page }) => {
        await startGame(page);
        const vis = await page.evaluate(() => {
            window.gameEngine.openShop();
            const tab = document.querySelector('.shop-tree-tab[data-tab="passiveskills"]');
            return tab && getComputedStyle(tab).display;
        });
        expect(vis).toBe('none');
    });

    test('clicking an owned passive equips it; START carries it into the run', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            // Equip the base starter OPPORTUNIST by clicking its bubble.
            const node = document.querySelector('#shop-tree-passiveskills .shop-node[data-id="OPPORTUNIST"]');
            node.click();
            const chosenBadge = document.querySelector('#shop-tree-passiveskills .shop-node[data-id="OPPORTUNIST"] .shop-node-badge');
            ge.beginPreRunFromTree({ primaries: ['PULSE_CANNON'], passives: ['OPPORTUNIST'] });
            return {
                badge: chosenBadge && chosenBadge.textContent,
                equipped0: ge.player.equippedPassives[0],
                active: [...ge.player.activePassives],
                slots: ge.player.passiveSlotsUnlocked,
            };
        });
        expect(r.badge).toBe('1');                 // slot-1 badge after equip
        expect(r.equipped0).toBe('OPPORTUNIST');
        expect(r.active).toContain('OPPORTUNIST'); // slot 1 unlocked from start
        expect(r.slots).toBeGreaterThanOrEqual(1);
    });

    test('an un-owned passive is dropped on START', async ({ page }) => {
        const active = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            // GLASS_CANNON was never unlocked → must not leak into the run.
            ge.beginPreRunFromTree({ primaries: ['PULSE_CANNON'], passives: ['GLASS_CANNON'] });
            return [...ge.player.activePassives];
        });
        expect(active).not.toContain('GLASS_CANNON');
        expect(active).toHaveLength(0);
    });

    test('CONTINUE restores equipped passives + slot count (P5)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.startNewRun({ primaries: ['PULSE_CANNON'], passives: ['OPPORTUNIST'] });
            ge.player.setPassiveSlotsUnlocked(2);
            ge.player.equipPassive(1, 'LAST_BASTION'); // base, owned
            const snap = ge.serializeRunState();
            // Wipe the live passive state, then restore from the snapshot.
            ge.player.equippedPassives = [null, null, null, null, null];
            ge.player.setPassiveSlotsUnlocked(1);
            ge.player.setOwnedPassives([]);
            ge.restoreRunState(snap);
            return {
                slot0: ge.player.equippedPassives[0],
                slot1: ge.player.equippedPassives[1],
                slots: ge.player.passiveSlotsUnlocked,
                active: [...ge.player.activePassives],
            };
        });
        expect(r.slot0).toBe('OPPORTUNIST');
        expect(r.slot1).toBe('LAST_BASTION');
        expect(r.slots).toBe(2);
        expect(r.active).toEqual(expect.arrayContaining(['OPPORTUNIST', 'LAST_BASTION']));
    });

    test('no fatal JS errors through the passives BUILD flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.openArmory();
            const node = document.querySelector('#shop-tree-passiveskills .shop-node[data-id="LAST_BASTION"]');
            if (node) { node.click(); node.click(); } // equip + unequip
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

    test('targeting a resist ADDs it, consumes Cores, and keeps the total affix count (META-03)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // An epic hull (cap 2 resists) with two NON-resist affixes → ADD.
            const item = { slot: 'hull', level: 10, rarity: 'epic', name: 'Targetable',
                affixes: [
                    { type: 'hp', value: 50, label: '+50 MAX HP' },
                    { type: 'toughness', value: 5, label: '+5% DEF' },
                ] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 100, stash: [item] }));
            ge.openArmory();
            const before = ge.game.cores;
            const ok = ge._armoryOverlay.targetResist(0, 'PYRO');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            const out = meta.stash[0];
            return {
                ok, before, after: ge.game.cores,
                hasPyro: out.affixes.some((a) => a.type === 'pyroResist'),
                affixCount: out.affixes.length,
                resistCount: out.affixes.filter((a) => /Resist$/.test(a.type)).length,
            };
        });
        expect(r.ok).toBe(true);
        expect(r.after).toBeLessThan(r.before); // Cores spent
        expect(r.hasPyro).toBe(true);           // the targeted element landed
        expect(r.affixCount).toBe(2);           // TOTAL affix count unchanged (ADD)
        expect(r.resistCount).toBe(1);
    });

    test('targeting a resist SWAPs at cap (resist count unchanged, new element present)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // epic cap 2, already at 2 resists → SWAP the oldest for the target.
            const item = { slot: 'hull', level: 10, rarity: 'epic', name: 'Capped',
                affixes: [
                    { type: 'pyroResist', value: 8, label: '+8% PYRO RESIST' },
                    { type: 'cryoResist', value: 8, label: '+8% CRYO RESIST' },
                ] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 100, stash: [item] }));
            ge.openArmory();
            const ok = ge._armoryOverlay.targetResist(0, 'VOLT');
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            const out = meta.stash[0];
            return {
                ok,
                affixCount: out.affixes.length,
                resistCount: out.affixes.filter((a) => /Resist$/.test(a.type)).length,
                hasVolt: out.affixes.some((a) => a.type === 'voltResist'),
                hasPyro: out.affixes.some((a) => a.type === 'pyroResist'),
            };
        });
        expect(r.ok).toBe(true);
        expect(r.affixCount).toBe(2);   // total count unchanged
        expect(r.resistCount).toBe(2);  // resist count unchanged (SWAP)
        expect(r.hasVolt).toBe(true);   // targeted element present
        expect(r.hasPyro).toBe(false);  // oldest resist swapped out
    });

    test('resist targeting is rejected on a common (tier-locked) and without enough Cores', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const common = { slot: 'hull', level: 10, rarity: 'common', name: 'Cheap', affixes: [{ type: 'hp', value: 5, label: '+5' }] };
            const epic = { slot: 'hull', level: 10, rarity: 'epic', name: 'Rich', affixes: [{ type: 'hp', value: 5, label: '+5' }, { type: 'toughness', value: 2, label: '+2%' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 999, stash: [common] }));
            ge.openArmory();
            const tierLocked = ge._armoryOverlay.targetResist(0, 'PYRO'); // cap 0 → reject
            const coresAfterLocked = ge.game.cores;
            // Now an epic but with only 1 Core → unaffordable reject.
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 1, stash: [epic] }));
            ge.openArmory();
            const broke = ge._armoryOverlay.targetResist(0, 'PYRO');
            return { tierLocked, coresAfterLocked, broke, coresAfterBroke: ge.game.cores };
        });
        expect(r.tierLocked).toBe(false);
        expect(r.coresAfterLocked).toBe(999); // untouched on a tier-locked reject
        expect(r.broke).toBe(false);
        expect(r.coresAfterBroke).toBe(1);    // untouched when unaffordable
    });

    test('rerolling a gear passive consumes Cores and lands a valid eligible passive (META-04)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // A transcendental hull carrying a known passive → reroll should
            // land a DIFFERENT eligible id (the big pool guarantees alternatives).
            const item = { slot: 'hull', level: 10, rarity: 'transcendental', name: 'Chaser',
                affixes: [{ type: 'hp', value: 50, label: '+50 MAX HP' }], passive: 'GLASS_CANNON' };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 200, stash: [item] }));
            ge.openArmory();
            const before = ge.game.cores;
            const ok = ge._armoryOverlay.rerollPassive(0);
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            const out = meta.stash[0];
            return { ok, before, after: ge.game.cores, passive: out.passive };
        });
        expect(r.ok).toBe(true);
        expect(r.after).toBeLessThan(r.before);   // Cores spent
        expect(typeof r.passive).toBe('string');  // an id is set
        expect(r.passive).not.toBe('GLASS_CANNON'); // changed (≥2 options → different id)
    });

    test('rolling a passive onto eligible gear with none yet (META-04)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            // Exceptional gear with NO passive → reroll ADDS one.
            const item = { slot: 'hull', level: 8, rarity: 'exceptional', name: 'Blank',
                affixes: [{ type: 'hp', value: 30, label: '+30 MAX HP' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 200, stash: [item] }));
            ge.openArmory();
            const before = ge.game.cores;
            const ok = ge._armoryOverlay.rerollPassive(0);
            const meta = JSON.parse(localStorage.getItem('rainboidsMeta') || '{}');
            return { ok, before, after: ge.game.cores, passive: meta.stash[0].passive };
        });
        expect(r.ok).toBe(true);
        expect(r.after).toBeLessThan(r.before);
        expect(typeof r.passive).toBe('string'); // a passive was rolled on
    });

    test('passive reroll is rejected on a common (tier-locked) and leaves Cores untouched (META-04)', async ({ page }) => {
        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const common = { slot: 'hull', level: 10, rarity: 'common', name: 'Cheap', affixes: [{ type: 'hp', value: 5, label: '+5' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 999, stash: [common] }));
            ge.openArmory();
            const tierLocked = ge._armoryOverlay.rerollPassive(0); // below Exceptional → reject
            const coresAfterLocked = ge.game.cores;
            // An exceptional item but with only 1 Core → unaffordable reject.
            const exc = { slot: 'hull', level: 10, rarity: 'exceptional', name: 'Rich', affixes: [{ type: 'hp', value: 5, label: '+5' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 1, stash: [exc] }));
            ge.openArmory();
            const broke = ge._armoryOverlay.rerollPassive(0);
            return { tierLocked, coresAfterLocked, broke, coresAfterBroke: ge.game.cores };
        });
        expect(r.tierLocked).toBe(false);
        expect(r.coresAfterLocked).toBe(999); // untouched on a tier-locked reject
        expect(r.broke).toBe(false);
        expect(r.coresAfterBroke).toBe(1);    // untouched when unaffordable
    });

    test('no fatal JS errors through the crafting flow', async ({ page }) => {
        await page.evaluate(() => {
            const ge = window.gameEngine;
            const item = { slot: 'hull', level: 10, rarity: 'common', name: 'X', affixes: [{ type: 'hp', value: 5, label: '+5' }] };
            localStorage.setItem('rainboidsMeta', JSON.stringify({ cores: 9999, stash: [item] }));
            ge.openArmory();
            ge._armoryOverlay.tierUp(0);
            ge._armoryOverlay.reroll(0);
            ge._armoryOverlay.targetResist(0, 'PYRO');
            ge._armoryOverlay.rerollPassive(0);
        });
        const fatal = page._jsErrors.filter(m =>
            !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
            !m.includes('Font') && !m.includes('net::ERR'));
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
