# Items & Inventory UI — A Graphical Loadout Experience

**Status:** Plan / Design (revised — review pass folded in 2026-05-25)
**Date:** 2026-05-25
**Scope:** Solo (`/`). Turn the functional-but-plain items/inventory screens into a tactile graphical experience worthy of the rich data model underneath — gear slots, an 8-tier rarity ladder, affixes, weapons, powers, and the 4 ability slots — with a unified card/icon language that works on mouse, gamepad, and touch.

> **Read [Controls & UI Overhaul — Master Roadmap] first.** This doc depends on shared primitives: the **ItemCard component (P0.6)**, the **Binding Registry (P0.1)** + **Glyph Set (P0.2)** (for binding chips), and the **GamepadFocusController (P0.5)** (for controller navigation). Priority: **rank 3** (ItemCard + comparison + stat sheet), then ranks 6–7. The mobile **Co-Pilot cooldown pips** and this doc's **loadout panel** render the same pips.

---

## 1. Goal

The *data* is excellent; the *presentation* is thin (flat list cards, no comparison, no equip interaction, tiny glyphs, rarity = just a color). This plan delivers: a unified **ItemCard**; an **Armory** that's legible and fast; **hover/select comparison with stat deltas** (the centerpiece); a **stat sheet** with bars + an element-resist wheel and live preview; **loot ceremony** that doesn't fight gameplay; and a **loadout panel** showing each weapon/ability with its control binding — tying this UI to the gamepad & mobile plans.

---

## 2. Current state (facts, with file refs)

All paths under `/Users/silvr/projects/rainboids`.

**Data (strong foundation):**
- **Gear** — `world/inventory.js`: `meta.stash[]` + `meta.equippedItems{cockpit,hull,shielding,chassis,nanites}`. Item: `{slot, level, rarity, rarityColor, rarityLabel, bonusLabel, affixes:[{type,label,value}]}`.
- **Slots/affixes** — `world/item-names.js`: 5 slots (cockpit=HP/cyan, hull=HP/blue, shielding=Tough/amber, chassis=Tough/orange, nanites=Regen/green), each with a crystalline icon shape; affix pool HP/Tough/Vamp/Thorns/Crit×2/Dodge/Speed/Regen + 6 element resists w/ `base`/`perWave`/`pct`.
- **Rarity (8 tiers)** — COMMON→RARE→EXCEPTIONAL→LEGENDARY→EPIC→GODLIKE→DIVINE→TRANSCENDENTAL, each color + glow + statMult + affixCount(1–5) + adjective; TRANSCENDENTAL prismatic.
- **Weapons/powers/abilities** — `combat/weapon-data.js`: `{id,name,description,icon(SVG slug),color,…,upgrades[]}`.

**Rendering today:**
- **Inventory overlay** — `ui/inventory-overlay.js` (+ CSS `styles.css:523–643`): EQUIPPED grid + RECENT DROPS list; 30–34 px canvas glyph, slot label, name, semicolon affixes, optional resist readout. Plain flex cards.
- **Item glyphs** — `hud/item-feed.js:34–121` `drawItemGlyph(ctx,slot,rarityColor,size)` (crystalline silhouettes, gradient fill, rarity stroke, white facet).
- **Drop feed** — `hud/item-feed.js`: left-edge 214×46 cards, 12 s/4 s fade.
- **Shop bubble-tree** — `shop/shop-dom.js` (+ CSS `4233–4526`): Diablo-style orbiting nodes, states, purchase flash, tooltip.
- **Icons** — `ui/icons.js`: `ICON_PATHS` (24×24, `currentColor`), `renderIconHTML`, cached `getIconImage`.
- **Style** — Press Start 2P / Silkscreen (modern fallbacks), deep-space dark panels, gold `#ffd700`, per-slot/rarity tints; breakpoints 1100/720 px.

**The gap:** no comparison, no equip interaction, no stat sheet/resist viz, tiny glyphs, rarity = color only, no coherent loadout view, and **two unreconciled visual languages** (shop bubble-tree vs gear glyphs).

---

## 3. Reconciling with the existing shop (I1)

Before building, settle the relationship to the shop bubble-tree so we don't ship two paradigms:

