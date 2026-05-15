// Weapon and skill configuration data for Rainboids
// All weapons, power weapons, and defense skills are defined here.

// ─── PRIMARY WEAPONS (Left Click) ───────────────────────────────────────────

export const PRIMARY_WEAPONS = {
    PULSE_CANNON: {
        id: 'PULSE_CANNON',
        name: 'Pulse Cannon',
        description: 'Steady stream of reliable shots',
        icon: 'pistol',
        color: '#00ccff',
        // 5.68.1 — bumped damage 0.8 → 1.2 (DPS 2.0 → 3.0). Brings
        // Pulse Cannon up to par with Rail Driver's single-target
        // baseline so the starter weapon doesn't feel anaemic.
        fireRate: 400,
        damage: 1.2,
        bulletSpeed: 1.0,
        bulletSize: 1.0,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 0,
        range: 1.0,
        cost: 0,
        spCost: 0,
        unlockWave: 0,
        upgrades: ['STEADY_AIM', 'OVERCHARGE', 'ECHO_ROUND', 'PULSE_VELOCITY'],
    },
    STORM_NEEDLES: {
        id: 'STORM_NEEDLES',
        name: 'Storm Needles',
        description: 'Rapid tiny shots that saturate targets',
        icon: 'rain',
        // 5.99.0 — Was #88ffff (cyan, too close to Pulse Cannon's #00ccff
        // and Charge Shot's #00ffff). Pivoted to chartreuse so the ten
        // weapons are visually distinct across the shop tab strip and in
        // every effect downstream (bullets, muzzle, shop accent).
        color: '#b3ff44',
        // 5.68.1 — bumped damage 0.3 → 0.4 (DPS 2.31 → 3.08).
        fireRate: 130,
        damage: 0.4,
        bulletSpeed: 1.1,
        bulletSize: 0.5,
        bulletCount: 1,
        spreadAngle: 0.15,
        piercing: 0,
        range: 1.0,
        cost: 0,
        spCost: 0,
        unlockWave: 3,
        upgrades: ['NEEDLE_STORM', 'POISON_TIP', 'STATIC_CHARGE', 'SUPPRESSION', 'NEEDLE_VELOCITY'],
    },
    SCATTER_GUN: {
        // 5.79.18 — Display name renamed Scatter Gun → Scatter Shot.
        //   Internal id kept as SCATTER_GUN for save-file back-compat
        //   (existing saves reference activePrimary: 'SCATTER_GUN').
        id: 'SCATTER_GUN',
        name: 'Scatter Shot',
        description: 'Shotgun burst — devastating up close',
        icon: 'explosion',
        color: '#ff8844',
        // 5.68.1 — damage tuned for 3.0 DPS at point-blank (5 pellets
        // hitting). Single-pellet glancing hits naturally fall below
        // the bracket since fewer pellets connect at range.
        //   per-shot 0.4 × 5 / 0.7s = 2.86 DPS
        //   per-shot 0.42 × 5 / 0.7s = 3.00 DPS
        fireRate: 700,
        damage: 0.42,
        bulletSpeed: 0.9,
        bulletSize: 0.6,
        bulletCount: 5,
        spreadAngle: 0.6,
        piercing: 0,
        range: 1.0,
        cost: 0,
        spCost: 0,
        unlockWave: 5,
        upgrades: ['TIGHT_CHOKE', 'BUCKSHOT', 'SHRAPNEL', 'SLUG_ROUND', 'SCATTER_VELOCITY'],
    },
    RAIL_DRIVER: {
        id: 'RAIL_DRIVER',
        name: 'Rail Driver',
        description: 'Slow, powerful piercing rail shot — fires a double-helix pair',
        icon: 'dna',
        color: '#ff44ff',
        fireRate: 1200,
        damage: 3,
        bulletSpeed: 1.4,
        bulletSize: 1.2,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 99,
        range: 0.85,
        cost: 0,
        spCost: 0,
        unlockWave: 8,
        upgrades: ['PENETRATOR', 'KINETIC_IMPACT', 'RAILGUN_CAPACITOR', 'THROUGH_AND_THROUGH', 'RAIL_VELOCITY'],
    },
    // 5.79.23 — LANCE_BEAM and LIGHTNING_ARC moved to POWER_WEAPONS
    //   below. They're now cooldown-based power weapons: press the
    //   power-weapon trigger to activate the beam for `beamDuration`,
    //   then wait out the cooldown before re-activating. The "charge"
    //   feel will land in a follow-up patch — for now the cooldown
    //   gates re-activation, which the existing power-weapon UI
    //   already displays as a ring around the player.
};

