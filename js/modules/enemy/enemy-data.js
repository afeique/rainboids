// ── Enemy Type Definitions ─────────────────────────────────────────────────
// Data-driven config for all 10 enemy types.
// Each type defines: base stats, movement pattern, firing pattern, visual shape, and AI params.
// Movement/firing/visual keys will be consumed by strategy registries (Phases 6.2–6.4).
// For now, movePattern and shootPattern remain the primary dispatch keys.

export const ENEMY_TYPES = {
    HUNTER: {
        name: 'Hunter',
        color: '#ff4444',        // Red
        health: 16,
        speed: 1.6,
        size: 38,
        shootPattern: 'hunter_single',
        shootRate: 1.5,
        movePattern: 'triangle',
        points: 75,
        // Movement params (consumed by triangleMovement / future MovementRegistry)
        movement: {
            pattern: 'triangle',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        // Firing params (consumed by shoot dispatch / future FiringRegistry)
        firing: {
            pattern: 'hunter_single',
            burstCount: 3,
            burstDelay: 100,       // ms between burst shots
            cooldown: { min: 800, max: 3000 },
        },
        // Visual params (consumed by drawEnemyShape / future ShapeRegistry)
        visual: {
            shape: 'triangle',     // maps to drawTriangle
            glowColor: '#ff6666',
            trailLength: 15,
        },
        // AI behavior params
        ai: {
            evasion: 0.3,
            preferredRange: 250,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    GUARDIAN: {
        name: 'Guardian',
        color: '#44ff44',        // Green
        health: 32,
        speed: 1.0,
        size: 57,
        shootPattern: 'guardian_spread',
        shootRate: 0.3,
        movePattern: 'square',
        points: 120,
        movement: {
            pattern: 'square',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'guardian_spread',
            burstCount: 3,
            burstDelay: 150,
            cooldown: { min: 3000, max: 8000 },
        },
        visual: {
            shape: 'emerald_guardian', // maps to drawEmeraldGuardian
            glowColor: '#66ff66',
            trailLength: 15,
        },
        ai: {
            evasion: 0.2,
            preferredRange: 300,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    WASP: {
        name: 'Wasp',
        color: '#ffff44',        // Yellow
        health: 14,
        speed: 2.8,
        size: 42,
        shootPattern: 'wasp_machinegun',
        shootRate: 0.7,
        movePattern: 'wasp_zigzag',
        points: 60,
        movement: {
            pattern: 'wasp_zigzag',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.02, max: 0.02 }, // Faster rotation
        },
        firing: {
            pattern: 'wasp_machinegun',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 600, max: 2000 },
        },
        visual: {
            shape: 'wasp_ship',    // maps to drawWaspShip
            glowColor: '#ffff66',
            trailLength: 15,
        },
        ai: {
            evasion: 0.5,
            preferredRange: 200,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    STALKER: {
        name: 'Stalker',
        color: '#44ffff',        // Cyan
        health: 20,
        speed: 2.5,
        size: 45,
        shootPattern: 'charged_laser',
        shootRate: 0.3,
        movePattern: 'arc',
        points: 80,
        movement: {
            pattern: 'arc',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'charged_laser',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 2000, max: 6000 },
        },
        visual: {
            shape: 'stalker_sword', // maps to drawStalkerSword
            glowColor: '#66ffff',
            trailLength: 15,
        },
        ai: {
            evasion: 0.4,
            preferredRange: 200,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    DRIFTER: {
        name: 'Drifter',
        color: '#00ffff',        // Cyan
        health: 22,
        speed: 2.5,
        size: 45,
        shootPattern: 'arc_lightning',
        shootRate: 0.1,
        movePattern: 'drifter_wave',
        points: 120,
        movement: {
            pattern: 'drifter_wave',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'arc_lightning',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 2000, max: 5500 },
        },
        visual: {
            shape: 'laser_turret', // maps to drawLaserTurret
            glowColor: '#44ffff',
            trailLength: 15,
        },
        ai: {
            evasion: 0.3,
            preferredRange: 280,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    PROWLER: {
        name: 'Prowler',
        color: '#ff00ff',        // Magenta
        health: 36,
        speed: 0.6,
        size: 53,
        shootPattern: 'missile',
        shootRate: 0.5,
        movePattern: 'keep_distance',
        points: 150,
        movement: {
            pattern: 'keep_distance',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.01, max: 0.01 },
            preferredDistance: 400,
        },
        firing: {
            pattern: 'missile',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 1000, max: 3500 },
        },
        visual: {
            shape: 'missile_turret', // maps to drawMissileTurret
            glowColor: '#ff44ff',
            trailLength: 15,
        },
        ai: {
            evasion: 0.2,
            preferredRange: 400,
            dodgeBullets: false,
            microMovements: true,
            fishMotion: true,
        },
    },

    WEAVER: {
        name: 'Weaver',
        color: '#ffff00',        // Yellow
        health: 16,
        speed: 2.2,
        size: 38,
        shootPattern: 'spiral_laser',
        shootRate: 1.0,
        movePattern: 'weaver_spinup',
        points: 100,
        movement: {
            pattern: 'weaver_spinup',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.01, max: 0.01 },
            // Weaver three-phase timing (ms)
            spinUpDuration: 2400,
            arcDashDuration: 3600,
            cooldownDuration: 2600,
        },
        firing: {
            pattern: 'spiral_laser',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 400, max: 1600 },
        },
        visual: {
            shape: 'pulse_turret', // maps to drawPulseTurret
            glowColor: '#ffff44',
            trailLength: 15,
        },
        ai: {
            evasion: 0.4,
            preferredRange: 180,
            dodgeBullets: true,
            microMovements: true,
            fishMotion: true,
        },
    },

    SENTINEL: {
        name: 'Sentinel',
        color: '#00ff00',        // Green
        health: 28,
        speed: 2.0,
        size: 48,
        shootPattern: 'sentinel_sweep',
        shootRate: 1.0,
        movePattern: 'weaver_spinup',
        points: 140,
        movement: {
            pattern: 'weaver_spinup',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.01, max: 0.01 },
            // Sentinel uses same spin-up pattern as Weaver
            spinUpDuration: 2400,
            arcDashDuration: 3600,
            cooldownDuration: 2600,
        },
        firing: {
            pattern: 'sentinel_sweep',
            burstCount: 8,         // 8 bullets in circle burst
            burstDelay: 0,
            cooldown: { min: 1800, max: 5000 },
        },
        visual: {
            shape: 'shield_turret', // maps to drawShieldTurret
            glowColor: '#44ff44',
            trailLength: 15,
        },
        ai: {
            evasion: 0.2,
            preferredRange: 280,
            dodgeBullets: false,
            microMovements: true,
            fishMotion: true,
        },
    },

    TANGERINE: {
        name: 'Bomber',
        color: '#ff8844',        // Orange
        health: 24,
        speed: 1.6,
        size: 53,
        shootPattern: 'lay_mine',
        shootRate: 0.4,
        movePattern: 'chase',
        points: 100,
        movement: {
            pattern: 'chase',
            turnSpeed: 0.08,
            rotationSpeed: { min: -0.01, max: 0.01 },
        },
        firing: {
            pattern: 'lay_mine',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 2500, max: 7000 },
            mineLifetime: 18000,   // 18 seconds
        },
        visual: {
            shape: 'spiked_circle', // maps to drawSpikedCircle
            glowColor: '#ffaa66',
            trailLength: 15,
        },
        ai: {
            evasion: 0.1,
            preferredRange: 150,
            dodgeBullets: false,
            microMovements: true,
            fishMotion: true,
        },
    },

    TITAN: {
        name: 'Titan',
        color: '#ff44ff',        // Magenta
        health: 60,
        speed: 1.2,
        size: 75,
        shootPattern: 'sweep_laser',
        shootRate: 0.15,
        movePattern: 'boulder',
        points: 200,
        movement: {
            pattern: 'boulder',
            turnSpeed: 0.04,       // Slower turn for large boss
            rotationSpeed: { min: -0.005, max: 0.005 },
        },
        firing: {
            pattern: 'sweep_laser',
            burstCount: 1,
            burstDelay: 0,
            cooldown: { min: 1200, max: 4000 },
            // Sweep laser params
            telegraphDuration: 1800, // 1.8s warning arc
            sweepAngle: 60,          // ±60° rotation
            sweepDuration: 1600,     // 1.6s sweep
        },
        visual: {
            shape: 'titan_tank',   // maps to drawTitanTank
            glowColor: '#ff66ff',
            trailLength: 15,
        },
        ai: {
            evasion: 0.1,
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
