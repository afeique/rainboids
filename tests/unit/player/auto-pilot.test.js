/**
 * tests/unit/player/auto-pilot.test.js
 *
 * Unit tests for js/modules/player/auto-pilot.js. The AutoPilot writes
 * up/down/left/right onto a synthetic inputHandler.input. These tests
 * fake the engine with the minimum surface area the auto-pilot reads.
 */

// Browser shims for game module imports.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {}, classList: { add() {}, remove() {}, toggle() {} } },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { maxTouchPoints: 0 };
}

import { AutoPilot } from '../../../js/modules/player/auto-pilot.js';

// Synthetic engine: minimum surface the AutoPilot reads.
function makeEngine(overrides = {}) {
    const player = { x: 1000, y: 1000, active: true, ...(overrides.player || {}) };
    const radialOpen = overrides.radialOpen || false;
    const input = {
        up: false, down: false, left: false, right: false,
        aimX: 1500, aimY: 1000,    // aiming to the right (+x)
        screenAimX: 0, screenAimY: 0,
        fire: false, fireSecondary: false, activateSkill: false,
        rotateLeft: false, rotateRight: false,
    };
    return {
        player,
        gameField: overrides.gameField || { width: 2000, height: 2000 },
        width: 1280, height: 720,
        game: { state: overrides.state || 'PLAYING' },
        radialMenu: { isOpen: () => radialOpen, openFor() {}, cancel() {}, handleClick() {} },
        inputHandler: { input },
        asteroidPool: { activeObjects: overrides.asteroids || [] },
        enemyPool: { activeObjects: overrides.enemies || [] },
        enemyBulletPool: { activeObjects: overrides.bullets || [] },
    };
}

describe('AutoPilot.canRun', () => {
    it('returns false when player is not active', () => {
        const engine = makeEngine({ player: { x: 0, y: 0, active: false } });
        const ap = new AutoPilot(engine);
        expect(ap.canRun()).toBe(false);
    });

    it('returns false when radial menu is open', () => {
        const engine = makeEngine({ radialOpen: true });
        const ap = new AutoPilot(engine);
        expect(ap.canRun()).toBe(false);
    });

    it('returns false when game state is not PLAYING', () => {
        const engine = makeEngine({ state: 'PAUSED' });
        const ap = new AutoPilot(engine);
        expect(ap.canRun()).toBe(false);
    });

    it('returns true when in active PLAYING with player active and no radial', () => {
        const engine = makeEngine();
        const ap = new AutoPilot(engine);
        expect(ap.canRun()).toBe(true);
    });
});

describe('AutoPilot.tick — input clearing', () => {
    it('clears movement keys when canRun() is false', () => {
        const engine = makeEngine({ state: 'PAUSED' });
        engine.inputHandler.input.up = true;
        engine.inputHandler.input.left = true;
        const ap = new AutoPilot(engine);
        ap.tick();
        expect(engine.inputHandler.input.up).toBe(false);
        expect(engine.inputHandler.input.left).toBe(false);
    });
});

describe('AutoPilot.tick — dodge behavior', () => {
    it('flips movement when a single threat is close', () => {
        // Threat sits directly above the player (lower y in canvas).
        // The player is aiming to the right (+x), so the ship-local frame
        // has: forward = +x, strafe = +y. Threat is at (1000, 800), player
        // at (1000, 1000). Safety vector points DOWN (+y), which maps to
        // strafe-right in the local frame -> input.right should be true.
        const engine = makeEngine({
            asteroids: [{ x: 1000, y: 800, active: true }],
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        // The auto-pilot should have flipped at least one movement key.
        const i = engine.inputHandler.input;
        const flippedAny = i.up || i.down || i.left || i.right;
        expect(flippedAny).toBe(true);
    });

    it('drifts toward field center when no threats are near', () => {
        // Player far from center; no threats. Should engage idle drift.
        // Use (500, 500) instead of (100, 100) so we're outside the
        // 120px wall margin — the wall-push test below covers the
        // near-wall case. Aim is right (+x); idle drift pushes the
        // safety vector toward +x +y. Forward (along +x) maps to up.
        const engine = makeEngine({
            player: { x: 500, y: 500, active: true },
        });
        engine.inputHandler.input.aimX = 1500;
        engine.inputHandler.input.aimY = 500;
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        // Idle drift toward center (1000, 1000) from (500, 500) ≈
        // normalized vector (1/√2, 1/√2). Aim direction is +x, so
        // local-frame forward = sx ≈ 0.707 → up. Strafe = sy ≈ 0.707 → right.
        expect(i.up).toBe(true);
        expect(i.right).toBe(true);
    });

    it('does nothing when already at center and no threats', () => {
        const engine = makeEngine({
            player: { x: 1000, y: 1000, active: true },
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        expect(i.up).toBe(false);
        expect(i.down).toBe(false);
        expect(i.left).toBe(false);
        expect(i.right).toBe(false);
    });

    it('reacts to wall pressure when near the edge', () => {
        // Player near the right wall of a 2000×2000 field. The default
        // engine aim is at (1500, 1000); player is at (1950, 1000), so
        // the aim direction is (-1, 0) (i.e. aim back to the left).
        // Wall push from the right wall is also (-1, 0). In the local
        // frame with aimAngle = π (cos=-1, sin=0):
        //   forward = sx*(-1) + sy*0 = -sx
        //   strafe  = -sx*0 + sy*(-1) = -sy
        // With sx = -0.583 (wall push), forward = +0.583 → input.up.
        const engine = makeEngine({
            player: { x: 1950, y: 1000, active: true },
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        expect(i.up).toBe(true);
    });

    it('does not throw when threats list is empty', () => {
        const engine = makeEngine();
        const ap = new AutoPilot(engine);
        expect(() => ap.tick()).not.toThrow();
    });

    it('ignores threats far outside the danger radius', () => {
        // Threat at (10000, 10000) is way beyond DANGER_RADIUS (250px).
        const engine = makeEngine({
            asteroids: [{ x: 10000, y: 10000, active: true }],
            player: { x: 1000, y: 1000, active: true },
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        // No threat pressure + already at center -> no movement keys.
        expect(i.up).toBe(false);
        expect(i.down).toBe(false);
        expect(i.left).toBe(false);
        expect(i.right).toBe(false);
    });

    it('classifies mines (enemy bullets) as threats', () => {
        // A mine close to the player should be picked up as a threat
        // and result in SOME movement key being flipped. The exact axis
        // depends on the perpendicular-slide term (which uses the
        // nearest threat's tangent direction), so we assert "moved"
        // rather than a specific direction.
        const mine = { x: 1100, y: 1000, active: true, shape: 'mine' };
        const engine = makeEngine({
            bullets: [mine],
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        const moved = i.up || i.down || i.left || i.right;
        expect(moved).toBe(true);
    });

    it('ignores non-mine enemy bullets that are far away', () => {
        // A regular bullet 200px away — far enough that the half-danger
        // window (125px) skips it. Should NOT count as a threat.
        const bullet = { x: 1200, y: 1000, active: true, shape: 'normal' };
        const engine = makeEngine({
            bullets: [bullet],
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        // No threats + player at center → no movement.
        expect(i.up).toBe(false);
        expect(i.down).toBe(false);
        expect(i.left).toBe(false);
        expect(i.right).toBe(false);
    });
});
