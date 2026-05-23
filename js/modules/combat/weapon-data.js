// Weapon and ability configuration data for Rainboids
// All weapons, power weapons, and defense abilities are defined here.

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
        upgrades: ['PULSE_MULTI', 'PULSE_RAPID', 'PULSE_PIERCING', 'PULSE_BIG', 'PULSE_EXPLODE', 'PULSE_HOMING', 'PULSE_STUN', 'PULSE_KNOCK'],
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
        upgrades: ['NEEDLE_MULTI', 'NEEDLE_RAPID', 'NEEDLE_PIERCING', 'NEEDLE_BIG', 'NEEDLE_EXPLODE', 'NEEDLE_HOMING', 'NEEDLE_STUN', 'NEEDLE_KNOCK'],
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
        upgrades: ['SCATTER_MULTI', 'SCATTER_RAPID', 'SCATTER_PIERCING', 'SCATTER_BIG', 'SCATTER_EXPLODE', 'SCATTER_HOMING', 'SCATTER_STUN', 'SCATTER_KNOCK'],
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
        upgrades: ['RAIL_MULTI', 'RAIL_RAPID', 'RAIL_PIERCING', 'RAIL_BIG', 'RAIL_EXPLODE', 'RAIL_HOMING', 'RAIL_STUN', 'RAIL_KNOCK'],
    },
    // Phase 6 (2026-05-19) — CLUSTER_LAUNCHER. A nucleus-shaped cluster
    //   of glowing spheres that flies in a straight line toward the
    //   cursor at constant velocity (no friction halt) and detonates
    //   the instant it touches ANY enemy, asteroid, or mine. The
    //   primary blast damages enemies within `blastRadius`, then
    //   spawns N sub-bomblets ("spheres flying off") that scatter
    //   radially and detonate on their own contact.
    //
    //   6.26.0 (2026-05-19) — Range tripled+ to "effectively unlimited";
    //   the bomb no longer arms / halts. SHORT_FUSE now has no effect
    //   (kept as a no-op stack so existing save runs don't break) since
    //   there is no armed window. The 'travel → armed → detonate'
    //   state machine collapsed to 'flying → detonate' on first contact.
    //
    //   Intentionally NO homing / piercing / explosive upgrades exposed
    //   — the per-weapon upgrade tables in `PRIMARY_UPGRADES` below
    //   only carry payload / bomblet-count / blast-radius tuners. See
    //   `firePrimary` dispatch in `js/modules/player/weapons.js` for
    //   the firing path and `combat-manager.js` for `detonateCluster`
    //   / `spawnSubBomblet`.
    CLUSTER_LAUNCHER: {
        id: 'CLUSTER_LAUNCHER',
        name: 'Cluster Launcher',
        description: 'Hold to charge — a tap lobs a slow, floaty bomb a short way; a full charge hurls it fast to the screen edge. Detonates on contact or at the charged range, scattering bomblets that fly off and spread blast damage across the area',
        icon: 'bomb',
        color: '#ff5544',
        fireRate: 800,
        // 6.55.0 — charge-for-distance launcher. minLaunchDist is the
        // quick-tap (zero-charge) lob distance in px; full charge scales up
        // to the screen edge (computed from the viewport in fireCluster).
        // The wind-up + post-fire cooldown live in updateClusterCharge.
        minLaunchDist: 70,
        damage: 50,
        bulletSpeed: 1.0,
        bulletSize: 1.4,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 0,
        // 6.26.0 — effectively unlimited range. Field diagonal is ~2203 px;
        // bomb travels at velocity 12 / frame so the safety-net maxLife
        // in setupClusterBomb covers worst-case off-field flight.
        range: 9999,
        cost: 0,
        unlockWave: 10,
        // Cluster bomb tuning — the bomb LAUNCHES FAST and DECELERATES toward
        // the charged target distance, like a lobbed mortar (it slows
        // substantially before it detonates).
        //   travelFriction   — per-tick velocity decay (< 1). Lower = slows
        //                      harder = needs more muzzle velocity to reach
        //                      range.
        //   haltVelocity     — the arrival speed at the target. The muzzle
        //                      velocity is DERIVED in fireCluster from the
        //                      charged distance + friction + haltVelocity, so
        //                      the bomb arrives at ~haltVelocity exactly when
        //                      it reaches the charged range (muzzle speed still
        //                      scales with the hold via the charged distance).
        //   initialVelocity  — fallback muzzle speed if no charge is supplied.
        //   proximityRadius  — radius at which any enemy/asteroid/mine
        //                      contact triggers detonation.
        //   blastRadius      — primary blast AoE.
        //   subBombCount     — bomblets scattered on detonation. They eject in
        //                      RANDOM directions, glide (subBombFriction), and
        //                      detonate on contact or after subBombLifeFrames —
        //                      spreading the blast damage across an area.
        initialVelocity: 12,
        travelFriction: 0.965,
        haltVelocity: 1.0,
        armedDurationMs: 0,
        proximityRadius: 18,
        blastRadius: 90,
        blastDamage: 50,
        subBombCount: 5,
        subBombSpeed: 5,
        subBombFriction: 0.96,
        subBombLifeFrames: 30,
        subBombBlastRadius: 50,
        subBombDamage: 25,
        upgrades: ['CLUSTER_MULTI', 'CLUSTER_STUN', 'CLUSTER_KNOCK'],
    },
    // ─── NEW PRIMARIES (brainstorm drop) ────────────────────────────────────
    // These introduce mechanical "verbs" the original five lacked: bounce,
    // return, fire-rate ramp, airburst, split-on-kill, gravity pull. Each
    // reads custom fields off this config in its fire fn (weapons.js) and
    // its projectile behavior (bullet.js). All are FREE, gated by unlockWave.

    // SPLITTER — every round fragments on IMPACT (hit or kill) into bright,
    // seeking shards. Shards hunt nearby targets and chain once more when THEY
    // land a kill, so the weapon cascades through dense waves yet still pays
    // off against single tanky targets (shards curve back). See
    // collision-system (impact + kill triggers) and combat-manager
    // (mitosisSplit / spawnSplitShards).
    SPLITTER: {
        id: 'SPLITTER',
        name: 'Mitosis Rounds',
        description: 'Rounds fragment on impact into seeking shards that chain on kills',
        icon: 'multi-shot',
        color: '#66ff99',
        fireRate: 380,
        damage: 1.0,
        bulletSpeed: 1.0,
        bulletSize: 0.95,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 0,
        range: 1.0,
        cost: 0,
        unlockWave: 6,
        // Split tuning (read in collision-system + combat-manager):
        splitOnImpact: true,      // primaries fragment on any impact
        splitCount: 2,            // shards spawned per split (+SPLIT_CELLS)
        splitDamageFactor: 0.5,   // shard damage = parent damage × this
        splitSpeed: 0.85,         // shard speed relative to a fresh bullet
        splitGenerations: 2,      // 1 cascade by default; MEIOSIS adds another
        upgrades: ['SPLITTER_MULTI', 'SPLITTER_RAPID', 'SPLITTER_BIG', 'SPLITTER_HOMING', 'SPLITTER_STUN', 'SPLITTER_KNOCK', 'SPLIT_CELLS', 'MEIOSIS'],
    },

    // RICOCHET — bullets bounce off the arena edges and carom between nearby
    // enemies. Bounded playfield makes bank-shots viable. See bullet.update
    // (boundary reflect) + collision-system (enemy carom).
    RICOCHET: {
        id: 'RICOCHET',
        name: 'Caroms',
        description: 'Shots ricochet off walls and bank between enemies',
        icon: 'shuffle',
        color: '#00e6cc',
        fireRate: 340,
        damage: 1.0,
        bulletSpeed: 1.1,
        bulletSize: 0.9,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 0,
        range: 1.25,              // longer life so it survives several bounces
        cost: 0,
        unlockWave: 7,
        // Bounce tuning (read in bullet.update + collision-system):
        bounces: 3,               // total ricochets (walls + enemy caroms)
        bounceSeekRadius: 260,    // on enemy carom, redirect toward an enemy in this radius
        upgrades: ['RICOCHET_MULTI', 'RICOCHET_RAPID', 'RICOCHET_BIG', 'RICOCHET_EXPLODE', 'RICOCHET_STUN', 'RICOCHET_KNOCK', 'EXTRA_BOUNCE', 'CHARGED_CAROMS'],
    },

    // BOOMERANG — slow disc flies out, decelerates, then returns to the ship,
    // damaging on the way out AND back. Rewards holding position. See
    // bullet.update boomerang arc.
    BOOMERANG: {
        id: 'BOOMERANG',
        name: 'Boomerang Discs',
        description: 'Discs fly out and return — they cut coming and going',
        icon: 'loop',
        color: '#ffd633',
        fireRate: 600,
        damage: 1.4,
        bulletSpeed: 1.0,
        bulletSize: 1.1,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 3,              // discs slice through several enemies
        range: 1.0,
        cost: 0,
        unlockWave: 9,
        // Boomerang tuning (read in bullet.update):
        boomerang: true,
        boomerangOutFrames: 28,   // frames flying outward before the turn
        boomerangReturnAccel: 0.55, // homing-to-player accel on the return leg
        upgrades: ['BOOMERANG_MULTI', 'BOOMERANG_RAPID', 'BOOMERANG_BIG', 'BOOMERANG_PIERCING', 'BOOMERANG_STUN', 'BOOMERANG_KNOCK', 'LONG_THROW', 'RAZOR_EDGE'],
    },

    // SPIN_CANNON — minigun. Fire rate RAMPS the longer fire is held and
    // resets on release. New weapon (kept separate from Storm Needles per
    // the design discussion — merge later if desired). Spin-up is computed
    // in getEffectivePrimaryFireRate from this._fireHoldTime.
    SPIN_CANNON: {
        id: 'SPIN_CANNON',
        name: 'Spin Cannon',
        description: 'Fire rate spools up the longer you hold — a commitment hose',
        icon: 'tornado',
        color: '#ff7722',
        fireRate: 220,            // nominal; actual interval is dynamic (see below)
        damage: 0.5,
        bulletSpeed: 1.2,
        bulletSize: 0.55,
        bulletCount: 1,
        spreadAngle: 0.14,        // cone widens slightly at full spin (see fire fn)
        piercing: 0,
        range: 1.0,
        cost: 0,
        unlockWave: 12,
        // Spin-up tuning (read in getEffectivePrimaryFireRate):
        spinUpTime: 1400,         // ms of held fire to reach max spin
        slowFireRate: 220,        // interval (ms) at zero spin
        fastFireRate: 60,         // interval (ms) at full spin
        spinSpreadBonus: 0.12,    // extra cone added at full spin
        upgrades: ['SPIN_RAPID', 'SPIN_BIG', 'SPIN_PIERCING', 'SPIN_HOMING', 'SPIN_STUN', 'SPIN_KNOCK', 'FLYWHEEL', 'OVERSPIN'],
    },

    // FLAK_CANNON — rounds detonate into a shrapnel ring at a set distance
    // (proximity airburst), not on contact. Anti-swarm wall. See bullet.update
    // airburst → combat-manager.spawnShrapnelRing.
    FLAK_CANNON: {
        id: 'FLAK_CANNON',
        name: 'Flak Cannon',
        description: 'Shells airburst into a shrapnel ring at range',
        icon: 'siren',
        color: '#ffbb55',
        fireRate: 650,
        damage: 0.8,              // small direct hit; the burst is the payload
        bulletSpeed: 0.95,
        bulletSize: 0.95,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 0,
        range: 1.0,
        cost: 0,
        unlockWave: 11,
        // Airburst tuning (read in bullet.update + combat-manager):
        flak: true,
        burstDistance: 300,       // px traveled before airburst (+LONG_FUSE)
        shrapnelCount: 9,         // shards in the ring (+FLECHETTE)
        shrapnelDamage: 0.55,
        shrapnelSpeed: 5,
        shrapnelLifeFrames: 14,
        burstBlastRadius: 60,     // small AoE at the burst point
        burstBlastDamage: 1.2,
        upgrades: ['FLAK_RAPID', 'FLAK_BIG', 'FLAK_STUN', 'FLAK_KNOCK', 'FLECHETTE', 'PROXIMITY_FUSE', 'LONG_FUSE'],
    },

    // GRAVITY_LANCE — slow heavy orb that tugs nearby enemies toward its path
    // before expiring. Low direct damage; a combo enabler that clusters mobs
    // for AoE. See bullet.update gravity pull.
    GRAVITY_LANCE: {
        id: 'GRAVITY_LANCE',
        name: 'Gravity Lance',
        description: 'A slow orb that drags enemies into its wake — a setup tool',
        icon: 'vortex',
        color: '#b066ff',
        fireRate: 720,
        damage: 0.6,
        bulletSpeed: 0.6,         // slow-moving well
        bulletSize: 1.5,
        bulletCount: 1,
        spreadAngle: 0,
        piercing: 6,              // drifts through the pack
        range: 1.15,
        cost: 0,
        unlockWave: 13,
        // Gravity tuning (read in bullet.update each frame):
        gravityWell: true,
        pullRadius: 150,          // enemies within this radius are tugged in
        pullStrength: 0.35,       // velocity nudge per frame at the rim
        upgrades: ['GRAVITY_MULTI', 'GRAVITY_BIG', 'GRAVITY_EXPLODE', 'GRAVITY_STUN', 'EVENT_WAKE', 'IMPLOSION', 'SINGULAR_PULL'],
    },
    // 5.79.23 — LANCE_BEAM and LIGHTNING_ARC moved to POWER_WEAPONS
    //   below. They're now cooldown-based power weapons: press the
    //   power-weapon trigger to activate the beam for `beamDuration`,
    //   then wait out the cooldown before re-activating. The "charge"
    //   feel will land in a follow-up patch — for now the cooldown
    //   gates re-activation, which the existing power-weapon UI
    //   already displays as a ring around the player.
};

