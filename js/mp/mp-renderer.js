// MP renderer.
//
// Thin Canvas2D renderer for the Phase-1 single-ship round-trip. Reads
// scalar state from the WASM `World` (ship_x / ship_y / ship_angle /
// field_width / field_height) and paints a triangle on a black field
// with the 1920x1080 logical world fitted into the live canvas.
//
// Solo's renderer is NOT shared (per docs/Multiplayer WASM Pivot -
// 2026-05-17.md, "Asset and shared-layer decisions"). This file is
// fresh and intentionally minimal: no entity classes, no sprite
// pipeline, no particle systems. WebGL is deferred until perf demands
// it.

const SHIP_HALF_WIDTH = 12;   // local-space, in world pixels
const SHIP_HALF_HEIGHT = 15;  // length from base to tip
const WORLD_BG = "#000000";
const WORLD_BOUNDS_COLOR = "rgba(140, 140, 160, 0.35)";
const SHIP_FILL = "#ffffff";
const SHIP_STROKE = "#ffffff";
const CROSSHAIR_COLOR = "rgba(160, 240, 255, 0.85)";

export function render(ctx, canvas, world, aim) {
    const cw = canvas.width;
    const ch = canvas.height;

    // Full canvas wipe.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = WORLD_BG;
    ctx.fillRect(0, 0, cw, ch);

    const fieldW = world.field_width();
    const fieldH = world.field_height();
    const scale = Math.min(cw / fieldW, ch / fieldH);

    // Center the logical 1920x1080 field inside the canvas, then
    // re-anchor so that world (0,0) lives at the top-left of the
    // letterboxed field. All subsequent draws use world coords.
    const offsetX = (cw - fieldW * scale) * 0.5;
    const offsetY = (ch - fieldH * scale) * 0.5;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    // Field outline.
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = WORLD_BOUNDS_COLOR;
    ctx.strokeRect(0, 0, fieldW, fieldH);

    // Aim crosshair (drawn under the ship so the ship visually wins on
    // overlap). `aim` is the world-space coordinate the engine passed
    // into world.set_input this frame.
    if (aim) {
        const size = 8;
        ctx.strokeStyle = CROSSHAIR_COLOR;
        ctx.lineWidth = 1 / scale;
        ctx.beginPath();
        ctx.moveTo(aim.x - size, aim.y);
        ctx.lineTo(aim.x + size, aim.y);
        ctx.moveTo(aim.x, aim.y - size);
        ctx.lineTo(aim.x, aim.y + size);
        ctx.stroke();
    }

    // Ship as an isoceles triangle pointing toward +x (right) in local
    // space; ctx rotation by ship_angle aims it where the player is
    // looking.
    const sx = world.ship_x();
    const sy = world.ship_y();
    const sa = world.ship_angle();

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(sa);
    ctx.beginPath();
    ctx.moveTo(SHIP_HALF_HEIGHT, 0);
    ctx.lineTo(-SHIP_HALF_HEIGHT * 0.6, -SHIP_HALF_WIDTH);
    ctx.lineTo(-SHIP_HALF_HEIGHT * 0.6, SHIP_HALF_WIDTH);
    ctx.closePath();
    ctx.fillStyle = SHIP_FILL;
    ctx.fill();
    ctx.strokeStyle = SHIP_STROKE;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
    ctx.restore();
}