// Streak damage tiers — 5.103.0 every-10-kills ladder.
//   Twenty distinct tiers at kills 10, 20, 30, ..., 200 so the player
//   sees a phase change every 10 confirmed kills. Damage climbs in
//   +0.15 steps through LEGENDARY (50 kills, 2.00×) and then tapers
//   into the high tiers so the top end stays a cosmetic flex without
//   breaking balance. Hard cap at 3.00× (RAINBOIDS GOD, 200 kills).
//
//   Each tier carries a unique color so the streak HUD reads as a
//   distinct phase change instead of "everything is gold past 15".
//
//   kills  mult   label          notes
//     10   1.25×  EMPOWERED      first taste
//     20   1.40×  UNSTOPPABLE    sustained pressure
//     30   1.55×  RELENTLESS     no breaks
//     40   1.70×  GODLIKE        the classic peak
//     50   1.85×  LEGENDARY      auto-splash unlocked here ↓
//     60   2.00×  HERCULEAN      "feats of strength" tier
//     70   2.12×  INDOMITABLE    immune to bad runs
//     80   2.23×  OUTRAGEOUS     this is ridiculous
//     90   2.33×  IMMORTAL       death-stop level
//    100   2.42×  APOCALYPTIC    triple-digit milestone
//    110   2.50×  ASTRONOMICAL   off the charts
//    120   2.58×  GALACTIC       beyond planet-scale
//    130   2.65×  COSMIC         beyond galaxy-scale
//    140   2.72×  TRANSCENDENT   beyond reason
//    150   2.78×  OMNIPOTENT     untouchable
//    160   2.84×  MYTHIC         storybook material
//    170   2.89×  INVINCIBLE     cannot be stopped
//    180   2.93×  ETERNAL        will never end
//    190   2.97×  INFINITE       no upper bound
//    200   3.00×  RAINBOIDS GOD  hard cap, the final word
export const STREAK_TIERS = [
    { kills:  10, mult: 1.25, label: 'EMPOWERED',     color: '#7FE7FF' }, // pale cyan
    { kills:  20, mult: 1.40, label: 'UNSTOPPABLE',   color: '#FFA844' }, // orange
    { kills:  30, mult: 1.55, label: 'RELENTLESS',    color: '#FF7733' }, // red-orange
    { kills:  40, mult: 1.70, label: 'GODLIKE',       color: '#FF6688' }, // pink-red
    { kills:  50, mult: 1.85, label: 'LEGENDARY',     color: '#FFD700' }, // gold
    { kills:  60, mult: 2.00, label: 'HERCULEAN',     color: '#B0FF55' }, // bright lime
    { kills:  70, mult: 2.12, label: 'INDOMITABLE',   color: '#55D6FF' }, // electric blue
    { kills:  80, mult: 2.23, label: 'OUTRAGEOUS',    color: '#FF55FF' }, // magenta
    { kills:  90, mult: 2.33, label: 'IMMORTAL',      color: '#FFD0FF' }, // pale violet
    { kills: 100, mult: 2.42, label: 'APOCALYPTIC',   color: '#FF4444' }, // blood red
    { kills: 110, mult: 2.50, label: 'ASTRONOMICAL',  color: '#AA88FF' }, // royal purple
    { kills: 120, mult: 2.58, label: 'GALACTIC',      color: '#4466FF' }, // deep blue
    { kills: 130, mult: 2.65, label: 'COSMIC',        color: '#9933FF' }, // purple
    { kills: 140, mult: 2.72, label: 'TRANSCENDENT',  color: '#88FFEE' }, // teal-mint
    { kills: 150, mult: 2.78, label: 'OMNIPOTENT',    color: '#FF44AA' }, // hot pink
    { kills: 160, mult: 2.84, label: 'MYTHIC',        color: '#DC143C' }, // crimson
    { kills: 170, mult: 2.89, label: 'INVINCIBLE',    color: '#FFFFFF' }, // bright white
    { kills: 180, mult: 2.93, label: 'ETERNAL',       color: '#FFF8DC' }, // ivory
    { kills: 190, mult: 2.97, label: 'INFINITE',      color: '#FFEC8B' }, // pale gold
    { kills: 200, mult: 3.00, label: 'RAINBOIDS GOD', color: '#FFD700' }, // gold (cap)
];
export const STREAK_BUFF_DURATION = 4000; // ms — buff lasts 4s, refreshes on each new kill while active.
// NOTE: there is NO time-based streak reset. The streak only resets when the
// player TAKES DAMAGE (see lifecycle.js takeDamage + collision-system.js).

// ─── PRIMARY WEAPON UPGRADES ────────────────────────────────────────────────

