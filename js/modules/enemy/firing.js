// ── Enemy Firing System ──────────────────────────────────────────────────────
// Extracted from entities/enemy.js — all shooting/firing methods.
//
// Pattern: each function is called with `.call(enemyInstance, ...)` so `this`
// refers to the Enemy object.  Internal calls like `this.createEnemyBullet()`
// route through the one-liner delegators back on Enemy, keeping the same API.
// ─────────────────────────────────────────────────────────────────────────────

import { GAME_CONFIG, ENEMY_BULLET_CONFIG } from '../core/constants.js';
import { frameClock } from '../core/frame-clock.js';

// ── Burst Shooting State Machine ─────────────────────────────────────────────

export function handleBurstShooting(gameEngine, now) {
    // Check if we're in cooldown
    if (now < this.burstState.cooldownUntil) {
        return;
    }

    // Start new burst if not active
    if (!this.burstState.active) {
        this.burstState.active = true;
        if (this.config.shootPattern === 'burst_3') {
            this.burstState.shotsRemaining = 3;
            this.burstState.shotDelay = 150;
        } else if (this.config.shootPattern === 'burst_2') {
            this.burstState.shotsRemaining = 2;
            this.burstState.shotDelay = 200;
        } else if (this.config.shootPattern === 'square_burst') {
            this.burstState.shotsRemaining = 3;
            this.burstState.shotDelay = 180;
        } else {
            this.burstState.shotsRemaining = 4;
            this.burstState.shotDelay = 100;
        }
        this.burstState.lastBurstShot = 0;
    }

    // Fire shots in burst
    if (this.burstState.shotsRemaining > 0 && now - this.burstState.lastBurstShot > this.burstState.shotDelay) {
        this.shoot(gameEngine);
        this.burstState.shotsRemaining--;
        this.burstState.lastBurstShot = now;

        // End burst and start cooldown
        if (this.burstState.shotsRemaining <= 0) {
            this.burstState.active = false;
            if (this.config.shootPattern === 'burst_3') {
                this.burstState.cooldownUntil = now + 2000;
            } else if (this.config.shootPattern === 'burst_2') {
                this.burstState.cooldownUntil = now + 1800;
            } else if (this.config.shootPattern === 'square_burst') {
                this.burstState.cooldownUntil = now + 4000; // 4s cooldown for guardians
            } else {
                this.burstState.cooldownUntil = now + 1500;
            }
        }
    }
}

// ── Main Shoot Dispatcher ────────────────────────────────────────────────────

export function shoot(gameEngine) {
    // Only shoot at the player
    if (!this.targetPlayer) return;

    const targetX = this.targetPlayer.x;
    const targetY = this.targetPlayer.y;

    // Stamp the active shootPattern on the engine so EnemyBullet.reset()
    // can tag spawned bullets with it. Cleared in the finally so subsequent
    // non-shoot bullet spawns don't inherit a stale tag.
    gameEngine._activeShotPattern = this.config.shootPattern;
    try {

    switch (this.config.shootPattern) {
        case 'hunter_single':
            this.shootBurst3(gameEngine, targetX, targetY);
            break;
        case 'guardian_spread':
            this.shootGuardianSpread(gameEngine, targetX, targetY);
            break;
        case 'burst_3':
            this.shootBurst3(gameEngine, targetX, targetY);
            break;
        case 'burst_2':
            this.shootBurst2(gameEngine, targetX, targetY);
            break;
        case 'lay_mine':
            this.layMine(gameEngine, targetX, targetY);
            break;
        case 'spiral_laser':
            this.shootSpiralLaser(gameEngine);
            break;
        case 'sweep_laser':
            // handled by updateSweepLaserSystem
            break;
        case 'line_4':
            this.shootLine4(gameEngine, targetX, targetY);
            break;
        case 'circle_6':
            this.shootCircle6(gameEngine, targetX, targetY);
            break;
        case 'homing':
            this.shootHoming(gameEngine, targetX, targetY);
            break;
        case 'titan_rocket':
            this.shootTitanRocket(gameEngine, targetX, targetY);
            break;
        case 'charged_laser':
            this.shootChargedLaser(gameEngine, targetX, targetY);
            break;
        case 'crescent_wave':
            this.shootCrescentWave(gameEngine, targetX, targetY);
            break;
        // Keep existing patterns for other enemies
        case 'spread':
            this.shootSpread(gameEngine, targetX, targetY);
            break;
        case 'laser':
            this.shootLaser(gameEngine, targetX, targetY);
            break;
        case 'arc_lightning':
            this.shootArcLightning(gameEngine, targetX, targetY);
            break;
        case 'missile':
            this.shootMissile(gameEngine, targetX, targetY);
            break;
        case 'pulse':
            this.shootPulse(gameEngine, targetX, targetY);
            break;
        case 'shield_burst':
            this.shootShieldBurst(gameEngine, targetX, targetY);
            break;
        case 'sentinel_sweep':
            // handled by updateSentinelSweep()
            break;
        default:
            this.shootAimed(gameEngine, targetX, targetY);
            break;
    }

    } finally {
        gameEngine._activeShotPattern = null;
    }
}

// ── Check if enemy is a stationary turret ────────────────────────────────────

export function isStationary() {
    return this.config.movePattern === 'stationary' ||
           this.type === 'PROWLER';
}

// ── Basic Shooting Patterns ──────────────────────────────────────────────────

export function shootAimed(gameEngine, targetX, targetY) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const angle = Math.atan2(dy, dx);
    // faceAngle is smoothly updated by updateFaceDirection() — no snap here
    this.createEnemyBullet(gameEngine, angle, 3, this.color, false, 'aimed');
}

export function shootSpread(gameEngine, targetX, targetY) {
    const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);

    // Single bullet with spreading movement pattern
    this.createEnemyBullet(gameEngine, baseAngle, 2.5, this.color, false, 'spread');
}

export function shootRapid(gameEngine, targetX, targetY) {
    const angle = Math.atan2(targetY - this.y, targetX - this.x);

    // Single bullet with rapid/erratic movement pattern
    this.createEnemyBullet(gameEngine, angle, 4, this.color, false, 'rapid');
}

