// ── Enemy AI: targeting, evasion, territory, and trail behaviors ─────────────
// Extracted from enemy.js — all functions use `this` via .call(enemyInstance)
import { random } from '../utils.js';
import { frameClock } from '../frame-clock.js';

// ── Face Direction ───────────────────────────────────────────────────────────

export function updateFaceDirection() {
    // Weaver and Sentinel control their own faceAngle while spinning/arcing
    if ((this.type === 'WEAVER' || this.type === 'SENTINEL') && (this.weaverState === 'spinning_up' || this.weaverState === 'arcing')) {
        return;
    }

    let targetX, targetY;

    // Determine what to face based on current target
    if (this.currentTarget === 'player' && this.targetPlayer) {
        targetX = this.targetPlayer.x;
        targetY = this.targetPlayer.y;
    } else if (this.currentTarget === 'asteroid' && this.targetAsteroid) {
        targetX = this.targetAsteroid.x;
        targetY = this.targetAsteroid.y;
    } else if (this.currentTarget === 'patrol' && this.patrolTarget) {
        targetX = this.patrolTarget.x;
        targetY = this.patrolTarget.y;
    } else if (this.targetPlayer) {
        // Fallback to player
        targetX = this.targetPlayer.x;
        targetY = this.targetPlayer.y;
    } else {
        return; // No valid target to face
    }

    // Calculate angle to target
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    this.targetFaceAngle = Math.atan2(dy, dx);

    // Smoothly rotate to face target
    let angleDiff = this.targetFaceAngle - this.faceAngle;

    // Normalize angle difference to [-π, π]
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Apply turn speed
    this.faceAngle += angleDiff * this.turnSpeed;

    // Normalize face angle
    while (this.faceAngle > Math.PI) this.faceAngle -= Math.PI * 2;
    while (this.faceAngle < -Math.PI) this.faceAngle += Math.PI * 2;
}

// ── Target Priority ──────────────────────────────────────────────────────────

export function updateTargetPriority(playerDistance, gameEngine) {
    // Initialize targeting and territorial properties
    if (this.currentTarget === undefined) {
        this.currentTarget = 'player'; // Only 'player' or 'patrol'
        this.loseInterestDistance = this.getTerritorySize() * 0.8; // Lose interest at 80% of territory size
        this.keepDistanceFromPlayer = 120 + this.radius; // Dynamic distance based on enemy size
        this.keepDistanceFromEnemies = 40 + this.radius; // Dynamic distance based on enemy size

        // Initialize territory system
        this.initializeTerritory(gameEngine);
    }

    // Check if player is within our territory
    const playerInTerritory = this.isPlayerInTerritory(this.targetPlayer);

    // Territorial behavior - patrol if player is outside territory
    if (!playerInTerritory) {
        // Player is outside our territory, patrol to defend our area
            this.currentTarget = 'patrol';
        return;
    }

    // Player is in territory - prioritize chasing them out
    if (playerDistance > this.loseInterestDistance) {
        // Player is at edge of territory, patrol to maintain presence
        this.currentTarget = 'patrol';
    } else {
        // Player is in our territory, chase them aggressively
            this.currentTarget = 'player';
    }
}

// ── Territory System ─────────────────────────────────────────────────────────

export function initializeTerritory(gameEngine) {
    if (!gameEngine || !gameEngine.gameField) return;

    // Define territory based on enemy type and spawn position
    const territorySize = this.getTerritorySize();

    // Territory is centered around spawn position
    this.territory = {
        centerX: this.x,
        centerY: this.y,
        radius: territorySize,
        // Rectangular territory bounds (alternative to circular)
        left: this.x - territorySize,
        right: this.x + territorySize,
        top: this.y - territorySize,
        bottom: this.y + territorySize
    };

    // Clamp territory to game field bounds
    this.territory.left = Math.max(0, this.territory.left);
    this.territory.right = Math.min(gameEngine.gameField.width, this.territory.right);
    this.territory.top = Math.max(0, this.territory.top);
    this.territory.bottom = Math.min(gameEngine.gameField.height, this.territory.bottom);

    // Update center based on clamped bounds
    this.territory.centerX = (this.territory.left + this.territory.right) / 2;
    this.territory.centerY = (this.territory.top + this.territory.bottom) / 2;
    this.territory.radius = Math.min(
        (this.territory.right - this.territory.left) / 2,
        (this.territory.bottom - this.territory.top) / 2
    );
}

