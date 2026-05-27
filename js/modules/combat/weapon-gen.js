// Weapon generation / roll — Looter-Economy Pivot, Phase 3 / §3.1 (T10).
//
// A weapon is `archetype + rolled traits` (design §3.1). This module turns a
// request (archetype + rarity + optional lean/focus) into a concrete weapon
// ITEM object. It is PURE: no DOM, no globals, no game imports beyond the
// taxonomy in weapon-traits.js. All randomness flows through an INJECTED `rng`
// (a `() => number` in [0,1)) so callers can seed it for determinism — drops
// pass `Math.random`, tests pass a stub, Fabricate passes whatever it likes.
//
// Both the drop path (T31) and the Fabricator (T13) consume `rollWeapon`. The
// Fabricator's `lean`/`focus` knobs (priced by crafting-costs.js, T02) map
// directly onto this function's `lean`/`focus` params.
//
// THE TWO BIAS KNOBS (design §2.5 "narrow types, never values"):
//   • lean  (None/Lean/Strong/Pure) — biases the rolled trait CLASS mix toward
//     `focus`'s class (or, with no focus, leaves it unbiased). Stronger lean =
//     more of the chosen class crowds the trait list. It NEVER touches values.
//   • focus (a trait id, e.g. 'PYRO') — pins a specific trait TYPE: that exact
//     trait id is GUARANTEED to appear. Its `value` STILL rolls within its band
//     — focus narrows the type, never the value (the residual-RNG gamble).

import {
    WEAPON_TRAITS,
    rollableTraitsFor,
    traitCountForRarity,
    DEFAULT_ELEMENT,
} from './weapon-traits.js';

// Lean → how aggressively we bias picks toward the focus trait's class.
// `extraGuaranteed` slots are filled from the focus class up-front (after the
// focus trait itself); `pickWeight` multiplies a same-class trait's draw weight
// when filling the remaining random slots. None = neutral.
const LEAN_BIAS = {
    None:   { extraGuaranteed: 0, pickWeight: 1 },
    Lean:   { extraGuaranteed: 0, pickWeight: 3 },
    Strong: { extraGuaranteed: 1, pickWeight: 6 },
    Pure:   { extraGuaranteed: 2, pickWeight: 12 },
};

const ELEMENT_CLASS = 'ELEMENT';

// rng → integer in [0, n) (n>0). Pure helper over the injected rng.
function randInt(rng, n) {
    return Math.floor(rng() * n) % n;
}

// Roll a trait's magnitude within its `roll: {min,max}` band (inclusive), if it
// has one. Integer-valued (the bands are count- and percent-point magnitudes).
// Traits with no `roll` (most Element + a few binary Behaviors) get no `value`.
function rollValue(def, rng) {
    if (!def.roll) return undefined;
    const { min, max } = def.roll;
    if (max <= min) return min;
    return min + randInt(rng, max - min + 1);
}

// Weighted pick from a list of trait DEFS: each def whose class === biasClass is
// `weight`× as likely. Returns an index into `defs`. Pure over rng.
function weightedPickIndex(defs, biasClass, weight, rng) {
    if (defs.length === 0) return -1;
    if (!biasClass || weight === 1) return randInt(rng, defs.length);
    let total = 0;
    for (const d of defs) total += d.class === biasClass ? weight : 1;
    let r = rng() * total;
    for (let i = 0; i < defs.length; i++) {
        r -= defs[i].class === biasClass ? weight : 1;
        if (r < 0) return i;
    }
    return defs.length - 1; // float-rounding fallback
}

// Materialize a trait def into the on-item trait shape: { id, class, value? }.
function materialize(def, rng) {
    const trait = { id: def.id, class: def.class };
    const value = rollValue(def, rng);
    if (value !== undefined) trait.value = value;
    return trait;
}

