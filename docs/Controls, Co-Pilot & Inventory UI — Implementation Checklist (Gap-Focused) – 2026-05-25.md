# Controls, Co-Pilot & Inventory UI — Implementation Checklist (Gap-Focused)

**Status:** Execution checklist — **authoritative for "what's left."**
**Date:** 2026-05-25
**Scope:** Solo (`/`). Bite-sized tasks to finish the gamepad, mobile/AI-Co-Pilot, and items/inventory UI work.

> **Read this before the four design docs.** A code re-baseline (against ~v6.194) found that the *core* of all three efforts is **already implemented**. The design docs (`Controls & UI Overhaul — Master Roadmap`, `Gamepad Controls`, `Mobile Controls — … AI Co-Pilot`, `Items & Inventory UI`) describe many systems as "to build" that already exist. **This checklist supersedes their "implementation phases" sections** — only the tasks below are outstanding. The docs remain useful for *design rationale*.

---

## 0. Re-baseline — what's already DONE (do NOT re-build)

| Capability | Status | Evidence |
|---|---|---|
| Binding registry (`ACTIONS`, layouts) | ✅ DONE | `js/modules/ui/bindings.js` |
| Gamepad: all 4 ability slots, Pro/Classic layouts | ✅ DONE | `bindings.js:57-90`, `gamepad-handler.js:274-326` |
| Gamepad dash = away-from-nearest-threat / steer | ✅ DONE | `player.js:1379-1399` (`_assistDashAngle`→gamepad branch) |
| Unified Assist System (Sense/Decide/Act) | ✅ DONE & wired | `assist-system.js`; ticked at `game-engine.js:3370` |
| 3 assist levels (MANUAL_TOUCH/CO_PILOT/AUTOPILOT) | ✅ DONE | `assist-system.js:3-7` |
| Relative-velocity TTI + homing detection (M2) | ✅ DONE | `assist-system.js:23-48` |
| Landing-position dodge scoring (M3) | ✅ DONE | `assist-system.js:162-195` |
| Split-rate sense: dodge/frame, cast/100ms (M1) | ✅ DONE | `assist-system.js:220-266` |
| Role-based auto-cast, 14/14 abilities + 11/11 powers (M6) | ✅ DONE | `assist-system.js:95-160`; `weapon-data.js:971-987,1611-1630` |
| autoDodge intensity logic (off/conservative/aggressive) | ✅ DONE (engine) | `assist-system.js:187-194` — *no UI yet* |
| ItemCard + compare delta-strip + stat-panel + 6-spoke resist-wheel | ✅ DONE & wired | `item-card.js:38-191`; live on `I` screen `inventory-overlay.js:152-208` |
| Ability cooldown slot-bar HUD | ✅ DONE | `status.js:1753` (`:469` is a dead stub) |
| Mobile scheme: analog stick + tap-dash, forced auto-aim/fire | ✅ DONE | `mobile-touch.js`; `player.js:694-705` |
| `GamepadFocusController` class | ✅ DONE (exists) | `gamepad-focus.js:14-87` — *not driven by the pad yet* |
| Controller-glyph infra (`detectControllerFamily`/`bindingGlyph`) | ✅ DONE (exists) | `icons.js`; used by `item-card.js:122` — *not in GAMEPAD ref tab* |

**Locked decisions:** analog stick stays the mobile default; auto-dodge is **both** (manual tap-dodge default, opt-in auto-dodge — already supported by `decideDodge`); graphical Armory **grafts into the GEAR tab** (the card components already exist, so this is a render swap, not a build).

---

## Task format & conventions
`[ ] ID — title` · **Files** · **Steps** · **Acceptance** · **Test** · **Version**. Tasks are sized for one focused sitting. Version bumps follow CLAUDE.md (solo MINOR=feature, PATCH=polish/fix); pure refactors with no behavior change defer the bump until consumed. Subagents never run git.

---

## Workstream GP — Gamepad: navigation, unused bindings, feel
*The largest true gap. Input is mapped; menus aren't pad-navigable and feel/polish is absent.*

- [ ] **GP-1 — Drive `GamepadFocusController` from the pad (no-mouse menus).**
  **Files:** `gamepad-handler.js` (`pollFrame` `:175-232`), `gamepad-focus.js`, the overlay openers.
  **Steps:** In `pollFrame`, when a menu/overlay is open, route stick/D-pad → `focus.move(dir)`, `A`/`ACTIONS.CONFIRM` → `focus.activate()`, `B`/`ACTIONS.BACK` → close/cancel, `LB/RB` → tab switch. Maintain rising-edge state. Register the active overlay's focusable set with the controller (shop nodes, armory rows/cards, pause entries, run-setup controls, wave-pick cards, settings).
  **Acceptance:** every menu (Shop BUILD tree, Armory/GEAR, Pause, Run-Setup, Wave-Pick, Settings, `I` inventory) is fully operable with no mouse.
  **Test:** synthetic-gamepad QA shim asserts focus moves + `A` activates in each overlay.
  **Version:** MINOR.

