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
// ── Solo WebGL bloom parity (Phase 4) ─────────────────────────────
// MP now renders on solo's 3-canvas stack. glCanvas runs solo's
// WebGLParticleRenderer (js/modules/performance/webgl-particle-renderer.js),
// which draws additive-bloom particles in a single instanced draw call.
// To get full solo-parity bloom in MP, every pooled particle ALSO
// carries the exact field shape that renderer reads:
//
//   ALL types: active, type (solo WebGL type string), x, y,
//              life (NORMALIZED 0..1 — read directly as an alpha base),
//              radius, color (CSS string).
//   explosionShrapnel: + length, _speed, angle, _cosA, _sinA.
//   enemyPlasmaCore:   + maxLife.
//
// The renderer iterates `pool.activeObjects` and skips `!p.active`, so
// we expose `get activeObjects()` returning the full pool array. The
// engine calls:
//
//   particleRenderer.drawParticles(particles, 0, 0, 0, 0, fieldW, fieldH)
//
// passing the Particles instance directly (its `.activeObjects` getter
// supplies the list). MP uses a 1920×1080 field-size backing store on
// glCanvas with camera (0,0), so particle x/y are raw field coords —
// no transform needed.
//
// `life` normalization: each particle stores total lifetime in
// `_lifeMax` and elapsed time in `_age`. update(dt) advances `_age`
// and sets `p.life = max(0, 1 - _age / _lifeMax)` each tick (the value
// the WebGL renderer reads). At life 0 the particle deactivates.
//
// Canvas2D fallback: draw(ctx, scale) is the fallback for when WebGL
// is unavailable. The engine calls EITHER the WebGL path OR draw();
// both read the same pool. draw() keeps using the legacy kind/expand/
// rot fields (still maintained on every particle) and derives its
// alpha from the normalized `life`. All line widths are counter-scaled
// by 1/scale so strokes stay 1 screen-pixel thick regardless of
// letterboxing.
//
// Drawing contract: draw(ctx, scale) is called by the engine AFTER
// the renderer has painted the world this frame, with ctx already
// inside mp-renderer's letterbox transform.
//
// API (called by mp-engine):
//   const particles = new Particles();
//   particles.spawnBulletHit(x, y);      // cyan sparks
//   particles.spawnEnemyDestroy(x, y);   // red ring + orange sparks
//   particles.spawnShipDamaged(x, y);    // yellow ring
//   particles.spawnAsteroidSplit(x, y);  // gray debris
//   particles.spawnShipDowned(x, y);     // white shockwave
//   particles.spawnShipRevived(x, y);    // green sparkles
//   particles.spawnEnemyMineSpawn(x, y); // dim red "mine placed" sparks
//   particles.spawnEnemyMineDeath(x, y); // red+orange burst on mine kill
//   particles.spawnEnemyMissileSpawn(x, y); // gray exhaust puff at launch
//   particles.spawnEnemyMissileHit(x, y);   // heavy red+ember burst on hit
//   particles.spawnPowerWeaponActivate(player_id, kind); // umbrella no-op (specific events cover the visual)
//   particles.spawnChargeShotFire(x, y, damage);         // teal sparks + white embers at release
//   particles.spawnNovaBlast(x, y, radius);              // white flash + chromatic ring + radial shrapnel
//   particles.spawnBeamStart(player_id, kind);           // no-op (renderer's beam draw is the primary visual)
//   particles.spawnBeamEnd(player_id);                   // no-op (beam fade is the primary visual)
//   particles.spawnArcStrike(chain);                     // purple micro-bursts at each chain point
//   particles.spawnPlayerMineDeath(x, y);                // cyan+white burst (friendly, distinct from enemy red)
//   particles.spawnPlayerMissileHit(x, y);               // small cyan impact burst
//   particles.update(dt);                // BEFORE renderer.render
//   particles.draw(ctx, scale);          // Canvas2D fallback, AFTER renderer.render
//
// Solo's particles live under js/modules/effects/particles/ and are
// not shared — this implementation is intentionally fresh and tiny.

