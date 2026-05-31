// ─────────────────────────────────────────────────────────────────────────
// Reynolds steering behaviors + momentum integrator
// ─────────────────────────────────────────────────────────────────────────
//
// This is the movement SUBSTRATE for the new enemy AI. Every behavior answers
// one question — "which way do I want to push?" — by computing a *desired
// velocity* and returning the steering force needed to get there:
//
//     desired_velocity = (where I want to go, at the speed I want)
//     steering_force   = desired_velocity − current_velocity
//
// The integrator then turns force into motion under physical limits:
//
//     force  = truncate(force, maxForce)     // engine can't push harder
//     accel  = force / mass                  // F = ma  → heavy = sluggish
//     vel    = truncate(vel + accel, maxSpeed)
//     (caller integrates position: pos += vel * TICK_SCALE)
//
// Units match the rest of the sim: velocity is "units per 30fps-frame" (the
// engine multiplies by GAME_CONFIG.TICK_SCALE = 0.5 at the 60Hz logic tick),
// so maxSpeed lines up with the legacy per-type `config.speed` values
// (0.75–3.5) and maxForce with the legacy per-frame accel values (~0.01–0.05).
//
// Momentum, inertia and "banking" turns are EMERGENT here — they fall out of
// the integrator, not from hand-authored curves. A heavy, low-force, low-turn
// agent is a ponderous brute; a light, high-force, high-turn agent is a
// twitchy interceptor. That is how big/slow vs small/fast is expressed.
//
// All functions are pure and write into a caller-supplied output vector
// (`out`) to stay allocation-free in the hot loop. They are also trivially
// unit-testable in Node (see tests/unit/ai/steering.test.js).

// ── Vec2 scratch helpers (operate on {x, y}) ────────────────────────────────

export function v2(x = 0, y = 0) { return { x, y }; }

export function v2set(out, x, y) { out.x = x; out.y = y; return out; }

export function v2copy(out, a) { out.x = a.x; out.y = a.y; return out; }

export function v2add(out, a, b) { out.x = a.x + b.x; out.y = a.y + b.y; return out; }

export function v2sub(out, a, b) { out.x = a.x - b.x; out.y = a.y - b.y; return out; }

export function v2scale(out, a, s) { out.x = a.x * s; out.y = a.y * s; return out; }

export function v2len(a) { return Math.hypot(a.x, a.y); }

export function v2lenSq(a) { return a.x * a.x + a.y * a.y; }

export function v2dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

/** Normalize in place; zero vector stays zero. */
export function v2norm(out, a) {
    const len = Math.hypot(a.x, a.y);
    if (len > 1e-9) { out.x = a.x / len; out.y = a.y / len; }
    else { out.x = 0; out.y = 0; }
    return out;
}

/** Clamp a vector's magnitude to `max` (in place). */
export function v2truncate(out, a, max) {
    const len = Math.hypot(a.x, a.y);
    if (len > max && len > 1e-9) {
        const s = max / len;
        out.x = a.x * s; out.y = a.y * s;
    } else if (out !== a) {
        out.x = a.x; out.y = a.y;
    }
    return out;
}

// ── Core behaviors ──────────────────────────────────────────────────────────
// Each writes the steering FORCE into `out` and returns it.

/**
 * SEEK — steer at full throttle toward a static point. Overshoots on its own
 * (momentum carries past), which reads as eager, committed pursuit.
 */
export function seek(out, px, py, tx, ty, velX, velY, maxSpeed) {
    let dx = tx - px, dy = ty - py;
    const d = Math.hypot(dx, dy);
    if (d > 1e-9) { dx = (dx / d) * maxSpeed; dy = (dy / d) * maxSpeed; }
    out.x = dx - velX; out.y = dy - velY;
    return out;
}

/** FLEE — Seek with the desired velocity reversed (run directly away). */
export function flee(out, px, py, tx, ty, velX, velY, maxSpeed) {
    let dx = px - tx, dy = py - ty;
    const d = Math.hypot(dx, dy);
    if (d > 1e-9) { dx = (dx / d) * maxSpeed; dy = (dy / d) * maxSpeed; }
    out.x = dx - velX; out.y = dy - velY;
    return out;
}

/**
 * ARRIVE — Seek that brakes inside `slowRadius`, easing to a stop ON the
 * target instead of overshooting. Used to settle onto an orbit point or a
 * formation slot without jitter.
 */
