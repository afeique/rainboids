// ─────────────────────────────────────────────────────────────────────────
// Enemy BRAIN — the two-layer AI that fuses strategy + steering
// ─────────────────────────────────────────────────────────────────────────
//
// This is the single entry point that replaces an enemy's bespoke movePattern.
// It runs both layers each tick:
//
//   Layer 1 (strategy.js)        — WHAT to do. A throttled utility selector
//                                  picks a tactic (close / orbit / dive-bomb /
//                                  kite / flank / regroup) and gives a goal.
//   Layer 2 (steering.js +       — HOW to do it. The goal becomes a desired
//            context-steering.js)  velocity; context steering bends it around
//                                  obstacles; the momentum integrator turns it
//                                  into physically-plausible motion.
//
// The brain WRITES enemy.vel only. enemy.js still integrates position
// (pos += vel·TICK_SCALE) afterwards, so SLOW/CHILL scaling, boundary
// bounce, status-effect zeroing and the ability overrides (charge/blink/
// cloak/boss drivers) all keep working unchanged — the brain just supplies a
// smarter velocity than the legacy patterns did, and only when the enemy opts
// in via `config.brain`.
//
// Physics params (mass / maxForce / maxSpeed / maxTurnRate) are where the
// big-slow vs small-fast feel lives: a heavy, low-force, low-turn archetype is
// a ponderous brute; a light, high-force, high-turn one is a twitchy
// interceptor. Sensible defaults are derived from the enemy's size/speed so a
// bare `brain: {}` already behaves, and archetypes tune from there.

import { GAME_CONFIG } from '../core/constants.js';
import { frameClock } from '../core/frame-clock.js';
import {
    seek, arrive, flee, pursue, separation, integrate, v2,
} from './steering.js';
import {
    ContextMap, addInterest, addDanger, chooseDirection,
} from './context-steering.js';
import { StrategyState, selectStrategy, STRAT } from './strategy.js';

// One shared ContextMap is enough: enemies are updated serially within a tick,
// and we reset() it at the start of every brain evaluation.
const CTX = new ContextMap(16);

// Scratch vectors reused across all enemies (serial updates → no aliasing).
const _force = v2();
const _tmp = v2();
const _heading = { x: 0, y: 0, blocked: false };

// ── Physics-param resolution ────────────────────────────────────────────────
// Build the per-enemy steering params once, derived from the archetype's
// `brain` block with size/speed-based fallbacks.
function resolveParams(enemy) {
    const b = enemy.config.brain || {};
    const size = enemy.config.size || 32;
    const speed = enemy.config.speed || 2;
    // maxSpeed defaults to the legacy per-type speed so tuning carries over.
    const maxSpeed = b.maxSpeed != null ? b.maxSpeed : speed;
    // Mass scales with size (bigger = heavier = more inertia). Normalized so a
    // 32px enemy is ~mass 1.
    const mass = b.mass != null ? b.mass : Math.max(0.4, size / 32);
    // maxForce: how hard the engine pushes. Lighter default for heavy things so
    // they accelerate slowly. Expressed in the same units as a velocity delta.
    const maxForce = b.maxForce != null ? b.maxForce : (0.05 * maxSpeed * (1 / mass) + 0.02);
    // maxTurnRate: radians/tick. Heavy things turn wider. 0/undefined = uncapped.
    const maxTurnRate = b.maxTurnRate != null ? b.maxTurnRate
        : Math.max(0.04, 0.22 / mass);
    return { mass, maxForce, maxSpeed, maxTurnRate };
}

