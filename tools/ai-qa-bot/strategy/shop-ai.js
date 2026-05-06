/**
 * AI QA Bot — Shop AI
 *
 * Utility-based shop decision system that adapts purchases to session
 * performance. Tracks telemetry across waves and computes need scores
 * for each upgrade based on how the bot is actually performing.
 *
 * Strategies:
 *   - 'utility' (default) — need-scored purchases from session telemetry
 *   - 'random' — random affordable items (novice fallback)
 *   - 'cheapest' — cheapest available items (beginner fallback)
 *   - 'heuristic' — archetype priority list (legacy)
 *   - 'optimal' — archetype priority with scanning (legacy)
 */

import { BUILD_ARCHETYPES } from '../core/config.js';

// 5.78.2 — DROPS category removed (drops now scale with player level).
const SHOP_CATEGORIES = ['OFFENSE', 'DEFENSE', 'PRIMARY', 'POWER', 'SKILLS'];

// How many waves of telemetry to use for need scoring
const TELEMETRY_WINDOW = 5;

// Re-evaluate build archetype every N waves
const BUILD_EVAL_INTERVAL = 5;

export class ShopAI {
    constructor(driver, logger, config = {}) {
        this.driver = driver;
        this.logger = logger;
        this.archetype = BUILD_ARCHETYPES[config.buildArchetype] || BUILD_ARCHETYPES.balanced;
        this.archetypeName = config.buildArchetype || 'balanced';
        this.strategy = config.shopStrategy || 'utility';
        this.shopParams = config.shop || { decisionQuality: 0.95, savingAwareness: 0.8, adaptability: 0.8 };
        this._purchaseHistory = [];

        // Session telemetry (accumulated from events)
        this._telemetry = {
            waveStats: [],        // per-wave snapshots
            totalKills: 0,
            totalDeaths: 0,
            deathsByWave: [],
            damageEvents: 0,
            killsByType: {},
            currentUpgrades: {},  // { upgradeId: stackCount }
        };
    }

    /**
     * Record a game event for telemetry tracking.
     * Called from bot.js on each event.
     */
    recordEvent(event, state) {
        switch (event.type) {
            case 'enemy_killed':
                this._telemetry.totalKills++;
                this._telemetry.killsByType[event.enemyType] =
                    (this._telemetry.killsByType[event.enemyType] || 0) + 1;
                break;
            case 'death':
                this._telemetry.totalDeaths++;
                this._telemetry.deathsByWave.push(event.wave);
                break;
            case 'damage_taken':
                this._telemetry.damageEvents++;
                break;
            case 'wave_start': {
                // Snapshot the state at wave start for telemetry
                if (state?.player) {
                    const healthRatio = state.player.health / Math.max(1, state.player.maxHealth);
                    this._telemetry.waveStats.push({
                        wave: event.wave,
                        healthRatio,
                        enemies: state.entities?.enemies?.length || 0,
                        money: state.money || 0,
                    });
                }
                break;
            }
        }
    }

    /**
     * Execute a full shop visit: scan items, buy best available, close.
     */
    async visit(state) {
        const purchases = [];
        const money = state.money;
        const sp = state.player?.skillPoints || 0;

        if (money <= 0 && sp <= 0) {
            await this.driver.closeShop();
            return purchases;
        }

        const plan = await this._buildPurchasePlan(state);

        for (const item of plan) {
            const currentState = await this._quickState();
            if (!currentState) break;

            if (item.currency === 'COINS' && currentState.money < item.cost) continue;
            if (item.currency === 'SP' && currentState.sp < item.cost) continue;

            await this.driver.setShopCategory(item.category);
            const success = await this.driver.buyItem(item.id);

            if (success) {
                purchases.push(item);
                this._purchaseHistory.push(item.id);
                this._telemetry.currentUpgrades[item.id] =
                    (this._telemetry.currentUpgrades[item.id] || 0) + 1;
                this.logger.logPurchase(item.id, item.cost, item.currency);

                if (item.isWeapon) this.logger.logWeaponBuy(item.id, item.weaponType);
                if (item.isSkill) this.logger.logSkillBuy(item.id);
            }
        }

        // Use silent close if we have one (avoids triggering startNextWave
        // which would skip wave spawns during WAVE_TRANSITION)
        if (this.driver.closeShopSilent) {
            await this.driver.closeShopSilent();
        } else {
            await this.driver.closeShop();
        }
        return purchases;
    }