// 5.76.0 — gold costs scaled up across all upgrade tiers to match the
// post-5.74.33 Gold Find economy. Tier-1 base cost ~2× prior, tier-2
// (capstones) ~1.5× prior. Every upgrade should feel like a deliberate
// purchase rather than a fistful-of-gold dump.
export const PRIMARY_UPGRADES = {
    // Pulse Cannon
    STEADY_AIM:     { id: 'STEADY_AIM',     name: 'Steady Aim',     description: '-8% spread per stack',                    cost: 900,  maxStacks: 3,  weapon: 'PULSE_CANNON', icon: 'target' },
    OVERCHARGE:     { id: 'OVERCHARGE',      name: 'Overcharge',     description: '+15% auto-fire damage per stack',         cost: 1200, maxStacks: 4,  weapon: 'PULSE_CANNON', icon: 'bolt' },
    ECHO_ROUND:     { id: 'ECHO_ROUND',      name: 'Echo Round',     description: '10% chance to fire a bonus bullet',      cost: 1900, maxStacks: 3,  weapon: 'PULSE_CANNON', icon: 'loop' },

    // Storm Needles
    NEEDLE_STORM:   { id: 'NEEDLE_STORM',    name: 'Needle Storm',   description: '+15% fire rate per stack',                cost: 900,  maxStacks: 4,  weapon: 'STORM_NEEDLES', icon: 'tornado' },
    POISON_TIP:     { id: 'POISON_TIP',      name: 'Poison Tip',     description: 'Enemies take 1 DoT for 2s',             cost: 1900, maxStacks: 1,  weapon: 'STORM_NEEDLES', icon: 'skull' },
    STATIC_CHARGE:  { id: 'STATIC_CHARGE',   name: 'Static Charge',  description: 'Every 10th needle chains to nearby enemy',cost: 2700, maxStacks: 2,  weapon: 'STORM_NEEDLES', icon: 'bolt' },
    SUPPRESSION:    { id: 'SUPPRESSION',     name: 'Suppression',    description: 'Hit enemies fire 15% slower for 1.5s',   cost: 2300, maxStacks: 1,  weapon: 'STORM_NEEDLES', icon: 'mute' },

    // Scatter Gun
    TIGHT_CHOKE:    { id: 'TIGHT_CHOKE',     name: 'Tight Choke',    description: '-15% spread angle per stack',             cost: 1100, maxStacks: 3,  weapon: 'SCATTER_GUN', icon: 'wrench' },
    BUCKSHOT:        { id: 'BUCKSHOT',        name: 'Buckshot',       description: '+1 pellet per stack',                     cost: 1500, maxStacks: 2,  weapon: 'SCATTER_GUN', icon: 'bomb' },
    SHRAPNEL:        { id: 'SHRAPNEL',        name: 'Shrapnel',       description: 'Pellets fragment at max range',           cost: 2300, maxStacks: 1,  weapon: 'SCATTER_GUN', icon: 'explosion' },
    SLUG_ROUND:      { id: 'SLUG_ROUND',      name: 'Slug Round',     description: 'Every 4th shot is a single big slug',    cost: 3000, maxStacks: 1,  weapon: 'SCATTER_GUN', icon: 'circle-fill' },

    // Rail Driver
    PENETRATOR:      { id: 'PENETRATOR',      name: 'Penetrator',     description: '+50% range per stack',                   cost: 1200, maxStacks: 3,  weapon: 'RAIL_DRIVER', icon: 'bow-arrow' },
    KINETIC_IMPACT:  { id: 'KINETIC_IMPACT',  name: 'Kinetic Impact', description: 'Enemies hit are knocked back',           cost: 1500, maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: 'wind' },
    RAILGUN_CAPACITOR:{ id: 'RAILGUN_CAPACITOR',name:'Capacitor',     description: '2x damage after 2s idle',                cost: 2300, maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: 'battery' },
    THROUGH_AND_THROUGH:{ id: 'THROUGH_AND_THROUGH',name:'Through',   description: 'Leaves a lingering damage trail',        cost: 3700, maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: 'sparkle' },

    // 5.79.23 — Beam upgrades (BEAM_WIDTH, LINGER, REFRACTION,
    //   OVERLOAD_BEAM, LANCE_VELOCITY, AMPLIFIER, TRIPLE_BEAM,
    //   ARC_OVERCHARGE) moved to POWER_UPGRADES below now that the
    //   beams themselves are power weapons.

    // Velocity-and-damage upgrades — kinetic-energy flavor: faster bullets
    // hit harder. Each stack is +12% bullet velocity AND +12% damage (additive,
    // so 3 stacks = +36% / +36%, ~+36% sustained DPS). Read via
    // getBulletVelocityDamageMult() in player/weapons.js.
    PULSE_VELOCITY:  { id: 'PULSE_VELOCITY',  name: 'High-Velocity Rounds', description: '+12% bullet speed & damage per stack (Pulse Cannon)',  cost: 1500, maxStacks: 3, weapon: 'PULSE_CANNON',  icon: 'bullet-train', velocityBonus: 0.12 },
    NEEDLE_VELOCITY: { id: 'NEEDLE_VELOCITY', name: 'Hypersonic Needles',   description: '+12% needle speed & damage per stack (Storm Needles)', cost: 1500, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'bullet-train', velocityBonus: 0.12 },
    SCATTER_VELOCITY:{ id: 'SCATTER_VELOCITY',name: 'Powder Charge',         description: '+12% pellet speed & damage per stack (Scatter Shot)', cost: 1500, maxStacks: 3, weapon: 'SCATTER_GUN',   icon: 'bullet-train', velocityBonus: 0.12 },
    RAIL_VELOCITY:   { id: 'RAIL_VELOCITY',   name: 'Tungsten Slug',         description: '+12% rail speed & damage per stack (Rail Driver)',    cost: 1900, maxStacks: 3, weapon: 'RAIL_DRIVER',   icon: 'bullet-train', velocityBonus: 0.12 },

    // ─── TIER 2 — CAPSTONE UPGRADES (5.75.1, B1) ────────────────────────
    // Each weapon gets ONE evolved upgrade that unlocks only after its
    // tier-1 prereqs are maxed. They're expensive single-stack picks
    // that change the weapon's *feel* (extra projectile, pierce, burn,
    // beam multiplication) rather than just buffing numbers, so they
    // give late-game weapons a build identity beyond stat-stacking.
    //
    // `requires` = `{ id, stacks }` — the upgrade is hidden in the shop
    // until the prereq stacks are reached, and `addPowerup` refuses to
    // grant it without the prereq. `tier: 2` is the classification tag
    // for UI affordance ("MASTERY" rosette).

    // Tier-2 capstone costs scaled to ~7500g (1.5× prior 4500-5500
    // baseline). They're run-defining picks; the price tag should
    // match.
    TWIN_CANNON: {
        id: 'TWIN_CANNON', name: 'Twin Cannon',
        description: 'MASTERY · Fires a second bullet at ±6° angle',
        cost: 7500, maxStacks: 1, weapon: 'PULSE_CANNON', icon: 'medal',
        tier: 2, requires: { id: 'OVERCHARGE', stacks: 4 },
    },
    HAILSTORM: {
        id: 'HAILSTORM', name: 'Hailstorm',
        description: 'MASTERY · +1 needle per shot, all needles pierce +1',
        cost: 7500, maxStacks: 1, weapon: 'STORM_NEEDLES', icon: 'medal',
        tier: 2, requires: { id: 'NEEDLE_STORM', stacks: 4 },
    },
    CONE_OF_FIRE: {
        id: 'CONE_OF_FIRE', name: 'Cone of Fire',
        description: 'MASTERY · +2 pellets, pellets pierce 1 enemy',
        cost: 7500, maxStacks: 1, weapon: 'SCATTER_GUN', icon: 'medal',
        tier: 2, requires: { id: 'BUCKSHOT', stacks: 2 },
    },
    RAIL_PENETRATOR_PLUS: {
        id: 'RAIL_PENETRATOR_PLUS', name: 'Resonance Drive',
        description: 'MASTERY · Unlimited pierce on every rail',
        cost: 8500, maxStacks: 1, weapon: 'RAIL_DRIVER', icon: 'medal',
        tier: 2, requires: { id: 'PENETRATOR', stacks: 3 },
    },
    // 5.79.23 — TRIPLE_BEAM + ARC_OVERCHARGE moved to POWER_UPGRADES.
};

