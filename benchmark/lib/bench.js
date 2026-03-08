/**
 * Lightweight micro-benchmark runner for Rainboids.
 *
 * Usage:
 *   import { measure, suite, formatResults } from '../lib/bench.js';
 *
 *   const results = suite('My Suite', [
 *     measure('thing A', () => { ... }),
 *     measure('thing B', () => { ... }, { iterations: 100000 }),
 *   ]);
 */

const ANSI = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
};

function c(code, text) { return `${code}${text}${ANSI.reset}`; }

// ---------------------------------------------------------------------------
// Core measurement
// ---------------------------------------------------------------------------

/**
 * Run fn many times and collect timing statistics.
 * @param {string}   name
 * @param {Function} fn
 * @param {object}   [opts]
 * @param {number}   [opts.warmup=500]       – warmup iterations
 * @param {number}   [opts.iterations=50000] – measured iterations
 * @param {number}   [opts.batch=100]        – iterations per timing sample
 * @returns {BenchResult}
 */
export function measure(name, fn, opts = {}) {
  const {
    warmup     = 500,
    iterations = 50000,
    batch      = 100,
  } = opts;

  // Warmup – let JIT settle
  for (let i = 0; i < warmup; i++) fn();

  const batches = Math.max(1, Math.floor(iterations / batch));
  const samples = new Float64Array(batches); // ms per single operation

  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();
    for (let i = 0; i < batch; i++) fn();
    samples[b] = (performance.now() - t0) / batch;
  }

  return { name, ...computeStats(samples) };
}

function computeStats(samples) {
  const sorted = Float64Array.from(samples).sort();
  const n      = sorted.length;
  const sum    = sorted.reduce((a, b) => a + b, 0);
  const mean   = sum / n;

  return {
    mean,
    median: sorted[Math.floor(n * 0.50)],
    p95:    sorted[Math.floor(n * 0.95)],
    p99:    sorted[Math.floor(n * 0.99)],
    min:    sorted[0],
    max:    sorted[n - 1],
    opsPerSec: mean > 0 ? 1e3 / mean : Infinity,
    count:  n * /* batch implicit */ 1,
  };
}

// ---------------------------------------------------------------------------
// Suite grouping
// ---------------------------------------------------------------------------

/**
 * @param {string}       suiteName
 * @param {BenchResult[]} results   – array of measure() return values
 * @returns {Suite}
 */
