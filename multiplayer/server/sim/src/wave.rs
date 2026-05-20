//! Phase 4 wave state machine — deterministic per-room sub-wave cadence.
//!
//! Mirrors solo's `js/sim/wave.js` `updateWave` + `tryAdvanceSubWave`.
//! Pure function: takes the wave config + current state + alive enemy
//! count, returns spawn requests for this tick and mutates state.
//!
//! Tick rate: 60 Hz (matches sim).
//!
//! Out of scope for this module:
//! - The wave config table itself (lives in `wave_table.rs`, owned by Agent C).
//! - Actual enemy entity construction (lives in `room.rs`, which calls
//!   `enemy::spawn_hunter_from_seed` per spawn request).
//! - Wave-clear bonuses, audio, UI (those are JS-side Phase 4 follow-ups).

/// Ticks per second for the sim. Used to convert solo's millisecond
/// constants into tick budgets.
pub const SIM_HZ: u32 = 60;

/// Sub-wave advance threshold (alive enemies). When `alive_enemy_count`
/// drops to this or below, the next sub-wave starts. Mirrors solo's
/// `SUB_WAVE_ADVANCE_ENEMY_THRESHOLD = 2`.
pub const SUB_WAVE_ADVANCE_ENEMY_THRESHOLD: usize = 2;

/// Sub-wave stale-fallback ticks. If the current sub-wave hasn't advanced
/// within this many ticks of starting, force-advance regardless of enemy
/// count. Solo's `12000 ms` × 60 Hz / 1000 = 720 ticks.
pub const SUB_WAVE_ADVANCE_STALE_TICKS: u32 = 720;

/// Intro-phase duration. Solo's wave-manager holds a brief intro splash
/// before spawning starts. Phase 4 MVP keeps it short (1.5 s) so the
/// game flows without forced waiting.
pub const WAVE_INTRO_TICKS: u32 = 90;

/// Wave phase machine. Mirrors solo's `Intro` / `Spawning` / `Clearing`
/// / `Complete` states (see `js/sim/wave.js` lines 11–22 for definitions).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WavePhase {
    Intro,
    Spawning,
    Clearing,
    Complete,
}

impl Default for WavePhase {
    fn default() -> Self {
        Self::Intro
    }
}

/// Per-room wave runtime state. Lives in `RoomState` (Wave 2 adds it).
#[derive(Debug, Clone, Copy)]
pub struct WaveState {
    /// 1-indexed wave number. Starts at 1 (room boot starts wave 1).
    pub current_wave: u16,
    /// 0-indexed sub-wave within the current wave.
    pub sub_wave_idx: u8,
    pub phase: WavePhase,
    /// Tick at which the current phase began (room tick, not relative).
    /// Used to detect the 720-tick stale-fallback condition and the
    /// intro splash duration.
    pub phase_started_tick: u32,
}

impl WaveState {
    /// Initial state at room boot: wave 1, sub-wave 0, Intro phase.
    pub fn new() -> Self {
        Self {
            current_wave: 1,
            sub_wave_idx: 0,
            phase: WavePhase::Intro,
            phase_started_tick: 0,
        }
    }
}

impl Default for WaveState {
    fn default() -> Self {
        Self::new()
    }
}

/// One enemy spawn request emitted by `tick_wave`. The caller
/// (`room.rs`) translates this into an actual `EnemyState` via the
/// kind-appropriate spawn helper (`spawn_hunter_from_seed` etc).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WaveSpawnRequest {
    pub kind_u8: u8,
    pub is_boss: bool,
    pub boss_tier: u8,
}

/// One enemy group inside a sub-wave (e.g. "3 HUNTERs"). A sub-wave is
/// a slice of these.
#[derive(Debug, Clone, Copy)]
pub struct WaveSpawnGroup {
    pub kind_u8: u8,
    pub count: u8,
    pub is_boss: bool,
    pub boss_tier: u8,
}

/// Static config for one wave. Read from `wave_table::get_wave_config`.
#[derive(Debug, Clone, Copy)]
pub struct WaveConfig {
    pub wave_number: u16,
    pub asteroid_count: u8,
    pub sub_waves: &'static [&'static [WaveSpawnGroup]],
    pub is_boss_wave: bool,
    pub boss_tier: u8,
}

/// Expand a sub-wave's groups into one `WaveSpawnRequest` per enemy.
/// Order: groups in declaration order, each group's count emitted
/// consecutively before moving to the next group.
fn emit_sub_wave(groups: &[WaveSpawnGroup]) -> Vec<WaveSpawnRequest> {
    let total: usize = groups.iter().map(|g| g.count as usize).sum();
    let mut out = Vec::with_capacity(total);
    for g in groups {
        for _ in 0..g.count {
            out.push(WaveSpawnRequest {
                kind_u8: g.kind_u8,
                is_boss: g.is_boss,
                boss_tier: g.boss_tier,
            });
        }
    }
    out
}

