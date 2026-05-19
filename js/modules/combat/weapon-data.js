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
        unlockWave: 0,
        upgrades: ['DEAD_EYE', 'OVERCHARGE', 'ECHO_ROUND', 'PULSE_VELOCITY'],
    },
    STORM_NEEDLES: {
        id: 'STORM_NEEDLES',
        name: 'Storm Needles',
        description: 'Rapid needles with a randomized cone of fire',
        icon: 'rain',
        color: '#b3ff44',
        fireRate: 130,
        damage: 0.4,
        bulletSpeed: 1.1,
        bulletSize: 0.5,
        // 5.113.1 — Reverted to 1 needle per shot (5.112.0 turned this
        // into a 3-needle fan; rolled back). The "cone of fire" is the
        // per-shot RANDOMIZED jitter on a single needle — consecutive
        // shots don't trace identical lines. The aim laser draws a
        // cone matching `spreadAngle` so the player can SEE the spread
        // (see hud/cursor.js).
        bulletCount: 1,
        spreadAngle: 0.20,
        piercing: 0,
        range: 1.0,
        cost: 0,
        unlockWave: 3,
        upgrades: ['NEEDLE_STORM', 'POISON_TIP', 'STATIC_CHARGE', 'SUPPRESSION', 'NEEDLE_VELOCITY'],
    },
    SCATTER_GUN: {
        // 5.79.18 — Display name renamed Scatter Gun → Scatter Shot.
        //   Internal id kept as SCATTER_GUN for save-file back-compat
        //   (existing saves reference activePrimary: 'SCATTER_GUN').
        id: 'SCATTER_GUN',
        name: 'Scatter Shot',
        description: 'Focused shotgun burst with extended reach',
        icon: 'explosion',
        color: '#ff8844',
        fireRate: 700,
        damage: 0.42,
        bulletSpeed: 0.9,
        bulletSize: 0.6,
        bulletCount: 5,
        // 5.111.0 — Spread tightened 0.6 → 0.4 (≈ 34° → 23°). The
        // weapon was falling off too hard at distance because pellets
        // diverged before reaching the target. Tighter cone keeps the
        // shotgun feel up close but lands more pellets at range.
        spreadAngle: 0.4,
        piercing: 0,
        // 5.111.0 — Range bumped 1.0 → 1.2 so pellets carry further
        // before expiring. With the tighter spread, mid-range volleys
        // are now a viable option instead of point-blank only.
        range: 1.2,
        cost: 0,
        unlockWave: 5,
        upgrades: ['HEAVY_LOAD', 'BUCKSHOT', 'SHRAPNEL', 'SLUG_ROUND', 'SCATTER_VELOCITY'],
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
        unlockWave: 8,
        upgrades: ['MASS_DRIVER', 'KINETIC_IMPACT', 'RAILGUN_CAPACITOR', 'THROUGH_AND_THROUGH', 'RAIL_VELOCITY'],
    },
    // Phase 6 (2026-05-19) — CLUSTER_LAUNCHER. Lobs a projectile that
    //   decelerates via friction, halts mid-flight, arms for 0.8s, then
    //   detonates on enemy proximity or timer expiry. The primary blast
    //   damages enemies within `blastRadius`, then spawns N sub-bombs
    //   that scatter at random angles and detonate on contact / end-of-
    //   flight. Intentionally NO homing / piercing / explosive
    //   upgrades exposed — the per-weapon upgrade tables in
    //   `PRIMARY_UPGRADES` below only carry payload / bomblet-count /
    //   fuse-time / blast-radius tuners. See `firePrimary` dispatch in
    //   `js/modules/player/weapons.js` for the firing path and
    //   `combat-manager.js` for `detonateCluster` / `spawnSubBomblet`.
    CLUSTER_LAUNCHER: {
        id: 'CLUSTER_LAUNCHER',
        name: 'Cluster Launcher',
        description: 'Lobs a sticky bomb that arms, detonates, and spawns sub-bomblets',
        icon: 'bomb',
        color: '#ff5544',
        fireRate: 800,
        damage: 50,
        bulletSpeed: 1.0,
        bulletSize: 1.4,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 0,
        range: 800,
        cost: 0,
        unlockWave: 10,
        // Cluster bomb stage tuning. Travel friction decays the
        // projectile to halt over ~30 frames; armed window is 0.8s
        // (reduced by SHORT_FUSE stacks). Sub-bomblet count is 5 base,
        // bumped by MORE_BOMBLETS. Blast radius is 90px primary / 50px
        // sub, bumped by MEGA_CLUSTER on the primary side only.
        initialVelocity: 12,
        travelFriction: 0.92,
        haltVelocity: 0.3,
        armedDurationMs: 800,
        proximityRadius: 60,
        blastRadius: 90,
        blastDamage: 50,
        subBombCount: 5,
        subBombSpeed: 4,
        subBombFriction: 0.94,
        subBombLifeFrames: 20,
        subBombBlastRadius: 50,
        subBombDamage: 25,
        upgrades: ['CLUSTER_PAYLOAD', 'MORE_BOMBLETS', 'SHORT_FUSE', 'MEGA_CLUSTER'],
    },
    // 5.79.23 — LANCE_BEAM and LIGHTNING_ARC moved to POWER_WEAPONS
    //   below. They're now cooldown-based power weapons: press the
    //   power-weapon trigger to activate the beam for `beamDuration`,
    //   then wait out the cooldown before re-activating. The "charge"
    //   feel will land in a follow-up patch — for now the cooldown
    //   gates re-activation, which the existing power-weapon UI
    //   already displays as a ring around the player.
};

