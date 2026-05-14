/**
 * tests/unit/engine/camera-zoom.test.js — 5.96.0
 *
 * Pins the camera zoom behavior introduced in 5.96.0 to scale-down the
 * visible game field on a mobile screen so MORE world fits per pixel.
 *
 * Contract:
 *   - `camera.zoom` defaults to 1 (desktop).
 *   - Mobile portrait sets `camera.zoom = 0.65`.
 *   - Mobile landscape sets `camera.zoom = 0.8`.
 *   - `screenToWorldCoordinates(screenX, screenY)` is the inverse of
 *     the zoom-around-canvas-center + camera-translate render transform.
 *     With zoom=1 it collapses to `screen + camera` (desktop path).
 *   - `isEntityOnScreen(entity)` accounts for the larger zoomed-out
 *     visible window (entities outside the canvas-sized rect but inside
 *     the zoomed-out rect are reported on-screen).
 *
 * Strategy: import the camera-manager module directly and call its
 * functions with a stub `this` that exposes the same fields the real
 * GameEngine does (camera, canvas, width, height, gameField, player).
 * No DOM canvas, no audio, no rendering.
 */

import { describe, expect, test } from '@jest/globals';
import {
    screenToWorldCoordinates,
    isEntityOnScreen,
    getVisibleStars,
    updateCamera,
} from '../../../js/modules/world/camera-manager.js';

// Build a minimal `this` context that mirrors the GameEngine shape the
// camera-manager functions touch.
function makeContext({
    zoom = 1,
    width = 1920, height = 1080,
    camX = 0, camY = 0,
    fieldW = 1920, fieldH = 1080,
    playerX = 960, playerY = 540,
    smoothing = 1.0, // 1.0 = converge in one tick for deterministic tests
} = {}) {
    return {
        width, height,
        canvas: { width, height },
        camera: {
            x: camX, y: camY,
            targetX: camX, targetY: camY,
            smoothing,
            zoom,
        },
        gameField: { width: fieldW, height: fieldH },
        player: { active: true, x: playerX, y: playerY },
    };
}

describe('camera-manager — zoom-aware screenToWorldCoordinates (5.96.0)', () => {
    test('zoom=1 (desktop): screen + camera (identity transform)', () => {
        const ctx = makeContext({ zoom: 1, camX: 100, camY: 200, width: 800, height: 600 });
        const w = screenToWorldCoordinates.call(ctx, 50, 75);
        // Inverse of identity (zoom=1, no scale) is `screen + camera`.
        expect(w.x).toBeCloseTo(150, 5);
        expect(w.y).toBeCloseTo(275, 5);
    });

    test('zoom=0.65 (mobile portrait): canvas center maps to camera-center world coord', () => {
        const ctx = makeContext({
            zoom: 0.65,
            camX: 100, camY: 200,
            width: 400, height: 800,
        });
        // Canvas center = (200, 400). Should map to (200 + camX, 400 + camY).
        const w = screenToWorldCoordinates.call(ctx, 200, 400);
        expect(w.x).toBeCloseTo(300, 5);  // 200 + 100
        expect(w.y).toBeCloseTo(600, 5);  // 400 + 200
    });

    test('zoom=0.65: offsets from center are scaled by 1/zoom', () => {
        const ctx = makeContext({
            zoom: 0.65,
            camX: 0, camY: 0,
            width: 400, height: 800,
        });
        // Tap 100 screen-pixels right of canvas center.
        // worldX = (300 - 200)/0.65 + 200 + 0 = 153.846... + 200 = ~353.85
        const w = screenToWorldCoordinates.call(ctx, 300, 400);
        expect(w.x).toBeCloseTo(100 / 0.65 + 200, 5);
        expect(w.y).toBeCloseTo(400, 5);
    });

    test('zoom=0.8 (mobile landscape): inverse transform with non-zero camera', () => {
        const ctx = makeContext({
            zoom: 0.8,
            camX: 50, camY: -30,
            width: 800, height: 400,
        });
        const w = screenToWorldCoordinates.call(ctx, 100, 100);
        // worldX = (100 - 400)/0.8 + 400 + 50 = -375 + 450 = 75
        // worldY = (100 - 200)/0.8 + 200 + (-30) = -125 + 170 = 45
        expect(w.x).toBeCloseTo(75, 5);
        expect(w.y).toBeCloseTo(45, 5);
    });

    test('round-trip: world → screen → world preserves coords', () => {
        const ctx = makeContext({ zoom: 0.65, camX: 50, camY: 100, width: 400, height: 800 });
        // Forward transform (mirroring the canvas render):
        //   screen = (world - camera - W/2) * zoom + W/2
        const fwd = (wx, wy) => ({
            x: (wx - ctx.camera.x - ctx.width / 2) * ctx.camera.zoom + ctx.width / 2,
            y: (wy - ctx.camera.y - ctx.height / 2) * ctx.camera.zoom + ctx.height / 2,
        });
        const worldIn = { x: 360, y: 700 };
        const screen = fwd(worldIn.x, worldIn.y);
        const worldOut = screenToWorldCoordinates.call(ctx, screen.x, screen.y);
        expect(worldOut.x).toBeCloseTo(worldIn.x, 4);
        expect(worldOut.y).toBeCloseTo(worldIn.y, 4);
    });
});

