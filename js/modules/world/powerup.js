// Powerup system for enhanced combat capabilities
import { GAME_CONFIG } from '../core/constants.js';
import { random, wrap, glowSpriteCache } from '../core/utils.js';
import { frameClock } from '../core/frame-clock.js';

// ── Cached body gradients ──────────────────────────────────────────────────
// `createRadialGradient` allocates a fresh GPU-uploaded gradient on every
// call. The two gradients each powerup needs (outer aura + body fill) are
// purely a function of (gradientColors[0], gradientColors[1]) — they do
// not depend on screen position or rotation. Build them once per unique
// color pair and cache. The pulse-scaling effect is applied via
// `ctx.scale(pulse, pulse)` instead of rebuilding the gradient at the new
// radius every frame, so the cached gradient and the path stay in sync.
const _powerupGradientCache = new Map();
const POWERUP_BASE_RADIUS = 18; // matches `this.radius` set in reset()
const POWERUP_GLOW_RADIUS = POWERUP_BASE_RADIUS * 2.5;
const POWERUP_ICON_FONT = `bold ${POWERUP_BASE_RADIUS * 0.8}px Arial`;

function getPowerupGradients(ctx, gradientColors) {
    const key = gradientColors[0] + '|' + gradientColors[1];
    let entry = _powerupGradientCache.get(key);
    if (entry) return entry;

    // Outer aura — translucent, expanding falloff.
    const outer = ctx.createRadialGradient(0, 0, POWERUP_BASE_RADIUS * 0.3, 0, 0, POWERUP_GLOW_RADIUS);
    outer.addColorStop(0, gradientColors[0] + '88');
    outer.addColorStop(0.4, gradientColors[1] + '44');
    outer.addColorStop(1, gradientColors[1] + '00');

    // Body — bright center to slightly translucent edge.
    const body = ctx.createRadialGradient(0, 0, 0, 0, 0, POWERUP_BASE_RADIUS);
    body.addColorStop(0, gradientColors[0]);
    body.addColorStop(0.7, gradientColors[1]);
    body.addColorStop(1, gradientColors[1] + 'CC');

    entry = { outer, body };
    _powerupGradientCache.set(key, entry);
    return entry;
}

