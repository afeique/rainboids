// Player weapon system — extracted from Player class
// All functions are called with .call(this) so `this` refers to the Player instance.

import { GAME_CONFIG } from '../core/constants.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, PRIMARY_UPGRADES, clusterLaunchDistance, clusterLaunchVelocity, attunementElements } from '../combat/weapon-data.js';
import { resolveBulletElements } from '../combat/elements.js';
import { prismaticElement } from '../combat/passive-data.js';
import { autofireDiag } from '../autofire-diag.js';
import { isMobile } from '../platform/platform-detect.js';

// 5.97.0 — Mobile early-game damage ramp. With a stationary ship, no
// strafing room, and only a finger for aim, the first few waves are
// significantly harder on mobile than desktop — even the basic asteroid
// can soak the default 5 damage from Pulse Cannon for ~3 shots while
// the player is still learning the touch controls. This ramp multiplies
// primary damage on mobile so wave 1-2 enemies die in 1-2 shots and the
// boost decays back to 1× by wave 6. Desktop is unchanged.
//
//   Wave 1: 3.0×   Wave 4: 1.4×
//   Wave 2: 2.3×   Wave 5: 1.15×
//   Wave 3: 1.7×   Wave 6+: 1.0×
function getMobileEarlyDamageMultiplier(wave) {
    if (!isMobile()) return 1;
    const w = Math.max(1, wave | 0);
    if (w >= 6) return 1;
    // 3.0 → 1.0 across waves 1..6 with a gentle curve.
    const table = [3.0, 2.3, 1.7, 1.4, 1.15, 1.0];
    return table[w - 1] || 1;
}

// BIG_BULLETS uses an ADDITIVE pixel boost rather than a multiplicative
// scalar. With multiplication, weapons whose base bullets are tiny
// (Storm Needles at 0.5× base radius) barely showed any growth at low
// stacks, breaking the "this powerup makes bullets bigger" promise.
// Additive guarantees every weapon's bullet grows by the same Δpx per
// stack, so the visual feel is consistent across the roster.
const BIG_BULLETS_PX_PER_STACK = 2.2; // was 1.5 — chunkier per stack to match new rarity

// ── Per-weapon HOMING / PIERCING (Phase 2 — 2026-05-19) ────────────────────
// Global HOMING / PIERCING powerups removed; each weapon that
// semantically supports them now exposes its own per-weapon upgrade.
// These tables map `bullet.weaponId` → the per-weapon upgrade ID that
// applies. A missing entry means the weapon doesn't get the bonus
// (LANCE_BEAM has innate pierce; NOVA / MINE / ARC have neither).
// 6.28.0 — Per-weapon shared-trait id tables. Each maps a weaponId to
// the upgrade id that supplies that trait for that weapon. A missing
// entry → 0 stacks (weapon doesn't get the trait). Kinetic primaries
// (Pulse/Storm/Scatter/Rail) get all 8; Cluster gets Multi/Stun/Knock.
const _PER_WEAPON_HOMING_ID = {
    PULSE_CANNON: 'PULSE_HOMING',
    STORM_NEEDLES: 'NEEDLE_HOMING',
    SCATTER_GUN: 'SCATTER_HOMING',
    RAIL_DRIVER: 'RAIL_HOMING',
    CHARGE_SHOT: 'CHARGE_HOMING',
    SPLITTER: 'SPLITTER_HOMING',
    SPIN_CANNON: 'SPIN_HOMING',
};
const _PER_WEAPON_PIERCING_ID = {
    PULSE_CANNON: 'PULSE_PIERCING',
    STORM_NEEDLES: 'NEEDLE_PIERCING',
    SCATTER_GUN: 'SCATTER_PIERCING',
    RAIL_DRIVER: 'RAIL_PIERCING',
    CHARGE_SHOT: 'CHARGE_PIERCING',
    MISSILE_SALVO: 'MISSILE_PIERCING',
    BOOMERANG: 'BOOMERANG_PIERCING',
    SPIN_CANNON: 'SPIN_PIERCING',
};
const _PER_WEAPON_MULTI_ID = {
    PULSE_CANNON: 'PULSE_MULTI',
    STORM_NEEDLES: 'NEEDLE_MULTI',
    SCATTER_GUN: 'SCATTER_MULTI',
    RAIL_DRIVER: 'RAIL_MULTI',
    CLUSTER_LAUNCHER: 'CLUSTER_MULTI',
    SPLITTER: 'SPLITTER_MULTI',
    RICOCHET: 'RICOCHET_MULTI',
    BOOMERANG: 'BOOMERANG_MULTI',
    GRAVITY_LANCE: 'GRAVITY_MULTI',
};
const _PER_WEAPON_RAPID_ID = {
    PULSE_CANNON: 'PULSE_RAPID',
    STORM_NEEDLES: 'NEEDLE_RAPID',
    SCATTER_GUN: 'SCATTER_RAPID',
    RAIL_DRIVER: 'RAIL_RAPID',
    SPLITTER: 'SPLITTER_RAPID',
    RICOCHET: 'RICOCHET_RAPID',
    BOOMERANG: 'BOOMERANG_RAPID',
    SPIN_CANNON: 'SPIN_RAPID',
    FLAK_CANNON: 'FLAK_RAPID',
};
const _PER_WEAPON_BIG_ID = {
    PULSE_CANNON: 'PULSE_BIG',
    STORM_NEEDLES: 'NEEDLE_BIG',
    SCATTER_GUN: 'SCATTER_BIG',
    RAIL_DRIVER: 'RAIL_BIG',
    SPLITTER: 'SPLITTER_BIG',
    RICOCHET: 'RICOCHET_BIG',
    BOOMERANG: 'BOOMERANG_BIG',
    SPIN_CANNON: 'SPIN_BIG',
    FLAK_CANNON: 'FLAK_BIG',
    GRAVITY_LANCE: 'GRAVITY_BIG',
};
const _PER_WEAPON_EXPLODE_ID = {
    PULSE_CANNON: 'PULSE_EXPLODE',
    STORM_NEEDLES: 'NEEDLE_EXPLODE',
    SCATTER_GUN: 'SCATTER_EXPLODE',
    RAIL_DRIVER: 'RAIL_EXPLODE',
    RICOCHET: 'RICOCHET_EXPLODE',
    GRAVITY_LANCE: 'GRAVITY_EXPLODE',
};
const _PER_WEAPON_STUN_ID = {
    PULSE_CANNON: 'PULSE_STUN',
    STORM_NEEDLES: 'NEEDLE_STUN',
    SCATTER_GUN: 'SCATTER_STUN',
    RAIL_DRIVER: 'RAIL_STUN',
    CLUSTER_LAUNCHER: 'CLUSTER_STUN',
    SPLITTER: 'SPLITTER_STUN',
    RICOCHET: 'RICOCHET_STUN',
    BOOMERANG: 'BOOMERANG_STUN',
    SPIN_CANNON: 'SPIN_STUN',
    FLAK_CANNON: 'FLAK_STUN',
    GRAVITY_LANCE: 'GRAVITY_STUN',
};
const _PER_WEAPON_KNOCK_ID = {
    PULSE_CANNON: 'PULSE_KNOCK',
    STORM_NEEDLES: 'NEEDLE_KNOCK',
    SCATTER_GUN: 'SCATTER_KNOCK',
    RAIL_DRIVER: 'RAIL_KNOCK',
    CLUSTER_LAUNCHER: 'CLUSTER_KNOCK',
    SPLITTER: 'SPLITTER_KNOCK',
    RICOCHET: 'RICOCHET_KNOCK',
    BOOMERANG: 'BOOMERANG_KNOCK',
    SPIN_CANNON: 'SPIN_KNOCK',
    FLAK_CANNON: 'FLAK_KNOCK',
};

// Per-stack mechanic constants for the new shared traits.
const RAPID_FIRE_PER_STACK = 0.12;   // -12% fire-rate interval per stack (compounding)
const STUN_CHANCE_PER_STACK = 0.12;  // +12% chance to stun on hit
const KNOCK_CHANCE_PER_STACK = 0.15; // +15% chance to knock back on hit

function _perWeaponStacks(player, table, weaponId) {
    const id = table[weaponId];
    if (!id || !player.getPowerupStacks) return 0;
    return player.getPowerupStacks(id);
}

function _getPerWeaponHomingStacks(player, weaponId) {
    return _perWeaponStacks(player, _PER_WEAPON_HOMING_ID, weaponId);
}

function _getPerWeaponPiercingStacks(player, weaponId) {
    return _perWeaponStacks(player, _PER_WEAPON_PIERCING_ID, weaponId);
}

// Exported so cursor.js (and any other HUD prediction code) can sum
// per-weapon piercing without re-importing the lookup tables.
export function getPiercingStacksForWeapon(player, weaponId) {
    return _getPerWeaponPiercingStacks(player, weaponId);
}

