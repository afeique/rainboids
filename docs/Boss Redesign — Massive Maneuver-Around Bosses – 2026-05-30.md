# Boss Redesign — Massive Maneuver-Around Bosses

**Date:** 2026-05-30 · **Target:** solo (9.0.x → 9.1.0+) · **Status:** design + implementation plan; Aegis = first vertical-slice prototype.

Supersedes the current modular-boss *visual* model (one generic `drawModularBoss` disc + orbiting circles, element-gated damage). The mechanics chassis (`boss-phases.js`, `boss-parts.js`, `boss-intro.js`, `boss-rage.js`, `boss-healthbar.js`, the descriptor registry in `bosses/index.js`) is **kept and extended** — we are replacing the *rendering* and *fight design*, not the spawn/phase/part scaffolding.

---

## 1 · Why / what changes

The 10 bosses currently look near-identical: a tinted disc ringed by uniform circles, differentiated only by element-color + size + node-count. Several share a color (3× steel-blue, 2–3× void-purple). All personality lives in data labels, none on screen. And damage is element-gated ("weak to X / resists Y"), which the reboot's draft economy makes feel arbitrary.

**The redesign, in one line:** every boss becomes a **screen-filling structure you fly *around*, with a unique silhouette, anatomy-based weak points, distinct attack types, and zero element gating.**

### The five global pillars (apply to ALL bosses)

1. **Screen-filling scale.** Each boss is a large multi-part *body* that dominates the arena. The fight is navigating *around / through / behind* it, not strafing a dot. Enabled by the **dynamic-framing camera + enlarged boss arenas** (§2).
2. **Anatomy weak points with *timing*.** Not always-open orbiting circles — vents that open when it fires, an eye exposed only mid-blink, a reactor behind a rotating shield, batteries silenced one by one. Vulnerability is a **window you earn** by positioning or baiting an attack.
3. **No element locks — at all.** Damage is universal. No boss is immune/weak to any element. Attunement boons still help via raw damage + status procs, but every old elemental puzzle is replaced by a **positional / timing / pattern** puzzle. (Biggest reinvention: Aegis, Gemini, Iron Throne, Warden Prime, Prismarch.)
4. **Phases are transformations.** The boss *visibly changes shape* — sheds armor, splits, turns inside-out, fractures — not "same ring, fewer nodes."
5. **Distinct challenge *types*.** Each boss tests a different skill so the roster never repeats itself: positioning, pattern-reading, dual-tracking, environmental, crowd-control, siege, stealth/line-of-sight, resource/timing, marathon.

---

## 2 · Camera & Arena System (shared foundation — build FIRST)

Both levers already exist in-engine, so this is low-risk:
- `camera = { x, y, zoom }` follows the player; **every consumer already honors `zoom`** — render transform, `screenToWorldCoordinates`, `isEntityOnScreen`, `getVisibleStars`, and the camera→field clamp (`visW = width/zoom`). Mobile already ships zoom-out (portrait 0.78 / landscape 0.88).
- Arena = `gameField` (`FIELD_WIDTH 1920 × FIELD_HEIGHT 1080`), camera scrolls within it and clamps to edges. `starfieldRenderer.setFieldSize(w,h)` is already called at runtime, so **resizing the field per wave is a supported operation.**

### 2.1 Dynamic framing zoom
A `world/boss-camera.js` helper computes a **target zoom from player↔boss distance** so the camera breathes:
- **Far from the boss (repositioning / reading the whole body):** ease toward `BOSS_ZOOM_MIN` (more overview).
- **Close to the boss (threading a tight bullet pattern):** ease toward `1.0` (full dodge fidelity).
- Map distance→zoom with a smoothstep over `[nearR, farR]`, then **ease the actual `camera.zoom` toward the target** (small per-frame lerp, e.g. `0.04`) so it never snaps.
- Desktop band: `BOSS_ZOOM_MIN ≈ 0.72`, `BOSS_ZOOM_MAX = 1.0`. Non-boss play stays `1.0`.

