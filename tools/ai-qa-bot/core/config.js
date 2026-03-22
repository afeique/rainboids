/**
 * AI QA Bot — Configuration
 *
 * Central configuration for bot sessions. Can be overridden per-run
 * via CLI flags or programmatic API.
 */

export const DEFAULT_CONFIG = {
    // Session
    sessionDurationMs: 10 * 60 * 1000,  // 10 minutes default
    tickIntervalMs: 100,                  // AI decision rate (10 Hz)

    // Game target
    gameUrl: 'http://localhost:8090',
    viewport: { width: 1280, height: 720 },
    headless: true,

    // Strategy
    buildArchetype: 'balanced',  // 'dps' | 'tank' | 'balanced' | 'economy' | 'random'
    skillLevel: 'advanced',      // 'novice' | 'beginner' | 'intermediate' | 'advanced'
    useSkills: true,
    useShop: true,
    usePowerWeapon: true,

    // Bug detection
    enableInvariantChecks: true,
    enableStuckDetection: true,
    enablePerformanceMonitoring: true,
    invariantCheckIntervalMs: 500,  // Check invariants every 500ms
    stuckThresholdMs: 60_000,       // Flag stuck after 60s no progress

    // Performance
    fpsWarningThreshold: 30,
    fpsCriticalThreshold: 15,
    fpsSampleIntervalMs: 1000,

    // Vision (cross-game, disabled by default)
    enableVision: false,
    visionIntervalMs: 5000,       // Screenshot every 5s for LLM analysis
    visionModel: 'claude-sonnet-4-20250514',

    // Exploration (edge-case testing)
    enableExploration: false,
    explorationStrategies: [
        'rapid_shop_cycling',
        'max_stacking',
        'weapon_switch_under_fire',
        'skill_spam',
        'edge_of_field',
        'pause_spam',
        'long_session',
    ],

    // Reporting
    reportsDir: 'tools/ai-qa-bot/reports',
    screenshotOnBug: true,
    screenshotIntervalMs: 10_000,  // Periodic screenshots every 10s

    // Learning simulation
    learningSimulation: false,
    learningProgression: [
        { session: 1, reactionMs: 500, aimAccuracy: 0.3, dodgeProb: 0.2, shopStrategy: 'random', useSkills: false },
        { session: 5, reactionMs: 300, aimAccuracy: 0.5, dodgeProb: 0.5, shopStrategy: 'cheapest', useSkills: false },
        { session: 10, reactionMs: 200, aimAccuracy: 0.7, dodgeProb: 0.7, shopStrategy: 'heuristic', useSkills: true },
        { session: 20, reactionMs: 100, aimAccuracy: 0.9, dodgeProb: 0.9, shopStrategy: 'optimal', useSkills: true },
    ],

    // Cross-game (structural hooks)
    gameAdapter: 'rainboids',  // adapter name
    crossGameMode: false,
};

/**
 * Merge user overrides with defaults.
 */
export function buildConfig(overrides = {}) {
    return { ...DEFAULT_CONFIG, ...overrides };
}

/**
 * Skill level presets — degraded parameters for learning simulation.
 * Each preset includes base parameters plus combat AI and shop AI tuning.
 */
