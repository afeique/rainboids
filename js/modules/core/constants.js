// Game constants and configuration
export const GAME_CONFIG = {
    // Game field dimensions (fixed logical resolution)
    FIELD_WIDTH: 1920,
    FIELD_HEIGHT: 1080,

    SHIP_SIZE: 30,
    SHIP_THRUST: 0.12,
    SHIP_FRICTION: 0.993,
    MAX_V: 7 * (30 / 60),              // Scaled from 7 px/tick @30Hz
    BULLET_SPEED: 16 * (30 / 60),    // Scaled from 16 px/tick @30Hz
    INITIAL_AST_COUNT: 1, // Minimal asteroid count for best performance
    AST_SPEED: 3.5 * (30 / 60),       // Scaled from 3.5 px/tick @30Hz
    MAX_WAVE_ASTEROIDS: 16, // Hard cap raised for the bullet-hell density pass
    COLOR_STAR_COUNT: 25, // Increased for visual appeal while maintaining performance
    BACKGROUND_STAR_COUNT: 30, // Increased for richer starfield while maintaining performance
    ACTIVE_STAR_ATTR: 0.01,
    ACTIVE_STAR_ATTRACT_DIST: 100,
    ORB_FRIC: 0.92, // Increased friction to slow down money and health orbs
    
    // Health Orb Configuration (renamed from health stars)
    // 5.88.5 — drops bumped + heal amounts widened for the energy-tank
    // hit model. With no automatic post-hit invuln (5.88.0), the player
    // takes hits more frequently; the old 1-2 HP / 60s cooldown / 0.40
    // drop rate pushed the rest-state HP curve into "always one bullet
    // away from a tank loss" territory. New numbers raise the steady
    // state to about half-tank-burn-per-wave instead of full-tank.
    HEALTH_ORB_HEAL_AMOUNT_MIN: 4, // 1 → 4 (5.88.5)
    HEALTH_ORB_HEAL_AMOUNT_MAX: 8, // 2 → 8 (5.88.5)
    HEALTH_ORB_BASE_DROP_RATE: 0.70, // 0.40 → 0.70 (5.88.5)
    HEALTH_ORB_BASE_DROP_COUNT_MAX: 1, // Legacy field — health drops are now exactly one orb (5.79.27).
    HEALTH_ORB_COLLECTION_RADIUS: 22, // 15 → 22 (5.88.5) — wider scoop matches the longer magnet range
    // 5.79.32 — Health orbs sized to MATCH gold shape orbs (8-16 px).
    HEALTH_ORB_SIZE_MIN: 8,   // Pixel radius for a 1-heal orb.
    HEALTH_ORB_SIZE_MAX: 18,  // Pixel radius for a full-cap heal orb. 16 → 18 to track the heal range bump.
    HEALTH_ORB_MAX_HEAL_PER_ORB: 8, // 2 → 8 (5.88.5) — re-anchors the size scaling to the new max heal.

    // Money Orb Configuration — gold drops are a "few shape orbs +
    //   many pixel particles" mix (5.79.27). Two distinct visual
    //   tiers share the gold color but differ in size and shape:
    //     SHAPE — full visual treatment, picks from the WebGL star
    //             shape pool (incl. 3D solids), chunky orb size.
    //     PIXEL — tiny gold dot, simple, many per drop.
    MONEY_ORB_MONEY_AMOUNT_MIN: 10, // Min legacy per-orb amount, used by avgMoney calc.
    MONEY_ORB_MONEY_AMOUNT_MAX: 20, // Max legacy per-orb amount, used by avgMoney calc.
    MONEY_ORB_BASE_DROP_RATE: 0.65, // 5.74.2 — bumped 0.45 → 0.65
    MONEY_ORB_BASE_DROP_COUNT_MAX: 1, // Maximum BASE orbs (drives drop budget; not the visible orb count).
    MONEY_ORB_COLLECTION_RADIUS: 15, // Extra pixels added to collection radius
    // Shape orbs — chunky, value-scaled. EXACTLY 1 per drop now (5.79.31).
    //   Was 1-2 with a "big drop" exception that let two chunky orbs
    //   pile on top of each other; user wanted a single homing piece
    //   surrounded by a coin shower instead.
    MONEY_ORB_SHAPE_SIZE_MIN: 8,    // Pixel radius for a 1g shape orb.
    MONEY_ORB_SHAPE_SIZE_MAX: 16,   // Pixel radius at SHAPE_VALUE_MAX (was 24, lighter footprint).
    MONEY_ORB_SHAPE_VALUE_MAX: 80,  // Per-shape-orb value cap — bumped so the single shape can carry more of the budget.
    // Pixel particles — 1.5-3 px gold coins (5.79.31). Was 1-2 px and
    //   read as ambient sparkle rather than coins; bumped so the
    //   shower actually looks like dropped currency.
    MONEY_ORB_PIXEL_SIZE_MIN: 1.5,  // Pixel radius for a tiny gold coin.
    MONEY_ORB_PIXEL_SIZE_MAX: 3.0,  // Pixel radius at the upper end of the coin.
    MONEY_ORB_PIXEL_COUNT_MAX: 30,  // Hard cap on pixel particles per drop (5.79.31, was 15).
    // Hard ceiling on the per-drop money budget — defense against
    //   the runaway compounding multipliers documented in 5.79.26.
    //   With the new visual layout (1 shape + ≤30 pixels) this
    //   keeps the drop event from delivering more than ~250g.
    MONEY_ORB_DROP_BUDGET_MAX: 250,
    // 6.18.0 — Boss drops get a higher cap so platinum-tier shapes can
    //   actually fire. Normal kills cap at 250; boss kills at 600.
    MONEY_ORB_DROP_BUDGET_MAX_BOSS: 600,

    // 5.78.2 — Orb-drop "*_UPGRADE" constants and MEDPACK / PAYDAY /
    // DOCTOR / HIGH_ROLLER per-stack constants removed alongside the
    // DROPS-category powerups. Drop rate, quantity, and per-orb amount
    // now scale uniformly with player level (see combat-manager.js).

    // Health Orb Drop Cooldown (global throttle so health drops don't trivialize the game)
    // 5.88.5 — cooldown roughly halved alongside the drop-rate + heal-amount
    // bump so health drops actually keep up with sustained combat.
    HEALTH_DROP_COOLDOWN_BASE: 25000, // 60s → 25s
    HEALTH_DROP_COOLDOWN_REDUCTION_PER_STACK: 2500, // 5s → 2.5s (smaller absolute, similar % impact on the new base)
    HEALTH_DROP_COOLDOWN_MIN: 12000, // 30s → 12s (reached at ~5 Triage stacks)

    // 6.0.0 — Desperation curve. Multiplier on health-drop chance =
    //   1 + k × (1 - hp/maxHp)². Quadratic so the boost is gentle at
    //   half HP and aggressive at low HP. TRIAGE_SURGE powerup adds to k.
    //     At 100% HP: ×1.0 (no-op).
    //     At  50% HP: ×1.375 (base k=1.5)
    //     At  25% HP: ×1.844
    //     At  10% HP: ×2.215
    HEALTH_DROP_DESPERATION_K_BASE: 1.5,
    HEALTH_DROP_DESPERATION_K_PER_STACK: 1.0,

    ENEMY_BULLET_ASTEROID_DAMAGE: 1, // Damage enemy bullets deal to asteroids
    MIN_AST_RAD: 15,
    
    // Entity limits adjusted for gameplay balance
    MAX_ASTEROIDS: 16, // Concurrent cap raised for bullet-hell density
    
    // Wave system configuration - aggressive timing for continuous action
    WAVE_ASTEROID_DELAY: 0, // Time before spawning asteroids (ms)
    WAVE_ENEMY_DELAY: 2000, // Time before first enemy sub-wave (ms) - reduced from 15s
    SUB_WAVE_INTERVAL: 3000, // Time between enemy sub-waves (ms) - reduced from 15s
    ENEMIES_PER_SUB_WAVE: 1, // Enemies per sub-wave - reduced for performance
    SUB_WAVES_PER_WAVE: 4, // Number of enemy sub-waves per wave - increased from 3
    SUB_WAVE_TIMEOUT: 20000, // Auto-progress sub-wave after 20 seconds (ms) - reduced from 2 minutes
    WAVE_BREAK_TIME: 10000, // Time between waves (ms)
    
    // Performance settings optimized
    MAX_PARTICLES: 2500, // 6.16.1 — INITIAL capacity, not a hard cap. The WebGL instance buffer + Float32Array are sized for this on boot; both grow on-demand (doubling) when active particles exceed it. The pool itself also grows freely (cap eviction removed) so a wave-clear's worth of explosion sub-particles can't push earlier ones out of the render queue. Memory bounded by the actual peak (~3000 during simultaneous big-bangs).

    // 5.64.16 — WebGL starfield. Background stars + simple-shape decorative
    // color stars render via a single instanced draw call on the glCanvas.
    // Twinkle / parallax / rotation all happen in the vertex shader, so
    // per-star CPU cost drops to near-zero — letting us render orders of
    // magnitude more stars than the Canvas2D path.
    WEBGL_STAR_BUFFER_SIZE: 4000,         // hard cap on instances in the GL VBO
    WEBGL_BACKGROUND_STAR_MULTIPLIER: 6,  // multiplier on BACKGROUND_STAR_COUNT when WebGL is active
    WEBGL_COLOR_STAR_MULTIPLIER: 3,       // multiplier on COLOR_STAR_COUNT when WebGL is active
    // Set to true to keep complex Canvas2D fallbacks (sparkle/burst stars,
    // collectible orbs) on Canvas. Set to false to disable Canvas star
    // drawing entirely — pure-WebGL pass for max perf, but loses the
    // animated sparkle/burst silhouettes.
    WEBGL_STARFIELD_KEEP_CANVAS_FALLBACKS: true,
    PARTICLE_CLEANUP_INTERVAL: 30, // More frequent cleanup for better performance

    // Temporal settings
    LOGIC_HZ: 60,                        // Logic tick rate (Hz)
    LOGIC_TICK_MS: 1000 / 60,            // Milliseconds per logic tick
    TICK_SCALE: 30 / 60,                 // Scale factor for frame-based timers calibrated at 30Hz
};

