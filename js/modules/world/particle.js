// Particle effects system
import { GAME_CONFIG } from '../core/constants.js';
import { random } from '../core/utils.js';
import { hsl } from '../core/color-cache.js';

const TS = GAME_CONFIG.TICK_SCALE; // Temporal scale factor for frame-based timers

export class Particle {
    constructor() {
        this.active = false;
    }
    
    reset(x, y, type, ...args) {
        this.x = x;
        this.y = y;
        this.active = true;
        this.type = type;
        
        switch (type) {
            case 'explosion':
                this.radius = random(1, 3);
                this.vel = { x: random(-5, 5), y: random(-5, 5) };
                this.life = 1;
                // Route through the cached hsl() helper — explosion bursts
                // spawn many particles with overlapping integer-quantized
                // hues, so the lookup hits ~30–60% of the time, saving the
                // template-literal allocation each spawn.
                this.color = hsl(random(0, 360), 100, 70);
                break;
                
            case 'playerExplosion':
                this.life = 1;
                this.radius = 0;
                this.maxRadius = 150;
                this.color = '#0ff';
                break;
                
            case 'thrust':
                const [angle] = args;
                const cols = ['#ff4500', '#ff8c00', '#ffa500'];
                this.color = cols[Math.floor(random(0, cols.length))];
                const a = angle + random(-0.26, 0.26);
                const s = random(2.5, 4.5);
                this.radius = random(1, 2.5);
                this.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
                this.life = 1;
                break;
                
            case 'phantom':
                const [color, radius] = args;
                this.color = color;
                this.radius = radius * 0.8;
                this.life = 0.5;
                this.vel = { x: 0, y: 0 };
                break;
                
            case 'pickupPulse':
                this.life = 1;
                this.radius = 0;
                this.maxRadius = 30;
                this.color = 'white';
                break;
                
            case 'starBlip':
                this.life = args[0] || 0.3;
                this.radius = args[1] || 3;
                this.maxRadius = this.radius * 2;
                this.color = '#FFD700';
                this.fadeRate = 0.1;
                this.growthRate = 0.2;
                break;
                
            case 'starSparkle':
                // 5.79.24 — radius + color now optional args so the orb
                //   shimmer (gold + bright blue) can reuse this type
                //   instead of inventing a new one. Defaults preserve
                //   the legacy "tiny gold spark" behavior.
                this.life = 0.4;
                this.radius = args[0] || 1;
                this.color = args[1] || '#FFD700';
                this.vel = { x: 0, y: 0 };
                break;
            case 'explosionPulse':
                this.life = 0.5;
                this.radius = 0;
                this.maxRadius = args[0] || 60;
                this.color = 'rgba(255,80,0,1)';
                break;
            case 'explosionRedOrange':
                this.radius = random(4, 8); // larger
                this.vel = { x: random(-5, 5), y: random(-5, 5) };
                this.life = random(0.7, 1.2); // longer-lived
                this.hue = random(10, 45); // wider fiery range
                this.sat = random(95, 100); // more saturated
                this.light = random(55, 70); // lighter
                break;
            case 'asteroidCollisionDebris':
                this.radius = random(2, 8); // More size variation
                const debrisSpeed = random(2, 6); // Initial speed
                const debrisAngle = random(0, Math.PI * 2);
                this.vel = { x: Math.cos(debrisAngle) * debrisSpeed, y: Math.sin(debrisAngle) * debrisSpeed };
                this.life = random(0.4, 0.8);
                const gray = Math.floor(random(80, 180));
                this.color = `rgb(${gray},${gray},${gray})`;
                break;
            case 'fieryExplosionRing':
                this.life = 0.9; // longer visible
                this.radius = 0;
                this.maxRadius = args[0] || 60;
                // Randomize start and end colors in red-orange range
                this.startHue = random(10, 20); // deeper red-orange
                this.endHue = random(25, 45);   // more orange
                this.sat = random(95, 100);     // more saturated
                this.light = random(55, 70);    // lighter
                break;
            case 'spawnRing':
                this.life = 1;
                this.radius = args[0] || 80;
                this.maxRadius = this.radius;
                this.color = 'rgba(0,255,255,0.7)';
                break;
            case 'spawnCircle':
                this.life = 1;
                this.radius = args[0] || 120;
                this.maxRadius = this.radius;
                this.colorStart = 'rgba(80,255,80,0.7)';
                this.colorEnd = 'rgba(0,80,0,0.2)';
                break;
            case 'spawnParticle': {
                // args: targetX, targetY, playerRef (renamed from tractorBeamParticle)
                const [targetX, targetY, playerRef] = args;
                this.targetX = targetX;
                this.targetY = targetY;
                this.playerRef = playerRef; // Store reference to player for dynamic tracking
                this.radius = random(1, 3);
                this.baseRadius = this.radius;
                this.life = 1;
                this.maxLife = 1;
                // Blue palette for richer neon effect
                const bluePalette = [
                    'rgba(0,200,255,1)', // neon blue
                    'rgba(0,120,255,1)', // deep blue
                    'rgba(0,180,255,1)', // cyan blue
                    'rgba(0,80,200,1)',  // rich blue
                    'rgba(40,120,255,1)', // electric blue
                    'rgba(0,255,255,1)'  // light blue
                ];
                this.color = bluePalette[Math.floor(random(0, bluePalette.length))];
                this.glowColor = this.color.replace(',1)', ',0.7)');
                this.neonColor = this.color.replace(',1)', ',0.5)');
                // Decrease speed: lower velocity multiplier
                this.vel = { x: (targetX - this.x) * random(0.02, 0.045), y: (targetY - this.y) * random(0.02, 0.045) };
                break;
            }
            
            case 'shieldHit':
                this.life = 0.4;
                this.radius = args[0] || 30; // Player radius
                this.maxRadius = this.radius * 1.5;
                this.color = 'rgba(0, 150, 255, 0.7)';
                break;

            // 'damageNumber' particle type removed in 5.64.8 — was a
            // duplicate of the createDamageNumber path in combat-manager.js
            // which renders through hud/combat.js with crit/isPlayerHit
            // styling.

            // ── Enhanced explosion types ──────────────────────────────
            case 'explosionFlash': {
                // Bright white core flash that expands and fades
                const [flashRadius] = args;
                this.life = 1.2;
                this.radius = (flashRadius || 40) * 0.3; // start visible (shows during hitstop)
                this.maxRadius = flashRadius || 40;
                this.color = '#ffffff';
                break;
            }
            case 'explosionShrapnel': {
                // Fast directional shrapnel piece in entity color
                const [shrapAngle, shrapSpeed, shrapColor] = args;
                const a2 = (shrapAngle || 0) + random(-0.3, 0.3);
                const sp = (shrapSpeed || 5) * random(0.7, 1.3);
                // Cache trig on the particle — angle and speed don't
                // change after init, so the draw path can skip
                // Math.cos/sin/hypot every frame.
                const ca = Math.cos(a2);
                const sa = Math.sin(a2);
                this.vel = { x: ca * sp, y: sa * sp };
                this.radius = random(1.5, 4);
                this.length = random(6, 16); // streak length
                this.life = random(0.6, 1.0);
                this.color = shrapColor || '#ff8800';
                this.angle = a2;
                this._cosA = ca;
                this._sinA = sa;
                this._speed = sp;
                break;
            }
            case 'explosionEmber': {
                // Short-lived glowing ember. Halved from the old 1.0-1.8s
                // life so embers cool and recycle through the pool faster
                // — keeps explosion afterglow brief and frees pool slots
                // for the next burst. Decay rate also bumped (0.009 →
                // 0.020) so the fade reads as "spark cooling" instead of
                // "lingering glow."
                const [emberColor] = args;
                const eAngle = random(0, Math.PI * 2);
                const eSpeed = random(0.3, 1.8);
                this.vel = { x: Math.cos(eAngle) * eSpeed, y: Math.sin(eAngle) * eSpeed };
                this.radius = random(1.2, 3.5);
                this.life = random(0.6, 1.0);
                this.color = emberColor || '#ffaa44';
                break;
            }
            case 'explosionRingColored': {
                // Expanding ring in a specific color
                const [ringRadius, ringColor] = args;
                this.life = 0.9;
                this.radius = (ringRadius || 50) * 0.15; // start partially visible
                this.maxRadius = ringRadius || 50;
                this.color = ringColor || '#ff8800';
                this.lineWidth = random(3, 8);
                break;
            }
        }
    }
    
