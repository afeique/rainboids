# Mobile Planning — 2026-05-14

Snapshot version at audit: **5.99.1**. This document audits the mobile
experience end-to-end (input, HUD, layout, performance, content) and
proposes a prioritized backlog of quality-of-life and UI/UX
improvements. Each item lists a P-tier:

- **P0** — blocker / actively broken
- **P1** — high-impact, low-cost win
- **P2** — meaningful polish
- **P3** — nice-to-have

---

## 1. Dead-code platform helpers (P0)

Three platform-specific modules are fully implemented, fully unit-
tested, and **never invoked anywhere in the runtime path**:

| Module | What it does | Files |
|---|---|---|
| `js/modules/ui/mobile-tutorial.js` | First-run touch-controls tutorial overlay | exports `mountMobileTutorial`, `forceMountTutorial` |
| `js/modules/platform/wake-lock.js` | Keeps the screen from dimming during gameplay | exports `requestWakeLock`, `releaseWakeLock`, `attachAutoReacquireHandler` |
| `js/modules/platform/haptic.js` | Vibration API wrapper with preset patterns (LIGHT/MEDIUM/HEAVY/DOUBLE/LONG) | exports `vibrate`, `isHapticSupported` |

**Why this matters:** on a real phone today, the screen *will* dim
during a long wave (annoying), the player never sees a tutorial (the
new continuous-fire + drag-aim controls are not self-evident), and
hits/explosions don't have the tactile thump that mobile players
expect.

**Additional concern — the tutorial content is outdated:**

```js
const TUTORIAL_ITEMS = [
    { icon: '🎯', text: 'Tap enemies and asteroids to shoot at them' },
    { icon: '🤖', text: 'Your ship auto-dodges nearby threats' },
    { icon: '⚡', text: 'Long-press anywhere to change weapons' },
    { icon: '🔋', text: 'Power weapons auto-fire when charged' },
];
```

All four lines are wrong as of 5.99:

- "Tap" → "Press and hold; drag to retarget" (5.97)
- "Auto-dodges" → ship is **stationary** (5.94)
- "Long-press to change weapons" → use the PRM / PWR side buttons (5.94)
- "Power weapons auto-fire when charged" → still accurate ✓

**Actions:**
1. Rewrite `TUTORIAL_ITEMS` for 5.99 controls.
2. Call `mountMobileTutorial()` after the title screen launches the
   first run, *or* after the wave-1 intro overlay clears.
3. Call `requestWakeLock()` on `GAME_STATES.PLAYING` transition and
   `releaseWakeLock()` on GAME_OVER / leaving the page.
   `attachAutoReacquireHandler()` once at boot so a phone-switch tab
   doesn't kill the lock.
4. Add haptic calls at: hit (LIGHT), kill (MEDIUM), boss kill (HEAVY),
   pick-up stat drop (DOUBLE), game-over (LONG), level-up (DOUBLE).
   Gate on a user preference toggle in the pause menu's SFX tab so
   players who hate vibration can opt out.

---

## 2. No in-game gold readout on mobile (P1)

`status.js::drawBottomRightGold` is gated behind `!isMobile()`. The
mobile HUD shows HP + triforce + LV but **no gold**. Combined with the
5.99 shop change ("show gold only, hide SP"), the player has no way to
preview their wallet before opening the shop — they tap SHOP, see
their gold, and either close immediately (wasting a tap) or buy.

**Proposed fix:** render a compact gold readout under the LV badge in
the top-left HUD on mobile:

```
[🛡 LV12] 1,247 G
```

Use the same casino-roll animation as desktop (`_displayedMoney`
lerp). Hide on portrait under 360-wide if it would clash with the
sleek HP bar — flip to a corner-anchored variant instead.

---

## 3. No mobile defense-skill activation (P0)

Desktop binds defense-skill activation to `Q` and dash to `SHIFT`. On
mobile there is **no input** for either:

- `input-handler.js` only listens for keyboard events; mobile has no
  keyboard.
