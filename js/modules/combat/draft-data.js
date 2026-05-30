// combat/draft-data.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the 9.0.0 "Back to Basics" reboot draft.
// At the end of every wave the player picks a CATEGORY (OFFENSE or DEFENSE),
// then picks 1 of 3 randomized cards from that category's pool.
//
//   OFFENSE = stackable powerups  +  weapon ATTUNEMENTS (elemental boons)
//             once a weapon is attuned to an element, that element's UPGRADE
//             cards (its "boon line") become eligible in future offense drafts.
//   DEFENSE = +life, +life regen, +vampirism, +toughness, +move speed.
//
// All boons land in the player's `powerups` stack Map (the proven existing
// stacking mechanism). The effective-stat getters in player/progression
// already read that Map, so defense cards (HEALTH_BOOST / SHIELD_BOOST /
// REGEN / SPEED_BOOST) work immediately; offense per-weapon traits route
// through the active primary via perWeaponUpgradeId() (player/weapons.js).
// ─────────────────────────────────────────────────────────────────────────────

import { ELEMENTS } from './elements.js';

export const DRAFT_CATEGORIES = { OFFENSE: 'OFFENSE', DEFENSE: 'DEFENSE' };

// How many cards an offense/defense draft offers, and how many attunement
// elements a single weapon can hold (focus vs. coverage — multiElementMultiplier
// in elements.js averages, so more = broader but shallower).
export const DRAFT_OFFER_COUNT = 3;
export const MAX_ATTUNEMENTS_PER_WEAPON = 2;

// ─── OFFENSE: stackable powerups ─────────────────────────────────────────────
// `kind`:
//   'perWeapon' → trait applied to the ACTIVE primary via player/weapons
//                 _PER_WEAPON_*_ID tables, resolved via perWeaponUpgradeId().
//                 Card is only eligible if the active primary supports it
//                 (mapping exists) and stack isn't maxed.
//   'global'    → `key` is a powerup stack read directly by effective-stat
//                 getter / firing code, regardless of weapon.
//
// maxStacks here is the DRAFT cap; per-weapon traits also clamp in weapons.js.
export const OFFENSE_POWERUPS = [
    // ── per-weapon firing traits (apply to the equipped primary) ──
    { id: 'PU_MULTISHOT',   kind: 'perWeapon', trait: 'MULTI',    name: 'Split Barrel',     desc: '+1 projectile per shot',         perStack: '+1 shot',       maxStacks: 5, color: '#ffcc44', icon: 'multishot' },
    { id: 'PU_RAPIDFIRE',   kind: 'perWeapon', trait: 'RAPID',    name: 'Overcharge Coils', desc: 'Fire markedly faster',           perStack: '−12% interval', maxStacks: 8, color: '#44ddff', icon: 'rapid' },
    { id: 'PU_PIERCING',    kind: 'perWeapon', trait: 'PIERCING', name: 'Armor-Piercing',   desc: 'Shots pierce +1 enemy',          perStack: '+1 pierce',     maxStacks: 5, color: '#ff66cc', icon: 'pierce' },
    { id: 'PU_BIGSHOTS',    kind: 'perWeapon', trait: 'BIG',      name: 'Heavy Rounds',     desc: 'Bigger, harder-hitting bullets', perStack: '+size',         maxStacks: 5, color: '#ff8844', icon: 'big' },
    { id: 'PU_HOMING',      kind: 'perWeapon', trait: 'HOMING',   name: 'Seeker Rounds',    desc: 'Bullets curve toward enemies',   perStack: 'seek',          maxStacks: 3, color: '#88ff88', icon: 'homing' },
    { id: 'PU_EXPLOSIVE',   kind: 'perWeapon', trait: 'EXPLODE',  name: 'Volatile Rounds',  desc: 'Impacts detonate for AoE',       perStack: 'AoE',           maxStacks: 3, color: '#ff5544', icon: 'explode' },
    // ── global offense buffs (read by effective-stat getters / firing) ──
    { id: 'PU_CRIT_CHANCE', kind: 'global', key: 'CRIT_CHANCE',  name: 'Precision',    desc: '+7% critical hit chance', perStack: '+7%',  maxStacks: 6, color: '#ffee66', icon: 'crit' },
    { id: 'PU_CRIT_DAMAGE', kind: 'global', key: 'CRIT_DAMAGE',  name: 'Lethality',    desc: '+15% critical damage',    perStack: '+15%', maxStacks: 6, color: '#ffaa33', icon: 'critdmg' },
];

