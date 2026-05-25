# Gamepad Controls — First-Class Controller Support

**Status:** Plan / Design (revised — review pass folded in 2026-05-25)
**Date:** 2026-05-25
**Scope:** Solo (`/`). Make the whole game — every weapon, power, the 4 ability slots, dash, menus, shop, and armory — fully playable on a standard controller with a layout native to twin-stick shooters.

> **Read [Controls & UI Overhaul — Master Roadmap] first.** This doc depends on shared primitives defined there: the **Binding Registry (P0.1)**, **Glyph Set (P0.2)**, the **GamepadFocusController (P0.5)**, and the **unified Assist System (P0.4 / §5)**. Priority of this work: **rank 1** (full mapping + dash fix) and **rank 5** (menu nav), per the roadmap.

---

## 1. Goal

Today gamepad support is *partial*: twin-stick aim works, triggers fire, dash is on `A`, hold-to-open radials exist — but **only ability slot 0 is reachable**, dash fires in the *aim* direction (wrong for evasion), and there's no rumble/glyph/rebinding polish. This plan promotes gamepad to first-class.

Design principles:

1. **Thumbs stay on the sticks for *frequent* actions.** Sticks are sacred in twin-stick. Fire and dash must live on triggers/bumpers so a thumb never leaves move/aim.
2. **Infrequent actions may use face buttons — but the panic case is covered by assist, not by lifting the aim thumb.** Casting a defensive ability is a high-pressure moment; see §3.1 for how we resolve this honestly.
3. **Evasion is decoupled from aim.** Dash goes where you're steering, and *away from danger* when standing still — never toward aim.
4. **Feel.** Rumble, controller-correct glyphs, full rebinding, and tunable deadzones.

---

## 2. Current state (facts, with file refs)

All paths under `/Users/silvr/projects/rainboids`.

### Handler: `js/modules/ui/gamepad-handler.js`
- W3C `navigator.getGamepads()`; connect/disconnect events; only drives input when `controlScheme === 'gamepad'`.
- `pollFrame()` every render frame (pause, radial lifecycle, shop-tab nav); `poll(input)` on gameplay tick (writes `stickInput`, `aimStick`, `fire`, `fireSecondary`, `dashPulse`, `activateAbility`).
- Deadzones: `MOVE_DEADZONE 0.22`, `AIM_DEADZONE 0.28`, `TRIGGER_THRESHOLD 0.4`, `RADIAL_SELECT_DEADZONE 0.35`.

### Current button map
| Code | Button | Current |
|---|---|---|
| 0 | A/Cross | Dash (`dashPulse`) |
| 1 | B/Circle | Ability slot 0 only (`activateAbility`, back-compat) |
| 2 | X/Square | *(unused)* |
| 3 | Y/Triangle | Hold → ability radial |
| 4 | LB/L1 | Hold → power radial |
| 5 | RB/R1 | Hold → primary radial |
| 6 | LT/L2 | Power fire |
| 7 | RT/R2 | Primary fire |
| 9 | Start | Pause |
| 12–15 | D-pad | Movement fallback; ←/→ shop tabs |
| axes 0/1, 2/3 | sticks | Move / Aim |

### Consumption
- `game-engine.js:3994` `pollFrame()` each frame; `:3290–3317` `poll(input)` then `player.update(input,…)`.
- Aim priority `player.js:689–761` (Auto-Aim → right-stick `:726–738` → arrows → aim-assist → mouse).
- Movement `:883–899` (`useStickVel = _mobile || gpMoveActive`).
- Ability activation `:1070–1091` loops keyboard slots 1–4, then back-compat `activateAbility` (slot 0). **Gamepad never sets slots 1–3.**
- Dash `_triggerDash` `:1357–1442` uses `this._aimAngle` for gamepad. `DASH_COOLDOWN_MS 1500`, `DURATION 250`.

### The gap
Only 1 of 4 abilities reachable; dash drives you *into* enemies (you aim at them); no rumble, no controller glyphs, no rebinding, no sensitivity UI; X/Square unused.

---

## 3. Recommended layout — "Twin-Stick Pro" (default)

