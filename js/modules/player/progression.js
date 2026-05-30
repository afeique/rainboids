// Player progression system — extracted from Player class.
// All functions are called with .call(this) so `this` refers to the Player instance.
//
// 6.0.0 — Player leveling REMOVED. Wave is the new "level"; gold is
// the only currency. The functions below are kept as no-op stubs so
// the collision-system kill-reward call sites and any HUD code that
// reads getExperienceProgress don't NPE. Originals live in git
// history if needed.
//
// Stats that used to scale with player level now scale with the
// CURRENT WAVE (see combat-manager.js drops, getGoldFindMultiplier
// below). Powerups + items are the player's only growth axes.

// ── Experience & leveling (6.0.0 — all no-op) ───────────────────────────

export function gainExperience(/* amount */) { /* no-op since 6.0.0 */ }
export function levelUp() { return false; }

// ── Meta progression (6.35.0) ───────────────────────────────────────────
// Persistent level / XP / SP across playthroughs. `level`, `xp`, `sp`,
// and `spStats` live on the player but are saved to localStorage so they
// carry between runs.
// 9.0.0 (reboot) — SP stats + XP/leveling removed; sp-stats import dropped.
import { EFFICIENCY_CAP, FLUX_PER_STACK, CAPACITOR_BANK_OVERCHARGE_MULT, CAPACITOR_BANK_DECAY_PER_SEC } from '../core/constants.js';
import { loadMeta, saveMeta } from '../core/storage.js';
import { frameClock } from '../core/frame-clock.js';
import { playerChillSpeedMult } from './player-status.js';
// SYS-8 / ENMY-05 — buff-strip suppression convention. After a Leech strips a
// powerup it stamps `player._buffSuppressed[type] = now + STRIP_DURATION_MS`;
// addPowerup honors this so a just-stripped powerup can't be instantly
// re-acquired until the window lapses. Default-safe: with no stamp,
// isBuffSuppressed returns false and addPowerup behaves byte-for-byte as before.
import { isBuffSuppressed } from '../enemy/abilities/buff-strip.js';

// Initialize the player's meta fields from storage (called in ctor).
// 9.0.0 (reboot) — leveling / XP / SP all removed. Level pinned at 1 (enemy
// scaling reads wave, not level); xp/sp/spStats kept as fields for back-compat
// with any lingering reader, all zero. No persistence — saveMetaState is a
// no-op so the storage doesn't accumulate stale per-run state.
export function initMeta() {
    this.level = 1;
    this.xp = 0;
    this.sp = 0;
    this.spStats = {};
}

export function saveMetaState() { /* no-op (9.0.0) */ }

// 9.0.0 (reboot) — XP / leveling removed. No-op so any lingering caller is harmless.
export function addXp(/* amount */) { /* no-op (9.0.0) */ }

// 6.148.0 — fire the canvas LEVEL UP celebration: a timed `levelUpAnimation`
// window (ship golden aura via renderer.drawLevelUpEffects + the wavy
// "LEVEL UP!" / SP subtitle via hud/status.drawLevelUpText) plus a gold
// particle burst + an audio cue. Safe off-engine (particles/audio guarded).
const LEVEL_UP_ANNOUNCE_MS = 2600;
export function triggerLevelUpAnnounce() {
    this.levelUpAnimation = {
        active: true,
        startTime: Date.now(),
        duration: LEVEL_UP_ANNOUNCE_MS,
    };
    if (typeof this.createLevelUpParticles === 'function') {
        try { this.createLevelUpParticles(); } catch (_) { /* visual only */ }
    }
    const ge = this.gameEngine;
    if (ge && ge.events && typeof ge.events.emit === 'function') {
        ge.events.emit('audio:powerup');
    }
}

// 9.0.0 (reboot) — SP allocation removed (no SP stats). No-op stubs kept.
export function allocateSp() { return false; }
export function deallocateSp() { return false; }

