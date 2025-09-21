// Wave configuration data for enemy and asteroid spawning
// Defines what enemies and asteroids spawn in each wave up to wave 50

export const WAVE_DATA = {
    // Waves 1-10: Introduction and basic progression
    1: { asteroids: 16, enemies: [
        { type: 'HUNTER', count: 2 },
        { type: 'GUARDIAN', count: 2 },
        { type: 'WASP', count: 2 },
        { type: 'TITAN', count: 2 },
        { type: 'STALKER', count: 2 },
        { type: 'TANGERINE_BOMBER', count: 2 },
        { type: 'DRIFTER', count: 1 },
        { type: 'PROWLER', count: 1 },
        { type: 'WEAVER', count: 1 },
        { type: 'SENTINEL', count: 1 }
    ] },
    2: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 2 }] },
    3: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 3 }] },
    4: { asteroids: 1, enemies: [{ type: 'HUNTER', count: 4 }] },
    5: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 3 }] },
    6: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 1 }] },
    7: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }] },
    8: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 1 }] },
    9: { asteroids: 4, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 1 }, { type: 'STALKER', count: 2 }] },
    10: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 2 }] },

    // Waves 11-20: Introduce WASP and increase complexity
    11: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 2 }] },
    12: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }, { type: 'STALKER', count: 1 }] },
    13: { asteroids: 4, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 1 }] },
    14: { asteroids: 2, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }, { type: 'STALKER', count: 2 }] },
    15: { asteroids: 5, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'WEAVER', count: 1 }] },
    16: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 3 }] },
    17: { asteroids: 4, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 3 }] },
    18: { asteroids: 2, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'DRIFTER', count: 1 }] },
    19: { asteroids: 6, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }] },
    20: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 3 }] },

    // Waves 21-30: Introduce TANGERINE_BOMBER and TITAN, higher difficulty
    21: { asteroids: 4, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 2 }, { type: 'TANGERINE_BOMBER', count: 1 }, { type: 'PROWLER', count: 1 }] },
    22: { asteroids: 3, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }, { type: 'STALKER', count: 1 }, { type: 'TANGERINE_BOMBER', count: 2 }] },
    23: { asteroids: 5, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'WASP', count: 3 }, { type: 'TANGERINE_BOMBER', count: 2 }] },
    24: { asteroids: 2, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'TANGERINE_BOMBER', count: 2 }, { type: 'TITAN', count: 1 }] },
    25: { asteroids: 4, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 2 }, { type: 'TANGERINE_BOMBER', count: 1 }, { type: 'TITAN', count: 1 }, { type: 'SENTINEL', count: 1 }] },
    26: { asteroids: 6, enemies: [{ type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'TANGERINE_BOMBER', count: 1 }] },
    27: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 2 }, { type: 'TANGERINE_BOMBER', count: 2 }, { type: 'TITAN', count: 2 }] },
    28: { asteroids: 5, enemies: [{ type: 'WASP', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'TANGERINE_BOMBER', count: 2 }] },
    29: { asteroids: 4, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 2 }, { type: 'STALKER', count: 1 }, { type: 'TANGERINE_BOMBER', count: 2 }, { type: 'TITAN', count: 1 }] },
    30: { asteroids: 7, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }, { type: 'TANGERINE_BOMBER', count: 1 }, { type: 'TITAN', count: 2 }] },

    // Waves 31-40: High difficulty mixed encounters
    31: { asteroids: 5, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'TANGERINE_BOMBER', count: 2 }] },
    32: { asteroids: 3, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 2 }, { type: 'TANGERINE_BOMBER', count: 2 }, { type: 'TITAN', count: 2 }] },
    33: { asteroids: 6, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 3 }, { type: 'TANGERINE_BOMBER', count: 2 }] },
    34: { asteroids: 4, enemies: [{ type: 'WASP', count: 4 }, { type: 'STALKER', count: 2 }, { type: 'TITAN', count: 3 }] },
    35: { asteroids: 8, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }, { type: 'TANGERINE_BOMBER', count: 2 }] },
    36: { asteroids: 5, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 3 }, { type: 'TITAN', count: 2 }] },
    37: { asteroids: 4, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'WASP', count: 4 }, { type: 'TANGERINE_BOMBER', count: 3 }, { type: 'TITAN', count: 2 }] },
    38: { asteroids: 6, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'STALKER', count: 3 }, { type: 'TANGERINE_BOMBER', count: 2 }, { type: 'TITAN', count: 1 }] },
    39: { asteroids: 7, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'TANGERINE_BOMBER', count: 2 }, { type: 'TITAN', count: 2 }] },
    40: { asteroids: 5, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 4 }, { type: 'TANGERINE_BOMBER', count: 3 }, { type: 'TITAN', count: 3 }] },

    // Waves 41-50: Maximum difficulty encounters
    41: { asteroids: 8, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 3 }] },
    42: { asteroids: 6, enemies: [{ type: 'WASP', count: 4 }, { type: 'STALKER', count: 3 }, { type: 'TANGERINE_BOMBER', count: 3 }, { type: 'TITAN', count: 3 }] },
    43: { asteroids: 9, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 4 }, { type: 'TANGERINE_BOMBER', count: 3 }] },
    44: { asteroids: 7, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 4 }, { type: 'TITAN', count: 3 }] },
    45: { asteroids: 10, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 5 }, { type: 'TANGERINE_BOMBER', count: 3 }, { type: 'TITAN', count: 2 }] },
    46: { asteroids: 8, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 4 }, { type: 'STALKER', count: 3 }, { type: 'TANGERINE_BOMBER', count: 4 }] },
    47: { asteroids: 6, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'WASP', count: 5 }, { type: 'STALKER', count: 4 }, { type: 'TITAN', count: 4 }] },
    48: { asteroids: 9, enemies: [{ type: 'GUARDIAN', count: 4 }, { type: 'WASP', count: 4 }, { type: 'TANGERINE_BOMBER', count: 4 }, { type: 'TITAN', count: 3 }] },
    49: { asteroids: 11, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 5 }, { type: 'STALKER', count: 4 }, { type: 'TANGERINE_BOMBER', count: 3 }] },
    50: { asteroids: 12, enemies: [{ type: 'GUARDIAN', count: 4 }, { type: 'WASP', count: 6 }, { type: 'STALKER', count: 4 }, { type: 'TANGERINE_BOMBER', count: 4 }, { type: 'TITAN', count: 4 }] }
};

// Helper function to get wave configuration
export function getWaveConfig(waveNumber) {
    // For waves beyond 50, use a scaling formula based on wave 50
    if (waveNumber > 50) {
        const baseWave = WAVE_DATA[50];
        const scaleFactor = 1 + ((waveNumber - 50) * 0.1); // 10% increase per wave beyond 50
        
        return {
            asteroids: Math.floor(baseWave.asteroids * scaleFactor),
            enemies: baseWave.enemies.map(enemy => ({
                type: enemy.type,
                count: Math.floor(enemy.count * scaleFactor)
            }))
        };
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
