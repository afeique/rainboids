// Web Worker for collision detection
// Uses spatial partitioning (quadtree) for efficient broad-phase collision detection

class Quadtree {
    constructor(bounds, maxObjects = 10, maxLevels = 5, level = 0) {
        this.maxObjects = maxObjects;
        this.maxLevels = maxLevels;
        this.level = level;
        this.bounds = bounds;
        this.objects = [];
        this.nodes = [];
    }
    
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
    
    split() {
        const subWidth = this.bounds.width / 2;
        const subHeight = this.bounds.height / 2;
        const x = this.bounds.x;
        const y = this.bounds.y;
        
        this.nodes[0] = new Quadtree({
            x: x + subWidth,
            y: y,
            width: subWidth,
            height: subHeight
        }, this.maxObjects, this.maxLevels, this.level + 1);
        
        this.nodes[1] = new Quadtree({
            x: x,
            y: y,
            width: subWidth,
            height: subHeight
        }, this.maxObjects, this.maxLevels, this.level + 1);
        
        this.nodes[2] = new Quadtree({
            x: x,
            y: y + subHeight,
            width: subWidth,
            height: subHeight
        }, this.maxObjects, this.maxLevels, this.level + 1);
        
        this.nodes[3] = new Quadtree({
            x: x + subWidth,
            y: y + subHeight,
            width: subWidth,
            height: subHeight
        }, this.maxObjects, this.maxLevels, this.level + 1);
    }
    
    getIndex(entity) {
        const indices = [];
        const verticalMidpoint = this.bounds.x + this.bounds.width / 2;
        const horizontalMidpoint = this.bounds.y + this.bounds.height / 2;
        
        const entityLeft = entity.x - entity.radius;
        const entityRight = entity.x + entity.radius;
        const entityTop = entity.y - entity.radius;
        const entityBottom = entity.y + entity.radius;
        
        const topQuadrant = entityTop < horizontalMidpoint && entityBottom < horizontalMidpoint;
        const bottomQuadrant = entityTop > horizontalMidpoint;
        
        if (entityLeft < verticalMidpoint && entityRight < verticalMidpoint) {
            if (topQuadrant) indices.push(1);
            else if (bottomQuadrant) indices.push(2);
        }
        
        if (entityLeft > verticalMidpoint) {
            if (topQuadrant) indices.push(0);
            else if (bottomQuadrant) indices.push(3);
        }
        
        if (indices.length === 0) indices.push(-1);
        
        return indices;
    }
    
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
                
                if (!removed) i++;
            }
        }
    }
    
    retrieve(entity) {
        const returnObjects = [];
        const indices = this.getIndex(entity);
        
        if (this.nodes.length > 0) {
            for (let i = 0; i < indices.length; i++) {
                if (indices[i] !== -1) {
                    returnObjects.push(...this.nodes[indices[i]].retrieve(entity));
                } else {
                    for (let j = 0; j < this.nodes.length; j++) {
                        returnObjects.push(...this.nodes[j].retrieve(entity));
                    }
                }
            }
        }
        
        returnObjects.push(...this.objects);
        return returnObjects;
    }
}

// Global state
let quadtree = null;
let worldBounds = { x: 0, y: 0, width: 1920, height: 1080 };
let entities = new Map();

// Message handler
self.addEventListener('message', (e) => {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            initCollisionSystem(data);
            break;
            
        case 'updateEntities':
            updateEntities(data.entities);
            break;
            
        case 'checkCollisions':
            checkCollisions(data.groups);
            break;
            
        case 'checkSingleEntity':
            checkSingleEntityCollisions(data.entity, data.group);
            break;
            
        case 'clear':
            if (quadtree) quadtree.clear();
            entities.clear();
            break;
    }
});

// Initialize collision detection system
function initCollisionSystem(data) {
    worldBounds = data.bounds || worldBounds;
    quadtree = new Quadtree(worldBounds);
}

// Update entity data
function updateEntities(entityData) {
    entities.clear();
    if (quadtree) quadtree.clear();
    
    // Store entities and build quadtree
    entityData.forEach(entity => {
        entities.set(entity.id, entity);
        if (quadtree && entity.active !== false) {
            quadtree.insert(entity);
        }
    });
}

// Check collisions between groups
function checkCollisions(groups) {
    const collisions = [];
    
    // Check each group pair
    groups.forEach(group => {
        if (group.type === 'single') {
            // Single entity vs group
            const entity = entities.get(group.entityId);
            if (entity && quadtree) {
                const candidates = quadtree.retrieve(entity);
                
                candidates.forEach(candidate => {
                    if (candidate.id !== entity.id && 
                        group.targetTypes.includes(candidate.type) &&
                        checkCollision(entity, candidate)) {
                        collisions.push({
                            entity1: entity.id,
                            entity2: candidate.id,
                            type: `${entity.type}-${candidate.type}`
                        });
                    }
                });
            }
        } else if (group.type === 'group') {
            // Group vs group
            const groupEntities = Array.from(entities.values())
                .filter(e => group.sourceTypes.includes(e.type));
            
            groupEntities.forEach(entity => {
                if (quadtree) {
                    const candidates = quadtree.retrieve(entity);
                    
                    candidates.forEach(candidate => {
                        if (candidate.id !== entity.id &&
                            group.targetTypes.includes(candidate.type) &&
                            checkCollision(entity, candidate)) {
                            collisions.push({
                                entity1: entity.id,
                                entity2: candidate.id,
                                type: `${entity.type}-${candidate.type}`
                            });
                        }
                    });
                }
            });
        }
    });
    
    // Remove duplicates
    const uniqueCollisions = removeDuplicateCollisions(collisions);
    
    // Send results back
    self.postMessage({
        type: 'collisionResults',
        collisions: uniqueCollisions
    });
}

// Check if specific entity collides with group
function checkSingleEntityCollisions(entityData, targetGroup) {
    const collisions = [];
    
    if (quadtree) {
        const candidates = quadtree.retrieve(entityData);
        
        candidates.forEach(candidate => {
            if (candidate.id !== entityData.id &&
                targetGroup.includes(candidate.type) &&
                checkCollision(entityData, candidate)) {
                collisions.push({
                    entity1: entityData.id,
                    entity2: candidate.id,
                    type: `${entityData.type}-${candidate.type}`
                });
            }
        });
    }
    
    self.postMessage({
        type: 'singleEntityCollisions',
        entityId: entityData.id,
        collisions: collisions
    });
}

// Circle-circle collision check
function checkCollision(entity1, entity2) {
    const dx = entity2.x - entity1.x;
    const dy = entity2.y - entity1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < entity1.radius + entity2.radius;
}

// Remove duplicate collision pairs
function removeDuplicateCollisions(collisions) {
    const seen = new Set();
    return collisions.filter(collision => {
        const key1 = `${collision.entity1}-${collision.entity2}`;
        const key2 = `${collision.entity2}-${collision.entity1}`;
        
        if (seen.has(key1) || seen.has(key2)) {
            return false;
        }
        
        seen.add(key1);
        return true;
    });
}