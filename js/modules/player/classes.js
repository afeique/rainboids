// Looter-Economy Pivot — T07: Class definitions (per-run pick).
//
// Pure data, no DOM / globals. Transcribes the design doc §Phase 6 class
// table. A class is a SOFT lens (not a gate): a stat lean toward a family
// of SP stats + a UNIQUE MECHANIC (something no gear/set can replicate) +
// a FREE signature ability (the normal ability pool stays open to all).
//
// Shape of each entry:
//   {
//     id,                  // stable key (also the map key)
//     name,                // display name
//     favoredStats: [...], // SP stat ids (core/sp-stats.js) the class leans into.
//                          //   The class-system (T16) grants a soft +% lean to
//                          //   these and/or auto-allocates some leveling SP here.
//     mechanicId,          // a string HOOK id the class-system implements later —
//                          //   the unique, non-replicable mechanic. NOT wired here.
//     signatureAbilityId,  // a free, class-exclusive ability id (granted at run
//                          //   start in addition to the open 4-slot pool).
//     description,         // one-line summary of the fantasy.
//   }
//
// Notes on stat mapping:
//   - favoredStats reference REAL sp-stats ids (HEALTH, TOUGHNESS, VAMPIRISM,
//     THORNS, CRIT_CHANCE, CRIT_DAMAGE, DODGE, SPEED, CAPACITOR, REACTOR,
//     EFFICIENCY, REGENERATION). They are the only canonical stat axes.
//   - The design table lists Elementalist's favored stats as "(status)" and
//     Wildcard's as "R$-FIND". Neither is an SP stat axis. Those identities
//     live in the MECHANIC, not in SP; for the soft stat lean we point each at
//     the nearest real SP family (Elementalist → energy/uptime that fuels
//     status application; Wildcard → broad survivability + crit so a random
//     build still functions). R$-find itself is a gear/Matrix line, not SP.
//
// The signature abilities reference ids that either already exist in
// combat/weapon-data.js ABILITIES (e.g. SENTRY_DRONE) or are NEW
// class-exclusive ability ids the ability system will register later
// (OVERDRIVE_BURST, FORTRESS, HARVEST, SLIPSTREAM, ELEMENTAL_NOVA, JACKPOT).
// They are strings here — pure data, no behavior.

export const CLASSES = {
    STRIKER: {
        id: 'STRIKER',
        name: 'Striker',
        favoredStats: ['CRIT_CHANCE', 'CRIT_DAMAGE'],
        mechanicId: 'momentum_killstack',     // kills stack fire-rate; execute low-HP targets
        signatureAbilityId: 'OVERDRIVE_BURST',
        description: 'Crit-focused aggressor — kills stack fire-rate momentum and execute the wounded.',
    },
    BULWARK: {
        id: 'BULWARK',
        name: 'Bulwark',
        favoredStats: ['TOUGHNESS', 'HEALTH'],
        mechanicId: 'regen_overshield',        // regenerating overshield; can't be one-shot
        signatureAbilityId: 'FORTRESS',
        description: 'Immovable wall — a regenerating overshield and immunity to one-shots.',
    },
    REAPER: {
        id: 'REAPER',
        name: 'Reaper',
        favoredStats: ['VAMPIRISM', 'HEALTH'],
        mechanicId: 'heal_on_kill_overheal',   // heal-on-kill; overheal banks as a shield
        signatureAbilityId: 'HARVEST',
        description: 'Lifesteal predator — heal on kill and bank overheal as a shield.',
    },
    ENGINEER: {
        id: 'ENGINEER',
        name: 'Engineer',
        favoredStats: ['CAPACITOR', 'REACTOR'],
        mechanicId: 'deploy_construct',         // deploys a turret/drone; power weapons cost less
        signatureAbilityId: 'SENTRY_DRONE',
        description: 'Tech support — deploy autonomous constructs and run cheaper power weapons.',
    },
    TEMPEST: {
        id: 'TEMPEST',
        name: 'Tempest',
        favoredStats: ['SPEED', 'DODGE'],
        mechanicId: 'free_dash_trail',          // dash has no cooldown + leaves a damaging trail
        signatureAbilityId: 'SLIPSTREAM',
        description: 'Hyper-mobile skirmisher — free dashes that leave a damaging trail.',
    },
    ELEMENTALIST: {
        id: 'ELEMENTALIST',
        name: 'Elementalist',
        // "(status)" in the design table — no SP status axis exists, so the soft
        // lean points at the energy economy that fuels status uptime.
        favoredStats: ['REACTOR', 'EFFICIENCY'],
        mechanicId: 'reaction_amplifier',       // reactions stronger / statuses spread
        signatureAbilityId: 'ELEMENTAL_NOVA',
        description: 'Status mage — stronger elemental reactions and statuses that spread.',
    },
    WILDCARD: {
        id: 'WILDCARD',
        name: 'Wildcard',
        // "R$-FIND" in the design table is a gear/Matrix line, not SP. The soft
        // lean leans broad (survive + crit) so a random build always functions.
        favoredStats: ['DODGE', 'CRIT_CHANCE'],
        mechanicId: 'loot_gambit',              // extra loot/R$; a random buff each wave
        signatureAbilityId: 'JACKPOT',
        description: 'Luck-driven gambler — extra loot and Rainshards plus a random buff each wave.',
    },
};

// Ordered id list (stable iteration / UI order).
export const CLASS_ORDER = Object.keys(CLASSES);

// Lookup by id (null if unknown).
export function classDef(id) {
    return CLASSES[id] || null;
}