export const SKILL_PRESETS = {
    novice: {
        reactionMs: 500, aimAccuracy: 0.3, dodgeProb: 0.2,
        shopStrategy: 'utility', useSkills: false,
        combat: {
            pursuitAggression: 0.2,       // 0-1, how aggressively to close distance
            circleStrafePreference: 0.0,  // 0-1, orbiting vs direct approach
            dangerSensitivity: 0.3,       // 0-1, how much danger affects decisions
            leadFactor: 0.0,              // 0-1, aim prediction quality (0 = current pos)
            predictionNoise: 0.5,         // noise on velocity estimation
            threatAwareness: 0.2,         // 0-1, weight of threat in target scoring
            opportunism: 0.2,             // 0-1, preference for low-health targets
            targetSwitchCooldown: 2000,   // ms between target switches
            bulletAwareness: 0.2,         // 0-1, fraction of bullets AI "sees"
            dodgeReactionMs: 500,         // ms before dodge starts
            dodgeCommitment: 0.3,         // 0-1, dodge intensity
            weaponAdaptation: false,      // adjust engagement by weapon
        },
        shop: {
            decisionQuality: 0.2,         // 0-1, how optimal purchases are
            savingAwareness: 0.0,         // 0-1, ability to save for expensive items
            adaptability: 0.1,            // 0-1, how fast build shifts on performance
        },
    },
    beginner: {
        reactionMs: 300, aimAccuracy: 0.5, dodgeProb: 0.5,
        shopStrategy: 'utility', useSkills: false,
        combat: {
            pursuitAggression: 0.4,
            circleStrafePreference: 0.1,
            dangerSensitivity: 0.5,
            leadFactor: 0.3,
            predictionNoise: 0.3,
            threatAwareness: 0.4,
            opportunism: 0.3,
            targetSwitchCooldown: 1200,
            bulletAwareness: 0.4,
            dodgeReactionMs: 400,
            dodgeCommitment: 0.4,
            weaponAdaptation: false,
        },
        shop: {
            decisionQuality: 0.4,
            savingAwareness: 0.2,
            adaptability: 0.3,
        },
    },
    intermediate: {
        reactionMs: 200, aimAccuracy: 0.7, dodgeProb: 0.7,
        shopStrategy: 'utility', useSkills: true,
        combat: {
            pursuitAggression: 0.6,
            circleStrafePreference: 0.4,
            dangerSensitivity: 0.7,
            leadFactor: 0.7,
            predictionNoise: 0.15,
            threatAwareness: 0.7,
            opportunism: 0.5,
            targetSwitchCooldown: 600,
            bulletAwareness: 0.7,
            dodgeReactionMs: 250,
            dodgeCommitment: 0.6,
            weaponAdaptation: true,
        },
        shop: {
            decisionQuality: 0.7,
            savingAwareness: 0.5,
            adaptability: 0.6,
        },
    },
    advanced: {
        reactionMs: 100, aimAccuracy: 0.95, dodgeProb: 0.95,
        shopStrategy: 'utility', useSkills: true,
        combat: {
            pursuitAggression: 0.8,
            circleStrafePreference: 0.7,
            dangerSensitivity: 0.95,
            leadFactor: 0.95,
            predictionNoise: 0.05,
            threatAwareness: 0.9,
            opportunism: 0.7,
            targetSwitchCooldown: 300,
            bulletAwareness: 0.95,
            dodgeReactionMs: 100,
            dodgeCommitment: 0.8,
            weaponAdaptation: true,
        },
        shop: {
            decisionQuality: 0.95,
            savingAwareness: 0.8,
            adaptability: 0.8,
        },
    },
};

/**
 * Build archetype definitions — shop purchase priorities.
 */
export const BUILD_ARCHETYPES = {
    dps: {
        name: 'DPS',
        priorities: ['RAPID_FIRE', 'CRIT_CHANCE', 'CRIT_DAMAGE', 'MULTI_SHOT', 'PIERCING', 'EXPLOSIVE'],
        preferredPrimary: 'STORM_NEEDLES',
        preferredPower: 'LIGHTNING_ARC',
        preferredSkills: ['PHASE_DASH', 'EMP_PULSE'],
    },
    tank: {
        name: 'Tank',
        priorities: ['HEALTH_BOOST', 'SHIELD_BOOST', 'SPEED_BOOST', 'SPARE_SHIP', 'RAPID_FIRE'],
        preferredPrimary: 'PULSE_CANNON',
        preferredPower: 'NOVA_BLAST',
        preferredSkills: ['BULWARK', 'REPAIR_NANITES'],
    },
    balanced: {
        name: 'Balanced',
        priorities: ['RAPID_FIRE', 'HEALTH_BOOST', 'CRIT_CHANCE', 'SPEED_BOOST', 'SHIELD_BOOST', 'MULTI_SHOT'],
        preferredPrimary: 'STORM_NEEDLES',
        preferredPower: 'CHARGE_SHOT',
        preferredSkills: ['BULWARK', 'PHASE_DASH'],
    },
    economy: {
        name: 'Economy',
        priorities: ['PAYDAY', 'HIGH_ROLLER', 'MONEY_ORB_DROP_CHANCE', 'MONEY_ORB_DROP_QUANTITY', 'HEALTH_BOOST', 'MEDPACK'],
        preferredPrimary: 'PULSE_CANNON',
        preferredPower: 'CHARGE_SHOT',
        preferredSkills: ['TRACTOR_SHIELD', 'REPAIR_NANITES'],
    },
    random: {
        name: 'Random',
        priorities: [],  // Will be randomized per session
        preferredPrimary: null,
        preferredPower: null,
        preferredSkills: [],
    },
};
