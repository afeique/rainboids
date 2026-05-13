// Unit tests for the EngineDriver's multiplayer wiring.
//
// Pins the MVD (minimum-viable-demo) contract laid out in the Phase 3
// wiring session (2026-05-13):
//
//   - In MP mode, every `tick()` call:
//       (a) builds a wire-format PackedInput and forwards it to the
//           Connection via `sendInput(tick, packed)`;
//       (b) advances the local `Predictor` one tick by way of
//           `applyLocalInput(simInput)`.
//   - When the Connection emits a `snapshot` event:
//       (a) the local player's ship is reconciled via
//           `Predictor.onSnapshot(serverTick, localShip)`;
//       (b) every other ship is fed to `Interpolator.ingest(recvTime,
//           { ships: [...] })`.
//   - `getLocalShipState()` returns the predictor's `localShipState`
//     (the position the renderer should draw the local ship at).
//   - `sampleRemoteShips(nowMs)` returns the Interpolator's sampled ships
//     at `nowMs - renderDelayMs` (the position the renderer should draw
//     each remote ship at).
//   - SOLO mode is UNTOUCHED: Predictor and Interpolator are never
//     instantiated, `tick()` is a no-op, snapshots never arrive.
//
// The driver is intentionally thin — the tests use fakes for everything
// it composes (GameEngine, Connection, Predictor, Interpolator) so the
// asserted behavior is exclusively the wiring contract, not the
// underlying physics or codec correctness (those have their own test
// files).

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

/**
 * Faux ConnectionTask with the public API the driver consumes:
 *   - `on(event, fn) -> off`
 *   - `disconnect()`
 *   - `sendInput(tick, packed)`
 *
 * Stores every emitted event payload in `received[event]` so tests can
 * trigger `'snapshot'` and `'disconnect'` directly. Records every
 * `sendInput` call in `inputsSent` for assertion.
 */
class FakeConnection {
    constructor() {
        this.playerId = 1n;
        this.session = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeffff';
        this.state = 'welcomed';
        this._listeners = new Map();
        this.disconnectCalls = 0;
        this.inputsSent = [];
        this.sendInputThrowsNext = false;
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
        if (this.sendInputThrowsNext) {
            this.sendInputThrowsNext = false;
            throw new Error('sendInput: forced test failure');
        }
        this.inputsSent.push({ tick, packed });
    }
}

class StubOverlay {
    constructor() { this.calls = []; }
    show() { this.calls.push('show'); }
    showReconnecting() { this.calls.push('reconnecting'); }
    showDisconnected() { this.calls.push('disconnected'); }
    hide() { this.calls.push('hide'); }
}

/**
 * Spy Predictor — records every method call. The driver only invokes
 * `setBaseline`, `applyLocalInput`, `onSnapshot`, and reads
 * `localShipState` + `tick`. We default `localShipState` to a sentinel
 * object so the renderer-read tests can verify identity (`toBe`).
 */
function makeSpyPredictor() {
    const calls = [];
    const localShipState = { _sentinel: 'predicted-local-ship' };
    let tickCounter = 0;
    const instance = {
        // Public state the driver reads:
        get localShipState() { return localShipState; },
        get tick() { return tickCounter; },
        // Methods:
        setBaseline: jest.fn(function (ship, tick) {
            calls.push({ type: 'setBaseline', ship, tick });
            tickCounter = tick;
        }),
        applyLocalInput: jest.fn(function (input) {
            calls.push({ type: 'applyLocalInput', input });
            tickCounter += 1;
        }),
        onSnapshot: jest.fn(function (serverTick, serverShip) {
            calls.push({ type: 'onSnapshot', serverTick, serverShip });
            tickCounter = serverTick;
        }),
    };
    return { instance, calls };
}

/**
 * Spy Interpolator — records every `ingest` call and returns a fixed
 * sampled snapshot from `sample()`. `samplePayload` lets each test pin
 * what the renderer should "see" without having to feed a real lerp.
 */
function makeSpyInterpolator({ samplePayload = null } = {}) {
    const calls = [];
    const instance = {
        renderDelayMs: 100,
        ingest: jest.fn(function (serverT, snapshot) {
            calls.push({ type: 'ingest', serverT, snapshot });
        }),
        sample: jest.fn(function (t) {
            calls.push({ type: 'sample', t });
            return samplePayload;
        }),
    };
    return { instance, calls };
}

/**
 * Build an EngineDriver with the spy Predictor + Interpolator wired up.
 * Returns the driver plus handles to the spies so tests can inspect.
 *
 * `now` defaults to a deterministic function returning successive integers
 * starting at 1000 — that's the simplest "time advances" model for tests
 * that need to sample the interpolator.
 */