### 2.2 Boss-arena enlargement
On a boss wave, grow `gameField` to `~2.5× area` (e.g. `3000 × 1700`) + `setFieldSize`, then restore to default when the boss dies / next normal wave. Gives room to fly *around* a giant body and room for the camera to pull back. Re-center spawn + nebula generation to the new field.

### 2.3 Mobile zoom clamping (do NOT stack into oblivion)
Mobile already runs 0.78/0.88. Boss-zoom must **compose-but-clamp**, never multiply blindly:
```
effectiveZoom = clamp(basePlatformZoom * bossFramingFactor,
                      MIN_EFFECTIVE_ZOOM /* e.g. 0.62 */, 1.0)
```
On mobile, `bossFramingFactor` is much gentler (target floor ~0.88–0.92 effective) so the ship never becomes a speck on a small screen. Desktop uses the full band.

### 2.4 Ship-size guardrail
A **minimum on-screen ship radius** floor so no future aggressive zoom can shrink the ship below readability — clamp the effective zoom up if the rendered ship would fall under the floor.

**Foundation tasks** → §6 (FND-1..6).

---

## 3 · Rendering & VFX language (make them *epic*)

Each boss gets its **own renderer module** under `enemy/bosses/render/<boss>-render.js`, registered via a per-descriptor `draw(ctx, boss, dt)` hook (replacing the single generic `drawModularBoss`; the generic stays as a fallback). Shared helpers live in `enemy/bosses/render/boss-gfx.js`.

**The three-canvas system** (glCanvas / gameCanvas / bulletCanvas, per-canvas bloom): bosses draw their body on the **game canvas**; their bullets/beams go on the **bullet canvas** (so bloom hits them); ambient glows can ride the gl/background layer.

### Shared visual toolkit (`boss-gfx.js`)
- **Layered radial gradients** for cores/glows: dark inner well → saturated mid → bright rim → additive halo (`globalCompositeOperation = 'lighter'`).
- **Linear/conic gradients** for armor panels, beams, energy bridges (metal sheen, plasma).
- **Pulsing/breathing** driven by `boss._now`-based sine (faster + stronger when `_enraged`).
- **Particle emitters** (reuse the existing particle pools): per-boss ambient emitters (embers, frost motes, static sparks, spores, debris), impact bursts on weak-point hits, and **phase-transition explosions** (shockwave ring + radial particle blast + screen-flash).
- **Telegraph visual grammar (consistent across bosses so players learn it):** wind-up = brightening + a growing translucent shape over the danger zone; commit = snap-flash + the attack. Beams pre-draw a thin "sight line" before firing.
- **Weak-point feedback:** exposed = bright pulsing rim + particle wisp; shielded/closed = dim + desaturated; on-hit = white flash + spark burst + HP-arc tick; on-destroy = bright pop + debris + brief slow-mo/hitstop.
- **Damage/heat state:** the body visibly "heats up" and accumulates cracks/scorch as phases advance.

Each boss design below specifies its **palette, silhouette construction, animated elements, and signature particle FX**.

---

## 4 · The 10 boss designs

> Format per boss: **Silhouette / render** · **Scale & maneuvering** · **Weak points** · **Attacks** (telegraph → effect) · **Phase transforms** · **Hook**. Stage order = difficulty/complexity escalation. Roster cycles endlessly past stage 10.

### Stage 1 · HARBINGER — the waking siege-hulk *(intro to maneuvering)*
- **Silhouette / render:** A screen-tall derelict dreadnought-blade — a long angular iron monolith. Brushed-steel linear-gradient hull (`#2a3340`→`#6b7787`→`#aebed4` rim), dormant until it "boots": seams ignite with a hot amber-white gradient (`#ffd27a`→`#fff6e0`) that pulses. Ambient: faint drifting dust + cold-blue rim light. Boot-up = cascading seam-ignition sweep + ember particles.
- **Scale & maneuvering:** A wall you orbit; you only see part of it at once, circling to find lit seams.
- **Weak points:** Sequential **hull seams** that crack open (amber glow + heat-shimmer) — they light in sequence, walking you around the hull.
- **Attacks:** *Searchlight Sweep* (a slow rotating cone-beam, soft white gradient — fly behind it) · *Port Volley* (hull cannons fire a rideable wave) · *Lunge* (telegraph: hull glows + recoil shudder → rams forward across the arena).
- **Phase transforms:** Low HP → hull **cracks down the spine and splits into two halves** (debris + shockwave) that pincer, exposing a molten reactor between them (bright radial-gradient core + ember fountain).
- **Hook:** Honest "fly around the giant, hit the lit seams, dodge the lunge."

