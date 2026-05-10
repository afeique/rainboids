//! Cross-language parity vector for wave scheduling.
//!
//! Drives the Rust `update_wave` step over 4 ticks of wave 1 with the
//! same per-tick `enemy_count` vector exercised by the JS unit test
//! (`tests/unit/sim/wave.test.js`'s `replay parity` block, the
//! "wave 1 — ≤2-enemy advance" case) and asserts the emitted
//! `EnemySpawn` events match the JS-captured sequence exactly.
//!
//! Unlike the f32 physics parity tests (`parity_asteroid`,
//! `parity_bullet`, `parity_drops`), this fixture compares **discrete
//! events** instead of float deltas — so we can use exact `assert_eq!`
//! on the (`enemy_type`, `count`, `is_boss`, `boss_tier`) tuples
//! without an f32 tolerance. The wave-spawn step has no floating-point
//! drift; either the Rust enum mapping matches JS or it doesn't.
//!
//! The reference sequence was captured 2026-05-10 with:
//!
//! ```bash
//! node --input-type=module -e "
//!   import { updateWave } from './js/sim/wave.js';
//!   import { freshWaveState } from './js/sim/state.js';
//!   const wave = freshWaveState(1, { phase: 'spawning' });
//!   const enemyCounts = [0, 5, 2, 0];
//!   const allEvents = [];
//!   for (const enemyCount of enemyCounts) {
//!     const events = [];
//!     updateWave(wave, { enemyCount, dt: 1/60, ships: [], rng: null }, events);
//!     allEvents.push(...events);
//!   }
//!   console.log(JSON.stringify(allEvents.filter(e => e.type === 'enemy_spawn').map(e => ({
//!     enemyType: e.enemyType, count: e.count, isBoss: !!e.isBoss, bossTier: e.bossTier|0
//!   })), null, 2));
//! "
//! # → [
//! #     { "enemyType": "HUNTER", "count": 3, "isBoss": false, "bossTier": 0 },
//! #     { "enemyType": "HUNTER", "count": 2, "isBoss": false, "bossTier": 0 },
//! #     { "enemyType": "WASP",   "count": 2, "isBoss": false, "bossTier": 0 }
//! # ]
//! ```
//!
//! Tick model:
//!   - t=0: enemy_count=0 → ≤2 trigger fires → spawn sub-wave 0
//!     (HUNTER ×3). sub_wave_index advances 0 → 1.
//!   - t=1: enemy_count=5 → neither trigger (>2, elapsed<12 s) →
//!     spawn_timer accumulates ~16 ms, no events.
//!   - t=2: enemy_count=2 → ≤2 trigger fires → spawn sub-wave 1
//!     (HUNTER ×2 + WASP ×2). sub_wave_index advances 1 → 2.
//!   - t=3: enemy_count=0 → all sub-waves out (wave 1 has 2) →
//!     phase flips Spawning → Complete (because 0 enemies on the
//!     same tick), emits a WaveClear event. No further EnemySpawn.

use rainboids_server::sim::{
    rng,
    wave::{update_wave, EnemyType, Wave, WaveContext, WaveEvent, WavePhase},
};
use rainboids_server::protocol::{PlayerId, ShipState};

#[test]
fn wave1_advance_at_two_enemies() {
    // Setup: wave 1 in Spawning phase (skipping the Intro overlay
    // that the wrapper owns). All other fields default per
    // `Wave::fresh`.
    let mut wave = Wave::fresh(1);
    wave.phase = WavePhase::Spawning;

    let enemy_counts: [u32; 4] = [0, 5, 2, 0];
    let mut all_events: Vec<WaveEvent> = Vec::new();

    for &enemy_count in &enemy_counts {
        let ctx = WaveContext {
            enemy_count,
            dt: 1.0_f32 / 60.0,
            ships: &[],
            rng: None,
        };
        let mut tick_events: Vec<WaveEvent> = Vec::new();
        update_wave(&mut wave, &ctx, &mut tick_events);
        all_events.extend(tick_events);
    }

    // Filter to the EnemySpawn events for the cross-language check.
    // WaveClear events fire on the wrapper boundary and are out of
    // scope for this fixture (the JS golden was captured with the
    // same `e.type === 'enemy_spawn'` filter).
    let spawn_tuples: Vec<(EnemyType, u32, bool, u8)> = all_events
        .iter()
        .filter_map(|ev| match ev {
            WaveEvent::EnemySpawn {
                enemy_type,
                count,
                is_boss,
                boss_tier,
                ..
            } => Some((*enemy_type, *count, *is_boss, *boss_tier)),
            _ => None,
        })
        .collect();

    // Stderr diagnostic — mirrors the `RUST-EMITS:` convention in the
    // f32 parity fixtures. Useful when running the test in CI for a
    // human-readable diff against the JS golden.
    eprintln!("RUST-EMITS: {:?}", spawn_tuples);

    // JS reference sequence captured 2026-05-10 (see header docstring).
    // Each tuple: (enemy_type, count, is_boss, boss_tier).
    let expected: Vec<(EnemyType, u32, bool, u8)> = vec![
        (EnemyType::Hunter, 3, false, 0), // sub-wave 0 group 0
        (EnemyType::Hunter, 2, false, 0), // sub-wave 1 group 0
        (EnemyType::Wasp, 2, false, 0),   // sub-wave 1 group 1
    ];

    assert_eq!(
        spawn_tuples.len(),
        expected.len(),
        "expected {} EnemySpawn events, got {}: {:?}",
        expected.len(),
        spawn_tuples.len(),
        spawn_tuples
    );
    assert_eq!(spawn_tuples, expected, "EnemySpawn sequence diverged from JS");

    // Sanity on terminal state: after t=3 with 0 enemies and all 2
    // sub-waves out, the wave should have flipped to Complete and
    // emitted a WaveClear event for wave 1.
    assert_eq!(
        wave.phase,
        WavePhase::Complete,
        "wave should be Complete after final tick"
    );
    assert_eq!(
        wave.sub_wave_index, 2,
        "sub_wave_index should match wave 1's total sub-wave count (2)"
    );
    assert!(
        all_events
            .iter()
            .any(|ev| matches!(ev, WaveEvent::WaveClear { wave } if *wave == 1)),
        "expected a WaveClear event for wave 1 by the final tick"
    );
}