// ─── OFFENSE: weapon attunements (the boon openers) ──────────────────────────
// Picking one applies the element's status to the player's shots. Each element
// opens a boon line (ATTUNEMENT_UPGRADES below). Colours/statuses pulled from
// combat/elements.js so the draft, bullets, and FX agree.
export const ELEMENT_ATTUNEMENTS = [
    { id: 'ATT_PYRO',    element: 'PYRO',    name: 'Tracer Ignition',    desc: 'Shots set enemies ablaze (Burn DoT).' },
    { id: 'ATT_CRYO',    element: 'CRYO',    name: 'Frost Lock',         desc: 'Shots chill enemies — slow, then freeze.' },
    { id: 'ATT_VOLT',    element: 'VOLT',    name: 'Arc Coupler',        desc: 'Hits arc lightning to nearby enemies.' },
    { id: 'ATT_TOXIC',   element: 'TOXIC',   name: 'Hollow-Point Venom', desc: 'Hits stack corrosive poison.' },
    { id: 'ATT_VOID',    element: 'VOID',    name: 'Gravlock Rounds',    desc: 'Hits mark enemies, amplifying damage.' },
    { id: 'ATT_RADIANT', element: 'RADIANT', name: 'Phase Rounds',       desc: 'Shots purge shields and pierce armor.' },
].map((a) => ({
    ...a,
    color: (ELEMENTS[a.element] && ELEMENTS[a.element].color) || '#ffffff',
    status: (ELEMENTS[a.element] && ELEMENTS[a.element].statusId) || null,
    kind: 'attunement',
}));

// ─── OFFENSE: attunement upgrade chains (Hades-style "pom" upgrades) ─────────
// Keyed by element. Each upgrade is a stackable boon stored under its `id`
// (an `ATT_<ELEMENT>_*` powerup key). An upgrade only enters the offense roll
// while the player has that element attuned.
export const ATTUNEMENT_UPGRADES = {
    PYRO: [
        { id: 'ATT_PYRO_SEAR',     name: 'Searing Rounds', desc: 'Burn deals more damage per tick.',           maxStacks: 3 },
        { id: 'ATT_PYRO_SLOWBURN', name: 'Slow Burn',      desc: 'Burn lasts longer.',                          maxStacks: 3 },
        { id: 'ATT_PYRO_WILDFIRE', name: 'Wildfire',       desc: 'Burning enemies ignite neighbours on death.', maxStacks: 1 },
        { id: 'ATT_PYRO_ASHCRIT',  name: 'Ashen Crit',     desc: 'Critical hits apply a heavy burn.',           maxStacks: 1 },
    ],
    CRYO: [
        { id: 'ATT_CRYO_PERMA',    name: 'Permafrost',  desc: 'Chill slows harder and lasts longer.', maxStacks: 3 },
        { id: 'ATT_CRYO_FREEZE',   name: 'Deep Freeze', desc: 'Chilled enemies can freeze solid.',     maxStacks: 1 },
        { id: 'ATT_CRYO_BRITTLE',  name: 'Brittle',     desc: '+damage to chilled / frozen enemies.',  maxStacks: 3 },
        { id: 'ATT_CRYO_SHATTER',  name: 'Shatter',     desc: 'Frozen enemies explode when killed.',   maxStacks: 1 },
    ],
    VOLT: [
        { id: 'ATT_VOLT_FORK',     name: 'Forked Lightning', desc: 'Arcs strike +1 extra target.',   maxStacks: 3 },
        { id: 'ATT_VOLT_HIGHV',    name: 'High Voltage',     desc: 'Arc damage increased.',          maxStacks: 3 },
        { id: 'ATT_VOLT_OVERLOAD', name: 'Static Overload',  desc: 'Conduct builds toward a stun.',  maxStacks: 1 },
        { id: 'ATT_VOLT_CAP',      name: 'Capacitor',        desc: 'Kills release a free arc burst.', maxStacks: 1 },
    ],
    TOXIC: [
        { id: 'ATT_TOXIC_VIRU',   name: 'Virulence', desc: 'Poison stacks deal more damage.',   maxStacks: 3 },
        { id: 'ATT_TOXIC_CAUST',  name: 'Caustic',   desc: 'Corrode shreds enemy toughness.',   maxStacks: 1 },
        { id: 'ATT_TOXIC_PLAGUE', name: 'Plague',    desc: 'Corrosion spreads on death.',       maxStacks: 1 },
        { id: 'ATT_TOXIC_NECRO',  name: 'Necrosis',  desc: 'Poison lasts longer.',              maxStacks: 3 },
    ],
    VOID: [
        { id: 'ATT_VOID_HEAVY',  name: 'Heavy Mark',    desc: 'Marked enemies take more damage.',     maxStacks: 3 },
        { id: 'ATT_VOID_SING',   name: 'Singularity',   desc: 'Marked enemies are pulled together.',  maxStacks: 1 },
        { id: 'ATT_VOID_IMPL',   name: 'Implosion',     desc: 'Marked enemies implode on death.',     maxStacks: 1 },
        { id: 'ATT_VOID_HORIZON',name: 'Event Horizon', desc: 'Marks last longer and curve harder.',  maxStacks: 3 },
    ],
    RADIANT: [
        { id: 'ATT_RAD_PIERCE', name: 'Piercing Light', desc: 'Ignore enemy armor entirely.',     maxStacks: 1 },
        { id: 'ATT_RAD_JUDGE',  name: 'Judgment',       desc: '+damage to high-health enemies.',  maxStacks: 3 },
        { id: 'ATT_RAD_FLASH',  name: 'Flashbang',      desc: 'Purge briefly blinds enemies.',    maxStacks: 1 },
        { id: 'ATT_RAD_ABSOL',  name: 'Absolution',     desc: 'Radiant kills heal you slightly.', maxStacks: 1 },
    ],
};

