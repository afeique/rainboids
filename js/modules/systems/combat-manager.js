// Combat effects, debris, orb drops, powerup collection, damage numbers, kill streaks
import { GAME_CONFIG, GAME_STATES } from '../constants.js';
import { random } from '../utils.js';
import { PRIMARY_UPGRADES, POWER_UPGRADES, SKILL_UPGRADES } from '../weapon-data.js';

// ── Asteroid Debris ──

export function createDebris(ast) {
    // Derive explosion color from the asteroid's unique hue
    const hue = ast.baseHue || 0;
    const sat = ast.saturation || 90;
    const lit = ast.lightness || 70;
    const baseColor = `hsl(${hue}, ${sat}%, ${lit}%)`;
    const brightColor = `hsl(${hue}, ${sat}%, ${Math.min(95, lit + 20)}%)`;
    const dimColor = `hsl(${(hue + 20) % 360}, ${sat}%, ${Math.max(40, lit - 15)}%)`;
    const sizeScale = Math.min(1.5, ast.baseRadius / 25);
    const onScreen = this.isEntityOnScreen(ast);
    const isLarge = ast.baseRadius > (GAME_CONFIG.MIN_AST_RAD + 5);

    // ── Kill juice: hitstop + camera kick + screen flash ──
    if (onScreen) {
        this.triggerHitstop(isLarge ? 6 : 4);
        this.triggerScreenFlash(isLarge ? 0.1 : 0.06, 2);
        const kdx = this.player.x - ast.x;
        const kdy = this.player.y - ast.y;
        this.triggerCameraKick(kdx, kdy, isLarge ? 12 : 7);
    }

    // 1. Bright white core flash — bigger pop
    this.particlePool.get(ast.x, ast.y, 'explosionFlash', ast.baseRadius * 1.8 * sizeScale);

    // 2. Expanding colored rings
    this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 2.5 * sizeScale, baseColor);
    setTimeout(() => {
        this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 3.2 * sizeScale, dimColor);
    }, 60);

    // 3. Directional shrapnel streaks in asteroid color
    const shrapnelCount = Math.floor(12 + 8 * sizeScale);
    for (let i = 0; i < shrapnelCount; i++) {
        const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.3, 0.3);
        const speed = random(5, 12) * sizeScale;
        const color = i % 3 === 0 ? brightColor : i % 3 === 1 ? baseColor : dimColor;
        this.particlePool.get(ast.x, ast.y, 'explosionShrapnel', angle, speed, color);
    }

    // 4. Lingering embers in asteroid's hue range
    const emberCount = Math.floor(8 + 5 * sizeScale);
    for (let i = 0; i < emberCount; i++) {
        const eHue = hue + random(-30, 30);
        const eColor = `hsl(${(eHue + 360) % 360}, ${sat}%, ${random(55, 80)}%)`;
        this.particlePool.get(ast.x, ast.y, 'explosionEmber', eColor);
    }

    // 5. Classic small particles for density
    for (let i = 0; i < 16; i++) {
        const p = this.particlePool.get(ast.x, ast.y, 'explosion');
        if (p) {
            p.color = i < 5 ? '#ffffff' : i < 10 ? baseColor : brightColor;
            const a = random(0, Math.PI * 2);
            const s = random(2, 7);
            p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
            p.radius = random(1.5, 4.5);
        }
    }

    // 6. Line debris from wireframe edges
    ast.edges.forEach(edge => {
        const p1 = ast.vertices3D[edge[0]];
        const p2 = ast.vertices3D[edge[1]];
        this.lineDebrisPool.get(ast.x, ast.y, p1, p2, baseColor);
    });

    // 7. Delayed secondary burst (matches enemy death pattern)
    setTimeout(() => {
        for (let i = 0; i < 6; i++) {
            const ox = ast.x + random(-18, 18);
            const oy = ast.y + random(-18, 18);
            this.particlePool.get(ox, oy, 'explosionEmber', baseColor);
        }
    }, 70);
}

