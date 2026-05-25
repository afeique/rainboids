import { describe, expect, test } from '@jest/globals';
import { DEFAULT_ASSIST_CONFIG, decideCast, decideDodge, decidePower, senseSituation, senseThreats } from '../../js/modules/assist/assist-system.js';

function player(overrides = {}) {
    return {
        x: 100, y: 100, radius: 12,
        vel: { x: 0, y: 0 },
        health: 20, maxHealth: 100,
        dashCooldown: 0,
        activeAbilityEffects: new Map(),
        ...overrides,
    };
}

describe('Assist System', () => {
    test('senseThreats uses relative velocity to classify incoming bullets', () => {
        const incoming = senseThreats({
            player: player(),
            bullets: [{ active: true, x: 100, y: 0, radius: 8, vel: { x: 0, y: 12 } }],
        });
        expect(incoming).toHaveLength(1);
        expect(incoming[0].tti).toBeGreaterThan(0);

        const away = senseThreats({
            player: player(),
            bullets: [{ active: true, x: 100, y: 0, radius: 8, vel: { x: 0, y: -12 } }],
        });
        expect(away).toHaveLength(0);
    });

    test('decideCast chooses a ready heal at low HP', () => {
        const situation = senseSituation({ player: player({ health: 25 }), enemies: [], bullets: [], threatLevel: 2, now: 1000 });
        const cast = decideCast(situation, ['FIELD_MEDIC'], [0], DEFAULT_ASSIST_CONFIG, {});
        expect(cast).toMatchObject({ type: 'ability', slot: 0, id: 'FIELD_MEDIC' });
    });

    test('decidePower prefers cluster/nuke powers against crowded enemies', () => {
        const situation = senseSituation({
            player: player({ health: 90 }),
            enemies: [
                { active: true, x: 120, y: 100 },
                { active: true, x: 130, y: 105 },
                { active: true, x: 140, y: 110 },
                { active: true, x: 150, y: 115 },
            ],
            bullets: [],
            threatLevel: 3,
            now: 1000,
        });
        const power = decidePower(situation, 'SINGULARITY', true, DEFAULT_ASSIST_CONFIG, {});
        expect(power).toMatchObject({ type: 'power', id: 'SINGULARITY' });
        expect(power.target).toBeTruthy();
    });

    test('decideDodge triggers only for imminent danger with dash ready', () => {
        const situation = senseSituation({
            player: player(),
            enemies: [{ active: true, x: 110, y: 120 }],
            bullets: [{ active: true, x: 100, y: 90, radius: 8, vel: { x: 0, y: 40 } }],
            threatLevel: 2,
            gameField: { width: 500, height: 500 },
        });
        const dodge = decideDodge(situation, DEFAULT_ASSIST_CONFIG);
        expect(dodge).toMatchObject({ type: 'dash' });
    });
});
