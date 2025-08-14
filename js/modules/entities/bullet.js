// Bullet projectile entity
import { GAME_CONFIG } from '../constants.js';
import { wrap, random } from '../utils.js';

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class Bullet {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.active = false;
    }
    
    reset(x, y, angle) {
        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
        
        // Use original angle without any jitter
        this.x = x + Math.cos(angle) * (GAME_CONFIG.SHIP_SIZE * scale / 1.5);
        this.y = y + Math.sin(angle) * (GAME_CONFIG.SHIP_SIZE * scale / 1.5);
        this.radius = 2 * scale; // Smaller bullets
        this.angle = angle; // Use the original angle
        this.vel = {
            x: Math.cos(angle) * GAME_CONFIG.BULLET_SPEED,
            y: Math.sin(angle) * GAME_CONFIG.BULLET_SPEED
        };
        this.life = 0;
        this.active = true;
        this.mass = 1;
        this.hasHit = false; // Flag to prevent multiple hits
        
        // Powerup effects (will be set by player when creating bullets)
        this.homing = false;
        this.homingStrength = 0;
        this.piercing = 0; // Number of enemies it can pierce through
        this.piercedEnemies = 0; // Track how many it has pierced
        this.explosive = false;
        this.explosionRadius = 30;
    }
    
    // Simple bullet removal on impact
    startDying(impactX, impactY) {
        this.active = false;
        this.hasHit = true; // Mark as having hit something
    }
    
    update(particlePool, asteroidPool, enemyPool = null) {
        if (!this.active) return;
        
        this.life++;
        
        // Homing behavior
        if (this.homing && enemyPool) {
            this.applyHoming(enemyPool);
        }
        
        // Movement
        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Screen boundary check (bullets disappear when off screen)
        if (this.x < -50 || this.x > this.width + 50 || 
            this.y < -50 || this.y > this.height + 50) {
            this.active = false;
        }
    }
    
    applyHoming(enemyPool) {
        if (!this.homing || !enemyPool) return;
        
        let bestTarget = null;
        let bestScore = 0;
        
        // Enhanced target selection with predictive scoring
        for (const enemy of enemyPool.activeObjects) {
            if (!enemy.active) continue;
            
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance < 400) { // Increased homing range
                // Score based on distance and angle to current velocity
                const currentAngle = Math.atan2(this.vel.y, this.vel.x);
                const targetAngle = Math.atan2(dy, dx);
                let angleDiff = Math.abs(currentAngle - targetAngle);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                
                // Prefer closer targets and targets more aligned with current trajectory
                const distanceScore = (400 - distance) / 400; // 0-1, higher is closer
                const angleScore = (Math.PI - angleDiff) / Math.PI; // 0-1, higher is more aligned
                const totalScore = distanceScore * 0.7 + angleScore * 0.3;
                
                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestTarget = enemy;
                }
            }
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
                        const reward = enemy.getDestructionReward();
                        gameEngine.game.score += reward.points;
                        gameEngine.game.money += reward.points;
                        
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
                        
                        // Drop burst stars and maybe powerups
                        for (let i = 0; i < GAME_CONFIG.BURST_STAR_DROP_COUNT; i++) {
                            gameEngine.createEnemyBurstStar(enemy.x, enemy.y);
                        }
                        
                        gameEngine.enemyPool.release(enemy);
                    }
                }
            }
        }
    }
    
    onHit() {
        if (this.piercing > 0) {
            this.piercedEnemies++;
            console.log(`🔹 Piercing bullet hit ${this.piercedEnemies}/${this.piercing} targets`);
            if (this.piercedEnemies >= this.piercing) {
                console.log(`🔹 Piercing bullet exhausted, destroying`);
                this.startDying(this.x, this.y);
            }
            // Continue flying if still has piercing left
        } else {
            this.startDying(this.x, this.y);
        }
    }

    draw(ctx, gameEngine = null) {
        if (!this.active) return;
        
        ctx.save();
        
        // Get powerup-enhanced visuals
        const visualData = this.getBulletVisuals(gameEngine);
        
        // Apply enhanced colors (shadow effects removed for performance)
        ctx.fillStyle = visualData.color;
        
        // Draw based on bullet type/powerups
        if (visualData.shape === 'star') {
            this.drawStarBullet(ctx, visualData);
        } else if (visualData.shape === 'diamond') {
            this.drawDiamondBullet(ctx, visualData);
        } else if (visualData.shape === 'triangle') {
            this.drawTriangleBullet(ctx, visualData);
        } else if (visualData.shape === 'hexagon') {
            this.drawHexagonBullet(ctx, visualData);
        } else {
            // Default circle shape
            this.drawCircleBullet(ctx, visualData);
        }
        
        ctx.restore();
    }
    
    getBulletVisuals(gameEngine) {
        let color = '#00FFFF'; // Default cyan
        let glowColor = '#00FFFF';
        let glowIntensity = 6;
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
            if (powerups.has('SPREAD_SHOT')) {
                color = '#66ddff';
                glowColor = '#33ccff';
                shape = 'star';
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
    
    drawCircleBullet(ctx, visualData) {
        // Main bullet
        ctx.beginPath();
        ctx.arc(this.x, this.y, visualData.size, 0, 2 * Math.PI);
        ctx.fill();
        
        // Bright center
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(this.x, this.y, visualData.size * 0.5, 0, 2 * Math.PI);
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