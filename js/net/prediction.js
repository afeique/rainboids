// Client-side prediction for the local ship.
//
// Every input frame we apply locally and remember in a pending buffer.
// When a server snapshot arrives, we drop any pending inputs whose
// tick is ≤ the snapshot's tick, then replay the remaining buffer
// against the snapshot's authoritative ship state. With fixed-point
// physics on both sides, the replayed state should equal the locally
// predicted state byte-for-byte.
//
// Design contract (cf. `Multiplayer Rust Client Engine` plan §"Reconciliation
// strategy"): if `predictionDivergence` ever fires in the field, the
// parity harness has a hole. Log loudly and fix the harness.

import { Fxp } from '../sim/fxp.js';

/**
 * Pure ship-update step. Mirror of `server/src/sim/ship.rs::update_ship`.
 * For v1 this lives in this file as a placeholder; once the engine
 * refactor extracts ship physics into `js/sim/ship.js` we'll import
 * it from there.
 *
 * @param {{x: Fxp, y: Fxp, vx: Fxp, vy: Fxp, angle: number}} ship
 * @param {{moveX: number, moveY: number, aimX: number, aimY: number}} input
 * @param {Fxp} dt
 * @returns new ship state
 */
function defaultUpdateShip(ship, input, dt) {
    // Stub: until `js/sim/ship.js` is extracted from game-engine.js, the
    // predictor calls back into a wired-up update function. The default
    // no-op keeps the predictor wireable in tests without depending on
    // game-engine internals.
    return ship;
}

export class Predictor {
    constructor({ updateShip = defaultUpdateShip, dt } = {}) {
        this.updateShip = updateShip;
        this.dt = dt;
        /** @type {Array<{tick: number, input: object}>} */
        this.pending = [];
        this.tick = 0;
        /** @type {object|null} Local predicted ship state. */
        this.localShipState = null;
        /** Diagnostics counters. */
        this.divergenceCount = 0;
    }

    /** Establish baseline ship state from the server's RoomJoined snapshot. */
    setBaseline(ship, tick) {
        this.localShipState = ship;
        this.tick = tick | 0;
    }

    /** Apply one local input, advance prediction one tick. */
    applyLocalInput(input) {
        this.tick = (this.tick + 1) | 0;
        this.pending.push({ tick: this.tick, input });
        if (this.localShipState != null) {
            this.localShipState = this.updateShip(this.localShipState, input, this.dt);
        }
    }

    /**
     * Receive an authoritative ship state from the server. Replay any
     * pending inputs whose tick > serverTick to derive the predicted
     * state from this baseline; compare against our locally predicted
     * state and warn loudly on divergence.
     *
     * @param {number} serverTick
     * @param {object} serverShip - authoritative ShipState
     */
    onSnapshot(serverTick, serverShip) {
        // Drop already-acknowledged inputs.
        while (this.pending.length && this.pending[0].tick <= serverTick) {
            this.pending.shift();
        }
        // Replay pending inputs starting from the server's authoritative state.
        let s = cloneShip(serverShip);
        for (const p of this.pending) {
            s = this.updateShip(s, p.input, this.dt);
        }

        // Compare. Mismatch is a parity-harness escape; track it.
        if (this.localShipState && !shipsBitEqual(s, this.localShipState)) {
            this.divergenceCount++;
            // eslint-disable-next-line no-console
            console.warn('[net/prediction] divergence', {
                serverTick,
                pending: this.pending.length,
                replayed: s,
                local: this.localShipState,
            });
        }
        this.localShipState = s;
    }
}

function cloneShip(s) {
    // Shallow copy — fields are primitives or Fxp instances which are
    // value-like (raw is i32). Fxp.add/sub/mul return fresh Fxps so
    // mutating updateShip outputs won't alias.
    return { ...s };
}

function shipsBitEqual(a, b) {
    // Compare prediction-relevant fields bit-for-bit. f32 fields and the
    // Fxp `.raw` int both compare via ===.
    if (a == null || b == null) return false;
    if (a.x != null && a.x.raw !== undefined) {
        return (
            a.x.raw === b.x.raw &&
            a.y.raw === b.y.raw &&
            a.vx.raw === b.vx.raw &&
            a.vy.raw === b.vy.raw
        );
    }
    return a.x === b.x && a.y === b.y && a.vx === b.vx && a.vy === b.vy;
}
