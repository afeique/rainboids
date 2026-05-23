// Asteroid HP (1-3 base + gentle level ramp) + enemy level (player-anchored,
// wave-biased) scaling. Pure wave-data functions.
import {
    getEnemyLevel, getLevelScaledAsteroidStats,
    ENEMY_LEVEL_BIAS_EARLY, ENEMY_LEVEL_BIAS_LATE,
} from '../../js/modules/wave/wave-data.js';
import { MAX_WAVES } from '../../js/modules/core/constants.js';

describe('Asteroid HP — 1-3 base, gentle level ramp', () => {
    test('a level-1 rock keeps its base HP (1-3)', () => {
        expect(getLevelScaledAsteroidStats(1, 1)).toBe(1);
        expect(getLevelScaledAsteroidStats(2, 1)).toBe(2);
        expect(getLevelScaledAsteroidStats(3, 1)).toBe(3);
    });
    test('HP scales up with level (+25%/level)', () => {
        // base 3 → L5: round(3 * (1 + 4*0.25)) = round(3*2.0) = 6
        expect(getLevelScaledAsteroidStats(3, 5)).toBe(6);
        // base 1 → L10: round(1 * (1 + 9*0.25)) = round(3.25) = 3
        expect(getLevelScaledAsteroidStats(1, 10)).toBe(3);
    });
    test('HP is monotonically non-decreasing with level', () => {
        let prev = 0;
        for (let L = 1; L <= 15; L++) {
            const h = getLevelScaledAsteroidStats(3, L);
            expect(h).toBeGreaterThanOrEqual(prev);
            prev = h;
        }
    });
    test('never drops below 1', () => {
        expect(getLevelScaledAsteroidStats(1, 1)).toBeGreaterThanOrEqual(1);
    });
});

describe('Enemy level — tracks player level, biased by wave', () => {
    test('early waves spawn enemies BELOW the player level', () => {
        const pl = 10;
        const lvl = getEnemyLevel(1, pl);
        expect(lvl).toBe(pl + ENEMY_LEVEL_BIAS_EARLY); // 10 - 2 = 8
        expect(lvl).toBeLessThan(pl);
    });
    test('the final wave spawns enemies ABOVE the player level', () => {
        const pl = 10;
        const lvl = getEnemyLevel(MAX_WAVES, pl);
        expect(lvl).toBe(pl + ENEMY_LEVEL_BIAS_LATE); // 10 + 4 = 14
        expect(lvl).toBeGreaterThan(pl);
    });
    test('mid-run, enemies are about the player level', () => {
        const pl = 20;
        const mid = getEnemyLevel(Math.ceil(MAX_WAVES / 2), pl);
        expect(Math.abs(mid - pl)).toBeLessThanOrEqual(2);
    });
    test('enemy level rises monotonically across the run', () => {
        let prev = 0;
        for (let w = 1; w <= MAX_WAVES; w++) {
            const lvl = getEnemyLevel(w, 15);
            expect(lvl).toBeGreaterThanOrEqual(prev);
            prev = lvl;
        }
    });
    test('a fresh account (level 1) faces gentle early enemies (clamped ≥1)', () => {
        expect(getEnemyLevel(1, 1)).toBe(1); // 1 - 2 clamps to 1
    });
    test('a very high-level account is clamped (curve stays bounded)', () => {
        const lvl = getEnemyLevel(MAX_WAVES, 100);
        expect(lvl).toBeLessThanOrEqual(MAX_WAVES + 15);
        expect(lvl).toBeGreaterThan(MAX_WAVES); // still tough
    });
    test('defaults to player level 1 when omitted', () => {
        expect(getEnemyLevel(1)).toBe(1);
        expect(getEnemyLevel(MAX_WAVES)).toBe(1 + ENEMY_LEVEL_BIAS_LATE);
    });
});
