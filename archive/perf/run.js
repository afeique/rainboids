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

// Progress always writes to stderr so it shows through even when stdout is
// captured (e.g. when compare.js spawns run.js with --quiet + --output).
function clearLine() {
  process.stderr.write('\r\x1b[2K');
}

/**
 * Render a progress bar for a multi-run suite.
 *
 * @param {string} suiteKey      - suite name
 * @param {number} suiteIdx      - 1-based index of this suite (for multi-suite display)
 * @param {number} totalSuites   - total number of suites being run
 * @param {number} currentRun    - 1-based run currently executing
 * @param {number} totalRuns     - total runs requested
 */
function showProgress(suiteKey, suiteIdx, totalSuites, currentRun, totalRuns) {
  // Bar and percentage fill based on *completed* runs so progress grows as work finishes.
  // currentRun may be passed as totalRuns + 1 as a "done" sentinel — clamp for display.
  const displayRun = Math.min(currentRun, totalRuns);
  const completed  = currentRun - 1;
  const pct        = Math.min(100, Math.floor(completed / totalRuns * 100));

  // Right-align the run counter so digits don't shift as numbers grow (e.g. "  1/100" → " 99/100").
  const digits = String(totalRuns).length;
  const runStr = `run ${String(displayRun).padStart(digits)}/${totalRuns}`;
  const pctStr = `${String(pct).padStart(3)}%`;
  const bar    = progressBar(completed, totalRuns, 30);

  // When running multiple suites, prefix with "[N/M]" so the user knows overall progress.
  const suiteTag = totalSuites > 1
    ? `${c(ANSI.gray, `[${suiteIdx}/${totalSuites}]`)} ${c(ANSI.cyan, suiteKey)}`
    : c(ANSI.cyan, suiteKey);

  // \x1b[K erases to end of line — prevents ghost characters if a previous line was longer.
  process.stderr.write(`\r  ${suiteTag}  ${runStr}  ${bar}  ${pctStr}\x1b[K`);
}

function progressBar(completed, total, width) {
  const filled = total > 0 ? Math.round((completed / total) * width) : width;
  const empty  = width - filled;
  return c(ANSI.green, '█'.repeat(filled)) +
         c(ANSI.gray,  '░'.repeat(empty));
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

  const results     = [];
  const totalSuites = suitesToRun.length;

  for (let si = 0; si < totalSuites; si++) {
    const entry = suitesToRun[si];
    const mod   = await import(entry.file);

    if (runs === 1) {
      process.stderr.write(`\r  ${c(ANSI.cyan, entry.key)}  measuring...\x1b[K`);
      const result = mod.runSuite();
      clearLine();
      results.push(result);
      if (!quiet) printSuite(result);
    } else {
      // ── Multi-run: collect N runs then aggregate ──────────────────────
      const suiteRuns = [];

      for (let r = 1; r <= runs; r++) {
        showProgress(entry.key, si + 1, totalSuites, r, runs);
        suiteRuns.push(mod.runSuite());
      }

      // Show the completed (100%) state momentarily before printing the table.
      showProgress(entry.key, si + 1, totalSuites, runs + 1, runs);
      clearLine();

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
