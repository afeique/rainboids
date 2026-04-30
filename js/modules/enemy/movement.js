// ── Enemy Movement Functions ─────────────────────────────────────────────────
// Extracted from Enemy class. Each function is called via .call(this) where
// `this` is the Enemy instance, so all `this.xxx` references resolve to the
// Enemy's own properties and methods (including helper methods that remain
// on the class as one-liner delegators).
// ─────────────────────────────────────────────────────────────────────────────

import { random, GameDimensions } from '../core/utils.js';
import { frameClock } from '../core/frame-clock.js';

export function chasePlayer() {
    if (!this.targetPlayer) return;

    const fieldWidth  = GameDimensions.width;
    const fieldHeight = GameDimensions.height;
    const now = frameClock.now;

    // ── TANGERINE (Bomber): player-seeking patrol with wall avoidance + mine-stop ──
    if (this.type === 'TANGERINE') {
        // Stop briefly after laying a mine
        if (this.mineJustLaid && now - this.mineJustLaid < 700) {
            this.vel.x *= 0.82;
            this.vel.y *= 0.82;
            return;
        }

        const toPlayer = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        const distToPlayer = Math.hypot(this.targetPlayer.x - this.x, this.targetPlayer.y - this.y);

        // Lazy-init roaming direction state
        if (!this.bomberRoamDir) {
            this.bomberRoamDir = toPlayer + (Math.random() - 0.5) * Math.PI * 0.5;
            this.bomberRoamChange = now + 800 + Math.random() * 800;
        }

        // Shorter roam intervals; strongly biased toward player when far away
        if (now > this.bomberRoamChange) {
            const spread = distToPlayer > 250 ? 0.35 : 0.85; // tight toward player when far
            this.bomberRoamDir = toPlayer + (Math.random() - 0.5) * Math.PI * spread;
            this.bomberRoamChange = now + 700 + Math.random() * 900;
        }

        // Stronger wall repulsion with larger margin
        const wallMargin = 180;
        let repX = 0, repY = 0;
        if (this.x < wallMargin) repX += ((wallMargin - this.x) / wallMargin) * 0.2;
        if (this.x > fieldWidth  - wallMargin) repX -= ((this.x - (fieldWidth  - wallMargin)) / wallMargin) * 0.2;
        if (this.y < wallMargin) repY += ((wallMargin - this.y) / wallMargin) * 0.2;
        if (this.y > fieldHeight - wallMargin) repY -= ((this.y - (fieldHeight - wallMargin)) / wallMargin) * 0.2;

        // When near wall, blend repulsion with player direction to pull back toward center
        if (Math.hypot(repX, repY) > 0.07) {
            const blendAngle = Math.atan2(
                repY + Math.sin(toPlayer) * 0.6,
                repX + Math.cos(toPlayer) * 0.6
            );
            this.bomberRoamDir = blendAngle;
            this.bomberRoamChange = now + 700;
        }

        const acc = 0.042;
        this.vel.x += Math.cos(this.bomberRoamDir) * acc + repX;
        this.vel.y += Math.sin(this.bomberRoamDir) * acc + repY;

        const speed = Math.hypot(this.vel.x, this.vel.y);
        if (speed > this.config.speed) {
            this.vel.x = (this.vel.x / speed) * this.config.speed;
            this.vel.y = (this.vel.y / speed) * this.config.speed;
        }
        return;
    }

    // ── Standard chase for other enemies ──────────────────────────────────
    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
        const acceleration = 0.012;
        let targetVelX = (dx / distance) * acceleration;
        let targetVelY = (dy / distance) * acceleration;

        const weaveAngle = Math.atan2(dy, dx) + Math.PI / 2;
        const weaveStrength = Math.sin(now * 0.002 + this.x * 0.01) * 0.1;
        targetVelX += Math.cos(weaveAngle) * weaveStrength * acceleration;
        targetVelY += Math.sin(weaveAngle) * weaveStrength * acceleration;

        this.vel.x += targetVelX;
        this.vel.y += targetVelY;

        const speed = Math.hypot(this.vel.x, this.vel.y);
        const maxSpeed = this.config.speed * 1.08;
        if (speed > maxSpeed) {
            this.vel.x = (this.vel.x / speed) * maxSpeed;
            this.vel.y = (this.vel.y / speed) * maxSpeed;
        }
    }
}

export function patrolMovement() {
    if (!this.targetPlayer) return;

    // Calculate distance to player
    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distanceToPlayer = Math.hypot(dx, dy);

    // Calculate distance to game field center
    const fieldWidth = GameDimensions.width;
    const fieldHeight = GameDimensions.height;
    const centerX = fieldWidth / 2;
    const centerY = fieldHeight / 2;
    const dxCenter = centerX - this.x;
    const dyCenter = centerY - this.y;
    const distanceToCenter = Math.hypot(dxCenter, dyCenter);

    // Base patrol pattern (circular movement) with direction changes
    const now = frameClock.now;

    // Occasionally change patrol direction for unpredictability
    if (now - this.lastDirectionChange > 3000 && Math.random() < 0.02) {
        this.patrolDirection *= -1;
        this.lastDirectionChange = now;
    }

    this.patrolAngle += 0.02 * this.patrolDirection;
    let baseVelX = Math.cos(this.patrolAngle) * this.config.speed;
    let baseVelY = Math.sin(this.patrolAngle) * this.config.speed;

    // Add bias toward player if too far away (> 250 pixels) - more aggressive for Drifter
    let playerBias = 0;
    if (distanceToPlayer > 250) {
        playerBias = Math.min(0.6, (distanceToPlayer - 250) / 150); // Stronger bias
        baseVelX += (dx / distanceToPlayer) * playerBias * this.config.speed;
        baseVelY += (dy / distanceToPlayer) * playerBias * this.config.speed;
    }

    // Drifter-specific: try to maintain optimal shooting distance (150-200 pixels)
    if (this.type === 'DRIFTER') {
        const optimalDistance = 175;
        const distanceDiff = distanceToPlayer - optimalDistance;

        if (Math.abs(distanceDiff) > 50) {
            const approachBias = distanceDiff > 0 ? 0.3 : -0.2; // Move closer if too far, back off if too close
            baseVelX += (dx / distanceToPlayer) * approachBias * this.config.speed;
            baseVelY += (dy / distanceToPlayer) * approachBias * this.config.speed;
        }
    }

    // Add bias toward center if too far from center (> 250 pixels)
    if (distanceToCenter > 250) {
        const centerBias = Math.min(0.3, (distanceToCenter - 250) / 150);
        baseVelX += (dxCenter / distanceToCenter) * centerBias * this.config.speed;
        baseVelY += (dyCenter / distanceToCenter) * centerBias * this.config.speed;
    }

    // Add some defensive repositioning - move perpendicular to player occasionally
    if (distanceToPlayer < 150 && Math.random() < 0.1) {
        const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
        baseVelX += Math.cos(perpAngle) * this.config.speed * 0.5;
        baseVelY += Math.sin(perpAngle) * this.config.speed * 0.5;
    }

    // Set velocity
    this.vel.x = baseVelX;
    this.vel.y = baseVelY;

    // Cap speed
    const speed = Math.hypot(this.vel.x, this.vel.y);
    if (speed > this.config.speed * 1.2) { // Allow slightly higher speed for repositioning
        this.vel.x = (this.vel.x / speed) * this.config.speed * 1.2;
        this.vel.y = (this.vel.y / speed) * this.config.speed * 1.2;
    }
}

// ── Drifter Wave Movement ────────────────────────────────────────────────
// Orbits the player at a fixed distance (~220 px) using a sinusoidal
// tangential velocity so it traces an undulating wave arc rather than
// a clean circle.  The radial component continuously corrects distance.
export function drifterWaveMovement() {
    if (!this.targetPlayer) return;

    // Freeze in place while charging or in post-fire cooldown
    if (this.laserCharging || (this.laserCooldown !== undefined && frameClock.now < this.laserCooldown)) {
        this.vel.x = 0;
        this.vel.y = 0;
        return;
    }

    if (this.drifterWavePhase === undefined) {
        this.drifterWavePhase = Math.random() * Math.PI * 2;
        this.drifterOrbitDir  = Math.random() < 0.5 ? 1 : -1;
        this.drifterOptimalDist = 220; // px — fixed orbit distance
    }

    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    // Unit vectors: radial (toward player) and tangential (perpendicular)
    const rx =  dx / dist;
    const ry =  dy / dist;
    const tx = -ry * this.drifterOrbitDir;
    const ty =  rx * this.drifterOrbitDir;

    // Advance sinusoidal phase
    this.drifterWavePhase += 0.042;
    const wave = Math.sin(this.drifterWavePhase); // −1 … +1

    // Radial: proportional correction to reach optimal distance
    const distErr = dist - this.drifterOptimalDist;
    const radialSpeed = Math.sign(distErr) * Math.min(Math.abs(distErr) * 0.06, this.config.speed * 0.8);

    // Tangential: sinusoidal wave (full amplitude at peak)
    const tangentialSpeed = wave * this.config.speed * 1.6;

    this.vel.x = rx * radialSpeed + tx * tangentialSpeed;
    this.vel.y = ry * radialSpeed + ty * tangentialSpeed;
}

export function swarmMovement() {
    if (!this.targetPlayer) return;

    // Enhanced swarm movement with more agility
    const targetX = this.targetPlayer.x + this.swarmOffset.x;
    const targetY = this.targetPlayer.y + this.swarmOffset.y;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 50) {
        this.vel.x += (dx / distance) * 0.035; // Reduced from 0.05 - less aggressive acceleration
        this.vel.y += (dy / distance) * 0.035;
    }

    // Minimal erratic movement for easier targeting
    const erraticStrength = this.type === 'WASP' ? 0.05 : 0.03; // Much reduced
    this.vel.x += random(-erraticStrength, erraticStrength);
    this.vel.y += random(-erraticStrength, erraticStrength);

    // Subtle sine wave movement
    const time = frameClock.now * 0.002; // Much slower oscillation
    this.vel.x += Math.sin(time + this.x * 0.02) * 0.03; // Much reduced
    this.vel.y += Math.cos(time + this.y * 0.02) * 0.03;

    // Lower speed cap for predictable movement
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const maxSpeed = this.config.speed * 1.02; // Much reduced
    if (speed > maxSpeed) {
        this.vel.x = (this.vel.x / speed) * maxSpeed;
        this.vel.y = (this.vel.y / speed) * maxSpeed;
    }
}

