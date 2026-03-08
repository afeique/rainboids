#!/usr/bin/env node
/**
 * Rainboids benchmark comparison tool
 *
 * Compares the current working tree against a specific git commit or branch.
 * Uses `git worktree` to checkout the target without touching your working tree.
 *
 * Usage:
 *   node benchmark/compare.js <target>
 *   node benchmark/compare.js <target> --suite pool
 *   node benchmark/compare.js <target> --suite pool,collision
 *   node benchmark/compare.js <target> --runs 5
 *   node benchmark/compare.js <commit1> <commit2>   # compare two specific commits
 *
 * <target> can be:
 *   - A commit hash  (e.g. abc1234)
 *   - A branch name  (e.g. master, opt)
 *   - A tag          (e.g. v1.0.0)
 *   - HEAD~N         (e.g. HEAD~5)
 *
 * --runs N  runs each benchmark suite N times on both sides and averages the
 *           results before comparing. Produces more stable Δ values. Adds a
 *           ±σ (between-run stddev) column so you can see measurement noise.
 *
 * Examples:
 *   node benchmark/compare.js master
 *   node benchmark/compare.js HEAD~10 --runs 5
 *   node benchmark/compare.js abc1234 --suite collision --runs 3
 *   node benchmark/compare.js abc1234 def5678
 *   node benchmark/compare.js abc1234 def5678 --runs 5
 */

import { execSync, spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync,
         readdirSync, statSync, copyFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { printComparison } from './lib/bench.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const repoRoot   = resolve(__dirname, '..');
const resultsDir = join(repoRoot, 'benchmark', 'results');

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------
const ANSI = {
  reset:  '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green:  '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const c = (code, t) => `${code}${t}${ANSI.reset}`;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const rawArgs = process.argv.slice(2);

function getOption(name) {
  const i = rawArgs.indexOf(name);
  return i !== -1 ? rawArgs[i + 1] : null;
}
function getFlag(name)   { return rawArgs.includes(name); }

const suiteFilter = getOption('--suite');
const runsOption  = getOption('--runs');
const noCleanup   = getFlag('--no-cleanup');   // keep worktree on failure (debugging)

// Positional args (not flags or flag values)
const positional = rawArgs.filter((a, i) => {
  if (a.startsWith('--')) return false;
  if (i > 0 && rawArgs[i - 1].startsWith('--')) return false;
  return true;
});

if (positional.length === 0) {
  console.error(`
${c(ANSI.bold, 'Usage:')}
  node benchmark/compare.js <target> [--suite <suite,...>] [--runs N]
  node benchmark/compare.js <commit1> <commit2> [--suite <suite,...>] [--runs N]

${c(ANSI.dim, '<target> can be a commit hash, branch name, tag, or HEAD~N')}
${c(ANSI.dim, '--runs N  run each suite N times and average (shows ±σ stddev)')}

${c(ANSI.dim, 'Examples:')}
  node benchmark/compare.js master
  node benchmark/compare.js master --runs 5
  node benchmark/compare.js HEAD~10 --suite collision --runs 3
  node benchmark/compare.js abc1234 def5678
  node benchmark/compare.js abc1234 def5678 --runs 5
`);
  process.exit(1);
}

const twoCommitMode = positional.length >= 2;

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function gitHash(ref) {
  try {
    return execSync(`git rev-parse --short ${ref}`, { cwd: repoRoot }).toString().trim();
  } catch {
    console.error(`${c(ANSI.red, 'Error:')} "${ref}" is not a valid git ref.`);
    process.exit(1);
  }
}

function gitFullHash(ref) {
  return execSync(`git rev-parse ${ref}`, { cwd: repoRoot }).toString().trim();
}

function hasUncommittedChanges() {
  const out = execSync('git status --porcelain', { cwd: repoRoot }).toString();
  return out.trim().length > 0;
}

function currentBranchOrHash() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot }).toString().trim();
    if (branch !== 'HEAD') return branch;
  } catch {}
  return gitHash('HEAD');
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

