/**
 * tests/unit/sim-coop.test.js — co-op revive mechanic.
 */

import { describe, it, expect } from '@jest/globals';
import { createWorld, addShip } from '../../js/sim/world.js';
import { updateRevives } from '../../js/sim/coop.js';
import { EV } from '../../js/sim/events.js';
import { REVIVE_TICKS, REVIVE_HP, REVIVE_RADIUS, REVIVE_DECAY } from '../../js/sim/constants.js';

function down(ship) { ship.alive = false; ship.downed = true; ship.hp = 0; return ship; }

describe('co-op revive', () => {
  it('revives a downed ship after a nearby teammate lingers REVIVE_TICKS', () => {
    const w = createWorld({ seed: 1 });
    const s1 = down(addShip(w, 1, 500, 500));
    addShip(w, 2, 540, 500); // within REVIVE_RADIUS

    let revivedAt = -1;
    for (let i = 0; i < REVIVE_TICKS; i++) {
      w.events.length = 0;
      updateRevives(w);
      if (w.events.some((e) => e.type === EV.SHIP_REVIVED && e.id === 1)) revivedAt = i;
    }
    expect(revivedAt).toBe(REVIVE_TICKS - 1);
    expect(s1.alive).toBe(true);
    expect(s1.downed).toBe(false);
    expect(s1.hp).toBe(REVIVE_HP);
    expect(s1.reviveProgress).toBe(0);
  });

  it('does not revive without a nearby teammate', () => {
    const w = createWorld({ seed: 1 });
    const s1 = down(addShip(w, 1, 500, 500));
    addShip(w, 2, 500 + REVIVE_RADIUS + 50, 500); // out of range

    for (let i = 0; i < REVIVE_TICKS + 10; i++) updateRevives(w);
    expect(s1.downed).toBe(true);
    expect(s1.reviveProgress).toBe(0);
  });

  it('decays revive progress when the reviver leaves', () => {
    const w = createWorld({ seed: 1 });
    const s1 = down(addShip(w, 1, 500, 500));
    const s2 = addShip(w, 2, 540, 500);

    for (let i = 0; i < 20; i++) updateRevives(w);
    expect(s1.reviveProgress).toBe(20);

    s2.x = 500 + 1000; // move far away
    updateRevives(w);
    expect(s1.reviveProgress).toBe(20 - REVIVE_DECAY);
  });

  it('keeps living ships at zero revive progress', () => {
    const w = createWorld({ seed: 1 });
    const s = addShip(w, 1, 500, 500);
    s.reviveProgress = 55; // stale value
    updateRevives(w);
    expect(s.reviveProgress).toBe(0);
  });
});
