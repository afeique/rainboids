/**
 * tests/unit/difficulty-director.test.js — RUN-04 Adaptive Difficulty Director
 * (Balance Model §6b/§8).
 *
 * Pure, deterministic: hand-fed wave outcomes drive Po/Pd (EMA), the two
 * decoupled axes D_hp∈[0.6,3.0] / D_thr∈[0.6,1.8], the deadband / rate-limit /
 * clamp / cold-start / cross-term / mercy / escalation rules, getThreatLevel
 * (1..5 pip) and lockForBoss.
 */

import { describe, expect, test } from '@jest/globals';
import {
    createDirector,
    recordWave,
    updateDifficulty,
    tickWave,
    getDifficulty,
    getThreatLevel,
    lockForBoss,
    DIRECTOR_DEFAULTS,
    THREAT_PIPS,
} from '../../js/modules/wave/difficulty-director.js';

// ── outcome factories ────────────────────────────────────────────────
// On-design (neutral): every ratio = 1 ⇒ raw Po = Pd = 1.
function neutralOutcome(extra = {}) {
    return {
        dpsOnTarget: 100, expectedDps: 100,
        actualClearTime: 35, targetClearTime: 35,
        hpRetainedFrac: 0.6, expectedHpRetainedFrac: 0.6,
        hitsSurvived: 5, expectedHits: 5,
        deaths: 0, clearedFullHp: false,
        ...extra,
    };
}

// Strong offense: high DPS + fast clear ⇒ raw Po well above 1, Pd neutral.
function strongOffense(extra = {}) {
    return neutralOutcome({
        dpsOnTarget: 300, expectedDps: 100,   // 3× DPS
        actualClearTime: 12, targetClearTime: 35, // cleared way under target
        ...extra,
    });
}

// Strong defense (pure tank): high HP retained + survives many hits, Po neutral.
function strongDefense(extra = {}) {
    return neutralOutcome({
        hpRetainedFrac: 0.95, expectedHpRetainedFrac: 0.6, // barely chipped
        hitsSurvived: 20, expectedHits: 5,                 // soaks tons
        ...extra,
    });
}

// Weak everywhere: low DPS, slow clear, took heavy punishment.
function weakOutcome(extra = {}) {
    return neutralOutcome({
        dpsOnTarget: 20, expectedDps: 100,
        actualClearTime: 90, targetClearTime: 35,
        hpRetainedFrac: 0.1, expectedHpRetainedFrac: 0.6,
        hitsSurvived: 1, expectedHits: 5,
        ...extra,
    });
}

// God build: strong on BOTH axes (unlocks the cross-term threat ceiling).
function godOutcome(extra = {}) {
    return neutralOutcome({
        dpsOnTarget: 350, expectedDps: 100,
        actualClearTime: 10, targetClearTime: 35,
        hpRetainedFrac: 0.98, expectedHpRetainedFrac: 0.6,
        hitsSurvived: 18, expectedHits: 5,
        ...extra,
    });
}

// Drive N waves of the same outcome through the full per-wave cycle.
function runWaves(state, outcome, n) {
    for (let i = 0; i < n; i++) tickWave(state, typeof outcome === 'function' ? outcome() : outcome);
    return state;
}

describe('createDirector + constants', () => {
    test('starts neutral: D_hp=D_thr=Po=Pd=1, wave=0', () => {
        const s = createDirector();
        expect(s.D_hp).toBe(1);
        expect(s.D_thr).toBe(1);
        expect(s.Po).toBe(1);
        expect(s.Pd).toBe(1);
        expect(s.wave).toBe(0);
    });

    test('DIRECTOR_DEFAULTS exposes the §8 bounds + tuning', () => {
        expect(DIRECTOR_DEFAULTS.hpMin).toBe(0.6);
        expect(DIRECTOR_DEFAULTS.hpMax).toBe(3.0);
        expect(DIRECTOR_DEFAULTS.thrMin).toBe(0.6);
        expect(DIRECTOR_DEFAULTS.thrMax).toBe(1.8);
        expect(DIRECTOR_DEFAULTS.alpha).toBeCloseTo(0.4);
        expect(DIRECTOR_DEFAULTS.deadband).toBeCloseTo(0.12);
        expect(DIRECTOR_DEFAULTS.maxStep).toBeCloseTo(0.12);
        expect(DIRECTOR_DEFAULTS.hpExp).toBeCloseTo(0.5);
        expect(DIRECTOR_DEFAULTS.thrExp).toBeCloseTo(0.4);
        expect(DIRECTOR_DEFAULTS.crossTerm).toBeCloseTo(1.3);
        expect(THREAT_PIPS).toBe(5);
    });

    test('opts override bounds/alpha (for tests)', () => {
        const s = createDirector({ hpMax: 5, alpha: 0.9 });
        expect(s.cfg.hpMax).toBe(5);
        expect(s.cfg.alpha).toBe(0.9);
    });
});

