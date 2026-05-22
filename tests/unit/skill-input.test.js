/**
 * tests/unit/skill-input.test.js — Phase B.S2 keyboard skill-slot binding.
 *
 * Pins the number-key → skill-slot contract for InputHandler:
 *   - Digit1..4 / Numpad1..4 raise a one-shot per-slot pulse
 *     (input.activateSkillSlot[0..3]).
 *   - Auto-repeat (e.repeat=true) does NOT raise the pulse, so holding a
 *     number key can't spam re-activations.
 *   - The retired TAB binding no longer raises any skill pulse.
 *
 * InputHandler's constructor only attaches listeners via the shimmed
 * document.addEventListener (a no-op below), so we construct the real
 * handler and drive its handleKeyDown directly with synthetic events —
 * no jsdom / real DOM dispatch required.
 */

// Browser shims — must happen before any game module import.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, removeEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}

import { describe, expect, test, beforeEach } from '@jest/globals';
import { InputHandler } from '../../js/modules/ui/input-handler.js';

// Minimal synthetic keydown event matching the fields handleKeyDown reads.
function keydown(code, { repeat = false } = {}) {
    return { code, repeat, preventDefault() {} };
}

describe('B.S2 — number keys 1–4 activate skill slots', () => {
    let handler;
    beforeEach(() => {
        handler = new InputHandler();
    });

    test('input.activateSkillSlot initializes to four cleared pulses', () => {
        expect(handler.input.activateSkillSlot).toEqual([false, false, false, false]);
    });

    test('Digit1..4 each raise the matching slot pulse (Digit1→0 … Digit4→3)', () => {
        handler.handleKeyDown(keydown('Digit1'));
        expect(handler.input.activateSkillSlot).toEqual([true, false, false, false]);

        handler.handleKeyDown(keydown('Digit2'));
        expect(handler.input.activateSkillSlot).toEqual([true, true, false, false]);

        handler.handleKeyDown(keydown('Digit3'));
        expect(handler.input.activateSkillSlot).toEqual([true, true, true, false]);

        handler.handleKeyDown(keydown('Digit4'));
        expect(handler.input.activateSkillSlot).toEqual([true, true, true, true]);
    });

    test('Numpad1..4 mirror Digit1..4 slot mapping', () => {
        handler.handleKeyDown(keydown('Numpad1'));
        handler.handleKeyDown(keydown('Numpad4'));
        expect(handler.input.activateSkillSlot).toEqual([true, false, false, true]);
    });

    test('auto-repeat (e.repeat=true) does NOT raise the pulse', () => {
        handler.handleKeyDown(keydown('Digit1', { repeat: true }));
        handler.handleKeyDown(keydown('Numpad3', { repeat: true }));
        expect(handler.input.activateSkillSlot).toEqual([false, false, false, false]);
    });

    test('Tab keydown does NOT raise any skill pulse (TAB binding retired)', () => {
        handler.handleKeyDown(keydown('Tab'));
        expect(handler.input.activateSkillSlot).toEqual([false, false, false, false]);
        // Legacy slot-0 flag (kept for the gamepad path) must also stay clear.
        expect(handler.input.activateSkill).toBe(false);
    });

    test('KeyQ keydown does NOT raise any skill pulse (Q binding retired)', () => {
        handler.handleKeyDown(keydown('KeyQ'));
        expect(handler.input.activateSkillSlot).toEqual([false, false, false, false]);
        expect(handler.input.activateSkill).toBe(false);
    });
});
