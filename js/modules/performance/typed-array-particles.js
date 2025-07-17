// High-performance particle system using typed arrays
export class TypedArrayParticleSystem {
    constructor(maxParticles = 10000) {
        this.maxParticles = maxParticles;
        this.particleCount = 0;
        
        // Structure of Arrays (SoA) for better cache performance
        // Position
        this.positionX = new Float32Array(maxParticles);
        this.positionY = new Float32Array(maxParticles);
        
        // Velocity
        this.velocityX = new Float32Array(maxParticles);
        this.velocityY = new Float32Array(maxParticles);
        
        // Properties
        this.radius = new Float32Array(maxParticles);
        this.life = new Float32Array(maxParticles);
        this.maxLife = new Float32Array(maxParticles);
        this.friction = new Float32Array(maxParticles);
        
        // Color (0-255 for each channel)
        this.colorR = new Uint8Array(maxParticles);
        this.colorG = new Uint8Array(maxParticles);
        this.colorB = new Uint8Array(maxParticles);
        this.alpha = new Float32Array(maxParticles);
        
        // Type as integer for fast comparison
        this.type = new Uint8Array(maxParticles);
        
        // Flags
        this.active = new Uint8Array(maxParticles);
        
        // Available indices for allocation
        this.availableIndices = new Uint32Array(maxParticles);
        this.availableCount = maxParticles;
        
        // Initialize available indices
        for (let i = 0; i < maxParticles; i++) {
            this.availableIndices[i] = i;
            this.active[i] = 0;
        }
        
        // Particle type constants
        this.PARTICLE_TYPES = {
            BASIC: 0,
            EXPLOSION: 1,
            STAR_COLLECT: 2,
            THRUSTER: 3,
            SHIELD_HIT: 4,
            DAMAGE_NUMBER: 5,
            TRACTOR_BEAM: 6,
            LINE_DEBRIS: 7
        };
    }
    
    // Emit a new particle
    emit(x, y, vx, vy, radius, life, r, g, b, alpha, type, friction = 0.98) {
        if (this.availableCount === 0) return -1;
        
        // Get next available index
        const index = this.availableIndices[--this.availableCount];
        
        // Set particle data
        this.positionX[index] = x;
        this.positionY[index] = y;
        this.velocityX[index] = vx;
        this.velocityY[index] = vy;
        this.radius[index] = radius;
        this.life[index] = life;
        this.maxLife[index] = life;
        this.friction[index] = friction;
        this.colorR[index] = Math.floor(r);
        this.colorG[index] = Math.floor(g);
        this.colorB[index] = Math.floor(b);
        this.alpha[index] = alpha;
        this.type[index] = type;
        this.active[index] = 1;
        
        this.particleCount++;
        return index;
    }
    
