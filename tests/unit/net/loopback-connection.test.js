// tests/unit/net/loopback-connection.test.js — unit coverage for the
// in-process counterpart to `ConnectionTask` (Phase 1 scaffold).
//
// Test plan (mirrors the contract in `js/net/loopback-connection.js`):
//
//   • Construction — defaults + option overrides.
//   • Event emitter — subscribe / unsubscribe / multi-listener / fault
//     isolation / unknown-event no-op.
//   • Lifecycle — welcome on start, snapshot cadence, disconnect cleanup,
//     `isConnected` accessor.
//   • Snapshot shape — initial ship position, tick monotonicity, payload
//     subfields, empty entity arrays.
//   • Input application — queue + drain + velocity progression.
//
// We use `jest.useFakeTimers()` to drive `setInterval` deterministically.
// `queueMicrotask` is NOT a timer, so we flush it via `await Promise.resolve()`
// after each `start()` call before any synchronous-snapshot assertion.

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    LOOPBACK_DT,
    LOOPBACK_TICK_HZ,
    LOOPBACK_TICK_MS,
    LoopbackConnection,
} from '../../../js/net/loopback-connection.js';

// Helper: flush the microtask queue so `queueMicrotask(() => emit('welcome'))`
// runs before the next assertion. Jest's fake-timer scheduler does NOT
// advance microtasks, so we do this manually.
async function flushMicrotasks() {
    await Promise.resolve();
}

beforeEach(() => {
    // Fake setInterval/setTimeout but keep `queueMicrotask` real so the
    // `start() → welcome` microtask flush still drains via
    // `await Promise.resolve()`. Mocking microtasks too would force every
    // welcome assertion to call `jest.runAllTicks()` first, which is
    // noisier than the natural Promise-based flush.
    jest.useFakeTimers({
        doNotFake: ['queueMicrotask'],
    });
});

afterEach(() => {
    jest.useRealTimers();
});

// ── Construction ────────────────────────────────────────────────────────

describe('LoopbackConnection — construction', () => {
    test('no-arg construction does not throw', () => {
        expect(() => new LoopbackConnection()).not.toThrow();
    });

    test('default playerId is 1', () => {
        const loop = new LoopbackConnection();
        expect(loop.playerId).toBe(1);
    });

    test('default session is "loopback"', () => {
        const loop = new LoopbackConnection();
        expect(loop.session).toBe('loopback');
    });

    test('custom options override defaults', () => {
        const loop = new LoopbackConnection({
            playerId: 42,
            sessionId: 'custom-session',
            serverTimeMs: 12345,
        });
        expect(loop.playerId).toBe(42);
        expect(loop.session).toBe('custom-session');
        expect(loop.serverTimeMs).toBe(12345);
    });

    test('initial state is "idle" before start()', () => {
        const loop = new LoopbackConnection();
        expect(loop.state).toBe('idle');
        expect(loop.isConnected).toBe(false);
    });

    test('exports cadence constants for reuse', () => {
        // Pin the wire cadence so a tuning change in the source is caught.
        expect(LOOPBACK_TICK_HZ).toBe(20);
        expect(LOOPBACK_TICK_MS).toBe(50);
        expect(LOOPBACK_DT).toBeCloseTo(0.05, 10);
    });
});

// ── Event emitter shim ──────────────────────────────────────────────────

