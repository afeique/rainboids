// HUD overlay — Phase 3 BRN (burn) + STUN status icons over enemies.
//
// Walks `enemyPool.activeObjects` once per frame and, for each enemy with
// an active status effect, does two things:
//
//   1. Draws a small in-world badge above the enemy (flame for BRN with
//      stack count, electric bolt for STUN, plus a thin outline tint).
//   2. Spawns a steady stream of `burnFlame` / `stunArc` particles from
//      the particle pool so the status reads as "this thing is on fire /
//      sparking" even at a glance.
//
// Both passes are kept under the `enemyPool` walk so we only iterate the
// active enemies once per frame. Particles are pool-managed; if the pool
// is full, `get()` returns null and we silently skip spawning (the badge
// rendering is still visible, so the state is never invisible).
//
// Function form mirrors the rest of `js/modules/hud/*` — exported as
// regular functions, called with `.call(engine)` so all `this.<field>`
// refs work the same as a class method on `GameEngine`.

import { frameClock } from '../core/frame-clock.js';
import { rgba } from '../core/color-cache.js';

// ── Per-enemy emission cadence ────────────────────────────────────────
// Particle spawn rate is controlled by per-tick coin-flips so we don't
// have to track a per-enemy phase clock. Each value is a probability the
// status particle spawns this frame — calibrated so that with the
// particle lifetime + this probability, ~2-3 particles are visible at any
// given moment on a status-afflicted enemy.
const BRN_SPAWN_CHANCE_PER_STACK = 0.35; // 1 stack ≈ 35%/frame, 3 stacks ≈ near-constant
const STUN_SPAWN_CHANCE_PER_FRAME = 0.55;

/**
 * Render BRN + STUN visual feedback over all status-affected enemies.
 *
 * Called once per frame from `drawHUD()` / the post-draw HUD layer in
 * `game-engine.js`. Performs world-space rendering (no camera translate
 * here — the engine's main draw path already translates by camera, and
 * this runs in the same coordinate space).
 *
 * Two side effects:
 *   - Spawns particles into `this.particlePool`.
 *   - Draws in-world badges on `this.ctx`.
 *
 * No-op when the game isn't actively playing (paused/title/shop) so the
 * status timers don't continue ticking in the player's face.
 */
export function drawStatusIcons() {
    if (!this.enemyPool || !this.ctx) return;
    const now = frameClock.now;
    const ctx = this.ctx;

    for (const enemy of this.enemyPool.activeObjects) {
        if (!enemy || !enemy.active) continue;
        if (enemy._deathFlash > 0 || enemy.warping) continue;

        const burning = (enemy.brnStacks || 0) > 0 && enemy.brnUntil > now;
        const stunned = (enemy.stunUntil || 0) > now;
        if (!burning && !stunned) continue;

        // World→screen translate: the existing draw loop runs with the
        // camera applied; we render in world coordinates so badges sit
        // tight against the enemy silhouette.
        const x = enemy.x;
        const y = enemy.y;
        const r = enemy.radius || 14;

        // ── Particle emission ────────────────────────────────────────
        if (this.particlePool) {
            if (burning) {
                const stacks = enemy.brnStacks;
                const chance = BRN_SPAWN_CHANCE_PER_STACK * stacks;
                if (Math.random() < chance) {
                    // Spawn at a random point along the enemy's "top half"
                    // so the flame visually wraps the silhouette.
                    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
                    const dist = r * 0.6;
                    this.particlePool.get(
                        x + Math.cos(ang) * dist,
                        y + Math.sin(ang) * dist,
                        'burnFlame',
                    );
                }
            }
            if (stunned) {
                if (Math.random() < STUN_SPAWN_CHANCE_PER_FRAME) {
                    // Spawn above the enemy head, slight horizontal jitter.
                    const ox = (Math.random() - 0.5) * r * 1.2;
                    const oy = -r - 4 + (Math.random() - 0.5) * 4;
                    this.particlePool.get(
                        x + ox,
                        y + oy,
                        'stunArc',
                    );
                }
            }
        }

        // ── Outline tint for stunned enemy ───────────────────────────
        // Cycle a thin electric-blue ring around the enemy outline at a
        // faster pulse than the rage / mini-boss rings so the state is
        // immediately legible.
        if (stunned) {
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.018);
            ctx.save();
            ctx.strokeStyle = rgba(140, 220, 255, 0.45 + pulse * 0.35);
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.arc(x, y, r * 1.18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // ── Status icon badges above the enemy ───────────────────────
        // BRN: small flame glyph with stack count overlay (×N for N>1).
        // STUN: small bolt glyph.
        // Positioned side-by-side above the enemy if both are active.
        const badgeY = y - r - 12;
        const badgesActive = (burning ? 1 : 0) + (stunned ? 1 : 0);
        const badgeSpacing = 12;
        const totalWidth = (badgesActive - 1) * badgeSpacing;
        let bx = x - totalWidth / 2;

        if (burning) {
            drawFlameBadge(ctx, bx, badgeY, enemy.brnStacks);
            bx += badgeSpacing;
        }
        if (stunned) {
            drawBoltBadge(ctx, bx, badgeY);
        }
    }
}

// ── Badge rendering helpers ───────────────────────────────────────────
// Pure draws against a 2D context with no engine state dependencies —
// kept module-local so the main exported draw function stays compact.

function drawFlameBadge(ctx, x, y, stacks) {
    // Tiny stylized flame: orange teardrop with yellow core. Scaled with
    // stack count so 3-stack burns visibly dominate over 1-stack.
    const scale = 0.85 + Math.min(3, stacks) * 0.15;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Outer flame.
    ctx.fillStyle = '#ff7722';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.bezierCurveTo(4, -3, 5, 2, 0, 5);
    ctx.bezierCurveTo(-5, 2, -4, -3, 0, -6);
    ctx.fill();

    // Inner core.
    ctx.fillStyle = '#ffcc44';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.bezierCurveTo(2, -1, 2.5, 2, 0, 3);
    ctx.bezierCurveTo(-2.5, 2, -2, -1, 0, -3);
    ctx.fill();

    ctx.restore();

    // Stack count overlay (only for >1 — a single stack is just the icon).
    if (stacks > 1) {
        ctx.save();
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 2;
        const label = '×' + stacks;
        ctx.strokeText(label, x + 5, y + 1);
        ctx.fillText(label, x + 5, y + 1);
        ctx.restore();
    }
}

function drawBoltBadge(ctx, x, y) {
    // Tiny lightning bolt: classic zigzag silhouette in electric blue.
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#88ddff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1, -6);
    ctx.lineTo(3, -1);
    ctx.lineTo(0, -1);
    ctx.lineTo(1, 6);
    ctx.lineTo(-3, 1);
    ctx.lineTo(0, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}
