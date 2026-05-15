// 5.79.32 — GoldCoin: a tiny, independent gold pickup. Pure dots
//   only — no shapes, no rotation, no fancy treatment. Many spawn per
//   drop, drift in space, blink and disappear after 120 seconds.
//
// Render: simple gold dot (slot 'dot' in the WebGL star atlas).
// Pickup: walked into by player or pulled in by tractor beam.
// Lifetime: 120 seconds, with blink in last 5 seconds, fade in last 0.5s.
//
// 5.95.0 — Mobile fruit-ninja redesign: drops auto-magnet to the
//   player on mobile mode regardless of upgrade state, with a much
//   wider attraction radius so collection feels effortless on a phone.
//   See the MOBILE_* constants below.
import { GAME_CONFIG } from '../core/constants.js';
import { random } from '../core/utils.js';
import { isMobile } from '../platform/platform-detect.js';

const LIFE_TICKS = 120 * 60;     // 120s @ 60Hz logic ticks.
const BLINK_TICKS = 5 * 60;      // Last 5s alternate opacity.
const FADE_TICKS = 30;           // Last 0.5s smooth fade overlay.
// 5.79.34 — Friction lowered 0.985 → 0.92 to match the pre-rework
//   ORB_FRIC. The three-tier homing magnet (re-added below) pumps
//   velocity each tick; without high friction the orb accelerates
//   to absurd speeds in steady state (0.985 → 1200 px/s vs 0.92 →
//   ~225 px/s, matching original game feel).
const FRICTION = 0.92;
const TRACTOR_RANGE = 240;       // Tractor-beam pull radius (px).
const TRACTOR_PULL = 0.7;
// 5.79.36 — Proximity-only magnet. Tier 1 (constant base pull at any
//   distance — the homing-from-anywhere behavior) removed per user
//   request. Drops now drift on their scatter velocity until the
//   player gets within MAGNET_MID_RANGE; only then does the magnet
//   pull them in.
const MAGNET_Z = 2.5;
const MAGNET_MID_RANGE = 100;    // medium-range proximity zone
const MAGNET_MID_STRENGTH = 15;
const MAGNET_NEAR_RANGE = 40;    // magnetic-snap (scoop) zone
const MAGNET_NEAR_STRENGTH = 25;
// 5.95.0 — Mobile auto-collect range. Generous radius so coins zip in
//   from anywhere on a small viewport; matches the player's "stationary
//   shooter, drops come to me" loop. Strength is bumped too so the pull
//   feels confident rather than gentle drift.
// 5.98.0 — Full-screen magnet on mobile. Players reported coins drifting
// off the edges before the pull engaged; bumped to 3000 px so the entire
// playfield is in range on any phone viewport.
// 5.105.0 — Strengths cut DRAMATICALLY so the drop visibly FLIES toward
// the player over ~1s instead of teleporting. The reward loop depends
// on seeing the coin travel; the old 32/60 produced 100+ px/tick
// velocity which crossed the screen in 2-3 frames.
const MOBILE_MAGNET_RANGE = 3000;
const MOBILE_MAGNET_STRENGTH = 1;
const MOBILE_MAGNET_NEAR_RANGE = 80;
const MOBILE_MAGNET_NEAR_STRENGTH = 4;

export class GoldCoin {
    constructor() {
        // Position + motion.
        this.x = 0;
        this.y = 0;
        this.vel = { x: 0, y: 0 };
        // Pickup data.
        this.value = 0;
        // Render data — fed straight into the WebGL star push path.
        this.shape = 'dot';
        this.color = '#ffd700';
        this.radius = 2;
        this.opacity = 1;
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.twinklePhase = 0;
        this.twinkleSpeed = 3.5;
        this.sizeVariation = 1;
        // Lifetime.
        this.life = 0;
        // Drift wobble seed.
        this._driftPhase = 0;
        this._driftFreq = 0;
        // Pool flags.
        this.active = false;
        // Marker — used by the pickup-collision sparkle ring to know
        //   this is the "coin" tier (smaller ring) vs. the chunky
        //   "shape" tier (full ring).
        this.kind = 'coin';
    }