// Cluster Launcher — charge → launch distance. SHARED by the fire path
// (weapons.fireCluster) and the laser-sight preview (hud/cursor.js) so the
// on-screen aim length is an HONEST preview of where the bomb detonates.
// A quick tap lobs to `minLaunchDist`; a full charge reaches ~0.55× the
// viewport diagonal (comfortably the screen edge). The muzzle velocity is
// derived from this distance by `clusterLaunchVelocity` below.
export function clusterLaunchDistance(config, frac, viewW = 1280, viewH = 720) {
    const f = Math.max(0, Math.min(1, frac || 0));
    const minDist = (config && config.minLaunchDist != null) ? config.minLaunchDist : 70;
    const maxDist = Math.hypot(viewW, viewH) * 0.55;
    return minDist + (maxDist - minDist) * f;
}

// Muzzle (launch) velocity for a cluster bomb that must DECELERATE under
// `travelFriction` and arrive at `targetDist` travelling at ~`haltVelocity`.
// Closed form: a projectile losing a fraction (1-f) of its speed each tick
// covers (v0 - vEnd)/(1-f) before it slows from v0 to vEnd, so to land
// `targetDist` away at `haltVelocity` we launch at:
//   v0 = targetDist·(1-f) + haltVelocity
// Since targetDist scales with the hold, so does the muzzle speed.
export function clusterLaunchVelocity(config, targetDist) {
    const f = (config && config.travelFriction != null) ? config.travelFriction : 0.965;
    const halt = (config && config.haltVelocity != null) ? config.haltVelocity : 1.0;
    return Math.max(halt, targetDist * (1 - f) + halt);
}

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
// 6.28.0 — WEAPON REDESIGN. The old per-weapon upgrade set (DEAD_EYE,
// NEEDLE_STORM, HEAVY_LOAD, MASS_DRIVER, velocity rounds, capstones,
// etc.) is retired in favor of a uniform per-weapon "shared trait" set:
// every kinetic primary (Pulse / Storm / Scatter / Rail) gets its own
// stackable Multishot, Rapid Fire, Piercing, Big Bullets, Explosive,
// Homing, Stun%, and Knockback%. Cluster Launcher (lobbed bombs) gets
// only Multishot / Stun% / Knockback%. Each is mechanically the same
// effect with weapon-flavored names ("distinct but simple"). The old
// block is preserved below as a comment for reference.
/* RETIRED 6.28.0 — old PRIMARY_UPGRADES (kept for reference):
export const PRIMARY_UPGRADES_LEGACY = {
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
    SHORT_FUSE:      { id: 'SHORT_FUSE',      name: 'Short Fuse',       description: 'Vestigial — cluster bombs no longer arm', cost: 1500, maxStacks: 2, weapon: 'CLUSTER_LAUNCHER', icon: 'stopwatch' },
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
*/

