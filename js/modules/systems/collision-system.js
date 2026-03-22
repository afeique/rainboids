// Collision detection and response system
// All functions are called with .call(gameEngine) — `this` is the GameEngine instance.
import { GAME_CONFIG } from '../constants.js';
import { random, collision, starCollision, triggerHapticFeedback } from '../utils.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS } from '../weapon-data.js';

// ─── Collision Physics Config ────────────────────────────────────────────────
export const COLLISION_CONFIG = {
    // Bullet-to-asteroid knockback impulse multiplier
    BULLET_KNOCKBACK: 0.05,
    // Frames for hit-flash on asteroids and enemies
    HIT_FLASH_FRAMES: 6,
    // Damage dealt to enemy when player collides with it
    PLAYER_ENEMY_COLLISION_DAMAGE: 50,
    // Damage dealt to asteroid when player collides with it
    PLAYER_ASTEROID_COLLISION_DAMAGE: 25,
    // Bounce energy retention (0-1)
    BOUNCE_RESTITUTION: 0.8,
    // Multiplier for bounce impulse force
    BOUNCE_FORCE_MULTIPLIER: 6.0,
    // Ratio of overlap used for separation push
    OVERLAP_SEPARATION_RATIO: 0.6,
    // Knockback multiplier for player-asteroid collisions
    ASTEROID_KNOCKBACK_MULTIPLIER: 12.0,
    // Extra pixels buffer when separating overlapping entities
    SEPARATION_BUFFER: 5,
    // Additional velocity push when separating overlapping player/asteroid
    OVERLAP_PUSH_FORCE: 2.0,
    // Push force applied to enemy in enemy-asteroid collision
    ENEMY_ASTEROID_PUSH: 4,
    // Push force applied to asteroid in enemy-asteroid collision
    ASTEROID_ENEMY_PUSH: 2,
    // Powerup drop chances by context
    POWERUP_DROP_CHANCE: {
        SMALL_ASTEROID: 0.15,
        LARGE_ASTEROID: 0.2,
        ENEMY_WASP: 0.65,
        ENEMY_TITAN: 0.80,
        ENEMY_TANGERINE: 0.70,
        ENEMY_DEFAULT: 0.55,
    },
};