export function orbitalMovement() {
    if (!this.targetPlayer) return;

    // Initialize orbital state for Shield Turret
    if (this.type === 'SENTINEL') {
        if (this.orbitalState === undefined) {
            this.orbitalState = 'moving'; // 'moving', 'stopping', 'firing'
            this.orbitalTimer = 0;
            this.orbitalStopDuration = 800; // 0.8 seconds stopped before firing
        }

        this.orbitalTimer += 16; // Assume 60fps

        // Shield Turret specific behavior - larger orbit, slower movement, stops to fire
        this.orbitalAngle += 0.008; // Much slower orbit
        const baseOrbitRadius = 280; // Larger orbit radius
        const radiusVariation = Math.sin(frameClock.now * 0.002) * 30; // Smaller variation
        const orbitRadius = baseOrbitRadius + radiusVariation;

        const targetX = this.targetPlayer.x + Math.cos(this.orbitalAngle) * orbitRadius;
        const targetY = this.targetPlayer.y + Math.sin(this.orbitalAngle) * orbitRadius;

        const dx = targetX - this.x;
        const dy = targetY - this.y;

        switch (this.orbitalState) {
            case 'moving':
                // Slow orbital movement
                const acceleration = 0.008; // Much slower acceleration
                this.vel.x = dx * acceleration;
                this.vel.y = dy * acceleration;

                // Check if it's time to stop and fire
                if (this.orbitalTimer >= 3000) { // Stop every 3 seconds
                    this.orbitalState = 'stopping';
                    this.orbitalTimer = 0;
                }
                break;

            case 'stopping':
                // Come to a complete stop
                this.vel.x *= 0.85;
                this.vel.y *= 0.85;

                if (this.orbitalTimer >= this.orbitalStopDuration) {
                    this.orbitalState = 'moving';
                    this.orbitalTimer = 0;
                }
                break;
        }
    } else {
        // Original orbital movement for other enemies
        this.orbitalAngle += 0.015; // Slightly faster orbit
        const baseOrbitRadius = 180;
        const radiusVariation = Math.sin(frameClock.now * 0.003) * 50; // Varying orbit radius
        const orbitRadius = baseOrbitRadius + radiusVariation;

        const targetX = this.targetPlayer.x + Math.cos(this.orbitalAngle) * orbitRadius;
        const targetY = this.targetPlayer.y + Math.sin(this.orbitalAngle) * orbitRadius;

        const dx = targetX - this.x;
        const dy = targetY - this.y;

        // Enhanced movement with acceleration
        const acceleration = 0.018; // Increased from 0.01
        this.vel.x = dx * acceleration;
        this.vel.y = dy * acceleration;

        // Add some orbital wobble for unpredictability
        const wobbleAngle = this.orbitalAngle * 3 + frameClock.now * 0.008;
        this.vel.x += Math.cos(wobbleAngle) * 0.3;
        this.vel.y += Math.sin(wobbleAngle) * 0.3;
    }
}

export function stealthMovement(now) {
    this.stealthTimer += 16; // Assume 60fps

    if (this.stealthTimer < 1500) {
        // Enhanced approach phase - aggressive pursuit with weaving
        this.chasePlayer();

        // Add unpredictable darting movements
        if (Math.random() < 0.1) {
            const dartAngle = random(0, Math.PI * 2);
            this.vel.x += Math.cos(dartAngle) * 1.5;
            this.vel.y += Math.sin(dartAngle) * 1.5;
        }
    } else if (this.stealthTimer < 2000) {
        // Brief stop phase with micro-adjustments
        this.vel.x *= 0.9;
        this.vel.y *= 0.9;

        // Small positioning adjustments
        this.vel.x += random(-0.2, 0.2);
        this.vel.y += random(-0.2, 0.2);
    } else if (this.stealthTimer < 4000) {
        // Enhanced retreat phase - faster escape with evasion
        if (this.targetPlayer) {
            const dx = this.x - this.targetPlayer.x;
            const dy = this.y - this.targetPlayer.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 0) {
                this.vel.x += (dx / distance) * 0.06; // Faster retreat
                this.vel.y += (dy / distance) * 0.06;

                // Add evasive zigzag during retreat
                const zigzagAngle = Math.atan2(dy, dx) + Math.PI / 2;
                const zigzag = Math.sin(frameClock.now * 0.02) * 0.4;
                this.vel.x += Math.cos(zigzagAngle) * zigzag;
                this.vel.y += Math.sin(zigzagAngle) * zigzag;
            }
        }
    } else {
        // Reset cycle
        this.stealthTimer = 0;
    }
}

export function fishDartMovement() {
    if (!this.targetPlayer) return;

    // Update timers
    this.dartTimer -= 16; // Assume 60fps
    this.dartCooldown -= 16;

    switch (this.dartState) {
        case 'idle':
            // Apply friction when idle
            this.vel.x *= 0.95;
            this.vel.y *= 0.95;

            // Check if ready to dart (cooldown finished and random chance)
            if (this.dartCooldown <= 0 && Math.random() < 0.02) {
                this.startFishDart();
            }
            break;

        case 'darting':
            // Move in the dart direction at full speed
            const dartSpeed = this.config.speed * 1.8;
            this.vel.x = this.dartDirection.x * dartSpeed;
            this.vel.y = this.dartDirection.y * dartSpeed;

            // Check if dart duration is over
            if (this.dartTimer <= 0) {
                this.dartState = 'slowing';
                this.dartTimer = 800; // Slowing duration (800ms)
            }
            break;

        case 'slowing':
            // Apply strong friction to slow down
            this.vel.x *= 0.88;
            this.vel.y *= 0.88;

            // Check if slowing duration is over
            if (this.dartTimer <= 0) {
                this.dartState = 'idle';
                this.dartCooldown = random(1000, 2500); // Random cooldown between darts
            }
            break;
    }

    // Slight bias toward player when idle
    if (this.dartState === 'idle') {
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
            const bias = 0.008;
            this.vel.x += (dx / distance) * bias;
            this.vel.y += (dy / distance) * bias;
        }
    }
}

export function startFishDart() {
    // Choose one of 8 possible 45-degree angles
    const angleIndex = Math.floor(random(0, 8));
    this.dartAngle = (angleIndex * Math.PI) / 4; // 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°

    // Set dart direction
    this.dartDirection.x = Math.cos(this.dartAngle);
    this.dartDirection.y = Math.sin(this.dartAngle);

    // Bias toward player direction
    if (this.targetPlayer) {
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
            const playerAngle = Math.atan2(dy, dx);

            // Find the closest 45-degree angle to the player
            let bestAngle = 0;
            let smallestDiff = Math.PI * 2;

            for (let i = 0; i < 8; i++) {
                const testAngle = (i * Math.PI) / 4;
                let diff = Math.abs(testAngle - playerAngle);
                if (diff > Math.PI) diff = Math.PI * 2 - diff;

                if (diff < smallestDiff) {
                    smallestDiff = diff;
                    bestAngle = testAngle;
                }
            }

            // Use the best angle with some randomness
            if (Math.random() < 0.7) { // 70% chance to dart toward player
                this.dartAngle = bestAngle;
                this.dartDirection.x = Math.cos(this.dartAngle);
                this.dartDirection.y = Math.sin(this.dartAngle);
            }
        }
    }

    this.dartState = 'darting';
    this.dartTimer = random(400, 800); // Dart duration (400-800ms)
}

export function cardinalGridMovement() {
    // Update distance traveled in current direction
    this.gridDistance += Math.hypot(this.vel.x, this.vel.y);

    // Check if we need to change direction
    if (this.gridDistance >= this.gridTargetDistance ||
        (this.gridDirection.x === 0 && this.gridDirection.y === 0)) {
        this.chooseNewGridDirection();
    }

    // Move at constant speed in the chosen direction
    const speed = this.config.speed;
    this.vel.x = this.gridDirection.x * speed;
    this.vel.y = this.gridDirection.y * speed;

    // Add slight bias toward player when choosing directions
    if (this.targetPlayer && Math.random() < 0.3) {
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;

        // Find the cardinal direction that gets us closest to the player
        let bestDirection = this.gridDirection;
        let bestDot = -2;

        for (const dir of this.gridDirections) {
            const dot = dir.x * dx + dir.y * dy;
            if (dot > bestDot) {
                bestDot = dot;
                bestDirection = dir;
            }
        }

        // Sometimes use the best direction toward player
        if (Math.random() < 0.4) {
            this.gridDirection = bestDirection;
        }
    }
}

export function chooseNewGridDirection() {
    // Choose a random cardinal direction
    const dirIndex = Math.floor(random(0, this.gridDirections.length));
    this.gridDirection = this.gridDirections[dirIndex];

    // Set a new target distance to travel
    this.gridTargetDistance = random(60, 150); // Distance before changing direction
    this.gridDistance = 0; // Reset distance counter
}

export function wavyMovement() {
    if (!this.targetPlayer) return;

    // Update wavy time
    this.wavyTime += 16; // Assume 60fps, add ~16ms per frame

    // Calculate base direction toward player
    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
        // Base movement toward player
        const baseSpeed = this.config.speed * 0.6; // Reduced base speed
        let baseVelX = (dx / distance) * baseSpeed;
        let baseVelY = (dy / distance) * baseSpeed;

        // Add wavy motion perpendicular to the player direction
        const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
        const waveOffset = Math.sin(this.wavyTime * this.wavyFrequency) * this.wavyAmplitude;

        // Convert wave offset to velocity
        const waveVelX = Math.cos(perpAngle) * waveOffset * 0.01;
        const waveVelY = Math.sin(perpAngle) * waveOffset * 0.01;

        // Combine base movement with wave motion
        this.vel.x = baseVelX + waveVelX;
        this.vel.y = baseVelY + waveVelY;

        // Apply speed limit to prevent too fast movement
        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
        const maxSpeed = this.config.speed * 1.1; // Allow slightly higher speed

        if (currentSpeed > maxSpeed) {
            this.vel.x = (this.vel.x / currentSpeed) * maxSpeed;
            this.vel.y = (this.vel.y / currentSpeed) * maxSpeed;
        }
    }
}

