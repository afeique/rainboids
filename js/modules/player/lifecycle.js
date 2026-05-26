// Player damage, tank consumption, and game-over.
//
// 6.1.1 — healthTanks ∈ [0, MAX_HEALTH_TANKS=3] is the SPARE count.
// Each triangle = 1 spare. The healthbar represents the *active* tank
// (the implicit "+1"). Total effective tanks = healthTanks + 1,
// capped at 4 (3 triangle slots + active healthbar). Player STARTS
// with healthTanks=1 (engine init) so the overflow → +1 spare
// mechanic has somewhere to go from move 1 — earns up to 2 more spares
// via overflow healing (taking the triforce from 1 → 2 → 3 triangles
// over the course of a run).
//
// Previously (6.1.0 and earlier): started at 3 with cap 3 → already
// at cap → overflow inert. Fixed by lowering the starting count.
//   - Hits reduce HP. When HP hits 0:
//       * spares > 0: consume one spare → vaporize a triangle (top →
//         btm-right → btm-left in that loss order), refill HP, keep
//         playing. No respawn delay, no automatic invincibility.
//       * spares == 0: game over.
//   - Health pickups heal HP normally; overflow accumulates into a
//     hidden `_tankProgress` counter; each full max-HP-worth of
//     overflow grants +1 spare, capped at 3.
//
// Defense abilities / movement primitives that grant deliberate invuln
// (LAST_STAND, REFLEXES, the SHIFT-key dash burst, wave-start grace)
// still call makeInvincible or rely on player.isDashIFrameActive() —
// those are active-ability windows, not damage-aftermath grace.
// (5.93.0 — PHASE_DASH was promoted from a defense ability to the
// SHIFT-key core movement primitive; its i-frames now live in
// player.isDashIFrameActive(), checked at the collision sites.)

import { GAME_STATES, WAVES_PER_STAGE } from '../core/constants.js';
import { random } from '../core/utils.js';
import { isMobile } from '../platform/platform-detect.js';
import { frameClock } from '../core/frame-clock.js';
import { applyPlayerStatus, playerCorrodeMult } from './player-status.js';
import { getDifficulty } from '../wave/difficulty-director.js';

// RUN-05a — Adaptive Difficulty Director threat axis (D_thr) read helper.
// Returns the active D_thr multiplier for incoming player damage, defaulting to
// 1.0 whenever no director exists (existing tests/saves are unaffected). `ctx`
// is the engine context (`this` in takeDamage), where the director lives on
// ctx.game.difficultyDirector. Baseline is first-pass; the director's own
// [0.6,1.8] clamp + cold-start bound the risk (RUN-07 calibrates).
function directorThreatMult(ctx) {
    const dir = ctx && ctx.game && ctx.game.difficultyDirector;
    if (!dir || !dir.cfg) return 1;
    const d = getDifficulty(dir).D_thr;
    return Number.isFinite(d) && d > 0 ? d : 1;
}

// 6.1.1 — Cap stays at 3 (matches the visible triforce HUD slots).
// The starting count was lowered from 3 → 1 in game-engine.js so the
// overflow → +1 spare mechanic actually fires (was inert when the
// player started at the cap). See the updated module header comment.
export const MAX_HEALTH_TANKS = 3;

// 5.98.0 — Mobile early-game damage-taken multiplier. The stationary
// ship + finger-only aim model makes the first few waves brutal on
// mobile; pair it with the early-wave OUTGOING damage ramp from 5.97
// so the asymmetry doesn't just go one direction. Multiplier applied
// AFTER shield reduction, so SHIELD_BOOST upgrades still scale on top.
//   Wave 1: 25% incoming damage     Wave 4: 65%
//   Wave 2: 35%                     Wave 5: 80%
//   Wave 3: 50%                     Wave 6+: 100% (no reduction)
function getMobileIncomingDamageMultiplier(wave) {
    if (!isMobile()) return 1;
    const w = Math.max(1, wave | 0);
    if (w >= 6) return 1;
    const table = [0.25, 0.35, 0.50, 0.65, 0.80, 1.0];
    return table[w - 1] || 1;
}

// E5 — player elemental-resistance multiplier. `getElementResist` (player.js)
// sums the per-element item resist affixes (E7) as a fraction; clamp to
// [0, 0.9] so gear can't grant full immunity and a (future) negative roll
// can't amplify. Returns the damage multiplier (1 = no resist). Exported for
// unit tests; applied in takeDamage after the shield reduction.
export function playerElementResistMult(player, element) {
    if (!player || !element || typeof player.getElementResist !== 'function') return 1;
    const r = player.getElementResist(element) || 0;
    return 1 - Math.min(0.9, Math.max(0, r));
}

