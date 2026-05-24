// Phase P6 — Frostbite passive: chill/freeze builds 25% faster (a 25%-lower hit
// threshold to escalate a CRYO hit straight to FREEZE). Tests the CRYO branch of
// applyWeaponElementStatus with a spy engine.
import { describe, expect, test } from '@jest/globals';
import { applyWeaponElementStatus } from '../../js/modules/combat/collision-system.js';

function spyEngine(hasFrostbite) {
    const calls = { freeze: 0, chill: 0 };
    return {
        calls,
        player: { hasPassive: (id) => hasFrostbite && id === 'FROSTBITE' },
        applyFreeze() { calls.freeze++; },
        applyChill() { calls.chill++; },
        // other status applicators (unused by CRYO) — present so other elements
        // wouldn't throw if reused.
        applyBurn() {}, applyConduct() {}, applyStun() {}, applyCorrode() {}, applyBleed() {}, applyMark() {},
    };
}
const enemy = () => ({ x: 0, y: 0, active: true, chillUntil: 0, brnUntil: 0, corrodeUntil: 0, markUntil: 0 });

describe('Frostbite — lower freeze threshold', () => {
    // ELEM_FREEZE_HIT is 8; Frostbite drops it to 6. A dealt=7 CRYO hit:
    //   without Frostbite → CHILL (7 < 8)
    //   with Frostbite    → FREEZE (7 >= 6)
    test('a medium CRYO hit freezes with Frostbite, only chills without', () => {
        const off = spyEngine(false);
        applyWeaponElementStatus.call(off, enemy(), 'CRYO', 7);
        expect(off.calls.freeze).toBe(0);
        expect(off.calls.chill).toBe(1);

        const on = spyEngine(true);
        applyWeaponElementStatus.call(on, enemy(), 'CRYO', 7);
        expect(on.calls.freeze).toBe(1);
        expect(on.calls.chill).toBe(0);
    });

    test('a hard hit (>=8) freezes regardless', () => {
        const off = spyEngine(false);
        applyWeaponElementStatus.call(off, enemy(), 'CRYO', 10);
        expect(off.calls.freeze).toBe(1);
    });

    test('a tiny hit (<6) only chills even with Frostbite', () => {
        const on = spyEngine(true);
        applyWeaponElementStatus.call(on, enemy(), 'CRYO', 3);
        expect(on.calls.chill).toBe(1);
        expect(on.calls.freeze).toBe(0);
    });
});