export function knightMovement() {
    if (!this.targetPlayer) return;

    const now = frameClock.now;

    // Update knight move timer
    this.knightMoveTimer += 16; // Assume 60fps, ~16ms per frame

    if (!this.knightMoving) {
        // Time to start a new knight move
        if (this.knightMoveTimer >= this.knightMoveDuration) {
            this.startKnightMove();
        } else {
            // Drift slowly toward player when not making knight moves
            const dx = this.targetPlayer.x - this.x;
            const dy = this.targetPlayer.y - this.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 1) {
                const driftSpeed = 0.3;
                this.vel.x = (dx / distance) * driftSpeed;
                this.vel.y = (dy / distance) * driftSpeed;
            }
        }
    } else {
        // Execute the knight move with burst movement
        const moveProgress = (now - this.knightMoveStartTime) / 300; // 300ms move duration

        if (moveProgress >= 1) {
            // Move completed
            this.knightMoving = false;
            this.knightMoveTimer = 0;
            this.knightMoveDuration = 800 + Math.random() * 400; // Next move in 800-1200ms
            this.vel.x = 0;
            this.vel.y = 0;
        } else {
            // Burst movement toward target with easing
            const easeProgress = 1 - Math.pow(1 - moveProgress, 3); // Ease out cubic
            const dx = this.knightTargetX - this.x;
            const dy = this.knightTargetY - this.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 1) {
                const burstSpeed = this.config.speed * 3; // 3x normal speed for burst
                this.vel.x = (dx / distance) * burstSpeed * (1 - easeProgress);
                this.vel.y = (dy / distance) * burstSpeed * (1 - easeProgress);
            }
        }
    }
}

export function startKnightMove() {
    if (!this.targetPlayer) return;

    // Calculate L-shaped knight moves (like chess knight: 2 squares in one direction, 1 in perpendicular)
    const knightMoves = [
        { x: 2, y: 1 },   { x: 2, y: -1 },
        { x: -2, y: 1 },  { x: -2, y: -1 },
        { x: 1, y: 2 },   { x: 1, y: -2 },
        { x: -1, y: 2 },  { x: -1, y: -2 }
    ];

    // Choose a random knight move
    const move = knightMoves[Math.floor(Math.random() * knightMoves.length)];
    const moveDistance = 80; // Distance for each "square" in the L-move

    // Calculate target position
    this.knightTargetX = this.x + (move.x * moveDistance);
    this.knightTargetY = this.y + (move.y * moveDistance);

    // Keep target within screen bounds
    const margin = 50;
    this.knightTargetX = Math.max(margin, Math.min(this.width - margin, this.knightTargetX));
    this.knightTargetY = Math.max(margin, Math.min(this.height - margin, this.knightTargetY));

    // Start the move
    this.knightMoving = true;
    this.knightMoveStartTime = frameClock.now;
}

export function spiralBurstMovement() {
    if (!this.targetPlayer) return;

    const now = frameClock.now;

    // Initialize spiral properties if not set
    if (this.spiralAngle === undefined) {
        this.spiralAngle = 0;
        this.spiralRadius = 150;
        this.spiralCenter = { x: this.targetPlayer.x, y: this.targetPlayer.y };
        this.burstTimer = 0;
        this.burstCooldown = 0;
        this.spiralState = 'spiraling'; // 'spiraling' or 'bursting'
    }

    // Update timers
    this.burstTimer += 16; // Assume 60fps
    this.burstCooldown -= 16;

    switch (this.spiralState) {
        case 'spiraling':
            // Spiral movement using sinusoids
            this.spiralAngle += 0.02; // Spiral speed

            // Update spiral center to slowly follow player
            const centerLerpSpeed = 0.005;
            this.spiralCenter.x += (this.targetPlayer.x - this.spiralCenter.x) * centerLerpSpeed;
            this.spiralCenter.y += (this.targetPlayer.y - this.spiralCenter.y) * centerLerpSpeed;

            // Calculate spiral position with sinusoidal variation
            const radiusVariation = Math.sin(this.spiralAngle * 3) * 30; // Radius varies with sine wave
            const currentRadius = this.spiralRadius + radiusVariation;

            // Double sinusoid for complex spiral pattern
            const spiralX = this.spiralCenter.x + Math.cos(this.spiralAngle) * currentRadius;
            const spiralY = this.spiralCenter.y + Math.sin(this.spiralAngle * 1.3) * currentRadius; // Different frequency for Y

            // Move toward spiral position
            const dx = spiralX - this.x;
            const dy = spiralY - this.y;
            const spiralAcceleration = 0.015;
            this.vel.x = dx * spiralAcceleration;
            this.vel.y = dy * spiralAcceleration;

            // Check if ready to burst (random chance and cooldown)
            if (this.burstCooldown <= 0 && Math.random() < 0.015) {
                this.startSpiralBurst();
            }
            break;

        case 'bursting':
            // Burst toward player like other enemies
            if (this.burstTimer >= 800) { // 800ms burst duration
                this.spiralState = 'spiraling';
                this.burstTimer = 0;
                this.burstCooldown = 2000 + Math.random() * 1000; // 2-3 second cooldown
            }
            // Burst movement is handled by the burst velocity set in startSpiralBurst
            break;
    }
}

export function startSpiralBurst() {
    if (!this.targetPlayer) return;

    // Calculate burst direction toward player
    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
        // Set burst velocity
        const burstSpeed = this.config.speed * 3; // 3x normal speed for burst
        this.vel.x = (dx / distance) * burstSpeed;
        this.vel.y = (dy / distance) * burstSpeed;
    }

    this.spiralState = 'bursting';
    this.burstTimer = 0;
}

export function heavyCrawlMovement() {
    if (!this.targetPlayer) return;

    // Slow, relentless movement toward player
    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 0) {
        // Very slow but steady movement
        const crawlSpeed = this.config.speed * 0.5; // Even slower than base speed
        this.vel.x = (dx / distance) * crawlSpeed;
        this.vel.y = (dy / distance) * crawlSpeed;
    }

    // Add heavy momentum - resist velocity changes (makes them harder to knock around)
    const momentum = 0.95; // High momentum retention
    this.vel.x *= momentum;
    this.vel.y *= momentum;

    // Add slight wobble to show the weight/effort of movement
    const heavyWobble = Math.sin(frameClock.now * 0.003) * 0.05;
    this.vel.x += heavyWobble;
    this.vel.y += Math.cos(frameClock.now * 0.003) * 0.05;
}

// Geometric Movement Patterns
export function triangleMovement() {
    if (!this.targetPlayer) return;

    // Initialize triangle burst movement properties
    if (this.triangleBurstState === undefined) {
        this.triangleBurstState = 'waiting'; // 'waiting', 'bursting'
        this.triangleBurstTimer = 0;
        // WASP: shorter burst, much longer wait; others: standard timing
        this.triangleBurstDuration = this.type === 'WASP' ? 400  : 1000;
        this.triangleWaitDuration  = this.type === 'WASP' ? 2800 : 1800;
        this.burstDirection = { x: 0, y: 0 };
        this.burstStartPos = { x: this.x, y: this.y };
        this.burstDistance = 0;
    }

    this.triangleBurstTimer += 16; // Assume 60fps

    // Screen-based burst distance — WASPs dart farther per burst
    const screenSize = Math.min(window.innerWidth, window.innerHeight);
    const minBurstDistance = this.type === 'WASP' ? screenSize / 5 : screenSize / 7;
    const maxBurstDistance = this.type === 'WASP' ? screenSize / 3 : screenSize / 5;

    switch (this.triangleBurstState) {
        case 'waiting':
            // Apply friction to slow down
            this.vel.x *= 0.88;
            this.vel.y *= 0.88;

            if (this.triangleBurstTimer >= this.triangleWaitDuration) {
                // Choose burst direction — WASPs bias away from player when too close
                let angle = Math.random() * Math.PI * 2;
                if (this.type === 'WASP') {
                    const dxP = this.targetPlayer.x - this.x;
                    const dyP = this.targetPlayer.y - this.y;
                    const distP = Math.hypot(dxP, dyP);
                    if (distP < 280) {
                        // Retreat: bias burst in the direction away from player
                        angle = Math.atan2(-dyP, -dxP) + (Math.random() - 0.5) * 0.8;
                    }
                }
                this.burstDistance = minBurstDistance + Math.random() * (maxBurstDistance - minBurstDistance);

                this.burstDirection.x = Math.cos(angle);
                this.burstDirection.y = Math.sin(angle);

                this.burstStartPos.x = this.x;
                this.burstStartPos.y = this.y;
                this.triangleBurstState = 'bursting';
                this.triangleBurstTimer = 0;
            }
            break;

        case 'bursting':
            // Calculate how far we've moved from start position
            const movedDistance = Math.hypot(
                this.x - this.burstStartPos.x,
                this.y - this.burstStartPos.y
            );

            // Continue bursting if we haven't reached target distance
            if (movedDistance < this.burstDistance && this.triangleBurstTimer < this.triangleBurstDuration) {
                const burstSpeed = this.config.speed * 3.5; // Very fast burst speed
                this.vel.x = this.burstDirection.x * burstSpeed;
                this.vel.y = this.burstDirection.y * burstSpeed;
            } else {
                // Burst complete, switch to waiting
                this.triangleBurstState = 'waiting';
                this.triangleBurstTimer = 0;
            }
            break;
    }
}

export function calculateTriangleVertices() {
    if (!this.targetPlayer) return [];

    const radius = 120;
    const vertices = [];
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 2; // Start at top
        vertices.push({
            x: this.targetPlayer.x + Math.cos(angle) * radius,
            y: this.targetPlayer.y + Math.sin(angle) * radius
        });
    }
    return vertices;
}

export function squareMovement() {
    if (!this.targetPlayer) return;

    // Initialize square burst movement properties
    if (this.squareBurstState === undefined) {
        this.squareBurstState = 'waiting'; // 'waiting', 'bursting'
        this.squareBurstTimer = 0;
        this.squareBurstDuration = 1200; // 1.2 second burst
        this.squareWaitDuration = 2000; // 2 second wait between bursts
        this.burstDirection = { x: 0, y: 0 };
        this.burstStartPos = { x: this.x, y: this.y };
        this.burstDistance = 0;
    }

    this.squareBurstTimer += 16; // Assume 60fps

    // Calculate screen-based burst distance (1/5 to 1/7 of screen size)
    const screenSize = Math.min(window.innerWidth, window.innerHeight);
    const minBurstDistance = screenSize / 7;
    const maxBurstDistance = screenSize / 5;

    switch (this.squareBurstState) {
        case 'waiting':
            // Apply friction to slow down
            this.vel.x *= 0.85;
            this.vel.y *= 0.85;

            if (this.squareBurstTimer >= this.squareWaitDuration) {
                // Choose random horizontal or vertical direction
                const isHorizontal = Math.random() < 0.5;
                this.burstDistance = minBurstDistance + Math.random() * (maxBurstDistance - minBurstDistance);

                if (isHorizontal) {
                    this.burstDirection.x = Math.random() < 0.5 ? 1 : -1;
                    this.burstDirection.y = 0;
                } else {
                    this.burstDirection.x = 0;
                    this.burstDirection.y = Math.random() < 0.5 ? 1 : -1;
                }

                this.burstStartPos.x = this.x;
                this.burstStartPos.y = this.y;
                this.squareBurstState = 'bursting';
                this.squareBurstTimer = 0;
            }
            break;

        case 'bursting':
            // Calculate how far we've moved from start position
            const movedDistance = Math.hypot(
                this.x - this.burstStartPos.x,
                this.y - this.burstStartPos.y
            );

            // Continue bursting if we haven't reached target distance
            if (movedDistance < this.burstDistance && this.squareBurstTimer < this.squareBurstDuration) {
                const burstSpeed = this.config.speed * 3.0; // Fast burst speed
                this.vel.x = this.burstDirection.x * burstSpeed;
                this.vel.y = this.burstDirection.y * burstSpeed;
            } else {
                // Burst complete, switch to waiting
                this.squareBurstState = 'waiting';
                this.squareBurstTimer = 0;
            }
            break;
    }
}