// 6.x — SINGLE player-damage pipeline. Previously the three collision
// sites (player↔enemy, player↔enemy-bullet, player↔asteroid) each
// inlined their own `player.health -= …`, bypassing this function
// entirely — so DODGE, REFLEXES, the mobile damage multiplier,
// STATIC_FIELD, LAST_STAND, and the `_lastDamageAt` regen gate never
// applied to actual gameplay damage (this fn had ZERO callers). They now
// all route here. opts:
//   source : the colliding enemy / bullet / asteroid (for Thorns)
//   fxX/fxY: impact point for the hit FX (defaults to the player)
// Returns the final (post-reduction, rounded) damage dealt — 0 if the
// hit was dodged / i-framed / invincible — so callers can scale their
// own screen-shake / bounce off it.

// A.E9-S1b — shared lethal-damage resolution (extracted from takeDamage):
// guardian save → last-stand → energy tank → death. Returns the dealt amount.
// Called by both takeDamage and the player-burn DoT path so both honor the same
// save pipeline. `this` is the engine context.
function _resolvePlayerLethal(finalDamage) {
    if (typeof this.tryConsumeGuardian === 'function' && this.tryConsumeGuardian()) {
        return finalDamage;
    }
    const lastStandStacks = this.player.getPowerupStacks ? this.player.getPowerupStacks('LAST_STAND') : 0;
    if (lastStandStacks > 0 && !this.player._lastStandUsed) {
        this.player._lastStandUsed = true;
        this.player.health = 1;
        this.player.makeInvincible(2500);
        if (typeof this.events?.emit === 'function') {
            this.events.emit('ui:show-message', { title: 'LAST STAND', subtitle: 'Saved at 1 HP', duration: 1600 });
            this.events.emit('audio:powerup');
            this.events.emit('audio:player-explosion');
        }
        if (this.particlePool) {
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2;
                const p = this.particlePool.get(this.player.x, this.player.y, 'explosion');
                if (p) { p.color = '#ff4444'; p.vel.x = Math.cos(a) * 5; p.vel.y = Math.sin(a) * 5; }
            }
        }
        return finalDamage;
    }
    if (this.healthTanks > 0) {
        this._consumeTank();
        return finalDamage;
    }
    this.handlePlayerDeath();
    return finalDamage;
}

// P6 — Guardian Echo knockback nova: shove every enemy within radius directly
// away from the player. Pure geometry (no engine refs) so it unit-tests
// cleanly; the takeDamage call site owns the trigger threshold + the ring FX.
// A degenerate (overlapping) enemy is shoved straight right so it never sticks.
export const GUARDIAN_ECHO_RADIUS = 200;
export const GUARDIAN_ECHO_SHOVE = 70;
export function guardianEchoNova(player, enemies) {
    if (!player || !enemies) return 0;
    let shoved = 0;
    for (const e of enemies) {
        if (!e || !e.active) continue;
        const dx = e.x - player.x, dy = e.y - player.y;
        const d = Math.hypot(dx, dy);
        if (d > GUARDIAN_ECHO_RADIUS) continue;
        const ux = d > 0.0001 ? dx / d : 1;
        const uy = d > 0.0001 ? dy / d : 0;
        e.x += ux * GUARDIAN_ECHO_SHOVE;
        e.y += uy * GUARDIAN_ECHO_SHOVE;
        shoved++;
    }
    return shoved;
}

// P6 — Backlash passive: a successful dodge retaliates against the attacker.
// Pure resolver — given the hit's `source` (an enemy, an enemy bullet, or an
// asteroid), return the live enemy to strike: a bullet retaliates against its
// `shooter`, everything else against itself. The takeDamage dodge path applies
// the actual hit via the engine's damageEnemy. (Implemented as a direct strike
// rather than a spawned projectile — lifecycle has no player bullet-pool ref —
// which captures the "punish the attacker on a dodge" mechanic cleanly.)
export const BACKLASH_DAMAGE = 12;
export function backlashTarget(source) {
    if (!source) return null;
    const atk = source.shooter || source;
    return (atk && atk.active) ? atk : null;
}

// CD-10 — Bloodshield soak. Pure resolver so the buffer math unit-tests cleanly
// without the engine `this`. Given a player-like (with a numeric `bloodshield`)
// and the finalized incoming `dmg`, drain the buffer first: it absorbs
// min(buffer, dmg), and only the remainder is the amount that should hit HP.
// MUTATES player.bloodshield (the live buffer). Returns
// `{ dmg, absorbed }` where `dmg` is the post-soak to-HP amount.
// Default-safe: a 0/absent buffer absorbs nothing → dmg is returned unchanged.
export function applyBloodshieldSoak(player, dmg) {
    const buf = (player && player.bloodshield) || 0;
    if (!(buf > 0) || !(dmg > 0)) return { dmg, absorbed: 0 };
    const absorbed = Math.min(buf, dmg);
    player.bloodshield = buf - absorbed;
    return { dmg: dmg - absorbed, absorbed };
}

