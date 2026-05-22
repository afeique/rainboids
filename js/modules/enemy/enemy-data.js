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

    // ── E8b — New elemental types (Pyro/Cryo batch) ──
    // Built by reusing existing movement/firing/shape patterns (tinted) to stay
    // low-risk without visual playtest. Element/resist set in the retrofit
    // tables below. Signature flourishes (Cinder contact-ignite, Glacier
    // brittle-shatter) are deferred — they need player-side burn + a custom
    // shatter mechanic. For now each is a differentiated element/resist/speed
    // profile that demands the right damage type.

    // Cinder — Pyro fire-swarmer. Reuses WASP zigzag + machinegun + ship shape
    // (tinted fiery). Fast, fragile, swarms (swarmCohesion). Mostly fireproof,
    // Cryo-weak: freeze/shatter the swarm rather than burning it.
    CINDER: {
        name: 'Cinder',
        color: '#ff6622',
        health: 4,
        speed: 3.3,
        size: 30,
        shootPattern: 'wasp_machinegun',
        shootRate: 0.7,
        movePattern: 'wasp_zigzag',
        points: 110,
        movement: { pattern: 'wasp_zigzag', turnSpeed: 0.12, rotationSpeed: { min: -0.02, max: 0.02 } },
        firing: { pattern: 'wasp_machinegun', burstCount: 1, burstDelay: 0, cooldown: { min: 500, max: 2200 } },
        visual: { shape: 'cinder_ember', glowColor: '#ffaa44', trailLength: 15 },
        ai: { evasion: 0.6, preferredRange: 180, dodgeBullets: true, microMovements: true, fishMotion: true },
    },

    // Glacier — slow Cryo tank. Reuses GUARDIAN square movement + spread fire +
    // emerald_guardian shape (tinted ice). High HP, near Cryo-immune, Pyro-weak:
    // burn it down; chip/cryo are wasted.
    GLACIER: {
        name: 'Glacier',
        color: '#88ddff',
        health: 18,
        speed: 1.0,
        size: 50,
        shootPattern: 'guardian_spread',
        shootRate: 0.3,
        movePattern: 'square',
        points: 250,
        movement: { pattern: 'square', turnSpeed: 0.12, rotationSpeed: { min: -0.01, max: 0.01 } },
        firing: { pattern: 'guardian_spread', burstCount: 3, burstDelay: 105, cooldown: { min: 2500, max: 8000 } },
        visual: { shape: 'ice_crystal', glowColor: '#bbf0ff', trailLength: 15 },
        ai: { evasion: 0.2, preferredRange: 320, dodgeBullets: false, microMovements: true, fishMotion: true },
    },

    // Frost Lance — Cryo sniper. Reuses STALKER arc movement + charged_laser +
    // sword shape (tinted ice). Cryo attacks; resists Cryo, weak to Toxic.
    // (CHILL-on-graze flourish deferred — needs player-side chill.)
    FROST_LANCE: {
        name: 'Frost Lance',
        color: '#66ccff',
        health: 7,
        speed: 3.0,
        size: 38,
        shootPattern: 'charged_laser',
        shootRate: 0.3,
        movePattern: 'arc',
        points: 150,
        movement: { pattern: 'arc', turnSpeed: 0.12, rotationSpeed: { min: -0.01, max: 0.01 } },
        firing: { pattern: 'charged_laser', burstCount: 1, burstDelay: 0, cooldown: { min: 1500, max: 6000 } },
        visual: { shape: 'icicle_lance', glowColor: '#bbf0ff', trailLength: 15 },
        ai: { evasion: 0.6, preferredRange: 220, dodgeBullets: true, microMovements: true, fishMotion: true },
    },

    // Ashen Detonator — Pyro bomber that bursts into a flare ON DEATH (damages
    // the player if within `deathFlare.radius`, respecting Pyro resistance), so
    // kill it at range. Reuses HUNTER arc movement + burst + spiked shape
    // (tinted ember). Pyro; resists Pyro, weak to Cryo. (Telegraph deferred.)
    ASHEN_DETONATOR: {
        name: 'Ashen Detonator',
        color: '#ff8844',
        health: 8,
        speed: 2.2,
        size: 36,
        shootPattern: 'hunter_single',
        shootRate: 0.5,
        movePattern: 'hunter_arc',
        points: 160,
        deathFlare: { radius: 130, damage: 12 },
        movement: { pattern: 'hunter_arc', turnSpeed: 0.12, rotationSpeed: { min: -0.01, max: 0.01 } },
        firing: { pattern: 'hunter_single', burstCount: 2, burstDelay: 90, cooldown: { min: 900, max: 3500 } },
        visual: { shape: 'cracked_bomb', glowColor: '#ffaa66', trailLength: 15 },
        ai: { evasion: 0.4, preferredRange: 220, dodgeBullets: true, microMovements: true, fishMotion: true },
    },

    // ── E8c — New elemental types (Volt/Toxic batch) ──

    // Tesla Wraith — Volt skirmisher. Reuses HUNTER arc (fast/erratic) +
    // DRIFTER arc_lightning + laser-turret shape (tinted electric). Near
    // volt-immune, Toxic-weak — corrode it, don't shock it. (Teleport-blink
    // flourish deferred — reads as a fast erratic shooter for now.)
    TESLA_WRAITH: {
        name: 'Tesla Wraith',
        color: '#a855ff',
        health: 6,
        speed: 3.2,
        size: 34,
        shootPattern: 'arc_lightning',
        shootRate: 0.2,
        movePattern: 'hunter_arc',
        points: 150,
        movement: { pattern: 'hunter_arc', turnSpeed: 0.12, rotationSpeed: { min: -0.02, max: 0.02 } },
        firing: { pattern: 'arc_lightning', burstCount: 1, burstDelay: 0, cooldown: { min: 1500, max: 5500 } },
        visual: { shape: 'arc_node', glowColor: '#c890ff', trailLength: 15 },
        ai: { evasion: 0.65, preferredRange: 260, dodgeBullets: true, microMovements: true, fishMotion: true },
    },

    // Plaguebearer — Toxic area-denier. Reuses TANGERINE chase + lay_mine, so
    // it drops Toxic mines (real area-denial via the existing mine system) +
    // spiked shape (tinted toxic). Resists Toxic, weak to Radiant — purge it.
    // (CORRODE-on-the-player acid trails deferred — needs player-side status.)
    PLAGUEBEARER: {
        name: 'Plaguebearer',
        color: '#88dd44',
        health: 11,
        speed: 2.0,
        size: 44,
        shootPattern: 'lay_mine',
        shootRate: 0.4,
        movePattern: 'chase',
        points: 200,
        // A.E10-U3 — leaves a Toxic acid trail (S2 HazardField) as it moves.
        trailHazard: { element: 'TOXIC', radius: 70, dps: 6, lifeMs: 3500, intervalMs: 600 },
        movement: { pattern: 'chase', turnSpeed: 0.12, rotationSpeed: { min: -0.01, max: 0.01 } },
        firing: { pattern: 'lay_mine', burstCount: 1, burstDelay: 0, cooldown: { min: 2000, max: 7000 }, mineLifetime: 18000 },
        visual: { shape: 'plague_sac', glowColor: '#aaff66', trailLength: 15 },
        ai: { evasion: 0.2, preferredRange: 150, dodgeBullets: false, microMovements: true, fishMotion: true },
    },

    // ── E8e — Anti-meta type ──
    // Warden — ADAPTIVE RESIST: it learns whatever element you keep hitting it
    // with (bumps that resist toward a cap on each hit, decaying when you stop),
    // so a one-element build walls itself and you must SWITCH elements (the foil
    // for the whole resistance system + the Prismatic-Soul item trait). `resist`
    // starts empty and is driven entirely by adaptation (a per-spawn copy, safe
    // to mutate). Reuses PROWLER standoff + missile + turret shape (tinted).
    WARDEN: {
        name: 'Warden',
        color: '#cfa8ff',
        health: 16,
        speed: 0.85,
        size: 46,
        shootPattern: 'missile',
        shootRate: 0.4,
        movePattern: 'keep_distance',
        points: 280,
        adaptive: true,
        movement: { pattern: 'keep_distance', turnSpeed: 0.12, rotationSpeed: { min: -0.01, max: 0.01 }, preferredDistance: 400 },
        firing: { pattern: 'missile', burstCount: 1, burstDelay: 0, cooldown: { min: 900, max: 3500 } },
        visual: { shape: 'prism_facet', glowColor: '#e0c8ff', trailLength: 15 },
        ai: { evasion: 0.3, preferredRange: 400, dodgeBullets: false, microMovements: true, fishMotion: true },
    },

    // ── E8e — Bruiser (uses the S3 spawn system) ──
    // Hydra — KINETIC bruiser that SPLITS ON DEATH into 2 half-size/half-HP
    // lings (via requestEnemySpawn in onEnemyKill, gated by splitGen<maxGen so
    // lings don't re-split). Don't let it die in your face. Reuses chase +
    // hunter shot + the blob silhouette (drawPlagueSac).
    HYDRA: {
        name: 'Hydra',
        color: '#7fdf9f',
        health: 14,
        speed: 1.4,
        size: 44,
        shootPattern: 'hunter_single',
        shootRate: 0.4,
        movePattern: 'chase',
        points: 220,
        splitOnDeath: { count: 2, maxGen: 1, healthMul: 0.5, sizeMul: 0.7 },
        movement: { pattern: 'chase', turnSpeed: 0.1, rotationSpeed: { min: -0.01, max: 0.01 } },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 1200, max: 4000 } },
        visual: { shape: 'plague_sac', glowColor: '#aaffbb', trailLength: 12 },
        ai: { evasion: 0.2, preferredRange: 200, dodgeBullets: false, microMovements: true, fishMotion: true },
    },

    // ── E8c — Spawner (uses the S3 spawn system) ──
    // Spore Carrier — Toxic enemy that periodically births WASP drones (via the
    // S3 requestEnemySpawn, capped low so it can't flood). Keeps its distance +
    // lets the swarm do the work; kill the carrier to stop the bleeding. Reuses
    // keep_distance + the sac silhouette.
    SPORE_CARRIER: {
        name: 'Spore Carrier',
        color: '#9fd86f',
        health: 13,
        speed: 1.1,
        size: 46,
        shootPattern: 'hunter_single',
        shootRate: 0.25,
        movePattern: 'keep_distance',
        points: 240,
        spawner: { type: 'WASP', intervalMs: 4000, cap: 16 },
        movement: { pattern: 'keep_distance', turnSpeed: 0.1, rotationSpeed: { min: -0.01, max: 0.01 }, preferredDistance: 360 },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 1600, max: 5000 } },
        visual: { shape: 'plague_sac', glowColor: '#c8ff8f', trailLength: 12 },
        ai: { evasion: 0.4, preferredRange: 360, dodgeBullets: true, microMovements: true, fishMotion: true },
    },

    // ── E8d — Support (uses the S7 ally-aura system) ──
    // Lumen Drone — Radiant support that projects a SHIELD bubble over nearby
    // allies (they take 40% less damage while it lives). Kill the drone first
    // to crack the escort open. Keeps its distance; reuses the shield-turret
    // silhouette. Resists Radiant, weak to Void.
    LUMEN_DRONE: {
        name: 'Lumen Drone',
        color: '#ffd966',
        health: 9,
        speed: 1.6,
        size: 34,
        shootPattern: 'hunter_single',
        shootRate: 0.18,
        movePattern: 'keep_distance',
        points: 220,
        aura: { radius: 180, kind: 'shield', amount: 0.4, intervalMs: 300 },
        movement: { pattern: 'keep_distance', turnSpeed: 0.1, rotationSpeed: { min: -0.01, max: 0.01 }, preferredDistance: 340 },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 1800, max: 5500 } },
        visual: { shape: 'shield_turret', glowColor: '#fff0b0', trailLength: 14 },
        ai: { evasion: 0.5, preferredRange: 340, dodgeBullets: true, microMovements: true, fishMotion: true },
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
    CINDER:    'PYRO',    // E8b — fire swarmer
    GLACIER:   'CRYO',    // E8b — ice tank
    FROST_LANCE: 'CRYO',  // E8b — ice sniper
    ASHEN_DETONATOR: 'PYRO', // E8b — fire bomber
    TESLA_WRAITH: 'VOLT', // E8c — volt skirmisher
    PLAGUEBEARER: 'TOXIC', // E8c — toxic area-denier
    SPORE_CARRIER: 'TOXIC', // E8c — toxic drone spawner
    LUMEN_DRONE: 'RADIANT', // E8d — radiant ally-shield support
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
    CINDER:    { PYRO: 0.85, CRYO: -0.50 },                    // E8b — near-fireproof swarmer; freeze it
    GLACIER:   { CRYO: 0.90, PYRO: -0.50 },                    // E8b — near-cryo-immune tank; burn it
    FROST_LANCE: { CRYO: 0.40, TOXIC: -0.40 },                 // E8b — ice sniper; rots to Toxic
    ASHEN_DETONATOR: { PYRO: 0.50, CRYO: -0.40 },              // E8b — fire bomber; freeze it
    TESLA_WRAITH: { VOLT: 0.85, TOXIC: -0.50 },                // E8c — near volt-immune; corrode it
    PLAGUEBEARER: { TOXIC: 0.60, RADIANT: -0.40 },             // E8c — toxic-tough; purge it w/ Radiant
    SPORE_CARRIER: { TOXIC: 0.50, RADIANT: -0.40 },            // E8c — toxic-tough spawner; Radiant clears it
    LUMEN_DRONE: { RADIANT: 0.50, VOID: -0.40 },               // E8d — radiant-tough support; Void snuffs it
    // HUNTER → neutral (no entry)
};
// E8a behavior — flat ARMOR floor: a fixed amount subtracted from every hit
// (down to a 25% floor in applyDamageToEnemy so chip can't be fully nullified).
// Makes many-small-hit weapons fall off and big single hits / CORRODE-amplified
// hits punch through. GUARDIAN is the armored archetype. Read as `enemy.armor`.
const ENEMY_ARMOR = {
    GUARDIAN: 1.0,
};
// E8a behavior — FRONTAL SHIELD (SENTINEL bastion): hits arriving from the
// player's direction (within `arc` of the enemy→player bearing) are reduced by
// `reduction`; flanking / bounced / returning shots land in full. The player
// must reposition (or use wall-bounce Caroms / returning Boomerang / a pull) to
// crack it. Evaluated in applyDamageToEnemy using the hit point + player pos.
const ENEMY_FRONTAL_SHIELD = {
    SENTINEL: { arc: 2.4, reduction: 0.8 }, // ~137° frontal cone, 80% blocked
};
for (const [key, def] of Object.entries(ENEMY_TYPES)) {
    def.element = ENEMY_ELEMENTS[key] || 'KINETIC';
    def.resist = ENEMY_RESISTS[key] || {};
    def.armor = ENEMY_ARMOR[key] || 0;
    def.frontalShield = ENEMY_FRONTAL_SHIELD[key] || null;
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
    // A.E10-U1 — distinct silhouettes for the 7 new elemental enemy types
    cinder_ember:    'drawCinderEmber',
    ice_crystal:     'drawIceCrystal',
    icicle_lance:    'drawIcicleLance',
    cracked_bomb:    'drawCrackedBomb',
    arc_node:        'drawArcNode',
    plague_sac:      'drawPlagueSac',
    prism_facet:     'drawPrismFacet',
};