// Enemy Bullet Configuration
export const ENEMY_BULLET_CONFIG = {
    // Global bullet speed scaling
    BASE_SPEED_MULTIPLIER: 1.05, // Level-1 bullets already feel snappy (was 0.85)
    LEVEL_SPEED_BONUS_PER_LEVEL: 0.10, // 10% per level (was 8%)
    MAX_LEVEL_SPEED_BONUS: 0.6, // Caps at +60% at level 7+ (was 40%)
    
    // Global bullet range/lifetime scaling
    BASE_LIFE_MULTIPLIER: 1.0, // Base bullet lifetime multiplier
    LEVEL_LIFE_BONUS_PER_LEVEL: 0.05, // 5% range increase per level
    MAX_LEVEL_LIFE_BONUS: 0.3, // Maximum 30% range increase (reached at level 7+)
    
    // Missile-specific configuration
    MISSILE: {
        // Titan accelerating missiles
        TITAN_ROCKET: {
            SPEED: 8.0, // Fast, direct rockets
            MAX_DISTANCE: 600, // Medium range
            DAMAGE: 3, // High damage
        },

        // Titan tomahawk — slow-launch purple missile that accelerates
        // along its launch heading. Referenced by shootMissile()'s TITAN
        // branch; was missing entirely (undefined → throw / no-op).
        TITAN_TOMAHAWK: {
            INITIAL_SPEED: 1.5, // very slow launch (matches "very slow initial speed")
            ACCELERATION: 0.12, // px/frame² ramp
            MAX_SPEED: 9.0,
            DAMAGE: 3,
        },
        
        // Missile turret decelerating missiles (Prowler rockets)
        PROWLER_PIKE: {
            INITIAL_SPEED: 10.0, // Much faster start for better effectiveness
            DECELERATION: 0.06, // Slower deceleration to maintain speed longer
            MIN_SPEED: 0.5, // Higher minimum speed
            MAX_DISTANCE: 800, // Limited to ~1 screen range (reduced from 1500)
            MIN_DECELERATION: 0.04, // Minimum deceleration at level 1
            MAX_DECELERATION: 0.08, // Maximum deceleration at high levels
            MIN_INITIAL_SPEED: 8.0, // Higher minimum initial speed at level 1
            MAX_INITIAL_SPEED: 12.0, // Higher maximum initial speed at high levels
        }
    },
    
    // Bullet type speed limits
    SPEED_LIMITS: {
        AIMED: { MIN: 2.0, MAX: 6.0 },
        SPREAD: { MIN: 1.5, MAX: 4.5 },
        RAPID: { MIN: 3.0, MAX: 7.0 },
        SPIRAL: { MIN: 1.5, MAX: 4.0 },
        BURST: { MIN: 1.5, MAX: 4.0 },
        EXPLOSIVE: { MIN: 2.0, MAX: 5.0 },
        LASER: { MIN: 8.0, MAX: 15.0 },
        PULSE: { MIN: 3.0, MAX: 7.0 },
        SHIELD_BURST: { MIN: 2.0, MAX: 5.0 },
        HOMING: { MIN: 1.0, MAX: 3.0 },
        TITAN_ROCKET: { MIN: 6.0, MAX: 12.0 }, // Fast rocket speed limits
    },
    
    // Bullet type lifetime limits (in seconds) - all limited to ~1 screen travel distance
    LIFETIME_LIMITS: {
        AIMED: { MIN: 1.0, MAX: 1.5 }, // Reduced from 1.5-3.0
        SPREAD: { MIN: 0.8, MAX: 1.2 }, // Reduced from 1.2-2.5
        RAPID: { MIN: 0.8, MAX: 1.2 }, // Reduced from 1.0-2.0
        SPIRAL: { MIN: 1.0, MAX: 1.5 }, // Reduced from 2.0-4.0
        BURST: { MIN: 0.8, MAX: 1.2 }, // Reduced from 1.0-2.0
        EXPLOSIVE: { MIN: 1.0, MAX: 1.5 }, // Reduced from 1.5-3.0
        LASER: { MIN: 0.6, MAX: 1.0 }, // Reduced from 0.6-1.2
        PULSE: { MIN: 0.8, MAX: 1.2 }, // Reduced from 1.2-2.5
        SHIELD_BURST: { MIN: 1.0, MAX: 1.5 }, // Reduced from 1.5-3.0
        HOMING: { MIN: 1.2, MAX: 2.0 }, // Reduced from 3.0-6.0
        CRESCENT_SLICE: { MIN: 0.08, MAX: 0.12 }, // Drastically reduced for close-range attack only
        TITAN_ROCKET: { MIN: 1.0, MAX: 2.0 }, // Medium range for Titan rockets
    },
    
    // Enemy firing rate cooldowns (in milliseconds)
    // MIN = fast (high level), MAX = slow (level 1 — dumb punching bags)
    ENEMY_FIRING_COOLDOWNS: {
        HUNTER: { MIN: 600, MAX: 2200 },        // 5.80.x — burst shooter (3-shot rapid bursts via handleBurstShooting)
        GUARDIAN: { MIN: 3000, MAX: 8000 },     // Slow but devastating
        WASP: { MIN: 600, MAX: 2000 },          // Rapid pulse shooter
        TITAN: { MIN: 1200, MAX: 4000 },        // Tank missiles
        STALKER: { MIN: 2000, MAX: 6000 },      // Charged laser
        TANGERINE: { MIN: 2500, MAX: 7000 },    // Slow homing missiles
        DRIFTER: { MIN: 2000, MAX: 5500 },      // Laser turret
        PROWLER: { MIN: 1000, MAX: 3500 },      // Missile turret
        WEAVER: { MIN: 400, MAX: 1600 },        // Rapid pulse turret
        SENTINEL: { MIN: 1800, MAX: 5000 },     // Shield burst turret
    }
};

