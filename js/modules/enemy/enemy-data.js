// ── Enemy Type Definitions ─────────────────────────────────────────────────
// Data-driven config for all 10 enemy types.
// Each type defines: base stats, movement pattern, firing pattern, visual shape, and AI params.
// Movement/firing/visual keys will be consumed by strategy registries (Phases 6.2–6.4).
// For now, movePattern and shootPattern remain the primary dispatch keys.

export const ENEMY_TYPES = {
    HUNTER: {
        name: 'Hunter',
        color: '#ff4444',
        health: 6,                 // was 12 (-50%)
        speed: 2.0,                // was 1.6 (+25%)
        size: 32,                  // was 38  (-15%, harder to hit)
        shootPattern: 'hunter_single',
        shootRate: 1.5,
        movePattern: 'triangle',
        points: 75,
        movement: {
            pattern: 'triangle',
            turnSpeed: 0.12,       // was 0.08 (+50%, sharper pivots)
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'hunter_single',
            burstCount: 3,
            burstDelay: 70,        // was 100 (-30%, faster bursts)
            cooldown: { min: 600, max: 3000 }, // min was 800
        },
        visual: {
            shape: 'triangle',
            glowColor: '#ff6666',
            trailLength: 15,
        },
        ai: {
            evasion: 0.45,         // was 0.3 (+50%)
            preferredRange: 250,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    GUARDIAN: {
        name: 'Guardian',
        color: '#44ff44',
        health: 12,                // was 24 (-50%)
        speed: 1.25,               // was 1.0 (+25%)
        size: 48,                  // was 57 (-15%)
        shootPattern: 'guardian_spread',
        shootRate: 0.3,
        movePattern: 'square',
        points: 120,
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
        health: 5,                 // was 11 (-55%)
        speed: 3.5,                // was 2.8
        size: 36,                  // was 42
        shootPattern: 'wasp_machinegun',
        shootRate: 0.7,
        movePattern: 'wasp_zigzag',
        points: 60,
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
        health: 7,                 // was 15 (-53%)
        speed: 3.1,                // was 2.5
        size: 38,                  // was 45
        shootPattern: 'charged_laser',
        shootRate: 0.3,
        movePattern: 'arc',
        points: 80,
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
        health: 8,                 // was 17 (-53%)
        speed: 3.1,                // was 2.5
        size: 38,                  // was 45
        shootPattern: 'arc_lightning',
        shootRate: 0.1,
        movePattern: 'drifter_wave',
        points: 120,
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
        health: 13,                // was 27 (-52%)
        speed: 0.75,               // was 0.6
        size: 45,                  // was 53
        shootPattern: 'missile',
        shootRate: 0.5,
        movePattern: 'keep_distance',
        points: 150,
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
        health: 6,                 // was 12 (-50%)
        speed: 2.75,               // was 2.2
        size: 32,                  // was 38
        shootPattern: 'spiral_laser',
        shootRate: 1.0,
        movePattern: 'weaver_spinup',
        points: 100,
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
        health: 10,                // was 21 (-52%)
        speed: 2.5,                // was 2.0
        size: 41,                  // was 48
        shootPattern: 'sentinel_sweep',
        shootRate: 1.0,
        movePattern: 'weaver_spinup',
        points: 140,
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
        health: 9,                 // was 18 (-50%)
        speed: 2.0,                // was 1.6
        size: 45,                  // was 53
        shootPattern: 'lay_mine',
        shootRate: 0.4,
        movePattern: 'chase',
        points: 100,
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
        health: 22,                // was 45 (-51%)
        speed: 1.5,                // was 1.2
        size: 64,                  // was 75 — still the biggest, but smaller
        shootPattern: 'sweep_laser',
        shootRate: 0.15,
        movePattern: 'boulder',
        points: 200,
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
