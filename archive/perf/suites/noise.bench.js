/**
 * Noise & star-generation benchmarks
 *
 * Tests the procedural generation pipeline:
 *  1. Perlin2 – single sample
 *  2. FBM – octave accumulation (3, 4, 5 octaves)
 *  3. Worley – cellular noise
 *  4. getStarDensity() – full layered pipeline
 *  5. generateStarPositions() – full star-field generation at multiple counts
 *
 * The noise functions are pure math; the star-gen functions exercise
 * the full pipeline including grid sampling, jitter, depth assignment,
 * and density evaluation.
 */

import '../lib/browser-mock.js';
import { measure, suite } from '../lib/bench.js';
import { getStarDensity, generateStarPositions } from '../../js/modules/utils.js';
import { NOISE_CONFIG } from '../../js/modules/constants.js';

// ---------------------------------------------------------------------------
// Re-implement NoiseGenerator locally so we can benchmark primitives directly
// (utils.js exports only the high-level functions, not the class)
// ---------------------------------------------------------------------------

class NoiseGenerator {
  constructor(seed = 12345) {
    this.p = new Uint8Array(512);
    this.seed = seed;
    this._reseed(seed);
  }
  _reseed(seed) {
    const rng = this._rng(seed);
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 255; i > 0; i--) {
      const n = Math.floor(rng() * (i + 1));
      [this.p[i], this.p[n]] = [this.p[n], this.p[i]];
    }
    for (let i = 0; i < 256; i++) this.p[i + 256] = this.p[i];
  }
  _rng(seed) {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }
  _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  _lerp(t, a, b) { return a + t * (b - a); }
  _grad(hash, x, y) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  perlin2(x, y) {
    const X  = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x);  y -= Math.floor(y);
    const u = this._fade(x), v = this._fade(y);
    const A = this.p[X] + Y,   AA = this.p[A],   AB = this.p[A + 1];
    const B = this.p[X + 1] + Y, BA = this.p[B], BB = this.p[B + 1];
    return this._lerp(v,
      this._lerp(u, this._grad(this.p[AA], x, y),     this._grad(this.p[BA], x - 1, y)),
      this._lerp(u, this._grad(this.p[AB], x, y - 1), this._grad(this.p[BB], x - 1, y - 1))
    );
  }
  fbm(x, y, octaves, lacunarity, persistence) {
    let total = 0, freq = 1, amp = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.perlin2(x * freq, y * freq) * amp;
      max   += amp;
      amp   *= persistence;
      freq  *= lacunarity;
    }
    return total / max;
  }
  worley(x, y) {
    const Pi = Math.floor(x), Pf = x - Pi;
    const Pj = Math.floor(y), Pjf = y - Pj;
    let minDist = 1000;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const seed = (Pi + i) * 127 + (Pj + j) * 311 + this.seed;
        const rng = this._rng(seed);
        const px = rng(), py = rng();
        const dx = px + i - Pf, dy = py + j - Pjf;
        minDist = Math.min(minDist, Math.hypot(dx, dy));
      }
    }
    return Math.min(minDist, 1);
  }
}

const noise = new NoiseGenerator(42);
const FAR   = NOISE_CONFIG.FAR_LAYER;
const MID   = NOISE_CONFIG.MID_LAYER;
const NEAR  = NOISE_CONFIG.NEAR_LAYER;

// Pre-compute random sample coordinates to avoid Math.random() noise in hot loops
const SAMPLES = Array.from({ length: 1000 }, () => ({
  x: Math.random() * 1920,
  y: Math.random() * 1080,
  z: Math.random() * 4,
}));

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function runSuite() {
  return suite('Noise & Star Generation', [
    // ── Primitive noise operations ─────────────────────────────────────────
    measure('Perlin2 – single sample', () => {
      noise.perlin2(SAMPLES[0].x * FAR.FBM_SCALE, SAMPLES[0].y * FAR.FBM_SCALE);
    }, { iterations: 200000, batch: 500 }),

    measure('FBM – 3 octaves', () => {
      noise.fbm(SAMPLES[0].x * NEAR.FBM_SCALE, SAMPLES[0].y * NEAR.FBM_SCALE, 3, 2.0, 0.6);
    }, { iterations: 100000, batch: 200 }),

    measure('FBM – 4 octaves', () => {
      noise.fbm(SAMPLES[0].x * MID.FBM_SCALE, SAMPLES[0].y * MID.FBM_SCALE, 4, 2.0, 0.5);
    }, { iterations: 100000, batch: 200 }),

    measure('FBM – 5 octaves (far layer)', () => {
      noise.fbm(SAMPLES[0].x * FAR.FBM_SCALE, SAMPLES[0].y * FAR.FBM_SCALE, 5, 2.1, 0.45);
    }, { iterations: 100000, batch: 200 }),

    measure('Worley – single sample', () => {
      noise.worley(SAMPLES[0].x * FAR.WORLEY_SCALE, SAMPLES[0].y * FAR.WORLEY_SCALE);
    }, { iterations: 100000, batch: 200 }),

    // ── Full getStarDensity() pipeline ────────────────────────────────────
    measure('getStarDensity() – far layer   (z=0.3)', () => {
      getStarDensity(SAMPLES[0].x, SAMPLES[0].y, 0.3);
    }, { iterations: 10000, batch: 20 }),

    measure('getStarDensity() – mid layer   (z=1.0)', () => {
      getStarDensity(SAMPLES[0].x, SAMPLES[0].y, 1.0);
    }, { iterations: 10000, batch: 20 }),

    measure('getStarDensity() – near layer  (z=2.5)', () => {
      getStarDensity(SAMPLES[0].x, SAMPLES[0].y, 2.5);
    }, { iterations: 10000, batch: 20 }),

    measure('getStarDensity() – 100 samples (mixed z)', () => {
      for (let i = 0; i < 100; i++) {
        const s = SAMPLES[i];
        getStarDensity(s.x, s.y, s.z);
      }
    }, { iterations: 500, batch: 2 }),

    // ── generateStarPositions() – end-to-end ──────────────────────────────
    measure('generateStarPositions()  30 stars  (background default)', () => {
      generateStarPositions(1920, 1080, 30);
    }, { iterations: 200, batch: 2 }),

    measure('generateStarPositions()  55 stars  (color+bg combined)', () => {
      generateStarPositions(1920, 1080, 55);
    }, { iterations: 100, batch: 1 }),

    measure('generateStarPositions() 200 stars  (stress)', () => {
      generateStarPositions(1920, 1080, 200);
    }, { iterations: 50, batch: 1 }),

    measure('generateStarPositions() 500 stars  (heavy stress)', () => {
      generateStarPositions(1920, 1080, 500);
    }, { iterations: 20, batch: 1 }),
  ]);
}
