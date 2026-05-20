# Dead Skills & Upgrades — Review Doc (2026-05-20)

> **STATUS: ALL IMPLEMENTED (2026-05-20, v6.38.0–6.45.0).** User decision
> was IMPLEMENT for every row. Shipped: DEFLECTOR_ORBS family (6.38.0),
> EMP_PULSE family (6.39.0), DAISY_CHAIN (6.40.0), CLUSTER_WARHEAD
> (6.41.0), enemy SLOW + AFTERSHOCK (6.42.0), FORTIFY + RETALIATION
> (6.43.0), EXTENDED_CARE + EMERGENCY_PROTOCOL (6.44.0), REDIRECTION
> (6.45.0). All 325 unit tests green. Needs in-game playtest.

Companion to `Solo Bug Audit – 2026-05-18.md` + the Phase 0 re-verification
in `Solo Bug Fix Plan – 2026-05-18.md`. This is the **Phase 3** worklist:
upgrades / skills that the shop sells (or that the loadout offers) but
which have **no working consumer** — the player pays for / equips them and
nothing happens.

**Decision per row:** `IMPLEMENT` (build the mechanic) or `REMOVE` (delete
from the catalog so the player is never sold a no-op). Fill in the
**Decision** column and we'll execute case-by-case. CLAUDE.md granularity:
each IMPLEMENT is its own MINOR; a REMOVE sweep can be one MINOR.

Verified against current code at VERSION 6.37.11. Live = present in a
currently-exported object with no effective consumer. (POISON_TIP,
SUPPRESSION, STATIC_CHARGE, SHRAPNEL, THROUGH_AND_THROUGH, KINETIC_IMPACT,
MASS_DRIVER were already retired in the 6.28.0 weapon redesign — not listed
here.)

Legend — **Effort**: S (≤30 min, one consumer), M (a few systems), L (new
subsystem + render/FX). **Scaffold**: existing code that a fix could build
on.

---

## A. Placebo SKILLS (whole defense skills that do nothing)

These are equippable defense skills. `activateSkill()` plays the sound,
starts the cooldown, and sets a duration timer in `activeSkillEffects` —
but **nothing reads the timer**, so the skill has zero gameplay effect.
Their three upgrade nodes (section C) are dead-on-dead.

| Skill | Promised | Current state | Effort | Scaffold | Recommendation | Decision |
|---|---|---|---|---|---|---|
| **DEFLECTOR_ORBS** | "Orbiting orbs block bullets for 5s" (orbCount 3, hitsPerOrb 3) | `activateSkill` never populates `player.deflectorOrbs[]`; collision + render gate on `length>0` → always false. | **L** | A REFLECT consumer already exists at `collision-system.js:1878` (dead until orbs spawn); orb config (orbCount/hitsPerOrb) already in `DEFLECTOR_ORBS`. | **IMPLEMENT** — it's a whole equippable skill; high player-visible value, and most scaffolding exists. Unlocks EXTRA_ORB / HARDENED_ORBS / REFLECT for free. | _____ |
| **EMP_PULSE** | "Stun nearby enemies for 2s" (radius 200) | `activateSkill` never sets `empPulseActive`/`empPulseStartTime` and never calls `applyStun`. | **M** | `applyStun()` exists (`combat-manager.js:1903`); the enemy STUN status (`stunUntil`) already gates movement+firing; renderer reads `empPulseActive`/`empPulseStartTime` (`weapon-effects-renderer.js:937`). | **IMPLEMENT** — small once wired (stun already works on enemies); unlocks EMP_OVERLOAD / CASCADE. | _____ |

---

## B. POWER-weapon upgrades (sold in shop, no consumer)

