// Player weapon system — extracted from Player class
// All functions are called with .call(this) so `this` refers to the Player instance.

import { GAME_CONFIG } from '../core/constants.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, PRIMARY_UPGRADES } from '../combat/weapon-data.js';
import { autofireDiag } from '../autofire-diag.js';

// BIG_BULLETS uses an ADDITIVE pixel boost rather than a multiplicative
// scalar. With multiplication, weapons whose base bullets are tiny
// (Storm Needles at 0.5× base radius) barely showed any growth at low
// stacks, breaking the "this powerup makes bullets bigger" promise.
// Additive guarantees every weapon's bullet grows by the same Δpx per
// stack, so the visual feel is consistent across the roster.
const BIG_BULLETS_PX_PER_STACK = 1.5;

// ── Velocity-and-damage upgrade helper ────────────────────────────────────
// Per-weapon "high-velocity rounds"-style upgrade: each stack adds the same
// percentage to bullet speed AND damage. Weapons declare their bonus per
// stack in PRIMARY_UPGRADES via `velocityBonus` on the upgrade entry.
// Returns 1.0 with no stacks. Additive across stacks (3 stacks @ 0.12 = 1.36).
export function getBulletVelocityDamageMult(weaponId) {
    const cfg = PRIMARY_WEAPONS[weaponId || this.activePrimary];
    if (!cfg || !cfg.upgrades) return 1.0;
    let bonus = 0;
    for (const upgId of cfg.upgrades) {
        const upg = PRIMARY_UPGRADES[upgId];
        if (upg && upg.velocityBonus) {
            bonus += upg.velocityBonus * this.getPowerupStacks(upgId);
        }
    }
    return 1 + bonus;
}

// ── Charging / fire loop ───────────────────────────────────────────────────

export function updateChargingSystem(input, bulletPool, audioManager, particlePool) {
    const now = Date.now();
    const dt = 1000 / GAME_CONFIG.LOGIC_HZ; // ms per tick
    this.updateSkillCooldowns(dt);

    // ── Primary weapon: fires while LEFT-CLICK is held, gated only by
    //    fire-rate now. Clips were removed — unlimited continuous fire,
    //    weapon distinction comes from fire rate / damage / spread alone.
    const effectiveFireRate = this.getEffectivePrimaryFireRate();
    const timeSinceLastShot = now - this.lastShotTime;
    const cooldownReady = timeSinceLastShot >= effectiveFireRate;
    const fireHeld = !!(input && input.fire);
    this.canShoot = cooldownReady && fireHeld;
    const poolBefore = bulletPool.activeObjects.length;
    let bulletCreated = false;
    if (this.canShoot) {
        this.lastShotTime = now;
        this.lastPrimaryFireTime = now;
        try {
            this.firePrimary(bulletPool, audioManager, particlePool);
            bulletCreated = bulletPool.activeObjects.length > poolBefore;
        } catch (e) {
            console.error('[FIRE] firePrimary threw:', e.message, e.stack);
        }
    }

    // ── Diagnostic: record every tick ──
    autofireDiag.record({
        now,
        dt: timeSinceLastShot,
        rate: effectiveFireRate,
        canShoot: this.canShoot,
        poolBefore,
        poolAfter: bulletPool.activeObjects.length,
        bulletCreated,
        primary: this.activePrimary,
        charging: this.isCharging,
        chargeLvl: +(this.chargeLevel || 0).toFixed(2),
        chargePaused: this.chargePaused,
        active: this.active,
        px: Math.round(this.x),
        py: Math.round(this.y),
        angle: +this.angle.toFixed(3),
    });

    // ── Power weapon: charge-based or cooldown-based ──
    // Skip power weapon updates while shop/pause is open
    if (this.chargePaused) return;
    const powerConfig = this.getActivePowerConfig();

    if (powerConfig.isChargeBased) {
        // Charge shot behavior (existing)
        if (!this.isCharging) {
            this.isCharging = true;
            this.chargeStartTime = now;
            this.chargeLevel = 0;
        }

        const currentChargeTime = (now - this.chargeStartTime) + this.pausedChargeTime;
        const chargeSpeedStacks = this.getPowerupStacks('CHARGE_SPEED');
        const reducedMaxChargeTime = Math.max(1000, this.maxChargeTime - (chargeSpeedStacks * 1000));

        this.chargeLevel = Math.min(1, currentChargeTime / reducedMaxChargeTime);

        const isFullyCharged = currentChargeTime >= reducedMaxChargeTime;
        this.tractorBeamActive = this.isCharging && !isFullyCharged;
        this.isFullyCharged = isFullyCharged;

        const shouldFire = input.fireSecondary && currentChargeTime >= this.minChargeTime;

        if (shouldFire) {
            this.fireChargedShot(bulletPool, audioManager);
            this.isCharging = false;
            this.chargeLevel = 0;
            this.pausedChargeTime = 0;
            input.fireSecondary = false;
        }
    } else {
        // Cooldown-based power weapon
        this.isCharging = false;
        this.chargeLevel = 0;
        this.tractorBeamActive = false;
        this.isFullyCharged = false;

        if (input.fireSecondary && this.isPowerReady()) {
            this.firePower(bulletPool, audioManager, particlePool);
            input.fireSecondary = false;
        }
    }
}

// ── Primary weapon dispatch ────────────────────────────────────────────────

