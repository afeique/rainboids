// Collision detection and response system
// All functions are called with .call(gameEngine) — `this` is the GameEngine instance.
import { GAME_CONFIG } from '../core/constants.js';
import { random, collision, starCollision, triggerHapticFeedback } from '../core/utils.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS } from './weapon-data.js';

// ─── Collision Physics Config ────────────────────────────────────────────────
export const COLLISION_CONFIG = {
    // Bullet-to-asteroid knockback impulse multiplier
    BULLET_KNOCKBACK: 0.05,
    // Frames for hit-flash on asteroids and enemies
    HIT_FLASH_FRAMES: 10,
    // Damage dealt to enemy when player collides with it. Kept low so
    // ramming enemy ships is NOT a viable strategy — the player gets
    // strongly deflected and barely scratches the enemy.
    PLAYER_ENEMY_COLLISION_DAMAGE: 5,
    // Damage dealt to asteroid when player collides with it. Same idea:
    // a tiny scrape, not a kill stroke. Asteroids have 10–18 HP at full
    // size, so this requires many rams (each costing the player health)
    // to break — far worse than just shooting.
    PLAYER_ASTEROID_COLLISION_DAMAGE: 2,
    // Bounce energy retention (0-1)
    BOUNCE_RESTITUTION: 0.9,
    // Multiplier for bounce impulse force — bumped so the player gets
    // launched off enemy ships rather than sliding through them.
    BOUNCE_FORCE_MULTIPLIER: 12.0,
    // Ratio of overlap used for separation push
    OVERLAP_SEPARATION_RATIO: 0.6,
    // Knockback multiplier for player-asteroid collisions — bumped so the
    // player is shoved away hard, killing the ramming exploit.
    ASTEROID_KNOCKBACK_MULTIPLIER: 22.0,
    // Extra pixels buffer when separating overlapping entities
    SEPARATION_BUFFER: 6,
    // Additional velocity push when separating overlapping player/asteroid
    OVERLAP_PUSH_FORCE: 5.0,
    // Push force applied to enemy in enemy-asteroid collision
    ENEMY_ASTEROID_PUSH: 4,
    // Push force applied to asteroid in enemy-asteroid collision
    ASTEROID_ENEMY_PUSH: 2,
    // Powerup drop chances by context. Cut deeply so each pickup is a
    // real "score" — paired with stronger per-stack effects (see
    // progression.js / weapons.js) so finding one is genuinely valuable.
    POWERUP_DROP_CHANCE: {
        SMALL_ASTEROID: 0.05,   // was 0.15
        LARGE_ASTEROID: 0.08,   // was 0.20
        ENEMY_WASP:     0.22,   // was 0.65
        ENEMY_TITAN:    0.50,   // was 0.80 (boss tier — still meaningful)
        ENEMY_TANGERINE:0.28,   // was 0.70
        ENEMY_DEFAULT:  0.18,   // was 0.55
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
        if (ast.warping || ast._deathFlash > 0) return;
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
            if (!ast.active || ast._deathFlash > 0 || ast.warping || ast.constructor.name !== 'Asteroid') continue;

            // Skip if this piercing bullet has already hit this asteroid
            if (bullet.piercing > 0 && bullet.hasHitEnemy(ast)) {
                continue;
            }

            if (collision(bullet, ast)) {
                triggerHapticFeedback(60);

                // Set targeting for hit asteroid (drives cursor outline) AND
                // surface it in the top-center info panel via the snapshot.
                this.targetedEntity = ast;
                this._setLastHit(ast);

                // Per-weapon hit SFX (falls back to generic if weaponId
                // missing — same bullet sound for asteroid + enemy hits).
                if (this.isEntityOnScreen(ast)) {
                    this.events.emit('audio:enemy-hit-by-bullet', bullet.weaponId);
                }

                // Register hit for combo system
                this.player.registerHit();

                // Damage the asteroid (One Punch Man cheat: instant kill)
                const damage = this.cheats.onePunchMan ? 99999 : (bullet.damage || 1);
                if (this.game.stats) {
                    this.game.stats.shotsHit++;
                    this.game.stats.totalDamageDealt += damage;
                }
                ast.health = Math.max(0, ast.health - damage);

                // Hit flash — localized at bullet impact point
                ast._hitFlashTimer = COLLISION_CONFIG.HIT_FLASH_FRAMES;
                ast._hitPoint = { x: bullet.x, y: bullet.y };
                ast._hitAngle = Math.atan2(bullet.y - ast.y, bullet.x - ast.x);

                // Brief hitstop on hit — heavy weapons get more
                if (this.isEntityOnScreen(ast)) {
                    const dmg = bullet.damage || 1;
                    this.triggerHitstop(dmg >= 2 ? 3 : 2);
                }

                // Show damage number (same as enemy ships)
                if (this.isEntityOnScreen(ast)) {
                    this.createDamageNumber(ast.x, ast.y - ast.baseRadius, damage, {
                        isCrit: !!(bullet.isCrit || bullet.isCritical),
                        isEmpowered: !!bullet.isEmpowered,
                    });
                }

                // Award XP for hitting asteroid (bullet-hell pass — 2x)
                this.player.gainExperience(4);

                // Impart momentum from bullet
                ast.vel.x += bullet.vel.x * COLLISION_CONFIG.BULLET_KNOCKBACK;
                ast.vel.y += bullet.vel.y * COLLISION_CONFIG.BULLET_KNOCKBACK;

                // Localized hit sparks at bullet impact point
                {
                    const hitHue = ast.baseHue || 30;
                    const hitColor = `hsl(${hitHue}, 90%, 70%)`;
                    const hitBright = `hsl(${hitHue}, 90%, 85%)`;
                    const impactAngle = Math.atan2(bullet.vel.y, bullet.vel.x);
                    // Small flash at impact point — bumped slightly for punch
                    this.particlePool.get(bullet.x, bullet.y, 'explosionFlash', ast.baseRadius * 0.4);
                    // Directional shrapnel — away from bullet direction (more pieces)
                    for (let p = 0; p < 7; p++) {
                        const angle = impactAngle + Math.PI + random(-0.7, 0.7);
                        const speed = random(3, 7);
                        this.particlePool.get(bullet.x, bullet.y, 'explosionShrapnel',
                            angle, speed, p < 2 ? hitBright : hitColor);
                    }
                    // Embers — extra for visual density
                    for (let p = 0; p < 4; p++) {
                        this.particlePool.get(bullet.x, bullet.y, 'explosionEmber', p % 2 ? hitColor : hitBright);
                    }
                    // A pair of sparkle motes for some twinkle
                    if (Math.random() < 0.7) {
                        this.particlePool.get(bullet.x, bullet.y, 'starSparkle');
                        this.particlePool.get(bullet.x, bullet.y, 'starSparkle');
                    }
                }

                // No screen shake on asteroid hits — shake is reserved
                // for the destruction event so the rock feels solid but
                // the player isn't shaken every shot. (Hits still flash
                // the cursor reticule and spawn shrapnel/sparkles for
                // feedback; the destruction shake below is the payoff.)

                // Use small tolerance for floating-point precision issues
                if (ast.health <= 0.001) {
                    if (ast.baseRadius <= (GAME_CONFIG.MIN_AST_RAD + 5)) {
                        // Small asteroid destroyed — death flash then cleanup
                        ast._deathFlash = 6;
                        ast._deathFlashMax = 6;
                        if (this.isEntityOnScreen(ast)) {
                            this.events.emit('audio:asteroid-destroy');
                            this.triggerHitstop(4);
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
                    } else {
                        // Large asteroid splits — death flash + bigger explosion
                        ast._deathFlash = 6;
                        ast._deathFlashMax = 6;
                        if (this.isEntityOnScreen(ast)) {
                            this.events.emit('audio:asteroid-destroy');
                            this.triggerHitstop(5);
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

                        const count = (Math.random() < 0.5 ? 2 : 3) + 1; // 3 or 4
                        const newR = ast.baseRadius / Math.sqrt(count);

                        // Distribute fragment trajectories evenly around 360° with
                        // small angular jitter — guarantees every pair diverges
                        // (random-angle assignment can give two fragments nearly
                        // the same direction, leaving them stuck overlapping until
                        // the immunity timer expires and the collision system
                        // teleports them apart). Fragments spawn at the parent's
                        // exact center; velocity does all the separating work
                        // (no artificial positional jitter at spawn).
                        const baseAngle = random(0, Math.PI * 2);
                        const sliceWidth = (Math.PI * 2) / count;
                        for (let k = 0; k < count; k++) {
                            const newAst = this.asteroidPool.get(ast.x, ast.y, newR, ast.level);
                            if (newAst) {
                                // Slightly weaker than parent, with some randomness (70-90%)
                                const fragHP = Math.max(5, Math.round(ast.maxHealth * random(0.7, 0.9)));
                                newAst.maxHealth = fragHP;
                                newAst.health = fragHP;

                                // Symmetric burst direction + jitter (≤25% of slice
                                // width so adjacent fragments can't overlap angles)
                                const angle = baseAngle + k * sliceWidth + random(-sliceWidth * 0.25, sliceWidth * 0.25);
                                const speed = random(4.5, 7.5);
                                newAst.vel.x = ast.vel.x * 0.3 + Math.cos(angle) * speed;
                                newAst.vel.y = ast.vel.y * 0.3 + Math.sin(angle) * speed;
                            }
                        }
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

    // Asteroid vs Asteroid: velocity exchange ONLY when actively closing.
    //
    // Design constraints:
    //   • Real impacts must register and bounce.
    //   • Asteroids that are *already* overlapping (e.g. fragments from
    //     a split spawned at the same point, or rocks that have drifted
    //     into each other while the player ignored them) MUST NOT
    //     teleport apart — that's the visible "shift/jump" the player
    //     hated. So no positional correction at all.
    //   • Stuck-overlapping pairs must not jitter or re-exchange
    //     velocity every frame.
    //
    // Solution: gate the exchange on the relative-velocity-along-normal
    // sign. If `(v2 - v1) · n̂` is negative the pair is closing → real
    // impact → exchange. If positive they're already separating →
    // ignore (lets fragments fly apart on their own velocity, lets
    // overlapping-but-stationary rocks rest peacefully).
    {
        const activeAsteroids = this.asteroidPool.activeObjects;
        for (let i = 0; i < activeAsteroids.length; i++) {
            const a1 = activeAsteroids[i];
            if (!a1.active || a1.warping || a1._deathFlash > 0) continue;
            for (let j = i + 1; j < activeAsteroids.length; j++) {
                const a2 = activeAsteroids[j];
                if (!a2.active || a2.warping || a2._deathFlash > 0) continue;

                const dx = a2.x - a1.x, dy = a2.y - a1.y;
                const distSq = dx * dx + dy * dy;
                const sumR = a1.radius + a2.radius;
                if (distSq >= sumR * sumR || distSq < 0.01) continue;

                const dist = Math.sqrt(distSq);
                const nx = dx / dist, ny = dy / dist;

                // Relative velocity along contact normal. Negative means
                // a1→a2 along n̂ exceeds a2→a2 → they're closing in.
                const rvx = (a2.vel.x || 0) - (a1.vel.x || 0);
                const rvy = (a2.vel.y || 0) - (a1.vel.y || 0);
                const closing = rvx * nx + rvy * ny;
                if (closing >= 0) continue; // already separating — let it ride

                // Light debris pop on real impacts (only when on-screen,
                // since this can fire across many pairs in dense fields).
                if (this.particlePool && (this.isEntityOnScreen(a1) || this.isEntityOnScreen(a2))) {
                    const cx = (a1.x + a2.x) / 2;
                    const cy = (a1.y + a2.y) / 2;
                    const debris = 2 + Math.floor(Math.random() * 2);
                    for (let d = 0; d < debris; d++) {
                        this.particlePool.get(cx, cy, 'asteroidCollisionDebris');
                    }
                }

                // Elastic exchange along the contact normal — preserves
                // each rock's tangential motion and swaps the closing
                // component. NO positional correction, by design.
                const tx = -ny, ty = nx;
                const dpTan1 = a1.vel.x * tx + a1.vel.y * ty;
                const dpTan2 = a2.vel.x * tx + a2.vel.y * ty;
                const dpNorm1 = a1.vel.x * nx + a1.vel.y * ny;
                const dpNorm2 = a2.vel.x * nx + a2.vel.y * ny;
                const m1 = a1.mass || 1, m2 = a2.mass || 1;
                const totalM = m1 + m2;
                const newN1 = (dpNorm1 * (m1 - m2) + 2 * m2 * dpNorm2) / totalM;
                const newN2 = (dpNorm2 * (m2 - m1) + 2 * m1 * dpNorm1) / totalM;
                a1.vel.x = tx * dpTan1 + nx * newN1;
                a1.vel.y = ty * dpTan1 + ny * newN1;
                a2.vel.x = tx * dpTan2 + nx * newN2;
                a2.vel.y = ty * dpTan2 + ny * newN2;
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
            if (!enemy.active || enemy._deathFlash > 0 || enemy.warping || enemy.constructor.name !== 'Enemy') continue;

            // Skip if this piercing bullet has already hit this enemy
            if (bullet.piercing > 0 && bullet.hasHitEnemy(enemy)) {
                continue;
            }

            if (collision(bullet, enemy)) {
                triggerHapticFeedback(40);

                // Set targeting for hit enemy (drives cursor outline) AND
                // record this as the most recently damaged target for the
                // top-center info panel via the snapshot.
                this.targetedEntity = enemy;
                this._setLastHit(enemy);

                // Per-weapon hit SFX (Pulse / Storm / Scatter / Rail / Lance).
                if (this.isEntityOnScreen(enemy)) {
                    this.events.emit('audio:enemy-hit-by-bullet', bullet.weaponId);
                }

                // Register hit for combo system
                this.player.registerHit();

                // Damage the enemy (One Punch Man cheat: instant kill)
                const damage = this.cheats.onePunchMan ? 99999 : (bullet.damage || this.baseDamage);
                if (this.game.stats) this.game.stats.shotsHit++;
                const destroyed = enemy.takeDamage(damage, {
                    isCrit: !!(bullet.isCrit || bullet.isCritical),
                    isEmpowered: !!bullet.isEmpowered,
                });

                // Hit flash on enemy — localized at impact point
                enemy._hitFlashTimer = COLLISION_CONFIG.HIT_FLASH_FRAMES;
                enemy._hitPoint = { x: bullet.x, y: bullet.y };
                enemy._hitAngle = Math.atan2(bullet.y - enemy.y, bullet.x - enemy.x);

                // Per-weapon hitstop: heavy single hits get more freeze, light rapid-fire gets less
                // damage >= 2 → heavy (rail driver, charge shot): 3f hit / 5f crit
                // damage < 2  → light (pulse, needles, scatter): 2f hit / 3f crit
                if (this.isEntityOnScreen(enemy)) {
                    const dmg = bullet.damage || 1;
                    const isCrit = bullet.isCrit || bullet.isCritical;
                    const hitFrames = dmg >= 2 ? (isCrit ? 5 : 3) : (isCrit ? 3 : 2);
                    this.triggerHitstop(hitFrames);
                }

                // Award XP for hitting enemy (bullet-hell pass — 2x)
                this.player.gainExperience(6);

                // Localized hit sparks at bullet impact point
                {
                    const eColor = enemy.color || '#ff4444';
                    const impactAngle = Math.atan2(bullet.vel.y, bullet.vel.x);
                    // No flash on non-lethal hits — flash is reserved for
                    // the destruction event so the visual punch carries
                    // weight. Shrapnel + sparkles convey the hit landed.
                    // No embers: they linger 1-2s with low velocity and
                    // accumulate as a soft fading trail along the enemy's
                    // path, which the player flagged as visual noise. The
                    // motion-only philosophy from 5.63.1 (enemy explosions)
                    // applies here too.
                    for (let p = 0; p < 8; p++) {
                        const spreadAngle = impactAngle + Math.PI + random(-0.8, 0.8);
                        const speed = random(3, 8);
                        this.particlePool.get(bullet.x, bullet.y, 'explosionShrapnel',
                            spreadAngle, speed, p < 3 ? '#ffffff' : eColor);
                    }
                    if (Math.random() < 0.7) {
                        this.particlePool.get(bullet.x, bullet.y, 'starSparkle');
                        this.particlePool.get(bullet.x, bullet.y, 'starSparkle');
                    }
                    // Light shake on enemy hits — enemies are alive and
                    // worth communicating contact through camera shake.
                    // Asteroids get no hit-shake (they're inert rocks);
                    // this delineation gives the player a tactile read on
                    // what they're shooting at.
                    if (this.isEntityOnScreen(enemy)) {
                        this.triggerScreenShake(5, Math.max(2, (enemy.radius || 15) * 0.15), enemy.radius || 15);
                    }
                }

                if (destroyed) {
                    // QA bot kill tracking — authoritative kill buffer
                    if (window._qaBotKillBuffer) window._qaBotKillBuffer.push({ type: enemy.type, wave: this.game.currentWave, ts: Date.now(), maxHealth: enemy.maxHealth });
                    // Award money + XP for kill
                    const reward = enemy.getDestructionReward();
                    this.game.money += reward.points;
                    this.player.gainExperience(Math.ceil(reward.points / 3));

                    // Track kill streak
                    this.onEnemyKill(enemy);

                    // Play enemy destruction sound only if on screen.
                    if (this.isEntityOnScreen(enemy)) {
                        this.events.emit('audio:enemy-destroy');
                    }

                    // Death flash — enemy renders as bright silhouette before cleanup
                    enemy._deathFlash = 8;
                    enemy._deathFlashMax = 8;

                    // Kill hitstop — heavy weapons get more satisfying freeze
                    if (this.isEntityOnScreen(enemy)) {
                        const dmg = bullet.damage || 1;
                        this.triggerHitstop(dmg >= 2 ? 7 : 5);
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

                    // Don't release here — cleanupInactive() handles it after death flash completes
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
        if (!enemy.active || enemy._deathFlash > 0 || enemy.warping) return;

        this.asteroidPool.activeObjects.forEach(ast => {
            if (!ast.active || ast.warping || ast._deathFlash > 0) return;

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
// Sweeps a thin line forward from the player and damages every entity
// (enemy + asteroid) intersecting it. Asteroids get a forward push
// scaled by the player's KNOCKBACK powerup stacks so the beam reads
// as a real physical force, not just a damage-applying line.
// 5.64.15 — Lance Beam is now a continuous-tether weapon that stops at
// the FIRST object hit. Each frame:
//   1. Sweep both enemies and asteroids along the beam ray.
//   2. Pick the entity with the smallest forward distance (`proj`) that
//      meets the beam-strip width test.
//   3. Damage ONLY that entity; clamp the rendered beam length to its
//      proj distance so the visible beam terminates at the impact.
// Stores `p.beamHitDist` on the player so the renderer knows where to
// stop drawing the beam.
export function checkLanceBeamCollisions() {
    const p = this.player;
    if (!p.beamActive) {
        p.beamHitDist = 0;
        return;
    }

    const config = PRIMARY_WEAPONS.LANCE_BEAM;
    const beamW = (config.beamWidth || 6) * (1 + p.getPowerupStacks('BEAM_WIDTH') * 0.3);
    const range = config.range * 400;
    const dx = Math.cos(p.angle);
    const dy = Math.sin(p.angle);
    const dmg = config.damage * (1 + p.getPowerupStacks('OVERLOAD_BEAM') * 2);
    const knockMul = (typeof p.getKnockbackMultiplier === 'function') ? p.getKnockbackMultiplier() : 1;
    const BEAM_PUSH = 0.4 * knockMul;

    const BEAM_HIT_COLOR = '#88ddff';
    const BEAM_BRIGHT    = '#ffffff';

    // Find the closest hit along the ray (smallest forward proj that
    // also satisfies the perpendicular-strip test).
    let hitDist = range;
    let hitTarget = null;          // 'enemy' | 'asteroid' | null
    let hitRef = null;
    let hitRadius = 0;
    for (const enemy of this.enemyPool.activeObjects) {
        if (!enemy.active || enemy._deathFlash > 0) continue;
        const ex = enemy.x - p.x;
        const ey = enemy.y - p.y;
        const proj = ex * dx + ey * dy;
        if (proj <= 0 || proj >= hitDist) continue;
        const perpDist = Math.abs(ex * dy - ey * dx);
        const r = enemy.radius || 15;
        if (perpDist < beamW / 2 + r) {
            hitDist = proj;
            hitTarget = 'enemy';
            hitRef = enemy;
            hitRadius = r;
        }
    }
    for (const ast of this.asteroidPool.activeObjects) {
        if (!ast.active || ast._deathFlash > 0 || ast.warping) continue;
        const ax = ast.x - p.x;
        const ay = ast.y - p.y;
        const proj = ax * dx + ay * dy;
        if (proj <= 0 || proj >= hitDist) continue;
        const perpDist = Math.abs(ax * dy - ay * dx);
        const r = ast.baseRadius || ast.radius || 15;
        if (perpDist < beamW / 2 + r) {
            hitDist = proj;
            hitTarget = 'asteroid';
            hitRef = ast;
            hitRadius = r;
        }
    }

    p.beamHitDist = hitDist;

    // Per-frame beam glitter along the visible portion of the beam.
    if (this.particlePool && Math.random() < 0.55) {
        const t = Math.random();
        const sx = p.x + dx * hitDist * t;
        const sy = p.y + dy * hitDist * t;
        const perpJitter = (Math.random() - 0.5) * (beamW * 1.6);
        const perpX = -dy, perpY = dx;
        const c = Math.random() < 0.4 ? BEAM_BRIGHT : BEAM_HIT_COLOR;
        this.particlePool.get(sx + perpX * perpJitter, sy + perpY * perpJitter, 'explosionEmber', c);
    }
    // Bright muzzle hotspot at the player's gun mouth.
    if (this.particlePool && Math.random() < 0.7) {
        const muzzleX = p.x + dx * (p.radius || 14);
        const muzzleY = p.y + dy * (p.radius || 14);
        this.particlePool.get(muzzleX, muzzleY, 'explosionEmber', BEAM_BRIGHT);
    }

    if (!hitTarget) return;

    if (hitTarget === 'enemy') {
        this.damageEnemy(hitRef, dmg);
        if (hitRef.vel) {
            hitRef.vel.x += dx * BEAM_PUSH;
            hitRef.vel.y += dy * BEAM_PUSH;
        }
    } else {
        hitRef.health = Math.max(0, (hitRef.health || 0) - dmg);
        hitRef._hitFlashTimer = 4;
        if (hitRef.vel) {
            hitRef.vel.x += dx * BEAM_PUSH * 0.6;
            hitRef.vel.y += dy * BEAM_PUSH * 0.6;
        }
        if (hitRef.health <= 0.001) this.destroyAsteroid(hitRef);
    }

    // Hit-point sparks at the impact.
    if (this.particlePool && Math.random() < 0.55) {
        for (let s = 0; s < 3; s++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 2 + Math.random() * 4;
            const c = s === 0 ? BEAM_BRIGHT : BEAM_HIT_COLOR;
            this.particlePool.get(hitRef.x, hitRef.y, 'explosionShrapnel', a, sp, c);
        }
    }

    const now = performance.now();
    if (!p._lastBeamHitSfx || now - p._lastBeamHitSfx > 160) {
        p._lastBeamHitSfx = now;
        this.events.emit('audio:enemy-hit-by-bullet', 'LANCE_BEAM');
    }
}

// ─── Mines ──────────────────────────────────────────────────────
export function checkMineCollisions() {
    const p = this.player;
    if (!p.activeMines) return;
    for (const mine of p.activeMines) {
        if (!mine.active || !mine.armed) continue;
        const triggerR = mine.triggerRadius || 60;
        const blastR = (POWER_WEAPONS.MINE_LAYER.blastRadius || 80) + p.getPowerupStacks('BLAST_RADIUS') * 30;

        // Trigger on enemies OR asteroids passing through the trigger
        // ring, OR on lifetime expiry (seeker mine self-detonates).
        let triggered = !!mine.expired;
        if (!triggered) {
            for (const enemy of this.enemyPool.activeObjects) {
                if (!enemy.active) continue;
                if (Math.hypot(enemy.x - mine.x, enemy.y - mine.y) < triggerR) { triggered = true; break; }
            }
        }
        if (!triggered) {
            for (const ast of this.asteroidPool.activeObjects) {
                if (!ast.active || ast.warping) continue;
                if (Math.hypot(ast.x - mine.x, ast.y - mine.y) < triggerR) { triggered = true; break; }
            }
        }
        if (!triggered) continue;

        // Damage + knock back every enemy inside the blast ring with
        // linear falloff. Knockback magnitude inverses with distance so
        // close-range enemies get really blown back. Scaled by the
        // player's KNOCKBACK powerup stacks via getKnockbackMultiplier().
        const knockMul = (typeof p.getKnockbackMultiplier === 'function')
            ? p.getKnockbackMultiplier() : 1;
        const KNOCK_BASE = 12 * knockMul;
        for (const enemy of this.enemyPool.activeObjects) {
            if (!enemy.active) continue;
            const dist = Math.hypot(enemy.x - mine.x, enemy.y - mine.y);
            if (dist >= blastR) continue;
            const dmg = POWER_WEAPONS.MINE_LAYER.mineDamage * (1 - dist / blastR * 0.5);
            this.damageEnemy(enemy, dmg);
            if (dist > 0.001 && enemy.vel) {
                const kx = (enemy.x - mine.x) / dist;
                const ky = (enemy.y - mine.y) / dist;
                const force = KNOCK_BASE * (1 - dist / blastR);
                enemy.vel.x += kx * force;
                enemy.vel.y += ky * force;
            }
        }
        // Damage + knock asteroids — same falloff so the explosion
        // physically pushes them. Lethal damage routes through
        // destroyAsteroid for the full destruction sequence (debris,
        // drops, fragments). Snapshot the array first so fragments
        // spawned mid-kill don't re-trigger the same blast frame.
        const AST_KNOCK_BASE = 6 * knockMul;
        const astSnapshot = this.asteroidPool.activeObjects.slice();
        for (const ast of astSnapshot) {
            if (!ast.active || ast.warping) continue;
            const dist = Math.hypot(ast.x - mine.x, ast.y - mine.y);
            if (dist >= blastR) continue;
            const dmg = POWER_WEAPONS.MINE_LAYER.mineDamage * (1 - dist / blastR * 0.5);
            ast.health = Math.max(0, (ast.health || 0) - dmg);
            ast._hitFlashTimer = 4;
            if (dist > 0.001) {
                const kx = (ast.x - mine.x) / dist;
                const ky = (ast.y - mine.y) / dist;
                const force = AST_KNOCK_BASE * (1 - dist / blastR);
                ast.vel.x += kx * force;
                ast.vel.y += ky * force;
            }
            if (ast.health <= 0.001) {
                this.destroyAsteroid(ast);
            }
        }

        // Fantastic explosion VFX — modeled on createDebris (asteroid
        // death burst): flash core, three staggered colored rings,
        // dense shrapnel fan, classic small particles, lingering embers,
        // plus a delayed secondary burst that mimics a fuel tank
        // cooking off after the initial detonation.
        const ORANGE = '#ff6600';
        const ORANGE_BRIGHT = '#ffcc66';
        const ORANGE_DIM = '#cc4400';
        const WHITE_HOT = '#ffffff';
        const CYAN_HOT = '#88ddff';   // energy-core spark color
        if (this.particlePool) {
            // 1. Bright core flash + secondary energy-core flash
            this.particlePool.get(mine.x, mine.y, 'explosionFlash', blastR * 1.4);
            setTimeout(() => {
                if (this.particlePool) this.particlePool.get(mine.x, mine.y, 'explosionFlash', blastR * 0.8);
            }, 60);
            // 2. Five staggered colored rings — multiple shockwaves
            this.particlePool.get(mine.x, mine.y, 'explosionRingColored', blastR, ORANGE);
            setTimeout(() => {
                if (this.particlePool) this.particlePool.get(mine.x, mine.y, 'explosionRingColored', blastR * 1.3, ORANGE_DIM);
            }, 70);
            setTimeout(() => {
                if (this.particlePool) this.particlePool.get(mine.x, mine.y, 'explosionRingColored', blastR * 0.85, ORANGE_BRIGHT);
            }, 150);
            setTimeout(() => {
                if (this.particlePool) this.particlePool.get(mine.x, mine.y, 'explosionRingColored', blastR * 1.55, WHITE_HOT);
            }, 220);
            setTimeout(() => {
                if (this.particlePool) this.particlePool.get(mine.x, mine.y, 'explosionRingColored', blastR * 1.1, CYAN_HOT);
            }, 320);
            // 3. Dense directional shrapnel fan — doubled count for wow factor
            const shrapnelCount = 44;
            for (let i = 0; i < shrapnelCount; i++) {
                const ang = (i / shrapnelCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                const speed = 5 + Math.random() * 8;
                let color;
                if (i % 5 === 0) color = WHITE_HOT;
                else if (i % 5 === 1) color = ORANGE_BRIGHT;
                else if (i % 5 === 2) color = ORANGE;
                else if (i % 5 === 3) color = CYAN_HOT;
                else color = ORANGE_DIM;
                this.particlePool.get(mine.x, mine.y, 'explosionShrapnel', ang, speed, color);
            }
            // 4. Classic small particles for density (32, was 18)
            for (let i = 0; i < 32; i++) {
                const p = this.particlePool.get(mine.x, mine.y, 'explosion');
                if (p) {
                    p.color = i < 6 ? WHITE_HOT : i < 18 ? ORANGE : i < 26 ? ORANGE_BRIGHT : CYAN_HOT;
                    const a = Math.random() * Math.PI * 2;
                    const s = 2 + Math.random() * 7;
                    p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
                    p.radius = 1.5 + Math.random() * 3.5;
                }
            }
            // 5. Lingering embers (24, was 12)
            for (let i = 0; i < 24; i++) {
                const c = i % 3 === 0 ? ORANGE : i % 3 === 1 ? ORANGE_BRIGHT : WHITE_HOT;
                this.particlePool.get(mine.x, mine.y, 'explosionEmber', c);
            }
            // 6. Sparkle dust — tiny twinkling specks scattered around
            for (let i = 0; i < 22; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * blastR * 0.9;
                const sx = mine.x + Math.cos(a) * r;
                const sy = mine.y + Math.sin(a) * r;
                this.particlePool.get(sx, sy, 'starSparkle');
            }
            // 7. Delayed secondary cookoff — embers + a small flash
            setTimeout(() => {
                if (!this.particlePool) return;
                for (let i = 0; i < 12; i++) {
                    const ox = mine.x + (Math.random() - 0.5) * 36;
                    const oy = mine.y + (Math.random() - 0.5) * 36;
                    this.particlePool.get(ox, oy, 'explosionEmber', i % 2 ? ORANGE : WHITE_HOT);
                }
                this.particlePool.get(mine.x, mine.y, 'explosionFlash', blastR * 0.45);
            }, 120);
            // 8. Late-game ember rain (long settle for dramatic afterglow)
            setTimeout(() => {
                if (!this.particlePool) return;
                for (let i = 0; i < 10; i++) {
                    const ox = mine.x + (Math.random() - 0.5) * 60;
                    const oy = mine.y + (Math.random() - 0.5) * 60;
                    this.particlePool.get(ox, oy, 'explosionEmber', ORANGE_DIM);
                }
            }, 280);
        }

        // Game-feel: hitstop + camera kick + screen flash for impact.
        // Beefier numbers for the bigger explosion.
        if (typeof this.triggerHitstop === 'function') this.triggerHitstop(6);
        if (typeof this.triggerScreenFlash === 'function') this.triggerScreenFlash(0.12, 6);
        if (typeof this.triggerCameraKick === 'function' && this.player) {
            const kdx = this.player.x - mine.x;
            const kdy = this.player.y - mine.y;
            this.triggerCameraKick(kdx, kdy, 14);
        }
        if (typeof this.triggerScreenShake === 'function') {
            this.triggerScreenShake(14, 7);
        }
        if (this.events) this.events.emit('audio:explosion');

        mine.active = false;
    }
}

// ─── Nova Rings ─────────────────────────────────────────────────
// Sweeps an expanding shockwave: each enemy/asteroid is hit at most
// once when the ring's radius first reaches them, and gets pushed
// outward so the blast feels physical.
export function checkNovaCollisions() {
    const p = this.player;
    if (!(p.novaActive && p.novaRings)) return;
    const RING_WIDTH = 30;
    const knockMul = (typeof p.getKnockbackMultiplier === 'function') ? p.getKnockbackMultiplier() : 1;
    const KNOCK_ENEMY = 16 * knockMul;
    const KNOCK_AST = 9 * knockMul;
    const NOVA_COL_HOT  = '#ffffff';
    const NOVA_COL_MAIN = POWER_WEAPONS.NOVA_BLAST.color || '#ff6633';
    const NOVA_COL_AMBER = '#ffaa66';

    for (const ring of p.novaRings) {
        if (!ring.active) continue;
        if (!ring.hitEnemies) ring.hitEnemies = new Set();
        if (!ring.hitAsteroids) ring.hitAsteroids = new Set();

        // ── Wavefront sparkles ──
        // Spawn a few sparkles each frame around the ring perimeter so
        // the wavefront reads as crackling energy rather than a flat
        // stroke. Frequency rises with ring growth.
        if (this.particlePool) {
            const sparkCount = 3 + Math.floor(Math.random() * 3);
            for (let s = 0; s < sparkCount; s++) {
                const a = Math.random() * Math.PI * 2;
                const r = ring.currentRadius + (Math.random() - 0.5) * RING_WIDTH * 0.6;
                const sx = ring.x + Math.cos(a) * r;
                const sy = ring.y + Math.sin(a) * r;
                if (Math.random() < 0.45) {
                    this.particlePool.get(sx, sy, 'starSparkle');
                } else {
                    const c = s % 3 === 0 ? NOVA_COL_HOT : s % 3 === 1 ? NOVA_COL_MAIN : NOVA_COL_AMBER;
                    this.particlePool.get(sx, sy, 'explosionEmber', c);
                }
            }
        }

        // ── First-frame core flash ──
        // When the ring is born (currentRadius near 0), drop a bright
        // core flash at the origin so the nova has a real "bang" point.
        if (!ring._spawnFlashed && ring.currentRadius < RING_WIDTH * 1.2) {
            ring._spawnFlashed = true;
            if (this.particlePool) {
                this.particlePool.get(ring.x, ring.y, 'explosionFlash', 80);
                for (let s = 0; s < 14; s++) {
                    const a = Math.random() * Math.PI * 2;
                    const sp = 3 + Math.random() * 5;
                    const c = s % 3 === 0 ? NOVA_COL_HOT : s % 3 === 1 ? NOVA_COL_MAIN : NOVA_COL_AMBER;
                    this.particlePool.get(ring.x, ring.y, 'explosionShrapnel', a, sp, c);
                }
            }
        }

        // Enemies — damage + outward shove on first contact with ring.
        for (const enemy of this.enemyPool.activeObjects) {
            if (!enemy.active || ring.hitEnemies.has(enemy)) continue;
            const dx = enemy.x - ring.x;
            const dy = enemy.y - ring.y;
            const dist = Math.hypot(dx, dy);
            if (Math.abs(dist - ring.currentRadius) < RING_WIDTH) {
                ring.hitEnemies.add(enemy);
                this.damageEnemy(enemy, ring.damage || POWER_WEAPONS.NOVA_BLAST.ringDamage);
                if (dist > 0.001 && enemy.vel) {
                    enemy.vel.x += (dx / dist) * KNOCK_ENEMY;
                    enemy.vel.y += (dy / dist) * KNOCK_ENEMY;
                }
                // Per-target impact burst on the wavefront crossing —
                // sparks only, no flash (flash reserved for destruction).
                if (this.particlePool) {
                    for (let s = 0; s < 6; s++) {
                        const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8;
                        const sp = 3 + Math.random() * 5;
                        this.particlePool.get(enemy.x, enemy.y, 'explosionShrapnel', a, sp,
                            s % 2 ? NOVA_COL_MAIN : NOVA_COL_HOT);
                    }
                }
            }
        }

        // Asteroids — damage + outward shove on first contact with
        // the ring. Lethal damage routes through destroyAsteroid for
        // the full destruction sequence (debris, drops, fragments).
        // Snapshot first so fragments don't re-enter this loop.
        const novaAstSnapshot = this.asteroidPool.activeObjects.slice();
        for (const ast of novaAstSnapshot) {
            if (!ast.active || ast.warping || ring.hitAsteroids.has(ast)) continue;
            const dx = ast.x - ring.x;
            const dy = ast.y - ring.y;
            const dist = Math.hypot(dx, dy);
            if (Math.abs(dist - ring.currentRadius) < RING_WIDTH) {
                ring.hitAsteroids.add(ast);
                const dmg = ring.damage || POWER_WEAPONS.NOVA_BLAST.ringDamage;
                ast.health = Math.max(0, (ast.health || 0) - dmg);
                ast._hitFlashTimer = 4;
                if (dist > 0.001 && ast.vel) {
                    ast.vel.x += (dx / dist) * KNOCK_AST;
                    ast.vel.y += (dy / dist) * KNOCK_AST;
                }
                if (ast.health <= 0.001) {
                    this.destroyAsteroid(ast);
                }
            }
        }
    }
}

// ─── Lightning Arc — continuous tether (5.64.15) ───────────────────
//
// Lightning Arc is now a beam-style continuous weapon. Each frame
// while `p.lightningArcActive` is true:
//   1. Pick the nearest enemy/asteroid within `chainRange` of the player.
//   2. Damage that single target (per-frame nibble — `chainDamage` is
//      now treated as a per-frame value, not per-cast).
//   3. Stash the target on `p.lightningArcTarget` so the renderer can
//      draw a jagged arc from player → target.
// The legacy chain pipeline (multiple hops over many frames) is gone;
// `chainCount` / `chainFalloff` upgrade values are no longer used.
//
// `p.lightningChains` array is preserved for legacy code paths but
// stays empty in the continuous-tether model.
export function checkLightningCollisions() {
    const p = this.player;

    // ── Continuous-tether path ──
    if (p.lightningArcActive) {
        const cfg = PRIMARY_WEAPONS.LIGHTNING_ARC;
        const range = cfg.chainRange;
        const knockMul = (typeof p.getKnockbackMultiplier === 'function') ? p.getKnockbackMultiplier() : 1;
        const TETHER_PUSH = 0.5 * knockMul;
        // Per-frame damage; tuned to match Lance Beam DPS (~2.04 dps at 60Hz).
        const dmg = cfg.damage * (1 + p.getPowerupStacks('AMPLIFIER') * 0.2);

        // Find the nearest target.
        let best = null, bestKind = null, bestDist = range;
        for (const e of this.enemyPool.activeObjects) {
            if (!e.active || e._deathFlash > 0) continue;
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < bestDist) { bestDist = d; best = e; bestKind = 'enemy'; }
        }
        for (const ast of this.asteroidPool.activeObjects) {
            if (!ast.active || ast._deathFlash > 0 || ast.warping) continue;
            const d = Math.hypot(ast.x - p.x, ast.y - p.y);
            if (d < bestDist) { bestDist = d; best = ast; bestKind = 'asteroid'; }
        }

        if (best) {
            p.lightningArcTarget = best;
            // Apply damage. Direction = toward the target so kick reads
            // as the beam dragging the target backward.
            const dx = best.x - p.x;
            const dy = best.y - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const kx = dx / len;
            const ky = dy / len;
            if (bestKind === 'enemy') {
                this.damageEnemy(best, dmg);
                if (best.vel) {
                    best.vel.x += kx * TETHER_PUSH;
                    best.vel.y += ky * TETHER_PUSH;
                }
            } else {
                best.health = Math.max(0, (best.health || 0) - dmg);
                best._hitFlashTimer = 4;
                if (best.vel) {
                    best.vel.x += kx * TETHER_PUSH * 0.6;
                    best.vel.y += ky * TETHER_PUSH * 0.6;
                }
                if (best.health <= 0.001) this.destroyAsteroid(best);
            }
            // Sparks at impact, throttled.
            if (this.particlePool && Math.random() < 0.45) {
                const ARC_BLUE   = '#88ddff';
                const ARC_WHITE  = '#ffffff';
                for (let s = 0; s < 3; s++) {
                    const ang = Math.random() * Math.PI * 2;
                    const sp = 2 + Math.random() * 4;
                    const col = s === 0 ? ARC_WHITE : ARC_BLUE;
                    this.particlePool.get(best.x, best.y, 'explosionShrapnel', ang, sp, col);
                }
            }
        } else {
            p.lightningArcTarget = null;
        }
        // Skip the legacy chain loop below — the continuous tether is
        // the only damage path for Lightning Arc now.
        return;
    } else {
        p.lightningArcTarget = null;
    }

    // ── Legacy chain path (kept for compatibility; populated only by
    // older fireLightning() entry points that may still exist). ──
    if (!p.lightningChains) return;
    const knockMul = (typeof p.getKnockbackMultiplier === 'function') ? p.getKnockbackMultiplier() : 1;
    const LIGHTNING_KNOCK = 6 * knockMul;
    const ARC_BLUE   = '#88ddff';
    const ARC_WHITE  = '#ffffff';
    const ARC_PURPLE = '#cc99ff';
    for (const chain of p.lightningChains) {
        if (!chain.active || chain.damageApplied) continue;
        chain.damageApplied = true;
        let dmg = PRIMARY_WEAPONS.LIGHTNING_ARC.damage * (1 + p.getPowerupStacks('AMPLIFIER') * 0.2);
        const falloff = 0.6;
        for (let i = 1; i < chain.targets.length; i++) {
            const t = chain.targets[i];
            const prev = chain.targets[i - 1];
            // Knockback direction: away from the previous link, so the
            // bolt visibly drags each target forward along the chain.
            let kx = 0, ky = 0;
            if (prev) {
                const dx = t.x - prev.x;
                const dy = t.y - prev.y;
                const d = Math.hypot(dx, dy) || 1;
                kx = dx / d; ky = dy / d;
            }
            if (t.enemy && t.enemy.active) {
                this.damageEnemy(t.enemy, dmg);
                if (t.enemy.vel) {
                    t.enemy.vel.x += kx * LIGHTNING_KNOCK;
                    t.enemy.vel.y += ky * LIGHTNING_KNOCK;
                }
            } else if (t.asteroid && t.asteroid.active) {
                const ast = t.asteroid;
                ast.health = Math.max(0, (ast.health || 0) - dmg);
                ast._hitFlashTimer = 4;
                if (ast.vel) {
                    ast.vel.x += kx * LIGHTNING_KNOCK * 0.6;
                    ast.vel.y += ky * LIGHTNING_KNOCK * 0.6;
                }
                if (ast.health <= 0.001) {
                    this.destroyAsteroid(ast);
                }
            }

            // ── Per-target impact effect ──
            // Spark burst at the chain endpoint, plus a few sparkle
            // particles along the segment from the previous link so the
            // bolt path itself shimmers. No flash on non-lethal hit —
            // reserved for the destruction event.
            if (this.particlePool) {
                const sparkCount = 8;
                for (let s = 0; s < sparkCount; s++) {
                    const ang = Math.random() * Math.PI * 2;
                    const sp = 2 + Math.random() * 5;
                    const col = s % 3 === 0 ? ARC_WHITE : s % 3 === 1 ? ARC_BLUE : ARC_PURPLE;
                    this.particlePool.get(t.x, t.y, 'explosionShrapnel', ang, sp, col);
                }
                for (let s = 0; s < 4; s++) {
                    this.particlePool.get(t.x, t.y, 'explosionEmber', s % 2 ? ARC_BLUE : ARC_WHITE);
                }
                // Path glitter — 3 small sparkles along the segment
                if (prev) {
                    for (let g = 0; g < 3; g++) {
                        const u = (g + 1) / 4;
                        const px = prev.x + (t.x - prev.x) * u + (Math.random() - 0.5) * 18;
                        const py = prev.y + (t.y - prev.y) * u + (Math.random() - 0.5) * 18;
                        this.particlePool.get(px, py, 'starSparkle');
                    }
                }
            }

            dmg *= falloff;
        }
    }
}

// ─── Missiles ──────────────────────────────────────────────────
// Missiles impact enemies AND asteroids — both are valid targets.
// On hit: apply damage, spawn an explosion flash + shrapnel + embers
// so the impact reads, then mark the missile inactive.
export function checkMissileCollisions() {
    const p = this.player;
    if (!p.activeMissiles) return;
    const knockMul = (typeof p.getKnockbackMultiplier === 'function') ? p.getKnockbackMultiplier() : 1;
    const MISSILE_KNOCK = 9 * knockMul;

    const explode = (mx, my) => {
        if (!this.particlePool) return;
        const HOT  = '#ffffff';
        const FIRE = '#ffaa44';
        const RED  = '#ff5522';
        const SMOKE = '#cc4422';
        // Twin flashes — main + secondary core for a punchier strike.
        this.particlePool.get(mx, my, 'explosionFlash', 36);
        this.particlePool.get(mx, my, 'explosionRingColored', 38, FIRE);
        // Dense shrapnel fan
        for (let i = 0; i < 16; i++) {
            const ang = (i / 16) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            const sp = 3 + Math.random() * 4;
            const c = i % 4 === 0 ? HOT : i % 4 === 1 ? FIRE : i % 4 === 2 ? RED : SMOKE;
            this.particlePool.get(mx, my, 'explosionShrapnel', ang, sp, c);
        }
        // Embers + sparkle dust
        for (let i = 0; i < 10; i++) {
            this.particlePool.get(mx, my, 'explosionEmber', i % 2 ? FIRE : HOT);
        }
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 25;
            this.particlePool.get(mx + Math.cos(a) * r, my + Math.sin(a) * r, 'starSparkle');
        }
        // Triggers — small kick for the missile detonation
        if (typeof this.triggerScreenShake === 'function') this.triggerScreenShake(5, 3);
        if (typeof this.triggerCameraKick === 'function' && this.player) {
            this.triggerCameraKick(this.player.x - mx, this.player.y - my, 5);
        }
    };

    for (const missile of p.activeMissiles) {
        if (!missile.active) continue;

        // Enemy hit — apply knockback in the missile's direction of travel.
        let hit = false;
        const mvx = missile.vel?.x || 0;
        const mvy = missile.vel?.y || 0;
        const mvLen = Math.hypot(mvx, mvy) || 1;
        const kx = mvx / mvLen;
        const ky = mvy / mvLen;
        for (const enemy of this.enemyPool.activeObjects) {
            if (!enemy.active) continue;
            const dist = Math.hypot(enemy.x - missile.x, enemy.y - missile.y);
            if (dist < (enemy.radius || 15) + 6) {
                this.damageEnemy(enemy, POWER_WEAPONS.MISSILE_SALVO.missileDamage);
                if (enemy.vel) {
                    enemy.vel.x += kx * MISSILE_KNOCK;
                    enemy.vel.y += ky * MISSILE_KNOCK;
                }
                missile.active = false;
                explode(missile.x, missile.y);
                hit = true;
                break;
            }
        }
        if (hit) continue;

        // Asteroid hit
        for (const ast of this.asteroidPool.activeObjects) {
            if (!ast.active || ast.warping) continue;
            const dist = Math.hypot(ast.x - missile.x, ast.y - missile.y);
            if (dist < (ast.baseRadius || ast.radius || 20) + 6) {
                ast.health = Math.max(0, (ast.health || 0) - POWER_WEAPONS.MISSILE_SALVO.missileDamage);
                ast._hitFlashTimer = 4;
                if (ast.vel) {
                    ast.vel.x += kx * MISSILE_KNOCK * 0.6;
                    ast.vel.y += ky * MISSILE_KNOCK * 0.6;
                }
                if (ast.health <= 0.001) {
                    this.destroyAsteroid(ast);
                }
                missile.active = false;
                explode(missile.x, missile.y);
                break;
            }
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

// Full asteroid destruction sequence — death flash, audio, debris,
// color stars, orb drops, powerup chance, screen shake, and fragments
// for big asteroids. Mirrors the bullet-hit kill path so power-weapon
// AOE kills produce the same satisfying destruction (instead of
// silently disappearing). Marks the asteroid inactive at the end.
export function destroyAsteroid(ast) {
    if (!ast || !ast.active) return;
    const onScreen = this.isEntityOnScreen(ast);
    const isLarge = ast.baseRadius > (GAME_CONFIG.MIN_AST_RAD + 5);

    if (this.game.stats) this.game.stats.asteroidsDestroyed++;
    ast._deathFlash = 6;
    ast._deathFlashMax = 6;
    if (onScreen) {
        this.events.emit('audio:asteroid-destroy');
        this.triggerHitstop(isLarge ? 5 : 4);
    }
    this.createDebris(ast);
    this.createColorStarBurst(ast.x, ast.y);
    this.dropOrbsFromEntity(ast.x, ast.y, ast);

    const dropChance = isLarge
        ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.LARGE_ASTEROID
        : COLLISION_CONFIG.POWERUP_DROP_CHANCE.SMALL_ASTEROID;
    if (Math.random() < dropChance) {
        this.dropPowerup(ast.x, ast.y);
    }
    if (onScreen) {
        this.triggerScreenShake(
            isLarge ? 25 : 12,
            ast.baseRadius * (isLarge ? 0.8 : 0.5),
            ast.baseRadius,
        );
    }

    // Fragmentation — large asteroids spawn 2 smaller pieces (was 3-4).
    // Reduced count keeps the field manageable so asteroids don't
    // exponentially accumulate. Subsequent splits halt at non-large size
    // (see isLarge gate above) so we never get a 16-fragment cascade.
    if (isLarge) {
        const count = 2;
        const newR = ast.baseRadius / Math.sqrt(count);
        const baseAngle = random(0, Math.PI * 2);
        const sliceWidth = (Math.PI * 2) / count;
        for (let k = 0; k < count; k++) {
            const newAst = this.asteroidPool.get(ast.x, ast.y, newR, ast.level);
            if (newAst) {
                const fragHP = Math.max(5, Math.round((ast.maxHealth || 1) * random(0.7, 0.9)));
                newAst.maxHealth = fragHP;
                newAst.health = fragHP;
                const angle = baseAngle + k * sliceWidth + random(-sliceWidth * 0.25, sliceWidth * 0.25);
                const speed = random(4.5, 7.5);
                newAst.vel.x = (ast.vel?.x || 0) * 0.3 + Math.cos(angle) * speed;
                newAst.vel.y = (ast.vel?.y || 0) * 0.3 + Math.sin(angle) * speed;
            }
        }
    }

    ast.active = false;
}

export function damageEnemy(enemy, damage) {
    if (!enemy || !enemy.active || enemy._deathFlash > 0) return;
    enemy.health -= damage;
    // Surface this enemy in the top-center info panel — covers AOE hits
    // (mines, lightning, nova, missiles) that don't go through the bullet path.
    this._setLastHit(enemy);
    this.createDamageNumber(enemy.x, enemy.y - 15, damage);
    if (this.game.stats) this.game.stats.totalDamageDealt += damage;
    if (enemy.health <= 0) {
        // Start death flash — enemy renders as bright dissolving silhouette for 5 frames
        enemy._deathFlash = 8;
        enemy._deathFlashMax = 8;
        // Kill hitstop for weapon-effect kills (mines, lightning, nova, etc.)
        if (this.isEntityOnScreen(enemy)) {
            this.triggerHitstop(4);
        }
        // QA bot kill tracking — authoritative kill buffer (drained by state-reader)
        if (window._qaBotKillBuffer) window._qaBotKillBuffer.push({ type: enemy.type, wave: this.game.currentWave, ts: Date.now(), maxHealth: enemy.maxHealth });
        const reward = enemy.getDestructionReward();
        this.game.money += reward.points;
        if (this.game.stats) {
            this.game.stats.enemiesKilled++;
            this.game.stats.coinsEarned += reward.points;
            if (enemy.isBoss) this.game.stats.bossesKilled++;
        }
        this.player.gainExperience(Math.ceil(reward.points / 3));
        this.onEnemyKill(enemy);
        if (this.isEntityOnScreen(enemy)) {
            this.events.emit('audio:enemy-destroy');
        }
        this.createEnemyDebris(enemy);
        this.dropOrbsFromEntity(enemy.x, enemy.y, enemy);
        const powerupChance = enemy.type === 'WASP' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_WASP :
                            enemy.type === 'TITAN' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_TITAN :
                            enemy.type === 'TANGERINE' ? COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_TANGERINE : COLLISION_CONFIG.POWERUP_DROP_CHANCE.ENEMY_DEFAULT;
        if (Math.random() < powerupChance) {
            this.dropPowerup(enemy.x, enemy.y);
        }
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
        if (this.game.stats && finalDamage > 0) this.game.stats.totalDamageTaken += finalDamage;
        if (finalDamage > 0) {
            this.createDamageNumber(player.x, player.y - (player.radius || 14), finalDamage, { isPlayerHit: true });
            this.triggerPlayerHitFX(enemy.x, enemy.y, finalDamage);
        }

        // Break the kill streak on actual HP loss (Phase Dash zeroes
        // reducedDamage above, so dashing through enemies preserves it).
        if (finalDamage > 0) this._breakKillStreak();

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
        this.triggerHitstop(6); // ~100ms — enemies hit harder than asteroids
        const kickDx = player.x - enemy.x;
        const kickDy = player.y - enemy.y;
        this.triggerCameraKick(kickDx, kickDy, 10);
        this.triggerScreenShake(18, 10, enemy.radius);
        this.events.emit('audio:player-hit-enemy');

        // Damage number is created above via createDamageNumber — that
        // path renders through hud/combat.js with isPlayerHit styling
        // (red color, crit/empowered tags). The old particle-pool
        // 'damageNumber' was a duplicate that double-rendered the
        // number, removed in 5.64.8.

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
        // Start death flash — enemy renders as bright dissolving silhouette
        enemy._deathFlash = 8;
        enemy._deathFlashMax = 8;
        // QA bot kill tracking — authoritative kill buffer
        if (window._qaBotKillBuffer) window._qaBotKillBuffer.push({ type: enemy.type, wave: this.game.currentWave, ts: Date.now(), maxHealth: enemy.maxHealth });
        const reward = enemy.getDestructionReward();
        this.game.money += reward.points;
        this.player.gainExperience(Math.ceil(reward.points / 3));
        this.onEnemyKill(enemy);

        // Create colored explosion effects (includes screen shake)
        this.createEnemyDebris(enemy);
        // Drop health and money orbs
        this.dropOrbsFromEntity(enemy.x, enemy.y, enemy);
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
    if (finalDamage > 0) {
        this.createDamageNumber(player.x, player.y - (player.radius || 14), finalDamage, { isPlayerHit: true });
        // Bullet impact point — bullet's most recent position is the hit
        // location for the camera kick + shrapnel direction.
        this.triggerPlayerHitFX(bullet.x, bullet.y, finalDamage);
        if (this.game.stats) this.game.stats.totalDamageTaken += finalDamage;
    }

    // Break the kill streak on actual HP loss (see also player↔enemy
    // collision above and lifecycle.takeDamage).
    if (finalDamage > 0) this._breakKillStreak();

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
    this.triggerHitstop(4); // ~67ms — quick jolt
    this.triggerScreenShake(12, 6, bullet.radius);
    // Per-pattern enemy-bullet hit SFX (falls back to generic if untagged).
    this.events.emit('audio:player-hit-bullet', bullet.firingPattern);

    // (Damage number already created above via createDamageNumber.
    // Old particle-pool 'damageNumber' duplicate removed in 5.64.8.)

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
        if (finalDamage > 0) {
            this.createDamageNumber(this.player.x, this.player.y - (this.player.radius || 14), finalDamage, { isPlayerHit: true });
            this.triggerPlayerHitFX(asteroid.x, asteroid.y, finalDamage);
            if (this.game.stats) this.game.stats.totalDamageTaken += finalDamage;
        }

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
        this.events.emit('audio:player-hit-asteroid');
        // (Damage number already created above via createDamageNumber.
        // Old particle-pool 'damageNumber' duplicate removed in 5.64.8.)
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
        this.triggerHitstop(6); // ~100ms freeze — satisfying impact weight
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

        // Create destruction effects with death flash
        asteroid._deathFlash = 6;
        asteroid._deathFlashMax = 6;
        this.createDebris(asteroid);
        this.dropOrbsFromEntity(asteroid.x, asteroid.y, asteroid);
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