// Enemy firing rate scaling function
export function getEnemyFiringCooldown(enemyType, level) {
    const cooldowns = ENEMY_BULLET_CONFIG.ENEMY_FIRING_COOLDOWNS[enemyType];
    if (!cooldowns) {
        // Default cooldown if enemy type not found
        return 2000;
    }
    
    // Scale from MAX cooldown at level 1 to MIN cooldown at high levels
    const levelProgress = Math.min(1, (level - 1) / 9); // Normalize over 10 levels
    const cooldown = cooldowns.MAX - (cooldowns.MAX - cooldowns.MIN) * levelProgress;
    return Math.round(cooldown);
}

export const NOISE_CONFIG = {
    // General settings
    DENSITY_MULTIPLIER: 2.5, // Overall control of star density
    
    // Galaxy pattern settings
    GALAXY_CENTERS: [
        { x: 0.25, y: 0.3, intensity: 0.8, spiralTightness: 0.15, haloRadius: 0.4 },
        { x: 0.75, y: 0.7, intensity: 0.9, spiralTightness: 0.12, haloRadius: 0.35 },
        { x: 0.15, y: 0.8, intensity: 0.7, spiralTightness: 0.18, haloRadius: 0.3 },
        { x: 0.85, y: 0.2, intensity: 0.6, spiralTightness: 0.2, haloRadius: 0.25 }
    ],
    SPIRAL_ARMS: 2, // Number of spiral arms per galaxy
    SPIRAL_AMPLITUDE: 0.4, // How much spiral pattern affects density
    HALO_AMPLITUDE: 0.6, // How much halo pattern affects density
    
    // Far Layer (z < 0.6): Large, sparse galactic structures
    FAR_LAYER: {
        FBM_SCALE: 0.0008,
        FBM_OCTAVES: 5,
        FBM_PERSISTENCE: 0.45,
        FBM_LACUNARITY: 2.1,
        FBM_WEIGHT: 0.7,

        WORLEY_SCALE: 0.002,
        WORLEY_WEIGHT: 0.5,
    },

    // Mid Layer (0.6 <= z < 2.0): Denser regions, smaller clusters
    MID_LAYER: {
        FBM_SCALE: 0.0015,
        FBM_OCTAVES: 4,
        FBM_PERSISTENCE: 0.5,
        FBM_LACUNARITY: 2.0,
        FBM_WEIGHT: 0.6,

        WORLEY_SCALE: 0.008,
        WORLEY_WEIGHT: 0.3,
    },

    // Near Layer (z >= 2.0): Fine-grained, subtle clustering
    NEAR_LAYER: {
        FBM_SCALE: 0.005,
        FBM_OCTAVES: 3,
        FBM_PERSISTENCE: 0.6,
        FBM_LACUNARITY: 2.0,
        FBM_WEIGHT: 0.8,

        WORLEY_SCALE: 0.02,
        WORLEY_WEIGHT: 0.1,
    }
};

