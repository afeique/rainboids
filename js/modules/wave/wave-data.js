// Wave configuration data for enemy and asteroid spawning.
//
// 20-wave campaign — meta-goal is finishing the run as fast as possible.
//   Waves  1– 4 : First Contact     (gentle intro, low threat density)
//   Wave   5    : BOSS — Iron Giant (TITAN bossTier 1 + escort)
//   Waves  6– 9 : Escalation        (combined arms, type variety)
//   Wave  10    : BOSS — Twin Iron  (2× TITAN bossTier 2)
//   Waves 11–14 : The Gauntlet      (full type roster, dense)
//   Wave  15    : BOSS — Triple Threat (3× TITAN bossTier 3)
//   Waves 16–19 : Endgame Approach  (everything at once)
//   Wave  20    : FINAL BOSS — The Last Stand (4× TITAN bossTier 4)

import { GAME_CONFIG, MAX_WAVES, BOSS_WAVES } from '../core/constants.js';

export const WAVE_DATA = {

    // ── Act I: First Contact ──
    1: { asteroids: 5, enemies: [{ type: 'HUNTER', count: 2 }] },
    2: { asteroids: 6, enemies: [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 1 }] },
    3: { asteroids: 6, enemies: [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }] },
    4: { asteroids: 5, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }] },

    // ── Boss 1: Iron Giant ──
    5: {
        asteroids: 2, isBossWave: true, bossTier: 1,
        enemies: [{ type: 'TITAN', count: 1, isBoss: true, bossTier: 1 }, { type: 'GUARDIAN', count: 2 }],
    },

    // ── Act II: Escalation ──
    6: { asteroids: 5, enemies: [{ type: 'STALKER', count: 2 }, { type: 'HUNTER', count: 2 }] },
    7: { asteroids: 5, enemies: [{ type: 'DRIFTER', count: 2 }, { type: 'TANGERINE', count: 1 }, { type: 'HUNTER', count: 2 }] },
    8: { asteroids: 5, enemies: [{ type: 'HUNTER', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'SENTINEL', count: 1 }] },
    9: { asteroids: 4, enemies: [{ type: 'WEAVER', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'WASP', count: 2 }] },

    // ── Boss 2: Twin Iron ──
    10: {
        asteroids: 1, isBossWave: true, bossTier: 2,
        enemies: [{ type: 'TITAN', count: 2, isBoss: true, bossTier: 2 }, { type: 'GUARDIAN', count: 2 }],
    },

    // ── Act III: The Gauntlet ──
    11: { asteroids: 4, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }] },
    12: { asteroids: 4, enemies: [{ type: 'STALKER', count: 3 }, { type: 'PROWLER', count: 2 }, { type: 'DRIFTER', count: 1 }] },
    13: { asteroids: 4, enemies: [{ type: 'WASP', count: 4 }, { type: 'HUNTER', count: 2 }, { type: 'WEAVER', count: 1 }] },
    14: { asteroids: 3, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'PROWLER', count: 1 }] },

    // ── Boss 3: Triple Threat ──
    15: {
        asteroids: 1, isBossWave: true, bossTier: 3,
        enemies: [{ type: 'TITAN', count: 3, isBoss: true, bossTier: 3 }, { type: 'SENTINEL', count: 1 }],
    },

    // ── Act IV: Endgame Approach ──
    16: { asteroids: 3, enemies: [
        { type: 'HUNTER',   count: 1 },
        { type: 'GUARDIAN', count: 1 },
        { type: 'WASP',     count: 1 },
        { type: 'STALKER',  count: 1 },
        { type: 'DRIFTER',  count: 1 },
    ] },
    17: { asteroids: 3, enemies: [{ type: 'WEAVER', count: 2 }, { type: 'WASP', count: 2 }, { type: 'DRIFTER', count: 2 }, { type: 'STALKER', count: 1 }] },
    18: { asteroids: 3, enemies: [{ type: 'TITAN', count: 1 }, { type: 'TANGERINE', count: 2 }, { type: 'SENTINEL', count: 1 }, { type: 'HUNTER', count: 2 }] },
    19: { asteroids: 2, enemies: [
        { type: 'HUNTER',    count: 1 },
        { type: 'GUARDIAN',  count: 1 },
        { type: 'WASP',      count: 1 },
        { type: 'STALKER',   count: 1 },
        { type: 'DRIFTER',   count: 1 },
        { type: 'PROWLER',   count: 1 },
        { type: 'WEAVER',    count: 1 },
        { type: 'SENTINEL',  count: 1 },
        { type: 'TANGERINE', count: 1 },
    ] },

    // ── Final Boss: The Last Stand ──
    20: {
        asteroids: 1, isBossWave: true, bossTier: 4, isFinalBoss: true,
        enemies: [
            { type: 'TITAN',    count: 4, isBoss: true, bossTier: 4 },
            { type: 'GUARDIAN', count: 2 },
            { type: 'SENTINEL', count: 2 },
        ],
    },
};

