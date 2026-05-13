// AutoPilot — reactive AI driver that pilots the player ship on mobile.
//
// Each tick the auto-pilot writes movement intent (up/down/left/right)
// directly onto `inputHandler.input`, the same way the keyboard handler
// does on desktop. The mobile-mode contract is:
//
//   • The user does NOT control movement. Auto-pilot owns it entirely.
//   • The user DOES control aim + fire via tap (handled by mobile-touch.js).
//   • Auto-pilot is suspended whenever the radial menu is open, the game
//     is paused / between waves / game-over / on the title screen, or
//     the player isn't on the field yet.
//
// The dodge logic is adapted from the test playtester
// (tests/helpers/game-ai.js) but trimmed down: no test cheats, no fire
// command, no per-tick logging, no waitFor helpers. The whole class is
// roughly 100 lines of pure math.
//
// Behavior summary:
//   1. Sample every active asteroid / enemy / dangerous enemy-bullet
//      within DANGER_RADIUS of the player.
//   2. Sum inverse-distance vectors pointing FROM each threat TO the
//      player — closer threats push harder.
//   3. Add a screen-edge bias when the ship gets close to the boundary
//      of the game field.
//   4. If the resulting safety vector is zero (no immediate threats and
//      no boundary pressure) drift back toward the field centre so the
//      camera doesn't park in an empty corner.
//   5. Decompose the world-space safety vector into the ship's local
//      frame (forward / back / strafe-left / strafe-right) and flip
//      the corresponding WASD inputs.
//
// The decomposition matches the ship's physics: thrust always pushes
// in the direction of the ship's current angle (which the player.js
// aim resolution sets to atan2(aimY - y, aimX - x)). So the auto-pilot
// works in concert with whatever aim direction the tap-to-shoot layer
// has set. With no tap, aim stays put at its last value — the ship still
// dodges, just without re-orienting.

const DEFAULTS = Object.freeze({
    dangerRadius: 250,     // px — only threats inside this radius push
    wallMargin: 120,       // px — boundary push kicks in inside this band
    moveThreshold: 0.18,   // local-frame magnitude above which a key flips
    bulletDangerScale: 1.6,// enemy bullets feel more dangerous per-pixel
    idleDriftRadius: 120,  // px — drift toward centre once we're farther than this
});

export class AutoPilot {
    /**
     * @param {object} gameEngine the live GameEngine instance
     * @param {object} [opts]
     */
    constructor(gameEngine, opts = {}) {
        this.engine = gameEngine;
        this.cfg = { ...DEFAULTS, ...opts };
        this.active = false;          // toggled by GameEngine wiring each tick
        // Scratch threat list reused tick-to-tick to avoid per-frame
        // allocation. The push/length-pattern keeps it amortised O(1).
        this._threats = [];
    }

    /**
     * Returns true if the engine state currently allows auto-pilot to run.
     * Pause / shop / wave-clear / radial-open / game-over all suspend it.
     */
    canRun() {
        const ge = this.engine;
        if (!ge || !ge.player || !ge.player.active) return false;
        if (ge.radialMenu && ge.radialMenu.isOpen && ge.radialMenu.isOpen()) return false;
        // Only PLAYING is "live"; WAVE_TRANSITION runs gameplay but pauses
        // most ship-AI considerations and the user can interact with the
        // shop overlay during it — auto-pilot stays idle.
        if (!ge.game || ge.game.state !== 'PLAYING') return false;
        return true;
    }

