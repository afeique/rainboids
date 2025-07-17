// Worker Manager - Coordinates all web workers for parallel processing
export class WorkerManager {
    constructor() {
        this.workers = {
            physics: null,
            collision: null,
            particles: null
        };
        
        this.callbacks = new Map();
        this.pendingMessages = new Map();
        this.messageId = 0;
        
        this.enabled = {
            physics: true,
            collision: true,
            particles: true
        };
        
        // Check for worker support
        this.workersSupported = typeof Worker !== 'undefined';
    }
    
    // Initialize all workers
    async init(config = {}) {
        if (!this.workersSupported) {
            console.warn('Web Workers not supported, falling back to main thread');
            return false;
        }
        
        try {
            // Initialize physics worker
            if (this.enabled.physics) {
                this.workers.physics = new Worker('./js/workers/physics-worker.js');
                this.setupWorkerHandlers(this.workers.physics, 'physics');
                this.workers.physics.postMessage({
                    type: 'init',
                    data: { config: config.physics || {} }
                });
            }
            
            // Initialize collision worker
            if (this.enabled.collision) {
                this.workers.collision = new Worker('./js/workers/collision-worker.js');
                this.setupWorkerHandlers(this.workers.collision, 'collision');
                this.workers.collision.postMessage({
                    type: 'init',
                    data: { bounds: config.worldBounds || { x: 0, y: 0, width: 1920, height: 1080 } }
                });
            }
            
            // Initialize particle worker
            if (this.enabled.particles) {
                this.workers.particles = new Worker('./js/workers/particle-worker.js');
                this.setupWorkerHandlers(this.workers.particles, 'particles');
                this.workers.particles.postMessage({
                    type: 'init',
                    data: {
                        maxParticles: config.maxParticles || 10000,
                        width: config.width || 1920,
                        height: config.height || 1080
                    }
                });
            }
            
            return true;
        } catch (error) {
            console.error('Failed to initialize workers:', error);
            return false;
        }
    }
    
    // Setup message handlers for a worker
    setupWorkerHandlers(worker, name) {
        worker.addEventListener('message', (e) => {
            this.handleWorkerMessage(name, e.data);
        });
        
        worker.addEventListener('error', (e) => {
            console.error(`Worker ${name} error:`, e);
        });
    }
    
    // Handle messages from workers
    handleWorkerMessage(workerName, data) {
        const { type, messageId } = data;
        
        // Handle specific message types
        switch (workerName) {
            case 'physics':
                this.handlePhysicsMessage(data);
                break;
            case 'collision':
                this.handleCollisionMessage(data);
                break;
            case 'particles':
                this.handleParticleMessage(data);
                break;
        }
        
        // Call any pending callbacks
        if (messageId && this.callbacks.has(messageId)) {
            const callback = this.callbacks.get(messageId);
            this.callbacks.delete(messageId);
            callback(data);
        }
    }
    
    // Handle physics worker messages
    handlePhysicsMessage(data) {
        if (data.type === 'physicsUpdate' && this.onPhysicsUpdate) {
            this.onPhysicsUpdate(data.entities);
        }
    }
    
    // Handle collision worker messages
    handleCollisionMessage(data) {
        if (data.type === 'collisionResults' && this.onCollisions) {
            this.onCollisions(data.collisions);
        } else if (data.type === 'singleEntityCollisions' && this.onSingleEntityCollisions) {
            this.onSingleEntityCollisions(data.entityId, data.collisions);
        }
    }
    
    // Handle particle worker messages
    handleParticleMessage(data) {
        if (data.type === 'renderComplete' && this.onParticleRender) {
            this.onParticleRender(data.imageData);
        }
    }
    
    // Send message to worker with optional callback
    sendToWorker(workerName, message, callback) {
        const worker = this.workers[workerName];
        if (!worker) return;
        
        if (callback) {
            const id = this.messageId++;
            message.messageId = id;
            this.callbacks.set(id, callback);
        }
        
        worker.postMessage(message);
    }
    
    // Physics operations
    updatePhysicsEntities(entities) {
        this.sendToWorker('physics', {
            type: 'updateEntities',
            data: { entities }
        });
    }
    
    performPhysicsStep(deltaTime) {
        this.sendToWorker('physics', {
            type: 'physicsStep',
            data: { deltaTime }
        });
    }
    
    applyForce(entityId, force) {
        this.sendToWorker('physics', {
            type: 'applyForce',
            data: { id: entityId, force }
        });
    }
    