    async _quickState() {
        return this.driver.page.evaluate(() => {
            const ge = window.gameEngine;
            return ge ? { money: ge.game.money, sp: ge.player?.skillPoints || 0, wave: ge.game.currentWave } : null;
        });
    }

    async _buildPurchasePlan(state) {
        switch (this.strategy) {
            case 'random': return this._randomPlan(state);
            case 'cheapest': return this._cheapestPlan(state);
            case 'heuristic': return this._heuristicPlan(state);
            case 'optimal': return this._optimalPlan(state);
            case 'utility':
            default: return this._utilityPlan(state);
        }
    }

    // ── Utility-Based Strategy ───────────────────────────────────

    async _utilityPlan(state) {
        const plan = [];
        const allItems = await this._scanAllItems();
        const money = state.money || 0;
        const sp = state.player?.skillPoints || 0;
        const wave = state.wave || 1;
        let remainingCoins = money;
        let remainingSP = sp;

        // Possibly adapt build archetype based on telemetry
        if (this.shopParams.adaptability > 0 && wave > 1 && wave % BUILD_EVAL_INTERVAL === 0) {
            this._adaptBuild();
        }

        // Compute need scores for all upgrades
        const needScores = this._computeNeedScores(state);

        // Filter to affordable, not-maxed items
        const candidates = allItems.filter(item => {
            if (item.owned && !item.maxStacks) return false;
            const stacks = this._telemetry.currentUpgrades[item.id] || 0;
            if (item.maxStacks && stacks >= item.maxStacks) return false;
            if (item.currency === 'COINS' && remainingCoins < item.cost) return false;
            if (item.currency === 'SP' && remainingSP < item.cost) return false;
            return true;
        });

        // Score each candidate: need / cost, with archetype bias
        const scored = candidates.map(item => {
            const need = needScores[item.id] || 0.1;
            const costNorm = item.cost / 500; // normalize cost
            let value = need / Math.max(0.1, costNorm);

            // Archetype bias
            if (this.archetype.priorities.includes(item.id)) {
                value *= 1.3;
            }

            // Skill-level noise: lower quality = more random
            const noiseRange = 1 - this.shopParams.decisionQuality;
            if (noiseRange > 0) {
                value *= (1 - noiseRange) + Math.random() * noiseRange * 2;
            }

            return { ...item, value, need };
        });

        scored.sort((a, b) => b.value - a.value);

        // Saving logic: skip low-value purchases if close to affording something better
        const maxPurchases = 3;
        for (const item of scored) {
            if (plan.length >= maxPurchases) break;

            // Should we save?
            if (this.shopParams.savingAwareness > 0 && item.need < 0.2) {
                // Check if there's a high-need item we almost can afford
                const highNeed = scored.find(s =>
                    s.need > 0.6 && s.cost <= remainingCoins * 1.5 && s.cost > remainingCoins
                );
                if (highNeed && Math.random() < this.shopParams.savingAwareness) {
                    continue; // Save for it
                }
            }

            if (item.currency === 'COINS' && remainingCoins >= item.cost) {
                plan.push(item);
                remainingCoins -= item.cost;
            } else if (item.currency === 'SP' && remainingSP >= item.cost) {
                plan.push(item);
                remainingSP -= item.cost;
            }
        }

        // Weapon/skill purchases at appropriate waves
        if (wave >= 4 && !this._hasBoughtWeapon() && remainingCoins >= 500) {
            const weapon = await this._planWeaponPurchase(state);
            if (weapon) plan.push(weapon);
        }
        if (wave >= 6 && !this._hasBoughtSkill() && remainingSP >= 1) {
            const skill = await this._planSkillPurchase(state);
            if (skill) plan.push(skill);
        }

        return plan;
    }

