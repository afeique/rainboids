// run-randomizer.js — Looter-Economy Pivot T14: the run randomizer + draft
// builder. Given a stage `depth` (1-indexed) and a small `runState`, produces
// the 2–3 stage OPTIONS the draft (§4.1 / T40) shows, respecting the §4.2
// balance rules, and a normalizer that turns a picked option into the stage
// spec the wave system (T32) will consume.
//
// PURE: no DOM, no globals, no Date.now/Math.random of its own — the rng is
// INJECTED (`rng = Math.random` only as the default), so a seeded/stub rng
// makes `nextDraft` fully deterministic + testable.
//
// Reads its data from the T09 single source of truth (`run-templates.js`) and
// the T01 income module (`income.js`) — never hard-codes the curves itself.
//
// ── Option shape (what `nextDraft` returns, one per drafted card) ───────────
//   {
//     theme:        STAGE_THEMES entry (the stage's element/flavor),
//     modifiers:    [STAGE_MODIFIERS entry, ...]   (0..2, never 2 punishing),
//     threat:       number   (PWR scale — difficultyBudget(depth) × Σ weights),
//     reward: {
//       rainshardMult: number   (R$ multiplier, scales with chosen risk),
//       dropBias:      number   (drop-quality/quantity bias, ≥ rainshardMult-ish),
//     },
//     elites:       [ELITE_AFFIXES/ELITE_COMBOS entry, ...]  (count by depth),
//     bountyRelevant?: true   (set on at most ONE option matching a bounty),
//     preset?:      CHALLENGE_PRESETS entry   (set when the option is a preset),
//   }

import {
    STAGE_THEMES,
    STAGE_MODIFIERS,
    CHALLENGE_PRESETS,
    ELITE_AFFIXES,
    ELITE_COMBOS,
    difficultyBudget,
    eliteAffixCountForDepth,
} from './run-templates.js';
import { INCOME } from '../shop/income.js';

// ── Punishing modifiers (§4.2 rule 4: never stack two of these) ─────────────
// The "punishing" mutators are the ones that turn a single mistake lethal or
// pile on unavoidable attrition — distinct from merely-harder mutators (Swarm,
// Juggernaut, Fog…). Two of these in one stage is the forbidden combination.
export const PUNISHING_MODIFIERS = Object.freeze(new Set([
    'SUDDEN_DEATH',      // no heals; one mistake is lethal
    'GLASS',             // you die fast too
    'TOXIC_ATMOSPHERE',  // unavoidable ambient DoT
    'ELITE_PACK',        // a pack of extra-affix elites
]));

// Modifiers that LOWER the floor (safe/lean side of the risk spread).
const LEANING_SAFE_MODIFIERS = Object.freeze(['TREASURE', 'LOW_GRAVITY', 'FOG']);

// Lookups by id so we never depend on array order.
const MODIFIER_BY_ID = Object.freeze(
    Object.fromEntries(STAGE_MODIFIERS.map((m) => [m.id, m]))
);
const THEME_BY_ID = Object.freeze(
    Object.fromEntries(STAGE_THEMES.map((t) => [t.id, t]))
);

function isPunishing(mod) {
    return !!mod && PUNISHING_MODIFIERS.has(mod.id);
}

// ── Tiny rng helpers (all take the injected rng) ────────────────────────────
function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length) % arr.length];
}

// Fisher–Yates over a COPY (does not mutate the source data).
function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}

// ── threat + reward derivation ──────────────────────────────────────────────
// threat = the depth budget scaled by the product of the chosen modifiers'
// threatWeight (so a no-modifier stage sits exactly at the budget). Always a
// positive integer on the PWR scale.
function computeThreat(depth, modifiers) {
    const base = difficultyBudget(depth);
    let mult = 1;
    for (const m of modifiers) mult *= m.threatWeight;
    return Math.max(1, Math.round(base * mult));
}

// reward scales with the modifiers' rewardMult (risk pays out). dropBias is a
// touch richer than rainshardMult so the "richer" option also tilts loot
// quality, not just R$. presetMult (from a curated combo) layers on top.
function computeReward(modifiers, presetMult = 1) {
    let rainshardMult = 1;
    for (const m of modifiers) rainshardMult *= m.rewardMult;
    rainshardMult *= presetMult;
    // dropBias tracks reward but leans slightly higher (loot, not just R$),
    // clamped to the design's R$-find ceiling so nothing runs away.
    const dropBias = Math.min(INCOME.findMult.max, 1 + (rainshardMult - 1) * 1.2);
    return {
        rainshardMult: Math.round(rainshardMult * 100) / 100,
        dropBias: Math.round(dropBias * 100) / 100,
    };
}

