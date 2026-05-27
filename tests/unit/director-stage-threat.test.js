// T34 — gear/level-aware director: the DRAFTED stage's threat (PWR-scaled,
// from run-randomizer) offsets the EFFECTIVE difficulty. A stage that
// out-threatens the build is genuinely harder; a stage at/below the build's PWR
// adds nothing here (the reactive loop + preload own that); no drafted stage
// (threat 0) is exactly neutral. The live PWR the director reads already folds
// gear/weapons/SP via T25/T26, so "gear/level-aware" falls out for free.

import { describe, expect, test } from '@jest/globals';
import { createDirector, setDirectorContext, getDifficulty } from '../../js/modules/wave/difficulty-director.js';
import { PWR_REF } from '../../js/modules/wave/power-level.js';

describe('T34 — stage-threat offset on the effective difficulty', () => {
    test('no drafted stage (threat 0) ⇒ neutral (default-safe)', () => {
        const d = createDirector({ pwr: PWR_REF, mode: 'NORMAL' });
        const { D_hp, D_thr } = getDifficulty(d);
        expect(D_hp).toBeCloseTo(1, 6);
        expect(D_thr).toBeCloseTo(1, 6);
    });

    test('a stage that OUT-threatens the build raises both axes', () => {
        const d = createDirector({ pwr: PWR_REF, mode: 'NORMAL' }); // pwr 100
        setDirectorContext(d, { threat: 400 });                     // ratio 4 → capped offset
        const { D_hp, D_thr } = getDifficulty(d);
        expect(D_hp).toBeGreaterThan(1);
        expect(D_thr).toBeGreaterThan(1);
    });

    test('the offset is capped (a risky stage is hard, never a sponge wall)', () => {
        const easy = createDirector({ pwr: PWR_REF, mode: 'NORMAL' });
        setDirectorContext(easy, { threat: 150 }); // ratio 1.5
        const brutal = createDirector({ pwr: PWR_REF, mode: 'NORMAL' });
        setDirectorContext(brutal, { threat: 100000 }); // absurd ratio → clamps to the cap
        // Both raise difficulty, but the brutal one is bounded (THREAT_OFFSET_CAP).
        expect(getDifficulty(brutal).D_hp).toBeGreaterThan(getDifficulty(easy).D_hp);
        expect(getDifficulty(brutal).D_hp / getDifficulty(easy).D_hp).toBeLessThan(2);
    });

    test('a stage at/below the build PWR adds NO threat offset', () => {
        const withThreat = createDirector({ pwr: 200, mode: 'NORMAL' });
        setDirectorContext(withThreat, { threat: 150 }); // ratio 0.75 ≤ 1 → no offset
        const baseline = createDirector({ pwr: 200, mode: 'NORMAL' }); // threat 0
        expect(getDifficulty(withThreat).D_hp).toBeCloseTo(getDifficulty(baseline).D_hp, 6);
        expect(getDifficulty(withThreat).D_thr).toBeCloseTo(getDifficulty(baseline).D_thr, 6);
    });

    test('setDirectorContext / createDirector carry the threat field', () => {
        const d = createDirector({ threat: 320 });
        expect(d.threat).toBe(320);
        setDirectorContext(d, { threat: 500 });
        expect(d.threat).toBe(500);
        setDirectorContext(d, { pwr: 250 }); // threat untouched when not provided
        expect(d.threat).toBe(500);
    });
});
