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

// ── Per-run progression (8.x looter pivot, T24) ──────────────────────────
// Level / XP / SP are PER-RUN: every run starts at level 1 / 0 SP and climbs
// from kills, then RESETS next run — so allocated points can be strong without
// permanent account-wide power-creep. (6.35.0 made these persist across runs;
// that banked level/SP is converted to Rainshards ONCE on load — see
// game-engine._migrateBankedProgression — and the account meta no longer
// carries level/XP/SP.) `level`, `xp`, `sp`, and `spStats` live on the player
// for the duration of a run and are captured by the wave-start run snapshot
// (serializeRunState) so CONTINUE resumes the in-run climb.
import { xpForLevel, MAX_LEVEL, SP_STATS, SP_STAT_MAX_POINTS } from '../core/sp-stats.js';
import { EFFICIENCY_CAP, FLUX_PER_STACK, CAPACITOR_BANK_OVERCHARGE_MULT, CAPACITOR_BANK_DECAY_PER_SEC } from '../core/constants.js';
// T26 — Gear amplification (§2.1). Gear/Matrix/set bonuses are % AMPLIFIERS of
// an invested SP stat, ramped by the per-run level (dormant at L1, full at
// LEVEL_SOFTCAP). amplifySP(spValue, ampPct, level) is the single source.
import { amplifySP } from '../core/gear-scaling.js';
// T28 — socketed Matrices amplify the same SP stats as gear affixes (§2.2):
// aggregateMatrixAmp folds the per-slot Matrix line (×tier) + per-type resonance.
import { aggregateMatrixAmp } from '../world/matrix-system.js';
import { frameClock } from '../core/frame-clock.js';
import { playerChillSpeedMult } from './player-status.js';
// SYS-8 / ENMY-05 — buff-strip suppression convention. After a Leech strips a
// powerup it stamps `player._buffSuppressed[type] = now + STRIP_DURATION_MS`;
// addPowerup honors this so a just-stripped powerup can't be instantly
// re-acquired until the window lapses. Default-safe: with no stamp,
// isBuffSuppressed returns false and addPowerup behaves byte-for-byte as before.
import { isBuffSuppressed } from '../enemy/abilities/buff-strip.js';

// Initialize the player's per-run progression to the level-1 baseline (called
// in the Player ctor — i.e. at every run-start build). T24: no longer reads
// persistent account level/SP; each run starts fresh at level 1 / 0 SP.
export function initMeta() {
    this.level = 1;
    this.xp = 0;
    this.sp = 0;
    this.spStats = {};
    for (const s of SP_STATS) this.spStats[s.id] = 0;
}

// T24 — per-run level/SP no longer persists to the account meta. The in-run
// values live on the player and are captured by the wave-start run snapshot
// (serializeRunState) for CONTINUE; they intentionally do NOT carry into the
// next run. Kept as a no-op so existing callers (addXp / allocateSp /
// deallocateSp / debug grants) don't break.
export function saveMetaState() { /* no-op — level/SP are per-run (T24) */ }