export function firePrimary(bulletPool, audioManager, particlePool) {
    // Hard cap on player bullets to prevent pool explosion with RAPID_FIRE + MULTI_SHOT stacking
    if (bulletPool.activeObjects.length >= 300) return false;

    const config = this.getActivePrimaryConfig();

    switch (this.activePrimary) {
        case 'PULSE_CANNON':
            this.firePulseCannon(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'medium', '#ffdd88');
            break;
        case 'STORM_NEEDLES':
            this.fireStormNeedles(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'light', '#88ccff');
            break;
        case 'SCATTER_GUN':
            this.fireScatterGun(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'heavy', '#ffaa44');
            break;
        case 'RAIL_DRIVER':
            this.fireRailDriver(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'heavy', '#44ffaa');
            break;
        case 'LANCE_BEAM':
            // Beam handled in update loop, not individual shots
            this.startLanceBeam(audioManager, config);
            break;
        default:
            this.firePulseCannon(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'medium', '#ffdd88');
    }
}

/**
 * Trigger muzzle flash on the player sprite + optional spark particles.
 * @param {object} particlePool
 * @param {'light'|'medium'|'heavy'} intensity
 * @param {string} color - CSS color for the sparks
 */
function spawnMuzzleFlare(particlePool, intensity, color) {
    // Set muzzle flash timer on the player (rendered in renderer.js)
    const dur = intensity === 'heavy' ? 8 : intensity === 'medium' ? 5 : 3;
    const intVal = intensity === 'heavy' ? 1.5 : intensity === 'medium' ? 1.0 : 0.6;
    // RGB components for the flash color
    const colorMap = { '#ffdd88': '255, 220, 140', '#88ccff': '140, 200, 255', '#ffaa44': '255, 170, 70', '#ffcc44': '255, 200, 70', '#44ffaa': '70, 255, 170' };
    this._muzzleFlashTimer = dur;
    this._muzzleFlashMax = dur;
    this._muzzleFlashIntensity = intVal;
    this._muzzleFlashColor = colorMap[color] || '255, 220, 140';

    // Spawn directional spark particles for medium/heavy
    if (!particlePool || intensity === 'light') return;
    const muzzleDist = GAME_CONFIG.SHIP_SIZE / 1.5;
    const mx = this.x + Math.cos(this.angle) * muzzleDist;
    const my = this.y + Math.sin(this.angle) * muzzleDist;

    const sparkCount = intensity === 'heavy' ? 3 : 1;
    for (let i = 0; i < sparkCount; i++) {
        const sparkAngle = this.angle + (Math.random() - 0.5) * (intensity === 'heavy' ? 1.0 : 0.4);
        const speed = (intensity === 'heavy' ? 5 : 3) * (0.7 + Math.random() * 0.6);
        const spark = particlePool.get(mx, my, 'explosionShrapnel', sparkAngle, speed, color);
        if (spark) {
            spark.life = 0.2 + Math.random() * 0.1;
            spark.length = 3 + Math.random() * 3;
        }
    }
}

export function firePulseCannon(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const echoStacks = this.getPowerupStacks('ECHO_ROUND');
    // Pass config.range so Pulse Cannon's reach is governed by
    // weapon-data.js like every other primary.
    this.createChargedBullets(bulletPool, 1, 1, damage, 0, 0, config.range);
    audioManager.playShoot();

    // Echo Round: chance to fire a bonus bullet
    if (echoStacks > 0 && Math.random() < echoStacks * 0.1) {
        this.createChargedBullets(bulletPool, 0.8, 1, damage * 0.7, 0, 0, config.range);
    }
}

export function fireStormNeedles(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const spreadAngle = config.spreadAngle;
    // MULTI_SHOT carry-over: +1 needle per stack, fanned across a small
    // additional spread so they don't overlap visually.
    const multiShotStacks = this.getPowerupStacks('MULTI_SHOT');
    const bulletCount = 1 + multiShotStacks;
    const fanSpread = bulletCount > 1 ? Math.min(0.5, 0.10 * (bulletCount - 1)) : 0;

    for (let i = 0; i < bulletCount; i++) {
        this.needleCount++;
        const fanOffset = bulletCount > 1
            ? (i - (bulletCount - 1) / 2) * (fanSpread / Math.max(1, bulletCount - 1))
            : 0;
        const jitter = (Math.random() - 0.5) * spreadAngle;
        const bullet = bulletPool.get(this.x, this.y, this.angle + fanOffset + jitter);
        if (bullet) {
            bullet.damage = damage;
            bullet.radius *= config.bulletSize;
            bullet.baseRadius = bullet.radius;
            bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
            bullet.maxLife = Math.round(bullet.maxLife * config.range);
            bullet.color = config.color;

            this.applyGlobalBulletUpgrades(bullet);

            if (this.getPowerupStacks('POISON_TIP') > 0) {
                bullet.poisonDamage = 1;
                bullet.poisonDuration = 2000;
            }
            if (this.getPowerupStacks('SUPPRESSION') > 0) {
                bullet.suppressionDuration = 1500;
            }
            const staticStacks = this.getPowerupStacks('STATIC_CHARGE');
            if (staticStacks > 0 && this.needleCount % 10 === 0) {
                bullet.chainLightning = staticStacks;
            }
        }
    }
    audioManager.playShoot();
}

