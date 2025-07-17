// Wrapper to make TypedArrayParticleSystem compatible with existing PoolManager interface
import { TypedArrayParticleSystem } from './typed-array-particles.js';

export class ParticleSystemWrapper {
    constructor(maxParticles = 10000) {
        this.system = new TypedArrayParticleSystem(maxParticles);
        
        // Map string types to numeric types
        this.typeMap = {
            'explosion': this.system.PARTICLE_TYPES.EXPLOSION,
            'explosionRedOrange': this.system.PARTICLE_TYPES.EXPLOSION,
            'explosionPulse': this.system.PARTICLE_TYPES.EXPLOSION,
            'fieryExplosionRing': this.system.PARTICLE_TYPES.EXPLOSION,
            'starBlip': this.system.PARTICLE_TYPES.STAR_COLLECT,
            'starSparkle': this.system.PARTICLE_TYPES.STAR_COLLECT,
            'damageNumber': this.system.PARTICLE_TYPES.DAMAGE_NUMBER,
            'shieldHit': this.system.PARTICLE_TYPES.SHIELD_HIT,
            'asteroidCollisionDebris': this.system.PARTICLE_TYPES.LINE_DEBRIS,
            'tractorBeam': this.system.PARTICLE_TYPES.TRACTOR_BEAM
        };
        
        // Store damage numbers separately for text rendering
        this.damageNumbers = new Map();
    }
    
    // Emulate PoolManager's get() method
    get(x, y, type, value = null) {
        const particleType = this.typeMap[type] ?? this.system.PARTICLE_TYPES.BASIC;
        
        switch(type) {
            case 'explosion':
            case 'explosionRedOrange':
                this.system.emitExplosion(x, y, 25, 5, {r: 255, g: 100, b: 0});
                break;
                
            case 'explosionPulse':
                // Create expanding ring effect
                const pulseRadius = value || 30;
                for (let i = 0; i < 30; i++) {
                    const angle = (i / 30) * Math.PI * 2;
                    const speed = pulseRadius * 0.15;
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;
                    this.system.emit(x, y, vx, vy, 3, 0.6, 255, 200, 50, 1, particleType, 0.92);
                }
                break;
                
            case 'fieryExplosionRing':
                // Create fiery ring effect
                const ringRadius = value || 40;
                for (let i = 0; i < 40; i++) {
                    const angle = (i / 40) * Math.PI * 2;
                    const speed = ringRadius * 0.12;
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;
                    this.system.emit(x, y, vx, vy, 4, 0.8, 255, 150, 30, 1, particleType, 0.94);
                }
                break;
                
            case 'starBlip':
                // Create star collection effect
                for (let i = 0; i < 20; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 2 + Math.random() * 3;
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;
                    this.system.emit(x, y, vx, vy, 2, 0.5, 255, 255, 100, 1, particleType, 0.95);
                }
                break;
                
            case 'starSparkle':
                // Create sparkle effect for idle stars
                const sparkleX = x + (value?.offsetX || 0);
                const sparkleY = y + (value?.offsetY || 0);
                for (let i = 0; i < 5; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 0.5 + Math.random();
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;
                    this.system.emit(sparkleX, sparkleY, vx, vy, 1.5, 0.3, 255, 255, 200, 1, particleType, 0.98);
                }
                break;
                
            case 'damageNumber':
                // Store damage number for text rendering
                const index = this.system.emit(x, y - 20, 0, -2, 0, 1.5, 255, 100, 100, 1, particleType, 1);
                if (index >= 0) {
                    this.damageNumbers.set(index, { value: value || 0 });
                }
                break;
                
            case 'shieldHit':
                // Create shield impact effect
                const shieldRadius = value || 30;
                for (let i = 0; i < 15; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 1 + Math.random() * 2;
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;
                    this.system.emit(x, y, vx, vy, 2, 0.4, 100, 200, 255, 1, particleType, 0.96);
                }
                break;
                
            case 'asteroidCollisionDebris':
                // Create debris particles
                for (let i = 0; i < 10; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 2 + Math.random() * 4;
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;
                    this.system.emit(x, y, vx, vy, 1.5, 0.6, 150, 150, 150, 1, particleType, 0.94);
                }
                break;
                
            case 'tractorBeam':
                // Create tractor beam particle
                const targetX = value?.targetX || x;
                const targetY = value?.targetY || y;
                const dx = targetX - x;
                const dy = targetY - y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0) {
                    const vx = (dx / dist) * 5;
                    const vy = (dy / dist) * 5;
                    this.system.emit(x, y, vx, vy, 2, 0.8, 100, 255, 200, 0.8, particleType, 0.99);
                }
                break;
        }
        
        return null; // For compatibility
    }
    
    // Update all active particles
    updateActive() {
        this.system.update();
        
        // Clean up damage numbers for inactive particles
        for (const [index, data] of this.damageNumbers.entries()) {
            if (this.system.active[index] === 0) {
                this.damageNumbers.delete(index);
            }
        }
    }
    
    // Draw all active particles
    drawActive(ctx) {
        this.system.render(ctx);
        
        // Render damage numbers as text
        ctx.save();
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        for (const [index, data] of this.damageNumbers.entries()) {
            if (this.system.active[index] === 1) {
                const alpha = this.system.life[index] / this.system.maxLife[index];
                ctx.fillStyle = `rgba(255, 100, 100, ${alpha})`;
                ctx.fillText(
                    data.value.toString(),
                    this.system.positionX[index],
                    this.system.positionY[index]
                );
            }
        }
        
        ctx.restore();
    }
    
    // Reset all particles
    reset() {
        this.system.clear();
        this.damageNumbers.clear();
    }
    
    // Clean up inactive particles (for compatibility - typed arrays don't need this)
    cleanupInactive() {
        // No-op - typed array system automatically handles cleanup
        // This method exists for API compatibility only
    }
}