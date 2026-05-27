/**
 * @jest-environment jsdom
 */
// T43 — class-selection wiring: setSelectedClass persists meta.selectedClass +
// arms the transient _pendingClass that init() applies (T33); getSelectedClass
// resolves pending→meta and validates against CLASSES. Exercised on a bare
// GameEngine.prototype stub with jsdom localStorage.

import { describe, expect, test, beforeEach } from '@jest/globals';
import { GameEngine } from '../../js/modules/game-engine.js';
import { loadMeta, saveMeta } from '../../js/modules/core/storage.js';

beforeEach(() => { localStorage.clear(); });

describe('T43 — setSelectedClass / getSelectedClass', () => {
    test('a valid class persists to meta + arms _pendingClass', () => {
        const eng = Object.create(GameEngine.prototype);
        const id = eng.setSelectedClass('BULWARK');
        expect(id).toBe('BULWARK');
        expect(eng._pendingClass).toBe('BULWARK');
        expect(loadMeta().selectedClass).toBe('BULWARK');
        expect(eng.getSelectedClass()).toBe('BULWARK');
    });

    test('an unknown class clears the selection (no class that run)', () => {
        const eng = Object.create(GameEngine.prototype);
        eng.setSelectedClass('BULWARK');
        const id = eng.setSelectedClass('NONSENSE');
        expect(id).toBeNull();
        expect(eng._pendingClass).toBeNull();
        expect(loadMeta().selectedClass).toBeNull();
        expect(eng.getSelectedClass()).toBeNull();
    });

    test('getSelectedClass falls back to the persisted meta when nothing pending', () => {
        saveMeta({ selectedClass: 'REAPER' });
        const eng = Object.create(GameEngine.prototype); // fresh, no _pendingClass
        expect(eng.getSelectedClass()).toBe('REAPER');
    });

    test('a stale/invalid persisted class resolves to null', () => {
        saveMeta({ selectedClass: 'GONE' });
        const eng = Object.create(GameEngine.prototype);
        expect(eng.getSelectedClass()).toBeNull();
    });
});