// 9.0.0 (reboot) — no SP stats. _spVal returns 0 so every effective-stat
// getter's SP term collapses without rewriting each getter.
function _spVal(/* player, statId */) { return 0; }

// P2 — additive contribution of the active rule-modifier passives for a stat
// key (0 until a passive declares a numeric `mods[key]` in P6). Guards a
// non-Player `this` (some getter unit tests stub it).
function _passiveMod(player, key) {
    return (player && typeof player.getPassiveMod === 'function') ? player.getPassiveMod(key) : 0;
}
export function spStatTotal(statId) {
    return _spVal(this, statId);
}

export function grantLevelUpBonus() {
    // 6.0.0 — no-op. Wave-clear survivor cards replace the old 45s
    // dual-buff cadence.
    return [];
}

export function updateTempBonuses() {
    if (!this.tempBonuses || this.tempBonuses.length === 0) return;

    const now = Date.now();
    this.tempBonuses = this.tempBonuses.filter(bonus => {
        if (now >= bonus.expiresAt) {
            // Remove the temporary stack
            const powerup = this.powerups.get(bonus.id);
            if (powerup && powerup.stacks > 0) {
                powerup.stacks--;
                if (powerup.stacks <= 0) {
                    this.powerups.delete(bonus.id);
                }
            }
            return false;
        }
        return true;
    });
}

export function triggerLevelUpEffects() {
    // 6.0.0 — no-op. Wave-clear survivor cards are the new celebration
    // beat (see wave-manager.openWavePickOverlay).
}

export function createLevelUpParticles() {
    const gameEngine = this.gameEngine;
    if (!gameEngine || !gameEngine.particlePool) return;

    // Create golden burst particles around player
    for (let i = 0; i < 20; i++) {
        const particle = gameEngine.particlePool.get(this.x, this.y, 'starSparkle');
        if (particle) {
            const angle = (i / 20) * Math.PI * 2;
            const speed = 2 + Math.random() * 3;
            particle.vel.x = Math.cos(angle) * speed;
            particle.vel.y = Math.sin(angle) * speed;
            particle.color = '#FFD700'; // Gold color
            particle.radius = 2 + Math.random() * 2;
            particle.life = 60 + Math.random() * 40;
        }
    }

    // Create expanding golden ring
    const ring = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', this.radius * 3);
    if (ring) {
        ring.color = '#FFD700';
    }

    // Create secondary ring with delay
    setTimeout(() => {
        const ring2 = gameEngine.particlePool.get(this.x, this.y, 'explosionPulse', this.radius * 5);
        if (ring2) {
            ring2.color = '#FFA500'; // Orange
        }
    }, 300);
}

export function getExperienceProgress() {
    // 6.0.0 — no XP. Always 0 so any lingering HUD reader paints empty.
    return 0;
}

// ── Powerup management ────────────────────────────────────────────────────

export function addPowerup(type, config, isShopItem = false) {
    // SYS-8 / ENMY-05 — re-grant guard. If a Leech just stripped this powerup
    // and the suppression window hasn't lapsed, refuse the re-grant so the buff
    // stays gone for the full window. Default-safe: with no `_buffSuppressed`
    // stamp (normal play), isBuffSuppressed returns false and this is a no-op.
    if (isBuffSuppressed(this, type, Date.now())) return false;
    // ALL powerups are now permanent and stacking — drops included.
    // The `isShopItem` param is kept for back-compat with any caller
    // that still passes it; it no longer controls duration.
    // 5.75.0 — `config.maxStacks` is now respected: the next pick at
    // cap silently no-ops. The shop's purchasePowerup also gates buys
    // on this cap so you can't waste picks; this is the safety net.
    const cap = (config && config.maxStacks) || 99;
    if (this.powerups.has(type)) {
        const existing = this.powerups.get(type);
        if (existing.stacks >= cap) return false;
        existing.stacks += 1;
        existing.timeRemaining = Infinity;
        existing.isPermanent = true;
    } else {
        this.powerups.set(type, {
            stacks: 1,
            timeRemaining: Infinity,
            config: config,
            isPermanent: true,
        });
    }

    // Special handling for health boost - full heal on pick (5.101.0).
    // The displayName/description now both promise "full heal on pick",
    // so honor it regardless of isShopItem (wave-pick / shop / debug all
    // restore HP). The +35 max-HP bump comes from getEffectiveMaxHealth.
    if (type === 'HEALTH_BOOST') {
        this.health = this.getEffectiveMaxHealth();
    }

    if (isShopItem) {
    } else {
    }

    // 6.226.0 — permanent powerup stacks live in the persistent profile;
    // mark the account dirty so the coalesced flush picks up the change.
    this.gameEngine?.markMetaDirty?.();
    return true;
}