export function takeDamage(damageAmount = this.baseDamage, opts = {}) {
    if (this.player.invincible) return 0;

    // PHASE_DASH i-frames zero the hit entirely (dash-through). Was only
    // honored at the enemy / enemy-bullet sites; asteroid collisions
    // ignored it — now uniform.
    if (this.player.isDashIFrameActive && this.player.isDashIFrameActive()) return 0;

    // A.E9-S1b — PLAYER BURN tick. A DoT that was already mitigated when first
    // applied, so it BYPASSES dodge / reflexes / shield / resist / corrode, but
    // still respects invuln (handled above) and runs the shared death pipeline
    // so a burn can be lethal safely. No thorns/retaliation/status re-apply.
    if (opts.isPlayerBurn) {
        const burnDmg = Math.max(0, Math.round(damageAmount));
        if (burnDmg <= 0) return 0;
        this.player.health = Math.max(0, this.player.health - burnDmg);
        this.player._lastDamageAt = Date.now();
        if (this.game && this.game.stats) this.game.stats.totalDamageTaken += burnDmg;
        if (this.player.health <= 0) return _resolvePlayerLethal.call(this, burnDmg);
        return burnDmg;
    }

    // 6.28.0 — DODGE: flat % chance to ignore a hit entirely. Rolls
    // before REFLEXES so a lucky dodge doesn't burn the 30s REFLEXES
    // free-dodge cooldown. 6.32.0 — chance = passive stacks (5%/stack)
    // + item dodge affixes (rolled %), capped at 50%.
    const dodgeStacks = this.player.getPowerupStacks ? this.player.getPowerupStacks('DODGE') : 0;
    const itemDodge = this.player.getItemAffixTotal ? this.player.getItemAffixTotal('dodge') : 0;
    const spDodge = this.player.getSpStatValue ? this.player.getSpStatValue('DODGE') : 0;
    // P6 — Last Bastion passive: +20% dodge while below 30% max HP.
    let passiveDodge = 0;
    if (this.player.hasPassive && this.player.hasPassive('LAST_BASTION')) {
        const maxHp = (typeof this.player.getEffectiveMaxHealth === 'function')
            ? this.player.getEffectiveMaxHealth() : this.player.maxHealth;
        if (maxHp > 0 && this.player.health <= maxHp * 0.30) passiveDodge = 0.20;
    }
    const dodgeChance = Math.min(0.5, dodgeStacks * 0.05 + (itemDodge + spDodge) / 100 + passiveDodge);
    if (dodgeChance > 0 && Math.random() < dodgeChance) {
        if (typeof this.events?.emit === 'function') this.events.emit('audio:shield');
        // P6 — Backlash: a dodge retaliates with a strike at the attacker.
        if (this.player.hasPassive && this.player.hasPassive('BACKLASH')
            && typeof this.damageEnemy === 'function') {
            const atk = backlashTarget(opts.source);
            if (atk) this.damageEnemy(atk, BACKLASH_DAMAGE);
        }
        return;
    }

    // 5.75.0 — REFLEXES: one free dodge per 30s.
    if (this.player.getPowerupStacks && this.player.getPowerupStacks('REFLEXES') > 0) {
        const now = Date.now();
        if (!this.player._reflexesReadyAt || now >= this.player._reflexesReadyAt) {
            this.player._reflexesReadyAt = now + 30000;
            this.player.makeInvincible(700);
            if (typeof this.events?.emit === 'function') this.events.emit('audio:shield');
            if (this.particlePool) {
                for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * Math.PI * 2;
                    const p = this.particlePool.get(this.player.x, this.player.y, 'starSparkle');
                    if (p) {
                        p.color = '#7fdfff';
                        p.vel.x = Math.cos(a) * 4;
                        p.vel.y = Math.sin(a) * 4;
                    }
                }
            }
            return;
        }
    }

    // RUN-05a — Adaptive Difficulty Director threat axis. Scale the INCOMING
    // damage by the active D_thr (default 1.0 with no director — see
    // directorThreatMult). Applied here, on the top-level incoming-damage path
    // ONLY (the burn-DoT path returned early above, so DoT ticks are never
    // double-scaled), and BEFORE the FAILSAFE per-hit cap below so the
    // anti-one-shot clamp still protects against a scaled-up single blow.
    const scaledDamage = damageAmount * directorThreatMult(this);

    const effectiveShield = this.player.getEffectiveShield();
    let reducedDamage = scaledDamage * (1 - effectiveShield / 100);

    // E5 — elemental resistance vs the incoming hit's element (the symmetric
    // counterpart to E2's enemy-side resist). Item resist affixes (E7) feed
    // `player.getElementResist`; clamped so items can't make the player fully
    // immune. Inert until enemy attacks carry a non-Kinetic element (E8).
    reducedDamage *= playerElementResistMult(this.player, opts.element);

    // A.E9-S1 — CORRODE (from enemy Toxic hits) amplifies incoming damage while
    // active (+15%/stack). The vulnerability counterpart to resistance.
    reducedDamage *= playerCorrodeMult(this.player, frameClock.now);

    // 5.98.0 — Mobile early-wave incoming damage reduction. Stacks with
    // the shield/SHIELD_BOOST formula above. Cap-friendly (multiplier
    // never exceeds 1.0 so it can't accidentally amplify damage).
    const wave = (this.game && this.game.currentWave) ? (this.game.currentWave | 0) : 1;
    reducedDamage *= getMobileIncomingDamageMultiplier(wave);

    // P6 — Hoarder's Greed downside: +15% damage taken (the +100% gold-find
    // upside is in getGoldFindMultiplier).
    if (this.player.hasPassive && this.player.hasPassive('HOARDERS_GREED')) {
        reducedDamage *= 1.15;
    }
    // P6 — Frenzy downside: +30% damage taken (the +8%/nearby-enemy outgoing
    // upside is in applyDamageToEnemy).
    if (this.player.hasPassive && this.player.hasPassive('FRENZY')) {
        reducedDamage *= 1.30;
    }

    // BULWARK active-ability damage reduction (was applied inline at the
    // collision sites). IRON_WILL deepens it 50% → 65%.
    if (this.player.activeAbilityEffects && this.player.activeAbilityEffects.has('BULWARK')) {
        const bulwarkReduction = (this.player.getPowerupStacks
            && this.player.getPowerupStacks('IRON_WILL') > 0) ? 0.65 : 0.5;
        reducedDamage *= (1 - bulwarkReduction);
    }

    // 5.75.0 — STATIC_FIELD: passive HP shield that regenerates after 8s.
    const staticStacks = this.player.getPowerupStacks ? this.player.getPowerupStacks('STATIC_FIELD') : 0;
    const staticMax = staticStacks * 2;
    if (this.player._staticShield === undefined) this.player._staticShield = staticMax;
    if (staticStacks > 0 && this.player._staticShield > 0 && reducedDamage > 0) {
        const absorbed = Math.min(this.player._staticShield, reducedDamage);
        this.player._staticShield -= absorbed;
        reducedDamage -= absorbed;
        if (absorbed > 0) {
            if (typeof this.events?.emit === 'function') this.events.emit('audio:shield');
            if (this.particlePool) {
                for (let i = 0; i < 6; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const p = this.particlePool.get(this.player.x, this.player.y, 'starSparkle');
                    if (p) {
                        p.color = '#88ddff';
                        p.vel.x = Math.cos(a) * 2.5;
                        p.vel.y = Math.sin(a) * 2.5;
                    }
                }
            }
        }
    }
    this.player._lastDamageAt = Date.now();

    // A.E9-S1 — an elemental enemy hit that landed applies its player-side
    // status (CRYO→chill, TOXIC→corrode; Pyro burn lands in S1b). The hit
    // wasn't dodged/i-framed (those returned early above), so the status sticks.
    if (opts.element) applyPlayerStatus(this.player, opts.element, frameClock.now);

    // P6 — Failsafe passive: cap any single hit at 50% of max HP (the
    // anti-one-shot keystone; its −15% max-HP downside is a maxHpMult).
    if (this.player.hasPassive && this.player.hasPassive('FAILSAFE')) {
        const maxHp = (typeof this.player.getEffectiveMaxHealth === 'function')
            ? this.player.getEffectiveMaxHealth() : this.player.maxHealth;
        reducedDamage = Math.min(reducedDamage, maxHp * 0.5);
    }

    // Round to an integer so HP, damage numbers, and stats stay clean
    // (the collision sites used to round; the generic path didn't).
    // CD-10 — BLOODSHIELD soak. After `finalDamage` is fully finalized (post
    // shield/resist/corrode/mobile/FAILSAFE) and BEFORE it reduces HP / resolves
    // lethal, the temporary buffer absorbs min(buffer, finalDamage); only the
    // remainder hits HP. `let` so the soak shrinks the value the entire
    // downstream path (stats, thorns, Guardian Echo threshold, lethal) sees the
    // real HP-loss amount. Default-safe: bloodshield 0 → soak 0 → unchanged.
    let finalDamage = Math.round(reducedDamage);
    if (this.player.bloodshield > 0 && finalDamage > 0) {
        const soak = Math.min(this.player.bloodshield, finalDamage);
        this.player.bloodshield -= soak;
        finalDamage -= soak;
        if (soak > 0 && typeof this.events?.emit === 'function') this.events.emit('audio:shield');
    }
    const hpBeforeHit = this.player.health;
    this.player.health = Math.max(0, this.player.health - finalDamage);

    if (finalDamage > 0) {
        this._breakKillStreak();
        if (this.game && this.game.stats) this.game.stats.totalDamageTaken += finalDamage;
        // RUN-05a — count this hit for the director's per-wave `hitsSurvived`
        // signal (reset to 0 at each wave start in wave-manager). Only real
        // HP-loss hits count; dodged/i-framed/fully-absorbed hits don't.
        if (this.game) this.game._waveHits = (this.game._waveHits || 0) + 1;
        // Thorns — reflect a fraction back into the damage source
        // (enemy / bullet / asteroid). Only on a real HP loss.
        if (opts.source && typeof this.applyThorns === 'function') {
            this.applyThorns(finalDamage, opts.source);
        }
        // P6 — Vendetta: remember the attacker as the grudge target; it takes
        // +30% from you (applied in applyDamageToEnemy via vendettaMult) until
        // it dies. Non-enemy sources simply never match a damaged enemy.
        if (opts.source && this.player.hasPassive && this.player.hasPassive('VENDETTA')) {
            this.player._vendettaTarget = opts.source;
        }
        // W6 — Searing/Static/Frost/Null Bulwark: an attacker that hits you
        // while BULWARK is active takes the attunement's element.
        if (this.player.activeAbilityEffects && this.player.activeAbilityEffects.has('BULWARK')
            && opts.source && this.player.activeAbilityAttuneElement
            && this.player.activeAbilityAttuneElement.BULWARK
            && typeof this.applyAbilityElement === 'function') {
            this.applyAbilityElement(opts.source, this.player.activeAbilityAttuneElement.BULWARK);
        }
        // RETALIATION — taking a hit while BULWARK is active emits an AoE
        // damage pulse around the ship.
        if (this.player.activeAbilityEffects && this.player.activeAbilityEffects.has('BULWARK')
            && this.player.getPowerupStacks && this.player.getPowerupStacks('RETALIATION') > 0
            && this.enemyPool && typeof this.damageEnemy === 'function') {
            const PULSE_R = 180;
            const PULSE_DMG = 8;
            const px = this.player.x, py = this.player.y;
            for (const e of this.enemyPool.activeObjects.slice()) {
                if (!e.active) continue;
                if (Math.hypot(e.x - px, e.y - py) <= PULSE_R) this.damageEnemy(e, PULSE_DMG);
            }
            if (this.particlePool) {
                this.particlePool.get(px, py, 'explosionRingColored', PULSE_R, '#88ccff');
            }
        }
    }

    if (finalDamage > 0 && typeof this.checkMissionOnDamage === 'function') {
        if (this.game.mission) this.game.mission.damaged = true;
        this.checkMissionOnDamage();
    }

    // P6 — Guardian Echo passive: a hit that drops you INTO the danger zone
    // (≤25% max HP) emits a one-time knockback nova, shoving nearby enemies
    // away to buy recovery space. Fires only on the hit that CROSSES the
    // threshold (so it doesn't re-trigger every hit while low) and does NOT
    // prevent death — purely breathing room, even on a lethal blow.
    if (finalDamage > 0 && this.player.hasPassive && this.player.hasPassive('GUARDIAN_ECHO')) {
        const maxHp = (typeof this.player.getEffectiveMaxHealth === 'function')
            ? this.player.getEffectiveMaxHealth() : this.player.maxHealth;
        const thresh = maxHp * 0.25;
        if (hpBeforeHit > thresh && this.player.health <= thresh) {
            guardianEchoNova(this.player, (this.enemyPool && this.enemyPool.activeObjects) || []);
            if (this.particlePool) {
                this.particlePool.get(this.player.x, this.player.y, 'explosionRingColored', GUARDIAN_ECHO_RADIUS, '#ffcc44');
            }
        }
    }

    // A.E9-S1b — death resolution extracted into `_resolvePlayerLethal` so the
    // player-burn DoT (and any future lethal-DoT source) can run the same
    // guardian → last-stand → tank → death pipeline.
    if (this.player.health <= 0) {
        return _resolvePlayerLethal.call(this, finalDamage);
    }

    this.events.emit('audio:hit');
    if (finalDamage > 0) {
        const fxX = (opts.fxX !== undefined) ? opts.fxX : this.player.x;
        const fxY = (opts.fxY !== undefined) ? opts.fxY : (this.player.y - (this.player.radius || 14));
        if (typeof this.createDamageNumber === 'function') {
            this.createDamageNumber(this.player.x, this.player.y - (this.player.radius || 14), finalDamage, { isPlayerHit: true });
        }
        // 6.17.1 — Shake stays at the collision sites (damage-scaled).
        // triggerPlayerHitFX fires kick + hitstop + particles at the
        // impact point (opts.fxX/fxY) so the kick direction is correct.
        if (typeof this.triggerPlayerHitFX === 'function') {
            this.triggerPlayerHitFX(fxX, fxY, finalDamage);
        }
    }
    return finalDamage;
}

