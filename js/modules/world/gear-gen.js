// gear-gen.js — Looter-Economy Pivot (T11), pure gear-roll logic.
//
// Mirrors weapon-gen (T10) for gear. Given a slot + rarity (+ optional
// template/lean/focus + injected rng) this rolls a complete gear item:
// the rarity row fixes the affix COUNT, the per-affix % band, and the
// socket count; the template + slot personality fix WHICH stats can roll
// (affixPoolForSlot); lean/focus bias that selection ("narrow types,
// never values" — design §2.5) but the pct ALWAYS rolls in the band.
//
// Top tier (Transcendental) additionally gets 2 sockets + a rolled
// `signature` twist (design §2.3).
//
// Pure: no DOM, no globals, no game imports beyond the T06 data module.
// `rng` is an injectable () => number in [0,1) so tests can stub it.

import {
    RARITY_LADDER,
    ITEM_TEMPLATES,
    affixPoolForSlot,
    ALL_GEAR_STATS,
} from './item-templates.js';
import { SLOT_ORDER } from './item-names.js';

// ---------------------------------------------------------------------------
// Rarity id resolution.
//
// Callers pass a lowercase rarity id ('common'..'transcendental') matching
// the RARITY_TIERS / RARITY_ORDER vocabulary. RARITY_LADDER rows carry the
// capitalized display `name` ('Common'..'Transcendental'). They are parallel
// and identically ordered, so a lowercase id matches the row whose name
// lowercases to it. Unknown id → null.
// ---------------------------------------------------------------------------
const _LADDER_BY_ID = Object.fromEntries(
    RARITY_LADDER.map((row) => [row.name.toLowerCase(), row]),
);

export function rarityRow(rarity) {
    if (typeof rarity !== 'string') return null;
    return _LADDER_BY_ID[rarity.toLowerCase()] || null;
}

// The top of the ladder — the only tier that rolls a signature + 2 sockets.
const _TOP_TIER = RARITY_LADDER.length; // 8 (Transcendental)

// ---------------------------------------------------------------------------
// Curated signature twists (design §2.3, "e.g. +CRIT also grants ½ DODGE").
//
// Generic, build-agnostic riders that only Transcendental gear rolls. Each
// has a stable `id` (for save/restore + UI) and a human `desc`.
// ---------------------------------------------------------------------------
export const SIGNATURES = [
    { id: 'crit_dodge',     desc: '+CRIT also grants ½ DODGE' },
    { id: 'thorns_crit',    desc: 'THORNS can crit' },
    { id: 'vamp_overheal',  desc: 'lifesteal overheal banks as a shield' },
    { id: 'speed_toughness', desc: '+SPEED also grants ¼ TOUGHNESS' },
    { id: 'regen_combat',   desc: 'REGEN also ticks in combat (½)' },
];

// ---------------------------------------------------------------------------
// rng helpers — all take rng()∈[0,1).
// ---------------------------------------------------------------------------

// Pick one element from a non-empty list.
function _pick(rng, list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(rng() * list.length) % list.length];
}

// A pct rolled uniformly in [min, max], rounded to 1 decimal place.
function _rollPct(rng, min, max) {
    const v = min + rng() * (max - min);
    return Math.round(v * 10) / 10;
}

// ---------------------------------------------------------------------------
// Affix-pool biasing (the "narrow types, never values" rule).
//
// Starts from the slot-appropriate pool (template pool ∩ slot personality).
//   - `focus` pins a stat TYPE: if it's in the pool it becomes the only
//     selectable type (so every affix rolls that stat). The pct still rolls.
//   - `lean` ('None'|'Lean'|'Strong'|'Pure') narrows toward the first pool
//     stat (the template's headline). 'Pure' collapses the selectable set to
//     that single stat; weaker leans bias selection probability toward it but
//     keep variety. Implemented as a weighted draw.
//
// Returns a function `drawStat()` → a stat id, so the caller can draw one per
// affix slot. Never mutates inputs.
// ---------------------------------------------------------------------------
const LEAN_WEIGHTS = {
    None:   1,   // flat — every pool stat equally likely
    Lean:   2,   // headline stat ~2× weight
    Strong: 4,   // headline stat ~4× weight
    Pure:   Infinity, // collapse to the headline stat only
};

