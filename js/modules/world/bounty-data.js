// Looter-Economy Pivot — T08: Bounty catalog (templates + roller).
//
// Pure data + a pure roller, no DOM / globals. Transcribes the design doc
// §Phase 5 bounty catalog as TEMPLATES with `{…}` randomized fills. The
// bounty ENGINE (T15) consumes these to roll the board (~3 dailies + 2
// persistent contracts), track progress, and grant rewards.
//
// Template shape:
//   {
//     id,            // stable template key
//     category,      // 'combat' | 'build' | 'skill' | 'economy' | 'element' | 'variety'
//     text,          // human string with `{token}` placeholders the roller fills
//     progressType,  // the progress-event channel the engine increments against
//     target,        // a fixed integer target …
//     range,         //   … OR a [min, max, step?] roll range (exactly one of target/range)
//     fills,         // map of `{token}` → choice list (array) or [min,max,step] range
//     reward,        // { rainshards, matrixChance?, fabricateToken? }
//     kind,          // 'daily' | 'contract'
//   }
//
// `reward.rainshards` is the lump R$ payout (the design's "R$ (difficulty-
// scaled) + occasional Matrix or Fabricate token"). `matrixChance` (0..1) is
// the odds the bounty ALSO drops a Matrix; `fabricateToken` (int) grants free
// Fabricate tokens. Daily payouts are smaller; contracts are bigger, slower
// goals.
//
// Token vocab (kept aligned with real game ids so the engine can validate):
//   {weapon}  — a weapon ARCHETYPE display id
//   {element} — PYRO/CRYO/VOLT/TOXIC/VOID/RADIANT (combat/weapon-data.js elements)
//   {template}— a gear build-template name (world/item-templates.js)
//   {rarity}  — a rarity tier name (world/item-names.js ladder)
//   {mode}    — a difficulty mode
//   {reaction}— an elemental reaction (status interaction)

// ─── Shared fill vocab ──────────────────────────────────────────────────────

const WEAPON_ARCHETYPES = [
    'Pulse', 'Storm', 'Scatter', 'Rail', 'Cluster',
    'Splitter', 'Ricochet', 'Boomerang', 'Spin', 'Flak', 'Gravity Lance',
];

const ELEMENTS = ['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID', 'RADIANT'];

const GEAR_TEMPLATES = [
    'Assassin', 'Juggernaut', 'Vampire', 'Reactor', 'Duelist',
    'Bulwark', 'Berserker', 'Sentinel', 'Retaliator', 'Overcharger',
];

// The high-rarity floors a bounty can ask you to Fabricate.
const HIGH_RARITIES = ['Legendary', 'Epic', 'Godlike', 'Divine'];

const HARD_MODES = ['HARD', 'EPIC', 'LEGENDARY'];
const ALL_MODES = ['NORMAL', 'HARD', 'EPIC', 'LEGENDARY'];

const STATUS_REACTIONS = ['Freeze', 'Ignite', 'Corrode'];

// ─── Catalog ─────────────────────────────────────────────────────────────────
// ~20+ templates spanning all six categories (combat/build/skill/economy/
// element/variety). Each daily vs. contract tag follows the design intent:
// dailies are bite-size & refresh; contracts are larger persistent goals.