### Stage 2 · AEGIS — the rotating bastion *(positional / get-behind-it)* — **PROTOTYPE**
- **Silhouette / render:** An enormous interlocking **shield-dome** — 6–8 overlapping armored petals around a central reactor, slowly rotating. Petals = beveled metal with a conic-gradient sheen (`#3a4250`→`#8e9bb0`→`#dfe7f0` highlight) + rivet detail + a faint energy seam between them. Reactor-back = a deep radial-gradient well (`#101826`→`#2b6cff`→`#aee1ff`) that pulses; brightens as the shield thins. Ambient: a slow rotating ring of shield-spark motes; an additive "force-field" shimmer over the closed face.
- **Scale & maneuvering:** The **shield-face is invulnerable and always aimed at you.** Fly *around* to its exposed **reactor-back** — and because it rotates, the safe angle constantly moves, so you orbit to stay behind it. *(Replaces "Toxic bypasses armor" — pure positioning.)*
- **Weak points:** The **reactor-back** (open arc opposite the shield-face) + **petal hinges** (snipe to briefly lock rotation, widening the back window). Hinge-hit = spark burst; reactor-hit = bright pulse + plasma wisp.
- **Attacks:** *Shield-Bash Shockwave* (telegraph: petals retract & glow → a radial ring you dash through) · *Petal Storm* (flings its armor plates as tumbling projectiles, then is briefly bare *all around* — burst window) · *Quake Slam* (ground-telegraph circle → AoE).
- **Phase transforms:** P1→P2 sheds outer petals (debris + ring shock). **P3: sheds the shield entirely**, exposed reactor-core becomes a fast aggressive brawler that charges — body now a raw molten reactor with violent ember/plasma particle output.
- **Hook:** A geometry of cover — out-position the shield, don't out-DPS it.

### Stage 3 · LUMEN — the cathedral lens-array *(pattern-reading / beam geometry)*
- **Silhouette / render:** A vast unfolding **halo of mirror-panels** — a stained-glass solar angel. Central lens = a brilliant radial bloom (`#fff6c0` core → `#ffd23a` → additive white halo). Mirror panels = semi-transparent prismatic quads with a rainbow-edge refraction gradient. Ambient: drifting light-motes + lens-flare streaks. Beams = bright thin gradient lines with additive glow on the bullet canvas.
- **Scale & maneuvering:** Deploys **giant mirror panels around the arena**; beams bounce *between* them into a lattice. You thread the gaps in the reflected web.
- **Weak points:** The **central lens** (open only between firings) + the **mirror panels** (break to collapse the web). Panel-break = glass-shatter particle spray (prismatic shards).
- **Attacks:** *Refraction Lattice* (beams ricochet off panels — dodge the bounce, not the source; pre-drawn faint sight-lines) · *Magnifier* (a slow tracking focus-beam, widening hot cone) · *Blinding Flash* (screen whites out as a bullet wave arrives — memorize it).
- **Phase transforms:** Panels reconfigure into a tighter **kaleidoscope**; the lens splits into 3 co-firing sub-lenses (each its own bloom).
- **Hook:** A light-geometry puzzle — read reflected beams, not raw damage.

