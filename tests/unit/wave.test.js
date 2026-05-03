/**
 * tests/unit/wave.test.js — unit tests for wave-data.js (20-wave campaign).
 *
 * Tests getWaveConfig, getEnemyLevel, getAsteroidLevel,
 * getLevelScaledEnemyStats, getLevelScaledAsteroidStats, isBossWave.
 */

import {
  getWaveConfig,
  getEnemyLevel,
  getAsteroidLevel,
  getLevelScaledEnemyStats,
  getLevelScaledAsteroidStats,
  getEnemySpeedMultiplier,
  isBossWave,
  BOSS_TIER_STATS,
  WAVE_DATA,
} from '../../js/modules/wave/wave-data.js';
import { MAX_WAVES, BOSS_WAVES } from '../../js/modules/core/constants.js';

// ---------------------------------------------------------------------------
// getWaveConfig()
// ---------------------------------------------------------------------------

describe('getWaveConfig() – 20-wave campaign', () => {
  test('wave 1 has asteroids and at least one enemy', () => {
    const cfg = getWaveConfig(1);
    expect(cfg).toBeDefined();
    expect(cfg.asteroids).toBeGreaterThan(0);
    expect(cfg.enemies.length).toBeGreaterThanOrEqual(1);
    expect(cfg.enemies[0].type).toBe('HUNTER');
  });

  test('every wave 1-20 returns a valid config', () => {
    for (let w = 1; w <= MAX_WAVES; w++) {
      const cfg = getWaveConfig(w);
      expect(cfg).toBeDefined();
      expect(typeof cfg.asteroids).toBe('number');
      expect(Array.isArray(cfg.enemies)).toBe(true);
      for (const e of cfg.enemies) {
        expect(typeof e.type).toBe('string');
        expect(typeof e.count).toBe('number');
        expect(e.count).toBeGreaterThan(0);
      }
    }
  });

  test('boss waves are marked isBossWave + bossTier and contain a TITAN with isBoss', () => {
    for (const w of BOSS_WAVES) {
      const cfg = getWaveConfig(w);
      expect(cfg.isBossWave).toBe(true);
      expect(cfg.bossTier).toBeGreaterThanOrEqual(1);
      expect(cfg.bossTier).toBeLessThanOrEqual(4);
      const titan = cfg.enemies.find(e => e.type === 'TITAN' && e.isBoss);
      expect(titan).toBeDefined();
      expect(titan.bossTier).toBe(cfg.bossTier);
    }
  });

  test('non-boss waves do not set isBossWave', () => {
    for (let w = 1; w <= MAX_WAVES; w++) {
      if (BOSS_WAVES.includes(w)) continue;
      const cfg = getWaveConfig(w);
      expect(cfg.isBossWave).toBeFalsy();
    }
  });

  test('out-of-range waves clamp to wave 1 / wave 20 entries', () => {
    expect(getWaveConfig(0)).toEqual(getWaveConfig(1));
    expect(getWaveConfig(-5)).toEqual(getWaveConfig(1));
    expect(getWaveConfig(MAX_WAVES + 1)).toEqual(getWaveConfig(MAX_WAVES));
    expect(getWaveConfig(999)).toEqual(getWaveConfig(MAX_WAVES));
  });

  test('isBossWave matches BOSS_WAVES', () => {
    for (const w of BOSS_WAVES) expect(isBossWave(w)).toBe(true);
    for (let w = 1; w <= MAX_WAVES; w++) {
      if (!BOSS_WAVES.includes(w)) expect(isBossWave(w)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// getEnemyLevel() / getAsteroidLevel()
// ---------------------------------------------------------------------------

describe('getEnemyLevel()', () => {
  test('level equals wave number across the campaign', () => {
    for (let w = 1; w <= MAX_WAVES; w++) {
      expect(getEnemyLevel(w)).toBe(w);
    }
  });

  test('clamps below 1 / above MAX_WAVES', () => {
    expect(getEnemyLevel(0)).toBe(1);
    expect(getEnemyLevel(-3)).toBe(1);
    expect(getEnemyLevel(MAX_WAVES + 5)).toBe(MAX_WAVES);
  });

  test('returns integer values', () => {
    for (let w = 1; w <= 30; w++) expect(Number.isInteger(getEnemyLevel(w))).toBe(true);
  });
});

describe('getAsteroidLevel()', () => {
  test('rises every other wave', () => {
    expect(getAsteroidLevel(1)).toBe(1);
    expect(getAsteroidLevel(2)).toBe(1);
    expect(getAsteroidLevel(3)).toBe(2);
    expect(getAsteroidLevel(10)).toBe(5);
    expect(getAsteroidLevel(MAX_WAVES)).toBe(10);
  });

  test('always >= 1, integer-valued', () => {
    for (let w = 1; w <= 30; w++) {
      const lvl = getAsteroidLevel(w);
      expect(Number.isInteger(lvl)).toBe(true);
      expect(lvl).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Level scaling
// ---------------------------------------------------------------------------

describe('getLevelScaledEnemyStats()', () => {
  const BASE = { health: 10, speed: 2, size: 30, shootRate: 1, points: 100 };

  test('level 1 returns base stats unchanged', () => {
    const scaled = getLevelScaledEnemyStats(BASE, 1);
    expect(scaled.health).toBe(BASE.health);
    expect(scaled.speed).toBeCloseTo(BASE.speed);
    expect(scaled.size).toBe(BASE.size);
    expect(scaled.points).toBe(BASE.points);
  });

  test('health rises 10% per level', () => {
    expect(getLevelScaledEnemyStats(BASE, 2).health).toBe(Math.floor(BASE.health * 1.10));
    expect(getLevelScaledEnemyStats(BASE, 5).health).toBe(Math.floor(BASE.health * 1.40));
  });

  test('speed rises 4% per level (gentle on top of campaign mult)', () => {
    expect(getLevelScaledEnemyStats(BASE, 2).speed).toBeCloseTo(BASE.speed * 1.04);
    expect(getLevelScaledEnemyStats(BASE, 5).speed).toBeCloseTo(BASE.speed * 1.16);
  });

  test('size stays constant across levels', () => {
    for (const lvl of [1, 5, 10, 20]) {
      expect(getLevelScaledEnemyStats(BASE, lvl).size).toBe(BASE.size);
    }
  });

  test('points rise 15% per level', () => {
    expect(getLevelScaledEnemyStats(BASE, 3).points).toBe(Math.floor(BASE.points * 1.30));
  });

  test('returns integer health and points', () => {
    for (const lvl of [1, 2, 7, 15]) {
      const s = getLevelScaledEnemyStats(BASE, lvl);
      expect(Number.isInteger(s.health)).toBe(true);
      expect(Number.isInteger(s.points)).toBe(true);
    }
  });
});

describe('getLevelScaledAsteroidStats()', () => {
  test('level 1 returns base health unchanged', () => {
    expect(getLevelScaledAsteroidStats(10, 1)).toBe(10);
  });

  test('health rises 18% per level', () => {
    expect(getLevelScaledAsteroidStats(10, 2)).toBe(Math.floor(10 * 1.18));
    expect(getLevelScaledAsteroidStats(10, 5)).toBe(Math.floor(10 * 1.72));
  });

  test('returns an integer', () => {
    for (const lvl of [1, 3, 7, 10]) {
      expect(Number.isInteger(getLevelScaledAsteroidStats(10, lvl))).toBe(true);
    }
  });
});

describe('getEnemySpeedMultiplier()', () => {
  test('starts low at wave 1 and climbs aggressively', () => {
    const w1 = getEnemySpeedMultiplier(1);
    const w20 = getEnemySpeedMultiplier(20);
    expect(w1).toBeLessThan(0.8);              // gentle intro
    expect(w20).toBeGreaterThan(2.0);          // hits ~2.17× at the end
    expect(w20).toBeGreaterThan(w1);
  });

  test('clamps below 1 / above MAX_WAVES', () => {
    expect(getEnemySpeedMultiplier(0)).toBeCloseTo(getEnemySpeedMultiplier(1));
    expect(getEnemySpeedMultiplier(99)).toBeCloseTo(getEnemySpeedMultiplier(MAX_WAVES));
  });
});

describe('BOSS_TIER_STATS', () => {
  test('all four tiers exist and HP/size/points scale upward', () => {
    for (const tier of [1, 2, 3, 4]) {
      const t = BOSS_TIER_STATS[tier];
      expect(t).toBeDefined();
      expect(t.hpMul).toBeGreaterThan(1);
      expect(t.sizeMul).toBeGreaterThan(1);
      expect(t.points).toBeGreaterThan(0);
    }
    expect(BOSS_TIER_STATS[4].hpMul).toBeGreaterThan(BOSS_TIER_STATS[1].hpMul);
    expect(BOSS_TIER_STATS[4].sizeMul).toBeGreaterThan(BOSS_TIER_STATS[1].sizeMul);
    expect(BOSS_TIER_STATS[4].points).toBeGreaterThan(BOSS_TIER_STATS[1].points);
  });
});
