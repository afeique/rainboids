/**
 * @jest-environment jsdom
 *
 * 6.226.0 — "never lose gold" abandon-banking. Exercises the REAL
 * GameEngine.bankAbandonedRunGold / _stampSaveGoldBanked methods (called on a
 * minimal prototype mock + jsdom localStorage), proving the four branches and,
 * critically, that a run whose gold was already banked on death/complete is
 * NOT re-banked on a later cross-session abandon (the double-bank guard).
 *
 * The per-amount arithmetic (bankRunGold / resolveAccountGold) is covered in
 * armory-economy.test.js; this locks the orchestration + guard around it.
 */
import { describe, expect, test, beforeEach } from '@jest/globals';
import { GameEngine } from '../../js/modules/game-engine.js';
import { writeSave, loadSave, loadMeta, saveMeta } from '../../js/modules/core/storage.js';

// Build a bare object carrying just the fields bankAbandonedRunGold touches,
// wired to the real prototype methods under test.
function makeEngine(over = {}) {
    const eng = Object.create(GameEngine.prototype);
    eng._runGoldBanked = false;
    eng.player = null;
    eng.game = { money: 0, accountGold: 0 };
    // savePersistentProfile pulls in the whole player; stub it to the one
    // effect that matters here (persist the live accountGold to meta).
    eng.savePersistentProfile = function () { saveMeta({ accountGold: this.game.accountGold | 0 }); };
    return Object.assign(eng, over);
}

beforeEach(() => { localStorage.clear(); });

describe('6.226.0 — bankAbandonedRunGold', () => {
    test('already banked this run ⇒ no-op (no re-bank)', () => {
        const eng = makeEngine({ _runGoldBanked: true, player: {}, game: { money: 500, accountGold: 1000 } });
        eng.bankAbandonedRunGold();
        expect(eng.game.accountGold).toBe(1000);
        expect(eng.game.money).toBe(500); // untouched
    });

    test('live abandon ⇒ banks game.money, zeroes it, arms the flag', () => {
        const eng = makeEngine({ player: {}, game: { money: 500, accountGold: 1000 } });
        eng.bankAbandonedRunGold();
        expect(eng.game.accountGold).toBe(1500);
        expect(eng.game.money).toBe(0);
        expect(eng._runGoldBanked).toBe(true);
        expect(loadMeta().accountGold).toBe(1500); // flushed to storage
    });

    test('cross-session abandon ⇒ banks leftover run-gold from the snapshot', () => {
        saveMeta({ accountGold: 2000 });
        writeSave({ wave: 3, money: 300 }); // un-banked snapshot (no goldBanked)
        const eng = makeEngine(); // no live run (player null, money 0)
        eng.bankAbandonedRunGold();
        expect(loadMeta().accountGold).toBe(2300);
    });

    test('cross-session abandon ⇒ does NOT re-bank a snapshot already stamped goldBanked', () => {
        saveMeta({ accountGold: 2000 });
        writeSave({ wave: 3, money: 300, goldBanked: true }); // run already concluded
        const eng = makeEngine();
        eng.bankAbandonedRunGold();
        expect(loadMeta().accountGold).toBe(2000); // unchanged — no double-bank
    });

    test('no live run and no snapshot ⇒ no-op', () => {
        saveMeta({ accountGold: 2000 });
        const eng = makeEngine();
        eng.bankAbandonedRunGold();
        expect(loadMeta().accountGold).toBe(2000);
    });
});

describe('6.226.0 — _stampSaveGoldBanked', () => {
    test('stamps goldBanked onto an existing snapshot', () => {
        writeSave({ wave: 5, money: 800 });
        expect(loadSave().goldBanked).toBeUndefined();
        const eng = makeEngine();
        eng._stampSaveGoldBanked();
        expect(loadSave().goldBanked).toBe(true);
        expect(loadSave().money).toBe(800); // run state otherwise preserved
    });

    test('no snapshot ⇒ no throw, nothing written', () => {
        const eng = makeEngine();
        expect(() => eng._stampSaveGoldBanked()).not.toThrow();
        expect(loadSave()).toBeNull();
    });
});
