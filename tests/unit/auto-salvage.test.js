/**
 * @jest-environment jsdom
 */
// T44 — auto-salvage on loot commit: when meta.autoSalvage is on,
// commitRunLootToStash salvages GEAR drops that score below the equipped item
// in their slot (→ R$) instead of stashing them; locked items and weapons are
// always kept, and above-equipped gear is kept.

import { describe, expect, test, beforeEach } from '@jest/globals';
import { GameEngine } from '../../js/modules/game-engine.js';
import { loadMeta, saveMeta } from '../../js/modules/core/storage.js';

beforeEach(() => { localStorage.clear(); });

// Gear scored by its {stat,pct} affixes (scoreItem sums pct). level+rarity feed salvageValue.
const gear = (pct, extra = {}) => ({ slot: 'hull', level: 5, rarity: 'common', affixes: [{ stat: 'HEALTH', pct }], ...extra });

function engineWith(collected) {
    const eng = Object.create(GameEngine.prototype);
    eng.game = { accountGold: 1000 };
    eng.player = { runCollected: collected };
    return eng;
}

describe('T44 — auto-salvage on commit', () => {
    test('ON: below-equipped gear is salvaged to R$; locked / weapons / better gear kept', () => {
        saveMeta({ autoSalvage: true, accountGold: 1000, equippedItems: { hull: gear(50) } });
        const eng = engineWith([
            gear(5),                                   // below → salvage
            gear(90),                                  // above → keep
            gear(5, { locked: true }),                 // below BUT locked → keep
            { slot: 'weapon', kind: 'weapon', level: 5, rarity: 'common', archetype: 'PULSE', traits: [] }, // weapon → keep
        ]);
        eng.commitRunLootToStash();
        const meta = loadMeta();
        expect(meta.stash).toHaveLength(3);            // above + locked + weapon
        expect(meta.accountGold).toBeGreaterThan(1000); // salvaged R$ banked
        expect(eng.game.accountGold).toBe(meta.accountGold);
        expect(eng.player.runCollected).toEqual([]);
    });

    test('OFF (default): everything is stashed, nothing salvaged', () => {
        saveMeta({ accountGold: 1000, equippedItems: { hull: gear(50) } });
        const eng = engineWith([gear(5), gear(90)]);
        eng.commitRunLootToStash();
        const meta = loadMeta();
        expect(meta.stash).toHaveLength(2);
        expect(meta.accountGold).toBe(1000); // untouched
    });

    test('setAutoSalvage persists + getAutoSalvage reads it', () => {
        const eng = Object.create(GameEngine.prototype);
        expect(eng.setAutoSalvage(true)).toBe(true);
        expect(loadMeta().autoSalvage).toBe(true);
        expect(eng.getAutoSalvage()).toBe(true);
        eng.setAutoSalvage(false);
        expect(eng.getAutoSalvage()).toBe(false);
    });
});
