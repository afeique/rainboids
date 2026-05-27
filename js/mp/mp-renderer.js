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

export function render(ctx, canvas, { localShip, remoteShips, localId }) {
  // Background.
  ctx.fillStyle = '#070710';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Arena border.
  ctx.strokeStyle = '#1d2440';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);

  // Remote ships (interpolated).
  for (const [id, s] of remoteShips) {
    drawShip(ctx, s.x, s.y, s.angle, '#54d6ff', `P${id}`, false);
  }

  // Local ship (predicted).
  if (localShip) {
    drawShip(ctx, localShip.x, localShip.y, localShip.angle, '#ffd23f', `P${localId} (you)`, true);
  }
}
