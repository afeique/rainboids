// build-model.mjs — shared build-archetype + power math for the stress suite.
//
// ANALYSIS ONLY. Not a test. Run via the *.analysis.mjs scripts. This module
// encodes:
//   • a matrix of player BUILD ARCHETYPES (multiplier stacks from Balance §2),
//   • effective DPS / EHP / sustain math (Balance §1/§2, Passive §14.1 offense
//     & survivability),
//   • the §14.1 geometric PWR blend (PWR = K · O^0.45 · S^0.35 · U^0.20),
//   • reference enemies + TTK/TTD,
// all grounded in REAL imported baselines from the game's weapon-data.js.
//
// Nothing here mutates game state; pure functions + frozen data.

import { PRIMARY_WEAPONS, POWER_WEAPONS } from '../../js/modules/combat/weapon-data.js';

// ── Base numbers (from source — Balance §1 + player.js init) ────────────────
// player.js: HP 40 / maxHP 40, shield 15% DR, baseCritChance 8, baseCritDamage
// 200% (×2.0). Crit-chance cap 60% (progression.js), crit-dmg avg up to ~550%.
export const BASE = Object.freeze({
    HP: 40,                 // player.js this.maxHealth
    HP_CAP: 600,            // progression.js getEffectiveMaxHealth clamp
    SHIELD_DR: 0.15,        // player.js this.shield (15% DR)
    SHIELD_DR_CAP: 0.75,    // SHIELD_BOOST cap (Balance §1 / weapon-data desc)
    DODGE_CAP: 0.50,        // DODGE cap (Balance §1)
    CRIT_CHANCE: 0.08,      // base 8%
    CRIT_MULT: 2.0,         // base ×2.0 (200%)
    LIVES: 4,               // ~4 lives (3 tanks + active) — Balance §1
});

// ── Standard primary DPS baseline (Balance §1: "Standard primary DPS ≈ 3.0") ─
// Computed honestly from imported weapon-data so the number is auditable, not
// hard-coded. DPS = damage · (1000/fireRate) · bulletCount.
export function primaryBaseDPS(weaponId) {
    const w = PRIMARY_WEAPONS[weaponId];
    if (!w) return 0;
    const sps = 1000 / w.fireRate;
    return w.damage * sps * (w.bulletCount || 1);
}

// The "standard" reference primary DPS used as the offense base. Pulse Cannon
// (the starter) is the canonical baseline: 1.2 dmg · 2.5 sps = 3.0 DPS.
export const STD_PRIMARY_DPS = primaryBaseDPS('PULSE_CANNON'); // = 3.0

// ── Reference enemies (Balance §1 base HP × §1 wave-scaling) ────────────────
// Wave HP mult: 1 + t·8 + t^2.5·6.5, t=(w-1)/29. W20 ⇒ ×7.5 (matches doc).
export function waveHpMult(wave) {
    const t = (wave - 1) / 29;
    return 1 + t * 8 + Math.pow(t, 2.5) * 6.5;
}

// §14.5 absolute baseline curve (the TARGET model's HP ramp): 1 + A·w + B·w^1.5
export function baselineCurve(wave, A = 0.15, B = 0.06) {
    return 1 + A * wave + B * Math.pow(wave, 1.5);
}

// Representative enemy HP pools at a wave. Balance §3 reference: a Wave-20
// Prowler = base 14 × 7.5 ≈ 105 HP. Trash = Hunter base 5. Boss-tier = Titan
// base 20 × tier ×8 (Balance §5 "boss tier ×4–8").
export function refEnemies(wave) {
    const m = waveHpMult(wave);
    return {
        trash: 5 * m,            // Hunter-class
        elite: 14 * m,           // Prowler-class (the §3 reference)
        boss: 20 * m * 8,        // Titan-class × boss tier 8
    };
}

