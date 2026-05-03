// Weapon and skill configuration data for Rainboids
// All weapons, power weapons, and defense skills are defined here.

// ─── PRIMARY WEAPONS (Left Click) ───────────────────────────────────────────

export const PRIMARY_WEAPONS = {
    PULSE_CANNON: {
        id: 'PULSE_CANNON',
        name: 'Pulse Cannon',
        description: 'Steady stream of reliable shots',
        icon: '🔫',
        color: '#00ccff',
        fireRate: 400,
        damage: 0.8,
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
        icon: '🌧️',
        color: '#88ffff',
        fireRate: 130,
        damage: 0.3,
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
        id: 'SCATTER_GUN',
        name: 'Scatter Gun',
        description: 'Shotgun burst — devastating up close',
        icon: '💥',
        color: '#ff8844',
        fireRate: 700,
        damage: 0.4,
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
        description: 'Slow, powerful piercing rail shot',
        icon: '⚡',
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
    LANCE_BEAM: {
        id: 'LANCE_BEAM',
        name: 'Lance Beam',
        description: 'Precision sweep laser beam',
        icon: '🔦',
        color: '#44ff44',
        fireRate: 1200,
        damage: 0.15,
        bulletSpeed: 0,
        bulletSize: 0,
        bulletCount: 0,
        spreadAngle: 0,
        piercing: 0,
        range: 0.6,
        beamDuration: 400,
        beamWidth: 6,
        cost: 0,
        spCost: 0,
        unlockWave: 12,
        upgrades: ['BEAM_WIDTH', 'LINGER', 'REFRACTION', 'OVERLOAD_BEAM', 'LANCE_VELOCITY'],
    },
};

// Streak damage tiers. Each tier adds +0.25× damage. Capped at LEGENDARY
// (15 kills, +100%) so high streaks don't break the difficulty curve.
// Higher streaks beyond the cap just refresh the buff timer.
//   - 3  kills → 1.25× (EMPOWERED)
//   - 6  kills → 1.50× (UNSTOPPABLE)
//   - 10 kills → 1.75× (GODLIKE)
//   - 15 kills → 2.00× (LEGENDARY — cap)
export const STREAK_TIERS = [
    { kills: 3,  mult: 1.25, label: 'EMPOWERED',  color: '#7FE7FF' }, // cyan
    { kills: 6,  mult: 1.50, label: 'UNSTOPPABLE', color: '#FFA844' }, // orange
    { kills: 10, mult: 1.75, label: 'GODLIKE',     color: '#FF6688' }, // pink-red
    { kills: 15, mult: 2.00, label: 'LEGENDARY',   color: '#FFD700' }, // gold
];
export const STREAK_BUFF_DURATION = 4000; // ms — buff lasts 4s, refreshes on each new kill while active.
// NOTE: there is NO time-based streak reset. The streak only resets when the
// player TAKES DAMAGE (see lifecycle.js takeDamage + collision-system.js).

// ─── PRIMARY WEAPON UPGRADES ────────────────────────────────────────────────

export const PRIMARY_UPGRADES = {
    // Pulse Cannon
    STEADY_AIM:     { id: 'STEADY_AIM',     name: 'Steady Aim',     description: '-8% spread per stack',                    cost: 400,  maxStacks: 3,  weapon: 'PULSE_CANNON', icon: '🎯' },
    OVERCHARGE:     { id: 'OVERCHARGE',      name: 'Overcharge',     description: '+15% auto-fire damage per stack',         cost: 550,  maxStacks: 4,  weapon: 'PULSE_CANNON', icon: '⚡' },
    ECHO_ROUND:     { id: 'ECHO_ROUND',      name: 'Echo Round',     description: '10% chance to fire a bonus bullet',      cost: 850,  maxStacks: 3,  weapon: 'PULSE_CANNON', icon: '🔁' },

    // Storm Needles
    NEEDLE_STORM:   { id: 'NEEDLE_STORM',    name: 'Needle Storm',   description: '+15% fire rate per stack',                cost: 400,  maxStacks: 4,  weapon: 'STORM_NEEDLES', icon: '🌪️' },
    POISON_TIP:     { id: 'POISON_TIP',      name: 'Poison Tip',     description: 'Enemies take 1 DoT for 2s',             cost: 850,  maxStacks: 1,  weapon: 'STORM_NEEDLES', icon: '☠️' },
    STATIC_CHARGE:  { id: 'STATIC_CHARGE',   name: 'Static Charge',  description: 'Every 10th needle chains to nearby enemy',cost: 1250, maxStacks: 2,  weapon: 'STORM_NEEDLES', icon: '⚡' },
    SUPPRESSION:    { id: 'SUPPRESSION',     name: 'Suppression',    description: 'Hit enemies fire 15% slower for 1.5s',   cost: 1050, maxStacks: 1,  weapon: 'STORM_NEEDLES', icon: '🔇' },

    // Scatter Gun
    TIGHT_CHOKE:    { id: 'TIGHT_CHOKE',     name: 'Tight Choke',    description: '-15% spread angle per stack',             cost: 500,  maxStacks: 3,  weapon: 'SCATTER_GUN', icon: '🔧' },
    BUCKSHOT:        { id: 'BUCKSHOT',        name: 'Buckshot',       description: '+1 pellet per stack',                     cost: 700,  maxStacks: 2,  weapon: 'SCATTER_GUN', icon: '💣' },
    SHRAPNEL:        { id: 'SHRAPNEL',        name: 'Shrapnel',       description: 'Pellets fragment at max range',           cost: 1050, maxStacks: 1,  weapon: 'SCATTER_GUN', icon: '💥' },
    SLUG_ROUND:      { id: 'SLUG_ROUND',      name: 'Slug Round',     description: 'Every 4th shot is a single big slug',    cost: 1400, maxStacks: 1,  weapon: 'SCATTER_GUN', icon: '🔵' },

    // Rail Driver
    PENETRATOR:      { id: 'PENETRATOR',      name: 'Penetrator',     description: '+50% range per stack',                   cost: 550,  maxStacks: 3,  weapon: 'RAIL_DRIVER', icon: '🏹' },
    KINETIC_IMPACT:  { id: 'KINETIC_IMPACT',  name: 'Kinetic Impact', description: 'Enemies hit are knocked back',           cost: 700,  maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: '💨' },
    RAILGUN_CAPACITOR:{ id: 'RAILGUN_CAPACITOR',name:'Capacitor',     description: '2x damage after 2s idle',                cost: 1050, maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: '🔋' },
    THROUGH_AND_THROUGH:{ id: 'THROUGH_AND_THROUGH',name:'Through',   description: 'Leaves a lingering damage trail',        cost: 1750, maxStacks: 1,  weapon: 'RAIL_DRIVER', icon: '✨' },

    // Lance Beam
    BEAM_WIDTH:      { id: 'BEAM_WIDTH',      name: 'Beam Width',     description: '+30% beam width per stack',              cost: 500,  maxStacks: 3,  weapon: 'LANCE_BEAM', icon: '📐' },
    LINGER:          { id: 'LINGER',          name: 'Linger',         description: '+0.1s beam duration per stack',           cost: 700,  maxStacks: 3,  weapon: 'LANCE_BEAM', icon: '⏱️' },
    REFRACTION:      { id: 'REFRACTION',      name: 'Refraction',     description: 'Beam splits on hitting enemy',           cost: 1250, maxStacks: 1,  weapon: 'LANCE_BEAM', icon: '🔀' },
    OVERLOAD_BEAM:   { id: 'OVERLOAD_BEAM',   name: 'Overload',       description: 'Final 0.1s deals 3x damage',             cost: 1050, maxStacks: 1,  weapon: 'LANCE_BEAM', icon: '🔥' },

    // Velocity-and-damage upgrades — kinetic-energy flavor: faster bullets
    // hit harder. Each stack is +12% bullet velocity AND +12% damage (additive,
    // so 3 stacks = +36% / +36%, ~+36% sustained DPS). Read via
    // getBulletVelocityDamageMult() in player/weapons.js. For LANCE_BEAM the
    // "velocity" portion becomes range (it has no projectiles), keeping the
    // damage scaling identical to the projectile weapons.
    PULSE_VELOCITY:  { id: 'PULSE_VELOCITY',  name: 'High-Velocity Rounds', description: '+12% bullet speed & damage per stack (Pulse Cannon)',  cost: 700,  maxStacks: 3, weapon: 'PULSE_CANNON',  icon: '🚄', velocityBonus: 0.12 },
    NEEDLE_VELOCITY: { id: 'NEEDLE_VELOCITY', name: 'Hypersonic Needles',   description: '+12% needle speed & damage per stack (Storm Needles)', cost: 700,  maxStacks: 3, weapon: 'STORM_NEEDLES', icon: '🚄', velocityBonus: 0.12 },
    SCATTER_VELOCITY:{ id: 'SCATTER_VELOCITY',name: 'Powder Charge',         description: '+12% pellet speed & damage per stack (Scatter Gun)',  cost: 700,  maxStacks: 3, weapon: 'SCATTER_GUN',   icon: '🚄', velocityBonus: 0.12 },
    RAIL_VELOCITY:   { id: 'RAIL_VELOCITY',   name: 'Tungsten Slug',         description: '+12% rail speed & damage per stack (Rail Driver)',    cost: 900,  maxStacks: 3, weapon: 'RAIL_DRIVER',   icon: '🚄', velocityBonus: 0.12 },
    LANCE_VELOCITY:  { id: 'LANCE_VELOCITY',  name: 'Focused Lens',          description: '+12% beam range & damage per stack (Lance Beam)',     cost: 800,  maxStacks: 3, weapon: 'LANCE_BEAM',    icon: '🚄', velocityBonus: 0.12 },
};

// ─── POWER WEAPONS (Right Click) ────────────────────────────────────────────

export const POWER_WEAPONS = {
    CHARGE_SHOT: {
        id: 'CHARGE_SHOT',
        name: 'Charge Shot',
        description: 'Hold to charge, release to fire',
        icon: '🔋',
        color: '#00ffff',
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
        icon: '💣',
        color: '#ff6600',
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
        icon: '💫',
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
    LIGHTNING_ARC: {
        id: 'LIGHTNING_ARC',
        name: 'Lightning Arc',
        description: 'Chain lightning between enemies',
        icon: '⚡',
        color: '#8888ff',
        cooldown: 6000,
        isChargeBased: false,
        chainCount: 3,
        chainDamage: 2,       // was 3 — power weapons scaled down for balance
        chainFalloff: 0.6,    // 60% damage each jump
        chainRange: 200,      // px between targets
        cost: 2500,
        spCost: 2,
        unlockWave: 5,
        upgrades: ['CONDUCTOR', 'AMPLIFIER', 'STATIC_FIELD', 'TESLA_COIL'],
    },
    MISSILE_SALVO: {
        id: 'MISSILE_SALVO',
        name: 'Missile Salvo',
        description: 'Homing missiles seek targets',
        icon: '🚀',
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
};

// ─── POWER WEAPON UPGRADES ──────────────────────────────────────────────────

export const POWER_UPGRADES = {
    // Charge Shot (existing upgrades moved here)
    CHARGE_POWER:     { id: 'CHARGE_POWER',     name: 'Charge Power',     description: '+0.5 charge shot base damage per stack', cost: 750,  maxStacks: 6,  weapon: 'CHARGE_SHOT', icon: '🔋' },
    CHARGE_SPEED:     { id: 'CHARGE_SPEED',     name: 'Charge Speed',     description: '-1 second charge time',               cost: 1500, maxStacks: 3,  weapon: 'CHARGE_SHOT', icon: '⏱️',
                        costOverrides: [1500, 3000, 5000] },
    CHARGE_OVERCHARGE:{ id: 'CHARGE_OVERCHARGE', name: 'Overcharge',      description: 'Full charge explodes on impact',      cost: 2000, maxStacks: 1,  weapon: 'CHARGE_SHOT', icon: '💥' },

    // Mine Layer
    EXTRA_PAYLOAD:    { id: 'EXTRA_PAYLOAD',    name: 'Extra Payload',    description: '+1 max active mine per stack',         cost: 700,  maxStacks: 2,  weapon: 'MINE_LAYER', icon: '💣' },
    BLAST_RADIUS:     { id: 'BLAST_RADIUS',     name: 'Blast Radius',     description: '+30px blast & +20px trigger range per stack', cost: 800,  maxStacks: 3,  weapon: 'MINE_LAYER', icon: '💥' },
    DAISY_CHAIN:      { id: 'DAISY_CHAIN',      name: 'Daisy Chain',      description: 'Nearby mines detonate together',      cost: 2000, maxStacks: 1,  weapon: 'MINE_LAYER', icon: '🔗' },
    RAPID_DEPLOY:     { id: 'RAPID_DEPLOY',     name: 'Rapid Deploy',     description: '-25% mine cooldown per stack (4s → 3s → 2.25s)', cost: 1100, maxStacks: 2, weapon: 'MINE_LAYER', icon: '⚡' },

    // Nova Blast
    SHOCKWAVE:        { id: 'SHOCKWAVE',        name: 'Shockwave',        description: '+40px ring radius per stack',          cost: 800,  maxStacks: 3,  weapon: 'NOVA_BLAST', icon: '🌊' },
    AFTERSHOCK:       { id: 'AFTERSHOCK',       name: 'Aftershock',       description: 'Enemies hit are slowed 30% for 2s',   cost: 1200, maxStacks: 1,  weapon: 'NOVA_BLAST', icon: '🐌' },
    DOUBLE_PULSE:     { id: 'DOUBLE_PULSE',     name: 'Double Pulse',     description: 'Fire a second ring 0.3s later',       cost: 2000, maxStacks: 1,  weapon: 'NOVA_BLAST', icon: '🔁' },
    RESONANCE:        { id: 'RESONANCE',        name: 'Resonance',        description: '-1.5s cooldown per stack',             cost: 1500, maxStacks: 2,  weapon: 'NOVA_BLAST', icon: '🔊' },

    // Lightning Arc
    CONDUCTOR:        { id: 'CONDUCTOR',        name: 'Conductor',        description: '+1 chain jump per stack',              cost: 800,  maxStacks: 2,  weapon: 'LIGHTNING_ARC', icon: '🔌' },
    AMPLIFIER:        { id: 'AMPLIFIER',        name: 'Amplifier',        description: '+20% chain damage per stack',          cost: 1000, maxStacks: 3,  weapon: 'LIGHTNING_ARC', icon: '📡' },
    STATIC_FIELD:     { id: 'STATIC_FIELD',     name: 'Static Field',     description: 'Chained enemies stunned 0.5s',        cost: 1500, maxStacks: 1,  weapon: 'LIGHTNING_ARC', icon: '⚡' },
    TESLA_COIL:       { id: 'TESLA_COIL',       name: 'Tesla Coil',       description: '-1.5s cooldown per stack',             cost: 1200, maxStacks: 2,  weapon: 'LIGHTNING_ARC', icon: '🗼' },

    // Missile Salvo
    EXTRA_ORDNANCE:   { id: 'EXTRA_ORDNANCE',   name: 'Extra Ordnance',   description: '+1 missile per stack',                cost: 1000, maxStacks: 2,  weapon: 'MISSILE_SALVO', icon: '🚀' },
    CLUSTER_WARHEAD:  { id: 'CLUSTER_WARHEAD',  name: 'Cluster Warhead',  description: 'Missiles split into 3 on impact',     cost: 1800, maxStacks: 1,  weapon: 'MISSILE_SALVO', icon: '💥' },
    QUICK_RELOAD:     { id: 'QUICK_RELOAD',     name: 'Quick Reload',     description: '-2s cooldown per stack',               cost: 1500, maxStacks: 2,  weapon: 'MISSILE_SALVO', icon: '⏩' },
};

// ─── DEFENSE SKILLS (Number Keys 1-4) ───────────────────────────────────────

export const DEFENSE_SKILLS = {
    BULWARK: {
        id: 'BULWARK',
        name: 'Bulwark',
        description: '50% damage resistance for 4s',
        icon: '🛡️',
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
        icon: '💚',
        color: '#44ff88',
        cooldown: 25000,
        duration: 5000,
        healPerSecond: 3,
        cost: 2,
        unlockWave: 2,
        upgrades: ['POTENCY', 'EXTENDED_CARE', 'EMERGENCY_PROTOCOL'],
    },
    PHASE_DASH: {
        id: 'PHASE_DASH',
        name: 'Phase Dash',
        description: 'Invulnerable dash 150px',
        icon: '💨',
        color: '#aa88ff',
        cooldown: 8000,
        duration: 300,
        dashDistance: 150,
        cost: 2,
        unlockWave: 3,
        upgrades: ['EXTENDED_PHASE', 'AFTERIMAGE', 'QUICK_PHASE'],
    },
    DEFLECTOR_ORBS: {
        id: 'DEFLECTOR_ORBS',
        name: 'Deflector Orbs',
        description: 'Orbiting orbs block bullets for 5s',
        icon: '🔮',
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
        icon: '📡',
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
        icon: '🧲',
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
    FORTIFY:          { id: 'FORTIFY',          name: 'Fortify',          description: '+1s duration per stack',               cost: 2, maxStacks: 2, skill: 'BULWARK', icon: '⏱️' },
    IRON_WILL:        { id: 'IRON_WILL',        name: 'Iron Will',        description: 'Resistance increased to 65%',         cost: 3, maxStacks: 1, skill: 'BULWARK', icon: '🛡️' },
    RETALIATION:      { id: 'RETALIATION',      name: 'Retaliation',      description: 'Emit a damage pulse when hit',        cost: 3, maxStacks: 1, skill: 'BULWARK', icon: '💥' },

    // Repair Nanites
    POTENCY:          { id: 'POTENCY',          name: 'Potency',          description: '+1 HP/s per stack',                    cost: 2, maxStacks: 2, skill: 'REPAIR_NANITES', icon: '💊' },
    EXTENDED_CARE:    { id: 'EXTENDED_CARE',    name: 'Extended Care',    description: '+2s duration per stack',               cost: 2, maxStacks: 2, skill: 'REPAIR_NANITES', icon: '⏱️' },
    EMERGENCY_PROTOCOL:{ id:'EMERGENCY_PROTOCOL',name:'Emergency',        description: 'Auto-activates below 20% HP',         cost: 3, maxStacks: 1, skill: 'REPAIR_NANITES', icon: '🚨' },

    // Phase Dash
    EXTENDED_PHASE:   { id: 'EXTENDED_PHASE',   name: 'Extended Phase',   description: '+0.2s invulnerability per stack',      cost: 2, maxStacks: 2, skill: 'PHASE_DASH', icon: '⏱️' },
    AFTERIMAGE:       { id: 'AFTERIMAGE',       name: 'Afterimage',       description: 'Leave a damaging trail',              cost: 3, maxStacks: 1, skill: 'PHASE_DASH', icon: '👻' },
    QUICK_PHASE:      { id: 'QUICK_PHASE',      name: 'Quick Phase',      description: '-2s cooldown per stack',               cost: 2, maxStacks: 2, skill: 'PHASE_DASH', icon: '⏩' },

    // Deflector Orbs
    EXTRA_ORB:        { id: 'EXTRA_ORB',        name: 'Extra Orb',        description: '+1 orbiting orb per stack',            cost: 2, maxStacks: 2, skill: 'DEFLECTOR_ORBS', icon: '🔮' },
    HARDENED_ORBS:    { id: 'HARDENED_ORBS',    name: 'Hardened Orbs',    description: '+2 hits per orb per stack',            cost: 2, maxStacks: 2, skill: 'DEFLECTOR_ORBS', icon: '💎' },
    REFLECT:          { id: 'REFLECT',          name: 'Reflect',          description: 'Blocked bullets fire back at enemies', cost: 3, maxStacks: 1, skill: 'DEFLECTOR_ORBS', icon: '🔁' },

    // EMP Pulse
    WIDE_BAND:        { id: 'WIDE_BAND',        name: 'Wide Band',        description: '+60px radius per stack',               cost: 2, maxStacks: 2, skill: 'EMP_PULSE', icon: '📡' },
    EMP_OVERLOAD:     { id: 'EMP_OVERLOAD',     name: 'Overload',         description: 'Stunned enemies take +20% damage',    cost: 3, maxStacks: 1, skill: 'EMP_PULSE', icon: '⚡' },
    CASCADE:          { id: 'CASCADE',          name: 'Cascade',          description: 'Kill a stunned enemy to stun nearby',  cost: 3, maxStacks: 1, skill: 'EMP_PULSE', icon: '🔗' },

    // Tractor Shield
    WIDE_ANGLE:       { id: 'WIDE_ANGLE',       name: 'Wide Angle',       description: '+30° shield arc per stack',            cost: 2, maxStacks: 2, skill: 'TRACTOR_SHIELD', icon: '📐' },
    PROFIT:           { id: 'PROFIT',           name: 'Profit',           description: '+5 coins per absorbed bullet',         cost: 2, maxStacks: 2, skill: 'TRACTOR_SHIELD', icon: '💰' },
    REDIRECTION:      { id: 'REDIRECTION',      name: 'Redirection',      description: '30% of absorbed bullets fire back',   cost: 3, maxStacks: 1, skill: 'TRACTOR_SHIELD', icon: '↩️' },
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