// P6 — Purist passive: "shots pierce". Every primary shot gains +1 piercing
// (additive with weapon/powerup piercing), completing the keystone's second
// clause alongside its already-wired +40% damage / no-crit. Pure so it
// unit-tests without a full Player.
export function puristPierceBonus(player) {
    return (player && typeof player.hasPassive === 'function' && player.hasPassive('PURIST')) ? 1 : 0;
}
export function getHomingStacksForWeapon(player, weaponId) {
    return _getPerWeaponHomingStacks(player, weaponId);
}

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
    this.updateAbilityCooldowns(dt);

    // ── Primary weapon: fires while LEFT-CLICK is held, gated only by
    //    fire-rate now. Clips were removed — unlimited continuous fire,
    //    weapon distinction comes from fire rate / damage / spread alone.
    const effectiveFireRate = this.getEffectivePrimaryFireRate();
    const timeSinceLastShot = now - this.lastShotTime;
    const cooldownReady = timeSinceLastShot >= effectiveFireRate;
    const fireHeld = !!(input && input.fire);

    // 5.108.0 — Track sustained-fire hold time for MOMENTUM. Tick up
    // while the player holds primary fire; reset to 0 the moment they
    // release. applyGlobalBulletUpgrades reads this on the next shot.
    if (fireHeld) {
        this._fireHoldTime = (this._fireHoldTime || 0) + dt;
    } else {
        this._fireHoldTime = 0;
    }

    // ── Beam time-out — beams are now power weapons (5.79.23). The
    //   beam stays active for `beamMaxDuration` ms after activation,
    //   then auto-shuts off. Strike audio for the lightning arc is
    //   driven from this same tick while the beam is active.
    if (this.beamActive) {
        this.beamTimer -= dt;
        if (this.beamTimer <= 0) {
            this.beamActive = false;
            this.beamTimer = 0;
            if (audioManager.stopLoop) audioManager.stopLoop('laserBeamLoop');
        } else {
            // 6.55.0 — sweep the blade across an arc centered on the live
            // aim. The damage cone (collision-system) is centered on the
            // aim too; this swept angle drives the visual blade so it reads
            // as a beam carving back and forth through the area.
            const cfg = this.getActivePowerConfig();
            const arcHalf = (cfg && cfg.arcHalfAngle != null) ? cfg.arcHalfAngle : 0.7;
            const period = (cfg && cfg.sweepPeriodMs) ? cfg.sweepPeriodMs : 900;
            const elapsed = (this.beamMaxDuration || 3000) - this.beamTimer;
            const phase = (elapsed / period) * Math.PI * 2;
            this.beamSweepAngle = this.angle + Math.sin(phase) * arcHalf;
            this.beamAngle = this.beamSweepAngle; // keep legacy field in sync
        }
    }

    if (this.lightningArcActive) {
        this.lightningArcTimer = (this.lightningArcTimer || 0) - dt;
        if (this.lightningArcTimer <= 0) {
            this.lightningArcActive = false;
            this.lightningArcTimer = 0;
            if (audioManager.stopLoop) audioManager.stopLoop('arcLightningLoop');
            this._nextArcStrikeAt = 0;
        } else {
            const nowT = Date.now();
            if (!this._nextArcStrikeAt) this._nextArcStrikeAt = nowT + 350;
            if (nowT >= this._nextArcStrikeAt) {
                const hasTarget = !!(this.lightningArcTarget && this.lightningArcTarget.active);
                const strikeName = hasTarget
                    ? `arcHit${1 + ((Math.random() * 3) | 0)}`
                    : `arcStrike${1 + ((Math.random() * 4) | 0)}`;
                audioManager.playSound(strikeName);
                if (hasTarget) {
                    this._nextArcStrikeAt = nowT + 150 + Math.random() * 250;
                } else {
                    this._nextArcStrikeAt = nowT + 220 + Math.random() * 500;
                }
            }
        }
    }

    // Cluster Launcher is a hold-to-charge launcher (distance scales with
    // charge), so it's exempt from the rate-limited continuous-fire path
    // and handled by updateClusterCharge instead.
    const isClusterCharge = this.activePrimary === 'CLUSTER_LAUNCHER';
    // Clear any stale cluster wind-up when the launcher isn't equipped so a
    // weapon-swap mid-charge can't fire a phantom bomb later.
    if (!isClusterCharge && this._clusterCharging) {
        this._clusterCharging = false;
        this.clusterChargeFrac = 0;
        this._clusterFireWasHeld = false;
    }
    this.canShoot = !isClusterCharge && cooldownReady && fireHeld;
    const poolBefore = bulletPool.activeObjects.length;
    let bulletCreated = false;
    if (isClusterCharge) {
        updateClusterCharge.call(this, input, bulletPool, audioManager, particlePool, now);
    } else if (this.canShoot) {
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

    // ── Power weapon: unified energy-gated fire ──
    // The energy meter (it regenerates passively over time — see
    // player.update) is the only "charge" now. EVERY power weapon, including
    // CHARGE_SHOT, fires instantly when fire-power is pressed and enough
    // energy is banked; firing spends the energy. CHARGE_SHOT fires at a
    // fixed full-charge shot. Pacing comes from the meter refilling, not
    // from holding a charge button.
    // Skip power weapon updates while shop/pause is open.
    if (this.chargePaused) return;

    // Charge state now mirrors the energy meter; the renderer reads `energy`
    // directly for the body glow + nose ring, so the legacy hold-charge
    // flags are simply kept consistent (no wind-up animation anymore).
    const maxE = this.maxEnergy || 100;
    this.isCharging = false;
    this.tractorBeamActive = false;
    this.chargeLevel = Math.min(1, (this.energy || 0) / maxE);
    this.isFullyCharged = (this.energy || 0) >= maxE * 0.999;

    if (input.fireSecondary && this.isPowerReady()) {
        const powerConfig = this.getActivePowerConfig();
        if (powerConfig.isChargeBased) {
            // CHARGE_SHOT — spend energy, then fire at a fixed full charge.
            // P6 — Twin Cast: +30% energy cost (applied before Resonance so a
            // free shot still wins). CHARGE_SHOT does not double-fire (charge
            // mechanics) — noted as a Twin Cast follow-up.
            let _chargeCost = this.getPowerEnergyCost();
            if (typeof this.hasPassive === 'function' && this.hasPassive('TWIN_CAST')) {
                _chargeCost = twinCastEnergyCost(_chargeCost, true);
            }
            // P6 — Resonance: every 3rd power use is free (no deduction).
            if (typeof this.hasPassive === 'function' && this.hasPassive('RESONANCE')) {
                const _r = resonanceStep(this._resonanceUses);
                this._resonanceUses = _r.count;
                if (_r.free) _chargeCost = 0;
            }
            this.energy = Math.max(0, (this.energy || 0) - _chargeCost);
            this.chargeStartTime = now - this.maxChargeTime; // force a full-charge shot
            this.pausedChargeTime = 0;
            this.fireChargedShot(bulletPool, audioManager);
            // Short anti-spam floor so a held button can't dump the whole
            // meter in consecutive frames; the energy cost is the real gate.
            this.powerCooldown = 400;
            this.powerCooldownMax = 400;
        } else {
            // Cooldown-based powers deduct energy + set their own cooldown
            // inside firePower / the per-weapon fire fns.
            this.firePower(bulletPool, audioManager, particlePool);
        }
        input.fireSecondary = false;
    }
}

// ── Cluster Launcher: hold-to-charge launch distance ───────────────────────
// Holding fire winds up the launch — the longer the hold, the farther the
// bomb flies (up to the screen edge); a quick tap lobs it a very short
// distance. The wind-up + a post-fire cooldown drastically lower the fire
// rate vs a normal primary. Fires on release, OR auto-launches once fully
// charged (so a held max-range shot doesn't stall, and the mobile autoFire
// assist — which never "releases" — still launches).
const CLUSTER_CHARGE_MS = 1200;   // hold time to reach full range
const CLUSTER_COOLDOWN_MS = 700;  // post-fire lockout

export function updateClusterCharge(input, bulletPool, audioManager, particlePool, now) {
    const fireHeld = !!(input && input.fire);
    const cooldownReady = (now - (this.lastShotTime || 0)) >= CLUSTER_COOLDOWN_MS;

    // Wind up while held, once the post-fire cooldown has elapsed.
    if (fireHeld && cooldownReady) {
        if (!this._clusterCharging) {
            this._clusterCharging = true;
            this._clusterChargeStart = now;
        }
        this.clusterChargeFrac = Math.min(1, (now - this._clusterChargeStart) / CLUSTER_CHARGE_MS);
    } else if (!fireHeld && !this._clusterCharging) {
        this.clusterChargeFrac = 0;
    }

    const released = this._clusterFireWasHeld && !fireHeld;
    const maxedWhileHeld = this._clusterCharging && (this.clusterChargeFrac || 0) >= 1;
    if (this._clusterCharging && (released || maxedWhileHeld)) {
        const frac = this.clusterChargeFrac || 0;
        try {
            fireCluster.call(this, bulletPool, audioManager, this.getActivePrimaryConfig(), frac);
            spawnMuzzleFlare.call(this, particlePool, 'heavy', '#ffaa44');
        } catch (e) {
            console.error('[FIRE] fireCluster threw:', e.message, e.stack);
        }
        this.lastShotTime = now;
        this.lastPrimaryFireTime = now;
        this._clusterCharging = false;
        this.clusterChargeFrac = 0;
    }

    this._clusterFireWasHeld = fireHeld;
}

// ── Primary weapon dispatch ────────────────────────────────────────────────

