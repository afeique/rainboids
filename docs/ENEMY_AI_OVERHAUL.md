# Enemy AI Overhaul — Steering + Strategy + Hybrid Navigation

_Added 2026-05-30. Replaces the per-type hand-coded movement patterns with a
two-layer, data-driven AI shared by all 29 enemy archetypes._

## Why

Before this pass every enemy type was one hardcoded `movePattern` + one
`shootPattern` (≈99 KB of bespoke movement in `movement.js`), with no strategy
selection, no momentum, no lead targeting, and `currentTarget` permanently the
player. Weapon balance was broken in part *because* the enemies didn't punish
any weapon's weaknesses — nothing forced a player off the strictly-best gun.

The fix is a combat **ecology**: diverse enemies (different sizes/speeds/
behaviors) create situations that demand different tools → weapons balanced so
each tool owns some situations → (radial) lets you switch tools → smart AI keeps
those situations dynamic and readable.

## Architecture — two layers

### Layer 1 — Strategy (the "what"): `strategy.js`
A throttled (~350 ms) utility selector with hysteresis. Each tick (when due) it
scores a small set of candidate tactics by context (distance, own health,
weapon readiness, allies nearby, LOS) and commits to the best, with a
stickiness bonus + minimum-commit window so enemies read as deliberate, not
flickering. Critical health forces `REGROUP` immediately.

Tactics (`STRAT`): `CLOSE_DISTANCE`, `ORBIT`, `DIVE_BOMB`, `KITE`, `FLANK`,
`REGROUP`. Each archetype declares which subset it may use (`brain.strategies`).

### Layer 2 — Steering (the "how"): `steering.js` + `context-steering.js`
Reynolds steering behaviors produce a *desired velocity*; the steering force is
`desired − current`. A momentum integrator turns force into motion under
physical limits:

```
force = truncate(force, maxForce)   // engine power
accel = force / mass                // F = ma → heavy = sluggish
vel   = truncate(vel + accel, maxSpeed)
(+ optional maxTurnRate cap → rotational inertia / wide turns)
pos  += vel * TICK_SCALE            // done by enemy.update()
```

Behaviors: seek, flee, arrive, pursue (lead), evade, wander, separation /
cohesion / alignment (flocking), containment. **Context steering** samples N
candidate headings, builds an interest map (toward the goal) and a danger map
(toward obstacles), masks interest where danger is high, and picks the best
surviving heading — sliding around asteroids without oscillating, with an
escape-route fallback when boxed in.

**The big/slow-vs-small/fast feel is physics, not a speed constant:** a heavy,
low-force, low-turn archetype is a ponderous brute; a light, high-force,
high-turn one is a twitchy interceptor.

### Hybrid navigation: `navgrid.js`
Steering's one blind spot is a large *concave* obstacle (a U-trap) — a purely
local agent drives in and dithers. The only place Rainboids grows such a body
is a screen-filling boss in the enlarged boss arena. So A* is reserved for
exactly that: a coarse grid over the boss arena, the boss hull marked blocked,
and **one flow field** (Dijkstra from the player — the shared goal) that every
enemy reads as a "downhill toward the player" vector. One search for the whole
swarm, not per-agent A*. Steering still does the moving + dynamic dodging.

## The brain: `brain.js`
`updateBrain(enemy, gameEngine)` fuses both layers and writes `enemy.vel` only —
`enemy.update()` still integrates position and applies SLOW/CHILL, boundary
bounce, status-effect zeroing, and ability overrides (cloak/blink/charge/boss),
so the brain slots in without disturbing any of them. It also computes a
predictive **aim point** (`enemy._aimX/_aimY`) and exposes the active strategy
(`enemy._aiStrategy`); the firing system reads these for lead targeting.

### Wiring (opt-in, default-safe)
`enemy.js → updateMovement()` runs `if (this.config.brain) { updateBrain(...); return; }`
*before* the legacy `movePattern` switch. Types with a `brain` block use the new
AI; brain-less types (and bosses) keep the old path. All 29 types now have a
`brain` block, so all non-boss enemies use the new AI; the legacy patterns
remain as a fallback.

## Archetypes (all 29 types, as data in `enemy-data.js`)
| Archetype | Feel | Types |
|---|---|---|
| **Brute** | big, slow, heavy, close & ram | GUARDIAN, PROWLER, TITAN, GLACIER, WARDEN |
| **Interceptor** | small, fast, dive-bomb | HUNTER, STALKER, FROST_LANCE, TESLA_WRAITH, PHANTOM |
| **Swarmer** | tiny, very fast, flock | WASP, CINDER |
| **Sniper/Artillery** | medium, slow, kite at range | SENTINEL, DRIFTER, NULL_DRONE |
| **Orbiter** | medium, circle at distance | WEAVER, PRISM_MIRROR |
| **Support** | hang back, buff allies | LUMEN_DRONE, CONDUIT_NODE, SPORE_CARRIER |
| **Special/Bruiser** | varied; keep their ability | TANGERINE, ASHEN_DETONATOR, PLAGUEBEARER, HYDRA, DEVOURER, LEECH, JUGGERNAUT, THORNBACK, WRAITHWORM |

Each `brain` block: `{ maxSpeed, mass, maxForce, maxTurnRate, preferredRange,
strategies[], separationWeight, swarm, evalIntervalMs, leadShots }`. Most fields
default off size/speed, so tuning is cheap.

## Firing / lead targeting (`firing.js`)
Directed patterns (singles, bursts, spreads, homing seed, charged/arc lasers,
bomb lobs) now aim at `enemy._aimX/_aimY` (the brain's lead-predicted point)
with a fall back to the live player position — so fast players can't trivially
outrun enemy fire. Snipers/interceptors/kiters lead; brutes/sprayers don't.
Radial/omnidirectional patterns (circle_6, circular_burst, spiral_laser, nova
rings) are unchanged. Fleeing low-HP enemies in REGROUP stop plinking.

## Tests (all green, ESM runner: `node --experimental-vm-modules …/jest`)
- `tests/unit/ai/steering.test.js` — behaviors + integrator (momentum, caps, turn-rate)
- `tests/unit/ai/context-steering.test.js` — interest/danger, slide-around, escape route
- `tests/unit/ai/navgrid.test.js` — flow field forms + routes around a blocking hull
- `tests/unit/ai/brain-runtime.test.js` — all 29 archetypes: 300 ticks, bounded velocity, no throws; brute closes, sniper kites
- `tests/unit/weapons/dps-balance.test.js` — every weapon's effective DPS + range stays in band

## Files
New: `steering.js`, `context-steering.js`, `navgrid.js`, `strategy.js`, `brain.js`
(all under `js/modules/enemy/`). Edited: `enemy.js` (brain hook), `enemy-data.js`
(29 brain blocks), `firing.js` (lead aim).

## Remaining / follow-ups
- **Weapon radial** (mid-run switching) — to make the rebalanced weapon
  diversity strategically usable; requires a multi-weapon loadout (the reboot
  moved to one-weapon-per-run). Tracked separately.
- **Weapon-vs-archetype matchup multipliers** — hooks left in the rebalance;
  wire effectiveness per archetype via the element/resist system now that
  archetypes exist.
- **Tuning** — utility weights, per-archetype physics, and the lead strength
  want a live playtest pass (AI playtester in `tests/helpers/`).
