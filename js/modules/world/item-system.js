// 6.0.0 — Items overhaul:
//   - 5 slots (cockpit, hull, shielding, chassis, nanites — 6.2.2)
//   - Rarity tiers (common / rare / epic) drive primary-stat variance
//     and a visible glow color so the player can spot a good drop at
//     a distance.
//   - Primary stat now ROLLS within a range (was deterministic per
//     level). Epic ≈ 1.85× the band of a common.
//   - Item LEVEL is the wave number the pickup dropped on. Player no
//     longer has a level — wave drives all scaling now.
//   - Trinket primary IS regen (HP/s). HP / toughness items can still
//     roll a small secondary regen affix.
//   - isUpgrade uses a unified score (primary normalized to HP value
//     + 8× regenBonus) so an item's worth is comparable across slots.
//
// Bonus formulas (wave-driven, pre-rarity-multiplier):
//   HP base:        5 + (wave - 1) × 2     →  W1=5, W5=13, W10=23, W20=43, W30=63
//   Toughness base: 3 + (wave - 1) × 0.4   →  W1=3, W5=4.6, W10=6.6, W20=10.6, W30=14.6
//   Regen base:     0.30 + (wave - 1) × 0.05 → W1=0.30, W5=0.50, W10=0.75, W20=1.25, W30=1.75
//
// Rarity multiplier bands:
//   common: 0.85-1.05  rare: 1.00-1.40  epic: 1.35-1.85
//
// Secondary regen affix (HP/tough items only):
//   25% roll chance. Value: 0.20 + (wave - 1) × 0.035 (rounded 1 dp).

import {
    ITEM_BASES, ITEM_PREFIXES,
    SLOT_BONUS_TYPE, SLOT_LABEL, SLOT_ACCENT, SLOT_ORDER,
    RARITY_TIERS, RARITY_ORDER, rollRarity,
    ITEM_AFFIX_POOL, AFFIX_SCORE_WEIGHT,
} from './item-names.js';

export function getHpBonusForLevel(level) {
    const L = Math.max(1, level | 0);
    return 5 + (L - 1) * 2;
}

export function getToughnessBonusForLevel(level) {
    const L = Math.max(1, level | 0);
    return Math.round((3 + (L - 1) * 0.4) * 10) / 10;
}

export function getRegenBonusForLevel(level) {
    const L = Math.max(1, level | 0);
    const raw = 0.30 + (L - 1) * 0.05;
    return Math.round(raw * 100) / 100;
}

function _pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
}

function _rollMult(rarityKey) {
    const tier = RARITY_TIERS[rarityKey] || RARITY_TIERS.common;
    return tier.multMin + Math.random() * (tier.multMax - tier.multMin);
}

const REGEN_AFFIX_CHANCE = 0.25;
function _rollRegenAffix(level) {
    if (Math.random() >= REGEN_AFFIX_CHANCE) return 0;
    const L = Math.max(1, level | 0);
    const raw = 0.20 + (L - 1) * 0.035;
    return Math.round(raw * 10) / 10;
}

/**
 * Generate a fresh item for a given slot at a given wave-level.
 * Optionally accepts a pre-rolled rarity (for boss-biased drops).
 *
 * Returns:
 *   {
 *     slot, level, name, bonus, bonusType,
 *     bonusLabel,    // human-readable label
 *     regenBonus,    // HP/s — primary for trinket, secondary for others
 *     rarity,        // 'common' | 'rare' | 'epic'
 *     rarityColor,   // glow color
 *     accentColor,   // SLOT_ACCENT[slot]
 *   }
 */