// ─── 6.28.0 — PER-WEAPON SHARED TRAITS ──────────────────────────────────────
// 8 shared trait types. Kinetic primaries (Pulse / Storm / Scatter / Rail)
// get all 8; Cluster Launcher gets Multishot / Stun / Knockback only.
// Mechanic constants live in player/weapons.js + combat/collision-system.js;
// these entries just declare id / name / desc / cost / stacks / weapon / icon.
// Piercing + homing reuse the existing PER_WEAPON id tables in weapons.js.
export const PRIMARY_UPGRADES = {
    // ── Pulse Cannon ──
    PULSE_MULTI:    { id: 'PULSE_MULTI',    name: 'Split Fire',        description: '+1 bullet per shot',          cost: 1800, maxStacks: 3, weapon: 'PULSE_CANNON', icon: 'multi-shot' },
    PULSE_RAPID:    { id: 'PULSE_RAPID',    name: 'Overclock',         description: '+12% fire rate',              cost: 1200, maxStacks: 4, weapon: 'PULSE_CANNON', icon: 'bolt' },
    PULSE_PIERCING: { id: 'PULSE_PIERCING', name: 'Penetrator',        description: '+1 pierce',                   cost: 1500, maxStacks: 3, weapon: 'PULSE_CANNON', icon: 'bow-arrow' },
    PULSE_BIG:      { id: 'PULSE_BIG',      name: 'Heavy Rounds',      description: '+2.2px bullet radius',        cost: 1200, maxStacks: 3, weapon: 'PULSE_CANNON', icon: 'circle-fill' },
    PULSE_EXPLODE:  { id: 'PULSE_EXPLODE',  name: 'Frag Rounds',       description: 'AoE blast on impact',         cost: 1800, maxStacks: 3, weapon: 'PULSE_CANNON', icon: 'bomb' },
    PULSE_HOMING:   { id: 'PULSE_HOMING',   name: 'Pulse Tracking',    description: 'Bullets seek nearest enemy',  cost: 1600, maxStacks: 3, weapon: 'PULSE_CANNON', icon: 'target' },
    PULSE_STUN:     { id: 'PULSE_STUN',     name: 'Concussion',        description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'PULSE_CANNON', icon: 'spiral' },
    PULSE_KNOCK:    { id: 'PULSE_KNOCK',    name: 'Impact Rounds',     description: '+15% chance to knock back',   cost: 1300, maxStacks: 3, weapon: 'PULSE_CANNON', icon: 'wind' },

    // ── Storm Needles ──
    NEEDLE_MULTI:    { id: 'NEEDLE_MULTI',    name: 'Needle Burst',     description: '+1 needle per shot',          cost: 1800, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'multi-shot' },
    NEEDLE_RAPID:    { id: 'NEEDLE_RAPID',    name: 'Rapid Weave',      description: '+12% fire rate',              cost: 1200, maxStacks: 4, weapon: 'STORM_NEEDLES', icon: 'bolt' },
    NEEDLE_PIERCING: { id: 'NEEDLE_PIERCING', name: 'Barbed Needles',   description: '+1 pierce',                   cost: 1500, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'bow-arrow' },
    NEEDLE_BIG:      { id: 'NEEDLE_BIG',      name: 'Thick Needles',    description: '+2.2px needle radius',        cost: 1200, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'circle-fill' },
    NEEDLE_EXPLODE:  { id: 'NEEDLE_EXPLODE',  name: 'Volatile Tips',    description: 'AoE blast on impact',         cost: 1800, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'bomb' },
    NEEDLE_HOMING:   { id: 'NEEDLE_HOMING',   name: 'Tracking Needles', description: 'Needles seek nearest enemy',  cost: 1600, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'target' },
    NEEDLE_STUN:     { id: 'NEEDLE_STUN',     name: 'Shock Tips',       description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'spiral' },
    NEEDLE_KNOCK:    { id: 'NEEDLE_KNOCK',    name: 'Concussive Needles', description: '+15% chance to knock back', cost: 1300, maxStacks: 3, weapon: 'STORM_NEEDLES', icon: 'wind' },

    // ── Scatter Shot ──
    SCATTER_MULTI:    { id: 'SCATTER_MULTI',    name: 'Extra Pellet',    description: '+1 pellet per shot',          cost: 1800, maxStacks: 3, weapon: 'SCATTER_GUN', icon: 'multi-shot' },
    SCATTER_RAPID:    { id: 'SCATTER_RAPID',    name: 'Fast Pump',       description: '+12% fire rate',              cost: 1200, maxStacks: 4, weapon: 'SCATTER_GUN', icon: 'bolt' },
    SCATTER_PIERCING: { id: 'SCATTER_PIERCING', name: 'Armor Piercer',   description: '+1 pierce',                   cost: 1500, maxStacks: 3, weapon: 'SCATTER_GUN', icon: 'bow-arrow' },
    SCATTER_BIG:      { id: 'SCATTER_BIG',      name: 'Fat Pellets',     description: '+2.2px pellet radius',        cost: 1200, maxStacks: 3, weapon: 'SCATTER_GUN', icon: 'circle-fill' },
    SCATTER_EXPLODE:  { id: 'SCATTER_EXPLODE',  name: 'Frag Pellets',    description: 'AoE blast on impact',         cost: 1800, maxStacks: 3, weapon: 'SCATTER_GUN', icon: 'bomb' },
    SCATTER_HOMING:   { id: 'SCATTER_HOMING',   name: 'Seeking Shot',    description: 'Pellets seek nearest enemy',  cost: 1600, maxStacks: 3, weapon: 'SCATTER_GUN', icon: 'target' },
    SCATTER_STUN:     { id: 'SCATTER_STUN',     name: 'Stun Shot',       description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'SCATTER_GUN', icon: 'spiral' },
    SCATTER_KNOCK:    { id: 'SCATTER_KNOCK',    name: 'Knockback Load',  description: '+15% chance to knock back',   cost: 1300, maxStacks: 3, weapon: 'SCATTER_GUN', icon: 'wind' },

    // ── Rail Driver ──
    RAIL_MULTI:    { id: 'RAIL_MULTI',    name: 'Twin Rail',       description: '+1 rail pair per shot',       cost: 1800, maxStacks: 3, weapon: 'RAIL_DRIVER', icon: 'multi-shot' },
    RAIL_RAPID:    { id: 'RAIL_RAPID',    name: 'Rapid Charge',    description: '+12% fire rate',              cost: 1200, maxStacks: 4, weapon: 'RAIL_DRIVER', icon: 'bolt' },
    RAIL_PIERCING: { id: 'RAIL_PIERCING', name: 'Saboted Slug',    description: '+1 pierce',                   cost: 1500, maxStacks: 3, weapon: 'RAIL_DRIVER', icon: 'bow-arrow' },
    RAIL_BIG:      { id: 'RAIL_BIG',      name: 'Dense Slug',      description: '+2.2px rail radius',          cost: 1200, maxStacks: 3, weapon: 'RAIL_DRIVER', icon: 'circle-fill' },
    RAIL_EXPLODE:  { id: 'RAIL_EXPLODE',  name: 'HE Slug',         description: 'AoE blast on impact',         cost: 1800, maxStacks: 3, weapon: 'RAIL_DRIVER', icon: 'bomb' },
    RAIL_HOMING:   { id: 'RAIL_HOMING',   name: 'Guided Slug',     description: 'Rails seek nearest enemy',    cost: 1600, maxStacks: 3, weapon: 'RAIL_DRIVER', icon: 'target' },
    RAIL_STUN:     { id: 'RAIL_STUN',     name: 'Disruptor Slug',  description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'RAIL_DRIVER', icon: 'spiral' },
    RAIL_KNOCK:    { id: 'RAIL_KNOCK',    name: 'Kinetic Slug',    description: '+15% chance to knock back',   cost: 1300, maxStacks: 3, weapon: 'RAIL_DRIVER', icon: 'wind' },

    // ── Cluster Launcher (lobbed bombs — Multishot / Stun / Knockback only) ──
    CLUSTER_MULTI: { id: 'CLUSTER_MULTI', name: 'Extra Bomb',       description: '+1 bomb per shot',            cost: 2000, maxStacks: 2, weapon: 'CLUSTER_LAUNCHER', icon: 'multi-shot' },
    CLUSTER_STUN:  { id: 'CLUSTER_STUN',  name: 'Concussive Blast', description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'CLUSTER_LAUNCHER', icon: 'spiral' },
    CLUSTER_KNOCK: { id: 'CLUSTER_KNOCK', name: 'Shockwave Blast',  description: '+15% chance to knock back',   cost: 1300, maxStacks: 3, weapon: 'CLUSTER_LAUNCHER', icon: 'wind' },

    // ── Mitosis Rounds (SPLITTER) ──
    SPLITTER_MULTI:  { id: 'SPLITTER_MULTI',  name: 'Twin Cells',     description: '+1 round per shot',           cost: 1800, maxStacks: 3, weapon: 'SPLITTER', icon: 'multi-shot' },
    SPLITTER_RAPID:  { id: 'SPLITTER_RAPID',  name: 'Fast Division',  description: '+12% fire rate',              cost: 1200, maxStacks: 4, weapon: 'SPLITTER', icon: 'bolt' },
    SPLITTER_BIG:    { id: 'SPLITTER_BIG',    name: 'Fat Cells',      description: '+2.2px round radius',         cost: 1200, maxStacks: 3, weapon: 'SPLITTER', icon: 'circle-fill' },
    SPLITTER_HOMING: { id: 'SPLITTER_HOMING', name: 'Seeking Cells',  description: 'Rounds seek nearest enemy',   cost: 1600, maxStacks: 3, weapon: 'SPLITTER', icon: 'target' },
    SPLITTER_STUN:   { id: 'SPLITTER_STUN',   name: 'Shock Cells',    description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'SPLITTER', icon: 'spiral' },
    SPLITTER_KNOCK:  { id: 'SPLITTER_KNOCK',  name: 'Burst Cells',    description: '+15% chance to knock back',   cost: 1300, maxStacks: 3, weapon: 'SPLITTER', icon: 'wind' },
    SPLIT_CELLS:     { id: 'SPLIT_CELLS',     name: 'Hyperplasia',    description: '+1 shard spawned per split',  cost: 2200, maxStacks: 3, weapon: 'SPLITTER', icon: 'multi-shot' },
    MEIOSIS:         { id: 'MEIOSIS',         name: 'Meiosis',        description: 'Shards cascade one generation deeper', cost: 2700, maxStacks: 1, weapon: 'SPLITTER', icon: 'shuffle' },

    // ── Caroms (RICOCHET) ──
    RICOCHET_MULTI:   { id: 'RICOCHET_MULTI',   name: 'Double Bank',   description: '+1 round per shot',           cost: 1800, maxStacks: 3, weapon: 'RICOCHET', icon: 'multi-shot' },
    RICOCHET_RAPID:   { id: 'RICOCHET_RAPID',   name: 'Quick Bank',    description: '+12% fire rate',              cost: 1200, maxStacks: 4, weapon: 'RICOCHET', icon: 'bolt' },
    RICOCHET_BIG:     { id: 'RICOCHET_BIG',     name: 'Heavy Carom',   description: '+2.2px round radius',         cost: 1200, maxStacks: 3, weapon: 'RICOCHET', icon: 'circle-fill' },
    RICOCHET_EXPLODE: { id: 'RICOCHET_EXPLODE', name: 'Frag Carom',    description: 'AoE blast on impact',         cost: 1800, maxStacks: 3, weapon: 'RICOCHET', icon: 'bomb' },
    RICOCHET_STUN:    { id: 'RICOCHET_STUN',    name: 'Stun Carom',    description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'RICOCHET', icon: 'spiral' },
    RICOCHET_KNOCK:   { id: 'RICOCHET_KNOCK',   name: 'Knock Carom',   description: '+15% chance to knock back',   cost: 1300, maxStacks: 3, weapon: 'RICOCHET', icon: 'wind' },
    EXTRA_BOUNCE:     { id: 'EXTRA_BOUNCE',     name: 'Extra Bounce',  description: '+1 ricochet per round',       cost: 2200, maxStacks: 3, weapon: 'RICOCHET', icon: 'shuffle' },
    CHARGED_CAROMS:   { id: 'CHARGED_CAROMS',   name: 'Charged Caroms', description: 'Each bounce adds +25% damage', cost: 2700, maxStacks: 1, weapon: 'RICOCHET', icon: 'bolt' },

    // ── Boomerang Discs (BOOMERANG) ──
    BOOMERANG_MULTI:    { id: 'BOOMERANG_MULTI',    name: 'Twin Discs',    description: '+1 disc per shot',           cost: 1800, maxStacks: 3, weapon: 'BOOMERANG', icon: 'multi-shot' },
    BOOMERANG_RAPID:    { id: 'BOOMERANG_RAPID',    name: 'Quick Toss',    description: '+12% fire rate',             cost: 1200, maxStacks: 4, weapon: 'BOOMERANG', icon: 'bolt' },
    BOOMERANG_BIG:      { id: 'BOOMERANG_BIG',      name: 'Wide Discs',    description: '+2.2px disc radius',         cost: 1200, maxStacks: 3, weapon: 'BOOMERANG', icon: 'circle-fill' },
    BOOMERANG_PIERCING: { id: 'BOOMERANG_PIERCING', name: 'Saw Discs',     description: '+1 pierce',                  cost: 1500, maxStacks: 3, weapon: 'BOOMERANG', icon: 'bow-arrow' },
    BOOMERANG_STUN:     { id: 'BOOMERANG_STUN',     name: 'Stun Discs',    description: '+12% chance to stun on hit', cost: 1500, maxStacks: 3, weapon: 'BOOMERANG', icon: 'spiral' },
    BOOMERANG_KNOCK:    { id: 'BOOMERANG_KNOCK',    name: 'Heavy Discs',   description: '+15% chance to knock back',  cost: 1300, maxStacks: 3, weapon: 'BOOMERANG', icon: 'wind' },
    LONG_THROW:         { id: 'LONG_THROW',         name: 'Long Throw',    description: '+40% throw distance',        cost: 2200, maxStacks: 2, weapon: 'BOOMERANG', icon: 'loop' },
    RAZOR_EDGE:         { id: 'RAZOR_EDGE',         name: 'Razor Edge',    description: 'Return leg deals +60% damage', cost: 2700, maxStacks: 1, weapon: 'BOOMERANG', icon: 'dagger' },

    // ── Spin Cannon (SPIN_CANNON) — minigun ──
    SPIN_RAPID:    { id: 'SPIN_RAPID',    name: 'Greased Bearings', description: '+12% fire rate',              cost: 1200, maxStacks: 4, weapon: 'SPIN_CANNON', icon: 'bolt' },
    SPIN_BIG:      { id: 'SPIN_BIG',      name: 'Heavy Slugs',      description: '+2.2px round radius',         cost: 1200, maxStacks: 3, weapon: 'SPIN_CANNON', icon: 'circle-fill' },
    SPIN_PIERCING: { id: 'SPIN_PIERCING', name: 'AP Rounds',        description: '+1 pierce',                   cost: 1500, maxStacks: 3, weapon: 'SPIN_CANNON', icon: 'bow-arrow' },
    SPIN_HOMING:   { id: 'SPIN_HOMING',   name: 'Tracer Rounds',    description: 'Rounds seek nearest enemy',   cost: 1600, maxStacks: 3, weapon: 'SPIN_CANNON', icon: 'target' },
    SPIN_STUN:     { id: 'SPIN_STUN',     name: 'Rattle Rounds',    description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'SPIN_CANNON', icon: 'spiral' },
    SPIN_KNOCK:    { id: 'SPIN_KNOCK',    name: 'Hammer Rounds',    description: '+15% chance to knock back',   cost: 1300, maxStacks: 3, weapon: 'SPIN_CANNON', icon: 'wind' },
    FLYWHEEL:      { id: 'FLYWHEEL',      name: 'Flywheel',         description: '-30% spin-up time per stack', cost: 2200, maxStacks: 2, weapon: 'SPIN_CANNON', icon: 'tornado' },
    OVERSPIN:      { id: 'OVERSPIN',      name: 'Overspin',         description: 'Higher max fire rate',        cost: 2700, maxStacks: 2, weapon: 'SPIN_CANNON', icon: 'fast-forward' },

    // ── Flak Cannon (FLAK_CANNON) ──
    FLAK_RAPID:     { id: 'FLAK_RAPID',     name: 'Auto-Loader',   description: '+12% fire rate',              cost: 1200, maxStacks: 4, weapon: 'FLAK_CANNON', icon: 'bolt' },
    FLAK_BIG:       { id: 'FLAK_BIG',       name: 'Bigger Shells', description: '+2.2px shell radius',         cost: 1200, maxStacks: 3, weapon: 'FLAK_CANNON', icon: 'circle-fill' },
    FLAK_STUN:      { id: 'FLAK_STUN',      name: 'Rattle Burst',  description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'FLAK_CANNON', icon: 'spiral' },
    FLAK_KNOCK:     { id: 'FLAK_KNOCK',     name: 'Concussive Burst', description: '+15% chance to knock back', cost: 1300, maxStacks: 3, weapon: 'FLAK_CANNON', icon: 'wind' },
    FLECHETTE:      { id: 'FLECHETTE',      name: 'Flechette Load', description: '+3 shrapnel per burst',      cost: 2200, maxStacks: 3, weapon: 'FLAK_CANNON', icon: 'rain' },
    PROXIMITY_FUSE: { id: 'PROXIMITY_FUSE', name: 'Proximity Fuse', description: '+30px burst blast & damage', cost: 2300, maxStacks: 2, weapon: 'FLAK_CANNON', icon: 'explosion' },
    LONG_FUSE:      { id: 'LONG_FUSE',      name: 'Long Fuse',      description: '+40% airburst distance',     cost: 1900, maxStacks: 2, weapon: 'FLAK_CANNON', icon: 'stopwatch' },

    // ── Gravity Lance (GRAVITY_LANCE) ──
    GRAVITY_MULTI:   { id: 'GRAVITY_MULTI',   name: 'Twin Wells',    description: '+1 orb per shot',             cost: 1800, maxStacks: 2, weapon: 'GRAVITY_LANCE', icon: 'multi-shot' },
    GRAVITY_BIG:     { id: 'GRAVITY_BIG',     name: 'Dense Core',    description: '+2.2px orb radius',           cost: 1200, maxStacks: 3, weapon: 'GRAVITY_LANCE', icon: 'circle-fill' },
    GRAVITY_EXPLODE: { id: 'GRAVITY_EXPLODE', name: 'Volatile Core', description: 'AoE blast on impact',         cost: 1800, maxStacks: 3, weapon: 'GRAVITY_LANCE', icon: 'bomb' },
    GRAVITY_STUN:    { id: 'GRAVITY_STUN',    name: 'Tidal Shock',   description: '+12% chance to stun on hit',  cost: 1500, maxStacks: 3, weapon: 'GRAVITY_LANCE', icon: 'spiral' },
    EVENT_WAKE:      { id: 'EVENT_WAKE',      name: 'Event Wake',    description: '+50px pull radius per stack', cost: 2200, maxStacks: 3, weapon: 'GRAVITY_LANCE', icon: 'vortex' },
    IMPLOSION:       { id: 'IMPLOSION',       name: 'Implosion',     description: 'Orb implodes for AoE on expire', cost: 2700, maxStacks: 1, weapon: 'GRAVITY_LANCE', icon: 'explosion' },
    SINGULAR_PULL:   { id: 'SINGULAR_PULL',   name: 'Singular Pull', description: '+50% pull strength per stack', cost: 2300, maxStacks: 2, weapon: 'GRAVITY_LANCE', icon: 'magnet' },
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
        upgrades: [
            'EXTRA_PAYLOAD', 'BLAST_RADIUS', 'DAISY_CHAIN', 'RAPID_DEPLOY',
            // 6.23.0 (2026-05-19) — mine-shield + missiles-add-on kit.
            //   Bullets are baseline behavior now — every armed mine
            //   fires non-homing pulse bullets at the nearest target.
            //   MINE_MISSILES adds a homing missile on top.
            'MINE_SHIELD_RADIUS', 'MINE_MISSILES',
        ],
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
        description: 'Sweeping energy beam — carves an arc around the cursor for 3s, shredding everything in the swept area',
        icon: 'flashlight',
        color: '#44ff44',
        cooldown: 8000,
        isChargeBased: false,
        // 6.55.0 — Arc-sweep rework. The beam now damages EVERY enemy /
        // asteroid inside a cone (±arcHalfAngle) around the cursor each
        // tick (pierces — no single-target stop), so DPS is per-target
        // across the whole swept area. Bumped 0.05 → 0.5 (~30 DPS/target
        // at 60Hz) so it does considerable damage to everything it sweeps,
        // befitting an 8s-cooldown power weapon.
        damage: 0.5,
        range: 0.9,
        beamDuration: 3000,
        beamWidth: 6,
        // Arc sweep: half-angle of the damage cone (radians, ~40°) and the
        // ms period of one full back-and-forth blade sweep (visual).
        arcHalfAngle: 0.7,
        sweepPeriodMs: 900,
        cost: 0,
        unlockWave: 12,
        upgrades: ['BEAM_WIDTH', 'LINGER', 'REFRACTION', 'OVERLOAD_BEAM', 'LANCE_VELOCITY'],
    },
    LIGHTNING_ARC: {
        id: 'LIGHTNING_ARC',
        name: 'Arc Lightning',
        description: 'Continuous lightning tether — power weapon, fires for 3s',
        icon: 'bolt',
        // 5.99.0 — Was #8888ff (same as EMP_PULSE ability). Shifted to vivid
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
    // ─── NEW POWER WEAPONS (brainstorm drop) ────────────────────────────────
    // Verbs the original powers lacked: pull→collapse, refraction, telegraph
    // payoff, freeze, and a no-projectile primary buff. Each stores its entity
    // state on the player (see player.js init) and is updated in abilities.js
    // updateActiveAbilities, collided in collision-system, drawn in
    // weapon-effects-renderer. OVERDRIVE is stateless (just a timed buff).

    // SINGULARITY — deploy a gravity well at the cursor that pulls enemies and
    // their projectiles inward for pullDuration, then collapses for a big AoE
    // pop. Modeled on the Nova ring storage pattern + the gravity-pull loop.
    SINGULARITY: {
        id: 'SINGULARITY',
        name: 'Singularity',
        description: 'Deploys a black hole that sucks enemies in, then collapses',
        icon: 'vortex',
        color: '#7744dd',
        cooldown: 12000,
        isChargeBased: false,
        pullRadius: 280,          // +SINGULARITY_RADIUS
        pullStrength: 0.5,        // +VOID_GRASP
        pullDuration: 1600,       // ms of pull before collapse (+SINGULARITY_DURATION)
        collapseRadius: 190,
        collapseDamage: 9,
        cost: 2500,
        unlockWave: 6,
        upgrades: ['SINGULARITY_RADIUS', 'VOID_GRASP', 'SINGULARITY_DURATION', 'EVENT_HORIZON'],
    },

    // PRISM_BEAM — fire a fan of refracting rainbow beams for a short window.
    // Cooldown-triggered (not charge-based) to keep the plumbing simple; the
    // novelty is the multi-ray rainbow fan. Modeled on the Lance beam timer +
    // a per-ray angle list. See checkPrismBeamCollisions + render.
    PRISM_BEAM: {
        id: 'PRISM_BEAM',
        name: 'Prism Beam',
        description: 'A burst of refracting rainbow beams in a fan',
        icon: 'gem',
        color: '#66ffff',
        cooldown: 9000,
        isChargeBased: false,
        beamDuration: 1100,       // ms the fan persists (+PRISM_DURATION)
        beamCount: 5,             // rays in the fan (+PRISM_BEAMS)
        beamWidth: 5,             // +PRISM_WIDTH
        beamSpread: 0.85,         // total fan angle (radians)
        damage: 0.06,             // per-tick per-ray
        range: 0.95,
        cost: 0,
        unlockWave: 9,
        upgrades: ['PRISM_BEAMS', 'PRISM_WIDTH', 'PRISM_DURATION', 'PRISM_SEEK'],
    },

    // ORBITAL_STRIKE — paint the cursor; after a telegraph delay a massive
    // column drops from off-screen for heavy AoE. Telegraph→payoff tension.
    // Stored as a timed marker entity; detonates when its telegraph expires.
    ORBITAL_STRIKE: {
        id: 'ORBITAL_STRIKE',
        name: 'Orbital Strike',
        description: 'Paints a target; a column drops after a short delay',
        icon: 'satellite',
        color: '#ffee44',
        cooldown: 11000,
        isChargeBased: false,
        telegraphTime: 850,       // ms warning before the column lands (-RAPID_PAINT)
        strikeRadius: 150,        // +ORBITAL_RADIUS
        strikeDamage: 15,         // +ORBITAL_POWER
        strikeCount: 1,           // columns dropped (+ORBITAL_BARRAGE walks them out)
        cost: 3000,
        unlockWave: 10,
        upgrades: ['ORBITAL_RADIUS', 'ORBITAL_POWER', 'RAPID_PAINT', 'ORBITAL_BARRAGE'],
    },

    // CRYO_BURST — radial blast that FREEZES/slows enemies in place instead of
    // damaging hard. Crowd control payoff; complements Nova's push. Modeled on
    // the Nova ring, but applies a heavy slow via the existing slow engine.
    CRYO_BURST: {
        id: 'CRYO_BURST',
        name: 'Cryo Burst',
        description: 'A frost shockwave that freezes enemies solid',
        icon: 'wave',
        color: '#66ccff',
        cooldown: 9000,
        isChargeBased: false,
        ringRadius: 300,          // +CRYO_RADIUS
        ringDuration: 500,        // ms for the frost ring to expand
        ringDamage: 1.5,
        freezeDuration: 2500,     // ms enemies stay frozen (+DEEP_FREEZE)
        freezeStrength: 0.85,     // velocity scale while frozen (0 = full stop)
        cost: 2000,
        unlockWave: 4,
        upgrades: ['CRYO_RADIUS', 'DEEP_FREEZE', 'SHATTER', 'COLD_SNAP'],
    },

    // OVERDRIVE — no projectile. A "go loud" button: massively buffs the
    // PRIMARY weapon (fire rate + damage, optional pierce) for a few seconds.
    // Stateless beyond a player timer; getEffectivePrimary* read the buff.
    OVERDRIVE: {
        id: 'OVERDRIVE',
        name: 'Overdrive',
        description: 'Supercharges your primary weapon for a few seconds',
        icon: 'fast-forward',
        color: '#ff5522',
        cooldown: 14000,
        isChargeBased: false,
        duration: 4500,           // ms the buff lasts (+OVERDRIVE_DURATION)
        fireRateMult: 0.55,       // primary interval ×this while active (lower = faster)
        damageMult: 1.5,          // +REDLINE
        grantsPierce: 0,          // +AFTERBURN adds pierce during
        cost: 2500,
        unlockWave: 7,
        upgrades: ['OVERDRIVE_DURATION', 'REDLINE', 'NITRO', 'AFTERBURN'],
    },
};

