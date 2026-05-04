// Particle effects system
import { GAME_CONFIG } from '../core/constants.js';
import { random, glowSpriteCache, radialGradientSpriteCache } from '../core/utils.js';
import { hsl } from '../core/color-cache.js';

const TS = GAME_CONFIG.TICK_SCALE; // Temporal scale factor for frame-based timers

// Pre-built font strings for hot text-rendering paths — avoids reallocating
// the same template-literal once per particle per frame.
const DAMAGE_NUMBER_FONT = "16px 'Press Start 2P', monospace";

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
                this.color = `hsl(${random(0, 360)}, 100%, 70%)`;
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
                this.life = 0.4;
                this.radius = 1;
                this.color = '#FFD700';
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

            case 'damageNumber':
                const [damage] = args;
                this.damage = damage;
                this.life = 1;
                this.vel = { x: random(-0.5, 0.5), y: -2 }; // Float upward
                this.fontSize = 16;
                break;

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
                this.vel = { x: Math.cos(a2) * sp, y: Math.sin(a2) * sp };
                this.radius = random(1.5, 4);
                this.length = random(6, 16); // streak length
                this.life = random(0.6, 1.0);
                this.color = shrapColor || '#ff8800';
                this.angle = a2;
                break;
            }
            case 'explosionEmber': {
                // Slow-drifting glowing ember that lingers
                const [emberColor] = args;
                const eAngle = random(0, Math.PI * 2);
                const eSpeed = random(0.3, 1.8);
                this.vel = { x: Math.cos(eAngle) * eSpeed, y: Math.sin(eAngle) * eSpeed };
                this.radius = random(1.2, 3.5);
                this.life = random(1.0, 1.8);
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

            case 'damageNumber':
                this.x += this.vel.x * TS;
                this.y += this.vel.y * TS;
                this.vel.y += 0.1 * TS;
                this.life -= 0.00625 * TS;
                break;

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
                // Slower decay so embers linger longer and feel like they
                // are cooling rather than just flickering out.
                this.life -= 0.009 * TS;
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

        // OPT: Instead of save/restore for every particle, we manually set and
        // reset only the properties that change.  With 50+ active particles this
        // eliminates 50-100 save/restore pairs per frame.
        const baseAlpha = Math.max(0, this.life);
        ctx.globalAlpha = baseAlpha;
        // Track what we need to reset after the switch
        let changedComposite = false;
        let changedLineCap = false;

        switch (this.type) {
            case 'explosion':
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
                // Simplified rendering without expensive shadow effects
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;

            case 'starSparkle':
                // OPT-2: use pre-rendered glow sprites instead of live ctx.shadowBlur
                if (this.radius > 0.05) {
                    // glowSpriteCache.draw manages its own alpha internally
                    glowSpriteCache.draw(ctx, this.x, this.y, this.color, this.radius, this.radius * 4, Math.max(0, this.life * 2.5));
                    glowSpriteCache.draw(ctx, this.x, this.y, '#FFFFAA', this.radius * 0.6, this.radius * 2, Math.max(0, this.life * 3));
                }
                break;
            case 'asteroidCollisionDebris':
                // globalAlpha already set to baseAlpha above
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;
            case 'fieryExplosionRing': {
                // Animate hue from start to end
                const t = 1 - this.life / 0.9;
                const hue = this.startHue + (this.endHue - this.startHue) * t;
                ctx.globalAlpha = Math.max(0, this.life * 1.7); // higher alpha
                ctx.strokeStyle = hsl(hue, this.sat, this.light);
                ctx.lineWidth = 12 * (this.life + 0.2); // thicker ring
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
                // Interpolate color from bright to dark green
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
                // Draw main glowing particle only (no trail)
                ctx.globalAlpha = Math.max(0, this.life);
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.fill();
                break;
            }

            case 'shieldHit':
                // Simplified rendering without expensive shadow effects
                ctx.strokeStyle = this.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;

            case 'damageNumber':
                ctx.font = DAMAGE_NUMBER_FONT;
                ctx.fillStyle = '#ff0000';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = Math.max(0, this.life);
                // Draw black outline
                ctx.strokeText(`${this.damage}`, this.x, this.y);
                // Draw red text
                ctx.fillText(`${this.damage}`, this.x, this.y);
                break;

            case 'explosionFlash': {
                // Composite handled by `drawParticlesBatched` (pass 2 sets
                // 'screen' once for ALL screen-blend particles, instead of
                // per-particle toggles). If draw() is called outside the
                // batched path, screen blending is missing — caller must
                // wrap. All in-game callers go through drawParticlesBatched.
                const flashLife = Math.max(0, this.life / 1.2);
                const eased = flashLife * flashLife * Math.sqrt(flashLife); // ~life^1.5
                ctx.globalAlpha = eased * 0.55;
                const sprite = radialGradientSpriteCache.get('flash-default');
                if (sprite) {
                    const r = this.radius;
                    ctx.drawImage(sprite, this.x - r, this.y - r, r * 2, r * 2);
                }
                break;
            }

            case 'explosionShrapnel': {
                // Directional streak — line from position in movement direction
                const speed = Math.hypot(this.vel.x, this.vel.y);
                const streakLen = Math.min(this.length, speed * 3);
                const tailX = this.x - Math.cos(this.angle) * streakLen;
                const tailY = this.y - Math.sin(this.angle) * streakLen;
                ctx.strokeStyle = this.color;
                ctx.lineWidth = this.radius;
                ctx.lineCap = 'round';
                changedLineCap = true;
                ctx.beginPath();
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(this.x, this.y);
                ctx.stroke();
                // Bright head dot
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = Math.max(0, this.life * 0.8);
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
                ctx.fill();
                break;
            }

            case 'explosionEmber': {
                // Composite handled by `drawParticlesBatched` — see the
                // explosionFlash note above. One drawImage per particle,
                // sprite cached per (color, radius, blur) tuple via the
                // existing glowSpriteCache.
                const aLife = Math.max(0, this.life);
                const softA = Math.pow(aLife, 0.55);
                glowSpriteCache.draw(ctx, this.x, this.y, this.color, this.radius, 8, softA);
                break;
            }

            case 'explosionRingColored':
                ctx.globalAlpha = Math.max(0, this.life * 1.5);
                ctx.strokeStyle = this.color;
                ctx.lineWidth = this.lineWidth * this.life;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.stroke();
                break;
        }

        // Reset changed properties instead of full restore
        ctx.globalAlpha = 1;
        if (changedComposite) ctx.globalCompositeOperation = 'source-over';
        if (changedLineCap) ctx.lineCap = 'butt';
    }
}

