// Unit tests for EngineDriver's hybrid-solo wiring.
//
// Pins the Phase 2 contract for `startSolo({ useLoopback })` laid out in
// the Hybrid Solo↔MP unification rollout (2026-05-13):
//
//   - `startSolo()` (no opts, OR `useLoopback: false`) — legacy solo
//     path. No Predictor, no Interpolator, no connection. `isOnline`
//     stays false. `tick()` is a no-op. This MUST be byte-for-byte
//     identical to pre-Phase-2 behavior so existing call sites are
//     unaffected.
//
//   - `startSolo({ useLoopback: true })` — hybrid path. The driver
//     constructs a `LoopbackConnection` internally, synthesizes a
//     `welcome` payload, and delegates to `startOnline()`. Same
//     Predictor + Interpolator pipeline as actual multiplayer; the
//     ONLY difference is where the snapshot bytes come from. After
//     this call, `isOnline` returns `true`.
//
//   - Mode transitions clean up cleanly:
//       * loopback-solo → legacy-solo: loopback disconnects, MP
//         pipeline torn down.
//       * legacy-solo → loopback-solo: predictor + interpolator
//         engage.
//       * loopback-solo → startOnline(real): loopback disconnects
//         before the real connection is wired.
//
// The driver remains intentionally thin — these tests use fakes for
// everything it composes (GameEngine, LoopbackConnection, Predictor,
// Interpolator) so the asserted behavior is exclusively the wiring
// contract.

import { describe, test, expect, jest } from '@jest/globals';
import {
    EngineDriver,
    ENGINE_MODE_SOLO,
    ENGINE_MODE_ONLINE,
} from '../../../js/engine/engine-driver.js';

// ── Fakes ────────────────────────────────────────────────────────────────────

class StubGameEngine {
    constructor() {
        this.calls = [];
    }
    hasSavedRun() { return false; }
    triggerTitleStart(start) {
        this.calls.push('triggerTitleStart');
        start();
        return true;
    }
    startNewRun() { this.calls.push('startNewRun'); }
    startContinueRun() { this.calls.push('startContinueRun'); }
}

class StubOverlay {
    constructor() { this.calls = []; }
    show() { this.calls.push('show'); }
    showReconnecting() { this.calls.push('reconnecting'); }
    showDisconnected() { this.calls.push('disconnected'); }
    hide() { this.calls.push('hide'); }
}

/**
 * Fake LoopbackConnection — exposes the surface the engine driver
 * touches: `on(event, fn)`, `start()`, `disconnect()`, `sendInput(...)`,
 * `playerId`, `session`. Records every emitted event payload and every
 * input call so tests can poke individual sites.
 */
class FakeLoopback {
    constructor(opts = {}) {
        this.constructorOpts = opts;
        this._playerId = opts.playerId ?? 1;
        this.session = opts.sessionId ?? 'solo-loopback';
        this.serverTimeMs = opts.serverTimeMs ?? 0;
        this.state = 'idle';
        this._listeners = new Map();
        this.startCalls = 0;
        this.disconnectCalls = 0;
        this.inputsSent = [];
        this.sendInputThrowsNext = false;
    }
    get playerId() { return this._playerId; }
    on(event, fn) {
        let set = this._listeners.get(event);
        if (!set) {
            set = new Set();
            this._listeners.set(event, set);
        }
        set.add(fn);
        return () => set.delete(fn);
    }
    emit(event, payload) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of set) fn(payload);
    }
    start() {
        this.startCalls += 1;
        this.state = 'open';
    }
    disconnect() {
        this.disconnectCalls += 1;
        this.state = 'closed';
        this.emit('disconnect');
    }
    sendInput(tick, packed) {
        if (this.sendInputThrowsNext) {
            this.sendInputThrowsNext = false;
            throw new Error('sendInput: forced test failure');
        }
        this.inputsSent.push({ tick, packed });
    }
}

/**
 * Fake real ConnectionTask — used to verify the loopback gets cleanly
 * disconnected when a real MP connection takes over (the "loopback-solo
 * → startOnline(real)" transition).
 */