// ── Context building ────────────────────────────────────────────────────────
function buildContext(enemy, player, gameEngine, params) {
    const dx = player.x - enemy.x, dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const b = enemy.config.brain || {};
    const preferredRange = b.preferredRange
        ?? (enemy.config.ai && enemy.config.ai.preferredRange)
        ?? 260;
    const healthFrac = enemy.maxHealth > 0 ? enemy.health / enemy.maxHealth : 1;
    // Weapon readiness 0..1 from the firing cooldown clock.
    const since = frameClock.now - (enemy.lastShot || 0);
    const weaponReady = Math.min(1, since / (enemy.firingCooldown || 1000));
    // Allies nearby (cheap: scan active enemies once, count within a radius).
    let alliesNear = 0;
    const pool = gameEngine && gameEngine.enemyPool;
    if (pool) {
        const list = pool.active || pool.activeObjects;
        if (list) {
            const r2 = 220 * 220;
            for (let i = 0; i < list.length; i++) {
                const o = list[i];
                if (o === enemy || !o.active) continue;
                const ex = o.x - enemy.x, ey = o.y - enemy.y;
                if (ex * ex + ey * ey < r2) { alliesNear++; if (alliesNear >= 6) break; }
            }
        }
    }
    return {
        dist, healthFrac, weaponReady, alliesNear,
        hasLOS: true, // LOS-through-asteroids is rare; treat as visible (cheap).
        preferredRange,
        tooClose: preferredRange * 0.55,
        tooFar: preferredRange * 2.2,
        isSwarm: !!b.swarm,
    };
}

// ── Strategy → goal mapping ─────────────────────────────────────────────────
// Each returns a desired-velocity force in _force and sets enemy.faceAngle.
// `desiredSpeedScale` lets a tactic move slower than top speed (orbit/kite).
function applyStrategy(strat, enemy, player, ctx, params, st) {
    const px = enemy.x, py = enemy.y;
    const tx = player.x, ty = player.y;
    const tvx = (player.vel && player.vel.x) || 0;
    const tvy = (player.vel && player.vel.y) || 0;
    const ms = params.maxSpeed;
    const toPlayer = Math.atan2(ty - py, tx - px);
    let faceVelocity = false;
    let speedScale = 1;

    switch (strat) {
        case STRAT.CLOSE_DISTANCE: {
            // Advance aggressively, but loom at a short PRESSURE range rather
            // than face-hug. Pure pursuit drove brutes to point-blank (mean
            // ~34px), an unfun permanent contact-damage aura that ignored
            // preferredRange. Now: pursue hard when far, then ARRIVE onto a
            // standoff ring (pref × closeStandoff, default 0.6) and hold —
            // heavy, in-your-face, but not overlapping. Dedicated rammers
            // (JUGGERNAUT) press tighter via brain.closeStandoff + their charge.
            const standoff = ctx.preferredRange
                * ((enemy.config.brain && enemy.config.brain.closeStandoff) || 0.6);
            if (ctx.dist > standoff * 1.4) {
                pursue(_force, px, py, enemy.vel.x, enemy.vel.y, tx, ty, tvx, tvy, ms, 22);
            } else {
                const a = Math.atan2(py - ty, px - tx); // player → enemy heading
                const rx = tx + Math.cos(a) * standoff;
                const ry = ty + Math.sin(a) * standoff;
                arrive(_force, px, py, rx, ry, enemy.vel.x, enemy.vel.y, ms, 60);
            }
            break;
        }
        case STRAT.ORBIT: {
            // Aim at a point on the preferred-range ring, offset along the
            // strafe direction so the enemy circles rather than sits.
            const ang = toPlayer + Math.PI + st.orbitDir * 0.6; // tangent-ish
            const rx = tx + Math.cos(ang) * ctx.preferredRange;
            const ry = ty + Math.sin(ang) * ctx.preferredRange;
            arrive(_force, px, py, rx, ry, enemy.vel.x, enemy.vel.y, ms, 80);
            speedScale = 0.85;
            break;
        }
        case STRAT.DIVE_BOMB: {
            // approach → strike (drive through a point past the player) → peel.
            if (st.diveState === 'approach') {
                pursue(_force, px, py, enemy.vel.x, enemy.vel.y, tx, ty, tvx, tvy, ms * 1.35, 26);
                if (ctx.dist < ctx.preferredRange * 0.7) {
                    st.diveState = 'strike';
                    st.diveUntil = frameClock.now + 650;
                    // Lock a point beyond the player to drive through.
                    st.diveTX = tx + (tx - px); st.diveTY = ty + (ty - py);
                }
            } else if (st.diveState === 'strike') {
                seek(_force, px, py, st.diveTX, st.diveTY, enemy.vel.x, enemy.vel.y, ms * 1.5);
                faceVelocity = true;
                if (frameClock.now > st.diveUntil) { st.diveState = 'peel'; st.diveUntil = frameClock.now + 500; }
            } else { // peel
                flee(_force, px, py, tx, ty, enemy.vel.x, enemy.vel.y, ms * 1.2);
                faceVelocity = true;
                if (frameClock.now > st.diveUntil || ctx.dist > ctx.preferredRange * 1.6) {
                    st.diveState = 'approach';
                }
            }
            break;
        }
        case STRAT.KITE: {
            if (ctx.dist < ctx.preferredRange) {
                flee(_force, px, py, tx, ty, enemy.vel.x, enemy.vel.y, ms);
            } else {
                // Hold the line at preferred range.
                const rx = tx + Math.cos(toPlayer + Math.PI) * ctx.preferredRange;
                const ry = ty + Math.sin(toPlayer + Math.PI) * ctx.preferredRange;
                arrive(_force, px, py, rx, ry, enemy.vel.x, enemy.vel.y, ms, 70);
                speedScale = 0.7;
            }
            break;
        }
        case STRAT.FLANK: {
            // Target a point offset to the player's side; swing wide then close.
            const side = toPlayer + st.flankSign * (Math.PI * 0.5);
            const off = ctx.preferredRange * 0.9;
            const fx = tx + Math.cos(side) * off;
            const fy = ty + Math.sin(side) * off;
            arrive(_force, px, py, fx, fy, enemy.vel.x, enemy.vel.y, ms, 90);
            break;
        }
        case STRAT.REGROUP:
        default: {
            if (ctx.healthFrac < 0.25) {
                flee(_force, px, py, tx, ty, enemy.vel.x, enemy.vel.y, ms);
            } else {
                // Drift toward allies / away; gentle wander via seek to a point
                // offset from the player at long range.
                const rx = tx + Math.cos(toPlayer + Math.PI) * ctx.tooFar;
                const ry = ty + Math.sin(toPlayer + Math.PI) * ctx.tooFar;
                arrive(_force, px, py, rx, ry, enemy.vel.x, enemy.vel.y, ms, 120);
                speedScale = 0.6;
            }
            faceVelocity = true;
            break;
        }
    }

    // Face the player by default (so the firing ±tolerance gate can open);
    // dive/peel/regroup face their travel direction for readability.
    if (faceVelocity && Math.hypot(enemy.vel.x, enemy.vel.y) > 0.05) {
        enemy.targetFaceAngle = Math.atan2(enemy.vel.y, enemy.vel.x);
    } else {
        enemy.targetFaceAngle = toPlayer;
    }
    return speedScale;
}