    reset(x, y, value = 1) {
        this.x = x;
        this.y = y;
        this.value = Math.max(1, value | 0);
        this.life = LIFE_TICKS;
        this.active = true;
        this.opacity = 1;
        this.shape = 'dot';
        this.color = '#ffd700';
        this.rotation = 0;
        this.rotationSpeed = 0;

        // Initial scatter — gentle outward burst so the cluster spreads
        //   before settling. Friction is high so this fans the cluster
        //   over ~1-2 seconds, then drift takes over.
        const angle = Math.random() * Math.PI * 2;
        const speed = random(0.8, 2.2);
        this.vel.x = Math.cos(angle) * speed;
        this.vel.y = Math.sin(angle) * speed;

        // Size: 1.5-3 px (constants, 5.79.31). Tiny dots — pure pixel coins.
        this.radius = GAME_CONFIG.MONEY_ORB_PIXEL_SIZE_MIN
            + Math.random() * (GAME_CONFIG.MONEY_ORB_PIXEL_SIZE_MAX - GAME_CONFIG.MONEY_ORB_PIXEL_SIZE_MIN);

        this.twinklePhase = Math.random() * Math.PI * 2;
        this.twinkleSpeed = random(2.0, 3.5);
        this._driftPhase = Math.random() * Math.PI * 2;
        this._driftFreq = random(0.020, 0.040);
    }

    /**
     * Per-tick integration. Three-tier homing magnet (5.79.34, restored
     * after the brief 5.79.32-33 drift-only experiment) plus tractor
     * boost when the beam is engaged. Lifetime decrement + blink/fade
     * applied to opacity.
     */
    update(playerPos, tractorEngaged) {
        if (!this.active) return;

        this.life--;
        if (this.life <= 0) {
            this.active = false;
            return;
        }

        this.vel.x *= FRICTION;
        this.vel.y *= FRICTION;
        // Subtle wobble keeps idle coins (no nearby player) gently
        //   moving rather than frozen-in-place.
        this._driftPhase += this._driftFreq;
        this.vel.x += Math.cos(this._driftPhase) * 0.012;
        this.vel.y += Math.sin(this._driftPhase * 1.3) * 0.012;

        if (playerPos) {
            const dx = playerPos.x - this.x;
            const dy = playerPos.y - this.y;
            const dist = Math.hypot(dx, dy);

            // 5.95.0 — Mobile auto-collect: wider, stronger pull at all
            //   ranges, no upgrade required. Replaces the desktop two-tier
            //   proximity magnet in mobile mode so coins fly to the player
            //   from anywhere on the playfield. Desktop branch unchanged.
            if (isMobile()) {
                if (dist > 1 && dist < MOBILE_MAGNET_RANGE) {
                    const invDist = 1 / dist;
                    const mFar = (MOBILE_MAGNET_RANGE - dist) / MOBILE_MAGNET_RANGE;
                    this.vel.x += dx * invDist * MOBILE_MAGNET_STRENGTH * mFar * MAGNET_Z;
                    this.vel.y += dy * invDist * MOBILE_MAGNET_STRENGTH * mFar * MAGNET_Z;
                    if (dist < MOBILE_MAGNET_NEAR_RANGE) {
                        const mNear = (MOBILE_MAGNET_NEAR_RANGE - dist) / MOBILE_MAGNET_NEAR_RANGE;
                        this.vel.x += dx * invDist * MOBILE_MAGNET_NEAR_STRENGTH * mNear * MAGNET_Z;
                        this.vel.y += dy * invDist * MOBILE_MAGNET_NEAR_STRENGTH * mNear * MAGNET_Z;
                    }
                }
            } else if (dist > 1 && dist < MAGNET_MID_RANGE) {
                // Desktop proximity magnet — drop drifts freely until the
                //   player approaches. No homing-from-anywhere pull.
                const invDist = 1 / dist;
                // Medium range (≤100 px): magnet ramps up as player nears.
                const mMid = (MAGNET_MID_RANGE - dist) / MAGNET_MID_RANGE;
                this.vel.x += dx * invDist * MAGNET_MID_STRENGTH * mMid * MAGNET_Z;
                this.vel.y += dy * invDist * MAGNET_MID_STRENGTH * mMid * MAGNET_Z;
                // Snap (≤40 px): scoop into the player.
                if (dist < MAGNET_NEAR_RANGE) {
                    const mNear = (MAGNET_NEAR_RANGE - dist) / MAGNET_NEAR_RANGE;
                    this.vel.x += dx * invDist * MAGNET_NEAR_STRENGTH * mNear * MAGNET_Z;
                    this.vel.y += dy * invDist * MAGNET_NEAR_STRENGTH * mNear * MAGNET_Z;
                }
            }
            // Tractor still works at long range — that's the player's
            //   tool for actively scooping drops without flying close.
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

        // Blink (last 5s, ~10 Hz) + fade (last 0.5s linear).
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

export const GOLD_COIN_LIFE_TICKS = LIFE_TICKS;