class FakeRealConnection {
    constructor() {
        this.playerId = 7n;
        this.session = 'real-connection-session-uuid';
        this.state = 'welcomed';
        this._listeners = new Map();
        this.disconnectCalls = 0;
        this.inputsSent = [];
    }
    on(event, fn) {
        let set = this._listeners.get(event);
        if (!set) {
            set = new Set();
            this._listeners.set(event, set);
        }
        set.add(fn);
        return () => set.delete(fn);
    }
    emit(event, payload) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of set) fn(payload);
    }
    disconnect() {
        this.disconnectCalls += 1;
        this.state = 'closed';
        this.emit('disconnect');
    }
    sendInput(tick, packed) {
        this.inputsSent.push({ tick, packed });
    }
}

function makeSpyPredictor() {
    const localShipState = { _sentinel: 'predicted-local-ship' };
    let tickCounter = 0;
    const instance = {
        get localShipState() { return localShipState; },
        get tick() { return tickCounter; },
        setBaseline: jest.fn(function (ship, tick) { tickCounter = tick; }),
        applyLocalInput: jest.fn(function () { tickCounter += 1; }),
        onSnapshot: jest.fn(function (serverTick) { tickCounter = serverTick; }),
    };
    return { instance };
}

function makeSpyInterpolator({ samplePayload = null } = {}) {
    const instance = {
        renderDelayMs: 100,
        ingest: jest.fn(),
        sample: jest.fn(function () { return samplePayload; }),
    };
    return { instance };
}

/**
 * Build an EngineDriver wired up with a fake LoopbackConnection ctor
 * plus spy Predictor + Interpolator. The fake loopback instance is
 * captured in `loopbackInstances` (most recent at index 0) so tests
 * can poke the latest constructed instance.
 */
function makeSoloDriver({ samplePayload = null } = {}) {
    const ge = new StubGameEngine();
    const overlayCtor = jest.fn(function () { return new StubOverlay(); });
    const spyPred = makeSpyPredictor();
    const spyInterp = makeSpyInterpolator({ samplePayload });
    const loopbackInstances = [];
    const LoopbackCtor = jest.fn(function (opts) {
        const inst = new FakeLoopback(opts);
        loopbackInstances.unshift(inst);
        return inst;
    });
    const driver = new EngineDriver({
        gameEngine: ge,
        deps: {
            Overlay: overlayCtor,
            document: globalThis.document ?? null,
            Predictor: jest.fn(function () { return spyPred.instance; }),
            Interpolator: jest.fn(function () { return spyInterp.instance; }),
            LoopbackConnection: LoopbackCtor,
            renderDelayMs: 100,
            dt: 1 / 60,
        },
    });
    return {
        driver,
        ge,
        spyPred,
        spyInterp,
        LoopbackCtor,
        loopbackInstances,
        latestLoopback: () => loopbackInstances[0],
    };
}

const FRESH_SIM_INPUT = {
    up: false,
    down: false,
    left: false,
    right: true,
    aimX: 100,
    aimY: 0,
    thrustPower: 1.0,
    speedMult: 1,
    thrustersDisabled: false,
    maxV: 3.5,
    friction: 0.7071067811865476,
    velEpsilon: 0.05,
    bounceDamp: 0.8,
};

// ── Test group 1: legacy solo (useLoopback omitted / false) ─────────────────

describe('EngineDriver solo — legacy path (no loopback)', () => {
    test('startSolo() omits useLoopback → isOnline stays false', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo();
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.isOnline).toBe(false);
    });

    test('startSolo({ useLoopback: false }) → isOnline stays false', () => {
        const { driver, LoopbackCtor } = makeSoloDriver();
        driver.startSolo({ useLoopback: false });
        expect(driver.isOnline).toBe(false);
        // Loopback ctor never called — legacy path is unaffected.
        expect(LoopbackCtor).not.toHaveBeenCalled();
    });

    test('legacy solo never instantiates Loopback / Predictor / Interpolator', () => {
        const { driver, LoopbackCtor } = makeSoloDriver();
        driver.startSolo();
        expect(LoopbackCtor).not.toHaveBeenCalled();
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();
        expect(driver.connection).toBeNull();
    });

    test('getLocalShipState() returns null in legacy solo', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo();
        expect(driver.getLocalShipState()).toBeNull();
    });

    test('sampleRemoteShips() returns empty array in legacy solo', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo();
        expect(driver.sampleRemoteShips()).toEqual([]);
    });

    test('tick() is a no-op in legacy solo (no throw, no predictor)', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo();
        expect(() => driver.tick(FRESH_SIM_INPUT)).not.toThrow();
        expect(driver.predictor).toBeNull();
    });
});

