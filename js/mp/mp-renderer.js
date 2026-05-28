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
import { FIELD_WIDTH, FIELD_HEIGHT } from '../sim/constants.js';
// Reuse the EXACT single-player HUD glyphs + XP curve (shared SP modules) so the
// MP HUD matches single-player rather than re-deriving them.
import { drawCachedMoneyIcon, drawCachedHeartIcon } from '../modules/core/utils.js';
import { xpForLevel, MAX_LEVEL } from '../modules/core/sp-stats.js';

// Legacy toy-sim enemy key → SP shape registry type. The real SP sim already
// sends SP type strings (HUNTER/WASP/GUARDIAN/…), which drawEnemyShapeByType
// renders directly; only the toy sim's generic 'chaser' needs remapping.
const SP_ENEMY_SHAPE = { chaser: 'HUNTER' };

// ── Nebula backdrop ────────────────────────────────────────────────────────
// SP's visible nebula is a WebGL layer; the shared Canvas2D nebulaRenderer is a
// disabled no-op now. So MP bakes its own soft cloud field once into an
// offscreen canvas (a few large additive radial blobs in a cool space palette)
// and draws it with a gentle parallax behind the stars — "nebulae" without the
// WebGL port. Regenerated only when the viewport size changes.
let _nebCanvas = null, _nebW = 0, _nebH = 0;
const NEB_MARGIN = 240; // so the parallax slide never reveals a hard edge
const NEB_COLORS = [
  [80, 60, 180], [40, 90, 175], [120, 40, 160],
  [30, 120, 150], [90, 50, 140], [50, 70, 200],
];
function ensureNebula(w, h) {
  if (_nebCanvas && _nebW === w && _nebH === h) return _nebCanvas;
  const W = w + NEB_MARGIN, H = h + NEB_MARGIN;
  const c = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(W, H) : document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rng = makeRng(0x9e3b);
  g.globalCompositeOperation = 'lighter';
  const blobs = 11 + Math.floor(rng() * 7);
  for (let i = 0; i < blobs; i++) {
    const bx = rng() * W, by = rng() * H;
    const rad = 200 + rng() * 380;
    const col = NEB_COLORS[Math.floor(rng() * NEB_COLORS.length)];
    const a = 0.05 + rng() * 0.07;
    const grd = g.createRadialGradient(bx, by, 0, bx, by, rad);
    grd.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
    grd.addColorStop(0.45, `rgba(${col[0]},${col[1]},${col[2]},${a * 0.4})`);
    grd.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(bx, by, rad, 0, Math.PI * 2);
    g.fill();
  }
  _nebCanvas = c; _nebW = w; _nebH = h;
  return c;
}