export function firePrimary(bulletPool, audioManager, particlePool) {
    // 5.76.2 — soft-cap with eviction (was: refuse spawn). When the
    // pool is at the 300 cap (which Twin Cannon + Multi-Shot 4 +
    // Cone-of-Fire builds reach during boss pressure), evict the
    // oldest non-piercing bullet to make room rather than silently
    // dropping the shot. Piercing bullets are kept because they're
    // still useful — they tend to be the high-value rail / capstone
    // shots and have longer effective uptime.
    if (bulletPool.activeObjects.length >= 300) {
        const evicted = bulletPool.softCapAndEvict(300, (b) => !b.piercing || b.piercing <= 0);
        if (!evicted) return false; // pool entirely piercing — let the cap hold
    }

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
        case 'CLUSTER_LAUNCHER':
            this.fireCluster(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'heavy', '#ffaa44');
            break;
        case 'SPLITTER':
            this.fireSplitter(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'medium', '#88ccff');
            break;
        case 'RICOCHET':
            this.fireRicochet(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'medium', '#88ccff');
            break;
        case 'BOOMERANG':
            this.fireBoomerang(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'medium', '#ffaa44');
            break;
        case 'SPIN_CANNON':
            this.fireSpinCannon(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'light', '#ffaa44');
            break;
        case 'FLAK_CANNON':
            this.fireFlak(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'heavy', '#ffaa44');
            break;
        case 'GRAVITY_LANCE':
            this.fireGravityLance(bulletPool, audioManager, config);
            spawnMuzzleFlare.call(this, particlePool, 'medium', '#ffdd88');
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
    const colorMap = { '#ffdd88': '255, 220, 140', '#88ccff': '140, 200, 255', '#ffaa44': '255, 170, 70', '#ffcc44': '255, 200, 70', '#44ffaa': '70, 255, 170', '#aa88ff': '170, 136, 255' };
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
    let damage = this.getEffectivePrimaryDamage();
    // 5.111.0 — DEAD_EYE replaces the old STEADY_AIM spread reducer.
    // +10% damage per stack + a small crit-chance bump (3% per stack)
    // routed through createChargedBullets' `critChanceBonus` parameter.
    // Pulse Cannon's identity is "precision" — these reinforce that
    // without leaning on spread (Pulse Cannon already has 0 spread).
    const deadEyeStacks = this.getPowerupStacks('DEAD_EYE');
    if (deadEyeStacks > 0) {
        damage *= 1 + deadEyeStacks * 0.1;
    }
    const deadEyeCritFrac = deadEyeStacks * 0.03; // 0.03 = +3% per stack
    const echoStacks = this.getPowerupStacks('ECHO_ROUND');
    // Pass config.range so Pulse Cannon's reach is governed by
    // weapon-data.js like every other primary.
    this.createChargedBullets(bulletPool, 1, 1, damage, deadEyeCritFrac, 0, config.range);
    audioManager.playShoot();

    // Echo Round: chance to fire a bonus bullet
    if (echoStacks > 0 && Math.random() < echoStacks * 0.1) {
        this.createChargedBullets(bulletPool, 0.8, 1, damage * 0.7, deadEyeCritFrac, 0, config.range);
    }

    // 5.75.1 — TWIN_CANNON capstone: fires two additional bullets at ±8°
    // angle offsets at half damage. Triples Pulse Cannon's burst output
    // for the cost of a wider effective spread. Implemented by briefly
    // patching `this.angle` while calling createChargedBullets so the
    // spawned bullets pick up the offset; restored before exit.
    if (this.getPowerupStacks('TWIN_CANNON') > 0) {
        const off = 8 * Math.PI / 180;
        const baseAngle = this.angle;
        this.angle = baseAngle + off;
        this.createChargedBullets(bulletPool, 1, 1, damage * 0.5, 0, 0, config.range);
        this.angle = baseAngle - off;
        this.createChargedBullets(bulletPool, 1, 1, damage * 0.5, 0, 0, config.range);
        this.angle = baseAngle;
    }
}

export function fireStormNeedles(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const spreadAngle = config.spreadAngle;
    // 5.113.1 — Reverted to single-needle-per-shot. The "cone of fire"
    // is the RANDOMIZED jitter on each shot, not a fan. MULTI_SHOT
    // and HAILSTORM still stack additional needles into the cone (so
    // the powerup paths still grow the per-shot density), but the
    // base weapon is one jittered needle.
    const multiShotStacks = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, 'STORM_NEEDLES');
    const hailstormBonus = this.getPowerupStacks('HAILSTORM') > 0 ? 1 : 0;
    const bulletCount = 1 + multiShotStacks + hailstormBonus;
    const fanSpread = bulletCount > 1 ? Math.min(0.5, 0.10 * (bulletCount - 1)) : 0;

    for (let i = 0; i < bulletCount; i++) {
        this.needleCount++;
        const fanOffset = bulletCount > 1
            ? (i - (bulletCount - 1) / 2) * (fanSpread / Math.max(1, bulletCount - 1))
            : 0;
        // Per-shot jitter across the full spreadAngle so the needle's
        // exact angle varies shot-to-shot — visible "cone of fire" feel
        // on the laser-pointer aim (see hud/cursor.js).
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
            // 5.75.1 — HAILSTORM grants +1 piercing to every needle.
            if (this.getPowerupStacks('HAILSTORM') > 0) {
                bullet.piercing = (bullet.piercing || 0) + 1;
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
    let damage = this.getEffectivePrimaryDamage();
    // 5.111.0 — HEAVY_LOAD replaces the old TIGHT_CHOKE spread reducer.
    // +15% per stack to every pellet's damage. Pairs with the now-
    // tighter base spread (0.4) and longer range (1.2) — Scatter Shot
    // becomes a credible mid-range pick instead of point-blank-only.
    const heavyLoadStacks = this.getPowerupStacks('HEAVY_LOAD');
    if (heavyLoadStacks > 0) {
        damage *= 1 + heavyLoadStacks * 0.15;
    }
    const buckshotStacks = this.getPowerupStacks('BUCKSHOT');
    // 6.28.0 — per-weapon Scatter multishot adds +1 pellet per stack.
    const multiShotStacks = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, 'SCATTER_GUN');
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
        // 5.75.1 — CONE_OF_FIRE capstone: +2 pellets per shot, every
        // pellet pierces 1 enemy. Saturating sweep.
        const coneFireBonus = this.getPowerupStacks('CONE_OF_FIRE') > 0 ? 2 : 0;
        const pelletCount = config.bulletCount + buckshotStacks + multiShotStacks + coneFireBonus;
        // 5.111.0 — TIGHT_CHOKE removed. Spread is the weapon's baked
        // identity now (0.4 in weapon-data.js). No per-stack reducer.
        const spread = config.spreadAngle;
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
                // 5.75.1 — CONE_OF_FIRE: every pellet pierces +1.
                if (this.getPowerupStacks('CONE_OF_FIRE') > 0) {
                    bullet.piercing = (bullet.piercing || 0) + 1;
                }
                this.applyGlobalBulletUpgrades(bullet);
            }
        }
    }
    audioManager.playShoot();
}

export function fireRailDriver(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    // 5.110.0 — PENETRATOR retired; replaced by MASS_DRIVER which
    // grants +25% damage AND +20% knockback per stack instead of the
    // old +50% range/stack. Range path is gone entirely.
    const massDriverStacks = this.getPowerupStacks('MASS_DRIVER');
    const massDriverDamage = 1 + massDriverStacks * 0.25;
    const massDriverKnockback = massDriverStacks * 0.20;
    const capacitorStacks = this.getPowerupStacks('RAILGUN_CAPACITOR');
    // Rail Driver fires a helix pair — two bullets spiraling around each
    // other on a shared rail. MULTI_SHOT adds extra pairs, fanned narrowly
    // because rails travel far and a wide fan reads as chaotic.
    const multiShotStacks = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, 'RAIL_DRIVER');
    const pairCount = 1 + multiShotStacks;
    const pairFan = pairCount > 1 ? Math.min(0.3, 0.06 * (pairCount - 1)) : 0;

    let finalDamage = damage * massDriverDamage;
    if (capacitorStacks > 0) {
        const idleTime = Date.now() - this.lastPrimaryFireTime;
        if (idleTime > 2000) {
            finalDamage *= 2;
        }
    }

    // Helix tuning. amp = lateral peak offset (px), freq = radians per
    // logic-tick. Two bullets per pair, phase-offset by π so they sit on
    // opposite sides of the rail axis at all times — visible double helix.
    const HELIX_AMP = 9;
    const HELIX_FREQ = 0.42;

    for (let i = 0; i < pairCount; i++) {
        const pairOffset = pairCount > 1
            ? (i - (pairCount - 1) / 2) * (pairFan / Math.max(1, pairCount - 1))
            : 0;
        const pairAngle = this.angle + pairOffset;

        for (let strand = 0; strand < 2; strand++) {
            const bullet = bulletPool.get(this.x, this.y, pairAngle);
            if (!bullet) continue;
            bullet.damage = finalDamage;
            bullet.radius *= config.bulletSize;
            bullet.baseRadius = bullet.radius;
            bullet.piercing = config.piercing;
            bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
            bullet.maxLife = Math.round(bullet.maxLife * config.range);
            bullet.color = config.color;

            // 5.110.0 — Knockback now layers MASS_DRIVER on top of
            // KINETIC_IMPACT's flat trigger. KINETIC_IMPACT is the
            // single-stack on/off knockback flag (8 px impulse);
            // MASS_DRIVER adds +20% per stack on top, capped naturally
            // by the player's knockback multiplier downstream.
            if (this.getPowerupStacks('KINETIC_IMPACT') > 0) {
                bullet.knockback = 8 * (1 + massDriverKnockback);
            } else if (massDriverKnockback > 0) {
                // Even without KINETIC_IMPACT, MASS_DRIVER stacks give
                // some knockback so the upgrade reads as kinetic.
                bullet.knockback = 4 * massDriverKnockback;
            }
            if (this.getPowerupStacks('THROUGH_AND_THROUGH') > 0) bullet.damageTrail = true;
            // 5.75.1 — RAIL_PENETRATOR_PLUS capstone: effectively unlimited
            // piercing (99). Decaying-damage-per-hit is hard to thread
            // through the existing `piercing` count without rewriting
            // the bullet hit accounting; the saturating pierce alone is
            // already a major DPS lift on dense waves.
            if (this.getPowerupStacks('RAIL_PENETRATOR_PLUS') > 0) {
                bullet.piercing = 99;
            }

            // Apply weapon-config speed scaling on top of pool defaults.
            const speed = Math.hypot(bullet.vel.x, bullet.vel.y);
            bullet.vel.x = (bullet.vel.x / speed) * speed * config.bulletSpeed;
            bullet.vel.y = (bullet.vel.y / speed) * speed * config.bulletSpeed;

            // Helix: paired bullets oscillate perpendicular to their rail
            // axis with opposite phases, so they cross over each other
            // every half period.
            bullet.helixActive = true;
            bullet.helixAmplitude = HELIX_AMP;
            bullet.helixFreq = HELIX_FREQ;
            bullet.helixPhase = strand === 0 ? 0 : Math.PI;

            this.applyGlobalBulletUpgrades(bullet);
        }
    }
    audioManager.playShoot();
}

