// Quadtree implementation for efficient spatial partitioning and collision detection
export class Quadtree {
    constructor(bounds, maxObjects = 10, maxLevels = 5, level = 0) {
        this.maxObjects = maxObjects;
        this.maxLevels = maxLevels;
        this.level = level;
        this.bounds = bounds;
        this.objects = [];
        this.nodes = [];
    }
    
    // Clear the quadtree
    clear() {
        this.objects = [];
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i]) {
                this.nodes[i].clear();
                this.nodes[i] = null;
            }
        }
        this.nodes = [];
    }
    
    // Split the node into 4 subnodes
    split() {
        const subWidth = this.bounds.width / 2;
        const subHeight = this.bounds.height / 2;
        const x = this.bounds.x;
        const y = this.bounds.y;
        
        // Top right
        this.nodes[0] = new Quadtree({
            x: x + subWidth,
            y: y,
            width: subWidth,
            height: subHeight
        }, this.maxObjects, this.maxLevels, this.level + 1);
        
        // Top left
        this.nodes[1] = new Quadtree({
            x: x,
            y: y,
            width: subWidth,
            height: subHeight
        }, this.maxObjects, this.maxLevels, this.level + 1);
        
        // Bottom left
        this.nodes[2] = new Quadtree({
            x: x,
            y: y + subHeight,
            width: subWidth,
            height: subHeight
        }, this.maxObjects, this.maxLevels, this.level + 1);
        
        // Bottom right
        this.nodes[3] = new Quadtree({
            x: x + subWidth,
            y: y + subHeight,
            width: subWidth,
            height: subHeight
        }, this.maxObjects, this.maxLevels, this.level + 1);
    }
    
    // Determine which node the object belongs to
    getIndex(entity) {
        const indices = [];
        const verticalMidpoint = this.bounds.x + this.bounds.width / 2;
        const horizontalMidpoint = this.bounds.y + this.bounds.height / 2;
        
        const entityLeft = entity.x - entity.radius;
        const entityRight = entity.x + entity.radius;
        const entityTop = entity.y - entity.radius;
        const entityBottom = entity.y + entity.radius;
        
        // Object can fit within the top quadrants
        const topQuadrant = entityTop < horizontalMidpoint && entityBottom < horizontalMidpoint;
        // Object can fit within the bottom quadrants
        const bottomQuadrant = entityTop > horizontalMidpoint;
        
        // Object can fit within the left quadrants
        if (entityLeft < verticalMidpoint && entityRight < verticalMidpoint) {
            if (topQuadrant) {
                indices.push(1);
            } else if (bottomQuadrant) {
                indices.push(2);
            }
        }
        
        // Object can fit within the right quadrants
        if (entityLeft > verticalMidpoint) {
            if (topQuadrant) {
                indices.push(0);
            } else if (bottomQuadrant) {
                indices.push(3);
            }
        }
        
        // If object doesn't fit completely in a child node, it belongs to parent
        if (indices.length === 0) {
            indices.push(-1);
        }
        
        return indices;
    }
    
    // Insert object into the quadtree
    insert(entity) {
        if (this.nodes.length > 0) {
            const indices = this.getIndex(entity);
            
            for (let i = 0; i < indices.length; i++) {
                if (indices[i] !== -1) {
                    this.nodes[indices[i]].insert(entity);
                    return;
                }
            }
        }
        
        this.objects.push(entity);
        
        if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
            if (this.nodes.length === 0) {
                this.split();
            }
            
            let i = 0;
            while (i < this.objects.length) {
                const indices = this.getIndex(this.objects[i]);
                let removed = false;
                
                for (let j = 0; j < indices.length; j++) {
                    if (indices[j] !== -1) {
                        this.nodes[indices[j]].insert(this.objects[i]);
                        this.objects.splice(i, 1);
                        removed = true;
                        break;
                    }
                }
                
                if (!removed) {
                    i++;
                }
            }
        }
    }
    
    // Retrieve all objects that could collide with the given object
    retrieve(entity) {
        const returnObjects = [];
        const indices = this.getIndex(entity);
        
        if (this.nodes.length > 0) {
            for (let i = 0; i < indices.length; i++) {
                if (indices[i] !== -1) {
                    returnObjects.push(...this.nodes[indices[i]].retrieve(entity));
                } else {
                    // If entity doesn't fit in child, check all children
                    for (let j = 0; j < this.nodes.length; j++) {
                        returnObjects.push(...this.nodes[j].retrieve(entity));
                    }
                }
            }
        }
        
        returnObjects.push(...this.objects);
        
        return returnObjects;
    }
    
    // Get all objects in the quadtree
    getAllObjects() {
        let allObjects = [...this.objects];
        
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i]) {
                allObjects = allObjects.concat(this.nodes[i].getAllObjects());
            }
        }
        
        return allObjects;
    }
    
    // Debug draw the quadtree structure
    draw(ctx) {
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.strokeRect(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height);
        
        for (let i = 0; i < this.nodes.length; i++) {
            if (this.nodes[i]) {
                this.nodes[i].draw(ctx);
            }
        }
    }
}