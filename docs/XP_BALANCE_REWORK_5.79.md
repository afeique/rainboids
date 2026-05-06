# XP / Wave / SP Balance Rework — 5.79.16

## Current state (BEFORE)

### XP economy (per action)
| Source | Amount |
| --- | --- |
| Bullet hit on enemy | **+6 XP** |
| Bullet hit on asteroid | **+4 XP** |
| Asteroid destroyed | **+5 XP** |
| Enemy killed | `ceil(points / 6)` |
| Wave clear bonus | `20 + wave × 10` |

Per-kill XP (current):

| Enemy | Points | Kill XP |
| --- | ---: | ---: |
| HUNTER | 120 | 20 |
| WASP | 100 | 17 |
| STALKER | 130 | 22 |
| GUARDIAN | 200 | 34 |
| WEAVER | 160 | 27 |
| TANGERINE | 160 | 27 |
| DRIFTER | 180 | 30 |
| SENTINEL | 220 | 37 |
| PROWLER | 240 | 40 |
| TITAN | 320 | 54 |

### XP curve
`experienceToNextLevel = floor(400 × 1.7^(level-1))`

| Level→ | Need | Cumulative |
| ---: | ---: | ---: |
| 2 | 400 | 400 |
| 3 | 680 | 1 080 |
| 4 | 1 156 | 2 236 |
| 5 | 1 965 | 4 201 |
| 6 | 3 340 | 7 541 |
| 7 | 5 678 | 13 219 |
| 8 | 9 653 | 22 872 |
| 9 | 16 410 | 39 282 |
| 10 | 27 897 | 67 179 |

The curve **doubles roughly every level** while content scales linearly. Player levels ~2× early then plateaus.

### Per-wave XP yield (rough estimate, current settings)
Wave 1 has 5 enemies + 3 asteroids:
- 4 HUNTER × (~4 hits × 6 + 20) = 4 × 44 = **176 XP**
- 1 WASP × (~3 hits × 6 + 17) = **35 XP**
- 3 ASTEROID × (~3 hits × 4 + 5) = **51 XP**
- Wave clear: **30 XP**
- **Total ≈ 292 XP** = 0.73 × L1→L2

### Bullet-spam inflates XP
Each bullet hit grants 6 XP. STORM_NEEDLES + MULTI_SHOT can hit 50× per second, so a single asteroid yields **300+ XP/sec just from bullet hits**. This blows past the kill-XP design intent — the player levels almost entirely from hit ticks, not from kills. That's why high-DPS builds level much faster than low-DPS builds, even though they kill the same enemies.

### Powerup SP cost
Currently **flat 1 SP each**. RAPID_FIRE (huge DPS lever) costs the same as KNOCKBACK (utility). Stacking 5× RAPID_FIRE = 5 SP = ~5 wave clears worth of gain. Trivializes the pacing.

---

## Goal

- **Player gains ~1.5 levels per wave** consistently.
- **Across 20 waves → ~30 levels** total. (Currently ~8-12.)
- **More enemies + asteroids per wave** so the XP source is "kill content" not "spam bullets".
- **SP costs scale with impact** — strong powerups cost more.

---

## After (the plan)

### XP rewards (per action)
| Source | Before | After | Why |
| --- | ---: | ---: | --- |
| Bullet hit on enemy | 6 | **2** | Cuts the bullet-spam inflation 3× while still rewarding hit feedback. |
| Bullet hit on asteroid | 4 | **1** | Same — STORM_NEEDLES + asteroid was the worst inflation case. |
| Asteroid destroyed | 5 | **12** | Bumped to keep total asteroid XP roughly flat at low DPS, while making the "destroy" event itself more valuable than the spam path. |
| Enemy killed | `points/6` | `points/3` | **2× kill XP** — kills become the main XP source. |
| Wave clear bonus | `20 + w×10` | `40 + w×15` | Bonus scales harder with wave number so late waves keep up. |

### Per-kill XP (after)
| Enemy | Points | Kill XP |
| --- | ---: | ---: |
| HUNTER | 120 | **40** |
| WASP | 100 | **34** |
| STALKER | 130 | **44** |
| GUARDIAN | 200 | **67** |
| WEAVER | 160 | **54** |
| TANGERINE | 160 | **54** |
| DRIFTER | 180 | **60** |
| SENTINEL | 220 | **74** |
| PROWLER | 240 | **80** |
| TITAN | 320 | **107** |

### XP curve
**Linear ramp** instead of geometric blow-up:

`experienceToNextLevel = 200 + (level - 1) × 50`

| Level→ | Need | Cumulative |
| ---: | ---: | ---: |
| 2 | 200 | 200 |
| 3 | 250 | 450 |
| 4 | 300 | 750 |
| 5 | 350 | 1 100 |
| 6 | 400 | 1 500 |
| 7 | 450 | 1 950 |
| 8 | 500 | 2 450 |
| 9 | 550 | 3 000 |
| 10 | 600 | 3 600 |
| 15 | 850 | 7 100 |
| 20 | 1 100 | 11 350 |
| 30 | 1 600 | 22 600 |

