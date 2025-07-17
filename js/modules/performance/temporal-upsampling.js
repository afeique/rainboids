// Temporal upsampling - render at lower framerate, interpolate to 60fps
export class TemporalUpsampler {
    constructor(targetFPS = 60, renderFPS = 30) {
        this.targetFPS = targetFPS;
        this.renderFPS = renderFPS;
        this.targetFrameTime = 1000 / targetFPS;
        this.renderFrameTime = 1000 / renderFPS;
        
        this.lastRenderTime = 0;
        this.lastUpdateTime = 0;
        this.accumulator = 0;
        this.interpolationAlpha = 0;
        
        // Store previous and current states for interpolation
        this.previousStates = new Map();
        this.currentStates = new Map();
        
        // Motion blur for fast objects
        this.motionBlurEnabled = true;
        this.motionBlurStrength = 0.3;
    }
    
    // Check if we should render a new frame
    shouldRender(currentTime) {
        const deltaTime = currentTime - this.lastRenderTime;
        if (deltaTime >= this.renderFrameTime) {
            this.lastRenderTime = currentTime;
            return true;
        }
        return false;
    }
    
    // Update interpolation alpha for smooth motion
    updateInterpolation(currentTime) {
        const timeSinceRender = currentTime - this.lastRenderTime;
        this.interpolationAlpha = Math.min(timeSinceRender / this.renderFrameTime, 1);
    }
    
    // Store entity state for interpolation
    saveEntityState(entity) {
        const id = entity.id || entity;
        
        // Move current to previous
        if (this.currentStates.has(id)) {
            this.previousStates.set(id, this.currentStates.get(id));
        }
        
        // Save current state
        this.currentStates.set(id, {
            x: entity.x,
            y: entity.y,
            angle: entity.angle || 0,
            radius: entity.radius,
            // Save any other interpolatable properties
            rotation: entity.rotation || 0,
            scale: entity.scale || 1,
            alpha: entity.alpha || 1
        });
    }
    
    // Get interpolated position for entity
    getInterpolatedState(entity) {
        const id = entity.id || entity;
        const current = this.currentStates.get(id);
        const previous = this.previousStates.get(id);
        
        if (!current || !previous) {
            return current || {
                x: entity.x,
                y: entity.y,
                angle: entity.angle || 0,
                radius: entity.radius,
                rotation: entity.rotation || 0,
                scale: entity.scale || 1,
                alpha: entity.alpha || 1
            };
        }
        
        // Linear interpolation
        const alpha = this.interpolationAlpha;
        return {
            x: previous.x + (current.x - previous.x) * alpha,
            y: previous.y + (current.y - previous.y) * alpha,
            angle: this.lerpAngle(previous.angle, current.angle, alpha),
            radius: previous.radius + (current.radius - previous.radius) * alpha,
            rotation: this.lerpAngle(previous.rotation, current.rotation, alpha),
            scale: previous.scale + (current.scale - previous.scale) * alpha,
            alpha: previous.alpha + (current.alpha - previous.alpha) * alpha
        };
    }
    
    // Lerp angles correctly (handle wrap-around)
    lerpAngle(a, b, t) {
        const diff = b - a;
        const shortestDiff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
        return a + shortestDiff * t;
    }
    
    // Draw with motion blur
    drawWithMotionBlur(ctx, entity, drawCallback) {
        if (!this.motionBlurEnabled) {
            drawCallback(ctx, entity);
            return;
        }
        
        const id = entity.id || entity;
        const current = this.currentStates.get(id);
        const previous = this.previousStates.get(id);
        
        if (!current || !previous) {
            drawCallback(ctx, entity);
            return;
        }
        
        // Calculate velocity for motion blur
        const vx = current.x - previous.x;
        const vy = current.y - previous.y;
        const speed = Math.sqrt(vx * vx + vy * vy);
        
        // Only apply motion blur for fast-moving objects
        if (speed > 5) {
            const blurSteps = Math.min(Math.floor(speed / 5), 5);
            const stepAlpha = this.motionBlurStrength / blurSteps;
            
            ctx.save();
            ctx.globalAlpha *= stepAlpha;
            
            // Draw multiple copies along motion path
            for (let i = 0; i < blurSteps; i++) {
                const t = i / blurSteps;
                const blurX = previous.x + (current.x - previous.x) * t;
                const blurY = previous.y + (current.y - previous.y) * t;
                
                ctx.save();
                ctx.translate(blurX - entity.x, blurY - entity.y);
                drawCallback(ctx, entity);
                ctx.restore();
            }
            
            ctx.restore();
        }
        
        // Draw current position
        drawCallback(ctx, entity);
    }
    
