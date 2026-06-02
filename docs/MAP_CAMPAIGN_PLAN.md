# Rainboids — Map Campaign Overhaul (v11.0.0)

Ground-up restructure: rip out elemental/attunement/draft/wave systems, replace
the single bounded arena with a **Campaign** that cycles through self-contained
**map encounters** connected by exit portals, and re-render every entity as
glowing 3D wireframe geometry.

## Design decisions (locked with user)
- **Flow:** continuous Campaign — clear a map → an EXIT PORTAL spawns → touch it
  → warp to the next map in the cycle. Built to grow (more maps/variants later).
- **Open arena KEPT** as the `CHAOS` map: a few waves of fully-randomized enemies
  + asteroids (pure chaos), then portal.
- **Wireframe look:** glowing rainbow edges over a faint dark translucent fill
  (Tron/vector style; readable). Reuses the asteroid 3D projection.

## Map types
1. **CHAOS** — original 1920×1080 arena; N randomized chaos waves → portal.
2. **DUNGEON** — 4× world (3840×2160); procedural glowing labyrinth (rooms +
   corridors); enemies distributed through rooms; portal in the far room;
   wall-aware AI (context-steering danger from walls). Clear path / reach portal.
3. **ASSAULT** — vertical shmup (Galaga): player moves side-to-side + up/down in a
   bottom band, shoots upward; enemies descend in formations with attack patterns.
   Clear K formations → portal.
4. **SIEGE** — radial tower-defense: player anchored near center; enemies converge
   from all sides in rings. Survive/clear K rings → portal.

## Execution order (dependencies first)
- **P1 — Simplify damage:** elementless hits (KINETIC only), no status effects.
  Keep crit + passive damage mult + flat armor + enemy shields. Remove resist/
  corrode/conduct/purge/adaptive/matchup/status-reactions/status-ticking.
- **P2 — Remove drafts:** delete draft-data / draft-engine / card-draft /
  draft-overlay + integration. KEEP powerup.js & spawning/collection intact.
- **P3 — Remove wave progression:** neutralize the 50-wave campaign + difficulty
  director gating; repurpose spawn helpers (warp-in, formations, leveled spawns).
- **P4 — 3D wireframe renderer:** `render/mesh3d.js` (generalized asteroid
  projection) + `render/entity-meshes.js` (player + every enemy + bullet meshes);
  route entity `.draw()` through it.
- **P5 — Map system:** `world/map/world-map.js` (geometry/walls/collision/render),
  `world/map/dungeon-generator.js`, `world/map/map-modes.js`,
  `world/map/mode-manager.js`, `world/map/portal.js`; wire into game-engine; map
  cycle + portal transitions.
- **P6 — Boot smoke-test, VERSION/CHANGELOG/README, single massive commit.**

## Keep / Remove
- KEEP: powerups (code), weapons, abilities, passives (non-elemental ones stay
  functional/inert), starfield+nebula, camera, pooling, enemy AI + steering,
  formations, warp-in.
- REMOVE: elements, attunements, status effects, draft cards, 50-wave campaign,
  wave HUD/missions, difficulty director gating tied to waves.