export function fireScatterGun(bulletPool, audioManager, config) {
    this.scatterShotCount++;
    const damage = this.getEffectivePrimaryDamage();
    const buckshotStacks = this.getPowerupStacks('BUCKSHOT');
    const tightChokeStacks = this.getPowerupStacks('TIGHT_CHOKE');
    // MULTI_SHOT carry-over: +1 pellet per stack on top of BUCKSHOT.
    const multiShotStacks = this.getPowerupStacks('MULTI_SHOT');
    const slugRound = this.getPowerupStacks('SLUG_ROUND') > 0 && this.scatterShotCount % 4 === 0;

    if (slugRound) {
        // Slug round — fire (1 + multiShotStacks) slugs in a tight fan
        // so MULTI_SHOT carries over to the slug variant too.
        const slugCount = 1 + multiShotStacks;
        const slugFan = slugCount > 1 ? Math.min(0.4, 0.08 * (slugCount - 1)) : 0;
        for (let i = 0; i < slugCount; i++) {
            const offset = slugCount > 1
                ? (i - (slugCount - 1) / 2) * (slugFan / Math.max(1, slugCount - 1))
                : 0;
            const bullet = bulletPool.get(this.x, this.y, this.angle + offset);
            if (bullet) {
                bullet.damage = damage * 4;
                bullet.radius *= 1.8;
                bullet.baseRadius = bullet.radius;
                bullet.rangeMultiplier = this.getRangeMultiplier() * config.range * 1.5;
                bullet.maxLife = Math.round(bullet.maxLife * config.range * 1.5);
                bullet.color = '#ffaa00';
                this.applyGlobalBulletUpgrades(bullet);
            }
        }
    } else {
        // Pellet spread — multiShot adds extra pellets to the fan.
        const pelletCount = config.bulletCount + buckshotStacks + multiShotStacks;
        const spread = config.spreadAngle * Math.pow(0.85, tightChokeStacks);
        const startAngle = this.angle - spread / 2;

        for (let i = 0; i < pelletCount; i++) {
            const pelletAngle = startAngle + (spread * i / (pelletCount - 1 || 1)) + (Math.random() - 0.5) * 0.05;
            const bullet = bulletPool.get(this.x, this.y, pelletAngle);
            if (bullet) {
                bullet.damage = damage;
                bullet.radius *= config.bulletSize;
                bullet.baseRadius = bullet.radius;
                bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
                bullet.maxLife = Math.round(bullet.maxLife * config.range);
                bullet.color = config.color;
                // Shrapnel upgrade
                if (this.getPowerupStacks('SHRAPNEL') > 0) {
                    bullet.shrapnelOnExpire = true;
                }
                this.applyGlobalBulletUpgrades(bullet);
            }
        }
    }
    audioManager.playShoot();
}

export function fireRailDriver(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const penetratorStacks = this.getPowerupStacks('PENETRATOR');
    const rangeBonus = 1 + penetratorStacks * 0.5;
    const capacitorStacks = this.getPowerupStacks('RAILGUN_CAPACITOR');
    // MULTI_SHOT carry-over: +1 rail per stack, narrowly fanned because
    // rails travel far and a wide fan would feel chaotic.
    const multiShotStacks = this.getPowerupStacks('MULTI_SHOT');
    const railCount = 1 + multiShotStacks;
    const railFan = railCount > 1 ? Math.min(0.3, 0.06 * (railCount - 1)) : 0;

    let finalDamage = damage;
    if (capacitorStacks > 0) {
        const idleTime = Date.now() - this.lastPrimaryFireTime;
        if (idleTime > 2000) {
            finalDamage *= 2;
        }
    }

    for (let i = 0; i < railCount; i++) {
        const offset = railCount > 1
            ? (i - (railCount - 1) / 2) * (railFan / Math.max(1, railCount - 1))
            : 0;
        const bullet = bulletPool.get(this.x, this.y, this.angle + offset);
        if (bullet) {
            bullet.damage = finalDamage;
            bullet.radius *= config.bulletSize;
            bullet.baseRadius = bullet.radius;
            bullet.piercing = config.piercing;
            bullet.rangeMultiplier = this.getRangeMultiplier() * config.range * rangeBonus;
            bullet.maxLife = Math.round(bullet.maxLife * config.range * rangeBonus);
            bullet.color = config.color;

            if (this.getPowerupStacks('KINETIC_IMPACT') > 0) bullet.knockback = 8;
            if (this.getPowerupStacks('THROUGH_AND_THROUGH') > 0) bullet.damageTrail = true;

            // Speed boost for rail (apply after bulletPool initialized vel)
            const speed = Math.hypot(bullet.vel.x, bullet.vel.y);
            bullet.vel.x = (bullet.vel.x / speed) * speed * config.bulletSpeed;
            bullet.vel.y = (bullet.vel.y / speed) * speed * config.bulletSpeed;

            this.applyGlobalBulletUpgrades(bullet);
        }
    }
    audioManager.playShoot();
}

export function startLanceBeam(audioManager, config) {
    const lingerStacks = this.getPowerupStacks('LINGER');
    const duration = config.beamDuration + lingerStacks * 100;
    this.beamActive = true;
    this.beamTimer = duration;
    this.beamAngle = this.angle;

    const widthStacks = this.getPowerupStacks('BEAM_WIDTH');
    this.beamCurrentWidth = config.beamWidth * (1 + widthStacks * 0.3);
    this.beamDamagePerTick = config.damage;
    this.beamMaxDuration = duration;

    audioManager.playShoot();
}

// ── Global bullet upgrades ─────────────────────────────────────────────────

