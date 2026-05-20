//! Phase 4 static wave table — spawn schedule for waves 1–10.
//!
//! Ported from solo's `js/modules/wave/wave-data.js` (Stage 1 through
//! mid-Stage 4). Pure data + getter. The full 30-wave table arrives
//! when Phase 4 step 5 ports the remaining 9 enemy types — until then,
//! `room.rs` substitutes HUNTER for unimplemented kinds.
//!
//! Wave-1 parallel: Agent A may not have shipped `wave.rs` yet at the
//! time this file is compiled in isolation. Production imports
//! `WaveConfig` / `WaveSpawnGroup` from `crate::wave` — when
//! Agent A's stub is still in place, `cargo check` will fail and the
//! caller should wait for Agent A then retry. The orchestrator
//! dispatches both agents in the same parallel batch so this is
//! expected to resolve quickly. Wave 2 integration consolidates to a
//! single source-of-truth import.

use crate::wave::{WaveConfig, WaveSpawnGroup};

// ─── Enemy kind constants (dense 0..=9) ──────────────────────────────
// Only HUNTER has an implemented spawn function in sim today; the
// other 9 are reserved for Phase 4 step 5. The wave table emits them
// anyway so the table is authoritative; `room.rs` substitutes
// HUNTER for unimplemented kinds with a debug log until step 5.

/// HUNTER — chase-the-player. Implemented in `sim::enemy::spawn_hunter_from_seed`.
pub const KIND_HUNTER: u8 = 0;
/// GUARDIAN — heavy tank. Phase 4 step 5.
pub const KIND_GUARDIAN: u8 = 1;
/// WASP — fast harasser. Phase 4 step 5.
pub const KIND_WASP: u8 = 2;
/// STALKER — sniper line. Phase 4 step 5.
pub const KIND_STALKER: u8 = 3;
/// DRIFTER — drifting body. Phase 4 step 5.
pub const KIND_DRIFTER: u8 = 4;
/// TANGERINE — pure chase. Phase 4 step 5.
pub const KIND_TANGERINE: u8 = 5;
/// WEAVER — weaving harasser. Phase 4 step 5.
pub const KIND_WEAVER: u8 = 6;
/// SENTINEL — slow turret. Phase 4 step 5.
pub const KIND_SENTINEL: u8 = 7;
/// PROWLER — chase + dodge. Phase 4 step 5.
pub const KIND_PROWLER: u8 = 8;
/// TITAN — boss. Phase 4 step 5.
pub const KIND_TITAN: u8 = 9;

/// Highest wave number this table covers. Wave numbers above this
/// clamp to `MAX_WAVE_NUMBER` (returning the hardest wave's config,
/// matching solo's wave-data.js fallback behavior).
pub const MAX_WAVE_NUMBER: u16 = 10;

/// Read the static config for a wave number. Pure lookup; clamps to
/// `[1, MAX_WAVE_NUMBER]` on out-of-range input (mirrors solo's
/// `wave-data.js getWaveConfig` fallback).
pub fn get_wave_config(wave_number: u16) -> WaveConfig {
    let clamped = if wave_number == 0 {
        1
    } else if wave_number > MAX_WAVE_NUMBER {
        MAX_WAVE_NUMBER
    } else {
        wave_number
    };
    match clamped {
        1 => WAVE_1,
        2 => WAVE_2,
        3 => WAVE_3,
        4 => WAVE_4,
        5 => WAVE_5,
        6 => WAVE_6,
        7 => WAVE_7,
        8 => WAVE_8,
        9 => WAVE_9,
        10 => WAVE_10,
        // Unreachable due to clamping above, but satisfy the match.
        _ => WAVE_10,
    }
}

// ─── Per-wave data ────────────────────────────────────────────────────
// Sub-wave layouts copied verbatim from `js/modules/wave/wave-data.js`
// waves 1..=10. Do not edit these constants without updating solo's
// wave-data.js in the same commit.

// ── Stage 1: First Contact (HUNTER + WASP) ──

