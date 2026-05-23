# Roguelite Restructure — Gold Economy, Cards & Abilities — Design Plan

作成日: 2026-05-22

> The crystallized design from the combat-depth planning sessions. This is the **authoritative** model for Rainboids' roguelite restructure. It **refines/supersedes** the exploratory parts of `Run-Meta Overhaul — … – 2026-05-22.md`: the **loadout** (was random/fixed-choice, now gold-unlocked chosen) and **progression** (cards are now a weapon/ability powerup draft, NOT a stat-menu replacement). The **Inventory-as-meta** and **Cores** designs from that doc still stand and are referenced, not duplicated, here.

Companion docs in `docs/`: Plan A (elements/resists), Plan B (4-slot abilities — shipped S1-S3), Plan C (item tiers/traits), Plan D (enemies + 10 bosses → confirms the **30-wave** run), Run-Meta Overhaul (inventory meta + Cores).

---

## 1. The loop

A **run** = one finite **30-wave** attempt (boss every 3rd wave → 10 stages). It ends in `GAME_COMPLETE` or death. Power comes from **three permanent meta vectors** + **per-run cards**, with **no mastery** (weapons/abilities are flat, always-viable tools so experimentation is never punished).

| | Layer | What it does | Persists? |
|---|---|---|---|
| **Gold** | meta + in-run | run gold starts at 0, accrues from kills, **banks to account at run end**; account-gold buys **unlocks** (weapons/abilities); optionally **spent in-run** for extras | ✅ banked balance |
| **Account level → SP → Stats** | meta | a **separate** system: leveling grants SP, spent in a pausing **Stats menu** (auto-opens at wave clear when leveled) on permanent **character stats** (HP/DEF/crit/dodge/speed/regen/…) | ✅ |
| **Items + Cores** | meta | persistent gear stash; equip 5 gear slots at run start (no auto-equip); salvage → Cores; Cores reroll/tier/resist items *(see Run-Meta doc Phases G/I)* | ✅ |
| **Cards** | in-run | **5 per run**, relevance-filtered weapon/ability **powerups** — specialize a favorite each run | ❌ resets |

The three meta vectors are deliberately non-overlapping: **gold = breadth (what you own)**, **SP = character power**, **items = gear**, **cards = this run's weapon/ability flavor**. Nothing does another's job.

### New-game / wave-clear flow

```
TITLE → [Inventory screen: equip gear, salvage/craft w/ Cores] → [Loadout screen: pick 4 primary + 4 power + 4 ability
        from UNLOCKED pool] → [Shop screen: spend account-gold on new unlocks] → run (wave 1…30)

Stage clear (boss down):  [card draft, if a card stage] → [Stats menu, if leveled] → next wave
                          (in-run gold spending happens inside the card-draft moment)
Run end (win/death):      run gold → account-gold;  XP/level applied;  collected loot → stash
```

---

## 2. Gold economy — banked unlocks + optional in-run spend

**Banking.** Run gold starts at 0 and accrues from kills. At run end the accrued total is added to **account-gold**, the meta wallet that buys permanent weapon/ability unlocks. Deeper/cleaner runs bank more → faster unlocks. *(Open: does death forfeit a % of unbanked gold for risk/reward? Default: bank everything earned up to death.)*

**The core tension (this is what gives gold weight).** Gold spent **in-run** is gold **not banked** for unlocks. Every in-run purchase is *borrowing against your collection progress*. That single opportunity cost turns gold into a genuine "spend now to go deep, or save to grow the account" decision — without it, banked gold is just a passive score.

**Where in-run spending happens:** inside the **card-draft moment** (the natural between-stage pause), plus a couple of **anytime emergency consumables**. No return of the old skill-tree shop.

### In-run sinks — weighed

| Sink | Verdict | Why |
|---|---|---|
| **6th / 7th card** (steeply escalating cost, hard cap 7) | ✅ headline sink | Directly extends build power; the steep, escalating price (a 6th card could cost ~half a weapon unlock) preserves the "5 scarce cards" tension and the opportunity cost. Cap at 7 prevents snowball. |
| **Paid reroll / banish** of a card offer (modest, once per offer) | ✅ | Mitigates a bad draw with real cost. Because it's *paid* (banked gold sacrificed), it doesn't cheapen the "live with your draw" feel. |
| **Repair Kit** (instant heal, escalating per stage) | ✅ | Survival lever for builds without a heal ability; clear gold value; capped escalation stops it trivializing death. |
| **Revive Token** (very steep, 1 per run) | ✅ | Huge value, huge cost — "do I blow my unlock savings to survive *this* run?" is exactly the tension we want. |
| **Increased Gold Find** (your idea) | ⚠️ caution | The dangerous one. If it pays for itself it becomes a no-brainer turn-1 tax, not a choice, and it snowballs; it's also a *number-go-up* that belongs in the meta (an SP stat / Payday-style item affix), not in-run. **Recommendation:** keep gold-find in the meta. If included in-run at all, price it so break-even is **late** — a *gamble* that only pays off on a deep run, not a tax. |
| **Temporary stat boosts** (+dmg/+HP for the run) | ❌ | Violates the no-redundancy rule — that's the SP/stats/gear lane. |
| **Rent a weapon mid-run** | ❌ | Breaks the locked-loadout principle. |