export function calculateSquareVertices() {
    if (!this.targetPlayer) return [];

    const radius = 100;
    const vertices = [];
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4; // 45 degree offset
        vertices.push({
            x: this.targetPlayer.x + Math.cos(angle) * radius,
            y: this.targetPlayer.y + Math.sin(angle) * radius
        });
    }
    return vertices;
}

export function diamondMovement() {
    if (!this.targetPlayer) return;

    // Initialize diamond movement properties
    if (this.diamondProgress === undefined) {
        this.diamondProgress = 0;
        this.diamondVertices = this.calculateDiamondVertices();
        this.currentVertex = 0;
        this.diamondBurstState = 'waiting'; // 'waiting', 'bursting'
        this.diamondBurstTimer = 0;
        this.diamondBurstDuration = 400; // 400ms quick burst
        this.diamondWaitDuration = 800; // 800ms wait between bursts
    }

    this.diamondBurstTimer += 16; // Assume 60fps

    // Quick burst movement system for diamonds
    switch (this.diamondBurstState) {
        case 'waiting':
            // Apply strong friction to stop quickly
            this.vel.x *= 0.85;
            this.vel.y *= 0.85;

            if (this.diamondBurstTimer >= this.diamondWaitDuration) {
                this.diamondBurstState = 'bursting';
                this.diamondBurstTimer = 0;
            }
            break;

        case 'bursting':
            // Quick darting movement toward current vertex
            const currentTarget = this.diamondVertices[this.currentVertex];
            const dx = currentTarget.x - this.x;
            const dy = currentTarget.y - this.y;
            const distance = Math.hypot(dx, dy);

            if (distance < 15) { // Reached vertex
                this.currentVertex = (this.currentVertex + 1) % 4;
                this.diamondVertices = this.calculateDiamondVertices(); // Recalculate around player
            }

            // Very fast darting movement
            if (distance > 0) {
                const dartSpeed = this.config.speed * 3.0; // Very fast burst
                this.vel.x = (dx / distance) * dartSpeed;
                this.vel.y = (dy / distance) * dartSpeed;
            }

            if (this.diamondBurstTimer >= this.diamondBurstDuration) {
                this.diamondBurstState = 'waiting';
                this.diamondBurstTimer = 0;
            }
            break;
    }
}

export function calculateDiamondVertices() {
    if (!this.targetPlayer) return [];

    const radius = 80;
    return [
        { x: this.targetPlayer.x, y: this.targetPlayer.y - radius }, // Top
        { x: this.targetPlayer.x + radius, y: this.targetPlayer.y }, // Right
        { x: this.targetPlayer.x, y: this.targetPlayer.y + radius }, // Bottom
        { x: this.targetPlayer.x - radius, y: this.targetPlayer.y }  // Left
    ];
}

export function hexagonMovement() {
    if (!this.targetPlayer) return;

    // Initialize hexagon movement properties
    if (this.hexagonProgress === undefined) {
        this.hexagonProgress = 0;
        this.hexagonVertices = this.calculateHexagonVertices();
        this.currentVertex = 0;
        this.hexagonBurstState = 'waiting'; // 'waiting', 'bursting'
        this.hexagonBurstTimer = 0;
        this.hexagonBurstDuration = 1200; // 1.2 second burst
        this.hexagonWaitDuration = 4000; // 4 second LONG wait between bursts (Titans are slow)
    }

    this.hexagonBurstTimer += 16; // Assume 60fps

    // Slow, heavy burst movement system for hexagons (Titans)
    switch (this.hexagonBurstState) {
        case 'waiting':
            // Apply heavy friction to come to near halt
            this.vel.x *= 0.95;
            this.vel.y *= 0.95;

            if (this.hexagonBurstTimer >= this.hexagonWaitDuration) {
                this.hexagonBurstState = 'bursting';
                this.hexagonBurstTimer = 0;
            }
            break;

        case 'bursting':
            // Heavy, imposing movement toward current vertex
            const currentTarget = this.hexagonVertices[this.currentVertex];
            const dx = currentTarget.x - this.x;
            const dy = currentTarget.y - this.y;
            const distance = Math.hypot(dx, dy);

            if (distance < 30) { // Reached vertex
                this.currentVertex = (this.currentVertex + 1) % 6;
                this.hexagonVertices = this.calculateHexagonVertices(); // Recalculate around player
            }

            // Powerful but measured burst movement
            if (distance > 0) {
                const titanBurstSpeed = this.config.speed * 2.0; // Strong but not too fast
                this.vel.x = (dx / distance) * titanBurstSpeed;
                this.vel.y = (dy / distance) * titanBurstSpeed;
            }

            if (this.hexagonBurstTimer >= this.hexagonBurstDuration) {
                this.hexagonBurstState = 'waiting';
                this.hexagonBurstTimer = 0;
            }
            break;
    }
}

export function calculateHexagonVertices() {
    if (!this.targetPlayer) return [];

    const radius = 140;
    const vertices = [];
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        vertices.push({
            x: this.targetPlayer.x + Math.cos(angle) * radius,
            y: this.targetPlayer.y + Math.sin(angle) * radius
        });
    }
    return vertices;
}

export function tankMovement() {
    if (!this.targetPlayer) return;

    // Initialize tank movement properties
    if (this.tankState === undefined) {
        this.tankState = 'moving'; // 'moving', 'aiming', 'firing', 'rotating'
        this.tankTimer = 0;
        this.tankMoveDuration = 2000; // 2.0 seconds of movement for longer arcs
        this.tankAimDuration = 300; // 0.3 seconds to aim turret (faster, was 500)
        this.tankFiringDuration = 1000; // 1.0 seconds firing window (longer, was 800)
        this.tankRotationDuration = 200; // 0.2 seconds to rotate hull (faster, was 300)

        // Separate hull and turret angles
        this.tankHullAngle = Math.random() * Math.PI * 2; // Random initial direction
        this.tankTurretAngle = 0;
        this.tankTurretTargetAngle = 0;
        this.tankTurretStartAngle = 0;
        this.tankHullStartAngle = 0;
        this.tankHullTargetAngle = 0;
    }

    this.tankTimer += 16; // Assume 60fps

    switch (this.tankState) {
        case 'moving':
            // Smart tactical movement - try to flank player
            const dx = this.targetPlayer.x - this.x;
            const dy = this.targetPlayer.y - this.y;
            const distanceToPlayer = Math.hypot(dx, dy);

            // Calculate ideal flanking position (perpendicular to player's movement)
            const playerVelX = this.targetPlayer.vel ? this.targetPlayer.vel.x : 0;
            const playerVelY = this.targetPlayer.vel ? this.targetPlayer.vel.y : 0;
            const playerSpeed = Math.hypot(playerVelX, playerVelY);

            let targetAngle = this.tankHullAngle;

            if (playerSpeed > 0.5) {
                // Player is moving - try to flank them
                const playerAngle = Math.atan2(playerVelY, playerVelX);
                const flankAngle = playerAngle + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);

                // Calculate position to move toward for flanking
                const flankDistance = 200 + Math.random() * 100; // 200-300 pixels away
                const flankX = this.targetPlayer.x + Math.cos(flankAngle) * flankDistance;
                const flankY = this.targetPlayer.y + Math.sin(flankAngle) * flankDistance;

                targetAngle = Math.atan2(flankY - this.y, flankX - this.x);
            } else {
                // Player is stationary - circle around them
                const circleAngle = Math.atan2(dy, dx) + Math.PI/2;
                targetAngle = circleAngle;
            }

            // Smooth rotation toward target angle
            let angleDiff = targetAngle - this.tankHullAngle;
            if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const rotationSpeed = 0.03; // Faster rotation for better positioning
            this.tankHullAngle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), rotationSpeed);

            // Move forward
            const moveSpeed = this.config.speed * 2.2;
            this.vel.x = Math.cos(this.tankHullAngle) * moveSpeed;
            this.vel.y = Math.sin(this.tankHullAngle) * moveSpeed;

            if (this.tankTimer >= this.tankMoveDuration) {
                // Sudden stop and start aiming
                this.tankState = 'aiming';
                this.tankTimer = 0;
                this.tankTurretStartAngle = this.tankTurretAngle;
            }
            break;

        case 'aiming':
            // Come to sudden stop
            this.vel.x *= 0.7; // Quick deceleration
            this.vel.y *= 0.7;

            // Smart turret aiming with lead prediction
            const aimDx = this.targetPlayer.x - this.x;
            const aimDy = this.targetPlayer.y - this.y;
            const distance = Math.hypot(aimDx, aimDy);

            // Calculate player velocity for lead prediction
            const aimPlayerVelX = this.targetPlayer.vel ? this.targetPlayer.vel.x : 0;
            const aimPlayerVelY = this.targetPlayer.vel ? this.targetPlayer.vel.y : 0;
            const aimPlayerSpeed = Math.hypot(aimPlayerVelX, aimPlayerVelY);

            // Predict where player will be in 0.5 seconds
            const predictionTime = 0.5;
            const predictedX = this.targetPlayer.x + aimPlayerVelX * predictionTime;
            const predictedY = this.targetPlayer.y + aimPlayerVelY * predictionTime;

            // Calculate angle to predicted position
            const predDx = predictedX - this.x;
            const predDy = predictedY - this.y;
            let desiredAngle = Math.atan2(predDy, predDx);

            // If player is moving slowly or close, aim directly at player
            if (aimPlayerSpeed < 0.5 || distance < 150) {
                desiredAngle = Math.atan2(aimDy, aimDx);
            }

            // Limit turret rotation to ±60° from hull direction
            const maxTurretOffset = Math.PI / 3; // 60 degrees
            const hullAngle = this.tankHullAngle;

            // Calculate relative angle from hull direction
            let relativeAngle = desiredAngle - hullAngle;
            if (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
            if (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

            // Clamp to ±60° range
            relativeAngle = Math.max(-maxTurretOffset, Math.min(maxTurretOffset, relativeAngle));
            this.tankTurretTargetAngle = hullAngle + relativeAngle;

            // Smoothly rotate turret toward target with easing
            const aimProgress = this.tankTimer / this.tankAimDuration;
            if (aimProgress >= 1) {
                this.tankTurretAngle = this.tankTurretTargetAngle;
                this.tankState = 'firing';
                this.tankTimer = 0;
            } else {
                // Smooth interpolation with easing
                const easedProgress = 1 - Math.pow(1 - aimProgress, 3); // Ease-out cubic
                const angleDiff = this.tankTurretTargetAngle - this.tankTurretStartAngle;
                let adjustedAngleDiff = angleDiff;
                if (adjustedAngleDiff > Math.PI) adjustedAngleDiff -= Math.PI * 2;
                if (adjustedAngleDiff < -Math.PI) adjustedAngleDiff += Math.PI * 2;

                this.tankTurretAngle = this.tankTurretStartAngle + adjustedAngleDiff * easedProgress;
            }
            break;

        case 'firing':
            // Stay completely still while firing
            this.vel.x *= 0.9;
            this.vel.y *= 0.9;

            // Keep turret aimed at player within rotation limits
            const fireDx = this.targetPlayer.x - this.x;
            const fireDy = this.targetPlayer.y - this.y;
            const fireDesiredAngle = Math.atan2(fireDy, fireDx);

            // Apply same rotation limits during firing
            const fireMaxTurretOffset = Math.PI / 3; // 60 degrees
            const fireHullAngle = this.tankHullAngle;

            let fireRelativeAngle = fireDesiredAngle - fireHullAngle;
            if (fireRelativeAngle > Math.PI) fireRelativeAngle -= Math.PI * 2;
            if (fireRelativeAngle < -Math.PI) fireRelativeAngle += Math.PI * 2;

            fireRelativeAngle = Math.max(-fireMaxTurretOffset, Math.min(fireMaxTurretOffset, fireRelativeAngle));
            this.tankTurretAngle = fireHullAngle + fireRelativeAngle;

            if (this.tankTimer >= this.tankFiringDuration) {
                // Start rotation to new direction
                this.tankState = 'rotating';
                this.tankTimer = 0;

                // Choose new movement direction that's compatible with turret position
                // Hull should face roughly the same direction as turret (within ±120°)
                const currentTurretAngle = this.tankTurretAngle;
                const maxHullOffset = Math.PI * 2/3; // 120 degrees
                const randomOffset = (Math.random() - 0.5) * maxHullOffset * 2;

                this.tankHullStartAngle = this.tankHullAngle;
                this.tankHullTargetAngle = currentTurretAngle + randomOffset;
            }
            break;

        case 'rotating':
            // Stay still while rotating hull and turret together
            this.vel.x *= 0.9;
            this.vel.y *= 0.9;

            // Animate hull rotation with easing
            const rotationProgress = this.tankTimer / this.tankRotationDuration;
            if (rotationProgress >= 1) {
                // Rotation complete, start moving
                this.tankHullAngle = this.tankHullTargetAngle;
                this.tankTurretAngle = this.tankHullTargetAngle; // Turret follows hull
                this.tankState = 'moving';
                this.tankTimer = 0;
            } else {
                // Smooth interpolation with easing
                const easedProgress = 1 - Math.pow(1 - rotationProgress, 3); // Ease-out cubic
                let angleDiff = this.tankHullTargetAngle - this.tankHullStartAngle;

                // Handle angle wrapping
                if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                this.tankHullAngle = this.tankHullStartAngle + angleDiff * easedProgress;
                this.tankTurretAngle = this.tankHullAngle; // Turret rotates with hull
            }
            break;
    }

    // Update visual rotation for drawing (hull faces movement direction)
    this.faceAngle = this.tankHullAngle;

    // Store turret angle for drawing
    if (!this.tankTurretAngle) this.tankTurretAngle = 0;
}

