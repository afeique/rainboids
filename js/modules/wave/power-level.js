// DIR-01 / Power Level (PWR) estimator — the Adaptive Difficulty Director's
// build-strength prior (Passive Skills & Run Difficulty §14.1). The director
// (difficulty-director.js) tunes per-wave OUTCOMES; PWR is the orthogonal
// PRIOR: a single scalar summary of how strong a player's current build is,
// BEFORE a wave is played, so the director can seed sensible expectations
// instead of cold-starting blind every run.
//
// §14.1 (authoritative):
//   PWR = round( K_PWR · O^0.45 · S^0.35 · U^0.20 )
// with O = offense (≈ effective DPS), S = survivability (EHP + sustain), and
// U = utility (abilities + passives + energy economy). The GEOMETRIC blend is
// the point: a one-dimensional build (glass nuke: huge O, ~0 S) is COMPRESSED
// hard by the S^0.35 / U^0.20 factors, so it can't out-PWR a balanced build
// despite vastly higher raw offense (the §4.1 worked example). Only a build
// strong on BOTH axes (a "synergy god") earns the multiplicative cross-term
// blow-up that lands it ≳ 2× a merely-designed build.
//
// K_PWR is calibrated so a FRESH STARTER build (Wave-1 Pulse Cannon, nothing
// invested) reads ≈ 100 — the PWR_REF anchor. See the constant block + the
// `calibrateKpwr` helper for the derivation; it is the same blend + the same
// K_PWR ≈ 4.4612 the offline stress model (tests/stress/build-model.mjs)
// encodes, re-wired here to read a LIVE player object's effective-stat getters.
//
// Pure: no globals, Date.now(), Math.random(), DOM, rendering, or game-module
// imports. Every player getter is read DEFENSIVELY (guarded against a missing
// method / field → a sensible starter default) so the same code works against
// a real Player AND a lightweight test stub, and NEVER throws or returns NaN
// (all divisors clamped, 1−shield/100 floored, etc.). Unit-tests cleanly.

import { PRIMARY_WEAPONS } from '../combat/weapon-data.js';

/**
 * Tuning constants (§14.1 / §14.6). `KEYSTONE_W` / `MODULAR_W` and the
 * exponent blend are authoritative; `K_PWR` is the calibrated scale so a
 * fresh starter reads `PWR_REF`. Frozen — read-only.
 */
export const PWR_REF = 100;          // a fresh STARTER build anchors here
export const SUSTAIN_WINDOW = 4;     // §14.1 — seconds of sustain folded into S
export const KEYSTONE_W = 3;         // §14.1 — a build-defining keystone passive
export const MODULAR_W = 1;          // §14.1 — a modular (non-keystone) passive
export const BASE_U = 10;            // §14.6 — utility floor (a fresh build ≠ 0)

// Geometric blend exponents (§14.1). Offense-weighted, then survivability,
// then a light utility nudge. They sum to 1.0 so PWR is dimensionally a
// weighted geometric mean scaled by K_PWR.
const O_EXP = 0.45;
const S_EXP = 0.35;
const U_EXP = 0.20;

// Starter baselines used both as defensive defaults for missing getters AND as
// the calibration anchor. These mirror the REAL getter defaults:
//   • Pulse Cannon: damage 1.2, fireRate 400ms ⇒ 2.5 shots/sec (weapon-data.js)
//   • base crit 8% / ×2.0 (player.js baseCritChance / baseCritDamage)
//   • maxHealth 40, shield 15% DR (player.js)
//   • maxEnergy 100, empty→full in 12 000ms ⇒ 100/12 ≈ 8.33 energy/sec
//     (player.js ENERGY_FILL_MS)
//   • ~4 effective lives (3 energy tanks + active hull — Balance §1); the
//     director's prior treats these as an EHP multiplier.
const STARTER = Object.freeze({
    PRIMARY_DAMAGE: 1.2,
    PRIMARY_FIRE_RATE_MS: 400,
    CRIT_CHANCE_PCT: 8,
    CRIT_DAMAGE_PCT: 200,
    MAX_HEALTH: 40,
    SHIELD_PCT: 15,
    MAX_ENERGY: 100,
    ENERGY_FILL_MS: 12000,
    LIVES: 4,
    // Amortized power-weapon DPS for a fresh build. A starter has Charge Shot
    // equipped and energy passively filling, so it contributes a small floor
    // even with nothing invested (matches build-model's starter powerDPS=1.0).
    POWER_DPS: 1.0,
});