// Streak damage tiers — 5.104.0 epicness-ordered ladder.
//   Twenty distinct tiers at kills 10, 20, 30, ..., 200 so the player
//   sees a phase change every 10 confirmed kills. Labels are sorted
//   strictly by perceived epicness so each tier feels bigger than the
//   last — momentum tier → mortal-grade → mythic → cosmic → beyond.
//
//   Damage multipliers climb in +0.15 steps through LEGENDARY (70
//   kills, 2.12×) and then taper. The 200-kill cap (RAINBOIDS GOD)
//   stays at 3.00× so the late-game flex doesn't break balance.
//
//   Each tier keeps its original color so the visual fingerprint of
//   each label persists across re-orderings.
//
//   ── Momentum tier (you've got it going) ──
//      10   1.25×  EMPOWERED      first taste
//      20   1.40×  RELENTLESS     keeping pressure
//      30   1.55×  UNSTOPPABLE    nothing can stop you
//      40   1.70×  INDOMITABLE    cannot be subdued
//
//   ── Mortal-extraordinary (heroic) ──
//      50   1.85×  OUTRAGEOUS     ridiculous performance
//      60   2.00×  HERCULEAN      demigod strength
//      70   2.12×  LEGENDARY      auto-splash unlocks ↓
//      80   2.23×  MYTHIC         storybook material
//
//   ── Divine / immortal ──
//      90   2.33×  IMMORTAL       beyond death
//     100   2.42×  GODLIKE        approximately divine
//     110   2.50×  INVINCIBLE     cannot be defeated
//     120   2.58×  ETERNAL        beyond time
//
//   ── Cosmic / universe-scale ──
//     130   2.65×  APOCALYPTIC    end-of-world power
//     140   2.72×  ASTRONOMICAL   star-scale
//     150   2.78×  GALACTIC       galaxy-scale
//     160   2.84×  COSMIC         universe-scale
//
//   ── Beyond physical ──
//     170   2.89×  TRANSCENDENT   beyond reality
//     180   2.93×  OMNIPOTENT     all-powerful
//     190   2.97×  INFINITE       no upper bound
//     200   3.00×  RAINBOIDS GOD  hard cap, the final word
// 6.18.0 — `goldMult` added per tier. Replaces the legacy
//   `min(1.4, 1 + 0.025*kills)` formula which hit cap at 16 kills
//   and silently saturated the per-drop budget. New curve is
//   tier-keyed and gentler:
//     tier 10  → +5%  gold
//     tier 60  → +30% gold
//     tier 200 → +50% gold (RAINBOIDS GOD cap)
//   Pre-tier (kills 1-9) ramps linearly from 1.00 → 1.05 so a
//   single kill already moves the HUD readout.
export const STREAK_TIERS = [
    // Momentum tier
    { kills:  10, mult: 1.25, goldMult: 1.05, label: 'EMPOWERED',     color: '#7FE7FF' }, // pale cyan
    { kills:  20, mult: 1.40, goldMult: 1.10, label: 'RELENTLESS',    color: '#FF7733' }, // red-orange
    { kills:  30, mult: 1.55, goldMult: 1.15, label: 'UNSTOPPABLE',   color: '#FFA844' }, // orange
    { kills:  40, mult: 1.70, goldMult: 1.20, label: 'INDOMITABLE',   color: '#55D6FF' }, // electric blue
    // Mortal-extraordinary
    { kills:  50, mult: 1.85, goldMult: 1.25, label: 'OUTRAGEOUS',    color: '#FF55FF' }, // magenta
    { kills:  60, mult: 2.00, goldMult: 1.30, label: 'HERCULEAN',     color: '#B0FF55' }, // bright lime
    { kills:  70, mult: 2.12, goldMult: 1.32, label: 'LEGENDARY',     color: '#FFD700' }, // gold
    { kills:  80, mult: 2.23, goldMult: 1.34, label: 'MYTHIC',        color: '#DC143C' }, // crimson
    // Divine / immortal
    { kills:  90, mult: 2.33, goldMult: 1.36, label: 'IMMORTAL',      color: '#FFD0FF' }, // pale violet
    { kills: 100, mult: 2.42, goldMult: 1.38, label: 'GODLIKE',       color: '#FF6688' }, // pink-red
    { kills: 110, mult: 2.50, goldMult: 1.40, label: 'INVINCIBLE',    color: '#FFFFFF' }, // bright white
    { kills: 120, mult: 2.58, goldMult: 1.42, label: 'ETERNAL',       color: '#FFF8DC' }, // ivory
    // Cosmic / universe-scale
    { kills: 130, mult: 2.65, goldMult: 1.43, label: 'APOCALYPTIC',   color: '#FF4444' }, // blood red
    { kills: 140, mult: 2.72, goldMult: 1.44, label: 'ASTRONOMICAL',  color: '#AA88FF' }, // royal purple
    { kills: 150, mult: 2.78, goldMult: 1.45, label: 'GALACTIC',      color: '#4466FF' }, // deep blue
    { kills: 160, mult: 2.84, goldMult: 1.46, label: 'COSMIC',        color: '#9933FF' }, // purple
    // Beyond physical
    { kills: 170, mult: 2.89, goldMult: 1.47, label: 'TRANSCENDENT',  color: '#88FFEE' }, // teal-mint
    { kills: 180, mult: 2.93, goldMult: 1.48, label: 'OMNIPOTENT',    color: '#FF44AA' }, // hot pink
    { kills: 190, mult: 2.97, goldMult: 1.49, label: 'INFINITE',      color: '#FFEC8B' }, // pale gold
    { kills: 200, mult: 3.00, goldMult: 1.50, label: 'RAINBOIDS GOD', color: '#FFD700' }, // gold (cap)
];

