// Wave configuration data for enemy and asteroid spawning
import { GAME_CONFIG } from './constants.js';
//
// PHASE 1  (wave  1)      — Asteroids only
// PHASE 2  (waves  2–19)  — Solo enemy introductions, one type per wave
//                            Order: HUNTER → GUARDIAN → WASP → STALKER → DRIFTER
//                                   → PROWLER → WEAVER → SENTINEL → TANGERINE → TITAN
// PHASE 3  (waves 20–39)  — Duo combinations, 2 enemy types per wave
// PHASE 4  (waves 40–60)  — Trio combinations, 3 enemy types per wave
// PHASE 5  (waves 61–80)  — Quad combinations, 4 enemy types per wave
// PHASE 6  (waves 81+)    — Procedurally generated from wave 80 base

export const WAVE_DATA = {

    // ── PHASE 1: Asteroids only ───────────────────────────────────────────
    1:  { asteroids: 12, enemies: [] },

    // ── PHASE 2: Solo enemy introductions ────────────────────────────────
    2:  { asteroids: 10, enemies: [{ type: 'HUNTER',    count: 2 }] },
    3:  { asteroids:  8, enemies: [{ type: 'HUNTER',    count: 3 }] },
    4:  { asteroids:  8, enemies: [{ type: 'GUARDIAN',  count: 2 }] },
    5:  { asteroids:  6, enemies: [{ type: 'GUARDIAN',  count: 3 }] },
    6:  { asteroids:  8, enemies: [{ type: 'WASP',      count: 2 }] },
    7:  { asteroids:  6, enemies: [{ type: 'WASP',      count: 3 }] },
    8:  { asteroids:  6, enemies: [{ type: 'STALKER',   count: 2 }] },
    9:  { asteroids:  5, enemies: [{ type: 'STALKER',   count: 3 }] },
    10: { asteroids:  6, enemies: [{ type: 'DRIFTER',   count: 2 }] },
    11: { asteroids:  5, enemies: [{ type: 'DRIFTER',   count: 3 }] },
    12: { asteroids:  5, enemies: [{ type: 'PROWLER',   count: 2 }] },
    13: { asteroids:  4, enemies: [{ type: 'PROWLER',   count: 3 }] },
    14: { asteroids:  5, enemies: [{ type: 'WEAVER',    count: 2 }] },
    15: { asteroids:  4, enemies: [{ type: 'WEAVER',    count: 3 }] },
    16: { asteroids:  5, enemies: [{ type: 'SENTINEL',  count: 2 }] },
    17: { asteroids:  4, enemies: [{ type: 'SENTINEL',  count: 3 }] },
    18: { asteroids:  5, enemies: [{ type: 'TANGERINE', count: 2 }] },
    19: { asteroids:  4, enemies: [{ type: 'TITAN',     count: 1 }] },

    // ── PHASE 3: Duo combinations ─────────────────────────────────────────
    20: { asteroids: 5, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }] },
    21: { asteroids: 4, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'WASP',      count: 2 }] },
    22: { asteroids: 4, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'WASP',      count: 2 }] },
    23: { asteroids: 4, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'STALKER',   count: 2 }] },
    24: { asteroids: 4, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'STALKER',   count: 2 }] },
    25: { asteroids: 3, enemies: [{ type: 'WASP',      count: 3 }, { type: 'STALKER',   count: 2 }] },
    26: { asteroids: 4, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'DRIFTER',   count: 2 }] },
    27: { asteroids: 4, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'DRIFTER',   count: 2 }] },
    28: { asteroids: 3, enemies: [{ type: 'WASP',      count: 3 }, { type: 'PROWLER',   count: 2 }] },
    29: { asteroids: 3, enemies: [{ type: 'STALKER',   count: 2 }, { type: 'PROWLER',   count: 2 }] },
    30: { asteroids: 4, enemies: [{ type: 'DRIFTER',   count: 2 }, { type: 'WEAVER',    count: 2 }] },
    31: { asteroids: 4, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'WEAVER',    count: 2 }] },
    32: { asteroids: 3, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'SENTINEL',  count: 2 }] },
    33: { asteroids: 3, enemies: [{ type: 'WASP',      count: 3 }, { type: 'SENTINEL',  count: 2 }] },
    34: { asteroids: 4, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'TANGERINE', count: 2 }] },
    35: { asteroids: 3, enemies: [{ type: 'STALKER',   count: 2 }, { type: 'TANGERINE', count: 2 }] },
    36: { asteroids: 3, enemies: [{ type: 'PROWLER',   count: 2 }, { type: 'TITAN',     count: 1 }] },
    37: { asteroids: 3, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'TITAN',     count: 2 }] },
    38: { asteroids: 3, enemies: [{ type: 'TANGERINE', count: 2 }, { type: 'TITAN',     count: 2 }] },
    39: { asteroids: 3, enemies: [{ type: 'SENTINEL',  count: 2 }, { type: 'TITAN',     count: 2 }] },

    // ── PHASE 4: Trio combinations ────────────────────────────────────────
    40: { asteroids: 4, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }, { type: 'WASP',      count: 2 }] },
    41: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'STALKER',   count: 2 }, { type: 'DRIFTER',   count: 2 }] },
    42: { asteroids: 3, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'WASP',      count: 2 }, { type: 'PROWLER',   count: 2 }] },
    43: { asteroids: 3, enemies: [{ type: 'WASP',      count: 3 }, { type: 'STALKER',   count: 2 }, { type: 'WEAVER',    count: 1 }] },
    44: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }, { type: 'STALKER',   count: 2 }] },
    45: { asteroids: 3, enemies: [{ type: 'DRIFTER',   count: 2 }, { type: 'PROWLER',   count: 2 }, { type: 'SENTINEL',  count: 2 }] },
    46: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'WASP',      count: 2 }, { type: 'TANGERINE', count: 2 }] },
    47: { asteroids: 2, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'STALKER',   count: 2 }, { type: 'TITAN',     count: 2 }] },
    48: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'PROWLER',   count: 2 }, { type: 'WEAVER',    count: 2 }] },
    49: { asteroids: 2, enemies: [{ type: 'WASP',      count: 3 }, { type: 'TANGERINE', count: 2 }, { type: 'TITAN',     count: 2 }] },
    50: { asteroids: 3, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'DRIFTER',   count: 2 }, { type: 'TANGERINE', count: 2 }] },
    51: { asteroids: 2, enemies: [{ type: 'STALKER',   count: 2 }, { type: 'WEAVER',    count: 2 }, { type: 'SENTINEL',  count: 2 }] },
    52: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'STALKER',   count: 2 }, { type: 'TITAN',     count: 2 }] },
    53: { asteroids: 2, enemies: [{ type: 'WASP',      count: 3 }, { type: 'PROWLER',   count: 2 }, { type: 'SENTINEL',  count: 2 }] },
    54: { asteroids: 2, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'WEAVER',    count: 2 }, { type: 'TITAN',     count: 2 }] },
    55: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }, { type: 'DRIFTER',   count: 2 }] },
    56: { asteroids: 2, enemies: [{ type: 'DRIFTER',   count: 2 }, { type: 'SENTINEL',  count: 2 }, { type: 'TANGERINE', count: 3 }] },
    57: { asteroids: 2, enemies: [{ type: 'PROWLER',   count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'TITAN',     count: 2 }] },
    58: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'WEAVER',    count: 2 }, { type: 'SENTINEL',  count: 2 }] },
    59: { asteroids: 2, enemies: [{ type: 'WASP',      count: 3 }, { type: 'STALKER',   count: 2 }, { type: 'TANGERINE', count: 2 }] },
    60: { asteroids: 2, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'SENTINEL',  count: 2 }, { type: 'TITAN',     count: 2 }] },

    // ── PHASE 5: Quad combinations ────────────────────────────────────────
    61: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }, { type: 'WASP',      count: 2 }, { type: 'STALKER',   count: 2 }] },
    62: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'DRIFTER',   count: 2 }, { type: 'PROWLER',   count: 2 }, { type: 'WEAVER',    count: 1 }] },
    63: { asteroids: 2, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'WASP',      count: 2 }, { type: 'SENTINEL',  count: 2 }, { type: 'TANGERINE', count: 2 }] },
    64: { asteroids: 2, enemies: [{ type: 'STALKER',   count: 2 }, { type: 'PROWLER',   count: 2 }, { type: 'DRIFTER',   count: 2 }, { type: 'TITAN',     count: 2 }] },
    65: { asteroids: 3, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }, { type: 'STALKER',   count: 2 }, { type: 'DRIFTER',   count: 2 }] },
    66: { asteroids: 2, enemies: [{ type: 'WASP',      count: 3 }, { type: 'WEAVER',    count: 2 }, { type: 'SENTINEL',  count: 2 }, { type: 'TITAN',     count: 2 }] },
    67: { asteroids: 2, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'WASP',      count: 2 }, { type: 'PROWLER',   count: 2 }, { type: 'TANGERINE', count: 2 }] },
    68: { asteroids: 2, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'STALKER',   count: 2 }, { type: 'WEAVER',    count: 2 }, { type: 'TITAN',     count: 2 }] },
    69: { asteroids: 2, enemies: [{ type: 'DRIFTER',   count: 2 }, { type: 'PROWLER',   count: 2 }, { type: 'SENTINEL',  count: 2 }, { type: 'TANGERINE', count: 2 }] },
    70: { asteroids: 2, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }, { type: 'WEAVER',    count: 2 }, { type: 'TITAN',     count: 2 }] },
    71: { asteroids: 3, enemies: [{ type: 'WASP',      count: 3 }, { type: 'STALKER',   count: 2 }, { type: 'DRIFTER',   count: 2 }, { type: 'SENTINEL',  count: 2 }] },
    72: { asteroids: 2, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'PROWLER',   count: 2 }, { type: 'TANGERINE', count: 3 }, { type: 'TITAN',     count: 2 }] },
    73: { asteroids: 2, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'STALKER',   count: 2 }, { type: 'SENTINEL',  count: 2 }, { type: 'TITAN',     count: 2 }] },
    74: { asteroids: 3, enemies: [{ type: 'WASP',      count: 3 }, { type: 'DRIFTER',   count: 2 }, { type: 'WEAVER',    count: 2 }, { type: 'TANGERINE', count: 2 }] },
    75: { asteroids: 2, enemies: [{ type: 'GUARDIAN',  count: 2 }, { type: 'DRIFTER',   count: 2 }, { type: 'SENTINEL',  count: 2 }, { type: 'TITAN',     count: 2 }] },
    76: { asteroids: 2, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'PROWLER',   count: 2 }, { type: 'WEAVER',    count: 2 }, { type: 'TANGERINE', count: 2 }] },
    77: { asteroids: 2, enemies: [{ type: 'STALKER',   count: 2 }, { type: 'WEAVER',    count: 2 }, { type: 'TANGERINE', count: 3 }, { type: 'TITAN',     count: 2 }] },
    78: { asteroids: 2, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }, { type: 'SENTINEL',  count: 2 }, { type: 'TANGERINE', count: 2 }] },
    79: { asteroids: 2, enemies: [{ type: 'WASP',      count: 3 }, { type: 'PROWLER',   count: 2 }, { type: 'DRIFTER',   count: 2 }, { type: 'TITAN',     count: 2 }] },
    80: { asteroids: 2, enemies: [{ type: 'HUNTER',    count: 2 }, { type: 'GUARDIAN',  count: 2 }, { type: 'WASP',      count: 3 }, { type: 'STALKER',   count: 2 }, { type: 'TITAN', count: 2 }] },
};

