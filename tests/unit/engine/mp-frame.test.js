// Unit tests for the multiplayer gameLoop hooks in `js/engine/mp-frame.js`.
//
// These pin the Phase-3 MVD wiring (2026-05-13): three thin hooks that
// the live gameLoop in `js/modules/game-engine.js` calls each frame to
// (a) drive the EngineDriver's tick, (b) mirror the predictor's
// localShipState into the live Player, and (c) paint remote-peer ships
// at their interpolated positions.
//
// The tests use a real `EngineDriver` instance with stub Predictor +
// Interpolator + Connection (same fakes the existing engine-driver-mp
// tests use), then exercise the hook functions directly. No GameEngine,
// no canvas — pure JS in jsdom.

import { describe, test, expect, jest } from '@jest/globals';
import {
    EngineDriver,
    ENGINE_MODE_SOLO,
    ENGINE_MODE_ONLINE,
} from '../../../js/engine/engine-driver.js';
import {
    mpBuildSimInput,
    mpApplyPredictedShipToPlayer,
    mpDrawRemoteShips,
} from '../../../js/engine/mp-frame.js';

// ── Stub GAME_CONFIG ──────────────────────────────────────────────────────
// Mirrors the constants Player.update + the predictor's physics step
// consume. Keeping these in sync with `js/modules/core/constants.js` is
// part of the MVD invariant — the build helper exists so the predictor's
// physics call produces the same per-tick output as Player.update.
const STUB_CONFIG = {
    TICK_SCALE: 30 / 60,
    MAX_V: 7 * (30 / 60),
    LOGIC_TICK_MS: 1000 / 60,
    LOGIC_HZ: 60,
};

// ── Fakes ────────────────────────────────────────────────────────────────

class StubGameEngine {
    constructor() { this.calls = []; }
    hasSavedRun() { return false; }
    triggerTitleStart(start) { this.calls.push('triggerTitleStart'); start(); return true; }
    startNewRun() { this.calls.push('startNewRun'); }
    startContinueRun() { this.calls.push('startContinueRun'); }
}

class FakeConnection {
    constructor() {
        this.playerId = 1n;
        this.session = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeffff';
        this.state = 'welcomed';
        this._listeners = new Map();
        this.inputsSent = [];
    }
    on(event, fn) {
        let set = this._listeners.get(event);
        if (!set) { set = new Set(); this._listeners.set(event, set); }
        set.add(fn);
        return () => set.delete(fn);
    }
    emit(event, payload) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of set) fn(payload);
    }
    disconnect() { this.state = 'closed'; this.emit('disconnect'); }
    sendInput(tick, packed) { this.inputsSent.push({ tick, packed }); }
}

class StubOverlay {
    show() {} showReconnecting() {} showDisconnected() {} hide() {}
}

function makeSpyPredictor() {
    const localShipState = {
        player: 1n,
        x: 500, y: 300,
        vx: 1.5, vy: -0.5,
        angle: 0.25,
        hp: 40, maxHp: 40, shield: 15,
    };
    let tickCounter = 0;
    return {
        get localShipState() { return localShipState; },
        get tick() { return tickCounter; },
        setBaseline: jest.fn((ship, tick) => { tickCounter = tick; }),
        applyLocalInput: jest.fn((_input) => { tickCounter += 1; }),
        onSnapshot: jest.fn((serverTick, _ship) => { tickCounter = serverTick; }),
        _setLocal: (x, y, vx, vy, angle) => {
            localShipState.x = x;
            localShipState.y = y;
            localShipState.vx = vx;
            localShipState.vy = vy;
            localShipState.angle = angle;
        },
    };
}

function makeSpyInterpolator({ samplePayload = null } = {}) {
    return {
        renderDelayMs: 100,
        ingest: jest.fn(),
        sample: jest.fn(() => samplePayload),
    };
}

function makeMpDriver({ samplePayload = null } = {}) {
    const ge = new StubGameEngine();
    const spyPred = makeSpyPredictor();
    const spyInterp = makeSpyInterpolator({ samplePayload });
    let nowValue = 1000;
    const driver = new EngineDriver({
        gameEngine: ge,
        deps: {
            Overlay: function () { return new StubOverlay(); },
            document: globalThis.document ?? null,
            Predictor: function () { return spyPred; },
            Interpolator: function () { return spyInterp; },
            renderDelayMs: 100,
            dt: 1 / 60,
            now: () => nowValue,
        },
    });
    return { driver, spyPred, spyInterp, setNow: (v) => { nowValue = v; } };
}

const WELCOME = {
    playerId: 1n,
    session: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeffff',
    serverTimeMs: 0n,
};