// 6.18.0 — Streak gold-find multiplier. Returns 1.0 at 0 kills,
//   ramps linearly to STREAK_TIERS[0].goldMult over kills 1..first
//   tier, then steps up per tier. Used in combat-manager
//   dropOrbsFromEntity AND in the HUD streak block (drawStreakIndicator)
//   to display "+N% GOLD" so players see the current bonus.
export function getStreakGoldMult(killStreakCount) {
    const k = killStreakCount | 0;
    if (k <= 0) return 1.0;
    const first = STREAK_TIERS[0];
    if (k < first.kills) {
        return 1 + (k / first.kills) * (first.goldMult - 1);
    }
    let m = 1.0;
    for (let i = 0; i < STREAK_TIERS.length; i++) {
        if (k >= STREAK_TIERS[i].kills) m = STREAK_TIERS[i].goldMult;
    }
    return m;
}
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
    // 5.111.0 — STEADY_AIM (-8% spread/stack) retired. Pulse Cannon
    // has spreadAngle=0 already, so the upgrade was a no-op dressed
    // up as a stat bump. Replaced with DEAD_EYE: pure damage + crit
    // chance, reinforcing Pulse Cannon's "precision" identity.
    DEAD_EYE:       { id: 'DEAD_EYE',       name: 'Dead Eye',       description: '+10% damage, +3% crit',                   cost: 900,  maxStacks: 3,  weapon: 'PULSE_CANNON', icon: 'target' },
    OVERCHARGE:     { id: 'OVERCHARGE',      name: 'Overcharge',     description: '+15% auto-fire damage',                   cost: 1200, maxStacks: 4,  weapon: 'PULSE_CANNON', icon: 'bolt' },
    ECHO_ROUND:     { id: 'ECHO_ROUND',      name: 'Echo Round',     description: '10% chance for a bonus bullet',           cost: 1900, maxStacks: 3,  weapon: 'PULSE_CANNON', icon: 'loop' },

    // Storm Needles
    NEEDLE_STORM:   { id: 'NEEDLE_STORM',    name: 'Needle Storm',   description: '+15% fire rate',                          cost: 900,  maxStacks: 4,  weapon: 'STORM_NEEDLES', icon: 'tornado' },
    POISON_TIP:     { id: 'POISON_TIP',      name: 'Poison Tip',     description: '1 DoT for 2s on hit',                     cost: 1900, maxStacks: 1,  weapon: 'STORM_NEEDLES', icon: 'skull' },
    STATIC_CHARGE:  { id: 'STATIC_CHARGE',   name: 'Static Charge',  description: 'Every 10th needle chains',                cost: 2700, maxStacks: 2,  weapon: 'STORM_NEEDLES', icon: 'bolt' },
    SUPPRESSION:    { id: 'SUPPRESSION',     name: 'Suppression',    description: 'Hits slow enemy fire 15% / 1.5s',         cost: 2300, maxStacks: 1,  weapon: 'STORM_NEEDLES', icon: 'mute' },

    // Scatter Gun
    // 5.111.0 — TIGHT_CHOKE (-15% spread/stack) retired. Scatter Shot
    // now ships with a tighter base spread (0.4) so the upgrade was
    // doing work we'd rather bake into the weapon itself. Replaced
    // with HEAVY_LOAD: pure pellet damage so the shotgun build can
    // still pursue raw damage without an aim-tightening kludge.
    HEAVY_LOAD:     { id: 'HEAVY_LOAD',      name: 'Heavy Load',     description: '+15% pellet damage',                      cost: 1100, maxStacks: 3,  weapon: 'SCATTER_GUN', icon: 'bomb' },
    BUCKSHOT:        { id: 'BUCKSHOT',        name: 'Buckshot',       description: '+1 pellet per shot',                      cost: 1500, maxStacks: 2,  weapon: 'SCATTER_GUN', icon: 'bomb' },
    SHRAPNEL:        { id: 'SHRAPNEL',        name: 'Shrapnel',       description: 'Pellets fragment at max range',           cost: 2300, maxStacks: 1,  weapon: 'SCATTER_GUN', icon: 'explosion' },
    SLUG_ROUND:      { id: 'SLUG_ROUND',      name: 'Slug Round',     description: 'Every 4th shot is a big slug',            cost: 3000, maxStacks: 1,  weapon: 'SCATTER_GUN', icon: 'circle-fill' },

    // Rail Driver
    // 5.110.0 — PENETRATOR (+50% range/stack) replaced with MASS_DRIVER.
    // Range upgrades are gone (base bullet flight covers the full
    // playfield since 5.100.3); the upgrade slot now pumps the rail's
    // kinetic identity instead: +25% damage AND +20% knockback per
    // stack. Stacks with KINETIC_IMPACT (the on/off knockback trigger)
    // and the KNOCKBACK powerup for big-hit builds.
    MASS_DRIVER:     { id: 'MASS_DRIVER',     name: 'Mass Driver',    description: '+25% damage, +20% knockback',            cost: 1200, maxStacks: 3,  weapon: 'RAIL_DRIVER', icon: 'bullet-train', knockbackBonus: 0.20, damageBonus: 0.25 },
    KINETIC_IMPACT:  { id: 'KINETIC_IMPACT',  name: 'Kinetic Impact', description: 'Hits knock back enemies',                 cost: 1500, maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: 'wind' },
    RAILGUN_CAPACITOR:{ id: 'RAILGUN_CAPACITOR',name:'Capacitor',     description: '2× damage after 2s idle',                 cost: 2300, maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: 'battery' },
    THROUGH_AND_THROUGH:{ id: 'THROUGH_AND_THROUGH',name:'Through',   description: 'Leaves a lingering damage trail',         cost: 3700, maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: 'sparkle' },

    // 5.79.23 — Beam upgrades (BEAM_WIDTH, LINGER, REFRACTION,
    //   OVERLOAD_BEAM, LANCE_VELOCITY, AMPLIFIER, TRIPLE_BEAM,
    //   ARC_OVERCHARGE) moved to POWER_UPGRADES below now that the
    //   beams themselves are power weapons.

    // Velocity-and-damage upgrades — kinetic-energy flavor: faster bullets
    // hit harder. Each stack is +12% bullet velocity AND +12% damage (additive,
    // so 3 stacks = +36% / +36%, ~+36% sustained DPS). Read via
    // getBulletVelocityDamageMult() in player/weapons.js.
    PULSE_VELOCITY:  { id: 'PULSE_VELOCITY',  name: 'High-Velocity Rounds', description: '+12% bullet speed & damage',  cost: 1500, maxStacks: 3, weapon: 'PULSE_CANNON',  icon: 'bullet-train', velocityBonus: 0.12 },
    NEEDLE_VELOCITY: { id: 'NEEDLE_VELOCITY', name: 'Hypersonic Needles',   description: '+12% needle speed & damage',  cost: 1500, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'bullet-train', velocityBonus: 0.12 },
    SCATTER_VELOCITY:{ id: 'SCATTER_VELOCITY',name: 'Powder Charge',         description: '+12% pellet speed & damage',  cost: 1500, maxStacks: 3, weapon: 'SCATTER_GUN',   icon: 'bullet-train', velocityBonus: 0.12 },
    RAIL_VELOCITY:   { id: 'RAIL_VELOCITY',   name: 'Tungsten Slug',         description: '+12% rail speed & damage',    cost: 1900, maxStacks: 3, weapon: 'RAIL_DRIVER',   icon: 'bullet-train', velocityBonus: 0.12 },

    // ─── PER-WEAPON HOMING & PIERCING (Phase 2 — 2026-05-19) ────────────────
    // Replaces the global HOMING / PIERCING powerups with weapon-bound
    // variants. Only weapons that semantically support these get an
    // entry. Lance Beam (innate pierce), Mine Layer, Nova Blast,
    // Lightning Arc, and the upcoming Cluster Launcher intentionally
    // have no entry. Missile Salvo's homing is innate; only pierce is
    // exposed as an upgrade.
    PULSE_HOMING:    { id: 'PULSE_HOMING',    name: 'Pulse Tracking',   description: 'Pulse bullets seek nearest enemy',     cost: 1500, maxStacks: 3, weapon: 'PULSE_CANNON',  icon: 'target' },
    PULSE_PIERCING:  { id: 'PULSE_PIERCING',  name: 'Pulse Penetrator', description: '+1 pierce on Pulse bullets',           cost: 1500, maxStacks: 3, weapon: 'PULSE_CANNON',  icon: 'bow-arrow' },
    NEEDLE_HOMING:   { id: 'NEEDLE_HOMING',   name: 'Tracking Needles', description: 'Needles seek nearest enemy',           cost: 1500, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'target' },
    NEEDLE_PIERCING: { id: 'NEEDLE_PIERCING', name: 'Barbed Needles',   description: '+1 pierce on needles',                 cost: 1500, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'bow-arrow' },
    SCATTER_PIERCING:{ id: 'SCATTER_PIERCING',name: 'Armor Piercer',    description: '+1 pierce on pellets',                 cost: 1500, maxStacks: 2, weapon: 'SCATTER_GUN',   icon: 'bow-arrow' },
    RAIL_PIERCING:   { id: 'RAIL_PIERCING',   name: 'Saboted Slug',     description: '+1 pierce on rail slugs',              cost: 1500, maxStacks: 2, weapon: 'RAIL_DRIVER',   icon: 'bow-arrow' },

    // ─── CLUSTER LAUNCHER (Phase 6 — 2026-05-19) ────────────────────────
    // Intentionally NO homing / piercing — cluster bombs halt mid-flight
    // and spawn sub-bomblets, so seeking + piercing don't translate.
    // Tuners only adjust damage, sub-bomb count, fuse, and blast radius.
    CLUSTER_PAYLOAD: { id: 'CLUSTER_PAYLOAD', name: 'Heavy Payload',    description: '+20% damage',                          cost: 1200, maxStacks: 3, weapon: 'CLUSTER_LAUNCHER', icon: 'bomb' },
    MORE_BOMBLETS:   { id: 'MORE_BOMBLETS',   name: 'More Bomblets',    description: '+1 sub-bomb per stack',                cost: 1900, maxStacks: 2, weapon: 'CLUSTER_LAUNCHER', icon: 'sparkle' },
    SHORT_FUSE:      { id: 'SHORT_FUSE',      name: 'Short Fuse',       description: '-0.3s armed time',                     cost: 1500, maxStacks: 2, weapon: 'CLUSTER_LAUNCHER', icon: 'stopwatch' },
    MEGA_CLUSTER:    { id: 'MEGA_CLUSTER',    name: 'Mega Cluster',     description: '+30px primary blast radius',           cost: 2300, maxStacks: 2, weapon: 'CLUSTER_LAUNCHER', icon: 'explosion' },

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
        description: 'MASTERY · +2 bullets at ±6°',
        cost: 7500, maxStacks: 1, weapon: 'PULSE_CANNON', icon: 'medal',
        tier: 2, requires: { id: 'OVERCHARGE', stacks: 4 },
    },
    HAILSTORM: {
        id: 'HAILSTORM', name: 'Hailstorm',
        description: 'MASTERY · +1 needle, +1 pierce',
        cost: 7500, maxStacks: 1, weapon: 'STORM_NEEDLES', icon: 'medal',
        tier: 2, requires: { id: 'NEEDLE_STORM', stacks: 4 },
    },
    CONE_OF_FIRE: {
        id: 'CONE_OF_FIRE', name: 'Cone of Fire',
        description: 'MASTERY · +2 pellets, +1 pierce',
        cost: 7500, maxStacks: 1, weapon: 'SCATTER_GUN', icon: 'medal',
        tier: 2, requires: { id: 'BUCKSHOT', stacks: 2 },
    },
    RAIL_PENETRATOR_PLUS: {
        id: 'RAIL_PENETRATOR_PLUS', name: 'Resonance Drive',
        description: 'MASTERY · Unlimited pierce on every rail',
        cost: 8500, maxStacks: 1, weapon: 'RAIL_DRIVER', icon: 'medal',
        // 5.110.0 — PENETRATOR was retired (replaced by MASS_DRIVER).
        // Prereq retargeted to MASS_DRIVER so the capstone still gates
        // behind a full Rail Driver investment.
        tier: 2, requires: { id: 'MASS_DRIVER', stacks: 3 },
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
        unlockWave: 3,
        upgrades: ['SHOCKWAVE', 'AFTERSHOCK', 'DOUBLE_PULSE', 'RESONANCE', 'NOVA_LIGHTNING', 'NOVA_CHAIN', 'NOVA_INFERNO'],
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
        unlockWave: 5,
        upgrades: ['AMPLIFIER', 'ARC_OVERCHARGE'],
    },
};

