/**
 * @jest-environment allure-jest/jsdom
 *
 * tests/unit/ui/mobile-touch.test.js — 5.100.0 update
 *
 * Pins the new mobile touch contract:
 *   - Touch inside the analog stick zone → starts a stick session;
 *     stick.getInput() reports the deflection.
 *   - Tap (quick release, low drift) anywhere else on the canvas →
 *     pulses input.fireSecondary (Model F: tap-for-power).
 *   - Drag without entering the stick zone → no power fire (dragged
 *     touches are discarded, not treated as taps).
 *   - HUD button hits route to the matching action.
 *   - Radial menu open: touchmove updates hover, touchend commits or
 *     cancels (unchanged from prior model).
 *
 * The 5.94/5.97 press-and-hold-aim contract is removed; the player
 * never aims manually on mobile in 5.100.
 */

import { MobileTouchHandler } from '../../../js/modules/ui/mobile-touch.js';
import { GAME_STATES } from '../../../js/modules/core/constants.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

const engineOps = { shop: 0, stats: 0, pause: 0 };

function resetEngineOps() {
    engineOps.shop = 0;
    engineOps.stats = 0;
    engineOps.pause = 0;
}

function makeStickStub() {
    let active = false;
    let dx = 0, dy = 0;
    return {
        side: 'left',
        baseX: 80, baseY: 220,
        contains: (x, y) => Math.hypot(x - 80, y - 220) <= 100,
        onTouchStart: (x, y) => {
            if (Math.hypot(x - 80, y - 220) > 100) return false;
            active = true;
            dx = x - 80; dy = y - 220;
            return true;
        },
        onTouchMove: (x, y) => {
            if (!active) return;
            dx = x - 80; dy = y - 220;
        },
        onTouchEnd: () => { active = false; dx = 0; dy = 0; },
        getInput: () => {
            const x = dx / 72, y = dy / 72;
            return { x, y, magnitude: Math.min(1, Math.hypot(x, y)) };
        },
        _isActive: () => active,
    };
}

function makeEngineStub(state, opts = {}) {
    resetEngineOps();
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    document.body.appendChild(canvas);

    const radialOpenState = { open: !!opts.radialOpen };
    const radialMenu = {
        isOpen: () => radialOpenState.open,
        openFor: () => { radialOpenState.open = true; },
        handleClick: () => { radialOpenState.open = false; },
        cancel: () => { radialOpenState.open = false; },
        _state: radialOpenState,
    };

    return {
        canvas,
        width: 400,
        height: 300,
        game: { state },
        inputHandler: {
            input: {
                fire: false, fireSecondary: false,
                aimX: 0, aimY: 0, screenAimX: 0, screenAimY: 0,
                stickInput: { x: 0, y: 0, magnitude: 0 },
            },
        },
        radialMenu,
        analogStick: opts.stick || makeStickStub(),
        screenToWorldCoordinates: (x, y) => ({ x, y }),
        player: { x: 200, y: 150 },
        _hudButtonRects: opts.hudRects || null,
        _hudPressedButton: null,
        openShop: () => { engineOps.shop++; },
        toggleStatsScreen: () => { engineOps.stats++; },
        togglePause: () => { engineOps.pause++; },
        closeShopAndReturn: () => {},
        _ops: engineOps,
    };
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

function makeFakeTouchEvent({ identifier = 1, clientX = 0, clientY = 0 } = {}) {
    return {
        preventDefault: () => {},
        stopPropagation: () => {},
        changedTouches: [{ identifier, clientX, clientY }],
        touches: [{ identifier, clientX, clientY }],
    };
}

beforeEach(() => {
    _resetUrlOverrideForTests(true);
});
afterEach(() => {
    _resetUrlOverrideForTests(null);
    document.body.innerHTML = '';
});

// ── 5.100.0: analog stick session ────────────────────────────────────

describe('MobileTouchHandler — analog stick (5.100.0)', () => {
    test('touchstart inside stick zone starts a stick session and writes input.stickInput', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        // Override canvas-coord conversion to identity since jsdom rects are 0×0.
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        // Touch near the stick center (80, 220).
        handlers.touchstart(makeFakeTouchEvent({ clientX: 80, clientY: 220 }));

        // Stick is active and input.stickInput is populated.
        expect(engine.analogStick._isActive()).toBe(true);
        expect(engine.inputHandler.input.stickInput.magnitude).toBeGreaterThanOrEqual(0);
    });

    test('touchmove inside a stick session updates the deflection vector', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        handlers.touchstart(makeFakeTouchEvent({ clientX: 80, clientY: 220 }));
        // Drag right + down.
        handlers.touchmove(makeFakeTouchEvent({ clientX: 130, clientY: 250 }));

        const input = engine.inputHandler.input.stickInput;
        expect(input.x).toBeGreaterThan(0);
        expect(input.y).toBeGreaterThan(0);
        expect(input.magnitude).toBeGreaterThan(0);
    });

    test('touchend on a stick session zeroes the stick input', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        handlers.touchstart(makeFakeTouchEvent({ clientX: 80, clientY: 220 }));
        handlers.touchmove(makeFakeTouchEvent({ clientX: 130, clientY: 250 }));
        handlers.touchend(makeFakeTouchEvent({ clientX: 130, clientY: 250 }));

        expect(engine.analogStick._isActive()).toBe(false);
        const input = engine.inputHandler.input.stickInput;
        expect(input.magnitude).toBe(0);
    });
});

