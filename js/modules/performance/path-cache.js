// Path2D caching system for reusable shapes
export class PathCache {
    constructor() {
        this.cache = new Map();
    }
    
    // Get or create ship path
    getShipPath(size) {
        const key = `ship_${size}`;
        
        if (!this.cache.has(key)) {
            const path = new Path2D();
            path.moveTo(size, 0);
            path.lineTo(-size / 2, -size / 2);
            path.lineTo(-size / 3, 0);
            path.lineTo(-size / 2, size / 2);
            path.closePath();
            this.cache.set(key, path);
        }
        
        return this.cache.get(key);
    }
    
    // Get or create thruster flame path
    getThrusterPath(size) {
        const key = `thruster_${size}`;
        
        if (!this.cache.has(key)) {
            const path = new Path2D();
            path.moveTo(-size / 3, -size / 6);
            path.lineTo(-size / 1.5, 0);
            path.lineTo(-size / 3, size / 6);
            this.cache.set(key, path);
        }
        
        return this.cache.get(key);
    }
    
    // Get or create bullet path
    getBulletPath(radius) {
        const key = `bullet_${radius}`;
        
        if (!this.cache.has(key)) {
            const path = new Path2D();
            path.arc(0, 0, radius, 0, Math.PI * 2);
            this.cache.set(key, path);
        }
        
        return this.cache.get(key);
    }
    
    // Get or create star shape paths
    getStarPath(shape, radius, scale = 1) {
        const key = `star_${shape}_${radius}_${scale}`;
        
        if (!this.cache.has(key)) {
            const path = new Path2D();
            const actualRadius = radius * scale;
            
            switch (shape) {
                case 'diamond':
                    path.moveTo(0, -actualRadius);
                    path.lineTo(actualRadius, 0);
                    path.lineTo(0, actualRadius);
                    path.lineTo(-actualRadius, 0);
                    path.closePath();
                    break;
                    
                case 'plus':
                    const thickness = actualRadius * 0.3;
                    path.moveTo(-actualRadius, -thickness);
                    path.lineTo(-thickness, -thickness);
                    path.lineTo(-thickness, -actualRadius);
                    path.lineTo(thickness, -actualRadius);
                    path.lineTo(thickness, -thickness);
                    path.lineTo(actualRadius, -thickness);
                    path.lineTo(actualRadius, thickness);
                    path.lineTo(thickness, thickness);
                    path.lineTo(thickness, actualRadius);
                    path.lineTo(-thickness, actualRadius);
                    path.lineTo(-thickness, thickness);
                    path.lineTo(-actualRadius, thickness);
                    path.closePath();
                    break;
                    
                case 'star4':
                    this.drawStar(path, 4, actualRadius, actualRadius * 0.5);
                    break;
                    
                case 'star8':
                    this.drawStar(path, 8, actualRadius, actualRadius * 0.5);
                    break;
                    
                default:
                    // Default circle
                    path.arc(0, 0, actualRadius, 0, Math.PI * 2);
                    break;
            }
            
            this.cache.set(key, path);
        }
        
        return this.cache.get(key);
    }
    
    // Helper to draw star shapes
    drawStar(path, points, outerRadius, innerRadius) {
        const angle = Math.PI / points;
        
        path.moveTo(outerRadius, 0);
        
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = Math.cos(i * angle) * radius;
            const y = Math.sin(i * angle) * radius;
            path.lineTo(x, y);
        }
        
        path.closePath();
    }
    
    // Get or create health bar path
    getHealthBarPath(width, height, bevelSize) {
        const key = `healthbar_${width}_${height}_${bevelSize}`;
        
        if (!this.cache.has(key)) {
            const path = new Path2D();
            // Start from top-left with angled corner
            path.moveTo(bevelSize, 0);
            // Top edge with slight angle
            path.lineTo(width - bevelSize * 0.5, 0);
            // Angled top-right corner
            path.lineTo(width, bevelSize);
            // Right edge
            path.lineTo(width, height - bevelSize);
            // Angled bottom-right corner
            path.lineTo(width - bevelSize, height);
            // Bottom edge with angle
            path.lineTo(bevelSize * 0.5, height);
            // Angled bottom-left corner
            path.lineTo(0, height - bevelSize);
            // Left edge
            path.lineTo(0, bevelSize);
            // Close back to start
            path.closePath();
            
            this.cache.set(key, path);
        }
        
        return this.cache.get(key);
    }
    
    // Clear cache if needed (for memory management)
    clear() {
        this.cache.clear();
    }
    
    // Get cache size
    get size() {
        return this.cache.size;
    }
}

// Global instance
export const pathCache = new PathCache();