export function getTerritorySize() {
    // Get screen dimensions for territory scaling
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const avgScreenSize = (screenWidth + screenHeight) / 2;

    // All enemy types limited to 1 screen size territory maximum
    switch (this.type) {
        case 'TITAN': return avgScreenSize * 1.0; // Reduced from 1.8 to 1.0
        case 'TANGERINE': return avgScreenSize * 1.0; // Reduced from 1.6 to 1.0
        case 'GUARDIAN': return avgScreenSize * 1.0; // Reduced from 1.4 to 1.0
        case 'HUNTER': return avgScreenSize * 1.0; // Reduced from 1.2 to 1.0
        case 'STALKER': return avgScreenSize * 1.0; // Same as before
        case 'WASP': return avgScreenSize * 0.8; // Same as before
        // Turrets have smaller territories since they're stationary
        case 'DRIFTER': return avgScreenSize * 1.0; // Same as before
        case 'PROWLER': return avgScreenSize * 1.0; // Reduced from 1.8 to 1.0
        case 'WEAVER': return avgScreenSize * 0.8; // Same as before
        case 'SENTINEL': return avgScreenSize * 0.9; // Same as before
        default: return avgScreenSize * 1.0; // Reduced from 1.2 to 1.0
    }
}

export function isPlayerInTerritory(player) {
    if (!this.territory || !player) return true; // Default to true if no territory set

    // Use circular territory check for simplicity
    const dx = player.x - this.territory.centerX;
    const dy = player.y - this.territory.centerY;
    const distanceFromCenter = Math.hypot(dx, dy);

    return distanceFromCenter <= this.territory.radius;
}

export function findNearestAsteroid(gameEngine) {
    if (!gameEngine || !gameEngine.asteroidPool) {
        this.targetAsteroid = null;
        return;
    }

    let nearestAsteroid = null;
    let nearestDistance = this.asteroidSearchRadius;

    for (const asteroid of gameEngine.asteroidPool.activeObjects) {
        if (asteroid.active) {
            // Only consider asteroids within our territory
            if (this.territory && !this.isAsteroidInTerritory(asteroid)) {
                continue;
            }

            const distance = Math.hypot(this.x - asteroid.x, this.y - asteroid.y);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestAsteroid = asteroid;
            }
        }
    }

    this.targetAsteroid = nearestAsteroid;
}

export function isAsteroidInTerritory(asteroid) {
    if (!this.territory || !asteroid) return true;

    const dx = asteroid.x - this.territory.centerX;
    const dy = asteroid.y - this.territory.centerY;
    const distanceFromCenter = Math.hypot(dx, dy);

    return distanceFromCenter <= this.territory.radius;
}

// ── Distance Maintenance ─────────────────────────────────────────────────────

export function maintainDistanceFromPlayer() {
    if (!this.targetPlayer) return;

    const dx = this.x - this.targetPlayer.x;
    const dy = this.y - this.targetPlayer.y;
    const distance = Math.hypot(dx, dy);

    // If too close to player, add repulsion force
    if (distance < this.keepDistanceFromPlayer && distance > 0) {
        const repulsionStrength = (this.keepDistanceFromPlayer - distance) / this.keepDistanceFromPlayer;
        const repulsionForce = repulsionStrength * 0.5;

        this.vel.x += (dx / distance) * repulsionForce;
        this.vel.y += (dy / distance) * repulsionForce;
    }
}

export function maintainDistanceFromEnemies(enemies) {
    if (!enemies || enemies.length === 0) return;

    // Check distance to all other active enemies
    for (const otherEnemy of enemies) {
        if (otherEnemy === this || !otherEnemy.active) continue;

        const dx = this.x - otherEnemy.x;
        const dy = this.y - otherEnemy.y;
        const distance = Math.hypot(dx, dy);

        // Calculate minimum distance based on both enemies' sizes
        const combinedRadius = this.radius + otherEnemy.radius;
        const minDistance = Math.max(this.keepDistanceFromEnemies, combinedRadius + 20);

        // If too close to another enemy, add repulsion force
        if (distance < minDistance && distance > 0) {
            const repulsionStrength = (minDistance - distance) / minDistance;
            const repulsionForce = repulsionStrength * 0.3; // Slightly weaker than player avoidance

            this.vel.x += (dx / distance) * repulsionForce;
            this.vel.y += (dy / distance) * repulsionForce;
        }
    }
}