export function updatePowerups() {
    // Decrease timers and remove expired powerups (skip permanent ones)
    for (const [type, powerup] of this.powerups.entries()) {
        if (powerup.timeRemaining !== Infinity && !powerup.isPermanent) {
            powerup.timeRemaining -= 16; // Assume 60fps
            if (powerup.timeRemaining <= 0) {
                this.powerups.delete(type);
            }
        }
    }

    // 5.101.0 — REGEN powerup. Passive +0.5 HP/s per stack, capped at
    // the player's effective max HP. Accumulator pattern keeps the
    // regen frame-rate independent.
    // 5.106.0 — Each granted HP fires a green "+N" floater (aggregated
    // per-player in createDamageNumber so a continuous regen reads as
    // a single growing number, not +1 spam).
    // 5.114.0 — Combat-gated. Regen ONLY ticks after the player has
    // gone REGEN_DAMAGE_GATE_MS without taking damage. Taking a hit
    // resets `_lastDamageAt` (already maintained in lifecycle.takeDamage),
    // which puts regen back on its 4-second cooldown. Net effect: regen
    // is a between-fights recovery tool, not an in-combat tank.
    // Inventory items can also contribute regen (see getEffectiveRegen).
    const regenPerSec = this.getEffectiveRegen();
    const REGEN_DAMAGE_GATE_MS = 4000;
    const now = Date.now();
    const sinceDamage = now - (this._lastDamageAt || 0);
    if (regenPerSec > 0 && this.active && this.health > 0
            && sinceDamage >= REGEN_DAMAGE_GATE_MS) {
        const cap = this.getEffectiveMaxHealth();
        if (this.health < cap) {
            this._regenAcc = (this._regenAcc || 0) + regenPerSec * (16 / 1000);
            let regenTickGained = 0;
            while (this._regenAcc >= 1 && this.health < cap) {
                this.health = Math.min(cap, this.health + 1);
                this._regenAcc -= 1;
                regenTickGained++;
            }
            if (regenTickGained > 0 && this.gameEngine
                    && typeof this.gameEngine.createDamageNumber === 'function') {
                this.gameEngine.createDamageNumber(
                    this.x,
                    this.y - (this.radius || 14) - 4,
                    regenTickGained,
                    { isHeal: true },
                );
            }
        } else {
            // 5.114.0 — At max HP, regen ticks count toward the
            // overflow → tank accumulator. So a player camping at max
            // with REGEN stacks slowly builds toward an extra triforce
            // piece, mirroring the orb-overflow path.
            const overflow = regenPerSec * (16 / 1000);
            if (this.gameEngine && typeof this.gameEngine.accumulateOverflowToTank === 'function') {
                this.gameEngine.accumulateOverflowToTank(overflow);
            }
            this._regenAcc = 0;
        }
    } else if (sinceDamage < REGEN_DAMAGE_GATE_MS) {
        // Within the no-regen window after taking damage: reset the
        // accumulator so a returning regen tick doesn't dump stored
        // progress all at once.
        this._regenAcc = 0;
    }

    // 5.75.0 — STATIC_FIELD regen. After 8s of no damage, the static
    // shield slowly tops back up to its cap (+2 HP per stack).
    const staticStacks = this.getPowerupStacks('STATIC_FIELD');
    if (staticStacks > 0) {
        const cap = staticStacks * 2;
        if (this._staticShield === undefined) this._staticShield = cap;
        if (this._staticShield < cap) {
            const idleSinceDamage = Date.now() - (this._lastDamageAt || 0);
            if (idleSinceDamage > 8000) {
                // 1 HP per second of regen — modest so it doesn't trivialize.
                this._staticShieldRegenAcc = (this._staticShieldRegenAcc || 0) + 16 / 1000;
                while (this._staticShieldRegenAcc >= 1 && this._staticShield < cap) {
                    this._staticShield += 1;
                    this._staticShieldRegenAcc -= 1;
                }
            }
        }
    }
}

