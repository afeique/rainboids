// ── Enemy Type Definitions ─────────────────────────────────────────────────
// Data-driven config for all 10 enemy types.
// Each type defines: base stats, movement pattern, firing pattern, visual shape, and AI params.
// Movement/firing/visual keys will be consumed by strategy registries (Phases 6.2–6.4).
// For now, movePattern and shootPattern remain the primary dispatch keys.

export const ENEMY_TYPES = {
    HUNTER: {
        name: 'Hunter',
        color: '#ff4444',
        health: 5,                 // 5.74.12 — bumped 3 → 5 (early-game difficulty pass)
        // 5.80.x — Speed bumped 2.0 → 2.6 + evasion 0.45 → 0.65 to match
        //   the Wasp threat tier. Hunters are now the second-fastest enemy
        //   and dodge as aggressively as the Wasp swarm. Their orbital
        //   strafe still distinguishes them visually from the zigzag.
        speed: 2.6,
        size: 32,
        shootPattern: 'hunter_single',
        shootRate: 1.5,
        // 5.78.1 — Hunters now sweep in arcs around the player with a
        // sticky one-way strafe (CW or CCW per-spawn) instead of the
        // burst-and-wait triangle. Reads as a coherent orbital threat
        // rather than stochastic zips. WASP keeps `triangle`.
        // 5.80.x — Arc enriched with vortex-paced angular speed,
        //   periodic slingshot contractions, and more frequent lunges
        //   (see hunterArcMovement). Hunters no longer move smoothly;
        //   they hunt.
        movePattern: 'hunter_arc',
        points: 120,               // was 75 (faster economy)
        movement: {
            pattern: 'hunter_arc',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'hunter_single',
            burstCount: 3,
            burstDelay: 75,        // 5.80.x — now actually wired through handleBurstShooting
            cooldown: { min: 600, max: 2200 }, // 5.80.x — between-burst gap (constants.js drives the live value)
        },
        visual: {
            shape: 'triangle',
            glowColor: '#ff6666',
            trailLength: 15,
        },
        ai: {
            evasion: 0.65,         // 5.80.x — bumped 0.45 → 0.65 (matches Wasp's 0.7)
            preferredRange: 250,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    GUARDIAN: {
        name: 'Guardian',
        color: '#44ff44',
        health: 12,                // 5.74.12 — bumped 7 → 12
        speed: 1.25,               // was 1.0 (+25%)
        size: 48,                  // was 57 (-15%)
        shootPattern: 'guardian_spread',
        shootRate: 0.3,
        movePattern: 'square',
        points: 200,
        movement: {
            pattern: 'square',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'guardian_spread',
            burstCount: 3,
            burstDelay: 105,
            cooldown: { min: 2250, max: 8000 },
        },
        visual: {
            shape: 'emerald_guardian',
            glowColor: '#66ff66',
            trailLength: 15,
        },
        ai: {
            evasion: 0.3,
            preferredRange: 300,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    WASP: {
        name: 'Wasp',
        color: '#ffff44',
        health: 5,                 // 5.74.12 — bumped 3 → 5
        speed: 3.5,                // was 2.8
        size: 36,                  // was 42
        shootPattern: 'wasp_machinegun',
        shootRate: 0.7,
        movePattern: 'wasp_zigzag',
        points: 100,
        movement: {
            pattern: 'wasp_zigzag',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.02, max: 0.02 },
        },
        firing: {
            pattern: 'wasp_machinegun',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 450, max: 2000 },
        },
        visual: {
            shape: 'wasp_ship',
            glowColor: '#ffff66',
            trailLength: 15,
        },
        ai: {
            evasion: 0.7,          // was 0.5 — already evasive, capped at 0.7
            preferredRange: 200,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    STALKER: {
        name: 'Stalker',
        color: '#44ffff',
        health: 7,                 // 5.74.12 — bumped 4 → 7
        speed: 3.1,                // was 2.5
        size: 38,                  // was 45
        shootPattern: 'charged_laser',
        shootRate: 0.3,
        movePattern: 'arc',
        points: 130,
        movement: {
            pattern: 'arc',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'charged_laser',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 1500, max: 6000 },
        },
        visual: {
            shape: 'stalker_sword',
            glowColor: '#66ffff',
            trailLength: 15,
        },
        ai: {
            evasion: 0.6,
            preferredRange: 200,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    DRIFTER: {
        name: 'Drifter',
        color: '#00ffff',
        health: 9,                 // 5.74.12 — bumped 5 → 9
        speed: 3.1,                // was 2.5
        size: 38,                  // was 45
        shootPattern: 'arc_lightning',
        shootRate: 0.1,
        movePattern: 'drifter_wave',
        points: 180,
        movement: {
            pattern: 'drifter_wave',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'arc_lightning',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 1500, max: 5500 },
        },
        visual: {
            shape: 'laser_turret',
            glowColor: '#44ffff',
            trailLength: 15,
        },
        ai: {
            evasion: 0.45,
            preferredRange: 280,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    PROWLER: {
        name: 'Prowler',
        color: '#ff00ff',
        health: 14,                // 5.74.12 — bumped 8 → 14
        speed: 0.75,               // was 0.6
        size: 45,                  // was 53
        shootPattern: 'missile',
        shootRate: 0.5,
        movePattern: 'keep_distance',
        points: 240,
        movement: {
            pattern: 'keep_distance',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.01, max: 0.01 },
            preferredDistance: 400,
        },
        firing: {
            pattern: 'missile',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 750, max: 3500 },
        },
        visual: {
            shape: 'missile_turret',
            glowColor: '#ff44ff',
            trailLength: 15,
        },
        ai: {
            evasion: 0.3,
            preferredRange: 400,
            dodgeBullets: false,
            microMovements: true,
            fishMotion: true,
        },
    },

    WEAVER: {
        name: 'Weaver',
        color: '#ffff00',
        health: 5,                 // 5.74.12 — bumped 3 → 5
        speed: 2.75,
        size: 32,
        shootPattern: 'spiral_laser',
        shootRate: 1.0,
        movePattern: 'weaver_spinup',
        points: 160,
        movement: {
            pattern: 'weaver_spinup',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.01, max: 0.01 },
            spinUpDuration: 2400,
            arcDashDuration: 3600,
            cooldownDuration: 2600,
        },
        firing: {
            pattern: 'spiral_laser',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 300, max: 1600 },
        },
        visual: {
            shape: 'pulse_turret',
            glowColor: '#ffff44',
            trailLength: 15,
        },
        ai: {
            evasion: 0.6,
            preferredRange: 180,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    SENTINEL: {
        name: 'Sentinel',
        color: '#00ff00',
        health: 10,                // 5.74.12 — bumped 6 → 10
        speed: 2.5,                // was 2.0
        size: 41,                  // was 48
        shootPattern: 'sentinel_sweep',
        shootRate: 1.0,
        movePattern: 'weaver_spinup',
        points: 220,
        movement: {
            pattern: 'weaver_spinup',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.01, max: 0.01 },
            spinUpDuration: 2400,
            arcDashDuration: 3600,
            cooldownDuration: 2600,
        },
        firing: {
            pattern: 'sentinel_sweep',
            burstCount: 8,
            burstDelay: 0,
            cooldown: { min: 1350, max: 5000 },
        },
        visual: {
            shape: 'shield_turret',
            glowColor: '#44ff44',
            trailLength: 15,
        },
        ai: {
            evasion: 0.3,
            preferredRange: 280,
            dodgeBullets: false,
            microMovements: true,
            fishMotion: true,
        },
    },

    TANGERINE: {
        name: 'Bomber',
        color: '#ff8844',
        health: 10,                // 5.74.12 — bumped 6 → 10
        speed: 2.0,                // was 1.6
        size: 45,                  // was 53
        shootPattern: 'lay_mine',
        shootRate: 0.4,
        movePattern: 'chase',
        points: 160,
        movement: {
            pattern: 'chase',
            turnSpeed: 0.12,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'lay_mine',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 1875, max: 7000 },
            mineLifetime: 18000,
        },
        visual: {
            shape: 'spiked_circle',
            glowColor: '#ffaa66',
            trailLength: 15,
        },
        ai: {
            evasion: 0.15,
            preferredRange: 150,
            dodgeBullets: false,
            microMovements: true,
            fishMotion: true,
        },
    },

    TITAN: {
        name: 'Titan',
        color: '#ff44ff',
        health: 20,                // 5.74.12 — bumped 12 → 20 (Titan)
        speed: 1.5,                // was 1.2
        size: 64,                  // was 75 — still the biggest, but smaller
        shootPattern: 'sweep_laser',
        shootRate: 0.15,
        movePattern: 'boulder',
        points: 320,
        movement: {
            pattern: 'boulder',
            turnSpeed: 0.06,       // was 0.04 — still slow for a boss
            rotationSpeed: { min: -0.005, max: 0.005 },
        },
        firing: {
            pattern: 'sweep_laser',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 900, max: 4000 },
            telegraphDuration: 1800,
            sweepAngle: 60,
            sweepDuration: 1600,
        },
        visual: {
            shape: 'titan_tank',
            glowColor: '#ff66ff',
            trailLength: 15,
        },
        ai: {
            evasion: 0.15,
            preferredRange: 300,
            dodgeBullets: false,
            microMovements: false,
            fishMotion: false,
        },
    },
};

// ── ELEMENT TAGS + RESISTANCE MAPS (E1 — Element & Resistance System) ───────
// Each enemy's ATTACK element + its resistance map. Resist values: >0 resist,
// <0 weak, 1 = immune; an absent key (empty map) is neutral. E1 ships NEUTRAL
// defaults (KINETIC attacks, empty resist) so there is ZERO gameplay change;
// E8 fills in the real per-type retrofit. Centralized here for auditability —
// E8 just populates these two tables.
// E8a — the §7.1 retrofit. ATTACK element per type (drives player elemental
// resistance vs that enemy's shots/ram). HUNTER stays neutral Kinetic.
const ENEMY_ELEMENTS = {
    STALKER:   'RADIANT', // charged laser
    DRIFTER:   'VOLT',    // arc lightning
    WEAVER:    'RADIANT', // spiral laser
    SENTINEL:  'RADIANT', // sweep beam
    TANGERINE: 'PYRO',    // explosive mines
    // HUNTER / GUARDIAN / WASP / PROWLER / TITAN → KINETIC baseline
};
// Resistance maps: >0 resists (chip damage wasted), <0 is a weakness (bring
// that element), 1 = immune. Values are moderate starting points for playtest.
// The matching ARCHETYPE behaviors (GUARDIAN flat-armor floor, SENTINEL frontal
// shield, WASP swarm, Warden adaptive, TITAN rotating weak-core) land as
// follow-ups; these maps are the data layer that turns E2/E5/E6 live.
const ENEMY_RESISTS = {
    GUARDIAN:  { KINETIC: 0.30, VOLT: -0.40 },                 // armored; shorts out to Volt
    WASP:      { CRYO: -0.50 },                                // swarm; freeze-shatters
    STALKER:   { RADIANT: 0.50, VOID: -0.40 },                 // laser sniper; folds to Void
    DRIFTER:   { VOLT: 0.60, TOXIC: -0.40 },                   // electric; rots to Toxic
    PROWLER:   { CRYO: 0.40, PYRO: -0.50 },                    // standoff tank; burns down
    WEAVER:    { CRYO: -0.40 },                                // evasive; freeze to land hits
    SENTINEL:  { RADIANT: 0.50, KINETIC: -0.30 },              // bastion; raw kinetic cracks it
    TANGERINE: { PYRO: 0.60, CRYO: -0.40 },                    // bomber; don't fight fire w/ fire
    TITAN:     { KINETIC: 0.30, PYRO: 0.30, CRYO: 0.30, VOLT: 0.30, TOXIC: 0.30, VOID: 0.30, RADIANT: 0.30 }, // boss: tanky all-around (rotating weak-core = later behavior)
    // HUNTER → neutral (no entry)
};
// E8a behavior — flat ARMOR floor: a fixed amount subtracted from every hit
// (down to a 25% floor in applyDamageToEnemy so chip can't be fully nullified).
// Makes many-small-hit weapons fall off and big single hits / CORRODE-amplified
// hits punch through. GUARDIAN is the armored archetype. Read as `enemy.armor`.
const ENEMY_ARMOR = {
    GUARDIAN: 1.0,
};
for (const [key, def] of Object.entries(ENEMY_TYPES)) {
    def.element = ENEMY_ELEMENTS[key] || 'KINETIC';
    def.resist = ENEMY_RESISTS[key] || {};
    def.armor = ENEMY_ARMOR[key] || 0;
}

// ── Convenience Lookups ────────────────────────────────────────────────────

/** All enemy type keys */
export const ENEMY_TYPE_KEYS = Object.keys(ENEMY_TYPES);

/** Shape name → draw method name mapping (for future ShapeRegistry) */
export const SHAPE_DRAW_MAP = {
    triangle:        'drawTriangle',
    emerald_guardian: 'drawEmeraldGuardian',
    wasp_ship:       'drawWaspShip',
    titan_tank:      'drawTitanTank',
    stalker_sword:   'drawStalkerSword',
    spiked_circle:   'drawSpikedCircle',
    laser_turret:    'drawLaserTurret',
    missile_turret:  'drawMissileTurret',
    pulse_turret:    'drawPulseTurret',
    shield_turret:   'drawShieldTurret',
};
