# Rust + Bevy Port Plan — 2026-05-20

The implementation plan for porting the **JavaScript single-player game** to a
native desktop app on **Rust + Bevy**. The decision rationale (why Rust + Bevy
over Kotlin/C#/C++ and the alternative engines) lives in
`Native Port — Language & Engine Comparison – 2026-05-19.md` — read that first for
the *why*; this doc is the *how*.

> **Scope.** Solo game only. No multiplayer, no reuse of the Rust `sim/` crate
> (that's the MP sim; solo is the JS in `js/modules/*`, which is the source of
> truth here).

> **North star.** Beat the web build's graphics decisively — SDF/HDR glow, real
> bloom, GPU particles beyond the 600 cap, zero-GC smoothness at high refresh —
> while faithfully reproducing solo gameplay.

> Per `CLAUDE.md`, this is a planning document — no version/changelog/README bump.

---

## 1. The central challenge: OOP/GC JS → ECS

The hard part of this port is **not** the rendering — it's re-expressing 42
classes of shared-mutable, reference-graph JavaScript as Bevy ECS. The plan
treats this explicitly.

**Mental model translation:**

| JavaScript (today) | Bevy ECS (target) |
|---|---|
| `class Enemy { x,y,vx,vy,hp; update(){…} }` | An **entity** with **components** `[Transform, Velocity, Health, Enemy{kind}, …]` |
| `enemy.update()` method | **Systems** that query `(&mut Transform, &Velocity, &Enemy)` and run each tick |
| `gameEngine.bulletPool` / global refs | **Resources** (`GameState`, `Settings`, `Rng`, `AssetHandles`) |
| `pool.get()` / `pool.release()` | Bevy `commands.spawn()` / `commands.entity(e).despawn()` (Bevy's archetype storage is the pool) |
| event callbacks / direct method calls across entities | **Bevy `Event`s** (`DamageEvent`, `DeathEvent`, `PickupEvent`, `FireEvent`) for decoupling |
| `gameState` string + branching | **Bevy `States`** (`Title`, `Playing`, `Paused`, `Shop`, `GameOver`) + state-scoped systems |
| `requestAnimationFrame` loop | `FixedUpdate` schedule (sim, fixed dt) + `Update` (render/UI, interpolated) |

**Worked example — porting an enemy:**

```text
JS:  js/modules/enemy/<type>.js  (movement + firing + hp in one class)
Rust:
  components: Enemy { kind: EnemyKind }, Health, Velocity, FireCooldown, AiState
  systems (FixedUpdate, only run in Playing state):
    enemy_movement_system   // per-kind steering → writes Velocity
    enemy_fire_system       // per-kind pattern → emits FireEvent
    integrate_system        // Transform += Velocity * dt  (shared by all movers)
  the per-kind branch logic from <type>.js lives in match arms on EnemyKind,
    or in a Component-per-kind + separate systems if the behaviors diverge a lot.
```

**Architecture decision — keep simulation logic Bevy-native, but isolated.**
We do *not* build a separate engine-agnostic `core` crate (it fights ECS).
Instead, all gameplay is Bevy systems, organized so that **simulation systems
(`FixedUpdate`) never touch rendering**, and **presentation systems (`Update`)
never mutate game state**. This keeps logic testable (run schedules headless,
assert on the `World`) without a rendering context.

---

## 2. Workspace & crate layout

The native port needs a home. **Open decision (§11):** a new top-level `native/`
directory in this repo (precedent: MP lives in `multiplayer/`) vs a **separate
repo**. `CLAUDE.md` forbids new top-level dirs without approval — flagged.
Assuming in-repo `native/`:

```
native/
  Cargo.toml                    # workspace
  rainboids-native/
    Cargo.toml
    assets/                     # fonts, baked SFX, sprites, shaders (Bevy asset dir)
      shaders/*.wgsl
      sfx/*.ogg                 # pre-rendered from Web Audio synth
      fonts/*.ttf
    src/
      main.rs                   # App::new(), plugins, run
      app.rs                    # plugin registration, state setup, schedules
      states.rs                 # GameState enum (Bevy States)
      resources.rs              # GameConfig, Score, WaveState, RngRes, Settings
      events.rs                 # DamageEvent, DeathEvent, FireEvent, PickupEvent…
      components/
        mod.rs                  # Health, Velocity, Collider, Lifetime, Faction…
        player.rs               # Ship, Weapon, Skill, Charge, Powerups
        enemy.rs                # Enemy{kind}, AiState, FireCooldown
        projectile.rs           # Bullet{kind}, EnemyBullet, Mine, Missile
        world.rs                # Asteroid, Star, Nebula, Orb, Powerup
      systems/
        input.rs                # devices → Intent component on the ship
        movement.rs             # integrate, ship physics, screen-wrap/bounds
        enemy/                  # per-kind AI + firing (10 files mirroring js/modules/enemy)
        weapons/                # primary + power weapon firing/effects
        collision.rs            # spatial-grid broadphase → CollisionEvent
        damage.rs               # apply DamageEvent, crits, shields, death
        waves.rs                # wave/sub-wave cadence, spawning
        drops.rs                # orbs, powerups, drop tables
        cleanup.rs              # lifetime/offscreen despawn
      render/
        camera.rs               # Camera2d + HDR + Bloom
        silhouettes.rs          # lyon-mesh / SDF material for ships/enemies/asteroids
        particles.rs            # bevy_hanabi effects (explosions, trails, debris)
        bullets.rs              # instanced bullet draw
        starfield.rs            # parallax depth layers
        materials/*.rs          # custom Material2d (SDF, glow)
      audio/
        sfx.rs                  # baked-sample playback (kira)
        music.rs                # streaming + cache
      ui/                       # bevy_ui (or bevy_egui): title, hud, shop, overlays
      save.rs                   # serde save/load to OS config dir
```

**Crate list (initial):**

| Concern | Crate | Notes |
|---|---|---|
| Engine/ECS/render | `bevy` | wgpu, HDR + `Bloom`, `Material2d`, states, `FixedUpdate` |
| GPU particles | `bevy_hanabi` | the standard Bevy GPU particle system; lifts the 600 cap |
| Vector silhouettes | `bevy_prototype_lyon` (+ `lyon`) | port `shapes.js` paths → meshes; glow via emissive + bloom |
| GPU vector (optional) | `bevy_vello` / `vello` | evaluate vs lyon in Phase 2 |
| Audio | `bevy_kira_audio` (`kira`) | mixing, streaming music, sample SFX |
| UI | `bevy_ui` (built-in) or `bevy_egui` | decide in Phase 5 |
| Gamepad | built into Bevy (`gilrs`) | controller support = upside over web |
| Math | `glam` (via bevy) | — |
| Save/serialize | `serde` + `ron` (or `serde_json`) | replaces `localStorage` |
| RNG | `rand` | solo needs no determinism |
| Distribution | `cargo-dist` (+ `cargo-bundle`) | mac/win/linux installers |

Pin to a current Bevy release and let `bevy_hanabi` / `bevy_egui` / lyon versions
follow it (their releases track Bevy). Bevy's churn between minor versions is real
— pin and upgrade deliberately.

---

## 3. Rendering plan (the payoff)

Bevy 2D, HDR-enabled camera, additive glow via bloom. Layer order mirrors the web
build's three canvases via Bevy render layers / z-ordering.

### 3.1 Silhouettes (`shapes.js`, 446 path calls)
- **Primary approach: `bevy_prototype_lyon`.** Port the Canvas2D path commands
  (`moveTo`/`lineTo`/`arc`/`bezier`/`fill`/`stroke`) almost directly into lyon
  path builders → tessellated `Mesh2d`. This is the most *faithful* reproduction
  of authored vector art and the closest to a literal port.
- **Glow** comes from rendering with **emissive (HDR > 1.0) colors** + the
  camera's **`Bloom`** post-process — not per-shape blur. This replaces the web
  build's `shadowBlur` with real bloom.
- **SDF enhancement (optional, glow-critical shapes):** for the few shapes where
  crisp resolution-independent edges + tight inner glow matter most, author a
  custom `Material2d` WGSL SDF. Don't SDF *everything* — arbitrary authored
  silhouettes tessellate more faithfully than they SDF.

### 3.2 Particles (currently WebGL2, 600 cap)
- **`bevy_hanabi`** GPU compute particles. This is where the native build visibly
  exceeds the web build: explosions, embers, debris, trails at 10k–100k particles.
- Port each particle *type* (`js/modules/performance` + particle defs) to a hanabi
  `EffectAsset` (spawn rate, lifetime, color-over-life, size curves, additive
  blend in linear space).

### 3.3 Bullets (currently WebGL2 instanced)
- Instanced `Mesh2d`/sprite draw, or a hanabi effect for bullet trails. Bright
  emissive colors → bloom glow.

### 3.4 Starfield + nebula
- Parallax depth layers as instanced points/sprites on a background render layer;
  port the depth-bucket batching concept directly.

### 3.5 Camera & post
- `Camera2d` with `hdr: true`, a `Bloom` component (tune intensity/threshold to
  match — and exceed — the web glow), optional `Tonemapping`. Room later for
  chromatic aberration / hit-distortion / vignette as custom post passes.

**Phase-0 proof obligation:** one ship + one enemy rendered this way must look
*clearly better* than the web build, side by side, before the logic port scales.

---

## 4. Audio plan

- **SFX (the tricky part).** `audio/sound-defs.js` is 1,593 lines of **procedural
  Web Audio synthesis**. For v1, **pre-render each SFX offline to `.ogg`/`.wav`**
  (a one-time script driving the existing Web Audio graphs in a headless browser /
  Node + `node-web-audio-api`, dumping buffers) and play the samples via `kira`.
  Reimplement the synth natively (`fundsp`/`kira` DSP) later only if baked samples
  lose needed variation.
- **Music.** 389 MB / 73 tracks — don't bundle. Reuse the Electron plan's
  stream-and-cache design (CDN `rainboids.cat.computer/music/<file>.mp3`, disk
  cache in the OS data dir), decoding via `kira`/`symphonia`. Graceful fallback to
  SFX-only if offline.

---

## 5. Input plan

- Bevy input: keyboard + mouse → write an `Intent` component on the ship entity
  each frame (thrust, aim, fire, power, skill, pause). Mirror `input-handler.js`'s
  control mapping.
- **Gamepad** via Bevy's built-in `gilrs` support — a genuine upside over the web
  build (twin-stick feel). Map sticks → move/aim, triggers/bumpers → fire/power.
- Mouse-aim crosshair as a UI/world overlay.

---

## 6. UI plan (the long pole after rendering)

The entire title/HUD/shop/overlays/settings layer is DOM+CSS today. Two options,
decided in Phase 5:
- **`bevy_ui`** (built-in flexbox) — keeps everything in one engine, no extra dep,
  good for the in-world HUD; more verbose for complex layouts.
- **`bevy_egui`** — fastest to build menus/shop/settings; immediate-mode; slightly
  less "game-native" look but very productive.

Likely split: **`bevy_ui` for the in-game HUD** (health/shield/gold, weapon/skill
indicators, popups, wave/level overlays) and **`bevy_egui` for menus + shop +
settings**. Port `hud/`, `ui/`, `shop/` screen by screen. Save/load via `save.rs`
replaces `localStorage`.

---

## 7. Asset strategy

| Asset | Size | Strategy |
|---|---|---|
| Sprites (`sprites/`) | ~2.6 MB | bundle in `assets/` |
| SFX (baked) | small | bundle (pre-rendered `.ogg`) |
| Fonts (Google Fonts today) | small | bundle `.ttf` (Press Start 2P, Silkscreen, Fira Code, Pixelify Sans) |
| Music | 389 MB | stream + cache (CDN), never bundle |
| Shaders | tiny | bundle `.wgsl` |

---

## 8. Phased plan

Each phase has an **exit gate**. Effort = rough solo-dev order of magnitude.

### Phase 0 — Graphics + toolchain spike · ~3–5 d
- Bevy app, `Camera2d` HDR + `Bloom`. One ship + one enemy as lyon-mesh
  silhouettes with emissive glow. One `bevy_hanabi` explosion. A fixed-timestep
  loop moving them.
- **Gate:** side-by-side with the web build it looks **clearly better**; toolchain
  (build, hot-ish reload, asset pipeline) proven. *Go/no-go on the visual payoff.*

### Phase 1 — Core loop in ECS (the go/no-go for Rust) · ~2 wk
- `core/` → resources/events; states (`Title`/`Playing`). Player ship entity:
  movement physics, `Intent` from input. One enemy (DRIFTER) with AI + firing.
  One primary weapon. Spatial-grid broadphase + `CollisionEvent` → `damage.rs`.
- **Gate:** fly, shoot, kill one enemy, take damage, die — a real vertical slice.
  **This is the decision point:** if the JS→ECS re-architecture is painful here,
  fall back to **C# + Veldrid** (per the comparison doc) *before* porting the rest.

### Phase 2 — Full renderer · ~3 wk
- All silhouettes (`shapes.js`), bullet + particle layers (`bevy_hanabi`),
  starfield/nebula, bloom tuning. Evaluate `vello` vs lyon.
- **Gate:** a played wave looks ≥ the web build (target: better).

### Phase 3 — All content · ~3–4 wk
- 10 enemies (port `js/modules/enemy/*`), all primary + power weapons + defense
  skills (`player/`, `combat/`), waves + wave tables (`wave/`), drops/powerups,
  asteroids (splitting, vector projection), shields/spare-ship death parity.
- **Gate:** full wave progression matches web-build behavior (validate against the
  existing E2E scenarios re-expressed as headless Bevy runs).

### Phase 4 — Input + audio · ~1–2 wk
- kb/mouse + gamepad mapping. Baked SFX via kira. Music stream + cache.
- **Gate:** fully playable with sound and a controller.

### Phase 5 — UI · ~2–3 wk
- HUD (`bevy_ui`), menus/shop/settings (`bevy_egui`), overlays, save/load, fonts.
- **Gate:** full loop title → play → shop → death → restart, **zero** web deps.

### Phase 6 — Packaging + distribution · ~3–5 d
- `cargo-dist`: macOS universal (`.app`/`.dmg`, x86_64+aarch64 lipo), Windows
  (`.exe`/installer), Linux (AppImage/`.deb`). Unsigned first (mirror Electron
  plan). CI matrix (3 runners) → GitHub Releases on tag.
- **Gate:** downloadable native binaries on all three platforms.

### Phase 7 — Polish + perf · ongoing
- Frame pacing, vsync modes, exclusive fullscreen, settings, HDR/bloom tuning,
  high-refresh validation; raise particle ambition now that GPU compute allows it.

**Shippable v1 (Phases 0–6): ~3–4 months.** Longer than a GC-language port because
of the ECS re-architecture; the payoff is the top of the graphics ceiling.

---

## 9. Testing strategy

- **Logic unit tests:** spin a minimal `App` with only sim systems + `FixedUpdate`,
  feed inputs/events, run N ticks, assert on `World` (HP, positions, counts).
  Bevy systems are testable headless because sim never touches rendering (§1).
- **Scenario tests:** re-express the existing E2E scenarios (per-enemy kills, wave
  progression, survival) as headless Bevy sim runs.
- **Visual checks:** manual + screenshot diffs vs the web build at Phases 0/2/3
  (no automated pixel-perfect harness; the look is the spec).
- **Distribution smoke:** launch each packaged binary, title renders, play a wave,
  clean exit.

---

## 10. Versioning, docs, hygiene

- New independent product line: **`VERSION-NATIVE`** + **`CHANGELOG-NATIVE.md`**
  (Keep a Changelog), starting `0.1.0`, staying `0.x` while pre-1.0 — mirroring the
  Solo/MP/Desktop pattern in `CLAUDE.md`.
- **`CLAUDE.md` amendment** describing what triggers a native bump (anything under
  `native/`).
- **README** gains a native-port section + project-structure update once code lands.
- Directory hygiene: confirm `native/` (or a separate repo) per §11.

---

## 11. Decisions

**Resolved (2026-05-20):**
- ✅ **Repo location** — a **separate repository** (cleaner isolation; native has a
  wholly different toolchain). Codename TBD (being chosen).
- ✅ **Particle ambition** — **screen-filling 10k–100k** particles via
  `bevy_hanabi`. The full graphics payoff; the whole reason for the port. This
  hard-commits the renderer to GPU-compute particles from Phase 0.

**Still open:**
1. **Repo specifics:** codename / repo slug; GitHub remote now vs local `git init`
   first; visibility (public/private); license (default: mirror the main repo).
   *Needed to create the repo.*
2. **UI toolkit:** `bevy_ui` everywhere, or `bevy_ui` HUD + `bevy_egui` menus
   (recommended). *Needed by Phase 5, not before.*
3. **SFX:** pre-render-to-samples for v1 (recommended) vs native synth. *Needed by
   Phase 4.*
4. **Web relationship:** native eventually *replaces* web solo, or runs in parallel
   (web stays canonical). *Strategic; decide anytime.*

---

## 12. Risks

1. **JS-OOP → ECS re-architecture** (#1). Phase-1 vertical slice is the explicit
   go/no-go; fall back to C# + Veldrid if painful.
2. **Bevy version churn** — pin and upgrade deliberately; `bevy_hanabi`/`bevy_egui`
   must match the Bevy minor.
3. **Procedural SFX fidelity** — baked samples may lose variation; synth reimpl is
   the escape hatch.
4. **Vector-look fidelity** — lyon tessellation + bloom must match/exceed the web
   silhouettes; spike in Phase 0/2.
5. **Rust compile times** — use the `cranelift` dev backend + warm cache to keep
   the inner loop fast over a ~3-month port.
6. **Two solo codebases** — decide replace-vs-parallel (open decision §11.5).

---

## 13. Immediate next steps

1. Resolve §11.1 (repo location) and §11.2 (particle ambition) — both shape Phase 0.
2. Scaffold the Phase-0 spike: Bevy app + HDR/Bloom camera + one lyon-mesh ship +
   one enemy + one hanabi explosion + fixed-timestep movement.
3. Run the Phase-0 visual gate against the web build. Proceed only if it clearly
   wins on graphics.
