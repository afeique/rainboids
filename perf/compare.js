#!/usr/bin/env node
/**
 * perf/compare.js — compare mitata benchmark results between two git refs
 *
 * Usage:
 *   node perf/compare.js <ref-a> <ref-b>        # compare two refs
 *   node perf/compare.js <ref>                  # compare ref vs current working tree
 *   node perf/compare.js master feature-branch  # branch comparison
 *
 * Both refs can be branch names, tags, or commit hashes.
 * ref-b defaults to current working tree if omitted.
 *
 * Output: a Δ% table showing improvement/regression per benchmark, e.g.:
 *
 *   Benchmark                                   ref-a         ref-b        Δ%
 *   ─────────────────────────────────────────────────────────────────────────
 *   [pool] 10 objects                          543.2 ns      421.1 ns   -22.4% ✓
 *   [pool] 100 objects                          1.23 µs       1.31 µs    +6.5% ✗
 */
import { execSync, spawnSync } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { tmpdir } from 'os';

const args = process.argv.slice(2);
if (args.length < 1 || args[0] === '--help') {
  console.log('Usage: node perf/compare.js <ref-a> [ref-b]');
  console.log('       ref-b defaults to current working tree (HEAD)');
  process.exit(0);
}

const refA = args[0];
const refB = args[1] && !args[1].startsWith('--') ? args[1] : 'HEAD';
const enginesArg      = (args.find(a => a.startsWith('--engine='))?.split('=')[1])    || 'v8';
const suiteArg        = args.find(a => a.startsWith('--suite='))?.split('=')[1];
const thresholdArg    = args.find(a => a.startsWith('--threshold='))?.split('=')[1];
const failOnRegress   = args.includes('--fail-on-regression');

// Δ% threshold: changes within ±THRESHOLD are marked neutral (default 15% — microbench noise floor)
const THRESHOLD = thresholdArg ? parseFloat(thresholdArg) / 100 : 0.15;

const ROOT        = process.cwd();
const COMPARE_DIR = resolve(ROOT, 'perf', 'comparisons');

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.error(`\n  Comparing: ${refA}  vs  ${refB}`);
  console.error(`  Engine(s): ${enginesArg}`);
  console.error('  Running ref-a benchmarks…');

  await mkdir(COMPARE_DIR, { recursive: true });

  // Run both refs sequentially (avoid CPU contention)
  const dataA = await runOnRef(refA);
  console.error('  Running ref-b benchmarks…');
  const dataB = await runOnRef(refB);

  // Flatten both result sets into name→avg_ns maps
  const mapA = extractBenchmarks(dataA);
  const mapB = extractBenchmarks(dataB);

  // Build comparison rows
  const rows = buildRows(mapA, mapB, refA, refB);

  // Print the table
  printTable(rows, refA, refB);

  // Save artefacts
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const comparison = { timestamp: new Date().toISOString(), refs: { a: refA, b: refB }, rows };

  const jsonPath  = resolve(COMPARE_DIR, `compare-${ts}.json`);
  const tablePath = resolve(COMPARE_DIR, `compare-${ts}.txt`);

  await writeFile(jsonPath, JSON.stringify(comparison, null, 2));
  await writeFile(tablePath, formatTableText(rows, refA, refB));
  await writeAllureComparison(comparison, refA, refB, ts);

  console.error(`\n  Saved: perf/comparisons/compare-${ts}.json`);
  console.error(`         perf/comparisons/compare-${ts}.txt`);

  // Optionally exit non-zero when regressions exceed threshold (useful in CI)
  const regressions = rows.filter(r => r.delta !== null && r.delta > THRESHOLD);
  if (failOnRegress && regressions.length > 0) {
    console.error(`\n  ${regressions.length} regression(s) exceed ${(THRESHOLD * 100).toFixed(0)}% threshold. Use --fail-on-regression to suppress this exit.`);
    process.exit(1);
  }
}

// ─── Run benchmarks on a given git ref ───────────────────────────────────────

