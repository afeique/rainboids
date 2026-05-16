// Color star entity - decorative stars with various shapes and behaviors
// Note: Health and money orbs (created from asteroid/enemy destruction) are collectible
import { GAME_CONFIG, NORMAL_STAR_COLORS, STAR_SHAPES, BIG_STAR_SHAPES } from '../core/constants.js';
import { random, wrap, glowSpriteCache } from '../core/utils.js';
import { frameClock } from '../core/frame-clock.js';
// Phase-1 multiplayer engine refactor: drop physics extracted to
// `js/sim/drops.js`. The wrapper in `update()` below builds a plain-data
// `DropState` from `this`, calls `updateDrop`, and writes the result back.
// Behavior is byte-for-byte equivalent to the legacy inline code (drift,
// friction, two-tier health magnet, tractor pull, lifetime). Decorative
// stars (`starType === 'decorative'`) are not drops — they keep the inline
// path below.
import { updateDrop } from '../../sim/drops.js';
import { isMobile } from '../platform/platform-detect.js';

// 5.95.0 — Tiny helper for the per-drop `ctx.mobileMagnet` flag. Kept
//   as a single function call so the hot path stays a function ref
//   (V8 inlines it; calling isMobile() directly inside update was
//   marginally slower in profiling).
function _isMobileMagnet() {
    return isMobile();
}

