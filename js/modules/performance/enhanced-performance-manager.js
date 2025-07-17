// Enhanced Performance Manager with all advanced optimizations
import { RenderBatch, ParticleBatch } from './render-batch.js';
import { pathCache } from './path-cache.js';
import { Quadtree } from './quadtree.js';
import { ViewFrustum } from './frustum-culling.js';
import { CanvasLayers, StarFieldCache } from './canvas-layers.js';
import { textCache, damageNumberCache, scoreCache } from './text-cache.js';
import { EnhancedFrameManager, TemporalUpsampler } from './temporal-upsampling.js';
import { TypedArrayParticleSystem, TypedParticleEmitter } from './typed-array-particles.js';
import { WorkerManager } from './worker-manager.js';

export class EnhancedPerformanceManager {
    constructor(canvas, width, height) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
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
        
        // NEW: Temporal upsampling for smooth 60fps visuals with 30fps updates
        this.frameManager = new EnhancedFrameManager(30, 60); // 30fps updates, 60fps rendering
        this.temporalUpsampler = new TemporalUpsampler(60, 30);
        
        // NEW: Typed array particle system for high-performance particles
        this.typedParticleSystem = new TypedArrayParticleSystem(10000);
        this.particleEmitter = new TypedParticleEmitter(this.typedParticleSystem);
        
        // NEW: Worker manager for parallel processing
        this.workerManager = new WorkerManager();
        this.workersInitialized = false;
        