// Standard raw `inputHandler.getInput()` shape — keys + aim.
const RAW_INPUT_FORWARD = {
    up: true,
    down: false,
    left: false,
    right: false,
    aimX: 800,
    aimY: 200,
    fire: false,
    fireSecondary: false,
};

// Minimal Player-like object that the hooks read from / write to.
function makePlayer({ x = 100, y = 200, vx = 0, vy = 0, angle = 0 } = {}) {
    return {
        x, y,
        vel: { x: vx, y: vy },
        angle,
        thrustPower: 2.0 * STUB_CONFIG.TICK_SCALE,
        thrustersDisabled: false,
        radius: 12,
        getMovementSpeedMultiplier() { return 1.0; },
    };
}

// ── mpBuildSimInput — output shape + value tests ────────────────────────────

describe('mpBuildSimInput — pure builder', () => {
    test('returns the full SimInput shape with all required fields', () => {
        const player = makePlayer();
        const sim = mpBuildSimInput(RAW_INPUT_FORWARD, player, STUB_CONFIG);
        expect(sim).toEqual({
            up: true,
            down: false,
            left: false,
            right: false,
            aimX: 800,
            aimY: 200,
            thrustPower: 2.0 * STUB_CONFIG.TICK_SCALE,
            speedMult: 1.0,
            thrustersDisabled: false,
            maxV: STUB_CONFIG.MAX_V,
            friction: Math.pow(0.50, STUB_CONFIG.TICK_SCALE),
            velEpsilon: 0.05,
            bounceDamp: 0.8,
        });
    });

    test('coerces directional booleans defensively', () => {
        const player = makePlayer();
        const sim = mpBuildSimInput({
            up: 1, down: 0, left: 'yes', right: undefined,
            aimX: 0, aimY: 0,
        }, player, STUB_CONFIG);
        expect(sim.up).toBe(true);
        expect(sim.down).toBe(false);
        expect(sim.left).toBe(true);   // truthy string
        expect(sim.right).toBe(false);
    });

    test('reads thrustPower + speedMult from the player when present', () => {
        const player = makePlayer();
        player.thrustPower = 5.5;
        player.getMovementSpeedMultiplier = () => 2.3;
        const sim = mpBuildSimInput(RAW_INPUT_FORWARD, player, STUB_CONFIG);
        expect(sim.thrustPower).toBe(5.5);
        expect(sim.speedMult).toBe(2.3);
    });

    test('falls back to defaults when player is null', () => {
        const sim = mpBuildSimInput(RAW_INPUT_FORWARD, null, STUB_CONFIG);
        expect(sim.thrustPower).toBe(2.0 * STUB_CONFIG.TICK_SCALE);
        expect(sim.speedMult).toBe(1);
        expect(sim.thrustersDisabled).toBe(false);
    });

    test('propagates the thrustersDisabled flag from the player', () => {
        const player = makePlayer();
        player.thrustersDisabled = true;
        const sim = mpBuildSimInput(RAW_INPUT_FORWARD, player, STUB_CONFIG);
        expect(sim.thrustersDisabled).toBe(true);
    });
});

// ── mpApplyPredictedShipToPlayer — mirroring contract ──────────────────────

describe('mpApplyPredictedShipToPlayer — mirrors predictor state', () => {
    test('mirrors x/y/vx/vy/angle from predictor.localShipState', () => {
        const { driver, spyPred } = makeMpDriver();
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });
        spyPred._setLocal(742, 311, 2.1, -1.3, 1.7);

        const player = makePlayer({ x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
        const ok = mpApplyPredictedShipToPlayer(driver, player);

        expect(ok).toBe(true);
        expect(player.x).toBe(742);
        expect(player.y).toBe(311);
        expect(player.vel.x).toBe(2.1);
        expect(player.vel.y).toBe(-1.3);
        expect(player.angle).toBe(1.7);
    });

    test('does NOT touch local-only fields (hp, shield, radius, …)', () => {
        const { driver } = makeMpDriver();
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });

        const player = makePlayer();
        player.health = 25;
        player.shield = 8;
        player.activeSkill = 'BULWARK';
        player.thrustLevel = 0.6;
        const beforeHealth = player.health;
        const beforeShield = player.shield;
        const beforeSkill = player.activeSkill;
        const beforeThrust = player.thrustLevel;

        mpApplyPredictedShipToPlayer(driver, player);

        // Only kinematic fields are touched.
        expect(player.health).toBe(beforeHealth);
        expect(player.shield).toBe(beforeShield);
        expect(player.activeSkill).toBe(beforeSkill);
        expect(player.thrustLevel).toBe(beforeThrust);
        expect(player.radius).toBe(12);
    });

    test('returns false when driver is null', () => {
        const player = makePlayer();
        expect(mpApplyPredictedShipToPlayer(null, player)).toBe(false);
        // Player kinematic fields untouched.
        expect(player.x).toBe(100);
        expect(player.y).toBe(200);
    });

    test('returns false in SOLO mode (predictor never instantiated)', () => {
        const { driver } = makeMpDriver();
        // No startOnline — driver stays SOLO.
        expect(driver.isOnline).toBe(false);
        const player = makePlayer();
        const ok = mpApplyPredictedShipToPlayer(driver, player);
        expect(ok).toBe(false);
        expect(player.x).toBe(100);
        expect(player.y).toBe(200);
    });

    test('returns false before any baseline is set (predictor.localShipState null)', () => {
        // Use a minimal stub driver whose getLocalShipState returns null,
        // simulating the "online + no baseline yet" gap (between
        // startOnline and the first server snapshot).
        const driver = {
            isOnline: true,
            getLocalShipState: () => null,
        };
        const player = makePlayer();
        expect(mpApplyPredictedShipToPlayer(driver, player)).toBe(false);
        expect(player.x).toBe(100);
    });

    test('returns false when player is null', () => {
        const { driver } = makeMpDriver();
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });
        expect(mpApplyPredictedShipToPlayer(driver, null)).toBe(false);
    });
});