// 5.74.13 — colorful starfield pass. Palette expanded from 8 cool pastels
// to 18 entries spanning the full nebula gamut (violet, magenta, hot pink,
// electric blue, neon cyan, emerald, lime, gold, amber). Bumped saturation
// across the board so the WebGL color/brightness gain in the starfield
// shader registers as a *burst* of color rather than a uniform pastel
// wash. Sampled uniformly for shape stars, so every silhouette has a
// chance to land on a saturated hue.
export const NORMAL_STAR_COLORS = [
    // Cool blues / cyans
    '#7da9ff', '#52d6ff', '#3effff', '#5cf2c8',
    // Purples / pinks
    '#b87dff', '#d65cff', '#ff66e0', '#ff5cad',
    // Warms
    '#ffd75c', '#ffb347', '#ff7e5c', '#ff5c5c',
    // Greens
    '#5cff9d', '#9eff5c', '#bdff52',
    // Pastels (kept for variety)
    '#a6b3ff', '#a6f3e8', '#c3a6ff'
];

export const GAME_STATES = {
    TITLE_SCREEN: 'TITLE_SCREEN',
    // Phase R2 — pre-run meta screens. NEW GAME routes TITLE → ARMORY →
    // (LOADOUT) → run; CONTINUE resumes mid-run and skips both.
    ARMORY: 'ARMORY',
    LOADOUT: 'LOADOUT',
    // 6.157.0 — cosmetic ship-skin selector, opened from the title screen.
    HANGAR: 'HANGAR',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
    GAME_COMPLETE: 'GAME_COMPLETE',
    WAVE_TRANSITION: 'WAVE_TRANSITION',
    ORIENTATION_LOCK: 'ORIENTATION_LOCK',
    SHOP: 'SHOP'
};

