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

// Client-authored background starfield (SP's space backdrop is nebula + a dense
// parallax star field; the co-op arena is fixed, so a static twinkling field is
// the right analogue). Generated once, seeded, with SP's star-colour mix
// (~55% blue-white, 25% white, 12% warm, 8% orange-red).
let _stars = null;
function ensureStars(w, h) {
  if (_stars) return _stars;
  const rng = makeRng(0x5747); // fixed seed → stable field
  const n = Math.round((w * h) / 9000); // ~230 on a 1920×1080 arena
  _stars = [];
  for (let i = 0; i < n; i++) {
    const r = rng();
    let color;
    if (r < 0.55) color = `hsl(${208 + rng() * 22}, 65%, ${78 + rng() * 18}%)`;      // blue-white
    else if (r < 0.80) color = `hsl(0, 0%, ${82 + rng() * 16}%)`;                     // white
    else if (r < 0.92) color = `hsl(${38 + rng() * 16}, 70%, 76%)`;                   // warm
    else color = `hsl(${12 + rng() * 16}, 82%, 66%)`;                                 // orange-red
    _stars.push({
      x: rng() * w, y: rng() * h,
      size: 0.4 + rng() * 1.5,
      color,
      twPhase: rng() * Math.PI * 2,
      twSpeed: 0.4 + rng() * 1.6,
      base: 0.45 + rng() * 0.35,
    });
  }
  return _stars;
}
function drawStarfield(ctx, w, h, now) {
  const stars = ensureStars(w, h);
  const t = (now || 0) / 1000;
  for (const s of stars) {
    const tw = 0.5 + 0.5 * Math.sin(t * s.twSpeed + s.twPhase);
    ctx.globalAlpha = Math.max(0.12, s.base * (0.6 + 0.4 * tw));
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
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

function drawEnemy(ctx, e, now) {
  // SP enemy silhouette (shared render/shapes.js). Enemy shapes draw at the
  // origin, so pre-translate + rotate to the enemy's facing; `now` drives idle
  // animation. Real-sim types pass straight through to the SP shape registry;
  // the legacy toy key is remapped; anything unknown falls back to HUNTER.
  const type = SP_ENEMY_SHAPE[e.type] || e.type || 'HUNTER';
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
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

export function render(ctx, canvas, { localShip, remoteShips, asteroids, enemies, drops, bullets, effects, particles, now, localId, localDowned, localReviveProgress, localHp, localMaxHp, wave, gold, players, banner }) {
  // Background.
  ctx.fillStyle = '#070710';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // SP nebula background (shared renderer; generated once for the arena).
  try {
    if (!_nebulaReady) { nebulaRenderer.generate(canvas.width, canvas.height); _nebulaReady = true; }
    nebulaRenderer.draw(ctx, 0, 0, 0, 0, 0, canvas.width, canvas.height);
  } catch { /* background is non-essential — never break the frame */ }

  // Twinkling starfield over the nebula (crisp points of light, SP-style).
  try { drawStarfield(ctx, canvas.width, canvas.height, now); } catch { /* non-essential */ }

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

  drawHud(ctx, canvas, { localHp, localMaxHp, wave, gold, players, localDowned });
}

// On-canvas HUD: local health bar + wave/gold readout (SP-style, on the
// authoritative state). The minimal DOM line in mp-main stays for redundancy.
function drawHud(ctx, canvas, { localHp, localMaxHp, wave, gold, players, localDowned }) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Top-left: wave / players / gold.
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`WAVE ${wave || 0}`, 16, 28);
  ctx.font = '13px monospace';
  ctx.fillStyle = 'rgba(180,200,230,0.8)';
  ctx.fillText(`PILOTS ${players || 1}`, 16, 46);
  ctx.fillStyle = 'rgba(255,210,63,0.9)';
  ctx.fillText(`◆ ${gold || 0}`, 16, 62);

  // Bottom-center: local player health bar.
  if (localHp != null && localMaxHp) {
    const w = 280;
    const h = 16;
    const x = (canvas.width - w) / 2;
    const y = canvas.height - 40;
    const frac = Math.max(0, Math.min(1, localHp / localMaxHp));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    // Green→amber→red by remaining health.
    const hue = 120 * frac;
    ctx.fillStyle = localDowned ? 'rgba(120,120,140,0.7)' : `hsl(${hue}, 80%, 50%)`;
    ctx.fillRect(x, y, w * frac, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(localDowned ? 'DOWNED — hold on' : `${Math.ceil(localHp)} / ${localMaxHp}`, canvas.width / 2, y + 12);
  }
  ctx.restore();
}