/**
 * K_PWR — the scale calibrated so `computePWR(starter) === PWR_REF`. Derived
 * (not magic) from the starter raw product:
 *   O = 1.2·2.5·1·(1+0.08·(2.0−1))·1 + 0.6·1.0 = 3.84
 *   S = 40/(1−0.15)/(1−0)·4 + 0 = 188.235…
 *   U = 10 + 0 + 0 + (8.333·2 + 100/50) + 0 = 28.66…
 *   raw = O^0.45 · S^0.35 · U^0.20 ≈ 22.4156
 *   K_PWR = 100 / 22.4156 ≈ 4.461186
 * Recomputed at load by `calibrateKpwr(starterStub())` so it can never drift
 * from the constants above; the literal is documented for auditability.
 */
export const K_PWR = calibrateStarterK();

// ── defensive readers ───────────────────────────────────────────────────────
// Each guards a missing method/field and falls back to the starter default, so
// computePWR works against a real Player or a partial test stub without ever
// throwing or producing NaN.

function num(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
}

function callOr(player, method, fallback) {
    if (player && typeof player[method] === 'function') {
        const v = player[method]();
        return Number.isFinite(v) ? v : fallback;
    }
    return fallback;
}

function stacks(player, id) {
    if (player && typeof player.getPowerupStacks === 'function') {
        const v = player.getPowerupStacks(id);
        return Number.isFinite(v) && v > 0 ? v : 0;
    }
    return 0;
}

function affix(player, type) {
    if (player && typeof player.getItemAffixTotal === 'function') {
        const v = player.getItemAffixTotal(type);
        return Number.isFinite(v) && v > 0 ? v : 0;
    }
    return 0;
}

function hasPassive(player, id) {
    return !!(player && typeof player.hasPassive === 'function' && player.hasPassive(id));
}

// Active primary weapon config — prefer the live getter, then a direct
// `activePrimary` id, else fall back to the starter Pulse Cannon.
function activePrimaryConfig(player) {
    if (player && typeof player.getActivePrimaryConfig === 'function') {
        const c = player.getActivePrimaryConfig();
        if (c) return c;
    }
    const id = player && player.activePrimary;
    if (id && PRIMARY_WEAPONS[id]) return PRIMARY_WEAPONS[id];
    return PRIMARY_WEAPONS.PULSE_CANNON || {
        damage: STARTER.PRIMARY_DAMAGE,
        fireRate: STARTER.PRIMARY_FIRE_RATE_MS,
        bulletCount: 1,
    };
}

// Effective primary damage. Prefer the real getter (folds powerups / passives /
// overdrive); else the active config's base damage; else the starter default.
function primaryDamage(player) {
    if (player && typeof player.getEffectivePrimaryDamage === 'function') {
        const v = player.getEffectivePrimaryDamage();
        if (Number.isFinite(v) && v > 0) return v;
    }
    const cfg = activePrimaryConfig(player);
    return num(cfg.damage, STARTER.PRIMARY_DAMAGE);
}

// Effective primary fire interval (ms). Prefer the real getter; else the active
// config; clamp to ≥ 1ms so sps never divides by zero / blows up.
function primaryFireRateMs(player) {
    let rate;
    if (player && typeof player.getEffectivePrimaryFireRate === 'function') {
        rate = player.getEffectivePrimaryFireRate();
    }
    if (!(Number.isFinite(rate) && rate > 0)) {
        const cfg = activePrimaryConfig(player);
        rate = num(cfg.fireRate, STARTER.PRIMARY_FIRE_RATE_MS);
    }
    return Math.max(1, rate);
}

// Extra projectiles (shots = 1 + this). Reads `bulletCount−1` off the active
// weapon plus any per-weapon MULTI stacks the player exposes via a convenience
// getter; a plain stub can set `multishotStacks` directly.
function multishotStacks(player) {
    if (player && Number.isFinite(player.multishotStacks)) return Math.max(0, player.multishotStacks);
    if (player && typeof player.getMultishotStacks === 'function') {
        const v = player.getMultishotStacks();
        if (Number.isFinite(v)) return Math.max(0, v);
    }
    const cfg = activePrimaryConfig(player);
    const baseExtra = Math.max(0, num(cfg.bulletCount, 1) - 1);
    return baseExtra;
}