// Phase 6 (2026-05-19) — Cluster Launcher firing path. Spawns a ClusterBomb
// (Bullet with cluster=true) at the player position aimed at the cursor.
// The bomb owns its own travel→armed→detonate state machine in
// `Bullet.updateClusterStage`; this function only resolves upgrades and
// initializes the bomb. Intentionally does NOT call
// `applyGlobalBulletUpgrades` — cluster bombs are exempt from
// per-weapon HOMING / PIERCING (no CLUSTER_HOMING / CLUSTER_PIERCING
// upgrades exist) AND from the global EXPLOSIVE check, because the
// bomb's detonation is itself the AoE payload.
export function fireCluster(bulletPool, audioManager, config, chargeFrac = 1) {
    // Resolve per-weapon upgrade stacks. CLUSTER_PAYLOAD scales damage,
    // MORE_BOMBLETS adds sub-bombs, SHORT_FUSE reduces the armed timer,
    // MEGA_CLUSTER bumps the primary blast radius.
    const payloadStacks  = this.getPowerupStacks('CLUSTER_PAYLOAD');
    const bombletStacks  = this.getPowerupStacks('MORE_BOMBLETS');
    const shortFuseStacks = this.getPowerupStacks('SHORT_FUSE');
    const megaClusterStacks = this.getPowerupStacks('MEGA_CLUSTER');

    // Bake upgrade adjustments into a per-shot config snapshot so the
    // bullet doesn't re-read globals during its update loop.
    const armedDurationMs = Math.max(
        100,
        config.armedDurationMs - shortFuseStacks * 300,
    );
    const blastRadius = config.blastRadius + megaClusterStacks * 30;
    const blastDamage = config.blastDamage * (1 + payloadStacks * 0.2);
    const subBombCount = config.subBombCount + bombletStacks;

    const bullet = bulletPool.get(this.x, this.y, this.angle);
    if (!bullet) return;
    bullet.weaponId = 'CLUSTER_LAUNCHER';

    // Charge → launch DISTANCE (how far it lands), shared with the laser
    // sight so the on-screen aim length honestly previews the detonation
    // point. The MUZZLE VELOCITY is then derived from that distance so the
    // bomb launches fast and DECELERATES under friction, arriving at the
    // target at ~haltVelocity (a lobbed-mortar feel). A quick tap lands close
    // and launches gently; a full charge lands far and launches hard. The
    // bomb still detonates early on contact.
    const ge = this.gameEngine;
    const viewW = (ge && ge.width) || 1280;
    const viewH = (ge && ge.height) || 720;
    const frac = Math.max(0, Math.min(1, chargeFrac));
    const targetDist = clusterLaunchDistance(config, frac, viewW, viewH);
    const launchVelocity = clusterLaunchVelocity(config, targetDist);

    bullet.setupClusterBomb({
        initialVelocity: launchVelocity,
        travelFriction: config.travelFriction,
        haltVelocity: config.haltVelocity,
        armedDurationMs,
        proximityRadius: config.proximityRadius,
        blastRadius,
        blastDamage,
        subBombCount,
        subBombSpeed: config.subBombSpeed,
        subBombFriction: config.subBombFriction,
        subBombLifeFrames: config.subBombLifeFrames,
        subBombBlastRadius: config.subBombBlastRadius,
        subBombDamage: config.subBombDamage,
        targetDist,
    });

    // Speedrun-meta stats parity with other primary weapons.
    const stats = this.gameEngine && this.gameEngine.game && this.gameEngine.game.stats;
    if (stats) {
        stats.shotsFired++;
        stats.weaponShots.CLUSTER_LAUNCHER = (stats.weaponShots.CLUSTER_LAUNCHER || 0) + 1;
    }

    audioManager.playShoot();
}

// ── New primaries (brainstorm drop) ────────────────────────────────────────

// Shared fan helper: returns the per-bullet angle offset for index i of n,
// fanned across `spread` radians (0 when n === 1).
function _fanOffset(i, n, spread) {
    if (n <= 1) return 0;
    return (i - (n - 1) / 2) * (spread / (n - 1));
}

export function fireSplitter(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const multi = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, 'SPLITTER');
    const count = config.bulletCount + multi;
    const spread = count > 1 ? Math.min(0.35, 0.09 * (count - 1)) : 0;
    const splitCount = config.splitCount + this.getPowerupStacks('SPLIT_CELLS');
    const generations = config.splitGenerations + (this.getPowerupStacks('MEIOSIS') > 0 ? 1 : 0);
    for (let i = 0; i < count; i++) {
        const bullet = bulletPool.get(this.x, this.y, this.angle + _fanOffset(i, count, spread));
        if (!bullet) continue;
        bullet.damage = damage;
        bullet.radius *= config.bulletSize;
        bullet.baseRadius = bullet.radius;
        bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
        bullet.maxLife = Math.round(bullet.maxLife * config.range);
        bullet.color = config.color;
        // Primaries fragment on ANY impact (hit or kill); shards spawned from
        // them chain only on kills (set in spawnSplitShards via splitOnKill).
        bullet.splitOnImpact = true;
        bullet.splitCount = splitCount;
        bullet.splitDamageFactor = config.splitDamageFactor;
        bullet.splitSpeed = config.splitSpeed;
        bullet.splitGenerations = generations;
        this.applyGlobalBulletUpgrades(bullet);
    }
    audioManager.playShoot();
}

export function fireRicochet(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const multi = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, 'RICOCHET');
    const count = config.bulletCount + multi;
    const spread = count > 1 ? Math.min(0.3, 0.08 * (count - 1)) : 0;
    const bounces = config.bounces + this.getPowerupStacks('EXTRA_BOUNCE');
    const charged = this.getPowerupStacks('CHARGED_CAROMS') > 0;
    for (let i = 0; i < count; i++) {
        const bullet = bulletPool.get(this.x, this.y, this.angle + _fanOffset(i, count, spread));
        if (!bullet) continue;
        bullet.damage = damage;
        bullet.radius *= config.bulletSize;
        bullet.baseRadius = bullet.radius;
        bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
        bullet.maxLife = Math.round(bullet.maxLife * config.range);
        bullet.color = config.color;
        bullet.bounces = bounces;
        bullet.bounceSeekRadius = config.bounceSeekRadius;
        bullet.chargedCaroms = charged;
        this.applyGlobalBulletUpgrades(bullet);
    }
    audioManager.playShoot();
}

export function fireBoomerang(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const multi = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, 'BOOMERANG');
    const count = config.bulletCount + multi;
    const spread = count > 1 ? Math.min(0.5, 0.16 * (count - 1)) : 0;
    const longThrow = this.getPowerupStacks('LONG_THROW');
    const throwMul = 1 + longThrow * 0.4;
    const razor = this.getPowerupStacks('RAZOR_EDGE') > 0;
    for (let i = 0; i < count; i++) {
        const bullet = bulletPool.get(this.x, this.y, this.angle + _fanOffset(i, count, spread));
        if (!bullet) continue;
        bullet.damage = damage;
        bullet.radius *= config.bulletSize;
        bullet.baseRadius = bullet.radius;
        bullet.rangeMultiplier = this.getRangeMultiplier() * config.range * throwMul;
        bullet.maxLife = Math.round(bullet.maxLife * config.range * throwMul);
        bullet.color = config.color;
        bullet.piercing = config.piercing;
        bullet.boomerang = true;
        bullet.boomerangOutFrames = Math.round(config.boomerangOutFrames * throwMul);
        bullet.boomerangReturnAccel = config.boomerangReturnAccel;
        bullet.boomerangOwner = this;
        bullet.razorEdge = razor;
        this.applyGlobalBulletUpgrades(bullet);
    }
    audioManager.playShoot();
}

export function fireSpinCannon(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    // Cone widens with spin so a fully-spooled hose visibly sprays.
    const spinFrac = Math.min(1, (this._fireHoldTime || 0) / (config.spinUpTime || 1400));
    const spread = config.spreadAngle + spinFrac * (config.spinSpreadBonus || 0);
    const jitter = (Math.random() - 0.5) * spread;
    const bullet = bulletPool.get(this.x, this.y, this.angle + jitter);
    if (bullet) {
        bullet.damage = damage;
        bullet.radius *= config.bulletSize;
        bullet.baseRadius = bullet.radius;
        bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
        bullet.maxLife = Math.round(bullet.maxLife * config.range);
        bullet.color = config.color;
        this.applyGlobalBulletUpgrades(bullet);
    }
    audioManager.playShoot();
}

export function fireFlak(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const longFuse = this.getPowerupStacks('LONG_FUSE');
    const flechette = this.getPowerupStacks('FLECHETTE');
    const proximity = this.getPowerupStacks('PROXIMITY_FUSE');
    const bullet = bulletPool.get(this.x, this.y, this.angle);
    if (bullet) {
        bullet.damage = damage;
        bullet.radius *= config.bulletSize;
        bullet.baseRadius = bullet.radius;
        bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
        bullet.maxLife = Math.round(bullet.maxLife * config.range);
        bullet.color = config.color;
        bullet.flak = true;
        bullet.burstDistance = config.burstDistance * (1 + longFuse * 0.4);
        bullet.shrapnelCount = config.shrapnelCount + flechette * 3;
        bullet.shrapnelDamage = config.shrapnelDamage;
        bullet.shrapnelSpeed = config.shrapnelSpeed;
        bullet.shrapnelLifeFrames = config.shrapnelLifeFrames;
        bullet.burstBlastRadius = config.burstBlastRadius + proximity * 30;
        bullet.burstBlastDamage = config.burstBlastDamage + proximity * 0.6;
        this.applyGlobalBulletUpgrades(bullet);
    }
    audioManager.playShoot();
}

