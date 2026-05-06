/**
 * ShopManager — shop open/close, buy/sell, tab building, and cache management.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

import { GAME_STATES } from '../core/constants.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS, getPrimaryUpgrades, getPowerUpgrades, getSkillUpgrades } from '../combat/weapon-data.js';
import { POWERUP_TYPES } from '../world/powerup.js';
import { showShopDom, hideShopDom, renderShopDom, updateShopCurrencyDom } from './shop-dom.js';


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
        // Full at-cost refund — players don't lose currency when selling
        // (lets them experiment with builds; the upgrade tree is a
        // permanent collection, not a sunk cost). Mirrors sellRefundFor
        // in shop-dom.js — both must agree or the displayed refund and
        // actual refund will diverge.
        const refund = lastStackCost;

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

        // 5.70.0 — PICKS-currency items (powerups bought from the
        // POWERUPS tab) are non-refundable. Picks earned per wave / per
        // level-up are limited; refunding would let the player churn
        // the same stack forever and trivialise the build choice.
        if (item.currency === 'PICKS') return false;

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

        // Remember which state to return to when the shop closes. Captured
        // BEFORE we transition to SHOP so closeShopAndReturn() can route:
        //   PAUSED          → closeShopToPause   (back to pause menu)
        //   WAVE_TRANSITION → closeShop          (start next wave)
        //   PLAYING         → closeShopToPlaying (resume gameplay)
        this.shopReturnState = this.game.state;

        // Transition to shop state from any valid state
        this.game.state = GAME_STATES.SHOP;
        document.body.classList.add('shop-open'); // Dim HUD DOM elements behind canvas overlay

        // If the pause overlay is up (user clicked SHOP from pause menu),
        // hide it so the shop has a clean stage.
        const pauseOverlay = document.getElementById('pause-overlay');
        if (pauseOverlay) pauseOverlay.style.display = 'none';

        // Pause the charge shot system when opening shop
        if (this.player) {
            this.player.pauseChargeShot();
        }


        // 5.73.0 — POWERUPS tab moved to the pause menu. Shop now lands
        // on HELP by default; the tabs that remain are HELP / PRIMARY /
        // POWER / DEFENSE (gold + SP economies). Picks are spent in
        // pause-menu POWERUPS instead.
        this.shopCategory = 'HELP';

        // Shop now sells PRIMARY/POWER weapons, DEFENSE upgrades, and
        // SKILLS. The OFFENSE and DROPS categories were removed —
        // those upgrades are now permanent stacking powerup pickups
        // (see POWERUP_TYPES in powerup.js + the Powerups overlay).
        // SPARE_SHIP moved from OFFENSE to DEFENSE.
        // 5.76.0 — DEFENSE category fully migrated to gold (SP currency
        // removed). Costs scaled to match the bumped Gold Find economy:
        // every upgrade should feel like a deliberate purchase. Floor
        // costs roughly 2.5× the prior SP equivalents (1 SP ≈ 800g of
        // mid-game value); per-stack scaling exponential so the 8th
        // shielding stack costs more than the 1st.
        this.shopItems = [
            { id: 'HEALTH_BOOST',          name: 'Health Boost', description: '+25 max health',                                        cost: 1200, icon: '❤️', maxStacks: 10, category: 'DEFENSE', currency: 'COINS' },
            { id: 'SHIELD_BOOST',          name: 'Shielding',    description: '-5% damage taken per stack',                            cost: 1500, icon: '🛡️', maxStacks: 8,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'SPEED_BOOST',           name: 'Afterburner',  description: '+50% thrust & +35% top speed per stack',                cost: 2200, icon: '💨', maxStacks: 4,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'HEALTH_DROP_FREQUENCY', name: 'Triage',       description: '-5s cooldown between health drops (60s → 30s floor)',  cost: 1800, icon: '⏳', maxStacks: 6,  category: 'DEFENSE', currency: 'COINS' },
            // Qualitative defense layer (5.75.0). High costs because they're
            // run-defining picks that change moment-to-moment survival math.
            { id: 'REFLEXES',              name: 'Reflexes',     description: 'One free dodge per 30s — next bullet that would hit you misses',
                                                                  cost: 5500, icon: '🌀', maxStacks: 1,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'LAST_STAND',            name: 'Last Stand',   description: 'On lethal hit, survive at 1 HP (once per run)',
                                                                  cost: 8000, icon: '✊', maxStacks: 1,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'STATIC_FIELD',          name: 'Static Field', description: 'Auto-regen +2 HP shield per stack after 8s no damage',
                                                                  cost: 3200, icon: '⚡', maxStacks: 3,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'SPARE_SHIP',            name: 'Spare Ship',   description: '+1 extra life (max 3)',                                cost: 12000, icon: '🚀', maxStacks: 1,  flatCost: true, category: 'DEFENSE', currency: 'COINS' },
        ];

        this._rebuildShopCache();

        // Show the HTML shop overlay (replaces the old canvas drawShop).
        showShopDom();

}

export function _rebuildShopCache() {
        if (this.shopCategory === 'HELP') {
            // HELP tab has no purchasable items — the renderer paints
            // an instructions panel. (TIMER + POWERUPS both moved to
            // the pause menu in 5.72.1 / 5.73.0.)
            this.shopFilteredItems = [];
            return;
        } else if (this.shopCategory === 'PRIMARY') {
            this._buildPrimaryTabItems();
        } else if (this.shopCategory === 'POWER') {
            this._buildPowerTabItems();
        } else if (this.shopCategory === 'SKILLS') {
            this._buildSkillsTabItems();
        } else {
            this.shopFilteredItems = this.shopItems.filter(i => i.category === this.shopCategory);
        }
}

// 5.70.0 — Powerups tab. Lists every entry in POWERUP_TYPES; each
// "costs" 1 powerup pick. Picks are earned at wave clear and on
// player level-up. Powerups no longer drop from kills.
//
// 5.72.0 — maxStacks default raised from 1 to 99. POWERUP_TYPES doesn't
// define per-id caps; the previous `??1` fallback meant every powerup
// allowed only one purchase, which broke the build-stacking core loop.
// 99 is effectively unlimited (no run will hit it), and per-powerup
// caps can be added in POWERUP_TYPES later if specific powerups need
// real limits (Crit Chance >100%, Multi-Shot 3, etc).
export function _buildPowerupsTabItems() {
        const items = [];
        for (const [id, config] of Object.entries(POWERUP_TYPES)) {
            if (config.hidden) continue;
            items.push({
                id,
                name: config.name || id,
                description: config.description || '',
                icon: config.icon || '⚡',
                cost: 1,
                maxStacks: config.maxStacks ?? 99,
                category: 'POWERUPS',
                currency: 'PICKS',
            });
        }
        this.shopFilteredItems = items;
}

// 5.76.1 — fire 🎖️ MASTERY UNLOCKED toast the first time each capstone
// becomes available. Walks every PRIMARY_UPGRADES entry with `requires`
// and compares against the player's stacks. Tracks shown set on the
// engine so re-opens don't spam.
export function checkCapstoneUnlocks() {
    if (!this.player || !this.player.getPowerupStacks) return;
    if (!this._seenCapstoneUnlocks) this._seenCapstoneUnlocks = new Set();
    const all = (typeof PRIMARY_UPGRADES_ALL !== 'undefined') ? PRIMARY_UPGRADES_ALL : null;
    // Use getPrimaryUpgrades for every weapon to keep this scoped.
    const weapons = this.PRIMARY_WEAPONS_LIST ? Object.keys(this.PRIMARY_WEAPONS_LIST) : [];
    for (const weaponId of weapons) {
        const upgrades = getPrimaryUpgrades(weaponId);
        for (const upg of upgrades) {
            if (!upg.requires) continue;
            const stacks = this.player.getPowerupStacks(upg.requires.id);
            if (stacks < (upg.requires.stacks || 1)) continue;
            if (this._seenCapstoneUnlocks.has(upg.id)) continue;
            this._seenCapstoneUnlocks.add(upg.id);
            if (this.events?.emit) {
                this.events.emit('ui:show-message', {
                    title: '🎖️ MASTERY UNLOCKED',
                    subtitle: upg.name,
                    duration: 2800,
                    position: 'top',
                });
            }
        }
    }
}

export function _buildPrimaryTabItems() {
        // PRIMARY tab now shows ONLY upgrades for the currently equipped
        // primary weapon. Weapon SELECTION moved to the pause-menu PRIMARY
        // tab (see ui-manager.updatePrimaryTab). Switching the equipped
        // weapon there causes _rebuildShopCache to repopulate this list
        // with the new weapon's upgrades.
        // 5.75.1 — tier-2 mastery upgrades are hidden until their prereq
        // tier-1 upgrade is at maxStacks. Keeps the shop tidy and reveals
        // capstones as a reward when the player invests in a build.
        const items = [];
        if (this.player && this.player.activePrimary) {
            const upgrades = getPrimaryUpgrades(this.player.activePrimary);
            // 5.76.1 — capstone unlock toast. The first time a capstone
            // becomes available, fire a 🎖️ MASTERY UNLOCKED toast. Track
            // a "seen" set on the engine so it doesn't re-fire each open.
            if (!this._seenCapstoneUnlocks) this._seenCapstoneUnlocks = new Set();
            for (const upg of upgrades) {
                if (upg.requires) {
                    const reqStacks = this.player.getPowerupStacks
                        ? this.player.getPowerupStacks(upg.requires.id)
                        : 0;
                    if (reqStacks < (upg.requires.stacks || 1)) continue; // not unlocked yet
                    if (!this._seenCapstoneUnlocks.has(upg.id)) {
                        this._seenCapstoneUnlocks.add(upg.id);
                        if (this.events?.emit) {
                            this.events.emit('ui:show-message', {
                                title: '🎖️ MASTERY UNLOCKED',
                                subtitle: upg.name,
                                duration: 2800,
                                position: 'top',
                            });
                        }
                    }
                }
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
                cost: 0,             // free — see 5.64.11
                maxStacks: 1,
                category: 'SKILLS',
                currency: 'FREE',
                isSkill: true,
                owned,
            });
        }
        // 5.76.0 — skill upgrades migrated from SP to COINS along with
        // DEFENSE. Costs scaled to gold-equivalent (~1500g per former
        // 1-2 SP). Currency uniformly COINS across the shop now.
        if (this.player && this.player.ownedSkills) {
            for (const skillId of this.player.ownedSkills) {
                const upgrades = getSkillUpgrades(skillId);
                for (const upg of upgrades) {
                    items.push({
                        id: upg.id,
                        name: upg.name,
                        description: upg.description,
                        icon: upg.icon,
                        cost: upg.cost * 1500, // SP-cost units rescaled to gold (1 SP ≈ 1500g)
                        maxStacks: upg.maxStacks,
                        category: 'SKILLS',
                        currency: 'COINS',
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
            hideShopDom();

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

            // Regular shop item — first check the static shopItems list,
            // then fall through to the currently-built filteredItems
            // (POWERUPS tab is built dynamically from POWERUP_TYPES so
            // its entries don't live in the static list).
            let item = this.shopItems.find(i => i.id === itemId);
            if (!item && filteredItem && filteredItem.currency === 'PICKS') {
                item = filteredItem;
            }
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
            } else if (item.currency === 'PICKS') {
                if ((this.player.powerupPicks || 0) < actualCost) return false;
            } else {
                if (this.game.money < actualCost) return false;
            }

            if (item.currency === 'SP') {
                this.player.skillPoints -= actualCost;
            } else if (item.currency === 'PICKS') {
                this.player.powerupPicks -= actualCost;
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
            // 5.76.1 — re-check capstone unlocks after every purchase so
            // the toast fires the moment the prereq is satisfied.
            checkCapstoneUnlocks.call(this);
            // Refresh the shop's filtered list so any newly-unlocked
            // capstone appears immediately without a tab swap.
            this._rebuildShopCache();
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
        // 5.64.11 — skills are free and selectable from the pause menu's
        // SKILLS tab. Shop "purchase" is now a free equip — keeps any
        // legacy shop SKILLS tab functional, but the canonical UX is the
        // pause menu.
        this.player.equipSkill(item.id);
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

export function closeShopToPlaying() {
        try {
            if (!this.game) {
                console.error('❌ Game object is undefined in closeShopToPlaying!');
                return;
            }

            // Adjust spawn timers for the time spent in shop (same as the
            // other close paths — keep spawn cadence consistent).
            if (this.shopOpenTime) {
                const timeInShop = Date.now() - this.shopOpenTime;
                this.lastSpawnTime += timeInShop;
                this.lastEmergencySpawn += timeInShop;
                this.nextShopTime += timeInShop;
            }

            // Resume gameplay directly — no pause menu, no next-wave trigger.
            this.game.state = GAME_STATES.PLAYING;
            document.body.classList.remove('shop-open');
            hideShopDom();

            if (this.player) this.player.resumeChargeShot();

            this.shopItemBounds = null;
        } catch (error) {
            console.error('❌ Error in closeShopToPlaying:', error);
            this.game.state = GAME_STATES.PLAYING;
        }
}

// Dispatcher: route close based on the state we were in when the shop
// opened. Lets the X button / ESC do the right thing in all three cases.
export function closeShopAndReturn() {
        const target = this.shopReturnState;
        if (target === GAME_STATES.PAUSED) return this.closeShopToPause();
        if (target === GAME_STATES.WAVE_TRANSITION) return this.closeShop();
        return this.closeShopToPlaying();
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
            hideShopDom();
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