    /**
     * Compute and apply movement intent for the current tick.
     * Idempotent — call once per logic step, before player.update().
     */
    tick() {
        const ge = this.engine;
        const input = ge && ge.inputHandler && ge.inputHandler.input;
        if (!input) return;

        if (!this.canRun()) {
            // When we're not driving, clear any leftover inputs so the
            // ship doesn't keep coasting once we toggle off.
            input.up = false;
            input.down = false;
            input.left = false;
            input.right = false;
            return;
        }

        const player = ge.player;
        const px = player.x;
        const py = player.y;
        const field = ge.gameField || { width: ge.width, height: ge.height };
        const fw = field.width || 1;
        const fh = field.height || 1;

        const cfg = this.cfg;
        const danger = cfg.dangerRadius;
        const dangerSq = danger * danger;

        // ── Collect threats inside the danger radius ──────────────────
        this._threats.length = 0;
        const pushIfNear = (obj, weight) => {
            if (!obj || !obj.active) return;
            const dx = obj.x - px;
            const dy = obj.y - py;
            const d2 = dx * dx + dy * dy;
            if (d2 > dangerSq) return;
            this._threats.push({ dx, dy, d2, weight });
        };
        if (ge.asteroidPool) {
            for (const a of ge.asteroidPool.activeObjects) pushIfNear(a, 1);
        }
        if (ge.enemyPool) {
            for (const e of ge.enemyPool.activeObjects) pushIfNear(e, 1);
        }
        if (ge.enemyBulletPool) {
            for (const b of ge.enemyBulletPool.activeObjects) {
                // Most enemy bullets are short-lived projectiles; we only
                // dodge mines + homing mines (which linger + chase) and
                // the projectile bodies that are very close. Treating
                // every bullet as a threat in a busy fight would dither
                // the ship into uselessness.
                if (!b || !b.active) continue;
                if (b.shape === 'mine' || b.shape === 'homing_mine') {
                    pushIfNear(b, cfg.bulletDangerScale);
                    continue;
                }
                // Very-close projectile body — half-radius danger window.
                const dx = b.x - px;
                const dy = b.y - py;
                const d2 = dx * dx + dy * dy;
                const half = danger * 0.5;
                if (d2 <= half * half) {
                    this._threats.push({ dx, dy, d2, weight: cfg.bulletDangerScale });
                }
            }
        }

        // ── Build safety vector: sum of (-threat / distance²) terms ───
        // The "away from each threat" direction is (-dx, -dy); the
        // 1/dist² weighting means a threat at 50px pushes 4× harder than
        // a threat at 100px, which matches the test playtester's feel.
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < this._threats.length; i++) {
            const t = this._threats[i];
            const d = Math.sqrt(t.d2) || 1;
            const scale = (t.weight / d) * (1 / d); // inverse-square push
            sx -= t.dx * scale;
            sy -= t.dy * scale;
        }

        // ── Add a perpendicular slide so the ship doesn't head straight
        //    at the threat it's "running from" (which can be a wall side).
        if (this._threats.length > 0) {
            // Use the nearest threat's tangent direction.
            let nearest = this._threats[0];
            for (let i = 1; i < this._threats.length; i++) {
                if (this._threats[i].d2 < nearest.d2) nearest = this._threats[i];
            }
            const nd = Math.sqrt(nearest.d2) || 1;
            const tx = nearest.dy / nd;     // 90° CCW from "toward threat"
            const ty = -nearest.dx / nd;
            sx += tx * 0.4;
            sy += ty * 0.4;
        }

        // ── Wall push: keep the ship away from the boundary ───────────
        const margin = cfg.wallMargin;
        if (px < margin)             sx += (margin - px) / margin;
        if (px > fw - margin)        sx -= (px - (fw - margin)) / margin;
        if (py < margin)             sy += (margin - py) / margin;
        if (py > fh - margin)        sy -= (py - (fh - margin)) / margin;

        // ── Idle: drift back toward the field centre so the camera
        //    doesn't park in an empty corner. Skipped when there's
        //    active danger or wall pressure (sx/sy already non-zero).
        const safetyMag = Math.hypot(sx, sy);
        if (safetyMag < 0.05) {
            const cx = fw * 0.5;
            const cy = fh * 0.5;
            const dx = cx - px;
            const dy = cy - py;
            const d = Math.hypot(dx, dy);
            if (d > cfg.idleDriftRadius) {
                sx = dx / d;
                sy = dy / d;
            } else {
                // We're near the centre — stay put.
                input.up = false;
                input.down = false;
                input.left = false;
                input.right = false;
                return;
            }
        }

        // ── Decompose world-space safety into ship-local axes ─────────
        // The ship's facing angle is set in player.js from atan2(aimY - y,
        // aimX - x). We mirror that so the auto-pilot doesn't fight the
        // aim resolution: read the current player.angle which has already
        // been updated for this tick by the upstream input pipeline.
        // (We can't read it post-update because we run BEFORE
        // player.update — so we recompute against the current aim.)
        const aimAngle = Math.atan2(
            input.aimY - py,
            input.aimX - px,
        );
        const ca = Math.cos(aimAngle);
        const sa = Math.sin(aimAngle);
        const forward =  sx * ca + sy * sa;
        const strafe  = -sx * sa + sy * ca;

        const thr = cfg.moveThreshold;
        input.up    = forward >  thr;
        input.down  = forward < -thr;
        input.left  = strafe  < -thr;
        input.right = strafe  >  thr;
    }
}
