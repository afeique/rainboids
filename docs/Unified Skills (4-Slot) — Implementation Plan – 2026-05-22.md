# Unified Skills (4-Slot) — Implementation Plan

**Created:** 2026-05-22
**Status:** Plan — awaiting go-ahead on Phase S1
**Companion to:** `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (§6)
**Owner:** Claude + Afeique

## Locked design decisions

- **Rename "Defense Skills" → "Skills".** Skills do anything: buff, debuff, heal,
  CC, summon, mobility, economy, element-swap.
- **4 equipped at once**, bound to **number keys 1–4**.
- **TAB (and the Q alias) retired** for skill activation.
- **Independent per-skill cooldowns** (4 separate timers). Balance lives in
  cooldown lengths; if back-to-back dumps prove too strong, add a small global
  lockout later as a targeted fix (not in scope now).

## Current model (confirmed in code)

- `skills.js`: single `this.activeSkill`, single `this.activeSkillCooldown` /
  `activeSkillCooldownMax`, `activeSkillEffects` Map (keyed by skill id),
  `activateSkill()` (477), `getEquippedSkill()` (436), `cycleSkill()` (449).
- `weapon-data.js`: `DEFENSE_SKILLS` + `SKILL_UPGRADES`.
- `input-handler.js`: `case 'Tab'` (191) sets the one-shot `activateSkill`; a Q
  alias is referenced. SPACE is the **power-weapon** trigger (182) — a stale
  comment in `skills.js:433` says SPACE activates skills; verify + fix.
- HUD skill display: `hud/status.js`.

## Phase map

```
S1 data: rename + 4-slot model ─┬─ S2 input (keys 1-4, retire TAB)
                                 ├─ S3 HUD 4-slot bar
                                 └─ S4 loadout UI (equip any 4)