async function runOnRef(ref) {
  if (ref === 'HEAD' || ref === 'current') {
    return runBenchmarks(ROOT);
  }

  const wtDir = resolve(tmpdir(), `rainboids-perf-${ref.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}`);
  try {
    execSync(`git worktree add --detach "${wtDir}" "${ref}"`, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });

    // Copy perf/ scripts and symlink node_modules
    execSync(`cp -r "${resolve(ROOT, 'perf')}" "${wtDir}/perf"`, { cwd: ROOT });
    execSync(`ln -sf "${resolve(ROOT, 'node_modules')}" "${wtDir}/node_modules"`, { cwd: ROOT });

    return runBenchmarks(wtDir);
  } finally {
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: ROOT, stdio: 'pipe' }); } catch {}
    try { execSync(`rm -rf "${wtDir}"`, { stdio: 'pipe' }); } catch {}
  }
}

function runBenchmarks(dir) {
  const runArgs = ['perf/run.js', '--json', '--engine', enginesArg];
  if (suiteArg) runArgs.push('--suite', suiteArg);

  const result = spawnSync('node', runArgs, {
    cwd: dir,
    encoding: 'utf8',
    timeout: 300_000,
  });

  if (result.status !== 0) {
    console.error('  Benchmark run failed:\n', result.stderr?.slice(0, 500));
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    console.error('  Failed to parse benchmark JSON output.');
    return null;
  }
}

// ─── Parse mitata JSON into a flat name → avg_ns map ─────────────────────────
// mitata v1.x JSON structure (from run({ format: 'json' })):
//   { benchmarks: [{ alias, group, runs: [{ name, stats: { avg } }] }] }
// run.js wraps this as:
//   { engines: { v8: { pool: { benchmarks: [...] }, math: { benchmarks: [...] } } } }

function extractBenchmarks(data) {
  const map = new Map(); // key: "[suite] group > name" → avg_ns
  if (!data?.engines) return map;

  for (const [, suites] of Object.entries(data.engines)) {
    for (const [suiteName, suiteData] of Object.entries(suites)) {
      if (!Array.isArray(suiteData?.benchmarks)) continue;

      // Build layout index → group name map
      const layout = suiteData.layout ?? [];
      const layoutNames = {};
      for (let i = 0; i < layout.length; i++) {
        if (layout[i]?.name) layoutNames[i] = layout[i].name;
      }

      for (const trial of suiteData.benchmarks) {
        if (!Array.isArray(trial?.runs)) continue;
        // Resolve group index to human name; fall back to alias if no group
        const groupName = trial.group != null ? (layoutNames[trial.group] ?? trial.group) : null;
        const groupPrefix = groupName ? `${groupName} > ` : '';
        for (const run of trial.runs) {
          if (!run?.stats?.avg) continue;
          const key = `[${suiteName}] ${groupPrefix}${run.name}`;
          map.set(key, run.stats.avg); // avg in ns/iter
        }
      }
    }
  }
  return map;
}

// ─── Build comparison rows ────────────────────────────────────────────────────