// Representative incoming enemy DPS-on-player at a wave. Balance §3: contact 25
// × ~×3 by W20 ≈ 75/hit, and roughly one threatening hit per ~1.5s in a busy
// wave ⇒ ~50 DPS-on-player at W20. We scale contact-damage as ×(1 + 2·t) per
// the §1 ⚠ assumption (×~2–4 by W30) and assume ~0.66 threatening hits/sec.
export function incomingDPS(wave) {
    const t = (wave - 1) / 29;
    const perHit = 25 * (1 + 2 * t);      // ⚠ §1 contact-damage assumption
    const hitsPerSec = 0.66;              // busy-wave threatening-hit cadence
    return perHit * hitsPerSec;
}

// ── BUILD ARCHETYPES ────────────────────────────────────────────────────────
// Each archetype is expressed as MULTIPLIER STACKS over the base, sourced from
// Balance §2 (offense × table, defense × table) and §10 (per-point stats). The
// fields feed the offense/survivability/utility computations below.
//
//   offMult    — composite offense ×  (crit + fireRate + keystone + conditional)
//   critChance — effective crit chance (frac)  → drives crit-expectation
//   critMult   — effective crit multiplier (×)
//   multishot  — extra projectiles (so shots = 1 + multishot)
//   reach      — hits-more-targets factor (pierce/explosive) — §14.1 reach term
//   hpMult     — max-HP × (HEALTH_BOOST stacks + keystone maxHpMult)
//   drFrac     — damage-reduction fraction (shield)
//   dodgeFrac  — dodge fraction
//   lives      — effective lives
//   lifesteal  — fraction of damage dealt healed (Vampirism + bloodshield-ish)
//   regen      — HP/sec passive regen
//   abilityU   — Σ potency/sqrt(cooldownSec) utility (§14.1 utility ab term)
//   passiveU   — Σ keystone/modular passive weights (KEYSTONE_W 3 / MODULAR_W 1)
//   energyU    — energyRegenPerSec·2 + maxEnergy/50 (§14.1 utility en term)
//   powerDPS   — amortized power-weapon DPS (added to offense, §14.1 ·0.6)
//
// These cover "every fathomable build": fresh, the four cardinal extremes,
// hybrids, accidental builds, the defensive/balanced middle, and the floor.
export const ARCHETYPES = [
    {
        key: 'starter', name: 'Starter / fresh',
        note: 'Wave-1 Pulse Cannon, nothing invested. Calibration anchor (PWR≈100).',
        offMult: 1.0, critChance: 0.08, critMult: 2.0, multishot: 0, reach: 1.0,
        hpMult: 1.0, drFrac: 0.15, dodgeFrac: 0.0, lives: 4,
        lifesteal: 0, regen: 0, powerDPS: 1.0,
        abilityU: 0, passiveU: 0, energyU: 8.33 * 2 + 100 / 50, // base energy econ
    },
    {
        key: 'balanced', name: 'Balanced mid',
        note: 'Generalist (Balance §10 profile 1): T≈1.0,S≈1.0. The invisible middle.',
        offMult: 6.0, critChance: 0.30, critMult: 2.6, multishot: 1, reach: 1.25,
        hpMult: 4.0, drFrac: 0.45, dodgeFrac: 0.20, lives: 4,
        lifesteal: 0.05, regen: 1.0, powerDPS: 8.0,
        abilityU: 4, passiveU: 4, energyU: 11 * 2 + 130 / 50,
    },
    {
        key: 'crit_assassin', name: 'Designed Crit-Assassin',
        note: 'Balance §3 Crit Assassin: offense ×14, in-band TTK ~2.5s.',
        offMult: 14.0, critChance: 0.50, critMult: 3.0, multishot: 1, reach: 1.25,
        hpMult: 3.0, drFrac: 0.40, dodgeFrac: 0.20, lives: 4,
        lifesteal: 0.10, regen: 1.0, powerDPS: 6.0,
        abilityU: 5, passiveU: 6, energyU: 11 * 2 + 130 / 50,
    },
    {
        key: 'glass_nuke', name: 'Glass Nuke',
        note: 'Balance §3 Glass Nuke: offense ×30, ~0 defense. T≈3.0,S≈0.5.',
        offMult: 30.0, critChance: 0.50, critMult: 3.2, multishot: 2, reach: 1.5,
        hpMult: 1.0, drFrac: 0.15, dodgeFrac: 0.0, lives: 1, // GLASS_CANNON 0.5×HP-ish via low invest
        lifesteal: 0, regen: 0, powerDPS: 4.0,
        abilityU: 2, passiveU: 3, energyU: 9 * 2 + 110 / 50,
    },
    {
        key: 'pure_tank', name: 'Pure Tank',
        note: 'Balance §3/§10 Defensive Turtle: max EHP, low DPS. T≈0.6,S≈3.0+.',
        offMult: 1.5, critChance: 0.15, critMult: 2.2, multishot: 0, reach: 1.0,
        hpMult: 9.75, drFrac: 0.75, dodgeFrac: 0.50, lives: 4, // 40→390, 75% DR, 50% dodge
        lifesteal: 0.05, regen: 2.0, powerDPS: 2.0,
        abilityU: 3, passiveU: 4, energyU: 11 * 2 + 130 / 50,
    },
    {
        key: 'vampire_bruiser', name: 'Vampire Bruiser',
        note: 'Balance §3 Vampire Bruiser: ×9 offense + 25% lifesteal + bloodshield. ~unkillable.',
        offMult: 9.0, critChance: 0.35, critMult: 2.8, multishot: 1, reach: 1.25,
        hpMult: 7.0, drFrac: 0.60, dodgeFrac: 0.20, lives: 4,
        lifesteal: 0.25, regen: 2.0, powerDPS: 5.0,
        abilityU: 4, passiveU: 6, energyU: 11 * 2 + 130 / 50,
    },
    {
        key: 'synergy_god', name: 'Synergy God',
        note: 'Balance §3/§9 both-axes-maxed god. T≈3.5,S≈3.0. The cross-term unlock.',
        offMult: 40.0, critChance: 0.55, critMult: 3.4, multishot: 2, reach: 1.5,
        hpMult: 9.75, drFrac: 0.75, dodgeFrac: 0.50, lives: 4,
        lifesteal: 0.25, regen: 2.0, powerDPS: 10.0,
        abilityU: 6, passiveU: 9, energyU: 13 * 2 + 175 / 50,
    },
    {
        key: 'aggro_masher', name: 'Aggro Masher',
        note: 'Balance §10 profile 3: all damage, skips defense, mediocre dodge — accidental glass cannon. T≈2.5,S≈0.5.',
        offMult: 18.0, critChance: 0.40, critMult: 2.9, multishot: 2, reach: 1.4,
        hpMult: 1.5, drFrac: 0.15, dodgeFrac: 0.0, lives: 2,
        lifesteal: 0, regen: 0, powerDPS: 5.0,
        abilityU: 3, passiveU: 4, energyU: 9 * 2 + 110 / 50,
    },
    {
        key: 'defensive_turtle', name: 'Defensive Turtle',
        note: 'Balance §10 profile 2 (distinct from Pure Tank — even lower DPS, cautious play). T≈0.6,S≈3.0.',
        offMult: 1.2, critChance: 0.10, critMult: 2.1, multishot: 0, reach: 1.0,
        hpMult: 8.0, drFrac: 0.70, dodgeFrac: 0.40, lives: 4,
        lifesteal: 0.10, regen: 2.0, powerDPS: 1.5,
        abilityU: 3, passiveU: 4, energyU: 11 * 2 + 130 / 50,
    },
    {
        key: 'off_build_min', name: 'Off-build / min',
        note: 'Balance §3 Min build: ~×1.5 offense, light defense, deep wave — the floor.',
        offMult: 1.5, critChance: 0.08, critMult: 2.0, multishot: 0, reach: 1.0,
        hpMult: 2.0, drFrac: 0.30, dodgeFrac: 0.0, lives: 3,
        lifesteal: 0, regen: 0.4, powerDPS: 1.0,
        abilityU: 1, passiveU: 1, energyU: 8.33 * 2 + 100 / 50,
    },
];

