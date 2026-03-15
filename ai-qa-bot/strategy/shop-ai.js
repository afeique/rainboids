/**
 * AI QA Bot — Shop AI
 *
 * Makes intelligent shop purchase decisions based on build archetype,
 * current game state, and available items.
 */

import { BUILD_ARCHETYPES } from '../core/config.js';

// All shop categories to visit
const SHOP_CATEGORIES = ['OFFENSE', 'DEFENSE', 'DROPS', 'PRIMARY', 'POWER', 'SKILLS'];

export class ShopAI {
    constructor(driver, logger, config = {}) {
        this.driver = driver;
        this.logger = logger;
        this.archetype = BUILD_ARCHETYPES[config.buildArchetype] || BUILD_ARCHETYPES.balanced;
        this.strategy = config.shopStrategy || 'optimal';
        this._purchaseHistory = [];
    }

    /**
     * Execute a full shop visit: scan items, buy best available, close.
     * @param {object} state - Current game state snapshot
     * @returns {Array} List of purchases made
     */
    async visit(state) {
        const purchases = [];
        const money = state.money;
        const sp = state.player?.skillPoints || 0;

        if (money <= 0 && sp <= 0) {
            // Nothing to spend, close immediately
            await this.driver.closeShop();
            return purchases;
        }

        // Decide what to buy based on strategy
        const plan = await this._buildPurchasePlan(state);

        for (const item of plan) {
            // Re-check we can still afford it
            const currentState = await this._quickState();
            if (!currentState) break;

            const currentMoney = currentState.money;
            const currentSP = currentState.sp;

            if (item.currency === 'COINS' && currentMoney < item.cost) continue;
            if (item.currency === 'SP' && currentSP < item.cost) continue;

            // Navigate to correct category and buy
            await this.driver.setShopCategory(item.category);
            const success = await this.driver.buyItem(item.id);

            if (success) {
                purchases.push(item);
                this._purchaseHistory.push(item.id);
                this.logger.logPurchase(item.id, item.cost, item.currency);

                if (item.isWeapon) {
                    this.logger.logWeaponBuy(item.id, item.weaponType);
                }
                if (item.isSkill) {
                    this.logger.logSkillBuy(item.id);
                }
            }
        }

        await this.driver.closeShop();
        return purchases;
    }

    async _quickState() {
        return this.driver.page.evaluate(() => {
            const ge = window.gameEngine;
            return ge ? {
                money: ge.game.money,
                sp: ge.player?.skillPoints || 0,
                wave: ge.game.currentWave,
            } : null;
        });
    }

    /**
     * Build a prioritized purchase plan.
     */
    async _buildPurchasePlan(state) {
        switch (this.strategy) {
            case 'random': return this._randomPlan(state);
            case 'cheapest': return this._cheapestPlan(state);
            case 'heuristic': return this._heuristicPlan(state);
            case 'optimal':
            default: return this._optimalPlan(state);
        }
    }

    /**
     * Random strategy (novice simulation): buy random affordable items.
     */
    async _randomPlan(state) {
        const allItems = await this._scanAllItems();
        const affordable = allItems.filter(i =>
            (i.currency === 'COINS' && state.money >= i.cost) ||
            (i.currency === 'SP' && (state.player?.skillPoints || 0) >= i.cost)
        );
        // Shuffle
        for (let i = affordable.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [affordable[i], affordable[j]] = [affordable[j], affordable[i]];
        }
        return affordable.slice(0, 2); // Buy up to 2 random items
    }

    /**
     * Cheapest strategy (beginner): buy cheapest available items.
     */
    async _cheapestPlan(state) {
        const allItems = await this._scanAllItems();
        const affordable = allItems.filter(i =>
            (i.currency === 'COINS' && state.money >= i.cost) ||
            (i.currency === 'SP' && (state.player?.skillPoints || 0) >= i.cost)
        );
        affordable.sort((a, b) => a.cost - b.cost);
        return affordable.slice(0, 3);
    }

    /**
     * Heuristic strategy (intermediate): follow build archetype priorities.
     */
    async _heuristicPlan(state) {
        const plan = [];

        // Try to buy priority upgrades first
        for (const itemId of this.archetype.priorities) {
            const allItems = await this._scanCategoryItems(this._guessCategoryForItem(itemId));
            const item = allItems.find(i => i.id === itemId && !i.owned);
            if (item) {
                if ((item.currency === 'COINS' && state.money >= item.cost) ||
                    (item.currency === 'SP' && (state.player?.skillPoints || 0) >= item.cost)) {
                    plan.push(item);
                    if (plan.length >= 2) break;
                }
            }
        }

        return plan;
    }

