// Asteroid entity with 3D wireframe rendering
import { GAME_CONFIG } from '../core/constants.js';
import { random, GameDimensions, glowSpriteCache } from '../core/utils.js';
import { frameClock } from '../core/frame-clock.js';
import { hsl } from '../core/color-cache.js';
const DEBRIS_COUNT = 5;

// ── Shared sin/cos lookup table ──────────────────────────────────────────
// 1024 entries ≈ 0.35° precision — imperceptible for tumbling rocks,
// eliminates 6 trig calls per asteroid per frame.
const TRIG_N = 1024;
const TRIG_SCALE = TRIG_N / (Math.PI * 2);
const SIN_LUT = new Float64Array(TRIG_N);
const COS_LUT = new Float64Array(TRIG_N);
for (let i = 0; i < TRIG_N; i++) {
    const a = (i / TRIG_N) * Math.PI * 2;
    SIN_LUT[i] = Math.sin(a);
    COS_LUT[i] = Math.cos(a);
}
function lutIndex(rad) {
    return ((rad * TRIG_SCALE) % TRIG_N + TRIG_N) & (TRIG_N - 1);
}


export class Asteroid {
    constructor(x, y, radius, level = 1) {
        this.fov = 300;
        
        // Define edges for wireframe (only set once in constructor)
        this.edges = [
            [0,1],[0,5],[0,7],[0,10],[0,11],[1,5],[1,7],[1,8],[1,9],
            [2,3],[2,4],[2,6],[2,10],[2,11],[3,4],[3,6],[3,8],[3,9],
            [4,5],[4,9],[4,11],[5,9],[5,11],[6,7],[6,8],[6,10],
            [7,8],[7,10],[8,9],[10,11]
        ];

        // OPT: Pre-allocate bucket arrays for drawAsteroidShape — reused every frame
        this._BUCKETS = 5;
        this._bucketEdges = new Array(this._BUCKETS);
        for (let i = 0; i < this._BUCKETS; i++) this._bucketEdges[i] = [];
        this._bucketHue   = new Float64Array(this._BUCKETS);
        this._bucketCount = new Uint8Array(this._BUCKETS);
        
        this.initializeAsteroid(x, y, radius, level);
    }
    
    // Helper method to initialize/reset asteroid properties
    initializeAsteroid(x, y, radius, level = 1, gameEngine = null) {
        this.level = level;
        // Use gameField dimensions if available, otherwise fall back to screen dimensions
        const fieldWidth = GameDimensions.width;
        const fieldHeight = GameDimensions.height;
        
        this.x = x !== undefined ? x : random(0, fieldWidth);
        this.y = y !== undefined ? y : random(0, fieldHeight);
        this.vel = {
            x: random(-GAME_CONFIG.AST_SPEED, GAME_CONFIG.AST_SPEED) || 0.2,
            y: random(-GAME_CONFIG.AST_SPEED, GAME_CONFIG.AST_SPEED) || 0.2
        };
        
        this.rot3D = { x: 0, y: 0, z: 0 };
        this.rotVel3D = {
            x: random(-0.04, 0.04),
            y: random(-0.04, 0.04),
            z: random(-0.04, 0.04)
        };
        
        this.active = true;
        this.creationTime = Date.now();

        // Unique color palette per asteroid
        // Hue range: teal/cyan/blue-violet family (150-280°) with occasional gold (40-60°)
        // Matches nebula + player ship palette for stylistic consistency
        this.baseHue = Math.random() < 0.2
            ? 40 + Math.random() * 20            // 20%: warm gold (40-60°)
            : 150 + Math.random() * 130;          // 80%: teal→cyan→blue→violet (150-280°)
        this.hueSpread = 30 + Math.random() * 70;     // 30-100° spread (tighter than before)
        this.hueCycleSpeed = 10 + Math.random() * 20;  // how fast the hue shifts (ms divisor)
        this.saturation = 80 + Math.random() * 15;    // 80-95%
        this.lightness = 65 + Math.random() * 15;     // 65-80%
        
        this.rescale(radius || random(30, 60));

        // Calculate health based on size tiers and level:
        // Use baseRadius for consistent health calculation
        let baseHealth;
        let health;
        const sizeRef = this.baseRadius || this.radius;
        
        // Health scales with size — fragments are weaker so waves clear faster.
        // Roughly halved from previous values so early waves don't slog.
        if (sizeRef >= 40) {
            baseHealth = Math.floor(5 + (sizeRef - 40) / 20 * 4);  // 5-9   (was 10-18)
        } else if (sizeRef >= 20) {
            baseHealth = Math.floor(2 + (sizeRef - 20) / 20 * 3);  // 2-5   (was 4-10)
        } else {
            baseHealth = Math.floor(1 + (sizeRef - 5) / 15 * 2);   // 1-3   (was 2-5)
        }

        // Level scaling: +25% per level beyond 1
        const levelMultiplier = 1 + (this.level - 1) * 0.25;
        health = Math.round(baseHealth * levelMultiplier);
        
        this.maxHealth = Math.max(1, health); // Ensure minimum 1 health
        this.health = this.maxHealth;
    }
    