// ── mpDrawRemoteShips — paints each sampled remote ship once ────────────────

describe('mpDrawRemoteShips — iterates the interpolator output', () => {
    test('calls drawRemoteShipFn once per remote ship with (ctx, x, y, angle, radius)', () => {
        const ship7 = { player: 7n, x: 150, y: 250, vx: 0, vy: 0, angle: 0.5 };
        const ship42 = { player: 42n, x: 800, y: 600, vx: 0, vy: 0, angle: -1.2 };
        const { driver } = makeMpDriver({
            samplePayload: { ships: [ship7, ship42], enemies: [], asteroids: [], drops: [] },
        });
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });

        const ctx = { _id: 'fake-ctx' };
        const drawFn = jest.fn();
        const drawn = mpDrawRemoteShips(driver, ctx, drawFn, 14);

        expect(drawn).toBe(2);
        expect(drawFn).toHaveBeenCalledTimes(2);
        expect(drawFn).toHaveBeenNthCalledWith(1, ctx, 150, 250, 0.5, 14);
        expect(drawFn).toHaveBeenNthCalledWith(2, ctx, 800, 600, -1.2, 14);
    });

    test('uses ship.radius when present, falls back to argument otherwise', () => {
        const shipA = { player: 7n, x: 1, y: 2, angle: 0, radius: 20 };
        const shipB = { player: 8n, x: 3, y: 4, angle: 0 };
        const { driver } = makeMpDriver({
            samplePayload: { ships: [shipA, shipB], enemies: [], asteroids: [], drops: [] },
        });
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });
        const ctx = {};
        const drawFn = jest.fn();
        mpDrawRemoteShips(driver, ctx, drawFn, 12);

        // shipA uses its own radius (20); shipB falls back to 12.
        expect(drawFn.mock.calls[0][4]).toBe(20);
        expect(drawFn.mock.calls[1][4]).toBe(12);
    });

    test('returns 0 when there are no remote ships sampled', () => {
        const { driver } = makeMpDriver({
            samplePayload: { ships: [], enemies: [], asteroids: [], drops: [] },
        });
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });
        const drawFn = jest.fn();
        expect(mpDrawRemoteShips(driver, {}, drawFn, 12)).toBe(0);
        expect(drawFn).not.toHaveBeenCalled();
    });

    test('returns 0 in SOLO mode without invoking sample()', () => {
        const { driver, spyInterp } = makeMpDriver();
        // No startOnline → SOLO.
        const drawFn = jest.fn();
        const drawn = mpDrawRemoteShips(driver, {}, drawFn, 12);
        expect(drawn).toBe(0);
        expect(drawFn).not.toHaveBeenCalled();
        // The interpolator was never even constructed in SOLO mode, so
        // there's nothing to sample anyway.
        expect(spyInterp.sample).not.toHaveBeenCalled();
    });

    test('returns 0 when driver is null', () => {
        const drawFn = jest.fn();
        expect(mpDrawRemoteShips(null, {}, drawFn, 12)).toBe(0);
        expect(drawFn).not.toHaveBeenCalled();
    });

    test('skips ships with non-numeric x/y (defensive)', () => {
        const goodShip = { player: 7n, x: 100, y: 200, angle: 0 };
        const badShip = { player: 8n, x: 'NaN', y: 200, angle: 0 };
        const { driver } = makeMpDriver({
            samplePayload: { ships: [goodShip, badShip], enemies: [], asteroids: [], drops: [] },
        });
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });
        const drawFn = jest.fn();
        const drawn = mpDrawRemoteShips(driver, {}, drawFn, 12);
        expect(drawn).toBe(1);
        expect(drawFn).toHaveBeenCalledTimes(1);
    });
});