### Stage 4 · GEMINI — the tethered twins *(dual-tracking + sweeping hazard)*
- **Silhouette / render:** Two massive co-orbiting bodies — a **black star and a white star** (negative-space void radial vs. brilliant white-gold radial) joined by a crackling **energy bridge** (animated plasma gradient, lightning filaments) that whips across the whole screen. *(No fire/ice — twins differ by **behavior**: one fires bullets, one lays control-zones.)*
- **Scale & maneuvering:** The **tether is a giant moving beam** sweeping the arena — duck under/over it while weaving between the two big bodies.
- **Weak points:** Each twin's **core**; they're **health-linked** — bring one low and the other *revives* it unless you down **both within a short window**. *(Replaces "kill one buffs the other" — a coordination check, no element.)*
- **Attacks:** *Tether Sweep* (the rotating bridge) · *Crossfire* (interlocking patterns; safe spots are where neither covers) · *Collision Charge* (both rush toward each other through your position — bright trails + impact shock).
- **Phase transforms:** They **merge into one larger combined titan** (eclipse-disc, corona) for the final form, or fracture into four lesser stars.
- **Hook:** Two targets, one tether, "down them together."

### Stage 5 · MAELSTROM — the living vortex *(environmental / fight the arena)*
- **Silhouette / render:** A screen-filling **storm spiral** — the boss *is* the weather: enormous rotating arms of debris + lightning around a central **eye**. Arms = layered conic/spiral gradients (`#1a1030`→`#6a3ad0`→`#c89bff`) with embedded lightning sparks; eye = a calm dark radial with a bright iris. Ambient: swirling debris particles dragged along the spiral; arc-flash bursts. The whole field tints stormy.
- **Scale & maneuvering:** The arena **rotates and pulls** — a current drags you around the spiral; you **fight the current** to push inward to the eye, navigating the sweeping arms.
- **Weak points:** The **central eye** (open periodically) + **storm-nodes** on the arms (destroy to weaken the pull).
- **Attacks:** *Undertow* (the constant pull) · *Strike Markers* (telegraphed lightning ground-circles → bolts) · *Centrifuge* (debris flung outward in spiral bullet-streams) · *Eye of the Storm* (eye opens, calm → radial burst).
- **Phase transforms:** Spiral tightens, **current reverses**, a second eye opens on the far side — two currents.
- **Hook:** You fight the arena itself; landing a hit is the achievement.

### Stage 6 · HIVEMOTHER — the brood leviathan *(crowd-control / attrition)*
- **Silhouette / render:** A gargantuan biomechanical **queen** sprawling corner-to-corner — segmented, *breathing*, translucent **egg-chambers** with larvae visibly squirming (animated sub-sprites inside a green sub-surface-scatter gradient `#1a3a14`→`#88ff44`→`#d6ffb0`). Ambient: drifting spores, pulsing bioluminescence, chitin sheen. Spawns trail glistening slime.
- **Scale & maneuvering:** Body sprawls across the screen; fly between her limbs/antennae while a continuous swarm body-blocks you.
- **Weak points:** **Egg-chambers** (destroy → stop spawns *and* peel back to the **heart**) + her **mouth** when winding up to vomit a wave. Chamber-burst = chunky organic splatter + larvae scatter.
- **Attacks:** *Devour Bite* (sweeping snap across her front) · *Acid Founts* (damage zones — pure hazard, no element gate) · *Body-Block Swarm* (adds that crowd you against her bulk) · *Birth Surge* (briefly a hatch-factory — burst the chamber or drown).
- **Phase transforms:** **Sheds her carapace** into a faster, leaner predator; final phase = a skeletal frame frantically birthing.
- **Hook:** Attrition around a giant living thing — silence the spawners or be swarmed.

### Stage 7 · IRON THRONE — the siege-citadel & its king *(multi-stage assault)*
- **Silhouette / render:** A colossal walking **fortress-ziggurat** bristling with gun batteries, banners, and an armored **king enthroned** at its peak. Tiers = stacked metal with warm torch-glow accents + heraldic banner cloth (animated wave). Batteries = barrel clusters with muzzle-heat gradients. King = a small bright figure (royal-gold radial) on a throne. Ambient: floating ash, banner sway, muzzle smoke. *(The old four-element turret lock is gone entirely.)*
- **Scale & maneuvering:** You **assault a fortress** — fly around its tiers, weave overlapping battery fire, climb toward the throne.
- **Weak points:** Multiple **gun batteries** (each a positional mini-fight: one fires only at range, one only up close, one tracks — bait & circle) → **power conduits** → the **king himself** once the guns fall.
- **Attacks:** *Artillery Barrage* (mortar ground-telegraphs → shells) · *Bastion Cannon* (giant screen-crossing beam, long wind-up) · *Decree* (summons elite guards) · the king's personal blade-and-bullet attacks once exposed.
- **Phase transforms:** As batteries fall the fortress **lists & crumbles** (tilting, falling debris); finale = the **king leaps off the throne** and duels you amid the wreckage.
- **Hook:** Dismantle a fortress by positioning, then a one-on-one duel — no keys, just siege-craft.

