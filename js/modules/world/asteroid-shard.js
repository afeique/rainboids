// Asteroid explosion shards — 3D-spinning wireframe triangles that
// burst radially when an asteroid dies, fly across the field while
// rotating on all three axes, and fade out. Matches the wireframe-
// asteroid visual language (stroke only, no fill, asteroid-derived
// color palette).
//
// Pool-compatible: implements active flag + reset()/update()/draw(ctx)
// so it slots into the existing PoolManager pipeline alongside
// LineDebris and the particle pools.
//
// 3D rendering: each shard owns an equilateral triangle in 3D unit
// space, rotated each tick by (angleX, angleY, angleZ) and projected
// to 2D via a simple perspective divide. The wireframe is drawn as 3
// stroked line segments. No GL — cheap enough on Canvas2D because each
// shard is exactly 3 line segments.

import { random } from '../core/utils.js';

// Equilateral triangle in 3D unit space, centered at origin, lying in
// the XY plane. Shared by every shard — never mutated. We rotate +
// project copies into per-shard scratch arrays each draw call.
const BASE_VERTS = [
    { x: -1.0, y: -0.577, z: 0.0 },
    { x:  1.0, y: -0.577, z: 0.0 },
    { x:  0.0, y:  1.155, z: 0.0 },
];

// Perspective focal length for the 3D → 2D projection. Larger = less
// distortion. 100 gives a noticeable "in/out" wobble without making the
// triangle invert on itself when rotated edge-on.
const FOCAL = 100;

export class AsteroidShard {
    constructor() {
        this.active = false;
        // Scratch arrays — pre-allocated, reused every draw to avoid
        // per-frame garbage. Each is { x, y } in 2D screen space.
        this._proj = [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
        ];
    }

    /**
     * Spawn a shard.
     * @param {number} x       World spawn x
     * @param {number} y       World spawn y
     * @param {number} angle   Radial fly-out angle (rad)
     * @param {number} speed   Initial speed (px/frame)
     * @param {number} size    Triangle scale (px). Final triangle edge ≈ 2*size.
     * @param {string} color   CSS color string (stroke)
     */
    reset(x, y, angle, speed, size, color) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.size = size;
        this.color = color;

        // 3D orientation + per-axis spin. Z spin is the visual-plane
        // tumble; X and Y spin produce the "flip in/out of the page"
        // motion that makes shards read as 3D objects rather than 2D
        // rotating triangles. Y-spin range is wider so most shards
        // visibly cross zero (becoming edge-on) at least once during
        // their lifetime — that's the satisfying "real 3D" moment.
        this.ax = random(0, Math.PI * 2);
        this.ay = random(0, Math.PI * 2);
        this.az = random(0, Math.PI * 2);
        this.spinX = random(-0.10, 0.10);
        this.spinY = random(-0.14, 0.14);
        this.spinZ = random(-0.18, 0.18);

        // Lifetime in frames at the engine's logic tick rate. ~2.0 s
        // at 60 Hz so shards have time to travel a meaningful distance
        // across the field before they fade.
        this.life = 1.0;
        this.lifeStep = 1.0 / 120;

        this.active = true;
    }

    update() {
        if (!this.active) return;

        this.x += this.vx;
        this.y += this.vy;

        // Mild drag. 0.985 over 120 frames decays speed to ~16% of
        // initial, so shards drift to near-rest as they fade rather
        // than zipping off-screen at full speed.
        this.vx *= 0.985;
        this.vy *= 0.985;

        this.ax += this.spinX;
        this.ay += this.spinY;
        this.az += this.spinZ;

        this.life -= this.lifeStep;
        if (this.life <= 0) {
            this.active = false;
        }
    }

    draw(ctx) {
        if (!this.active) return;

        const cx = Math.cos(this.ax), sx = Math.sin(this.ax);
        const cy = Math.cos(this.ay), sy = Math.sin(this.ay);
        const cz = Math.cos(this.az), sz = Math.sin(this.az);
        const s = this.size;
        const f = FOCAL;

        // Rotate each base vertex by (ax, ay, az) then perspective-
        // project to 2D. Standard yaw → pitch → roll composition.
        // Inlined per-vertex for clarity; 3 verts × ~30 muls = trivial.
        for (let i = 0; i < 3; i++) {
            const v = BASE_VERTS[i];
            let x = v.x, y = v.y, z = v.z;

            // Rotate around X (pitch)
            let ty = y * cx - z * sx;
            let tz = y * sx + z * cx;
            y = ty; z = tz;

            // Rotate around Y (yaw)
            let tx = x * cy + z * sy;
            tz = -x * sy + z * cy;
            x = tx; z = tz;

            // Rotate around Z (roll)
            tx = x * cz - y * sz;
            ty = x * sz + y * cz;
            x = tx; y = ty;

            // Perspective divide. focal / (focal + z) is the scale.
            // When z is large positive the vertex shrinks (recedes);
            // when negative it grows (toward camera). Clamp denominator
            // so an edge-on triangle whose vertex sits exactly at z=-f
            // doesn't blow up to infinity.
            const denom = Math.max(0.25, 1 + (z * s) / f);
            const inv = 1 / denom;
            this._proj[i].x = x * s * inv;
            this._proj[i].y = y * s * inv;
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const p = this._proj;
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        ctx.lineTo(p[1].x, p[1].y);
        ctx.lineTo(p[2].x, p[2].y);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }
}
