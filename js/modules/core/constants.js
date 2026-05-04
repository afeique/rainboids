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
    HEALTH_ORB_HEAL_AMOUNT_MIN: 1, // Minimum health restored per health orb
    HEALTH_ORB_HEAL_AMOUNT_MAX: 2, // Maximum health restored per health orb
    HEALTH_ORB_BASE_DROP_RATE: 0.2, // 20% base chance to drop health orbs
    HEALTH_ORB_BASE_DROP_COUNT_MAX: 1, // Maximum health orbs dropped (upgrade to get more)
    HEALTH_ORB_COLLECTION_RADIUS: 15, // Extra pixels added to collection radius
    HEALTH_ORB_SIZE_MIN: 1.3, // Minimum size multiplier for health orbs (was 0.8 — too small to read)
    HEALTH_ORB_SIZE_MAX: 1.4, // Maximum size multiplier for health orbs (capped — split into more orbs instead of one big one)
    HEALTH_ORB_MAX_HEAL_PER_ORB: 2, // Per-orb heal cap. Excess budget → more orbs at this cap.
    
    // Money Orb Configuration (renamed from money stars)
    MONEY_ORB_MONEY_AMOUNT_MIN: 10, // Minimum money gained per money orb
    MONEY_ORB_MONEY_AMOUNT_MAX: 20, // Maximum money gained per money orb
    MONEY_ORB_BASE_DROP_RATE: 0.2, // 20% base chance to drop money orbs
    MONEY_ORB_BASE_DROP_COUNT_MAX: 1, // Maximum money orbs dropped (upgrade to get more)
    MONEY_ORB_COLLECTION_RADIUS: 15, // Extra pixels added to collection radius
    MONEY_ORB_SIZE_MIN: 1.3, // Minimum size multiplier for money orbs (was 1.0 — bumped to match health orbs)
    MONEY_ORB_SIZE_MAX: 1.6, // Maximum size multiplier for money orbs (capped — split into more orbs instead of one big one)
    MONEY_ORB_MAX_MONEY_PER_ORB: 20, // Per-orb money cap. Excess budget → more orbs at this cap.
    
    // Orb Drop Upgrade Configuration
    HEALTH_ORB_DROP_CHANCE_UPGRADE: 0.05, // +5% drop chance per upgrade stack
    MONEY_ORB_DROP_CHANCE_UPGRADE: 0.05, // +5% drop chance per upgrade stack
    HEALTH_ORB_DROP_QUANTITY_UPGRADE: 1, // +1 orb per upgrade stack
    MONEY_ORB_DROP_QUANTITY_UPGRADE: 1, // +1 orb per upgrade stack
    MEDPACK_HEAL_MIN_UPGRADE: 1, // +1 min heal per Medpack stack
    PAYDAY_MONEY_MIN_UPGRADE: 5, // +5 min money per Payday stack
    DOCTOR_HEAL_MAX_UPGRADE: 1, // +1 max heal per Doctor stack
    HIGH_ROLLER_MONEY_MAX_UPGRADE: 10, // +10 max money per High Roller stack

    // Health Orb Drop Cooldown (global throttle so health drops don't trivialize the game)
    HEALTH_DROP_COOLDOWN_BASE: 60000, // 60s default between health orb drop events
    HEALTH_DROP_COOLDOWN_REDUCTION_PER_STACK: 5000, // -5s per Triage stack
    HEALTH_DROP_COOLDOWN_MIN: 30000, // 30s floor (reached at 6 stacks)

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
    MAX_PARTICLES: 220, // Bumped to fit the epic mine / lightning / lance bursts
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
        HUNTER: { MIN: 800, MAX: 3000 },        // Fast burst shooter
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

export const NORMAL_STAR_COLORS = [
    '#a6b3ff', '#c3a6ff', '#a6f3e8', '#a6e8ff',
    '#b8d4ff', '#52e8ff', '#8cd9ff', '#a6ffcc'
];

export const GAME_STATES = {
    TITLE_SCREEN: 'TITLE_SCREEN',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
    GAME_COMPLETE: 'GAME_COMPLETE',
    WAVE_TRANSITION: 'WAVE_TRANSITION',
    ORIENTATION_LOCK: 'ORIENTATION_LOCK',
    SHOP: 'SHOP'
};

// Total waves required to win the run. Boss waves at every BOSS_WAVE_INTERVAL
// produce four bosses across the campaign (waves 5 / 10 / 15 / 20).
export const MAX_WAVES = 20;
export const BOSS_WAVE_INTERVAL = 5;
export const BOSS_WAVES = [5, 10, 15, 20];

export const STAR_SHAPES = [
    'point', 'point', 'point', 'point',  // Most common - simple points
    'diamond', 'diamond',                // Common diamonds
    'star4', 'star4',                    // 4-pointed stars
    'star5', 'star6',                    // 5 and 6-pointed stars
    'star8',                             // 8-pointed star
    'triangle', 'hexagon',               // Geometric shapes
    'circle',                            // Basic shapes
    'sparkle', 'burst'                   // Special effects
]; 