export function handleCollisions() {
    // OPT-8: Populate spatial grid for broad-phase collision culling
    this.spatialGrid.clear();
    this.spatialGrid.insertPool(this.asteroidPool);
    this.spatialGrid.insertPool(this.enemyPool);
    this.spatialGrid.insertPool(this.enemyBulletPool);

    // Player-asteroid collisions
    this.asteroidPool.activeObjects.forEach(ast => {
        if (this.player.active && collision(this.player, ast)) {
            this.handlePlayerAsteroidCollision(this.player, ast);
        }
    });

    // Bullet-asteroid collisions — OPT-8: spatial grid broad-phase
    for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
        const bullet = this.bulletPool.activeObjects[i];
        if (!bullet.active) continue;
        const nearby = this.spatialGrid.retrieve(bullet);
        for (let j = nearby.length - 1; j >= 0; j--) {
            const ast = nearby[j];
            if (!ast.active || ast.constructor.name !== 'Asteroid') continue;

            // Skip if this piercing bullet has already hit this asteroid
            if (bullet.piercing > 0 && bullet.hasHitEnemy(ast)) {
                continue;
            }

            if (collision(bullet, ast)) {
                triggerHapticFeedback(60);

                // Set targeting for hit asteroid (target info display removed)
                this.targetedEntity = ast;

                // Only play hit sound if asteroid is on screen
                if (this.isEntityOnScreen(ast)) {
                    this.events.emit('audio:hit');
                }

                // Register hit for combo system
                this.player.registerHit();

                // Damage the asteroid (One Punch Man cheat: instant kill)
                const damage = this.cheats.onePunchMan ? 99999 : (bullet.damage || 1);
                ast.health = Math.max(0, ast.health - damage);

                // Hit flash — asteroid briefly turns white when struck
                ast._hitFlashTimer = COLLISION_CONFIG.HIT_FLASH_FRAMES;

                // Show damage number (same as enemy ships)
                if (this.isEntityOnScreen(ast)) {
                    this.createDamageNumber(ast.x, ast.y - ast.baseRadius, damage);
                }

                // Award XP for hitting asteroid
                this.player.gainExperience(2);

                // Impart momentum from bullet
                ast.vel.x += bullet.vel.x * COLLISION_CONFIG.BULLET_KNOCKBACK;
                ast.vel.y += bullet.vel.y * COLLISION_CONFIG.BULLET_KNOCKBACK;

                // Hit spark — colored shrapnel streaks + small flash at impact
                {
                    const hitHue = ast.baseHue || 30;
                    const hitColor = `hsl(${hitHue}, 90%, 70%)`;
                    const hitBright = `hsl(${hitHue}, 90%, 85%)`;
                    // Small flash at impact point
                    this.particlePool.get(bullet.x, bullet.y, 'explosionFlash', ast.baseRadius * 0.5);
                    // 4-6 shrapnel streaks in asteroid color
                    for (let p = 0; p < 5; p++) {
                        const angle = random(0, Math.PI * 2);
                        const speed = random(3, 7);
                        this.particlePool.get(bullet.x, bullet.y, 'explosionShrapnel',
                            angle, speed, p < 2 ? hitBright : hitColor);
                    }
                    // A few embers
                    for (let p = 0; p < 3; p++) {
                        this.particlePool.get(bullet.x, bullet.y, 'explosionEmber', hitColor);
                    }
                }

                // Light screen shake for asteroid hits (only if on screen)
                if (this.isEntityOnScreen(ast)) {
                    this.triggerScreenShake(8, ast.baseRadius * 0.3, ast.baseRadius);
                }

                // Use small tolerance for floating-point precision issues
                if (ast.health <= 0.001) {
                    if (ast.baseRadius <= (GAME_CONFIG.MIN_AST_RAD + 5)) {
                        // Small asteroid destroyed
                        if (this.isEntityOnScreen(ast)) {
                            this.events.emit('audio:explosion');
                        }
                        this.createDebris(ast);
                        this.createColorStarBurst(ast.x, ast.y);
                        this.dropOrbsFromEntity(ast.x, ast.y, ast);
                        if (Math.random() < COLLISION_CONFIG.POWERUP_DROP_CHANCE.SMALL_ASTEROID) {
                            this.dropPowerup(ast.x, ast.y);
                        }
                        if (this.isEntityOnScreen(ast)) {
                            this.triggerScreenShake(12, ast.baseRadius * 0.5, ast.baseRadius);
                        }
                        this.asteroidPool.release(ast);
                    } else {
                        // Large asteroid splits — bigger explosion
                        if (this.isEntityOnScreen(ast)) {
                            this.events.emit('audio:explosion');
                        }
                        this.createDebris(ast);
                        this.createColorStarBurst(ast.x, ast.y);
                        this.dropOrbsFromEntity(ast.x, ast.y, ast);
                        if (Math.random() < COLLISION_CONFIG.POWERUP_DROP_CHANCE.LARGE_ASTEROID) {
                            this.dropPowerup(ast.x, ast.y);
                        }

                        // Massive screen shake for large asteroid destruction (only if on screen)
                        if (this.isEntityOnScreen(ast)) {
                            this.triggerScreenShake(25, ast.baseRadius * 0.8, ast.baseRadius);
                        }

                        const count = (Math.random() < 0.5 ? 2 : 3) + 1; // Now 3 or 4
                        const newR = ast.baseRadius / Math.sqrt(count);

                            for (let k = 0; k < count; k++) {
                            // Spawn fragments around the parent's center with jitter
                            const spawnX = ast.x + random(-ast.radius * 0.2, ast.radius * 0.2);
                            const spawnY = ast.y + random(-ast.radius * 0.2, ast.radius * 0.2);

                            const newAst = this.asteroidPool.get(spawnX, spawnY, newR, ast.level);

                            if (newAst) {
                                // Fragments are slightly weaker than parent, with some randomness (70-90%)
                                const fragHP = Math.max(5, Math.round(ast.maxHealth * random(0.7, 0.9)));
                                newAst.maxHealth = fragHP;
                                newAst.health = fragHP;

                                // Explosive outward velocity — fast and chaotic
                                const angle = random(0, Math.PI * 2);
                                const speed = random(3.5, 8.0);

                                newAst.vel.x = ast.vel.x * 0.3 + Math.cos(angle) * speed;
                                newAst.vel.y = ast.vel.y * 0.3 + Math.sin(angle) * speed;
                            }
                        }
                        this.asteroidPool.release(ast);
                    }
                }
                // Handle bullet hit with powerup effects
                if (bullet.explosive) {
                    bullet.explode(this);
                }
                bullet.onHit(ast);

                // Only break if bullet is destroyed (no piercing left)
                if (!bullet.active) {
                    break;
                }
            }
        }
    }

    // Asteroid vs Asteroid collisions
    const activeAsteroids = this.asteroidPool.activeObjects;
    for (let i = 0; i < activeAsteroids.length; i++) {
        for (let j = i + 1; j < activeAsteroids.length; j++) {
            let a1 = activeAsteroids[i], a2 = activeAsteroids[j];
            if (!a1.active || !a2.active) continue;

            // Grant temporary immunity to newly spawned asteroids
            const now = Date.now();
            if (now - a1.creationTime < 750 || now - a2.creationTime < 750) {
                continue;
            }

            if (collision(a1, a2)) {
                let dx = a2.x - a1.x, dy = a2.y - a1.y, dist = Math.hypot(dx, dy);
                if (dist === 0) continue;

                // Play explosion sound only if collision is on screen
                if (this.isEntityOnScreen(a1) || this.isEntityOnScreen(a2)) {
                    this.events.emit('audio:explosion');
                }
                // Reduced debris particles for performance
                const debrisCount = Math.floor(random(3, 6));
                const cx = (a1.x + a2.x) / 2;
                const cy = (a1.y + a2.y) / 2;
                for (let d = 0; d < debrisCount; d++) {
                    this.particlePool.get(cx, cy, 'asteroidCollisionDebris');
                }

                let nx = dx / dist, ny = dy / dist, tx = -ny, ty = nx;
                let dpTan1 = a1.vel.x * tx + a1.vel.y * ty, dpTan2 = a2.vel.x * tx + a2.vel.y * ty;
                let dpNorm1 = a1.vel.x * nx + a1.vel.y * ny, dpNorm2 = a2.vel.x * nx + a2.vel.y * ny;
                let m1 = (dpNorm1 * (a1.mass - a2.mass) + 2 * a2.mass * dpNorm2) / (a1.mass + a2.mass);
                let m2 = (dpNorm2 * (a2.mass - a1.mass) + 2 * a1.mass * dpNorm1) / (a1.mass + a2.mass);

                a1.vel = { x: tx * dpTan1 + nx * m1, y: ty * dpTan1 + ny * m1 };
                a2.vel = { x: tx * dpTan2 + nx * m2, y: ty * dpTan2 + ny * m2 };

                let overlap = 0.5 * (a1.radius + a2.radius - dist + 1);
                a1.x -= overlap * nx; a1.y -= overlap * ny;
                a2.x += overlap * nx; a2.y += overlap * ny;
            }
        }
    }

    // Player vs Collectible Orbs (health and money orbs from entity destruction are collectible)
    if (this.player && this.player.active) {
        for (let i = this.colorStarPool.activeObjects.length - 1; i >= 0; i--) {
            const colorStar = this.colorStarPool.activeObjects[i];
            // Only check collision for collectible orbs using enhanced collision detection
            // Uses larger radius + predictive collision to prevent fast orbs from passing through player
            if (colorStar.isCollectible && starCollision(this.player, colorStar)) {
                if (colorStar.starType === 'health') {
                    // Health orb collected - use the orb's individual heal amount
                    const baseHealAmount = colorStar.healAmount || GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN; // Fallback for legacy orbs
                    const healAmount = this.player.getEffectiveHealthOrbHealing(baseHealAmount);
                    const oldHealth = this.player.health;
                    this.player.health = Math.min(this.player.getEffectiveMaxHealth(), this.player.health + healAmount);
                    const actualHeal = this.player.health - oldHealth;

                    if (actualHeal > 0) {
                        this.events.emit('audio:health-regen'); // Play healing sound
                        // Create green healing particle
                        const healParticle = this.particlePool.get(this.player.x, this.player.y, 'starBlip');
                        if (healParticle) {
                            healParticle.color = '#00ff00'; // Green for healing
                            healParticle.radius = 6;
                            healParticle.life = 0.6;
                        }
                    } else {
                        this.events.emit('audio:coin'); // Normal sound if already at max health
                    }
                } else if (colorStar.starType === 'money') {
                    // Money orb collected - use the orb's individual money amount
                    const moneyAmount = colorStar.moneyAmount || GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN; // Fallback for legacy orbs
                    this.game.money += moneyAmount;

                    // Add to pickup display
                    this.addMoneyPickup(moneyAmount);

                    // Play pickup sound (always play regardless of music beat)
                    this.events.emit('audio:coin');

                    // Create golden money particle
                    const moneyParticle = this.particlePool.get(this.player.x, this.player.y, 'starBlip');
                    if (moneyParticle) {
                        moneyParticle.color = '#FFD700'; // Gold for money
                        moneyParticle.radius = 6;
                        moneyParticle.life = 0.6;
                    }
                }

                // Create focused golden burst effect
                // Central bright flash - smaller and more focused
                const blip = this.particlePool.get(colorStar.x, colorStar.y, 'starBlip');
                if (blip) {
                    blip.color = '#FFFF00'; // Bright golden-yellow
                    blip.radius = 4; // Smaller, more focused
                    blip.life = 0.4; // Shorter duration
                    blip.fadeRate = 0.1;
                    blip.growthRate = 0.2; // Less expansion
                }

                // Enhanced ring of sparkles - more visible but balanced
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    const dist = 12; // Slightly larger radius for better spread
                    const sparkle = this.particlePool.get(
                        colorStar.x + Math.cos(angle) * dist,
                        colorStar.y + Math.sin(angle) * dist,
                        'starSparkle'
                    );
                    if (sparkle) {
                        sparkle.color = '#FFFF00'; // Bright golden-yellow
                        sparkle.radius = 2.5; // Larger sparkles for better visibility
                        sparkle.life = 0.8; // Longer duration so they're visible longer
                        sparkle.vel = {
                            x: Math.cos(angle) * 1.8, // Slightly slower so they're visible longer
                            y: Math.sin(angle) * 1.8
                        };
                    }
                }

                this.colorStarPool.release(colorStar);
            }
        }
    }

    // Player-powerup collisions
    for (let i = this.powerupPool.activeObjects.length - 1; i >= 0; i--) {
        const powerup = this.powerupPool.activeObjects[i];
        if (powerup.checkCollision(this.player)) {
            this.collectPowerup(powerup);
            this.powerupPool.release(powerup);
        }
    }

    // Player-enemy collisions (skip warping enemies)
    this.enemyPool.activeObjects.forEach(enemy => {
        if (enemy.warping) return;
        if (this.player.active && collision(this.player, enemy)) {
            this.handlePlayerEnemyCollision(this.player, enemy);
        }
    });

    // Bullet-enemy collisions — OPT-8: spatial grid broad-phase
    for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
        const bullet = this.bulletPool.activeObjects[i];
        if (!bullet.active) continue;
        const nearbyEn = this.spatialGrid.retrieve(bullet);
        for (let j = nearbyEn.length - 1; j >= 0; j--) {
            const enemy = nearbyEn[j];
            if (!enemy.active || enemy.warping || enemy.constructor.name !== 'Enemy') continue;

            // Skip if this piercing bullet has already hit this enemy
            if (bullet.piercing > 0 && bullet.hasHitEnemy(enemy)) {
                continue;
            }

            if (collision(bullet, enemy)) {
                triggerHapticFeedback(40);

                // Set targeting for hit enemy (target info display removed)
                this.targetedEntity = enemy;

                // Only play hit sound if enemy is on screen
                if (this.isEntityOnScreen(enemy)) {
                    this.events.emit('audio:hit');
                }

                // Register hit for combo system
                this.player.registerHit();

                // Damage the enemy (One Punch Man cheat: instant kill)
                const damage = this.cheats.onePunchMan ? 99999 : (bullet.damage || this.baseDamage);
                const destroyed = enemy.takeDamage(damage);

                // Hit flash on enemy when struck
                enemy._hitFlashTimer = COLLISION_CONFIG.HIT_FLASH_FRAMES;

                // Award XP for hitting enemy
                this.player.gainExperience(3);

                // Hit spark — colored shrapnel + flash in enemy color
                {
                    const eColor = enemy.color || '#ff4444';
                    // Small flash at impact
                    this.particlePool.get(bullet.x, bullet.y, 'explosionFlash', enemy.radius * 0.5);
                    // Shrapnel streaks in enemy color
                    for (let p = 0; p < 6; p++) {
                        const angle = random(0, Math.PI * 2);
                        const speed = random(3, 8);
                        this.particlePool.get(bullet.x, bullet.y, 'explosionShrapnel',
                            angle, speed, p < 2 ? '#ffffff' : eColor);
                    }
                    // A few embers
                    for (let p = 0; p < 3; p++) {
                        this.particlePool.get(bullet.x, bullet.y, 'explosionEmber', eColor);
                    }
                }

                if (destroyed) {
                    // Award money + XP for kill
                    const reward = enemy.getDestructionReward();
                    this.game.money += reward.points;
                    this.player.gainExperience(Math.ceil(reward.points / 5));

                    // Track kill streak
                    this.onEnemyKill(enemy);

                    // Play explosion sound only if enemy is on screen
                    if (this.isEntityOnScreen(enemy)) {
                        this.events.emit('audio:explosion');
                    }

                    // Create colored explosion effects (includes screen shake)
                    this.createEnemyDebris(enemy);

                    // Drop health and money orbs
                    this.dropOrbsFromEntity(enemy.x, enemy.y, enemy);

                    // Enemies often drop powerups — stronger enemies drop more often
                    const powerupChance = enemy.type === 'WASP' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_WASP :
                                        enemy.type === 'TITAN' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_TITAN :
                                        enemy.type === 'TANGERINE' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_TANGERINE : COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_DEFAULT;
                    const roll = Math.random();
                    if (roll < powerupChance) {
                        this.dropPowerup(enemy.x, enemy.y);
                    }

                    this.enemyPool.release(enemy);
                }

                // Handle bullet hit with powerup effects
                if (bullet.explosive) {
                    bullet.explode(this);
                }
                bullet.onHit(enemy);

                // Only break if bullet is destroyed (no piercing left)
                if (!bullet.active) {
                    break;
                }
            }
        }
    }

    // Player bullet vs homing mines
    for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
        const bullet = this.bulletPool.activeObjects[i];
        if (!bullet.active) continue;
        for (const mine of this.enemyBulletPool.activeObjects) {
            if (!mine.active || mine.shape !== 'mine' || mine.health === undefined) continue;
            if (collision(bullet, mine)) {
                const dmg = this.cheats?.onePunchMan ? 99999 : (bullet.damage || 1);
                mine.health = Math.max(0, mine.health - dmg);
                this.createDamageNumber(mine.x, mine.y - mine.radius, dmg);
                for (let p = 0; p < 4; p++) {
                    const pt = this.particlePool.get(bullet.x, bullet.y, 'hit');
                    if (pt) pt.color = '#ff8844';
                }
                if (mine.health <= 0) {
                    mine.active = false;
                    this.events.emit('audio:explosion');
                    this.particlePool.get(mine.x, mine.y, 'explosionPulse', mine.radius * 2);
                    for (let p = 0; p < 8; p++) {
                        const pt = this.particlePool.get(mine.x, mine.y, 'explosion');
                        if (pt) pt.color = '#ff8844';
                    }
                } else {
                    this.events.emit('audio:hit');
                }
                bullet.onHit(mine);
                if (!bullet.active) break;
            }
        }
    }

    // Enemy bullet-player collisions
    this.enemyBulletPool.activeObjects.forEach(bullet => {
        if (bullet.active && this.player.active && bullet.checkCollision(this.player)) {
            this.handlePlayerEnemyBulletCollision(this.player, bullet);

            // Explode if it's an explosive bullet
            if (bullet.explosive) {
                bullet.explode(this);
            }

            bullet.active = false;
            // Notify that bullet was destroyed (for combo tracking)
            if (bullet.onOffScreen) {
                bullet.onOffScreen();
            }
        }
    });

    // Enemy bullet-asteroid collisions - DISABLED
    // Enemy shots now travel through asteroids without collision
    // This allows for more dynamic combat where enemy fire isn't blocked by asteroids

    // Enemy-asteroid collisions
    this.enemyPool.activeObjects.forEach(enemy => {
        if (!enemy.active) return;

        this.asteroidPool.activeObjects.forEach(ast => {
            if (!ast.active) return;

            if (collision(enemy, ast)) {
                this.handleEnemyAsteroidCollision(enemy, ast);
            }
        });
    });

    // ─── Weapon Effect Collisions ────────────────────────────────────
    this.handleWeaponEffectCollisions();
}