    // Get level-scaled collision damage for asteroid impacts
    getLevelScaledCollisionDamage(baseDamage) {
        const levelMultiplier = 1 + (this.level - 1) * 0.2; // 20% damage increase per level
        return Math.round(baseDamage * levelMultiplier);
    }

    reset(x, y, radius, level = 1, gameEngine = null) {
        this.initializeAsteroid(x, y, radius, level, gameEngine);
    }

    rescale(newBaseRadius) {
        let scale = 1;
        this.baseRadius = newBaseRadius * scale;
        
        // Create dodecahedron vertices
        const t = (1 + Math.sqrt(5)) / 2;
        const pts = [
            [-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],
            [0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]
        ];
        
        this.vertices3D = pts.map(v => {
            const d = 1 + random(-0.25, 0.25);
            return {
                x: v[0] * this.baseRadius * d,
                y: v[1] * this.baseRadius * d,
                z: v[2] * this.baseRadius * d
            };
        });
        
        // Calculate radius and mass
        let minR = Infinity, maxR = 0;
        this.vertices3D.forEach(v => {
            const d = Math.hypot(v.x, v.y, v.z);
            if (d < minR) minR = d;
            if (d > maxR) maxR = d;
        });
        
        this.radius = (minR + maxR) / 2;
        this.mass = (4 / 3) * Math.PI * Math.pow(this.radius, 3);
        
        this.project();
    }
    
    project() {
        // LUT-based trig — 6 table lookups instead of 6 Math.sin/cos calls
        const ix = lutIndex(this.rot3D.x), iy = lutIndex(this.rot3D.y), iz = lutIndex(this.rot3D.z);
        const cosX = COS_LUT[ix], sinX = SIN_LUT[ix];
        const cosY = COS_LUT[iy], sinY = SIN_LUT[iy];
        const cosZ = COS_LUT[iz], sinZ = SIN_LUT[iz];

        const verts = this.vertices3D;
        const fov = this.fov;

        // Re-use existing array — no allocation after first call
        if (!this.projectedVertices || this.projectedVertices.length !== verts.length) {
            this.projectedVertices = new Array(verts.length);
            for (let i = 0; i < verts.length; i++) this.projectedVertices[i] = { x: 0, y: 0, depth: 0 };
        }

        for (let i = 0; i < verts.length; i++) {
            let x = verts[i].x, y = verts[i].y, z = verts[i].z;

            // Rotate around Z axis
            let tx = x, ty = y;
            x = tx * cosZ - ty * sinZ;
            y = tx * sinZ + ty * cosZ;

            // Rotate around X axis
            tx = y; let tz = z;
            y = tx * cosX - tz * sinX;
            z = tx * sinX + tz * cosX;

            // Rotate around Y axis
            tx = x; tz = z;
            x = tx * cosY + tz * sinY;
            z = -tx * sinY + tz * cosY;

            // Project to 2D (reuse object)
            const scale = fov / (fov + z);
            const p = this.projectedVertices[i];
            p.x = x * scale;
            p.y = y * scale;
            p.depth = z;
        }
    }
    