// ── Test group 2: hybrid solo (useLoopback: true) ───────────────────────────

describe('EngineDriver solo — hybrid loopback path', () => {
    test('startSolo({ useLoopback: true }) constructs a LoopbackConnection', () => {
        const { driver, LoopbackCtor, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        expect(LoopbackCtor).toHaveBeenCalledTimes(1);
        expect(latestLoopback()).not.toBeUndefined();
    });

    test('isOnline returns true after starting loopback solo', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        // The driver's `isOnline` reflects "MP pipeline is running",
        // regardless of whether the connection is a real socket or a
        // loopback. This is the unification point.
        expect(driver.isOnline).toBe(true);
        expect(driver.mode).toBe(ENGINE_MODE_ONLINE);
    });

    test('Predictor + Interpolator engage in loopback solo', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        expect(driver.predictor).not.toBeNull();
        expect(driver.interpolator).not.toBeNull();
    });

    test('connection field is set to the loopback instance', () => {
        const { driver, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        expect(driver.connection).toBe(latestLoopback());
    });

    test('loopback.start() is called exactly once on entry', () => {
        const { driver, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        expect(latestLoopback().startCalls).toBe(1);
    });

    test('synthetic welcome has playerId / session / serverTimeMs', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        const w = driver.welcome;
        expect(w).not.toBeNull();
        expect(w.playerId).toBeDefined();
        expect(typeof w.session).toBe('string');
        expect(Number.isFinite(Number(w.serverTimeMs))).toBe(true);
    });

    test('synthetic welcome session is "solo-loopback"', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        // The loopback's default session id is 'solo-loopback' (per the
        // scaffold's documented default). Whichever value the driver
        // chose, it should be a non-empty string that includes 'solo' or
        // 'loopback'.
        expect(driver.welcome.session).toMatch(/(solo|loopback)/);
    });

    test('inputs sent via tick() flow through to loopback.sendInput', () => {
        const { driver, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        const lb = latestLoopback();

        driver.tick(FRESH_SIM_INPUT);
        driver.tick({ ...FRESH_SIM_INPUT, left: true, right: false });

        expect(lb.inputsSent).toHaveLength(2);
        // Each sendInput call gets a tick + a packed wire input.
        expect(lb.inputsSent[0].tick).toBe(1);
        expect(lb.inputsSent[1].tick).toBe(2);
        expect(lb.inputsSent[0].packed).toEqual(expect.objectContaining({
            moveX: expect.any(Number),
            moveY: expect.any(Number),
            aimX: expect.any(Number),
            aimY: expect.any(Number),
            buttons: expect.any(Number),
        }));
    });

    test('sampleRemoteShips() returns empty array (solo has no peers)', () => {
        // Even though the MP pipeline is engaged, a loopback session has
        // exactly one ship (the local player). The interpolator's sample
        // is wired but returns no peer ships.
        const { driver } = makeSoloDriver({ samplePayload: null });
        driver.startSolo({ useLoopback: true });
        expect(driver.sampleRemoteShips()).toEqual([]);
    });

    test('getLocalShipState() returns the predictor.localShipState reference', () => {
        const { driver, spyPred } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        // Identity check: solo-loopback reads the locally-predicted ship
        // — same code path as real MP. This is the unification point for
        // the renderer.
        expect(driver.getLocalShipState()).toBe(spyPred.instance.localShipState);
    });

    test('baselineShip option is forwarded to predictor.setBaseline', () => {
        const { driver, spyPred } = makeSoloDriver();
        const baselineShip = {
            player: 1n, x: 960, y: 540, vx: 0, vy: 0, angle: 0,
            hp: 100, shield: 0,
        };
        driver.startSolo({ useLoopback: true, baselineShip });
        expect(spyPred.instance.setBaseline).toHaveBeenCalledTimes(1);
        expect(spyPred.instance.setBaseline).toHaveBeenCalledWith(baselineShip, 0);
    });

    test('baselineShip option is forwarded to LoopbackConnection ctor', () => {
        const { driver, LoopbackCtor } = makeSoloDriver();
        const baselineShip = {
            player: 1n, x: 100, y: 200, vx: 0, vy: 0, angle: 0,
            hp: 100, shield: 0,
        };
        driver.startSolo({ useLoopback: true, baselineShip });
        // Ctor was called with an opts bag that includes baselineShip.
        const ctorOpts = LoopbackCtor.mock.calls[0][0];
        expect(ctorOpts.baselineShip).toBe(baselineShip);
    });
});