export function arcMovement() {
    if (!this.targetPlayer) return;

    // Initialize arc movement properties
    if (this.arcState === undefined) {
        this.arcState = 'swooping'; // 'swooping', 'charging', 'firing'
        this.arcTimer = 0;
        this.arcSwoopDuration = 3000; // 3 seconds of swooping
        this.arcChargeDuration = 1200; // 1.2 seconds to charge laser
        this.arcFiringDuration = 800; // 0.8 seconds firing window

        // Arc parameters
        this.arcCenter = { x: this.x, y: this.y };
        this.arcRadius = 120 + Math.random() * 80; // 120-200 radius
        this.arcStartAngle = Math.random() * Math.PI * 2;
        this.arcSweepDirection = Math.random() > 0.5 ? 1 : -1; // Clockwise or counter-clockwise
        this.arcSweepSpeed = 0.8 + Math.random() * 0.4; // 0.8-1.2 radians per second

        // Laser charging properties
        this.laserCharging = false;
        this.laserChargeProgress = 0;
        this.canShoot = false;
    }

    this.arcTimer += 16; // Assume 60fps

    switch (this.arcState) {
        case 'swooping':
            this.canShoot = false; // Cannot shoot while swooping

            // Update arc center to slowly follow player
            const centerFollowSpeed = 0.02;
            this.arcCenter.x += (this.targetPlayer.x - this.arcCenter.x) * centerFollowSpeed;
            this.arcCenter.y += (this.targetPlayer.y - this.arcCenter.y) * centerFollowSpeed;

            // Calculate current position on arc
            const arcProgress = (this.arcTimer / this.arcSwoopDuration);
            const currentAngle = this.arcStartAngle + (this.arcSweepDirection * this.arcSweepSpeed * arcProgress * 2 * Math.PI);

            // Target position on arc
            const targetX = this.arcCenter.x + Math.cos(currentAngle) * this.arcRadius;
            const targetY = this.arcCenter.y + Math.sin(currentAngle) * this.arcRadius;

            // Move toward arc position with swooping speed
            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const distance = Math.hypot(dx, dy);

            if (distance > 0) {
                const swoopSpeed = this.config.speed * 1.2; // Fast swooping
                this.vel.x = (dx / distance) * swoopSpeed;
                this.vel.y = (dy / distance) * swoopSpeed;

                // Face movement direction for swooping
                this.faceAngle = Math.atan2(dy, dx);
            }

            if (this.arcTimer >= this.arcSwoopDuration) {
                this.arcState = 'charging';
                this.arcTimer = 0;
                this.laserCharging = true;
                this.laserChargeProgress = 0;
            }
            break;

        case 'charging':
            // Come to a complete stop and charge laser
            this.vel.x *= 0.8;
            this.vel.y *= 0.8;

            // Smoothly aim at player while charging
            const chargeDx = this.targetPlayer.x - this.x;
            const chargeDy = this.targetPlayer.y - this.y;
            const targetAngle = Math.atan2(chargeDy, chargeDx);

            // Smooth rotation animation
            let angleDiff = targetAngle - this.faceAngle;
            if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const rotationSpeed = 0.08; // Smooth rotation speed
            this.faceAngle += angleDiff * rotationSpeed;

            // Update charge progress
            this.laserChargeProgress = Math.min(this.arcTimer / this.arcChargeDuration, 1);

            if (this.arcTimer >= this.arcChargeDuration) {
                this.arcState = 'firing';
                this.arcTimer = 0;
                this.canShoot = true; // Enable shooting
                this.laserCharging = false;
            }
            break;

        case 'firing':
            // Stay completely still while firing
            this.vel.x *= 0.9;
            this.vel.y *= 0.9;

            // Keep aiming at player
            const fireDx = this.targetPlayer.x - this.x;
            const fireDy = this.targetPlayer.y - this.y;
            this.faceAngle = Math.atan2(fireDy, fireDx);

            if (this.arcTimer >= this.arcFiringDuration) {
                // Prepare for next arc
                this.arcState = 'swooping';
                this.arcTimer = 0;
                this.canShoot = false;
                this.laserCharging = false;
                this.laserChargeProgress = 0;

                // Generate new arc parameters
                this.arcRadius = 120 + Math.random() * 80;
                this.arcStartAngle = Math.atan2(this.y - this.targetPlayer.y, this.x - this.targetPlayer.x); // Start from current relative position
                this.arcSweepDirection = Math.random() > 0.5 ? 1 : -1;
                this.arcSweepSpeed = 0.8 + Math.random() * 0.4;
            }
            break;
    }
}

export function zigzagMovement() {
    if (!this.targetPlayer) return;

    // Initialize zigzag movement properties
    if (this.zigzagState === undefined) {
        this.zigzagState = 'moving';
        this.zigzagTimer = 0;
        this.zigzagDirection = { x: 0, y: 0 };
        this.zigzagChangeInterval = 300 + Math.random() * 400; // 300-700ms between direction changes
        this.zigzagIntensity = 0.8 + Math.random() * 0.4; // 0.8-1.2 intensity
        this.zigzagBaseSpeed = this.config.speed;
    }

    this.zigzagTimer += 16; // Assume 60fps

    // Change direction randomly like a real wasp/hummingbird
    if (this.zigzagTimer >= this.zigzagChangeInterval) {
        this.zigzagTimer = 0;
        this.zigzagChangeInterval = 300 + Math.random() * 400; // Randomize next interval
        this.zigzagIntensity = 0.8 + Math.random() * 0.4; // Randomize intensity

        // Calculate general direction toward player
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (distance > 0) {
            const baseDirectionX = dx / distance;
            const baseDirectionY = dy / distance;

            // Add random zigzag component
            const zigzagAngle = Math.random() * Math.PI * 2;
            const zigzagStrength = 0.6 + Math.random() * 0.8; // 0.6-1.4 strength

            // Combine base direction with random zigzag
            this.zigzagDirection.x = baseDirectionX * 0.7 + Math.cos(zigzagAngle) * zigzagStrength;
            this.zigzagDirection.y = baseDirectionY * 0.7 + Math.sin(zigzagAngle) * zigzagStrength;

            // Normalize and apply intensity
            const zigzagMagnitude = Math.hypot(this.zigzagDirection.x, this.zigzagDirection.y);
            if (zigzagMagnitude > 0) {
                this.zigzagDirection.x = (this.zigzagDirection.x / zigzagMagnitude) * this.zigzagIntensity;
                this.zigzagDirection.y = (this.zigzagDirection.y / zigzagMagnitude) * this.zigzagIntensity;
            }
        }
    }

    // Apply zigzag movement with some smoothing
    const smoothing = 0.15; // Smooth transitions between direction changes
    const targetVelX = this.zigzagDirection.x * this.zigzagBaseSpeed;
    const targetVelY = this.zigzagDirection.y * this.zigzagBaseSpeed;

    this.vel.x += (targetVelX - this.vel.x) * smoothing;
    this.vel.y += (targetVelY - this.vel.y) * smoothing;

    // Add small random jitter for wasp-like twitchiness
    const jitterStrength = 0.1;
    this.vel.x += (Math.random() - 0.5) * jitterStrength;
    this.vel.y += (Math.random() - 0.5) * jitterStrength;

    // Face movement direction
    if (Math.hypot(this.vel.x, this.vel.y) > 0.1) {
        this.faceAngle = Math.atan2(this.vel.y, this.vel.x);
    }

    // Occasional hover behavior (like hummingbirds)
    if (Math.random() < 0.005) { // 0.5% chance per frame
        this.vel.x *= 0.3;
        this.vel.y *= 0.3;
        this.zigzagTimer = this.zigzagChangeInterval - 100; // Force direction change soon
    }
}