// ── End-to-end frame: tick → mirror → render ──────────────────────────────

describe('mp-frame — end-to-end per-frame cycle', () => {
    test('one MP frame: driver.tick advances predictor, mirror updates player, draw paints remotes', () => {
        const remoteShip = { player: 42n, x: 700, y: 350, vx: 0, vy: 0, angle: 0 };
        const { driver, spyPred } = makeMpDriver({
            samplePayload: { ships: [remoteShip], enemies: [], asteroids: [], drops: [] },
        });
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });
        // Pin the predicted state to a known value.
        spyPred._setLocal(123, 456, 0.5, -0.5, 1.0);

        const player = makePlayer({ x: 0, y: 0 });
        const ctx = {};
        const drawFn = jest.fn();

        // ── Hook 1: tick ──
        const simInput = mpBuildSimInput(RAW_INPUT_FORWARD, player, STUB_CONFIG);
        driver.tick(simInput);
        expect(spyPred.applyLocalInput).toHaveBeenCalledTimes(1);
        expect(spyPred.applyLocalInput).toHaveBeenCalledWith(simInput);
        // The driver also sent a wire-form PackedInput to the connection.
        expect(conn.inputsSent).toHaveLength(1);
        expect(conn.inputsSent[0].tick).toBe(1);
        expect(conn.inputsSent[0].packed).toEqual(expect.objectContaining({
            moveX: expect.any(Number),
            moveY: expect.any(Number),
            buttons: expect.any(Number),
        }));

        // ── Hook 2: mirror ──
        mpApplyPredictedShipToPlayer(driver, player);
        expect(player.x).toBe(123);
        expect(player.y).toBe(456);
        expect(player.vel.x).toBe(0.5);
        expect(player.vel.y).toBe(-0.5);
        expect(player.angle).toBe(1.0);

        // ── Hook 3: render ──
        const drawn = mpDrawRemoteShips(driver, ctx, drawFn, player.radius);
        expect(drawn).toBe(1);
        expect(drawFn).toHaveBeenCalledWith(ctx, 700, 350, 0, 12);
    });

    test('SOLO frame: none of the hooks fire (no tick, no mirror, no render)', () => {
        const { driver, spyPred, spyInterp } = makeMpDriver({
            samplePayload: { ships: [{ player: 99n, x: 1, y: 1, angle: 0 }], enemies: [], asteroids: [], drops: [] },
        });
        // No startOnline → stays SOLO.
        expect(driver.isOnline).toBe(false);

        const player = makePlayer({ x: 50, y: 60 });
        const ctx = {};
        const drawFn = jest.fn();

        // Hook 1: tick is a documented no-op in SOLO mode.
        driver.tick(mpBuildSimInput(RAW_INPUT_FORWARD, player, STUB_CONFIG));
        expect(spyPred.applyLocalInput).not.toHaveBeenCalled();

        // Hook 2: mirror returns false; player kinematics untouched.
        const mirrored = mpApplyPredictedShipToPlayer(driver, player);
        expect(mirrored).toBe(false);
        expect(player.x).toBe(50);
        expect(player.y).toBe(60);

        // Hook 3: no draw calls happen.
        const drawn = mpDrawRemoteShips(driver, ctx, drawFn, player.radius);
        expect(drawn).toBe(0);
        expect(drawFn).not.toHaveBeenCalled();
        expect(spyInterp.sample).not.toHaveBeenCalled();
    });

    test('after disconnect — driver downgrades to SOLO and hooks become no-ops', () => {
        const { driver } = makeMpDriver({
            samplePayload: { ships: [{ player: 99n, x: 1, y: 1, angle: 0 }], enemies: [], asteroids: [], drops: [] },
        });
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });
        expect(driver.isOnline).toBe(true);

        // Simulate socket drop.
        conn.emit('disconnect');
        expect(driver.isOnline).toBe(false);

        const player = makePlayer({ x: 11, y: 22 });
        const drawFn = jest.fn();

        // All three hooks are now no-ops.
        expect(mpApplyPredictedShipToPlayer(driver, player)).toBe(false);
        expect(player.x).toBe(11);
        expect(mpDrawRemoteShips(driver, {}, drawFn, 12)).toBe(0);
        expect(drawFn).not.toHaveBeenCalled();
    });
});
