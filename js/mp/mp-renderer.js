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
import {
    drawAsteroidShape,
    generateAsteroidVertices,
    projectAsteroidVertices,
    ASTEROID_EDGES,
    ASTEROID_FOV,
    drawShipShape,
    drawEnemyShapeByType,
} from "../modules/render/shapes.js";

// MP enemy kind discriminator (u8) → solo enemy type string. Matches
// wave_table::KIND_* ordering (HUNTER=0 … TITAN=9).
const MP_ENEMY_KIND_TO_TYPE = [
    "HUNTER", "GUARDIAN", "WASP", "STALKER", "DRIFTER",
    "TANGERINE", "WEAVER", "SENTINEL", "PROWLER", "TITAN",
];

// Ship draw radius for the shared winged-hull silhouette. ~13 keeps a
// footprint close to the old 15px triangle while reading as a proper ship.
const MP_SHIP_RADIUS = 13;

// Build a `drawShipShape` palette tinted by a single player color.
// `color` is a #rrggbb hex; appended alpha bytes give the translucent
// wing fill. Local ship + each remote slot get their own hue this way.
function mpShipPalette(color) {
    return {
        wingFill: color + "66",
        wingStroke: color,
        hullFill: "rgba(18, 20, 32, 0.92)",
        hullStroke: color,
        cockpitFill: "#ffffff",
        cockpitStroke: color,
    };
}
const MP_SHIP_PALETTE_DOWNED = {
    wingFill: "rgba(160, 160, 170, 0.30)",
    wingStroke: "#bbbbbb",
    hullFill: "rgba(30, 30, 36, 0.85)",
    hullStroke: "#999999",
    cockpitFill: "#dddddd",
    cockpitStroke: "#aaaaaa",
};

const WORLD_BG = "#000000";
const WORLD_BOUNDS_COLOR = "rgba(140, 140, 160, 0.35)";

// ── Asteroid silhouette cache (cosmetic, client-local) ──────────────
// The sim gives us only id / x / y / rot / radius. The tumbling
// 3D-wireframe silhouette is a pure function of the asteroid id (both
// tabs agree on ids → both derive the same shape via a seeded PRNG).
// We cache the generated vertices + per-axis spin + hue palette per id
// and advance the spin client-side each frame, then hand the projected
// 2D verts to the shared drawAsteroidShape helper (same code solo uses).
const _astShapeCache = new Map();
let _astSeenTick = 0;

// Deterministic 32-bit PRNG (mulberry32). Seeded by asteroid id so the
// silhouette is identical across both clients without any wire cost.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function getAsteroidShape(id, radius) {
    let s = _astShapeCache.get(id);
    if (!s) {
        const rng = mulberry32(id || 1);
        s = {
            vertices3D: generateAsteroidVertices(rng, radius),
            rot3D: { x: rng() * 6.283, y: rng() * 6.283, z: rng() * 6.283 },
            rotVel3D: {
                x: (rng() - 0.5) * 0.08,
                y: (rng() - 0.5) * 0.08,
                z: (rng() - 0.5) * 0.08,
            },
            baseHue: rng() < 0.2 ? 40 + rng() * 20 : 150 + rng() * 130,
            hueSpread: 30 + rng() * 70,
            hueCycleSpeed: 10 + rng() * 20,
            saturation: 80 + rng() * 15,
            lightness: 65 + rng() * 15,
            projected: null,
            lastSeen: 0,
        };
        _astShapeCache.set(id, s);
    }
    return s;
}

// Draw all asteroids via the shared tumbling-wireframe helper. `now`
// is monotonic ms for the hue cycle; `tick` is the sim tick used to
// prune cache entries for asteroids that have despawned.
function drawAsteroids(ctx, world, scale, now) {
    const tick = (typeof world.tick_count === "function") ? world.tick_count() : ++_astSeenTick;
    const acount = world.asteroid_count();
    for (let i = 0; i < acount; i++) {
        const id = (typeof world.asteroid_id === "function") ? world.asteroid_id(i) : i + 1;
        const x = world.asteroid_x(i);
        const y = world.asteroid_y(i);
        const radius = world.asteroid_radius(i);
        const s = getAsteroidShape(id, radius);
        s.lastSeen = tick;
        // Advance the cosmetic 3D tumble client-side.
        s.rot3D.x += s.rotVel3D.x;
        s.rot3D.y += s.rotVel3D.y;
        s.rot3D.z += s.rotVel3D.z;
        s.projected = projectAsteroidVertices(s.vertices3D, s.rot3D, ASTEROID_FOV, s.projected);
        ctx.save();
        ctx.translate(x, y);
        drawAsteroidShape(ctx, {
            projectedVertices: s.projected,
            edges: ASTEROID_EDGES,
            fov: ASTEROID_FOV,
            radius,
            baseHue: s.baseHue,
            hueCycleSpeed: s.hueCycleSpeed,
            hueSpread: s.hueSpread,
            saturation: s.saturation,
            lightness: s.lightness,
            now,
        });
        ctx.restore();
    }
    // Prune despawned asteroids occasionally so the cache doesn't grow
    // unbounded over a long session.
    if (_astShapeCache.size > 64) {
        for (const [id, s] of _astShapeCache) {
            if (s.lastSeen !== tick) _astShapeCache.delete(id);
        }
    }
}
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