export function createColorStarBurst(x, y) {
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + random(-0.3, 0.3);
        const speed = random(2, 5);

        const colorStar = this.colorStarPool.get(x, y, true);
        if (colorStar) {
            colorStar.vel.x = Math.cos(angle) * speed;
            colorStar.vel.y = Math.sin(angle) * speed;
        }
    }
}

// ── Enemy Debris ──

export function createEnemyDebris(enemy) {
    const color = enemy.color || '#ff4444';
    const sizeScale = Math.min(2, enemy.radius / 15);
    const onScreen = this.isEntityOnScreen(enemy);

    // ── Kill juice: hitstop + camera kick + screen flash ──
    if (onScreen) {
        this.triggerHitstop(8);
        this.triggerScreenFlash(0.12, 3);
        const kdx = this.player.x - enemy.x;
        const kdy = this.player.y - enemy.y;
        this.triggerCameraKick(kdx, kdy, 14);
    }

    // 1. Bright white core flash — the "pop"
    this.particlePool.get(enemy.x, enemy.y, 'explosionFlash', enemy.radius * 2.5 * sizeScale);

    // 2. Staggered colored rings in enemy color
    for (let ring = 0; ring < 3; ring++) {
        setTimeout(() => {
            const ringColor = ring === 0 ? '#ffffff' : color;
            this.particlePool.get(enemy.x, enemy.y, 'explosionRingColored',
                (35 + ring * 30) * sizeScale, ringColor);
        }, ring * 50);
    }

    // 3. Directional shrapnel in enemy color — fast streaks flying outward
    const shrapnelCount = Math.floor(16 + 8 * sizeScale);
    for (let i = 0; i < shrapnelCount; i++) {
        const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.4, 0.4);
        const speed = random(6, 14) * sizeScale;
        const sColor = i % 3 === 0 ? '#ffffff' : color;
        this.particlePool.get(enemy.x, enemy.y, 'explosionShrapnel', angle, speed, sColor);
    }

    // 4. Lingering embers in enemy color
    const emberCount = Math.floor(10 + 6 * sizeScale);
    for (let i = 0; i < emberCount; i++) {
        this.particlePool.get(enemy.x, enemy.y, 'explosionEmber',
            i % 2 === 0 ? color : '#ffcc66');
    }

    // 5. Classic small particles for density (mix of white + enemy color)
    for (let i = 0; i < 20; i++) {
        const p = this.particlePool.get(enemy.x, enemy.y, 'explosion');
        if (p) {
            p.color = i < 6 ? '#ffffff' : color;
            const a = random(0, Math.PI * 2);
            const s = random(2, 8);
            p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
            p.radius = random(1.5, 5);
        }
    }

    // 6. Create colored line debris based on enemy shape
    this.createShapeDebris(enemy);

    // 7. Screen shake (only if on screen)
    if (onScreen) {
        this.triggerScreenShake(30, 18, enemy.radius * 2.5);
    }

    // 8. Delayed secondary burst — scattered sparks
    setTimeout(() => {
        for (let i = 0; i < 10; i++) {
            const ox = enemy.x + random(-25, 25);
            const oy = enemy.y + random(-25, 25);
            this.particlePool.get(ox, oy, 'explosionEmber', color);
        }
    }, 80);
}

