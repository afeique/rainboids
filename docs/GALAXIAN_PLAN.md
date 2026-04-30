# Galaxian-Mode Plan — Top-Down, Steady, Dodgeable

Pivot from the current "formation + dive" implementation to a true vertical-scrolling shooter:
constant downward pressure, dodgeable bullet patterns, an asteroid stream interleaved with
enemy waves, and reliable enemy fire.

---

## Diagnosis: why enemies stop firing

`enemy.js:670–681` — the **aim gate**. An enemy will not fire unless its
`faceAngle` is within 30° of the angle to the player:

```js
if (Math.abs(aimDiff) > Math.PI / 6) return; // ~30° tolerance
```

In formation, `formationHoldMovement` lerps `faceAngle` toward the player at
`0.04` per frame — slow. If the player moves laterally below the formation,
the enemy's facing oscillates around the aim window and rarely satisfies the
gate. Result: enemies sit silent.

Secondary issues:
- `hasLineOfSight` (line 645) — asteroids near the formation block fire.
- `maxShootingRange` (line 642) — fine for full-screen play but trims edge cases.
- `playerDistance` is symmetric — the formation can be "too far" if the player
  hugs the bottom on a tall canvas.

---

## Diagnosis: why firing is too dense in tandem

Each enemy fires independently with its own cooldown (`600–3000ms` for HUNTER,
shorter for some types). With a 12-slot formation, even staggered, the
**combined fire rate** can exceed 1 bullet every 200ms across the squadron —
unreadable. There is no global throttle.

---

## Plan

### 1. Top-down enforcement

- **Spawn from top only** (`SortieRunner.spawnIntoFormation` already does;
  remove edge-randomized spawn paths from legacy `getRandomSpawnPosition`
  for galaga mode).
- **Dive trajectory = downward**. When a slot's occupant is released, give
  it a downward velocity (already 1.2–2.0 in `triggerDive`). Enforce that
  diving enemies cannot move back upward — clamp `vel.y >= 0.6` while
  diving. Native movement patterns can still wobble x, but y always
  progresses south.
- **Off-bottom cleanup**. When a diving enemy exits below `gameField.height`,
  release it to the pool (currently they may wrap or wander).
- **Player soft Y-clamp**. Add velocity damping when the player rises
  above `gameField.height * 0.45`. Don't hard-clamp — that feels bad.
  Just make upward thrust 60% as effective in the upper zone.

### 2. Constant, moderate enemy fire

Bypass the existing fire system entirely while in formation. Add a
**dedicated formation-fire path** with three properties:

a. **No aim gate.** Formation enemies always fire in the direction from
   their slot toward the player's current position, with a small jitter.
   No 30° check. No line-of-sight check (asteroids streaming past would
   otherwise gate the entire squadron).

b. **Per-enemy cooldown 2200–4500ms** (vs. current 600–3000). Random
   per-shot. Roughly halves the per-enemy fire rate.

c. **Global shooter token bucket.** `gameEngine.formationShooterTokens`
   = 2 tokens. An enemy must claim a token to fire its bullet (or burst).
   Token released after the bullet leaves the muzzle (or burst ends).
   Hard cap: at most 2 formation bullets spawned per frame.

   This is the key fix. Two-token cap means even if 8 enemies are
   simultaneously off cooldown, only 2 fire that frame; the rest wait.
   Player always faces a dodgeable density.

d. **Diving enemies fire with their native pattern** (no token gate).
   Dives are short events — 1–3 enemies for 2–3 seconds — so the
   density spike is brief and predictable.

### 3. Asteroid stream as part of formations

- Asteroids stop being random-edge spawns and become a **vertical stream**
  from the top edge.
- New stage event: `{kind:'asteroid_stream', interval, count, until}`.
  Spawns `count` asteroids every `interval` ms until `until`-stage-elapsed.
- Asteroid spawn helper: top-edge x in `[0.1*w, 0.9*w]`, y = `-60 - rand(0,80)`,
  vel.x = `±0.4`, vel.y = `1.2–2.4`. They fall straight (slight horizontal
  drift), pass through the formation level, give the player something to
  dodge / shoot for combo & loot.
- Asteroids exit bottom — release on `y > gameField.height + 80`.

### 4. Steady stream of enemies

Stages currently end when timeline events finish AND all enemies die.
That creates dead air. Replace with **endless stage flow until duration**:

- Stage has `duration: 60000` (or per-stage). Sortie runner ticks until
  duration elapsed, then stops spawning. Stage completes when remaining
  enemies are dead OR have flown off-bottom.
- During the stage, a **continuous spawner** runs in parallel with timeline
  events: every 1500–3000ms, if formation has free slots, spawn 1 enemy
  to fill. Enemy type cycles through the stage's pool.
- Dives happen on a **periodic schedule** (not one-shot timeline picks):
  every 4–6s, dive 1–3 occupants. Removes dependence on dense hand-authored
  dive timestamps.

This turns each stage into a 60–90s endless flow rather than a fixed
spawn list. Difficulty rises naturally as the player moves between stages.

### 5. Stage data simplification

With endless flow, stage data shrinks to:

```js
1: {
    name: 'First Contact',
    duration: 60000,
    formation: 'grid_4x2',
    pool: ['HUNTER', 'WASP'],         // round-robin spawn
    diveEvery: [4500, 6500],          // ms range between dive waves
    diveCount: 1,                     // dives per wave
    asteroidEvery: [3000, 4500],      // ms range between asteroid drops
    asteroidCount: 1,
}
```

Hand-authored timeline events still allowed (banner, pre-spawn, scripted
moments) but optional. Most stages will lean on the continuous parameters.

### 6. Implementation order

1. **Add formation-fire path** (`updateFormationFire` on Enemy, called
   from `updateShooting` when `inFormation`). Bypass aim/LOS gates,
   own cooldown, claim shooter token. — *fixes the silent-formation bug.*
2. **Token bucket** on GameEngine (`formationShooterTokens = 2`). Tokens
   consumed by formation fire, released after a frame.
3. **Stage data v2**: add `duration`, `pool`, `diveEvery`, `diveCount`,
   `asteroidEvery`, `asteroidCount`. Backfill stages 1–6.
4. **Continuous spawner + periodic dives** in `SortieRunner.tick()`.
5. **Top-down asteroid spawner** + bottom-edge release.
6. **Diving enemies clamped to vel.y >= 0.6**, off-bottom release.
7. **Player Y soft-damp** above 45% of gameField height.
8. Smoke test → version bump 6.1.0 (additive — same `galagaMode` flag).

### 7. What stays unchanged

- Pickup drops, combo meter, milestone perks — already in place, no edits.
- All 10 enemy types and their dive behaviors — formations just use them.
- Legacy free-spawn path (`galagaMode = false`) — untouched.

---

## TL;DR

- **Firing bug fix**: dedicated formation-fire path that ignores the aim-cone
  gate (`enemy.js:670–681`).
- **Density fix**: 2-token global cap on simultaneous formation bullets +
  per-enemy cooldown raised to 2.2–4.5s.
- **Top-down**: spawn-from-top only, dives clamped southward, off-bottom
  cleanup, player soft-damped above 45% Y.
- **Asteroid stream**: vertical from top, falls through formation level,
  exits bottom. Spawned by stage `asteroidEvery` cadence.
- **Steady stream**: stages run for fixed duration with continuous fill +
  periodic dives + asteroid stream — no dead air, no scripted-spawn dependence.
- Version 6.1.0 (MINOR — additive; same Galaga-mode flag).
