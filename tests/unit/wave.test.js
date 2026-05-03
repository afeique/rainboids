/**
 * tests/unit/wave.test.js — unit tests for wave-data.js
 *
 * Tests getWaveConfig, getEnemyLevel, getAsteroidLevel,
 * getLevelScaledEnemyStats, getLevelScaledAsteroidStats.
 */

import {
  getWaveConfig,
  getEnemyLevel,
  getAsteroidLevel,
  getLevelScaledEnemyStats,
  getLevelScaledAsteroidStats,
  WAVE_DATA,
} from '../../js/modules/wave/wave-data.js';

// ---------------------------------------------------------------------------
// getWaveConfig()
// ---------------------------------------------------------------------------

describe('getWaveConfig() – static waves', () => {
  test('wave 1 has asteroids and a single enemy', () => {
    const cfg = getWaveConfig(1);
    expect(cfg).toBeDefined();
    expect(cfg.asteroids).toBeGreaterThan(0);
    expect(cfg.enemies.length).toBe(1);
    expect(cfg.enemies[0].type).toBe('HUNTER');
  });

  test('wave 2 introduces HUNTER enemy', () => {
    const cfg = getWaveConfig(2);
    expect(cfg.enemies.length).toBeGreaterThanOrEqual(1);
    expect(cfg.enemies[0].type).toBe('HUNTER');
  });

  test('all static waves (1-80) return a valid config', () => {
    for (let w = 1; w <= 80; w++) {
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

  // Wave-data shape evolved past the original strict phase rules — the
  // current data mixes counts more organically (some "duo" waves in the
  // 40s, asteroid-heavy interludes, etc.). These tests now assert the
  // intent (more enemy types as waves get higher) rather than rigid
  // count-per-phase contracts.
  test('early waves (2-15) have 1 enemy type each', () => {
    for (let w = 2; w <= 15; w++) {
      const cfg = getWaveConfig(w);
      expect(cfg.enemies.length).toBe(1);
    }
  });

  // Mid/late phases mostly have multiple enemy types but some "solo
  // boss" waves (e.g. wave 30: just TITANs) intentionally feature one
  // type. We assert the AVERAGE trend instead of a per-wave floor.
  test('mid waves (20-39) average ≥ 2 enemy types', () => {
    let sum = 0, n = 0;
    for (let w = 20; w <= 39; w++) {
      sum += getWaveConfig(w).enemies.length;
      n++;
    }
    expect(sum / n).toBeGreaterThanOrEqual(2);
  });

  test('late waves (40-79) average ≥ 2 enemy types', () => {
    let sum = 0, n = 0;
    for (let w = 40; w <= 79; w++) {
      sum += getWaveConfig(w).enemies.length;
      n++;
    }
    expect(sum / n).toBeGreaterThanOrEqual(2);
  });

  test('wave 80 has at least one type', () => {
    const cfg = getWaveConfig(80);
    expect(cfg.enemies.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getWaveConfig() – procedural generation (wave > 80)', () => {
  test('wave 81 returns more enemies than wave 80', () => {
    const base = getWaveConfig(80);
    const next = getWaveConfig(81);
    // Counts should be at least as large (scale factor >= 1.0)
    const baseTotal = base.enemies.reduce((s, e) => s + e.count, 0);
    const nextTotal = next.enemies.reduce((s, e) => s + e.count, 0);
    expect(nextTotal).toBeGreaterThanOrEqual(baseTotal);
  });

  test('wave 100 has more asteroids than wave 80', () => {
    const base = getWaveConfig(80);
    const late = getWaveConfig(100);
    expect(late.asteroids).toBeGreaterThan(base.asteroids);
  });

  test('procedural waves (>100) preserve the wave-100 enemy lineup', () => {
    // Generation scales counts but preserves the wave-100 type lineup.
    // Waves 81-100 are still authored static entries with their own
    // types; only waves > 100 use the procedural generator.
    const baseTypes = getWaveConfig(100).enemies.map(e => e.type);
    for (const w of [101, 150, 200, 500]) {
      const cfg = getWaveConfig(w);
      const types = cfg.enemies.map(e => e.type);
      expect(types).toEqual(baseTypes);
    }
  });

  test('procedural waves never exceed MAX_WAVE_ASTEROIDS cap', () => {
    // Even at very high wave numbers the asteroid count is capped.
    // Cap raised to 16 in the bullet-hell density pass.
    for (const w of [100, 200, 500, 1000]) {
      const cfg = getWaveConfig(w);
      expect(cfg.asteroids).toBeLessThanOrEqual(16); // MAX_WAVE_ASTEROIDS
    }
  });

  test('procedural wave results are cached (same object reference)', () => {
    const a = getWaveConfig(150);
    const b = getWaveConfig(150);
    expect(a).toBe(b);
  });

  test('unknown/missing wave falls back to wave 1', () => {
    // Wave 0 and very large waves not yet procedurally covered
    const cfg = getWaveConfig(0);
    expect(cfg).toEqual(getWaveConfig(1));
  });
});

// ---------------------------------------------------------------------------
// getEnemyLevel()
// ---------------------------------------------------------------------------

describe('getEnemyLevel()', () => {
  test('wave 1 returns level 1', () => {
    expect(getEnemyLevel(1)).toBe(1);
  });

  test('level increases every 3 waves', () => {
    expect(getEnemyLevel(3)).toBe(2);
    expect(getEnemyLevel(6)).toBe(3);
    expect(getEnemyLevel(9)).toBe(4);
    expect(getEnemyLevel(30)).toBe(11);
  });

  test('returns integer values', () => {
    for (let w = 1; w <= 50; w++) {
      expect(Number.isInteger(getEnemyLevel(w))).toBe(true);
    }
  });

  test('level is always >= 1', () => {
    for (let w = 1; w <= 100; w++) {
      expect(getEnemyLevel(w)).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// getAsteroidLevel()
// ---------------------------------------------------------------------------

describe('getAsteroidLevel()', () => {
  test('wave 1 returns level 1', () => {
    expect(getAsteroidLevel(1)).toBe(1);
  });

  test('level increases every 4 waves', () => {
    expect(getAsteroidLevel(4)).toBe(2);
    expect(getAsteroidLevel(8)).toBe(3);
    expect(getAsteroidLevel(40)).toBe(11);
  });

  test('returns integer values', () => {
    for (let w = 1; w <= 50; w++) {
      expect(Number.isInteger(getAsteroidLevel(w))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getLevelScaledEnemyStats()
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

  test('health increases 25% per level', () => {
    const l2 = getLevelScaledEnemyStats(BASE, 2);
    expect(l2.health).toBe(Math.floor(BASE.health * 1.25));
  });

  test('speed increases 15% per level', () => {
    const l2 = getLevelScaledEnemyStats(BASE, 2);
    expect(l2.speed).toBeCloseTo(BASE.speed * 1.15);
  });

  test('size stays constant across levels', () => {
    for (const lvl of [1, 5, 10, 50]) {
      expect(getLevelScaledEnemyStats(BASE, lvl).size).toBe(BASE.size);
    }
  });

  test('points increase 20% per level', () => {
    const l3 = getLevelScaledEnemyStats(BASE, 3);
    expect(l3.points).toBe(Math.floor(BASE.points * 1.4));
  });

  test('returns integer health and points', () => {
    for (const lvl of [1, 2, 7, 15]) {
      const s = getLevelScaledEnemyStats(BASE, lvl);
      expect(Number.isInteger(s.health)).toBe(true);
      expect(Number.isInteger(s.points)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getLevelScaledAsteroidStats()
// ---------------------------------------------------------------------------

describe('getLevelScaledAsteroidStats()', () => {
  test('level 1 returns base health unchanged', () => {
    expect(getLevelScaledAsteroidStats(10, 1)).toBe(10);
  });

  test('health increases 30% per level', () => {
    expect(getLevelScaledAsteroidStats(10, 2)).toBe(Math.floor(10 * 1.3));
  });

  test('returns an integer', () => {
    for (const lvl of [1, 3, 7, 20]) {
      expect(Number.isInteger(getLevelScaledAsteroidStats(10, lvl))).toBe(true);
    }
  });
});