// ─── POWER WEAPONS (Right Click) ────────────────────────────────────────────

export const POWER_WEAPONS = {
    CHARGE_SHOT: {
        id: 'CHARGE_SHOT',
        name: 'Charge Shot',
        description: 'Hold to charge, release to fire',
        icon: 'battery',
        // 5.99.0 — Was #00ffff (cyan, too close to Pulse Cannon's #00ccff).
        // Shifted to teal-aqua so the charge weapon reads distinct in the
        // shop tab strip and downstream visuals.
        color: '#00e6aa',
        cooldown: 0,          // charge-based, not cooldown-based
        isChargeBased: true,
        cost: 0,
        spCost: 0,
        unlockWave: 0,
        upgrades: ['CHARGE_POWER', 'CHARGE_SPEED', 'CHARGE_OVERCHARGE'],
    },
    MINE_LAYER: {
        id: 'MINE_LAYER',
        name: 'Seeker Mines',
        description: 'Magnetic seekers that hunt and detonate',
        icon: 'bomb',
        // 5.99.0 — Was #ff6600 (close to Scatter Shot's #ff8844). Shifted
        // to deep crimson-orange so the two stay visually distinct.
        color: '#ff3300',
        cooldown: 4000,
        isChargeBased: false,
        maxMines: 3,
        mineRadius: 60,       // trigger radius
        blastRadius: 80,
        mineDamage: 3,        // was 5 — power weapons scaled down for balance
        cost: 1500,
        spCost: 1,
        unlockWave: 2,
        upgrades: ['EXTRA_PAYLOAD', 'BLAST_RADIUS', 'DAISY_CHAIN', 'RAPID_DEPLOY'],
    },
    NOVA_BLAST: {
        id: 'NOVA_BLAST',
        name: 'Nova Blast',
        description: 'Explosive shockwave that pushes everything out',
        icon: 'dizzy',
        color: '#ffaa00',
        cooldown: 8000,
        isChargeBased: false,
        ringRadius: 320,      // was 200 — bigger, more powerful
        ringDamage: 4,        // was 2.5 — heavier hit
        ringDuration: 600,    // ms for ring to expand
        cost: 2000,
        spCost: 2,
        unlockWave: 3,
        upgrades: ['SHOCKWAVE', 'AFTERSHOCK', 'DOUBLE_PULSE', 'RESONANCE'],
    },
    MISSILE_SALVO: {
        id: 'MISSILE_SALVO',
        name: 'Missile Salvo',
        description: 'Homing missiles seek targets',
        icon: 'rocket',
        color: '#ff4444',
        cooldown: 10000,
        isChargeBased: false,
        missileCount: 3,
        missileDamage: 1.5,   // was 2 — power weapons scaled down for balance
        missileSpeed: 4,
        missileHomingStrength: 0.18, // Always-on homing (LOCK_ON upgrade removed)
        cost: 3000,
        spCost: 3,
        unlockWave: 7,
        upgrades: ['EXTRA_ORDNANCE', 'CLUSTER_WARHEAD', 'QUICK_RELOAD'],
    },
    // 5.79.23 — Beams promoted from primary weapons to power weapons
    //   per user request. Cooldown-based: trigger fires the beam for
    //   `beamDuration` ms, then waits out `cooldown` before
    //   re-activation. The original `range`/`damage`/`beamWidth`/etc.
    //   fields stay so collision-system + weapon-effects-renderer
    //   can keep reading them via POWER_WEAPONS lookups.
    LANCE_BEAM: {
        id: 'LANCE_BEAM',
        name: 'Lance Beam',
        description: 'Sustained energy beam — power weapon, fires for 3s',
        icon: 'flashlight',
        color: '#44ff44',
        cooldown: 8000,
        isChargeBased: false,
        // Beam DPS held at 3.0 from the original primary tuning. The
        // 3s active window × 3 DPS = 9 dmg per activation; offset by
        // the 8s cooldown for an effective ~0.8 DPS over the cooldown
        // period — much lower than the old primary-equivalent so the
        // power-weapon slot stays fair vs CHARGE_SHOT / NOVA / etc.
        damage: 0.05,
        range: 0.9,
        beamDuration: 3000,
        beamWidth: 6,
        cost: 0,
        spCost: 0,
        unlockWave: 12,
        upgrades: ['BEAM_WIDTH', 'LINGER', 'REFRACTION', 'OVERLOAD_BEAM', 'LANCE_VELOCITY'],
    },
    LIGHTNING_ARC: {
        id: 'LIGHTNING_ARC',
        name: 'Arc Lightning',
        description: 'Continuous lightning tether — power weapon, fires for 3s',
        icon: 'bolt',
        // 5.99.0 — Was #8888ff (same as EMP_PULSE skill). Shifted to vivid
        // electric purple for distinct identity.
        color: '#a855ff',
        cooldown: 8000,
        isChargeBased: false,
        damage: 0.05,
        range: 1.0,
        chainRange: 360,
        beamDuration: 3000,
        cost: 0,
        spCost: 0,
        unlockWave: 5,
        upgrades: ['AMPLIFIER', 'ARC_OVERCHARGE'],
    },
};

