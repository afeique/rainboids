/**
 * @jest-environment allure-jest/jsdom
 *
 * tests/unit/ui/mobile-touch.test.js — unit tests for the touchstart /
 * touchmove / touchend / touchcancel pipeline in
 * js/modules/ui/mobile-touch.js.
 *
 * The bug we're guarding against: an earlier version called
 * e.preventDefault() unconditionally at the top of each handler. Touch
 * gestures during PLAYING / WAVE_TRANSITION (the "playable" states) need
 * preventDefault to suppress the native double-tap-zoom + 300ms tap
 * delay. But touches during TITLE_SCREEN / PAUSED / SHOP / GAME_OVER /
 * GAME_COMPLETE go to canvas-rendered buttons whose hit-test runs on
 * window-level mousedown / mouseup / click handlers (synthesized by the
 * browser from the touch sequence). Calling preventDefault in those
 * states suppresses the synthesized click and the buttons never fire.
 *
 * The fix: move the _isPlayableState() bail BEFORE preventDefault in all
 * four handlers, return early without preventDefault when not playable.
 *
 * Construction notes:
 *   • MobileTouchHandler.install() is gated by isMobile(), which we
 *     toggle via _resetUrlOverrideForTests(true) so the handler thinks
 *     it's running on a phone. addEventListener is monkey-stubbed before
 *     install() so we capture the actual bound listener functions,
 *     letting us invoke each handler directly with synthetic events.
 *   • The engine stub matches the surface the handler reads:
 *     canvas, game.state, inputHandler.input, radialMenu, screen↔world
 *     helpers. Everything else is unused for these tests.
 */

import { MobileTouchHandler } from '../../../js/modules/ui/mobile-touch.js';
import { GAME_STATES } from '../../../js/modules/core/constants.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEngineStub(state) {
    // jsdom provides a real `document` so a real <canvas> works,
    // including getBoundingClientRect() returning sensible numbers.
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    // jsdom returns { x:0, y:0, w:0, h:0 } for un-attached elements;
    // attach so layout helpers don't NaN. Width/height of the rect
    // will still be 0 under jsdom, which is fine — _canvasCoords just
    // multiplies (0/0) which we tolerate; tests never rely on the
    // computed coords being accurate.
    document.body.appendChild(canvas);
    return {
        canvas,
        width: 400,
        height: 300,
        game: { state },
        inputHandler: { input: { fire: false, aimX: 0, aimY: 0, screenAimX: 0, screenAimY: 0 } },
        radialMenu: { isOpen: () => false, openFor: () => {}, handleClick: () => {}, cancel: () => {} },
        screenToWorldCoordinates: (x, y) => ({ x, y }),
        asteroidPool: { activeObjects: [] },
        enemyPool:    { activeObjects: [] },
        _hudButtonRects: null,
        _hudPressedButton: null,
        handleEntityTargeting: () => {},
    };
}

// Capture the listeners install() registers on the canvas so the tests
// can invoke them directly. We monkey-patch addEventListener BEFORE
// calling install() so the patch sees every registration call.
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

// Hand-rolled spy so this file runs identically under `allure-jest/node`
// (where `jest.fn()` is not reliably resolvable at module scope, per
// the comment in tests/unit/boss-rage.test.js) and `allure-jest/jsdom`.
// The spy mirrors just the jest.fn() API we use here (callCount + the
// expect(fn).toHaveBeenCalled* matchers).
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
    // Force isMobile() = true so install() actually attaches listeners.
    _resetUrlOverrideForTests(true);
});

afterAll(() => {
    _resetUrlOverrideForTests(null);
});

// ── preventDefault behavior per game state ──────────────────────────────────

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

        it('does NOT call preventDefault during SHOP', () => {
            const engine = makeEngineStub(GAME_STATES.SHOP);
            const handler = new MobileTouchHandler(engine);
            const handlers = installAndCapture(handler);
            const evt = makeFakeTouchEvent();
            handlers.touchmove(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('does NOT call preventDefault during GAME_OVER', () => {
            const engine = makeEngineStub(GAME_STATES.GAME_OVER);
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
            // Seed _touchId via a touchstart so touchmove has something
            // to track (touchmove guards on _touchId === null too).
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
            // No touchstart fired (would have bailed anyway), so
            // _touchId is still null and touchend must bail before
            // preventDefault.
            const evt = makeFakeTouchEvent();
            handlers.touchend(evt);
            expect(evt.preventDefault.calls.length).toBe(0);
        });

        it('does NOT call preventDefault during PAUSED', () => {
            const engine = makeEngineStub(GAME_STATES.PAUSED);
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

        it('does NOT call preventDefault during PAUSED', () => {
            const engine = makeEngineStub(GAME_STATES.PAUSED);
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

// ── State-side-effect smoke: bail leaves _touchId null ──────────────────────

describe('MobileTouchHandler — non-playable states do not track touches', () => {
    it('touchstart on TITLE_SCREEN leaves _touchId null (no tracking)', () => {
        const engine = makeEngineStub(GAME_STATES.TITLE_SCREEN);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handlers.touchstart(makeFakeTouchEvent({ identifier: 3 }));
        // Internal state is exposed via the public-ish underscore field
        // — we read it directly to verify the bail path actually took.
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
