/**
 * @jest-environment jsdom
 *
 * tests/unit/ui/gamepad-focus.test.js — GamepadFocusController (the reusable
 * DOM focus-traversal used for pad-navigable overlays, GP-1). Needs real DOM
 * (querySelectorAll / classList / click / focus), so this file runs under
 * jsdom rather than the default node env.
 */

import { describe, expect, test, beforeEach } from '@jest/globals';
import { GamepadFocusController } from '../../../js/modules/ui/gamepad-focus.js';

function root(n = 3) {
    const div = document.createElement('div');
    for (let i = 0; i < n; i++) {
        const b = document.createElement('button');
        b.textContent = `B${i}`;
        b.dataset.idx = String(i);
        // jsdom does no layout, so offsetParent is always null and the
        // controller's visibility filter would exclude every element. Stub a
        // truthy offsetParent so items() sees them as on-screen.
        Object.defineProperty(b, 'offsetParent', { value: div, configurable: true });
        div.appendChild(b);
    }
    document.body.appendChild(div);
    return div;
}

describe('GamepadFocusController', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    test('focusFirst marks the first focusable', () => {
        const c = new GamepadFocusController(root());
        expect(c.focusFirst()).toBe(true);
        const marked = document.querySelectorAll('.is-gamepad-focused');
        expect(marked.length).toBe(1);
        expect(marked[0].dataset.idx).toBe('0');
    });

    test('move advances and only one item is marked at a time', () => {
        const c = new GamepadFocusController(root());
        c.focusFirst();
        c.move(1);
        const marked = document.querySelectorAll('.is-gamepad-focused');
        expect(marked.length).toBe(1);
        expect(marked[0].dataset.idx).toBe('1');
    });

    test('wraps past the ends when wrap is on (default)', () => {
        const c = new GamepadFocusController(root(3), { wrap: true });
        c.focusFirst();
        c.move(-1); // from 0 → wraps to last
        expect(document.querySelector('.is-gamepad-focused').dataset.idx).toBe('2');
    });

    test('clamps at the ends when wrap is off', () => {
        const c = new GamepadFocusController(root(3), { wrap: false });
        c.focusFirst();
        c.move(-1); // stays at 0
        expect(document.querySelector('.is-gamepad-focused').dataset.idx).toBe('0');
    });

    test('activate clicks the focused element', () => {
        const r = root();
        let clicked = null;
        r.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { clicked = b.dataset.idx; }));
        const c = new GamepadFocusController(r);
        c.focusFirst();
        c.move(1); // focus idx 1
        expect(c.activate()).toBe(true);
        expect(clicked).toBe('1');
    });

    test('handleAction maps up/down/confirm/back/tab', () => {
        const r = root();
        let backCalled = false; let tabDir = null;
        const c = new GamepadFocusController(r, { onBack: () => { backCalled = true; return true; }, onTab: (d) => { tabDir = d; return true; } });
        c.focusFirst();
        c.handleAction('down');
        expect(document.querySelector('.is-gamepad-focused').dataset.idx).toBe('1');
        c.handleAction('up');
        expect(document.querySelector('.is-gamepad-focused').dataset.idx).toBe('0');
        expect(c.handleAction('back')).toBe(true);
        expect(backCalled).toBe(true);
        expect(c.handleAction('nextTab')).toBe(true);
        expect(tabDir).toBe(1);
    });

    test('clear removes the focus marker', () => {
        const c = new GamepadFocusController(root());
        c.focusFirst();
        c.clear();
        expect(document.querySelectorAll('.is-gamepad-focused').length).toBe(0);
    });

    test('setRoot to a new element clears the old marker and re-targets', () => {
        const a = root(2);
        const c = new GamepadFocusController(a);
        c.focusFirst();
        const b = root(2);
        c.setRoot(b);
        c.focusFirst();
        // the marker is now inside b, not a
        expect(a.querySelectorAll('.is-gamepad-focused').length).toBe(0);
        expect(b.querySelectorAll('.is-gamepad-focused').length).toBe(1);
    });
});
