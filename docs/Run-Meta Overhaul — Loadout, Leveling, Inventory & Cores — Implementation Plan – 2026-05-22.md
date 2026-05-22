# Run-Meta Overhaul — Loadout, Leveling, Inventory & Cores — Implementation Plan

作成日: 2026-05-22

> Restructures Rainboids from a single-session arcade run into a **roguelite with persistent meta-progression**. A run is one finite **30-wave** attempt (confirmed by the boss plan: 10 bosses, every 3rd wave, 3→30); long-term power lives in a meta layer (account level/SP, item stash, Cores, arsenal unlocks) configured **before** each run on dedicated screens.

These are **Plans E–I** (Plans A–D already exist). Companion docs in `docs/`:
- `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (overall direction)
- `Element & Resistance System — Implementation Plan – 2026-05-22.md` (Plan A — elements/resists)
- `Unified Skills (4-Slot) — Implementation Plan – 2026-05-22.md` (Plan B — 4-slot model **shipped** B.S1-S3; B.S4 absorbed by Phase H here)
- `Item Tiers, Resistances & Traits — Implementation Plan – 2026-05-22.md` (Plan C — item machinery the Cores phase plugs into)
- `Enemy & Boss Revamp — Design Plan – 2026-05-22.md` (Plan D — enemies + 10 bosses; orthogonal, but its 30-wave structure anchors leveling cadence)

---

## 1. Design vision — two layers

The game splits cleanly into a **META layer** (persists across runs via `localStorage`) and an **IN-RUN layer** (created fresh each run, discarded at run end). Configuration of the meta layer happens **only** in the pre-run flow; mid-run, the player cannot change gear, loadout, or stats.

### Layer split

| Concern | Layer | Persists? | Set / earned where |
|---|---|---|---|
| Account **level + XP** | META | ✅ | Earned by clearing waves (any run); ~2–3 levels per 30-wave run |
| **Stat Points (SP)** | META | ✅ | Granted per account level |
| Permanent **stat allocations** (HP, DEF, crit, dodge, speed, regen, vampirism, thorns) | META | ✅ | Stats menu (spend SP) |
| **Item stash** (all loot ever collected) | META | ✅ | Loot collected in any run flows in at run end |
| **Cores** (item-craft currency) | META | ✅ | Salvaging stash items |
| Item modifications (reroll / tier-up / resist) | META | ✅ | Inventory screen (spend Cores) |
| **Arsenal unlocks** (which primaries/powers/abilities are available) | META | ✅ | Account-level milestones |
| **Equipped gear** (5 slots) for the run | per-run snapshot | run only | Inventory screen, locked at run start |
| **Run loadout** (4 primary + 4 power + 4 ability) | per-run snapshot | run only | Loadout screen, locked at run start |
| **Gold** + gold-bought weapon/power/ability upgrade trees | IN-RUN | ❌ resets | Kills → in-run shop |
| The 30-wave run, enemy scaling, active weapon selection | IN-RUN | ❌ resets | — |

**Two power pillars** (replacing free card drafts):
1. **Leveling** → SP → permanent **stats** (meta, slow, account-wide).
2. **Gold** → in-run **upgrade trees** (per-run, re-bought every run).

### New-game flow

```
TITLE ──"NEW GAME"──▶ [1] INVENTORY screen ──▶ [2] LOADOUT screen ──▶ run (wave 1 … 30)
                          │ (meta)                  │ (meta)               │ (in-run)
                          ▼                          ▼                      ▼
              • view stash               • pick 4 primaries     • gold shop (upgrades)
              • salvage → Cores          • pick 4 powers        • NO auto-equip; loot held
              • reroll/tier/resist       • pick 4 abilities     • level-up → SP
                with Cores                 (unlocked pool only)  • wave clear → Stats menu
              • equip 5 gear slots                                 auto-opens IF leveled
                                                                  run end → loot → stash
