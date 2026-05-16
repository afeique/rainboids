// 6.0.0 — Items now drop in three rarity tiers and have a 5th slot
// (trinket) that rolls a regen primary. The base name tables grow to
// cover trinkets; prefix / suffix tables grow to cover the new
// 'regen' bonus type. Rarity-aware adjectives prepend the prefix at
// rare+ so the language signals tier at a glance ("Pristine Sturdy
// Helm of the Bear" — Epic).
//
// Name template (was): `[Prefix] [Base] of [Suffix]`
// Name template (now): `[RarityAdj?] [Prefix] [Base] [Suffix]`
//
// Slots (5):
//   HP slots:        helm,  armor
//   Toughness slots: shield, plating
//   Regen slot:      trinket    (new)
//
// Combinatorics (with current tables, ignoring rarity):
//   HP slots:        8 prefixes × 6 bases × 6 suffixes × 2 slots = 576
//   Toughness slots: 8 prefixes × 6 bases × 6 suffixes × 2 slots = 576
//   Regen slot:      6 prefixes × 6 bases × 6 suffixes × 1 slot  = 216

export const ITEM_BASES = {
    // HP slots
    helm:    ['Helm', 'Hood', 'Cap', 'Visor', 'Crown', 'Coif'],
    armor:   ['Plate', 'Mail', 'Vest', 'Cuirass', 'Carapace', 'Harness'],
    // Toughness slots
    shield:  ['Buckler', 'Aegis', 'Bulwark', 'Barrier', 'Ward', 'Crest'],
    plating: ['Plating', 'Greaves', 'Pauldrons', 'Bracers', 'Faulds', 'Tasset'],
    // Regen slot (6.0.0 — new)
    trinket: ['Sigil', 'Charm', 'Talisman', 'Pendant', 'Locket', 'Amulet'],
};

export const ITEM_PREFIXES = {
    hp: [
        'Sturdy', 'Hardened', 'Reinforced', 'Solid',
        'Ironbound', 'Granite', 'Adamant', 'Resilient',
    ],
    toughness: [
        'Bristling', 'Tempered', 'Glacial', 'Fortified',
        'Steeled', 'Stalwart', 'Warded', 'Vigilant',
    ],
    // 6.0.0 — Regen-flavored adjectives for the trinket slot.
    regen: [
        'Verdant', 'Restorative', 'Mending', 'Sanguine',
        'Vital', 'Quickening',
    ],
};

export const ITEM_SUFFIXES = {
    hp: [
        'of the Bear',     'of the Mountain', 'of Endurance',
        'of the Titan',    'of Vigor',        'of the Whale',
    ],
    toughness: [
        'of Iron',         'of Stone',        'of Warding',
        'of the Tortoise', 'of Defiance',     'of the Bulwark',
    ],
    // 6.0.0 — Regen-flavored suffixes for the trinket slot.
    regen: [
        'of Recovery',     'of Mending',      'of the Phoenix',
        'of Renewal',      'of the Sage',     'of Lifebloom',
    ],
};

// Slot → bonus type. Centralized so callers don't repeat the mapping.
export const SLOT_BONUS_TYPE = {
    helm:    'hp',
    armor:   'hp',
    shield:  'toughness',
    plating: 'toughness',
    trinket: 'regen',
};

// Human-readable slot labels for the inventory UI.
export const SLOT_LABEL = {
    helm:    'HELM',
    armor:   'ARMOR',
    shield:  'SHIELD',
    plating: 'PLATING',
    trinket: 'TRINKET',
};

// Pickup accent colors per slot. HP cyan, Toughness amber, Regen green.
export const SLOT_ACCENT = {
    helm:    '#33ddff',
    armor:   '#33ddff',
    shield:  '#ffae3a',
    plating: '#ffae3a',
    trinket: '#66ffaa',
};

// All slot ids in render order (top → bottom in the inventory panel).
export const SLOT_ORDER = ['helm', 'armor', 'shield', 'plating', 'trinket'];

// 6.0.0 — Rarity tiers. Each item rolls a rarity at drop time which
// (1) modulates the primary-stat roll range and (2) drives the visual
// glow color so the player can pre-judge a drop without inspecting.
//
//   weight:  drop probability for this tier (must sum to 1.0)
//   multMin / multMax: primary-stat multiplier band around the base
//                       level value. Epic max ≈ 1.85× common min.
//   color:   pickup glow + name label color
//   glow:    intensity multiplier on the halo radius
//   label:   short tag shown after the item name (e.g. "[EPIC]")
//   rarityAdjective: optional adjective prepended to the name on
//                    rare+ so the language signals tier even before
//                    the player reads the bonus.
export const RARITY_TIERS = {
    common: {
        weight: 0.65, multMin: 0.85, multMax: 1.05,
        color: '#cccccc', glow: 0.45, label: 'COMMON',
        rarityAdjective: null,
    },
    rare: {
        weight: 0.27, multMin: 1.00, multMax: 1.40,
        color: '#5cc6ff', glow: 0.85, label: 'RARE',
        rarityAdjective: 'Fine',
    },
    epic: {
        weight: 0.08, multMin: 1.35, multMax: 1.85,
        color: '#cc88ff', glow: 1.3, label: 'EPIC',
        rarityAdjective: 'Pristine',
    },
};

export const RARITY_ORDER = ['common', 'rare', 'epic'];

// Weighted random pick of a rarity tier. Boss kills can bias toward
// higher tiers by passing `bonusEpic` / `bonusRare` to push the
// distribution (e.g. boss → +0.15 epic / +0.20 rare). Defaults to the
// base RARITY_TIERS weights.
export function rollRarity(bonusRare = 0, bonusEpic = 0) {
    const rare = Math.min(0.95, RARITY_TIERS.rare.weight + Math.max(0, bonusRare));
    const epic = Math.min(0.95 - rare, Math.max(0, RARITY_TIERS.epic.weight + bonusEpic));
    const common = Math.max(0, 1 - rare - epic);
    const r = Math.random();
    if (r < epic) return 'epic';
    if (r < epic + rare) return 'rare';
    return 'common';
}
