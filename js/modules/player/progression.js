// Player progression system — extracted from Player class
// All functions are called with .call(this) so `this` refers to the Player instance.

// ── Experience & leveling ─────────────────────────────────────────────────

export function gainExperience(amount) {
    this.experience += amount;

    // Check for level up
    while (this.experience >= this.experienceToNextLevel) {
        this.levelUp();
    }
}

export function levelUp() {
    this.experience -= this.experienceToNextLevel;
    this.level++;

    // 5.79.16 — Linear XP curve replacing the geometric blow-up.
    //   Was: 400 × 1.7^(level-1), which doubled every level.
    //   Mid-range: 200 + (level-1)·50 (linear).
    // 5.79.26 — Linear curve was too flat at high levels: enemy
    //   points scale 6.5× by wave 20 while XP-to-next only grew
    //   linearly, so a wave-20 player was leveling 8-10× per
    //   wave (= 8-10 SP per wave on top of wave-clear). Now a
    //   power curve `50 · level^1.45` so XP requirements scale
    //   alongside enemy point yields:
    //     L1: 50    L5: 525   L10: 1414  L15: 2647
    //     L20: 4202  L25: 5990  L30: 7977
    //   Approximates ~2 levels/wave across the campaign. SP gain
    //   stays meaningful but no longer compounds into a runaway
    //   pile at late waves.
    this.experienceToNextLevel = Math.floor(50 * Math.pow(this.level, 1.45));

    // 5.78.0 — picks renamed to SP (skill points). Single field;
    // `skillPoints` is the canonical name now.
    this.skillPoints = (this.skillPoints || 0) + 1;

    // Health boost every 3 levels
    if (this.level % 3 === 0) {
        this.maxHealth += 5;
        this.health = Math.min(this.health + 5, this.maxHealth);
    }

    // 5.74.17 — random temporary bonus pair removed. Players reported
    // randomly being granted a MULTI (or other) powerup without any
    // pickup or purchase, which broke the build-determinism the shop
    // and POWERUPS pause-tab provide. Level-up still grants +1 SP and
    // +1 powerup pick (deliberate, communicated rewards). Empty array
    // preserves the field for any UI that reads it.
    this.lastLevelUpBonus = [];

    // Trigger level up effects
    this.triggerLevelUpEffects();

    // 5.78.0 — T1 (lightweight). When unspent SP queue grows (≥3),
    // surface a hint toast pointing at the pause-menu POWERUPS tab so
    // the sink is discoverable. Avoids a full modal interrupt while
    // closing the discoverability gap on the SP faucet.
    if ((this.skillPoints || 0) >= 3
        && this.gameEngine
        && this.gameEngine.events?.emit) {
        // Throttle: only fire once per N levels so it doesn't toast on
        // every single level-up.
        if (!this._lastSpHintLevel || (this.level - this._lastSpHintLevel) >= 2) {
            this._lastSpHintLevel = this.level;
            this.gameEngine.events.emit('ui:show-message', {
                title: `+${this.skillPoints | 0} SP UNSPENT`,
                subtitle: 'ESC → POWERUPS to spend',
                duration: 2200,
                position: 'top',
            });
        }
    }

    return true;
}

export function grantLevelUpBonus() {
    // Pick 2 random upgrades to grant as temporary buffs (45 seconds)
    const bonusPool = [
        'RAPID_FIRE', 'MULTI_SHOT', 'HOMING', 'SPEED_BOOST',
        'PIERCING', 'CRIT_CHANCE', 'CRIT_DAMAGE', 'LONG_RANGE',
        'SHIELD_BOOST', 'BIG_BULLETS', 'EXPLOSIVE'
    ];

    // Shuffle and pick 2
    const shuffled = bonusPool.sort(() => Math.random() - 0.5);
    const picks = [shuffled[0], shuffled[1]];
    const duration = 45000; // 45 seconds

    // Track temporary bonuses for expiration
    if (!this.tempBonuses) this.tempBonuses = [];

    for (const pickId of picks) {
        // Add 1 temporary stack
        const config = this.gameEngine?.getPowerupConfig(pickId);
        if (config) {
            this.addPowerup(pickId, { ...config, duration }, false);
            this.tempBonuses.push({
                id: pickId,
                name: config.name,
                expiresAt: Date.now() + duration
            });
        }
    }

    return picks;
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
    // Set level up animation flag
    this.levelUpAnimation = {
        active: true,
        startTime: Date.now(),
        duration: 2000
    };

    // Build subtitle with bonus info
    // 5.73.0 — every level-up grants +5% Gold Find on top of the
    // skill point + powerup pick + temp bonuses, advertised here.
    let subtitle = '+1 Skill Point  +1 Powerup Pick  +5% Gold Find';
    if (this.lastLevelUpBonus && this.lastLevelUpBonus.length === 2) {
        const ge = this.gameEngine;
        const name1 = ge?.getPowerupConfig(this.lastLevelUpBonus[0])?.name || this.lastLevelUpBonus[0];
        const name2 = ge?.getPowerupConfig(this.lastLevelUpBonus[1])?.name || this.lastLevelUpBonus[1];
        subtitle += `\nBonus: ${name1} + ${name2} (45s)`;
    }
    if (this.level % 3 === 0) {
        subtitle += '\n+5 Max Health';
    }

    if (this.gameEngine?.events) {
        this.gameEngine.events.emit('ui:show-message', { title: `LEVEL ${this.level}!`, subtitle, duration: 4000, position: 'top' });
    }

    // Create level up particles via game engine
    if (this.gameEngine && this.gameEngine.particlePool) {
        this.createLevelUpParticles();
    }
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
    return this.experience / this.experienceToNextLevel;
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

    // Special handling for health boost - increase current health when purchased
    if (type === 'HEALTH_BOOST' && isShopItem) {
        const newMaxHealth = this.getEffectiveMaxHealth();
        // Increase current health by 25, but don't exceed new max
        this.health = Math.min(this.health + 25, newMaxHealth);
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

// 5.73.0 — Gold Find: scales how much gold drops from kills.
// 5.74.33 — scaling rate doubled: +10% per player level past 1 (was +5%).
// Level 1 = 1.0×, level 5 = 1.40×, level 10 = 1.90×, level 20 = 2.90×.
// Applied as a multiplier on the money-orb budget AND drop rate in
// dropOrbsFromEntity.
export function getGoldFindMultiplier() {
    return 1 + Math.max(0, (this.level || 1) - 1) * 0.10;
}

export function getRangeMultiplier() {
    const rangeStacks = this.getPowerupStacks('LONG_RANGE');
    return 1 + rangeStacks * 0.55; // +55% range per stack (was +40%)
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