export function shootSpiral(gameEngine, targetX, targetY) {
    if (!this.spiralAngle) this.spiralAngle = 0;
    this.spiralAngle += 0.3;

    // Single bullet with spiral movement pattern
    this.createEnemyBullet(gameEngine, this.spiralAngle, 2, this.color, false, 'spiral');
}

export function shootBurst(gameEngine, targetX, targetY) {
    const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);

    // Single bullet with burst/explosive movement pattern
    this.createEnemyBullet(gameEngine, baseAngle, 2, this.color, false, 'burst');
}

export function shootExplosive(gameEngine, targetX, targetY) {
    const angle = Math.atan2(targetY - this.y, targetX - this.x);

    // Single explosive bullet with unique movement pattern
    this.createEnemyBullet(gameEngine, angle, 2.5, this.color, true, 'explosive');
}

// ── Laser Charging & Firing ──────────────────────────────────────────────────

export function shootLaser(gameEngine, targetX, targetY) {
    // Initialize laser charging state
    if (!this.laserCharge) {
        this.laserCharge = 0;
        this.laserCharging = false;
        this.laserCooldown = 0;
        this.laserTargetAngle = 0;
    }

    const now = frameClock.now;

    // Handle cooldown after firing
    if (this.laserCooldown > now) {
        return;
    }

    if (!this.laserCharging) {
        // Start charging
        this.laserCharging = true;
        this.laserChargeStartTime = now;
        this.laserTargetAngle = Math.atan2(targetY - this.y, targetX - this.x);
    }

    const chargeTime = now - this.laserChargeStartTime;
    const maxChargeTime = 1500; // 1.5 seconds to charge - faster and more aggressive
    this.laserCharge = Math.min(1, chargeTime / maxChargeTime);

    // Charging particle effects removed - now only player has them
    // if (this.laserCharging && this.laserCharge < 1) {
    //     this.createLaserChargingEffect(gameEngine);
    // }

    if (this.laserCharge >= 1) {
        // Fire wide screen-spanning laser beam
        this.createWideLaserBeam(gameEngine, this.laserTargetAngle);

        // Reset charging and set cooldown
        this.laserCharging = false;
        this.laserCharge = 0;
        this.laserCooldown = now + 2000; // 2 second cooldown - more aggressive
    }
}

export function createLaserChargingEffect(gameEngine) {
    // Charging particle effects removed - now only player has them
    // This method is kept for compatibility but does nothing
    return;
}

// ── Arc Lightning (Drifter) ──────────────────────────────────────────────────
// Charges up then fires a jagged cyan lightning bolt toward the player.
// Reuses laserCharge/laserCharging/laserTargetAngle so existing draw
// methods (drawLaserTargetingLine, drawLaserChargingBall) still work.

export function shootArcLightning(gameEngine, targetX, targetY) {
    if (this.laserCharge === undefined) {
        this.laserCharge = 0;
        this.laserCharging = false;
        this.laserCooldown = 0;
        this.laserTargetAngle = 0;
        this.lightningTargetX = 0;
        this.lightningTargetY = 0;
    }

    const now = frameClock.now;
    if (this.laserCooldown > now) return;

    if (!this.laserCharging) {
        this.laserCharging = true;
        this.laserChargeStartTime = now;
        this.laserTargetAngle = Math.atan2(targetY - this.y, targetX - this.x);
        this.lightningTargetX = targetX;
        this.lightningTargetY = targetY;
    }

    const maxChargeTime = 1200; // ms
    this.laserCharge = Math.min(1, (now - this.laserChargeStartTime) / maxChargeTime);

    if (this.laserCharge >= 1) {
        this.createArcLightningBolt(gameEngine, this.lightningTargetX, this.lightningTargetY);
        this.laserCharging = false;
        this.laserCharge = 0;
        this.laserCooldown = now + 1600;
    }
}

// ── Fractal Lightning (Drifter) ──────────────────────────────────────────────
// Builds a recursive midpoint-displacement bolt path, generates branches,
// stores everything on `this.lightningBolt` for drawLightningBolt(), and
// drops a handful of zero-velocity bullets along the main spine for damage.

export function createArcLightningBolt(gameEngine, targetX, targetY) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const totalDist = Math.hypot(dx, dy);
    if (totalDist < 1) return;

    // ── Build fractal main-bolt path ──────────────────────────────────
    const mainPath = this.buildLightningPath(
        this.x, this.y, targetX, targetY, 5  // 5 iterations → 2^5 = 32 segments
    );

    // ── Build branches off random points along the first 70% of the bolt ─
    const branches = [];
    const numBranches = 2 + Math.floor(Math.random() * 3); // 2-4
    for (let b = 0; b < numBranches; b++) {
        const startIdx = Math.floor(mainPath.length * (0.12 + Math.random() * 0.58));
        const origin   = mainPath[startIdx];
        const mainAngle = Math.atan2(dy, dx);
        const branchAngle  = mainAngle + (Math.random() - 0.5) * Math.PI * 0.9;
        const branchLength = totalDist * (0.18 + Math.random() * 0.32);
        const branchPath = this.buildLightningPath(
            origin.x, origin.y,
            origin.x + Math.cos(branchAngle) * branchLength,
            origin.y + Math.sin(branchAngle) * branchLength,
            3  // 3 iterations → 8 segments per branch
        );
        branches.push({ path: branchPath, depth: 1 });

        // Occasional sub-branch off a branch
        if (Math.random() < 0.55) {
            const si = Math.floor(branchPath.length * (0.3 + Math.random() * 0.4));
            const so = branchPath[si];
            const subAngle  = branchAngle + (Math.random() - 0.5) * Math.PI * 0.7;
            const subLength = branchLength * (0.25 + Math.random() * 0.3);
            const subPath = this.buildLightningPath(
                so.x, so.y,
                so.x + Math.cos(subAngle) * subLength,
                so.y + Math.sin(subAngle) * subLength,
                2
            );
            branches.push({ path: subPath, depth: 2 });
        }
    }

    // ── Store for canvas rendering ────────────────────────────────────
    this.lightningBolt = {
        mainPath,
        branches,
        startTime: frameClock.now,
        lifetime: 460  // ms total display duration
    };

    // ── Damage bullets along main spine (every 5th point) ────────────
    if (gameEngine?.enemyBulletPool) {
        const step = Math.max(1, Math.floor(mainPath.length / 8));
        for (let i = 0; i < mainPath.length; i += step) {
            const pt = mainPath[i];
            const b = gameEngine.enemyBulletPool.get();
            if (b) {
                // Slight random drift so orbs feel organic
                const driftAngle = Math.random() * Math.PI * 2;
                const driftSpeed = 0.15 + Math.random() * 0.25;
                b.reset(pt.x, pt.y,
                    Math.cos(driftAngle) * driftSpeed,
                    Math.sin(driftAngle) * driftSpeed,
                    '#44ffff', false);
                b.radius = 4 + Math.random() * 2;
                b.glowRadius = 10;
                b.damage = this.getLevelScaledDamage(2);
                b.isPersistent = true;
                b.maxLifetimeOverride = 1000 + Math.random() * 500; // 1–1.5s
                b.life = 1.0;
            }
        }
    }

    // ── Impact sparks ─────────────────────────────────────────────────
    if (gameEngine?.particlePool) {
        for (let i = 0; i < 14; i++) {
            const p = gameEngine.particlePool.get(targetX, targetY, 'starSparkle');
            if (p) {
                const a = Math.random() * Math.PI * 2;
                const s = 2 + Math.random() * 6;
                p.vel.x = Math.cos(a) * s;
                p.vel.y = Math.sin(a) * s;
                p.color = '#88ffff';
                p.radius = 1.5 + Math.random() * 3;
                p.life   = 18 + Math.random() * 20;
            }
        }
    }
}

