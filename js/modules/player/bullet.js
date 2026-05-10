// Bullet projectile entity
import { GAME_CONFIG } from '../core/constants.js';
import { wrap, random, bakedBulletSpriteCache } from '../core/utils.js';
// Phase-1 multiplayer engine refactor: bullet ballistics extracted to
// `js/sim/bullet.js`. The wrapper in `update()` below builds a plain-
// data `BulletState` from `this`, calls `updatePlayerBullet`, and
// writes the result back. Behavior is byte-for-byte equivalent to the
// legacy inline code.
import { updatePlayerBullet } from '../../sim/bullet.js';

export class Bullet {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.active = false;
        // OPT: ring buffer for trail — eliminates Array.shift() O(n) per frame
        this.maxTrailLength = 16;
        this.trail = new Array(this.maxTrailLength);
        this.trailHead = 0;
        this.trailCount = 0;
    }
    
    reset(x, y, angle) {
        let scale = 1;

        // Use original angle without any jitter
        this.x = x + Math.cos(angle) * (GAME_CONFIG.SHIP_SIZE * scale / 1.5);
        this.y = y + Math.sin(angle) * (GAME_CONFIG.SHIP_SIZE * scale / 1.5);
        this.baseRadius = 4 * scale; // Store base for shrink calculations
        this.radius = this.baseRadius;
        this.angle = angle; // Use the original angle
        this.vel = {
            x: Math.cos(angle) * GAME_CONFIG.BULLET_SPEED,
            y: Math.sin(angle) * GAME_CONFIG.BULLET_SPEED
        };
        this.life = 0;
        this.active = true;
        this.mass = 1;

        // Range/lifetime — base range ≈ 24% screen width (~460px at BULLET_SPEED)
        // Each LONG_RANGE stack adds +40%; ~4 stacks for full screen
        this.maxLife = Math.round(30 / GAME_CONFIG.TICK_SCALE);
        this.rangeMultiplier = 1.0; // Set by player before firing
        this.fadeFactor = 1.0;

        // Powerup effects (will be set by player when creating bullets)
        this.homing = false;
        this.homingStrength = 0;
        this.helixActive = false; // Rail-Driver helix mode (set by fireRailDriver)
        this.piercing = 0; // Number of enemies it can pierce through
        this.piercedEnemies = 0; // Track how many it has pierced
        this.hitTargets = new Set(); // Track which targets (enemies/asteroids) this bullet has already hit
        this.explosive = false;
        this.explosionRadius = 30;
        // Reset ring buffer trail
        this.trailHead = 0;
        this.trailCount = 0;
    }
    
    // Simple bullet removal on impact
    startDying(impactX, impactY) {
        this.active = false;
    }

    createDisappearPuff(gameEngine) {
        if (!gameEngine || !gameEngine.particlePool) return;
        const count = 5 + Math.floor(Math.random() * 4); // 5-8 sparkles
        for (let i = 0; i < count; i++) {
            const p = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
            if (!p) continue;
            const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
            const speed = 0.6 + Math.random() * 1.5;
            p.vel.x = Math.cos(angle) * speed;
            p.vel.y = Math.sin(angle) * speed;
            p.color = Math.random() < 0.3 ? '#ffffff' : '#FFDD00';
            p.radius = 0.8 + Math.random() * 1.5;
            p.life = 14 + Math.random() * 10;
            p.friction = 0.91;
        }
    }
    
    update(particlePool, asteroidPool, enemyPool = null, gameEngine = null, gameField = null) {
        if (!this.active) return;

        // ── Trail ring-buffer (presentation; runs BEFORE physics so
        // the trail captures the pre-move position, matching legacy
        // ordering). Reuses the existing slot's {x,y} object.
        let slot = this.trail[this.trailHead];
        if (!slot) {
            slot = { x: 0, y: 0 };
            this.trail[this.trailHead] = slot;
        }
        slot.x = this.x;
        slot.y = this.y;
        this.trailHead = (this.trailHead + 1) % this.maxTrailLength;
        if (this.trailCount < this.maxTrailLength) this.trailCount++;

        // ── Pre-physics homing-target pick (presentation-adjacent —
        // it reads from entity pools and the input-handler cursor).
        // Done in the wrapper so the pure sim stays free of pool /
        // input-handler imports.
        let homingTarget = null;
        if (this.homing) {
            homingTarget = this._pickHomingTarget(enemyPool, asteroidPool, gameEngine);
        }

        // ── Pure-sim physics step (extracted to js/sim/bullet.js) ──
        // Reusable scratch state — avoid per-tick allocation.
        if (!this._bulletScratch) {
            this._bulletScratch = {
                id: 0, kind: 'player', shape: null, movementPattern: 'aimed',
                x: 0, y: 0, vx: 0, vy: 0,
                startX: 0, startY: 0, baseVx: 0, baseVy: 0,
                angle: 0, rotation: 0, rotationSpeed: 0,
                life: 0, maxLife: 0, fadeFactor: 1.0,
                damage: 1, radius: 0, baseRadius: 0,
                maxRange: 0, rangeMultiplier: 1.0,
                active: true, owner: null,
                homing: false, homingStrength: 0,
                helixActive: false, helixFreq: 0, helixPhase: 0, helixAmplitude: 0,
                piercing: 0, piercedEnemies: 0,
                explosive: false, explosionRadius: 0,
                expiredByRange: false, expiredByBounds: false, expiredByDistance: false,
            };
        }
        if (!this._bulletCtx) {
            this._bulletCtx = {
                tickScale: GAME_CONFIG.TICK_SCALE,
                logicTickSeconds: GAME_CONFIG.LOGIC_TICK_MS / 1000,
                bulletSpeed: GAME_CONFIG.BULLET_SPEED,
                boundaryWidth: 0, boundaryHeight: 0,
                now: 0,
                targetPlayer: null, homingTarget: null,
                rngFloat: Math.random,
            };
        }
        const sb = this._bulletScratch;
        sb.x = this.x; sb.y = this.y;
        sb.vx = this.vel.x; sb.vy = this.vel.y;
        sb.life = this.life;
        sb.maxLife = this.maxLife;
        sb.fadeFactor = this.fadeFactor;
        sb.radius = this.radius;
        sb.baseRadius = this.baseRadius;
        sb.rangeMultiplier = this.rangeMultiplier;
        sb.active = this.active;
        sb.homing = !!this.homing;
        sb.homingStrength = this.homingStrength || 0;
        sb.helixActive = !!this.helixActive;
        sb.helixFreq = this.helixFreq || 0;
        sb.helixPhase = this.helixPhase || 0;
        sb.helixAmplitude = this.helixAmplitude || 0;
        sb.expiredByRange = false;
        sb.expiredByBounds = false;

        const ctx = this._bulletCtx;
        ctx.boundaryWidth = gameField ? gameField.width : this.width;
        ctx.boundaryHeight = gameField ? gameField.height : this.height;
        ctx.homingTarget = homingTarget;

        updatePlayerBullet(sb, ctx, null);

        // Write outputs back.
        this.x = sb.x; this.y = sb.y;
        this.vel.x = sb.vx; this.vel.y = sb.vy;
        this.life = sb.life;
        this.fadeFactor = sb.fadeFactor;
        this.radius = sb.radius;
        if (!sb.active) {
            this.active = false;
            // Translate sim-emitted despawn flags into legacy FX calls.
            if (sb.expiredByRange) {
                this.createDisappearPuff(gameEngine);
            }
            if (this.onOffScreen) this.onOffScreen();
        }
    }

    /**
     * Wrapper-side homing-target picker. Lifted out of the legacy
     * `applyHoming()` so the pure sim takes only the chosen target,
     * not the live pools.
     */
    _pickHomingTarget(enemyPool, asteroidPool, gameEngine) {
        let bestTarget = null;
        let bestDistance = Infinity;
        let cursorX = null, cursorY = null;

        if (gameEngine && gameEngine.inputHandler) {
            cursorX = gameEngine.inputHandler.input.aimX;
            cursorY = gameEngine.inputHandler.input.aimY;
        }

        const checkTargets = (targets, filter = null) => {
            if (!targets) return;
            for (const target of targets.activeObjects) {
                if (!target.active) continue;
                if (filter && !filter(target)) continue;

                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const bulletDistance = Math.hypot(dx, dy);
                if (bulletDistance > 400) continue;

                let priority = bulletDistance;
                if (cursorX !== null && cursorY !== null) {
                    const cdx = target.x - cursorX;
                    const cdy = target.y - cursorY;
                    priority = Math.hypot(cdx, cdy);
                }
                if (priority < bestDistance) {
                    bestDistance = priority;
                    bestTarget = target;
                }
            }
        };

        if (enemyPool) checkTargets(enemyPool);
        // 5.73.0 — also home toward enemy mines (proximity bombs); not
        // toward ordinary projectiles.
        if (!bestTarget && gameEngine && gameEngine.enemyBulletPool) {
            checkTargets(gameEngine.enemyBulletPool, t => t.shape === 'mine');
        }
        if (!bestTarget && asteroidPool) checkTargets(asteroidPool);

        return bestTarget;
    }
    
    applyHoming(enemyPool, asteroidPool = null, gameEngine = null) {
        if (!this.homing) return;

        let bestTarget = null;
        let bestDistance = Infinity;
        let cursorX = null, cursorY = null;

        // Get cursor position from game engine if available
        if (gameEngine && gameEngine.inputHandler) {
            cursorX = gameEngine.inputHandler.input.aimX;
            cursorY = gameEngine.inputHandler.input.aimY;
        }

        // Enhanced target selection - prioritize targets closest to cursor, fallback to closest to bullet.
        // 5.73.0 — added optional `filter` so we can mix mines (from
        // enemyBulletPool) into the target set without targeting all
        // enemy bullets.
        const checkTargets = (targets, filter = null) => {
            if (!targets) return;
            for (const target of targets.activeObjects) {
                if (!target.active) continue;
                if (filter && !filter(target)) continue;

                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const bulletDistance = Math.hypot(dx, dy);

                if (bulletDistance > 400) continue; // Outside homing range

                let priority = bulletDistance; // Default: closest to bullet

                // If we have cursor position, prioritize targets closest to cursor
                if (cursorX !== null && cursorY !== null) {
                    const cursorDx = target.x - cursorX;
                    const cursorDy = target.y - cursorY;
                    const cursorDistance = Math.hypot(cursorDx, cursorDy);
                    priority = cursorDistance; // Prioritize cursor distance over bullet distance
                }

                if (priority < bestDistance) {
                    bestDistance = priority;
                    bestTarget = target;
                }
            }
        };

        // Check enemies first (higher priority)
        if (enemyPool) {
            checkTargets(enemyPool);
        }

        // 5.73.0 — also home toward enemy mines (proximity bombs). They
        // sit in enemyBulletPool with shape='mine'. Filter so we don't
        // target ordinary projectiles.
        if (!bestTarget && gameEngine && gameEngine.enemyBulletPool) {
            checkTargets(gameEngine.enemyBulletPool, t => t.shape === 'mine');
        }

        // Check asteroids if no nearby enemies / mines found
        if (!bestTarget && asteroidPool) {
            checkTargets(asteroidPool);
        }
        
        // Enhanced homing with predictive targeting
        if (bestTarget) {
            // Predict enemy position based on velocity
            const leadTime = 8; // Frames to predict ahead
            const predictedX = bestTarget.x + (bestTarget.vel ? bestTarget.vel.x * leadTime : 0);
            const predictedY = bestTarget.y + (bestTarget.vel ? bestTarget.vel.y * leadTime : 0);
            
            const dx = predictedX - this.x;
            const dy = predictedY - this.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance > 0) {
                // Calculate desired velocity direction
                const desiredVelX = (dx / distance) * GAME_CONFIG.BULLET_SPEED;
                const desiredVelY = (dy / distance) * GAME_CONFIG.BULLET_SPEED;
                
                // Apply turn rate limiting for smooth homing
                const maxTurnRate = 0.15; // Maximum radians per frame
                const currentAngle = Math.atan2(this.vel.y, this.vel.x);
                const desiredAngle = Math.atan2(desiredVelY, desiredVelX);
                
                let angleDiff = desiredAngle - currentAngle;
                if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                
                // Limit turn rate
                const actualTurn = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurnRate);
                const newAngle = currentAngle + actualTurn;
                
                // Distance-based homing strength (stronger when closer)
                const homingStrength = this.homingStrength * (1 + (200 - Math.min(distance, 200)) / 200);
                
                // Apply the turning with enhanced strength
                const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
                const targetVelX = Math.cos(newAngle) * currentSpeed;
                const targetVelY = Math.sin(newAngle) * currentSpeed;
                
                // Gradually adjust velocity toward target direction
                this.vel.x = this.vel.x * (1 - homingStrength) + targetVelX * homingStrength;
                this.vel.y = this.vel.y * (1 - homingStrength) + targetVelY * homingStrength;
                
                // Maintain consistent speed with slight boost when homing
                const speed = Math.hypot(this.vel.x, this.vel.y);
                const targetSpeed = GAME_CONFIG.BULLET_SPEED * 1.1; // Slight speed boost for homing
                if (speed > 0) {
                    this.vel.x = (this.vel.x / speed) * targetSpeed;
                    this.vel.y = (this.vel.y / speed) * targetSpeed;
                }
            }
        }
    }
    
    explode(gameEngine) {
        if (!this.explosive || !gameEngine) return;
        
        // Create explosion particles
        for (let i = 0; i < 15; i++) {
            const particle = gameEngine.particlePool.get(this.x, this.y, 'explosion');
            if (particle) {
                particle.color = '#ff6600';
                const angle = random(0, Math.PI * 2);
                const speed = random(2, 8);
                particle.vel = {
                    x: Math.cos(angle) * speed,
                    y: Math.sin(angle) * speed
                };
            }
        }
        
        // Damage nearby enemies
        if (gameEngine.enemyPool) {
            for (const enemy of gameEngine.enemyPool.activeObjects) {
                if (!enemy.active) continue;
                
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                const distance = Math.hypot(dx, dy);
                
                if (distance < this.explosionRadius) {
                    const damage = Math.ceil(2 * (1 - distance / this.explosionRadius));
                    const destroyed = enemy.takeDamage(damage);
                    
                    if (destroyed && gameEngine.game) {
                        // 5.74.3 — gold no longer auto-awarded on kill
                        // (pickup-only). Score still ticks.
                        const reward = enemy.getDestructionReward();
                        gameEngine.game.score += reward.points;
                        
                        // Create additional explosion particles for destroyed enemies
                        for (let j = 0; j < 8; j++) {
                            const particle = gameEngine.particlePool.get(enemy.x, enemy.y, 'explosion');
                            if (particle) {
                                particle.color = '#ffaa00';
                                const angle = random(0, Math.PI * 2);
                                const speed = random(3, 10);
                                particle.vel = {
                                    x: Math.cos(angle) * speed,
                                    y: Math.sin(angle) * speed
                                };
                            }
                        }
                        
                        // Drop health and money stars
                        gameEngine.dropStarsFromEntity(enemy.x, enemy.y);
                        
                        gameEngine.enemyPool.release(enemy);
                    }
                }
            }
        }
    }
    
    onHit(target = null) {
        if (this.piercing > 0) {
            this.piercedEnemies++;
            if (target !== null) {
                this.hitTargets.add(target);
            }
            // Allow piercing bullets to hit piercing+1 targets (so piercing=1 means it can hit 2 targets)
            if (this.piercedEnemies > this.piercing) {
                this.startDying(this.x, this.y);
            }
            // Continue flying if still has piercing left
        } else {
            this.startDying(this.x, this.y);
        }
    }
    
    hasHitEnemy(target) {
        return this.hitTargets.has(target);
    }

    draw(ctx, gameEngine = null) {
        if (!this.active) return;

        ctx.save();

        // Fade opacity during final stretch of bullet life
        const fade = this.fadeFactor !== undefined ? this.fadeFactor : 1.0;
        ctx.globalAlpha = fade;

        // Get powerup-enhanced visuals
        const visualData = this.getBulletVisuals(gameEngine);

        // Draw trail first (behind bullet) — always Canvas2D for now.
        this.drawTrail(ctx, visualData);

        // 5.79.2 — Bullet body. If WebGL bullet renderer is available
        //   AND it handles this shape, push the bullet into the
        //   instance buffer and skip the Canvas2D body draw entirely.
        //   The renderer flushes one batched draw call per frame.
        //   Avoids the per-bullet shadowBlur Gaussian pass that used
        //   to dominate frame time at high bullet counts.
        const bulletRenderer = gameEngine && gameEngine.bulletRenderer;
        const useGL = bulletRenderer && bulletRenderer.handlesShape(visualData.shape);
        if (useGL) {
            // Push (x, y, size, color, alpha). Size is the bullet's
            // body diameter; the renderer scales the quad to give
            // exactly that pixel size on screen.
            const dia = visualData.size * 2.4;
            bulletRenderer.pushBullet(
                visualData.shape, this.x, this.y, dia, visualData.color, fade,
                /*angle=*/0, /*aspect=*/1,
            );
            ctx.restore();
            return;
        }

        // Canvas2D fallback (WebGL not supported). 5.79.3 — uses the
        //   baked-outline sprite cache so we drawImage one cached
        //   sprite per bullet instead of running the path/fill/stroke
        //   chain. ~70% faster than the original shadowBlur path
        //   (see docs/STROKE_PERF_ANALYSIS_5.79.md item #1). The
        //   sprite already has the black outline + colored body +
        //   bright core baked in.
        const baked = bakedBulletSpriteCache.draw(
            ctx,
            visualData.shape || 'circle',
            visualData.color,
            visualData.size,
            this.x, this.y,
            fade,
        );
        if (!baked) {
            // Sprite cache rejected (size/alpha 0) — fall back to the
            // legacy path-and-fill so an off-screen / dying bullet
            // doesn't disappear unexpectedly.
            ctx.fillStyle = visualData.color;
            if (visualData.shape === 'star') {
                this.drawStarBullet(ctx, visualData);
            } else if (visualData.shape === 'diamond') {
                this.drawDiamondBullet(ctx, visualData);
            } else if (visualData.shape === 'triangle') {
                this.drawTriangleBullet(ctx, visualData);
            } else if (visualData.shape === 'hexagon') {
                this.drawHexagonBullet(ctx, visualData);
            } else {
                this.drawCircleBullet(ctx, visualData);
            }
        }
        ctx.restore();
    }
    
    getBulletVisuals(gameEngine) {
        let color = '#FFFF00'; // Default bright yellow
        let glowColor = '#FFDD00';
        let glowIntensity = 8;
        let shape = 'circle';
        let size = this.radius;
        
        // Check for active powerups through game engine player
        if (gameEngine && gameEngine.player && gameEngine.player.powerups) {
            const powerups = gameEngine.player.powerups;
            
            // Priority order for visual effects (later ones override earlier ones)
            if (powerups.has('RAPID_FIRE')) {
                color = '#ff6600';
                glowColor = '#ff3300';
                glowIntensity = 8;
                shape = 'triangle';
            }
            if (powerups.has('MULTI_SHOT')) {
                color = '#66aaff';
                glowColor = '#3366ff';
                shape = 'hexagon';
            }
            if (powerups.has('SPEED_BOOST')) {
                color = '#ffff33';
                glowColor = '#ffcc00';
                glowIntensity = 10;
            }
            if (powerups.has('BIG_BULLETS')) {
                color = '#66ff66';
                glowColor = '#33cc33';
                size = this.radius * 1.2; // Slightly bigger visual
            }
            if (powerups.has('PIERCING')) {
                color = '#ffcc66';
                glowColor = '#ff9933';
                shape = 'diamond';
                glowIntensity = 12;
            }
            if (powerups.has('HOMING')) {
                color = '#ff66cc';
                glowColor = '#ff3399';
                shape = 'diamond';
                glowIntensity = 15;
            }
            if (powerups.has('EXPLOSIVE')) {
                color = '#ff9933';
                glowColor = '#ff6600';
                shape = 'star';
                glowIntensity = 20;
                size = this.radius * 1.1;
            }
        }
        
        return { color, glowColor, glowIntensity, shape, size };
    }
    
    drawTrail(ctx, visualData) {
        if (this.trailCount < 2) return;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = visualData.glowColor;

        // OPT: iterate ring buffer oldest→newest
        for (let i = 0; i < this.trailCount - 1; i++) {
            const idx = (this.trailHead - this.trailCount + i + this.maxTrailLength) % this.maxTrailLength;
            const segment = this.trail[idx];
            if (!segment) continue;
            const alpha = (i + 1) / this.trailCount;
            const size = visualData.size * alpha * 0.6;

            ctx.globalAlpha = alpha * 0.7;
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, size, 0, 2 * Math.PI);
            ctx.fill();
        }

        ctx.restore();
    }
    
    drawCircleBullet(ctx, visualData) {
        // Draw comet-shaped bullet
        const headRadius = visualData.size;
        const tailLength = visualData.size * 2;
        
        // Calculate direction opposite to movement for tail
        const tailAngle = Math.atan2(-this.vel.y, -this.vel.x);
        const tailX = this.x + Math.cos(tailAngle) * tailLength;
        const tailY = this.y + Math.sin(tailAngle) * tailLength;
        
        // Draw comet tail (gradient from head to tail)
        const gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        gradient.addColorStop(0, visualData.color);
        gradient.addColorStop(0.7, visualData.color + '80'); // Semi-transparent
        gradient.addColorStop(1, visualData.color + '00'); // Fully transparent
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(
            this.x + Math.cos(tailAngle) * tailLength * 0.3, 
            this.y + Math.sin(tailAngle) * tailLength * 0.3,
            tailLength * 0.8, 
            headRadius * 0.6,
            tailAngle,
            0, 
            2 * Math.PI
        );
        ctx.fill();
        
        // Main bullet head (circular)
        ctx.fillStyle = visualData.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, headRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Bright center
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(this.x, this.y, headRadius * 0.5, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    drawStarBullet(ctx, visualData) {
        const points = 5;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = (i * Math.PI) / points;
            const radius = i % 2 === 0 ? visualData.size : visualData.size * 0.5;
            const x = this.x + Math.cos(angle) * radius;
            const y = this.y + Math.sin(angle) * radius;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Bright center
        ctx.fillStyle = '#FFFFFF';

        ctx.beginPath();
        ctx.arc(this.x, this.y, visualData.size * 0.3, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    drawDiamondBullet(ctx, visualData) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - visualData.size);
        ctx.lineTo(this.x + visualData.size * 0.7, this.y);
        ctx.lineTo(this.x, this.y + visualData.size);
        ctx.lineTo(this.x - visualData.size * 0.7, this.y);
        ctx.closePath();
        ctx.fill();
        
        // Bright center line
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - visualData.size * 0.5);
        ctx.lineTo(this.x, this.y + visualData.size * 0.5);
        ctx.stroke();
    }
    
    drawTriangleBullet(ctx, visualData) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - visualData.size);
        ctx.lineTo(this.x + visualData.size * 0.8, this.y + visualData.size * 0.5);
        ctx.lineTo(this.x - visualData.size * 0.8, this.y + visualData.size * 0.5);
        ctx.closePath();
        ctx.fill();
        
        // Bright center
        ctx.fillStyle = '#FFFFFF';

        ctx.beginPath();
        ctx.arc(this.x, this.y, visualData.size * 0.3, 0, 2 * Math.PI);
        ctx.fill();
    }
    
    drawHexagonBullet(ctx, visualData) {
        const sides = 6;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI) / sides;
            const x = this.x + Math.cos(angle) * visualData.size;
            const y = this.y + Math.sin(angle) * visualData.size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        // Bright center
        ctx.fillStyle = '#FFFFFF';

        ctx.beginPath();
        ctx.arc(this.x, this.y, visualData.size * 0.4, 0, 2 * Math.PI);
        ctx.fill();
    }
}