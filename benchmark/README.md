# Rainboids Benchmark Suite

A comprehensive Node.js micro-benchmark suite for measuring and comparing the performance of Rainboids' core game logic across git commits and branches.

## Quick start

```bash
# Run all suites once
npm run bench

# Run a specific suite
npm run bench:pool
npm run bench:collision
npm run bench:noise
npm run bench:wave
npm run bench:math

# Run with averaging (always specify how many runs)
npm run bench -- --runs 5
npm run bench:collision -- --runs 3
```

## Suites

| Suite | Key | What it measures |
|-------|-----|-----------------|
| Pool Manager | `pool` | Object pool get/release cycles, swap-and-pop vs indexOf+splice, cleanupInactive, pool churn |
| Collision Detection | `collision` | `Math.hypot` vs `Math.sqrt` vs squared-distance, star swept collision, circle-polygon, O(n²) vs grid broad-phase |
| Noise & Star Generation | `noise` | Perlin2, FBM (3/4/5 octaves), Worley, `getStarDensity`, `generateStarPositions` at multiple star counts |
| Wave Data | `wave` | `getWaveConfig` (static/cached/procedural), level scaling, enemy firing cooldowns |
| Math Operations | `math` | hypot/sqrt/squared distance, atan2, sin/cos vs lookup table, wrap, friction, clamp patterns |

## Running

### Run all suites

```bash
npm run bench
# or
node benchmark/run.js
```

### Run one or more specific suites

```bash
node benchmark/run.js --suite pool
node benchmark/run.js --suite pool,collision
node benchmark/run.js --suite noise,math,wave
```

### Run multiple times and average

Pass `--runs N` to run every benchmark suite N times. Results are averaged across all runs, and each benchmark gains a `±σ` column showing the between-run standard deviation. A small σ relative to the mean indicates a stable measurement; a large σ warns that a single run may not be representative.

```bash
# Run everything 5 times and average
npm run bench -- --runs 5

# Average a specific suite
npm run bench:collision -- --runs 3

# Or call the script directly
node benchmark/run.js --runs 5
node benchmark/run.js --suite collision --runs 3
```

Example output with `--runs 3`:

```
Rainboids Benchmark  –  wave  ×3 runs

  Wave Data & Level Scaling  (3 runs, averaged)
  ────────────────────────────────────────────────────────────────────────────
  Benchmark                           ops/sec          mean      ±σ         p95       min
  ────────────────────────────────────────────────────────────────────────────
  getWaveConfig() – early wave        76.20 Mops/s   13.1 ns   ±5.5 ns   23.4 ns   6.7 ns
  getWaveConfig() – procedural        24.80 Mops/s   40.3 ns   ±25.2 ns  56.9 ns   10.5 ns
  getEnemyLevel() – 1000 lookups       3.33 Mops/s  300.3 ns   ±19.7 ns 297.9 ns  267.6 ns
  ────────────────────────────────────────────────────────────────────────────
```

### Save results to a JSON file

```bash
# Save to benchmark/results/latest.json
npm run bench:save

# Save an averaged snapshot
npm run bench:save -- --runs 5

# Save to a custom path (relative to repo root)
npm run bench -- --runs 5 --output benchmark/results/before-my-change.json
node benchmark/run.js --runs 5 --output benchmark/results/before-my-change.json
```

### Output raw JSON to stdout

```bash
node benchmark/run.js --json
node benchmark/run.js --json --suite collision --runs 3
```

### Suppress console output (useful with --output)

```bash
node benchmark/run.js --quiet --output benchmark/results/snapshot.json
```

## Comparing commits and branches

The compare script checks out the target ref in a temporary `git worktree` — it never touches your working tree, stash, or current branch.

### Compare current working tree vs another branch or commit

```bash
# vs a branch
node benchmark/compare.js master
npm run bench:compare master

# vs a specific commit hash
node benchmark/compare.js abc1234

# vs a relative ref
node benchmark/compare.js HEAD~10
node benchmark/compare.js HEAD~5

# vs a tag
node benchmark/compare.js v1.2.0
```

### Compare with multiple averaged runs

Pass `--runs N` to run both sides N times and average before comparing. This significantly reduces noise in the Δ column, especially for benchmarks with high variance. The `±σ` values shown for each side help you judge whether a reported difference is real or within measurement noise — a `~` marker is appended automatically when the Δ is smaller than the combined σ of both sides.

```bash
npm run bench:compare -- master --runs 5
npm run bench:compare -- HEAD~10 --runs 3
npm run bench:compare -- abc1234 --suite collision --runs 5

# Or call the script directly
node benchmark/compare.js master --runs 5
```

Example output with `--runs 3`:

```
Rainboids Benchmark Comparison  (3 runs, averaged)
  current (opt)  vs  target (abc1234)

  Wave Data & Level Scaling  (averaged)
  ───────────────────────────────────────────────────────────────────────────────────────────
  Benchmark                           current              abc1234              Δ
  ───────────────────────────────────────────────────────────────────────────────────────────
  getWaveConfig() – early wave        12.8 ns ±4.7 ns     13.1 ns ±2.0 ns     +2.2% ▲ ~
  getWaveConfig() – procedural        43.2 ns ±22.1 ns    109.9 ns ±19.4 ns   +60.7% ▲
  getEnemyLevel() – 1000 lookups      302.1 ns ±21.2 ns   312.7 ns ±33.8 ns   +3.4% ▲ ~
  ───────────────────────────────────────────────────────────────────────────────────────────

  Summary vs abc1234:
  6 improved  6 regressed  2 unchanged  of 14 benchmarks
```