// Particle types that render with `globalCompositeOperation = 'screen'`.
// Used by drawParticlesBatched to bucket particles into two passes so
// the composite mode flips at most once per frame rather than once per
// particle. Both flash and ember are sprite-based now (5.60.0) so they
// only need one composite toggle for the whole bucket.
const SCREEN_BLEND_TYPES = new Set(['explosionFlash', 'explosionEmber']);

/**
 * Two-pass batched draw for the particle pool.
 *   Pass 1: every non-screen-blend particle. Composite stays 'source-over'
 *           (the canvas default), so no per-particle toggling.
 *   Pass 2: every screen-blend particle. Composite is set to 'screen'
 *           ONCE before the loop and reset ONCE after.
 *
 * Net effect: 2 composite-mode changes per frame instead of N (where N
 * is the active screen-blend particle count, currently 30-100 in late
 * waves). Each composite-mode change in Canvas2D forces a render-state
 * flush, so this saves real GPU time in dense scenes.
 */
export function drawParticlesBatched(pool, ctx, viewLeft, viewTop, viewRight, viewBottom) {
    const list = pool.activeObjects;
    // Pass 1 — opaque/source-over particles.
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.active) continue;
        if (SCREEN_BLEND_TYPES.has(p.type)) continue;
        const r = p.radius || 10;
        if (p.x + r < viewLeft || p.x - r > viewRight ||
            p.y + r < viewTop  || p.y - r > viewBottom) continue;
        p.draw(ctx);
    }
    // Pass 2 — additive (screen-blend) particles. Composite set once.
    let pass2Started = false;
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.active) continue;
        if (!SCREEN_BLEND_TYPES.has(p.type)) continue;
        const r = p.radius || 10;
        if (p.x + r < viewLeft || p.x - r > viewRight ||
            p.y + r < viewTop  || p.y - r > viewBottom) continue;
        if (!pass2Started) {
            ctx.globalCompositeOperation = 'screen';
            pass2Started = true;
        }
        p.draw(ctx);
    }
    if (pass2Started) ctx.globalCompositeOperation = 'source-over';
}
