# Mobile Gameplay Brainstorm — 2026-05-14

The current mobile model (5.99.4: stationary ship + press-and-hold
aim + drag to retarget + auto-fire power + Diablo items) is solid
but unusual. The user is asking whether something **simpler and more
fun with single-touch** would be better — possibly inverted (player
dodges, AI shoots) or even a Galaga/Galaxian clone.

This doc surveys what works on mobile, brainstorms six concrete
alternatives, compares them, and recommends a direction.

---

## 1. Design constraints (mobile reality)

Anything we ship needs to respect:

- **Single finger.** No multi-touch, no chords. The other hand holds
  the phone.
- **Finger occlusion.** Where the player touches, they cannot see.
  Putting their finger on the ship hides the ship.
- **Small viewport.** 360–430 px wide in portrait. Every HUD pixel is
  scarce.
- **Short sessions.** 2-5 minutes between menu interruptions, train
  stops, etc. The control scheme has to be *learnable in 5 seconds*.
- **One-handed play.** Optimal grip: thumb on screen, fingers behind.
  The thumb wants to live in the bottom half of the screen.
- **No keyboard.** No keybindings, no muscle memory from desktop.

---

## 2. Survey: how successful mobile shmups handle touch

Without naming specific titles I can't verify, the established
patterns are:

| Pattern | How it works | Example category |
|---|---|---|
| **Drag-to-move (direct)** | Touch anywhere on the canvas; ship follows finger position. | Most modern bullet-hell, gallery shooters |
| **Drag-to-move (relative / joystick)** | Touch becomes a virtual stick origin; drag direction = thrust. | Twin-stick mobile games |
| **Tap-to-fire / tap-targets** | Tap = shot in that direction, or tap = pick an enemy. | Casual / point-and-shoot |
| **Auto-fire universal** | Almost every modern mobile shmup auto-fires. Players don't tap fire. | Universal |
| **Auto-aim universal** | Auto-aim picks nearest threat. | Most successful mobile shmups |
| **Tap for special** | Tap a corner button for a smart bomb / power weapon. | Sky-force-likes |
| **Locked-axis (Galaxian)** | Ship moves only on a single horizontal strip. | Retro/arcade ports |

**Universal observation:** modern mobile shmups have **moved the
skill expression from aiming to positioning.** Players aren't great
at touch-aim under pressure; they're great at *moving the ship to
the safe spot* while the AI handles fire.

Rainboids' current model goes against this: it puts aim on the player
and stationary-ship on the player, making **the entire gameplay loop
"point a finger at things you want dead."** That's a competent design
but it sacrifices the genre's main mobile-friendly affordance.

---

## 3. Current model (5.99.4) — what works and what doesn't

**Works:**
- Press-and-hold + drag is intuitive once you try it
- Aim-at-finger doesn't need a UI affordance
- Stationary ship → simple camera, no occlusion at ship
- Auto-fire power weapon already removes one decision
- Drops auto-fly (5.99) — perfect mobile fit
- Diablo defense items (5.99.4) — a meaningful progression layer

**Doesn't:**
- **Finger blocks the playfield** the whole time you're firing. You
  literally cannot see enemies that pass under your finger.
- **No positional skill.** Player can't move. Enemies that close to
  contact-range are an unavoidable hit until you kill them.
- **Aim-at-finger means the ship's facing follows the finger.** But
  the player is looking AT the finger, not at the ship. The ship's
  rotation is purely decorative from the player's POV.
- **5-button HUD bar at the bottom + finger on canvas** — there's
  no clean "thumb resting zone." Players have to be deliberate.
- **Skill ceiling is low.** A casual player and an expert player play
  almost identically.

---

## 4. Brainstorm: six alternative models

### A. Direct Drag-to-Move (Sky-force-like) ⭐ recommended

