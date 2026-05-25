// Enhanced enemy system with multiple types and behaviors
import { GAME_CONFIG, ENEMY_BULLET_CONFIG, getEnemyFiringCooldown } from '../core/constants.js';
import { random, GameDimensions } from '../core/utils.js';
import { rgba } from '../core/color-cache.js';
import { frameClock } from '../core/frame-clock.js';
import { ENEMY_TYPES } from './enemy-data.js';
import * as movement from './movement.js';
import * as firing from './firing.js';
import * as shapes from './shapes.js';
import * as ai from './ai.js';
import { updateBossRage, bossFormationMovement, bossRageBlocksDamage, notifyBossDeath } from './boss-rage.js';
import { updateBossPhases, phaseBlocksDamage } from './boss-phases.js';
import { updateBossParts, coreBlocksDamage } from './boss-parts.js';
import { updateBossIntro, updateBossDeath, introBlocksDamage } from './boss-intro.js';
import { drawModularBoss } from './boss-render.js';
import { decayResistMap, ELEMENTS, weaknessElement } from '../combat/elements.js';
import { runAura } from './support-aura.js';
// ENMY-03 — cloak/invisibility. Default-safe: every wiring below is gated on
// `this.cloak`, which only PHANTOM (config.cloak) ever gets. Cloak-less enemies
// behave byte-for-byte as before.
import { createCloak, tickCloak, cloakAlpha } from './abilities/cloak.js';
// ENMY-07 — blink / burrow teleport. Default-safe: every wiring below is gated
// on `this.blink`, which only WRAITHWORM (config.blink) ever gets. Blink-less
// enemies behave byte-for-byte as before. `telegraphPhase`/`telegraphProgress`
// are read-only telegraph reads used to draw the "about to blink" tell.
import { createBlink, tickBlink, isVanished } from './abilities/blink-burrow.js';
import { telegraphPhase, telegraphProgress } from './telegraph.js';
// `isPortrait` drives the per-spawn enemy-radius shrink on phone-portrait;
// `isMobile` toggles the lateral weave decoration in update().
import { isMobile, isPortrait } from '../platform/platform-detect.js';

// 5.99.0 — Mobile combat decoration: small per-tick perpendicular weave
// that makes enemies READ as actively moving while they shoot.
const MOBILE_WEAVE_FORCE = 0.85;
const MOBILE_WEAVE_FREQ_HZ = 1.4;

// Re-export for consumers that import from enemy.js
export { ENEMY_TYPES };

// ── Feature toggles ────────────────────────────────────────────────────────
// Set window.SHOW_ENEMY_NAMES = false in the browser console to hide name labels
const showEnemyNames = () => window.SHOW_ENEMY_NAMES !== false; // default: true