// Iterative midpoint-displacement: each pass halves segment lengths and
// displaces midpoints perpendicular to the original line.

export function buildLightningPath(x1, y1, x2, y2, iterations) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];

    const perpX = -dy / len;
    const perpY =  dx / len;

    let pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    let disp = len * 0.38;

    for (let iter = 0; iter < iterations; iter++) {
        const next = [pts[0]];
        for (let j = 1; j < pts.length; j++) {
            const mid = {
                x: (pts[j - 1].x + pts[j].x) * 0.5 + perpX * (Math.random() - 0.5) * disp,
                y: (pts[j - 1].y + pts[j].y) * 0.5 + perpY * (Math.random() - 0.5) * disp
            };
            next.push(mid, pts[j]);
        }
        pts  = next;
        disp *= 0.58;  // fractal roughness: smaller each pass
    }
    return pts;
}

// ── Wide Laser Beam ──────────────────────────────────────────────────────────

export function createWideLaserBeam(gameEngine, angle) {
    // Limit beam to ~1 screen length
    const screenWidth = gameEngine.canvas.width;
    const screenHeight = gameEngine.canvas.height;
    const avgScreenSize = (screenWidth + screenHeight) / 2;
    const beamLength = avgScreenSize * 0.8; // Limited to ~0.8 screen size
    const beamWidth = 80; // Wide beam

    // Create the main laser beam as a series of wide bullets
    const segments = Math.floor(beamLength / 20); // One segment every 20 pixels

    for (let i = 0; i < segments; i++) {
        const distance = i * 20;
        const x = this.x + Math.cos(angle) * distance;
        const y = this.y + Math.sin(angle) * distance;

        // Create multiple bullets across the width for wide beam effect
        const widthSegments = 8;
        for (let w = 0; w < widthSegments; w++) {
            const widthOffset = (w - widthSegments/2) * (beamWidth / widthSegments);
            const perpAngle = angle + Math.PI/2;
            const beamX = x + Math.cos(perpAngle) * widthOffset;
            const beamY = y + Math.sin(perpAngle) * widthOffset;

            // Create bullet at the calculated beam position
            const bullet = gameEngine.enemyBulletPool.get();
            if (bullet) {
                bullet.reset(
                    beamX,
                    beamY,
                    Math.cos(angle) * 15,
                    Math.sin(angle) * 15,
                    '#ff0000',
                    false
                );
                bullet.radius = 4;
                bullet.glowRadius = 12;
                bullet.damage = this.getLevelScaledDamage(3);
                bullet.movementPattern = 'laser_beam';
                bullet.life = 0.3;
            }
        }
    }

    // Create massive explosion effect at firing point
    for (let i = 0; i < 30; i++) {
        const flashAngle = angle + (Math.random() - 0.5) * 1.0;
        const particle = gameEngine.particlePool.get(this.x, this.y, 'explosion');
        if (particle) {
            particle.color = '#ff0000';
            particle.vel.x = Math.cos(flashAngle) * (5 + Math.random() * 8);
            particle.vel.y = Math.sin(flashAngle) * (5 + Math.random() * 8);
            particle.radius = 3 + Math.random() * 4;
        }
    }

    // Screen shake for powerful laser (only if on screen)
    if (gameEngine.isEntityOnScreen(this)) {
        gameEngine.triggerScreenShake(30, 20, 100);
    }
}

// ── Missile Patterns ─────────────────────────────────────────────────────────

export function shootMissile(gameEngine, targetX, targetY) {
    if (this.type === 'TITAN') {
        // Titan tank - purple accelerating missile fired from turret
        const turretAngle = this.tankTurretAngle || 0;

        // Fire straight from turret direction (accelerating missile) with very slow initial speed
        const titanConfig = ENEMY_BULLET_CONFIG.MISSILE.TITAN_TOMAHAWK;
        this.createEnemyBullet(gameEngine, turretAngle, titanConfig.INITIAL_SPEED, '#8A2BE2', true, 'titan_tonahawk', null);
    } else {
        // Prowler - fires missile in the direction the ship is facing
        const angle = this.faceAngle;
        const bullet = this.createEnemyBullet(gameEngine, angle, 12, '#cc44ff', true, 'missile_fast_slow');
        if (bullet) {
            // Spawn from the front of the ship
            const frontX = this.x + Math.cos(this.faceAngle) * this.radius;
            const frontY = this.y + Math.sin(this.faceAngle) * this.radius;
            bullet.x = frontX; bullet.y = frontY;
            bullet.startX = frontX; bullet.startY = frontY;
            bullet.shape = 'missile_shape';
            bullet.targetPlayer = this.targetPlayer;
            bullet.rotation = angle;
            bullet.rotationSpeed = 0;
            bullet.radius = 7;
            bullet.glowRadius = 14;
            bullet.color = '#cc44ff';
            bullet.damage = this.getLevelScaledDamage(3);
            bullet.maxLifetimeOverride = 8000;
        }
    }
}

