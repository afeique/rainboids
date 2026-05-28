/**
 * tests/unit/room-class-selection.test.js — MP server room-class selection.
 *
 * Locks the DEFAULT: the real SP-sim room (SpRoom) is served unless MP_SIM
 * explicitly selects the legacy toy sim.
 */

import { describe, it, expect } from '@jest/globals';
import { roomClassFor } from '../../server/src/room-manager.js';
import { Room } from '../../server/src/room.js';
import { SpRoom } from '../../server/src/sp-room.js';

describe('roomClassFor — MP sim selection', () => {
  it('defaults to the real SP sim (SpRoom)', () => {
    expect(roomClassFor(undefined)).toBe(SpRoom);
    expect(roomClassFor('')).toBe(SpRoom);
    expect(roomClassFor('sphost')).toBe(SpRoom);
    expect(roomClassFor('anything-else')).toBe(SpRoom);
  });

  it('selects the legacy toy sim only when explicitly requested', () => {
    expect(roomClassFor('toy')).toBe(Room);
    expect(roomClassFor('legacy')).toBe(Room);
  });
});
