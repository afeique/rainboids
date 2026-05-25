// Wave configuration data for enemy and asteroid spawning.
//
// 6.1.0 — 30 waves restructured as 10 STAGES × 3 waves. Every stage
// final (wave 3, 6, 9, …, 30) is a BOSS. Each stage typically
// introduces a new enemy type, with the boss + escort showcasing the
// stage's headliners. Meta-goal: 10 survivor-card picks (one per stage
// clear, free) across the campaign.
//
//   Stage  1 (1-1..1-3)  : Iron Scout      — HUNTER + WASP, boss TITAN T1
//   Stage  2 (2-1..2-3)  : Iron Sentinel   — adds GUARDIAN
//   Stage  3 (3-1..3-3)  : Iron Vanguard   — adds STALKER (sniper line)
//   Stage  4 (4-1..4-3)  : Twin Iron       — adds DRIFTER + TANGERINE; LEECH debut
//   Stage  5 (5-1..5-3)  : Triple Threat   — adds WEAVER + SENTINEL; WRAITHWORM debut
//   Stage  6 (6-1..6-3)  : Iron Quartet    — adds PROWLER (full roster); NULL_DRONE debut
//   Stage  7 (7-1..7-3)  : Iron Crown      — combined arms, dense; PHANTOM debut
//   Stage  8 (8-1..8-3)  : The Long Walk   — compounding pressure; DEVOURER + PRISM_MIRROR debut
//   Stage  9 (9-1..9-3)  : Apocalypse      — peak density; new-type roster at full ramp
//   Stage 10 (10-1..10-3): The Last Stand  — finale; new-type showcase; 10-3 = FINAL BOSS
//
// New-type roster insertion (non-boss waves only; the live Adaptive
// Difficulty Director is the safety net for the difficulty shift):
//   LEECH        (Toxic strip)   : 11(1), 13(2), 22(2), 26(2)
//   WRAITHWORM   (Volt blink)    : 14(1), 19(2), 25(1)
//   NULL_DRONE   (Volt suppress) : 17(1), 20(1), 26(1)   — always solo
//   PHANTOM      (Void cloak)    : 19(1), 23(2), 28(1), 29(1)
//   DEVOURER     (Void absorb)   : 22(1), 26(1), 28(1)
//   PRISM_MIRROR (Radiant reflect): 23(1), 28(1)         — count 1 only
//   CONDUIT_NODE (Volt heal-aura) : 25(1)                — count 1 only; debut
//   JUGGERNAUT   (Kinetic ram)    : 22(1)                — count 1 only; debut (charge-and-ram bruiser)
//   THORNBACK    (Kinetic counter): 25(1)                — count 1 only; debut (counter-attack bruiser)

import { GAME_CONFIG, MAX_WAVES, BOSS_WAVES, WAVES_PER_STAGE } from '../core/constants.js';
import { isMobile } from '../platform/platform-detect.js';