describe('recordWave — Po/Pd estimates + EMA', () => {
    test('neutral outcome keeps Po/Pd at 1', () => {
        const s = createDirector();
        const { Po, Pd } = recordWave(s, neutralOutcome());
        expect(Po).toBeCloseTo(1);
        expect(Pd).toBeCloseTo(1);
        expect(s.wave).toBe(1);
    });

    test('strong offense pushes Po above 1, leaves Pd near 1', () => {
        const s = createDirector();
        const { Po, Pd } = recordWave(s, strongOffense());
        expect(Po).toBeGreaterThan(1);
        expect(Pd).toBeCloseTo(1);
    });

    test('EMA smooths: one strong wave moves Po by ~alpha of the raw gap', () => {
        const s = createDirector();
        // raw Po for strongOffense = 0.6*3 + 0.4*(35/12) ≈ 1.8 + 1.1667 = 2.9667
        recordWave(s, strongOffense());
        // EMA: 0.6*1 + 0.4*2.9667 ≈ 1.7867
        expect(s.Po).toBeCloseTo(0.6 * 1 + 0.4 * (0.6 * 3 + 0.4 * (35 / 12)), 4);
    });

    test('divide-by-zero guards fall back to neutral ratios', () => {
        const s = createDirector();
        const { Po, Pd } = recordWave(s, {
            dpsOnTarget: 100, expectedDps: 0,        // den 0 ⇒ ratio 1
            actualClearTime: 0, targetClearTime: 35, // actual 0 ⇒ speed ratio 1
            hpRetainedFrac: 0.6, expectedHpRetainedFrac: 0,
            hitsSurvived: 5, expectedHits: 0,
        });
        expect(Po).toBeCloseTo(1);
        expect(Pd).toBeCloseTo(1);
    });
});

describe('cold start (waves 1–2 hold D=1.0)', () => {
    test('strong over-performance on waves 1–2 leaves D at 1.0; adapts wave 3', () => {
        const s = createDirector();
        tickWave(s, strongOffense());
        expect(getDifficulty(s)).toEqual({ D_hp: 1, D_thr: 1 });
        tickWave(s, strongOffense());
        expect(getDifficulty(s)).toEqual({ D_hp: 1, D_thr: 1 });
        // wave 3 — adaptation begins, D_hp must move off 1.0
        tickWave(s, strongOffense());
        expect(s.wave).toBe(3);
        expect(s.D_hp).toBeGreaterThan(1);
    });
});