export function applyGlobalBulletUpgrades(bullet) {
    // Stamp the firing primary so collision-system can pick the per-weapon
    // hit SFX (audio:enemy-hit-by-bullet → playerHit_<weaponId>). Every
    // primary fire path runs through this helper, so this is the one
    // chokepoint to set it. Charge-shot stamps its own weaponId separately.
    bullet.weaponId = this.activePrimary;

    const homingStacks = this.getPowerupStacks('HOMING');
    const bigBulletStacks = this.getPowerupStacks('BIG_BULLETS');
    const piercingStacks = this.getPowerupStacks('PIERCING');
    const explosiveStacks = this.getPowerupStacks('EXPLOSIVE');

    // Range
    bullet.rangeMultiplier = (bullet.rangeMultiplier || 1) * this.getRangeMultiplier();

    // Velocity-and-damage upgrade — applies to BOTH bullet velocity and
    // damage by the same factor. Velocity adjustment scales the existing
    // vel components in place; weapons that don't have linear velocity
    // (LANCE_BEAM) just see the damage multiplier.
    const velMult = this.getBulletVelocityDamageMult();
    if (velMult !== 1) {
        bullet.damage *= velMult;
        if (typeof bullet.vel?.x === 'number') bullet.vel.x *= velMult;
        if (typeof bullet.vel?.y === 'number') bullet.vel.y *= velMult;
    }

    // Streak buff — granted by 3+ consecutive enemy kills. Multiplier
    // tier is set in player.streakDamageMult (combat-manager.js manages it).
    // Apply BEFORE crit so multipliers compound and the popup can tag both.
    const streakMult = this.streakDamageMult || 1;
    if (streakMult > 1) {
        bullet.damage *= streakMult;
        bullet.isEmpowered = true;
    }

    // Crit
    const critChance = this.getEffectiveCritChance();
    if (Math.random() * 100 < critChance) {
        const critMult = this.getEffectiveCritDamage() / 100;
        bullet.damage *= critMult;
        bullet.isCrit = true;
        bullet.color = '#FFFF00';
    }

    // Homing — unified formula across all weapons (see HOMING block in
    // createChargedBullets). Per-stack strength + cap chosen to feel
    // similar at low stacks and not run away at high stacks.
    if (homingStacks > 0) {
        bullet.homing = true;
        bullet.homingStrength = Math.min(0.4, homingStacks * 0.06);
    }

    // Big bullets — additive Δpx per stack (see BIG_BULLETS_PX_PER_STACK
    // comment at top of file for rationale on additive vs multiplicative).
    if (bigBulletStacks > 0) {
        bullet.radius += BIG_BULLETS_PX_PER_STACK * bigBulletStacks;
        bullet.baseRadius = bullet.radius;
    }

    // Piercing (additive with weapon built-in)
    if (piercingStacks > 0) {
        bullet.piercing = (bullet.piercing || 0) + piercingStacks;
    }

    // Explosive
    if (explosiveStacks > 0) {
        bullet.explosive = true;
        bullet.explosionRadius = 30 + explosiveStacks * 10;
    }
}

// ── Power weapon dispatch ──────────────────────────────────────────────────

export function firePower(bulletPool, audioManager, particlePool) {
    const config = this.getActivePowerConfig();

    switch (this.activePower) {
        case 'MINE_LAYER':
            this.layMine(config);
            break;
        case 'NOVA_BLAST':
            this.fireNova(config);
            break;
        case 'LIGHTNING_ARC':
            this.fireLightning(config);
            break;
        case 'MISSILE_SALVO':
            this.fireMissiles(bulletPool, config);
            break;
    }

    // Each weapon's fire fn sets its own cooldown with discount applied
    // (see fireNova / fireLightning / fireMissiles / layMine). We do NOT
    // overwrite here — that would cancel the upgrade.
    audioManager.playShoot();

    // Heavy muzzle flare for power weapons
    spawnMuzzleFlare.call(this, particlePool, 'heavy', '#ffcc44');
}

export function layMine(config) {
    const extraPayloadStacks = this.getPowerupStacks('EXTRA_PAYLOAD');
    const maxMines = config.maxMines + extraPayloadStacks;
    const blastRadiusStacks = this.getPowerupStacks('BLAST_RADIUS');

    // Remove oldest mine if at max
    while (this.activeMines.length >= maxMines) {
        this.activeMines.shift();
    }

    this.activeMines.push({
        x: this.x,
        y: this.y,
        armTimer: 1000,  // 1s to arm
        armed: false,
        // BLAST_RADIUS now boosts BOTH the trigger radius (+20px/stack)
        // and the blast/damage radius (+30px/stack) — investment in the
        // upgrade increases the mine's effective range overall.
        triggerRadius: config.mineRadius + blastRadiusStacks * 20,
        blastRadius: config.blastRadius + blastRadiusStacks * 30,
        damage: config.mineDamage,
        magnetic: this.getPowerupStacks('MAGNETIC_MINE') > 0,
        daisyChain: this.getPowerupStacks('DAISY_CHAIN') > 0,
        active: true,
        // Birth time used by the renderer for arming-pulse animation.
        spawnTime: Date.now(),
    });

    // RAPID_DEPLOY: -25% cooldown per stack, floor at 1.5s so it can't be
    // spammed every frame (4s base → 3s @1 stack → 2.25s @2 stacks).
    const rapidDeployStacks = this.getPowerupStacks('RAPID_DEPLOY');
    const reduction = Math.pow(0.75, rapidDeployStacks);
    this.powerCooldown = Math.max(1500, config.cooldown * reduction);
    // Stash the max so the HUD ring can display fill progress.
    this.powerCooldownMax = this.powerCooldown;
}