// Decorate upgrade entries with element + colour + kind so the overlay/engine
// can treat any card uniformly.
for (const [element, list] of Object.entries(ATTUNEMENT_UPGRADES)) {
    const color = (ELEMENTS[element] && ELEMENTS[element].color) || '#ffffff';
    for (const up of list) { up.element = element; up.color = color; up.kind = 'attUpgrade'; }
}

// ─── DEFENSE pool ────────────────────────────────────────────────────────────
// Each maps to a powerup stack key already read by an existing effective-stat
// getter (or applyVampirism). VAMPIRISM stack is read by combat-manager.
export const DEFENSE_CARDS = [
    { id: 'DEF_LIFE',  kind: 'defense', key: 'HEALTH_BOOST', name: 'Reinforced Hull', desc: '+max life (and a full heal).',  perStack: '+35 HP',    maxStacks: 10, color: '#ff5577', icon: 'health' },
    { id: 'DEF_REGEN', kind: 'defense', key: 'REGEN',        name: 'Repair Field',    desc: 'Heal faster out of combat.',    perStack: '+0.5 HP/s', maxStacks: 6,  color: '#66ff99', icon: 'regen' },
    { id: 'DEF_VAMP',  kind: 'defense', key: 'VAMPIRISM',    name: 'Leeching Rounds', desc: 'Heal for a % of damage dealt.', perStack: '+5%',       maxStacks: 5,  color: '#cc4466', icon: 'vampire' },
    { id: 'DEF_TOUGH', kind: 'defense', key: 'SHIELD_BOOST', name: 'Ablative Plating',desc: 'Reduce incoming damage.',       perStack: '+8% DR',    maxStacks: 8,  color: '#88aaff', icon: 'shield' },
    { id: 'DEF_SPEED', kind: 'defense', key: 'SPEED_BOOST',  name: 'Afterburners',    desc: 'Move faster.',                  perStack: '+65%',      maxStacks: 4,  color: '#ffdd55', icon: 'speed' },
];

// ─── Pure lookups ─────────────────────────────────────────────────────────────
export function attunementForElement(element) {
    return ELEMENT_ATTUNEMENTS.find((a) => a.element === element) || null;
}
export function upgradesForElement(element) {
    return ATTUNEMENT_UPGRADES[element] || [];
}