export function tacticalHoverMovement() {
    if (!this.targetPlayer) return;

    // Initialize tactical hover state
    if (this.tacticalState === undefined) {
        this.tacticalState = 'positioning'; // positioning, hovering, darting
        this.tacticalTimer = 0;
        this.hoverPosition = null;
        this.dartTarget = null;
        this.burstCount = 0;
        this.lastBurstTime = 0;
        this.safeDistance = 180 + Math.random() * 120; // 180-300px safe distance
        this.hoverDuration = 1500 + Math.random() * 1000; // 1.5-2.5s hover time
        this.dartSpeed = this.config.speed * 3.5; // Fast dart speed
    }

    this.tacticalTimer += 16; // Assume 60fps

    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distanceToPlayer = Math.hypot(dx, dy);

    switch (this.tacticalState) {
        case 'positioning':
            // Move to a safe distance from player
            if (distanceToPlayer < this.safeDistance) {
                // Too close - retreat
                const retreatAngle = Math.atan2(-dy, -dx);
                this.vel.x += Math.cos(retreatAngle) * 0.3;
                this.vel.y += Math.sin(retreatAngle) * 0.3;
            } else if (distanceToPlayer > this.safeDistance + 80) {
                // Too far - approach
                const approachAngle = Math.atan2(dy, dx);
                this.vel.x += Math.cos(approachAngle) * 0.2;
                this.vel.y += Math.sin(approachAngle) * 0.2;
            } else {
                // Good distance - start hovering
                this.tacticalState = 'hovering';
                this.tacticalTimer = 0;
                this.hoverPosition = { x: this.x, y: this.y };
                this.burstCount = 0;
            }

            // Apply drag to slow down
            this.vel.x *= 0.85;
            this.vel.y *= 0.85;
            break;

        case 'hovering':
            // Hover in place with small movements
            if (this.hoverPosition) {
                const hoverDx = this.hoverPosition.x - this.x;
                const hoverDy = this.hoverPosition.y - this.y;
                this.vel.x += hoverDx * 0.02;
                this.vel.y += hoverDy * 0.02;
            }

            // Add small random hover movements
            this.vel.x += (Math.random() - 0.5) * 0.1;
            this.vel.y += (Math.random() - 0.5) * 0.1;

            // Apply strong drag for hovering
            this.vel.x *= 0.7;
            this.vel.y *= 0.7;

            // Check if it's time to dart away
            if (this.tacticalTimer >= this.hoverDuration || distanceToPlayer < this.safeDistance * 0.7) {
                this.tacticalState = 'darting';
                this.tacticalTimer = 0;

                // Choose dart direction - perpendicular to player direction with some randomness
                const playerAngle = Math.atan2(dy, dx);
                const perpAngle = playerAngle + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
                const randomOffset = (Math.random() - 0.5) * Math.PI * 0.4; // ±36 degrees
                const dartAngle = perpAngle + randomOffset;

                const dartDistance = 150 + Math.random() * 100; // 150-250px dart
                this.dartTarget = {
                    x: this.x + Math.cos(dartAngle) * dartDistance,
                    y: this.y + Math.sin(dartAngle) * dartDistance
                };
            }
            break;

        case 'darting':
            // Dart rapidly to new position
            if (this.dartTarget) {
                const dartDx = this.dartTarget.x - this.x;
                const dartDy = this.dartTarget.y - this.y;
                const dartDistance = Math.hypot(dartDx, dartDy);

                if (dartDistance > 20) {
                    // Still darting
                    const dartAngle = Math.atan2(dartDy, dartDx);
                    this.vel.x = Math.cos(dartAngle) * this.dartSpeed;
                    this.vel.y = Math.sin(dartAngle) * this.dartSpeed;
                } else {
                    // Reached dart target - return to positioning
                    this.tacticalState = 'positioning';
                    this.tacticalTimer = 0;
                    this.dartTarget = null;
                    this.hoverPosition = null;
                    this.safeDistance = 180 + Math.random() * 120; // Randomize new safe distance
                    this.hoverDuration = 1500 + Math.random() * 1000; // Randomize new hover duration
                }
            }
            break;
    }

    // Limit maximum speed
    const maxSpeed = this.tacticalState === 'darting' ? this.dartSpeed : this.config.speed;
    const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
    if (currentSpeed > maxSpeed) {
        this.vel.x = (this.vel.x / currentSpeed) * maxSpeed;
        this.vel.y = (this.vel.y / currentSpeed) * maxSpeed;
    }
}

export function waspDartMovement() {
    if (!this.targetPlayer) return;

    // Initialize wasp strategic movement properties
    if (this.waspMovementState === undefined) {
        this.waspMovementState = {
            zigzagPhase: Math.random() * Math.PI * 2, // Random starting phase
            arcPhase: Math.random() * Math.PI * 2,
            lastDirectionChange: frameClock.now,
            currentDirection: Math.random() * Math.PI * 2, // Random initial direction
            directionChangeInterval: 1200 + Math.random() * 800, // 1.2-2.0 seconds between direction changes (more strategic)
            preferredDistance: 140 + Math.random() * 60, // 140-200 pixels from player (more consistent)
            strategicPhase: 0, // For more controlled movement phases
        };
    }

    const state = this.waspMovementState;
    const now = frameClock.now;

    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distanceToPlayer = Math.hypot(dx, dy);
    const angleToPlayer = Math.atan2(dy, dx);

    // Update phases for more controlled motion
    state.zigzagPhase += 0.12; // Slower zig-zag frequency for more controlled movement
    state.arcPhase += 0.05; // Slower arc frequency
    state.strategicPhase += 0.03; // Strategic positioning phase

    // Change direction periodically for strategic wasp movement
    if (now - state.lastDirectionChange > state.directionChangeInterval) {
        state.lastDirectionChange = now;
        state.directionChangeInterval = 1000 + Math.random() * 1000; // Longer intervals for more strategic movement

        // Strategic positioning based on distance and player movement
        if (Math.random() < 0.7) {
            // Strategic circling - maintain optimal distance
            const circleDirection = Math.random() < 0.5 ? 1 : -1;
            const angleVariation = (Math.random() - 0.5) * 0.4; // Reduced randomness
            state.currentDirection = angleToPlayer + (Math.PI * 0.5 * circleDirection) + angleVariation;
        } else {
            // Strategic approach/retreat based on distance
            if (distanceToPlayer > state.preferredDistance * 1.3) {
                // Too far - strategic approach
                state.currentDirection = angleToPlayer + (Math.random() - 0.5) * 0.3; // More precise approach
            } else if (distanceToPlayer < state.preferredDistance * 0.8) {
                // Too close - strategic retreat
                state.currentDirection = angleToPlayer + Math.PI + (Math.random() - 0.5) * 0.4; // More controlled retreat
            } else {
                // Optimal distance - strategic flanking
                const flankDirection = Math.random() < 0.5 ? Math.PI * 0.5 : -Math.PI * 0.5;
                state.currentDirection = angleToPlayer + flankDirection + (Math.random() - 0.5) * 0.2;
            }
        }
    }

    // Create strategic wasp movement with controlled zig-zag and positioning
    const zigzagIntensity = 0.3; // Reduced zig-zag intensity for more controlled movement
    const arcIntensity = 0.2; // Reduced arc intensity
    const strategicIntensity = 0.4; // Strategic positioning influence

    // Combine base direction with controlled motions
    const zigzagOffset = Math.sin(state.zigzagPhase) * zigzagIntensity;
    const arcOffset = Math.sin(state.arcPhase) * Math.cos(state.arcPhase * 0.7) * arcIntensity;
    const strategicOffset = Math.sin(state.strategicPhase) * strategicIntensity;

    const finalAngle = state.currentDirection + zigzagOffset + arcOffset + strategicOffset;

    // Wasp speed is more consistent with strategic variations
    const baseSpeed = this.config.speed * 1.5; // Slightly reduced base speed
    const speedVariation = 1 + Math.sin(state.strategicPhase * 0.8) * 0.15; // ±15% speed variation (reduced)
    const currentSpeed = baseSpeed * speedVariation;

    // Apply movement
    this.vel.x = Math.cos(finalAngle) * currentSpeed;
    this.vel.y = Math.sin(finalAngle) * currentSpeed;

    // Face movement direction for realistic wasp orientation
    this.faceAngle = finalAngle;

    // Add minimal strategic micro-adjustments (reduced frequency and intensity)
    if (Math.random() < 0.15) { // Reduced frequency
        this.vel.x += (Math.random() - 0.5) * 0.3; // Reduced intensity
        this.vel.y += (Math.random() - 0.5) * 0.3;
    }

    // Apply speed limit
    const totalSpeed = Math.hypot(this.vel.x, this.vel.y);
    const maxSpeed = this.config.speed * 2.2; // Reduced max speed for more controlled movement
    if (totalSpeed > maxSpeed) {
        this.vel.x = (this.vel.x / totalSpeed) * maxSpeed;
        this.vel.y = (this.vel.y / totalSpeed) * maxSpeed;
    }
}

