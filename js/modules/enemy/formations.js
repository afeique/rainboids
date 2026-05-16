// 5.115.0 — Enemy formation manager. Bundles a group of enemies into
// a coordinated movement plan so they fly together — orbiting the
// player, weaving criss-cross patterns, flanking from opposite sides,
// etc. The visual goal is "choreographed routines" instead of every
// enemy individually chasing the player.
//
// ─── Lifecycle ─────────────────────────────────────────────────────
//   1. `createFormation(engine, type, members, params)` is called
//      from wave-manager.spawnLeveledEnemies after warp-in to bundle
//      a freshly-spawned group into a formation. Each enemy gets a
//      `_formation` ref + `_formationSlot` index.
//   2. `engine.formationManager.update()` runs every frame from the
//      engine update loop (after `player.update`, before enemy ticks
//      so target positions are fresh when each enemy moves).
//   3. Each formation computes per-slot target positions for the
//      current tick. The enemy update path checks `_formation` and
//      lerps toward the slot target, overriding its individual AI's
//      movement output.
//   4. Formations end when `Date.now() > startTime + duration` OR
//      when fewer than half the original members remain alive. On
//      end, members are released back to individual AI (`_formation`
//      cleared) and the formation is removed from the manager.
//
// ─── Formation types ───────────────────────────────────────────────
//   'orbit'       — N enemies evenly spaced on a circle around the
//                   player, rotating at constant angular speed.
//   'weave'       — N enemies move in horizontal sine waves with
//                   alternating phases so they criss-cross visually.
//   'flank'       — Two halves approach the player from opposite
//                   sides on converging arcs.
//   'cross'       — Pairs zip through each other in X patterns,
//                   then loop back.
//   'figure8'     — Members trace a horizontal figure-8 around the
//                   player at offset phases.

const TWO_PI = Math.PI * 2;

class Formation {
    constructor(engine, type, members, params = {}) {
        this.engine = engine;
        this.type = type;
        this.members = members.slice(); // active member list (filtered each tick)
        this.initialCount = members.length;
        this.startTime = Date.now();
        this.duration = params.duration ?? 9000;          // 9s default
        this.radius = params.radius ?? 220;               // px around player
        this.angularSpeed = params.angularSpeed ?? 0.6;   // rad/sec
        this.lerp = params.lerp ?? 0.08;                  // position-snap rate
        this.params = params;
        // Per-slot seed phase so each member has a stable identity in
        // the formation. For 'weave' / 'cross' this drives the offset.
        this._phaseSeed = Math.random() * TWO_PI;
    }

    // Returns true while the formation should keep running.
    isAlive(now) {
        if (now - this.startTime > this.duration) return false;
        // Filter dead/inactive members. End if too few remain.
        this.members = this.members.filter(e => e && e.active && !e.warping && e._formation === this);
        const survivorRatio = this.members.length / Math.max(1, this.initialCount);
        return survivorRatio >= 0.5 && this.members.length > 0;
    }

    // Computes per-slot target position for the current tick. Returns
    // { x, y } in world coords. `slot` is 0..members.length-1.
    targetForSlot(slot, t, playerX, playerY) {
        const n = this.members.length;
        const i = slot;
        switch (this.type) {
            case 'orbit': {
                const a = this._phaseSeed + (i / n) * TWO_PI + t * this.angularSpeed;
                return {
                    x: playerX + Math.cos(a) * this.radius,
                    y: playerY + Math.sin(a) * this.radius,
                };
            }
            case 'weave': {
                // Members move horizontally across the player at
                // staggered y-offsets, with a sine-wave x-jitter that
                // makes them visibly criss-cross.
                const spread = (i - (n - 1) / 2) * 60;
                const sweepX = Math.cos(t * 0.7 + i * 0.4) * 240;
                const sineY  = Math.sin(t * 1.6 + i * 0.9) * 80;
                return {
                    x: playerX + sweepX,
                    y: playerY + spread + sineY,
                };
            }
            case 'flank': {
                // Two halves approach from opposite sides. Members
                // with even slot index attack from the LEFT in an
                // arcing approach; odd slots from the RIGHT.
                const side = (i % 2 === 0) ? -1 : 1;
                const half = Math.floor(i / 2);
                const halfTotal = Math.ceil(n / 2);
                const tier = halfTotal > 1 ? half / (halfTotal - 1) : 0.5;
                const r = this.radius + tier * 60;
                const sweep = Math.cos(t * 0.45 + i) * 0.5;
                const angle = side > 0 ? sweep : Math.PI + sweep;
                return {
                    x: playerX + Math.cos(angle) * r,
                    y: playerY + Math.sin(angle) * r * 0.7,
                };
            }
            case 'cross': {
                // Pairs travel along X-shaped trajectories. Each member
                // gets a unique angle plus an oscillating radius so they
                // converge → pass through → diverge on a loop.
                const pairAngle = this._phaseSeed + (i / n) * TWO_PI;
                const r = this.radius * (0.45 + 0.55 * Math.abs(Math.sin(t * 0.9 + i)));
                return {
                    x: playerX + Math.cos(pairAngle) * r,
                    y: playerY + Math.sin(pairAngle) * r,
                };
            }
            case 'figure8': {
                // Lissajous-style figure-8 around the player. Each
                // member offset by `i/n * 2π` so they form a moving
                // ribbon traversing the figure-8.
                const phase = this._phaseSeed + (i / n) * TWO_PI + t * 0.7;
                return {
                    x: playerX + Math.sin(phase) * this.radius,
                    y: playerY + Math.sin(phase * 2) * this.radius * 0.5,
                };
            }
            default: {
                // Fallback: orbit.
                const a = (i / n) * TWO_PI + t * this.angularSpeed;
                return {
                    x: playerX + Math.cos(a) * this.radius,
                    y: playerY + Math.sin(a) * this.radius,
                };
            }
        }
    }

