/**
 * ShopManager — shop open/close, buy/sell, tab building, and cache management.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

import { GAME_STATES } from '../core/constants.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS, PASSIVE_UPGRADES, getPrimaryUpgrades, getPowerUpgrades, getSkillUpgrades, getPassiveUpgrades } from '../combat/weapon-data.js';
import { POWERUP_TYPES, powerupGoldCost } from '../world/powerup.js';
import { SLOT_ORDER, SLOT_LABEL } from '../world/item-names.js';
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

        // 5.88.0 — SPARE_SHIP retired with the lives system. Energy tanks
        // can't be sold back: they're earned through gameplay (overflow
        // healing) and represent a per-run safety net rather than a
        // shop-purchased commodity.
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

        // 5.70.0 — PICKS-currency items (powerups bought from the
        // POWERUPS tab) are non-refundable. Picks earned per wave / per
        // level-up are limited; refunding would let the player churn
        // the same stack forever and trivialise the build choice.
        if (item.currency === 'PICKS') return false;

        // 6.0.0 — SP retired; all refunds go to GOLD.
        this.game.money += refund;
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

        // 5.76.2 — push a resume frame onto the shared `_stateResumeStack`
        // so `closeShopAndReturn` can route uniformly. `shopReturnState`
        // is kept as a back-compat read for any console / test code that
        // still queries it.
        if (this._pushResumeFrame) {
            this._pushResumeFrame({ state: this.game.state });
        }
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


        // 6.1.0 — Shop lands on POWERUPS by default (was HELP). Unified
        // shop now hosts POWERUPS + INVENTORY + per-weapon upgrade
        // trees + HELP. POWERUPS is the most-used tab so it's the
        // landing surface.
        this.shopCategory = 'POWERUPS';

        // 5.79.57 — Shop is now exclusively offensive: one tab per
        //   weapon, each tab listing that weapon's offensive upgrades
        //   (sourced from getPrimaryUpgrades / getPowerUpgrades in
        //   weapon-data.js). The DEFENSE economy is suspended for now.
        //   The previous shopItems[] array (HEALTH_BOOST, SHIELD_BOOST,
        //   SPEED_BOOST, TRIAGE, REFLEXES, LAST_STAND, STATIC_FIELD,
        //   SPARE_SHIP) is preserved here as a comment block so it can
        //   be revived without re-deriving costs/stack caps.
        this.shopItems = [];
        /* Suspended in 5.79.57 — defensive shop list:
        this.shopItems = [
            { id: 'HEALTH_BOOST',          name: 'Health Boost', description: '+25 max health',                                        cost: 1200, icon: 'heart', maxStacks: 10, category: 'DEFENSE', currency: 'COINS' },
            { id: 'SHIELD_BOOST',          name: 'Shielding',    description: '-5% damage taken per stack',                            cost: 1500, icon: 'shield', maxStacks: 8,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'SPEED_BOOST',           name: 'Afterburner',  description: '+50% thrust & +35% top speed per stack',                cost: 2200, icon: 'wind', maxStacks: 4,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'HEALTH_DROP_FREQUENCY', name: 'Triage',       description: '-5s cooldown between health drops (60s → 30s floor)',  cost: 1800, icon: 'hourglass', maxStacks: 6,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'REFLEXES',              name: 'Reflexes',     description: 'One free dodge per 30s — next bullet that would hit you misses',
                                                                  cost: 5500, icon: 'vortex', maxStacks: 1,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'LAST_STAND',            name: 'Last Stand',   description: 'On lethal hit, survive at 1 HP (once per run)',
                                                                  cost: 8000, icon: 'fist', maxStacks: 1,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'STATIC_FIELD',          name: 'Static Field', description: 'Auto-regen +2 HP shield per stack after 8s no damage',
                                                                  cost: 3200, icon: 'bolt', maxStacks: 3,  category: 'DEFENSE', currency: 'COINS' },
            { id: 'SPARE_SHIP',            name: 'Spare Ship',   description: '+1 extra life (max 3)',                                cost: 12000, icon: 'rocket', maxStacks: 1,  flatCost: true, category: 'DEFENSE', currency: 'COINS' },
        ];
        */

        this._rebuildShopCache();

        // Show the HTML shop overlay (replaces the old canvas drawShop).
        showShopDom();

}