// ── Parallax starfield ───────────────────────────────────────────────────────
// SP's backdrop is a dense parallax star field. MP scatters stars across the
// arena (plus a margin so parallax never empties the screen edges) in three
// depth layers; each layer slides at `depth × camera`, so deep stars barely move
// and near stars track the world — the classic scrolling-space look. Star colour
// mix matches SP (~55% blue-white, 25% white, 12% warm, 8% orange-red).
const STAR_DEPTHS = [0.25, 0.5, 0.85];
const STAR_PAD = 360; // world margin beyond the field on every side
let _starLayers = null;
function ensureStarLayers() {
  if (_starLayers) return _starLayers;
  const rng = makeRng(0x5747); // fixed seed → stable field
  const spanW = FIELD_WIDTH + STAR_PAD * 2;
  const spanH = FIELD_HEIGHT + STAR_PAD * 2;
  _starLayers = STAR_DEPTHS.map((depth) => {
    const n = Math.round((spanW * spanH) / 10000); // denser field (~240 per layer)
    const stars = [];
    for (let i = 0; i < n; i++) {
      const r = rng();
      // ~9% are brighter colourful "accent" stars (saturated blue/violet/teal),
      // sprinkled through the field like SP's colour-stars — they get a soft glow.
      const accent = rng() < 0.09;
      let color;
      if (accent) color = `hsl(${[200, 270, 175, 320][Math.floor(rng() * 4)] + rng() * 24}, 90%, 72%)`;
      else if (r < 0.55) color = `hsl(${208 + rng() * 22}, 65%, ${78 + rng() * 18}%)`; // blue-white
      else if (r < 0.80) color = `hsl(0, 0%, ${82 + rng() * 16}%)`;                     // white
      else if (r < 0.92) color = `hsl(${38 + rng() * 16}, 70%, 76%)`;                   // warm
      else color = `hsl(${12 + rng() * 16}, 82%, 66%)`;                                 // orange-red
      stars.push({
        x: -STAR_PAD + rng() * spanW,
        y: -STAR_PAD + rng() * spanH,
        size: (0.4 + rng() * 1.3) * (0.6 + depth * 0.7) * (accent ? 1.6 : 1), // near + accent = bigger
        color,
        accent,
        twPhase: rng() * Math.PI * 2,
        twSpeed: 0.4 + rng() * 1.6,
        base: 0.4 + rng() * 0.35 + depth * 0.1 + (accent ? 0.15 : 0),
      });
    }
    return { depth, stars };
  });
  return _starLayers;
}
function drawBackdrop(ctx, w, h, cam, now) {
  // Nebula first (cool clouds), then the parallax stars over it.
  const neb = ensureNebula(w, h);
  ctx.drawImage(neb, -NEB_MARGIN / 2 - cam.x * 0.06, -NEB_MARGIN / 2 - cam.y * 0.06);

  const t = (now || 0) / 1000;
  for (const layer of ensureStarLayers()) {
    const ox = cam.x * layer.depth;
    const oy = cam.y * layer.depth;
    for (const s of layer.stars) {
      const sx = s.x - ox;
      const sy = s.y - oy;
      if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * s.twSpeed + s.twPhase);
      const alpha = Math.max(0.12, s.base * (0.6 + 0.4 * tw));
      // Accent stars get a soft additive glow halo so the field reads richer.
      if (s.accent) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.5;
        const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.size * 4);
        gl.addColorStop(0, s.color);
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(sx, sy, s.size * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

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

function drawEnemy(ctx, e, now, hit = 0) {
  // SP enemy silhouette (shared render/shapes.js). Enemy shapes draw at the
  // origin, so pre-translate + rotate to the enemy's facing; `now` drives idle
  // animation. Real-sim types pass straight through to the SP shape registry;
  // the legacy toy key is remapped; anything unknown falls back to HUNTER.
  const type = SP_ENEMY_SHAPE[e.type] || e.type || 'HUNTER';
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  // Hit flash: a quick additive white bloom over the silhouette when struck.
  if (hit > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 1.1);
    g.addColorStop(0, `rgba(255,255,255,${0.75 * hit})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // A boss gets a menacing crimson aura behind its (already-inflated) silhouette.
  if (e.boss) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, e.r * 0.4, 0, 0, e.r * 1.5);
    g.addColorStop(0, 'rgba(255,60,80,0.30)');
    g.addColorStop(1, 'rgba(255,60,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawEnemyShapeByType(ctx, type, { radius: e.r, now: now || 0 });
  ctx.restore();

  // Modular-boss parts: the orbiting bolt-heads that shield the core. Drawn as
  // glowing cyan nodes (with a damage ring) so the player can see + target them.
  if (e.parts && e.parts.length) {
    for (const p of e.parts) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.7);
      g.addColorStop(0, 'rgba(120,200,255,0.45)');
      g.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = 'rgba(30,46,72,0.92)';
      ctx.strokeStyle = '#7ec8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (p.mhp && p.hp < p.mhp) {
        ctx.strokeStyle = '#9ece6a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 3, -Math.PI / 2, -Math.PI / 2 + (p.hp / p.mhp) * Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  if (e.boss) {
    // Boss health bar — wide, always-on, with a label (SP shows a top banner;
    // this above-boss bar reads clearly in the shared arena).
    const w = Math.max(80, e.r * 2.2);
    const bx = e.x - w / 2;
    const by = e.y - e.r - 16;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, w + 2, 7);
    ctx.fillStyle = '#ff3b5c';
    ctx.fillRect(bx, by, w * Math.max(0, e.hp / e.mhp), 5);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`◆ BOSS ${e.type} ◆`, e.x, by - 4);
  } else if (e.hp < e.mhp) {
    // HP pip bar when damaged.
    const w = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
    ctx.fillStyle = '#9ece6a';
    ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * (e.hp / e.mhp), 4);
  }
}

function drawDrop(ctx, d, now) {
  const t = (now || 0) / 1000;
  if (d.kind === 'health') {
    // Pulsing green glass orb with a white "+" — SP health pickup.
    const pulse = 0.85 + 0.15 * Math.sin(t * 4 + d.x * 0.05);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 13 * pulse);
    gl.addColorStop(0, 'rgba(120,255,160,0.55)');
    gl.addColorStop(1, 'rgba(80,220,120,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(d.x, d.y, 13 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const core = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 6);
    core.addColorStop(0, 'rgba(235,255,240,0.95)');
    core.addColorStop(1, 'rgba(80,210,120,0.9)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(d.x - 4, d.y - 1.2, 8, 2.4);
    ctx.fillRect(d.x - 1.2, d.y - 4, 2.4, 8);
  } else { // gold — spinning gem with an additive glow
    const spin = t * 1.8 + d.x * 0.05;
    const pulse = 0.85 + 0.15 * Math.sin(t * 5 + d.y * 0.05);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 12 * pulse);
    gl.addColorStop(0, 'rgba(255,220,90,0.55)');
    gl.addColorStop(1, 'rgba(255,180,40,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(d.x, d.y, 12 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(spin);
    const g = ctx.createLinearGradient(0, -7, 0, 7);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#b8860b');
    ctx.fillStyle = g; ctx.strokeStyle = '#fff7cc'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

// Hex → {r,g,b}, cached (parses the SP bullet/weapon colour strings).
const _HEX_RGB_CACHE = {};
function _energyRgb(hex) {
  if (_HEX_RGB_CACHE[hex]) return _HEX_RGB_CACHE[hex];
  let h = (hex || '#00ccff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const rgb = {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
  _HEX_RGB_CACHE[hex] = rgb;
  return rgb;
}

// Bullet glow palettes when the wire carries no per-bullet colour.
const FALLBACK_PLAYER_BULLET = { r: 150, g: 220, b: 255 }; // cyan-white plasma
const FALLBACK_ENEMY_BULLET = { r: 255, g: 70, b: 70 };    // menacing red

// Shared additive bullet renderer (player + enemy). Each bullet: a tapered trail
// opposite its travel direction + a colored halo + a white-hot core.
function drawBulletList(ctx, list, fallback) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of list) {
    const col = b.color ? _energyRgb(b.color) : fallback;
    const len = Math.min(34, Math.hypot(b.dx || 0, b.dy || 0) * 1.8);
    if (len > 2) {
      const m = Math.hypot(b.dx, b.dy) || 1;
      const tx = b.x - (b.dx / m) * len, ty = b.y - (b.dy / m) * len;
      const tg = ctx.createLinearGradient(b.x, b.y, tx, ty);
      tg.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0.55)`);
      tg.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
      ctx.strokeStyle = tg;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    const R = 8;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
    g.addColorStop(0, `rgba(${col.r},${col.g},${col.b},0.9)`);
    g.addColorStop(0.4, `rgba(${col.r},${col.g},${col.b},0.4)`);
    g.addColorStop(1, `rgba(${col.r},${col.g},${col.b},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function render(ctx, canvas, { localShip, remoteShips, asteroids, enemies, drops, bullets, ebullets, effects, particles, debris, now, localId, localDowned, localReviveProgress, localHp, localMaxHp, localEnergy, localMaxEnergy, localLevel, localXp, localTanks, wave, gold, players, banner, camera, fx, worldFloaters, levelText, bossCard, enemyHitFlash }) {
  const cam = camera || { x: 0, y: 0, zoom: 1 };
  const feel = fx || { shakeX: 0, shakeY: 0, flashWhite: 0, flashRed: 0 };
  const W = canvas.width, H = canvas.height;

  // Background fill (screen space).
  ctx.fillStyle = '#04040a';
  ctx.fillRect(0, 0, W, H);

  // Parallax nebula + starfield (screen space, slides with the camera).
  try { drawBackdrop(ctx, W, H, cam, now); } catch { /* backdrop is non-essential — never break the frame */ }

  // ── World layer: everything below draws in arena/world coordinates through
  //    the camera transform (zoom-around-canvas-center, then camera translate),
  //    exactly like SP's draw() so the local player sits at the screen center. ──
  ctx.save();
  const zoom = cam.zoom || 1;
  if (zoom !== 1) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);
  }
  ctx.translate(-cam.x - (feel.shakeX || 0), -cam.y - (feel.shakeY || 0));

  // Arena border (true field bounds in world space).
  ctx.strokeStyle = '#1d2440';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, FIELD_WIDTH - 4, FIELD_HEIGHT - 4);

  // Asteroids (interpolated) — SP tumbling-wireframe style.
  if (asteroids) {
    for (const [, ast] of asteroids) drawAsteroid(ctx, ast, now);
    // Evict cosmetics for despawned asteroids.
    if (_astCosmetics.size > asteroids.size) {
      for (const id of _astCosmetics.keys()) if (!asteroids.has(id)) _astCosmetics.delete(id);
    }
  }

  // Enemies (interpolated). A recent hit tints the enemy white briefly.
  if (enemies) {
    for (const [id, e] of enemies) {
      const exp = enemyHitFlash && enemyHitFlash.get(id);
      const hit = exp && exp > (now || 0) ? Math.min(1, (exp - now) / 100) : 0;
      drawEnemy(ctx, e, now, hit);
    }
  }

  // Drops (interpolated).
  if (drops) {
    for (const [, d] of drops) drawDrop(ctx, d, now);
  }

  // Bullets — interpolated, with a tapered motion trail + clean colored glow.
  // Player shots tint by SP weapon colour (cyan fallback); enemy shots render in
  // a menacing red so incoming fire reads clearly. A white-hot core keeps every
  // shot crisp, like single-player.
  if (bullets && bullets.length) drawBulletList(ctx, bullets, FALLBACK_PLAYER_BULLET);
  if (ebullets && ebullets.length) drawBulletList(ctx, ebullets, FALLBACK_ENEMY_BULLET);

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

  // Line debris (rotating hue-cycling shards — SP shatter), behind the embers.
  if (debris && debris.length && now != null) {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const d of debris) {
      const a = Math.max(0, 1 - (now - d.born) / d.life);
      ctx.globalAlpha = a;
      ctx.strokeStyle = `hsl(${d.hue | 0}, 100%, 60%)`;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.beginPath();
      ctx.moveTo(-d.half, 0);
      ctx.lineTo(d.half, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Explosion particles (client-authored shrapnel + embers, additive — SP look).
  if (particles && particles.length && now != null) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pt of particles) {
      const a = Math.max(0, 1 - (now - pt.born) / pt.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = `hsl(${pt.hue}, 95%, ${58 + a * 22}%)`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Remote ships (interpolated).
  for (const [id, s] of remoteShips) {
    drawShip(ctx, s.x, s.y, s.angle, `P${id}`, false, s.downed, s.reviveProgress);
  }

  // Local ship (predicted).
  if (localShip) {
    drawShip(ctx, localShip.x, localShip.y, localShip.angle, `P${localId} (you)`, true, localDowned, localReviveProgress);
  }

  // Floating feedback (damage numbers / gold popups) — world space so they track
  // the hit point; drawn last in the world layer so they sit on top.
  if (worldFloaters && worldFloaters.length && now != null) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const fl of worldFloaters) {
      const a = Math.max(0, 1 - (now - fl.born) / fl.life);
      ctx.globalAlpha = a;
      ctx.font = `bold ${fl.size}px ${HUD_FONT}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(fl.text, fl.x, fl.y);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, fl.y);
    }
    ctx.globalAlpha = 1;
  }

  // ── End world layer — HUD + banner draw in screen space. ──
  ctx.restore();

  // Center banner (wave/game-over announcements).
  if (banner && now != null) {
    const age = (now - banner.born) / 2500;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age * age);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(banner.text, W / 2, H * 0.28);
    ctx.restore();
  }

  drawHud(ctx, canvas, {
    localHp, localMaxHp, localEnergy, localMaxEnergy, localLevel, localXp,
    localTanks, wave, gold, players, localDowned, now,
  });

  // Full-screen flash channels (screen space, on top of the HUD).
  if (feel.flashWhite > 0.01) {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, feel.flashWhite)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (feel.flashRed > 0.01) {
    // Damage vignette — red glow hugging the screen edges, transparent center.
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(255,40,40,0)');
    g.addColorStop(1, `rgba(220,20,30,${Math.min(0.6, feel.flashRed)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // LEVEL UP! announce (screen space, upper third) — fades in then out.
  if (levelText && now != null) {
    const p = (now - levelText.born) / 1800; // 0 → 1
    if (p < 1) {
      const a = p < 0.2 ? p / 0.2 : (p > 0.7 ? (1 - p) / 0.3 : 1);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `28px ${HUD_FONT}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText('LEVEL UP!', W / 2, H * 0.34);
      ctx.fillStyle = '#ffe066';
      ctx.fillText('LEVEL UP!', W / 2, H * 0.34);
      ctx.font = `14px ${HUD_FONT}`;
      ctx.fillStyle = 'rgba(255,245,200,0.95)';
      ctx.fillText(levelText.text, W / 2, H * 0.34 + 30);
      ctx.restore();
    }
  }

  // Boss name-card (screen space, upper-mid) — a dramatic WARNING + boss type
  // that fades in, holds, then fades out when a boss first appears.
  if (bossCard && now != null) {
    const p = (now - bossCard.born) / 2800; // 0 → 1
    if (p < 1) {
      const a = p < 0.15 ? p / 0.15 : (p > 0.75 ? (1 - p) / 0.25 : 1);
      const cy = H * 0.22;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Red banner strip behind the text.
      const stripH = 56;
      ctx.fillStyle = 'rgba(40,0,6,0.55)';
      ctx.fillRect(0, cy - stripH / 2, W, stripH);
      ctx.fillStyle = 'rgba(255,40,60,0.7)';
      ctx.fillRect(0, cy - stripH / 2, W, 2);
      ctx.fillRect(0, cy + stripH / 2 - 2, W, 2);
      // WARNING.
      ctx.font = `13px ${HUD_FONT}`;
      ctx.fillStyle = 'rgba(255,120,130,0.95)';
      ctx.fillText('⚠  W A R N I N G  ⚠', W / 2, cy - 14);
      // Boss type name.
      ctx.font = `24px ${HUD_FONT}`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(String(bossCard.name), W / 2, cy + 12);
      ctx.fillStyle = '#ff5c6c';
      ctx.fillText(String(bossCard.name), W / 2, cy + 12);
      ctx.restore();
    }
  }
}