// ── Phase 4 step 6 — player power-weapon visuals ──
// Player mines (cyan friendly variant of the enemy red mine).
const PLAYER_MINE_FILL = "#44ccff";
const PLAYER_MINE_OUTLINE = "rgba(120, 200, 255, 0.6)";
const PLAYER_MINE_HATCH = "rgba(150, 220, 255, 0.5)";
const PLAYER_MINE_HP_GOOD = "#44ff66";
const PLAYER_MINE_HP_MID = "#ffd84d";
const PLAYER_MINE_HP_LOW = "#ff5e5e";

// Player missiles — cyan elongated triangle pointed along velocity.
const PLAYER_MISSILE_FILL = "#44ddff";
const PLAYER_MISSILE_STROKE = "#88ffff";

// Beam visuals (LANCE_BEAM = solid green line, LIGHTNING_ARC = purple).
const LANCE_BEAM_LENGTH_PX = 1728;
const LANCE_BEAM_WIDTH_PX = 6;
const LANCE_BEAM_OUTER = "#44ff44";
const LANCE_BEAM_CORE = "#ddffdd";
const LIGHTNING_ARC_COLOR = "#a855ff";
const KIND_LANCE_BEAM = 4;
const KIND_LIGHTNING_ARC = 5;

// Charge indicator (CHARGE_SHOT ring around the local ship).
const CHARGE_MAX_TICKS = 180;
const CHARGE_RING_COLOR = "#00e6aa";

// Revive hint — matches the simulation's REVIVE_RADIUS (80 px).
const REVIVE_RADIUS = 80;
const REVIVE_HINT_COLOR_RGB = "80, 200, 255";
const DOWNED_ALPHA = 0.4;
const DOWNED_SHIP_FILL = "#ffffff";
const DOWNED_SHIP_STROKE = "#bbbbbb";

