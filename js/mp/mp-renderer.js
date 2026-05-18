// MP renderer.
//
// Thin Canvas2D renderer for the MP loop. Reads scalar state from the
// WASM `World` (ship_x / ship_y / ship_angle / field_width /
// field_height) for the LOCAL ship, then paints any REMOTE ships the
// engine has already interpolated for this frame. The 1920x1080
// logical world is letterboxed into the live canvas.
//
// Phase 3 extends the renderer to draw enemies, asteroids, and
// bullets sourced directly from the WASM `World` per-entity
// accessors (no client interpolation — engine has populated the
// world for this frame). Z-order from back to front:
//   1. Asteroids (wireframe gray 12-gons)
//   2. Enemies   (red triangles + HP bar)
//   3. Bullets   (small cyan dots)
//   4. Remote ships (palette-colored triangles + "P<id>" labels)
//   5. Local ship   (white triangle)
// Downed ships (local or remote) draw dim with a pulsing cyan
// revive-radius hint so live teammates know where to hover.
//
// Contract: `render(ctx, canvas, world, aim, remoteShips)` where
// `remoteShips` is `Array<{player_id, x, y, vx, vy, angle, hp,
// max_hp, downed}>` already interpolated by mp-engine. Empty/omitted
// in solo or before any snapshots arrive — `remoteShips` defaults to
// `[]` so the Phase 1 four-argument call site keeps working.
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

// Phase 3 entity styling.
const ASTEROID_COLOR = "#888";
const ASTEROID_SIDES = 12;
const ASTEROID_HP_BAR_W = 24;
const ASTEROID_HP_BAR_H = 3;
const ASTEROID_HP_BAR_GAP = 10;   // gap above the asteroid edge
const ASTEROID_HP_FILL = "#bbb";

const ENEMY_FILL = "#ff4444";
const ENEMY_STROKE = "#ff8888";
const ENEMY_HP_BAR_W = 30;
const ENEMY_HP_BAR_H = 3;
const ENEMY_HP_BAR_Y_OFFSET = 28; // pixels above the enemy center

const BULLET_COLOR = "#00ccff";
const BULLET_RADIUS = 3;