describe('LoopbackConnection — event emitter', () => {
    test('on(event, fn) subscribes; _emit calls fn with payload', () => {
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        loop.on('foo', fn);
        loop._emit('foo', { hello: 'world' });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith({ hello: 'world' });
    });

    test('multiple subscribers all fire on emit', () => {
        const loop = new LoopbackConnection();
        const a = jest.fn();
        const b = jest.fn();
        const c = jest.fn();
        loop.on('event', a);
        loop.on('event', b);
        loop.on('event', c);
        loop._emit('event', 'payload');
        expect(a).toHaveBeenCalledWith('payload');
        expect(b).toHaveBeenCalledWith('payload');
        expect(c).toHaveBeenCalledWith('payload');
    });

    test('unsubscribe returned by on() removes the listener', () => {
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        const off = loop.on('event', fn);
        loop._emit('event', 1);
        expect(fn).toHaveBeenCalledTimes(1);
        off();
        loop._emit('event', 2);
        expect(fn).toHaveBeenCalledTimes(1); // not called a second time
    });

    test('one throwing handler does not break the others', () => {
        const loop = new LoopbackConnection();
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const a = jest.fn();
        const b = jest.fn(() => { throw new Error('boom'); });
        const c = jest.fn();
        loop.on('e', a);
        loop.on('e', b);
        loop.on('e', c);
        loop._emit('e', 'p');
        expect(a).toHaveBeenCalledWith('p');
        expect(b).toHaveBeenCalledWith('p');
        expect(c).toHaveBeenCalledWith('p');
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });

    test('_emit on an unknown event is a no-op (no crash)', () => {
        const loop = new LoopbackConnection();
        expect(() => loop._emit('never-subscribed', { x: 1 })).not.toThrow();
    });
});

// ── Lifecycle ────────────────────────────────────────────────────────────

