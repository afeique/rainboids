// Powerup system for enhanced combat capabilities
import { GAME_CONFIG } from '../constants.js';
import { random, wrap } from '../utils.js';

export const POWERUP_TYPES = {
    RAPID_FIRE: {
        name: 'Rapid Fire',
        color: '#ff3300',
        gradientColors: ['#ff6600', '#ff0000'],
        icon: '⚡',
        duration: 60000, // 1 minute
        effect: 'rapidFire',
        rarity: 0.3,
        description: '25% faster shooting per stack'
    },
    MULTI_SHOT: {
        name: 'Multi-Shot',
        color: '#3366ff',
        gradientColors: ['#66aaff', '#0033cc'],
        icon: '※',
        duration: 60000, // 1 minute
        effect: 'multiShot',
        rarity: 0.25,
        description: 'Fire +1 bullet per stack'
    },
    HOMING: {
        name: 'Homing Bullets',
        color: '#ff3399',
        gradientColors: ['#ff66cc', '#cc0066'],
        icon: '🎯',
        duration: 60000, // 1 minute
        effect: 'homing',
        rarity: 0.2,
        description: 'Bullets track enemies'
    },
    BIG_BULLETS: {
        name: 'Big Bullets',
        color: '#33cc33',
        gradientColors: ['#66ff66', '#009900'],
        icon: '●',
        duration: 60000, // 1 minute
        effect: 'bigBullets',
        rarity: 0.25,
        description: '+30% bullet size per stack'
    },
    SPEED_BOOST: {
        name: 'Speed Boost',
        color: '#ffcc00',
        gradientColors: ['#ffff33', '#cc9900'],
        icon: '💨',
        duration: 60000, // 1 minute
        effect: 'speedBoost',
        rarity: 0.3,
        description: 'Increased movement speed'
    },
    PIERCING: {
        name: 'Piercing Shots',
        color: '#ff9933',
        gradientColors: ['#ffcc66', '#cc6600'],
        icon: '➤',
        duration: 60000, // 1 minute
        effect: 'piercing',
        rarity: 0.15,
        description: 'Pierce through multiple enemies'
    },
    SPREAD_SHOT: {
        name: 'Spread Shot',
        color: '#33ccff',
        gradientColors: ['#66ddff', '#0099cc'],
        icon: '⇶',
        duration: 60000, // 1 minute
        effect: 'spreadShot',
        rarity: 0.2,
        description: 'Fire +2 bullets in wide spread'
    },
    EXPLOSIVE: {
        name: 'Explosive Rounds',
        color: '#ff6600',
        gradientColors: ['#ff9933', '#cc3300'],
        icon: '💥',
        duration: 60000, // 1 minute
        effect: 'explosive',
        rarity: 0.1,
        description: 'Area damage on impact'
    },
    CRIT_CHANCE: {
        name: 'Critical Chance',
        color: '#ffcc00',
        gradientColors: ['#ffff66', '#cc9900'],
        icon: '🎯',
        duration: 15000, // 15 seconds for drops
        effect: 'critChance',
        rarity: 0.2,
        description: '+5% critical hit chance'
    },
    CRIT_DAMAGE: {
        name: 'Critical Damage',
        color: '#ff0066',
        gradientColors: ['#ff3399', '#cc0033'],
        icon: '💥',
        duration: 15000, // 15 seconds for drops
        effect: 'critDamage',
        rarity: 0.15,
        description: '+10% critical hit damage'
    },
    SHIELD_BOOST: {
        name: 'Shield Boost',
        color: '#00cc88',
        gradientColors: ['#33ff99', '#006644'],
        icon: '🛡',
        duration: 60000, // 1 minute
        effect: 'shieldBoost',
        rarity: 0.2,
        description: 'Temporary damage reduction'
    }
};

export class Powerup {
    constructor() {
        this.active = false;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        // Initialize to prevent undefined errors
        this.type = null;
        this.config = null;
    }
    