// Revive hint — matches the simulation's REVIVE_RADIUS (80 px).
const REVIVE_RADIUS = 80;
const REVIVE_HINT_COLOR_RGB = "80, 200, 255";
const DOWNED_ALPHA = 0.4;
const DOWNED_SHIP_FILL = "#ffffff";
const DOWNED_SHIP_STROKE = "#bbbbbb";

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

    // ---- Phase 3 entities, back to front ----

    // Asteroids (back).
    const acount = world.asteroid_count();
    for (let i = 0; i < acount; i++) {
        drawAsteroid(
            ctx,
            world.asteroid_x(i),
            world.asteroid_y(i),
            world.asteroid_rot(i),
            world.asteroid_radius(i),
            world.asteroid_hp(i),
            world.asteroid_max_hp(i),
            scale,
        );
    }

    // Enemies.
    const ecount = world.enemy_count();
    for (let i = 0; i < ecount; i++) {
        drawEnemy(
            ctx,
            world.enemy_x(i),
            world.enemy_y(i),
            world.enemy_angle(i),
            world.enemy_hp(i),
            world.enemy_max_hp(i),
            scale,
        );
    }

    // Bullets.
    const bcount = world.bullet_count();
    for (let i = 0; i < bcount; i++) {
        drawBullet(
            ctx,
            world.bullet_x(i),
            world.bullet_y(i),
            scale,
        );
    }

    // ---- Ships (front layer) ----

    const tick = world.tick_count();

    // Remote ships — slot-indexed palette + floating "P<id>" label.
    // The engine has already interpolated x/y/angle into render-space;
    // we just paint. No label above the local ship — it's "you".
    // Downed remotes draw dim + a pulsing revive-radius hint.
    for (let i = 0; i < remoteShips.length; i++) {
        const r = remoteShips[i];
        if (!r) continue;
        if (r.downed) {
            ctx.save();
            ctx.globalAlpha = DOWNED_ALPHA;
            drawShipTriangle(ctx, r.x, r.y, r.angle, DOWNED_SHIP_FILL, DOWNED_SHIP_STROKE, scale);
            ctx.restore();
            drawReviveHint(ctx, r.x, r.y, tick, scale);
            drawRemoteLabel(ctx, r.x, r.y, r.player_id, DOWNED_SHIP_STROKE, scale);
        } else {
            const color = REMOTE_PALETTE[r.player_id % REMOTE_PALETTE.length];
            drawShipTriangle(ctx, r.x, r.y, r.angle, color, color, scale);
            drawRemoteLabel(ctx, r.x, r.y, r.player_id, color, scale);
        }
    }

    // Local ship — pulled directly from the WASM World.
    const sx = world.ship_x();
    const sy = world.ship_y();
    const sa = world.ship_angle();
    if (world.ship_downed()) {
        ctx.save();
        ctx.globalAlpha = DOWNED_ALPHA;
        drawShipTriangle(ctx, sx, sy, sa, DOWNED_SHIP_FILL, DOWNED_SHIP_STROKE, scale);
        ctx.restore();
        drawReviveHint(ctx, sx, sy, tick, scale);
    } else {
        drawShipTriangle(ctx, sx, sy, sa, SHIP_FILL, SHIP_STROKE, scale);
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

// Wireframe 12-gon, rotated and scaled to match the sim's asteroid.
// HP bar above is suppressed at full HP to keep room-boot visually
// clean.
function drawAsteroid(ctx, x, y, rot, radius, hp, maxHp, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = ASTEROID_COLOR;
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    for (let i = 0; i < ASTEROID_SIDES; i++) {
        const theta = (i / ASTEROID_SIDES) * Math.PI * 2;
        const px = Math.cos(theta) * radius;
        const py = Math.sin(theta) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    if (hp < maxHp) {
        drawHpBar(
            ctx,
            x,
            y - radius - ASTEROID_HP_BAR_GAP,
            ASTEROID_HP_BAR_W,
            ASTEROID_HP_BAR_H,
            hp / maxHp,
            ASTEROID_HP_FILL,
            scale,
        );
    }
}

// Red triangle for HUNTER (Phase 3's only enemy kind). Reuses the
// ship triangle geometry so silhouettes are consistent at a glance —
// only the palette signals "hostile". HP bar is always shown for
// enemies since they're always combat-relevant.
function drawEnemy(ctx, x, y, angle, hp, maxHp, scale) {
    drawShipTriangle(ctx, x, y, angle, ENEMY_FILL, ENEMY_STROKE, scale);
    drawHpBar(
        ctx,
        x,
        y - ENEMY_HP_BAR_Y_OFFSET,
        ENEMY_HP_BAR_W,
        ENEMY_HP_BAR_H,
        hp / maxHp,
        ENEMY_FILL,
        scale,
    );
}

// Small filled cyan disc — matches solo's PULSE_CANNON color so the
// player's projectiles read the same in MP.
function drawBullet(ctx, x, y, scale) {
    ctx.save();
    ctx.fillStyle = BULLET_COLOR;
    ctx.beginPath();
    ctx.arc(x, y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// HP bar shared by enemies and damaged asteroids. Centered on `x`,
// top at `y`. Dark background + colored fill + faint white border.
// `scale` is the world->screen scale so border strokes stay 1px.
function drawHpBar(ctx, x, y, w, h, fillFraction, color, scale) {
    ctx.save();
    ctx.lineWidth = 1 / scale;
    // Background (dark gray, no border yet — fill then stroke last).
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(x - w / 2, y, w, h);
    // Filled portion.
    ctx.fillStyle = color;
    const clamped = Math.max(0, Math.min(1, fillFraction));
    ctx.fillRect(x - w / 2, y, w * clamped, h);
    // Border.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.strokeRect(x - w / 2, y, w, h);
    ctx.restore();
}

// Faint cyan ring showing the REVIVE_RADIUS around a downed ship —
// nearby live players can see where to hover to start a revive. The
// alpha oscillates with tick_count for a deterministic slow pulse
// (replay-safe, no Date.now()).
function drawReviveHint(ctx, x, y, tick, scale) {
    ctx.save();
    const alpha = 0.2 + 0.1 * Math.sin(tick * 0.05);
    ctx.strokeStyle = `rgba(${REVIVE_HINT_COLOR_RGB}, ${alpha})`;
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    ctx.arc(x, y, REVIVE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