// ── §14.1 Offense — effective DPS (primary + amortized power) ───────────────
// primaryDPS = dmg · sps · shots · crit-expectation · reach.
// The base 3.0 already bakes dmg·sps for the starter; offMult carries the
// damage/fire-rate/keystone/conditional stack. crit-expectation is applied
// EXPLICITLY here (not folded into offMult) so the crit axis is auditable:
//   crit = 1 + critChance·(critMult − 1).
// shots = 1 + multishot. powerDPS added at 0.6 weight (§14.1).
export function offense(b) {
    const critExpect = 1 + b.critChance * (b.critMult - 1);
    const shots = 1 + b.multishot;
    const primaryDPS = STD_PRIMARY_DPS * b.offMult * critExpect * shots * b.reach;
    return primaryDPS + 0.6 * (b.powerDPS || 0);
}

// Effective DPS WITHOUT the 0.6 power term — the "what you feel on a single
// target" number used for TTK.
export function effectiveDPS(b) {
    const critExpect = 1 + b.critChance * (b.critMult - 1);
    const shots = 1 + b.multishot;
    return STD_PRIMARY_DPS * b.offMult * critExpect * shots * b.reach + (b.powerDPS || 0);
}

// ── §14.1 Survivability — EHP + sustain ─────────────────────────────────────
// ehp = maxHP / (1−DR) / (1−dodge) · lives ; sustain = regen + 0.5·lifesteal·offense
// survivability = ehp + sustain · SUSTAIN_WINDOW (4s).
const SUSTAIN_WINDOW = 4;
export function maxHealth(b) {
    return Math.min(BASE.HP_CAP, BASE.HP * b.hpMult);
}
export function ehp(b) {
    const hp = maxHealth(b);
    return (hp / (1 - b.drFrac) / (1 - b.dodgeFrac)) * b.lives;
}
export function sustainPerSec(b) {
    return (b.regen || 0) + 0.5 * (b.lifesteal || 0) * offense(b);
}
export function survivability(b) {
    return ehp(b) + sustainPerSec(b) * SUSTAIN_WINDOW;
}