/// Per-tick wave update.
///
/// Inputs:
/// - `state`: mutated to reflect phase transitions.
/// - `config`: the static config for `state.current_wave`. Caller looks
///    this up via `wave_table::get_wave_config(state.current_wave)`.
/// - `alive_enemy_count`: how many enemies are currently alive in the
///   room. Used to gate sub-wave advance (≤2) and wave-complete (=0).
/// - `current_tick`: room tick (`RoomState.tick`).
///
/// Returns: a Vec of spawn requests for this tick. Empty when nothing
/// is spawning (Intro waiting, Spawning between sub-waves, Clearing,
/// or Complete).
///
/// Phase transitions:
/// - Intro → Spawning when `current_tick - phase_started_tick >= WAVE_INTRO_TICKS`.
///   Emits sub-wave 0's groups as spawn requests on the SAME tick that
///   transitions to Spawning.
/// - Spawning → Spawning (advance sub_wave_idx) when alive ≤ 2 OR
///   stale (720 ticks). Emits the new sub-wave's groups. Updates
///   `phase_started_tick` to `current_tick`.
/// - Spawning → Clearing when sub_wave_idx == sub_waves.len() (all
///   sub-waves have spawned) AND we just advanced past the last one.
///   Equivalently: when there are no more sub-waves left to advance to.
/// - Clearing → Complete when alive_enemy_count == 0.
/// - Complete: terminal — `tick_wave` returns empty. Caller advances
///   `current_wave += 1` and resets `phase = Intro`, `sub_wave_idx = 0`,
///   `phase_started_tick = current_tick`. (Caller's job, NOT yours.)
///
/// Pure function; no I/O, no time queries, no randomness. Deterministic.
pub fn tick_wave(
    state: &mut WaveState,
    config: &WaveConfig,
    alive_enemy_count: usize,
    current_tick: u32,
) -> Vec<WaveSpawnRequest> {
    let total_sub_waves = config.sub_waves.len();

    match state.phase {
        // ── Complete: terminal. Caller decides when to start next wave. ──
        WavePhase::Complete => Vec::new(),

        // ── Intro: hold for WAVE_INTRO_TICKS, then transition to
        //   Spawning AND emit sub-wave 0 on the same tick. ──
        WavePhase::Intro => {
            let elapsed = current_tick.saturating_sub(state.phase_started_tick);
            if elapsed < WAVE_INTRO_TICKS {
                return Vec::new();
            }

            // Degenerate config: zero sub-waves. Skip straight through.
            if total_sub_waves == 0 {
                state.phase = if alive_enemy_count == 0 {
                    WavePhase::Complete
                } else {
                    WavePhase::Clearing
                };
                state.phase_started_tick = current_tick;
                return Vec::new();
            }

            state.phase = WavePhase::Spawning;
            state.sub_wave_idx = 0;
            state.phase_started_tick = current_tick;
            emit_sub_wave(config.sub_waves[0])
        }

        // ── Clearing: all sub-waves are out; wait for the field to clear. ──
        WavePhase::Clearing => {
            if alive_enemy_count == 0 {
                state.phase = WavePhase::Complete;
                state.phase_started_tick = current_tick;
            }
            Vec::new()
        }

        // ── Spawning: decide whether to advance to next sub-wave. ──
        WavePhase::Spawning => {
            let elapsed = current_tick.saturating_sub(state.phase_started_tick);
            let ready = alive_enemy_count <= SUB_WAVE_ADVANCE_ENEMY_THRESHOLD
                || elapsed >= SUB_WAVE_ADVANCE_STALE_TICKS;

            if !ready {
                return Vec::new();
            }

            // Next sub-wave index to emit. `sub_wave_idx` is the index
            // of the sub-wave we most recently emitted (set on entry
            // to Spawning to 0). So the next one to emit is +1.
            let next_idx = (state.sub_wave_idx as usize).saturating_add(1);

            if next_idx >= total_sub_waves {
                // No more sub-waves to advance to. Move to Clearing.
                // If the field is already empty, jump straight to
                // Complete (e.g., last sub-wave was a single boss that
                // died on the same tick — vanishingly rare, but cheap).
                state.phase = WavePhase::Clearing;
                state.phase_started_tick = current_tick;
                if alive_enemy_count == 0 {
                    state.phase = WavePhase::Complete;
                }
                return Vec::new();
            }

            // Advance. Emit the new sub-wave's groups.
            state.sub_wave_idx = next_idx as u8;
            state.phase_started_tick = current_tick;
            emit_sub_wave(config.sub_waves[next_idx])
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Synthetic kind values — these tests don't import the real enemy
    // kind table; any u8s will do. Real values get plugged in by
    // Agent C's `wave_table.rs`.
    const HUNTER: u8 = 0;
    const GUARDIAN: u8 = 1;
    const BOSS: u8 = 9;

    // ── Static sub-wave fixtures (require &'static for WaveConfig) ──
    const SUB_WAVE_A: &[WaveSpawnGroup] = &[WaveSpawnGroup {
        kind_u8: HUNTER,
        count: 3,
        is_boss: false,
        boss_tier: 0,
    }];
    const SUB_WAVE_B: &[WaveSpawnGroup] = &[WaveSpawnGroup {
        kind_u8: GUARDIAN,
        count: 2,
        is_boss: false,
        boss_tier: 0,
    }];
    const SUB_WAVE_MIXED: &[WaveSpawnGroup] = &[
        WaveSpawnGroup {
            kind_u8: HUNTER,
            count: 3,
            is_boss: false,
            boss_tier: 0,
        },
        WaveSpawnGroup {
            kind_u8: GUARDIAN,
            count: 2,
            is_boss: false,
            boss_tier: 0,
        },
    ];
    const SUB_WAVE_BOSS: &[WaveSpawnGroup] = &[WaveSpawnGroup {
        kind_u8: BOSS,
        count: 1,
        is_boss: true,
        boss_tier: 2,
    }];

    const TWO_SUB_WAVE_CONFIG: WaveConfig = WaveConfig {
        wave_number: 1,
        asteroid_count: 0,
        sub_waves: &[SUB_WAVE_A, SUB_WAVE_B],
        is_boss_wave: false,
        boss_tier: 0,
    };

    const MIXED_CONFIG: WaveConfig = WaveConfig {
        wave_number: 1,
        asteroid_count: 0,
        sub_waves: &[SUB_WAVE_MIXED],
        is_boss_wave: false,
        boss_tier: 0,
    };

    const BOSS_CONFIG: WaveConfig = WaveConfig {
        wave_number: 1,
        asteroid_count: 0,
        sub_waves: &[SUB_WAVE_BOSS],
        is_boss_wave: true,
        boss_tier: 2,
    };

    #[test]
    fn wave_state_new_is_intro_wave_1() {
        let s = WaveState::new();
        assert_eq!(s.current_wave, 1);
        assert_eq!(s.sub_wave_idx, 0);
        assert_eq!(s.phase, WavePhase::Intro);
        assert_eq!(s.phase_started_tick, 0);
    }

    #[test]
    fn intro_phase_holds_for_intro_ticks() {
        let mut state = WaveState::new();
        // Phase started at tick 0. For ticks 0..WAVE_INTRO_TICKS-1,
        // tick_wave returns empty and stays in Intro.
        for t in 0..WAVE_INTRO_TICKS {
            let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 0, t);
            assert!(
                out.is_empty(),
                "intro should not emit at tick {} (< {})",
                t,
                WAVE_INTRO_TICKS
            );
            assert_eq!(state.phase, WavePhase::Intro);
        }

        // On tick == WAVE_INTRO_TICKS, transition to Spawning AND emit
        // sub-wave 0 (3 HUNTERs).
        let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 0, WAVE_INTRO_TICKS);
        assert_eq!(state.phase, WavePhase::Spawning);
        assert_eq!(state.sub_wave_idx, 0);
        assert_eq!(out.len(), 3);
        for req in &out {
            assert_eq!(req.kind_u8, HUNTER);
            assert!(!req.is_boss);
        }
    }

    #[test]
    fn sub_wave_advance_on_low_enemy_count() {
        let mut state = WaveState::new();

        // Burn through intro.
        let _ = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 0, WAVE_INTRO_TICKS);
        assert_eq!(state.phase, WavePhase::Spawning);
        assert_eq!(state.sub_wave_idx, 0);

        // For a few ticks with the field still full, no advance.
        let base = WAVE_INTRO_TICKS;
        for t in 1..10 {
            let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 5, base + t);
            assert!(out.is_empty(), "no advance with 5 enemies alive");
            assert_eq!(state.sub_wave_idx, 0);
        }

        // Drop to 1 alive — advance to sub-wave 1 (2 GUARDIANs).
        let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 1, base + 10);
        assert_eq!(state.sub_wave_idx, 1);
        assert_eq!(state.phase, WavePhase::Spawning);
        assert_eq!(out.len(), 2);
        for req in &out {
            assert_eq!(req.kind_u8, GUARDIAN);
        }
    }

    #[test]
    fn sub_wave_advance_on_stale_fallback() {
        let mut state = WaveState::new();

        // Burn through intro at tick WAVE_INTRO_TICKS — emits sub-wave 0.
        let _ = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 0, WAVE_INTRO_TICKS);
        assert_eq!(state.sub_wave_idx, 0);
        assert_eq!(state.phase_started_tick, WAVE_INTRO_TICKS);

        // For SUB_WAVE_ADVANCE_STALE_TICKS - 1 ticks with field full
        // (alive=5, way above threshold), no advance.
        for delta in 1..SUB_WAVE_ADVANCE_STALE_TICKS {
            let out = tick_wave(
                &mut state,
                &TWO_SUB_WAVE_CONFIG,
                5,
                WAVE_INTRO_TICKS + delta,
            );
            assert!(
                out.is_empty(),
                "no stale advance yet at delta {} (< {})",
                delta,
                SUB_WAVE_ADVANCE_STALE_TICKS
            );
            assert_eq!(state.sub_wave_idx, 0);
        }

        // At delta == SUB_WAVE_ADVANCE_STALE_TICKS, force-advance.
        let out = tick_wave(
            &mut state,
            &TWO_SUB_WAVE_CONFIG,
            5,
            WAVE_INTRO_TICKS + SUB_WAVE_ADVANCE_STALE_TICKS,
        );
        assert_eq!(state.sub_wave_idx, 1);
        assert_eq!(out.len(), 2);
        for req in &out {
            assert_eq!(req.kind_u8, GUARDIAN);
        }
    }

    #[test]
    fn spawn_request_count_matches_group_count() {
        let mut state = WaveState::new();
        let out = tick_wave(&mut state, &MIXED_CONFIG, 0, WAVE_INTRO_TICKS);

        // 3 HUNTERs + 2 GUARDIANs = 5 requests, in declaration order.
        assert_eq!(out.len(), 5);
        assert_eq!(out[0].kind_u8, HUNTER);
        assert_eq!(out[1].kind_u8, HUNTER);
        assert_eq!(out[2].kind_u8, HUNTER);
        assert_eq!(out[3].kind_u8, GUARDIAN);
        assert_eq!(out[4].kind_u8, GUARDIAN);
    }

    #[test]
    fn wave_complete_when_clearing_and_no_enemies() {
        let mut state = WaveState::new();

        // Intro → Spawning, emit sub-wave 0 (3 HUNTERs).
        let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 0, WAVE_INTRO_TICKS);
        assert_eq!(out.len(), 3);

        // Drop alive to 1 — advance to sub-wave 1, emit 2 GUARDIANs.
        let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 1, WAVE_INTRO_TICKS + 30);
        assert_eq!(state.sub_wave_idx, 1);
        assert_eq!(out.len(), 2);

        // Drop alive to 1 again — no more sub-waves, transition to Clearing.
        let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 1, WAVE_INTRO_TICKS + 60);
        assert!(out.is_empty());
        assert_eq!(state.phase, WavePhase::Clearing);

        // Still enemies alive — stay Clearing.
        let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 1, WAVE_INTRO_TICKS + 70);
        assert!(out.is_empty());
        assert_eq!(state.phase, WavePhase::Clearing);

        // Field clears — transition to Complete.
        let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, 0, WAVE_INTRO_TICKS + 80);
        assert!(out.is_empty());
        assert_eq!(state.phase, WavePhase::Complete);
    }

    #[test]
    fn complete_phase_returns_empty() {
        let mut state = WaveState {
            current_wave: 1,
            sub_wave_idx: 1,
            phase: WavePhase::Complete,
            phase_started_tick: 0,
        };

        // Regardless of inputs, Complete returns empty and stays Complete.
        for (alive, tick) in [(0usize, 0u32), (5, 100), (99, 99_999)] {
            let out = tick_wave(&mut state, &TWO_SUB_WAVE_CONFIG, alive, tick);
            assert!(out.is_empty());
            assert_eq!(state.phase, WavePhase::Complete);
        }
    }

    #[test]
    fn boss_spawn_request_carries_boss_tier() {
        let mut state = WaveState::new();
        let out = tick_wave(&mut state, &BOSS_CONFIG, 0, WAVE_INTRO_TICKS);

        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind_u8, BOSS);
        assert!(out[0].is_boss);
        assert_eq!(out[0].boss_tier, 2);
    }
}
