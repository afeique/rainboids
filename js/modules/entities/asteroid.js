// Asteroid entity with 3D wireframe rendering
import { GAME_CONFIG } from '../constants.js';
import { random } from '../utils.js';

const width = window.innerWidth;
const height = window.innerHeight;
const DEBRIS_COUNT = 5;

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class Asteroid {
    constructor(x, y, radius, level = 1) {
        this.level = level;
        this.x = x !== undefined ? x : random(0, width);
        this.y = y !== undefined ? y : random(0, height);
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
        
        this.fov = 300;
        this.active = true;
        this.creationTime = Date.now();
        
        // Define edges for wireframe
        this.edges = [
            [0,1],[0,5],[0,7],[0,10],[0,11],[1,5],[1,7],[1,8],[1,9],
            [2,3],[2,4],[2,6],[2,10],[2,11],[3,4],[3,6],[3,8],[3,9],
            [4,5],[4,9],[4,11],[5,9],[5,11],[6,7],[6,8],[6,10],
            [7,8],[7,10],[8,9],[10,11]
        ];
        
        this.rescale(radius || random(40, 60));

        // Calculate reasonable health based on size (20-40 range)
        // Base health of 20, scaled by size relative to minimum radius (40)
        const baseHealth = 20;
        const sizeMultiplier = this.radius / 40; // 40 is minimum radius
        const levelMultiplier = this.level;
        this.maxHealth = Math.floor(baseHealth * sizeMultiplier * levelMultiplier);
        // Ensure health is in reasonable range
        this.maxHealth = Math.max(15, Math.min(50, this.maxHealth));
        this.health = this.maxHealth;
    }

    reset(x, y, radius, level = 1) {
        this.level = level;
        this.x = x !== undefined ? x : random(0, width);
        this.y = y !== undefined ? y : random(0, height);
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
        
        this.rescale(radius || random(40, 60));

        // Calculate reasonable health based on size (20-40 range)
        // Base health of 20, scaled by size relative to minimum radius (40)
        const baseHealth = 20;
        const sizeMultiplier = this.radius / 40; // 40 is minimum radius
        const levelMultiplier = this.level;
        this.maxHealth = Math.floor(baseHealth * sizeMultiplier * levelMultiplier);
        // Ensure health is in reasonable range
        this.maxHealth = Math.max(15, Math.min(50, this.maxHealth));
        this.health = this.maxHealth;
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
        
        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Wrap around screen with buffer
        const wrapBuffer = this.radius * 2;
        if (this.x < -wrapBuffer) this.x = width + wrapBuffer;
        if (this.x > width + wrapBuffer) this.x = -wrapBuffer;
        if (this.y < -wrapBuffer) this.y = height + wrapBuffer;
        if (this.y > height + wrapBuffer) this.y = -wrapBuffer;
        
        // Update rotation
        this.rot3D.x += this.rotVel3D.x;
        this.rot3D.y += this.rotVel3D.y;
        this.rot3D.z += this.rotVel3D.z;
        
        this.project();
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        
        this.edges.forEach((edge, index) => {
            const v1 = this.projectedVertices[edge[0]];
            const v2 = this.projectedVertices[edge[1]];
            
            if (!v1 || !v2) return;
            
            const avg = (v1.depth + v2.depth) / 2;
            ctx.globalAlpha = Math.max(0.1, Math.pow(Math.max(0, (this.fov - avg) / (this.fov + this.radius)), 2.5));
            
            const hue = (Date.now() / 20 + index * 10) % 360;
            ctx.strokeStyle = `hsl(${hue}, 100%, 70%)`;
            
            // Add shadow blur for better visual effect
            ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
            ctx.shadowBlur = 8;

            ctx.beginPath();
            ctx.moveTo(v1.x, v1.y);
            ctx.lineTo(v2.x, v2.y);
            ctx.stroke();
        });

        ctx.restore();

        // Draw health bar
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        const barWidth = 50; // Medium width
        const barHeight = 5; // Thinner
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.radius - 18;

        // Health calculation
        const healthPercentage = this.health / this.maxHealth;
        let healthColor, borderColor;
        if (healthPercentage > 0.5) {
            healthColor = '#00ff00';
            borderColor = 'rgba(0, 255, 0, 0.6)'; // Light green border
        } else if (healthPercentage > 0.25) {
            healthColor = '#ffff00';
            borderColor = 'rgba(255, 255, 0, 0.6)'; // Light yellow border
        } else {
            healthColor = '#ff0000';
            borderColor = 'rgba(255, 0, 0, 0.6)'; // Light red border
        }
        
        const cornerRadius = 1; // Minimal rounding
        
        // Background with rounded corners
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
        ctx.fill();

        // Health bar with rounded corners
        const filledWidth = barWidth * healthPercentage;
        if (filledWidth > 0) {
            ctx.fillStyle = healthColor;
            ctx.beginPath();
            ctx.roundRect(barX, barY, filledWidth, barHeight, cornerRadius);
            ctx.fill();
        }

        // Light colored border that matches health color
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
        ctx.stroke();
        
        // HP Text positioned to the left of the bar with matching color
        ctx.font = "9px 'Press Start 2P', monospace";
        ctx.fillStyle = healthColor;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const text = `${Math.round(this.health)}/${this.maxHealth}`;
        const textX = barX - 8; // Position to the left of the bar
        const textY = barY + barHeight / 2;
        
        // Draw text outline first, then fill
        ctx.strokeText(text, textX, textY);
        ctx.fillText(text, textX, textY);

        ctx.restore();
    }
} 