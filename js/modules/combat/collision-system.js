// Collision detection and response system
// All functions are called with .call(gameEngine) — `this` is the GameEngine instance.
import { GAME_CONFIG } from '../core/constants.js';
import { random, collision, starCollision, triggerHapticFeedback } from '../core/utils.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS } from './weapon-data.js';
import { notifyBossDeath } from '../enemy/boss-rage.js';
import { isMobile, isPortrait } from '../platform/platform-detect.js';
import { frameClock } from '../core/frame-clock.js';

// 5.95.0 — Local mirror of MOBILE_ASTEROID_MAX_RADIUS from wave-manager.js.
//   Duplicated here (rather than imported) because wave-manager.js bundles
//   a lot of subsystems and pulling its symbol surface into collision-
//   system.js would risk a future circular-import. Keep in sync with the
//   source-of-truth value in wave-manager.js.
// 5.95.1 — Phone-portrait gets a tighter cap (28 px) to match the spawn
//   side. Landscape mobile keeps 36; desktop is untouched.
const MOBILE_ASTEROID_SPLIT_MAX_RADIUS = 36;
const MOBILE_PORTRAIT_ASTEROID_SPLIT_MAX_RADIUS = 28;

// 6.29.0 — Power-weapon energy gained per landed bullet hit. With the
// 100-cap, ~5 hits banks a Charge Shot (20), ~25 hits a Lance Beam (60).
const ENERGY_PER_HIT = 4;

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
                // 5.108.0 — Executioner: +20% per stack vs targets at
                // <25% HP. Computed against the target's CURRENT health
                // ratio so the bonus naturally ramps as the asteroid
                // gets wounded by sustained fire.
                let damage = this.cheats.onePunchMan ? 99999 : (bullet.damage || 1);
                if (this.player && ast.maxHealth > 0 && (ast.health / ast.maxHealth) < 0.25) {
                    const execStacks = this.player.getPowerupStacks
                        ? this.player.getPowerupStacks('EXECUTIONER')
                        : 0;
                    if (execStacks > 0) damage *= (1 + execStacks * 0.2);
                }
                if (this.game.stats) {
                    this.game.stats.shotsHit++;
                    this.game.stats.totalDamageDealt += damage;
                }
                const hpBefore = ast.health;
                ast.health = Math.max(0, ast.health - damage);
                // 5.107.0 — Vampirism lifesteal based on actual damage
                // applied (clamped so over-kill doesn't over-heal).
                const applied = hpBefore - ast.health;
                if (typeof this.applyVampirism === 'function') this.applyVampirism(applied);

                // Hit flash — localized at bullet impact point
                ast._hitFlashTimer = COLLISION_CONFIG.HIT_FLASH_FRAMES;
                ast._hitPoint = { x: bullet.x, y: bullet.y };
                ast._hitAngle = Math.atan2(bullet.y - ast.y, bullet.x - ast.x);

                // Brief hitstop on hit — heavy weapons get more
                if (this.isEntityOnScreen(ast)) {
                    const dmg = bullet.damage || 1;
                    this.triggerHitstop(dmg >= 2 ? 3 : 2);
                }

                // Show damage number (same as enemy ships).
                // 5.76.0 — pass target so non-crit hits aggregate.
                if (this.isEntityOnScreen(ast)) {
                    this.createDamageNumber(ast.x, ast.y - ast.baseRadius, damage, {
                        isCrit: !!(bullet.isCrit || bullet.isCritical),
                        isEmpowered: !!bullet.isEmpowered,
                        target: ast,
                    });
                }
                // 5.79.16 — Asteroid hit XP 4 → 1 (cuts bullet-spam
                //   inflation; STORM_NEEDLES on a single rock used to
                //   yield 200+ XP/sec just from hit-tick spam). Per-
                //   destroy XP bumped to compensate (see destroyAsteroid).

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
                    // 5.74.31 — bullet-killed asteroids count for the kill
                    // streak. The other asteroid-kill paths (mine, lightning,
                    // missile, charged-shot) all route through destroyAsteroid
                    // which already calls onEnemyKill. This inlined bullet
                    // path didn't, so a player who only used the primary
                    // weapon never racked up streaks from rocks.
                    if (typeof this.onEnemyKill === 'function') this.onEnemyKill(ast);
                    // 5.79.16 — Asteroid destroy XP +12 (was implicitly 0
                    //   on this inlined bullet path; AOE paths route
                    //   through destroyAsteroid which now grants the same).
                    if (ast.baseRadius <= (GAME_CONFIG.MIN_AST_RAD + 5)) {
                        // Small asteroid destroyed — death flash then cleanup
                        ast._deathFlash = 6;
                        ast._deathFlashMax = 6;
                        if (this.isEntityOnScreen(ast)) {
                            this.events.emit('audio:asteroid-destroy');
                            this.triggerHitstop(4);
                        }
                        this.createDebris(ast);
                        this.dropOrbsFromEntity(ast.x, ast.y, ast);
                        // 5.70.0 — powerups no longer drop from kills.
                        // They're earned via shop picks (one per wave + one
                        // per level-up). Asteroid kills still grant XP, which
                        // levels up the player → another pick.
                        // 5.101.0 — Dampen shake for explosive-bullet kills.
                        // Each pellet's AoE chain-kills neighbors; the
                        // original size-scaled shake compounded into a
                        // brutal camera wobble. Halved magnitude + duration.
                        if (this.isEntityOnScreen(ast)) {
                            const mag = bullet.explosive ? ast.baseRadius * 0.22 : ast.baseRadius * 0.5;
                            const dur = bullet.explosive ? 6 : 12;
                            this.triggerScreenShake(dur, mag, ast.baseRadius);
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
                        this.dropOrbsFromEntity(ast.x, ast.y, ast);

                        // Massive screen shake for large asteroid destruction (only if on screen).
                        // 5.101.0 — Halved for explosive-bullet kills (same
                        // rationale as the small-asteroid branch above).
                        if (this.isEntityOnScreen(ast)) {
                            const mag = bullet.explosive ? ast.baseRadius * 0.35 : ast.baseRadius * 0.8;
                            const dur = bullet.explosive ? 12 : 25;
                            this.triggerScreenShake(dur, mag, ast.baseRadius);
                        }

                        const count = (Math.random() < 0.5 ? 2 : 3) + 1; // 3 or 4
                        let newR = ast.baseRadius / Math.sqrt(count);
                        // 5.95.0 → 5.95.1 — Mobile size cap also applies
                        //   to split fragments so destroying a parent rock
                        //   can't spawn pieces above the readable size cap
                        //   on phones. Portrait gets the tighter 28-px cap;
                        //   landscape keeps 36; desktop branch keeps the
                        //   natural √count divisor untouched.
                        if (isMobile()) {
                            const cap = isPortrait()
                                ? MOBILE_PORTRAIT_ASTEROID_SPLIT_MAX_RADIUS
                                : MOBILE_ASTEROID_SPLIT_MAX_RADIUS;
                            if (newR > cap) newR = cap;
                        }

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
                    // Health orb collected - use the orb's individual heal amount.
                    const baseHealAmount = colorStar.healAmount || GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN;
                    let healAmount = this.player.getEffectiveHealthOrbHealing(baseHealAmount);
                    // 6.0.1 — FIELD_SURGEON: +50% heal per orb, ADDITIVE
                    // with FIELD_RATIONS (was multiplicative pre-6.0.1).
                    // Combined ceiling 2.5× the raw orb value — RATIONS
                    // ×3 = +90%, SURGEON = +50%, additive total 2.4×,
                    // cap leaves a sliver of headroom so the additive
                    // max actually lands.
                    const surgeonStacks = this.player.getPowerupStacks
                        ? this.player.getPowerupStacks('FIELD_SURGEON') : 0;
                    if (surgeonStacks > 0) {
                        const baseUnscaled = colorStar.healAmount || GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN;
                        const surgeonBonus = Math.round(baseUnscaled * 0.5);
                        healAmount = Math.min(
                            Math.round(baseUnscaled * 2.5),
                            healAmount + surgeonBonus,
                        );
                    }
                    const oldHealth = this.player.health;
                    this.player.health = Math.min(this.player.getEffectiveMaxHealth(), this.player.health + healAmount);
                    const actualHeal = this.player.health - oldHealth;

                    // 6.0.1 — ADRENAL_RESERVE: refills one energy tank
                    // when collected at ≤25% HP. Internal cooldown
                    // (15s) prevents the powerup from refilling every
                    // single orb during a desperation drop surge.
                    const adrStacks = this.player.getPowerupStacks
                        ? this.player.getPowerupStacks('ADRENAL_RESERVE') : 0;
                    if (adrStacks > 0 && (oldHealth / Math.max(1, this.player.getEffectiveMaxHealth())) <= 0.25) {
                        const MAX_TANKS = 4;
                        const now = Date.now();
                        const ADRENAL_COOLDOWN_MS = 15000;
                        const last = this._lastAdrenalRefillAt || 0;
                        if (this.healthTanks < MAX_TANKS && (now - last) >= ADRENAL_COOLDOWN_MS) {
                            this.healthTanks += 1;
                            this._lastAdrenalRefillAt = now;
                            this.events.emit('audio:powerup');
                            this.events.emit('ui:update-tanks', { tanks: this.healthTanks });
                            if (typeof this.spawnTankRecharge === 'function') {
                                this.spawnTankRecharge(this.healthTanks);
                            }
                        }
                    }

                    if (actualHeal > 0) {
                        this.events.emit('audio:health-regen'); // Play healing sound
                        // Create green healing particle
                        const healParticle = this.particlePool.get(this.player.x, this.player.y, 'starBlip');
                        if (healParticle) {
                            healParticle.color = '#00ff00'; // Green for healing
                            healParticle.radius = 6;
                            healParticle.life = 0.6;
                        }
                        // 5.106.0 — Green "+N" popup mirroring the red
                        // damage-taken floater so the player can SEE the
                        // heal land. Spawn slightly above the player so
                        // it doesn't overlap their ship sprite.
                        if (typeof this.createDamageNumber === 'function') {
                            this.createDamageNumber(
                                this.player.x,
                                this.player.y - (this.player.radius || 14) - 4,
                                actualHeal,
                                { isHeal: true },
                            );
                        }
                    } else {
                        this.events.emit('audio:coin'); // Normal sound if already at max health
                    }

                    // 5.88.0 — overflow → tank progress. When the player
                    // is at (or near) max HP, the unused portion of the
                    // pickup builds toward an extra energy tank. Capped
                    // at 4 effective tanks (3 triforce triangles + spare).
                    if (typeof this.applyHealthOrbToTanks === 'function') {
                        this.applyHealthOrbToTanks(healAmount, actualHeal);
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

                // 5.79.33 — Pickup burst color now matches the orb type:
                //   health = bright cyan-blue, money/legacy = golden-yellow.
                //   Was hardcoded gold for ALL collectibles, which made the
                //   blue health orb pop a yellow burst on collect — visually
                //   confusing and inconsistent with its drift-trail color.
                const isHealth = colorStar.starType === 'health';
                const burstColor = isHealth ? '#33ddff' : '#FFFF00';
                const sparkleColor = isHealth ? '#66e6ff' : '#FFFF00';

                const blip = this.particlePool.get(colorStar.x, colorStar.y, 'starBlip');
                if (blip) {
                    blip.color = burstColor;
                    blip.radius = 4;
                    blip.life = 0.4;
                    blip.fadeRate = 0.1;
                    blip.growthRate = 0.2;
                }

                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    const dist = 12;
                    const sparkle = this.particlePool.get(
                        colorStar.x + Math.cos(angle) * dist,
                        colorStar.y + Math.sin(angle) * dist,
                        'starSparkle'
                    );
                    if (sparkle) {
                        sparkle.color = sparkleColor;
                        sparkle.radius = 2.5;
                        sparkle.life = 0.8;
                        sparkle.vel = {
                            x: Math.cos(angle) * 1.8,
                            y: Math.sin(angle) * 1.8,
                        };
                    }
                }

                this.colorStarPool.release(colorStar);
            }
        }

        // 5.79.32 — Gold drops (coins + shapes) live in their own pools
        //   now (separate from colorStarPool's collectible orbs). Same
        //   pickup behavior — gold value into purse, golden blip + ring,
        //   release back to pool.
        const collectGold = (drop, pool) => {
            const moneyAmount = drop.value || GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN;
            this.game.money += moneyAmount;
            this.addMoneyPickup(moneyAmount);
            this.events.emit('audio:coin');

            const moneyParticle = this.particlePool.get(this.player.x, this.player.y, 'starBlip');
            if (moneyParticle) {
                moneyParticle.color = '#FFD700';
                moneyParticle.radius = 6;
                moneyParticle.life = 0.6;
            }

            const blip = this.particlePool.get(drop.x, drop.y, 'starBlip');
            if (blip) {
                blip.color = '#FFFF00';
                blip.radius = 4;
                blip.life = 0.4;
                blip.fadeRate = 0.1;
                blip.growthRate = 0.2;
            }
            // Lighter sparkle ring for coins (cluster spawns ~6-30 per
            //   drop, full 8-sparkle ring per coin would saturate the
            //   particle pool); shapes still get the full ring.
            const isCoin = drop.kind === 'coin';
            const ringCount = isCoin ? 3 : 8;
            const ringDist  = isCoin ? 8  : 12;
            for (let i = 0; i < ringCount; i++) {
                const angle = (i / ringCount) * Math.PI * 2;
                const sparkle = this.particlePool.get(
                    drop.x + Math.cos(angle) * ringDist,
                    drop.y + Math.sin(angle) * ringDist,
                    'starSparkle'
                );
                if (sparkle) {
                    sparkle.color = '#FFFF00';
                    sparkle.radius = isCoin ? 1.8 : 2.5;
                    sparkle.life = isCoin ? 0.5 : 0.8;
                    sparkle.vel = {
                        x: Math.cos(angle) * 1.8,
                        y: Math.sin(angle) * 1.8,
                    };
                }
            }
            pool.release(drop);
        };

        for (let i = this.goldCoinPool.activeObjects.length - 1; i >= 0; i--) {
            const coin = this.goldCoinPool.activeObjects[i];
            if (coin.active && starCollision(this.player, coin)) {
                collectGold(coin, this.goldCoinPool);
            }
        }
        for (let i = this.goldShapePool.activeObjects.length - 1; i >= 0; i--) {
            const shape = this.goldShapePool.activeObjects[i];
            if (shape.active && starCollision(this.player, shape)) {
                collectGold(shape, this.goldShapePool);
            }
        }

        // 6.46.0 — World-space item pickups removed. Item drops now
        // register directly into the player's left-edge loot feed
        // (combat-manager.dropOrbsFromEntity → player.registerItemDrop)
        // and auto-equip there; there is no world pickup to collide with.
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
        // Phase 6 — cluster bombs / sub-bomblets own their own collision
        // path (the proximity check below). Skip the standard bullet-hit
        // logic here so a primary cluster bomb sitting in its armed
        // window doesn't trigger normal bullet damage on enemies entering
        // its tile (those should ONLY drive the detonation, not also
        // apply per-tick contact damage). Same for sub-bomblets — they
        // detonate on contact via the proximity block below.
        if (bullet.cluster || bullet.subBomb) continue;
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
                // 5.108.0 — Executioner: +20% per stack vs targets at
                // <25% HP. Same shape as the asteroid branch above.
                let damage = this.cheats.onePunchMan ? 99999 : (bullet.damage || this.baseDamage);
                if (this.player && enemy.maxHealth > 0 && (enemy.health / enemy.maxHealth) < 0.25) {
                    const execStacks = this.player.getPowerupStacks
                        ? this.player.getPowerupStacks('EXECUTIONER')
                        : 0;
                    if (execStacks > 0) damage *= (1 + execStacks * 0.2);
                }
                if (this.game.stats) this.game.stats.shotsHit++;
                const enemyHpBefore = enemy.health;
                const destroyed = enemy.takeDamage(damage, {
                    isCrit: !!(bullet.isCrit || bullet.isCritical),
                    isEmpowered: !!bullet.isEmpowered,
                });
                // 5.107.0 — Vampirism lifesteal on the damage actually
                // applied to the enemy (clamps overkill so we don't
                // heal more than we'd dealt to a full-HP target).
                const enemyApplied = Math.max(0, enemyHpBefore - enemy.health);
                if (typeof this.applyVampirism === 'function') this.applyVampirism(enemyApplied);

                // 6.29.0 — Build power-weapon energy on every landed hit.
                if (this.player && typeof this.player.addEnergy === 'function') {
                    this.player.addEnergy(ENERGY_PER_HIT);
                }

                // 6.28.0 — Per-weapon Stun% / Knockback% procs. Chances are
                // stamped on the bullet at fire time (player/weapons.js).
                // Skip on a lethal hit — the enemy is already dying. Stun
                // uses the BRN/STUN engine; knockback is a direct positional
                // shove along the bullet's travel vector (reliable even
                // though enemies recompute velocity each movement tick).
                if (!destroyed) {
                    if (bullet.stunChance > 0 && Math.random() < bullet.stunChance
                        && typeof this.applyStun === 'function') {
                        this.applyStun(enemy);
                    }
                    if (bullet.knockbackChance > 0 && Math.random() < bullet.knockbackChance) {
                        const ka = Math.atan2(bullet.vel?.y || 0, bullet.vel?.x || 1);
                        const shove = 16;
                        enemy.x += Math.cos(ka) * shove;
                        enemy.y += Math.sin(ka) * shove;
                    }
                }

                if (bullet.isCrit || bullet.isCritical) {
                    if (typeof this.checkMissionOnCrit === 'function') this.checkMissionOnCrit();
                }

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

                // 5.79.16 — Enemy bullet-hit XP 6 → 2 (kills become
                //   the dominant XP source instead of hit ticks).

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
                    // 5.101.0 — Skip hit-shake for explosive bullets. The
                    // EXPLOSIVE powerup adds an AoE on every shot; the
                    // cumulative shake (one per pellet × spread × explode)
                    // was an order of magnitude too punchy. The explosion
                    // particle effect alone reads as impact.
                    if (this.isEntityOnScreen(enemy) && !bullet.explosive) {
                        this.triggerScreenShake(5, Math.max(2, (enemy.radius || 15) * 0.15), enemy.radius || 15);
                    }
                }

                if (destroyed) {
                    // QA bot kill tracking — authoritative kill buffer
                    if (window._qaBotKillBuffer) window._qaBotKillBuffer.push({ type: enemy.type, wave: this.game.currentWave, ts: Date.now(), maxHealth: enemy.maxHealth });
                    // 5.74.3 — gold no longer auto-awarded on kill. Players
                    // must pick up the dropped money orbs (dropOrbsFromEntity)
                    // to gain gold. XP still drops on kill.
                    const reward = enemy.getDestructionReward();

                    // Track kill streak
                    this.onEnemyKill(enemy);

                    // Play enemy destruction sound only if on screen.
                    if (this.isEntityOnScreen(enemy)) {
                        this.events.emit('audio:enemy-destroy', enemy.type);
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

                    // 5.70.0 — powerups no longer drop from enemy kills.
                    // They're earned via shop picks (one per wave + one per
                    // level-up). The wave-clear bonus and per-kill XP both
                    // feed into the level-up pick grant, so high-DPS runs
                    // stack picks faster.

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

    // ── Phase 6 (2026-05-19) — Cluster bomb enemy proximity detection ──
    // Surgical insert: walks the bullet pool for armed cluster bombs OR
    // sub-bomblets in flight, triggering early detonation when an enemy
    // enters their proximity radius. The bomb's `_detonate` callback
    // (see Bullet) routes through the combat manager to apply AoE
    // damage + spawn sub-bomblets. Cheap loop because typically <5
    // cluster bombs are in flight at once; iterates the bullet pool
    // once with an early-out for non-cluster bullets.
    for (let i = this.bulletPool.activeObjects.length - 1; i >= 0; i--) {
        const bullet = this.bulletPool.activeObjects[i];
        if (!bullet.active) continue;
        if (!bullet.cluster && !bullet.subBomb) continue;

        // Sub-bomblets detonate on first enemy contact (any enemy
        // within the proximity radius — uses subBombBlastRadius * 0.5
        // as a contact threshold so a stationary sub-bomb still
        // detonates if an enemy walks into it before flight ends).
        // 6.26.0 — Primary cluster bombs detonate on the FIRST enemy
        // contact at any point during flight (no armed-stage gate;
        // bullet.js' per-frame proximity check is the primary trigger,
        // this spatial-grid pass is a redundant safety net for very
        // crowded fields).
        const proxR = bullet.subBomb
            ? Math.max(12, (bullet.blastRadius || 50) * 0.4)
            : (bullet.proximityRadius || 18);
        if (proxR <= 0) continue;
        const r2 = proxR * proxR;
        const enemies = this.enemyPool.activeObjects;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (!e || !e.active) continue;
            if (e.warping || e._deathFlash > 0) continue;
            const dx = e.x - bullet.x;
            const dy = e.y - bullet.y;
            if (dx * dx + dy * dy <= r2) {
                bullet._detonate(this);
                break;
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

    // Enemy bullet-asteroid collisions — re-enabled. Asteroids now
    // physically block enemy fire so the player can use them as cover.
    // The bullet poofs out (small sparkle puff in bullet color via
    // createDisappearEffect) on impact; the asteroid is unharmed
    // (enemy fire doesn't damage rocks — only the player's shots do).
    // Mines (shape='mine') and persistent damage proxies are skipped
    // here because they have their own behavior — mines are
    // proximity-triggered bombs, not regular projectiles.
    this.enemyBulletPool.activeObjects.forEach(bullet => {
        if (!bullet.active) return;
        if (bullet.shape === 'mine') return;
        for (let i = 0; i < this.asteroidPool.activeObjects.length; i++) {
            const ast = this.asteroidPool.activeObjects[i];
            if (!ast.active || ast.warping || ast._deathFlash > 0) continue;
            if (bullet.checkCollision(ast)) {
                if (bullet.createDisappearEffect) bullet.createDisappearEffect();
                bullet.active = false;
                if (bullet.onOffScreen) bullet.onOffScreen();
                break; // bullet is gone, stop checking asteroids
            }
        }
    });

    // Enemy bullet-enemy collisions — friendly fire. Stray shots that
    // miss the player and connect with another enemy will damage that
    // enemy. The firing enemy is skipped via the `bullet.shooter`
    // reference set in createEnemyBullet. Warping enemies and the
    // firing enemy's own death state are skipped. Mines and untagged
    // damage-proxy bullets fall through to standard behavior.
    this.enemyBulletPool.activeObjects.forEach(bullet => {
        if (!bullet.active) return;
        if (bullet.shape === 'mine') return;
        for (let i = 0; i < this.enemyPool.activeObjects.length; i++) {
            const enemy = this.enemyPool.activeObjects[i];
            if (!enemy.active || enemy.warping || enemy._deathFlash > 0) continue;
            if (enemy === bullet.shooter) continue;
            if (bullet.checkCollision(enemy)) {
                // Damage the enemy. takeDamage handles death + drops.
                if (typeof enemy.takeDamage === 'function') {
                    enemy.takeDamage(bullet.damage || 2, this);
                }
                if (bullet.createDisappearEffect) bullet.createDisappearEffect();
                bullet.active = false;
                if (bullet.onOffScreen) bullet.onOffScreen();
                break; // bullet is gone, stop checking enemies
            }
        }
    });

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

    const config = POWER_WEAPONS.LANCE_BEAM;
    const beamW = (config.beamWidth || 6) * (1 + p.getPowerupStacks('BEAM_WIDTH') * 0.3);
    const range = config.range * 400;
    const arcHalf = (config.arcHalfAngle != null) ? config.arcHalfAngle : 0.7;
    const aim = p.angle;
    const dmg = config.damage * (1 + p.getPowerupStacks('OVERLOAD_BEAM') * 2);
    const knockMul = (typeof p.getKnockbackMultiplier === 'function') ? p.getKnockbackMultiplier() : 1;
    const BEAM_PUSH = 0.4 * knockMul;

    const BEAM_HIT_COLOR = '#88ddff';
    const BEAM_BRIGHT    = '#ffffff';

    // 6.55.0 — Arc-sweep AoE. Damage EVERY enemy + asteroid inside the cone
    // (±arcHalf around the aim, out to `range`) every tick — the beam pierces
    // (no single-target stop), so the whole swept area takes considerable
    // damage. The visible blade (swept angle) is decorative; the cone is the
    // hitbox. The blade renders to full range, so beamHitDist = range.
    p.beamHitDist = range;
    const range2 = range * range;
    const angDelta = (a, b) => {
        let d = a - b;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    };

    let anyHit = false;
    let lastHitX = 0, lastHitY = 0;

    for (const enemy of this.enemyPool.activeObjects) {
        if (!enemy.active || enemy._deathFlash > 0 || enemy.warping) continue;
        const ex = enemy.x - p.x, ey = enemy.y - p.y;
        const d2 = ex * ex + ey * ey;
        if (d2 > range2) continue;
        const r = enemy.radius || 15;
        // In-cone by bearing, OR close enough that the body straddles the
        // player (no point-blank dead zone).
        if (Math.abs(angDelta(Math.atan2(ey, ex), aim)) > arcHalf
            && d2 > (r + beamW) * (r + beamW)) continue;
        this.damageEnemy(enemy, dmg);
        if (Math.random() < 0.15) this.applyBurn(enemy, dmg);
        if (enemy.vel) {
            const len = Math.sqrt(d2) || 1;
            enemy.vel.x += (ex / len) * BEAM_PUSH;
            enemy.vel.y += (ey / len) * BEAM_PUSH;
        }
        anyHit = true; lastHitX = enemy.x; lastHitY = enemy.y;
    }

    for (const ast of this.asteroidPool.activeObjects) {
        if (!ast.active || ast._deathFlash > 0 || ast.warping) continue;
        const ax = ast.x - p.x, ay = ast.y - p.y;
        const d2 = ax * ax + ay * ay;
        if (d2 > range2) continue;
        const r = ast.baseRadius || ast.radius || 15;
        if (Math.abs(angDelta(Math.atan2(ay, ax), aim)) > arcHalf
            && d2 > (r + beamW) * (r + beamW)) continue;
        ast.health = Math.max(0, (ast.health || 0) - dmg);
        ast._hitFlashTimer = 4;
        if (ast.vel) {
            const len = Math.sqrt(d2) || 1;
            ast.vel.x += (ax / len) * BEAM_PUSH * 0.6;
            ast.vel.y += (ay / len) * BEAM_PUSH * 0.6;
        }
        if (ast.health <= 0.001) this.destroyAsteroid(ast);
        anyHit = true; lastHitX = ast.x; lastHitY = ast.y;
    }

    // Sweep glitter + muzzle hotspot along the swept blade.
    const sweepAng = (typeof p.beamSweepAngle === 'number') ? p.beamSweepAngle : aim;
    const sdx = Math.cos(sweepAng), sdy = Math.sin(sweepAng);
    if (this.particlePool && Math.random() < 0.55) {
        const t = Math.random();
        const sx = p.x + sdx * range * t;
        const sy = p.y + sdy * range * t;
        const perpJitter = (Math.random() - 0.5) * (beamW * 1.6);
        const c = Math.random() < 0.4 ? BEAM_BRIGHT : BEAM_HIT_COLOR;
        this.particlePool.get(sx + (-sdy) * perpJitter, sy + sdx * perpJitter, 'explosionEmber', c);
    }
    if (this.particlePool && Math.random() < 0.7) {
        const muzzleX = p.x + sdx * (p.radius || 14);
        const muzzleY = p.y + sdy * (p.radius || 14);
        this.particlePool.get(muzzleX, muzzleY, 'explosionEmber', BEAM_BRIGHT);
    }

    if (!anyHit) return;

    // Hit sparks at the last impact point.
    if (this.particlePool && Math.random() < 0.55) {
        for (let s = 0; s < 3; s++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 2 + Math.random() * 4;
            const c = s === 0 ? BEAM_BRIGHT : BEAM_HIT_COLOR;
            this.particlePool.get(lastHitX, lastHitY, 'explosionShrapnel', a, sp, c);
        }
    }

    const now = performance.now();
    if (!p._lastBeamHitSfx || now - p._lastBeamHitSfx > 160) {
        p._lastBeamHitSfx = now;
        this.events.emit('audio:enemy-hit-by-bullet', 'LANCE_BEAM');
        // Layer one of three random sizzle/zap variants on top of the
        // engaged-loop hum so contact reads as crisp feedback.
        const hitName = `laserBeamHit${1 + ((Math.random() * 3) | 0)}`;
        if (this.audioManager) this.audioManager.playSound(hitName);
    }
}

// ─── Mines ──────────────────────────────────────────────────────
export function checkMineCollisions() {
    const p = this.player;
    if (!p.activeMines) return;
    for (const mine of p.activeMines) {
        if (!mine.active || !mine.armed) continue;
        const triggerR = mine.triggerRadius || 60;
        // Use the blast radius + damage STAMPED on the mine at lay time —
        // not live player stacks. Otherwise buying/selling BLAST_RADIUS
        // after laying a mine retro-scales its blast.
        const blastR = mine.blastRadius
            || ((POWER_WEAPONS.MINE_LAYER.blastRadius || 80) + p.getPowerupStacks('BLAST_RADIUS') * 30);
        const mineDmg = (mine.damage != null) ? mine.damage : POWER_WEAPONS.MINE_LAYER.mineDamage;

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
            const dmg = mineDmg * (1 - dist / blastR * 0.5);
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
            const dmg = mineDmg * (1 - dist / blastR * 0.5);
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

        // DAISY_CHAIN — this detonation triggers other nearby armed mines,
        // which cascade in turn. Flag them `expired` so they detonate when
        // this loop reaches them (or next frame), reusing the full blast
        // path above rather than duplicating it.
        if (p.getPowerupStacks && p.getPowerupStacks('DAISY_CHAIN') > 0) {
            const CHAIN_R = 220;
            for (const other of p.activeMines) {
                if (other === mine || !other.active || !other.armed || other.expired) continue;
                if (Math.hypot(other.x - mine.x, other.y - mine.y) <= CHAIN_R) {
                    other.expired = true;
                }
            }
        }

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

        // Phase 4 (2026-05-19) — Per-ring upgrade snapshot. Read stacks
        // once per ring/frame so the inner enemy loop doesn't repeatedly
        // hit `getPowerupStacks`. Cached values feed the BRN/STUN/chain
        // branches below.
        //
        // `chainBudget` collapses two checks: NOVA_CHAIN must be owned
        // AND the ring's own hop counter must still be > 0. Initial nova
        // rings spawned by `fireNova` predate the Phase 4 fields, so a
        // missing `_hopsRemaining` is interpreted as the default 3 hops.
        const infernoStacks  = (typeof p.getPowerupStacks === 'function')
            ? p.getPowerupStacks('NOVA_INFERNO') : 0;
        const lightningStacks = (typeof p.getPowerupStacks === 'function')
            ? p.getPowerupStacks('NOVA_LIGHTNING') : 0;
        const chainStacks    = (typeof p.getPowerupStacks === 'function')
            ? p.getPowerupStacks('NOVA_CHAIN') : 0;
        const aftershockStacks = (typeof p.getPowerupStacks === 'function')
            ? p.getPowerupStacks('AFTERSHOCK') : 0;
        // Initial novas default to 3 hops; secondaries carry an explicit
        // (decremented) counter set by `_spawnSecondaryNova`. Clamp to
        // [0,3] for defense — a malformed ring can never exceed the cap.
        const ringHopsRemaining = Math.max(0, Math.min(3,
            (ring._hopsRemaining != null) ? ring._hopsRemaining : 3));
        const chainBudget = chainStacks > 0 && ringHopsRemaining > 0;

        // Enemies — damage + outward shove on first contact with ring.
        for (const enemy of this.enemyPool.activeObjects) {
            if (!enemy.active || ring.hitEnemies.has(enemy)) continue;
            const dx = enemy.x - ring.x;
            const dy = enemy.y - ring.y;
            const dist = Math.hypot(dx, dy);
            if (Math.abs(dist - ring.currentRadius) < RING_WIDTH) {
                ring.hitEnemies.add(enemy);
                const novaDmg = ring.damage || POWER_WEAPONS.NOVA_BLAST.ringDamage;
                // Snapshot pre-hit state so we can detect kills + apply
                // status without re-reading the enemy after destruction
                // (damageEnemy may reset the pool slot on lethal hits).
                const killX = enemy.x;
                const killY = enemy.y;
                this.damageEnemy(enemy, novaDmg);
                const wasKilled = !enemy.active || enemy.health <= 0.001;

                // Phase 4 — INFERNO: always-on BRN apply to every enemy
                // the ring passes through. No roll; the upgrade IS the
                // proc. Skip on dead enemies (applyBurn no-ops anyway).
                if (infernoStacks > 0 && !wasKilled && typeof this.applyBurn === 'function') {
                    this.applyBurn(enemy, novaDmg);
                }
                // Phase 4 — LIGHTNING: roll 30% × stacks per hit. Same
                // skip-on-kill rule as burn (applyStun no-ops on dying
                // enemies regardless, but we avoid the call to keep
                // the code path obvious).
                if (lightningStacks > 0 && !wasKilled && typeof this.applyStun === 'function') {
                    if (Math.random() < 0.30 * lightningStacks) {
                        this.applyStun(enemy);
                    }
                }
                // AFTERSHOCK — always-on 30% slow for 2s on every enemy
                // the ring passes through (no roll; the upgrade is the proc).
                if (aftershockStacks > 0 && !wasKilled && typeof this.applySlow === 'function') {
                    this.applySlow(enemy, 2000, 0.7);
                }
                // Phase 4 — CHAIN: only on kills, and only if the ring
                // still has hop budget. Decrement and pass the remaining
                // budget to the secondary; defensive ceiling at 3 also
                // enforced inside `_spawnSecondaryNova`.
                if (chainBudget && wasKilled && typeof this._spawnSecondaryNova === 'function') {
                    const nextHops = ringHopsRemaining - 1;
                    // Connector arc particle — visualizes the chain link
                    // from the killed enemy back to the parent ring's
                    // origin so the cascade reads as causally linked.
                    if (this.particlePool) {
                        this.particlePool.get(ring.x, ring.y, 'novaChainArc', killX, killY);
                    }
                    this._spawnSecondaryNova(killX, killY, 0.6, 0.4, nextHops);
                }

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
        const cfg = POWER_WEAPONS.LIGHTNING_ARC;
        // 5.75.1 — ARC_OVERCHARGE capstone used to extend chain range
        //   by 50% on top of the +30% damage bump.
        // 5.110.0 — Range bump dropped; mastery is now PURE damage
        //   (60% bump applied below). Tether range is the weapon's
        //   base chainRange unchanged regardless of mastery.
        const overchargeStacks = p.getPowerupStacks('ARC_OVERCHARGE');
        const range = cfg.chainRange;
        const knockMul = (typeof p.getKnockbackMultiplier === 'function') ? p.getKnockbackMultiplier() : 1;
        const TETHER_PUSH = 0.5 * knockMul;
        // Per-frame damage; tuned to match Lance Beam DPS (~2.04 dps at 60Hz).
        // ARC_OVERCHARGE: +30% damage (multiplicative on top of AMPLIFIER).
        //
        // 5.79.3 — Bullet-flavored powerups buff arc DPS instead of
        //   doing nothing. Mirrors fireLanceBeam — same per-stack
        //   bumps so both beam weapons benefit equally. RAPID +22%,
        //   MULTI +30%, BIG +18%, PIERCING +15%, HOMING +10%,
        //   EXPLOSIVE +25%.
        let bulletBumpMul = 1;
        const arcBumps = [
            ['RAPID_FIRE',  0.22],
            ['MULTI_SHOT',  0.30],
            ['BIG_BULLETS', 0.18],
            ['PIERCING',    0.15],
            ['HOMING',      0.10],
            ['EXPLOSIVE',   0.25],
        ];
        for (const [powId, perStack] of arcBumps) {
            const s = p.getPowerupStacks(powId);
            if (s > 0) bulletBumpMul *= (1 + s * perStack);
        }
        const dmgBase = cfg.damage * (1 + p.getPowerupStacks('AMPLIFIER') * 0.2) * bulletBumpMul;
        // 5.110.0 — Mastery damage bump 1.3× → 1.6× (the +30% from
        // the legacy combo split is rolled into pure damage now that
        // the chain-range component is gone).
        const dmg = overchargeStacks > 0 ? dmgBase * 1.6 : dmgBase;

        // 5.79.5 — Target selection now picks the entity nearest to
        //   the AIMING CURSOR (not the player). Range-gated by the
        //   player's distance to the entity so the beam still has to
        //   reach. This lets the player intentionally pick which
        //   enemy to fry instead of whichever is geographically
        //   closest to the ship.
        const aimX = (this.inputHandler && this.inputHandler.input)
            ? this.inputHandler.input.aimX : p.x;
        const aimY = (this.inputHandler && this.inputHandler.input)
            ? this.inputHandler.input.aimY : p.y;

        let best = null, bestKind = null, bestAimDist = Infinity;
        for (const e of this.enemyPool.activeObjects) {
            if (!e.active || e._deathFlash > 0) continue;
            // Range gate from player.
            const dxp = e.x - p.x, dyp = e.y - p.y;
            if (dxp * dxp + dyp * dyp > range * range) continue;
            // Closeness to aim cursor decides priority.
            const dxa = e.x - aimX, dya = e.y - aimY;
            const aimDist = Math.hypot(dxa, dya);
            if (aimDist < bestAimDist) { bestAimDist = aimDist; best = e; bestKind = 'enemy'; }
        }
        for (const ast of this.asteroidPool.activeObjects) {
            if (!ast.active || ast._deathFlash > 0 || ast.warping) continue;
            const dxp = ast.x - p.x, dyp = ast.y - p.y;
            if (dxp * dxp + dyp * dyp > range * range) continue;
            const dxa = ast.x - aimX, dya = ast.y - aimY;
            const aimDist = Math.hypot(dxa, dya);
            if (aimDist < bestAimDist) { bestAimDist = aimDist; best = ast; bestKind = 'asteroid'; }
        }
        // (bestDist no longer used — kept commented as a marker for the
        //  pre-5.79.5 player-distance-based selection if anyone needs to
        //  diff against the new aim-cursor target logic above.)

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
                // Phase 3 — Arc Lightning STUN proc: 25% per per-tick
                // hit. Refresh-style; chained procs keep the tether
                // target frozen indefinitely.
                if (Math.random() < 0.25) this.applyStun(best);
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
        let dmg = POWER_WEAPONS.LIGHTNING_ARC.damage * (1 + p.getPowerupStacks('AMPLIFIER') * 0.2);
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

    // CLUSTER_WARHEAD — a missile flagged `cluster` spawns 3 homing
    // fragments on impact. Collect them and append AFTER the loop so they
    // first fly next frame (no instant re-collision at the impact point);
    // fragments are `cluster:false` so they never re-split.
    const clusterFragments = [];
    const splitCluster = (missile) => {
        if (!missile.cluster) return;
        const baseAng = Math.atan2(missile.vel?.y || 0, missile.vel?.x || 1);
        const speed = missile.speed || POWER_WEAPONS.MISSILE_SALVO.missileSpeed || 4;
        const fragDmg = ((missile.damage != null) ? missile.damage
            : POWER_WEAPONS.MISSILE_SALVO.missileDamage) * 0.6;
        for (let i = -1; i <= 1; i++) {
            const ang = baseAng + i * 0.5;
            clusterFragments.push({
                x: missile.x, y: missile.y,
                vel: { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed },
                angle: ang,
                damage: fragDmg,
                homingStrength: 0.12,
                cluster: false,
                life: 1200, maxLife: 1200,
                radius: 4,
                target: null, // updateMissiles re-acquires the nearest target
                active: true,
                speed,
            });
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
        // 6.23.0 — Honor a per-missile `damage` override if set (used by
        //   mine-launched missiles from MINE_MISSILES so their damage
        //   scales with mineDamage * 0.5 instead of the full salvo
        //   damage). Falls back to MISSILE_SALVO config.
        const missileDamage = (missile.damage !== undefined && missile.damage !== null)
            ? missile.damage
            : POWER_WEAPONS.MISSILE_SALVO.missileDamage;
        for (const enemy of this.enemyPool.activeObjects) {
            if (!enemy.active) continue;
            const dist = Math.hypot(enemy.x - missile.x, enemy.y - missile.y);
            if (dist < (enemy.radius || 15) + 6) {
                this.damageEnemy(enemy, missileDamage);
                if (enemy.vel) {
                    enemy.vel.x += kx * MISSILE_KNOCK;
                    enemy.vel.y += ky * MISSILE_KNOCK;
                }
                missile.active = false;
                explode(missile.x, missile.y);
                splitCluster(missile);
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
                ast.health = Math.max(0, (ast.health || 0) - missileDamage);
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
                splitCluster(missile);
                break;
            }
        }
    }

    // Append cluster fragments after the loop so they don't re-collide at
    // the impact point this same frame.
    if (clusterFragments.length) p.activeMissiles.push(...clusterFragments);
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
        const redirect = p.getPowerupStacks('REDIRECTION') > 0;

        this.enemyBulletPool.activeObjects.forEach(bullet => {
            if (!bullet.active) return;
            const dist = Math.hypot(bullet.x - p.x, bullet.y - p.y);
            if (dist > 55) return;
            const angleToBullet = Math.atan2(bullet.y - p.y, bullet.x - p.x);
            let diff = angleToBullet - p.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) < arc / 2) {
                const bx = bullet.x, by = bullet.y;
                bullet.active = false;
                this.game.money += coinsPerBullet;
                // REDIRECTION — 30% of absorbed bullets fire back at the
                // nearest enemy as a player bullet.
                if (redirect && Math.random() < 0.30) {
                    const nearest = this.findNearestEnemy();
                    if (nearest) {
                        const ang = Math.atan2(nearest.y - by, nearest.x - bx);
                        this.bulletPool.get(bx, by, ang, 8, 2, 3, 600, '#ff88ff', this.player);
                    }
                }
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
    // 5.79.16 — Asteroid destroy XP. Was implicitly 0 (only the
    //   per-bullet hit XP at line 137 contributed, and that's now
    //   1 XP per hit). Granting +12 on actual destruction makes the
    //   "kill" the real XP event, mirroring enemies. Routes through
    //   here so EVERY asteroid-kill path (bullet, mine, lightning,
    //   missile, charged shot, AOE ring) awards equally.
    // 5.74.18 — asteroids now feed the kill streak counter alongside enemy
    // kills. Routes through onEnemyKill (which doesn't reference the type
    // beyond the milestone notification), so streak tier buffs and idle
    // timeout work uniformly across both target types.
    if (typeof this.onEnemyKill === 'function') this.onEnemyKill(ast);
    // 5.75.0 — asteroid mission progress.
    if (typeof this.checkMissionOnAsteroidDestroy === 'function') this.checkMissionOnAsteroidDestroy();
    ast._deathFlash = 6;
    ast._deathFlashMax = 6;
    if (onScreen) {
        this.events.emit('audio:asteroid-destroy');
        this.triggerHitstop(isLarge ? 5 : 4);
    }
    this.createDebris(ast);
    this.dropOrbsFromEntity(ast.x, ast.y, ast);

    // 5.70.0 — powerups no longer drop from kills (see top of file).
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

// 5.78.0 — single canonical damage entry point. All paths that damage
// enemies (bullets via enemy.takeDamage, AOE via damageEnemy, future
// damage modifiers) now funnel through this helper so the invuln gates
// (warp / deathFlash / boss rage) are checked in exactly one place.
// Returns `{ blocked, destroyed }`. Callers that want the legacy boolean
// can read `result.destroyed`.
export function applyDamageToEnemy(enemy, damage, opts = {}) {
    if (!enemy || !enemy.active) return { blocked: true, destroyed: false };
    if (enemy.warping || enemy._deathFlash > 0) return { blocked: true, destroyed: false };
    // Boss rage invuln window — sparkle feedback then drop the hit.
    if (enemy.isBoss && enemy._rageInvulnUntil && Date.now() < enemy._rageInvulnUntil) {
        if (this.particlePool) {
            const p = this.particlePool.get(enemy.x, enemy.y, 'starSparkle');
            if (p) {
                p.color = '#ff8888';
                p.vel.x = (Math.random() - 0.5) * 2;
                p.vel.y = (Math.random() - 0.5) * 2;
            }
        }
        return { blocked: true, destroyed: false };
    }

    // EMP_OVERLOAD — stunned enemies take +20% damage.
    if (enemy.stunUntil && enemy.stunUntil > frameClock.now
        && this.player && this.player.getPowerupStacks
        && this.player.getPowerupStacks('EMP_OVERLOAD') > 0) {
        damage *= 1.2;
    }

    enemy.health -= damage;
    enemy.health = Math.max(0, Math.min(enemy.health, enemy.maxHealth));

    if (opts.showNumber !== false && typeof this.createDamageNumber === 'function') {
        this.createDamageNumber(
            opts.numberX != null ? opts.numberX : enemy.x,
            opts.numberY != null ? opts.numberY : (enemy.y - (enemy.radius || 15)),
            damage,
            // Phase 3 — `isBurn` lets the renderer differentiate BRN
            // tick damage (red, lower alpha) from regular hits. Pure
            // pass-through; no new branching in this function.
            { isCrit: !!opts.isCrit, isEmpowered: !!opts.isEmpowered, isBurn: !!opts.isBurn, target: enemy }
        );
    }
    if (this.game?.stats) this.game.stats.totalDamageDealt += damage;

    const destroyed = enemy.health <= 0.001;
    if (destroyed && enemy.isBoss && !enemy._bossPairNotified) {
        enemy._bossPairNotified = true;
        notifyBossDeath(enemy);
    }
    return { blocked: false, destroyed };
}

export function damageEnemy(enemy, damage) {
    const result = applyDamageToEnemy.call(this, enemy, damage, {
        numberY: enemy ? enemy.y - 15 : undefined,
    });
    if (result.blocked) return;
    // Surface this enemy in the top-center info panel — covers AOE hits
    // (mines, lightning, nova, missiles) that don't go through the bullet path.
    this._setLastHit(enemy);
    if (result.destroyed) {
        // Start death flash — enemy renders as bright dissolving silhouette for 5 frames
        enemy._deathFlash = 8;
        enemy._deathFlashMax = 8;
        // Kill hitstop for weapon-effect kills (mines, lightning, nova, etc.)
        if (this.isEntityOnScreen(enemy)) {
            this.triggerHitstop(4);
        }
        // QA bot kill tracking — authoritative kill buffer (drained by state-reader)
        if (window._qaBotKillBuffer) window._qaBotKillBuffer.push({ type: enemy.type, wave: this.game.currentWave, ts: Date.now(), maxHealth: enemy.maxHealth });
        // 5.74.3 — gold no longer auto-awarded on kill (pickup-only).
        const reward = enemy.getDestructionReward();
        if (this.game.stats) {
            this.game.stats.enemiesKilled++;
            if (enemy.isBoss) this.game.stats.bossesKilled++;
        }
        this.onEnemyKill(enemy);
        if (this.isEntityOnScreen(enemy)) {
            this.events.emit('audio:enemy-destroy', enemy.type);
        }
        this.createEnemyDebris(enemy);
        this.dropOrbsFromEntity(enemy.x, enemy.y, enemy);
        // 5.70.0 — powerups no longer drop from kills (see top of file).
    }
}

export function handlePlayerEnemyCollision(player, enemy) {
    // Apply damage only if not invincible
    if (!this.player.invincible) {
        // 6.x — Route through the SINGLE takeDamage pipeline. It applies
        // shield + BULWARK + dash i-frames + DODGE + REFLEXES + mobile
        // multiplier + STATIC_FIELD + the `_lastDamageAt` regen gate +
        // Thorns + kill-streak break + GUARDIAN / LAST_STAND / tank /
        // death, and fires the damage number + player-hit FX at the
        // impact point. Returns the HP actually lost (0 if dodged /
        // i-framed) so the screen-shake can scale.
        const baseDamage = enemy.getLevelScaledDamage(25);
        const dealt = this.takeDamage(baseDamage, { source: enemy, fxX: enemy.x, fxY: enemy.y });
        if (player.health <= 0) return; // died with no save — skip post-hit FX + bounce

        // ── JUICE: hitstop + camera kick + damage-scaled shake ──
        // 6.17.1 — Shake magnitude/duration scale with the dealt damage
        // so a glancing 3 HP nudge feels tactile but small, while a 25+
        // HP slam shakes the world. sev clamped at 0.15 min so damage-
        // zero contacts (dash i-frame ram) skip the shake.
        this.triggerHitstop(6); // ~100ms — enemies hit harder than asteroids
        const kickDx = player.x - enemy.x;
        const kickDy = player.y - enemy.y;
        this.triggerCameraKick(kickDx, kickDy, 10);
        if (dealt > 0) {
            const sev = Math.min(1, Math.max(0.15, dealt / 25));
            this.triggerScreenShake(
                Math.round(8 + sev * 18),
                Math.round(3 + sev * 10),
                enemy.radius,
            );
        }
        this.events.emit('audio:player-hit-enemy');

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

        // 5.88.0 — no automatic post-hit invuln. The hit-flash still fires
        // so the visual confirms the impact registered.
        this.player._hitFlashTimer = 8;
    }

    // Always damage the enemy when colliding with player (massive damage)
    const destroyed = enemy.takeDamage(COLLISION_CONFIG.PLAYER_ENEMY_COLLISION_DAMAGE);

    if (destroyed) {
        // Start death flash — enemy renders as bright dissolving silhouette
        enemy._deathFlash = 8;
        enemy._deathFlashMax = 8;
        // QA bot kill tracking — authoritative kill buffer
        if (window._qaBotKillBuffer) window._qaBotKillBuffer.push({ type: enemy.type, wave: this.game.currentWave, ts: Date.now(), maxHealth: enemy.maxHealth });
        // 5.74.3 — gold no longer auto-awarded on kill (pickup-only).
        const reward = enemy.getDestructionReward();
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

    // 5.88.0 — no automatic post-bounce invuln. Tank consumption (above)
    // is the only "safety net" between the player and the next hit.
}

export function handlePlayerEnemyBulletCollision(player, bullet) {
    // 6.x — Route through the SINGLE takeDamage pipeline (see
    // handlePlayerEnemyCollision). It now also makes enemy bullets honor
    // player invincibility (the inline path here didn't check it). Mines
    // (bullet.shape === 'mine') have health and take Thorns directly;
    // plain enemy bullets have no shooter ref, so applyThorns falls back
    // to the nearest enemy as the proxy source.
    const baseDamage = bullet.damage || 15;
    this.takeDamage(baseDamage, { source: bullet, fxX: bullet.x, fxY: bullet.y });
    if (player.health <= 0) return; // died with no save

    // ── JUICE: hitstop only (no camera kick or screen shake for bullets) ──
    // 6.17.1 — Screen shake removed from the bullet-hit path. Shake is
    // now reserved for physical collisions (player ↔ enemy, player ↔
    // asteroid); bullet impacts read clearly enough from the hitstop,
    // damage number, particle burst, and per-pattern audio cue.
    this.triggerHitstop(4); // ~67ms — quick jolt
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

    // 5.88.0 — no automatic post-hit invuln; brief hit-flash still fires.
    player._hitFlashTimer = 5;
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

        // 6.x — Route through the SINGLE takeDamage pipeline. Asteroid
        // collisions previously applied ONLY the shield reduction, so
        // BULWARK, dash i-frames, DODGE, REFLEXES, STATIC_FIELD, and the
        // `_lastDamageAt` regen gate were all skipped here — now unified.
        // applyThorns (inside takeDamage) decrements asteroid.health
        // directly since asteroids have no takeDamage method. Returns the
        // HP actually lost so the shake can scale.
        const dealt = this.takeDamage(totalDamage, { source: asteroid, fxX: asteroid.x, fxY: asteroid.y });
        if (this.player.health <= 0) return; // died with no save

        // 5.88.0 — no automatic post-hit invuln. Hit feedback still fires.
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

        // ── JUICE: hitstop + camera kick + damage-scaled shake ──
        // 6.17.1 — Shake scales with the dealt damage (sev formula matches
        // the enemy-collision site). Asteroid contacts on a heavily
        // shielded ship now shake less than a one-shot slam, instead
        // of every contact firing the same 20/12 jolt.
        this.triggerHitstop(6); // ~100ms freeze — satisfying impact weight
        const kickDx = this.player.x - asteroid.x;
        const kickDy = this.player.y - asteroid.y;
        this.triggerCameraKick(kickDx, kickDy, 8); // directional camera lurch
        if (dealt > 0) {
            const sev = Math.min(1, Math.max(0.15, dealt / 25));
            this.triggerScreenShake(
                Math.round(8 + sev * 18),
                Math.round(3 + sev * 10),
                asteroid.radius,
            );
        }
    }

    // Always damage the asteroid when colliding with player (massive damage)
    asteroid.health = Math.max(0, asteroid.health - COLLISION_CONFIG.PLAYER_ASTEROID_COLLISION_DAMAGE);
    if (this.isEntityOnScreen(asteroid)) {
        this.createDamageNumber(asteroid.x, asteroid.y - asteroid.baseRadius, COLLISION_CONFIG.PLAYER_ASTEROID_COLLISION_DAMAGE);
    }

    // Check if asteroid is destroyed
    if (asteroid.health <= 0) {
        // 5.74.3 — gold no longer auto-awarded on kill (pickup-only).
        // 5.74.31 — counts toward the kill streak.
        if (typeof this.onEnemyKill === 'function') this.onEnemyKill(asteroid);

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
