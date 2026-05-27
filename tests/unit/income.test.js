// Looter-Economy Pivot — T01: Rainshard income faucet (§2.4).
// Validates the per-kill formula, wave/difficulty/find scaling, and that a
// representative NORMAL 30-wave run reproduces the design's ~39k headline.
import {
    INCOME,
    waveScale,
    perKillRainshards,
    runIncomeEstimate,
} from '../../js/modules/shop/income.js';

// The design's "measured run income" table (§2.4) was validated against a
// ~21 enemies/wave, 30-wave run at streak 1.15, find 1.0.
const ENEMIES_PER_WAVE = 21;
const WAVES = 30;

describe('T01 — INCOME constants', () => {
    test('BASE is 25', () => {
        expect(INCOME.BASE).toBe(25);
    });

    test('difficulty multipliers match the doc table', () => {
        expect(INCOME.difficultyMult.EASY).toBe(0.7);
        expect(INCOME.difficultyMult.NORMAL).toBe(1.0);
        expect(INCOME.difficultyMult.HARD).toBe(1.4);
        expect(INCOME.difficultyMult.EPIC).toBe(1.9);
        expect(INCOME.difficultyMult.LEGENDARY).toBe(2.5);
    });

    test('waveScale coefficient is 0.08 and findMult caps at 3', () => {
        expect(INCOME.waveScale).toBe(0.08);
        expect(INCOME.findMult.max).toBe(3);
    });
});

describe('T01 — waveScale(wave)', () => {
    test('wave 1 is exactly 1', () => {
        expect(waveScale(1)).toBe(1);
    });

    test('grows +8% per wave', () => {
        expect(waveScale(2)).toBeCloseTo(1.08, 6);
        expect(waveScale(11)).toBeCloseTo(1.8, 6); // 1 + 10*0.08
    });

    test('floors invalid/sub-1 waves to 1', () => {
        expect(waveScale(0)).toBe(1);
        expect(waveScale(-5)).toBe(1);
    });
});

describe('T01 — perKillRainshards', () => {
    test('a bare wave-1 NORMAL kill with no streak/find = BASE', () => {
        expect(perKillRainshards({ wave: 1 })).toBe(25);
    });

    test('applies all multipliers', () => {
        // 25 × waveScale(11)=1.8 × diff 1.4 × streak 1.2 × find 2 = 151.2
        const r = perKillRainshards({
            wave: 11,
            difficultyMult: 1.4,
            killstreakMult: 1.2,
            findMult: 2,
        });
        expect(r).toBeCloseTo(25 * 1.8 * 1.4 * 1.2 * 2, 6);
    });

    test('clamps findMult to its ceiling', () => {
        const capped = perKillRainshards({ wave: 1, findMult: 99 });
        expect(capped).toBe(perKillRainshards({ wave: 1, findMult: 3 }));
    });

    test('clamps killstreakMult to the 1–1.5 band', () => {
        const capped = perKillRainshards({ wave: 1, killstreakMult: 5 });
        expect(capped).toBe(perKillRainshards({ wave: 1, killstreakMult: 1.5 }));
    });
});

describe('T01 — runIncomeEstimate', () => {
    function run(opts) {
        return runIncomeEstimate({
            enemiesPerWave: ENEMIES_PER_WAVE,
            waves: WAVES,
            ...opts,
        });
    }

    test('NORMAL 30-wave run lands ≈ 39k (±10%)', () => {
        const total = run({ difficultyMult: INCOME.difficultyMult.NORMAL });
        expect(total).toBeGreaterThanOrEqual(39300 * 0.9);
        expect(total).toBeLessThanOrEqual(39300 * 1.1);
    });

    test('difficulty scaling matches the doc table (±10%)', () => {
        const within = (got, doc) => {
            expect(got).toBeGreaterThanOrEqual(doc * 0.9);
            expect(got).toBeLessThanOrEqual(doc * 1.1);
        };
        within(run({ difficultyMult: INCOME.difficultyMult.EASY }), 27500);
        within(run({ difficultyMult: INCOME.difficultyMult.NORMAL }), 39300);
        within(run({ difficultyMult: INCOME.difficultyMult.HARD }), 55000);
        within(run({ difficultyMult: INCOME.difficultyMult.EPIC }), 74700);
        within(run({ difficultyMult: INCOME.difficultyMult.LEGENDARY }), 98200);
    });

    test('find scaling on NORMAL matches the doc (±10%)', () => {
        const base = run({ difficultyMult: 1 });
        // doc: ×1.5 → 59k, ×2 → 79k, ×3 → 118k
        expect(run({ difficultyMult: 1, findMult: 1.5 })).toBeCloseTo(base * 1.5, 4);
        expect(run({ difficultyMult: 1, findMult: 2 })).toBeCloseTo(base * 2, 4);
        expect(run({ difficultyMult: 1, findMult: 3 })).toBeCloseTo(base * 3, 4);
        expect(run({ difficultyMult: 1, findMult: 1.5 })).toBeGreaterThanOrEqual(59000 * 0.9);
        expect(run({ difficultyMult: 1, findMult: 1.5 })).toBeLessThanOrEqual(59000 * 1.1);
    });

    test('LEGENDARY × find 2.5 ≈ 246k (±10%)', () => {
        const total = run({ difficultyMult: INCOME.difficultyMult.LEGENDARY, findMult: 2.5 });
        expect(total).toBeGreaterThanOrEqual(246000 * 0.9);
        expect(total).toBeLessThanOrEqual(246000 * 1.1);
    });

    test('accepts a per-wave array (length wins over `waves`)', () => {
        const arr = [10, 20, 30];
        const fromArray = runIncomeEstimate({ enemiesPerWave: arr, waves: 99, difficultyMult: 1 });
        const manual =
            10 * perKillRainshards({ wave: 1, killstreakMult: 1.15 }) +
            20 * perKillRainshards({ wave: 2, killstreakMult: 1.15 }) +
            30 * perKillRainshards({ wave: 3, killstreakMult: 1.15 });
        expect(fromArray).toBeCloseTo(manual, 4);
    });

    test('zero waves yields zero income', () => {
        expect(runIncomeEstimate({ enemiesPerWave: 21, waves: 0 })).toBe(0);
    });
});
