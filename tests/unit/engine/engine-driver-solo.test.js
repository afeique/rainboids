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
import { resolveSoloOptions } from '../../../js/modules/game-engine.js';

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

// ── Test group 5: Phase-3 default-on wiring (resolveSoloOptions helper) ─────
//
// Phase 3 of the Hybrid solo↔MP unification (2026-05-13) flips
// `useLoopback` ON by default at the actual NEW GAME / start-game handler
// — solo runs now boot through the LoopbackConnection so the simulation
// + rendering layer matches real MP exactly. The decision (`useLoopback`
// true vs false) lives in `resolveSoloOptions()` in game-engine.js so it
// can be tested in isolation without instantiating a full GameEngine
// (which carries a heavy DOM/WebGL constructor chain).
//
// These tests pin the four contract corners:
//   1. Plain NEW GAME    → useLoopback: true   (the Phase 3 flip)
//   2. ?solo-classic=1   → useLoopback: false  (debugging escape hatch)
//   3. continueRun: true → useLoopback: false  (Phase 4 concern — saved-
//                                                run resume doesn't yet
//                                                survive a loopback boot)
//   4. ?solo-classic=1 + continueRun: true → useLoopback: false (both
//                                                 reasons stack; legacy)
//
// Plus a "the loopback path actually engages auto-pilot eligibility"
// behavioral check that walks the wiring end-to-end via the existing
// EngineDriver + FakeLoopback fakes.

describe('resolveSoloOptions — 5.96.2 revert to default-off wiring', () => {
    test('plain NEW GAME defaults useLoopback to false', () => {
        // 5.96.2 — Phase 3 reverted. Solo NEW GAME runs use the legacy
        // direct-Engine path (no LoopbackConnection, no Predictor, no
        // Interpolator). Pure local simulation. Loopback is opt-in via
        // ?solo-loopback=1 URL param.
        const out = resolveSoloOptions({}, '');
        expect(out.useLoopback).toBe(false);
        expect(out.continueRun).toBe(false);
    });

    test('NEW GAME with no opts (defaults) → useLoopback: false', () => {
        // Calling with zero arguments — the launcher might pass `{}` or
        // nothing. Either way the helper must default useLoopback to false.
        const out = resolveSoloOptions();
        expect(out.useLoopback).toBe(false);
        expect(out.continueRun).toBe(false);
    });

    test('?solo-loopback=1 URL param opts IN to the loopback path', () => {
        // Inverse of the old 5.96.0 `?solo-classic=1` escape hatch. The
        // loopback path is now opt-in for testing / dogfooding only.
        const out = resolveSoloOptions({}, '?solo-loopback=1');
        expect(out.useLoopback).toBe(true);
        expect(out.continueRun).toBe(false);
    });

    test('?solo-loopback=1 works without a leading question mark', () => {
        // URLSearchParams tolerates either form. We pin this so any future
        // refactor that drops the leading `?` from `location.search` still
        // works (e.g. a router that strips it before passing through).
        const out = resolveSoloOptions({}, 'solo-loopback=1');
        expect(out.useLoopback).toBe(true);
    });

    test('?solo-loopback with any value (or none) still opts in', () => {
        // `has('solo-loopback')` returns true for `?solo-loopback`,
        // `?solo-loopback=` and `?solo-loopback=0`. The param's presence
        // is the signal, not its value.
        expect(resolveSoloOptions({}, '?solo-loopback').useLoopback).toBe(true);
        expect(resolveSoloOptions({}, '?solo-loopback=').useLoopback).toBe(true);
        expect(resolveSoloOptions({}, '?solo-loopback=0').useLoopback).toBe(true);
        expect(resolveSoloOptions({}, '?solo-loopback=anything').useLoopback).toBe(true);
    });

    test('continueRun: true forces useLoopback: false (Phase 4 concern)', () => {
        // Saved-run resume can't safely route through the loopback yet
        // — the scaffold always invokes `startNewRun()` server-side,
        // discarding the persisted wave/loadout. Pinned here so the
        // contract doesn't quietly drift if the loopback path is ever
        // re-enabled by default.
        const out = resolveSoloOptions({ continueRun: true }, '');
        expect(out.useLoopback).toBe(false);
        expect(out.continueRun).toBe(true);
    });

    test('continueRun + ?solo-loopback=1 → continueRun wins (legacy)', () => {
        // If the resume path and the opt-in flag both fire, continueRun's
        // veto wins — we can't restore a saved baseline through the
        // loopback yet.
        const out = resolveSoloOptions({ continueRun: true }, '?solo-loopback=1');
        expect(out.useLoopback).toBe(false);
        expect(out.continueRun).toBe(true);
    });

    test('continueRun normalizes truthy values to a boolean', () => {
        expect(resolveSoloOptions({ continueRun: 1 }, '').continueRun).toBe(true);
        expect(resolveSoloOptions({ continueRun: 'yes' }, '').continueRun).toBe(true);
        // Falsy → strict false (and useLoopback stays false).
        expect(resolveSoloOptions({ continueRun: 0 }, '').continueRun).toBe(false);
        expect(resolveSoloOptions({ continueRun: 0 }, '').useLoopback).toBe(false);
    });

    test('unknown URL params do not affect the result', () => {
        // Sanity: only `solo-loopback` is recognized. Other params
        // (debug flags, mobile overrides, etc.) leave the default off.
        const out = resolveSoloOptions({}, '?mobile=1&debug=1&other=foo');
        expect(out.useLoopback).toBe(false);
    });

    test('empty / null / undefined search string defaults to loopback OFF', () => {
        // 5.96.2 — default is OFF. No URL params → loopback stays off.
        expect(resolveSoloOptions({}, '').useLoopback).toBe(false);
        expect(resolveSoloOptions({}, '?').useLoopback).toBe(false);
        expect(resolveSoloOptions({}).useLoopback).toBe(false);
    });
});