export function handleWeaponEffectCollisions() {
    if (!this.player || !this.player.active) return;
    this.checkLanceBeamCollisions();
    this.checkMineCollisions();
    this.checkNovaCollisions();
    this.checkLightningCollisions();
    this.checkMissileCollisions();
    this.checkDeflectorOrbCollisions();
    this.checkTractorShieldCollisions();
}

// ─── Lance Beam ─────────────────────────────────────────────────
export function checkLanceBeamCollisions() {
    const p = this.player;
    if (p.beamActive && p.beamTimer > 0) {
        const config = PRIMARY_WEAPONS.LANCE_BEAM;
        const beamW = (config.beamWidth || 6) * (1 + p.getPowerupStacks('BEAM_WIDTH') * 0.3);
        const range = config.range * 400;
        const dx = Math.cos(p.angle);
        const dy = Math.sin(p.angle);
        const dmg = config.damage * (1 + p.getPowerupStacks('OVERLOAD_BEAM') * 2);

        this.enemyPool.activeObjects.forEach(enemy => {
            if (!enemy.active) return;
            // Point-to-line distance check
            const ex = enemy.x - p.x;
            const ey = enemy.y - p.y;
            const proj = ex * dx + ey * dy;
            if (proj < 0 || proj > range) return;
            const perpDist = Math.abs(ex * dy - ey * dx);
            if (perpDist < beamW / 2 + (enemy.radius || 15)) {
                this.damageEnemy(enemy, dmg);
            }
        });
    }
}

