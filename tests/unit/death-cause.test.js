/**
 * tests/unit/death-cause.test.js — FB-3 death-cause readout.
 *
 * Covers the pure source→string mapping used by the GAME OVER screen's
 * one-line death-cause readout. The function is a plain data→string map over a
 * compact { kind, enemyType? } descriptor — no DOM/canvas/engine needed.
 *
 * Contract checks:
 *   - each `kind` maps to its expected generic phrase
 *   - known enemy types map to their evocative phrases
 *   - an unknown enemyType collapses to the generic enemy fallback
 *   - missing / empty / malformed source → a safe generic, never throws
 *   - the readout never references the Co-Pilot
 */

import { describe, expect, test } from '@jest/globals';
import { deathCauseString } from '../../js/modules/hud/death-cause.js';

describe('FB-3 — deathCauseString: kind fallbacks', () => {
    test('asteroid → crushed', () => {
        expect(deathCauseString({ kind: 'asteroid' })).toBe('Crushed by an asteroid');
    });

    test('enemy-bullet (no type) → shot down', () => {
        expect(deathCauseString({ kind: 'enemy-bullet' })).toBe('Shot down');
    });

    test('burn → burned to death', () => {
        expect(deathCauseString({ kind: 'burn' })).toBe('Burned to death');
    });

    test('hazard → lost to a hazard field', () => {
        expect(deathCauseString({ kind: 'hazard' })).toBe('Lost to a hazard field');
    });

    test('unknown kind → safe generic', () => {
        expect(deathCauseString({ kind: 'unknown' })).toBe('Ship destroyed');
    });

    test('enemy without a type → generic enemy fallback', () => {
        expect(deathCauseString({ kind: 'enemy' })).toBe('Overwhelmed by enemies');
    });
});

describe('FB-3 — deathCauseString: per-enemy phrases', () => {
    test('HUNTER → Cornered by Hunters', () => {
        expect(deathCauseString({ kind: 'enemy', enemyType: 'HUNTER' }))
            .toBe('Cornered by Hunters');
    });

    test('TITAN → Caught in a Titan barrage', () => {
        expect(deathCauseString({ kind: 'enemy', enemyType: 'TITAN' }))
            .toBe('Caught in a Titan barrage');
    });

    test('STALKER → Ambushed by a Stalker', () => {
        expect(deathCauseString({ kind: 'enemy', enemyType: 'STALKER' }))
            .toBe('Ambushed by a Stalker');
    });

    test('every known enemy type resolves to a non-generic phrase', () => {
        const types = ['HUNTER', 'GUARDIAN', 'WASP', 'STALKER', 'DRIFTER',
            'PROWLER', 'WEAVER', 'SENTINEL', 'TANGERINE', 'TITAN'];
        for (const t of types) {
            const s = deathCauseString({ kind: 'enemy', enemyType: t });
            expect(typeof s).toBe('string');
            expect(s.length).toBeGreaterThan(0);
            expect(s).not.toBe('Overwhelmed by enemies');
            expect(s).not.toBe('Ship destroyed');
        }
    });

    test('unknown enemyType → generic enemy fallback', () => {
        expect(deathCauseString({ kind: 'enemy', enemyType: 'NOT_A_REAL_ENEMY' }))
            .toBe('Overwhelmed by enemies');
    });

    test('enemy-bullet with a known shooter type → that enemy phrase', () => {
        expect(deathCauseString({ kind: 'enemy-bullet', enemyType: 'TITAN' }))
            .toBe('Caught in a Titan barrage');
    });

    test('enemy-bullet with an unknown shooter type → shot down', () => {
        expect(deathCauseString({ kind: 'enemy-bullet', enemyType: 'NOPE' }))
            .toBe('Shot down');
    });
});

describe('FB-3 — deathCauseString: default-safe', () => {
    test('undefined → safe generic, no throw', () => {
        expect(() => deathCauseString(undefined)).not.toThrow();
        expect(deathCauseString(undefined)).toBe('Ship destroyed');
    });

    test('null → safe generic, no throw', () => {
        expect(deathCauseString(null)).toBe('Ship destroyed');
    });

    test('empty object → safe generic, no throw', () => {
        expect(deathCauseString({})).toBe('Ship destroyed');
    });

    test('non-object (string / number) → safe generic, no throw', () => {
        expect(deathCauseString('enemy')).toBe('Ship destroyed');
        expect(deathCauseString(42)).toBe('Ship destroyed');
    });

    test('never references the Co-Pilot', () => {
        const samples = [
            undefined, null, {}, { kind: 'unknown' }, { kind: 'enemy' },
            { kind: 'enemy', enemyType: 'TITAN' }, { kind: 'asteroid' },
            { kind: 'enemy-bullet' }, { kind: 'burn' }, { kind: 'hazard' },
        ];
        for (const s of samples) {
            expect(deathCauseString(s).toLowerCase()).not.toContain('co-pilot');
            expect(deathCauseString(s).toLowerCase()).not.toContain('copilot');
        }
    });
});