const POOL_SIZE = 256;

// Legacy Canvas2D-fallback particle kinds. Retained so draw() can keep
// rendering each particle's shape (line / ring / rotating segment)
// without depending on the WebGL atlas.
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
                // ── Shared / WebGL-renderer fields ────────────────
                active: false,
                // Solo WebGL type string. Drives TYPE_TO_SLOT in the
                // WebGL renderer; left as a directional streak default.
                type: 'explosionShrapnel',
                x: 0, y: 0,
                vx: 0, vy: 0,
                // Normalized remaining-life 0..1 — the WebGL renderer
                // reads this DIRECTLY as an alpha base. Maintained by
                // update(): life = max(0, 1 - _age / _lifeMax).
                life: 1,
                // Raw timers backing the normalized `life`.
                _age: 0,
                _lifeMax: 1,
                // Quad sizing for the WebGL atlas sprite.
                radius: 1.5,
                color: "#fff",
                // explosionShrapnel streak fields (precomputed).
                angle: 0,
                _speed: 0,
                _cosA: 1,
                _sinA: 0,
                length: 0,
                // enemyPlasmaCore field (unused by current spawns but
                // kept on the shape so the renderer never reads undefined).
                maxLife: 1,

                // ── Legacy Canvas2D-fallback fields ───────────────
                kind: KIND_SPARK,
                // ring-only: per-particle expand rate (px/sec)
                expand: 0,
                // debris-only: rotation state
                rot: 0, rotVel: 0,
            };
        }
        this.activeCount = 0;
    }

    // Renderer accessor. Solo's WebGLParticleRenderer reads
    // `pool.activeObjects` and skips inactive entries (`if (!p.active)
    // continue`), so returning the full backing array is correct and
    // allocation-free.
    get activeObjects() {
        return this.pool;
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
        // Pool saturated — evict the slot closest to dying (lowest
        // normalized life remaining).
        let worstIdx = 0;
        let worstLife = Infinity;
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[i];
            if (p.life < worstLife) {
                worstLife = p.life;
                worstIdx = i;
            }
        }
        const slot = pool[worstIdx];
        slot.active = true;
        return slot;
    }

    // Directional spark → solo `explosionShrapnel` (streak slot). The
    // renderer rotates a streak quad to `angle` and offsets it back
    // along the velocity so the bright head lands at (x, y). We
    // precompute angle/cos/sin/speed and derive a length from speed so
    // the streak reads proportional to how fast the spark moves.
    _spawnSpark(x, y, vx, vy, life, color) {
        const p = this._acquire();
        p.kind = KIND_SPARK;
        p.type = 'explosionShrapnel';
        p.x = x; p.y = y;
        p.vx = vx; p.vy = vy;
        p._age = 0; p._lifeMax = life; p.life = 1;
        p.color = color;
        // Streak geometry. _speed feeds the renderer's length clamp
        // (streakLen = min(length, _speed*3)); length seeds the long
        // edge; radius sets stroke thickness (height = max(1.6, r*2)).
        const speed = Math.hypot(vx, vy);
        const angle = Math.atan2(vy, vx);
        p.angle = angle;
        p._cosA = Math.cos(angle);
        p._sinA = Math.sin(angle);
        p._speed = speed * 0.04;            // scale px/s → streak units
        p.length = Math.max(4, speed * 0.06);
        p.radius = 1.0;
    }

    // Round ember spark → solo `explosionEmber` (dot slot). Same motion
    // integration as a directional spark, but rendered as a soft glowing
    // dot rather than a streak — used for warm "ember" flecks.
    _spawnEmber(x, y, vx, vy, life, color, radius) {
        const p = this._acquire();
        p.kind = KIND_SPARK;
        p.type = 'explosionEmber';
        p.x = x; p.y = y;
        p.vx = vx; p.vy = vy;
        p._age = 0; p._lifeMax = life; p.life = 1;
        p.color = color;
        p.radius = radius != null ? radius : 1.5;
    }

    // Expanding ring / shockwave → solo `explosionRingColored` (ring
    // slot). The WebGL ring quad is sized by `radius` (w = h = r*2), so
    // we drive `radius` from the legacy expand rate × age in update().
    // We retain `expand` so the Canvas2D fallback keeps its growth.
    _spawnRing(x, y, life, color, expand) {
        const p = this._acquire();
        p.kind = KIND_RING;
        p.type = 'explosionRingColored';
        p.x = x; p.y = y;
        p.vx = 0; p.vy = 0;
        p._age = 0; p._lifeMax = life; p.life = 1;
        p.color = color;
        p.expand = expand;
        p.radius = 0;   // grows in update() as _age * expand
    }

    // Bright flash → solo `explosionFlash` (flash slot). A stationary
    // glowing burst sized by `radius`; used for the nova inner pop.
    _spawnFlash(x, y, life, color, radius) {
        const p = this._acquire();
        p.kind = KIND_RING;          // fallback draws it as a thin ring
        p.type = 'explosionFlash';
        p.x = x; p.y = y;
        p.vx = 0; p.vy = 0;
        p._age = 0; p._lifeMax = life; p.life = 1;
        p.color = color;
        p.expand = radius / Math.max(life, 0.001); // fallback ring growth
        p.radius = radius;
    }

    // Tumbling debris → solo `explosionEmber` (dot slot) for bloom,
    // while the Canvas2D fallback still draws a rotating line segment
    // via the legacy KIND_DEBRIS branch. WebGL has no rotating-segment
    // primitive, so a soft gray dot is the closest bloom analogue.
    _spawnDebris(x, y, vx, vy, life, color, length, rotVel) {
        const p = this._acquire();
        p.kind = KIND_DEBRIS;
        p.type = 'explosionEmber';
        p.x = x; p.y = y;
        p.vx = vx; p.vy = vy;
        p._age = 0; p._lifeMax = life; p.life = 1;
        p.color = color;
        p.length = length;
        p.radius = Math.max(1.2, length * 0.18);
        p.rot = Math.random() * Math.PI * 2;
        p.rotVel = rotVel;
    }

    // Twinkle / sparkle → solo `starSparkle` (spark slot). A 4-point
    // cross that flares bright. Used for the revive uplift effect.
    _spawnSparkle(x, y, vx, vy, life, color) {
        const p = this._acquire();
        p.kind = KIND_SPARK;
        p.type = 'starSparkle';
        p.x = x; p.y = y;
        p.vx = vx; p.vy = vy;
        p._age = 0; p._lifeMax = life; p.life = 1;
        p.color = color;
        p.radius = 1.2;
        // Fallback still draws it as a short velocity-aligned line.
        const angle = Math.atan2(vy, vx);
        p.angle = angle;
        p._cosA = Math.cos(angle);
        p._sinA = Math.sin(angle);
    }

    // ── Spawn methods (called from mp-engine onEvent dispatch) ─────
    // Each method's solo-type mapping is noted in its comment. The
    // signatures are UNCHANGED — mp-engine's dispatch table calls these.

    // Bullet hit: ~6 cyan sparks fanning outward → explosionShrapnel.
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

    // Enemy destroy: a single expanding red ring (explosionRingColored)
    // + ~16 orange sparks (explosionShrapnel).
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

    // Ship damaged: a warm-yellow ring (explosionRingColored) + ~8
    // yellow sparks (explosionShrapnel).
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

    // Asteroid split: ~12 gray debris chunks → explosionEmber (dots in
    // WebGL; rotating segments in the Canvas2D fallback).
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

    // Ship downed: white expanding shockwave (explosionRingColored) +
    // ~20 white sparks (explosionShrapnel).
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

    // Enemy bullet hit: small red spark burst → explosionShrapnel.
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

    // Orb pickup: tiny color-matched burst → explosionShrapnel.
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

    // Ship revived: ~16 pale-green sparkles (starSparkle) drifting
    // upward-ish — sparkle reads as celebratory uplift.
    spawnShipRevived(x, y) {
        const count = 16;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 60;
            const vx = Math.cos(angle) * speed;
            // Bias slightly upward so the revive reads as uplift.
            const vy = Math.sin(angle) * speed - 30;
            this._spawnSparkle(x, y, vx, vy, 0.55, "#88ff88");
        }
    }

    // Enemy mine spawn: ~5 dim red sparks → explosionShrapnel.
    spawnEnemyMineSpawn(x, y) {
        const count = 5;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 25 + Math.random() * 25;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.3, "#ff4444");
        }
    }

    // Enemy mine death: ~8 red sparks (explosionShrapnel) + ~4 orange
    // embers (explosionEmber).
    spawnEnemyMineDeath(x, y) {
        const redCount = 8;
        for (let i = 0; i < redCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 140 + Math.random() * 120;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.5, "#ff4444");
        }
        const emberCount = 4;
        for (let i = 0; i < emberCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 100 + Math.random() * 100;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnEmber(x, y, vx, vy, 0.5, "#ff8844", 1.8);
        }
    }

    // Enemy missile spawn: tiny gray exhaust puff → explosionEmber
    // (soft round puff reads better than a streak for exhaust).
    spawnEnemyMissileSpawn(x, y) {
        const count = 3;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 30;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnEmber(x, y, vx, vy, 0.2, "#888888", 1.4);
        }
    }

    // Enemy missile hit: ~10 red sparks (explosionShrapnel) + ~3 orange
    // embers (explosionEmber) — heavier than a bullet impact.
    spawnEnemyMissileHit(x, y) {
        const redCount = 10;
        for (let i = 0; i < redCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 120 + Math.random() * 130;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.4, "#ff4444");
        }
        const emberCount = 3;
        for (let i = 0; i < emberCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 80 + Math.random() * 100;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnEmber(x, y, vx, vy, 0.4, "#ff8844", 1.8);
        }
    }

    // ── Phase 4 step 6: power-weapon cosmetics ────────────────────

    // Generic power-weapon activation flash. The specific-event spawns
    // below (NovaBlast, ChargeShotFire, BeamStart, etc.) carry the real
    // visual weight, and they already receive concrete world-space
    // coordinates from the sim. This umbrella hook fires per activation
    // regardless of weapon kind, but without an x/y plumbed through it
    // can't render anything safely — so it's an intentional no-op.
    // Kept on the API so mp-engine's dispatch table stays uniform.
    spawnPowerWeaponActivate(_player_id, _kind) {
        // no-op — specific events cover the visual
    }

    // Charge-shot release: ~10 teal sparks (explosionShrapnel, matches
    // solo's CHARGE_SHOT teal #00e6aa) + 4 white embers (explosionEmber).
    spawnChargeShotFire(x, y, _damage) {
        const sparkCount = 10;
        for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 120 + Math.random() * 120;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.5, "#00e6aa");
        }
        const emberCount = 4;
        for (let i = 0; i < emberCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 80 + Math.random() * 110;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnEmber(x, y, vx, vy, 0.5, "#ffffff", 1.6);
        }
    }

    // Nova blast: bright white inner flash (explosionFlash) + chromatic
    // ring (explosionRingColored) sized to the blast radius + 18 radial
    // shrapnel sparks (explosionShrapnel) in alternating warm colors
    // (mirrors solo's NOVA_BLAST visual). The ring's expand rate is
    // computed from `radius` and ring life so it reaches the right size
    // by the end of its life.
    spawnNovaBlast(x, y, radius) {
        const ringLife = 0.55;
        const targetRadius = radius > 0 ? radius : 200;
        // Inner white flash — small, fast, sized to ~60% of the blast.
        this._spawnFlash(x, y, 0.25, "#ffffff", targetRadius * 0.6);
        // Outer chromatic ring — sized to the blast radius.
        this._spawnRing(x, y, ringLife, "#ffaa66", targetRadius / ringLife);
        // 18 radial shrapnel sparks, alternating warm colors.
        const count = 18;
        const palette = ["#ffd84d", "#ff8844", "#ffffff"];
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
            const speed = 180 + Math.random() * 160;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const color = palette[i % palette.length];
            this._spawnSpark(x, y, vx, vy, 0.55, color);
        }
    }

    // Beam-start flash. The renderer's beam draw is the primary visual
    // for LANCE_BEAM / LIGHTNING_ARC. Without ship-position plumbed
    // through the event, there's no safe x/y to spawn at, so this is a
    // deliberate no-op kept on the API for dispatch-table parity.
    spawnBeamStart(_player_id, _kind) {
        // no-op — beam draw is the primary visual
    }

    // Beam-end fizzle. Same caveat as spawnBeamStart: no ship-pos
    // plumbed, beam fade is the primary visual. No-op by design.
    spawnBeamEnd(_player_id) {
        // no-op — beam fade is the primary visual
    }

    // Arc strike: one short purple micro-burst (explosionShrapnel) at
    // each chain point so the lightning reads as "grounding" on every
    // target along the polyline. Bounded to the first 6 points to keep
    // total particle count sane on long chains.
    spawnArcStrike(chain) {
        if (!chain || chain.length === 0) return;
        const maxPoints = Math.min(chain.length, 6);
        for (let p = 0; p < maxPoints; p++) {
            const pt = chain[p];
            if (!pt) continue;
            const x = pt.x;
            const y = pt.y;
            const count = 3;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 70 + Math.random() * 70;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                this._spawnSpark(x, y, vx, vy, 0.2, "#cc88ff");
            }
        }
    }

    // Player-mine death: mirrors spawnEnemyMineDeath's shape but with a
    // cyan palette so friendly mines read as distinct from enemy red.
    // ~10 cyan sparks (explosionShrapnel) + 4 white embers (explosionEmber).
    spawnPlayerMineDeath(x, y) {
        const cyanCount = 10;
        for (let i = 0; i < cyanCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 140 + Math.random() * 120;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.5, "#44ccff");
        }
        const emberCount = 4;
        for (let i = 0; i < emberCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 100 + Math.random() * 100;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnEmber(x, y, vx, vy, 0.5, "#ffffff", 1.6);
        }
    }

    // Player-missile hit: small cyan impact burst → explosionShrapnel —
    // lighter than a mine death but still clearly a friendly impact.
    spawnPlayerMissileHit(x, y) {
        const count = 6;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 90 + Math.random() * 90;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this._spawnSpark(x, y, vx, vy, 0.3, "#44ddff");
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    update(dt) {
        if (this.activeCount === 0) return;
        const pool = this.pool;
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.active) continue;
            p._age += dt;
            if (p._age >= p._lifeMax) {
                p.active = false;
                p.life = 0;
                this.activeCount -= 1;
                continue;
            }
            // Normalized remaining life — the value the WebGL renderer
            // reads as an alpha base.
            p.life = 1 - p._age / p._lifeMax;
            if (p.life < 0) p.life = 0;
            else if (p.life > 1) p.life = 1;

            // Rings/flashes don't translate — their radius grows.
            // Sparks, embers, and debris integrate normally.
            if (p.kind === KIND_RING) {
                p.radius = p._age * p.expand;
            } else {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (p.kind === KIND_DEBRIS) {
                    p.rot += p.rotVel * dt;
                }
            }
        }
    }

    // Canvas2D fallback — used only when the WebGL particle renderer is
    // unavailable. Reads the legacy kind/expand/rot fields (still
    // maintained on every particle) and derives alpha from the
    // normalized `life`.
    draw(ctx, scale) {
        if (this.activeCount === 0) return;
        const pool = this.pool;
        const inv = 1 / scale;
        ctx.save();
        for (let i = 0; i < POOL_SIZE; i++) {
            const p = pool[i];
            if (!p.active) continue;
            ctx.globalAlpha = p.life > 0 ? p.life : 0;
            ctx.strokeStyle = p.color;

            if (p.kind === KIND_SPARK) {
                ctx.lineWidth = inv;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
                ctx.stroke();
            } else if (p.kind === KIND_RING) {
                const r = p.radius;
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
