// Simple depth-based batching for stars - no sprites, just grouping by depth
export class DepthBatchRenderer {
    constructor() {
        this.depthBuckets = new Map();
        this.frameCount = 0;
    }

    // Group stars into depth buckets for efficient rendering
    groupStarsByDepth(backgroundStars, colorStars) {
        // Clear previous frame buckets
        this.depthBuckets.clear();
        
        // Group background stars by depth
        for (const star of backgroundStars) {
            if (!star.active) continue;
            
            // Calculate depth bucket (quantize opacity to reduce buckets)
            const depthOpacity = Math.min(1, 0.4 + Math.pow(star.z / 4, 1.0));
            star.finalOpacity = star.opacity * depthOpacity;
            const bucket = Math.round(star.finalOpacity * 10) / 10; // Quantize to 0.1 steps
            
            if (!this.depthBuckets.has(bucket)) {
                this.depthBuckets.set(bucket, { background: [], color: [] });
            }
            this.depthBuckets.get(bucket).background.push(star);
        }
        
        // Group simple color stars by depth (complex ones render separately)
        for (const star of colorStars) {
            if (!star.active) continue;
            
            // Skip complex stars - they'll render individually
            if (star.isBurst || star.shape === 'sparkle' || star.shape === 'burst') {
                continue;
            }
            
            // Calculate depth bucket
            const depthOpacity = Math.min(1, 0.5 + Math.pow(star.z / 4, 1.2));
            star.finalOpacity = star.opacity * depthOpacity;
            const bucket = Math.round(star.finalOpacity * 10) / 10;
            
            if (!this.depthBuckets.has(bucket)) {
                this.depthBuckets.set(bucket, { background: [], color: [] });
            }
            this.depthBuckets.get(bucket).color.push(star);
        }
    }

    // Render all stars in depth-sorted batches
    renderDepthBatches(ctx) {
        this.frameCount++;
        
        // Sort buckets by opacity (back to front)
        const sortedBuckets = Array.from(this.depthBuckets.entries()).sort((a, b) => a[0] - b[0]);
        
        for (const [opacity, bucket] of sortedBuckets) {
            if (bucket.background.length === 0 && bucket.color.length === 0) continue;
            
            // Set opacity once for the entire bucket
            ctx.save();
            ctx.globalAlpha = opacity;
            
            // Render all background stars in this depth bucket
            this.renderBackgroundStarBatch(ctx, bucket.background);
            
            // Render all color stars in this depth bucket
            this.renderColorStarBatch(ctx, bucket.color);
            
            ctx.restore();
        }
    }

    renderBackgroundStarBatch(ctx, stars) {
        if (stars.length === 0) return;
        
        // Group by color for even more efficiency
        const colorGroups = new Map();
        for (const star of stars) {
            if (!colorGroups.has(star.color)) {
                colorGroups.set(star.color, []);
            }
            colorGroups.get(star.color).push(star);
        }
        
        // Render each color group
        for (const [color, colorStars] of colorGroups) {
            ctx.fillStyle = color;
            ctx.beginPath();
            
            // Add all circles to the same path
            for (const star of colorStars) {
                ctx.moveTo(star.x + star.radius, star.y);
                ctx.arc(star.x, star.y, star.radius, 0, 2 * Math.PI);
            }
            
            ctx.fill();
        }
    }

    renderColorStarBatch(ctx, stars) {
        if (stars.length === 0) return;
        
        // Group by shape and color
        const shapeColorGroups = new Map();
        for (const star of stars) {
            const key = `${star.shape || 'circle'}-${star.color}`;
            if (!shapeColorGroups.has(key)) {
                shapeColorGroups.set(key, []);
            }
            shapeColorGroups.get(key).push(star);
        }
        
        // Render each shape/color group
        for (const [key, groupStars] of shapeColorGroups) {
            const [shape, color] = key.split('-');
            
            if (shape === 'circle' || shape === 'point') {
                // Circles can be batched like background stars
                ctx.fillStyle = color;
                ctx.beginPath();
                for (const star of groupStars) {
                    const radius = star.radius * (star.sizeVariation || 1);
                    ctx.moveTo(star.x + radius, star.y);
                    ctx.arc(star.x, star.y, radius, 0, 2 * Math.PI);
                }
                ctx.fill();
            } else {
                // Other shapes need individual rendering but can share stroke style
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                
                for (const star of groupStars) {
                    ctx.save();
                    ctx.translate(star.x, star.y);
                    if (star.rotation) ctx.rotate(star.rotation);
                    
                    ctx.beginPath();
                    this.drawStarShape(ctx, shape, star.radius * (star.sizeVariation || 1));
                    ctx.stroke();
                    
                    ctx.restore();
                }
            }
        }
    }

    drawStarShape(ctx, shape, radius) {
        switch (shape) {
            case 'diamond':
                ctx.moveTo(0, -radius);
                ctx.lineTo(radius, 0);
                ctx.lineTo(0, radius);
                ctx.lineTo(-radius, 0);
                ctx.closePath();
                break;
            case 'star4':
                for (let i = 0; i < 8; i++) {
                    const angle = (i * Math.PI) / 4;
                    const r = i % 2 === 0 ? radius : radius * 0.4;
                    const x = Math.cos(angle) * r;
                    const y = Math.sin(angle) * r;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                break;
            case 'star5':
                for (let i = 0; i < 10; i++) {
                    const angle = (i * Math.PI) / 5;
                    const r = i % 2 === 0 ? radius : radius * 0.4;
                    const x = Math.cos(angle) * r;
                    const y = Math.sin(angle) * r;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                break;
            case 'triangle':
                for (let i = 0; i < 3; i++) {
                    const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                break;
            default:
                // Default to circle
                ctx.arc(0, 0, radius, 0, 2 * Math.PI);
        }
    }

    getStats() {
        return {
            frameCount: this.frameCount,
            depthBuckets: this.depthBuckets.size,
            totalStars: Array.from(this.depthBuckets.values()).reduce((sum, bucket) => 
                sum + bucket.background.length + bucket.color.length, 0)
        };
    }
}

// Singleton instance
export const depthBatchRenderer = new DepthBatchRenderer(); 