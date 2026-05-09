// Unit tests for EngineDriver.
//
// The driver is intentionally a thin layer that wraps a GameEngine and
// owns the network-mode flag. These tests use a stub `gameEngine` so
// the test stays in pure-JS land (no canvas, no audio).

import { describe, test, expect, jest } from '@jest/globals';
import {
    EngineDriver,
    ENGINE_MODE_SOLO,
    ENGINE_MODE_ONLINE,
} from '../../../js/engine/engine-driver.js';

class StubGameEngine {
    constructor() {
        this.calls = [];
        this._savedRun = false;
    }
    hasSavedRun() {
        return this._savedRun;
    }
    triggerTitleStart(start) {
        this.calls.push('triggerTitleStart');
        // Simulate the existing engine: returns `true` to mean the
        // title-leaving animation was triggered; `start` will be invoked
        // by the engine after the animation. For unit tests we just
        // call it synchronously so the test path is observable.
        start();
        return true;
    }
    startNewRun() { this.calls.push('startNewRun'); }
    startContinueRun() { this.calls.push('startContinueRun'); }
}

class StubConnection {
    constructor({ playerId = 1n, session = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeffff' } = {}) {
        this.playerId = playerId;
        this.session = session;
        this.state = 'welcomed';
        this._listeners = new Map();
        this.disconnectCalls = 0;
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
    emit(event) {
        const set = this._listeners.get(event);
        if (!set) return;
        for (const fn of set) fn();
    }
    disconnect() {
        this.disconnectCalls += 1;
        this.state = 'closed';
        this.emit('disconnect');
    }
}

class StubOverlay {
    constructor() {
        this.calls = [];
    }
    show({ playerId, session }) { this.calls.push(`show:${playerId}/${session.slice(0, 8)}`); }
    showReconnecting() { this.calls.push('reconnecting'); }
    showDisconnected() { this.calls.push('disconnected'); }
    hide() { this.calls.push('hide'); }
}

function makeDriver({ savedRun = false } = {}) {
    const ge = new StubGameEngine();
    if (savedRun) ge._savedRun = true;
    const overlayCtor = jest.fn(function StubOverlayCtor() { return new StubOverlay(); });
    const driver = new EngineDriver({
        gameEngine: ge,
        deps: { Overlay: overlayCtor, document: globalThis.document ?? null },
    });
    return { driver, ge, overlayCtor };
}

describe('EngineDriver — initial state', () => {
    test('starts in solo mode with no connection', () => {
        const { driver } = makeDriver();
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.isOnline).toBe(false);
        expect(driver.connection).toBe(null);
    });
});

describe('EngineDriver — startSolo', () => {
    test('NEW GAME path: triggers title animation then startNewRun', () => {
        const { driver, ge } = makeDriver();
        driver.startSolo({ continueRun: false });
        expect(ge.calls).toEqual(['triggerTitleStart', 'startNewRun']);
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
    });

    test('CONTINUE path with savedRun: triggers startContinueRun', () => {
        const { driver, ge } = makeDriver({ savedRun: true });
        driver.startSolo({ continueRun: true });
        expect(ge.calls).toEqual(['triggerTitleStart', 'startContinueRun']);
    });

    test('CONTINUE path WITHOUT savedRun falls back to startNewRun', () => {
        const { driver, ge } = makeDriver({ savedRun: false });
        driver.startSolo({ continueRun: true });
        expect(ge.calls).toEqual(['triggerTitleStart', 'startNewRun']);
    });

    test('animateTitleStart=false skips the title animation', () => {
        const { driver, ge } = makeDriver();
        driver.startSolo({ animateTitleStart: false });
        expect(ge.calls).toEqual(['startNewRun']);
    });
});

describe('EngineDriver — startOnline', () => {
    test('switches to online mode and stores connection + welcome', () => {
        const { driver } = makeDriver();
        const conn = new StubConnection();
        driver.startOnline({
            connection: conn,
            welcome: { playerId: 7n, session: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeffff', serverTimeMs: 0n },
        });
        expect(driver.mode).toBe(ENGINE_MODE_ONLINE);
        expect(driver.isOnline).toBe(true);
        expect(driver.connection).toBe(conn);
        expect(driver.welcome.playerId).toBe(7n);
    });

    test('starts the GameEngine just like solo (proves identicality)', () => {
        const { driver, ge } = makeDriver();
        driver.startOnline({
            connection: new StubConnection(),
            welcome: { playerId: 1n, session: 'a'.repeat(36), serverTimeMs: 0n },
        });
        // Same call sequence as startSolo({continueRun:false}).
        expect(ge.calls).toEqual(['triggerTitleStart', 'startNewRun']);
    });

    test('rejects without connection or welcome', () => {
        const { driver } = makeDriver();
        expect(() => driver.startOnline({})).toThrow(/connection/);
        expect(() => driver.startOnline({ connection: new StubConnection() })).toThrow(
            /welcome/,
        );
    });
});

describe('EngineDriver — disconnect handling', () => {
    test('socket drop during online play downgrades to solo cleanly', () => {
        const { driver } = makeDriver();
        const conn = new StubConnection();
        driver.startOnline({
            connection: conn,
            welcome: { playerId: 1n, session: 'b'.repeat(36), serverTimeMs: 0n },
        });
        expect(driver.isOnline).toBe(true);

        // Simulate the server closing the connection.
        conn.emit('disconnect');

        expect(driver.isOnline).toBe(false);
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.connection).toBe(null);
    });
});

describe('EngineDriver — quit', () => {
    test('online → quit closes the socket and clears state', () => {
        const { driver } = makeDriver();
        const conn = new StubConnection();
        driver.startOnline({
            connection: conn,
            welcome: { playerId: 1n, session: 'c'.repeat(36), serverTimeMs: 0n },
        });
        driver.quit();
        expect(conn.disconnectCalls).toBe(1);
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
        expect(driver.connection).toBe(null);
    });

    test('quit is idempotent', () => {
        const { driver } = makeDriver();
        driver.quit();
        driver.quit();
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
    });

    test('switching from online → solo via startSolo also closes the socket', () => {
        const { driver } = makeDriver();
        const conn = new StubConnection();
        driver.startOnline({
            connection: conn,
            welcome: { playerId: 1n, session: 'd'.repeat(36), serverTimeMs: 0n },
        });
        driver.startSolo();
        expect(conn.disconnectCalls).toBe(1);
        expect(driver.mode).toBe(ENGINE_MODE_SOLO);
    });
});
