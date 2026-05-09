// 5.79.62 — Defense item registry. Single source of truth for the 8
//   defense items that previously lived in TWO places:
//     - shop-manager.js shopItems[]  (suspended in 5.79.57; provides
//                                     cost/maxStacks/currency for the
//                                     DEFENSE shop tab)
//     - combat-manager.js
//       NON_POWERUP_TYPES_CONFIGS    (provides display metadata —
//                                     name/description/icon/gradient
//                                     — for the pickup banner)
//
//   Both places agreed on the four overlapping IDs (HEALTH_BOOST,
//   SHIELD_BOOST, SPEED_BOOST, HEALTH_DROP_FREQUENCY) but anything
//   added in one place would silently drift away from the other.
//   Lifting both into this module means a future revival of the
//   DEFENSE shop tab will read from the same data both surfaces use,
//   and the pickup banner is guaranteed to render the latest copy.
//
//   Schema mirrors the shop-side fields a defense item needs, plus
//   the display fields the pickup banner reads:
//     id              string  — internal identifier; must match the
//                               key the player.addPowerup uses
//     name            string  — display name (banner toast + shop tile)
//     description     string  — one-line effect blurb (shared)
//     icon            string  — slug from js/modules/ui/icons.js
//     gradientColors  [a, b]  — body gradient for pickup banner
//     cost            number  — shop coin price (if revived)
//     maxStacks       number  — purchase cap
//     flatCost        bool?   — if true, ignore stack-scaling
//
//   When the DEFENSE shop tab comes back online, it can build its
//   item list straight from `Object.values(DEFENSE_CONFIGS)` — no
//   need to copy the data into a parallel array.

export const DEFENSE_CONFIGS = {
    HEALTH_BOOST: {
        id: 'HEALTH_BOOST',
        name: 'Health Boost',
        description: '+35 max HP per stack, full heal',
        icon: 'heart',
        gradientColors: ['#ff6666', '#cc0000'],
        cost: 1200,
        maxStacks: 10,
    },
    SHIELD_BOOST: {
        id: 'SHIELD_BOOST',
        name: 'Shielding',
        description: '+8% damage reduction per stack',
        icon: 'shield',
        gradientColors: ['#33ff99', '#006644'],
        cost: 1500,
        maxStacks: 8,
    },
    SPEED_BOOST: {
        id: 'SPEED_BOOST',
        name: 'Afterburner',
        description: '+65% thrust per stack',
        icon: 'wind',
        gradientColors: ['#ffff33', '#cc9900'],
        cost: 2200,
        maxStacks: 4,
    },
    HEALTH_DROP_FREQUENCY: {
        id: 'HEALTH_DROP_FREQUENCY',
        name: 'Triage',
        description: 'Health orbs drop more often',
        icon: 'hourglass',
        gradientColors: ['#66ffaa', '#229966'],
        cost: 1800,
        maxStacks: 6,
    },
    // ── Qualitative defense layer (5.75.0) — run-defining picks
    //    that change moment-to-moment survival math. Higher costs
    //    because each is a single decision, not an incremental
    //    bump. These were never in NON_POWERUP_TYPES_CONFIGS (they
    //    only appeared in the shop list) but are included here for
    //    future-proofing: any pickup-banner code path that needs
    //    their display metadata can resolve it through the same
    //    registry.
    REFLEXES: {
        id: 'REFLEXES',
        name: 'Reflexes',
        description: 'One free dodge per 30s — next bullet that would hit you misses',
        icon: 'vortex',
        gradientColors: ['#88ccff', '#225588'],
        cost: 5500,
        maxStacks: 1,
    },
    LAST_STAND: {
        id: 'LAST_STAND',
        name: 'Last Stand',
        description: 'On lethal hit, survive at 1 HP (once per run)',
        icon: 'fist',
        gradientColors: ['#ffcc44', '#aa5500'],
        cost: 8000,
        maxStacks: 1,
    },
    STATIC_FIELD: {
        id: 'STATIC_FIELD',
        name: 'Static Field',
        description: 'Auto-regen +2 HP shield per stack after 8s no damage',
        icon: 'bolt',
        gradientColors: ['#aaccff', '#3344aa'],
        cost: 3200,
        maxStacks: 3,
    },
    // 5.88.0 — SPARE_SHIP retired with the lives system. Energy tanks now
    // act as the safety net (3 triforce + spare; gained via overflow
    // healing, capped at 4); see lifecycle.js + hud/status.js.
};
