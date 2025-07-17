// Web Worker for particle system updates
// Handles particle physics and rendering to ImageData

class ParticleSystem {
    constructor(maxParticles = 10000) {
        this.maxParticles = maxParticles;
        this.particleCount = 0;
        
        // Typed arrays for particle data
        this.positionX = new Float32Array(maxParticles);
        this.positionY = new Float32Array(maxParticles);
        this.velocityX = new Float32Array(maxParticles);
        this.velocityY = new Float32Array(maxParticles);
        this.radius = new Float32Array(maxParticles);
        this.life = new Float32Array(maxParticles);
        this.maxLife = new Float32Array(maxParticles);
        this.friction = new Float32Array(maxParticles);
        this.colorR = new Uint8Array(maxParticles);
        this.colorG = new Uint8Array(maxParticles);
        this.colorB = new Uint8Array(maxParticles);
        this.alpha = new Float32Array(maxParticles);
        this.type = new Uint8Array(maxParticles);
        this.active = new Uint8Array(maxParticles);
        
        // Available indices
        this.availableIndices = new Uint32Array(maxParticles);
        this.availableCount = maxParticles;
        
        // Initialize
        for (let i = 0; i < maxParticles; i++) {
            this.availableIndices[i] = i;
            this.active[i] = 0;
        }
    }
    
    emit(particleData) {
        if (this.availableCount === 0) return -1;
        
        const index = this.availableIndices[--this.availableCount];
        
        this.positionX[index] = particleData.x;
        this.positionY[index] = particleData.y;
        this.velocityX[index] = particleData.vx || 0;
        this.velocityY[index] = particleData.vy || 0;
        this.radius[index] = particleData.radius || 1;
        this.life[index] = particleData.life || 1;
        this.maxLife[index] = particleData.life || 1;
        this.friction[index] = particleData.friction || 0.98;
        this.colorR[index] = particleData.r || 255;
        this.colorG[index] = particleData.g || 255;
        this.colorB[index] = particleData.b || 255;
        this.alpha[index] = particleData.alpha || 1;
        this.type[index] = particleData.type || 0;
        this.active[index] = 1;
        
        this.particleCount++;
        return index;
    }
    
