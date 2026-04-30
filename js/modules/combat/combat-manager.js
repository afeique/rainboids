// Combat effects, debris, orb drops, powerup collection, damage numbers, kill streaks
import { GAME_CONFIG, GAME_STATES } from '../core/constants.js';
import { random } from '../core/utils.js';
import { PRIMARY_UPGRADES, POWER_UPGRADES, SKILL_UPGRADES, STREAK_TIERS, STREAK_BUFF_DURATION } from './weapon-data.js';

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
        this.triggerHitstop(isLarge ? 5 : 3);
        // Refined screen flash — present but not in-your-face.
        this.triggerScreenFlash(isLarge ? 0.06 : 0.035, 3);
        const kdx = this.player.x - ast.x;
        const kdy = this.player.y - ast.y;
        this.triggerCameraKick(kdx, kdy, isLarge ? 12 : 7);
    }

    // 1. Soft white core flash — visible during hitstop, refined radius.
    this.particlePool.get(ast.x, ast.y, 'explosionFlash', ast.baseRadius * 1.5 * sizeScale);

    // 2. Expanding colored rings — staggered wavefronts
    this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 2.5 * sizeScale, baseColor);
    setTimeout(() => {
        this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 3.2 * sizeScale, dimColor);
    }, 70);
    setTimeout(() => {
        this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 2.0 * sizeScale, brightColor);
    }, 150);

    // 3. Directional shrapnel streaks in asteroid color
    const shrapnelCount = Math.floor(14 + 10 * sizeScale);
    for (let i = 0; i < shrapnelCount; i++) {
        const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.3, 0.3);
        const speed = random(4, 14) * sizeScale;
        const color = i % 3 === 0 ? brightColor : i % 3 === 1 ? baseColor : dimColor;
        this.particlePool.get(ast.x, ast.y, 'explosionShrapnel', angle, speed, color);
    }

    // 4. Core glow — slow embers at center that linger
    for (let i = 0; i < 4; i++) {
        const p = this.particlePool.get(
            ast.x + random(-3, 3), ast.y + random(-3, 3),
            'explosionEmber', i < 1 ? '#ffffff' : brightColor
        );
        if (p) {
            p.vel.x *= 0.15;
            p.vel.y *= 0.15;
            p.life = random(1.3, 2.0);
            p.radius = random(2, 4.5);
        }
    }

    // 5. Lingering embers in asteroid's hue range
    const emberCount = Math.floor(10 + 7 * sizeScale);
    for (let i = 0; i < emberCount; i++) {
        const eHue = hue + random(-30, 30);
        const eColor = `hsl(${(eHue + 360) % 360}, ${sat}%, ${random(55, 80)}%)`;
        this.particlePool.get(ast.x, ast.y, 'explosionEmber', eColor);
    }

    // 6. Classic small particles for density
    for (let i = 0; i < 20; i++) {
        const p = this.particlePool.get(ast.x, ast.y, 'explosion');
        if (p) {
            p.color = i < 6 ? '#ffffff' : i < 12 ? baseColor : brightColor;
            const a = random(0, Math.PI * 2);
            const s = random(2, 8);
            p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
            p.radius = random(1.5, 4.5);
        }
    }

    // 7. Line debris from wireframe edges
    ast.edges.forEach(edge => {
        const p1 = ast.vertices3D[edge[0]];
        const p2 = ast.vertices3D[edge[1]];
        this.lineDebrisPool.get(ast.x, ast.y, p1, p2, baseColor);
    });

    // 8. Delayed secondary burst — cascade
    setTimeout(() => {
        for (let i = 0; i < 6; i++) {
            const ox = ast.x + random(-18, 18);
            const oy = ast.y + random(-18, 18);
            this.particlePool.get(ox, oy, 'explosionEmber', baseColor);
        }
    }, 80);

    // 9. Second delayed burst — final pop
    setTimeout(() => {
        for (let i = 0; i < 4; i++) {
            const ox = ast.x + random(-25, 25);
            const oy = ast.y + random(-25, 25);
            this.particlePool.get(ox, oy, 'explosionEmber', brightColor);
        }
    }, 180);
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
        this.triggerHitstop(5);
        // Refined screen flash — enemies hit harder than asteroids but
        // still well below the old 0.15 that washed the screen.
        this.triggerScreenFlash(0.07, 4);
        const kdx = this.player.x - enemy.x;
        const kdy = this.player.y - enemy.y;
        this.triggerCameraKick(kdx, kdy, 14);
    }

    // 1. Soft white core flash — the "pop" (starts visible during hitstop)
    this.particlePool.get(enemy.x, enemy.y, 'explosionFlash', enemy.radius * 2.0 * sizeScale);

    // 2. Staggered colored rings — expanding wavefronts
    for (let ring = 0; ring < 4; ring++) {
        setTimeout(() => {
            const ringColor = ring === 0 ? '#ffffff' : ring === 1 ? color : '#ffcc66';
            this.particlePool.get(enemy.x, enemy.y, 'explosionRingColored',
                (30 + ring * 25) * sizeScale, ringColor);
        }, ring * 60);
    }

    // 3. Directional shrapnel in enemy color — fast streaks flying outward
    const shrapnelCount = Math.floor(20 + 10 * sizeScale);
    for (let i = 0; i < shrapnelCount; i++) {
        const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.4, 0.4);
        const speed = random(5, 16) * sizeScale;
        const sColor = i % 4 === 0 ? '#ffffff' : i % 4 === 1 ? '#ffcc66' : color;
        this.particlePool.get(enemy.x, enemy.y, 'explosionShrapnel', angle, speed, sColor);
    }

    // 4. Core glow cluster — slow embers at center that linger where the enemy was
    for (let i = 0; i < 5; i++) {
        const p = this.particlePool.get(
            enemy.x + random(-4, 4), enemy.y + random(-4, 4),
            'explosionEmber', i < 2 ? '#ffffff' : color
        );
        if (p) {
            p.vel.x *= 0.2;
            p.vel.y *= 0.2;
            p.life = random(1.4, 2.2);
            p.radius = random(2.5, 5);
        }
    }

    // 5. Lingering embers in enemy color
    const emberCount = Math.floor(12 + 8 * sizeScale);
    for (let i = 0; i < emberCount; i++) {
        this.particlePool.get(enemy.x, enemy.y, 'explosionEmber',
            i % 3 === 0 ? '#ffcc66' : color);
    }

    // 6. Classic small particles for density (mix of white + enemy color)
    for (let i = 0; i < 24; i++) {
        const p = this.particlePool.get(enemy.x, enemy.y, 'explosion');
        if (p) {
            p.color = i < 7 ? '#ffffff' : i < 14 ? color : '#ffcc66';
            const a = random(0, Math.PI * 2);
            const s = random(2, 9);
            p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
            p.radius = random(1.5, 5);
        }
    }

    // 7. Create colored line debris based on enemy shape
    this.createShapeDebris(enemy);

    // 8. Screen shake (only if on screen)
    if (onScreen) {
        this.triggerScreenShake(30, 18, enemy.radius * 2.5);
    }

    // 9. Delayed secondary burst — scattered sparks (cascade feel)
    setTimeout(() => {
        for (let i = 0; i < 8; i++) {
            const ox = enemy.x + random(-20, 20);
            const oy = enemy.y + random(-20, 20);
            this.particlePool.get(ox, oy, 'explosionEmber', color);
        }
        this.particlePool.get(enemy.x, enemy.y, 'explosionRingColored',
            enemy.radius * 1.8 * sizeScale, color);
    }, 90);

    // 10. Second delayed burst — final pop
    setTimeout(() => {
        for (let i = 0; i < 5; i++) {
            const ox = enemy.x + random(-30, 30);
            const oy = enemy.y + random(-30, 30);
            this.particlePool.get(ox, oy, 'explosionEmber', '#ffcc66');
        }
    }, 200);
}

