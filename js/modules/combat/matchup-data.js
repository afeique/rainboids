// ─────────────────────────────────────────────────────────────────────────────
// Weapon-vs-Enemy-Archetype Effectiveness Matchups (rock-paper-scissors layer)
// ─────────────────────────────────────────────────────────────────────────────
//
// PURPOSE
//   The 29 enemy types are grouped into 7 ARCHETYPES by their `brain` block in
//   enemy-data.js (strategies / mass / swarm flag / preferredRange / size+speed).
//   Each PRIMARY weapon is grouped into a delivery CLASS (how it puts damage on
//   target). This module maps (weaponClass × enemyArchetype) → a damage
//   MULTIPLIER so weapon choice becomes strategic: a weapon designed to beat a
//   given archetype hits harder against it and softer against the archetypes it
//   was never meant to fight.
//
//   This is a *nudge*, NOT a rebalance. Multipliers are kept in a tight
//   ~0.6 … 1.5 band so no weapon trivializes (or becomes useless against) any
//   archetype — base EDPS balance (weapon-data.js 9.2.2 pass) is untouched. It
//   layers on TOP of the existing element-resistance / armor / frontal-shield
//   math in collision-system's enemy-damage path.
//
//   Unknown weapon id or unknown enemy type → 1.0 (neutral). The wiring in
//   collision-system degrades gracefully: a bullet with no weaponId is neutral,
//   never broken.
//
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. ENEMY TYPE → ARCHETYPE ────────────────────────────────────────────────
// Derived from each type's `brain` block in enemy-data.js:
//   BRUTE       — high mass (≥3), very low maxTurnRate, close_distance/flank,
//                 big/slow tanks that close and ram (GUARDIAN, PROWLER, TITAN,
//                 GLACIER, WARDEN).
//   INTERCEPTOR — low mass (~0.75-0.9), high force/turn, dive_bomb, small/fast
//                 (HUNTER, STALKER, FROST_LANCE, TESLA_WRAITH, PHANTOM).
//   SWARMER     — tiny mass (≤0.5), swarm:true, flocks & overwhelms
//                 (WASP, CINDER).
//   SNIPER      — kite/orbit at long preferredRange (≥300), lead-firing standoff
//                 (SENTINEL, DRIFTER, NULL_DRONE).
//   ORBITER     — orbit/kite circler at mid range (WEAVER, PRISM_MIRROR).
//   SUPPORT     — hangs back (kite/regroup only), buffs/heals/suppresses allies
//                 (LUMEN_DRONE, CONDUIT_NODE, SPORE_CARRIER).
//   SPECIAL     — bespoke gimmick enemies that don't fit the clean buckets
//                 (TANGERINE, ASHEN_DETONATOR, PLAGUEBEARER, HYDRA, DEVOURER,
//                  LEECH, JUGGERNAUT, THORNBACK, WRAITHWORM).
export const ENEMY_ARCHETYPE = {
    // BRUTE
    GUARDIAN:        'BRUTE',
    PROWLER:         'BRUTE',
    TITAN:           'BRUTE',
    GLACIER:         'BRUTE',
    WARDEN:          'BRUTE',
    // INTERCEPTOR
    HUNTER:          'INTERCEPTOR',
    STALKER:         'INTERCEPTOR',
    FROST_LANCE:     'INTERCEPTOR',
    TESLA_WRAITH:    'INTERCEPTOR',
    PHANTOM:         'INTERCEPTOR',
    // SWARMER
    WASP:            'SWARMER',
    CINDER:          'SWARMER',
    // SNIPER
    SENTINEL:        'SNIPER',
    DRIFTER:         'SNIPER',
    NULL_DRONE:      'SNIPER',
    // ORBITER
    WEAVER:          'ORBITER',
    PRISM_MIRROR:    'ORBITER',
    // SUPPORT
    LUMEN_DRONE:     'SUPPORT',
    CONDUIT_NODE:    'SUPPORT',
    SPORE_CARRIER:   'SUPPORT',
    // SPECIAL
    TANGERINE:       'SPECIAL',
    ASHEN_DETONATOR: 'SPECIAL',
    PLAGUEBEARER:    'SPECIAL',
    HYDRA:           'SPECIAL',
    DEVOURER:        'SPECIAL',
    LEECH:           'SPECIAL',
    JUGGERNAUT:      'SPECIAL',
    THORNBACK:       'SPECIAL',
    WRAITHWORM:      'SPECIAL',
};

