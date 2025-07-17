// Frustum culling to skip rendering of off-screen objects
export class ViewFrustum {
    constructor(padding = 100) {
        this.padding = padding; // Extra padding to handle objects entering view
        this.bounds = {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0
        };
    }
    
    // Update viewport bounds
    update(x, y, width, height) {
        this.bounds.left = x - this.padding;
        this.bounds.top = y - this.padding;
        this.bounds.right = x + width + this.padding;
        this.bounds.bottom = y + height + this.padding;
    }
    
    // Check if entity is visible within frustum
    isVisible(entity) {
        const radius = entity.radius || 0;
        
        return entity.x + radius > this.bounds.left &&
               entity.x - radius < this.bounds.right &&
               entity.y + radius > this.bounds.top &&
               entity.y - radius < this.bounds.bottom;
    }
    
    // Filter array of entities to only visible ones
    filterVisible(entities) {
        return entities.filter(entity => this.isVisible(entity));
    }
    
    // Check if a rectangle is visible
    isRectVisible(x, y, width, height) {
        return x + width > this.bounds.left &&
               x < this.bounds.right &&
               y + height > this.bounds.top &&
               y < this.bounds.bottom;
    }
    
    // Get visible entities from quadtree
    getVisibleFromQuadtree(quadtree) {
        const visibleBounds = {
            x: this.bounds.left,
            y: this.bounds.top,
            width: this.bounds.right - this.bounds.left,
            height: this.bounds.bottom - this.bounds.top
        };
        
        // Create dummy entity representing viewport for quadtree query
        const viewportEntity = {
            x: visibleBounds.x + visibleBounds.width / 2,
            y: visibleBounds.y + visibleBounds.height / 2,
            radius: Math.max(visibleBounds.width, visibleBounds.height) / 2
        };
        
        // Get potentially visible entities from quadtree
        const candidates = quadtree.retrieve(viewportEntity);
        
        // Further filter to actual visible entities
        return candidates.filter(entity => this.isVisible(entity));
    }
    
    // Debug draw frustum bounds
    draw(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            this.bounds.left,
            this.bounds.top,
            this.bounds.right - this.bounds.left,
            this.bounds.bottom - this.bounds.top
        );
        ctx.restore();
    }
}