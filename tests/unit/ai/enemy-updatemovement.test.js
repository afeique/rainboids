// Regression guard for the `updateBrain is not defined` game-loop crash.
//
// This drives the REAL Enemy class through `updateMovement()` — the exact path
// the game loop takes (enemy.update → updateMovement → updateBrain). The
// existing brain-runtime test imports updateBrain DIRECTLY, so it cannot catch a
// missing/broken `import { updateBrain }` inside enemy.js — that only throws when
// the call executes via the class method. `node --check` (syntax) and the
// boot-graph import walk both pass even when the import is absent, because the
// undefined reference only blows up at call time. This test closes that gap:
// if the brain hook or its import regress, this fails instead of the player.
import { describe, it, expect } from '@jest/globals';

// Browser shims for modules that touch window/document at import time.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = { innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = { createElement: () => ({ getContext: () => ({}) }),
        addEventListener() {}, getElementById: () => null };
}

const { Enemy } = await import('../../../js/modules/enemy/enemy.js');
const { ENEMY_TYPES } = await import('../../../js/modules/enemy/enemy-data.js');
const { frameClock } = await import('../../../js/modules/core/frame-clock.js');

function mockGE(enemy) {
    return { asteroidPool: { activeObjects: [] }, enemyPool: { activeObjects: [enemy] } };
}

describe('Enemy.updateMovement → updateBrain (crash regression guard)', () => {
    it('a brained enemy survives updateMovement without throwing (the reported crash)', () => {
        frameClock.now = 1000; frameClock.tick = 1;
        const e = new Enemy(100, 100, 'HUNTER', 1);
        e.targetPlayer = { x: 600, y: 400, vel: { x: 2, y: -1 }, radius: 15 };
        // This is the literal failing frame: enemy.js:updateMovement → updateBrain.
        expect(() => e.updateMovement(mockGE(e))).not.toThrow();
    });

    it('every brained archetype runs updateMovement clean for several ticks', () => {
        const brained = Object.keys(ENEMY_TYPES).filter(t => ENEMY_TYPES[t].brain);
        expect(brained.length).toBeGreaterThan(0); // there ARE brained types
        for (const type of brained) {
            const e = new Enemy(200, 200, type, 1);
            e.targetPlayer = { x: 900, y: 600, vel: { x: 1, y: 1 }, radius: 15 };
            const ge = mockGE(e);
            let now = 1000;
            const run = () => {
                for (let i = 0; i < 20; i++) {
                    frameClock.now = now; frameClock.tick = i;
                    e.updateMovement(ge);
                    now += 16;
                }
            };
            // Surface which archetype broke by tagging any thrown error.
            try { run(); } catch (err) { throw new Error(`archetype ${type}: ${err.message}`); }
        }
    });
});
