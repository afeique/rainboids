/**
 * Wave-data & level-scaling benchmarks
 *
 * Tests:
 *  1. getWaveConfig() – static lookups, cache hits, procedural generation
 *  2. getEnemyLevel() / getAsteroidLevel() calculations
 *  3. getLevelScaledEnemyStats() – per-spawn scaling math
 *  4. getLevelScaledAsteroidStats() – per-spawn HP scaling
 *  5. getEnemyFiringCooldown() – all enemy types at various levels
 */

import '../lib/browser-mock.js';
import { measure, suite } from '../lib/bench.js';
import {
  getWaveConfig,
  getEnemyLevel,
  getAsteroidLevel,
  getLevelScaledEnemyStats,
  getLevelScaledAsteroidStats,
} from '../../js/modules/wave-data.js';
import { getEnemyFiringCooldown } from '../../js/modules/constants.js';

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

// Wave numbers representative of each phase
const EARLY_WAVES  = [1, 2, 5, 10];          // phase 1–2 (static lookup)
const MID_WAVES    = [20, 40, 60, 80];        // phase 3–5 (static lookup)
const LATE_WAVES   = [81, 90, 100, 150, 200]; // phase 6 (procedural)

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function runSuite() {
  return suite('Wave Data & Level Scaling', [
    // ── getWaveConfig() – static waves (first call, no cache) ────────────
    measure('getWaveConfig() – early wave  (wave 1)', () => {
      getWaveConfig(1);
    }, { iterations: 100000, batch: 500 }),

    measure('getWaveConfig() – mid wave    (wave 40)', () => {
      getWaveConfig(40);
    }, { iterations: 100000, batch: 500 }),

    // ── getWaveConfig() – procedural generation (wave > 80) ──────────────
    measure('getWaveConfig() – procedural  (wave 100)', () => {
      getWaveConfig(100);
    }, { iterations: 50000, batch: 200 }),

    measure('getWaveConfig() – procedural  (wave 200)', () => {
      getWaveConfig(200);
    }, { iterations: 50000, batch: 200 }),

    // ── Bulk: scan full early/mid/late ranges ─────────────────────────────
    measure('getWaveConfig() – scan waves 1–80  (full static range)', () => {
      for (let w = 1; w <= 80; w++) getWaveConfig(w);
    }, { iterations: 2000, batch: 5 }),

    measure('getWaveConfig() – scan waves 81–160 (full procedural range)', () => {
      for (let w = 81; w <= 160; w++) getWaveConfig(w);
    }, { iterations: 500, batch: 2 }),

    // ── Level helper calculations ─────────────────────────────────────────
    measure('getEnemyLevel() – 1000 lookups', () => {
      for (let w = 1; w <= 1000; w++) getEnemyLevel(w);
    }, { iterations: 5000, batch: 10 }),

    measure('getAsteroidLevel() – 1000 lookups', () => {
      for (let w = 1; w <= 1000; w++) getAsteroidLevel(w);
    }, { iterations: 5000, batch: 10 }),

    // ── Stat scaling math ─────────────────────────────────────────────────
    measure('getLevelScaledEnemyStats() – level 1', () => {
      getLevelScaledEnemyStats(BASE_ENEMY_STATS, 1);
    }, { iterations: 100000, batch: 500 }),

    measure('getLevelScaledEnemyStats() – level 10', () => {
      getLevelScaledEnemyStats(BASE_ENEMY_STATS, 10);
    }, { iterations: 100000, batch: 500 }),

    measure('getLevelScaledEnemyStats() – level 50', () => {
      getLevelScaledEnemyStats(BASE_ENEMY_STATS, 50);
    }, { iterations: 100000, batch: 500 }),

    measure('getLevelScaledAsteroidStats() – level 10', () => {
      getLevelScaledAsteroidStats(BASE_ENEMY_STATS.health, 10);
    }, { iterations: 200000, batch: 1000 }),

    // ── getEnemyFiringCooldown() – all 10 enemy types, levels 1–10 ────────
    measure('getEnemyFiringCooldown() – all types × all levels (100 calls)', () => {
      for (const type of ENEMY_TYPES) {
        for (let lvl = 1; lvl <= 10; lvl++) {
          getEnemyFiringCooldown(type, lvl);
        }
      }
    }, { iterations: 10000, batch: 50 }),

    // ── Simulated spawn frame: full wave lookup + level scale per entity ──
    measure('simulated spawn frame – wave 50, 8 entities', () => {
      const cfg   = getWaveConfig(50);
      const level = getEnemyLevel(50);
      for (let i = 0; i < 8; i++) {
        getLevelScaledEnemyStats(BASE_ENEMY_STATS, level);
        getEnemyFiringCooldown(ENEMY_TYPES[i % ENEMY_TYPES.length], level);
      }
    }, { iterations: 10000, batch: 50 }),
  ]);
}