// ─── Mines ──────────────────────────────────────────────────────
export function checkMineCollisions() {
    const p = this.player;
    if (p.activeMines) {
        for (const mine of p.activeMines) {
            if (!mine.active || !mine.armed) continue;
            const blastR = (POWER_WEAPONS.MINE_LAYER.blastRadius || 80) + p.getPowerupStacks('BLAST_RADIUS') * 30;
            let triggered = false;
            this.enemyPool.activeObjects.forEach(enemy => {
                if (!enemy.active) return;
                const dist = Math.hypot(enemy.x - mine.x, enemy.y - mine.y);
                if (dist < (mine.triggerRadius || 60)) triggered = true;
            });
            if (triggered) {
                // Explode
                this.enemyPool.activeObjects.forEach(enemy => {
                    if (!enemy.active) return;
                    const dist = Math.hypot(enemy.x - mine.x, enemy.y - mine.y);
                    if (dist < blastR) {
                        const dmg = POWER_WEAPONS.MINE_LAYER.mineDamage * (1 - dist / blastR * 0.5);
                        this.damageEnemy(enemy, dmg);
                    }
                });
                // Explosion particles
                for (let i = 0; i < 8; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 2 + Math.random() * 3;
                    this.particlePool.get(mine.x, mine.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 3, '#ff6600', 30);
                }
                mine.active = false;
            }
        }
    }
}

