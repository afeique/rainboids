// enemy/bosses/render/boss-gfx.js — shared canvas-2D toolkit for per-boss
// renderers (9.1.0 boss redesign). Each boss owns its own draw module under
// render/<boss>-render.js; these helpers give them a common visual grammar:
// layered radial cores, additive glow halos, beveled metal panels, telegraph
// arcs, and a safe particle-emit wrapper. Pure draw helpers — they take a raw
// 2D context (already inside the camera transform) and never touch engine state
// except through the passed gameEngine for particle pools.

// Hex (#rgb / #rrggbb) → {r,g,b}; tolerant, neutral-grey fallback.
export function hexRgb(hex) {
    if (typeof hex !== 'string') return { r: 200, g: 210, b: 220 };
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (!isFinite(n)) return { r: 200, g: 210, b: 220 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba(c, a) {
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}

// Additive radial glow halo. Saves/restores composite + alpha.
export function radialGlow(ctx, x, y, rInner, rOuter, color, alpha) {
    const c = (typeof color === 'string') ? hexRgb(color) : color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, Math.max(0, rInner), x, y, Math.max(rInner + 1, rOuter));
    g.addColorStop(0, rgba(c, alpha));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(rInner + 1, rOuter), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Layered disc core: outer additive halo → filled body gradient → dark inner
// well → bright rim. `palette` = { dark, mid, bright, glow }. `heat` 0..1 brightens.
export function layeredCore(ctx, x, y, r, palette, heat = 0, pulse = 0) {
    const dark = hexRgb(palette.dark);
    const mid = hexRgb(palette.mid);
    const bright = hexRgb(palette.bright);
    const glow = hexRgb(palette.glow || palette.bright);

    // Halo
    radialGlow(ctx, x, y, r * 0.4, r * (1.7 + heat * 0.5 + pulse * 0.15), glow, 0.22 + heat * 0.2 + pulse * 0.08);

    // Body — radial dark→mid→bright
    const body = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
    body.addColorStop(0, rgba(bright, 0.95));
    body.addColorStop(0.45, rgba(mid, 0.9));
    body.addColorStop(1, rgba(dark, 0.95));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Dark inner well for contrast
    const well = ctx.createRadialGradient(x, y, 0, x, y, r * 0.6);
    well.addColorStop(0, 'rgba(0,0,0,0.55)');
    well.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = well;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Bright rim
    ctx.strokeStyle = rgba(bright, 0.7 + heat * 0.3);
    ctx.lineWidth = Math.max(2, r * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();
}

// A beveled armored panel: a rounded quad/trapezoid with a linear sheen gradient
// + bright top edge + rivets. Drawn in LOCAL space — caller has translated +
// rotated so +x points radially outward. w/h are panel half-extents.
export function beveledPanel(ctx, w, h, palette, tintA = 1) {
    const dark = hexRgb(palette.dark);
    const mid = hexRgb(palette.mid);
    const bright = hexRgb(palette.bright);

    // Sheen across the panel face (perpendicular to outward axis).
    const sheen = ctx.createLinearGradient(0, -h, 0, h);
    sheen.addColorStop(0, rgba(dark, tintA));
    sheen.addColorStop(0.45, rgba(mid, tintA));
    sheen.addColorStop(0.55, rgba(bright, tintA));
    sheen.addColorStop(1, rgba(dark, tintA));

    const r = Math.min(w, h) * 0.4;
    ctx.beginPath();
    roundRect(ctx, -w, -h, w * 2, h * 2, r);
    ctx.fillStyle = sheen;
    ctx.fill();

    // Bright outer edge (the lip facing the player).
    ctx.strokeStyle = rgba(bright, 0.85 * tintA);
    ctx.lineWidth = Math.max(1.5, h * 0.12);
    ctx.beginPath();
    ctx.moveTo(w, -h * 0.7);
    ctx.lineTo(w, h * 0.7);
    ctx.stroke();

    // Rivets.
    ctx.fillStyle = rgba(dark, 0.9 * tintA);
    for (const ry of [-h * 0.55, h * 0.55]) {
        ctx.beginPath();
        ctx.arc(-w * 0.5, ry, Math.max(1.2, h * 0.1), 0, Math.PI * 2);
        ctx.fill();
    }
}

export function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

// Additive arc band — a glowing translucent wedge (telegraphs / force-fields).
// angleMid = center angle, span = total angular width, rIn/rOut = band radii.
export function additiveArc(ctx, x, y, rIn, rOut, angleMid, span, color, alpha) {
    const c = (typeof color === 'string') ? hexRgb(color) : color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, rIn, x, y, rOut);
    g.addColorStop(0, rgba(c, alpha * 0.15));
    g.addColorStop(0.6, rgba(c, alpha));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rOut, angleMid - span / 2, angleMid + span / 2);
    ctx.arc(x, y, rIn, angleMid + span / 2, angleMid - span / 2, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// Expanding shockwave ring (telegraph→commit). frac 0..1 of its life.
export function shockwaveRing(ctx, x, y, radius, thickness, color, alpha) {
    const c = (typeof color === 'string') ? hexRgb(color) : color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(c, alpha);
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    // inner soft glow
    ctx.strokeStyle = rgba(c, alpha * 0.4);
    ctx.lineWidth = thickness * 2.4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

// Safe particle emit — guards the pool + signature. `args` forwarded to
// Particle.reset(x, y, type, ...args). No-op if the pool is missing.
export function emit(ge, x, y, type, count = 1, ...args) {
    const pool = ge && ge.particlePool;
    if (!pool || typeof pool.get !== 'function') return;
    for (let i = 0; i < count; i++) pool.get(x, y, type, ...args);
}
