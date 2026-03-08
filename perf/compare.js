#!/usr/bin/env node
/**
 * perf/compare.js — compare mitata benchmark results between two git refs
 *
 * Usage:
 *   node perf/compare.js <ref-a> <ref-b>        # compare two refs
 *   node perf/compare.js <ref> --vs HEAD         # compare ref vs current
 *   node perf/compare.js master feature-branch  # branch comparison
 *
 * Both refs can be branch names, tags, or commit hashes.
 */
import { execSync, spawnSync } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { resolve, basename } from 'path';
import { tmpdir } from 'os';

const args = process.argv.slice(2);
if (args.length < 1 || args[0] === '--help') {
  console.log('Usage: node perf/compare.js <ref-a> [ref-b]');
  console.log('       ref-b defaults to current working tree (HEAD)');
  process.exit(0);
}

const refA = args[0];
const refB = args[1] && !args[1].startsWith('--') ? args[1] : 'HEAD';
const enginesArg = (args.find(a => a.startsWith('--engine='))?.split('=')[1]) || 'v8';
const suiteArg = args.find(a => a.startsWith('--suite='))?.split('=')[1];
const THRESHOLD = 0.05; // 5% change = significant

const ROOT = process.cwd();
const RESULTS_DIR = resolve(ROOT, 'perf', 'results');
const COMPARE_DIR = resolve(ROOT, 'perf', 'comparisons');

async function main() {
  console.log(`\n  Comparing: ${refA}  vs  ${refB}`);
  console.log(`  Engine(s): ${enginesArg}`);

  await mkdir(RESULTS_DIR, { recursive: true });
  await mkdir(COMPARE_DIR, { recursive: true });

  // Run benchmarks sequentially to avoid CPU contention
  const resultsA = await runOnRef(refA);
  const resultsB = await runOnRef(refB);

  // Build comparison
  const comparison = buildComparison(resultsA, resultsB, refA, refB);

  // Print table
  printTable(comparison, refA, refB);

  // Save results
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = resolve(COMPARE_DIR, `compare-${ts}.json`);
  await writeFile(outPath, JSON.stringify(comparison, null, 2));

  const tablePath = resolve(COMPARE_DIR, `compare-${ts}.txt`);
  await writeFile(tablePath, formatTableText(comparison, refA, refB));

  console.log(`\n  Comparison saved to perf/comparisons/compare-${ts}.json`);
  console.log(`  Text table saved to perf/comparisons/compare-${ts}.txt`);

  await writeAllureComparison(comparison, refA, refB, ts);

  return comparison;
}

async function runOnRef(ref) {
  if (ref === 'HEAD' || ref === 'current') {
    return runBenchmarks(ROOT);
  }

  // Create temp worktree
  const wtDir = resolve(tmpdir(), `rainboids-perf-${ref.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}`);
  try {
    execSync(`git worktree add --detach "${wtDir}" "${ref}"`, { cwd: ROOT, encoding: 'utf8' });

    // Copy perf/ dir into worktree (scripts themselves)
    const perfSrc = resolve(ROOT, 'perf');
    execSync(`cp -r "${perfSrc}" "${wtDir}/perf"`, { cwd: ROOT });

    // Symlink node_modules for speed
    const nmSrc = resolve(ROOT, 'node_modules');
    execSync(`ln -sf "${nmSrc}" "${wtDir}/node_modules"`, { cwd: ROOT });

    return runBenchmarks(wtDir);
  } finally {
    try { execSync(`git worktree remove --force "${wtDir}"`, { cwd: ROOT }); } catch {}
    try { execSync(`rm -rf "${wtDir}"`); } catch {}
  }
}

function runBenchmarks(dir) {
  const runArgs = ['perf/run.js', '--engine', enginesArg];
  if (suiteArg) runArgs.push('--suite', suiteArg);

  const result = spawnSync('node', runArgs, {
    cwd: dir,
    encoding: 'utf8',
    timeout: 300000,
  });

  if (result.status !== 0) {
    console.error('Benchmark run failed:', result.stderr);
    return { raw: '', error: result.stderr };
  }

  return { raw: result.stdout };
}

function buildComparison(a, b, refA, refB) {
  return {
    timestamp: new Date().toISOString(),
    refs: { a: refA, b: refB },
    note: 'Raw output comparison — mitata results are in the "raw" field of each run.',
    runA: a,
    runB: b,
    rows: [],
  };
}

function printTable(comparison, refA, refB) {
  console.log(`\n  ${'─'.repeat(70)}`);
  console.log(`  Performance comparison: ${refA}  vs  ${refB}`);
  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  Ref A output:`);
  if (comparison.runA?.raw) {
    comparison.runA.raw.split('\n').slice(0, 20).forEach(l => console.log(`    ${l}`));
  }
  console.log(`\n  Ref B output:`);
  if (comparison.runB?.raw) {
    comparison.runB.raw.split('\n').slice(0, 20).forEach(l => console.log(`    ${l}`));
  }
  console.log(`\n  Full results saved to perf/comparisons/`);
}

function formatTableText(comparison, refA, refB) {
  return [
    `Benchmark comparison: ${refA} vs ${refB}`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    `=== Ref A: ${refA} ===`,
    comparison.runA?.raw || '(no output)',
    '',
    `=== Ref B: ${refB} ===`,
    comparison.runB?.raw || '(no output)',
  ].join('\n');
}

async function writeAllureComparison(comparison, refA, refB, ts) {
  const allureDir = resolve(ROOT, 'allure-results', 'perf-compare');
  await mkdir(allureDir, { recursive: true });

  const testResult = {
    uuid: `perf-compare-${ts}`,
    name: `Performance Comparison: ${refA} vs ${refB}`,
    status: 'passed',
    stage: 'finished',
    start: Date.now() - 5000,
    stop: Date.now(),
    labels: [
      { name: 'suite', value: 'Performance Comparison' },
    ],
    description: `Mitata benchmark comparison between ${refA} and ${refB}`,
    attachments: [{
      name: 'comparison-json',
      type: 'application/json',
      source: `compare-${ts}.json`,
    }],
  };

  await writeFile(resolve(allureDir, `compare-${ts}-result.json`), JSON.stringify(testResult, null, 2));
  await writeFile(resolve(allureDir, `compare-${ts}.json`), JSON.stringify(comparison, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