export function arrive(out, px, py, tx, ty, velX, velY, maxSpeed, slowRadius) {
    let dx = tx - px, dy = ty - py;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) { out.x = -velX; out.y = -velY; return out; }
    // Desired speed ramps down linearly inside the slowing radius.
    const desiredSpeed = d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed;
    dx = (dx / d) * desiredSpeed; dy = (dy / d) * desiredSpeed;
    out.x = dx - velX; out.y = dy - velY;
    return out;
}

/**
 * PURSUE — Seek the target's PREDICTED position (intercept / lead). The look-
 * ahead time scales with distance but is capped, so close targets aren't
 * over-predicted. This is movement-level lead targeting; the firing system has
 * its own aim-lead.
 */
export function pursue(out, px, py, velX, velY, tx, ty, tvx, tvy, maxSpeed, maxPredict) {
    const dx = tx - px, dy = ty - py;
    const d = Math.hypot(dx, dy);
    const t = Math.min(maxPredict, d / (maxSpeed || 1));
    return seek(out, px, py, tx + tvx * t, ty + tvy * t, velX, velY, maxSpeed);
}

/** EVADE — Flee the target's predicted position. */
export function evade(out, px, py, velX, velY, tx, ty, tvx, tvy, maxSpeed, maxPredict) {
    const dx = tx - px, dy = ty - py;
    const d = Math.hypot(dx, dy);
    const t = Math.min(maxPredict, d / (maxSpeed || 1));
    return flee(out, px, py, tx + tvx * t, ty + tvy * t, velX, velY, maxSpeed);
}

/**
 * WANDER — smooth idle roaming. Maintains a heading on a circle projected
 * ahead of the agent and jitters it slightly each tick; small continuous
 * jitter → lazy organic drift, not random twitching. `state.wanderAngle`
 * persists across ticks (seed it before first use).
 *
 * @param state {wanderAngle:number}  mutated in place
 * @param jitter random offset magnitude (radians/tick), e.g. 0.3
 * @param circleDist how far ahead the circle sits (e.g. maxSpeed*… )
 * @param circleRadius circle size (turn sharpness)
 * @param rnd () => [-1,1) deterministic-friendly random source
 */
export function wander(out, velX, velY, state, jitter, circleDist, circleRadius, rnd, maxSpeed) {
    state.wanderAngle += rnd() * jitter;
    // Center the wander circle ahead along current heading (or +x if still).
    let hx = velX, hy = velY;
    const hlen = Math.hypot(hx, hy);
    if (hlen > 1e-6) { hx /= hlen; hy /= hlen; } else { hx = 1; hy = 0; }
    const cx = hx * circleDist, cy = hy * circleDist;
    const dx = cx + Math.cos(state.wanderAngle) * circleRadius;
    const dy = cy + Math.sin(state.wanderAngle) * circleRadius;
    // Treat the circle-point offset as a desired velocity.
    const dlen = Math.hypot(dx, dy) || 1;
    out.x = (dx / dlen) * maxSpeed - velX;
    out.y = (dy / dlen) * maxSpeed - velY;
    return out;
}

// ── Flocking (Boids) ────────────────────────────────────────────────────────
// Neighbors is an array of {x, y, vel:{x,y}} (other agents). These power
// swarm behavior; pair them with the spatial grid so the neighbor set is
// small. Each returns a force.

/** SEPARATION — steer away from close neighbors (don't crowd). 1/d weighting. */
export function separation(out, px, py, neighbors, sepRadius, self) {
    let sx = 0, sy = 0, n = 0;
    const r2 = sepRadius * sepRadius;
    for (let i = 0; i < neighbors.length; i++) {
        const o = neighbors[i];
        if (o === self) continue;
        const dx = px - o.x, dy = py - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1e-6 && d2 < r2) {
            const d = Math.sqrt(d2);
            sx += (dx / d) / d;   // push harder the closer it is
            sy += (dy / d) / d;
            n++;
        }
    }
    if (n > 0) { out.x = sx / n; out.y = sy / n; } else { out.x = 0; out.y = 0; }
    return out;
}

/** COHESION — steer toward the group's center of mass. */
export function cohesion(out, px, py, velX, velY, neighbors, radius, maxSpeed, self) {
    let cx = 0, cy = 0, n = 0;
    const r2 = radius * radius;
    for (let i = 0; i < neighbors.length; i++) {
        const o = neighbors[i];
        if (o === self) continue;
        const dx = o.x - px, dy = o.y - py;
        if (dx * dx + dy * dy < r2) { cx += o.x; cy += o.y; n++; }
    }
    if (n === 0) { out.x = 0; out.y = 0; return out; }
    return seek(out, px, py, cx / n, cy / n, velX, velY, maxSpeed);
}