// ─── ELEMENT TAGS (E1 — Element & Resistance System) ────────────────────────
// The element of each weapon's damage. Assigned in one auditable table rather
// than inline on each config; anything not listed defaults to KINETIC. The
// damage path (E2/E5) reads `bullet.element` (stamped from the firing weapon)
// or `POWER_WEAPONS[id].element`. E6 makes each weapon APPLY its element's
// signature status; for now this is pure metadata (no behavior change).
const WEAPON_ELEMENTS = {
    GRAVITY_LANCE: 'VOID', SINGULARITY: 'VOID',
    NOVA_BLAST: 'VOLT', LIGHTNING_ARC: 'VOLT',
    LANCE_BEAM: 'RADIANT', PRISM_BEAM: 'RADIANT',
    CRYO_BURST: 'CRYO',
    // everything else → KINETIC (retagged as elemental weapons ship in E6)
};
for (const w of Object.values(PRIMARY_WEAPONS)) w.element = WEAPON_ELEMENTS[w.id] || 'KINETIC';
for (const w of Object.values(POWER_WEAPONS))   w.element = WEAPON_ELEMENTS[w.id] || 'KINETIC';

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
    // 6.23.0 (2026-05-19) — Mine shield + projectile-launcher kits.
    //   Seeker mines behave as moving turrets BY DEFAULT — armed mines
    //   always seek the nearest enemy/asteroid AND fire non-homing pulse
    //   bullets at it on a fixed cadence. Upgrades enhance that core loop.
    //
    //   SHIELD_RADIUS: each armed mine emits a 120 + 50*stacks px plasma
    //     shield. While the player is inside ANY armed mine's zone, incoming
    //     damage is reduced by 40% (no stacking across overlapping zones).
    //     Shield is invisible until a hit — see `mineShieldFlash` particle.
    //   MISSILES: ADDS a homing seeker missile every 2.5s on top of the
    //     baseline bullet fire. Each missile deals `mineDamage * 0.5`.
    MINE_SHIELD_RADIUS: { id: 'MINE_SHIELD_RADIUS', name: 'Shield Radius',
        description: '+50 px shield radius per stack (enables shield)',
        cost: 1700, maxStacks: 3, weapon: 'MINE_LAYER', icon: 'shield' },
    MINE_MISSILES:    { id: 'MINE_MISSILES',    name: 'Seeker Missiles',
        description: 'Armed mines also fire a homing missile every 2.5s',
        cost: 2300, maxStacks: 1, weapon: 'MINE_LAYER', icon: 'rocket' },

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

    // ── Singularity (SINGULARITY) ──
    SINGULARITY_RADIUS:   { id: 'SINGULARITY_RADIUS',   name: 'Wider Maw',    description: '+40px pull radius',         cost: 1700, maxStacks: 3, weapon: 'SINGULARITY', icon: 'vortex' },
    VOID_GRASP:           { id: 'VOID_GRASP',           name: 'Void Grasp',   description: '+30% pull strength',        cost: 1900, maxStacks: 2, weapon: 'SINGULARITY', icon: 'magnet' },
    SINGULARITY_DURATION: { id: 'SINGULARITY_DURATION', name: 'Stable Well',  description: '+0.5s pull duration',       cost: 2300, maxStacks: 2, weapon: 'SINGULARITY', icon: 'stopwatch' },
    EVENT_HORIZON:        { id: 'EVENT_HORIZON',        name: 'Event Horizon', description: 'Collapse hits 2× harder & wider', cost: 4300, maxStacks: 1, weapon: 'SINGULARITY', icon: 'explosion' },

    // ── Prism Beam (PRISM_BEAM) ──
    PRISM_BEAMS:    { id: 'PRISM_BEAMS',    name: 'More Facets',  description: '+1 beam in the fan',        cost: 2200, maxStacks: 3, weapon: 'PRISM_BEAM', icon: 'multi-shot' },
    PRISM_WIDTH:    { id: 'PRISM_WIDTH',    name: 'Beam Width',   description: '+30% beam width',           cost: 1100, maxStacks: 3, weapon: 'PRISM_BEAM', icon: 'ruler' },
    PRISM_DURATION: { id: 'PRISM_DURATION', name: 'Lingering Light', description: '+0.3s beam duration',    cost: 1500, maxStacks: 3, weapon: 'PRISM_BEAM', icon: 'stopwatch' },
    PRISM_SEEK:     { id: 'PRISM_SEEK',     name: 'Refraction',   description: 'Beams bend toward enemies', cost: 2700, maxStacks: 1, weapon: 'PRISM_BEAM', icon: 'target' },

    // ── Orbital Strike (ORBITAL_STRIKE) ──
    ORBITAL_RADIUS:  { id: 'ORBITAL_RADIUS',  name: 'Wider Impact', description: '+30px strike radius',      cost: 1700, maxStacks: 3, weapon: 'ORBITAL_STRIKE', icon: 'satellite' },
    ORBITAL_POWER:   { id: 'ORBITAL_POWER',   name: 'Heavier Payload', description: '+25% strike damage',    cost: 1900, maxStacks: 3, weapon: 'ORBITAL_STRIKE', icon: 'bomb' },
    RAPID_PAINT:     { id: 'RAPID_PAINT',     name: 'Rapid Paint',  description: '-0.2s telegraph time',     cost: 2300, maxStacks: 2, weapon: 'ORBITAL_STRIKE', icon: 'fast-forward' },
    ORBITAL_BARRAGE: { id: 'ORBITAL_BARRAGE', name: 'Barrage',      description: '+1 walking strike column', cost: 4300, maxStacks: 2, weapon: 'ORBITAL_STRIKE', icon: 'explosion' },

    // ── Cryo Burst (CRYO_BURST) ──
    CRYO_RADIUS: { id: 'CRYO_RADIUS', name: 'Cold Front',  description: '+40px frost radius',       cost: 1700, maxStacks: 3, weapon: 'CRYO_BURST', icon: 'wave' },
    DEEP_FREEZE: { id: 'DEEP_FREEZE', name: 'Deep Freeze', description: '+1s freeze duration',      cost: 2300, maxStacks: 2, weapon: 'CRYO_BURST', icon: 'snail' },
    SHATTER:     { id: 'SHATTER',     name: 'Shatter',     description: 'Frozen enemies take +30% damage', cost: 2600, maxStacks: 1, weapon: 'CRYO_BURST', icon: 'gem' },
    COLD_SNAP:   { id: 'COLD_SNAP',   name: 'Cold Snap',   description: '-1.5s cooldown',           cost: 3200, maxStacks: 2, weapon: 'CRYO_BURST', icon: 'stopwatch' },

    // ── Overdrive (OVERDRIVE) ──
    OVERDRIVE_DURATION: { id: 'OVERDRIVE_DURATION', name: 'Endurance',  description: '+1s buff duration',        cost: 2200, maxStacks: 3, weapon: 'OVERDRIVE', icon: 'stopwatch' },
    REDLINE:            { id: 'REDLINE',            name: 'Redline',    description: '+25% primary damage while active', cost: 2300, maxStacks: 2, weapon: 'OVERDRIVE', icon: 'fire' },
    NITRO:              { id: 'NITRO',              name: 'Nitro',      description: '-2s cooldown',             cost: 3200, maxStacks: 2, weapon: 'OVERDRIVE', icon: 'fast-forward' },
    AFTERBURN:          { id: 'AFTERBURN',          name: 'Afterburn',  description: 'Primary gains +1 pierce while active', cost: 2700, maxStacks: 1, weapon: 'OVERDRIVE', icon: 'bow-arrow' },
};