export function createShapeDebris(enemy) {
    // Full-silhouette scatter — same model as asteroid debris. Build a
    // list of vertices that traces the enemy's outer outline at its
    // actual radius, then emit one debris segment per consecutive pair.
    // A few internal struts and broken-off chunks give the wreckage
    // mass instead of leaving a hollow ring.
    const r = enemy.radius;
    const color = enemy.color;
    const verts = [];           // outline vertices (closed loop)
    const struts = [];          // extra internal segments [p1, p2]

    switch (enemy.type) {
        case 'HUNTER': { // Triangle ship — point forward
            const tip = r * 1.1;
            const back = r * 0.7;
            verts.push({ x: tip, y: 0 });
            verts.push({ x: -back, y: -back * 0.9 });
            verts.push({ x: -back * 0.45, y: 0 });
            verts.push({ x: -back, y: back * 0.9 });
            // internal hull bracing
            struts.push([{ x: tip * 0.5, y: 0 }, { x: -back * 0.45, y: 0 }]);
            struts.push([{ x: -back * 0.7, y: -back * 0.4 }, { x: -back * 0.7, y: back * 0.4 }]);
            break;
        }
        case 'GUARDIAN': { // Square hull
            const s = r * 0.85;
            verts.push({ x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s });
            // diagonals
            struts.push([{ x: -s, y: -s }, { x: s, y: s }]);
            struts.push([{ x: s, y: -s }, { x: -s, y: s }]);
            break;
        }
        case 'WASP': { // Diamond
            const s = r * 1.0;
            verts.push({ x: 0, y: -s }, { x: s * 0.7, y: 0 }, { x: 0, y: s }, { x: -s * 0.7, y: 0 });
            // cross brace
            struts.push([{ x: -s * 0.4, y: -s * 0.4 }, { x: s * 0.4, y: s * 0.4 }]);
            struts.push([{ x: s * 0.4, y: -s * 0.4 }, { x: -s * 0.4, y: s * 0.4 }]);
            break;
        }
        case 'TITAN':
        case 'TANGERINE': { // 8-sided big enemies
            const sides = 8;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2;
                verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
            // inner ring at half radius — second shell of wreckage
            const inner = r * 0.55;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
                const a2 = a + Math.PI * 2 / sides;
                struts.push([
                    { x: Math.cos(a) * inner, y: Math.sin(a) * inner },
                    { x: Math.cos(a2) * inner, y: Math.sin(a2) * inner },
                ]);
            }
            // a couple of radial spokes
            struts.push([{ x: 0, y: 0 }, { x: r * 0.7, y: 0 }]);
            struts.push([{ x: 0, y: 0 }, { x: -r * 0.7, y: 0 }]);
            struts.push([{ x: 0, y: 0 }, { x: 0, y: r * 0.7 }]);
            struts.push([{ x: 0, y: 0 }, { x: 0, y: -r * 0.7 }]);
            break;
        }
        case 'STALKER': { // Cross/plus
            const armLen = r * 1.05;
            const armW = r * 0.3;
            // outline of a plus shape (12 verts)
            verts.push(
                { x: -armW, y: -armLen }, { x: armW, y: -armLen },
                { x: armW, y: -armW },    { x: armLen, y: -armW },
                { x: armLen, y: armW },   { x: armW, y: armW },
                { x: armW, y: armLen },   { x: -armW, y: armLen },
                { x: -armW, y: armW },    { x: -armLen, y: armW },
                { x: -armLen, y: -armW }, { x: -armW, y: -armW },
            );
            // cross-brace through center
            struts.push([{ x: -armLen, y: 0 }, { x: armLen, y: 0 }]);
            struts.push([{ x: 0, y: -armLen }, { x: 0, y: armLen }]);
            break;
        }
        default: { // Generic 6-sided hull
            const sides = 6;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2;
                verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
            const inner = r * 0.5;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
                const a2 = a + Math.PI * 2 / sides;
                struts.push([
                    { x: Math.cos(a) * inner, y: Math.sin(a) * inner },
                    { x: Math.cos(a2) * inner, y: Math.sin(a2) * inner },
                ]);
            }
            break;
        }
    }

    // Emit outline edges (closed loop).
    for (let i = 0; i < verts.length; i++) {
        const p1 = verts[i];
        const p2 = verts[(i + 1) % verts.length];
        this.lineDebrisPool.get(enemy.x, enemy.y, p1, p2, color);
    }
    // Emit internal struts.
    for (let i = 0; i < struts.length; i++) {
        const [p1, p2] = struts[i];
        this.lineDebrisPool.get(enemy.x, enemy.y, p1, p2, color);
    }
}