// ── Patrol ───────────────────────────────────────────────────────────────────

export function patrolTerritory() {
    if (!this.territory) return;

    // Initialize patrol properties
    if (this.patrolTarget === undefined) {
        this.patrolTarget = { x: this.territory.centerX, y: this.territory.centerY };
        this.patrolTimer = 0;
        this.patrolChangeInterval = 8000 + Math.random() * 4000; // 8-12 seconds between patrol points for larger territories
    }

    this.patrolTimer += 16; // Assume 60fps

    // Check if we need a new patrol target
    const dx = this.patrolTarget.x - this.x;
    const dy = this.patrolTarget.y - this.y;
    const distanceToTarget = Math.hypot(dx, dy);

    if (distanceToTarget < 80 || this.patrolTimer >= this.patrolChangeInterval) {
        // Generate new patrol point within territory
        this.generateNewPatrolPoint();
        this.patrolTimer = 0;
    }

    // Move toward patrol target at reduced speed
    if (distanceToTarget > 5) {
        const patrolSpeed = this.config.speed * 0.3; // Slow patrol speed
        this.vel.x = (dx / distanceToTarget) * patrolSpeed;
        this.vel.y = (dy / distanceToTarget) * patrolSpeed;
    }
}

export function generateNewPatrolPoint() {
    if (!this.territory) return;

    // Generate random point within circular territory
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.territory.radius * 0.8; // Stay within 80% of territory

    this.patrolTarget.x = this.territory.centerX + Math.cos(angle) * distance;
    this.patrolTarget.y = this.territory.centerY + Math.sin(angle) * distance;

    // Ensure patrol point is within game bounds
    this.patrolTarget.x = Math.max(this.territory.left, Math.min(this.territory.right, this.patrolTarget.x));
    this.patrolTarget.y = Math.max(this.territory.top, Math.min(this.territory.bottom, this.patrolTarget.y));
}

// ── Trail ────────────────────────────────────────────────────────────────────

export function updateLightTrail() {
    const now = frameClock.now;

    // Add new trail point if enough time has passed
    if (now - this.trail.lastUpdate > this.trail.updateInterval) {
        this.trail.positions.push({
            x: this.x,
            y: this.y,
            age: now
        });

        // Remove old trail points
        this.trail.positions = this.trail.positions.filter(point =>
            now - point.age < this.trail.fadeTime
        );

        // Limit trail length
        if (this.trail.positions.length > this.trail.maxLength) {
            this.trail.positions.shift();
        }

        this.trail.lastUpdate = now;
    }
}

export function createTrailParticles(gameEngine) {
    if (!gameEngine || !gameEngine.particlePool) return;

    // Initialize trail properties if not set
    if (this.trailTimer === undefined) {
        this.trailTimer = 0;
        this.lastTrailX = this.x;
        this.lastTrailY = this.y;
    }

    this.trailTimer += 16; // Assume 60fps

    // Create trail particles every few frames based on movement speed
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const trailInterval = Math.max(50, 150 - speed * 30); // Faster enemies = more frequent trails

    if (this.trailTimer >= trailInterval && speed > 0.1) {
        // Calculate distance moved since last trail
        const dx = this.x - this.lastTrailX;
        const dy = this.y - this.lastTrailY;
        const distanceMoved = Math.hypot(dx, dy);

        if (distanceMoved > 5) { // Only create trail if enemy has moved significantly
            // Create trail particle at previous position
            const trailParticle = gameEngine.particlePool.get(
                this.lastTrailX,
                this.lastTrailY,
                'enemyTrail',
                this.color,
                this.type
            );

            if (trailParticle) {
                // Set trail-specific properties
                trailParticle.enemyColor = this.color;
                trailParticle.enemyType = this.type;
            }

            this.trailTimer = 0;
            this.lastTrailX = this.x;
            this.lastTrailY = this.y;
        }
    }
}

// ── Evasion & Dodging ────────────────────────────────────────────────────────