// Helper function to get wave configuration. Past MAX_WAVES we just clamp
// to the final boss wave — the run loop should transition to GAME_COMPLETE
// before getWaveConfig is called for wave 21+.
export function getWaveConfig(waveNumber) {
    const w = Math.max(1, Math.min(MAX_WAVES, waveNumber | 0));
    return WAVE_DATA[w] || WAVE_DATA[1];
}

// Returns true when this wave is a scripted boss wave.
export function isBossWave(waveNumber) {
    return BOSS_WAVES.includes(waveNumber);
}

// 1 → 20 across the campaign so per-wave scaling formulas can use the wave
// number directly. Each wave is a distinct level — no plateaus.
export function getEnemyLevel(waveNumber) {
    return Math.max(1, Math.min(MAX_WAVES, waveNumber | 0));
}

// Asteroid level lifts every other wave (1,1,2,2,3,3,...,10,10) so rocks
// don't outpace the player's weapon scaling.
export function getAsteroidLevel(waveNumber) {
    const w = Math.max(1, Math.min(MAX_WAVES, waveNumber | 0));
    return Math.max(1, Math.ceil(w / 2));
}

// Enemy speed multiplier — starts low, climbs aggressively. Wave 1 ≈ 0.65×
// base speed (gentle intro), wave 20 ≈ 2.17× (full chase pace). The user
// asked for "start slow, scale fairly quickly" — this curve does that.
export function getEnemySpeedMultiplier(waveNumber) {
    const w = Math.max(1, Math.min(MAX_WAVES, waveNumber | 0));
    return 0.65 + (w - 1) * 0.08;
}

// Enemy bullet speed multiplier — same curve as enemy speed so projectiles
// scale with their owners.
export function getEnemyBulletSpeedMultiplier(waveNumber) {
    return getEnemySpeedMultiplier(waveNumber);
}

// ── Wave Subtitles ──────────────────────────────────────────────────────
// Pithy one-liners displayed during wave intros (one per wave for the
// 20-wave run, plus generic backups in case a wave is added later).
export const WAVE_SUBTITLES = {
    1:  "Don't worry, they die easy.",
    2:  "Okay maybe worry a little.",
    3:  "They brought friends.",
    4:  "These ones are chonky.",
    5:  "BOSS — Iron Giant. Aim for the bolts.",
    6:  "Laser tag, but unfair.",
    7:  "Storms in space — who knew?",
    8:  "They learned teamwork. Rude.",
    9:  "Webs in space. Sure, why not.",
    10: "BOSS — Twin Iron. Doubled, redoubled.",
    11: "Combined arms. Pick your poison.",
    12: "Sniper alley. Don't stand still.",
    13: "Speed demons. Don't blink.",
    14: "Defense wall. Bring a hammer.",
    15: "BOSS — Triple Threat. Three. Of. Them.",
    16: "All-star roster. They're showing off.",
    17: "Bullet hell sample platter.",
    18: "Apocalypse. The light at the end is a missile.",
    19: "Final frontier. Everyone wants a piece.",
    20: "FINAL BOSS — The Last Stand.",
};

// Generic subtitles, only used if WAVE_SUBTITLES is missing an entry.
export const WAVE_SUBTITLES_GENERIC = [
    "Good luck. You'll need it.",
    "Still alive? Impressive.",
    "They keep coming!",
    "This is getting ridiculous.",
    "You're built different.",
];

// Level-scaled enemy stats. Compressed for the 20-wave run — HP +10%/level
// (≈2.9× at wave 20), points +15%/level. Speed scaling is handled
// separately via getEnemySpeedMultiplier so the campaign-wide ramp is
// applied uniformly to every enemy regardless of base speed.
export function getLevelScaledEnemyStats(baseStats, level) {
    return {
        health: Math.floor(baseStats.health * (1 + (level - 1) * 0.10)),
        speed: baseStats.speed * (1 + (level - 1) * 0.04), // gentle on top of campaign mult
        size: baseStats.size,
        shootRate: baseStats.shootRate,
        points: Math.floor(baseStats.points * (1 + (level - 1) * 0.15)),
    };
}

// Asteroid HP scaling — 18%/level so wave 20 rocks (level 10) have ~2.6×
// base HP, keeping them chewable but meaningful end-of-run.
export function getLevelScaledAsteroidStats(baseHealth, level) {
    return Math.floor(baseHealth * (1 + (level - 1) * 0.18));
}

// Boss HP / size multipliers per boss tier (1 → 4). Boss enemies are TITAN
// at the boss waves (5/10/15/20) and get these multipliers stacked on top
// of normal level scaling. Tier 4 is the final boss.
export const BOSS_TIER_STATS = {
    1: { hpMul: 4.0, sizeMul: 1.35, speedMul: 1.0,  points: 500 },
    2: { hpMul: 5.0, sizeMul: 1.45, speedMul: 1.05, points: 1000 },
    3: { hpMul: 6.0, sizeMul: 1.55, speedMul: 1.10, points: 1750 },
    4: { hpMul: 8.0, sizeMul: 1.75, speedMul: 1.15, points: 3000 },
};
