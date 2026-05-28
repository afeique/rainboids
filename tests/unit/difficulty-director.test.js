// 8.11.0 — CPU-governed RANDOM difficulty director.
//
// Difficulty no longer adapts to player skill: each wave's difficulty is a
// DETERMINISTIC pseudo-random roll from (seed, wave) — a rising base ramp +
// per-wave variance + occasional punishing spikes. These tests pin: cold-start
// neutrality, seed-determinism, bounds, mode/PWR scaling, the threat-level pip,
// the per-wave loot bonus, and boss-lock.

import { describe, expect, test } from '@jest/globals';
import {
    createDirector,
    recordWave,
    updateDifficulty,
    tickWave,
    getDifficulty,
    getThreatLevel,
    lockForBoss,
    setDirectorContext,
    waveLootMult,
    DIRECTOR_DEFAULTS,
    THREAT_PIPS,
} from '../../js/modules/wave/difficulty-director.js';
import { PWR_REF, DEFAULT_MODE } from '../../js/modules/wave/difficulty-constants.js';

// Advance a director to a given wave (rolling each one) and return D_hp.
function dHpAtWave(seed, wave, ctx = {}) {
    const dir = createDirector({ seed, ...ctx });
    while (dir.wave < wave) tickWave(dir, {});
    return getDifficulty(dir).D_hp;
}

describe('createDirector + cold start', () => {
    test('starts at wave 1 with neutral D (NORMAL + PWR_REF) and a stored difficulty', () => {
        const dir = createDirector({ seed: 1 });
        expect(dir.wave).toBe(1);
        expect(dir.mode).toBe(DEFAULT_MODE);
        expect(dir.pwr).toBe(PWR_REF);
        const D = getDifficulty(dir);
        expect(D.D_hp).toBe(1);   // wave 1 is the flat cold-start baseline
        expect(D.D_thr).toBe(1);
        expect(dir.difficulty).toBe(1);
    });

    test('THREAT_PIPS = 5; DIRECTOR_DEFAULTS bounds are sane + frozen', () => {
        expect(THREAT_PIPS).toBe(5);
        expect(DIRECTOR_DEFAULTS.hpMin).toBe(0.6);
        expect(DIRECTOR_DEFAULTS.hpMax).toBe(3.0);
        expect(DIRECTOR_DEFAULTS.thrMin).toBe(0.6);
        expect(DIRECTOR_DEFAULTS.thrMax).toBe(1.8);
        expect(Object.isFrozen(DIRECTOR_DEFAULTS)).toBe(true);
    });
});

describe('determinism (seed)', () => {
    test('same seed ⇒ identical D_hp sequence', () => {
        const a = []; const b = [];
        const da = createDirector({ seed: 123 });
        const db = createDirector({ seed: 123 });
        for (let i = 0; i < 20; i++) { tickWave(da, {}); a.push(getDifficulty(da).D_hp); }
        for (let i = 0; i < 20; i++) { tickWave(db, {}); b.push(getDifficulty(db).D_hp); }
        expect(a).toEqual(b);
        expect(new Set(a).size).toBeGreaterThan(1); // genuinely varies wave-to-wave
    });

    test('different seeds ⇒ different sequences', () => {
        const seqFor = (seed) => {
            const dir = createDirector({ seed });
            const out = [];
            for (let i = 0; i < 12; i++) { tickWave(dir, {}); out.push(getDifficulty(dir).D_hp); }
            return out;
        };
        expect(seqFor(1)).not.toEqual(seqFor(2));
    });
});

describe('bounds + axes', () => {
    test('D_hp ∈ [0.6, 3.0] and D_thr ∈ [0.6, 1.8] across a long run', () => {
        const dir = createDirector({ seed: 55 });
        for (let i = 0; i < 120; i++) {
            tickWave(dir, {});
            const D = getDifficulty(dir);
            expect(D.D_hp).toBeGreaterThanOrEqual(0.6);
            expect(D.D_hp).toBeLessThanOrEqual(3.0);
            expect(D.D_thr).toBeGreaterThanOrEqual(0.6);
            expect(D.D_thr).toBeLessThanOrEqual(1.8);
        }
    });

    test('threat axis swings less hard than the HP axis (thrFrac < 1)', () => {
        const dir = createDirector({ seed: 9 });
        let found = false;
        for (let i = 0; i < 60 && !found; i++) {
            tickWave(dir, {});
            const D = getDifficulty(dir);
            if (D.D_hp > 1.2 && D.D_thr < 1.8) {
                expect(D.D_hp - 1).toBeGreaterThan(D.D_thr - 1);
                found = true;
            }
        }
        expect(found).toBe(true);
    });

    test('the base ramp makes deep waves harder on average than early waves', () => {
        const avg = (seed, from, to) => {
            const dir = createDirector({ seed });
            let sum = 0, n = 0;
            while (dir.wave < to) { tickWave(dir, {}); if (dir.wave >= from) { sum += getDifficulty(dir).D_hp; n++; } }
            return sum / n;
        };
        expect(avg(77, 40, 50)).toBeGreaterThan(avg(77, 2, 10));
    });
});