export function _rebuildShopCache() {
        if (this.shopCategory === 'HELP') {
            // HELP tab has no purchasable items — renderer paints
            // an instructions panel.
            this.shopFilteredItems = [];
            return;
        }
        // 6.1.0 — POWERUPS tab: gold-priced list of every entry in
        // POWERUP_TYPES. Pricing comes from powerupGoldCost (cost grows
        // with current stack count). Renderer reads from
        // shopFilteredItems just like the weapon tabs.
        if (this.shopCategory === 'POWERUPS') {
            this._buildPowerupsTabItems();
            return;
        }
        // Phase 1 (2026-05-19) — PASSIVE tab: lists entries from the
        // new PASSIVE_UPGRADES export in weapon-data.js. Pricing keys
        // off each entry's `cost` field. Phase 7's shop-UI rewrite
        // will replace this builder with a richer skill-tree layout.
        if (this.shopCategory === 'PASSIVE') {
            this._buildPassiveTabItems();
            return;
        }
        // 6.1.0 — INVENTORY tab: read-only view of the player's 5
        // equipped items. No purchasable items; renderer paints item
        // rows from player.equippedItems directly.
        if (this.shopCategory === 'INVENTORY') {
            this.shopFilteredItems = [];
            return;
        }
        // Per-weapon shop tabs. Each weapon ID is a valid shopCategory
        // value; route to the appropriate generalized builder.
        if (PRIMARY_WEAPONS[this.shopCategory]) {
            this._buildPrimaryTabItems(this.shopCategory);
            return;
        }
        if (POWER_WEAPONS[this.shopCategory]) {
            this._buildPowerTabItems(this.shopCategory);
            return;
        }
        this.shopFilteredItems = [];
}

// 6.1.0 — Builds the POWERUPS shop tab. Walks POWERUP_TYPES, skips
// hidden entries, and produces a shop item per powerup with a
// stack-aware gold cost. Items use `currency: 'COINS'` so the existing
// shop-dom render path treats them as gold-priced.
export function _buildPowerupsTabItems() {
    const items = [];
    for (const [type, cfg] of Object.entries(POWERUP_TYPES)) {
        if (cfg.hidden) continue;
        const stacks = this.player?.getPowerupStacks
            ? this.player.getPowerupStacks(type) : 0;
        const cost = powerupGoldCost(cfg, stacks);
        items.push({
            id: type,
            name: cfg.displayName || cfg.name || type,
            description: cfg.description || '',
            icon: cfg.icon,
            cost,
            maxStacks: cfg.maxStacks || 99,
            category: 'POWERUPS',
            currency: 'COINS',
            isPowerup: true,
        });
    }
    this.shopFilteredItems = items;
}

// Phase 1 (2026-05-19) — Builds the PASSIVE shop tab. Walks
// PASSIVE_UPGRADES (always-on, weapon-agnostic, skill-agnostic
// upgrades) and produces a shop item per non-hidden entry. Pricing
// uses each upgrade's static `cost` (no per-stack ramp yet — Phase 7
// can layer that on with the UI rewrite). All items use
// `currency: 'COINS'` so the existing buy flow handles them.
export function _buildPassiveTabItems() {
    const items = [];
    const upgrades = getPassiveUpgrades({ includeHidden: false });
    for (const upg of upgrades) {
        items.push({
            id: upg.id,
            name: upg.name,
            description: upg.description || '',
            icon: upg.icon,
            cost: upg.cost,
            maxStacks: upg.maxStacks || 1,
            category: 'PASSIVE',
            currency: 'COINS',
            isPassive: true,
            flatCost: !!upg.flatCost,
        });
    }
    this.shopFilteredItems = items;
}

// 5.79.62 — `_buildPowerupsTabItems` fully removed. The 5.79.55
//   stub was kept "in case any save/replay path serialized the
//   function name" — verified that no such path exists, so the
//   stub joins the rest of the dead shop-tab code (POWERUPS,
//   SKILLS, DEFENSE) in the trash. Powerups live exclusively on
//   the pause-menu POWERUPS tab (ui-manager.renderPowerupsOverlay).

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