// ─── Nova Rings ─────────────────────────────────────────────────
export function checkNovaCollisions() {
    const p = this.player;
    if (p.novaActive && p.novaRings) {
        for (const ring of p.novaRings) {
            if (!ring.active) continue;
            this.enemyPool.activeObjects.forEach(enemy => {
                if (!enemy.active) return;
                const dist = Math.hypot(enemy.x - ring.x, enemy.y - ring.y);
                const ringWidth = 20;
                if (Math.abs(dist - ring.currentRadius) < ringWidth) {
                    if (!ring.hitEnemies) ring.hitEnemies = new Set();
                    if (!ring.hitEnemies.has(enemy)) {
                        ring.hitEnemies.add(enemy);
                        this.damageEnemy(enemy, POWER_WEAPONS.NOVA_BLAST.ringDamage);
                    }
                }
            });
        }
    }
}

// ─── Lightning Chains ───────────────────────────────────────────
export function checkLightningCollisions() {
    const p = this.player;
    if (p.lightningChains) {
        for (const chain of p.lightningChains) {
            if (!chain.active || chain.damageApplied) continue;
            chain.damageApplied = true;
            let dmg = POWER_WEAPONS.LIGHTNING_ARC.chainDamage * (1 + p.getPowerupStacks('AMPLIFIER') * 0.2);
            const falloff = POWER_WEAPONS.LIGHTNING_ARC.chainFalloff;
            for (let i = 1; i < chain.targets.length; i++) {
                const target = chain.targets[i];
                if (target.enemy && target.enemy.active) {
                    this.damageEnemy(target.enemy, dmg);
                }
                dmg *= falloff;
            }
        }
    }
}

// ─── Missiles ──────────────────────────────────────────────────
export function checkMissileCollisions() {
    const p = this.player;
    if (p.activeMissiles) {
        for (const missile of p.activeMissiles) {
            if (!missile.active) continue;
            this.enemyPool.activeObjects.forEach(enemy => {
                if (!enemy.active) return;
                const dist = Math.hypot(enemy.x - missile.x, enemy.y - missile.y);
                if (dist < (enemy.radius || 15) + 6) {
                    this.damageEnemy(enemy, POWER_WEAPONS.MISSILE_SALVO.missileDamage);
                    missile.active = false;
                    // Impact particles
                    for (let i = 0; i < 4; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        this.particlePool.get(missile.x, missile.y, Math.cos(angle) * 2, Math.sin(angle) * 2, 2, '#ff4444', 20);
                    }
                }
            });
        }
    }
}

// ─── Deflector Orbs (block enemy bullets) ───────────────────────
export function checkDeflectorOrbCollisions() {
    const p = this.player;
    if (p.deflectorOrbs && p.deflectorOrbs.length > 0) {
        this.enemyBulletPool.activeObjects.forEach(bullet => {
            if (!bullet.active) return;
            for (const orb of p.deflectorOrbs) {
                if (!orb.active || orb.hits <= 0) continue;
                const dist = Math.hypot(bullet.x - orb.x, bullet.y - orb.y);
                if (dist < 12) {
                    bullet.active = false;
                    orb.hits--;
                    if (orb.hits <= 0) orb.active = false;
                    // Reflect if upgrade owned
                    if (p.getPowerupStacks('REFLECT') > 0) {
                        // Fire reflected bullet back at nearest enemy
                        const nearest = this.findNearestEnemy();
                        if (nearest) {
                            const ang = Math.atan2(nearest.y - orb.y, nearest.x - orb.x);
                            this.bulletPool.get(orb.x, orb.y, ang, 8, 2, 3, 500, '#44ddff', this.player);
                        }
                    }
                    break;
                }
            }
        });
    }
}

// ─── Tractor Shield (absorb enemy bullets for coins) ────────────
export function checkTractorShieldCollisions() {
    const p = this.player;
    if (p.activeSkillEffects && p.activeSkillEffects.has('TRACTOR_SHIELD')) {
        const skill = DEFENSE_SKILLS.TRACTOR_SHIELD;
        const arc = skill.shieldArc + p.getPowerupStacks('WIDE_ANGLE') * (Math.PI / 6);
        const coinsPerBullet = skill.coinsPerBullet + p.getPowerupStacks('PROFIT') * 5;

        this.enemyBulletPool.activeObjects.forEach(bullet => {
            if (!bullet.active) return;
            const dist = Math.hypot(bullet.x - p.x, bullet.y - p.y);
            if (dist > 55) return;
            const angleToBullet = Math.atan2(bullet.y - p.y, bullet.x - p.x);
            let diff = angleToBullet - p.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) < arc / 2) {
                bullet.active = false;
                this.game.money += coinsPerBullet;
            }
        });
    }
    // ─── Bulwark damage reduction is handled in handlePlayerEnemyBulletCollision ──
}

export function damageEnemy(enemy, damage) {
    if (!enemy || !enemy.active) return;
    enemy.health -= damage;
    this.createDamageNumber(enemy.x, enemy.y - 15, damage);
    if (enemy.health <= 0) {
        enemy.active = false;
        const reward = enemy.getDestructionReward();
        this.game.money += reward.points;
        this.player.gainExperience(Math.ceil(reward.points / 5));
        this.onEnemyKill(enemy);
        if (this.isEntityOnScreen(enemy)) {
            this.events.emit('audio:explosion');
        }
        this.createEnemyDebris(enemy);
        this.dropOrbsFromEntity(enemy.x, enemy.y, enemy);
        const powerupChance = enemy.type === 'WASP' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_WASP :
                            enemy.type === 'TITAN' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_TITAN :
                            enemy.type === 'TANGERINE' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_TANGERINE : COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_DEFAULT;
        if (Math.random() < powerupChance) {
            this.dropPowerup(enemy.x, enemy.y);
        }
        this.enemyPool.release(enemy);
    }
}

