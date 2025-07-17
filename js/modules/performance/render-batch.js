// Render batching system to minimize draw calls and state changes
export class RenderBatch {
    constructor() {
        this.batches = new Map();
    }
    
    // Add entity to appropriate batch based on render state
    add(entity, renderState) {
        const key = this.getStateKey(renderState);
        if (!this.batches.has(key)) {
            this.batches.set(key, {
                state: renderState,
                entities: []
            });
        }
        this.batches.get(key).entities.push(entity);
    }
    
    // Generate unique key for render state
    getStateKey(state) {
        return `${state.strokeStyle || 'none'}_${state.fillStyle || 'none'}_${state.globalAlpha || 1}_${state.lineWidth || 1}`;
    }
    
    // Clear all batches
    clear() {
        this.batches.clear();
    }
    
    // Execute all batches with minimal state changes
    render(ctx) {
        this.batches.forEach(batch => {
            ctx.save();
            
            // Apply state once for entire batch
            if (batch.state.strokeStyle) ctx.strokeStyle = batch.state.strokeStyle;
            if (batch.state.fillStyle) ctx.fillStyle = batch.state.fillStyle;
            if (batch.state.globalAlpha !== undefined) ctx.globalAlpha = batch.state.globalAlpha;
            if (batch.state.lineWidth) ctx.lineWidth = batch.state.lineWidth;
            if (batch.state.globalCompositeOperation) ctx.globalCompositeOperation = batch.state.globalCompositeOperation;
            
            // Draw all entities in this batch
            batch.entities.forEach(entity => {
                if (entity.drawBatched) {
                    entity.drawBatched(ctx);
                } else if (entity.draw) {
                    entity.draw(ctx);
                }
            });
            
            ctx.restore();
        });
        
        this.clear();
    }
}

// Specialized batch renderer for particles
export class ParticleBatch {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.createImageData(width, height);
        this.data = this.imageData.data;
        this.clear();
    }
    
    clear() {
        // Clear with transparency
        for (let i = 0; i < this.data.length; i += 4) {
            this.data[i] = 0;     // R
            this.data[i + 1] = 0; // G
            this.data[i + 2] = 0; // B
            this.data[i + 3] = 0; // A
        }
    }
    
    // Add particle using direct pixel manipulation
    addParticle(x, y, r, g, b, a, radius = 1) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        
        if (radius <= 1) {
            // Single pixel
            if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) {
                const index = (iy * this.width + ix) * 4;
                
                // Additive blending
                this.data[index] = Math.min(255, this.data[index] + r * a);
                this.data[index + 1] = Math.min(255, this.data[index + 1] + g * a);
                this.data[index + 2] = Math.min(255, this.data[index + 2] + b * a);
                this.data[index + 3] = Math.min(255, this.data[index + 3] + a * 255);
            }
        } else {
            // Circle with radius
            const x0 = Math.max(0, Math.floor(x - radius));
            const x1 = Math.min(this.width - 1, Math.ceil(x + radius));
            const y0 = Math.max(0, Math.floor(y - radius));
            const y1 = Math.min(this.height - 1, Math.ceil(y + radius));
            
            for (let py = y0; py <= y1; py++) {
                for (let px = x0; px <= x1; px++) {
                    const dx = px - x;
                    const dy = py - y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    if (dist <= radius) {
                        const falloff = 1 - (dist / radius);
                        const index = (py * this.width + px) * 4;
                        
                        this.data[index] = Math.min(255, this.data[index] + r * a * falloff);
                        this.data[index + 1] = Math.min(255, this.data[index + 1] + g * a * falloff);
                        this.data[index + 2] = Math.min(255, this.data[index + 2] + b * a * falloff);
                        this.data[index + 3] = Math.min(255, this.data[index + 3] + a * 255 * falloff);
                    }
                }
            }
        }
    }
    
    // Render the batch to target context
    render(targetCtx) {
        this.ctx.putImageData(this.imageData, 0, 0);
        targetCtx.drawImage(this.canvas, 0, 0);
    }
    
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.imageData = this.ctx.createImageData(width, height);
        this.data = this.imageData.data;
    }
}