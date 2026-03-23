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
        reactionMs: 700, aimAccuracy: 0.10, movementSkill: 0.08, dodgeProb: 0.08,
        shopStrategy: 'utility', useSkills: false,
        combat: {
            pursuitAggression: 0.08,
            circleStrafePreference: 0.0,
            dangerSensitivity: 0.10,
            leadFactor: 0.0,
            predictionNoise: 0.7,
            threatAwareness: 0.1,
            opportunism: 0.1,
            targetSwitchCooldown: 3000,
            bulletAwareness: 0.05,
            weaponAdaptation: false,
            reactionJitter: 0.9,
            threatBlindness: 0.55,
            movementCommitment: 2500,
        },
        shop: {
            decisionQuality: 0.1,
            savingAwareness: 0.0,
            adaptability: 0.05,
        },
    },
    beginner: {
        reactionMs: 450, aimAccuracy: 0.30, movementSkill: 0.25, dodgeProb: 0.25,
        shopStrategy: 'utility', useSkills: false,
        combat: {
            pursuitAggression: 0.20,
            circleStrafePreference: 0.1,
            dangerSensitivity: 0.30,
            leadFactor: 0.15,
            predictionNoise: 0.45,
            threatAwareness: 0.25,
            opportunism: 0.2,
            targetSwitchCooldown: 1500,
            bulletAwareness: 0.20,
            weaponAdaptation: false,
            reactionJitter: 0.6,
            threatBlindness: 0.40,
            movementCommitment: 1500,
        },
        shop: {
            decisionQuality: 0.25,
            savingAwareness: 0.1,
            adaptability: 0.15,
        },
    },
    intermediate: {
        reactionMs: 250, aimAccuracy: 0.65, movementSkill: 0.55, dodgeProb: 0.55,
        shopStrategy: 'utility', useSkills: true,
        combat: {
            pursuitAggression: 0.35,
            circleStrafePreference: 0.35,
            dangerSensitivity: 0.60,
            leadFactor: 0.55,
            predictionNoise: 0.2,
            threatAwareness: 0.55,
            opportunism: 0.45,
            targetSwitchCooldown: 800,
            bulletAwareness: 0.55,
            weaponAdaptation: true,
            reactionJitter: 0.25,
            threatBlindness: 0.15,
            movementCommitment: 600,
        },
        shop: {
            decisionQuality: 0.55,
            savingAwareness: 0.35,
            adaptability: 0.45,
        },
    },
    advanced: {
        reactionMs: 120, aimAccuracy: 0.92, movementSkill: 0.88, dodgeProb: 0.90,
        shopStrategy: 'utility', useSkills: true,
        combat: {
            pursuitAggression: 0.55,
            circleStrafePreference: 0.7,
            dangerSensitivity: 0.92,
            leadFactor: 0.92,
            predictionNoise: 0.04,
            threatAwareness: 0.88,
            opportunism: 0.7,
            targetSwitchCooldown: 300,
            bulletAwareness: 0.92,
            weaponAdaptation: true,
            reactionJitter: 0.08,
            threatBlindness: 0.03,
            movementCommitment: 150,
        },
        shop: {
            decisionQuality: 0.9,
            savingAwareness: 0.75,
            adaptability: 0.8,
        },
    },
    expert: {
        reactionMs: 50, aimAccuracy: 0.98, movementSkill: 0.97, dodgeProb: 0.98,
        shopStrategy: 'utility', useSkills: true,
        combat: {
            pursuitAggression: 0.65,
            circleStrafePreference: 0.9,
            dangerSensitivity: 0.98,
            leadFactor: 0.99,
            predictionNoise: 0.01,
            threatAwareness: 0.98,
            opportunism: 0.9,
            targetSwitchCooldown: 100,
            bulletAwareness: 1.0,
            weaponAdaptation: true,
            reactionJitter: 0.02,
            threatBlindness: 0.0,
            movementCommitment: 50,
        },
        shop: {
            decisionQuality: 0.98,
            savingAwareness: 0.95,
            adaptability: 0.95,
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
