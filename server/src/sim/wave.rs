//! Pure wave-spawn step — authoritative, mirroring `js/sim/wave.js::updateWave()`.
//!
//! Tick model: `update_wave` advances one wave's phase machine by exactly
//! one logic tick. Decides "spawn next sub-wave now?" and emits
//! `WaveEvent::EnemySpawn` events; the wrapper drains those events and
//! constructs the actual Enemy instances via the existing
//! `spawnLeveledEnemies` helpers (which know about pools, warp-in, level
//! scaling, mini-boss promotion, boss linking).
//!
//! Phase machine: `Intro` → `Spawning` → `Clearing` → `Complete`.
//!   - `Intro`    : the wave just started; sub-wave 0 has not spawned
//!                  yet. The wrapper transitions intro → spawning when
//!                  the intro overlay lifts (legacy timing: ~700 ms).
//!                  This pure step treats `Intro` as a no-op.
//!   - `Spawning` : at least one sub-wave has spawned, more may follow.
//!                  Steady state during gameplay; runs the sub-wave
//!                  advance logic.
//!   - `Clearing` : all sub-waves spawned but enemies remain. Watches
//!                  for `enemy_count == 0` to flip to `Complete`.
//!   - `Complete` : terminal. Emits `WaveEvent::WaveClear` once on
//!                  entry; the wrapper observes this and triggers the
//!                  wave-clear flow.
//!
//! What lives here:
//!   - Sub-wave advance decision (≤2 enemies OR 12 s elapsed)
//!   - End-of-wave detection (zero enemies + all sub-waves spawned)
//!   - `EnemySpawn` event emission (one per group in the spawning
//!     sub-wave)
//!   - `WaveClear` event emission (when the wave transitions to
//!     `Complete`)
//!
//! What does NOT live here (deferred to the wrapper, mirroring JS):
//!   - Pool cleanup, audio cues, UI overlays, wave-clear bonuses,
//!     mission resolution, persistent save, powerups menu trigger,
//!     player invincibility grace, Enemy / Asteroid construction.
//!   - Intro phase transition: the wrapper flips `Intro` → `Spawning`
//!     when the overlay lifts; this pure step does not own that timer.
//!
//! Parity fixture: `server/tests/parity_wave.rs::wave1_advance_at_two_enemies`
//! drives 4 ticks of wave 1 with `enemy_count` vector `[0, 5, 2, 0]` and
//! asserts agreement with JS on the 3 emitted `EnemySpawn` events.
//!
//! The existing `tick` stub at the bottom of this file is the
//! placeholder called from `simulate_tick` in `mod.rs`. It is left
//! untouched here; the new `update_wave` is the parity-tested function.

use rand_pcg::Pcg64;

use crate::protocol::{EnemyState, GameEvent};

use super::state::WaveState;

// ── Constants copied verbatim from js/sim/wave.js ───────────────────────
//
// JS: `export const SUB_WAVE_ADVANCE_ENEMY_THRESHOLD = 2;` (wave.js:57)
// JS: `export const SUB_WAVE_ADVANCE_STALE_MS = 12000;`    (wave.js:58)
//
// Sub-wave advance trigger: ≤2 enemies left (player has the field
// mostly cleared) OR 12 s since last sub-wave spawn (defensive build is
// stalling the wave). Mirrors `tryAdvanceSubWave` in `wave-manager.js`.
pub const SUB_WAVE_ADVANCE_ENEMY_THRESHOLD: u32 = 2;
pub const SUB_WAVE_ADVANCE_STALE_MS: u32 = 12_000;

// MAX_WAVES — campaign length. Matches `js/modules/core/constants.js`'s
// `MAX_WAVES = 20`. Used for clamping in `get_enemy_level`,
// `get_asteroid_level`, and `get_wave_config`.
pub const MAX_WAVES: u32 = 20;

/// Wave phase machine. Mirrors the JS string discriminator
/// (`'intro' | 'spawning' | 'clearing' | 'complete'`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WavePhase {
    Intro,
    Spawning,
    Clearing,
    Complete,
}