export function fireNova(config) {
    const shockwaveStacks = this.getPowerupStacks('SHOCKWAVE');
    const resonanceStacks = this.getPowerupStacks('RESONANCE');

    // Always set the cooldown — RESONANCE just shortens it. Previously
    // the cooldown was only set when resonanceStacks > 0, leaving Nova
    // spammable without the upgrade.
    this.powerCooldown = Math.max(2000, config.cooldown - resonanceStacks * 1500);
    this.powerCooldownMax = this.powerCooldown;

    this.novaRings.push({
        x: this.x,
        y: this.y,
        radius: 0,
        maxRadius: config.ringRadius + shockwaveStacks * 40,
        damage: config.ringDamage,
        duration: config.ringDuration,
        elapsed: 0,
        hitEnemies: new Set(),
        aftershock: this.getPowerupStacks('AFTERSHOCK') > 0,
    });

    // Double Pulse
    if (this.getPowerupStacks('DOUBLE_PULSE') > 0) {
        setTimeout(() => {
            this.novaRings.push({
                x: this.x,
                y: this.y,
                radius: 0,
                maxRadius: (config.ringRadius + shockwaveStacks * 40) * 0.7,
                damage: config.ringDamage * 0.6,
                duration: config.ringDuration,
                elapsed: 0,
                hitEnemies: new Set(),
                aftershock: false,
            });
        }, 300);
    }
}

export function fireLightning(config) {
    const conductorStacks = this.getPowerupStacks('CONDUCTOR');
    const teslaCoilStacks = this.getPowerupStacks('TESLA_COIL');

    // Always set the cooldown — TESLA_COIL just shortens it.
    this.powerCooldown = Math.max(2000, config.cooldown - teslaCoilStacks * 1500);
    this.powerCooldownMax = this.powerCooldown;

    this.lightningChains.push({
        originX: this.x,
        originY: this.y,
        angle: this.angle,
        maxChains: config.chainCount + conductorStacks,
        damage: config.chainDamage,
        falloff: config.chainFalloff,
        range: config.chainRange,
        amplifierStacks: this.getPowerupStacks('AMPLIFIER'),
        staticField: this.getPowerupStacks('STATIC_FIELD') > 0,
        timer: 500, // visual duration
        hitEnemies: [],
        resolved: false,
    });
}

export function fireMissiles(bulletPool, config) {
    const extraOrdnanceStacks = this.getPowerupStacks('EXTRA_ORDNANCE');
    const lockOnStacks = this.getPowerupStacks('LOCK_ON');
    const count = config.missileCount + extraOrdnanceStacks;

    for (let i = 0; i < count; i++) {
        const spreadAngle = this.angle + (i - (count - 1) / 2) * 0.3;
        this.activeMissiles.push({
            x: this.x,
            y: this.y,
            vel: {
                x: Math.cos(spreadAngle) * config.missileSpeed,
                y: Math.sin(spreadAngle) * config.missileSpeed,
            },
            damage: config.missileDamage,
            homingStrength: config.missileHomingStrength + lockOnStacks * 0.03,
            cluster: this.getPowerupStacks('CLUSTER_WARHEAD') > 0,
            life: 3000,
            radius: 5,
            target: null,
            active: true,
        });
    }

    const quickReloadStacks = this.getPowerupStacks('QUICK_RELOAD');
    // Always set the cooldown — QUICK_RELOAD just shortens it.
    this.powerCooldown = Math.max(3000, config.cooldown - quickReloadStacks * 2000);
    this.powerCooldownMax = this.powerCooldown;
}

// ── Charge pause / resume ──────────────────────────────────────────────────

export function pauseChargeShot() {
    if (this.isCharging && !this.chargePaused) {
        // Store accumulated charge time before pausing
        this.pausedChargeTime += Date.now() - this.chargeStartTime;
        this.chargePaused = true;
    }
}

export function resumeChargeShot() {
    if (this.chargePaused) {
        // Resume charging from where we left off
        this.chargeStartTime = Date.now();
        this.chargePaused = false;
        // pausedChargeTime keeps the accumulated time
    }
}

// ── Charging particle effects ──────────────────────────────────────────────