**Confirmed in-run menu (2026-05-22):** 6th/7th card (escalating), paid reroll, Repair Kit, Revive Token. **Gold-find stays meta** (not an in-run buy).

---

## 3. Cards — the per-run powerup draft

- **5 cards per run**, one every two stages (of 10). Scarce by design → each pick is a pillar decision, and you end up **super-charging a particular weapon/ability each run** = the unique per-run flavor.
- **Relevance-filtered, always.** A draft only ever offers powerups for the weapons/abilities **in your loadout**. You never see a card you can't use.
- **Composition: 2 weapon cards + 1 ability card per draft; pick one.** *(Confirmed 2026-05-22.)* Rationale: if cards were *all* weapon-related, abilities would stay flat (base-only) all run while weapons scaled 5×, which feels terrible. The 2:1 split keeps **weapons primary** (they're the main in-run scaling) while guaranteeing an **ability path** every draft, and the forced "weapon depth *or* ability depth" choice is the recurring tension. Your weapon/ability investment split emerges from these 5 choices.
- **Powerup content** = the existing upgrade types repurposed as cards: weapons → MULTI / RAPID / PIERCING / BIG / EXPLODE / HOMING / STUN / KNOCK + rare per-weapon capstones (offered only if you carry that weapon); abilities → their upgrade pools (FORTIFY, POTENCY, …). With only 5 picks, prefer **build-defining** powerups; the existing gold-shop upgrade *trees* are retired in favor of this draft.
- The card overlay is **repurposed** from the old Survivor-Cards (free stat passives) — kept and re-skinned, not deleted. Stats now live in the SP menu (§5), so cards and the Stats menu **coexist** at wave clear.

---

## 4. Loadout & unlocks

- **Chosen at run start, locked for the run:** 4 primary + 4 power + 4 ability, picked from the **gold-unlocked** pool on the pre-run Loadout screen.
- **Unlocks are bought with account-gold** (replaces wave-gated `unlockWave` and the earlier "1 unlock per run" drip). **Abilities are lightly price-gated** (cost more than early weapons) so the early game stays weapon-led and abilities open up as the account matures.
- **Base kit from run one:** **Phase Dash + Field Medic + Bulwark** (all unique active verbs — see §6). Everything else is purchased.
- **The 4+4+4 still earns its size:** breadth = **element coverage** (switch element vs. a resistant enemy/boss); depth = the **cards** you sink into 1-2 carries. Unbuffed loadout slots aren't dead weight — they're your resist-coverage toolbox.

---

## 5. Leveling, SP & stats *(retained, separate system)*

Unchanged from the earlier decision: account level is **meta/persistent**, grants **SP**, spent in a pausing **Stats menu** that auto-opens at wave clear when the player has leveled. SP buys permanent **character stats** (HP, DEF/toughness, crit chance/damage, dodge, speed, regen, vampirism, thorns). This is the *character-power* lane — entirely separate from cards (weapon power) and items (gear). Detailed task breakdown lives in the Run-Meta doc (Phase F.P2-P4); note F.P1 ("comment out cards") is **reversed** — cards are kept and repurposed (§3).

---

## 6. Abilities — unique verbs only

### Design rule (litmus test)

> An ability earns a slot **only if its core effect is a verb no other system can produce.** A *number going up* — damage, crit, fire-rate, pierce, homing, lifesteal, speed, HP, resist — is a **card** (weapon mod) or **stat/gear** (SP + items), never an ability. Abilities = new verbs: teleport, stop time, freeze terrain, redirect aggro, re-element your guns, group enemies, cheat death, summon, intercept bullets, cleanse statuses.

### Roster — keep (each a unique verb)

| Ability | Role | The unique verb |
|---|---|---|
| **Phase Dash** | mobility | dash + i-frames |
| **Blink** | mobility | instant teleport reposition |
| **Bullet Time** | tempo | global slow-mo (you act at normal speed) |
| **Stasis Field** | control | localized enemy-slow zone |
| **Gravity Snare** | control | forced enemy movement — pull/group |
| **EMP Pulse** | control | guaranteed on-demand AoE disable |
| **Sentry Drone** | summon | autonomous independent attacker |
| **Decoy Beacon** | summon | redirect enemy targeting/aggro |
| **Deflector Orbs** | defense | physically intercept enemy projectiles |
| **Bulwark** | defense | on-demand invuln/absorb **window** (timing a spike — not "+DEF%") |
| **Field Medic** | sustain | instant burst heal **+ status cleanse** (cleanse is the unique part) |
| **Second Wind** *(or Phoenix Core)* | sustain | cheat death — survive one lethal hit / revive once |
| **Elemental Infusion** | elemental | re-element your whole loadout on demand (beat resists / force reactions) |
| **Cryo Field** | elemental | persistent FREEZE terrain |
| **Storm Cell / Pyre Aura** | elemental | apply a status via an **aura/zone**, not via weapon hits |
| **Catalyst** | elemental | extend reaction **chains** (extra targets/depth) — not "+% damage" |
| **Designator** | elemental | on-demand AoE MARK |

### Roster — cut (redundant)

Hunter's Mark (=HOMING card), Focus Fire (=crit stats), Bloodlust (=Vampirism stat), Last Stand (=damage stats / Glass Cannon trait), Afterburner (=speed stat), Overdrive (=RAPID + damage; *only revive if reframed to "fire all primaries at once"*), Repulsor Nova (=KNOCK + EMP), Magnetize (=Orb Magnet trait), Prism Surge (=overlaps Elemental Infusion).

### Existing-ability audit

- **Tractor Shield** → cut or fully rework: as-is it's loot-pull (Orb Magnet trait) + enemy-pull (Gravity Snare) + shield (Bulwark) — three covered things.
- **Two heals are redundant with each other** → keep one. Make it **Field Medic = burst heal + cleanse**; retire/fold Repair Nanites' HoT.

### Base kit
**Phase Dash · Field Medic · Bulwark** — move, sustain, defend, all unique verbs.

---

## 7. Implementation outline (phases)

§2 (in-run sinks) and §3 (card composition) are confirmed. The **full, self-contained task breakdown lives in `Plans.md` → Phase R** (R1–R8 + R-BAL), which absorbs the former exploratory Phases E–I/H. High-level map:

| Phase | Scope | Notes |
|---|---|---|
| **R1 — Terminology** | Skills → Abilities rename | do first; ~15 files |
| **R2 — Gold economy + flow** | pre-run ARMORY/LOADOUT scaffold; run-gold→0 + bank at run end; account-gold buys unlocks; retire `unlockWave` + old upgrade-tree shop | foundation for unlocks |
| **R3 — Cards** | repurpose card overlay → 5/run, 2 weapon + 1 ability relevance-filtered draft; map existing upgrade types → cards | coexists with SP menu |
| **R4 — In-run gold sinks** | 6th/7th card (escalating), paid reroll, Repair Kit, Revive Token; opportunity-cost wiring | depends R2, R3 |
| **R5 — Loadout & unlocks** | chosen 4+4+4 from unlocked pool; base kit; ability price-gating; loadout screen | folds in former Phase H |
| **R6 — Abilities** | the §6 rule + roster; audit/cut Tractor + consolidate heals; base kit + first batch | depends R1 |
| **R7 — SP / Stats** | leveling → SP → Stats menu (separate, retained) | folds in former F.P2–P4 |
| **R8 — Inventory / Items / Cores** | persistent stash, no auto-equip, salvage/craft | folds in former G + I |
| **R-BAL — Balance** | mastery-free flat weapons + meta growth vs. enemy/boss scaling (co-tune w/ Plan D) | ongoing |

---

## 8. Decisions

**Locked (2026-05-22):**
1. **In-run gold sinks** (§2) — 6th/7th card (escalating, cap 7), paid reroll/banish, Repair Kit, Revive Token (1/run). Gold-find stays meta.
2. **Card composition** (§3) — 2 weapon + 1 ability card per draft, pick one.
3. **No mastery** — weapons/abilities stay flat/always-viable; difficulty tuned around meta power (SP/items/unlocks), not weapon growth (co-tune w/ Plan D).

**Minor, defaulted (revisable):**
4. **Death gold forfeit** — default: **bank everything earned up to death** (no forfeit). Revisit only if dying feels costless.
5. **Second Wind vs. Phoenix Core** — default: **Second Wind** for v1 (simpler cheat-death); Phoenix Core later as a flashier variant.
