# Multiplayer → Single-Player Visual Parity: Strategy & Plan

_2026-05-28. Goal: MP should look and behave **identically** to single-player (SP)._

## Key finding (why there are "too many differences")

The MP **server** (`server/src/sim/sp-host.js`) runs the **real SP simulation**
headless — the actual `js/modules/*` entity classes, collision-system,
combat-manager, wave-data. So **gameplay logic is already SP**. Verified by direct
sim instrumentation:

- Bullet↔asteroid collision **works** (a hit drops asteroid HP and consumes the bullet).
- Asteroids **split** correctly: one r≈85 rock → `[62,61]` → `[45,44,41,41]` →
  `[28–31]×8` → gone (the classic 1→2→4→8 cascade; halts at `MIN_AST_RAD`). This
  is SP's exact behavior — what reads in-game as "spawns more asteroids" is the
  intended break-apart cascade (8 shards from one big rock).
- Loot is **death-gated**: a live enemy drops nothing; a kill drops once.
- Drops are **collected** on player overlap (money increments) and carry a
  `life≈7200` (~2 min) expiry.

**Therefore the divergences are NOT in the sim — they are in the CLIENT renderer**
(`js/mp/mp-renderer.js`), which **re-implements** each SP visual from snapshot
data rather than using SP's real drawing code. Every re-implementation is a fresh
chance to diverge → "too many differences." Two consequences:

1. **Loot looks different** because MP draws its own orb/gem art instead of SP's
   `ColorStar` / `GoldShape` / `GoldCoin` `draw()`.
2. **Perceived "endless gold"**: drops are death-gated + expire, but in the
   zoomed MP co-op view players can't sweep the whole field, so uncollected drops
   linger up to ~2 min and the drop pools can grow under heavy death rates → the
   field fills with gold. (An sp-host-side concurrent-drop **cap** — like the
   asteroid cap in 0.44.1 — bounds this without touching SP.)

## Strategy: stop re-implementing; reuse SP's real draw code

The robust path to parity is to **reconstruct lightweight SP entity instances on
the client from snapshot data and call their actual `draw()` / `paint()`**, the
way MP already does for **ship skins** (`skins/paint()`), **enemy silhouettes**
(`render/shapes.js`), and **HUD glyphs** (`utils.drawCachedMoneyIcon` etc.). Most
SP render modules import only `core/constants`, `core/utils`, `core/color-cache`,
`core/frame-clock` — all import-safe in the MP browser. So the pattern is proven.

### Catalog method (how to find everything that must be copied)

1. Enumerate every SP **renderable** = each entity with a `draw()` and each HUD
   element (`grep "draw(ctx" js/modules`). Sources of truth:
   `js/modules/player/renderer.js` + `skins/`, `js/modules/enemy/shapes.js`,
   `js/modules/world/{asteroid,color-star,gold-shape,gold-coin,powerup,line-debris}.js`,
   `js/modules/player/bullet.js` + `enemy/enemy-bullet.js`,
   `js/modules/hud/{status,combat,overlays}.js`, `performance/{webgl-*,nebula}`.
2. For each, record: **(a)** the draw fn + the `this`/arg state it reads, **(b)**
   whether that state is in the MP snapshot, **(c)** reuse path: import & drive
   with a stub, replicate exactly, or add a snapshot field.
3. Where state is missing from the wire, add an **additive** snapshot field
   (the delta codec diffs per-field, so additive fields are free — see 0.36/0.43).

## Status + plan (prioritized)

| SP renderable | MP today | Parity action |
|---|---|---|
| Player ship | ✅ real `skins/paint()` (0.45.0) | done |
| Enemy silhouettes | ✅ `render/shapes.js` (shared) | done |
| Enemy health bar | ✅ replicated SP gradient (0.46.0) | done |
| HUD (spheres/triforce/XP/gold) | ✅ SP glyphs + layout (0.44.0) | done |
| **Loot (health/gold)** | ❌ MP-drawn orb/gem | **P1 — reconstruct `ColorStar`/`GoldShape`/`GoldCoin`, call their `draw()`**; send `k` already + add gold amount/jewel + starType to the drop wire |
| **Drop accumulation** | ⚠ unbounded under heavy death | **P1 — cap concurrent drops in sp-host (cull oldest), like the asteroid cap** |
| Asteroids | ⚠ client re-derives verts | P2 — verify verts/hue match SP `asteroid.js draw()`; reconstruct if not |
| Explosions / debris | ⚠ MP-authored particles | P2 — drive from SP's `particlePool.get('explosionFlash'|'explosionShrapnel'|…)` recipe (reuse particle params) |
| Bullets | ⚠ MP glow+trail | P2 — reconstruct SP `Bullet.draw()` (needs angle/type in wire) |
| Powerups | ❌ not rendered | P3 — add powerup drops to wire + reuse `powerup.js draw()` |
| WebGL starfield/nebula | ⚠ Canvas2D approximation | P3 — only if Canvas2D version judged insufficient |
| Boss healthbar / item-feed / damage numbers | ⚠ MP-authored | P3 — match SP styling |

### Notes on the reported "bugs"
- **"Shooting an asteroid spawns more"**: it's SP's split cascade (1→2→4→8). If
  undesirable, that's an SP **gameplay** tuning change (fragment count / size
  ratio) — out of scope for "make MP look like SP," and would change SP too.
- **"Endless gold"**: death-gated + 2-min expiry; mitigate with the sp-host drop
  cap (P1) so the field can't fill up.

## Sequencing
P1 first (loot look + drop cap — directly addresses the reported loot issues),
then P2 (asteroids/explosions/bullets), then P3 (powerups/backdrop/HUD extras).
Each lands as its own MP version with QA-spec verification, staying clear of the
concurrently-active SP/shop/UI agent.