export function fireGravityLance(bulletPool, audioManager, config) {
    const damage = this.getEffectivePrimaryDamage();
    const multi = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, 'GRAVITY_LANCE');
    const count = config.bulletCount + multi;
    const spread = count > 1 ? Math.min(0.3, 0.1 * (count - 1)) : 0;
    const wake = this.getPowerupStacks('EVENT_WAKE');
    const singularPull = this.getPowerupStacks('SINGULAR_PULL');
    const implosion = this.getPowerupStacks('IMPLOSION') > 0;
    for (let i = 0; i < count; i++) {
        const bullet = bulletPool.get(this.x, this.y, this.angle + _fanOffset(i, count, spread));
        if (!bullet) continue;
        bullet.damage = damage;
        bullet.radius *= config.bulletSize;
        bullet.baseRadius = bullet.radius;
        bullet.rangeMultiplier = this.getRangeMultiplier() * config.range;
        bullet.maxLife = Math.round(bullet.maxLife * config.range);
        bullet.color = config.color;
        bullet.piercing = config.piercing;
        bullet.gravityWell = true;
        bullet.pullRadius = config.pullRadius + wake * 50;
        bullet.pullStrength = config.pullStrength * (1 + singularPull * 0.5);
        bullet.implosion = implosion;
        this.applyGlobalBulletUpgrades(bullet);
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
    let widthMul = 1 + widthStacks * 0.3;
    let damageMul = 1;
    let rangeMul = 1;

    // 5.75.1 — TRIPLE_BEAM (Overcharged Beam) capstone.
    // 5.110.0 — Range bump dropped; damage bumped 2.2× → 2.5× to
    // compensate (matches the new "+150% damage" description in
    // PRIMARY_UPGRADES). Beam width bonus unchanged.
    if (this.getPowerupStacks('TRIPLE_BEAM') > 0) {
        widthMul *= 1.5;
        damageMul *= 2.5;
    }

    // 5.79.23 — LANCE_VELOCITY now applied directly here. The beam no
    //   longer routes through getBulletVelocityDamageMult since it's a
    //   power weapon.
    // 5.110.0 — Range bonus dropped; pure damage now (+15% per stack,
    //   was 12% damage + 12% range).
    const lanceVelStacks = this.getPowerupStacks('LANCE_VELOCITY');
    if (lanceVelStacks > 0) {
        damageMul *= 1 + lanceVelStacks * 0.15;
    }

    this.beamCurrentWidth = config.beamWidth * widthMul;
    this.beamDamagePerTick = config.damage * damageMul;
    this.beamRangeMul = rangeMul;
    this.beamMaxDuration = duration;

    // 5.79.23 — Beam audio loop now driven by the power-weapon trigger
    //   (no fire-button pulse). Start the splice-looped active sound
    //   on activation; the timer in updateChargingSystem stops it.
    if (audioManager.startLoop) {
        audioManager.startLoop('laserBeamLoop', 0.6, { loopStart: 0.45 });
    } else {
        audioManager.playShoot();
    }
}

// ── Global bullet upgrades ─────────────────────────────────────────────────

export function applyGlobalBulletUpgrades(bullet) {
    // Stamp the firing primary so collision-system can pick the per-weapon
    // hit SFX (audio:enemy-hit-by-bullet → playerHit_<weaponId>). Every
    // primary fire path runs through this helper, so this is the one
    // chokepoint to set it. Charge-shot stamps its own weaponId separately.
    bullet.weaponId = this.activePrimary;

    // E1 (Element & Resistance) — stamp the firing primary's element so the
    // damage path (E2) can apply enemy resistance. One chokepoint for every
    // primary bullet; falls back to the KINETIC baseline.
    const _wcfg = PRIMARY_WEAPONS[this.activePrimary];
    // W1 (Attunements) — a bullet now carries an ELEMENT ARRAY. Priority:
    //   1. ELEMENTAL_INFUSION override (single element, beats resists)
    //   2. the equipped attunements' elements for this weapon (the stack)
    //   3. the weapon's base element (KINETIC for most)
    // `bullet.element` is kept as elements[0] for single-element consumers.
    const _baseEl = (_wcfg && _wcfg.element) || 'KINETIC';
    let _override = (this.activeAbilityEffects
        && this.activeAbilityEffects.has('ELEMENTAL_INFUSION') && this._infusedElement)
        ? this._infusedElement : null;
    // P6 — Prismatic Soul passive: each shot auto-cycles all 6 elements (a
    // single cycling element per bullet, overriding attunements; the active
    // ELEMENTAL_INFUSION ability still takes precedence when up).
    if (!_override && typeof this.hasPassive === 'function' && this.hasPassive('PRISMATIC_SOUL')) {
        this._prismaticIdx = (this._prismaticIdx | 0) + 1;
        _override = prismaticElement(this._prismaticIdx);
    }
    const _attIds = (this.activeAttunements && this.activeAttunements[this.activePrimary]) || [];
    bullet.elements = resolveBulletElements(_override, attunementElements(_attIds), _baseEl);
    bullet.element = bullet.elements[0];

    // Phase 2 (2026-05-19) — global HOMING / PIERCING removed; each
    // weapon's firing path now reads its OWN per-weapon stack. Lookup
    // tables keyed by `bullet.weaponId`. Weapons that don't have a
    // per-weapon variant (LANCE_BEAM has innate pierce; NOVA / MINE /
    // ARC have neither) just see 0 stacks here.
    // 6.28.0 — all five projectile traits are now per-weapon.
    const homingStacks = _getPerWeaponHomingStacks(this, bullet.weaponId);
    const bigBulletStacks = _perWeaponStacks(this, _PER_WEAPON_BIG_ID, bullet.weaponId);
    const piercingStacks = _getPerWeaponPiercingStacks(this, bullet.weaponId);
    const explosiveStacks = _perWeaponStacks(this, _PER_WEAPON_EXPLODE_ID, bullet.weaponId);

    // 6.28.0 — Stun% / Knockback% chances stamped on the bullet; the
    // collision handler rolls them on enemy impact (see applyBulletImpactCC).
    const stunStacks = _perWeaponStacks(this, _PER_WEAPON_STUN_ID, bullet.weaponId);
    const knockStacks = _perWeaponStacks(this, _PER_WEAPON_KNOCK_ID, bullet.weaponId);
    bullet.stunChance = stunStacks * STUN_CHANCE_PER_STACK;
    bullet.knockbackChance = knockStacks * KNOCK_CHANCE_PER_STACK;

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
        bullet.homingStrength = Math.min(0.4, homingStacks * 0.09);
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
    // P6 — Purist: "shots pierce" — +1 pierce on every primary shot.
    bullet.piercing = (bullet.piercing || 0) + puristPierceBonus(this);

    // Explosive
    if (explosiveStacks > 0) {
        bullet.explosive = true;
        bullet.explosionRadius = 30 + explosiveStacks * 10;
    }

    // 5.75.0 — LEGENDARY streak qualitative bonus. Every bullet gains
    // a small explosion radius even without the EXPLOSIVE powerup —
    // visual payoff for sustained dominance.
    // 5.103.0 — Tiers moved to increments of 10; LEGENDARY now sits at
    // 50 kills. Splash gates on LEGENDARY and every tier above so the
    // player who grinds to 50+ keeps the perk all the way to the
    // RAINBOIDS GOD cap.
    const _streakSplashTiers = new Set([
        'LEGENDARY', 'HERCULEAN', 'INDOMITABLE', 'OUTRAGEOUS',
        'IMMORTAL', 'APOCALYPTIC', 'ASTRONOMICAL', 'GALACTIC',
        'COSMIC', 'TRANSCENDENT', 'OMNIPOTENT', 'MYTHIC',
        'INVINCIBLE', 'ETERNAL', 'INFINITE', 'RAINBOIDS GOD',
    ]);
    if (this.streakTierLabel && _streakSplashTiers.has(this.streakTierLabel)) {
        bullet.explosive = true;
        bullet.explosionRadius = (bullet.explosionRadius || 0) + 22;
    }

    // 5.108.0 — Momentum. Damage ramps up the longer the player holds
    // fire. `this._fireHoldTime` (ms) is incremented in player.update
    // while fireHeld AND zeroed on release. Per-stack: +5%/s, capped
    // at +15%/stack so 4 stacks = +60% at the 3-second cap. Linear
    // ramp lets the player feel the damage growing without an
    // explosion that breaks tuning.
    const momentumStacks = this.getPowerupStacks('MOMENTUM');
    if (momentumStacks > 0 && this._fireHoldTime > 0) {
        const seconds = Math.min(3, this._fireHoldTime / 1000);
        const mult = 1 + momentumStacks * 0.05 * seconds;
        bullet.damage *= mult;
    }

    // 5.108.0 — Overcharge Rounds. Periodic super-damage bullet every
    // Nth shot. N shrinks with stacks: 1→12, 2→9, 3→7, 4→5. The
    // overcharged bullet renders fatter + brighter and deals 3×
    // damage. Tag bullet so the renderer (and collision-sim if any)
    // can pick up the visual difference.
    const overchargeStacks = this.getPowerupStacks('OVERCHARGE_ROUNDS');
    if (overchargeStacks > 0) {
        const threshold = Math.max(4, 13 - overchargeStacks * 2);
        this._overchargeCounter = (this._overchargeCounter || 0) + 1;
        if (this._overchargeCounter >= threshold) {
            this._overchargeCounter = 0;
            bullet.overcharged = true;
            bullet.damage *= 3;
            bullet.radius = (bullet.radius || 4) * 1.6;
            bullet.baseRadius = bullet.radius;
            bullet.color = '#ffeb44';
        }
    }
}

// ── Power weapon dispatch ──────────────────────────────────────────────────

// P6 — Resonance passive: every 3rd power-weapon use costs no energy. Pure
// counter step so the cadence unit-tests cleanly — the fire sites advance the
// player's `_resonanceUses` and skip the deduction when `free` is true. (The
// energy gate is left intact: a free use still requires the meter to hold the
// cost, so this "keeps" rather than "conjures" energy every 3rd shot.)
export function resonanceStep(prevCount) {
    const count = (prevCount | 0) + 1;
    return { count, free: count % 3 === 0 };
}

// P6 — Twin Cast passive: power weapons fire twice (the 2nd at 50% damage) for
// +30% energy cost. Only BURST powers double — a 2nd cast of a beam / buff /
// duration power (Lance / Lightning / Prism / Overdrive) is meaningless. Each
// burst power keeps its damage in a DIFFERENT config field, so the half-clone
// scales every known damage field on a SHALLOW COPY (never mutate the shared
// POWER_WEAPONS config returned by getActivePowerConfig). Pure helpers so the
// cost curve + double-selection + half-clone unit-test cleanly.
export const TWIN_CAST_ENERGY_MULT = 1.3;
export const TWIN_CAST_SECOND_MULT = 0.5;
export const TWIN_CAST_DOUBLES = new Set([
    'NOVA_BLAST', 'MISSILE_SALVO', 'SINGULARITY', 'CRYO_BURST', 'ORBITAL_STRIKE', 'MINE_LAYER',
]);
const TWIN_CAST_DMG_FIELDS = ['damage', 'ringDamage', 'missileDamage', 'collapseDamage', 'strikeDamage', 'mineDamage'];
export function twinCastDoubles(power) {
    return TWIN_CAST_DOUBLES.has(power);
}
export function twinCastEnergyCost(base, hasTwinCast) {
    return hasTwinCast ? base * TWIN_CAST_ENERGY_MULT : base;
}
export function twinCastHalfConfig(config, mult = TWIN_CAST_SECOND_MULT) {
    const half = { ...config };
    for (const k of TWIN_CAST_DMG_FIELDS) {
        if (typeof half[k] === 'number') half[k] *= mult;
    }
    return half;
}