describe('D_hp controller (offense outlet)', () => {
    test('sustained over-performing offense raises D_hp and clamps at 3.0', () => {
        const s = createDirector();
        runWaves(s, strongOffense, 60);
        expect(s.D_hp).toBeCloseTo(3.0, 5);
        expect(s.D_hp).toBeLessThanOrEqual(3.0);
    });

    test('deadband: a small Po deviation (≤12%) leaves D_hp unchanged', () => {
        const s = createDirector();
        // get past cold start with neutral waves
        tickWave(s, neutralOutcome());
        tickWave(s, neutralOutcome());
        // tiny over-performance: ~5% DPS bump, on-time clear ⇒ raw Po ≈ 1.03
        const small = neutralOutcome({ dpsOnTarget: 105, expectedDps: 100 });
        const before = s.D_hp;
        tickWave(s, small);
        expect(Math.abs(s.Po - 1)).toBeLessThanOrEqual(DIRECTOR_DEFAULTS.deadband);
        expect(s.D_hp).toBeCloseTo(before, 6);
    });

    test('per-wave rate limit: one extreme wave moves D_hp by ≤ ~12%', () => {
        const s = createDirector();
        tickWave(s, neutralOutcome());
        tickWave(s, neutralOutcome()); // exit cold start at D_hp=1
        const before = s.D_hp;
        tickWave(s, strongOffense()); // extreme single wave
        const moved = Math.abs(s.D_hp - before) / before;
        expect(moved).toBeLessThanOrEqual(DIRECTOR_DEFAULTS.maxStep + 1e-9);
    });

    test('sustained weak play floors D_hp at 0.6', () => {
        const s = createDirector();
        runWaves(s, weakOutcome, 60);
        expect(s.D_hp).toBeCloseTo(0.6, 5);
        expect(s.D_hp).toBeGreaterThanOrEqual(0.6);
    });
});

describe('cross-term (true-mastery gate on D_thr)', () => {
    test('high Po but Pd≈1 keeps D_thr capped ≤ 1.4 over many waves', () => {
        const s = createDirector();
        runWaves(s, strongOffense, 80);
        expect(s.D_thr).toBeLessThanOrEqual(1.4 + 1e-9);
    });

    test('god build (Po>1.3 AND Pd>1.3) lets D_thr climb above 1.4 toward 1.8', () => {
        const s = createDirector();
        runWaves(s, godOutcome, 80);
        expect(s.Po).toBeGreaterThan(1.3);
        expect(s.Pd).toBeGreaterThan(1.3);
        expect(s.D_thr).toBeGreaterThan(1.4);
        expect(s.D_thr).toBeLessThanOrEqual(1.8 + 1e-9);
    });

    test('sustained god play caps D_hp at 3.0 and D_thr at 1.8', () => {
        const s = createDirector();
        runWaves(s, godOutcome, 100);
        expect(s.D_hp).toBeCloseTo(3.0, 5);
        expect(s.D_thr).toBeCloseTo(1.8, 5);
    });
});

describe('glass-nuke profile (Po high, Pd low / deaths>0)', () => {
    test('D_hp rises but D_thr does NOT rise (mercy)', () => {
        const s = createDirector();
        // high offense, fragile + dying: Po high, Pd low, deaths>0
        const glass = strongOffense({
            hpRetainedFrac: 0.05, expectedHpRetainedFrac: 0.6,
            hitsSurvived: 1, expectedHits: 5,
            deaths: 1,
        });
        runWaves(s, () => glass, 40);
        expect(s.D_hp).toBeGreaterThan(1.2);     // offense outlet opens up
        expect(s.D_thr).toBeLessThanOrEqual(1.0); // threat never raised (mercy floors it down)
    });

    test('mercy never raises D_thr on a death wave', () => {
        const s = createDirector();
        tickWave(s, neutralOutcome());
        tickWave(s, neutralOutcome());
        const before = s.D_thr;
        tickWave(s, neutralOutcome({ deaths: 2 }));
        expect(s.D_thr).toBeLessThanOrEqual(before);
    });
});

describe('pure-tank profile (Po low, Pd very high)', () => {
    test('D_thr rises toward ceiling; D_hp falls toward floor', () => {
        const s = createDirector();
        // low offense (slow clears, low DPS) but soaks everything
        const tank = strongDefense({
            dpsOnTarget: 40, expectedDps: 100,
            actualClearTime: 70, targetClearTime: 35,
        });
        runWaves(s, () => tank, 60);
        expect(s.D_thr).toBeGreaterThan(1.0);   // threat ramps up
        expect(s.D_hp).toBeLessThan(1.0);       // not drowned in trash it one-shots
    });
});

describe('mercy band easing', () => {
    test('a god build that suddenly dies eases D_thr down next wave', () => {
        const s = createDirector();
        runWaves(s, godOutcome, 60); // D_thr climbed high
        const high = s.D_thr;
        expect(high).toBeGreaterThan(1.4);
        // now a death wave (still strong otherwise) — mercy must ease threat
        tickWave(s, godOutcome({ deaths: 1 }));
        expect(s.D_thr).toBeLessThan(high);
    });
});