// ── Orb Creation & Drops ──

// Spawn one health orb. If `healAmountOverride` is provided, that exact heal
// value is used (the splitter in dropOrbsFromEntity uses this to spread a heal
// budget across many small, capped orbs). Otherwise the historical random
// min..max formula applies. Size scales with heal-relative-to-cap so capped
// orbs always look modest, never enormous.
export function createHealthOrb(x, y, healAmountOverride = null) {
    const healthOrb = this.colorStarPool.get(x, y, 'health');
    if (!healthOrb) return;

    let healAmount;
    if (healAmountOverride !== null) {
        healAmount = Math.max(1, healAmountOverride);
    } else {
        const medpackStacks = this.player.getPowerupStacks('MEDPACK');
        const doctorStacks = this.player.getPowerupStacks('DOCTOR');
        const minHeal = GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN + (medpackStacks * GAME_CONFIG.MEDPACK_HEAL_MIN_UPGRADE);
        const maxHeal = Math.max(minHeal, GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MAX + (medpackStacks * GAME_CONFIG.MEDPACK_HEAL_MIN_UPGRADE) + (doctorStacks * GAME_CONFIG.DOCTOR_HEAL_MAX_UPGRADE));
        healAmount = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;
    }
    healthOrb.healAmount = healAmount;

    const cap = GAME_CONFIG.HEALTH_ORB_MAX_HEAL_PER_ORB;
    const ratio = Math.min(1, healAmount / cap);
    const minSize = GAME_CONFIG.HEALTH_ORB_SIZE_MIN;
    const maxSize = GAME_CONFIG.HEALTH_ORB_SIZE_MAX;
    healthOrb.sizeMultiplier = minSize + (ratio * (maxSize - minSize));
    const baseRadius = healthOrb.baseRadius || healthOrb.radius;
    healthOrb.radius = baseRadius * healthOrb.sizeMultiplier;

    const angle = random(0, Math.PI * 2);
    const speed = random(1, 3);
    healthOrb.vel.x = Math.cos(angle) * speed;
    healthOrb.vel.y = Math.sin(angle) * speed;
}