/// Enemy type discriminator. Mirrors the JS string keys used in
/// `WAVE_DATA` (HUNTER, GUARDIAN, WASP, STALKER, DRIFTER, PROWLER,
/// WEAVER, SENTINEL, TANGERINE, TITAN — see
/// `js/modules/wave/wave-data.js`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnemyType {
    Hunter,
    Guardian,
    Wasp,
    Stalker,
    Drifter,
    Prowler,
    Weaver,
    Sentinel,
    Tangerine,
    Titan,
}

impl EnemyType {
    /// Mirror of the JS `enemyType` string the wrapper consumes.
    /// Useful for cross-language event diffing.
    pub fn as_str(self) -> &'static str {
        match self {
            EnemyType::Hunter => "HUNTER",
            EnemyType::Guardian => "GUARDIAN",
            EnemyType::Wasp => "WASP",
            EnemyType::Stalker => "STALKER",
            EnemyType::Drifter => "DRIFTER",
            EnemyType::Prowler => "PROWLER",
            EnemyType::Weaver => "WEAVER",
            EnemyType::Sentinel => "SENTINEL",
            EnemyType::Tangerine => "TANGERINE",
            EnemyType::Titan => "TITAN",
        }
    }
}

/// Sim-level wave state. Mirrors the JS `WaveState` typedef in
/// `js/sim/state.js` (lines 232–273, agent F's round-2 addition).
///
/// `u32` for the wave number / sub-wave index / spawn timer (ms);
/// `i32` for `remaining_to_spawn` (informational, can go negative if
/// callers supply weird overrides — JS coerces to a number, we mirror).
#[derive(Debug, Clone, Copy)]
pub struct Wave {
    pub number: u32,
    pub started_at_tick: u32,
    pub remaining_to_spawn: i32,
    pub sub_wave_index: u32,
    pub spawn_timer: u32,
    pub phase: WavePhase,
}

impl Wave {
    /// Construct a fresh wave anchored at the start of the given wave
    /// number. Mirrors the JS `freshWaveState` defaults
    /// (state.js:362–373): `sub_wave_index=0`, `phase=Intro`,
    /// `spawn_timer=0`, `started_at_tick=0`, `remaining_to_spawn=0`.
    pub fn fresh(wave_number: u32) -> Self {
        let n = wave_number.max(1);
        Self {
            number: n,
            started_at_tick: 0,
            remaining_to_spawn: 0,
            sub_wave_index: 0,
            spawn_timer: 0,
            phase: WavePhase::Intro,
        }
    }
}

/// Per-tick context for `update_wave`. Mirrors the JS
/// `WaveUpdateContext` typedef (state.js:316–327).
///
/// Fields on the JS side that are not yet consumed by `updateWave`
/// (`ships`, `rng`) are intentionally omitted here — they will be
/// added when randomized scheduling lands. Adding them now would be
/// dead weight on every call site.
#[derive(Debug, Clone, Copy)]
pub struct WaveContext {
    pub enemy_count: u32,
    pub dt: f32,
}

/// Side-effect events emitted by `update_wave`. Mirrors the JS event
/// shape exactly so the wrapper can drain a homogeneous queue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WaveEvent {
    /// One per group in the spawning sub-wave. The wrapper drains
    /// these and calls `spawnLeveledEnemies(type, count, opts)` (or
    /// the Rust equivalent) to instantiate the Enemy objects.
    EnemySpawn {
        enemy_type: EnemyType,
        count: u32,
        level: u32,
        wave: u32,
        sub_wave_index: u32,
        is_boss: bool,
        boss_tier: u8,
    },
    /// Emitted once when the wave transitions to `Complete`. The
    /// wrapper observes this and triggers wave-clear flow.
    WaveClear { wave: u32 },
}

// ── WAVE_DATA — the 20-wave campaign schedule ───────────────────────────
//
// Mirrors `js/modules/wave/wave-data.js::WAVE_DATA` byte-for-byte.
// Tuple layout: `(enemy_type, count, is_boss, boss_tier)`. Use
// `(.., 0, false, 0)` for non-boss groups; the wrapper applies
// `BOSS_TIER_STATS` lookups when `is_boss == true`.
//
// Outer-array index = `wave_number - 1`. Inside a wave we have a slice
// of sub-waves; each sub-wave is a slice of groups. The pure step
// emits one `EnemySpawn` per group on the trigger tick.
//
// 5.79.16 — Enemy counts scaled up across the campaign (~+60% enemies,
// ~+33% asteroids) so per-wave XP yields keep pace with the new linear
// XP curve targeting ~1.5 levels per wave. See
// `docs/XP_BALANCE_REWORK_5.79.md` for the analysis.