// ─── UPGRADE ECONOMY: SCALE + PER-STACK RAMP ────────────────────────────────
//
// 6.x.0 — Upgrades are now rare, deliberate purchases. A full 30-wave run
// yields ~100k gold (drops are hard-capped at 250/kill), so the player can
// only afford a handful of upgrades per playthrough. Two levers:
//
//   1. UPGRADE_COST_MULT — every weapon/power/ability upgrade's legacy cost is
//      multiplied by this. ~10 waves of mid-game income ≈ one upgrade.
//   2. UPGRADE_STACK_RAMP — each owned stack makes the NEXT stack of the same
//      trait cost more (geometric ramp), so stacking deep is a real
//      commitment and gives a sense of progression. Stack 1 = base,
//      stack N = base · ramp^(N-1).
//
// Selling refunds the exact at-cost price of the last stack owned (see
// shop-manager.sellShopItem) so the ramp stays net-zero — players can freely
// respec by selling one trait and buying another.
//
// Both are the only knobs to tune the economy; the per-stack `costOverrides`
// arrays below are generated from them at module load.
export const UPGRADE_COST_MULT = 13;
export const UPGRADE_STACK_RAMP = 1.6;

function _roundCost(n) {
    return Math.max(500, Math.round(n / 500) * 500);
}