export function handlePlayerEnemyCollision(player, enemy) {
    // Apply damage only if not invincible
    if (!this.player.invincible) {
        // Apply balanced damage with shield calculation and enemy level scaling
        const baseDamage = enemy.getLevelScaledDamage(25);
        const effectiveShield = player.getEffectiveShield();
        let reducedDamage = baseDamage * (1 - effectiveShield / 100);
        // Bulwark damage reduction
        if (player.activeSkillEffects && player.activeSkillEffects.has('BULWARK')) {
            const bulwarkReduction = player.getPowerupStacks('IRON_WILL') > 0 ? 0.65 : 0.5;
            reducedDamage *= (1 - bulwarkReduction);
        }
        // Phase dash invulnerability
        if (player.activeSkillEffects && player.activeSkillEffects.has('PHASE_DASH')) {
            reducedDamage = 0;
        }
        const finalDamage = Math.round(reducedDamage);
        player.health = Math.max(0, player.health - finalDamage);

        // Award XP for surviving enemy collision
        this.player.gainExperience(5);

        // Check for death/shield tank usage
        if (player.health <= 0) {
            if (this.shieldTanks > 0) {
                // Use shield tank to restore health (no life lost)
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                player.health = player.getEffectiveMaxHealth();
                this.events.emit('audio:coin'); // Tank used sound
                player.makeInvincible(2000); // Brief invincibility after revival
            } else {
                // No shield tanks - lose a life and respawn
                this.handlePlayerDeath();
                return;
            }
        }

        // ── JUICE: hitstop + camera kick + screen shake ──
        this.triggerHitstop(5); // ~83ms — enemies hit harder than asteroids
        const kickDx = player.x - enemy.x;
        const kickDy = player.y - enemy.y;
        this.triggerCameraKick(kickDx, kickDy, 10);
        this.triggerScreenShake(18, 10, enemy.radius);

        // Show red damage number
        this.particlePool.get(player.x, player.y, 'damageNumber', finalDamage);

        // Create explosion particles at player position with enemy color
        for (let i = 0; i < 15; i++) {
            const particle = this.particlePool.get(player.x, player.y, 'explosion');
            if (particle) {
                particle.color = enemy.color;
                // Add random velocity for explosion effect
                const angle = random(0, Math.PI * 2);
                const speed = random(2, 6);
                particle.vel = {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                };
            }
        }

        // Make player invulnerable briefly after taking damage
        this.player.makeInvincible(1500);
        this.player._hitFlashTimer = 8; // white flash on hit
    }

    // Always damage the enemy when colliding with player (massive damage)
    const destroyed = enemy.takeDamage(COLLISION_CONFIG.PLAYER_ENEMY_COLLISION_DAMAGE);

    if (destroyed) {
        const reward = enemy.getDestructionReward();
        this.game.money += reward.points;
        this.player.gainExperience(Math.ceil(reward.points / 5));
        this.onEnemyKill(enemy);

        // Create colored explosion effects (includes screen shake)
        this.createEnemyDebris(enemy);
        // Drop health and money orbs
        this.dropOrbsFromEntity(enemy.x, enemy.y, enemy);
        this.enemyPool.release(enemy);
    }

    // Physics-based bounce with conservation of momentum
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
        // Normalize collision direction
        const nx = dx / distance;
        const ny = dy / distance;

        // Calculate relative velocity
        const relativeVelX = player.vel.x - enemy.vel.x;
        const relativeVelY = player.vel.y - enemy.vel.y;

        // Calculate relative velocity in collision normal direction
        const velAlongNormal = relativeVelX * nx + relativeVelY * ny;

        // Don't resolve if velocities are separating
        if (velAlongNormal > 0) return;

        // Calculate restitution (bounciness)
        const restitution = COLLISION_CONFIG.BOUNCE_RESTITUTION;

        // Calculate impulse scalar
        const playerMass = this.player.mass || 1;
        const enemyMass = enemy.mass || 1;
        const impulseScalar = -(1 + restitution) * velAlongNormal / (playerMass + enemyMass);

        // Apply impulse
        const impulseX = impulseScalar * nx;
        const impulseY = impulseScalar * ny;

        // Enhanced collision force for more dramatic effect
        const forceMultiplier = COLLISION_CONFIG.BOUNCE_FORCE_MULTIPLIER;

        player.vel.x += impulseX * enemyMass * forceMultiplier;
        player.vel.y += impulseY * enemyMass * forceMultiplier;

        if (!destroyed) {
            enemy.vel.x -= impulseX * playerMass * forceMultiplier;
            enemy.vel.y -= impulseY * playerMass * forceMultiplier;
        }

        // Separate overlapping objects
        const overlap = player.radius + enemy.radius - distance;
        if (overlap > 0) {
            const separationForce = overlap * COLLISION_CONFIG.OVERLAP_SEPARATION_RATIO;
            player.x += nx * separationForce;
            player.y += ny * separationForce;
            if (!destroyed) {
                enemy.x -= nx * separationForce;
                enemy.y -= ny * separationForce;
            }
        }
    }

    // Additional impact particles at collision point
    for (let i = 0; i < 8; i++) {
        const particle = this.particlePool.get((player.x + enemy.x) / 2, (player.y + enemy.y) / 2, 'hit');
        if (particle) {
            particle.color = enemy.color;
        }
    }

    // Make player invulnerable briefly
    player.makeInvincible(1500);
}