describe('camera-manager — zoom-aware isEntityOnScreen (5.96.0)', () => {
    test('zoom=1: behaviour matches the pre-5.96 canvas-bounds rule', () => {
        const ctx = makeContext({ zoom: 1, camX: 0, camY: 0, width: 800, height: 600 });
        const entityInside = { active: true, x: 400, y: 300, radius: 10 };
        const entityOutside = { active: true, x: 2000, y: 300, radius: 10 };
        expect(isEntityOnScreen.call(ctx, entityInside, 0)).toBe(true);
        expect(isEntityOnScreen.call(ctx, entityOutside, 0)).toBe(false);
    });

    test('zoom=0.65: an entity OUTSIDE the canvas-sized rect but INSIDE the zoomed-out rect is on-screen', () => {
        // canvas 400x800, camera (0,0); zoom=0.65 expands the visible
        // window to roughly [-107..507] × [-215..1015] in world coords.
        // An entity at world (450, 400) sits beyond the canvas right edge
        // (x=400) but inside the zoomed-out right edge (~507.7).
        const ctx = makeContext({ zoom: 0.65, camX: 0, camY: 0, width: 400, height: 800 });
        const entity = { active: true, x: 450, y: 400, radius: 10 };
        // At zoom=1 this should NOT be on-screen (entity x=450 > canvas right=400):
        ctx.camera.zoom = 1;
        expect(isEntityOnScreen.call(ctx, entity, 0)).toBe(false);
        // At zoom=0.65 it SHOULD be on-screen (the visible window expands):
        ctx.camera.zoom = 0.65;
        expect(isEntityOnScreen.call(ctx, entity, 0)).toBe(true);
    });

    test('zoom=0.65: still rejects entities far outside the zoomed window', () => {
        const ctx = makeContext({ zoom: 0.65, camX: 0, camY: 0, width: 400, height: 800 });
        const entity = { active: true, x: 5000, y: 5000, radius: 10 };
        expect(isEntityOnScreen.call(ctx, entity, 0)).toBe(false);
    });
});