// Consume one energy tank: vaporize the corresponding triforce triangle
// (or fade the standalone "spare" icon at tanks=4), refill HP to max, and
// keep playing. Returns true if a tank was consumed (HP refilled), false
// if there were no tanks to consume (caller should handle game-over).
export function _consumeTank() {
    if (this.healthTanks <= 0) return false;

    const tanksBefore = this.healthTanks;
    this.healthTanks--;

    // Visual feedback: vaporize the slot that just emptied. Mirrored
    // coordinates below must match the values updateHUD() passes to
    // drawCanvasTriforce — see HUD_TRIFORCE_LEFT_X / HUD_BAR_CENTER_Y.
    if (typeof this.getDisappearingTankPos === 'function' &&
        typeof this.spawnTriforceVaporize === 'function') {
        const slot = this.getDisappearingTankPos(
            tanksBefore, HUD_TRIFORCE_LEFT_X, HUD_BAR_CENTER_Y,
        );
        if (slot) this.spawnTriforceVaporize(slot.x, slot.y, slot.size || 12);
    }
    if (typeof this.triggerGoldScreenFlash === 'function') {
        this.triggerGoldScreenFlash(0.32, 9);
    }

    this.player.health = this.player.getEffectiveMaxHealth();
    this.events.emit('audio:coin');
    this.events.emit('ui:update-tanks', { tanks: this.healthTanks });

    // 6.0.0 — SALVAGE_PLATING. When a tank pops, salvage spawns a
    // bonus health orb at the player's position so the player can
    // recover faster from the dramatic moment.
    const salvageStacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('SALVAGE_PLATING') : 0;
    if (salvageStacks > 0 && typeof this.createHealthOrb === 'function') {
        this.createHealthOrb(this.player.x, this.player.y);
    }
    return true;
}