/** ALIGNMENT — match the average heading of nearby neighbors. */
export function alignment(out, px, py, velX, velY, neighbors, radius, maxSpeed, self) {
    let vx = 0, vy = 0, n = 0;
    const r2 = radius * radius;
    for (let i = 0; i < neighbors.length; i++) {
        const o = neighbors[i];
        if (o === self || !o.vel) continue;
        const dx = o.x - px, dy = o.y - py;
        if (dx * dx + dy * dy < r2) { vx += o.vel.x; vy += o.vel.y; n++; }
    }
    if (n === 0) { out.x = 0; out.y = 0; return out; }
    vx /= n; vy /= n;
    const len = Math.hypot(vx, vy);
    if (len > 1e-6) { vx = (vx / len) * maxSpeed; vy = (vy / len) * maxSpeed; }
    out.x = vx - velX; out.y = vy - velY;
    return out;
}

/**
 * CONTAINMENT — steer back inward when approaching arena bounds. Produces a
 * force only inside `margin` of an edge, ramped by how deep into the margin
 * the agent is. Keeps enemies off the hard walls without a hard clamp.
 */
export function containment(out, px, py, minX, minY, maxX, maxY, margin, maxSpeed) {
    let fx = 0, fy = 0;
    if (px < minX + margin) fx += (1 - (px - minX) / margin);
    else if (px > maxX - margin) fx -= (1 - (maxX - px) / margin);
    if (py < minY + margin) fy += (1 - (py - minY) / margin);
    else if (py > maxY - margin) fy -= (1 - (maxY - py) / margin);
    out.x = fx * maxSpeed; out.y = fy * maxSpeed;
    return out;
}

// ── Momentum integrator ─────────────────────────────────────────────────────

/**
 * Apply an accumulated steering force to an agent's velocity under physical
 * limits, then return the velocity (the caller integrates position with
 * TICK_SCALE). Mutates `agent.vel`.
 *
 * @param agent  {vel:{x,y}}
 * @param force  {x,y} accumulated steering force (pre-truncation)
 * @param p {mass, maxForce, maxSpeed, maxTurnRate}
 *   - mass        higher = more sluggish (accel = force/mass)
 *   - maxForce    cap on steering force (engine power)
 *   - maxSpeed    cap on resulting speed
 *   - maxTurnRate max change of heading per tick (radians); 0/undefined = off.
 *                 Adds rotational inertia so heavy things turn in wide arcs.
 */
export function integrate(agent, force, p) {
    const vel = agent.vel;
    const mass = p.mass > 0 ? p.mass : 1;
    const maxForce = p.maxForce, maxSpeed = p.maxSpeed;

    // Truncate force to engine power, convert to acceleration.
    let fx = force.x, fy = force.y;
    const flen = Math.hypot(fx, fy);
    if (flen > maxForce && flen > 1e-9) { const s = maxForce / flen; fx *= s; fy *= s; }
    let nvx = vel.x + fx / mass;
    let nvy = vel.y + fy / mass;

    // Turn-rate limit: rotate the new velocity no more than maxTurnRate away
    // from the old heading (only meaningful while already moving).
    const turn = p.maxTurnRate;
    if (turn && turn > 0) {
        const oldLen = Math.hypot(vel.x, vel.y);
        const newLen = Math.hypot(nvx, nvy);
        if (oldLen > 1e-4 && newLen > 1e-4) {
            const oldA = Math.atan2(vel.y, vel.x);
            const newA = Math.atan2(nvy, nvx);
            let dA = newA - oldA;
            while (dA > Math.PI) dA -= 2 * Math.PI;
            while (dA < -Math.PI) dA += 2 * Math.PI;
            if (dA > turn) dA = turn; else if (dA < -turn) dA = -turn;
            const a = oldA + dA;
            nvx = Math.cos(a) * newLen;
            nvy = Math.sin(a) * newLen;
        }
    }

    // Clamp speed.
    const slen = Math.hypot(nvx, nvy);
    if (slen > maxSpeed && slen > 1e-9) { const s = maxSpeed / slen; nvx *= s; nvy *= s; }

    vel.x = nvx; vel.y = nvy;
    return vel;
}
