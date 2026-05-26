/**
 * tests/unit/assist-feedback.test.js — FB-1 (P7) AI Co-Pilot auto-cast feedback.
 *
 * Pure-helper unit coverage for the two functions that back the HUD feedback in
 * hud/status.js:
 *   - isNewAssistCast(cast, lastSeenT): "is this a NEW auto-cast?" — the per-
 *     frame edge detector (default-safe when no _lastAssistCast exists).
 *   - assistAbilityName(id): id → display name lookup (falls back to the raw id,
 *     '' for missing/unknown).
 *
 * No canvas / DOM is needed — these are plain functions over the cast stamp.
 * Browser shims still run first because importing status.js pulls in modules
 * that touch window/document at load time.
 */

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
        createElement: (tag) => {
            if (tag === 'canvas') {
                return { width: 0, height: 0, style: {}, getContext: () => ({}) };
            }
            return { getContext: () => ({}), style: {}, addEventListener: () => {} };
        },
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}
if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = function Path2D() {};
}

import { describe, expect, test } from '@jest/globals';
import { isNewAssistCast, assistAbilityName } from '../../js/modules/hud/status.js';

describe('FB-1 — isNewAssistCast (auto-cast edge detector)', () => {
    test('false when there is no cast (default-safe: Co-Pilot off)', () => {
        expect(isNewAssistCast(undefined, undefined)).toBe(false);
        expect(isNewAssistCast(null, 1234)).toBe(false);
    });

    test('false when the cast has no numeric timestamp', () => {
        expect(isNewAssistCast({ id: 'BULWARK', slot: 0 }, undefined)).toBe(false);
        expect(isNewAssistCast({ id: 'BULWARK', slot: 0, t: 'nope' }, undefined)).toBe(false);
    });

    test('true on the very first cast (undefined last-seen)', () => {
        expect(isNewAssistCast({ id: 'BULWARK', slot: 0, t: 1000 }, undefined)).toBe(true);
    });

    test('true when the timestamp differs from the last-seen one', () => {
        expect(isNewAssistCast({ id: 'EMP_PULSE', slot: 1, t: 2000 }, 1000)).toBe(true);
    });

    test('false when the timestamp matches the last-seen one (already handled)', () => {
        expect(isNewAssistCast({ id: 'EMP_PULSE', slot: 1, t: 2000 }, 2000)).toBe(false);
    });
});

describe('FB-1 — assistAbilityName (id → display name)', () => {
    test('resolves a known ability id to its display name', () => {
        expect(assistAbilityName('BULWARK')).toBe('Bulwark');
        expect(assistAbilityName('EMP_PULSE')).toBe('EMP Pulse');
        expect(assistAbilityName('FIELD_MEDIC')).toBe('Field Medic');
    });

    test('falls back to the raw id for an unknown ability', () => {
        expect(assistAbilityName('NOT_A_REAL_ABILITY')).toBe('NOT_A_REAL_ABILITY');
    });

    test('returns empty string for a missing id (skips the toast gracefully)', () => {
        expect(assistAbilityName(undefined)).toBe('');
        expect(assistAbilityName(null)).toBe('');
        expect(assistAbilityName('')).toBe('');
    });
});