describe('LoopbackConnection — lifecycle', () => {
    test('start() then microtask emits welcome with the expected payload', async () => {
        const loop = new LoopbackConnection({
            playerId: 7,
            sessionId: 'sess-7',
            serverTimeMs: 999,
        });
        const fn = jest.fn();
        loop.on('welcome', fn);
        loop.start();
        // welcome is microtask-scheduled, not a timer — flush it.
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith({
            playerId: 7,
            session: 'sess-7',
            serverTimeMs: 999,
        });
    });

    test('subscribers registered BEFORE start() receive the welcome event', async () => {
        // This is the documented pattern in the class docstring: caller
        // subscribes first, then calls start(). The microtask scheduling
        // exists specifically so this works.
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        loop.on('welcome', fn);
        loop.start();
        await flushMicrotasks();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('start() begins the 50ms tick loop; snapshot events fire on cadence', async () => {
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        loop.on('snapshot', fn);
        loop.start();
        await flushMicrotasks();

        // No snapshot yet — interval hasn't fired.
        expect(fn).toHaveBeenCalledTimes(0);

        // Advance 49 ms — still no snapshot (interval is 50 ms).
        jest.advanceTimersByTime(49);
        expect(fn).toHaveBeenCalledTimes(0);

        // Cross the 50 ms boundary — exactly one snapshot.
        jest.advanceTimersByTime(1);
        expect(fn).toHaveBeenCalledTimes(1);

        // 150 ms total → 3 snapshots.
        jest.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(3);
    });

    test('disconnect() stops the tick loop; no more snapshot events fire', async () => {
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        loop.on('snapshot', fn);
        loop.start();
        await flushMicrotasks();

        jest.advanceTimersByTime(100); // 2 snapshots
        expect(fn).toHaveBeenCalledTimes(2);

        loop.disconnect();
        jest.advanceTimersByTime(500); // would be +10 snapshots
        expect(fn).toHaveBeenCalledTimes(2); // …but none fired post-disconnect
    });

    test('disconnect() emits a disconnect event with an empty-payload shape', async () => {
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        loop.on('disconnect', fn);
        loop.start();
        await flushMicrotasks();
        loop.disconnect();
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith({});
    });

    test('disconnect() before start() does not emit disconnect (nothing to close)', () => {
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        loop.on('disconnect', fn);
        loop.disconnect();
        expect(fn).toHaveBeenCalledTimes(0);
        expect(loop.state).toBe('closed');
    });

    test('disconnect() is idempotent — second call is a no-op', async () => {
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        loop.on('disconnect', fn);
        loop.start();
        await flushMicrotasks();
        loop.disconnect();
        loop.disconnect();
        loop.disconnect();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    test('isConnected toggles true after start, false after disconnect', async () => {
        const loop = new LoopbackConnection();
        expect(loop.isConnected).toBe(false);
        loop.start();
        await flushMicrotasks();
        expect(loop.isConnected).toBe(true);
        loop.disconnect();
        expect(loop.isConnected).toBe(false);
    });

    test('start() is idempotent — second call does not double-schedule', async () => {
        const loop = new LoopbackConnection();
        const fn = jest.fn();
        loop.on('snapshot', fn);
        loop.start();
        loop.start(); // should be a no-op
        await flushMicrotasks();
        jest.advanceTimersByTime(50);
        // If start() doubled the interval we'd see 2; correct behavior is 1.
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

// ── Snapshot shape ───────────────────────────────────────────────────────

describe('LoopbackConnection — snapshot shape', () => {
    test('first snapshot has the default ship and tick=1', async () => {
        const loop = new LoopbackConnection({ playerId: 9 });
        const frames = [];
        loop.on('snapshot', (f) => frames.push(f));
        loop.start();
        await flushMicrotasks();
        jest.advanceTimersByTime(50);

        expect(frames).toHaveLength(1);
        const f = frames[0];
        expect(f.tick).toBe(1);
        expect(f.baseTick).toBe(0);
        expect(typeof f.recvTime).toBe('number');
        expect(f.payload).toBeDefined();

        const ship = f.payload.ships[0];
        expect(ship.id).toBe(9);
        expect(ship.player).toBe(9); // emit both keys for transition compat
        expect(ship.x).toBe(400);
        expect(ship.y).toBe(300);
        expect(ship.vx).toBe(0);
        expect(ship.vy).toBe(0);
        expect(ship.angle).toBeDefined();
        expect(ship.hp).toBe(100);
    });

    test('tick counter increments by 1 each emission', async () => {
        const loop = new LoopbackConnection();
        const ticks = [];
        loop.on('snapshot', (f) => ticks.push(f.tick));
        loop.start();
        await flushMicrotasks();
        jest.advanceTimersByTime(250); // 5 ticks
        expect(ticks).toEqual([1, 2, 3, 4, 5]);
    });

    test('payload.ships[0] has all required wire fields', async () => {
        const loop = new LoopbackConnection();
        let frame = null;
        loop.on('snapshot', (f) => { frame = f; });
        loop.start();
        await flushMicrotasks();
        jest.advanceTimersByTime(50);

        const ship = frame.payload.ships[0];
        // Spec-required fields per `engine-driver._onSnapshot`:
        for (const key of ['id', 'x', 'y', 'vx', 'vy', 'angle', 'hp']) {
            expect(ship).toHaveProperty(key);
        }
    });

    test('enemies / asteroids / drops / enemy_bullets are empty arrays in Phase 1', async () => {
        const loop = new LoopbackConnection();
        let frame = null;
        loop.on('snapshot', (f) => { frame = f; });
        loop.start();
        await flushMicrotasks();
        jest.advanceTimersByTime(50);

        expect(Array.isArray(frame.payload.enemies)).toBe(true);
        expect(Array.isArray(frame.payload.asteroids)).toBe(true);
        expect(Array.isArray(frame.payload.drops)).toBe(true);
        expect(Array.isArray(frame.payload.enemy_bullets)).toBe(true);
        expect(frame.payload.enemies).toHaveLength(0);
        expect(frame.payload.asteroids).toHaveLength(0);
        expect(frame.payload.drops).toHaveLength(0);
        expect(frame.payload.enemy_bullets).toHaveLength(0);
    });

    test('baselineShip override surfaces in the first snapshot', async () => {
        const loop = new LoopbackConnection({
            playerId: 3,
            baselineShip: { x: 123, y: 456, vx: 0, vy: 0, angle: 1.5, hp: 80 },
        });
        let frame = null;
        loop.on('snapshot', (f) => { frame = f; });
        loop.start();
        await flushMicrotasks();
        jest.advanceTimersByTime(50);

        const ship = frame.payload.ships[0];
        // x/y may have changed slightly due to the idle-step friction
        // pass, but velocity stays zero so position is stable.
        expect(ship.x).toBe(123);
        expect(ship.y).toBe(456);
        expect(ship.hp).toBe(80);
    });
});

// ── Input application ───────────────────────────────────────────────────

describe('LoopbackConnection — input application', () => {
    test('sendInput(InputFrame) with right=true → ship.vx > 0 after one tick', async () => {
        const loop = new LoopbackConnection();
        const frames = [];
        loop.on('snapshot', (f) => frames.push(f));
        loop.start();
        await flushMicrotasks();

        // Send an explicit InputFrame the ship physics already knows about.
        loop.sendInput({ right: true, aimX: 1000, aimY: 300 });
        jest.advanceTimersByTime(50);

        const ship = frames[0].payload.ships[0];
        expect(ship.vx).toBeGreaterThan(0);
        // Position should also have moved east.
        expect(ship.x).toBeGreaterThan(400);
    });

    test('sendInput accepts PackedInput-shaped objects (moveX/moveY)', async () => {
        const loop = new LoopbackConnection();
        const frames = [];
        loop.on('snapshot', (f) => frames.push(f));
        loop.start();
        await flushMicrotasks();

        // PackedInput-style: positive moveX = move east.
        loop.sendInput({ moveX: 127, moveY: 0, aimX: 1000, aimY: 300, buttons: 0 });
        jest.advanceTimersByTime(50);

        const ship = frames[0].payload.ships[0];
        expect(ship.vx).toBeGreaterThan(0);
    });

    test('multiple queued inputs all apply in order on the next tick', async () => {
        const loop = new LoopbackConnection();
        const frames = [];
        loop.on('snapshot', (f) => frames.push(f));
        loop.start();
        await flushMicrotasks();

        // Three thrust inputs queued before the tick fires.
        loop.sendInput({ right: true, aimX: 1000, aimY: 300 });
        loop.sendInput({ right: true, aimX: 1000, aimY: 300 });
        loop.sendInput({ right: true, aimX: 1000, aimY: 300 });
        jest.advanceTimersByTime(50);

        const ship = frames[0].payload.ships[0];
        // Three velocity integrations + frictions = more displacement
        // than a single input frame.
        const oneInputBaseline = (() => {
            const c = new LoopbackConnection();
            const f = [];
            c.on('snapshot', (fr) => f.push(fr));
            c.start();
            // Don't await microtasks/flush — we just need the eventual
            // tick comparison. Subscribe before start() in this branch
            // doesn't matter for snapshot.
            c.sendInput({ right: true, aimX: 1000, aimY: 300 });
            jest.advanceTimersByTime(50);
            return f[0].payload.ships[0];
        })();

        expect(ship.vx).toBeGreaterThan(oneInputBaseline.vx);
    });

    test('sendInput(Uint8Array) is accepted and ignored in Phase 1 (no decode)', async () => {
        const loop = new LoopbackConnection();
        const frames = [];
        loop.on('snapshot', (f) => frames.push(f));
        loop.start();
        await flushMicrotasks();

        // Sending wire bytes — Phase 1 skips decode but must NOT crash.
        expect(() => loop.sendInput(new Uint8Array([1, 2, 3, 4, 5, 6, 7]))).not.toThrow();
        jest.advanceTimersByTime(50);

        // Without a decoded input, the ship stays put (idle-step only).
        const ship = frames[0].payload.ships[0];
        expect(ship.vx).toBe(0);
        expect(ship.x).toBe(400);
    });

    test('engine-driver-style two-arg form sendInput(tick, packed) works too', async () => {
        // EngineDriver.tick() calls `connection.sendInput(nextTick, packed)`.
        // The loopback must accept the same signature without changing
        // the call site.
        const loop = new LoopbackConnection();
        const frames = [];
        loop.on('snapshot', (f) => frames.push(f));
        loop.start();
        await flushMicrotasks();

        loop.sendInput(42 /* tick */, { right: true, aimX: 1000, aimY: 300 });
        jest.advanceTimersByTime(50);

        const ship = frames[0].payload.ships[0];
        expect(ship.vx).toBeGreaterThan(0);
    });
});
