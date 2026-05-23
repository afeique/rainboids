// Player ability system — extracted from Player class
// All functions are called with .call(this) so `this` refers to the Player instance.

import { GAME_CONFIG } from '../core/constants.js';
// Phase B.S1 — canonical export is now `ABILITIES` (was ABILITIES, kept
// as a back-compat alias in weapon-data.js).
import { ABILITIES, POWER_WEAPONS } from '../combat/weapon-data.js';
import { cleansePlayerStatus } from './player-status.js';

// ── Active ability updates ──────────────────────────────────────────────────

export function updateActiveAbilities(dt) {
    // R6.1 — Field Medic is a BURST heal + cleanse on activate (no HoT here).

    // EMERGENCY_PROTOCOL — auto-fire Field Medic when HP drops below 20%
    // (only when it's equipped in some slot and that slot is off cooldown)
    // so the burst-heal + cleanse lands without a manual panic-tap.
    if (this.getPowerupStacks('EMERGENCY_PROTOCOL') > 0
        && this.health < this.getEffectiveMaxHealth() * 0.2) {
        const medicSlot = this.equippedAbilities.indexOf('FIELD_MEDIC');
        if (medicSlot !== -1 && this.abilityCooldowns[medicSlot] <= 0) {
            this.activateAbility(medicSlot);
        }
    }

    // Bulwark: set flag for damage reduction
    this.bulwarkActive = this.activeAbilityEffects.has('BULWARK');

    // Tractor shield: set flag
    this.tractorShieldActive = this.activeAbilityEffects.has('TRACTOR_SHIELD');
    if (this.tractorShieldActive) {
        this.tractorShieldAngle = this.angle;
    }

    // Dash motion (5.93.0 — was the PHASE_DASH defense ability; now a
    // SHIFT-key core movement primitive triggered by Player._triggerDash).
    // The per-frame kinematics + auto-exit logic live here because the
    // dash position update has always been driven from updateActiveAbilities.
    // I-frames are signalled by `isDashing` itself (see player.isDashIFrameActive).
    if (this.isDashing) {
        this.dashTimer -= dt;
        this.x += this.dashVelX * (dt / 1000);
        this.y += this.dashVelY * (dt / 1000);
        if (this.dashTimer <= 0) {
            this.isDashing = false;
        }
    }

    // Update nova rings — render+collision both use `currentRadius`,
    // so we set that here. Clear `novaActive` once all rings have died.
    for (let i = this.novaRings.length - 1; i >= 0; i--) {
        const ring = this.novaRings[i];
        ring.elapsed += dt;
        ring.currentRadius = (ring.elapsed / ring.duration) * ring.maxRadius;
        if (ring.elapsed >= ring.duration) {
            this.novaRings.splice(i, 1);
        }
    }
    if (this.novaRings.length === 0) this.novaActive = false;

    // ── New power-weapon entity updates (brainstorm drop) ──
    const _ppEnemies = (this.gameEngine && this.gameEngine.enemyPool && this.gameEngine.enemyPool.activeObjects) || [];

    // Singularities — drag enemies inward each frame, then collapse for AoE.
    for (let i = this.singularities.length - 1; i >= 0; i--) {
        const s = this.singularities[i];
        s.elapsed += dt;
        const pr = s.pullRadius, pr2 = pr * pr;
        for (let k = 0; k < _ppEnemies.length; k++) {
            const e = _ppEnemies[k];
            if (!e || !e.active || e.warping || e.isBoss) continue;
            const dx = s.x - e.x, dy = s.y - e.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > pr2 || d2 < 4) continue;
            const dist = Math.sqrt(d2);
            const pull = (1 - dist / pr) * s.pullStrength * 10;
            e.x += (dx / dist) * pull;
            e.y += (dy / dist) * pull;
        }
        if (s.elapsed >= s.duration) {
            if (this.gameEngine && typeof this.gameEngine.detonateSubBomblet === 'function') {
                this.gameEngine.detonateSubBomblet(s.x, s.y, s.collapseDamage, s.collapseRadius);
            }
            if (this.gameEngine && this.gameEngine.particlePool) {
                const pp = this.gameEngine.particlePool;
                pp.get(s.x, s.y, 'explosionFlash', s.collapseRadius, '#aa66ff');
                pp.get(s.x, s.y, 'explosionRingColored', s.collapseRadius, '#cc88ff');
            }
            this.singularities.splice(i, 1);
        }
    }

    // Cryo rings — expand like a nova ring; checkCryoCollisions applies freeze.
    for (let i = this.cryoRings.length - 1; i >= 0; i--) {
        const r = this.cryoRings[i];
        r.elapsed += dt;
        r.currentRadius = Math.min(1, r.elapsed / r.duration) * r.maxRadius;
        if (r.elapsed >= r.duration + 200) this.cryoRings.splice(i, 1);
    }

    // Orbital strikes — telegraph countdown, then drop the column.
    for (let i = this.orbitalStrikes.length - 1; i >= 0; i--) {
        const o = this.orbitalStrikes[i];
        o.elapsed += dt;
        if (!o.detonated && o.elapsed >= o.telegraph) {
            o.detonated = true;
            if (this.gameEngine && typeof this.gameEngine.detonateSubBomblet === 'function') {
                this.gameEngine.detonateSubBomblet(o.x, o.y, o.damage, o.radius);
            }
            if (this.gameEngine && this.gameEngine.particlePool) {
                const pp = this.gameEngine.particlePool;
                pp.get(o.x, o.y, 'explosionFlash', o.radius * 1.2, '#ffffff');
                pp.get(o.x, o.y, 'explosionRingColored', o.radius * 1.3, '#ffee44');
            }
            if (this.gameEngine && typeof this.gameEngine.triggerScreenShake === 'function') {
                this.gameEngine.triggerScreenShake(12, 7, o.radius);
            }
            this.orbitalStrikes.splice(i, 1);
        }
    }

    // Prism beam timer — fan tracks the current aim while active.
    if (this.prismActive) {
        this.prismTimer -= dt;
        this.prismAngle = this.angle;
        if (this.prismTimer <= 0) {
            this.prismActive = false;
            this.prismBeams = [];
            const am = this.gameEngine && this.gameEngine.audioManager;
            if (am && am.stopLoop) am.stopLoop('laserBeamLoop');
        }
    }

    // Update lightning chains visual timer. Also re-anchor the chain
    // origin (targets[0]) to the player's CURRENT position so the
    // first arc visibly tracks the ship as it moves during the 500ms
    // visual window.
    for (let i = this.lightningChains.length - 1; i >= 0; i--) {
        const chain = this.lightningChains[i];
        chain.timer -= dt;
        if (chain.targets && chain.targets[0]) {
            chain.targets[0].x = this.x;
            chain.targets[0].y = this.y;
        }
        if (chain.timer <= 0) {
            this.lightningChains.splice(i, 1);
        }
    }

    // Update missiles — always-on homing seeks the nearest active
    // target (enemies preferred, asteroids as fallback). Each missile
    // re-acquires when its target dies/inactivates. Steering uses
    // smooth angular interpolation so rotation reads naturally.
    const enemies = (this.gameEngine && this.gameEngine.enemyPool && this.gameEngine.enemyPool.activeObjects) || [];
    const asteroidsForMissiles = (this.gameEngine && this.gameEngine.asteroidPool && this.gameEngine.asteroidPool.activeObjects) || [];
    // 6.34.0 — Missile Salvo concentrates fire. Compute ONE shared salvo
    // target per frame (nearest active enemy to the ship, else nearest
    // asteroid). Any missile whose target died re-acquires this shared
    // target, so the whole salvo keeps hammering one threat for max
    // burst damage instead of spreading out.
    let salvoTarget = null;
    {
        let bestD = Infinity;
        for (const e of enemies) {
            if (!e.active) continue;
            const d = Math.hypot(e.x - this.x, e.y - this.y);
            if (d < bestD) { bestD = d; salvoTarget = e; }
        }
        if (!salvoTarget) {
            for (const ast of asteroidsForMissiles) {
                if (!ast.active) continue;
                const d = Math.hypot(ast.x - this.x, ast.y - this.y);
                if (d < bestD) { bestD = d; salvoTarget = ast; }
            }
        }
    }
    for (let i = this.activeMissiles.length - 1; i >= 0; i--) {
        const m = this.activeMissiles[i];
        m.life -= dt;
        if (m.life <= 0 || !m.active) {
            this.activeMissiles.splice(i, 1);
            continue;
        }

        // Re-acquire the shared salvo target if this missile's target died.
        if (!m.target || !m.target.active) {
            m.target = salvoTarget;
        }

        // Steer toward the target via smooth angle interpolation.
        if (m.target && m.target.active) {
            const dx = m.target.x - m.x;
            const dy = m.target.y - m.y;
            const targetAng = Math.atan2(dy, dx);
            const currentAng = Math.atan2(m.vel.y, m.vel.x);
            let diff = ((targetAng - currentAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            const turn = m.homingStrength || 0.18;
            const newAng = currentAng + diff * turn;
            const speed = m.speed || Math.hypot(m.vel.x, m.vel.y);
            m.vel.x = Math.cos(newAng) * speed;
            m.vel.y = Math.sin(newAng) * speed;
            m.angle = newAng;
        } else {
            m.angle = Math.atan2(m.vel.y, m.vel.x);
        }

        m.x += m.vel.x;
        m.y += m.vel.y;
    }

    // Update mines: arm → seek → magnetism → lifetime tick.
    //  • Once armed, a mine steers toward its current target (nearest
    //    enemy or asteroid), accelerating up to MINE_MAX_SPEED.
    //  • Magnetic pull on nearby entities still applies, so mines and
    //    their targets converge from both sides.
    //  • A separate `lifeTimer` ticks down from 12s; when it hits 0
    //    the mine auto-detonates (collision-system reads `mine.expired`
    //    and runs the same explosion as a proximity trigger).
    const MINE_MAX_SPEED = 1.4;
    const MINE_ACCEL = 0.06;       // velocity gain per frame toward target
    const MINE_TURN = 0.08;        // angular interpolation rate
    // 6.22.1 — infinite seek range. Previously capped at 360 px which
    // meant mines parked themselves in an empty corner of the map and
    // never moved. Now they always lock onto the nearest enemy/asteroid
    // regardless of distance; MAX_SPEED cap (1.4 px/frame) keeps them
    // creeping rather than zooming.
    const MINE_SIGHT = Infinity;
    const enemiesForMines = (this.gameEngine && this.gameEngine.enemyPool && this.gameEngine.enemyPool.activeObjects) || [];
    const asteroidsForMines = (this.gameEngine && this.gameEngine.asteroidPool && this.gameEngine.asteroidPool.activeObjects) || [];

    // 6.23.0 (2026-05-19) — Mine upgrade tier reads. Hoisted out of the
    //   per-mine loop because powerup stacks are player-global; sampling
    //   them once per frame keeps the cost constant regardless of how
    //   many mines are in play. The values are written onto each armed
    //   mine below so collision-system / combat-manager can read them
    //   without re-querying the player object.
    const mineShieldStacks  = this.getPowerupStacks('MINE_SHIELD_RADIUS') || 0;
    const mineMissilesOwned = this.getPowerupStacks('MINE_MISSILES') > 0;
    // 6.23.0 — Mines fire pulse bullets BY DEFAULT (no upgrade needed)
    //   on a fixed 800 ms cadence. MINE_MISSILES adds a homing missile
    //   every 2.5s on top of that. The old MINE_TURRET upgrade is gone —
    //   its behavior (alternating bullets/missiles) was folded into
    //   "default + MISSILES" so the upgrade tree is simpler.
    // Computed shield radius (0 when player has no stacks of the upgrade).
    const mineShieldRadius  = mineShieldStacks > 0 ? (120 + 50 * mineShieldStacks) : 0;
    // Live MINE_LAYER mine damage (config — pull once per frame).
    // Missiles spawned from mines deal mineDamage * 0.5 per design doc.
    const mineDamageBase = (POWER_WEAPONS && POWER_WEAPONS.MINE_LAYER)
        ? POWER_WEAPONS.MINE_LAYER.mineDamage : 3;
    // Pull MISSILE_SALVO config for the in-flight tuning constants
    // (speed, homing strength, lifetime, radius). Reuses the proven
    // values so mine-launched missiles look + steer identically to
    // salvo missiles. Per-missile damage is overridden below.
    const salvoConfig = (POWER_WEAPONS && POWER_WEAPONS.MISSILE_SALVO) || {
        missileSpeed: 4, missileHomingStrength: 0.18,
    };

    for (const mine of this.activeMines) {
        if (!mine.active) continue;

        // Arming
        if (mine.armTimer > 0) {
            mine.armTimer -= dt;
            if (mine.armTimer <= 0) mine.armed = true;
        }
        if (!mine.armed) continue;

        // 6.23.0 — Each frame, write the current shield radius onto
        //   the mine so combat-manager.getMineShieldMultiplier can read
        //   it directly. Re-evaluating per frame means selling/buying
        //   the upgrade mid-fight is reflected immediately on every
        //   live mine without needing a "respawn mines" pass.
        mine.shieldRadius = mineShieldRadius;

        // ── Self-detonation lifetime ──
        mine.lifeTimer -= dt;
        if (mine.lifeTimer <= 0) {
            // Flag for collision-system to explode it next frame.
            mine.expired = true;
        }

        // 6.23.0 — Mines are MOVING TURRETS by default. Every armed mine
        //   fires a non-homing pulse bullet at the nearest enemy on an
        //   800 ms cadence (the seek-and-move logic below handles target
        //   acquisition + steering). MINE_MISSILES adds a homing missile
        //   on top every 2.5 s — additive, not exclusive. Both timers
        //   tick independently per mine; small spawn-time stagger keeps
        //   multi-mine fire from being perfectly synced.
        if (mine.turretCooldown === undefined) {
            mine.turretCooldown = 800 + Math.random() * 200;
        }
        mine.turretCooldown -= dt;
        if (mine.turretCooldown <= 0) {
            mine.turretCooldown = 800;
            spawnMineTurretBullet.call(this, mine, mineDamageBase * 0.5);
        }
        if (mineMissilesOwned) {
            if (mine.missileCooldown === undefined) {
                mine.missileCooldown = 2500 + Math.random() * 400;
            }
            mine.missileCooldown -= dt;
            if (mine.missileCooldown <= 0) {
                mine.missileCooldown = 2500;
                spawnMineMissile.call(this, mine, mineDamageBase * 0.5, salvoConfig);
            }
        }

        // ── Acquire a target if we don't have one (or current died) ──
        if (!mine.target || !mine.target.active) {
            let bestDist = MINE_SIGHT, best = null;
            for (const e of enemiesForMines) {
                if (!e.active) continue;
                const d = Math.hypot(e.x - mine.x, e.y - mine.y);
                if (d < bestDist) { bestDist = d; best = e; }
            }
            for (const ast of asteroidsForMines) {
                if (!ast.active) continue;
                const d = Math.hypot(ast.x - mine.x, ast.y - mine.y);
                if (d < bestDist) { bestDist = d; best = ast; }
            }
            mine.target = best;
        }

        // ── Steer toward the target via smooth angle interpolation ──
        if (mine.target && mine.target.active) {
            const dx = mine.target.x - mine.x;
            const dy = mine.target.y - mine.y;
            const targetAng = Math.atan2(dy, dx);
            const currSpeed = Math.hypot(mine.vel.x, mine.vel.y);
            if (currSpeed < 0.001) {
                mine.vel.x = Math.cos(targetAng) * MINE_ACCEL;
                mine.vel.y = Math.sin(targetAng) * MINE_ACCEL;
            } else {
                const currentAng = Math.atan2(mine.vel.y, mine.vel.x);
                let diff = ((targetAng - currentAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
                const newAng = currentAng + diff * MINE_TURN;
                const newSpeed = Math.min(MINE_MAX_SPEED, currSpeed + MINE_ACCEL);
                mine.vel.x = Math.cos(newAng) * newSpeed;
                mine.vel.y = Math.sin(newAng) * newSpeed;
            }
        } else {
            // No target — drift, slow drag.
            mine.vel.x *= 0.95;
            mine.vel.y *= 0.95;
        }

        // Apply movement.
        mine.x += mine.vel.x;
        mine.y += mine.vel.y;

        // ── Magnetic pull on nearby entities (compounds with seek) ──
        const triggerR = mine.triggerRadius || 60;
        const pullR = triggerR * 1.8;
        for (const e of enemiesForMines) {
            if (!e.active || !e.vel) continue;
            const dx = mine.x - e.x;
            const dy = mine.y - e.y;
            const dist = Math.hypot(dx, dy);
            if (dist >= pullR || dist < 0.01) continue;
            const force = 0.45 * (1 - dist / pullR);
            e.vel.x += (dx / dist) * force;
            e.vel.y += (dy / dist) * force;
        }
        for (const ast of asteroidsForMines) {
            if (!ast.active || !ast.vel) continue;
            const dx = mine.x - ast.x;
            const dy = mine.y - ast.y;
            const dist = Math.hypot(dx, dy);
            if (dist >= pullR || dist < 0.01) continue;
            const force = 0.18 * (1 - dist / pullR);
            ast.vel.x += (dx / dist) * force;
            ast.vel.y += (dy / dist) * force;
        }
    }

    // Sentry drones — orbit the ship and auto-fire at the nearest enemy.
    if (this.sentryDrones.length > 0) {
        const cfg = ABILITIES.SENTRY_DRONE;
        const orbitRadius = cfg.orbitRadius;
        const orbitSpeed = 0.004;
        const rapid = this.getPowerupStacks('RAPID_DRONE');
        const fireInterval = cfg.fireInterval * Math.pow(0.75, rapid);
        const caliber = this.getPowerupStacks('DRONE_CALIBER');
        const dmg = cfg.droneDamage * (1 + caliber * 0.4);
        const enemies = (this.gameEngine && this.gameEngine.enemyPool && this.gameEngine.enemyPool.activeObjects) || [];
        for (const d of this.sentryDrones) {
            d.angle += orbitSpeed * (1000 / GAME_CONFIG.LOGIC_HZ);
            d.x = this.x + Math.cos(d.angle) * orbitRadius;
            d.y = this.y + Math.sin(d.angle) * orbitRadius;
            let target = null, bestD = Infinity;
            for (const e of enemies) {
                if (!e || !e.active || e.warping) continue;
                const dd = Math.hypot(e.x - d.x, e.y - d.y);
                if (dd < bestD) { bestD = dd; target = e; }
            }
            if (target) d.aimAngle = Math.atan2(target.y - d.y, target.x - d.x);
            d.fireTimer -= dt;
            if (target && d.fireTimer <= 0) {
                d.fireTimer = fireInterval;
                spawnSentryDroneBullet.call(this, d, dmg, cfg.droneRange);
            }
        }
    }

    // Update deflector orbs positions — orbit the player at a fixed
    // radius. checkDeflectorOrbCollisions() reads orb.x/orb.y.
    if (this.deflectorOrbs.length > 0) {
        const orbitSpeed = 0.003;
        const orbitRadius = 45;
        for (const orb of this.deflectorOrbs) {
            orb.angle += orbitSpeed * (1000 / GAME_CONFIG.LOGIC_HZ);
            orb.x = this.x + Math.cos(orb.angle) * orbitRadius;
            orb.y = this.y + Math.sin(orb.angle) * orbitRadius;
        }
    }

    // EMP pulse ring is a 500ms visual; clear the flag once it's faded so
    // the renderer stops drawing a zero-alpha arc.
    if (this.empPulseActive && Date.now() - (this.empPulseStartTime || 0) > 500) {
        this.empPulseActive = false;
    }
}

// ── Defense-ability loadout — equip / cycle / activate ─────────────────────
//
// Phase B.S1 — 4-slot model. `equippedAbilities[0..3]` is the source of truth;
// the legacy `activeAbility` accessor proxies slot 0 for back-compat. All
// defense abilities are FREE and selectable from the start (parallels the
// primary/power weapon model). Each function takes an optional `slot`
// (default 0) so the current single-slot input/HUD path keeps working until
// the S2 input phase wires up the other three slots.

export function getActiveAbilityConfig(slot = 0) {
    return ABILITIES[this.equippedAbilities[slot]] || null;
}

export function equipAbility(abilityId, slot = 0) {
    if (!ABILITIES[abilityId]) return false;
    this.equippedAbilities[slot] = abilityId;
    this.ownedAbilities.add(abilityId);
    return true;
}

export function cycleAbility(slot = 0) {
    const ids = Object.keys(ABILITIES);
    if (ids.length === 0) return false;
    const i = ids.indexOf(this.equippedAbilities[slot]);
    const next = ids[(i + 1) % ids.length];
    this.equippedAbilities[slot] = next;
    this.ownedAbilities.add(next);
    // Mirror E/R weapon-cycle behaviour: trigger HUD pulse + audio
    // ping so cycling abilities feels the same as cycling weapons.
    if (this.gameEngine) {
        if (typeof this.gameEngine.triggerWeaponCycleAnim === 'function') {
            this.gameEngine.triggerWeaponCycleAnim('ability');
        }
        if (this.gameEngine.events) this.gameEngine.events.emit('audio:coin');
    }
    return true;
}

// Maps ABILITIES id → audio MANIFEST sound name. 5.68.9 — was
// silent; each ability now plays its accent on activation.
// 5.93.0 — PHASE_DASH removed from defense abilities (now a SHIFT-key
// movement primitive). The `phaseDash` sound is still used — see
// Player._triggerDash, which plays it directly via audioManager.
const ABILITY_ACTIVATE_SOUND = {
    BULWARK:        'bulwark',
    FIELD_MEDIC:    'repairNanites', // reuse the heal chime
    DEFLECTOR_ORBS: 'deflectorOrbs',
    EMP_PULSE:      'empPulse',
};

export function activateAbility(slot = 0) {
    const abilityId = this.equippedAbilities[slot];
    if (!abilityId) return false;
    if (this.abilityCooldowns[slot] > 0) return false;

    const config = ABILITIES[abilityId];
    if (!config) return false;

    this.abilityCooldowns[slot] = config.cooldown;
    // 6.31.0 — stash the max so the ship-tip charge ring can show the
    // ability's auto-recharge fill.
    this.abilityCooldownsMax[slot] = config.cooldown;
    // FORTIFY / EXTENDED_CARE extend the active duration per stack.
    let duration = config.duration;
    if (abilityId === 'BULWARK') {
        duration += this.getPowerupStacks('FORTIFY') * 1000;
    }
    this.activeAbilityEffects.set(abilityId, {
        timeRemaining: duration,
    });

    // R6.1 — Field Medic: instant burst heal (% of max HP, +POTENCY) +
    // cleanse all player statuses (CHILL / CORRODE / BURN). The cleanse is
    // the unique verb no card/stat/gear can provide.
    if (abilityId === 'FIELD_MEDIC') {
        const pct = config.healPct + this.getPowerupStacks('POTENCY') * 0.10;
        const maxHp = this.getEffectiveMaxHealth();
        this.health = Math.min(maxHp, this.health + maxHp * pct);
        if (config.cleanse) cleansePlayerStatus(this);
    }

    // 6.x — Per-ability ON-ACTIVATE effects (previously DEFLECTOR_ORBS and
    // EMP_PULSE were placebos — they set the timer + sound but did
    // nothing). The collision / render / stun scaffolding already exists;
    // these wire the missing trigger.
    if (abilityId === 'DEFLECTOR_ORBS') {
        const orbCount = config.orbCount + this.getPowerupStacks('EXTRA_ORB');
        const hits = config.hitsPerOrb + this.getPowerupStacks('HARDENED_ORBS') * 2;
        this.deflectorOrbs = [];
        for (let i = 0; i < orbCount; i++) {
            const angle = (i / orbCount) * Math.PI * 2;
            this.deflectorOrbs.push({
                angle,
                x: this.x + Math.cos(angle) * 45,
                y: this.y + Math.sin(angle) * 45,
                hits,
                active: true,
            });
        }
    } else if (abilityId === 'EMP_PULSE') {
        this.empPulseActive = true;
        this.empPulseStartTime = Date.now();
        const ge = this.gameEngine;
        if (ge && ge.enemyPool && typeof ge.applyStun === 'function') {
            const radius = config.radius + this.getPowerupStacks('WIDE_BAND') * 60;
            for (const enemy of ge.enemyPool.activeObjects) {
                if (!enemy.active) continue;
                const dist = Math.hypot(enemy.x - this.x, enemy.y - this.y);
                if (dist <= radius) ge.applyStun(enemy, config.duration);
            }
        }
    } else if (abilityId === 'SENTRY_DRONE') {
        const count = config.droneCount + this.getPowerupStacks('EXTRA_DRONE');
        this.sentryDrones = [];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            this.sentryDrones.push({
                angle,
                x: this.x + Math.cos(angle) * config.orbitRadius,
                y: this.y + Math.sin(angle) * config.orbitRadius,
                aimAngle: angle,
                fireTimer: 0,
            });
        }
    } else if (abilityId === 'BLINK') {
        // R6.3 — instant teleport forward (clamped to the field) + i-frames.
        const d = config.blinkDist || 200;
        this.x += Math.cos(this.angle) * d;
        this.y += Math.sin(this.angle) * d;
        const gf = this.gameEngine && this.gameEngine.gameField;
        if (gf) {
            this.x = Math.max(0, Math.min(gf.width, this.x));
            this.y = Math.max(0, Math.min(gf.height, this.y));
        }
        if (typeof this.makeInvincible === 'function') this.makeInvincible(config.iFrameMs || 300);
    } else if (abilityId === 'GRAVITY_SNARE') {
        // R6.3 — yank nearby non-boss enemies inward (no closer than minDist).
        const ge2 = this.gameEngine;
        if (ge2 && ge2.enemyPool) {
            const r = config.radius || 300;
            const k = config.pullFactor || 0.5;
            const minD = config.minDist || 60;
            for (const enemy of ge2.enemyPool.activeObjects) {
                if (!enemy || !enemy.active || enemy.isBoss) continue;
                const dx = this.x - enemy.x, dy = this.y - enemy.y;
                const dist = Math.hypot(dx, dy);
                if (dist > minD && dist <= r) {
                    const pull = Math.min(dist - minD, dist * k);
                    enemy.x += (dx / dist) * pull;
                    enemy.y += (dy / dist) * pull;
                }
            }
        }
    } else if (abilityId === 'DESIGNATOR') {
        // R6.3 — MARK every enemy in range (homing-priority + crit + loot).
        const ge3 = this.gameEngine;
        if (ge3 && ge3.enemyPool && typeof ge3.applyMark === 'function') {
            const r = config.radius || 350;
            for (const enemy of ge3.enemyPool.activeObjects) {
                if (!enemy || !enemy.active) continue;
                if (Math.hypot(enemy.x - this.x, enemy.y - this.y) <= r) {
                    ge3.applyMark(enemy, config.markMs || 6000);
                }
            }
        }
    } else if (abilityId === 'SECOND_WIND') {
        // R6.3 — arm a one-time death save; consumed in handlePlayerDeath.
        this._secondWindArmed = true;
    } else if (abilityId === 'ELEMENTAL_INFUSION') {
        // R6.3 — cycle the loadout's on-hit element. The activeAbilityEffects
        // entry (set above) tracks the duration; weapons.js reads
        // _infusedElement while ELEMENTAL_INFUSION is active.
        const els = config.elements || ['PYRO'];
        this._infusionIndex = (this._infusionIndex == null) ? 0 : (this._infusionIndex + 1) % els.length;
        this._infusedElement = els[this._infusionIndex];
    }

    // Play the per-ability activation sound (5.68.9). Falls back to the
    // generic shield sound if a specific clip isn't registered.
    const ge = this.gameEngine;
    if (ge && ge.audioManager) {
        const soundName = ABILITY_ACTIVATE_SOUND[abilityId];
        if (!soundName || !ge.audioManager.playSound(soundName)) {
            ge.audioManager.playSound('shield');
        }
    }
    return true;
}

// ── Ability cooldowns ───────────────────────────────────────────────────────

export function updateAbilityCooldowns(dt) {
    // Phase B.S1 — decay all 4 slot cooldowns (slot 0 is also reachable via
    // the legacy activeAbilityCooldown accessor, but we write the array
    // directly to cover every slot uniformly).
    for (let i = 0; i < this.abilityCooldowns.length; i++) {
        if (this.abilityCooldowns[i] > 0) {
            this.abilityCooldowns[i] = Math.max(0, this.abilityCooldowns[i] - dt);
        }
    }

    // Update power weapon cooldown
    if (this.powerCooldown > 0) {
        this.powerCooldown = Math.max(0, this.powerCooldown - dt);
    }

    // OVERDRIVE primary-buff timer (set by activateOverdrive).
    if (this.overdriveTimer > 0) {
        this.overdriveTimer = Math.max(0, this.overdriveTimer - dt);
    }

    // 5.93.0 — dash cooldown (SHIFT-key core movement primitive).
    // Decays each frame independently of the defense-ability cooldown so
    // dashing doesn't interfere with the activeAbility cycle.
    if (this.dashCooldown > 0) {
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    }

    // Update active ability effects
    for (const [abilityId, effect] of this.activeAbilityEffects) {
        effect.timeRemaining -= dt;
        if (effect.timeRemaining <= 0) {
            this.activeAbilityEffects.delete(abilityId);
            if (abilityId === 'BULWARK') this.bulwarkActive = false;
            if (abilityId === 'FIELD_MEDIC') this.regenActive = false;
            if (abilityId === 'DEFLECTOR_ORBS') this.deflectorOrbs = [];
            if (abilityId === 'TRACTOR_SHIELD') this.tractorShieldActive = false;
            if (abilityId === 'SENTRY_DRONE') this.sentryDrones = [];
        }
    }
}

// ── 6.23.0 (2026-05-19) — Mine projectile launcher helpers ────────────────
//
// Default armed-mine behavior: spawnMineTurretBullet on a fixed 800 ms
// cadence — non-homing pulse bullets at the nearest enemy. MINE_MISSILES
// upgrade ADDS spawnMineMissile every 2.5s on top (homing seekers via the
// existing activeMissiles pipeline). Both helpers are .call()'d with
// `this = Player`. Turret bullets ride the shared bulletPool; missiles
// reuse the MISSILE_SALVO homing/collision pipeline. Mine-spawned
// projectiles tag `shooter = mine` so the collision pipeline skips the
// player.
//
// Missiles ride the player's existing `activeMissiles` system (same homing
// + collision pipeline as the MISSILE_SALVO power weapon). Per-missile
// `damage` is set on the missile and respected by collision-system.
// Turret bullets are plain straight-line projectiles spawned via the
// shared bulletPool — homing is intentionally OFF so the mine acts as a
// stationary turret rather than a wave of seekers. The bullet's
// `shooter = mine` reference lets the collision pipeline skip the player.

function _findNearestEnemyFromMine(mine, enemies) {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
        if (!e || !e.active) continue;
        const d = Math.hypot(e.x - mine.x, e.y - mine.y);
        if (d < bestD) { bestD = d; best = e; }
    }
    return best;
}

export function spawnMineMissile(mine, damage, salvoConfig) {
    if (!this.activeMissiles) return;
    const enemies = (this.gameEngine && this.gameEngine.enemyPool
        && this.gameEngine.enemyPool.activeObjects) || [];
    const target = _findNearestEnemyFromMine(mine, enemies);
    if (!target) return; // No valid target — skip this fire (timer still resets above).

    const speed = (salvoConfig && salvoConfig.missileSpeed) || 4;
    const homingStrength = (salvoConfig && salvoConfig.missileHomingStrength) || 0.18;

    // Launch angle aimed at the target so the missile reads as a
    // directed shot from the mine, not a stationary spawn that pivots.
    const dx = target.x - mine.x;
    const dy = target.y - mine.y;
    const ang = Math.atan2(dy, dx);
    this.activeMissiles.push({
        x: mine.x,
        y: mine.y,
        vel: { x: Math.cos(ang) * speed, y: Math.sin(ang) * speed },
        angle: ang,
        damage: damage,
        homingStrength: homingStrength,
        cluster: false,
        life: 3000,
        maxLife: 3000,
        radius: 5,
        target: target,
        active: true,
        speed: speed,
        // Tag — collision-system reads `missile.shooter` to skip
        //   self-damage. Set to mine so missiles can't hit the player.
        shooter: mine,
        // 6.23.0 — Mark as mine-launched so per-FX scaling could use it.
        fromMine: true,
    });

    // Small puff at the launch position so the spawn reads as an
    // ejection rather than a teleport.
    if (this.gameEngine && this.gameEngine.particlePool) {
        const pp = this.gameEngine.particlePool;
        for (let i = 0; i < 4; i++) {
            const p = pp.get(mine.x, mine.y, 'starSparkle');
            if (!p) continue;
            const a = ang + (Math.random() - 0.5) * 1.2;
            const sp = 1.0 + Math.random() * 1.6;
            p.vel.x = Math.cos(a) * sp;
            p.vel.y = Math.sin(a) * sp;
            p.color = '#ffaa66';
            p.radius = 1.2 + Math.random() * 1.4;
            p.life = 14 + Math.random() * 8;
            p.friction = 0.92;
        }
    }
}

export function spawnMineTurretBullet(mine, damage) {
    const ge = this.gameEngine;
    if (!ge || !ge.bulletPool) return;
    const enemies = (ge.enemyPool && ge.enemyPool.activeObjects) || [];
    const target = _findNearestEnemyFromMine(mine, enemies);
    if (!target) return;

    const dx = target.x - mine.x;
    const dy = target.y - mine.y;
    const ang = Math.atan2(dy, dx);

    // Reuse the player bullet pool. Bullet.reset() applies a small
    // forward offset from `mine.x/y` so the bullet visually emerges from
    // the mine body rather than its center.
    const bullet = ge.bulletPool.get(mine.x, mine.y, ang);
    if (!bullet) return;
    bullet.damage = damage;
    // Straight shot — no homing, no piercing, no AoE. Turret bullets
    //   are meant to read as a steady drumbeat of fire rather than a
    //   guided salvo (those are MINE_MISSILES).
    bullet.homing = false;
    bullet.piercing = 0;
    bullet.explosive = false;
    bullet.rangeMultiplier = 0.7; // Shorter range than player shots.
    // Collision-system skip-self tag.
    bullet.shooter = mine;
    bullet.fromMine = true;
    // Smaller render radius so turret rounds visually distinguish from
    //   the player's primary fire.
    bullet.baseRadius = 3;
    bullet.radius = 3;

    if (ge.particlePool) {
        const pp = ge.particlePool;
        for (let i = 0; i < 3; i++) {
            const p = pp.get(mine.x, mine.y, 'starSparkle');
            if (!p) continue;
            const a = ang + (Math.random() - 0.5) * 0.6;
            const sp = 0.8 + Math.random() * 1.2;
            p.vel.x = Math.cos(a) * sp;
            p.vel.y = Math.sin(a) * sp;
            p.color = '#ffcc66';
            p.radius = 0.9 + Math.random() * 1.1;
            p.life = 10 + Math.random() * 6;
            p.friction = 0.92;
        }
    }
}

// Sentry Drone fire — straight shot at the drone's current aim. Allied
// bullet via the player bullet pool, tagged with `shooter` so the collision
// system skips the player. Mirrors spawnMineTurretBullet.
export function spawnSentryDroneBullet(drone, damage, rangeMul) {
    const ge = this.gameEngine;
    if (!ge || !ge.bulletPool) return;
    const ang = drone.aimAngle || 0;
    const bullet = ge.bulletPool.get(drone.x, drone.y, ang);
    if (!bullet) return;
    bullet.damage = damage;
    bullet.homing = false;
    bullet.piercing = 0;
    bullet.explosive = false;
    bullet.rangeMultiplier = rangeMul || 0.7;
    bullet.shooter = drone;
    bullet.fromSentry = true;
    bullet.color = '#ffcc88';
    bullet.baseRadius = 3;
    bullet.radius = 3;
    if (ge.particlePool) {
        const pp = ge.particlePool;
        for (let i = 0; i < 2; i++) {
            const p = pp.get(drone.x, drone.y, 'starSparkle');
            if (!p) continue;
            const a = ang + (Math.random() - 0.5) * 0.5;
            const sp = 0.8 + Math.random() * 1.0;
            p.vel.x = Math.cos(a) * sp;
            p.vel.y = Math.sin(a) * sp;
            p.color = '#ffcc88';
            p.radius = 0.8 + Math.random();
            p.life = 8 + Math.random() * 5;
            p.friction = 0.92;
        }
    }
}
