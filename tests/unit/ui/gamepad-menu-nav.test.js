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

function makeOverlay(id = 'pause-overlay', n = 3) {
    const div = document.createElement('div');
    div.id = id;
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

function makeEngine(state = 'PAUSED') {
    return {
        controlScheme: 'gamepad',
        game: { state },
        uiManager: { elements: {} },
        inputHandler: { input: {} },
        radialMenu: null,
        pauseCalls: 0,
        togglePause() { this.pauseCalls++; },
    };
}

function handlerFor(state = 'PAUSED') {
    const eng = makeEngine(state);
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
        const { h } = handlerFor();
        h._getPads = () => [pad([])];
        h.pollFrame();
        expect(div.querySelectorAll('.is-gamepad-focused').length).toBe(1);
        expect(focusedIdx(div)).toBe('0');
    });

    test('D-pad down moves the focus marker', () => {
        const { div } = makeOverlay();
        const { h } = handlerFor();
        h._getPads = () => [pad([])];
        h.pollFrame();                       // focus idx 0
        h._getPads = () => [pad([13])];      // D-pad down
        h.pollFrame();
        expect(focusedIdx(div)).toBe('1');
    });

    test('A activates (clicks) the focused control', () => {
        const { clicks } = makeOverlay();
        const { h } = handlerFor();
        h._getPads = () => [pad([])];
        h.pollFrame();                       // focus idx 0
        h._getPads = () => [pad([0])];       // A
        h.pollFrame();
        expect(clicks).toContain(0);
    });

    test('B resumes (togglePause) and is rising-edge', () => {
        makeOverlay();
        const { h, eng } = handlerFor();
        h._getPads = () => [pad([1])];       // B held
        h.pollFrame();
        h.pollFrame();                       // still held → no re-fire
        expect(eng.pauseCalls).toBe(1);
    });

    test('no focus marker when not paused (state PLAYING)', () => {
        const { div } = makeOverlay();
        const { h, eng } = handlerFor();
        eng.game.state = 'PLAYING';
        h._getPads = () => [pad([13])];
        h.pollFrame();
        expect(div.querySelectorAll('.is-gamepad-focused').length).toBe(0);
    });

    test('left-stick down also moves focus (analog nav)', () => {
        const { div } = makeOverlay();
        const { h } = handlerFor();
        h._getPads = () => [pad([])];
        h.pollFrame();                       // focus idx 0
        h._getPads = () => [pad([], [0, 0.9, 0, 0])]; // left stick Y down
        h.pollFrame();
        expect(focusedIdx(div)).toBe('1');
    });
});

describe('GP-1 — pad nav extends to the meta screens (ARMORY/etc.)', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    test('ARMORY overlay is navigable + activatable', () => {
        const { div, clicks } = makeOverlay('armory-overlay');
        const { h } = handlerFor('ARMORY');
        h._getPads = () => [pad([])];
        h.pollFrame();                       // focus idx 0
        expect(focusedIdx(div)).toBe('0');
        h._getPads = () => [pad([13])];      // down → idx 1
        h.pollFrame();
        expect(focusedIdx(div)).toBe('1');
        h._getPads = () => [pad([0])];       // A → click idx 1
        h.pollFrame();
        expect(clicks).toContain(1);
    });

    test('B does NOT togglePause on a meta screen (no stray pause)', () => {
        makeOverlay('settings-overlay');
        const { h, eng } = handlerFor('SETTINGS');
        h._getPads = () => [pad([1])];       // B
        h.pollFrame();
        expect(eng.pauseCalls).toBe(0);
    });

    test('a non-menu state with no overlay → no nav', () => {
        makeOverlay('armory-overlay'); // present in DOM…
        const { h } = handlerFor('TITLE_SCREEN'); // …but TITLE has no mapped overlay
        h._getPads = () => [pad([13])];
        h.pollFrame();
        expect(document.querySelectorAll('.is-gamepad-focused').length).toBe(0);
    });
});
