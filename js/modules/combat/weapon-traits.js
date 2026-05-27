// Weapon Traits — Looter-Economy Pivot, Phase 3 / §3.1 (T04).
//
// A weapon is `archetype + rolled traits`. Traits SUBSUME three older systems
// into one: attunements (Element), mechanic mods (Behavior), and card powerups
// (Powerup) — plus a fourth weapon-local Stat% class. This module is PURE DATA
// + lookups: no DOM, no globals, no game imports. Generation (weapon-gen.js,
// T10) consumes these defs; this file only declares the taxonomy + the rarity
// trait-count ladder + per-archetype rollable pools.
//
// Each trait def:
//   { id, class, name, description, roll: { min, max } }   // roll omitted where N/A
//
// `roll` is the MAGNITUDE band for traits whose strength varies — Stat% bonuses
// (percent points) and the count-style powerups (Multishot/Volley extra
// projectiles). Element + most Behavior traits are binary (present or not), so
// they carry no `roll`. The per-rarity % ranges in design §2.3
// (Common 4–8% … Transcendental 18–36%) are applied by the generator scaling a
// trait's base roll band toward the rarity band; this file's bands are the
// archetype-agnostic baselines.

// ─── The four trait classes ─────────────────────────────────────────────────
export const WEAPON_TRAIT_CLASSES = ['ELEMENT', 'BEHAVIOR', 'POWERUP', 'STAT'];

// ─── 1. ELEMENT (the old attunements) ────────────────────────────────────────
// Mirrors combat/elements.js (PYRO/CRYO/VOLT/TOXIC/VOID/RADIANT). KINETIC is the
// DEFAULT element and is NOT a rollable trait — a weapon with no Element trait
// fires Kinetic.
export const ELEMENT_TRAITS = [
    { id: 'PYRO',    class: 'ELEMENT', name: 'Pyro',    description: 'Fire — hits burn over time; ignites oil-soaked targets.' },
    { id: 'CRYO',    class: 'ELEMENT', name: 'Cryo',    description: 'Ice — chills, then freezes brittle for a shatter.' },
    { id: 'VOLT',    class: 'ELEMENT', name: 'Volt',    description: 'Lightning — chains to nearby enemies; amplified by Conduct.' },
    { id: 'TOXIC',   class: 'ELEMENT', name: 'Toxic',   description: 'Acid/bio — corrodes (vulnerability) plus a poison DoT.' },
    { id: 'VOID',    class: 'ELEMENT', name: 'Void',    description: 'Gravity/dark — marks targets and pulls them together.' },
    { id: 'RADIANT', class: 'ELEMENT', name: 'Radiant', description: 'Plasma/light — cuts through shields and armor.' },
];

// KINETIC default — exported for the generator's "no element trait" baseline.
export const DEFAULT_ELEMENT = 'KINETIC';

// ─── 2. BEHAVIOR (the old mechanic mods) ──────────────────────────────────────
// Binary projectile-behavior modifiers. Where a behavior has a natural
// magnitude (Pierce count, status chance) the generator reads `roll`.
export const BEHAVIOR_TRAITS = [
    { id: 'PIERCE',    class: 'BEHAVIOR', name: 'Piercing',  description: 'Shots pass through enemies they hit.', roll: { min: 1, max: 3 } },
    { id: 'EXPLOSIVE', class: 'BEHAVIOR', name: 'Explosive', description: 'Impacts trigger an AoE blast.' },
    { id: 'HOMING',    class: 'BEHAVIOR', name: 'Homing',    description: 'Shots curve toward the nearest enemy.' },
    { id: 'CHAIN',     class: 'BEHAVIOR', name: 'Chain',     description: 'Hits arc to additional nearby enemies.', roll: { min: 1, max: 3 } },
    { id: 'RICOCHET',  class: 'BEHAVIOR', name: 'Ricochet',  description: 'Shots bounce off walls and bank between enemies.', roll: { min: 1, max: 3 } },
    { id: 'SPLIT',     class: 'BEHAVIOR', name: 'Split',     description: 'Shots fragment into seeking shards on impact.', roll: { min: 1, max: 3 } },
    { id: 'KNOCKBACK', class: 'BEHAVIOR', name: 'Knockback', description: 'Hits shove enemies back.', roll: { min: 10, max: 40 } },
    { id: 'STUN',      class: 'BEHAVIOR', name: 'Stun',      description: 'Chance to briefly stun on hit.', roll: { min: 8, max: 25 } },
];

// ─── 3. POWERUP (the old card powerups) ───────────────────────────────────────
// Whole-weapon firing buffs. Count-style powerups (Multishot/Volley) and the
// percent buffs (Rapidfire/Overcharge/Long Range) carry a `roll` magnitude.
export const POWERUP_TRAITS = [
    { id: 'MULTISHOT',   class: 'POWERUP', name: 'Multishot',   description: 'Fires additional projectiles per shot.', roll: { min: 1, max: 3 } },
    { id: 'RAPIDFIRE',   class: 'POWERUP', name: 'Rapidfire',   description: '+% fire rate.', roll: { min: 8, max: 30 } },
    { id: 'BIG_BULLETS', class: 'POWERUP', name: 'Big Bullets', description: '+% projectile size (bigger hitbox).', roll: { min: 10, max: 40 } },
    { id: 'OVERCHARGE',  class: 'POWERUP', name: 'Overcharge',  description: '+% damage on sustained fire.', roll: { min: 8, max: 30 } },
    { id: 'LONG_RANGE',  class: 'POWERUP', name: 'Long Range',  description: '+% projectile range / lifetime.', roll: { min: 10, max: 40 } },
    { id: 'VOLLEY',      class: 'POWERUP', name: 'Volley',      description: 'Fires an extra burst-volley of shots.', roll: { min: 1, max: 2 } },
];

