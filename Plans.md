# Rainboids — Combat-Depth Expansion Plans.md

作成日: 2026-05-22

Source design docs (in `docs/`):
- `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (what/why)
- `Element & Resistance System — Implementation Plan – 2026-05-22.md` (Plan A)
- `Unified Skills (4-Slot) — Implementation Plan – 2026-05-22.md` (Plan B)
- `Item Tiers, Resistances & Traits — Implementation Plan – 2026-05-22.md` (Plan C)

**Cross-plan order:** E1 is the foundation. E3 unblocks S5's element-skills + I3b.
S1 unblocks I3c. The S-track and I1 can run parallel to the E-track.

---

## Phase A: Element & Resistance System

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| A.E1 | Element taxonomy + data model: NEW `combat/elements.js` (ELEMENTS config + `elementalMultiplier` helper); `element` field on all 22 weapons, 10 enemies, and bullets; resist maps | Unit test for `elementalMultiplier` (neutral/weak/resist/immune) green; all weapons+enemies carry element+resist; full unit suite green (zero gameplay change) | - | cc:完了 (6.57.0) |
| A.E2 | Player→enemy resistance wiring: `elementalMultiplier(enemy.resist, element)` into `applyDamageToEnemy`; resisted/weak/IMMUNE damage-number cues | Unit test: damage scales by resist map; Volt weapon visibly does more vs Volt-weak, 0 vs immune | A.E1 | cc:完了 (6.58.0) |
| A.E3 | Status engine (enemy-side): CORRODE, CHILL/FREEZE+brittle, CONDUCT, OIL, MARK, BLEED; new `applyX` helpers in combat-manager; enemy.js fields + `_processStatusEffects`; in-world status icons | Unit tests per status (tick/stack/refresh/gating) green; CORRODE amplifies subsequent damage; FREEZE halts move+fire | A.E1 | cc:TODO |
| A.E4 | Synergy reactions: OIL+Pyro flare, CONDUCT+Volt amp, FREEZE+heavy-hit SHATTER (re-freeze neighbors), MARK consumed by homing/crit/loot; hard chain-depth cap | Each combo fires in playtest; chain-depth cap unit test green | A.E2, A.E3 | cc:TODO |
| A.E5 | Enemy→player resistance + player statuses: enemy bullets carry element; `lifecycle.js takeDamage` resist multiplier; player-side status effects + HUD | Fire enemy burns player (reduced by Pyro resist); player status HUD shows active effects | A.E1, A.E3 | cc:TODO |
| A.E6 | Weapon element identity: each weapon applies its element's status on hit; retheme per-weapon stun/knock trees; retag all 22 weapons | Each weapon visibly applies its status; element labels show in shop/HUD | A.E3 | cc:TODO |
| A.E7 | Item resistance affixes: per-element resist entries in `ITEM_AFFIX_POOL`; inventory display | Equipping a Pyro-resist item measurably reduces fire damage/burn taken | A.E1 | cc:TODO |
| A.E8 | Enemy retrofit + first new types: resist/element/archetype on the 10; add Cinder, Glacier, Tesla Wraith, Warden (anti-meta) | Stages demand element-switching; Warden visibly shifts resist to last element used | A.E2, A.E3, A.E5 | cc:TODO |

## Phase B: Unified Skills (4-slot)

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| B.S1 | Rename `DEFENSE_SKILLS`→`SKILLS` (alias kept) + 4-slot model: `equippedSkills[4]`, `skillCooldowns[4]`, `activateSkill(slot)`, slot-aware `getEquippedSkill`/effect checks | Unit test: per-slot cooldown independence; 4 simultaneous skill effects tracked; existing single skill migrates to slot 0 | - | cc:完了 (6.59.0) |
| B.S2 | Input: bind Digit1-4 one-shot pulses, retire TAB/Q skill activation; gamepad mirror; fix stale SPACE comment | Keys 1-4 fire matching slot off-cooldown; TAB no longer activates; no auto-repeat spam | B.S1 | cc:TODO |
| B.S3 | HUD 4-slot skill bar in `hud/status.js`: per-slot icon, keybind, cooldown ring | All 4 slots + live cooldowns visible; empty slots dim | B.S1 | cc:TODO |
| B.S4 | Loadout UI: assign any owned skill to slots 1-4 (coordinate with Phase-7 skill-tree UI) | Player can place any owned skill into any slot; loadout drives HUD + keybinds | B.S1, B.S3 | cc:TODO |
| B.S5 | New skills batch 1 (~8): Overdrive (power→skill), Bullet Time, Bloodlust, Designator, Elemental Infusion, Aegis Barrier, Blink, Gravity Snare | Each skill works in any slot; no placebos (every config has a live consumer); power-weapon count 11→10 reflected in README | B.S1 (element skills also A.E3) | cc:TODO |

## Phase C: Item Tiers, Resistances & Traits

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| C.I1 | Rarity ladder 3→8: expand `RARITY_TIERS` (Common/Rare/Exceptional/Legendary/Epic/Godlike/Divine/Transcendental) with colors+glow; affix/resist counts by tier; prismatic Transcendental | Drops roll across 8 tiers at intended weights; affix-count-by-tier + rollRarity-distribution unit tests green; 8 colors distinct | - | cc:TODO |
| C.I2 | Resist roll display + tier-gated resist counts (per §8.1 table) | Resist rolls appear on Exceptional+ items and scale with tier | A.E7, C.I1 | cc:TODO |
| C.I3a | Self-contained traits: Glass Cannon, Bullet Bloom, Echo, Orb Magnet, Hoarder's Greed, Momentum, Executioner's Edge, Second Heart, Reactive Plating (NEW `item-traits.js`; `getActiveTraits`) | Transcendental visibly stacks 5 traits; each trait has a live consumer (no placebo) | C.I1 | cc:TODO |
| C.I3b | Element traits: Hex Touch, Frostbite, Conductor, Elemental Overflow, Prismatic Soul | Each element trait applies its status via the A.E3 helpers | A.E3, A.E4, C.I1 | cc:TODO |
| C.I3c | Skill traits: Twin Cast, Adrenaline Junkie, Overcharged | Each skill trait affects the 4-slot skill model | B.S1, C.I1 | cc:TODO |
| C.I4 | Keystone reconcile: shared `ITEM_TRAITS` pool, two delivery channels (drop + stage-clear keystone card) | A rule-change is acquirable via Legendary+ drop OR keystone card; one balance surface | C.I3a | cc:TODO |