// ── Test group 6: end-to-end wiring (resolved options → driver behavior) ────
//
// Validates that the resolved options, when handed to the EngineDriver,
// produce the expected runtime behavior. Closes the loop on the Phase 3
// contract: "the resolver decides + the driver executes".

describe('startSolo wiring — resolved options drive driver behavior', () => {
    test('default-resolved NEW GAME → driver stays in LEGACY solo (5.96.2)', () => {
        // 5.96.2 reverted the Phase 3 default-on. Default resolution
        // → useLoopback:false → driver stays in ENGINE_MODE_SOLO with
        // no Predictor / Interpolator / LoopbackConnection. Pure local
        // sim. The loopback path is opt-in via ?solo-loopback=1.
        const opts = resolveSoloOptions({}, '');
        expect(opts.useLoopback).toBe(false);

        const { driver, LoopbackCtor } = makeSoloDriver();
        driver.startSolo(opts);
        expect(driver.isOnline).toBe(false);
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(LoopbackCtor).not.toHaveBeenCalled();
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();
    });

    test('?solo-loopback=1 → driver enters online mode (loopback engages)', () => {
        // Opt-in path: when the user adds ?solo-loopback=1 to the URL,
        // the driver constructs the LoopbackConnection and enters
        // ENGINE_MODE_ONLINE — the Predictor + Interpolator pipeline
        // engages exactly like real MP.
        const opts = resolveSoloOptions({}, '?solo-loopback=1');
        expect(opts.useLoopback).toBe(true);

        const { driver } = makeSoloDriver();
        driver.startSolo(opts);
        expect(driver.isOnline).toBe(true);
        expect(driver.mode).toBe(ENGINE_MODE_ONLINE);
    });

    test('after opt-in startSolo + a snapshot, getLocalShipState returns a ship', () => {
        // Behavioral check: with ?solo-loopback=1 the loopback engages,
        // and after it emits a snapshot, getLocalShipState() yields a
        // non-null reference. Validates the opt-in path still works for
        // dogfooding the real-MP code path.
        const opts = resolveSoloOptions({}, '?solo-loopback=1');
        const { driver, spyPred, latestLoopback } = makeSoloDriver();
        driver.startSolo(opts);

        // Driver in online mode → getLocalShipState() reads the
        // predictor's localShipState (non-null reference).
        expect(driver.getLocalShipState()).toBe(spyPred.instance.localShipState);

        // Emit a snapshot to simulate the post-50ms server tick. The
        // fake loopback's player id defaults to 1, matching the welcome
        // payload's playerId so the ship is treated as local.
        const localShip = {
            player: 1, x: 100, y: 200, vx: 0, vy: 0, angle: 0, hp: 100,
        };
        latestLoopback().emit('snapshot', {
            tick: 1,
            baseTick: null,
            payload: { ships: [localShip], enemies: [], asteroids: [], drops: [] },
            recvTime: 0,
        });

        // Predictor.onSnapshot was called → reconciliation engaged.
        expect(spyPred.instance.onSnapshot).toHaveBeenCalledWith(1, localShip);
        // getLocalShipState() still returns the predictor's reference
        // (unchanged identity, but now reconciled-with-server state).
        expect(driver.getLocalShipState()).toBe(spyPred.instance.localShipState);
    });

    test('legacy-solo path is unchanged — no MP pipeline scaffolding', () => {
        // Regression guard: when the user opts INTO the legacy path
        // (?solo-classic=1), absolutely no MP scaffolding should engage.
        // No LoopbackConnection ctor call, no Predictor, no Interpolator.
        // This guarantees the escape hatch is a true byte-for-byte
        // revert to pre-Phase-3 behavior.
        const opts = resolveSoloOptions({}, '?solo-classic=1');

        const { driver, LoopbackCtor, spyPred, spyInterp } = makeSoloDriver();
        driver.startSolo(opts);

        // Driver state mirrors pre-Phase-3.
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.connection).toBeNull();
        expect(driver.predictor).toBeNull();
        expect(driver.interpolator).toBeNull();
        // None of the spy classes was instantiated.
        expect(LoopbackCtor).not.toHaveBeenCalled();
        expect(spyPred.instance.setBaseline).not.toHaveBeenCalled();
        expect(spyInterp.instance.ingest).not.toHaveBeenCalled();
        // tick() still no-ops (legacy solo contract).
        expect(() => driver.tick(FRESH_SIM_INPUT)).not.toThrow();
    });

    test('default solo-loopback wiring does not block GameEngine startNewRun', () => {
        // The whole "solo and MP run identically" property relies on
        // `startNewRun()` getting called on the GameEngine regardless of
        // which path we take. Hybrid-solo should still trigger it (via
        // `startOnline` → `ge.startNewRun()`), just through a different
        // entry point. Verify by inspecting the stub GameEngine's call
        // log.
        const opts = resolveSoloOptions({}, '');
        const { driver, ge } = makeSoloDriver();
        driver.startSolo(opts);
        // The stub records 'triggerTitleStart' followed by 'startNewRun'.
        expect(ge.calls).toContain('startNewRun');
    });
});
