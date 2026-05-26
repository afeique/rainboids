/**
 * tests/unit/ui/gamepad-l3-r3.test.js — GP-2: the two stick-click bindings
 * (L3 = TOGGLE_AUTO_AIM, R3 = LOCK_ON) were declared in bindings.js but never
 * read by the gamepad poll. These pin the wiring added in poll():
 *   • L3 rising-edge toggles assists.autoAim via engine.setAssist (persisted).
 *   • L3 held does NOT re-toggle (one-shot rising edge).
 *   • R3 held sets input.lockOn each frame; released clears it.
 */

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

// 17-button pad; `pressed` = indices currently down. L3 = 10, R3 = 11.
function pad(pressed = [], axes = [0, 0, 0, 0]) {
    const buttons = Array.from({ length: 17 }, (_, i) => ({
        pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0,
    }));
    return { connected: true, index: 0, buttons, axes };
}

function makeInput() {
    return { activateAbilitySlot: [false, false, false, false], fire: false, fireSecondary: false };
}

function makeEngine(autoAim = false) {
    return {
        controlScheme: 'gamepad',
        assists: { autoAim },
        calls: [],
        setAssist(name, val) { this.calls.push([name, val]); this.assists[name] = val; },
    };
}

describe('GP-2 — L3 toggle-auto-aim / R3 lock-on', () => {
    test('L3 rising-edge toggles autoAim through setAssist (persisted)', () => {
        const engine = makeEngine(false);
        const h = new GamepadHandler(engine);
        h.setLayout('pro');
        h._getPads = () => [pad([10])]; // L3 down
        h.poll(makeInput());
        expect(engine.calls).toEqual([['autoAim', true]]);
        expect(engine.assists.autoAim).toBe(true);
    });

    test('holding L3 does not re-toggle (one-shot rising edge)', () => {
        const engine = makeEngine(false);
        const h = new GamepadHandler(engine);
        h.setLayout('pro');
        h._getPads = () => [pad([10])]; // held across both polls
        h.poll(makeInput());
        h.poll(makeInput());
        expect(engine.calls).toEqual([['autoAim', true]]); // exactly one toggle
    });

    test('release then re-press L3 toggles back off', () => {
        const engine = makeEngine(false);
        const h = new GamepadHandler(engine);
        h.setLayout('pro');
        h._getPads = () => [pad([10])];
        h.poll(makeInput());                 // → true
        h._getPads = () => [pad([])];
        h.poll(makeInput());                 // release
        h._getPads = () => [pad([10])];
        h.poll(makeInput());                 // → false
        expect(engine.calls).toEqual([['autoAim', true], ['autoAim', false]]);
        expect(engine.assists.autoAim).toBe(false);
    });

    test('R3 held sets input.lockOn; released clears it', () => {
        const engine = makeEngine(false);
        const h = new GamepadHandler(engine);
        h.setLayout('pro');
        const input = makeInput();
        h._getPads = () => [pad([11])]; // R3 down
        h.poll(input);
        expect(input.lockOn).toBe(true);
        h._getPads = () => [pad([])];
        h.poll(input);
        expect(input.lockOn).toBe(false);
    });

    test('lockOn is cleared when the scheme leaves gamepad (no stale lock)', () => {
        const engine = makeEngine(false);
        const h = new GamepadHandler(engine);
        h.setLayout('pro');
        const input = makeInput();
        h._getPads = () => [pad([11])];
        h.poll(input);
        expect(input.lockOn).toBe(true);
        engine.controlScheme = 'keyboard'; // scheme switched away → _release path
        h.poll(input);
        expect(input.lockOn).toBe(false);
    });
});