/**
 * rollWeapon({ archetype, rarity, lean, focus, rng }) → a weapon item object.
 *
 * @param {object}   opts
 * @param {string}   opts.archetype  archetype id (e.g. 'PULSE', 'RAIL', 'NOVA').
 * @param {string|number} [opts.rarity='common']  rarity tier key or 1-based number.
 * @param {'None'|'Lean'|'Strong'|'Pure'} [opts.lean='None']  class bias strength.
 * @param {string|null}  [opts.focus=null]  a trait id to GUARANTEE (type only).
 * @param {() => number} [opts.rng=Math.random]  injected uniform rng in [0,1).
 *
 * @returns {{
 *   archetype: string,
 *   rarity: string|number,
 *   traits: Array<{ id: string, class: string, value?: number }>,
 *   element: string,        // the resolved element trait id, or KINETIC default
 * }}
 *
 * Guarantees:
 *   • traits.length === traitCountForRarity(rarity) (capped by the rollable pool).
 *   • all traits are distinct ids drawn from rollableTraitsFor(archetype).
 *   • if `focus` is a rollable trait id, that exact id is present.
 *   • at MOST one ELEMENT trait; `element` is that trait's id, else KINETIC.
 *   • values roll within each trait's `roll` band; types are biased, values are not.
 *   • deterministic for a fixed `rng`.
 */
export function rollWeapon({
    archetype,
    rarity = 'common',
    lean = 'None',
    focus = null,
    rng = Math.random,
} = {}) {
    const pool = rollableTraitsFor(archetype);
    const targetCount = Math.min(traitCountForRarity(rarity), pool.length);

    const bias = LEAN_BIAS[lean] || LEAN_BIAS.None;

    // Resolve focus → a rollable def (only if it's actually in this pool).
    const focusDef =
        focus && pool.some((d) => d.id === focus) ? WEAPON_TRAITS[focus] : null;
    // Lean biases toward the focus trait's class.
    const biasClass = focusDef ? focusDef.class : null;

    const chosen = [];
    const usedIds = new Set();
    let elementTaken = false;

    const take = (def) => {
        if (!def || usedIds.has(def.id)) return false;
        // Enforce "at most one Element trait".
        if (def.class === ELEMENT_CLASS && elementTaken) return false;
        chosen.push(def);
        usedIds.add(def.id);
        if (def.class === ELEMENT_CLASS) elementTaken = true;
        return true;
    };

    // 1) Focus pins its TYPE first (guaranteed present).
    if (focusDef && chosen.length < targetCount) take(focusDef);

    // 2) Lean front-loads extra same-class slots (Strong/Pure), if room.
    if (biasClass) {
        let extra = bias.extraGuaranteed;
        for (let i = 0; i < pool.length && extra > 0 && chosen.length < targetCount; i++) {
            const d = pool[i];
            if (d.class === biasClass && !usedIds.has(d.id)) {
                // Element class can only contribute one trait total.
                if (d.class === ELEMENT_CLASS && elementTaken) continue;
                if (take(d)) extra--;
            }
        }
    }

    // 3) Fill the rest with weighted random draws (bias toward focus class).
    let guard = 0;
    const guardMax = pool.length * 8 + 16;
    while (chosen.length < targetCount && guard++ < guardMax) {
        const candidates = pool.filter(
            (d) =>
                !usedIds.has(d.id) &&
                !(d.class === ELEMENT_CLASS && elementTaken),
        );
        if (candidates.length === 0) break;
        const idx = weightedPickIndex(candidates, biasClass, bias.pickWeight, rng);
        take(candidates[idx]);
    }

    // 4) Materialize: roll each chosen trait's value within its band.
    const traits = chosen.map((def) => materialize(def, rng));

    // 5) Resolve element: the single Element trait's id, or the KINETIC default.
    const elementTrait = traits.find((t) => t.class === ELEMENT_CLASS);
    const element = elementTrait ? elementTrait.id : DEFAULT_ELEMENT;

    return { archetype, rarity, traits, element };
}

/**
 * describeWeapon(weapon) → a short human string, e.g.
 *   "common PULSE — KINETIC · Multishot 2 · +14% Damage"
 *
 * Element prefix is the resolved element; traits list their display name and
 * rolled value where present.
 */
export function describeWeapon(weapon) {
    if (!weapon || !weapon.archetype) return '(invalid weapon)';
    const parts = weapon.traits.map((t) => {
        const def = WEAPON_TRAITS[t.id];
        const name = def ? def.name : t.id;
        return t.value !== undefined ? `${name} ${t.value}` : name;
    });
    const head = `${weapon.rarity} ${weapon.archetype} — ${weapon.element}`;
    return parts.length ? `${head} · ${parts.join(' · ')}` : head;
}