// ── Elite roll (count by depth; mix affixes + named combos) ─────────────────
// Draws `eliteAffixCountForDepth(depth)` "slots". Each slot may resolve to a
// single ELITE_AFFIXES entry or — when the budget is ≥ a combo's affix count —
// a curated ELITE_COMBOS entry (which then consumes that many slots). Returns
// the chosen affix/combo entries (no dups).
function rollElites(depth, rng, intensity = 1) {
    const budget = Math.max(0, Math.round(eliteAffixCountForDepth(depth) * intensity));
    if (budget <= 0) return [];

    const out = [];
    let remaining = budget;
    const usedAffixIds = new Set();

    // ~40% chance to seed a named combo when the budget can afford it.
    const affordableCombos = ELITE_COMBOS.filter((c) => c.affixes.length <= remaining);
    if (affordableCombos.length && rng() < 0.4) {
        const combo = pick(affordableCombos, rng);
        out.push(combo);
        remaining -= combo.affixes.length;
        for (const id of combo.affixes) usedAffixIds.add(id);
    }

    // Fill the remaining slots with distinct single affixes.
    const pool = shuffle(
        ELITE_AFFIXES.filter((a) => !usedAffixIds.has(a.id)),
        rng
    );
    for (let i = 0; i < pool.length && remaining > 0; i++) {
        out.push(pool[i]);
        usedAffixIds.add(pool[i].id);
        remaining--;
    }
    return out;
}

// ── Modifier selection for ONE option, honoring the compat rules ────────────
// `tier`: 'safe' | 'standard' | 'risky' — biases how many/how heavy the
// modifiers are. `forbidId` is `runState.lastModifier` (no dup two-in-a-row).
// Guarantees never two punishing modifiers in the returned list.
function rollModifiers(tier, rng, forbidId) {
    const usable = STAGE_MODIFIERS.filter((m) => m.id !== forbidId);

    if (tier === 'safe') {
        // Lean: 0–1 modifier, biased toward the low-threat/safe set, never punishing.
        if (rng() < 0.45) return []; // sometimes a clean, unmodified stage
        const safePool = usable.filter(
            (m) => LEANING_SAFE_MODIFIERS.includes(m.id) && !isPunishing(m)
        );
        const fromPool = safePool.length ? safePool : usable.filter((m) => !isPunishing(m));
        return fromPool.length ? [pick(fromPool, rng)] : [];
    }

    if (tier === 'standard') {
        // 1 modifier, any non-punishing-heavy choice (one punishing allowed solo).
        return usable.length ? [pick(usable, rng)] : [];
    }

    // 'risky': 1–2 modifiers, allowed to include ONE punishing one.
    const first = usable.length ? pick(usable, rng) : null;
    if (!first) return [];
    if (rng() < 0.5) return [first]; // sometimes a single heavy modifier

    // Add a second, but enforce "no two punishing stacked".
    const secondPool = usable.filter((m) => {
        if (m.id === first.id) return false;
        if (isPunishing(first) && isPunishing(m)) return false;
        return true;
    });
    if (!secondPool.length) return [first];
    return [first, secondPool[Math.floor(rng() * secondPool.length) % secondPool.length]];
}

// Build a single option from a theme + a modifier list at a given depth.
function buildOption(depth, theme, modifiers, rng, { preset = null, eliteIntensity = 1 } = {}) {
    const presetMult = preset ? (preset.rewardMult || 1) : 1;
    return {
        theme,
        modifiers,
        threat: computeThreat(depth, modifiers),
        reward: computeReward(modifiers, presetMult),
        elites: rollElites(depth, rng, eliteIntensity),
        ...(preset ? { preset } : {}),
    };
}

// Sanitize a modifier list to honor the §4.2 compat rules: drop any modifier
// matching `forbidId` (no dup two-in-a-row) and, once one punishing modifier is
// present, drop subsequent punishing ones (never two stacked). Preserves order
// so the curated/leading modifier wins the punishing slot.
function sanitizeModifiers(modifiers, forbidId) {
    const out = [];
    let punishingTaken = false;
    for (const m of modifiers) {
        if (!m) continue;
        if (forbidId && m.id === forbidId) continue;
        if (isPunishing(m)) {
            if (punishingTaken) continue;
            punishingTaken = true;
        }
        out.push(m);
    }
    return out;
}

// Resolve a CHALLENGE_PRESET into a concrete option (theme + its modifiers).
// Even curated presets pass through the compat rules so they never violate the
// "no two punishing" / "no dup of lastModifier" guarantees the draft promises.
function buildPresetOption(depth, preset, rng, forbidId) {
    const theme = preset.theme && THEME_BY_ID[preset.theme]
        ? THEME_BY_ID[preset.theme]
        : pick(STAGE_THEMES, rng);
    const rawModifiers = (preset.modifiers || [])
        .map((id) => MODIFIER_BY_ID[id])
        .filter(Boolean);
    const modifiers = sanitizeModifiers(rawModifiers, forbidId);
    // Presets are curated; elites lean a touch heavier when the combo is brutal.
    const eliteIntensity = preset.modifiers && preset.modifiers.includes('ELITE_PACK') ? 1.5 : 1;
    return buildOption(depth, theme, modifiers, rng, { preset, eliteIntensity });
}

