// ─────────────────────────────────────────────────────────────────────────
// Strategy brain — utility-based tactic selection (the "what")
// ─────────────────────────────────────────────────────────────────────────
//
// Layer 1 of the two-layer AI. Each enemy periodically scores a small set of
// candidate STRATEGIES by utility (distance, own health, weapon readiness,
// allies nearby, line-of-sight) and commits to the best one. A strategy
// outputs a GOAL POINT plus a behavior weighting; the steering layer (layer 2,
// in brain.js) turns that into momentum-correct motion every tick.
//
// Re-evaluation is THROTTLED (a few times a second, not every tick) and uses
// HYSTERESIS (the current strategy gets a stickiness bonus) so enemies commit
// to a plan and read as deliberate instead of flickering between tactics.
//
// Strategies are data + a scorer; archetypes pick which subset they can use
// (their `strategySet`) and tune weights. This is what lets one HUNTER chase
// while a wounded one retreats and a flanker swings wide — all from the same
// brain, no per-type hand-coding.

export const STRAT = {
    CLOSE_DISTANCE: 'close_distance', // seek the player (with lead) — brawlers
    ORBIT:          'orbit',          // hold a tangent on a ring at preferred range
    DIVE_BOMB:      'dive_bomb',      // fast pass through the player, fire, peel off
    KITE:           'kite',           // back off while staying in firing range
    FLANK:          'flank',          // approach from behind / the side
    REGROUP:        'regroup',        // low HP / no LOS — wander, recover, rejoin
};

// Tunable scorers. Each returns a raw utility in ~[0,1+] given a context.
// ctx = {
//   dist, healthFrac, weaponReady (0..1), alliesNear, hasLOS,
//   preferredRange, tooClose, tooFar, isSwarm,
// }
const SCORERS = {
    [STRAT.CLOSE_DISTANCE](ctx) {
        // Want to close when far and healthy; brawler default.
        const far = clamp01((ctx.dist - ctx.preferredRange) / (ctx.tooFar - ctx.preferredRange + 1e-6));
        return 0.35 + far * 0.5 + ctx.healthFrac * 0.15;
    },
    [STRAT.ORBIT](ctx) {
        // Best when already near preferred range with LOS — strafe and plink.
        const bandCloseness = 1 - clamp01(Math.abs(ctx.dist - ctx.preferredRange) / (ctx.preferredRange + 1e-6));
        return 0.3 + bandCloseness * 0.5 + (ctx.hasLOS ? 0.2 : 0);
    },
    [STRAT.DIVE_BOMB](ctx) {
        // Periodic aggressive lunge; better with allies (coordinated pressure)
        // and when weapon is charged. Rises with distance so it's an approach.
        const reach = clamp01((ctx.dist - ctx.preferredRange * 0.5) / (ctx.tooFar + 1e-6));
        return 0.25 + reach * 0.4 + ctx.weaponReady * 0.2 + Math.min(0.2, ctx.alliesNear * 0.05);
    },
    [STRAT.KITE](ctx) {
        // Snipers/artillery: retreat when the player gets inside their range.
        const tooNear = clamp01((ctx.preferredRange - ctx.dist) / (ctx.preferredRange + 1e-6));
        return 0.2 + tooNear * 0.7;
    },
    [STRAT.FLANK](ctx) {
        // Swing wide to attack from the side/rear; good at mid distance w/ LOS.
        const mid = 1 - clamp01(Math.abs(ctx.dist - ctx.preferredRange * 1.3) / (ctx.preferredRange + 1e-6));
        return 0.25 + mid * 0.45 + (ctx.hasLOS ? 0.1 : 0);
    },
    [STRAT.REGROUP](ctx) {
        // Triggered by low health or no line of sight (lost the player).
        const hurt = 1 - ctx.healthFrac;
        return (ctx.hasLOS ? 0.05 : 0.4) + hurt * 0.8;
    },
};

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Per-enemy strategy state. Attach one to each archetype-driven enemy.
 */
export class StrategyState {
    constructor() {
        this.current = null;
        this.nextEvalAt = 0;     // frameClock.now timestamp
        this.committedUntil = 0;  // minimum commit time for the current strategy
        // Sub-state used by the steering layer for the active strategy:
        this.orbitDir = 1;        // +1 / -1 strafe direction
        this.diveState = 'approach'; // approach → strike → peel
        this.diveUntil = 0;
        this.flankSign = 1;
    }
}

/**
 * Select (or keep) a strategy. Throttled by `evalIntervalMs`; applies a
 * stickiness bonus to the current choice so it doesn't thrash.
 *
 * @param state  StrategyState
 * @param ctx    scoring context (see SCORERS)
 * @param allowed array of STRAT values this archetype may use
 * @param now    frameClock.now (ms)
 * @param opts   {evalIntervalMs=350, stickiness=0.18, minCommitMs=500, rnd}
 * @returns the chosen STRAT (also stored on state.current)
 */
export function selectStrategy(state, ctx, allowed, now, opts = {}) {
    const evalInterval = opts.evalIntervalMs ?? 350;
    const stickiness = opts.stickiness ?? 0.18;
    const minCommit = opts.minCommitMs ?? 500;
    const rnd = opts.rnd || Math.random;

    // Force REGROUP immediately on critical health regardless of throttle —
    // self-preservation shouldn't wait for the next eval tick.
    if (ctx.healthFrac < 0.2 && allowed.includes(STRAT.REGROUP)) {
        if (state.current !== STRAT.REGROUP) {
            state.current = STRAT.REGROUP;
            state.committedUntil = now + minCommit;
        }
        state.nextEvalAt = now + evalInterval;
        return state.current;
    }

    // Honor the throttle + minimum commit window.
    if (state.current && now < state.nextEvalAt && now < state.committedUntil) {
        return state.current;
    }
    if (state.current && now < state.nextEvalAt) {
        // Throttle not elapsed and not past commit → keep current.
        return state.current;
    }

    let best = state.current || allowed[0];
    let bestScore = -Infinity;
    for (let i = 0; i < allowed.length; i++) {
        const s = allowed[i];
        const scorer = SCORERS[s];
        if (!scorer) continue;
        let score = scorer(ctx);
        if (s === state.current) score += stickiness; // hysteresis
        // Tiny noise so identical enemies don't all pick the same tactic in
        // lockstep (varied, less robotic crowds). Deterministic via supplied rnd.
        score += (rnd() - 0.5) * 0.05;
        if (score > bestScore) { bestScore = score; best = s; }
    }

    if (best !== state.current) {
        state.current = best;
        state.committedUntil = now + minCommit;
        // Re-roll per-strategy sub-state on entry.
        state.orbitDir = rnd() < 0.5 ? -1 : 1;
        state.flankSign = rnd() < 0.5 ? -1 : 1;
        state.diveState = 'approach';
    }
    state.nextEvalAt = now + evalInterval;
    return state.current;
}

export { SCORERS };