// ── 2. WEAPON ID → DELIVERY CLASS ────────────────────────────────────────────
// Classified from the real weapon ids + stats in weapon-data.js (PRIMARY_WEAPONS):
//   PRECISION — one big, accurate shot at a single target. Rail Driver (slow,
//               high per-shot, piercing line) + Pulse Cannon (steady reliable
//               single stream). Great at putting concentrated damage on ONE
//               distant/tanky target; wasteful sprayed across a swarm.
//   SPREAD    — many simultaneous projectiles fanned across an arc. Scatter Shot
//               (5-pellet shotgun cone) + Storm Needles (rapid randomized cone).
//               Lands many hits on many/erratic targets; pellets underwhelm a
//               single tank.
//   AOE       — area burst. Cluster Launcher (lobbed bomb + scattering bomblets)
//               + Flak Cannon (proximity airburst into a shrapnel ring). Erases
//               clumps; the lone fast mover dives between the blasts.
//   BOUNCE    — caroms/returns reuse the same round across multiple targets.
//               Ricochet (wall + enemy carom) + Boomerang (out-and-back double
//               pass) + Splitter (fragments on impact into seeking shards). The
//               extra hits find moving packs; neutral vs a single stationary tank.
//   UTILITY   — Gravity Lance: low direct damage, pulls a pack together. A
//               crowd-control setup tool, strong vs loose swarms, useless vs a
//               heavy you can't drag.
//   RAMP      — Spin Cannon: fire-rate spools up the longer you hold. Rewards
//               sustained fire on something that stays put (a brute); the fast
//               mover is gone before it spools.
//
// (BEAM is reserved in the design brief, but in the current roster the beams
//  LANCE_BEAM / LIGHTNING_ARC live in POWER_WEAPONS, not PRIMARY_WEAPONS, so no
//  primary maps to BEAM today. The class constant is still exported + handled in
//  the matrix so a future primary beam slots in with zero wiring changes.)
export const WEAPON_CLASS = {
    // PRECISION — single-target concentrators
    RAIL_DRIVER:      'PRECISION',
    PULSE_CANNON:     'PRECISION',
    // SPREAD — multi-projectile cones
    SCATTER_GUN:      'SPREAD',
    STORM_NEEDLES:    'SPREAD',
    // AOE — area bursts
    CLUSTER_LAUNCHER: 'AOE',
    FLAK_CANNON:      'AOE',
    // BOUNCE — caroming / returning / fragmenting reuse
    RICOCHET:         'BOUNCE',
    BOOMERANG:        'BOUNCE',
    SPLITTER:         'BOUNCE',
    // UTILITY — crowd-control setup
    GRAVITY_LANCE:    'UTILITY',
    // RAMP — spin-up commitment hose
    SPIN_CANNON:      'RAMP',
};