    // Move each member toward its slot target. Called every frame
    // BEFORE the per-enemy update tick so each enemy's next move
    // starts from the formation-adjusted position.
    tick(playerX, playerY) {
        const now = Date.now();
        const t = (now - this.startTime) / 1000; // seconds elapsed
        for (let i = 0; i < this.members.length; i++) {
            const e = this.members[i];
            if (!e || !e.active || e.warping) continue;
            const target = this.targetForSlot(i, t, playerX, playerY);
            // Smooth lerp toward target — feels like the formation is
            // pulling each member into place rather than teleporting.
            e.x += (target.x - e.x) * this.lerp;
            e.y += (target.y - e.y) * this.lerp;
            // Face direction = tangential to the target velocity. Use
            // a finite-difference probe at t+epsilon so the angle
            // tracks the formation's motion smoothly.
            const next = this.targetForSlot(i, t + 0.05, playerX, playerY);
            e.angle = Math.atan2(next.y - target.y, next.x - target.x);
        }
    }

    // Release all members back to individual AI.
    release() {
        for (const e of this.members) {
            if (e && e._formation === this) {
                e._formation = null;
                e._formationSlot = -1;
            }
        }
        this.members.length = 0;
    }
}

export class FormationManager {
    constructor(engine) {
        this.engine = engine;
        this.formations = [];
    }

    // Wire-up — called from wave-manager when a group is bundled into
    // a formation. Returns the new Formation instance.
    create(type, members, params) {
        if (!members || members.length === 0) return null;
        const formation = new Formation(this.engine, type, members, params);
        for (let i = 0; i < members.length; i++) {
            const e = members[i];
            if (!e) continue;
            e._formation = formation;
            e._formationSlot = i;
        }
        this.formations.push(formation);
        return formation;
    }

    // Per-frame tick — called from engine update loop after the player
    // has moved (so playerX / playerY are fresh) and BEFORE each enemy
    // updates individually.
    update() {
        if (this.formations.length === 0) return;
        const player = this.engine.player;
        if (!player || !player.active) return;
        const px = player.x;
        const py = player.y;
        const now = Date.now();

        for (let i = this.formations.length - 1; i >= 0; i--) {
            const f = this.formations[i];
            if (!f.isAlive(now)) {
                f.release();
                this.formations.splice(i, 1);
                continue;
            }
            f.tick(px, py);
        }
    }

    // End and release every active formation (called on wave clear
    // / game state reset so stragglers don't linger).
    clear() {
        for (const f of this.formations) f.release();
        this.formations.length = 0;
    }
}

// Heuristic chooser. Given a group of N enemies being spawned, pick a
// formation type and params. Returns null if no formation is desired
// (e.g. group too small).
//
// Type weighting biases toward orbit / weave at low N and adds
// flank / cross / figure8 as the group size grows.
export function pickFormation(memberCount, wave) {
    if (memberCount < 3) return null;          // too small
    const pool = ['orbit', 'weave', 'flank'];
    if (memberCount >= 4) pool.push('cross');
    if (memberCount >= 5) pool.push('figure8');
    const type = pool[(Math.random() * pool.length) | 0];
    const params = {
        // Slightly larger radii on bigger waves so a dense formation
        // doesn't smother the player.
        radius: 180 + Math.min(120, wave * 6),
        // 6-12s duration; longer on later waves so the choreography
        // has time to read at higher difficulty.
        duration: 6000 + Math.min(6000, wave * 250),
        angularSpeed: 0.45 + Math.random() * 0.4,
        lerp: 0.07 + Math.random() * 0.05,
    };
    return { type, params };
}