// 5.75.0 — Each wave is now a SEQUENCE of sub-waves instead of a single
// burst spawn. `subWaves` is an array of enemy-group arrays; the wave
// manager spawns sub-wave 0 at wave start, sub-wave 1 when ≤2 enemies
// remain (or after a 12s fallback), etc. Wave only ends when ALL
// sub-waves have spawned AND every enemy is dead. Result: waves last
// 2–3× longer, density stays manageable, and the player gets time
// between pulses to breathe / collect orbs / spend picks. Boss waves
// hold the boss in the final sub-wave so the escort softens the player
// up first. All non-boss waves get a CHANCE for a mid-wave mini-boss
// (see wave-manager.spawnLeveledEnemies — the chance is wave-scaled).
export const WAVE_DATA = {

    // ── Stage 1: First Contact (HUNTER + WASP) ──
    1: { asteroids: 5, subWaves: [
        [{ type: 'HUNTER', count: 3 }],
        [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 2 }],
        [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
    ] },
    2: { asteroids: 5, subWaves: [
        [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
        [{ type: 'WASP', count: 4 }],
        [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 3 }],
    ] },
    // 1-3 BOSS — Iron Scout: introductory TITAN, light escort.
    3: {
        asteroids: 3, isBossWave: true, bossTier: 1,
        subWaves: [
            [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
            [{ type: 'TITAN', count: 1, isBoss: true, bossTier: 1 }, { type: 'HUNTER', count: 2 }, { type: 'WASP', count: 2 }],
        ],
    },

    // ── Stage 2: Iron Sentinel (adds GUARDIAN heavy) ──
    4: { asteroids: 5, subWaves: [
        [{ type: 'GUARDIAN', count: 2 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'HUNTER', count: 3 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 3 }],
    ] },
    5: { asteroids: 5, subWaves: [
        [{ type: 'GUARDIAN', count: 3 }, { type: 'HUNTER', count: 2 }],
        [{ type: 'WASP', count: 4 }, { type: 'GUARDIAN', count: 1 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }],
    ] },
    // 2-3 BOSS — Iron Sentinel: TITAN T1 with heavy GUARDIAN escort.
    6: {
        asteroids: 3, isBossWave: true, bossTier: 1,
        subWaves: [
            [{ type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 2 }],
            [{ type: 'TITAN', count: 1, isBoss: true, bossTier: 1 }, { type: 'GUARDIAN', count: 3 }, { type: 'HUNTER', count: 2 }],
        ],
    },

    // ── Stage 3: Iron Vanguard (adds STALKER sniper) ──
    7: { asteroids: 5, subWaves: [
        [{ type: 'STALKER', count: 2 }],
        [{ type: 'STALKER', count: 2 }, { type: 'HUNTER', count: 3 }],
        [{ type: 'STALKER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }],
    ] },
    8: { asteroids: 5, subWaves: [
        [{ type: 'STALKER', count: 3 }, { type: 'HUNTER', count: 2 }],
        [{ type: 'GUARDIAN', count: 3 }, { type: 'STALKER', count: 1 }],
        [{ type: 'STALKER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'HUNTER', count: 3 }],
    ] },
    // 3-3 BOSS — Iron Vanguard: TITAN T2 with STALKER escort.
    9: {
        asteroids: 3, isBossWave: true, bossTier: 2,
        subWaves: [
            [{ type: 'STALKER', count: 2 }, { type: 'GUARDIAN', count: 2 }],
            [{ type: 'TITAN', count: 1, isBoss: true, bossTier: 2 }, { type: 'STALKER', count: 2 }, { type: 'HUNTER', count: 2 }],
        ],
    },

    // ── Stage 4: Twin Iron (adds DRIFTER + TANGERINE; LEECH debut) ──
    // 11-3 introduces the LEECH (Toxic harrier) as a 1-count accent — a
    // low-HP nuisance that strips player buffs. It debuts here in the
    // toxic-flavored stage (alongside PLAGUEBEARER) before ramping later.
    10: { asteroids: 4, subWaves: [
        [{ type: 'DRIFTER', count: 2 }, { type: 'HUNTER', count: 2 }],
        [{ type: 'TANGERINE', count: 2 }, { type: 'CINDER', count: 2 }],
        [{ type: 'DRIFTER', count: 2 }, { type: 'ASHEN_DETONATOR', count: 2 }, { type: 'HUNTER', count: 1 }],
    ] },
    11: { asteroids: 4, subWaves: [
        [{ type: 'STALKER', count: 2 }, { type: 'DRIFTER', count: 2 }],
        [{ type: 'TANGERINE', count: 2 }, { type: 'CINDER', count: 2 }],
        [{ type: 'STALKER', count: 2 }, { type: 'TESLA_WRAITH', count: 2 }, { type: 'PLAGUEBEARER', count: 1 }, { type: 'LEECH', count: 1 }],
    ] },
    // 4-3 BOSS — Twin Iron: 2× TITAN T2.
    12: {
        asteroids: 3, isBossWave: true, bossTier: 2,
        subWaves: [
            [{ type: 'GUARDIAN', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'WASP', count: 2 }],
            [{ type: 'TITAN', count: 2, isBoss: true, bossTier: 2 }, { type: 'STALKER', count: 2 }, { type: 'TANGERINE', count: 1 }],
        ],
    },

    // ── Stage 5: Triple Threat (adds WEAVER + SENTINEL; LEECH ramps, WRAITHWORM debut) ──
    // LEECH (Toxic) steps up to 2 here. WRAITHWORM (Volt blink-burrow)
    // makes its first appearance on 14-3 as a single accent — it warps
    // around the field, so it shows up sparingly before ramping in Stage 7+.
    13: { asteroids: 4, subWaves: [
        [{ type: 'WEAVER', count: 2 }, { type: 'WASP', count: 3 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'HUNTER', count: 3 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'GLACIER', count: 2 }, { type: 'STALKER', count: 1 }, { type: 'LEECH', count: 2 }],
    ] },
    14: { asteroids: 4, subWaves: [
        [{ type: 'SENTINEL', count: 2 }, { type: 'WASP', count: 2 }],
        [{ type: 'SENTINEL', count: 2 }, { type: 'GLACIER', count: 2 }, { type: 'WEAVER', count: 1 }],
        [{ type: 'SENTINEL', count: 2 }, { type: 'FROST_LANCE', count: 2 }, { type: 'WEAVER', count: 1 }, { type: 'WRAITHWORM', count: 1 }],
    ] },
    // 5-3 BOSS — Triple Threat: 3× TITAN T3.
    15: {
        asteroids: 2, isBossWave: true, bossTier: 3,
        subWaves: [
            [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'WEAVER', count: 1 }],
            [{ type: 'TITAN', count: 3, isBoss: true, bossTier: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'STALKER', count: 1 }],
        ],
    },

    // ── Stage 6: Iron Quartet (adds PROWLER — full roster; NULL_DRONE debut) ──
    // NULL_DRONE (Volt suppress-aura) debuts on 17-3 as a SINGLE escort —
    // its aura damps the player's fire rate, so it's introduced one at a
    // time and always solo, never stacked. Pair it with the support-style
    // units (HYDRA/WARDEN) that already anchor this stage.
    16: { asteroids: 4, subWaves: [
        [{ type: 'PROWLER', count: 2 }, { type: 'HUNTER', count: 3 }],
        [{ type: 'PROWLER', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'SPORE_CARRIER', count: 1 }],
        [{ type: 'WARDEN', count: 1 }, { type: 'PROWLER', count: 1 }, { type: 'GUARDIAN', count: 2 }, { type: 'WEAVER', count: 2 }],
    ] },
    17: { asteroids: 4, subWaves: [
        [{ type: 'TANGERINE', count: 2 }, { type: 'DRIFTER', count: 2 }, { type: 'HUNTER', count: 2 }],
        [{ type: 'SENTINEL', count: 2 }, { type: 'WEAVER', count: 2 }, { type: 'STALKER', count: 2 }],
        [{ type: 'PROWLER', count: 2 }, { type: 'HYDRA', count: 1 }, { type: 'NULL_DRONE', count: 1 }, { type: 'WASP', count: 2 }],
    ] },
    // 6-3 BOSS — Iron Quartet: 3× TITAN T3 + PROWLER escort.
    18: {
        asteroids: 2, isBossWave: true, bossTier: 3,
        subWaves: [
            [{ type: 'PROWLER', count: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'WASP', count: 2 }],
            [{ type: 'TITAN', count: 3, isBoss: true, bossTier: 3 }, { type: 'PROWLER', count: 2 }, { type: 'GUARDIAN', count: 2 }],
        ],
    },

    // ── Stage 7: Iron Crown (combined arms, dense; PHANTOM debut, WRAITHWORM/NULL_DRONE ramp) ──
    // PHANTOM (Void cloak) makes its first appearance on 19-3 as a single
    // accent — it phases off auto-aim/homing, so it slips in among the
    // dense roster. WRAITHWORM steps up to 2 (mid-wave). NULL_DRONE
    // reappears solo on 20-2 to keep the suppress pressure occasional.
    19: { asteroids: 4, subWaves: [
        [{ type: 'HUNTER', count: 4 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }],
        [{ type: 'STALKER', count: 2 }, { type: 'WEAVER', count: 2 }, { type: 'LUMEN_DRONE', count: 1 }, { type: 'WRAITHWORM', count: 2 }],
        [{ type: 'PROWLER', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'PHANTOM', count: 1 }, { type: 'TANGERINE', count: 1 }],
    ] },
    20: { asteroids: 4, subWaves: [
        [{ type: 'STALKER', count: 3 }, { type: 'PROWLER', count: 2 }, { type: 'WASP', count: 2 }],
        [{ type: 'SENTINEL', count: 3 }, { type: 'GUARDIAN', count: 2 }, { type: 'NULL_DRONE', count: 1 }, { type: 'HUNTER', count: 1 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'DRIFTER', count: 2 }],
    ] },
    // 7-3 BOSS — Iron Crown: 4× TITAN T4 + STALKER escort.
    21: {
        asteroids: 2, isBossWave: true, bossTier: 4,
        subWaves: [
            [{ type: 'STALKER', count: 3 }, { type: 'GUARDIAN', count: 3 }, { type: 'WEAVER', count: 1 }],
            [{ type: 'TITAN', count: 4, isBoss: true, bossTier: 4 }, { type: 'STALKER', count: 2 }, { type: 'SENTINEL', count: 2 }],
        ],
    },

    // ── Stage 8: The Long Walk (compounding pressure; DEVOURER + PRISM_MIRROR debut) ──
    // DEVOURER (Void projectile-absorb) debuts on 22-3 as a single accent —
    // it eats incoming shots, rewarding repositioning. LEECH ramps to 2
    // here. PRISM_MIRROR (Radiant reflect) makes its FIRST appearance on
    // 23-3 as a single unit only — reflection is potent, so it stays at 1.
    // PHANTOM steps up to 2 (cloak pressure in the late game). JUGGERNAUT
    // (Kinetic charge-and-ram bruiser) DEBUTS on 22-1 as a single accent
    // among the Kinetic-flavored TANGERINE/GUARDIAN/HUNTER opener — a
    // read-the-tell threat that telegraphs a lethal charge.
    22: { asteroids: 4, subWaves: [
        [{ type: 'TANGERINE', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'HUNTER', count: 2 }, { type: 'JUGGERNAUT', count: 1 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'DRIFTER', count: 2 }, { type: 'LEECH', count: 2 }],
        [{ type: 'PROWLER', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'DEVOURER', count: 1 }, { type: 'WASP', count: 2 }],
    ] },
    23: { asteroids: 4, subWaves: [
        [{ type: 'HUNTER', count: 5 }, { type: 'STALKER', count: 2 }],
        [{ type: 'SENTINEL', count: 3 }, { type: 'PROWLER', count: 2 }, { type: 'PHANTOM', count: 2 }],
        [{ type: 'GUARDIAN', count: 3 }, { type: 'PRISM_MIRROR', count: 1 }, { type: 'DRIFTER', count: 1 }],
    ] },
    // 8-3 BOSS — Iron Quintet: 4× TITAN T4 + TANGERINE.
    24: {
        asteroids: 2, isBossWave: true, bossTier: 4,
        subWaves: [
            [{ type: 'TANGERINE', count: 3 }, { type: 'GUARDIAN', count: 3 }, { type: 'STALKER', count: 2 }],
            [{ type: 'TITAN', count: 4, isBoss: true, bossTier: 4 }, { type: 'TANGERINE', count: 2 }, { type: 'PROWLER', count: 2 }],
        ],
    },

    // ── Stage 9: Apocalypse (peak density; new-type roster at full ramp; CONDUIT_NODE debut) ──
    // The new types reach their late-game presence here: WRAITHWORM
    // (blink) on 25-2, then DEVOURER (absorb) + NULL_DRONE (suppress) +
    // LEECH (strip) layered across 26. Counts stay 1-2 each — the
    // Adaptive Difficulty Director carries the scaling — but every new
    // mechanic is now live in the player's face at peak density.
    // CONDUIT_NODE (Volt HEAL-aura support) makes its FIRST appearance on
    // 25-2 as a SINGLE accent — it sits among the Volt-flavored WRAITHWORM
    // and a beefy SENTINEL/PROWLER escort whose HP its aura can meaningfully
    // mend, so killing the node first becomes the priority. Count 1 only.
    // THORNBACK (Kinetic counter-attack bruiser) DEBUTS on 25-1 as a single
    // accent among the Kinetic-flavored STALKER/GUARDIAN/WASP opener — a
    // punish-point-blank threat that rewards measured fire from range. Count 1.
    25: { asteroids: 4, subWaves: [
        [{ type: 'STALKER', count: 3 }, { type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 2 }, { type: 'THORNBACK', count: 1 }],
        [{ type: 'SENTINEL', count: 3 }, { type: 'PROWLER', count: 2 }, { type: 'WRAITHWORM', count: 1 }, { type: 'CONDUIT_NODE', count: 1 }],
        [{ type: 'TANGERINE', count: 3 }, { type: 'DRIFTER', count: 2 }, { type: 'HUNTER', count: 3 }],
    ] },
    26: { asteroids: 4, subWaves: [
        [{ type: 'PROWLER', count: 3 }, { type: 'NULL_DRONE', count: 1 }, { type: 'TANGERINE', count: 2 }],
        [{ type: 'WEAVER', count: 3 }, { type: 'LEECH', count: 2 }, { type: 'GUARDIAN', count: 2 }],
        [{ type: 'HUNTER', count: 4 }, { type: 'DEVOURER', count: 1 }, { type: 'DRIFTER', count: 2 }],
    ] },
    // 9-3 BOSS — Iron Tide: 5× TITAN T4 + WEAVER escort.
    27: {
        asteroids: 2, isBossWave: true, bossTier: 4,
        subWaves: [
            [{ type: 'WEAVER', count: 3 }, { type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }],
            [{ type: 'TITAN', count: 5, isBoss: true, bossTier: 4 }, { type: 'WEAVER', count: 2 }, { type: 'STALKER', count: 2 }],
        ],
    },

    // ── Stage 10: The Last Stand (finale; new-type showcase) ──
    // The finale waves showcase the new mechanics one last time before the
    // final boss: DEVOURER + PHANTOM on 28, a second (and final) lone
    // PRISM_MIRROR on 28-3, and a single PHANTOM cloaker escorting the
    // 29-3 TITAN mini-boss. Reflection stays at count 1 throughout the run.
    28: { asteroids: 4, subWaves: [
        [{ type: 'STALKER', count: 3 }, { type: 'GUARDIAN', count: 3 }, { type: 'DEVOURER', count: 1 }, { type: 'WASP', count: 2 }],
        [{ type: 'TANGERINE', count: 3 }, { type: 'PHANTOM', count: 1 }, { type: 'HUNTER', count: 2 }],
        [{ type: 'SENTINEL', count: 3 }, { type: 'WEAVER', count: 2 }, { type: 'PRISM_MIRROR', count: 1 }, { type: 'DRIFTER', count: 2 }],
    ] },
    29: { asteroids: 4, subWaves: [
        [{ type: 'HUNTER', count: 4 }, { type: 'GUARDIAN', count: 3 }, { type: 'WASP', count: 3 }],
        [{ type: 'STALKER', count: 3 }, { type: 'WEAVER', count: 3 }, { type: 'PROWLER', count: 2 }],
        [{ type: 'TITAN', count: 1 }, { type: 'SENTINEL', count: 2 }, { type: 'PHANTOM', count: 1 }, { type: 'DRIFTER', count: 2 }],
    ] },
    // 10-3 FINAL BOSS — The Last Stand: 5× TITAN T4 + full escort.
    30: {
        asteroids: 2, isBossWave: true, bossTier: 4, isFinalBoss: true,
        subWaves: [
            [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'STALKER', count: 2 }],
            [{ type: 'PROWLER', count: 2 }, { type: 'WEAVER', count: 2 }, { type: 'TANGERINE', count: 2 }],
            [{ type: 'TITAN', count: 5, isBoss: true, bossTier: 4 }, { type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'PROWLER', count: 1 }],
        ],
    },
};

// Helper function to get wave configuration. Past MAX_WAVES we just clamp
// to the final boss wave — the run loop should transition to GAME_COMPLETE
// before getWaveConfig is called for wave 21+.
//
// 5.99.1 → 5.99.2 — Mobile difficulty pass with a STEEPER early-wave
// reduction. The flat 0.45 multiplier still made wave 1-3 feel frenetic
// on mobile because each sub-wave dumps multiple enemy types at once.
// Per-wave table now eases the player in:
//   Wave 1: 0.20×  (e.g. wave 1's 7 enemies → 1-2 enemies)
//   Wave 2: 0.25×
//   Wave 3: 0.30×
//   Wave 4: 0.40×
//   Wave 5+: 0.45×  (rest of campaign keeps the previous tuning)
//
// Asteroid count uses a parallel curve:
//   Wave 1-3: 0.25×, Wave 4: 0.35×, Wave 5+: 0.40×
//
// Bosses (count×bossTier) are preserved so the campaign milestones
// (waves 5/10/15/20) still feel like milestones — only their escort
// enemies thin out.
const _MOBILE_ENEMY_MULT_BY_WAVE = {
    1: 0.20,
    2: 0.25,
    3: 0.30,
    4: 0.40,
};
const _MOBILE_ASTEROID_MULT_BY_WAVE = {
    1: 0.25,
    2: 0.25,
    3: 0.25,
    4: 0.35,
};
const _MOBILE_ENEMY_MULT_DEFAULT = 0.45;
const _MOBILE_ASTEROID_MULT_DEFAULT = 0.40;

// 5.99.3 — Per-entry SUBWAVE cap on mobile. Even after the per-wave
// multiplier thins counts, a subwave like `[GUARDIAN 2, SENTINEL 1,
// STALKER 3]` still dumps 6 enemies into the field at once after
// scaling (3 × 0.45 ≈ 1-2 each), which feels frenetic to a casual
// touch-controls player. Cap each ENTRY to 1-2 enemies in early waves,
// 2 in mid-waves, 2-3 in late waves. Caller still gets the original
// number of entries per subwave, but each entry is small.
const _MOBILE_PER_ENTRY_CAP_BY_WAVE = {
    1: 1,
    2: 1,
    3: 2,
    4: 2,
};
const _MOBILE_PER_ENTRY_CAP_DEFAULT = 2;

function _scaleConfigForMobile(cfg, waveNumber) {
    if (!cfg) return cfg;
    const enemyMult = _MOBILE_ENEMY_MULT_BY_WAVE[waveNumber] ?? _MOBILE_ENEMY_MULT_DEFAULT;
    const asteroidMult = _MOBILE_ASTEROID_MULT_BY_WAVE[waveNumber] ?? _MOBILE_ASTEROID_MULT_DEFAULT;
    const perEntryCap = _MOBILE_PER_ENTRY_CAP_BY_WAVE[waveNumber] ?? _MOBILE_PER_ENTRY_CAP_DEFAULT;
    const scaleCount = (n) => Math.max(1, Math.min(perEntryCap, Math.round(n * enemyMult)));

    const scaledSubWaves = (cfg.subWaves || []).map((group) =>
        group.map((entry) => {
            // Don't thin the boss itself — only escort enemies.
            if (entry.isBoss) return { ...entry };
            return { ...entry, count: scaleCount(entry.count) };
        })
    );

    const scaledAsteroids = Math.max(1, Math.round((cfg.asteroids || 0) * asteroidMult));

    return { ...cfg, asteroids: scaledAsteroids, subWaves: scaledSubWaves };
}

// Per-wave cache so we don't deep-clone on every call. Keyed by wave
// number; invalidated only by a full page reload (isMobile() reads URL
// override + the live viewport state at module load).
const _mobileWaveCache = new Map();

// H2 (Bug-Pass 2026-05-25) — past the hand-authored WAVE_DATA (waves
// 1..MAX_WAVES = 1..30), long runs (stages > 10) used to fall back to
// WAVE_DATA[1] — wave-1's trivial 3-HUNTER content with no boss entry — so
// any wave > 30 went trivial AND never spawned a boss. RUN-05b (the
// procedural wave composer) will replace this; until then we CYCLE the
// authored 30-wave pattern so a long run keeps varied, escalating GROUP
// content. The per-wave enemy LEVEL / HP / speed scaling is still driven by
// the REAL `waveNumber` / `maxWaves` in getEnemyLevel / getLevelScaledEnemyStats
// (NOT this cycled key), so cycling only picks WHICH enemy groups spawn — the
// stat curve is untouched and there's no double-scaling. Stage-finals past 30
// are made boss-eligible by isBossWave(wave, wps) on the spawn path (fix #1),
// independent of which authored entry the cycle landed on.
//
// Default-safe: for waveNumber ≤ MAX_WAVES this is byte-for-byte the old
// `WAVE_DATA[w] || WAVE_DATA[1]` (the cycle key === w in that range, and the
// `|| WAVE_DATA[1]` guard is preserved). The default 10×3 run never reaches
// the cycle branch.
function _configKeyForWave(waveNumber) {
    const w = Math.max(1, waveNumber | 0);
    if (w <= MAX_WAVES) return w;
    // Cycle 1..MAX_WAVES: wave 31 → 1, 32 → 2, …, 60 → 30, 61 → 1, …
    return (((w - 1) % MAX_WAVES) + 1);
}

export function getWaveConfig(waveNumber, maxWaves = MAX_WAVES) {
    const mw = Math.max(1, maxWaves | 0);
    // Clamp the wave to the real run length, THEN map to an authored-table key
    // (identity for ≤30, cycled for the synthesized late game).
    const clamped = Math.max(1, Math.min(mw, waveNumber | 0));
    const key = _configKeyForWave(clamped);
    const base = WAVE_DATA[key] || WAVE_DATA[1];
    if (!isMobile()) return base;
    if (_mobileWaveCache.has(key)) return _mobileWaveCache.get(key);
    const scaled = _scaleConfigForMobile(base, key);
    _mobileWaveCache.set(key, scaled);
    return scaled;
}

// Returns true when this wave is a boss wave — the LAST wave of each
// stage. RUN-01a: derived from `wavesPerStage` (boss is every multiple
// of it) instead of the static BOSS_WAVES table, so longer / shorter
// runs get bosses on their real stage finals. With the default
// wavesPerStage=3 this yields exactly [3,6,9,...,30] — identical to the
// BOSS_WAVES membership for waves 1..30. BOSS_WAVES stays exported for
// any legacy reader; the live check routes through this param form.
export function isBossWave(waveNumber, wavesPerStage = WAVES_PER_STAGE) {
    const w = waveNumber | 0;
    const wps = Math.max(1, wavesPerStage | 0);
    return w > 0 && w % wps === 0;
}

// 1 → MAX_WAVES across the campaign so per-wave scaling formulas can
// use the wave number directly. Each wave is a distinct level — no
// plateaus. (5.101.0 — MAX_WAVES is 30 now; the underlying stat
// curves in getLevelScaledEnemyStats use the live MAX_WAVES so the
// per-level deltas stretch to fit.)
// Enemy level now TRACKS THE PLAYER's account level, biased by wave so the run
// has a clear difficulty curve: early waves spawn enemies slightly BELOW the
// player's level (gentle), late waves slightly ABOVE it (a real test). The bias
// sweeps linearly from EARLY → LATE across the 30-wave run. Clamped to a sane
// band so the stat curve (getLevelScaledEnemyStats) can't explode for very
// high-level accounts. Tune the bias endpoints to taste.
export const ENEMY_LEVEL_BIAS_EARLY = -2; // wave 1: player level − 2
export const ENEMY_LEVEL_BIAS_LATE  = 4;  // final wave: player level + 4
const ENEMY_LEVEL_MAX = MAX_WAVES + 15;   // cap so high accounts stay bounded
export function getEnemyLevel(waveNumber, playerLevel = 1, maxWaves = MAX_WAVES) {
    const mw = Math.max(1, maxWaves | 0);
    const w = Math.max(1, Math.min(mw, waveNumber | 0));
    const t = (w - 1) / Math.max(1, mw - 1);
    const bias = ENEMY_LEVEL_BIAS_EARLY + t * (ENEMY_LEVEL_BIAS_LATE - ENEMY_LEVEL_BIAS_EARLY);
    const lvl = Math.round(Math.max(1, playerLevel | 0 || 1) + bias);
    return Math.max(1, Math.min(ENEMY_LEVEL_MAX, lvl));
}

// Asteroid level lifts every other wave (1,1,2,2,3,3,...) so rocks
// don't outpace the player's weapon scaling. `maxWaves` clamps the
// wave number to the real run length.
export function getAsteroidLevel(waveNumber, maxWaves = MAX_WAVES) {
    const mw = Math.max(1, maxWaves | 0);
    const w = Math.max(1, Math.min(mw, waveNumber | 0));
    return Math.max(1, Math.ceil(w / 2));
}

// Enemy speed multiplier — POWER CURVE so early waves are gentle and the
// late waves climb fast. 5.101.0 — denominator now MAX_WAVES-1 so the
// curve stretches across the full 30-wave campaign instead of saturating
// by wave 20. Endpoints unchanged: wave 1 = 0.55×, final wave = 1.75×.
export function getEnemySpeedMultiplier(waveNumber, maxWaves = MAX_WAVES) {
    const mw = Math.max(1, maxWaves | 0);
    const w = Math.max(1, Math.min(mw, waveNumber | 0));
    const t = (w - 1) / Math.max(1, mw - 1);
    return 0.55 + Math.pow(t, 1.5) * 1.2;
}

// Enemy bullet speed multiplier — DECOUPLED from enemy movement so the
// floor can be raised. Wave 1 enemies still MOVE gently but their
// bullets fly at 1.15× base. Final wave climbs to 3.05×.
// 5.101.0 — Same stretch as getEnemySpeedMultiplier — denominator is
// now MAX_WAVES-1.
export function getEnemyBulletSpeedMultiplier(waveNumber, maxWaves = MAX_WAVES) {
    const mw = Math.max(1, maxWaves | 0);
    const w = Math.max(1, Math.min(mw, waveNumber | 0));
    const t = (w - 1) / Math.max(1, mw - 1);
    return 1.15 + Math.pow(t, 1.4) * 1.9;
}

// ── Wave Subtitles ──────────────────────────────────────────────────────
// Pithy one-liners displayed during wave intros (one per wave for the
// 30-wave run, plus generic backups in case a wave is added later).
// 6.1.0 — Wave subtitles re-keyed for the 10-stage / 3-wave layout.
// Stage finals (3, 6, 9, 12, ...) call out the boss; mid-stage waves
// (1-1 / 1-2 / 2-1 / 2-2 / etc.) get pithy combat one-liners.
export const WAVE_SUBTITLES = {
    1:  "Don't worry, they die easy.",
    2:  "Okay maybe worry a little.",
    3:  "BOSS — Iron Scout. Aim for the bolts.",
    4:  "Heavies on deck.",
    5:  "Combined arms. Pick your poison.",
    6:  "BOSS — Iron Sentinel. Walking armor.",
    7:  "Sniper line. Don't stand still.",
    8:  "Hold position? No. Move.",
    9:  "BOSS — Iron Vanguard. Bring a hammer.",
    10: "Stragglers and squadrons.",
    11: "Heavy weather. Bring a coat.",
    12: "BOSS — Twin Iron. Doubled, redoubled.",
    13: "Storms in space — who knew?",
    14: "Defense wall. Bring a hammer.",
    15: "BOSS — Triple Threat. Three. Of. Them.",
    16: "Predators inbound. Pack hunters.",
    17: "All-star roster. They're showing off.",
    18: "BOSS — Iron Quartet. Four for the price of three.",
    19: "Combined arms — every type, every angle.",
    20: "Bullet hell sample platter.",
    21: "BOSS — Iron Crown. The throne is overdue.",
    22: "Aftershocks. They aren't done.",
    23: "The walls are closing in.",
    24: "BOSS — Iron Quintet. Five-tier salute.",
    25: "Apocalypse. Light at the end is a missile.",
    26: "There is no off-switch.",
    27: "BOSS — Iron Tide. Endless onslaught.",
    28: "Edge of doom. One more push.",
    29: "Final approach. Steady hands.",
    30: "FINAL BOSS — The Last Stand.",
};

// Generic subtitles, only used if WAVE_SUBTITLES is missing an entry.
export const WAVE_SUBTITLES_GENERIC = [
    "Good luck. You'll need it.",
    "Still alive? Impressive.",
    "They keep coming!",
    "This is getting ridiculous.",
    "You're built different.",
];

// Level-scaled enemy stats — POWER-CURVED.
//
// 5.73.0 — HP curve flattened (exponent 1.6 → 1.0, scale 4.5 → 6.5)
// to ramp HP MUCH faster from wave 5 onward. Players reported the
// game stayed too easy in the mid-game; now wave 5 enemies have ~2.4×
// HP (was 1.37×), wave 10 ~4× (was 2.3×), wave 20 ~7.5× (was 5.5×).
//
//   HP    1 + ((L-1)/19)^1.0 · 6.5      L1: 1.0  L5: 2.37  L10: 4.08  L15: 5.79  L20: 7.50
//   pts   1 + ((L-1)/19)^1.4 · 5.5      L1: 1.0  L5: 1.50  L10: 2.55  L15: 4.00  L20: 6.50
//   spd   1 + ((L-1)/19)^1.4 · 0.4      L1: 1.00 L5: 1.03  L10: 1.11  L15: 1.22  L20: 1.40
export function getLevelScaledEnemyStats(baseStats, level, maxWaves = MAX_WAVES) {
    const L = Math.max(1, level | 0);
    // 5.101.0 — denominator widened from 19 → MAX_WAVES-1 so the stat
    // curve stretches over the 30-wave campaign. End-points unchanged
    // (final-wave multipliers match the old wave-20 values).
    // RUN-01a — `maxWaves` threads the real run length through the
    // denominator; default MAX_WAVES preserves today's curve exactly.
    const mw = Math.max(1, maxWaves | 0);
    const t = (L - 1) / Math.max(1, mw - 1);
    // 5.76.0 — HP curve scaled up to match the post-5.75 player power
    // budget (Twin Cannon / Hailstorm / +120% Lance + crit-rush + Gold
    // Find compounding all stack DPS faster than the old curve handled).
    // Linear coefficient 6.5 → 8.0 and tail 4 → 6.5: wave 5 ~3.0×,
    // wave 10 ~5.5×, wave 15 ~8.5×, wave 20 ~15.5× (was 11.5×). Early
    // waves stay tractable; late waves now require the build to land.
    const hpMul = 1 + t * 8.0 + Math.pow(t, 2.5) * 6.5;
    const ptsMul = 1 + Math.pow(t, 1.4) * 5.5;
    const spdMul = 1 + Math.pow(t, 1.4) * 0.4;
    return {
        health: Math.floor(baseStats.health * hpMul),
        speed: baseStats.speed * spdMul,
        size: baseStats.size,
        shootRate: baseStats.shootRate,
        points: Math.floor(baseStats.points * ptsMul),
    };
}

// Asteroid HP — gentle linear ramp against asteroid level, kept in sync with
// Asteroid.initializeAsteroid (ASTEROID_HP_PER_LEVEL = +25%/level). The base
// HP is ROLLED by size tier in Asteroid.initializeAsteroid (small = 1,
// medium = 1-2, large = 2-3), so a level-1 rock pops in 1-3 hits and late-game
// rocks are tougher but never bullet sponges. This pure helper applies only
// the level multiplier; it is the single source of truth for that ramp and is
// exercised by the unit tests. Tune the per-level rate to taste.
//   1 + (L-1) · 0.25   →   L1: 1.0  L5: 2.0  L10: 3.25  L15: 4.5
export const ASTEROID_HP_PER_LEVEL = 0.25;
export function getLevelScaledAsteroidStats(baseHealth, level) {
    const L = Math.max(1, level | 0);
    const hpMul = 1 + (L - 1) * ASTEROID_HP_PER_LEVEL;
    return Math.max(1, Math.round(baseHealth * hpMul));
}

// Boss HP / size multipliers per boss tier (1 → 4). Boss enemies are TITAN
// at the boss waves (5/10/15/20) and get these multipliers stacked on top
// of normal level scaling. Tier 4 is the final boss.
export const BOSS_TIER_STATS = {
    1: { hpMul: 4.0, sizeMul: 1.35, speedMul: 1.0,  points: 500 },
    2: { hpMul: 5.0, sizeMul: 1.45, speedMul: 1.05, points: 1000 },
    3: { hpMul: 6.0, sizeMul: 1.55, speedMul: 1.10, points: 1750 },
    4: { hpMul: 8.0, sizeMul: 1.75, speedMul: 1.15, points: 3000 },
};
