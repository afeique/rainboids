// Phase D.B0 — time-gated boss sequence runner (intro + death).
//
// Pure, engine-agnostic: a boss carries a declarative list of timed beats; the
// runner advances by elapsed time, fires each onEnter once and in order, and
// fires onComplete when the last beat ends. Driven here with a stub boss + an
// explicit `now`, mirroring the boss-phases / boss-parts tests. KEY difference
// from those: a sequence is NOT gated by dying/warping/inactive.
import { describe, expect, test } from '@jest/globals';
import {
    initBossSequence,
    updateBossSequence,
    initBossIntro,
    updateBossIntro,
    initBossDeath,
    updateBossDeath,
    introBlocksDamage,
    currentBeat,
    currentBeatIndex,
    isSequenceComplete,
    beatProgress,
    sequenceProgress,
    INTRO_KEY,
    DEATH_KEY,
} from '../../../js/modules/enemy/boss-intro.js';

const stubBoss = (over = {}) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false, ...over,
});

// Intro: warp-in (1500) → name card (2000) → fight-start (instant), logging order.
function introScript(log) {
    return [
        { id: 'warp', durationMs: 1500, onEnter: () => log.push('warp') },
        { id: 'card', durationMs: 2000, onEnter: () => log.push('card') },
        { id: 'fight', durationMs: 0, onEnter: () => log.push('fight') },
    ];
}

describe('boss-intro — init', () => {
    test('enters beat 0 + fires its onEnter; not yet complete', () => {
        const log = []; const b = stubBoss();
        expect(initBossSequence(b, introScript(log), { key: INTRO_KEY, now: 0 })).toBe(true);
        expect(currentBeatIndex(b)).toBe(0);
        expect(currentBeat(b).id).toBe('warp');
        expect(log).toEqual(['warp']);
        expect(isSequenceComplete(b)).toBe(false);
    });

    test('a missing/empty script is a safe no-op', () => {
        const b = stubBoss();
        expect(initBossSequence(b, null)).toBe(false);
        expect(initBossSequence(b, [])).toBe(false);
        expect(currentBeat(b)).toBeNull();
        expect(isSequenceComplete(b)).toBe(false);
        expect(beatProgress(b)).toBe(0);
        expect(sequenceProgress(b)).toBe(0);
        expect(() => updateBossSequence(b)).not.toThrow();
        expect(introBlocksDamage(b)).toBe(false);
    });
});

describe('boss-intro — time advance', () => {
    test('crossing beat boundaries fires each onEnter once, in order', () => {
        const log = []; const b = stubBoss();
        initBossSequence(b, introScript(log), { key: INTRO_KEY, now: 0 });
        updateBossSequence(b, { key: INTRO_KEY, now: 1000 }); // still in warp
        expect(currentBeatIndex(b)).toBe(0);
        updateBossSequence(b, { key: INTRO_KEY, now: 1500 }); // → name card
        expect(currentBeat(b).id).toBe('card');
        updateBossSequence(b, { key: INTRO_KEY, now: 1600 }); // staying — no re-fire
        expect(log).toEqual(['warp', 'card']);
    });

    test('several beats elapsing in ONE frame fire every onEnter once, in order', () => {
        const log = []; const b = stubBoss();
        initBossSequence(b, introScript(log), { key: INTRO_KEY, now: 0 });
        updateBossSequence(b, { key: INTRO_KEY, now: 5000 }); // past everything
        expect(log).toEqual(['warp', 'card', 'fight']);
        expect(currentBeatIndex(b)).toBe(2);
    });

    test('onComplete fires exactly once when the last beat ends', () => {
        const log = []; const done = [];
        const b = stubBoss();
        initBossSequence(b, introScript(log), {
            key: INTRO_KEY, now: 0, onComplete: () => done.push('done'),
        });
        updateBossSequence(b, { key: INTRO_KEY, now: 3500 }); // total = 3500
        expect(isSequenceComplete(b)).toBe(true);
        expect(done).toEqual(['done']);
        updateBossSequence(b, { key: INTRO_KEY, now: 9999 }); // no double-complete
        expect(done).toEqual(['done']);
    });
});

describe('boss-intro — progress', () => {
    test('beatProgress + sequenceProgress track elapsed time', () => {
        const b = stubBoss();
        initBossSequence(b, introScript([]), { key: INTRO_KEY, now: 0 });
        // 750ms into the 1500ms warp = 50% of the beat; 750/3500 overall.
        expect(beatProgress(b, INTRO_KEY, 750)).toBeCloseTo(0.5, 5);
        expect(sequenceProgress(b, INTRO_KEY, 750)).toBeCloseTo(750 / 3500, 5);
        // Past the end both clamp to 1.
        expect(sequenceProgress(b, INTRO_KEY, 99999)).toBe(1);
    });
});

describe('boss-intro — NOT gated by dying/warping (unlike phases/parts)', () => {
    test('a death sequence advances while the boss is dying/inactive', () => {
        const log = []; const done = [];
        const b = stubBoss({ active: false, _deathFlash: 1, warping: false });
        initBossDeath(b, [
            { id: 'pop', durationMs: 1000, onEnter: () => log.push('pop') },
            { id: 'supernova', durationMs: 1000, onEnter: () => log.push('supernova') },
        ], null, 0, () => done.push('victory'));
        updateBossDeath(b, null, 1000); // boss is "dead" but the sequence still runs
        expect(log).toEqual(['pop', 'supernova']);
        updateBossDeath(b, null, 2000);
        expect(isSequenceComplete(b, DEATH_KEY)).toBe(true);
        expect(done).toEqual(['victory']);
    });
});

describe('boss-intro — intro damage gate', () => {
    test('introBlocksDamage holds until the intro completes', () => {
        const b = stubBoss();
        initBossIntro(b, introScript([]), null, 0);
        expect(introBlocksDamage(b)).toBe(true);
        updateBossIntro(b, null, 1500); // mid-intro
        expect(introBlocksDamage(b)).toBe(true);
        updateBossIntro(b, null, 3500); // intro over
        expect(introBlocksDamage(b)).toBe(false);
    });

    test('intro and death are independent sequences on the same boss', () => {
        const b = stubBoss();
        initBossIntro(b, [{ id: 'i', durationMs: 1000 }], null, 0);
        updateBossIntro(b, null, 1000);
        expect(isSequenceComplete(b, INTRO_KEY)).toBe(true);
        // Death starts later, at its own t0, with its own key.
        initBossDeath(b, [{ id: 'd', durationMs: 500 }], null, 10000);
        expect(isSequenceComplete(b, DEATH_KEY)).toBe(false);
        expect(introBlocksDamage(b)).toBe(false); // intro is done
        updateBossDeath(b, null, 10500);
        expect(isSequenceComplete(b, DEATH_KEY)).toBe(true);
    });
});