        // Create offscreen canvas for particle rendering
        this.particleCanvas = document.createElement('canvas');
        this.particleCanvas.width = width;
        this.particleCanvas.height = height;
        this.particleCtx = this.particleCanvas.getContext('2d');
        this.particleImageData = this.particleCtx.createImageData(width, height);
        
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
            useTemporalUpsampling: false, // Temporarily disabled for debugging
            useTypedArrayParticles: true,
            useWorkers: false, // Disabled by default until initialized
            particleLimit: 10000,
            reduceSaveRestore: true
        };
        
        // Initialize workers asynchronously
        // Disabled for now - workers causing issues
        // this.initWorkers();
    }
    
    // Initialize web workers
    async initWorkers() {
        try {
            const config = {
                worldBounds: {
                    x: 0,
                    y: 0,
                    width: this.width,
                    height: this.height
                },
                maxParticles: 10000,
                width: this.width,
                height: this.height
            };
            
            const success = await this.workerManager.init(config);
            if (success) {
                this.workersInitialized = true;
                this.settings.useWorkers = true;
                console.log('✅ Web Workers initialized successfully');
                
                // Set up worker callbacks
                this.workerManager.onPhysicsUpdate = this.handlePhysicsUpdate.bind(this);
                this.workerManager.onCollisions = this.handleCollisions.bind(this);
                this.workerManager.onParticleRender = this.handleParticleRender.bind(this);
            } else {
                console.log('❌ Web Workers not available, using main thread');
            }
        } catch (error) {
            console.error('Failed to initialize workers:', error);
        }
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
    
    // Add particle using either typed array system or traditional batch
    addParticle(x, y, r, g, b, a, radius = 1, type = 'basic') {
        if (this.settings.useTypedArrayParticles) {
            // Map basic particle types to typed array types
            let particleType = this.typedParticleSystem.PARTICLE_TYPES.BASIC;
            if (type === 'explosion') {
                particleType = this.typedParticleSystem.PARTICLE_TYPES.EXPLOSION;
            } else if (type === 'star') {
                particleType = this.typedParticleSystem.PARTICLE_TYPES.STAR_COLLECT;
            }
            
            // Emit particle with default velocity and life
            this.typedParticleSystem.emit(
                x, y, 
                (Math.random() - 0.5) * 2, // vx
                (Math.random() - 0.5) * 2, // vy
                radius,
                1, // life
                r * 255, g * 255, b * 255, // Convert to 0-255 range
                a,
                particleType,
                0.98 // friction
            );
        } else {
            // Fallback to traditional particle batch
            this.particleBatch.addParticle(x, y, r, g, b, a, radius);
        }
    }
    
    // Emit explosion particles
    emitExplosion(x, y, count = 25, speed = 5, color = {r: 255, g: 100, b: 0}) {
        if (this.settings.useTypedArrayParticles) {
            this.typedParticleSystem.emitExplosion(x, y, count, speed, color);
        } else {
            // Fallback to traditional particles
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
                const vel = speed * (0.5 + Math.random() * 0.5);
                this.addParticle(
                    x, y,
                    color.r / 255, color.g / 255, color.b / 255,
                    1, 2 + Math.random() * 3,
                    'explosion'
                );
            }
        }
    }
    
    // Update particles
    updateParticles(deltaTime) {
        if (this.settings.useTypedArrayParticles) {
            this.typedParticleSystem.update(deltaTime);
        }
    }
    
    // Render particles
    renderParticles(ctx) {
        // Temporarily disable typed array particles to debug rendering
        if (false && this.settings.useTypedArrayParticles) {
            // Render typed array particles to image data
            this.typedParticleSystem.renderToImageData(this.particleImageData, this.width, this.height);
            
            // Draw image data to offscreen canvas
            this.particleCtx.putImageData(this.particleImageData, 0, 0);
            
            // Composite onto main canvas with additive blending
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(this.particleCanvas, 0, 0);
            ctx.restore();
        } else {
            // Fallback to traditional particle batch rendering
            this.particleBatch.render(ctx);
        }
    }
    
    // Save entity state for temporal upsampling
    saveEntityState(entity) {
        if (this.settings.useTemporalUpsampling) {
            this.temporalUpsampler.saveEntityState(entity);
        }
    }
    
    // Get interpolated entity state
    getInterpolatedState(entity) {
        if (this.settings.useTemporalUpsampling) {
            return this.temporalUpsampler.getInterpolatedState(entity);
        }
        return {
            x: entity.x,
            y: entity.y,
            angle: entity.angle || 0,
            radius: entity.radius,
            rotation: entity.rotation || 0,
            scale: entity.scale || 1,
            alpha: entity.alpha || 1
        };
    }
    
    // Draw entity with interpolation and motion blur
    drawEntityInterpolated(ctx, entity, drawCallback) {
        if (this.settings.useTemporalUpsampling) {
            const interpolated = this.getInterpolatedState(entity);
            
            // Temporarily apply interpolated state
            const originalState = {
                x: entity.x,
                y: entity.y,
                angle: entity.angle,
                rotation: entity.rotation,
                scale: entity.scale,
                alpha: entity.alpha
            };
            
            // Apply interpolated values
            entity.x = interpolated.x;
            entity.y = interpolated.y;
            entity.angle = interpolated.angle;
            entity.rotation = interpolated.rotation;
            entity.scale = interpolated.scale;
            entity.alpha = interpolated.alpha;
            
            // Draw with motion blur
            this.temporalUpsampler.drawWithMotionBlur(ctx, entity, drawCallback);
            
            // Restore original state
            Object.assign(entity, originalState);
        } else {
            drawCallback(ctx, entity);
        }
    }
    
    // Handle physics update from worker
    handlePhysicsUpdate(entities) {
        // This would be implemented by the game engine
        if (this.onPhysicsUpdate) {
            this.onPhysicsUpdate(entities);
        }
    }
    
    // Handle collisions from worker
    handleCollisions(collisions) {
        // This would be implemented by the game engine
        if (this.onCollisions) {
            this.onCollisions(collisions);
        }
    }
    
    // Handle particle render from worker
    handleParticleRender(imageData) {
        // Draw particle image data from worker
        this.ctx.putImageData(imageData, 0, 0);
    }
    
    // Send entities to workers
    updateWorkerEntities(entities) {
        if (this.settings.useWorkers && this.workersInitialized) {
            this.workerManager.updatePhysicsEntities(entities);
            this.workerManager.updateCollisionEntities(entities);
        }
    }
    
    // Perform physics step in worker
    performWorkerPhysicsStep(deltaTime) {
        if (this.settings.useWorkers && this.workersInitialized) {
            this.workerManager.performPhysicsStep(deltaTime);
        }
    }
    
    // Check collisions in worker
    checkWorkerCollisions(groups) {
        if (this.settings.useWorkers && this.workersInitialized) {
            this.workerManager.checkCollisions(groups);
        }
    }
    
    // Resize all systems
    resize(width, height) {
        this.width = width;
        this.height = height;
        
        // Resize particle batch
        this.particleBatch.resize(width, height);
        
        // Resize canvas layers
        this.canvasLayers.resize(width, height);
        
        // Resize particle canvas
        this.particleCanvas.width = width;
        this.particleCanvas.height = height;
        this.particleImageData = this.particleCtx.createImageData(width, height);
        
        // Update quadtree bounds
        this.quadtree = new Quadtree({
            x: 0,
            y: 0,
            width: width,
            height: height
        });
        
        // Resize worker canvas if using workers
        if (this.settings.useWorkers && this.workersInitialized) {
            this.workerManager.resizeParticleCanvas(width, height);
        }
    }
    
    // Get performance stats
    getStats() {
        const baseStats = {
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
        
        // Add temporal upsampling stats
        if (this.settings.useTemporalUpsampling) {
            Object.assign(baseStats, this.temporalUpsampler.getStats());
            Object.assign(baseStats, this.frameManager.getStats());
        }
        
        // Add typed particle stats
        if (this.settings.useTypedArrayParticles) {
            Object.assign(baseStats, {
                particleStats: this.typedParticleSystem.getStats()
            });
        }
        
        // Add worker stats
        if (this.settings.useWorkers) {
            Object.assign(baseStats, {
                workerStats: this.workerManager.getStats()
            });
        }
        
        return baseStats;
    }
    
    // Draw debug info
    drawDebug(ctx) {
        const stats = this.getStats();
        
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 250, 200);
        
        ctx.fillStyle = '#00ff00';
        ctx.font = '12px monospace';
        let y = 30;
        const lineHeight = 15;
        
        ctx.fillText(`FPS: ${stats.fps}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Frame Time: ${stats.frameTime.toFixed(2)}ms`, 20, y);
        y += lineHeight;
        ctx.fillText(`Batches: ${stats.renderBatchCount}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Quadtree: ${stats.quadtreeObjects}`, 20, y);
        y += lineHeight;
        ctx.fillText(`Path Cache: ${stats.pathCacheSize}`, 20, y);
        y += lineHeight;
        
        // Temporal upsampling stats
        if (stats.interpolation !== undefined) {
            ctx.fillText(`Interpolation: ${stats.interpolation}`, 20, y);
            y += lineHeight;
            ctx.fillText(`Update: ${stats.avgUpdateTime}ms @ ${stats.updateFPS}fps`, 20, y);
            y += lineHeight;
            ctx.fillText(`Render: ${stats.avgRenderTime}ms @ ${stats.renderFPS}fps`, 20, y);
            y += lineHeight;
        }
        
        // Particle stats
        if (stats.particleStats) {
            ctx.fillText(`Particles: ${stats.particleStats.active}/${stats.particleStats.max}`, 20, y);
            y += lineHeight;
        }
        
        // Worker stats
        if (stats.workerStats) {
            ctx.fillText(`Workers: ${stats.workerStats.supported ? 'Yes' : 'No'}`, 20, y);
            y += lineHeight;
        }
        
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
        this.workerManager.terminate();
    }
}