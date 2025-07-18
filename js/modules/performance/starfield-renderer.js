// Optimized starfield renderer with sprite caching and batched drawing
import { STAR_SHAPES } from '../constants.js';

export class StarfieldRenderer {
    constructor() {
        this.spriteCache = new Map();
        this.batchedStars = [];
        this.maxCacheSize = 100; // Limit cache size to prevent memory issues
        this.initialized = false;
        
        // Performance tracking
        this.frameCount = 0;
        this.totalBatchedStars = 0;
        this.totalDirectStars = 0;
    }
    
    initialize() {
        if (this.initialized) return;
        
        // Pre-generate common star sprites
        this.generateCommonSprites();
        this.initialized = true;
        
        console.log(`🚀 StarfieldRenderer initialized`);
    }
    
    generateCommonSprites() {
        const commonSizes = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32];
        const commonColors = ['#ffffff', '#ffdddd', '#ddffdd', '#ddddff', '#ffffdd', '#ffddff', '#ddffff'];
        const commonShapes = ['circle', 'diamond', 'star4', 'star5', 'star6', 'plus', 'x'];
        
        // Generate sprites for common combinations
        for (const size of commonSizes) {
            for (const color of commonColors) {
                // Background stars (simple circles)
                this.createStarSprite(size, color, 'circle', 1.0, false);
                
                // Color stars (various shapes)
                for (const shape of commonShapes) {
                    this.createStarSprite(size, color, shape, 1.0, false);
                }
            }
        }
    }
    
    createStarSprite(radius, color, shape, sizeVariation = 1.0, isBurst = false) {
        // Validate inputs
        if (!radius || radius <= 0 || !color || !shape) {
            console.warn('Invalid sprite parameters:', { radius, color, shape });
            return null;
        }
        
        const cacheKey = `${radius}-${color}-${shape}-${sizeVariation.toFixed(2)}-${isBurst}`;
        
        if (this.spriteCache.has(cacheKey)) {
            return this.spriteCache.get(cacheKey);
        }
        
        // Create off-screen canvas for sprite
        const canvas = document.createElement('canvas');
        const size = Math.ceil(radius * sizeVariation * 3); // Extra padding for effects
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            console.warn('Failed to create 2D context for sprite');
            return null;
        }
        
        const centerX = size / 2;
        const centerY = size / 2;
        const dynamicRadius = radius * sizeVariation;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        
        // Draw burst star glow effect if needed
        if (isBurst) {
            ctx.globalAlpha = 0.3;
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, dynamicRadius + 15, 0, 2 * Math.PI);
            ctx.stroke();
            
            // Inner bright core
            ctx.shadowBlur = 8;
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(0, 0, dynamicRadius * 0.6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
        
        // Draw the main star shape
        if (shape === 'circle') {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(0, 0, dynamicRadius, 0, 2 * Math.PI);
            ctx.fill();
        } else if (shape === 'point') {
            const borderSize = 1;
            ctx.fillStyle = color;
            ctx.fillRect(-dynamicRadius/2 - borderSize, -dynamicRadius/2 - borderSize, 
                        dynamicRadius + borderSize * 2, dynamicRadius + borderSize * 2);
            ctx.fillStyle = color;
            ctx.fillRect(-dynamicRadius/2, -dynamicRadius/2, dynamicRadius, dynamicRadius);
        } else {
            // Complex shapes
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            
            this.drawStarShape(ctx, shape, dynamicRadius);
            
            ctx.stroke();
        }
        
        ctx.restore();
        
        // Cache the sprite
        if (this.spriteCache.size < this.maxCacheSize) {
            this.spriteCache.set(cacheKey, canvas);
        }
        
        return canvas;
    }
    
    drawStarShape(ctx, shape, radius) {
        switch (shape) {
            case 'diamond':
                ctx.moveTo(0, -radius);
                ctx.lineTo(radius * 0.7, 0);
                ctx.lineTo(0, radius);
                ctx.lineTo(-radius * 0.7, 0);
                ctx.closePath();
                break;
                
            case 'triangle':
                ctx.moveTo(0, -radius);
                ctx.lineTo(radius * 0.8, radius * 0.5);
                ctx.lineTo(-radius * 0.8, radius * 0.5);
                ctx.closePath();
                break;
                
            case 'hexagon':
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    const x = Math.cos(a) * radius;
                    const y = Math.sin(a) * radius;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                break;
                
            case 'square':
                ctx.rect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
                break;
                
            case 'plus':
                ctx.moveTo(0, -radius);
                ctx.lineTo(0, radius);
                ctx.moveTo(-radius, 0);
                ctx.lineTo(radius, 0);
                break;
                
            case 'x':
                ctx.moveTo(-radius, -radius);
                ctx.lineTo(radius, radius);
                ctx.moveTo(radius, -radius);
                ctx.lineTo(-radius, radius);
                break;
                
            case 'star4':
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    const r = i % 2 === 0 ? radius : radius * 0.4;
                    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                ctx.closePath();
                break;
                
            case 'star5':
                for (let i = 0; i < 10; i++) {
                    const a = i * Math.PI / 5;
                    const r = i % 2 === 0 ? radius : radius * 0.4;
                    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                ctx.closePath();
                break;
                
            case 'star6':
                for (let i = 0; i < 12; i++) {
                    const a = i * Math.PI / 6;
                    const r = i % 2 === 0 ? radius : radius * 0.4;
                    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                ctx.closePath();
                break;
                
            case 'star8':
                for (let i = 0; i < 16; i++) {
                    const a = i * Math.PI / 8;
                    const r = i % 2 === 0 ? radius : radius * 0.4;
                    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                ctx.closePath();
                break;
                
            case 'sparkle':
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    const length = (i % 2 === 0) ? radius : radius * 0.6;
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * length, Math.sin(a) * length);
                }
                break;
                
            case 'burst':
                for (let i = 0; i < 12; i++) {
                    const a = i * Math.PI / 6;
                    const length = radius * (0.5 + Math.random() * 0.5);
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * length, Math.sin(a) * length);
                }
                break;
                
            default:
                // Default to simple circle
                ctx.arc(0, 0, radius, 0, 2 * Math.PI);
                break;
        }
    }
    
    // Batch stars for efficient rendering
    addStarToBatch(star, starType = 'color') {
        this.batchedStars.push({
            star,
            type: starType
        });
    }
    
    // Render all batched stars efficiently
    renderBatchedStars(ctx) {
        if (this.batchedStars.length === 0) return;
        
        // Track performance
        this.frameCount++;
        this.totalBatchedStars += this.batchedStars.length;
        
        // Sort by opacity/blend mode for more efficient rendering
        this.batchedStars.sort((a, b) => {
            const opacityA = a.star.opacity * (a.star.depthOpacity || 1);
            const opacityB = b.star.opacity * (b.star.depthOpacity || 1);
            return opacityB - opacityA; // Render more opaque stars first
        });
        
        ctx.save();
        
        // Batch render stars with similar properties together
        let currentOpacity = -1;
        let savedCount = 0;
        
        for (const { star, type } of this.batchedStars) {
            if (!star.active) continue;
            
            // Use pre-calculated properties from star.draw()
            const finalOpacity = star.finalOpacity || star.opacity || 1;
            
            // Calculate dynamic radius for rendering
            const pulseMultiplier = star.pulseOffset ? 
                1 + Math.sin(star.pulseOffset) * 0.1 : 1;
            const dynamicRadius = star.radius * (star.sizeVariation || 1) * pulseMultiplier;
            
            // Only save/restore when opacity changes significantly
            if (Math.abs(currentOpacity - finalOpacity) > 0.05) {
                if (savedCount > 0) ctx.restore();
                ctx.save();
                ctx.globalAlpha = finalOpacity;
                currentOpacity = finalOpacity;
                savedCount++;
            }
            
            // Get or create sprite (use base radius for caching, apply scaling during render)
            const baseRadius = Math.round(star.radius);
            const sprite = this.getStarSprite(star, baseRadius, type);
            
            if (sprite) {
                // Fast sprite blitting with scaling if needed
                const scale = dynamicRadius / baseRadius;
                const spriteSize = sprite.width * scale;
                
                if (scale !== 1) {
                    // Apply scaling transform
                    ctx.save();
                    ctx.translate(star.x, star.y);
                    ctx.scale(scale, scale);
                    ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
                    ctx.restore();
                } else {
                    // Direct blitting (no scaling needed)
                    ctx.drawImage(
                        sprite,
                        star.x - sprite.width / 2,
                        star.y - sprite.height / 2
                    );
                }
            } else {
                // Fallback to direct rendering for complex/unique stars
                this.renderStarDirect(ctx, star, dynamicRadius, type);
            }
        }
        
        if (savedCount > 0) ctx.restore();
        ctx.restore();
        
        // Clear batch for next frame
        this.batchedStars.length = 0;
    }
    
    getStarSprite(star, radius, type) {
        if (type === 'background') {
            // Simple circle sprite for background stars
            return this.createStarSprite(
                Math.round(radius),
                star.color,
                'circle',
                1.0,
                false
            );
        } else {
            // Color star sprite
            return this.createStarSprite(
                Math.round(radius),
                star.color,
                star.shape || 'circle',
                1.0,
                star.isBurst || false
            );
        }
    }
    
    renderStarDirect(ctx, star, radius, type) {
        // Fallback direct rendering for stars that can't be cached
        ctx.save();
        ctx.translate(star.x, star.y);
        
        if (star.rotation) {
            ctx.rotate(star.rotation);
        }
        
        // Use the star's pre-calculated opacity
        ctx.globalAlpha = star.finalOpacity || star.opacity || 1;
        
        if (type === 'background' || star.shape === 'circle') {
            ctx.fillStyle = star.color;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, 2 * Math.PI);
            ctx.fill();
        } else {
            // Complex shape rendering
            ctx.strokeStyle = star.color;
            ctx.lineWidth = 1.5 + (star.z || 1) / 3;
            ctx.beginPath();
            this.drawStarShape(ctx, star.shape, radius);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // Clear cache (useful for memory management)
    clearCache() {
        this.spriteCache.clear();
    }
    
    // Get cache statistics
    getCacheStats() {
        const avgBatchedPerFrame = this.frameCount > 0 ? this.totalBatchedStars / this.frameCount : 0;
        const avgDirectPerFrame = this.frameCount > 0 ? this.totalDirectStars / this.frameCount : 0;
        
        return {
            size: this.spriteCache.size,
            maxSize: this.maxCacheSize,
            memoryUsage: this.estimateMemoryUsage(),
            frameCount: this.frameCount,
            avgBatchedPerFrame: Math.round(avgBatchedPerFrame * 10) / 10,
            avgDirectPerFrame: Math.round(avgDirectPerFrame * 10) / 10,
            totalOptimizedStars: this.totalBatchedStars
        };
    }
    
    estimateMemoryUsage() {
        let totalPixels = 0;
        for (const canvas of this.spriteCache.values()) {
            totalPixels += canvas.width * canvas.height;
        }
        // Rough estimate: 4 bytes per pixel (RGBA)
        return totalPixels * 4;
    }
}

// Singleton instance
export const starfieldRenderer = new StarfieldRenderer(); 