    update() {
        if (!this.active) return;

        switch (this.type) {
            case 'explosion':
            case 'thrust':
            case 'phantom':
            case 'explosionRedOrange':
                this.x += (this.vel?.x || 0) * TS;
                this.y += (this.vel?.y || 0) * TS;
                this.life -= 0.04 * TS;
                if (this.type === 'explosionRedOrange') {
                    this.hue += random(-2, 2);
                }
                break;

            case 'phantom':
                this.life -= 0.05 * TS;
                break;

            case 'playerExplosion':
                this.life -= 0.02 * TS;
                this.radius = (1 - this.life ** 2) * this.maxRadius;
                break;

            case 'pickupPulse':
                this.life -= 0.04 * TS;
                this.radius = (1 - this.life) * this.maxRadius;
                break;

            case 'starBlip':
                this.life -= (this.fadeRate || 0.1) * TS;
                this.radius += (this.growthRate || 0.15) * this.radius * TS;
                if (this.radius > this.maxRadius) this.radius = this.maxRadius;
                break;

            case 'starSparkle':
                this.x += this.vel.x * TS;
                this.y += this.vel.y * TS;
                this.life -= 0.025 * TS;
                this.radius *= Math.pow(0.95, TS);
                break;
            case 'explosionPulse':
                this.life -= 0.06 * TS;
                this.radius = (1 - this.life) * this.maxRadius;
                break;
            case 'asteroidCollisionDebris':
                this.x += this.vel.x * TS;
                this.y += this.vel.y * TS;
                this.vel.x *= Math.pow(0.92, TS);
                this.vel.y *= Math.pow(0.92, TS);
                this.life -= 0.03 * TS;
                break;
            case 'fieryExplosionRing':
                this.radius = (1 - this.life) * this.maxRadius;
                this.life -= 0.025 * TS;
                break;
            case 'spawnRing':
                this.radius = this.maxRadius * this.life;
                this.life -= 0.06 * TS;
                break;
            case 'spawnCircle':
                this.radius = this.maxRadius * this.life;
                this.life -= 0.04 * TS;
                break;
            case 'spawnParticle': {
                if (this.playerRef && this.playerRef.active) {
                    this.targetX = this.playerRef.x;
                    this.targetY = this.playerRef.y;

                    const dx = this.targetX - this.x;
                    const dy = this.targetY - this.y;
                    const distance = Math.hypot(dx, dy);

                    if (distance > 1) {
                        const speed = random(0.02, 0.045) * TS;
                        this.vel.x = (dx / distance) * speed * distance;
                        this.vel.y = (dy / distance) * speed * distance;
                    }
                }

                this.x += this.vel.x;
                this.y += this.vel.y;
                this.life -= (0.04 + 0.02 * Math.random()) * TS;
                this.radius = this.baseRadius * this.life;
                break;
            }

            case 'shieldHit':
                this.life -= 0.05 * TS;
                this.radius += 2 * TS;
                break;

            // 'damageNumber' update path removed in 5.64.8 — see reset() above.

            case 'explosionFlash':
                this.life -= 0.06 * TS;
                this.radius = (1 - (this.life / 1.2) ** 2) * this.maxRadius;
                break;
            case 'explosionShrapnel':
                this.x += this.vel.x * TS;
                this.y += this.vel.y * TS;
                this.vel.x *= Math.pow(0.94, TS);
                this.vel.y *= Math.pow(0.94, TS);
                this.life -= 0.03 * TS;
                this.angle = Math.atan2(this.vel.y, this.vel.x);
                break;
            case 'explosionEmber':
                this.x += this.vel.x * TS;
                this.y += this.vel.y * TS;
                this.vel.x *= Math.pow(0.97, TS);
                this.vel.y *= Math.pow(0.97, TS);
                // Faster decay (0.009 → 0.020) so embers visibly cool
                // and recycle through the pool quickly — pairs with the
                // halved initial life in reset() above.
                this.life -= 0.020 * TS;
                break;
            case 'explosionRingColored':
                this.life -= 0.035 * TS;
                this.radius = (1 - this.life / 0.9) * this.maxRadius;
                break;
        }
        
        if (this.life <= 0) {
            this.active = false;
        }
    }
    