"CONTINUE" resumes an in-progress run mid-flight (unchanged); it skips the pre-run screens.
```

### Wave-clear sequencing (replaces Survivor Cards)

`wave cleared → (if player leveled this wave: Stats menu auto-opens, paused, spend SP) → gold shop (existing) → next wave`. The Survivor-Card draft + 3-card shop-suggest overlay are **commented out** (restorable), not deleted.

---

## 2. Relationship to existing plans (A / B / C / D)

- **Plan A (Elements/Resists)** — independent; still applies. Element-resist **item affixes** (A.E7) now matter in the persistent stash and are the target of Cores resist-crafting (I.C3).
- **Plan B (Unified Abilities 4-Slot)** — **B.S1-S3 already shipped** (4-slot model, Digit1-4 input, HUD bar). Phase H builds on that shipped model for the *ability third* of the 4+4+4 loadout; **B.S4 (loadout UI) is absorbed into H.L3.** B.S5 (new abilities) stays in Plan B and populates the loadout pool. B's `SKILLS` naming is superseded by Phase E (`ABILITIES`).
- **Plan C (Item Tiers/Traits)** — C.I1 (8-tier ladder) shipped. The Cores phase (I) is the salvage/craft layer **on top of** C's tiers, resist display (C.I2), and traits (C.I3*). Phase I resolves two of C's open questions: traited-item sell/salvage value, and resist targeting.
- **Plan D (Enemies/Bosses)** — orthogonal to meta-progression, but its **30-wave / 10-boss** structure confirms run length and anchors the leveling cadence (≈ wave 10/20/30 milestones). The persistent-meta difficulty rebalance (Open Q 7) must be co-tuned with the boss/enemy scaling.

**Cross-plan order:** E first (rename, unblocks naming everywhere). F/G/H can run in parallel after E (G.M1 is the shared pre-run-screen scaffold for G+H). **I (Cores) is last**, after Plan C's item machinery and G's inventory screen exist.

Status markers match `Plans.md`: `cc:TODO` / `cc:WIP` / `cc:完了 (ver)`.

---

## 3. Phases

### Phase E — Terminology: "Skills" → "Abilities"

Rename the player-facing and code concept of *defense skills / skills* to *abilities* everywhere. B.S1 already did `DEFENSE_SKILLS`→`SKILLS` (alias kept); this completes the move to `ABILITIES` and retires the aliases. ~15 files touched per the code survey.

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| E.N1 | Data + exports: `SKILLS`→`ABILITIES`, retire `DEFENSE_SKILLS` alias; `SKILL_UPGRADES`→`ABILITY_UPGRADES` (weapon-data.js) | Build green; new exports used; old aliases removed (or one-version deprecation note) | - | cc:TODO |
| E.N2 | Player props + functions: `equippedSkills`→`equippedAbilities`, `skillCooldowns(Max)`→`abilityCooldowns(Max)`, `activeSkillEffects`→`activeAbilityEffects`, `activeSkill`→`activeAbility`; `equip/activate/cycleSkill`→`…Ability`; `skills.js`→`abilities.js` | No dangling `skill` refs in player/combat code; unit + QA suites updated and green | E.N1 | cc:TODO |
| E.N3 | UI/labels/CSS: radial `type:'skill'`→`'ability'`; tutorial/control labels "Defense skill"→"Ability"; CSS `[data-tab="skills"]`/`[data-tab="SKILLS"]`; gamepad comments; shop-tree subgroup labels | Every visible string says "Ability/Abilities"; radial + HUD + shop reflect it; QA text assertions updated | E.N1 | cc:TODO |
| E.N4 | Sweep: test selectors/assertions, README arsenal section, memory note (constants list) | Full test suite green; README uses "Abilities (6)"; no "defense skill" left in player-facing text | E.N2, E.N3 | cc:TODO |

### Phase F — Progression overhaul: meta levels → SP → Stats menu

Remove the free Survivor-Card draft. Reintroduce a **persistent account level** that grants **SP**, spent in a **Stats menu** that auto-opens at wave clear. Power = leveling (SP→stats, meta) + gold (in-run upgrades, per-run).

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| F.P1 | Comment out Survivor Cards: disable `openWaveClearPowerupsMenu`/`openWavePickOverlay`/`closeWavePickOverlay` + chained `openShopSuggestOverlay`; remove boss-clear free passive grant. Restorable (`// DISABLED 2026-05-22 → SP stats menu`). | Stage clears no longer show card overlay; no free passive granted; code commented not deleted; QA card-overlay test skipped/updated | - | cc:TODO |
| F.P2 | Meta account level + XP + SP: reactivate `player.level`/XP as a **persistent** account system (localStorage); XP curve so a 30-wave run yields ~2–3 levels (milestones ≈ wave 10/20/30); each level = +N SP; persist level/XP/SP/allocations | XP accrues on wave clear; ~2–3 level-ups per 30-wave run; level + SP persist across runs; unit test for waves→levels curve | - | cc:TODO |
| F.P3 | Stats allocation menu: extend STATS tab into an SP-spend UI; SP buys permanent increments of HP/DEF/critChance/critDamage/dodge/speed/regen/vampirism/thorns; game pauses while open | Spending SP raises the stat via `getEffective*`; allocations persist; cannot overspend; per-stat caps respected | F.P2 | cc:TODO |
| F.P4 | Auto-open Stats menu at wave clear: when a wave clears AND player has unspent SP, auto-open the Stats menu (paused) before the gold shop | Leveling during a wave → Stats menu auto-pops at that wave's clear; close resumes → shop → next wave; no double-open | F.P3 | cc:TODO |
| F.P5 | Migrate stat passives gold→SP: move PASSIVE_UPGRADES (CRIT_CHANCE/DAMAGE, HEALTH_BOOST, SHIELD_BOOST, VAMPIRISM, THORNS, DODGE, SPEED_BOOST) out of the gold shop into the SP stats tree; keep weapon/power/ability **upgrade trees** as gold | Passives no longer gold-buyable; same stats now SP-driven; shop shows only weapon/power/ability upgrades; no orphaned passive refs | F.P3 | cc:TODO |
| F.P6 | In-run economy reset: gold + gold-bought upgrade-tree stacks reset at run start (per-run roguelite layer); strip in-run upgrades from the persistent save | New run starts with 0 gold and base upgrade trees; meta layer (level/SP/stats/stash/Cores) untouched | F.P5 | cc:TODO |

