# Rainboids — Simulation Spec

This document is the **discipline layer** for the cross-language simulation.
It records the invariants that contributors must hold while editing
`js/sim/` and `server/src/sim/`. The parity harness (CI) is the safety net;
this doc is the upstream filter.

If you are touching simulation code, read the relevant section before
opening a PR.

---

## 1. Mirror layout

`js/sim/<thing>.js` and `server/src/sim/<thing>.rs` exist side by side.
Same module name, same function name (with the language's case convention),
same algorithm. A diff tool can show them next to each other.

| File | Purpose |
|------|---------|
| `state` | `GameState` shape — entity collections, world bounds, wave state |
| `input` | `PackedInput` ↔ `PlayerInput` — 7-byte wire form to normalized struct |
| `ship` | Ship physics: thrust → velocity → position; max-speed clamp; boundary wrap |
| `bullet` | Bullet integration |
| `enemy` | AI + movement (10 enemy types) |
| `asteroid` | Spawn + split |
| `collision` | Broadphase + narrowphase |
| `drops` | Orb spawn, attraction, collect |
| `wave` | Schedule + clear gate |
| `difficulty` | Per-player count scaling |
| `fxp` | Fixed-point I16F16 math |
| `trig` | Polynomial sin / cos / atan2 over Fxp |
| `rng` | PCG-64 seedable RNG |

When adding a new subsystem, add the file to **both** sides in the same PR.

---

## 2. Determinism rules

### 2.1 Fixed-point math is required for the prediction-relevant subset

Anything in the `[prediction.relevant_fields]` table of
`schema/protocol.toml` MUST be computed in fixed-point math. The current
list:

- `Ship.x`, `Ship.y`, `Ship.vx`, `Ship.vy`
- `Bullet.x`, `Bullet.y`, `Bullet.vx`, `Bullet.vy` at spawn (events only)

Anything outside that list MAY use `f32`/`f64` natively — those fields are
server-authoritative and interpolated client-side, so floating-point
drift between JS and Rust is invisible to gameplay.

### 2.2 No `Math.sin` / `Math.cos` / `Math.atan2` inside `js/sim/`

Use `js/sim/trig.js` (`fxpSin`, `fxpCos`, `fxpAtan2`). The same restriction
applies in Rust: `f32::sin` etc. are forbidden in `server/src/sim/`. The
trig polynomial coefficients are listed in `schema/protocol.toml`
under `[trig]`; both sides import from the same constants.

Lint enforcement (post-v1): an ESLint rule (or grep CI step) rejects PRs
that introduce `Math.sin`, `Math.cos`, `Math.atan2` under `js/sim/`.

### 2.3 No `Math.random` / `performance.now` / `Date.now` / `setTimeout` / `setInterval` inside `js/sim/`

Use `state.rng` (a `Pcg64` instance from `js/sim/rng.js`). Time comes from
the simulation tick counter, not wall-clock. Spawns scheduled "in 2 seconds"
become "in 120 ticks" via a tick-count comparison.

The Rust side already enforces this by construction (no equivalents to
`setTimeout` exist; `rand::random` is forbidden by code review).

### 2.4 PCG-64 algorithm pinned

Both sides use `rand_pcg::Pcg64` (Lcg128Xsl64). The JS implementation in
`js/sim/rng.js` uses `BigInt` for the 128-bit state — this is intentional
and the cost (~5–10× slower than `Math.random`) is acceptable because RNG
is called outside the hot prediction path.

Seed initialization on both sides goes through `seed_from_u64`, which
expands a 64-bit seed into 32 bytes via SplitMix64, then calls `from_seed`.
Reference vectors live in `schema/snapshots/rng_seq.json`.

### 2.5 IEEE-754 math at sim boundaries is OK

Where the simulation reads a `f32` and writes a `f32` (e.g. `hp`, `gold`,
`score`), both sides naturally agree because IEEE-754 with the same
operations yields the same result. The danger zone is *transcendentals*
(sin/cos/exp/log/pow); those go through `trig.js` (or are not used).

---

## 3. Wire protocol rules

### 3.1 Source of truth: `schema/protocol.toml`

When changing the wire protocol:

1. Edit `schema/protocol.toml` first.
2. Mirror the change into `server/src/protocol/mod.rs`.
3. Mirror the change into `js/sim/protocol.js`.
4. Bump `WIRE_VERSION` (increment by 1) in `schema/protocol.toml`,
   `server/src/protocol/version.rs`, and `js/sim/version.js`.
5. Run `node tools/check-schema.mjs` — it asserts every variant in the
   TOML exists on both sides. CI runs this step; merging without it
   passing is blocked.

### 3.2 Variant ordering matters

Bincode encodes enum tags as `u32(variant_index)`. Reordering variants
silently changes the wire format. **Always append new variants at the
end**; never delete or reorder. If a variant is obsolete, leave the
slot reserved.

### 3.3 Bincode 1.x configuration

```rust
bincode::DefaultOptions::new()
    .with_fixint_encoding()
    .with_little_endian()
```

The JS codec in `js/sim/codec.js` mirrors this. The configuration is
load-bearing: `with_fixint_encoding()` makes integers (and length
prefixes) fixed-width rather than variable-width, which is much simpler
for the JS decoder and makes wire layout audit-friendly.

---

## 4. Adding a new event variant

The most common change. The full checklist:

1. `schema/protocol.toml` — add a `[[message.event]]` block at the end.
2. `server/src/protocol/mod.rs` — add the variant to `enum GameEvent` at
   the end.
3. `js/sim/protocol.js` — add the variant to `EVT.*`, `encodeGameEvent`,
   and `decodeGameEvent` (each gets a new branch).
4. `tests/unit/sim/protocol.test.js` — add a round-trip case.
5. `server/src/protocol/mod.rs` `mod tests` — add the matching Rust round-trip.
6. If the variant carries position data, mark whether it's prediction-
   relevant in `schema/protocol.toml`.

After this, run:

- `npm run test:unit` — JS round-trip stays green.
- `cd server && cargo test` — Rust round-trip stays green.
- `node tools/check-schema.mjs` — name-level alignment passes.

If both unit-test layers stay green AND the schema check passes, the
variant is correctly mirrored.

---

## 5. Adding a new simulation rule

A rule is a deterministic transformation: `(state, input, dt, rng) -> state'`.

1. Decide if the rule is prediction-relevant (does the client predict it
   locally?). If yes, the rule must use fixed-point math; add the relevant
   fields to `[prediction.relevant_fields]` in `schema/protocol.toml`.
2. Implement in `js/sim/<file>.js` first. Write a `*.test.js` with at
   least 3 reference cases.
3. Implement in `server/src/sim/<file>.rs`. Mirror the test cases as Rust
   `#[cfg(test)]` modules.
4. Add a parity fixture under `schema/snapshots/<rule>.fixture.json` with:
   - `seed`: the RNG seed
   - `initial`: the starting `GameState` (in canonical JSON form)
   - `inputs`: the input sequence
   - `expected_after_n_ticks`: the canonical state after applying the rule
5. Add the fixture to the parity harness's index list.

The harness will:
- Run Rust `simulate_tick` over the inputs and snapshot the canonical state.
- Run JS `simulateTick` over the inputs and snapshot the canonical state.
- Diff the two; failure blocks the merge.

---

## 6. PR template (touching `js/sim/` or `server/src/sim/`)

Add this section to the PR description — reviewers expect it:

```
### Simulation parity check
- [ ] Both `js/sim/` and `server/src/sim/` are updated.
- [ ] Parity harness fixtures regenerated if needed.
- [ ] `schema/protocol.toml` updated if wire format changed.
- [ ] WIRE_VERSION / SIM_VERSION bumped if breaking.
- [ ] `node tools/check-schema.mjs` and `cargo test` pass locally.
```

---

## 7. Forbidden patterns (quick reference)

In `js/sim/`:

| ❌ | ✅ |
|----|----|
| `Math.random()` | `state.rng.nextU32()` |
| `Math.sin(x)` | `fxpSin(x)` |
| `Math.cos(x)` | `fxpCos(x)` |
| `Math.atan2(y, x)` | `fxpAtan2(y, x)` |
| `setTimeout(fn, ms)` | tick-count comparison |
| `performance.now()` | `state.tick` |
| `import audioManager` | (forbidden — no presentation imports) |
| `document.querySelector` | (forbidden — no DOM imports) |

In `server/src/sim/`:

| ❌ | ✅ |
|----|----|
| `rand::random()` | `state.rng` |
| `f32::sin(x)` (in prediction path) | `fxp_sin(x)` |
| `Instant::now()` | `state.tick` |
| `tokio::time::sleep(...)` | (forbidden — pure functions only) |

---

## 8. Versioning

- `WIRE_VERSION`: bump when the byte layout changes (add/remove/reorder
  variants, change a field type, bump bincode config).
- `SIM_VERSION`: bump when the simulation rules change in a way that
  affects deterministic replay (new rules, new constants, new RNG
  consumers).

Hello messages carry both. The server compares both against its own and
closes the socket with `ErrCode::Version` on any mismatch — the client
shows an "update required" prompt rather than reconnect-looping.

---

## 9. Performance notes

- Fixed-point multiply on JS uses `Math.imul` split-half math (~3× cost
  of native f32 multiply, ~2× speedup over BigInt). Acceptable for the
  ~10 multiplies per ship per tick.
- PCG-64 on JS uses BigInt (~5–10× cost vs `Math.random`). Used outside
  the hot prediction path, so this is fine.
- Trig polynomial is `O(8)` Fxp multiplies per call, vs `Math.sin`'s
  hardware-accelerated path. Used only on ship facing changes (a few per
  tick at most), so no measurable impact.