export function getPowerupStacks(type) {
    return this.powerups.has(type) ? this.powerups.get(type).stacks : 0;
}

// 6.32.0 — Sum the rolled affix values of a given type across all
// equipped inventory items. Items mirror the passive stat set, so the
// effective-stat getters add this on top of the passive-stack bonus.
// 9.0.0 (reboot) — inventory/gear removed; no equipped-item affixes ever exist
// now, so this returns 0 and every effective-stat getter collapses to base +
// powerup stacks + SP + passive mods.
export function getItemAffixTotal(/* type */) { return 0; }

// ── Effective stat calculations ───────────────────────────────────────────

export function getMovementSpeedMultiplier() {
    const speedBoostStacks = this.getPowerupStacks('SPEED_BOOST');
    // Each stack: +65% thrust. 6.32.0 — item speed affixes; 6.35.0 — SP
    // SPEED allocation; both add their rolled percentage on top.
    const itemSpeedPct = (this.getItemAffixTotal('speed') + _spVal(this, 'SPEED')) / 100;
    // A.E9-S1 — CHILL (from enemy Cryo hits) slows the player's thrust/top speed.
    return (1 + speedBoostStacks * 0.65 + itemSpeedPct) * playerChillSpeedMult(this, frameClock.now);
}

// 6.0.0 — Gold Find now scales with WAVE, not player level. Same
// shape: +10% per wave past 1. W1=1.0×, W5=1.4×, W10=1.9×, W30=3.9×.
// Reads through the live gameEngine reference (set by main.js) since
// the Player doesn't carry a wave field directly.
export function getGoldFindMultiplier() {
    const ge = this.gameEngine
        || ((typeof window !== 'undefined') ? window.gameEngine : null);
    const wave = (ge && ge.game) ? (ge.game.currentWave | 0) : 1;
    let mult = 1 + Math.max(0, wave - 1) * 0.10;
    // P6 — Hoarder's Greed passive: +100% gold-find (the ↯ +15% damage taken
    // downside is applied in lifecycle takeDamage).
    if (typeof this.hasPassive === 'function' && this.hasPassive('HOARDERS_GREED')) mult *= 2;
    return mult;
}

export function getRangeMultiplier() {
    // 5.110.0 — Range upgrade path retired. Base bullet flight covers
    // the full playfield (since 5.100.3); LONG_RANGE was hidden then,
    // and now PENETRATOR / LANCE_VELOCITY-range / TRIPLE_BEAM-range /
    // ARC_OVERCHARGE-chain-range have all been replaced with damage
    // or behavioral upgrades. Always returns 1 so per-weapon
    // `config.range` modifiers (e.g. Rail Driver 0.85) are the only
    // remaining axis affecting bullet flight distance.
    return 1;
}

