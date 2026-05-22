# Rainboids — Combat-Depth Expansion Plans.md

作成日: 2026-05-22

Source design docs (in `docs/`):
- `Arsenal & Combat-Depth Expansion — Brainstorm – 2026-05-22.md` (what/why)
- `Element & Resistance System — Implementation Plan – 2026-05-22.md` (Plan A)
- `Unified Skills (4-Slot) — Implementation Plan – 2026-05-22.md` (Plan B)
- `Item Tiers, Resistances & Traits — Implementation Plan – 2026-05-22.md` (Plan C)
- `Enemy & Boss Revamp — Design Plan – 2026-05-22.md` (Plan D — enemy batches + 10 unique bosses)

**Cross-plan order:** E1 is the foundation. E3 unblocks S5's element-skills + I3b.
S1 unblocks I3c. The S-track and I1 can run parallel to the E-track. Phase D (enemy
batches A.E8a–e + bosses) depends on the E-track; D.B0 infra gates all bosses.

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
| A.E8a | Existing-10 retrofit + 4 cheap verbs: real resist/element on all 10; GUARDIAN armor floor (flat dmg subtract, frontal-only); WASP swarm-flock (`swarmMovement`, CHILL→SHATTER clears pack); SENTINEL directional bastion shield (frontal arc blocks/reflects); TANGERINE OIL bomber (mines leave OIL slick); add Warden (adaptive: resists last element hit, decays). TITAN demoted to roving elite w/ rotating elemental weak-core | Stages demand element-switching; GUARDIAN armor wastes chip dmg / melts to CORRODE; WASP cluster freeze-shatters; SENTINEL front blocks shots; Warden visibly walls last element used; unit suite green | A.E2, A.E3, A.E5 | cc:TODO |
| A.E8b | New enemy Batch 2 (Pyro/Cryo): Cinder (suicide BRN swarm), Glacier (Cryo-immune brittle tank), Ashen Detonator (telegraphed death-flare), Frost Lance (CHILL-graze/FREEZE-direct sniper) — element/resist + AI + render + wave integration | Each type spawns + exhibits its verb in playtest; Glacier shatters on heavy Pyro hit; persistent-hazard FX pooled; AI survival run green | A.E8a | cc:TODO |
| A.E8c | New enemy Batch 3 (Volt/Toxic): Tesla Wraith (teleport+chain, can't blink frozen), Conduit Node (tethered damaging arcs + grants allies CONDUCT), Plaguebearer (CORRODE acid trails + spore-lings), Spore Carrier (periodic drone spawner) | Tether-beam, teleport, acid-trail, and spawner verbs all live; killing Conduit Node drops the buff+arcs; AI survival run green | A.E8a | cc:TODO |
| A.E8d | New enemy Batch 4 (Void/Radiant): Devourer (eats projectiles in cone, gains shield), Phantom (periodic invis, MARK reveals), Prism Mirror (reflects projectiles), Lumen Drone (regen bubble shield over allies), Beacon (homing/MARK magnet decoy) | Bullet-eat/invis/reflect/ally-shield/decoy verbs all live; beams+melee bypass Devourer eat; MARK reveals Phantom; AI survival run green | A.E8a | cc:TODO |
| A.E8e | New enemy Batch 5 (anti-meta + bruisers): Leech (strips a player buff on hit), Null Drone (skill-suppress aura), Hydra (splits on death unless AoE/overkill), Juggernaut (telegraphed ram, rear-exposed after slam), Thornback (counter-burst on hit), Wraithworm (burrow→re-emerge lunge) + remaining artillery/controllers (Pyrewing, Hailmother, Storm Diver, Bile Mortar, Singularity Mite) | Each verb live + has counterplay; Leech/Null Drone correctly read the 4-slot skill model; Hydra split gated by AoE/overkill; AI survival run green | A.E8a, B.S1 | cc:TODO |

## Phase B: Unified Skills (4-slot)

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| B.S1 | Rename `DEFENSE_SKILLS`→`SKILLS` (alias kept) + 4-slot model: `equippedSkills[4]`, `skillCooldowns[4]`, `activateSkill(slot)`, slot-aware `getEquippedSkill`/effect checks | Unit test: per-slot cooldown independence; 4 simultaneous skill effects tracked; existing single skill migrates to slot 0 | - | cc:完了 (6.59.0) |
| B.S2 | Input: bind Digit1-4 one-shot pulses, retire TAB/Q skill activation; gamepad mirror; fix stale SPACE comment | Keys 1-4 fire matching slot off-cooldown; TAB no longer activates; no auto-repeat spam | B.S1 | cc:完了 (6.61.0) |
| B.S3 | HUD 4-slot skill bar in `hud/status.js`: per-slot icon, keybind, cooldown ring | All 4 slots + live cooldowns visible; empty slots dim | B.S1 | cc:完了 (6.61.0) |
| B.S4 | Loadout UI: assign any owned skill to slots 1-4 (coordinate with Phase-7 skill-tree UI) | Player can place any owned skill into any slot; loadout drives HUD + keybinds | B.S1, B.S3 | cc:TODO |
| B.S5 | New skills batch 1 (~8): Overdrive (power→skill), Bullet Time, Bloodlust, Designator, Elemental Infusion, Aegis Barrier, Blink, Gravity Snare | Each skill works in any slot; no placebos (every config has a live consumer); power-weapon count 11→10 reflected in README | B.S1 (element skills also A.E3) | cc:TODO |

## Phase C: Item Tiers, Resistances & Traits

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| C.I1 | Rarity ladder 3→8: expand `RARITY_TIERS` (Common/Rare/Exceptional/Legendary/Epic/Godlike/Divine/Transcendental) with colors+glow; affix/resist counts by tier; prismatic Transcendental | Drops roll across 8 tiers at intended weights; affix-count-by-tier + rollRarity-distribution unit tests green; 8 colors distinct | - | cc:完了 (6.60.0) |
| C.I2 | Resist roll display + tier-gated resist counts (per §8.1 table) | Resist rolls appear on Exceptional+ items and scale with tier | A.E7, C.I1 | cc:TODO |
| C.I3a | Self-contained traits: Glass Cannon, Bullet Bloom, Echo, Orb Magnet, Hoarder's Greed, Momentum, Executioner's Edge, Second Heart, Reactive Plating (NEW `item-traits.js`; `getActiveTraits`) | Transcendental visibly stacks 5 traits; each trait has a live consumer (no placebo) | C.I1 | cc:TODO |
| C.I3b | Element traits: Hex Touch, Frostbite, Conductor, Elemental Overflow, Prismatic Soul | Each element trait applies its status via the A.E3 helpers | A.E3, A.E4, C.I1 | cc:TODO |
| C.I3c | Skill traits: Twin Cast, Adrenaline Junkie, Overcharged | Each skill trait affects the 4-slot skill model | B.S1, C.I1 | cc:TODO |
| C.I4 | Keystone reconcile: shared `ITEM_TRAITS` pool, two delivery channels (drop + stage-clear keystone card) | A rule-change is acquirable via Legendary+ drop OR keystone card; one balance surface | C.I3a | cc:TODO |

## Phase D: Bosses (10 unique, multi-phase)

Replaces the scaled-TITAN boss waves (3,6,…,30) with 10 hand-designed bosses. D.B0
is the shared chassis; every boss pair depends on it. Boss↔enemy-batch pairing keeps
each stage's normal waves teaching the boss's tricks. Reuses `boss-rage.js`
(telegraph/invuln/tantrum, `_bossPair`, formation math) as the underlying chassis.

| Task | 内容 | DoD | Depends | Status |
|------|------|-----|---------|--------|
| D.B0 | Boss infrastructure: always-visible boss healthbar UI (name + segmented HP + phase pips + element indicator) in `hud/`; declarative phase-script runner `enemy/boss-phases.js` (N HP-gated phases, each swaps the attack set; transition = telegraph→invuln→next); weak-point sub-entity layer `enemy/boss-parts.js` (child colliders w/ own HP+element, core-invuln-while-parts-live gating); intro/death sequences `enemy/boss-intro.js` (big warp-in, name card, multi-stage detonation) | Unit tests: phase gates fire once in order + invuln during transition; weak-point gating (core invuln while parts live); a stub boss reaches every phase + is killable via boss-fight smoke test; healthbar shows name/phase/element | A.E8a | cc:TODO |
| D.B1 | Bosses 1–2: THE HARBINGER (1-3, Kinetic — rotating bolt-head weak-points, bombard) + THE AEGIS (2-6, armor — rotating plate-gap, CORRODE-bypasses-armor, plate-shed phase). Validates the D.B0 chassis | Both bosses spawn at their waves w/ name card + healthbar; weak-points + armor gating work; rage/enrage fires; killable in 45–120s by a wave-appropriate build; boss-fight smoke tests green | D.B0 | cc:TODO |
| D.B2 | Bosses 3–4: LUMEN THE PRISM SOVEREIGN (3-9, Radiant — reflect-ring, shield drones, DISJUNCTION beam) + GEMINI (4-12, Pyro+Cryo twins — opposite resists force element-switching, tether beam, partner-death enrage) | Lumen reflect/shield/PURGE counterplay works; Gemini requires element-switching (one element can't kill both efficiently) + partner-enrage fires; smoke tests green | D.B0, A.E8b, A.E8d | cc:TODO |
| D.B3 | Bosses 5–6: MAELSTROM THE STORM CROWN (5-15, Volt — conduit nodes, CONDUCT rain, THUNDERCALL) + THE HIVEMOTHER (6-18, Toxic — egg-sac spawns, CORRODE clouds, kill-the-source) | Node-priority opens damage windows; CONDUCT-wet crits; Hivemother egg-sacs are cancellable weak-points + adds manageable; smoke tests green | D.B0, A.E8c | cc:TODO |
| D.B4 | Bosses 7–8: THE IRON THRONE (7-21, multi-turret — 4 per-element turrets, core-invuln-while-turrets-live, rotating core facet, turret respawn enrage) + THE WARDEN PRIME (8-24, adaptive — color-telegraphed resist wall, hard-locks, rapid-cycle phase, ADAPTIVE PURGE) | Iron Throne turret target-priority + element-cycling clears turrets; Warden forces rotation, Kinetic stays viable-but-slow fallback; smoke tests green | D.B0, A.E8e | cc:TODO |
| D.B5 | Bosses 9–10: NULLMAW THE DEVOURER (9-27, Void — constant pull, projectile-eat cone, gravity wells, IMPLOSION) + THE PRISMARCH/OMEGA (10-30, all 7 — 5-aspect gauntlet remixing prior signatures, rapid full-element cycle, FINAL JUDGMENT). Wire `isFinalBoss` → run-complete | Nullmaw punishes feeding the maw + IMPLOSION survivable by dash-out; Prismarch reaches all 5 aspects, demands element flexibility, death cinematic + run summary fire; smoke tests green | D.B0, D.B1, D.B2, D.B3, D.B4 | cc:TODO |