Cumulative XP for **30 levels = 22 600 XP**. Hitting that across 20 waves → ~1 130 XP/wave on average.

### Wave content scale-up
Roughly **+60% enemy count** + **+33% asteroid count** across the campaign. Boss waves get an additional escort sub-wave too.

### Per-wave XP yield (estimate, after the above)
| Wave | Enemies | Asteroids | XP from kills + hits | Wave bonus | Total | Levels gained |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 7 | 4 | ~280 | 55 | **335** | 1.5 (L1→L3 partial) |
| 2 | 8 | 4 | ~330 | 70 | **400** | 1.5 |
| 3 | 9 | 4 | ~390 | 85 | **475** | ~1.5 |
| 5 (boss) | ~12 + TITAN | 3 | ~700 | 115 | **815** | ~1.6 |
| 10 (twin boss) | ~14 + 2 TITAN | 2 | ~1 100 | 190 | **1 290** | ~1.7 |
| 15 (triple boss) | ~16 + 3 TITAN | 2 | ~1 500 | 265 | **1 765** | ~1.8 |
| 20 (final) | ~18 + 3 TITAN | 2 | ~1 900 | 340 | **2 240** | ~1.7 |

Cumulative across 20 waves: ~22 000 XP → finishes at **level 30**. Matches the "~1.5 levels/wave" target.

### SP costs by impact tier

**Tier 1 — major DPS / survival levers (5 SP each)**:
RAPID_FIRE, MULTI_SHOT, BIG_BULLETS, HOMING, PIERCING, CRIT_DAMAGE, HEALTH_BOOST.

**Tier 2 — meaningful but non-multiplicative (3 SP)**:
CRIT_CHANCE, SHIELD_BOOST, LONG_RANGE, EXPLOSIVE, SPEED_BOOST, HEALTH_DROP_FREQUENCY (Triage).

**Tier 3 — niche / utility (2 SP)**:
CHARGE_SPEED, CHARGE_POWER, KNOCKBACK.

**Tier 4 — capstones (8 SP)**:
TRIPLE_BEAM, ARC_OVERCHARGE, CONE_OF_FIRE, DOUBLE_PULSE, DAISY_CHAIN, CLUSTER_WARHEAD, AFTERSHOCK.

### SP supply
Currently: +1 SP per wave clear, +1 per level-up. With this rework granting ~30 levels + 20 wave clears = **50 SP across the run**.

After: keep +1 SP per wave clear, +1 per level. 30 + 20 = 50 SP — but with new prices:
- 5 × 5 SP (Tier 1) = 25 SP
- 3 × 3 SP (Tier 2) = 9 SP
- 1 × 8 SP (Capstone) = 8 SP
- 5 × 2 SP (Tier 3) = 10 SP
- **Total = 52 SP** to fully build a focused archetype

Roughly matches the supply, so a focused player can complete a full Tier 1 + 1 capstone + a few utility picks. Spreading across all tiers is impossible — forces build choice. Exactly the gameplay the user wants.

### DPS impact ratio (sanity check)

| Powerup | Per-stack DPS gain | Per-stack cost | XP per cost | Verdict |
| --- | ---: | ---: | ---: | --- |
| RAPID_FIRE | +28% | 5 SP | 5.6%/SP | Tier 1 — high cost, big gain |
| MULTI_SHOT | +100% (extra bullet) | 5 SP | 20%/SP | Tier 1 — top-tier multiplicative |
| CRIT_CHANCE | +7%×crit_dmg(2-3×) ≈ +14-21% | 3 SP | 4.7-7%/SP | Tier 2 — comparable to T1 in expected value but capped |
| KNOCKBACK | +40% impulse (utility) | 2 SP | — | Tier 3 — non-DPS |
| TRIPLE_BEAM | +120% beam damage (capstone) | 8 SP | 15%/SP | Tier 4 — gated, build-defining |

DPS-per-SP is roughly equalized within tier; capstones cost more but gate on having a coherent build.

---

## Implementation checklist

1. **`progression.js`**: change `experienceToNextLevel` formula to linear.
2. **`collision-system.js`**: bullet-hit XP 6→2, asteroid-hit 4→1, asteroid-destroy 5→12, kill XP `points/6 → points/3`.
3. **`wave-manager.js`**: wave bonus `20 + w×10 → 40 + w×15`.
4. **`wave-data.js`**: scale up enemy counts (~+60%) and asteroid counts (~+33%) across all 20 waves.
5. **`world/powerup.js`**: add `spCost` field per POWERUP_TYPES entry.
6. **`weapon-data.js`**: tag SKILL_UPGRADES + PRIMARY_UPGRADES + POWER_UPGRADES with appropriate spCost.
7. **`ui-manager.js`**: read powerup `spCost` for display + cost-gating in `purchasePowerup`.
8. **`hud/status.js`**: display SP-per-card cost in the powerup list.
9. **CHANGELOG**.