// ── §14.1 Utility ────────────────────────────────────────────────────────────
// utility = BASE_U + abilityU + passiveU + energyU + utilityAffix(0 here).
const BASE_U = 10; // §14.6 BASE_U (starter floor so a fresh build isn't 0)
export function utility(b) {
    return BASE_U + (b.abilityU || 0) + (b.passiveU || 0) + (b.energyU || 0);
}

// ── §14.1 PWR (geometric blend) ──────────────────────────────────────────────
// PWR = K_PWR · O^0.45 · S^0.35 · U^0.20. K_PWR calibrated so STARTER ≈ 100.
export function rawPwrProduct(b) {
    return Math.pow(offense(b), 0.45) * Math.pow(survivability(b), 0.35) * Math.pow(utility(b), 0.20);
}
export function calibrateKpwr(starter, target = 100) {
    return target / rawPwrProduct(starter);
}
export function pwr(b, kPwr) {
    return Math.round(kPwr * rawPwrProduct(b));
}

// ── TTK / TTD ────────────────────────────────────────────────────────────────
export function ttk(b, enemyHp) {
    const dps = effectiveDPS(b);
    return dps > 0 ? enemyHp / dps : Infinity;
}
export function ttd(b, enemyDps) {
    return enemyDps > 0 ? survivability(b) / enemyDps : Infinity;
}