    // Get render statistics
    getStats() {
        return {
            targetFPS: this.targetFPS,
            renderFPS: this.renderFPS,
            interpolationAlpha: this.interpolationAlpha,
            stateCount: this.currentStates.size
        };
    }
    
    // Clear stored states (call when entities are destroyed)
    clearState(entity) {
        const id = entity.id || entity;
        this.previousStates.delete(id);
        this.currentStates.delete(id);
    }
}

// Frame timing manager with temporal upsampling
export class EnhancedFrameManager {
    constructor(updateFPS = 30, renderFPS = 60) {
        this.updateFPS = updateFPS;
        this.renderFPS = renderFPS;
        this.updateFrameTime = 1000 / updateFPS;
        this.renderFrameTime = 1000 / renderFPS;
        
        this.lastUpdateTime = performance.now();
        this.lastRenderTime = performance.now();
        this.updateAccumulator = 0;
        this.renderAccumulator = 0;
        
        this.updates = 0;
        this.renders = 0;
        this.maxUpdatesPerFrame = 3;
        
        // Temporal upsampler
        this.upsampler = new TemporalUpsampler(renderFPS, updateFPS);
        
        // Performance tracking
        this.updateTimes = [];
        this.renderTimes = [];
        this.maxHistorySize = 60;
    }
    
    tick(currentTime, updateCallback, renderCallback) {
        // Update accumulator
        const updateDelta = currentTime - this.lastUpdateTime;
        this.lastUpdateTime = currentTime;
        this.updateAccumulator += updateDelta;
        
        // Fixed timestep updates
        this.updates = 0;
        let updateStart = performance.now();
        
        while (this.updateAccumulator >= this.updateFrameTime && this.updates < this.maxUpdatesPerFrame) {
            updateCallback(this.updateFrameTime);
            this.updateAccumulator -= this.updateFrameTime;
            this.updates++;
        }
        
        // Track update performance
        const updateTime = performance.now() - updateStart;
        this.updateTimes.push(updateTime);
        if (this.updateTimes.length > this.maxHistorySize) {
            this.updateTimes.shift();
        }
        
        // Prevent spiral of death
        if (this.updates >= this.maxUpdatesPerFrame) {
            this.updateAccumulator = 0;
        }
        
        // Update interpolation for smooth rendering
        this.upsampler.updateInterpolation(currentTime);
        
        // Always render for smooth visuals
        const renderStart = performance.now();
        renderCallback(this.upsampler.interpolationAlpha);
        
        // Track render performance
        const renderTime = performance.now() - renderStart;
        this.renderTimes.push(renderTime);
        if (this.renderTimes.length > this.maxHistorySize) {
            this.renderTimes.shift();
        }
        
        this.renders++;
    }
    
    getStats() {
        const avgUpdateTime = this.updateTimes.length > 0 ?
            this.updateTimes.reduce((a, b) => a + b) / this.updateTimes.length : 0;
        const avgRenderTime = this.renderTimes.length > 0 ?
            this.renderTimes.reduce((a, b) => a + b) / this.renderTimes.length : 0;
            
        return {
            updateFPS: this.updateFPS,
            renderFPS: this.renderFPS,
            avgUpdateTime: avgUpdateTime.toFixed(2),
            avgRenderTime: avgRenderTime.toFixed(2),
            totalFrameTime: (avgUpdateTime + avgRenderTime).toFixed(2),
            interpolation: this.upsampler.interpolationAlpha.toFixed(3)
        };
    }
}