**`~` marker** — appended when the measured Δ is smaller than the combined ±σ of both sides, meaning the difference may be measurement noise rather than a real regression or improvement. Use more runs to reduce σ and get a cleaner signal.

### Limit comparison to specific suites

```bash
node benchmark/compare.js master --suite collision
node benchmark/compare.js abc1234 --suite collision,math --runs 3
```

### Compare two specific commits against each other

```bash
npm run bench:compare -- abc1234 def5678
npm run bench:compare -- abc1234 def5678 --suite pool --runs 5
```

### Δ column legend

| Symbol | Meaning |
|--------|---------|
| `+N% ▲` | Current is faster than target by N% |
| `-N% ▼` | Current is slower than target by N% |
| (no symbol) | Change is less than ±2% — considered unchanged |
| `~` | Δ is within combined ±σ noise — treat with caution |

## Saving snapshots for later comparison

You can save a snapshot before making changes, then compare after:

```bash
# Before your change
npm run bench -- --runs 5 --output benchmark/results/before.json

# ... make your changes ...

# After your change
npm run bench -- --runs 5 --output benchmark/results/after.json
```

Result files are gitignored by default so they won't clutter commits.

## File structure

```
benchmark/
├── README.md
├── run.js                     # Main runner
├── compare.js                 # Git comparison tool
├── lib/
│   ├── bench.js               # measure(), suite(), aggregateRuns(), stats, formatting
│   └── browser-mock.js        # Shims window/document/navigator for Node.js
├── suites/
│   ├── pool.bench.js
│   ├── collision.bench.js
│   ├── noise.bench.js
│   ├── wave.bench.js
│   └── math.bench.js
└── results/                   # JSON result files (gitignored)
    └── .gitkeep
```

## How it works

**Measurement** — each benchmark runs a warmup phase (500 iterations by default) to let V8's JIT compile and optimize the hot path, then collects timing samples in batches of 100. Batch timing avoids `performance.now()` resolution noise. Stats reported: ops/sec, mean, ±σ (when multi-run), p95, min.

**Multi-run averaging** — when `--runs N` is used, each suite's `runSuite()` is called N times producing N independent result sets. These are merged by `aggregateRuns()`: per-stat averages (mean, median, p95, p99) are computed across all runs, min/max are taken as the global min/max, and the between-run standard deviation of the mean is stored as `stddev` (shown as `±σ`). A high σ relative to the mean means V8's optimizer is behaving inconsistently across runs — usually a sign to increase `--runs`.

**Browser mocking** — game source modules use browser APIs (`window`, `document`, etc.). `browser-mock.js` installs minimal shims before any game module is imported, so the pure logic runs in Node.js without modification.

**Commit comparison** — `compare.js` uses `git worktree add` to checkout the target ref into a temporary directory (`.bench-worktree-<hash>/`), copies the current benchmark suite into it (so the same measurement code runs against the old game source), runs both sets of benchmarks, then removes the worktree. Your working tree is never modified. `--runs N` is forwarded to both subprocess invocations.

## npm scripts reference

### Passing extra arguments

npm requires a `--` separator before any arguments that should be forwarded to the script rather than consumed by npm itself:

```bash
npm run bench -- --runs 5
npm run bench:compare -- master --runs 5
npm run bench:collision -- --runs 3
```

### Scripts

| Script | Equivalent |
|--------|------------|
| `npm run bench` | `node benchmark/run.js` |
| `npm run bench:pool` | `node benchmark/run.js --suite pool` |
| `npm run bench:collision` | `node benchmark/run.js --suite collision` |
| `npm run bench:noise` | `node benchmark/run.js --suite noise` |
| `npm run bench:wave` | `node benchmark/run.js --suite wave` |
| `npm run bench:math` | `node benchmark/run.js --suite math` |
| `npm run bench:save` | `node benchmark/run.js --output benchmark/results/latest.json` |
| `npm run bench:compare` | `node benchmark/compare.js` |

### Examples

```bash
# Single run, all suites
npm run bench

# Single run, one suite
npm run bench:collision

# Multiple runs (always specify N)
npm run bench -- --runs 5
npm run bench:collision -- --runs 3
npm run bench -- --suite pool,math --runs 3

# Compare current branch vs master
npm run bench:compare -- master
npm run bench:compare -- master --runs 5

# Compare vs a commit hash, specific suite, averaged
npm run bench:compare -- abc1234 --suite collision --runs 3

# Compare two specific commits
npm run bench:compare -- abc1234 def5678
npm run bench:compare -- abc1234 def5678 --runs 5

# Save latest results
npm run bench:save
npm run bench:save -- --runs 5

# Save to a custom file
npm run bench -- --runs 5 --output benchmark/results/before-refactor.json
```