    reset(x, y, type = null) {
        this.x = x;
        this.y = y;
        
        // Choose random powerup type if not specified
        if (!type) {
            const types = Object.keys(POWERUP_TYPES);
            const weights = types.map(t => POWERUP_TYPES[t].rarity);
            type = this.weightedRandomChoice(types, weights);
        }
        
        this.type = type;
        this.config = POWERUP_TYPES[type];
        
        // Safety check for invalid powerup types
        if (!this.config) {
            console.warn(`Invalid powerup type: ${type}, falling back to RAPID_FIRE`);
            this.type = 'RAPID_FIRE';
            this.config = POWERUP_TYPES['RAPID_FIRE'];
        }
        
        // Additional safety check for config structure
        if (!this.config.gradientColors || !Array.isArray(this.config.gradientColors)) {
            console.warn(`Config for ${this.type} missing gradientColors array:`, this.config);
            this.config.gradientColors = ['#ff0000', '#990000']; // Default fallback
        }
        
        // Store config properties directly to prevent reference issues
        this.powerupColor = this.config.color;
        this.powerupIcon = this.config.icon;
        this.gradientColors = this.config.gradientColors ? [...this.config.gradientColors] : ['#ff0000', '#990000']; // Copy array safely
        
        this.color = this.powerupColor;
        this.icon = this.powerupIcon;
        
        this.radius = 18; // Slightly larger for better visibility
        this.active = true;
        this.life = 600; // 10 seconds at 60fps before despawning (start at max)
        this.maxLife = 600;
        this.pulsePhase = random(0, Math.PI * 2);
        
        // Floating movement
        this.vel = {
            x: random(-0.5, 0.5),
            y: random(-0.5, 0.5)
        };
        
        // Enhanced attraction to player when close
        this.attractionRadius = 120; // Larger attraction radius for easier collection
        this.attractionStrength = 0.03; // Stronger attraction
    }
    
    weightedRandomChoice(items, weights) {
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        let randomValue = Math.random() * totalWeight;
        
        for (let i = 0; i < items.length; i++) {
            randomValue -= weights[i];
            if (randomValue <= 0) {
                return items[i];
            }
        }
        
        return items[items.length - 1]; // Fallback
    }
    
    update(playerRef) {
        if (!this.active) return;
        
        this.life--;
        if (this.life <= 0) {
            this.active = false;
            return;
        }
        
        // Pulse effect
        this.pulsePhase += 0.1;
        
        // Gentle floating movement
        this.x += this.vel.x;
        this.y += this.vel.y;
        
        // Attraction to player when close
        if (playerRef && playerRef.active) {
            const dx = playerRef.x - this.x;
            const dy = playerRef.y - this.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance < this.attractionRadius && distance > 0) {
                const attractionForce = this.attractionStrength * (1 - distance / this.attractionRadius);
                this.vel.x += (dx / distance) * attractionForce;
                this.vel.y += (dy / distance) * attractionForce;
            }
        }
        
        // Gentle friction
        this.vel.x *= 0.98;
        this.vel.y *= 0.98;
        
        // Screen wrapping
        wrap(this, this.width, this.height);
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        // Safety check for required properties
        if (!this.gradientColors || this.gradientColors.length < 2) {
            console.warn(`Powerup ${this.type} missing gradientColors, skipping draw`);
            return;
        }
        
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Enhanced pulsing effect for visibility
        const pulse = 0.85 + Math.sin(this.pulsePhase) * 0.15;
        const currentRadius = this.radius * pulse;
        
        // Rotation for visual appeal
        const rotation = Date.now() * 0.003;
        ctx.rotate(rotation);
        
        // Fade out as life decreases
        const alpha = Math.min(1, this.life / 120); // Start fading in last 2 seconds
        if (this.life <= 0) {
            ctx.restore();
            return;
        }
        ctx.globalAlpha = alpha;
        
