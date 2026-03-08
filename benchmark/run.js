#!/usr/bin/env node
/**
 * Rainboids benchmark runner
 *
 * Usage:
 *   node benchmark/run.js                           # run all suites once
 *   node benchmark/run.js --runs 5                  # run all suites 5 times and average
 *   node benchmark/run.js --suite pool              # run one suite
 *   node benchmark/run.js --suite pool,collision    # run multiple suites
 *   node benchmark/run.js --suite pool --runs 3     # run pool suite 3 times
 *   node benchmark/run.js --json                    # output raw JSON
 *   node benchmark/run.js --output results/x.json   # save JSON to file
 *   node benchmark/run.js --quiet                   # no console output (use with --output)
 *
 * The --output path is relative to the repo root (not benchmark/).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { printSuite, toJSON, aggregateRuns, ANSI, c } from './lib/bench.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot  = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getFlag(name)   { return args.includes(name); }
function getOption(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const wantJson   = getFlag('--json');
const outputPath = getOption('--output');
const quiet      = getFlag('--quiet') || (!!outputPath && !wantJson);
const suiteArg   = getOption('--suite');
const wantSuites = suiteArg ? new Set(suiteArg.split(',').map(s => s.toLowerCase().trim())) : null;
const runs       = Math.max(1, parseInt(getOption('--runs') || '1', 10));

// ---------------------------------------------------------------------------
// Suite registry
// ---------------------------------------------------------------------------
const ALL_SUITES = [
  { key: 'pool',      file: './suites/pool.bench.js' },
  { key: 'collision', file: './suites/collision.bench.js' },
  { key: 'noise',     file: './suites/noise.bench.js' },
  { key: 'wave',      file: './suites/wave.bench.js' },
  { key: 'math',      file: './suites/math.bench.js' },
];

// ---------------------------------------------------------------------------
// Progress display
// ---------------------------------------------------------------------------

function clearLine() {
  process.stdout.write('\r\x1b[2K');
}

function showProgress(suiteKey, run, totalRuns) {
  const bar    = progressBar(run, totalRuns, 16);
  const label  = `  ${c(ANSI.cyan, suiteKey.padEnd(12))}  run ${run}/${totalRuns}  ${bar}`;
  process.stdout.write(`\r${label}`);
}

function progressBar(current, total, width) {
  const filled = Math.round((current / total) * width);
  const empty  = width - filled;
  return c(ANSI.green,  '█'.repeat(filled)) +
         c(ANSI.gray,   '░'.repeat(empty));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const suitesToRun = wantSuites
    ? ALL_SUITES.filter(s => wantSuites.has(s.key))
    : ALL_SUITES;

  if (suitesToRun.length === 0) {
    console.error(`Unknown suite(s): ${suiteArg}`);
    console.error(`Available: ${ALL_SUITES.map(s => s.key).join(', ')}`);
    process.exit(1);
  }

  if (!quiet) {
    const suiteLabel = suitesToRun.map(s => s.key).join(', ');
    const runLabel   = runs > 1 ? `  ×${runs} runs` : '';
    console.log(`\nRainboids Benchmark  –  ${suiteLabel}${runLabel}`);
    console.log(`Node ${process.version}   ${new Date().toISOString()}`);
  }

  const results = [];

  for (const entry of suitesToRun) {
    const mod = await import(entry.file);

    if (runs === 1) {
      if (!quiet) process.stdout.write(`\n  ${c(ANSI.cyan, entry.key)}  measuring...\r`);
      const result = mod.runSuite();
      if (!quiet) clearLine();
      results.push(result);
      if (!quiet) printSuite(result);
    } else {
      // ── Multi-run: collect N runs then aggregate ──────────────────────
      const suiteRuns = [];

      for (let r = 1; r <= runs; r++) {
        if (!quiet) showProgress(entry.key, r, runs);
        suiteRuns.push(mod.runSuite());
      }

      if (!quiet) clearLine();

      const aggregated = aggregateRuns(suiteRuns);
      results.push(aggregated);
      if (!quiet) printSuite(aggregated);
    }
  }

  if (!quiet) console.log();

  // ── JSON output ───────────────────────────────────────────────────────────
  if (wantJson || outputPath) {
    const gitHash = await getGitHash();
    const json    = toJSON(results, { gitHash, runs, cwd: process.cwd() });
    const jsonStr = JSON.stringify(json, null, 2);

    if (wantJson) {
      process.stdout.write(jsonStr + '\n');
    }

    if (outputPath) {
      const absPath = resolve(repoRoot, outputPath);
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, jsonStr, 'utf8');
      if (!quiet) console.log(`Results saved → ${absPath}`);
    }
  }
}

async function getGitHash() {
  try {
    const { execSync } = await import('child_process');
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
  } catch {
    return 'unknown';
  }
}

main().catch(err => { console.error(err); process.exit(1); });