export function createShapeDebris(enemy) {
    const debrisCount = 6;
    const size = enemy.radius * 0.8;

    for (let i = 0; i < debrisCount; i++) {
        let p1, p2;

        switch (enemy.type) {
            case 'HUNTER': { // Triangle debris
                const triangleAngle = (i / 3) * Math.PI * 2 / 3;
                p1 = { x: Math.cos(triangleAngle) * size * 0.5, y: Math.sin(triangleAngle) * size * 0.5 };
                p2 = { x: Math.cos(triangleAngle + Math.PI * 2/3) * size * 0.5, y: Math.sin(triangleAngle + Math.PI * 2/3) * size * 0.5 };
                break;
            }

            case 'GUARDIAN': { // Square debris
                const squareAngle = (i / 4) * Math.PI * 2;
                p1 = { x: Math.cos(squareAngle) * size * 0.5, y: Math.sin(squareAngle) * size * 0.5 };
                p2 = { x: Math.cos(squareAngle + Math.PI/2) * size * 0.5, y: Math.sin(squareAngle + Math.PI/2) * size * 0.5 };
                break;
            }

            case 'WASP': { // Diamond debris
                const diamondAngle = (i / 4) * Math.PI * 2 + Math.PI/4;
                p1 = { x: Math.cos(diamondAngle) * size * 0.4, y: Math.sin(diamondAngle) * size * 0.4 };
                p2 = { x: Math.cos(diamondAngle + Math.PI/2) * size * 0.4, y: Math.sin(diamondAngle + Math.PI/2) * size * 0.4 };
                break;
            }

            case 'TITAN': { // Hexagon debris
                const hexAngle = (i / 6) * Math.PI * 2;
                p1 = { x: Math.cos(hexAngle) * size * 0.6, y: Math.sin(hexAngle) * size * 0.6 };
                p2 = { x: Math.cos(hexAngle + Math.PI/3) * size * 0.6, y: Math.sin(hexAngle + Math.PI/3) * size * 0.6 };
                break;
            }

            case 'STALKER': // Cross debris
                if (i < 2) {
                    p1 = { x: -size * 0.5, y: 0 };
                    p2 = { x: size * 0.5, y: 0 };
                } else {
                    p1 = { x: 0, y: -size * 0.5 };
                    p2 = { x: 0, y: size * 0.5 };
                }
                break;

            case 'TANGERINE': { // Spiked circle debris
                const spikeAngle = (i / 8) * Math.PI * 2;
                p1 = { x: Math.cos(spikeAngle) * size * 0.3, y: Math.sin(spikeAngle) * size * 0.3 };
                p2 = { x: Math.cos(spikeAngle) * size * 0.6, y: Math.sin(spikeAngle) * size * 0.6 };
                break;
            }

            default: { // Default random debris
                const angle = (i / debrisCount) * Math.PI * 2;
                p1 = { x: Math.cos(angle) * size * 0.3, y: Math.sin(angle) * size * 0.3 };
                p2 = { x: Math.cos(angle) * size * 0.6, y: Math.sin(angle) * size * 0.6 };
            }
        }

        this.lineDebrisPool.get(enemy.x, enemy.y, p1, p2, enemy.color);
    }
}

// ── Orb Creation & Drops ──

export function createHealthOrb(x, y) {
    const healthOrb = this.colorStarPool.get(x, y, 'health');
    if (healthOrb) {
        const medpackStacks = this.player.getPowerupStacks('MEDPACK');
        const doctorStacks = this.player.getPowerupStacks('DOCTOR');
        const minHeal = GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN + (medpackStacks * GAME_CONFIG.MEDPACK_HEAL_MIN_UPGRADE);
        const maxHeal = Math.max(minHeal, GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MAX + (medpackStacks * GAME_CONFIG.MEDPACK_HEAL_MIN_UPGRADE) + (doctorStacks * GAME_CONFIG.DOCTOR_HEAL_MAX_UPGRADE));
        healthOrb.healAmount = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;

        const healRatio = maxHeal > minHeal ? (healthOrb.healAmount - minHeal) / (maxHeal - minHeal) : 0;
        const minSize = GAME_CONFIG.HEALTH_ORB_SIZE_MIN;
        const maxSize = GAME_CONFIG.HEALTH_ORB_SIZE_MAX;
        healthOrb.sizeMultiplier = minSize + (healRatio * (maxSize - minSize));

        const baseRadius = healthOrb.baseRadius || healthOrb.radius;
        healthOrb.radius = baseRadius * healthOrb.sizeMultiplier;

        const angle = random(0, Math.PI * 2);
        const speed = random(1, 3);
        healthOrb.vel.x = Math.cos(angle) * speed;
        healthOrb.vel.y = Math.sin(angle) * speed;
    }
}

