// 5.98.0 — Permanent stat pickup. Mobile-only drop type. Two kinds:
//
//   - 'hpup'       — cyan +heart icon. On pickup: maxHealth += 5, health += 5.
//   - 'toughness'  — amber +shield icon. On pickup: shield += 3 (damage
//                    reduction %, capped at 75 in getEffectiveShield).
//
// Modeled after `gold-coin.js`: scatter on spawn, gentle drift, then the
// mobile magnet (gold-coin.js style) pulls it to the stationary player.
// Lifetime is generous (~120s @ 60Hz) so a drop that lands at the edge
// of the screen has plenty of time to fly home.
//
// Rendered via Canvas2D in `draw()` — no WebGL renderer integration
// required. The pickup has its own icon (a chunky heart or shield),
// drawn at the orb's world coords inside the camera transform.
//
// Collision + collection lives in `collision-system.js` (player vs
// statPickupPool branch); the pool itself is registered in
// `game-engine.js` alongside goldCoinPool / goldShapePool.

import { GAME_CONFIG } from '../core/constants.js';
import { random } from '../core/utils.js';
// 5.109.0 — isMobile() no longer referenced; unified proximity
// magnet runs on both platforms.

const FRICTION = 0.92;
const LIFE_TICKS = 7200;       // ~120s @ 60Hz
const BLINK_TICKS = 300;       // blink in the last ~5s
const FADE_TICKS = 30;         // hard fade in the last ~0.5s

// 5.109.0 — Unified proximity magnet. Inventory items sit CLOSEST in
// the range hierarchy: gold (180) > health (110) > inventory (90).
// Items are the rarest drop and the highest-impact pickup, so they
// demand the most positional commitment from the player. Strengths
// kept gentle so the scoop reads as a satisfying arc.
const MAGNET_Z = 2.5;
const MAGNET_MID_RANGE = 90;     // medium proximity zone
const MAGNET_MID_STRENGTH = 4;   // gentle (effective ~10/tick with MAGNET_Z)
const MAGNET_NEAR_RANGE = 40;    // snap zone
const MAGNET_NEAR_STRENGTH = 12; // moderate snap