export function firePower(bulletPool, audioManager, particlePool) {
    // P6 — Gunslinger passive: no power weapons (pure-gunner identity).
    if (typeof this.hasPassive === 'function' && this.hasPassive('GUNSLINGER')) return;
    const config = this.getActivePowerConfig();

    // 6.29.0 — Spend energy. Callers gate on isPowerReady() (energy >=
    // cost) before reaching here, but deduct defensively in case a
    // future caller skips the gate.
    // P6 — Twin Cast: +30% energy cost (it fires twice — see below). Applied
    // before Resonance so a Resonance free shot still wins (cost → 0).
    let _powerCost = this.getPowerEnergyCost();
    if (typeof this.hasPassive === 'function' && this.hasPassive('TWIN_CAST')) {
        _powerCost = twinCastEnergyCost(_powerCost, true);
    }
    // P6 — Resonance: every 3rd power use is free (no deduction).
    if (typeof this.hasPassive === 'function' && this.hasPassive('RESONANCE')) {
        const _r = resonanceStep(this._resonanceUses);
        this._resonanceUses = _r.count;
        if (_r.free) _powerCost = 0;
    }
    this.energy = Math.max(0, (this.energy || 0) - _powerCost);

    switch (this.activePower) {
        case 'MINE_LAYER':
            this.layMine(config);
            break;
        case 'NOVA_BLAST':
            this.fireNova(config);
            break;
        case 'MISSILE_SALVO':
            this.fireMissiles(bulletPool, config);
            break;
        case 'LANCE_BEAM':
            // 5.79.23 — Beam now triggered as a power weapon. Activates
            //   for beamDuration, drives a fixed cooldown.
            this.startLanceBeam(audioManager, config);
            this.powerCooldown = config.cooldown;
            this.powerCooldownMax = this.powerCooldown;
            return;
        case 'LIGHTNING_ARC':
            // 5.79.23 — Arc now triggered as a power weapon.
            this.lightningArcActive = true;
            this.lightningArcTimer = config.beamDuration;
            this._nextArcStrikeAt = Date.now() + 200 + Math.random() * 250;
            audioManager.playShoot();
            if (audioManager.startLoop) {
                audioManager.startLoop('arcLightningLoop', 0.4, {
                    loopStart: 0.6,
                    loopEnd: 3.4,
                });
            }
            this.powerCooldown = config.cooldown;
            this.powerCooldownMax = this.powerCooldown;
            return;
        case 'SINGULARITY':
            this.fireSingularity(config);
            break;
        case 'CRYO_BURST':
            this.fireCryoBurst(config);
            break;
        case 'ORBITAL_STRIKE':
            this.fireOrbitalStrike(config);
            break;
        case 'OVERDRIVE':
            this.activateOverdrive(config);
            break;
        case 'PRISM_BEAM':
            this.firePrismBeam(audioManager, config);
            this.powerCooldown = config.cooldown;
            this.powerCooldownMax = this.powerCooldown;
            return;
    }

    // P6 — Twin Cast: burst powers fire a 2nd time at 50% damage. No extra
    // energy (the +30% was already applied above) and no extra cooldown (the
    // 1st fire set it). Re-dispatches only the BURST powers (beam/buff/duration
    // powers returned early or are buffs — a 2nd cast is meaningless). The
    // half-clone scales the active power's damage field without mutating the
    // shared config.
    let _twinEchoed = false;
    if (typeof this.hasPassive === 'function' && this.hasPassive('TWIN_CAST')
        && twinCastDoubles(this.activePower)) {
        const half = twinCastHalfConfig(config);
        switch (this.activePower) {
            case 'NOVA_BLAST': this.fireNova(half); break;
            case 'MISSILE_SALVO': this.fireMissiles(bulletPool, half); break;
            case 'SINGULARITY': this.fireSingularity(half); break;
            case 'CRYO_BURST': this.fireCryoBurst(half); break;
            case 'ORBITAL_STRIKE': this.fireOrbitalStrike(half); break;
            case 'MINE_LAYER': this.layMine(half); break;
        }
        _twinEchoed = true;
    }

    // Each weapon's fire fn sets its own cooldown with discount applied
    // (see fireNova / fireLightning / fireMissiles / layMine). We do NOT
    // overwrite here — that would cancel the upgrade.
    audioManager.playShoot();

    // Heavy muzzle flare for power weapons. 6.157.4 — when Twin Cast doubled
    // the cast, tint the flare phantom-violet (matching the Afterimage clone)
    // so the player gets a clear "echo fired" tell instead of a silent double.
    spawnMuzzleFlare.call(this, particlePool, 'heavy', _twinEchoed ? '#aa88ff' : '#ffcc44');
}

// ── New power weapons (brainstorm drop) ────────────────────────────────────

// Resolve the aim/cursor world position (deployed powers land here).
function _aimWorld(player) {
    const inp = player.gameEngine && player.gameEngine.inputHandler && player.gameEngine.inputHandler.input;
    if (inp && typeof inp.aimX === 'number') return { x: inp.aimX, y: inp.aimY };
    return { x: player.x + Math.cos(player.angle) * 320, y: player.y + Math.sin(player.angle) * 320 };
}

export function fireSingularity(config) {
    const radiusStacks = this.getPowerupStacks('SINGULARITY_RADIUS');
    const graspStacks = this.getPowerupStacks('VOID_GRASP');
    const durStacks = this.getPowerupStacks('SINGULARITY_DURATION');
    const eventHorizon = this.getPowerupStacks('EVENT_HORIZON') > 0;
    const t = _aimWorld(this);
    this.singularities.push({
        x: t.x, y: t.y,
        pullRadius: config.pullRadius + radiusStacks * 40,
        pullStrength: config.pullStrength * (1 + graspStacks * 0.3),
        elapsed: 0,
        duration: config.pullDuration + durStacks * 500,
        collapseRadius: config.collapseRadius * (eventHorizon ? 1.5 : 1),
        collapseDamage: config.collapseDamage * (eventHorizon ? 2 : 1),
        collapsed: false,
        active: true,
    });
    if (this.gameEngine && this.gameEngine.particlePool) {
        const pp = this.gameEngine.particlePool;
        pp.get(t.x, t.y, 'explosionFlash', 30, '#aa66ff');
        for (let i = 0; i < 10; i++) pp.get(t.x, t.y, 'starSparkle');
    }
    this.powerCooldown = config.cooldown;
    this.powerCooldownMax = this.powerCooldown;
}

export function fireCryoBurst(config) {
    const radiusStacks = this.getPowerupStacks('CRYO_RADIUS');
    const freezeStacks = this.getPowerupStacks('DEEP_FREEZE');
    const coldSnap = this.getPowerupStacks('COLD_SNAP');
    this.cryoRings.push({
        x: this.x, y: this.y,
        currentRadius: 0,
        maxRadius: config.ringRadius + radiusStacks * 40,
        damage: config.ringDamage,
        freezeDuration: config.freezeDuration + freezeStacks * 1000,
        duration: config.ringDuration,
        elapsed: 0,
        hitEnemies: new Set(),
        active: true,
    });
    if (this.gameEngine && this.gameEngine.particlePool) {
        const pp = this.gameEngine.particlePool;
        pp.get(this.x, this.y, 'explosionFlash', 40, '#bbeeff');
        pp.get(this.x, this.y, 'explosionRingColored', 60, '#66ccff');
    }
    this.powerCooldown = Math.max(2000, config.cooldown - coldSnap * 1500);
    this.powerCooldownMax = this.powerCooldown;
}

export function fireOrbitalStrike(config) {
    const radiusStacks = this.getPowerupStacks('ORBITAL_RADIUS');
    const powerStacks = this.getPowerupStacks('ORBITAL_POWER');
    const rapidPaint = this.getPowerupStacks('RAPID_PAINT');
    const barrage = this.getPowerupStacks('ORBITAL_BARRAGE');
    const t = _aimWorld(this);
    const telegraph = Math.max(250, config.telegraphTime - rapidPaint * 200);
    const strikeRadius = config.strikeRadius + radiusStacks * 30;
    const strikeDamage = config.strikeDamage * (1 + powerStacks * 0.25);
    const count = config.strikeCount + barrage;
    for (let i = 0; i < count; i++) {
        const off = i * strikeRadius * 1.2;
        this.orbitalStrikes.push({
            x: t.x + Math.cos(this.angle) * off,
            y: t.y + Math.sin(this.angle) * off,
            telegraph: telegraph + i * 120,  // stagger so columns "walk" out
            elapsed: 0,
            radius: strikeRadius,
            damage: strikeDamage,
            detonated: false,
            active: true,
        });
    }
    this.powerCooldown = config.cooldown;
    this.powerCooldownMax = this.powerCooldown;
}

export function firePrismBeam(audioManager, config) {
    const beamsStacks = this.getPowerupStacks('PRISM_BEAMS');
    const widthStacks = this.getPowerupStacks('PRISM_WIDTH');
    const durStacks = this.getPowerupStacks('PRISM_DURATION');
    const seek = this.getPowerupStacks('PRISM_SEEK') > 0;
    const count = config.beamCount + beamsStacks;
    const spread = config.beamSpread;
    const colors = ['#ff4444', '#ff9944', '#ffee44', '#44ff66', '#44ccff', '#aa66ff', '#ff66cc'];
    this.prismBeams = [];
    for (let i = 0; i < count; i++) {
        const off = count > 1 ? (i - (count - 1) / 2) * (spread / (count - 1)) : 0;
        this.prismBeams.push({ angleOffset: off, color: colors[i % colors.length], seek });
    }
    this.prismActive = true;
    this.prismTimer = config.beamDuration + durStacks * 300;
    this.prismAngle = this.angle;
    this.prismWidth = config.beamWidth * (1 + widthStacks * 0.3);
    this.prismDamage = config.damage;
    this.prismRange = config.range;
    if (audioManager.startLoop) {
        audioManager.startLoop('laserBeamLoop', 0.5, { loopStart: 0.45 });
    } else {
        audioManager.playShoot();
    }
}

