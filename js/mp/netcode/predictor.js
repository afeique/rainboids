// js/mp/netcode/predictor.js — client-side prediction + reconciliation for the
// LOCAL ship only. Remote ships are interpolated, not predicted.
//
// Each local tick we advance the local ship with the current input using the
// SAME shared sim step the server runs (js/sim/ship.js), and remember the input
// in a pending buffer tagged with a clientTick. When an authoritative snapshot
// arrives, we snap the ship to the server's state and replay the inputs the
// server hadn't acked yet — so the ship sits on the server's truth while still
// responding instantly to local input.

import { createShip, stepShip } from '../../sim/ship.js';

const PENDING_CAP = 600; // ~10 s at 60 Hz; safety bound

export class Predictor {
  constructor(playerId, spawnX, spawnY, width, height) {
    this.playerId = playerId;
    this.width = width;
    this.height = height;
    this.ship = createShip(playerId, spawnX, spawnY);
    this.pending = []; // [{ clientTick, input }]
    this.clientTick = 0;
  }

  /** Advance one local tick with `input`; returns the tagged clientTick. */
  step(input) {
    this.clientTick++;
    stepShip(this.ship, input, this.width, this.height);
    this.pending.push({ clientTick: this.clientTick, input });
    if (this.pending.length > PENDING_CAP) this.pending.shift();
    return this.clientTick;
  }

  /**
   * Reconcile against the server's authoritative ship state.
   * @param {object} auth - { x, y, vx, vy, angle }
   * @param {number} ackedTick - highest clientTick the server has applied
   */
  reconcile(auth, ackedTick) {
    this.ship.x = auth.x;
    this.ship.y = auth.y;
    this.ship.vx = auth.vx;
    this.ship.vy = auth.vy;
    this.ship.angle = auth.angle;
    // Discard inputs the server has already incorporated.
    this.pending = this.pending.filter((f) => f.clientTick > ackedTick);
    // Replay the rest to catch back up to "now".
    for (const f of this.pending) {
      stepShip(this.ship, f.input, this.width, this.height);
    }
  }
}
