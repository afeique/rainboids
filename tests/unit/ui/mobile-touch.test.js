/**
 * @jest-environment allure-jest/jsdom
 *
 * tests/unit/ui/mobile-touch.test.js — unit tests for the touchstart /
 * touchmove / touchend / touchcancel pipeline in
 * js/modules/ui/mobile-touch.js.
 *
 * 5.94.0 — Mobile mode is now a stationary-ship tower-defense game.
 * Auto-pilot was removed and the long-press radial was replaced with
 * PRM/PWR HUD buttons. The touch contract is:
 *
 *   1. Tap on the canvas (not on a HUD button) → fire primary + power
 *      weapon at the touch point. The fire pulse happens on touchstart
 *      (snappy feel — release does not fire again).
 *   2. Tap on a HUD button (SHOP/STATS/PAUSE/PRM/PWR) → run the
 *      button's action; do NOT fall through to fire.
 *   3. PRM button opens the primary-weapon radial.
 *   4. PWR button opens the power-weapon radial.
 *
 * preventDefault gating is preserved from 5.92.1: handlers bail before
 * preventDefault during non-playable states so the browser can still
 * synthesize click events for title / pause / shop / game-over canvas
 * buttons.
 */

import { MobileTouchHandler } from '../../../js/modules/ui/mobile-touch.js';
import { GAME_STATES } from '../../../js/modules/core/constants.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEngineStub(state, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    document.body.appendChild(canvas);

    const radialOpenState = { open: false };
    const radialMenuCalls = { openFor: [], handleClick: 0, cancel: 0 };
    const radialMenu = {
        isOpen: () => radialOpenState.open,
        openFor: (type) => {
            radialMenuCalls.openFor.push(type);
            radialOpenState.open = true;
        },
        handleClick: () => { radialMenuCalls.handleClick++; radialOpenState.open = false; },
        cancel: () => { radialMenuCalls.cancel++; radialOpenState.open = false; },
        _state: radialOpenState,
        _calls: radialMenuCalls,
    };

    const player = opts.player || { x: 200, y: 150, angle: 0, vel: { x: 0, y: 0 }, activePrimary: 'PULSE_CANNON', activePower: 'CHARGE_SHOT' };

    return {
        canvas,
        width: 400,
        height: 300,
        game: { state },
        inputHandler: {
            input: {
                fire: false, fireSecondary: false,
                aimX: 0, aimY: 0, screenAimX: 0, screenAimY: 0,
            },
        },
        radialMenu,
        screenToWorldCoordinates: (x, y) => ({ x, y }),
        asteroidPool: { activeObjects: opts.asteroids || [] },
        enemyPool:    { activeObjects: opts.enemies    || [] },
        player,
        _hudButtonRects: opts.hudRects || null,
        _hudPressedButton: null,
        handleEntityTargeting: () => {},
        openShop: () => { engineOps.shop++; },
        toggleStatsScreen: () => { engineOps.stats++; },
        togglePause: () => { engineOps.pause++; },
        _ops: engineOps,
    };
}

const engineOps = { shop: 0, stats: 0, pause: 0 };

function resetEngineOps() {
    engineOps.shop = 0;
    engineOps.stats = 0;
    engineOps.pause = 0;
}

function installAndCapture(handler) {
    const map = {};
    const orig = handler.engine.canvas.addEventListener;
    handler.engine.canvas.addEventListener = function (type, fn, opts) {
        map[type] = fn;
        return orig.call(this, type, fn, opts);
    };
    handler.install();
    return map;
}

function makeSpy() {
    const fn = function (...args) {
        fn.calls.push(args);
    };
    fn.calls = [];
    return fn;
}

function makeFakeTouchEvent({ identifier = 1, clientX = 50, clientY = 50 } = {}) {
    const preventDefault = makeSpy();
    return {
        preventDefault,
        changedTouches: [{ identifier, clientX, clientY }],
    };
}

beforeEach(() => {
    document.body.innerHTML = '';
    resetEngineOps();
    _resetUrlOverrideForTests(true);
});

afterAll(() => {
    _resetUrlOverrideForTests(null);
});

// ── preventDefault behavior per game state (regression guard from 5.92.1) ──

