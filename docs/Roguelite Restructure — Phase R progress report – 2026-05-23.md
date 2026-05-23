# Roguelite Restructure — Phase R Progress Report

作成日: 2026-05-23 · Updated after the full autonomous /loop sprint (6.84.0 → 6.93.0).

This report covers the entire Phase R restructure shipped this sprint, the
concerns to review, and the remaining (deferred/blocked) work.

---

## ✅ Shipped this sprint — 11 versions, all validated + committed to `master`

| Ver | Phase | Summary |
|-----|-------|---------|
| 6.84.0 | **R1** | Skills → Abilities rename (23 files; `player/skills.js`→`abilities.js`). |
| 6.85.0 | **R2.1–3** | Gold economy: run-gold→0 + banked account-gold (migrated); **ARMORY** pre-run screen + unlock store; `unlockWave` retired. |
| 6.86.0 | **R8.1/4/5** | Persistent gear **stash** + **Cores** salvage. Fixed a latent title-autosave data-loss bug (wiped account-gold/Cores). |
| 6.87.0 | **R8.2/3** | No auto-equip; ARMORY **EQUIPMENT** screen (equip stash→slots, deltas). |
| 6.88.0 | **R8.6/8** | Cores **reroll** + **tier-up** crafting. |
| 6.89.0 | **R6.1/2** | Abilities audit: Repair Nanites → **Field Medic** (burst heal + cleanse); base kit; **Tractor Shield cut**. |
| 6.90.0 | **R5** | **LOADOUT** screen (chosen 4+4+4 from unlocked pool, narrows the run). |
| 6.91.0 | **R3.1–3** | Per-run **card draft** (2 weapon + 1 ability, relevance-filtered, 5/run). |
| 6.92.0 | **R4.2/3 + R2.4(part)** | In-run gold sinks: paid **reroll** + **Repair Kit** at the card moment; post-card upgrade quick-buy retired. |
| 6.93.0 | **R7** | Validated the (already-functional) level→SP→Stats system; **fixed** the Stats-menu auto-open to fire on every stage clear when leveled. |

**The full roguelite loop is playable end-to-end:** TITLE → ARMORY (unlocks /
gear equip / Cores craft) → LOADOUT (pick 4+4+4) → run (5 relevance-filtered
card drafts, paid reroll/repair sinks, level-ups open the Stats menu) → run end
banks gold + commits loot to the stash.

**Test totals:** 593 unit (was 505) + new QA suites 08-armory (21), 09-loadout
(7), 10-cards (7), 11-leveling (5). Every commit kept the game launchable.

---

## ⚠️ Concerns to review

1. **R2.4 is partial.** The post-card upgrade quick-buy (`shop-suggest`) is
   retired, but the **mid-wave UPGRADES shop** (HUD 🛒 + pause-menu UPGRADES)
   still sells gold upgrade-tree stacks — redundant with cards now. Full removal
   was deferred because it would churn the 07-weapons shop-tree QA tests and is a
   large change. **R7.4** (passives SP-only) is tied to this: the redundant gold
   PASSIVE tab should go with it.
2. **Deferred features (large/flow-intrusive), all documented in CHANGELOG:**
   - **R6.3** — the ~14 new purchasable abilities (Blink, Bullet Time, Stasis
     Field, Gravity Snare, Decoy Beacon, Second Wind, Elemental Infusion, Cryo
     Field, Storm Cell/Pyre Aura, Catalyst, Designator). Each is a distinct
     gameplay verb needing its own implementation + live consumer — the single
     biggest remaining chunk.
   - **R4.1** (6th/7th extra card) + **Revive Token** — cost curves are
     implemented + tested in `world/run-shop.js`; not wired (extra-card needs
     draw-tracking + a no-close-after-paid-pick overlay; revive needs death-path).
3. **Blocked on Phase C (unimplemented):** **R8.7** (resist targeting → needs
   C.I2 tier-gated resist counts), **R8.9** (trait reroll → needs C.I3 traits).
4. **R-BAL (balance) not started** — the whole point of "no mastery" is that
   difficulty is tuned around meta power (SP + gear + unlocks). With the meta now
   in place, a balance pass + an AI-survival run on a progressed account is the
   natural next validation. Not attempted (needs playtesting, not just code).
5. **Tractor Shield physics left dormant** — cut from the roster but the
   collision/render beam code remains (guarded by an always-false
   `has('TRACTOR_SHIELD')`). Safe, but a cleanup sweep is owed.
6. **`core/version.js` stale** (`6.45.1`) vs `/VERSION` (6.93.0) — the in-game
   title build tag. Pre-existing; left untouched.
7. **QA flakiness under machine load** — earlier in the sprint the machine hit
   load avg ~60 and QA timed out spuriously; the unit suite is the reliable gate.
   `tests/e2e/10-weapon-economy.spec.js` still has 4 tests skipped (assert
   retired wave-unlocks) pending a roguelite-economy e2e rewrite.
8. **`Plans.md` is ~270 lines** (over its 200 soft cap) — the per-task tables
   still say `cc:TODO` while the top banner tracks what shipped. A `/maintenance`
   pass to reconcile the tables + archive the shipped ledger is worth doing.

---

## 🔭 Recommended next steps (need your prioritization)

- **Highest value, biggest effort:** R6.3 (new abilities batch) — gives the
  ability lane real depth. Each ability is its own mini-feature.
- **Cleanup that completes the economy:** R2.4-full (remove the mid-wave gold
  UPGRADES shop) + R7.4 (drop the gold PASSIVE tab) + re-author the 07-weapons
  shop tests + the 4 skipped e2e economy tests.
- **Quick wins:** wire R4.1 (extra card) + Revive Token (costs already done).
- **Validation:** an R-BAL balance pass + AI-survival run on a meta-progressed
  account once the above land.
- **Blocked:** R8.7/R8.9 await Phase C (C.I2 resist counts, C.I3 traits).

---

## Validation summary
- **Unit:** 593/593 green (`npm run test:unit`).
- **QA (isolation):** 01/07/08/09/10/11 all green — boot, weapons, armory,
  loadout, cards+sinks, leveling.
- **e2e:** not run (slow; 4 obsolete economy tests skipped pending rewrite).
