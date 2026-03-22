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

    // Calculate next level requirements (exponential scaling)
    this.experienceToNextLevel = Math.floor(100 * Math.pow(1.5, this.level - 1));

    // Grant skill points for leveling up
    this.skillPoints += 1;

    // Health boost every 3 levels
    if (this.level % 3 === 0) {
        this.maxHealth += 5;
        this.health = Math.min(this.health + 5, this.maxHealth);
    }

    // Grant a random temporary bonus pair on level up
    this.lastLevelUpBonus = this.grantLevelUpBonus();

    // Trigger level up effects
    this.triggerLevelUpEffects();

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
    let subtitle = '+1 Skill Point';
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
    // Determine duration based on source
    const duration = isShopItem ? Infinity : (config.duration || 30000); // 30 seconds for dropped powerups

    if (this.powerups.has(type)) {
        const existing = this.powerups.get(type);

        if (isShopItem) {
            // Shop items stack and remain permanent
            existing.stacks += 1;
            existing.timeRemaining = Infinity;
            existing.isPermanent = true;
        } else {
            // Dropped powerups always add a stack
            existing.stacks += 1;
            if (!existing.isPermanent) {
                // Also refresh the timer for temporary powerups
                existing.timeRemaining = duration;
            }
        }
    } else {
        // New powerup
        this.powerups.set(type, {
            stacks: 1,
            timeRemaining: duration,
            config: config,
            isPermanent: isShopItem
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
}

export function getPowerupStacks(type) {
    return this.powerups.has(type) ? this.powerups.get(type).stacks : 0;
}

// ── Effective stat calculations ───────────────────────────────────────────

export function getMovementSpeedMultiplier() {
    const speedBoostStacks = this.getPowerupStacks('SPEED_BOOST');
    // Each stack: +50% thrust, +35% max velocity (via velocity cap in update)
    // At 6 stacks: 4x thrust, 3.1x max speed — you become a comet
    return speedBoostStacks > 0 ? (1 + speedBoostStacks * 0.5) : 1;
}

export function getRangeMultiplier() {
    const rangeStacks = this.getPowerupStacks('LONG_RANGE');
    return 1 + rangeStacks * 0.4; // +40% range per stack
}

export function getEffectiveShield() {
    const baseShield = this.shield;
    const shieldBoostStacks = this.getPowerupStacks('SHIELD_BOOST');

    const shieldBoostAmount = shieldBoostStacks * 5; // +5% damage reduction per stack

    const totalShield = baseShield + shieldBoostAmount;
    return Math.min(75, totalShield); // Cap at 75%
}

export function getEffectiveMaxHealth() {
    const baseMaxHealth = this.maxHealth;
    const healthBoostStacks = this.getPowerupStacks('HEALTH_BOOST');
    const healthBoostAmount = healthBoostStacks * 25; // +25 max health per stack

    const totalMaxHealth = baseMaxHealth + healthBoostAmount;
    return Math.min(525, totalMaxHealth); // Cap at 525 (25 base + 500 from upgrades)
}

export function getEffectiveCritChance() {
    const baseCritChance = this.baseCritChance;
    const critChanceStacks = this.getPowerupStacks('CRIT_CHANCE');
    const critChanceBonus = critChanceStacks * 5; // +5% crit chance per stack

    const totalCritChance = baseCritChance + critChanceBonus;
    return Math.min(50, totalCritChance); // Cap at 50%
}

export function getEffectiveCritDamage() {
    const critDamageStacks = this.getPowerupStacks('CRIT_DAMAGE');
    const critDamageBonus = critDamageStacks * 10; // +10% crit damage per stack

    // Randomize between 2x (200%) and 3x (300%) base, plus stacks
    const minCrit = this.baseCritDamage; // 200%
    const maxCrit = 300 + critDamageBonus; // 300% + stacks
    const totalCritDamage = minCrit + Math.random() * (maxCrit - minCrit);
    return Math.min(500, totalCritDamage); // Cap at 500% (5x)
}

export function getEffectiveHealthOrbHealing(baseHealing = 1) {
    // MEDPACK now increases min heal at orb creation time, so no collection bonus needed
    return baseHealing;
}

// Legacy support for old method names
export function getEffectiveHealthStarHealing() {
    return this.getEffectiveHealthOrbHealing();
}

export function getEffectiveBurstStarHealing() {
    return this.getEffectiveHealthOrbHealing();
}
