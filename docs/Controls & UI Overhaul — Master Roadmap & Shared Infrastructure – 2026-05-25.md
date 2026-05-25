# Controls & UI Overhaul — Master Roadmap & Shared Infrastructure

**Status:** Plan / Design — **read this first**
**Date:** 2026-05-25
**Scope:** Solo (`/`). Umbrella plan for three feature efforts — [Gamepad Controls], [Mobile Controls & AI Co-Pilot], [Items & Inventory UI] — that **share infrastructure**. This document defines those shared primitives once, sequences them so infrastructure lands before features, ranks the work by value, and sets the measurement plan. The three feature docs reference this one and do not re-specify the shared pieces.

> Companion docs:
> - `Gamepad Controls — First-Class Controller Support`
> - `Mobile Controls — One-Thumb Play & AI Co-Pilot`
> - `Items & Inventory UI — Graphical Loadout Experience`

---

## 1. Why this document exists (X1)

The three feature plans quietly depend on each other:

- The Items UI's **binding chips** (showing which button casts an ability) need the gamepad doc's **glyph system**.
- The Items UI's **loadout-panel cooldown pips** are the same pips the mobile **Co-Pilot** flashes when it auto-casts.
- The Items UI's **gamepad navigation** needs a **focus controller** introduced for gamepad menus.
- The mobile **Co-Pilot** and the gamepad's **optional auto-aim / auto-cast** are *the same system* (§5).

Built independently, these would collide or duplicate. This roadmap makes the dependencies explicit and forces an **infrastructure-first** build order so we don't paint ourselves into rework.

---

## 2. Shared infrastructure primitives (build these first)

Six primitives are consumed across docs. Each is small, testable, and low-risk on its own.

### P0.1 — Input Action & Binding Registry — `js/modules/ui/bindings.js` (new)
Single source of truth mapping **logical actions** (`MOVE`, `AIM`, `FIRE_PRIMARY`, `FIRE_POWER`, `DASH`, `ABILITY_1..4`, `SWITCH_*`, `PAUSE`, `OPEN_SHOP`, menu actions) → **bindings per device** (keyboard, gamepad, touch) + a **glyph descriptor** per binding. Replaces the scattered keycode/button literals in `input-handler.js` and `gamepad-handler.js`.
- **Consumers:** input handlers, gamepad glyph hints, ItemCard binding chips, tutorial, the rebinding settings UI (gamepad G5).
- **Depends on:** nothing. **Risk:** low. **Why first:** unblocks binding chips, rebinding, and glyph display everywhere.

### P0.2 — Glyph Set — `js/modules/ui/icons.js` (extend)
Keyboard-key glyphs + controller-correct button glyphs. **Detection is best-effort:** default to a neutral/Xbox glyph set with a **manual override** in settings (Xbox / PlayStation / Switch / Keyboard); auto-detect from `gamepad.id` only as a hint (G6 — cross-browser `id` is unreliable).
- **Consumers:** gamepad UI hints, ItemCard binding chips, tutorial.
- **Depends on:** P0.1. **Risk:** low.

### P0.3 — `autoCast` role metadata — in `js/modules/combat/weapon-data.js` (data only)
A small block on each ability/power: `{ role, targeting, aoeRadius, minThreatLevel }`. **Role alone drives behavior via shared defaults** (M6) — per-item numeric weights are rare optional overrides, not required. No behavior code here; pure data the Assist System reads.
- **Consumers:** Assist System. **Depends on:** nothing. **Risk:** low.

### P0.4 — Assist System (core) — `js/modules/assist/` (new) — **the unified co-pilot (X2)**
The Sense → Decide → Act engine that powers both mobile auto-play and gamepad/desktop opt-in assists. See §5 for the unified framing. Built in stages:
- **Sense** (Situation snapshot) — split-rate: a fast **dodge/threat** pass (~30 Hz or per-frame) and a slower **cast** pass (~10 Hz) (M1).
- **Decide** (role-based scoring of ready capabilities).
- **Act** (writes `input.*`, calls `player.activateAbility(slot)`, triggers dash).
- **Config** (assist level + aggression), shared by mobile and gamepad front-ends.
- **Consumers:** mobile controls (default-on), gamepad/desktop (opt-in). **Depends on:** P0.3, existing `findNearestTarget`, `spatialGrid`. **Risk:** medium (tuning).