// Wave 1 — First Contact #1 (wave-data.js:33-36)
const W1_S0: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Hunter, 3, false, 0)];
const W1_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 2, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W1: &[&[(EnemyType, u32, bool, u8)]] = &[W1_S0, W1_S1];

// Wave 2 — First Contact #2 (wave-data.js:37-40)
const W2_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W2_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W2: &[&[(EnemyType, u32, bool, u8)]] = &[W2_S0, W2_S1];

// Wave 3 — First Contact #3 (wave-data.js:41-45)
const W3_S0: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Hunter, 4, false, 0)];
const W3_S1: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Wasp, 4, false, 0)];
const W3_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W3: &[&[(EnemyType, u32, bool, u8)]] = &[W3_S0, W3_S1, W3_S2];

// Wave 4 — First Contact #4, GUARDIAN intro (wave-data.js:46-50)
const W4_S0: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Guardian, 3, false, 0)];
const W4_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Wasp, 4, false, 0),
    (EnemyType::Hunter, 1, false, 0),
];
const W4_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Hunter, 4, false, 0),
];
const W4: &[&[(EnemyType, u32, bool, u8)]] = &[W4_S0, W4_S1, W4_S2];

// Wave 5 — BOSS: Iron Giant — TITAN bossTier 1 + escort (wave-data.js:53-60)
const W5_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 4, false, 0),
    (EnemyType::Hunter, 3, false, 0),
];
const W5_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Wasp, 3, false, 0),
    (EnemyType::Stalker, 1, false, 0),
];
const W5_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Titan, 1, true, 1),
    (EnemyType::Guardian, 3, false, 0),
    (EnemyType::Hunter, 2, false, 0),
];
const W5: &[&[(EnemyType, u32, bool, u8)]] = &[W5_S0, W5_S1, W5_S2];

// Wave 6 — Escalation, STALKER intro (wave-data.js:63-67)
const W6_S0: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Stalker, 3, false, 0)];
const W6_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 4, false, 0),
    (EnemyType::Wasp, 1, false, 0),
];
const W6_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Stalker, 2, false, 0),
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W6: &[&[(EnemyType, u32, bool, u8)]] = &[W6_S0, W6_S1, W6_S2];

// Wave 7 — Escalation, DRIFTER + TANGERINE intro (wave-data.js:68-72)
const W7_S0: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Drifter, 3, false, 0)];
const W7_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Tangerine, 3, false, 0),
    (EnemyType::Hunter, 3, false, 0),
];
const W7_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Drifter, 2, false, 0),
    (EnemyType::Hunter, 4, false, 0),
    (EnemyType::Wasp, 1, false, 0),
];
const W7: &[&[(EnemyType, u32, bool, u8)]] = &[W7_S0, W7_S1, W7_S2];

// Wave 8 — Escalation, SENTINEL intro (wave-data.js:73-77)
const W8_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Stalker, 2, false, 0),
];
const W8_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Stalker, 3, false, 0),
    (EnemyType::Sentinel, 1, false, 0),
];
const W8_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Sentinel, 2, false, 0),
    (EnemyType::Hunter, 4, false, 0),
    (EnemyType::Stalker, 1, false, 0),
];
const W8: &[&[(EnemyType, u32, bool, u8)]] = &[W8_S0, W8_S1, W8_S2];

// Wave 9 — Escalation, WEAVER + PROWLER intro (wave-data.js:78-82)
const W9_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Weaver, 2, false, 0),
    (EnemyType::Wasp, 3, false, 0),
];
const W9_S1: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Prowler, 3, false, 0)];
const W9_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Weaver, 2, false, 0),
    (EnemyType::Prowler, 1, false, 0),
    (EnemyType::Wasp, 2, false, 0),
    (EnemyType::Hunter, 1, false, 0),
];
const W9: &[&[(EnemyType, u32, bool, u8)]] = &[W9_S0, W9_S1, W9_S2];