export function createMoneyOrb(x, y) {
    const moneyOrb = this.colorStarPool.get(x, y, 'money');
    if (moneyOrb) {
        const paydayStacks = this.player.getPowerupStacks('PAYDAY');
        const highRollerStacks = this.player.getPowerupStacks('HIGH_ROLLER');
        const minMoney = GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN + (paydayStacks * GAME_CONFIG.PAYDAY_MONEY_MIN_UPGRADE);
        const maxMoney = Math.max(minMoney, GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MAX + (paydayStacks * GAME_CONFIG.PAYDAY_MONEY_MIN_UPGRADE) + (highRollerStacks * GAME_CONFIG.HIGH_ROLLER_MONEY_MAX_UPGRADE));
        moneyOrb.moneyAmount = Math.floor(Math.random() * (maxMoney - minMoney + 1)) + minMoney;

        const moneyRatio = maxMoney > minMoney ? (moneyOrb.moneyAmount - minMoney) / (maxMoney - minMoney) : 0;
        const minSize = GAME_CONFIG.MONEY_ORB_SIZE_MIN;
        const maxSize = GAME_CONFIG.MONEY_ORB_SIZE_MAX;
        moneyOrb.sizeMultiplier = minSize + (moneyRatio * (maxSize - minSize));

        const baseRadius = moneyOrb.baseRadius || moneyOrb.radius;
        moneyOrb.radius = baseRadius * moneyOrb.sizeMultiplier;

        const angle = random(0, Math.PI * 2);
        const speed = random(1, 3);
        moneyOrb.vel.x = Math.cos(angle) * speed;
        moneyOrb.vel.y = Math.sin(angle) * speed;
    }
}

export function dropStarsFromEntity(x, y) {
    this.createHealthOrb(x, y);
    this.createMoneyOrb(x, y);
}

export function dropOrbsFromEntity(x, y, entity = null) {
    const healthDropChanceStacks = this.player.getPowerupStacks('HEALTH_ORB_DROP_CHANCE');
    const moneyDropChanceStacks = this.player.getPowerupStacks('MONEY_ORB_DROP_CHANCE');
    const healthDropQuantityStacks = this.player.getPowerupStacks('HEALTH_ORB_DROP_QUANTITY');
    const moneyDropQuantityStacks = this.player.getPowerupStacks('MONEY_ORB_DROP_QUANTITY');

    const hitStreakMultiplier = this.player.getHitStreakMultiplier();

    const isEnemy = entity && entity.type && typeof entity.type === 'string';
    const enemyDropRateBonus = isEnemy ? 0.15 : 0;
    const enemyQuantityMultiplier = isEnemy ? 1.3 : 1;

    const entityLevel = entity?.level || 1;
    const levelDropRateBonus = (entityLevel - 1) * 0.05;
    const levelQuantityMultiplier = 1 + (entityLevel - 1) * 0.1;

    const baseHealthDropRate = GAME_CONFIG.HEALTH_ORB_BASE_DROP_RATE + (healthDropChanceStacks * GAME_CONFIG.HEALTH_ORB_DROP_CHANCE_UPGRADE) + levelDropRateBonus + enemyDropRateBonus;
    const baseMoneyDropRate = GAME_CONFIG.MONEY_ORB_BASE_DROP_RATE + (moneyDropChanceStacks * GAME_CONFIG.MONEY_ORB_DROP_CHANCE_UPGRADE) + levelDropRateBonus + enemyDropRateBonus;

    const healthDropRate = Math.min(1.0, baseHealthDropRate);
    const moneyDropRate = Math.min(1.0, baseMoneyDropRate);

    // Drop health orbs
    if (Math.random() < healthDropRate) {
        const maxHealthOrbs = GAME_CONFIG.HEALTH_ORB_BASE_DROP_COUNT_MAX + (healthDropQuantityStacks * GAME_CONFIG.HEALTH_ORB_DROP_QUANTITY_UPGRADE);
        const baseHealthOrbCount = Math.floor(Math.random() * maxHealthOrbs) + 1;
        const levelScaledHealthOrbCount = Math.floor(baseHealthOrbCount * levelQuantityMultiplier);
        const enemyScaledHealthOrbCount = Math.floor(levelScaledHealthOrbCount * enemyQuantityMultiplier);
        const totalHealthOrbCount = Math.max(1, Math.floor(enemyScaledHealthOrbCount * hitStreakMultiplier));

        for (let i = 0; i < totalHealthOrbCount; i++) {
            this.createHealthOrb(x, y);
        }
    }

    // Drop money orbs
    if (Math.random() < moneyDropRate) {
        const maxMoneyOrbs = GAME_CONFIG.MONEY_ORB_BASE_DROP_COUNT_MAX + (moneyDropQuantityStacks * GAME_CONFIG.MONEY_ORB_DROP_QUANTITY_UPGRADE);
        const baseMoneyOrbCount = Math.floor(Math.random() * maxMoneyOrbs) + 1;
        const levelScaledMoneyOrbCount = Math.floor(baseMoneyOrbCount * levelQuantityMultiplier);
        const enemyScaledMoneyOrbCount = Math.floor(levelScaledMoneyOrbCount * enemyQuantityMultiplier);
        const totalMoneyOrbCount = Math.max(1, Math.floor(enemyScaledMoneyOrbCount * hitStreakMultiplier));

        for (let i = 0; i < totalMoneyOrbCount; i++) {
            this.createMoneyOrb(x, y);
        }
    }
}