// 5.114.0 — Effective passive regen rate (HP per second). Sums:
//   - REGEN powerup: 0.5 HP/s per stack
//   - Inventory items with a `regenBonus` field: each item's bonus
//     (HP/s). Items roll regenBonus during createItem in
//     world/item-system.js (small chance of a secondary regen roll).
//   - Base: 0 — the player has no innate regen.
//
// Combat-gated downstream by updatePowerups (4-second no-damage
// window before regen ticks).
// 6.0.1 — Hard ceiling on effective regen. Stacking the REGEN powerup
// with an epic trinket primary + 4× secondary regen affixes pushed
// out-of-combat heal past 10 HP/s, making the 4-second damage gate
// trivial to wait out. Cap at 3.0 HP/s keeps regen a meaningful
// recovery tool without turning the player into a tank.
const REGEN_RATE_CAP = 3.0;
// CD-04 (T2) — Regenerator powerup raises the ceiling to 5.0 HP/s while held.
const REGEN_RATE_CAP_BOOSTED = 5.0;
export function getEffectiveRegen() {
    let regen = 0;
    const stacks = this.getPowerupStacks ? this.getPowerupStacks('REGEN') : 0;
    if (stacks > 0) regen += stacks * 0.5;
    regen += this.getItemAffixTotal('regen'); // 6.32.0 — item regen affixes
    regen += _passiveMod(this, 'regen');       // P2 — passive numeric mods
    regen += _spVal(this, 'REGENERATION');     // CD-08 — permanent SP regen stat (default-safe: 0 pts → 0)
    // CD-04 (T2) — Regenerator: while held, the cap rises 3.0 → 5.0 HP/s.
    // Default-safe: without the powerup the cap is the existing 3.0.
    const cap = (this.getPowerupStacks?.('REGENERATOR') > 0)
        ? REGEN_RATE_CAP_BOOSTED : REGEN_RATE_CAP;
    return Math.min(cap, regen);
}

export function getEffectiveShield() {
    const baseShield = this.shield;
    const shieldBoostStacks = this.getPowerupStacks('SHIELD_BOOST');

    // +8% damage reduction per stack (was +5%). Cap stays at 75%.
    const shieldBoostAmount = shieldBoostStacks * 8;

    // 5.99.4 — Diablo defensive items. Each equipped toughness item
    // (shielding, chassis — slot keys rethemed in 6.2.2) adds its
    // `bonus` directly to the shield percentage. Stacks on top of
    // SHIELD_BOOST. `this.shield` (the base 15% damage reduction) is
    // a different concept and unrelated to the inventory slot.
    // 6.32.0 — Any equipped item rolling a toughness affix contributes,
    // regardless of slot. 6.35.0 — + SP TOUGHNESS allocation.
    const itemBonus = this.getItemAffixTotal('toughness');

    const totalShield = baseShield + shieldBoostAmount + itemBonus + _spVal(this, 'TOUGHNESS') + _passiveMod(this, 'toughness');
    return Math.min(75, totalShield); // Cap at 75%
}

export function getEffectiveMaxHealth() {
    const baseMaxHealth = this.maxHealth;
    const healthBoostStacks = this.getPowerupStacks('HEALTH_BOOST');
    const healthBoostAmount = healthBoostStacks * 35; // +35 max health per stack (was +25)

    // 5.99.4 — Diablo defensive items (HP slots). Each equipped HP
    // item (cockpit, hull — slot keys rethemed in 6.2.2) adds its
    // `bonus` to max health. Stacks on top of HEALTH_BOOST.
    // 6.32.0 — Any equipped item rolling an HP affix contributes.
    // 6.35.0 — + SP HEALTH allocation.
    const itemBonus = this.getItemAffixTotal('hp') + _spVal(this, 'HEALTH');

    // P6 — passive max-HP multipliers (Glass Cannon ×0.5, Failsafe ×0.85, …)
    // apply AFTER the additive bonuses, so "−50% max HP" halves the whole pool.
    const hpMult = (typeof this.getPassiveMaxHpMult === 'function') ? this.getPassiveMaxHpMult() : 1;
    const totalMaxHealth = (baseMaxHealth + healthBoostAmount + itemBonus + _passiveMod(this, 'maxHp')) * hpMult;
    // Cap raised to 600 to accommodate the higher per-stack value while
    // still preventing infinite scaling.
    return Math.min(600, totalMaxHealth);
}

