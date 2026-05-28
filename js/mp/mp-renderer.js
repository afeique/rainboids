// js/mp/mp-renderer.js — Canvas2D renderer for the MP client.
//
// Path A / Group G (look-like-SP): ships and enemies render through the shared
// single-player shape helpers (js/modules/render/shapes.js), so they look
// exactly like single-player. Asteroids (which need a per-id 3D vertex cache +
// SP hue params) and the WebGL particle/bullet/starfield layers are subsequent
// Group-G steps; everything else here is interpolated authoritative state.

import { SHIP_RADIUS, REVIVE_TICKS } from '../sim/constants.js';
import {
  drawShipShape, drawEnemyShapeByType, SHIP_PALETTE_MAGENTA,
  generateAsteroidVertices, projectAsteroidVertices, drawAsteroidShape,
  ASTEROID_EDGES, ASTEROID_FOV,
} from '../modules/render/shapes.js';
import { makeRng } from '../sim/rng.js';
import { nebulaRenderer } from '../modules/performance/nebula-renderer.js';

// Legacy toy-sim enemy key → SP shape registry type. The real SP sim already
// sends SP type strings (HUNTER/WASP/GUARDIAN/…), which drawEnemyShapeByType
// renders directly; only the toy sim's generic 'chaser' needs remapping.
const SP_ENEMY_SHAPE = { chaser: 'HUNTER' };

// SP nebula background (shared Canvas2D renderer, self-contained). Generated
// once for the arena, then drawn stationary behind everything each frame.
let _nebulaReady = false;

// Per-asteroid cosmetic cache (keyed by entity id, which is monotonic so never
// reused). Each rock gets stable seeded 3D vertices + hue params so it looks
// like its single-player counterpart; the snapshot only carries one `angle`, so
// we fabricate a 3-axis tumble from it + per-id phase offsets.
const _astCosmetics = new Map();
function asteroidCosmetics(ast) {
  let c = _astCosmetics.get(ast.id);
  if (!c) {
    const rng = makeRng(ast.id >>> 0 || 1);
    c = {
      verts: generateAsteroidVertices(rng, ast.r),
      projected: null, // reused projection buffer
      baseHue: rng() * 360,
      hueSpread: 30 + rng() * 70,
      hueCycleSpeed: 10 + rng() * 20,
      saturation: 80 + rng() * 15,
      lightness: 65 + rng() * 15,
      phase: { x: rng() * 6.283, y: rng() * 6.283, z: rng() * 6.283 },
    };
    _astCosmetics.set(ast.id, c);
  }
  return c;
}

function drawShip(ctx, x, y, angle, label, isLocal, downed = false, reviveProgress = 0) {
  const r = SHIP_RADIUS;
  // SP ship hull (shared render/shapes.js) — drawShipShape owns its own
  // translate/rotate. Downed ships dim via inherited globalAlpha.
  ctx.save();
  ctx.globalAlpha = downed ? 0.35 : 1;
  drawShipShape(ctx, x, y, angle, { radius: r, palette: SHIP_PALETTE_MAGENTA });
  ctx.restore();

  // Local-ship highlight ring for co-op readability (per-player tint is a
  // follow-up; SP ships are all magenta).
  if (isLocal && !downed) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Revive progress ring around a downed ship.
  if (downed) {
    const frac = Math.max(0, Math.min(1, reviveProgress / REVIVE_TICKS));
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r + 8, 0, Math.PI * 2);
    ctx.stroke();
    if (frac > 0) {
      ctx.strokeStyle = '#9ece6a';
      ctx.beginPath();
      ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (label != null) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(downed ? `${label} ↯DOWN` : label, x, y - r - 8);
    ctx.restore();
  }
}

function drawAsteroid(ctx, ast, now) {
  // SP tumbling-wireframe asteroid (shared render/shapes.js). Project the
  // seeded 3D verts under a tumble derived from the snapshot angle, then draw
  // at the asteroid's center (drawAsteroidShape works in entity-local coords).
  const c = asteroidCosmetics(ast);
  const a = ast.angle;
  const rot3D = { x: a + c.phase.x, y: a * 1.3 + c.phase.y, z: a * 0.7 + c.phase.z };
  c.projected = projectAsteroidVertices(c.verts, rot3D, ASTEROID_FOV, c.projected);
  ctx.save();
  ctx.translate(ast.x, ast.y);
  drawAsteroidShape(ctx, {
    projectedVertices: c.projected,
    edges: ASTEROID_EDGES,
    fov: ASTEROID_FOV,
    radius: ast.r,
    baseHue: c.baseHue,
    hueCycleSpeed: c.hueCycleSpeed,
    hueSpread: c.hueSpread,
    saturation: c.saturation,
    lightness: c.lightness,
    now: now || 0,
  });
  ctx.restore();
}

