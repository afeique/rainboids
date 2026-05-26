/**
 * tests/unit/platform/rumble.test.js — GP-4 gamepad rumble module. Covers the
 * enable-flag gating, actuator detection, and graceful no-op behavior. A fake
 * navigator.getGamepads supplies (or withholds) a pad with a vibrationActuator.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { RUMBLE, rumble, isRumbleEnabled, setRumbleEnabled, isRumbleSupported } from '../../../js/modules/platform/rumble.js';

function padWithActuator(impl) {
    return {
        connected: true,
        vibrationActuator: { playEffect: impl || (() => Promise.resolve('complete')) },
    };
}

const realNavigator = globalThis.navigator;

function setPads(pads) {
    globalThis.navigator = { getGamepads: () => pads };
}

beforeEach(() => { setRumbleEnabled(false); });
afterEach(() => {
    setRumbleEnabled(false);
    globalThis.navigator = realNavigator;
});

describe('GP-4 — rumble enable flag', () => {
    test('defaults to OFF', () => {
        expect(isRumbleEnabled()).toBe(false);
    });

    test('setRumbleEnabled round-trips', () => {
        setRumbleEnabled(true);
        expect(isRumbleEnabled()).toBe(true);
        setRumbleEnabled(false);
        expect(isRumbleEnabled()).toBe(false);
    });
});

describe('GP-4 — rumble()', () => {
    test('no-ops (false) when disabled, even with a capable pad connected', () => {
        setPads([padWithActuator()]);
        expect(rumble(RUMBLE.MEDIUM)).toBe(false);
    });

    test('no-ops (false) when enabled but no actuator pad is connected', () => {
        setRumbleEnabled(true);
        setPads([null, { connected: false }]);
        expect(rumble(RUMBLE.MEDIUM)).toBe(false);
    });

    test('plays (true) when enabled with a capable pad', () => {
        setRumbleEnabled(true);
        const playEffect = jest.fn(() => Promise.resolve('complete'));
        setPads([padWithActuator(playEffect)]);
        expect(rumble(RUMBLE.HEAVY)).toBe(true);
        expect(playEffect).toHaveBeenCalledWith('dual-rumble', expect.objectContaining({
            duration: RUMBLE.HEAVY.duration,
            weakMagnitude: RUMBLE.HEAVY.weak,
            strongMagnitude: RUMBLE.HEAVY.strong,
        }));
    });

    test('magnitudes are clamped to [0,1]', () => {
        setRumbleEnabled(true);
        const playEffect = jest.fn();
        setPads([padWithActuator(playEffect)]);
        rumble({ duration: 100, weak: 5, strong: -2 });
        const arg = playEffect.mock.calls[0][1];
        expect(arg.weakMagnitude).toBe(1);
        expect(arg.strongMagnitude).toBe(0);
    });

    test('returns false (no throw) when playEffect throws', () => {
        setRumbleEnabled(true);
        setPads([padWithActuator(() => { throw new Error('unsupported'); })]);
        expect(rumble(RUMBLE.LIGHT)).toBe(false);
    });

    test('isRumbleSupported reflects enabled + a capable pad', () => {
        setPads([padWithActuator()]);
        expect(isRumbleSupported()).toBe(false); // disabled
        setRumbleEnabled(true);
        expect(isRumbleSupported()).toBe(true);
        setPads([]);
        expect(isRumbleSupported()).toBe(false); // no pad
    });
});
