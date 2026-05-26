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

describe('AS-3 — auto-dodge intensity thresholds', () => {
    // A mid-range threat: minTTI 0.5 sits between the conservative (0.34) and
    // aggressive (0.75) trigger thresholds, so the intensity setting alone
    // decides whether the Co-Pilot dashes. scoreDodgeDestinations always yields
    // the 8 compass candidates, so a hand-built situation produces a target.
    const midThreat = () => ({
        player: { x: 250, y: 250, radius: 12 },
        minTTI: 0.5,
        incomingCount: 1,
        enemies: [],
        gameField: { width: 500, height: 500 },
    });

    test("'off' disables auto-dodge entirely, even under imminent danger", () => {
        const imminent = { ...midThreat(), minTTI: 0.1 };
        expect(decideDodge(imminent, { autoDodge: 'off' })).toBeNull();
    });

    test("'conservative' ignores a mid-range threat (TTI above 0.34)", () => {
        expect(decideDodge(midThreat(), { autoDodge: 'conservative' })).toBeNull();
    });

    test("'aggressive' dashes on the same mid-range threat (TTI below 0.75)", () => {
        expect(decideDodge(midThreat(), { autoDodge: 'aggressive' })).toMatchObject({ type: 'dash' });
    });

    test('AUTOPILOT level raises the threshold like aggressive', () => {
        const dodge = decideDodge(midThreat(), { autoDodge: 'conservative', level: 'autopilot' });
        expect(dodge).toMatchObject({ type: 'dash' });
    });

    test('both intensities dash on a clearly imminent threat', () => {
        const imminent = { ...midThreat(), minTTI: 0.2 };
        expect(decideDodge(imminent, { autoDodge: 'conservative' })).toMatchObject({ type: 'dash' });
        expect(decideDodge(imminent, { autoDodge: 'aggressive' })).toMatchObject({ type: 'dash' });
    });

    test('no dodge without an active incoming threat', () => {
        const none = { ...midThreat(), incomingCount: 0 };
        expect(decideDodge(none, { autoDodge: 'aggressive' })).toBeNull();
    });
});
