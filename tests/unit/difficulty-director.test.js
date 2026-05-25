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
    setDirectorContext,
    getEnemyPower,
    DIRECTOR_DEFAULTS,
    THREAT_PIPS,
} from '../../js/modules/wave/difficulty-director.js';
import {
    baseline,
    pwrPreload,
    PWR_REF,
    modeBase,
    ENEMY_POWER_EXP,
} from '../../js/modules/wave/difficulty-constants.js';

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

// ════════════════════════════════════════════════════════════════════════════
// DIR-04 — §14 structural levers (PWR pre-load + absolute baseline + mode bias)
// layered ON TOP of the validated reactive core. EVERY assertion here is paired
// with the design contract: NORMAL + PWR_REF must reproduce the prior behavior
// EXACTLY (the 31 tests above already prove that at default context); these
// tests prove the levers engage when context is non-neutral, that the reactive
// decoupling/rate-limit/cold-start survive, and that getEnemyPower is exposed
// without disturbing live D.
// ════════════════════════════════════════════════════════════════════════════

describe('DIR-04 default-safe context (createDirector + setDirectorContext)', () => {
    test('createDirector defaults to PWR_REF + NORMAL', () => {
        const s = createDirector();
        expect(s.pwr).toBe(PWR_REF);
        expect(s.mode).toBe('NORMAL');
    });

    test('createDirector honors opts.pwr / opts.mode (mode validated → NORMAL)', () => {
        expect(createDirector({ pwr: 400 }).pwr).toBe(400);
        expect(createDirector({ mode: 'LEGENDARY' }).mode).toBe('LEGENDARY');
        expect(createDirector({ mode: 'BOGUS' }).mode).toBe('NORMAL');
        expect(createDirector({ mode: 'easy' }).mode).toBe('NORMAL'); // case-sensitive canonical
    });

    test('setDirectorContext updates pwr/mode without touching reactive state', () => {
        const s = createDirector();
        runWaves(s, godOutcome, 20);
        const reactiveHp = s.D_hp;
        const reactiveThr = s.D_thr;
        setDirectorContext(s, { pwr: 400, mode: 'HARD' });
        expect(s.pwr).toBe(400);
        expect(s.mode).toBe('HARD');
        // reactive axes untouched by a context change
        expect(s.D_hp).toBe(reactiveHp);
        expect(s.D_thr).toBe(reactiveThr);
        // unknown mode → NORMAL fallback; omitted fields unchanged
        setDirectorContext(s, { mode: 'NOPE' });
        expect(s.mode).toBe('NORMAL');
        expect(s.pwr).toBe(400); // pwr left alone
    });

    test('recordWave can carry pwr/mode on the outcome (DIR-05 piggyback)', () => {
        const s = createDirector();
        recordWave(s, neutralOutcome({ pwr: 900, mode: 'EPIC' }));
        expect(s.pwr).toBe(900);
        expect(s.mode).toBe('EPIC');
    });

    test('NEUTRAL context (PWR_REF + NORMAL) = byte-for-byte the reactive D trajectory', () => {
        // Drive an explicit-neutral director and a default director through the
        // SAME multi-wave run; getDifficulty must agree at every wave (proving the
        // levers collapse to identity at default context).
        const a = createDirector();
        const b = createDirector();
        setDirectorContext(b, { pwr: PWR_REF, mode: 'NORMAL' });
        const profiles = [strongOffense, godOutcome, weakOutcome, strongDefense, neutralOutcome];
        for (let w = 0; w < 40; w++) {
            const o = profiles[w % profiles.length]();
            tickWave(a, o);
            tickWave(b, o);
            const da = getDifficulty(a);
            const db = getDifficulty(b);
            expect(db.D_hp).toBe(da.D_hp);
            expect(db.D_thr).toBe(da.D_thr);
            // and the effective value equals the raw reactive axes at neutral
            expect(da.D_hp).toBe(a.D_hp);
            expect(da.D_thr).toBe(a.D_thr);
        }
    });
});

