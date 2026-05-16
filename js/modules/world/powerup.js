// Powerup system for enhanced combat capabilities
import { GAME_CONFIG } from '../core/constants.js';
import { random, wrap, glowSpriteCache } from '../core/utils.js';
import { frameClock } from '../core/frame-clock.js';
import { getIconImage, resolveIconSlug } from '../ui/icons.js';

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
    // 5.79.62 — Key off the full color array, not just the first two
    //   stops. The previous `gradientColors[0] + '|' + [1]` hash
    //   silently collided when a future powerup reached for a 3+
    //   stop gradient — the cache would return a 2-stop gradient
    //   that visually mismatched the requested colors. `join('|')`
    //   is O(n) over a 2-3-element array and 100% collision-free.
    const key = gradientColors.join('|');
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

// Powerups are now PERMANENT and STACKING. The `duration` field is
// preserved for back-compat but `addPowerup` ignores it and treats
// every drop as `isPermanent: true`. Each entry now declares a
// `category` so the Powerups overlay can group them under
// Offense / Drops sub-tabs.
// 5.79.16 — Per-powerup spCost (skill-point cost) replaces the flat
//   1-SP-per-stack pricing. Tiered by impact:
//     Tier 1 (5 SP): major multiplicative DPS or survival levers
//     Tier 2 (3 SP): meaningful but capped or single-axis bonuses
//     Tier 3 (2 SP): utility / non-DPS
//   See docs/XP_BALANCE_REWORK_5.79.md §"SP costs by impact tier".
export const POWERUP_TYPES = {
    RAPID_FIRE: {
        name: 'Rapid',
        displayName: 'Rapid Fire',
        abbr: 'RPD',
        color: '#ff3300',
        gradientColors: ['#ff6600', '#ff0000'],
        icon: 'bolt',
        duration: 30000,
        effect: 'rapidFire',
        rarity: 0.3,
        category: 'OFFENSE',
        maxStacks: 5,
        spCost: 3,
        spCostIncrement: 2,
        description: '22% faster shooting per stack'
    },
    MULTI_SHOT: {
        name: 'Multi',
        displayName: 'Multi Shot',
        abbr: 'MUL',
        color: '#3366ff',
        gradientColors: ['#66aaff', '#0033cc'],
        icon: 'multi-shot',
        duration: 30000,
        effect: 'multiShot',
        rarity: 0.18,
        category: 'OFFENSE',
        maxStacks: 4,
        spCost: 3,
        spCostIncrement: 2,
        description: '+1 bullet in a spread per stack'
    },
    HOMING: {
        name: 'Homing',
        displayName: 'Homing',
        abbr: 'HOM',
        color: '#ff3399',
        gradientColors: ['#ff66cc', '#cc0066'],
        icon: 'target',
        duration: 30000,
        effect: 'homing',
        rarity: 0.15,
        category: 'OFFENSE',
        maxStacks: 3,
        spCost: 3,
        spCostIncrement: 2,
        description: 'Bullets track nearest enemy per stack'
    },
    BIG_BULLETS: {
        name: 'Big',
        displayName: 'Big Bullets',
        abbr: 'BIG',
        color: '#33cc33',
        gradientColors: ['#66ff66', '#009900'],
        icon: 'circle-fill',
        duration: 30000,
        effect: 'bigBullets',
        rarity: 0.2,
        category: 'OFFENSE',
        // 5.76.1 — 4 → 3. 3 stacks = +6.6 px diameter on top of base
        // bullet sizes; further stacks make bullets read as physics
        // objects rather than projectiles.
        maxStacks: 3,
        spCost: 3,
        spCostIncrement: 2,
        description: '+2.2px bullet radius per stack'
    },
    // 5.79.56 — SPEED_BOOST removed from POWERUP_TYPES. It's now a
    //   defense-economy purchase only (DEFENSE tab, COINS currency).
    //   The combat-manager.js getPowerupConfig fallback keeps the shop
    //   purchase path working (still resolves the Afterburner config
    //   when the shop calls addPowerup('SPEED_BOOST', …)).
    PIERCING: {
        name: 'Pierce',
        displayName: 'Piercing',
        abbr: 'PRC',
        color: '#ff9933',
        gradientColors: ['#ffcc66', '#cc6600'],
        icon: 'bow-arrow',
        duration: 30000,
        effect: 'piercing',
        rarity: 0.12,
        category: 'OFFENSE',
        maxStacks: 4,
        spCost: 3,
        spCostIncrement: 2,
        description: 'Bullets pass through +1 enemy per stack'
    },
    EXPLOSIVE: {
        name: 'Explode',
        displayName: 'Explosive',
        abbr: 'EXPL',
        color: '#ff6600',
        gradientColors: ['#ff9933', '#cc3300'],
        icon: 'bomb',
        duration: 30000,
        effect: 'explosive',
        rarity: 0.08,
        category: 'OFFENSE',
        maxStacks: 3,
        spCost: 3,
        spCostIncrement: 2,
        description: 'AoE blast on bullet impact (+10px radius per stack)'
    },
    CRIT_CHANCE: {
        name: 'Crit %',
        displayName: 'Critical Chance',
        abbr: 'CRIT',
        color: '#ffcc00',
        gradientColors: ['#ffff66', '#cc9900'],
        icon: 'star',
        duration: 30000,
        effect: 'critChance',
        rarity: 0.18,
        category: 'OFFENSE',
        maxStacks: 6,
        spCost: 3,
        spCostIncrement: 2,
        description: '+7% critical hit chance per stack'
    },
    CRIT_DAMAGE: {
        name: 'Crit Dmg',
        displayName: 'Critical Damage',
        abbr: 'CDMG',
        color: '#ff0066',
        gradientColors: ['#ff3399', '#cc0033'],
        icon: 'dagger',
        duration: 30000,
        effect: 'critDamage',
        rarity: 0.13,
        category: 'OFFENSE',
        maxStacks: 6,
        spCost: 3,
        spCostIncrement: 2,
        description: '+15% critical hit damage per stack'
    },
    // 5.79.56 — SHIELD_BOOST removed from POWERUP_TYPES. Defense-
    //   economy only now (DEFENSE tab, COINS currency). The
    //   combat-manager.js getPowerupConfig fallback keeps the shop's
    //   addPowerup('SHIELD_BOOST', …) path resolving correctly.
    // 5.100.3 — LONG_RANGE retired (default bullet range covers the
    // full playfield via the bullet.js maxLife bump). Was hidden in
    // 5.100.3.
    // 5.110.0 — Fully removed from POWERUP_TYPES alongside the broader
    // range-upgrade cleanup. Old saves carrying LONG_RANGE stacks
    // load fine — getPowerupStacks('LONG_RANGE') just returns the
    // stored count and getRangeMultiplier ignores it (returns 1).
    KNOCKBACK: {
        name: 'Knockback',
        displayName: 'Knockback',
        abbr: 'KNCK',
        color: '#ffaa44',
        gradientColors: ['#ffd58a', '#cc6611'],
        icon: 'anger',
        duration: 30000,
        effect: 'knockback',
        rarity: 0.18,
        category: 'OFFENSE',
        maxStacks: 3,
        spCost: 3,
        spCostIncrement: 2,
        description: '+40% knockback on all power weapons per stack'
    },
    // 5.78.2 — DROPS-category powerups removed. Drop rates, drop
    // amounts, heal amounts, and money amounts now scale uniformly
    // with player level (see combat-manager.dropOrbsFromEntity +
    // createHealthOrb / createMoneyOrb). Removes 8 powerup picks the
    // player would have spent SP on and folds the entire orb-drop
    // economy into a single per-level curve. Less currency-flavored
    // friction; more deterministic progression. The OFFENSE category
    // still gates around player choice (damage shape per build).

    // 5.101.0 — Defensive powerups restored to POWERUP_TYPES. With
    // defense skills retired, these become the player's main defensive
    // levers alongside the Diablo-style inventory. All three appear in
    // the pause-menu POWERUPS tab AND the survivor-card wave-clear pick
    // (one defensive slot per pick, see openWavePickOverlay).
    //   HEALTH_BOOST  — +35 max HP per stack (mirrors getEffectiveMaxHealth)
    //   SHIELD_BOOST  — +8% damage reduction (mirrors getEffectiveShield, capped 75%)
    //   REGEN         — passive HP/s regen (5.101.0 — new entry)
    HEALTH_BOOST: {
        name: 'Health',
        displayName: 'Health Boost',
        abbr: 'HP+',
        color: '#ff5555',
        gradientColors: ['#ff8888', '#cc0000'],
        icon: 'heart',
        duration: 30000,
        effect: 'healthBoost',
        rarity: 0.18,
        category: 'DEFENSE',
        maxStacks: 10,
        spCost: 3,
        spCostIncrement: 2,
        description: '+35 max HP per stack (full heal on pick)'
    },
    SHIELD_BOOST: {
        name: 'Toughness',
        displayName: 'Toughness',
        abbr: 'DEF',
        color: '#33ff99',
        gradientColors: ['#66ffaa', '#006644'],
        icon: 'shield',
        duration: 30000,
        effect: 'shieldBoost',
        rarity: 0.15,
        category: 'DEFENSE',
        maxStacks: 8,
        spCost: 3,
        spCostIncrement: 2,
        description: '+8% damage reduction per stack (cap 75%)'
    },
    REGEN: {
        name: 'Regen',
        displayName: 'Health Regen',
        abbr: 'RGN',
        color: '#66ffaa',
        gradientColors: ['#aaffcc', '#229966'],
        icon: 'pill',
        duration: 30000,
        effect: 'regen',
        rarity: 0.14,
        category: 'DEFENSE',
        maxStacks: 5,
        spCost: 3,
        spCostIncrement: 2,
        // 5.114.0 — Combat-gated. Regen ticks ONLY after 4 seconds of
        // no damage; taking a hit pauses it. Description updated to
        // make the conditional clear so players understand the
        // out-of-combat-only nature.
        description: '+0.5 HP/s out of combat per stack (4s after last hit)'
    },

    // 5.107.0 — Vampirism. Each stack converts +5% of damage DEALT
    // into HP for the player. Caps at 5 stacks (25% lifesteal). Heal
    // only fires when the player has room to grow — overflow is
    // discarded (no progress to tanks, that's overflow-only on the
    // direct health-orb path).
    VAMPIRISM: {
        name: 'Vampirism',
        displayName: 'Vampirism',
        abbr: 'VAMP',
        color: '#cc0033',
        gradientColors: ['#ff3366', '#660011'],
        icon: 'skull',
        duration: 30000,
        effect: 'vampirism',
        rarity: 0.10,
        category: 'DEFENSE',
        maxStacks: 5,
        spCost: 4,
        spCostIncrement: 2,
        description: 'Heal +5% of damage dealt per stack',
    },

    // 5.107.0 — Thorns. Each stack reflects +25% of damage TAKEN back
    // to the source — works for enemy bullets (damages the bullet's
    // shooter when identifiable), enemy contact (damages the enemy),
    // asteroid contact (damages the asteroid), and mines (damages
    // the mine). 4 stacks max = 100% reflection at full investment.
    THORNS: {
        name: 'Thorns',
        displayName: 'Thorns',
        abbr: 'THRN',
        color: '#ff7733',
        gradientColors: ['#ff9966', '#cc3300'],
        icon: 'anger',
        duration: 30000,
        effect: 'thorns',
        rarity: 0.10,
        category: 'DEFENSE',
        maxStacks: 4,
        spCost: 4,
        spCostIncrement: 2,
        description: 'Reflect +25% of damage taken per stack',
    },

    // 5.108.0 — Executioner. Bullets deal +20% damage per stack to
    // enemies (and asteroids) currently below 25% HP. Lets the player
    // close out wounded targets faster — crit-adjacent feel but tied
    // to target state rather than RNG.
    EXECUTIONER: {
        name: 'Executor',
        displayName: 'Executioner',
        abbr: 'EXEC',
        color: '#cc0044',
        gradientColors: ['#ff4477', '#660022'],
        icon: 'dagger',
        duration: 30000,
        effect: 'executioner',
        rarity: 0.12,
        category: 'OFFENSE',
        maxStacks: 5,
        spCost: 3,
        spCostIncrement: 2,
        description: '+20% damage to enemies below 25% HP per stack',
    },

    // 5.108.0 — Momentum. Damage ramps up by +5% per second of
    // sustained primary fire per stack, capping at +15% per stack
    // (3-second ramp). Resets the moment the player releases fire.
    // Rewards holding the trigger through a wave.
    MOMENTUM: {
        name: 'Momentum',
        displayName: 'Momentum',
        abbr: 'MOM',
        color: '#ffaa33',
        gradientColors: ['#ffd066', '#cc6600'],
        icon: 'wind',
        duration: 30000,
        effect: 'momentum',
        rarity: 0.12,
        category: 'OFFENSE',
        maxStacks: 4,
        spCost: 3,
        spCostIncrement: 2,
        description: '+5%/s sustained-fire damage per stack (cap +15%/stack)',
    },

    // 5.108.0 — Overcharge Rounds. Every Nth bullet does 3× damage and
    // renders as a fatter, brighter projectile. N decreases per stack
    // (stacks=1 → every 12 shots; stacks=4 → every 5 shots), so the
    // upgrade reads as "more frequent BIG shots" rather than a damage
    // multiplier.
    OVERCHARGE_ROUNDS: {
        name: 'Overcharge',
        displayName: 'Overcharge Rounds',
        abbr: 'OVCH',
        color: '#ffcc00',
        gradientColors: ['#ffee66', '#cc9900'],
        icon: 'battery',
        duration: 30000,
        effect: 'overchargeRounds',
        rarity: 0.10,
        category: 'OFFENSE',
        maxStacks: 4,
        spCost: 3,
        spCostIncrement: 2,
        description: 'Every Nth bullet hits 3× (more frequent per stack)',
    },

    // 5.108.0 — Guardian. On a hit that WOULD kill the player, clamp
    // HP to 1 and grant invuln for 2s + stacks×0.5s. One charge per
    // wave; resets at wave start. Mirrors LAST_STAND but per-wave
    // rather than per-run.
    GUARDIAN: {
        name: 'Guardian',
        displayName: 'Guardian',
        abbr: 'GUARD',
        color: '#ffeb44',
        gradientColors: ['#fff088', '#aa7700'],
        icon: 'shield',
        duration: 30000,
        effect: 'guardian',
        rarity: 0.08,
        category: 'DEFENSE',
        maxStacks: 3,
        spCost: 4,
        spCostIncrement: 2,
        description: 'Survive lethal hit at 1 HP + invuln (once per wave)',
    },

    // 5.108.0 — Static Discharge. Periodic AoE pulse from the player
    // ship. Each stack shortens cooldown, widens radius, and bumps
    // damage. Provides passive area control while the player focuses
    // on aimed fire.
    STATIC_DISCHARGE: {
        name: 'Discharge',
        displayName: 'Static Discharge',
        abbr: 'STDS',
        color: '#88aaff',
        gradientColors: ['#bbccff', '#3344aa'],
        icon: 'bolt',
        duration: 30000,
        effect: 'staticDischarge',
        rarity: 0.10,
        category: 'OFFENSE',
        maxStacks: 5,
        spCost: 3,
        spCostIncrement: 2,
        description: 'Periodic AoE pulse — faster + bigger per stack',
    },

    // 5.108.0 — Whirlwind. Six particles orbit the player ship at a
    // damaging radius. Every ~333ms, any enemy / asteroid / mine
    // within the radius takes damage. Stacks add damage AND widen the
    // orbit. A constant area-of-effect that pairs naturally with
    // close-range builds (Scatter Gun, Charge Shot melee).
    WHIRLWIND: {
        name: 'Whirlwind',
        displayName: 'Whirlwind',
        abbr: 'WIND',
        color: '#88ffcc',
        gradientColors: ['#aaffe0', '#229988'],
        icon: 'tornado',
        duration: 30000,
        effect: 'whirlwind',
        rarity: 0.10,
        category: 'OFFENSE',
        maxStacks: 4,
        spCost: 4,
        spCostIncrement: 2,
        description: 'Orbital damage zone — +0.5 dmg & +30px radius per stack',
    },
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
        // 25s lifetime — slightly shorter than the 30s effect duration of
        // most powerups, long enough to span a typical engagement, short
        // enough that ignored pickups actually expire (so the blink+burst
        // feedback is meaningful rather than theoretical).
        this.life = 25 * GAME_CONFIG.LOGIC_HZ;
        this.maxLife = this.life;
        // Blink across the last ~35% of the lifetime — visible warning
        // window without dominating the powerup's on-screen life.
        this.fadeDuration = this.life * 0.35;
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
        // 5.79.60 — SHIELD_BOOST octagon branch removed. SHIELD_BOOST
        //   left POWERUP_TYPES in 5.79.56 (now defense-economy only,
        //   purchased via the shop's DEFENSE tab — and the DEFENSE
        //   tab itself was suspended in 5.79.57), so this case can no
        //   longer be reached. The earlier MEDPACK cross-shape branch
        //   (deleted in 5.78.2) was already gone; this commit completes
        //   the dead-shape cleanup. All non-special powerup types now
        //   fall through to the hexagon below.
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

        // 5.79.37 — Icon now drawn from the SVG cache (getIconImage).
        //   Falls back to font-rendered text if the icon string isn't a
        //   known slug (handles any pre-migration emoji that slipped
        //   through). Pulse scaling is handled by the ctx.scale above.
        const iconSlug = resolveIconSlug(this.icon);
        if (iconSlug) {
            const iconSize = Math.round(POWERUP_BASE_RADIUS * 1.4);
            const iconImg = getIconImage(iconSlug, iconSize, '#ffffff');
            if (iconImg) {
                ctx.drawImage(iconImg, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
            }
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.font = POWERUP_ICON_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeText(this.icon, 0, 0);
            ctx.fillText(this.icon, 0, 0);
        }

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