/// Same scenario as `wave1_advance_at_two_enemies` but with the new
/// `ctx.ships` slice populated and a real `Pcg64` plugged into
/// `ctx.rng`. The JS audit (see commit 2026-05-10 follow-up to PR #22)
/// confirmed that `js/sim/wave.js::updateWave` does NOT read either of
/// these fields; the JS `wave-data.js` campaign schedule is fully
/// deterministic with no `Math.random` branches. This fixture proves
/// the Rust port honors the same invariant: populating `ships` + `rng`
/// must not affect the spawn sequence emitted on the same enemy_count
/// vector.
///
/// If a future change adds randomized scheduling (e.g., enemy
/// substitution gated on `rng.gen_bool(...)`), this test will start
/// diverging from `wave1_advance_at_two_enemies` — that's the signal
/// to capture a new JS golden + flip the docstring on `WaveContext`.
#[test]
fn wave1_with_populated_context() {
    // Same wave-1 setup as the original fixture.
    let mut wave = Wave::fresh(1);
    wave.phase = WavePhase::Spawning;

    // Non-default ships slice — a single ship at a fixed (non-zero)
    // position with non-zero velocity / hp / shield. Using one entry
    // exercises the slice-borrowing path (vs. the empty-slice fast
    // path the original test takes).
    let ships: [ShipState; 1] = [ShipState {
        player: PlayerId(7),
        x: 1234.5,
        y: -678.25,
        vx: 12.0,
        vy: -3.5,
        angle: 1.5707963, // ~π/2 — not load-bearing, just non-zero.
        hp: 80.0,
        shield: 25.0,
    }];

    // Seeded RNG. Seed 42 matches `parity_vectors::pcg64_seed_42`
    // captures, so if a future randomized branch is added to
    // `update_wave`, the resulting golden can be cross-checked
    // against existing PCG64 trace fixtures.
    let mut rng = rng::from_seed(42);

    let enemy_counts: [u32; 4] = [0, 5, 2, 0];
    let mut all_events: Vec<WaveEvent> = Vec::new();

    for &enemy_count in &enemy_counts {
        let ctx = WaveContext {
            enemy_count,
            dt: 1.0_f32 / 60.0,
            ships: &ships,
            rng: Some(&mut rng),
        };
        let mut tick_events: Vec<WaveEvent> = Vec::new();
        update_wave(&mut wave, &ctx, &mut tick_events);
        all_events.extend(tick_events);
    }

    let spawn_tuples: Vec<(EnemyType, u32, bool, u8)> = all_events
        .iter()
        .filter_map(|ev| match ev {
            WaveEvent::EnemySpawn {
                enemy_type,
                count,
                is_boss,
                boss_tier,
                ..
            } => Some((*enemy_type, *count, *is_boss, *boss_tier)),
            _ => None,
        })
        .collect();

    eprintln!("RUST-EMITS (populated ctx): {:?}", spawn_tuples);

    // Identical golden to `wave1_advance_at_two_enemies` — the new
    // fields must not perturb the spawn sequence.
    let expected: Vec<(EnemyType, u32, bool, u8)> = vec![
        (EnemyType::Hunter, 3, false, 0),
        (EnemyType::Hunter, 2, false, 0),
        (EnemyType::Wasp, 2, false, 0),
    ];

    assert_eq!(
        spawn_tuples, expected,
        "EnemySpawn sequence must be identical to the empty-context \
         baseline — populating ctx.ships / ctx.rng must not affect \
         the (deterministic) wave schedule"
    );

    // Same terminal-state checks as the baseline.
    assert_eq!(
        wave.phase,
        WavePhase::Complete,
        "wave should be Complete after final tick (populated ctx)"
    );
    assert_eq!(
        wave.sub_wave_index, 2,
        "sub_wave_index should match wave 1's total sub-wave count (2)"
    );
    assert!(
        all_events
            .iter()
            .any(|ev| matches!(ev, WaveEvent::WaveClear { wave } if *wave == 1)),
        "expected a WaveClear event for wave 1 by the final tick"
    );

    // Sanity: the RNG must be untouched. If the implementation ever
    // starts consuming it, this assertion will fail and the doc
    // comment on `WaveContext::rng` will need updating to reflect the
    // new "consumed by update_wave" semantics.
    let mut control = rng::from_seed(42);
    use rand::RngCore;
    assert_eq!(
        rng.next_u64(),
        control.next_u64(),
        "ctx.rng state must be unchanged — update_wave does not read it"
    );
}