// ── Pulse Pattern ────────────────────────────────────────────────────────────

export function shootPulse(gameEngine, targetX, targetY) {
    // Fire 3 rapid pulses toward target
    const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
    // faceAngle smoothly updated by updateFaceDirection() — no snap
    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            if (this.active) {
                this.createEnemyBullet(gameEngine, baseAngle, 4, '#ffff00', false, 'pulse');
            }
        }, i * 100);
    }
}

// ── Spiral Laser ─────────────────────────────────────────────────────────────

export function shootSpiralLaser(gameEngine) {
    // Fire a yellow laser in the current faceAngle — called while spinning during arc phase
    const bullet = this.createEnemyBullet(gameEngine, this.faceAngle, 6, '#ffff44', false, 'aimed');
    if (bullet) {
        bullet.radius = 3;
        bullet.glowRadius = 8;
        bullet.damage = this.getLevelScaledDamage(2);
    }
}

// ── Shield Burst ─────────────────────────────────────────────────────────────

export function shootShieldBurst(gameEngine, targetX, targetY) {
    // Fire 8 bullets in a 360° circle pattern
    const bulletCount = 8;
    const angleStep = (Math.PI * 2) / bulletCount; // 45 degrees between shots

    for (let i = 0; i < bulletCount; i++) {
        const angle = i * angleStep;
        this.createEnemyBullet(gameEngine, angle, 2.5, '#00ff00', false, 'shield_burst');
    }
}

// ── Burst Patterns ───────────────────────────────────────────────────────────

export function shootBurst3(gameEngine, targetX, targetY) {
    // Hunter - fires in the direction the ship is facing
    const angle = this.faceAngle;
    const bullet = this.createEnemyBullet(gameEngine, angle, 4, '#ff4444', false, 'aimed');
    if (bullet) {
        // Spawn from the front of the ship
        const frontX = this.x + Math.cos(this.faceAngle) * this.radius;
        const frontY = this.y + Math.sin(this.faceAngle) * this.radius;
        bullet.x = frontX; bullet.y = frontY;
        bullet.startX = frontX; bullet.startY = frontY;
        bullet.shape = 'triangle';
        bullet.rotation = angle; // Point in travel direction
        bullet.rotationSpeed = 0.1; // Spin as they fly
        bullet.radius = 7;
        bullet.glowRadius = 14;
        bullet.maxLifetimeOverride = 10000; // Long-range single shot — ~1120px
    }
}

export function shootBurst2(gameEngine, targetX, targetY) {
    // Legacy burst_2 — small random spread
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const baseAngle = Math.atan2(dy, dx);
    // faceAngle smoothly updated by updateFaceDirection() — no snap
    const spread = 0.15;
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    this.createEnemyBullet(gameEngine, angle, 3.5, this.color, false, 'aimed');
}

// ── Wasp Machine Gun ─────────────────────────────────────────────────────────

export function updateWaspMachineGun(gameEngine) {
    // 2-3s rapid fire, then 2-3s reload — self-managed state machine
    if (!this.targetPlayer) return;
    const now = frameClock.now;
    if (this.waspGunState === undefined) {
        this.waspGunState = 'firing';
        this.waspGunPhaseStart = now;
        this.waspGunPhaseDuration = 4000 + Math.random() * 1000; // 4-5s firing phase
        this.waspGunLastShot = 0;
        this.waspSinePhase = 0; // global phase tracker for coherent wave
    }
    // Advance global phase each call (~60fps) so it stays in sync with bullet sineFreq
    this.waspSinePhase = (this.waspSinePhase || 0) + 0.12;

    if (now - this.waspGunPhaseStart > this.waspGunPhaseDuration) {
        this.waspGunState = this.waspGunState === 'firing' ? 'charging' : 'firing';
        this.waspGunPhaseStart = now;
        // 4-5s firing, 2-3s reloading
        this.waspGunPhaseDuration = this.waspGunState === 'firing' ? 4000 + Math.random() * 1000 : 2000 + Math.random() * 1000;
    }
    if (this.waspGunState === 'firing' && now - this.waspGunLastShot > 520) {
        // Aim check before firing — 30° tolerance
        const aimDx = this.targetPlayer.x - this.x;
        const aimDy = this.targetPlayer.y - this.y;
        const toPlayer = Math.atan2(aimDy, aimDx);
        let aimDiff = toPlayer - this.faceAngle;
        while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
        while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
        if (Math.abs(aimDiff) <= Math.PI / 6) {
            this.shootWaspBullet(gameEngine, this.targetPlayer.x, this.targetPlayer.y);
        }
        this.waspGunLastShot = now;
    }
}

export function shootWaspBullet(gameEngine, targetX, targetY) {
    // Wasp - fires yellow circle in the direction the ship is facing
    const angle = this.faceAngle;
    const bullet = this.createEnemyBullet(gameEngine, angle, 6, '#ffff44', false, 'sine_wave_nospin');
    if (bullet) {
        // Spawn from the front of the ship
        const frontX = this.x + Math.cos(this.faceAngle) * this.radius;
        const frontY = this.y + Math.sin(this.faceAngle) * this.radius;
        bullet.x = frontX; bullet.y = frontY;
        bullet.startX = frontX; bullet.startY = frontY;
        bullet.shape = null; // circle (default)
        bullet.rotation = 0;
        bullet.rotationSpeed = 0;
        bullet.radius = 3.5;
        bullet.glowRadius = 6;
        bullet.color = '#ffff44';
        bullet.damage = this.getLevelScaledDamage(1);
        bullet.maxLifetimeOverride = 12000; // 2x extended range
        // Synchronized phase: all bullets from this wasp share the same phase
        bullet.sineAmp   = 2.2;
        bullet.sineFreq  = 0.12;
        bullet.sinePhase = this.waspSinePhase || 0;
        bullet.sinePerpX = -Math.sin(angle);
        bullet.sinePerpY =  Math.cos(angle);
    }
}

