// MP particles.
//
// Pure cosmetic, client-local particle system for the Phase 3+ MP
// loop. Spawned by mp-engine's onEvent dispatch table in response to
// authoritative sim events (BulletHit, EnemyDestroy, AsteroidSplit,
// ShipDamaged, ShipDowned, ShipRevived). Particles never sync across
// clients — each tab spawns its own — so jitter via Math.random() is
// fine and intentional; the wire stays narrow.
//
// Pool design: fixed-size array of plain objects, each reused in
// place. When the pool is saturated, the oldest active slot is
// recycled rather than allocating. update()/draw() early-return when
// nothing is active.
//
// Drawing contract: draw(ctx, scale) is called by the engine AFTER
// the renderer has painted the world this frame, with ctx already
// inside mp-renderer's letterbox transform. All line widths are
// counter-scaled by 1/scale so strokes stay 1 screen-pixel thick
// regardless of how the 1920x1080 field is letterboxed into the
// canvas.
//
// API (called by mp-engine):
//   const particles = new Particles();
//   particles.spawnBulletHit(x, y);      // cyan sparks
//   particles.spawnEnemyDestroy(x, y);   // red ring + orange sparks
//   particles.spawnShipDamaged(x, y);    // yellow ring
//   particles.spawnAsteroidSplit(x, y);  // gray debris
//   particles.spawnShipDowned(x, y);     // white shockwave
//   particles.spawnShipRevived(x, y);    // green sparkles
//   particles.update(dt);                // BEFORE renderer.render
//   particles.draw(ctx, scale);          // AFTER renderer.render
//
// Solo's particles live under js/modules/effects/particles/ and are
// not shared — this implementation is intentionally fresh and tiny.

const POOL_SIZE = 256;

// Particle kinds.
const KIND_SPARK = 0;   // 1-px line trailing along the velocity vector
const KIND_RING = 1;    // stationary expanding outlined circle
const KIND_DEBRIS = 2;  // short line segment, rotates as it drifts

// Ring growth speed in world px / sec. Rings don't translate; their
// visible radius is age * RING_EXPAND_RATE so the same kind can serve
// hits, destroys, and downed shockwaves with only a color/life tweak.
const RING_EXPAND_RATE_HIT = 90;
const RING_EXPAND_RATE_DESTROY = 180;
const RING_EXPAND_RATE_DOWNED = 320;

export class Particles {
    constructor() {
        this.pool = new Array(POOL_SIZE);
        for (let i = 0; i < POOL_SIZE; i++) {
            this.pool[i] = {
                active: false,
                kind: KIND_SPARK,
                x: 0, y: 0,
                vx: 0, vy: 0,
                age: 0, life: 1,
                color: "#fff",
                // ring-only: per-particle expand rate (px/sec)
                expand: 0,
                // debris-only: rotation state
                rot: 0, rotVel: 0, length: 0,
            };
        }
        this.activeCount = 0;
    }

