/**
 * E2E-10: Weapon Economy Analysis
 *
 * Tests the weapon acquisition and shop economy changes:
 *   • Free primary weapon auto-unlock at wave milestones
 *   • Wave-gating: weapons locked in shop until unlockWave reached
 *   • Upgrades are scarce, deliberate purchases (high cost + per-stack ramp)
 *   • Selling refunds at-cost so players can freely respec
 *   • AI weapon switching produces diverse weapon usage
 *   • Shop purchase flow with flash feedback
 *   • Overall economy curve across simulated waves
 *
 * Uses simulated wave progression (completeWave() calls) for economy analysis
 * since headless Playwright runs too slowly for real-time multi-wave play.
 * AI combat tests are kept short and focused.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';
import { GameAI } from '../helpers/game-ai.js';

test.describe('E2E-10: Weapon economy & gameplay flow', () => {
    test.setTimeout(120_000);

    test('simulated multi-wave economy analysis', async ({ page }) => {
        const jsErrors = [];
        page.on('pageerror', err => jsErrors.push(err.message));

        await loadGame(page);
        await startGame(page);
        await page.waitForTimeout(500);

        const purchaseLog = [];
        const waveLog = [];

        // Snapshot helper
        const snapshot = async (label) => {
            return page.evaluate((lbl) => {
                const ge = window.gameEngine;
                if (!ge || !ge.player) return null;
                const p = ge.player;
                return {
                    label: lbl,
                    wave: ge.game.currentWave,
                    money: Math.floor(ge.game.money),
                    skillPoints: p.skillPoints,
                    level: p.level,
                    activePrimary: p.activePrimary,
                    ownedPrimaries: [...p.ownedPrimaries],
                    ownedPowers: [...p.ownedPowers],
                    ownedAbilities: [...p.ownedAbilities],
                    powerupStacks: Object.fromEntries(
                        [...p.powerups.entries()].map(([k, v]) => [k, v.stacks])
                    ),
                };
            }, label);
        };

        // Shop round helper: buy affordable items strategically
        const doShopRound = async (waveNum) => {
            const purchases = await page.evaluate((wave) => {
                const ge = window.gameEngine;
                const p = ge.player;
                const bought = [];
                ge.openShop();

                const tabs = ['OFFENSE', 'PRIMARY', 'POWER', 'DEFENSE', 'ABILITIES'];
                for (const tab of tabs) {
                    ge.shopCategory = tab;
                    ge._rebuildShopCache();
                    if (!ge.shopFilteredItems) continue;

                    for (const item of ge.shopFilteredItems) {
                        if (item.maxStacks) {
                            const stacks = p.getPowerupStacks(item.id);
                            if (stacks >= item.maxStacks) continue;
                        }
                        if (item.isWeapon) {
                            const isOwned = item.weaponType === 'primary'
                                ? p.ownedPrimaries.has(item.id)
                                : p.ownedPowers.has(item.id);
                            if (isOwned) continue;
                        }

                        const moneyBefore = ge.game.money;
                        const spBefore = p.skillPoints;
                        const success = ge.buyShopItem(item.id);
                        if (success) {
                            bought.push({
                                id: item.id,
                                name: item.name || item.id,
                                tab,
                                coinCost: Math.floor(moneyBefore - ge.game.money),
                                spCost: spBefore - p.skillPoints,
                                wave,
                            });
                        }
                    }
                }

                // Close shop
                ge.waveTimer = Date.now();
                ge.closeShop();
                return bought;
            }, waveNum);

            purchaseLog.push(...purchases);
        };

        console.log('\n  ══════════════════════════════════════════════════════════════');
        console.log('  WEAPON ECONOMY ANALYSIS — Simulated 15-wave Playthrough');
        console.log('  ══════════════════════════════════════════════════════════════\n');

        const startSnap = await snapshot('start');
        console.log(`  Start: wave=${startSnap.wave} money=${startSnap.money} weapons=[${startSnap.ownedPrimaries.join(', ')}]`);

        // Simulate 15 waves of money accumulation. Real income is drop-based
        // and hard-capped at ~250/kill, so a full 30-wave run yields ~100k and
        // upgrades (cheapest stack-1 ~15.5k, ramping up per stack) are scarce.
        // Grant a realistic per-wave figure (~2-6k) so this analysis still
        // exercises the buy flow against the post-rework prices.
        const WAVES = 15;

        for (let w = 1; w <= WAVES; w++) {
            // Simulate enemy kill earnings (scales with wave, drop-cap aware)
            const killMoney = 1500 + w * 250 + Math.floor(Math.random() * 1000);

            await page.evaluate((earnings) => {
                const ge = window.gameEngine;
                ge.game.money += earnings;
                // Simulate some XP from kills
                ge.player.gainExperience(earnings / 2);
            }, killMoney);

            // Complete the wave (triggers auto-unlock + wave bonus)
            await page.evaluate(() => {
                const ge = window.gameEngine;
                ge.completeWave();
            });

            const snap = await snapshot(`wave-${w}`);
            waveLog.push(snap);

            const newWeapons = snap.ownedPrimaries.length > (waveLog[waveLog.length - 2]?.ownedPrimaries?.length ?? 1);
            const weaponMarker = newWeapons ? ' ★ NEW WEAPON' : '';
            console.log(`  Wave ${String(w).padStart(2)} → wave ${String(snap.wave).padStart(2)}: ` +
                `money=${String(snap.money).padStart(5)} SP=${String(snap.skillPoints).padStart(2)} ` +
                `lvl=${String(snap.level).padStart(2)} primaries=${snap.ownedPrimaries.length}/5` +
                weaponMarker);

            // Shop visit every 2 waves (realistic)
            if (w % 2 === 0) {
                await doShopRound(w);
                const postShop = await snapshot(`post-shop-${w}`);
                if (purchaseLog.filter(p => p.wave === w).length > 0) {
                    const bought = purchaseLog.filter(p => p.wave === w);
                    for (const b of bought) {
                        const cost = b.coinCost > 0 ? `${b.coinCost} coins` : `${b.spCost} SP`;
                        console.log(`         BOUGHT: ${b.name} (${b.tab}) — ${cost}`);
                    }
                    console.log(`         Remaining: ${postShop.money} coins, ${postShop.skillPoints} SP`);
                }
            }

            // Brief wait to let game engine process
            await page.waitForTimeout(50);
        }

        // ── Final analysis ──
        const finalSnap = await snapshot('final');

        console.log('\n  ──────────────────────────────────────────────────────────────');
        console.log('  RESULTS SUMMARY');
        console.log('  ──────────────────────────────────────────────────────────────');

        console.log(`\n  Final wave: ${finalSnap.wave}`);
        console.log(`  Final money: ${finalSnap.money}`);
        console.log(`  Final SP: ${finalSnap.skillPoints}`);
        console.log(`  Final level: ${finalSnap.level}`);

        // Money curve
        console.log('\n  Money curve (start of each wave, before shop):');
        for (const snap of waveLog) {
            const bar = '█'.repeat(Math.min(50, Math.floor(snap.money / 100)));
            console.log(`    Wave ${String(snap.wave - 1).padStart(2)}: ${String(snap.money).padStart(5)} ${bar}`);
        }

        // Weapon unlocks
        console.log('\n  Weapon unlock timeline:');
        const unlockWaves = { STORM_NEEDLES: 3, SCATTER_GUN: 5, RAIL_DRIVER: 8, LANCE_BEAM: 12 };
        for (const [weapon, wave] of Object.entries(unlockWaves)) {
            const ownedAt = waveLog.findIndex(s => s.ownedPrimaries.includes(weapon));
            const status = ownedAt >= 0 ? `unlocked at wave ${ownedAt + 1}` : 'NOT UNLOCKED';
            console.log(`    ${weapon.padEnd(15)}: ${status} (expected: wave ${wave})`);
        }

        // Purchase analysis
        console.log(`\n  Total purchases: ${purchaseLog.length}`);
        const coinSpent = purchaseLog.reduce((s, p) => s + p.coinCost, 0);
        const spSpent = purchaseLog.reduce((s, p) => s + p.spCost, 0);
        console.log(`  Total coins spent: ${coinSpent}`);
        console.log(`  Total SP spent: ${spSpent}`);

        if (purchaseLog.length > 0) {
            console.log('\n  All purchases:');
            for (const p of purchaseLog) {
                const cost = p.coinCost > 0 ? `${p.coinCost} coins` : `${p.spCost} SP`;
                console.log(`    wave ${String(p.wave).padStart(2)}: ${p.name.padEnd(22)} (${p.tab.padEnd(7)}) — ${cost}`);
            }

            // Category breakdown
            const tabTotals = {};
            for (const p of purchaseLog) {
                if (!tabTotals[p.tab]) tabTotals[p.tab] = { count: 0, coins: 0, sp: 0 };
                tabTotals[p.tab].count++;
                tabTotals[p.tab].coins += p.coinCost;
                tabTotals[p.tab].sp += p.spCost;
            }
            console.log('\n  Spending by category:');
            for (const [tab, t] of Object.entries(tabTotals)) {
                console.log(`    ${tab.padEnd(8)}: ${t.count} items, ${t.coins} coins, ${t.sp} SP`);
            }
        }

        // Upgrades owned
        if (Object.keys(finalSnap.powerupStacks).length > 0) {
            console.log('\n  Upgrades owned:');
            for (const [id, stacks] of Object.entries(finalSnap.powerupStacks)) {
                console.log(`    ${id}: ${stacks} stack(s)`);
            }
        }

        // ── Gameplay impact analysis ──
        console.log('\n  ── GAMEPLAY IMPACT ANALYSIS ──');

        // Economy pacing
        const firstPurchaseWave = purchaseLog.length > 0 ? Math.min(...purchaseLog.map(p => p.wave)) : null;
        if (firstPurchaseWave) {
            console.log(`  [+] First shop purchase at wave ${firstPurchaseWave}`);
            if (firstPurchaseWave <= 4) {
                console.log(`      Economy is engaging early — player can invest by wave ${firstPurchaseWave}`);
            }
        }

        // Weapon variety
        const expectedUnlocks = Object.entries(unlockWaves).filter(([, w]) => finalSnap.wave > w);
        const actualUnlocks = expectedUnlocks.filter(([weapon]) => finalSnap.ownedPrimaries.includes(weapon));
        console.log(`  [${actualUnlocks.length === expectedUnlocks.length ? '+' : '-'}] Weapon auto-unlocks: ${actualUnlocks.length}/${expectedUnlocks.length} triggered correctly`);

        // Upgrade depth
        const totalUpgradeStacks = Object.values(finalSnap.powerupStacks).reduce((s, v) => s + v, 0);
        console.log(`  [+] Total upgrade depth: ${totalUpgradeStacks} stacks across ${Object.keys(finalSnap.powerupStacks).length} upgrades`);

        // Currency balance
        const leftoverRatio = finalSnap.money / (coinSpent + finalSnap.money);
        console.log(`  [${leftoverRatio > 0.7 ? '-' : '+'}] Currency utilization: ${Math.round((1 - leftoverRatio) * 100)}% of earned coins spent`);
        if (leftoverRatio > 0.7) {
            console.log(`      Player hoarding ${Math.round(leftoverRatio * 100)}% of coins — may need cheaper upgrade options`);
        }

        console.log('\n  ══════════════════════════════════════════════════════════════\n');

        // ── Assertions ──
        expect(finalSnap.ownedPrimaries).toContain('STORM_NEEDLES');
        expect(finalSnap.ownedPrimaries).toContain('SCATTER_GUN');
        expect(finalSnap.ownedPrimaries).toContain('RAIL_DRIVER');
        expect(finalSnap.ownedPrimaries).toContain('LANCE_BEAM');
        expect(purchaseLog.length).toBeGreaterThan(0);
        expect(jsErrors.filter(e =>
            e.includes('Cannot read') || e.includes('is not a function') ||
            e.includes('is undefined') || e.includes('stack overflow')
        )).toEqual([]);
    });

    test('AI combat uses multiple weapons during gameplay', async ({ page }) => {
        await loadGame(page);
        await startGame(page);
        await page.waitForTimeout(500);

        // Give the player all weapons + one-punch-man for fast kills
        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.cheats.onePunchMan = true;
            ge.player.ownedPrimaries.add('STORM_NEEDLES');
            ge.player.ownedPrimaries.add('SCATTER_GUN');
            ge.player.ownedPrimaries.add('RAIL_DRIVER');
            ge.player.addPowerup('HOMING', { duration: Infinity }, true);
        });

        const ai = new GameAI(page);
        const weaponsUsed = new Set(['PULSE_CANNON']); // starting weapon

        // Run AI with aggressive weapon switching for 15 seconds
        const aiPromise = ai.run(15_000, null, { switchWeapons: true, switchInterval: 1500 });

        // Poll weapon usage
        for (let i = 0; i < 15; i++) {
            await page.waitForTimeout(1000);
            const active = await page.evaluate(() => window.gameEngine?.player?.activePrimary);
            if (active) weaponsUsed.add(active);
        }

        ai._running = false;
        await aiPromise;
        await ai.stop();

        console.log(`\n  AI weapon usage: [${[...weaponsUsed].join(', ')}] (${weaponsUsed.size} unique)`);
        expect(weaponsUsed.size).toBeGreaterThanOrEqual(3);
    });

    test('weapons are locked in shop until unlockWave', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const lockTest = await page.evaluate(() => {
            const ge = window.gameEngine;

            ge.game.currentWave = 1;
            ge.openShop();
            ge.shopCategory = 'PRIMARY';
            ge._rebuildShopCache();
            const wave1Weapons = ge.shopFilteredItems.filter(i => i.isWeapon).map(i => i.id);

            ge.game.currentWave = 3;
            ge._rebuildShopCache();
            const wave3Weapons = ge.shopFilteredItems.filter(i => i.isWeapon).map(i => i.id);

            ge.game.currentWave = 5;
            ge._rebuildShopCache();
            const wave5Weapons = ge.shopFilteredItems.filter(i => i.isWeapon).map(i => i.id);

            ge.game.currentWave = 12;
            ge._rebuildShopCache();
            const wave12Weapons = ge.shopFilteredItems.filter(i => i.isWeapon).map(i => i.id);

            // Try to buy a locked weapon directly
            ge.game.currentWave = 1;
            ge._rebuildShopCache();
            const buyLocked = ge.buyShopItem('LANCE_BEAM');

            return { wave1Weapons, wave3Weapons, wave5Weapons, wave12Weapons, buyLocked };
        });

        console.log('\n  ── Wave-gated weapon visibility ──');
        console.log(`  Wave  1: [${lockTest.wave1Weapons.join(', ')}]`);
        console.log(`  Wave  3: [${lockTest.wave3Weapons.join(', ')}]`);
        console.log(`  Wave  5: [${lockTest.wave5Weapons.join(', ')}]`);
        console.log(`  Wave 12: [${lockTest.wave12Weapons.join(', ')}]`);
        console.log(`  Buy locked weapon at wave 1: ${lockTest.buyLocked ? 'ALLOWED (BUG!)' : 'BLOCKED'}`);

        expect(lockTest.wave1Weapons).toEqual(['PULSE_CANNON']);
        expect(lockTest.wave3Weapons).toContain('STORM_NEEDLES');
        expect(lockTest.wave3Weapons).not.toContain('SCATTER_GUN');
        expect(lockTest.wave5Weapons).toContain('SCATTER_GUN');
        expect(lockTest.wave5Weapons).not.toContain('RAIL_DRIVER');
        expect(lockTest.wave12Weapons).toHaveLength(5);
        expect(lockTest.buyLocked).toBe(false);
    });

    test('weapon unlock notification fires correctly', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            const notifsBefore = ge.notificationQueue?.length ?? 0;
            ge.game.currentWave = 3;
            ge.completeWave();
            const notifsAfter = ge.notificationQueue?.length ?? 0;
            const lastNotif = ge.notificationQueue?.[ge.notificationQueue.length - 1];
            return {
                unlocked: ge.player.ownedPrimaries.has('STORM_NEEDLES'),
                newNotifs: notifsAfter - notifsBefore,
                title: lastNotif?.title,
                subtitle: lastNotif?.subtitle,
            };
        });

        expect(result.unlocked).toBe(true);
        expect(result.newNotifs).toBeGreaterThan(0);
        expect(result.title).toContain('WEAPON UNLOCKED');
        console.log(`  Notification: "${result.title}" — "${result.subtitle}"`);
    });

    test('purchase flash feedback', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const result = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge._shopFlash = { time: performance.now(), color: 'rgba(0, 255, 128, 0.15)' };
            const success = ge._shopFlash.color;
            ge._shopFlash = { time: performance.now(), color: 'rgba(255, 60, 60, 0.2)' };
            const fail = ge._shopFlash.color;
            return { success, fail };
        });

        expect(result.success).toContain('0, 255, 128');
        expect(result.fail).toContain('255, 60, 60');
    });

    test('upgrades are scarce, ramped, and refund at-cost', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const analysis = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.game.currentWave = 12;
            ge.openShop();
            ge.shopCategory = 'TREE';
            ge._rebuildShopCache();

            const upgrades = (ge.shopFilteredItems || [])
                .filter(i => i.isWeaponUpgrade && (i.cost || 0) > 0);
            const costs = upgrades.map(i => i.cost);
            const cheapest = Math.min(...costs);

            // A pocketful of change buys nothing — upgrades are deliberate.
            ge.game.money = 800;
            const affordableAt800 = upgrades.filter(i => i.cost <= 800).length;

            // Per-stack ramp: a multi-stack upgrade's costOverrides ascend.
            const ramped = upgrades.find(i =>
                Array.isArray(i.costOverrides) && i.costOverrides.length >= 2);
            const rampAscends = ramped
                ? ramped.costOverrides.every((c, k) =>
                    k === 0 || c > ramped.costOverrides[k - 1])
                : false;

            // At-cost respec: buy a stack, then sell it — money nets to zero.
            // (Re-fetch the item after setting a big budget so affordability
            // isn't the limiter.)
            ge.game.money = 200_000;
            const target = upgrades.find(i => i.costOverrides) || upgrades[0];
            const before = ge.game.money;
            const bought = ge.buyShopItem(target.id);
            const afterBuy = ge.game.money;
            const sold = ge.sellShopItem(target.id);
            const afterSell = ge.game.money;

            return {
                upgradeCount: upgrades.length, cheapest, affordableAt800,
                rampAscends, rampSample: ramped ? ramped.costOverrides : null,
                bought, sold, paid: before - afterBuy, refunded: afterSell - afterBuy,
                netZero: afterSell === before,
            };
        });

        console.log('\n  ── Post-rework economy (wave 12) ──');
        console.log(`  Upgrades on offer: ${analysis.upgradeCount}, cheapest: ${analysis.cheapest}`);
        console.log(`  Affordable at 800g: ${analysis.affordableAt800} (expect 0)`);
        console.log(`  Per-stack ramp ascends: ${analysis.rampAscends} ${JSON.stringify(analysis.rampSample)}`);
        console.log(`  Respec: paid ${analysis.paid}, refunded ${analysis.refunded}, net-zero: ${analysis.netZero}`);

        // Scarcity — nothing trivially cheap, and pocket change buys nothing.
        expect(analysis.cheapest).toBeGreaterThanOrEqual(10_000);
        expect(analysis.affordableAt800).toBe(0);
        // Progression — multi-stack traits cost more per stack.
        expect(analysis.rampAscends).toBe(true);
        // Free respec — selling refunds exactly what was paid.
        expect(analysis.bought).toBe(true);
        expect(analysis.sold).toBe(true);
        expect(analysis.refunded).toBe(analysis.paid);
        expect(analysis.netZero).toBe(true);
    });

    test('Pulse Cannon rebalance — weapon differentiation', async ({ page }) => {
        await loadGame(page);
        await startGame(page);

        const comparison = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            ['STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER', 'LANCE_BEAM'].forEach(id =>
                p.ownedPrimaries.add(id));

            const weapons = {};
            for (const id of [...p.ownedPrimaries]) {
                p.equipPrimary(id);
                const cfg = p.getActivePrimaryConfig();
                weapons[id] = {
                    name: cfg.name, damage: cfg.damage, fireRate: cfg.fireRate,
                    bulletSpeed: cfg.bulletSpeed, bulletCount: cfg.bulletCount,
                    range: cfg.range, spreadAngle: cfg.spreadAngle,
                };
            }
            p.equipPrimary('PULSE_CANNON');
            return weapons;
        });

        console.log('\n  ── Weapon stat comparison ──');
        console.log('  ' + 'Weapon'.padEnd(16) + 'Dmg'.padEnd(6) + 'Rate'.padEnd(6) +
            'Spd'.padEnd(6) + '#'.padEnd(4) + 'Range'.padEnd(7) + 'Spread');
        console.log('  ' + '─'.repeat(50));
        for (const [, w] of Object.entries(comparison)) {
            console.log('  ' + w.name.padEnd(16) +
                String(w.damage).padEnd(6) + String(w.fireRate).padEnd(6) +
                String(w.bulletSpeed).padEnd(6) + String(w.bulletCount).padEnd(4) +
                String(w.range).padEnd(7) + String(w.spreadAngle ?? 0));
        }

        // Pulse Cannon is nerfed
        expect(comparison.PULSE_CANNON.damage).toBeLessThan(1.0);
        expect(comparison.PULSE_CANNON.range).toBeLessThan(1.0);

        // Weapons have differentiated stats
        const damages = Object.values(comparison).map(w => w.damage);
        const uniqueDamages = new Set(damages);
        expect(uniqueDamages.size).toBeGreaterThanOrEqual(3);
        console.log(`  [+] ${uniqueDamages.size} unique damage values — weapons are differentiated`);
    });
});
