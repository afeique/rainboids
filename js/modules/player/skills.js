// Player skill system — extracted from Player class
// All functions are called with .call(this) so `this` refers to the Player instance.

import { GAME_CONFIG } from '../core/constants.js';
import { DEFENSE_SKILLS } from '../combat/weapon-data.js';

// ── Active skill updates ──────────────────────────────────────────────────

export function updateActiveSkills(dt) {
    // Repair nanites: heal over time
    if (this.activeSkillEffects.has('REPAIR_NANITES')) {
        const config = DEFENSE_SKILLS.REPAIR_NANITES;
        const potencyStacks = this.getPowerupStacks('POTENCY');
        const hps = config.healPerSecond + potencyStacks;
        const healThisTick = hps * (dt / 1000);
        this.health = Math.min(this.getEffectiveMaxHealth(), this.health + healThisTick);
    }

    // Bulwark: set flag for damage reduction
    this.bulwarkActive = this.activeSkillEffects.has('BULWARK');

    // Tractor shield: set flag
    this.tractorShieldActive = this.activeSkillEffects.has('TRACTOR_SHIELD');
    if (this.tractorShieldActive) {
        this.tractorShieldAngle = this.angle;
    }

    // Phase dash
    if (this.isDashing) {
        this.dashTimer -= dt;
        this.x += this.dashVelX * (dt / 1000);
        this.y += this.dashVelY * (dt / 1000);
        if (this.dashTimer <= 0) {
            this.isDashing = false;
            this.invulnerable = false;
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
    // Targets currently held by *other* live missiles — used to spread
    // re-acquisition across distinct threats instead of stacking on the
    // nearest one. Built once per frame.
    const claimedTargets = new Set();
    for (const om of this.activeMissiles) {
        if (om.active && om.target && om.target.active) claimedTargets.add(om.target);
    }
    for (let i = this.activeMissiles.length - 1; i >= 0; i--) {
        const m = this.activeMissiles[i];
        m.life -= dt;
        if (m.life <= 0 || !m.active) {
            this.activeMissiles.splice(i, 1);
            continue;
        }

        // (Re-)acquire target if needed. First pass prefers enemies that
        // no other missile has claimed; if every enemy is taken, allow
        // duplicates; if no enemies at all, fall back to asteroids
        // (also de-duped first).
        if (!m.target || !m.target.active) {
            let bestDist = Infinity, best = null;
            for (const e of enemies) {
                if (!e.active || claimedTargets.has(e)) continue;
                const d = Math.hypot(e.x - m.x, e.y - m.y);
                if (d < bestDist) { bestDist = d; best = e; }
            }
            if (!best) {
                bestDist = Infinity;
                for (const e of enemies) {
                    if (!e.active) continue;
                    const d = Math.hypot(e.x - m.x, e.y - m.y);
                    if (d < bestDist) { bestDist = d; best = e; }
                }
            }
            if (!best) {
                bestDist = Infinity;
                for (const ast of asteroidsForMissiles) {
                    if (!ast.active || claimedTargets.has(ast)) continue;
                    const d = Math.hypot(ast.x - m.x, ast.y - m.y);
                    if (d < bestDist) { bestDist = d; best = ast; }
                }
            }
            if (!best) {
                bestDist = Infinity;
                for (const ast of asteroidsForMissiles) {
                    if (!ast.active) continue;
                    const d = Math.hypot(ast.x - m.x, ast.y - m.y);
                    if (d < bestDist) { bestDist = d; best = ast; }
                }
            }
            m.target = best;
            if (best) claimedTargets.add(best);
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
    const MINE_SIGHT = 360;        // px — only seek targets inside this
    const enemiesForMines = (this.gameEngine && this.gameEngine.enemyPool && this.gameEngine.enemyPool.activeObjects) || [];
    const asteroidsForMines = (this.gameEngine && this.gameEngine.asteroidPool && this.gameEngine.asteroidPool.activeObjects) || [];
    for (const mine of this.activeMines) {
        if (!mine.active) continue;

        // Arming
        if (mine.armTimer > 0) {
            mine.armTimer -= dt;
            if (mine.armTimer <= 0) mine.armed = true;
        }
        if (!mine.armed) continue;

        // ── Self-detonation lifetime ──
        mine.lifeTimer -= dt;
        if (mine.lifeTimer <= 0) {
            // Flag for collision-system to explode it next frame.
            mine.expired = true;
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

    // Update deflector orbs positions
    if (this.deflectorOrbs.length > 0) {
        const orbitSpeed = 0.003;
        for (const orb of this.deflectorOrbs) {
            orb.angle += orbitSpeed * (1000 / GAME_CONFIG.LOGIC_HZ);
        }
    }
}

// ── Single equipped skill — equip / cycle / activate (5.64.11) ───────────
//
// All defense skills are FREE and selectable from the start (parallels
// the primary/power weapon model). The player has ONE active skill at
// any time; SHIFT (tap) cycles to the next skill in DEFENSE_SKILLS,
// SPACE activates the equipped skill (subject to cooldown).

export function getActiveSkillConfig() {
    return DEFENSE_SKILLS[this.activeSkill] || null;
}

export function equipSkill(skillId) {
    if (!DEFENSE_SKILLS[skillId]) return false;
    this.activeSkill = skillId;
    this.ownedSkills.add(skillId);
    return true;
}

export function cycleSkill() {
    const ids = Object.keys(DEFENSE_SKILLS);
    if (ids.length === 0) return false;
    const i = ids.indexOf(this.activeSkill);
    const next = ids[(i + 1) % ids.length];
    this.activeSkill = next;
    this.ownedSkills.add(next);
    // Mirror E/R weapon-cycle behaviour: trigger HUD pulse + audio
    // ping so cycling skills feels the same as cycling weapons.
    if (this.gameEngine) {
        if (typeof this.gameEngine.triggerWeaponCycleAnim === 'function') {
            this.gameEngine.triggerWeaponCycleAnim('skill');
        }
        if (this.gameEngine.events) this.gameEngine.events.emit('audio:coin');
    }
    return true;
}

// Maps DEFENSE_SKILLS id → audio MANIFEST sound name. 5.68.9 — was
// silent; each skill now plays its accent on activation.
const SKILL_ACTIVATE_SOUND = {
    BULWARK:        'bulwark',
    REPAIR_NANITES: 'repairNanites',
    PHASE_DASH:     'phaseDash',
    DEFLECTOR_ORBS: 'deflectorOrbs',
    EMP_PULSE:      'empPulse',
    TRACTOR_SHIELD: 'tractorShield',
};

export function activateSkill() {
    const skillId = this.activeSkill;
    if (!skillId) return false;
    if (this.activeSkillCooldown > 0) return false;

    const config = DEFENSE_SKILLS[skillId];
    if (!config) return false;

    this.activeSkillCooldown = config.cooldown;
    this.activeSkillEffects.set(skillId, {
        timeRemaining: config.duration,
    });

    // Play the per-skill activation sound (5.68.9). Falls back to the
    // generic shield sound if a specific clip isn't registered.
    const ge = this.gameEngine;
    if (ge && ge.audioManager) {
        const soundName = SKILL_ACTIVATE_SOUND[skillId];
        if (!soundName || !ge.audioManager.playSound(soundName)) {
            ge.audioManager.playSound('shield');
        }
    }
    return true;
}

// ── Skill cooldowns ───────────────────────────────────────────────────────

export function updateSkillCooldowns(dt) {
    if (this.activeSkillCooldown > 0) {
        this.activeSkillCooldown = Math.max(0, this.activeSkillCooldown - dt);
    }

    // Update power weapon cooldown
    if (this.powerCooldown > 0) {
        this.powerCooldown = Math.max(0, this.powerCooldown - dt);
    }

    // Update active skill effects
    for (const [skillId, effect] of this.activeSkillEffects) {
        effect.timeRemaining -= dt;
        if (effect.timeRemaining <= 0) {
            this.activeSkillEffects.delete(skillId);
            if (skillId === 'BULWARK') this.bulwarkActive = false;
            if (skillId === 'REPAIR_NANITES') this.regenActive = false;
            if (skillId === 'DEFLECTOR_ORBS') this.deflectorOrbs = [];
            if (skillId === 'TRACTOR_SHIELD') this.tractorShieldActive = false;
        }
    }
}