export function handlePlayerEnemyBulletCollision(player, bullet) {
    // Apply balanced damage with shield calculation
    const baseDamage = bullet.damage || 15;
    const effectiveShield = player.getEffectiveShield();
    let reducedDamage = baseDamage * (1 - effectiveShield / 100);
    // Bulwark damage reduction
    if (player.activeSkillEffects && player.activeSkillEffects.has('BULWARK')) {
        const bulwarkReduction = player.getPowerupStacks('IRON_WILL') > 0 ? 0.65 : 0.5;
        reducedDamage *= (1 - bulwarkReduction);
    }
    // Phase dash invulnerability
    if (player.activeSkillEffects && player.activeSkillEffects.has('PHASE_DASH')) {
        reducedDamage = 0;
    }
    const finalDamage = Math.round(reducedDamage);
    player.health = Math.max(0, player.health - finalDamage);

    // Award XP for surviving enemy bullet hit
    this.player.gainExperience(3);

    // Check for death/shield tank usage
    if (player.health <= 0) {
        if (this.shieldTanks > 0) {
            // Use shield tank to restore health (no life lost)
            this.shieldTanks--;
            this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
            player.health = player.getEffectiveMaxHealth();
            this.events.emit('audio:coin'); // Tank used sound
            player.makeInvincible(2000); // Brief invincibility after revival
        } else {
            // No shield tanks - lose a life and respawn
            this.handlePlayerDeath();
            return;
        }
    }

    // ── JUICE: hitstop + screen shake (no camera kick for bullets — too small) ──
    this.triggerHitstop(3); // ~50ms — quick jolt
    this.triggerScreenShake(12, 6, bullet.radius);
    this.events.emit('audio:hit');

    // Show red damage number
    this.particlePool.get(player.x, player.y, 'damageNumber', finalDamage);

    // Create explosion particles at player position with bullet color
    for (let i = 0; i < 12; i++) {
        const particle = this.particlePool.get(player.x, player.y, 'explosion');
        if (particle) {
            particle.color = bullet.color;
            // Add some random velocity for explosion effect
            const angle = random(0, Math.PI * 2);
            const speed = random(1, 4);
            particle.vel = {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            };
        }
    }

    // Additional hit particles at bullet impact point
    for (let i = 0; i < 5; i++) {
        const particle = this.particlePool.get(bullet.x, bullet.y, 'hit');
        if (particle) {
            particle.color = bullet.color;
        }
    }

    // Make player invulnerable briefly
    player.makeInvincible(1000);
    player._hitFlashTimer = 5; // briefer flash for bullet hits
}

export function handleEnemyAsteroidCollision(enemy, asteroid) {
    // No damage to enemy - just momentum transfer and bouncing

    // Calculate collision direction
    const dx = enemy.x - asteroid.x;
    const dy = enemy.y - asteroid.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
        // Push enemy away from asteroid
        const enemyPushForce = COLLISION_CONFIG.ENEMY_ASTEROID_PUSH;
        enemy.vel.x += (dx / distance) * enemyPushForce;
        enemy.vel.y += (dy / distance) * enemyPushForce;

        // Impart momentum to asteroid (like bullet impact)
        const asteroidPushForce = COLLISION_CONFIG.ASTEROID_ENEMY_PUSH;
        asteroid.vel.x += enemy.vel.x * 0.3; // Transfer some of enemy's momentum
        asteroid.vel.y += enemy.vel.y * 0.3;
        asteroid.vel.x -= (dx / distance) * asteroidPushForce;
        asteroid.vel.y -= (dy / distance) * asteroidPushForce;

        // Add rotation to asteroid from collision
        const rotationForce = random(-0.02, 0.02);
        if (asteroid.rotationSpeed !== undefined) {
            asteroid.rotationSpeed += rotationForce;
        }
    }

    // Light visual feedback (no damage, just bump)
    // Screen shake removed for enemy-asteroid collisions

    // Only play hit sound if enemy is on screen
    if (this.isEntityOnScreen(enemy)) {
        this.events.emit('audio:hit'); // Lighter sound than explosion
    }

    // Create small impact particles
    for (let i = 0; i < 3; i++) {
        const particle = this.particlePool.get((enemy.x + asteroid.x) / 2, (enemy.y + asteroid.y) / 2, 'hit');
        if (particle) {
            particle.color = enemy.color;
            particle.life = 0.3; // Shorter lived particles
        }
    }

    // No enemy destruction from asteroid collisions
}

