/**
 * Lightweight micro-benchmark runner for Rainboids.
 *
 * Usage:
 *   import { measure, suite, aggregateRuns, printSuite, printComparison } from '../lib/bench.js';
 *
 *   // Single run
 *   const result = suite('My Suite', [
 *     measure('thing A', () => { ... }),
 *     measure('thing B', () => { ... }, { iterations: 100000 }),
 *   ]);
 *
 *   // Multiple runs (averaged, with stddev)
 *   const runs = [suite(...), suite(...), suite(...)];
 *   const averaged = aggregateRuns(runs);
 */

export const ANSI = {
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

export const c = (code, text) => `${code}${text}${ANSI.reset}`;

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

  return { name, runs: 1, ...computeStats(samples) };
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
    stddev: 0, // populated by aggregateRuns when runs > 1
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
  return { suite: suiteName, runs: 1, benchmarks: results, timestamp: Date.now() };
}

// ---------------------------------------------------------------------------
// Multi-run aggregation
// ---------------------------------------------------------------------------

/**
 * Merge N runs of the same suite into a single suite with averaged stats
 * and between-run standard deviation (σ) on each benchmark's mean.
 *
 * @param {Suite[]} suiteRuns  – array of suite() results, one per run
 * @returns {Suite}            – merged suite with .runs = N and .stddev on each benchmark
 */
export function aggregateRuns(suiteRuns) {
  if (suiteRuns.length === 1) return suiteRuns[0];

  const n = suiteRuns.length;

  return {
    suite:      suiteRuns[0].suite,
    runs:       n,
    timestamp:  Date.now(),
    benchmarks: suiteRuns[0].benchmarks.map((_, i) =>
      mergeBenchResults(suiteRuns.map(s => s.benchmarks[i]))
    ),
  };
}

/**
 * Merge N BenchResult objects for the same benchmark into one,
 * averaging all stats and computing between-run σ of the mean.
 */