    // Collision operations
    updateCollisionEntities(entities) {
        this.sendToWorker('collision', {
            type: 'updateEntities',
            data: { entities }
        });
    }
    
    checkCollisions(groups) {
        this.sendToWorker('collision', {
            type: 'checkCollisions',
            data: { groups }
        });
    }
    
    checkSingleEntityCollisions(entity, targetGroup) {
        this.sendToWorker('collision', {
            type: 'checkSingleEntity',
            data: { entity, group: targetGroup }
        });
    }
    
    // Particle operations
    emitParticles(particles) {
        this.sendToWorker('particles', {
            type: 'emit',
            data: { particles }
        });
    }
    
    updateParticles(deltaTime) {
        this.sendToWorker('particles', {
            type: 'update',
            data: { deltaTime }
        });
    }
    
    renderParticles() {
        this.sendToWorker('particles', {
            type: 'render'
        });
    }
    
    clearParticles() {
        this.sendToWorker('particles', {
            type: 'clear'
        });
    }
    
    resizeParticleCanvas(width, height) {
        this.sendToWorker('particles', {
            type: 'resize',
            data: { width, height }
        });
    }
    
    // Cleanup
    terminate() {
        Object.values(this.workers).forEach(worker => {
            if (worker) {
                worker.terminate();
            }
        });
        
        this.workers = {
            physics: null,
            collision: null,
            particles: null
        };
        
        this.callbacks.clear();
        this.pendingMessages.clear();
    }
    
    // Check if workers are available
    isAvailable() {
        return this.workersSupported && Object.values(this.workers).some(w => w !== null);
    }
    
    // Get worker statistics
    getStats() {
        return {
            supported: this.workersSupported,
            active: {
                physics: !!this.workers.physics,
                collision: !!this.workers.collision,
                particles: !!this.workers.particles
            },
            pendingCallbacks: this.callbacks.size
        };
    }
}

// Example usage wrapper for game integration
export class WorkerGameIntegration {
    constructor(gameEngine) {
        this.gameEngine = gameEngine;
        this.workerManager = new WorkerManager();
        this.useWorkers = true;
        
        // Bind callbacks
        this.workerManager.onPhysicsUpdate = this.handlePhysicsUpdate.bind(this);
        this.workerManager.onCollisions = this.handleCollisions.bind(this);
        this.workerManager.onParticleRender = this.handleParticleRender.bind(this);
    }
    
    async init() {
        const config = {
            worldBounds: {
                x: 0,
                y: 0,
                width: this.gameEngine.width,
                height: this.gameEngine.height
            },
            maxParticles: 10000,
            width: this.gameEngine.width,
            height: this.gameEngine.height
        };
        
        const success = await this.workerManager.init(config);
        if (!success) {
            this.useWorkers = false;
            console.log('Falling back to main thread processing');
        }
        
        return success;
    }
    
    // Handle physics updates from worker
    handlePhysicsUpdate(entities) {
        entities.forEach(update => {
            const entity = this.gameEngine.getEntityById(update.id);
            if (entity) {
                entity.x = update.x;
                entity.y = update.y;
                entity.vx = update.vx;
                entity.vy = update.vy;
            }
        });
    }
    
    // Handle collision results from worker
    handleCollisions(collisions) {
        collisions.forEach(collision => {
            this.gameEngine.resolveCollision(collision.entity1, collision.entity2, collision.type);
        });
    }
    
    // Handle particle render from worker
    handleParticleRender(imageData) {
        // Draw particle image data to canvas
        this.gameEngine.ctx.putImageData(imageData, 0, 0);
    }
    
    // Update cycle
    update(deltaTime) {
        if (!this.useWorkers) return;
        
        // Send entity data to workers
        const entities = this.gameEngine.getAllEntities();
        this.workerManager.updatePhysicsEntities(entities);
        this.workerManager.updateCollisionEntities(entities);
        
        // Perform physics step
        this.workerManager.performPhysicsStep(deltaTime);
        
        // Check collisions
        const collisionGroups = [
            {
                type: 'single',
                entityId: this.gameEngine.player.id,
                targetTypes: ['asteroid', 'star']
            },
            {
                type: 'group',
                sourceTypes: ['bullet'],
                targetTypes: ['asteroid']
            }
        ];
        this.workerManager.checkCollisions(collisionGroups);
        
        // Update particles
        this.workerManager.updateParticles(deltaTime);
        this.workerManager.renderParticles();
    }
    
    cleanup() {
        this.workerManager.terminate();
    }
}