// ─── POWER WEAPON UPGRADES ──────────────────────────────────────────────────

// 5.76.0 — power-weapon upgrade costs scaled ~2× to match the gold curve.
export const POWER_UPGRADES = {
    // Charge Shot
    CHARGE_POWER:     { id: 'CHARGE_POWER',     name: 'Charge Power',     description: '+0.5 base charge damage',                 cost: 1600, maxStacks: 6,  weapon: 'CHARGE_SHOT', icon: 'battery' },
    CHARGE_SPEED:     { id: 'CHARGE_SPEED',     name: 'Charge Speed',     description: '-1s charge time',                         cost: 3200, maxStacks: 3,  weapon: 'CHARGE_SHOT', icon: 'stopwatch',
                        costOverrides: [3200, 6400, 10500] },
    CHARGE_OVERCHARGE:{ id: 'CHARGE_OVERCHARGE', name: 'Overcharge',      description: 'Full charge explodes on impact',          cost: 4300, maxStacks: 1,  weapon: 'CHARGE_SHOT', icon: 'explosion' },
    // Per-weapon Phase 2 (2026-05-19) — replaces the old global
    // HOMING/PIERCING powerups for Charge Shot specifically.
    CHARGE_HOMING:    { id: 'CHARGE_HOMING',    name: 'Magnetic Charge',  description: 'Charged shots seek nearest enemy',        cost: 1800, maxStacks: 3,  weapon: 'CHARGE_SHOT', icon: 'target' },
    CHARGE_PIERCING:  { id: 'CHARGE_PIERCING',  name: 'Lance Round',      description: '+1 pierce on charged shots',              cost: 1800, maxStacks: 3,  weapon: 'CHARGE_SHOT', icon: 'bow-arrow' },

    // Mine Layer
    EXTRA_PAYLOAD:    { id: 'EXTRA_PAYLOAD',    name: 'Extra Payload',    description: '+1 max mine',                             cost: 1500, maxStacks: 2,  weapon: 'MINE_LAYER', icon: 'bomb' },
    BLAST_RADIUS:     { id: 'BLAST_RADIUS',     name: 'Blast Radius',     description: '+30px blast, +20px trigger',              cost: 1700, maxStacks: 3,  weapon: 'MINE_LAYER', icon: 'explosion' },
    DAISY_CHAIN:      { id: 'DAISY_CHAIN',      name: 'Daisy Chain',      description: 'Nearby mines detonate together',          cost: 4300, maxStacks: 1,  weapon: 'MINE_LAYER', icon: 'chain' },
    RAPID_DEPLOY:     { id: 'RAPID_DEPLOY',     name: 'Rapid Deploy',     description: '-25% mine cooldown',                      cost: 2400, maxStacks: 2, weapon: 'MINE_LAYER', icon: 'bolt' },

    // Nova Blast
    SHOCKWAVE:        { id: 'SHOCKWAVE',        name: 'Shockwave',        description: '+40px ring radius',                       cost: 1700, maxStacks: 3,  weapon: 'NOVA_BLAST', icon: 'wave' },
    AFTERSHOCK:       { id: 'AFTERSHOCK',       name: 'Aftershock',       description: 'Hits slow enemies 30% / 2s',              cost: 2600, maxStacks: 1,  weapon: 'NOVA_BLAST', icon: 'snail' },
    DOUBLE_PULSE:     { id: 'DOUBLE_PULSE',     name: 'Double Pulse',     description: 'Second ring 0.3s later',                  cost: 4300, maxStacks: 1,  weapon: 'NOVA_BLAST', icon: 'loop' },
    RESONANCE:        { id: 'RESONANCE',        name: 'Resonance',        description: '-1.5s cooldown',                          cost: 3200, maxStacks: 2,  weapon: 'NOVA_BLAST', icon: 'volume' },
    // Phase 4 (2026-05-19) — Nova lightning + chain + inferno. These
    // consume the Phase 3 BRN/STUN engine via the applyBurn/applyStun
    // helpers exposed on the engine. Chain Reaction enforces a hard
    // 3-hop ceiling at the collision site (see checkNovaCollisions).
    NOVA_LIGHTNING:   { id: 'NOVA_LIGHTNING',   name: 'Static Discharge', description: '30%/stack chance to stun on hit',         cost: 1900, maxStacks: 2,  weapon: 'NOVA_BLAST', icon: 'bolt' },
    NOVA_CHAIN:       { id: 'NOVA_CHAIN',       name: 'Chain Reaction',   description: 'Kills spawn smaller novas (3 hops)',      cost: 4300, maxStacks: 1,  weapon: 'NOVA_BLAST', icon: 'chain' },
    NOVA_INFERNO:     { id: 'NOVA_INFERNO',     name: 'Inferno',          description: 'Nova hits apply burn (BRN)',              cost: 2300, maxStacks: 1,  weapon: 'NOVA_BLAST', icon: 'fire' },

    // Missile Salvo
    EXTRA_ORDNANCE:   { id: 'EXTRA_ORDNANCE',   name: 'Extra Ordnance',   description: '+1 missile per volley',                   cost: 2200, maxStacks: 2,  weapon: 'MISSILE_SALVO', icon: 'rocket' },
    CLUSTER_WARHEAD:  { id: 'CLUSTER_WARHEAD',  name: 'Cluster Warhead',  description: 'Missiles split into 3 on impact',         cost: 3900, maxStacks: 1,  weapon: 'MISSILE_SALVO', icon: 'explosion' },
    QUICK_RELOAD:     { id: 'QUICK_RELOAD',     name: 'Quick Reload',     description: '-2s cooldown',                            cost: 3200, maxStacks: 2,  weapon: 'MISSILE_SALVO', icon: 'fast-forward' },
    // Per-weapon Phase 2 (2026-05-19) — missile homing is innate, so
    // only PIERCING is exposed as a buy.
    MISSILE_PIERCING: { id: 'MISSILE_PIERCING', name: 'Penetrator Warhead', description: '+1 pierce on missiles',                  cost: 1800, maxStacks: 2,  weapon: 'MISSILE_SALVO', icon: 'bow-arrow' },

    // 5.79.23 — Lance Beam (now power weapon)
    BEAM_WIDTH:      { id: 'BEAM_WIDTH',      name: 'Beam Width',     description: '+30% beam width',                            cost: 1100, maxStacks: 3,  weapon: 'LANCE_BEAM', icon: 'ruler' },
    LINGER:          { id: 'LINGER',          name: 'Linger',         description: '+0.1s beam duration',                        cost: 1500, maxStacks: 3,  weapon: 'LANCE_BEAM', icon: 'stopwatch' },
    REFRACTION:      { id: 'REFRACTION',      name: 'Refraction',     description: 'Beam splits on enemy hit',                   cost: 2700, maxStacks: 1,  weapon: 'LANCE_BEAM', icon: 'shuffle' },
    OVERLOAD_BEAM:   { id: 'OVERLOAD_BEAM',   name: 'Overload',       description: 'Final 0.1s hits 3×',                         cost: 2300, maxStacks: 1,  weapon: 'LANCE_BEAM', icon: 'fire' },
    // 5.110.0 — LANCE_VELOCITY was "+12% range & damage"; range
    // component dropped along with the rest of the range-upgrade
    // cleanup. Renamed "Overcharge Cells" — pure damage focus.
    LANCE_VELOCITY:  { id: 'LANCE_VELOCITY',  name: 'Overcharge Cells', description: '+15% beam damage',                                 cost: 1700, maxStacks: 3, weapon: 'LANCE_BEAM',    icon: 'bullet-train', velocityBonus: 0.15 },
    TRIPLE_BEAM: {
        id: 'TRIPLE_BEAM', name: 'Overcharged Beam',
        // 5.110.0 — Range component dropped; damage bumped 120 → 150
        // to compensate. Mastery still feels like a damage explosion
        // without leaning on a range bonus the player can't see now
        // that base bullet flight covers the full playfield.
        description: 'MASTERY · +150% beam damage, +50% width',
        cost: 9000, maxStacks: 1, weapon: 'LANCE_BEAM', icon: 'medal',
        tier: 2, requires: { id: 'BEAM_WIDTH', stacks: 3 },
    },

    // 5.79.23 — Arc Lightning (now power weapon)
    AMPLIFIER:       { id: 'AMPLIFIER',       name: 'Amplifier',      description: '+20% arc damage',                                      cost: 1500, maxStacks: 3, weapon: 'LIGHTNING_ARC', icon: 'satellite' },
    ARC_OVERCHARGE: {
        id: 'ARC_OVERCHARGE', name: 'Tesla Overcharge',
        // 5.110.0 — Chain RANGE bump dropped. The current arc is a
        // single-target continuous tether (chain hops were retired
        // earlier); the mastery now doubles down on damage instead of
        // mixing in a range bump the renderer can no longer use.
        // Damage bonus 30% → 60% to keep the mastery feeling like a
        // payoff for fully maxing AMPLIFIER.
        description: 'MASTERY · +60% arc damage',
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

// ─── PASSIVE UPGRADES (Phase 1 — 2026-05-19) ────────────────────────────────
//
// Always-on, weapon-agnostic, skill-agnostic. PASSIVE_UPGRADES is the
// fourth category alongside PRIMARY_UPGRADES, POWER_UPGRADES, and
// SKILL_UPGRADES. Each entry's `id` matches the existing in-game ID so
// `getPowerupStacks('THORNS')` etc. continues to resolve correctly via
// the player's namespace-agnostic powerup map.
//
// Phase 1 is INTENTIONALLY additive: this new export sits alongside
// POWERUP_TYPES (offensive drop pool) and SKILL_UPGRADES (BULWARK's
// IRON_WILL) without removing entries from those buckets. The Phase 7
// shop UI rewrite will consume this export directly when it lands.
// Until then the live shop POWERUPS tab and the in-game drop pool
// continue to surface these IDs through POWERUP_TYPES as before, so
// runtime behavior is unchanged.
//
// IDs that may not currently exist in any other table (LONG_RANGE,
// SPARE_SHIP, SPEED_BOOST — all previously retired) are intentionally
// included as PASSIVE entries so Phase 7 can resurface them if/when
// the corresponding game systems return. The `hidden` flag keeps them
// out of any browse path that respects it.
export const PASSIVE_UPGRADES = {
    // Offensive passives (mirror entries in POWERUP_TYPES — see
    // js/modules/world/powerup.js for the live drop / shop config).
    RAPID_FIRE:    { id: 'RAPID_FIRE',    name: 'Rapid Fire',         description: '+22% fire rate',                       cost: 1500, maxStacks: 5,  passive: true, icon: 'bolt'      },
    MULTI_SHOT:    { id: 'MULTI_SHOT',    name: 'Multi Shot',         description: '+1 bullet per shot',                   cost: 1500, maxStacks: 4,  passive: true, icon: 'multi-shot' },
    CRIT_CHANCE:   { id: 'CRIT_CHANCE',   name: 'Critical Chance',    description: '+7% crit chance',                      cost: 1500, maxStacks: 6,  passive: true, icon: 'star'      },
    CRIT_DAMAGE:   { id: 'CRIT_DAMAGE',   name: 'Critical Damage',    description: '+15% crit damage',                     cost: 1500, maxStacks: 6,  passive: true, icon: 'dagger'    },
    EXPLOSIVE:     { id: 'EXPLOSIVE',     name: 'Explosive Rounds',   description: 'AoE blast on impact (+10px radius)',   cost: 1800, maxStacks: 3,  passive: true, icon: 'bomb'      },
    EXECUTIONER:   { id: 'EXECUTIONER',   name: 'Executioner',        description: '+20% damage vs enemies under 25% HP',  cost: 1800, maxStacks: 5,  passive: true, icon: 'dagger'    },

    // Defensive passives.
    HEALTH_BOOST:  { id: 'HEALTH_BOOST',  name: 'Health Boost',       description: '+35 max HP, full heal',                cost: 1500, maxStacks: 10, passive: true, icon: 'heart'     },
    SHIELD_BOOST:  { id: 'SHIELD_BOOST',  name: 'Toughness',          description: '+8% damage reduction (cap 75%)',       cost: 1500, maxStacks: 8,  passive: true, icon: 'shield'    },
    VAMPIRISM:     { id: 'VAMPIRISM',     name: 'Vampirism',          description: 'Heal 5% of damage dealt',              cost: 1800, maxStacks: 5,  passive: true, icon: 'skull'     },
    THORNS:        { id: 'THORNS',        name: 'Thorns',             description: 'Reflect 25% of damage taken',          cost: 1800, maxStacks: 4,  passive: true, icon: 'anger'     },

    // Bulwark's tied damage-resistance bump. Phase 1 keeps the live
    // entry in SKILL_UPGRADES (still tied to BULWARK) so the in-game
    // damage-reduction maths are untouched. Mirrored here so Phase 7
    // can decide whether to migrate IRON_WILL to a true always-on
    // passive without rewriting the live behavior. Stacks resolve to
    // the same player.powerups slot — fine, since `getPowerupStacks`
    // is namespace-agnostic.
    IRON_WILL:     { id: 'IRON_WILL',     name: 'Iron Will',          description: 'Bulwark resistance raised to 65%',     cost: 2400, maxStacks: 1,  passive: true, icon: 'shield'    },

    // Retired-but-reserved IDs. Marked `hidden` so any browse path
    // that filters on `cfg.hidden` (mirrors POWERUP_TYPES convention)
    // keeps them out of the live shop. Phase 7 can re-enable when the
    // corresponding game system returns.
    SPEED_BOOST:   { id: 'SPEED_BOOST',   name: 'Afterburner',        description: '+50% thrust & +35% top speed',         cost: 2200, maxStacks: 4,  passive: true, icon: 'wind',      hidden: true },
    LONG_RANGE:    { id: 'LONG_RANGE',    name: 'Long Range',         description: 'Bullets fly farther (legacy)',         cost: 1500, maxStacks: 3,  passive: true, icon: 'bullet-train', hidden: true },
    SPARE_SHIP:    { id: 'SPARE_SHIP',    name: 'Spare Ship',         description: '+1 extra life (legacy)',               cost: 12000, maxStacks: 1, passive: true, icon: 'rocket',    hidden: true, flatCost: true },
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

/**
 * Get all passive upgrades. Optional `{ includeHidden }` flag controls
 * whether legacy/retired entries (LONG_RANGE, SPEED_BOOST, SPARE_SHIP)
 * are surfaced. Default behavior matches the POWERUP_TYPES convention
 * (`cfg.hidden` filters them out).
 */
export function getPassiveUpgrades({ includeHidden = false } = {}) {
    return Object.values(PASSIVE_UPGRADES).filter(u => includeHidden || !u.hidden);
}
