# Rainboids — Implementation Plan (post-9.0.0 board)

**Rebased 2026-05-30** onto the **9.0.0 "Back to Basics"** reboot. The previous
board tracked the pre-reboot game — CD combat-depth, player abilities, passives,
SP-stats, XP/leveling, the inventory/gear/ARMORY economy, and the PWR adaptive
difficulty director. **9.0.0 deleted all of those systems**, so that board is
fully superseded. It is recoverable via `git log -p -- Plans.md` if any detail is
needed. This file tracks open work for the **rebooted** game only.

Shipped history → `CHANGELOG.md`. Versioning/changelog discipline per `CLAUDE.md`
(every separable solo change = its own semver bump).

---

## What the rebooted game is (context for all tasks)

A solo survival roguelite. The run loop:

1. **New-game picker** (`ui/newgame-overlay.js`) — pick a primary weapon + a power
   weapon, START. No unlocks; everything is free.
2. **Endless waves** — death is the only finish line. Wave configs and the
   10-boss roster (`enemy/bosses/`) **cycle forever** (stage 11 → boss 1, …).
3. **Between-wave draft** (`ui/draft-overlay.js`, `combat/draft-engine.js`,
   `combat/draft-data.js`) — after each wave clear, choose **OFFENSE** or
   **DEFENSE**, then 1 of 3 cards. All boons land in the `player.powerups` stack.
   - OFFENSE: per-weapon traits (multishot/rapid/pierce/big/homing/explosive),
     global crit + crit-dmg, and **elemental attunements** (Pyro/Cryo/Volt/Toxic/
     Void/Radiant), each of which opens a 4-card upgrade line in later drafts.
   - DEFENSE: +life, +regen, +vampirism, +toughness (DR), +move speed.

All in-run power comes from boons; there is no inventory, gear, leveling, or
player abilities. SHIFT-dash survives as a movement primitive only.

---

## Open work — prioritized

### P-BOSS — Massive maneuver-around boss redesign  *(IN PROGRESS — Aegis prototype shipped 9.2.0)*
Full design + per-boss task plan: `docs/Boss Redesign — Massive Maneuver-Around Bosses – 2026-05-30.md`.
Goal: screen-filling bosses you fly *around* — distinct silhouettes, anatomy weak
points, **no element gating**. **Shipped (9.2.0):** dynamic-framing camera + enlarged
arenas (FND-1/2/3), per-boss `draw`-hook architecture + shared `boss-gfx` (FND-5),
and **THE AEGIS** fully reworked (tracking dome / rear-only reactor / 3-phase
shed-to-brawler / shield-bash / custom render) — debug-spawnable via `?debug=1`.
**Remaining:** FND-4 boss-recenter on arena-grow; Aegis follow-ups (Petal-Storm +
Quake-Slam attacks, mobile device tuning); then redesign the other 9 bosses in
stage order (Harbinger, Lumen, Gemini, Maelstrom, Hivemother, Iron Throne, Warden
Prime, Nullmaw, Prismarch) per the doc's per-boss task template.

### P0 — 9.0.0 cleanup tail  *(LARGELY DONE — committed 9.0.1→9.1.1)*
The reboot's 12 blocks (A–L) + the version cut are done. The dead-system modules
(inventory / item-system / abilities / passives / sp-stats / defense-data + the
armory/inventory/loadout/stats/sp-allocation overlays + item-card) are now
**deleted** and the `?debug=1` DEBUG boss menu shipped (committed 9.0.1→9.1.1).
**Possible remainders:** CLN-1 (skins decision) + CLN-2 (HANGAR orphans) — verify.

| ID | Area | DOES |
|----|------|------|
| CLN-1 | `player/skins/` (16 files) + `renderer.js` / `player.js` / `core/constants.js` / `game-state.js` wiring | **Skins decision.** Block K removed the title-screen skin *picker*, but the whole skin subsystem is still wired. Decide: (a) keep one default skin silently, deleting picker/cycle plumbing, or (b) rip skins out entirely. Largest remaining dangling subsystem. **Needs a design call.** |
| CLN-2 | `HANGAR` refs across 7 files (`main.js`, `gamepad-handler.js`, `game-engine.js`, `core/constants.js`, `game-state.js`, `player.js`, `hud/overlays.js`) | Confirm the title-screen HANGAR removal (Block K) left no orphaned state/handlers/keybinds; remove dead ones. |
| CLN-3 | dead-ref sweep across `js/modules/` | Audit remaining references to removed systems. **Distinguish deliberate no-op stubs that must STAY** (`hasPassive()→false`, `equipItem`→no-op, `getItemAffixTotal()→0`, `addXp`/`allocateSp` no-ops — these intentionally sever without rewriting every call site) from genuinely dead UI/code to delete. |
| CLN-4 | HUD / UI surfaces | Verify no orphaned HUD elements or menu tabs still point at deleted systems (inventory/gear/ARMORY/SP-grid/ability-bar/XP-bar/threat-meter). Several were removed across Blocks D/F/L + cleanup; sweep for stragglers. |

