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
import { MAX_WAVES } from '../../js/modules/core/constants.js';

// 8.10.0 — WAVE_DATA's AUTHORED boss-group positions (every 3 — the table's
// static markers). Distinct from the live boss CADENCE (isBossWave, every 10):
// these authored positions still carry a boss-type group in the data table,
// which spawns as a tanky escort on non-boss-cadence waves.
const AUTHORED_BOSS_WAVES = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

// ---------------------------------------------------------------------------
// getWaveConfig()
// ---------------------------------------------------------------------------

describe('getWaveConfig() – 20-wave campaign', () => {
  // 5.75.0 — wave configs now use `subWaves: [[group, ...], ...]`
  // instead of a flat `enemies` array. Tests updated to walk the
  // nested structure.
  test('wave 1 has asteroids and at least one enemy in its first sub-wave', () => {
    const cfg = getWaveConfig(1);
    expect(cfg).toBeDefined();
    expect(cfg.asteroids).toBeGreaterThan(0);
    expect(Array.isArray(cfg.subWaves)).toBe(true);
    expect(cfg.subWaves.length).toBeGreaterThanOrEqual(1);
    expect(cfg.subWaves[0].length).toBeGreaterThanOrEqual(1);
    expect(cfg.subWaves[0][0].type).toBe('HUNTER');
  });

  test('every wave 1-20 returns a valid config with at least one sub-wave', () => {
    for (let w = 1; w <= MAX_WAVES; w++) {
      const cfg = getWaveConfig(w);
      expect(cfg).toBeDefined();
      expect(typeof cfg.asteroids).toBe('number');
      expect(Array.isArray(cfg.subWaves)).toBe(true);
      expect(cfg.subWaves.length).toBeGreaterThanOrEqual(1);
      for (const groups of cfg.subWaves) {
        expect(Array.isArray(groups)).toBe(true);
        for (const e of groups) {
          expect(typeof e.type).toBe('string');
          expect(typeof e.count).toBe('number');
          expect(e.count).toBeGreaterThan(0);
        }
      }
    }
  });

  test('authored boss-group waves are marked isBossWave + bossTier and contain a TITAN with isBoss', () => {
    for (const w of AUTHORED_BOSS_WAVES) {
      const cfg = getWaveConfig(w);
      expect(cfg.isBossWave).toBe(true);
      expect(cfg.bossTier).toBeGreaterThanOrEqual(1);
      expect(cfg.bossTier).toBeLessThanOrEqual(4);
      // TITAN with isBoss should appear in some sub-wave (typically the last).
      const allGroups = cfg.subWaves.flat();
      const titan = allGroups.find(e => e.type === 'TITAN' && e.isBoss);
      expect(titan).toBeDefined();
      expect(titan.bossTier).toBe(cfg.bossTier);
    }
  });

  test('non-authored-boss waves do not set the WAVE_DATA isBossWave marker', () => {
    for (let w = 1; w <= MAX_WAVES; w++) {
      if (AUTHORED_BOSS_WAVES.includes(w)) continue;
      const cfg = getWaveConfig(w);
      expect(cfg.isBossWave).toBeFalsy();
    }
  });

  test('out-of-range waves clamp to wave 1 / wave 30 entries', () => {
    expect(getWaveConfig(0)).toEqual(getWaveConfig(1));
    expect(getWaveConfig(-5)).toEqual(getWaveConfig(1));
    expect(getWaveConfig(MAX_WAVES + 1)).toEqual(getWaveConfig(MAX_WAVES));
    expect(getWaveConfig(999)).toEqual(getWaveConfig(MAX_WAVES));
  });

  test('isBossWave is the flat cadence — every 10th wave', () => {
    for (let w = 1; w <= 100; w++) {
      expect(isBossWave(w)).toBe(w % 10 === 0);
    }
  });
});

// ---------------------------------------------------------------------------
// Early-game variety front-loading (6.x early-engagement pass)
// ---------------------------------------------------------------------------