function runBenchmarks(cwd, label, outputFile) {
  const suiteArg = suiteFilter ? ['--suite', suiteFilter] : [];
  const runsArg  = runsOption  ? ['--runs',  runsOption]  : [];
  const nodeArgs = [
    join(cwd, 'benchmark', 'run.js'),
    '--output', outputFile,
    '--quiet',
    ...suiteArg,
    ...runsArg,
  ];

  const runsLabel = runsOption ? c(ANSI.dim, ` ×${runsOption}`) : '';
  console.log(`  ${c(ANSI.dim, '→')} Running benchmarks for ${c(ANSI.cyan, label)}${runsLabel}...`);

  const result = spawnSync(process.execPath, nodeArgs, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 5 * 60 * 1000, // 5 minute timeout
  });

  if (result.status !== 0) {
    console.error(`\n${c(ANSI.red, 'Benchmark failed')} for ${label}:`);
    if (result.stdout) console.error(result.stdout);
    if (result.stderr) console.error(result.stderr);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Worktree management
// ---------------------------------------------------------------------------

function addWorktree(ref, path) {
  const fullHash = gitFullHash(ref);
  execSync(`git worktree add --detach "${path}" ${fullHash}`, {
    cwd: repoRoot,
    stdio: 'pipe',
  });
}

function removeWorktree(path) {
  try {
    execSync(`git worktree remove --force "${path}"`, { cwd: repoRoot, stdio: 'pipe' });
  } catch {
    // fallback: manual remove
    try { rmSync(path, { recursive: true, force: true }); } catch {}
    try { execSync(`git worktree prune`, { cwd: repoRoot, stdio: 'pipe' }); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Summary statistics
// ---------------------------------------------------------------------------

function summarize(currentSuites, targetSuites, targetLabel) {
  const targetMap = new Map();
  for (const s of targetSuites) {
    for (const b of s.benchmarks) targetMap.set(`${s.suite}::${b.name}`, b);
  }

  let improved = 0, regressed = 0, unchanged = 0;
  const threshold = 2; // % to count as meaningful change

  for (const s of currentSuites) {
    for (const b of s.benchmarks) {
      const t = targetMap.get(`${s.suite}::${b.name}`);
      if (!t) continue;
      const pct = ((t.mean - b.mean) / t.mean) * 100;
      if      (pct >  threshold) improved++;
      else if (pct < -threshold) regressed++;
      else                       unchanged++;
    }
  }

  const total = improved + regressed + unchanged;
  console.log();
  console.log(c(ANSI.bold, `  Summary vs ${targetLabel}:`));
  console.log(`  ${c(ANSI.green, `${improved} improved`)}  ${c(ANSI.red, `${regressed} regressed`)}  ${c(ANSI.gray, `${unchanged} unchanged`)}  of ${total} benchmarks`);

  if (regressed > 0) {
    console.log(`\n  ${c(ANSI.yellow, '⚠')}  Performance regressions detected.`);
  } else if (improved > 0) {
    console.log(`\n  ${c(ANSI.green, '✓')}  All changes are improvements or neutral.`);
  } else {
    console.log(`\n  ${c(ANSI.gray, '~')}  No significant changes detected.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(resultsDir, { recursive: true });

  const timestamp = Date.now();

  if (twoCommitMode) {
    // ── Mode: compare two specific commits ───────────────────────────────
    const ref1 = positional[0];
    const ref2 = positional[1];
    const hash1 = gitHash(ref1);
    const hash2 = gitHash(ref2);

    const runsLabel = runsOption ? c(ANSI.dim, `  (${runsOption} runs, averaged)`) : '';
    console.log(`\n${c(ANSI.bold, 'Rainboids Benchmark Comparison')}${runsLabel}`);
    console.log(`  ${c(ANSI.cyan, hash1)}  vs  ${c(ANSI.cyan, hash2)}`);
    console.log();

    const wt1  = join(repoRoot, '.bench-worktree-1');
    const wt2  = join(repoRoot, '.bench-worktree-2');
    const out1 = join(resultsDir, `${timestamp}-${hash1}.json`);
    const out2 = join(resultsDir, `${timestamp}-${hash2}.json`);

    let ok = true;

    try {
      console.log(`  ${c(ANSI.dim, 'Checking out')} ${hash1}...`);
      addWorktree(ref1, wt1);

      console.log(`  ${c(ANSI.dim, 'Checking out')} ${hash2}...`);
      addWorktree(ref2, wt2);

      // Copy benchmark suite into both worktrees
      for (const [wt, hash] of [[wt1, hash1], [wt2, hash2]]) {
        syncBenchmarkDir(wt);
      }

      ok = runBenchmarks(wt1, hash1, out1) && runBenchmarks(wt2, hash2, out2);
    } finally {
      if (!noCleanup || ok) {
        removeWorktree(wt1);
        removeWorktree(wt2);
      }
    }

    if (!ok) process.exit(1);

    const data1 = JSON.parse(readFileSync(out1, 'utf8'));
    const data2 = JSON.parse(readFileSync(out2, 'utf8'));

    console.log(`\n${c(ANSI.bold, `Results  (${hash1} = "current",  ${hash2} = "target")`)}\n`);
    printComparison(data1.suites, data2.suites, hash2);
    summarize(data1.suites, data2.suites, hash2);

  } else {
    // ── Mode: compare current working tree vs target ref ─────────────────
    const targetRef  = positional[0];
    const targetHash = gitHash(targetRef);
    const currentLabel = currentBranchOrHash();

    const runsLabel = runsOption ? c(ANSI.dim, `  (${runsOption} runs, averaged)`) : '';
    console.log(`\n${c(ANSI.bold, 'Rainboids Benchmark Comparison')}${runsLabel}`);
    console.log(`  current (${c(ANSI.cyan, currentLabel)})  vs  target (${c(ANSI.cyan, targetHash)})`);

    const uncommitted = hasUncommittedChanges();
    if (uncommitted) {
      console.log(`  ${c(ANSI.yellow, '⚠')}  You have uncommitted changes — current results include them.`);
    }
    console.log();

    const wtTarget  = join(repoRoot, `.bench-worktree-${targetHash}`);
    const outCurrent = join(resultsDir, `${timestamp}-current.json`);
    const outTarget  = join(resultsDir, `${timestamp}-${targetHash}.json`);

    // ── Step 1: Run current working tree ───────────────────────────────
    let ok = runBenchmarks(repoRoot, currentLabel, outCurrent);
    if (!ok) process.exit(1);

    // ── Step 2: Checkout target into worktree ─────────────────────────
    let wtCreated = false;
    try {
      console.log(`  ${c(ANSI.dim, 'Checking out')} ${targetHash}...`);
      addWorktree(targetRef, wtTarget);
      wtCreated = true;

      // Copy the current benchmark suite into the target worktree so we
      // benchmark with the same measurement code but the old game source.
      syncBenchmarkDir(wtTarget);

      ok = runBenchmarks(wtTarget, targetHash, outTarget);
    } finally {
      if (wtCreated && (!noCleanup || ok)) {
        removeWorktree(wtTarget);
      }
    }

    if (!ok) process.exit(1);

    const current = JSON.parse(readFileSync(outCurrent, 'utf8'));
    const target  = JSON.parse(readFileSync(outTarget,  'utf8'));

    console.log(`\n${c(ANSI.bold, 'Results')}\n`);
    printComparison(current.suites, target.suites, targetHash);
    summarize(current.suites, target.suites, targetHash);
    console.log();
    console.log(`  ${c(ANSI.gray, `Results saved to benchmark/results/`)}`);
  }

  console.log();
}

/**
 * Copy the current benchmark/ directory into a worktree, overwriting any
 * stale version that might exist there from a prior run.
 */
function syncBenchmarkDir(worktreePath) {
  const src = join(repoRoot, 'benchmark');
  const dst = join(worktreePath, 'benchmark');

  // Use rsync if available, fall back to cp
  const rsync = spawnSync('rsync', ['-a', '--delete', src + '/', dst + '/'], { stdio: 'pipe' });
  if (rsync.status !== 0) {
    // rsync not available – use Node fs API
    copyDirSync(src, dst);
  }
}

function copyDirSync(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) {
      copyDirSync(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