// ── Guardian Spread ──────────────────────────────────────────────────────────

export function shootGuardianSpread(gameEngine, targetX, targetY) {
    // Guardian - 5-bullet fan spread alternating between rectangles and triangles
    // Each volley fires the same shape; shapes alternate: 0=rectangle, 1=triangle
    // All bullets originate from the front face of the Guardian, firing in faceAngle direction
    const baseAngle = this.faceAngle;

    // Front spawn point (center of forward face)
    const frontX = this.x + Math.cos(baseAngle) * this.radius;
    const frontY = this.y + Math.sin(baseAngle) * this.radius;

    // Advance the shared sinusoidal phase each volley so successive volleys stay coherent
    if (this.guardianSinePhase === undefined) this.guardianSinePhase = 0;
    this.guardianSinePhase += 0.45;

    // Track which volley we're on (even = rectangle/square, odd = triangle)
    if (this.guardianVolleyIndex === undefined) this.guardianVolleyIndex = 0;
    const shape = (this.guardianVolleyIndex % 2 === 0) ? 'square' : 'triangle';
    this.guardianVolleyIndex++;

    const offsets = [-0.5, -0.25, 0, 0.25, 0.5];
    for (const offset of offsets) {
        const angle = baseAngle + offset;
        const bullet = this.createEnemyBullet(gameEngine, angle, 4.5, '#44ff44', false, 'sine_wave_nospin');
        if (bullet) {
            // Override spawn to come from the front face
            bullet.x = frontX;
            bullet.y = frontY;
            bullet.startX = frontX;
            bullet.startY = frontY;
            bullet.shape = shape;
            bullet.rotation = angle;
            bullet.rotationSpeed = 0;    // no spin
            bullet.radius = 6;
            bullet.glowRadius = 12;
            bullet.color = '#44ff44';
            bullet.damage = this.getLevelScaledDamage(2);
            bullet.maxLifetimeOverride = 5000;
            bullet.sineAmp   = 2.5;
            bullet.sineFreq  = 0.10;
            bullet.sinePhase = this.guardianSinePhase; // same phase for all = in-phase wave
            bullet.sinePerpX = -Math.sin(angle);
            bullet.sinePerpY =  Math.cos(angle);
        }
    }
}

// ── Mine Laying ──────────────────────────────────────────────────────────────

export function layMine(gameEngine, targetX, targetY) {
    // Tangerine/Bomber - drop a homing proximity mine that slowly crawls toward the player
    if (!gameEngine.enemyBulletPool) return;
    const mine = gameEngine.enemyBulletPool.get();
    if (!mine) return;
    mine.reset(this.x, this.y, 0, 0, '#ff8844', false);
    mine.shape = 'mine';
    mine.isPersistent = true;
    mine.maxLifetimeOverride = 60000; // 60-second lifetime
    mine.radius = 12;
    mine.glowRadius = 22;
    mine.damage = this.getLevelScaledDamage(4);
    mine.movementPattern = 'homing_mine'; // slowly crawl toward player
    mine.rotation = Math.random() * Math.PI * 2;
    mine.rotationSpeed = 0.015;
    mine.targetPlayer = this.targetPlayer;
    // Health scales with Tangerine level
    const baseHealth = 5;
    mine.maxHealth = Math.floor(baseHealth * (1 + (this.level - 1) * 0.25));
    mine.health = mine.maxHealth;
    // Signal bomber to briefly stop after laying this mine
    this.mineJustLaid = frameClock.now;
}

// ── Line & Circle Patterns ───────────────────────────────────────────────────

export function shootLine4(gameEngine, targetX, targetY) {
    // Yellow squares - horizontal plane of 4 shots
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const baseAngle = Math.atan2(dy, dx);

    // Create 4 shots in a horizontal spread
    const spreadAngle = Math.PI / 8; // 22.5 degrees spread between shots
    const angles = [
        baseAngle - spreadAngle * 1.5,  // Far left
        baseAngle - spreadAngle * 0.5,  // Left
        baseAngle + spreadAngle * 0.5,  // Right
        baseAngle + spreadAngle * 1.5   // Far right
    ];

    // Fire all 4 shots simultaneously
    angles.forEach(angle => {
        this.createEnemyBullet(gameEngine, angle, 3.5, '#ffff44', false, 'aimed');
    });
}

export function shootCircle6(gameEngine, targetX, targetY) {
    // Titans - fire 6 shots in a circle
    const angleStep = (Math.PI * 2) / 6; // 60 degrees between shots

    for (let i = 0; i < 6; i++) {
        const angle = i * angleStep;
        this.createEnemyBullet(gameEngine, angle, 2.5, '#ff44ff', false, 'aimed');
    }
}

// ── Homing & Rocket Patterns ─────────────────────────────────────────────────

export function shootHoming(gameEngine, targetX, targetY) {
    // Bombers - slow homing shot
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const angle = Math.atan2(dy, dx);

    this.createEnemyBullet(gameEngine, angle, 1.5, '#ff8844', false, 'homing', this.targetPlayer);
}

export function shootTitanRocket(gameEngine, targetX, targetY) {
    // Titan tank - fast direct rockets
    const turretAngle = this.tankTurretAngle || 0;

    // Fire fast rocket directly at player
    this.createEnemyBullet(gameEngine, turretAngle, ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET.SPEED, '#ff44ff', false, 'titan_rocket', null);
}

// ── Charged Laser & Laser Beam ───────────────────────────────────────────────

