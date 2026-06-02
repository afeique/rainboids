// world/map/portal.js
//
// v11.0.0 — the EXIT PORTAL. Spawned by a map mode once its clear-condition is
// met; touching it advances the Campaign to the next map. Pure visual + a
// contains() test; the ModeManager owns the transition.

import { hsl, rgba } from '../../core/color-cache.js';

export class Portal {
    constructor() {
        this.active = false;
        this.x = 0;
        this.y = 0;
        this.radius = 64;
        this.spawnT = 0;     // grow-in animation clock
    }

    spawn(x, y, radius = 64) {
        this.active = true;
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.spawnT = 0;
    }

    deactivate() { this.active = false; }

    /** True when the player's center is within the portal mouth. */
    contains(px, py) {
        if (!this.active) return false;
        const dx = px - this.x, dy = py - this.y;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    update(dt = 16.6) {
        if (!this.active) return;
        this.spawnT += dt;
    }

    draw(ctx, now = 0) {
        if (!this.active) return;
        const grow = Math.min(1, this.spawnT / 600);
        const r = this.radius * grow;
        const t = now * 0.003;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalCompositeOperation = 'lighter';

        // outer halo
        const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.9);
        halo.addColorStop(0, rgba(120, 230, 255, 0.45));
        halo.addColorStop(0.5, rgba(170, 120, 255, 0.22));
        halo.addColorStop(1, rgba(0, 0, 0, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
        ctx.fill();

        // swirling rainbow rings
        for (let k = 0; k < 4; k++) {
            const rr = r * (0.45 + k * 0.18);
            const hue = (now * 0.12 + k * 70) % 360;
            ctx.strokeStyle = hsl(hue, 100, 65);
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.3) {
                const wob = 1 + Math.sin(a * 6 + t * (k + 1) + k) * 0.06;
                const x = Math.cos(a + t * (k % 2 ? -1 : 1)) * rr * wob;
                const y = Math.sin(a + t * (k % 2 ? -1 : 1)) * rr * wob;
                if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // bright core
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
        core.addColorStop(0, rgba(255, 255, 255, 0.95));
        core.addColorStop(0.6, rgba(140, 220, 255, 0.5));
        core.addColorStop(1, rgba(0, 0, 0, 0));
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