### Stage 8 · WARDEN PRIME — the panopticon *(stealth / line-of-sight / it predicts you)*
- **Silhouette / render:** A massive armored **all-seeing eye-ring** — a flying prison-sentinel with a rotating iris and a halo of smaller watcher-lenses. Iris = layered radial (`#0a0a12`→`#cfa8ff`→bright scan-white) with a moving pupil; armored ring = dark plating with violet seams. Scan = a tracking cone of translucent violet light. Ambient: slow orbiting watcher-lenses, scan-line sweeps, surveillance shimmer. *(The "adapts to your element" gimmick is gone.)*
- **Scale & maneuvering:** It **watches you** — its gaze is a tracking danger-cone; **break line-of-sight** using its own huge body/structures as cover, circling out of view.
- **Weak points:** The **central iris** (vulnerable only when **blinking / recharging a scan**) + the **watcher-lenses** (extend its sightlines — destroy to blind it).
- **Adaptive — by *movement*, not element:** it **learns your dodge habits and pre-fires your usual spots**, and **hardens the facet you attack most**, forcing you to keep circling to fresh angles.
- **Attacks:** *Scan-Laser* (sweeps to your *predicted* position) · *Prison Bars* (zone-walls shrinking your space) · *Lockdown* (radial closing pattern) · *Watcher Crossfire*.
- **Phase transforms:** The eye **fractures into several smaller eyes that surround you** — a 360° sightline gauntlet.
- **Hook:** Stay out of the gaze, and stay *unpredictable* — it reads you.

### Stage 9 · NULLMAW — the devourer leviathan *(anti-DPS / gravity survival)*
- **Silhouette / render:** A cosmic **void-whale maw** engulfing a huge swath of screen when open — teeth like terrain, an event-horizon throat. Maw interior = a deep void radial (`#05030f`→`#3a1d6e`→`#7744dd`) with a swirling accretion ring; teeth = jagged dark shapes with bone-pale rim light; throat-core = a pulsing singularity. Ambient: matter pulled inward in streaks, gravitational lensing shimmer, void-spark motes. *(Keeps the "eats your bullets" idea — never element-bound.)*
- **Scale & maneuvering:** It **pulls you toward the maw**; fight gravity to avoid being swallowed, weave between **giant teeth**, strike only in the right window.
- **Weak points:** The **throat-core** (exposed when the maw is **open & roaring, not eating**) + **teeth** (break for safe footing).
- **Attacks:** *Devour Cone* (opens, **absorbs your shots — and feeding it hardens its shield**, so spamming an open maw is the trap; beams/melee bypass) · *Inhale* (pull + a swallow-zone) · *Tooth-Spit* (flings broken teeth as bullets) · *Full Devour* (lunges, eats a chunk of arena).
- **Phase transforms:** Turns **inside-out into a four-jaw flower**; final phase = a **throat-tunnel you fly *into*** to shoot the heart from within.
- **Hook:** Don't feed it — bait the open-roar window; the only boss that punishes mashing fire.