    // Find an inactive slot, or recycle the oldest active one if the
    // pool is full. Returns the slot — caller fills in its fields.
    _acquire() {
        const pool = this.pool;
        for (let i = 0; i < POOL_SIZE; i++) {
            if (!pool[i].active) {
                pool[i].active = true;
                this.activeCount += 1;
                return pool[i];
            }
        }
        // Pool saturated — evict the slot with the highest age/life
        // ratio (the one closest to dying anyway).
        let worstIdx = 0;
        let worstRatio = -1;
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[i];
            const r = p.life > 0 ? p.age / p.life : 1;
            if (r > worstRatio) {
                worstRatio = r;
                worstIdx = i;
            }
        }
        const slot = pool[worstIdx];
        slot.active = true;
        return slot;
    }

    _spawnSpark(x, y, vx, vy, life, color) {
        const p = this._acquire();
        p.kind = KIND_SPARK;
        p.x = x; p.y = y;
        p.vx = vx; p.vy = vy;
        p.age = 0; p.life = life;
        p.color = color;
    }

    _spawnRing(x, y, life, color, expand) {
        const p = this._acquire();
        p.kind = KIND_RING;
        p.x = x; p.y = y;
        p.vx = 0; p.vy = 0;
        p.age = 0; p.life = life;
        p.color = color;
        p.expand = expand;
    }

    _spawnDebris(x, y, vx, vy, life, color, length, rotVel) {
        const p = this._acquire();
        p.kind = KIND_DEBRIS;
        p.x = x; p.y = y;
        p.vx = vx; p.vy = vy;
        p.age = 0; p.life = life;
        p.color = color;
        p.length = length;
        p.rot = Math.random() * Math.PI * 2;
        p.rotVel = rotVel;
    }

    // ── Spawn methods (called from mp-engine onEvent dispatch) ─────

    // Bullet hit: ~6 cyan sparks fanning outward.
    spawnBulletHit(x, y) {
        const count = 6;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 90 + Math.random() * 70;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.4, "#00ccff");
        }
    }

    // Enemy destroy: a single expanding red ring + ~16 orange sparks.
    spawnEnemyDestroy(x, y) {
        this._spawnRing(x, y, 0.55, "#ff4444", RING_EXPAND_RATE_DESTROY);
        const count = 16;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 110 + Math.random() * 140;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.55, "#ffaa44");
        }
    }

    // Ship damaged: a single warm-yellow ring (~8 implied by a thin
    // pulse — the ring itself reads as the "8 particles" worth of
    // visual weight without spamming sparks for routine chip damage).
    spawnShipDamaged(x, y) {
        this._spawnRing(x, y, 0.45, "#ffd84d", RING_EXPAND_RATE_HIT);
        const count = 8;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 70 + Math.random() * 50;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.45, "#ffd84d");
        }
    }

    // Asteroid split: ~12 gray debris chunks tumbling outward.
    spawnAsteroidSplit(x, y) {
        const count = 12;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 90;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const length = 4 + Math.random() * 6;
            const rotVel = (Math.random() - 0.5) * 8;
            this._spawnDebris(x, y, vx, vy, 0.6, "#aaaaaa", length, rotVel);
        }
    }

    // Ship downed: white expanding shockwave + ~20 white sparks.
    spawnShipDowned(x, y) {
        this._spawnRing(x, y, 0.6, "#dde9ff", RING_EXPAND_RATE_DOWNED);
        const count = 20;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 140 + Math.random() * 160;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.6, "#dde9ff");
        }
    }

    // Enemy bullet hit: small red spark burst at the impact site.
    spawnEnemyBulletHit(x, y) {
        const count = 6;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 80;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.4, "#ff6666");
        }
    }

    // Orb pickup: tiny color-matched burst (gold or green).
    // `kind` matches OrbState.kind: 0 = gold, 1 = health.
    spawnOrbPickup(x, y, kind) {
        const count = 10;
        const color = kind === 1 ? "#88ff88" : "#ffd84d";
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 60;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.45, color);
        }
    }

    // Ship revived: ~16 pale-green sparkles drifting upward-ish.
    spawnShipRevived(x, y) {
        const count = 16;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 60;
            const vx = Math.cos(angle) * speed;
            // Bias slightly upward so the revive reads as uplift.
            const vy = Math.sin(angle) * speed - 30;
            this._spawnSpark(x, y, vx, vy, 0.55, "#88ff88");
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    update(dt) {
        if (this.activeCount === 0) return;
        const pool = this.pool;
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.active) continue;
            p.age += dt;
            if (p.age >= p.life) {
                p.active = false;
                this.activeCount -= 1;
                continue;
            }
            // Rings don't move. Sparks and debris integrate normally.
            if (p.kind !== KIND_RING) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
            }
            if (p.kind === KIND_DEBRIS) {
                p.rot += p.rotVel * dt;
            }
        }
    }

    draw(ctx, scale) {
        if (this.activeCount === 0) return;
        const pool = this.pool;
        const inv = 1 / scale;
        ctx.save();
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.active) continue;
            const t = p.age / p.life;
            ctx.globalAlpha = Math.max(0, 1 - t);
            ctx.strokeStyle = p.color;

            if (p.kind === KIND_SPARK) {
                ctx.lineWidth = inv;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
                ctx.stroke();
            } else if (p.kind === KIND_RING) {
                const r = p.age * p.expand;
                ctx.lineWidth = 1.5 * inv;
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.stroke();
            } else if (p.kind === KIND_DEBRIS) {
                ctx.lineWidth = 1.5 * inv;
                const half = p.length * 0.5;
                const cos = Math.cos(p.rot);
                const sin = Math.sin(p.rot);
                ctx.beginPath();
                ctx.moveTo(p.x - cos * half, p.y - sin * half);
                ctx.lineTo(p.x + cos * half, p.y + sin * half);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
