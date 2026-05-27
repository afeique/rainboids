// js/sim/asteroid.js — headless asteroid state + per-tick step.
//
// Asteroids drift in a straight line, rotate, and wrap around the arena edges
// (classic asteroids-field behavior). Pure state; no rendering. HP scales with
// size so bigger rocks take more hits (combat lands in a later iteration).

export function createAsteroid(id, x, y, vx, vy, radius, spin) {
  return {
    id,
    x, y, vx, vy,
    angle: 0,
    spin,
    radius,
    hp: Math.max(1, Math.ceil(radius / 8)),
    alive: true,
  };
}

/** Advance one asteroid: integrate, wrap (with radius margin), rotate. */
export function stepAsteroid(ast, width, height) {
  ast.x += ast.vx;
  ast.y += ast.vy;

  const r = ast.radius;
  if (ast.x < -r) ast.x += width + 2 * r;
  else if (ast.x > width + r) ast.x -= width + 2 * r;
  if (ast.y < -r) ast.y += height + 2 * r;
  else if (ast.y > height + r) ast.y -= height + 2 * r;

  ast.angle += ast.spin;
}
