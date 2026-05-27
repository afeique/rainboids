// run-templates.js — pure data + lookups for the Looter-Economy Pivot's
// randomized/drafted runs (T09). Transcribed from LOOTER_ECONOMY_PIVOT.md
// §4.3 (stage themes, modifiers, named challenge presets) and §4.4 (enemy
// role stat-profiles, elite affix list + named combos, boss 3-phase frame +
// pattern pool), plus the §4.2 difficulty-budget concept.
//
// NO DOM, NO globals, NO game imports — this is the single source of truth
// the run randomizer (T14) + draft builder (T40) + difficulty director (T34)
// read from. Everything here is plain data + two small pure helper fns.
//
// Conventions:
//  • Role profile multipliers are × a wave/director-scaled base stat.
//  • Modifier `threatWeight` is how much per-stage difficulty budget the
//    modifier "spends" (1.0 = a neutral baseline; higher = harder). The run
//    randomizer subtracts this from the depth budget when composing a stage.
//  • Modifier `rewardMult` is the R$/drop multiplier the modifier grants
//    (1.0 = standard; risk pays out). Challenge presets carry their own
//    aggregate `rewardMult` (the curated combos pay more than their parts).

// ── §4.3 Stage themes ───────────────────────────────────────────────────────
// id / name / element (or a non-elemental flavor tag). These pick WHICH enemy
// families + status flavor a stage leans on. Element values map to the weapon
// trait element pool (Pyro/Cryo/Volt/Toxic/Void/Radiant) where applicable; the
// non-elemental themes use a descriptive tag instead.
export const STAGE_THEMES = [
    { id: 'WILDFIRE',       name: 'Wildfire',        element: 'PYRO',     desc: 'Fire swarm; burn-resistant, folds to Cryo.' },
    { id: 'DEEP_FREEZE',    name: 'Deep Freeze',     element: 'CRYO',     desc: 'Slow ice wall; freeze-resistant, folds to Pyro.' },
    { id: 'OVERLOAD',       name: 'Overload',        element: 'VOLT',     desc: 'Arc-lightning skirmishers; folds to Toxic.' },
    { id: 'OUTBREAK',       name: 'Outbreak',        element: 'TOXIC',    desc: 'Spreading blight; folds to Radiant.' },
    { id: 'HALL_OF_MIRRORS', name: 'Hall of Mirrors', element: 'VOID',    desc: 'Cloaks, maws, reflectors — positioning, not DPS.' },
    { id: 'IRON_WALL',      name: 'Iron Wall',       element: 'ARMOR',    desc: 'Heavy armored tanks; bring sustained pressure.' },
    { id: 'CROSSFIRE',      name: 'Crossfire',       element: 'SNIPER',   desc: 'Long-range sniper lines; keep moving.' },
    { id: 'FIRST_CONTACT',  name: 'First Contact',   element: 'SWARM',    desc: 'Dense fast swarm; the introductory soup.' },
    { id: 'APOCALYPSE',     name: 'Apocalypse',      element: 'ALL',      desc: 'A taste of every theme at once.' },
    { id: 'THE_VOID',       name: 'The Void',        element: 'CLOAK',    desc: 'Cloakers everywhere; trust nothing on screen.' },
];

// ── §4.3 Stage modifiers ────────────────────────────────────────────────────
// id / name / desc + threatWeight (budget spend) + rewardMult (payout).
export const STAGE_MODIFIERS = [
    { id: 'SWARM',             name: 'Swarm',             desc: 'Many more enemies, each weaker.',                threatWeight: 1.3, rewardMult: 1.15 },
    { id: 'JUGGERNAUT',        name: 'Juggernaut',        desc: 'Fewer enemies, each far tankier.',               threatWeight: 1.5, rewardMult: 1.25 },
    { id: 'ELITE_PACK',        name: 'Elite Pack',        desc: 'A pack of elites with extra affixes.',           threatWeight: 1.8, rewardMult: 1.4  },
    { id: 'GLASS',             name: 'Glass',             desc: 'Enemies hit hard but die fast (and so do you).', threatWeight: 1.4, rewardMult: 1.3  },
    { id: 'METEOR_STORM',      name: 'Meteor Storm',      desc: 'Constant heavy asteroid barrage.',               threatWeight: 1.3, rewardMult: 1.2  },
    { id: 'FOG',               name: 'Fog',               desc: 'Reduced visibility; threats loom out of murk.',  threatWeight: 1.2, rewardMult: 1.15 },
    { id: 'ELEMENTAL_SURGE',   name: 'Elemental Surge',   desc: 'Enemies gain the stage element + reactions.',    threatWeight: 1.5, rewardMult: 1.3  },
    { id: 'TOXIC_ATMOSPHERE',  name: 'Toxic Atmosphere',  desc: 'Ambient damage-over-time field.',                threatWeight: 1.4, rewardMult: 1.25 },
    { id: 'LOW_GRAVITY',       name: 'Low Gravity',       desc: 'Floatier movement; momentum carries.',           threatWeight: 1.1, rewardMult: 1.1  },
    { id: 'SUDDEN_DEATH',      name: 'Sudden Death',      desc: 'No heals; one mistake is lethal.',               threatWeight: 1.7, rewardMult: 1.5  },
    { id: 'TREASURE',          name: 'Treasure',          desc: 'Lighter threat, much richer drops.',             threatWeight: 0.7, rewardMult: 1.8  },
    { id: 'CONDUIT_FIELD',     name: 'Conduit Field',     desc: 'Conduit nodes mend + empower the escort.',       threatWeight: 1.5, rewardMult: 1.3  },
    { id: 'MIRROR',            name: 'Mirror',            desc: 'Reflectors bounce your own fire back.',          threatWeight: 1.4, rewardMult: 1.25 },
];