function drawEnemy(ctx, e, now) {
  // SP enemy silhouette (shared render/shapes.js). Enemy shapes draw at the
  // origin, so pre-translate + rotate to the enemy's facing; `now` drives idle
  // animation. Real-sim types pass straight through to the SP shape registry;
  // the legacy toy key is remapped; anything unknown falls back to HUNTER.
  const type = SP_ENEMY_SHAPE[e.type] || e.type || 'HUNTER';
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  drawEnemyShapeByType(ctx, type, { radius: e.r, now: now || 0 });
  ctx.restore();

  // HP pip bar when damaged.
  if (e.hp < e.mhp) {
    const w = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
    ctx.fillStyle = '#9ece6a';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * (e.hp / e.mhp), 4);
  }
}

function drawDrop(ctx, d) {
  if (d.kind === 'health') {
    ctx.fillStyle = '#73e08a';
    ctx.fillRect(d.x - 7, d.y - 2, 14, 4);
    ctx.fillRect(d.x - 2, d.y - 7, 4, 14);
  } else { // gold
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }
}

export function render(ctx, canvas, { localShip, remoteShips, asteroids, enemies, drops, bullets, effects, now, localId, localDowned, localReviveProgress, banner }) {
  // Background.
  ctx.fillStyle = '#070710';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // SP nebula background (shared renderer; generated once for the arena).
  try {
    if (!_nebulaReady) { nebulaRenderer.generate(canvas.width, canvas.height); _nebulaReady = true; }
    nebulaRenderer.draw(ctx, 0, 0, 0, 0, 0, canvas.width, canvas.height);
  } catch { /* background is non-essential — never break the frame */ }

  // Arena border.
  ctx.strokeStyle = '#1d2440';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  // Asteroids (interpolated) — SP tumbling-wireframe style.
  if (asteroids) {
    for (const [, ast] of asteroids) drawAsteroid(ctx, ast, now);
    // Evict cosmetics for despawned asteroids.
    if (_astCosmetics.size > asteroids.size) {
      for (const id of _astCosmetics.keys()) if (!asteroids.has(id)) _astCosmetics.delete(id);
    }
  }

  // Enemies (interpolated).
  if (enemies) {
    for (const [, e] of enemies) drawEnemy(ctx, e, now);
  }

  // Drops (interpolated).
  if (drops) {
    for (const [, d] of drops) drawDrop(ctx, d);
  }

  // Bullets — additive glow (bright core + warm halo), SP-style.
  if (bullets && bullets.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bullets) {
      const R = 9;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
      g.addColorStop(0, 'rgba(255,240,170,0.95)');
      g.addColorStop(0.35, 'rgba(255,200,90,0.55)');
      g.addColorStop(1, 'rgba(255,160,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Destruction effects (event-driven juice): expanding ring + an early
  // additive flash so deaths read like SP explosions.
  if (effects && now != null) {
    for (const e of effects) {
      const age = (now - e.born) / 500; // 0 → 1 over lifetime
      // Additive flash for the first ~40% of life.
      if (age < 0.4) {
        const fa = 1 - age / 0.4;
        const fr = e.r * 0.9;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, fr);
        g.addColorStop(0, `rgba(255,230,160,${0.9 * fa})`);
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, fr, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      // Expanding ring.
      const rr = e.r * (1 + age * 1.6);
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.strokeStyle = '#ff9e64';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, e.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // Remote ships (interpolated).
  for (const [id, s] of remoteShips) {
    drawShip(ctx, s.x, s.y, s.angle, `P${id}`, false, s.downed, s.reviveProgress);
  }

  // Local ship (predicted).
  if (localShip) {
    drawShip(ctx, localShip.x, localShip.y, localShip.angle, `P${localId} (you)`, true, localDowned, localReviveProgress);
  }

  // Center banner (wave/game-over announcements).
  if (banner && now != null) {
    const age = (now - banner.born) / 2500;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age * age);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(banner.text, canvas.width / 2, canvas.height * 0.28);
    ctx.restore();
  }
}