function _makeStatDrawer(rng, pool, lean, focus) {
    if (!pool || pool.length === 0) return () => undefined;

    // focus pins a type when it's actually rollable on this slot/template.
    if (focus && pool.includes(focus)) {
        return () => focus;
    }

    const leanW = LEAN_WEIGHTS[lean] ?? LEAN_WEIGHTS.None;
    const headline = pool[0];

    // Pure (or any infinite-weight lean) → headline only.
    if (!isFinite(leanW)) {
        return () => headline;
    }

    // Build a weighted table: headline stat carries `leanW`, others 1 each.
    const weights = pool.map((stat) => (stat === headline ? leanW : 1));
    const total = weights.reduce((a, b) => a + b, 0);

    return () => {
        let r = rng() * total;
        for (let i = 0; i < pool.length; i++) {
            r -= weights[i];
            if (r < 0) return pool[i];
        }
        return pool[pool.length - 1];
    };
}

// ---------------------------------------------------------------------------
// rollGear — the public roller.
//
//   rollGear({ slot, rarity='common', template=null, lean='None',
//              focus=null, rng=Math.random })
//
// → {
//      slot, rarity, template,
//      affixes: [{ stat, pct }],   // length === rarity row's affixCount
//      sockets: N,                 // rarity row's sockets
//      signature?: { id, desc },   // present only at the top tier
//    }
//
// Throws RangeError on an unknown rarity (fail loud — callers control it).
// An unknown slot falls back to the first SLOT_ORDER entry; an unknown
// template id falls back to a random valid template.
// ---------------------------------------------------------------------------
export function rollGear({
    slot,
    rarity = 'common',
    template = null,
    lean = 'None',
    focus = null,
    rng = Math.random,
} = {}) {
    const row = rarityRow(rarity);
    if (!row) {
        throw new RangeError(`rollGear: unknown rarity "${rarity}"`);
    }

    // Resolve slot — fall back to the canonical first slot if unknown.
    const resolvedSlot = SLOT_ORDER.includes(slot) ? slot : SLOT_ORDER[0];

    // Resolve template — explicit id if valid, else a random one via rng.
    const validTemplate = ITEM_TEMPLATES.find((t) => t.id === template);
    const resolvedTemplate = validTemplate
        ? validTemplate.id
        : _pick(rng, ITEM_TEMPLATES.map((t) => t.id));

    // The stat pool this slot/template can roll, then the biased drawer.
    const pool = affixPoolForSlot(resolvedTemplate, resolvedSlot);
    const drawStat = _makeStatDrawer(rng, pool, lean, focus);

    // Roll `affixCount` affixes, each a UNIQUE stat (no item ever carries two of
    // the same stat). 8.31.0: the FIRST affix is the biased draw (focus / lean
    // headline / weighted) so item identity is preserved; the rest fill from an
    // ordered set — the curated slot pool first (stays on-theme), then the
    // broader ALL_GEAR_STATS overflow — skipping anything already used. This
    // keeps the affixCount contract AND uniqueness even when the slot's curated
    // pool is tiny (e.g. hull = just HEALTH → high-rarity hull spills into
    // TOUGHNESS/REGEN/… rather than stacking duplicate HEALTH).
    const affixes = [];
    const usedStats = new Set();
    const first = drawStat();
    if (first !== undefined) {
        usedStats.add(first);
        affixes.push({ stat: first, pct: _rollPct(rng, row.pctMin, row.pctMax) });
    }
    if (first !== undefined) {
        const orderedPool = [...pool, ...ALL_GEAR_STATS.filter((s) => !pool.includes(s))];
        for (const stat of orderedPool) {
            if (affixes.length >= row.affixCount) break;
            if (usedStats.has(stat)) continue;
            usedStats.add(stat);
            affixes.push({ stat, pct: _rollPct(rng, row.pctMin, row.pctMax) });
        }
    }

    const item = {
        slot: resolvedSlot,
        rarity: row.name.toLowerCase(),
        template: resolvedTemplate,
        affixes,
        sockets: row.sockets,
    };

    // Top tier rolls a signature twist (and already carries 2 sockets).
    if (row.tier === _TOP_TIER) {
        item.signature = _pick(rng, SIGNATURES);
    }

    return item;
}

// ---------------------------------------------------------------------------
// gearScore — a trivial roll-strength heuristic (sum of affix %).
//
// Used by compare-on-hover later (T44). Deliberately simple: it weights
// every affix equally by its rolled pct, so a higher-rarity / better-rolled
// item scores higher. Sockets/signatures are NOT folded in here (their value
// is contextual — left for the richer UI compare).
// ---------------------------------------------------------------------------
export function gearScore(item) {
    if (!item || !Array.isArray(item.affixes)) return 0;
    return item.affixes.reduce((sum, a) => sum + (a.pct || 0), 0);
}