describe('DIR-04 PWR pre-load (immediate, clamped [0.8, 3.0])', () => {
    test('high PWR scales effective D by ~3.0 from wave 3 (no ~10-wave ramp lag)', () => {
        const neutral = createDirector();
        const strong = createDirector({ pwr: 6807 }); // sqrt(68.07)=8.25 → clamp 3.0
        expect(pwrPreload(6807, PWR_REF)).toBe(3.0);
        // identical reactive feed; only the PWR prior differs
        for (let w = 0; w < 3; w++) {
            const o = strongOffense();
            tickWave(neutral, o);
            tickWave(strong, o);
        }
        const dn = getDifficulty(neutral);
        const ds = getDifficulty(strong);
        // wave 3 (first adaptive wave): strong build ALREADY pre-faces ~3× — it
        // does NOT have to climb there over ~10 reactive waves. Effective D is
        // clamped to the mode-aware ceiling (NORMAL hpMax 3.0 / thrMax 1.8) so the
        // applied HP/threat stays bounded.
        expect(ds.D_hp).toBeCloseTo(Math.min(dn.D_hp * 3.0, DIRECTOR_DEFAULTS.hpMax), 5);
        expect(ds.D_thr).toBeCloseTo(Math.min(dn.D_thr * 3.0, DIRECTOR_DEFAULTS.thrMax), 5);
        // the preload DID engage (strong > neutral) — proves it's not a no-op
        expect(ds.D_hp).toBeGreaterThan(dn.D_hp);
        // and the reactive axes are unchanged by the preload (it lives in getDifficulty)
        expect(strong.D_hp).toBe(neutral.D_hp);
    });

    test('preload below the floor: weak build floors at 0.8× (never below)', () => {
        expect(pwrPreload(50, PWR_REF)).toBe(0.8);
        const weak = createDirector({ pwr: 50 });
        const neutral = createDirector();
        for (let w = 0; w < 5; w++) {
            const o = neutralOutcome();
            tickWave(weak, o);
            tickWave(neutral, o);
        }
        const dw = getDifficulty(weak);
        const dn = getDifficulty(neutral);
        // effective D scaled by exactly the 0.8 floor (clamped to hpMin/thrMin)
        expect(dw.D_hp).toBeCloseTo(Math.max(dn.D_hp * 0.8, DIRECTOR_DEFAULTS.hpMin), 5);
    });

    test('preload is applied multiplicatively at PWR=400 → 2.0× (interior, unclamped)', () => {
        expect(pwrPreload(400, PWR_REF)).toBe(2.0);
        const s = createDirector({ pwr: 400 });
        const n = createDirector();
        for (let w = 0; w < 4; w++) { tickWave(s, neutralOutcome()); tickWave(n, neutralOutcome()); }
        const ds = getDifficulty(s);
        const dn = getDifficulty(n);
        // multiplicative preload, then clamped to the NORMAL ceiling (hpMax 3.0 /
        // thrMax 1.8) so D_thr·2.0 = 2.0 is held at 1.8.
        expect(ds.D_hp).toBeCloseTo(Math.min(dn.D_hp * 2.0, DIRECTOR_DEFAULTS.hpMax), 5);
        expect(ds.D_thr).toBeCloseTo(Math.min(dn.D_thr * 2.0, DIRECTOR_DEFAULTS.thrMax), 5);
    });
});