describe('MobileTouchHandler — preventDefault gating by game state', () => {
    describe('touchstart', () => {
        it('does NOT call preventDefault during TITLE_SCREEN', () => {
            const engine = makeEngineStub(GAME_STATES.TITLE_SCREEN);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchstart(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('does NOT call preventDefault during PAUSED', () => {
            const engine = makeEngineStub(GAME_STATES.PAUSED);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchstart(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('does NOT call preventDefault during SHOP', () => {
            const engine = makeEngineStub(GAME_STATES.SHOP);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchstart(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('does NOT call preventDefault during GAME_OVER', () => {
            const engine = makeEngineStub(GAME_STATES.GAME_OVER);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchstart(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('does NOT call preventDefault during GAME_COMPLETE', () => {
            const engine = makeEngineStub(GAME_STATES.GAME_COMPLETE);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchstart(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('DOES call preventDefault during PLAYING', () => {
            const engine = makeEngineStub(GAME_STATES.PLAYING);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchstart(evt);
            expect(evt.preventDefault.calls.length).toBe(1);
        });

        it('DOES call preventDefault during WAVE_TRANSITION', () => {
            const engine = makeEngineStub(GAME_STATES.WAVE_TRANSITION);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchstart(evt);
            expect(evt.preventDefault.calls.length).toBe(1);
        });
    });

    describe('touchmove', () => {
        it('does NOT call preventDefault during TITLE_SCREEN', () => {
            const engine = makeEngineStub(GAME_STATES.TITLE_SCREEN);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchmove(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('does NOT call preventDefault during PAUSED', () => {
            const engine = makeEngineStub(GAME_STATES.PAUSED);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchmove(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('DOES call preventDefault during PLAYING (after a tracked touchstart)', () => {
            const engine = makeEngineStub(GAME_STATES.PLAYING);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            handlers.touchstart(makeFakeTouchEvent({ identifier: 7 }));
            const evt = makeFakeTouchEvent({ identifier: 7, clientX: 80, clientY: 80 });
            handlers.touchmove(evt);
            expect(evt.preventDefault.calls.length).toBe(1);
        });
    });

    describe('touchend', () => {
        it('does NOT call preventDefault during TITLE_SCREEN (touchId was never set)', () => {
            const engine = makeEngineStub(GAME_STATES.TITLE_SCREEN);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchend(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('DOES call preventDefault during PLAYING (after a tracked touchstart)', () => {
            const engine = makeEngineStub(GAME_STATES.PLAYING);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            handlers.touchstart(makeFakeTouchEvent({ identifier: 9 }));
            const evt = makeFakeTouchEvent({ identifier: 9 });
            handlers.touchend(evt);
            expect(evt.preventDefault.calls.length).toBe(1);
        });
    });

    describe('touchcancel', () => {
        it('does NOT call preventDefault during TITLE_SCREEN', () => {
            const engine = makeEngineStub(GAME_STATES.TITLE_SCREEN);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchcancel(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('DOES call preventDefault during PLAYING (after a tracked touchstart)', () => {
            const engine = makeEngineStub(GAME_STATES.PLAYING);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            handlers.touchstart(makeFakeTouchEvent({ identifier: 11 }));
            const evt = makeFakeTouchEvent({ identifier: 11 });
            handlers.touchcancel(evt);
            expect(evt.preventDefault.calls.length).toBe(1);
        });
    });
});

// ── State-side-effect smoke ───────────────────────────────────────────────

describe('MobileTouchHandler — non-playable states do not track touches', () => {
    it('touchstart on TITLE_SCREEN leaves _touchId null (no tracking)', () => {
        const engine = makeEngineStub(GAME_STATES.TITLE_SCREEN);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handlers.touchstart(makeFakeTouchEvent({ identifier: 3 }));
        expect(handler._touchId).toBeNull();
    });

    it('touchstart on PLAYING DOES track (_touchId becomes the identifier)', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handlers.touchstart(makeFakeTouchEvent({ identifier: 42 }));
        expect(handler._touchId).toBe(42);
    });
});

// ── 5.94.0: Tap-to-aim-and-fire ───────────────────────────────────────────

describe('MobileTouchHandler — tap-to-aim-and-fire (5.94.0)', () => {
    it('touchstart on empty canvas sets fire + fireSecondary input flags', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handlers.touchstart(makeFakeTouchEvent({ identifier: 1, clientX: 0, clientY: 0 }));
        // Both flags should pulse on touchstart so the primary and any
        // ready/charged power weapon fire on the same tick.
        expect(engine.inputHandler.input.fire).toBe(true);
        expect(engine.inputHandler.input.fireSecondary).toBe(true);
    });

    it('touchstart sets player.angle to face the tap point', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        // Player is at (200, 150) — see makeEngineStub defaults.
        // jsdom's getBoundingClientRect returns 0×0 so the canvas-coord
        // multiplication yields (0, 0) for clientX/Y=0. After
        // screenToWorldCoordinates (identity), the aim point becomes (0, 0)
        // in world space. atan2(0 - 150, 0 - 200) = atan2(-150, -200) ≈
        // -2.498 rad. The exact value is irrelevant — the test just
        // checks the angle changed from its default of 0.
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        engine.player.angle = 0; // start neutral
        handlers.touchstart(makeFakeTouchEvent({ identifier: 1, clientX: 0, clientY: 0 }));
        // The handler computed atan2 from the player to the touch point,
        // so angle is no longer the initial 0.
        expect(engine.player.angle).not.toBe(0);
    });

    it('touchstart does NOT open a radial on its own (long-press removed)', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handlers.touchstart(makeFakeTouchEvent({ identifier: 1, clientX: 50, clientY: 50 }));
        // No radial opened by the bare touch.
        expect(engine.radialMenu._calls.openFor.length).toBe(0);
    });

    it('touchend after a successful tap does NOT re-fire (one shot per touch)', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handlers.touchstart(makeFakeTouchEvent({ identifier: 1, clientX: 50, clientY: 50 }));
        // Simulate the next-rAF release that the handler schedules.
        // (We don't await rAF here; we instead manually clear and verify
        // touchend doesn't set fire = true again.)
        engine.inputHandler.input.fire = false;
        engine.inputHandler.input.fireSecondary = false;
        handlers.touchend(makeFakeTouchEvent({ identifier: 1, clientX: 50, clientY: 50 }));
        expect(engine.inputHandler.input.fire).toBe(false);
        expect(engine.inputHandler.input.fireSecondary).toBe(false);
    });
});

// ── 5.94.0: HUD button routing (PRM / PWR / SHOP / STATS / PAUSE) ─────────

describe('MobileTouchHandler — HUD button hit-test routing (5.94.0)', () => {
    function makeHudRects() {
        // Five rects to mirror the 5.94.0 button set. Coordinates are
        // arbitrary but inside the 400×300 canvas so the hit-test works.
        return {
            shop:  { id: 'shop',  x: 100, y: 200, w: 40, h: 40 },
            stats: { id: 'stats', x: 150, y: 200, w: 40, h: 40 },
            pause: { id: 'pause', x: 200, y: 200, w: 40, h: 40 },
            prm:   { id: 'prm',   x:  10, y: 100, w: 40, h: 40, kind: 'primary' },
            pwr:   { id: 'pwr',   x: 350, y: 100, w: 40, h: 40, kind: 'power' },
        };
    }

    it('tap on PRM HUD button opens primary radial — does NOT fire', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING, { hudRects: makeHudRects() });
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        // jsdom rect is 0×0; we override the canvas-coord helper to
        // simply pass clientX/Y through, so a "click" at (20, 110)
        // canvas-space lands inside the PRM rect (10-50, 100-140).
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        const start = makeFakeTouchEvent({ identifier: 1, clientX: 20, clientY: 110 });
        handlers.touchstart(start);
        // No fire pulse — HUD path short-circuits before _fireAtTap.
        expect(engine.inputHandler.input.fire).toBe(false);
        expect(engine.inputHandler.input.fireSecondary).toBe(false);

        // touchend on the SAME button commits the action.
        const end = makeFakeTouchEvent({ identifier: 1, clientX: 20, clientY: 110 });
        handlers.touchend(end);
        expect(engine.radialMenu._calls.openFor).toEqual(['primary']);
    });

    it('tap on PWR HUD button opens power radial', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING, { hudRects: makeHudRects() });
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        const start = makeFakeTouchEvent({ identifier: 1, clientX: 360, clientY: 110 });
        handlers.touchstart(start);
        const end = makeFakeTouchEvent({ identifier: 1, clientX: 360, clientY: 110 });
        handlers.touchend(end);
        expect(engine.radialMenu._calls.openFor).toEqual(['power']);
    });

    it('tap on SHOP HUD button opens shop, not fire', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING, { hudRects: makeHudRects() });
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        handlers.touchstart(makeFakeTouchEvent({ identifier: 1, clientX: 110, clientY: 210 }));
        expect(engine.inputHandler.input.fire).toBe(false);
        handlers.touchend(makeFakeTouchEvent({ identifier: 1, clientX: 110, clientY: 210 }));
        expect(engine.player ? true : true).toBe(true); // sanity
        expect(engine._ops.shop).toBe(1);
    });

    it('HUD button hit-test runs FIRST — tap on PRM does not trigger fire', () => {
        // Critical invariant: if the tap lands on a HUD button, it
        // MUST short-circuit before the tap-to-fire path. Otherwise the
        // ship would fire toward the button location on every weapon
        // swap.
        const engine = makeEngineStub(GAME_STATES.PLAYING, { hudRects: makeHudRects() });
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        const initialAngle = engine.player.angle;
        handlers.touchstart(makeFakeTouchEvent({ identifier: 1, clientX: 20, clientY: 110 }));
        // No fire flag set.
        expect(engine.inputHandler.input.fire).toBe(false);
        // No aim change.
        expect(engine.player.angle).toBe(initialAngle);
    });

    it('drag-out from HUD button then release outside cancels the action', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING, { hudRects: makeHudRects() });
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        // Touch starts on PRM, drags off, releases in open canvas.
        handlers.touchstart(makeFakeTouchEvent({ identifier: 1, clientX: 20, clientY: 110 }));
        handlers.touchmove(makeFakeTouchEvent({ identifier: 1, clientX: 200, clientY: 150 }));
        handlers.touchend(makeFakeTouchEvent({ identifier: 1, clientX: 200, clientY: 150 }));
        // Radial NOT opened because release wasn't on the original button.
        expect(engine.radialMenu._calls.openFor.length).toBe(0);
    });
});
