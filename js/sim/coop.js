// js/sim/coop.js — co-op support mechanics. v1: reviving downed teammates.
//
// A downed ship (alive=false, downed=true) accrues revive progress while any
// living teammate is within REVIVE_RADIUS; reaching REVIVE_TICKS brings it back
// with REVIVE_HP. Progress decays when no one is nearby. Pure state mutation +
// event emission; no rendering.

import { REVIVE_RADIUS, REVIVE_TICKS, REVIVE_HP, REVIVE_DECAY } from './constants.js';
import { EV, emit } from './events.js';

export function updateRevives(world) {
  const r2 = REVIVE_RADIUS * REVIVE_RADIUS;
  for (const [, ship] of world.ships) {
    if (!ship.downed) { ship.reviveProgress = 0; continue; }

    let hasReviver = false;
    for (const [, other] of world.ships) {
      if (other === ship || !other.alive) continue;
      const dx = other.x - ship.x;
      const dy = other.y - ship.y;
      if (dx * dx + dy * dy <= r2) { hasReviver = true; break; }
    }

    if (hasReviver) {
      ship.reviveProgress += 1;
      if (ship.reviveProgress >= REVIVE_TICKS) {
        ship.alive = true;
        ship.downed = false;
        ship.hp = REVIVE_HP;
        ship.reviveProgress = 0;
        emit(world, EV.SHIP_REVIVED, { id: ship.playerId, x: ship.x, y: ship.y });
      }
    } else if (ship.reviveProgress > 0) {
      ship.reviveProgress = Math.max(0, ship.reviveProgress - REVIVE_DECAY);
    }
  }
}