// ── bountyRelevant tagging (§4.2 rule 6) ────────────────────────────────────
// `runState.activeBountyTags` is an optional array of tag strings. We match a
// tag against an option's theme element/id, any modifier id, or any elite id
// (case-insensitive). At most ONE option gets marked.
function tagBountyRelevant(options, activeBountyTags) {
    if (!Array.isArray(activeBountyTags) || !activeBountyTags.length) return;
    const tags = activeBountyTags.map((t) => String(t).toUpperCase());
    const matchesOption = (opt) => {
        const haystack = [
            opt.theme && opt.theme.id,
            opt.theme && opt.theme.element,
            ...opt.modifiers.map((m) => m.id),
            ...opt.elites.map((e) => e.id),
            opt.preset && opt.preset.id,
        ].filter(Boolean).map((s) => String(s).toUpperCase());
        return tags.some((t) => haystack.includes(t));
    };
    const hit = options.find(matchesOption);
    if (hit) hit.bountyRelevant = true;
}

/**
 * nextDraft(depth, runState, rng) — produce 2–3 stage options for the draft.
 *
 * @param {number} depth     1-indexed stage depth (the budget rises with it).
 * @param {object} runState  { lastModifier?: string, activeBountyTags?: string[] }
 * @param {function} rng     injected [0,1) generator (default Math.random).
 * @returns {Array<Option>}  2–3 options (safe → risky risk/reward spread).
 */
export function nextDraft(depth, runState = {}, rng = Math.random) {
    const d = Math.max(1, depth | 0);
    const forbidId = runState.lastModifier || null;

    // Distinct themes for the cards (no two cards share a theme this draft).
    const themes = shuffle(STAGE_THEMES, rng);

    // Decide on 2 or 3 cards (lean toward 3 once past the opening stage).
    const optionCount = d >= 2 && rng() < 0.75 ? 3 : 2;

    const options = [];

    // Card 1 — the SAFE / LEAN option (lower threat, leaner reward).
    options.push(
        buildOption(d, themes[0], rollModifiers('safe', rng, forbidId), rng)
    );

    // Card 2 — the RISKY / RICH option, OR a curated CHALLENGE_PRESET sometimes.
    // Presets are the §4.3 "curated combos the draft surfaces"; gate them to
    // depth ≥ 2 and a ~30% surface rate so they stay special.
    if (d >= 2 && rng() < 0.3) {
        const presetOpt = buildPresetOption(d, pick(CHALLENGE_PRESETS, rng), rng, forbidId);
        // Make sure the preset's theme doesn't collide with card 1.
        if (presetOpt.theme.id === options[0].theme.id) presetOpt.theme = themes[1];
        options.push(presetOpt);
    } else {
        options.push(
            buildOption(d, themes[1], rollModifiers('risky', rng, forbidId), rng)
        );
    }

    // Card 3 (optional) — a STANDARD middle option to round out the spread.
    if (optionCount === 3) {
        options.push(
            buildOption(d, themes[2], rollModifiers('standard', rng, forbidId), rng)
        );
    }

    // §4.2 rule 2/3: guarantee the spread is genuinely ordered safe→risky by
    // threat, so the draft always offers a real risk/reward choice.
    options.sort((a, b) => a.threat - b.threat);

    // §4.2 rule 6: bias one option toward an active bounty.
    tagBountyRelevant(options, runState.activeBountyTags);

    return options;
}

/**
 * applyPick(option) — normalize a chosen draft option into the stage spec the
 * wave system (T32) consumes. Flattens to ids + a composition seed; keeps the
 * threat/reward so the director (T34) and income (T29) read the same numbers.
 *
 * @param {Option} option  one entry returned by `nextDraft`.
 * @returns {object} { themeId, element, modifierIds, threat, reward, eliteIds,
 *                     compositionSeed, presetId|null, bountyRelevant }
 */
export function applyPick(option) {
    if (!option || !option.theme) {
        throw new Error('applyPick: invalid option (missing theme)');
    }
    const modifierIds = (option.modifiers || []).map((m) => m.id);
    const eliteIds = (option.elites || []).map((e) => e.id);

    // A stable, content-derived seed the wave system can feed its own rng so
    // the composition is reproducible from the picked spec alone.
    const compositionSeed = [
        option.theme.id,
        ...modifierIds,
        ...eliteIds,
        option.preset ? option.preset.id : '',
        String(option.threat),
    ].join('|');

    return {
        themeId: option.theme.id,
        element: option.theme.element,
        modifierIds,
        threat: option.threat,
        reward: {
            rainshardMult: option.reward.rainshardMult,
            dropBias: option.reward.dropBias,
        },
        eliteIds,
        compositionSeed,
        presetId: option.preset ? option.preset.id : null,
        bountyRelevant: !!option.bountyRelevant,
    };
}