describe('escalation band', () => {
    test('full-HP clear in <60% target time bumps D_hp', () => {
        const s = createDirector();
        tickWave(s, neutralOutcome());
        tickWave(s, neutralOutcome()); // exit cold start
        const before = s.D_hp;
        // cleared at full HP, well under 60% of target time, but DPS only modest
        // so Po sits inside the deadband — the bump must come from escalation.
        tickWave(s, neutralOutcome({
            dpsOnTarget: 100, expectedDps: 100,
            actualClearTime: 15, targetClearTime: 35, // 0.43 < 0.6
            clearedFullHp: true,
        }));
        expect(s.D_hp).toBeGreaterThan(before);
    });
});

describe('getThreatLevel (CD-16 1..5 pip)', () => {
    test('returns an integer in [1,5]', () => {
        const s = createDirector();
        const pip = getThreatLevel(s);
        expect(Number.isInteger(pip)).toBe(true);
        expect(pip).toBeGreaterThanOrEqual(1);
        expect(pip).toBeLessThanOrEqual(5);
    });

    test('cold-start neutral (D=1/1) ≈ pip 3', () => {
        const s = createDirector();
        expect(getThreatLevel(s)).toBe(3);
    });

    test('rises with combined D and saturates at 5 for god play', () => {
        const lo = createDirector();
        runWaves(lo, weakOutcome, 60);
        const hi = createDirector();
        runWaves(hi, godOutcome, 100);
        expect(getThreatLevel(lo)).toBeLessThan(getThreatLevel(createDirector()));
        expect(getThreatLevel(hi)).toBe(5);
        expect(getThreatLevel(hi)).toBeGreaterThan(getThreatLevel(lo));
    });

    test('monotonic-ish: more combined pressure never lowers the pip', () => {
        const neutral = getThreatLevel(createDirector());
        const god = createDirector();
        runWaves(god, godOutcome, 100);
        expect(getThreatLevel(god)).toBeGreaterThanOrEqual(neutral);
    });
});