// Wave 10 — BOSS: Twin Iron — 2× TITAN bossTier 2 (wave-data.js:85-92)
const W10_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 3, false, 0),
    (EnemyType::Hunter, 3, false, 0),
];
const W10_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Stalker, 2, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W10_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Titan, 2, true, 2),
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Stalker, 1, false, 0),
];
const W10: &[&[(EnemyType, u32, bool, u8)]] = &[W10_S0, W10_S1, W10_S2];

// Wave 11 — Gauntlet (wave-data.js:95-99)
const W11_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 5, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W11_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 3, false, 0),
    (EnemyType::Hunter, 3, false, 0),
];
const W11_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Stalker, 2, false, 0),
    (EnemyType::Wasp, 3, false, 0),
];
const W11: &[&[(EnemyType, u32, bool, u8)]] = &[W11_S0, W11_S1, W11_S2];

// Wave 12 — Gauntlet, sniper alley (wave-data.js:100-104)
const W12_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Stalker, 3, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W12_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Prowler, 3, false, 0),
    (EnemyType::Drifter, 2, false, 0),
];
const W12_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Stalker, 2, false, 0),
    (EnemyType::Prowler, 2, false, 0),
    (EnemyType::Hunter, 3, false, 0),
];
const W12: &[&[(EnemyType, u32, bool, u8)]] = &[W12_S0, W12_S1, W12_S2];

// Wave 13 — Gauntlet, speed demons (wave-data.js:105-109)
const W13_S0: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Wasp, 6, false, 0)];
const W13_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Weaver, 2, false, 0),
    (EnemyType::Hunter, 3, false, 0),
];
const W13_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Wasp, 3, false, 0),
    (EnemyType::Weaver, 2, false, 0),
    (EnemyType::Hunter, 3, false, 0),
];
const W13: &[&[(EnemyType, u32, bool, u8)]] = &[W13_S0, W13_S1, W13_S2];

// Wave 14 — Gauntlet, defense wall (wave-data.js:110-114)
const W14_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 3, false, 0),
    (EnemyType::Sentinel, 2, false, 0),
];
const W14_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Sentinel, 3, false, 0),
    (EnemyType::Prowler, 2, false, 0),
];
const W14_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Prowler, 2, false, 0),
    (EnemyType::Stalker, 3, false, 0),
];
const W14: &[&[(EnemyType, u32, bool, u8)]] = &[W14_S0, W14_S1, W14_S2];

// Wave 15 — BOSS: Triple Threat — 3× TITAN bossTier 3 (wave-data.js:117-124)
const W15_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 3, false, 0),
    (EnemyType::Stalker, 2, false, 0),
];
const W15_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Sentinel, 3, false, 0),
    (EnemyType::Wasp, 3, false, 0),
];
const W15_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Titan, 3, true, 3),
    (EnemyType::Sentinel, 2, false, 0),
    (EnemyType::Guardian, 1, false, 0),
];
const W15: &[&[(EnemyType, u32, bool, u8)]] = &[W15_S0, W15_S1, W15_S2];

// Wave 16 — Endgame Approach #1 (wave-data.js:127-131)
const W16_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Wasp, 3, false, 0),
];
const W16_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 3, false, 0),
    (EnemyType::Stalker, 2, false, 0),
];
const W16_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Stalker, 2, false, 0),
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W16: &[&[(EnemyType, u32, bool, u8)]] = &[W16_S0, W16_S1, W16_S2];

// Wave 17 — Endgame Approach #2, bullet hell sample (wave-data.js:132-136)
const W17_S0: &[(EnemyType, u32, bool, u8)] = &[(EnemyType::Weaver, 3, false, 0)];
const W17_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Wasp, 5, false, 0),
    (EnemyType::Drifter, 2, false, 0),
];
const W17_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Weaver, 2, false, 0),
    (EnemyType::Wasp, 3, false, 0),
    (EnemyType::Drifter, 2, false, 0),
    (EnemyType::Hunter, 1, false, 0),
];
const W17: &[&[(EnemyType, u32, bool, u8)]] = &[W17_S0, W17_S1, W17_S2];

