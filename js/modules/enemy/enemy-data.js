// ── Enemy Type Definitions ─────────────────────────────────────────────────
// Data-driven config for all 29 enemy types.
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
        // Archetype: INTERCEPTOR — small/fast dive-bomber.
        brain: {
            mass: 0.8, maxForce: 0.16, maxTurnRate: 0.20, preferredRange: 250,
            evalIntervalMs: 280,
            strategies: ['dive_bomb', 'close_distance', 'orbit', 'regroup'],
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
        // Archetype: BRUTE — big/slow/heavy, closes & rams with wide turns.
        brain: {
            mass: 3.0, maxTurnRate: 0.05, preferredRange: 220,
            strategies: ['close_distance', 'flank', 'regroup'],
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
        // Archetype: SWARMER — tiny/very fast, flocks & overwhelms.
        brain: {
            mass: 0.5, maxForce: 0.18, maxTurnRate: 0.22, preferredRange: 200,
            swarm: true, separationWeight: 0.9, evalIntervalMs: 250,
            strategies: ['dive_bomb', 'close_distance', 'regroup'],
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
        // Archetype: INTERCEPTOR — small/fast dive-bomber.
        brain: {
            mass: 0.9, maxForce: 0.16, maxTurnRate: 0.18, preferredRange: 220,
            strategies: ['dive_bomb', 'orbit', 'kite', 'regroup'],
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
        // Archetype: SNIPER/ARTILLERY — kites at range with lead.
        brain: {
            mass: 1.1, maxForce: 0.10, maxTurnRate: 0.12, preferredRange: 300,
            strategies: ['kite', 'orbit', 'regroup'],
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
        // Archetype: BRUTE — big/slow/heavy, closes & rams with wide turns.
        brain: {
            mass: 3.5, maxTurnRate: 0.04, preferredRange: 200,
            strategies: ['close_distance', 'flank', 'regroup'],
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
        // Archetype: ORBITER — circles at distance.
        brain: {
            mass: 1.0, maxForce: 0.11, maxTurnRate: 0.13, preferredRange: 200,
            strategies: ['orbit', 'kite', 'regroup'],
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
        // Archetype: SNIPER/ARTILLERY — kites at range with lead.
        brain: {
            mass: 1.4, maxForce: 0.09, maxTurnRate: 0.10, preferredRange: 320,
            strategies: ['kite', 'orbit', 'regroup'],
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
        // Archetype: SPECIAL/BOMBER — mine-layer; keeps lay_mine ability.
        brain: {
            mass: 0.9, maxForce: 0.13, maxTurnRate: 0.16, preferredRange: 170,
            strategies: ['dive_bomb', 'close_distance', 'regroup'],
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
        // Archetype: BRUTE — biggest/heaviest, closes & rams with very wide turns.
        brain: {
            mass: 4.0, maxForce: 0.05, maxTurnRate: 0.035, preferredRange: 280,
            strategies: ['close_distance', 'flank', 'regroup'],
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
        // Archetype: SWARMER — tiny/very fast, flocks & overwhelms.
        brain: {
            mass: 0.45, maxForce: 0.18, maxTurnRate: 0.22, preferredRange: 190,
            swarm: true, separationWeight: 0.9, evalIntervalMs: 250,
            strategies: ['dive_bomb', 'close_distance', 'regroup'],
        },
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
        // Archetype: BRUTE — slow ice tank, closes & rams with wide turns.
        brain: {
            mass: 3.5, maxTurnRate: 0.04, preferredRange: 240,
            strategies: ['close_distance', 'flank', 'regroup'],
        },
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
        // Archetype: INTERCEPTOR — small/fast ice dive-bomber.
        brain: {
            mass: 0.9, maxForce: 0.15, maxTurnRate: 0.18, preferredRange: 240,
            strategies: ['dive_bomb', 'orbit', 'regroup'],
        },
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
        // Archetype: SPECIAL/BOMBER — suicide-flare; keeps deathFlare ability.
        brain: {
            mass: 1.0, maxForce: 0.14, maxTurnRate: 0.16, preferredRange: 150,
            strategies: ['close_distance', 'dive_bomb', 'regroup'],
        },
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
        // Archetype: INTERCEPTOR — small/fast volt dive-bomber.
        brain: {
            mass: 0.75, maxForce: 0.17, maxTurnRate: 0.20, preferredRange: 230,
            strategies: ['dive_bomb', 'orbit', 'regroup'],
        },
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
        // Archetype: SPECIAL/BRUISER — acid-trail; keeps trailHazard ability.
        brain: {
            mass: 1.6, maxForce: 0.09, maxTurnRate: 0.10, preferredRange: 240,
            strategies: ['orbit', 'close_distance', 'regroup'],
        },
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
        // Archetype: BRUTE — slow adaptive tank, closes & rams with wide turns.
        brain: {
            mass: 3.2, maxTurnRate: 0.045, preferredRange: 260,
            strategies: ['close_distance', 'flank', 'regroup'],
        },
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
        // Archetype: SPECIAL/BRUISER — splitter; keeps splitOnDeath ability.
        brain: {
            mass: 2.0, maxForce: 0.08, maxTurnRate: 0.09, preferredRange: 220,
            strategies: ['close_distance', 'flank', 'regroup'],
        },
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
        // Archetype: SUPPORT — hangs back; keeps drone spawner ability.
        brain: {
            mass: 2.0, maxForce: 0.07, maxTurnRate: 0.07, preferredRange: 360,
            strategies: ['kite', 'regroup'],
        },
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
        // Archetype: SUPPORT/SHIELDER — hangs back, buffs allies; keeps shield aura.
        brain: {
            mass: 1.3, maxForce: 0.09, maxTurnRate: 0.10, preferredRange: 360,
            strategies: ['kite', 'regroup'],
        },
    },

    // ENMY-08 — CONDUIT_NODE: a slow, stationary-ish Volt SUPPORT that channels
    // energy to MEND nearby allies — the HEAL counterpart to LUMEN_DRONE's SHIELD
    // aura (both ride the SYS-7 ally-aura path in support-aura.js). It projects an
    // `aura: { kind:'heal', ... }` field, so every cadence tick (runAura, ticked
    // from enemy.update) it regenerates the HP of escort enemies inside its
    // radius (clamped to maxHealth). The escort dynamic: "kill the node first or
    // its allies keep mending." A bit beefy (HP 10) so it reads as a priority
    // target; slow + standoff so it hangs back and channels rather than rams. The
    // plain `aura` field is all it needs — initializeEnemy copies config.aura onto
    // the instance (no per-enemy marker/flag) and the update loop auto-ticks it.
    // Volt-themed (electric cyan); resists Volt, weak to Cryo (a freeze locks the
    // channel). A normal killable enemy.
    CONDUIT_NODE: {
        name: 'Conduit Node',
        color: '#5fe0ff',
        health: 10,
        speed: 1.4,
        size: 34,
        shootPattern: 'hunter_single',
        shootRate: 0.15,
        movePattern: 'keep_distance',
        points: 230,
        // HEAL aura: +1 HP per ~650ms tick (~1.5 HP/s) to allies within 170px —
        // a noticeable mend that rewards killing the node, not an escort-lock.
        aura: { radius: 170, kind: 'heal', amount: 1, intervalMs: 650 },
        movement: { pattern: 'keep_distance', turnSpeed: 0.08, rotationSpeed: { min: -0.01, max: 0.01 }, preferredDistance: 340 },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 2000, max: 5600 } },
        visual: { shape: 'shield_turret', glowColor: '#8af0ff', trailLength: 14 },
        ai: { evasion: 0.4, preferredRange: 340, dodgeBullets: true, microMovements: true, fishMotion: true },
        // Archetype: SUPPORT/SHIELDER — hangs back, heals allies; keeps heal aura.
        brain: {
            mass: 1.5, maxForce: 0.08, maxTurnRate: 0.08, preferredRange: 380,
            strategies: ['kite', 'regroup'],
        },
    },

    // ENMY-03 — PHANTOM: light/fast Void skirmisher that runs a visible↔cloaked
    // cycle (cloak.js). While cloaked it fades out + drops off homing/auto-aim
    // targeting; a MARK status or an AoE reveal pins it back onto the target
    // list. The `cloak: true` marker tells initializeEnemy to attach a fresh
    // createCloak() state. A normal killable enemy while visible.
    PHANTOM: {
        name: 'Phantom',
        color: '#9966ff',
        health: 6,
        speed: 3.4,
        size: 34,
        shootPattern: 'hunter_single',
        shootRate: 0.35,
        movePattern: 'arc',
        points: 150,
        cloak: true,                // → initializeEnemy attaches createCloak()
        movement: { pattern: 'arc', turnSpeed: 0.12, rotationSpeed: { min: -0.015, max: 0.015 } },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 1200, max: 4500 } },
        visual: { shape: 'stalker_sword', glowColor: '#bb99ff', trailLength: 15 },
        ai: { evasion: 0.6, preferredRange: 240, dodgeBullets: true, microMovements: true, fishMotion: true },
        // Archetype: INTERCEPTOR — small/fast dive-bomber; keeps cloak ability.
        brain: {
            mass: 0.9, maxForce: 0.15, maxTurnRate: 0.18, preferredRange: 240,
            strategies: ['dive_bomb', 'flank', 'orbit', 'regroup'],
        },
    },

    // ENMY-07 — WRAITHWORM: a Volt burrower (blink-burrow.js). It periodically
    // TELEGRAPHS a wind-up (a contracting ring tell), VANISHES underground, and
    // RE-EMERGES near the player ('burrow'). While vanished it's invisible and
    // drops off homing/auto-aim; on recover/idle it's a normal killable enemy.
    // The `blink: true` marker tells initializeEnemy to attach a fresh
    // createBlink(blinkOpts) state. It can't blink while CHILLED/FROZEN.
    WRAITHWORM: {
        name: 'Wraithworm',
        color: '#5fe0ff',
        health: 9,
        speed: 2.4,
        size: 36,
        shootPattern: 'hunter_single',
        shootRate: 0.30,
        movePattern: 'keep_distance',
        points: 175,
        blink: true,                // → initializeEnemy attaches createBlink(blinkOpts)
        blinkOpts: { kind: 'burrow', intervalMs: 3500, range: 200, windupMs: 520, strikeMs: 120, recoverMs: 340 },
        movement: { pattern: 'keep_distance', turnSpeed: 0.10, rotationSpeed: { min: -0.02, max: 0.02 } },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 1400, max: 4800 } },
        visual: { shape: 'spiked_circle', glowColor: '#8af0ff', trailLength: 16 },
        ai: { evasion: 0.5, preferredRange: 300, dodgeBullets: true, microMovements: true, fishMotion: true },
        // Archetype: SPECIAL/BRUISER — blink/burrow overrides movement when active; brain drives the idle approach.
        brain: {
            mass: 1.6, maxForce: 0.10, maxTurnRate: 0.12, preferredRange: 260,
            strategies: ['flank', 'close_distance', 'regroup'],
        },
    },

    // ENMY-10 — NULL_DRONE: a slow Volt SUPPORT drone (suppress-aura.js). It
    // projects a skill-suppress aura — while the player stands inside, their
    // skill-cooldown REGEN runs at `cooldownScale` speed (slower recharge). It
    // does NOT hard-lock activation (blocksActivation:false — less punishing;
    // "kill the drone to get your tempo back"). The `suppressAura` config is
    // copied onto the instance by initializeEnemy and read each frame by
    // collision-system.applySuppressAura. Low/modest HP + slow + standoff so it
    // hangs back and projects rather than ramming. A normal killable enemy.
    NULL_DRONE: {
        name: 'Null Drone',
        color: '#7a5fff',
        health: 7,
        speed: 1.8,
        size: 32,
        shootPattern: 'hunter_single',
        shootRate: 0.22,
        movePattern: 'keep_distance',
        points: 165,
        suppressAura: { radius: 220, cooldownScale: 0.35, blocksActivation: false },
        movement: { pattern: 'keep_distance', turnSpeed: 0.08, rotationSpeed: { min: -0.012, max: 0.012 }, preferredDistance: 320 },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 1600, max: 5200 } },
        visual: { shape: 'shield_turret', glowColor: '#a98aff', trailLength: 14 },
        ai: { evasion: 0.4, preferredRange: 320, dodgeBullets: true, microMovements: true, fishMotion: true },
        // Archetype: SUPPORT — hangs back, suppresses; keeps suppress aura.
        brain: {
            mass: 1.4, maxForce: 0.08, maxTurnRate: 0.09, preferredRange: 340,
            strategies: ['kite', 'regroup'],
        },
    },

    // ENMY-04 — PRISM_MIRROR: a slow, hovering Radiant enemy with a front-arc
    // MIRROR (reflect.js). A player bullet that strikes inside the front arc is
    // bounced back as an ENEMY bullet — the mirror takes NO damage from the front
    // — so the player must flank it / hit it from the side or rear, or melt it
    // with a beam (beams BYPASS the mirror). The `reflect: true` marker tells
    // initializeEnemy to attach a fresh REFLECT_DEFAULTS-merged config; the front
    // arc faces the player each frame (enemy.update). `reflectOpts` widens the
    // half-angle to ~60° (a 120° face) and sets the bounced bullet's speed.
    // Modest HP, slow standoff hover so it presents its face rather than ramming.
    PRISM_MIRROR: {
        name: 'Prism Mirror',
        color: '#ffd6f5',
        health: 8,
        speed: 1.6,
        size: 34,
        shootPattern: 'hunter_single',
        shootRate: 0.18,
        movePattern: 'keep_distance',
        points: 170,
        reflect: true,             // → initializeEnemy attaches the reflect config
        reflectOpts: { halfAngleRad: Math.PI / 3, range: 120, speed: 7 }, // 120° face, strikes within 120px, speed-7 bounce
        movement: { pattern: 'keep_distance', turnSpeed: 0.07, rotationSpeed: { min: -0.01, max: 0.01 }, preferredDistance: 300 },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 1800, max: 5400 } },
        visual: { shape: 'shield_turret', glowColor: '#ffb0ee', trailLength: 14 },
        ai: { evasion: 0.4, preferredRange: 300, dodgeBullets: true, microMovements: true, fishMotion: true },
        // Archetype: ORBITER — circles at distance; keeps front-arc reflect ability.
        brain: {
            mass: 2.2, maxForce: 0.07, maxTurnRate: 0.07, preferredRange: 300,
            strategies: ['orbit', 'kite', 'regroup'],
        },
    },

    // SYS-4 / ENMY-09 — DEVOURER: a slow, beefy Void DAMAGE-SOAKER with a MAW
    // CONE (projectile-absorb.js). Player bullets that fly into its maw (a wide
    // cone, ~120°, facing the player each frame) are EATEN — they deal NO damage
    // and the devourer banks a small TEMPORARY shield (clamped to maxShield) that
    // soaks incoming damage in the damage path until it lapses. So feeding it
    // shots only walls it harder; the player must instead flank it / hit it from
    // outside the maw cone, melt it with a BEAM (beams BYPASS the maw), or burst
    // it down faster than its banked shield can soak. The `maw: true` marker
    // tells initializeEnemy to attach a fresh MAW_DEFAULTS-merged config; the
    // cone faces the player each frame (enemy.update). High HP + slow standoff so
    // it lumbers in and presents its mouth rather than darting.
    DEVOURER: {
        name: 'Devourer',
        color: '#a060ff',
        health: 28,
        speed: 1.3,
        size: 44,
        shootPattern: 'hunter_single',
        shootRate: 0.14,
        movePattern: 'keep_distance',
        points: 240,
        maw: true,                 // → initializeEnemy attaches the maw config
        // ~60° half-angle (120° mouth), 140px reach, +3 shield/bullet up to 40.
        mawOpts: { halfAngleRad: Math.PI / 3, range: 140, shieldPerBullet: 3, maxShield: 40 },
        movement: { pattern: 'keep_distance', turnSpeed: 0.06, rotationSpeed: { min: -0.008, max: 0.008 }, preferredDistance: 280 },
        firing: { pattern: 'hunter_single', burstCount: 1, burstDelay: 0, cooldown: { min: 2000, max: 5800 } },
        visual: { shape: 'shield_turret', glowColor: '#c08aff', trailLength: 16 },
        ai: { evasion: 0.25, preferredRange: 280, dodgeBullets: false, microMovements: true, fishMotion: true },
        // Archetype: SPECIAL/BRUISER — projectile-eater; keeps maw ability.
        brain: {
            mass: 2.4, maxForce: 0.07, maxTurnRate: 0.07, preferredRange: 240,
            strategies: ['close_distance', 'flank', 'regroup'],
        },
    },

    // SYS-8 / ENMY-05 — LEECH: a FAST, low-HP Toxic HARRIER (buff-strip.js
    // suppression convention). On CONTACT with the player it STRIPS a random
    // active powerup and SUPPRESSES its re-grant for STRIP_DURATION_MS (5s) —
    // so a careless brush with one costs you a buff for a few seconds. The
    // `stripsBuff: true` marker tells initializeEnemy to flag the instance;
    // collision-system.handlePlayerEnemyCollision (the ram-contact handler)
    // reads `enemy.stripsBuff` and calls applyBuffStrip, gated + throttled by a
    // per-Leech `stripCooldownMs` cooldown (contact fires every frame while the
    // ship overlaps, so the cooldown stops it draining everything instantly).
    // Aggressive HOMING movement (it WANTS to touch you) + modest ram damage +
    // very low HP so it reads as a fragile gnat you should swat before it lands.
    LEECH: {
        name: 'Leech',
        color: '#7fff5f',
        health: 5,
        speed: 4.2,
        size: 26,
        shootPattern: 'hunter_single',
        shootRate: 0.0,            // doesn't shoot — it's a contact harrier
        movePattern: 'chase',      // homing pursuit — it WANTS to touch the player
        points: 150,
        stripsBuff: true,          // → initializeEnemy flags the instance
        stripCooldownMs: 1500,     // per-Leech strip throttle (default; explicit for clarity)
        movement: { pattern: 'chase', turnSpeed: 0.14, rotationSpeed: { min: -0.02, max: 0.02 }, preferredDistance: 0 },
        firing: { pattern: 'hunter_single', burstCount: 0, burstDelay: 0, cooldown: { min: 99999, max: 99999 } },
        visual: { shape: 'wasp', glowColor: '#b6ff8a', trailLength: 18 },
        ai: { evasion: 0.2, preferredRange: 0, dodgeBullets: false, microMovements: true, fishMotion: true },
        // Archetype: SPECIAL/HARRIER — fast contact buff-stripper; keeps stripsBuff ability.
        brain: {
            mass: 0.9, maxForce: 0.15, maxTurnRate: 0.18, preferredRange: 200,
            strategies: ['dive_bomb', 'close_distance', 'regroup'],
        },
    },

    // SYS-11 / ENMY-10b — JUGGERNAUT: a Kinetic BRUISER built around a
    // telegraphed CHARGE-AND-RAM (the shared ENMY-01 telegraph helper, the same
    // wind-up→strike→recover machine the bosses use). It approaches at a slow
    // base speed; once within `chargeOpts.range` and off cooldown it WINDS UP a
    // visible tell (the telegraph's `windup`), then COMMITS a fast charge down a
    // LOCKED lane toward where the player was at charge-start (the `strike`),
    // dealing heavy ram damage on contact via the EXISTING player-enemy contact
    // path (enemy.element-on-ram). When the charge ends — it hits the play-area
    // edge or the strike window lapses — it is STUNNED + rear-exposed for the
    // `recover` window (`stunUntil` set so velocity zeroes + firing skips, plus a
    // damage-vulnerability multiplier in applyDamageToEnemy). A read-the-tell
    // fight: dodge the lane during the wind-up, punish during the recovery. The
    // `charge: true` marker tells initializeEnemy to attach a fresh
    // createTelegraph(chargeOpts) on `this.charge`; every AI branch in enemy.js
    // is gated on `this.charge`, so non-Juggernaut enemies are byte-for-byte
    // unchanged. It can't start a charge while STUNNED / FROZEN / CHILLED. Beefy
    // HP (bruiser), moderate size, Kinetic-tough but WEAK to Volt.
    JUGGERNAUT: {
        name: 'Juggernaut',
        color: '#d98c4a',
        health: 18,
        speed: 1.6,                 // slow approach — the THREAT is the charge, not the cruise
        size: 44,
        shootPattern: 'hunter_single',
        shootRate: 0.0,             // doesn't shoot — it's a charge-and-ram bruiser
        movePattern: 'chase',       // base approach (overridden by the charge AI when winding/striking)
        points: 260,
        charge: true,               // → initializeEnemy attaches createTelegraph(chargeOpts) on this.charge
        // windupMs = the visible tell; strikeMs = the committed ram; recoverMs =
        // the stunned/rear-exposed punish window. chargeSpeed = lane speed during
        // the strike; range = how close before it commits; intervalMs = min gap
        // between charges (measured from the last charge start). ramDamage = the
        // heavy contact base used ONLY while striking (gated in collision-system).
        chargeOpts: { intervalMs: 4200, windupMs: 700, strikeMs: 450, recoverMs: 1500, chargeSpeed: 9, range: 480, ramDamage: 38 },
        movement: { pattern: 'chase', turnSpeed: 0.08, rotationSpeed: { min: -0.008, max: 0.008 } },
        firing: { pattern: 'hunter_single', burstCount: 0, burstDelay: 0, cooldown: { min: 99999, max: 99999 } },
        visual: { shape: 'juggernaut_ram', glowColor: '#ffb066', trailLength: 12 },
        ai: { evasion: 0.1, preferredRange: 120, dodgeBullets: false, microMovements: false, fishMotion: false },
        // Archetype: SPECIAL/BRUISER — charge ability overrides movement when active; brain drives the idle approach.
        brain: {
            mass: 3.0, maxForce: 0.06, maxTurnRate: 0.05, preferredRange: 260,
            strategies: ['close_distance', 'regroup'],
        },
    },
    // ENMY-10b — THORNBACK: a Kinetic BRUISER built around a COUNTER-ATTACK. Every
    // damage instance it takes triggers a small RETALIATORY pulse — but ONLY if
    // the player is within a short radius (`thornsOpts.radius`): a little
    // counter-damage back + a ring particle, THROTTLED by `thornsOpts.cooldownMs`
    // so sustained point-blank full-auto applies a steady punish-pulse rather
    // than damage every tick. Fighting from RANGE (outside the radius) draws NO
    // counter, so the read is: stay back / use measured bursts. The counter
    // routes through the SAME player-damage entry point as a contact ram
    // (this.takeDamage), so i-frames / dodge / shield all apply. The `thorns: true`
    // marker tells initializeEnemy to attach a fresh createThorns(thornsOpts) on
    // `this.thorns`; the counter hook in collision-system.applyDamageToEnemy is
    // gated on `enemy.thorns`, so non-Thornback enemies are byte-for-byte
    // unchanged. It is the ENEMY→PLAYER mirror of the player-side RETALIATION
    // pulse (BULWARK). Slow-ish skirmisher, beefy-ish HP, Kinetic-tough but WEAK
    // to Pyro (burn off the thorns).
    THORNBACK: {
        name: 'Thornback',
        color: '#c2566b',
        health: 14,
        speed: 1.8,                 // slow-ish skirmisher — the THREAT is the counter, not the chase
        size: 38,
        shootPattern: 'hunter_single',
        shootRate: 0.0,             // doesn't shoot — it counters
        movePattern: 'keep_distance', // base standoff/approach (reused; no bespoke movement)
        points: 240,
        thorns: true,               // → initializeEnemy attaches createThorns(thornsOpts) on this.thorns
        // radius = the proximity gate (counter only fires within this distance);
        // damage = counter-damage per pulse; cooldownMs = per-burst throttle so
        // sustained full-auto applies a steady punish-pulse, not damage every tick.
        thornsOpts: { radius: 150, damage: 6, cooldownMs: 260 },
        movement: { pattern: 'keep_distance', turnSpeed: 0.06, rotationSpeed: { min: -0.01, max: 0.01 } },
        firing: { pattern: 'hunter_single', burstCount: 0, burstDelay: 0, cooldown: { min: 99999, max: 99999 } },
        visual: { shape: 'thornback', glowColor: '#ff7d97', trailLength: 8 },
        ai: { evasion: 0.15, preferredRange: 180, dodgeBullets: false, microMovements: false, fishMotion: false },
        // Archetype: SPECIAL/BRUISER — counter-attacker; keeps thorns ability.
        brain: {
            mass: 2.8, maxForce: 0.06, maxTurnRate: 0.05, preferredRange: 230,
            strategies: ['close_distance', 'flank', 'regroup'],
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
    CINDER:    'PYRO',    // E8b — fire swarmer
    GLACIER:   'CRYO',    // E8b — ice tank
    FROST_LANCE: 'CRYO',  // E8b — ice sniper
    ASHEN_DETONATOR: 'PYRO', // E8b — fire bomber
    TESLA_WRAITH: 'VOLT', // E8c — volt skirmisher
    PLAGUEBEARER: 'TOXIC', // E8c — toxic area-denier
    SPORE_CARRIER: 'TOXIC', // E8c — toxic drone spawner
    LUMEN_DRONE: 'RADIANT', // E8d — radiant ally-shield support
    CONDUIT_NODE: 'VOLT',   // ENMY-08 — volt ally-HEAL support (channels energy)
    PHANTOM:     'VOID',    // ENMY-03 — cloaking Void skirmisher
    WRAITHWORM:  'VOLT',    // ENMY-07 — blink/burrow Volt skirmisher
    NULL_DRONE:  'VOLT',    // ENMY-10 — skill-suppress Volt support drone
    PRISM_MIRROR: 'RADIANT', // ENMY-04 — front-arc Radiant reflector
    DEVOURER:    'VOID',     // ENMY-09 — maw-cone Void projectile-eater / soaker
    LEECH:       'TOXIC',    // ENMY-05 — fast contact buff-stripper (it siphons / corrodes)
    JUGGERNAUT:  'KINETIC',  // ENMY-10b — charge-and-ram bruiser (its ram IS the kinetic threat)
    THORNBACK:   'KINETIC',  // ENMY-10b — counter-attacking bruiser (its retaliatory pulse is the kinetic threat)
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
    CONDUIT_NODE: { VOLT: 0.45, CRYO: -0.50 },                 // ENMY-08 — Volt-tough heal-channel node; CRYO freezes the channel shut so it can't mend its escort
    PHANTOM:     { VOID: 0.40, RADIANT: -0.50 },               // ENMY-03 — Void-tough cloaker; Radiant lights it up
    WRAITHWORM:  { VOLT: 0.40, CRYO: -0.50 },                  // ENMY-07 — Volt-tough burrower; Cryo CHILLs it so it can't blink away
    NULL_DRONE:  { VOLT: 0.40, RADIANT: -0.50 },               // ENMY-10 — Volt-tough support drone; Radiant snuffs the suppress aura
    PRISM_MIRROR: { RADIANT: 0.50, VOID: -0.50 },              // ENMY-04 — Radiant-tough mirror (bounces its own light back); Void shatters the glass
    DEVOURER:    { VOID: 0.50, RADIANT: -0.50 },               // ENMY-09 — Void-tough maw (it IS the hungry dark); RADIANT light burns through the throat
    LEECH:       { TOXIC: 0.40, PYRO: -0.50 },                 // ENMY-05 — Toxic-tough siphon gnat; PYRO scorches it off you
    JUGGERNAUT:  { KINETIC: 0.45, VOLT: -0.50 },               // ENMY-10b — Kinetic-tough ram bruiser; VOLT shorts its drive (shock it during the recovery)
    THORNBACK:   { KINETIC: 0.45, PYRO: -0.50 },               // ENMY-10b — Kinetic-tough counter bruiser; PYRO burns off its thorns (and outranges the counter while it cooks)
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
    juggernaut_ram:  'drawJuggernautRam', // ENMY-10b — bulky charge bruiser
};
