// Asteroid entity with 3D wireframe rendering
import { GAME_CONFIG } from '../constants.js';
import { random, GameDimensions } from '../utils.js';
const DEBRIS_COUNT = 5;

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
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
        
        this.initializeAsteroid(x, y, radius, level);
    }
    
    // Helper method to initialize/reset asteroid properties
    initializeAsteroid(x, y, radius, level = 1) {
        this.level = level;
        this.x = x !== undefined ? x : random(0, GameDimensions.width);
        this.y = y !== undefined ? y : random(0, GameDimensions.height);
        this.vel = {
            x: random(-GAME_CONFIG.AST_SPEED, GAME_CONFIG.AST_SPEED) || 0.2,
            y: random(-GAME_CONFIG.AST_SPEED, GAME_CONFIG.AST_SPEED) || 0.2
        };
        
        this.rot3D = { x: 0, y: 0, z: 0 };
        this.rotVel3D = {
            x: random(-0.02, 0.02),
            y: random(-0.02, 0.02),
            z: random(-0.02, 0.02)
        };
        
        this.active = true;
        this.creationTime = Date.now();
        
        this.rescale(radius || random(30, 60));

        // Calculate health based on size tiers:
        // Use baseRadius for consistent health calculation
        // Biggest asteroids (40-60 baseRadius): 12-18 health
        // Medium asteroids (20-40 baseRadius): 8-12 health  
        // Smallest asteroids (10-20 baseRadius): 4-8 health
        let health;
        const sizeRef = this.baseRadius || this.radius;
        if (sizeRef >= 40) {
            // Big asteroids: 12-18 health
            health = Math.floor(12 + (sizeRef - 40) / 20 * 6); // Scale from 12 to 18 based on radius 40-60
        } else if (sizeRef >= 20) {
            // Medium asteroids: 8-12 health
            health = Math.floor(8 + (sizeRef - 20) / 20 * 4); // Scale from 8 to 12 based on radius 20-40
        } else {
            // Small asteroids: 4-8 health
            health = Math.floor(4 + (sizeRef - 10) / 10 * 4); // Scale from 4 to 8 based on radius 10-20
        }
        
        this.maxHealth = Math.max(1, health); // Ensure minimum 1 health
        this.health = this.maxHealth;
    }

    reset(x, y, radius, level = 1) {
        this.initializeAsteroid(x, y, radius, level);
    }

    rescale(newBaseRadius) {
        let scale = isMobile() ? GAME_CONFIG.MOBILE_SCALE : 1;
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
        const cosX = Math.cos(this.rot3D.x);
        const sinX = Math.sin(this.rot3D.x);
        const cosY = Math.cos(this.rot3D.y);
        const sinY = Math.sin(this.rot3D.y);
        const cosZ = Math.cos(this.rot3D.z);
        const sinZ = Math.sin(this.rot3D.z);
        
        this.projectedVertices = this.vertices3D.map(v => {
            let x = v.x, y = v.y, z = v.z;
            
            // Rotate around Z axis
            let tx = x, ty = y;
            x = tx * cosZ - ty * sinZ;
            y = tx * sinZ + ty * cosZ;
            
            // Rotate around X axis
            tx = y;
            let tz = z;
            y = tx * cosX - tz * sinX;
            z = tx * sinX + tz * cosX;
            
            // Rotate around Y axis
            tx = x;
            tz = z;
            x = tx * cosY + tz * sinY;
            z = -tx * sinY + tz * cosY;
            
            // Project to 2D
            return {
                x: (x * this.fov) / (this.fov + z),
                y: (y * this.fov) / (this.fov + z),
                depth: z
            };
        });
    }
    
    update() {
        if (!this.active) return;
        
        // Cap asteroid speed to keep them manageable to hit
        const maxSpeed = 2.0; // Maximum speed for asteroids
        const currentSpeed = Math.hypot(this.vel.x, this.vel.y);
        if (currentSpeed > maxSpeed) {
            this.vel.x = (this.vel.x / currentSpeed) * maxSpeed;
            this.vel.y = (this.vel.y / currentSpeed) * maxSpeed;
        }
        
        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Wrap around screen with buffer
        const wrapBuffer = this.radius * 2;
        if (this.x < -wrapBuffer) this.x = GameDimensions.width + wrapBuffer;
        if (this.x > GameDimensions.width + wrapBuffer) this.x = -wrapBuffer;
        if (this.y < -wrapBuffer) this.y = GameDimensions.height + wrapBuffer;
        if (this.y > GameDimensions.height + wrapBuffer) this.y = -wrapBuffer;
        
        // Update rotation
        this.rot3D.x += this.rotVel3D.x;
        this.rot3D.y += this.rotVel3D.y;
        this.rot3D.z += this.rotVel3D.z;
        
        this.project();
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        // Draw main asteroid
        ctx.save();
        ctx.translate(this.x, this.y);
        
        this.drawAsteroidShape(ctx);

        ctx.restore();

        // Draw health bar
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        const barWidth = 50; // Medium width
        const barHeight = 3; // Reduced from 5px to 3px for more compact appearance
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.radius - 18;

        // Health calculation
        const healthPercentage = this.health / this.maxHealth;
        
        // Create vertical gradient for health bar (light to dark) and background color
        let healthGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
        let backgroundColor;
        
        if (healthPercentage > 0.5) {
            // Green gradient: light green to dark green
            healthGradient.addColorStop(0, '#66ff66'); // Light green at top
            healthGradient.addColorStop(1, '#00cc00'); // Dark green at bottom
            backgroundColor = 'rgba(0, 102, 0, 0.6)'; // Dark green background with opacity
        } else if (healthPercentage > 0.25) {
            // Yellow gradient: light yellow to dark yellow
            healthGradient.addColorStop(0, '#ffff99'); // Light yellow at top
            healthGradient.addColorStop(1, '#cccc00'); // Dark yellow at bottom
            backgroundColor = 'rgba(102, 102, 0, 0.6)'; // Dark yellow background with opacity
        } else {
            // Red gradient: light red to dark red
            healthGradient.addColorStop(0, '#ff6666'); // Light red at top
            healthGradient.addColorStop(1, '#cc0000'); // Dark red at bottom
            backgroundColor = 'rgba(102, 0, 0, 0.6)'; // Dark red background with opacity
        }
        
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

        // Health number centered above the health bar (bright gold showing current/max)
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.fillStyle = '#FFD700'; // Bright gold for health number
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const healthNumber = `${Math.round(this.health)}/${this.maxHealth}`;
        const numberX = barX + barWidth / 2; // Center above the bar
        const numberY = barY - 6; // Position above the bar with 6px gap (3px more than before)
        
        // Draw health number outline first, then fill
        ctx.strokeText(healthNumber, numberX, numberY);
        ctx.fillText(healthNumber, numberX, numberY);

        ctx.restore();
    }
    
    // Helper method to draw the asteroid shape
    drawAsteroidShape(ctx) {
        this.edges.forEach((edge, index) => {
            const v1 = this.projectedVertices[edge[0]];
            const v2 = this.projectedVertices[edge[1]];
            
            if (!v1 || !v2) return;
            
            const avg = (v1.depth + v2.depth) / 2;
            const baseAlpha = Math.max(0.2, Math.pow(Math.max(0, (this.fov - avg) / (this.fov + this.radius)), 2.0));
            
            ctx.globalAlpha = baseAlpha;
            
            const hue = (Date.now() / 20 + index * 10) % 360;
            ctx.strokeStyle = `hsl(${hue}, 100%, 75%)`; // Increased lightness from 70% to 85%
            ctx.lineWidth = 2; // Thicker lines for more visibility
            
            // Remove all shadow effects
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            ctx.beginPath();
            ctx.moveTo(v1.x, v1.y);
            ctx.lineTo(v2.x, v2.y);
            ctx.stroke();
        });
    }
}