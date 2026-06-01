// Bullet projectile entity
import { GAME_CONFIG } from '../core/constants.js';
import { wrap, random, bakedBulletSpriteCache } from '../core/utils.js';
// ENMY-03 — cloak de-targeting. `isTargetable` returns true for any object with
// no `cloak` config, so this is a no-op for asteroids/mines/non-PHANTOM enemies;
// it only ever filters a PHANTOM that's currently cloaked-and-unrevealed.
import { isTargetable } from '../enemy/abilities/cloak.js';
// ENMY-07 — blink/burrow de-targeting. `isVanished` returns false for any
// object with no `blink` config, so this is a no-op for asteroids/mines/
// non-WRAITHWORM enemies; it only ever filters a WRAITHWORM that's currently
// mid-blink/underground (telegraph windup + strike).
import { isVanished } from '../enemy/abilities/blink-burrow.js';
import { frameClock } from '../core/frame-clock.js';

// Cluster bombs launch fast and decelerate (friction), so a single frame's
// movement can exceed an enemy's contact radius. Movement is sub-stepped in
// chunks no larger than this (px) with a contact + distance check at each
// sub-step so a fast bomb can't tunnel past a small target between frames.
const CLUSTER_SUBSTEP_PX = 8;

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

        // Range/lifetime — 5.100.3 — base range now covers the full
        // game field (1920×1080) so the player's shots always reach the
        // edge of the screen regardless of viewport / camera zoom. The
        // pre-5.100.3 base of 30/TICK_SCALE produced ~460 px (~24% of
        // the field) which forced players to invest LONG_RANGE stacks
        // just to be effective at typical engagement ranges. The
        // LONG_RANGE powerup is now retired (hidden from shop + wave-
        // pick); per-weapon `config.range` modifiers in weapon-data.js
        // still scale relative to this new larger baseline.
        //
        // Math: BULLET_SPEED = 16 × TICK_SCALE = 8 px/tick. To cover
        // 1920 px we need 1920 / 8 = 240 ticks. We round to 240 / TICK_SCALE
        // = 480 frames at 60 Hz @ TICK_SCALE=0.5, so ~8 s of flight —
        // generous margin so any weapon's `config.range` (0.85-1.5×)
        // still reaches the edge of the screen.
        this.maxLife = Math.round(240 / GAME_CONFIG.TICK_SCALE);
        this.rangeMultiplier = 1.0; // Set by player before firing
        this.fadeFactor = 1.0;

        // E1 (Element & Resistance) — every bullet carries an element so the
        // damage path can apply enemy resistance. Defaults to the KINETIC
        // baseline; primary fire paths stamp the firing weapon's element via
        // applyGlobalBulletUpgrades. Read by the damage path starting in E2.
        this.element = 'KINETIC';

        // Powerup effects (will be set by player when creating bullets)
        this.homing = false;
        this.homingStrength = 0;
        this.helixActive = false; // Rail-Driver helix mode (set by fireRailDriver)
        this.piercing = 0; // Number of enemies it can pierce through
        this.piercedEnemies = 0; // Track how many it has pierced
        this.hitTargets = new Set(); // Track which targets (enemies/asteroids) this bullet has already hit
        this.explosive = false;
        this.explosionRadius = 30;
        // 5.108.0 — Clear the OVERCHARGE_ROUNDS marker so a recycled
        // bullet doesn't carry the BIG-SHOT visual into its next life.
        this.overcharged = false;
        // Reset ring buffer trail
        this.trailHead = 0;
        this.trailCount = 0;
        // Phase 6 (2026-05-19) — clear cluster-bomb state so a recycled
        // bullet doesn't carry a stale stage / armed timer into its
        // next life. `cluster` is true for primary cluster bombs (set
        // by fireCluster); `subBomb` is true for sub-bomblets spawned
        // on detonation. Both share the staged life-cycle code below.
        this.cluster = false;
        this.subBomb = false;
        this.stage = null;
        this.armedAt = 0;
        this.armedDuration = 0;
        this.clusterFriction = 0;
        this.haltVelocity = 0;
        this.proximityRadius = 0;
        this.blastRadius = 0;
        this.blastDamage = 0;
        this.subBombCount = 0;
        this.subBombLifeFrames = 0;
        this._smokeFrame = 0;

        // ── New-primary behavior flags (brainstorm drop) ──
        // Ricochet (Caroms): bounce off walls + carom between enemies.
        this.bounces = 0;
        this.bounceSeekRadius = 0;
        this.chargedCaroms = false;
        // Boomerang Discs: fly out, then return to the owner.
        this.boomerang = false;
        this.boomerangOutFrames = 0;
        this.boomerangReturnAccel = 0;
        this.boomerangReturning = false;
        this.boomerangOwner = null;
        this.razorEdge = false;
        // Flak Cannon: airburst into a shrapnel ring at a set distance.
        this.flak = false;
        this.burstDistance = 0;
        this._flakDist = 0;
        this.shrapnelCount = 0;
        this.shrapnelDamage = 0;
        this.shrapnelSpeed = 0;
        this.shrapnelLifeFrames = 0;
        this.burstBlastRadius = 0;
        this.burstBlastDamage = 0;
        // Gravity Lance: per-frame pull on nearby enemies; optional implosion.
        this.gravityWell = false;
        this.pullRadius = 0;
        this.pullStrength = 0;
        this.implosion = false;
        // Mitosis Rounds (Splitter): primaries fragment on impact
        // (splitOnImpact); spawned shards re-split on kill (splitOnKill).
        this.splitOnImpact = false;
        this.splitOnKill = false;
        this.splitCount = 0;
        this.splitDamageFactor = 0;
        this.splitSpeed = 0;
        this.splitGenerations = 0;
    }

    // Phase 6 (2026-05-19) — initialize cluster-bomb state on a freshly-
    // reset bullet. Called by `fireCluster` immediately after `bulletPool.get`.
    // The caller passes the resolved config (with upgrades baked in) so
    // this method just plumbs the values onto the bullet.
    setupClusterBomb(config) {
        this.cluster = true;
        this.subBomb = false;
        // 6.26.0 — Always 'flying' (no travel/armed split). The bomb
        // detonates the moment it touches ANY enemy / asteroid / mine.
        this.stage = 'flying';
        this.armedAt = 0;
        this.armedDuration = config.armedDurationMs;
        this.clusterFriction = config.travelFriction; // < 1 → decelerates in flight
        this.haltVelocity = config.haltVelocity;       // arrival speed at the target
        this.proximityRadius = config.proximityRadius; // contact radius
        this.blastRadius = config.blastRadius;
        this.blastDamage = config.blastDamage;
        this.subBombCount = config.subBombCount;
        this.subBombSpeed = config.subBombSpeed;
        this.subBombFriction = config.subBombFriction;
        this.subBombLifeFrames = config.subBombLifeFrames;
        this.subBombBlastRadius = config.subBombBlastRadius;
        this.subBombDamage = config.subBombDamage;
        // Cluster bombs do NOT pierce / home / explode (Phase 6 design).
        this.piercing = 0;
        this.homing = false;
        this.explosive = false;
        // Override the initial velocity to the cluster-launch (muzzle) speed.
        // `this.angle` is the player's aim angle (set from the click direction
        // in player.js), so the bomb flies toward the cursor. The bomb then
        // decelerates under clusterFriction toward the target — fireCluster
        // derives initialVelocity so it arrives at clusterTargetDist at ~the
        // haltVelocity, slowing substantially over the flight.
        const speed = config.initialVelocity;
        this.vel.x = Math.cos(this.angle) * speed;
        this.vel.y = Math.sin(this.angle) * speed;
        // Charge-for-distance. The bomb detonates once it has travelled
        // `clusterTargetDist` px (set from the launch charge) if it hasn't
        // already hit something. Infinity = legacy fly-til-contact.
        this.clusterTargetDist = (config.targetDist != null) ? config.targetDist : Infinity;
        this._clusterDist = 0;
        // Generous lifetime safety net well past any sensible cursor distance;
        // the off-field cull / target-distance detonation fire long before.
        this.maxLife = Math.round(1200 / GAME_CONFIG.TICK_SCALE);
        this.rangeMultiplier = 1.0;
        // 6.26.0 — Nucleus cluster body: ~10 px core lets the per-orbit
        // satellite spheres in `_drawClusterBomb` read clearly. Per-
        // bullet orbit seed jitters the satellite arrangement so two
        // bombs in flight aren't visually identical.
        this.baseRadius = 10;
        this.radius = this.baseRadius;
        this._nucleusSpin = Math.random() * Math.PI * 2;
    }

    // Phase 6 — initialize a sub-bomblet on a freshly-reset bullet.
    // Sub-bombs spawn at the primary cluster's detonation site, fly
    // outward at random angles, decelerate, then detonate on contact
    // or end-of-flight. They reuse the staged code below but with a
    // simpler 2-stage shape (travel → detonating).
    setupSubBomblet(config, angle, speed) {
        this.cluster = false;
        this.subBomb = true;
        this.stage = 'travel';
        this.armedAt = 0;
        this.armedDuration = 0; // sub-bombs don't sit and arm
        this.clusterFriction = config.subBombFriction;
        this.haltVelocity = 0; // sub-bombs detonate on flight-out, not on halt
        this.proximityRadius = 0; // collision-system handles enemy-contact detection
        this.blastRadius = config.subBombBlastRadius;
        this.blastDamage = config.subBombDamage;
        this.subBombCount = 0; // sub-bombs don't spawn further sub-bombs
        this.subBombLifeFrames = config.subBombLifeFrames;
        this.piercing = 0;
        this.homing = false;
        this.explosive = false;
        this.angle = angle;
        this.vel.x = Math.cos(angle) * speed;
        this.vel.y = Math.sin(angle) * speed;
        this.maxLife = Math.round(120 / GAME_CONFIG.TICK_SCALE);
        this.rangeMultiplier = 1.0;
        this.baseRadius = 4;
        this.radius = this.baseRadius;
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

        // Phase 6 — cluster bomb / sub-bomblet staged update. The primary
        // cluster bomb goes travel → armed → detonate; sub-bomblets go
        // travel → detonate-on-flight-end. Both paths bypass the
        // standard bullet physics + range-fade code below.
        if (this.cluster || this.subBomb) {
            this.updateClusterStage(particlePool, enemyPool, gameEngine, gameField, asteroidPool);
            return;
        }

        // Trail ring-buffer (runs BEFORE physics so the trail captures the
        // pre-move position).
        let slot = this.trail[this.trailHead];
        if (!slot) {
            slot = { x: 0, y: 0 };
            this.trail[this.trailHead] = slot;
        }
        slot.x = this.x;
        slot.y = this.y;
        this.trailHead = (this.trailHead + 1) % this.maxTrailLength;
        if (this.trailCount < this.maxTrailLength) this.trailCount++;

        // Lifetime — extended by LONG_RANGE upgrades.
        this.life++;
        const effectiveMaxLife = Math.round(this.maxLife * this.rangeMultiplier);
        if (this.life >= effectiveMaxLife) {
            this.active = false;
            // Gravity Lance IMPLOSION — a final AoE pop where the well dies.
            if (this.gravityWell && this.implosion && gameEngine
                && typeof gameEngine.detonateSubBomblet === 'function') {
                gameEngine.detonateSubBomblet(
                    this.x, this.y,
                    Math.max(6, (this.damage || 1) * 8),
                    (this.pullRadius || 140) * 0.7,
                );
            }
            this.createDisappearPuff(gameEngine);
            if (this.onOffScreen) this.onOffScreen();
            return;
        }

        // Fade factor over the final 35% of life — drives both visual
        // alpha and the entity's render radius.
        const remaining = 1 - this.life / effectiveMaxLife;
        this.fadeFactor = remaining < 0.35 ? remaining / 0.35 : 1.0;
        this.radius = this.baseRadius * (0.3 + 0.7 * this.fadeFactor);

        // Homing — predictive lead-time target, 0.15 rad max turn per frame.
        if (this.homing) {
            this.applyHoming(enemyPool, asteroidPool, gameEngine);
        }

        // Boomerang Discs — out leg decelerates, then the disc accelerates
        // back to its owner. On the turn we clear hitTargets so the disc can
        // cut the SAME enemies again on the return leg (the double-hit).
        if (this.boomerang) {
            if (!this.boomerangReturning) {
                this.vel.x *= 0.93;
                this.vel.y *= 0.93;
                if (this.life >= this.boomerangOutFrames) {
                    this.boomerangReturning = true;
                    this.hitTargets.clear();
                    this.piercedEnemies = 0;
                    if (this.razorEdge) this.damage *= 1.6;
                }
            } else {
                const ox = this.boomerangOwner ? this.boomerangOwner.x : this.x;
                const oy = this.boomerangOwner ? this.boomerangOwner.y : this.y;
                const a = Math.atan2(oy - this.y, ox - this.x);
                const accel = this.boomerangReturnAccel || 0.55;
                this.vel.x += Math.cos(a) * accel;
                this.vel.y += Math.sin(a) * accel;
                const sp = Math.hypot(this.vel.x, this.vel.y);
                const maxSp = 14;
                if (sp > maxSp) { this.vel.x = this.vel.x / sp * maxSp; this.vel.y = this.vel.y / sp * maxSp; }
                // Caught by the owner — despawn quietly.
                if ((ox - this.x) * (ox - this.x) + (oy - this.y) * (oy - this.y) < 28 * 28) {
                    this.active = false;
                    return;
                }
            }
        }

        // Gravity Lance — drag nearby enemies toward the orb each frame.
        // Position nudge (not velocity) so enemy AI can't immediately undo it.
        if (this.gravityWell && enemyPool && enemyPool.activeObjects) {
            const pr = this.pullRadius || 140;
            const pr2 = pr * pr;
            const strength = this.pullStrength || 0.35;
            const list = enemyPool.activeObjects;
            for (let i = 0; i < list.length; i++) {
                const e = list[i];
                if (!e || !e.active || e.warping) continue;
                const dx = this.x - e.x;
                const dy = this.y - e.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > pr2 || d2 < 4) continue;
                const dist = Math.sqrt(d2);
                const pull = (1 - dist / pr) * strength * 8;
                e.x += (dx / dist) * pull;
                e.y += (dy / dist) * pull;
            }
        }

        // Flak Cannon — track distance flown; airburst into a shrapnel ring
        // once the fuse distance is reached.
        if (this.flak) {
            this._flakDist += Math.hypot(this.vel.x, this.vel.y);
            if (this._flakDist >= this.burstDistance) {
                if (gameEngine && typeof gameEngine.spawnFlakBurst === 'function') {
                    gameEngine.spawnFlakBurst(this.x, this.y, {
                        shrapnelCount: this.shrapnelCount,
                        shrapnelDamage: this.shrapnelDamage,
                        shrapnelSpeed: this.shrapnelSpeed,
                        shrapnelLifeFrames: this.shrapnelLifeFrames,
                        burstBlastRadius: this.burstBlastRadius,
                        burstBlastDamage: this.burstBlastDamage,
                        color: this.color,
                    });
                }
                this.active = false;
                return;
            }
        }

        // Position update.
        this.x += this.vel.x;
        this.y += this.vel.y;

        // Helix offset — Rail Driver double-helix bullets oscillate
        // perpendicular to the rail axis. Apply the *delta* of the sine
        // each frame so the underlying rail position still advances by
        // vel exactly. Two bullets with phases 0 and π cross every half period.
        if (this.helixActive) {
            const speed = Math.hypot(this.vel.x, this.vel.y) || 1;
            const ux = -this.vel.y / speed;
            const uy =  this.vel.x / speed;
            const t = this.life;
            const sNow  = Math.sin(t       * this.helixFreq + this.helixPhase);
            const sPrev = Math.sin((t - 1) * this.helixFreq + this.helixPhase);
            const delta = (sNow - sPrev) * this.helixAmplitude;
            this.x += ux * delta;
            this.y += uy * delta;
        }

        // Off-field handling.
        const boundaryWidth  = gameField ? gameField.width  : this.width;
        const boundaryHeight = gameField ? gameField.height : this.height;
        if (this.bounces > 0) {
            // Ricochet — reflect off the arena edges instead of despawning.
            // Wall bounces share the same counter as enemy caroms.
            let bounced = false;
            if (this.x < 0) { this.x = 0; this.vel.x = Math.abs(this.vel.x); bounced = true; }
            else if (this.x > boundaryWidth) { this.x = boundaryWidth; this.vel.x = -Math.abs(this.vel.x); bounced = true; }
            if (this.y < 0) { this.y = 0; this.vel.y = Math.abs(this.vel.y); bounced = true; }
            else if (this.y > boundaryHeight) { this.y = boundaryHeight; this.vel.y = -Math.abs(this.vel.y); bounced = true; }
            if (bounced) {
                this.bounces--;
                if (this.chargedCaroms) this.damage *= 1.25;
            }
        } else if (!this.boomerang) {
            // Boomerang discs never despawn off-field — they return on their
            // own. Everything else culls once well past the edge.
            if (this.x < -50 || this.x > boundaryWidth + 50 ||
                this.y < -50 || this.y > boundaryHeight + 50) {
                this.active = false;
                if (this.onOffScreen) this.onOffScreen();
            }
        }
    }
    
    // Phase 6 (2026-05-19) — Cluster-bomb staged update path.
    //   travel → friction decay → halt (cluster only) → armed → detonate
    //   travel → friction decay → flight-end detonate (sub-bomb only)
    //
    // Detonation is delegated to `gameEngine.detonateCluster(...)` which
    // applies AoE damage and (for primary cluster bombs) spawns sub-
    // bomblets. The bullet itself is marked inactive once detonated.
    //
    // Off-field guard at the bottom matches the standard bullet path so a
    // cluster bomb that flies off-screen during travel is despawned
    // cleanly (with detonation FX so the player still sees what happened).
    updateClusterStage(particlePool, enemyPool, gameEngine, gameField, asteroidPool = null) {
        this.life++;

        // Apply friction to velocity. travelFriction (< 1) decelerates the
        // bomb so it slows substantially toward the end of its flight; the
        // muzzle velocity is set high (derived in fireCluster) to compensate
        // so the charged target distance is still reached. Sub-bombs use
        // their own subBombFriction.
        this.vel.x *= this.clusterFriction;
        this.vel.y *= this.clusterFriction;

        // ── Primary cluster bomb ───────────────────────────────────────
        // Launches fast and decelerates toward the charged target distance,
        // detonating when it arrives (or on first contact with any enemy /
        // asteroid). Because the launch speed can be high, movement is
        // SUB-STEPPED in <= CLUSTER_SUBSTEP_PX chunks with a contact +
        // distance check at each sub-step, so a fast bomb can't tunnel past a
        // small target between frames.
        if (this.cluster) {
            // Advance spin for the nucleus render so satellite spheres
            // orbit visibly while in flight.
            this._nucleusSpin = (this._nucleusSpin || 0) + 0.18;
            // Spawn a smoke trail every few frames during flight.
            this._smokeFrame++;
            if (particlePool && (this._smokeFrame % 3 === 0)) {
                particlePool.get(this.x, this.y, 'clusterTrail');
            }
            const stepLen = Math.hypot(this.vel.x, this.vel.y);
            const sub = Math.max(1, Math.ceil(stepLen / CLUSTER_SUBSTEP_PX));
            const incX = this.vel.x / sub;
            const incY = this.vel.y / sub;
            const incLen = Math.hypot(incX, incY);
            const proxR = this.proximityRadius || 0;
            const enemyList = (enemyPool && proxR > 0) ? (enemyPool.activeObjects || null) : null;
            const astList = (asteroidPool && proxR > 0) ? (asteroidPool.activeObjects || null) : null;
            const r2 = proxR * proxR;
            for (let s = 0; s < sub; s++) {
                this.x += incX;
                this.y += incY;
                // Detonate once the charged launch distance is reached.
                this._clusterDist = (this._clusterDist || 0) + incLen;
                if (this._clusterDist >= this.clusterTargetDist) {
                    this._detonate(gameEngine);
                    return;
                }
                // First enemy contact within proximityRadius.
                if (enemyList) {
                    for (let i = 0; i < enemyList.length; i++) {
                        const e = enemyList[i];
                        if (!e || !e.active || e.warping || e._deathFlash > 0) continue;
                        const dx = e.x - this.x;
                        const dy = e.y - this.y;
                        if (dx * dx + dy * dy <= r2) {
                            this._detonate(gameEngine);
                            return;
                        }
                    }
                }
                // Asteroid contact (combined radii).
                if (astList) {
                    for (let i = 0; i < astList.length; i++) {
                        const a = astList[i];
                        if (!a || !a.active) continue;
                        const dx = a.x - this.x;
                        const dy = a.y - this.y;
                        const r = proxR + (a.radius || 0);
                        if (dx * dx + dy * dy <= r * r) {
                            this._detonate(gameEngine);
                            return;
                        }
                    }
                }
            }
        } else if (this.subBomb) {
            // Position update (full step; sub-bomb speeds stay low).
            this.x += this.vel.x;
            this.y += this.vel.y;
            // Sub-bomblet: flies off in its (random) launch direction and
            // detonates the moment it hits SOMETHING — an enemy (handled by
            // collision-system) or an asteroid (checked here) — otherwise it
            // explodes after its fixed flight window (`subBombLifeFrames`).
            // The random scatter + contact/timeout rule spreads blast damage
            // across an area.
            this._smokeFrame++;
            if (particlePool && (this._smokeFrame % 4 === 0)) {
                particlePool.get(this.x, this.y, 'clusterTrail');
            }
            // Asteroid contact. Sub-bombs carry no proximityRadius, so use a
            // small contact threshold derived from the blast radius.
            if (asteroidPool && asteroidPool.activeObjects) {
                const contactR = Math.max(12, (this.blastRadius || 50) * 0.4);
                const list = asteroidPool.activeObjects;
                for (let i = 0; i < list.length; i++) {
                    const a = list[i];
                    if (!a || !a.active) continue;
                    const dx = a.x - this.x;
                    const dy = a.y - this.y;
                    const rr = contactR + (a.radius || 0);
                    if (dx * dx + dy * dy <= rr * rr) {
                        this._detonate(gameEngine);
                        return;
                    }
                }
            }
            if (this.life >= this.subBombLifeFrames) {
                this._detonate(gameEngine);
                return;
            }
        }

        // Off-field despawn — cluster bombs that fly off-screen during
        // travel still get a detonation so the player sees the explosion.
        const boundaryWidth  = gameField ? gameField.width  : this.width;
        const boundaryHeight = gameField ? gameField.height : this.height;
        if (this.x < -50 || this.x > boundaryWidth + 50 ||
            this.y < -50 || this.y > boundaryHeight + 50) {
            this._detonate(gameEngine);
        }
    }

    // Phase 6 — trigger detonation. Routes through the combat manager's
    // `detonateCluster` (for primary bombs) or `detonateSubBomblet` (for
    // sub-bombs) so AoE damage, FX, and (for the primary) sub-bomb spawn
    // all live in one place. Marks the bullet inactive on completion.
    _detonate(gameEngine) {
        if (!this.active) return;
        if (gameEngine) {
            if (this.cluster && typeof gameEngine.detonateCluster === 'function') {
                gameEngine.detonateCluster(
                    this.x, this.y,
                    this.blastDamage,
                    this.blastRadius,
                    this.subBombCount,
                    {
                        subBombSpeed: this.subBombSpeed,
                        subBombFriction: this.subBombFriction,
                        subBombLifeFrames: this.subBombLifeFrames,
                        subBombBlastRadius: this.subBombBlastRadius,
                        subBombDamage: this.subBombDamage,
                    },
                );
            } else if (this.subBomb && typeof gameEngine.detonateSubBomblet === 'function') {
                gameEngine.detonateSubBomblet(
                    this.x, this.y, this.blastDamage, this.blastRadius,
                );
            }
        }
        this.active = false;
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
                // ENMY-03 — skip a cloaked-and-unrevealed enemy so homing slips
                // past it. No-op for cloak-less targets (always targetable).
                if (!isTargetable(target, frameClock.now)) continue;
                // ENMY-07 — skip a vanished (mid-blink/underground) enemy so
                // homing can't lock the spot it just left. No-op for blink-less.
                if (isVanished(target, frameClock.now)) continue;

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

        const r = this.explosionRadius;

        // Damage nearby enemies through the CANONICAL kill pipeline
        // (gameEngine.damageEnemy). The old path did an inline
        // enemy.takeDamage + direct enemyPool.release, which skipped
        // onEnemyKill (no kill-streak credit, no enemy debris), awarded
        // score by hand, and dropped *stars* instead of orbs — plus the
        // mid-iteration release shifted activeObjects. Snapshot so pool
        // churn during the loop is safe.
        if (gameEngine.enemyPool && typeof gameEngine.damageEnemy === 'function') {
            const enemies = gameEngine.enemyPool.activeObjects.slice();
            for (const enemy of enemies) {
                if (!enemy.active) continue;
                const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
                if (dist < r) {
                    const damage = Math.max(1, Math.ceil(2 * (1 - dist / r)));
                    gameEngine.damageEnemy(enemy, damage);
                }
            }
        }

        // 6.x — Explosion now also damages asteroids (was enemy-only).
        // Mirrors the nova/lightning AOE asteroid handling.
        if (gameEngine.asteroidPool && typeof gameEngine.destroyAsteroid === 'function') {
            const asteroids = gameEngine.asteroidPool.activeObjects.slice();
            for (const ast of asteroids) {
                if (!ast.active || ast.warping) continue;
                const dist = Math.hypot(ast.x - this.x, ast.y - this.y);
                if (dist < r) {
                    const damage = Math.max(1, Math.ceil(2 * (1 - dist / r)));
                    ast.health = Math.max(0, (ast.health || 0) - damage);
                    ast._hitFlashTimer = 4;
                    if (ast.health <= 0.001) gameEngine.destroyAsteroid(ast);
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

        // Phase 6 — Cluster bomb / sub-bomblet have a custom Canvas2D
        // visual (no WebGL atlas entry). The primary bomb pulses
        // red/white while armed; the sub-bomb is a smaller flashing
        // sphere. Both bypass the standard bullet draw chain below.
        if (this.cluster || this.subBomb) {
            this._drawClusterBomb(ctx);
            return;
        }

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
            // Phase 2 (2026-05-19) — Global HOMING / PIERCING powerups
            // retired. Visuals now key off the per-bullet `piercing` /
            // `homing` flags set at fire time by the per-weapon
            // upgrade path. This narrows the visual to bullets that
            // ACTUALLY pierce / home (not every bullet just because the
            // player owns the upgrade on some weapon).
            if (this.piercing > 0) {
                color = '#ffcc66';
                glowColor = '#ff9933';
                shape = 'diamond';
                glowIntensity = 12;
            }
            if (this.homing) {
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

        // 5.108.0 — Per-bullet overrides win. OVERCHARGE_ROUNDS tags
        // every Nth bullet with `bullet.overcharged = true` and bumps
        // size + color at fire time; reflect that here so the visual
        // reads as a discrete BIG SHOT among the regular spray.
        if (this.overcharged) {
            color = '#ffeb44';
            glowColor = '#ffcc00';
            shape = 'star';
            glowIntensity = 24;
            size = this.radius;
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

    // 6.26.0 — Cluster bomb is drawn as an atomic nucleus: a glowing
    // central core surrounded by satellite spheres that orbit while
    // the bomb flies. Each satellite previews a sub-bomblet that will
    // fly off on detonation. Sub-bomblets themselves stay as small
    // yellow-orange spheres (the "spheres flying off" the nucleus).
    _drawClusterBomb(ctx) {
        ctx.save();
        const r = this.radius || (this.cluster ? 10 : 4);
        if (this.cluster) {
            const satCount = Math.max(4, Math.min(this.subBombCount || 5, 8));
            const orbitR = r * 0.95;
            const satR = r * 0.42;
            const spin = this._nucleusSpin || 0;

            // Outer glow halo — soft warm aura around the whole cluster.
            ctx.globalAlpha = 0.30;
            ctx.fillStyle = '#ff7733';
            ctx.beginPath();
            ctx.arc(this.x, this.y, r * 1.8, 0, Math.PI * 2);
            ctx.fill();

            // Central core — bright hot nucleus.
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#ffeecc';
            ctx.beginPath();
            ctx.arc(this.x, this.y, r * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, r * 0.25, 0, Math.PI * 2);
            ctx.fill();

            // Satellite spheres orbiting the core. Two passes — back
            // half drawn at lower alpha to fake depth.
            for (let pass = 0; pass < 2; pass++) {
                for (let i = 0; i < satCount; i++) {
                    const phase = (i / satCount) * Math.PI * 2 + spin;
                    const ox = Math.cos(phase) * orbitR;
                    const oy = Math.sin(phase) * orbitR * 0.85;
                    // Back half (oy < 0) drawn dimmer on pass 0; front
                    // half drawn full-bright on pass 1.
                    const isBack = oy < 0;
                    if (pass === 0 && !isBack) continue;
                    if (pass === 1 &&  isBack) continue;
                    ctx.globalAlpha = isBack ? 0.55 : 1.0;
                    // Cycle satellite colors for a "different proton/
                    // neutron" feel: red, orange, yellow.
                    const tone = i % 3;
                    ctx.fillStyle = tone === 0 ? '#ff4422'
                                  : tone === 1 ? '#ff8833'
                                               : '#ffcc44';
                    ctx.beginPath();
                    ctx.arc(this.x + ox, this.y + oy, satR, 0, Math.PI * 2);
                    ctx.fill();
                    // White highlight on top-left of each sphere.
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(
                        this.x + ox - satR * 0.3,
                        this.y + oy - satR * 0.3,
                        satR * 0.35,
                        0,
                        Math.PI * 2,
                    );
                    ctx.fill();
                }
            }
        } else if (this.subBomb) {
            // Sub-bomblet: small yellow-orange sphere (the "sphere
            // flying off" the nucleus on detonation).
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = '#ffaa33';
            ctx.beginPath();
            ctx.arc(this.x, this.y, r * 1.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#ffaa33';
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x - r * 0.25, this.y - r * 0.25, r * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}