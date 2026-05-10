// Pure bullet-update step.
//
// Handles BOTH player and enemy bullets — they have different shapes
// (player bullets carry weapon-upgrade flags; enemy bullets carry a
// firing-pattern + per-shape state), so the per-tick step is split
// internally into `updatePlayerBullet` + `updateEnemyBullet`. The
// `updateBullet` dispatcher picks based on `bullet.kind`.
//
// Extracted from `js/modules/player/bullet.js` and
// `js/modules/enemy/enemy-bullet.js`'s `update()` methods as part of
// the Phase-1 multiplayer engine refactor (see
// `docs/Multiplayer Rust Client Engine – 2026-05-07.md`, §"Phase 1:
// Engine refactor"). Mirrors the agent-A pattern that landed for ship
// physics in `js/sim/ship.js`.
//
// This module is **byte-for-byte equivalent** to the existing solo
// bullet-update behavior — same lifetime ticks, same homing turn rates,
// same per-shape velocity adjustments, same despawn rules. No tuning
// happens here.
//
// What lives here:
//   - Position integration (x += vx [* tickScale]).
//   - Lifetime decay (frames-elapsed for player bullets; distance-from-
//     start for enemy bullets; time-elapsed for persistent bullets).
//   - Homing logic (player: predictive lead-time; enemy: per-pattern).
//   - Per-shape velocity adjustments (sine, spiral, missile, mine, …).
//   - Despawn rules (out-of-bounds, expired lifetime, hit consumed).
//   - Helix offset (player Rail-Driver bullets).
//
// What does NOT live here (stays on `Bullet` / `EnemyBullet`):
//   - Sprite/shape rendering (drawTriangleBullet, drawMineBullet, …).
//   - Hit-flash / fade-in visual timers (presentation only).
//   - Particle FX on spawn / despawn.
//   - Audio events.
//   - Trail ring-buffer (presentation; lives on the entity).
//   - Anything talking to `gameEngine` directly (collision detection,
//     particle pools, etc. — the wrapper translates events into those
//     calls).
//   - Hit-detection (collision.js's job in a future session).

// ── Despawn-event marker (reserved for future collision migration) ────
// `updateBullet` doesn't currently emit despawn events because the
// caller can read `bullet.active` directly. Kept as a constant so the
// wrapper can pre-allocate an event buffer of the right shape.
export const BULLET_EVENT_DESPAWN = 'despawn';

// ── Player bullet ─────────────────────────────────────────────────────

/**
 * Per-tick player-bullet update. Mutates `bullet` in place.
 *
 * @param {import('./state.js').BulletState} bullet
 * @param {import('./state.js').BulletUpdateContext} ctx
 * @param {Array<*>} _events
 */
export function updatePlayerBullet(bullet, ctx, _events) {
    if (!bullet.active) return bullet;

    bullet.life++;

    // Lifetime expiry — extended by LONG_RANGE upgrades. The original
    // code rounds at the call site; we mirror that exactly.
    const effectiveMaxLife = Math.round(bullet.maxLife * bullet.rangeMultiplier);
    if (bullet.life >= effectiveMaxLife) {
        bullet.active = false;
        bullet.expiredByRange = true; // wrapper triggers disappear-puff
        return bullet;
    }

    // Fade factor for the final 35% of life — drawn-side only, but the
    // entity's `radius` is also derived from it (visual shrink).
    const remaining = 1 - bullet.life / effectiveMaxLife;
    bullet.fadeFactor = remaining < 0.35 ? remaining / 0.35 : 1.0;
    bullet.radius = bullet.baseRadius * (0.3 + 0.7 * bullet.fadeFactor);

    // Homing — adjust velocity toward best target. The actual target
    // pick is presentation-adjacent (it reaches into entity pools), so
    // the wrapper supplies the chosen target via `ctx.homingTarget`.
    if (bullet.homing && ctx.homingTarget) {
        applyPlayerHoming(bullet, ctx.homingTarget, ctx.bulletSpeed);
    }

    // Movement.
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;

    // Helix offset — Rail Driver double-helix bullets oscillate
    // perpendicular to the rail axis. We apply the *delta* of the sine
    // each frame so the underlying rail position still advances by
    // `vel` exactly. Two bullets with phases 0 and π cross every half
    // period.
    if (bullet.helixActive) {
        const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
        const ux = -bullet.vy / speed;
        const uy =  bullet.vx / speed;
        const t = bullet.life;
        const sNow  = Math.sin(t       * bullet.helixFreq + bullet.helixPhase);
        const sPrev = Math.sin((t - 1) * bullet.helixFreq + bullet.helixPhase);
        const delta = (sNow - sPrev) * bullet.helixAmplitude;
        bullet.x += ux * delta;
        bullet.y += uy * delta;
    }

    // Boundary check (bullet disappears off-field). The original used
    // a 50px margin and checked field OR window dimensions; the
    // wrapper passes whichever is in scope.
    const w = ctx.boundaryWidth;
    const h = ctx.boundaryHeight;
    if (bullet.x < -50 || bullet.x > w + 50 ||
        bullet.y < -50 || bullet.y > h + 50) {
        bullet.active = false;
        bullet.expiredByBounds = true;
    }

    return bullet;
}

