/**
 * color-cache.bench.js — measure cost of dynamic CSS color string construction
 * vs cached lookups
 */
import { bench, group, run } from 'mitata';
import '../browser-mock.js';

// ─── Simulated hot-path patterns from the codebase ──────────────────────────

// Pattern 1: Template literal rgba (enemy.js, game-engine.js — most common)
function rgbaTemplate(r, g, b, a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Pattern 2: HSL template (particle.js, line-debris.js)
function hslTemplate(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Pattern 3: String concatenation for alpha (powerup.js)
function concatAlpha(baseColor, alphaHex) {
  return baseColor + alphaHex;
}

// ─── Caching strategies ─────────────────────────────────────────────────────

// Strategy A: Map cache keyed by rounded alpha (quantized to 0.01 steps)
const rgbaMapCache = new Map();
function rgbaCached(r, g, b, a) {
  // Quantize alpha to 2 decimal places (100 possible values)
  const qa = (a * 100 | 0);
  const key = (r << 24) | (g << 16) | (b << 8) | qa;
  let result = rgbaMapCache.get(key);
  if (result === undefined) {
    result = `rgba(${r}, ${g}, ${b}, ${(qa / 100).toFixed(2)})`;
    rgbaMapCache.set(key, result);
  }
  return result;
}

// Strategy B: Object/array lookup for known color palettes
// Pre-build a 101-entry table (alpha 0.00–1.00 in 0.01 steps)
function buildAlphaTable(r, g, b) {
  const table = new Array(101);
  for (let i = 0; i <= 100; i++) {
    table[i] = `rgba(${r}, ${g}, ${b}, ${(i / 100).toFixed(2)})`;
  }
  return table;
}
const cyanTable = buildAlphaTable(0, 220, 255);
const goldTable = buildAlphaTable(184, 134, 11);
const redTable = buildAlphaTable(255, 0, 0);

function rgbaTableLookup(table, a) {
  return table[a * 100 | 0];
}

// Strategy C: Simple string intern cache (small Map)
const internCache = new Map();
function rgbaIntern(r, g, b, a) {
  const s = `rgba(${r}, ${g}, ${b}, ${a})`;
  let cached = internCache.get(s);
  if (cached === undefined) {
    internCache.set(s, s);
    cached = s;
  }
  return cached;
}

// Strategy D: HSL palette cache (particle colors)
const hslCache = new Map();
function hslCached(h, s, l) {
  const key = (h << 16) | (s << 8) | l;
  let result = hslCache.get(key);
  if (result === undefined) {
    result = `hsl(${h}, ${s}%, ${l}%)`;
    hslCache.set(key, result);
  }
  return result;
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

// Simulate per-frame enemy rendering: 10 enemies × ~5 color strings each
const ENEMIES = 10;
const COLORS_PER_ENEMY = 5;

group('rgba construction: single call', () => {
  const alpha = 0.73;
  bench('template literal', () => rgbaTemplate(0, 220, 255, alpha));
  bench('Map cache (quantized)', () => rgbaCached(0, 220, 255, alpha));
  bench('table lookup', () => rgbaTableLookup(cyanTable, alpha));
  bench('intern cache', () => rgbaIntern(0, 220, 255, alpha));
});

group('rgba construction: 50 calls (10 enemies × 5 colors)', () => {
  bench('template literals', () => {
    for (let e = 0; e < ENEMIES; e++) {
      const pulse = 0.5 + Math.random() * 0.5;
      rgbaTemplate(0, 220, 255, 0.4 * pulse);
      rgbaTemplate(0, 160, 255, 0.4 * pulse);
      rgbaTemplate(0, 200, 255, 0.9 * pulse);
      rgbaTemplate(100, 255, 255, 0.6 * pulse);
      rgbaTemplate(255, 255, 255, 0.7 * pulse);
    }
  });

  bench('Map cache (quantized)', () => {
    for (let e = 0; e < ENEMIES; e++) {
      const pulse = 0.5 + Math.random() * 0.5;
      rgbaCached(0, 220, 255, 0.4 * pulse);
      rgbaCached(0, 160, 255, 0.4 * pulse);
      rgbaCached(0, 200, 255, 0.9 * pulse);
      rgbaCached(100, 255, 255, 0.6 * pulse);
      rgbaCached(255, 255, 255, 0.7 * pulse);
    }
  });

  bench('table lookup', () => {
    for (let e = 0; e < ENEMIES; e++) {
      const pulse = 0.5 + Math.random() * 0.5;
      rgbaTableLookup(cyanTable, 0.4 * pulse);
      rgbaTableLookup(cyanTable, 0.4 * pulse);
      rgbaTableLookup(cyanTable, 0.9 * pulse);
      rgbaTableLookup(cyanTable, 0.6 * pulse);
      rgbaTableLookup(cyanTable, 0.7 * pulse);
    }
  });
});

group('hsl construction: 30 particles', () => {
  bench('template literal', () => {
    for (let i = 0; i < 30; i++) {
      hslTemplate(Math.random() * 360 | 0, 100, 70);
    }
  });

  bench('Map cache', () => {
    for (let i = 0; i < 30; i++) {
      hslCached(Math.random() * 360 | 0, 100, 70);
    }
  });
});

group('gradient color stops: player charge glow (6 stops)', () => {
  bench('template literals', () => {
    const a = 0.3 + Math.random() * 0.7;
    rgbaTemplate(255, 255, 255, a * 1.0);
    rgbaTemplate(0, 255, 255, a * 0.9);
    rgbaTemplate(100, 220, 255, a * 0.7);
    rgbaTemplate(150, 240, 255, a * 0.4);
    rgbaTemplate(200, 250, 255, 0);
    rgbaTemplate(255, 255, 255, a * 0.3);
  });

  bench('table lookups', () => {
    const a = 0.3 + Math.random() * 0.7;
    rgbaTableLookup(buildAlphaTable(255, 255, 255), a * 1.0);
    rgbaTableLookup(cyanTable, a * 0.9);
    rgbaTableLookup(buildAlphaTable(100, 220, 255), a * 0.7);
    rgbaTableLookup(buildAlphaTable(150, 240, 255), a * 0.4);
    // static: 'rgba(200, 250, 255, 0)' — no lookup needed
    rgbaTableLookup(buildAlphaTable(255, 255, 255), a * 0.3);
  });

  // Pre-built tables (realistic — built once at init)
  const whiteTable = buildAlphaTable(255, 255, 255);
  const cyan2Table = buildAlphaTable(100, 220, 255);
  const ltCyanTable = buildAlphaTable(150, 240, 255);

  bench('pre-built table lookups', () => {
    const a = 0.3 + Math.random() * 0.7;
    rgbaTableLookup(whiteTable, a * 1.0);
    rgbaTableLookup(cyanTable, a * 0.9);
    rgbaTableLookup(cyan2Table, a * 0.7);
    rgbaTableLookup(ltCyanTable, a * 0.4);
    rgbaTableLookup(whiteTable, a * 0.3);
  });
});

group('full frame simulation: 10 enemies + player + 30 particles + 5 damage nums', () => {
  bench('all template literals (~100 strings)', () => {
    // Enemies: 50 strings
    for (let e = 0; e < 10; e++) {
      const pulse = 0.5 + Math.random() * 0.5;
      rgbaTemplate(0, 220, 255, 0.4 * pulse);
      rgbaTemplate(0, 160, 255, 0.4 * pulse);
      rgbaTemplate(0, 200, 255, 0.9 * pulse);
      rgbaTemplate(100, 255, 255, 0.6 * pulse);
      rgbaTemplate(255, 255, 255, 0.7 * pulse);
    }
    // Player: 6 strings
    const glowA = 0.3 + Math.random() * 0.7;
    for (let i = 0; i < 6; i++) {
      rgbaTemplate(0, 255, 255, glowA * (1 - i * 0.15));
    }
    // Particles: 30 HSL strings
    for (let i = 0; i < 30; i++) {
      hslTemplate(Math.random() * 360 | 0, 100, 70);
    }
    // Damage numbers: 10 strings
    for (let i = 0; i < 5; i++) {
      const alpha = 0.5 + Math.random() * 0.5;
      rgbaTemplate(184, 134, 11, alpha);
      rgbaTemplate(0, 0, 0, alpha * 0.8);
    }
  });

  const whiteT = buildAlphaTable(255, 255, 255);
  const cyan1T = buildAlphaTable(0, 220, 255);
  const cyan2T = buildAlphaTable(0, 160, 255);
  const cyan3T = buildAlphaTable(0, 200, 255);
  const ltcyanT = buildAlphaTable(100, 255, 255);
  const goldT = buildAlphaTable(184, 134, 11);
  const blackT = buildAlphaTable(0, 0, 0);
  const fullCyanT = buildAlphaTable(0, 255, 255);

  bench('all cached (~100 lookups)', () => {
    // Enemies: 50 lookups
    for (let e = 0; e < 10; e++) {
      const pulse = 0.5 + Math.random() * 0.5;
      rgbaTableLookup(cyan1T, 0.4 * pulse);
      rgbaTableLookup(cyan2T, 0.4 * pulse);
      rgbaTableLookup(cyan3T, 0.9 * pulse);
      rgbaTableLookup(ltcyanT, 0.6 * pulse);
      rgbaTableLookup(whiteT, 0.7 * pulse);
    }
    // Player: 6 lookups
    const glowA = 0.3 + Math.random() * 0.7;
    for (let i = 0; i < 6; i++) {
      rgbaTableLookup(fullCyanT, glowA * (1 - i * 0.15));
    }
    // Particles: 30 lookups
    for (let i = 0; i < 30; i++) {
      hslCached(Math.random() * 360 | 0, 100, 70);
    }
    // Damage numbers: 10 lookups
    for (let i = 0; i < 5; i++) {
      const alpha = 0.5 + Math.random() * 0.5;
      rgbaTableLookup(goldT, alpha);
      rgbaTableLookup(blackT, alpha * 0.8);
    }
  });
});

const isJson = process.env.MITATA_JSON === '1';
run({ format: isJson ? { json: { debug: false, samples: false } } : undefined });