Touch anywhere on canvas → ship smoothly tracks the finger position
(with a small upward offset so the finger doesn't occlude the ship).
Release = ship freezes. Auto-aim picks the nearest enemy; auto-fire
holds primary continuously; power weapon auto-fires when ready.

**Player loop:** drag the ship through openings in bullet streams,
weave between enemies, collect drops auto-magneted to you. Skill is
**positional flow** + reading enemy patterns.

**Why it might be great:**
- Single-finger, hands stay at the bottom of the screen, view is
  unobstructed.
- The "dodge while everything explodes around you" feeling is the
  exact match for Rainboids' visual palette (colorful chaos).
- All existing systems remain relevant: weapons (auto-aim picks
  targets; weapon stats matter), powerups (offensive ones still
  matter via auto-fire), Diablo items (you WILL take some hits while
  learning routes; defense matters more, not less).
- The 5.97 parallax background is most beautiful when the ship is
  drifting — you're moving *through* the field, not parked in it.
- Onboarding is one sentence: *"Drag your ship around to dodge."*

**Why it might be risky:**
- Reverses the 5.94 stationary-ship pivot. Some work to unwind.
- The mobile camera-zoom (0.65 portrait) feels right for stationary
  play but might feel small for a moving ship. May need to bump to
  0.75 or 0.85.
- Player ship becomes a target the player has to actively defend —
  more deaths in early waves than 5.99.2's gentler tuning produces.
  Probably need another balance pass.

---

### B. Relative drag / virtual thumbstick

Touch becomes a thumbstick origin; drag in a direction = thrust that
way. Ship has inertia. Auto-fire + auto-aim same as A.

**Why it might be great:**
- "Feels like a spaceship" (momentum, drift, glide).
- The thumbstick origin moves to where the finger is, so the player
  can put their finger anywhere comfortable.

**Why it might not:**
- Less intuitive than direct-drag for a casual mobile player.
- Inertia means the player has to predict their stop — adds skill
  ceiling but adds friction.
- More like a "tilt-shooter" than a pickup-and-play.

---

### C. Galaxian / Galaga clone (bottom-locked)

Ship locked to the bottom 1/5 of the screen. Drag horizontally to
move left/right. Auto-fire upward. Enemies attack in formations from
the top, occasionally diving.

**Why it might be great:**
- The single simplest possible mobile shmup.
- Massive nostalgia tap. Reads instantly to anyone over 30.
- Could be a 1-week port (the existing wave system, the weapon
  variety, the boss waves all map cleanly).

**Why it might not:**
- It IS a different game. Rainboids today has 360° combat,
  free-flying asteroids, nebula, multiplayer (desktop). A
  Galaga-style restriction throws most of that away on mobile.
- Loses the colorful-3D-feel of the starfield; locked-bottom looks
  flatter.
- "Could be a separate mobile-only spin-off product" is the most
  honest framing — bundling it into Rainboids dilutes the brand.

---

### D. Swipe-to-dodge (timing-based)

Ship auto-pilots through the field at a constant velocity. Tap or
swipe in a direction triggers a quick dash that way. Auto-fire +
auto-aim run continuously.

**Player loop:** read incoming bullet patterns, dash at the right
moment to slip through gaps.

**Why it might be great:**
- Very arcade-y / very tight.
- The auto-pilot solves the "where do I go between threats"
  question and the player just reacts to the threats themselves.
- One-finger, low precision needed.

**Why it might not:**
- Removes most positional skill — feels hollower than A over a
  session.
- Hard to telegraph: the player can't preview where the auto-pilot
  is heading.
- New input vocabulary to learn (swipe vs tap vs hold).

---

### E. Bullet time on hold

Default: ship auto-pilots, auto-fires, auto-aims. **Holding finger**
slows time to ~25% so the player can reposition. Release = time
resumes.

**Why it might be great:**
- One gesture (hold). Instantly explains the skill.
- Encourages dramatic save-myself moments.
- Builds in a "rest" mechanic where the player can take a breath.

**Why it might not:**
- Bullet-time is a dopamine-rich mechanic that almost always becomes
  load-bearing (the game balances around the slow-mo). Big design
  ripple.
- "Hold to slow time" isn't intuitive on first try — needs a tutorial
  prompt.

---

### F. Hybrid: drag-to-move + tap for power weapon

Same as A, but tap (without dragging) fires the power weapon
manually instead of auto. Restores one decision point ("when do I
spend the cooldown?") for players who want a tiny skill expression.

**Why it might be great:**
- Same simplicity as A on the floor; one extra layer for skill
  expression at the ceiling.
- Power weapon timing was the most rewarding decision on desktop
  (especially CHARGE_SHOT). Mobile auto-fire flattens that.

**Why it might not:**
- Two gestures (drag and tap) where one would suffice.
- Risk of mis-firing: a tap that ends up as a tiny drag will move the
  ship instead of firing.

---

## 5. Comparison matrix

| | Simplicity | Fun (casual) | Fits Rainboids identity | Effort to ship | Skill ceiling |
|---|---|---|---|---|---|
| A. Drag-to-Move | ★★★★★ | ★★★★★ | ★★★★★ | Medium | ★★★★ |
| B. Virtual joystick | ★★★★ | ★★★★ | ★★★★★ | Medium | ★★★★ |
| C. Galaxian | ★★★★★ | ★★★★ (nostalgia) | ★★ | Large (it's a new game) | ★★★ |
| D. Swipe-to-dodge | ★★★★ | ★★★ | ★★★ | Medium | ★★ |
| E. Bullet time | ★★★ | ★★★★ | ★★★ | Large | ★★★ |
| F. Drag + tap power | ★★★★ | ★★★★★ | ★★★★★ | Medium | ★★★★★ |

---

## 6. Recommendation: **Model A — Drag-to-Move with autofire + auto-aim**

(or **Model F** if you want to preserve power-weapon decision-making)

**Reasoning:**
- It's the proven mobile shmup template — players know it from
  countless ports and originals.
- One sentence of tutorial: *"Drag your ship to dodge."*
- The finger lives in the bottom half of the screen by natural grip
  ergonomics; the action happens in the top half; **occlusion goes
  to zero.**
- Skill expression migrates from "where do I aim" (which mobile is
  bad at) to "where do I sit" (which mobile is great at).
- Every existing Rainboids system stays relevant:
  - Weapon roster (auto-aim picks targets; weapon stats still
    matter — fire rate, spread, range, etc.).
  - Powerups still buff offense and defense.
  - Diablo defensive items still progress the player's survival
    floor.
  - Parallax starfield + nebula are most beautiful when the player
    is *moving through* them.
  - Wave-pick 3-card system survives unchanged.
  - Boss waves still feel like milestones.
- It's the inversion the user proposed: **dodge enemies, AI handles
  combat**.

**What changes vs 5.99.4:**

| 5.99.4 mobile | Proposed |
|---|---|
| Ship stationary | Ship drags to finger position |
| Press-and-hold aim at finger | (removed — auto-aim handles it) |
| Drag retargets aim | Drag moves the ship |
| Touch-end stops fire | Auto-fire is always on while alive |
| Auto-fire power weapon when ready | Same |
| Auto-aim and auto-fire disabled on mobile (5.95.1) | RE-ENABLED on mobile |
| Camera zoom 0.65 portrait / 0.8 landscape | Probably 0.75 / 0.9 — moving ship needs slightly more world visible |
| HUD: PRM/PWR at bottom corners, SHOP/STATS/PAUSE center | Unchanged; bottom row stays. Finger stays in the top 2/3 of the screen anyway |

**Risks worth surfacing:**
1. **Ship occlusion under finger.** Solve with a small upward offset
   (the ship sits ~40-60 px above where the finger touched). Sky
   Force does this; players adapt within seconds.
2. **Players who liked the 5.97 press-and-hold model.** A small
   audience but real. Could keep both modes behind a settings toggle
   ("Classic Aim" / "Dodge").
3. **Existing balance tuning** (mobile damage scaling, drop rates,
   enemy thinning) was tuned for the stationary model. Will need a
   balance pass — but the *direction* (early waves should feel
   gentle, late waves should pressure) stays valid.
4. **Diablo items become more meaningful, not less.** The player
   will take some hits while learning routes. Toughness + HP items
   gate how forgiving early death feels.

---

## 7. Why NOT the Galaxian clone

The Galaxian / Galaxia clone IS the simplest possible model. It
would absolutely work on mobile. But:

- It's a different game. Rainboids' identity (free-flying 360°
  combat, nebula, multiplayer, asteroid field, the colorful chaos)
  doesn't survive the bottom-lock.
- It would require a separate balance / wave / asteroid pass since
  the spatial model changes entirely.
- The user already has a working Rainboids; pivoting to Galaga
  throws away invested systems for a nostalgia hit.

**If you want a "lite" pickup-and-play product separate from
Rainboids, the Galaga clone is a great standalone idea.** Inside
Rainboids it's a bad fit.

---

## 8. Open questions

If we move forward with Model A, things to validate:

1. **Should the player still be able to aim manually?** (E.g. a
   "manual aim" toggle in settings.) Suggestion: **no** for v1 —
   simpler is better. Add the toggle in v2 if players ask.
2. **Power-weapon trigger.** Auto-fire (A) or tap (F)? Suggestion:
   **Model F** for the v1 mobile release — restores the one
   meaningful decision that auto-fire flattens.
3. **Defense skills (BULWARK, EMP_PULSE, etc.) on mobile.** They
   were never wired to a mobile input (see Mobile Planning doc §3).
   Drag-to-move + tap-for-power leaves no gesture for skills.
   Suggestion: **a single canvas SKL button** in the bottom corner
   (matches PRM/PWR pattern). Skill activates on tap.
4. **Camera behavior.** Current mobile camera centers on the
   stationary ship. With a moving ship, options are:
   - **Follow the ship 1:1** (matches desktop). Best for immersion.
   - **Anchor the camera, ship roams within the canvas.** Smaller
     view of the world but no scrolling. More retro.
   - **Hybrid: follow with deadband.** Camera doesn't move until the
     ship leaves a center box. Sky Force does this.
5. **Ship offset under finger.** ~50 px upward is the established
   sweet spot. Test on a real phone.
6. **Migration / settings.** Hard switch to Model A on next release,
   OR add a "Mobile control: Drag / Aim (Classic)" toggle in pause
   menu → Controls? Suggestion: **hard switch**. The Classic Aim
   model was only live for a few weeks; few players have invested in
   the muscle memory.

---

## 9. Effort estimate (Model A, no settings toggle, hard switch)

Approximate work units:

| Step | Effort |
|---|---|
| Reverse the stationary-ship velocity-zero patch in `player.js` for mobile | S |
| Update `mobile-touch.js`: drag-to-move instead of drag-to-aim | M |
| Re-enable `auto-aim` and `auto-fire` on mobile (revert 5.95.1's "mobile force-off") | S |
| Camera tuning pass (bump zoom on portrait; pick follow strategy) | S |
| Ship-under-finger offset | XS |
| Mobile balance re-pass (enemy density, drop rates, damage taken) | M |
| Tutorial copy rewrite ("drag your ship to dodge") | XS |
| Update Mobile Planning doc + CHANGELOG | XS |
| **Total** | ~1 day |

That's a half-day to a day of focused work. Compared to the Galaxian
clone (~1-2 weeks for a meaningful port), it's a clear win.

---

## TL;DR

**Recommendation: Pivot mobile to Sky-Force-style drag-to-move with
auto-fire + auto-aim. Optionally keep tap-for-power-weapon to preserve
one skill expression (Model F).**

This:
1. Inverts the gameplay loop to **dodge instead of aim** (what the
   user proposed).
2. Removes finger-occlusion of the playfield.
3. Preserves every existing Rainboids system (weapons, powerups,
   Diablo items, parallax background, wave progression).
4. Is the established mobile shmup pattern players already know.
5. Costs ~1 day of work.

The Galaxian clone idea is great but for a *different product* — it
doesn't fit Rainboids as a feature.