const _waveCache = new Map();

// Helper function to get wave configuration
export function getWaveConfig(waveNumber) {
    // For waves beyond 80, scale from wave 80 base
    if (waveNumber > 80) {
        if (_waveCache.has(waveNumber)) return _waveCache.get(waveNumber);
        const baseWave = WAVE_DATA[80];
        const scaleFactor = 1 + ((waveNumber - 80) * 0.1); // 10% increase per wave beyond 80

        const config = {
            // Hard cap: never exceed MAX_WAVE_ASTEROIDS regardless of scaling
            asteroids: Math.min(
                Math.floor(baseWave.asteroids * scaleFactor),
                GAME_CONFIG.MAX_WAVE_ASTEROIDS
            ),
            enemies: baseWave.enemies.map(enemy => ({
                type: enemy.type,
                count: Math.floor(enemy.count * scaleFactor)
            }))
        };
        _waveCache.set(waveNumber, config);
        return config;
    }

    return WAVE_DATA[waveNumber] || WAVE_DATA[1]; // Fallback to wave 1 if not found
}

// Helper function to calculate enemy level based on wave
export function getEnemyLevel(waveNumber) {
    return Math.floor(waveNumber / 3) + 1; // Level increases every 3 waves
}

// Helper function to calculate asteroid level based on wave
export function getAsteroidLevel(waveNumber) {
    return Math.floor(waveNumber / 4) + 1; // Level increases every 4 waves
}

// Helper function to get level-scaled enemy stats
export function getLevelScaledEnemyStats(baseStats, level) {
    return {
        health: Math.floor(baseStats.health * (1 + (level - 1) * 0.25)), // 25% more HP per level
        speed: baseStats.speed * (1 + (level - 1) * 0.15), // 15% faster per level
        size: baseStats.size, // Size stays the same
        shootRate: baseStats.shootRate, // Shoot rate stays the same
        points: Math.floor(baseStats.points * (1 + (level - 1) * 0.2)) // 20% more points per level
    };
}

// Helper function to get level-scaled asteroid stats
export function getLevelScaledAsteroidStats(baseHealth, level) {
    return Math.floor(baseHealth * (1 + (level - 1) * 0.3)); // 30% more HP per level
}
