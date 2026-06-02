// world/map/world-map.js
//
// v11.0.0 — the playing field. Replaces the single fixed 1920×1080 arena with a
// resizable world that can carry WALL GEOMETRY (the dungeon/labyrinth). One
// WorldMap instance lives on the engine; each map encounter reconfigures its
// bounds + walls via the ModeManager.
//
// Walls are axis-aligned rectangles in WORLD coordinates. Collision is a
// circle-vs-AABB push-out (entities never tunnel through), and rendering is a
// glowing rainbow neon edge over a faint dark fill (the project's wireframe look).

import { hsl, rgba } from '../../core/color-cache.js';

export class WorldMap {
    constructor(width = 1920, height = 1080) {
        // `bounds` is shared by-reference with engine.gameField so every existing
        // boundary consumer (player clamp, asteroid bounce, star wrap, camera
        // clamp) tracks the active map size automatically.
        this.bounds = { width, height };
        this.walls = [];            // [{ x, y, w, h, hue }]
        this._hasWalls = false;
    }

    setBounds(width, height) {
        this.bounds.width = width;
        this.bounds.height = height;
    }

    clearWalls() {
        this.walls.length = 0;
        this._hasWalls = false;
    }

    /** Replace the wall set. Each wall is { x, y, w, h }; a per-wall hue is
     *  assigned from its position for the rainbow neon sweep. */
    setWalls(rects) {
        this.walls.length = 0;
        const W = this.bounds.width || 1, H = this.bounds.height || 1;
        for (const r of (rects || [])) {
            const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
            const hue = ((cx / W) * 180 + (cy / H) * 140 + 190) % 360;
            this.walls.push({ x: r.x, y: r.y, w: r.w, h: r.h, hue });
        }
        this._hasWalls = this.walls.length > 0;
    }

    get hasWalls() { return this._hasWalls; }

    /** True if the point is inside any wall (used for bullet despawn). */
    pointInWall(x, y) {
        if (!this._hasWalls) return false;
        for (let i = 0; i < this.walls.length; i++) {
            const w = this.walls[i];
            if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
        }
        return false;
    }

    /**
     * Resolve a circle (entity) against all walls. Mutates nothing; returns the
     * corrected position + whether a correction happened. Push-out is along the
     * shortest separating axis so the entity slides along surfaces.
     */
    resolveCircle(x, y, r) {
        if (!this._hasWalls) return { x, y, hit: false };
        let hit = false;
        for (let i = 0; i < this.walls.length; i++) {
            const w = this.walls[i];
            const nx = x < w.x ? w.x : (x > w.x + w.w ? w.x + w.w : x);
            const ny = y < w.y ? w.y : (y > w.y + w.h ? w.y + w.h : y);
            let dx = x - nx, dy = y - ny;
            let d2 = dx * dx + dy * dy;
            if (d2 < r * r) {
                hit = true;
                if (d2 > 1e-6) {
                    const d = Math.sqrt(d2);
                    const push = (r - d);
                    x += (dx / d) * push;
                    y += (dy / d) * push;
                } else {
                    // Center inside the wall — eject along the nearest face.
                    const left = x - w.x, right = (w.x + w.w) - x;
                    const top = y - w.y, bottom = (w.y + w.h) - y;
                    const m = Math.min(left, right, top, bottom);
                    if (m === left) x = w.x - r;
                    else if (m === right) x = w.x + w.w + r;
                    else if (m === top) y = w.y - r;
                    else y = w.y + w.h + r;
                }
            }
        }
        return { x, y, hit };
    }

    /** Draw walls intersecting the given viewport rect (world coords). */
    draw(ctx, vL, vT, vR, vB, now = 0) {
        if (!this._hasWalls) return;
        const drift = (now * 0.00004) % 1;
        ctx.save();
        ctx.lineJoin = 'round';
        for (let i = 0; i < this.walls.length; i++) {
            const w = this.walls[i];
            if (w.x > vR || w.x + w.w < vL || w.y > vB || w.y + w.h < vT) continue;
            const hue = (w.hue + drift * 360) % 360;
            // faint dark fill — keeps the labyrinth readable without hiding the
            // starfield behind solid blocks.
            ctx.fillStyle = rgba(8, 14, 26, 0.55);
            ctx.fillRect(w.x, w.y, w.w, w.h);
            // inner soft glow
            ctx.strokeStyle = hsl(hue, 90, 62);
            ctx.shadowColor = hsl(hue, 95, 60);
            ctx.shadowBlur = 14;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
            // crisp bright edge
            ctx.shadowBlur = 0;
            ctx.strokeStyle = hsl(hue, 100, 80);
            ctx.lineWidth = 1;
            ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
        }
        ctx.restore();
    }
}
