# Changelog — Multiplayer (MP)

All notable changes to the Rainboids **multiplayer** product are documented here.
This is the **Node.js / pure-JavaScript** multiplayer line (the shelved Rust/WASM
attempt is archived under `multiplayer/` and is unrelated to these versions).

The format is based on [Keep a Changelog](https://keepachangelog.com/); MP stays
in `0.x` while experimental.

## [0.43.0] - 2026-05-28

### Added
- **Enemy bullets are now visible.** `sp-host.js buildSnapshot` serializes the
  enemy bullet pool (`ebullets`: id/x/y/colour) — previously incoming fire was
  **invisible client-side even though it damaged the player**. `ebullets` is a new
  delta-codec group, buffered + interpolated by the client (`Interpolator
  .sampleEbullets`) and rendered in a menacing red palette (trail + glow + core),
  distinct from the player's bright shots. New `window.__mp.ebulletCount`.

### Fixed
- **Bullet weapon-colour tinting** silently fell back to the default hue because
  `_energyRgb` (the hex→rgb parser) was referenced but never defined in
  `mp-renderer.js`. Now defined, so both player and enemy bullets tint by their
  actual colour. (The bug only surfaced visibly with enemy bullets, which always
  carry a colour.)

### Changed
- Bullet rendering is unified into one `drawBulletList(ctx, list, fallback)`
  helper, used for both player and enemy bullets.

## [0.42.0] - 2026-05-28

### Added
- **Rotating line-debris on destruction (look-like-SP step).** Enemy/asteroid
  deaths now shed single-player's signature line-shards (ported from
  `world/line-debris.js`): short hue-cycling line segments that fan out from the
  blast, tumble as they drift, and fade — layered behind the existing shrapnel
  embers, expanding ring, and flash. Count + length scale with blast radius.

## [0.41.0] - 2026-05-28

### Added
- **Beautiful drops + collection sparkle (look-like-SP step).** The flat pickup
  shapes (a green cross / a gold square) are replaced by single-player-style
  collectibles: **health** is a pulsing green glass orb with an additive glow and
  a white "+", **gold** is a spinning gem with a gold facet gradient and an
  additive glow. Collecting a drop bursts a short sparkle (green for health, gold
  for credits) from the pickup point (`DROP_COLLECTED` carries the position).

## [0.40.0] - 2026-05-28

### Added
- **Boss name-card + enemy hit-flash (look-like-SP step).**
  - **Boss name-card.** When a boss first appears in the snapshot (an enemy with
    a boss tier), a cinematic WARNING banner + the boss type name fades in, holds,
    and fades out across the upper screen.
  - **Enemy hit-flash.** An enemy whose HP dropped this snapshot gets a brief
    additive white bloom over its silhouette, so hits register visually like SP
    (the render loop now keys enemies by id to look up a per-enemy flash timer).

## [0.39.0] - 2026-05-28

