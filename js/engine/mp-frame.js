// MP frame hooks — pure helpers wiring `EngineDriver` into the gameLoop.
//
// The gameLoop in `js/modules/game-engine.js` runs THREE thin hooks per
// frame in multiplayer mode (and zero in solo). Each hook is a pure
// function so it can be unit-tested without spinning up the full
// `GameEngine` (which pulls in canvas, audio, WebGL renderers, the
// whole world). The instance methods in `GameEngine` delegate to these
// functions verbatim.
//
// ── MVD scope (2026-05-13) ──────────────────────────────────────────────
//
//   1. `mpBuildSimInput(input, player, GAME_CONFIG)`
//      Builds the `InputFrame` shape that `js/sim/ship.js::updateShip`
//      consumes. The same shape that Player.update synthesizes inline
//      for its own physics call; we mirror it here so the Predictor's
//      replay stays bit-equal to the local physics until a server
//      snapshot arrives.
//
//   2. `mpApplyPredictedShipToPlayer(driver, player)`
//      Reads `driver.getLocalShipState()` and mirrors x/y/vx/vy/angle
//      into the live Player. Renderer/camera/FX/collision all keep
//      reading `player.x/y/vel/angle` unchanged; those fields now
//      reflect the server-authoritative + locally-predicted state.
//      No-op when `getLocalShipState()` returns null (e.g. before the
//      first server snapshot has anchored the baseline).
//
//   3. `mpDrawRemoteShips(driver, ctx, drawRemoteShipFn, fallbackRadius?)`
//      Iterates `driver.sampleRemoteShips()` and paints each at its
//      interpolated position via the injected `drawRemoteShipFn`.
//      The fn is injected (not hard-imported) so the unit tests can
//      assert exactly what gets drawn without spinning up Canvas2D.
//
// ── Solo-mode safety ──
// All three helpers short-circuit when `driver` is null or not online.
// Solo gameplay never reaches them in practice (GameEngine wraps each
// in a `driver.isOnline` guard), but the helpers are defensive in
// their own right so any future caller gets the same contract.

/**
 * Build the SimInput (InputFrame) shape the Predictor's physics step
 * consumes. Mirrors the inline scratch buffer in `js/modules/player/
 * player.js::update` — see the "Physics step" section there. Keeping the
 * shapes identical is what makes Predictor.applyLocalInput produce the
 * same per-tick output as Player.update.
 *
 * `friction`, `velEpsilon`, and `bounceDamp` are constants baked into
 * Player.update; we recompute them here from `GAME_CONFIG` to keep the
 * helper a pure function of its inputs.
 *
 * @param {object} input             raw inputHandler.getInput() shape
 * @param {object|null} player       the local Player (for thrust-power
 *                                   and speed-multiplier reads); when
 *                                   null, sensible defaults apply.
 * @param {object} GAME_CONFIG       game constants module (TICK_SCALE,
 *                                   MAX_V)
 * @returns {object} SimInput (InputFrame)
 */
export function mpBuildSimInput(input, player, GAME_CONFIG) {
    if (!input) input = {};
    const thrustPower = (player && typeof player.thrustPower === 'number')
        ? player.thrustPower
        : (2.0 * (GAME_CONFIG?.TICK_SCALE ?? 0.5));
    const speedMult = (player && typeof player.getMovementSpeedMultiplier === 'function')
        ? player.getMovementSpeedMultiplier()
        : 1;
    const tickScale = GAME_CONFIG?.TICK_SCALE ?? 0.5;
    const maxV = GAME_CONFIG?.MAX_V ?? (7 * tickScale);
    return {
        up: !!input.up,
        down: !!input.down,
        left: !!input.left,
        right: !!input.right,
        aimX: input.aimX,
        aimY: input.aimY,
        thrustPower,
        speedMult,
        thrustersDisabled: !!(player && player.thrustersDisabled),
        maxV,
        friction: Math.pow(0.50, tickScale),
        velEpsilon: 0.05,
        bounceDamp: 0.8,
    };
}

/**
 * Mirror the predictor's localShipState into the live Player object.
 * No-op when the driver is null, not online, or the predictor hasn't
 * anchored a baseline yet.
 *
 * Mutates `player` in place. Touches ONLY prediction-relevant fields
 * (x, y, vel.x, vel.y, angle). Local-only state (hp, shield, maxHp,
 * active, radius, weapons, powerups, …) is left alone — MVD scope is
 * movement-only.
 *
 * @param {object|null} driver
 * @param {object|null} player
 * @returns {boolean} true if mirroring happened, false otherwise.
 *                    Useful for tests; the gameLoop doesn't read it.
 */
export function mpApplyPredictedShipToPlayer(driver, player) {
    if (!driver || !driver.isOnline) return false;
    if (typeof driver.getLocalShipState !== 'function') return false;
    if (!player) return false;
    const predicted = driver.getLocalShipState();
    if (!predicted) return false;
    if (typeof predicted.x !== 'number' || typeof predicted.y !== 'number') return false;
    player.x = predicted.x;
    player.y = predicted.y;
    if (player.vel) {
        player.vel.x = predicted.vx;
        player.vel.y = predicted.vy;
    }
    player.angle = predicted.angle;
    return true;
}

/**
 * Paint remote-peer ships at their interpolated positions. Iterates
 * `driver.sampleRemoteShips()` and calls `drawRemoteShipFn(ctx, x, y,
 * angle, radius)` for each. Caller is responsible for the world-space
 * camera transform (this helper assumes `ctx` is already set up).
 *
 * No-op when the driver is null, not online, or there are no remote
 * ships to draw.
 *
 * @param {object|null} driver
 * @param {CanvasRenderingContext2D|null} ctx
 * @param {Function} drawRemoteShipFn   (ctx, x, y, angle, radius) → void
 * @param {number} [fallbackRadius=12]   radius if remote ship has none
 * @returns {number} count of remote ships drawn
 */
export function mpDrawRemoteShips(driver, ctx, drawRemoteShipFn, fallbackRadius = 12) {
    if (!driver || !driver.isOnline) return 0;
    if (!ctx || typeof drawRemoteShipFn !== 'function') return 0;
    if (typeof driver.sampleRemoteShips !== 'function') return 0;
    const remotes = driver.sampleRemoteShips();
    if (!Array.isArray(remotes) || remotes.length === 0) return 0;
    let drawn = 0;
    for (let i = 0; i < remotes.length; i++) {
        const s = remotes[i];
        if (!s) continue;
        if (typeof s.x !== 'number' || typeof s.y !== 'number') continue;
        const r = (typeof s.radius === 'number' && s.radius > 0) ? s.radius : fallbackRadius;
        drawRemoteShipFn(ctx, s.x, s.y, s.angle ?? 0, r);
        drawn++;
    }
    return drawn;
}