// Piercing count contributing to the §14.1 reach term.
function pierceCount(player) {
    if (player && Number.isFinite(player.pierceCount)) return Math.max(0, player.pierceCount);
    if (player && typeof player.getPierceCount === 'function') {
        const v = player.getPierceCount();
        if (Number.isFinite(v)) return Math.max(0, v);
    }
    const cfg = activePrimaryConfig(player);
    return Math.max(0, num(cfg.piercing, 0));
}

// Does the build apply on-hit explosions (per-weapon EXPLODE upgrade or the
// Explosive concept)? Boolean → 1 / 0 for the reach term.
function hasExplosive(player) {
    if (player && typeof player.hasExplosive === 'function') return !!player.hasExplosive();
    if (player && typeof player.explosive === 'boolean') return player.explosive;
    return false;
}

// Effective crit chance as a fraction (getter returns a percent 0..60).
function critChanceFrac(player) {
    return callOr(player, 'getEffectiveCritChance', STARTER.CRIT_CHANCE_PCT) / 100;
}

// Effective crit multiplier (getter returns a percent; 200 ⇒ ×2.0). The real
// getter randomizes within a band — that's fine for a prior; a stub can return
// a fixed value.
function critMult(player) {
    return callOr(player, 'getEffectiveCritDamage', STARTER.CRIT_DAMAGE_PCT) / 100;
}

function maxHealth(player) {
    return Math.max(1, callOr(player, 'getEffectiveMaxHealth', STARTER.MAX_HEALTH));
}

// Shield as a damage-reduction FRACTION, hard-clamped to [0, 0.99) so the EHP
// divisor (1 − shield) can never be ≤ 0 (shield=100% would divide by zero).
function shieldFrac(player) {
    const pct = callOr(player, 'getEffectiveShield', STARTER.SHIELD_PCT);
    return Math.min(0.99, Math.max(0, pct / 100));
}

// Dodge as a fraction, clamped to [0, 0.99). No single getEffectiveDodge getter
// exists in the live player (it's computed in lifecycle takeDamage from DODGE
// stacks 5%/stack + dodge affixes %, capped 50%), so we MIRROR that math here
// defensively and also honor an explicit convenience getter / field if present.
function dodgeFrac(player) {
    let frac;
    if (player && Number.isFinite(player.dodgeFrac)) frac = player.dodgeFrac;
    else if (player && typeof player.getEffectiveDodgeChance === 'function') frac = player.getEffectiveDodgeChance();
    else {
        const fromStacks = stacks(player, 'DODGE') * 0.05;
        const fromAffix = affix(player, 'dodge') / 100;
        frac = fromStacks + fromAffix;
    }
    if (!Number.isFinite(frac)) frac = 0;
    return Math.min(0.99, Math.max(0, frac));
}

// Effective passive regen (HP/sec) — the live getter is combat-gated downstream
// but returns the raw rate here.
function regenPerSec(player) {
    return Math.max(0, callOr(player, 'getEffectiveRegen', 0));
}

// Lifesteal as a fraction of damage dealt healed. No live getter; derived from
// item lifesteal affixes (rolled %) + a Vampiric passive, honoring an explicit
// field/getter when a stub provides one.
function lifestealFrac(player) {
    if (player && Number.isFinite(player.lifestealFrac)) return Math.max(0, player.lifestealFrac);
    if (player && typeof player.getEffectiveLifesteal === 'function') {
        const v = player.getEffectiveLifesteal();
        if (Number.isFinite(v)) return Math.max(0, v);
    }
    let frac = affix(player, 'lifesteal') / 100;
    if (hasPassive(player, 'VAMPIRIC_ROUNDS')) frac += 0.05;
    return Math.max(0, Number.isFinite(frac) ? frac : 0);
}

// Effective lives — EHP multiplier (energy tanks + active hull). Reads an
// explicit field, else the starter default of 4.
function lives(player) {
    if (player && Number.isFinite(player.lives) && player.lives > 0) return player.lives;
    return STARTER.LIVES;
}

function maxEnergy(player) {
    if (player && typeof player.getMaxEnergy === 'function') {
        const v = player.getMaxEnergy();
        if (Number.isFinite(v) && v > 0) return v;
    }
    return Math.max(1, num(player && player.maxEnergy, STARTER.MAX_ENERGY));
}

// Passive energy regen (energy/sec). The live player fills the meter empty→full
// over ENERGY_FILL_MS (12s), i.e. maxEnergy/12 per second; honor an explicit
// getter for a build that modifies the fill rate.
function energyRegenPerSec(player) {
    if (player && typeof player.getEnergyRegenPerSec === 'function') {
        const v = player.getEnergyRegenPerSec();
        if (Number.isFinite(v) && v >= 0) return v;
    }
    return maxEnergy(player) / (STARTER.ENERGY_FILL_MS / 1000);
}

