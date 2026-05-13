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

describe('AutoPilot.tick — blended tangent dodge', () => {
    // ── Regression guard for the single-threat case ───────────────────
    //
    // The old logic used only the nearest threat's tangent direction
    // (CCW perpendicular to "toward threat"). The new logic sums tangents
    // across all threats and normalises the result, then applies the
    // same fixed 0.4 weight. With ONE threat the normalised blend just
    // equals "the one threat's tangent direction" — only the SIGN may
    // differ from the old code, because the sign now comes from an
    // edge-aware / velocity / diagonal-fallback reference rather than
    // a hard-coded CCW choice. We assert "some movement key flipped",
    // matching the original single-threat test.
    it('single threat: flips at least one movement key (regression guard)', () => {
        // Threat directly above (canvas-up). Player aiming right.
        const engine = makeEngine({
            asteroids: [{ x: 1000, y: 850, active: true }],
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        const flipped = i.up || i.down || i.left || i.right;
        expect(flipped).toBe(true);
    });

    // ── Cancellation case: two opposite threats ───────────────────────
    //
    // With one threat at (x-100, y) and another at (x+100, y), the radial
    // danger vectors sum to (0, 0). The tangent term breaks the tie:
    // both threats' CCW perpendiculars are along ±y, and the diagonal
    // reference (0.707, 0.707) signs them so they AGREE (instead of
    // cancelling). Result: a stable, non-random push perpendicular to
    // the threat axis.
    it('two opposite threats: tangent breaks tie deterministically', () => {
        const threats = [
            { x: 900,  y: 1000, active: true },
            { x: 1100, y: 1000, active: true },
        ];
        const engine = makeEngine({ asteroids: threats });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        const firstSnapshot = { up: i.up, down: i.down, left: i.left, right: i.right };
        const moved = i.up || i.down || i.left || i.right;
        expect(moved).toBe(true);

        // Tick again — same result, no randomness.
        ap.tick();
        const i2 = engine.inputHandler.input;
        expect({ up: i2.up, down: i2.down, left: i2.left, right: i2.right }).toEqual(firstSnapshot);
    });

    // ── Both threats on the same side ─────────────────────────────────
    //
    // Two threats clustered to the left of the player. Their radial
    // pushes both point right (+x) and ADD together — but the radial
    // 1/d² magnitudes (~0.016) are well below the 0.18 input threshold.
    // The dominant signal is the blended tangent (fixed 0.4 magnitude)
    // perpendicular to the mean threat direction. With threats on the
    // -x side, tangent is along ±y; with the diagonal reference it
    // resolves to +y → strafe-right under +x aim. So input.right fires
    // and the ship slides perpendicular to the cluster.
    it('two threats on same side: produces movement perpendicular to cluster', () => {
        const threats = [
            { x: 900, y: 950,  active: true },
            { x: 900, y: 1050, active: true },
        ];
        const engine = makeEngine({ asteroids: threats });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        // Tangent dominates → +y strafe → input.right under +x aim.
        // (Radial would push +x → input.up, but its 0.016 magnitude
        // is below the 0.18 threshold; only tangent crosses it.)
        expect(i.right).toBe(true);
        expect(i.left).toBe(false);
    });

    // ── Three roughly-equidistant threats ─────────────────────────────
    //
    // Threats at 120° spacing around the player at distance ~100. Radial
    // sum is exactly zero (perfect symmetry). The blended tangent term
    // is what saves the ship from freezing in place — its summed unit
    // tangents (signed against the diagonal reference) don't cancel,
    // producing a non-zero unit-direction that becomes a 0.4-magnitude
    // push.
    it('three equidistant threats: non-zero move (tangents do not cancel)', () => {
        const r = 100;
        const cx = 1000, cy = 1000;
        const a1 = { x: cx + r * Math.cos(0),               y: cy + r * Math.sin(0),               active: true };
        const a2 = { x: cx + r * Math.cos(2 * Math.PI / 3), y: cy + r * Math.sin(2 * Math.PI / 3), active: true };
        const a3 = { x: cx + r * Math.cos(4 * Math.PI / 3), y: cy + r * Math.sin(4 * Math.PI / 3), active: true };
        const engine = makeEngine({ asteroids: [a1, a2, a3] });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        const moved = i.up || i.down || i.left || i.right;
        expect(moved).toBe(true);
    });

    // ── Far threat contributes less than near threat in the blend ─────
    //
    // Place a far threat alone and a near threat alone, in scenarios
    // where they would prefer OPPOSITE tangent sides. Then place them
    // TOGETHER and verify the blend follows the near threat (because
    // the near contribution is invD2 ≈ 1/400 vs the far ≈ 1/57600,
    // a 140× ratio). This is the multi-threat "near dominates" guarantee.
    it('blend direction follows the near threat, not the far one', () => {
        // Close threat directly BELOW (dy positive in canvas):
        //   perp_ccw = (1, 0). dot with diagonal ref → sign +1. tangent +x.
        // Far threat to the LEFT (dx negative):
        //   perp_ccw = (0, 1). dot with diagonal ref → sign +1. tangent +y.
        // The blended sum is heavily weighted toward +x (close) over +y (far).
        const engine = makeEngine({
            asteroids: [
                { x: 1000, y: 1020, active: true },  // 20px below (close)
                { x: 760,  y: 1000, active: true },  // 240px left (far)
            ],
            player: { x: 1000, y: 1000, active: true },
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        // Aim is +x. Close threat tangent +x → forward axis → input.up.
        // If the FAR threat dominated instead, tangent would be +y →
        // strafe axis → input.right (and up would be false).
        expect(i.up).toBe(true);
        expect(i.right).toBe(false);
    });

    // ── Threat near a screen edge: tangent picks "away from edge" ─────
    //
    // Player near the LEFT wall with a threat directly above. The
    // edge-aware reference puts rx = +0.8 (slide away from left edge).
    // The threat at (200, 850) has dy = -150 → tangent CCW = (-1, 0).
    // Signed against the edge-aware reference (dot = -0.8 → sign = -1),
    // the tangent becomes (+1, 0): a "slide right, away from left wall"
    // choice. Under aim direction +y this maps to input.left in the
    // local frame (strafe = -sx).
    it('threat near screen edge: tangent slides away from edge', () => {
        // Place player at x = 200 — outside the 120px wall-margin band
        // so wall-push contribution is zero. The reference x-sign comes
        // purely from the edge-aware bias (closer to left than right).
        const engine = makeEngine({
            player: { x: 200, y: 1000, active: true },
            asteroids: [{ x: 200, y: 850, active: true }],  // 150px above
        });
        // Aim along +y → aimAngle = π/2 → forward = sy, strafe = -sx.
        // We expect sx > 0 (tangent slides right, away from left wall) →
        // strafe < 0 → input.left = true.
        engine.inputHandler.input.aimX = 200;
        engine.inputHandler.input.aimY = 1500;
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        expect(i.left).toBe(true);
    });

    // ── Edge of danger range: blend weight is tiny in multi-threat case
    //
    // A threat at 240px contributes invD2 ≈ 1/57600 ≈ 1.7e-5, while a
    // threat at 50px contributes 1/2500 ≈ 4e-4 — a 23× ratio. Even when
    // both threats prefer OPPOSITE tangent sides, the near one's
    // contribution dominates the normalised blend direction.
    it('threat at edge of range: blends with near-zero weight', () => {
        // Close threat at (1050, 1000): dx=50, dy=0. perp_ccw = (0, -1).
        //   dot diagonal ref = -0.707 → sign -1 → tangent (0, +1).
        // Far threat at (1000, 760): dx=0, dy=-240. perp_ccw = (-1, 0).
        //   dot diagonal ref = -0.707 → sign -1 → tangent (+1, 0).
        // The close one is ~23× heavier in the blend, so the normalised
        // result is close to (0, 1) — i.e. strafe-right (+y) under +x aim.
        const engine = makeEngine({
            asteroids: [
                { x: 1050, y: 1000, active: true },  // 50px right (close)
                { x: 1000, y: 760,  active: true },  // 240px above (far)
            ],
            player: { x: 1000, y: 1000, active: true },
        });
        const ap = new AutoPilot(engine);
        ap.tick();
        const i = engine.inputHandler.input;
        // Close-threat-led tangent: +y → strafe right under +x aim.
        // If the far threat dominated instead, tangent would be +x →
        // forward → input.up.
        expect(i.right).toBe(true);
        expect(i.up).toBe(false);
    });
});
