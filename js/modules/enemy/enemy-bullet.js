// Enemy bullets with different colors and effects
import { GameDimensions } from '../core/utils.js';
import { ENEMY_BULLET_CONFIG, GAME_CONFIG } from '../core/constants.js';
import { frameClock } from '../core/frame-clock.js';

export class EnemyBullet {
    constructor() {
        this.active = false;
        this.explosive = false;
    }
    
    reset(x = 0, y = 0, velX = 0, velY = 0, color = '#ff4444', explosive = false) {
        this.x = x;
        this.y = y;
        this.startX = x; // Track starting position for distance calculations
        this.startY = y;
        this.vel = { x: velX, y: velY };
        this.color = color;
        this.explosive = explosive;
        this.active = true;
        this.life = 1.0;
        this.creationTime = frameClock.now;

        // Tag with the firing pattern that's currently dispatching (set by
        // firing.js shoot() before invoking each pattern function). Used by
        // collision-system to play per-pattern hit SFX on the player.
        this.firingPattern = (typeof window !== 'undefined' && window.gameEngine && window.gameEngine._activeShotPattern) || null;

        // Visual properties
        this.radius = explosive ? 6 : 3;
        this.glowRadius = explosive ? 12 : 6;
        this.trailLength = explosive ? 8 : 4;
        // OPT: ring buffer trail — O(1) insert, no unshift/pop shifting
        this.trail = new Array(this.trailLength);
        this.trailHead = 0;
        this.trailCount = 0;

        // Rotation for visual effect
        this.rotation = 0;
        this.rotationSpeed = explosive ? 0.1 : 0.05;

        // Damage (scaled back down to balanced levels)
        this.damage = explosive ? 3 : 2;

        // Movement pattern properties (set by enemy when creating bullet)
        this.movementPattern = 'aimed'; // Default pattern
        this.patternTimer = 0;
        this.patternPhase = 0;
        this.baseVel = { x: velX, y: velY }; // Store original velocity

        // Shape rendering
        this.shape = null; // null = circle, 'triangle', 'square', 'needle', 'mine'

        // Persistent bullets (mines) — bypass the life<=0.5 deactivation threshold
        this.isPersistent = false;
        this.maxLifetimeOverride = null; // Override default 3000ms lifetime (ms)

        // Distance-based range — base ~600px, scaled by enemy level in createEnemyBullet
        this.maxRange = 600;

        // For mine proximity: reference to player (set by enemy that laid the mine)
        this.targetPlayer = null;

        // Burst of particles on natural expiry (used by Stalker laser segments)
        this.deathBurst = false;

        // Sine-wave oscillation (used by Sentinel sine-needle)
        this.sinePhase = 0;
        this.sineFreq  = 0;
        this.sineAmp   = 0;
        this.sinePerpX = 0;
        this.sinePerpY = 0;
    }
    
    update() {
        if (!this.active) return;
        
        // OPT: ring buffer trail insert — O(1)
        this.trail[this.trailHead] = { x: this.x, y: this.y };
        this.trailHead = (this.trailHead + 1) % this.trailLength;
        if (this.trailCount < this.trailLength) this.trailCount++;
        
        // Apply movement pattern
        this.applyMovementPattern();
        
        // Update position (scaled for tick rate)
        const ts = GAME_CONFIG.TICK_SCALE;
        this.x += this.vel.x * ts;
        this.y += this.vel.y * ts;

        // Update rotation
        this.rotation += this.rotationSpeed * ts;

        // Update pattern timer
        this.patternTimer += GAME_CONFIG.LOGIC_TICK_MS / 1000;
        
        // Homing mine health-based death
        if (this.shape === 'mine' && this.health !== undefined && this.health <= 0) {
            this.active = false;
            return;
        }

        // Persistent bullets (mines, lightning orbs) use time-based lifetime
        if (this.isPersistent) {
            const maxLife = this.maxLifetimeOverride || 15000;
            const age = frameClock.now - this.creationTime;
            if (age > maxLife) {
                this.active = false;
                return;
            }
            // Mines stay full opacity; other persistent bullets fade over final 40%
            if (this.shape === 'mine') {
                this.life = 1.0;
            } else {
                const progress = age / maxLife;
                this.life = progress < 0.6 ? 1.0 : 1.0 - (progress - 0.6) / 0.4;
            }
        } else {
            // Distance-based range — bullet fades and dies after traveling maxRange
            const dist = Math.hypot(this.x - this.startX, this.y - this.startY);
            const progress = dist / this.maxRange; // 0 → 1

            if (progress >= 1.0) {
                this.createDisappearEffect();
                this.active = false;
                return;
            }

            // life stays 1.0 for first 65%, then fades 1.0→0.5 over final 35%
            this.life = progress < 0.65
                ? 1.0
                : 1.0 - (progress - 0.65) / 0.35 * 0.5; // 1.0 → 0.5
        }
        
        // Check bounds - recycle if off screen (use gameField dimensions)
        const margin = 50;
        const fieldWidth = GameDimensions.width;
        const fieldHeight = GameDimensions.height;
        
        if (this.x < -margin || this.x > fieldWidth + margin ||
            this.y < -margin || this.y > fieldHeight + margin) {
            // Don't create disappear effect for off-screen bullets (too far away to see)
            this.active = false; // Will be recycled by pool manager
        }
    }
    