// ── §4.3 Named challenge presets ────────────────────────────────────────────
// Curated theme+modifier combos the draft surfaces. theme is optional (some
// presets are theme-agnostic). modifiers reference STAGE_MODIFIERS ids. The
// aggregate rewardMult is intentionally richer than the parts (curated risk).
export const CHALLENGE_PRESETS = [
    { id: 'THE_GAUNTLET',       name: 'The Gauntlet',       theme: null,               modifiers: ['ELITE_PACK', 'SUDDEN_DEATH'],          rewardMult: 2.0,  desc: '3 elites + no heals + +100% R$.' },
    { id: 'GLASS_STORM',        name: 'Glass Storm',        theme: null,               modifiers: ['GLASS', 'METEOR_STORM'],               rewardMult: 1.6,  desc: 'Glass enemies under a meteor barrage.' },
    { id: 'THE_HUNT',           name: 'The Hunt',           theme: null,               modifiers: ['JUGGERNAUT', 'ELITE_PACK'],            rewardMult: 1.8,  desc: 'A single mega-elite to bring down.' },
    { id: 'BLACKOUT',           name: 'Blackout',           theme: 'THE_VOID',         modifiers: ['FOG'],                                 rewardMult: 1.5,  desc: 'Fog + cloakers — you fight blind.' },
    { id: 'CONDUIT_NIGHTMARE',  name: 'Conduit Nightmare',  theme: 'OVERLOAD',         modifiers: ['CONDUIT_FIELD', 'ELITE_PACK'],         rewardMult: 1.7,  desc: 'Self-mending elites; kill the nodes.' },
    { id: 'ELEMENTAL_TRIAL',    name: 'Elemental Trial',    theme: 'APOCALYPSE',       modifiers: ['ELEMENTAL_SURGE'],                     rewardMult: 1.5,  desc: 'Bring the counter element or suffer.' },
    { id: 'LAST_BREATH',        name: 'Last Breath',        theme: null,               modifiers: ['SUDDEN_DEATH', 'TOXIC_ATMOSPHERE'],    rewardMult: 1.9,  desc: 'No heals under a DoT field.' },
    { id: 'SWARM_APOCALYPSE',   name: 'Swarm Apocalypse',   theme: 'FIRST_CONTACT',    modifiers: ['SWARM', 'ELEMENTAL_SURGE'],            rewardMult: 1.6,  desc: 'Endless elemental swarm.' },
    { id: 'MIRROR_MATCH',       name: 'Mirror Match',       theme: 'HALL_OF_MIRRORS',  modifiers: ['MIRROR'],                              rewardMult: 1.5,  desc: 'Reflectors everywhere — angle every shot.' },
    { id: 'TREASURE_VAULT',     name: 'Treasure Vault',     theme: null,               modifiers: ['TREASURE'],                            rewardMult: 2.2,  desc: 'Safe and rich — the reward room.' },
];

// ── §4.4 Enemy role stat-profiles ───────────────────────────────────────────
// Multipliers × the wave/director-scaled base. countBias scales how many of a
// role the randomizer fields (swarmers come in numbers; tanks come alone).
// `special` flags non-stat behaviors the role implies (heal/strip/trick/split).
export const ROLE_PROFILES = {
    SWARMER:    { hp: 0.5, speed: 1.3, damage: 0.7, countBias: 2.0 },
    SKIRMISHER: { hp: 0.8, speed: 1.4, damage: 0.9, countBias: 1.5 },
    SNIPER:     { hp: 0.9, speed: 0.6, damage: 1.6, countBias: 1.0 },
    TANK:       { hp: 2.5, speed: 0.5, damage: 1.0, countBias: 0.5 },
    BOMBER:     { hp: 1.0, speed: 0.8, damage: 1.4, countBias: 1.0 },
    SUPPORT:    { hp: 1.2, speed: 0.7, damage: 0.6, countBias: 0.7, special: 'heal' },
    DISRUPTOR:  { hp: 1.0, speed: 0.9, damage: 0.8, countBias: 0.8, special: 'strip' },
    TRICKSTER:  { hp: 1.2, speed: 1.0, damage: 0.9, countBias: 0.8, special: 'trick' },
    BRUISER:    { hp: 2.0, speed: 1.1, damage: 1.5, countBias: 0.6 },
    SPLITTER:   { hp: 1.2, speed: 0.8, damage: 0.9, countBias: 0.9, special: 'split' },
};

