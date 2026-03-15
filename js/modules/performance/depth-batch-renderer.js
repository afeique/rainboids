// Simple depth-based batching for stars - no sprites, just grouping by depth
// Pre-allocated bucket count: opacity quantized to 0.1 steps → indices 0..10
const BUCKET_COUNT = 11;

export class DepthBatchRenderer {
    constructor() {
        this.frameCount = 0;

        // Pre-allocate fixed depth buckets (index 0 = opacity 0.0, index 10 = opacity 1.0)
        // Each bucket holds pre-allocated arrays that are reused every frame via length reset
        this._bgBuckets = new Array(BUCKET_COUNT);
        this._colorBuckets = new Array(BUCKET_COUNT);
        for (let i = 0; i < BUCKET_COUNT; i++) {
            this._bgBuckets[i] = [];
            this._colorBuckets[i] = [];
        }

        // Pre-allocated structures for renderBackgroundStarBatch color grouping
        // We reuse a flat list of {color, stars[]} entries with a length counter
        this._bgColorEntries = [];   // [{color, stars[]}, ...]
        this._bgColorIndex = {};     // color string → index into _bgColorEntries
        this._bgColorCount = 0;

        // Pre-allocated structures for renderColorStarBatch shape-color grouping
        this._scEntries = [];        // [{shape, color, stars[]}, ...]
        this._scIndex = {};          // "shape\0color" → index into _scEntries
        this._scCount = 0;
    }

    // Group stars into depth buckets for efficient rendering
    groupStarsByDepth(backgroundStars, colorStars) {
        // Clear previous frame bucket contents without deallocating
        for (let i = 0; i < BUCKET_COUNT; i++) {
            this._bgBuckets[i].length = 0;
            this._colorBuckets[i].length = 0;
        }

        // Group background stars by depth
        for (const star of backgroundStars) {
            if (!star.active) continue;

            // Calculate depth bucket (quantize opacity to reduce buckets)
            const depthOpacity = Math.min(1, 0.4 + Math.pow(star.z / 4, 1.0));
            star.finalOpacity = star.opacity * depthOpacity;
            const idx = Math.max(0, Math.min(10, Math.round(star.finalOpacity * 10)));

            this._bgBuckets[idx].push(star);
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
            const idx = Math.max(0, Math.min(10, Math.round(star.finalOpacity * 10)));

            this._colorBuckets[idx].push(star);
        }
    }

    // Render all stars in depth-sorted batches
    renderDepthBatches(ctx) {
        this.frameCount++;

        // Iterate buckets in index order (0→10 = opacity 0.0→1.0, back to front)
        // No sorting needed — indices are already in ascending opacity order
        for (let i = 0; i < BUCKET_COUNT; i++) {
            const bg = this._bgBuckets[i];
            const color = this._colorBuckets[i];
            if (bg.length === 0 && color.length === 0) continue;

            // Set opacity once for the entire bucket
            ctx.save();
            ctx.globalAlpha = i / 10;

            // Render all background stars in this depth bucket
            this.renderBackgroundStarBatch(ctx, bg);

            // Render all color stars in this depth bucket
            this.renderColorStarBatch(ctx, color);

            ctx.restore();
        }
    }

    renderBackgroundStarBatch(ctx, stars) {
        if (stars.length === 0) return;

        // Reset pre-allocated color group structures (no new Map / new Array)
        this._bgColorCount = 0;
        // Clear index without reallocating the object — property delete is avoided;
        // we just overwrite stale entries and only iterate up to _bgColorCount.
        this._bgColorIndex = {};

        for (const star of stars) {
            let entryIdx = this._bgColorIndex[star.color];
            if (entryIdx === undefined) {
                entryIdx = this._bgColorCount++;
                this._bgColorIndex[star.color] = entryIdx;
                if (entryIdx < this._bgColorEntries.length) {
                    this._bgColorEntries[entryIdx].color = star.color;
                    this._bgColorEntries[entryIdx].stars.length = 0;
                } else {
                    this._bgColorEntries.push({ color: star.color, stars: [] });
                }
            }
            this._bgColorEntries[entryIdx].stars.push(star);
        }

        // Render each color group
        for (let g = 0; g < this._bgColorCount; g++) {
            const entry = this._bgColorEntries[g];
            ctx.fillStyle = entry.color;
            ctx.beginPath();

            // Add all circles to the same path
            const groupStars = entry.stars;
            for (let s = 0; s < groupStars.length; s++) {
                const star = groupStars[s];
                ctx.moveTo(star.x + star.radius, star.y);
                ctx.arc(star.x, star.y, star.radius, 0, 2 * Math.PI);
            }

            ctx.fill();
        }
    }

    renderColorStarBatch(ctx, stars) {
        if (stars.length === 0) return;

        // Reset pre-allocated shape-color group structures
        this._scCount = 0;
        this._scIndex = {};

        for (const star of stars) {
            const shape = star.shape || 'circle';
            const key = shape + '\0' + star.color;
            let entryIdx = this._scIndex[key];
            if (entryIdx === undefined) {
                entryIdx = this._scCount++;
                this._scIndex[key] = entryIdx;
                if (entryIdx < this._scEntries.length) {
                    this._scEntries[entryIdx].shape = shape;
                    this._scEntries[entryIdx].color = star.color;
                    this._scEntries[entryIdx].stars.length = 0;
                } else {
                    this._scEntries.push({ shape, color: star.color, stars: [] });
                }
            }
            this._scEntries[entryIdx].stars.push(star);
        }

        // Render each shape/color group
        for (let g = 0; g < this._scCount; g++) {
            const entry = this._scEntries[g];
            const shape = entry.shape;
            const color = entry.color;
            const groupStars = entry.stars;

            if (shape === 'circle' || shape === 'point') {
                // Circles can be batched like background stars
                ctx.fillStyle = color;
                ctx.beginPath();
                for (let s = 0; s < groupStars.length; s++) {
                    const star = groupStars[s];
                    const radius = star.radius * (star.sizeVariation || 1);
                    ctx.moveTo(star.x + radius, star.y);
                    ctx.arc(star.x, star.y, radius, 0, 2 * Math.PI);
                }
                ctx.fill();
            } else {
                // Other shapes need individual rendering but can share stroke style
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;

                for (let s = 0; s < groupStars.length; s++) {
                    const star = groupStars[s];
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
        let activeBuckets = 0;
        let totalStars = 0;
        for (let i = 0; i < BUCKET_COUNT; i++) {
            const bgLen = this._bgBuckets[i].length;
            const colorLen = this._colorBuckets[i].length;
            if (bgLen > 0 || colorLen > 0) activeBuckets++;
            totalStars += bgLen + colorLen;
        }
        return {
            frameCount: this.frameCount,
            depthBuckets: activeBuckets,
            totalStars
        };
    }
}

// Singleton instance
export const depthBatchRenderer = new DepthBatchRenderer(); 