    applyMovementPattern() {
        if (!this.baseVel) return; // Safety check
        
        const speed = Math.hypot(this.baseVel.x, this.baseVel.y);
        const baseAngle = Math.atan2(this.baseVel.y, this.baseVel.x);
        
        switch (this.movementPattern) {
            case 'aimed':
                // Standard straight movement - no modification needed
                break;

            case 'mine':
                // Stationary proximity mine — zero velocity, large collision radius
                this.vel.x = 0;
                this.vel.y = 0;
                break;

            case 'homing_mine': {
                // Slowly crawl toward player with strong homing
                if (this.targetPlayer && this.targetPlayer.active !== false) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist > 5) {
                        this.vel.x += (dx / dist) * 0.09;
                        this.vel.y += (dy / dist) * 0.09;
                        const maxSpeed = 1.8;
                        const spd = Math.hypot(this.vel.x, this.vel.y);
                        if (spd > maxSpeed) {
                            this.vel.x = (this.vel.x / spd) * maxSpeed;
                            this.vel.y = (this.vel.y / spd) * maxSpeed;
                        }
                    }
                }
                break;
            }
                
            case 'spread':
                // Sinusoidal weaving pattern
                const waveFreq = 3;
                const waveAmp = 0.5;
                const perpAngle = baseAngle + Math.PI / 2;
                const waveOffset = Math.sin(this.patternTimer * waveFreq + this.patternPhase) * waveAmp;
                
                this.vel.x = this.baseVel.x + Math.cos(perpAngle) * waveOffset;
                this.vel.y = this.baseVel.y + Math.sin(perpAngle) * waveOffset;
                break;
                
            case 'rapid':
                // Erratic jittery movement
                const jitterStrength = 0.3;
                const jitterX = (Math.random() - 0.5) * jitterStrength;
                const jitterY = (Math.random() - 0.5) * jitterStrength;
                
                this.vel.x = this.baseVel.x + jitterX;
                this.vel.y = this.baseVel.y + jitterY;
                break;
                
            case 'spiral':
                // Spiral outward pattern
                const spiralRate = 2;
                const spiralRadius = this.patternTimer * 0.5;
                const spiralAngle = baseAngle + this.patternTimer * spiralRate;
                
                this.vel.x = Math.cos(spiralAngle) * speed + Math.cos(spiralAngle + Math.PI/2) * spiralRadius * 0.1;
                this.vel.y = Math.sin(spiralAngle) * speed + Math.sin(spiralAngle + Math.PI/2) * spiralRadius * 0.1;
                break;
                
            case 'burst':
                // Accelerating pattern that speeds up over time
                const accelFactor = 1 + this.patternTimer * 0.5;
                this.vel.x = this.baseVel.x * accelFactor;
                this.vel.y = this.baseVel.y * accelFactor;
                break;
                
            case 'explosive':
                // Slower start, then sudden acceleration
                let explosiveFactor;
                if (this.patternTimer < 0.5) {
                    explosiveFactor = 0.3; // Start slow
                } else {
                    explosiveFactor = 1.5 + (this.patternTimer - 0.5) * 2; // Sudden acceleration
                }
                