// Build a per-stack cost array from an already-scaled stack-1 base:
// [base, base·ramp, base·ramp², …] for `maxStacks` entries, rounded to 500.
export function buildStackCosts(base1, maxStacks) {
    const out = [];
    for (let s = 0; s < Math.max(1, maxStacks | 0); s++) {
        out.push(_roundCost(base1 * Math.pow(UPGRADE_STACK_RAMP, s)));
    }
    return out;
}

// Apply scale + ramp to an upgrade table in place. Reads each entry's
// pre-scale base (its flat `cost`, or costOverrides[0] if it already had a
// ramp), multiplies by UPGRADE_COST_MULT, and regenerates `costOverrides` as
// a ramped per-stack array. Single-stack upgrades get the scaled flat cost.
function _scaleUpgradeTable(table) {
    for (const upg of Object.values(table)) {
        const legacyBase = (upg.costOverrides && upg.costOverrides.length)
            ? upg.costOverrides[0] : (upg.cost || 0);
        if (!legacyBase) continue; // free / weapon-unlock rows stay free
        const base1 = legacyBase * UPGRADE_COST_MULT;
        const maxStacks = upg.maxStacks || 1;
        if (maxStacks > 1) {
            upg.costOverrides = buildStackCosts(base1, maxStacks);
            upg.cost = upg.costOverrides[0];
        } else {
            upg.cost = _roundCost(base1);
            if (upg.costOverrides) upg.costOverrides = [upg.cost];
        }
    }
}
_scaleUpgradeTable(PRIMARY_UPGRADES);
_scaleUpgradeTable(POWER_UPGRADES);

