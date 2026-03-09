/**
 * Collision detection benchmarks
 *
 * Tests:
 *  1. Math.hypot vs squared-distance for circle-circle collision
 *  2. collision() and starCollision() from utils.js
 *  3. Circle-polygon collision (isCirclePolygonColliding)
 *  4. Broad-phase: naive O(n²) vs spatial partitioning bucket
 */

import '../lib/browser-mock.js';
import { measure, suite } from '../lib/bench.js';
import { collision, starCollision, isCirclePolygonColliding } from '../../js/modules/utils.js';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeEntities(count, radiusRange = [5, 25]) {
  return Array.from({ length: count }, (_, i) => ({
    active: true,
    x: Math.random() * 1920,
    y: Math.random() * 1080,
    radius: radiusRange[0] + Math.random() * (radiusRange[1] - radiusRange[0]),
    vel: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 },
  }));
}

function makePolygon(sides = 6) {
  const verts = [];
  const r = 30;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return { active: true, x: 960, y: 540, vertices: verts };
}

// ---------------------------------------------------------------------------
// Inline alternatives for head-to-head comparison
// ---------------------------------------------------------------------------

// Alternative: squared distance (avoids Math.hypot / sqrt)
function collisionSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r  = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}

// Alternative: Math.sqrt explicit (some engines optimize this differently)
function collisionSqrt(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) < a.radius + b.radius;
}

// Naive O(n²) broad phase (what the game does today without a quadtree)
function naiveBroadPhase(entities) {
  let count = 0;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (collisionSq(entities[i], entities[j])) count++;
    }
  }
  return count;
}

// Simple uniform-grid broad phase (divides field into cells)
function gridBroadPhase(entities, cellSize = 100) {
  const grid = new Map();
  for (const e of entities) {
    const cx = Math.floor(e.x / cellSize);
    const cy = Math.floor(e.y / cellSize);
    const key = `${cx},${cy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(e);
  }
  let count = 0;
  for (const cell of grid.values()) {
    for (let i = 0; i < cell.length; i++) {
      for (let j = i + 1; j < cell.length; j++) {
        if (collisionSq(cell[i], cell[j])) count++;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Static test sets (created once to avoid allocation noise in hot loops)
// ---------------------------------------------------------------------------

const PAIRS_10    = Array.from({ length: 10 },  () => [makeEntities(1)[0], makeEntities(1)[0]]);
const PAIRS_100   = Array.from({ length: 100 }, () => [makeEntities(1)[0], makeEntities(1)[0]]);
const PLAYER      = makeEntities(1, [20, 20])[0];
const STARS_100   = makeEntities(100, [3, 8]);
const POLYGON_6   = makePolygon(6);
const POLYGON_12  = makePolygon(12);
const ENTITY_SET_20  = makeEntities(20);
const ENTITY_SET_50  = makeEntities(50);
const ENTITY_SET_100 = makeEntities(100);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function runSuite() {
  return suite('Collision Detection', [
    // ── Circle-circle: implementation comparison ───────────────────────────
    measure('collision() – Math.hypot     (100 pairs)', () => {
      for (const [a, b] of PAIRS_100) collision(a, b);
    }, { iterations: 30000, batch: 50 }),

    measure('collision() – Math.sqrt      (100 pairs)', () => {
      for (const [a, b] of PAIRS_100) collisionSqrt(a, b);
    }, { iterations: 30000, batch: 50 }),

    measure('collision() – squared dist   (100 pairs)', () => {
      for (const [a, b] of PAIRS_100) collisionSq(a, b);
    }, { iterations: 30000, batch: 50 }),

    // ── Single-call overhead ───────────────────────────────────────────────
    measure('collision() – Math.hypot     (1 pair)', () => {
      collision(PAIRS_10[0][0], PAIRS_10[0][1]);
    }, { iterations: 200000, batch: 200 }),

    measure('collision() – squared dist   (1 pair)', () => {
      collisionSq(PAIRS_10[0][0], PAIRS_10[0][1]);
    }, { iterations: 200000, batch: 200 }),

    // ── starCollision() – swept detection ────────────────────────────────
    measure('starCollision()              (100 stars vs player)', () => {
      for (const star of STARS_100) starCollision(PLAYER, star);
    }, { iterations: 10000, batch: 20 }),

    // ── Circle-polygon ────────────────────────────────────────────────────
    measure('isCirclePolygonColliding()   (6-sided polygon)', () => {
      isCirclePolygonColliding(PLAYER, POLYGON_6);
    }, { iterations: 50000, batch: 100 }),

    measure('isCirclePolygonColliding()   (12-sided polygon)', () => {
      isCirclePolygonColliding(PLAYER, POLYGON_12);
    }, { iterations: 50000, batch: 100 }),

    // ── Broad-phase strategies ────────────────────────────────────────────
    measure('broad phase – naive O(n²)   (20 entities)', () => {
      naiveBroadPhase(ENTITY_SET_20);
    }, { iterations: 20000, batch: 50 }),

    measure('broad phase – grid bucket   (20 entities)', () => {
      gridBroadPhase(ENTITY_SET_20);
    }, { iterations: 20000, batch: 50 }),

    measure('broad phase – naive O(n²)   (50 entities)', () => {
      naiveBroadPhase(ENTITY_SET_50);
    }, { iterations: 5000, batch: 10 }),

    measure('broad phase – grid bucket   (50 entities)', () => {
      gridBroadPhase(ENTITY_SET_50);
    }, { iterations: 5000, batch: 10 }),

    measure('broad phase – naive O(n²)   (100 entities)', () => {
      naiveBroadPhase(ENTITY_SET_100);
    }, { iterations: 2000, batch: 5 }),

    measure('broad phase – grid bucket   (100 entities)', () => {
      gridBroadPhase(ENTITY_SET_100);
    }, { iterations: 2000, batch: 5 }),
  ]);
}
