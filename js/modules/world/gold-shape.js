// 5.79.32 — GoldShape: the chunky gold pickup. One per drop, picks a
//   shape from a small geometric pool (cubes, octahedra, stars,
//   hexagons, diamonds, triangles), drifts in space, blinks and
//   disappears at 120 seconds. Independent of GoldCoin — no shared
//   base class, just lives next to it.
//
// 5.95.0 — Mobile fruit-ninja redesign: drops auto-magnet to the
//   player on mobile mode regardless of upgrade state, with a much
//   wider attraction radius so collection feels effortless on a phone.
//   See the MOBILE_* constants below.
import { GAME_CONFIG, getDropTier } from '../core/constants.js';
import { random } from '../core/utils.js';
// 5.109.0 — isMobile() no longer referenced; unified magnet (see
// gold-coin.js for the same change).

const LIFE_TICKS = 120 * 60;     // 120s @ 60Hz logic ticks.
const BLINK_TICKS = 5 * 60;      // Last 5s alternate opacity.
const FADE_TICKS = 30;           // Last 0.5s smooth fade overlay.
// 5.79.34 — Friction lowered 0.985 → 0.92 (matches pre-rework
//   ORB_FRIC) so the restored three-tier magnet doesn't accelerate
//   the orb to absurd speeds. See gold-coin.js for the math.
const FRICTION = 0.92;
const TRACTOR_RANGE = 240;
const TRACTOR_PULL = 0.7;
// 5.79.36 — Proximity-only magnet (Tier 1 base pull removed). Drops
//   drift freely until the player gets within MAGNET_MID_RANGE; only
//   then does the magnet activate.
// 5.109.0 — Gold sits FARTHEST in the range hierarchy (see
//   gold-coin.js for the same tuning). Same values on mobile and
//   desktop; legacy mobile-only branch retired.
const MAGNET_Z = 2.5;
const MAGNET_MID_RANGE = 180;    // medium proximity (was 100)
const MAGNET_MID_STRENGTH = 6;   // gentle (was 15)
const MAGNET_NEAR_RANGE = 60;    // snap zone (was 40)
const MAGNET_NEAR_STRENGTH = 14; // moderate (was 25)

// 5.79.38 — Gold shapes are exclusively 2D silhouettes (stars,
//   hexagon, diamond, triangle). Pairs with health orbs being all
//   3D solids (5.79.38) so the two pickups read as visually
//   distinct: flat geometric coin-shapes vs. tumbling solid orbs.
const SHAPE_POOL = [
    'star4', 'star5', 'star6', 'star8',
    'hexagon', 'diamond', 'triangle',
];

// 5.117.0 — Jewel palette. Six rare gem colors that the player sees
// occasionally alongside the standard gold pieces.
// 5.119.0 — Reworked as RARE drop variants (was every shape). Gold
// is the default; jewels roll on ~15% of shapes and are worth 3×.
// Excludes blue/cyan so health orbs stay type-readable by color.
const JEWEL_COLORS = [
    '#ff44aa',   // hot pink
    '#ff3366',   // ruby red
    '#cc44ff',   // violet
    '#9933ee',   // purple
    '#ff44dd',   // magenta
    '#ff5577',   // rose
];

// 5.119.0 — Jewel drop chance and value multiplier. 15% of gold
// shapes roll as a jewel and pay out 3× the normal gold piece's
// value, giving rarity actual MEANING — seeing a jewel hit the
// pile is a "yes!" moment.
const JEWEL_ROLL_CHANCE = 0.15;
const JEWEL_VALUE_MULT = 3;

