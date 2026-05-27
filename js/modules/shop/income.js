// Looter-Economy Pivot — T01: Rainshard income (the faucet).
//
// Pure config + math for the per-kill Rainshard (R$) faucet, per design
// §2.4. No DOM, no globals, no Date.now/Math.random — every export is a
// pure function or frozen data, so the same inputs always give the same
// R$ (testable + deterministic).
//
//   per-kill R$ = BASE × waveScale(w) × difficultyMult × killstreakMult × findMult
//
// waveScale ramps income with run depth; difficultyMult is the mode lens;
// killstreakMult (1–1.5) rewards chaining kills; findMult (1→~3) folds in
// gear R$-find affixes + Hoarder's Greed + the Reactor/economy Matrix line.
// Boss/elite kill bonuses + bounty lump sums are layered ON TOP by callers.

export const INCOME = Object.freeze({
    // Base R$ awarded for a wave-1 kill on NORMAL with no streak/find.
    BASE: 25,

    // Per-difficulty income lens (§2.4). Keyed by mode id.
    difficultyMult: Object.freeze({
        EASY: 0.7,
        NORMAL: 1.0,
        HARD: 1.4,
        EPIC: 1.9,
        LEGENDARY: 2.5,
    }),

    // waveScale(w) = 1 + (w-1) × WAVE_SCALE_COEFF.
    waveScale: 0.08,

    // R$-find is capped so a fully-stacked greed build tops out near ×3
    // (the design's "1 → ~3" band). Callers clamp via this ceiling.
    findMult: Object.freeze({ min: 1, max: 3 }),

    // killstreakMult lives in the 1–1.5 band (design §2.4).
    killstreak: Object.freeze({ min: 1, max: 1.5 }),
});

// Income multiplier for a given wave number. Wave 1 = ×1, growing +8%/wave.
export function waveScale(wave) {
    const w = Math.max(1, wave | 0);
    return 1 + (w - 1) * INCOME.waveScale;
}

// R$ awarded for a single kill. All multipliers default to 1 (NORMAL, no
// streak, no find) so the minimal call is just `perKillRainshards({ wave })`.
export function perKillRainshards({
    wave,
    difficultyMult = 1,
    killstreakMult = 1,
    findMult = 1,
} = {}) {
    const find = Math.min(INCOME.findMult.max, Math.max(INCOME.findMult.min, findMult));
    const streak = Math.min(INCOME.killstreak.max, Math.max(INCOME.killstreak.min, killstreakMult));
    return INCOME.BASE * waveScale(wave) * difficultyMult * streak * find;
}

// Estimate the full-run R$ income by summing per-kill income over every
// wave. `enemiesPerWave` may be a scalar (same count each wave) or a
// per-wave array (array length wins over `waves`). `streakAvg` is the
// average killstreak multiplier across the run (design uses ~1.15).
//
// Mirrors the design's "measured run income" table: a NORMAL 30-wave run
// with ~21 enemies/wave, streak 1.15, find 1.0 lands at ~39k R$.
export function runIncomeEstimate({
    enemiesPerWave,
    waves,
    difficultyMult = 1,
    findMult = 1,
    streakAvg = 1.15,
} = {}) {
    const isArray = Array.isArray(enemiesPerWave);
    const waveCount = isArray ? enemiesPerWave.length : Math.max(0, waves | 0);

    let total = 0;
    for (let i = 0; i < waveCount; i++) {
        const w = i + 1;
        const count = isArray ? (enemiesPerWave[i] || 0) : enemiesPerWave;
        total += count * perKillRainshards({
            wave: w,
            difficultyMult,
            killstreakMult: streakAvg,
            findMult,
        });
    }
    return total;
}
