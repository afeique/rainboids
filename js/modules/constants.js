// Game constants and configuration
export const GAME_CONFIG = {
    SHIP_SIZE: 30,
    SHIP_THRUST: 0.15,
    SHIP_FRICTION: 0.995,
    MAX_V: 3,
    TURN_SPEED: 0.06,
    BULLET_SPEED: 8,
    INITIAL_AST_COUNT: 3,
    AST_SPEED: 1.2,
    STAR_COUNT: 1000,
    MIN_STAR_DIST: 15, // Reduced to allow for denser clusters
    PASSIVE_STAR_ATTR: 0.5,
    PASSIVE_STAR_ATTRACT_DIST: 50,
    ACTIVE_STAR_ATTR: 0.002,
    ACTIVE_STAR_ATTRACT_DIST: 300,
    STAR_FRIC: 0.995,
    HIT_SCORE: 50,
    DESTROY_SCORE: 500,
    STAR_SCORE: 7,
    BURST_STAR_SCORE: 4,
    BURST_STAR_ATTRACT_DIST: 600,
    BURST_STAR_ATTR: 0.01,
    MIN_AST_RAD: 15,
    SAFE_ZONE: 250,
    MOBILE_SCALE: 0.65,
    STAR_ENERGY: 1,
    BURST_STAR_ENERGY: 1,
};

export const NOISE_CONFIG = {
    // General settings
    DENSITY_MULTIPLIER: 2.5, // Overall control of star density
    
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

export const STAR_SHAPES = ['point', 'point', 'point', 'point', 'point', 'point', 'point', 'diamond', 'star4', 'star8', 'plus']; 