export function activateOverdrive(config) {
    const durStacks = this.getPowerupStacks('OVERDRIVE_DURATION');
    const nitro = this.getPowerupStacks('NITRO');
    this.overdriveTimer = config.duration + durStacks * 1000;
    if (this.gameEngine && this.gameEngine.particlePool) {
        const pp = this.gameEngine.particlePool;
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            pp.get(this.x, this.y, 'explosionShrapnel', a, 4 + Math.random() * 3, '#ff5522');
        }
    }
    this.powerCooldown = Math.max(4000, config.cooldown - nitro * 2000);
    this.powerCooldownMax = this.powerCooldown;
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
        // Velocity drives the seeker behavior — once armed, the mine
        // steers toward the nearest enemy/asteroid each frame and
        // accelerates up to MINE_MAX_SPEED. Capped low so mines feel
        // like creeping seekers, not bullets.
        vel: { x: 0, y: 0 },
        target: null,
        armTimer: 1000,  // 1s to arm
        armed: false,
        // Self-detonation timer — once armed, a 12s clock starts. When
        // it expires the mine auto-explodes (same VFX as proximity).
        // Last 2s of the clock the renderer flips into a fast urgent
        // blink so the player sees the boom coming.
        lifeTimer: 12000,
        lifeTimerMax: 12000,
        expired: false,
        // BLAST_RADIUS boosts BOTH the trigger radius (+20px/stack)
        // and the blast/damage radius (+30px/stack).
        triggerRadius: config.mineRadius + blastRadiusStacks * 20,
        blastRadius: config.blastRadius + blastRadiusStacks * 30,
        damage: config.mineDamage,
        daisyChain: this.getPowerupStacks('DAISY_CHAIN') > 0,
        active: true,
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

    this.novaActive = true; // collision/renderer gate
    const ringMax = config.ringRadius + shockwaveStacks * 40;
    this.novaRings.push({
        x: this.x,
        y: this.y,
        currentRadius: 0,    // renderer + collision read this
        maxRadius: ringMax,
        damage: config.ringDamage,
        duration: config.ringDuration,
        elapsed: 0,
        hitEnemies: new Set(),
        hitAsteroids: new Set(),
        aftershock: this.getPowerupStacks('AFTERSHOCK') > 0,
        active: true,
    });

    // Immediate explosive burst at the player position so the cast
    // actually feels detonative — flash, multiple wavefront rings,
    // shrapnel fan, classic particles, lingering embers, and a delayed
    // cookoff. Modeled on createDebris (asteroid-death recipe).
    if (this.gameEngine && this.gameEngine.particlePool) {
        const pp = this.gameEngine.particlePool;
        const ORANGE = '#ffaa00';
        const ORANGE_BRIGHT = '#ffe080';
        const ORANGE_DIM = '#cc6600';
        pp.get(this.x, this.y, 'explosionFlash', ringMax * 0.4);
        pp.get(this.x, this.y, 'explosionRingColored', ringMax * 0.5, ORANGE);
        for (let i = 0; i < 24; i++) {
            const ang = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
            pp.get(this.x, this.y, 'explosionShrapnel', ang, 5 + Math.random() * 5,
                i % 3 === 0 ? ORANGE_BRIGHT : i % 3 === 1 ? ORANGE : ORANGE_DIM);
        }
        for (let i = 0; i < 14; i++) {
            pp.get(this.x, this.y, 'explosionEmber', i % 2 ? ORANGE : ORANGE_BRIGHT);
        }
        if (typeof this.gameEngine.triggerHitstop === 'function') this.gameEngine.triggerHitstop(4);
        if (typeof this.gameEngine.triggerScreenFlash === 'function') this.gameEngine.triggerScreenFlash(0.08, 4);
        if (typeof this.gameEngine.triggerScreenShake === 'function') this.gameEngine.triggerScreenShake(10, 6);
    }

    // Double Pulse
    if (this.getPowerupStacks('DOUBLE_PULSE') > 0) {
        setTimeout(() => {
            this.novaRings.push({
                x: this.x,
                y: this.y,
                currentRadius: 0,
                maxRadius: (config.ringRadius + shockwaveStacks * 40) * 0.7,
                damage: config.ringDamage * 0.6,
                duration: config.ringDuration,
                elapsed: 0,
                hitEnemies: new Set(),
                hitAsteroids: new Set(),
                aftershock: false,
                active: true,
            });
            this.novaActive = true;
        }, 300);
    }
}

export function fireLightning(config) {
    const conductorStacks = this.getPowerupStacks('CONDUCTOR');
    const teslaCoilStacks = this.getPowerupStacks('TESLA_COIL');

    // Always set the cooldown — TESLA_COIL just shortens it.
    this.powerCooldown = Math.max(2000, config.cooldown - teslaCoilStacks * 1500);
    this.powerCooldownMax = this.powerCooldown;

    const maxChains = config.chainCount + conductorStacks;
    const range = config.chainRange;

    // Build the chain-target list eagerly so the renderer + collision
    // both have something concrete to iterate. targets[0] is the player
    // (origin), then up to `maxChains` hops between enemies AND
    // asteroids — both are fair game and lightning can chain through
    // either. Each link picks the nearest unvisited target within
    // `range` of the previous link.
    const targets = [{ x: this.x, y: this.y, enemy: null, asteroid: null }];
    const visited = new Set();
    const ge = this.gameEngine || window.gameEngine;
    const enemies = (ge && ge.enemyPool && ge.enemyPool.activeObjects) || [];
    const asteroids = (ge && ge.asteroidPool && ge.asteroidPool.activeObjects) || [];
    let cursorX = this.x, cursorY = this.y;
    for (let hop = 0; hop < maxChains; hop++) {
        let best = null, bestKind = null, bestDist = range;
        for (const e of enemies) {
            if (!e.active || visited.has(e)) continue;
            const d = Math.hypot(e.x - cursorX, e.y - cursorY);
            if (d < bestDist) { bestDist = d; best = e; bestKind = 'enemy'; }
        }
        for (const ast of asteroids) {
            if (!ast.active || visited.has(ast)) continue;
            const d = Math.hypot(ast.x - cursorX, ast.y - cursorY);
            if (d < bestDist) { bestDist = d; best = ast; bestKind = 'asteroid'; }
        }
        if (!best) break;
        visited.add(best);
        targets.push({
            x: best.x, y: best.y,
            enemy: bestKind === 'enemy' ? best : null,
            asteroid: bestKind === 'asteroid' ? best : null,
        });
        cursorX = best.x; cursorY = best.y;
    }

    this.lightningChains.push({
        originX: this.x,
        originY: this.y,
        angle: this.angle,
        maxChains,
        damage: config.chainDamage,
        falloff: config.chainFalloff,
        range,
        amplifierStacks: this.getPowerupStacks('AMPLIFIER'),
        staticField: this.getPowerupStacks('STATIC_FIELD') > 0,
        timer: 500, // visual duration
        targets,
        damageApplied: false,
        active: true,
    });
}