- [ ] **GP-2 — Consume the declared-but-unread bindings `TOGGLE_AUTO_AIM` (L3) and `LOCK_ON` (R3).**
  **Files:** `gamepad-handler.js` `poll()`, `player.js` aim block (`:710-760`).
  **Steps:** L3 rising-edge → toggle `assists.autoAim` (+ persist via `setAssist`). R3 held → soft-lock aim to `findNearestTarget` (snap `aimX/Y`, keep steerable).
  **Acceptance:** L3 toggles auto-aim (HUD reflects it); holding R3 locks aim to nearest threat.
  **Test:** unit on the poll mapping; manual.
  **Version:** MINOR.

- [ ] **GP-3 — Live controller glyphs in the GAMEPAD reference tab.**
  **Files:** `static-dom.js:344-353` (hardcoded "Cross/A · Circle/B…" text), `icons.js` (`detectControllerFamily`, `bindingGlyph`, `renderBindingChipHTML`).
  **Steps:** Replace hardcoded labels with family-aware glyph chips from the existing infra; add a manual family override (Xbox/PS/Switch/Keyboard), default neutral/Xbox.
  **Acceptance:** GAMEPAD tab shows correct glyphs per connected pad / override.
  **Test:** visual; unit on family→glyph mapping.
  **Version:** PATCH.

- [ ] **GP-4 — Rumble/haptics for gamepad.**
  **Files:** `gamepad-handler.js`, a small `rumble()` helper; call sites (dash, hit, low-HP, ability-ready, power-fire).
  **Steps:** Use `gamepad.vibrationActuator.playEffect` with graceful no-op fallback. Settings toggle + intensity; **off by default** until validated.
  **Acceptance:** events rumble when enabled; no errors where unsupported.
  **Test:** manual matrix (Xbox/DualSense/Switch × Chrome/FF/Safari).
  **Version:** MINOR.

- [ ] **GP-5 — Deadzone / sensitivity / aim-curve settings UI.**
  **Files:** new CONTROLS settings rows (`static-dom.js`/`ui-manager.js`), `gamepad-handler.js:31-34` (hardcoded constants → read from settings), persist.
  **Steps:** Expose move/aim deadzone, trigger threshold, and a mild exponential aim-response curve; persist to `localStorage`.
  **Acceptance:** changing settings changes feel live; persists across reloads.
  **Test:** unit on curve/deadzone math.
  **Version:** MINOR.

- [ ] **GP-6 — (Stretch) Rebinding UI.**
  **Files:** `bindings.js` (make layouts overridable), settings.
  **Steps:** Allow per-action remap layered over Pro/Classic presets, with conflict detection; persist.
  **Acceptance:** a remapped action takes effect and survives reload.
  **Test:** unit on override resolution.
  **Version:** MINOR. *Lowest priority.*

---

## Workstream AS — Assist / Co-Pilot UI depth & persistence
*The engine supports level/aggression/autoDodge-intensity; none are user-settable, and touch-only mobile can't reach the ASSISTS tab at all.*

- [ ] **AS-1 — Persist & honor the richer assist config.**
  **Files:** `game-engine.js` `_loadAssists` `:4964-4995` / `setAssist` `:5070-5076` / per-frame override `:3365-3369`.
  **Steps:** Extend the persisted `rainboidsAssists` to include `level`, `aggression`, `autoDodge`. Stop unconditionally recomputing these from `controlScheme` each frame — seed from saved settings (keep touch defaults as initial values only).
  **Acceptance:** changing level/aggression/dodge persists and drives `AssistSystem.config`.
  **Test:** unit on load/merge/save.
  **Version:** MINOR.

- [ ] **AS-2 — Assist LEVEL preset selector (Co-Pilot / Autopilot / Manual Touch).**
  **Files:** `static-dom.js` ASSISTS tab, `ui-manager.js` wiring.
  **Steps:** Segmented control that sets `config.level` and applies the preset bundle of toggles (e.g. Autopilot ⇒ autoDodge aggressive + all auto-casts on).
  **Acceptance:** picking a preset flips the underlying toggles + persists (AS-1).
  **Test:** unit preset→config; manual.
  **Version:** MINOR.

- [ ] **AS-3 — Auto-Dodge intensity control (Off / Conservative / Aggressive).**
  **Files:** ASSISTS tab + wiring → `config.autoDodge`.
  **Steps:** 3-way control mapping to the values `decideDodge` already reads (`assist-system.js:191`). Default **Conservative** (manual tap-dodge stays primary).
  **Acceptance:** Off disables auto-dodge; Aggressive raises the TTI threshold; manual tap always overrides.
  **Test:** unit `decideDodge` thresholds; survival sim sanity.
  **Version:** MINOR.