export class Enemy {
    constructor(x, y, type = 'HUNTER', level = 1) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.level = level;
        this.firingCooldown = getEnemyFiringCooldown(type, level);
        this.initializeEnemy(x, y);
    }
    
    reset(x, y, type = 'HUNTER', level = 1, gameEngine = null) {
        this.type = type;
        this.config = ENEMY_TYPES[type];
        this.level = level;
        this.firingCooldown = getEnemyFiringCooldown(type, level);
        this.initializeEnemy(x, y, gameEngine);
    }
    
    initializeEnemy(x, y, gameEngine = null) {
        // Use gameField dimensions if available, otherwise fall back to screen dimensions
        const fieldWidth = GameDimensions.width;
        const fieldHeight = GameDimensions.height;
        
        this.x = x !== undefined ? x : random(0, fieldWidth);
        this.y = y !== undefined ? y : random(0, fieldHeight);
        
        // 5.79.0 — Player damage no longer scales with level, so enemy
        //   level scaling is steepened so encounters at higher levels
        //   feel meaningfully harder. Player keeps pace through shop
        //   upgrades and powerups, not raw level damage.
        //   HP:    +0.15/lvl → +0.22/lvl   (L20 = 5.18×, was 3.85×)
        //   Size:  +0.10/lvl → +0.13/lvl, capped at 2.2× (was 2.0×)
        //   Speed: +0.15/lvl → +0.20/lvl   (L20 = 4.80×, was 3.85×)
        // 5.101.0 — Campaign now runs to wave 30. Slowed per-level rate
        // 0.22 → 0.147 so the wave-30 HP multiplier lands near the old
        // wave-20 ceiling (5.18× → 5.26×) instead of compounding to 7.5×.
        const levelMultiplier = 1 + (this.level - 1) * 0.147;
        this.maxHealth = Math.round(this.config.health * levelMultiplier);
        this.health = this.maxHealth;

        // Safeguard: ensure health never exceeds maxHealth
        if (this.health > this.maxHealth) {
            console.warn(`🐛 Enemy health bug detected: ${this.health} > ${this.maxHealth}, fixing...`);
            this.health = this.maxHealth;
        }

        // 5.101.0 — Enemy visual size no longer scales with level. Higher
        // waves still increase HP / damage / speed, but the silhouette
        // stays at base size so late-wave enemies don't visually dominate
        // the screen. The legacy size-multiplier curve is preserved as a
        // comment for reference.
        //   const sizeMultiplier = Math.min(2.2, 1 + (this.level - 1) * 0.13);
        const sizeMultiplier = 1;
        // 5.95.1 — Phone-portrait shrink. On a narrow phone display the
        // default enemy radii make the play area feel cramped at 1:1 scale.
        // Multiply by 0.7 in mobile-portrait to free up visual room without
        // changing damage / HP / speed (the enemies still hit just as hard,
        // they just take up less screen). Mobile-landscape keeps the
        // standard 1:1 size — wide viewports don't need the shrink. Desktop
        // is untouched.
        const portraitShrink = (isMobile() && isPortrait()) ? 0.7 : 1.0;
        this.radius = this.config.size * sizeMultiplier * portraitShrink;
        this.baseRadius = this.radius;
        this.color = this.config.color;

        // E8a — copy the type's element + resistance map onto the instance.
        // The resist map is a shallow COPY so per-enemy runtime mutation (e.g.
        // a Warden adapting to the last element that hit it) can't corrupt the
        // shared ENEMY_TYPES config. Read by applyDamageToEnemy (enemy.resist)
        // and the player damage path (enemy.element on ram + enemy shots).
        this.element = this.config.element || 'KINETIC';
        this.resist = this.config.resist ? { ...this.config.resist } : {};
        // E8a — flat armor floor (GUARDIAN); subtracted per hit in applyDamageToEnemy.
        this.armor = this.config.armor || 0;
        // E8a — frontal shield (SENTINEL); blocks hits from the player's bearing.
        this.frontalShield = this.config.frontalShield || null;
        // E8b — on-death flare (ASHEN_DETONATOR); bursts for AoE in onEnemyKill.
        this.deathFlare = this.config.deathFlare || null;
        // E8e — adaptive resist (WARDEN): resist map is mutated per-hit in
        // applyDamageToEnemy + decayed on a timer in _processStatusEffects.
        this.adaptive = this.config.adaptive || false;
        this._adaptiveDecayAt = 0;
        // A.E10-U3 — acid/element trail (PLAGUEBEARER): drops a S2 hazard zone
        // on a cadence as it moves (see movement.trailDrop + the update loop).
        this.trailHazard = this.config.trailHazard || null;
        this._nextTrailAt = 0;
        // E8e — split-on-death (HYDRA): spawns lings via the S3 spawn system in
        // onEnemyKill. Always reset `splitGen` to 0 here (clears any pooled
        // leftover); requestEnemySpawn's onSpawn bumps it on the children so the
        // lings can't re-split past `splitOnDeath.maxGen`.
        this.splitOnDeath = this.config.splitOnDeath || null;
        this.splitGen = 0;
        // E8c — drone spawner (SPORE_CARRIER): periodically births enemies via
        // the S3 spawn system on a cadence (see the update loop).
        this.spawner = this.config.spawner || null;
        this._nextSpawnAt = 0;
        // A.E9-S7 — ally support aura (LUMEN_DRONE / CONDUIT_NODE): buffs nearby
        // allies on a cadence. `_allyShield*` are the stamps a buffed ALLY reads
        // (reset here so a pooled enemy doesn't carry a stale shield).
        this.aura = this.config.aura || null;
        this._nextAuraAt = 0;
        this._allyShieldUntil = 0;
        this._allyShieldAmount = 0;
        // ENMY-03 — cloak/invisibility (PHANTOM). Attach a fresh cloak cycle when
        // the type marks it; otherwise NULL it out so a pooled enemy recycled
        // into a non-cloak type can't carry a stale cloak. `_revealedUntil` is
        // the AoE/MARK reveal stamp read by cloak's isTargetable; reset here.
        this.cloak = this.config.cloak ? createCloak(this.config.cloakOpts) : null;
        this._revealedUntil = 0;
        // ENMY-07 — blink/burrow teleport (WRAITHWORM). Attach a fresh blink
        // cycle when the type marks it; otherwise NULL it out so a pooled enemy
        // recycled into a non-blink type can't carry a stale blink. The config
        // may carry `blinkOpts` (kind/range/interval/telegraph timings).
        this.blink = this.config.blink ? createBlink(this.config.blinkOpts) : null;
        // SYS-9 / ENMY-10 — skill-suppress aura (NULL_DRONE). Carry the type's
        // `suppressAura` config { radius, cooldownScale, blocksActivation } onto
        // the instance (or NULL for every other type, so a pooled enemy recycled
        // into a non-drone type can't project a stale aura). Read each frame by
        // collision-system.applySuppressAura → applySuppression. No created
        // state — it's a plain read-only config the helper consumes.
        this.suppressAura = this.config.suppressAura || null;

        // Calculate mass based on radius (for collision physics)
        this.mass = Math.PI * Math.pow(this.radius, 2) * 0.8; // Slightly denser than player

        // 5.101.0 — 0.20 → 0.134 to match the widened 30-wave campaign;
        // wave-30 speed multiplier lands near the old wave-20 ceiling.
        const speedMultiplier = 1 + (this.level - 1) * 0.134;
        const scaledSpeed = this.config.speed * speedMultiplier;
        
        // Initialize movement
        this.vel = {
            x: random(-scaledSpeed, scaledSpeed) || 0.2,
            y: random(-scaledSpeed, scaledSpeed) || 0.2
        };
        
        // Enhanced rotation for visual effect and agility (toned down)
        this.rotation = random(0, Math.PI * 2);
        // Much slower rotation for easier targeting
        if (this.type === 'WASP') {
            this.rotationSpeed = random(-0.02, 0.02); // Much reduced
        } else {
            this.rotationSpeed = random(-0.01, 0.01); // Much reduced
        }
        
        // Behavior state
        this.active = true;
        this.creationTime = frameClock.now;
        this.lastShot = 0;
        this.firingCooldown = 2000; // Will be set based on type and level
        this.targetPlayer = null;
        // Death-sequence flags — reset on every spawn so a recycled
        // pool slot doesn't start out destroyed.
        this._deathFlash = 0;
        this._shipDestroyed = false;
        this._debrisBurstFired = false;
        this._explosionFired = false;
        // Frame-stagger offset for late-wave AI throttling. Each enemy
        // gets a random parity bucket at spawn so half the active
        // enemies' heavy AI scans run on even frames and the other half
        // on odd frames — halves the per-frame AI cost in waves 15+.
        this._aiOffset = Math.random() < 0.5 ? 0 : 1;
        
        // Burst firing properties
        this.burstState = {
            active: false,
            shotsRemaining: 0,
            shotDelay: 0,
            cooldownUntil: 0,
            lastBurstShot: 0
        };
        
        // Cooldown timer removed - all enemies are now mobile
        
        // Line-of-sight caching for performance
        this.lastLOSCheck = 0;
        this.cachedLOSResult = undefined;
        
        // Face direction for orientation (initialized once in constructor)
        if (this.turnSpeed === undefined) {
            this.turnSpeed = 0.08; // How fast enemy can turn
        }
        
        // Reset face direction
        this.faceAngle = Math.random() * Math.PI * 2; // Random starting direction
        this.targetFaceAngle = this.faceAngle;
        
        // Light trail system
        this.trail = {
            positions: [], // Array of {x, y, age} objects
            maxLength: 15, // Maximum number of trail points
            updateInterval: 50, // Milliseconds between trail updates
            lastUpdate: 0,
            fadeTime: 800 // How long trail points last (ms)
        }
        
        // Movement pattern state
        this.patrolAngle = random(0, Math.PI * 2);
        this.patrolDirection = Math.random() < 0.5 ? 1 : -1; // Random initial patrol direction
        this.lastDirectionChange = frameClock.now;
        this.orbitalAngle = random(0, Math.PI * 2);
        this.swarmOffset = { x: random(-50, 50), y: random(-50, 50) };
        this.stealthTimer = 0;
        
        // Enhanced agility properties
        this.lastEvasiveManeuver = 0;
        this.evasiveDirection = { x: 0, y: 0 };
        this.evasiveTimer = 0;
        this.lastPlayerPosition = { x: 0, y: 0 };
        
        // Fish dart movement properties
        this.dartState = 'idle'; // 'idle', 'darting', 'slowing'
        this.dartDirection = { x: 0, y: 0 };
        this.dartTimer = 0;
        this.dartCooldown = 0;
        this.dartAngle = 0; // Current movement angle (45-degree increments)
        
        // Cardinal grid movement properties
        this.gridDirection = { x: 0, y: 0 };
        this.gridDistance = 0;
        this.gridTargetDistance = 0;
        this.gridDirections = [
            { x: 0, y: -1 }, // Up
            { x: 1, y: 0 },  // Right
            { x: 0, y: 1 },  // Down
            { x: -1, y: 0 }  // Left
        ];
        
        // Weaver spin-up state (initialized lazily in weaverSpinupMovement)
        this.weaverState = undefined;

        // Wasp zigzag movement state (initialized lazily in waspZigzagMovement)
        this.waspZigzagState = undefined;

        // Boulder (Titan) movement state (initialized lazily in boulderMovement)
        this.boulderState = undefined;

        // Sweep laser state (initialized lazily in updateSweepLaserSystem)
        this.sweepState = undefined;

        // Wavy movement properties
        this.wavyBaseAngle = random(0, Math.PI * 2);
        this.wavyTime = 0;
        this.wavyAmplitude = 30;
        this.wavyFrequency = 0.02;
        
        // Knight movement properties (L-shaped like chess knight)
        this.knightMoveTimer = 0;
        this.knightMoveDuration = 800 + Math.random() * 400; // 800-1200ms between moves
        this.knightTargetX = this.x;
        this.knightTargetY = this.y;
        this.knightMoving = false;
        this.knightMoveStartTime = 0;

        // ── Phase 3 — BRN (burn) + STUN status effects ──
        // BRN: ticks 10% of source damage every 0.5 s for up to 3 s, max 3 stacks.
        //   `brnStacks`     — current stack count (0-3). Per-tick damage scales linearly.
        //   `brnUntil`      — frameClock.now timestamp when BRN expires.
        //   `brnTickAt`     — next tick timestamp (ms). When `now >= brnTickAt`,
        //                     a damage tick is applied and this is bumped by 500.
        //   `brnSourceDmg`  — peak source damage seen across stack applies.
        // STUN: zero velocity + skip firing while `stunUntil > frameClock.now`.
        // Reset every spawn so a recycled pool slot doesn't carry forward state.
        this.brnStacks = 0;
        this.brnUntil = 0;
        this.brnTickAt = 0;
        this.brnSourceDmg = 0;
        this.stunUntil = 0;
        // SLOW: scales movement speed by `slowFactor` while
        // `slowUntil > frameClock.now` (Nova AFTERSHOCK). Reset on spawn.
        this.slowUntil = 0;
        this.slowFactor = 1;

        // ── E3 — extended elemental statuses ──
        //   CORRODE: +15%/stack incoming damage from ALL sources (read in
        //            applyDamageToEnemy). Up to 3 stacks, refresh-style.
        //   CHILL:   movement ×0.6 while active (a lighter slow; folds into
        //            slowMul in update()).
        //   FREEZE:  full halt + no firing (OR'd into the `stunned` gate) and
        //            brittle — the SHATTER reaction (E4) reads `freezeUntil`.
        //   CONDUCT: +50% VOLT damage taken (read in applyDamageToEnemy).
        //   OIL / MARK: stored for the E4 reactions (Pyro flare / homing +
        //            crit + loot). Inert at this layer until E4 consumes them.
        //   BLEED:   DoT like BRN but faster ticks (300 ms) and NO refresh —
        //            stacks accumulate to 6; duration is set on first apply.
        this.corrodeStacks = 0;
        this.corrodeUntil = 0;
        this.chillUntil = 0;
        this.freezeUntil = 0;
        // ENMY-07 — blink-burrow's isFrozen reads `_frozenUntil`; applyChill /
        // applyFreeze mirror the live freeze window into it. Reset so a pooled
        // enemy can't carry a stale freeze that would block a fresh blink.
        this._frozenUntil = 0;
        this.conductUntil = 0;
        this.oilUntil = 0;
        this.markUntil = 0;
        // ENMY-03 — mirror of markUntil that cloak's isTargetable reads (kept in
        // sync by applyMark). Reset so a pooled enemy can't carry a stale mark.
        this._markUntil = 0;
        this.bleedStacks = 0;
        this.bleedUntil = 0;
        this.bleedTickAt = 0;
        this.bleedSourceDmg = 0;

        // Circulating shield indicator with music sync
        this.shield = {
            rotation: 0,
            rotationSpeed: 0.04 + Math.random() * 0.02, // Rotation speed (0.04 - 0.06)
            radius: this.radius + 18, // Shield distance from enemy center
            basePulsePhase: Math.random() * Math.PI * 2, // Random starting pulse phase
            segmentCount: 12 + Math.floor(Math.random() * 8), // 12-19 shield segments
            musicSyncIntensity: 0.7 + Math.random() * 0.6, // How strongly it responds to music (0.7-1.3)
            waveOffset: Math.random() * Math.PI * 2 // Phase offset for wave pattern
        }

        // ── Pool-recycle state scrub (6.x bug fix) ──────────────────────
        // Per-type movement/firing state lazy-inits via `if (x === undefined)`
        // in movement.js/firing.js, so once set on a slot it PERSISTS across
        // pool reuse — a recycled grunt could inherit another type's
        // mid-pattern state (instant-firing stalkers, stuck sentinel bursts,
        // etc.). Reset every such field to undefined so the lazy-init
        // re-triggers fresh for whatever type now occupies this slot.
        // initializeEnemy runs BEFORE applyEnemyLevelScaling, so clearing
        // the boss flags here is safe — real bosses re-set them afterward.
        this._arcDirection = undefined;
        this._arcAngle = undefined;
        this.arcState = undefined;
        this.arcTimer = undefined;
        this.boulderOrbitSign = undefined;
        this.circleAngle = undefined;
        this.crossScrollState = undefined;
        this.diamondProgress = undefined;
        this.drifterChargeOrbitSign = undefined;
        this.drifterWavePhase = undefined;
        this.guardianSinePhase = undefined;
        this.guardianVolleyIndex = undefined;
        this.hexagonProgress = undefined;
        this.knightOrbitSign = undefined;
        this.laserCharge = undefined;
        this.laserChargeProgress = undefined;
        this.laserChargeStartTime = undefined;
        this.orbitalState = undefined;
        this.prowlerState = undefined;
        this.sentinelArcPhase = undefined;
        this.sentinelBurstsFired = undefined;
        this.sentinelLastShot = undefined;
        this.sentinelSweepAngle = undefined;
        this.sentinelSweepLastDamage = undefined;
        this.spiralAngle = undefined;
        this._spiralFireAngle = undefined;
        this.squareBurstState = undefined;
        this.tacticalState = undefined;
        this.tankState = undefined;
        this.triangleBurstState = undefined;
        this.trailTimer = undefined;
        this.waspGunState = undefined;
        this.waspMovementState = undefined;
        this.waspOrbitSign = undefined;
        this.zigzagState = undefined;
        // (weaverState / waspZigzagState / boulderState / sweepState already
        // reset to undefined above.)

        // Boss / rage / formation flags — set only by applyEnemyLevelScaling
        // for real bosses, never cleared on recycle → a recycled grunt could
        // inherit boss treatment (extra HP path, rage rings, homing bullets).
        this.isBoss = false;
        this.isMiniBoss = false;
        this.bossTier = 0;
        this.bossSizeMul = 1;
        this.enableHomingBullets = false;
        this._partnerDied = false;
        this._bossPair = null;
        this._phaseTimer = 0;
        this._phaseIdx = 0;
        this._formationCenter = null;
        this._formationAngle = 0;
        this._formationRadius = 0;
        this._formationOmega = 0;
        this._rageActive = false;
        this._rageTriggered = false;
        this._rageTelegraph = false;
        this._rageFireRateApplied = false;
        this._rageInvulnUntil = 0;
    }
    
    // Get level-scaled damage for enemy attacks.
    // 5.79.0 — bumped to +0.30/level (was +0.18, +0.25 originally)
    //   since player damage no longer scales with level. The player
    //   has to invest in shop upgrades + powerups (CRIT, RAPID_FIRE,
    //   MULTI_SHOT, BIG_BULLETS, etc.) to keep up — enemy damage
    //   should make that investment feel mandatory.
    //   L20 = 6.7× base, L10 = 3.7×, L5 = 2.2× — steep but reachable.
    getLevelScaledDamage(baseDamage) {
        const levelMultiplier = 1 + (this.level - 1) * 0.30;
        return Math.round(baseDamage * levelMultiplier);
    }

    startWarpIn(targetX, targetY) {
        this.warping = true;
        this.warpTargetX = targetX;
        this.warpTargetY = targetY;
        this.warpStartX = this.x;
        this.warpStartY = this.y;
        this.warpStartTime = frameClock.now;
        // Smoothstep position curve + ease-out scale; longer baseline so the
        // entity grows in visibly instead of flashing into existence.
        const dist = Math.hypot(targetX - this.x, targetY - this.y);
        this.warpDuration = Math.min(1500, 700 + dist * 0.35);
        this.warpAngle = Math.atan2(targetY - this.y, targetX - this.x);
        this.faceAngle = this.warpAngle; // Face the warp direction
        this.warpTrail = [];
        this.warpScale = 0.15;            // grows to 1.0 by warp end
    }

    updateWarpIn() {
        const now = frameClock.now;
        const elapsed = now - this.warpStartTime;
        const t = Math.min(1, elapsed / this.warpDuration);

        // Smoothstep for position — gentle accelerate, gentle decelerate, no
        // snap at arrival. Scale uses ease-out quad so the entity becomes
        // visible quickly then settles into final size.
        const tPos = t * t * (3 - 2 * t);
        const tScale = 1 - Math.pow(1 - t, 2);

        this.x = this.warpStartX + (this.warpTargetX - this.warpStartX) * tPos;
        this.y = this.warpStartY + (this.warpTargetY - this.warpStartY) * tPos;
        this.warpScale = 0.15 + 0.85 * tScale;

        this.warpTrail.push({ x: this.x, y: this.y, time: now });
        while (this.warpTrail.length > 0 && now - this.warpTrail[0].time > 500) {
            this.warpTrail.shift();
        }

        if (t >= 1) {
            this.warping = false;
            this.x = this.warpTargetX;
            this.y = this.warpTargetY;
            this.warpTrail = [];
            this.warpScale = 1.0;
        }
    }

    drawWarpEffect(ctx) { return shapes.drawWarpEffect.call(this, ctx); }

    update(playerRef, gameEngine, gameField = null) {
        if (!this.active) return;
        this.gameEngine = gameEngine; // cached for draw/takeDamage paths

        // ── Death sequence (drift → recycle) ──
        // Two-beat death: drift under inertia for ~12 ticks, trigger
        // debris burst at tick 6, recycle at tick 0.
        if (this._deathFlash > 0) {
            const drag = 0.97;
            this.vel.x *= drag;
            this.vel.y *= drag;
            this.x += this.vel.x * GAME_CONFIG.TICK_SCALE;
            this.y += this.vel.y * GAME_CONFIG.TICK_SCALE;
            this.faceAngle = (this.faceAngle || 0) + 0.04;

            const max = this._deathFlashMax || 24;
            const tickIntoDeath = max - this._deathFlash;

            if (!this._debrisBurstFired && tickIntoDeath >= 6) {
                this._debrisBurstFired = true;
                if (gameEngine && typeof gameEngine.triggerEnemyDebrisBurst === 'function') {
                    try { gameEngine.triggerEnemyDebrisBurst(this); }
                    catch (err) { console.error('triggerEnemyDebrisBurst failed', err); }
                }
            }

            this._deathFlash--;
            if (this._deathFlash <= 0) this.active = false;
            return;
        }

        // ── Warp-in (skip normal AI) ──
        if (this.warping) {
            this.updateWarpIn();
            return;
        }

        if (!playerRef) return;
        this.targetPlayer = playerRef;

        // ── Phase 3 status effects (BRN + STUN) ──
        // Burn ticks run first — they may kill the enemy, in which case
        // `active` flips off and the rest of the tick short-circuits.
        this._processStatusEffects();
        if (!this.active) return;

        // ── ENMY-03 cloak cycle ──
        // Advance the visible↔cloaked cycle so cloaked-ness (read by draw +
        // homing/auto-aim targeting) stays current. Gated on `this.cloak`, so
        // this is a no-op for every non-PHANTOM enemy.
        if (this.cloak) tickCloak(this.cloak, frameClock.now);

        // STUN: zero velocity here so the per-pattern movement dispatch
        // below starts from a stopped state. We re-zero AFTER movement too
        // (some patterns set velocity directly without reading the current
        // value) so the enemy stays fully frozen for the stun duration.
        // E3 — FREEZE halts movement + firing exactly like STUN (it OR's
        // into `stunned`, which gates the velocity zeroes below + the
        // `_decideShooting` call). FREEZE additionally marks the enemy
        // brittle for the E4 SHATTER reaction.
        const stunned = this.stunUntil > frameClock.now || this.freezeUntil > frameClock.now;
        if (stunned) {
            this.vel.x = 0;
            this.vel.y = 0;
        }

        // A.E10-U3 — PLAGUEBEARER acid trail: drop a Toxic hazard zone (S2
        // HazardField) on a cadence as it moves; skipped while frozen/stunned.
        if (this.trailHazard && !stunned && gameEngine && typeof gameEngine.spawnHazard === 'function') {
            const r = movement.trailDrop(this.trailHazard, this._nextTrailAt, frameClock.now);
            if (r.drop) {
                gameEngine.spawnHazard(this.x, this.y, this.trailHazard);
                this._nextTrailAt = r.nextAt;
            }
        }

        // E8c — SPORE_CARRIER drone spawner: periodically births a capped swarm
        // via the S3 spawn system (reuses movement.trailDrop as a generic
        // interval-cadence gate); skipped while frozen/stunned.
        if (this.spawner && !stunned && gameEngine && typeof gameEngine.requestEnemySpawn === 'function') {
            const s = movement.trailDrop(this.spawner, this._nextSpawnAt, frameClock.now);
            if (s.drop) {
                gameEngine.requestEnemySpawn(this.spawner.type, this.x + (Math.random() - 0.5) * 40,
                    this.y + (Math.random() - 0.5) * 40, { cap: this.spawner.cap });
                this._nextSpawnAt = s.nextAt;
            }
        }

        // A.E9-S7 — support aura: on a cadence, shield/heal nearby allies. The
        // stamp lingers briefly, so killing this support drops the buff.
        if (this.aura && !stunned && gameEngine && gameEngine.enemyPool) {
            const au = movement.trailDrop(this.aura, this._nextAuraAt, frameClock.now);
            if (au.drop) {
                runAura(this, gameEngine.enemyPool.activeObjects, frameClock.now);
                this._nextAuraAt = au.nextAt;
            }
        }

        // BOSS-04 — modular boss driver. A boss spawned from a `bosses/*`
        // descriptor carries `_bossDriver` (the descriptor's updateBoss). It
        // owns the per-frame intro→parts→phases order + stashes `_now`, so we
        // run IT instead of the four generic chassis calls below (which would
        // otherwise double-advance the runners). The death sequence is NOT
        // ticked by updateBoss, so we still run updateBossDeath for it. Wrapped
        // in try/catch so a buggy boss module can never break the game loop.
        if (this.isBoss && typeof this._bossDriver === 'function') {
            try { this._bossDriver(this, gameEngine, Date.now()); }
            catch (err) { console.error('boss updateBoss failed', err); }
            updateBossDeath(this, gameEngine);
        } else if (this.isBoss) {
            // Legacy tier-boss path (boss-rage.js) + any boss given the chassis
            // runners directly. Unchanged.
            // Boss rage + per-tier mechanics (HP-threshold telegraph, invuln,
            // tantrum, tier-4 phase cycling, tier-2 partner-death flags).
            updateBossRage(this, gameEngine);
            // D.B0 — declarative phase-script runner (no-op unless this boss was
            // given a phaseScript via initBossPhases).
            updateBossPhases(this, gameEngine);
            // D.B0 — weak-point sub-entities: track part positions (no-op unless
            // this boss was given a partsScript via initBossParts).
            updateBossParts(this, gameEngine);
            // D.B0 — time-gated intro/death sequences (no-op unless this boss was
            // given a sequence via initBossIntro / initBossDeath). NOT gated by
            // dying/warping: an intro plays during warp-in, a death while dying.
            updateBossIntro(this, gameEngine);
            updateBossDeath(this, gameEngine);
        }

        // Late-wave AI throttle: in waves 15+, run the heavy spatial scans
        // on alternating frames per enemy.
        const wave = (gameEngine && gameEngine.game && gameEngine.game.currentWave) | 0;
        const tick = frameClock.tick;
        const skipHeavyAI = wave >= 15 && (tick & 1) !== this._aiOffset;

        const playerDistance = Math.hypot(this.x - playerRef.x, this.y - playerRef.y);
        this.updateTargetPriority(playerDistance, gameEngine);
        this.updateFaceDirection();

        // Tier-3 (and tier-4 phase 0) formation orbit overrides normal movement.
        if (!this.isBoss || !bossFormationMovement(this)) {
            this.updateMovement(gameEngine);
        }

        // Mobile lateral weave — small sin-phased side-step perpendicular
        // to line-of-sight so enemies READ as actively moving while they shoot.
        if (isMobile() && !this.isBoss) {
            if (typeof this._weavePhase !== 'number') {
                this._weavePhase = Math.random() * Math.PI * 2;
            }
            this._weavePhase += (MOBILE_WEAVE_FREQ_HZ * Math.PI * 2) / 60;
            const dx = playerRef.x - this.x;
            const dy = playerRef.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
                const px = -dy / dist;
                const py =  dx / dist;
                const swing = Math.sin(this._weavePhase) * MOBILE_WEAVE_FORCE;
                this.vel.x += px * swing;
                this.vel.y += py * swing;
            }
        }

        if (!skipHeavyAI) {
            this.updateEvasiveManeuvers(gameEngine);
            this.avoidAsteroids(gameEngine);
            if (this.currentTarget === 'player') {
                this.maintainDistanceFromPlayer();
            }
            if (gameEngine && gameEngine.enemyPool) {
                this.maintainDistanceFromEnemies(gameEngine.enemyPool.active);
            }
            if (this.currentTarget === 'patrol') {
                this.patrolTerritory();
            }
            this.dodgeEnemyBullets(gameEngine);
            this.dodgePlayerBullets(gameEngine);
        }

        // ── Shooting decision (runs every frame) ──
        // STUN suppresses firing entirely while the timer is active.
        if (!stunned) this._decideShooting(gameEngine);

        // Rotation + shield rotation + music-sync pulse.
        this.rotation += this.rotationSpeed;
        if (this.shield) {
            this.shield.rotation += this.shield.rotationSpeed;
            const musicPlayer = gameEngine && gameEngine.uiManager
                ? gameEngine.uiManager.musicPlayer
                : null;
            let musicIntensity = 0.5;
            if (musicPlayer && musicPlayer.isPlaying && musicPlayer.currentAudio) {
                const musicTime = musicPlayer.getCurrentTime();
                const assumedBPM = 130;
                const beatFrequency = assumedBPM / 60;
                const beatPhase = (musicTime * beatFrequency * Math.PI * 2) + this.shield.basePulsePhase;
                const primaryBeat = Math.sin(beatPhase);
                const harmonicBeat = Math.sin(beatPhase * 2) * 0.3;
                const subBeat = Math.sin(beatPhase * 0.5) * 0.2;
                musicIntensity = 0.5 + (primaryBeat + harmonicBeat + subBeat) * 0.5 * this.shield.musicSyncIntensity;
                musicIntensity = Math.max(0.1, Math.min(1.0, musicIntensity));
            } else {
                const time = frameClock.now * 0.001;
                const fallbackPhase = (time * 2.2 * Math.PI) + this.shield.basePulsePhase;
                musicIntensity = 0.5 + Math.sin(fallbackPhase) * 0.3;
            }
            this.shield.currentIntensity = musicIntensity;
        }

        this.addMicroMovements();
        this.addFishLikeMovement();

        // STUN: re-zero velocity AFTER all movement / micro-movement
        // helpers ran. Some patterns set velocity directly (vs.
        // accumulating), so the early zero above isn't enough on its
        // own. Doing both ensures the enemy is fully frozen for the
        // duration of the stun.
        if (stunned) {
            this.vel.x = 0;
            this.vel.y = 0;
        }

        // Position update (scaled for tick rate). SLOW scales movement
        // while active (Nova AFTERSHOCK) — firing is unaffected.
        let slowMul = (this.slowUntil > frameClock.now) ? (this.slowFactor || 0.7) : 1;
        // E3 — CHILL is a lighter movement slow (×0.6); take the strongest
        // (lowest) factor in effect so chill + slow don't stack to a crawl.
        if (this.chillUntil > frameClock.now) slowMul = Math.min(slowMul, 0.6);
        this.x += this.vel.x * GAME_CONFIG.TICK_SCALE * slowMul;
        this.y += this.vel.y * GAME_CONFIG.TICK_SCALE * slowMul;

        this.updateLightTrail();
        this.createTrailParticles(gameEngine);

        // Boundary bounce (with field) or torus wraparound (fallback).
        if (gameField) {
            if (this.x - this.radius < 0) {
                this.x = this.radius;
                this.vel.x = Math.abs(this.vel.x) * 0.8;
            } else if (this.x + this.radius > gameField.width) {
                this.x = gameField.width - this.radius;
                this.vel.x = -Math.abs(this.vel.x) * 0.8;
            }
            if (this.y - this.radius < 0) {
                this.y = this.radius;
                this.vel.y = Math.abs(this.vel.y) * 0.8;
            } else if (this.y + this.radius > gameField.height) {
                this.y = gameField.height - this.radius;
                this.vel.y = -Math.abs(this.vel.y) * 0.8;
            }
        } else {
            const fieldWidth = GameDimensions.width;
            const fieldHeight = GameDimensions.height;
            if (this.x < -this.radius) this.x = fieldWidth + this.radius;
            if (this.x > fieldWidth + this.radius) this.x = -this.radius;
            if (this.y < -this.radius) this.y = fieldHeight + this.radius;
            if (this.y > fieldHeight + this.radius) this.y = -this.radius;
        }

        // ── ENMY-07 blink / burrow cycle ──
        // Driven AFTER the movement integration + boundary handling so that on a
        // telegraph STRIKE the teleport is the enemy's FINAL position this frame
        // (it overwrites the just-integrated x/y and wins over wraparound). The
        // helper telegraphs first (windup → strike), relocates exactly once on
        // the strike, and is freeze-guarded (CHILL/FREEZE mirror `_frozenUntil`).
        // Gated on `this.blink`, so this is a no-op for every non-WRAITHWORM
        // enemy. `targetPlayer` is the burrow re-emerge anchor.
        if (this.blink) tickBlink(this, this.targetPlayer, frameClock.now);

        // Death check (tolerance for floating-point precision).
        if (this.health <= 0.001 && this.active) {
            // This branch catches deaths that DIDN'T go through a collision
            // death handler — chiefly damage-over-time (burn / poison) and
            // any other takeDamage() path that drops health to 0 without
            // starting the death sequence. Such deaths used to silently set
            // active=false here, so the enemy vanished with NO explosion,
            // loot, or kill credit. Route them through the same canonical
            // finalize as every other kill (onEnemyKill → createEnemyDebris
            // → dropOrbs) so there is ALWAYS an explosion. A normally-killed
            // enemy is already mid death-animation (_deathFlash > 0 returns
            // early at the top of update), so it never reaches here — no
            // double-fire. createEnemyDebris owns _deathFlash + recycling,
            // so we deliberately do NOT set active=false (that would cut the
            // explosion short).
            const ge = this.gameEngine;
            if (ge && typeof ge.createEnemyDebris === 'function') {
                if (typeof ge.onEnemyKill === 'function') {
                    try { ge.onEnemyKill(this); } catch (_) { /* keep dying */ }
                }
                ge.createEnemyDebris(this);
                if (typeof ge.dropOrbsFromEntity === 'function') {
                    try { ge.dropOrbsFromEntity(this.x, this.y, this); } catch (_) { /* keep dying */ }
                }
                // P6 — Harvest passive: this branch is the status-DoT kill path,
                // so a Harvest player reaps bonus energy + a gold orb here.
                if (typeof ge.harvestBonus === 'function') {
                    try { ge.harvestBonus(this); } catch (_) { /* keep dying */ }
                }
            } else {
                // No engine reference (unit tests / off-engine) — recycle.
                this.active = false;
            }
            if (typeof window !== 'undefined' && window._qaBotKillBuffer) {
                window._qaBotKillBuffer.push({
                    type: this.type,
                    wave: this.gameEngine?.game?.currentWave,
                    ts: Date.now(),
                    maxHealth: this.maxHealth,
                });
            }
        }
    }

    /**
     * Per-tick shooting decision. Pattern dispatch + cooldown gate +
     * aim-tolerance check; calls the matching `firing.js` helper inline.
     */
    _decideShooting(gameEngine) {
        if (!gameEngine || !gameEngine.enemyBulletPool) return;
        if (!this.targetPlayer) return;

        // Arc-movement enemies only shoot when stopped.
        if (this.config.movePattern === 'arc' && !this.canShoot) return;
        // Tank-movement enemies only shoot in firing state.
        if (this.config.movePattern === 'tank' && this.tankState !== 'firing') return;

        const playerDistance = Math.hypot(
            this.x - this.targetPlayer.x,
            this.y - this.targetPlayer.y,
        );
        const avgScreenSize = (window.innerWidth + window.innerHeight) / 2;
        const maxShootingRange = Math.min(this.getTerritorySize() * 1.5, avgScreenSize * 1.0);
        if (playerDistance > maxShootingRange) return;

        // Line-of-sight check (asteroids block shots).
        if (!this.hasLineOfSight(this.targetPlayer, gameEngine)) return;

        const now = frameClock.now;

        // Continuous patterns.
        if (this.config.shootPattern === 'wasp_machinegun') {
            this.updateWaspMachineGun(gameEngine);
            return;
        }
        if (this.config.shootPattern === 'sweep_laser') {
            this.updateSweepLaserSystem(gameEngine);
            return;
        }
        if (this.config.shootPattern === 'sentinel_sweep') {
            this.updateSentinelSweep(gameEngine);
            return;
        }

        // Spiral laser is triggered inside weaverSpinupMovement.
        if (this.config.shootPattern === 'spiral_laser') return;

        // Aim-tolerance gate (charging patterns exempt — they advance per frame).
        const isChargingPattern =
            this.config.shootPattern === 'laser' ||
            this.config.shootPattern === 'arc_lightning';
        if (!isChargingPattern && this.targetPlayer) {
            const aimDx = this.targetPlayer.x - this.x;
            const aimDy = this.targetPlayer.y - this.y;
            const toPlayer = Math.atan2(aimDy, aimDx);
            let aimDiff = toPlayer - this.faceAngle;
            while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
            while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
            if (Math.abs(aimDiff) > Math.PI / 6) return;
        }

        const isBurstPattern =
            this.config.shootPattern === 'burst_3' ||
            this.config.shootPattern === 'burst_2' ||
            this.config.shootPattern === 'square_burst' ||
            this.config.shootPattern === 'hunter_single';

        if (isBurstPattern) {
            this.handleBurstShooting(gameEngine, now);
            return;
        }

        if (isChargingPattern) {
            // Per-frame call advances charge state.
            this.shoot(gameEngine);
            return;
        }

        // Non-burst patterns (circle_6, homing, …). Cooldown gate.
        if (now - this.lastShot > this.firingCooldown) {
            this.shoot(gameEngine);
            this.lastShot = now;
            this.firingCooldown = getEnemyFiringCooldown(this.type, this.level || 1);
        }
    }
    
    updateFaceDirection() { return ai.updateFaceDirection.call(this); }
    
    updateMovement(gameEngine) {
        const now = frameClock.now;
        
        switch (this.config.movePattern) {
            case 'chase':
                this.chasePlayer();
                break;
            case 'patrol':
                this.patrolMovement();
                break;
            case 'drifter_wave':
                this.drifterWaveMovement();
                break;
            case 'swarm':
                this.swarmMovement();
                break;
            case 'slow_orbit':
                this.orbitalMovement();
                break;
            case 'stealth':
                this.stealthMovement(now);
                break;
            case 'fish_dart':
                this.fishDartMovement();
                break;
            case 'cardinal_grid':
                this.cardinalGridMovement();
                break;
            case 'wavy':
                this.wavyMovement();
                break;
            case 'triangle':
                this.triangleMovement();
                break;
            case 'hunter_arc':
                this.hunterArcMovement();
                break;
            case 'square':
                this.squareMovement();
                break;
            case 'diamond':
                this.diamondMovement();
                break;
            case 'zigzag':
                this.zigzagMovement();
                break;
            case 'tactical_hover':
                this.tacticalHoverMovement();
                break;
            case 'wasp_dart':
                this.waspDartMovement();
                break;
            case 'hexagon':
                this.hexagonMovement();
                break;
            case 'tank':
                this.tankMovement();
                break;
            case 'weaver_spinup':
                this.weaverSpinupMovement(gameEngine);
                break;
            case 'wasp_zigzag':
                this.waspZigzagMovement();
                break;
            case 'boulder':
                this.boulderMovement();
                break;
            case 'arc':
                this.arcMovement();
                break;
            case 'cross':
                this.crossMovement();
                break;
            case 'circle':
                this.circleMovement();
                break;
            case 'stationary':
                this.stationaryMovement();
                break;
            case 'keep_distance':
                this.keepDistanceMovement();
                break;
            case 'straight':
                // Enhanced straight movement with subtle course corrections
                if (this.targetPlayer) {
                    const dx = this.targetPlayer.x - this.x;
                    const dy = this.targetPlayer.y - this.y;
                    const distance = Math.hypot(dx, dy);
                    
                    // Very subtle course correction toward player
                    if (distance > 0) {
                        const correctionStrength = 0.01;
                        this.vel.x += (dx / distance) * correctionStrength;
                        this.vel.y += (dy / distance) * correctionStrength;
                    }
                    
                    // Add slight wobble to make it harder to predict
                    const wobble = Math.sin(frameClock.now * 0.01 + this.x * 0.005) * 0.1;
                    this.vel.x += wobble;
                    this.vel.y += Math.cos(frameClock.now * 0.01 + this.y * 0.005) * 0.1;
                }
                break;
            default:
                // Default movement - simple chase
                this.chasePlayer();
                break;
        }
    }
    
    chasePlayer() { return movement.chasePlayer.call(this); }
    
    patrolMovement() { return movement.patrolMovement.call(this); }

    drifterWaveMovement() { return movement.drifterWaveMovement.call(this); }

    swarmMovement() { return movement.swarmMovement.call(this); }
    
    orbitalMovement() { return movement.orbitalMovement.call(this); }
    
    stealthMovement(now) { return movement.stealthMovement.call(this, now); }
    
    fishDartMovement() { return movement.fishDartMovement.call(this); }

    startFishDart() { return movement.startFishDart.call(this); }
    
    cardinalGridMovement() { return movement.cardinalGridMovement.call(this); }

    chooseNewGridDirection() { return movement.chooseNewGridDirection.call(this); }
    
    wavyMovement() { return movement.wavyMovement.call(this); }
    
    knightMovement() { return movement.knightMovement.call(this); }

    startKnightMove() { return movement.startKnightMove.call(this); }
    
    spiralBurstMovement() { return movement.spiralBurstMovement.call(this); }

    startSpiralBurst() { return movement.startSpiralBurst.call(this); }
    
    heavyCrawlMovement() { return movement.heavyCrawlMovement.call(this); }
    
    updateTargetPriority(playerDistance, gameEngine) { return ai.updateTargetPriority.call(this, playerDistance, gameEngine); }
    
    initializeTerritory(gameEngine) { return ai.initializeTerritory.call(this, gameEngine); }
    
    getTerritorySize() { return ai.getTerritorySize.call(this); }
    
    isPlayerInTerritory(player) { return ai.isPlayerInTerritory.call(this, player); }
    
    findNearestAsteroid(gameEngine) { return ai.findNearestAsteroid.call(this, gameEngine); }
    
    isAsteroidInTerritory(asteroid) { return ai.isAsteroidInTerritory.call(this, asteroid); }
    
    maintainDistanceFromPlayer() { return ai.maintainDistanceFromPlayer.call(this); }
    
    maintainDistanceFromEnemies(enemies) { return ai.maintainDistanceFromEnemies.call(this, enemies); }
    
    patrolTerritory() { return ai.patrolTerritory.call(this); }
    
    generateNewPatrolPoint() { return ai.generateNewPatrolPoint.call(this); }
    
    updateLightTrail() { return ai.updateLightTrail.call(this); }
    
    createTrailParticles(gameEngine) { return ai.createTrailParticles.call(this, gameEngine); }
    
    // Geometric Movement Patterns
    triangleMovement() { return movement.triangleMovement.call(this); }
    hunterArcMovement() { return movement.hunterArcMovement.call(this); }

    calculateTriangleVertices() { return movement.calculateTriangleVertices.call(this); }

    squareMovement() { return movement.squareMovement.call(this); }

    calculateSquareVertices() { return movement.calculateSquareVertices.call(this); }

    diamondMovement() { return movement.diamondMovement.call(this); }

    calculateDiamondVertices() { return movement.calculateDiamondVertices.call(this); }

    hexagonMovement() { return movement.hexagonMovement.call(this); }

    calculateHexagonVertices() { return movement.calculateHexagonVertices.call(this); }
    
    tankMovement() { return movement.tankMovement.call(this); }
    
    arcMovement() { return movement.arcMovement.call(this); }

    zigzagMovement() { return movement.zigzagMovement.call(this); }

    tacticalHoverMovement() { return movement.tacticalHoverMovement.call(this); }

    waspDartMovement() { return movement.waspDartMovement.call(this); }

    crossMovement() { return movement.crossMovement.call(this); }

    circleMovement() { return movement.circleMovement.call(this); }

    stationaryMovement() { return movement.stationaryMovement.call(this); }

    keepDistanceMovement() { return movement.keepDistanceMovement.call(this); }
    
    
    avoidAsteroids(gameEngine) { return ai.avoidAsteroids.call(this, gameEngine); }
    
    updateEvasiveManeuvers(gameEngine) { return ai.updateEvasiveManeuvers.call(this, gameEngine); }
    
    dodgePlayerBullets(gameEngine) { return ai.dodgePlayerBullets.call(this, gameEngine); }
    
    avoidPlayerLineOfSight() { return ai.avoidPlayerLineOfSight.call(this); }
    
    addMicroMovements() { return ai.addMicroMovements.call(this); }
    
    addFishLikeMovement() { return ai.addFishLikeMovement.call(this); }
    
    dodgeEnemyBullets(gameEngine) { return ai.dodgeEnemyBullets.call(this, gameEngine); }
    
    updateShooting(gameEngine) {
        if (!gameEngine.enemyBulletPool) return;
        if (!this.targetPlayer) return;

        // 5.99.0 — Mobile enemies fire now (the 5.95 short-circuit
        // is removed). See sim/enemy.js header for the redesign.

        // Arc movement enemies can only shoot when stopped
        if (this.config.movePattern === 'arc' && !this.canShoot) return;
        
        // Tank movement enemies can only shoot when in firing state
        if (this.config.movePattern === 'tank' && this.tankState !== 'firing') return;
        
        const playerDistance = Math.hypot(this.x - this.targetPlayer.x, this.y - this.targetPlayer.y);
        // Limit shooting range to 1 screen maximum
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const avgScreenSize = (screenWidth + screenHeight) / 2;
        const maxShootingRange = Math.min(this.getTerritorySize() * 1.5, avgScreenSize * 1.0);
        
        if (playerDistance > maxShootingRange) return;
        
        // Check line of sight - don't shoot if player is blocked by asteroids
        if (!this.hasLineOfSight(this.targetPlayer, gameEngine)) return;
        
        const now = frameClock.now;
        
        // Wasp machine-gun: fully self-managed state machine
        if (this.config.shootPattern === 'wasp_machinegun') {
            this.updateWaspMachineGun(gameEngine);
            return;
        }

        // Sweep laser has its own timing system
        if (this.config.shootPattern === 'sweep_laser') {
            this.updateSweepLaserSystem(gameEngine);
            return;
        }

        // Sentinel sweep: rotating green beam handled in updateSentinelSweep()
        if (this.config.shootPattern === 'sentinel_sweep') {
            this.updateSentinelSweep(gameEngine);
            return;
        }

        // Spiral laser: shooting is triggered inside weaverSpinupMovement() during arc phase
        if (this.config.shootPattern === 'spiral_laser') return;

        // Aim check: don't fire unless roughly facing the player (~30°).
        // Exempts charging patterns (laser/arc_lightning) which need per-frame calls to advance state.
        const isChargingPattern = this.config.shootPattern === 'laser' || this.config.shootPattern === 'arc_lightning';
        if (!isChargingPattern && this.targetPlayer) {
            const aimDx = this.targetPlayer.x - this.x;
            const aimDy = this.targetPlayer.y - this.y;
            const toPlayer = Math.atan2(aimDy, aimDx);
            let aimDiff = toPlayer - this.faceAngle;
            while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
            while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
            if (Math.abs(aimDiff) > Math.PI / 6) return; // ~30° tolerance
        }

        // Handle burst patterns. 5.80.x — `hunter_single` joins the burst
        // pipeline; the data was always declared as a 3-shot burst (see
        // enemy-data.js firing.burstCount) but the prior single-shot
        // fallback ignored that. Burst handler now routes Hunter to a
        // tight 3-shot rapid burst per fire trigger.
        if (this.config.shootPattern === 'burst_3' || this.config.shootPattern === 'burst_2' || this.config.shootPattern === 'square_burst' || this.config.shootPattern === 'hunter_single') {
            this.handleBurstShooting(gameEngine, now);
        } else if (isChargingPattern) {
            // Charging patterns need per-frame calls to advance charge state
            this.shoot(gameEngine);
        } else {
            // Handle non-burst patterns (circle_6, homing, etc.)
            // Use level-based firing cooldown instead of shootRate
        if (now - this.lastShot > this.firingCooldown) {
            this.shoot(gameEngine);
            this.lastShot = now;
            // Update cooldown for next shot (in case level changed)
            this.firingCooldown = getEnemyFiringCooldown(this.type, this.level || 1);

                // Cooldown timer removed - turrets are now mobile
            }
        }
    }
    
    handleBurstShooting(gameEngine, now) { return firing.handleBurstShooting.call(this, gameEngine, now); }

    shoot(gameEngine) { return firing.shoot.call(this, gameEngine); }

    isStationary() { return firing.isStationary.call(this); }

    shootAimed(gameEngine, targetX, targetY) { return firing.shootAimed.call(this, gameEngine, targetX, targetY); }

    shootSpread(gameEngine, targetX, targetY) { return firing.shootSpread.call(this, gameEngine, targetX, targetY); }

    shootRapid(gameEngine, targetX, targetY) { return firing.shootRapid.call(this, gameEngine, targetX, targetY); }

    shootSpiral(gameEngine, targetX, targetY) { return firing.shootSpiral.call(this, gameEngine, targetX, targetY); }

    shootBurst(gameEngine, targetX, targetY) { return firing.shootBurst.call(this, gameEngine, targetX, targetY); }

    shootExplosive(gameEngine, targetX, targetY) { return firing.shootExplosive.call(this, gameEngine, targetX, targetY); }

    shootLaser(gameEngine, targetX, targetY) { return firing.shootLaser.call(this, gameEngine, targetX, targetY); }

    createLaserChargingEffect(gameEngine) { return firing.createLaserChargingEffect.call(this, gameEngine); }

    shootArcLightning(gameEngine, targetX, targetY) { return firing.shootArcLightning.call(this, gameEngine, targetX, targetY); }

    createArcLightningBolt(gameEngine, targetX, targetY) { return firing.createArcLightningBolt.call(this, gameEngine, targetX, targetY); }

    buildLightningPath(x1, y1, x2, y2, iterations) { return firing.buildLightningPath.call(this, x1, y1, x2, y2, iterations); }

    // Draw stored lightning bolt (canvas lines, NOT bullet pool visuals).
    // Called every frame from draw() until the bolt expires.
    drawLightningBolt(ctx) { return shapes.drawLightningBolt.call(this, ctx); }

    createWideLaserBeam(gameEngine, angle) { return firing.createWideLaserBeam.call(this, gameEngine, angle); }

    shootMissile(gameEngine, targetX, targetY) { return firing.shootMissile.call(this, gameEngine, targetX, targetY); }

    shootPulse(gameEngine, targetX, targetY) { return firing.shootPulse.call(this, gameEngine, targetX, targetY); }

    shootSpiralLaser(gameEngine) { return firing.shootSpiralLaser.call(this, gameEngine); }

    shootShieldBurst(gameEngine, targetX, targetY) { return firing.shootShieldBurst.call(this, gameEngine, targetX, targetY); }

    shootBurst3(gameEngine, targetX, targetY) { return firing.shootBurst3.call(this, gameEngine, targetX, targetY); }

    shootBurst2(gameEngine, targetX, targetY) { return firing.shootBurst2.call(this, gameEngine, targetX, targetY); }

    updateWaspMachineGun(gameEngine) { return firing.updateWaspMachineGun.call(this, gameEngine); }

    shootWaspBullet(gameEngine, targetX, targetY) { return firing.shootWaspBullet.call(this, gameEngine, targetX, targetY); }

    shootGuardianSpread(gameEngine, targetX, targetY) { return firing.shootGuardianSpread.call(this, gameEngine, targetX, targetY); }

    layMine(gameEngine, targetX, targetY) { return firing.layMine.call(this, gameEngine, targetX, targetY); }

    shootLine4(gameEngine, targetX, targetY) { return firing.shootLine4.call(this, gameEngine, targetX, targetY); }

    shootCircle6(gameEngine, targetX, targetY) { return firing.shootCircle6.call(this, gameEngine, targetX, targetY); }

    shootHoming(gameEngine, targetX, targetY) { return firing.shootHoming.call(this, gameEngine, targetX, targetY); }

    shootTitanRocket(gameEngine, targetX, targetY) { return firing.shootTitanRocket.call(this, gameEngine, targetX, targetY); }

    shootChargedLaser(gameEngine, targetX, targetY) { return firing.shootChargedLaser.call(this, gameEngine, targetX, targetY); }

    createLaserBeam(gameEngine, angle) { return firing.createLaserBeam.call(this, gameEngine, angle); }

    shootCrescentWave(gameEngine, targetX, targetY) { return firing.shootCrescentWave.call(this, gameEngine, targetX, targetY); }

    createCrescentBeam(gameEngine, baseAngle) { return firing.createCrescentBeam.call(this, gameEngine, baseAngle); }

    createEnemyBullet(gameEngine, angle, speed, color, explosive = false, movementPattern = 'aimed', target = null) { return firing.createEnemyBullet.call(this, gameEngine, angle, speed, color, explosive, movementPattern, target); }
    

    
    draw(ctx) {
        if (!this.active) return;

        // Once the midway big explosion fires, the ship vanishes for the
        // remainder of the death window — only its debris stays visible
        // (debris particles render themselves via the particle pool).
        if (this._shipDestroyed) return;

        // Death flash — BIG white silhouette that starts scaled up and fades/shrinks
        if (this._deathFlash > 0) {
            const maxT = this._deathFlashMax || 8;
            const t = this._deathFlash;
            const progress = 1 - t / maxT; // 0→1 over lifetime

            // Start at 1.5x scale, shrink to 0.3x while fading out
            // The initial large scale is immediately visible during hitstop
            const scale = 1.5 - progress * 1.2;
            const alpha = Math.max(0, 1.0 - progress * 1.1);

            // Draw bright additive glow behind the silhouette. Glow
            // radius reduced 3.0× → 1.5× so the popcorn cookoffs that
            // spawn at 1.4-2.2× radius sit OUTSIDE the halo and stay
            // visible during the drift phase.
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const glowR = this.radius * scale * 1.5;
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR);
            grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.7})`);
            grad.addColorStop(0.3, `rgba(200, 230, 255, ${alpha * 0.35})`);
            grad.addColorStop(1, 'rgba(150, 200, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Draw enemy shape as solid white silhouette at scaled size
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.faceAngle);
            ctx.scale(scale, scale);
            ctx.globalAlpha = alpha;
            this._deathFlashRendering = true;
            this.drawEnemyShape(ctx);
            this._deathFlashRendering = false;
            ctx.restore();

            return;
        }

        // Draw warp streak effect (behind everything)
        if (this.warping) {
            this.drawWarpEffect(ctx);
        }

        // BOSS-04 — modular boss body. A boss spawned from a `bosses/*`
        // descriptor (carries `bossId`) is drawn by the generic boss renderer
        // (core disc + living weak-points), NOT the per-type enemy silhouette.
        // The renderer no-ops while warping/dying so the warp streak above + the
        // death-flash branch earlier keep ownership of those moments. Drawn in
        // world space (the enemy draw pass is already inside the camera
        // transform), then we return so drawEnemyShape never runs for a boss.
        if (this.bossId && this.isBoss && !this.warping && !this._deathFlash) {
            try { drawModularBoss(ctx, this); }
            catch (err) { console.error('drawModularBoss failed', err); }
            return;
        }

        // 5.78.0 — mini-boss visual marker (P1). Mini-bosses (5.75.0
        // promoted regular enemies) get a slow-pulsing halo + a thin
        // outer ring in their type color. Quick visual tell that "this
        // one's special" without changing the silhouette.
        if (this.isMiniBoss && !this._deathFlash) {
            const now = Date.now();
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createRadialGradient(this.x, this.y, this.radius * 0.6, this.x, this.y, this.radius * 1.4);
            const baseColor = (this.color && this.color[0] === '#') ? this.color : '#ffaa44';
            grad.addColorStop(0, baseColor + '00');
            grad.addColorStop(0.55, baseColor + Math.floor(50 + pulse * 35).toString(16).padStart(2, '0'));
            grad.addColorStop(1, baseColor + '00');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 1.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            // Thin solid outer ring (rotation-invariant).
            ctx.save();
            ctx.strokeStyle = `rgba(255, 220, 90, ${0.45 + pulse * 0.25})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * 1.45, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // 5.77.0 — boss rage visuals.
        //   Telegraph (pre-rage): pulsing red ring for 0.4 s wind-up.
        //   Active: faint red aura + pulse so the player can read the
        //   "this thing is buffed" state at a glance.
        //   Invuln window: bright red shield ring (1.5 s after activation).
        if (this.isBoss) {
            const now = Date.now();
            const inv = this._rageInvulnUntil && now < this._rageInvulnUntil;
            if (this._rageTelegraph > 0) {
                const t = 1 - this._rageTelegraph / 24;
                const r = this.radius * (1.4 + Math.sin(now * 0.04) * 0.15);
                ctx.save();
                ctx.strokeStyle = `rgba(255, 60, 60, ${0.55 * (0.4 + 0.6 * t)})`;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } else if (inv) {
                const ttl = (this._rageInvulnUntil - now) / 1500;
                ctx.save();
                ctx.strokeStyle = `rgba(255, 90, 90, ${0.7 * ttl + 0.3})`;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 1.55, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = `rgba(255, 200, 200, ${0.5 * ttl})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 1.75, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            } else if (this._rageActive) {
                const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
                ctx.save();
                ctx.strokeStyle = `rgba(255, 70, 70, ${0.20 + 0.20 * pulse})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 1.35, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        // Draw laser targeting line first (behind everything else)
        if (this.type === 'DRIFTER' && this.laserCharging && this.laserCharge > 0) {
            this.drawLaserTargetingLine(ctx);
        }

        // Draw TITAN sweep laser (behind enemy body)
        if (this.type === 'TITAN' && this.sweepState && this.sweepState !== 'idle' && this.sweepState !== 'cooldown') {
            this.drawSweepLaser(ctx);
        }


        // ── ENMY-07 blink / burrow render ──
        // While the enemy is mid-blink/underground (telegraph windup + strike,
        // i.e. isVanished true) the normal shape must NOT render — it's gone.
        // During the WINDUP specifically we draw a small pulsing telegraph ring
        // at its current position so the impending vanish is TELEGRAPHED, not a
        // surprise; the STRIKE window draws nothing (it's already jumping). We
        // then return early, skipping the light trail + shape below. The
        // death-FX/debris branch returned far earlier, so this never touches it.
        // No-op for blink-less enemies (isVanished → false). Gated on this.blink.
        if (this.blink && isVanished(this, frameClock.now)) {
            const phase = telegraphPhase(this.blink.telegraph, frameClock.now);
            if (phase === 'windup') {
                const p = telegraphProgress(this.blink.telegraph, frameClock.now);
                const now = frameClock.now;
                const pulse = 0.5 + 0.5 * Math.sin(now * 0.03);
                // Ring contracts inward as the windup completes — a "charging to
                // vanish" tell. Fades out toward the strike.
                const ringR = this.radius * (1.6 - p * 0.7);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = (1 - p) * (0.45 + 0.35 * pulse);
                ctx.strokeStyle = (this.color && this.color[0] === '#') ? this.color : '#9b6bff';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
            return;
        }

        // Draw light trail first (behind enemy)
        this.drawLightTrail(ctx);

        // Draw targeting effect if this enemy is currently targeted (clicked)
        if (this.gameEngine && this.gameEngine.targetedEntity === this) {
            this.drawTargetingEffect(ctx);
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.faceAngle); // Rotate to face direction
        if (this.warping && this.warpScale != null && this.warpScale < 1) {
            // Entity grows from 15% → 100% during warp-in.
            ctx.scale(this.warpScale, this.warpScale);
        }

        // Health-based transparency
        const healthRatio = this.health / this.maxHealth;
        let baseAlpha = 0.7 + (healthRatio * 0.3);
        // ── ENMY-03 cloak fade ──
        // Multiply the cloak's 0..1 render alpha into the base alpha so a
        // cloaking PHANTOM fades toward invisible across the cycle. Wraps ONLY
        // this normal shape render (death-flash/debris is the earlier branch
        // that already returned, so a cloaked enemy still shows its death FX).
        // No-op for cloak-less enemies (a stays 1).
        if (this.cloak) baseAlpha *= cloakAlpha(this.cloak, frameClock.now);
        ctx.globalAlpha = baseAlpha;

        // Draw distinct geometric shape based on enemy type
        this.drawEnemyShape(ctx);

        // Damage flash — redraw hull as white silhouette overlay on hit
        // Single additive pass to match asteroid flash intensity
        if (this._hitFlashTimer > 0) {
            const flashAlpha = Math.min(1, (this._hitFlashTimer / 10) * 0.9);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = flashAlpha;
            this._deathFlashRendering = true;
            this.drawEnemyShape(ctx);
            this._deathFlashRendering = false;
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.restore();

        // Hit flash — localized at bullet impact point (world-space)
        if (this._hitFlashTimer > 0) {
            const maxT = 10;
            const t = this._hitFlashTimer;
            const alpha = t / maxT;
            const progress = 1 - alpha;
            const fr = this.radius * 0.75; // localized flash

            // Use stored impact point, or fall back to entity center
            const hp = this._hitPoint || { x: this.x, y: this.y };
            // Clamp impact point to within entity radius (bullet may be slightly outside)
            const dx0 = hp.x - this.x;
            const dy0 = hp.y - this.y;
            const d0 = Math.hypot(dx0, dy0);
            const maxDist = this.radius * 0.9;
            const cx = d0 > maxDist ? this.x + (dx0 / d0) * maxDist : hp.x;
            const cy = d0 > maxDist ? this.y + (dy0 / d0) * maxDist : hp.y;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // Localized flash — radial gradient at impact point
            const flashAlpha = alpha * 0.8;
            const flashRadius = fr * (1 + progress * 0.5);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius);
            grad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
            grad.addColorStop(0.5, `rgba(200, 230, 255, ${flashAlpha * 0.4})`);
            grad.addColorStop(1, 'rgba(150, 200, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, flashRadius, 0, Math.PI * 2);
            ctx.fill();

            // Small expanding ring from impact point
            if (progress > 0.1) {
                const ringProgress = (progress - 0.1) / 0.9;
                const ringRadius = fr * (0.4 + ringProgress * 2.0);
                const ringAlpha = (1 - ringProgress) * 0.35;
                ctx.strokeStyle = `rgba(180, 220, 255, ${ringAlpha})`;
                ctx.lineWidth = Math.max(1, fr * 0.10 * (1 - ringProgress));
                ctx.beginPath();
                ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Directional debris sparks from impact point
            const hitAngle = this._hitAngle || 0;
            const debrisCount = 5;
            const colors = ['255,255,255', '120,235,255', '255,255,150', '190,150,255', '255,200,100'];
            for (let i = 0; i < debrisCount; i++) {
                // Sparks spread in a cone away from the impact direction
                const angle = hitAngle + (i / debrisCount - 0.5) * 1.8;
                const speed = 0.5 + ((i * 31) % 10) * 0.07;
                const dist = progress * fr * 3.0 * speed;
                const ddx = Math.cos(angle) * dist;
                const ddy = Math.sin(angle) * dist;

                const sz = fr * (0.20 - progress * 0.10);
                if (sz <= 0) continue;

                const debrisAlpha = alpha * 0.55;
                ctx.fillStyle = `rgba(${colors[i]}, ${debrisAlpha})`;
                ctx.beginPath();
                ctx.arc(cx + ddx, cy + ddy, sz, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
            this._hitFlashTimer--;
        }

        // Draw laser charging ball (outside of transform, in front of drifter)
        if (this.type === 'DRIFTER' && this.laserCharging && this.laserCharge > 0) {
            this.drawLaserChargingBall(ctx);
        }

        // Draw fractal lightning bolt (Drifter) — canvas-rendered, not bullet pool
        if (this.type === 'DRIFTER' && this.lightningBolt) {
            this.drawLightningBolt(ctx);
        }
        
        // Draw pulsating circle only when targeted (outside of transform)
        if (this.gameEngine && this.gameEngine.targetedEntity === this) {
            this.drawPulsatingCircle(ctx);
        }
        
        // Draw health bar (outside of transform)
        this.drawHealthBar(ctx);

        // W7 — weakness telegraph pip (outside of transform, world space).
        this.drawWeaknessPip(ctx);

        // Level + name label BENEATH the enemy is intentionally disabled —
        // this info now lives only in the top-center info panel (see
        // hud/combat.js drawTargetInfo). Keeping the block as a comment for
        // reference rather than deleting outright.
        /*
        if (showEnemyNames() && this.health < this.maxHealth) {
            ctx.save();
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';

            const lvText   = 'LV';
            const numText  = String(this.level || 1);
            const nameText = ' ' + this.config.name.toUpperCase();

            ctx.font = '13px "Silkscreen", monospace';
            const lvWidth   = ctx.measureText(lvText).width;
            const numWidth  = ctx.measureText(numText).width;
            const nameWidth = ctx.measureText(nameText).width;
            const startX = this.x - (lvWidth + numWidth + nameWidth) / 2;
            const textY  = this.y + this.radius + 10;

            ctx.globalAlpha = 0.4;
            ctx.font = '14px "Silkscreen", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(lvText, startX, textY);
            ctx.fillStyle = '#88ccff';
            ctx.fillText(numText, startX + lvWidth, textY);
            ctx.fillStyle = 'goldenrod';
            ctx.fillText(nameText, startX + lvWidth + numWidth, textY);

            ctx.globalAlpha = 1.0;
            ctx.font = '13px "Silkscreen", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(lvText, startX, textY);
            ctx.fillStyle = '#88ccff';
            ctx.fillText(numText, startX + lvWidth, textY);
            ctx.fillStyle = 'goldenrod';
            ctx.fillText(nameText, startX + lvWidth + numWidth, textY);

            ctx.restore();
        }
        */
    }
    
    drawLaserTargetingLine(ctx) { return shapes.drawLaserTargetingLine.call(this, ctx); }
    
    drawLaserChargingBall(ctx) { return shapes.drawLaserChargingBall.call(this, ctx); }
    
    drawTargetingEffect(ctx) { return shapes.drawTargetingEffect.call(this, ctx); }
    
    drawEnemyShape(ctx) { return shapes.drawEnemyShape.call(this, ctx); }
    
    // drawAimingTriangle method removed - not working as intended

    drawTriangle(ctx) { return shapes.drawTriangle.call(this, ctx); }
    
    drawSquare(ctx) { return shapes.drawSquare.call(this, ctx); }
    
    drawDiamond(ctx) { return shapes.drawDiamond.call(this, ctx); }
    
    drawHexagon(ctx) { return shapes.drawHexagon.call(this, ctx); }
    
    drawCross(ctx) { return shapes.drawCross.call(this, ctx); }
    
    drawSpikedCircle(ctx) { return shapes.drawSpikedCircle.call(this, ctx); }
    
    drawLaserTurret(ctx) { return shapes.drawLaserTurret.call(this, ctx); }
    
    drawMissileTurret(ctx) { return shapes.drawMissileTurret.call(this, ctx); }
    
    drawPulseTurret(ctx) { return shapes.drawPulseTurret.call(this, ctx); }
    
    drawShieldTurret(ctx) { return shapes.drawShieldTurret.call(this, ctx); }
    
    drawWaspShip(ctx) { return shapes.drawWaspShip.call(this, ctx); }
    
    drawEmeraldGuardian(ctx) { return shapes.drawEmeraldGuardian.call(this, ctx); }
    
    drawTitanTank(ctx) { return shapes.drawTitanTank.call(this, ctx); }
    
    drawStalkerSword(ctx) { return shapes.drawStalkerSword.call(this, ctx); }
    
    drawPulsatingCircle(ctx) { return shapes.drawPulsatingCircle.call(this, ctx); }
    
    drawLightTrail(ctx) { return shapes.drawLightTrail.call(this, ctx); }
    
    drawHealthBar(ctx) { return shapes.drawHealthBar.call(this, ctx); }

    // W7 — weakness telegraph: a small element-colored chevron above the enemy
    // pointing at it, showing the element it's most WEAK to (resist ≤ −0.3).
    // Distinct from the body tint (which is the enemy's ATTACK element) so it
    // never misleads. Pulses gently; absent on enemies with no notable weakness.
    drawWeaknessPip(ctx) {
        const el = weaknessElement(this.resist);
        if (!el) return;
        const color = (ELEMENTS[el] && ELEMENTS[el].color) || '#ffffff';
        const px = this.x;
        const py = this.y - this.radius - 15;
        const now = (typeof frameClock !== 'undefined' && frameClock.now) ? frameClock.now : Date.now();
        const pulse = 0.65 + 0.35 * Math.sin(now / 240);
        const s = 5;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = color;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px - s, py - s);
        ctx.lineTo(px + s, py - s);
        ctx.lineTo(px, py + s); // downward point at the enemy
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    
    drawLaserChargingEffect(ctx) { return shapes.drawLaserChargingEffect.call(this, ctx); }
    
    // Cooldown timer method removed - turrets are now mobile
    
    hasLineOfSight(target, gameEngine) { return ai.hasLineOfSight.call(this, target, gameEngine); }

    /**
     * Phase 3 — process active BRN ticks + clear expired status timers.
     *
     * Runs once per `update()` tick before movement / AI dispatch. Owns
     * the per-stack burn-damage tick (10% of source × stack count, every
     * 500 ms while `brnUntil > now`). Burn damage flows through the
     * standard `takeDamage` → engine `applyDamageToEnemy` consolidator
     * so kills via burn properly award XP, increment kill counters,
     * trigger debris / explosion FX, and drop loot exactly like a bullet
     * kill.
     *
     * STUN is data-only at this layer — the `update()` body reads
     * `stunUntil` directly to gate velocity + firing. Nothing decays here.
     */
    _processStatusEffects() {
        const now = frameClock.now;

        // P6 — Hex Touch passive: +20% status-tick (burn/bleed DoT) damage.
        const _ge = this.gameEngine;
        const _hex = (_ge && _ge.player && typeof _ge.player.hasPassive === 'function'
            && _ge.player.hasPassive('HEX_TOUCH')) ? 1.2 : 1;
        // P6 — Conduit passive: ticks 25% faster (interval ×0.75). The matching
        // duration ×0.75 is set at apply time (combat-manager), so the tick
        // COUNT is preserved — same total DoT, delivered in a shorter window.
        const _conduit = (_ge && _ge.player && typeof _ge.player.hasPassive === 'function'
            && _ge.player.hasPassive('CONDUIT')) ? 0.75 : 1;

        // BRN tick — fire as many ticks as fit since the last tick. Most
        // frames will trigger at most one tick; the while-loop guards
        // against frame-time spikes that span multiple 500 ms windows.
        // Boundary semantics: the tick scheduled exactly at `brnUntil`
        // DOES fire (inclusive upper bound) so a 3-second burn yields a
        // clean 6 ticks at t = 0.5, 1.0, 1.5, 2.0, 2.5, 3.0.
        // Order matters: ticks run BEFORE expiry so the boundary tick
        // isn't pre-empted by the expiry check.
        if (this.brnStacks > 0 && this.brnUntil > 0) {
            while (now >= this.brnTickAt && this.brnTickAt <= this.brnUntil) {
                const tickDmg = this.brnSourceDmg * 0.1 * this.brnStacks * _hex;
                if (tickDmg > 0) {
                    // Route through takeDamage so the engine's standard
                    // damage pipeline runs (XP / kill streak / vampirism /
                    // debris / loot all stay attached). The `isBurn` flag
                    // lets the damage-number renderer render in red.
                    this.takeDamage(tickDmg, { showNumber: true, isBurn: true });
                    if (!this.active) return; // burn-killed; bail.
                }
                this.brnTickAt += 500 * _conduit;
            }
        }

        // BRN expiry — clear stacks once the timer fully runs out. Uses
        // strict `>` so the boundary tick above fires first.
        if (this.brnStacks > 0 && this.brnUntil > 0 && now > this.brnUntil) {
            this.brnStacks = 0;
            this.brnUntil = 0;
            this.brnTickAt = 0;
            this.brnSourceDmg = 0;
        }

        // E3 — BLEED tick. Mirrors BRN but faster (300 ms cadence) and the
        // per-tick payload scales with stack count (up to 6). Routes through
        // takeDamage like BRN so kills award XP/loot/FX. No refresh: duration
        // is fixed at first apply (see applyBleed), so a bleed always runs its
        // full window regardless of re-procs — re-procs only add stacks.
        if (this.bleedStacks > 0 && this.bleedUntil > 0) {
            while (now >= this.bleedTickAt && this.bleedTickAt <= this.bleedUntil) {
                const tickDmg = this.bleedSourceDmg * 0.08 * this.bleedStacks * _hex;
                if (tickDmg > 0) {
                    this.takeDamage(tickDmg, { showNumber: true, isBurn: true });
                    if (!this.active) return; // bleed-killed; bail.
                }
                this.bleedTickAt += 300 * _conduit;
            }
        }
        if (this.bleedStacks > 0 && this.bleedUntil > 0 && now > this.bleedUntil) {
            this.bleedStacks = 0;
            this.bleedUntil = 0;
            this.bleedTickAt = 0;
            this.bleedSourceDmg = 0;
        }

        // E3 — CORRODE expiry. The damage amp (applyDamageToEnemy) reads
        // `corrodeStacks` gated on `corrodeUntil`, but the stack count must
        // reset once the window lapses so a later re-apply starts clean.
        if (this.corrodeStacks > 0 && now > this.corrodeUntil) {
            this.corrodeStacks = 0;
            this.corrodeUntil = 0;
        }

        // E8e — WARDEN adaptive-resist decay. Every ~1s, fade the resistances
        // it has built up so switching elements (and stopping the spammed one)
        // lets the old wall come down. The per-hit bump lives in
        // applyDamageToEnemy; only adaptive enemies decay (fixed profiles don't).
        if (this.adaptive && this.resist) {
            if (now >= this._adaptiveDecayAt) {
                decayResistMap(this.resist, 0.8, 0.02);
                this._adaptiveDecayAt = now + 1000;
            }
        }
    }

    takeDamage(damage, opts = {}) {
        // 5.78.0 — delegated to the engine's `applyDamageToEnemy`
        // consolidator (M1). The consolidator owns invuln gating
        // (warp / deathFlash / boss rage), HP subtract + clamp, damage
        // number, stats, and boss-pair notify. Behaviour matches the
        // pre-consolidation path exactly; future damage modifiers land
        // in one place instead of three.
        if (this.gameEngine && typeof this.gameEngine.applyDamageToEnemy === 'function') {
            const result = this.gameEngine.applyDamageToEnemy(this, damage, opts);
            return result.destroyed;
        }
        // Fallback (no gameEngine ref — unit-test path) keeps minimal
        // damage application + return so tests that synthesize an enemy
        // outside the engine still work.
        if (this.warping || this._deathFlash > 0) return false;
        if (bossRageBlocksDamage(this)) return false;
        if (phaseBlocksDamage(this)) return false;
        // Core invulnerable while weak-point parts live (no-op without parts).
        if (coreBlocksDamage(this)) return false;
        // Invulnerable while the intro sequence plays (no-op without an intro).
        if (introBlocksDamage(this)) return false;
        this.health = Math.max(0, this.health - damage);
        return this.health <= 0.001;
    }
    
    weaverSpinupMovement(gameEngine) { return movement.weaverSpinupMovement.call(this, gameEngine); }

    waspZigzagMovement() { return movement.waspZigzagMovement.call(this); }

    boulderMovement() { return movement.boulderMovement.call(this); }

    updateSweepLaserSystem(gameEngine) { return firing.updateSweepLaserSystem.call(this, gameEngine); }

    isPlayerInSweepBeam(player, beamAngle, beamLength, beamHalfWidth) { return firing.isPlayerInSweepBeam.call(this, player, beamAngle, beamLength, beamHalfWidth); }

    updateSentinelSweep(gameEngine) { return firing.updateSentinelSweep.call(this, gameEngine); }

    shootCircleBurst(gameEngine, count = 8) { return firing.shootCircleBurst.call(this, gameEngine, count); }

    // ── Draw Sweep Laser (called from draw() outside ctx.translate/rotate) ──
    drawSweepLaser(ctx) { return shapes.drawSweepLaser.call(this, ctx); }

    getDestructionReward() {
        return {
            points: this.config.points,
            color: this.color,
            position: { x: this.x, y: this.y },
            shape: this.type,
            radius: this.radius,
            type: this.type
        };
    }
}