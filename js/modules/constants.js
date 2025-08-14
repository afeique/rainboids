// Game constants and configuration
export const GAME_CONFIG = {
    SHIP_SIZE: 30,
    SHIP_THRUST: 0.15,
    SHIP_FRICTION: 0.995,
    MAX_V: 3,
    BULLET_SPEED: 12,
    INITIAL_AST_COUNT: 3,
    AST_SPEED: 2.2,
    COLOR_STAR_COUNT: 60, // Increased slightly to show more variety of shapes
    BACKGROUND_STAR_COUNT: 40, // Non-collectible background stars
    ACTIVE_STAR_ATTR: 0.01,
    ACTIVE_STAR_ATTRACT_DIST: 100,
    STAR_FRIC: 0.99,
    BURST_STAR_MONEY: 50,
    BURST_STAR_HEAL_AMOUNT: 2, // Health restored per burst star
    BURST_STAR_DROP_COUNT: 5, // Number of burst stars dropped per enemy death
    BURST_STAR_COLLECTION_RADIUS: 15, // Extra pixels added to burst star collection radius
    ENEMY_BULLET_ASTEROID_DAMAGE: 1, // Damage enemy bullets deal to asteroids
    MIN_AST_RAD: 15,
    MOBILE_SCALE: 0.65,
    
    // Entity limits reduced for better performance
    MAX_ASTEROIDS: 4, // Reduced from 6 for better performance
    MAX_ENEMIES: 3, // Reduced from 5 for better performance
    
    // Wave system configuration - aggressive timing for continuous action
    WAVE_ASTEROID_DELAY: 0, // Time before spawning asteroids (ms)
    WAVE_ENEMY_DELAY: 2000, // Time before first enemy sub-wave (ms) - reduced from 15s
    SUB_WAVE_INTERVAL: 3000, // Time between enemy sub-waves (ms) - reduced from 15s
    ENEMIES_PER_SUB_WAVE: 2, // Enemies per sub-wave - increased from 1
    SUB_WAVES_PER_WAVE: 4, // Number of enemy sub-waves per wave - increased from 3
    SUB_WAVE_TIMEOUT: 20000, // Auto-progress sub-wave after 20 seconds (ms) - reduced from 2 minutes
    WAVE_BREAK_TIME: 4000, // Time between waves (ms) - quadrupled for strategic planning
    
    // Performance settings optimized
    MAX_PARTICLES: 50, // Reduced from 100 for better performance
    PARTICLE_CLEANUP_INTERVAL: 30, // More frequent cleanup for better performance
};

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
    '#a6b3ff', '#c3a6ff', '#f3a6ff', '#ffa6f8', 
    '#ffa6c7', '#ff528e', '#d98cff', '#ff8c00'
];

export const GAME_STATES = {
    TITLE_SCREEN: 'TITLE_SCREEN',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
    WAVE_TRANSITION: 'WAVE_TRANSITION',
    ORIENTATION_LOCK: 'ORIENTATION_LOCK',
    SHOP: 'SHOP'
};

export const PARTICLE_TYPES = {
    EXPLOSION: 'explosion',
    PLAYER_EXPLOSION: 'playerExplosion',
    THRUST: 'thrust',
    PHANTOM: 'phantom',
    PICKUP_PULSE: 'pickupPulse'
};

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