        // Spectacular outer aura/glow
        const glowRadius = currentRadius * 2.5;
        const gradient = ctx.createRadialGradient(0, 0, currentRadius * 0.3, 0, 0, glowRadius);
        gradient.addColorStop(0, this.gradientColors[0] + '88'); // Semi-transparent inner
        gradient.addColorStop(0.4, this.gradientColors[1] + '44'); // More transparent mid
        gradient.addColorStop(1, this.gradientColors[1] + '00'); // Fully transparent outer
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Main powerup body with gradient fill
        const bodyGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, currentRadius);
        bodyGradient.addColorStop(0, this.gradientColors[0]); // Bright center
        bodyGradient.addColorStop(0.7, this.gradientColors[1]); // Darker edge
        bodyGradient.addColorStop(1, this.gradientColors[1] + 'CC'); // Slightly transparent edge
        
        // Draw distinctive shape based on powerup type
        ctx.fillStyle = bodyGradient;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        
        if (this.type === 'HOMING') {
            // Diamond shape for homing
            ctx.beginPath();
            ctx.moveTo(0, -currentRadius);
            ctx.lineTo(currentRadius * 0.8, 0);
            ctx.lineTo(0, currentRadius);
            ctx.lineTo(-currentRadius * 0.8, 0);
            ctx.closePath();
        } else if (this.type === 'EXPLOSIVE') {
            // Star shape for explosive
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const radius = i % 2 === 0 ? currentRadius : currentRadius * 0.5;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        } else if (this.type === 'CRIT_CHANCE') {
            // Target/crosshair shape for critical chance
            ctx.beginPath();
            ctx.arc(0, 0, currentRadius, 0, Math.PI * 2);
            ctx.closePath();
            // Add crosshair
            ctx.moveTo(-currentRadius * 0.6, 0);
            ctx.lineTo(currentRadius * 0.6, 0);
            ctx.moveTo(0, -currentRadius * 0.6);
            ctx.lineTo(0, currentRadius * 0.6);
        } else if (this.type === 'CRIT_DAMAGE') {
            // Spiky star for critical damage
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const radius = i % 2 === 0 ? currentRadius : currentRadius * 0.3;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        } else if (this.type === 'SHIELD_BOOST') {
            // Octagon for shield
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const x = Math.cos(angle) * currentRadius;
                const y = Math.sin(angle) * currentRadius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        } else {
            // Hexagon for others
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const x = Math.cos(angle) * currentRadius;
                const y = Math.sin(angle) * currentRadius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        
        ctx.fill();
        ctx.stroke();
        
        // Icon with enhanced visibility
        ctx.shadowBlur = 3;
        ctx.shadowColor = '#000000';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.font = `bold ${currentRadius * 0.8}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw icon with outline for better visibility
        ctx.strokeText(this.icon, 0, 0);
        ctx.fillText(this.icon, 0, 0);
        
        // Sparkling edge effect
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = alpha * 0.8;
        
        const sparkleCount = 6;
        for (let i = 0; i < sparkleCount; i++) {
            const angle = (i / sparkleCount) * Math.PI * 2 + rotation * 2;
            const sparkleRadius = currentRadius + 8;
            const x = Math.cos(angle) * sparkleRadius;
            const y = Math.sin(angle) * sparkleRadius;
            
            ctx.beginPath();
            ctx.moveTo(x - 3, y);
            ctx.lineTo(x + 3, y);
            ctx.moveTo(x, y - 3);
            ctx.lineTo(x, y + 3);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    checkCollision(player) {
        if (!this.active || !player.active) return false;
        
        const dx = this.x - player.x;
        const dy = this.y - player.y;
        const distance = Math.hypot(dx, dy);
        
        // Generous collision radius for easier collection
        const collectionRadius = this.radius + player.radius + 8;
        return distance < collectionRadius;
    }
} 