// ── §4.4 Elite affixes ──────────────────────────────────────────────────────
// The full affix pool. Elites roll 1–3 (by depth) of these on top of a base
// enemy; HP ×3–5; they pay bonus R$/drops. id / name / desc.
export const ELITE_AFFIXES = [
    { id: 'SHIELDED',     name: 'Shielded',     desc: 'A regenerating front-arc shield; flank it.' },
    { id: 'VAMPIRIC',     name: 'Vampiric',     desc: 'Heals from damage it deals.' },
    { id: 'VOLATILE',     name: 'Volatile',     desc: 'Explodes violently on death.' },
    { id: 'TELEPORTER',   name: 'Teleporter',   desc: 'Blinks to reposition / dodge.' },
    { id: 'SUMMONER',     name: 'Summoner',     desc: 'Spawns minions over time.' },
    { id: 'FRENZIED',     name: 'Frenzied',     desc: 'Speeds up + fires faster as it loses HP.' },
    { id: 'REFLECTIVE',   name: 'Reflective',   desc: 'Reflects a fraction of incoming fire.' },
    { id: 'REGENERATING', name: 'Regenerating', desc: 'Steadily regenerates HP.' },
    { id: 'HAZARDOUS',    name: 'Hazardous',    desc: 'Leaves a damaging hazard field.' },
    { id: 'ARCANE',       name: 'Arcane',       desc: 'Casts a status-inflicting bolt.' },
    { id: 'MAGNETIC',     name: 'Magnetic',     desc: 'Pulls the player toward it.' },
    { id: 'AURA',         name: 'Aura',         desc: 'Emits a buff/debuff aura affecting nearby units.' },
    { id: 'CONDUIT',      name: 'Conduit',      desc: 'Empowers + mends allied enemies.' },
    { id: 'JUGGERNAUT',   name: 'Juggernaut',   desc: 'Massive HP + knockback immunity.' },
    { id: 'BERSERKER',    name: 'Berserker',    desc: 'Damage ramps the longer it lives.' },
    { id: 'PHASING',      name: 'Phasing',      desc: 'Periodically goes intangible.' },
    { id: 'SPLITTER',     name: 'Splitter',     desc: 'Splits into smaller copies on death.' },
    { id: 'WARDED',       name: 'Warded',       desc: 'Adapts resistance to your damage type.' },
    { id: 'HEXER',        name: 'Hexer',        desc: 'Curses the player (debuff over time).' },
    { id: 'LEECH',        name: 'Leech',        desc: 'Strips the player\'s buffs on hit.' },
];

// ── §4.4 Named elite combos ─────────────────────────────────────────────────
// Curated multi-affix elites. affixes reference ELITE_AFFIXES ids.
export const ELITE_COMBOS = [
    { id: 'WARDEN',         name: 'Warden',         affixes: ['SHIELDED', 'REFLECTIVE'],                 desc: 'A walking bulwark that turns your shots aside.' },
    { id: 'REAVER',         name: 'Reaver',         affixes: ['VAMPIRIC', 'FRENZIED'],                   desc: 'Bleeds you for its own health, faster as it dies.' },
    { id: 'SAPPER',         name: 'Sapper',         affixes: ['LEECH', 'HEXER'],                         desc: 'Strips your buffs and curses you.' },
    { id: 'HEXWEAVER',      name: 'Hexweaver',      affixes: ['ARCANE', 'HEXER', 'PHASING'],             desc: 'A flickering caster that debuffs from cover.' },
    { id: 'BULWARK_LORD',   name: 'Bulwark Lord',   affixes: ['JUGGERNAUT', 'SHIELDED', 'REGENERATING'], desc: 'An immovable, self-healing fortress.' },
    { id: 'PHASE_REAPER',   name: 'Phase Reaper',   affixes: ['PHASING', 'TELEPORTER', 'VAMPIRIC'],      desc: 'Blinks in, drains, and vanishes.' },
    { id: 'CONDUIT_TYRANT',  name: 'Conduit Tyrant', affixes: ['CONDUIT', 'AURA', 'SUMMONER'],           desc: 'Anchors and empowers an entire pack.' },
];

