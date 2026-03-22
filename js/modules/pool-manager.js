// Object pooling system for efficient memory management
import { GAME_CONFIG } from './constants.js';
export class PoolManager {
    constructor(ObjectClass, initialSize) {
        this.ObjectClass = ObjectClass;
        this.pool = [];
        this.activeObjects = [];
        this.initialSize = initialSize;
        this.highWaterMark = 0; // Peak active object count (for pool sizing audit)
        this.totalAllocations = 0; // Total objects ever created (initial + overflow)

        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new ObjectClass());
        }
        this.totalAllocations = initialSize;
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
            this.totalAllocations++;
        }
        obj.reset(...args);
        // OPT-3: track position in activeObjects for O(1) release
        obj._poolIndex = this.activeObjects.length;
        this.activeObjects.push(obj);
        // Track peak usage for pool sizing audit
        if (this.activeObjects.length > this.highWaterMark) {
            this.highWaterMark = this.activeObjects.length;
        }
        return obj;
    }

    release(obj) {
        // OPT-3: O(1) swap-and-pop using _poolIndex — eliminates O(n) indexOf scan
        const index = obj._poolIndex;
        if (index === undefined || index < 0 || this.activeObjects[index] !== obj) {
            // Fallback: object not tracked (e.g. pre-existing objects without _poolIndex)
            const i = this.activeObjects.indexOf(obj);
            if (i === -1) return; // already released
            this.activeObjects[i] = this.activeObjects[this.activeObjects.length - 1];
            if (this.activeObjects[this.activeObjects.length - 1] !== obj) {
                this.activeObjects[this.activeObjects.length - 1]._poolIndex = i;
            }
            this.activeObjects.pop();
            obj.active = false;
            obj._poolIndex = -1;
            this.pool.push(obj);
            return;
        }
        // Fast path: use stored index directly
        const last = this.activeObjects[this.activeObjects.length - 1];
        this.activeObjects[index] = last;
        last._poolIndex = index;   // update swapped object's tracked position
        this.activeObjects.pop();
        obj.active = false;
        obj._poolIndex = -1;
        this.pool.push(obj);
    }
    
    updateActive(...args) {
        for (let i = this.activeObjects.length - 1; i >= 0; i--) {
            this.activeObjects[i].update(...args);
        }
    }
    
    drawActive(ctx, extra) {
        for (let i = 0; i < this.activeObjects.length; i++) {
            this.activeObjects[i].draw(ctx, extra);
        }
    }

    /**
     * Draw only objects whose bounding circle intersects the viewport.
     * Objects must have .x, .y and .radius (or a default is used).
     * Off-screen objects skip draw() entirely — update()/physics still run.
     */
    drawActiveVisible(ctx, viewLeft, viewTop, viewRight, viewBottom, extra) {
        for (let i = 0; i < this.activeObjects.length; i++) {
            const obj = this.activeObjects[i];
            const r = obj.radius || 10;
            if (obj.x + r < viewLeft || obj.x - r > viewRight ||
                obj.y + r < viewTop  || obj.y - r > viewBottom) continue;
            obj.draw(ctx, extra);
        }
    }

    getStats() {
        return {
            type: this.ObjectClass.name,
            initialSize: this.initialSize,
            active: this.activeObjects.length,
            pooled: this.pool.length,
            highWaterMark: this.highWaterMark,
            totalAllocations: this.totalAllocations,
            overflowAllocations: this.totalAllocations - this.initialSize
        };
    }

    cleanupInactive() {
        // OPT: iterate backwards so swap-and-pop inside release() doesn't skip elements
        for (let i = this.activeObjects.length - 1; i >= 0; i--) {
            if (!this.activeObjects[i].active) {
                this.release(this.activeObjects[i]);
            }
        }
    }
} 