export const BOUNTY_TEMPLATES = [
    // ── COMBAT ──────────────────────────────────────────────────────────────
    {
        id: 'combat_kills_total',
        category: 'combat',
        text: 'Destroy {N} enemies',
        progressType: 'kill',
        range: [40, 120, 20],
        fills: { N: [40, 120, 20] },
        reward: { rainshards: 1200 },
        kind: 'daily',
    },
    {
        id: 'combat_kills_weapon',
        category: 'combat',
        text: 'Destroy {N} enemies with a {weapon} weapon',
        progressType: 'kill_weapon',
        range: [20, 40, 5],
        fills: { N: [20, 40, 5], weapon: WEAPON_ARCHETYPES },
        reward: { rainshards: 1600 },
        kind: 'daily',
    },
    {
        id: 'combat_kills_element',
        category: 'combat',
        text: 'Destroy {N} enemies with {element} damage',
        progressType: 'kill_element',
        range: [30, 60, 10],
        fills: { N: [30, 60, 10], element: ELEMENTS },
        reward: { rainshards: 1800 },
        kind: 'daily',
    },
    {
        id: 'combat_bosses',
        category: 'combat',
        text: 'Defeat {N} bosses',
        progressType: 'boss_kill',
        range: [2, 3, 1],
        fills: { N: [2, 3, 1] },
        reward: { rainshards: 4500, matrixChance: 0.25 },
        kind: 'contract',
    },
    {
        id: 'combat_elites',
        category: 'combat',
        text: 'Eliminate {N} elites',
        progressType: 'elite_kill',
        range: [5, 10, 5],
        fills: { N: [5, 10, 5] },
        reward: { rainshards: 2600 },
        kind: 'contract',
    },

    // ── BUILD ─────────────────────────────────────────────────────────────────
    {
        id: 'build_win_template',
        category: 'build',
        text: 'Win a run running a {template} (3-pc) set',
        progressType: 'run_win_set',
        target: 1,
        fills: { template: GEAR_TEMPLATES },
        reward: { rainshards: 5000, fabricateToken: 1 },
        kind: 'contract',
    },
    {
        id: 'build_reach_5pc',
        category: 'build',
        text: 'Complete a 5-piece set bonus',
        progressType: 'set_5pc',
        target: 1,
        fills: {},
        reward: { rainshards: 3500 },
        kind: 'contract',
    },
    {
        id: 'build_matrices_socketed',
        category: 'build',
        text: 'Have {N} Matrices socketed at once',
        progressType: 'matrices_socketed',
        range: [3, 4, 1],
        fills: { N: [3, 4, 1] },
        reward: { rainshards: 2400, matrixChance: 0.3 },
        kind: 'daily',
    },
    {
        id: 'build_resonance',
        category: 'build',
        text: 'Reach Matrix resonance {N}+',
        progressType: 'resonance',
        range: [3, 4, 1],
        fills: { N: [3, 4, 1] },
        reward: { rainshards: 2800 },
        kind: 'daily',
    },
    {
        id: 'build_full_exceptional',
        category: 'build',
        text: 'Equip Exceptional+ gear in every slot',
        progressType: 'all_slots_rarity',
        target: 1,
        fills: {},
        reward: { rainshards: 4000 },
        kind: 'contract',
    },

    // ── SKILL ──────────────────────────────────────────────────────────────────
    {
        id: 'skill_reach_wave',
        category: 'skill',
        text: 'Reach wave {N} on {mode}+',
        progressType: 'reach_wave',
        range: [10, 20, 5],
        fills: { N: [10, 20, 5], mode: HARD_MODES },
        reward: { rainshards: 3000 },
        kind: 'daily',
    },
    {
        id: 'skill_sudden_death',
        category: 'skill',
        text: 'Clear a Sudden Death stage',
        progressType: 'clear_modifier',
        target: 1,
        fills: {},
        reward: { rainshards: 2200 },
        kind: 'daily',
    },
    {
        id: 'skill_no_damage',
        category: 'skill',
        text: 'Clear a stage without taking damage',
        progressType: 'no_damage_stage',
        target: 1,
        fills: {},
        reward: { rainshards: 2600 },
        kind: 'daily',
    },
    {
        id: 'skill_killstreak',
        category: 'skill',
        text: 'Reach a {N} killstreak',
        progressType: 'killstreak',
        range: [30, 50, 20],
        fills: { N: [30, 50, 20] },
        reward: { rainshards: 2000 },
        kind: 'daily',
    },
    {
        id: 'skill_no_primary',
        category: 'skill',
        text: 'Clear a stage without firing your primary',
        progressType: 'clear_no_primary',
        target: 1,
        fills: {},
        reward: { rainshards: 3200 },
        kind: 'contract',
    },

    // ── ECONOMY ─────────────────────────────────────────────────────────────────
    {
        id: 'economy_fabricate_rarity',
        category: 'economy',
        text: 'Fabricate a {rarity}+ item',
        progressType: 'fabricate_rarity',
        target: 1,
        fills: { rarity: HIGH_RARITIES },
        reward: { rainshards: 2800, fabricateToken: 1 },
        kind: 'contract',
    },
    {
        id: 'economy_reroll',
        category: 'economy',
        text: 'Reroll a trait {N} times',
        progressType: 'reroll',
        range: [10, 10, 1],
        fills: { N: [10, 10, 1] },
        reward: { rainshards: 1800 },
        kind: 'daily',
    },
    {
        id: 'economy_combine_matrices',
        category: 'economy',
        text: 'Combine {N} Matrices',
        progressType: 'combine_matrix',
        range: [3, 3, 1],
        fills: { N: [3, 3, 1] },
        reward: { rainshards: 2000, matrixChance: 0.4 },
        kind: 'daily',
    },
    {
        id: 'economy_salvage',
        category: 'economy',
        text: 'Salvage {N} items',
        progressType: 'salvage',
        range: [20, 20, 1],
        fills: { N: [20, 20, 1] },
        reward: { rainshards: 1600 },
        kind: 'daily',
    },
    {
        id: 'economy_bank_run',
        category: 'economy',
        text: 'Bank {N} Rainshards in a single run',
        progressType: 'bank_run',
        range: [20000, 40000, 10000],
        fills: { N: [20000, 40000, 10000] },
        reward: { rainshards: 5000 },
        kind: 'contract',
    },

    // ── ELEMENT ─────────────────────────────────────────────────────────────────
    {
        id: 'element_surge_counter',
        category: 'element',
        text: 'Clear an Elemental Surge stage with the counter element',
        progressType: 'clear_surge',
        target: 1,
        fills: {},
        reward: { rainshards: 3000 },
        kind: 'daily',
    },
    {
        id: 'element_status_count',
        category: 'element',
        text: 'Apply {reaction} to {N} enemies',
        progressType: 'apply_status',
        range: [40, 60, 10],
        fills: { reaction: STATUS_REACTIONS, N: [40, 60, 10] },
        reward: { rainshards: 2200 },
        kind: 'daily',
    },
    {
        id: 'element_reactions',
        category: 'element',
        text: 'Trigger {N} elemental reactions',
        progressType: 'reaction',
        range: [20, 20, 1],
        fills: { N: [20, 20, 1] },
        reward: { rainshards: 2600 },
        kind: 'contract',
    },

    // ── VARIETY ─────────────────────────────────────────────────────────────────
    {
        id: 'variety_themes',
        category: 'variety',
        text: 'Visit {N} different stage themes in one run',
        progressType: 'themes_in_run',
        range: [3, 3, 1],
        fills: { N: [3, 3, 1] },
        reward: { rainshards: 2400 },
        kind: 'daily',
    },
    {
        id: 'variety_beat_mode',
        category: 'variety',
        text: 'Beat a run on {mode}',
        progressType: 'win_mode',
        target: 1,
        fills: { mode: ALL_MODES },
        reward: { rainshards: 3600 },
        kind: 'contract',
    },
    {
        id: 'variety_high_risk',
        category: 'variety',
        text: 'Pick the high-risk draft option {N} times',
        progressType: 'high_risk_pick',
        range: [3, 3, 1],
        fills: { N: [3, 3, 1] },
        reward: { rainshards: 2000 },
        kind: 'daily',
    },
];

