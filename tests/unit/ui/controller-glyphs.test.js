/**
 * tests/unit/ui/controller-glyphs.test.js — GP-3: the icons.js controller-glyph
 * helpers (used by item-card.js and the GAMEPAD reference tab). Pure functions,
 * previously untested.
 */

import { describe, expect, test } from '@jest/globals';
import { detectControllerFamily, bindingGlyph } from '../../../js/modules/ui/icons.js';

describe('detectControllerFamily', () => {
    test('recognizes PlayStation pads', () => {
        expect(detectControllerFamily('Sony DualSense Wireless Controller')).toBe('playstation');
        expect(detectControllerFamily('DUALSHOCK 4')).toBe('playstation');
        expect(detectControllerFamily('PLAYSTATION(R)3 Controller')).toBe('playstation');
    });

    test('recognizes Switch pads', () => {
        expect(detectControllerFamily('Pro Controller')).toBe('switch');
        expect(detectControllerFamily('Joy-Con (L)')).toBe('switch');
    });

    test('recognizes Xbox / XInput pads', () => {
        expect(detectControllerFamily('Xbox Wireless Controller')).toBe('xbox');
        expect(detectControllerFamily('XInput STANDARD GAMEPAD')).toBe('xbox');
    });

    test('defaults to xbox for empty/unknown ids', () => {
        expect(detectControllerFamily('')).toBe('xbox');
        expect(detectControllerFamily()).toBe('xbox');
        expect(detectControllerFamily('Generic USB Gamepad')).toBe('xbox');
    });
});

describe('bindingGlyph', () => {
    test('maps face buttons per family', () => {
        expect(bindingGlyph({ kind: 'button', label: 'A' }, { family: 'xbox' })).toBe('A');
        expect(bindingGlyph({ kind: 'button', label: 'A' }, { family: 'playstation' })).toBe('Cross');
        expect(bindingGlyph({ kind: 'button', label: 'A' }, { family: 'switch' })).toBe('B'); // Switch swaps A/B
        expect(bindingGlyph({ kind: 'button', label: 'B' }, { family: 'playstation' })).toBe('Circle');
    });

    test('maps shoulders/triggers per family', () => {
        expect(bindingGlyph({ kind: 'button', label: 'RT' }, { family: 'playstation' })).toBe('R2');
        expect(bindingGlyph({ kind: 'button', label: 'LB' }, { family: 'switch' })).toBe('L');
        expect(bindingGlyph({ kind: 'button', label: 'Start' }, { family: 'playstation' })).toBe('Options');
    });

    test('defaults to xbox family when none given', () => {
        expect(bindingGlyph({ kind: 'button', label: 'Y' })).toBe('Y');
    });

    test('passes through key / mouse / touch / assist bindings', () => {
        expect(bindingGlyph({ kind: 'key', label: 'Space' })).toBe('Space');
        expect(bindingGlyph({ kind: 'mouse', code: 'MouseLeft', label: 'LMB' })).toBe('LMB');
        expect(bindingGlyph({ kind: 'touch', label: 'Tap' })).toBe('Tap');
        expect(bindingGlyph({ kind: 'assist' })).toBe('AUTO');
    });

    test('falls back to the raw label for an unknown button + empty for null', () => {
        expect(bindingGlyph({ kind: 'button', label: 'WeirdButton' }, { family: 'xbox' })).toBe('WeirdButton');
        expect(bindingGlyph(null)).toBe('');
    });
});