/**
 * Predictive-lead homing — adjust velocity toward the chosen target's
 * predicted position 8 frames ahead.
 *
 * Mirrors `Bullet.applyHoming()` from `js/modules/player/bullet.js`.
 * @param {import('./state.js').BulletState} bullet
 * @param {{x:number, y:number, vel?:{x:number,y:number}}} target
 * @param {number} bulletSpeed
 */
function applyPlayerHoming(bullet, target, bulletSpeed) {
    const leadTime = 8;
    const predictedX = target.x + (target.vel ? target.vel.x * leadTime : 0);
    const predictedY = target.y + (target.vel ? target.vel.y * leadTime : 0);

    const dx = predictedX - bullet.x;
    const dy = predictedY - bullet.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0) return;

    const desiredVelX = (dx / distance) * bulletSpeed;
    const desiredVelY = (dy / distance) * bulletSpeed;

    const maxTurnRate = 0.15;
    const currentAngle = Math.atan2(bullet.vy, bullet.vx);
    const desiredAngle = Math.atan2(desiredVelY, desiredVelX);

    let angleDiff = desiredAngle - currentAngle;
    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    const actualTurn = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxTurnRate);
    const newAngle = currentAngle + actualTurn;

    // Distance-based homing strength (stronger when closer).
    const homingStrength = bullet.homingStrength * (1 + (200 - Math.min(distance, 200)) / 200);

    const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
    const targetVelX = Math.cos(newAngle) * currentSpeed;
    const targetVelY = Math.sin(newAngle) * currentSpeed;

    bullet.vx = bullet.vx * (1 - homingStrength) + targetVelX * homingStrength;
    bullet.vy = bullet.vy * (1 - homingStrength) + targetVelY * homingStrength;

    // Maintain consistent speed with slight boost when homing.
    const speedAfter = Math.hypot(bullet.vx, bullet.vy);
    const targetSpeed = bulletSpeed * 1.1;
    if (speedAfter > 0) {
        bullet.vx = (bullet.vx / speedAfter) * targetSpeed;
        bullet.vy = (bullet.vy / speedAfter) * targetSpeed;
    }
}

// ── Enemy bullet ──────────────────────────────────────────────────────

/**
 * Per-tick enemy-bullet update. Mutates `bullet` in place.
 *
 * The enemy bullet is identified by `movementPattern` + `shape`. The
 * pattern drives velocity (per-frame); the shape drives despawn rules
 * (mines and persistent bullets use time-based lifetime; everything
 * else uses distance-from-start).
 *
 * @param {import('./state.js').BulletState} bullet
 * @param {import('./state.js').BulletUpdateContext} ctx
 * @param {Array<*>} _events
 */