    update(gameField = null) {
        if (!this.active) return;

        // Death flash countdown
        if (this._deathFlash > 0) {
            this._deathFlash--;
            if (this._deathFlash <= 0) {
                this.active = false;
            }
            return;
        }

        // Cap asteroid speed to keep them manageable to hit
        const maxSpeed = 2.0; // Maximum speed for asteroids
        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
        if (currentSpeed > maxSpeed) {
            this.vel.x = (this.vel.x / currentSpeed) * maxSpeed;
            this.vel.y = (this.vel.y / currentSpeed) * maxSpeed;
        }

        this.x += this.vel.x * GAME_CONFIG.TICK_SCALE;
        this.y += this.vel.y * GAME_CONFIG.TICK_SCALE;

        // Boundary bouncing instead of wrapping
        if (gameField) {
            // Bounce off left/right boundaries
            if (this.x - this.radius < 0) {
                this.x = this.radius;
                this.vel.x = Math.abs(this.vel.x) * 0.9; // Bounce with slight energy loss
            } else if (this.x + this.radius > gameField.width) {
                this.x = gameField.width - this.radius;
                this.vel.x = -Math.abs(this.vel.x) * 0.9;
            }

            // Bounce off top/bottom boundaries
            if (this.y - this.radius < 0) {
                this.y = this.radius;
                this.vel.y = Math.abs(this.vel.y) * 0.9;
            } else if (this.y + this.radius > gameField.height) {
                this.y = gameField.height - this.radius;
                this.vel.y = -Math.abs(this.vel.y) * 0.9;
            }
        } else {
            // Fallback to old wrapping if no game field provided
            const wrapBuffer = this.radius * 2;
            if (this.x < -wrapBuffer) this.x = GameDimensions.width + wrapBuffer;
            if (this.x > GameDimensions.width + wrapBuffer) this.x = -wrapBuffer;
            if (this.y < -wrapBuffer) this.y = GameDimensions.height + wrapBuffer;
            if (this.y > GameDimensions.height + wrapBuffer) this.y = -wrapBuffer;
        }

        // Update rotation angles (always, for consistency)
        this.rot3D.x += this.rotVel3D.x;
        this.rot3D.y += this.rotVel3D.y;
        this.rot3D.z += this.rotVel3D.z;

        // Defer projection to draw — skip entirely for off-screen asteroids
        this._projectionDirty = true;
    }
    