export function avoidAsteroids(gameEngine) {
    if (!gameEngine.asteroidPool) return;

    const avoidanceRadius = this.radius + 60; // Detection radius for asteroids
    const avoidanceForce = 0.08; // Strength of avoidance

    let avoidanceX = 0;
    let avoidanceY = 0;
    let asteroidCount = 0;

    // Check all active asteroids
    for (const asteroid of gameEngine.asteroidPool.activeObjects) {
        if (!asteroid.active) continue;

        const dx = this.x - asteroid.x;
        const dy = this.y - asteroid.y;
        const distance = Math.hypot(dx, dy);

        // If asteroid is within avoidance radius
        if (distance < avoidanceRadius && distance > 0) {
            // Add repulsive force (stronger when closer)
            const forceMultiplier = (avoidanceRadius - distance) / avoidanceRadius;
            avoidanceX += (dx / distance) * forceMultiplier;
            avoidanceY += (dy / distance) * forceMultiplier;
            asteroidCount++;
        }
    }

    // Apply averaged avoidance force
    if (asteroidCount > 0) {
        avoidanceX = (avoidanceX / asteroidCount) * avoidanceForce;
        avoidanceY = (avoidanceY / asteroidCount) * avoidanceForce;

        // Apply avoidance to velocity
        this.vel.x += avoidanceX;
        this.vel.y += avoidanceY;

        // Cap speed to prevent runaway velocity
        const speed = Math.hypot(this.vel.x, this.vel.y);
        const maxSpeed = this.config.speed * 1.5; // Allow slightly higher speed when avoiding

        if (speed > maxSpeed) {
            this.vel.x = (this.vel.x / speed) * maxSpeed;
            this.vel.y = (this.vel.y / speed) * maxSpeed;
        }
    }
}

export function updateEvasiveManeuvers(gameEngine) {
    if (!this.targetPlayer) return;

    const now = frameClock.now;
    const dx = this.targetPlayer.x - this.lastPlayerPosition.x;
    const dy = this.targetPlayer.y - this.lastPlayerPosition.y;
    const playerSpeed = Math.hypot(dx, dy);

    // If player is moving fast or we haven't evaded recently, perform evasive maneuver
    if (playerSpeed > 2 && now - this.lastEvasiveManeuver > 1500) {
        this.lastEvasiveManeuver = now;
        this.evasiveTimer = 30; // 30 frames of evasion

        // Choose random evasive direction
        const evasiveAngle = random(0, Math.PI * 2);
        this.evasiveDirection.x = Math.cos(evasiveAngle);
        this.evasiveDirection.y = Math.sin(evasiveAngle);
    }

    // Apply evasive movement if timer is active
    if (this.evasiveTimer > 0) {
        const evasiveStrength = 0.8 * (this.evasiveTimer / 30); // Fade out over time
        this.vel.x += this.evasiveDirection.x * evasiveStrength;
        this.vel.y += this.evasiveDirection.y * evasiveStrength;
        this.evasiveTimer--;
    }

    // Update last player position
    this.lastPlayerPosition.x = this.targetPlayer.x;
    this.lastPlayerPosition.y = this.targetPlayer.y;
}

export function dodgePlayerBullets(gameEngine) {
    if (!gameEngine.bulletPool) return;

    let totalDodgeX = 0;
    let totalDodgeY = 0;

    // Check for nearby player bullets
    gameEngine.bulletPool.activeObjects.forEach(bullet => {
        if (!bullet.active) return;

        const dx = bullet.x - this.x;
        const dy = bullet.y - this.y;
        const distance = Math.hypot(dx, dy);

        // Enhanced dodge radius based on enemy type (reduced for WASPs)
                const baseDodgeRadius = this.type === 'WASP' ? 30 : 25; // Reduced dodge detection
    const dodgeRadius = baseDodgeRadius * (this.config.speed / 3); // Much smaller dodge range
        const lookaheadTime = 25; // Predict bullet path

        // Predicted bullet position
        const futureX = bullet.x + bullet.vel.x * lookaheadTime;
        const futureY = bullet.y + bullet.vel.y * lookaheadTime;

        // Distance to predicted position
        const futureDistance = Math.hypot(futureX - this.x, futureY - this.y);

        // If bullet is threatening, dodge it
        if (distance < dodgeRadius || futureDistance < dodgeRadius) {
            const dodgeForce = (dodgeRadius - Math.min(distance, futureDistance)) / dodgeRadius;

            // Dodge perpendicular to bullet direction with some randomness
            const bulletAngle = Math.atan2(bullet.vel.y, bullet.vel.x);
            const perpAngle = bulletAngle + Math.PI / 2 + random(-0.3, 0.3);

                        // Choose smarter dodge direction
        const crossProduct = dx * bullet.vel.y - dy * bullet.vel.x;
        const dodgeDirection = crossProduct > 0 ? 1 : -1;

        const dodgeStrength = dodgeForce * dodgeDirection * 0.8; // Much weaker dodge response
            totalDodgeX += Math.cos(perpAngle) * dodgeStrength;
            totalDodgeY += Math.sin(perpAngle) * dodgeStrength;
        }
    });

    // Enhanced dodge force limits based on enemy type (further reduced)
    const maxDodgeForce = this.type === 'WASP' ? 1.6 : 1.4; // Much more reasonable dodge force
    const dodgeSpeed = Math.hypot(totalDodgeX, totalDodgeY);
    if (dodgeSpeed > maxDodgeForce) {
        totalDodgeX = (totalDodgeX / dodgeSpeed) * maxDodgeForce;
        totalDodgeY = (totalDodgeY / dodgeSpeed) * maxDodgeForce;
    }

    // Apply dodging with momentum
    this.vel.x += totalDodgeX;
    this.vel.y += totalDodgeY;

    // Add line-of-sight avoidance
    this.avoidPlayerLineOfSight();
}