// ─── DEFENSE ABILITIES (Number Keys 1-4) ───────────────────────────────────────

// Phase B.S1 — canonical export renamed ABILITIES → ABILITIES to match
// the new 4-slot loadout model. `ABILITIES` is kept as a back-compat
// alias (see below) so every existing import keeps resolving unchanged.
export const ABILITIES = {
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
    // R6.1 — Field Medic replaces Repair Nanites' HoT. Its unique verb is
    // the STATUS CLEANSE (clears CHILL/CORRODE/BURN) bundled with a burst
    // heal — no card/stat/gear can cleanse, so it earns an ability slot.
    FIELD_MEDIC: {
        id: 'FIELD_MEDIC',
        name: 'Field Medic',
        description: 'Burst-heal 45% max HP + cleanse all statuses',
        icon: 'heart',
        color: '#44ff88',
        cooldown: 22000,
        duration: 400,        // brief heal-flash; the heal+cleanse are instant
        healPct: 0.45,        // fraction of effective max HP restored (+POTENCY)
        cleanse: true,
        cost: 2,
        unlockWave: 2,
        upgrades: ['POTENCY', 'EMERGENCY_PROTOCOL'],
    },
    // 5.93.0 — PHASE_DASH removed from ABILITIES. Dash is now a
    // core movement primitive on the SHIFT key (see Player._triggerDash
    // and the SHIFT keymap in `js/modules/ui/input-handler.js`). The
    // EXTENDED_PHASE / AFTERIMAGE / QUICK_PHASE upgrades were orphaned
    // when the ability itself was removed and were deleted along with it;
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
    // R6.1 — TRACTOR_SHIELD CUT from the roster (redundant: loot-pull = Orb
    // Magnet trait, enemy-pull = Gravity Snare, shield = Bulwark). Its tractor
    // physics in collision/render remain but are now never engaged (no ability
    // sets tractorShieldActive). Slated for a full code sweep later.
    // SENTRY_DRONE — autonomous drones orbit the ship and auto-fire at the
    // nearest enemy for `duration`. Modeled on DEFLECTOR_ORBS (orbit) + the
    // mine turret-fire helper (allied bullets via bullet.shooter tag).
    SENTRY_DRONE: {
        id: 'SENTRY_DRONE',
        name: 'Sentry Drone',
        description: 'Deploys auto-firing drones that orbit you for 8s',
        icon: 'satellite',
        color: '#ffaa66',
        cooldown: 18000,
        duration: 8000,
        droneCount: 1,            // +EXTRA_DRONE
        orbitRadius: 58,
        fireInterval: 600,        // ms between drone shots (-RAPID_DRONE)
        droneDamage: 1.2,         // +DRONE_CALIBER
        droneRange: 0.7,          // bullet rangeMultiplier
        cost: 3,
        unlockWave: 5,
        upgrades: ['EXTRA_DRONE', 'RAPID_DRONE', 'DRONE_CALIBER'],
    },
    // ── R6.3 — new purchasable abilities (unique verbs only) ──
    // Each is bought with account-gold in the ARMORY (it's a non-base
    // ABILITIES key, so the unlock store offers it automatically) and
    // equipped via the LOADOUT screen. Activated effects live in
    // player/abilities.js activateAbility().
    BLINK: {
        id: 'BLINK', name: 'Blink',
        description: 'Instantly teleport forward + brief i-frames',
        icon: 'wind', color: '#aa88ff',
        cooldown: 9000, duration: 200,
        blinkDist: 220, iFrameMs: 350,
        cost: 3, unlockWave: 0, upgrades: [],
    },
    GRAVITY_SNARE: {
        id: 'GRAVITY_SNARE', name: 'Gravity Snare',
        description: 'Yank nearby enemies inward to group them up',
        icon: 'target', color: '#7744dd',
        cooldown: 14000, duration: 200,
        radius: 320, pullFactor: 0.6, minDist: 70,
        cost: 3, unlockWave: 0, upgrades: [],
    },
    DESIGNATOR: {
        id: 'DESIGNATOR', name: 'Designator',
        description: 'MARK all nearby enemies (homing + crit + bonus loot)',
        icon: 'target', color: '#ffcc44',
        cooldown: 16000, duration: 200,
        radius: 360, markMs: 6000,
        cost: 3, unlockWave: 0, upgrades: [],
    },
    SECOND_WIND: {
        id: 'SECOND_WIND', name: 'Second Wind',
        description: 'Arm a death save — survive the next lethal hit (once per cast)',
        icon: 'heart', color: '#ff66aa',
        cooldown: 45000, duration: 200,
        cost: 4, unlockWave: 0, upgrades: [],
    },
    ELEMENTAL_INFUSION: {
        id: 'ELEMENTAL_INFUSION', name: 'Elemental Infusion',
        description: 'Re-element your shots to the next element for 8s (beat resists)',
        icon: 'spiral', color: '#66ffcc',
        cooldown: 16000, duration: 8000,
        elements: ['PYRO', 'CRYO', 'VOLT', 'TOXIC', 'VOID', 'RADIANT'],
        cost: 4, unlockWave: 0, upgrades: [],
    },
    CRYO_FIELD: {
        id: 'CRYO_FIELD', name: 'Cryo Field',
        description: 'Drop a frost field that FREEZES enemies inside for 5s',
        icon: 'snowflake', color: '#88ddff',
        cooldown: 18000, duration: 5000,
        radius: 180, tickMs: 250,
        cost: 4, unlockWave: 0, upgrades: [],
    },
    STASIS_FIELD: {
        id: 'STASIS_FIELD', name: 'Stasis Field',
        description: 'Drop a field that CHILLS (slows) enemies inside for 5s',
        icon: 'spiral', color: '#aabbff',
        cooldown: 16000, duration: 5000,
        radius: 210, tickMs: 250,
        cost: 4, unlockWave: 0, upgrades: [],
    },
    STORM_CELL: {
        id: 'STORM_CELL', name: 'Storm Cell',
        description: 'Drop a storm zone that CONDUCTS (shocks) enemies inside for 5s',
        icon: 'bolt', color: '#ffe44d',
        cooldown: 16000, duration: 5000,
        radius: 200, tickMs: 300,
        cost: 4, unlockWave: 0, upgrades: [],
    },
    PYRE_AURA: {
        id: 'PYRE_AURA', name: 'Pyre Aura',
        description: 'Drop a flame zone that BURNS enemies inside for 5s',
        icon: 'bomb', color: '#ff7a2a',
        cooldown: 16000, duration: 5000,
        radius: 190, tickMs: 400, burnDmg: 6,
        cost: 4, unlockWave: 0, upgrades: [],
    },
};

