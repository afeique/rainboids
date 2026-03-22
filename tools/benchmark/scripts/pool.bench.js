/**
 * pool.bench.js — PoolManager benchmarks using mitata
 *
 * Tests:
 *  1. get() + release() round-trip at varying pool sizes
 *  2. Swap-and-pop (current impl) vs indexOf+splice (naive impl)
 *  3. cleanupInactive() scan performance
 *  4. Pool churn — allocating objects beyond pool capacity
 *  5. updateActive() scan
 */
import { bench, group, run } from 'mitata';
import '../browser-mock.js';
import { PoolManager } from '../../js/modules/core/pool-manager.js';

// ---------------------------------------------------------------------------
// Minimal game-like object that satisfies PoolManager's contract
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
}

// ---------------------------------------------------------------------------
// Naive alternative: indexOf + splice  (what the old code did)
// ---------------------------------------------------------------------------
class NaivePool {
  constructor(Cls, size) {
    this.Cls = Cls;
    this.pool = Array.from({ length: size }, () => new Cls());
    this.activeObjects = [];
  }
  get(...args) {
    const obj = this.pool.length > 0 ? this.pool.pop() : new this.Cls();
    obj.reset(...args);
    this.activeObjects.push(obj);
    return obj;
  }
  release(obj) {
    const index = this.activeObjects.indexOf(obj);  // O(n)
    if (index > -1) {
      this.activeObjects.splice(index, 1);           // O(n) shift
      obj.active = false;
      this.pool.push(obj);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fillPool(pool, count) {
  const objs = [];
  for (let i = 0; i < count; i++) objs.push(pool.get(i * 10, i * 10));
  return objs;
}

function drainPool(pool, objs) {
  for (const o of objs) pool.release(o);
}

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

group('get+release round-trip', () => {
  bench('10 objects', () => {
    const pool = new PoolManager(Entity, 10);
    const objs = [];
    for (let i = 0; i < 10; i++) objs.push(pool.get(i, i));
    for (let i = objs.length - 1; i >= 0; i--) pool.release(objs[i]);
  });

  bench('100 objects', () => {
    const pool = new PoolManager(Entity, 100);
    const objs = [];
    for (let i = 0; i < 100; i++) objs.push(pool.get(i, i));
    for (let i = objs.length - 1; i >= 0; i--) pool.release(objs[i]);
  });

  bench('500 objects', () => {
    const pool = new PoolManager(Entity, 500);
    const objs = [];
    for (let i = 0; i < 500; i++) objs.push(pool.get(i, i));
    for (let i = objs.length - 1; i >= 0; i--) pool.release(objs[i]);
  });
});

group('release strategy: swap-and-pop vs indexOf+splice (10 active)', () => {
  bench('swap-and-pop (PoolManager)', () => {
    const pool = new PoolManager(Entity, 10);
    const objs = fillPool(pool, 10);
    pool.release(objs[0]); // worst case for indexOf: index 0
    pool.get(0, 0);
  });

  bench('indexOf+splice (NaivePool)', () => {
    const pool = new NaivePool(Entity, 10);
    const objs = fillPool(pool, 10);
    pool.release(objs[0]);
    pool.get(0, 0);
  });
});

group('release strategy: swap-and-pop vs indexOf+splice (100 active)', () => {
  bench('swap-and-pop (PoolManager)', () => {
    const pool = new PoolManager(Entity, 100);
    const objs = fillPool(pool, 100);
    pool.release(objs[0]);
    pool.get(0, 0);
  });

  bench('indexOf+splice (NaivePool)', () => {
    const pool = new NaivePool(Entity, 100);
    const objs = fillPool(pool, 100);
    pool.release(objs[0]);
    pool.get(0, 0);
  });
});

group('release strategy: swap-and-pop vs indexOf+splice (500 active)', () => {
  bench('swap-and-pop (PoolManager)', () => {
    const pool = new PoolManager(Entity, 500);
    const objs = fillPool(pool, 500);
    pool.release(objs[0]);
    pool.get(0, 0);
  });

  bench('indexOf+splice (NaivePool)', () => {
    const pool = new NaivePool(Entity, 500);
    const objs = fillPool(pool, 500);
    pool.release(objs[0]);
    pool.get(0, 0);
  });
});

group('cleanupInactive()', () => {
  bench('50 objs, 25% inactive', () => {
    const pool = new PoolManager(Entity, 50);
    const objs = fillPool(pool, 50);
    for (let i = 0; i < 12; i++) objs[i].active = false;
    pool.cleanupInactive();
  });

  bench('50 objs, 75% inactive', () => {
    const pool = new PoolManager(Entity, 50);
    const objs = fillPool(pool, 50);
    for (let i = 0; i < 37; i++) objs[i].active = false;
    pool.cleanupInactive();
  });

  bench('200 objs, 50% inactive', () => {
    const pool = new PoolManager(Entity, 200);
    const objs = fillPool(pool, 200);
    for (let i = 0; i < 100; i++) objs[i].active = false;
    pool.cleanupInactive();
  });
});

group('pool churn', () => {
  bench('alloc beyond capacity (100->200)', () => {
    const pool = new PoolManager(Entity, 100);
    const objs = fillPool(pool, 200); // forces 100 new allocations
    drainPool(pool, objs);
  });
});

group('updateActive()', () => {
  bench('100 objects', () => {
    const pool = new PoolManager(Entity, 100);
    fillPool(pool, 100);
    pool.updateActive();
  });
});

await run(process.env.MITATA_JSON ? { format: { json: { debug: false, samples: false } } } : {});
