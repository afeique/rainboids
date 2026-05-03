/**
 * collision.bench.js — collision detection benchmarks using mitata
 *
 * Tests:
 *  1. Math.hypot vs squared-distance for circle-circle collision
 *  2. collision() and starCollision() from utils.js
 *  3. Circle-polygon collision (isCirclePolygonColliding)
 *  4. Broad-phase: naive O(n²) vs spatial partitioning bucket
 */
import { bench, group, run } from 'mitata';
import '../browser-mock.js';
import { collision, starCollision, isCirclePolygonColliding } from '../../../js/modules/core/utils.js';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeEntities(count, radiusRange = [5, 25]) {
  return Array.from({ length: count }, () => ({
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

function collisionSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r  = a.radius + b.radius;
  return dx * dx + dy * dy < r * r;
}

function collisionSqrt(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) < a.radius + b.radius;
}

// Naive O(n²) broad phase
function naiveBroadPhase(entities) {
  let count = 0;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (collisionSq(entities[i], entities[j])) count++;
    }
  }
  return count;
}

// Simple uniform-grid broad phase
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
// Benchmark suites
// ---------------------------------------------------------------------------

group('circle-circle: implementation comparison (100 pairs)', () => {
  bench('collision() – Math.hypot', () => {
    for (const [a, b] of PAIRS_100) collision(a, b);
  });

  bench('collisionSqrt() – Math.sqrt', () => {
    for (const [a, b] of PAIRS_100) collisionSqrt(a, b);
  });

  bench('collisionSq() – squared dist', () => {
    for (const [a, b] of PAIRS_100) collisionSq(a, b);
  });
});

group('circle-circle: single pair overhead', () => {
  bench('collision() – Math.hypot (1 pair)', () => {
    collision(PAIRS_10[0][0], PAIRS_10[0][1]);
  });

  bench('collisionSq() – squared dist (1 pair)', () => {
    collisionSq(PAIRS_10[0][0], PAIRS_10[0][1]);
  });
});

group('starCollision() – swept detection', () => {
  bench('100 stars vs player', () => {
    for (const star of STARS_100) starCollision(PLAYER, star);
  });
});

group('isCirclePolygonColliding()', () => {
  bench('6-sided polygon', () => {
    isCirclePolygonColliding(PLAYER, POLYGON_6);
  });

  bench('12-sided polygon', () => {
    isCirclePolygonColliding(PLAYER, POLYGON_12);
  });
});

group('broad phase – naive O(n²) vs grid bucket', () => {
  bench('naive O(n²) – 20 entities', () => {
    naiveBroadPhase(ENTITY_SET_20);
  });

  bench('grid bucket – 20 entities', () => {
    gridBroadPhase(ENTITY_SET_20);
  });

  bench('naive O(n²) – 50 entities', () => {
    naiveBroadPhase(ENTITY_SET_50);
  });

  bench('grid bucket – 50 entities', () => {
    gridBroadPhase(ENTITY_SET_50);
  });

  bench('naive O(n²) – 100 entities', () => {
    naiveBroadPhase(ENTITY_SET_100);
  });

  bench('grid bucket – 100 entities', () => {
    gridBroadPhase(ENTITY_SET_100);
  });
});

await run(process.env.MITATA_JSON ? { format: { json: { debug: false, samples: false } } } : {});