    _computeNeedScores(state) {
        const scores = {};
        const tel = this._telemetry;
        const upgrades = tel.currentUpgrades;
        const recentWaves = tel.waveStats.slice(-TELEMETRY_WINDOW);

        // Average health ratio over recent waves
        const avgHealth = recentWaves.length > 0
            ? recentWaves.reduce((s, w) => s + w.healthRatio, 0) / recentWaves.length
            : 0.8;

        // Death rate
        const deathRate = tel.totalDeaths / Math.max(1, tel.waveStats.length);

        // Kill rate
        const killRate = tel.totalKills / Math.max(1, tel.waveStats.length);

        // LONG_RANGE: need if we're not killing many enemies (range problem)
        const longRangeStacks = upgrades.LONG_RANGE || 0;
        scores.LONG_RANGE = longRangeStacks < 6
            ? clamp01(0.8 - killRate * 0.1) * (longRangeStacks < 2 ? 1.0 : 0.6)
            : 0;

        // RAPID_FIRE: need if kill rate is low (DPS problem)
        scores.RAPID_FIRE = clamp01(0.6 - killRate * 0.08);

        // MULTI_SHOT: moderate need, scales with enemies per wave
        const avgEnemies = recentWaves.length > 0
            ? recentWaves.reduce((s, w) => s + w.enemies, 0) / recentWaves.length
            : 3;
        scores.MULTI_SHOT = clamp01(avgEnemies / 10 - 0.2) * 0.7;

        // HOMING: high need if kill rate is very low (accuracy problem)
        scores.HOMING = killRate < 2 ? 0.7 : 0.2;

        // PIERCING: moderate, more useful in later waves
        scores.PIERCING = clamp01((state.wave || 1) / 30 - 0.1) * 0.5;

        // EXPLOSIVE: moderate
        scores.EXPLOSIVE = clamp01((state.wave || 1) / 25 - 0.15) * 0.4;

        // HEALTH_BOOST: high need if health is consistently low
        scores.HEALTH_BOOST = clamp01(1 - avgHealth);

        // SHIELD_BOOST: need if taking frequent damage
        scores.SHIELD_BOOST = clamp01(deathRate * 2);

        // SPEED_BOOST: moderate, helps with dodging
        scores.SPEED_BOOST = clamp01(deathRate * 1.5) * 0.6;

        // SPARE_SHIP: high need if dying frequently
        scores.SPARE_SHIP = deathRate > 0.3 ? 0.8 : 0.3;

        // CRIT_CHANCE / CRIT_DAMAGE: need scales with existing DPS upgrades
        const hasDPS = (upgrades.RAPID_FIRE || 0) >= 2;
        scores.CRIT_CHANCE = hasDPS ? 0.5 : 0.2;
        scores.CRIT_DAMAGE = (upgrades.CRIT_CHANCE || 0) >= 2 ? 0.6 : 0.1;

        // Drop upgrades: lower priority
        scores.MEDPACK = clamp01(1 - avgHealth) * 0.5;
        scores.DOCTOR = clamp01(1 - avgHealth) * 0.3;
        scores.PAYDAY = 0.3;
        scores.HIGH_ROLLER = 0.2;
        scores.HEALTH_ORB_DROP_CHANCE = clamp01(1 - avgHealth) * 0.4;
        scores.HEALTH_ORB_DROP_QUANTITY = clamp01(1 - avgHealth) * 0.3;
        scores.MONEY_ORB_DROP_CHANCE = 0.25;
        scores.MONEY_ORB_DROP_QUANTITY = 0.2;

        return scores;
    }