export function _buildPrimaryTabItems(weaponId = null) {
        // 5.79.57 — Optional `weaponId` argument lets the shop populate
        //   any primary weapon's upgrade list, not just the currently
        //   equipped one. Per-weapon shop tabs (PULSE / NEEDLES /
        //   SCATTER / RAIL) call this with their explicit weapon ID;
        //   passing null keeps the legacy "follow the equipped weapon"
        //   behavior for any code path that still relies on it.
        // 5.75.1 — tier-2 mastery upgrades are hidden until their prereq
        //   tier-1 upgrade is at maxStacks.
        const items = [];
        const targetWeapon = weaponId || (this.player && this.player.activePrimary);
        if (targetWeapon) {
            const upgrades = getPrimaryUpgrades(targetWeapon);
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

export function _buildPowerTabItems(weaponId = null) {
        // 5.79.57 — Optional `weaponId` argument lets the shop populate
        //   any power weapon's upgrade list. Per-weapon shop tabs
        //   (CHARGE / MINES / NOVA / MISSILES / LANCE / ARC) call this
        //   with their explicit weapon ID; passing null falls back to
        //   the equipped weapon for legacy compatibility.
        const items = [];
        const targetWeapon = weaponId || (this.player && this.player.activePower);
        if (targetWeapon) {
            const upgrades = getPowerUpgrades(targetWeapon);
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

// 5.79.62 — `_buildSkillsTabItems` removed. The SKILLS shop tab was
//   suspended in 5.79.57 along with DEFENSE; skills now live exclusively
//   in the pause-menu SKILLS tab (see ui-manager.updateSkillsTab). The
//   builder was never called by `_rebuildShopCache` after that patch
//   and the items it produced (`isSkill: true` / `isSkillUpgrade: true`)
//   never reached the shop list. Removed alongside `_handleSkillBuy`
//   (the corresponding purchase handler) in the same cleanup.

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

            // First check dynamic tab items (weapon upgrades; per-weapon
            //   shop tabs land here via `_buildPrimaryTabItems` /
            //   `_buildPowerTabItems`).
            const filteredItem = this.shopFilteredItems && this.shopFilteredItems.find(i => i.id === itemId);

            // 6.1.0 — POWERUPS shop tab. Each row has `isPowerup: true`
            // with a stack-aware gold cost computed at row-build time.
            // Recompute the current cost from current stacks so the
            // deduction matches what the player just clicked.
            if (filteredItem && filteredItem.isPowerup) {
                const cfg = POWERUP_TYPES[itemId];
                if (!cfg) return false;
                const stacks = this.player.getPowerupStacks(itemId);
                if (stacks >= (cfg.maxStacks || 99)) return false;
                const cost = powerupGoldCost(cfg, stacks);
                if (this.game.money < cost) return false;
                this.game.money -= cost;
                this.player.addPowerup(itemId, { ...cfg, duration: Infinity }, true);
                this.events.emit('audio:coin');
                this._rebuildShopCache();
                return true;
            }

            // Weapon upgrades from the per-weapon shop tabs.
            if (filteredItem && (filteredItem.isWeaponUpgrade || filteredItem.isSkillUpgrade)) {
                return this._handleUpgradeBuy(filteredItem);
            }

            // Phase 1 (2026-05-19) — PASSIVE shop tab items route
            // through the same upgrade-buy path as weapon-upgrade
            // rows. `_handleUpgradeBuy` reads `id`, `cost`,
            // `maxStacks`, and resolves the powerup config via
            // `getPowerupConfig`; PASSIVE_UPGRADES entries match that
            // shape.
            if (filteredItem && filteredItem.isPassive) {
                return this._handleUpgradeBuy(filteredItem);
            }

            // Regular shop item — falls through to the suspended
            //   shopItems[] (DEFENSE, currently empty per 5.79.57).
            //   Reactivating the DEFENSE shop tab restores this path.
            let item = this.shopItems.find(i => i.id === itemId);
            if (!item && filteredItem && filteredItem.currency === 'PICKS') {
                item = filteredItem;
            }
            if (!item) {
                console.error(`❌ Item not found: ${itemId}`);
                return false;
            }

            // 5.88.0 — SPARE_SHIP retired with the lives system. The
            // category-cap check below still rejects it cleanly.
            if (itemId === 'SPARE_SHIP') return false;

            const currentStacks = this.player.getPowerupStacks(itemId);
            if (currentStacks >= item.maxStacks) return false;

            let actualCost = item.cost;
            if (item.flatCost) {
                actualCost = item.cost;
            } else if (item.id === 'CHARGE_SPEED') {
                if (currentStacks === 0) actualCost = 1500;
                else if (currentStacks === 1) actualCost = 3000;
                else if (currentStacks === 2) actualCost = 5000;
            } else if (item.stackCostIncrement) {
                // 5.79.53 — Linear stack-scaling for SP-priced powerups.
                //   actualCost = base + stacks × increment.
                actualCost = item.cost + currentStacks * item.stackCostIncrement;
            }

            // 6.0.1 — Gold-only. SP / PICKS legacy currency tags are no
            // longer interpreted; everything deducts from game.money.
            if (this.game.money < actualCost) return false;
            this.game.money -= actualCost;

            // 5.88.0 — SPARE_SHIP retired (was a +1 life purchase). Any
            // legacy code path that still tags an item as SPARE_SHIP is
            // already rejected above before we deduct currency.
            {
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

// 5.79.62 — `_handleWeaponBuyOrEquip` and `_handleSkillBuy` removed.
//   Weapon equipping moved to the pause-menu PRIMARY / POWER tabs in
//   5.74.x and skill equipping moved to the pause-menu SKILLS tab in
//   5.64.11. After 5.79.57 stripped the SKILLS shop tab and the
//   per-weapon shop tabs only surface upgrade items (no isWeapon /
//   isSkill rows), neither handler can be reached. Their `buyShopItem`
//   dispatch branches were removed in the same cleanup; only
//   `_handleUpgradeBuy` (for weapon-upgrade rows) is live.

export function _handleUpgradeBuy(item) {
        const currentStacks = this.player.getPowerupStacks(item.id);
        if (currentStacks >= item.maxStacks) return false;

        let actualCost = item.cost;
        if (item.costOverrides) {
            actualCost = item.costOverrides[Math.min(currentStacks, item.costOverrides.length - 1)] || item.cost;
        }

        // 6.0.0 — SP retired; all upgrade costs deduct from GOLD.
        if (this.game.money < actualCost) return false;
        this.game.money -= actualCost;

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

// Dispatcher: route close based on the popped resume frame. 5.76.2 —
// reads from the shared `_stateResumeStack`; falls back to the legacy
// `shopReturnState` for back-compat with any external caller.
export function closeShopAndReturn() {
        const frame = this._popResumeFrame ? this._popResumeFrame() : null;
        const target = (frame && frame.state) || this.shopReturnState;
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
