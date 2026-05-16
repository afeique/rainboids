// Player progression system — extracted from Player class.
// All functions are called with .call(this) so `this` refers to the Player instance.
//
// 6.0.0 — Player leveling REMOVED. Wave is the new "level"; gold is
// the only currency. The functions below are kept as no-op stubs so
// the collision-system kill-reward call sites and any HUD code that
// reads getExperienceProgress don't NPE. Originals live in git
// history if needed.
//
// Stats that used to scale with player level now scale with the
// CURRENT WAVE (see combat-manager.js drops, getGoldFindMultiplier
// below). Powerups + items are the player's only growth axes.

// ── Experience & leveling (6.0.0 — all no-op) ───────────────────────────

export function gainExperience(/* amount */) { /* no-op since 6.0.0 */ }
export function levelUp() { return false; }

export function grantLevelUpBonus() {
    // 6.0.0 — no-op. Wave-clear survivor cards replace the old 45s
    // dual-buff cadence.
    return [];
}

export function updateTempBonuses() {
    if (!this.tempBonuses || this.tempBonuses.length === 0) return;

    const now = Date.now();
    this.tempBonuses = this.tempBonuses.filter(bonus => {
        if (now >= bonus.expiresAt) {
            // Remove the temporary stack
            const powerup = this.powerups.get(bonus.id);
            if (powerup && powerup.stacks > 0) {
                powerup.stacks--;
                if (powerup.stacks <= 0) {
                    this.powerups.delete(bonus.id);
                }
            }
            return false;
        }
        return true;
    });
}

export function triggerLevelUpEffects() {
    // 6.0.0 — no-op. Wave-clear survivor cards are the new celebration
    // beat (see wave-manager.openWavePickOverlay).
}

export function createLevelUpParticles() {
    const gameEngine = this.gameEngine;
    if (!gameEngine || !gameEngine.particlePool) return;

    // Create golden burst particles around player
    for (let i = 0; i < 20; i++) {
        const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
        if (particle) {
            const angle = (i / 20) * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            particle.vel.x = Math.cos(angle) * speed;
            particle.vel.y = Math.sin(angle) * speed;
            particle.color = '#FFD700'; // Gold color
            particle.radius = 2 + Math.random() * 2;
            particle.life = 60 + Math.random() * 40;
        }
    }

    // Create expanding golden ring
    const ring = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', this.radius * 3);
    if (ring) {
        ring.color = '#FFD700';
    }

    // Create secondary ring with delay
    setTimeout(() => {
        const ring2 = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', this.radius * 5);
        if (ring2) {
            ring2.color = '#FFA500'; // Orange
        }
    }, 300);
}

export function getExperienceProgress() {
    // 6.0.0 — no XP. Always 0 so any lingering HUD reader paints empty.
    return 0;
}

// ── Powerup management ────────────────────────────────────────────────────

export function addPowerup(type, config, isShopItem = false) {
    // ALL powerups are now permanent and stacking — drops included.
    // The `isShopItem` param is kept for back-compat with any caller
    // that still passes it; it no longer controls duration.
    // 5.75.0 — `config.maxStacks` is now respected: the next pick at
    // cap silently no-ops. The shop's purchasePowerup also gates buys
    // on this cap so you can't waste picks; this is the safety net.
    const cap = (config && config.maxStacks) || 99;
    if (this.powerups.has(type)) {
        const existing = this.powerups.get(type);
        if (existing.stacks >= cap) return false;
        existing.stacks += 1;
        existing.timeRemaining = Infinity;
        existing.isPermanent = true;
    } else {
        this.powerups.set(type, {
            stacks: 1,
            timeRemaining: Infinity,
            config: config,
            isPermanent: true,
        });
    }

    // Special handling for health boost - full heal on pick (5.101.0).
    // The displayName/description now both promise "full heal on pick",
    // so honor it regardless of isShopItem (wave-pick / shop / debug all
    // restore HP). The +35 max-HP bump comes from getEffectiveMaxHealth.
    if (type === 'HEALTH_BOOST') {
        this.health = this.getEffectiveMaxHealth();
    }

    if (isShopItem) {
    } else {
    }
}

