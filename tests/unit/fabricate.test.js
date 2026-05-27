/**
 * @jest-environment jsdom
 */
// T42 — Fabricate (the Rainshard sink): game-engine.fabricateGear / fabricateWeapon
// roll a stash-ready ITEM via the crafting engine, commit it to the persistent
// stash, and deduct R$. Exercised on a bare GameEngine.prototype stub (like
// abandon-bank.test.js) so no full engine construction is needed.

import { describe, expect, test, beforeEach } from '@jest/globals';
import { GameEngine } from '../../js/modules/game-engine.js';
import { loadMeta, saveMeta } from '../../js/modules/core/storage.js';

function makeEngine(accountGold, level = 5) {
    const eng = Object.create(GameEngine.prototype);
    eng.game = { accountGold, currentWave: level };
    eng.player = { level };
    return eng;
}

beforeEach(() => { localStorage.clear(); });

describe('T42 — fabricateGear', () => {
    test('rolls a stash-ready gear ITEM and deducts Rainshards', () => {
        saveMeta({ accountGold: 20000 });
        const eng = makeEngine(20000);
        const res = eng.fabricateGear({ slot: 'hull', rarity: 'rare' });
        expect(res.ok).toBe(true);
        expect(res.item.slot).toBe('hull');
        expect(res.item.rarity).toBe('rare');
        expect(typeof res.item.name).toBe('string');           // decorated for display
        expect(Array.isArray(res.item.affixes)).toBe(true);     // {stat,pct} amp affixes
        expect(res.rainshards).toBeLessThan(20000);             // R$ spent
        expect(loadMeta().stash).toHaveLength(1);               // committed to stash
        expect(loadMeta().accountGold).toBe(res.rainshards);    // wallet persisted
        expect(eng.game.accountGold).toBe(res.rainshards);      // live wallet synced
    });

    test('refuses when the player cannot afford it (no stash mutation)', () => {
        saveMeta({ accountGold: 0 });
        const eng = makeEngine(0, 1);
        const res = eng.fabricateGear({ slot: 'hull', rarity: 'transcendental' });
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('poor');
        expect(loadMeta().stash || []).toHaveLength(0);
    });
});

describe('T42 — fabricateWeapon (T31 engine method)', () => {
    test('rolls a stash-ready weapon ITEM (kind:weapon) and deducts Rainshards', () => {
        saveMeta({ accountGold: 20000 });
        const eng = makeEngine(20000);
        const res = eng.fabricateWeapon({ archetype: 'RAIL', rarity: 'rare' });
        expect(res.ok).toBe(true);
        expect(res.item.kind).toBe('weapon');
        expect(res.item.archetype).toBe('RAIL');
        expect(res.item.slot).toBe('weapon');                   // synthetic slot → rides the stash
        expect(res.rainshards).toBeLessThan(20000);
        expect(loadMeta().stash).toHaveLength(1);
    });
});