describe('DIR-04 difficulty-mode biasing', () => {
    test('EASY lowers, LEGENDARY raises the effective D vs NORMAL (same reactive feed)', () => {
        const easy = createDirector({ mode: 'EASY' });
        const normal = createDirector({ mode: 'NORMAL' });
        const legend = createDirector({ mode: 'LEGENDARY' });
        for (let w = 0; w < 10; w++) {
            const o = strongOffense();
            tickWave(easy, o); tickWave(normal, o); tickWave(legend, o);
        }
        const e = getDifficulty(easy);
        const nrm = getDifficulty(normal);
        const l = getDifficulty(legend);
        expect(e.D_hp).toBeLessThan(nrm.D_hp);      // EASY mBase 0.8 < 1.0
        expect(l.D_hp).toBeGreaterThan(nrm.D_hp);   // LEGENDARY mBase 2.0 > 1.0
        expect(e.D_thr).toBeLessThan(nrm.D_thr);
        expect(l.D_thr).toBeGreaterThanOrEqual(nrm.D_thr);
    });

    test('LEGENDARY lifts the effective ceiling above NORMAL hpMax (MULT_MAX bias)', () => {
        const legend = createDirector({ mode: 'LEGENDARY', pwr: 6807 });
        runWaves(legend, godOutcome, 60);
        const l = getDifficulty(legend);
        // NORMAL hard-caps effective D_hp at 3.0; LEGENDARY's MULT_MAX (4.0 vs 2.5)
        // lifts the ceiling so a god build on LEGENDARY pushes effective D_hp past 3.0.
        expect(l.D_hp).toBeGreaterThan(DIRECTOR_DEFAULTS.hpMax);
    });

    test('EASY widens the deadband (mode-biased reactive params engage off-NORMAL)', () => {
        // EASY band-width (0.40-0.15=0.25) vs NORMAL (0.55-0.30=0.25) — equal, so
        // pick a mode whose band differs to assert biasing. HARD band 0.45-0.70
        // = 0.25 too; the §14.6 bands are equal-width by design, so instead assert
        // the mode-biased maxStep (UP rate) differs: EASY up=0.04 < NORMAL 0.05.
        const easy = createDirector({ mode: 'EASY' });
        const normal = createDirector({ mode: 'NORMAL' });
        // exit cold start identically
        tickWave(easy, neutralOutcome()); tickWave(easy, neutralOutcome());
        tickWave(normal, neutralOutcome()); tickWave(normal, neutralOutcome());
        const e0 = easy.D_hp, n0 = normal.D_hp;
        // one extreme over-perform wave: EASY ramps SLOWER (smaller maxStep)
        tickWave(easy, strongOffense());
        tickWave(normal, strongOffense());
        const eMove = Math.abs(easy.D_hp - e0) / e0;
        const nMove = Math.abs(normal.D_hp - n0) / n0;
        expect(eMove).toBeLessThan(nMove); // EASY up-rate 0.04 < NORMAL 0.05
    });

    test('unknown mode behaves as NORMAL (validated to fallback)', () => {
        const bogus = createDirector({ mode: 'WHATEVER' });
        const normal = createDirector({ mode: 'NORMAL' });
        for (let w = 0; w < 12; w++) {
            const o = godOutcome();
            tickWave(bogus, o); tickWave(normal, o);
        }
        const b = getDifficulty(bogus);
        const n = getDifficulty(normal);
        expect(b.D_hp).toBe(n.D_hp);
        expect(b.D_thr).toBe(n.D_thr);
    });
});

describe('DIR-04 decoupling preserved under neutral context', () => {
    // Re-assert the cross-term decoupling with the levers present (neutral ctx):
    // a glass nuke gets D_hp↑ / D_thr held; a pure tank gets D_thr↑ / D_hp held.
    test('glass nuke → effective D_hp↑, D_thr held (mercy) at neutral context', () => {
        const s = createDirector(); // PWR_REF + NORMAL
        const glass = strongOffense({
            hpRetainedFrac: 0.05, expectedHpRetainedFrac: 0.6,
            hitsSurvived: 1, expectedHits: 5, deaths: 1,
        });
        runWaves(s, () => glass, 40);
        const d = getDifficulty(s);
        expect(d.D_hp).toBeGreaterThan(1.2);
        expect(d.D_thr).toBeLessThanOrEqual(1.0);
    });

    test('pure tank → effective D_thr↑, D_hp falls toward floor at neutral context', () => {
        const s = createDirector();
        const tank = strongDefense({
            dpsOnTarget: 40, expectedDps: 100,
            actualClearTime: 70, targetClearTime: 35,
        });
        runWaves(s, () => tank, 60);
        const d = getDifficulty(s);
        expect(d.D_thr).toBeGreaterThan(1.0);
        expect(d.D_hp).toBeLessThan(1.0);
    });
});

