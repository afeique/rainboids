/**
 * tests/unit/pool.test.js — unit tests for PoolManager
 *
 * Runs in Node.js (testEnvironment: 'node'). Browser globals are shimmed
 * before importing the game module.
 */

// ---------------------------------------------------------------------------
// Browser shims — must happen before any game module import
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
    createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, body: { appendChild: () => {} },
  };
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { vibrate: undefined };
}

import { PoolManager } from '../../js/modules/pool-manager.js';

// ---------------------------------------------------------------------------
// Minimal entity that satisfies PoolManager's contract
// ---------------------------------------------------------------------------
class Entity {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.radius = 10;
    this._poolIndex = -1;
  }
  reset(x = 0, y = 0) {
    this.active = true;
    this.x = x;
    this.y = y;
  }
  update() { this.x += 0.1; }
  draw() {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePool(size) {
  return new PoolManager(Entity, size);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PoolManager – construction', () => {
  test('pre-allocates the requested number of objects', () => {
    const pool = makePool(5);
    expect(pool.pool.length).toBe(5);
    expect(pool.activeObjects.length).toBe(0);
  });

  test('starts with an empty active list', () => {
    const pool = makePool(10);
    expect(pool.activeObjects).toHaveLength(0);
  });
});

describe('PoolManager – get()', () => {
  test('returns an active object', () => {
    const pool = makePool(5);
    const obj = pool.get(1, 2);
    expect(obj.active).toBe(true);
    expect(obj.x).toBe(1);
    expect(obj.y).toBe(2);
  });

  test('moves object from pool to activeObjects', () => {
    const pool = makePool(5);
    pool.get(0, 0);
    expect(pool.pool.length).toBe(4);
    expect(pool.activeObjects.length).toBe(1);
  });

  test('assigns _poolIndex correctly', () => {
    const pool = makePool(5);
    const a = pool.get(0, 0);
    const b = pool.get(1, 1);
    const c = pool.get(2, 2);
    expect(a._poolIndex).toBe(0);
    expect(b._poolIndex).toBe(1);
    expect(c._poolIndex).toBe(2);
  });

  test('allocates new object when pool is exhausted', () => {
    const pool = makePool(2);
    pool.get(0, 0);
    pool.get(1, 1);
    // Pool exhausted — should allocate
    const obj = pool.get(2, 2);
    expect(obj).toBeInstanceOf(Entity);
    expect(pool.activeObjects.length).toBe(3);
  });
});

describe('PoolManager – release()', () => {
  test('moves object back to pool and marks inactive', () => {
    const pool = makePool(5);
    const obj = pool.get(0, 0);
    pool.release(obj);
    expect(obj.active).toBe(false);
    expect(pool.activeObjects.length).toBe(0);
    expect(pool.pool).toContain(obj);
  });

  test('keeps other objects in activeObjects after release', () => {
    const pool = makePool(10);
    const a = pool.get(0, 0);
    const b = pool.get(1, 1);
    const c = pool.get(2, 2);
    pool.release(b);
    expect(pool.activeObjects.length).toBe(2);
    expect(pool.activeObjects).not.toContain(b);
    // a and c should still be there
    expect(pool.activeObjects.some(o => o === a || o === c)).toBe(true);
  });

  test('updates _poolIndex after swap-and-pop', () => {
    const pool = makePool(10);
    const a = pool.get(0, 0); // index 0
    const b = pool.get(1, 1); // index 1
    const c = pool.get(2, 2); // index 2
    // Release a (index 0) — c should be swapped to index 0
    pool.release(a);
    // The swapped object is now at index 0 with correct _poolIndex
    expect(pool.activeObjects[0]._poolIndex).toBe(0);
  });

  test('releasing the same object twice does not throw', () => {
    const pool = makePool(5);
    const obj = pool.get(0, 0);
    pool.release(obj);
    // Second release should be a no-op (index -1, not found)
    expect(() => pool.release(obj)).not.toThrow();
  });

  test('releasing an object not in pool does not throw', () => {
    const pool = makePool(5);
    const orphan = new Entity();
    expect(() => pool.release(orphan)).not.toThrow();
  });
});

describe('PoolManager – cleanupInactive()', () => {
  test('removes objects whose .active is false', () => {
    const pool = makePool(10);
    const objs = [];
    for (let i = 0; i < 5; i++) objs.push(pool.get(i, i));
    // Mark first two inactive without going through release
    objs[0].active = false;
    objs[1].active = false;
    pool.cleanupInactive();
    expect(pool.activeObjects.length).toBe(3);
    expect(pool.activeObjects).not.toContain(objs[0]);
    expect(pool.activeObjects).not.toContain(objs[1]);
  });

  test('is a no-op when all objects are active', () => {
    const pool = makePool(5);
    for (let i = 0; i < 5; i++) pool.get(i, i);
    pool.cleanupInactive();
    expect(pool.activeObjects.length).toBe(5);
  });
});

describe('PoolManager – updateActive()', () => {
  test('calls update() on each active object', () => {
    const pool = makePool(3);
    const objs = [pool.get(0, 0), pool.get(1, 1), pool.get(2, 2)];
    const initialX = objs.map(o => o.x);
    pool.updateActive();
    objs.forEach((o, i) => expect(o.x).toBeCloseTo(initialX[i] + 0.1));
  });
});

describe('PoolManager – round-trip integrity', () => {
  test('get then release fully restores pool size', () => {
    const pool = makePool(10);
    const objs = [];
    for (let i = 0; i < 10; i++) objs.push(pool.get(i, i));
    expect(pool.pool.length).toBe(0);
    for (const o of objs) pool.release(o);
    expect(pool.pool.length).toBe(10);
    expect(pool.activeObjects.length).toBe(0);
  });

  test('reused objects are reset correctly on re-get()', () => {
    const pool = makePool(1);
    const obj = pool.get(5, 10);
    pool.release(obj);
    const obj2 = pool.get(99, 88);
    expect(obj2).toBe(obj); // same instance reused
    expect(obj2.x).toBe(99);
    expect(obj2.y).toBe(88);
    expect(obj2.active).toBe(true);
  });
});