                this.vel.x = this.baseVel.x * explosiveFactor;
                this.vel.y = this.baseVel.y * explosiveFactor;
                break;
                
            case 'laser':
                // Laser beam - very fast and straight
                const laserSpeed = Math.hypot(this.baseVel.x, this.baseVel.y) * 2;
                const laserAngle = Math.atan2(this.baseVel.y, this.baseVel.x);
                this.vel.x = Math.cos(laserAngle) * laserSpeed;
                this.vel.y = Math.sin(laserAngle) * laserSpeed;
                break;
                
            case 'laser_beam':
                // Wide laser beam segment - extremely fast and destructive
                const beamSpeed = Math.hypot(this.baseVel.x, this.baseVel.y) * 3;
                const beamAngle = Math.atan2(this.baseVel.y, this.baseVel.x);
                this.vel.x = Math.cos(beamAngle) * beamSpeed;
                this.vel.y = Math.sin(beamAngle) * beamSpeed;
                // Reduced damage for balance - was (damage || 15) * 1.5
                this.damage = (this.damage || 3) * 1.0; // Much lower base damage
                this.radius = Math.max(this.radius, 8);
                break;
                
            case 'missile':
                // Homing missile - tracks player
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance > 0) {
                        const homingStrength = 0.05;
                        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);

                        // Gradually turn toward player
                        this.vel.x += (dx / distance) * homingStrength;
                        this.vel.y += (dy / distance) * homingStrength;

                        // Maintain speed
                        const newSpeed = Math.hypot(this.vel.x, this.vel.y);
                        if (newSpeed > 0) {
                            this.vel.x = (this.vel.x / newSpeed) * currentSpeed;
                            this.vel.y = (this.vel.y / newSpeed) * currentSpeed;
                        }
                    }
                }
                // Track rotation to velocity so missile_shape visually leads its direction
                if (this.vel.x !== 0 || this.vel.y !== 0) {
                    this.rotation = Math.atan2(this.vel.y, this.vel.x);
                }
                break;
                
            case 'homing':
                // Bomber homing shots - slower but more persistent tracking
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const distance = Math.hypot(dx, dy);
                    
                    if (distance > 0) {
                        const homingStrength = 0.03; // Slower turning than missiles
                        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
                        
                        // Gradually turn toward player
                        this.vel.x += (dx / distance) * homingStrength;
                        this.vel.y += (dy / distance) * homingStrength;
                        
                        // Maintain speed
                        const newSpeed = Math.hypot(this.vel.x, this.vel.y);
                        if (newSpeed > 0) {
                            this.vel.x = (this.vel.x / newSpeed) * currentSpeed;
                            this.vel.y = (this.vel.y / newSpeed) * currentSpeed;
                        }
                    }
                }
                break;
                
            case 'titan_homing':
                // Titan tank missiles - faster but weaker homing than bomber
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const distance = Math.hypot(dx, dy);
                    
                    if (distance > 0) {
                        const homingStrength = 0.02; // Weaker homing than bomber (0.03) and missile (0.05)
                        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
                        
                        // Gradually turn toward player
                        this.vel.x += (dx / distance) * homingStrength;
                        this.vel.y += (dy / distance) * homingStrength;
                        
                        // Maintain speed
                        const newSpeed = Math.hypot(this.vel.x, this.vel.y);
                        if (newSpeed > 0) {
                            this.vel.x = (this.vel.x / newSpeed) * currentSpeed;
                            this.vel.y = (this.vel.y / newSpeed) * currentSpeed;
                        }
                    }
                }
                break;
                
            case 'titan_rocket':
                // Fast, direct rockets - maintain constant speed
                const rocketSpeed = this.rocketSpeed || ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET.SPEED;
                const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
                
                // Maintain constant rocket speed
                if (currentSpeed !== rocketSpeed) {
                    const direction = Math.atan2(this.vel.y, this.vel.x);
                    this.vel.x = Math.cos(direction) * rocketSpeed;
                    this.vel.y = Math.sin(direction) * rocketSpeed;
                }
                
                // Track distance traveled
                if (this.distanceTraveled !== undefined) {
                    const dx = this.x - this.startX;
                    const dy = this.y - this.startY;
                    this.distanceTraveled = Math.hypot(dx, dy);
                    
                    // Explode after traveling max distance
                    const maxDistance = this.maxDistance || ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET.MAX_DISTANCE;
                    if (this.distanceTraveled >= maxDistance) {
                        // Create explosion effect
                        this.createExplosionEffect();
                        this.active = false;
                    }
                }
                break;
                
            case 'missile_decelerate':
                // Missile turret missiles - start fast, decelerate, then explode
                // Use level-scaled deceleration or fall back to constants
                const prowlerConfig = ENEMY_BULLET_CONFIG.MISSILE.PROWLER_PIKE;
                if (!prowlerConfig) {
                    console.error('PROWLER_PIKE configuration not found!');
                    return; // Exit early if config is missing
                }
                const deceleration = this.deceleration || prowlerConfig.DECELERATION;
                const minSpeed = prowlerConfig.MIN_SPEED;
                
                // Decelerate in current direction
                const currentSpeedDeccel = Math.hypot(this.vel.x, this.vel.y);
                if (currentSpeedDeccel > minSpeed) {
                    const direction = Math.atan2(this.vel.y, this.vel.x);
                    const newSpeed = Math.max(currentSpeedDeccel - deceleration, minSpeed);
                    this.vel.x = Math.cos(direction) * newSpeed;
                    this.vel.y = Math.sin(direction) * newSpeed;
                } else {
                    // Reached minimum speed - explode and disappear
                    this.createExplosionEffect();
                    this.active = false;
                }
                
                // Check max distance for Prowler missiles
                if (this.maxDistance && this.startX !== undefined && this.startY !== undefined) {
                    const dx = this.x - this.startX;
                    const dy = this.y - this.startY;
                    const distanceTraveled = Math.hypot(dx, dy);
                    
                    if (distanceTraveled >= this.maxDistance) {
                        this.createExplosionEffect();
                        this.active = false;
                    }
                }
                break;
                
            case 'pulse':
                // Pulse shot - accelerates over time
                const pulseAccel = 1 + this.patternTimer * 0.8;
                this.vel.x = this.baseVel.x * pulseAccel;
                this.vel.y = this.baseVel.y * pulseAccel;
                break;
                
            case 'shield_burst':
                // Shield burst - steady speed with slight wobble
                const wobble = Math.sin(this.patternTimer * 8) * 0.2;
                const shieldPerpAngle = Math.atan2(this.baseVel.y, this.baseVel.x) + Math.PI / 2;
                this.vel.x = this.baseVel.x + Math.cos(shieldPerpAngle) * wobble;
                this.vel.y = this.baseVel.y + Math.sin(shieldPerpAngle) * wobble;
                break;
                
            case 'wave_energy':
                // Guardian crescent wave - slight sine wave motion
                const waveFrequency = 3; // How many waves per second
                const waveAmplitude = 15; // How far the wave deviates
                
                // Calculate perpendicular direction for wave motion
                const baseDirection = Math.atan2(this.baseVel.y, this.baseVel.x);
                const perpDirection = baseDirection + Math.PI / 2;
                
                // Apply sine wave offset
                const energyWaveOffset = Math.sin(this.patternTimer * waveFrequency) * waveAmplitude;
                const waveVelX = Math.cos(perpDirection) * energyWaveOffset * 0.1;
                const waveVelY = Math.sin(perpDirection) * energyWaveOffset * 0.1;
                
                // Combine base velocity with wave motion
                this.vel.x = this.baseVel.x + waveVelX;
                this.vel.y = this.baseVel.y + waveVelY;
                break;
                
            case 'energy_slash':
                // Guardian energy slash - maintains formation while moving forward
                const slashSpeed = Math.hypot(this.baseVel.x, this.baseVel.y);
                const slashDirection = Math.atan2(this.baseVel.y, this.baseVel.x);
                
                // Slight curve effect based on position in slash
                const curveIntensity = 0.3;
                const curveOffset = Math.sin(this.slashProgress * Math.PI) * curveIntensity;
                const perpSlashDirection = slashDirection + Math.PI / 2;
                
                // Apply curve to maintain crescent shape while moving
                const curveVelX = Math.cos(perpSlashDirection) * curveOffset;
                const curveVelY = Math.sin(perpSlashDirection) * curveOffset;
                
                // Maintain forward momentum with slight curve
                this.vel.x = this.baseVel.x + curveVelX;
                this.vel.y = this.baseVel.y + curveVelY;
                
                // Slight pulsing effect for energy
                const pulseIntensity = 1 + Math.sin(this.patternTimer * 8) * 0.1;
                this.vel.x *= pulseIntensity;
                this.vel.y *= pulseIntensity;
                break;
                
            case 'crescent_beam':
                // Guardian crescent beam - straight laser rays like Stalker but in crescent formation
                // No movement modification needed - straight laser beams
                break;
                
            case 'crescent_slice':
                // Guardian crescent slice - maintains parallel formation while moving
                // All bullets travel in same direction to maintain concentrated front
                // No movement modification needed - straight parallel movement
                break;

            case 'sine_wave':
                // Sinusoidal oscillation perpendicular to travel direction (needle tracking)
                this.sinePhase += this.sineFreq;
                const sineDisp = Math.sin(this.sinePhase) * this.sineAmp;
                this.vel.x = this.baseVel.x + this.sinePerpX * sineDisp;
                this.vel.y = this.baseVel.y + this.sinePerpY * sineDisp;
                // Keep needle oriented in actual travel direction
                this.rotation = Math.atan2(this.vel.y, this.vel.x);
                break;

            case 'sine_wave_nospin':
                // Sine wave without overriding rotation — lets rotationSpeed drive shape spin
                this.sinePhase += this.sineFreq;
                const snDisp = Math.sin(this.sinePhase) * this.sineAmp;
                this.vel.x = this.baseVel.x + this.sinePerpX * snDisp;
                this.vel.y = this.baseVel.y + this.sinePerpY * snDisp;
                // rotation is NOT touched here; update() adds rotationSpeed for free spin
                break;

            case 'missile_fast_slow': {
                // Prowler missile: fast launch + strong homing, decelerates after ~1s
                if (this.targetPlayer) {
                    const mDx = this.targetPlayer.x - this.x;
                    const mDy = this.targetPlayer.y - this.y;
                    const mDist = Math.hypot(mDx, mDy);
                    if (mDist > 0) {
                        this.vel.x += (mDx / mDist) * 0.18; // strong homing
                        this.vel.y += (mDy / mDist) * 0.18;
                    }
                }
                const mSpd = Math.hypot(this.vel.x, this.vel.y);
                // Fast for first ~1s (patternTimer < 1.0 at 60fps), then cruise
                const mMaxSpd = this.patternTimer < 0.95 ? 14 : 5;
                if (mSpd > mMaxSpd && mSpd > 0) {
                    this.vel.x = (this.vel.x / mSpd) * mMaxSpd;
                    this.vel.y = (this.vel.y / mSpd) * mMaxSpd;
                }
                const mMinSpd = 2.5;
                if (mSpd > 0 && mSpd < mMinSpd) {
                    this.vel.x = (this.vel.x / mSpd) * mMinSpd;
                    this.vel.y = (this.vel.y / mSpd) * mMinSpd;
                }
                // Track rotation so missile nose always points forward
                if (this.vel.x !== 0 || this.vel.y !== 0) {
                    this.rotation = Math.atan2(this.vel.y, this.vel.x);
                }
                break;
            }
        }
    }
    
    draw(ctx) {
        if (!this.active) return;

        ctx.save();

        // Draw trail
        this.drawTrail(ctx);

        // Draw bullet
        this.drawBullet(ctx);

        ctx.restore();

        // Draw bomb health bar + name after bullet is drawn (world coordinates)
        if (this.shape === 'mine' && this.health !== undefined && this.health < this.maxHealth) {
            this.drawBombOverlay(ctx);
        }
    }

    drawBombOverlay(ctx) {
        const barWidth = this.radius * 3.5;
        const barHeight = 3;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.radius - 8;
        const healthPct = Math.max(0, this.health / this.maxHealth);

        ctx.save();

        // Health bar background
        const bgColor = healthPct > 0.5 ? 'rgba(0,80,0,0.6)' : healthPct > 0.25 ? 'rgba(80,80,0,0.6)' : 'rgba(80,0,0,0.6)';
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, 1);
        ctx.fill();

        // Health bar fill
        let fillGrad = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
        if (healthPct > 0.5) {
            fillGrad.addColorStop(0, '#66ff66'); fillGrad.addColorStop(1, '#00cc00');
        } else if (healthPct > 0.25) {
            fillGrad.addColorStop(0, '#ffff99'); fillGrad.addColorStop(1, '#cccc00');
        } else {
            fillGrad.addColorStop(0, '#ff6666'); fillGrad.addColorStop(1, '#cc0000');
        }
        const filled = barWidth * healthPct;
        if (filled > 0) {
            ctx.fillStyle = fillGrad;
            ctx.beginPath();
            ctx.roundRect(barX, barY, filled, barHeight, 1);
            ctx.fill();
        }

        // "BOMB" label above bar
        ctx.font = '13px "Silkscreen", monospace';
        ctx.fillStyle = 'goldenrod';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.shadowBlur = 4;
        ctx.fillText('BOMB', this.x, barY - 7);

        ctx.restore();
    }
    
    drawTrail(ctx) {
        if (this.trailCount < 2) return;

        // Calculate base opacity for trail (same as bullet)
        let baseOpacity = this.life;
        if (this.movementPattern === 'crescent_slice' && this.maxLife) {
            const ageRatio = (frameClock.now - this.creationTime) / (this.maxLife * 1000);
            baseOpacity = Math.max(0, 1 - ageRatio);
        }

        ctx.strokeStyle = this.color;
        ctx.lineCap = 'round';

        // OPT: iterate ring buffer newest→oldest (i=0 is newest)
        for (let i = 0; i < this.trailCount - 1; i++) {
            const idx  = (this.trailHead - 1 - i + this.trailLength * 2) % this.trailLength;
            const idx2 = (this.trailHead - 2 - i + this.trailLength * 2) % this.trailLength;
            const seg  = this.trail[idx];
            const seg2 = this.trail[idx2];
            if (!seg || !seg2) continue;

            const alpha = (1 - i / this.trailCount) * 0.6 * baseOpacity;
            const width = this.radius * (1 - i / this.trailCount) * 0.5;

            ctx.globalAlpha = alpha;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(seg.x, seg.y);
            ctx.lineTo(seg2.x, seg2.y);
            ctx.stroke();
        }
    }
    
    drawBullet(ctx) {
        // Calculate opacity with fade effect for crescent slice bullets
        let opacity = this.life;
        if (this.movementPattern === 'crescent_slice' && this.maxLife) {
            // Create smooth fade from full opacity to 0 over the bullet's lifetime
            const ageRatio = (frameClock.now - this.creationTime) / (this.maxLife * 1000);
            opacity = Math.max(0, 1 - ageRatio);
        }

        // Fade in quickly (first 180ms) + smooth fade out (remap life 1→0.5 to opacity 1→0)
        if (!this.isPersistent && this.creationTime) {
            const age = frameClock.now - this.creationTime;
            const fadeIn = Math.min(1.0, age / 180);
            // Remap life from [0.5, 1.0] → [0, 1] so bullet reaches zero opacity at deactivation
            const fadeOut = Math.max(0, (opacity - 0.5) * 2.0);
            opacity = Math.min(fadeIn, fadeOut);
        }

        // Shrink bullet during final 40% of its visible life
        // life goes 1.0→0.5; remap so shrink starts at life=0.7 (fadeOut≤0.4)
        const fadeOut = Math.max(0, (this.life - 0.5) * 2.0);
        const shrink = fadeOut < 0.4 && !this.isPersistent
            ? 0.3 + 0.7 * (fadeOut / 0.4)   // scale 0.3→1.0
            : 1.0;

        ctx.globalAlpha = opacity;
        ctx.translate(this.x, this.y);
        ctx.scale(shrink, shrink);
        ctx.rotate(this.rotation);
        
        if (this.explosive) {
            this.drawExplosiveBullet(ctx);
        } else {
            this.drawRegularBullet(ctx);
        }
    }
    
    drawRegularBullet(ctx) {
        // Route to shape-specific renderers
        if (this.shape === 'triangle')      { this.drawTriangleBullet(ctx);  return; }
        if (this.shape === 'square')        { this.drawSquareBullet(ctx);    return; }
        if (this.shape === 'needle')        { this.drawNeedleBullet(ctx);    return; }
        if (this.shape === 'mine')          { this.drawMineBullet(ctx);      return; }
        if (this.shape === 'missile_shape') { this.drawMissileShape(ctx);    return; }
        if (this.shape === 'hexagon')       { this.drawHexagonBullet(ctx);   return; }

        // Default: crisp circle bullet — no glow halo
        // Core bullet
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Bright inner core
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.9 * this.life;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawExplosiveBullet(ctx) {
        // Crisp explosive bullet — no glow halo
        const pulse = Math.sin(frameClock.now / 100) * 0.4 + 0.8;

        // Spinning spikes
        ctx.globalAlpha = this.life;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const innerRadius = this.radius * 0.6;
            const outerRadius = this.radius * (1 + pulse * 0.3);
            ctx.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
            ctx.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius);
        }
        ctx.stroke();

        // Solid core
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Bright center
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = pulse * this.life;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    explode(gameEngine) {
        if (!this.explosive) return;
        
        // Create explosion particles
        for (let i = 0; i < 15; i++) {
            if (gameEngine.particlePool) {
                const particle = gameEngine.particlePool.get(this.x, this.y, 'explosion');
                if (particle) {
                    particle.color = this.color;
                    particle.life = 0.8;
                }
            }
        }
        
        // No screen shake for enemy bullet explosions - only player-related events should shake
    }
    
    createDisappearEffect() {
        // Create small spray of particles in the same color as the bullet
        const gameEngine = this.gameEngine;
        if (!gameEngine || !gameEngine.particlePool) return;

        if (this.deathBurst) {
            // Stalker laser segments: vivid cyan burst with visible sparkle cloud
            const particleCount = 8 + Math.random() * 6; // 8–14 particles
            for (let i = 0; i < particleCount; i++) {
                const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
                if (particle) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 1.5 + Math.random() * 4;
                    particle.vel.x = Math.cos(angle) * speed;
                    particle.vel.y = Math.sin(angle) * speed;
                    particle.color = this.color;
                    particle.radius = 1.5 + Math.random() * 2.5;
                    particle.life = 20 + Math.random() * 25; // 20–45 frames
                    particle.friction = 0.93;
                }
            }
            return;
        }

        // Magic smoke puff — ring of sparkles that expand, slow, and fade
        const particleCount = 6 + Math.floor(Math.random() * 5); // 6-10 particles

        for (let i = 0; i < particleCount; i++) {
            const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
            if (!particle) continue;

            const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.4;
            const speed = 0.8 + Math.random() * 1.8;

            particle.vel.x = Math.cos(angle) * speed;
            particle.vel.y = Math.sin(angle) * speed;

            // Alternate between bullet color and a lighter tint for sparkle variety
            particle.color = Math.random() < 0.35 ? '#ffffff' : this.color;

            // Start larger, then friction makes them drift to a stop
            particle.radius = 1.0 + Math.random() * 2.0;
            particle.life = 18 + Math.random() * 14; // 18-32 frames
            particle.friction = 0.90; // Heavy drag — puff expands then hangs
        }
    }
    
    createExplosionEffect() {
        const gameEngine = this.gameEngine;
        if (!gameEngine || !gameEngine.particlePool) return;
        
        // Create larger explosion for titan missiles
        const particleCount = 12 + Math.random() * 8; // 12-20 particles
        
        for (let i = 0; i < particleCount; i++) {
            const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
            if (particle) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 6;
                
                particle.vel.x = Math.cos(angle) * speed;
                particle.vel.y = Math.sin(angle) * speed;
                particle.color = '#8A2BE2'; // Purple explosion
                particle.radius = 1 + Math.random() * 3;
                particle.life = 30 + Math.random() * 30;
                particle.friction = 0.92;
            }
        }
        
        // Add explosion pulse
        const explosionPulse = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', this.radius * 4);
        if (explosionPulse) {
            explosionPulse.color = '#8A2BE2';
        }
    }
    
    // ── Triangle bullet (Hunter) ─────────────────────────────────────────────
    // ctx is already rotated so that +X axis = travel direction
    drawTriangleBullet(ctx) {
        const r = this.radius;
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(r * 1.1, 0);
        ctx.lineTo(-r * 0.65, -r * 0.85);
        ctx.lineTo(-r * 0.65, r * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // ── Square bullet (Guardian) ─────────────────────────────────────────────
    drawSquareBullet(ctx) {
        const r = this.radius;
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.rect(-r, -r, r * 2, r * 2);
        ctx.fill();
        ctx.stroke();

        // Bright center
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.6 * this.life;
        ctx.beginPath();
        ctx.rect(-r * 0.35, -r * 0.35, r * 0.7, r * 0.7);
        ctx.fill();
    }

    // ── Needle bullet (Wasp) ─────────────────────────────────────────────────
    // ctx is rotated so +X = travel direction; draws an elongated needle
    drawNeedleBullet(ctx) {
        const len = this.radius * 5.5;
        const w   = this.radius * 0.25;

        // Core needle — crisp, no glow envelope
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, len * 0.85, w, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bright spine
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.85 * this.life;
        ctx.beginPath();
        ctx.ellipse(0, 0, len * 0.55, w * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Mine bullet (Tangerine/Bomber) ───────────────────────────────────────
    drawMineBullet(ctx) {
        const pulse = 0.75 + Math.sin(frameClock.now * 0.006) * 0.25;
        const r = this.radius;

        // Inner body — crisp, no glow halo
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#ffaa44';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Spikes
        const innerR = r * 0.55;
        const outerR = r * 1.05;
        ctx.strokeStyle = '#ffcc44';
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + this.rotation;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
            ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
            ctx.stroke();
        }

        // Center warning dot
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = pulse * 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
    }

    drawHexagonBullet(ctx) {
        const r = this.radius;
        // Hexagon body — crisp, no glow
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            if (i === 0) ctx.moveTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
            else         ctx.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Bright inner core
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.85 * this.life;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
    }

    drawMissileShape(ctx) {
        // Elongated missile — crisp, no glow halo
        const r = this.radius;
        ctx.globalAlpha = this.life;

        // ── Main body with rounded nose ───────────────────────────────────────
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-r * 1.15, -r * 0.42);  // top-rear
        ctx.lineTo( r * 0.55, -r * 0.42);  // top-front
        ctx.arc(r * 0.55, 0, r * 0.42, -Math.PI / 2, Math.PI / 2); // rounded nose cap
        ctx.lineTo(-r * 1.15,  r * 0.42);  // bottom-front to rear
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Nose highlight
        ctx.fillStyle = 'rgba(255, 200, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(r * 0.68, -r * 0.11, r * 0.17, 0, Math.PI * 2);
        ctx.fill();

        // ── Swept fins ────────────────────────────────────────────────────────
        ctx.fillStyle = this.color;
        ctx.strokeStyle = 'rgba(180, 100, 255, 0.85)';
        ctx.lineWidth = 1;
        // Upper swept fin
        ctx.beginPath();
        ctx.moveTo(-r * 0.12, -r * 0.42);
        ctx.lineTo(-r * 0.92, -r * 1.18);
        ctx.lineTo(-r * 1.2,  -r * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Lower swept fin (mirror)
        ctx.beginPath();
        ctx.moveTo(-r * 0.12,  r * 0.42);
        ctx.lineTo(-r * 0.92,  r * 1.18);
        ctx.lineTo(-r * 1.2,   r * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ── Engine exhaust glow ───────────────────────────────────────────────
        const exhaust = ctx.createRadialGradient(-r * 0.9, 0, 0, -r * 0.9, 0, r * 0.58);
        exhaust.addColorStop(0,    '#ffffff');
        exhaust.addColorStop(0.25, '#ff8800');
        exhaust.addColorStop(0.65, '#ff2200');
        exhaust.addColorStop(1,    'rgba(200,0,0,0)');
        ctx.fillStyle = exhaust;
        ctx.globalAlpha = this.life * 0.92;
        ctx.beginPath();
        ctx.ellipse(-r * 0.9, 0, r * 0.58, r * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = this.life;
    }

    checkCollision(target) {
        if (!this.active || !target.active) return false;

        const dx = this.x - target.x;
        const dy = this.y - target.y;
        const distance = Math.hypot(dx, dy);
        const collisionRadius = this.radius + (target.radius || 10);

        return distance < collisionRadius;
    }
} 