export function shootChargedLaser(gameEngine, targetX, targetY) {
    // STALKER - fires laser in the direction the ship is facing
    this.createLaserBeam(gameEngine, this.faceAngle);
}

export function createLaserBeam(gameEngine, angle) {
    if (!gameEngine) return;

    // Create close-range laser slice
    const beamLength = 150; // Close-range slice (half screen)
    const beamWidth = 30; // Narrower beam for close-range attack
    const segments = 8; // Number of beam segments for visual effect

    // Spawn from the front of the ship (faceAngle direction)
    const startX = this.x + Math.cos(this.faceAngle) * this.radius;
    const startY = this.y + Math.sin(this.faceAngle) * this.radius;
    const endX = startX + Math.cos(angle) * beamLength;
    const endY = startY + Math.sin(angle) * beamLength;

    // Create multiple laser segments for wide beam effect
    for (let i = 0; i < segments; i++) {
        const offsetAngle = angle + (Math.PI / 2); // Perpendicular to beam direction
        const offset = (i - segments / 2) * (beamWidth / segments);
        const segmentStartX = startX + Math.cos(offsetAngle) * offset;
        const segmentStartY = startY + Math.sin(offsetAngle) * offset;
        const segmentEndX = endX + Math.cos(offsetAngle) * offset;
        const segmentEndY = endY + Math.sin(offsetAngle) * offset;

        // Create laser bullet for each segment
        const laserBullet = gameEngine.enemyBulletPool.get();
        if (laserBullet) {
            laserBullet.reset(
                segmentStartX,
                segmentStartY,
                Math.cos(angle) * 4, // Much slower speed for better gameplay
                Math.sin(angle) * 4,
                '#44ffff', // Cyan laser color
                false
            );

            laserBullet.radius = 2 + Math.abs(offset) * 0.05; // Thinner for close-range
            laserBullet.glowRadius = 6 + Math.abs(offset) * 0.1;
            laserBullet.damage = this.getLevelScaledDamage(3); // Moderate damage for close-range
            laserBullet.movementPattern = 'laser_beam';
            laserBullet.deathBurst = true; // Fade and burst with particles on expire
        }
    }

    // Create particle effects at firing point
    if (gameEngine.particlePool) {
        for (let i = 0; i < 15; i++) {
            const particle = gameEngine.particlePool.get(startX, startY, 'starSparkle');
            if (particle) {
                const particleAngle = angle + (Math.random() - 0.5) * 0.5;
                const speed = 2 + Math.random() * 4;
                particle.vel.x = Math.cos(particleAngle) * speed;
                particle.vel.y = Math.sin(particleAngle) * speed;
                particle.color = '#44ffff';
                particle.radius = 1 + Math.random() * 2;
                particle.life = 20 + Math.random() * 20;
            }
        }
    }

    // No screen shake for enemy attacks - only player-related events should shake
}

// ── Crescent Wave (Guardian) ─────────────────────────────────────────────────

export function shootCrescentWave(gameEngine, targetX, targetY) {
    // GUARDIAN - crescent energy beam like Stalker's laser but curved
    const baseAngle = Math.atan2(targetY - this.y, targetX - this.x);
    // faceAngle smoothly updated by updateFaceDirection() — no snap
    this.createCrescentBeam(gameEngine, baseAngle);
}

export function createCrescentBeam(gameEngine, baseAngle) {
    if (!gameEngine) return;

    // Crescent beam parameters
    const beamLength = 200; // Close-range crescent (half screen)
    const waveSpread = Math.PI * 0.6; // 108 degrees total spread
    const beamSegments = 12; // Number of beam rays in the crescent (reduced from 15)
    const beamThickness = 2; // Parallel rays per beam segment for thickness (reduced from 3)

    const startX = this.x + Math.cos(baseAngle) * this.radius;
    const startY = this.y + Math.sin(baseAngle) * this.radius;

    // Create crescent slice - all bullets travel parallel in same direction
    const crescentWidth = 120; // Width of the crescent formation
    const travelDirection = baseAngle; // All bullets travel toward target
    const perpAngle = baseAngle + Math.PI / 2; // Perpendicular to travel direction

    for (let i = 0; i < beamSegments; i++) {
        const progress = i / (beamSegments - 1); // 0 to 1

        // Position along the crescent arc (perpendicular to travel direction)
        const crescentOffset = (progress - 0.5) * crescentWidth;

        // Create curved crescent shape using sine function
        const curveHeight = Math.sin(progress * Math.PI) * 25; // Curve depth

        // Calculate starting position for this segment
        const segmentStartX = this.x + Math.cos(perpAngle) * crescentOffset + Math.cos(travelDirection) * (this.radius + curveHeight);
        const segmentStartY = this.y + Math.sin(perpAngle) * crescentOffset + Math.sin(travelDirection) * (this.radius + curveHeight);

        // Create multiple parallel bullets for beam thickness
        for (let thickness = 0; thickness < beamThickness; thickness++) {
            const thicknessOffset = (thickness - beamThickness / 2) * 6; // Spacing between parallel rays

            const rayStartX = segmentStartX + Math.cos(perpAngle) * thicknessOffset;
            const rayStartY = segmentStartY + Math.sin(perpAngle) * thicknessOffset;

            // Create laser bullet for this ray segment
            const laserBullet = gameEngine.enemyBulletPool.get();
            if (laserBullet) {
                laserBullet.reset(
                    rayStartX,
                    rayStartY,
                    Math.cos(travelDirection) * (6 * 0.7 * (1 + Math.min(0.4, (this.level - 1) * 0.08))), // Apply same speed scaling as other bullets
                    Math.sin(travelDirection) * (6 * 0.7 * (1 + Math.min(0.4, (this.level - 1) * 0.08))),
                    '#44ff44', // Green energy color
                    false
                );

                // Laser beam properties - thicker in middle of crescent
                const distanceFromCenter = Math.abs(progress - 0.5);
                laserBullet.radius = 3 - distanceFromCenter * 1.5; // Thicker in center
                laserBullet.glowRadius = 10 - distanceFromCenter * 3;
                laserBullet.damage = this.getLevelScaledDamage(2); // Reduced from 5 to 2 - much lower damage
                laserBullet.movementPattern = 'crescent_slice';
                laserBullet.life = 0.15; // Reduced from 0.25 for ~1 screen range
                laserBullet.maxLife = 0.15; // Store max life for opacity calculations

                // Store beam properties
                laserBullet.beamProgress = progress;
                laserBullet.crescentOffset = crescentOffset;
                laserBullet.beamBaseAngle = baseAngle;
            }
        }
    }

    // Create dramatic launch effect at Guardian
    if (gameEngine.particlePool) {
        for (let i = 0; i < 15; i++) {
            const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
            if (particle) {
                const particleAngle = baseAngle + (Math.random() - 0.5) * waveSpread * 1.3;
                const speed = 3 + Math.random() * 6;
                particle.vel.x = Math.cos(particleAngle) * speed;
                particle.vel.y = Math.sin(particleAngle) * speed;
                particle.color = '#44ff44'; // Green energy color
                particle.radius = 1 + Math.random() * 3;
                particle.life = 25 + Math.random() * 30;
            }
        }

        // Add energy burst rings
        for (let ring = 0; ring < 3; ring++) {
            const ringParticle = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', 20 + ring * 15);
            if (ringParticle) {
                ringParticle.color = '#44ff44';
                ringParticle.life = 0.6; // Slightly longer for dramatic effect
            }
        }
    }

    // No screen shake for enemy attacks - only player-related events should shake
}