/**
 * Main brain tick. Call instead of the legacy movePattern dispatch when the
 * enemy has `config.brain`. Mutates enemy.vel (and faceAngle).
 */
export function updateBrain(enemy, gameEngine) {
    const player = enemy.targetPlayer;
    if (!player) return;

    // Lazy-init / reset-on-type-change so a pooled enemy recycled into another
    // type can't carry a stale brain.
    if (!enemy._brain || enemy._brainType !== enemy.type) {
        enemy._brain = new StrategyState();
        enemy._brainType = enemy.type;
        enemy._brainParams = resolveParams(enemy);
    }
    const st = enemy._brain;
    const params = enemy._brainParams;
    const ctx = buildContext(enemy, player, gameEngine, params);

    // Layer 1: pick a tactic (throttled + hysteresis inside).
    const allowed = (enemy.config.brain && enemy.config.brain.strategies) || DEFAULT_STRATEGIES;
    const strat = selectStrategy(st, ctx, allowed, frameClock.now, {
        evalIntervalMs: (enemy.config.brain && enemy.config.brain.evalIntervalMs) || 350,
    });
    // Expose the active strategy so the firing system can react to it
    // (dive-bombers fire on the strike, kiters fire while backing off, etc.).
    enemy._aiStrategy = strat;

    // ── Aim point (movement-independent firing lead) ──
    // Snipers/interceptors aim AHEAD of the player (intercept), so a moving
    // target doesn't trivially outrun their shots; brawlers/sprayers aim at the
    // current position. Controlled per-archetype via `brain.leadShots` (a
    // 0..1+ strength; default derived: snipers/interceptors lead, brutes don't).
    // The firing code reads enemy._aimX/_aimY; falls back to player pos itself
    // if a type never runs the brain.
    {
        const b = enemy.config.brain || {};
        let lead = b.leadShots;
        if (lead == null) {
            // Default: tactics that fight at range / dive want lead.
            lead = (strat === STRAT.KITE || strat === STRAT.ORBIT
                || strat === STRAT.DIVE_BOMB || strat === STRAT.FLANK) ? 0.8 : 0.0;
        }
        const tvx = (player.vel && player.vel.x) || 0;
        const tvy = (player.vel && player.vel.y) || 0;
        // Estimate the projectile's flight time to the player (bullet speed in
        // the same per-tick units; fall back to a typical enemy bullet speed).
        const bulletSpeed = b.bulletLeadSpeed || 6;
        const t = lead > 0 ? Math.min(40, ctx.dist / bulletSpeed) * lead : 0;
        enemy._aimX = player.x + tvx * t;
        enemy._aimY = player.y + tvy * t;
    }

    // Layer 2a: strategy → desired-velocity force.
    const speedScale = applyStrategy(strat, enemy, player, ctx, params, st);

    // Layer 2b: context steering — bend the goal around obstacles.
    CTX.reset();
    // Interest toward the desired-velocity direction.
    let gdx = _force.x, gdy = _force.y;
    const glen = Math.hypot(gdx, gdy);
    if (glen > 1e-6) { gdx /= glen; gdy /= glen; }
    else { gdx = Math.cos(enemy.faceAngle || 0); gdy = Math.sin(enemy.faceAngle || 0); }
    addInterest(CTX, gdx, gdy, 1, 2);

    // Danger from asteroids (the obstacles steering must route around).
    const avoidR = params.maxSpeed * 28 + enemy.radius + 40;
    if (gameEngine && gameEngine.asteroidPool) {
        const rocks = gameEngine.asteroidPool.active || gameEngine.asteroidPool.activeObjects;
        if (rocks) {
            for (let i = 0; i < rocks.length; i++) {
                const a = rocks[i];
                if (!a.active) continue;
                addDanger(CTX, enemy.x, enemy.y, a.x, a.y, (a.radius || 30) + enemy.radius, avoidR);
            }
        }
    }

    // Choose a heading that pursues the goal but avoids danger.
    chooseDirection(CTX, _heading, 0.45);

    // Desired velocity = chosen heading at the tactic's speed.
    const desiredSpeed = params.maxSpeed * speedScale;
    const dvx = _heading.x * desiredSpeed;
    const dvy = _heading.y * desiredSpeed;
    _force.x = dvx - enemy.vel.x;
    _force.y = dvy - enemy.vel.y;

    // Add separation so swarms don't pile up (cheap: nearby active enemies).
    if (gameEngine && gameEngine.enemyPool) {
        const list = gameEngine.enemyPool.active || gameEngine.enemyPool.activeObjects;
        if (list) {
            separation(_tmp, enemy.x, enemy.y, list, enemy.radius * 2.4 + 18, enemy);
            const sepW = (enemy.config.brain && enemy.config.brain.separationWeight) || 0.6;
            _force.x += _tmp.x * sepW * params.maxSpeed;
            _force.y += _tmp.y * sepW * params.maxSpeed;
        }
    }

    // Layer 2c: integrate under physical limits → new velocity.
    integrate(enemy, _force, params);

    // Smoothly turn the face toward the target face angle (firing reads this).
    const tf = enemy.targetFaceAngle;
    if (typeof tf === 'number') {
        const turn = enemy.turnSpeed || 0.12;
        let d = tf - (enemy.faceAngle || 0);
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        if (d > turn) d = turn; else if (d < -turn) d = -turn;
        enemy.faceAngle = (enemy.faceAngle || 0) + d;
    }
}

const DEFAULT_STRATEGIES = [
    STRAT.CLOSE_DISTANCE, STRAT.ORBIT, STRAT.DIVE_BOMB, STRAT.REGROUP,
];

export { resolveParams };
