// item-templates.js — Looter-Economy Pivot (T06), pure data + lookups.
//
// Transcribed from docs/LOOTER_ECONOMY_PIVOT.md §2.3 (gear item templates,
// rarity ladder, set bonuses) with the slot-personality constraints from §2.1.
//
// All affix-pool entries reference SP stat ids from js/modules/core/sp-stats.js.
// Gear affixes are % AMPLIFIERS of an SP stat (never flat) — this module only
// describes WHICH stats a template/slot can roll; the rolling + value math
// lives in T11 (gear-gen) and T03 (gear-scaling).

// ---------------------------------------------------------------------------
// Rarity ladder (§2.3) — rarity sets affix COUNT + % RANGE (+ sockets).
//
// | Tier           | Affixes | % range  | sockets |
// | Common         | 1       | 4–8%     | 1       |
// | Rare           | 2       | 6–12%    | 1       |
// | Exceptional    | 3       | 8–16%    | 1       |
// | Legendary      | 4       | 10–20%   | 1       |
// | Epic           | 5       | 12–24%   | 1       |
// | Godlike        | 6       | 14–28%   | 1       |
// | Divine         | 7       | 16–32%   | 1       |
// | Transcendental | 8       | 18–36%   | 2       |
//
// `tier` is the 1-based ladder rank; `affixCount` ascends 1..8 in lockstep.
// ---------------------------------------------------------------------------
export const RARITY_LADDER = [
    { tier: 1, name: 'Common',         affixCount: 1, pctMin: 4,  pctMax: 8,  sockets: 1 },
    { tier: 2, name: 'Rare',           affixCount: 2, pctMin: 6,  pctMax: 12, sockets: 1 },
    { tier: 3, name: 'Exceptional',    affixCount: 3, pctMin: 8,  pctMax: 16, sockets: 1 },
    { tier: 4, name: 'Legendary',      affixCount: 4, pctMin: 10, pctMax: 20, sockets: 1 },
    { tier: 5, name: 'Epic',           affixCount: 5, pctMin: 12, pctMax: 24, sockets: 1 },
    { tier: 6, name: 'Godlike',        affixCount: 6, pctMin: 14, pctMax: 28, sockets: 1 },
    { tier: 7, name: 'Divine',         affixCount: 7, pctMin: 16, pctMax: 32, sockets: 1 },
    { tier: 8, name: 'Transcendental', affixCount: 8, pctMin: 18, pctMax: 36, sockets: 2 },
];

// ---------------------------------------------------------------------------
// Build templates (§2.3) — affix pool + 2/3/5-pc set bonuses.
//
// Each template: { id, name, affixPool:[SP stat ids], set:{ two, three, five:{desc} } }.
// 5-pc is a build-defining twist (the "signature"); 2/3-pc are stat bumps.
// ---------------------------------------------------------------------------
export const ITEM_TEMPLATES = [
    {
        id: 'assassin',
        name: 'Assassin',
        affixPool: ['CRIT_CHANCE', 'CRIT_DAMAGE', 'SPEED'],
        set: {
            two:   { stat: 'CRIT_CHANCE', pct: 10, desc: '+10% CRIT CHANCE' },
            three: { stat: 'CRIT_DAMAGE', pct: 20, desc: '+20% CRIT DAMAGE' },
            five:  { desc: 'crits fire a free splinter' },
        },
    },
    {
        id: 'juggernaut',
        name: 'Juggernaut',
        affixPool: ['TOUGHNESS', 'HEALTH', 'THORNS'],
        set: {
            two:   { stat: 'TOUGHNESS', pct: 10, desc: '+10% TOUGHNESS' },
            three: { stat: 'HEALTH', pct: 20, desc: '+20% HEALTH' },
            five:  { desc: 'knockback-immune; thorns +50%' },
        },
    },
    {
        id: 'vampire',
        name: 'Vampire',
        affixPool: ['VAMPIRISM', 'HEALTH', 'REGENERATION'],
        set: {
            two:   { stat: 'VAMPIRISM', pct: 10, desc: '+10% VAMPIRISM' },
            three: { stat: 'HEALTH', pct: 20, desc: '+20% HEALTH' },
            five:  { desc: 'overheal banks as a shield' },
        },
    },
    {
        id: 'reactor',
        name: 'Reactor',
        affixPool: ['CAPACITOR', 'REACTOR', 'EFFICIENCY'],
        set: {
            two:   { stat: 'REACTOR', pct: 12, desc: '+12% REACTOR' },
            three: { stat: 'CAPACITOR', pct: 12, desc: '+12% CAPACITOR' },
            five:  { desc: 'power weapons fire a bonus shot' },
        },
    },
    {
        id: 'duelist',
        name: 'Duelist',
        affixPool: ['CRIT_CHANCE', 'SPEED', 'DODGE'],
        set: {
            two:   { stat: 'SPEED', pct: 10, desc: '+10% SPEED' },
            three: { stat: 'DODGE', pct: 12, desc: '+12% DODGE' },
            five:  { desc: 'a dodge guarantees next crit' },
        },
    },
    {
        id: 'bulwark',
        name: 'Bulwark',
        affixPool: ['TOUGHNESS', 'DODGE', 'THORNS'],
        set: {
            two:   { stat: 'DODGE', pct: 10, desc: '+10% DODGE' },
            three: { stat: 'TOUGHNESS', pct: 12, desc: '+12% TOUGHNESS' },
            five:  { desc: 'a dodge reflects the hit' },
        },
    },
    {
        id: 'berserker',
        name: 'Berserker',
        affixPool: ['CRIT_DAMAGE', 'VAMPIRISM', 'SPEED'],
        set: {
            two:   { stat: 'CRIT_DAMAGE', pct: 12, desc: '+12% CRIT DAMAGE' },
            three: { stat: 'VAMPIRISM', pct: 12, desc: '+12% VAMPIRISM' },
            five:  { desc: '+damage as HP falls' },
        },
    },
    {
        id: 'sentinel',
        name: 'Sentinel',
        affixPool: ['REGENERATION', 'TOUGHNESS', 'HEALTH'],
        set: {
            two:   { stat: 'REGENERATION', pct: 12, desc: '+12% REGEN' },
            three: { stat: 'TOUGHNESS', pct: 12, desc: '+12% TOUGHNESS' },
            five:  { desc: 'regen also ticks in combat (½)' },
        },
    },
    {
        id: 'retaliator',
        name: 'Retaliator',
        affixPool: ['THORNS', 'TOUGHNESS', 'HEALTH'],
        set: {
            two:   { stat: 'THORNS', pct: 12, desc: '+12% THORNS' },
            three: { stat: 'HEALTH', pct: 12, desc: '+12% HEALTH' },
            five:  { desc: 'thorns can crit' },
        },
    },
    {
        id: 'overcharger',
        name: 'Overcharger',
        affixPool: ['CAPACITOR', 'CRIT_DAMAGE', 'EFFICIENCY'],
        set: {
            two:   { stat: 'CAPACITOR', pct: 12, desc: '+12% CAPACITOR' },
            three: { stat: 'CRIT_DAMAGE', pct: 12, desc: '+12% CRIT DAMAGE' },
            five:  { desc: 'power shots can crit' },
        },
    },
];