// ── Test group 3: mode switching ────────────────────────────────────────────

describe('EngineDriver solo — mode switching', () => {
    test('loopback solo → legacy solo disconnects the loopback', () => {
        const { driver, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        const lb = latestLoopback();
        expect(lb.disconnectCalls).toBe(0);

        // Flip back to legacy solo. The driver must disconnect the
        // loopback as part of `_teardownConnection()`.
        driver.startSolo();

        expect(lb.disconnectCalls).toBe(1);
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.isOnline).toBe(false);
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();
        expect(driver.connection).toBeNull();
    });

    test('legacy solo → loopback solo engages the predictor', () => {
        const { driver } = makeSoloDriver();
        driver.startSolo(); // legacy first
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();

        driver.startSolo({ useLoopback: true });
        expect(driver.predictor).not.toBeNull();
        expect(driver.interpolator).not.toBeNull();
        expect(driver.isOnline).toBe(true);
    });

    test('loopback solo → startOnline(real) disconnects loopback cleanly', () => {
        const { driver, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        const lb = latestLoopback();
        expect(lb.disconnectCalls).toBe(0);

        const realConn = new FakeRealConnection();
        driver.startOnline({
            connection: realConn,
            welcome: {
                playerId: 7n,
                session: 'a'.repeat(36),
                serverTimeMs: 0n,
            },
        });

        // Loopback torn down; real connection takes over.
        expect(lb.disconnectCalls).toBe(1);
        expect(driver.connection).toBe(realConn);
        expect(driver.mode).toBe(ENGINE_MODE_ONLINE);
    });

    test('two consecutive loopback solos produce two distinct loopbacks', () => {
        // Each `startSolo({ useLoopback: true })` should construct a
        // FRESH loopback (the previous one is torn down). This pins the
        // "session-scoped state" invariant — no stale tick counters or
        // pending inputs bleeding across runs.
        const { driver, LoopbackCtor, loopbackInstances } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        const first = loopbackInstances[0];
        driver.startSolo({ useLoopback: true });
        const second = loopbackInstances[0];

        expect(LoopbackCtor).toHaveBeenCalledTimes(2);
        expect(second).not.toBe(first);
        // The first loopback was disconnected during the second startSolo.
        expect(first.disconnectCalls).toBe(1);
    });

    test('quit() after loopback solo disconnects the loopback', () => {
        const { driver, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        const lb = latestLoopback();

        driver.quit();

        expect(lb.disconnectCalls).toBe(1);
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.connection).toBeNull();
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();
    });
});

// ── Test group 4: snapshot dispatch in loopback solo ────────────────────────

describe('EngineDriver solo — snapshot dispatch in loopback mode', () => {
    test('loopback-emitted snapshots flow through to predictor + interpolator', () => {
        const { driver, spyPred, spyInterp, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        const lb = latestLoopback();

        // The driver's welcome.playerId comes from the loopback (defaults
        // to 1). So a ship with player=1 is treated as local.
        const localShip = {
            player: 1, x: 500, y: 500, vx: 0, vy: 0, angle: 0, hp: 100,
        };
        lb.emit('snapshot', {
            tick: 17,
            baseTick: null,
            payload: {
                ships: [localShip],
                enemies: [],
                asteroids: [],
                drops: [],
            },
            recvTime: 1234,
        });

        // Local ship reconciled.
        expect(spyPred.instance.onSnapshot).toHaveBeenCalledTimes(1);
        expect(spyPred.instance.onSnapshot).toHaveBeenCalledWith(17, localShip);
        // Interpolator still ingests (with empty remote-ships array) —
        // matches the "every snapshot drives a beat" contract.
        expect(spyInterp.instance.ingest).toHaveBeenCalledTimes(1);
        expect(spyInterp.instance.ingest.mock.calls[0][1].ships).toEqual([]);
    });

    test('loopback disconnect downgrades the driver back to solo', () => {
        const { driver, latestLoopback } = makeSoloDriver();
        driver.startSolo({ useLoopback: true });
        const lb = latestLoopback();
        expect(driver.isOnline).toBe(true);

        // Loopback emits disconnect (simulating teardown).
        lb.disconnect();

        // Driver downgrades to solo mode.
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.isOnline).toBe(false);
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();
    });
});
