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

// 6.32.0 — Items now roll AFFIXES that mirror the passive stat set, so
// an item can grant any combination of HP / Toughness / Vampirism /
// Thorns / Crit Chance / Crit Damage / Dodge / Speed / Regen. Each
// affix value = (base + (wave-1) × perWave) × rarity-mult. `pct` marks
// percentage stats (rounded to 1 dp) vs flat (HP int, regen 1 dp).
export const ITEM_AFFIX_POOL = [
    { type: 'hp',         base: 8,   perWave: 2,    pct: false, min: 1,   prefix: 'hp',        label: (v) => `+${v} MAX HP` },
    { type: 'toughness',  base: 3,   perWave: 0.3,  pct: true,  min: 1,   prefix: 'toughness', label: (v) => `+${v}% DEF` },
    { type: 'vampirism',  base: 2,   perWave: 0.1,  pct: true,  min: 1,   prefix: 'regen',     label: (v) => `+${v}% LIFESTEAL` },
    { type: 'thorns',     base: 6,   perWave: 0.4,  pct: true,  min: 2,   prefix: 'toughness', label: (v) => `+${v}% THORNS` },
    { type: 'critChance', base: 3,   perWave: 0.2,  pct: true,  min: 1,   prefix: 'hp',        label: (v) => `+${v}% CRIT` },
    { type: 'critDamage', base: 8,   perWave: 0.5,  pct: true,  min: 3,   prefix: 'hp',        label: (v) => `+${v}% CRIT DMG` },
    { type: 'dodge',      base: 2,   perWave: 0.1,  pct: true,  min: 1,   prefix: 'toughness', label: (v) => `+${v}% DODGE` },
    { type: 'speed',      base: 6,   perWave: 0.3,  pct: true,  min: 2,   prefix: 'regen',     label: (v) => `+${v}% SPEED` },
    { type: 'regen',      base: 0.3, perWave: 0.05, pct: false, min: 0.1, prefix: 'regen',     label: (v) => `+${v}/s REGEN` },
];

// Score weights — normalize each affix to an "effective HP" value so
// cross-affix item comparison (isUpgrade suppression) is sane.
export const AFFIX_SCORE_WEIGHT = {
    hp: 1, toughness: 8, vampirism: 8, thorns: 4,
    critChance: 6, critDamage: 3, dodge: 8, speed: 3, regen: 16,
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
//
// Phase C.I1 — the ladder expands from 3 tiers to 8 (common → rare →
// exceptional → legendary → epic → godlike → divine → transcendental).
// Each tier carries its own color, glow intensity, multiplier band, and
// an `affixCount` (how many distinct affixes an item of that tier rolls).
// Weights drop sharply up the ladder so Transcendental is an ultra-rare
// (~0.1%) prize. Multiplier bands climb so a high-tier item is both
// flashier AND statistically stronger.
export const RARITY_TIERS = {
    common: {
        weight: 0.50, multMin: 0.85, multMax: 1.05,
        color: '#b8c0cc', glow: 0.45, label: 'COMMON',
        affixCount: 1, rarityAdjective: null,
    },
    rare: {
        weight: 0.26, multMin: 1.00, multMax: 1.40,
        color: '#5cc6ff', glow: 0.85, label: 'RARE',
        affixCount: 2, rarityAdjective: 'Refined',
    },
    exceptional: {
        weight: 0.13, multMin: 1.30, multMax: 1.70,
        color: '#36e6a0', glow: 1.05, label: 'EXCEPTIONAL',
        affixCount: 3, rarityAdjective: 'Calibrated',
    },
    legendary: {
        weight: 0.06, multMin: 1.50, multMax: 1.90,
        color: '#ffb43a', glow: 1.35, label: 'LEGENDARY',
        affixCount: 3, rarityAdjective: 'Vanguard',
    },
    epic: {
        weight: 0.03, multMin: 1.80, multMax: 2.20,
        color: '#c060ff', glow: 1.6, label: 'EPIC',
        affixCount: 4, rarityAdjective: 'Prototype',
    },
    godlike: {
        weight: 0.012, multMin: 2.10, multMax: 2.60,
        color: '#ff3d6e', glow: 1.9, label: 'GODLIKE',
        affixCount: 4, rarityAdjective: 'Ascendant',
    },
    divine: {
        weight: 0.005, multMin: 2.50, multMax: 3.00,
        color: '#fff0a0', glow: 2.3, label: 'DIVINE',
        affixCount: 5, rarityAdjective: 'Empyrean',
    },
    transcendental: {
        weight: 0.001, multMin: 3.00, multMax: 3.60,
        color: '#ff66ff', glow: 2.8, label: 'TRANSCENDENTAL',
        affixCount: 5, rarityAdjective: 'Transcendent',
        prismatic: true, // renderer hook: animate a rainbow shimmer.
    },
};

// Low → high. Index = tier rank (used by tests + any bias logic).
export const RARITY_ORDER = [
    'common', 'rare', 'exceptional', 'legendary',
    'epic', 'godlike', 'divine', 'transcendental',
];

// Weighted random pick across all 8 tiers.
//
// `bossBias` (0..1) shifts probability mass UP the ladder: each tier's
// effective weight is scaled by `(1 + bossBias * rank * BOSS_BIAS_K)`,
// where `rank` is its position in RARITY_ORDER (common = 0). So at
// bossBias=0 the table weights are used verbatim; at bossBias=1 the
// higher tiers get a large multiplicative boost, dragging the mean tier
// upward.
//
// Backward-compat: the pre-C.I1 signature was `rollRarity(bonusRare,
// bonusEpic)` — two probability-space nudges. combat-manager.js still
// calls it that way. If a second numeric arg is supplied (or the first
// arg looks like a legacy probability nudge), we fold both into an
// equivalent bossBias so the old call sites keep biasing upward without
// needing edits.
const BOSS_BIAS_K = 6;

export function rollRarity(bossBias = 0, legacyBonusEpic) {
    let bias = 0;
    if (legacyBonusEpic !== undefined) {
        // Legacy two-arg form: (bonusRare, bonusEpic). Both are small
        // probability nudges (e.g. 0.10 / 0.08) → fold into a bossBias.
        bias = Math.max(0, (bossBias || 0)) + Math.max(0, legacyBonusEpic) * 1.5;
        bias = Math.min(1, bias * 2.5);
    } else {
        bias = Math.max(0, Math.min(1, bossBias || 0));
    }

    let total = 0;
    const weights = RARITY_ORDER.map((key, rank) => {
        const w = RARITY_TIERS[key].weight * (1 + bias * rank * BOSS_BIAS_K);
        total += w;
        return w;
    });

    let r = Math.random() * total;
    for (let i = 0; i < RARITY_ORDER.length; i++) {
        r -= weights[i];
        if (r < 0) return RARITY_ORDER[i];
    }
    return RARITY_ORDER[0];
}