### P1 — Test-suite re-baseline
The 9.0.0 rip-out invalidated large parts of the suite (≈61 of 98 unit files
reference player abilities / passives / inventory / SP — though some "ability"
matches are *enemy* abilities, which survive). **Audit, then re-baseline:** delete
tests for deleted systems, fix tests for changed systems, add coverage for the new
draft/endless/new-game-picker flows. Until this lands, "suite green" is meaningless.

| ID | Area | DOES |
|----|------|------|
| TST-1 | `tests/unit/` | Triage 98 unit files: keep / fix / delete. Remove specs for inventory/gear/SP-stats/player-abilities/passives/leveling. |
| TST-2 | `tests/qa/`, `tests/e2e/` | Same triage for Playwright; the BUILD/ARMORY/SHOP/SP-allocation specs target deleted UI. |
| TST-3 | NEW specs | Cover the reboot core: new-game picker round-trip, draft offer/pick → boon applied, attunement opens its upgrade line, endless wave + boss-cycle, `cheats.autoDraft`. |

### P2 — Draft system depth & balance
The draft data (`combat/draft-data.js`) is rich — 8 offense powerups, 6
attunements, 24 attunement-upgrade cards, 5 defense cards. Open questions:

| ID | Area | DOES |
|----|------|------|
| DRF-1 | `combat/draft-engine.js` + data | Verify the full pipeline end-to-end: attunement-upgrade cards (`ATT_<EL>_*`) actually enter the offense roll once an element is attuned, and each upgrade's effect is read live (several are described in data but need a wired consumer — e.g. Wildfire spread, Shatter explosion, Void Implosion). Audit which upgrades are inert. |
| DRF-2 | balance | Boon stacking economy: per-card `maxStacks` + draft cadence vs. endless scaling. Needs playtest/AI-survival once the suite is re-baselined. |
| DRF-3 | content breadth | Draft variety can feel thin in long runs (3 categories of cards). Consider rare/keystone cards, weapon-evolution boons, or cross-element synergy cards. Design-gated. |

### P3 — Endless-mode tuning
Endless replaced the fixed 10×N structure. Open: wave-difficulty scaling past the
authored configs, boss-cycle pacing (every 10 stages, roster repeats), and reward/
draft generosity vs. escalating threat. Playtest-gated; depends on P1 for tooling.

### P4 — Enemy roster breadth  *(carried from pre-reboot — still relevant)*
Enemies survived the reboot; these roster items are still valid content work.

| ID | Area | DOES |
|----|------|------|
| ENMY-1 | `enemy/enemy-data.js` + AI | Remaining designed types not yet built: **Beacon**; artillery/controller batch (Pyrewing / Hailmother / Storm-Diver / Bile-Mortar / Singularity-Mite) — need designs. |
| ENMY-2 | per-type AI modules | Distinct movement/attack AI for the newer types (several still use generic chase/keep-distance) — feel-polish, better with the user's eye. |
| ENMY-3 | NEW elite variant | Elite = stat-bumped/affixed variant on non-boss waves with a visual tag; fits the endless composer idea. |

### P5 — Wave composer  *(carried — design-gap, higher value now that waves are endless)*
NEW `wave/wave-composer.js`: procedural roster + telegraphed modifiers + elite
injection, replacing static `WAVE_DATA` cycling. The "right" long-term home for
endless variety. High-risk; sequence after P1/P3.

### P6 — Mobile & UI polish  *(carried — survives reboot, minus the deleted Co-Pilot ability-casting)*
| ID | Area | DOES |
|----|------|------|
| MOB-1 | `mobile-touch.js` / camera | Ship-under-finger offset (~50px above touch); mobile camera-zoom tuning (portrait/landscape). Device-gated. |
| MOB-2 | `hud/combat.js` | Canvas-space damage numbers readable at mobile zoom. |
| UI-1 | `css/styles.css` + overlays | New-game picker + draft-overlay polish: spacing/contrast/responsive, mobile single-column, momentum scroll. Subjective — better with the user's eye. |

### P7 — Docs sync
README + CLAUDE.md project-structure sections should reflect the reboot (deleted
`multiplayer/`, inventory/ARMORY/SP UI; new `combat/draft-*`, `ui/newgame-overlay`,
`ui/draft-overlay`). Per `CLAUDE.md`, structural changes are a blocking README step.

---

## Notes
- **SOLO only.** MP (`server/`, `js/mp/`, `mp.html`) versions independently
  (`VERSION-MP` / `CHANGELOG-MP.md`) — do NOT fold MP work into this board.
- The pre-reboot dispatch board (BOSS/ENMY/SKILL/ITEM/META/RUN/UI/CD domains,
  FIX + DIR + CD tracks) lives in this file's git history; nearly all of it was
  invalidated by 9.0.0. Don't resurrect deleted-system tasks without a design call.