    // Emit explosion particles
    emitExplosion(x, y, count = 25, speed = 5, color = {r: 255, g: 100, b: 0}) {
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const vel = speed * (0.5 + Math.random() * 0.5);
            const vx = Math.cos(angle) * vel;
            const vy = Math.sin(angle) * vel;
            const radius = 2 + Math.random() * 3;
            const life = 0.5 + Math.random() * 0.5;
            
            this.emit(x, y, vx, vy, radius, life, 
                color.r, color.g, color.b, 1,
                this.PARTICLE_TYPES.EXPLOSION, 0.95);
        }
    }
    
    // Update all particles
    update(deltaTime) {
        const dt = deltaTime / 16.67; // Normalize to 60fps
        
        // Process particles in batches for better cache performance
        const batchSize = 1000;
        for (let batch = 0; batch < this.maxParticles; batch += batchSize) {
            const end = Math.min(batch + batchSize, this.maxParticles);
            
            for (let i = batch; i < end; i++) {
                if (this.active[i] === 0) continue;
                
                // Update position
                this.positionX[i] += this.velocityX[i] * dt;
                this.positionY[i] += this.velocityY[i] * dt;
                
                // Apply friction
                this.velocityX[i] *= this.friction[i];
                this.velocityY[i] *= this.friction[i];
                
                // Update life
                this.life[i] -= dt / 60;
                
                // Update alpha based on life
                if (this.life[i] < 0.2) {
                    this.alpha[i] = this.life[i] / 0.2;
                }
                
                // Deactivate dead particles
                if (this.life[i] <= 0) {
                    this.active[i] = 0;
                    this.availableIndices[this.availableCount++] = i;
                    this.particleCount--;
                }
            }
        }
    }
    
    // Render particles to ImageData
    renderToImageData(imageData, width, height) {
        const data = imageData.data;
        
        // Clear image data
        data.fill(0);
        
        // Render each active particle
        for (let i = 0; i < this.maxParticles; i++) {
            if (this.active[i] === 0) continue;
            
            const x = Math.floor(this.positionX[i]);
            const y = Math.floor(this.positionY[i]);
            const radius = this.radius[i];
            const alpha = this.alpha[i];
            
            // Simple point rendering for small particles
            if (radius <= 1) {
                if (x >= 0 && x < width && y >= 0 && y < height) {
                    const index = (y * width + x) * 4;
                    
                    // Additive blending
                    data[index] = Math.min(255, data[index] + this.colorR[i] * alpha);
                    data[index + 1] = Math.min(255, data[index + 1] + this.colorG[i] * alpha);
                    data[index + 2] = Math.min(255, data[index + 2] + this.colorB[i] * alpha);
                    data[index + 3] = Math.min(255, data[index + 3] + 255 * alpha);
                }
            } else {
                // Circle rendering for larger particles
                const x0 = Math.max(0, Math.floor(x - radius));
                const x1 = Math.min(width - 1, Math.ceil(x + radius));
                const y0 = Math.max(0, Math.floor(y - radius));
                const y1 = Math.min(height - 1, Math.ceil(y + radius));
                
                for (let py = y0; py <= y1; py++) {
                    for (let px = x0; px <= x1; px++) {
                        const dx = px - x;
                        const dy = py - y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        
                        if (dist <= radius) {
                            const falloff = 1 - (dist / radius);
                            const index = (py * width + px) * 4;
                            
                            data[index] = Math.min(255, data[index] + this.colorR[i] * alpha * falloff);
                            data[index + 1] = Math.min(255, data[index + 1] + this.colorG[i] * alpha * falloff);
                            data[index + 2] = Math.min(255, data[index + 2] + this.colorB[i] * alpha * falloff);
                            data[index + 3] = Math.min(255, data[index + 3] + 255 * alpha * falloff);
                        }
                    }
                }
            }
        }
        
        return imageData;
    }
    
    // Get particles in region (for collision detection)
    getParticlesInRegion(x, y, width, height, outputIndices) {
        let count = 0;
        
        for (let i = 0; i < this.maxParticles && count < outputIndices.length; i++) {
            if (this.active[i] === 0) continue;
            
            if (this.positionX[i] >= x && this.positionX[i] < x + width &&
                this.positionY[i] >= y && this.positionY[i] < y + height) {
                outputIndices[count++] = i;
            }
        }
        
        return count;
    }
    
    // Clear all particles
    clear() {
        for (let i = 0; i < this.maxParticles; i++) {
            if (this.active[i]) {
                this.active[i] = 0;
                this.availableIndices[this.availableCount++] = i;
            }
        }
        this.particleCount = 0;
    }
    
    // Get statistics
    getStats() {
        return {
            active: this.particleCount,
            max: this.maxParticles,
            utilization: (this.particleCount / this.maxParticles * 100).toFixed(1) + '%',
            memoryUsage: (this.maxParticles * 13 * 4 / 1024).toFixed(1) + 'KB'
        };
    }
}

// Particle emitter helper
export class TypedParticleEmitter {
    constructor(particleSystem) {
        this.particleSystem = particleSystem;
    }
    
    // Emit thruster particles
    emitThruster(x, y, angle, isThrusting) {
        if (!isThrusting) return;
        
        const thrustAngle = angle + Math.PI;
        const spread = 0.5;
        
        for (let i = 0; i < 2; i++) {
            const particleAngle = thrustAngle + (Math.random() - 0.5) * spread;
            const speed = 3 + Math.random() * 2;
            const vx = Math.cos(particleAngle) * speed;
            const vy = Math.sin(particleAngle) * speed;
            
            this.particleSystem.emit(
                x, y, vx, vy,
                1 + Math.random() * 2, // radius
                0.3, // life
                255, 150, 50, // orange color
                1, // alpha
                this.particleSystem.PARTICLE_TYPES.THRUSTER,
                0.9 // friction
            );
        }
    }
    
    // Emit shield hit effect
    emitShieldHit(x, y, radius) {
        const count = 20;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = 2;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            
            this.particleSystem.emit(
                x + Math.cos(angle) * radius,
                y + Math.sin(angle) * radius,
                vx, vy,
                2, // radius
                0.5, // life
                0, 170, 255, // blue color
                1, // alpha
                this.particleSystem.PARTICLE_TYPES.SHIELD_HIT,
                0.95 // friction
            );
        }
    }
}