// 6.1.0 — Stage system. The 30-wave campaign is now structured as
// 10 STAGES of 3 waves each. Wave is the source of truth internally;
// stage + sub-wave are derived. Stage final = boss = free survivor
// card on clear. Mid-stage waves get just a brisk WAVE CLEAR toast.
//
// Display format: "1-1", "1-2", "1-3", "2-1", ... "10-3".
//
// Survivor-card economy: 1 free pick per stage clear × 10 stages = 10
// picks per playthrough (same total budget as the pre-6.1.0 "every 3rd
// wave" cadence, just renamed and aligned with the boss waves).
export const MAX_WAVES = 30;
export const WAVES_PER_STAGE = 3;
export const MAX_STAGES = MAX_WAVES / WAVES_PER_STAGE; // 10
// Bosses live on stage finals (was [5,10,15,20,25,30] in 6.0.x).
// Every stage now ends with a boss; +67% boss density vs pre-6.1.0.
export const BOSS_WAVES = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];
// Kept as 3 (was 5) so any legacy consumers reading this constant
// produce sensible defaults under the new cadence.
export const BOSS_WAVE_INTERVAL = WAVES_PER_STAGE;

// Stage / sub-wave helpers — pure functions on wave number.
export function getStage(wave) {
    return Math.ceil(Math.max(1, wave | 0) / WAVES_PER_STAGE);
}
export function getSubWaveIndex(wave) {
    return ((Math.max(1, wave | 0) - 1) % WAVES_PER_STAGE) + 1; // 1..3
}
export function isStageClear(wave) {
    return (wave | 0) > 0 && ((wave | 0) % WAVES_PER_STAGE) === 0;
}
export function getStageLabel(wave) {
    return `${getStage(wave)}-${getSubWaveIndex(wave)}`;
}