export class ColorStar {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.active = false;
    }
    
    reset(x, y, starType = 'decorative', z, density) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.density = density;
        
        // Star types: 'decorative', 'health', 'money' (health and money are orbs)
        this.starType = starType;
        this.isCollectible = (starType === 'health' || starType === 'money');
        
        let scale = 1;
        
        // Radius and twinkle speed are now affected by density
        const densityFactor = 0.7 + (this.density || 0.5) * 0.6;
        
        // 15% chance for a "big star" - much larger and brighter
        const isBigStar = Math.random() < 0.15;
        if (isBigStar) {
            this.radius = (this.z * 3.5 + 1.5) * scale * densityFactor; // Much bigger stars to show shapes
            this.isBigStar = true;
        } else {
            this.radius = (this.z * 1.2 + 0.6) * scale * densityFactor; // Larger normal stars too
            this.isBigStar = false;
        }
        
        this.opacity = 0;
        this.opacityOffset = Math.random() * Math.PI * 2;
        this.twinkleSpeed = random(0.003, 0.008) * (1 + this.z * 0.2) * densityFactor; // Much slower, more gentle
        
        // Shape selection — foreground stars (z >= 2.0) are always simple white
        // blinking points to avoid confusion with game entities
        if (this.z >= 2.0) {
            this.shape = 'point';
            this.isBigStar = false;
        } else if (this.isBigStar) {
            // 5.79.23 — Big stars pick from the simple pool only. The
            //   fancy variants (multi-point, geometric, 3D solids) are
            //   confined to SMALL stars per user request — no more
            //   gigantic shape stars dominating the field. Big stars
            //   stay as point/circle so they read as bright background
            //   pinpoints rather than competing with combat shapes.
            this.shape = BIG_STAR_SHAPES[Math.floor(Math.random() * BIG_STAR_SHAPES.length)];
        } else {
            this.shape = STAR_SHAPES[Math.floor(Math.random() * STAR_SHAPES.length)];
        }
        
        // 5.74.22 — rotation guaranteed bidirectional + minimum visible
        // magnitude. Old `random(-0.02, 0.02)` was uniform, so half the
        // stars ended up with rotRate near zero and looked statically
        // oriented — and across a field, the few with appreciable speed
        // happened to skew positive often enough that the field "looked
        // like it rotated one way." Forcing a sign coin-flip + a 0.008
        // minimum |speed| means every shape star visibly spins, half CW
        // and half CCW. Range bumped 0.02 → 0.03 ceiling for more variety.
        const rotSign = Math.random() < 0.5 ? -1 : 1;
        this.rotation = Math.random() * Math.PI * 2; // random starting angle
        this.rotationSpeed = rotSign * random(0.008, 0.030);

        // Big stars with interesting shapes get enhanced rotation - more subtle
        if (isBigStar && ['star5', 'star6', 'star8', 'sparkle'].includes(this.shape)) {
            this.rotationSpeed *= 1.3; // Gentle showcase of rotating complex shapes
        }
        // Big stars get larger size variation
        if (this.isBigStar) {
            this.sizeVariation = random(1.5, 2.8); // Big stars: 150% to 280% size variation - showcase shapes!
        } else {
            this.sizeVariation = random(0.9, 1.6); // Normal stars: 90% to 160% size variation
        }

        // Shape-specific enhancements for visual interest - toned down
        if (['star5', 'star6', 'star8'].includes(this.shape)) {
            this.rotationSpeed *= 1.2; // Slightly faster rotation, not too dramatic
        }

        this.vel = { x: 0, y: 0 };
        this.active = true;
        
        if (this.isCollectible) {
            // Collectible orbs (health and money) are not generated by the noise field
            this.x = x || random(0, this.width);
            this.y = y || random(0, this.height);
            this.z = random(1.5, 3.0); // Close and bright
            this.density = 0.8;

            // 5.79.38 — Health orbs are exclusively 3D solids.
            // 5.116.0 — Pool tightened to distinct silhouettes.
            // 5.120.0 — Stella retired; convex-only pool.
            // 5.121.0 — Pool expanded back with the inert convex
            //   solids (cube, octahedron) since they render cleanly
            //   under the painter's-algorithm renderer. Prism
            //   dropped entirely — never desired for this game.
            //   Final pool: 4 well-known platonic-style solids.
            const HEALTH_3D_SHAPES = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron'];
            this.shape = HEALTH_3D_SHAPES[Math.floor(Math.random() * HEALTH_3D_SHAPES.length)];
            this.is3DShape = true;

            // 5.79.25 — Orb radius is set by combat-manager.createHealthOrb /
            //   createMoneyOrb based on the heal/gold amount being delivered.
            //   The reset() radius here is a fallback for any orb that's
            //   spawned without going through those helpers.
            if (this.starType === 'health') {
                this.color = '#00aaff';        // Bright blue (matches health bar)
                this.borderColor = '#001a33';  // Deep navy stroke for contrast
            } else if (this.starType === 'money') {
                this.color = '#ffd700';        // Gold
                this.borderColor = '#5a3d00';  // Dark amber stroke
            }
            // Conservative fallback radius — combat-manager will overwrite.
            this.baseRadius = 14;
            this.radius = 14;

            // 5.79.38 — Z-axis spin (around the camera-facing axis).
            //   Was 0.06–0.16 rad/tick (3.6–9.6 rad/s @ 60Hz, hard
            //   to track visually). 0.025–0.055 (1.5–3.3 rad/s) is
            //   slow enough to read each face turning, fast enough
            //   to never look frozen.
            const orbRotSign = Math.random() < 0.5 ? -1 : 1;
            const orbBaseRot = random(0.025, 0.055);
            this.rotationSpeed = orbRotSign * orbBaseRot;
            this.rotation = Math.random() * Math.PI * 2;

            // 5.88.5 — X/Y-axis tumble, the "slight 3D rotation".
            //   Roughly 1/4 the speed of the Z spin so the tumble
            //   reads as background motion rather than a wobble.
            //   Each orb gets its own random axis + rate so the
            //   pickup pile doesn't tumble in lockstep.
            const tx = Math.random() < 0.5 ? -1 : 1;
            const ty = Math.random() < 0.5 ? -1 : 1;
            this.tumbleSpeedX = tx * random(0.005, 0.012);
            this.tumbleSpeedY = ty * random(0.005, 0.012);
            this.rotX = Math.random() * Math.PI * 2;
            this.rotY = Math.random() * Math.PI * 2;

            // Twinkle/shimmer phase + speed (per-orb so they don't all pulse
            // in lockstep). Read by the WebGL starfield's vertex shader.
            this.twinklePhase = Math.random() * Math.PI * 2;
            this.twinkleSpeed = random(2.5, 4.5);  // rad/sec
            // Sparkle particle cooldown — emit one starSparkle every
            // `_sparkleEvery` ms so the orb shimmers as it floats.
            this._sparkleEvery = 140 + Math.random() * 90;
            this._nextSparkleAt = 0;

            // 5.79.27 — `isPixelOrb` is set by combat-manager AFTER reset
            //   (when the splitter classifies a money orb as a tiny pixel
            //   particle). Defaulted false here so a non-pixel orb is the
            //   safe fallback if the flag never gets set.
            this.isPixelOrb = false;

            // Initial velocity will be set by createOrbBurst for explosion effect
            this.vel = { x: 0, y: 0 };
            // 5.79.32 — Lifetime bumped 1800 → 7200 ticks (30s → 120s)
            //   to match gold-drop pickup window. Health orbs sit and
            //   drift, waiting to be picked up.
            this.life = 7200;
        } else {
            // Decorative stars use normal colors
            this.color = NORMAL_STAR_COLORS[Math.floor(Math.random() * NORMAL_STAR_COLORS.length)];
            this.borderColor = NORMAL_STAR_COLORS[Math.floor(Math.random() * NORMAL_STAR_COLORS.length)];
            this.life = -1;
        }
        
        // Legacy support for old property - both health and money orbs should be attracted to player
        this.isBurst = (this.starType === 'health' || this.starType === 'money');
    }
    
    update(shipVel, playerPos, tractorEngaged, gameField = null, particlePool = null) {
        if (!this.active) return;

        if (this.isBurst) {
            // ── Sparkle particle FX (presentation, must run BEFORE physics) ──
            // 5.79.24 — Orb shimmer. Each orb emits a small `starSparkle`
            //   particle every `_sparkleEvery` ms at a random offset
            //   inside its silhouette.
            // 5.79.27 — Pixel orbs do NOT emit sparkles. A single drop
            //   spawns 10-25 pixel orbs; if each one fired a sparkle
            //   every ~200ms the particle pool would saturate
            //   instantly. The pixel orbs themselves already read as a
            //   shimmer cluster; the few shape orbs in the same drop
            //   carry the sparkle trail.
            // Sparkles read `this.x` / `this.y` — these were the
            // pre-position-update values in the legacy code (the
            // friction + position step ran AFTER the sparkle block in
            // the original `update()`). We preserve that ordering by
            // emitting sparkles before calling `updateDrop`.
            if (particlePool && this.life > 30 && !this.isPixelOrb) {
                const now = frameClock.now;
                if (now >= this._nextSparkleAt) {
                    this._nextSparkleAt = now + this._sparkleEvery;
                    const r = this.radius * (this.sizeVariation || 1);
                    const a = Math.random() * Math.PI * 2;
                    const d = Math.random() * r * 0.85;
                    const sx = this.x + Math.cos(a) * d;
                    const sy = this.y + Math.sin(a) * d;
                    // particle types: starSparkle takes (x, y, type, radius, color)
                    particlePool.get(sx, sy, 'starSparkle', r * 0.45, this.color);
                }
            }

            // ── Drop physics step (extracted to js/sim/drops.js) ──
            // The wrapper builds a plain-data DropState from `this`,
            // hands it to the pure `updateDrop` function, and writes
            // the result back. This is the F-agent slice of the
            // Phase-1 multiplayer engine refactor; behavior is
            // byte-for-byte equivalent to the legacy inline code
            // (lifetime decay, friction, position update, opacity
            // fade-in/fade-out, two-tier health magnet, tractor pull).
            //
            // Reusable scratch objects to avoid per-tick allocation.
            // The pure sim doesn't need fresh objects each call; the
            // ColorStar instance gets one scratch DropState attached
            // and reuses it across ticks.
            if (!this._dropScratch) {
                this._dropScratch = {
                    id: 0,
                    kind: 'health',
                    x: 0, y: 0, vx: 0, vy: 0,
                    life: 0,
                    radius: 0,
                    value: 0,
                    opacity: 1,
                    z: 1,
                    active: true,
                };
            }
            if (!this._dropCtxScratch) {
                this._dropCtxScratch = {
                    ships: [null],
                    field: null,
                    dt: 1 / 60,
                    tractorEngaged: false,
                    tractorAttraction: 0,
                    tractorRange: 0,
                };
            }
            const drop = this._dropScratch;
            // Map starType ('health' | 'money') to the DropState
            // discriminator. Pixel-orb subtype is independent of the
            // money kind for physics purposes (both use the default
            // 0.985 friction) — `kind` only branches the magnet path.
            drop.kind = (this.starType === 'health') ? 'health'
                       : (this.isPixelOrb ? 'money_pixel' : 'money_shape');
            drop.x = this.x;
            drop.y = this.y;
            drop.vx = this.vel.x;
            drop.vy = this.vel.y;
            drop.life = this.life;
            drop.radius = this.radius;
            drop.opacity = this.opacity;
            drop.z = this.z;
            drop.active = this.active;

            const ctx = this._dropCtxScratch;
            // Wrap the live `playerPos` (a Player ref) as a single-ship
            // array. updateDrop picks the nearest from `ships`; for solo
            // there's only one player so this is the trivial case.
            ctx.ships[0] = playerPos;
            ctx.field = gameField;
            ctx.tractorEngaged = !!tractorEngaged;
            ctx.tractorAttraction = GAME_CONFIG.ACTIVE_STAR_ATTR * 1500;
            ctx.tractorRange = GAME_CONFIG.ACTIVE_STAR_ATTRACT_DIST;
            // 5.95.0 — Mobile auto-magnet: widens the health-orb magnet
            //   radius so orbs zip in from anywhere. See drops.js for
            //   the radius constants.
            ctx.mobileMagnet = _isMobileMagnet();
            // 6.0.0 — TRIAGE_NET powerup. 2× magnet range on health orbs.
            // Reads through the live game-engine reference (set by main.js)
            // so this stays a no-op in offline sim contexts.
            ctx.healthMagnetScale = 1;
            const _ge = (typeof window !== 'undefined') ? window.gameEngine : null;
            if (_ge && _ge.player && typeof _ge.player.getPowerupStacks === 'function') {
                if (_ge.player.getPowerupStacks('TRIAGE_NET') > 0) {
                    ctx.healthMagnetScale = 2.0;
                }
            }

            updateDrop(drop, ctx, null);

            // Write physics back to `this`. The vel object stays the
            // same reference (mutated in place); x/y/life/opacity/active
            // are simple scalars copied back.
            this.x = drop.x;
            this.y = drop.y;
            this.vel.x = drop.vx;
            this.vel.y = drop.vy;
            this.life = drop.life;
            this.opacity = drop.opacity;
            // `active` flips false when life reaches 0 — copy the
            // signal back so the existing engine pool cleanup picks
            // it up on the next pass.
            if (!drop.active) this.active = false;
        } else {
            // Update twinkle based on sine wave - much more subtle variation
            this.opacity = 0.6 + 0.3 * (Math.sin(frameClock.now * this.twinkleSpeed + this.opacityOffset) + 1) / 2;

            // Rotate the star
            this.rotation += this.rotationSpeed;
        }
        
                    // Reduced parallax effect for less distraction
            // Distant stars move much slower, close stars move faster
            // But orbs don't have parallax - they're gameplay elements
            if (!this.isBurst) {
                const parallaxFactor = Math.pow(this.z, 1.8) * 0.12; // Reduced exponent and multiplier for gentler parallax
                this.x -= shipVel.x * parallaxFactor;
                this.y -= shipVel.y * parallaxFactor;
                
                // Use game field dimensions if available, otherwise fall back to screen dimensions
                const wrapWidth = gameField ? gameField.width : this.width;
                const wrapHeight = gameField ? gameField.height : this.height;
                wrap(this, wrapWidth, wrapHeight);
            }
    }
    
    draw(ctx) {
        if (!this.active) return;

        // Calculate final opacity for rendering
        this.depthOpacity = Math.min(1, 0.5 + Math.pow(this.z / 4, 1.2));
        this.finalOpacity = this.opacity * this.depthOpacity;

        // 5.79.24 — Orb body now renders through the WebGL starfield
        //   (engine pushes a transient instance each frame). Canvas2D
        //   only draws the stroke outline + collection-radius hint
        //   ring on top so the orb has a hard, visible boundary
        //   against bright nebula and a faint magnet-pulse halo.
        if (this.isBurst) {
            this.drawOrbOverlay(ctx);
            return;
        }
        if (this.shape === 'sparkle' || this.shape === 'burst') {
            return; // skip decoration — was drawing flashy rays
        }

        // Simple stars will be handled by depth batch renderer
        // No rendering here - just property preparation
    }

    // 5.79.24 — Orb-only canvas overlay: stroke outline + magnet pulse
    //   ring. Body fill comes from the WebGL starfield's transient
    //   instance for this orb (see game-engine `_pushOrbsToWebGL`).
    // 5.79.27 — Pixel orbs and 3D-shape orbs skip the stroke entirely:
    //   pixels are too small for a stroke to read (would just be a
    //   blob of border color), and the WebGL atlas already bakes
    //   internal edges into the 3D shapes — drawing a circle stroke
    //   on top of a tumbling cube would look wrong. Both still get
    //   the magnet-pulse halo so they read as collectible.
    drawOrbOverlay(ctx) {
        const t = frameClock.now * 0.001;
        const wave = 0.5 + 0.5 * Math.sin(t * (this.twinkleSpeed || 3.5) + (this.twinklePhase || 0));
        const pulseMul = 0.94 + 0.18 * wave;
        const r = this.radius * (this.sizeVariation || 1) * pulseMul;
        const alpha = this.finalOpacity;

        // Skip the full stroke for pixels and 3D shapes — see header note.
        const skipStroke = this.isPixelOrb || this.is3DShape;

        if (!skipStroke) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate((this.rotation || 0) + t * (this.rotationSpeed || 0) * 60);

            ctx.beginPath();
            switch (this.shape) {
                case 'diamond':
                    ctx.moveTo(0, -r);
                    ctx.lineTo(r * 0.85, 0);
                    ctx.lineTo(0, r);
                    ctx.lineTo(-r * 0.85, 0);
                    ctx.closePath();
                    break;
                case 'triangle':
                    ctx.moveTo(0, -r);
                    ctx.lineTo(r * 0.866, r * 0.5);
                    ctx.lineTo(-r * 0.866, r * 0.5);
                    ctx.closePath();
                    break;
                case 'hexagon':
                    for (let i = 0; i < 6; i++) {
                        const a = i * Math.PI / 3;
                        const x = Math.cos(a) * r;
                        const y = Math.sin(a) * r;
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    break;
                case 'star4':
                    this._strokeNStar(ctx, r, 4, 0.45);
                    break;
                case 'star5':
                    this._strokeNStar(ctx, r, 5, 0.42);
                    break;
                case 'star6':
                    this._strokeNStar(ctx, r, 6, 0.5);
                    break;
                case 'star8':
                    this._strokeNStar(ctx, r, 8, 0.5);
                    break;
                default:
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
            }
            // Dark stroke for contrast on bright backgrounds.
            ctx.globalAlpha = alpha * 0.85;
            ctx.lineJoin = 'round';
            ctx.strokeStyle = this.borderColor || '#000';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            // Lighter inner stroke gives a beveled rim.
            ctx.globalAlpha = alpha * 0.6;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }

        // ── Magnet pulse ring (skip for pixels — they're too tiny to
        //   benefit from a halo; the cluster of pixels reads
        //   collectible enough on its own).
        if (!this.isPixelOrb) {
            ctx.save();
            ctx.translate(this.x, this.y);
            const pulseIntensity = 0.4 + 0.4 * Math.sin(frameClock.now * 0.008 + this.x * 0.01);
            ctx.globalAlpha = alpha * pulseIntensity * 0.3;
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, r + 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    _strokeNStar(ctx, r, points, innerRatio) {
        const verts = points * 2;
        for (let i = 0; i < verts; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / points;
            const rr = (i % 2 === 0) ? r : r * innerRatio;
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }
    
} 