export class GoldShape {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vel = { x: 0, y: 0 };
        this.value = 0;
        this.shape = 'star5';
        this.color = '#ffd700';
        this.borderColor = '#5a3d00';
        this.radius = 12;
        this.opacity = 1;
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.twinklePhase = 0;
        this.twinkleSpeed = 3.5;
        this.sizeVariation = 1;
        this.is3DShape = false;
        this.life = 0;
        this._driftPhase = 0;
        this._driftFreq = 0;
        this.active = false;
        this.kind = 'shape';
        // 6.18.0 — drop tier metadata (stamped in reset()).
        this.tier = 'gold';
        this.glowMult = 1.0;
        this.pickupPitch = 1.0;
    }

    reset(x, y, value = 10) {
        this.x = x;
        this.y = y;
        // 5.119.0 — Jewel rarity roll. 85% of shapes are gold; 15%
        // roll a jewel color AND get a 3× value bump so picking one
        // up is a real reward, not just visual decoration. The
        // value bump scales the size too (radius is value-driven
        // below) so jewels read as bigger + brighter on the
        // playfield.
        const baseValue = Math.max(1, value | 0);
        this.isJewel = Math.random() < JEWEL_ROLL_CHANCE;
        if (this.isJewel) {
            this.value = baseValue * JEWEL_VALUE_MULT;
        } else {
            this.value = baseValue;
        }
        // 6.18.0 — Tier stamp based on FINAL value (post-jewel-mult).
        //   Jewels can climb a tier when their 3× multiplier pushes
        //   them past the next threshold — a real "lucky" feel.
        const tier = getDropTier(this.value);
        this.tier = tier.id;
        this.glowMult = tier.glowMult;
        this.pickupPitch = tier.pickupPitch;
        // Color: jewels keep their rare hue; non-jewels read the tier.
        this.color = this.isJewel
            ? JEWEL_COLORS[(Math.random() * JEWEL_COLORS.length) | 0]
            : tier.color;
        this.life = LIFE_TICKS;
        this.active = true;
        this.opacity = 1;
        // Black border keeps the shape legible against bright
        // nebulae AND dark voids regardless of fill color.
        this.borderColor = '#000000';

        // Pick from the geometric shape pool (5.79.38 — 2D only).
        this.shape = SHAPE_POOL[Math.floor(Math.random() * SHAPE_POOL.length)];
        this.is3DShape = false;

        // Size scales linearly with value across [SHAPE_SIZE_MIN, SHAPE_SIZE_MAX]
        //   up to MONEY_ORB_SHAPE_VALUE_MAX gold, then multiplied by the
        //   tier's sizeScale (bronze 0.80 → platinum 1.20).
        const cap = GAME_CONFIG.MONEY_ORB_SHAPE_VALUE_MAX;
        const ratio = Math.min(1, (this.value - 1) / Math.max(1, cap - 1));
        const minSize = GAME_CONFIG.MONEY_ORB_SHAPE_SIZE_MIN;
        const maxSize = GAME_CONFIG.MONEY_ORB_SHAPE_SIZE_MAX;
        this.radius = (minSize + ratio * (maxSize - minSize)) * tier.sizeScale;

        // 5.88.1 — Rotation dialed back to a gentle tumble. Was
        //   random(0.04, 0.08) → ~0.4-0.8 rev/s, which read as a
        //   chaotic spin once 1-3 shapes scattered together. The
        //   slower range (~0.12-0.24 rev/s, or 4-8s per revolution)
        //   keeps the 3D solid faces visible without making the drop
        //   feel like a fidget spinner.
        const sign = Math.random() < 0.5 ? -1 : 1;
        const baseRot = random(0.012, 0.024);
        this.rotationSpeed = sign * baseRot;
        this.rotation = Math.random() * Math.PI * 2;

        // 5.81.1 — Bumped initial scatter so the 1-3 chunky shapes
        //   per drop explode outward distinctly instead of clustering
        //   on top of each other at the spawn point. Friction (0.92)
        //   damps them to a gentle drift within ~30 ticks (~0.5 s) so
        //   the burst is felt but the orbs settle quickly enough to
        //   be magnet-grabbable. Was random(0.4, 1.4) — ~3× faster
        //   initial pop so three star/diamond shapes triangulate
        //   visibly before friction takes over.
        const angle = Math.random() * Math.PI * 2;
        const speed = random(2.4, 4.5);
        this.vel.x = Math.cos(angle) * speed;
        this.vel.y = Math.sin(angle) * speed;

        this.twinklePhase = Math.random() * Math.PI * 2;
        this.twinkleSpeed = random(2.0, 3.5);
        this._driftPhase = Math.random() * Math.PI * 2;
        this._driftFreq = random(0.020, 0.040);
    }

    update(playerPos, tractorEngaged) {
        if (!this.active) return;

        this.life--;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        this.vel.x *= FRICTION;
        this.vel.y *= FRICTION;
        this._driftPhase += this._driftFreq;
        this.vel.x += Math.cos(this._driftPhase) * 0.012;
        this.vel.y += Math.sin(this._driftPhase * 1.3) * 0.012;

        if (playerPos) {
            const dx = playerPos.x - this.x;
            const dy = playerPos.y - this.y;
            const dist = Math.hypot(dx, dy);

            // 5.109.0 — Unified proximity magnet on both platforms
            // (mirrors gold-coin.js). Mid zone (≤180 px) starts a
            // gentle pull; snap zone (≤60 px) scoops the player.
            if (dist > 1 && dist < MAGNET_MID_RANGE) {
                const invDist = 1 / dist;
                const mMid = (MAGNET_MID_RANGE - dist) / MAGNET_MID_RANGE;
                this.vel.x += dx * invDist * MAGNET_MID_STRENGTH * mMid * MAGNET_Z;
                this.vel.y += dy * invDist * MAGNET_MID_STRENGTH * mMid * MAGNET_Z;
                if (dist < MAGNET_NEAR_RANGE) {
                    const mNear = (MAGNET_NEAR_RANGE - dist) / MAGNET_NEAR_RANGE;
                    this.vel.x += dx * invDist * MAGNET_NEAR_STRENGTH * mNear * MAGNET_Z;
                    this.vel.y += dy * invDist * MAGNET_NEAR_STRENGTH * mNear * MAGNET_Z;
                }
            }
            if (tractorEngaged && dist > 1 && dist < TRACTOR_RANGE) {
                const invDist = 1 / dist;
                const k = (TRACTOR_RANGE - dist) / TRACTOR_RANGE;
                const pull = k * TRACTOR_PULL;
                this.vel.x += dx * invDist * pull;
                this.vel.y += dy * invDist * pull;
            }
        }

        this.x += this.vel.x;
        this.y += this.vel.y;

        if (this.rotationSpeed) this.rotation += this.rotationSpeed;

        let alpha = 1;
        if (this.life <= BLINK_TICKS) {
            const blinkOn = (Math.floor((BLINK_TICKS - this.life) / 6) & 1) === 0;
            alpha = blinkOn ? 1.0 : 0.25;
        }
        if (this.life <= FADE_TICKS) {
            alpha *= Math.max(0, this.life / FADE_TICKS);
        }
        this.opacity = alpha;
    }
}

export const GOLD_SHAPE_LIFE_TICKS = LIFE_TICKS;