    _adaptBuild() {
        const tel = this._telemetry;
        const recentWaves = tel.waveStats.slice(-TELEMETRY_WINDOW);
        if (recentWaves.length < 3) return;

        const avgHealth = recentWaves.reduce((s, w) => s + w.healthRatio, 0) / recentWaves.length;
        const deathRate = tel.totalDeaths / Math.max(1, tel.waveStats.length);
        const killRate = tel.totalKills / Math.max(1, tel.waveStats.length);

        // Blend based on adaptability parameter
        if (Math.random() > this.shopParams.adaptability) return;

        let newArch = this.archetypeName;
        if (avgHealth < 0.4 || deathRate > 0.4) {
            newArch = 'tank';
        } else if (killRate < 2) {
            newArch = 'dps';
        } else if (avgHealth > 0.7 && killRate > 4) {
            newArch = 'economy';
        } else {
            newArch = 'balanced';
        }

        if (newArch !== this.archetypeName && BUILD_ARCHETYPES[newArch]) {
            this.archetypeName = newArch;
            this.archetype = BUILD_ARCHETYPES[newArch];
        }
    }

    // ── Legacy Strategies (kept for backward compat) ─────────────

    async _randomPlan(state) {
        const allItems = await this._scanAllItems();
        const affordable = allItems.filter(i =>
            (i.currency === 'COINS' && state.money >= i.cost) ||
            (i.currency === 'SP' && (state.player?.skillPoints || 0) >= i.cost)
        );
        for (let i = affordable.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [affordable[i], affordable[j]] = [affordable[j], affordable[i]];
        }
        return affordable.slice(0, 2);
    }

    async _cheapestPlan(state) {
        const allItems = await this._scanAllItems();
        const affordable = allItems.filter(i =>
            (i.currency === 'COINS' && state.money >= i.cost) ||
            (i.currency === 'SP' && (state.player?.skillPoints || 0) >= i.cost)
        );
        affordable.sort((a, b) => a.cost - b.cost);
        return affordable.slice(0, 3);
    }

    async _heuristicPlan(state) {
        const plan = [];
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

    async _optimalPlan(state) {
        const plan = [];
        let remainingCoins = state.money || 0;
        let remainingSP = state.player?.skillPoints || 0;
        const allItems = await this._scanAllItems();

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

        if (remainingCoins >= 100) {
            const affordable = allItems
                .filter(i => i.currency === 'COINS' && remainingCoins >= i.cost &&
                             !plan.some(p => p.id === i.id) && !i.isWeapon && !i.isSkill)
                .sort((a, b) => a.cost - b.cost);
            if (affordable.length > 0) {
                plan.push(affordable[0]);
            }
        }

        return plan;
    }

    // ── Weapon & Skill Purchases ─────────────────────────────────

    async _planWeaponPurchase(state) {
        const preferred = this.archetype.preferredPrimary;
        if (!preferred) return null;
        await this.driver.setShopCategory('PRIMARY');
        const items = await this.driver.getShopItems();
        const weapon = items.find(i => i.id === preferred && !i.owned);
        if (weapon && state.money >= weapon.cost) return weapon;
        return null;
    }

    async _planSkillPurchase(state) {
        const preferred = this.archetype.preferredSkills?.[0];
        if (!preferred) return null;
        await this.driver.setShopCategory('SKILLS');
        const items = await this.driver.getShopItems();
        const skill = items.find(i => i.id === preferred && !i.owned);
        if (skill && (state.player?.skillPoints || 0) >= skill.cost) return skill;
        return null;
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
        // 5.78.2 — DROPS category removed.
        const offense = ['RAPID_FIRE', 'CRIT_CHANCE', 'CRIT_DAMAGE', 'MULTI_SHOT',
                         'HOMING', 'PIERCING', 'EXPLOSIVE', 'LONG_RANGE', 'SPARE_SHIP'];
        const defense = ['HEALTH_BOOST', 'SHIELD_BOOST', 'SPEED_BOOST'];
        if (offense.includes(itemId)) return 'OFFENSE';
        if (defense.includes(itemId)) return 'DEFENSE';
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

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