### P0.5 — GamepadFocusController — `js/modules/ui/gamepad-focus.js` (new)
Reusable DOM focus-ring navigation for every menu (stick/D-pad to move focus, `A` activate, `B` back, `LB/RB` tabs). Generalizes the shop's existing `←/→` tab nav.
- **Consumers:** Shop, Armory/Inventory, Pause, Run-Setup, Wave-Pick, Settings. **Depends on:** P0.1. **Risk:** low–medium.

### P0.6 — ItemCard component — `js/modules/ui/item-card.js` (new)
One card renders any item (gear / weapon / power / ability / passive) with a **single icon language** that reconciles the crystalline gear glyphs and the weapon SVG slugs into one family (I1). Includes the binding chip.
- **Consumers:** Armory, stash grid, drop feed (compact variant), shop tooltip, loadout panel, run recap. **Depends on:** P0.1, P0.2, existing icon system. **Risk:** medium.

---

## 3. Dependency graph

```
                       ┌─────────────────────────────────────────────┐
   P0 FOUNDATION       │  P0.1 BindingRegistry   P0.3 autoCast meta   │
   (build first)       │        │      │               │             │
                       │        ▼      ▼               ▼             │
                       │  P0.2 GlyphSet  P0.5 FocusCtrl P0.4 Assist   │
                       │        │              │        (core)        │
                       │        ▼              │          │           │
                       │  P0.6 ItemCard ───────┘          │           │
                       └────────┬──────────────┬──────────┬──────────┘
                                │               │          │
          ┌─────────────────────┘               │          └───────────────┐
          ▼                                      ▼                          ▼
  P1 Gamepad full mapping            P4 Gamepad menu nav         P2 Mobile ability auto-cast
     (BindingRegistry, GlyphSet)        (FocusCtrl)                 (Assist core + autoCast)
          │                                      │                          │
          ▼                                      ▼                          ▼
  P6 Gamepad feel/rebinding          P7 Items gamepad nav        P5 Auto-dodge + mobile UX
     (Registry, GlyphSet)               (FocusCtrl, ItemCard)       (Assist; split-rate Sense)
                                                 │
          ┌──────────────────────────────────────┘
          ▼
  P3 ItemCard + comparison/stat-sheet  ──►  P8 Loadout panel + binding chips
     (ItemCard, BindingRegistry)              (ItemCard + Registry + Assist pips)
```

Everything below P0 pulls from the foundation. Nothing in P1–P8 should be started before its P0 dependencies exist as at least testable skeletons.

---

## 4. Build order (infrastructure-first)

**Phase 0 — Foundation (do before any feature work):**
1. P0.1 Binding Registry (migrate existing keyboard/gamepad literals into it; behavior unchanged — pure refactor, easy to verify against current bindings).
2. P0.3 `autoCast` metadata for the base abilities/powers (data only).
3. P0.2 Glyph Set (neutral default + override).
4. P0.4 Assist System **Sense layer + config** (no Act yet — expose the Situation snapshot for inspection/tuning).
5. P0.5 GamepadFocusController skeleton.
6. P0.6 ItemCard skeleton (renders one card; consumers wired later).

**Then feature phases** (ordered by §5 priority): P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8.

Phase 0 is mostly low-risk refactors + skeletons; it de-risks everything after it and is independently shippable (the binding-registry refactor alone is a clean commit).

---

## 5. The unified Assist System (X2)

The mobile "Co-Pilot" and the gamepad/desktop "auto-aim / auto-cast" are **one system with one config**, two front-ends:

```
AssistSystem
 ├── Sense   (Situation snapshot — split-rate; §details in Mobile doc)
 ├── Decide  (role-based capability scoring; §details in Mobile doc)
 ├── Act     (input writes / activateAbility / dash)
 └── Config  { level, aggression, autoDodge, autoCastAbilities, autoCastPower, autoAim }
```

- **Mobile front-end:** `level` defaults to "Co-Pilot" (auto-aim/fire/power/abilities on; auto-dodge conservative). See Mobile doc for the level definitions (Co-Pilot / Autopilot / Manual Touch) and the resolution of "is steer-only fun?" (M4).
- **Gamepad/desktop front-end:** all assists **off by default** (manual play is first-class), exposed as opt-in accessibility toggles — notably **auto-cast of survival abilities**, which resolves the gamepad face-button-under-pressure problem (G1): players who don't want to lift the aim thumb during a panic moment let the system cast defensives.

