// Asteroid entity with 3D wireframe rendering
import { GAME_CONFIG } from '../constants.js';
import { random } from '../utils.js';

function isMobile() {
    return window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 768px)').matches;
}

export class Asteroid {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.active = false;
    }
    
    reset(x, y, baseRadius) {
        this.x = x;
        this.y = y;
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
        
        // Initialize health based on size
        this.maxHealth = Math.ceil((baseRadius || 50) / 20); // 2-3 hits for most asteroids
        this.health = this.maxHealth;
        
        // Define edges for wireframe
        this.edges = [
            [0,1],[0,5],[0,7],[0,10],[0,11],[1,5],[1,7],[1,8],[1,9],
            [2,3],[2,4],[2,6],[2,10],[2,11],[3,4],[3,6],[3,8],[3,9],
            [4,5],[4,9],[4,11],[5,9],[5,11],[6,7],[6,8],[6,10],
            [7,8],[7,10],[8,9],[10,11]
        ];
        
        this.rescale(baseRadius || random(40, 60));
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
        
        // Update health when rescaling
        this.maxHealth = Math.ceil(newBaseRadius / 20);
        this.health = this.maxHealth;
        
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
        
        // --- Begin impulse logic for border correction ---
        const deg30 = Math.PI / 6;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const impulseStrength = 0.7; // tweak as needed
        // Horizontal check (top/bottom)
        const horizontalAngle = Math.abs(Math.atan2(this.vel.y, this.vel.x));
        if ((this.y < this.baseRadius * 2 || this.y > this.height - this.baseRadius * 2) && (horizontalAngle < deg30 || horizontalAngle > Math.PI - deg30)) {
            // Moving mostly horizontally near top or bottom
            const dir = this.y < centerY ? 1 : -1; // push down if near top, up if near bottom
            this.vel.y += dir * impulseStrength;
        }
        // Vertical check (left/right)
        const verticalAngle = Math.abs(Math.atan2(this.vel.x, this.vel.y));
        if ((this.x < this.baseRadius * 2 || this.x > this.width - this.baseRadius * 2) && (verticalAngle < deg30 || verticalAngle > Math.PI - deg30)) {
            // Moving mostly vertically near left or right
            const dir = this.x < centerX ? 1 : -1; // push right if near left, left if near right
            this.vel.x += dir * impulseStrength;
        }
        // --- End impulse logic ---
        
        // Wrap around screen with buffer
        const wrapBuffer = this.baseRadius * 4;
        if (this.x < -wrapBuffer) this.x = this.width + wrapBuffer;
        if (this.x > this.width + wrapBuffer) this.x = -wrapBuffer;
        if (this.y < -wrapBuffer) this.y = this.height + wrapBuffer;
        if (this.y > this.height + wrapBuffer) this.y = -wrapBuffer;
        
        // Update rotation
        this.rot3D.x += this.rotVel3D.x;
        this.rot3D.y += this.rotVel3D.y;
        this.rot3D.z += this.rotVel3D.z;
        
        this.project();
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        // Draw health bar above asteroid
        if (this.health < this.maxHealth) {
            ctx.save();
            const barWidth = 30;
            const barHeight = 4;
            const barY = this.y - this.radius - 15;
            
            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(this.x - barWidth/2, barY, barWidth, barHeight);
            
            // Health fill
            const healthPercent = this.health / this.maxHealth;
            const healthColor = healthPercent > 0.66 ? '#0f0' : 
                               healthPercent > 0.33 ? '#ff0' : '#f00';
            ctx.fillStyle = healthColor;
            ctx.fillRect(this.x - barWidth/2, barY, barWidth * healthPercent, barHeight);
            ctx.restore();
        }
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        
        this.edges.forEach(edge => {
            const v1 = this.projectedVertices[edge[0]];
            const v2 = this.projectedVertices[edge[1]];
            
            if (!v1 || !v2) return;
            
            const avg = (v1.depth + v2.depth) / 2;
            ctx.globalAlpha = Math.max(0.1, Math.pow(Math.max(0, (this.fov - avg) / (this.fov + this.radius)), 2.5));
            
            ctx.beginPath();
            ctx.moveTo(v1.x, v1.y);
            ctx.lineTo(v2.x, v2.y);
            ctx.stroke();
        });
        
        ctx.restore();
    }
} 