### Added
- **Floating combat feedback (look-like-SP step).** All derived client-side from
  snapshot diffs (the event stream carries no amounts):
  - **Damage numbers** — a floating `-N` rises off any enemy whose HP dropped
    between snapshots (paired with the existing hit spark), in world space so it
    tracks the hit point.
  - **Gold `+N` popups** — a gold floater rises off the local ship whenever its
    Rainshards total increases (skips the first snapshot so a join with banked
    gold doesn't fire a phantom popup).
  - **LEVEL UP! announce** — a centered gold banner fades in/out when the local
    pilot's level increases.

## [0.38.0] - 2026-05-28

### Added
- **Clean, beautiful bullets (look-like-SP step).**
  - **Interpolated bullets.** Bullets are now smoothed through the `Interpolator`
    (buffered + lerped by id like ships/enemies) instead of jumping between raw
    snapshot points — bullet motion is fluid at any frame rate. New
    `Interpolator.sampleBullets(now)` returns each bullet's interpolated position
    plus the per-bracket travel delta and colour.
  - **Motion trails.** Each bullet draws a tapered additive streak opposite its
    travel direction (length scales with speed), the way single-player's bullets
    trail.
  - **Weapon-colored glow.** `sp-host.js buildSnapshot` now sends each bullet's SP
    weapon `color` (`c`, constant per bullet so the delta codec sends it once);
    the renderer tints the halo with it over a white-hot core. Falls back to a
    cyan-white plasma when no colour is sent (e.g. the legacy toy sim).

## [0.37.0] - 2026-05-28

### Added
- **Combat-feel juice (look-like-SP step).** Render-only impact effects, since the
  authoritative sim can't be frozen:
  - **Screen shake + camera kick** on explosions, scaled by blast radius and
    proximity to the local ship (distant blasts don't rock the camera); the kick
    pushes the camera away from the blast. A bigger jolt fires when a ship goes
    down. Applied as a render-only camera nudge so aim mapping stays steady.
  - **Screen flashes** — a white full-screen flash when a ship is downed, and a
    red damage vignette (edge glow) when the **local** ship loses HP (detected
    from the snapshot HP delta, since hit events carry no coords).
  - **Positioned hit sparks** — any enemy whose HP drops between snapshots emits a
    hot strike spark at its position.
  - **Muzzle flash** — a cyan nose bloom on the local ship when a shot fires.

### Notes
- True per-bullet motion trails are deferred: MP bullet snapshots carry no id or
  velocity, so trails are paired with a future bullet-interpolation pass.

## [0.36.0] - 2026-05-28

### Added
- **SP-style vitals HUD (sphere health + energy, triforce tanks, XP bar).** The
  flat bottom health bar is replaced by single-player's glass-orb HUD, ported
  from `js/modules/hud/status.js`:
  - **Health sphere** — red glass orb whose core fills center-out by HP fraction,
    with an eased drain, specular highlight, a pulsing low-HP rim, and a
    `{hp}/{max}` caption.
  - **Energy sphere** — cyan glass orb fed by power-weapon energy, with additive
    laser-diffraction streaks and a gold "ready" rim once a power shot is
    affordable.
  - **Triforce** — three spare-health-tank triangles (gold = owned, dim outline =
    empty slot) so the widget is always visible.
  - **Rainshards** — a gold diamond + count beside the orbs, with the run LEVEL
    below it.
  - **XP bar** — a thin segmented gold bar across the very bottom (white →
    goldenrod → dark-gold), filling toward the next level.
- **Additive HUD fields on the ship snapshot** (`sp-host.js buildSnapshot`):
  `lv` (level), `xp` (in-level XP), `e`/`me` (energy / max energy), `tk` (spare
  health tanks). The snapshot delta codec diffs ship fields generically, so these
  flow through keyframes + deltas with no codec change. New `window.__mp`
  accessors: `localLevel`, `localEnergy`, `localMaxEnergy`, `localTanks`.
- **`mp.html` loads SP's `Press Start 2P` pixel font** (self-contained
  `@font-face` → `css/fonts/`), and the client kicks `document.fonts.load` so the
  canvas HUD renders in the pixel font instead of falling back to monospace.

## [0.35.0] - 2026-05-28

### Added
- **SP-style following camera (look-like-SP step).** The client canvas now fills
  the viewport (`window.innerWidth × innerHeight`) and the renderer draws the
  world through SP's camera transform — zoom-around-canvas-center then a
  camera translate — so the **local player stays centered** and the arena
  scrolls past, exactly like single-player. The camera is clamped to the field
  (and centers the field on any axis smaller than the window), eases toward the
  ship (snaps on the first frame), and applies a modest zoom (`≤2.2×`, capping
  the visible world at ~1366 px) so the action reads "zoomed in on the player"
  on large monitors. Was: the whole 1920×1080 arena letterboxed into the window
  (the zoomed-out look).
- **Parallax scrolling starfield.** Three depth layers (0.25 / 0.5 / 0.85)
  scattered across the arena + a 360 px margin, each sliding at `depth × camera`
  so deep stars barely move and near stars track the world. Keeps SP's star
  colour mix (~55% blue-white, 25% white, 12% warm, 8% orange-red) and per-star
  twinkle. Replaces the old static screen-space field.
- **Canvas2D nebula backdrop.** SP's visible nebula is a WebGL layer and the
  shared Canvas2D `nebulaRenderer` is a disabled no-op, so MP now bakes its own
  soft additive cloud field (seeded, cool space palette) into an offscreen
  canvas once per viewport size and draws it with a gentle parallax behind the
  stars — real "nebulae" without the WebGL port.

### Changed
- **Aim mapping is camera-aware.** `MpInput` maps the cursor through the inverse
  of the zoom-around-center + camera transform, so aiming stays correct under
  the following, zoomed camera (was: canvas-pixel == arena coords).
- **HUD + center banner now draw in screen space** (after the world transform is
  restored), so they stay fixed regardless of camera position/zoom.
- `mp.html`: the canvas is a fullscreen fixed layer; the room/status bar overlays
  it. Removed the letterbox `#wrap`, `aspect-ratio`, and `image-rendering:
  pixelated` (we now render at native viewport resolution).

## [0.34.0] - 2026-05-28

### Removed
- **Wave-clear powerup draft** (the `DRAFT_OFFER` / `DRAFT_PICK` system added in
  0.33.0). Direction change: there are no more draft cards — all progression is
  through **gear**. Reverted the server draft state (`_openDraft` / `applyDraftPick`
  / `_resolveDrafts`), `SpRoom.draftPick`, the `C2S.DRAFT_PICK` route, the
  `EV.DRAFT_OFFER` / `EV.DRAFT_PICK` events, and their tests. The wave-clear
  breather remains, but it no longer opens a draft.

## [0.32.2] - 2026-05-28

### Fixed
- **Multiple co-op rooms in one process corrupting each other** (robustness).
  `SpHost` drives the deterministic `frameClock` + the seeded random source, which
  are **process globals** — so two `SpRoom`s in one server (separate join codes,
  the default real-sim sim) shared one clock/RNG: each room saw time at ~2× and
  drew from the other's RNG. `tick()` now installs this room's clock + RNG at the
  top and captures the advanced clock at the end, so concurrent rooms stay
  isolated. Single-room behavior is unchanged; removes the prior "one sim per
  process" footgun.

### Tests
- `tests/unit/sp-host.test.js`: two hosts ticking interleaved each keep an
  independent clock (advance 60×, not 120×). 42/42 MP unit green.

## [0.32.1] - 2026-05-28

### Added
- **In-browser boss-render verification + `MP_START_WAVE` debug hook.** SpRoom now
  honors `MP_START_WAVE=N` (via `SpHost.startWaveAt`) so the auto-wave driver opens
  on a chosen wave — letting QA reach late content without grinding earlier waves.
  Client gains `__mp.bossCount()` / `__mp.bossPartCount()` accessors.

### Tests
- `tests/qa/14-mp-boss.spec.js` (new): boots the default real-sim server on the
  stage-1 boss wave (`MP_START_WAVE=3`) and verifies a browser client receives the
  modular boss + its orbiting shield parts and renders the boss / parts / phase /
  intro paths with **zero page errors** — the in-browser proof the unit test
  couldn't give. Green.

## [0.32.0] - 2026-05-28

### Added
- **Modular multi-phase bosses are LIVE** (Path A, P7 — completes boss-fight
  parity). Boss waves now spawn the real SP boss descriptor for the stage
  (`spawnModularBoss(stage)` in `startWave`; tier boss is the descriptorless
  fallback) — multi-phase, orbiting bolt-head parts that shield the core, intro,
  and death script, all run headless by the descriptor driver. The authoritative
  `collision-system` already routes player fire to the boss parts, so destroying
  the bolt-heads to expose the core works exactly like SP.
- **Boss parts on the wire + rendered.** `buildSnapshot` serializes each boss's
  living parts (`pt`: position/radius/hp); the interpolator lerps them by index;
  the client renders them as glowing cyan nodes with a per-part damage ring, so
  players can see and target the shields.

### Tests
- `tests/unit/sp-host.test.js`: wave 3 spawns the real modular boss (a descriptor
  `bossId`, initialized `_partsState`) and serializes living parts with finite
  coords; `_applyBossTier` retains a direct test as the descriptorless fallback.
  41/41 MP unit green; default-sim co-op QA green (no wave-1 regression).

## [0.31.0] - 2026-05-28

### Added
- **Headless modular-boss capability** (Path A, P7 — de-risking the last big item).
  `SpHost.spawnModularBoss(stageOrId)` spawns a REAL SP boss descriptor (Harbinger
  et al. — multi-phase + orbiting parts + intro + death script) bound to SpHost as
  its engine context; the descriptor's per-frame driver runs automatically via
  `enemy.update`'s BOSS-04 wiring, so the boss FIGHTS headless (intro → parts →
  phases → firing) with no browser/engine deps. Proven by a 240-tick unit test
  (no throw, boss persists, serializes as a boss).
