/**
 * wave.bench.js — wave-data & level-scaling benchmarks using mitata
 *
 * Tests:
 *  1. getWaveConfig() – static lookups, cache hits, procedural generation
 *  2. getEnemyLevel() / getAsteroidLevel() calculations
 *  3. getLevelScaledEnemyStats() – per-spawn scaling math
 *  4. getLevelScaledAsteroidStats() – per-spawn HP scaling
 *  5. getEnemyFiringCooldown() – all enemy types at various levels
 */
import { bench, group, run } from 'mitata';
import '../browser-mock.js';
import {
  getWaveConfig,
  getEnemyLevel,
  getAsteroidLevel,
  getLevelScaledEnemyStats,
  getLevelScaledAsteroidStats,
} from '../../../js/modules/wave/wave-data.js';
import { getEnemyFiringCooldown } from '../../../js/modules/core/constants.js';

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

const ENEMY_TYPES = [
  'HUNTER', 'GUARDIAN', 'WASP', 'TITAN', 'STALKER',
  'TANGERINE', 'DRIFTER', 'PROWLER', 'WEAVER', 'SENTINEL',
];

const BASE_ENEMY_STATS = {
  health: 10, speed: 2, size: 30, shootRate: 1, points: 100,
};

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

group('getWaveConfig() – static waves', () => {
  bench('wave 1 (phase 1)', () => {
    getWaveConfig(1);
  });

  bench('wave 40 (phase 4)', () => {
    getWaveConfig(40);
  });

  bench('wave 80 (phase 5, last static)', () => {
    getWaveConfig(80);
  });
});

group('getWaveConfig() – procedural generation (wave > 80)', () => {
  bench('wave 100 (procedural)', () => {
    getWaveConfig(100);
  });

  bench('wave 200 (procedural, far out)', () => {
    getWaveConfig(200);
  });
});

group('getWaveConfig() – bulk range scans', () => {
  bench('scan waves 1–80 (full static range)', () => {
    for (let w = 1; w <= 80; w++) getWaveConfig(w);
  });

  bench('scan waves 81–160 (full procedural range)', () => {
    for (let w = 81; w <= 160; w++) getWaveConfig(w);
  });
});

group('level helper calculations', () => {
  bench('getEnemyLevel() – 1000 lookups', () => {
    for (let w = 1; w <= 1000; w++) getEnemyLevel(w);
  });

  bench('getAsteroidLevel() – 1000 lookups', () => {
    for (let w = 1; w <= 1000; w++) getAsteroidLevel(w);
  });
});

group('getLevelScaledEnemyStats()', () => {
  bench('level 1', () => {
    getLevelScaledEnemyStats(BASE_ENEMY_STATS, 1);
  });

  bench('level 10', () => {
    getLevelScaledEnemyStats(BASE_ENEMY_STATS, 10);
  });

  bench('level 50', () => {
    getLevelScaledEnemyStats(BASE_ENEMY_STATS, 50);
  });
});

group('getLevelScaledAsteroidStats()', () => {
  bench('level 10', () => {
    getLevelScaledAsteroidStats(BASE_ENEMY_STATS.health, 10);
  });
});

group('getEnemyFiringCooldown()', () => {
  bench('all 10 types × levels 1–10 (100 calls)', () => {
    for (const type of ENEMY_TYPES) {
      for (let lvl = 1; lvl <= 10; lvl++) {
        getEnemyFiringCooldown(type, lvl);
      }
    }
  });
});

group('simulated spawn frame', () => {
  bench('wave 50, 8 entities', () => {
    const cfg   = getWaveConfig(50);
    const level = getEnemyLevel(50);
    for (let i = 0; i < 8; i++) {
      getLevelScaledEnemyStats(BASE_ENEMY_STATS, level);
      getEnemyFiringCooldown(ENEMY_TYPES[i % ENEMY_TYPES.length], level);
    }
  });
});

await run(process.env.MITATA_JSON ? { format: { json: { debug: false, samples: false } } } : {});
