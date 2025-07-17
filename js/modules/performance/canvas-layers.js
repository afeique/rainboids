// Canvas layer system for separating static and dynamic content
export class CanvasLayers {
    constructor(container, width, height) {
        this.container = container;
        this.width = width;
        this.height = height;
        this.layers = {};
        this.contexts = {};
        this.dirty = new Set();
        
        // Define layer order (z-index)
        this.layerOrder = [
            'background',   // Static background
            'stars',        // Star field (rarely changes)
            'game',         // Main game objects
            'effects',      // Particles and effects
            'ui'           // HUD (static unless values change)
        ];
        
        this.initializeLayers();
    }
    
    initializeLayers() {
        this.layerOrder.forEach((layerName, index) => {
            const canvas = document.createElement('canvas');
            canvas.width = this.width;
            canvas.height = this.height;
            canvas.style.position = 'absolute';
            canvas.style.left = '0';
            canvas.style.top = '0';
            canvas.style.zIndex = index;
            canvas.style.pointerEvents = 'none';
            canvas.id = `layer-${layerName}`;
            
            this.layers[layerName] = canvas;
            this.contexts[layerName] = canvas.getContext('2d');
            this.container.appendChild(canvas);
            
            // Mark all layers as dirty initially
            this.dirty.add(layerName);
        });
    }
    
    // Get context for specific layer
    getContext(layerName) {
        return this.contexts[layerName];
    }
    
    // Mark layer as needing redraw
    markDirty(layerName) {
        this.dirty.add(layerName);
    }
    
    // Check if layer needs redraw
    isDirty(layerName) {
        return this.dirty.has(layerName);
    }
    
    // Clear dirty flag for layer
    clearDirty(layerName) {
        this.dirty.delete(layerName);
    }
    
    // Clear specific layer
    clearLayer(layerName) {
        if (this.contexts[layerName]) {
            this.contexts[layerName].clearRect(0, 0, this.width, this.height);
        }
    }
    
    // Clear only dirty layers
    clearDirtyLayers() {
        this.dirty.forEach(layerName => {
            this.clearLayer(layerName);
        });
    }
    
    // Resize all layers
    resize(width, height) {
        this.width = width;
        this.height = height;
        
        this.layerOrder.forEach(layerName => {
            const canvas = this.layers[layerName];
            canvas.width = width;
            canvas.height = height;
            this.markDirty(layerName);
        });
    }
    
    // Show/hide specific layer
    setLayerVisibility(layerName, visible) {
        if (this.layers[layerName]) {
            this.layers[layerName].style.display = visible ? 'block' : 'none';
        }
    }
    
    // Get composite image data (for screenshots, etc.)
    getCompositeImageData() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw all layers in order
        this.layerOrder.forEach(layerName => {
            tempCtx.drawImage(this.layers[layerName], 0, 0);
        });
        
        return tempCtx.getImageData(0, 0, this.width, this.height);
    }
    
    // Remove all layers from DOM
    destroy() {
        this.layerOrder.forEach(layerName => {
            const canvas = this.layers[layerName];
            if (canvas && canvas.parentNode) {
                canvas.parentNode.removeChild(canvas);
            }
        });
        
        this.layers = {};
        this.contexts = {};
        this.dirty.clear();
    }
}

// Star field cache for background layer
export class StarFieldCache {
    constructor() {
        this.cache = null;
        this.isDirty = true;
    }
    
    render(ctx, stars, width, height) {
        if (this.isDirty || !this.cache || this.cache.width !== width || this.cache.height !== height) {
            // Create or resize cache canvas
            if (!this.cache) {
                this.cache = document.createElement('canvas');
            }
            this.cache.width = width;
            this.cache.height = height;
            const cacheCtx = this.cache.getContext('2d');
            
            // Clear cache
            cacheCtx.clearRect(0, 0, width, height);
            
            // Render all stars to cache
            stars.forEach(star => {
                if (star.draw) {
                    star.draw(cacheCtx);
                }
            });
            
            this.isDirty = false;
        }
        
        // Draw cached star field
        ctx.drawImage(this.cache, 0, 0);
    }
    
    markDirty() {
        this.isDirty = true;
    }
}