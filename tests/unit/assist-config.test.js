/**
 * tests/unit/assist-config.test.js — AS-1 (P7) persisted assist-config helpers.
 *
 * Covers the pure load/merge/save logic extracted from game-engine.js's
 * _loadAssists so the persistence path is testable without the engine:
 *   - defaultAssistConfig(mobile): the platform default `assists` blob.
 *   - mergeStoredAssists(stored, mobile): defaults <- stored, autoPower
 *     stripped, level/autoDodge/aggression sanitized + clamped.
 *
 * These are plain functions over a plain object — no DOM/canvas needed.
 */

import { describe, expect, test } from '@jest/globals';
import { ASSIST_LEVELS } from '../../js/modules/assist/assist-system.js';
import {
    defaultAssistConfig,
    mergeStoredAssists,
    AUTO_DODGE_LEVELS,
} from '../../js/modules/assist/assist-config.js';

describe('AS-1 — defaultAssistConfig', () => {
    test('desktop defaults are manual / opt-in', () => {
        const d = defaultAssistConfig(false);
        expect(d.level).toBe(ASSIST_LEVELS.MANUAL_TOUCH);
        expect(d.autoDodge).toBe('off');
        expect(d.aggression).toBe(0.55);
        expect(d.laserSight).toBe(true);
        expect(d.aimAssist).toBe(false);
        expect(d.autoAim).toBe(false);
        expect(d.autoFire).toBe(false);
        expect(d.autoCastAbilities).toBe(false);
    });

    test('mobile defaults pick the one-thumb Co-Pilot baseline', () => {
        const d = defaultAssistConfig(true);
        expect(d.level).toBe(ASSIST_LEVELS.CO_PILOT);
        expect(d.autoDodge).toBe('conservative');
        expect(d.laserSight).toBe(false);
        // The boolean auto-* toggles still default OFF; the touch forcing is
        // applied per-frame in the engine, not baked into the stored blob.
        expect(d.autoFire).toBe(false);
        expect(d.autoCastAbilities).toBe(false);
    });

    test('exposes the valid auto-dodge intensities', () => {
        expect(AUTO_DODGE_LEVELS).toEqual(['off', 'conservative', 'aggressive']);
    });
});

describe('AS-1 — mergeStoredAssists', () => {
    test('null stored → equals defaults', () => {
        expect(mergeStoredAssists(null, false)).toEqual(defaultAssistConfig(false));
        expect(mergeStoredAssists(null, true)).toEqual(defaultAssistConfig(true));
    });

    test('stored values override defaults; untouched keys keep defaults', () => {
        const m = mergeStoredAssists({ autoFire: true, level: ASSIST_LEVELS.AUTOPILOT }, false);
        expect(m.autoFire).toBe(true);
        expect(m.level).toBe(ASSIST_LEVELS.AUTOPILOT);
        // unspecified fields fall back to desktop defaults
        expect(m.autoDodge).toBe('off');
        expect(m.aggression).toBe(0.55);
        expect(m.laserSight).toBe(true);
    });

    test('retired autoPower field is stripped', () => {
        const m = mergeStoredAssists({ autoPower: true, autoFire: true }, false);
        expect('autoPower' in m).toBe(false);
        expect(m.autoFire).toBe(true);
    });

    test('aggression is clamped to [0.1, 1]; non-numeric falls back to default', () => {
        expect(mergeStoredAssists({ aggression: 5 }, false).aggression).toBe(1);
        expect(mergeStoredAssists({ aggression: -3 }, false).aggression).toBe(0.1);
        expect(mergeStoredAssists({ aggression: 0.7 }, false).aggression).toBeCloseTo(0.7);
        expect(mergeStoredAssists({ aggression: 'nope' }, false).aggression).toBe(0.55);
    });

    test('invalid level / autoDodge fall back to safe values', () => {
        expect(mergeStoredAssists({ level: 'bogus' }, false).level).toBe(ASSIST_LEVELS.MANUAL_TOUCH);
        expect(mergeStoredAssists({ autoDodge: 'bogus' }, false).autoDodge).toBe('off');
        // a valid intensity survives
        expect(mergeStoredAssists({ autoDodge: 'aggressive' }, true).autoDodge).toBe('aggressive');
    });

    test('a full round-trip blob is preserved (save → load)', () => {
        const saved = {
            aimAssist: true, autoAim: true, autoFire: true, autoCastAbilities: true,
            laserSight: false, level: ASSIST_LEVELS.CO_PILOT, autoDodge: 'conservative',
            aggression: 0.8,
        };
        const m = mergeStoredAssists(JSON.parse(JSON.stringify(saved)), true);
        expect(m).toMatchObject(saved);
    });
});