function mergeBenchResults(runResults) {
  const n     = runResults.length;
  const means = runResults.map(r => r.mean);
  const mean  = means.reduce((a, b) => a + b, 0) / n;

  // Between-run standard deviation of the mean
  const variance = means.reduce((s, m) => s + (m - mean) ** 2, 0) / n;
  const stddev   = Math.sqrt(variance);

  return {
    name:      runResults[0].name,
    runs:      n,
    mean,
    median:    runResults.reduce((s, r) => s + r.median, 0) / n,
    p95:       runResults.reduce((s, r) => s + r.p95,    0) / n,
    p99:       runResults.reduce((s, r) => s + r.p99,    0) / n,
    min:       Math.min(...runResults.map(r => r.min)),
    max:       Math.max(...runResults.map(r => r.max)),
    opsPerSec: mean > 0 ? 1e3 / mean : Infinity,
    stddev,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtTime(ms) {
  if (ms < 0.001)  return `${(ms * 1e6).toFixed(1)} ns`;
  if (ms < 1)      return `${(ms * 1e3).toFixed(1)} µs`;
  return               `${ms.toFixed(3)} ms`;
}

function fmtSigma(ms) {
  if (ms <= 0) return '';
  return `±${fmtTime(ms)}`;
}

function fmtOps(opsPerSec) {
  if (opsPerSec >= 1e9) return `${(opsPerSec / 1e9).toFixed(2)} Gops/s`;
  if (opsPerSec >= 1e6) return `${(opsPerSec / 1e6).toFixed(2)} Mops/s`;
  if (opsPerSec >= 1e3) return `${(opsPerSec / 1e3).toFixed(2)} Kops/s`;
  return `${opsPerSec.toFixed(1)} ops/s`;
}

/** Pretty-print a single suite to stdout. */
export function printSuite(s) {
  const multiRun = s.runs > 1;
  const COL_NAME  = 40;
  const COL_OPS   = 16;
  const COL_MEAN  = 12;
  const COL_SIGMA = multiRun ? 12 : 0;
  const COL_P95   = 12;
  const COL_MIN   = 12;
  const totalW    = COL_NAME + COL_OPS + COL_MEAN + COL_SIGMA + COL_P95 + COL_MIN + (multiRun ? 15 : 13);
  const hr        = '─'.repeat(totalW);

  const runLabel = multiRun ? c(ANSI.dim, `  (${s.runs} runs, averaged)`) : '';

  console.log();
  console.log(c(ANSI.bold + ANSI.cyan, `  ${s.suite}`) + runLabel);
  console.log(c(ANSI.gray, `  ${hr}`));

  const sigmaHeader = multiRun ? `  ${'±σ'.padEnd(COL_SIGMA)}` : '';
  console.log(
    c(ANSI.dim,
      `  ${'Benchmark'.padEnd(COL_NAME)}  ${'ops/sec'.padEnd(COL_OPS)}  ${'mean'.padEnd(COL_MEAN)}${sigmaHeader}  ${'p95'.padEnd(COL_P95)}  ${'min'.padEnd(COL_MIN)}`
    )
  );
  console.log(c(ANSI.gray, `  ${hr}`));

  for (const b of s.benchmarks) {
    const name  = b.name.padEnd(COL_NAME);
    const ops   = fmtOps(b.opsPerSec).padEnd(COL_OPS);
    const mean  = fmtTime(b.mean).padEnd(COL_MEAN);
    const sigma = multiRun ? `  ${c(ANSI.yellow, fmtSigma(b.stddev).padEnd(COL_SIGMA))}` : '';
    const p95   = fmtTime(b.p95).padEnd(COL_P95);
    const min   = fmtTime(b.min).padEnd(COL_MIN);
    console.log(`  ${c(ANSI.white, name)}  ${c(ANSI.green, ops)}  ${mean}${sigma}  ${c(ANSI.gray, p95)}  ${c(ANSI.gray, min)}`);
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

  // Detect if either side has multi-run results
  const anyMultiRun = currentSuites.some(s => s.runs > 1) ||
                      targetSuites.some(s  => s.runs > 1);

  const COL_NAME   = 42;
  const COL_CURR   = anyMultiRun ? 20 : 14;
  const COL_TGT    = anyMultiRun ? 20 : 14;
  const COL_CHANGE = 14;

  for (const s of currentSuites) {
    const multiRun  = s.runs > 1 || targetSuites.find(ts => ts.suite === s.suite)?.runs > 1;
    const runLabel  = multiRun ? c(ANSI.dim, `  (averaged)`) : '';
    const totalW    = COL_NAME + COL_CURR + COL_TGT + COL_CHANGE + 15;
    const hr        = '─'.repeat(totalW);

    const tgtShort = targetLabel.slice(0, 10);
    const currHdr  = 'current'.padEnd(COL_CURR);
    const tgtHdr   = tgtShort.padEnd(COL_TGT);

    console.log();
    console.log(c(ANSI.bold + ANSI.cyan, `  ${s.suite}`) + runLabel);
    console.log(c(ANSI.gray, `  ${hr}`));
    console.log(c(ANSI.dim, `  ${'Benchmark'.padEnd(COL_NAME)}  ${currHdr}  ${tgtHdr}  ${'Δ'.padEnd(COL_CHANGE)}`));
    console.log(c(ANSI.gray, `  ${hr}`));

    for (const b of s.benchmarks) {
      const key    = `${s.suite}::${b.name}`;
      const target = targetMap.get(key);
      const name   = b.name.padEnd(COL_NAME);

      // Format a value cell: "1.7 µs ±0.1 µs" or just "1.7 µs"
      const fmtCell = (bench, colW) => {
        const base  = fmtTime(bench.mean);
        const sigma = (bench.runs > 1 && bench.stddev > 0)
          ? ` ${c(ANSI.yellow, fmtSigma(bench.stddev))}`
          : '';
        return (base + sigma).padEnd(colW);
      };

      const curr = fmtCell(b, COL_CURR);

      if (!target) {
        console.log(`  ${name}  ${curr}  ${'(no data)'.padEnd(COL_TGT)}  ${''.padEnd(COL_CHANGE)}`);
        continue;
      }

      const tgt  = fmtCell(target, COL_TGT);

      // positive pct = current faster than target (improvement)
      // negative pct = current slower (regression)
      const pct    = ((target.mean - b.mean) / target.mean) * 100;
      const sign   = pct >= 0 ? '+' : '';
      const pctStr = `${sign}${pct.toFixed(1)}%`;

      // Flag if delta < combined σ — result may be noise
      const combinedSigma = (b.stddev || 0) + (target.stddev || 0);
      const noisy = combinedSigma > 0 && Math.abs(target.mean - b.mean) < combinedSigma;
      const noiseFlag = noisy ? c(ANSI.gray, ' ~') : '';

      const changeColored = pct > 1
        ? c(ANSI.green, pctStr + ' ▲') + noiseFlag
        : pct < -1
          ? c(ANSI.red,   pctStr + ' ▼') + noiseFlag
          : c(ANSI.gray,  pctStr + '   ');

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
      suite:     s.suite,
      runs:      s.runs ?? 1,
      timestamp: s.timestamp,
      benchmarks: s.benchmarks.map(b => ({
        name:      b.name,
        runs:      b.runs ?? 1,
        mean:      b.mean,
        median:    b.median,
        p95:       b.p95,
        p99:       b.p99,
        min:       b.min,
        max:       b.max,
        opsPerSec: b.opsPerSec,
        stddev:    b.stddev ?? 0,
      })),
    })),
  };
}
