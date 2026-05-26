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