export function createItem(slot, level, rarityKey = null) {
    if (!ITEM_BASES[slot]) slot = 'cockpit';
    const rarity = rarityKey || rollRarity();
    const tier = RARITY_TIERS[rarity] || RARITY_TIERS.common;
    const L = Math.max(1, level | 0);

    // 6.32.0 — Roll AFFIXES that mirror the passive stat set. Affix
    // count by rarity: common 1, rare 2, epic 3. Each affix value is
    // wave-scaled × an independent rarity-mult roll, so two epics of
    // the same slot still differ.
    const affixCount = rarity === 'epic' ? 3 : (rarity === 'rare' ? 2 : 1);
    const pool = ITEM_AFFIX_POOL.slice();
    // Fisher-Yates shuffle, take the first `affixCount` distinct affixes.
    for (let i = pool.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const chosen = pool.slice(0, affixCount);

    const affixes = chosen.map((def) => {
        const raw = (def.base + (L - 1) * def.perWave) * _rollMult(rarity);
        const value = def.pct
            ? Math.max(def.min, Math.round(raw * 10) / 10)
            : (def.type === 'regen'
                ? Math.max(def.min, Math.round(raw * 100) / 100)
                : Math.max(def.min, Math.round(raw)));
        return { type: def.type, value, label: def.label(value) };
    });

    const bonusLabel = affixes.map((a) => a.label).join(' · ');

    // Name: prefix family keyed off the first affix's flavor bucket.
    const primary = chosen[0];
    const prefix = _pick(ITEM_PREFIXES[primary.prefix] || ITEM_PREFIXES.hp);
    const base   = _pick(ITEM_BASES[slot]);
    const adj = tier.rarityAdjective ? `${tier.rarityAdjective} ` : '';
    const name = `${adj}${prefix} ${base}`;

    // Legacy fields kept for any straggler reads / display: primary
    // affix becomes `bonus`/`bonusType`, and `regenBonus` sums any
    // regen affixes (getEffectiveRegen now reads affixes directly).
    const first = affixes[0];
    const regenBonus = affixes.filter((a) => a.type === 'regen').reduce((s, a) => s + a.value, 0);

    return {
        slot,
        level: L,
        name,
        affixes,
        bonus: first.value,
        bonusType: first.type,
        bonusLabel,
        regenBonus,
        rarity,
        rarityColor: tier.color,
        rarityLabel: tier.label,
        rarityGlow:  tier.glow,
        accentColor: SLOT_ACCENT[slot] || '#33ddff',
    };
}

/**
 * Unified score for cross-rarity / cross-affix comparison.
 *   hp:        1 HP = 1 pt
 *   toughness: 1% DEF = 8 pts (a 5% reduction stat ≈ +40 effective HP)
 *   regen:     1 HP/s = 16 pts (regen compounds; weight higher)
 * Secondary regenBonus on HP/tough items adds 8× per HP/s.
 */
export function scoreItem(item) {
    if (!item) return 0;
    // 6.32.0 — Sum every affix's weighted value (normalized to an
    // "effective HP" scale via AFFIX_SCORE_WEIGHT).
    if (Array.isArray(item.affixes)) {
        let s = 0;
        for (const a of item.affixes) {
            s += (a.value || 0) * (AFFIX_SCORE_WEIGHT[a.type] || 1);
        }
        return s;
    }
    // Legacy single-bonus fallback.
    let s = 0;
    if (item.bonusType === 'hp')        s += item.bonus || 0;
    else if (item.bonusType === 'toughness') s += (item.bonus || 0) * 8;
    else if (item.bonusType === 'regen')     s += (item.bonus || 0) * 16;
    if (item.bonusType !== 'regen' && item.regenBonus) s += item.regenBonus * 8;
    return s;
}

/**
 * Strict-dominant upgrade check. New item must beat the current item's
 * score to replace it. Empty slot → any item wins.
 */
export function isUpgrade(current, candidate) {
    if (!candidate) return false;
    if (!current) return true;
    return scoreItem(candidate) > scoreItem(current);
}

// Re-exports for convenience.
export {
    SLOT_ORDER, SLOT_LABEL, SLOT_ACCENT, SLOT_BONUS_TYPE,
    RARITY_TIERS, RARITY_ORDER,
};