// ── Powerups ──

export function dropPowerup(x, y, type = null) {
    const powerup = this.powerupPool.get(x, y, type);
    if (powerup) {
        const angle = random(0, Math.PI * 2);
        const speed = random(0.5, 1.5);
        powerup.vel.x = Math.cos(angle) * speed;
        powerup.vel.y = Math.sin(angle) * speed;
    }
    return powerup;
}

export function collectPowerup(powerup) {
    if (!this.player || !this.player.active) return;

    this.player.addPowerup(powerup.type, powerup.config);

    // Visual feedback
    this.particlePool.get(powerup.x, powerup.y, 'pickupPulse');
    for (let i = 0; i < 8; i++) {
        const particle = this.particlePool.get(powerup.x, powerup.y, 'starSparkle');
        if (particle) {
            particle.color = powerup.color;
            const angle = (i / 8) * Math.PI * 2;
            particle.vel.x = Math.cos(angle) * 2;
            particle.vel.y = Math.sin(angle) * 2;
        }
    }

    this.audioManager.playPowerup();
    this.showPowerupDisplay(powerup.config.name, powerup.powerupColor);
}

export function showPowerupDisplay(name, color) {
    this.powerupDisplay.active = true;
    this.powerupDisplay.text = name.toUpperCase();
    this.powerupDisplay.color = color;
    this.powerupDisplay.opacity = 1.0;
    this.powerupDisplay.fadeTimer = this.powerupDisplay.maxFadeTime;
}