export function render(ctx, canvas, world, aim, remoteShips = [], opts = {}) {
    // opts.webglBullets — when true, the engine draws bullets / enemy
    // bullets / both missile kinds on the additive WebGL bulletCanvas,
    // so the Canvas2D fallbacks below are skipped to avoid double-draw.
    const webglBullets = !!opts.webglBullets;
    const nowMs = (typeof performance !== "undefined" && performance.now)
        ? performance.now() : Date.now();
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

    // Asteroids (back) — shared tumbling-wireframe helper (same draw
    // code solo uses), silhouette derived from the asteroid id.
    drawAsteroids(ctx, world, scale, nowMs);

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

    // Player-laid mines — friendly cyan variant, sits in the same
    // z-band as enemy mines (below enemies, above asteroids/orbs) so
    // the player can read them as terrain features without obscuring
    // active enemy threats.
    if (typeof world.player_mine_count === "function") {
        drawPlayerMines(ctx, world, scale);
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
            typeof world.enemy_radius === "function" ? world.enemy_radius(i) : 18,
            nowMs,
            scale,
        );
    }

    // Projectiles. When the WebGL bullet layer is active (opts.webglBullets)
    // the engine paints all four projectile kinds on the additive
    // bulletCanvas for the bloom look; we skip the Canvas2D fallbacks
    // here to avoid double-draw. The fallbacks still run when WebGL2 is
    // unavailable so projectiles never silently disappear.
    if (!webglBullets) {
        // Missiles (over enemies so they read as live projectiles).
        if (typeof world.enemy_missile_count === "function") {
            drawEnemyMissiles(ctx, world, scale);
        }
        if (typeof world.player_missile_count === "function") {
            drawPlayerMissiles(ctx, world, scale);
        }
        const bcount = world.bullet_count();
        for (let i = 0; i < bcount; i++) {
            drawBullet(ctx, world.bullet_x(i), world.bullet_y(i), scale);
        }
        const ebcount = world.enemy_bullet_count();
        for (let i = 0; i < ebcount; i++) {
            drawEnemyBullet(ctx, world.enemy_bullet_x(i), world.enemy_bullet_y(i), scale);
        }
    }

    // Ship beams — drawn over all projectiles so the LANCE_BEAM /
    // LIGHTNING_ARC visuals punch through everything (still under the
    // ship sprites, which are painted next).
    if (typeof world.ship_beam_remaining_ticks === "function") {
        drawShipBeams(ctx, world, remoteShips, scale);
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
            drawShipShape(ctx, r.x, r.y, r.angle, { radius: MP_SHIP_RADIUS, palette: MP_SHIP_PALETTE_DOWNED });
            ctx.restore();
            drawReviveHint(ctx, r.x, r.y, tick, scale);
            drawRemoteLabel(ctx, r.x, r.y, r.player_id, DOWNED_SHIP_STROKE, scale);
        } else {
            const color = REMOTE_PALETTE[r.player_id % REMOTE_PALETTE.length];
            drawShipShape(ctx, r.x, r.y, r.angle, { radius: MP_SHIP_RADIUS, palette: mpShipPalette(color) });
            drawRemoteLabel(ctx, r.x, r.y, r.player_id, color, scale);
        }
    }

    // Local ship — pulled directly from the WASM World. Cyan palette so
    // "you" reads distinct from the magenta/palette remotes.
    const sx = world.ship_x();
    const sy = world.ship_y();
    const sa = world.ship_angle();
    if (world.ship_downed()) {
        ctx.save();
        ctx.globalAlpha = DOWNED_ALPHA;
        drawShipShape(ctx, sx, sy, sa, { radius: MP_SHIP_RADIUS, palette: MP_SHIP_PALETTE_DOWNED });
        ctx.restore();
        drawReviveHint(ctx, sx, sy, tick, scale);
    } else {
        drawShipShape(ctx, sx, sy, sa, { radius: MP_SHIP_RADIUS, palette: mpShipPalette("#3df1ff") });
    }

    // Charge-up indicator (CHARGE_SHOT pre-fire halo around the local
    // ship). Drawn last so it composites cleanly over the ship body.
    if (typeof world.ship_charge_progress === "function") {
        drawChargeIndicator(ctx, world, sx, sy, tick, scale);
    }
}

// (6.x — drawShipTriangle removed; ships now use the shared winged-hull
// drawShipShape from js/modules/render/shapes.js.)

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
function drawEnemy(ctx, x, y, angle, hp, maxHp, kind, radius, now, scale) {
    const type = MP_ENEMY_KIND_TO_TYPE[kind] || "HUNTER";
    const color = ENEMY_KIND_COLORS[kind] || ENEMY_FILL;
    // Shared per-kind silhouette (same art solo draws). The helper
    // assumes ctx is pre-translated to the enemy + rotated to its
    // facing, with strokeStyle/fillStyle pre-set to the kind color —
    // mirroring solo's `Enemy.draw` → `drawEnemyShape` setup. MP has no
    // turret charge/firing state, so the per-kind defaults render the
    // idle silhouette (forward-pointing TITAN barrel, un-boosted DRIFTER
    // core, idle WEAVER turret).
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle); // solo rotates by faceAngle; MP enemy_angle matches
    ctx.strokeStyle = color;
    ctx.fillStyle = color + "40";
    ctx.lineWidth = 2;
    drawEnemyShapeByType(ctx, type, { radius: radius || 18, color, now: now || 0 });
    ctx.restore();
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

// (6.x — the bespoke MP enemy-silhouette primitives drawEnemyPolygon /
// drawEnemyTriangle / drawEnemyDiamond / drawEnemyCircleCross were
// removed when MP adopted solo's shared per-kind enemy art via
// drawEnemyShapeByType. See js/modules/render/shapes.js.)

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