- `mobile-touch.js` only handles tap-to-aim, the PRM/PWR side
  buttons, and the wave-pick overlay — no skill / dash gestures.
- `mobile-touch.js` even has the comment "Long press is REMOVED" so
  there's no hold-gesture for dash either.

Net effect: the player can equip a defense skill via the radial, but
literally cannot use it on mobile. Skills like `BULWARK`, `EMP_PULSE`,
`REPAIR_NANITES` are inert. `DASH` (SHIFT key on desktop) is unused.

**Proposed fix (Option A — simplest):** Add a third side button below
PWR on the right edge: a `SKL` button that fires `input.activateSkill = true`
on tap. Mirror the existing PRM/PWR side-button pattern from
`hud-buttons.js`. Show the equipped skill's icon + cooldown ring.

**Proposed fix (Option B — Dash):** Two-finger tap or three-finger swipe
to trigger `input.dashPulse = true`. Or surface another canvas button.
Realistically the stationary-ship model makes dash less critical;
ship over Option A first.

---

## 4. No visible power weapon cooldown (P1)

Power weapons auto-fire on mobile (good) but the **PWR side button
shows no cooldown ring**, so the player can't anticipate when the next
fire will land. The desktop loadout square shows a clock-sweep
indicator; mobile lost this when 5.92 hid the loadout squares.

**Proposed fix:** Inside `hud-buttons.js::drawHudButtons`, when `r.kind === 'power'`,
overlay a circular cooldown sweep (already implemented in
`renderer.js::drawCooldownTimer` — just re-use that helper) using
`player.getPowerCooldownRemaining()`. Cooldown ring colors per weapon
(now distinct after 5.99.0).

Apply the same treatment to the SKL button (Item 3) once added.

---

## 5. Outdated `mobile-touch.js` HUD route comments (P3)

Several comments in `mobile-touch.js` reference behaviors that have
been removed (`auto-pilot`, `long-press radial gesture`, "press the
power-weapon button"). These don't affect runtime but make the file
hard to read for the next maintainer.

Audit and update:
- `_runHudButtonAction` comment block (line 115)
- The 5.91-5.93 long-press references in the header block

---

## 6. Healthbar overflows narrow portrait viewports (P1)

`status.js::updateHUD` uses hardcoded HUD layout numbers:

```js
const triforceLeftX = 36;
const barX = 70;
const barWidth = 220;
```

Plus `drawLevelAndCoinsDisplay` adds another `220 + 10 + shieldIconSize`
(~258 px) for the LV cluster. Total HUD-row width: **~328 px from the
left edge.** On a 360-wide phone in portrait that leaves **32 px** of
right-side margin — fine for the bar but the LV badge sits right
against the canvas edge (and gets cropped by the safe-area /
notch on iPhones with rounded corners).

**Proposed fix:** scale `barWidth` and the LV cluster on portrait:

```js
const _portrait = isMobile() && isPortrait();
const barWidth = _portrait ? Math.min(180, canvasW - 110) : 220;
```

Same treatment for `drawLevelAndCoinsDisplay`'s `+ 220` constant.

---

## 7. Stats screen layout on 360w portrait (P2)

`#stats-overlay` has `z-index: 9000` and renders a multi-column panel
with the player's offensive/defensive stat block. No mobile-portrait
CSS overrides — likely scrolls horizontally on narrow phones and the
tooltip overflow is unbounded.

**Action:** Read through `stats-overlay.js` + the stats CSS; add a
`body.mobile-portrait #stats-panel { ... }` block that:
- Collapses the two-column layout to a single column.
- Scales the panel `transform: scale(0.85)` like the pause / shop
  panels.
- Renders the tooltip as a bottom-anchored sheet, not a floating
  popover (touch-friendly).

---

## 8. Skipping the wave-clear pick on every wave is mandatory (P2)

After 5.98 the mobile player must tap one of 3 cards on every wave
clear to continue. There's no "skip" button. This is by design (the
3-card pick *is* the reward), but two failure modes exist:

- **All powerups maxed:** my 5.98 code falls through automatically.
  Good.
- **Player wants to ignore the choice and rush the next wave:** today
  they must pick *something*. If three offered powerups all suck for
  the build (e.g. crit on a non-crit lance build), the player gets
  forced into a bad stack.

**Proposed fix:** Add a tiny "RE-ROLL" link (gold cost ~50 × wave#) at
the bottom of the wave-pick overlay. Single re-roll per wave. Lets
the player escape a bad triplet without breaking the "always pick
something" rule.

---

## 9. Damage numbers / floating text vs portrait zoom (P2)

The camera applies `scale(0.65)` on portrait — every world-space
overlay shrinks proportionally. Damage numbers, level-up popups, the
combo counter — all are rendered in world space and become hard to
read on a 360-wide canvas.

**Proposed fix:** Move damage numbers to **canvas-space** on mobile:
compute the world position, transform to canvas-space via the camera
transform (the inverse of `screenToWorldCoordinates`), draw with a
fixed pixel font that doesn't scale. Same treatment for level-up
text and combo readouts.

---

## 10. Reticle vs camera zoom mismatch (P2)

`hud/mobile-reticle.js` draws a 24-px-radius crosshair in **canvas
space** (correctly — it's anchored to the finger). But the player
ship + enemies render in **world space** with the 0.65 zoom. Result:
the reticle visually feels OUTSIZED relative to the entities it's
targeting on portrait. Roughly 24/0.65 = 37 world-px equivalent.

**Proposed fix:** Scale the reticle constants on portrait:

```js
const RETICLE_RADIUS = _portrait ? 18 : 24;
const CROSS_HALF_LEN = _portrait ? 7 : 10;
```

---

## 11. Audio: no mid-game mute button on mobile (P2)

Mute requires opening the pause menu → SFX/MUSIC tab → sliding to 0.
Three taps + a slow gesture. On a phone in a public space, the player
often wants to hard-mute in one tap.

**Proposed fix:** Add a small `🔇` toggle next to the PAUSE canvas
button on mobile, or as a fourth bottom-bar button. Toggles a single
`muteAll` flag in audio-manager (independent of the volume sliders).

---

## 12. Orientation handling is a no-op (P3)

```js
checkOrientation() {
    // Desktop-only build: no orientation handling. Kept as a no-op so the
    // ui:check-orientation event bus subscription stays valid.
    return false;
}
```

The `ORIENTATION_LOCK` state exists in `constants.js` and is in the
state machine's allowed-transitions table, but **nothing transitions
into it**. Mobile players who hold the phone the "wrong way" get a
working but cramped layout instead of a friendly prompt.

**Proposed fix:** Pick a preferred orientation (probably **portrait**
given the stationary-ship + side-button layout) and:

- On mobile rotate to landscape, transition to `ORIENTATION_LOCK`
  with an overlay: *"Rotate your device to play"*.
- Auto-resume to the previous state on rotate back.
- Add a "Play in any orientation" toggle in the pause menu for users
  who prefer landscape.

---

## 13. Stat pickup visibility (P1)

`StatPickup.draw` renders a 14-px-radius square with a halo. On a
portrait phone with the 0.65 camera zoom, that's an effective **~9
world-px** visual. Easy to miss in combat, easy to mistake for
debris.

**Proposed fix:**
- Bump the base radius to **22 px** in `stat-pickup.js`.
- Add a brief **arrival animation**: spawn-pulse (radius grows from
  0 to full over 0.4s) so the drop announces itself.
- Add an arrow indicator that points to the pickup when it's off-screen
  (mobile only — desktop player can fly to it).

---

## 14. Wave-pick overlay clips behind safe-area on iPhones with notch (P2)

`#wave-pick-overlay` uses `inset: 0` and `padding: 16px`, no
`env(safe-area-inset-*)` use. On notched iPhones the title may sit
under the notch.

**Proposed fix:** Add to the CSS:

```css
#wave-pick-overlay {
    padding-top: max(16px, env(safe-area-inset-top));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
}
```

Apply the same `env(safe-area-inset-*)` pattern to:
- `#pause-overlay`
- `#shop-overlay`
- `#stats-overlay`
- Wave-intro and game-over canvas overlays (in JS — Math.max top
  position against a CSS variable readback).

---

## 15. Performance ceiling on cheap Android phones (P2)

A few performance hotspots that may exceed cheap-Android budgets:

- `BACKGROUND_STAR_COUNT × WEBGL_BACKGROUND_STAR_MULTIPLIER = 30 × 6 = 180`
  WebGL star instances. Plus 25 ColorStars. ~205 instanced stars
  every frame.
- `MAX_WAVE_ASTEROIDS = 16` and the original wave roster up to 14
  enemies/wave (post-5.99.1 mobile scaling cuts this to ~8).
- `dodgePlayerBullets` runs per-enemy per-tick over the full bullet
  pool with an AABB pre-cull. At 20 enemies + 150 bullets ≈ 3000
  ops/frame. Probably fine.

**Proposed mitigations** if real-device testing shows frame drops:
- On mobile, drop `WEBGL_BACKGROUND_STAR_MULTIPLIER` from 6 → 3 (still
  ~120 stars — plenty visually).
- Cap `MAX_WAVE_ASTEROIDS` to 10 on mobile (the spawner already
  thins to ~1-2 per wave on mobile via 5.99.1's scaling — the cap
  is defense-in-depth).
- Skip the per-enemy `dodgePlayerBullets` AABB scan once per ~3
  frames on mobile (`if ((this._aiTick++ & 3) !== 0) skip`).

---

## 16. Tutorial misalignment with actual controls (P0)

Already covered in §1 — calling it out separately because if items
14, 15, 16 are batched, this is the single highest-ROI mobile fix:
a clear 4-line tutorial that says exactly what 5.99's controls do.

Proposed new text:

```js
const TUTORIAL_ITEMS = [
    { icon: '🎯', text: 'Press and hold the canvas — drag to aim' },
    { icon: '🔋', text: 'Your power weapon auto-fires when ready' },
    { icon: '🔫', text: 'PRM / PWR buttons swap weapons' },
    { icon: '💎', text: 'Wave clear gives you 1 of 3 random powerups' },
];
```

---

## 17. Wave-clear pick visual polish (P3)

Minor: when a card is tapped the overlay closes instantly. Player
might wonder if the pick registered. Add a brief flash + scale-up
animation on the tapped card (0.25s) before dismiss, mirroring the
title-screen button-press feedback. Pair with a haptic LIGHT.

---

## 18. Crit screen-flash is hostile to mobile players (P0 — user-reported)

Crits trigger a brief full-screen flash via `triggerScreenFlash`. On
mobile this is much more invasive than on a 27" desktop monitor — the
player is holding the device 30 cm from their face, and a sustained
combat run produces dozens of flashes per minute. Reported by user;
also a potential accessibility issue (photosensitive players).

**Proposed fix:** Suppress the crit screen-flash entirely. Keep
crit damage numbers and crit hit-stop (those are visible without
being aggressive).

---

## 19. Shop tab strip on portrait still wraps two rows (P2)

After 5.99.0's tab tinting and 5.99 mobile font scaling (tab font 10 →
9 px portrait), the 11-tab strip (HELP + 4 primaries + 6 power weapons)
still wraps to **2-3 rows** on a 360-wide phone. The tab list is
`flex-wrap: wrap` so wrapping is graceful, but the shop header eats
~80 px of vertical space.

**Options:**
- Convert the tab strip to a horizontal swipe carousel on portrait
  (one visible tab + one peeked).
- Collapse HELP into the pause-menu CONTROLS tab and remove it from
  the shop, saving one tab.
- Show only the player's **owned** weapons as tabs, hiding the rest
  until unlocked (4 → 2 tabs at wave 5, 4 tabs at wave 8, etc.).

---

## 20. Random items / Diablo-style drops (P1 — user-requested follow-up)

The user has requested:

- Mobile stat drops should scale with wave / player level.
- Drops should have random names from a name pool.
- Drops should be defensive only (HP + toughness).
- Drops should be more frequent.
- Stats screen should display the player's "inventory" — best item
  per slot + bonus.
- Lower-level drops should be replaced by higher-level drops on
  pickup.

This is a substantial new system (`StatPickup` currently grants flat
+5 HP / +3% defense; the new design adds tiers, names, slot semantics,
inventory UI). Treat as a follow-up planning doc — sketched here:

- **Slot system:** Helm / Shield / Plating / Core (4 slots, all
  defensive). Each slot can hold 1 item; pickups replace if the new
  item's "level" exceeds the equipped item's level.
- **Tiers:** Tier scales with current wave. Wave 1-3 = Tier 1, Wave
  4-7 = Tier 2, Wave 8-12 = Tier 3, etc. Bonus magnitude scales
  with tier.
- **Naming:** template `[Adjective] [Noun] of [Suffix]`. E.g.
  *"Solid Hull Plating of the Bear"* (+8 HP, +2% def).
- **Inventory UI:** new section in the stats overlay listing the 4
  equipped items + their bonus.
- **Drop rate:** bump from ~0.8% / ~0.6% to ~2.5% / ~2.0% on mobile.
- **Pickup feedback:** brief modal toast with item name, tier, and
  bonus (replaces the current "+5 MAX HEALTH" subtitle).

Effort estimate: medium (similar scope to the wave-pick overlay).

---

## Prioritized backlog summary

| P | # | Item | Effort |
|---|---|------|--------|
| 0 | 1  | Wire tutorial + wake-lock + haptic | S |
| 0 | 3  | Mobile defense-skill activation button | S |
| 0 | 16 | Rewrite tutorial content for 5.99 controls | XS |
| 0 | 18 | Suppress crit screen-flash | XS |
| 1 | 2  | Mobile HUD gold readout | XS |
| 1 | 4  | Power-weapon cooldown ring on PWR button | S |
| 1 | 6  | Healthbar fit on 360w portrait | S |
| 1 | 13 | Stat pickup visibility (size + arrival anim + offscreen arrow) | M |
| 1 | 20 | Random Diablo-style item system | M-L |
| 2 | 7  | Stats screen layout for portrait | M |
| 2 | 8  | Wave-pick re-roll option | S |
| 2 | 9  | Damage numbers in canvas-space on mobile | S |
| 2 | 10 | Reticle scale on portrait | XS |
| 2 | 11 | In-game mute button | S |
| 2 | 14 | Safe-area-inset CSS pass | S |
| 2 | 15 | Performance ceiling mitigations | M |
| 2 | 19 | Shop tab strip carousel on portrait | M |
| 3 | 5  | Update outdated mobile-touch comments | XS |
| 3 | 12 | Orientation lock prompt | M |
| 3 | 17 | Wave-pick card tap animation | XS |

---

## Out of scope (intentionally)

- **Multiplayer mobile.** The current MP build assumes a desktop
  client. Mobile MP is a separate planning effort.
- **Save/sync across devices.** Local-only saves are fine for now.
- **In-app purchases / monetization.** Not part of the product.
- **Native app shell.** PWA install banner would be a nice-to-have but
  is independent of the in-game experience.

## Recommended next sprint

Bundle the **P0 + a handful of P1s** into a single 5.99.x → 6.0.0
mobile-polish release:

1. **§16** (rewrite tutorial copy) → 30 min
2. **§1** (wire tutorial mount + wake-lock + haptic baseline) → 2 h
3. **§3** (SKL side button) → 1 h
4. **§18** (suppress crit flash) → 15 min
5. **§2** (gold readout) → 30 min
6. **§4** (power-weapon cooldown ring) → 1 h
7. **§13** (stat pickup visibility) → 1 h

About a half-day of work, and it covers every "the game feels broken
on mobile" complaint the user is likely to hit on first contact with
real hardware.
