	# Emoji → SVG Transition Plan

**Date:** 2026-05-07
**Author:** auto-generated via codebase audit
**Status:** Planning — no implementation yet
**Source library:** [svgrepo.com](https://www.svgrepo.com/) — public-domain / MIT / CC0 SVG icons

---

## Goal

Replace all UI emoji icons with vector SVG paths. Emojis render inconsistently across platforms (Windows/macOS/Linux/Android each ship a different emoji set), don't scale cleanly with the rest of the pixel-art / Press Start 2P aesthetic, and can't be tinted by CSS `currentColor`. Inline SVG paths render identically everywhere, scale to any size, and accept `fill` overrides for the gold-accent (`#FFC107`) / per-tier color theming the game already uses.

---

## Scope

**In scope (55 unique emoji icons across the codebase):**

| File | Emoji uses |
|---|---|
| `js/modules/combat/weapon-data.js` | ~70 (primary/power/skill upgrades, masteries) |
| `js/modules/combat/combat-manager.js` | 15 (powerup configs) |
| `js/modules/shop/shop-manager.js` | ~20 (defense items) |
| `js/modules/shop/shop-dom.js` | 2 (tab headers) |
| `index.html` | 0 (audit confirmed clean) |

**Out of scope:**
- `kbd-arrow` chevrons (`›`) — these are typographic glyphs, not emoji.
- Existing `<svg>` blocks in the music-player controls (already vector).
- Console/comment text — no need to migrate.
- Decorative emoji in CHANGELOG / README — markdown documents, not UI.

---

## Architecture

Three-step migration so the existing string-based icon API doesn't have to change everywhere at once:

1. **Add an icon registry** (`js/modules/ui/icons.js`) that maps a slug like `'shield'` to an inline-SVG string. The SVG strings are imported as raw text from sibling `.svg` files in `js/modules/ui/icons/`.
2. **Add a renderer helper** `renderIcon(slug, { size, color })` that returns an `<svg>` HTMLElement (or innerHTML string) sized to `size` px and tinted via `fill="currentColor"` so CSS controls color.
3. **Migrate call sites in waves** — the existing `icon: '🛡️'` shape stays valid; the renderer just falls back to text when the slug isn't found, so we can ship one batch per session without breaking anything else. New entries write `icon: 'shield'`; old ones get rewritten as we touch each shop tab.

A single 32×32 icon at the standard svgrepo style averages ~600 bytes of SVG path data; 55 icons × ~600 B = **~33 KB** total inline overhead, well under the cost of a single emoji font render.

---

## Replacement Table

For every emoji currently in use, this maps to a concept slug + a suggested svgrepo keyword. Pick whichever icon style reads cleanest at 24-32 px against a dark background — the linked search URL surfaces multiple candidates per concept.

Style preference: **bold line** (line-weight 2-3 px stroke) or **filled-shape** (solid silhouette). Avoid duotone or multicolor — the game theme is single-color glyphs on dark backgrounds, tinted by surrounding gradient cards.

| Current | Slug                     | Concept                           | svgrepo search                                    |
| :-----: | ------------------------ | --------------------------------- | ------------------------------------------------- |
|   🛡️   | `shield`                 | defense / damage reduction        | https://www.svgrepo.com/vectors/shield/           |
|   🛡    | `shield`                 | (variant — same concept, no FE0F) | https://www.svgrepo.com/vectors/shield/           |
|    ⚡    | `bolt`                   | rapid / electricity               | https://www.svgrepo.com/vectors/lightning-bolt/   |
|   ✳️    | `multi-shot`             | spread / fanout asterisk          | https://www.svgrepo.com/vectors/asterisk/         |
|   💨    | `wind`                   | speed / motion                    | https://www.svgrepo.com/vectors/wind/             |
|   🔵    | `circle-fill`            | bullet / projectile               | https://www.svgrepo.com/vectors/circle/           |
|   🏹    | `bow-arrow`              | piercing / range                  | https://www.svgrepo.com/vectors/bow-arrow/        |
|   💣    | `bomb`                   | explosive / AoE                   | https://www.svgrepo.com/vectors/bomb/             |
|   🎯    | `target`                 | aim / homing                      | https://www.svgrepo.com/vectors/target/           |
|   ❤️    | `heart`                  | health / HP                       | https://www.svgrepo.com/vectors/heart/            |
|   🗡️   | `dagger`                 | crit / blade                      | https://www.svgrepo.com/vectors/dagger/           |
|   🔋    | `battery`                | charge / capacitor                | https://www.svgrepo.com/vectors/battery/          |
|   ⏱️    | `stopwatch`              | timer / cooldown                  | https://www.svgrepo.com/vectors/stopwatch/        |
|    ⏳    | `hourglass`              | duration / triage                 | https://www.svgrepo.com/vectors/hourglass/        |
|    ⏩    | `fast-forward`           | speedrun                          | https://www.svgrepo.com/vectors/fast-forward/     |
|    ⏸    | `pause`                  | pause                             | https://www.svgrepo.com/vectors/pause/            |
|   ↩️    | `undo`                   | reset / back                      | https://www.svgrepo.com/vectors/undo/             |
|   ☠️    | `skull`                  | poison / lethal                   | https://www.svgrepo.com/vectors/skull/            |
|    ✊    | `fist`                   | bulwark / stance                  | https://www.svgrepo.com/vectors/fist/             |
|    ✨    | `sparkle`                | bonus / highlight                 | https://www.svgrepo.com/vectors/sparkles/         |
|    ⭐    | `star`                   | mastery / capstone                | https://www.svgrepo.com/vectors/star/             |
|   🌀    | `vortex`                 | tractor / pull                    | https://www.svgrepo.com/vectors/spiral/           |
|   🌊    | `wave`                   | wave (game phase)                 | https://www.svgrepo.com/vectors/wave/             |
|   🌧️   | `rain`                   | needle storm                      | https://www.svgrepo.com/vectors/rain/             |
|   🌪️   | `tornado`                | needle storm rate                 | https://www.svgrepo.com/vectors/tornado/          |
|   🎖️   | `medal`                  | weapon mastery capstone           | https://www.svgrepo.com/vectors/medal/            |
|   🐌    | `snail`                  | slow effect                       | https://www.svgrepo.com/vectors/snail/            |
|   👻    | `ghost`                  | phase dash                        | https://www.svgrepo.com/vectors/ghost/            |
|   💊    | `pill`                   | medpack                           | https://www.svgrepo.com/vectors/pill/             |
|   💎    | `gem`                    | rare / premium                    | https://www.svgrepo.com/vectors/gem/              |
|   💚    | `heart-green`            | bonus heal                        | (use `heart` slug, tint via CSS `color: #66ffaa`) |
|   💢    | `anger`                  | impact / hit                      | https://www.svgrepo.com/vectors/anger/            |
|   💥    | `explosion`              | blast / fragmenting               | https://www.svgrepo.com/vectors/explosion/        |
|   💫    | `dizzy`                  | nova / stun                       | https://www.svgrepo.com/vectors/star-shooting/    |
|   💰    | `money-bag`              | gold / payday                     | https://www.svgrepo.com/vectors/money-bag/        |
|   📊    | `chart`                  | stats overlay                     | https://www.svgrepo.com/vectors/bar-chart/        |
|   📐    | `ruler`                  | precision / spread                | https://www.svgrepo.com/vectors/ruler/            |
|   📡    | `satellite`              | radar / tracking                  | https://www.svgrepo.com/vectors/satellite-dish/   |
|   🔀    | `shuffle`                | random track                      | https://www.svgrepo.com/vectors/shuffle/          |
|   🔁    | `loop`                   | repeat / echo round               | https://www.svgrepo.com/vectors/loop/             |
|   🔇    | `mute`                   | suppression                       | https://www.svgrepo.com/vectors/mute/             |
|   🔊    | `volume`                 | audio                             | https://www.svgrepo.com/vectors/volume/           |
|   🔗    | `chain`                  | daisy chain                       | https://www.svgrepo.com/vectors/chain/            |
|   🔥    | `fire`                   | DoT / burn                        | https://www.svgrepo.com/vectors/fire/             |
|   🔦    | `flashlight`             | beam / lance                      | https://www.svgrepo.com/vectors/flashlight/       |
|   🔧    | `wrench`                 | tight-choke / tuning              | https://www.svgrepo.com/vectors/wrench/           |
|   🔫    | `pistol`                 | pulse cannon                      | https://www.svgrepo.com/vectors/pistol/           |
|   🔮    | `crystal-ball`           | mystic / chance                   | https://www.svgrepo.com/vectors/crystal-ball/     |
|   🚀    | `rocket`                 | spare ship / boost                | https://www.svgrepo.com/vectors/rocket/           |
|   🚄    | `bullet-train`           | velocity upgrade                  | https://www.svgrepo.com/vectors/bullet-train/     |
|   🚨    | `siren`                  | alert / warning                   | https://www.svgrepo.com/vectors/siren/            |
|   🛒    | `cart`                   | shop                              | https://www.svgrepo.com/vectors/shopping-cart/    |
|   🧬    | `dna`                    | helix / lance beam                | https://www.svgrepo.com/vectors/dna/              |
|   🧲    | `magnet`                 | tractor / collection              | https://www.svgrepo.com/vectors/magnet/           |
| 'coin'  | (literal string already) | n/a — already a slug              | https://www.svgrepo.com/vectors/coin/             |

---

## Selection Criteria

When picking the specific SVG from each search result:

1. **Single-color, line or solid.** Skip duotone, gradient, isometric, hand-drawn.
2. **24×24 or 32×32 viewBox preferred.** The shop card's icon slot is 32 px square; mismatched viewBoxes complicate sizing.
3. **`fill="currentColor"` compatible.** Either the source uses `currentColor`, or only one fill that we can `replace()` to `currentColor` at import time.
4. **Outline weight ≥ 2 px at 24-px scale.** Thinner strokes vanish against the cards' bright gradient backgrounds.
5. **Concept-readable at 16 px.** Some shop sub-views render the icon small; an icon that needs the full 48 px to be legible is the wrong pick.

---

## Proposed Import Flow

For each picked SVG:

1. Download to `js/modules/ui/icons/<slug>.svg`.
2. Strip XML declaration, comments, `width`/`height` attributes, and any non-essential metadata. Keep the `viewBox`.
3. Replace any `fill="#xxx"` with `fill="currentColor"`.
4. Verify total file size ≤ 1 KB.
5. Register in `js/modules/ui/icons.js`:
   ```js
   import shield from './icons/shield.svg?raw';
   export const ICONS = { shield, /* ... */ };
   ```
   (Plain `import` of `.svg` files needs a Vite/bundler step, or alternately we ship a generated `icons-bundle.js` that exports a string map. Pick whichever path matches the existing build setup — the project ships from `js/main.js` directly, so a hand-rolled string-map module is simpler.)
6. Update one shop renderer at a time to use `renderIcon(slug)` instead of inline emoji.

---

## Rollout Order

Migrate by file, not by concept, so each session's PR covers one cohesive surface area:

1. **`shop-dom.js` tab headers** (2 icons — `shield` + `bolt`). Smallest blast radius; validates the renderer end-to-end.
2. **`shop-manager.js` defense tab** (~7 icons). Most user-visible; high-impact polish.
3. **`combat-manager.js` powerup configs** (15 icons). Pickup banners + powerup HUD list.
4. **`weapon-data.js` primary/power weapon definitions** (~10 icons). Top-of-tab labels.
5. **`weapon-data.js` upgrade trees** (~50 icons). Largest set; deferred last so any fallback gaps surface during steps 1-4 first.

Each migration step is independently shippable — the renderer's emoji-fallback path means a half-migrated codebase still renders correctly.

---

## Risks / Open Questions

- **Bundler.** Project loads from `js/main.js` directly without a bundler step. If we want `import x from './icons/x.svg?raw'` syntax, we'd need to add Vite or roll the icons into a single hand-edited string map (preferred — keeps the no-bundler dev loop intact).
- **Emoji on touch / share / system UI.** A handful of emoji appear in pickup-banner toast text (`Powerup acquired: ⚡ Rapid Fire`) — those need to either swap to inline-SVG via DOM or stay as emoji. Decide per-call-site during migration.
- **Localization.** SVG icons are language-agnostic; this transition slightly improves I18n readiness as a side effect.
- **A11y.** Each SVG should have a `<title>` or `aria-label` so screen readers announce "shield" instead of "image."