// 5.88.3 — HUD coordinates mirrored here so the lifecycle vaporize FX
// lands on the right slot. Keep in sync with the constants in
// hud/status.js's updateHUD() — `triforceLeftX` and `barCenterY`.
// Left margin matches the bottom-left loadout (livesX=36 in
// drawEquippedWeaponSquares).
const HUD_TRIFORCE_LEFT_X = 36;
const HUD_BAR_CENTER_Y = 35;

// 5.88.0 — health-pickup overflow → tank progress.
// 6.35.0 — Threshold lowered 100 → 40 HP of overflow per tank. At 100
//   HP, regaining a triforce tank after losing one took ~10+ overheals
//   and felt like it "did nothing" / the excess was ignored. 40 HP
//   makes a regain land in ~2-4 overheals so the triforce-appearance
//   animation (spawnTankRecharge) actually fires and reads as a reward.
//   NOTE: tanks cap at MAX_HEALTH_TANKS (3 = the triforce slots), so
//   while the triforce is full the overflow is intentionally inert —
//   it only rebuilds tanks the player has LOST.
//
// `amountHealed` is the actual HP delta (post-cap); `orbAmount` is the
// original orb value before cap.
const TANK_OVERFLOW_HP = 40;
export function applyHealthOrbToTanks(orbAmount, amountHealed) {
    const overflow = Math.max(0, orbAmount - amountHealed);
    if (overflow <= 0 && this.player.health < this.player.getEffectiveMaxHealth()) return;

    // Picking up health while ALREADY at max HP credits the full orb;
    // otherwise just the unused portion.
    const credit = overflow > 0 ? overflow : orbAmount;
    accumulateOverflowToTank.call(this, credit);
}