export const POWERUP_TYPES = {
    RAPID_FIRE: {
        name: 'Rapid',
        color: '#ff3300',
        gradientColors: ['#ff6600', '#ff0000'],
        icon: '⚡',
        duration: 30000, // 30 seconds
        effect: 'rapidFire',
        rarity: 0.3,
        description: '25% faster shooting per stack'
    },
    MULTI_SHOT: {
        name: 'Multi',
        color: '#3366ff',
        gradientColors: ['#66aaff', '#0033cc'],
        icon: '✳️',
        duration: 30000, // 30 seconds
        effect: 'multiShot',
        rarity: 0.25,
        description: 'Fire +1 bullet per stack'
    },
    HOMING: {
        name: 'Homing',
        color: '#ff3399',
        gradientColors: ['#ff66cc', '#cc0066'],
        icon: '🎯',
        duration: 30000, // 30 seconds
        effect: 'homing',
        rarity: 0.2,
        description: 'Bullets track enemies'
    },
    BIG_BULLETS: {
        name: 'Big',
        color: '#33cc33',
        gradientColors: ['#66ff66', '#009900'],
        icon: '🔵',
        duration: 30000, // 30 seconds
        effect: 'bigBullets',
        rarity: 0.25,
        description: '+30% bullet size per stack'
    },
    SPEED_BOOST: {
        name: 'Afterburner',
        color: '#ffcc00',
        gradientColors: ['#ffff33', '#cc9900'],
        icon: '💨',
        duration: 30000,
        effect: 'speedBoost',
        rarity: 0.25,
        description: '+50% thrust & top speed'
    },
    PIERCING: {
        name: 'Pierce',
        color: '#ff9933',
        gradientColors: ['#ffcc66', '#cc6600'],
        icon: '🏹',
        duration: 30000, // 30 seconds
        effect: 'piercing',
        rarity: 0.15,
        description: 'Pierce through multiple enemies'
    },
    EXPLOSIVE: {
        name: 'Explode',
        color: '#ff6600',
        gradientColors: ['#ff9933', '#cc3300'],
        icon: '💣',
        duration: 30000, // 30 seconds
        effect: 'explosive',
        rarity: 0.1,
        description: 'Area damage on impact'
    },
    CRIT_CHANCE: {
        name: 'Crit %',
        color: '#ffcc00',
        gradientColors: ['#ffff66', '#cc9900'],
        icon: '⭐',
        duration: 30000, // 30 seconds for drops
        effect: 'critChance',
        rarity: 0.2,
        description: '+5% critical hit chance'
    },
    CRIT_DAMAGE: {
        name: 'Crit Dmg',
        color: '#ff0066',
        gradientColors: ['#ff3399', '#cc0033'],
        icon: '🗡️',
        duration: 30000, // 30 seconds for drops
        effect: 'critDamage',
        rarity: 0.15,
        description: '+10% critical hit damage (2-3x base)'
    },
    SHIELD_BOOST: {
        name: 'Shield',
        color: '#00cc88',
        gradientColors: ['#33ff99', '#006644'],
        icon: '🛡',
        duration: 30000, // 30 seconds
        effect: 'shieldBoost',
        rarity: 0.2,
        description: 'Temporary damage reduction'
    },
    MEDPACK: {
        name: 'Medic',
        color: '#ff6699',
        gradientColors: ['#ff99cc', '#cc3366'],
        icon: '💊',
        duration: 30000,
        effect: 'medpack',
        rarity: 0.2,
        description: 'More health per orb'
    },
    DOCTOR: {
        name: 'Doctor',
        color: '#ff6688',
        gradientColors: ['#ff99aa', '#cc2244'],
        icon: '🏥',
        duration: 30000,
        effect: 'doctor',
        rarity: 0.1,
        description: 'Increases the max amount of health per orb'
    },
    PAYDAY: {
        name: 'Payday',
        color: '#66ff66',
        gradientColors: ['#88ff88', '#228822'],
        icon: '💵',
        duration: 30000,
        effect: 'payday',
        rarity: 0.15,
        description: 'More money per orb'
    },
    HIGH_ROLLER: {
        name: 'High Roller',
        color: '#ffdd44',
        gradientColors: ['#ffee66', '#cc8800'],
        icon: '🎰',
        duration: 30000,
        effect: 'highRoller',
        rarity: 0.1,
        description: 'Increases the max amount of money per orb'
    },
    LONG_RANGE: {
        name: 'Range',
        color: '#88cc44',
        gradientColors: ['#bbff66', '#448800'],
        icon: '🏹',
        duration: 30000,
        effect: 'longRange',
        rarity: 0.25,
        description: '+40% bullet range per stack'
    },
    HEALTH_ORB_DROP_CHANCE: {
        name: 'Health Luck',
        color: '#33ff99',
        gradientColors: ['#66ffbb', '#009944'],
        icon: '🍀',
        duration: 45000,
        effect: 'healthOrbDropChance',
        rarity: 0.15,
        description: '+5% health orb drop chance'
    },
    MONEY_ORB_DROP_CHANCE: {
        name: 'Gold Luck',
        color: '#ffdd00',
        gradientColors: ['#ffee66', '#cc8800'],
        icon: '💰',
        duration: 45000,
        effect: 'moneyOrbDropChance',
        rarity: 0.15,
        description: '+5% money orb drop chance'
    },
    HEALTH_ORB_DROP_QUANTITY: {
        name: 'Health Bounty',
        color: '#66ff66',
        gradientColors: ['#99ff99', '#009900'],
        icon: '💚',
        duration: 45000,
        effect: 'healthOrbDropQuantity',
        rarity: 0.1,
        description: '+1 health orbs per drop'
    },
    MONEY_ORB_DROP_QUANTITY: {
        name: 'Gold Bounty',
        color: '#ffcc00',
        gradientColors: ['#ffdd66', '#996600'],
        icon: '🪙',
        duration: 45000,
        effect: 'moneyOrbDropQuantity',
        rarity: 0.1,
        description: '+1 money orbs per drop'
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
        // TESTING: drastically shortened lifetime to verify blink behavior.
        // Restore to 90 * LOGIC_HZ for production.
        this.life = 8 * GAME_CONFIG.LOGIC_HZ;
        this.maxLife = this.life;
        // Blink across the last 75% of the lifetime so the wind-down is
        // unmistakably visible during testing.
        this.fadeDuration = this.life * 0.75;
        this.pulsePhase = random(0, Math.PI * 2);
        
        // Floating movement (scaled for tick rate)
        const ts = GAME_CONFIG.TICK_SCALE;
        this.vel = {
            x: random(-0.5, 0.5) * ts,
            y: random(-0.5, 0.5) * ts
        };

    }
    
    emitExpiryBurst(particlePool) {
        if (!particlePool) return;
        const color = this.gradientColors?.[0] || this.color || '#ffffff';
        const edgeColor = this.gradientColors?.[1] || color;

        // Bright central flash
        particlePool.get(this.x, this.y, 'explosionFlash', this.radius * 2);
        // Expanding colored ring
        particlePool.get(this.x, this.y, 'explosionRingColored', this.radius * 3, color);

        // Shrapnel streaks radiating outward in the powerup's color
        const shrapnelCount = 12;
        for (let i = 0; i < shrapnelCount; i++) {
            const angle = (i / shrapnelCount) * Math.PI * 2;
            particlePool.get(this.x, this.y, 'explosionShrapnel', angle, 4.5, color);
        }

        // Lingering embers in the secondary gradient color
        for (let i = 0; i < 8; i++) {
            particlePool.get(this.x, this.y, 'explosionEmber', edgeColor);
        }
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
    
    update(playerRef, tractorEngaged = false, particlePool = null) {
        if (!this.active) return;

        // Lifetime tick — when life runs out the powerup is released by
        // PoolManager.cleanupInactive() on the next sweep.
        this.life -= GAME_CONFIG.TICK_SCALE;
        if (this.life <= 0) {
            this.active = false;
            this.emitExpiryBurst(particlePool);
            return;
        }

        this.pulsePhase += 0.1;

        this.x += this.vel.x;
        this.y += this.vel.y;

        // Magnetism — mirrors the layered pull used by money/health orbs in
        // color-star.js so powerups feel just as collectable. Powerups are
        // bigger/heavier than orbs visually, so all forces are scaled down by
        // POWERUP_MAGNET_SCALE to keep them from rocketing into the player.
        if (playerRef && playerRef.active) {
            const dx = playerRef.x - this.x;
            const dy = playerRef.y - this.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 1) {
                const k = 0.55; // POWERUP_MAGNET_SCALE — softer than orb pull

                // Constant base homing — always pulls, even at long range.
                const baseAttraction = 0.8;
                this.vel.x += (dx / dist) * baseAttraction * 0.15 * k;
                this.vel.y += (dy / dist) * baseAttraction * 0.15 * k;

                // Medium range (≤100px) — stronger as it gets closer.
                if (dist < 100) {
                    const proximity = (100 - dist) / 100;
                    this.vel.x += (dx / dist) * 15 * proximity * k;
                    this.vel.y += (dy / dist) * 15 * proximity * k;
                }

                // Close range (≤40px) — magnetic snap.
                if (dist < 40) {
                    const closeProximity = (40 - dist) / 40;
                    this.vel.x += (dx / dist) * 25 * closeProximity * k;
                    this.vel.y += (dy / dist) * 25 * closeProximity * k;
                }

                // Tractor beam — long-range pull when not charging.
                if (tractorEngaged) {
                    const tractorAttraction = GAME_CONFIG.ACTIVE_STAR_ATTR * 1500;
                    const tractorDist = GAME_CONFIG.ACTIVE_STAR_ATTRACT_DIST;
                    if (dist < tractorDist) {
                        const tractorForce = tractorAttraction * (1 - dist / tractorDist);
                        this.vel.x += (dx / dist) * tractorForce * k;
                        this.vel.y += (dy / dist) * tractorForce * k;
                    }
                }
            }
        }

        // Match orb friction so the magnet feels the same.
        this.vel.x *= GAME_CONFIG.ORB_FRIC;
        this.vel.y *= GAME_CONFIG.ORB_FRIC;

        wrap(this, this.width, this.height);
    }
    
    draw(ctx) {
        if (!this.active) return;
        
        // Safety check for required properties
        if (!this.gradientColors || this.gradientColors.length < 2) {
            console.warn(`Powerup ${this.type} missing gradientColors, skipping draw`);
            return;
        }
        
        // No opacity fade — sprite-cached gradients/glows resist a smooth
        // alpha ramp in practice, so the wind-down is communicated via
        // BLINKING instead. During the fade window, skip draw on "off"
        // frames; the blink rate ramps from slow at the start of the
        // window to fast right before expiry.
        if (this.life < this.fadeDuration) {
            const t = Math.max(0, this.life / this.fadeDuration); // 1 → 0
            // Hz ramps ~1.5Hz at fade start to ~14Hz at expiry.
            const hz = 1.5 + (1 - t) * 12.5;
            const phase = (frameClock.now / 1000) * hz * Math.PI * 2;
            if (Math.sin(phase) < 0) return;
        }

        // Enhanced pulsing effect for visibility — applied via ctx.scale()
        // below so that the cached gradients and the body path stay in sync
        // without rebuilding the gradient every frame.
        const pulse = 0.85 + Math.sin(this.pulsePhase) * 0.15;
        const rotation = frameClock.now * 0.003;
        const grads = getPowerupGradients(ctx, this.gradientColors);
        const R = POWERUP_BASE_RADIUS; // unscaled reference; ctx.scale handles the pulse

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(rotation);
        ctx.scale(pulse, pulse);

        // Spectacular outer aura/glow
        ctx.fillStyle = grads.outer;
        ctx.beginPath();
        ctx.arc(0, 0, POWERUP_GLOW_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Main powerup body with cached gradient fill
        ctx.fillStyle = grads.body;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        // OPT-2: pre-rendered glow sprite replaces live GPU blur.
        // glowSpriteCache.draw mutates ctx.globalAlpha — restore to 1 after.
        glowSpriteCache.draw(ctx, 0, 0, this.color, R, 8, 0.6);
        ctx.globalAlpha = 1;

        if (this.type === 'HOMING') {
            // Diamond shape for homing
            ctx.beginPath();
            ctx.moveTo(0, -R);
            ctx.lineTo(R * 0.8, 0);
            ctx.lineTo(0, R);
            ctx.lineTo(-R * 0.8, 0);
            ctx.closePath();
        } else if (this.type === 'EXPLOSIVE') {
            // Star shape for explosive
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const radius = i % 2 === 0 ? R : R * 0.5;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        } else if (this.type === 'CRIT_CHANCE') {
            // Target/crosshair shape for critical chance
            ctx.beginPath();
            ctx.arc(0, 0, R, 0, Math.PI * 2);
            ctx.closePath();
            // Add crosshair
            ctx.moveTo(-R * 0.6, 0);
            ctx.lineTo(R * 0.6, 0);
            ctx.moveTo(0, -R * 0.6);
            ctx.lineTo(0, R * 0.6);
        } else if (this.type === 'CRIT_DAMAGE') {
            // Spiky star for critical damage
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const radius = i % 2 === 0 ? R : R * 0.3;
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
                const x = Math.cos(angle) * R;
                const y = Math.sin(angle) * R;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        } else if (this.type === 'MEDPACK') {
            // Cross/plus shape for medpack
            ctx.beginPath();
            const armWidth = R * 0.3;
            const armLength = R * 0.8;
            ctx.rect(-armLength, -armWidth, armLength * 2, armWidth * 2);
            ctx.rect(-armWidth, -armLength, armWidth * 2, armLength * 2);
            ctx.closePath();
        } else {
            // Hexagon for others
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const x = Math.cos(angle) * R;
                const y = Math.sin(angle) * R;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        }

        ctx.fill();
        ctx.stroke();

        // Icon — pre-built font string (radius is constant, so the size
        // never changes in unscaled coords; pulse scaling is handled by
        // the ctx.scale above).
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.font = POWERUP_ICON_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(this.icon, 0, 0);
        ctx.fillText(this.icon, 0, 0);

        // Sparkling edge effect
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;

        const sparkleRadius = R + 8;
        const sparkleCount = 6;
        for (let i = 0; i < sparkleCount; i++) {
            const angle = (i / sparkleCount) * Math.PI * 2 + rotation * 2;
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

        // Powerup name label above the icon (not rotated)
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = 0.9;
        ctx.font = '13px "Silkscreen", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        const labelY = -(this.radius + 14);
        ctx.strokeText(this.config.name, 0, labelY);
        ctx.fillStyle = this.color;
        ctx.fillText(this.config.name, 0, labelY);
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