// ── Core Bullet Factory ──────────────────────────────────────────────────────

export function createEnemyBullet(gameEngine, angle, speed, color, explosive = false, movementPattern = 'aimed', target = null) {
    if (!gameEngine.enemyBulletPool) return null;

    // Accuracy jitter — low-level enemies aim poorly (up to ±0.35 rad at level 1, 0 at level 5+)
    const aimJitter = Math.max(0, 0.35 * (1 - (this.level - 1) / 4));
    if (aimJitter > 0) {
        angle += (Math.random() - 0.5) * 2 * aimJitter;
    }

    // Apply level scaling to bullet speed using constants
    // Titan rockets are exempt from global speed reduction for better effectiveness
    const isTitanRocket = movementPattern === 'titan_rocket';
    const baseSpeedMultiplier = isTitanRocket ? 1.0 : ENEMY_BULLET_CONFIG.BASE_SPEED_MULTIPLIER;
    const levelSpeedBonus = Math.min(
        ENEMY_BULLET_CONFIG.MAX_LEVEL_SPEED_BONUS,
        (this.level - 1) * ENEMY_BULLET_CONFIG.LEVEL_SPEED_BONUS_PER_LEVEL
    );
    let scaledSpeed = speed * baseSpeedMultiplier * (1 + levelSpeedBonus);

    // Apply speed limits based on bullet type
    const speedLimits = ENEMY_BULLET_CONFIG.SPEED_LIMITS[movementPattern.toUpperCase()];
    if (speedLimits) {
        scaledSpeed = Math.max(speedLimits.MIN, Math.min(speedLimits.MAX, scaledSpeed));
    }

    const bullet = gameEngine.enemyBulletPool.get();
    if (bullet) {
        bullet.reset(
            this.x + Math.cos(angle) * this.radius,
            this.y + Math.sin(angle) * this.radius,
            Math.cos(angle) * scaledSpeed,
            Math.sin(angle) * scaledSpeed,
            color,
            explosive
        );

        // Set level-scaled damage (scaled back down)
        const baseDamage = explosive ? 3 : 2;
        bullet.damage = this.getLevelScaledDamage(baseDamage);

        // Make titan rockets fast and powerful
        if (movementPattern === 'titan_rocket') {
            bullet.radius = 5; // Medium-large rockets
            bullet.glowRadius = 10; // Strong glow effect
            bullet.damage = this.getLevelScaledDamage(ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET.DAMAGE);

            // Set rocket properties from constants
            const rocketConfig = ENEMY_BULLET_CONFIG.MISSILE.TITAN_ROCKET;
            bullet.maxDistance = rocketConfig.MAX_DISTANCE;
            bullet.rocketSpeed = rocketConfig.SPEED;
        }

        // Make laser bullets more visible and powerful
        if (movementPattern === 'laser') {
            bullet.radius = 5; // Larger laser bullets
            bullet.glowRadius = 15; // Strong glow effect
            bullet.damage = this.getLevelScaledDamage(2); // Reduced from 8 to 2 - much lower damage
            bullet.life = 0.4; // Reduced from 0.8 for ~1 screen range
        }

        // Make missile turret bullets larger and spiky
        if (movementPattern === 'missile_decelerate') {
            bullet.radius = 6; // Large spiky orbs
            bullet.glowRadius = 12; // Strong glow
            bullet.damage = this.getLevelScaledDamage(5); // High damage

            // Set level-scaled max distance and deceleration for Prowler missiles
            const turretConfig = ENEMY_BULLET_CONFIG.MISSILE.PROWLER_PIKE;
            bullet.maxDistance = turretConfig.MAX_DISTANCE;

            // Scale deceleration and initial speed based on level
            const levelProgress = Math.min(1, (this.level - 1) / 5); // Normalize to 0-1 over 6 levels
            bullet.deceleration = turretConfig.MIN_DECELERATION +
                (turretConfig.MAX_DECELERATION - turretConfig.MIN_DECELERATION) * levelProgress;
            bullet.initialSpeed = turretConfig.MIN_INITIAL_SPEED +
                (turretConfig.MAX_INITIAL_SPEED - turretConfig.MIN_INITIAL_SPEED) * levelProgress;
        }

        // Set unique movement pattern for this bullet
        bullet.movementPattern = movementPattern;
        bullet.patternTimer = 0;
        bullet.patternPhase = Math.random() * Math.PI * 2; // Random starting phase

        // Scale bullet range with enemy level — 15% more range per level
        // Base 600px; level 5 = ~960px (half screen), level 8+ = full screen
        bullet.maxRange = 600 * (1 + (this.level - 1) * 0.15);

        // For homing missiles and homing shots, provide player reference
        if (movementPattern === 'missile' || movementPattern === 'homing' || movementPattern === 'titan_homing') {
            bullet.targetPlayer = target || this.targetPlayer;
        }

        // Titan accelerating missiles don't need target reference (they fly straight)

        // Enemy shooting sounds removed to reduce audio confusion
        return bullet;
    }
    return null;
}