// Amortized power-weapon DPS = avgPowerDamage · energyRegenPerSec / avgPowerCost
// (§14.1). The live player exposes avg-power data only implicitly; a stub may
// set `powerDPS` directly, else we use the starter floor scaled by the build's
// energy economy relative to the starter's.
function powerDPS(player) {
    if (player && Number.isFinite(player.powerDPS)) return Math.max(0, player.powerDPS);
    const avgDmg = Number.isFinite(player && player.avgPowerDamage) ? player.avgPowerDamage : null;
    const avgCost = Number.isFinite(player && player.avgPowerCost) ? player.avgPowerCost : null;
    if (avgDmg != null && avgCost != null) {
        return avgDmg * energyRegenPerSec(player) / Math.max(1, avgCost);
    }
    // Fallback: scale the starter floor by relative energy throughput.
    const starterRegen = STARTER.MAX_ENERGY / (STARTER.ENERGY_FILL_MS / 1000);
    return STARTER.POWER_DPS * (energyRegenPerSec(player) / starterRegen);
}

// Σ over equipped abilities of potency/sqrt(cooldownSec). Reads the live
// player's `equippedAbilities` (ids) resolved against an `ABILITIES` map the
// player exposes, OR an explicit `abilityU` total a stub provides. Potency is
// derived from whichever effect field an ability carries.
function abilityUtility(player) {
    if (player && Number.isFinite(player.abilityU)) return Math.max(0, player.abilityU);
    const slots = player && Array.isArray(player.equippedAbilities) ? player.equippedAbilities : null;
    const defs = player && player.ABILITIES && typeof player.ABILITIES === 'object' ? player.ABILITIES : null;
    if (!slots || !defs) return 0;
    let total = 0;
    for (const id of slots) {
        if (!id) continue;
        const def = defs[id];
        if (!def) continue;
        const cdSec = Math.max(1, num(def.cooldown, 1000) / 1000);
        const potency = abilityPotency(def);
        total += potency / Math.sqrt(cdSec);
    }
    return total;
}

// A single normalized "potency" scalar for an ability from whatever effect
// field it carries (abilities have heterogeneous fields — damageReduction,
// healPct, orbCount, radius, …). Defaults to 1 so every equipped ability
// contributes a baseline.
function abilityPotency(def) {
    if (Number.isFinite(def.potency)) return def.potency;
    let p = 1;
    if (Number.isFinite(def.damageReduction)) p += def.damageReduction;       // 0..1
    if (Number.isFinite(def.healPct)) p += def.healPct;                        // 0..1
    if (Number.isFinite(def.orbCount)) p += def.orbCount * 0.25;
    if (Number.isFinite(def.droneCount)) p += def.droneCount * 0.5;
    if (Number.isFinite(def.radius)) p += def.radius / 400;
    return p;
}

// Σ over active passives of (keystone ? KEYSTONE_W : MODULAR_W). Reads the live
// player's `activePassives` (a Set of ids) + a `PASSIVES` map for the keystone
// tag, OR an explicit `passiveU` total a stub provides.
function passiveUtility(player) {
    if (player && Number.isFinite(player.passiveU)) return Math.max(0, player.passiveU);
    const active = player && player.activePassives;
    if (!active || typeof active[Symbol.iterator] !== 'function') return 0;
    const defs = player && player.PASSIVES && typeof player.PASSIVES === 'object' ? player.PASSIVES : null;
    let total = 0;
    for (const id of active) {
        const def = defs && defs[id];
        const isKeystone = !!(def && Array.isArray(def.tags) && def.tags.includes('keystone'));
        total += isKeystone ? KEYSTONE_W : MODULAR_W;
    }
    return total;
}

// Σ of utility-affix rolls (orb magnet, cooldown, gold-find, …). A real player
// can sum item affixes; a stub may set `utilityAffix` directly.
function utilityAffixTotal(player) {
    if (player && Number.isFinite(player.utilityAffix)) return Math.max(0, player.utilityAffix);
    return Math.max(0, affix(player, 'utility'));
}

// ── §14.1 sub-scores ─────────────────────────────────────────────────────────

/**
 * Offense ≈ effective DPS (§14.1). primaryDPS = dmg · shots/sec · shots ·
 * crit-expectation · reach, plus 0.6 × amortized power DPS. Always ≥ a tiny
 * positive floor so the geometric blend never sees a zero/negative base.
 */