// ── SP-style HUD (ported from js/modules/hud/status.js) ──────────────────────
// Top-left vitals cluster: [triforce spare-tanks] [health sphere] [energy
// sphere] + Rainshards. A thin segmented gold XP bar runs across the very
// bottom, and wave/pilots sit top-right. All in screen space.
const HUD_FONT = "'Press Start 2P', monospace";

// Eased health display (SP drains slightly slower than it gains so a hit reads
// as a chunk leaving the orb).
let _hudDisplayedHp = null;

function drawHealthSphere(ctx, cx, cy, r, hp, maxHp, now) {
  const maxH = Math.max(1, maxHp || 100);
  if (_hudDisplayedHp == null) _hudDisplayedHp = hp;
  const delta = hp - _hudDisplayedHp;
  _hudDisplayedHp += delta * (delta < 0 ? 0.16 : 0.30);
  if (Math.abs(hp - _hudDisplayedHp) < 0.5) _hudDisplayedHp = hp;
  const frac = Math.max(0, Math.min(1, _hudDisplayedHp / maxH));
  const low = frac <= 0.3;

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(24, 8, 10, 0.78)'; ctx.fill();
  if (frac > 0) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2); ctx.clip();
    const coreR = Math.max(1, r * frac);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    const solidStop = Math.min(0.97, 0.5 + 0.47 * frac);
    grad.addColorStop(0, `rgba(255, 215, 210, ${0.85 * frac + 0.15})`);
    grad.addColorStop(solidStop, `rgba(${low ? 255 : 235}, ${low ? 45 : 66}, ${low ? 45 : 64}, 0.85)`);
    grad.addColorStop(1, 'rgba(200, 30, 40, 0)');
    ctx.fillStyle = grad; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 200, 200, 0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.34, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.fill();
  if (low) {
    const pulse = 0.4 + 0.35 * Math.abs(Math.sin(now * 0.012));
    ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(255, 70, 70, ${pulse})`;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2); ctx.stroke();
  }
  // Heart icon + "{hp}/{max}" beneath the orb, centered as a group (SP style).
  const txt = `${Math.round(hp)}/${Math.round(maxH)}`;
  ctx.font = `9px ${HUD_FONT}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const heartSize = 14, gap = 4;
  const textW = ctx.measureText(txt).width;
  const groupLeft = cx - (heartSize + gap + textW) / 2;
  const labelY = cy + r + 10;
  drawCachedHeartIcon(ctx, groupLeft + heartSize / 2, labelY, heartSize, '#800000', '#DC143C');
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.fillStyle = low ? '#ff8a8a' : 'rgba(255, 212, 212, 0.95)';
  ctx.strokeText(txt, groupLeft + heartSize + gap, labelY);
  ctx.fillText(txt, groupLeft + heartSize + gap, labelY);
  ctx.restore();
}