export function createChargingParticleEffects(particlePool, currentChargeTime, maxChargeTime) {
    // Charging particle effects disabled to save resources
    // Method kept for compatibility but does nothing
    return;

    /* DISABLED - Resource intensive charging effects
    if (!particlePool) return;

    const chargeProgress = Math.min(1, currentChargeTime / maxChargeTime);
    const isBasicCharged = currentChargeTime >= this.minChargeTime;

    // ORIGINAL player particle effects - more intense as charge builds
    const spawnChance = isBasicCharged ? 0.8 : 0.4; // Higher spawn rate when charged

    if (Math.random() < spawnChance) {
        const particleCount = isBasicCharged ? (4 + Math.random() * 6) : (2 + Math.random() * 3); // 4-10 or 2-5 particles

        for (let i = 0; i < particleCount; i++) {
            // Spawn particles around the player that get drawn in
            const angle = Math.random() * Math.PI * 2;
            const distance = (80 + Math.random() * 120) * (1 + chargeProgress * 0.5); // 80-200 pixels away, further when more charged
            const startX = this.x + Math.cos(angle) * distance;
            const startY = this.y + Math.sin(angle) * distance;

            // Create particle that moves toward player
            const particle = particlePool.get(startX, startY, 'spawnParticle', this.x, this.y, this);
            if (particle) {
                if (this.isFullyCharged) {
                    // Fully charged - brilliant white/cyan energy
                    if (Math.random() < 0.4) {
                        particle.color = '#FFFFFF'; // Pure white sparkles
                    } else {
                        const hue = 180 + Math.random() * 20; // Cyan to light blue
                        const lightness = 70 + Math.random() * 30; // 70-100% lightness
                        particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
                    }
                    particle.radius = 3 + Math.random() * 4; // Large, dramatic particles
                } else if (isBasicCharged) {
                    // Basic charged - cyan energy
                    const hue = 180 + Math.random() * 30; // Cyan to blue range
                    const lightness = 60 + Math.random() * 30; // 60-90% lightness
                    particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
                    particle.radius = 2 + Math.random() * 3; // Medium particles

                    // Some white sparkles
                    if (Math.random() < 0.2) {
                        particle.color = '#FFFFFF';
                        particle.radius *= 1.2;
                    }
                } else {
                    // Charging - blue energy
                    const hue = 200 + Math.random() * 40; // Blue range
                    const lightness = 50 + Math.random() * 30; // 50-80% lightness
                    particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
                    particle.radius = 1.5 + Math.random() * 2; // Smaller particles
                }
            }
        }
    }

    // ADDITIONAL Drifter-style charge animation ON TOP of existing effects
    if (Math.random() < 0.6) { // Frequent particle spawning like Drifter
        const drifterParticleCount = 3 + Math.random() * 4; // 3-7 particles

        for (let i = 0; i < drifterParticleCount; i++) {
            // Spawn particles around the player that get drawn in (Drifter style)
            const angle = Math.random() * Math.PI * 2;
            const distance = 60 + Math.random() * 80; // 60-140 pixels away
            const startX = this.x + Math.cos(angle) * distance;
            const startY = this.y + Math.sin(angle) * distance;

            // Create particle that moves toward player (Drifter style)
            const particle = particlePool.get(startX, startY, 'spawnParticle', this.x, this.y, this);
            if (particle) {
                // Red/orange energy colors for laser charging (Drifter colors)
                const hue = 0 + Math.random() * 30; // Red to orange range
                const lightness = 60 + Math.random() * 30; // 60-90% lightness
                particle.color = `hsl(${hue}, 100%, ${lightness}%)`;
                particle.radius = 2 + Math.random() * 3; // Larger charging particles

                // Add some white sparkles (Drifter style)
                if (Math.random() < 0.2) {
                    particle.color = '#FFFFFF';
                    particle.radius *= 1.2;
                }
            }
        }
    }
    */
}

// ── Hit streak combo system ────────────────────────────────────────────────

export function startNewShot(bulletCount = 1) {
    this.shotFired = true;
    this.currentShotHits = 0;
    this.activeShotBullets = bulletCount;
}

export function registerHit() {
    if (this.shotFired) {
        this.currentShotHits++;
    }
}

export function onBulletDestroyed() {
    if (this.shotFired) {
        this.activeShotBullets--;
        if (this.activeShotBullets <= 0) {
            this.finalizeShotResult();
        }
    }
}

export function finalizeShotResult() {
    if (this.shotFired) {
        if (this.currentShotHits > 0) {
            // At least one hit - continue or increase streak
            this.hitStreak++;
        } else {
            // No hits - reset streak
            this.hitStreak = 0;
        }
        this.shotFired = false;
        this.currentShotHits = 0;
        this.activeShotBullets = 0;
    }
}

export function getHitStreakMultiplier() {
    // Higher streak = more orb drops
    if (this.hitStreak < 5) return 1;
    if (this.hitStreak < 10) return 1.5;
    if (this.hitStreak < 20) return 2;
    if (this.hitStreak < 50) return 3;
    return 4; // Max multiplier for very high streaks
}

// ── Charged shot firing ────────────────────────────────────────────────────

export function fireChargedShot(bulletPool, audioManager) {
    const rawChargeTime = (Date.now() - this.chargeStartTime) + this.pausedChargeTime;

    // Apply charge speed upgrades
    const chargeSpeedStacks = this.getPowerupStacks('CHARGE_SPEED');
    const reducedMaxChargeTime = Math.max(1000, this.maxChargeTime - (chargeSpeedStacks * 1000));

    // Clamp charge time to the configured maximum so holding past full charge
    // does not keep amplifying size/speed/damage/crit.
    const chargeTime = Math.min(rawChargeTime, reducedMaxChargeTime);

    // Calculate multipliers directly proportional to milliseconds charged
    // Scale from 0ms to maxChargeTime (5000ms default, reduced by upgrades)
    const chargeRatio = Math.min(1, chargeTime / reducedMaxChargeTime);

    // Get charge damage upgrade stacks
    const chargeDamageStacks = this.getPowerupStacks('CHARGE_POWER');

    // Power-weapon balance pass: charge shot was the worst offender at ~7
    // base + 6 from upgrades = one-shotting most enemies. Halved the damage
    // scaling, kept the visual scaling for game-feel.
    const baseDamage = 1 + chargeDamageStacks * 0.5;          // +0.5/stack (was +1)
    const sizeMultiplier = 1 + (chargeTime / 1000) * 0.4;     // unchanged — visual feel
    const speedMultiplier = 1 + (chargeTime / 1000) * 0.2;    // unchanged
    const damageBonus = (chargeTime / 1000) * 0.6;            // +0.6/sec (was +1.2) → ~3 at 5s
    const totalDamage = baseDamage + damageBonus;
    const critChanceBonus = (chargeTime / 1000) * 0.04;       // +4%/sec (was +8%), max 20% at 5s

    // Calculate charge-based homing strength (base homing from charge time)
    const baseHomingStrength = Math.min(0.15, (chargeTime / 1000) * 0.03); // +0.03 per second, max 0.15 at 5s

    // Create charged bullet
    this.createChargedBullets(bulletPool, sizeMultiplier, speedMultiplier, totalDamage, critChanceBonus, baseHomingStrength);

    // Play shoot sound
    audioManager.playShoot();

    // Heavy muzzle flare for charged shot
    spawnMuzzleFlare.call(this, null, 'heavy', '#ffcc44');
}

