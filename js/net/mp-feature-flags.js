// js/net/mp-feature-flags.js
//
// Centralized feature-flag config for multiplayer mode. Suppresses
// abilities that don't yet have full Rust-mirror parity, so they
// can't desync MP gameplay.
//
// As Phase 2.5 collision pairs land in `server/src/sim/collision.rs`
// (see `docs/Multiplayer Coordination – 2026-05-09.md` for the live
// status table), abilities migrate from `MP_UNSAFE_ABILITIES_LIST`
// to `MP_SAFE_ABILITIES`. The goal of this module is to be
// EXPLICIT about which abilities are blocked rather than rely on
// an allow-all default.
//
// Wiring happens in a separate slice; this module is pure data + a
// helper for the engine-driver / weapon-pickup layer to consult.

// Abilities that have full JS+Rust parity coverage and are safe to use
// in MP. These IDs come from `js/modules/combat/weapon-data.js` —
// PRIMARY_WEAPONS section. Primary weapons fire `player_bullet` /
// straight-line projectiles, which have a Rust mirror (PR #20) plus
// the bullet ↔ asteroid collision pair (PRs #30/#31). They're the
// safest subset to expose first.
//
// Ships themselves are not listed here — there is no "ability ID" for
// the ship, the ship is always active. The `isAbilityMpSafe` helper
// is for abilities/weapons, not entity classes.
export const MP_SAFE_ABILITIES = new Set([
    // Primary weapons — straight-line player bullets, mirrored in Rust.
    'PULSE_CANNON',
    'STORM_NEEDLES',
    'SCATTER_GUN',
    'RAIL_DRIVER',
]);

// Abilities NOT yet ported / mirrored. Listed explicitly for
// transparency and so a code-search for any of these IDs lands here.
// All entries below lack a full Rust collision mirror as of
// Phase 2.5 (see coordination doc subsystem table).
export const MP_UNSAFE_ABILITIES_LIST = [
    // Power weapons (POWER_WEAPONS in weapon-data.js) — none have
    // Rust mirrors for their collision pairs yet.
    'CHARGE_SHOT',     // charge-based; no server-side accumulator
    'MINE_LAYER',      // mine entity + blast-radius collisions unported
    'NOVA_BLAST',      // ring-expansion + AoE collision unported
    'MISSILE_SALVO',   // homing missile sim + collision unported
    'LANCE_BEAM',      // sustained beam + raycast collision unported
    'LIGHTNING_ARC',   // chain-target lookup + tether sim unported

    // Defense skills (DEFENSE_SKILLS in weapon-data.js) — the five
    // remaining skills mutate ship state in ways the server doesn't
    // model yet. PHASE_DASH was removed from DEFENSE_SKILLS in 5.93.0
    // and is now a core SHIFT-key movement primitive (pure player
    // input + position kinematics, MP-safe).
    'BULWARK',         // damage-reduction window
    'REPAIR_NANITES',  // HoT regen tick
    'DEFLECTOR_ORBS',  // orbiting bullet-blockers
    'EMP_PULSE',       // AoE stun on enemies
    'TRACTOR_SHIELD',  // forward bullet-absorb + coin redirect
];

/**
 * Whether the given ability ID is safe to fire in multiplayer mode.
 * Returns true if the ability has full server-side parity; false
 * otherwise (the wrapper should suppress the input or visually
 * disable the ability when MP is active).
 *
 * Unknown / unrecognized ability IDs default to `true` — the caller
 * owns the engine state and should know what's running. This module
 * exists to flag KNOWN-unsafe abilities, not to gate the world.
 *
 * @param {string} abilityId
 * @returns {boolean}
 */
export function isAbilityMpSafe(abilityId) {
    if (MP_SAFE_ABILITIES.has(abilityId)) return true;
    if (MP_UNSAFE_ABILITIES_LIST.includes(abilityId)) return false;
    // Unknown ability — be permissive. New abilities should be added
    // to one of the two lists above as soon as they're authored.
    return true;
}