// ── 3. MATCHUP MATRIX (weaponClass × enemyArchetype → multiplier) ────────────
//
//             | BRUTE | INTERCEPTOR | SWARMER | SNIPER | ORBITER | SUPPORT | SPECIAL
//   ----------+-------+-------------+---------+--------+---------+---------+--------
//   PRECISION | 1.30  |    1.00     |  0.70   |  1.40  |  0.90   |  1.30   |  1.00
//   SPREAD    | 0.70  |    1.10     |  1.40   |  0.80  |  1.30   |  1.00   |  1.00
//   AOE       | 0.90  |    0.65     |  1.50   |  1.00  |  1.10   |  1.40   |  1.00
//   BOUNCE    | 0.90  |    1.10     |  1.30   |  0.90  |  1.40   |  1.00   |  1.00
//   BEAM      | 1.20  |    0.90     |  0.80   |  1.30  |  1.10   |  1.20   |  1.00
//   UTILITY   | 0.65  |    1.00     |  1.40   |  1.00  |  1.20   |  1.10   |  1.00
//   RAMP      | 1.40  |    0.65     |  0.90   |  1.20  |  0.90   |  1.10   |  1.00
//
// Rationale (per the design brief):
//   PRECISION strong vs SNIPER/SUPPORT (pick off distant single targets) and
//     BRUTE (sustained single-target); weak vs SWARMER (overkill + slow cadence).
//   SPREAD strong vs SWARMER/ORBITER (many/moving targets); weak vs BRUTE
//     (pellets underwhelm a tank) and SNIPER (cone diffuses at standoff range).
//   AOE strong vs SWARMER/SUPPORT clusters; weak vs the lone fast INTERCEPTOR
//     that dives between detonations.
//   BOUNCE strong vs ORBITER/SWARMER (caroms find moving packs); ~neutral else.
//   UTILITY (Gravity Lance) strong vs SWARMER (pulls the pack together);
//     weak vs BRUTE (can't drag a heavy).
//   RAMP (Spin Cannon) strong vs BRUTE (sustained spool on a target that stays);
//     weak vs INTERCEPTOR (gone before it spins up).
//   SPECIAL is left neutral (1.0) across the board — bespoke gimmick enemies
//     shouldn't be globally easy/hard for any one weapon class.
const MATCHUP_TABLE = {
    PRECISION: { BRUTE: 1.30, INTERCEPTOR: 1.00, SWARMER: 0.70, SNIPER: 1.40, ORBITER: 0.90, SUPPORT: 1.30, SPECIAL: 1.00 },
    SPREAD:    { BRUTE: 0.70, INTERCEPTOR: 1.10, SWARMER: 1.40, SNIPER: 0.80, ORBITER: 1.30, SUPPORT: 1.00, SPECIAL: 1.00 },
    AOE:       { BRUTE: 0.90, INTERCEPTOR: 0.65, SWARMER: 1.50, SNIPER: 1.00, ORBITER: 1.10, SUPPORT: 1.40, SPECIAL: 1.00 },
    BOUNCE:    { BRUTE: 0.90, INTERCEPTOR: 1.10, SWARMER: 1.30, SNIPER: 0.90, ORBITER: 1.40, SUPPORT: 1.00, SPECIAL: 1.00 },
    BEAM:      { BRUTE: 1.20, INTERCEPTOR: 0.90, SWARMER: 0.80, SNIPER: 1.30, ORBITER: 1.10, SUPPORT: 1.20, SPECIAL: 1.00 },
    UTILITY:   { BRUTE: 0.65, INTERCEPTOR: 1.00, SWARMER: 1.40, SNIPER: 1.00, ORBITER: 1.20, SUPPORT: 1.10, SPECIAL: 1.00 },
    RAMP:      { BRUTE: 1.40, INTERCEPTOR: 0.65, SWARMER: 0.90, SNIPER: 1.20, ORBITER: 0.90, SUPPORT: 1.10, SPECIAL: 1.00 },
};

// Clamp band — keeps every effective multiplier modest (a nudge, never a wall).
export const MATCHUP_MIN = 0.6;
export const MATCHUP_MAX = 1.5;

/**
 * matchupMultiplier(weaponId, enemyType) → number
 *
 * Returns the weapon-vs-archetype damage multiplier, in [MATCHUP_MIN, MATCHUP_MAX].
 * Defaults to 1.0 (neutral) for ANY unknown weapon id, unknown enemy type, or
 * unclassified class/archetype combination — so an un-tagged bullet never breaks
 * the damage path. The result is always clamped into the [0.6, 1.5] band.
 *
 * @param {string} weaponId   bullet source weapon id (e.g. 'RAIL_DRIVER')
 * @param {string} enemyType  enemy type string (e.g. 'TITAN')
 * @returns {number} damage multiplier
 */
export function matchupMultiplier(weaponId, enemyType) {
    if (!weaponId || !enemyType) return 1.0;
    const cls = WEAPON_CLASS[weaponId];
    const arch = ENEMY_ARCHETYPE[enemyType];
    if (!cls || !arch) return 1.0;
    const row = MATCHUP_TABLE[cls];
    if (!row) return 1.0;
    const m = row[arch];
    if (typeof m !== 'number' || !isFinite(m)) return 1.0;
    // Clamp into the design band so no future table edit can over/under-shoot.
    return Math.min(MATCHUP_MAX, Math.max(MATCHUP_MIN, m));
}

// Alias matching the design-brief name `MATCHUP` (the callable matrix).
export const MATCHUP = matchupMultiplier;
