// 5.99.3 — Diablo-style item name pools. All defensive items (HP +
// Toughness) drawn from prefix / base / suffix tables per slot. Pure
// data; the assembly logic lives in `item-system.js`.
//
// Name template: `[Prefix] [Base] of [Suffix]`
//   - Prefix: tone-setting adjective (Sturdy / Bristling / Glacial …)
//   - Base:   the slot's noun (Helm / Plate / Aegis / Greaves …)
//   - Suffix: thematic adjunct ("of the Bear" / "of Iron" …)
//
// Slots are 4-wide:
//   HP slots:        helm,  armor
//   Toughness slots: shield, plating
//
// Each slot has its own base pool so the gear vocabulary reads
// believably ("Sturdy Helm of the Bear" not "Sturdy Plating of the
// Bear"). Prefixes and suffixes are SHARED across the two slots of
// the same bonus type so an HP item can pull from any HP prefix and
// any HP suffix — keeps the name space large without ballooning the
// table size.
//
// Combinatorics (with current tables):
//   HP slots:        8 prefixes × 6 bases × 6 suffixes × 2 slots = 576 names
//   Toughness slots: 8 prefixes × 6 bases × 6 suffixes × 2 slots = 576 names
//   Total possible distinct names: 1152

export const ITEM_BASES = {
    // HP slots
    helm:    ['Helm', 'Hood', 'Cap', 'Visor', 'Crown', 'Coif'],
    armor:   ['Plate', 'Mail', 'Vest', 'Cuirass', 'Carapace', 'Harness'],
    // Toughness slots
    shield:  ['Buckler', 'Aegis', 'Bulwark', 'Barrier', 'Ward', 'Crest'],
    plating: ['Plating', 'Greaves', 'Pauldrons', 'Bracers', 'Faulds', 'Tasset'],
};

// Prefix pools — keyed by bonus TYPE, not slot, so a helm and a chestplate
// share the same vocabulary (they both grant HP, the prefix should reflect
// that). Same logic for shield + plating.
export const ITEM_PREFIXES = {
    hp: [
        'Sturdy', 'Hardened', 'Reinforced', 'Solid',
        'Ironbound', 'Granite', 'Adamant', 'Resilient',
    ],
    toughness: [
        'Bristling', 'Tempered', 'Glacial', 'Fortified',
        'Steeled', 'Stalwart', 'Warded', 'Vigilant',
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
};

// Slot → bonus type. Centralized so callers don't repeat the mapping.
export const SLOT_BONUS_TYPE = {
    helm:    'hp',
    armor:   'hp',
    shield:  'toughness',
    plating: 'toughness',
};

// Human-readable slot labels for the inventory UI.
export const SLOT_LABEL = {
    helm:    'HELM',
    armor:   'ARMOR',
    shield:  'SHIELD',
    plating: 'PLATING',
};

// Pickup accent colors per slot. HP slots share cyan; Toughness
// slots share amber. Used by StatPickup.draw and the toast.
export const SLOT_ACCENT = {
    helm:    '#33ddff',
    armor:   '#33ddff',
    shield:  '#ffae3a',
    plating: '#ffae3a',
};

// All slot ids in render order (top → bottom in the inventory panel).
export const SLOT_ORDER = ['helm', 'armor', 'shield', 'plating'];