// Award XP toward the next level. Rolls over multiple levels if needed;
// each level grants +1 SP. Sets `_leveledUpPending` so the wave-clear
// flow knows to open the STATS screen. Persists on any level gain.
export function addXp(amount) {
    if (!(amount > 0) || this.level >= MAX_LEVEL) return;
    this.xp = (this.xp || 0) + amount;
    let leveled = false;
    while (this.level < MAX_LEVEL) {
        const need = xpForLevel(this.level);
        if (this.xp < need) break;
        this.xp -= need;
        this.level += 1;
        this.sp = (this.sp || 0) + 1;
        leveled = true;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    if (leveled) {
        this._leveledUpPending = true;
        this.saveMetaState();
        // T25 — PWR is LIVE current power: a level-up raises the level-ramp that
        // gear amplifies (T26) and unlocks SP to invest, so refresh the build-
        // strength prior the difficulty director reads. Guarded off-engine.
        this.gameEngine?.recomputePlayerPWR?.();
        // 6.148.0 — re-arm the on-screen LEVEL UP announcement. The 6.0.0
        // refactor no-op'd triggerLevelUpEffects and the 6.35.0 meta-leveling
        // never re-wired it, so level-ups had gone silent. The canvas
        // animation (ship aura + wavy "LEVEL UP!" text + "+N SP" subtitle) is
        // driven by `levelUpAnimation`; the DOM ui:show-message path is dead
        // (game-message-overlay is commented out of index.html).
        triggerLevelUpAnnounce.call(this);
    }
}

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

// Spend one SP on a stat (respecting the 20-point cap + unspent SP).
// Returns true on success. Persists on change.
export function allocateSp(statId) {
    if (!this.spStats || !(statId in this.spStats)) return false;
    if ((this.sp || 0) <= 0) return false;
    if (this.spStats[statId] >= SP_STAT_MAX_POINTS) return false;
    this.spStats[statId] += 1;
    this.sp -= 1;
    this.saveMetaState();
    // T25 — SP investment changes effective stats; refresh the live PWR prior.
    this.gameEngine?.recomputePlayerPWR?.();
    return true;
}

// 6.36.0 — Pull one SP back out of a stat (refund to the unspent pool)
// so the player can freely redistribute. Returns true on success.
export function deallocateSp(statId) {
    if (!this.spStats || !(statId in this.spStats)) return false;
    if ((this.spStats[statId] | 0) <= 0) return false;
    this.spStats[statId] -= 1;
    this.sp = (this.sp || 0) + 1;
    this.saveMetaState();
    // T25 — SP investment changes effective stats; refresh the live PWR prior.
    this.gameEngine?.recomputePlayerPWR?.();
    return true;
}

// Raw value of an SP stat (points × max/20) — the pre-amplification base.
function _spVal(player, statId) {
    const def = SP_STATS.find((s) => s.id === statId);
    if (!def || !player || !player.spStats) return 0;
    const pts = player.spStats[statId] | 0;
    return pts * (def.max / SP_STAT_MAX_POINTS);
}

// T26 — Σ of the rolled % amplifiers for `statId` across equipped gear, as a
// fraction. New gear affixes are `{ stat: <SP id>, pct }` (item-templates /
// gear-gen §2.1); Matrices + resonance + set bonuses fold in here at T28. The
// OLD flat `{ type, value }` affixes (resists, legacy gear) carry no `stat`, so
// they contribute nothing — gear is now %-amp, never flat. Returns 0 with no
// equipped gear (→ amplifySP collapses to the raw SP value).
function _gearAmpPct(player, statId) {
    let pct = 0;
    const eq = player && player.equippedItems;
    if (eq) {
        let anyMatrix = false;
        for (const slot of Object.keys(eq)) {
            const it = eq[slot];
            if (!it) continue;
            if (it.matrix) anyMatrix = true;
            if (Array.isArray(it.affixes)) {
                for (const a of it.affixes) {
                    if (a && a.stat === statId && Number.isFinite(a.pct)) pct += a.pct;
                }
            }
        }
        // T28 — socketed Matrices (+ per-type resonance) amplify the same SP
        // stats as gear affixes (§2.2). aggregateMatrixAmp folds each piece's
        // per-slot Matrix line × tier + the resonance bonus. Skipped entirely
        // when no socket is filled (the common early-game case).
        if (anyMatrix) {
            const matrixAmp = aggregateMatrixAmp(Object.values(eq).filter(Boolean));
            if (Number.isFinite(matrixAmp[statId])) pct += matrixAmp[statId];
        }
    }
    return pct / 100;
}

// T26 — effective SP-stat value WITH gear amplification + level ramp:
//   amplifySP(SP_value, gearAmpPct, level) = SP_value × (1 + ampPct × levelRamp).
// Default-safe: no invested SP → 0; no gear OR level 1 → just the raw SP value
// (so the starter + un-geared early waves read exactly as before T26).
function _ampSp(player, statId) {
    return amplifySP(_spVal(player, statId), _gearAmpPct(player, statId), (player && player.level) || 1);
}

// P2 — additive contribution of the active rule-modifier passives for a stat
// key (0 until a passive declares a numeric `mods[key]` in P6). Guards a
// non-Player `this` (some getter unit tests stub it).
function _passiveMod(player, key) {
    return (player && typeof player.getPassiveMod === 'function') ? player.getPassiveMod(key) : 0;
}
// T26 — the player-facing effective SP-stat value is now gear-amplified, so
// external consumers (combat-manager THORNS/VAMPIRISM, lifecycle DODGE,
// power-level PWR prior) all inherit §2.1 amplification through getSpStatValue.
export function spStatTotal(statId) {
    return _ampSp(this, statId);
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
export function getItemAffixTotal(type) {
    let total = 0;
    if (this.equippedItems) {
        for (const slot of Object.keys(this.equippedItems)) {
            const it = this.equippedItems[slot];
            if (it && Array.isArray(it.affixes)) {
                for (const a of it.affixes) {
                    if (a.type === type) total += (a.value || 0);
                }
            }
        }
    }
    return total;
}

// ── Effective stat calculations ───────────────────────────────────────────

export function getMovementSpeedMultiplier() {
    const speedBoostStacks = this.getPowerupStacks('SPEED_BOOST');
    // Each stack: +65% thrust. T26 — SP SPEED, gear-amplified (§2.1), adds its
    // effective % on top (gear amplifies the SP investment, never flat).
    const speedPct = _ampSp(this, 'SPEED') / 100;
    // A.E9-S1 — CHILL (from enemy Cryo hits) slows the player's thrust/top speed.
    return (1 + speedBoostStacks * 0.65 + speedPct) * playerChillSpeedMult(this, frameClock.now);
}

// T29 — R$-find is the looter pivot's build axis on the income faucet (§2.4):
// combat-manager feeds this as `findMult` into perKillRainshards (capped near
// ×3 by INCOME.findMult). Gear R$-find affixes + a Hoarder's Greed passive +
// the economy Matrix line will stack here. No such source exists yet (content
// TBD), so this returns the ×1 floor — the hook is wired ahead of the content.
export function getGoldFindMultiplier() {
    return 1;
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
// 6.x — Baseline passive regen: EVERY player slowly heals out of combat (after
// the 4s no-damage gate in updatePowerups), even with zero regen investment.
// Gentle (heals the 40-HP active tank in ~80s) so it's a recovery aid, not a
// crutch; REGEN/items/SP stack on top, still capped by REGEN_RATE_CAP.
const BASE_PASSIVE_REGEN = 0.5;
export function getEffectiveRegen() {
    let regen = BASE_PASSIVE_REGEN;
    const stacks = this.getPowerupStacks ? this.getPowerupStacks('REGEN') : 0;
    if (stacks > 0) regen += stacks * 0.5;
    regen += _passiveMod(this, 'regen');       // P2 — passive numeric mods
    regen += _ampSp(this, 'REGENERATION');     // CD-08/T26 — SP regen, gear-amplified (§2.1); 0 pts → 0
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

    // T26 — SP TOUGHNESS, gear-amplified (§2.1): equipped gear amplifies the
    // invested TOUGHNESS SP (a % of it, ramped by level) rather than adding a
    // flat % — so toughness gear is dormant early and rewards specialization.
    // `this.shield` (the base 15% DR) is a separate concept; SHIELD_BOOST
    // powerup stacks on top.
    const totalShield = baseShield + shieldBoostAmount + _ampSp(this, 'TOUGHNESS') + _passiveMod(this, 'toughness');
    return Math.min(75, totalShield); // Cap at 75%
}

export function getEffectiveMaxHealth() {
    const baseMaxHealth = this.maxHealth;
    const healthBoostStacks = this.getPowerupStacks('HEALTH_BOOST');
    const healthBoostAmount = healthBoostStacks * 35; // +35 max health per stack (was +25)

    // T26 — SP HEALTH, gear-amplified (§2.1): gear amplifies the invested
    // HEALTH SP rather than adding flat max-HP, so HP gear is dormant early.
    const spHealth = _ampSp(this, 'HEALTH');

    // P6 — passive max-HP multipliers (Glass Cannon ×0.5, Failsafe ×0.85, …)
    // apply AFTER the additive bonuses, so "−50% max HP" halves the whole pool.
    const hpMult = (typeof this.getPassiveMaxHpMult === 'function') ? this.getPassiveMaxHpMult() : 1;
    const totalMaxHealth = (baseMaxHealth + healthBoostAmount + spHealth + _passiveMod(this, 'maxHp')) * hpMult;
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

    // T26 — SP CRIT_CHANCE, gear-amplified (§2.1).
    const totalCritChance = baseCritChance + critChanceBonus
        + _ampSp(this, 'CRIT_CHANCE') + _passiveMod(this, 'critChance');
    return Math.min(60, totalCritChance); // Cap raised 50% → 60%
}

export function getEffectiveCritDamage() {
    const critDamageStacks = this.getPowerupStacks('CRIT_DAMAGE');
    const critDamageBonus = critDamageStacks * 15; // +15% per stack (was +10%)

    // Randomize between 2x (200%) and 3x (300%) base, plus stacks.
    // T26 — SP CRIT_DAMAGE, gear-amplified (§2.1).
    const itemCritDmg = _ampSp(this, 'CRIT_DAMAGE') + _passiveMod(this, 'critDamage');
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
    const base = (this.maxEnergy || 100) + _ampSp(this, 'CAPACITOR'); // T26 — gear-amplified SP
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
    return (1 + _ampSp(this, 'REACTOR') / 100 + (this._fluxStacks || 0) * FLUX_PER_STACK) * overflow; // T26 — gear-amplified SP
}

// EFFICIENCY — discounts power-weapon energy cost. 0 pts → baseCost.
// The discount fraction is capped at EFFICIENCY_CAP (CD-05, 0.5) so a power
// weapon never costs less than 50% of base, no matter how much piles in.
export function getEffectivePowerCost(baseCost) {
    const discount = Math.min(EFFICIENCY_CAP, _ampSp(this, 'EFFICIENCY') / 100); // T26 — gear-amplified SP
    return baseCost * (1 - discount);
}