export function crossMovement() {
    if (!this.targetPlayer) return;

    // Initialize cross scrolling movement properties
    if (this.crossScrollState === undefined) {
        this.crossScrollState = 'moving';
        this.scrollDirection = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        this.scrollSign = Math.random() < 0.5 ? 1 : -1; // Direction within axis
        this.scrollStartPos = { x: this.x, y: this.y };
        this.scrollDistance = 0;
        this.maxScrollDistance = (window.innerWidth + window.innerHeight) / 4; // 1/4 of combined screen dimensions
        this.scrollTimer = 0;
        this.scrollDuration = 3000 + Math.random() * 2000; // 3-5 seconds per direction
    }

    this.scrollTimer += 16; // Assume 60fps

    // Calculate how far we've scrolled from start position
    if (this.scrollDirection === 'horizontal') {
        this.scrollDistance = Math.abs(this.x - this.scrollStartPos.x);
    } else {
        this.scrollDistance = Math.abs(this.y - this.scrollStartPos.y);
    }

    // Check if we should reverse direction
    const shouldReverse = this.scrollDistance >= this.maxScrollDistance ||
                         this.scrollTimer >= this.scrollDuration;

    if (shouldReverse) {
        // Reverse direction
        this.scrollSign *= -1;
        this.scrollStartPos.x = this.x;
        this.scrollStartPos.y = this.y;
        this.scrollDistance = 0;
        this.scrollTimer = 0;

        // Occasionally switch between horizontal and vertical
        if (Math.random() < 0.3) { // 30% chance to switch axis
            this.scrollDirection = this.scrollDirection === 'horizontal' ? 'vertical' : 'horizontal';
        }
    }

    // Apply scrolling movement
    const scrollSpeed = this.config.speed * 1.2; // Steady scrolling speed

    if (this.scrollDirection === 'horizontal') {
        this.vel.x = this.scrollSign * scrollSpeed;
        this.vel.y *= 0.95; // Slight friction on perpendicular axis
    } else {
        this.vel.y = this.scrollSign * scrollSpeed;
        this.vel.x *= 0.95; // Slight friction on perpendicular axis
    }
}

export function circleMovement() {
    if (!this.targetPlayer) return;

    // Initialize circle movement properties
    if (this.circleAngle === undefined) {
        this.circleAngle = Math.random() * Math.PI * 2;
        this.circleRadius = 320; // Much larger distance from player (was 220)
        this.circleDirection = Math.random() < 0.5 ? 1 : -1; // Random clockwise/counterclockwise
    }

    // Calculate distance to player
    const dx = this.x - this.targetPlayer.x;
    const dy = this.y - this.targetPlayer.y;
    const distanceToPlayer = Math.hypot(dx, dy);

    // Adjust radius based on distance to maintain consistent orbit
    const targetRadius = this.circleRadius;
    const radiusDifference = distanceToPlayer - targetRadius;

    // Gradually adjust angle to orbit around player
    this.circleAngle += this.circleDirection * 0.015; // Steady orbital speed

    // Calculate ideal orbital position
    const idealX = this.targetPlayer.x + Math.cos(this.circleAngle) * targetRadius;
    const idealY = this.targetPlayer.y + Math.sin(this.circleAngle) * targetRadius;

    // Move toward ideal orbital position
    const toIdealX = idealX - this.x;
    const toIdealY = idealY - this.y;

    // Apply movement with reduced speed for safer approach
    const moveSpeed = this.config.speed * 0.5; // Reduced from 0.8 to 0.5
    this.vel.x = toIdealX * moveSpeed * 0.03; // Reduced from 0.05 to 0.03
    this.vel.y = toIdealY * moveSpeed * 0.03;

    // Add conservative distance correction if too close or far from player
    if (Math.abs(radiusDifference) > 40) { // Increased tolerance from 20 to 40
        const correctionStrength = 0.01; // Reduced from 0.02 to 0.01
        this.vel.x += (dx / distanceToPlayer) * radiusDifference * correctionStrength;
        this.vel.y += (dy / distanceToPlayer) * radiusDifference * correctionStrength;
    }

    // Prowler-specific: Retreat if player gets too close (cautious behavior)
    if (this.type === 'PROWLER' && distanceToPlayer < 180) {
        const retreatStrength = 0.8;
        this.vel.x += (dx / distanceToPlayer) * retreatStrength;
        this.vel.y += (dy / distanceToPlayer) * retreatStrength;
        // Increase orbit radius when retreating
        this.circleRadius = Math.min(400, this.circleRadius + 2);
    }
}

export function stationaryMovement() {
    // Turrets are completely stationary - no movement
    this.vel.x = 0;
    this.vel.y = 0;

    // Turrets still rotate to face the player for aiming
    if (this.targetPlayer) {
        const dx = this.targetPlayer.x - this.x;
        const dy = this.targetPlayer.y - this.y;
        this.targetFaceAngle = Math.atan2(dy, dx);
    }
}

export function keepDistanceMovement() {
    // Prowler: aggressive dive/strafe/retreat state machine
    if (!this.targetPlayer) return;

    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const now = frameClock.now;

    // Lazy-init state machine
    if (!this.prowlerState) {
        this.prowlerState = 'patrol';
        this.prowlerStateEnd = now + 2000 + Math.random() * 1500;
        this.prowlerStrafeDir = Math.random() > 0.5 ? 1 : -1;
    }

    // State transitions
    if (now > this.prowlerStateEnd) {
        if (this.prowlerState === 'patrol') {
            // Decide: dive in if reasonably close, otherwise keep patrolling
            if (distance < 400) {
                this.prowlerState = 'dive';
                this.prowlerStateEnd = now + 700 + Math.random() * 500;
            } else {
                this.prowlerStrafeDir *= -1; // reverse strafe
                this.prowlerStateEnd = now + 1500 + Math.random() * 1500;
            }
        } else if (this.prowlerState === 'dive') {
            this.prowlerState = 'retreat';
            this.prowlerStateEnd = now + 1000 + Math.random() * 800;
        } else { // retreat
            this.prowlerState = 'patrol';
            this.prowlerStateEnd = now + 1800 + Math.random() * 1200;
            this.prowlerStrafeDir *= -1;
        }
    }

    const strafeAngle = angle + Math.PI / 2 * this.prowlerStrafeDir;

    switch (this.prowlerState) {
        case 'patrol': {
            // Orbit at ~280px, drifting laterally
            const idealDist = 280 + Math.sin(now * 0.0009) * 40;
            if (distance < idealDist - 30) {
                this.vel.x += Math.cos(angle + Math.PI) * 0.06;
                this.vel.y += Math.sin(angle + Math.PI) * 0.06;
            } else if (distance > idealDist + 30) {
                this.vel.x += Math.cos(angle) * 0.05;
                this.vel.y += Math.sin(angle) * 0.05;
            }
            // Lateral strafe
            this.vel.x += Math.cos(strafeAngle) * 0.04;
            this.vel.y += Math.sin(strafeAngle) * 0.04;
            break;
        }
        case 'dive': {
            // Rush toward player
            this.vel.x += Math.cos(angle) * 0.18;
            this.vel.y += Math.sin(angle) * 0.18;
            break;
        }
        case 'retreat': {
            // Pull back hard + strafe to avoid return fire
            this.vel.x += Math.cos(angle + Math.PI) * 0.14;
            this.vel.y += Math.sin(angle + Math.PI) * 0.14;
            this.vel.x += Math.cos(strafeAngle) * 0.05;
            this.vel.y += Math.sin(strafeAngle) * 0.05;
            break;
        }
    }

    // Speed cap (dive is faster)
    const maxSpd = this.config.speed * (this.prowlerState === 'dive' ? 3.0 : 1.8);
    const spd = Math.hypot(this.vel.x, this.vel.y);
    if (spd > maxSpd) {
        this.vel.x = (this.vel.x / spd) * maxSpd;
        this.vel.y = (this.vel.y / spd) * maxSpd;
    }

    // Always face the player for aiming
    this.targetFaceAngle = angle;
}