// 5.114.0 — Shared accumulator. Any HP "wasted" past the cap (orb
// overflow, regen ticks at max, etc.) feeds in here. Every 100 HP of
// accumulated overflow grants +1 tank up to MAX_HEALTH_TANKS, fires
// the sparkling spawnTankRecharge animation, and emits an audio cue.
export function accumulateOverflowToTank(credit) {
    if (!(credit > 0) || !this.player) return;

    // CD-10 — BLOODSHIELD feed (passive-gated). This is the SINGLE over-heal
    // funnel — orb overflow AND regen-ticks-at-max both arrive here — so banking
    // the buffer here covers every heal-overflow source from one place. The
    // buffer cushions FIRST (up to its 35%-max-HP cap); only the REMAINDER falls
    // through to the triforce-tank accumulator below, keeping tank behavior
    // coherent once the buffer is topped off. Default-safe: without the
    // BLOODSHIELD passive the buffer is untouched and the full credit feeds tanks
    // exactly as before.
    if (this.player.hasPassive && this.player.hasPassive('BLOODSHIELD')
        && typeof this.player.addBloodshield === 'function') {
        const banked = this.player.addBloodshield(credit);
        credit -= banked;
        if (!(credit > 0)) return; // buffer absorbed all of it; nothing for tanks
    }

    if (this.player._tankProgress === undefined) this.player._tankProgress = 0;
    // 6.0.0 — BLOOD_BANK doubles overflow→tank credit.
    const bloodBankStacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('BLOOD_BANK') : 0;
    const effectiveCredit = bloodBankStacks > 0 ? credit * 2 : credit;
    this.player._tankProgress += effectiveCredit / TANK_OVERFLOW_HP;

    while (this.player._tankProgress >= 1 && this.healthTanks < MAX_HEALTH_TANKS) {
        this.healthTanks++;
        this.player._tankProgress -= 1;
        this.events.emit('audio:powerup');
        this.events.emit('ui:update-tanks', { tanks: this.healthTanks });
        if (typeof this.spawnTankRecharge === 'function') {
            this.spawnTankRecharge(this.healthTanks);
        }
    }
    // Cap progress at <1 once at max tanks so overflow doesn't sit forever.
    if (this.healthTanks >= MAX_HEALTH_TANKS && this.player._tankProgress > 1) {
        this.player._tankProgress = 1;
    }
}