export function fireMissiles(bulletPool, config) {
    const extraOrdnanceStacks = this.getPowerupStacks('EXTRA_ORDNANCE');
    const count = config.missileCount + extraOrdnanceStacks;

    // 6.34.0 — Missile Salvo concentrates ALL missiles on a SINGLE
    // target (nearest enemy, else nearest asteroid) to maximize burst
    // damage. If that target dies, each missile re-acquires the new
    // nearest target in flight (see updateMissiles in abilities.js).
    const eng = this.gameEngine;
    const enemies = (eng && eng.enemyPool && eng.enemyPool.activeObjects) || [];
    const asteroids = (eng && eng.asteroidPool && eng.asteroidPool.activeObjects) || [];
    let sharedTarget = null;
    let bestD = Infinity;
    for (const e of enemies) {
        if (!e.active || e._deathFlash > 0) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < bestD) { bestD = d; sharedTarget = e; }
    }
    if (!sharedTarget) {
        for (const a of asteroids) {
            if (!a.active || a._deathFlash > 0 || a.warping) continue;
            const d = Math.hypot(a.x - this.x, a.y - this.y);
            if (d < bestD) { bestD = d; sharedTarget = a; }
        }
    }

    // Per-slot offset along the ship's perpendicular axis so the
    // missiles visibly launch from positions across the ship's wings
    // (not all from the same center point) and fan outward in a wider
    // arc. Spread bumped 0.3 → 0.5 rad/slot for a more dramatic fan.
    const perpX = -Math.sin(this.angle); // ship-relative right
    const perpY = Math.cos(this.angle);
    for (let i = 0; i < count; i++) {
        const slot = i - (count - 1) / 2;     // -1..0..+1 etc., centered
        const spreadAngle = this.angle + slot * 0.5;
        const wingOffset = slot * 9;          // px along the ship's perp axis
        const launchX = this.x + perpX * wingOffset;
        const launchY = this.y + perpY * wingOffset;
        this.activeMissiles.push({
            x: launchX,
            y: launchY,
            vel: {
                x: Math.cos(spreadAngle) * config.missileSpeed,
                y: Math.sin(spreadAngle) * config.missileSpeed,
            },
            angle: spreadAngle,
            damage: config.missileDamage,
            // Homing is always on (LOCK_ON upgrade was removed). The
            // base config value tunes how aggressively missiles steer.
            homingStrength: config.missileHomingStrength,
            cluster: this.getPowerupStacks('CLUSTER_WARHEAD') > 0,
            life: 3000,
            maxLife: 3000,
            radius: 5,
            target: sharedTarget, // 6.34.0 — whole salvo locks one target
            active: true,
            speed: config.missileSpeed,
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
    // Higher streak = more orb drops.
    // 5.79.19 — Gentler curve + lower ceiling. Was 1×→1.5×→2×→3×→4×;
    //   compounded with enemy-level (2.4× at wave 15) + enemy-only
    //   (1.3×) + streakGoldMult (2.5×) the player got 31× baseline
    //   drop yield at high streak/wave — runaway feedback loop where
    //   the heal orbs alone made the player invincible. Now caps at
    //   2× so the streak rewards ability without snowballing.
    if (this.hitStreak < 5)  return 1;
    if (this.hitStreak < 15) return 1.25;
    if (this.hitStreak < 30) return 1.5;
    if (this.hitStreak < 60) return 1.75;
    return 2;
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

    // Create charged bullet. Pass 'CHARGE_SHOT' as the weapon-upgrade
    // source so CHARGE_HOMING / CHARGE_PIERCING apply regardless of
    // which primary is equipped underneath the charge shot.
    this.createChargedBullets(bulletPool, sizeMultiplier, speedMultiplier, totalDamage, critChanceBonus, baseHomingStrength, 1, 'CHARGE_SHOT');

    // Play shoot sound
    audioManager.playShoot();

    // Heavy muzzle flare for charged shot
    spawnMuzzleFlare.call(this, null, 'heavy', '#ffcc44');
}

// ── Bullet creation ────────────────────────────────────────────────────────

export function fireWeapons(bulletPool, audioManager) {
    // Fire bullets based on powerups (no cooldown needed since auto-fire handles timing)
    this.createBullets(bulletPool);

    // Speedrun-meta stats: count one shot per fireWeapons() call (multi-shot
    // expansion isn't counted — that's an upgrade benefit, not "more shots").
    const stats = this.gameEngine && this.gameEngine.game && this.gameEngine.game.stats;
    if (stats) {
        stats.shotsFired++;
        const wid = this.activePrimary || 'PULSE_CANNON';
        stats.weaponShots[wid] = (stats.weaponShots[wid] || 0) + 1;
    }

    // Play shoot sound synchronized with every shot
    audioManager.playShoot();
}

export function createBullets(bulletPool) {
    // 6.28.0 — all traits resolve per-weapon by activePrimary.
    const wid = this.activePrimary;
    const multiShotStacks = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, wid);
    const homingStacks = _getPerWeaponHomingStacks(this, wid);
    const bigBulletStacks = _perWeaponStacks(this, _PER_WEAPON_BIG_ID, wid);
    const piercingStacks = _getPerWeaponPiercingStacks(this, wid);
    const explosiveStacks = _perWeaponStacks(this, _PER_WEAPON_EXPLODE_ID, wid);
    const stunChance = _perWeaponStacks(this, _PER_WEAPON_STUN_ID, wid) * STUN_CHANCE_PER_STACK;
    const knockbackChance = _perWeaponStacks(this, _PER_WEAPON_KNOCK_ID, wid) * KNOCK_CHANCE_PER_STACK;

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
            const upgradeHomingStrength = homingStacks > 0 ? Math.min(0.35, homingStacks * 0.11) : 0;

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
            // 6.28.0 — Stun% / Knockback% chances (rolled on enemy impact).
            bullet.stunChance = stunChance;
            bullet.knockbackChance = knockbackChance;
        }
    }
}

export function createChargedBullets(bulletPool, sizeMultiplier = 1, speedMultiplier = 1, totalDamage = 20, critChanceBonus = 0, baseHomingStrength = 0, rangeOverride = 1, weaponIdOverride = null) {
    // Phase 2 (2026-05-19) — global HOMING / PIERCING retired. Each
    // call site picks its own per-weapon upgrade source via
    // `weaponIdOverride`. firePulseCannon doesn't pass an override so
    // we resolve via `activePrimary` (= PULSE_CANNON →
    // PULSE_HOMING/PULSE_PIERCING). fireChargedShot passes
    // 'CHARGE_SHOT' explicitly so charge shots read
    // CHARGE_HOMING/CHARGE_PIERCING regardless of which primary is
    // equipped underneath.
    const weaponIdForUpgrades = weaponIdOverride || this.activePrimary;
    const homingStacks = _getPerWeaponHomingStacks(this, weaponIdForUpgrades);
    // 6.28.0 — all projectile traits resolve per-weapon here too.
    const bigBulletStacks = _perWeaponStacks(this, _PER_WEAPON_BIG_ID, weaponIdForUpgrades);
    const piercingStacks = _getPerWeaponPiercingStacks(this, weaponIdForUpgrades);
    const explosiveStacks = _perWeaponStacks(this, _PER_WEAPON_EXPLODE_ID, weaponIdForUpgrades);
    const stunChance = _perWeaponStacks(this, _PER_WEAPON_STUN_ID, weaponIdForUpgrades) * STUN_CHANCE_PER_STACK;
    const knockbackChance = _perWeaponStacks(this, _PER_WEAPON_KNOCK_ID, weaponIdForUpgrades) * KNOCK_CHANCE_PER_STACK;

    // +1 bullet per multi-shot stack, spread evenly in a fan
    const multiShotForCount = _perWeaponStacks(this, _PER_WEAPON_MULTI_ID, weaponIdForUpgrades);
    const bulletCount = 1 + multiShotForCount;

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
            const upgradeHomingStrength = homingStacks > 0 ? Math.min(0.4, homingStacks * 0.09) : 0;
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
            // 6.28.0 — Stun% / Knockback% chances (rolled on enemy impact).
            bullet.stunChance = stunChance;
            bullet.knockbackChance = knockbackChance;

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

    // SPIN_CANNON spin-up — the fire interval ramps from slowFireRate (cold)
    // down to fastFireRate (full spin) over spinUpTime ms of HELD fire.
    // _fireHoldTime is incremented while fire is held and reset on release
    // (see updateChargingSystem), so tapping stays slow and holding spools up.
    // FLYWHEEL shortens spin-up; OVERSPIN lowers the hot interval.
    if (this.activePrimary === 'SPIN_CANNON') {
        const flywheel = this.getPowerupStacks('FLYWHEEL');
        const overspin = this.getPowerupStacks('OVERSPIN');
        const spinUpTime = Math.max(300, (config.spinUpTime || 1400) * Math.pow(0.7, flywheel));
        const hot = Math.max(25, (config.fastFireRate || 60) - overspin * 12);
        const cold = config.slowFireRate || 220;
        const frac = Math.min(1, (this._fireHoldTime || 0) / spinUpTime);
        rate = cold - (cold - hot) * frac;
    }

    // 6.28.0 — Per-weapon Rapid Fire. Each stack shortens the fire
    // interval by RAPID_FIRE_PER_STACK (compounding). Only the 4 kinetic
    // primaries have a rapid-fire upgrade; others see 0 stacks.
    const rapidStacks = _perWeaponStacks(this, _PER_WEAPON_RAPID_ID, this.activePrimary);
    rate *= Math.pow(1 - RAPID_FIRE_PER_STACK, rapidStacks);

    // OVERDRIVE power weapon — supercharges the primary while active.
    if (this.overdriveTimer > 0) {
        rate *= (POWER_WEAPONS.OVERDRIVE.fireRateMult || 0.55);
    }

    // P6 — Gunslinger passive: +30% fire rate (shorter interval).
    if (typeof this.hasPassive === 'function' && this.hasPassive('GUNSLINGER')) {
        rate /= 1.3;
    }

    return Math.round(rate);
}

// 5.79.0 — Player damage no longer scales with level. The player
// must invest gold/SP/picks into shop upgrades and powerups to grow
// DPS. Helper retained as a no-op (1.0×) so external callers can
// still reference it without behavior change.
export function getPlayerLevelDamageMultiplier() {
    return 1;
}

export function getEffectivePrimaryDamage() {
    const config = this.getActivePrimaryConfig();
    let damage = config.damage;

    if (this.activePrimary === 'PULSE_CANNON') {
        const stacks = this.getPowerupStacks('OVERCHARGE');
        damage *= (1 + stacks * 0.15);
    }

    // 5.97.0 — Mobile early-game ramp (desktop unchanged).
    const ge = (typeof window !== 'undefined') ? window.gameEngine : null;
    const wave = (ge && ge.game) ? (ge.game.currentWave | 0) : 1;
    damage *= getMobileEarlyDamageMultiplier(wave);

    // OVERDRIVE power weapon — primary damage buff while active (+REDLINE).
    if (this.overdriveTimer > 0) {
        const redline = this.getPowerupStacks('REDLINE');
        damage *= (POWER_WEAPONS.OVERDRIVE.damageMult || 1.5) * (1 + redline * 0.25);
    }

    // P6 — Overflow Spark passive: at full energy, primaries deal +25%.
    if (typeof this.hasPassive === 'function' && this.hasPassive('OVERFLOW_SPARK')
        && (this.energy || 0) >= (this.maxEnergy || 100) * 0.999) {
        damage *= 1.25;
    }

    // P6 — Gunslinger passive: +50% primary damage (the trade for giving up
    // power weapons + abilities; see firePower / activateAbility gates).
    if (typeof this.hasPassive === 'function' && this.hasPassive('GUNSLINGER')) {
        damage *= 1.5;
    }

    return damage;
}

export function getPowerCooldownRemaining() {
    return Math.max(0, this.powerCooldown);
}

// Power weapons cost ENERGY to fire. 6.116.0 — energy regenerates passively
// over time (see Player.update) rather than being built by landing hits.
// Each power weapon spends a different amount on fire.
export const POWER_ENERGY_COST = {
    CHARGE_SHOT:   20,
    MINE_LAYER:    25,
    LIGHTNING_ARC: 30,
    NOVA_BLAST:    45,
    MISSILE_SALVO: 55,
    LANCE_BEAM:    60,
    CRYO_BURST:    40,
    OVERDRIVE:     45,
    PRISM_BEAM:    50,
    SINGULARITY:   60,
    ORBITAL_STRIKE: 65,
};

export function getPowerEnergyCost() {
    return POWER_ENERGY_COST[this.activePower] || 30;
}

export function isPowerReady() {
    // Energy-gated (6.29.0). The per-weapon fire fns still set
    // `powerCooldown` for a short anti-spam floor, but the primary
    // gate is now having enough energy banked.
    if (this.powerCooldown > 0) return false;
    return (this.energy || 0) >= this.getPowerEnergyCost();
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