// ── Weaver Spin-Up Movement ──────────────────────────────────────────────
export function weaverSpinupMovement(gameEngine) {
    if (!this.targetPlayer) return;
    const now = frameClock.now;

    if (this.weaverState === undefined) {
        this.weaverState = 'spinning_up';
        this.weaverStateStart = now;
        this.weaverSpinRate = 0;
        this.weaverMaxSpinRate = 0.26;    // rad/frame at full spin
        this.weaverSpinUpDuration = 2400; // ms to reach full spin
        this.weaverArcDuration = 3600;    // ms spent zooming in an arc
        this.weaverCooldownDuration = 2600;
        this.weaverArcAngle = Math.atan2(this.y - this.targetPlayer.y, this.x - this.targetPlayer.x);
        this.weaverArcRadius = 220;
        this.weaverArcDirection = Math.random() < 0.5 ? 1 : -1; // CW or CCW
        this.weaverLastShot = 0;
        this.weaverFireInterval = 130; // ms between spiral shots
    }

    switch (this.weaverState) {

        case 'spinning_up': {
            // Hold position with friction
            this.vel.x *= 0.88;
            this.vel.y *= 0.88;

            const progress = Math.min(1, (now - this.weaverStateStart) / this.weaverSpinUpDuration);
            // Ease-in acceleration curve
            const easedProgress = progress * progress;
            this.weaverSpinRate = easedProgress * this.weaverMaxSpinRate;
            this.faceAngle += this.weaverSpinRate;

            // Spark particles intensify as spin builds
            const ge = gameEngine;
            if (ge?.particlePool && Math.random() < 0.25 * easedProgress) {
                const sparkAngle = Math.random() * Math.PI * 2;
                const sparkDist = this.radius * (0.8 + Math.random() * 0.5);
                const p = ge.particlePool.get(
                    this.x + Math.cos(sparkAngle) * sparkDist,
                    this.y + Math.sin(sparkAngle) * sparkDist,
                    'starSparkle'
                );
                if (p) {
                    p.vel.x = Math.cos(sparkAngle) * (1 + easedProgress * 3);
                    p.vel.y = Math.sin(sparkAngle) * (1 + easedProgress * 3);
                    p.color = this.type === 'SENTINEL' ? '#44ff88' : '#ffff44';
                    p.radius = 1 + Math.random() * 2;
                    p.life = 10 + Math.random() * 20;
                }
            }

            if (progress >= 1) {
                // Sentinel must fire 3 bursts before it arcs/moves
                if (this.type === 'SENTINEL' && (this.sentinelBurstsFired || 0) < 3) {
                    // Hold at max spin rate while waiting for remaining bursts
                    this.weaverSpinRate = this.weaverMaxSpinRate;
                    break;
                }
                this.weaverState = 'arcing';
                this.weaverStateStart = now;
                // Lock arc orbit parameters to current distance
                const dx = this.x - this.targetPlayer.x;
                const dy = this.y - this.targetPlayer.y;
                this.weaverArcAngle = Math.atan2(dy, dx);
                const dist = Math.hypot(dx, dy);
                this.weaverArcRadius = Math.max(140, Math.min(dist, 280));
                this.weaverArcDirection = Math.random() < 0.5 ? 1 : -1;
                this.weaverLastShot = now;
                // Sentinel: reset sweep angle for the new arc cycle
                if (this.type === 'SENTINEL') {
                    this.sentinelSweepAngle = Math.random() * Math.PI * 2;
                    this.sentinelSweepLastDamage = 0;
                    this.sentinelArcPhase = 0; // Reset sinusoidal arc phase
                }
            }
            break;
        }

        case 'arcing': {
            const progress = Math.min(1, (now - this.weaverStateStart) / this.weaverArcDuration);

            // Continue spinning at full rate
            this.faceAngle += this.weaverSpinRate;

            // Orbit around player — angular velocity creates the arc
            const orbitRate = 0.028 * this.weaverArcDirection; // rad/frame
            this.weaverArcAngle += orbitRate;

            // Compute effective orbit radius — Sentinel adds sinusoidal radial wave
            let orbitR = this.weaverArcRadius;
            if (this.type === 'SENTINEL') {
                if (this.sentinelArcPhase === undefined) this.sentinelArcPhase = 0;
                this.sentinelArcPhase += 0.052; // wave frequency
                orbitR += Math.sin(this.sentinelArcPhase) * 70; // ±70 px radial oscillation
                orbitR = Math.max(60, orbitR); // never collapse to center
            }

            const targetX = this.targetPlayer.x + Math.cos(this.weaverArcAngle) * orbitR;
            const targetY = this.targetPlayer.y + Math.sin(this.weaverArcAngle) * orbitR;
            const tdx = targetX - this.x;
            const tdy = targetY - this.y;
            const dist = Math.hypot(tdx, tdy);
            const arcSpeed = this.config.speed * 2.8;
            if (dist > 0) {
                this.vel.x = (tdx / dist) * arcSpeed;
                this.vel.y = (tdy / dist) * arcSpeed;
            }

            if (this.type !== 'SENTINEL') {
                // Weaver: fire spiral lasers — each shot fires in the CURRENT faceAngle direction,
                // creating the spiral pattern as faceAngle rotates at weaverMaxSpinRate
                if (now - this.weaverLastShot > this.weaverFireInterval) {
                    this.shootSpiralLaser(gameEngine);
                    this.weaverLastShot = now;
                }
            }
            // Sentinel firing is handled by updateSentinelSweep() via updateShooting()

            // Trailing sparks during arc
            const ge = gameEngine;
            if (ge?.particlePool && Math.random() < 0.35) {
                const p = ge.particlePool.get(this.x, this.y, 'starSparkle');
                if (p) {
                    p.vel.x = -this.vel.x * 0.3 + (Math.random() - 0.5) * 2;
                    p.vel.y = -this.vel.y * 0.3 + (Math.random() - 0.5) * 2;
                    p.color = this.type === 'SENTINEL' ? '#00ff00' : '#ffff00';
                    p.radius = 1 + Math.random() * 2;
                    p.life = 12 + Math.random() * 18;
                }
            }

            if (progress >= 1) {
                this.weaverState = 'cooldown';
                this.weaverStateStart = now;
                // Sentinel: reset burst counter so it fires 3 more times next spin-up
                if (this.type === 'SENTINEL') this.sentinelBurstsFired = 0;
            }
            break;
        }

        case 'cooldown': {
            // Friction to brake
            this.vel.x *= 0.9;
            this.vel.y *= 0.9;

            // Wind down spin
            this.weaverSpinRate *= 0.965;
            if (this.weaverSpinRate > 0.001) {
                this.faceAngle += this.weaverSpinRate;
            }

            const progress = Math.min(1, (now - this.weaverStateStart) / this.weaverCooldownDuration);
            if (progress >= 1) {
                this.weaverState = 'spinning_up';
                this.weaverStateStart = now;
                this.weaverSpinRate = 0;
            }
            break;
        }
    }
}

// ── Wasp Zigzag Movement ────────────────────────────────────────────────
export function waspZigzagMovement() {
    if (!this.targetPlayer) return;
    const now = frameClock.now;

    if (this.waspZigzagState === undefined) {
        this.waspZigzagState = 'zigzagging';
        this.waspZigzagCount = 0;
        this.waspZigzagMax = 3 + Math.floor(Math.random() * 3); // 3–5 segments
        this.waspZigzagDirection = Math.random() < 0.5 ? 1 : -1;
        this.waspZigzagTimer = now;
        this.waspZigzagSegmentDuration = 350 + Math.random() * 150;
        this.waspZigzagCooldownTimer = 0;
        this.waspZigzagCooldownDuration = 2200 + Math.random() * 600;
    }

    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const dist = Math.hypot(dx, dy);
    const toPlayerAngle = dist > 0 ? Math.atan2(dy, dx) : 0;
    // Perpendicular to player direction, flipping each segment
    const perpAngle = toPlayerAngle + (Math.PI / 2) * this.waspZigzagDirection;

    switch (this.waspZigzagState) {
        case 'zigzagging': {
            const zigSpeed = this.config.speed * 2.6;
            this.vel.x = Math.cos(perpAngle) * zigSpeed;
            this.vel.y = Math.sin(perpAngle) * zigSpeed;
            // Slight drift toward player
            if (dist > 0) {
                this.vel.x += (dx / dist) * 0.4;
                this.vel.y += (dy / dist) * 0.4;
            }
            if (now - this.waspZigzagTimer > this.waspZigzagSegmentDuration) {
                this.waspZigzagDirection *= -1;
                this.waspZigzagCount++;
                this.waspZigzagTimer = now;
                this.waspZigzagSegmentDuration = 280 + Math.random() * 200;
                if (this.waspZigzagCount >= this.waspZigzagMax) {
                    this.waspZigzagState = 'cooldown';
                    this.waspZigzagCooldownTimer = now;
                    this.waspZigzagCount = 0;
                    this.waspZigzagMax = 3 + Math.floor(Math.random() * 3);
                    this.waspZigzagCooldownDuration = 2000 + Math.random() * 800;
                }
            }
            break;
        }
        case 'cooldown':
            // Friction to slow to a hover
            this.vel.x *= 0.88;
            this.vel.y *= 0.88;
            if (now - this.waspZigzagCooldownTimer > this.waspZigzagCooldownDuration) {
                this.waspZigzagState = 'zigzagging';
                this.waspZigzagTimer = now;
                this.waspZigzagDirection = Math.random() < 0.5 ? 1 : -1;
            }
            break;
    }
}

// ── Boulder (Titan) Movement ─────────────────────────────────────────────
export function boulderMovement() {
    if (!this.targetPlayer) return;
    const now = frameClock.now;

    if (this.boulderState === undefined) {
        this.boulderState = 'idle';
        this.boulderIdleTimer = now;
        this.boulderIdleDuration = 1500 + Math.random() * 1000;
        this.boulderAngle = 0;
        this.boulderMaxSpeed = this.config.speed * 3.0;
        this.boulderAccel = 0.06;
    }

    const dx = this.targetPlayer.x - this.x;
    const dy = this.targetPlayer.y - this.y;
    const distToPlayer = Math.hypot(dx, dy);
    const currentSpeed = Math.hypot(this.vel.x, this.vel.y);

    switch (this.boulderState) {
        case 'idle':
            // Friction to halt
            this.vel.x *= 0.92;
            this.vel.y *= 0.92;
            if (now - this.boulderIdleTimer > this.boulderIdleDuration) {
                this.boulderState = 'approaching';
                this.boulderAngle = Math.atan2(dy, dx); // Lock direction now
                this.boulderMaxSpeed = this.config.speed * 3.0;
            }
            break;

        case 'approaching': {
            // Accelerate in locked direction
            this.vel.x += Math.cos(this.boulderAngle) * this.boulderAccel;
            this.vel.y += Math.sin(this.boulderAngle) * this.boulderAccel;
            // Cap speed
            if (currentSpeed > this.boulderMaxSpeed) {
                this.vel.x = (this.vel.x / currentSpeed) * this.boulderMaxSpeed;
                this.vel.y = (this.vel.y / currentSpeed) * this.boulderMaxSpeed;
            }
            // Dot product of velocity with direction to player: negative = passed player
            const velDotToPlayer = this.vel.x * dx + this.vel.y * dy;
            const passedPlayer = velDotToPlayer < 0 && distToPlayer < 180;
            if (passedPlayer || currentSpeed >= this.boulderMaxSpeed * 0.92) {
                this.boulderState = 'braking';
            }
            break;
        }

        case 'braking':
            // Strong friction
            this.vel.x *= 0.93;
            this.vel.y *= 0.93;
            if (currentSpeed < 0.18) {
                this.vel.x = 0;
                this.vel.y = 0;
                this.boulderState = 'idle';
                this.boulderIdleTimer = now;
                this.boulderIdleDuration = 1200 + Math.random() * 1000;
            }
            break;
    }
}

// ── Formation Hold (Galaga-mode squadron rest position) ──────────────────
// Steers softly toward the assigned formation slot with a sine-wave breath.
// AI evasion/dodge is suppressed while in formation so the squadron looks
// coordinated. When the sortie runner triggers a dive, `inFormation` flips
// off and the enemy reverts to its native movePattern.
export function formationHoldMovement() {
    if (!this.formationSlot) return;
    const now = frameClock.now;
    const breathe = Math.sin(now * 0.0015 + (this.formationSlot.phase || 0)) * 6;
    const swayX = Math.cos(now * 0.0009 + (this.formationSlot.phase || 0)) * 4;
    const targetX = this.formationSlot.x + swayX;
    const targetY = this.formationSlot.y + breathe;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0.5) {
        const pull = Math.min(dist, 8) * 0.18;
        const a = Math.atan2(dy, dx);
        this.vel.x = this.vel.x * 0.78 + Math.cos(a) * pull * 0.22;
        this.vel.y = this.vel.y * 0.78 + Math.sin(a) * pull * 0.22;
    } else {
        this.vel.x *= 0.85;
        this.vel.y *= 0.85;
    }

    // Face downward toward player by default; small wobble keeps it alive.
    if (this.targetPlayer) {
        const desired = Math.atan2(this.targetPlayer.y - this.y, this.targetPlayer.x - this.x);
        // Lerp face angle toward player
        const cur = this.faceAngle || desired;
        let diff = desired - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.faceAngle = cur + diff * 0.04;
    }
}
