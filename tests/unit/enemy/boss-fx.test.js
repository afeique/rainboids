// BOSS-03 — Boss intro / death canvas FX.
//
// Pins the PURE compute helpers in boss-fx.js (computeNameCard,
// computeDetonation, bossFxCameraShake) with NO canvas. Each helper reads the
// shipped boss-intro sequence state, so we set up a real sequence on a stub
// boss via the boss-intro init/update API (mirroring boss-intro.test.js's
// stub + explicit-`now` style) rather than hand-rolling the internal state.

import { describe, expect, test } from '@jest/globals';
import {
    initBossIntro,
    updateBossIntro,
    initBossDeath,
    updateBossDeath,
    INTRO_KEY,
    DEATH_KEY,
} from '../../../js/modules/enemy/boss-intro.js';
import {
    computeNameCard,
    computeDetonation,
    bossFxCameraShake,
    introFxActive,
    deathFxActive,
} from '../../../js/modules/enemy/boss-fx.js';

const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    name: 'THE HARBINGER', element: 'KINETIC', x: 0, y: 0, size: 96, ...over,
});

// Intro: warp-in (1400) → name-card (2000) → fight-start (instant). Mirrors the
// real boss intro scripts (harbinger.js buildIntroScript).
function introScript() {
    return [
        { id: 'warp-in', name: 'Warp-In', durationMs: 1400 },
        { id: 'name-card', name: 'THE HARBINGER', durationMs: 2000 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}
// Death: bolts-blow (900) → core-crack (1100) → supernova (1200) → victory (0).
function deathScript() {
    return [
        { id: 'bolts-blow', name: 'Bolt-Heads Detonate', durationMs: 900 },
        { id: 'core-crack', name: 'Core Cracks', durationMs: 1100 },
        { id: 'supernova', name: 'Supernova', durationMs: 1200 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// name-card beat spans [1400, 3400); midpoint = 2400.
const CARD_START = 1400;
const CARD_MID = 2400;
const CARD_END = 3400;

describe('computeNameCard (pure) — sweep phase / alpha', () => {
    test('inactive when no intro sequence exists', () => {
        const b = stubBoss();
        const c = computeNameCard(b, 0);
        expect(c.active).toBe(false);
        expect(c.alpha).toBe(0);
    });

    test('inactive during the warp-in beat (before the name-card)', () => {
        const b = stubBoss();
        initBossIntro(b, introScript(), null, 0);
        updateBossIntro(b, null, 500); // still in warp-in
        const c = computeNameCard(b, 500);
        expect(c.active).toBe(false);
    });

    test('at card start: sweeping IN, low alpha, offset from the left', () => {
        const b = stubBoss();
        initBossIntro(b, introScript(), null, 0);
        updateBossIntro(b, null, CARD_START); // enter name-card beat
        const c = computeNameCard(b, CARD_START);
        expect(c.active).toBe(true);
        expect(c.phase).toBe('in');
        expect(c.alpha).toBeCloseTo(0, 5);   // progress 0 → alpha 0
        expect(c.offset).toBeCloseTo(-1, 5); // fully off to the left
        expect(c.name).toBe('THE HARBINGER');
    });

    test('at card midpoint: HOLDING, full alpha, centered', () => {
        const b = stubBoss();
        initBossIntro(b, introScript(), null, 0);
        updateBossIntro(b, null, CARD_MID);
        const c = computeNameCard(b, CARD_MID);
        expect(c.phase).toBe('hold');
        expect(c.alpha).toBeCloseTo(1, 5);
        expect(c.offset).toBeCloseTo(0, 5);
    });

    test('near card end: sweeping OUT, alpha fading, offset to the right', () => {
        const b = stubBoss();
        initBossIntro(b, introScript(), null, 0);
        updateBossIntro(b, null, CARD_END - 1);
        const c = computeNameCard(b, CARD_END - 1);
        expect(c.phase).toBe('out');
        expect(c.alpha).toBeLessThan(0.1);    // nearly gone
        expect(c.offset).toBeGreaterThan(0.9); // nearly off to the right
    });

    test('alpha rises in→hold then falls hold→out across the beat', () => {
        const b = stubBoss();
        initBossIntro(b, introScript(), null, 0);
        updateBossIntro(b, null, CARD_START);
        const early = computeNameCard(b, CARD_START + 200).alpha; // in
        const mid = computeNameCard(b, CARD_MID).alpha;           // hold = 1
        const late = computeNameCard(b, CARD_END - 100).alpha;    // out
        expect(early).toBeLessThan(mid);
        expect(late).toBeLessThan(mid);
        expect(mid).toBeCloseTo(1, 5);
    });

    test('uses the element tint for the card color', () => {
        const b = stubBoss({ element: 'PYRO' });
        initBossIntro(b, introScript(), null, 0);
        updateBossIntro(b, null, CARD_MID);
        const c = computeNameCard(b, CARD_MID);
        expect(typeof c.color).toBe('string');
        expect(c.color).toMatch(/^#/);
    });
});

describe('computeDetonation (pure) — radius grows over the death', () => {
    test('inactive when no death sequence exists', () => {
        const b = stubBoss();
        const d = computeDetonation(b, 0);
        expect(d.active).toBe(false);
        expect(d.radiusScale).toBe(0);
    });

    test('radiusScale grows monotonically across the death sequence', () => {
        const b = stubBoss();
        initBossDeath(b, deathScript(), null, 0); // total = 3200
        const r0 = computeDetonation(b, 0).radiusScale;
        const r1 = computeDetonation(b, 800).radiusScale;
        const r2 = computeDetonation(b, 1600).radiusScale;
        const r3 = computeDetonation(b, 3000).radiusScale;
        expect(r0).toBeCloseTo(0, 5);
        expect(r1).toBeGreaterThan(r0);
        expect(r2).toBeGreaterThan(r1);
        expect(r3).toBeGreaterThan(r2);
        expect(r3).toBeLessThanOrEqual(1);
    });

    test('ring alpha fades as the ring expands', () => {
        const b = stubBoss();
        initBossDeath(b, deathScript(), null, 0);
        const aEarly = computeDetonation(b, 200).alpha;
        const aLate = computeDetonation(b, 3000).alpha;
        expect(aEarly).toBeGreaterThan(aLate);
    });

    test('flash spikes mid-supernova beat (sine bell, peaks at the middle)', () => {
        const b = stubBoss();
        initBossDeath(b, deathScript(), null, 0);
        // supernova spans [2000, 3200); midpoint = 2600.
        updateBossDeath(b, null, 2600);
        const start = computeDetonation(b, 2000).flash;   // beat progress 0
        const mid = computeDetonation(b, 2600).flash;     // beat progress 0.5 → peak
        expect(start).toBeCloseTo(0, 3);
        expect(mid).toBeGreaterThan(0.9);
        expect(mid).toBeLessThanOrEqual(1);
    });

    test('detonating flag is true inside a detonation beat', () => {
        const b = stubBoss();
        initBossDeath(b, deathScript(), null, 0);
        updateBossDeath(b, null, 2600); // mid supernova
        expect(computeDetonation(b, 2600).detonating).toBe(true);
    });
});

describe('bossFxCameraShake (pure) — decays', () => {
    test('zero offset with no sequence', () => {
        const b = stubBoss();
        const s = bossFxCameraShake(b, 0);
        expect(s).toEqual({ dx: 0, dy: 0, magnitude: 0 });
    });

    test('death-shake magnitude decays as the death sequence ends', () => {
        const b = stubBoss();
        initBossDeath(b, deathScript(), null, 0);
        // Sample the base envelope OUTSIDE detonation beats so the per-beat
        // flash punch doesn't mask the decay. bolts-blow=[0,900), the gap
        // beats overlap, so compare two early non-flash points vs a late one.
        const early = bossFxCameraShake(b, 100).magnitude;
        const late = bossFxCameraShake(b, 3100).magnitude;
        expect(early).toBeGreaterThan(0);
        expect(late).toBeLessThan(early);
    });

    test('intro warp-in rumble decays toward zero across the intro', () => {
        const b = stubBoss();
        initBossIntro(b, introScript(), null, 0);
        const early = bossFxCameraShake(b, 0).magnitude;
        updateBossIntro(b, null, 3000);
        const late = bossFxCameraShake(b, 3000).magnitude;
        expect(early).toBeGreaterThan(0);
        expect(late).toBeLessThan(early);
    });

    test('offset stays within the magnitude envelope (|d| <= magnitude)', () => {
        const b = stubBoss();
        initBossDeath(b, deathScript(), null, 0);
        const s = bossFxCameraShake(b, 500);
        expect(Math.abs(s.dx)).toBeLessThanOrEqual(s.magnitude + 1e-9);
        expect(Math.abs(s.dy)).toBeLessThanOrEqual(s.magnitude + 1e-9);
    });

    test('deterministic — same `now` yields the same offset (pure)', () => {
        const b = stubBoss();
        initBossDeath(b, deathScript(), null, 0);
        const a = bossFxCameraShake(b, 777);
        const c = bossFxCameraShake(b, 777);
        expect(a).toEqual(c);
    });
});

describe('introFxActive / deathFxActive guards', () => {
    test('introFxActive true while the intro runs, false once complete', () => {
        const b = stubBoss();
        initBossIntro(b, introScript(), null, 0);
        expect(introFxActive(b)).toBe(true);
        updateBossIntro(b, null, 99999); // past the end
        expect(introFxActive(b)).toBe(false);
    });

    test('deathFxActive true while dying even when the boss is inactive', () => {
        const b = stubBoss({ active: false, _deathFlash: 1 });
        initBossDeath(b, deathScript(), null, 0);
        expect(deathFxActive(b)).toBe(true);
        updateBossDeath(b, null, 99999);
        expect(deathFxActive(b)).toBe(false);
    });
});
