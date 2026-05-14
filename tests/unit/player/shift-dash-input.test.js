/**
 * tests/unit/player/shift-dash-input.test.js — unit tests for the
 * 5.93.0 SHIFT keymap on InputHandler.
 *
 * Contract pinned here:
 *   • Shift keydown sets input.shift (continuous-state mirror) + the
 *     one-shot input.dashPulse (consumed by Player.update).
 *   • Auto-repeat (e.repeat = true) ignores dashPulse — holding Shift
 *     does not spam dashes.
 *   • Shift keyup clears input.shift; dashPulse is consumed by the
 *     player loop, so the input handler doesn't reset it.
 *   • Window blur clears input.shift + input.dashPulse — a mid-Shift
 *     alt-tab doesn't leave stale state.
 *   • Cheat-code interaction: pressing SHIFT+Digit fires Shift's
 *     dashPulse once on Shift keydown but the digit keydown does NOT
 *     fire another dash — i.e., a combo press doesn't double-trigger.
 *     (The current event-setup.js bracket cheats are guarded by
 *     `!e.shiftKey`, so Shift+[ does not grant gold — that's the
 *     intended cheat-code conflict resolution.)
 */

// ---------------------------------------------------------------------------
// Browser shims. InputHandler reads window.innerWidth and registers
// document-level event listeners — we stub both with capture-the-handler
// helpers so the tests can fire synthetic events.
// ---------------------------------------------------------------------------

const keyHandlers = { keydown: null, keyup: null };
const mouseHandlers = {};
const winHandlers = {};

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920,
        innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: (type, fn) => { winHandlers[type] = fn; },
        removeEventListener: () => {},
    };
} else {
    globalThis.window.addEventListener = (type, fn) => { winHandlers[type] = fn; };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: (type, fn) => {
            if (type === 'keydown' || type === 'keyup') keyHandlers[type] = fn;
            else mouseHandlers[type] = fn;
        },
        body: { appendChild: () => {} },
    };
}

import { beforeEach, describe, expect, test } from '@jest/globals';
import { InputHandler } from '../../../js/modules/ui/input-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireKeydown(code, opts = {}) {
    const evt = {
        code,
        repeat: opts.repeat || false,
        shiftKey: opts.shiftKey || false,
        preventDefault: () => {},
    };
    if (keyHandlers.keydown) keyHandlers.keydown(evt);
}

function fireKeyup(code) {
    const evt = { code, preventDefault: () => {} };
    if (keyHandlers.keyup) keyHandlers.keyup(evt);
}

function fireBlur() {
    if (winHandlers.blur) winHandlers.blur();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InputHandler — SHIFT keymap (5.93.0 dash)', () => {
    let ih;

    beforeEach(() => {
        // Reset captured handlers so the new InputHandler installs fresh ones.
        keyHandlers.keydown = null;
        keyHandlers.keyup = null;
        mouseHandlers.mousedown = null;
        mouseHandlers.mouseup = null;
        winHandlers.blur = null;
        ih = new InputHandler();
    });

    test('input.shift and input.dashPulse start false', () => {
        expect(ih.input.shift).toBe(false);
        expect(ih.input.dashPulse).toBe(false);
    });

    test('ShiftLeft keydown sets shift true and pulses dashPulse', () => {
        fireKeydown('ShiftLeft');
        expect(ih.input.shift).toBe(true);
        expect(ih.input.dashPulse).toBe(true);
    });

    test('ShiftRight keydown sets shift true and pulses dashPulse', () => {
        fireKeydown('ShiftRight');
        expect(ih.input.shift).toBe(true);
        expect(ih.input.dashPulse).toBe(true);
    });

    test('Shift keydown with e.repeat=true does NOT pulse dashPulse', () => {
        // Auto-repeat from the OS — the player still has Shift held, but
        // we don't want a new dash on every browser-fired repeat tick.
        fireKeydown('ShiftLeft', { repeat: true });
        expect(ih.input.shift).toBe(true); // continuous-state still set
        expect(ih.input.dashPulse).toBe(false); // pulse suppressed
    });

    test('Shift keyup clears shift', () => {
        fireKeydown('ShiftLeft');
        fireKeyup('ShiftLeft');
        expect(ih.input.shift).toBe(false);
    });

    test('Shift keyup does NOT clear dashPulse (consumed by player loop)', () => {
        fireKeydown('ShiftLeft');
        expect(ih.input.dashPulse).toBe(true);
        fireKeyup('ShiftLeft');
        // dashPulse stays set — Player.update consumes it. The input
        // handler must not interfere or the player would never see it.
        expect(ih.input.dashPulse).toBe(true);
    });

    test('window blur clears shift and dashPulse', () => {
        fireKeydown('ShiftLeft');
        expect(ih.input.shift).toBe(true);
        expect(ih.input.dashPulse).toBe(true);
        fireBlur();
        expect(ih.input.shift).toBe(false);
        expect(ih.input.dashPulse).toBe(false);
    });

    test('SHIFT+Digit sequence: only one dashPulse fires (on Shift keydown)', () => {
        // SHIFT keydown first → fires dashPulse.
        fireKeydown('ShiftLeft');
        expect(ih.input.dashPulse).toBe(true);
        // Simulate player loop consuming the pulse (this is what
        // Player.update would do — set it back to false).
        ih.input.dashPulse = false;
        // Now a digit key follows (Digit1, 2, etc). It must NOT
        // re-pulse dashPulse — only Shift keydown sets that flag.
        fireKeydown('Digit1', { shiftKey: true });
        expect(ih.input.dashPulse).toBe(false);
        fireKeydown('Digit3', { shiftKey: true });
        expect(ih.input.dashPulse).toBe(false);
    });

    test('press → release → press triggers two dashPulses', () => {
        fireKeydown('ShiftLeft');
        expect(ih.input.dashPulse).toBe(true);
        // Consume pulse and release.
        ih.input.dashPulse = false;
        fireKeyup('ShiftLeft');
        // Press again.
        fireKeydown('ShiftLeft');
        expect(ih.input.dashPulse).toBe(true);
    });
});
