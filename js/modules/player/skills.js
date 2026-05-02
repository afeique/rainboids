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

    // Update lightning chains visual timer
    for (let i = this.lightningChains.length - 1; i >= 0; i--) {
        this.lightningChains[i].timer -= dt;
        if (this.lightningChains[i].timer <= 0) {
            this.lightningChains.splice(i, 1);
        }
    }

    // Update missiles — always-on homing seeks the nearest active
    // target (enemies preferred, asteroids as fallback). Each missile
    // re-acquires when its target dies/inactivates. Steering uses
    // smooth angular interpolation so rotation reads naturally.
    const enemies = (this.gameEngine && this.gameEngine.enemyPool && this.gameEngine.enemyPool.activeObjects) || [];
    const asteroidsForMissiles = (this.gameEngine && this.gameEngine.asteroidPool && this.gameEngine.asteroidPool.activeObjects) || [];
    for (let i = this.activeMissiles.length - 1; i >= 0; i--) {
        const m = this.activeMissiles[i];
        m.life -= dt;
        if (m.life <= 0 || !m.active) {
            this.activeMissiles.splice(i, 1);
            continue;
        }

        // (Re-)acquire target if needed. Prefer enemies; if none in
        // sight, fall back to nearest asteroid so missiles still do
        // something useful.
        if (!m.target || !m.target.active) {
            let bestDist = Infinity, best = null;
            for (const e of enemies) {
                if (!e.active) continue;
                const d = Math.hypot(e.x - m.x, e.y - m.y);
                if (d < bestDist) { bestDist = d; best = e; }
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

    // Update mines: arm timer + magnetism. All mines are magnetic by
    // default — once armed they pull nearby enemies and asteroids
    // toward themselves so things actually walk into the trigger ring.
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

        // Magnetic pull radius scales with the mine's trigger radius so
        // BLAST_RADIUS investments pull from further out too. Force is
        // proportional to (1 - dist/pullR), so close-by entities feel a
        // strong tug while edge-of-range ones drift in slowly.
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
            // Asteroids are heavier — gentler pull so they don't snap
            // into the mine instantly.
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

// ── Skill purchase & assignment ───────────────────────────────────────────

export function buySkill(skillId) {
    if (DEFENSE_SKILLS[skillId] && !this.ownedSkills.has(skillId)) {
        this.ownedSkills.add(skillId);
        // Auto-assign to first empty slot
        for (let i = 0; i < 4; i++) {
            if (!this.skillSlots[i]) {
                this.skillSlots[i] = skillId;
                break;
            }
        }
        return true;
    }
    return false;
}

export function assignSkillToSlot(skillId, slotIndex) {
    if (slotIndex < 0 || slotIndex > 3) return false;
    if (!this.ownedSkills.has(skillId)) return false;
    // Remove from any existing slot
    for (let i = 0; i < 4; i++) {
        if (this.skillSlots[i] === skillId) this.skillSlots[i] = null;
    }
    this.skillSlots[slotIndex] = skillId;
    return true;
}

export function activateSkill(slotIndex) {
    if (slotIndex < 0 || slotIndex > 3) return false;
    const skillId = this.skillSlots[slotIndex];
    if (!skillId) return false;
    if (this.skillCooldowns[slotIndex] > 0) return false;

    const config = DEFENSE_SKILLS[skillId];
    if (!config) return false;

    // Start cooldown
    this.skillCooldowns[slotIndex] = config.cooldown;

    // Activate effect
    this.activeSkillEffects.set(skillId, {
        timeRemaining: config.duration,
        slotIndex,
    });

    return true;
}

// ── Skill cooldowns ───────────────────────────────────────────────────────

export function updateSkillCooldowns(dt) {
    for (let i = 0; i < 4; i++) {
        if (this.skillCooldowns[i] > 0) {
            this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);
        }
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
            // Clean up specific effects
            if (skillId === 'BULWARK') this.bulwarkActive = false;
            if (skillId === 'REPAIR_NANITES') this.regenActive = false;
            if (skillId === 'DEFLECTOR_ORBS') this.deflectorOrbs = [];
            if (skillId === 'TRACTOR_SHIELD') this.tractorShieldActive = false;
        }
    }
}