- NOT yet wired into live wave spawns: a modular boss's core is shielded by
  orbiting part bolt-heads, so it needs **parts serialization + client rendering**
  to be playable — the next step. Boss waves still spawn the tier boss (0.29.0)
  in the meantime.

### Tests
- `tests/unit/sp-host.test.js` (+1): the Harbinger descriptor runs headless across
  240 ticks without throwing. 26/26 SpHost + 5/5 SpRoom green.

## [0.30.1] - 2026-05-28

### Added
- **Background starfield** (P7 parity). SP's space backdrop is nebula **plus** a
  dense star field; the MP client was drawing only the nebula. Added a
  client-authored twinkling starfield over the nebula — seeded once, ~230 stars on
  a 1920×1080 arena, with SP's colour mix (~55% blue-white / 25% white / 12% warm /
  8% orange-red) and gentle per-star twinkle. Pure client cosmetic (no wire
  change); the fixed co-op arena makes a static field the right analogue to SP's
  parallax stars.

### Tests
- Covered by the default-sim co-op QA (starfield draws every frame; page-error
  guard catches any throw). Green.

## [0.30.0] - 2026-05-28

### Added
- **On-canvas HUD** (P7 parity). The MP client now draws an SP-style HUD on the
  game canvas: a bottom-center **local health bar** (green→amber→red by remaining
  HP, with `hp / maxHp` text, and a "DOWNED — hold on" state) plus a top-left
  **wave / pilots / gold** readout — all from authoritative snapshot state. The
  minimal DOM status line stays as redundancy.

### Tests
- Covered by both MP QA specs (the HUD draws every frame; the page-error guard
  catches any throw). 12 (toy) + 13 (real) green.

## [0.29.1] - 2026-05-28