// Wave 18 — Endgame Approach #3 — non-boss TITAN appearance (wave-data.js:137-141)
const W18_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Tangerine, 2, false, 0),
    (EnemyType::Hunter, 3, false, 0),
];
const W18_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Sentinel, 3, false, 0),
    (EnemyType::Stalker, 2, false, 0),
];
// NB: js/modules/wave/wave-data.js:140 lists `{ type: 'TITAN', count: 1 }`
// without `isBoss` — this is a non-boss TITAN miniboss, so we set
// `is_boss=false, boss_tier=0` to mirror the JS shape exactly.
const W18_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Titan, 1, false, 0),
    (EnemyType::Tangerine, 2, false, 0),
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Sentinel, 1, false, 0),
];
const W18: &[&[(EnemyType, u32, bool, u8)]] = &[W18_S0, W18_S1, W18_S2];

// Wave 19 — Endgame Approach #4 (wave-data.js:142-146)
const W19_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Wasp, 2, false, 0),
];
const W19_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Stalker, 2, false, 0),
    (EnemyType::Drifter, 2, false, 0),
    (EnemyType::Weaver, 2, false, 0),
];
const W19_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Tangerine, 2, false, 0),
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Hunter, 3, false, 0),
    (EnemyType::Wasp, 3, false, 0),
];
const W19: &[&[(EnemyType, u32, bool, u8)]] = &[W19_S0, W19_S1, W19_S2];

// Wave 20 — FINAL BOSS: The Last Stand — 3× TITAN bossTier 4 (wave-data.js:149-156)
const W20_S0: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Guardian, 3, false, 0),
    (EnemyType::Sentinel, 2, false, 0),
    (EnemyType::Stalker, 2, false, 0),
];
const W20_S1: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Prowler, 2, false, 0),
    (EnemyType::Weaver, 2, false, 0),
    (EnemyType::Tangerine, 2, false, 0),
];
const W20_S2: &[(EnemyType, u32, bool, u8)] = &[
    (EnemyType::Titan, 3, true, 4),
    (EnemyType::Guardian, 2, false, 0),
    (EnemyType::Sentinel, 2, false, 0),
    (EnemyType::Stalker, 1, false, 0),
];
const W20: &[&[(EnemyType, u32, bool, u8)]] = &[W20_S0, W20_S1, W20_S2];

/// The 20-wave campaign schedule. Index `i` holds wave number `i + 1`.
/// Mirrors `js/modules/wave/wave-data.js::WAVE_DATA` (waves 1..20).
pub const WAVE_DATA: [&[&[(EnemyType, u32, bool, u8)]]; 20] = [
    W1, W2, W3, W4, W5, W6, W7, W8, W9, W10, W11, W12, W13, W14, W15, W16, W17, W18, W19, W20,
];

/// Read the static wave config for a given wave number. Pure lookup,
/// clamped to `1..=MAX_WAVES`. Mirrors
/// `js/modules/wave/wave-data.js::getWaveConfig` (line 162).
pub fn get_wave_config(wave: u32) -> &'static [&'static [(EnemyType, u32, bool, u8)]] {
    let w = wave.max(1).min(MAX_WAVES);
    WAVE_DATA[(w - 1) as usize]
}

/// Enemy level for the wave — 1..20 across the campaign. Mirrors
/// `js/modules/wave/wave-data.js::getEnemyLevel` (lines 174–176).
pub fn get_enemy_level(wave: u32) -> u32 {
    wave.max(1).min(MAX_WAVES)
}

/// Asteroid level lifts every other wave (1,1,2,2,…,10,10). Mirrors
/// `js/modules/wave/wave-data.js::getAsteroidLevel` (lines 180–183).
pub fn get_asteroid_level(wave: u32) -> u32 {
    let w = wave.max(1).min(MAX_WAVES);
    // ceil(w/2) for u32: (w + 1) / 2
    ((w + 1) / 2).max(1)
}

/// Boss waves are the exact set [5, 10, 15, 20]. Mirrors
/// `js/modules/wave/wave-data.js::isBossWave` (lines 168–170).
pub fn is_boss_wave(wave: u32) -> bool {
    matches!(wave, 5 | 10 | 15 | 20)
}

