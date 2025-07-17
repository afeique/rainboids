// Central performance optimization manager
import { RenderBatch, ParticleBatch } from './render-batch.js';
import { pathCache } from './path-cache.js';
import { Quadtree } from './quadtree.js';
import { ViewFrustum } from './frustum-culling.js';
import { CanvasLayers, StarFieldCache } from './canvas-layers.js';
import { textCache, damageNumberCache, scoreCache } from './text-cache.js';

export class PerformanceManager {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        
        // Initialize all optimization systems
        this.renderBatch = new RenderBatch();
        this.particleBatch = new ParticleBatch(width, height);
        this.pathCache = pathCache;
        this.viewFrustum = new ViewFrustum();
        this.canvasLayers = new CanvasLayers(canvas.parentElement, width, height);
        this.starFieldCache = new StarFieldCache();
        this.textCache = textCache;
        this.damageNumberCache = damageNumberCache;
        this.scoreCache = scoreCache;
        
        // Quadtree for spatial partitioning
        this.quadtree = new Quadtree({
            x: 0,
            y: 0,
            width: width,
            height: height
        });
        
        // Performance monitoring
        this.frameCount = 0;
        this.fps = 60;
        this.lastTime = performance.now();
        this.frameTimeHistory = [];
        this.maxFrameHistory = 60;
        
        // Optimization settings
        this.settings = {
            useBatching: true,
            useQuadtree: true,
            useFrustumCulling: true,
            useLayering: true,
            useTextCaching: true,
            usePathCaching: true,
            particleLimit: 500,
            reduceSaveRestore: true
        };
    }
    
    // Update viewport for frustum culling
    updateViewport(x, y, width, height) {
        this.viewFrustum.update(x, y, width, height);
    }
    
    // Begin frame - prepare optimization systems
    beginFrame() {
        // Clear render batches
        this.renderBatch.clear();
        
        // Clear particle batch
        this.particleBatch.clear();
        
        // Clear and rebuild quadtree
        this.quadtree.clear();
        
        // Update performance metrics
        this.updatePerformance();
    }
    
    // End frame - execute batched operations
    endFrame() {
        this.frameCount++;
    }
    
    // Update performance metrics
    updatePerformance() {
        const now = performance.now();
        const frameTime = now - this.lastTime;
        this.lastTime = now;
        
        this.frameTimeHistory.push(frameTime);
        if (this.frameTimeHistory.length > this.maxFrameHistory) {
            this.frameTimeHistory.shift();
        }
        
        // Calculate average FPS
        if (this.frameTimeHistory.length > 0) {
            const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b) / this.frameTimeHistory.length;
            this.fps = Math.round(1000 / avgFrameTime);
        }
    }
    
    // Add entity to quadtree
    addToQuadtree(entity) {
        if (this.settings.useQuadtree) {
            this.quadtree.insert(entity);
        }
    }
    
    // Get potential collisions for entity
    getPotentialCollisions(entity) {
        if (this.settings.useQuadtree) {
            return this.quadtree.retrieve(entity);
        }
        return [];
    }
    
    // Check if entity is visible
    isVisible(entity) {
        if (this.settings.useFrustumCulling) {
            return this.viewFrustum.isVisible(entity);
        }
        return true;
    }
    
    // Filter entities to only visible ones
    filterVisible(entities) {
        if (this.settings.useFrustumCulling) {
            return this.viewFrustum.filterVisible(entities);
        }
        return entities;
    }
    
    // Add entity to render batch
    addToBatch(entity, renderState) {
        if (this.settings.useBatching) {
            this.renderBatch.add(entity, renderState);
        }
    }
    
    // Execute render batches
    executeBatches(ctx) {
        if (this.settings.useBatching) {
            this.renderBatch.render(ctx);
        }
    }
    
    // Add particle to particle batch
    addParticle(x, y, r, g, b, a, radius = 1) {
        this.particleBatch.addParticle(x, y, r, g, b, a, radius);
    }
    
    // Render particle batch
    renderParticles(ctx) {
        this.particleBatch.render(ctx);
    }
    
    // Resize all systems
    resize(width, height) {
        this.width = width;
        this.height = height;
        
        // Resize particle batch
        this.particleBatch.resize(width, height);
        
        // Resize canvas layers
        this.canvasLayers.resize(width, height);
        
        // Update quadtree bounds
        this.quadtree = new Quadtree({
            x: 0,
            y: 0,
            width: width,
            height: height
        });
    }
    
    // Get performance stats
    getStats() {
        return {
            fps: this.fps,
            frameTime: this.frameTimeHistory.length > 0 ? 
                this.frameTimeHistory[this.frameTimeHistory.length - 1] : 0,
            avgFrameTime: this.frameTimeHistory.length > 0 ?
                this.frameTimeHistory.reduce((a, b) => a + b) / this.frameTimeHistory.length : 0,
            renderBatchCount: this.renderBatch.batches.size,
            quadtreeObjects: this.quadtree.getAllObjects().length,
            pathCacheSize: this.pathCache.size,
            textCacheSize: this.textCache.size
        };
    }
    
    // Draw debug info
    drawDebug(ctx) {
        const stats = this.getStats();
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 200, 100);
        
        ctx.fillStyle = '#00ff00';
        ctx.font = '12px monospace';
        ctx.fillText(`FPS: ${stats.fps}`, 20, 30);
        ctx.fillText(`Frame Time: ${stats.frameTime.toFixed(2)}ms`, 20, 45);
        ctx.fillText(`Batches: ${stats.renderBatchCount}`, 20, 60);
        ctx.fillText(`Quadtree: ${stats.quadtreeObjects}`, 20, 75);
        ctx.fillText(`Path Cache: ${stats.pathCacheSize}`, 20, 90);
        
        ctx.restore();
        
        // Draw quadtree structure
        if (this.settings.useQuadtree) {
            this.quadtree.draw(ctx);
        }
        
        // Draw frustum bounds
        if (this.settings.useFrustumCulling) {
            this.viewFrustum.draw(ctx);
        }
    }
    
    // Cleanup
    destroy() {
        this.canvasLayers.destroy();
        this.textCache.clear();
        this.pathCache.clear();
    }
}