export function handlePlayerDeath() {
    // P6 — Second Heart passive: survive a lethal hit once PER STAGE at 30% HP
    // + i-frames (the cheaper-but-repeating cousin of the Second Wind ability).
    // Tracked by the stage it was last used in, so it auto-rearms each stage.
    if (this.player && this.player.hasPassive && this.player.hasPassive('SECOND_HEART')) {
        const stage = Math.max(1, Math.ceil((((this.game && this.game.currentWave) | 0) || 1) / WAVES_PER_STAGE));
        if (this.player._secondHeartUsedStage !== stage) {
            this.player._secondHeartUsedStage = stage;
            const maxHp = (typeof this.player.getEffectiveMaxHealth === 'function')
                ? this.player.getEffectiveMaxHealth() : this.player.maxHealth;
            this.player.health = Math.max(1, Math.round(maxHp * 0.30));
            if (typeof this.player.makeInvincible === 'function') this.player.makeInvincible(1500);
            if (this.events?.emit) {
                this.events.emit('audio:powerup');
                this.events.emit('ui:show-message', {
                    title: '✦ SECOND HEART ✦', subtitle: 'Survived at 30% HP',
                    duration: 1600, position: 'top',
                });
            }
            return;
        }
    }
    // R4.3 Revive Token (bought) + R6.3 Second Wind (ability) both cheat death
    // once: consume whichever is set, restore to full HP + one spare tank, and
    // skip the death sequence so the run continues.
    if (this.player && (this.player._reviveToken || this.player._secondWindArmed)) {
        const wasSecondWind = !!this.player._secondWindArmed;
        this.player._reviveToken = false;
        this.player._secondWindArmed = false;
        const maxHp = (typeof this.player.getEffectiveMaxHealth === 'function')
            ? this.player.getEffectiveMaxHealth() : this.player.maxHealth;
        this.player.health = maxHp;
        if (typeof this.healthTanks === 'number') this.healthTanks = Math.max(this.healthTanks | 0, 1);
        // W6 — Phoenix/Discharge/Cold Snap: the Second Wind survival triggers an
        // elemental burst around the player to buy space.
        const swEl = wasSecondWind && this.player.activeAbilityAttuneElement
            && this.player.activeAbilityAttuneElement.SECOND_WIND;
        if (swEl && this.enemyPool && typeof this.applyAbilityElement === 'function') {
            for (const enemy of this.enemyPool.activeObjects) {
                if (!enemy || !enemy.active) continue;
                if (Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= 200) {
                    this.applyAbilityElement(enemy, swEl);
                }
            }
        }
        if (this.events?.emit) {
            this.events.emit('audio:powerup');
            this.events.emit('ui:show-message', {
                title: '✦ REVIVED ✦', subtitle: 'Revive Token consumed',
                duration: 1800, position: 'top',
            });
            this.events.emit('ui:update-tanks', { tanks: this.healthTanks });
        }
        return;
    }

    const dx = this.player.x;
    const dy = this.player.y;
    const playerAngle = this.player.angle || 0;

    this.deathLocation = { x: dx, y: dy };

    // Vaporize the LAST triangle (the bottom-left, which is what's
    // rendered when tanks=1). healthTanks is already 0 by the time
    // handlePlayerDeath fires, so the FX site is computed for "loss
    // from 1 → 0".
    if (typeof this.spawnTriforceVaporize === 'function' &&
        typeof this.getDisappearingTankPos === 'function') {
        const tri = this.getDisappearingTankPos(
            1, HUD_TRIFORCE_LEFT_X, HUD_BAR_CENTER_Y,
        );
        if (tri) this.spawnTriforceVaporize(tri.x, tri.y, tri.size || 12);
    }
    if (typeof this.triggerGoldScreenFlash === 'function') {
        this.triggerGoldScreenFlash(0.32, 9);
    }

    this.events.emit('audio:player-explosion');
    this.player.active = false;

    // ── Phase 0: Impact Freeze (immediate) ──────────────────────────
    this.triggerHitstop(15);
    this.triggerScreenFlash(0.28, 5);
    const kickAngle = playerAngle + Math.PI;
    this.triggerCameraKick(Math.cos(kickAngle), Math.sin(kickAngle), 25);

    // Death overlay — full hold since it's terminal now.
    this._deathOverlayTimer = 90;
    this._deathOverlayDuration = this._deathOverlayTimer;
    this._deathOverlayHold = true;

    // ── Phase 1: Ship Fragmentation (immediate) ─────────────────────
    this.particlePool.get(dx, dy, 'explosionFlash', 55);
    this.particlePool.get(dx, dy, 'explosionRingColored', 70, '#00ccff');
    this.createPlayerShipDebris(dx, dy, playerAngle);
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + random(-0.3, 0.3);
        const spd = random(10, 18);
        const c = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#00ccff' : '#78ebff';
        this.particlePool.get(dx, dy, 'explosionShrapnel', a, spd, c);
    }

    // ── Phase 2: Main Blast ─────────────────────────────────────────
    setTimeout(() => {
        this.triggerCameraKick(
            Math.cos(kickAngle + random(-0.5, 0.5)),
            Math.sin(kickAngle + random(-0.5, 0.5)), 18
        );
        this.triggerScreenFlash(0.18, 4);
        this.triggerScreenShake(60, 30, 80);

        const ringColors = ['#ffffff', '#78ebff', '#ff5ad2'];
        const ringRadii = [90, 130, 175];
        for (let r = 0; r < 3; r++) {
            setTimeout(() => {
                this.particlePool.get(dx, dy, 'explosionRingColored',
                    ringRadii[r], ringColors[r]);
            }, r * 60);
        }
    }, 100);

    // Secondary shrapnel wave
    setTimeout(() => {
        const palette = ['#00ccff', '#ff5ad2', '#be96ff', '#ffffff', '#ffff96'];
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + random(-0.4, 0.4);
            const spd = random(4, 11);
            this.particlePool.get(dx, dy, 'explosionShrapnel', a, spd,
                palette[i % palette.length]);
        }
    }, 160);

    // Embers
    setTimeout(() => {
        const emberColors = ['#78ebff', '#ffffff', '#ff5ad2', '#be96ff'];
        for (let i = 0; i < 10; i++) {
            this.particlePool.get(dx, dy, 'explosionEmber',
                emberColors[i % emberColors.length]);
        }
    }, 220);

    // ── Phase 3: Aftershock ─────────────────────────────────────────
    setTimeout(() => {
        this.triggerCameraKick(
            Math.cos(kickAngle + random(-1, 1)),
            Math.sin(kickAngle + random(-1, 1)), 10
        );
        this.triggerScreenFlash(0.08, 2);

        for (let i = 0; i < 6; i++) {
            const ox = dx + random(-35, 35);
            const oy = dy + random(-35, 35);
            this.particlePool.get(ox, oy, 'explosionEmber',
                i % 2 === 0 ? '#ff5ad2' : '#ffff96');
        }
    }, 400);

    // Final massive ring
    setTimeout(() => {
        this.particlePool.get(dx, dy, 'explosionRingColored', 220, '#be96ff');
    }, 650);

    // Delayed re-ignition pops
    for (let p = 0; p < 4; p++) {
        setTimeout(() => {
            const ox = dx + random(-45, 45);
            const oy = dy + random(-45, 45);
            this.particlePool.get(ox, oy, 'explosionFlash', random(15, 28));
            for (let s = 0; s < 3; s++) {
                const a = random(0, Math.PI * 2);
                this.particlePool.get(ox, oy, 'explosionShrapnel', a,
                    random(3, 7), s === 0 ? '#ffffff' : '#78ebff');
            }
        }, 650 + p * 120);
    }

    // 5.88.4 — proper GAME OVER screen with NEW GAME + RESTART WAVE
    // buttons (drawn from hud/overlays.js::drawGameOverScreen on the
    // engine's GAME_OVER render branch). The DOM `ui:show-message`
    // popup is gone; the screen lives on the canvas alongside the rest
    // of the HUD so it can carry buttons + survival summary.
    this.game.state = GAME_STATES.GAME_OVER;
    this.checkSurvivalRecord();
}