// ── FIX-01: NET per-wave rate limit (no compounding across blocks) ──────────
// The rate limit must bound the NET wave-over-wave change of each axis, applied
// ONCE — not separately per block. Stacked effects (deadband exponent-step +
// escalation stomp + cross-term cap + mercy ease) firing in the same wave must
// never compound past ±maxStep of the axis's pre-call value.
describe('net per-wave rate limit (FIX-01 — no compounding)', () => {
    const MS = DIRECTOR_DEFAULTS.maxStep;
    const EPS = 1e-9;
    const netMove = (before, after) => Math.abs(after - before) / before;

    // Helper: get a director past cold-start sitting at a known entry state.
    function pastColdStart() {
        const s = createDirector();
        tickWave(s, neutralOutcome());
        tickWave(s, neutralOutcome()); // wave 2: still D=1/1, cold start over
        return s;
    }

    test('deadband-only over-perform: |ΔD_hp| ≤ maxStep', () => {
        const s = pastColdStart();
        const before = s.D_hp;
        tickWave(s, strongOffense()); // pure offense, no stomp flag, no mercy
        expect(netMove(before, s.D_hp)).toBeLessThanOrEqual(MS + EPS);
    });

    test('deadband + escalation stomp: net D_hp move ≤ maxStep (the bug)', () => {
        const s = pastColdStart();
        const before = s.D_hp;
        // strongOffense drives Po>1 (deadband block bumps D_hp up) AND it clears
        // at full HP well under 60% target time (escalation stomp also bumps).
        // Previously these compounded to ~+25%; must now stay ≤ +12%.
        tickWave(s, strongOffense({ clearedFullHp: true }));
        expect(s.Po).toBeGreaterThan(1);                 // deadband block fired
        expect(s.clearedFullHp).toBe(true);               // escalation fired
        expect(s.clearTimeFrac).toBeLessThan(DIRECTOR_DEFAULTS.escalationTimeFrac);
        expect(netMove(before, s.D_hp)).toBeLessThanOrEqual(MS + EPS);
    });

    test('deadband + mercy: net D_thr move ≤ maxStep AND D_thr did not rise', () => {
        // First climb D_thr above neutral with a pure-tank profile (Pd high),
        // then hit a wave that's still tanky (deadband would push D_thr UP) but
        // ALSO has deaths>0 (mercy must ease DOWN). Net move bounded; no rise.
        const s = createDirector();
        const tank = strongDefense({
            dpsOnTarget: 40, expectedDps: 100,
            actualClearTime: 70, targetClearTime: 35,
        });
        runWaves(s, () => tank, 20);
        const before = s.D_thr;
        expect(before).toBeGreaterThan(1.0); // threat climbed; mercy has room to ease
        // tanky again (Pd>1 ⇒ deadband would raise) but a death triggers mercy
        tickWave(s, strongDefense({
            dpsOnTarget: 40, expectedDps: 100,
            actualClearTime: 70, targetClearTime: 35,
            deaths: 1,
        }));
        expect(netMove(before, s.D_thr)).toBeLessThanOrEqual(MS + EPS);
        expect(s.D_thr).toBeLessThanOrEqual(before); // mercy never raises D_thr
    });

    test('stomp + cross-term (god build): both axes net move ≤ maxStep', () => {
        const s = createDirector();
        runWaves(s, godOutcome, 30); // Po,Pd>1.3 ⇒ cross-term unlocked, climbing
        const beforeHp = s.D_hp;
        const beforeThr = s.D_thr;
        // god wave that also stomps (full HP, fast clear): deadband + escalation
        // (both axes, since Pd>crossTerm) + cross-term all push at once.
        tickWave(s, godOutcome({ clearedFullHp: true }));
        expect(netMove(beforeHp, s.D_hp)).toBeLessThanOrEqual(MS + EPS);
        expect(netMove(beforeThr, s.D_thr)).toBeLessThanOrEqual(MS + EPS);
    });

    test('multi-wave run: no single update moves an axis > maxStep from its pre-value', () => {
        const profiles = [
            strongOffense, godOutcome, weakOutcome, strongDefense, neutralOutcome,
        ];
        const s = createDirector();
        for (let w = 0; w < 120; w++) {
            // rotate through profiles + occasionally fire stomp/mercy together
            const base = profiles[w % profiles.length]();
            const extra = {};
            if (w % 5 === 0) extra.clearedFullHp = true, extra.actualClearTime = 8, extra.targetClearTime = 35;
            if (w % 7 === 0) extra.deaths = 1;
            recordWave(s, { ...base, ...extra });
            const beforeHp = s.D_hp;
            const beforeThr = s.D_thr;
            updateDifficulty(s);
            // cold-start waves snap to 1.0 (can legitimately move > maxStep from
            // a non-1 pre-value), so only assert once adapting.
            if (s.wave > s.cfg.coldStartWaves) {
                expect(netMove(beforeHp, s.D_hp)).toBeLessThanOrEqual(MS + EPS);
                expect(netMove(beforeThr, s.D_thr)).toBeLessThanOrEqual(MS + EPS);
            }
        }
    });
});

describe('lockForBoss (frozen snapshot)', () => {
    test('returns the current D snapshot', () => {
        const s = createDirector();
        runWaves(s, godOutcome, 40);
        const lock = lockForBoss(s);
        expect(lock.D_hp).toBe(s.D_hp);
        expect(lock.D_thr).toBe(s.D_thr);
    });

    test('snapshot is NOT mutated by subsequent recordWave/updateDifficulty', () => {
        const s = createDirector();
        runWaves(s, godOutcome, 40);
        const lock = lockForBoss(s);
        const lockedHp = lock.D_hp;
        const lockedThr = lock.D_thr;
        // keep playing — director keeps moving
        runWaves(s, weakOutcome, 20);
        expect(lock.D_hp).toBe(lockedHp);
        expect(lock.D_thr).toBe(lockedThr);
        // and the frozen object can't be written to
        expect(() => { 'use strict'; lock.D_hp = 999; }).toThrow();
    });
});
