// js/mp/mp-renderer.js — minimal Canvas2D renderer for the MP client.
//
// Deliberately simple: it proves the netcode end-to-end (local predicted ship +
// interpolated remote ships in a shared arena). Reusing the full single-player
// WebGL renderer / shared shape helpers is a later polish step; the point of
// this module is a clear, dependency-free visualization of authoritative state.

import { SHIP_RADIUS } from '../sim/constants.js';

function drawShip(ctx, x, y, angle, color, label, isLocal) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  const r = SHIP_RADIUS;
  ctx.moveTo(r * 1.4, 0);
  ctx.lineTo(-r, r * 0.8);
  ctx.lineTo(-r * 0.5, 0);
  ctx.lineTo(-r, -r * 0.8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (isLocal) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();

  if (label != null) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - r - 8);
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

export function render(ctx, canvas, { localShip, remoteShips, asteroids, localId }) {
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

  // Remote ships (interpolated).
  for (const [id, s] of remoteShips) {
    drawShip(ctx, s.x, s.y, s.angle, '#54d6ff', `P${id}`, false);
  }

  // Local ship (predicted).
  if (localShip) {
    drawShip(ctx, localShip.x, localShip.y, localShip.angle, '#ffd23f', `P${localId} (you)`, true);
  }
}