### Phase G — Inventory as meta (persistent stash, no auto-equip)

Remove auto-equip. Loot collected in a run is **held** and flows into a **persistent stash**. Gear (the 5 slots: cockpit/hull/shielding/chassis/nanites) is equipped **only** on the pre-run Inventory screen and locked for the run.

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| G.M1 | Pre-run meta-flow scaffold: add game-states (e.g. `INVENTORY`, `LOADOUT`); route NEW GAME → Inventory → Loadout → run; CONTINUE skips straight to the resumed run | NEW GAME enters the two meta screens before wave 1; CONTINUE resumes mid-run; back/confirm nav works | - | cc:TODO |
| G.M2 | Persistent item stash: store all collected items in localStorage, separate from in-run state; run-end commits the run's loot into the stash | Items collected in run N present in stash at start of run N+1; stash survives reload | - | cc:TODO |
| G.M3 | Remove auto-equip: drop `isUpgrade` auto-equip in `registerItemDrop`; in-run loot just accrues (HUD feed = "collected this run" ticker, no equip action) | Picking up an item never changes equipped gear mid-run; loot feed shows collection only | - | cc:TODO |
| G.M4 | Inventory management screen: view stash, equip ≤1 item per gear slot for the run with live stat deltas; equipped set locked at run start | Player equips up to 5 stash items; equipped gear drives `getItemAffixTotal`/`getEffective*`; choices frozen once the run begins | G.M1, G.M2 | cc:TODO |
| G.M5 | Run-end reconciliation: death/clear commits collected loot to stash; GAME_OVER/GAME_COMPLETE → return to title/meta; no loot lost on death | Loot from a finished run appears in the stash at next NEW GAME, win or lose | G.M2, G.M3 | cc:TODO |

### Phase H — Fixed run loadout (4 primary + 4 power + 4 ability)

At the pre-run Loadout screen the player picks a **fixed** loadout from the **meta-unlocked** pool: 4 primaries, 4 powers, 4 abilities. Switch among the four of each in-run. Retires the random loadout and wave-gated unlocks. Builds on shipped B.S1-S3; **absorbs B.S4.**

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| H.L1 | Loadout data model: `runLoadout = {primaries:[4], powers:[4], abilities:[4]}` + active index per category; replace `_rollRandomLoadout` and single `activePrimary`/`activePower`; reuse shipped B.S1 4-slot model for the ability third | Player carries 4 of each; active-per-category tracked; existing fire paths read `loadout[activeIdx]`; old single-weapon code migrated | E.N2 | cc:TODO |
| H.L2 | Meta-unlock arsenal: define unlock state for each primary/power/ability gated by account-level milestones; starter pool unlocked from run one; **retire `unlockWave`** | Loadout screen offers only unlocked entries; new entries appear as account level rises; unit test for gating | F.P2 | cc:TODO |
| H.L3 | Loadout selection screen (absorbs B.S4): assign 4 primaries / 4 powers / 4 abilities from unlocked pool; confirm → locks for the run | Player fills the 3×4 loadout; can't exceed 4 or pick locked items; confirm starts run with that loadout | G.M1, H.L1, H.L2 | cc:TODO |
| H.L4 | In-run switching controls: abilities = Digit 1-4 one-shot (shipped B.S2); primaries = cycle (`[`/`]` or Q/E); powers = separate cycle; gamepad mirror. *(Exact bindings tunable — Open Q 3.)* | Player switches active primary/power among their 4 mid-run; abilities fire per-slot; gamepad parity; no auto-repeat spam | H.L1 | cc:TODO |
| H.L5 | HUD loadout display (extends shipped B.S3): show 3×4 loadout with active highlight + 4 ability cooldown rings | All 12 entries visible; active primary/power highlighted; 4 ability cooldowns live; empty/locked dim | H.L1 | cc:TODO |

