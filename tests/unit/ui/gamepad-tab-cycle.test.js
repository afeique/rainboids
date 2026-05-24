// Phase U3 — gamepad D-pad tab cycling. Pins that the D-pad ◂ ▸ fire
// engine.cycleShopTab(∓1) on the RISING edge only (no auto-repeat while held),
// routed through pollFrame. The actual tab change + visibility guard live in
// shop-dom (cycleShopTabIfVisible) and are covered by the BUILD QA + nextTab.
import { describe, expect, test, beforeAll } from '@jest/globals';

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

function pad(pressed = []) {
    const buttons = Array.from({ length: 17 }, (_, i) => ({
        pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0,
    }));
    return { connected: true, index: 0, buttons, axes: [0, 0, 0, 0] };
}

function makeEngine() {
    const calls = [];
    const engine = {
        controlScheme: 'gamepad',
        inputHandler: { input: {} },
        radialMenu: { isOpen: () => false, openFor() {}, cancel() {} },
        game: { state: 'ARMORY' }, // not playable → radials inert
        width: 800, height: 600,
        cycleShopTab: (d) => { calls.push(d); },
    };
    return { engine, calls };
}

describe('U3 — gamepad D-pad tab cycling', () => {
    const DPAD_LEFT = 14, DPAD_RIGHT = 15;

    test('D-pad right cycles forward (+1) on rising edge, not while held', () => {
        const { engine, calls } = makeEngine();
        const h = new GamepadHandler(engine);
        let p = pad([DPAD_RIGHT]); h._getPads = () => [p];
        h.pollFrame(); // rising edge → +1
        h.pollFrame(); // still held → no repeat
        p = pad([]);            h._getPads = () => [p]; h.pollFrame(); // release
        p = pad([DPAD_RIGHT]);  h._getPads = () => [p]; h.pollFrame(); // rising edge → +1
        expect(calls).toEqual([1, 1]);
    });

    test('D-pad left cycles backward (-1)', () => {
        const { engine, calls } = makeEngine();
        const h = new GamepadHandler(engine);
        const p = pad([DPAD_LEFT]); h._getPads = () => [p];
        h.pollFrame();
        expect(calls).toEqual([-1]);
    });

    test('no D-pad press → no cycle', () => {
        const { engine, calls } = makeEngine();
        const h = new GamepadHandler(engine);
        const p = pad([]); h._getPads = () => [p];
        h.pollFrame();
        expect(calls).toEqual([]);
    });
});
