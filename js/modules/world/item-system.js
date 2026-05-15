// 5.99.4 — Diablo-style defensive item system. Generates randomly-
// named, level-scaled items for one of four equipment slots:
//
//   HP slots:        helm,  armor    → bonus = max HP
//   Toughness slots: shield, plating → bonus = damage-reduction %
//
// Item generation pulls from the prefix / base / suffix tables in
// `item-names.js`. Per-slot base pool keeps the language believable
// ("Sturdy Helm of the Bear", not "Sturdy Plating of the Bear");
// prefix and suffix pools are shared across the two slots of the
// same bonus type so an HP item can roll any HP prefix + any HP
// suffix.
//
// All items are DEFENSIVE — there are no offensive item slots. The
// player picks them up from enemy kills; each pickup is auto-equipped
// if its bonus exceeds the currently-equipped item's bonus for that
// slot.

import {
    ITEM_BASES, ITEM_PREFIXES, ITEM_SUFFIXES,
    SLOT_BONUS_TYPE, SLOT_LABEL, SLOT_ACCENT, SLOT_ORDER,
} from './item-names.js';

// Bonus formulas. Item LEVEL = the wave number the pickup dropped on.
// Wave 1 = level 1; wave 20 = level 20. Bonus scales linearly so
// late-game items are meaningfully better than early ones.
//
//   HP:        5 + (level - 1) × 2     →  L1=5, L5=13, L10=23, L20=43
//   Toughness: 3 + (level - 1) × 0.4   →  L1=3, L5=4.6, L10=6.6, L20=10.6
//
// Toughness rounds to one decimal in the display label but the raw
// number is added to player.shield where the existing 75-cap clamps
// it. HP is integer.
export function getHpBonusForLevel(level) {
    const L = Math.max(1, level | 0);
    return 5 + (L - 1) * 2;
}

export function getToughnessBonusForLevel(level) {
    const L = Math.max(1, level | 0);
    return Math.round((3 + (L - 1) * 0.4) * 10) / 10; // 1-decimal
}

function _pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
}

/**
 * Generate a fresh item for a given slot at a given level. Returns:
 *   {
 *     slot, level, name, bonus, bonusType,
 *     bonusLabel,   // e.g. "+13 MAX HP" or "+4.6% DEF"
 *     accentColor,  // SLOT_ACCENT[slot]
 *   }
 */
export function createItem(slot, level) {
    if (!ITEM_BASES[slot]) {
        // Defensive fallback — should not happen.
        slot = 'helm';
    }
    const bonusType = SLOT_BONUS_TYPE[slot]; // 'hp' | 'toughness'
    const prefix = _pick(ITEM_PREFIXES[bonusType]);
    const base   = _pick(ITEM_BASES[slot]);
    const suffix = _pick(ITEM_SUFFIXES[bonusType]);
    const name = `${prefix} ${base} ${suffix}`;

    const bonus = bonusType === 'hp'
        ? getHpBonusForLevel(level)
        : getToughnessBonusForLevel(level);

    const bonusLabel = bonusType === 'hp'
        ? `+${bonus} MAX HP`
        : `+${bonus}% DEF`;

    return {
        slot,
        level: Math.max(1, level | 0),
        name,
        bonus,
        bonusType,
        bonusLabel,
        accentColor: SLOT_ACCENT[slot] || '#33ddff',
    };
}

/**
 * Return true if `candidate` is a strict upgrade over `current` for
 * the same slot. An undefined current always loses (any item beats
 * empty). Equal bonuses are NOT an upgrade (avoids spam-replacing
 * identical-tier items).
 */
export function isUpgrade(current, candidate) {
    if (!candidate) return false;
    if (!current) return true;
    return candidate.bonus > current.bonus;
}

// Re-export the slot metadata so callers can iterate slots without
// pulling item-names.js separately.
export { SLOT_ORDER, SLOT_LABEL, SLOT_ACCENT, SLOT_BONUS_TYPE };