    draw(ctx) {
        if (!this.active) return;

        // Migrated to the WebGL particle renderer (see
        // js/modules/performance/webgl-particle-renderer.js):
        //   explosion, starSparkle, explosionFlash, explosionEmber,
        //   explosionShrapnel, explosionRingColored
        // drawParticlesBatched filters those out before calling draw(),
        // so this switch only handles types that stay on Canvas2D.

        const baseAlpha = Math.max(0, this.life);
        ctx.globalAlpha = baseAlpha;

        switch (this.type) {
            case 'thrust':
            case 'phantom':
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;
            case 'explosionRedOrange':
                ctx.fillStyle = hsl(this.hue, this.sat, this.light);
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;
            case 'explosionPulse':
                ctx.strokeStyle = 'rgba(255,80,0,0.7)';
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;

            case 'playerExplosion':
            case 'pickupPulse':
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;

            case 'starBlip':
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;

            case 'asteroidCollisionDebris':
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;
            case 'fieryExplosionRing': {
                const t = 1 - this.life / 0.9;
                const hue = this.startHue + (this.endHue - this.startHue) * t;
                ctx.globalAlpha = Math.max(0, this.life * 1.7);
                ctx.strokeStyle = hsl(hue, this.sat, this.light);
                ctx.lineWidth = 12 * (this.life + 0.2);
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;
            }
            case 'spawnRing':
                ctx.globalAlpha = Math.max(0, this.life * 1.2);
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 4 + 8 * this.life;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;
            case 'spawnCircle': {
                const t = 1 - this.life;
                const r1 = 80 + (0 - 80) * t;
                const g1 = 255 + (80 - 255) * t;
                const b1 = 80 + (0 - 80) * t;
                const a1 = 0.7 * this.life;
                ctx.strokeStyle = `rgba(${r1},${g1},${b1},${a1})`;
                ctx.lineWidth = 6 + 10 * this.life;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;
            }
            case 'spawnParticle': {
                ctx.globalAlpha = Math.max(0, this.life);
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;
            }

            case 'shieldHit':
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;

            // 'damageNumber' draw path removed in 5.64.8 — see reset() above.
        }

        ctx.globalAlpha = 1;
    }
}

/**
 * Single-pass Canvas2D draw for unmigrated particle types.
 *
 * Bright/glowing particles (embers, flashes, sparkles, classic explosion
 * fragments, shrapnel streaks, expanding rings) render via the WebGL
 * particle layer underneath gameCanvas — see WebGLParticleRenderer.
 * When a renderer is provided, this function skips any type that
 * `renderer.handlesType()` claims; the result is just shape-only and
 * text particles (rings, debris, damage numbers, etc.) which all use
 * the default `source-over` composite mode.
 *
 * If the renderer is null/undefined (Canvas2D-only fallback when WebGL
 * isn't available), every particle type falls through to its draw()
 * branch.
 */
export function drawParticlesBatched(pool, ctx, viewLeft, viewTop, viewRight, viewBottom, renderer) {
    const list = pool.activeObjects;
    const skipFn = renderer && renderer.supported && !renderer._contextLost
        ? renderer.handlesType.bind(renderer)
        : null;
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.active) continue;
        if (skipFn && skipFn(p.type)) continue;
        const r = p.radius || 10;
        if (p.x + r < viewLeft || p.x - r > viewRight ||
            p.y + r < viewTop  || p.y - r > viewBottom) continue;
        p.draw(ctx);
    }
}