### Stage 10 · PRISMARCH / OMEGA — the transforming god-machine *(the finale marathon)*
- **Silhouette / render:** The largest boss — a screen-dominating **prismatic colossus** that **reforms into echoes of bosses you've beaten** before settling into its true OMEGA form. Faceted crystalline body with a full-spectrum refraction gradient that shifts hue per form; OMEGA = a blinding multi-core radiant heart. Ambient: prismatic light-shards orbiting, reality-fracture cracks, intense bloom. Every VFX dialed to maximum. *(The seven-element wheel is gone; it remixes the roster instead.)*
- **Scale & maneuvering:** A multi-stage marathon across a constantly **transforming arena** — geometry reshapes under you.
- **Weak points:** Shifting — a different exposed core per form — culminating in a single radiant **heart**.
- **Attacks — a "greatest hits":** recombined patterns from prior bosses (Aegis shield-bash, Lumen beam-lattice, Maelstrom pull, Nullmaw inhale) + its own finale: *Annihilation* (screen-filling sweep, one tiny safe gap to thread) · *Reality Fracture* (the arena shatters into drifting shards you platform between).
- **Phase transforms:** Five escalating forms → **OMEGA**, heart exposed, every pattern at once.
- **Hook:** A culmination testing every skill the run taught — a titan that never stops reshaping.

---

## 5 · Difficulty & challenge-type spread (so the roster never repeats)

| Stage | Boss | Primary challenge type |
|------|------|------------------------|
| 1 | Harbinger | Movement intro — orbit, hit seams, dodge lunge |
| 2 | Aegis | Positioning — get behind the rotating shield |
| 3 | Lumen | Pattern-reading — thread reflected beam geometry |
| 4 | Gemini | Dual-tracking — two targets + sweeping tether |
| 5 | Maelstrom | Environmental — fight the current to the eye |
| 6 | Hivemother | Crowd-control / attrition — kill spawners |
| 7 | Iron Throne | Multi-stage siege — dismantle, then duel |
| 8 | Warden Prime | Stealth / line-of-sight — break the gaze, stay unpredictable |
| 9 | Nullmaw | Resource/timing — anti-DPS + gravity survival |
| 10 | Prismarch | Marathon finale — greatest-hits culmination |

---

## 6 · Implementation plan (bite-sized tasks)

Each task = its own solo semver bump + CHANGELOG entry (per `CLAUDE.md`); keep tests green. **One owner per file.** New files preferred. ⚠ Shared hubs (`game-engine.js`, `enemy.js`, `wave-manager.js`, `static-dom.js`, `ui-manager.js`) → serialize, edit surgically. **Do not start while the 9.0.0-cleanup loop has these files dirty.**

### Track FND — Foundation (camera, arena, render architecture, debug) — **build first**
| ID | File(s) | DOES |
|----|---------|------|
| FND-1 | NEW `world/boss-camera.js` + test | Pure `computeBossFraming({playerPos, bossPos, baseZoom, isMobile})` → target zoom from player↔boss distance (smoothstep over [nearR,farR]); desktop band 0.72–1.0; mobile gentler. Unit-test the band + clamps. |
| FND-2 | `game-engine.js` (camera update) ⚠ | Ease `camera.zoom` toward `computeBossFraming(...)` during boss waves (lerp ~0.04); revert to platform base off-boss. Wire mobile **compose-but-clamp** (`MIN_EFFECTIVE_ZOOM`) + the ship-size guardrail. |
| FND-3 | `core/constants.js` | Add `BOSS_ARENA_SCALE` (~2.5× area), `BOSS_ZOOM_MIN/MAX`, `MIN_EFFECTIVE_ZOOM`, framing radii. |
| FND-4 | `wave/wave-manager.js` ⚠ | On boss-wave enter, grow `gameField` + `setFieldSize` + re-center; restore on boss death / next wave. |
| FND-5 | NEW `enemy/bosses/render/boss-gfx.js` + per-boss `draw` hook in descriptor; `enemy.js` calls `boss.draw?.(ctx,this,dt) ?? drawModularBoss(...)` ⚠ | Render-hook architecture + shared gradient/glow/particle/telegraph/weak-point helpers (§3). Generic renderer stays as fallback. |
| FND-6 | NEW debug panel in `ui/static-dom.js` + handler in `ui/ui-manager.js`/`event-setup.js` ⚠ | **Boss debug menu:** a dev overlay (key-gated) listing all 10 bosses → spawn the selected boss immediately into the current run via `getBossById` + the spawner. Aegis must be reachable here. |