    draw(ctx) {
        if (!this.active) return;

        // Death flash — BIG white silhouette that starts scaled up and fades
        if (this._deathFlash > 0) {
            const maxT = this._deathFlashMax || 6;
            const t = this._deathFlash;
            const progress = 1 - t / maxT;

            // Start at 1.4x scale, shrink to 0.3x while fading
            const scale = 1.4 - progress * 1.1;
            const alpha = Math.max(0, 1.0 - progress * 1.1);

            // Bright additive glow
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const glowR = this.radius * scale * 2.5;
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, glowR);
            grad.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.6})`);
            grad.addColorStop(0.3, `rgba(200, 220, 255, ${alpha * 0.3})`);
            grad.addColorStop(1, 'rgba(150, 200, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Draw asteroid shape as white silhouette
            if (this._projectionDirty) {
                this.project();
                this._projectionDirty = false;
            }
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.scale(scale, scale);
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = '#ffffff';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let i = 0; i < this.projectedVertices.length; i++) {
                const v = this.projectedVertices[i];
                if (i === 0) ctx.moveTo(v.x, v.y);
                else ctx.lineTo(v.x, v.y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Lazy projection — only compute when we actually draw
        if (this._projectionDirty) {
            this.project();
            this._projectionDirty = false;
        }

        // Draw targeting effect if this asteroid is currently targeted (clicked)
        if (this.gameEngine && this.gameEngine.targetedEntity === this) {
            this.drawTargetingEffect(ctx);
        }

        // Draw main asteroid
        ctx.save();
        ctx.translate(this.x, this.y);

        this.drawAsteroidShape(ctx);

        // Damage flash — propagating wave that radiates outward from the
        // impact point, lighting up each edge as the wavefront sweeps past.
        // We're back in entity-local coords here (post-translate), so we
        // convert the world-space hit point to local coords as well.
        if (this._hitFlashTimer > 0 && this.projectedVertices && this.edges && this.edges.length > 0) {
            const maxT = 10;
            const progress = 1 - (this._hitFlashTimer / maxT); // 0 → 1
            const hp = this._hitPoint || { x: this.x, y: this.y };
            const hx = hp.x - this.x;
            const hy = hp.y - this.y;
            // Diameter is the worst-case distance from any impact to any edge.
            const maxDist = Math.max(1, this.radius * 2);
            // Wavefront sweeps from 0 → ~1.1 in normalized distance over the flash.
            const wave = progress * 1.1;
            const waveWidth = 0.32; // bell-curve half-width in normalized units

            ctx.globalCompositeOperation = 'lighter';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';

            for (let i = 0; i < this.edges.length; i++) {
                const e = this.edges[i];
                const v1 = this.projectedVertices[e[0]];
                const v2 = this.projectedVertices[e[1]];
                if (!v1 || !v2) continue;

                const mx = (v1.x + v2.x) * 0.5;
                const my = (v1.y + v2.y) * 0.5;
                const dNorm = Math.hypot(mx - hx, my - hy) / maxDist;

                // Gaussian centered on the wavefront — edge peaks as it passes.
                const u = (wave - dNorm) / waveWidth;
                const intensity = Math.exp(-u * u);
                if (intensity < 0.02) continue;

                ctx.globalAlpha = Math.min(1, intensity);
                ctx.strokeStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(v1.x, v1.y);
                ctx.lineTo(v2.x, v2.y);
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.restore();

        // Hit flash — localized at bullet impact point (world-space)
        if (this._hitFlashTimer > 0) {
            const maxT = 10;
            const t = this._hitFlashTimer;
            const alpha = t / maxT;
            const progress = 1 - alpha;
            const fr = this.radius * 0.65; // localized flash

            // Use stored impact point, or fall back to center
            const hp = this._hitPoint || { x: this.x, y: this.y };
            const dx0 = hp.x - this.x;
            const dy0 = hp.y - this.y;
            const d0 = Math.hypot(dx0, dy0);
            const maxDist = this.radius * 0.85;
            const cx = d0 > maxDist ? this.x + (dx0 / d0) * maxDist : hp.x;
            const cy = d0 > maxDist ? this.y + (dy0 / d0) * maxDist : hp.y;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            // Localized flash
            const flashAlpha = alpha * 0.7;
            const flashRadius = fr * (1 + progress * 0.4);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius);
            grad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha})`);
            grad.addColorStop(0.5, `rgba(200, 220, 255, ${flashAlpha * 0.35})`);
            grad.addColorStop(1, 'rgba(150, 200, 255, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, flashRadius, 0, Math.PI * 2);
            ctx.fill();

            // Small expanding ring
            if (progress > 0.1) {
                const ringProgress = (progress - 0.1) / 0.9;
                const ringRadius = fr * (0.3 + ringProgress * 1.8);
                const ringAlpha = (1 - ringProgress) * 0.3;
                ctx.strokeStyle = `rgba(180, 220, 255, ${ringAlpha})`;
                ctx.lineWidth = Math.max(1, fr * 0.08 * (1 - ringProgress));
                ctx.beginPath();
                ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // Directional debris from impact
            const hitAngle = this._hitAngle || 0;
            const colors = ['255,255,255', '120,235,255', '255,255,150', '190,150,255'];
            for (let i = 0; i < 4; i++) {
                const angle = hitAngle + (i / 4 - 0.375) * 1.5;
                const speed = 0.5 + (i * 31 % 10) * 0.06;
                const dist = progress * fr * 2.5 * speed;
                const ddx = Math.cos(angle) * dist;
                const ddy = Math.sin(angle) * dist;

                const sz = fr * (0.18 - progress * 0.09);
                if (sz <= 0) continue;

                ctx.fillStyle = `rgba(${colors[i]}, ${alpha * 0.5})`;
                ctx.beginPath();
                ctx.arc(cx + ddx, cy + ddy, sz, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
            this._hitFlashTimer--;
        }

        // Draw health bar
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        // Make bar longer to accommodate level display
        const barWidth = 65; // Increased from 50 to 65
        const barHeight = 3; // Reduced from 5px to 3px for more compact appearance
        const barY = this.y - this.radius - 18;

        // Health number and level text setup - COMMENTED OUT (now shown in target display)
        /*
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.fillStyle = '#FFD700'; // Bright gold for health number
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        // Round up health display when between 0-1 to show 1 HP
        const displayHealth = this.health > 0 && this.health < 1 ? 1 : Math.round(this.health);
        const healthNumber = `${displayHealth}/${this.maxHealth}`;
        const numberY = barY - 6; // Position above the bar with 6px gap
        
        // Measure text widths for proper centering
        const healthWidth = ctx.measureText(healthNumber).width;
        const levelText = `LV${this.level || 1}`;
        const levelWidth = ctx.measureText(levelText).width;
        const spacing = 8; // Space between level and health
        
        // Calculate total width of combined LV + HP text
        const totalTextWidth = levelWidth + spacing + healthWidth;
        
        // Center the health bar under the combined text
        const barX = this.x - barWidth / 2;
        const textCenterX = this.x; // Center the combined text over the asteroid
        
        // Calculate positions for level and health text
        const levelX = textCenterX - (totalTextWidth / 2);
        const numberX = levelX + levelWidth + spacing + (healthWidth / 2);
        
        // Draw level text in light blue
        ctx.fillStyle = '#88ccff'; // Light blue color
        ctx.textAlign = 'left';
        ctx.strokeText(levelText, levelX, numberY);
        ctx.fillText(levelText, levelX, numberY);
        
        // Draw health number outline first, then fill
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.strokeText(healthNumber, numberX, numberY);
        ctx.fillText(healthNumber, numberX, numberY);
        */
        
        // Center the health bar under the asteroid
        const barX = this.x - barWidth / 2;

        // Health calculation
        const healthPercentage = this.health / this.maxHealth;

        // OPT-6: cache the gradient per tier so createLinearGradient() is only called
        // when the tier boundary (>50% / >25% / <=25%) changes, not every frame.
        const tier = healthPercentage > 0.5 ? 'green' : healthPercentage > 0.25 ? 'yellow' : 'red';
        if (tier !== this._healthBarTier || !this._healthBarGradient) {
            this._healthBarTier = tier;
            let healthGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
            let backgroundColor;
            if (tier === 'green') {
                healthGradient.addColorStop(0, '#66ff66');
                healthGradient.addColorStop(1, '#00cc00');
                backgroundColor = 'rgba(0, 102, 0, 0.6)';
            } else if (tier === 'yellow') {
                healthGradient.addColorStop(0, '#ffff99');
                healthGradient.addColorStop(1, '#cccc00');
                backgroundColor = 'rgba(102, 102, 0, 0.6)';
            } else {
                healthGradient.addColorStop(0, '#ff6666');
                healthGradient.addColorStop(1, '#cc0000');
                backgroundColor = 'rgba(102, 0, 0, 0.6)';
            }
            this._healthBarGradient   = healthGradient;
            this._healthBarBackground = backgroundColor;
        }
        let healthGradient = this._healthBarGradient;
        let backgroundColor = this._healthBarBackground;
        
        const cornerRadius = 1; // Minimal rounding
        
        // Colored background matching health state with full width
        ctx.fillStyle = backgroundColor;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
        ctx.fill();

        // Health bar with gradient and rounded corners
        const filledWidth = barWidth * healthPercentage;
        if (filledWidth > 0) {
            ctx.fillStyle = healthGradient;
            ctx.beginPath();
            ctx.roundRect(barX, barY, filledWidth, barHeight, cornerRadius);
            ctx.fill();
        }



        ctx.restore();
    }
    
    // Helper method to draw the asteroid shape
    drawAsteroidShape(ctx) {
        const now = frameClock.now;

        // Set constant state once — not 30× per edge
        ctx.lineWidth = 2;
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Compute per-edge alpha and hue, then group into ~5 depth buckets.
        // Pre-allocated arrays on `this` — zero per-frame allocation.
        const BUCKETS = this._BUCKETS;
        const bucketEdges = this._bucketEdges;
        const bucketHue   = this._bucketHue;
        const bucketCount = this._bucketCount;

        // Clear buckets (reuse arrays)
        for (let b = 0; b < BUCKETS; b++) {
            bucketEdges[b].length = 0;
            bucketHue[b]   = 0;
            bucketCount[b] = 0;
        }

        for (let i = 0; i < this.edges.length; i++) {
            const edge = this.edges[i];
            const v1 = this.projectedVertices[edge[0]];
            const v2 = this.projectedVertices[edge[1]];
            if (!v1 || !v2) continue;

            const avg = (v1.depth + v2.depth) / 2;
            const alpha = Math.max(0.2, Math.pow(Math.max(0, (this.fov - avg) / (this.fov + this.radius)), 2.0));
            const hue   = (this.baseHue + now / this.hueCycleSpeed + (i / this.edges.length) * this.hueSpread) % 360;

            // Map alpha [0.2, 1.0] → bucket index [0, 4]
            const bi = Math.min(BUCKETS - 1, Math.floor((alpha - 0.2) / 0.8 * BUCKETS));
            bucketEdges[bi].push(v1, v2, alpha);
            bucketHue[bi]  += hue;
            bucketCount[bi]++;
        }

        // One beginPath + stroke per non-empty bucket
        for (let bi = 0; bi < BUCKETS; bi++) {
            if (bucketCount[bi] === 0) continue;
            const edges = bucketEdges[bi];
            const alpha = edges[2]; // first edge's alpha for this bucket
            const hue   = bucketHue[bi] / bucketCount[bi]; // average hue

            ctx.globalAlpha = alpha;
            ctx.strokeStyle = hsl(hue, this.saturation, this.lightness);
            ctx.beginPath();
            for (let j = 0; j < edges.length; j += 3) {
                ctx.moveTo(edges[j].x, edges[j].y);
                ctx.lineTo(edges[j + 1].x, edges[j + 1].y);
            }
            ctx.stroke();
        }
    }
    
    drawTargetingEffect(ctx) {
        ctx.save();

        // Pulsing glow effect
        const time = frameClock.now * 0.003;
        const pulseIntensity = 0.5 + Math.sin(time) * 0.3;

        // Fake glow without shadowBlur: a wide, faint ring underneath +
        // a sharp ring on top. Stroked-ring shadowBlur is one of the
        // slowest canvas patterns; this approach is visually equivalent.
        const r = this.radius + 8;
        ctx.strokeStyle = '#888888';
        ctx.globalAlpha = 0.18 * pulseIntensity;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.4 * pulseIntensity;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Inner highlight ring (same fake-glow trick, white).
        const r2 = this.radius + 5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.globalAlpha = 0.25 * pulseIntensity;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.6 * pulseIntensity;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}