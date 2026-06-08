// Runtime smoke test for the enemy brain across ALL 29 archetypes.
// node --check only catches syntax; this actually drives updateBrain() through
// many ticks against a mock world for every enemy type and asserts the
// momentum integrator keeps velocity bounded, the enemy makes progress toward
// the player, and nothing throws. This is the headless stand-in for visual
// playtesting — if a brain config or strategy mapping is broken at runtime,
// this catches it.
import { describe, it, expect } from '@jest/globals';

// Minimal browser shims (frame-clock / constants pull nothing heavy, but be safe).
if (typeof globalThis.window === 'undefined') {
    globalThis.window = { innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };
}

const { ENEMY_TYPES } = await import('../../../js/modules/enemy/enemy-data.js');
const { updateBrain } = await import('../../../js/modules/enemy/brain.js');
const { frameClock } = await import('../../../js/modules/core/frame-clock.js');
const { GAME_CONFIG } = await import('../../../js/modules/core/constants.js');

// Build a mock enemy that looks enough like the real Enemy for the brain.
function mockEnemy(type) {
    const cfg = ENEMY_TYPES[type];
    return {
        type, config: cfg,
        x: 400, y: 400,
        vel: { x: 0, y: 0 },
        radius: (cfg.size || 32) / 2,
        health: cfg.health || 10, maxHealth: cfg.health || 10,
        faceAngle: 0, targetFaceAngle: 0, turnSpeed: 0.12,
        lastShot: 0, firingCooldown: 1000,
        active: true,
    };
}

// Mock player and gameEngine (pools expose activeObjects like the real ones).
function mockWorld(enemy) {
    const player = { x: 900, y: 600, vel: { x: 2, y: -1 }, radius: 15 };
    const asteroid = { x: 650, y: 500, radius: 40, active: true };
    const gameEngine = {
        asteroidPool: { activeObjects: [asteroid] },
        enemyPool: { activeObjects: [enemy] },
    };
    enemy.targetPlayer = player;
    return { player, gameEngine };
}

describe('brain runtime — all 29 archetypes', () => {
    const types = Object.keys(ENEMY_TYPES);

    it('covers all 29 enemy types', () => {
        expect(types.length).toBe(29);
    });

    for (const type of types) {
        it(`${type}: runs 300 ticks without throwing, velocity stays bounded`, () => {
            const enemy = mockEnemy(type);
            const { gameEngine } = mockWorld(enemy);
            const maxSpeed = (enemy.config.brain && enemy.config.brain.maxSpeed) || enemy.config.speed || 3;

            let now = 1000;
            for (let i = 0; i < 300; i++) {
                frameClock.now = now;
                frameClock.tick = i;
                expect(() => updateBrain(enemy, gameEngine)).not.toThrow();
                // Integrate position exactly like enemy.update() does.
                enemy.x += enemy.vel.x * GAME_CONFIG.TICK_SCALE;
                enemy.y += enemy.vel.y * GAME_CONFIG.TICK_SCALE;
                // Velocity stays bounded. The steering CRUISE component is
                // clamped to maxSpeed by the integrator; the dart/juke overlay
                // (brain.js applyDartOverlay) layers a decaying burst of up to
                // 2× cruise ON TOP, so peak speed during a dart is ~3× cruise.
                // The bound (3.0× + epsilon) proves the integrator clamps cruise
                // and the dart impulse never runs away / NaNs.
                const spd = Math.hypot(enemy.vel.x, enemy.vel.y);
                expect(spd).toBeLessThanOrEqual(maxSpeed * 3.0 + 0.5);
                // No NaNs.
                expect(Number.isFinite(enemy.x)).toBe(true);
                expect(Number.isFinite(enemy.y)).toBe(true);
                expect(Number.isFinite(enemy.vel.x)).toBe(true);
                now += 16;
            }
        });
    }

    it('a brawler closes distance toward the player over time', () => {
        // GUARDIAN is a brute with close_distance — it should end nearer the
        // player than it started (no obstacle directly blocking the lane here).
        const enemy = mockEnemy('GUARDIAN');
        enemy.x = 200; enemy.y = 200;
        const player = { x: 1200, y: 900, vel: { x: 0, y: 0 }, radius: 15 };
        const gameEngine = { asteroidPool: { activeObjects: [] }, enemyPool: { activeObjects: [enemy] } };
        enemy.targetPlayer = player;
        const startDist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        let now = 1000;
        for (let i = 0; i < 400; i++) {
            frameClock.now = now; frameClock.tick = i;
            updateBrain(enemy, gameEngine);
            enemy.x += enemy.vel.x * GAME_CONFIG.TICK_SCALE;
            enemy.y += enemy.vel.y * GAME_CONFIG.TICK_SCALE;
            now += 16;
        }
        const endDist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        expect(endDist).toBeLessThan(startDist);
    });

    it('a sniper keeps its distance (does not crash into the player)', () => {
        // SENTINEL kites; starting close, it should retreat to roughly its
        // preferred range rather than ram the player.
        const enemy = mockEnemy('SENTINEL');
        enemy.x = 850; enemy.y = 620; // very close to player
        const player = { x: 900, y: 600, vel: { x: 0, y: 0 }, radius: 15 };
        const gameEngine = { asteroidPool: { activeObjects: [] }, enemyPool: { activeObjects: [enemy] } };
        enemy.targetPlayer = player;
        let now = 1000;
        for (let i = 0; i < 300; i++) {
            frameClock.now = now; frameClock.tick = i;
            updateBrain(enemy, gameEngine);
            enemy.x += enemy.vel.x * GAME_CONFIG.TICK_SCALE;
            enemy.y += enemy.vel.y * GAME_CONFIG.TICK_SCALE;
            now += 16;
        }
        const endDist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        // Should have backed off to a meaningful fraction of preferred range.
        expect(endDist).toBeGreaterThan(120);
    });
});