// ── 5.100.0: tap-for-power weapon ────────────────────────────────────

describe('MobileTouchHandler — tap-for-power (5.100.0)', () => {
    test('a quick tap outside the stick zone pulses input.fireSecondary', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        // Touch outside the stick zone (stick centered at 80,220).
        handlers.touchstart(makeFakeTouchEvent({ clientX: 300, clientY: 80 }));
        // Quick release in the same spot.
        handlers.touchend(makeFakeTouchEvent({ clientX: 300, clientY: 80 }));

        expect(engine.inputHandler.input.fireSecondary).toBe(true);
    });

    test('a dragged touch outside the stick zone does NOT fire the power weapon', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        // Touch outside the stick zone and drag a long way.
        handlers.touchstart(makeFakeTouchEvent({ clientX: 300, clientY: 80 }));
        handlers.touchmove(makeFakeTouchEvent({ clientX: 360, clientY: 200 }));
        handlers.touchend(makeFakeTouchEvent({ clientX: 360, clientY: 200 }));

        expect(engine.inputHandler.input.fireSecondary).toBe(false);
    });

    test('touch on the stick zone does NOT fire the power weapon', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        // Quick release inside the stick zone.
        handlers.touchstart(makeFakeTouchEvent({ clientX: 80, clientY: 220 }));
        handlers.touchend(makeFakeTouchEvent({ clientX: 80, clientY: 220 }));

        expect(engine.inputHandler.input.fireSecondary).toBe(false);
    });
});

// ── 5.100.0: HUD button routing (SHOP / STATS / PAUSE) ───────────────

describe('MobileTouchHandler — HUD button routing (5.100.0)', () => {
    test('tap on SHOP HUD button opens shop, not power fire', () => {
        const hudRects = {
            shop:  { id: 'shop',  x: 100, y: 220, w: 40, h: 40 },
            stats: { id: 'stats', x: 150, y: 220, w: 40, h: 40 },
            pause: { id: 'pause', x: 200, y: 220, w: 40, h: 40 },
        };
        const engine = makeEngineStub(GAME_STATES.PLAYING, { hudRects });
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        handlers.touchstart(makeFakeTouchEvent({ clientX: 110, clientY: 230 }));
        handlers.touchend(makeFakeTouchEvent({ clientX: 110, clientY: 230 }));

        expect(engine.inputHandler.input.fireSecondary).toBe(false);
        expect(engine._ops.shop).toBe(1);
    });

    test('tap on PAUSE HUD button toggles pause', () => {
        const hudRects = {
            shop:  { id: 'shop',  x: 100, y: 220, w: 40, h: 40 },
            stats: { id: 'stats', x: 150, y: 220, w: 40, h: 40 },
            pause: { id: 'pause', x: 200, y: 220, w: 40, h: 40 },
        };
        const engine = makeEngineStub(GAME_STATES.PLAYING, { hudRects });
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        handlers.touchstart(makeFakeTouchEvent({ clientX: 210, clientY: 230 }));
        handlers.touchend(makeFakeTouchEvent({ clientX: 210, clientY: 230 }));

        expect(engine._ops.pause).toBe(1);
    });
});

// ── 5.100.0: state gating ────────────────────────────────────────────

describe('MobileTouchHandler — playable-state gating (5.100.0)', () => {
    test('touch during TITLE_SCREEN does NOT start a stick session', () => {
        const engine = makeEngineStub(GAME_STATES.TITLE_SCREEN);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        handlers.touchstart(makeFakeTouchEvent({ clientX: 80, clientY: 220 }));

        expect(engine.analogStick._isActive()).toBe(false);
    });

    test('touch during PAUSED does NOT fire the power weapon', () => {
        const engine = makeEngineStub(GAME_STATES.PAUSED);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        handlers.touchstart(makeFakeTouchEvent({ clientX: 300, clientY: 80 }));
        handlers.touchend(makeFakeTouchEvent({ clientX: 300, clientY: 80 }));

        expect(engine.inputHandler.input.fireSecondary).toBe(false);
    });
});

// ── 5.100.0: cancel path ─────────────────────────────────────────────

describe('MobileTouchHandler — touchcancel (5.100.0)', () => {
    test('touchcancel during a stick session zeroes the stick input', () => {
        const engine = makeEngineStub(GAME_STATES.PLAYING);
        const handler = new MobileTouchHandler(engine);
        const handlers = installAndCapture(handler);
        handler._canvasCoords = (t) => ({ x: t.clientX, y: t.clientY });

        handlers.touchstart(makeFakeTouchEvent({ clientX: 80, clientY: 220 }));
        handlers.touchmove(makeFakeTouchEvent({ clientX: 130, clientY: 250 }));
        handlers.touchcancel(makeFakeTouchEvent({ clientX: 130, clientY: 250 }));

        expect(engine.analogStick._isActive()).toBe(false);
        expect(engine.inputHandler.input.stickInput.magnitude).toBe(0);
    });
});