// ─── POWER WEAPON UPGRADES ──────────────────────────────────────────────────

// 5.76.0 — power-weapon upgrade costs scaled ~2× to match the gold curve.
export const POWER_UPGRADES = {
    // Charge Shot
    CHARGE_POWER:     { id: 'CHARGE_POWER',     name: 'Charge Power',     description: '+0.5 charge shot base damage per stack', cost: 1600, maxStacks: 6,  weapon: 'CHARGE_SHOT', icon: 'battery' },
    CHARGE_SPEED:     { id: 'CHARGE_SPEED',     name: 'Charge Speed',     description: '-1 second charge time',               cost: 3200, maxStacks: 3,  weapon: 'CHARGE_SHOT', icon: 'stopwatch',
                        costOverrides: [3200, 6400, 10500] },
    CHARGE_OVERCHARGE:{ id: 'CHARGE_OVERCHARGE', name: 'Overcharge',      description: 'Full charge explodes on impact',      cost: 4300, maxStacks: 1,  weapon: 'CHARGE_SHOT', icon: 'explosion' },

    // Mine Layer
    EXTRA_PAYLOAD:    { id: 'EXTRA_PAYLOAD',    name: 'Extra Payload',    description: '+1 max active mine per stack',         cost: 1500, maxStacks: 2,  weapon: 'MINE_LAYER', icon: 'bomb' },
    BLAST_RADIUS:     { id: 'BLAST_RADIUS',     name: 'Blast Radius',     description: '+30px blast & +20px trigger range per stack', cost: 1700, maxStacks: 3,  weapon: 'MINE_LAYER', icon: 'explosion' },
    DAISY_CHAIN:      { id: 'DAISY_CHAIN',      name: 'Daisy Chain',      description: 'Nearby mines detonate together',      cost: 4300, maxStacks: 1,  weapon: 'MINE_LAYER', icon: 'chain' },
    RAPID_DEPLOY:     { id: 'RAPID_DEPLOY',     name: 'Rapid Deploy',     description: '-25% mine cooldown per stack (4s → 3s → 2.25s)', cost: 2400, maxStacks: 2, weapon: 'MINE_LAYER', icon: 'bolt' },

    // Nova Blast
    SHOCKWAVE:        { id: 'SHOCKWAVE',        name: 'Shockwave',        description: '+40px ring radius per stack',          cost: 1700, maxStacks: 3,  weapon: 'NOVA_BLAST', icon: 'wave' },
    AFTERSHOCK:       { id: 'AFTERSHOCK',       name: 'Aftershock',       description: 'Enemies hit are slowed 30% for 2s',   cost: 2600, maxStacks: 1,  weapon: 'NOVA_BLAST', icon: 'snail' },
    DOUBLE_PULSE:     { id: 'DOUBLE_PULSE',     name: 'Double Pulse',     description: 'Fire a second ring 0.3s later',       cost: 4300, maxStacks: 1,  weapon: 'NOVA_BLAST', icon: 'loop' },
    RESONANCE:        { id: 'RESONANCE',        name: 'Resonance',        description: '-1.5s cooldown per stack',             cost: 3200, maxStacks: 2,  weapon: 'NOVA_BLAST', icon: 'volume' },

    // Missile Salvo
    EXTRA_ORDNANCE:   { id: 'EXTRA_ORDNANCE',   name: 'Extra Ordnance',   description: '+1 missile per stack',                cost: 2200, maxStacks: 2,  weapon: 'MISSILE_SALVO', icon: 'rocket' },
    CLUSTER_WARHEAD:  { id: 'CLUSTER_WARHEAD',  name: 'Cluster Warhead',  description: 'Missiles split into 3 on impact',     cost: 3900, maxStacks: 1,  weapon: 'MISSILE_SALVO', icon: 'explosion' },
    QUICK_RELOAD:     { id: 'QUICK_RELOAD',     name: 'Quick Reload',     description: '-2s cooldown per stack',               cost: 3200, maxStacks: 2,  weapon: 'MISSILE_SALVO', icon: 'fast-forward' },

    // 5.79.23 — Lance Beam (now power weapon)
    BEAM_WIDTH:      { id: 'BEAM_WIDTH',      name: 'Beam Width',     description: '+30% beam width per stack',              cost: 1100, maxStacks: 3,  weapon: 'LANCE_BEAM', icon: 'ruler' },
    LINGER:          { id: 'LINGER',          name: 'Linger',         description: '+0.1s beam duration per stack',           cost: 1500, maxStacks: 3,  weapon: 'LANCE_BEAM', icon: 'stopwatch' },
    REFRACTION:      { id: 'REFRACTION',      name: 'Refraction',     description: 'Beam splits on hitting enemy',           cost: 2700, maxStacks: 1,  weapon: 'LANCE_BEAM', icon: 'shuffle' },
    OVERLOAD_BEAM:   { id: 'OVERLOAD_BEAM',   name: 'Overload',       description: 'Final 0.1s deals 3x damage',             cost: 2300, maxStacks: 1,  weapon: 'LANCE_BEAM', icon: 'fire' },
    LANCE_VELOCITY:  { id: 'LANCE_VELOCITY',  name: 'Focused Lens',   description: '+12% beam range & damage per stack (Lance Beam)', cost: 1700, maxStacks: 3, weapon: 'LANCE_BEAM',    icon: 'bullet-train', velocityBonus: 0.12 },
    TRIPLE_BEAM: {
        id: 'TRIPLE_BEAM', name: 'Overcharged Beam',
        description: 'MASTERY · +120% beam damage, +50% width, +50% range',
        cost: 9000, maxStacks: 1, weapon: 'LANCE_BEAM', icon: 'medal',
        tier: 2, requires: { id: 'BEAM_WIDTH', stacks: 3 },
    },

    // 5.79.23 — Arc Lightning (now power weapon)
    AMPLIFIER:       { id: 'AMPLIFIER',       name: 'Amplifier',      description: '+20% arc damage per stack',                            cost: 1500, maxStacks: 3, weapon: 'LIGHTNING_ARC', icon: 'satellite' },
    ARC_OVERCHARGE: {
        id: 'ARC_OVERCHARGE', name: 'Tesla Overcharge',
        description: 'MASTERY · +30% arc damage AND +50% chain range',
        cost: 7500, maxStacks: 1, weapon: 'LIGHTNING_ARC', icon: 'medal',
        tier: 2, requires: { id: 'AMPLIFIER', stacks: 3 },
    },
};

