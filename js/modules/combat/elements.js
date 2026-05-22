// Element & Resistance System — Phase E1 (foundation; no behavior yet).
//
// Every damaging source carries an `element`; every target (enemy or player)
// carries a `resist` map keyed by element id. The damage path multiplies by
// `elementalMultiplier(resistMap, element)`:
//
//   E2 — player→enemy (applyDamageToEnemy)
//   E5 — enemy→player (lifecycle.takeDamage)
//
// The `statusId` each element carries is the signature status it applies on
// hit; those statuses are implemented in E3 and wired to weapons in E6. E1
// only establishes the taxonomy + the multiplier helper, so adding this module
// changes NOTHING in gameplay until a later phase reads it.

export const ELEMENTS = {
    KINETIC: { id: 'KINETIC', name: 'Kinetic', color: '#dfe7f0', statusId: null,      desc: 'Physical baseline — no resist quirks; always reliable.' },
    PYRO:    { id: 'PYRO',    name: 'Pyro',    color: '#ff5522', statusId: 'BRN',     desc: 'Fire — burns over time; ignites OIL-coated targets.' },
    CRYO:    { id: 'CRYO',    name: 'Cryo',    color: '#66ccff', statusId: 'CHILL',   desc: 'Ice — chills, then freezes brittle for a shatter.' },
    VOLT:    { id: 'VOLT',    name: 'Volt',    color: '#a855ff', statusId: 'CONDUCT', desc: 'Lightning — chains; amplified by CONDUCT (wet).' },
    TOXIC:   { id: 'TOXIC',   name: 'Toxic',   color: '#88ff44', statusId: 'CORRODE', desc: 'Acid/bio — corrodes (vulnerability) + poison DoT.' },
    VOID:    { id: 'VOID',    name: 'Void',    color: '#7744dd', statusId: 'MARK',    desc: 'Gravity/dark — pulls targets together + marks them.' },
    RADIANT: { id: 'RADIANT', name: 'Radiant', color: '#ffee88', statusId: 'PURGE',   desc: 'Plasma/light — cuts through shields and armor.' },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS);

export const DEFAULT_ELEMENT = 'KINETIC';

/**
 * Damage multiplier for `element` against a target's `resistMap`.
 *
 *   resist  > 0  → resistant  (multiplier < 1)
 *   resist  = 1  → immune     (multiplier 0)
 *   resist  < 0  → weak       (multiplier > 1 — a damage bonus)
 *   absent / 0   → neutral    (multiplier 1)
 *
 * Result is clamped to [0, 2] so a single weakness can't exceed +100%.
 */
export function elementalMultiplier(resistMap, element) {
    if (!resistMap || !element) return 1;
    const r = resistMap[element];
    if (!r) return 1; // undefined or 0 → neutral (negative passes through)
    return Math.min(2, Math.max(0, 1 - r));
}

/** True if `id` is a known element. */
export function isElement(id) {
    return Object.prototype.hasOwnProperty.call(ELEMENTS, id);
}

// ─── E8e — Adaptive resistance (Warden) ─────────────────────────────────────
// Pure helpers for an enemy that "learns" the element you keep hitting it with.
// Only used on enemies flagged `adaptive`, whose instance resist map starts
// empty (so these mutate only adaptation, never a fixed base profile).

/**
 * Bump the target's resistance to `element` toward `cap` by `step` (mutates
 * `resistMap` in place). Called after a hit lands, so the CURRENT hit uses the
 * old resist and the adaptation shows on the NEXT same-element hit — "you hit
 * it with fire, now it resists fire."
 */
export function adaptResist(resistMap, element, step = 0.12, cap = 0.75) {
    if (!resistMap || !element) return;
    resistMap[element] = Math.min(cap, (resistMap[element] || 0) + step);
}

/**
 * Decay every entry of an adaptive resist map toward 0 by `factor` (mutates in
 * place); entries at/under `floor` are removed. Run on a slow timer so that
 * switching elements lets the old resistance fade — the counter-play to the
 * adapt loop. Only call on adaptive enemies (fixed resist profiles must NOT
 * decay).
 */
export function decayResistMap(resistMap, factor = 0.8, floor = 0.02) {
    if (!resistMap) return;
    for (const k of Object.keys(resistMap)) {
        const v = resistMap[k] * factor;
        if (v <= floor) delete resistMap[k];
        else resistMap[k] = v;
    }
}