S5 new skills batch 1 (some depend on Element E3) ───────────────
```

S1 is the structural change everything else needs. S2/S3/S4 are independent.
S5's element-flavored skills (Elemental Infusion, Hex Field, Cryo Nova) must
land after **Element plan Phase E3**.

---

## Phase S1 — Data: rename + 4-slot player model

**Goal:** replace the single-skill model with a 4-slot array + per-slot
cooldowns. No new skills yet.

**Files**
- `js/modules/combat/weapon-data.js` — rename `DEFENSE_SKILLS` → `SKILLS`
  (keep `export const DEFENSE_SKILLS = SKILLS` alias for one version to avoid a
  big-bang grep break; then migrate consumers). `getSkillUpgrades()` unchanged.
- `js/modules/player/player.js` — state:
  - `this.activeSkill` → `this.equippedSkills = [null, null, null, null]`
  - `this.activeSkillCooldown/Max` → `this.skillCooldowns = [0,0,0,0]` +
    `this.skillCooldownsMax = [0,0,0,0]`
  - keep `this.activeSkillEffects` (Map keyed by skill id — distinct skills, no
    collision).
- `js/modules/player/skills.js`:
  - `activateSkill()` → `activateSkill(slot)` — reads `equippedSkills[slot]`,
    checks `skillCooldowns[slot]`, sets that slot's cooldown.
  - `getEquippedSkill()` → `getEquippedSkill(slot)`.
  - cooldown decay loop (560) → iterate the 4 slots.
  - `cycleSkill()` (449) → removed or repurposed for the loadout UI.
  - the auto-activate / `bulwarkActive` / `tractorShieldActive` reads (11-34)
    → check "is the skill equipped in ANY slot AND active" instead of
    `activeSkill ===`.
- Migration: default `equippedSkills[0]` = the old single skill.

**Acceptance**
- 4 slots hold skills; each cools down independently.
- Unit tests: activating slot 1 doesn't put slot 2 on cooldown; effects map
  tracks multiple simultaneous skill effects.

**Risks**
- Several consumers compare `activeSkill === 'X'` (skills.js 22-34) — grep all
  and convert to slot-aware checks. The alias export limits blast radius.

---

## Phase S2 — Input: keys 1–4, retire TAB

**Goal:** bind activation to number keys; remove TAB/Q skill activation.

**Files**
- `js/modules/ui/input-handler.js`:
  - remove the `case 'Tab'` (191) skill activation + the Q alias.
  - add `case 'Digit1'..'Digit4'` → rising-edge one-shot
    `this.input.activateSkillSlot[n] = true` (ignore `e.repeat`).
  - verify SPACE stays power-weapon; fix the stale `skills.js:433` comment.
- `js/modules/player/player.js` `update()` — consume the 4 one-shot pulses →
  `activateSkill(slot)`, then clear them.
- Gamepad: mirror to face buttons / d-pad (per the existing twin-stick scheme).

**Acceptance**
- Keys 1–4 each fire the matching slot when off cooldown; TAB no longer
  activates a skill.
- Holding a number key does not spam re-activations.

**Risks**
- Number-key conflicts: cheats use `[`/`]` and `SHIFT+P` (per memory), not
  digits — confirmed no `Digit*` skill bindings exist today. Re-grep before
  wiring.

---

## Phase S3 — HUD: 4-slot skill bar

**Goal:** show 4 slots with per-slot cooldown + keybind label.

**Files**
- `js/modules/hud/status.js` — render a 4-slot bar; each slot shows icon,
  keybind (1–4), and a cooldown ring/sweep driven by `skillCooldowns[slot]` /
  `skillCooldownsMax[slot]`. Empty slots render as a dim placeholder.

**Acceptance**
- All 4 slots + their cooldowns are visible and update live.

---

## Phase S4 — Loadout UI (equip any 4)

**Goal:** let the player assign any owned skill to slots 1–4.

**Files**
- Shop / skill screen (`js/modules/shop/…`) — a section to assign owned skills
  to the 4 slots (click-to-assign or drag). This is where the outstanding
  **Phase-7 skill-tree UI** naturally lives; coordinate so they ship together.

**Acceptance**
- Player can place any owned skill into any of the 4 slots; the loadout persists
  for the run and drives the HUD + keybinds.

**Risks**
- Mobile assignment UX (touch). Defer mobile polish to a follow-up.

---

## Phase S5 — New skills, batch 1

**Goal:** ship the strongest new skills so the 4-slot loadout has real variety.

**Batch 1 (≈8):** Overdrive (moved from `POWER_WEAPONS` → `SKILLS`), Bullet Time,
Bloodlust, Designator, **Elemental Infusion**, Aegis Barrier, Blink,
**Gravity Snare**.

**Files**
- `js/modules/combat/weapon-data.js` — add each to `SKILLS` (cooldown, duration,
  config) + their `SKILL_UPGRADES`.
- `js/modules/player/skills.js` — a consumer per skill in the active-effect
  update loop (mirror the existing Bulwark/Repair/Tractor consumers).
- FX per skill (reuse pools + juice helpers).
- **Sequencing:** Elemental Infusion / (later) Hex Field / Cryo Nova read the
  Element plan's status helpers (E3) — land them *after* E3. Bullet Time
  introduces personal slow-mo (no slow-mo exists today) — scope its time-scale
  carefully against the frame clock.

**Acceptance**
- Each new skill works in any slot; no placebos (every config has a live
  consumer — explicit nod to the Dead-Skills lesson).

**Risks**
- **Overdrive move** drops `POWER_WEAPONS` from 11 → 10: update README + any
  power-weapon iteration/UI + the brainstorm inventory. Saves referencing
  `OVERDRIVE` as a power weapon must migrate.
- 4 simultaneous skills can trivialize danger → tune cooldowns; a global lockout
  is the fallback lever (not built now).

---

## Cross-cutting

- **Testing:** unit tests for per-slot cooldown independence + activation;
  AI survival run as regression after S1/S2.
- **Versioning:** S1 (refactor) MINOR; S2/S3/S4 MINOR each; S5 = one MINOR per
  skill batch.
- **README:** controls section (1–4 keys, TAB retired), skill count, "Skills"
  rename, and Overdrive moving categories.

## Open questions

1. **Slot count on small screens / mobile** — keep 4, or fewer on mobile?
2. **Skill acquisition** — still SP-cost in the shop, or fold into the
   keystone/loadout economy?
3. **Default loadout** for a fresh run — which 4 start equipped?
