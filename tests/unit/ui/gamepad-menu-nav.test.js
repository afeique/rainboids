/**
 * @jest-environment jsdom
 *
 * tests/unit/ui/gamepad-menu-nav.test.js — GP-1: pollFrame drives the
 * GamepadFocusController over an open overlay (v1 = the pause overlay). A
 * synthetic pad + a stub engine holding a real DOM pause overlay verify that
 * D-pad/stick move the focus marker, A activates, B resumes, and nothing fires
 * when no navigable menu is open.
 */

import { beforeAll, beforeEach, describe, expect, test } from '@jest/globals';

let GamepadHandler;
beforeAll(async () => {
    ({ GamepadHandler } = await import('../../../js/modules/ui/gamepad-handler.js'));
});

// Standard 17-button pad. D-pad down = 13, A = 0, B = 1.
function pad(pressed = [], axes = [0, 0, 0, 0]) {
    const buttons = Array.from({ length: 17 }, (_, i) => ({
        pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0,
    }));
    return { connected: true, index: 0, buttons, axes };
}

function makeOverlay(n = 3) {
    const div = document.createElement('div');
    div.id = 'pause-overlay';
    div.style.display = 'flex';
    const clicks = [];
    for (let i = 0; i < n; i++) {
        const b = document.createElement('button');
        b.dataset.idx = String(i);
        Object.defineProperty(b, 'offsetParent', { value: div, configurable: true }); // jsdom: no layout
        b.addEventListener('click', () => clicks.push(i));
        div.appendChild(b);
    }
    document.body.appendChild(div);
    return { div, clicks };
}

function makeEngine(overlay) {
    return {
        controlScheme: 'gamepad',
        game: { state: 'PAUSED' },
        uiManager: { elements: { pauseOverlay: overlay } },
        inputHandler: { input: {} },
        radialMenu: null,
        pauseCalls: 0,
        togglePause() { this.pauseCalls++; },
    };
}

function handlerFor(overlay) {
    const eng = makeEngine(overlay);
    const h = new GamepadHandler(eng);
    h.setLayout('pro');
    return { h, eng };
}

function focusedIdx(div) {
    const el = div.querySelector('.is-gamepad-focused');
    return el ? el.dataset.idx : null;
}

describe('GP-1 — pad menu navigation (pause overlay v1)', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    test('opening the pause overlay focuses the first control', () => {
        const { div } = makeOverlay();
        const { h } = handlerFor(div);
        h._getPads = () => [pad([])];
        h.pollFrame();
        expect(div.querySelectorAll('.is-gamepad-focused').length).toBe(1);
        expect(focusedIdx(div)).toBe('0');
    });

    test('D-pad down moves the focus marker', () => {
        const { div } = makeOverlay();
        const { h } = handlerFor(div);
        h._getPads = () => [pad([])];
        h.pollFrame();                       // focus idx 0
        h._getPads = () => [pad([13])];      // D-pad down
        h.pollFrame();
        expect(focusedIdx(div)).toBe('1');
    });

    test('A activates (clicks) the focused control', () => {
        const { div, clicks } = makeOverlay();
        const { h } = handlerFor(div);
        h._getPads = () => [pad([])];
        h.pollFrame();                       // focus idx 0
        h._getPads = () => [pad([0])];       // A
        h.pollFrame();
        expect(clicks).toContain(0);
    });

    test('B resumes (togglePause) and is rising-edge', () => {
        const { div } = makeOverlay();
        const { h, eng } = handlerFor(div);
        h._getPads = () => [pad([1])];       // B held
        h.pollFrame();
        h.pollFrame();                       // still held → no re-fire
        expect(eng.pauseCalls).toBe(1);
    });

    test('no focus marker when not paused (state PLAYING)', () => {
        const { div } = makeOverlay();
        const { h, eng } = handlerFor(div);
        eng.game.state = 'PLAYING';
        h._getPads = () => [pad([13])];
        h.pollFrame();
        expect(div.querySelectorAll('.is-gamepad-focused').length).toBe(0);
    });

    test('left-stick down also moves focus (analog nav)', () => {
        const { div } = makeOverlay();
        const { h } = handlerFor(div);
        h._getPads = () => [pad([])];
        h.pollFrame();                       // focus idx 0
        h._getPads = () => [pad([], [0, 0.9, 0, 0])]; // left stick Y down
        h.pollFrame();
        expect(focusedIdx(div)).toBe('1');
    });
});