const _TEMPLATE_BY_ID = Object.fromEntries(ITEM_TEMPLATES.map((t) => [t.id, t]));

export function itemTemplate(id) {
    return _TEMPLATE_BY_ID[id] || null;
}

// ---------------------------------------------------------------------------
// Slot personality (§2.1) — which SP-stat families each gear slot expresses.
// A slot constrains which of a template's pool stats can actually roll on it.
//
//   cockpit   — offense        (crit + the offensive-mobility SPEED)
//   hull      — vitality       (raw HEALTH)
//   shielding — dodge / DR     (DODGE + TOUGHNESS)
//   chassis   — thorns / DR    (THORNS + TOUGHNESS)
//   nanites   — regen / energy (REGEN + the energy axis; VAMPIRISM as sustain)
// ---------------------------------------------------------------------------
export const SLOT_PERSONALITY = {
    cockpit:   ['CRIT_CHANCE', 'CRIT_DAMAGE', 'SPEED'],
    hull:      ['HEALTH'],
    shielding: ['DODGE', 'TOUGHNESS'],
    chassis:   ['THORNS', 'TOUGHNESS'],
    nanites:   ['REGENERATION', 'CAPACITOR', 'REACTOR', 'EFFICIENCY', 'VAMPIRISM'],
};

// 8.31.0 — the union of every slot-personality stat: the broad "gear-reasonable"
// stat set. High rarities (affixCount up to 8) overflow into this once their
// small curated pool is exhausted, so an item can carry `affixCount` UNIQUE-stat
// affixes (no duplicates) without inventing un-gear-like stats. Order is stable
// for deterministic overflow.
export const ALL_GEAR_STATS = (() => {
    const seen = new Set();
    const out = [];
    for (const slot of Object.keys(SLOT_PERSONALITY)) {
        for (const stat of SLOT_PERSONALITY[slot]) {
            if (!seen.has(stat)) { seen.add(stat); out.push(stat); }
        }
    }
    return out;
})();

// The template's affix pool ∩ the slot's personality stats. Falls back to the
// full pool when the intersection is empty (so a slot never has nothing to
// roll — §2.1 "keep it simple"). Unknown template/slot → [].
export function affixPoolForSlot(templateId, slot) {
    const tpl = _TEMPLATE_BY_ID[templateId];
    if (!tpl) return [];
    const allowed = SLOT_PERSONALITY[slot];
    if (!allowed) return [];
    const filtered = tpl.affixPool.filter((stat) => allowed.includes(stat));
    return filtered.length > 0 ? filtered : tpl.affixPool.slice();
}

// ---------------------------------------------------------------------------
// Active set bonus(es) for N equipped pieces of a template.
//
// Returns the cumulative list of bonuses unlocked at `piecesEquipped`:
//   ≥2 → 2-pc, ≥3 → 3-pc, ≥5 → the 5-pc signature. <2 → []. Unknown id → [].
// Each entry is tagged with its threshold so callers can label tiers.
// ---------------------------------------------------------------------------
export function setBonus(templateId, piecesEquipped) {
    const tpl = _TEMPLATE_BY_ID[templateId];
    if (!tpl) return [];
    const n = piecesEquipped | 0;
    const out = [];
    if (n >= 2) out.push({ pieces: 2, ...tpl.set.two });
    if (n >= 3) out.push({ pieces: 3, ...tpl.set.three });
    if (n >= 5) out.push({ pieces: 5, signature: true, ...tpl.set.five });
    return out;
}
