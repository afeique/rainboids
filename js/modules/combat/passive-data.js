// ─── PASSIVES — the shared rule-modifier registry (Phase P, 2026-05-24) ──────
//
// "Passives" are build-defining GAMEPLAY MODIFIERS (rule-changers), distinct
// from STATS (numeric stat boons in weapon-data.js) and SP_STATS (SP-allocated
// stats). One registry, multiple delivery channels (design doc §10):
//   • equip SLOT   — gold-bought, 3 slots, swappable mid-run        (P4/P5)
//   • gear ITEM    — rolls as a passive-affix on high-tier gear     (P7)
//   • keystone CARD — stage-clear pick (later)                       (P7)
//
// P1 ships the DATA + delivery metadata only. The gameplay CONSUMERS (the
// actual effects at each `hooks` site) land in P6, and the item/card delivery
// channels in P7. Until then this registry is inert beyond the unlock store.
//
// Entry shape:
//   { id, name, desc,
//     hooks:       string[]   — consumer site(s) (documentation for P6)
//     tags:        string[]   — archetype tags (offense/defense/element/…)
//     slot:        boolean    — can be equipped in a passive slot
//     item:        boolean    — can roll as a passive-affix on gear
//     itemTierMin: rarity     — min gear rarity to roll (RARITY_ORDER id)
//     stack:       'binary'|'additive'
//     downside?:   string }   — risk/reward note where present
//
// Stacking (design §10): `binary` = simply ON if present from any source
// (slot + item gives no double benefit, just frees a slot); `additive` = sum
// magnitude across sources, each with its own soft cap (enforced by consumers).

export const PASSIVE_STACK = { BINARY: 'binary', ADDITIVE: 'additive' };

// Convenience tier constants (match RARITY_ORDER in world/item-names.js).
export const PASSIVE_ITEM_TIER = {
    EXCEPTIONAL: 'exceptional',
    LEGENDARY: 'legendary',
    TRANSCENDENTAL: 'transcendental',
};

const B = PASSIVE_STACK.BINARY;
const A = PASSIVE_STACK.ADDITIVE;
const EXC = PASSIVE_ITEM_TIER.EXCEPTIONAL;
const TRANS = PASSIVE_ITEM_TIER.TRANSCENDENTAL;