// ── §4.4 Boss pattern pool ──────────────────────────────────────────────────
// The rotating attack/structure patterns a boss can roll. id / name / desc.
export const BOSS_PATTERNS = [
    { id: 'ROTATING_WEAKPOINTS', name: 'Rotating Weak-Points', desc: 'Armored except for a weak point that rotates around it.' },
    { id: 'ELEMENT_PLATES',      name: 'Element Plates',       desc: 'Plates that only the matching element can break.' },
    { id: 'SHIELD_DRONE_REFLECTOR', name: 'Shield-Drone Reflector', desc: 'Drones shield it + reflect fire; kill the drones.' },
    { id: 'TWIN',                name: 'Twin',                 desc: 'Two linked bosses; both must fall together.' },
    { id: 'SUMMONER',            name: 'Summoner',             desc: 'Continuously births escort waves.' },
    { id: 'TURRET_FORTRESS',     name: 'Turret Fortress',      desc: 'A bristling fortress of independent turrets.' },
    { id: 'ADAPTIVE_RESIST_WALL', name: 'Adaptive Resist Wall', desc: 'Resistance shifts to your last damage type.' },
    { id: 'DEVOURER_MAW',        name: 'Devourer Maw',         desc: 'Eats incoming bullets; flank or beam it.' },
    { id: 'CONDUIT_STORM',       name: 'Conduit Storm',        desc: 'Conduit nodes mend it; sever them first.' },
    { id: 'ALL_ELEMENT_FINALE',  name: 'All-Element Finale',   desc: 'Cycles through every element in sequence.' },
];

// ── §4.4 Boss 3-phase frame ─────────────────────────────────────────────────
// P1 (100→66% HP): signature pattern. P2 (66→33%): adds a mechanic, faster.
// P3 (33→0%): enrage + a telegraphed big attack with a vuln window. Bosses also
// roll 1–2 elite affixes (use ELITE_AFFIXES) for variety.
export const BOSS_PHASE_FRAME = [
    { phase: 1, name: 'Phase 1', hpFrom: 1.0,  hpTo: 0.66, enrage: false, desc: 'Signature pattern at baseline pace.' },
    { phase: 2, name: 'Phase 2', hpFrom: 0.66, hpTo: 0.33, enrage: false, desc: 'Adds a second mechanic; attacks come faster.' },
    { phase: 3, name: 'Phase 3', hpFrom: 0.33, hpTo: 0.0,  enrage: true,  desc: 'Enrage: a telegraphed big attack opens a vuln window.' },
];
// How many elite affixes a boss rolls for flavor (independent of phase).
export const BOSS_ELITE_AFFIX_RANGE = { min: 1, max: 2 };

// ── §4.2 Difficulty budget curve ────────────────────────────────────────────
// Per-stage difficulty "budget" the randomizer SPENDS on enemies / modifiers /
// elites. It must rise MONOTONICALLY with stage depth so the run curve is
// bounded no matter what the player drafts.
//
// Curve: a linear floor + a gentle accelerating tail so deep stages outpace a
// purely linear ramp without exploding. depth is 1-indexed (stage 1 = first).
//
//   budget(d) = BASE + LINEAR·(d − 1) + ACCEL·(d − 1)^1.5
//
//   d=1 → 100   d=2 → ~152   d=5 → ~336   d=10 → ~698   d=20 → ~1644
//
// Anchored at 100 for depth 1 so it shares the PWR scale (a fresh build ≈ 100).
export const DIFFICULTY_BUDGET_BASE = 100;
const _DIFF_BUDGET_LINEAR = 40;
const _DIFF_BUDGET_ACCEL = 12;
export function difficultyBudget(depth) {
    const d = Math.max(1, depth | 0);
    const k = d - 1;
    return Math.round(
        DIFFICULTY_BUDGET_BASE +
        _DIFF_BUDGET_LINEAR * k +
        _DIFF_BUDGET_ACCEL * Math.pow(k, 1.5)
    );
}

// ── §4.4 Elite affix count by depth ─────────────────────────────────────────
// Elites carry more affixes as the run deepens: 1 early → 2 mid → 3 late.
// Thresholds are stage-depth boundaries; clamped to 1..3.
export const ELITE_AFFIX_DEPTH_THRESHOLDS = { mid: 4, late: 8 };
export function eliteAffixCountForDepth(depth) {
    const d = Math.max(1, depth | 0);
    if (d >= ELITE_AFFIX_DEPTH_THRESHOLDS.late) return 3;
    if (d >= ELITE_AFFIX_DEPTH_THRESHOLDS.mid) return 2;
    return 1;
}