### Phase I — Cores: salvage + reroll/upgrade items *(LAST — folded-in Tier 2)*

Items salvage into **Cores** (single meta currency). Spend Cores on the Inventory screen to reroll affixes, target resists, bump rarity tier, and reroll traits — reusing Plan C's item machinery. No second ingredient taxonomy, no recipes/bench.

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| I.C1 | Cores currency + salvage: add `cores` to meta save; salvage item → Cores scaled by rarity × item level × affix/trait count; "Salvage all below equipped" bulk action with instant juicy payout | Salvage removes item from stash and grants Cores by formula; bulk salvage works; Cores persist; unit test for formula | C.I1, G.M4 | cc:TODO |
| I.C2 | Reroll affixes: spend Cores to reroll an item's affix types/values within tier bounds (`ITEM_AFFIX_POOL`) | Reroll consumes Cores, produces affixes within tier bounds; unit test for cost + bound respect | I.C1 | cc:TODO |
| I.C3 | Resist targeting: spend Cores to add/swap an elemental resist entry (A.E7 / C.I2); tier caps respected — *resolves Plan C open-Q "resist targeting"* | Chosen resist appears/changes on the item; tier-gated resist count enforced | I.C1, A.E7, C.I2 | cc:TODO |
| I.C4 | Tier-up: spend Cores to bump an item one rarity tier (8-tier ladder C.I1), rolling the added affix/resist slot; cost scales with target tier | Tier-up raises rarity and adds the tier's extra affix/resist; cost curve unit test | I.C1, C.I1 | cc:TODO |
| I.C5 | Trait reroll + salvage-value reconcile: reroll an item's trait (C.I3*) for Cores; define traited-item salvage value — *resolves Plan C open-Q "sell value of traited items"*; one balance surface with C.I4 keystone | Trait reroll works; traited items yield Cores per defined rule; consistent with keystone delivery | I.C1, C.I3a, C.I4 | cc:TODO |

---

## 4. Open questions / assumptions to confirm

1. **Level curve & SP economy** — exact XP-per-wave, level milestones (assume ≈ wave 10/20/30), SP per level (assume 1), and stat increment per SP point. Tunable; needs a balance pass.
2. **Stat caps** — do SP-bought stats share the existing passive caps (e.g. SHIELD_BOOST 75%, DODGE 50%) or get new meta caps? Assume existing caps as the ceiling.
3. **In-run weapon switching scheme (H.L4)** — proposed: abilities 1-4, primaries `[`/`]`, powers a separate cycle. Needs a feel test; could instead be a single radial.
4. **Arsenal unlock pacing (H.L2)** — assumed gated by account-level milestones. Alternative: spend Cores to unlock. Confirm which (or both).
5. **Stash cap** — does the stash have a size limit (with salvage as the pressure valve), or is it unbounded? Assume a generous cap to keep the Inventory screen manageable.
6. **30-wave run end** — confirmed finite by the boss plan (boss #10 at wave 30 → `GAME_COMPLETE`). Leveling cadence keys off this.
7. **Difficulty rebalance** — persistent meta stats + persistent gear + meta unlocks make the player permanently stronger across runs; enemy/boss scaling (Plan A.E8*, Plan D) must account for meta power so early runs aren't trivial and late ones aren't impossible. Dedicated balance pass after F+G+H land, co-tuned with Plan D.

## 5. Risks

- **Save-format migration** — introducing persistent meta state (level/SP/stats/stash/Cores/unlocks) changes the save schema; existing saves need migration or a clean reset with a version stamp.
- **Plan B reconciliation** — B.S1-S3 are shipped; Phase H builds on the shipped 4-slot ability model (do **not** duplicate it). H.L3 absorbs the still-TODO B.S4.
- **Scope** — this is the largest single change to the game's structure to date; ship E→F→G→H→I incrementally, each independently testable, rather than as one big-bang merge.