export function createPlayerShipDebris(x, y, angle) {
    const r = this.player.radius || 12;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const verts = [
        { x: 0,          y: -r },
        { x: r * 0.32,   y: -r * 0.18 },
        { x: r * 1.12,   y: r * 0.28 },
        { x: r * 1.42,   y: r * 0.08 },
        { x: r * 0.28,   y: r * 0.58 },
        { x: r * 0.42,   y: r * 0.78 },
        { x: 0,          y: r * 0.38 },
        { x: -r * 0.42,  y: r * 0.78 },
        { x: -r * 0.28,  y: r * 0.58 },
        { x: -r * 1.42,  y: r * 0.08 },
        { x: -r * 1.12,  y: r * 0.28 },
        { x: -r * 0.32,  y: -r * 0.18 },
    ];

    for (let i = 0; i < verts.length; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % verts.length];
        const p1 = {
            x: v1.x * cos - v1.y * sin,
            y: v1.x * sin + v1.y * cos
        };
        const p2 = {
            x: v2.x * cos - v2.y * sin,
            y: v2.x * sin + v2.y * cos
        };
        const debris = this.lineDebrisPool.get(x, y, p1, p2, '#00ccff');
        if (debris) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const outAngle = Math.atan2(midY, midX);
            const spd = random(4, 10);
            debris.vel.x = Math.cos(outAngle) * spd;
            debris.vel.y = Math.sin(outAngle) * spd;
            debris.rotVel = random(-0.2, 0.2);
        }
    }
}
