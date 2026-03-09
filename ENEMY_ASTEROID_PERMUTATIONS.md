# Enemy + Asteroid Permutations

Generated from wave data analysis. Lists the valid combinations of enemy types and
asteroid counts across all 80 hand-authored waves, plus performance constraints.

---

## Performance Constraints

| Constraint | Value | Source |
|---|---|---|
| `MAX_WAVE_ASTEROIDS` | 12 | `GAME_CONFIG.MAX_WAVE_ASTEROIDS` (constants.js) |
| Highest asteroid count in any wave | 12 | Wave 1 (asteroids only) |
| Highest enemy total in any wave | 11 | Wave 80 (5 enemy types, 2+2+3+2+2) |
| Procedural wave asteroid cap | 12 | Enforced by `getWaveConfig()` |

The perf test `PERF-02` dynamically discovers the actual FPS safe limit and asserts
that `MAX_WAVE_ASTEROIDS` stays within it.

---

## Enemy Types (10 total)

| ID | Name | Introduced |
|---|---|---|
| 1 | HUNTER | Wave 2 |
| 2 | GUARDIAN | Wave 4 |
| 3 | WASP | Wave 6 |
| 4 | STALKER | Wave 8 |
| 5 | DRIFTER | Wave 10 |
| 6 | PROWLER | Wave 12 |
| 7 | WEAVER | Wave 14 |
| 8 | SENTINEL | Wave 16 |
| 9 | TANGERINE | Wave 18 |
| 10 | TITAN | Wave 19 |

---

## All Hand-Authored Wave Combinations (Waves 1–80)

### Phase 1: Asteroids Only (Wave 1)

| Wave | Asteroids | Enemies |
|---|---|---|
| 1 | 12 | — |

### Phase 2: Solo Enemy Introductions (Waves 2–19)

| Wave | Asteroids | Enemy Type | Count |
|---|---|---|---|
| 2 | 10 | HUNTER | 2 |
| 3 | 8 | HUNTER | 3 |
| 4 | 8 | GUARDIAN | 2 |
| 5 | 6 | GUARDIAN | 3 |
| 6 | 8 | WASP | 2 |
| 7 | 6 | WASP | 3 |
| 8 | 6 | STALKER | 2 |
| 9 | 5 | STALKER | 3 |
| 10 | 6 | DRIFTER | 2 |
| 11 | 5 | DRIFTER | 3 |
| 12 | 5 | PROWLER | 2 |
| 13 | 4 | PROWLER | 3 |
| 14 | 5 | WEAVER | 2 |
| 15 | 4 | WEAVER | 3 |
| 16 | 5 | SENTINEL | 2 |
| 17 | 4 | SENTINEL | 3 |
| 18 | 5 | TANGERINE | 2 |
| 19 | 4 | TITAN | 1 |

### Phase 3: Duo Combinations (Waves 20–39)

| Wave | Asteroids | Type A | # | Type B | # |
|---|---|---|---|---|---|
| 20 | 5 | HUNTER | 2 | GUARDIAN | 2 |
| 21 | 4 | HUNTER | 2 | WASP | 2 |
| 22 | 4 | GUARDIAN | 2 | WASP | 2 |
| 23 | 4 | HUNTER | 2 | STALKER | 2 |
| 24 | 4 | GUARDIAN | 2 | STALKER | 2 |
| 25 | 3 | WASP | 3 | STALKER | 2 |
| 26 | 4 | HUNTER | 2 | DRIFTER | 2 |
| 27 | 4 | GUARDIAN | 2 | DRIFTER | 2 |
| 28 | 3 | WASP | 3 | PROWLER | 2 |
| 29 | 3 | STALKER | 2 | PROWLER | 2 |
| 30 | 4 | DRIFTER | 2 | WEAVER | 2 |
| 31 | 4 | HUNTER | 2 | WEAVER | 2 |
| 32 | 3 | GUARDIAN | 2 | SENTINEL | 2 |
| 33 | 3 | WASP | 3 | SENTINEL | 2 |
| 34 | 4 | HUNTER | 2 | TANGERINE | 2 |
| 35 | 3 | STALKER | 2 | TANGERINE | 2 |
| 36 | 3 | PROWLER | 2 | TITAN | 1 |
| 37 | 3 | GUARDIAN | 2 | TITAN | 2 |
| 38 | 3 | TANGERINE | 2 | TITAN | 2 |
| 39 | 3 | SENTINEL | 2 | TITAN | 2 |

### Phase 4: Trio Combinations (Waves 40–60) — summary

Waves 40–60 mix 3 enemy types with 3–4 asteroids. Max enemy total peaks at ~7.
See `js/modules/wave-data.js` for the full listing.

### Phase 5: Quad Combinations (Waves 61–80) — summary

Waves 61–80 mix 4 enemy types with 2–3 asteroids. Max enemy total: 9 (wave 74).
Wave 80 (finale): HUNTER×2 + GUARDIAN×2 + WASP×3 + STALKER×2 + TITAN×2 = 11 enemies, 2 asteroids.

---

## Valid Range Summary (across all 80 waves)

| Metric | Min | Max |
|---|---|---|
| Asteroids per wave | 2 | 12 |
| Enemy types per wave | 0 (wave 1) | 5 (wave 80) |
| Total enemies per wave | 0 | 11 |
| Combined entities | 2 | 12+11 = 23 |

---

## Per-Enemy-Type Limits (from wave data)

Based on hand-authored waves, the maximum count of each enemy type in any single wave:

| Enemy | Max count in one wave | Wave(s) |
|---|---|---|
| HUNTER | 3 | Wave 3 |
| GUARDIAN | 3 | several Phase 3+ waves |
| WASP | 3 | Wave 7, 25, 28, 33, many others |
| STALKER | 3 | Wave 9 |
| DRIFTER | 3 | Wave 11 |
| PROWLER | 3 | Wave 13 |
| WEAVER | 3 | Wave 15 |
| SENTINEL | 3 | Wave 17 |
| TANGERINE | 3 | Wave 18, several Phase 4+ |
| TITAN | 2 | multiple late waves |

---

## Performance Test Scenarios (Enemy × Asteroid combos)

These are the specific combinations tested by the performance E2E suite.
Each row represents one scenario test (1 enemy type + N asteroids).

| Enemy Type | Asteroids | Test file |
|---|---|---|
| HUNTER | 12 | tests/performance/ |
| GUARDIAN | 12 | tests/performance/ |
| WASP | 12 | tests/performance/ |
| STALKER | 12 | tests/performance/ |
| DRIFTER | 12 | tests/performance/ |
| PROWLER | 12 | tests/performance/ |
| WEAVER | 12 | tests/performance/ |
| SENTINEL | 12 | tests/performance/ |
| TANGERINE | 12 | tests/performance/ |
| TITAN | 12 | tests/performance/ |
| ALL (Wave 80 finale) | 2 | tests/performance/ |

For count-scaling tests (1 enemy → 2 → 3 of each type with MAX_WAVE_ASTEROIDS),
see `tests/performance/perf-05-enemies.spec.js`.

---

## Notes

- Procedural waves (81+) are capped at `MAX_WAVE_ASTEROIDS = 12` asteroids regardless of scaling.
- Enemy counts in procedural waves scale by 10% per wave beyond 80, but are not independently capped
  (the highest enemy-type count in wave 80 is WASP×3, which would become WASP×4 around wave 90).
- If performance tests show degradation, lower `MAX_WAVE_ASTEROIDS` in constants.js and update wave data accordingly.