export function offense(player) {
    const dmg = primaryDamage(player);
    const sps = 1000 / primaryFireRateMs(player);
    const shots = 1 + multishotStacks(player);
    const crit = 1 + critChanceFrac(player) * (critMult(player) - 1);
    const reach = 1 + 0.25 * pierceCount(player) + 0.40 * (hasExplosive(player) ? 1 : 0);
    const primaryDPS = dmg * sps * shots * crit * reach;
    const o = primaryDPS + 0.6 * powerDPS(player);
    return Math.max(1e-6, o);
}

/**
 * Survivability = EHP + sustain · SUSTAIN_WINDOW (§14.1). EHP =
 * maxHealth / (1−shield) / (1−dodge) · lives; sustain = regen + 0.5 · lifesteal
 * · offense. Divisors are clamped (shield/dodge floored away from 1) so EHP is
 * always finite and positive.
 */
export function survivability(player) {
    const hp = maxHealth(player);
    const ehp = (hp / (1 - shieldFrac(player)) / (1 - dodgeFrac(player))) * lives(player);
    const sustain = regenPerSec(player) + 0.5 * lifestealFrac(player) * offense(player);
    return Math.max(1e-6, ehp + sustain * SUSTAIN_WINDOW);
}

/**
 * Utility = BASE_U + abilities + passives + energy economy + utility affixes
 * (§14.1). energy = energyRegenPerSec·2 + maxEnergy/50. Always ≥ BASE_U > 0.
 */
export function utility(player) {
    const ab = abilityUtility(player);
    const pa = passiveUtility(player);
    const en = energyRegenPerSec(player) * 2 + maxEnergy(player) / 50;
    const ua = utilityAffixTotal(player);
    return Math.max(1e-6, BASE_U + ab + pa + en + ua);
}

// ── PWR ───────────────────────────────────────────────────────────────────────

/** The un-scaled geometric product O^0.45 · S^0.35 · U^0.20. */
function rawProduct(player) {
    return Math.pow(offense(player), O_EXP)
        * Math.pow(survivability(player), S_EXP)
        * Math.pow(utility(player), U_EXP);
}

/**
 * PWR = round(K_PWR · O^0.45 · S^0.35 · U^0.20) (§14.1). The estimator's whole
 * output: an integer build-strength prior the difficulty director consumes. A
 * fresh starter ≈ PWR_REF (100). NaN-safe: every sub-score is floored positive,
 * so this never returns NaN/Infinity for any (even adversarial / partial) input.
 */
export function computePWR(player) {
    const v = K_PWR * rawProduct(player);
    return Number.isFinite(v) ? Math.round(v) : 0;
}

// ── calibration ────────────────────────────────────────────────────────────────

/**
 * Build the canonical fresh-starter stub (matches the REAL getter defaults).
 * Used to derive K_PWR at load. Exported shape is intentionally minimal — it
 * exercises the same code path computePWR walks for a live player.
 */
export function starterStub() {
    return {
        activePrimary: 'PULSE_CANNON',
        getEffectivePrimaryDamage: () => STARTER.PRIMARY_DAMAGE,
        getEffectivePrimaryFireRate: () => STARTER.PRIMARY_FIRE_RATE_MS,
        getEffectiveCritChance: () => STARTER.CRIT_CHANCE_PCT,
        getEffectiveCritDamage: () => STARTER.CRIT_DAMAGE_PCT,
        getEffectiveMaxHealth: () => STARTER.MAX_HEALTH,
        getEffectiveShield: () => STARTER.SHIELD_PCT,
        getEffectiveRegen: () => 0,
        getPowerupStacks: () => 0,
        getItemAffixTotal: () => 0,
        hasPassive: () => false,
        maxEnergy: STARTER.MAX_ENERGY,
        lives: STARTER.LIVES,
        powerDPS: STARTER.POWER_DPS,
        abilityU: 0,
        passiveU: 0,
    };
}

/**
 * Solve K_PWR so `computePWR(starter) === target` (default PWR_REF). Pure —
 * used internally to set the K_PWR constant from the starter raw product so the
 * scale can never drift from the STARTER baselines / blend exponents above.
 */
export function calibrateKpwr(starter, target = PWR_REF) {
    const raw = rawProduct(starter);
    return raw > 0 ? target / raw : 0;
}

// Internal: compute K_PWR from the canonical starter at load.
function calibrateStarterK() {
    return calibrateKpwr(starterStub(), PWR_REF);
}