- **Clear division of labor:** **Shop = spend gold to buy/upgrade weapons, powers, abilities** (keep the bubble-tree — it's good at dependency trees). **Armory = manage the gear you've *looted*** (the 5 slots + stash). They're different verbs (buy vs equip) and deserve distinct screens.
- **One icon family across both (the ItemCard):** unify the **crystalline gear glyphs** and the **weapon SVG slugs** into a single card treatment so a weapon node's detail card and a gear card read as the same design system — same frame, rarity language, affix-row style, binding chip. The bubble-tree keeps its orbit *layout*, but node tooltips/detail panels render via the shared **ItemCard (P0.6)**.

---

## 4. The ItemCard — one component for everything

```
┌─────────────────────────────┐
│ ◆ PROTOTYPE QUANTUM BARRIER  │  rarity adjective + name (rarity color)
│   SHIELDING · L5      [Ⓨ]    │  slot/type · level · binding chip (when relevant)
│  ╭───────╮  Toughness +18%   │  hero glyph/icon + primary bonus
│  │  ⬢    │  ──────────────   │
│  ╰───────╯  ▸ Crit Dmg +9%   │  affix rows w/ small affix icons
│             ▸ Pyro Res +8%   │
│  ┌─────────────────────────┐ │
│  │ ▲ +6 Toughness vs equip │ │  compare delta (compare context only)
│  └─────────────────────────┘ │
└─────────────────────────────┘
   rarity frame: color + ornament tier + glow (+ prismatic at TRANSCENDENTAL)
```

- **Icon:** scale existing `drawItemGlyph` (gear) / `getIconImage` (weapons/abilities) to hero size (64–96 px), rarity stroke + facet; unified treatment per §3.
- **Rarity = color + ornament + glow (colorblind-safe):** escalating frame ornament complexity per tier (plain → notched → filigree → gem-set) so tier reads by *shape* too, not hue alone.
- **Affix rows:** affix `type` → SVG slug (HP→heart, Tough→shield, Crit→target, Speed→wind, Regen→droplet, resists→element icons), colored by family.
- **Binding chip:** weapons/abilities show their current binding via the **Binding Registry + Glyph Set** — keyboard key, controller glyph, or `AUTO` on mobile (with a "Co-Pilot manages this" hint).
- **Variants up front (I7-friendly):** **compact** (drop feed / grid cell — static, pre-rendered frame), **standard**, **hero** (Armory/recap — animated). Define all three so the component scales.
- **States:** equipped / in-stash / locked / new / favorited.

Build as `js/modules/ui/item-card.js` (P0.6); consumed by Armory, stash, drop feed, shop tooltip, loadout panel, run recap.

---

## 5. Screen-by-screen

### 5.1 Armory — `inventory-overlay.js` redesign (I2: list-first, ship as decoration)
The original ship-centered radial sockets were wow-over-usable (arbitrary slot→anatomy mapping; painful in mobile portrait). **Lead with a clean responsive layout; treat the ship visual as decoration:**
- A **ship illustration** with 5 slot indicators is shown for flavor, but the **interactive surface is a list/grid of the 5 slots** (always legible, trivially responsive).
- **Select a slot** → side rail (or bottom sheet on mobile) of stash items for that slot as ItemCards, sorted by relevant stat.
- **Equip via tap / click / `A`** (no drag-and-drop — see I3). Equip juice: socket flash in rarity color, glyph pop, gamepad rumble.
- **Empty slot:** "— empty —", dashed neutral ring. **First-run state:** all slots empty, stat sheet shows base stats (I6).

*(Radial sockets remain a possible stretch once the list version ships and proves responsive — not the default.)*

### 5.2 Stash / inventory grid
Rarity-bordered cells (compact ItemCard), hover lift/glow, filter by slot (5 tabs), sort by power/rarity/level/newest, **new** badges, favorite/lock. Salvage/sell left as a future hook (not v1).

### 5.3 Stat sheet / character panel
- **Bars** for HP/Toughness/Regen/Crit Chance/Crit Dmg/Dodge/Speed.
- **Element-resist wheel:** 6-spoke radar (Pyro/Cryo/Volt/Toxic/Void/Radiant) in element colors — shows defensive holes at a glance.
- **Live preview:** hovering a candidate animates bars/wheel to projected values with green-up/red-down ghosts. This is the moment that makes itemization feel great.
- **No single "Power Score" scalar (I4):** a one-number score across heterogeneous axes (offense affixes vs defensive slots) misleads and re-imports the weighting problem. Rely on **honest per-stat deltas + the live preview**. (If a coarse sort key is needed in the grid, label it explicitly as a *sort heuristic*, never as "item power.")

### 5.4 Loadout panel (weapons + abilities)
Active build as ItemCards: Primary, Power, Ability 1–4 — each with icon, key stats, cooldown, and **binding chip**. On mobile, ability cards show `AUTO` + the Co-Pilot hint; the **cooldown pips here are the same ones the Co-Pilot flashes on auto-cast** (shared widget).

### 5.5 Loot ceremony (I5: don't fight the gameplay)
The mobile player's *only* job is positioning, so mid-combat full-screen flashes are actively harmful. Therefore:
- **In-combat (all platforms):** keep it tiny — a compact ItemCard slide-in with a rarity-colored pickup streak, and a small **"▲ UPGRADE"** tag if the drop beats the equipped item in that slot (so auto-players still notice meaningful loot). **No full-screen flashes during play on mobile.**
- **Post-wave / end-of-run:** a **Salvage Report** screen lists everything banked as ItemCards, sorted by rarity, upgrades highlighted, one-tap "Go to Armory." This is where ceremony (LEGENDARY+ flair, TRANSCENDENTAL prismatic) lives — when it can't obscure gameplay.

---

## 6. Comparison overlay — the killer feature
Hover/focus a stash item against the equipped item in the **same slot**: a **delta strip** lists each stat with arrow + signed value (`▲ +6 Toughness`, `▼ −3 Speed`, missing-on-one-side treated as 0) in green/red, plus the affixes gained/lost spelled out. No conflated scalar (I4) — the per-stat truth + the live stat-sheet preview is what gives a confident equip decision.

---

## 7. Visual language, motion & performance (I7)
- **Rarity = color + ornament + glow + motion**, escalating by tier; TRANSCENDENTAL prismatic.
- **Motion/juice:** hover lift, equip thunk + socket flash, drop streak, number count-up. **Respect reduce-motion.**
- **Performance:** **pre-render rarity frames** (cache per tier); reuse `getIconImage`/`drawItemGlyph` caches; **cap animated effects (sparkle/prismatic) to the focused/hero card only**, never every visible grid cell. The heavy screens aren't in the hot game loop, but the stash grid can show many cards at once — keep cells static.
- **Typography:** keep Press Start 2P / Silkscreen honoring existing font-scale settings.

---

## 8. Cross-input support
- **Mouse:** hover-compare, click slots/cards, click-to-equip.
- **Gamepad:** the shared **GamepadFocusController (P0.5)** drives slot/card focus; `A` equips, `B` backs, `LB/RB` switch slot-filter tabs; focused card auto-shows compare; binding chips render controller-correct glyphs.
- **Touch:** large tap targets, tap-to-equip, compare as a bottom sheet. Ceremony/UPGRADE tags matter most here since build *is* the gameplay.
- **Accessibility:** colorblind-safe rarity (ornament/shape, not color alone), font scaling (existing), reduce-motion, focus-visible outlines.

---

## 9. Implementation phases (mapped to roadmap)

**Prereq:** Master P0.1 (Binding Registry), P0.2 (Glyph Set), P0.6 (ItemCard skeleton).

**P3 (rank 3) — ItemCard + comparison + stat sheet.** Build the unified card (3 variants, unified icon family per §3); refactor inventory overlay + drop feed to consume it; delta strip; stat bars + resist wheel + live preview. Solo MINOR + CHANGELOG; README if structure changes (new `item-card.js`).

**P7 (rank 7) — Armory redesign + stash grid + loot ceremony + gamepad/touch nav.** List-first Armory w/ equip-on-tap/click/A + juice; stash grid w/ filter/sort/badges; in-combat compact ceremony + post-wave Salvage Report; wire GamepadFocusController.

**P8 (rank 6) — Loadout panel + binding chips.** Weapons/abilities row with bindings (consumes Binding Registry); shared cooldown pips with the Co-Pilot.

*(Note: P8 ranks above P7 in value — do the loadout panel early once ItemCard exists, since it ties controls↔UI together cheaply.)*

---

## 10. Testing
- **Unit (Jest):** stat aggregation (equipped set → totals), compare-delta computation (incl. missing-stat = 0), affix→icon mapping. Pure functions.
- **QA (Playwright):** open Armory/Stash; equip via mouse/keyboard; assert slots + stat bars + compare strip update; gamepad-shim focus traversal; mobile tap-to-equip.
- **Visual:** snapshot ItemCard across all 8 rarities × 5 slots + weapon/ability variants to lock the rarity language; verify reduce-motion path.
- **Perf:** confirm pre-rendered frames + icon caches prevent per-frame rasterization, and that a full stash grid keeps animation to the focused card only.

---

## 11. Open questions (residual)
- **Armory layout:** list-first (default — responsive, fast) vs radial sockets (stretch wow). Recommend list-first; revisit radial after it ships.
- **Salvage/economy:** sell-for-gold deferred; grid leaves the hook.
- **Sort heuristic in grid:** if a coarse sort key is wanted, label it as a sort heuristic, never "item power" (I4).
- **Ceremony intensity:** strong flair only post-combat; in-combat stays compact, especially on mobile (I5).
- **Shop ↔ Armory unification depth:** shared ItemCard + icon family is committed; whether the bubble-tree itself gets restyled is a later polish call.