function drawEnergySphere(ctx, cx, cy, r, energy, maxEnergy, now) {
  const maxE = maxEnergy || 100;
  const frac = Math.max(0, Math.min(1, (energy || 0) / maxE));
  const cr = 0, cg = 204, cb = 255; // cyan — SP default primary tint
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 12, 22, 0.78)'; ctx.fill();
  if (frac > 0) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2); ctx.clip();
    const coreR = Math.max(1, r * frac);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    const solidStop = Math.min(0.97, 0.5 + 0.47 * frac);
    grad.addColorStop(0, `rgba(255,255,255,${0.85 * frac + 0.15})`);
    grad.addColorStop(solidStop, `rgba(${cr},${cg},${cb},0.8)`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = grad; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Laser-diffraction streaks through the gas (additive).
    ctx.globalCompositeOperation = 'lighter';
    const t = now * 0.001;
    for (let i = 0; i < 5; i++) {
      const a = t * 0.6 + i * (Math.PI / 5);
      const alpha = (0.10 + 0.07 * Math.sin(t * 2 + i)) * frac;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * coreR, cy + Math.sin(a) * coreR);
      ctx.lineTo(cx - Math.cos(a) * coreR, cy - Math.sin(a) * coreR);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(200, 230, 255, 0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.34, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.fill();
  const ready = (energy || 0) >= 30; // SP default power cost
  if (ready) {
    const pulse = 0.4 + 0.3 * Math.sin(now * 0.012);
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255, 240, 160, ${pulse})`;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2); ctx.stroke();
  }
  const txt = `${Math.floor(energy || 0)}/${Math.round(maxE)}`;
  ctx.font = `9px ${HUD_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.fillStyle = ready ? '#FFE0A0' : 'rgba(210, 232, 255, 0.92)';
  ctx.strokeText(txt, cx, cy + r + 5); ctx.fillText(txt, cx, cy + r + 5);
  ctx.restore();
}

// Triforce of spare health tanks — ported from SP drawCanvasTriforce: solid gold
// triangles for owned tanks only (none shown when 0, exactly like single-player).
// Geometry mirrors SP triforceLayout (TRIANGLE_SIZE 12, SPACING 2).
function drawTriforce(ctx, leftX, cy, tanks) {
  const SIZE = 12, SPACING = 2;
  const halfHalf = SIZE / 2 + SPACING / 2;
  const centerX = leftX + halfHalf + SIZE / 2;
  const topY = cy - (SIZE + SPACING - 1) / 2;
  const bottomY = topY + SIZE + SPACING - 1;
  const tri = (tx, ty) => {
    const h = SIZE * 0.866;
    ctx.beginPath();
    ctx.moveTo(tx, ty - h / 2);
    ctx.lineTo(tx - SIZE / 2, ty + h / 2);
    ctx.lineTo(tx + SIZE / 2, ty + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  ctx.save();
  ctx.fillStyle = '#FFD700';
  ctx.strokeStyle = '#B8860B';
  ctx.lineWidth = 1;
  // SP render order: btm-left → btm-right → top (loss order is top first).
  if (tanks >= 1) tri(centerX - halfHalf, bottomY);
  if (tanks >= 2) tri(centerX + halfHalf, bottomY);
  if (tanks >= 3) tri(centerX, topY);
  ctx.restore();
}

function drawXpBar(ctx, W, H, level, xp) {
  const barH = 6;
  const y = H - barH;
  const frac = level >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (xp || 0) / (xpForLevel(level) || 1)));
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, y, W, barH);
  if (frac > 0) {
    const fillW = Math.max(1, W * frac);
    const g = ctx.createLinearGradient(0, y, fillW, y);
    g.addColorStop(0.0, '#fffbe6'); g.addColorStop(0.5, '#daa520'); g.addColorStop(1.0, '#8a6508');
    ctx.fillStyle = g; ctx.fillRect(0, y, fillW, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, y, fillW, 1);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 40; x < W; x += 40) ctx.fillRect(x, y, 1, barH);
  ctx.fillStyle = 'rgba(218,165,32,0.65)'; ctx.fillRect(0, y - 1, W, 1);
  ctx.restore();
}

// Bottom-right Rainshards readout (SP drawBottomRightGold style): a coin icon +
// an eased slot-rolling counter. Per-pickup "+N" popups are world-space floaters
// (mp-main → worldFloaters), matching SP's two-channel design.
let _goldDisplay = null;
function drawGoldBottomRight(ctx, W, H, gold) {
  const real = gold | 0;
  if (_goldDisplay == null) _goldDisplay = real;
  const diff = real - _goldDisplay;
  if (Math.abs(diff) < 0.5) _goldDisplay = real;
  else _goldDisplay += diff * 0.18 + Math.sign(diff) * Math.min(2, Math.abs(diff));
  const shown = Math.floor(_goldDisplay);
  const margin = 18;
  const y = H - 30;
  const x = W - margin;
  ctx.save();
  ctx.font = `16px ${HUD_FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.fillStyle = '#FFD700';
  const txt = `${shown}`;
  ctx.strokeText(txt, x, y);
  ctx.fillText(txt, x, y);
  const tw = ctx.measureText(txt).width;
  drawCachedMoneyIcon(ctx, x - tw - 16, y, 24, '#FFD700', '#B8860B');
  ctx.restore();
}

function drawHud(ctx, canvas, s) {
  const W = canvas.width, H = canvas.height;
  const now = s.now || 0;
  ctx.save();

  // Top-left vitals cluster — SP layout + spacing: [triforce] [health sphere]
  // [energy sphere] on a shared midline (no LEVEL/POWER/gold here; gold is
  // bottom-right). Mirrors SP's triforceLeftX=36 / healthCX=90 / energyCX=172.
  const cy = 35;
  const R = 20;
  drawTriforce(ctx, 36, cy, s.localTanks | 0);
  const healthCX = 90;
  if (s.localHp != null) drawHealthSphere(ctx, healthCX, cy, R, s.localHp, s.localMaxHp, now);
  const energyCX = 172;
  drawEnergySphere(ctx, energyCX, cy, R, s.localEnergy, s.localMaxEnergy, now);

  // Top-right: co-op pilot count only (the WAVE readout was removed — SP shows
  // the wave via the center banner on wave start).
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `9px ${HUD_FONT}`;
  ctx.fillStyle = 'rgba(180,200,230,0.7)';
  ctx.fillText(`PILOTS ${s.players || 1}`, W - 16, 24);

  // Bottom-right Rainshards (gold), SP style.
  drawGoldBottomRight(ctx, W, H, s.gold | 0);

  // Downed prompt (center-bottom, above the XP bar).
  if (s.localDowned) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `12px ${HUD_FONT}`;
    ctx.fillStyle = 'rgba(255,180,180,0.95)';
    ctx.fillText('DOWNED — hold on', W / 2, H - 40);
  }

  // Bottom XP bar (full width).
  drawXpBar(ctx, W, H, s.localLevel | 0, s.localXp | 0);

  ctx.restore();
}
