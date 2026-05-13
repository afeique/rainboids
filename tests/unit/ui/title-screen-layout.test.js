/**
 * @jest-environment allure-jest/jsdom
 *
 * tests/unit/ui/title-screen-layout.test.js — verifies the title screen
 * fits inside small mobile viewports. drawTitleScreen() runs against a
 * stubbed engine + jsdom <canvas> that supports ctx.measureText (returns
 * 0 widths, but the function only depends on rect coordinates for the
 * assertions here). After the function returns, the engine's
 * _titleButtonRects map is populated; we assert each rect's bounding
 * box lies entirely within the canvas, with a small margin.
 *
 * Why this matters: prior to 5.92.1 the layout used hardcoded offsets
 * (`centerY - 100` for the title, `centerY + 140` for the record),
 * which on a 640-tall portrait phone placed:
 *   • title at y=220 (top of glyph near 180 with 72px font — fits)
 *   • record at y=460
 *   • buttons stacked from centerY + 40 = 360, three buttons + gaps
 *     totalling ~232px → bottom at ~592, RECORD AT 460 OVERLAPPED.
 * The new layout computes a content block height and re-anchors so
 * the chrome always lives inside the visible canvas.
 */

// jsdom under allure-jest doesn't ship TextEncoder/TextDecoder at the
// global scope, but the overlays.js import chain reaches js/net/codec.js
// which constructs both at module load. Polyfill from `util` BEFORE
// importing overlays so the chain resolves cleanly. ES-module imports
// are hoisted, so static `import { drawTitleScreen }` would evaluate
// codec.js before this block runs. We resolve drawTitleScreen via a
// dynamic import inside beforeAll() instead.
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') globalThis.TextEncoder = TextEncoder;
if (typeof globalThis.TextDecoder === 'undefined') globalThis.TextDecoder = TextDecoder;

import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

let drawTitleScreen;
beforeAll(async () => {
    ({ drawTitleScreen } = await import('../../../js/modules/hud/overlays.js'));
});

// jsdom without the optional `canvas` npm package returns `null` from
// canvas.getContext('2d'). Build a stub that satisfies just the surface
// drawTitleScreen exercises (save/restore/fill/stroke/text + measureText).
function makeFakeCtx() {
    return {
        save() {}, restore() {},
        beginPath() {}, rect() {}, roundRect() {}, fill() {}, stroke() {},
        fillText() {}, strokeText() {}, fillRect() {},
        measureText() { return { width: 0 }; },
        // properties read/written by overlays.js
        globalAlpha: 1,
        fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: 'miter',
        font: '', textAlign: 'left', textBaseline: 'alphabetic',
    };
}

// Build the smallest possible "engine" that drawTitleScreen reads.
function makeEngineStub({ width, height, hasSaved = false, survivalRecord = 0 }) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    return {
        canvas,
        ctx: makeFakeCtx(),
        width,
        height,
        game: { survivalRecord },
        hasSavedRun: () => hasSaved,
        formatSurvivalTime: (ms) => `${Math.floor(ms / 1000)}s`,
        drawWavyText: function () { /* no-op for layout test */ },
        _titleAnimState: () => null,
        _titleButtonRects: null,
    };
}

beforeEach(() => {
    document.body.innerHTML = '';
    // Force mobile so the responsive branches activate.
    _resetUrlOverrideForTests(true);
});

afterAll(() => {
    _resetUrlOverrideForTests(null);
});