    /**
     * Optimal strategy (advanced): scan all categories, buy best affordable items
     * following archetype priorities.
     */
    async _optimalPlan(state) {
        const plan = [];
        const money = state.money || 0;
        const sp = state.player?.skillPoints || 0;
        let remainingCoins = money;
        let remainingSP = sp;

        // Scan all categories for available items
        const allItems = await this._scanAllItems();

        // First pass: buy priority items we can afford
        for (const priorityId of this.archetype.priorities) {
            const item = allItems.find(i => i.id === priorityId && !i.owned);
            if (!item) continue;
            if (item.currency === 'COINS' && remainingCoins >= item.cost) {
                plan.push(item);
                remainingCoins -= item.cost;
            } else if (item.currency === 'SP' && remainingSP >= item.cost) {
                plan.push(item);
                remainingSP -= item.cost;
            }
            if (plan.length >= 4) break;
        }

        // Second pass: if we still have coins, buy cheapest affordable offense item
        if (remainingCoins >= 100) {
            const affordable = allItems
                .filter(i => i.currency === 'COINS' && remainingCoins >= i.cost &&
                             !plan.some(p => p.id === i.id) && !i.isWeapon && !i.isSkill)
                .sort((a, b) => a.cost - b.cost);
            if (affordable.length > 0) {
                plan.push(affordable[0]);
                remainingCoins -= affordable[0].cost;
            }
        }

        // Third pass: weapon purchase if wave >= 4 and we can afford it
        const wave = state.wave || 1;
        if (wave >= 4 && !this._hasBoughtWeapon() && remainingCoins >= 500) {
            const weaponPlan = await this._planWeaponPurchase(state);
            if (weaponPlan && remainingCoins >= weaponPlan.cost) {
                plan.push(weaponPlan);
            }
        }

        // Fourth pass: skill purchase if wave >= 6
        if (wave >= 6 && !this._hasBoughtSkill() && remainingSP >= 1) {
            const skillPlan = await this._planSkillPurchase(state);
            if (skillPlan && remainingSP >= skillPlan.cost) {
                plan.push(skillPlan);
            }
        }

        return plan;
    }

    async _planWeaponPurchase(state) {
        const preferred = this.archetype.preferredPrimary;
        if (!preferred) return null;

        await this.driver.setShopCategory('PRIMARY');
        const items = await this.driver.getShopItems();
        const weapon = items.find(i => i.id === preferred && !i.owned);
        if (weapon && state.money >= weapon.cost && (state.player?.skillPoints || 0) >= 1) {
            return weapon;
        }
        return null;
    }

    async _planSkillPurchase(state) {
        const preferred = this.archetype.preferredSkills?.[0];
        if (!preferred) return null;

        await this.driver.setShopCategory('SKILLS');
        const items = await this.driver.getShopItems();
        const skill = items.find(i => i.id === preferred && !i.owned);
        if (skill && (state.player?.skillPoints || 0) >= skill.cost) {
            return skill;
        }
        return null;
    }

    async _planUpgrades(state, existingPlan) {
        const upgrades = [];
        const existingIds = new Set(existingPlan.map(i => i.id));
        let remainingMoney = state.money - existingPlan
            .filter(i => i.currency === 'COINS')
            .reduce((sum, i) => sum + i.cost, 0);
        let remainingSP = (state.player?.skillPoints || 0) - existingPlan
            .filter(i => i.currency === 'SP')
            .reduce((sum, i) => sum + i.cost, 0);

        for (const itemId of this.archetype.priorities) {
            if (existingIds.has(itemId)) continue;

            const category = this._guessCategoryForItem(itemId);
            await this.driver.setShopCategory(category);
            const items = await this.driver.getShopItems();
            const item = items.find(i => i.id === itemId);

            if (!item) continue;
            if (item.currency === 'COINS' && remainingMoney >= item.cost) {
                upgrades.push(item);
                remainingMoney -= item.cost;
            } else if (item.currency === 'SP' && remainingSP >= item.cost) {
                upgrades.push(item);
                remainingSP -= item.cost;
            }

            if (upgrades.length >= 3) break;
        }

        return upgrades;
    }

    _hasBoughtWeapon() {
        return this._purchaseHistory.some(id =>
            ['STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER', 'LANCE_BEAM',
             'MINE_LAYER', 'NOVA_BLAST', 'LIGHTNING_ARC', 'MISSILE_SALVO'].includes(id)
        );
    }

    _hasBoughtSkill() {
        return this._purchaseHistory.some(id =>
            ['BULWARK', 'REPAIR_NANITES', 'PHASE_DASH', 'DEFLECTOR_ORBS',
             'EMP_PULSE', 'TRACTOR_SHIELD'].includes(id)
        );
    }

    _guessCategoryForItem(itemId) {
        const offense = ['RAPID_FIRE', 'CRIT_CHANCE', 'CRIT_DAMAGE', 'MULTI_SHOT',
                         'HOMING', 'PIERCING', 'EXPLOSIVE', 'LONG_RANGE', 'SPARE_SHIP'];
        const defense = ['HEALTH_BOOST', 'SHIELD_BOOST', 'SPEED_BOOST'];
        const drops = ['MEDPACK', 'DOCTOR', 'PAYDAY', 'HIGH_ROLLER',
                       'HEALTH_ORB_DROP_CHANCE', 'MONEY_ORB_DROP_CHANCE',
                       'HEALTH_ORB_DROP_QUANTITY', 'MONEY_ORB_DROP_QUANTITY'];

        if (offense.includes(itemId)) return 'OFFENSE';
        if (defense.includes(itemId)) return 'DEFENSE';
        if (drops.includes(itemId)) return 'DROPS';
        return 'OFFENSE';
    }

    async _scanAllItems() {
        const all = [];
        for (const cat of SHOP_CATEGORIES) {
            const items = await this._scanCategoryItems(cat);
            all.push(...items);
        }
        return all;
    }

    async _scanCategoryItems(category) {
        await this.driver.setShopCategory(category);
        return this.driver.getShopItems();
    }
}
