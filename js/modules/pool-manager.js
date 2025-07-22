// Object pooling system for efficient memory management
import { GAME_CONFIG } from './constants.js';
export class PoolManager {
    constructor(ObjectClass, initialSize) {
        this.ObjectClass = ObjectClass;
        this.pool = [];
        this.activeObjects = [];
        
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new ObjectClass());
        }
    }
    
    get(...args) {
        // Performance: Limit total active objects for particle pools
        if (this.ObjectClass.name === 'Particle' && this.activeObjects.length > GAME_CONFIG.MAX_PARTICLES) {
            // Release oldest particle to make room for new one
            const oldestParticle = this.activeObjects[0];
            if (oldestParticle) {
                this.release(oldestParticle);
            }
        }
        
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = new this.ObjectClass();
        }
        obj.reset(...args);
        this.activeObjects.push(obj);
        return obj;
    }
    
    release(obj) {
        const index = this.activeObjects.indexOf(obj);
        if (index > -1) {
            this.activeObjects.splice(index, 1);
            obj.active = false;
            this.pool.push(obj);
        }
    }
    
    updateActive(...args) {
        for (let i = this.activeObjects.length - 1; i >= 0; i--) {
            this.activeObjects[i].update(...args);
        }
    }
    
    drawActive(ctx) {
        this.activeObjects.forEach(obj => obj.draw(ctx));
    }

    cleanupInactive() {
        for (let i = this.activeObjects.length - 1; i >= 0; i--) {
            const obj = this.activeObjects[i];
            if (!obj.active) {
                this.activeObjects.splice(i, 1);
                this.pool.push(obj);
            }
        }
    }
} 