// 5.71.0 — Speedrun completion tiers. Finishing the 20-wave campaign
// faster awards a bigger score multiplier on the Game Complete stats
// screen. Tiers are evaluated top-down — first row whose `maxMs` the
// run beats wins. The TIMER shop tab renders this table as a
// reference card so players know what they're chasing.
export const SPEEDRUN_TIERS = [
    { label: 'GODLIKE',    maxMs:  5 * 60 * 1000, multiplier: 5.0, color: '#ff66cc' },
    { label: 'LEGENDARY',  maxMs:  7 * 60 * 1000 + 30 * 1000, multiplier: 4.0, color: '#ffaa44' },
    { label: 'UNSTOPPABLE',maxMs: 10 * 60 * 1000, multiplier: 3.0, color: '#ffd700' },
    { label: 'EMPOWERED',  maxMs: 12 * 60 * 1000 + 30 * 1000, multiplier: 2.5, color: '#88ff88' },
    { label: 'STEADY',     maxMs: 15 * 60 * 1000, multiplier: 2.0, color: '#66ccff' },
    { label: 'CASUAL',     maxMs: 20 * 60 * 1000, multiplier: 1.5, color: '#bbbbbb' },
    { label: 'FINISHED',   maxMs: Infinity,       multiplier: 1.0, color: '#888888' },
];

export function speedrunTierFor(elapsedMs) {
    for (const tier of SPEEDRUN_TIERS) {
        if (elapsedMs <= tier.maxMs) return tier;
    }
    return SPEEDRUN_TIERS[SPEEDRUN_TIERS.length - 1];
}

// 5.79.23 — Fancy decorative star variants restored to the spawn pool
//   (multi-point, geometric, 3D solids) — but only at SMALL star
//   size. `STAR_SHAPES` is the small-star pool, `BIG_STAR_SHAPES` the
//   big-star pool. Per user, no more big multi-point / 3D / geometric
//   stars; big stars stay as plain points so they don't dominate the
//   field. Sparkle/burst still disabled (Canvas2D special-effects
//   path skipped per 5.79.22). Lens flare also still disabled.
export const STAR_SHAPES = [
    'point', 'point', 'point', 'point', 'point',
    'circle',
    'diamond', 'diamond',
    'triangle', 'hexagon',
    'star4', 'star5', 'star6', 'star8',
    'cube', 'octahedron', 'tetrahedron', 'prism',
];
export const BIG_STAR_SHAPES = ['point', 'circle'];