// ─── Roller ────────────────────────────────────────────────────────────────

// Integer in [min, max] inclusive, snapped to `step`, using rng()∈[0,1).
function _rollInt(rng, min, max, step = 1) {
    if (max <= min) return min;
    const steps = Math.floor((max - min) / step);
    const k = Math.floor(rng() * (steps + 1));
    return min + Math.min(k, steps) * step;
}

// Pick one element from a list using rng()∈[0,1).
function _pick(rng, list) {
    if (!list || list.length === 0) return undefined;
    const i = Math.floor(rng() * list.length);
    return list[Math.min(i, list.length - 1)];
}

// True when a `fills` entry is a numeric [min,max,step?] range vs. a choice list.
function _isRange(v) {
    return Array.isArray(v) && v.length >= 2 && v.length <= 3 && v.every((n) => typeof n === 'number');
}

/**
 * rollBounty(rng=Math.random, kind) — pick a template matching `kind`
 * ('daily' | 'contract'; omit/falsy = any), then fill its `{token}`
 * placeholders into a concrete bounty instance.
 *
 * `rng` is an injectable () => number in [0,1) for deterministic tests.
 *
 * Returns:
 *   {
 *     id, templateId, category, kind, text (filled),
 *     progressType, target (concrete int), fills (resolved token map),
 *     reward (cloned), progress: 0,
 *   }
 */
export function rollBounty(rng = Math.random, kind) {
    const pool = kind
        ? BOUNTY_TEMPLATES.filter((t) => t.kind === kind)
        : BOUNTY_TEMPLATES;
    if (pool.length === 0) {
        throw new Error(`rollBounty: no templates for kind "${kind}"`);
    }

    const tpl = _pick(rng, pool);

    // Resolve every fill token (choice list → value; range → snapped int).
    const filled = {};
    for (const [token, spec] of Object.entries(tpl.fills || {})) {
        filled[token] = _isRange(spec)
            ? _rollInt(rng, spec[0], spec[1], spec[2] ?? 1)
            : _pick(rng, spec);
    }

    // The concrete target: an explicit `target`, else roll the `range`, else
    // fall back to the {N} fill if present (combat/skill/etc. count goals).
    let target;
    if (typeof tpl.target === 'number') {
        target = tpl.target;
    } else if (_isRange(tpl.range)) {
        // Reuse the {N} fill if the range and {N} are the same goal number;
        // otherwise roll the range independently.
        target = (typeof filled.N === 'number') ? filled.N : _rollInt(rng, tpl.range[0], tpl.range[1], tpl.range[2] ?? 1);
    } else {
        target = 1;
    }

    // Substitute {token} → value in the display text.
    const text = tpl.text.replace(/\{(\w+)\}/g, (m, key) => {
        if (Object.prototype.hasOwnProperty.call(filled, key)) return String(filled[key]);
        if (key === 'N') return String(target);
        return m;
    });

    return {
        id: `${tpl.id}#${Math.floor(rng() * 1e9).toString(36)}`,
        templateId: tpl.id,
        category: tpl.category,
        kind: tpl.kind,
        text,
        progressType: tpl.progressType,
        target,
        fills: filled,
        reward: { ...tpl.reward },
        progress: 0,
    };
}

// All six categories, for validation / UI grouping.
export const BOUNTY_CATEGORIES = ['combat', 'build', 'skill', 'economy', 'element', 'variety'];