export function getEffectiveCritChance() {
    // §6c no-downsides rework — Purist can crit now; its anchor is +40% flat
    // damage + shots pierce (no-crit downside removed).
    const baseCritChance = this.baseCritChance;
    const critChanceStacks = this.getPowerupStacks('CRIT_CHANCE');
    const critChanceBonus = critChanceStacks * 7; // +7% per stack (was +5%)

    // 6.32.0 — item critChance affixes. 6.35.0 — + SP CRIT_CHANCE.
    const totalCritChance = baseCritChance + critChanceBonus
        + this.getItemAffixTotal('critChance') + _spVal(this, 'CRIT_CHANCE') + _passiveMod(this, 'critChance');
    return Math.min(60, totalCritChance); // Cap raised 50% → 60%
}

export function getEffectiveCritDamage() {
    const critDamageStacks = this.getPowerupStacks('CRIT_DAMAGE');
    const critDamageBonus = critDamageStacks * 15; // +15% per stack (was +10%)

    // Randomize between 2x (200%) and 3x (300%) base, plus stacks +
    // 6.32.0 item critDamage affixes.
    const itemCritDmg = this.getItemAffixTotal('critDamage') + _spVal(this, 'CRIT_DAMAGE') + _passiveMod(this, 'critDamage');
    const minCrit = this.baseCritDamage; // 200%
    const maxCrit = 300 + critDamageBonus + itemCritDmg; // 300% + stacks + items + SP + passives
    const totalCritDamage = minCrit + Math.random() * (maxCrit - minCrit);
    return Math.min(550, totalCritDamage); // Cap raised 500% → 550%
}

// Knockback multiplier applied to all power-weapon impulses (Mine,
// Nova, Lightning, Missile). +40% per stack of KNOCKBACK powerup
// (was +30%), capped at 3.5x (was 3.0x).
export function getKnockbackMultiplier() {
    const stacks = this.getPowerupStacks('KNOCKBACK');
    return Math.min(3.5, 1 + stacks * 0.4);
}

// Post-dash invuln window in ms. Every dash earns a base safety
// breath after the burst itself ends (the 250ms burst already grants
// i-frames via isDashIFrameActive — this stacks ON TOP). PHASE_ECHO
// powerup extends the window: 0 stacks = 1s, 1 stack = 3s, 2 stacks
// (max) = 5s. The Player calls this once at dash trigger and feeds
// `DASH_DURATION_MS + getPostDashIframeMs()` into makeInvincible so
// the collision sites' existing `!player.invincible` check handles
// the new window without any per-site changes.
export const POST_DASH_IFRAME_BASE_MS = 1000;
export const POST_DASH_IFRAME_PER_STACK_MS = 2000;
export function getPostDashIframeMs() {
    const stacks = this.getPowerupStacks
        ? this.getPowerupStacks('PHASE_ECHO') : 0;
    return POST_DASH_IFRAME_BASE_MS + stacks * POST_DASH_IFRAME_PER_STACK_MS;
}

export function getEffectiveHealthOrbHealing(baseHealing = 1) {
    // 5.78.2 — heal amount is decided at orb creation time inside
    // createHealthOrb (level-scaled). No collection-time bonus.
    return baseHealing;
}

// Legacy support for old method names
export function getEffectiveHealthStarHealing() {
    return this.getEffectiveHealthOrbHealing();
}

export function getEffectiveBurstStarHealing() {
    return this.getEffectiveHealthOrbHealing();
}