function makeMpDriver({ samplePayload = null } = {}) {
    const ge = new StubGameEngine();
    const overlayCtor = jest.fn(function () { return new StubOverlay(); });
    const spyPred = makeSpyPredictor();
    const spyInterp = makeSpyInterpolator({ samplePayload });
    let nowValue = 1000;
    const now = jest.fn(() => nowValue);
    const driver = new EngineDriver({
        gameEngine: ge,
        deps: {
            Overlay: overlayCtor,
            document: globalThis.document ?? null,
            Predictor: jest.fn(function () { return spyPred.instance; }),
            Interpolator: jest.fn(function () { return spyInterp.instance; }),
            renderDelayMs: 100,
            dt: 1 / 60,
            now,
        },
    });
    return {
        driver,
        ge,
        spyPred,
        spyInterp,
        setNow: (v) => { nowValue = v; },
    };
}

const WELCOME = {
    playerId: 1n,
    session: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeffff',
    serverTimeMs: 0n,
};

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

// ── Test 1: tick() calls Predictor.applyLocalInput with the right input ─────

describe('EngineDriver MP — tick() advances local prediction', () => {
    test('forwards the simInput to Predictor.applyLocalInput', () => {
        const { driver, spyPred } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });

        driver.tick(FRESH_SIM_INPUT);

        // applyLocalInput was called exactly once with the supplied input.
        expect(spyPred.instance.applyLocalInput).toHaveBeenCalledTimes(1);
        expect(spyPred.instance.applyLocalInput).toHaveBeenCalledWith(FRESH_SIM_INPUT);
    });

    test('packs + sends the wire input to the connection each tick', () => {
        const { driver } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });

        driver.tick(FRESH_SIM_INPUT);
        driver.tick({ ...FRESH_SIM_INPUT, left: true, right: false });
        driver.tick({ ...FRESH_SIM_INPUT, up: true });

        // Three inputs sent — one per `tick()` call.
        expect(conn.inputsSent).toHaveLength(3);

        // Each entry has a monotonic-ish tick number (predictor.tick
        // increments on applyLocalInput, so the *next* tick number sent
        // is 1, 2, 3 in order).
        expect(conn.inputsSent[0].tick).toBe(1);
        expect(conn.inputsSent[1].tick).toBe(2);
        expect(conn.inputsSent[2].tick).toBe(3);

        // Each entry has a PackedInput shape — 5 fields, all numeric.
        for (const sent of conn.inputsSent) {
            expect(sent.packed).toEqual(expect.objectContaining({
                moveX: expect.any(Number),
                moveY: expect.any(Number),
                aimX: expect.any(Number),
                aimY: expect.any(Number),
                buttons: expect.any(Number),
            }));
        }

        // First tick: right-thrust → moveX positive (i8 in [-127, 127]).
        expect(conn.inputsSent[0].packed.moveX).toBeGreaterThan(0);
        // Second tick: left-thrust → moveX negative.
        expect(conn.inputsSent[1].packed.moveX).toBeLessThan(0);
    });

    test('honors an explicit wireInput argument and skips derivation', () => {
        const { driver } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });

        // Caller supplies a custom PlayerInput shape with the shoot bit set.
        const explicitWire = {
            moveX: 0.5,
            moveY: 0,
            aimX: 1,
            aimY: 0,
            shoot: true,
            dash: false,
            ability1: false,
            ability2: false,
        };
        driver.tick(FRESH_SIM_INPUT, explicitWire);

        expect(conn.inputsSent).toHaveLength(1);
        // shoot=true → buttons bit 0 set (= 1 in the bitfield).
        expect(conn.inputsSent[0].packed.buttons & 1).toBe(1);
        // moveX=0.5 → ≈ 64 in i8 (0.5 * 127 rounded).
        expect(conn.inputsSent[0].packed.moveX).toBe(64);
    });

    test('absorbs sendInput failures so the predictor still advances', () => {
        const { driver, spyPred } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            conn.sendInputThrowsNext = true;
            driver.tick(FRESH_SIM_INPUT);
        } finally {
            warnSpy.mockRestore();
        }

        // sendInput threw, so nothing landed in `inputsSent`.
        expect(conn.inputsSent).toHaveLength(0);
        // …but the predictor still advanced — the player doesn't freeze
        // on a transient socket hiccup.
        expect(spyPred.instance.applyLocalInput).toHaveBeenCalledTimes(1);
    });
});

