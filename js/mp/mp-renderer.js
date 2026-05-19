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

// Per-kind enemy color tokens. Sourced from
// `js/modules/enemy/enemy-data.js` so MP enemies read the same color
// as their solo counterparts. The kind index (u8 from
// `world.enemy_kind(idx)`) matches the discriminator declared in the
// sim crate's mp1 modules:
//   0 HUNTER, 1 GUARDIAN, 2 WASP, 3 STALKER, 4 DRIFTER,
//   5 TANGERINE, 6 WEAVER, 7 SENTINEL, 8 PROWLER, 9 TITAN.
const ENEMY_KIND_COLORS = [
    "#ff4444", // 0 HUNTER     — red
    "#44ff44", // 1 GUARDIAN   — green
    "#ffff44", // 2 WASP       — yellow
    "#44ffff", // 3 STALKER    — cyan-ish
    "#00ffff", // 4 DRIFTER    — cyan
    "#ff8844", // 5 TANGERINE  — orange
    "#ffff00", // 6 WEAVER     — yellow
    "#00ff00", // 7 SENTINEL   — green
    "#ff00ff", // 8 PROWLER    — magenta
    "#ff44ff", // 9 TITAN      — boss magenta
];

const BULLET_COLOR = "#00ccff";
const BULLET_RADIUS = 3;

// Mines — stationary, bullet-targetable hazards. Solo draws a red disc
// with a warning ring + cross-hatch; MP MVP keeps it simple: red disc,
// outline ring, and a slow tick-driven pulse so they read as menacing.
const MINE_FILL = "#ff3030";
const MINE_OUTLINE = "rgba(255, 80, 80, 0.85)";
const MINE_RING = "rgba(255, 60, 60, 0.45)";

