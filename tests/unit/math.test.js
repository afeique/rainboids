/**
 * tests/unit/math.test.js — unit tests for math utility functions in utils.js
 *
 * Tests: wrap(), wrapValue(), random(), collision()
 * These are pure functions that require no browser globals.
 */

// ---------------------------------------------------------------------------
// Minimal browser shims needed for utils.js imports (window.innerWidth etc.)
// ---------------------------------------------------------------------------
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    innerWidth: 1920, innerHeight: 1080,
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {}, removeEventListener: () => {},
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        const ctx = {
          save: () => {}, restore: () => {}, translate: () => {}, scale: () => {},
          rotate: () => {}, beginPath: () => {}, closePath: () => {}, fill: () => {},
          stroke: () => {}, fillRect: () => {}, clearRect: () => {}, arc: () => {},
          moveTo: () => {}, lineTo: () => {}, fillText: () => {},
          measureText: () => ({ width: 0 }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          putImageData: () => {}, setTransform: () => {}, resetTransform: () => {},
          shadowBlur: 0, shadowColor: '', globalAlpha: 1,
          globalCompositeOperation: 'source-over',
          fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
          font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
        };
        return { getContext: () => ctx, width: 1920, height: 1080 };
      }
      return { style: {}, addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } };
    },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, body: { appendChild: () => {} },
  };
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { vibrate: undefined };
}
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class Image { constructor() { this.src = ''; } };
}
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D { constructor() {} };
}

import { wrap, wrapValue, random, collision } from '../../js/modules/utils.js';

// ---------------------------------------------------------------------------
// wrap()
// ---------------------------------------------------------------------------

describe('wrap()', () => {
  const W = 1920, H = 1080;

  test('does nothing when object is within bounds', () => {
    const obj = { x: 100, y: 200 };
    wrap(obj, W, H);
    expect(obj.x).toBe(100);
    expect(obj.y).toBe(200);
  });

  test('wraps x when it goes past right edge', () => {
    const obj = { x: W + 1, y: 0 };
    wrap(obj, W, H);
    expect(obj.x).toBe(1);
  });

  test('wraps x when it goes past left edge', () => {
    const obj = { x: -5, y: 0 };
    wrap(obj, W, H);
    expect(obj.x).toBe(W - 5);
  });

  test('wraps y when it goes past bottom edge', () => {
    const obj = { x: 0, y: H + 10 };
    wrap(obj, W, H);
    expect(obj.y).toBe(10);
  });

  test('wraps y when it goes past top edge', () => {
    const obj = { x: 0, y: -20 };
    wrap(obj, W, H);
    expect(obj.y).toBe(H - 20);
  });

  test('wraps both axes simultaneously', () => {
    const obj = { x: W + 50, y: -30 };
    wrap(obj, W, H);
    expect(obj.x).toBe(50);
    expect(obj.y).toBe(H - 30);
  });

  test('x exactly at W is not wrapped (boundary check uses strict greater-than)', () => {
    // wrap() uses: if (x > width) x -= width
    // So x === W does NOT trigger wrapping
    const obj = { x: W, y: 0 };
    wrap(obj, W, H);
    expect(obj.x).toBe(W);
  });

  test('x = W+1 wraps to 1', () => {
    const obj = { x: W + 1, y: 0 };
    wrap(obj, W, H);
    expect(obj.x).toBe(1);
  });

  test('x = 0 does not wrap', () => {
    const obj = { x: 0, y: 0 };
    wrap(obj, W, H);
    expect(obj.x).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// wrapValue()
// ---------------------------------------------------------------------------

describe('wrapValue()', () => {
  test('value within range is returned unchanged', () => {
    expect(wrapValue(1.5, 0, Math.PI * 2)).toBeCloseTo(1.5);
  });

  test('wraps value above max back into range', () => {
    // value = 7 (> 2π ≈ 6.28), range = [0, 2π]
    const TWO_PI = Math.PI * 2;
    const result = wrapValue(TWO_PI + 1, 0, TWO_PI);
    expect(result).toBeCloseTo(1);
  });

  test('handles range [0, 10]', () => {
    expect(wrapValue(15, 0, 10)).toBeCloseTo(5);
    expect(wrapValue(5, 0, 10)).toBeCloseTo(5);
  });

  test('returns min when range is 0 (avoids division by zero)', () => {
    expect(wrapValue(42, 5, 5)).toBe(5);
  });

  test('value exactly at min returns min', () => {
    expect(wrapValue(0, 0, 10)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// random()
// ---------------------------------------------------------------------------

describe('random()', () => {
  test('returns values within [a, b)', () => {
    for (let i = 0; i < 100; i++) {
      const v = random(5, 15);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(15);
    }
  });

  test('works with negative range', () => {
    for (let i = 0; i < 50; i++) {
      const v = random(-10, -1);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThan(-1);
    }
  });

  test('a === b returns a (zero-width range)', () => {
    expect(random(7, 7)).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// collision()
// ---------------------------------------------------------------------------

describe('collision()', () => {
  test('detects overlap when circles touch', () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 15, y: 0, radius: 10 };
    // distance = 15, sum of radii = 20 → overlapping
    expect(collision(a, b)).toBe(true);
  });

  test('no collision when circles are far apart', () => {
    const a = { x: 0, y: 0, radius: 5 };
    const b = { x: 100, y: 100, radius: 5 };
    expect(collision(a, b)).toBe(false);
  });

  test('no collision when circles are exactly touching (edge case)', () => {
    // distance exactly equals sum of radii → not strictly less than
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 20, y: 0, radius: 10 };
    // Math.hypot(20,0) = 20, radii sum = 20 → 20 < 20 is false
    expect(collision(a, b)).toBe(false);
  });

  test('same position always collides', () => {
    const a = { x: 50, y: 50, radius: 5 };
    const b = { x: 50, y: 50, radius: 5 };
    expect(collision(a, b)).toBe(true);
  });

  test('works with zero-radius objects at same point', () => {
    const a = { x: 0, y: 0, radius: 0 };
    const b = { x: 0, y: 0, radius: 0 };
    // 0 < 0 is false — zero-radius at same position does NOT count as collision
    expect(collision(a, b)).toBe(false);
  });

  test('is symmetric (a vs b == b vs a)', () => {
    const a = { x: 0,  y: 0,  radius: 15 };
    const b = { x: 10, y: 10, radius: 15 };
    expect(collision(a, b)).toBe(collision(b, a));
  });
});