// ─── DEFENSE SKILLS (Number Keys 1-4) ───────────────────────────────────────

export const DEFENSE_SKILLS = {
    BULWARK: {
        id: 'BULWARK',
        name: 'Bulwark',
        description: '50% damage resistance for 4s',
        icon: 'shield',
        color: '#ffcc00',
        cooldown: 20000,
        duration: 4000,
        damageReduction: 0.5,
        cost: 2,             // SP only
        unlockWave: 2,
        upgrades: ['FORTIFY', 'IRON_WILL', 'RETALIATION'],
    },
    REPAIR_NANITES: {
        id: 'REPAIR_NANITES',
        name: 'Repair Nanites',
        description: 'Regen 3 HP/s for 5s',
        icon: 'heart',
        color: '#44ff88',
        cooldown: 25000,
        duration: 5000,
        healPerSecond: 3,
        cost: 2,
        unlockWave: 2,
        upgrades: ['POTENCY', 'EXTENDED_CARE', 'EMERGENCY_PROTOCOL'],
    },
    // 5.93.0 — PHASE_DASH removed from DEFENSE_SKILLS. Dash is now a
    // core movement primitive on the SHIFT key (see Player._triggerDash
    // and the SHIFT keymap in `js/modules/ui/input-handler.js`). The
    // EXTENDED_PHASE / AFTERIMAGE / QUICK_PHASE upgrades were orphaned
    // when the skill itself was removed and were deleted along with it;
    // any future dash upgrades will live elsewhere if added.
    DEFLECTOR_ORBS: {
        id: 'DEFLECTOR_ORBS',
        name: 'Deflector Orbs',
        description: 'Orbiting orbs block bullets for 5s',
        icon: 'crystal-ball',
        color: '#44ddff',
        cooldown: 15000,
        duration: 5000,
        orbCount: 3,
        hitsPerOrb: 3,
        cost: 3,
        unlockWave: 4,
        upgrades: ['EXTRA_ORB', 'HARDENED_ORBS', 'REFLECT'],
    },
    EMP_PULSE: {
        id: 'EMP_PULSE',
        name: 'EMP Pulse',
        description: 'Stun nearby enemies for 2s',
        icon: 'satellite',
        color: '#8888ff',
        cooldown: 22000,
        duration: 2000,
        radius: 200,
        cost: 3,
        unlockWave: 5,
        upgrades: ['WIDE_BAND', 'EMP_OVERLOAD', 'CASCADE'],
    },
    TRACTOR_SHIELD: {
        id: 'TRACTOR_SHIELD',
        name: 'Tractor Shield',
        description: 'Forward shield absorbs bullets for coins',
        icon: 'magnet',
        color: '#ff88ff',
        cooldown: 18000,
        duration: 4000,
        shieldArc: Math.PI / 2, // 90 degrees
        coinsPerBullet: 5,
        cost: 3,
        unlockWave: 6,
        upgrades: ['WIDE_ANGLE', 'PROFIT', 'REDIRECTION'],
    },
};

