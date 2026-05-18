// MP engine.
//
// Phase-1 round-trip driver: constructs a WASM `World`, polls input
// every frame, projects the mouse cursor into world space (the sim
// expects aim coordinates in the 1920x1080 logical field, NOT canvas
// pixels), ticks physics, and asks mp-renderer to paint the result.
//
// Phase 2+ will layer a WebSocket connection and snapshot
// reconciliation on top of this loop. See:
// docs/Multiplayer WASM Pivot - 2026-05-17.md
//
// No networking, no remote ships, no audio, no HUD beyond the debug
// overlay — that's all Phase 2+.

import * as mpInput from "./mp-input.js";
import { render } from "./mp-renderer.js";

const DT_CLAMP_MAX = 0.1;        // 100ms per tick max (anti-tab-hide spike)
const DEBUG_UPDATE_EVERY = 10;   // overlay refresh cadence in frames
const FPS_WINDOW = 30;           // rolling sample window for FPS estimate

export function start(World, debugEl, canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        if (debugEl) debugEl.textContent = "mp-engine: 2D context unavailable";
        return;
    }

    mpInput.init(canvas);

    const world = World.new();

    // Cache field size once; Phase 1 has a fixed world.
    const fieldW = world.field_width();
    const fieldH = world.field_height();

    let lastTime = performance.now();
    let frameCount = 0;
    let tickCount = 0;
    const frameDurations = [];

    // Aim memo for renderer (so it can paint the crosshair at the same
    // point we just fed into the sim).
    const lastAim = { x: fieldW * 0.5, y: fieldH * 0.5 };

    const frame = (now) => {
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        const dt = Math.max(0, Math.min(rawDt, DT_CLAMP_MAX));

        // FPS sampling.
        frameDurations.push(rawDt);
        if (frameDurations.length > FPS_WINDOW) frameDurations.shift();

        const input = mpInput.getState();

        // Canvas-pixel mouse -> world coords. The renderer letterboxes
        // the 1920x1080 field with Math.min(cw/fw, ch/fh); invert that
        // here so set_input() receives field-space aim.
        const cw = canvas.width;
        const ch = canvas.height;
        const scale = Math.min(cw / fieldW, ch / fieldH);
        const offsetX = (cw - fieldW * scale) * 0.5;
        const offsetY = (ch - fieldH * scale) * 0.5;
        const aimWorldX = scale > 0 ? (input.mouseX - offsetX) / scale : fieldW * 0.5;
        const aimWorldY = scale > 0 ? (input.mouseY - offsetY) / scale : fieldH * 0.5;
        lastAim.x = aimWorldX;
        lastAim.y = aimWorldY;

        world.set_input(
            !!input.up,
            !!input.down,
            !!input.left,
            !!input.right,
            aimWorldX,
            aimWorldY,
        );
        world.tick(dt);
        tickCount += 1;

        render(ctx, canvas, world, lastAim);

        frameCount += 1;
        if (debugEl && frameCount % DEBUG_UPDATE_EVERY === 0) {
            const sx = world.ship_x();
            const sy = world.ship_y();
            const avgFrame = frameDurations.reduce((a, b) => a + b, 0) / Math.max(frameDurations.length, 1);
            const fps = avgFrame > 0 ? (1 / avgFrame) : 0;
            debugEl.textContent =
                `Rainboids MP - Phase 1\n` +
                `tick:  ${tickCount}\n` +
                `pos:   ${sx.toFixed(1)}, ${sy.toFixed(1)}\n` +
                `aim:   ${aimWorldX.toFixed(0)}, ${aimWorldY.toFixed(0)}\n` +
                `fps:   ${fps.toFixed(1)}`;
        }

        requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
}
