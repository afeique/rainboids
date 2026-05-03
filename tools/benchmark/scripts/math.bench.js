/**
 * math.bench.js — core math operation benchmarks using mitata
 *
 * Tests micro-level operations used heavily across the game loop:
 *  1. Distance computation variants (hypot / sqrt / squared)
 *  2. Angle computation (atan2, sin, cos)
 *  3. Wrap / wrapValue utilities from utils.js
 *  4. Entity position update patterns (velocity integration)
 *  5. Trig approximation alternatives (lookup tables)
 *  6. Friction / damping
 *  7. Min/max clamping vs ternary
 */
import { bench, group, run } from 'mitata';
import '../browser-mock.js';
import { wrap, wrapValue } from '../../../js/modules/core/utils.js';

// ---------------------------------------------------------------------------
// Lookup table for fast trig approximation
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Static test data (avoid Math.random() noise in hot loops)
// ---------------------------------------------------------------------------
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

const PAIRS = Array.from({ length: 1000 }, () => {
  const dx = (Math.random() - 0.5) * 400;
  const dy = (Math.random() - 0.5) * 400;
  return { dx, dy, r: 10 + Math.random() * 30 };
});

const ANGLES = Float32Array.from({ length: 1000 }, () => Math.random() * PI2);

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

group('distance computation – 1000 calls', () => {
  bench('Math.hypot(dx, dy)', () => {
    let s = 0;
    for (const p of PAIRS) s += Math.hypot(p.dx, p.dy);
    return s;
  });

  bench('Math.sqrt(dx²+dy²)', () => {
    let s = 0;
    for (const p of PAIRS) s += Math.sqrt(p.dx * p.dx + p.dy * p.dy);
    return s;
  });

  bench('squared dist only (no sqrt)', () => {
    let s = 0;
    for (const p of PAIRS) s += p.dx * p.dx + p.dy * p.dy;
    return s;
  });
});

group('collision check – 1000 pairs', () => {
  bench('hypot-based', () => {
    let hit = 0;
    for (const p of PAIRS) {
      if (Math.hypot(p.dx, p.dy) < p.r) hit++;
    }
    return hit;
  });

  bench('squared-dist-based', () => {
    let hit = 0;
    for (const p of PAIRS) {
      if (p.dx * p.dx + p.dy * p.dy < p.r * p.r) hit++;
    }
    return hit;
  });
});

group('angle computation – 1000 calls', () => {
  bench('Math.atan2', () => {
    let s = 0;
    for (const p of PAIRS) s += Math.atan2(p.dy, p.dx);
    return s;
  });
});

group('trigonometry – native vs lookup table (1000 calls)', () => {
  bench('Math.sin', () => {
    let s = 0;
    for (const a of ANGLES) s += Math.sin(a);
    return s;
  });

  bench('Math.cos', () => {
    let s = 0;
    for (const a of ANGLES) s += Math.cos(a);
    return s;
  });

  bench('sin+cos pair (Math)', () => {
    let s = 0;
    for (const a of ANGLES) { s += Math.sin(a); s += Math.cos(a); }
    return s;
  });

  bench('sin table lookup', () => {
    let s = 0;
    for (const a of ANGLES) s += fastSin(a);
    return s;
  });

  bench('cos table lookup', () => {
    let s = 0;
    for (const a of ANGLES) s += fastCos(a);
    return s;
  });
});

group('utility functions', () => {
  bench('wrap() – 100 entities', () => {
    for (const e of ENTITIES_100) wrap(e, WIDTH, HEIGHT);
  });

  bench('wrapValue() – 1000 calls', () => {
    let s = 0;
    for (let i = 0; i < 1000; i++) s += wrapValue(ANGLES[i % ANGLES.length], 0, PI2);
    return s;
  });
});

group('velocity integration – 100 entities', () => {
  bench('+=vx/vy only', () => {
    for (const e of ENTITIES_100) {
      e.x += e.vx;
      e.y += e.vy;
    }
  });

  bench('+=vx/vy + wrap()', () => {
    for (const e of ENTITIES_100) {
      e.x += e.vx;
      e.y += e.vy;
      wrap(e, WIDTH, HEIGHT);
    }
  });
});

group('friction / damping – 100 entities', () => {
  bench('multiply ×0.995', () => {
    for (const e of ENTITIES_100) {
      e.vx *= 0.995;
      e.vy *= 0.995;
    }
  });
});

group('Math.random() baseline', () => {
  bench('1000 calls', () => {
    let s = 0;
    for (let i = 0; i < 1000; i++) s += Math.random();
    return s;
  });
});

group('clamping – 1000 calls', () => {
  bench('Math.min/max clamp', () => {
    let s = 0;
    for (const p of PAIRS) s += Math.min(Math.max(p.dx, -300), 300);
    return s;
  });

  bench('ternary clamp', () => {
    let s = 0;
    for (const p of PAIRS) {
      const v = p.dx;
      s += v < -300 ? -300 : v > 300 ? 300 : v;
    }
    return s;
  });
});

await run(process.env.MITATA_JSON ? { format: { json: { debug: false, samples: false } } } : {});