export function avoidPlayerLineOfSight() {
    if (!this.targetPlayer) return;

    // Calculate angle from player to enemy
    const dx = this.x - this.targetPlayer.x;
    const dy = this.y - this.targetPlayer.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0 && distance < 200) { // Only avoid when relatively close
        // Calculate if we're in the player's potential line of fire
        const angleToEnemy = Math.atan2(dy, dx);

        // Add evasive movement perpendicular to line of sight
        const perpAngle = angleToEnemy + Math.PI / 2;
        const avoidanceStrength = 0.3 * (200 - distance) / 200; // Stronger when closer

        // Randomly choose left or right evasion, but be consistent for a while
        if (!this.evasionDirection || Math.random() < 0.01) { // Change direction occasionally
            this.evasionDirection = Math.random() < 0.5 ? 1 : -1;
        }

        this.vel.x += Math.cos(perpAngle) * avoidanceStrength * this.evasionDirection;
        this.vel.y += Math.sin(perpAngle) * avoidanceStrength * this.evasionDirection;
    }
}

export function addMicroMovements() {
    // Small random movements to make enemies harder to hit (toned down)
    const microStrength = this.type === 'WASP' ? 0.02 : 0.01; // Minimal micro-movements

    // Add random micro-adjustments every few frames (less frequent)
    if (Math.random() < 0.15) { // Reduced from 0.3 to 0.15
        this.vel.x += random(-microStrength, microStrength);
        this.vel.y += random(-microStrength, microStrength);
    }

    // Add subtle oscillation based on time and position (much more subtle)
    const time = frameClock.now * 0.003; // Slower oscillation
    const oscillation = 0.025; // Halved the oscillation strength
    this.vel.x += Math.sin(time + this.x * 0.01) * oscillation;
    this.vel.y += Math.cos(time + this.y * 0.01) * oscillation;
}

export function addFishLikeMovement() {
    // Fish-like swimming motion with undulating body movement
    const time = frameClock.now * 0.001; // Convert to seconds
    const fishId = this.x + this.y; // Unique phase offset for each enemy

    // Calculate current movement direction
    const currentAngle = Math.atan2(this.vel.y, this.vel.x);
    const speed = Math.hypot(this.vel.x, this.vel.y);

    if (speed > 0.1) { // Only apply fish movement when actually moving
        // Undulating side-to-side motion perpendicular to movement direction
        const undulationFrequency = 3.0; // How fast the fish "swims"
        const undulationAmplitude = 0.15; // How much side-to-side motion

        // Create undulation based on time and unique fish ID
        const undulation = Math.sin(time * undulationFrequency + fishId) * undulationAmplitude;

        // Calculate perpendicular direction to current movement
        const perpAngle = currentAngle + Math.PI / 2;

        // Apply undulating motion perpendicular to movement direction
        this.vel.x += Math.cos(perpAngle) * undulation;
        this.vel.y += Math.sin(perpAngle) * undulation;

        // Add slight forward pulsing (like fish tail propulsion)
        const propulsionFrequency = 4.0;
        const propulsionAmplitude = 0.08;
        const propulsion = Math.sin(time * propulsionFrequency + fishId) * propulsionAmplitude;

        this.vel.x += Math.cos(currentAngle) * propulsion;
        this.vel.y += Math.sin(currentAngle) * propulsion;
    }
}