export function getPowerupConfig(type) {
    const configs = {
        'SHIELD_BOOST':             { name: 'Shielding',          duration: Infinity, icon: '🛡️', gradientColors: ['#33ff99', '#006644'] },
        'RAPID_FIRE':               { name: 'Rapid Fire',          duration: Infinity, icon: '⚡', gradientColors: ['#ff6600', '#ff0000'] },
        'MULTI_SHOT':               { name: 'Multi Shot',          duration: Infinity, icon: '✳️', gradientColors: ['#66aaff', '#0033cc'] },
        'SPEED_BOOST':              { name: 'Afterburner',         duration: Infinity, icon: '💨', gradientColors: ['#ffff33', '#cc9900'] },
        'BIG_BULLETS':              { name: 'Big Bullets',         duration: Infinity, icon: '🔵', gradientColors: ['#66ff66', '#009900'] },
        'PIERCING':                 { name: 'Piercing',            duration: Infinity, icon: '🏹', gradientColors: ['#ffcc66', '#cc6600'] },
        'EXPLOSIVE':                { name: 'Explosive',           duration: Infinity, icon: '💣', gradientColors: ['#ff9933', '#cc3300'] },
        'HOMING':                   { name: 'Homing',              duration: Infinity, icon: '🎯', gradientColors: ['#ff66cc', '#cc0066'] },
        'MEDPACK':                  { name: 'Medpack',             duration: Infinity, icon: '💊', gradientColors: ['#ff99cc', '#cc3366'] },
        'HEALTH_BOOST':             { name: 'Health Boost',        duration: Infinity, icon: '❤️', gradientColors: ['#ff6666', '#cc0000'] },
        'CRIT_CHANCE':              { name: 'Critical Chance',     duration: Infinity, icon: '⭐', gradientColors: ['#ffff66', '#cc9900'] },
        'CRIT_DAMAGE':              { name: 'Critical Damage',     duration: Infinity, icon: '🗡️', gradientColors: ['#ff3399', '#cc0033'] },
        'LONG_RANGE':               { name: 'Long Range',          duration: Infinity, icon: '🏹', gradientColors: ['#bbff66', '#448800'] },
        'CHARGE_SPEED':             { name: 'Charge Speed',        duration: Infinity, icon: '⏱️', gradientColors: ['#ffcc00', '#cc8800'] },
        'CHARGE_POWER':             { name: 'Charge Power',        duration: Infinity, icon: '🔋', gradientColors: ['#ff6600', '#cc3300'] },
        'HEALTH_ORB_DROP_CHANCE':   { name: 'Health Orb Luck',     duration: Infinity, icon: '🍀', gradientColors: ['#33ff99', '#009944'] },
        'MONEY_ORB_DROP_CHANCE':    { name: 'Money Orb Luck',      duration: Infinity, icon: '💰', gradientColors: ['#ffdd00', '#cc8800'] },
        'HEALTH_ORB_DROP_QUANTITY': { name: 'Health Orb Bounty',   duration: Infinity, icon: '💚', gradientColors: ['#66ff66', '#009900'] },
        'MONEY_ORB_DROP_QUANTITY':  { name: 'Money Orb Bounty',    duration: Infinity, icon: '🪙', gradientColors: ['#ffcc00', '#996600'] },
        'DOCTOR':                   { name: 'Doctor',              duration: Infinity, icon: '🏥', gradientColors: ['#ff6688', '#cc2244'] },
        'PAYDAY':                   { name: 'Payday',              duration: Infinity, icon: '💵', gradientColors: ['#66ff66', '#228822'] },
        'HIGH_ROLLER':              { name: 'High Roller',         duration: Infinity, icon: '🎰', gradientColors: ['#ffdd44', '#cc8800'] },
    };
    if (configs[type]) return configs[type];

    // Dynamic fallback for weapon/skill upgrades from weapon-data.js
    const allUpgrades = { ...PRIMARY_UPGRADES, ...POWER_UPGRADES, ...SKILL_UPGRADES };
    if (allUpgrades[type]) {
        const upg = allUpgrades[type];
        return { name: upg.name, duration: Infinity, icon: upg.icon, gradientColors: ['#aaaaff', '#4444aa'] };
    }
    return null;
}

// ── Kill Streaks ──

export function onEnemyKill(enemy) {
    if (!this.killCount) this.killCount = 0;
    if (!this.killStreakTimer) this.killStreakTimer = 0;
    if (!this.killStreakCount) this.killStreakCount = 0;

    this.killCount++;
    this.killStreakCount++;
    this.killStreakTimer = Date.now();

    const streakMessages = {
        3: 'TRIPLE KILL',
        5: 'RAMPAGE',
        8: 'UNSTOPPABLE',
        12: 'GODLIKE',
        20: 'LEGENDARY'
    };

    if (streakMessages[this.killStreakCount]) {
        this.queueNotification(streakMessages[this.killStreakCount],
            `+${this.killStreakCount * 10} bonus coins`, 2000);
        this.game.money += this.killStreakCount * 10;
    }

    const milestones = { 1: 'FIRST BLOOD', 25: '25 KILLS', 50: 'HALF CENTURY',
        100: 'CENTURION', 200: 'DESTROYER', 500: 'ANNIHILATOR' };
    if (milestones[this.killCount]) {
        this.queueNotification(milestones[this.killCount],
            `${this.killCount} enemies destroyed`, 2500);
    }
}

export function updateKillStreak() {
    if (this.killStreakTimer && Date.now() - this.killStreakTimer > 3000) {
        this.killStreakCount = 0;
    }
}

// ── Damage Numbers ──