One engine, one set of tuning knobs, two defaults. This removes the duplication the original two docs implied.

---

## 6. Cross-cutting priority ranking (X3)

Highest value-per-effort first. "Depends" lists the P0 primitives required.

| Rank | Work | Why it ranks here | Depends |
|---|---|---|---|
| **1** | **P1 Gamepad full ability mapping + dash-direction fix** | Largest gap with smallest new tech — input plumbing mostly exists; unlocks "all abilities on controller" + fixes the dash-into-danger bug | P0.1, P0.2 |
| **2** | **P2 Mobile ability auto-cast** | Makes the whole game *playable* on phones (abilities currently never fire) | P0.3, P0.4 |
| **3** | **P3 ItemCard + comparison + stat sheet** | Biggest UX payoff for itemization; the comparison strip is the "amazing items" centerpiece | P0.1, P0.6 |
| 4 | P5 Auto-dodge + mobile UX (assist levels, smart-cast button, death feedback) | Turns mobile from "playable" to "fun/fair" | P0.4 |
| 5 | P4 Gamepad menu/shop/armory navigation | Required for true no-mouse controller play | P0.5 |
| 6 | P8 Loadout panel + binding chips | Ties controls ↔ UI together; small once P0 exists | P0.1, P0.6 |
| 7 | P7 Items gamepad/touch nav + loot ceremony + stash grid | Polish + depth | P0.5, P0.6 |
| 8 | P6 Gamepad feel (rumble, rebinding, sensitivity) | High polish, lowest urgency | P0.1 |

**If we only do three things:** ranks 1–3.

---

## 7. Measurement & tuning plan (X4)

Every "tune in playtest" in the feature docs resolves to one of these concrete loops:

- **Unit (Jest, no browser):** the Assist System's `Sense` and `Decide` are **pure functions** (`senseSituation(snapshot) → Situation`, `decideCast(Situation, equipped, cooldowns) → action`). Gamepad mapping (`mapGamepadState(raw, layout) → inputPatch`) and Items math (stat aggregation, compare deltas) are pure too. Test edge cases directly.
- **Survival sims (`tests/helpers/game-ai.js`):** run the existing AI playtester as a **positioning-only bot** (strip its `input.fire`; let the Assist System drive offense/abilities) across waves and all difficulty MODEs. Assert survivability and time-to-death distributions — a direct, automatable fun/fairness check for the Co-Pilot.
- **Director telemetry as fairness signal:** read `getThreatLevel`, `D_hp`, `D_thr` during sims. Because the director is **reactive**, it already adapts to however much damage assisted play deals — so we mostly need to *verify fairness*, not hand-calibrate a baseline (resolves M7).
- **Device / controller matrix (manual):** iOS Safari + Android Chrome (portrait/landscape, notch safe-areas, stick side); Xbox / DualSense / Switch Pro across Chrome/Firefox/Safari (gamepad mapping quirks).
- **Fun-score tuning tie-in:** feed the survival-sim outputs into the existing fun-score / flow-channel tuning work so assist defaults and aggression are set against real signals, not vibes.

---

## 8. Versioning & hygiene

- These four documents are **planning docs → not versionable** (per CLAUDE.md); no `VERSION`/`CHANGELOG` bump for the docs themselves.
- The *implementation* work is real runtime code → each separable change gets its own solo version bump + CHANGELOG entry, and README updates when project structure changes (new `js/modules/assist/`, `bindings.js`, `item-card.js`, `gamepad-focus.js`).
- New files land in their proper homes (`js/modules/...`); no new top-level dirs.

---

## 9. Residual cross-cutting forks

- **Mid-run weapon switching (G3/G4):** the feature docs now *cut* combat weapon-cycling from the default gamepad scheme (loadout changes happen in Armory/shop between waves). If telemetry later shows players want in-combat swapping, add it back as a hold-LB two-level radial. Decision deferred, default = cut.
- **Gamepad assist default:** off (manual is first-class). Revisit only if playtests show the face-button-under-pressure problem persists even with good auto-aim.
- **Mobile default level:** "Co-Pilot" (steer + tap-dash are the player's verbs), not full hands-off — see Mobile doc M4. "Autopilot" is the accessibility extreme.
