import { beforeAll, describe, expect, test } from '@jest/globals';

if (typeof globalThis.window === 'undefined') {
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { getGamepads: () => [] };
}

let GamepadHandler;
beforeAll(async () => {
    ({ GamepadHandler } = await import('../../../js/modules/ui/gamepad-handler.js'));
});

function pad(pressed = [], axes = [0, 0, 0, 0]) {
    const buttons = Array.from({ length: 17 }, (_, i) => ({
        pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0,
    }));
    return { connected: true, index: 0, buttons, axes };
}

function makeInput() {
    return {
        activateAbilitySlot: [false, false, false, false],
        activateAbility: false,
        dashPulse: false,
        fire: false,
        fireSecondary: false,
    };
}

describe('gamepad Pro layout', () => {
    test('A/B/X/Y raise slots 0..3 and RB raises dash', () => {
        const engine = { controlScheme: 'gamepad' };
        const h = new GamepadHandler(engine);
        h.setLayout('pro');
        h._getPads = () => [pad([0, 1, 2, 3, 5])];
        const input = makeInput();

        h.poll(input);

        expect(input.activateAbilitySlot).toEqual([true, true, true, true]);
        expect(input.activateAbility).toBe(false);
        expect(input.dashPulse).toBe(true);
    });

    test('Classic keeps B legacy ability and A dash', () => {
        const engine = { controlScheme: 'gamepad' };
        const h = new GamepadHandler(engine);
        h.setLayout('classic');
        h._getPads = () => [pad([0, 1])];
        const input = makeInput();

        h.poll(input);

        expect(input.activateAbilitySlot).toEqual([false, false, false, false]);
        expect(input.activateAbility).toBe(true);
        expect(input.dashPulse).toBe(true);
    });
});