export function updatePowerups() {
    // Decrease timers and remove expired powerups (skip permanent ones)
    for (const [type, powerup] of this.powerups.entries()) {
        if (powerup.timeRemaining !== Infinity && !powerup.isPermanent) {
            powerup.timeRemaining -= 16; // Assume 60fps
            if (powerup.timeRemaining <= 0) {
                this.powerups.delete(type);
            }
        }
    }

    // 5.101.0 — REGEN powerup. Passive +0.5 HP/s per stack, capped at
    // the player's effective max HP. Accumulator pattern keeps the
    // regen frame-rate independent.
    // 5.106.0 — Each granted HP fires a green "+N" floater (aggregated
    // per-player in createDamageNumber so a continuous regen reads as
    // a single growing number, not +1 spam).
    // 5.114.0 — Combat-gated. Regen ONLY ticks after the player has
    // gone REGEN_DAMAGE_GATE_MS without taking damage. Taking a hit
    // resets `_lastDamageAt` (already maintained in lifecycle.takeDamage),
    // which puts regen back on its 4-second cooldown. Net effect: regen
    // is a between-fights recovery tool, not an in-combat tank.
    // Inventory items can also contribute regen (see getEffectiveRegen).
    const regenPerSec = this.getEffectiveRegen();
    const REGEN_DAMAGE_GATE_MS = 4000;
    const now = Date.now();
    const sinceDamage = now - (this._lastDamageAt || 0);
    if (regenPerSec > 0 && this.active && this.health > 0
            && sinceDamage >= REGEN_DAMAGE_GATE_MS) {
        const cap = this.getEffectiveMaxHealth();
        if (this.health < cap) {
            this._regenAcc = (this._regenAcc || 0) + regenPerSec * (16 / 1000);
            let regenTickGained = 0;
            while (this._regenAcc >= 1 && this.health < cap) {
                this.health = Math.min(cap, this.health + 1);
                this._regenAcc -= 1;
                regenTickGained++;
            }
            if (regenTickGained > 0 && this.gameEngine
                    && typeof this.gameEngine.createDamageNumber === 'function') {
                this.gameEngine.createDamageNumber(
                    this.x,
                    this.y - (this.radius || 14) - 4,
                    regenTickGained,
                    { isHeal: true },
                );
            }
        } else {
            // 5.114.0 — At max HP, regen ticks count toward the
            // overflow → tank accumulator. So a player camping at max
            // with REGEN stacks slowly builds toward an extra triforce
            // piece, mirroring the orb-overflow path.
            const overflow = regenPerSec * (16 / 1000);
            if (this.gameEngine && typeof this.gameEngine.accumulateOverflowToTank === 'function') {
                this.gameEngine.accumulateOverflowToTank(overflow);
            }
            this._regenAcc = 0;
        }
    } else if (sinceDamage < REGEN_DAMAGE_GATE_MS) {
        // Within the no-regen window after taking damage: reset the
        // accumulator so a returning regen tick doesn't dump stored
        // progress all at once.
        this._regenAcc = 0;
    }

    // 5.75.0 — STATIC_FIELD regen. After 8s of no damage, the static
    // shield slowly tops back up to its cap (+2 HP per stack).
    const staticStacks = this.getPowerupStacks('STATIC_FIELD');
    if (staticStacks > 0) {
        const cap = staticStacks * 2;
        if (this._staticShield === undefined) this._staticShield = cap;
        if (this._staticShield < cap) {
            const idleSinceDamage = Date.now() - (this._lastDamageAt || 0);
            if (idleSinceDamage > 8000) {
                // 1 HP per second of regen — modest so it doesn't trivialize.
                this._staticShieldRegenAcc = (this._staticShieldRegenAcc || 0) + 16 / 1000;
                while (this._staticShieldRegenAcc >= 1 && this._staticShield < cap) {
                    this._staticShield += 1;
                    this._staticShieldRegenAcc -= 1;
                }
            }
        }
    }
}

export function getPowerupStacks(type) {
    return this.powerups.has(type) ? this.powerups.get(type).stacks : 0;
}

// ── Effective stat calculations ───────────────────────────────────────────

export function getMovementSpeedMultiplier() {
    const speedBoostStacks = this.getPowerupStacks('SPEED_BOOST');
    // Each stack: +65% thrust (was +50%) — bumped to make a single
    // pickup decisively change ship feel given the new lower drop rates.
    return speedBoostStacks > 0 ? (1 + speedBoostStacks * 0.65) : 1;
}

// 6.0.0 — Gold Find now scales with WAVE, not player level. Same
// shape: +10% per wave past 1. W1=1.0×, W5=1.4×, W10=1.9×, W30=3.9×.
// Reads through the live gameEngine reference (set by main.js) since
// the Player doesn't carry a wave field directly.
export function getGoldFindMultiplier() {
    const ge = this.gameEngine
        || ((typeof window !== 'undefined') ? window.gameEngine : null);
    const wave = (ge && ge.game) ? (ge.game.currentWave | 0) : 1;
    return 1 + Math.max(0, wave - 1) * 0.10;
}

export function getRangeMultiplier() {
    // 5.110.0 — Range upgrade path retired. Base bullet flight covers
    // the full playfield (since 5.100.3); LONG_RANGE was hidden then,
    // and now PENETRATOR / LANCE_VELOCITY-range / TRIPLE_BEAM-range /
    // ARC_OVERCHARGE-chain-range have all been replaced with damage
    // or behavioral upgrades. Always returns 1 so per-weapon
    // `config.range` modifiers (e.g. Rail Driver 0.85) are the only
    // remaining axis affecting bullet flight distance.
    return 1;
}