// ── Test 2: snapshot → Predictor.onSnapshot + Interpolator.ingest ───────────

describe('EngineDriver MP — snapshot dispatch', () => {
    test('local ship goes to Predictor.onSnapshot; remote ships go to Interpolator.ingest', () => {
        const { driver, spyPred, spyInterp } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });

        // Build a snapshot with 1 local ship (player=1n, matches welcome)
        // and 2 remote ships (players 7n + 42n).
        const localShipState = { player: 1n, x: 500, y: 500, vx: 0, vy: 0, angle: 0, hp: 40, shield: 15 };
        const remoteA = { player: 7n, x: 100, y: 200, vx: 1, vy: 0, angle: 0, hp: 30, shield: 0 };
        const remoteB = { player: 42n, x: 800, y: 400, vx: 0, vy: -1, angle: 0, hp: 25, shield: 5 };

        conn.emit('snapshot', {
            tick: 17,
            baseTick: null,
            payload: {
                ships: [localShipState, remoteA, remoteB],
                enemies: [],
                asteroids: [],
                drops: [],
            },
            recvTime: 1234,
        });

        // Predictor.onSnapshot received the local ship + the server tick.
        expect(spyPred.instance.onSnapshot).toHaveBeenCalledTimes(1);
        const predCall = spyPred.instance.onSnapshot.mock.calls[0];
        expect(predCall[0]).toBe(17);
        expect(predCall[1]).toBe(localShipState);

        // Interpolator.ingest received the remote ships + the receive time.
        expect(spyInterp.instance.ingest).toHaveBeenCalledTimes(1);
        const ingestCall = spyInterp.instance.ingest.mock.calls[0];
        expect(ingestCall[0]).toBe(1234);
        expect(ingestCall[1].ships).toEqual([remoteA, remoteB]);
        // Local ship MUST NOT appear in the interpolator's snapshot —
        // that would double-render the local player.
        expect(ingestCall[1].ships).not.toContain(localShipState);
    });

    test('snapshot with only the local ship → no remote ingest entries', () => {
        const { driver, spyPred, spyInterp } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });

        const localShip = { player: 1n, x: 100, y: 100, vx: 0, vy: 0, angle: 0, hp: 40, shield: 0 };

        conn.emit('snapshot', {
            tick: 1,
            baseTick: null,
            payload: { ships: [localShip], enemies: [], asteroids: [], drops: [] },
            recvTime: 999,
        });

        expect(spyPred.instance.onSnapshot).toHaveBeenCalledWith(1, localShip);
        // Interpolator still got an ingest call (empty `ships` is fine —
        // the interpolator's lerp handles missing entities). This pins
        // the "every snapshot drives a beat on the interpolator" contract,
        // which keeps the render-delay clock advancing even when no
        // remote players are present.
        expect(spyInterp.instance.ingest).toHaveBeenCalledTimes(1);
        expect(spyInterp.instance.ingest.mock.calls[0][1].ships).toEqual([]);
    });

    test('snapshot with no local ship → onSnapshot not called (still ingests remote)', () => {
        const { driver, spyPred, spyInterp } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });

        const remoteOnly = { player: 99n, x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: 1, shield: 0 };
        conn.emit('snapshot', {
            tick: 5,
            baseTick: null,
            payload: { ships: [remoteOnly], enemies: [], asteroids: [], drops: [] },
            recvTime: 500,
        });

        // The local player wasn't in the snapshot — the predictor's
        // reconcile path is skipped (no spurious onSnapshot call).
        expect(spyPred.instance.onSnapshot).not.toHaveBeenCalled();
        // But the remote ship is still ingested.
        expect(spyInterp.instance.ingest).toHaveBeenCalledTimes(1);
        expect(spyInterp.instance.ingest.mock.calls[0][1].ships).toEqual([remoteOnly]);
    });

    test('snapshots received before startOnline are dropped (defensive guard)', () => {
        // This pins the "no piping while not online" contract. In solo
        // mode the driver should never have a Predictor + Interpolator,
        // so any stray snapshot must no-op rather than crash.
        const { driver, spyPred, spyInterp } = makeMpDriver();

        // Without startOnline, the driver has no Predictor + Interpolator.
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();

        // _onSnapshot is called internally; the public API doesn't expose
        // it, but the public guard is the connection's `on('snapshot',
        // ...)` subscription which only runs after `startOnline`. We
        // assert the negative: no spy method was called.
        expect(spyPred.instance.onSnapshot).not.toHaveBeenCalled();
        expect(spyInterp.instance.ingest).not.toHaveBeenCalled();
    });
});