// jsdom does not expose window.innerWidth/innerHeight as writable, but
// platform-detect.js#isPortrait reads them. Setting via defineProperty
// works under jsdom — both getter and writable forms accepted.
function setViewport(w, h) {
    Object.defineProperty(window, 'innerWidth',  { value: w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
}

function rectFits(rect, canvas, margin = 0) {
    if (!rect) return true;
    return (
        rect.x >= margin &&
        rect.y >= margin &&
        rect.x + rect.w <= canvas.width  - margin &&
        rect.y + rect.h <= canvas.height - margin
    );
}

describe('drawTitleScreen — portrait mobile layout', () => {
    test('all buttons fit inside a 360x640 portrait canvas', () => {
        setViewport(360, 640);
        const engine = makeEngineStub({ width: 360, height: 640, hasSaved: true, survivalRecord: 90_000 });
        drawTitleScreen.call(engine);
        const rects = engine._titleButtonRects;
        expect(rects).toBeTruthy();
        expect(rects.newGame).toBeTruthy();
        expect(rects.continue).toBeTruthy();
        // Each button rect must lie strictly inside the canvas bounds.
        expect(rectFits(rects.newGame, engine.canvas)).toBe(true);
        expect(rectFits(rects.continue, engine.canvas)).toBe(true);
        if (rects.multiplayer) {
            expect(rectFits(rects.multiplayer, engine.canvas)).toBe(true);
        }
        // Buttons must not overlap each other vertically.
        expect(rects.continue.y).toBeGreaterThanOrEqual(rects.newGame.y + rects.newGame.h);
    });

    test('buttons fit inside an even smaller 320x480 portrait canvas', () => {
        setViewport(320, 480);
        const engine = makeEngineStub({ width: 320, height: 480, hasSaved: false, survivalRecord: 0 });
        drawTitleScreen.call(engine);
        const rects = engine._titleButtonRects;
        expect(rects).toBeTruthy();
        expect(rectFits(rects.newGame, engine.canvas)).toBe(true);
        expect(rectFits(rects.continue, engine.canvas)).toBe(true);
    });

    test('button width is bounded by canvas width (no horizontal overflow)', () => {
        setViewport(360, 640);
        const engine = makeEngineStub({ width: 360, height: 640 });
        drawTitleScreen.call(engine);
        const rects = engine._titleButtonRects;
        expect(rects.newGame.w).toBeLessThanOrEqual(engine.canvas.width);
        expect(rects.newGame.x).toBeGreaterThanOrEqual(0);
        expect(rects.newGame.x + rects.newGame.w).toBeLessThanOrEqual(engine.canvas.width);
    });
});

describe('drawTitleScreen — landscape mobile layout', () => {
    test('all buttons fit inside a 640x360 landscape canvas', () => {
        setViewport(640, 360);
        const engine = makeEngineStub({ width: 640, height: 360, hasSaved: true, survivalRecord: 120_000 });
        drawTitleScreen.call(engine);
        const rects = engine._titleButtonRects;
        expect(rects).toBeTruthy();
        expect(rectFits(rects.newGame, engine.canvas)).toBe(true);
        expect(rectFits(rects.continue, engine.canvas)).toBe(true);
        if (rects.multiplayer) {
            expect(rectFits(rects.multiplayer, engine.canvas)).toBe(true);
        }
        // Side-by-side: continue.x > newGame.x + newGame.w (with a gap).
        expect(rects.continue.x).toBeGreaterThan(rects.newGame.x + rects.newGame.w);
        // Same vertical row.
        expect(rects.newGame.y).toBe(rects.continue.y);
    });

    test('buttons fit inside an even tighter 568x320 landscape canvas (iPhone SE)', () => {
        setViewport(568, 320);
        const engine = makeEngineStub({ width: 568, height: 320, hasSaved: false, survivalRecord: 0 });
        drawTitleScreen.call(engine);
        const rects = engine._titleButtonRects;
        expect(rectFits(rects.newGame, engine.canvas)).toBe(true);
        expect(rectFits(rects.continue, engine.canvas)).toBe(true);
    });
});

describe('drawTitleScreen — desktop layout (regression guard)', () => {
    test('desktop layout still produces side-by-side buttons within a 1280x720 canvas', () => {
        // Force desktop mode.
        _resetUrlOverrideForTests(false);
        setViewport(1280, 720);
        const engine = makeEngineStub({ width: 1280, height: 720, hasSaved: true });
        drawTitleScreen.call(engine);
        const rects = engine._titleButtonRects;
        expect(rects.newGame).toBeTruthy();
        expect(rects.continue).toBeTruthy();
        expect(rectFits(rects.newGame, engine.canvas)).toBe(true);
        expect(rectFits(rects.continue, engine.canvas)).toBe(true);
        // Buttons are side-by-side, same y.
        expect(rects.newGame.y).toBe(rects.continue.y);
        // And re-enable mobile for any later tests.
        _resetUrlOverrideForTests(true);
    });
});