| Input | Action | Notes |
|---|---|---|
| **Left stick** | Move | deadzone 0.22 |
| **L3** (click) | Toggle Auto-Aim assist | persists |
| **Right stick** | Aim (ship faces aim) | deadzone 0.28; aim-response curve (§4) |
| **RT / R2** | Fire **primary** (hold) | unchanged |
| **LT / L2** | Fire **power weapon** | unchanged |
| **RB / R1** | **DASH** | *moved from A*; index finger keeps thumbs on sticks |
| **A / Cross** | **Ability slot 1** | see §3.1 |
| **B / Circle** | **Ability slot 2** | |
| **X / Square** | **Ability slot 3** | frees the unused button 2 |
| **Y / Triangle** | **Ability slot 4** | |
| **LB / L1** | *(reserved)* — optional loadout radial (stretch only) | see §3.3 |
| **D-pad** | **Menu / shop navigation only** | no combat weapon-cycling (G4) |
| **R3** (click) | Lock-on nearest target (hold) | soft-lock |
| **Start / Options** | Pause | |
| **Select / Back / Share** | Open Shop / Armory | |

### 3.1 The face-button-abilities problem — resolved honestly (G1)
Putting the 4 abilities on `A/B/X/Y` *does* mean lifting the right thumb off the aim stick — and you'd do it during high-pressure moments (BULWARK when surrounded). We don't hand-wave this; we mitigate it three ways:

1. **Strong gamepad auto-aim available (L3).** When enabled, the ship keeps aiming at the nearest threat while your thumb is off the stick to tap an ability — so the ~100 ms thumb-lift costs you nothing. Recommended-on for gamepad newcomers; off for purists who twin-stick aim manually.
2. **Optional auto-cast of *survival* abilities via the unified Assist System** (Master Roadmap §5). Players who never want to lift the aim thumb under pressure let the system cast defensives (BULWARK/heal/mitigate) automatically, and reserve manual face-button casts for *offensive* abilities they want to time themselves. This is the clean resolution: the panic-moment cast doesn't require a thumb-lift at all.
3. **Full rebinding (P6 / G5).** Players who prefer abilities on the D-pad, or dash on `A`, can remap.

So: face buttons are the default *manual* home for abilities; auto-aim and opt-in survival auto-cast remove the only real objection. Direct one-button casting (vs hold-then-flick) stays the responsive default.

### 3.2 Dash direction — fixed (G2)
Replace the gamepad dash's aim-direction with **steer direction, and away-from-threat when standing still** (never toward aim, which points at enemies):

```js
// _triggerDash, gamepad branch
if (input.stickInput && input.stickInput.magnitude > MOVE_DEADZONE) {
    angle = Math.atan2(input.stickInput.y, input.stickInput.x);     // dash where you steer
} else {
    const t = ge.findNearestTarget(this.x, this.y);                 // standing still:
    angle = t ? Math.atan2(this.y - t.y, this.x - t.x)              //   dash AWAY from nearest threat
              : this._aimAngle + Math.PI;                            //   else: opposite of aim
}
```
The previous plan's "fallback to aim" re-introduced the dash-into-danger bug for the exact defensive case; this removes it.

### 3.3 Mid-run weapon switching — cut from the default (G3/G4)
The original LB/D-pad "switch active weapon mid-combat" was underspecified ("flick to switch the active item" — to *what?*) and needs a thumb off a stick for a rarely-used action. **Decision: cut it from the default scheme.** Loadout changes happen in the **Armory/shop between waves**, where they belong. `D-pad` is therefore **menu navigation only**; `LB` is **reserved**. If telemetry later shows demand for in-combat swapping, add a **hold-LB two-level radial** (category → item) as a stretch — but not by default.

### 3.4 Genre fork — fire on RT, not right-stick deflection (G7)
Some twin-stick games auto-fire when the right stick deflects (Geometry Wars). We deliberately keep **fire on RT** (right-stick = aim only): it gives precise control over *when* to shoot (charged weapons, ammo economy, not waking enemies) and matches the keyboard model. Stated here as a conscious fork, not an oversight. (A "fire-on-aim" toggle could be offered later if requested.)

---

## 4. Alternate layout — "Classic" + rebinding

- **Classic toggle** (`gamepadLayout: 'pro' | 'classic'`, persisted): dash on `A`, casting via the existing hold-RB/LB/Y radials, ability slot 0 on `B`. Keeps today's code path intact and low-risk; "Pro" is default.
- **Full rebinding (G5):** built on the **Binding Registry (P0.1)** — every logical action remappable per device in a CONTROLS settings tab, with conflict detection. This is what "first-class" actually requires; the Pro/Classic toggle is just a curated preset on top of it.

---

## 5. Menu / shop / armory navigation (P4 / rank 5)

