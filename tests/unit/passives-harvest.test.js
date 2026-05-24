// Phase P6 — Harvest passive. Enemies killed by status damage (DoT) yield bonus
// power energy + a gold orb. harvestBonus is called ONLY from the DoT-death
// finalize branch in Enemy.update() (the status-kill path), so it does not
// re-check status — it just grants the reward when the passive is equipped.
import { describe, expect, test } from '@jest/globals';
import { harvestBonus } from '../../js/modules/combat/combat-manager.js';

function engine(hasHarvest) {
    const orbs = [];
    let energy = 0;
    return {
        orbs,
        get energy() { return energy; },
        player: {
            x: 1, y: 2,
            hasPassive: (id) => hasHarvest && id === 'HARVEST',
            addEnergy(a) { energy += a; },
        },
        createMoneyOrb(x, y, value, isPixel) { orbs.push({ x, y, value, isPixel }); },
    };
}

const enemy = (x, y) => ({ x, y, active: true });

describe('Harvest — status-kill bonus drops', () => {
    test('no passive → no energy, no orb', () => {
        const eng = engine(false);
        harvestBonus.call(eng, enemy(50, 60));
        expect(eng.energy).toBe(0);
        expect(eng.orbs).toEqual([]);
    });

    test('with passive → grants bonus energy and a gold orb at the kill site', () => {
        const eng = engine(true);
        harvestBonus.call(eng, enemy(50, 60));
        expect(eng.energy).toBe(8);
        expect(eng.orbs.length).toBe(1);
        expect(eng.orbs[0]).toMatchObject({ x: 50, y: 60, isPixel: false });
        expect(eng.orbs[0].value).toBeGreaterThan(0);
    });

    test('falls back to the player position when no enemy is passed', () => {
        const eng = engine(true);
        harvestBonus.call(eng, null);
        expect(eng.orbs[0]).toMatchObject({ x: 1, y: 2 });
    });

    test('no player → safe no-op', () => {
        const eng = { player: null };
        expect(() => harvestBonus.call(eng, enemy(0, 0))).not.toThrow();
    });
});