    update(deltaTime) {
        const dt = deltaTime / 16.67;
        
        for (let i = 0; i < this.maxParticles; i++) {
            if (this.active[i] === 0) continue;
            
            // Update position
            this.positionX[i] += this.velocityX[i] * dt;
            this.positionY[i] += this.velocityY[i] * dt;
            
            // Apply friction
            this.velocityX[i] *= this.friction[i];
            this.velocityY[i] *= this.friction[i];
            
            // Update life
            this.life[i] -= dt / 60;
            
            // Update alpha
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

// Global particle system
let particleSystem = null;
let imageWidth = 1920;
let imageHeight = 1080;
let imageData = null;
let pixelData = null;

// Message handler
self.addEventListener('message', (e) => {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            initParticleSystem(data);
            break;
            
        case 'emit':
            emitParticles(data.particles);
            break;
            
        case 'update':
            updateParticles(data.deltaTime);
            break;
            
        case 'render':
            renderParticles();
            break;
            
        case 'clear':
            clearParticles();
            break;
            
        case 'resize':
            resizeCanvas(data.width, data.height);
            break;
    }
});

// Initialize particle system
function initParticleSystem(data) {
    particleSystem = new ParticleSystem(data.maxParticles || 10000);
    imageWidth = data.width || 1920;
    imageHeight = data.height || 1080;
    
    // Create ImageData for rendering
    const bufferSize = imageWidth * imageHeight * 4;
    pixelData = new Uint8ClampedArray(bufferSize);
    imageData = new ImageData(pixelData, imageWidth, imageHeight);
}

// Emit new particles
function emitParticles(particles) {
    if (!particleSystem) return;
    
    particles.forEach(p => {
        particleSystem.emit(p);
    });
    
    self.postMessage({
        type: 'particlesEmitted',
        count: particles.length,
        totalActive: particleSystem.particleCount
    });
}

// Update particle physics
function updateParticles(deltaTime) {
    if (!particleSystem) return;
    
    particleSystem.update(deltaTime);
    
    // Send back updated particle count
    self.postMessage({
        type: 'updateComplete',
        activeParticles: particleSystem.particleCount
    });
}

// Render particles to ImageData
function renderParticles() {
    if (!particleSystem || !pixelData) return;
    
    // Clear pixel data
    pixelData.fill(0);
    
    // Render each active particle
    for (let i = 0; i < particleSystem.maxParticles; i++) {
        if (particleSystem.active[i] === 0) continue;
        
        const x = Math.floor(particleSystem.positionX[i]);
        const y = Math.floor(particleSystem.positionY[i]);
        const radius = particleSystem.radius[i];
        const alpha = particleSystem.alpha[i];
        
        if (radius <= 1) {
            // Point rendering
            if (x >= 0 && x < imageWidth && y >= 0 && y < imageHeight) {
                const index = (y * imageWidth + x) * 4;
                
                // Additive blending
                pixelData[index] = Math.min(255, pixelData[index] + particleSystem.colorR[i] * alpha);
                pixelData[index + 1] = Math.min(255, pixelData[index + 1] + particleSystem.colorG[i] * alpha);
                pixelData[index + 2] = Math.min(255, pixelData[index + 2] + particleSystem.colorB[i] * alpha);
                pixelData[index + 3] = Math.min(255, pixelData[index + 3] + 255 * alpha);
            }
        } else {
            // Circle rendering
            const x0 = Math.max(0, Math.floor(x - radius));
            const x1 = Math.min(imageWidth - 1, Math.ceil(x + radius));
            const y0 = Math.max(0, Math.floor(y - radius));
            const y1 = Math.min(imageHeight - 1, Math.ceil(y + radius));
            
            for (let py = y0; py <= y1; py++) {
                for (let px = x0; px <= x1; px++) {
                    const dx = px - x;
                    const dy = py - y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist <= radius) {
                        const falloff = 1 - (dist / radius);
                        const index = (py * imageWidth + px) * 4;
                        
                        pixelData[index] = Math.min(255, pixelData[index] + particleSystem.colorR[i] * alpha * falloff);
                        pixelData[index + 1] = Math.min(255, pixelData[index + 1] + particleSystem.colorG[i] * alpha * falloff);
                        pixelData[index + 2] = Math.min(255, pixelData[index + 2] + particleSystem.colorB[i] * alpha * falloff);
                        pixelData[index + 3] = Math.min(255, pixelData[index + 3] + 255 * alpha * falloff);
                    }
                }
            }
        }
    }
    
    // Send rendered image data back
    self.postMessage({
        type: 'renderComplete',
        imageData: imageData
    }, [imageData.data.buffer]);
    
    // Recreate ImageData since we transferred the buffer
    pixelData = new Uint8ClampedArray(imageWidth * imageHeight * 4);
    imageData = new ImageData(pixelData, imageWidth, imageHeight);
}

// Clear all particles
function clearParticles() {
    if (!particleSystem) return;
    
    for (let i = 0; i < particleSystem.maxParticles; i++) {
        if (particleSystem.active[i]) {
            particleSystem.active[i] = 0;
            particleSystem.availableIndices[particleSystem.availableCount++] = i;
        }
    }
    
    particleSystem.particleCount = 0;
    
    self.postMessage({
        type: 'cleared'
    });
}

// Resize canvas
function resizeCanvas(width, height) {
    imageWidth = width;
    imageHeight = height;
    
    const bufferSize = imageWidth * imageHeight * 4;
    pixelData = new Uint8ClampedArray(bufferSize);
    imageData = new ImageData(pixelData, imageWidth, imageHeight);
    
    self.postMessage({
        type: 'resized',
        width: imageWidth,
        height: imageHeight
    });
}