A controller must drive **every** screen with no mouse. Build the reusable **GamepadFocusController (P0.5)**: stick/D-pad moves focus, `A` activates, `B` backs/cancels, `LB/RB` switch tabs, `Start` closes. Wire it into Shop (bubble-tree node focus + buy on `A`), Armory/Inventory (slot+card focus, equip on `A` — see Items doc), Pause, Run-Setup, Wave-Pick (←/→ between cards, `A` choose), and Settings. Generalizes the shop's existing `←/→` tab nav.

---

## 6. Feel & polish (P6 / rank 8)

- **Rumble** via `vibrationActuator` (graceful no-op where unsupported — Firefox/Safari are spotty): ability-ready tick, dash pulse, severity-scaled damage thump, low-HP heartbeat, power-fire "thunk". Settings toggle + intensity; off until validated.
- **Controller glyphs (P0.2 / G6):** neutral/Xbox default + **manual override** (Xbox/PS/Switch/Keyboard); auto-detect from `gamepad.id` only as a hint. Rendered wherever bindings show.
- **Binding hints in UI:** every ability/weapon card (Items doc) shows its bound glyph via the Binding Registry.
- **Hot-swap:** connect toast; on disconnect mid-run, auto-pause + fall back to KB/M.
- **Deadzone & sensitivity settings:** expose move/aim deadzones, trigger threshold, and an **aim-response curve** (mild exponential so small deflections aim precisely and full deflection snaps fast — the linear ramp lacks this).
- **Edge-state correctness:** rising-edge detection for pulse actions (dash, ability tap, pause) must track prior button state across *both* `pollFrame` and `poll` so nothing double-fires or is missed — centralize edge bookkeeping in the handler.

---

## 7. Complete ability → input coverage (Pro layout)

| Capability | Pro binding |
|---|---|
| Move / Aim | Left / Right stick |
| Primary fire | RT |
| Power weapon | LT |
| Dash (steer dir; away-from-threat when still) | RB |
| Ability slots 1–4 | A / B / X / Y (or auto-cast survival via Assist) |
| Lock-on nearest | R3 |
| Toggle auto-aim | L3 |
| Switch active weapons | Armory/shop between waves (not in combat) |
| Pause | Start |
| Shop / Armory | Select/Back |

> If a future build equips **>4 abilities at once**, the first 4 map to face buttons and the rest go to the optional hold-LB radial (§3.3) — or are handled by the Assist System.

---

## 8. Implementation phases (mapped to roadmap priorities)

**P1 (rank 1) — Full ability mapping + dash fix** *(after P0.1, P0.2)*
- Map A/B/X/Y → `input.activateAbilitySlot[0..3]` as rising-edge pulses (mirror keyboard semantics, `input-handler.js:203–218`); keep `activateAbility` only behind Classic.
- Move dash to RB; rewrite `_triggerDash` gamepad branch per §3.2.
- `gamepadLayout` setting (Pro default). Edge-state bookkeeping (§6).
- Solo MINOR + CHANGELOG (runtime code).

**P4 (rank 5) — Menu/shop/armory focus controller** *(after P0.5)*
- Build `GamepadFocusController`; wire all menus (§5).

**P6 (rank 8) — Feel & rebinding** *(after P0.1)*
- Rumble, glyphs, binding hints, deadzone/sensitivity/aim-curve, rebinding UI, connect/disconnect handling.

---

## 9. Testing

- **Unit (Jest):** pure `mapGamepadState(raw, layout) → inputPatch` — button→action, rising-edge consumption (both layouts), deadzone math, **dash-direction selection incl. the standing-still away-from-threat branch**.
- **Synthetic-gamepad shim:** mock `navigator.getGamepads` in QA so it can assert A/B/X/Y fire the correct ability slots and menu nav works with no mouse (extends `tests/helpers/game-ai.js` plumbing).
- **Manual matrix:** Xbox / DualSense / Switch Pro × Chrome/Firefox/Safari; verify all 4 abilities, dash direction (moving + still), full menu traversal, glyph override.
- **Regression:** Classic layout behaves exactly as today.

---

## 10. Open questions (residual)

- **Dash RB vs A:** default RB (thumb retention); Classic-A + rebinding cover preferences.
- **R3 lock-on:** soft-lock (snap aim, still steerable) recommended over hard-lock.
- **Mid-run weapon switching:** cut by default (§3.3); revisit only on telemetry demand.
- **Gamepad assist default:** off (manual first-class); survival auto-cast is opt-in and is the sanctioned fix for §3.1.