// Missiles — fast homing projectile, drawn as a small elongated red
// triangle pointing along the velocity heading.
const MISSILE_COLOR = "#ff4444";
const MISSILE_STROKE = "#ffaa88";
const MISSILE_LENGTH = 12;
const MISSILE_HALF_WIDTH = 4;

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

    // Orbs (between asteroids and enemies — they're field pickups).
    const ocount = world.orb_count();
    for (let i = 0; i < ocount; i++) {
        drawOrb(
            ctx,
            world.orb_x(i),
            world.orb_y(i),
            world.orb_kind(i),
            world.orb_opacity(i),
            scale,
        );
    }

    // Mines (drawn under enemies so an enemy hovering on top reads
    // as the more important threat; still over orbs which are
    // pickups).
    if (typeof world.enemy_mine_count === "function") {
        drawEnemyMines(ctx, world, scale);
    }

    // Enemies — per-kind dispatch (color + silhouette).
    const ecount = world.enemy_count();
    for (let i = 0; i < ecount; i++) {
        drawEnemy(
            ctx,
            world.enemy_x(i),
            world.enemy_y(i),
            world.enemy_angle(i),
            world.enemy_hp(i),
            world.enemy_max_hp(i),
            // Older WASM builds may not expose enemy_kind; default to
            // HUNTER (0) so the renderer stays back-compatible.
            typeof world.enemy_kind === "function" ? world.enemy_kind(i) : 0,
            scale,
        );
    }

    // Missiles (over enemies so they read as live projectiles).
    if (typeof world.enemy_missile_count === "function") {
        drawEnemyMissiles(ctx, world, scale);
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

    // Enemy bullets (red, slightly larger than player bullets).
    const ebcount = world.enemy_bullet_count();
    for (let i = 0; i < ebcount; i++) {
        drawEnemyBullet(
            ctx,
            world.enemy_bullet_x(i),
            world.enemy_bullet_y(i),
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

// Per-kind enemy draw — dispatches on the u8 kind discriminator and
// picks a color + silhouette. MVP shapes (not pixel-perfect against
// solo's full renderer): color + general silhouette is enough for
// gameplay legibility. HP bar is always shown since enemies are always
// combat-relevant.
function drawEnemy(ctx, x, y, angle, hp, maxHp, kind, scale) {
    const color = ENEMY_KIND_COLORS[kind] || ENEMY_FILL;
    const stroke = color;
    switch (kind) {
        case 0: // HUNTER — triangle (same as ship geometry).
            drawShipTriangle(ctx, x, y, angle, color, stroke, scale);
            break;
        case 1: // GUARDIAN — octagon.
            drawEnemyPolygon(ctx, x, y, angle, 18, 8, color, stroke, scale);
            break;
        case 2: // WASP — small sharp triangle.
            drawEnemyTriangle(ctx, x, y, angle, 12, 7, color, stroke, scale);
            break;
        case 3: // STALKER — diamond.
            drawEnemyDiamond(ctx, x, y, angle, 16, 10, color, stroke, scale);
            break;
        case 4: // DRIFTER — pentagon.
            drawEnemyPolygon(ctx, x, y, angle, 16, 5, color, stroke, scale);
            break;
        case 5: // TANGERINE — circle with cross.
            drawEnemyCircleCross(ctx, x, y, 14, color, stroke, scale);
            break;
        case 6: // WEAVER — hexagon.
            drawEnemyPolygon(ctx, x, y, angle, 16, 6, color, stroke, scale);
            break;
        case 7: // SENTINEL — rotated square / diamond.
            drawEnemyDiamond(ctx, x, y, angle + Math.PI * 0.25, 14, 14, color, stroke, scale);
            break;
        case 8: // PROWLER — elongated triangle.
            drawEnemyTriangle(ctx, x, y, angle, 22, 10, color, stroke, scale);
            break;
        case 9: // TITAN — large hexagon with inner detail (boss feel).
            drawEnemyPolygon(ctx, x, y, angle, 32, 6, color, stroke, scale);
            drawEnemyPolygon(ctx, x, y, -angle, 16, 6, color, stroke, scale);
            break;
        default:
            drawShipTriangle(ctx, x, y, angle, color, stroke, scale);
            break;
    }
    drawHpBar(
        ctx,
        x,
        y - ENEMY_HP_BAR_Y_OFFSET,
        ENEMY_HP_BAR_W,
        ENEMY_HP_BAR_H,
        hp / maxHp,
        color,
        scale,
    );
}

// Regular N-gon centered on (x,y), rotated by `angle`. Stroked
// (wireframe) so enemies read as line-art against the dark backdrop.
function drawEnemyPolygon(ctx, x, y, angle, radius, sides, fillStyle, strokeStyle, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const theta = (i / sides) * Math.PI * 2;
        const px = Math.cos(theta) * radius;
        const py = Math.sin(theta) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();
    ctx.restore();
}

// Isoceles triangle pointing along +x in local space, parameterized so
// WASP (short/sharp) and PROWLER (long) can share the same primitive.
function drawEnemyTriangle(ctx, x, y, angle, length, halfWidth, fillStyle, strokeStyle, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(length, 0);
    ctx.lineTo(-length * 0.6, -halfWidth);
    ctx.lineTo(-length * 0.6, halfWidth);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
    ctx.restore();
}

// Diamond / kite. `length` is half-length along +x (point), `width` is
// half-width across +y.
function drawEnemyDiamond(ctx, x, y, angle, length, width, fillStyle, strokeStyle, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(length, 0);
    ctx.lineTo(0, -width);
    ctx.lineTo(-length, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();
    ctx.restore();
}

// Filled disc with a cross overlay. Used by TANGERINE for the citrus
// look — round body + a faint cross to suggest segmenting.
function drawEnemyCircleCross(ctx, x, y, radius, fillStyle, strokeStyle, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();
    // Cross — counter-scaled lineWidth so the cross reads at any
    // letterbox scale.
    ctx.beginPath();
    ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius); ctx.lineTo(0, radius);
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.stroke();
    ctx.restore();
}

// Mines — stationary red discs with a faint warning ring. The ring
// alpha pulses on tick so the hazard reads as live even though it's
// not moving. HP fraction (< 1.0) dims the body so a damaged mine
// looks worn.
function drawEnemyMines(ctx, world, scale) {
    const tick = world.tick_count();
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08); // 0..1, slow.
    const ringAlpha = 0.25 + 0.35 * pulse;
    const count = world.enemy_mine_count();
    for (let i = 0; i < count; i++) {
        const x = world.enemy_mine_x(i);
        const y = world.enemy_mine_y(i);
        const r = world.enemy_mine_radius(i);
        const hpFrac = typeof world.enemy_mine_hp_fraction === "function"
            ? world.enemy_mine_hp_fraction(i)
            : 1.0;
        ctx.save();
        ctx.translate(x, y);
        // Warning ring (drawn under the body so it haloes the mine).
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 60, 60, ${ringAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
        // Body.
        ctx.globalAlpha = 0.55 + 0.45 * Math.max(0, Math.min(1, hpFrac));
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = MINE_FILL;
        ctx.fill();
        ctx.strokeStyle = MINE_OUTLINE;
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
        // Subtle cross-hatch — two thin lines through the center for
        // texture (matches solo's mine "danger" read).
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = MINE_RING;
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6);
        ctx.moveTo(-r * 0.6, r * 0.6); ctx.lineTo(r * 0.6, -r * 0.6);
        ctx.stroke();
        ctx.restore();
    }
}

// Missiles — small red elongated triangle pointed along the velocity
// vector. atan2(vy, vx) is the heading; degenerate (zero-velocity)
// missiles fall back to angle 0 so the geometry never NaNs.
function drawEnemyMissiles(ctx, world, scale) {
    const count = world.enemy_missile_count();
    for (let i = 0; i < count; i++) {
        const x = world.enemy_missile_x(i);
        const y = world.enemy_missile_y(i);
        const vx = world.enemy_missile_vx(i);
        const vy = world.enemy_missile_vy(i);
        const angle = (vx === 0 && vy === 0) ? 0 : Math.atan2(vy, vx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(MISSILE_LENGTH, 0);
        ctx.lineTo(-MISSILE_LENGTH * 0.5, -MISSILE_HALF_WIDTH);
        ctx.lineTo(-MISSILE_LENGTH * 0.5, MISSILE_HALF_WIDTH);
        ctx.closePath();
        ctx.fillStyle = MISSILE_COLOR;
        ctx.fill();
        ctx.strokeStyle = MISSILE_STROKE;
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
        ctx.restore();
    }
}

// Small filled cyan disc — matches solo's PULSE_CANNON color so the
// player's projectiles read the same in MP.
// Phase 4 — pickup orb. Gold = yellow disc (medium-bright). Health =
// green cross on darker green disc. Opacity passed in directly from
// the WASM mirror (fades gold orbs in their last 120 ticks).
const ORB_RADIUS_PX = 8;
const ORB_GOLD_FILL = "#ffd84d";
const ORB_GOLD_STROKE = "#ffa800";
const ORB_HEALTH_FILL = "#4dff8a";
const ORB_HEALTH_CROSS = "#ffffff";

function drawOrb(ctx, x, y, kind, opacity, scale) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity || 1));
    ctx.translate(x, y);
    if (kind === 1 /* health */) {
        ctx.beginPath();
        ctx.arc(0, 0, ORB_RADIUS_PX, 0, Math.PI * 2);
        ctx.fillStyle = ORB_HEALTH_FILL;
        ctx.fill();
        // Cross — drawn in screen-stable thickness (counter-scaled).
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = ORB_HEALTH_CROSS;
        ctx.beginPath();
        ctx.moveTo(-4, 0); ctx.lineTo(4, 0);
        ctx.moveTo(0, -4); ctx.lineTo(0, 4);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, ORB_RADIUS_PX, 0, Math.PI * 2);
        ctx.fillStyle = ORB_GOLD_FILL;
        ctx.fill();
        ctx.lineWidth = 1.5 / scale;
        ctx.strokeStyle = ORB_GOLD_STROKE;
        ctx.stroke();
    }
    ctx.restore();
}

// Phase 4 — enemy bullet. Red glowing dot, slightly larger than the
// cyan player bullet so incoming shots read as a distinct threat.
const ENEMY_BULLET_RADIUS_PX = 5;
const ENEMY_BULLET_FILL = "#ff4444";
const ENEMY_BULLET_STROKE = "rgba(255, 100, 100, 0.55)";
function drawEnemyBullet(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, ENEMY_BULLET_RADIUS_PX, 0, Math.PI * 2);
    ctx.fillStyle = ENEMY_BULLET_FILL;
    ctx.fill();
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = ENEMY_BULLET_STROKE;
    ctx.stroke();
    ctx.restore();
}

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