// ─── 6.18.0 — DROP TIERS ────────────────────────────────────────────────
// Each gold-shape orb is stamped with a TIER at spawn time, driven by
// the orb's final value (post-jewel-multiplier). Tier defines color,
// size scale, glow intensity, and pickup audio pitch hint.
//
// Bronze   — small-kill scraps; copper-toned, subtle.
// Silver   — common drops; pale silver.
// Gold     — most kills; the default treasure-gold (visual baseline).
// Platinum — boss kills / huge multi-kills; cyan-tinted, big, glowy.
//
// Tiers are intentionally distinct in HUE so the player can read drop
// quality at a glance without reading numbers.
export const DROP_TIERS = [
    {
        id: 'bronze',
        minValue: 1,
        color: '#cd7f32',  // bronze
        sizeScale: 0.80,
        glowMult: 0.35,
        pickupPitch: 0.85,
    },
    {
        id: 'silver',
        minValue: 35,
        color: '#dcdcdc',  // pale silver
        sizeScale: 0.95,
        glowMult: 0.70,
        pickupPitch: 1.00,
    },
    {
        id: 'gold',
        minValue: 100,
        color: '#ffd700',  // treasure gold (baseline)
        sizeScale: 1.00,
        glowMult: 1.00,
        pickupPitch: 1.10,
    },
    {
        id: 'platinum',
        minValue: 200,
        color: '#88ddff',  // cyan-tinted platinum
        sizeScale: 1.20,
        glowMult: 1.50,
        pickupPitch: 1.25,
    },
];

// Lookup helper — picks the highest tier whose minValue ≤ value.
export function getDropTier(value) {
    let t = DROP_TIERS[0];
    for (let i = 0; i < DROP_TIERS.length; i++) {
        if (value >= DROP_TIERS[i].minValue) t = DROP_TIERS[i];
    }
    return t;
}

// ─── 6.18.0 — ENEMY DROP PROFILES ───────────────────────────────────────
// Each enemy type maps to a drop profile that scales the base drop
// budget and rate. Bosses get the 'boss' profile via isBoss override
// regardless of type.
//
//   budgetMult     — multiplier applied to total drop budget
//   rateMult       — multiplier applied to drop rate
//   pixelBonus     — extra pixel pieces on top of split's default
//   minShape       — minimum chunky shapes per drop (1 = always 1)
//
// Grunts (cheap, frequent) drop pixel showers; tanky enemies drop
// guaranteed shapes; bosses drop jackpots.
export const ENEMY_DROP_PROFILES = {
    grunt:    { budgetMult: 0.75, rateMult: 0.85, pixelBonus: 2, minShape: 0 },
    standard: { budgetMult: 1.00, rateMult: 1.00, pixelBonus: 0, minShape: 1 },
    tanky:    { budgetMult: 1.40, rateMult: 1.00, pixelBonus: 0, minShape: 1 },
    miniboss: { budgetMult: 1.80, rateMult: 1.00, pixelBonus: 4, minShape: 1 },
    boss:     { budgetMult: 2.40, rateMult: 1.00, pixelBonus: 6, minShape: 1 },
};

// Enemy-type → profile slug. Bosses are identified by the isBoss
// FLAG, not the type, so this map covers the standard kill case.
export const ENEMY_TYPE_DROP_PROFILE = {
    HUNTER:    'grunt',
    WASP:      'grunt',
    STALKER:   'grunt',
    DRIFTER:   'standard',
    WEAVER:    'standard',
    TANGERINE: 'standard',
    GUARDIAN:  'tanky',
    PROWLER:   'tanky',
    SENTINEL:  'tanky',
    TITAN:     'miniboss',
};

export function getEnemyDropProfile(entity) {
    if (!entity) return ENEMY_DROP_PROFILES.standard;
    if (entity.isBoss) return ENEMY_DROP_PROFILES.boss;
    const slug = ENEMY_TYPE_DROP_PROFILE[entity.type] || 'standard';
    return ENEMY_DROP_PROFILES[slug] || ENEMY_DROP_PROFILES.standard;
} 