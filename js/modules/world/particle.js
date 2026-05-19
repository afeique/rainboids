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
                // Bright core flash that expands and fades. Optional color
                // (default white) lets enemy explosions stack chromatic
                // flashes (white + yellow + enemy-color) for depth.
                const [flashRadius, flashColor] = args;
                this.life = 1.2;
                this.radius = (flashRadius || 40) * 0.3; // start visible (shows during hitstop)
                this.maxRadius = flashRadius || 40;
                this.color = flashColor || '#ffffff';
                break;
            }
            case 'enemyPlasmaCore': {
                // Hot fireball core — bright, big, and lingers. Sits at the
                // explosion's center as a defined hot blob so the death
                // event reads as "ship vaporized into plasma" instead of
                // "rings + scatter." Renders through the flash atlas slot
                // in WebGL with a longer life + stronger alpha curve so
                // the core stays bright into mid-life.
                const [coreRadius, coreColor] = args;
                this.life = 1.8;          // ~30 frames @ 60Hz — lingers past the ring expansion
                this.maxLife = 1.8;
                this.radius = (coreRadius || 60) * 0.55;  // starts big (already a fireball)
                this.maxRadius = coreRadius || 60;
                this.color = coreColor || '#ffcc44';
                break;
            }
            case 'enemyShockwave': {
                // Massive expanding shockwave — wider quad, slower decay,
                // thicker stroke than `explosionRingColored`. One per
                // explosion; reads as the pressure-front of the blast.
                const [waveRadius, waveColor] = args;
                this.life = 1.4;          // ~23 frames; slower than the chromatic rings
                this.maxLife = 1.4;
                this.radius = (waveRadius || 80) * 0.25;
                this.maxRadius = waveRadius || 80;
                this.color = waveColor || '#ff8855';
                this.lineWidth = random(8, 14);
                break;
            }
            case 'enemyLightning': {
                // Jagged radial bolt from the explosion center. Renders via
                // Canvas2D — a procedural polyline with random offsets per
                // segment. Stored once at spawn; redrawn each frame with a
                // fading alpha. Very short-lived (~6 frames) for a crackle
                // effect.
                const [boltAngle, boltLength, boltColor] = args;
                this.life = 0.45;
                this.maxLife = 0.45;
                this.angle = boltAngle || 0;
                this.length = boltLength || 80;
                this.color = boltColor || '#ffffff';
                this.lineWidth = random(1.5, 3.5);
                // Build the jagged path once: 5 segments with perpendicular jitter.
                const segs = 5;
                this._pts = new Array(segs + 1);
                const cx = Math.cos(this.angle);
                const cy = Math.sin(this.angle);
                const px = -cy; // perp
                const py =  cx;
                for (let i = 0; i <= segs; i++) {
                    const t = i / segs;
                    const baseLen = this.length * t;
                    const jitter = i === 0 || i === segs ? 0 : random(-this.length * 0.18, this.length * 0.18);
                    this._pts[i] = {
                        x: this.x + cx * baseLen + px * jitter,
                        y: this.y + cy * baseLen + py * jitter,
                    };
                }
                // Bolt itself doesn't move; radius used for cull only.
                this.radius = this.length;
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

            // Phase 5 (2026-05-19) — Mine plasma shield crossing flash.
            //   Bright cyan sparkle that fires once when the player crosses
            //   into an armed mine's shield zone. Small, short-lived
            //   (0.4s), Canvas2D only — fired infrequently so a dedicated
            //   WebGL atlas entry isn't worth the complexity. Reset takes
            //   (x, y, color) per the design doc; defaults to plasma blue.
            case 'mineShieldCrossing': {
                const [crossColor] = args;
                this.life = 0.4;
                this.maxLife = 0.4;
                this.radius = 6;
                this.maxRadius = 22;
                this.color = crossColor || '#5cc8ff';
                this.vel = { x: 0, y: 0 };
                break;
            }

            // ── Phase 3 status-effect particles ────────────────────────
            // BRN / STUN visual feedback. Canvas2D-only (no WebGL atlas
            // entry — these spawn at most ~30/sec across the whole field
            // and don't justify the renderer complexity). status-icons.js
            // (HUD overlay) walks the enemy pool every frame and respawns
            // these while the effect is active; each particle is
            // short-lived so respawn cadence drives perceived density.
            case 'burnFlame': {
                // Tiny flickering flame attached to an enemy. Rises with
                // small horizontal jitter so a cluster reads as "this
                // thing is on fire." Two-color sample (orange core vs.
                // yellow tip) gives the flame perceptible flicker even
                // with one frame per particle.
                // args: [flameColor?]
                const [flameColor] = args;
                this.life = 0.5;
                this.maxLife = 0.5;
                this.radius = random(1.6, 3.2);
                this.vel = {
                    x: random(-0.35, 0.35),
                    y: random(-1.4, -0.7),
                };
                this.color = flameColor || (Math.random() < 0.6 ? '#ff7722' : '#ffcc44');
                break;
            }
            case 'stunArc': {
                // Short electric-blue arc above a stunned enemy.
                // Procedural 4-segment polyline with perpendicular jitter
                // — same idea as the larger `enemyLightning` bolt but
                // smaller and shorter-lived. The path is pre-baked at
                // reset so the draw path is just a stroke.
                // args: [arcLength?, arcAngle?]
                const [arcLength, arcAngle] = args;
                this.life = 0.3;
                this.maxLife = 0.3;
                this.length = arcLength || random(10, 20);
                this.angle = arcAngle !== undefined ? arcAngle : random(0, Math.PI * 2);
                this.color = '#88ddff';
                this.lineWidth = random(1.0, 2.0);
                const segs = 4;
                this._pts = new Array(segs + 1);
                const cx = Math.cos(this.angle);
                const cy = Math.sin(this.angle);
                const px = -cy;
                const py =  cx;
                for (let i = 0; i <= segs; i++) {
                    const t = i / segs;
                    const baseLen = this.length * t;
                    const jitter = i === 0 || i === segs
                        ? 0
                        : random(-this.length * 0.3, this.length * 0.3);
                    this._pts[i] = {
                        x: this.x + cx * baseLen + px * jitter,
                        y: this.y + cy * baseLen + py * jitter,
                    };
                }
                this.radius = this.length;
                this.vel = { x: 0, y: 0 };
                break;
            }

            // Phase 4 (2026-05-19) — Nova Chain Reaction connector arc.
            //   White energy bolt drawn between a killed enemy's position
            //   and the secondary Nova that spawned at it. Reuses the
            //   stunArc / mineShieldCrossing structural template: a
            //   pre-baked polyline + alpha decay over a short window.
            //   Reset takes (targetX, targetY, color?). Slightly longer
            //   life than stunArc (0.25s) so the eye reads the spatial
            //   link between detonations.
            //   args: [targetX, targetY, color?]
            case 'novaChainArc': {
                const [targetX, targetY, arcColor] = args;
                this.life = 0.25;
                this.maxLife = 0.25;
                const tx = targetX != null ? targetX : this.x;
                const ty = targetY != null ? targetY : this.y;
                this.color = arcColor || '#ffffff';
                this.lineWidth = random(1.4, 2.4);
                // Pre-bake a 5-segment jagged polyline from (x,y) to (tx,ty).
                const segs = 5;
                this._pts = new Array(segs + 1);
                const dx = tx - this.x;
                const dy = ty - this.y;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                // Perpendicular axis for jitter (rotate (ux,uy) 90°).
                const px = -uy;
                const py =  ux;
                // Jitter magnitude scales with length so a long arc has
                // proportionally visible zigzag.
                const jitterMag = Math.min(18, len * 0.18);
                for (let i = 0; i <= segs; i++) {
                    const t = i / segs;
                    const baseX = this.x + ux * len * t;
                    const baseY = this.y + uy * len * t;
                    const jitter = i === 0 || i === segs
                        ? 0
                        : random(-jitterMag, jitterMag);
                    this._pts[i] = {
                        x: baseX + px * jitter,
                        y: baseY + py * jitter,
                    };
                }
                // Radius is only used for culling — set to span half the
                // arc length so the bolt never gets culled mid-way.
                this.radius = len * 0.5;
                this.vel = { x: 0, y: 0 };
                break;
            }

            // ── Phase 6 (2026-05-19) Cluster Launcher particles ─────────
            // `clusterPulse` — expanding red/white ring that respawns
            //   every few ticks while a cluster bomb is armed. Reads as
            //   the bomb "breathing" — visual warning that detonation is
            //   imminent. Short life (~0.25s) so each pulse fades fast.
            // `clusterTrail` — small dim smoke trail behind the bomb
            //   while traveling. Shrinks + fades quickly.
            case 'clusterPulse': {
                this.life = 0.25;
                this.maxLife = 0.25;
                this.radius = 8;
                this.maxRadius = 28;
                this.color = '#ff4422';
                this.vel = { x: 0, y: 0 };
                break;
            }
            case 'clusterTrail': {
                this.life = 0.4;
                this.maxLife = 0.4;
                this.radius = random(1.8, 3.0);
                this.vel = {
                    x: random(-0.3, 0.3),
                    y: random(-0.3, 0.3),
                };
                this.color = Math.random() < 0.4 ? '#aaaaaa' : '#555555';
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
            case 'enemyPlasmaCore': {
                // Stronger pulse: rapid expansion in the first third, then
                // slow swell to maxRadius. Eased so the core "breathes."
                this.life -= 0.033 * TS;
                const t = 1 - (this.life / this.maxLife);
                // Cubic-out for the size — punchy initial pop, then settle.
                const tt = 1 - Math.pow(1 - t, 3);
                this.radius = this.maxRadius * (0.55 + 0.45 * tt);
                break;
            }
            case 'enemyShockwave':
                this.life -= 0.024 * TS;
                this.radius = (1 - this.life / this.maxLife) * this.maxRadius;
                break;
            case 'enemyLightning':
                // Bolt is static — only life drains. Drawn each frame.
                this.life -= 0.18 * TS;
                break;

            // Phase 5 (2026-05-19) — Crossing-flash sparkle expands +
            //   fades. Eased radius growth so the burst pops fast then
            //   tapers. Drain rate matches the starSparkle pattern
            //   (which targets ~0.4s wall-clock lifetime under the
            //   TS=0.5 logic-tick scaling).
            case 'mineShieldCrossing': {
                this.life -= 0.025 * TS;
                const t = 1 - Math.max(0, this.life / this.maxLife);
                // Cubic-out radius growth: punchy initial pop, then tapers.
                this.radius = 6 + (this.maxRadius - 6) * (1 - Math.pow(1 - t, 3));
                break;
            }

            // Phase 3 status particles.
            case 'burnFlame':
                // Rise + jitter + gentle shrink as the flame "burns out."
                // Decay 0.033/tick → ~30 ticks ≈ 0.5s wall-clock at TS=0.5.
                this.x += this.vel.x * TS;
                this.y += this.vel.y * TS;
                // Add small per-frame horizontal jitter so the flame
                // dances rather than rising on a straight line.
                this.vel.x += random(-0.08, 0.08);
                // Gentle vertical deceleration so the flame slows as it
                // rises (looks more like fire than smoke).
                this.vel.y *= Math.pow(0.96, TS);
                this.life -= 0.033 * TS;
                this.radius *= Math.pow(0.95, TS);
                break;
            case 'stunArc':
                // Static bolt — only life drains. Decay 0.055/tick →
                // ~18 ticks ≈ 0.3s wall-clock at TS=0.5.
                this.life -= 0.055 * TS;
                break;
            case 'novaChainArc':
                // Phase 4 — static chain-reaction arc; only life drains.
                // Decay 0.066/tick → ~15 ticks ≈ 0.25s wall-clock at TS=0.5.
                this.life -= 0.066 * TS;
                break;

            // Phase 6 — Cluster Launcher particles.
            case 'clusterPulse': {
                // Pulsing ring grows + fades. Decay 0.04/tick → ~25
                // ticks ≈ 0.25s wall-clock at TS=0.5.
                this.life -= 0.04 * TS;
                const t = 1 - Math.max(0, this.life / (this.maxLife || 0.25));
                // Quadratic-out radius growth.
                this.radius = 8 + (this.maxRadius - 8) * (1 - (1 - t) * (1 - t));
                break;
            }
            case 'clusterTrail':
                this.x += this.vel.x * TS;
                this.y += this.vel.y * TS;
                // Smoke trail dissipates over ~0.4s.
                this.life -= 0.025 * TS;
                this.radius *= Math.pow(0.97, TS);
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

            case 'enemyShockwave': {
                // Thick, fading expanding ring with a hot inner highlight.
                // Two-pass stroke gives a defined pressure-front edge.
                const t = 1 - (this.life / this.maxLife);
                const alpha = Math.max(0, this.life / this.maxLife);
                ctx.globalAlpha = alpha * 0.85;
                ctx.strokeStyle = this.color;
                ctx.lineWidth = this.lineWidth * (1 - t * 0.5);
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
                ctx.stroke();
                // Inner hot highlight — narrower, brighter, sits inside the wave.
                ctx.globalAlpha = alpha * 0.7;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = Math.max(1, this.lineWidth * 0.3);
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.97, 0, 2 * Math.PI);
                ctx.stroke();
                break;
            }

            case 'enemyLightning': {
                // Jagged polyline rendered with a bright white core + colored
                // glow. Pre-baked points so each frame is just a path draw.
                if (!this._pts || this._pts.length < 2) break;
                const alpha = Math.max(0, this.life / this.maxLife);
                // Outer colored glow
                ctx.globalAlpha = alpha * 0.85;
                ctx.strokeStyle = this.color;
                ctx.lineWidth = this.lineWidth + 2.5;
                ctx.beginPath();
                ctx.moveTo(this._pts[0].x, this._pts[0].y);
                for (let i = 1; i < this._pts.length; i++) {
                    ctx.lineTo(this._pts[i].x, this._pts[i].y);
                }
                ctx.stroke();
                // Bright white core
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = this.lineWidth;
                ctx.beginPath();
                ctx.moveTo(this._pts[0].x, this._pts[0].y);
                for (let i = 1; i < this._pts.length; i++) {
                    ctx.lineTo(this._pts[i].x, this._pts[i].y);
                }
                ctx.stroke();
                break;
            }

            // Phase 5 (2026-05-19) — Mine shield crossing flash. Bright
            //   cyan sparkle: outer additive halo + crisp inner core.
            //   Alpha tied to remaining life so the flash fades cleanly
            //   after ~0.4s. globalCompositeOperation 'lighter' makes
            //   the halo bloom into the starfield without obscuring it.
            case 'mineShieldCrossing': {
                const lifeFrac = Math.max(0, this.life / (this.maxLife || 0.4));
                const prevComp = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                // Outer halo
                ctx.globalAlpha = lifeFrac * 0.7;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
                // Bright white core
                ctx.globalAlpha = lifeFrac;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.35, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = prevComp;
                break;
            }

            // ── Phase 3 status particles ───────────────────────────────
            case 'burnFlame': {
                // Additive small filled circle — fire-orange or yellow
                // depending on which color was sampled at reset. Two-pass
                // (outer glow + inner brighter core) sells the heat.
                const lifeFrac = Math.max(0, this.life / (this.maxLife || 0.5));
                const prevComp = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = lifeFrac * 0.85;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = lifeFrac;
                ctx.fillStyle = '#fff2a8';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.45, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalCompositeOperation = prevComp;
                break;
            }
            case 'stunArc': {
                // Electric-blue zigzag with bright core. Reuses the
                // pre-baked polyline from reset(). Additive composite so
                // it pops over the enemy silhouette.
                if (!this._pts || this._pts.length < 2) break;
                const lifeFrac = Math.max(0, this.life / (this.maxLife || 0.3));
                const prevComp = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                // Colored glow pass.
                ctx.globalAlpha = lifeFrac * 0.8;
                ctx.strokeStyle = this.color;
                ctx.lineWidth = this.lineWidth + 1.2;
                ctx.beginPath();
                ctx.moveTo(this._pts[0].x, this._pts[0].y);
                for (let i = 1; i < this._pts.length; i++) {
                    ctx.lineTo(this._pts[i].x, this._pts[i].y);
                }
                ctx.stroke();
                // White core.
                ctx.globalAlpha = lifeFrac;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = this.lineWidth;
                ctx.beginPath();
                ctx.moveTo(this._pts[0].x, this._pts[0].y);
                for (let i = 1; i < this._pts.length; i++) {
                    ctx.lineTo(this._pts[i].x, this._pts[i].y);
                }
                ctx.stroke();
                ctx.globalCompositeOperation = prevComp;
                break;
            }

            // Phase 4 (2026-05-19) — Nova Chain Reaction arc draw.
            //   Two-pass additive stroke (warm orange glow + white core)
            //   so the link reads as a Nova-flavored energy bolt rather
            //   than a generic electric arc. Same polyline structure as
            //   stunArc above — only the colors + line widths differ.
            case 'novaChainArc': {
                if (!this._pts || this._pts.length < 2) break;
                const lifeFrac = Math.max(0, this.life / (this.maxLife || 0.25));
                const prevComp = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                // Warm glow pass — wider, semi-transparent.
                ctx.globalAlpha = lifeFrac * 0.7;
                ctx.strokeStyle = '#ffaa66';
                ctx.lineWidth = this.lineWidth + 2.5;
                ctx.beginPath();
                ctx.moveTo(this._pts[0].x, this._pts[0].y);
                for (let i = 1; i < this._pts.length; i++) {
                    ctx.lineTo(this._pts[i].x, this._pts[i].y);
                }
                ctx.stroke();
                // White core — sharp.
                ctx.globalAlpha = lifeFrac;
                ctx.strokeStyle = this.color || '#ffffff';
                ctx.lineWidth = this.lineWidth;
                ctx.beginPath();
                ctx.moveTo(this._pts[0].x, this._pts[0].y);
                for (let i = 1; i < this._pts.length; i++) {
                    ctx.lineTo(this._pts[i].x, this._pts[i].y);
                }
                ctx.stroke();
                ctx.globalCompositeOperation = prevComp;
                break;
            }

            // Phase 6 (2026-05-19) — Cluster Launcher particles.
            //   clusterPulse: red glowing ring (additive) with white core,
            //     reads as the bomb pulsing while armed.
            //   clusterTrail: small fading smoke dot left behind the bomb
            //     while traveling.
            case 'clusterPulse': {
                const lifeFrac = Math.max(0, this.life / (this.maxLife || 0.25));
                const prevComp = ctx.globalCompositeOperation;
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = lifeFrac * 0.7;
                ctx.strokeStyle = this.color || '#ff4422';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.stroke();
                // White inner ring — bright core that pops the pulse.
                ctx.globalAlpha = lifeFrac;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalCompositeOperation = prevComp;
                break;
            }
            case 'clusterTrail': {
                const lifeFrac = Math.max(0, this.life / (this.maxLife || 0.4));
                ctx.globalAlpha = lifeFrac * 0.6;
                ctx.fillStyle = this.color || '#888888';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
                break;
            }

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
