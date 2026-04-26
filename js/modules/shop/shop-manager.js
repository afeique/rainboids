/**
 * ShopManager — shop open/close, buy/sell, tab building, and cache management.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

import { GAME_STATES } from '../core/constants.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS, getPrimaryUpgrades, getPowerUpgrades, getSkillUpgrades } from '../combat/weapon-data.js';


export function sellShopItem(itemId) {
        // Look in regular shop items first, then in current filtered items
        let item = this.shopItems.find(i => i.id === itemId);
        if (!item && this.shopFilteredItems) {
            item = this.shopFilteredItems.find(i => i.id === itemId);
        }
        if (!item) return false;

        // Can't sell weapons or skills themselves
        if (item.isWeapon || item.isSkill) return false;

        const currentStacks = this.player.getPowerupStacks(itemId);
        if (currentStacks === 0) return false;

        let lastStackCost = item.cost;
        if (item.costOverrides) {
            lastStackCost = item.costOverrides[Math.min(currentStacks - 1, item.costOverrides.length - 1)] || item.cost;
        } else if (item.id === 'CHARGE_SPEED') {
            if (currentStacks === 1) lastStackCost = 1500;
            else if (currentStacks === 2) lastStackCost = 3000;
            else if (currentStacks >= 3) lastStackCost = 5000;
        }
        const refund = Math.floor(lastStackCost * 0.5);

        if (itemId === 'SPARE_SHIP') {
            if (this.game.lives <= 1) return false;
            this.game.lives--;
            this.events.emit('ui:update-lives', { lives: this.game.lives });
        } else {
            const entry = this.player.powerups.get(itemId);
            if (!entry) return false;
            if (entry.stacks <= 1) {
                this.player.powerups.delete(itemId);
            } else {
                entry.stacks--;
            }
            if (itemId === 'HEALTH_BOOST') {
                this.player.health = Math.min(this.player.health, this.player.getEffectiveMaxHealth());
            }
        }

        if (item.currency === 'SP') {
            this.player.skillPoints += refund;
        } else {
            this.game.money += refund;
        }
        this.events.emit('audio:coin');
        this._rebuildShopCache();
        return true;
}

export function openShop() {

        // Hide any active wave messages when opening shop
        this.events.emit('ui:hide-message');

        // Shop button will be naturally hidden behind shop overlay (z-index)

        // Store the time when shop opened to adjust spawn timers later
        this.shopOpenTime = Date.now();

        // Transition to shop state from any valid state
        this.game.state = GAME_STATES.SHOP;
        document.body.classList.add('shop-open'); // Dim HUD DOM elements behind canvas overlay

        // Pause the charge shot system when opening shop
        if (this.player) {
            this.player.pauseChargeShot();
        }


        // Initialize shop state
        this.shopCategory = 'OFFENSE'; // Current tab: 'OFFENSE', 'DEFENSE', or 'DROPS'

        // Define shop items with categories and currency types
        this.shopItems = [
            // ── OFFENSE (Coins) — weapon & damage upgrades, ordered by cost ──
            { id: 'LONG_RANGE',     name: 'Long Range',       description: '+40% bullet range per stack',    cost: 150,  icon: '🏹', maxStacks: 6, category: 'OFFENSE', currency: 'COINS' },
            { id: 'RAPID_FIRE',     name: 'Rapid Fire',       description: '15% faster shooting per stack',  cost: 300,  icon: '⚡', maxStacks: 5, category: 'OFFENSE', currency: 'COINS' },
            { id: 'CRIT_CHANCE',    name: 'Critical Chance',  description: '+5% chance for critical hits',   cost: 250,  icon: '⭐', maxStacks: 8, category: 'OFFENSE', currency: 'COINS' },
            { id: 'CRIT_DAMAGE',    name: 'Critical Damage',  description: '+10% critical hit damage',       cost: 250,  icon: '🗡️', maxStacks: 8, category: 'OFFENSE', currency: 'COINS' },
            { id: 'HOMING',         name: 'Homing',           description: 'Bullets track nearest enemy',    cost: 750,  icon: '🎯', maxStacks: 3, category: 'OFFENSE', currency: 'COINS' },
            { id: 'PIERCING',       name: 'Piercing',         description: 'Bullets pass through +1 enemy',  cost: 1200, icon: '🏹', maxStacks: 3, category: 'OFFENSE', currency: 'COINS' },
            { id: 'MULTI_SHOT',     name: 'Multi Shot',       description: '+1 bullet in a spread per stack',cost: 1500, icon: '✳️', maxStacks: 3, category: 'OFFENSE', currency: 'COINS' },
            { id: 'EXPLOSIVE',      name: 'Explosive',        description: 'AoE blast on bullet impact',     cost: 2000, icon: '💣', maxStacks: 3, category: 'OFFENSE', currency: 'COINS' },
            { id: 'SPARE_SHIP',     name: 'Spare Ship',       description: '+1 extra life (max 3)',           cost: 5000, icon: '🚀', maxStacks: 1, flatCost: true, category: 'OFFENSE', currency: 'COINS' },

            // ── DEFENSE (SP) — survivability, ordered: health → armor → mobility ──
            { id: 'HEALTH_BOOST',   name: 'Health Boost',     description: '+25 max health',                           cost: 1, icon: '❤️', maxStacks: 10, category: 'DEFENSE', currency: 'SP' },
            { id: 'SHIELD_BOOST',   name: 'Shielding',        description: '-5% damage taken per stack',               cost: 1, icon: '🛡️', maxStacks: 8,  category: 'DEFENSE', currency: 'SP' },
            { id: 'SPEED_BOOST',    name: 'Afterburner',      description: '+50% thrust & +35% top speed per stack',   cost: 2, icon: '💨', maxStacks: 4,  category: 'DEFENSE', currency: 'SP' },
            { id: 'HEALTH_DROP_FREQUENCY', name: 'Triage',     description: '-5s cooldown between health drops (60s → 30s floor)', cost: 2, icon: '⏳', maxStacks: 6, category: 'DEFENSE', currency: 'SP' },

            // ── DROPS (SP) — loot economy, ordered: health group → money group → quantity ──
            { id: 'DOCTOR',                 name: 'Doctor',            description: 'Increases the max amount of health per orb', cost: 1, icon: '🏥', maxStacks: 99, category: 'DROPS', currency: 'SP' },
            { id: 'HIGH_ROLLER',            name: 'High Roller',       description: 'Increases the max amount of money per orb', cost: 1, icon: '🎰', maxStacks: 99, category: 'DROPS', currency: 'SP' },
            { id: 'MEDPACK',               name: 'Medpack',            description: 'More health per orb',                       cost: 2, icon: '💊', maxStacks: 99, category: 'DROPS', currency: 'SP' },
            { id: 'PAYDAY',                name: 'Payday',             description: 'More money per orb',                        cost: 2, icon: '💵', maxStacks: 99, category: 'DROPS', currency: 'SP' },
            { id: 'HEALTH_ORB_DROP_CHANCE', name: 'Health Orb Luck',   description: '+5% health orb drop chance',                cost: 2, icon: '🍀', maxStacks: 6,  category: 'DROPS', currency: 'SP' },
            { id: 'MONEY_ORB_DROP_CHANCE',  name: 'Money Orb Luck',    description: '+5% money orb drop chance',                 cost: 2, icon: '💰', maxStacks: 6,  category: 'DROPS', currency: 'SP' },
            { id: 'HEALTH_ORB_DROP_QUANTITY',name: 'Health Orb Bounty', description: '+1 max health orbs per drop',              cost: 3, icon: '💚', maxStacks: 3,  category: 'DROPS', currency: 'SP' },
            { id: 'MONEY_ORB_DROP_QUANTITY', name: 'Money Orb Bounty',  description: '+1 max money orbs per drop',              cost: 3, icon: '🪙', maxStacks: 3,  category: 'DROPS', currency: 'SP' },
        ];

        this._rebuildShopCache();

}

export function _rebuildShopCache() {
        if (this.shopCategory === 'PRIMARY') {
            this._buildPrimaryTabItems();
        } else if (this.shopCategory === 'POWER') {
            this._buildPowerTabItems();
        } else if (this.shopCategory === 'SKILLS') {
            this._buildSkillsTabItems();
        } else {
            this.shopFilteredItems = this.shopItems.filter(i => i.category === this.shopCategory);
        }
}

export function _buildPrimaryTabItems() {
        // PRIMARY tab now shows ONLY upgrades for the currently equipped
        // primary weapon. Weapon SELECTION moved to the pause-menu PRIMARY
        // tab (see ui-manager.updatePrimaryTab). Switching the equipped
        // weapon there causes _rebuildShopCache to repopulate this list
        // with the new weapon's upgrades.
        const items = [];
        if (this.player && this.player.activePrimary) {
            const upgrades = getPrimaryUpgrades(this.player.activePrimary);
            for (const upg of upgrades) {
                items.push({
                    id: upg.id,
                    name: upg.name,
                    description: upg.description,
                    icon: upg.icon,
                    cost: upg.cost,
                    maxStacks: upg.maxStacks,
                    category: 'PRIMARY',
                    currency: 'COINS',
                    isWeaponUpgrade: true,
                    parentWeapon: upg.weapon,
                });
            }
        }
        this.shopFilteredItems = items;
}

export function _buildPowerTabItems() {
        // POWER tab now shows ONLY upgrades for the currently equipped
        // power weapon. Weapon SELECTION moved to the pause-menu POWER tab
        // (see ui-manager.updatePowerTab). Switching the equipped weapon
        // there causes _rebuildShopCache to repopulate this list with the
        // new weapon's upgrades.
        const items = [];
        if (this.player && this.player.activePower) {
            const upgrades = getPowerUpgrades(this.player.activePower);
            for (const upg of upgrades) {
                items.push({
                    id: upg.id,
                    name: upg.name,
                    description: upg.description,
                    icon: upg.icon,
                    cost: upg.costOverrides ? upg.costOverrides[0] : upg.cost,
                    maxStacks: upg.maxStacks,
                    category: 'POWER',
                    currency: 'COINS',
                    isWeaponUpgrade: true,
                    parentWeapon: upg.weapon,
                    costOverrides: upg.costOverrides,
                });
            }
        }
        this.shopFilteredItems = items;
}

export function _buildSkillsTabItems() {
        const items = [];
        for (const skill of Object.values(DEFENSE_SKILLS)) {
            const owned = this.player && this.player.ownedSkills && this.player.ownedSkills.has(skill.id);
            items.push({
                id: skill.id,
                name: skill.name,
                description: skill.description,
                icon: skill.icon,
                cost: skill.cost,
                maxStacks: 1,
                category: 'SKILLS',
                currency: 'SP',
                isSkill: true,
                owned,
            });
        }
        // Add upgrades for all owned skills
        if (this.player && this.player.ownedSkills) {
            for (const skillId of this.player.ownedSkills) {
                const upgrades = getSkillUpgrades(skillId);
                for (const upg of upgrades) {
                    items.push({
                        id: upg.id,
                        name: upg.name,
                        description: upg.description,
                        icon: upg.icon,
                        cost: upg.cost,
                        maxStacks: upg.maxStacks,
                        category: 'SKILLS',
                        currency: 'SP',
                        isSkillUpgrade: true,
                        parentSkill: upg.skill,
                    });
                }
            }
        }
        this.shopFilteredItems = items;
}

export function closeShop() {
        try {

            if (!this.game) {
                console.error('❌ Game object is undefined in closeShop!');
                return;
            }

            // Shop button will be naturally visible again (z-index)

            // Adjust spawn timers for the time spent in shop
            if (this.shopOpenTime) {
                const timeInShop = Date.now() - this.shopOpenTime;
                this.lastSpawnTime += timeInShop; // Adjust last spawn time instead of next spawn time
                this.lastEmergencySpawn += timeInShop; // Adjust emergency timer too
                this.nextShopTime += timeInShop;
            }

            this.game.state = GAME_STATES.WAVE_TRANSITION;
            document.body.classList.remove('shop-open'); // Restore HUD DOM element visibility

            // Resume the charge shot system when closing shop
            if (this.player) {
                this.player.resumeChargeShot();
            }

            // Clear shop bounds to prevent memory leaks
            this.shopItemBounds = null;

            // Start the next wave (increments wave counter, spawns enemies + asteroids)
            this.startNextWave();


        } catch (error) {
            console.error('❌ Error in closeShop:', error);
            console.error('❌ Stack trace:', error.stack);
        }
}

export function buyShopItem(itemId) {
        try {
            if (!this.player || !this.game) return false;

            // First check dynamic tab items (weapons/skills/their upgrades)
            const filteredItem = this.shopFilteredItems && this.shopFilteredItems.find(i => i.id === itemId);

            // Handle weapon buy/equip
            if (filteredItem && filteredItem.isWeapon) {
                return this._handleWeaponBuyOrEquip(filteredItem);
            }

            // Handle skill buy
            if (filteredItem && filteredItem.isSkill) {
                return this._handleSkillBuy(filteredItem);
            }

            // Handle weapon-specific upgrades
            if (filteredItem && (filteredItem.isWeaponUpgrade || filteredItem.isSkillUpgrade)) {
                return this._handleUpgradeBuy(filteredItem);
            }

            // Regular shop item
            const item = this.shopItems.find(i => i.id === itemId);
            if (!item) {
                console.error(`❌ Item not found: ${itemId}`);
                return false;
            }

            if (itemId === 'SPARE_SHIP' && this.game.lives >= 3) return false;

            const currentStacks = this.player.getPowerupStacks(itemId);
            if (currentStacks >= item.maxStacks) return false;

            let actualCost = item.cost;
            if (item.flatCost) {
                actualCost = item.cost;
            } else if (item.id === 'CHARGE_SPEED') {
                if (currentStacks === 0) actualCost = 1500;
                else if (currentStacks === 1) actualCost = 3000;
                else if (currentStacks === 2) actualCost = 5000;
            }

            if (item.currency === 'SP') {
                if (this.player.skillPoints < actualCost) return false;
            } else {
                if (this.game.money < actualCost) return false;
            }

            if (item.currency === 'SP') {
                this.player.skillPoints -= actualCost;
            } else {
                this.game.money -= actualCost;
            }

            if (itemId === 'SPARE_SHIP') {
                this.game.lives = Math.min(3, this.game.lives + 1);
                this.events.emit('ui:update-lives', { lives: this.game.lives });
            } else {
                const powerupConfig = this.getPowerupConfig(itemId);
                if (!powerupConfig) {
                    console.error(`❌ Powerup config not found for: ${itemId}`);
                    return false;
                }
                this.player.addPowerup(itemId, {
                    ...powerupConfig,
                    duration: Infinity
                }, true);
            }

            this.events.emit('audio:coin');
            return true;

        } catch (error) {
            console.error(`❌ Error in buyShopItem:`, error);
            return false;
        }
}

export function _handleWeaponBuyOrEquip(item) {
        // Wave-gating removed — every weapon is purchasable from wave 1.
        // Equip happens in the PAUSE MENU now (PRIMARY / POWER tabs), not in
        // the shop. Shop is buy-only for power weapons; primary weapons no
        // longer appear in the shop at all (they're free in the pause menu).
        const isOwned = item.weaponType === 'primary'
            ? this.player.ownedPrimaries.has(item.id)
            : this.player.ownedPowers.has(item.id);

        if (isOwned) {
            // Already owned — clicking does nothing in the shop. The player
            // switches active weapons in the pause menu.
            return false;
        }

        // Purchase: check dual cost (coins + SP)
        const coinCost = item.cost || 0;
        const spCost = item.spCost || 0;
        if (coinCost > 0 && this.game.money < coinCost) return false;
        if (spCost > 0 && this.player.skillPoints < spCost) return false;

        if (coinCost > 0) this.game.money -= coinCost;
        if (spCost > 0) this.player.skillPoints -= spCost;

        if (item.weaponType === 'primary') {
            this.player.buyPrimary(item.id);
        } else {
            this.player.buyPower(item.id);
        }

        this._rebuildShopCache();
        this.events.emit('audio:coin');
        return true;
}

export function _handleSkillBuy(item) {
        if (this.player.ownedSkills.has(item.id)) {
            // Already owned — auto-assign to first empty slot
            for (let i = 0; i < 4; i++) {
                if (!this.player.skillSlots[i]) {
                    this.player.assignSkillToSlot(item.id, i);
                    this._rebuildShopCache();
                    this.events.emit('audio:coin');
                    return true;
                }
            }
            return false; // all slots full
        }

        const spCost = item.cost || 0;
        if (spCost > 0 && this.player.skillPoints < spCost) return false;
        if (spCost > 0) this.player.skillPoints -= spCost;

        this.player.buySkill(item.id); // Also auto-assigns to first empty slot

        this._rebuildShopCache();
        this.events.emit('audio:coin');
        return true;
}

export function _handleUpgradeBuy(item) {
        const currentStacks = this.player.getPowerupStacks(item.id);
        if (currentStacks >= item.maxStacks) return false;

        let actualCost = item.cost;
        if (item.costOverrides) {
            actualCost = item.costOverrides[Math.min(currentStacks, item.costOverrides.length - 1)] || item.cost;
        }

        if (item.currency === 'SP') {
            if (this.player.skillPoints < actualCost) return false;
            this.player.skillPoints -= actualCost;
        } else {
            if (this.game.money < actualCost) return false;
            this.game.money -= actualCost;
        }

        // Add as permanent powerup
        const powerupConfig = this.getPowerupConfig(item.id) || {
            icon: item.icon,
            color: '#FFFFFF',
            glowColor: '#FFFFFF',
        };
        this.player.addPowerup(item.id, {
            ...powerupConfig,
            duration: Infinity
        }, true);

        this._rebuildShopCache();
        this.events.emit('audio:coin');
        return true;
}

export function closeShopToPause() {
        try {

            if (!this.game) {
                console.error('❌ Game object is undefined in closeShopToPause!');
                return;
            }

            // Shop button will be naturally visible again (z-index)

            // Adjust spawn timers for the time spent in shop
            if (this.shopOpenTime) {
                const timeInShop = Date.now() - this.shopOpenTime;
                this.lastSpawnTime += timeInShop;
                this.lastEmergencySpawn += timeInShop;
                this.nextShopTime += timeInShop;
            }

            // Set state to paused instead of wave transition
            this.game.state = GAME_STATES.PAUSED;
            document.body.classList.remove('shop-open'); // Restore HUD DOM element visibility
            this.events.emit('ui:toggle-pause'); // Show pause menu

            // Resume charge shot so it's not stuck paused when the user unpauses
            if (this.player) {
                this.player.resumeChargeShot();
            }

            // Clear shop bounds to prevent memory leaks
            this.shopItemBounds = null;

        } catch (error) {
            console.error('❌ Error in closeShopToPause:', error);
            // Fallback: just set to paused state
            this.game.state = GAME_STATES.PAUSED;
        }
}
