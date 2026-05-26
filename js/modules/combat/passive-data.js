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

// P6 — Prismatic Soul cycles a shot's element through all six on each shot.
export const PRISMATIC_ELEMENTS = ['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID', 'RADIANT'];
/** The element for shot index `i` under Prismatic Soul (wraps, handles negatives). */
export function prismaticElement(i) {
    const n = PRISMATIC_ELEMENTS.length;
    return PRISMATIC_ELEMENTS[(((i | 0) % n) + n) % n];
}

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
        // §6c no-downsides — merged with the (inert) Berserker's Pact into one
        // keystone: pure-upside HP-scaling damage. The −50% max-HP downside and
        // the static damageMult are gone; the live HP ramp is wired in
        // player/passives.js getPassiveDamageMult (a static field can't be HP-aware).
        id: 'GLASS_CANNON', name: 'Glass Cannon', desc: '+40% damage, scaling to +90% as current HP falls',
        hooks: ['damage'], tags: ['keystone', 'offense'],
        slot: true, item: false, stack: B,
    },
    GUNSLINGER: {
        id: 'GUNSLINGER', name: 'Gunslinger', desc: '+50% primary damage, +30% fire rate',
        hooks: ['damage', 'fireRate'], tags: ['keystone', 'offense'],
        slot: true, item: false, stack: B,
    },
    PURIST: {
        id: 'PURIST', name: 'Purist', desc: '+40% flat damage; shots pierce',
        hooks: ['damage', 'bullet'], tags: ['keystone', 'offense'],
        slot: true, item: false, stack: B,
        damageMult: 1.4, // §6c no-downsides — +40% all damage + pierce; the no-crit downside was removed
    },
    APEX_PREDATOR: {
        // CD-02 §6c — no-downside offense keystone filling the slot freed by the
        // Berserker→Glass Cannon merge. Anchors crit/assassin builds; "fun to
        // feel." NO static damageMult — the execute IS the effect (wired in
        // collision-system.applyDamageToEnemy, gated on hasPassive). Bosses exempt.
        id: 'APEX_PREDATOR', name: 'Apex Predator', desc: 'Your damage executes enemies below 15% max HP',
        hooks: ['damage', 'execute'], tags: ['keystone', 'offense'],
        slot: true, item: false, stack: B,
    },
    TWIN_CAST: {
        id: 'TWIN_CAST', name: 'Twin Cast', desc: 'Power weapons fire twice (2nd at 50%); abilities +1 charge',
        hooks: ['powerFire', 'abilityCast', 'energyCost'], tags: ['keystone', 'power'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
    },
    PRISMATIC_SOUL: {
        id: 'PRISMATIC_SOUL', name: 'Prismatic Soul', desc: 'Your shots auto-cycle all 6 elements',
        hooks: ['bulletElement'], tags: ['keystone', 'element'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
    },
    OVERFLOW_CAPACITOR: {
        id: 'OVERFLOW_CAPACITOR', name: 'Overflow Capacitor', desc: '2× energy regen, +50% max energy',
        // §6c no-downsides — reworked to pure 2×regen/+50%max (wired into the
        // getEffectiveMaxEnergy/RegenMult getters); the ×1.5 power-cost downside removed.
        hooks: ['energyRegen', 'maxEnergy'], tags: ['keystone', 'energy'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
    },
    CAPACITOR_BANK: {
        // Energy keystone — the meter can OVERCHARGE past the normal cap (up to
        // 150%); the overcharge decays back toward the cap, but powers fired
        // while overcharged deal +25%. No downside. Wired in:
        //   • getEnergyOverchargeCap (progression.js) — the ×1.5 clamp cap
        //   • player.js — regen clamp + addEnergy clamp use the overcharge cap;
        //     a per-frame block bleeds the overcharge back toward the normal cap
        //   • weapons.js firePower / fireChargedShot — +25% power damage while
        //     above the normal cap (captured BEFORE the spend)
        id: 'CAPACITOR_BANK', name: 'Capacitor Bank', desc: 'Energy overcharges to 150%; the overcharge decays, but powers fired while overcharged deal +25%',
        hooks: ['maxEnergy', 'energyRegen', 'damage'], tags: ['keystone', 'energy'],
        slot: true, item: true, itemTierMin: TRANS, stack: B,
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
    BLOODSHIELD: {
        id: 'BLOODSHIELD', name: 'Bloodshield', desc: 'Over-healing banks a temporary shield that soaks damage before your HP (max 35% HP).',
        hooks: ['heal', 'damageTaken'], tags: ['defense', 'sustain'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    BLOODLUST: {
        id: 'BLOODLUST', name: 'Bloodlust', desc: 'Each kill grants a stack of Bloodlust: +4% damage per stack (cap +40%), decaying without kills.',
        hooks: ['onKill', 'damage'], tags: ['offense', 'tempo'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    SANGUINE: {
        id: 'SANGUINE', name: 'Sanguine', desc: 'Each enemy kill heals you for 4% of your max HP.',
        hooks: ['onKill', 'heal'], tags: ['sustain'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    HEMOGLUTTON: {
        id: 'HEMOGLUTTON', name: 'Hemoglutton', desc: 'Your lifesteal heals double when it lands on a status-afflicted enemy.',
        hooks: ['onHit', 'heal'], tags: ['sustain', 'element'], slot: true, item: true, itemTierMin: EXC, stack: B,
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
    },

    // ── Round-3 §10.1 — additional keystones (slot-only, build-defining, binary) ──
    EYE_OF_THE_STORM: {
        id: 'EYE_OF_THE_STORM', name: 'Eye of the Storm', desc: 'While stationary, nearby enemies + their projectiles slow 40%',
        hooks: ['stationary', 'enemySlow'], tags: ['keystone', 'tempo', 'defense'],
        // §6c no-downsides — the "sitting target" risk is EMERGENT (you choose to
        // stand still), not an imposed mechanical penalty, so no downside field.
        slot: true, item: false, stack: B,
    },
    DETONATOR: {
        id: 'DETONATOR', name: 'Detonator', desc: 'Killing a status-afflicted enemy detonates its statuses as an AoE (fire/frost/acid)',
        hooks: ['onKill', 'status'], tags: ['keystone', 'element'], slot: true, item: false, stack: B,
    },
    FRENZY: {
        id: 'FRENZY', name: 'Frenzy', desc: '+8% damage per nearby enemy (cap +80%)',
        hooks: ['damage', 'proximity'], tags: ['keystone', 'offense'], slot: true, item: false, stack: B,
    },
    GRAVITY_WELL: {
        id: 'GRAVITY_WELL', name: 'Gravity Well', desc: 'A constant weak pull draws enemies toward your reticle, grouping them',
        // §6c no-downsides — the "pulls danger toward you" risk is EMERGENT (the
        // pull targets your reticle; group near yourself at your own risk), not an
        // imposed mechanical penalty. No downside field.
        hooks: ['update', 'enemyPull'], tags: ['keystone', 'element'], slot: true, item: false, stack: B,
    },
    FLOW_STATE: {
        id: 'FLOW_STATE', name: 'Flow State', desc: 'Each kill cuts all ability cooldowns by 3%',
        hooks: ['onKill', 'abilityCooldown'], tags: ['keystone', 'tempo'], slot: true, item: false, stack: B,
    },
    FAILSAFE: {
        id: 'FAILSAFE', name: 'Failsafe', desc: 'No single hit can remove more than 50% of your max HP',
        hooks: ['damageTaken'], tags: ['keystone', 'defense'], slot: true, item: false, stack: B,
        // §6c no-downsides — kept as a defensive keystone with the per-hit cap as
        // PURE upside; the −15% max-HP (maxHpMult 0.85) downside was removed.
    },
    HEAT_SINK: {
        // §6c no-downsides — completes the no-downside rework of all 11 original
        // keystone downsides. The `downside: 'Over-holding triggers a vent lockout'`
        // string was removed: HEAT_SINK is currently INERT (its fire-rate-ramp /
        // HEAT / vent mechanic was never wired), so the lockout doesn't exist in
        // code. The full HEAT mechanic (uncapped ramp + vent AoE burst, with NO
        // lockout) is a separate net-new feature — NOT built here.
        id: 'HEAT_SINK', name: 'Heat Sink', desc: 'Primaries ignore their fire-rate cap and ramp while held, building HEAT; max heat VENTs (brief lockout + AoE burst)',
        hooks: ['fireRate', 'fire'], tags: ['keystone', 'offense'], slot: true, item: false, stack: B,
    },

    // ── Round-3 §10.1 — additional modular passives (item + slot, loot-safe) ──
    OVERKILL: {
        id: 'OVERKILL', name: 'Overkill', desc: 'Excess damage from a kill splashes to the nearest enemy',
        hooks: ['onKill', 'damage'], tags: ['offense'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    VENDETTA: {
        id: 'VENDETTA', name: 'Vendetta', desc: 'The last enemy to damage you takes +30% from you until it dies',
        hooks: ['damageTaken', 'damage'], tags: ['offense'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    CONDUIT: {
        id: 'CONDUIT', name: 'Conduit', desc: 'Your statuses tick 25% faster but expire 25% sooner',
        hooks: ['statusTick'], tags: ['element'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    AFTERIMAGE: {
        id: 'AFTERIMAGE', name: 'Afterimage', desc: 'Dashing leaves a clone that fires your primary once',
        hooks: ['dash'], tags: ['tempo', 'offense'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    RESONANCE: {
        id: 'RESONANCE', name: 'Resonance', desc: 'Every 3rd power-weapon use costs no energy',
        hooks: ['powerFire', 'energy'], tags: ['energy'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    BACKLASH: {
        id: 'BACKLASH', name: 'Backlash', desc: 'When you dodge, fire a retaliating shot at the attacker',
        hooks: ['dodge'], tags: ['defense', 'offense'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    HARVEST: {
        id: 'HARVEST', name: 'Harvest', desc: 'Enemies killed by status damage drop bonus energy + gold',
        hooks: ['onKill', 'drop'], tags: ['econ', 'element'], slot: true, item: true, itemTierMin: EXC, stack: B,
    },
    TRACER_LOCK: {
        id: 'TRACER_LOCK', name: 'Tracer Lock', desc: 'Repeated hits on the same target ramp your damage to it (resets on swap)',
        hooks: ['onHit', 'damage'], tags: ['offense'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
    SIEGE: {
        id: 'SIEGE', name: 'Siege', desc: 'Standing still ramps your damage (stacks, decays on the move)',
        hooks: ['stationary', 'damage'], tags: ['offense', 'tempo'], slot: true, item: true, itemTierMin: EXC, stack: A,
    },
};

// 6.158.3 — Per-passive icons (slugs from js/modules/ui/icons.js), merged onto
// each entry so the BUILD-tree PASSIVES cluster shows a distinct, themed icon
// per relic instead of a generic fallback. A few are intentional thematic dups
// (fire, bolt, ghost, anger) where two relics share a motif.
const _PASSIVE_ICONS = {
    GLASS_CANNON: 'gem', GUNSLINGER: 'pistol', PURIST: 'dagger', APEX_PREDATOR: 'skull',
    TWIN_CAST: 'multi-shot', PRISMATIC_SOUL: 'sparkle', OVERFLOW_CAPACITOR: 'battery',
    CAPACITOR_BANK: 'battery',
    KILLING_SPREE: 'skull', ONE_WITH_THE_VOID: 'ghost', SECOND_HEART: 'heart',
    EYE_OF_THE_STORM: 'eye', DETONATOR: 'explosion', FRENZY: 'fist', GRAVITY_WELL: 'vortex',
    FLOW_STATE: 'hourglass', FAILSAFE: 'shield', HEAT_SINK: 'fire',
    CATALYST: 'dna', FROSTBITE: 'snowflake', HEX_TOUCH: 'crystal-ball', KINDLING: 'fire',
    STATIC_CHARGE: 'bolt', OPPORTUNIST: 'target', PREDATOR: 'bow-arrow',
    VAMPIRIC_ROUNDS: 'droplet', RICOCHET: 'shuffle', MOMENTUM_ROUNDS: 'rocket',
    CHAIN_REACTION: 'bomb', KINETIC_BATTERY: 'wind', OVERFLOW_SPARK: 'bolt',
    LAST_BASTION: 'medal', GUARDIAN_ECHO: 'thorns', BLOODSHIELD: 'shield', BLOODLUST: 'skull', SALVAGE_PROTOCOL: 'wrench',
    SANGUINE: 'heart', HEMOGLUTTON: 'droplet',
    SCAVENGER: 'magnet', HOARDERS_GREED: 'money-bag', OVERKILL: 'dizzy', VENDETTA: 'anger',
    CONDUIT: 'chain', AFTERIMAGE: 'ghost', RESONANCE: 'loop', BACKLASH: 'undo',
    HARVEST: 'cart', TRACER_LOCK: 'crosshair', SIEGE: 'chart',
};
for (const [id, icon] of Object.entries(_PASSIVE_ICONS)) {
    if (PASSIVES[id]) PASSIVES[id].icon = icon;
}

/** A passive entry by id, or null. */
export function getPassive(id) { return PASSIVES[id] || null; }

/** All passive entries. */
export function getAllPassives() { return Object.values(PASSIVES); }

/** Passives that can be equipped in a passive slot (gold-bought channel). */
export function getSlotPassives() { return Object.values(PASSIVES).filter((p) => p.slot); }

/** Passives that can roll as a gear affix (optionally gated to a rarity). */
export function getItemPassives() { return Object.values(PASSIVES).filter((p) => p.item); }

// ─── Slot scaling (Phase P3 / round-3 §11.A) ─────────────────────────────────
// The number of equip slots scales with run length and unlocks progressively.

/** Hard array cap — `equippedPassives.length`. */
export const MAX_PASSIVE_SLOTS = 5;

/** Max usable passive slots for a run of `totalStages`: 3 + floor(stages/30), cap 5. */
export function maxPassiveSlots(totalStages) {
    const n = Math.max(1, totalStages | 0);
    return Math.max(1, Math.min(MAX_PASSIVE_SLOTS, 3 + Math.floor(n / 30)));
}

// Stage (1..N) at which slot `k` (1-based) unlocks. Slot 1 is unlocked from the
// start (stage 0). The rest are spread across the run by `ceil(N·(k−1)/M)` —
// evenly-spaced but ahead of the final stage so the last slot still has runway
// to matter (M=3,N=10 → slots open after stages 0/4/7; M=5,N=100 → 0/20/40/60/80).
function _slotUnlockStage(k, M, N) {
    if (k <= 1) return 0;
    return Math.ceil((N * (k - 1)) / M);
}

/**
 * How many passive slots are unlocked after clearing `stagesCleared` stages of
 * a `totalStages`-stage run (slot 1 from the start). Monotonic, capped at
 * maxPassiveSlots(totalStages). Pure — drives the wave-clear hook + tests.
 */
export function passiveSlotsUnlockedAfter(stagesCleared, totalStages) {
    const M = maxPassiveSlots(totalStages);
    const N = Math.max(1, totalStages | 0);
    const cleared = Math.max(0, stagesCleared | 0);
    let unlocked = 1; // slot 1 always available
    for (let k = 2; k <= M; k++) {
        if (_slotUnlockStage(k, M, N) <= cleared) unlocked = k;
    }
    return Math.min(M, unlocked);
}
