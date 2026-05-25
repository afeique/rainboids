# Controls/UI Overhaul — Implementation Checklist

**Scope:** Solo (`/`) runtime implementation for gamepad controls, mobile Co-Pilot, and graphical inventory/loadout UI.

## Phase 0 — Shared foundations
1. Add `ui/bindings.js` with logical actions, default keyboard/gamepad/touch bindings, layout presets, and glyph descriptors.
2. Extend `ui/icons.js` with binding glyph helpers and controller-family override support.
3. Add `autoCast` metadata to powers and abilities in `combat/weapon-data.js`.
4. Add `assist/assist-system.js` with pure Sense/Decide/Act helpers, assist defaults, power/ability cast decisions, and dodge destination scoring.
5. Add `ui/gamepad-focus.js` for reusable DOM focus traversal.
6. Add `ui/item-card.js` for gear/weapon/ability cards, compare deltas, stat totals, and cooldown/binding chips.

## Phase 1 — Gamepad first-class combat
1. Refactor `ui/gamepad-handler.js` through the binding registry.
2. Make the Pro layout default: left/right sticks move/aim, RT primary, LT power, RB dash, A/B/X/Y ability slots 1-4, Start pause.
3. Keep Classic as a persisted fallback layout with today's dash/radial behavior.
4. Fix gamepad dash direction in `player/player.js`: steer direction first, away from nearest threat when still.

## Phase 2 — Mobile Co-Pilot
1. Instantiate the Assist System in `game-engine.js`.
2. Let touch control default to Co-Pilot: auto-aim/fire, ability auto-cast, smart power use, conservative auto-dodge.
3. Call the Assist System before player update so it can write one-shot ability/dash/power input.
4. Replace blunt mobile power spam with role-aware power fire recommendations.
5. Flash cooldown/binding pips after auto-casts.

## Phase 3 — Inventory/loadout UI
1. Replace inventory overlay rows with `ItemCard` gear cards.
2. Add equipped-slot comparison, per-stat delta strip, stat bars, and resist wheel.
3. Render recent drops as compact `ItemCard`s with upgrade tags.
4. Add gamepad/touch focus affordances through `GamepadFocusController`.
5. Reuse binding chips for weapon/ability cards and mobile `AUTO` chips.

## Phase 4 — Verification and docs
1. Add focused unit tests for bindings, gamepad mapping, assist decisions, dodge scoring, and item-card math.
2. Run the new targeted Jest tests.
3. Update `VERSION`, `CHANGELOG.md`, and `README.md` because this adds runtime systems, controls, and project structure.