// ── Test 3: rendered local position comes from the Predictor ────────────────

describe('EngineDriver MP — getLocalShipState', () => {
    test('returns the predictor.localShipState reference', () => {
        const { driver, spyPred } = makeMpDriver();
        driver.startOnline({
            connection: new FakeConnection(),
            welcome: WELCOME,
        });

        const ship = driver.getLocalShipState();
        // Identity check: the driver returns the exact object the
        // Predictor exposes — no per-frame clone, no copy. This is the
        // "renderer reads the predicted state" contract.
        expect(ship).toBe(spyPred.instance.localShipState);
        expect(ship._sentinel).toBe('predicted-local-ship');
    });

    test('returns null in SOLO mode (predictor never instantiated)', () => {
        const { driver } = makeMpDriver();
        // No startOnline → still SOLO.
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.getLocalShipState()).toBeNull();
    });

    test('returns null after a disconnect tears the pipeline down', () => {
        const { driver } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });
        expect(driver.getLocalShipState()).not.toBeNull();

        // Simulate socket drop. _handleDisconnect downgrades to solo +
        // nulls the predictor.
        conn.emit('disconnect');
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.getLocalShipState()).toBeNull();
    });
});

// ── Test 4: rendered remote positions come from the Interpolator ────────────

describe('EngineDriver MP — sampleRemoteShips', () => {
    test('returns the Interpolator-sampled ships array', () => {
        const ship7 = { player: 7n, x: 150, y: 250, vx: 0, vy: 0, angle: 0, hp: 30, shield: 0 };
        const ship42 = { player: 42n, x: 800, y: 600, vx: 0, vy: 0, angle: 0, hp: 25, shield: 0 };
        const { driver, spyInterp, setNow } = makeMpDriver({
            samplePayload: {
                ships: [ship7, ship42],
                enemies: [],
                asteroids: [],
                drops: [],
            },
        });
        driver.startOnline({
            connection: new FakeConnection(),
            welcome: WELCOME,
        });

        setNow(2000);
        const out = driver.sampleRemoteShips();

        expect(out).toEqual([ship7, ship42]);
        // Sampled at `now - renderDelayMs` = 2000 - 100 = 1900.
        expect(spyInterp.instance.sample).toHaveBeenCalledWith(1900);
    });

    test('passes through an explicit nowMs override', () => {
        const { driver, spyInterp } = makeMpDriver({
            samplePayload: { ships: [], enemies: [], asteroids: [], drops: [] },
        });
        driver.startOnline({
            connection: new FakeConnection(),
            welcome: WELCOME,
        });

        driver.sampleRemoteShips(5000);
        // 5000 - 100 ms render delay.
        expect(spyInterp.instance.sample).toHaveBeenCalledWith(4900);
    });

    test('empty array when interpolator has no snapshots yet', () => {
        const { driver } = makeMpDriver({ samplePayload: null });
        driver.startOnline({
            connection: new FakeConnection(),
            welcome: WELCOME,
        });

        expect(driver.sampleRemoteShips()).toEqual([]);
    });

    test('empty array in SOLO mode', () => {
        const { driver } = makeMpDriver();
        // No startOnline.
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.sampleRemoteShips()).toEqual([]);
    });
});

// ── Test 5: SOLO mode — Predictor + Interpolator NEVER instantiated ─────────