export function updateEnemyBullet(bullet, ctx, _events) {
    if (!bullet.active) return bullet;

    // ── Apply movement pattern (mutates bullet.vel in place) ──
    applyEnemyMovementPattern(bullet, ctx);

    // ── Position update — scaled for tick rate ──
    bullet.x += bullet.vx * ctx.tickScale;
    bullet.y += bullet.vy * ctx.tickScale;

    // ── Rotation accumulator (cosmetic, but kept here so the wrapper
    // can render in lockstep). Some patterns above set `rotation`
    // directly to align with velocity; this `+=` only contributes when
    // the pattern leaves it alone.
    bullet.rotation += bullet.rotationSpeed * ctx.tickScale;

    // ── Pattern timer (seconds) ──
    bullet.patternTimer += ctx.logicTickSeconds;

    // ── Mine HP-based death (proximity bombs lose HP via collision
    // damage and despawn at 0). collision-system writes bullet.health;
    // we just observe.
    if (bullet.shape === 'mine' && bullet.health !== undefined && bullet.health <= 0) {
        bullet.active = false;
        return bullet;
    }

    // ── Lifetime / fade ──
    if (bullet.isPersistent) {
        // Time-based lifetime (mines, lightning orbs).
        const maxLife = bullet.maxLifetimeOverride || 15000;
        const age = ctx.now - bullet.creationTime;
        if (age > maxLife) {
            bullet.active = false;
            return bullet;
        }
        if (bullet.shape === 'mine') {
            bullet.life = 1.0;
        } else {
            const progress = age / maxLife;
            bullet.life = progress < 0.6 ? 1.0 : 1.0 - (progress - 0.6) / 0.4;
        }
    } else {
        // Distance-based lifetime — fades / despawns once the bullet
        // has traveled `maxRange` from its origin.
        const dist = Math.hypot(bullet.x - bullet.startX, bullet.y - bullet.startY);
        const progress = dist / bullet.maxRange;
        if (progress >= 1.0) {
            bullet.active = false;
            bullet.expiredByRange = true; // wrapper triggers disappear-effect
            return bullet;
        }
        bullet.life = progress < 0.65
            ? 1.0
            : 1.0 - (progress - 0.65) / 0.35 * 0.5; // 1.0 → 0.5
    }

    // ── Out-of-bounds despawn (no FX — too far to see) ──
    const margin = 50;
    if (bullet.x < -margin || bullet.x > ctx.boundaryWidth + margin ||
        bullet.y < -margin || bullet.y > ctx.boundaryHeight + margin) {
        bullet.active = false;
        bullet.expiredByBounds = true;
    }

    return bullet;
}

/**
 * Per-pattern velocity adjustment for enemy bullets. Mutates
 * `bullet.vx` / `bullet.vy` in place. Mirrors
 * `EnemyBullet.applyMovementPattern()` byte-for-byte.
 *
 * @param {import('./state.js').BulletState} bullet
 * @param {import('./state.js').BulletUpdateContext} ctx
 */