describe('camera-manager — zoom-aware updateCamera clamp (5.96.0)', () => {
    test('zoom=1: clamp matches pre-5.96 boundaries (player near edge)', () => {
        const ctx = makeContext({
            zoom: 1,
            camX: 0, camY: 0,
            width: 800, height: 600,
            fieldW: 1920, fieldH: 1080,
            playerX: 100, playerY: 100, // near top-left corner of field
            smoothing: 1.0,
        });
        updateCamera.call(ctx);
        // playerX - W/2 = -300 → clamped to 0.
        expect(ctx.camera.x).toBeCloseTo(0, 5);
        expect(ctx.camera.y).toBeCloseTo(0, 5);
    });

    test('zoom=0.65 (mobile portrait): stationary player at field centre → camera locked at field-centre offsets', () => {
        // Mobile portrait: canvas 400x800, field 1920x1080, zoom 0.65.
        // Player stationary at field centre (5.94.0 mobile rule).
        // visW = 400/0.65 ≈ 615, visH = 800/0.65 ≈ 1230.
        // The zoom-aware clamp widens the camera range by ±halfPad on
        // each axis, but a stationary field-centre player keeps the
        // camera at the exact field-centre offset regardless.
        const ctx = makeContext({
            zoom: 0.65,
            width: 400, height: 800,
            fieldW: 1920, fieldH: 1080,
            playerX: 960, playerY: 540, // field centre (stationary mobile player)
            smoothing: 1.0,
        });
        updateCamera.call(ctx);
        // X: targetX = 960 - 200 = 760. In zoom-aware range → camera.x = 760.
        expect(ctx.camera.x).toBeCloseTo(760, 1);
        // Y: targetY = 540 - 400 = 140. In zoom-aware range → camera.y = 140.
        expect(ctx.camera.y).toBeCloseTo(140, 1);
    });

    test('zoom=0.65: tall visible window allows camera to expose out-of-field area near edges', () => {
        // Push player near top of field. With visH > fieldH the zoom-
        // aware clamp lets camera.y go negative (showing void above field).
        const ctx = makeContext({
            zoom: 0.65,
            width: 400, height: 800,
            fieldW: 1920, fieldH: 1080,
            playerX: 960, playerY: 0,  // far top of field
            smoothing: 1.0,
        });
        updateCamera.call(ctx);
        // targetY = 0 - 400 = -400. With zoom-aware halfPadH = (1230-800)/2 ≈ 215,
        // minY = -215. Clamp to -215.
        expect(ctx.camera.y).toBeCloseTo(-215.385, 1);
    });

    test('zoom=0.8 (mobile landscape): standard clamp applies when window fits', () => {
        // Mobile landscape: canvas 800x400, field 1920x1080, zoom 0.8.
        // visW = 1000, visH = 500. Both smaller than the field, so the
        // zoom-aware clamp applies with halfPadW = (1000-800)/2 = 100,
        // halfPadH = (500-400)/2 = 50.
        const ctx = makeContext({
            zoom: 0.8,
            width: 800, height: 400,
            fieldW: 1920, fieldH: 1080,
            playerX: 960, playerY: 540, // field centre
            smoothing: 1.0,
        });
        updateCamera.call(ctx);
        // targetX = 960 - 400 = 560. minX=-100, maxX=1920-800+100=1220.
        //   560 in range → camera.x = 560.
        // targetY = 540 - 200 = 340. minY=-50, maxY=1080-400+50=730.
        //   340 in range → camera.y = 340.
        expect(ctx.camera.x).toBeCloseTo(560, 1);
        expect(ctx.camera.y).toBeCloseTo(340, 1);
    });
});

describe('camera-manager — getVisibleStars honours zoom (5.96.0)', () => {
    test('a star outside the canvas rect but inside the zoomed-out rect is visible', () => {
        const ctx = makeContext({ zoom: 0.65, camX: 0, camY: 0, width: 400, height: 800 });
        // Star at x=560: canvas-rect with padding=100 spans -100..500
        //   → 560 is outside that.
        // Zoomed rect with padding spans ~ -100 - 107.7 to 500 + 107.7
        //   = -207.7 to 607.7 → 560 is inside.
        const star = { active: true, x: 560, y: 400 };
        const visible = getVisibleStars.call(ctx, [star]);
        expect(visible.length).toBe(1);
    });

    test('inactive stars are filtered out regardless of zoom', () => {
        const ctx = makeContext({ zoom: 0.65, camX: 0, camY: 0, width: 400, height: 800 });
        const visible = getVisibleStars.call(ctx, [
            { active: false, x: 200, y: 400 },
            { active: true,  x: 200, y: 400 },
        ]);
        expect(visible.length).toBe(1);
        expect(visible[0].active).toBe(true);
    });
});