- [ ] **AS-4 — Aggression slider.**
  **Files:** ASSISTS tab + wiring → `config.aggression` (currently constant 0.55, `assist-system.js:11/96`).
  **Steps:** Slider 0.1–1.0 feeding `roleScore` / heal-mitigate thresholds; persist.
  **Acceptance:** slider visibly changes cast eagerness in a sim.
  **Test:** unit `roleScore(aggression)`.
  **Version:** MINOR.

- [ ] **AS-5 — Mobile-native Assists screen (the user's explicit ask).**
  **Files:** mobile UI; the ASSISTS tab is currently hidden on touch-only mobile (`game-engine.js:5051-5056`, `static-dom.js:277`).
  **Steps:** Surface a touch-reachable Co-Pilot screen (from pause / a settings entry) exposing AS-2/3/4 + auto-cast toggles + stick side. Stop force-baking assists so mobile players can tune them.
  **Acceptance:** on a phone, the player can open the screen and change level/dodge/aggression; changes take effect + persist.
  **Test:** mobile device check; unit on the shared config object.
  **Version:** MINOR.

- [ ] **AS-6 — (Optional) Smart-Cast button.**
  **Files:** mobile HUD; calls the Co-Pilot's best-recommended cast on demand.
  **Steps:** Optional on-screen button (default hidden) that triggers `decideCast`/`decidePower`'s top pick immediately.
  **Acceptance:** tapping it fires the recommended ability/power when one is valid.
  **Test:** unit "best pick" selection.
  **Version:** MINOR. *Optional.*

---

## Workstream FB — Co-Pilot & death feedback
*`_lastAssistCast` is written but never read; players get no cue the Co-Pilot acted, and game-over shows no cause.*

- [ ] **FB-1 — Surface auto-casts (consume `player._lastAssistCast`).**
  **Files:** `assist-system.js:261` (writer), `status.js:1753` slot-bar, toast system.
  **Steps:** On a new `_lastAssistCast`, flash the matching cooldown slot + show a brief toast ("BULWARK", "EMP"). Reuse the pickup-toast.
  **Acceptance:** every auto-cast produces a visible pip flash + toast.
  **Test:** manual + a render unit if feasible.
  **Version:** PATCH.

- [ ] **FB-2 — (Optional) Auto-dodge cue.** Subtle ship glow when `_assistDashAngle` drove the dash. **Version:** PATCH.

- [ ] **FB-3 — Death-cause readout on game over.**
  **Files:** record last-damage source (collision/enemy/boss) on the player; `overlays.js:1076` `drawGameOverScreen` (`:1150-1155`).
  **Steps:** Track `player.lastDamageSource`; render a one-line cause ("Cornered by Hunters", "Caught in Titan barrage") under the wave/time line.
  **Acceptance:** game-over shows a plausible cause for the killing blow.
  **Test:** unit on the cause-string mapping.
  **Version:** MINOR.

---

## Workstream MB — Mobile wiring & polish
*Three built modules are dead (never imported); several mobile-polish items absent.*

- [ ] **MB-1 — Wire `wake-lock.js`.** Acquire on `PLAYING`, release on pause/menu/game-over. **Files:** `platform/wake-lock.js`, `game-engine.js` state transitions. **Acceptance:** screen stays awake during play on mobile. **Version:** PATCH.

- [ ] **MB-2 — Wire real haptics.** Replace the no-op `triggerHapticFeedback` (`core/utils.js:115-116`, called from `collision-system.js:213,815`) with `platform/haptic.js`; add Co-Pilot cues (auto-cast = light, auto-dodge = medium, hit = scaled). Settings toggle. **Acceptance:** mobile vibrates on the mapped events when enabled. **Version:** PATCH.

- [ ] **MB-3 — Wire `mobile-tutorial.js` first-run card.** Use `shouldShowMobileTutorial`/`markShown`; rewrite copy for one-thumb + Co-Pilot ("Steer to dodge, tap to dash — your Co-Pilot handles the rest"). **Files:** `ui/mobile-tutorial.js`, boot path. **Acceptance:** shows once on first mobile run, dismissible, correct copy. **Version:** PATCH.

- [ ] **MB-4 — Ship-under-finger offset.** Render/anchor the ship ~50px above the touch point so the thumb doesn't occlude it. **Files:** `mobile-touch.js`/camera. **Acceptance:** ship is visible while steering. **Version:** PATCH.

- [ ] **MB-5 — Mobile camera zoom.** Tune zoom (~0.75 portrait / ~0.9 landscape) for a moving ship; verify with deadband-follow. **Version:** PATCH.

- [ ] **MB-6 — Verify crit-flash suppression covers mobile.** 5.99.2 (`3695b94`) added crit-flash suppression — confirm it's correctly mobile-gated; fix if not. **Acceptance:** no full crit screen-flash on mobile. **Version:** PATCH (or none if already correct).

- [ ] **MB-7 — Canvas-space damage numbers on mobile.** Ensure `hud/combat.js drawDamageNumbers` stays readable at mobile zoom (render in canvas space). **Version:** PATCH.

---

## Workstream IT — Items & Inventory UI (mostly DONE — small targets)
*The card/compare/stat-panel/resist-wheel components exist and are live on the `I` screen. Remaining: a stash grid, the GEAR-tab render swap, and the post-wave recap.*

- [ ] **IT-1 — Stash GRID using the existing `createItemCard`.**
  **Files:** new grid view (in the `I` screen and/or GEAR tab), `item-card.js`.
  **Steps:** Render the stash as a rarity-bordered card grid (compact variant) with filter-by-slot + sort (power/rarity/level/new) + favorite/lock. Pre-render rarity frames; animate only the focused card (perf).
  **Acceptance:** stash shows as a filterable/sortable card grid; large stashes stay smooth.
  **Test:** unit on sort/filter; perf check on a full stash.
  **Version:** MINOR.

- [ ] **IT-2 — Graft ItemCard/StatPanel into the GEAR tab (replace flat rows).**
  **Files:** `armory-overlay.js` `renderGearInto` `:305` / `_renderEquipment` `:397-454` / `_renderStash` `:458-539`; reuse `createItemCard`/`createStatPanel`/`compareItemStats`.
  **Steps:** Swap the `armory-row` text rows for the existing card components + hover-compare + stat-panel preview, **reusing all equip/salvage/reroll/tierUp/targetResist/rerollPassive logic unchanged**. (This is the "graft into GEAR tab" decision — a render swap, not new components.)
  **Acceptance:** GEAR tab looks/behaves like the `I` screen's card UI; all mutations still work; QA green.
  **Test:** existing armory QA must pass; visual.
  **Version:** MINOR.

- [ ] **IT-3 — Post-wave / end-of-run Salvage Report recap.**
  **Files:** verify whether a recap exists; if not, build a screen listing items banked this run as cards (sorted by rarity, UPGRADE-tagged), with a "Go to Armory" CTA. Keep in-combat ceremony compact (no full-screen flashes on mobile).
  **Acceptance:** after a run (or per wave), the player sees a loot recap.
  **Test:** manual; unit on the upgrade-tag logic (reuse `compareItemStats`).
  **Version:** MINOR.

- [ ] **IT-4 — Gamepad focus nav for inventory/armory cards.** Depends on **GP-1**. The `I` overlay already instantiates `GamepadFocusController` but only `focusFirst()`s (`inventory-overlay.js:44,63`) — register its cards/rows so GP-1's traversal drives them. **Version:** part of GP-1.

---

## Sequencing & dependencies
Foundation (binding registry, Assist System, ItemCard, autoCast) already exists, so most tasks are independent. Notable order:
- **GP-1 first** in the gamepad stream — unblocks **IT-4** and makes every menu pad-navigable.
- **AS-1 before AS-2/3/4/5** — persistence/seeding must exist before the controls that write it.
- **FB-1** can land anytime (independent, high player-value, cheap).
- **MB-1/2/3** are independent cheap wins (wiring dead modules).

**Suggested first sprint (highest value, low risk):** FB-1 (auto-cast feedback), AS-1+AS-3 (dodge intensity toggle + persistence), MB-1/2/3 (wire the dead modules), GP-1 (pad menu nav). That set makes the Co-Pilot *legible*, gives mobile players control, and makes the pad work everywhere — the biggest perceived-quality jump for the least code.

---

## Verification gate (per the Master Roadmap §7)
- **Unit (Jest):** the Assist deciders are already pure — add tests for any new thresholds (AS-3/4), GP mapping (GP-2/5), Items sort/compare (IT-1/3).
- **Survival sims:** run `tools/ai-qa-bot/` (richer than `tests/helpers/game-ai.js`) as positioning-only; check the Co-Pilot keeps the player alive across difficulty MODEs and watch **director thrash** (peak-to-peak `D_hp`) since a deterministic Co-Pilot is periodic.
- **Fun-score A/B:** accept an assist change only if overall fun improves and **no dimension regresses >5 pts** (`tools/ai-qa-bot/analysis/fun-*`).
- **Fairness constraint:** assist must not let an Autopilot run **farm an un-escalated game for full rewards** (rewards are tied to real difficulty faced).

---

## Residual decisions / verify-first items
- **MB-6 crit-flash:** verify current mobile gating before writing the fix.
- **IT-3 recap:** verify whether any post-wave recap already exists.
- **GP-6 rebinding:** stretch; ship Pro/Classic + glyphs first.