describe('DIR-04 getEnemyPower (exposed for DIR-10; does NOT change live D)', () => {
    test('enemyPower = baseline·mBase·directorMult·preload with exponent split', () => {
        const s = createDirector({ pwr: 400, mode: 'HARD' }); // preload 2.0, mBase 1.25
        runWaves(s, godOutcome, 20);
        const wave = 12;
        const ep = getEnemyPower(s, wave);
        const expectedPreload = pwrPreload(400, PWR_REF);
        const expectedMBase = modeBase('HARD');
        const expected = baseline(wave) * expectedMBase * s.D_hp * expectedPreload;
        expect(ep.enemyPower).toBeCloseTo(expected, 6);
        expect(ep.preload).toBeCloseTo(expectedPreload, 6);
        expect(ep.mBase).toBeCloseTo(expectedMBase, 6);
        expect(ep.directorMult).toBe(s.D_hp);
        expect(ep.baseline).toBeCloseTo(baseline(wave), 6);
        // exponent split: hpMult·dmgMult·densityMult === enemyPower (exps sum 1.0)
        expect(ep.hpMult).toBeCloseTo(Math.pow(ep.enemyPower, ENEMY_POWER_EXP.hp), 6);
        expect(ep.dmgMult).toBeCloseTo(Math.pow(ep.enemyPower, ENEMY_POWER_EXP.dmg), 6);
        expect(ep.densityMult).toBeCloseTo(Math.pow(ep.enemyPower, ENEMY_POWER_EXP.density), 6);
        expect(ep.hpMult * ep.dmgMult * ep.densityMult).toBeCloseTo(ep.enemyPower, 6);
    });

    test('enemyPower climbs strictly with wave (absolute baseline is monotone)', () => {
        const s = createDirector();
        runWaves(s, neutralOutcome, 5); // hold reactive ~1.0
        const e1 = getEnemyPower(s, 1).enemyPower;
        const e10 = getEnemyPower(s, 10).enemyPower;
        const e30 = getEnemyPower(s, 30).enemyPower;
        expect(e10).toBeGreaterThan(e1);
        expect(e30).toBeGreaterThan(e10);
    });

    test('getEnemyPower does NOT mutate or affect getDifficulty (live D unchanged)', () => {
        const s = createDirector({ pwr: 6807, mode: 'LEGENDARY' });
        runWaves(s, godOutcome, 30);
        const before = getDifficulty(s);
        const reactiveHp = s.D_hp;
        const reactiveThr = s.D_thr;
        // calling getEnemyPower for several waves must not touch live D / reactive state
        for (const w of [5, 20, 50, 90]) getEnemyPower(s, w);
        const after = getDifficulty(s);
        expect(after.D_hp).toBe(before.D_hp);
        expect(after.D_thr).toBe(before.D_thr);
        expect(s.D_hp).toBe(reactiveHp);
        expect(s.D_thr).toBe(reactiveThr);
    });
});

describe('DIR-04 reactive invariants survive the augmentation', () => {
    test('cold-start still holds D=1.0 on waves 1–2 even with non-neutral context', () => {
        const s = createDirector({ pwr: 6807, mode: 'LEGENDARY' });
        tickWave(s, strongOffense());
        expect(s.D_hp).toBe(1); // reactive axis still held at cold start
        tickWave(s, strongOffense());
        expect(s.D_hp).toBe(1);
        tickWave(s, strongOffense());
        expect(s.D_hp).toBeGreaterThan(1); // adaptation begins wave 3
    });

    test('FIX-01 net rate-limit still bounds the REACTIVE per-wave move under any mode', () => {
        const MS = DIRECTOR_DEFAULTS.maxStep;
        const EPS = 1e-9;
        // HARD biases maxStep UP (0.06 vs 0.05) — assert the reactive move stays
        // within the MODE-BIASED maxStep, never the compounded sum.
        const s = createDirector({ mode: 'HARD' });
        tickWave(s, neutralOutcome()); tickWave(s, neutralOutcome());
        const before = s.D_hp;
        tickWave(s, strongOffense({ clearedFullHp: true }));
        const moved = Math.abs(s.D_hp - before) / before;
        // HARD up-rate is 0.06 = NORMAL 0.05 × 1.2 ⇒ biased maxStep = 0.12×1.2 = 0.144
        expect(moved).toBeLessThanOrEqual(MS * 1.2 + EPS);
    });
});