// ── CD energy-economy effective getters (CD-06) ─────────────────────────────
// Power weapons run on the energy meter (player.energy / player.maxEnergy,
// base 100). Three permanent SP stats reshape that economy. All three are
// DEFAULT-SAFE: with 0 points allocated _spVal returns 0, so each getter
// collapses to the exact pre-CD value (maxEnergy / regenMult 1 / baseCost).

// CAPACITOR — raises the energy reservoir. 0 pts → base maxEnergy (100).
// OVERFLOW_CAPACITOR passive (§6c, no-downsides rework) multiplies the reservoir
// by 1.5 (+50% max). Default-safe: without the passive, ×1.
export function getEffectiveMaxEnergy() {
    const base = (this.maxEnergy || 100) + _spVal(this, 'CAPACITOR');
    const overflow = (typeof this.hasPassive === 'function' && this.hasPassive('OVERFLOW_CAPACITOR')) ? 1.5 : 1;
    return base * overflow;
}

// CAPACITOR_BANK — the energy CLAMP ceiling. While the passive is held the meter
// may OVERCHARGE up to CAPACITOR_BANK_OVERCHARGE_MULT× the normal effective cap
// (the portion above getEffectiveMaxEnergy() is the "overcharge"). Used at every
// energy clamp site (regen clamp + addEnergy clamp in player.js). DEFAULT-SAFE:
// without the passive this returns exactly getEffectiveMaxEnergy() — the clamp is
// byte-for-byte the normal cap and the meter can never bank past 100%.
export function getEnergyOverchargeCap() {
    const cap = this.getEffectiveMaxEnergy();
    const held = (typeof this.hasPassive === 'function' && this.hasPassive('CAPACITOR_BANK'));
    return held ? cap * CAPACITOR_BANK_OVERCHARGE_MULT : cap;
}

// CAPACITOR_BANK — pure overcharge decay step. The portion of `energy` ABOVE
// `normalMax` (the normal effective cap) bleeds off at CAPACITOR_BANK_DECAY_PER_SEC
// per second, FLOORED at normalMax (it never decays below the normal cap — the
// 0..100% zone is owned by regen). Returns the new energy value. Pure (no `this`)
// so it's unit-testable in isolation. Below the cap (or at/under it) → returned
// unchanged (no work).
export function capacitorBankDecayStep(energy, normalMax, dtMs) {
    if (!(energy > normalMax) || !(dtMs > 0)) return energy;
    const decayed = energy - CAPACITOR_BANK_DECAY_PER_SEC * dtMs / 1000;
    return Math.max(normalMax, decayed);
}

// REACTOR — multiplier on the per-frame regen increment. 0 pts → 1.
// _spVal('REACTOR') is the percentage (0..100), so /100 → 0..1 added to 1.
// FLUX (energy-synergy powerup) adds a stacking bonus on top: +FLUX_PER_STACK per
// active stack while the ramp is alive (player.update zeroes _fluxStacks once the
// fade window elapses). Default-safe: 0 Flux stacks → +0 → the exact `1 + REACTOR%`.
export function getEffectiveEnergyRegenMult() {
    // OVERFLOW_CAPACITOR passive (§6c) doubles regen (×2). Default-safe: ×1 without it.
    const overflow = (typeof this.hasPassive === 'function' && this.hasPassive('OVERFLOW_CAPACITOR')) ? 2 : 1;
    return (1 + _spVal(this, 'REACTOR') / 100 + (this._fluxStacks || 0) * FLUX_PER_STACK) * overflow;
}

// EFFICIENCY — discounts power-weapon energy cost. 0 pts → baseCost.
// The discount fraction is capped at EFFICIENCY_CAP (CD-05, 0.5) so a power
// weapon never costs less than 50% of base, no matter how much piles in.
export function getEffectivePowerCost(baseCost) {
    const discount = Math.min(EFFICIENCY_CAP, _spVal(this, 'EFFICIENCY') / 100);
    return baseCost * (1 - discount);
}
