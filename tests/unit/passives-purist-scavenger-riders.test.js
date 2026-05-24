// Phase P6 — completing two keystone descriptions whose secondary clause was
// unwired:
//   • Purist  — "shots pierce"        → puristPierceBonus → +1 bullet.piercing
//   • Scavenger — "huge pickup radius" → SCAVENGER_PICKUP_BONUS widens starCollision
// The damage/drop halves of both were already live (damageMult / dropMult).
import { describe, expect, test } from '@jest/globals';
import { puristPierceBonus } from '../../js/modules/player/weapons.js';
import { starCollision, SCAVENGER_PICKUP_BONUS } from '../../js/modules/core/utils.js';

const player = (passives = []) => ({
    x: 0, y: 0, radius: 12,
    hasPassive: (id) => passives.includes(id),
});

describe('Purist — shots pierce', () => {
    test('grants +1 pierce when equipped', () => {
        expect(puristPierceBonus(player(['PURIST']))).toBe(1);
    });
    test('no bonus without the passive', () => {
        expect(puristPierceBonus(player([]))).toBe(0);
    });
    test('safe on a malformed player', () => {
        expect(puristPierceBonus(null)).toBe(0);
        expect(puristPierceBonus({})).toBe(0);
    });
});

describe('Scavenger — huge pickup radius', () => {
    // A stationary orb sitting just outside the base scoop but inside the
    // Scavenger-widened radius: collected only with the passive.
    const baseBonus = 15; // STAR_COLLECTION_BONUS in starCollision
    const star = (dist) => ({ x: dist, y: 0, radius: 4, vel: { x: 0, y: 0 } });

    test('an orb beyond the base scoop is NOT collected without Scavenger', () => {
        const d = 12 + 4 + baseBonus + 20; // player.radius + star.radius + base + margin
        expect(starCollision(player([]), star(d))).toBe(false);
    });

    test('the same orb IS collected with Scavenger (wider radius)', () => {
        const d = 12 + 4 + baseBonus + 20;
        expect(starCollision(player(['SCAVENGER']), star(d))).toBe(true);
    });

    test('an orb beyond even the Scavenger radius is still missed', () => {
        const d = 12 + 4 + baseBonus + SCAVENGER_PICKUP_BONUS + 30;
        expect(starCollision(player(['SCAVENGER']), star(d))).toBe(false);
    });

    test('SCAVENGER_PICKUP_BONUS dwarfs the base scoop', () => {
        expect(SCAVENGER_PICKUP_BONUS).toBeGreaterThan(baseBonus * 3);
    });
});
