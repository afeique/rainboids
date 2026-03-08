/**
 * Core math operation benchmarks
 *
 * Tests micro-level operations used heavily across the game loop:
 *  1. Distance computation variants (hypot / sqrt / squared)
 *  2. Angle computation (atan2, sin, cos)
 *  3. Wrap / clamp utilities from utils.js
 *  4. Entity position update patterns (velocity integration)
 *  5. Trig approximation alternatives
 *
 * These inform optimization decisions in collision detection,
 * enemy AI, and entity update loops.
 */

import '../lib/browser-mock.js';
import { measure, suite } from '../lib/bench.js';
import { wrap, wrapValue } from '../../js/modules/utils.js';

// ---------------------------------------------------------------------------
// Inline implementations for head-to-head comparison
// ---------------------------------------------------------------------------

// Precompute sin/cos lookup table (512 entries)
const TRIG_TABLE_SIZE = 512;
const SIN_TABLE = new Float32Array(TRIG_TABLE_SIZE);
const COS_TABLE = new Float32Array(TRIG_TABLE_SIZE);
const PI2 = Math.PI * 2;
for (let i = 0; i < TRIG_TABLE_SIZE; i++) {
  const a = (i / TRIG_TABLE_SIZE) * PI2;
  SIN_TABLE[i] = Math.sin(a);
  COS_TABLE[i] = Math.cos(a);
}
function fastSin(a) {
  return SIN_TABLE[(((a % PI2) / PI2 * TRIG_TABLE_SIZE) | 0 + TRIG_TABLE_SIZE) % TRIG_TABLE_SIZE];
}
function fastCos(a) {
  return COS_TABLE[(((a % PI2) / PI2 * TRIG_TABLE_SIZE) | 0 + TRIG_TABLE_SIZE) % TRIG_TABLE_SIZE];
}

// Entity-like structs for wrap benchmarks
function makeEntities(count) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * 2400 - 240,
    y: Math.random() * 1320 - 120,
    vx: (Math.random() - 0.5) * 6,
    vy: (Math.random() - 0.5) * 6,
    angle: Math.random() * PI2,
  }));
}

const ENTITIES_100 = makeEntities(100);
const WIDTH = 1920, HEIGHT = 1080;

// Pairs for distance benchmarks
const PAIRS = Array.from({ length: 1000 }, () => {
  const dx = (Math.random() - 0.5) * 400;
  const dy = (Math.random() - 0.5) * 400;
  return { dx, dy, r: 10 + Math.random() * 30 };
});

// Precomputed angles for trig benchmarks
const ANGLES = Float32Array.from({ length: 1000 }, () => Math.random() * PI2);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function runSuite() {
  return suite('Math Operations', [
    // ── Distance / collision math ─────────────────────────────────────────
    measure('Math.hypot(dx, dy) – 1000 calls', () => {
      let s = 0;
      for (const p of PAIRS) s += Math.hypot(p.dx, p.dy);
      return s;
    }, { iterations: 5000, batch: 10 }),

    measure('Math.sqrt(dx²+dy²) – 1000 calls', () => {
      let s = 0;
      for (const p of PAIRS) s += Math.sqrt(p.dx * p.dx + p.dy * p.dy);
      return s;
    }, { iterations: 5000, batch: 10 }),

    measure('squared dist only  – 1000 calls (no sqrt)', () => {
      let s = 0;
      for (const p of PAIRS) s += p.dx * p.dx + p.dy * p.dy;
      return s;
    }, { iterations: 5000, batch: 10 }),

    measure('collision check – hypot  (1000 pairs)', () => {
      let hit = 0;
      for (const p of PAIRS) {
        if (Math.hypot(p.dx, p.dy) < p.r) hit++;
      }
      return hit;
    }, { iterations: 5000, batch: 10 }),

    measure('collision check – squared (1000 pairs)', () => {
      let hit = 0;
      for (const p of PAIRS) {
        if (p.dx * p.dx + p.dy * p.dy < p.r * p.r) hit++;
      }
      return hit;
    }, { iterations: 5000, batch: 10 }),

    // ── Angle computation ─────────────────────────────────────────────────
    measure('Math.atan2 – 1000 calls', () => {
      let s = 0;
      for (const p of PAIRS) s += Math.atan2(p.dy, p.dx);
      return s;
    }, { iterations: 5000, batch: 10 }),

    // ── Trigonometry – native vs lookup table ─────────────────────────────
    measure('Math.sin – 1000 calls', () => {
      let s = 0;
      for (const a of ANGLES) s += Math.sin(a);
      return s;
    }, { iterations: 5000, batch: 10 }),

    measure('Math.cos – 1000 calls', () => {
      let s = 0;
      for (const a of ANGLES) s += Math.cos(a);
      return s;
    }, { iterations: 5000, batch: 10 }),

    measure('sin+cos pair (Math) – 1000 calls', () => {
      let s = 0;
      for (const a of ANGLES) { s += Math.sin(a); s += Math.cos(a); }
      return s;
    }, { iterations: 5000, batch: 10 }),

    measure('sin table lookup   – 1000 calls', () => {
      let s = 0;
      for (const a of ANGLES) s += fastSin(a);
      return s;
    }, { iterations: 5000, batch: 10 }),

    measure('cos table lookup   – 1000 calls', () => {
      let s = 0;
      for (const a of ANGLES) s += fastCos(a);
      return s;
    }, { iterations: 5000, batch: 10 }),

    // ── Utility functions ─────────────────────────────────────────────────
    measure('wrap() – 100 entities', () => {
      for (const e of ENTITIES_100) wrap(e, WIDTH, HEIGHT);
    }, { iterations: 20000, batch: 50 }),

    measure('wrapValue() – 1000 calls', () => {
      let s = 0;
      for (let i = 0; i < 1000; i++) s += wrapValue(ANGLES[i % ANGLES.length], 0, PI2);
      return s;
    }, { iterations: 10000, batch: 20 }),

    // ── Entity velocity integration (common game-loop pattern) ────────────
    measure('velocity integration – 100 entities (+=vx/vy)', () => {
      for (const e of ENTITIES_100) {
        e.x += e.vx;
        e.y += e.vy;
      }
    }, { iterations: 50000, batch: 100 }),

    measure('velocity integration + wrap – 100 entities', () => {
      for (const e of ENTITIES_100) {
        e.x += e.vx;
        e.y += e.vy;
        wrap(e, WIDTH, HEIGHT);
      }
    }, { iterations: 20000, batch: 50 }),

    // ── Friction / damping (ship and particle physics) ────────────────────
    measure('friction multiply – 100 entities (×0.995)', () => {
      for (const e of ENTITIES_100) {
        e.vx *= 0.995;
        e.vy *= 0.995;
      }
    }, { iterations: 50000, batch: 100 }),

    // ── Math.random() baseline ────────────────────────────────────────────
    measure('Math.random() – 1000 calls (baseline)', () => {
      let s = 0;
      for (let i = 0; i < 1000; i++) s += Math.random();
      return s;
    }, { iterations: 5000, batch: 10 }),

    // ── Min/max clamping ──────────────────────────────────────────────────
    measure('Math.min/max clamp – 1000 calls', () => {
      let s = 0;
      for (const p of PAIRS) s += Math.min(Math.max(p.dx, -300), 300);
      return s;
    }, { iterations: 5000, batch: 10 }),

    measure('ternary clamp      – 1000 calls', () => {
      let s = 0;
      for (const p of PAIRS) {
        const v = p.dx;
        s += v < -300 ? -300 : v > 300 ? 300 : v;
      }
      return s;
    }, { iterations: 5000, batch: 10 }),
  ]);
}