export function dodgeEnemyBullets(gameEngine) {
    if (!gameEngine.enemyBulletPool) return;

    let totalDodgeX = 0;
    let totalDodgeY = 0;

    // Check for nearby enemy bullets
    gameEngine.enemyBulletPool.activeObjects.forEach(bullet => {
        if (!bullet.active) return;

        const dx = bullet.x - this.x;
        const dy = bullet.y - this.y;
        const distance = Math.hypot(dx, dy);

        // Predict bullet path and check if we're in danger
        const dodgeRadius = 40; // How close bullets can get before we dodge
        const lookaheadTime = 30; // How far ahead to predict bullet position

        // Predicted bullet position
        const futureX = bullet.x + bullet.vel.x * lookaheadTime;
        const futureY = bullet.y + bullet.vel.y * lookaheadTime;

        // Distance to predicted position
        const futureDistance = Math.hypot(futureX - this.x, futureY - this.y);

        // If bullet is close or will be close, dodge it
        if (distance < dodgeRadius || futureDistance < dodgeRadius) {
            const dodgeForce = (dodgeRadius - Math.min(distance, futureDistance)) / dodgeRadius;

            // Dodge perpendicular to bullet direction
            const bulletAngle = Math.atan2(bullet.vel.y, bullet.vel.x);
            const perpAngle = bulletAngle + Math.PI / 2;

            // Choose dodge direction (left or right of bullet path)
            const crossProduct = dx * bullet.vel.y - dy * bullet.vel.x;
            const dodgeDirection = crossProduct > 0 ? 1 : -1;

            totalDodgeX += Math.cos(perpAngle) * dodgeForce * dodgeDirection * 1.5;
            totalDodgeY += Math.sin(perpAngle) * dodgeForce * dodgeDirection * 1.5;
        }
    });

    // Cap total dodge force
    const maxDodgeForce = 1.5;
    const dodgeSpeed = Math.hypot(totalDodgeX, totalDodgeY);
    if (dodgeSpeed > maxDodgeForce) {
        totalDodgeX = (totalDodgeX / dodgeSpeed) * maxDodgeForce;
        totalDodgeY = (totalDodgeY / dodgeSpeed) * maxDodgeForce;
    }

    // Apply dodging
    this.vel.x += totalDodgeX;
    this.vel.y += totalDodgeY;
}

// ── Line of Sight ────────────────────────────────────────────────────────────

export function hasLineOfSight(target, gameEngine) {
    if (!target || !gameEngine) return false;

    // Calculate line from enemy to target
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);

    // If target is very close, always have line of sight
    if (distance < 50) return true;

    // Cache line-of-sight check for performance (check every 100ms)
    const now = frameClock.now;
    if (this.lastLOSCheck && (now - this.lastLOSCheck < 100) && this.cachedLOSResult !== undefined) {
        return this.cachedLOSResult;
    }

    // Normalize direction vector
    const dirX = dx / distance;
    const dirY = dy / distance;

    // Adaptive step size based on distance - fewer checks for longer distances
    const stepSize = Math.min(25, Math.max(15, distance / 20));
    const steps = Math.floor(distance / stepSize);

    for (let i = 1; i < steps; i++) {
        const checkX = this.x + (dirX * stepSize * i);
        const checkY = this.y + (dirY * stepSize * i);

        // Check if this point intersects with any active asteroid
        for (const asteroid of gameEngine.asteroidPool.activeObjects) {
            if (!asteroid.active) continue;

            const astDx = checkX - asteroid.x;
            const astDy = checkY - asteroid.y;
            const astDistance = Math.hypot(astDx, astDy);

            // If line passes through asteroid, no line of sight
            if (astDistance < asteroid.radius) {
                this.lastLOSCheck = now;
                this.cachedLOSResult = false;
                return false;
            }
        }

        // Check if this point intersects with any other active enemy (larger enemies only)
        for (const enemy of gameEngine.enemyPool.activeObjects) {
            if (!enemy.active || enemy === this || enemy.radius < 25) continue; // Skip self and small enemies

            const enemyDx = checkX - enemy.x;
            const enemyDy = checkY - enemy.y;
            const enemyDistance = Math.hypot(enemyDx, enemyDy);

            // If line passes through another large enemy, no line of sight
            if (enemyDistance < enemy.radius) {
                this.lastLOSCheck = now;
                this.cachedLOSResult = false;
                return false;
            }
        }
    }

    // Cache the result
    this.lastLOSCheck = now;
    this.cachedLOSResult = true;
    return true; // No obstacles found
}
