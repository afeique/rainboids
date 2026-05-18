// MP renderer.
//
// Thin Canvas2D renderer for the MP loop. Reads scalar state from the
// WASM `World` (ship_x / ship_y / ship_angle / field_width /
// field_height) for the LOCAL ship, then paints any REMOTE ships the
// engine has already interpolated for this frame. The 1920x1080
// logical world is letterboxed into the live canvas.
//
// Contract: `render(ctx, canvas, world, aim, remoteShips)` where
// `remoteShips` is `Array<{player_id, x, y, vx, vy, angle}>` already
// interpolated by mp-engine. Empty/omitted in solo or before any
// snapshots arrive — `remoteShips` defaults to `[]` so the Phase 1
// four-argument call site keeps working.
//
// Solo's renderer is NOT shared (per docs/Multiplayer WASM Pivot -
// 2026-05-17.md, "Asset and shared-layer decisions"). This file is
// fresh and intentionally minimal: no entity classes, no sprite
// pipeline, no particle systems. WebGL is deferred until perf demands
// it. The renderer is stateless — the engine owns interpolation and
// snapshot bookkeeping.

const SHIP_HALF_WIDTH = 12;   // local-space, in world pixels
const SHIP_HALF_HEIGHT = 15;  // length from base to tip
const WORLD_BG = "#000000";
const WORLD_BOUNDS_COLOR = "rgba(140, 140, 160, 0.35)";
const SHIP_FILL = "#ffffff";
const SHIP_STROKE = "#ffffff";
const CROSSHAIR_COLOR = "rgba(160, 240, 255, 0.85)";

const REMOTE_PALETTE = [
    "#3df1ff",  // cyan
    "#ff5edc",  // magenta
    "#ffd84d",  // yellow
    "#7dff3d",  // lime
    "#ff8a3d",  // orange
    "#a880ff",  // purple
];

const LABEL_FONT_PX = 10;
const LABEL_OFFSET_Y = SHIP_HALF_HEIGHT + 8;  // above the ship tip

export function render(ctx, canvas, world, aim, remoteShips = []) {
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

    // Local ship (white) — pulled directly from the WASM World.
    const sx = world.ship_x();
    const sy = world.ship_y();
    const sa = world.ship_angle();
    drawShipTriangle(ctx, sx, sy, sa, SHIP_FILL, SHIP_STROKE, scale);

    // Remote ships — slot-indexed palette + floating "P<id>" label.
    // The engine has already interpolated x/y/angle into render-space;
    // we just paint. No label above the local ship — it's "you".
    for (let i = 0; i < remoteShips.length; i++) {
        const r = remoteShips[i];
        if (!r) continue;
        const color = REMOTE_PALETTE[r.player_id % REMOTE_PALETTE.length];
        drawShipTriangle(ctx, r.x, r.y, r.angle, color, color, scale);
        drawRemoteLabel(ctx, r.x, r.y, r.player_id, color, scale);
    }
}

// Isoceles triangle pointing toward +x (right) in local space; ctx
// rotation by `angle` aims it where the ship is looking. Same
// geometry for local and remote ships so the visual scale is
// consistent.
function drawShipTriangle(ctx, x, y, angle, fillStyle, strokeStyle, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(SHIP_HALF_HEIGHT, 0);
    ctx.lineTo(-SHIP_HALF_HEIGHT * 0.6, -SHIP_HALF_WIDTH);
    ctx.lineTo(-SHIP_HALF_HEIGHT * 0.6, SHIP_HALF_WIDTH);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
    ctx.restore();
}

// Floating "P<player_id>" label above a remote ship. Drawn in the
// ship's palette color, centered horizontally, in screen-stable pixel
// size by counter-scaling the active transform.
function drawRemoteLabel(ctx, x, y, playerId, color, scale) {
    ctx.save();
    ctx.translate(x, y - LABEL_OFFSET_Y);
    // Counter-scale so the label stays a constant pixel size on
    // screen regardless of how the world is letterboxed.
    ctx.scale(1 / scale, 1 / scale);
    ctx.font = `${LABEL_FONT_PX}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color;
    ctx.fillText(`P${playerId}`, 0, 0);
    ctx.restore();
}