export function createMoneyOrb(x, y, moneyAmountOverride = null) {
    const moneyOrb = this.colorStarPool.get(x, y, 'money');
    if (!moneyOrb) return;

    let moneyAmount;
    if (moneyAmountOverride !== null) {
        moneyAmount = Math.max(1, moneyAmountOverride);
    } else {
        const paydayStacks = this.player.getPowerupStacks('PAYDAY');
        const highRollerStacks = this.player.getPowerupStacks('HIGH_ROLLER');
        const minMoney = GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN + (paydayStacks * GAME_CONFIG.PAYDAY_MONEY_MIN_UPGRADE);
        const maxMoney = Math.max(minMoney, GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MAX + (paydayStacks * GAME_CONFIG.PAYDAY_MONEY_MIN_UPGRADE) + (highRollerStacks * GAME_CONFIG.HIGH_ROLLER_MONEY_MAX_UPGRADE));
        moneyAmount = Math.floor(Math.random() * (maxMoney - minMoney + 1)) + minMoney;
    }
    moneyOrb.moneyAmount = moneyAmount;

    const cap = GAME_CONFIG.MONEY_ORB_MAX_MONEY_PER_ORB;
    const ratio = Math.min(1, moneyAmount / cap);
    const minSize = GAME_CONFIG.MONEY_ORB_SIZE_MIN;
    const maxSize = GAME_CONFIG.MONEY_ORB_SIZE_MAX;
    moneyOrb.sizeMultiplier = minSize + (ratio * (maxSize - minSize));
    const baseRadius = moneyOrb.baseRadius || moneyOrb.radius;
    moneyOrb.radius = baseRadius * moneyOrb.sizeMultiplier;

    const angle = random(0, Math.PI * 2);
    const speed = random(1, 3);
    moneyOrb.vel.x = Math.cos(angle) * speed;
    moneyOrb.vel.y = Math.sin(angle) * speed;
}