describe('mode + PWR scaling', () => {
    test('HARD faces higher difficulty than NORMAL; EASY lower', () => {
        const avgMode = (mode) => {
            const dir = createDirector({ seed: 5, mode });
            let sum = 0;
            for (let i = 0; i < 30; i++) { tickWave(dir, {}); sum += getDifficulty(dir).D_hp; }
            return sum / 30;
        };
        expect(avgMode('HARD')).toBeGreaterThan(avgMode('NORMAL'));
        expect(avgMode('EASY')).toBeLessThan(avgMode('NORMAL'));
    });

    test('a strong build (high PWR) pre-faces higher difficulty', () => {
        expect(dHpAtWave(5, 6, { pwr: 4 * PWR_REF })).toBeGreaterThan(dHpAtWave(5, 6, { pwr: PWR_REF }));
    });

    test('setDirectorContext re-rolls with the new pwr/mode', () => {
        const dir = createDirector({ seed: 5 });
        while (dir.wave < 6) tickWave(dir, {});
        const before = getDifficulty(dir).D_hp;
        setDirectorContext(dir, { pwr: 4 * PWR_REF });
        expect(getDifficulty(dir).D_hp).toBeGreaterThan(before); // same wave-roll, higher preload
    });
});

describe('getThreatLevel', () => {
    test('cold-start (D=1/1) maps to the centre pip (3)', () => {
        expect(getThreatLevel(createDirector({ seed: 1 }))).toBe(3);
    });
    test('always an integer in [1, 5]', () => {
        const dir = createDirector({ seed: 33 });
        for (let i = 0; i < 60; i++) {
            tickWave(dir, {});
            const p = getThreatLevel(dir);
            expect(Number.isInteger(p)).toBe(true);
            expect(p).toBeGreaterThanOrEqual(1);
            expect(p).toBeLessThanOrEqual(THREAT_PIPS);
        }
    });
});

describe('waveLootMult — hard waves pay more', () => {
    test('1.0 on the flat cold-start baseline wave', () => {
        expect(waveLootMult(createDirector({ seed: 1 }))).toBe(1);
    });

    test('≥ 1.0 always, and > 1.0 on the spike waves of a long run', () => {
        const dir = createDirector({ seed: 99 });
        let sawBonus = false;
        for (let i = 0; i < 100; i++) {
            tickWave(dir, {});
            const m = waveLootMult(dir);
            expect(m).toBeGreaterThanOrEqual(1);
            if (m > 1.2) sawBonus = true;
        }
        expect(sawBonus).toBe(true);
    });

    test('the loot bonus tracks how far ABOVE its baseline a wave rolled', () => {
        const dir = createDirector({ seed: 7 });
        let found = false;
        for (let i = 0; i < 80 && !found; i++) {
            tickWave(dir, {});
            const base = 1 + DIRECTOR_DEFAULTS.rampPerWave * (dir.wave - 1);
            if (dir.difficulty > base * 1.05) {
                expect(waveLootMult(dir)).toBeGreaterThan(1);
                found = true;
            }
        }
        expect(found).toBe(true);
    });
});

describe('lockForBoss', () => {
    test('returns a frozen copy of the current { D_hp, D_thr } that later waves do not mutate', () => {
        const dir = createDirector({ seed: 5 });
        while (dir.wave < 10) tickWave(dir, {});
        const locked = lockForBoss(dir);
        expect(Object.isFrozen(locked)).toBe(true);
        expect(locked).toEqual(getDifficulty(dir));
        const before = locked.D_hp;
        tickWave(dir, {});
        expect(locked.D_hp).toBe(before);
    });
});

describe('back-compat shims', () => {
    test('recordWave advances the wave + returns { Po, Pd }', () => {
        const dir = createDirector({ seed: 1 });
        const r = recordWave(dir, {});
        expect(dir.wave).toBe(2);
        expect(r).toEqual({ Po: 1, Pd: 1 });
    });
    test('updateDifficulty re-rolls the current wave (returns { D_hp, D_thr })', () => {
        const dir = createDirector({ seed: 1 });
        const r = updateDifficulty(dir);
        expect(r.D_hp).toBe(getDifficulty(dir).D_hp);
        expect(r.D_thr).toBe(getDifficulty(dir).D_thr);
    });
});
