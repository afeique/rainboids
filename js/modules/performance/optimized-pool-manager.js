// Optimized pool manager with pre-allocated arrays
export class OptimizedPoolManager {
    constructor(EntityClass, maxSize) {
        this.EntityClass = EntityClass;
        this.maxSize = maxSize;
        
        // Pre-allocate arrays with fixed size
        this.pool = new Array(maxSize);
        this.activeObjects = [];
        this.activeCount = 0;
        
        // Pre-create all objects
        for (let i = 0; i < maxSize; i++) {
            this.pool[i] = new EntityClass();
            this.pool[i].active = false;
        }
        
        // Track available objects
        this.availableIndices = new Array(maxSize);
        for (let i = 0; i < maxSize; i++) {
            this.availableIndices[i] = i;
        }
        this.availableCount = maxSize;
    }
    
    // Get object from pool
    get(...args) {
        if (this.availableCount === 0) {
            return null; // Pool exhausted
        }
        
        // Get next available index
        const index = this.availableIndices[--this.availableCount];
        const obj = this.pool[index];
        
        // Reset and activate object
        if (obj.reset) {
            obj.reset(...args);
        }
        obj.active = true;
        
        // Add to active list
        this.activeObjects[this.activeCount++] = obj;
        
        return obj;
    }
    
    // Release object back to pool
    release(obj) {
        if (!obj.active) return;
        
        obj.active = false;
        
        // Remove from active list (swap with last element)
        const index = this.activeObjects.indexOf(obj);
        if (index !== -1) {
            this.activeObjects[index] = this.activeObjects[--this.activeCount];
            this.activeObjects[this.activeCount] = null; // Clear reference
        }
        
        // Add index back to available list
        const poolIndex = this.pool.indexOf(obj);
        if (poolIndex !== -1) {
            this.availableIndices[this.availableCount++] = poolIndex;
        }
    }
    
    // Update all active objects
    updateActive(...args) {
        // Only iterate through active count
        for (let i = 0; i < this.activeCount; i++) {
            const obj = this.activeObjects[i];
            if (obj && obj.active && obj.update) {
                obj.update(...args);
                
                // Check if object should be released
                if (!obj.active) {
                    this.release(obj);
                    i--; // Adjust index since we removed an element
                }
            }
        }
    }
    
    // Draw all active objects
    drawActive(ctx) {
        for (let i = 0; i < this.activeCount; i++) {
            const obj = this.activeObjects[i];
            if (obj && obj.active && obj.draw) {
                obj.draw(ctx);
            }
        }
    }
    
    // Draw active objects with batching
    drawActiveBatched(ctx, renderBatch) {
        for (let i = 0; i < this.activeCount; i++) {
            const obj = this.activeObjects[i];
            if (obj && obj.active) {
                // Get render state for batching
                const renderState = obj.getRenderState ? obj.getRenderState() : {
                    strokeStyle: ctx.strokeStyle,
                    fillStyle: ctx.fillStyle,
                    globalAlpha: ctx.globalAlpha,
                    lineWidth: ctx.lineWidth
                };
                
                renderBatch.add(obj, renderState);
            }
        }
    }
    
    // Draw only visible objects
    drawVisible(ctx, viewFrustum) {
        for (let i = 0; i < this.activeCount; i++) {
            const obj = this.activeObjects[i];
            if (obj && obj.active && obj.draw && viewFrustum.isVisible(obj)) {
                obj.draw(ctx);
            }
        }
    }
    
    // Get active objects array (trimmed to active count)
    getActiveObjects() {
        return this.activeObjects.slice(0, this.activeCount);
    }
    
    // Clear all active objects
    clear() {
        // Release all active objects
        for (let i = 0; i < this.activeCount; i++) {
            const obj = this.activeObjects[i];
            if (obj) {
                obj.active = false;
                this.activeObjects[i] = null;
            }
        }
        
        // Reset counts
        this.activeCount = 0;
        this.availableCount = this.maxSize;
        
        // Reset available indices
        for (let i = 0; i < this.maxSize; i++) {
            this.availableIndices[i] = i;
        }
    }
    
    // Get pool statistics
    getStats() {
        return {
            total: this.maxSize,
            active: this.activeCount,
            available: this.availableCount,
            utilization: (this.activeCount / this.maxSize) * 100
        };
    }
}