// ─── DEFENSE SKILL UPGRADES ─────────────────────────────────────────────────

export const SKILL_UPGRADES = {
    // Bulwark
    FORTIFY:          { id: 'FORTIFY',          name: 'Fortify',          description: '+1s duration per stack',               cost: 2, maxStacks: 2, skill: 'BULWARK', icon: 'stopwatch' },
    IRON_WILL:        { id: 'IRON_WILL',        name: 'Iron Will',        description: 'Resistance increased to 65%',         cost: 3, maxStacks: 1, skill: 'BULWARK', icon: 'shield' },
    RETALIATION:      { id: 'RETALIATION',      name: 'Retaliation',      description: 'Emit a damage pulse when hit',        cost: 3, maxStacks: 1, skill: 'BULWARK', icon: 'explosion' },

    // Repair Nanites
    POTENCY:          { id: 'POTENCY',          name: 'Potency',          description: '+1 HP/s per stack',                    cost: 2, maxStacks: 2, skill: 'REPAIR_NANITES', icon: 'pill' },
    EXTENDED_CARE:    { id: 'EXTENDED_CARE',    name: 'Extended Care',    description: '+2s duration per stack',               cost: 2, maxStacks: 2, skill: 'REPAIR_NANITES', icon: 'stopwatch' },
    EMERGENCY_PROTOCOL:{ id:'EMERGENCY_PROTOCOL',name:'Emergency',        description: 'Auto-activates below 20% HP',         cost: 3, maxStacks: 1, skill: 'REPAIR_NANITES', icon: 'siren' },

    // 5.93.0 — Phase Dash upgrades (EXTENDED_PHASE, AFTERIMAGE,
    // QUICK_PHASE) deleted along with the PHASE_DASH defense skill.
    // Dash is now a core SHIFT-key movement primitive with no
    // skill-tree upgrades.

    // Deflector Orbs
    EXTRA_ORB:        { id: 'EXTRA_ORB',        name: 'Extra Orb',        description: '+1 orbiting orb per stack',            cost: 2, maxStacks: 2, skill: 'DEFLECTOR_ORBS', icon: 'crystal-ball' },
    HARDENED_ORBS:    { id: 'HARDENED_ORBS',    name: 'Hardened Orbs',    description: '+2 hits per orb per stack',            cost: 2, maxStacks: 2, skill: 'DEFLECTOR_ORBS', icon: 'gem' },
    REFLECT:          { id: 'REFLECT',          name: 'Reflect',          description: 'Blocked bullets fire back at enemies', cost: 3, maxStacks: 1, skill: 'DEFLECTOR_ORBS', icon: 'loop' },

    // EMP Pulse
    WIDE_BAND:        { id: 'WIDE_BAND',        name: 'Wide Band',        description: '+60px radius per stack',               cost: 2, maxStacks: 2, skill: 'EMP_PULSE', icon: 'satellite' },
    EMP_OVERLOAD:     { id: 'EMP_OVERLOAD',     name: 'Overload',         description: 'Stunned enemies take +20% damage',    cost: 3, maxStacks: 1, skill: 'EMP_PULSE', icon: 'bolt' },
    CASCADE:          { id: 'CASCADE',          name: 'Cascade',          description: 'Kill a stunned enemy to stun nearby',  cost: 3, maxStacks: 1, skill: 'EMP_PULSE', icon: 'chain' },

    // Tractor Shield
    WIDE_ANGLE:       { id: 'WIDE_ANGLE',       name: 'Wide Angle',       description: '+30° shield arc per stack',            cost: 2, maxStacks: 2, skill: 'TRACTOR_SHIELD', icon: 'ruler' },
    PROFIT:           { id: 'PROFIT',           name: 'Profit',           description: '+5 coins per absorbed bullet',         cost: 2, maxStacks: 2, skill: 'TRACTOR_SHIELD', icon: 'money-bag' },
    REDIRECTION:      { id: 'REDIRECTION',      name: 'Redirection',      description: '30% of absorbed bullets fire back',   cost: 3, maxStacks: 1, skill: 'TRACTOR_SHIELD', icon: 'undo' },
};

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

/** Get all upgrades for a specific primary weapon */
export function getPrimaryUpgrades(weaponId) {
    return Object.values(PRIMARY_UPGRADES).filter(u => u.weapon === weaponId);
}

/** Get all upgrades for a specific power weapon */
export function getPowerUpgrades(weaponId) {
    return Object.values(POWER_UPGRADES).filter(u => u.weapon === weaponId);
}

/** Get all upgrades for a specific defense skill */
export function getSkillUpgrades(skillId) {
    return Object.values(SKILL_UPGRADES).filter(u => u.skill === skillId);
}
