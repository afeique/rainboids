// Wave configuration data for enemy and asteroid spawning.
//
// 9.11.0 — FIXED 50-wave campaign: 10 BLOCKS × 5 waves (a "stage" = a block).
// Replaces the old user-configurable endless run with a single authored
// campaign that marches through all 10 bosses, once each, in stage order.
//
// Each block b (waves 5b+1 … 5b+5):
//   wave 1 : normal enemy wave (gentle)
//   wave 2 : normal enemy wave (a bit bigger)
//   wave 3 : ELITE / miniboss wave (isElite) — few but MUCH tougher enemies;
//            `elite: true` specs spawn at +6 level, ~1.8× HP, ~1.4× size,
//            isMiniBoss + 3× points (see spawnLeveledEnemies).
//   wave 4 : COOLDOWN wave (isCooldown) — few weak adds + more asteroids; a breather.
//   wave 5 : BOSS wave (isBossWave) — the block's boss (spawned by the manager
//            via getStage(wave,5) → getBossForStage) + a couple of light escorts.
//
// Boss per block (stage order, from js/modules/enemy/bosses/index.js):
//    5 → Harbinger    10 → Aegis        15 → Lumen        20 → Gemini
//   25 → Maelstrom    30 → Hivemother   35 → Iron Throne  40 → Warden Prime
//   45 → Nullmaw      50 → Prismarch (isFinalBoss — ends the run)
//
// bossTier escalates: blocks 1-2 → T1, blocks 3-5 → T2, blocks 6-8 → T3,
// blocks 9-10 → T4. Enemy roster escalates with depth using only the TEN
// fully-defined enemy types (see the NOTE inside WAVE_DATA): early blocks lean
// on the gentle/fair types (HUNTER, WASP, DRIFTER, then GUARDIAN, TANGERINE,
// WEAVER, STALKER); mid blocks introduce the tougher SENTINEL + PROWLER and
// the first TITAN-chassis elites; late blocks pile on dense GUARDIAN/SENTINEL/
// PROWLER mixes with multi-TITAN elite gauntlets. Per-wave difficulty is
// further carried by the enemy-level / HP / speed curves (getEnemyLevel etc.),
// which now stretch across the full 50-wave campaign via MAX_WAVES.

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

    // ══════════════════════════════════════════════════════════════════════
    // 9.11.0 — FIXED 50-wave campaign: 10 BLOCKS × 5 waves. Each block b
    // (waves 5b+1 … 5b+5) runs: 1/2 normal · 3 ELITE (isElite — few but tough,
    // elite:true specs spawn as beefy minibosses) · 4 COOLDOWN (isCooldown —
    // weak adds + extra asteroids, a breather) · 5 BOSS (isBossWave — the
    // block's boss via getStage(wave,5)→getBossForStage + light escorts).
    // Bosses by block (stage order): 5 Harbinger · 10 Aegis · 15 Lumen ·
    // 20 Gemini · 25 Maelstrom · 30 Hivemother · 35 Iron Throne ·
    // 40 Warden Prime · 45 Nullmaw · 50 Prismarch (FINAL). The boss itself is
    // spawned by the manager; the boss-wave subWaves below are the light adds.
    // bossTier escalates: blocks 1-2 → T1, 3-5 → T2, 6-8 → T3, 9-10 → T4.
    // ══════════════════════════════════════════════════════════════════════

    // NOTE: only the 10 fully-defined enemy types (those with real entries in
    // ENEMY_DATA) are used here — HUNTER, WASP, DRIFTER, GUARDIAN, TANGERINE,
    // STALKER, WEAVER, SENTINEL, PROWLER, TITAN. The ~19 other names in
    // ENEMY_TYPES have NO config and getEnemyConfig() silently falls back to
    // HUNTER, so spawning them would just be disguised HUNTERs. Escalation is
    // carried by COUNTS + which of the real tougher types (GUARDIAN/SENTINEL/
    // PROWLER/TITAN) appear, plus the per-wave enemy-level / HP / speed curve.

    // ── BLOCK 1 (waves 1-5) — boss: Harbinger (T1) ──
    1: { asteroids: 5, subWaves: [
        [{ type: 'HUNTER', count: 3 }],
        [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 2 }],
    ] },
    2: { asteroids: 5, subWaves: [
        [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 2 }],
        [{ type: 'WASP', count: 3 }, { type: 'DRIFTER', count: 1 }],
    ] },
    // 1-3 ELITE — a lone armored GUARDIAN miniboss + a couple of HUNTER adds.
    3: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'GUARDIAN', count: 1, elite: true }, { type: 'HUNTER', count: 2 }],
    ] },
    // 1-4 COOLDOWN — a breather.
    4: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'HUNTER', count: 2 }],
    ] },
    // 1-5 BOSS — Harbinger + WASP/DRIFTER escort.
    5: { asteroids: 2, isBossWave: true, bossTier: 1, subWaves: [
        [{ type: 'WASP', count: 2 }, { type: 'DRIFTER', count: 1 }],
    ] },

    // ── BLOCK 2 (waves 6-10) — boss: Aegis (T1) ──
    6: { asteroids: 5, subWaves: [
        [{ type: 'WASP', count: 2 }, { type: 'DRIFTER', count: 1 }],
        [{ type: 'TANGERINE', count: 1 }, { type: 'HUNTER', count: 2 }],
    ] },
    7: { asteroids: 5, subWaves: [
        [{ type: 'WEAVER', count: 2 }, { type: 'DRIFTER', count: 1 }],
        [{ type: 'TANGERINE', count: 2 }, { type: 'WASP', count: 2 }],
    ] },
    // 2-3 ELITE — a fast PROWLER miniboss harasses behind a WASP screen.
    8: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'PROWLER', count: 1, elite: true }, { type: 'WASP', count: 3 }],
    ] },
    9: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'WASP', count: 3 }],
    ] },
    // 2-5 BOSS — Aegis + GUARDIAN/TANGERINE escort.
    10: { asteroids: 2, isBossWave: true, bossTier: 1, subWaves: [
        [{ type: 'GUARDIAN', count: 2 }, { type: 'TANGERINE', count: 1 }],
    ] },

    // ── BLOCK 3 (waves 11-15) — boss: Lumen (T2). Snipers + spinners. ──
    11: { asteroids: 4, subWaves: [
        [{ type: 'WEAVER', count: 2 }, { type: 'STALKER', count: 1 }],
        [{ type: 'TANGERINE', count: 2 }, { type: 'HUNTER', count: 2 }],
    ] },
    12: { asteroids: 4, subWaves: [
        [{ type: 'STALKER', count: 2 }, { type: 'SENTINEL', count: 1 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'GUARDIAN', count: 1 }],
    ] },
    // 3-3 ELITE — a SENTINEL miniboss anchors a STALKER firing line.
    13: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'SENTINEL', count: 1, elite: true }, { type: 'STALKER', count: 2 }],
    ] },
    14: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'DRIFTER', count: 2 }, { type: 'WASP', count: 1 }],
    ] },
    // 3-5 BOSS — Lumen + STALKER/WEAVER escort.
    15: { asteroids: 2, isBossWave: true, bossTier: 2, subWaves: [
        [{ type: 'STALKER', count: 2 }, { type: 'WEAVER', count: 1 }],
    ] },

    // ── BLOCK 4 (waves 16-20) — boss: Gemini (T2). Heavier mixes. ──
    16: { asteroids: 4, subWaves: [
        [{ type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 1 }],
        [{ type: 'WEAVER', count: 2 }, { type: 'WASP', count: 2 }],
    ] },
    17: { asteroids: 4, subWaves: [
        [{ type: 'SENTINEL', count: 2 }, { type: 'WEAVER', count: 2 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'TANGERINE', count: 2 }],
    ] },
    // 4-3 ELITE — twin GUARDIAN minibosses behind a STALKER line.
    18: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'GUARDIAN', count: 2, elite: true }, { type: 'STALKER', count: 2 }],
    ] },
    19: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'WASP', count: 2 }, { type: 'HUNTER', count: 2 }],
    ] },
    // 4-5 BOSS — Gemini + GUARDIAN/SENTINEL escort.
    20: { asteroids: 2, isBossWave: true, bossTier: 2, subWaves: [
        [{ type: 'GUARDIAN', count: 1 }, { type: 'SENTINEL', count: 1 }],
    ] },

    // ── BLOCK 5 (waves 21-25) — boss: Maelstrom (T2). Predators + snipers. ──
    21: { asteroids: 4, subWaves: [
        [{ type: 'PROWLER', count: 2 }, { type: 'STALKER', count: 1 }],
        [{ type: 'TANGERINE', count: 2 }, { type: 'WEAVER', count: 1 }],
    ] },
    22: { asteroids: 4, subWaves: [
        [{ type: 'PROWLER', count: 2 }, { type: 'SENTINEL', count: 2 }],
        [{ type: 'STALKER', count: 3 }, { type: 'GUARDIAN', count: 1 }],
    ] },
    // 5-3 ELITE — a TITAN-chassis miniboss flanked by PROWLER escorts.
    23: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'TITAN', count: 1, elite: true }, { type: 'PROWLER', count: 2 }],
    ] },
    24: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'HUNTER', count: 2 }, { type: 'DRIFTER', count: 1 }],
    ] },
    // 5-5 BOSS — Maelstrom + PROWLER/SENTINEL escort.
    25: { asteroids: 2, isBossWave: true, bossTier: 2, subWaves: [
        [{ type: 'PROWLER', count: 2 }, { type: 'SENTINEL', count: 1 }],
    ] },

    // ── BLOCK 6 (waves 26-30) — boss: Hivemother (T3). Dense combined arms. ──
    26: { asteroids: 4, subWaves: [
        [{ type: 'SENTINEL', count: 2 }, { type: 'WEAVER', count: 2 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'STALKER', count: 2 }],
    ] },
    27: { asteroids: 4, subWaves: [
        [{ type: 'PROWLER', count: 2 }, { type: 'GUARDIAN', count: 2 }],
        [{ type: 'WEAVER', count: 3 }, { type: 'TANGERINE', count: 2 }],
    ] },
    // 6-3 ELITE — a SENTINEL+GUARDIAN miniboss pair shielded by a WASP swarm.
    28: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'SENTINEL', count: 1, elite: true }, { type: 'GUARDIAN', count: 1, elite: true }, { type: 'WASP', count: 3 }],
    ] },
    29: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'WASP', count: 3 }],
    ] },
    // 6-5 BOSS — Hivemother + SENTINEL/WEAVER escort.
    30: { asteroids: 2, isBossWave: true, bossTier: 3, subWaves: [
        [{ type: 'SENTINEL', count: 2 }, { type: 'WEAVER', count: 1 }],
    ] },

    // ── BLOCK 7 (waves 31-35) — boss: Iron Throne (T3). Predator packs. ──
    31: { asteroids: 4, subWaves: [
        [{ type: 'PROWLER', count: 3 }, { type: 'STALKER', count: 2 }],
        [{ type: 'GUARDIAN', count: 2 }, { type: 'WEAVER', count: 2 }],
    ] },
    32: { asteroids: 4, subWaves: [
        [{ type: 'PROWLER', count: 3 }, { type: 'SENTINEL', count: 2 }],
        [{ type: 'STALKER', count: 3 }, { type: 'TANGERINE', count: 2 }],
    ] },
    // 7-3 ELITE — a PROWLER+SENTINEL miniboss pair behind a STALKER line.
    33: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'PROWLER', count: 1, elite: true }, { type: 'SENTINEL', count: 1, elite: true }, { type: 'STALKER', count: 2 }],
    ] },
    34: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 2 }],
    ] },
    // 7-5 BOSS — Iron Throne + PROWLER/GUARDIAN escort.
    35: { asteroids: 2, isBossWave: true, bossTier: 3, subWaves: [
        [{ type: 'PROWLER', count: 2 }, { type: 'GUARDIAN', count: 1 }],
    ] },

    // ── BLOCK 8 (waves 36-40) — boss: Warden Prime (T3). Peak density. ──
    36: { asteroids: 4, subWaves: [
        [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 2 }],
        [{ type: 'PROWLER', count: 2 }, { type: 'WEAVER', count: 2 }],
    ] },
    37: { asteroids: 4, subWaves: [
        [{ type: 'SENTINEL', count: 3 }, { type: 'STALKER', count: 2 }],
        [{ type: 'GUARDIAN', count: 3 }, { type: 'TANGERINE', count: 2 }],
    ] },
    // 8-3 ELITE — a lone TITAN miniboss walled by GUARDIANs.
    38: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'TITAN', count: 1, elite: true }, { type: 'GUARDIAN', count: 2 }],
    ] },
    39: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'HUNTER', count: 2 }, { type: 'STALKER', count: 1 }],
    ] },
    // 8-5 BOSS — Warden Prime + SENTINEL/PROWLER escort.
    40: { asteroids: 2, isBossWave: true, bossTier: 3, subWaves: [
        [{ type: 'SENTINEL', count: 2 }, { type: 'PROWLER', count: 1 }],
    ] },

    // ── BLOCK 9 (waves 41-45) — boss: Nullmaw (T4). Heavy gauntlet. ──
    41: { asteroids: 4, subWaves: [
        [{ type: 'GUARDIAN', count: 3 }, { type: 'PROWLER', count: 2 }],
        [{ type: 'SENTINEL', count: 3 }, { type: 'WEAVER', count: 2 }],
    ] },
    42: { asteroids: 4, subWaves: [
        [{ type: 'PROWLER', count: 3 }, { type: 'SENTINEL', count: 2 }],
        [{ type: 'GUARDIAN', count: 3 }, { type: 'STALKER', count: 3 }],
    ] },
    // 9-3 ELITE — twin TITAN minibosses amid a GUARDIAN wall.
    43: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'TITAN', count: 2, elite: true }, { type: 'GUARDIAN', count: 2 }],
    ] },
    44: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'WASP', count: 3 }, { type: 'HUNTER', count: 1 }],
    ] },
    // 9-5 BOSS — Nullmaw + GUARDIAN/SENTINEL escort.
    45: { asteroids: 2, isBossWave: true, bossTier: 4, subWaves: [
        [{ type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }],
    ] },

    // ── BLOCK 10 (waves 46-50) — boss: Prismarch (T4, FINAL). The last stand. ──
    46: { asteroids: 4, subWaves: [
        [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 3 }],
        [{ type: 'PROWLER', count: 3 }, { type: 'STALKER', count: 2 }],
    ] },
    47: { asteroids: 4, subWaves: [
        [{ type: 'SENTINEL', count: 3 }, { type: 'PROWLER', count: 3 }],
        [{ type: 'GUARDIAN', count: 3 }, { type: 'WEAVER', count: 3 }],
    ] },
    // 10-3 ELITE — a double-TITAN gauntlet behind a PROWLER pack.
    48: { asteroids: 3, isElite: true, subWaves: [
        [{ type: 'TITAN', count: 2, elite: true }, { type: 'PROWLER', count: 3 }],
    ] },
    49: { asteroids: 5, isCooldown: true, subWaves: [
        [{ type: 'HUNTER', count: 2 }, { type: 'STALKER', count: 1 }],
    ] },
    // 10-5 FINAL BOSS — Prismarch + GUARDIAN/SENTINEL/PROWLER escort.
    50: { asteroids: 2, isBossWave: true, bossTier: 4, isFinalBoss: true, subWaves: [
        [{ type: 'GUARDIAN', count: 1 }, { type: 'SENTINEL', count: 1 }, { type: 'PROWLER', count: 1 }],
    ] },
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
    // 9.0.0 (endless) — map straight off the ABSOLUTE wave so endless runs keep
    // cycling the authored 1..MAX_WAVES groups (_configKeyForWave cycles past 30).
    // The old `min(maxWaves, wave)` clamp was a no-op for finite runs (the wave
    // never exceeded maxWaves) — dropping it leaves finite runs byte-for-byte
    // unchanged and only affects waves past the cap. `maxWaves` kept for sig compat.
    const clamped = Math.max(1, waveNumber | 0);
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
    // ── BLOCK 1 → Harbinger ──
    1:  "Don't worry, they die easy.",
    2:  "Arc-lightning inbound — meet the Drifter.",
    3:  "ELITE — armored heavy. Crack the shell.",
    4:  "Catch your breath.",
    5:  "BOSS — the Harbinger arrives.",
    // ── BLOCK 2 → Aegis ──
    6:  "Bombs away — mind the Bomber's mines.",
    7:  "Weavers spinning up. Keep moving.",
    8:  "ELITE — a Prowler runs you down.",
    9:  "Easy does it.",
    10: "BOSS — Aegis, the walking wall.",
    // ── BLOCK 3 → Lumen ──
    11: "Sniper line. Don't stand still.",
    12: "Crossfire — every angle covered.",
    13: "ELITE — a Sentinel digs in.",
    14: "A quiet moment.",
    15: "BOSS — Lumen lights you up.",
    // ── BLOCK 4 → Gemini ──
    16: "Heavies and spinners. Keep moving.",
    17: "The wall thickens.",
    18: "ELITE — twin heavies bear down.",
    19: "Breathe.",
    20: "BOSS — Gemini, doubled and redoubled.",
    // ── BLOCK 5 → Maelstrom ──
    21: "Predators on the prowl.",
    22: "Pressure's building.",
    23: "ELITE — a Titan-class brute.",
    24: "Eye of the storm.",
    25: "BOSS — the Maelstrom churns.",
    // ── BLOCK 6 → Hivemother ──
    26: "Combined arms — every angle.",
    27: "It keeps coming.",
    28: "ELITE — a heavy pair anchors the swarm.",
    29: "Clear the lungs.",
    30: "BOSS — the Hivemother broods.",
    // ── BLOCK 7 → Iron Throne ──
    31: "Predator packs. Stay mobile.",
    32: "They're flanking.",
    33: "ELITE — a predator-sentinel duo.",
    34: "Steady hands.",
    35: "BOSS — the Iron Throne holds.",
    // ── BLOCK 8 → Warden Prime ──
    36: "Peak density. Pick your shots.",
    37: "Walls of iron.",
    38: "ELITE — a lone Titan, walled in.",
    39: "Catch a breath.",
    40: "BOSS — Warden Prime stands guard.",
    // ── BLOCK 9 → Nullmaw ──
    41: "The gauntlet begins.",
    42: "No safe lanes.",
    43: "ELITE — twin Titans inbound.",
    44: "Almost there.",
    45: "BOSS — the Nullmaw opens wide.",
    // ── BLOCK 10 → Prismarch (FINAL) ──
    46: "The last stand. No more lessons.",
    47: "Edge of doom. One more push.",
    48: "ELITE — twin Titans block the way.",
    49: "Final approach. Steady hands.",
    50: "FINAL BOSS — the Prismarch awaits.",
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
