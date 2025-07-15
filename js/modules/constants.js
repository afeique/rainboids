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
    STAR_COUNT: 250,
    MIN_STAR_DIST: 30,
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
    STAR_ENERGY: 2,
    BURST_STAR_ENERGY: 1,
    // Energy depletion rate of thrusters
    // Higher is slower, lower means energy depletes faster
    TIME_TO_ENERGY_EMPTY: 7, 
    // Energy regeneration time when not thrusting
    // Higher is slower
    TIME_TO_ENERGY_FULL: 23, 
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