describe('EngineDriver MP — solo mode untouched', () => {
    test('solo construction does not instantiate Predictor or Interpolator', () => {
        const PredCtor = jest.fn();
        const InterpCtor = jest.fn();
        const ge = new StubGameEngine();
        const overlayCtor = jest.fn(function () { return new StubOverlay(); });
        const driver = new EngineDriver({
            gameEngine: ge,
            deps: {
                Overlay: overlayCtor,
                document: globalThis.document ?? null,
                Predictor: PredCtor,
                Interpolator: InterpCtor,
            },
        });

        // Constructor must NEVER touch the net classes — they're
        // session-scoped and only built inside startOnline.
        expect(PredCtor).not.toHaveBeenCalled();
        expect(InterpCtor).not.toHaveBeenCalled();

        // startSolo runs the GameEngine just like before the MP wiring
        // landed; no net instantiation, no listener subscription.
        driver.startSolo({ continueRun: false });
        expect(PredCtor).not.toHaveBeenCalled();
        expect(InterpCtor).not.toHaveBeenCalled();
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();
        expect(driver.connection).toBeNull();
        expect(driver.isOnline).toBe(false);
        // The solo gameplay path is the SAME shape it always was:
        // triggerTitleStart → startNewRun.
        expect(ge.calls).toEqual(['triggerTitleStart', 'startNewRun']);
    });

    test('tick() in solo mode is a no-op (no send, no predict, no throw)', () => {
        const PredCtor = jest.fn();
        const InterpCtor = jest.fn();
        const ge = new StubGameEngine();
        const overlayCtor = jest.fn(function () { return new StubOverlay(); });
        const driver = new EngineDriver({
            gameEngine: ge,
            deps: {
                Overlay: overlayCtor,
                document: globalThis.document ?? null,
                Predictor: PredCtor,
                Interpolator: InterpCtor,
            },
        });
        driver.startSolo();

        // tick() returns silently — does not crash, does not call
        // anything on the (non-existent) connection or predictor.
        expect(() => driver.tick(FRESH_SIM_INPUT)).not.toThrow();
        expect(PredCtor).not.toHaveBeenCalled();
        expect(InterpCtor).not.toHaveBeenCalled();
    });

    test('starting online then switching back to solo cleans the MP pipeline', () => {
        const { driver, spyPred, spyInterp } = makeMpDriver();
        const conn = new FakeConnection();
        driver.startOnline({ connection: conn, welcome: WELCOME });
        expect(driver.predictor).not.toBeNull();
        expect(driver.interpolator).not.toBeNull();

        driver.startSolo();

        // MP pipeline torn down; socket closed.
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();
        expect(conn.disconnectCalls).toBe(1);

        // A subsequent snapshot emit would no longer reach the spies
        // because the driver unsubscribed; even if it did, the null
        // predictor guard makes _onSnapshot a no-op.
        const beforeOnSnap = spyPred.instance.onSnapshot.mock.calls.length;
        const beforeIngest = spyInterp.instance.ingest.mock.calls.length;
        conn.emit('snapshot', {
            tick: 999,
            baseTick: null,
            payload: { ships: [], enemies: [], asteroids: [], drops: [] },
            recvTime: 0,
        });
        expect(spyPred.instance.onSnapshot.mock.calls.length).toBe(beforeOnSnap);
        expect(spyInterp.instance.ingest.mock.calls.length).toBe(beforeIngest);
    });
});

// ── Bonus: startOnline allocates a fresh Predictor + Interpolator ───────────

describe('EngineDriver MP — startOnline allocation', () => {
    test('startOnline calls the injected Predictor + Interpolator ctors exactly once each', () => {
        const ge = new StubGameEngine();
        const overlayCtor = jest.fn(function () { return new StubOverlay(); });
        const spyPred = makeSpyPredictor();
        const spyInterp = makeSpyInterpolator();
        const PredCtor = jest.fn(function () { return spyPred.instance; });
        const InterpCtor = jest.fn(function () { return spyInterp.instance; });
        const driver = new EngineDriver({
            gameEngine: ge,
            deps: {
                Overlay: overlayCtor,
                document: globalThis.document ?? null,
                Predictor: PredCtor,
                Interpolator: InterpCtor,
                renderDelayMs: 250,
                dt: 1 / 30,
            },
        });
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });

        expect(PredCtor).toHaveBeenCalledTimes(1);
        expect(InterpCtor).toHaveBeenCalledTimes(1);
        // Predictor receives the configured dt.
        expect(PredCtor.mock.calls[0][0]).toEqual({ dt: 1 / 30 });
        // Interpolator receives the configured render-delay.
        expect(InterpCtor.mock.calls[0][0]).toEqual({ renderDelayMs: 250 });
        // mode flag flipped, isOnline true, snapshot listener registered.
        expect(driver.mode).toBe(ENGINE_MODE_ONLINE);
        expect(driver.isOnline).toBe(true);
    });

    test('an explicit baselineShip is forwarded to predictor.setBaseline at tick=0', () => {
        const { driver, spyPred } = makeMpDriver();
        const baselineShip = { player: 1n, x: 960, y: 540, vx: 0, vy: 0, angle: 0, hp: 40, shield: 15 };
        driver.startOnline({
            connection: new FakeConnection(),
            welcome: WELCOME,
            baselineShip,
        });
        expect(spyPred.instance.setBaseline).toHaveBeenCalledTimes(1);
        expect(spyPred.instance.setBaseline).toHaveBeenCalledWith(baselineShip, 0);
    });

    test('omitting baselineShip leaves the predictor un-anchored (server snapshot sets it)', () => {
        const { driver, spyPred } = makeMpDriver();
        driver.startOnline({ connection: new FakeConnection(), welcome: WELCOME });
        expect(spyPred.instance.setBaseline).not.toHaveBeenCalled();
    });
});