/// Pure wave-update step. Mirrors `js/sim/wave.js::updateWave`.
///
/// One tick of the phase machine. The wrapper drains `events` and
/// constructs the actual Enemy instances for `EnemySpawn`, and runs
/// the wave-clear flow for `WaveClear`.
///
/// Order of operations is **load-bearing for parity** — see the
/// matching block comments in `js/sim/wave.js::updateWave()`. Do not
/// reorder without a matching change on the JS side.
pub fn update_wave(wave: &mut Wave, ctx: &WaveContext, events: &mut Vec<WaveEvent>) {
    // ── 'intro' or 'complete' phases: nothing to do ──
    // 'intro' is a brief overlay phase; the wrapper transitions to
    // 'spawning' once it spawns sub-wave 0. 'complete' is terminal.
    if matches!(wave.phase, WavePhase::Intro | WavePhase::Complete) {
        return;
    }

    let sub_waves = get_wave_config(wave.number);
    let total_sub_waves = sub_waves.len() as u32;

    // ── 'clearing' phase: all sub-waves out, watch for last enemy ──
    if matches!(wave.phase, WavePhase::Clearing) {
        if ctx.enemy_count == 0 {
            wave.phase = WavePhase::Complete;
            events.push(WaveEvent::WaveClear { wave: wave.number });
        }
        return;
    }

    // ── 'spawning' phase: try to advance to the next sub-wave ──
    // Exit condition: every sub-wave has been emitted. Move to
    // 'clearing' so the next tick watches for `enemy_count == 0`.
    let idx = wave.sub_wave_index;
    if idx >= total_sub_waves {
        // All sub-waves out. If the field is already empty, jump
        // straight to 'complete' (mirrors the same fast-path in JS).
        wave.phase = WavePhase::Clearing;
        if ctx.enemy_count == 0 {
            wave.phase = WavePhase::Complete;
            events.push(WaveEvent::WaveClear { wave: wave.number });
        }
        return;
    }

    // Advance trigger: ≤2 enemies left OR 12 s since last sub-wave
    // spawn. Mirrors `tryAdvanceSubWave` in `wave-manager.js`.
    let elapsed = wave.spawn_timer;
    let ready = ctx.enemy_count <= SUB_WAVE_ADVANCE_ENEMY_THRESHOLD
        || elapsed >= SUB_WAVE_ADVANCE_STALE_MS;
    if !ready {
        // Not yet — accumulate elapsed time. dt is in seconds; the
        // legacy code uses Date.now() deltas in ms so we convert.
        // `(dt * 1000).floor()` matches JS's `Math.floor`.
        let add_ms = (ctx.dt * 1000.0).floor().max(0.0) as u32;
        wave.spawn_timer = elapsed.saturating_add(add_ms);
        return;
    }

    // Emit one `EnemySpawn` event per group in this sub-wave. The
    // wrapper drains these and instantiates Enemy objects. Bosses
    // carry their `boss_tier` through so the wrapper applies
    // `BOSS_TIER_STATS`.
    let groups = sub_waves[idx as usize];
    let enemy_level = get_enemy_level(wave.number);
    for &(enemy_type, count, is_boss, boss_tier) in groups {
        events.push(WaveEvent::EnemySpawn {
            enemy_type,
            count,
            level: enemy_level,
            wave: wave.number,
            sub_wave_index: idx,
            is_boss,
            boss_tier,
        });
    }

    // Bookkeeping: bump the index, reset the per-sub-wave spawn
    // timer, and decrement `remaining_to_spawn` (informational).
    wave.sub_wave_index = idx + 1;
    wave.spawn_timer = 0;
    let remaining = total_sub_waves.saturating_sub(wave.sub_wave_index) as i32;
    wave.remaining_to_spawn = remaining;
}

// ── Wire-state integration stub ─────────────────────────────────────────
//
// Existing entry point called from `simulate_tick` in `mod.rs`. The
// real wire ↔ sim bridging will land when the wave wrapper wires up;
// for now this is a no-op that satisfies the existing call site.
pub fn tick(
    _wave: &mut WaveState,
    _enemies: &mut Vec<EnemyState>,
    _dt: f32,
    _rng: &mut Pcg64,
    _events: &mut Vec<GameEvent>,
) {
}
