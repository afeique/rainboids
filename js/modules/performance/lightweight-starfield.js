// Lightweight starfield optimization - reduces draw calls without heavy caching
export class LightweightStarfieldOptimizer {
    constructor() {
        this.groupedStars = {
            backgroundStars: [],
            simpleColorStars: []
        };
        this.frameCount = 0;
    }

    // Group stars by rendering type to minimize context switches
    groupStarsForRendering(backgroundStars, colorStars) {
        // Clear previous frame's groups
        this.groupedStars.backgroundStars.length = 0;
        this.groupedStars.simpleColorStars.length = 0;

        // Group background stars by opacity ranges
        for (const star of backgroundStars) {
            if (star.active) {
                // Background stars don't need full draw() - just prepare basic properties
                const depthOpacity = Math.min(1, 0.4 + Math.pow(star.z / 4, 1.0));
                star.finalOpacity = star.opacity * depthOpacity;
                this.groupedStars.backgroundStars.push(star);
            }
        }

        // Group simple color stars (complex ones render themselves via original draw methods)
        for (const star of colorStars) {
            if (star.active) {
                // Complex stars need their full draw() method for special effects
                if (star.isBurst || star.shape === 'sparkle' || star.shape === 'burst') {
                    // These will be rendered normally, not optimized
                    continue;
                } else {
                    // Simple stars - just prepare properties
                    star.finalOpacity = star.opacity || 1;
                    this.groupedStars.simpleColorStars.push(star);
                }
            }
        }
    }

    // Render grouped stars with minimal context switches
    renderGroupedStars(ctx) {
        this.frameCount++;
        
        // Render background stars in groups by similar opacity
        this.renderStarGroup(ctx, this.groupedStars.backgroundStars, 'background');
        
        // Render simple color stars in groups
        this.renderStarGroup(ctx, this.groupedStars.simpleColorStars, 'color');
    }

    renderStarGroup(ctx, stars, type) {
        if (stars.length === 0) return;

        // Sort by opacity to minimize context switches
        stars.sort((a, b) => (a.finalOpacity || a.opacity) - (b.finalOpacity || b.opacity));

        let currentOpacity = -1;
        let savedState = false;

        for (const star of stars) {
            const opacity = star.finalOpacity || star.opacity || 1;
            
            // Only change context when opacity differs significantly
            if (Math.abs(currentOpacity - opacity) > 0.1) {
                if (savedState) ctx.restore();
                ctx.save();
                ctx.globalAlpha = opacity;
                currentOpacity = opacity;
                savedState = true;
            }

            // Simple direct rendering without sprites
            if (type === 'background' || star.shape === 'circle') {
                ctx.fillStyle = star.color;
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                // Simple path-based rendering for color stars
                ctx.strokeStyle = star.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                this.drawSimpleStarShape(ctx, star);
                ctx.stroke();
            }
        }

        if (savedState) ctx.restore();
    }

    drawSimpleStarShape(ctx, star) {
        const { x, y, radius, shape } = star;
        
        switch (shape) {
            case 'diamond':
                ctx.moveTo(x, y - radius);
                ctx.lineTo(x + radius, y);
                ctx.lineTo(x, y + radius);
                ctx.lineTo(x - radius, y);
                ctx.closePath();
                break;
            case 'plus':
                const halfSize = radius * 0.7;
                ctx.moveTo(x, y - halfSize);
                ctx.lineTo(x, y + halfSize);
                ctx.moveTo(x - halfSize, y);
                ctx.lineTo(x + halfSize, y);
                break;
            case 'cross':
                const diagSize = radius * 0.7;
                ctx.moveTo(x - diagSize, y - diagSize);
                ctx.lineTo(x + diagSize, y + diagSize);
                ctx.moveTo(x + diagSize, y - diagSize);
                ctx.lineTo(x - diagSize, y + diagSize);
                break;
            default:
                // Default to circle for unknown shapes
                ctx.arc(x, y, radius, 0, 2 * Math.PI);
        }
    }

    getStats() {
        return {
            frameCount: this.frameCount,
            backgroundStars: this.groupedStars.backgroundStars.length,
            simpleColorStars: this.groupedStars.simpleColorStars.length,
            totalOptimized: this.groupedStars.backgroundStars.length + this.groupedStars.simpleColorStars.length
        };
    }
}

// Singleton instance
export const lightweightStarfieldOptimizer = new LightweightStarfieldOptimizer(); 