# Rainboids Benchmark Suite

A comprehensive Node.js micro-benchmark suite for measuring and comparing the performance of Rainboids' core game logic across git commits and branches.

## Quick start

```bash
# Run all suites
npm run bench

# Run a specific suite
npm run bench:pool
npm run bench:collision
npm run bench:noise
npm run bench:wave
npm run bench:math
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

### Save results to a JSON file

```bash
# Save to benchmark/results/latest.json
npm run bench:save

# Save to a custom path (relative to repo root)
node benchmark/run.js --output benchmark/results/before-my-change.json
```

### Output raw JSON to stdout

```bash
node benchmark/run.js --json
node benchmark/run.js --json --suite collision
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

### Limit comparison to specific suites

```bash
node benchmark/compare.js master --suite collision
node benchmark/compare.js abc1234 --suite collision,math
```

### Compare two specific commits against each other

```bash
node benchmark/compare.js abc1234 def5678
node benchmark/compare.js abc1234 def5678 --suite pool
```

### Example output

```
Rainboids Benchmark Comparison
  current (opt)  vs  target (abc1234)

  Wave Data & Level Scaling
  ──────────────────────────────────────────────────────────────────────
  Benchmark                                  current    abc1234    Δ
  ──────────────────────────────────────────────────────────────────────
  getWaveConfig() – procedural  (wave 100)   77.3 ns    181.5 ns   +57.4% ▲
  getWaveConfig() – scan waves 1–80          820.4 ns   2.3 µs     +64.4% ▲
  getEnemyLevel() – 1000 lookups             319.1 ns   317.4 ns   ~
  ──────────────────────────────────────────────────────────────────────

  Summary vs abc1234:
  11 improved  6 regressed  16 unchanged  of 33 benchmarks
```

**Δ column:** positive = current is faster than target (improvement); negative = current is slower (regression). Changes under ±2% are shown as unchanged.

## Saving snapshots for later comparison

You can save a snapshot before making changes, then compare after:

```bash
# Before your change
node benchmark/run.js --output benchmark/results/before.json

# ... make your changes ...

# After your change
node benchmark/run.js --output benchmark/results/after.json
```

Result files are gitignored by default so they won't clutter commits.

## File structure

```
benchmark/
├── README.md
├── run.js                     # Main runner
├── compare.js                 # Git comparison tool
├── lib/
│   ├── bench.js               # measure(), suite(), stats, formatting
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

**Measurement** — each benchmark runs a warmup phase (500 iterations by default) to let V8's JIT compile and optimize the hot path, then collects timing samples in batches of 100. Batch timing avoids `performance.now()` resolution noise. Stats reported: ops/sec, mean, p95, min.

**Browser mocking** — game source modules use browser APIs (`window`, `document`, etc.). `browser-mock.js` installs minimal shims before any game module is imported, so the pure logic runs in Node.js without modification.

**Commit comparison** — `compare.js` uses `git worktree add` to checkout the target ref into a temporary directory (`.bench-worktree-<hash>/`), copies the current benchmark suite into it (so the same measurement code runs against the old game source), runs both sets of benchmarks, then removes the worktree. Your working tree is never modified.

## npm scripts reference

| Script | Command |
|--------|---------|
| `npm run bench` | Run all suites |
| `npm run bench:pool` | Pool Manager suite only |
| `npm run bench:collision` | Collision Detection suite only |
| `npm run bench:noise` | Noise & Star Generation suite only |
| `npm run bench:wave` | Wave Data suite only |
| `npm run bench:math` | Math Operations suite only |
| `npm run bench:save` | Run all suites, save to `benchmark/results/latest.json` |
| `npm run bench:compare <target>` | Compare current vs target ref |