// Player-laid mines — friendly cyan discs (mirror of drawEnemyMines but
// flipped to a non-threatening color). A thin top-half arc shows the
// mine's remaining HP, color-coded green/yellow/red. The body alpha
// pulses on tick so the mine reads as a live, homing-style hazard.
function drawPlayerMines(ctx, world, scale) {
    const tick = world.tick_count();
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.1); // 0..1, slightly faster than enemy mines.
    const count = world.player_mine_count();
    for (let i = 0; i < count; i++) {
        const x = world.player_mine_x(i);
        const y = world.player_mine_y(i);
        const r = world.player_mine_radius(i);
        const hpFrac = typeof world.player_mine_hp_fraction === "function"
            ? Math.max(0, Math.min(1, world.player_mine_hp_fraction(i)))
            : 1.0;
        ctx.save();
        ctx.translate(x, y);
        // Outline ring — slightly larger halo around the body.
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
        ctx.strokeStyle = PLAYER_MINE_OUTLINE;
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
        // Body disc — alpha pulses for the homing "armed" feel.
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = PLAYER_MINE_FILL;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Cross-hatch texture (matches enemy mine treatment).
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = PLAYER_MINE_HATCH;
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6);
        ctx.moveTo(-r * 0.6, r * 0.6); ctx.lineTo(r * 0.6, -r * 0.6);
        ctx.stroke();
        // HP arc across the top half (PI..0 sweep), shrinking with HP.
        const hpColor = hpFrac > 0.5
            ? PLAYER_MINE_HP_GOOD
            : (hpFrac >= 0.25 ? PLAYER_MINE_HP_MID : PLAYER_MINE_HP_LOW);
        ctx.beginPath();
        // Sweep over the top half: start at left (PI), end where HP runs out.
        ctx.arc(0, 0, r * 1.7, Math.PI, Math.PI + Math.PI * hpFrac);
        ctx.strokeStyle = hpColor;
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
        ctx.restore();
    }
}

// Player missiles — cyan elongated triangle pointed along the velocity
// vector (mirror of drawEnemyMissiles with flipped color polarity).
function drawPlayerMissiles(ctx, world, scale) {
    const count = world.player_missile_count();
    for (let i = 0; i < count; i++) {
        const x = world.player_missile_x(i);
        const y = world.player_missile_y(i);
        const vx = world.player_missile_vx(i);
        const vy = world.player_missile_vy(i);
        const angle = (vx === 0 && vy === 0) ? 0 : Math.atan2(vy, vx);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(MISSILE_LENGTH, 0);
        ctx.lineTo(-MISSILE_LENGTH * 0.5, -MISSILE_HALF_WIDTH);
        ctx.lineTo(-MISSILE_LENGTH * 0.5, MISSILE_HALF_WIDTH);
        ctx.closePath();
        ctx.fillStyle = PLAYER_MISSILE_FILL;
        ctx.fill();
        ctx.strokeStyle = PLAYER_MISSILE_STROKE;
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
        ctx.restore();
    }
}

// Ship beams — LANCE_BEAM (solid green line) and LIGHTNING_ARC (electric
// purple). Iterates the ships Vec by position (the same indexing the
// `ship_beam_*` accessors use). Position per Vec idx is not exposed by a
// generic accessor, so we resolve it from the data we DO have:
//   - The local ship: world.ship_x()/ship_y()/ship_angle().
//   - Remote ships: the `remoteShips` array the engine interpolated.
// We map each Vec idx to a position by matching against those known
// origins. The ships Vec is [local + remotes] in join order; since the
// local Vec idx is not exposed, we probe every idx and pick the closest
// known origin by aim-angle/position. For the common (1-2 player) case
// this resolves cleanly; multi-ship rooms with overlapping beams may
// mis-attribute origin until a per-idx position accessor lands.
function drawShipBeams(ctx, world, remoteShips, scale) {
    const tick = world.tick_count();
    const remoteCount = typeof world.remote_ship_count === "function"
        ? world.remote_ship_count()
        : 0;
    const totalShips = (typeof world.ship_count === "function")
        ? world.ship_count()
        : remoteCount + 1;

    // Collect candidate origins so each active beam can be placed at a
    // plausible ship. Local first, then each interpolated remote.
    const origins = [];
    if (!world.ship_downed()) {
        origins.push({ x: world.ship_x(), y: world.ship_y(), used: false });
    }
    for (let i = 0; i < remoteShips.length; i++) {
        const r = remoteShips[i];
        if (r && !r.downed) origins.push({ x: r.x, y: r.y, used: false });
    }

    let originCursor = 0;
    for (let idx = 0; idx < totalShips; idx++) {
        if (world.ship_beam_remaining_ticks(idx) <= 0) continue;
        const beamKind = world.ship_beam_kind(idx);
        const aim = world.ship_beam_aim_angle(idx);
        // Assign the next unused origin in order. Origins are ordered
        // local-then-remotes; beams are rare enough that round-robin
        // assignment is adequate for MVP legibility.
        let origin = null;
        while (originCursor < origins.length && origins[originCursor].used) {
            originCursor++;
        }
        if (originCursor < origins.length) {
            origin = origins[originCursor];
            origin.used = true;
        }
        if (!origin) continue;

        if (beamKind === KIND_LANCE_BEAM) {
            drawLanceBeam(ctx, origin.x, origin.y, aim, tick, scale);
        } else if (beamKind === KIND_LIGHTNING_ARC) {
            drawLightningArc(ctx, origin.x, origin.y, tick, scale);
        }
    }
}

