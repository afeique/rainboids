// Looter-Economy Pivot — T03: Gear-scaling math (single source of truth for §2.1).
//
// Pure math, no game imports, no DOM/globals/RNG. Gear, Matrices, and set
// bonuses are all **% amplifiers of an invested SP stat**, never flat — and
// their effect ramps with the per-run level so gear is dormant early (can't
// faceroll the first waves) and reaches full strength late:
//
//   effective(stat) = SP_value(stat) × (1 + ampPct × levelRamp(level))
//   levelRamp(level) = clamp01((level − 1) / (LEVEL_SOFTCAP − 1))
//
// Because the SP value is the multiplicand, gear amplifies ONLY stats you've
// actually invested SP in (0 SP → 0 effect → the "INACTIVE ⚠" tooltip),
// rewarding specialization.

// Level at which gear amplification hits 100% of its rolled %. Past this,
// the ramp is clamped at 1 (no further gear growth from leveling).
export const LEVEL_SOFTCAP = 25;

function clamp01(x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
}

// Fraction (0→1) of a gear affix's rolled % that is "live" at this level.
//   level 1            → 0   (gear dormant)
//   level LEVEL_SOFTCAP → 1   (gear at full strength)
//   level > softcap    → 1   (clamped)
export function levelRamp(level, softcap = LEVEL_SOFTCAP) {
    const span = softcap - 1;
    if (span <= 0) return 1; // degenerate softcap of 1 → always full
    return clamp01((level - 1) / span);
}

// Amplify an invested SP stat value by a gear/Matrix/set % at the current
// level. `ampPct` is the SUMMED amplifier as a fraction (e.g. 0.20 = +20%).
//   amplifySP(spValue, ampPct, level) = spValue × (1 + ampPct × levelRamp(level))
// Zero invested SP → 0 (gear amplifies invested SP only); zero amp or level 1
// → just the raw spValue.
export function amplifySP(spValue, ampPct, level, softcap = LEVEL_SOFTCAP) {
    return spValue * (1 + ampPct * levelRamp(level, softcap));
}