| Upgrade | Weapon | Cost | Promised | Current state | Effort | Recommendation | Decision |
|---|---|---|---|---|---|---|---|
| **DAISY_CHAIN** | Mine Layer | 4300g | "Nearby mines detonate together" | sets `mine.daisyChain`; nothing cascades. | **M** | IMPLEMENT — satisfying mine-build payoff; on a mine trigger, detonate other mines within a radius. | _____ |
| **AFTERSHOCK** | Nova Blast | 2600g | "Hits slow enemies 30% / 2s" | sets `ring.aftershock`; no enemy-slow consumer exists. | **M** | IMPLEMENT *or* REMOVE — needs a generic enemy "slow" status (none exists yet). If we add slow it could also feed other ideas; otherwise REMOVE. | _____ |
| **CLUSTER_WARHEAD** | Missile Salvo | 3900g | "Missiles split into 3 on impact" | sets `missile.cluster`; `checkMissileCollisions` only `.explode()`s. | **M** | IMPLEMENT — on missile impact, spawn 3 sub-missiles/fragments; strong capstone feel. | _____ |

---

## C. DEFENSE-skill upgrade nodes (no consumer)

Costs here are the small SP-era numbers (1–3) the tree multiplies into gold
for display. Nodes attached to a placebo skill (DEFLECTOR_ORBS / EMP_PULSE)
only matter if that skill is implemented in section A.

| Upgrade | Skill | Promised | Current state | Effort | Recommendation | Decision |
|---|---|---|---|---|---|---|
| **FORTIFY** | Bulwark | "+1s duration per stack" | unread | **S** | IMPLEMENT — trivial: add stacks×1000ms to BULWARK duration on activate. | _____ |
| **RETALIATION** | Bulwark | "Emit a damage pulse when hit" | unread | **M** | IMPLEMENT *or* REMOVE — needs an AoE pulse on damage-taken while Bulwark active. | _____ |
| **EXTENDED_CARE** | Repair Nanites | "+2s duration per stack" | unread | **S** | IMPLEMENT — trivial duration extension (mirror FORTIFY). | _____ |
| **EMERGENCY_PROTOCOL** | Repair Nanites | "Auto-activates below 20% HP" | unread | **S** | IMPLEMENT — on the HP-cross check, auto-fire Repair if owned + off cooldown. | _____ |
| **EXTRA_ORB** | Deflector Orbs | "+1 orbiting orb per stack" | dead (orbs never spawn) | **S** (after A) | Tie to DEFLECTOR_ORBS decision — IMPLEMENT if skill is built (read stacks into orbCount), else REMOVE. | _____ |
| **HARDENED_ORBS** | Deflector Orbs | "+2 hits per orb per stack" | dead (orbs never spawn) | **S** (after A) | Tie to DEFLECTOR_ORBS. | _____ |
| **REFLECT** | Deflector Orbs | "Blocked bullets fire back at enemies" | consumer exists but dead (orbs never spawn) | **S** (after A) | Tie to DEFLECTOR_ORBS — nearly free once orbs exist (consumer present). | _____ |
| **EMP_OVERLOAD** | EMP Pulse | "Stunned enemies take +20% damage" | unread | **S** (after A) | Tie to EMP_PULSE — add a damage multiplier vs `stunUntil` enemies. | _____ |
| **CASCADE** | EMP Pulse | "Kill a stunned enemy to stun nearby" | unread | **M** (after A) | Tie to EMP_PULSE — on stunned-enemy kill, stun neighbors. | _____ |
| **REDIRECTION** | Tractor Shield | "30% of absorbed bullets fire back" | unread (Tractor Shield itself works) | **M** | IMPLEMENT *or* REMOVE — Tractor Shield already absorbs for coins; this adds a reflect-back. | _____ |

---

## Suggested batches (once decisions are in)

1. **Trivial duration/auto nodes (S):** FORTIFY, EXTENDED_CARE, EMERGENCY_PROTOCOL — one small MINOR.
2. **EMP_PULSE family (M):** EMP_PULSE skill + EMP_OVERLOAD + CASCADE — one MINOR.
3. **DEFLECTOR_ORBS family (L):** the orb subsystem + EXTRA_ORB / HARDENED_ORBS / REFLECT — one MINOR.
4. **Power capstones:** DAISY_CHAIN, CLUSTER_WARHEAD (M each) — one MINOR each.
5. **Needs-a-new-status decisions:** AFTERSHOCK (slow), RETALIATION (pulse), REDIRECTION (reflect) — implement or remove per your calls above.

Anything marked REMOVE gets pulled from its exported object (and the tree
auto-stops showing it). REMOVE-only items can ship as one consolidated
"drop dead catalog entries" MINOR.