// ─── ABILITY UPGRADES ───────────────────────────────────────────────────────

export const ABILITY_UPGRADES = {
    // Bulwark
    FORTIFY:          { id: 'FORTIFY',          name: 'Fortify',          description: '+1s duration per stack',               cost: 2, maxStacks: 2, ability: 'BULWARK', icon: 'stopwatch' },
    IRON_WILL:        { id: 'IRON_WILL',        name: 'Iron Will',        description: 'Resistance increased to 65%',         cost: 3, maxStacks: 1, ability: 'BULWARK', icon: 'shield' },
    RETALIATION:      { id: 'RETALIATION',      name: 'Retaliation',      description: 'Emit a damage pulse when hit',        cost: 3, maxStacks: 1, ability: 'BULWARK', icon: 'explosion' },

    // Field Medic (R6.1)
    POTENCY:          { id: 'POTENCY',          name: 'Potency',          description: '+10% burst heal per stack',            cost: 2, maxStacks: 2, ability: 'FIELD_MEDIC', icon: 'pill' },
    EMERGENCY_PROTOCOL:{ id:'EMERGENCY_PROTOCOL',name:'Emergency',        description: 'Auto-activates below 20% HP',         cost: 3, maxStacks: 1, ability: 'FIELD_MEDIC', icon: 'siren' },

    // 5.93.0 — Phase Dash upgrades (EXTENDED_PHASE, AFTERIMAGE,
    // QUICK_PHASE) deleted along with the PHASE_DASH defense ability.
    // Dash is now a core SHIFT-key movement primitive with no
    // ability-tree upgrades.

    // Deflector Orbs
    EXTRA_ORB:        { id: 'EXTRA_ORB',        name: 'Extra Orb',        description: '+1 orbiting orb per stack',            cost: 2, maxStacks: 2, ability: 'DEFLECTOR_ORBS', icon: 'crystal-ball' },
    HARDENED_ORBS:    { id: 'HARDENED_ORBS',    name: 'Hardened Orbs',    description: '+2 hits per orb per stack',            cost: 2, maxStacks: 2, ability: 'DEFLECTOR_ORBS', icon: 'gem' },
    REFLECT:          { id: 'REFLECT',          name: 'Reflect',          description: 'Blocked bullets fire back at enemies', cost: 3, maxStacks: 1, ability: 'DEFLECTOR_ORBS', icon: 'loop' },

    // EMP Pulse
    WIDE_BAND:        { id: 'WIDE_BAND',        name: 'Wide Band',        description: '+60px radius per stack',               cost: 2, maxStacks: 2, ability: 'EMP_PULSE', icon: 'satellite' },
    EMP_OVERLOAD:     { id: 'EMP_OVERLOAD',     name: 'Overload',         description: 'Stunned enemies take +20% damage',    cost: 3, maxStacks: 1, ability: 'EMP_PULSE', icon: 'bolt' },
    CASCADE:          { id: 'CASCADE',          name: 'Cascade',          description: 'Kill a stunned enemy to stun nearby',  cost: 3, maxStacks: 1, ability: 'EMP_PULSE', icon: 'chain' },

    // Tractor Shield upgrades removed with the ability (R6.1).

    // Sentry Drone
    EXTRA_DRONE:      { id: 'EXTRA_DRONE',      name: 'Extra Drone',      description: '+1 drone per stack',                  cost: 3, maxStacks: 2, ability: 'SENTRY_DRONE', icon: 'satellite' },
    RAPID_DRONE:      { id: 'RAPID_DRONE',      name: 'Rapid Servos',     description: '-25% drone fire interval per stack',  cost: 2, maxStacks: 2, ability: 'SENTRY_DRONE', icon: 'bolt' },
    DRONE_CALIBER:    { id: 'DRONE_CALIBER',    name: 'Heavy Caliber',    description: '+40% drone damage per stack',         cost: 2, maxStacks: 2, ability: 'SENTRY_DRONE', icon: 'circle-fill' },
};

// ─── PASSIVE UPGRADES (Phase 1 — 2026-05-19) ────────────────────────────────
//
// Always-on, weapon-agnostic, ability-agnostic. PASSIVE_UPGRADES is the
// fourth category alongside PRIMARY_UPGRADES, POWER_UPGRADES, and
// ABILITY_UPGRADES. Each entry's `id` matches the existing in-game ID so
// `getPowerupStacks('THORNS')` etc. continues to resolve correctly via
// the player's namespace-agnostic powerup map.
//
// Phase 1 is INTENTIONALLY additive: this new export sits alongside
// POWERUP_TYPES (offensive drop pool) and ABILITY_UPGRADES (BULWARK's
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
// 6.30.0 — Passives are now the WAVE-CLEAR REWARD pool ONLY. They were
// removed from the shop (no PASSIVE tab) — the only way to gain a
// passive is to pick it from the survivor cards at every stage clear,
// which forces deliberate playstyle choices. Weapon-specific effects
// (Rapid Fire, Multi Shot, Explosive Rounds) were dropped from this
// pool entirely — those are now per-weapon upgrades (6.28.0).
export const PASSIVE_UPGRADES = {
    CRIT_CHANCE:   { id: 'CRIT_CHANCE',   name: 'Critical Chance',    description: '+7% crit chance',                      maxStacks: 6,  passive: true, icon: 'star'   },
    CRIT_DAMAGE:   { id: 'CRIT_DAMAGE',   name: 'Critical Damage',    description: '+15% crit damage',                     maxStacks: 6,  passive: true, icon: 'dagger' },
    HEALTH_BOOST:  { id: 'HEALTH_BOOST',  name: 'Health',             description: '+35 max HP, full heal',                maxStacks: 10, passive: true, icon: 'heart'  },
    SHIELD_BOOST:  { id: 'SHIELD_BOOST',  name: 'Toughness',          description: '+8% damage reduction (cap 75%)',       maxStacks: 8,  passive: true, icon: 'shield' },
    VAMPIRISM:     { id: 'VAMPIRISM',     name: 'Vampirism',          description: 'Heal 5% of damage dealt',              maxStacks: 5,  passive: true, icon: 'skull'  },
    THORNS:        { id: 'THORNS',        name: 'Thorns',             description: 'Reflect 25% of damage taken',          maxStacks: 4,  passive: true, icon: 'anger'  },
    DODGE:         { id: 'DODGE',         name: 'Evasion',            description: '+5% dodge chance (cap 50%)',           maxStacks: 10, passive: true, icon: 'wind'   },
    SPEED_BOOST:   { id: 'SPEED_BOOST',   name: 'Speed',              description: '+65% thrust & top speed',              maxStacks: 4,  passive: true, icon: 'wind',  gradientColors: ['#aaffff', '#0099cc'], color: '#66ddff' },
};

// 6.30.0 — Ordered reward pool the survivor-card pick draws from.
export const PASSIVE_REWARD_IDS = [
    'HEALTH_BOOST', 'SHIELD_BOOST', 'VAMPIRISM', 'THORNS',
    'CRIT_CHANCE', 'CRIT_DAMAGE', 'DODGE', 'SPEED_BOOST',
];

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

/** Get all upgrades for a specific primary weapon */
export function getPrimaryUpgrades(weaponId) {
    return Object.values(PRIMARY_UPGRADES).filter(u => u.weapon === weaponId);
}

/** Get all upgrades for a specific power weapon */
export function getPowerUpgrades(weaponId) {
    return Object.values(POWER_UPGRADES).filter(u => u.weapon === weaponId);
}

/** Get all upgrades for a specific defense ability */
export function getAbilityUpgrades(abilityId) {
    return Object.values(ABILITY_UPGRADES).filter(u => u.ability === abilityId);
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