// 5.114.0 — Effective passive regen rate (HP per second). Sums:
//   - REGEN powerup: 0.5 HP/s per stack
//   - Inventory items with a `regenBonus` field: each item's bonus
//     (HP/s). Items roll regenBonus during createItem in
//     world/item-system.js (small chance of a secondary regen roll).
//   - Base: 0 — the player has no innate regen.
//
// Combat-gated downstream by updatePowerups (4-second no-damage
// window before regen ticks).
// 6.0.1 — Hard ceiling on effective regen. Stacking the REGEN powerup
// with an epic trinket primary + 4× secondary regen affixes pushed
// out-of-combat heal past 10 HP/s, making the 4-second damage gate
// trivial to wait out. Cap at 3.0 HP/s keeps regen a meaningful
// recovery tool without turning the player into a tank.
const REGEN_RATE_CAP = 3.0;
export function getEffectiveRegen() {
    let regen = 0;
    const stacks = this.getPowerupStacks ? this.getPowerupStacks('REGEN') : 0;
    if (stacks > 0) regen += stacks * 0.5;
    if (this.equippedItems) {
        for (const slot of Object.keys(this.equippedItems)) {
            const it = this.equippedItems[slot];
            if (it && typeof it.regenBonus === 'number') {
                regen += it.regenBonus;
            }
        }
    }
    return Math.min(REGEN_RATE_CAP, regen);
}

export function getEffectiveShield() {
    const baseShield = this.shield;
    const shieldBoostStacks = this.getPowerupStacks('SHIELD_BOOST');

    // +8% damage reduction per stack (was +5%). Cap stays at 75%.
    const shieldBoostAmount = shieldBoostStacks * 8;

    // 5.99.4 — Diablo defensive items. Each equipped toughness item
    // (shield, plating) adds its `bonus` directly to the shield
    // percentage. Stacks on top of SHIELD_BOOST.
    let itemBonus = 0;
    if (this.equippedItems) {
        const s = this.equippedItems.shield;
        const p = this.equippedItems.plating;
        if (s && s.bonusType === 'toughness') itemBonus += s.bonus;
        if (p && p.bonusType === 'toughness') itemBonus += p.bonus;
    }

    const totalShield = baseShield + shieldBoostAmount + itemBonus;
    return Math.min(75, totalShield); // Cap at 75%
}

export function getEffectiveMaxHealth() {
    const baseMaxHealth = this.maxHealth;
    const healthBoostStacks = this.getPowerupStacks('HEALTH_BOOST');
    const healthBoostAmount = healthBoostStacks * 35; // +35 max health per stack (was +25)

    // 5.99.4 — Diablo defensive items (HP slots). Each equipped HP item
    // (helm, armor) adds its `bonus` to max health. Stacks on top of
    // HEALTH_BOOST.
    let itemBonus = 0;
    if (this.equippedItems) {
        const h = this.equippedItems.helm;
        const a = this.equippedItems.armor;
        if (h && h.bonusType === 'hp') itemBonus += h.bonus;
        if (a && a.bonusType === 'hp') itemBonus += a.bonus;
    }

    const totalMaxHealth = baseMaxHealth + healthBoostAmount + itemBonus;
    // Cap raised to 600 to accommodate the higher per-stack value while
    // still preventing infinite scaling.
    return Math.min(600, totalMaxHealth);
}

export function getEffectiveCritChance() {
    const baseCritChance = this.baseCritChance;
    const critChanceStacks = this.getPowerupStacks('CRIT_CHANCE');
    const critChanceBonus = critChanceStacks * 7; // +7% per stack (was +5%)

    const totalCritChance = baseCritChance + critChanceBonus;
    return Math.min(60, totalCritChance); // Cap raised 50% → 60%
}

export function getEffectiveCritDamage() {
    const critDamageStacks = this.getPowerupStacks('CRIT_DAMAGE');
    const critDamageBonus = critDamageStacks * 15; // +15% per stack (was +10%)

    // Randomize between 2x (200%) and 3x (300%) base, plus stacks
    const minCrit = this.baseCritDamage; // 200%
    const maxCrit = 300 + critDamageBonus; // 300% + stacks
    const totalCritDamage = minCrit + Math.random() * (maxCrit - minCrit);
    return Math.min(550, totalCritDamage); // Cap raised 500% → 550%
}

// Knockback multiplier applied to all power-weapon impulses (Mine,
// Nova, Lightning, Missile). +40% per stack of KNOCKBACK powerup
// (was +30%), capped at 3.5x (was 3.0x).
export function getKnockbackMultiplier() {
    const stacks = this.getPowerupStacks('KNOCKBACK');
    return Math.min(3.5, 1 + stacks * 0.4);
}

export function getEffectiveHealthOrbHealing(baseHealing = 1) {
    // 5.78.2 — heal amount is decided at orb creation time inside
    // createHealthOrb (level-scaled). No collection-time bonus.
    return baseHealing;
}

// Legacy support for old method names
export function getEffectiveHealthStarHealing() {
    return this.getEffectiveHealthOrbHealing();
}

export function getEffectiveBurstStarHealing() {
    return this.getEffectiveHealthOrbHealing();
}