// ── Sweep Laser System ───────────────────────────────────────────────────────

export function updateSweepLaserSystem(gameEngine) {
    if (!this.targetPlayer) return;
    const now = frameClock.now;

    if (this.sweepState === undefined) {
        this.sweepState = 'cooldown';
        this.sweepCooldownEnd = now + 4000; // First sweep after 4s
        this.sweepAngle = 0;
        this.sweepStartAngle = 0;
        this.sweepEndAngle = 0;
        this.sweepStartTime = 0;
        this.sweepDuration = 1600;
        this.sweepWarningStart = 0;
        this.sweepWarningDuration = 1800;
        this.sweepLastDamage = 0;
        this.sweepLastBeam = 0;
    }

    switch (this.sweepState) {
        case 'cooldown':
            if (now >= this.sweepCooldownEnd) {
                // Transition to warning
                this.sweepState = 'warning';
                this.sweepWarningStart = now;
                // Save current turret angle so warning lerps smoothly from it
                this.sweepTurretStartAngle = this.tankTurretAngle || 0;
                const toPlayer = Math.atan2(
                    this.targetPlayer.y - this.y,
                    this.targetPlayer.x - this.x
                );
                this.sweepStartAngle = toPlayer - Math.PI / 9; // ±20° sweep (was ±60°)
                this.sweepEndAngle   = toPlayer + Math.PI / 9;
                this.sweepAngle = this.sweepStartAngle;
            }
            break;

        case 'warning': {
            // Smoothly rotate turret from its current angle to sweepStartAngle — no jump
            const warningProg = Math.min(1, (now - this.sweepWarningStart) / this.sweepWarningDuration);
            let turretDiff = this.sweepStartAngle - (this.sweepTurretStartAngle || 0);
            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
            this.tankTurretAngle = (this.sweepTurretStartAngle || 0) + turretDiff * warningProg;
            if (warningProg >= 1) {
                this.sweepState = 'sweeping';
                this.sweepStartTime = now;
                this.sweepAngle = this.sweepStartAngle;
            }
            break;
        }

        case 'sweeping': {
            const elapsed = now - this.sweepStartTime;
            const progress = Math.min(1, elapsed / this.sweepDuration);
            // Ease-in-out
            const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
            this.sweepAngle = this.sweepStartAngle + (this.sweepEndAngle - this.sweepStartAngle) * eased;
            // Turret tracks the laser as it sweeps
            this.tankTurretAngle = this.sweepAngle;

            // Deal damage to player if in beam
            const beamLength = Math.min(window.innerWidth, window.innerHeight) * 0.65;
            const beamHalfWidth = 28;
            if (now - this.sweepLastDamage > 180 && this.isPlayerInSweepBeam(this.targetPlayer, this.sweepAngle, beamLength, beamHalfWidth)) {
                // Spawn a very-short-lived bullet at player position so existing collision handles damage
                const hitBullet = gameEngine.enemyBulletPool.get();
                if (hitBullet) {
                    hitBullet.reset(this.targetPlayer.x, this.targetPlayer.y, 0, 0, '#aa44ff', false);
                    hitBullet.radius = 8;
                    hitBullet.damage = this.getLevelScaledDamage(3);
                    hitBullet.movementPattern = 'aimed';
                    hitBullet.isPersistent = false;
                    hitBullet.maxLifetimeOverride = 120; // Dies in ~120ms
                }
                this.sweepLastDamage = now;

                // Visual spark at player
                if (gameEngine.particlePool) {
                    for (let i = 0; i < 4; i++) {
                        const p = gameEngine.particlePool.get(this.targetPlayer.x, this.targetPlayer.y, 'starSparkle');
                        if (p) { p.color = '#cc66ff'; }
                    }
                }
            }

            if (progress >= 1) {
                this.sweepState = 'cooldown';
                this.sweepCooldownEnd = now + 8000; // 8s between sweeps
            }
            break;
        }
    }
}

export function isPlayerInSweepBeam(player, beamAngle, beamLength, beamHalfWidth) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > beamLength) return false;
    const angleToPlayer = Math.atan2(dy, dx);
    let angleDiff = angleToPlayer - beamAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    const perpDist = Math.abs(Math.sin(angleDiff) * dist);
    return perpDist < beamHalfWidth + (player.radius || 12);
}

// ── Sentinel Sweep ───────────────────────────────────────────────────────────

export function updateSentinelSweep(gameEngine) {
    if (!this.targetPlayer) return;
    const now = frameClock.now;

    // Fire during spin-up and cooldown phases (not while arcing)
    if (this.weaverState === 'arcing') return;

    if (this.sentinelLastShot === undefined) this.sentinelLastShot = 0;
    if (this.sentinelBurstsFired === undefined) this.sentinelBurstsFired = 0;

    // Reduced interval (1400ms) so 3 bursts happen before the arc move
    if (now - this.sentinelLastShot > 1400) {
        this.shootCircleBurst(gameEngine, 8);
        this.sentinelLastShot = now;
        this.sentinelBurstsFired++;
    }
}

export function shootCircleBurst(gameEngine, count = 8) {
    // Fire `count` green hexagon bullets evenly spaced around 360°, from center
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const bullet = this.createEnemyBullet(gameEngine, angle, 4, '#00ff44', false, 'aimed');
        if (bullet) {
            bullet.shape = 'hexagon';
            bullet.rotation = angle;
            bullet.rotationSpeed = 0.12; // visibly spinning
            bullet.radius = 7;
            bullet.glowRadius = 14;
            bullet.color = '#00ff88';
            bullet.damage = this.getLevelScaledDamage(2);
            bullet.maxLifetimeOverride = 4000;
        }
    }
}
