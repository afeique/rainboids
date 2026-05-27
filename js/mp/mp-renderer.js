// js/mp/mp-renderer.js — Canvas2D renderer for the MP client.
//
// Path A / Group G (look-like-SP): ships and enemies render through the shared
// single-player shape helpers (js/modules/render/shapes.js), so they look
// exactly like single-player. Asteroids (which need a per-id 3D vertex cache +
// SP hue params) and the WebGL particle/bullet/starfield layers are subsequent
// Group-G steps; everything else here is interpolated authoritative state.

import { SHIP_RADIUS, REVIVE_TICKS } from '../sim/constants.js';
import { drawShipShape, drawEnemyShapeByType, SHIP_PALETTE_MAGENTA } from '../modules/render/shapes.js';

// Map the headless-sim enemy type keys → the SP shape registry's type strings.
const SP_ENEMY_SHAPE = { chaser: 'HUNTER' };

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

function drawAsteroid(ctx, x, y, angle, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  // Lumpy octagon so rotation is visible.
  const sides = 8;
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const rr = r * (0.78 + 0.22 * ((i % 2) ? 1 : 0.6));
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#2a3350';
  ctx.fill();
  ctx.strokeStyle = '#586a9c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawEnemy(ctx, e, now) {
  // SP enemy silhouette (shared render/shapes.js). Enemy shapes draw at the
  // origin, so pre-translate + rotate to the enemy's facing; `now` drives idle
  // animation. The headless-sim type maps to the SP shape registry.
  const type = SP_ENEMY_SHAPE[e.type] || 'HUNTER';
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

  // Arena border.
  ctx.strokeStyle = '#1d2440';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  // Asteroids (interpolated).
  if (asteroids) {
    for (const [, ast] of asteroids) drawAsteroid(ctx, ast.x, ast.y, ast.angle, ast.r);
  }

  // Enemies (interpolated).
  if (enemies) {
    for (const [, e] of enemies) drawEnemy(ctx, e, now);
  }

  // Drops (interpolated).
  if (drops) {
    for (const [, d] of drops) drawDrop(ctx, d);
  }

  // Bullets (latest snapshot positions).
  if (bullets) {
    ctx.fillStyle = '#ffe08a';
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Destruction rings (event-driven juice).
  if (effects && now != null) {
    for (const e of effects) {
      const age = (now - e.born) / 500; // 0 → 1 over lifetime
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
