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
import { isMobile } from '../platform/platform-detect.js';

// 5.75.0 — Each wave is now a SEQUENCE of sub-waves instead of a single
// burst spawn. `subWaves` is an array of enemy-group arrays; the wave
// manager spawns sub-wave 0 at wave start, sub-wave 1 when ≤2 enemies
// remain (or after a 12s fallback), etc. Wave only ends when ALL
// sub-waves have spawned AND every enemy is dead. Result: waves last
// 2–3× longer, density stays manageable, and the player gets time
// between pulses to breathe / collect orbs / spend picks. Boss waves
// hold the boss in the final sub-wave so the escort softens the player
// up first. All non-boss waves get a CHANCE for a mid-wave mini-boss
// (see wave-manager.spawnLeveledEnemies — the chance is wave-scaled).
export const WAVE_DATA = {

    // 5.79.16 — Enemy + asteroid counts scaled up across the campaign
    //   (~+60% enemies, ~+33% asteroids) so per-wave XP yields keep
    //   pace with the new linear XP curve targeting ~1.5 levels per
    //   wave. See docs/XP_BALANCE_REWORK_5.79.md for the analysis.

    // ── Act I: First Contact ──
    1: { asteroids: 4, subWaves: [
        [{ type: 'HUNTER', count: 3 }],
        [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 2 }],
    ] },
    2: { asteroids: 4, subWaves: [
        [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
        [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
    ] },
    3: { asteroids: 4, subWaves: [
        [{ type: 'HUNTER', count: 4 }],
        [{ type: 'WASP', count: 4 }],
        [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
    ] },
    4: { asteroids: 4, subWaves: [
        [{ type: 'GUARDIAN', count: 3 }],
        [{ type: 'WASP', count: 4 }, { type: 'HUNTER', count: 1 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'HUNTER', count: 4 }],
    ] },

    // ── Boss 1: Iron Giant — escort softens, then boss arrives. ──
    5: {
        asteroids: 3, isBossWave: true, bossTier: 1,
        subWaves: [
            [{ type: 'GUARDIAN', count: 4 }, { type: 'HUNTER', count: 3 }],
            [{ type: 'WASP', count: 3 }, { type: 'STALKER', count: 1 }],
            [{ type: 'TITAN', count: 1, isBoss: true, bossTier: 1 }, { type: 'GUARDIAN', count: 3 }, { type: 'HUNTER', count: 2 }],
        ],
    },

    // ── Act II: Escalation ──
    6: { asteroids: 4, subWaves: [
        [{ type: 'STALKER', count: 3 }],
        [{ type: 'HUNTER', count: 4 }, { type: 'WASP', count: 1 }],
        [{ type: 'STALKER', count: 2 }, { type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
    ] },
    7: { asteroids: 4, subWaves: [
        [{ type: 'DRIFTER', count: 3 }],
        [{ type: 'TANGERINE', count: 3 }, { type: 'HUNTER', count: 3 }],
        [{ type: 'DRIFTER', count: 2 }, { type: 'HUNTER', count: 4 }, { type: 'WASP', count: 1 }],
    ] },
    8: { asteroids: 4, subWaves: [
        [{ type: 'HUNTER', count: 3 }, { type: 'STALKER', count: 2 }],
        [{ type: 'STALKER', count: 3 }, { type: 'SENTINEL', count: 1 }],
        [{ type: 'SENTINEL', count: 2 }, { type: 'HUNTER', count: 4 }, { type: 'STALKER', count: 1 }],
    ] },
    9: { asteroids: 3, subWaves: [
        [{ type: 'WEAVER', count: 2 }, { type: 'WASP', count: 3 }],
        [{ type: 'PROWLER', count: 3 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'PROWLER', count: 1 }, { type: 'WASP', count: 2 }, { type: 'HUNTER', count: 1 }],
    ] },

    // ── Boss 2: Twin Iron — three escort waves, then twin bosses. ──
    10: {
        asteroids: 2, isBossWave: true, bossTier: 2,
        subWaves: [
            [{ type: 'GUARDIAN', count: 3 }, { type: 'HUNTER', count: 3 }],
            [{ type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'WASP', count: 2 }],
            [{ type: 'TITAN', count: 2, isBoss: true, bossTier: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 1 }],
        ],
    },

    // ── Act III: The Gauntlet ──
    11: { asteroids: 3, subWaves: [
        [{ type: 'HUNTER', count: 5 }, { type: 'WASP', count: 2 }],
        [{ type: 'GUARDIAN', count: 3 }, { type: 'HUNTER', count: 3 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'WASP', count: 3 }],
    ] },
    12: { asteroids: 3, subWaves: [
        [{ type: 'STALKER', count: 3 }, { type: 'WASP', count: 2 }],
        [{ type: 'PROWLER', count: 3 }, { type: 'DRIFTER', count: 2 }],
        [{ type: 'STALKER', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'HUNTER', count: 3 }],
    ] },
    13: { asteroids: 3, subWaves: [
        [{ type: 'WASP', count: 6 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'HUNTER', count: 3 }],
        [{ type: 'WASP', count: 3 }, { type: 'WEAVER', count: 2 }, { type: 'HUNTER', count: 3 }],
    ] },
    14: { asteroids: 3, subWaves: [
        [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 2 }],
        [{ type: 'SENTINEL', count: 3 }, { type: 'PROWLER', count: 2 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'STALKER', count: 3 }],
    ] },

    // ── Boss 3: Triple Threat — three escort waves before triple TITAN. ──
    15: {
        asteroids: 2, isBossWave: true, bossTier: 3,
        subWaves: [
            [{ type: 'GUARDIAN', count: 3 }, { type: 'STALKER', count: 2 }],
            [{ type: 'SENTINEL', count: 3 }, { type: 'WASP', count: 3 }],
            [{ type: 'TITAN', count: 3, isBoss: true, bossTier: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'GUARDIAN', count: 1 }],
        ],
    },

    // ── Act IV: Endgame Approach ──
    16: { asteroids: 3, subWaves: [
        [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 3 }],
        [{ type: 'GUARDIAN', count: 3 }, { type: 'STALKER', count: 2 }],
        [{ type: 'STALKER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
    ] },
    17: { asteroids: 3, subWaves: [
        [{ type: 'WEAVER', count: 3 }],
        [{ type: 'WASP', count: 5 }, { type: 'DRIFTER', count: 2 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'WASP', count: 3 }, { type: 'DRIFTER', count: 2 }, { type: 'HUNTER', count: 1 }],
    ] },
    18: { asteroids: 3, subWaves: [
        [{ type: 'TANGERINE', count: 2 }, { type: 'HUNTER', count: 3 }],
        [{ type: 'SENTINEL', count: 3 }, { type: 'STALKER', count: 2 }],
        [{ type: 'TITAN', count: 1 }, { type: 'TANGERINE', count: 2 }, { type: 'HUNTER', count: 3 }, { type: 'SENTINEL', count: 1 }],
    ] },
    19: { asteroids: 3, subWaves: [
        [{ type: 'HUNTER', count: 3 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }],
        [{ type: 'STALKER', count: 2 }, { type: 'DRIFTER', count: 2 }, { type: 'WEAVER', count: 2 }],
        [{ type: 'TANGERINE', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'HUNTER', count: 3 }, { type: 'WASP', count: 3 }],
    ] },

    // ── Final Boss: The Last Stand. ──
    20: {
        asteroids: 2, isBossWave: true, bossTier: 4, isFinalBoss: true,
        subWaves: [
            [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'STALKER', count: 2 }],
            [{ type: 'PROWLER', count: 2 }, { type: 'WEAVER', count: 2 }, { type: 'TANGERINE', count: 2 }],
            [{ type: 'TITAN', count: 3, isBoss: true, bossTier: 4 }, { type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'STALKER', count: 1 }],
        ],
    },
};

// Helper function to get wave configuration. Past MAX_WAVES we just clamp
// to the final boss wave — the run loop should transition to GAME_COMPLETE
// before getWaveConfig is called for wave 21+.
//
// 5.99.1 — Mobile difficulty pass. The desktop wave roster is balanced
// for keyboard + mouse precision; on mobile the player has one finger,
// no movement, and a small viewport — having ~15 enemies in a sub-wave
// (e.g. wave 13: 6 WASPs) is overwhelming. Apply a per-group multiplier
// to thin the spawns so the mobile playfield reads as casual / clear.
// Asteroid counts also drop. Bosses (count×bossTier) are preserved so
// the campaign milestones still feel like milestones.
//
// Multipliers (mobile):
//   - non-boss enemy counts × 0.45  (with a 1-floor)
//   - asteroid counts × 0.40        (with a 1-floor on non-boss waves)
//
// Boss waves keep the boss spawn intact (count + bossTier untouched);
// only their escort enemies get the reduction.
function _scaleConfigForMobile(cfg) {
    if (!cfg) return cfg;
    const ENEMY_MULT = 0.45;
    const ASTEROID_MULT = 0.40;
    const scaleCount = (n) => Math.max(1, Math.round(n * ENEMY_MULT));

    const scaledSubWaves = (cfg.subWaves || []).map((group) =>
        group.map((entry) => {
            // Don't thin the boss itself — only escort enemies.
            if (entry.isBoss) return { ...entry };
            return { ...entry, count: scaleCount(entry.count) };
        })
    );

    const scaledAsteroids = cfg.isBossWave
        ? Math.max(1, Math.round((cfg.asteroids || 0) * ASTEROID_MULT))
        : Math.max(1, Math.round((cfg.asteroids || 0) * ASTEROID_MULT));

    return { ...cfg, asteroids: scaledAsteroids, subWaves: scaledSubWaves };
}

// Per-wave cache so we don't deep-clone on every call. Keyed by wave
// number; invalidated only by a full page reload (isMobile() reads URL
// override + the live viewport state at module load).
const _mobileWaveCache = new Map();

export function getWaveConfig(waveNumber) {
    const w = Math.max(1, Math.min(MAX_WAVES, waveNumber | 0));
    const base = WAVE_DATA[w] || WAVE_DATA[1];
    if (!isMobile()) return base;
    if (_mobileWaveCache.has(w)) return _mobileWaveCache.get(w);
    const scaled = _scaleConfigForMobile(base);
    _mobileWaveCache.set(w, scaled);
    return scaled;
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

// Enemy speed multiplier — POWER CURVE so early waves are gentle and the
// late waves climb fast. 5.72.0 — ceiling cut from 2.55 → 1.75 because
// stacked with the per-level multiplier (now 1.40 at L20) the late-wave
// speed used to compound to 4.3× base, making enemies appear to "warp"
// across the screen between frames. New compound max: ~2.45× base.
//   formula: 0.55 + ((w-1)/19)^1.5 * 1.2
//   w=1: 0.55   w=5: 0.66   w=10: 0.94   w=15: 1.31   w=20: 1.75
export function getEnemySpeedMultiplier(waveNumber) {
    const w = Math.max(1, Math.min(MAX_WAVES, waveNumber | 0));
    const t = (w - 1) / (MAX_WAVES - 1);
    return 0.55 + Math.pow(t, 1.5) * 1.2;
}

// Enemy bullet speed multiplier — DECOUPLED from enemy movement so the
// floor can be raised. Wave 1 enemies still MOVE gently (helps the
// player learn) but their bullets fly at 1.15× base — considerably
// faster than the old 0.55× wave-1 floor. Late waves climb to 3.05×.
//
//   formula: 1.15 + ((w-1)/19)^1.4 * 1.9
//   w=1: 1.15   w=5: 1.37   w=10: 1.83   w=15: 2.40   w=20: 3.05
//
// (Was: same curve as enemy movement, 0.55..2.55. Wave 1 bullets now
// roughly 2× faster, wave 20 ~20% faster.)
export function getEnemyBulletSpeedMultiplier(waveNumber) {
    const w = Math.max(1, Math.min(MAX_WAVES, waveNumber | 0));
    const t = (w - 1) / (MAX_WAVES - 1);
    return 1.15 + Math.pow(t, 1.4) * 1.9;
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

// Level-scaled enemy stats — POWER-CURVED.
//
// 5.73.0 — HP curve flattened (exponent 1.6 → 1.0, scale 4.5 → 6.5)
// to ramp HP MUCH faster from wave 5 onward. Players reported the
// game stayed too easy in the mid-game; now wave 5 enemies have ~2.4×
// HP (was 1.37×), wave 10 ~4× (was 2.3×), wave 20 ~7.5× (was 5.5×).
//
//   HP    1 + ((L-1)/19)^1.0 · 6.5      L1: 1.0  L5: 2.37  L10: 4.08  L15: 5.79  L20: 7.50
//   pts   1 + ((L-1)/19)^1.4 · 5.5      L1: 1.0  L5: 1.50  L10: 2.55  L15: 4.00  L20: 6.50
//   spd   1 + ((L-1)/19)^1.4 · 0.4      L1: 1.00 L5: 1.03  L10: 1.11  L15: 1.22  L20: 1.40
export function getLevelScaledEnemyStats(baseStats, level) {
    const L = Math.max(1, level | 0);
    const t = (L - 1) / 19;
    // 5.76.0 — HP curve scaled up to match the post-5.75 player power
    // budget (Twin Cannon / Hailstorm / +120% Lance + crit-rush + Gold
    // Find compounding all stack DPS faster than the old curve handled).
    // Linear coefficient 6.5 → 8.0 and tail 4 → 6.5: wave 5 ~3.0×,
    // wave 10 ~5.5×, wave 15 ~8.5×, wave 20 ~15.5× (was 11.5×). Early
    // waves stay tractable; late waves now require the build to land.
    const hpMul = 1 + t * 8.0 + Math.pow(t, 2.5) * 6.5;
    const ptsMul = 1 + Math.pow(t, 1.4) * 5.5;
    const spdMul = 1 + Math.pow(t, 1.4) * 0.4;
    return {
        health: Math.floor(baseStats.health * hpMul),
        speed: baseStats.speed * spdMul,
        size: baseStats.size,
        shootRate: baseStats.shootRate,
        points: Math.floor(baseStats.points * ptsMul),
    };
}

// Asteroid HP — power-curved against asteroid level (1..10 across waves
// 1..20). Gentle through level 4 then sharply steeper.
// 5.73.0 — exponent 1.5 → 1.0, scale 4.0 → 6.5 to ramp asteroid HP
// much harder by wave 5+. Players hit the same plateau of "feels too
// easy mid-run" with asteroids as with enemies; this fix is parallel.
//   1 + ((L-1)/9)^1.0 · 6.5
//   L1: 1.0  L3: 2.44  L5: 3.89  L7: 5.33  L10: 7.50
export function getLevelScaledAsteroidStats(baseHealth, level) {
    const L = Math.max(1, level | 0);
    const t = (L - 1) / 9;
    const hpMul = 1 + t * 6.5;
    return Math.floor(baseHealth * hpMul);
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