// ── Bullet creation ────────────────────────────────────────────────────────

export function fireWeapons(bulletPool, audioManager) {
    // Fire bullets based on powerups (no cooldown needed since auto-fire handles timing)
    this.createBullets(bulletPool);

    // Play shoot sound synchronized with every shot
    audioManager.playShoot();
}

export function createBullets(bulletPool) {
    const multiShotStacks = this.getPowerupStacks('MULTI_SHOT');
    const homingStacks = this.getPowerupStacks('HOMING');
    const bigBulletStacks = this.getPowerupStacks('BIG_BULLETS');
    const piercingStacks = this.getPowerupStacks('PIERCING');
    const explosiveStacks = this.getPowerupStacks('EXPLOSIVE');

    // +1 bullet per multi-shot stack, spread evenly in a fan
    const bulletCount = 1 + multiShotStacks;

    // Spread scales with bullet count: gentle fan that widens per stack
    const spreadAngle = bulletCount > 1 ? Math.min(0.8, 0.12 * (bulletCount - 1)) : 0;

    // Fire bullets
    for (let i = 0; i < bulletCount; i++) {
        let angle = this.angle;

        // Apply spread for multiple bullets
        if (bulletCount > 1) {
            const angleOffset = (i - (bulletCount - 1) / 2) * (spreadAngle / Math.max(1, bulletCount - 1));
            angle += angleOffset;
        }

        const bullet = bulletPool.get(this.x, this.y, angle);
        if (bullet) {
            // Apply range multiplier
            bullet.rangeMultiplier = this.getRangeMultiplier();

            // Calculate critical hit
            const critChance = this.getEffectiveCritChance();
            const isCritical = Math.random() * 100 < critChance;

            if (isCritical) {
                const critDamage = this.getEffectiveCritDamage();
                bullet.damage = (bullet.damage || 20) * (critDamage / 100);
                bullet.isCritical = true;
                bullet.color = '#FFD700';
            } else {
                bullet.damage = bullet.damage || 20;
                bullet.isCritical = false;
            }

            // Apply homing effects to bullet - for regular shots, only use upgrade homing (no charge-based homing)
            const upgradeHomingStrength = homingStacks > 0 ? Math.min(0.25, homingStacks * 0.08) : 0;

            if (upgradeHomingStrength > 0) {
                bullet.homing = true;
                bullet.homingStrength = upgradeHomingStrength;
            }
            if (bigBulletStacks > 0) {
                bullet.radius += BIG_BULLETS_PX_PER_STACK * bigBulletStacks;
                bullet.baseRadius = bullet.radius; // Update base for shrink calc
            }
            if (piercingStacks > 0) {
                bullet.piercing = piercingStacks;
            }
            if (explosiveStacks > 0) {
                bullet.explosive = true;
                bullet.explosionRadius = 30 + explosiveStacks * 10;
            }
        }
    }
}