function buildRows(mapA, mapB, refA, refB) {
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  const rows = [];

  for (const key of allKeys) {
    const a = mapA.get(key) ?? null;
    const b = mapB.get(key) ?? null;
    const delta = (a !== null && b !== null) ? (b - a) / a : null; // positive = regression

    rows.push({ name: key, a, b, delta });
  }

  // Sort: regressions first, then improvements, then missing
  rows.sort((x, y) => {
    if (x.delta === null && y.delta !== null) return 1;
    if (x.delta !== null && y.delta === null) return -1;
    return (y.delta ?? 0) - (x.delta ?? 0);
  });

  return rows;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtNs(ns) {
  if (ns === null) return '        —';
  if (ns >= 1e9)  return `${(ns / 1e9).toFixed(3)} s  `;
  if (ns >= 1e6)  return `${(ns / 1e6).toFixed(3)} ms `;
  if (ns >= 1e3)  return `${(ns / 1e3).toFixed(2)} µs `;
  return `${ns.toFixed(2)} ns `;
}

function fmtDelta(delta) {
  if (delta === null) return '     N/A';
  const pct = (delta * 100).toFixed(1);
  const sign = delta >= 0 ? '+' : '';
  const icon = delta > THRESHOLD ? '✗' : delta < -THRESHOLD ? '✓' : '~';
  return `${sign}${pct}%  ${icon}`;
}

function printTable(rows, refA, refB) {
  const nameW  = Math.min(55, Math.max(30, ...rows.map(r => r.name.length)) + 2);
  const valW   = 12;
  const header = `${'Benchmark'.padEnd(nameW)}  ${'ref-a (' + refA + ')'.padStart(valW)}  ${'ref-b (' + refB + ')'.padStart(valW)}     Δ%`;
  const sep    = '─'.repeat(header.length);

  console.log(`\n  ${header}`);
  console.log(`  ${sep}`);

  for (const row of rows) {
    const name  = row.name.length > nameW ? row.name.slice(0, nameW - 1) + '…' : row.name.padEnd(nameW);
    const valA  = fmtNs(row.a).padStart(valW);
    const valB  = fmtNs(row.b).padStart(valW);
    const delta = fmtDelta(row.delta).padStart(10);
    console.log(`  ${name}  ${valA}  ${valB}  ${delta}`);
  }

  console.log(`  ${sep}`);

  const improved  = rows.filter(r => r.delta !== null && r.delta < -THRESHOLD).length;
  const regressed = rows.filter(r => r.delta !== null && r.delta >  THRESHOLD).length;
  const neutral   = rows.filter(r => r.delta !== null && Math.abs(r.delta) <= THRESHOLD).length;
  console.log(`\n  Summary: ${improved} improved ✓  ${neutral} neutral ~  ${regressed} regressed ✗`);
}

function formatTableText(rows, refA, refB) {
  const lines = [`Benchmark comparison: ${refA} vs ${refB}`, `Timestamp: ${new Date().toISOString()}`, ''];
  lines.push(`${'Benchmark'.padEnd(55)}  ${'ref-a'.padStart(12)}  ${'ref-b'.padStart(12)}     Δ%`);
  lines.push('─'.repeat(100));
  for (const row of rows) {
    lines.push(
      `${row.name.padEnd(55)}  ${fmtNs(row.a).padStart(12)}  ${fmtNs(row.b).padStart(12)}  ${fmtDelta(row.delta).padStart(9)}`
    );
  }
  return lines.join('\n');
}

// ─── Allure output ────────────────────────────────────────────────────────────

async function writeAllureComparison(comparison, refA, refB, ts) {
  const allureDir = resolve(ROOT, 'allure-results', 'perf-compare');
  await mkdir(allureDir, { recursive: true });

  const improved  = comparison.rows.filter(r => r.delta !== null && r.delta < -THRESHOLD).length;
  const regressed = comparison.rows.filter(r => r.delta !== null && r.delta >  THRESHOLD).length;
  const status    = regressed > 0 ? 'failed' : 'passed';

  const testResult = {
    uuid: `perf-compare-${ts}`,
    historyId: `perf-compare-${refA}-vs-${refB}`,
    name: `Performance Comparison: ${refA} vs ${refB}`,
    status,
    stage: 'finished',
    start: Date.now() - 5000,
    stop: Date.now(),
    labels: [
      { name: 'suite', value: 'Performance Comparison' },
      { name: 'feature', value: `${refA} vs ${refB}` },
    ],
    description:
      `Compared ${comparison.rows.length} benchmarks.\n` +
      `Improved: ${improved}  Regressed: ${regressed}\n\n` +
      formatTableText(comparison.rows, refA, refB),
    attachments: [{
      name: 'comparison-json',
      type: 'application/json',
      source: `compare-${ts}.json`,
    }],
  };

  await writeFile(resolve(allureDir, `compare-${ts}-result.json`), JSON.stringify(testResult, null, 2));
  await writeFile(resolve(allureDir, `compare-${ts}.json`),         JSON.stringify(comparison,  null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