export function suite(suiteName, results) {
  return { suite: suiteName, benchmarks: results, timestamp: Date.now() };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtTime(ms) {
  if (ms < 0.001)  return `${(ms * 1e6).toFixed(1)} ns`;
  if (ms < 1)      return `${(ms * 1e3).toFixed(1)} µs`;
  return               `${ms.toFixed(3)} ms`;
}

function fmtOps(opsPerSec) {
  if (opsPerSec >= 1e9) return `${(opsPerSec / 1e9).toFixed(2)} Gops/s`;
  if (opsPerSec >= 1e6) return `${(opsPerSec / 1e6).toFixed(2)} Mops/s`;
  if (opsPerSec >= 1e3) return `${(opsPerSec / 1e3).toFixed(2)} Kops/s`;
  return `${opsPerSec.toFixed(1)} ops/s`;
}

/** Pretty-print a single suite to stdout. */
export function printSuite(s) {
  const COL_NAME = 40;
  const COL_OPS  = 16;
  const COL_MEAN = 12;
  const COL_P95  = 12;
  const COL_MIN  = 12;

  const hr = '─'.repeat(COL_NAME + COL_OPS + COL_MEAN + COL_P95 + COL_MIN + 13);

  console.log();
  console.log(c(ANSI.bold + ANSI.cyan, `  ${s.suite}`));
  console.log(c(ANSI.gray, `  ${hr}`));
  console.log(
    c(ANSI.dim,
      `  ${'Benchmark'.padEnd(COL_NAME)}  ${'ops/sec'.padEnd(COL_OPS)}  ${'mean'.padEnd(COL_MEAN)}  ${'p95'.padEnd(COL_P95)}  ${'min'.padEnd(COL_MIN)}`
    )
  );
  console.log(c(ANSI.gray, `  ${hr}`));

  for (const b of s.benchmarks) {
    const name = b.name.padEnd(COL_NAME);
    const ops  = fmtOps(b.opsPerSec).padEnd(COL_OPS);
    const mean = fmtTime(b.mean).padEnd(COL_MEAN);
    const p95  = fmtTime(b.p95).padEnd(COL_P95);
    const min  = fmtTime(b.min).padEnd(COL_MIN);
    console.log(`  ${c(ANSI.white, name)}  ${c(ANSI.green, ops)}  ${mean}  ${c(ANSI.gray, p95)}  ${c(ANSI.gray, min)}`);
  }

  console.log(c(ANSI.gray, `  ${hr}`));
}

/** Pretty-print a comparison of two suite arrays. */
export function printComparison(currentSuites, targetSuites, targetLabel) {
  const targetMap = new Map();
  for (const s of targetSuites) {
    for (const b of s.benchmarks) {
      targetMap.set(`${s.suite}::${b.name}`, b);
    }
  }

  const COL_NAME   = 42;
  const COL_CURR   = 14;
  const COL_TGT    = 14;
  const COL_CHANGE = 12;

  for (const s of currentSuites) {
    const hr = '─'.repeat(COL_NAME + COL_CURR + COL_TGT + COL_CHANGE + 15);
    console.log();
    console.log(c(ANSI.bold + ANSI.cyan, `  ${s.suite}`));
    console.log(c(ANSI.gray, `  ${hr}`));
    console.log(
      c(ANSI.dim,
        `  ${'Benchmark'.padEnd(COL_NAME)}  ${'current'.padEnd(COL_CURR)}  ${targetLabel.slice(0,12).padEnd(COL_TGT)}  ${'Δ'.padEnd(COL_CHANGE)}`
      )
    );
    console.log(c(ANSI.gray, `  ${hr}`));

    for (const b of s.benchmarks) {
      const key = `${s.suite}::${b.name}`;
      const target = targetMap.get(key);
      const name = b.name.padEnd(COL_NAME);
      const curr = fmtTime(b.mean).padEnd(COL_CURR);

      if (!target) {
        console.log(`  ${name}  ${curr}  ${'(no data)'.padEnd(COL_TGT)}  ${''.padEnd(COL_CHANGE)}`);
        continue;
      }

      const tgt  = fmtTime(target.mean).padEnd(COL_TGT);
      // positive pct = current faster than target (improvement)
      // negative pct = current slower (regression)
      const pct  = ((target.mean - b.mean) / target.mean) * 100;
      const sign = pct >= 0 ? '+' : '';
      const changeStr = `${sign}${pct.toFixed(1)}%`;
      const changeColored = pct > 1
        ? c(ANSI.green,  changeStr + ' ▲')
        : pct < -1
          ? c(ANSI.red,   changeStr + ' ▼')
          : c(ANSI.gray,  changeStr + '  ');

      console.log(`  ${c(ANSI.white, name)}  ${curr}  ${tgt}  ${changeColored}`);
    }

    console.log(c(ANSI.gray, `  ${hr}`));
  }
}

/** Serialize suites to a plain JSON-safe object. */
export function toJSON(suites, meta = {}) {
  return {
    meta: { ...meta, timestamp: Date.now(), node: process.version },
    suites: suites.map(s => ({
      suite: s.suite,
      timestamp: s.timestamp,
      benchmarks: s.benchmarks.map(b => ({
        name:      b.name,
        mean:      b.mean,
        median:    b.median,
        p95:       b.p95,
        p99:       b.p99,
        min:       b.min,
        max:       b.max,
        opsPerSec: b.opsPerSec,
      })),
    })),
  };
}