// ─── 4. STAT% (weapon-local amplifiers) ───────────────────────────────────────
// Pure percent bonuses local to the weapon. The roll bands here are the
// archetype-agnostic baselines; the generator widens them toward the rarity
// band (§2.3: Common 4–8% … Transcendental 18–36%).
export const STAT_TRAITS = [
    { id: 'DAMAGE_PCT',           class: 'STAT', name: '+% Damage',           description: '+% weapon damage.',            roll: { min: 4, max: 36 } },
    { id: 'FIRE_RATE_PCT',        class: 'STAT', name: '+% Fire Rate',        description: '+% fire rate.',                roll: { min: 4, max: 36 } },
    { id: 'PROJECTILE_SPEED_PCT', class: 'STAT', name: '+% Projectile Speed', description: '+% projectile speed.',         roll: { min: 4, max: 36 } },
    { id: 'CRIT_CHANCE_PCT',      class: 'STAT', name: '+% Crit Chance',      description: '+% critical-hit chance.',      roll: { min: 4, max: 24 } },
    { id: 'CRIT_DAMAGE_PCT',      class: 'STAT', name: '+% Crit Damage',      description: '+% critical-hit damage.',      roll: { min: 4, max: 36 } },
];

// All per-class arrays, in class order.
const ALL_TRAIT_ARRAYS = [ELEMENT_TRAITS, BEHAVIOR_TRAITS, POWERUP_TRAITS, STAT_TRAITS];

// ─── WEAPON_TRAITS — id → trait def (flat lookup) ─────────────────────────────
export const WEAPON_TRAITS = (() => {
    const map = {};
    for (const arr of ALL_TRAIT_ARRAYS) {
        for (const t of arr) {
            if (map[t.id]) throw new Error(`weapon-traits: duplicate trait id "${t.id}"`);
            map[t.id] = t;
        }
    }
    return map;
})();

// ─── Rarity → trait COUNT ─────────────────────────────────────────────────────
// Same 8-tier ladder as gear (item-names.js RARITY_ORDER). The trait count per
// tier mirrors design §2.3's affix-count column: 1 → 8.
export const RARITY_LADDER = [
    'common', 'rare', 'exceptional', 'legendary',
    'epic', 'godlike', 'divine', 'transcendental',
];

// Index in RARITY_LADDER → trait count (§2.3: 1,2,3,4,5,6,7,8).
const TRAIT_COUNT_BY_TIER = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * traitCountForRarity(rarity) — how many traits a weapon of this rarity rolls.
 *
 * `rarity` may be a tier key ('common'…'transcendental', case-insensitive) or a
 * 1-based tier number (1 = Common … 8 = Transcendental). Returns 1..8. Unknown
 * inputs fall back to Common (1).
 */
export function traitCountForRarity(rarity) {
    let idx = -1;
    if (typeof rarity === 'number') {
        idx = Math.round(rarity) - 1; // 1-based tier number → 0-based index
    } else if (typeof rarity === 'string') {
        idx = RARITY_LADDER.indexOf(rarity.toLowerCase());
    }
    if (idx < 0 || idx >= TRAIT_COUNT_BY_TIER.length) return TRAIT_COUNT_BY_TIER[0];
    return TRAIT_COUNT_BY_TIER[idx];
}

// ─── Per-archetype rollable trait pools ───────────────────────────────────────
// Default: every archetype can roll every trait. A handful of archetypes carry
// obvious exclusions where a behavior makes no mechanical sense (the archetype
// already IS that behavior, or it can't carry the modifier). Exclusions are by
// trait id; everything not excluded is rollable.
//
// Archetype ids match the design §3.1 firing-pattern catalog (primaries +
// powers). Anything not listed here uses the full pool.
const ARCHETYPE_TRAIT_EXCLUSIONS = {
    // Pierce-line archetypes already pierce — Pierce is redundant.
    RAIL:        ['PIERCE'],
    LANCE:       ['PIERCE', 'HOMING'],       // continuous beam: can't home or stack pierce
    // Ricochet/Boomerang already bounce/return — Ricochet behavior is redundant.
    RICOCHET:    ['RICOCHET'],
    BOOMERANG:   ['RICOCHET', 'HOMING'],     // returns by design; homing fights the arc
    // Splitter already splits.
    SPLITTER:    ['SPLIT'],
    // Chain-lightning power already chains.
    LIGHTNING:   ['CHAIN'],
    // Area/placed archetypes don't carry single-projectile behaviors.
    NOVA:        ['PIERCE', 'HOMING', 'RICOCHET', 'SPLIT'],
    MINE:        ['HOMING', 'RICOCHET', 'SPLIT'],
    SINGULARITY: ['PIERCE', 'RICOCHET', 'SPLIT'],
    CRYO_BURST:  ['PIERCE', 'HOMING', 'RICOCHET', 'SPLIT'],
};

// Every trait id, flat — the default rollable pool.
const ALL_TRAIT_IDS = Object.keys(WEAPON_TRAITS);

/**
 * rollableTraitsFor(archetypeId) — the trait DEFS valid for a weapon archetype.
 *
 * Defaults to all traits; applies the archetype's exclusion list when one
 * exists. Always returns a non-empty array of trait defs (exclusions only ever
 * remove a few Behavior ids, never a whole class).
 */
export function rollableTraitsFor(archetypeId) {
    const excluded = (archetypeId && ARCHETYPE_TRAIT_EXCLUSIONS[archetypeId]) || [];
    const excludedSet = new Set(excluded);
    return ALL_TRAIT_IDS
        .filter((id) => !excludedSet.has(id))
        .map((id) => WEAPON_TRAITS[id]);
}