export function createDamageNumber(x, y, damage) {
    const damageNumber = {
        x: x,
        y: y,
        damage: Math.round(damage),
        life: 1.0,
        maxLife: 1.5,
        vel: {
            x: (Math.random() - 0.5) * 2,
            y: -2 - Math.random() * 2
        },
        gravity: 0.1,
        creationTime: Date.now()
    };

    this.damageNumbers.push(damageNumber);
}

export function updateDamageNumbers(deltaTime) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
        const dmgNum = this.damageNumbers[i];

        dmgNum.x += dmgNum.vel.x;
        dmgNum.y += dmgNum.vel.y;
        dmgNum.vel.y += dmgNum.gravity;

        dmgNum.life -= deltaTime / 1000;

        // Remove expired (swap-and-pop to avoid O(n) splice)
        if (dmgNum.life <= 0) {
            this.damageNumbers[i] = this.damageNumbers[this.damageNumbers.length - 1];
            this.damageNumbers.pop();
        }
    }
}

// ── Money Pickup Display ──

export function addMoneyPickup(amount) {
    this.moneyPickupDisplay.amount += amount;
    this.moneyPickupDisplay.displayTime = 0;
}

export function updateMoneyPickupDisplay(deltaTime) {
    if (this.moneyPickupDisplay.amount > 0) {
        this.moneyPickupDisplay.displayTime += deltaTime;

        if (this.moneyPickupDisplay.displayTime >= this.moneyPickupDisplay.maxDisplayTime) {
            this.moneyPickupDisplay.amount = 0;
            this.moneyPickupDisplay.displayTime = 0;
        }
    }
}

// ── Entity Targeting ──

export function setTargetInfo(target) {
    this.targetInfo.active = true;
    this.targetInfo.target = target;
    this.targetInfo.displayTime = 0;
}

export function updateTargetInfo(deltaTime) {
    if (this.targetInfo.active) {
        this.targetInfo.displayTime += deltaTime;
        if (this.targetInfo.displayTime >= this.targetInfo.maxDisplayTime ||
            (this.targetInfo.target && this.targetInfo.target.health <= 0)) {
            this.targetInfo.active = false;
            this.targetInfo.target = null;
        }
    }
}

export function handleEntityTargeting(worldX, worldY) {
    let clickedEntity = null;

    // Check enemies first (higher priority)
    for (const enemy of this.enemyPool.activeObjects) {
        if (!enemy.active) continue;

        const dx = worldX - enemy.x;
        const dy = worldY - enemy.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= enemy.radius + 15) {
            clickedEntity = enemy;
            break;
        }
    }

    // Check asteroids if no enemy clicked
    if (!clickedEntity) {
        for (const asteroid of this.asteroidPool.activeObjects) {
            if (!asteroid.active) continue;

            const dx = worldX - asteroid.x;
            const dy = worldY - asteroid.y;
            const distance = Math.hypot(dx, dy);

            if (distance <= asteroid.radius + 15) {
                clickedEntity = asteroid;
                break;
            }
        }
    }

    if (clickedEntity) {
        this.targetedEntity = clickedEntity;
        this.setTargetInfo(clickedEntity);
    }
}

export function updateHoverDetection() {
    if (this.game.state !== GAME_STATES.PLAYING) {
        this.cursor.hoveredEntity = null;
        return;
    }

    const worldX = this.cursor.x + this.camera.x;
    const worldY = this.cursor.y + this.camera.y;

    let hoveredEntity = null;

    for (const enemy of this.enemyPool.activeObjects) {
        if (!enemy.active) continue;

        const dx = worldX - enemy.x;
        const dy = worldY - enemy.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= enemy.radius + 10) {
            hoveredEntity = enemy;
            break;
        }
    }

    if (!hoveredEntity) {
        for (const asteroid of this.asteroidPool.activeObjects) {
            if (!asteroid.active) continue;

            const dx = worldX - asteroid.x;
            const dy = worldY - asteroid.y;
            const distance = Math.hypot(dx, dy);

            if (distance <= asteroid.radius + 10) {
                hoveredEntity = asteroid;
                break;
            }
        }
    }

    this.cursor.hoveredEntity = hoveredEntity;
    this.cursor.isOverTarget = hoveredEntity !== null;
}