// Split an integer total budget into N equal-ish orb values, each ≤ cap.
// Returns an array of orb values whose sum === total.
function _splitBudgetIntoOrbs(total, cap) {
    if (total <= 0) return [];
    const count = Math.max(1, Math.ceil(total / cap));
    const base = Math.floor(total / count);
    const remainder = total - base * count;
    const out = new Array(count);
    for (let i = 0; i < count; i++) out[i] = base + (i < remainder ? 1 : 0);
    return out;
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

    // ── Health orbs ──
    // Gated by a global cooldown. Default is once every 60s; the Triage
    // upgrade reduces this by 5s per stack down to a 30s floor. Without this
    // throttle the player gets healed back up almost continuously and the
    // game becomes trivial.
    const now = Date.now();
    const triageStacks = this.player.getPowerupStacks('HEALTH_DROP_FREQUENCY');
    const healthCooldown = Math.max(
        GAME_CONFIG.HEALTH_DROP_COOLDOWN_MIN,
        GAME_CONFIG.HEALTH_DROP_COOLDOWN_BASE - triageStacks * GAME_CONFIG.HEALTH_DROP_COOLDOWN_REDUCTION_PER_STACK
    );
    const healthCooldownReady = (now - (this.lastHealthOrbDropAt || 0)) >= healthCooldown;

    if (healthCooldownReady && Math.random() < healthDropRate) {
        // Compute the heal "budget" the legacy formula would have produced,
        // then split it into many small capped orbs.
        const maxHealthOrbs = GAME_CONFIG.HEALTH_ORB_BASE_DROP_COUNT_MAX + (healthDropQuantityStacks * GAME_CONFIG.HEALTH_ORB_DROP_QUANTITY_UPGRADE);
        const baseCount = Math.floor(Math.random() * maxHealthOrbs) + 1;
        const totalLegacyCount = Math.max(1, Math.floor(baseCount * levelQuantityMultiplier * enemyQuantityMultiplier * hitStreakMultiplier));

        const medpackStacks = this.player.getPowerupStacks('MEDPACK');
        const doctorStacks = this.player.getPowerupStacks('DOCTOR');
        const minHeal = GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN + (medpackStacks * GAME_CONFIG.MEDPACK_HEAL_MIN_UPGRADE);
        const maxHeal = Math.max(minHeal, GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MAX + (medpackStacks * GAME_CONFIG.MEDPACK_HEAL_MIN_UPGRADE) + (doctorStacks * GAME_CONFIG.DOCTOR_HEAL_MAX_UPGRADE));
        const avgHeal = (minHeal + maxHeal) / 2;
        const healBudget = Math.max(1, Math.round(totalLegacyCount * avgHeal));

        const orbValues = _splitBudgetIntoOrbs(healBudget, GAME_CONFIG.HEALTH_ORB_MAX_HEAL_PER_ORB);
        for (const v of orbValues) this.createHealthOrb(x, y, v);

        this.lastHealthOrbDropAt = now;
    }

    // ── Money orbs ── no cooldown, just budget-and-split.
    if (Math.random() < moneyDropRate) {
        const maxMoneyOrbs = GAME_CONFIG.MONEY_ORB_BASE_DROP_COUNT_MAX + (moneyDropQuantityStacks * GAME_CONFIG.MONEY_ORB_DROP_QUANTITY_UPGRADE);
        const baseCount = Math.floor(Math.random() * maxMoneyOrbs) + 1;
        const totalLegacyCount = Math.max(1, Math.floor(baseCount * levelQuantityMultiplier * enemyQuantityMultiplier * hitStreakMultiplier));

        const paydayStacks = this.player.getPowerupStacks('PAYDAY');
        const highRollerStacks = this.player.getPowerupStacks('HIGH_ROLLER');
        const minMoney = GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN + (paydayStacks * GAME_CONFIG.PAYDAY_MONEY_MIN_UPGRADE);
        const maxMoney = Math.max(minMoney, GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MAX + (paydayStacks * GAME_CONFIG.PAYDAY_MONEY_MIN_UPGRADE) + (highRollerStacks * GAME_CONFIG.HIGH_ROLLER_MONEY_MAX_UPGRADE));
        const avgMoney = (minMoney + maxMoney) / 2;
        const moneyBudget = Math.max(1, Math.round(totalLegacyCount * avgMoney));

        const orbValues = _splitBudgetIntoOrbs(moneyBudget, GAME_CONFIG.MONEY_ORB_MAX_MONEY_PER_ORB);
        for (const v of orbValues) this.createMoneyOrb(x, y, v);
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

// Galaga mode — each enemy archetype drops a flavored pickup. Drop chance
// scales with the combo meter so high streaks rain pickups (the "powerful"
// feel from the design report).
const ARCHETYPE_DROP_TABLE = {
    HUNTER:    { base: 0.18, types: ['RAPID_FIRE', 'BIG_BULLETS'] },
    WASP:      { base: 0.22, types: ['RAPID_FIRE', 'MULTI_SHOT'] },
    GUARDIAN:  { base: 0.16, types: ['BIG_BULLETS', 'MULTI_SHOT'] },
    SENTINEL:  { base: 0.18, types: ['BIG_BULLETS', 'HOMING'] },
    STALKER:   { base: 0.20, types: ['HOMING', 'RAPID_FIRE'] },
    DRIFTER:   { base: 0.22, types: ['MULTI_SHOT', 'HOMING'] },
    WEAVER:    { base: 0.22, types: ['HOMING', 'MULTI_SHOT'] },
    PROWLER:   { base: 0.22, types: ['BIG_BULLETS', 'HOMING'] },
    TANGERINE: { base: 0.28, types: ['MULTI_SHOT', 'BIG_BULLETS', 'RAPID_FIRE'] },
    TITAN:     { base: 0.85, types: ['RAPID_FIRE', 'MULTI_SHOT', 'HOMING', 'BIG_BULLETS'] },
};

export function dropArchetypePickup(enemy) {
    const entry = ARCHETYPE_DROP_TABLE[enemy.type] || ARCHETYPE_DROP_TABLE.HUNTER;
    const mult = this.combo ? this.combo.dropMultiplier() : 1;
    if (Math.random() > entry.base * mult) return null;
    const type = entry.types[Math.floor(Math.random() * entry.types.length)];
    return this.dropPowerup(enemy.x, enemy.y, type);
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

    this.events.emit('audio:powerup');
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
        'HEALTH_DROP_FREQUENCY':    { name: 'Triage',              duration: Infinity, icon: '⏳', gradientColors: ['#66ffaa', '#229966'] },
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

    // ── Galaga-mode: combo + unified score + sortie slot release ──────
    if (this.combo) this.combo.onKill();
    if (this.sortieRunner) this.sortieRunner.onEnemyKilled(enemy);
    if (this.galagaMode) {
        const reward = enemy.getDestructionReward();
        const mult = this.combo ? this.combo.scoreMultiplier() : 1;
        const award = Math.round((reward.points || 50) * mult);
        this.game.score = (this.game.score || 0) + award;
        // Milestone perk every 10k score (handled by milestone-perk overlay)
        if (this.game.score >= (this.game.nextPerkAt || 10000)) {
            this.events.emit('milestone:perk', { score: this.game.score });
            this.game.nextPerkAt = (this.game.nextPerkAt || 10000) + 10000;
        }
    }

    // Coin bonuses on streak milestones (separate from damage tiers).
    const coinMilestones = { 3: true, 5: true, 8: true, 12: true, 20: true };
    if (coinMilestones[this.killStreakCount]) {
        this.game.money += this.killStreakCount * 10;
    }

    // Streak damage buff — pick the highest tier the player has reached and
    // (re)apply its multiplier + duration. Each new kill while a buff is
    // active refreshes the timer so sustained streaks stay buffed.
    if (this.player) {
        let tier = null;
        for (const t of STREAK_TIERS) {
            if (this.killStreakCount >= t.kills) tier = t;
        }
        if (tier) {
            const wasNewTier = this.player.streakTierLabel !== tier.label;
            this.player.streakDamageMult = tier.mult;
            this.player.streakBuffEndTime = Date.now() + STREAK_BUFF_DURATION;
            this.player.streakTierLabel = tier.label;
            // Notification fires only when crossing INTO a higher tier so
            // we don't spam every kill.
            if (wasNewTier) {
                this.queueNotification(tier.label,
                    `+${Math.round((tier.mult - 1) * 100)}% damage`, 1800);
            }
        }
    }

    const milestones = { 1: 'FIRST BLOOD', 25: '25 KILLS', 50: 'HALF CENTURY',
        100: 'CENTURION', 200: 'DESTROYER', 500: 'ANNIHILATOR' };
    if (milestones[this.killCount]) {
        this.queueNotification(milestones[this.killCount],
            `${this.killCount} enemies destroyed`, 2500);
    }
}

export function updateKillStreak() {
    const now = Date.now();
    // Streak buff decays after STREAK_BUFF_DURATION ms with no fresh kill.
    // The streak COUNT itself does NOT decay — it only resets on damage
    // (see _breakKillStreak in game-engine.js, hooked from the player damage
    // paths in lifecycle.js + collision-system.js).
    if (this.player && this.player.streakDamageMult > 1 &&
        now > this.player.streakBuffEndTime) {
        this.player.streakDamageMult = 1;
        this.player.streakTierLabel = null;
    }
}

// ── Damage Numbers ──

export function createDamageNumber(x, y, damage, opts = {}) {
    // opts: { isCrit?: bool, isEmpowered?: bool }
    // Crit numbers render with a bigger font, hot color, and a "CRIT!" tag in
    // hud/combat.js drawDamageNumbers. Empowered (perfect-reload buff) uses a
    // different highlight on top of the base/crit treatment.
    const damageNumber = {
        x: x,
        y: y,
        damage: Math.round(damage),
        life: 1.0,
        maxLife: 1.5,
        isCrit: !!opts.isCrit,
        isEmpowered: !!opts.isEmpowered,
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