const WAVE_1_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[WaveSpawnGroup { kind_u8: KIND_HUNTER, count: 3, is_boss: false, boss_tier: 0 }],
    &[
        WaveSpawnGroup { kind_u8: KIND_HUNTER, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,   count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_HUNTER, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,   count: 2, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_1: WaveConfig = WaveConfig {
    wave_number: 1,
    asteroid_count: 5,
    sub_waves: WAVE_1_SUBWAVES,
    is_boss_wave: false,
    boss_tier: 0,
};

const WAVE_2_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[
        WaveSpawnGroup { kind_u8: KIND_HUNTER, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,   count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[WaveSpawnGroup { kind_u8: KIND_WASP, count: 4, is_boss: false, boss_tier: 0 }],
    &[
        WaveSpawnGroup { kind_u8: KIND_HUNTER, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,   count: 3, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_2: WaveConfig = WaveConfig {
    wave_number: 2,
    asteroid_count: 5,
    sub_waves: WAVE_2_SUBWAVES,
    is_boss_wave: false,
    boss_tier: 0,
};

// 1-3 BOSS — Iron Scout: introductory TITAN, light escort.
const WAVE_3_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[
        WaveSpawnGroup { kind_u8: KIND_HUNTER, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,   count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_TITAN,  count: 1, is_boss: true,  boss_tier: 1 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,   count: 2, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_3: WaveConfig = WaveConfig {
    wave_number: 3,
    asteroid_count: 3,
    sub_waves: WAVE_3_SUBWAVES,
    is_boss_wave: true,
    boss_tier: 1,
};

// ── Stage 2: Iron Sentinel (adds GUARDIAN heavy) ──

const WAVE_4_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 2, is_boss: false, boss_tier: 0 }],
    &[
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,   count: 3, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,     count: 3, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_4: WaveConfig = WaveConfig {
    wave_number: 4,
    asteroid_count: 5,
    sub_waves: WAVE_4_SUBWAVES,
    is_boss_wave: false,
    boss_tier: 0,
};

const WAVE_5_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,   count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_WASP,     count: 4, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 1, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,   count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,     count: 2, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_5: WaveConfig = WaveConfig {
    wave_number: 5,
    asteroid_count: 5,
    sub_waves: WAVE_5_SUBWAVES,
    is_boss_wave: false,
    boss_tier: 0,
};

// 2-3 BOSS — Iron Sentinel: TITAN T1 with heavy GUARDIAN escort.
const WAVE_6_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,     count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_TITAN,    count: 1, is_boss: true,  boss_tier: 1 },
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,   count: 2, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_6: WaveConfig = WaveConfig {
    wave_number: 6,
    asteroid_count: 3,
    sub_waves: WAVE_6_SUBWAVES,
    is_boss_wave: true,
    boss_tier: 1,
};

// ── Stage 3: Iron Vanguard (adds STALKER sniper) ──

const WAVE_7_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[WaveSpawnGroup { kind_u8: KIND_STALKER, count: 2, is_boss: false, boss_tier: 0 }],
    &[
        WaveSpawnGroup { kind_u8: KIND_STALKER, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,  count: 3, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_STALKER,  count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,     count: 2, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_7: WaveConfig = WaveConfig {
    wave_number: 7,
    asteroid_count: 5,
    sub_waves: WAVE_7_SUBWAVES,
    is_boss_wave: false,
    boss_tier: 0,
};

const WAVE_8_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[
        WaveSpawnGroup { kind_u8: KIND_STALKER, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,  count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 3, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_STALKER,  count: 1, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_STALKER,  count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,   count: 3, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_8: WaveConfig = WaveConfig {
    wave_number: 8,
    asteroid_count: 5,
    sub_waves: WAVE_8_SUBWAVES,
    is_boss_wave: false,
    boss_tier: 0,
};

// 3-3 BOSS — Iron Vanguard: TITAN T2 with STALKER escort.
const WAVE_9_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[
        WaveSpawnGroup { kind_u8: KIND_STALKER,  count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_GUARDIAN, count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_TITAN,   count: 1, is_boss: true,  boss_tier: 2 },
        WaveSpawnGroup { kind_u8: KIND_STALKER, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,  count: 2, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_9: WaveConfig = WaveConfig {
    wave_number: 9,
    asteroid_count: 3,
    sub_waves: WAVE_9_SUBWAVES,
    is_boss_wave: true,
    boss_tier: 2,
};

// ── Stage 4: Twin Iron (adds DRIFTER + TANGERINE) ──

const WAVE_10_SUBWAVES: &[&[WaveSpawnGroup]] = &[
    &[
        WaveSpawnGroup { kind_u8: KIND_DRIFTER, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,  count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_TANGERINE, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_WASP,      count: 2, is_boss: false, boss_tier: 0 },
    ],
    &[
        WaveSpawnGroup { kind_u8: KIND_DRIFTER,   count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_TANGERINE, count: 2, is_boss: false, boss_tier: 0 },
        WaveSpawnGroup { kind_u8: KIND_HUNTER,    count: 2, is_boss: false, boss_tier: 0 },
    ],
];

const WAVE_10: WaveConfig = WaveConfig {
    wave_number: 10,
    asteroid_count: 4,
    sub_waves: WAVE_10_SUBWAVES,
    is_boss_wave: false,
    boss_tier: 0,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wave_1_has_3_subwaves_and_5_asteroids() {
        let cfg = get_wave_config(1);
        assert_eq!(cfg.asteroid_count, 5);
        assert_eq!(cfg.sub_waves.len(), 3);
        assert_eq!(cfg.wave_number, 1);
        assert!(!cfg.is_boss_wave);
        assert_eq!(cfg.boss_tier, 0);
    }

    #[test]
    fn wave_1_first_subwave_is_3_hunters() {
        let cfg = get_wave_config(1);
        let first_group = cfg.sub_waves[0][0];
        assert_eq!(first_group.kind_u8, KIND_HUNTER);
        assert_eq!(first_group.count, 3);
        assert!(!first_group.is_boss);
        assert_eq!(first_group.boss_tier, 0);
    }

    #[test]
    fn wave_3_is_boss_wave_with_titan() {
        let cfg = get_wave_config(3);
        assert!(cfg.is_boss_wave);
        assert_eq!(cfg.boss_tier, 1);
        // Find a group that is the TITAN boss.
        let mut found = false;
        for sub in cfg.sub_waves.iter() {
            for group in sub.iter() {
                if group.kind_u8 == KIND_TITAN && group.is_boss {
                    found = true;
                    assert_eq!(group.boss_tier, 1);
                }
            }
        }
        assert!(found, "expected a TITAN boss group in wave 3");
    }

    #[test]
    fn wave_6_is_boss_wave_tier_1() {
        let cfg = get_wave_config(6);
        assert!(cfg.is_boss_wave);
        assert_eq!(cfg.boss_tier, 1);
        assert_eq!(cfg.asteroid_count, 3);
        // Verify a TITAN T1 boss group exists.
        let mut found = false;
        for sub in cfg.sub_waves.iter() {
            for group in sub.iter() {
                if group.kind_u8 == KIND_TITAN && group.is_boss {
                    found = true;
                    assert_eq!(group.boss_tier, 1);
                    assert_eq!(group.count, 1);
                }
            }
        }
        assert!(found, "expected a TITAN boss group in wave 6");
    }

    #[test]
    fn wave_9_is_boss_wave_tier_2() {
        let cfg = get_wave_config(9);
        assert!(cfg.is_boss_wave);
        assert_eq!(cfg.boss_tier, 2);
        assert_eq!(cfg.asteroid_count, 3);
        // Verify a TITAN T2 boss group exists.
        let mut found = false;
        for sub in cfg.sub_waves.iter() {
            for group in sub.iter() {
                if group.kind_u8 == KIND_TITAN && group.is_boss {
                    found = true;
                    assert_eq!(group.boss_tier, 2);
                    assert_eq!(group.count, 1);
                }
            }
        }
        assert!(found, "expected a TITAN boss group in wave 9");
    }

    #[test]
    fn out_of_range_clamps_to_max() {
        let zero = get_wave_config(0);
        assert_eq!(zero.wave_number, 1);
        let high = get_wave_config(999);
        assert_eq!(high.wave_number, MAX_WAVE_NUMBER);
        let exact = get_wave_config(MAX_WAVE_NUMBER);
        assert_eq!(exact.wave_number, MAX_WAVE_NUMBER);
    }

    #[test]
    fn all_10_waves_have_at_least_one_subwave() {
        for w in 1..=MAX_WAVE_NUMBER {
            let cfg = get_wave_config(w);
            assert!(
                !cfg.sub_waves.is_empty(),
                "wave {} has no sub-waves",
                w
            );
            assert_eq!(cfg.wave_number, w, "wave {} has wrong wave_number", w);
        }
    }

    #[test]
    fn enemy_kind_constants_are_dense_0_to_9() {
        // Collect the 10 KIND_* consts and assert they cover exactly 0..=9.
        let kinds = [
            KIND_HUNTER,
            KIND_GUARDIAN,
            KIND_WASP,
            KIND_STALKER,
            KIND_DRIFTER,
            KIND_TANGERINE,
            KIND_WEAVER,
            KIND_SENTINEL,
            KIND_PROWLER,
            KIND_TITAN,
        ];
        let mut sorted = kinds;
        sorted.sort_unstable();
        for (i, k) in sorted.iter().enumerate() {
            assert_eq!(*k as usize, i, "KIND constants not dense 0..=9: {:?}", kinds);
        }
    }
}
