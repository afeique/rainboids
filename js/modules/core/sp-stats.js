// 6.33.0 — SP (Stat Point) meta-progression config.
//
// The player earns 1 SP per level (level 1-100, persisted across
// playthroughs — see core/storage.js). SP are spent in the STATS menu
// on permanent passive stats. Each stat caps at SP_STAT_MAX_POINTS
// points; each point grants `perPoint` = `max / SP_STAT_MAX_POINTS`, so
// a fully-invested stat reaches its `max` value.
//
// These SP stats are a PERMANENT meta layer. They stack on top of the
// run-specific contributions from wave-clear passive cards and rolled
// item affixes inside the effective-stat getters (player/progression.js).

export const MAX_LEVEL = 100;
export const SP_STAT_MAX_POINTS = 20;

// T35 — Global EFFECTIVE-stat caps. Gear amplification (T26) + the class
// favored-stat lens (T33) can now pile onto a single SP stat, so these ceilings
// keep one stat from trivializing the game. (CRIT chance 60%, CRIT damage 550%,
// and TOUGHNESS 75% are already capped at their getters in player/progression.js;
// these cover the stats consumed outside those getters.)
export const STAT_CAPS = Object.freeze({
    DODGE: 0.60,      // max dodge chance (fraction) — was a flat 0.50
    VAMPIRISM: 0.50,  // max lifesteal as a fraction of damage dealt
    THORNS: 2.0,      // max reflected fraction of damage taken (thorns is niche → generous)
});

// Each entry: id, display name, icon slug, the value at full investment
// (`max`), and a label fn for the menu. `perPoint` is derived as
// max / SP_STAT_MAX_POINTS.
export const SP_STATS = [
    { id: 'HEALTH',      name: 'Health',      icon: 'heart',  max: 400, label: (t) => `+${t} max HP` },
    { id: 'TOUGHNESS',   name: 'Toughness',   icon: 'shield', max: 50,  label: (t) => `+${t}% damage reduction` },
    { id: 'VAMPIRISM',   name: 'Vampirism',   icon: 'skull',  max: 50,  label: (t) => `+${t}% lifesteal` },
    { id: 'THORNS',      name: 'Thorns',      icon: 'anger',  max: 100, label: (t) => `+${t}% damage reflected` },
    { id: 'CRIT_CHANCE', name: 'Crit Chance', icon: 'star',   max: 50,  label: (t) => `+${t}% crit chance` },
    { id: 'CRIT_DAMAGE', name: 'Crit Damage', icon: 'dagger', max: 200, label: (t) => `+${t}% crit damage` },
    { id: 'DODGE',       name: 'Evasion',     icon: 'wind',   max: 50,  label: (t) => `+${t}% dodge chance` },
    { id: 'SPEED',       name: 'Speed',       icon: 'bullet-train', max: 100, label: (t) => `+${t}% thrust & top speed` },
    // CD energy-economy axis (CD-01). These govern the power-weapon energy
    // meter: CAPACITOR raises max energy (base 100 → up to 200 at full),
    // REACTOR speeds the regen fill (up to +100% → 2× at full), and EFFICIENCY
    // shaves power-weapon energy cost (up to −50% at full — the CD-05 cap).
    { id: 'CAPACITOR',  name: 'Capacitor',  icon: 'battery', max: 100, label: (t) => `+${t} max energy` },
    { id: 'REACTOR',    name: 'Reactor',    icon: 'bolt',    max: 100, label: (t) => `+${t}% energy regen` },
    { id: 'EFFICIENCY', name: 'Efficiency', icon: 'chart',   max: 50,  label: (t) => `−${t}% power cost` },
    // CD sustain axis (CD-08). A permanent passive HP-regen source that feeds
    // getEffectiveRegen alongside the REGEN powerup + item affixes, sharing the
    // same combat-gated 3 HP/s ceiling (REGEN_RATE_CAP). Default-safe: 0 pts → 0.
    { id: 'REGENERATION', name: 'Regeneration', icon: 'sparkle', max: 2, label: (t) => `+${t} HP/s out of combat` },
];

const _BY_ID = Object.fromEntries(SP_STATS.map((s) => [s.id, s]));

export function spStatDef(id) {
    return _BY_ID[id] || null;
}

// Per-point increment for a stat (max / 20).
export function spPerPoint(id) {
    const def = _BY_ID[id];
    return def ? def.max / SP_STAT_MAX_POINTS : 0;
}

// Total value of a stat given a point count (clamped to the cap).
export function spStatValue(id, points) {
    const def = _BY_ID[id];
    if (!def) return 0;
    const p = Math.max(0, Math.min(SP_STAT_MAX_POINTS, points | 0));
    return p * (def.max / SP_STAT_MAX_POINTS);
}

// XP required to go from `level` to `level+1`. Tuned slow: a full
// 30-wave run grants ~3-4 levels early, tapering hard so reaching 100
// is a long cross-playthrough grind (the meta hook). Quadratic-ish.
//   L1→2: 500, L10→11: ~3050, L50→51: ~12750, L99→100: ~25000
export function xpForLevel(level) {
    const L = Math.max(1, level | 0);
    return 500 + (L - 1) * 250;
}

// 8.15.0 — ALTERNATING level-up unlocks. Reaching a milestone level grants (and
// auto-equips) the next ability or passive, alternating, during the run. Because
// leveling is per-run (~1 level / 2-3 waves), a short run unlocks only the first
// few; the full kit (4 abilities + 5 passives) only lands across a LONGER run —
// everything is unlocked by L21 (≈ 50+ waves). Order is fixed + curated so the
// progression reads as a deliberate power curve.
export const LEVEL_UNLOCKS = Object.freeze([
    { level: 5,  kind: 'ability', id: 'BULWARK' },
    { level: 7,  kind: 'passive', id: 'OPPORTUNIST' },
    { level: 9,  kind: 'ability', id: 'FIELD_MEDIC' },
    { level: 11, kind: 'passive', id: 'LAST_BASTION' },
    { level: 13, kind: 'ability', id: 'BLINK' },
    { level: 15, kind: 'passive', id: 'CATALYST' },
    { level: 17, kind: 'ability', id: 'EMP_PULSE' },
    { level: 19, kind: 'passive', id: 'RICOCHET' },
    { level: 21, kind: 'passive', id: 'BLOODLUST' },
]);

// 8.24.0 — Keystone TRAIT pick milestones. Reaching each level grants ONE
// keystone pick (a CHOICE the player spends on the Keystone Traits screen —
// distinct from the auto-granted modular passives above). Two picks total
// matches KEYSTONE_BUDGET (2). Per-run, like everything else here.
export const KEYSTONE_PICK_LEVELS = Object.freeze([10, 20]);
