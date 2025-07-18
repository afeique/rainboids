// Game constants and configuration
export const GAME_CONFIG = {
    SHIP_SIZE: 30,
    SHIP_THRUST: 0.15,
    SHIP_FRICTION: 0.995,
    MAX_V: 3,
    BULLET_SPEED: 12,
    INITIAL_AST_COUNT: 3,
    AST_SPEED: 2.2,
    COLOR_STAR_COUNT: 100,
    BACKGROUND_STAR_COUNT: 400, // Non-collectible background stars
    ACTIVE_STAR_ATTR: 0.01,
    ACTIVE_STAR_ATTRACT_DIST: 100,
    STAR_FRIC: 0.99,
    HIT_SCORE: 50,
    DESTROY_SCORE: 500,
    BURST_STAR_SCORE: 4,
    BURST_STAR_COLLECTION_BONUS: 15, // Extra pixels added to burst star collection radius
    MIN_AST_RAD: 15,
    MOBILE_SCALE: 0.65,
    // Performance settings
    STARFIELD_OPTIMIZATION: true, // Enable sprite caching and batched rendering
    MAX_SPRITE_CACHE_SIZE: 100, // Maximum number of cached star sprites
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
    ORIENTATION_LOCK: 'ORIENTATION_LOCK'
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