function applyEnemyMovementPattern(bullet, ctx) {
    if (!bullet.baseVx && !bullet.baseVy && bullet.movementPattern !== 'mine') {
        // Safety: legacy code early-returned when baseVel was missing.
        return;
    }

    const speed = Math.hypot(bullet.baseVx, bullet.baseVy);
    const baseAngle = Math.atan2(bullet.baseVy, bullet.baseVx);
    const target = ctx.targetPlayer;

    switch (bullet.movementPattern) {
        case 'aimed':
            // Standard straight movement — no modification.
            break;

        case 'mine':
            // Stationary proximity mine.
            bullet.vx = 0;
            bullet.vy = 0;
            break;

        case 'homing_mine': {
            if (target && target.active !== false) {
                const dx = target.x - bullet.x;
                const dy = target.y - bullet.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 5) {
                    bullet.vx += (dx / dist) * 0.09;
                    bullet.vy += (dy / dist) * 0.09;
                    const maxSpeed = 1.8;
                    const spd = Math.hypot(bullet.vx, bullet.vy);
                    if (spd > maxSpeed) {
                        bullet.vx = (bullet.vx / spd) * maxSpeed;
                        bullet.vy = (bullet.vy / spd) * maxSpeed;
                    }
                }
            }
            break;
        }

        case 'spread': {
            const waveFreq = 3;
            const waveAmp = 0.5;
            const perpAngle = baseAngle + Math.PI / 2;
            const waveOffset = Math.sin(bullet.patternTimer * waveFreq + bullet.patternPhase) * waveAmp;
            bullet.vx = bullet.baseVx + Math.cos(perpAngle) * waveOffset;
            bullet.vy = bullet.baseVy + Math.sin(perpAngle) * waveOffset;
            break;
        }

        case 'rapid': {
            const jitterStrength = 0.3;
            const jitterX = (ctx.rngFloat() - 0.5) * jitterStrength;
            const jitterY = (ctx.rngFloat() - 0.5) * jitterStrength;
            bullet.vx = bullet.baseVx + jitterX;
            bullet.vy = bullet.baseVy + jitterY;
            break;
        }

        case 'spiral': {
            const spiralRate = 2;
            const spiralRadius = bullet.patternTimer * 0.5;
            const spiralAngle = baseAngle + bullet.patternTimer * spiralRate;
            bullet.vx = Math.cos(spiralAngle) * speed + Math.cos(spiralAngle + Math.PI / 2) * spiralRadius * 0.1;
            bullet.vy = Math.sin(spiralAngle) * speed + Math.sin(spiralAngle + Math.PI / 2) * spiralRadius * 0.1;
            break;
        }

        case 'burst': {
            const accelFactor = 1 + bullet.patternTimer * 0.5;
            bullet.vx = bullet.baseVx * accelFactor;
            bullet.vy = bullet.baseVy * accelFactor;
            break;
        }

        case 'explosive': {
            let explosiveFactor;
            if (bullet.patternTimer < 0.5) {
                explosiveFactor = 0.3;
            } else {
                explosiveFactor = 1.5 + (bullet.patternTimer - 0.5) * 2;
            }
            bullet.vx = bullet.baseVx * explosiveFactor;
            bullet.vy = bullet.baseVy * explosiveFactor;
            break;
        }

        case 'laser': {
            const laserSpeed = Math.hypot(bullet.baseVx, bullet.baseVy) * 2;
            const laserAngle = Math.atan2(bullet.baseVy, bullet.baseVx);
            bullet.vx = Math.cos(laserAngle) * laserSpeed;
            bullet.vy = Math.sin(laserAngle) * laserSpeed;
            break;
        }

        case 'laser_beam': {
            const beamSpeed = Math.hypot(bullet.baseVx, bullet.baseVy) * 3;
            const beamAngle = Math.atan2(bullet.baseVy, bullet.baseVx);
            bullet.vx = Math.cos(beamAngle) * beamSpeed;
            bullet.vy = Math.sin(beamAngle) * beamSpeed;
            // Reduced damage for balance — was (damage || 15) * 1.5.
            bullet.damage = (bullet.damage || 3) * 1.0;
            bullet.radius = Math.max(bullet.radius, 8);
            break;
        }

        case 'missile': {
            if (target) {
                const dx = target.x - bullet.x;
                const dy = target.y - bullet.y;
                const distance = Math.hypot(dx, dy);
                if (distance > 0) {
                    const homingStrength = 0.05;
                    const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
                    bullet.vx += (dx / distance) * homingStrength;
                    bullet.vy += (dy / distance) * homingStrength;
                    const newSpeed = Math.hypot(bullet.vx, bullet.vy);
                    if (newSpeed > 0) {
                        bullet.vx = (bullet.vx / newSpeed) * currentSpeed;
                        bullet.vy = (bullet.vy / newSpeed) * currentSpeed;
                    }
                }
            }
            if (bullet.vx !== 0 || bullet.vy !== 0) {
                bullet.rotation = Math.atan2(bullet.vy, bullet.vx);
            }
            break;
        }

        case 'homing': {
            if (target) {
                const dx = target.x - bullet.x;
                const dy = target.y - bullet.y;
                const distance = Math.hypot(dx, dy);
                if (distance > 0) {
                    const homingStrength = 0.03; // Slower than missile.
                    const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
                    bullet.vx += (dx / distance) * homingStrength;
                    bullet.vy += (dy / distance) * homingStrength;
                    const newSpeed = Math.hypot(bullet.vx, bullet.vy);
                    if (newSpeed > 0) {
                        bullet.vx = (bullet.vx / newSpeed) * currentSpeed;
                        bullet.vy = (bullet.vy / newSpeed) * currentSpeed;
                    }
                }
            }
            break;
        }

        case 'titan_homing': {
            if (target) {
                const dx = target.x - bullet.x;
                const dy = target.y - bullet.y;
                const distance = Math.hypot(dx, dy);
                if (distance > 0) {
                    const homingStrength = 0.02;
                    const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
                    bullet.vx += (dx / distance) * homingStrength;
                    bullet.vy += (dy / distance) * homingStrength;
                    const newSpeed = Math.hypot(bullet.vx, bullet.vy);
                    if (newSpeed > 0) {
                        bullet.vx = (bullet.vx / newSpeed) * currentSpeed;
                        bullet.vy = (bullet.vy / newSpeed) * currentSpeed;
                    }
                }
            }
            break;
        }

        case 'titan_rocket': {
            const rocketSpeed = bullet.rocketSpeed;
            const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
            if (rocketSpeed && currentSpeed !== rocketSpeed) {
                const direction = Math.atan2(bullet.vy, bullet.vx);
                bullet.vx = Math.cos(direction) * rocketSpeed;
                bullet.vy = Math.sin(direction) * rocketSpeed;
            }
            // Track distance traveled — mutate `distanceTraveled` so the
            // wrapper can read it for explosion side-effects.
            if (bullet.distanceTraveled !== undefined) {
                const dx = bullet.x - bullet.startX;
                const dy = bullet.y - bullet.startY;
                bullet.distanceTraveled = Math.hypot(dx, dy);
                if (bullet.maxDistance && bullet.distanceTraveled >= bullet.maxDistance) {
                    bullet.active = false;
                    bullet.expiredByDistance = true; // wrapper triggers explosion FX
                }
            }
            break;
        }

        case 'missile_decelerate': {
            const deceleration = bullet.deceleration;
            const minSpeed = bullet.minSpeed; // wrapper sets these from constants
            if (deceleration === undefined || minSpeed === undefined) break;
            const currentSpeedDeccel = Math.hypot(bullet.vx, bullet.vy);
            if (currentSpeedDeccel > minSpeed) {
                const direction = Math.atan2(bullet.vy, bullet.vx);
                const newSpeed = Math.max(currentSpeedDeccel - deceleration, minSpeed);
                bullet.vx = Math.cos(direction) * newSpeed;
                bullet.vy = Math.sin(direction) * newSpeed;
            } else {
                bullet.active = false;
                bullet.expiredByDistance = true; // wrapper triggers explosion FX
            }
            // Max-distance check.
            if (bullet.maxDistance && bullet.startX !== undefined && bullet.startY !== undefined) {
                const dx = bullet.x - bullet.startX;
                const dy = bullet.y - bullet.startY;
                const distanceTraveled = Math.hypot(dx, dy);
                if (distanceTraveled >= bullet.maxDistance) {
                    bullet.active = false;
                    bullet.expiredByDistance = true;
                }
            }
            break;
        }

        case 'pulse': {
            const pulseAccel = 1 + bullet.patternTimer * 0.8;
            bullet.vx = bullet.baseVx * pulseAccel;
            bullet.vy = bullet.baseVy * pulseAccel;
            break;
        }

        case 'shield_burst': {
            const wobble = Math.sin(bullet.patternTimer * 8) * 0.2;
            const shieldPerpAngle = Math.atan2(bullet.baseVy, bullet.baseVx) + Math.PI / 2;
            bullet.vx = bullet.baseVx + Math.cos(shieldPerpAngle) * wobble;
            bullet.vy = bullet.baseVy + Math.sin(shieldPerpAngle) * wobble;
            break;
        }

        case 'wave_energy': {
            const waveFrequency = 3;
            const waveAmplitude = 15;
            const baseDirection = Math.atan2(bullet.baseVy, bullet.baseVx);
            const perpDirection = baseDirection + Math.PI / 2;
            const energyWaveOffset = Math.sin(bullet.patternTimer * waveFrequency) * waveAmplitude;
            const waveVelX = Math.cos(perpDirection) * energyWaveOffset * 0.1;
            const waveVelY = Math.sin(perpDirection) * energyWaveOffset * 0.1;
            bullet.vx = bullet.baseVx + waveVelX;
            bullet.vy = bullet.baseVy + waveVelY;
            break;
        }

        case 'energy_slash': {
            const slashDirection = Math.atan2(bullet.baseVy, bullet.baseVx);
            const curveIntensity = 0.3;
            const slashProgress = bullet.slashProgress || 0;
            const curveOffset = Math.sin(slashProgress * Math.PI) * curveIntensity;
            const perpSlashDirection = slashDirection + Math.PI / 2;
            const curveVelX = Math.cos(perpSlashDirection) * curveOffset;
            const curveVelY = Math.sin(perpSlashDirection) * curveOffset;
            bullet.vx = bullet.baseVx + curveVelX;
            bullet.vy = bullet.baseVy + curveVelY;
            const pulseIntensity = 1 + Math.sin(bullet.patternTimer * 8) * 0.1;
            bullet.vx *= pulseIntensity;
            bullet.vy *= pulseIntensity;
            break;
        }

        case 'crescent_beam':
        case 'crescent_slice':
            // Straight movement — no modification.
            break;

        case 'sine_wave': {
            bullet.sinePhase += bullet.sineFreq;
            const sineDisp = Math.sin(bullet.sinePhase) * bullet.sineAmp;
            bullet.vx = bullet.baseVx + bullet.sinePerpX * sineDisp;
            bullet.vy = bullet.baseVy + bullet.sinePerpY * sineDisp;
            // Keep needle oriented in actual travel direction.
            bullet.rotation = Math.atan2(bullet.vy, bullet.vx);
            break;
        }

        case 'sine_wave_nospin': {
            bullet.sinePhase += bullet.sineFreq;
            const snDisp = Math.sin(bullet.sinePhase) * bullet.sineAmp;
            bullet.vx = bullet.baseVx + bullet.sinePerpX * snDisp;
            bullet.vy = bullet.baseVy + bullet.sinePerpY * snDisp;
            // rotation NOT touched — outer update() ticks rotationSpeed.
            break;
        }

        case 'missile_fast_slow': {
            if (target) {
                const mDx = target.x - bullet.x;
                const mDy = target.y - bullet.y;
                const mDist = Math.hypot(mDx, mDy);
                if (mDist > 0) {
                    bullet.vx += (mDx / mDist) * 0.18;
                    bullet.vy += (mDy / mDist) * 0.18;
                }
            }
            const mSpd = Math.hypot(bullet.vx, bullet.vy);
            const mMaxSpd = bullet.patternTimer < 0.95 ? 14 : 5;
            if (mSpd > mMaxSpd && mSpd > 0) {
                bullet.vx = (bullet.vx / mSpd) * mMaxSpd;
                bullet.vy = (bullet.vy / mSpd) * mMaxSpd;
            }
            const mMinSpd = 2.5;
            if (mSpd > 0 && mSpd < mMinSpd) {
                bullet.vx = (bullet.vx / mSpd) * mMinSpd;
                bullet.vy = (bullet.vy / mSpd) * mMinSpd;
            }
            if (bullet.vx !== 0 || bullet.vy !== 0) {
                bullet.rotation = Math.atan2(bullet.vy, bullet.vx);
            }
            break;
        }
    }

    // ── Boss-rage homing nudge ──
    // Applied AFTER the per-pattern adjustment so it composes naturally
    // over straight, burst, spread, missile, etc. Gentle turn rate so
    // the player can still dodge.
    if (bullet.bossRageHoming && target) {
        const dx = target.x - bullet.x;
        const dy = target.y - bullet.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0) {
            const turn = 0.04;
            const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
            bullet.vx += (dx / distance) * turn;
            bullet.vy += (dy / distance) * turn;
            const newSpeed = Math.hypot(bullet.vx, bullet.vy);
            if (newSpeed > 0 && currentSpeed > 0) {
                bullet.vx = (bullet.vx / newSpeed) * currentSpeed;
                bullet.vy = (bullet.vy / newSpeed) * currentSpeed;
            }
        }
    }
}

// ── Dispatcher / loop helpers ─────────────────────────────────────────

/**
 * Pure bullet-update step. Dispatches to player or enemy logic based
 * on `bullet.kind`. Mutates `bullet` in place.
 *
 * Hit detection is NOT here — that's collision.js's job (future
 * session).
 *
 * @param {import('./state.js').BulletState} bullet
 * @param {import('./state.js').BulletUpdateContext} ctx
 * @param {Array<*>} events
 */
export function updateBullet(bullet, ctx, events) {
    if (bullet.kind === 'enemy') return updateEnemyBullet(bullet, ctx, events);
    return updatePlayerBullet(bullet, ctx, events);
}

/**
 * Loop helper. Calls `updateBullet()` over an array of bullets.
 *
 * @param {import('./state.js').BulletState[]} bullets
 * @param {import('./state.js').BulletUpdateContext} ctx
 * @param {Array<*>} events
 */
export function updateBullets(bullets, ctx, events) {
    for (const bullet of bullets) {
        updateBullet(bullet, ctx, events);
    }
}
