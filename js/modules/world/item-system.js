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
// 5.114.0 — Secondary regen affix. Items have a small chance to roll
// a "+X HP/s regen" SECONDARY bonus on top of their primary HP /
// toughness affix. Scales with item level so a wave-30 item drop
// rolls a meaningful regen rate. The roll is independent of the
// primary affix and stacks across all 4 equipped slots — a 4-item
// regen build comes out around 1.5-2 HP/s, gated by the no-damage
// timer in updatePowerups.
//   roll chance: 25%
//   value:       0.25 + (level - 1) × 0.04   (rounded to 1 decimal)
//                L1=0.25, L5=0.41, L10=0.61, L20=1.01, L30=1.41
const REGEN_AFFIX_CHANCE = 0.25;
function _rollRegenAffix(level) {
    if (Math.random() >= REGEN_AFFIX_CHANCE) return 0;
    const L = Math.max(1, level | 0);
    const raw = 0.25 + (L - 1) * 0.04;
    return Math.round(raw * 10) / 10;
}

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

    // 5.114.0 — Roll a secondary regen affix. Items with regen show
    // "+N MAX HP · +X/s REGEN" in the bonusLabel so the inventory
    // pane reads the dual roll at a glance.
    const regenBonus = _rollRegenAffix(level);
    let bonusLabel = bonusType === 'hp'
        ? `+${bonus} MAX HP`
        : `+${bonus}% DEF`;
    if (regenBonus > 0) {
        bonusLabel += ` · +${regenBonus}/s REGEN`;
    }

    return {
        slot,
        level: Math.max(1, level | 0),
        name,
        bonus,
        bonusType,
        bonusLabel,
        regenBonus,  // 0 when not rolled; getEffectiveRegen sums across slots
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
    // 5.114.0 — Score combines primary bonus + regen affix (×8) so an
    // item with a regen roll can edge out a slightly-higher pure-stat
    // item. The 8× weight makes 1 HP/s of regen ≈ 8 HP/% of primary
    // bonus, which roughly matches their per-second value to the
    // player. Equal scores → no upgrade (avoids spam-replacing).
    const score = (item) => (item.bonus || 0) + 8 * (item.regenBonus || 0);
    return score(candidate) > score(current);
}

// Re-export the slot metadata so callers can iterate slots without
// pulling item-names.js separately.
export { SLOT_ORDER, SLOT_LABEL, SLOT_ACCENT, SLOT_BONUS_TYPE };