### Added
- **Wave-clear interlude** (P7 pacing parity). Clearing a wave now emits
  `WAVE_CLEAR` (→ the client's "WAVE n CLEAR" banner) and holds a short breather
  (~1.5 s) before the next wave spawns — instead of the instant respawn that
  immediately overwrote the clear banner. Matches SP's between-wave beat.

### Tests
- `tests/unit/sp-host.test.js`: the advance test now asserts `WAVE_CLEAR` fires,
  the wave holds during the breather, then advances with a fresh roster. 25/25.

## [0.29.0] - 2026-05-28

### Added
- **Boss waves spawn real bosses** (Path A, P7). Boss-wave groups (`isBoss` +
  `bossTier`) now spawn a tier-scaled boss via the SP `BOSS_TIER_STATS` overlay —
  inflated HP (×4–×8), size (×1.35–×1.75), and speed, with the `isBoss`/`bossTier`
  flags — entering top-center for a dramatic arrival, instead of a plain enemy.
  The tier is serialized (`b`) and the client renders a crimson boss aura behind
  the (already-enlarged) silhouette plus an always-on labelled boss health bar.
- (The heavier modular-boss path — descriptors / multi-phase / parts / intro warp
  / death scripts + `boss-render.js` — remains a later parity step; this delivers
  hulking, high-HP stage bosses now.)

### Tests
- `tests/unit/sp-host.test.js` (+1): wave 3 spawns a TITAN boss with `bossTier=1`,
  >3× a plain TITAN's HP and >1.3× its radius, and serializes `b=1`. 25/25 SpHost
  green; the default-sim co-op QA stays green (no render regressions).

## [0.28.1] - 2026-05-27

### Added
- **Engine thrust trails** (P7 parity). Moving ships now shed a cyan exhaust plume
  out the rear, reusing the particle layer (SP's engine is particle-based too), so
  ships read as alive/thrusting instead of static hulls. Driven by the ship's
  authoritative velocity — local predicted + remote interpolated — and gated so a
  coasting ship emits nothing. Ship velocity (`vx`/`vy`) is now carried through
  the remote-ship interpolation sample.

### Tests
- Covered by `tests/qa/13-mp-sphost.spec.js`'s particle assertion (a moving pilot
  now reliably emits a trail) + the page-error guard. Green.

## [0.28.0] - 2026-05-27

### Added
- **Client-authored explosion particles** (Path A, P7 — the plan's "client
  re-derives the particle burst from the event stream" vision). The MP client now
  bursts SP-style shrapnel + embers on the positioned death/down events
  (`ENEMY_DEATH`, `ASTEROID_DESTROYED`, `SHIP_DOWNED`) — additive Canvas2D, drag-
  decayed, time-faded — layered over the existing flash + expanding ring. Deaths
  now read with real SP-like debris instead of a bare ring, with no extra
  bandwidth (the server still only sends semantic events). Added
  `__mp.particleCount()` for inspection/QA.

### Tests
- `tests/qa/13-mp-sphost.spec.js`: assert particles appear after combat (a kill or
  the idle pilot being downed bursts shrapnel). 12-mp2-ws (toy) + 13 (real) QA
  both green — the particle path is shared + backward-compatible.

## [0.27.1] - 2026-05-27

### Fixed
- **MP enemies all rendered as the HUNTER silhouette.** The client's enemy-shape
  lookup (`SP_ENEMY_SHAPE[e.type] || 'HUNTER'`) was a toy-sim leftover that only
  mapped the generic `chaser` key, so every real-sim type (WASP, GUARDIAN,
  STALKER, DRIFTER, PROWLER, WEAVER, SENTINEL, TANGERINE, TITAN) fell through to
  the HUNTER shape. Pass the real SP type straight to `drawEnemyShapeByType` (it
  already renders all ten); keep the legacy `chaser` remap + HUNTER fallback.
  Now each enemy renders with its own SP shape — true silhouette parity.

### Tests
- `tests/qa/13-mp-sphost.spec.js`: assert the client receives ≥2 distinct enemy
  types (wave 1 = HUNTER + WASP), so the varied roster is proven to stream + render
  without error. Added `__mp.enemyTypes()` debug accessor. Green.

## [0.27.0] - 2026-05-27

### Changed
- **The real SP sim is now the DEFAULT multiplayer.** `room-manager.js` serves
  `SpRoom` (the headless actual single-player simulation — real weapons, enemies,
  collisions, waves, downed+revive, graphical parity) unless `MP_SIM=toy`
  (`legacy`) selects the original lightweight toy sim. So `npm run mp:server` /
  production now play like single-player out of the box. Selection is via a
  testable `roomClassFor(simMode)`.

### Added
- **Co-op spawn protection.** Joining a live wave grants brief invulnerability
  (`SPAWN_IFRAMES_MS` = 2.5 s) so a pilot dropping into the swarm isn't instantly
  downed before they can react.

### Tests
- `tests/unit/room-class-selection.test.js` (new): the default is `SpRoom`; only
  `MP_SIM=toy`/`legacy` selects the toy `Room`.
- `tests/qa/13-mp-sphost.spec.js` now spawns the server with NO override, so it
  exercises exactly what production serves (the real-sim co-op). 5/5 MP QA green
  (4 legacy toy pinned via `MP_SIM=toy` in `12-mp2-ws`, 1 default real-sim).

## [0.26.0] - 2026-05-27

### Added
- **Co-op downed + revive** (Path A, P6). A lethal hit now DOWNS a pilot
  (`active=false, downed=true`) instead of ending the run; a living teammate
  within `REVIVE_RADIUS` revives them over `REVIVE_TICKS` (~2 s) at half HP with
  brief i-frames, and revive progress decays when no one is near — mirroring the
  toy sim's co-op revive so the existing client `dn`/`rp` fields + `SHIP_DOWNED`/
  `SHIP_REVIVED` events drive the DOWNED overlay and audio unchanged. The run
  ends (`GAME_OVER`) only when EVERY pilot is down; single-player (1 slot)
  collapses to the prior behavior (down → all-down → game over).
- Downed pilots lie still (skipped in the per-slot update + collision passes) and
  are excluded from enemy aggro until revived.

### Tests
- `tests/unit/sp-host.test.js` (+4): a lethal hit downs (not game-over) with a
  teammate alive; a nearby teammate revives (emits `SHIP_DOWNED` + `SHIP_REVIVED`);
  no nearby teammate → stays downed + progress decays; single-player downing ends
  the run. 24/24 SpHost + 12/12 SpRoom/netcode green.

## [0.25.1] - 2026-05-27

### Fixed
- **Asteroid render crash in the real-sim path.** SP asteroids tumble in 3D
  (`rot3D = {x,y,z}`) and have no flat `.angle`, so the snapshot serialized
  `a: NaN` → the client's `drawAsteroidShape` projected NaN vertices and threw
  (`Cannot read properties of undefined`), killing the render loop. SpHost now
  serializes `rot3D.x` as the scalar tumble seed (the client expands it into the
  wireframe spin, exactly like the toy-sim path). Caught by the new browser QA.

### Tests
- `tests/qa/13-mp-sphost.spec.js` (new): two-client co-op smoke against the REAL
  SP sim (`MP_SIM=sphost`) — proves the user-facing goal end-to-end. Both pilots
  connect + see each other; the real wave driver streams asteroids + enemies;
  driving + firing render via the SAME SP `shapes.js` path; A's authoritative
  movement + bullets reach B; **zero page errors** (the SP shape draw path is
  exercised against the real enemy types / asteroid fields). Green (8s).

## [0.25.0] - 2026-05-27

### Added
- **SpRoom drives co-op N players** (Path A, P5 — completes the live co-op loop).
  `join` now allocates a real SpHost ship slot per player (spread around the arena
  center so they don't stack), `setInput` routes each player's frame to its own
  slot (`setSlotInput`), and `leave` releases the slot. The snapshot carries one
  authoritative ship per player, so 2+ pilots fight the real SP sim together —
  shared arena, nearest-player enemy aggro, per-ship collisions. Async-init joins
  register their slot once the host's SP modules finish importing.

### Tests
- `tests/unit/sp-room.test.js`: the single-controller/spectator test is replaced
  by two co-op tests — both joiners get authoritative ships; each player's input
  drives its own ship (A right / B left). 25/25 SpRoom + SpHost green; server
  boots in `MP_SIM=sphost` mode (`/healthz` 200).

## [0.24.0] - 2026-05-27

### Added
- **Co-op N players in SpHost** (Path A, P5 — the §4 generalization). SpHost now
  holds N player slots (`addPlayer` / `removePlayer` / `setSlotInput`) sharing one
  arena + world. Each tick rebinds `this.player` to the slot being processed (the
  SP sim code reads `this.player` singular — they're the same object as
  `window.gameEngine.player`), so the real player/weapons/lifecycle code runs
  unchanged per player without rewriting it.
  - **Per-slot movement + firing**: every slot runs the real `player.update` with
    its own input frame.
  - **Nearest-living-player aggro**: enemies target the closest active, non-downed
    ship (`enemy.update(playerRef, …)` already takes the target as a parameter —
    no enemy-code change).
  - **Per-player collision passes**: `handleCollisions` runs once per slot
    (rebinding `this.player`); world collisions (bullet↔enemy, enemy↔asteroid)
    deactivate their entities on the first pass, so they're effectively processed
    once while each ship resolves its own body / enemy-bullet / pickup hits.
  - **Snapshot serializes N ships** (distinct ids + `dn`/`rp` downed/revive fields).
- Backward compatible: a single slot is identical to the prior single-player path
  (all existing SpHost/SpRoom tests unchanged). SpRoom still drives slot 0 for now;
  N-player room wiring + downed/revive is the next step.

### Tests
- `tests/unit/sp-host.test.js` (+4): two players move independently; one ship per
  slot with distinct ids; enemies aggro the nearest ship; `removePlayer` keeps the
  host valid. 20/20 SpHost + 11/11 SpRoom/netcode green.

## [0.23.0] - 2026-05-27

### Added
- **Live server runs the REAL SP sim** (Path A, P4 milestone — "one player, MP
  plays exactly like SP"). New `server/src/sp-room.js`: a drop-in `Room`
  alternative (same `join`/`leave`/`setInput`/`start`/`stop`/`population`/`roster`
  API + same wire shape) that drives a headless `SpHost` instead of the toy sim.
  Real SP weapons, enemies, collisions, drops, and the wave driver now stream to
  the existing SP-shape MP client unchanged — full gameplay parity for the single
  controlling player.
- **`MP_SIM=sphost` flag** (`room-manager.js`) selects the real-sim room; the toy
  sim stays the **default**, so the existing N-player path + 2-client smoke test
  are untouched until SpHost goes co-op (P5). `SpHost.init()` is async (dynamic
  SP-module imports); the room gates its tick loop on readiness and answers
  WELCOME immediately from the deterministic field-center spawn.

### Tests
- `tests/unit/sp-room.test.js` (new, 4): WELCOME + field-center spawn; an SP-shape
  snapshot keyframe with the controller ship + real wave roster; `EV.BULLET_SPAWN`
  + server-authoritative bullets on fire (reconstructed via the client's
  `SnapshotStream`, keyframe + deltas); single-controller / spectator behavior.
- Verified the server boots in BOTH modes (toy default + `MP_SIM=sphost`,
  `/healthz` 200). All MP unit suites green (27/27).

## [0.22.0] - 2026-05-27

### Added
- **SpHost network serialization + protocol event stream** (Path A, P4 — the wire
  layer before live server integration). `buildSnapshot()` emits the SAME shape
  the toy-sim room sends + the SP client consumes (`ships` / `enemies` /
  `asteroids` / `bullets` / `drops` with reconcile fields `al`/`dn`/`rp`/`g`/`li`),
  so the existing SP-shape MP renderer + interpolator render it unchanged.
- **Stable network identity across ticks.** Every pool acquisition (spawn /
  asteroid split / bullet fire) stamps a fresh `_netId` via a wrapped `pool.get`,
  so a recycled pool slot never carries a stale id — keeping snapshot diffs +
  client interpolation correct across deaths and respawns.
- **`deriveEvents()` → `EV.*` stream.** Positioned FX (enemy/asteroid deaths,
  spawns, drop collects, bullet-fire) are DERIVED from the snapshot diff (the SP
  audio stream carries no coordinates), while positionless sounds (ship/enemy
  hits, ship-down, wave-start) come from the SP audio event stream — full SP
  audio + explosion-ring parity without the server simulating cosmetics.
- **`frame(input)`** convenience: one tick → `{ snapshot, events }` for the room.

### Tests
- `tests/unit/sp-host.test.js` (+4): wire snapshot shape; stable ids across ticks;
  a positioned `ENEMY_DEATH` + `BULLET_SPAWN` on fire; `frame()` echoes the input
  tick for reconcile. 16/16 green.

## [0.21.0] - 2026-05-27

### Added
- **Headless wave driver** (Path A, P4 — `SpHost` self-drives enemy spawns). Opt-in
  (`host.autoWaves = true`) so manual-spawn tests are unaffected. Reuses the REAL
  wave-data tables (`getWaveConfig` / `getEnemyLevel` / `getAsteroidLevel`) so the
  spawn composition + level scaling match SP — it is NOT a second sim. `startWave(n)`
  spawns the wave's asteroids + every sub-wave's enemies at field-edge points;
  `_updateWaves()` starts wave 1 then advances to the next once every enemy is
  cleared (an empty pool is the true "cleared" signal — mid-death enemies stay
  pooled). Emits a `wave:start` event for the client.
- Intentionally OMITS (vs the SP wave-manager) the DOM-coupled between-wave
  orchestration — the draft/shop overlay + pause + sub-wave pacing timers — which
  needs the co-op "shared draft + everyone ready" design (plan §4); deferred to
  P5/P6. Boss groups currently spawn as ordinary enemies of that type (the modular
  boss-spawn path is a later P7 parity step).

### Tests
- `tests/unit/sp-host.test.js` (+3): auto-starts wave 1 + spawns the real roster;
  advances to wave 2 once enemies are cleared; stays idle when `autoWaves` is off.
  12/12 green.

## [0.20.0] - 2026-05-27

### Added
- **Real SP collisions run headless** (Path A, P4 — `SpHost` is now a full
  combat engine context). The server host binds the actual SP
  `collision-system.js`, `combat-manager.js`, and player `lifecycle.js` modules
  via `fn.call(this)` — exactly as `game-engine.js` delegates them — so the
  authoritative damage/kill/pickup core is the *same code* SP runs, not a
  reimplementation. Player bullets damage + kill enemies (with crits, statuses,
  splits, vampirism, kill-streak/XP rewards, gear/gold drops), enemy bullets and
  bodies damage the player through the real `takeDamage` resist pipeline, and
  asteroids/orbs/gold/powerups collide + collect.
- **Collectible + VFX pools on the host.** Added the sim pools (`colorStarPool`,
  `goldCoinPool`, `goldShapePool`, `powerupPool`) + a `SpatialGrid` broad-phase;
  the cosmetic VFX pools (`particlePool`/debris/shards) are the no-op stub so the
  many direct `this.particlePool.get(...)` sites no-op server-side.
- **Per-tick semantic event stream.** `SpHost.events.emit` is wrapped to buffer
  every event the SP sim raises (`audio:*`, `enemy:killed`, …); `tick()` drains
  it and returns the stream so clients re-derive particles/sounds/shake.
- **Headless death/tank flow** (`handlePlayerDeath` / `_consumeTank`): the SIM
  essentials (drop the ship from collisions, flip to `GAME_OVER`) minus the SP
  FX/overlay. Cosmetic engine hooks (screen shake, hitstop, debris, damage
  numbers, notifications, missions, bounties) are no-op stubs on the host.

### Tests
- `tests/unit/sp-host.test.js` (+4): player bullets kill a real enemy via the
  collision-system; the per-tick event stream drains audio/semantic events on a
  hit; an enemy body damages the player through the real lifecycle; a 200-tick
  mixed run (enemies + asteroids) never throws. 9/9 green.

## [0.19.0] - 2026-05-27

### Added
- **MP plays SP sounds on events** (Path A, Group G4 — audio). The MP client
  wires the shared `audio/audio-manager.js`: `init()` loads SFX (async; the
  guarded `playSound` no-ops until loaded, so it's always safe), and the
  AudioContext resumes on the first user gesture (autoplay policy). The event
  handler now plays SP sounds — shoot (BULLET_SPAWN), hit (ASTEROID/ENEMY/SHIP
  HIT), explosion (ASTEROID/ENEMY death), player-explosion (SHIP_DOWNED), coin
  (gold pickup), powerup (health pickup / revive). "Sounds like SP."

### Tests
- `tests/qa/12-mp2-ws.spec.js` page-error guard green (4/4) — audio import +
  init + per-event playSound run in-browser without throwing (the firing/kill
  flow exercises shoot/hit/explosion).

## [0.18.0] - 2026-05-27

### Changed
- **SP-style bullet glow + explosion flashes** (Path A, Group G3 — Canvas2D).
  Bullets render as additive bright-core + warm-halo radial glows (replacing flat
  dots); destruction events get an early additive flash before the expanding
  ring, so deaths read like SP explosions. Single-canvas Canvas2D (no GPU-canvas
  alignment risk) — chosen over the WebGL bullet renderer because the two-canvas
  overlay can't be visually verified headlessly.

### Tests
- `tests/qa/12-mp2-ws.spec.js` page-error guard green (4/4) — bullet glow + flash
  paths exercised in-browser (client A fires + destroys entities).

## [0.17.0] - 2026-05-27

### Changed
- **MP renders the SP nebula background** (Path A, Group G3 — background). The MP
  client reuses the shared `performance/nebula-renderer.js` (self-contained
  Canvas2D, zero engine coupling): generated once for the arena, drawn stationary
  behind all entities. Wrapped in try/catch so a background hiccup can never
  break the frame. Replaces the flat dark backdrop. (WebGL bullet/particle/
  starfield layers are the next G3 steps.)

### Tests
- `tests/qa/12-mp2-ws.spec.js` page-error guard green (4/4) — the background
  draws every frame in-browser without throwing.

## [0.16.0] - 2026-05-27

### Changed
- **MP asteroids render in true single-player style** (Path A, Group G2). The MP
  client now draws asteroids via the shared `render/shapes.js` tumbling-wireframe
  helpers (`generateAsteroidVertices` → `projectAsteroidVertices` →
  `drawAsteroidShape`), replacing the placeholder octagon. A per-asteroid
  cosmetic cache (keyed by entity id, seeded via `makeRng(id)`) gives each rock
  stable verts + hue params; a 3-axis tumble is fabricated from the snapshot
  angle + per-id phase offsets. Cache evicts despawned asteroids.

### Tests
- Covered by `tests/qa/12-mp2-ws.spec.js`'s page-error guard (the asteroid field
  exists from room creation, so the draw path is exercised every frame). 4/4 green.

## [0.15.0] - 2026-05-27

### Changed
- **MP client renders ships + enemies in true single-player style** (Path A,
  Group G — the "look like SP" track). `js/mp/mp-renderer.js` now draws ships via
  the shared `js/modules/render/shapes.js` `drawShipShape` (SP magenta hull) and
  enemies via `drawEnemyShapeByType` (pre-translated to facing, `now`-animated;
  the headless-sim type maps to the SP shape registry), replacing the placeholder
  triangles/arrowheads. Local ship gets a co-op readability ring; downed-dim +
  revive ring preserved. Asteroids + the WebGL particle/bullet/starfield layers
  are subsequent Group-G steps.

### Tests
- `tests/qa/12-mp2-ws.spec.js` — adds a page-error/console-error guard so a
  throw in the SP shapes.js draw path fails the e2e (the rAF loop would otherwise
  swallow it). All four MP e2e cases green.

## [0.14.0] - 2026-05-27

### Changed
- **Binary wire codec** (roadmap Feature 1) — `js/sim/codec.js` now encodes to
  **MessagePack** (`encode` → `Uint8Array`) instead of JSON, hand-rolled and
  dependency-free so it runs identically in Node + browser with no bundler /
  vendoring / import map. `decode` accepts string|Buffer|ArrayBuffer|Uint8Array,
  still tolerates a JSON string, and returns null on malformed input. The
  transports already send/receive binary frames, so no change above the seam.
  Smaller, faster wire on top of delta snapshots.

### Tests
- `tests/unit/codec.test.js` — binary round-trips (mixed int/float, negatives,
  bool/null, unicode, empty containers, large ints), Buffer/ArrayBuffer decode
  paths, and JSON-string tolerance. `server-room.test.js` fake conn decodes the
  binary `sendRaw` payload. MP e2e green over the binary wire.

## [0.13.1] - 2026-05-27

### Fixed
- **Title-screen MULTIPLAYER button overflowed short landscape phones.** On
  mobile-landscape the four secondary buttons now lay out as a 2×2 grid
  (TUTORIAL/HANGAR · SETTINGS/MULTIPLAYER) so all six fit a 640×360 canvas;
  portrait (single column) and desktop (full-width stacked) are unchanged.
  Restores the `title-screen-layout` unit test's "multiplayer fits" assertion.

## [0.13.0] - 2026-05-27

### Added
- **Delta snapshots** (roadmap Feature 2) — the server now sends a full keyframe
  on join / first tick / every 30 ticks and **field-level deltas** in between
  (only changed scalars + changed entity fields, plus removed ids). The client's
  `SnapshotStream` reconstructs the full snapshot from the last keyframe, so
  everything downstream (interp, reconcile, render) is unchanged.
  - `js/sim/snapshot-delta.js` (new) — shared `buildDelta()` / `applyDelta()`.
  - `server/src/room.js` — keyframe/delta broadcast + force-keyframe on join.
  - `js/mp/netcode/snapshot-stream.js` — baseline + delta application; `mp-main`
    skips a delta that arrives before its first keyframe.
  - Cuts wire size by omitting unchanged fields (static hp/maxHp/radius/type/
    weapon, idle entities) every tick — pairs with the upcoming binary codec.

### Tests
- `tests/unit/snapshot-delta.test.js` — round-trip (moves, field changes, adds/
  removes, scalar changes, 20-tick chain) + `SnapshotStream` keyframe/delta
  sequence and pre-keyframe skip. MP e2e remains green (delta is invisible to
  gameplay; reconnect exercises the keyframe path).

## [0.12.0] - 2026-05-27

### Changed
- **Netcode-optimization seams (Phase 0, behavior-preserving)** to enable
  binary-wire / delta-snapshot / render-worker work behind stable contracts:
  - `js/mp/netcode/snapshot-stream.js` (new) — `SnapshotStream.ingest(msg)`
    reconstruction seam (pass-through for now).
  - `js/mp/render-bridge.js` (new) — `RenderBridge.present(state)` render seam
    that owns canvas-context acquisition (needed for a later OffscreenCanvas
    worker); `mp-main.js` no longer calls `getContext` directly.
  - `mp-main.js` rewired to both seams (snapshot → `ingest`, draw → `present`);
    no behavior change (all MP e2e + unit tests still green).
  - `WIRE_VERSION` 1 → 2 (reserves binary wire + delta snapshots; handshake
    rejects mismatched clients so no mixed-format clients connect).

## [0.11.0] - 2026-05-27

### Added
- **Title-screen entry point**: a **MULTIPLAYER** button on the solo title screen
  (below SETTINGS) navigates to `/mp.html`. Mirrors the existing TUTORIAL/HANGAR
  button pattern in `js/modules/hud/overlays.js` (layout + draw) and routes by id
  in `js/main.js` (hit-test + click → `window.location = 'mp.html'`).

### Notes
- This is a bridge change (touches the solo title screen to reach the MP
  product). The solo `VERSION`/`CHANGELOG.md` bump is intentionally **deferred**
  to avoid colliding with the concurrent looter-pivot agent that owns solo
  versioning on this shared branch — fold it into the next solo bump.

## [0.10.0] - 2026-05-27

### Added
- **Client auto-reconnect**: the MP client now reconnects automatically after a
  dropped connection (retries every 2 s, re-sends `Hello`; prediction is rebuilt
  on the next `Welcome`). `mp-main.js` is refactored around a reusable
  `connect()` + `handleMessage()` so the render loop survives transport churn.
- **WebTransport placeholder seam**: `net/webtransport-transport.js` is a stub
  implementing the client `Transport` interface (documents the intended
  datagram/stream mapping, throws on connect). A transport selector tries
  WebTransport only when requested (`?transport=webtransport`) and **falls back
  to WebSocket** when it isn't available — making the deferred Phase 8 a
  ready-to-fill seam without changing anything above it.

### Fixed
- **Graceful shutdown**: `WebSocketTransport.close()` now terminates live
  connections before closing, so shutdown doesn't block on upgraded WS sockets
  (and clients are dropped promptly, triggering their reconnect).

### Tests
- `tests/qa/12-mp2-ws.spec.js` — new case: a client **auto-reconnects after the
  server is killed and restarted** on the same port.

## [0.9.0] - 2026-05-27

### Added
- **Matchmaking (multi-room + code-based join)**: `RoomManager.getOrCreateRoom()`
  keys rooms by a join code — a blank/absent code routes to the shared `public`
  room, any other code creates/joins a private room, so separate groups play
  isolated games. `Welcome` echoes the room id; empty rooms are closed
  (`closeRoom`) on last-leave to reclaim their tick loop.
- **Client room UI**: a room-code field on `mp.html` (pre-filled from `?room=`,
  Enter reloads into that room); the join code is sent in `Hello` and shown in
  the status line.
- **Resilience — server heartbeat**: the WebSocket transport pings clients every
  15 s and terminates any that miss a pong (reaps dead/zombie connections;
  browsers auto-respond). Heartbeat is cleared on shutdown.

### Tests
- `tests/unit/server-room.test.js` — `RoomManager` create/reuse/isolation,
  blank-code → public, and `closeRoom` teardown.
- `tests/qa/12-mp2-ws.spec.js` — new case: clients with different room codes are
  isolated (no shared roster / remote ships).

## [0.8.0] - 2026-05-27

### Added
- **Wave system** (`wave.js` `updateWaves()`) replacing the flat enemy spawner:
  intermission → active → (budget spawned + all enemies dead) → intermission.
  Per-wave enemy budget and enemy HP scale with wave number and player count;
  emits `WAVE_START` / `WAVE_CLEAR`. Enemies spawn paced from arena edges.
- **Run-over / restart**: a full team-wipe (all ships downed) → `GAME_OVER`,
  then after a delay the room resets (ships revived at spawn, entities cleared,
  wave reset) → `RUN_RESTART`.
- **Client**: snapshot carries `wave` + `waveState`; HUD shows them; wave/
  game-over/restart events raise a fading center banner.
- `enemy.js`/`world.js` — `spawnEnemy` accepts an HP override for wave scaling.

### Changed
- Removed the interim flat `tickEnemySpawner`; enemy spawning is now wave-driven.

### Tests
- `tests/unit/sim-wave.test.js` — wave start/clear, budget scaling by player
  count, and team-wipe → game-over → restart.
- `tests/unit/sim-enemy.test.js` — dropped the old flat-spawner cases.
- `tests/qa/12-mp2-ws.spec.js` — asserts the wave system advances to wave ≥ 1.

## [0.7.0] - 2026-05-27

### Added
- **Loot drops** — the reward loop:
  - `drop.js` — health/gold orbs that drift with friction, magnet toward a
    nearby ship, and despawn on TTL.
  - `world.js` — `drops` map + `spawnDrop()`.
  - `collision.js` — enemy deaths drop gold (+ a chance of health); destroyed
    asteroids have a chance to drop gold; living ships collect drops on contact
    (heal / add gold), emitting `DROP_SPAWN` / `DROP_COLLECTED`. Shared loot
    (first ship to touch collects).
  - `ship.js` — `gold` field; `tick.js` steps + reaps drops;
    `server/src/room.js` snapshots drops + ship gold.
- **Client**: drops interpolated (`sampleDrops`) and drawn (green cross = health,
  gold diamond = gold); HUD shows the local player's gold;
  `window.__mp.dropCount()` / `localGold()` exposed.

### Tests
- `tests/unit/sim-drops.test.js` — drop motion/magnet, gold pickup + event,
  capped healing, and gold-drop-on-enemy-kill.

## [0.6.0] - 2026-05-27

### Added
- **Co-op revive** — the signature teamwork mechanic, pairing with the downed
  state from 0.5.0:
  - `coop.js` — `updateRevives()`: a downed ship accrues revive progress while a
    living teammate is within `REVIVE_RADIUS`; reaching `REVIVE_TICKS` (~2 s)
    brings it back at `REVIVE_HP` and emits `SHIP_REVIVED`. Progress decays when
    no reviver is near. Runs each `tick()`.
  - `ship.js` — `reviveProgress` field; `server/src/room.js` snapshots it (`rp`).
- **Client revive UX**: downed ships render dimmed with a green revive-progress
  ring; the local downed ship still renders (and the HUD shows DOWNED). Local
  prediction feeds neutral input while downed so it stays aligned with the
  server-held ship (no reconcile snap-back). The interpolator now carries each
  ship's `downed`/`reviveProgress`.

### Tests
- `tests/unit/sim-coop.test.js` — revive on teammate presence, no-revive when
  out of range, progress decay, and living-ship progress reset.

## [0.5.0] - 2026-05-27

### Added
- **Enemies (first type: chaser)** in the shared sim:
  - `enemy.js` — homing "chaser" AI (`nearestShip` + steer), `createEnemy`,
    per-tick `stepEnemy` with a contact-damage cooldown.
  - `world.js` — `enemies` map, `spawnEnemy()`, and `tickEnemySpawner()` (spawns
    chasers from arena edges on an interval while players are present, capped).
  - `collision.js` — bullet↔enemy (damage/kill + `ENEMY_HIT`/`ENEMY_DEATH`) and
    enemy↔ship contact (cooldown-gated damage; downs the ship + `SHIP_DOWNED`).
  - `ship.js` — `downed` flag; `tick.js` steps enemies + runs the spawner.
  - `server/src/room.js` — snapshots carry an `enemies` array + ship `dn` flag.
- **Client**: enemies interpolated (`sampleEnemies`) and drawn (arrowheads with
  damage HP bars); `ENEMY_DEATH` joins `ASTEROID_DESTROYED` in spawning
  destruction rings; HUD shows local HP / DOWNED + live enemy count; downed
  local ship stops rendering. `window.__mp` exposes `enemyCount()` / `localHp()`.

### Tests
- `tests/unit/sim-enemy.test.js` — chaser targeting/steering, bullet kills,
  contact damage + downing, spawner gating/cap, and a tick() integration.
- `tests/qa/12-mp2-ws.spec.js` — asserts enemies spawn once a player is present.

## [0.4.0] - 2026-05-27

### Added
- **Combat in the shared sim** — the arena is now an actual co-op shooter:
  - `bullet.js` — straight-line player bullets (integrate, age, despawn on
    TTL / out-of-bounds).
  - `collision.js` — authoritative circle-vs-circle `resolveCollisions()` for
    bullets vs asteroids; damages/destroys rocks and emits `ASTEROID_HIT` /
    `ASTEROID_DESTROYED` events.
  - `ship.js` — per-ship fire cooldown.
  - `tick.js` — ships fire forward on the `fire` input (cooldown-gated), bullets
    step, collisions resolve, dead entities are reaped.
  - `world.js` — `bullets` map + `spawnBullet()`.
  - `server/src/room.js` — snapshots now carry a `bullets` array.
- **Client combat rendering + event juice**: bullets drawn from the latest
  snapshot; `ASTEROID_DESTROYED` events spawn expanding destruction rings
  (proves the event → presentation path). `window.__mp.bulletCount()` exposed.

### Tests
- `tests/unit/sim-combat.test.js` — firing/cooldown, bullet motion/despawn,
  bullet↔asteroid collision + destruction, and a full fire-until-destroyed
  integration via `tick()`.
- `tests/qa/12-mp2-ws.spec.js` — client A now also fires; asserts the resulting
  server-authoritative bullets are visible to client B.

## [0.3.0] - 2026-05-27

### Added
- **Asteroids in the shared sim** (`js/sim/asteroid.js`): drifting, rotating
  field hazards that wrap around the arena edges; HP scales with size.
  - `world.js` — `asteroids` map + `nextEntityId` id space for non-player
    entities; `spawnAsteroids(world, count)` (deterministic per seed).
  - `tick.js` — asteroids step each tick alongside ships.
  - `server/src/room.js` — spawns the asteroid field on room creation; snapshots
    now carry an `asteroids` array.
- **Client renders + interpolates asteroids**: the snapshot interpolator is
  generalized (shared `_bracket()` + a new `sampleAsteroids()`), the Canvas2D
  renderer draws rotating rocks, and `window.__mp.asteroidCount()` is exposed.
  This proves the snapshot/interpolation pipeline for non-ship entity types.

### Tests
- `tests/unit/sim-asteroid.test.js` — asteroid step (drift/wrap/rotate) +
  deterministic spawn.
- `tests/unit/mp-netcode.test.js` — asteroid interpolation case added.
- `tests/qa/12-mp2-ws.spec.js` — asserts the asteroid field reaches both clients.

## [0.2.0] - 2026-05-27

### Added
- **Browser MP client** (`js/mp/`) + entry page (`mp.html`):
  - `net/transport.js` + `net/websocket-transport.js` — client-side `Transport`
    seam and its WebSocket implementation (mirrors the server seam; WebTransport
    deferred).
  - `netcode/predictor.js` — client-side prediction + reconciliation for the
    local ship (runs the shared `js/sim` step locally, replays unacked inputs
    against each authoritative snapshot).
  - `netcode/interpolator.js` — buffered snapshot interpolation for remote
    ships (renders ~100 ms in the past, lerps between bracketing snapshots).
  - `mp-input.js` — keyboard + mouse capture mapped to world-space aim.
  - `mp-renderer.js` — minimal Canvas2D visualization (local predicted ship +
    interpolated remote ships in a shared arena).
  - `mp-main.js` — bootstrap + fixed-timestep loop (predict + stream input at
    sim rate, render at rAF), with a `window.__mp` debug/test hook.

### Tests
- `tests/unit/mp-netcode.test.js` — prediction/reconciliation + interpolation
  (headless).
- `tests/qa/12-mp2-ws.spec.js` — two-client WebSocket smoke: both clients
  connect, see each other, and input on one propagates through the authoritative
  server to the other's interpolated view (spawns the MP server itself).

### Notes
- Root `package.json` dev scripts and `README.md` structure updates are
  intentionally **deferred** while sharing the `master` branch with the
  concurrent looter-pivot agent (avoids edit collisions on shared files). The MP
  server runs via `cd server && npm start`; the client is served by the existing
  `npm run dev` at `/mp.html`.

## [0.1.0] - 2026-05-27

### Added
- **Shared headless sim** (`js/sim/`): pure-JS simulation core with no browser
  dependencies, importable by both the Node server and the browser client.
  - `constants.js` — sim constants mirrored from single-player (60 Hz tick,
    ship thrust/friction/max-velocity, arena bounds).
  - `rng.js` — seeded mulberry32 PRNG (per-room reproducibility).
  - `ship.js` — faithful headless port of single-player ship physics
    (thrust → friction → snap → clamp → integrate → damped boundary bounce).
  - `world.js` / `tick.js` / `events.js` — world state container, one-step
    `tick(world, inputs) → events`, and the semantic event stream.
  - `protocol.js` / `codec.js` — shared wire protocol (`WIRE_VERSION 1`) and the
    JSON codec seam (binary swap deferred to a single file).
- **Node.js authoritative server** (`server/`): WebSocket transport behind a
  swappable `Transport` seam (WebTransport deferred to a later phase).
  - `transport/transport.js` + `transport/websocket.js` — the seam and its first
    (`ws`-based) implementation, with a `GET /healthz` liveness endpoint.
  - `room.js` — fixed 60 Hz tick loop: gather inputs → `tick()` → broadcast
    Snapshot (+ Event frame).
  - `room-manager.js` — single shared "default" room (multi-room matchmaking
    deferred to Phase 7).
  - `index.js` — Hello → join → Input loop → leave handshake.

### Notes
- This release is server + sim foundation only; the browser MP client, netcode
  (prediction/interpolation/reconciliation), and co-op systems land in
  subsequent versions. See
  `docs/Multiplayer — Node.js Headless Server Implementation Plan – 2026-05-27.md`.
