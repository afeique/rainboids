import { describe, expect, test } from '@jest/globals';
import { ACTIONS, GAMEPAD_BUTTON, getBindingLabel, createGamepadBindingState } from '../../../js/modules/ui/bindings.js';

function pad(pressed = []) {
    return {
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
    };
}

describe('controls binding registry', () => {
    test('Pro gamepad maps RB to dash and face buttons to four abilities', () => {
        expect(getBindingLabel('gamepad', ACTIONS.DASH, { layout: 'pro' })).toBe('RB');
        expect(getBindingLabel('gamepad', ACTIONS.ABILITY_1, { layout: 'pro' })).toBe('A');
        expect(getBindingLabel('gamepad', ACTIONS.ABILITY_4, { layout: 'pro' })).toBe('Y');
    });

    test('Classic keeps A dash and B slot-1 ability', () => {
        expect(getBindingLabel('gamepad', ACTIONS.DASH, { layout: 'classic' })).toBe('A');
        expect(getBindingLabel('gamepad', ACTIONS.ABILITY_1, { layout: 'classic' })).toBe('B');
    });

    test('button state resolves through the selected layout', () => {
        const pro = createGamepadBindingState(pad([GAMEPAD_BUTTON.RB, GAMEPAD_BUTTON.X]), 'pro');
        expect(pro[ACTIONS.DASH]).toBe(true);
        expect(pro[ACTIONS.ABILITY_3]).toBe(true);

        const classic = createGamepadBindingState(pad([GAMEPAD_BUTTON.A]), 'classic');
        expect(classic[ACTIONS.DASH]).toBe(true);
    });
});
