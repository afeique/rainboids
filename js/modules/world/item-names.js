// 6.2.2 — Slot KEYS rethemed to match the LABEL vocabulary. The
// internal identifiers (used by player.equippedItems, drop routing,
// equip logic) now read:
//
//   cockpit   — forward-mounted HP hardware (was 'helm')
//   hull      — main HP body armor       (was 'armor')
//   shielding — toughness energy shield  (was 'shield')
//   chassis   — toughness structural     (was 'plating')
//   nanites   — regen module / trinket   (was 'trinket')
//
// Renaming the keys (not just labels) means engine grep / file scans
// surface the space-themed vocabulary consistently. `player.shield`
// (the damage-reduction stat) is UNRELATED and intentionally left as
// `shield` — it's a different concept (base 15% reduction) that
// predates the inventory.
//
// 6.2.1 — Name template: `[RarityAdj?] [Prefix] [Base]`.
//
// Examples:
//   Common HP slot:        "Ablative Hull"
//   Common toughness slot: "Deflector Shielding"
//   Common regen slot:     "Adaptive Nanites"
//   Rare HP slot:          "Refined Insectoid Carapace"
//   Epic toughness slot:   "Prototype Quantum Barrier"
//   Epic regen slot:       "Prototype Phoenix Core"

export const ITEM_BASES = {
    // HP slots — forward-mounted hardware + main body armor.
    cockpit:   ['Cockpit', 'Bridge', 'Prow', 'Canopy', 'Visor', 'Nose-Cone'],
    hull:      ['Hull', 'Carapace', 'Shell', 'Plating', 'Mantle', 'Skin'],
    // Toughness slots — energy defense + structural reinforcement.
    shielding: ['Shielding', 'Barrier', 'Field', 'Buffer', 'Aegis', 'Ward'],
    chassis:   ['Chassis', 'Frame', 'Brace', 'Lattice', 'Truss', 'Strut'],
    // Regen slot — repair / nano / engineering modules.
    nanites:   ['Nanites', 'Reactor', 'Core', 'Matrix', 'Module', 'Capacitor'],
};

// Prefixes keyed by BONUS TYPE (not slot) so both HP slots draw from
// the same hp-flavored adjective pool, etc.
export const ITEM_PREFIXES = {
    // HP — ablative / hardened / composite armor families.
    hp: [
        'Ablative', 'Composite', 'Reinforced', 'Ironclad', 'Insectoid',
        'Tempered', 'Layered', 'Bulkhead-grade', 'Heavy-Spec', 'Plated',
    ],
    // Toughness — energy / field / refractive defense.
    toughness: [
        'Deflector', 'Quantum', 'Phased', 'Polarized', 'Crystalline',
        'Refractive', 'Mirrored', 'Inertial', 'Stalwart', 'Vigilant',
    ],
    // Regen — self-repair / nanotech / living systems.
    regen: [
        'Adaptive', 'Regenerative', 'Mending', 'Quickening', 'Symbiotic',
        'Self-Sealing', 'Phoenix', 'Vital', 'Restorative', 'Organic',
    ],
};

// Slot → bonus type. Centralized so callers don't repeat the mapping.
export const SLOT_BONUS_TYPE = {
    cockpit:   'hp',
    hull:      'hp',
    shielding: 'toughness',
    chassis:   'toughness',
    nanites:   'regen',
};

// 6.2.2 — Labels now mirror the keys (uppercased). Kept as an explicit
// map rather than `slot.toUpperCase()` so future re-themes can swap
// the display vocabulary independently of the engine identifiers.
export const SLOT_LABEL = {
    cockpit:   'COCKPIT',
    hull:      'HULL',
    shielding: 'SHIELDING',
    chassis:   'CHASSIS',
    nanites:   'NANITES',
};

// Pickup accent colors per slot. HP slots cyan, Toughness slots amber,
// Regen slot green. Unchanged from 6.0.0.
export const SLOT_ACCENT = {
    cockpit:   '#33ddff',
    hull:      '#33ddff',
    shielding: '#ffae3a',
    chassis:   '#ffae3a',
    nanites:   '#66ffaa',
};

// All slot ids in render order (top → bottom in the inventory panel).
export const SLOT_ORDER = ['cockpit', 'hull', 'shielding', 'chassis', 'nanites'];

// 6.0.0 — Rarity tiers. 6.2.1 — Rarity adjectives rethemed from
// medieval ("Fine" / "Pristine") to engineering-spec ("Refined" /
// "Prototype") to match the space vocabulary.
export const RARITY_TIERS = {
    common: {
        weight: 0.65, multMin: 0.85, multMax: 1.05,
        color: '#cccccc', glow: 0.45, label: 'COMMON',
        rarityAdjective: null,
    },
    rare: {
        weight: 0.27, multMin: 1.00, multMax: 1.40,
        color: '#5cc6ff', glow: 0.85, label: 'RARE',
        rarityAdjective: 'Refined',
    },
    epic: {
        weight: 0.08, multMin: 1.35, multMax: 1.85,
        color: '#cc88ff', glow: 1.3, label: 'EPIC',
        rarityAdjective: 'Prototype',
    },
};

export const RARITY_ORDER = ['common', 'rare', 'epic'];

// Weighted random pick of a rarity tier. Boss kills can bias toward
// higher tiers by passing `bonusEpic` / `bonusRare`.
export function rollRarity(bonusRare = 0, bonusEpic = 0) {
    const rare = Math.min(0.95, RARITY_TIERS.rare.weight + Math.max(0, bonusRare));
    const epic = Math.min(0.95 - rare, Math.max(0, RARITY_TIERS.epic.weight + bonusEpic));
    const common = Math.max(0, 1 - rare - epic);
    const r = Math.random();
    if (r < epic) return 'epic';
    if (r < epic + rare) return 'rare';
    return 'common';
}