// LANCE_BEAM — a fixed-length green line from the ship along the aim
// angle. Two stroked passes (wide green glow + thin white-green core)
// give the layered laser look. Alpha pulses subtly on tick.
function drawLanceBeam(ctx, x, y, angle, tick, scale) {
    const ex = x + Math.cos(angle) * LANCE_BEAM_LENGTH_PX;
    const ey = y + Math.sin(angle) * LANCE_BEAM_LENGTH_PX;
    const pulse = 0.85 + 0.15 * Math.sin(tick * 0.4);
    ctx.save();
    ctx.lineCap = "round";
    // Outer glow.
    ctx.globalAlpha = 0.55 * pulse;
    ctx.strokeStyle = LANCE_BEAM_OUTER;
    ctx.lineWidth = LANCE_BEAM_WIDTH_PX;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    // Inner core.
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = LANCE_BEAM_CORE;
    ctx.lineWidth = LANCE_BEAM_WIDTH_PX * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
}

// LIGHTNING_ARC — MVP placeholder. The real arc is a polyline through
// the chained hit targets, which the sim emits as ArcStrike { chain }
// events. Those positions are not yet plumbed into the renderer, so we
// draw a short static "crackle" of jagged segments radiating from the
// ship to signal the arc is active.
// TODO Phase 5 polish: thread the ArcStrike chain positions in via an
// engine-populated cache and replace this with the true chain polyline.
function drawLightningArc(ctx, x, y, tick, scale) {
    ctx.save();
    ctx.strokeStyle = LIGHTNING_ARC_COLOR;
    ctx.lineWidth = 2 / scale;
    ctx.lineCap = "round";
    const segments = 4;
    for (let s = 0; s < segments; s++) {
        // Deterministic pseudo-random direction from tick + segment so
        // the crackle animates without a real RNG (replay-safe).
        const seed = Math.sin((tick * 0.31 + s * 1.7)) * 43758.5453;
        const rand = seed - Math.floor(seed); // 0..1
        const baseAngle = (s / segments) * Math.PI * 2 + rand * 0.8;
        const len = 22 + rand * 16;
        const midAngle = baseAngle + (rand - 0.5) * 0.9;
        const mx = x + Math.cos(baseAngle) * len * 0.5 + Math.cos(midAngle) * 6;
        const my = y + Math.sin(baseAngle) * len * 0.5 + Math.sin(midAngle) * 6;
        const ex = x + Math.cos(baseAngle) * len;
        const ey = y + Math.sin(baseAngle) * len;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(mx, my); // jagged midpoint kink.
        ctx.lineTo(ex, ey);
        ctx.stroke();
    }
    ctx.restore();
}

// CHARGE_SHOT charge-up indicator — an expanding teal ring around the
// local ship that grows with charge progress. Alpha pulses faster as
// the charge approaches CHARGE_MAX_TICKS for a "ready to fire" read.
// The local ship's Vec idx is not exposed, so we take the max charge
// across all ship indices and render it at the local ship origin. In
// practice only the local player charges in their own view, so this
// resolves to the local ship's charge.
function drawChargeIndicator(ctx, world, x, y, tick, scale) {
    const remoteCount = typeof world.remote_ship_count === "function"
        ? world.remote_ship_count()
        : 0;
    const totalShips = (typeof world.ship_count === "function")
        ? world.ship_count()
        : remoteCount + 1;
    let progress = 0;
    for (let idx = 0; idx < totalShips; idx++) {
        const p = world.ship_charge_progress(idx);
        if (p > progress) progress = p;
    }
    if (progress <= 0) return;
    const frac = Math.max(0, Math.min(1, progress / CHARGE_MAX_TICKS));
    const outer = 14 + 30 * frac;
    // Pulse speed ramps up with charge; alpha oscillates 0.35..0.85.
    const pulse = 0.5 + 0.5 * Math.sin(tick * (0.15 + 0.45 * frac));
    const alpha = 0.35 + 0.5 * pulse;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = CHARGE_RING_COLOR;
    ctx.lineWidth = (1.5 + 1.5 * frac) / scale;
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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