export const PASSIVES = {
    // ── Keystones — build-defining, binary. slot-always; the harsh-downside
    // ones are slot-ONLY (never roll "can't crit" on a helmet); the milder
    // ones can roll as a Transcendental chase affix.
    GLASS_CANNON: {
        id: 'GLASS_CANNON', name: 'Glass Cannon', desc: '+60% damage; −50% max HP',
        hooks: ['damage', 'maxHp'], tags: ['keystone', 'offense'],
        slot: true, item: false, stack: B, downside: '−50% max HP',
    },
    BERSERKERS_PACT: {
        id: 'BERSERKERS_PACT', name: "Berserker's Pact", desc: 'Damage ramps as HP falls (up to +80% near death)',
        hooks: ['damage'], tags: ['keystone', 'offense'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
    },
    GUNSLINGER: {
        id: 'GUNSLINGER', name: 'Gunslinger', desc: '+50% primary damage, +30% fire rate',
        hooks: ['damage', 'fireRate', 'disableSlots'], tags: ['keystone', 'offense'],
        slot: true, item: false, stack: B, downside: 'No power weapons or abilities',
    },
    PURIST: {
        id: 'PURIST', name: 'Purist', desc: '+40% flat damage; shots pierce',
        hooks: ['damage', 'bullet', 'crit'], tags: ['keystone', 'offense'],
        slot: true, item: false, stack: B, downside: 'Cannot crit',
    },
    TWIN_CAST: {
        id: 'TWIN_CAST', name: 'Twin Cast', desc: 'Power weapons fire twice (2nd at 50%); abilities +1 charge',
        hooks: ['powerFire', 'abilityCast', 'energyCost'], tags: ['keystone', 'power'],
        slot: true, item: true, itemTierMin: TRANS, stack: B, downside: 'Energy cost +30%',
    },
    PRISMATIC_SOUL: {
        id: 'PRISMATIC_SOUL', name: 'Prismatic Soul', desc: 'Your shots auto-cycle all 6 elements',
        hooks: ['bulletElement'], tags: ['keystone', 'element'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
    },
    OVERFLOW_CAPACITOR: {
        id: 'OVERFLOW_CAPACITOR', name: 'Overflow Capacitor', desc: '2× energy regen, +50% max energy',
        hooks: ['energyRegen', 'maxEnergy', 'energyCost'], tags: ['keystone', 'energy'],
        slot: true, item: true, itemTierMin: TRANS, stack: B, downside: 'Power costs ×1.5',
    },
    KILLING_SPREE: {
        id: 'KILLING_SPREE', name: 'Killing Spree', desc: 'Kill-streak no longer resets on hit (slow decay); ×2 streak damage',
        hooks: ['streak'], tags: ['keystone', 'tempo'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
    },
    ONE_WITH_THE_VOID: {
        id: 'ONE_WITH_THE_VOID', name: 'One With The Void', desc: '5s without a hit → +40% dodge (phased); breaks on hit',
        hooks: ['noHitTimer', 'dodge'], tags: ['keystone', 'defense', 'tempo'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
    },
    SECOND_HEART: {
        id: 'SECOND_HEART', name: 'Second Heart', desc: 'Survive a lethal hit once per stage at 30% HP + i-frames',
        hooks: ['lethal'], tags: ['keystone', 'defense'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
    },

    // ── Modular — item + slot, mostly additive, safe to stack. The natural
    // gear-affix pool (Exceptional+).
    CATALYST: {
        id: 'CATALYST', name: 'Catalyst', desc: 'Status reactions deal +50% per source & spread +1',
        hooks: ['reaction'], tags: ['element'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    FROSTBITE: {
        id: 'FROSTBITE', name: 'Frostbite', desc: 'Chill/freeze builds 25% faster',
        hooks: ['status'], tags: ['element'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    HEX_TOUCH: {
        id: 'HEX_TOUCH', name: 'Hex Touch', desc: '+20% status-tick damage (burn/corrode/bleed)',
        hooks: ['statusTick'], tags: ['element'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    KINDLING: {
        id: 'KINDLING', name: 'Kindling', desc: 'Burn/corrode spreads to +1 nearby enemy',
        hooks: ['status', 'spread'], tags: ['element'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    STATIC_CHARGE: {
        id: 'STATIC_CHARGE', name: 'Static Charge', desc: 'Every 5th hit emits a small conduct zap',
        hooks: ['onHit'], tags: ['element'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    OPPORTUNIST: {
        id: 'OPPORTUNIST', name: 'Opportunist', desc: '+15% damage vs status-afflicted enemies',
        hooks: ['damage'], tags: ['offense', 'element'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    PREDATOR: {
        id: 'PREDATOR', name: 'Predator', desc: 'The first hit on a full-HP enemy always crits',
        hooks: ['crit', 'onHit'], tags: ['offense'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    VAMPIRIC_ROUNDS: {
        id: 'VAMPIRIC_ROUNDS', name: 'Vampiric Rounds', desc: 'Crits heal 2 HP',
        hooks: ['crit', 'heal'], tags: ['sustain', 'offense'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    RICOCHET: {
        id: 'RICOCHET', name: 'Ricochet', desc: 'Killing a foe bounces the shot to a new target',
        hooks: ['onKill', 'bullet'], tags: ['offense'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    MOMENTUM_ROUNDS: {
        id: 'MOMENTUM_ROUNDS', name: 'Momentum Rounds', desc: 'Bullets gain damage the farther they fly',
        hooks: ['bullet', 'damage'], tags: ['offense'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    CHAIN_REACTION: {
        id: 'CHAIN_REACTION', name: 'Chain Reaction', desc: 'Explosive kills get +50% blast radius',
        hooks: ['explosion'], tags: ['offense'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    KINETIC_BATTERY: {
        id: 'KINETIC_BATTERY', name: 'Kinetic Battery', desc: 'Dashing refunds energy',
        hooks: ['dash', 'energy'], tags: ['energy', 'tempo'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    OVERFLOW_SPARK: {
        id: 'OVERFLOW_SPARK', name: 'Overflow Spark', desc: 'At full energy, primaries deal +25% damage',
        hooks: ['damage', 'energy'], tags: ['energy', 'offense'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    LAST_BASTION: {
        id: 'LAST_BASTION', name: 'Last Bastion', desc: 'Below 30% HP, +20% dodge',
        hooks: ['dodge'], tags: ['defense'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    GUARDIAN_ECHO: {
        id: 'GUARDIAN_ECHO', name: 'Guardian Echo', desc: 'A lethal-threshold hit emits a knockback nova (no death-save)',
        hooks: ['damageTaken'], tags: ['defense'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    SALVAGE_PROTOCOL: {
        id: 'SALVAGE_PROTOCOL', name: 'Salvage Protocol', desc: '+1 Core per salvage; better tier-up chance on drops',
        hooks: ['salvage', 'drop'], tags: ['econ'], slot: false, item: true, itemTierMin: EXC, stack: A,
    },
    SCAVENGER: {
        id: 'SCAVENGER', name: 'Scavenger', desc: '+50% item drop rate, huge pickup radius',
        hooks: ['drop', 'pickup'], tags: ['econ'], slot: true, item: false, stack: A,
    },
    HOARDERS_GREED: {
        id: 'HOARDERS_GREED', name: "Hoarder's Greed", desc: '+100% gold-find; gold orbs heal 1 HP',
        hooks: ['gold', 'drop', 'damageTaken'], tags: ['econ'], slot: true, item: false, stack: B,
        downside: '+15% damage taken',
    },
};

/** A passive entry by id, or null. */
export function getPassive(id) { return PASSIVES[id] || null; }

/** All passive entries. */
export function getAllPassives() { return Object.values(PASSIVES); }

/** Passives that can be equipped in a passive slot (gold-bought channel). */
export function getSlotPassives() { return Object.values(PASSIVES).filter((p) => p.slot); }

/** Passives that can roll as a gear affix (optionally gated to a rarity). */
export function getItemPassives() { return Object.values(PASSIVES).filter((p) => p.item); }