### Per-boss task template (repeat for each of the 10)
1. **`<boss>`-DATA** — rewrite the descriptor (`bosses/<boss>.js`): new parts/anatomy, phase scripts, attack timings, **remove element resist/weakness**, set `draw` hook + arena/scale params.
2. **`<boss>`-RENDER** — NEW `bosses/render/<boss>-render.js`: silhouette construction, gradients/palette (§4), animated elements, ambient + impact + phase-transition particle FX.
3. **`<boss>`-WEAK** — anatomy weak-point logic (open/close timing, positional exposure, hit/destroy feedback).
4. **`<boss>`-ATK-n** — one task *per attack* (telegraph + pattern + dodge solution); small and independently testable.
5. **`<boss>`-PHASE** — phase-transformation visuals + behavior shifts (shed/split/merge/fracture) + transition VFX.
6. **`<boss>`-VFX** — polish pass: bloom tuning, particle density, telegraph legibility, enrage heat-up.
7. **`<boss>`-TEST** — QA: boss spawns via debug menu, all phases reachable, dies cleanly, no console errors; unit-test pure helpers.

### Prototype order (vertical slices)
**Aegis first** — it proves the whole stack (custom-draw hook + a positional/timed weak point + dynamic-framing camera + enlarged arena + debug-spawn) **without needing new bullet systems**. Then iterate boss-by-boss in stage order, reusing FND helpers.

### AEGIS prototype — concrete task list
- **AEG-0** (FND-1..6 prerequisites landed).
- **AEG-DATA** — rewrite `bosses/aegis.js`: 6–8 shield petals (parts) on a rotating ring; reactor-back exposure arc opposite the shield-face; petal-hinge sub-parts; 3 phases (shed petals → shed shield → exposed brawler); **no Toxic-bypass / no resist map**; `draw` hook + `arenaScale`.
- **AEG-RENDER** — `render/aegis-render.js`: beveled conic-gradient petals (`#3a4250→#8e9bb0→#dfe7f0`) + rivets + inter-petal energy seam; reactor radial-well (`#101826→#2b6cff→#aee1ff`) brightening as shield thins; additive force-field shimmer on the closed face; rotating shield-spark mote emitter.
- **AEG-WEAK** — reactor-back damage window (only the rear arc takes damage); hinge-snipe briefly locks rotation (widens window); hit/destroy feedback.
- **AEG-ATK-1** Shield-Bash Shockwave (radial ring, dash-through). **AEG-ATK-2** Petal Storm (flings plates, briefly bare). **AEG-ATK-3** Quake Slam (ground-telegraph AoE).
- **AEG-PHASE** — P1→P2 shed outer petals (debris+ring shock); **P3** shed shield entirely → fast charging reactor-brawler with violent ember/plasma output.
- **AEG-CAMERA** — verify dynamic framing feels right around the giant rotating dome; tune `BOSS_ZOOM_MIN`, arena scale, mobile clamp on a real device.
- **AEG-TEST** — debug-spawn Aegis, walk all 3 phases, confirm get-behind-it loop + camera + no errors.

### Camera/arena starting numbers (Aegis)
- Arena: `gameField → ~3000×1700` on boss waves.
- Desktop boss-zoom band: `0.72`–`1.0`, eased; ~0.5s ease-in on boss entry ("the arena opens up").
- Mobile: gentle framing, **effective-zoom floor ~0.88**, `MIN_EFFECTIVE_ZOOM 0.62` hard clamp.
- Ship-size guardrail: clamp effective zoom up if rendered ship radius < floor.

---

## 7 · Notes / risks
- **Solo only.** Does not touch MP (`server/`, `js/mp/`, `mp.html`).
- **Coordinate with the cleanup loop:** FND-2/4/6 + `enemy.js` are shared hubs the 9.0.0-cleanup loop also edits — land them only on a clean tree.
- **Perf:** screen-filling bosses + heavy particles + zoom-out (more on screen) = watch FPS. Reuse pools; cap particle counts; profile the Aegis slice before scaling to 10.
- **Camera regressions:** dynamic zoom touches a system mobile already depends on — keep desktop=1.0 off-boss, and regression-test mobile portrait/landscape.