export function handlePlayerAsteroidCollision(player, asteroid) {
    // Apply damage only if not invincible
    if (!this.player.invincible) {
        // Calculate damage based on asteroid size and speed (10-20 damage range)
        const baseSize = 40; // Minimum asteroid radius
        const maxSize = 60; // Maximum asteroid radius
        const sizeRatio = (asteroid.radius - baseSize) / (maxSize - baseSize); // 0-1 range

        // Calculate speed factor
        const speed = Math.hypot(asteroid.vel.x, asteroid.vel.y);
        const maxSpeed = 4; // Typical max asteroid speed
        const speedRatio = Math.min(speed / maxSpeed, 1); // Cap at 1

        // Damage calculation: 10-20 base range based on size and speed (scaled back down)
        const sizeDamage = 10 + (sizeRatio * 6); // 10-16 damage from size
        const speedDamage = speedRatio * 4; // 0-4 additional damage from speed
        const baseDamage = sizeDamage + speedDamage; // 10-20 base damage range

        // Apply level scaling to damage
        const totalDamage = asteroid.getLevelScaledCollisionDamage(baseDamage);

            // Apply shield damage reduction and round to integer (including powerup boosts)
        const effectiveShield = this.player.getEffectiveShield();
        const reducedDamage = totalDamage * (1 - effectiveShield / 100);
        const finalDamage = Math.round(reducedDamage);

        // Apply the calculated damage
        this.player.health = Math.max(0, this.player.health - finalDamage);

        // Award XP for surviving asteroid collision
        this.player.gainExperience(4);

        // Handle death/shield tank usage
        if (this.player.health <= 0) {
            if (this.shieldTanks > 0) {
                // Use shield tank to restore health (no life lost)
                this.shieldTanks--;
                this.explodeTank(this.shieldTanks); // Visual effect for tank explosion
                this.player.health = this.player.getEffectiveMaxHealth();
                this.events.emit('audio:coin'); // Tank used sound
                this.player.makeInvincible(2000); // Brief invincibility after revival
            } else {
                // No shield tanks - lose a life and respawn
                this.handlePlayerDeath();
                return;
            }
        }

        // Visual and audio feedback
        this.player.makeInvincible(3000); // 3 seconds of invincibility
        this.events.emit('audio:hit');
        this.particlePool.get(this.player.x, this.player.y, 'damageNumber', finalDamage);
        this.particlePool.get(this.player.x, this.player.y, 'shieldHit', this.player.radius);
        this.events.emit('audio:shield');

        // ── Impact sparks at collision point ──
        const impactX = (this.player.x + asteroid.x) / 2;
        const impactY = (this.player.y + asteroid.y) / 2;
        const sparkCount = 10;
        for (let i = 0; i < sparkCount; i++) {
            const p = this.particlePool.get(impactX, impactY, 'hit');
            if (p) {
                const a = random(0, Math.PI * 2);
                const s = random(2, 6);
                p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
                p.color = i < 4 ? '#ffffff' : i < 7 ? '#ffcc44' : '#ff8800';
            }
        }

        // Brief white flash on the player
        this.player._hitFlashTimer = 6;

        // ── JUICE: hitstop + camera kick + screen shake ──
        this.triggerHitstop(4); // ~67ms freeze — satisfying impact weight
        const kickDx = this.player.x - asteroid.x;
        const kickDy = this.player.y - asteroid.y;
        this.triggerCameraKick(kickDx, kickDy, 8); // directional camera lurch
        this.triggerScreenShake(20, 12, asteroid.radius);
    }

    // Always damage the asteroid when colliding with player (massive damage)
    asteroid.health = Math.max(0, asteroid.health - COLLISION_CONFIG.PLAYER_ASTEROID_COLLISION_DAMAGE);
    if (this.isEntityOnScreen(asteroid)) {
        this.createDamageNumber(asteroid.x, asteroid.y - asteroid.baseRadius, COLLISION_CONFIG.PLAYER_ASTEROID_COLLISION_DAMAGE);
    }

    // Check if asteroid is destroyed
    if (asteroid.health <= 0) {
        // Award XP and money for destroying asteroid
        this.player.gainExperience(8);
        this.game.money += 10; // Bonus money for collision destruction

        // Screen shake for collision destruction (only if on screen)
        if (this.isEntityOnScreen(asteroid)) {
            this.triggerScreenShake(20, asteroid.baseRadius * 0.7, asteroid.baseRadius);
        }

        // Create destruction effects
        this.createDebris(asteroid);
        this.dropOrbsFromEntity(asteroid.x, asteroid.y, asteroid);
        this.asteroidPool.release(asteroid);
        return; // Exit early if asteroid is destroyed
    }

    // Asteroid bounces off player
    const astSpeed = Math.hypot(asteroid.vel.x, asteroid.vel.y);
    const knockbackAngle = Math.atan2(this.player.y - asteroid.y, this.player.x - asteroid.x);

    // Calculate knockback magnitude based on asteroid's trajectory and player's mass
    const totalMass = this.player.mass + asteroid.mass;
    const dvn = (this.player.vel.x - asteroid.vel.x) * Math.cos(knockbackAngle) + (this.player.vel.y - asteroid.vel.y) * Math.sin(knockbackAngle);
    const enhancedImpulse = 2 * dvn / totalMass;

    // Apply MUCH MORE DRASTIC knockback multiplier
    const knockbackMultiplier = COLLISION_CONFIG.ASTEROID_KNOCKBACK_MULTIPLIER;
    const enhancedKnockback = enhancedImpulse * knockbackMultiplier;

    // Apply jittered impulse to player velocity
    const jitter = random(-Math.PI / 4, Math.PI / 4);
    this.player.vel.x += Math.cos(knockbackAngle + jitter) * enhancedKnockback;
    this.player.vel.y += Math.sin(knockbackAngle + jitter) * enhancedKnockback;

    // Also apply some impulse to asteroid (but less dramatic, along original normal)
    const nx = Math.cos(knockbackAngle);
    const ny = Math.sin(knockbackAngle);
    asteroid.vel.x -= enhancedKnockback * 0.3 * this.player.mass * nx;
    asteroid.vel.y -= enhancedKnockback * 0.3 * this.player.mass * ny;

    // Separate overlapping objects with stronger force
    const distance = Math.hypot(this.player.x - asteroid.x, this.player.y - asteroid.y);
    const overlap = this.player.radius + asteroid.radius - distance;

    if (overlap > 0) {
        // Calculate normalized direction from asteroid to player
        const dx = (this.player.x - asteroid.x) / distance;
        const dy = (this.player.y - asteroid.y) / distance;

        // Apply full overlap distance plus a buffer to ensure separation
        const separationBuffer = COLLISION_CONFIG.SEPARATION_BUFFER;
        const totalSeparation = overlap + separationBuffer;

        // Move player away from asteroid by the full separation amount
        this.player.x += dx * totalSeparation;
        this.player.y += dy * totalSeparation;

        // Also apply velocity to push player away
        const pushForce = COLLISION_CONFIG.OVERLAP_PUSH_FORCE;
        this.player.vel.x += dx * pushForce;
        this.player.vel.y += dy * pushForce;
    }

    // Create enhanced collision effects
    // White pulse at impact point
    const impactX = this.player.x + nx * this.player.radius;
    const impactY = this.player.y + ny * this.player.radius;
    this.particlePool.get(impactX, impactY, 'explosionPulse', 40);

    // Enhanced blue particles explosion
    for (let i = 0; i < 30; i++) {
        const particle = this.particlePool.get(impactX, impactY, 'explosion');
        if (particle) {
            // Override color to bright blue
            particle.color = `hsl(210, 100%, ${60 + Math.random() * 40}%)`;
            // Make particles faster and larger for more dramatic effect
            particle.vel.x *= 1.5;
            particle.vel.y *= 1.5;
            particle.radius *= 1.3;
        }
    }

    this.events.emit('audio:hit');

    // No screen shake for asteroid-asteroid collisions - only player-related events should shake
}

export function findNearestEnemy() {
    if (!this.player) return null;
    let nearest = null;
    let nearestDist = Infinity;
    const check = (obj) => {
        if (!obj.active) return;
        const dx = obj.x - this.player.x;
        const dy = obj.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = obj;
        }
    };
    this.enemyPool.activeObjects.forEach(check);
    this.asteroidPool.activeObjects.forEach(check);
    return nearest;
}