export function createChargedBullets(bulletPool, sizeMultiplier = 1, speedMultiplier = 1, totalDamage = 20, critChanceBonus = 0, baseHomingStrength = 0, rangeOverride = 1) {
    const multiShotStacks = this.getPowerupStacks('MULTI_SHOT');
    const homingStacks = this.getPowerupStacks('HOMING');
    const bigBulletStacks = this.getPowerupStacks('BIG_BULLETS');
    const piercingStacks = this.getPowerupStacks('PIERCING');
    const explosiveStacks = this.getPowerupStacks('EXPLOSIVE');

    // +1 bullet per multi-shot stack, spread evenly in a fan
    const bulletCount = 1 + multiShotStacks;

    // Spread scales with bullet count: gentle fan that widens per stack
    const spreadAngle = bulletCount > 1 ? Math.min(0.8, 0.12 * (bulletCount - 1)) : 0;

    // Start tracking hits for this shot
    this.startNewShot(bulletCount);

    // Fire bullets
    for (let i = 0; i < bulletCount; i++) {
        let angle = this.angle;

        // Apply spread for multiple bullets
        if (bulletCount > 1) {
            const angleOffset = (i - (bulletCount - 1) / 2) * (spreadAngle / Math.max(1, bulletCount - 1));
            angle += angleOffset;
        }

        const bullet = bulletPool.get(this.x, this.y, angle);
        if (bullet) {
            // Tag with the active weapon ID so the collision handler can
            // play the per-weapon hit SFX (audio-manager.js).
            bullet.weaponId = this.activePrimary;

            // Apply range multiplier (charged shots get modest bonus range).
            // `rangeOverride` lets the caller bake in the active weapon's
            // `config.range` so Pulse Cannon now behaves like the other
            // primaries (Storm Needles, Scatter Gun, etc.) — it used to
            // ignore config.range entirely. Charge Shot still defaults
            // rangeOverride = 1 so its existing behavior is preserved.
            bullet.rangeMultiplier = this.getRangeMultiplier() * rangeOverride * Math.max(1, speedMultiplier * 0.5);
            bullet.maxLife = Math.round(bullet.maxLife * rangeOverride);

            // Set up callback for when bullet is destroyed (for combo tracking)
            bullet.onOffScreen = () => this.onBulletDestroyed();

            // Apply charge scaling to bullet speed
            bullet.vel.x *= speedMultiplier;
            bullet.vel.y *= speedMultiplier;

            // Apply charge scaling to bullet size
            bullet.radius *= sizeMultiplier;
            bullet.baseRadius = bullet.radius;

            // Calculate critical hit with charge bonus
            const baseCritChance = this.getEffectiveCritChance();
            const totalCritChance = baseCritChance + (critChanceBonus * 100);
            const isCritical = Math.random() * 100 < totalCritChance;

            if (isCritical) {
                const critDamage = this.getEffectiveCritDamage();
                bullet.damage = totalDamage * (critDamage / 100); // Apply crit multiplier to total damage
                bullet.isCritical = true;
                bullet.color = '#FFD700'; // Gold color for critical hits
            } else {
                bullet.damage = totalDamage; // Use calculated total damage directly
                bullet.isCritical = false;
            }

            // Apply homing effects — unified formula matches
            // applyGlobalBulletUpgrades so charged shots and the
            // primary's own bullets feel the same per stack of HOMING.
            // Charge-base homing (baseHomingStrength) is still added
            // because it's a separate "charge level" mechanic.
            const upgradeHomingStrength = homingStacks > 0 ? Math.min(0.4, homingStacks * 0.06) : 0;
            const totalHomingStrength = baseHomingStrength + upgradeHomingStrength;

            if (totalHomingStrength > 0) {
                bullet.homing = true;
                bullet.homingStrength = Math.min(0.4, totalHomingStrength);
            }
            if (bigBulletStacks > 0) {
                bullet.radius += BIG_BULLETS_PX_PER_STACK * bigBulletStacks;
                bullet.baseRadius = bullet.radius;
            }
            if (piercingStacks > 0) {
                // Additive with weapon's built-in piercing — matches
                // applyGlobalBulletUpgrades. Charged Pulse Cannon shots
                // pick up PIERCING stacks the same way as Rail Driver does.
                bullet.piercing = (bullet.piercing || 0) + piercingStacks;
            }
            if (explosiveStacks > 0) {
                bullet.explosive = true;
                bullet.explosionRadius = 30 + explosiveStacks * 10;
            }

            // Visual effects for charged shots
            if (sizeMultiplier > 1.5) {
                bullet.color = '#00FFFF'; // Cyan for highly charged shots
            } else if (sizeMultiplier > 1.2) {
                bullet.color = '#FFFFFF'; // White for charged shots
            }
        }
    }
}

// ── Fire rate / damage / cooldown queries ──────────────────────────────────

export function getEffectivePrimaryFireRate() {
    const config = this.getActivePrimaryConfig();
    let rate = config.fireRate;

    // Apply weapon-specific upgrades
    if (this.activePrimary === 'STORM_NEEDLES') {
        const stacks = this.getPowerupStacks('NEEDLE_STORM');
        rate *= Math.pow(0.85, stacks); // -15% per stack compounding
    }

    // Apply global Rapid Fire
    const rapidFireStacks = this.getPowerupStacks('RAPID_FIRE');
    rate *= Math.pow(0.85, rapidFireStacks);

    return Math.round(rate);
}

export function getEffectivePrimaryDamage() {
    const config = this.getActivePrimaryConfig();
    let damage = config.damage;

    if (this.activePrimary === 'PULSE_CANNON') {
        const stacks = this.getPowerupStacks('OVERCHARGE');
        damage *= (1 + stacks * 0.15);
    }

    return damage;
}

export function getPowerCooldownRemaining() {
    return Math.max(0, this.powerCooldown);
}

export function isPowerReady() {
    const config = this.getActivePowerConfig();
    if (config.isChargeBased) return true;
    return this.powerCooldown <= 0;
}

// ── Weapon config / equip / buy ────────────────────────────────────────────

export function getActivePrimaryConfig() {
    return PRIMARY_WEAPONS[this.activePrimary] || PRIMARY_WEAPONS.PULSE_CANNON;
}

export function getActivePowerConfig() {
    return POWER_WEAPONS[this.activePower] || POWER_WEAPONS.CHARGE_SHOT;
}

export function equipPrimary(weaponId) {
    if (this.ownedPrimaries.has(weaponId) && PRIMARY_WEAPONS[weaponId]) {
        this.activePrimary = weaponId;
        return true;
    }
    return false;
}

export function equipPower(weaponId) {
    if (this.ownedPowers.has(weaponId) && POWER_WEAPONS[weaponId]) {
        this.activePower = weaponId;
        this.powerCooldown = 0;
        // Reset charge state when switching away from charge shot
        this.isCharging = false;
        this.chargeLevel = 0;
        this.pausedChargeTime = 0;
        return true;
    }
    return false;
}

export function buyPrimary(weaponId) {
    if (PRIMARY_WEAPONS[weaponId] && !this.ownedPrimaries.has(weaponId)) {
        this.ownedPrimaries.add(weaponId);
        this.activePrimary = weaponId;
        return true;
    }
    return false;
}

export function buyPower(weaponId) {
    if (POWER_WEAPONS[weaponId] && !this.ownedPowers.has(weaponId)) {
        this.ownedPowers.add(weaponId);
        this.activePower = weaponId;
        this.powerCooldown = 0;
        this.isCharging = false;
        this.chargeLevel = 0;
        this.pausedChargeTime = 0;
        return true;
    }
    return false;
}