describe('early-game variety front-loading', () => {
  const typesInWave = (w) => new Set(getWaveConfig(w).subWaves.flat().map((e) => e.type));
  const typesUpToWave = (n) => {
    const s = new Set();
    for (let w = 1; w <= n; w++) for (const t of typesInWave(w)) s.add(t);
    return s;
  };

  test('wave 1 still opens with HUNTER (gentlest intro preserved)', () => {
    expect(getWaveConfig(1).subWaves[0][0].type).toBe('HUNTER');
  });

  test('DRIFTER debuts by wave 2, TANGERINE by wave 5, WEAVER by wave 8', () => {
    expect(typesUpToWave(2).has('DRIFTER')).toBe(true);
    expect(typesUpToWave(5).has('TANGERINE')).toBe(true);
    expect(typesUpToWave(8).has('WEAVER')).toBe(true);
  });

  test('the player meets >= 7 distinct (non-boss) enemy types by the end of stage 3 (wave 9)', () => {
    const types = [...typesUpToWave(9)].filter((t) => t !== 'TITAN');
    expect(types.length).toBeGreaterThanOrEqual(7);
  });

  test('punishing / mechanic-heavy enemies stay back-loaded (none in waves 1-9)', () => {
    const punishing = ['LEECH', 'PHANTOM', 'DEVOURER', 'PRISM_MIRROR', 'NULL_DRONE',
                       'WRAITHWORM', 'WARDEN', 'CONDUIT_NODE', 'JUGGERNAUT', 'THORNBACK'];
    const early = typesUpToWave(9);
    for (const t of punishing) expect(early.has(t)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEnemyLevel() / getAsteroidLevel()
// ---------------------------------------------------------------------------

describe('getEnemyLevel()', () => {
  // Enemy level now tracks the PLAYER's level, biased by wave (early below,
  // late above). See scaling-tuning.test.js for the full contract.
  test('tracks the player level with a wave bias (early below, late above)', () => {
    const pl = 12;
    expect(getEnemyLevel(1, pl)).toBeLessThan(pl);          // early: weaker
    expect(getEnemyLevel(MAX_WAVES, pl)).toBeGreaterThan(pl); // late: tougher
  });

  test('clamps below 1; bounded above for high-level accounts', () => {
    expect(getEnemyLevel(0, 1)).toBe(1);
    expect(getEnemyLevel(-3, 1)).toBe(1);
    expect(getEnemyLevel(MAX_WAVES + 5, 100)).toBeLessThanOrEqual(MAX_WAVES + 15);
  });

  test('returns integer values', () => {
    for (let w = 1; w <= 30; w++) expect(Number.isInteger(getEnemyLevel(w, 10))).toBe(true);
  });
});

describe('getAsteroidLevel()', () => {
  test('rises every other wave', () => {
    expect(getAsteroidLevel(1)).toBe(1);
    expect(getAsteroidLevel(2)).toBe(1);
    expect(getAsteroidLevel(3)).toBe(2);
    expect(getAsteroidLevel(10)).toBe(5);
    // 5.101.0 — campaign expanded to 30 waves; ceil(w/2) keeps the
    // every-other-wave climb so the peak level is now 15 not 10.
    expect(getAsteroidLevel(MAX_WAVES)).toBe(Math.ceil(MAX_WAVES / 2));
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

  // 5.75.0 — HP curve recalibrated: linear base + steep tail
  // (`pow(t, 2.5) * 4`). Wave 5 ~2.5×, wave 10 ~4.5×, peak ~11.5×.
  // 5.101.0 — curve now stretched across MAX_WAVES; peak is at level
  // MAX_WAVES (30), not 20.
  test('HP follows a power curve — gentle early, steep late', () => {
    const l1   = getLevelScaledEnemyStats(BASE, 1).health;
    const l5   = getLevelScaledEnemyStats(BASE, 5).health;
    const lEnd = getLevelScaledEnemyStats(BASE, MAX_WAVES).health;
    expect(l1).toBe(BASE.health);
    expect(l5).toBeLessThan(BASE.health * 4);           // early waves still climbable
    expect(lEnd).toBeGreaterThan(BASE.health * 13);     // final-wave HP is brutal
    // Curve must be monotonic
    expect(getLevelScaledEnemyStats(BASE, 10).health).toBeGreaterThan(l5);
    expect(lEnd).toBeGreaterThan(getLevelScaledEnemyStats(BASE, 10).health);
  });

  test('speed level mult is gentle (curve, not linear)', () => {
    expect(getLevelScaledEnemyStats(BASE, 1).speed).toBeCloseTo(BASE.speed);
    // Speed curve peaks at MAX_WAVES with the widened 5.101.0 spread.
    expect(getLevelScaledEnemyStats(BASE, MAX_WAVES).speed).toBeGreaterThan(BASE.speed * 1.3);
    expect(getLevelScaledEnemyStats(BASE, MAX_WAVES).speed).toBeLessThan(BASE.speed * 1.5);
  });

  test('size stays constant across levels', () => {
    for (const lvl of [1, 5, 10, 20, MAX_WAVES]) {
      expect(getLevelScaledEnemyStats(BASE, lvl).size).toBe(BASE.size);
    }
  });

  test('points follow a power curve (gentle early, big late)', () => {
    expect(getLevelScaledEnemyStats(BASE, 1).points).toBe(BASE.points);
    expect(getLevelScaledEnemyStats(BASE, MAX_WAVES).points).toBeGreaterThan(BASE.points * 6);
    expect(getLevelScaledEnemyStats(BASE, 5).points).toBeLessThan(BASE.points * 1.7);
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

  test('HP ramps gently with level (+25%/level, no steep curve)', () => {
    // base 10 → L1: 10, L5: round(10*2.0)=20, L10: round(10*3.25)=33.
    expect(getLevelScaledAsteroidStats(10, 1)).toBe(10);
    expect(getLevelScaledAsteroidStats(10, 5)).toBe(20);
    expect(getLevelScaledAsteroidStats(10, 10)).toBe(33);
    // monotonic up, but stays "candy" — never the old ×6.5+ blowup.
    expect(getLevelScaledAsteroidStats(10, 10)).toBeGreaterThan(getLevelScaledAsteroidStats(10, 5));
  });

  test('returns an integer', () => {
    for (const lvl of [1, 3, 7, 10]) {
      expect(Number.isInteger(getLevelScaledAsteroidStats(10, lvl))).toBe(true);
    }
  });
});

describe('getEnemySpeedMultiplier()', () => {
  test('starts low at wave 1 and climbs sharply at the end', () => {
    const w1 = getEnemySpeedMultiplier(1);
    const w5 = getEnemySpeedMultiplier(5);
    const wEnd = getEnemySpeedMultiplier(MAX_WAVES);
    expect(w1).toBeLessThan(0.6);              // gentle intro
    expect(w5).toBeLessThan(0.85);             // wave 5 is still easy
    // 5.101.0 — final wave (now MAX_WAVES, not 20) is the peak; the
    // ceiling stays 1.75 per the 5.72 cap regardless of campaign length.
    expect(wEnd).toBeGreaterThan(1.6);
    expect(wEnd).toBeGreaterThan(w5);
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
