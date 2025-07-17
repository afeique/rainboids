// Text caching system to avoid expensive text rendering every frame
export class TextCache {
    constructor(maxCacheSize = 100) {
        this.cache = new Map();
        this.maxCacheSize = maxCacheSize;
    }
    
    // Generate cache key from text properties
    getCacheKey(text, font, fillStyle, strokeStyle = null, lineWidth = 0) {
        return `${text}_${font}_${fillStyle}_${strokeStyle || 'none'}_${lineWidth}`;
    }
    
    // Get or create cached text canvas
    getText(text, font, fillStyle, strokeStyle = null, lineWidth = 0, textAlign = 'left', textBaseline = 'alphabetic') {
        const key = this.getCacheKey(text, font, fillStyle, strokeStyle, lineWidth);
        
        if (!this.cache.has(key)) {
            // Limit cache size
            if (this.cache.size >= this.maxCacheSize) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            
            // Create canvas for text
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Set font to measure text
            tempCtx.font = font;
            const metrics = tempCtx.measureText(text);
            
            // Calculate canvas size with padding
            const padding = Math.ceil(lineWidth) + 4;
            const width = Math.ceil(metrics.width) + padding * 2;
            const height = parseInt(font) * 1.5 + padding * 2;
            
            tempCanvas.width = width;
            tempCanvas.height = height;
            
            // Clear and setup context
            tempCtx.clearRect(0, 0, width, height);
            tempCtx.font = font;
            tempCtx.textAlign = textAlign;
            tempCtx.textBaseline = textBaseline;
            
            // Calculate text position
            let x = padding;
            let y = height / 2;
            
            if (textAlign === 'center') {
                x = width / 2;
            } else if (textAlign === 'right') {
                x = width - padding;
            }
            
            if (textBaseline === 'top') {
                y = padding;
            } else if (textBaseline === 'bottom') {
                y = height - padding;
            }
            
            // Draw stroke if specified
            if (strokeStyle && lineWidth > 0) {
                tempCtx.strokeStyle = strokeStyle;
                tempCtx.lineWidth = lineWidth;
                tempCtx.strokeText(text, x, y);
            }
            
            // Draw fill
            tempCtx.fillStyle = fillStyle;
            tempCtx.fillText(text, x, y);
            
            // Cache the result
            this.cache.set(key, {
                canvas: tempCanvas,
                width: metrics.width,
                actualWidth: width,
                actualHeight: height,
                offsetX: padding,
                offsetY: padding
            });
        }
        
        return this.cache.get(key);
    }
    
    // Draw cached text at position
    drawText(ctx, text, x, y, font, fillStyle, strokeStyle = null, lineWidth = 0, textAlign = 'center', textBaseline = 'middle') {
        const cached = this.getText(text, font, fillStyle, strokeStyle, lineWidth, textAlign, textBaseline);
        
        if (cached) {
            // Adjust position based on alignment
            let drawX = x;
            let drawY = y;
            
            if (textAlign === 'center') {
                drawX -= cached.actualWidth / 2;
            } else if (textAlign === 'right') {
                drawX -= cached.actualWidth;
            }
            
            if (textBaseline === 'middle') {
                drawY -= cached.actualHeight / 2;
            } else if (textBaseline === 'bottom') {
                drawY -= cached.actualHeight;
            }
            
            ctx.drawImage(cached.canvas, drawX, drawY);
        }
    }
    
    // Clear cache
    clear() {
        this.cache.clear();
    }
    
    // Get cache size
    get size() {
        return this.cache.size;
    }
}

// Specialized cache for frequently updated numeric values
export class NumberCache extends TextCache {
    constructor(maxValue = 9999, font = '12px monospace', fillStyle = '#ffffff', strokeStyle = '#000000', lineWidth = 2) {
        super(maxValue + 1);
        this.font = font;
        this.fillStyle = fillStyle;
        this.strokeStyle = strokeStyle;
        this.lineWidth = lineWidth;
        
        // Pre-cache common numbers
        this.precacheNumbers(0, Math.min(100, maxValue));
    }
    
    precacheNumbers(start, end) {
        for (let i = start; i <= end; i++) {
            this.getText(i.toString(), this.font, this.fillStyle, this.strokeStyle, this.lineWidth);
        }
    }
    
    drawNumber(ctx, value, x, y, textAlign = 'center', textBaseline = 'middle') {
        this.drawText(ctx, value.toString(), x, y, this.font, this.fillStyle, this.strokeStyle, this.lineWidth, textAlign, textBaseline);
    }
}

// Global instances
export const textCache = new TextCache();
export const damageNumberCache = new NumberCache(999, '10px monospace', '#ffffff', '#000000', 1);
export const scoreCache = new NumberCache(999999, '16px monospace', '#FFD700', '#000000', 2);