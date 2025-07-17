// Web Worker for physics calculations
// Handles entity position updates, velocity calculations, and physics simulation

let entities = new Map();
let config = {
    friction: 0.99,
    maxSpeed: 10,
    deltaTime: 16.67 // 60fps
};

// Message handler
self.addEventListener('message', (e) => {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            config = { ...config, ...data.config };
            break;
            
        case 'updateEntities':
            updateEntities(data.entities);
            break;
            
        case 'physicsStep':
            performPhysicsStep(data.deltaTime);
            break;
            
        case 'addEntity':
            addEntity(data.entity);
            break;
            
        case 'removeEntity':
            removeEntity(data.id);
            break;
            
        case 'applyForce':
            applyForce(data.id, data.force);
            break;
            
        case 'clear':
            entities.clear();
            break;
    }
});

// Update entities from main thread
function updateEntities(entityData) {
    // Convert array data to map for efficient lookups
    entityData.forEach(entity => {
        if (!entities.has(entity.id)) {
            entities.set(entity.id, {
                id: entity.id,
                x: entity.x,
                y: entity.y,
                vx: entity.vx || 0,
                vy: entity.vy || 0,
                ax: 0,
                ay: 0,
                mass: entity.mass || 1,
                radius: entity.radius || 10,
                friction: entity.friction || config.friction,
                maxSpeed: entity.maxSpeed || config.maxSpeed,
                type: entity.type
            });
        } else {
            // Update existing entity
            const existing = entities.get(entity.id);
            Object.assign(existing, entity);
        }
    });
}

// Add single entity
function addEntity(entity) {
    entities.set(entity.id, {
        id: entity.id,
        x: entity.x,
        y: entity.y,
        vx: entity.vx || 0,
        vy: entity.vy || 0,
        ax: 0,
        ay: 0,
        mass: entity.mass || 1,
        radius: entity.radius || 10,
        friction: entity.friction || config.friction,
        maxSpeed: entity.maxSpeed || config.maxSpeed,
        type: entity.type
    });
}

// Remove entity
function removeEntity(id) {
    entities.delete(id);
}

// Apply force to entity
function applyForce(id, force) {
    const entity = entities.get(id);
    if (entity) {
        entity.ax += force.x / entity.mass;
        entity.ay += force.y / entity.mass;
    }
}

// Perform physics simulation step
function performPhysicsStep(deltaTime) {
    const dt = deltaTime / 16.67; // Normalize to 60fps
    const updatedEntities = [];
    
    // Update each entity
    entities.forEach(entity => {
        // Update velocity based on acceleration
        entity.vx += entity.ax * dt;
        entity.vy += entity.ay * dt;
        
        // Apply friction
        entity.vx *= entity.friction;
        entity.vy *= entity.friction;
        
        // Limit speed
        const speed = Math.sqrt(entity.vx * entity.vx + entity.vy * entity.vy);
        if (speed > entity.maxSpeed) {
            const scale = entity.maxSpeed / speed;
            entity.vx *= scale;
            entity.vy *= scale;
        }
        
        // Update position
        entity.x += entity.vx * dt;
        entity.y += entity.vy * dt;
        
        // Reset acceleration
        entity.ax = 0;
        entity.ay = 0;
        
        // Add to update list
        updatedEntities.push({
            id: entity.id,
            x: entity.x,
            y: entity.y,
            vx: entity.vx,
            vy: entity.vy
        });
    });
    
    // Send updated positions back to main thread
    self.postMessage({
        type: 'physicsUpdate',
        entities: updatedEntities
    });
}

// Gravitational attraction between entities
function applyGravity(entity1, entity2, G = 0.1) {
    const dx = entity2.x - entity1.x;
    const dy = entity2.y - entity1.y;
    const distSquared = dx * dx + dy * dy;
    
    if (distSquared < 100) return; // Minimum distance to avoid singularity
    
    const dist = Math.sqrt(distSquared);
    const force = G * entity1.mass * entity2.mass / distSquared;
    
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    
    entity1.ax += fx / entity1.mass;
    entity1.ay += fy / entity1.mass;
    
    entity2.ax -= fx / entity2.mass;
    entity2.ay -= fy / entity2.mass;
}

// Elastic collision response
function resolveCollision(entity1, entity2) {
    const dx = entity2.x - entity1.x;
    const dy = entity2.y - entity1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) return;
    
    // Normal vector
    const nx = dx / dist;
    const ny = dy / dist;
    
    // Relative velocity
    const dvx = entity2.vx - entity1.vx;
    const dvy = entity2.vy - entity1.vy;
    
    // Relative velocity in collision normal direction
    const dvn = dvx * nx + dvy * ny;
    
    // Do not resolve if velocities are separating
    if (dvn > 0) return;
    
    // Collision impulse
    const impulse = 2 * dvn / (1 / entity1.mass + 1 / entity2.mass);
    
    // Apply impulse
    entity1.vx += impulse * nx / entity1.mass;
    entity1.vy += impulse * ny / entity1.mass;
    
    entity2.vx -= impulse * nx / entity2.mass;
    entity2.vy -= impulse * ny / entity2.mass;
    
    // Separate overlapping entities
    const overlap = entity1.radius + entity2.radius - dist;
    if (overlap > 0) {
        const separation = overlap / 2;
        entity1.x -= nx * separation;
        entity1.y -= ny * separation;
        entity2.x += nx * separation;
        entity2.y += ny * separation;
    }
}