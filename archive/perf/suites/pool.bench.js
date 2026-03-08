/**
 * Pool Manager benchmarks
 *
 * Tests:
 *  1. get() + release() round-trip at varying pool sizes
 *  2. Swap-and-pop (current impl) vs indexOf+splice (naive impl)
 *  3. cleanupInactive() scan performance
 *  4. Pool churn – allocating objects beyond pool capacity
 */

import '../lib/browser-mock.js';
import { measure, suite } from '../lib/bench.js';
import { PoolManager } from '../../js/modules/pool-manager.js';

// ---------------------------------------------------------------------------
// Minimal game-like object that satisfies PoolManager's contract
// ---------------------------------------------------------------------------
class Entity {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.radius = 10;
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
// Benchmark definitions
// ---------------------------------------------------------------------------

function makeGetReleaseBench(label, poolSize, cycleCount) {
  return measure(label, () => {
    const pool = new PoolManager(Entity, poolSize);
    const objs = [];
    for (let i = 0; i < cycleCount; i++) objs.push(pool.get(i, i));
    // release in random (worst-case indexOf) order
    for (let i = objs.length - 1; i >= 0; i--) pool.release(objs[i]);
  }, { iterations: 2000, batch: 10 });
}

// Benchmark: swap-and-pop release at various active-list sizes
function makeSwapVsSpliceBench(activeCount) {
  const label = `release() – swap-and-pop   (${activeCount} active)`;
  return measure(label, () => {
    const pool = new PoolManager(Entity, activeCount);
    const objs = fillPool(pool, activeCount);
    // release first element (worst case for indexOf – found at index 0)
    pool.release(objs[0]);
    // refill
    pool.get(0, 0);
  }, { iterations: 20000, batch: 50 });
}

function makeNaiveSpliceBench(activeCount) {
  const label = `release() – indexOf+splice  (${activeCount} active)`;
  return measure(label, () => {
    const pool = new NaivePool(Entity, activeCount);
    const objs = fillPool(pool, activeCount);
    pool.release(objs[0]);
    pool.get(0, 0);
  }, { iterations: 20000, batch: 50 });
}

function makeCleanupBench(activeCount, inactiveRatio) {
  const label = `cleanupInactive() – ${activeCount} objs, ${Math.round(inactiveRatio * 100)}% inactive`;
  return measure(label, () => {
    const pool = new PoolManager(Entity, activeCount);
    const objs = fillPool(pool, activeCount);
    // Mark a portion inactive without releasing (simulates the pre-fix pattern)
    const inactiveCount = Math.floor(activeCount * inactiveRatio);
    for (let i = 0; i < inactiveCount; i++) objs[i].active = false;
    pool.cleanupInactive();
  }, { iterations: 5000, batch: 10 });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export function runSuite() {
  return suite('Pool Manager', [
    // -- round-trip cycles at different pool sizes
    makeGetReleaseBench('get+release cycle  (10 objects)',   10,  10),
    makeGetReleaseBench('get+release cycle  (100 objects)',  100, 100),
    makeGetReleaseBench('get+release cycle  (500 objects)',  500, 500),

    // -- release strategy head-to-head (same pool size, first-element release = worst indexOf case)
    makeSwapVsSpliceBench(10),
    makeNaiveSpliceBench(10),
    makeSwapVsSpliceBench(100),
    makeNaiveSpliceBench(100),
    makeSwapVsSpliceBench(500),
    makeNaiveSpliceBench(500),

    // -- cleanupInactive() pass
    makeCleanupBench(50,  0.25),
    makeCleanupBench(50,  0.75),
    makeCleanupBench(200, 0.50),

    // -- pool churn: continuously getting objects past initial pool size
    measure('pool churn – alloc beyond capacity (100→200)', () => {
      const pool = new PoolManager(Entity, 100);
      const objs = fillPool(pool, 200); // forces 100 new allocations
      drainPool(pool, objs);
    }, { iterations: 2000, batch: 5 }),

    // -- updateActive() scan
    measure('updateActive() – 100 objects', () => {
      const pool = new PoolManager(Entity, 100);
      fillPool(pool, 100);
      pool.updateActive();
    }, { iterations: 10000, batch: 20 }),
  ]);
}