export class StatPickup {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vel = { x: 0, y: 0 };
        this.kind = 'hpup';              // 'hpup' | 'toughness'
        this.radius = 14;
        this.opacity = 1;
        this.rotation = 0;
        this.life = 0;
        this._driftPhase = 0;
        this._driftFreq = 0;
        this._pulsePhase = 0;
        this.active = false;
    }

    reset(x, y, kind = 'hpup', level = 1, item = null) {
        this.x = x;
        this.y = y;
        // 6.0.0 — Pickups now carry a pre-rolled `item` object so the
        // visible glow (rarity color) matches the item the player will
        // receive on contact. dropOrbsFromEntity rolls rarity + item
        // at drop time, checks isUpgrade against equipped, and only
        // spawns the pickup when it's a strict upgrade. `kind` is the
        // slot id ('helm' / 'armor' / 'shield' / 'plating' / 'trinket')
        // or the legacy aliases ('hpup' / 'toughness') for callers
        // that haven't migrated.
        const SLOT_KIND_LEGACY = { hpup: 'helm', toughness: 'shield' };
        this.kind = SLOT_KIND_LEGACY[kind] || kind;
        this.level = Math.max(1, level | 0);
        this.item = item || null;
        if (item) {
            this.rarity = item.rarity || 'common';
            this.rarityColor = item.rarityColor || '#cccccc';
            this.rarityGlow = item.rarityGlow || 0.45;
        } else {
            this.rarity = 'common';
            this.rarityColor = '#cccccc';
            this.rarityGlow = 0.45;
        }
        // 5.99.2 — Visual radius bumped 14 → 20 px so pickups are
        // legible at the portrait 0.65 camera zoom (~9 → ~13 effective
        // world-px). Hit radius (used in collision-system) reads
        // `this.radius` so this also widens the auto-collect window.
        this.radius = 20;
        this.life = LIFE_TICKS;
        this.active = true;
        this.opacity = 1;
        this.rotation = 0;

        // Scatter on spawn — drift outward so a cluster of drops spreads.
        const angle = Math.random() * Math.PI * 2;
        const speed = random(1.2, 2.6);
        this.vel.x = Math.cos(angle) * speed;
        this.vel.y = Math.sin(angle) * speed;

        this._driftPhase = Math.random() * Math.PI * 2;
        this._driftFreq = random(0.020, 0.040);
        this._pulsePhase = Math.random() * Math.PI * 2;
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
        // Idle wobble so stationary pickups breathe.
        this._driftPhase += this._driftFreq;
        this.vel.x += Math.cos(this._driftPhase) * 0.018;
        this.vel.y += Math.sin(this._driftPhase * 1.3) * 0.018;

        // 5.109.0 — Unified proximity magnet (mobile + desktop). The
        // tightest range of any drop type — items are the rarest and
        // the player has to commit to a close approach to scoop.
        if (playerPos) {
            const dx = playerPos.x - this.x;
            const dy = playerPos.y - this.y;
            const dist = Math.hypot(dx, dy);
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
        }

        this.x += this.vel.x;
        this.y += this.vel.y;

        // Blink + fade in the last few seconds of lifetime so the
        // player notices a drop is about to despawn.
        let alpha = 1;
        if (this.life <= BLINK_TICKS) {
            const blinkOn = (Math.floor((BLINK_TICKS - this.life) / 6) & 1) === 0;
            alpha = blinkOn ? 1.0 : 0.3;
        }
        if (this.life <= FADE_TICKS) {
            alpha *= Math.max(0, this.life / FADE_TICKS);
        }
        // Subtle pulse so the pickup feels alive even mid-life.
        this._pulsePhase += 0.06;
        const pulse = 0.85 + 0.15 * (Math.sin(this._pulsePhase) + 1) * 0.5;
        this.opacity = alpha * pulse;
        this.rotation += 0.012;
    }

    draw(ctx) {
        if (!this.active) return;
        // 6.0.0 — Slot kind drives the body color; rarity drives the
        // outer halo color/intensity so the player reads "what slot"
        // from the body and "how good" from the glow.
        const isHp     = this.kind === 'helm' || this.kind === 'armor' || this.kind === 'hpup';
        const isTough  = this.kind === 'shield' || this.kind === 'plating' || this.kind === 'toughness';
        const isTrink  = this.kind === 'trinket';

        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);

        // Rarity halo — color from item.rarityColor with alpha scaled by glow.
        const rarityAlpha = Math.max(0.30, Math.min(0.95, 0.30 + (this.rarityGlow || 0.45) * 0.55));
        const rarityHex = this.rarityColor || '#cccccc';
        const hr = parseInt(rarityHex.slice(1, 3), 16);
        const hg = parseInt(rarityHex.slice(3, 5), 16);
        const hb = parseInt(rarityHex.slice(5, 7), 16);
        const haloR = this.radius * (2.0 + (this.rarityGlow || 0.45) * 0.8)
            + Math.sin(this._pulsePhase) * 1.4;
        ctx.fillStyle = `rgba(${hr}, ${hg}, ${hb}, ${rarityAlpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, Math.PI * 2);
        ctx.fill();

        // Body — rounded square. Color per slot type.
        let bodyColor, strokeColor;
        if (isHp)         { bodyColor = '#00ccff'; strokeColor = '#002a4a'; }
        else if (isTough) { bodyColor = '#ffae3a'; strokeColor = '#3a2200'; }
        else if (isTrink) { bodyColor = '#66ffaa'; strokeColor = '#003322'; }
        else              { bodyColor = '#cccccc'; strokeColor = '#222222'; }
        ctx.fillStyle = bodyColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        const r = this.radius;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(-r, -r, r * 2, r * 2, 4);
        } else {
            ctx.rect(-r, -r, r * 2, r * 2);
        }
        ctx.fill();
        ctx.stroke();

        // Icon — heart for HP, plus for toughness, circle pip for trinket.
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        if (isHp) {
            ctx.beginPath();
            const hs = r * 0.6;
            ctx.moveTo(0, hs * 0.6);
            ctx.bezierCurveTo(hs, hs * 0.1, hs, -hs * 0.7, 0, -hs * 0.2);
            ctx.bezierCurveTo(-hs, -hs * 0.7, -hs, hs * 0.1, 0, hs * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (isTrink) {
            // Concentric ring — regen / cycle-of-life sigil.
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = strokeColor;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Plus / cross — chunky toughness sigil.
            const bar = r * 0.32;
            const arm = r * 0.7;
            ctx.beginPath();
            ctx.rect(-bar, -arm, bar * 2, arm * 2);
            ctx.rect(-arm, -bar, arm * 2, bar * 2);
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }
}
