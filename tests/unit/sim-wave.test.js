/**
 * tests/unit/sim-wave.test.js — wave pacing/scaling + team-wipe→restart.
 */

import { describe, it, expect } from '@jest/globals';
import { createWorld, addShip } from '../../js/sim/world.js';
import { updateWaves } from '../../js/sim/wave.js';
import { EV } from '../../js/sim/events.js';

describe('wave lifecycle', () => {
  it('does nothing without players', () => {
    const w = createWorld({ seed: 1 });
    w.waveTimer = 1;
    updateWaves(w);
    expect(w.wave).toBe(0);
    expect(w.waveState).toBe('intermission');
  });

  it('starts wave 1 after the intermission timer elapses', () => {
    const w = createWorld({ seed: 1 });
    addShip(w, 1, 500, 500);
    w.waveTimer = 1;
    w.events.length = 0;
    updateWaves(w);
    expect(w.wave).toBe(1);
    expect(w.waveState).toBe('active');
    expect(w.enemiesToSpawn).toBeGreaterThan(0);
    expect(w.events.some((e) => e.type === EV.WAVE_START && e.wave === 1)).toBe(true);
  });

  it('spawns the budget then clears the wave once enemies are gone', () => {
    const w = createWorld({ seed: 1 });
    addShip(w, 1, 500, 500);
    w.waveState = 'active';
    w.wave = 1;
    w.enemiesToSpawn = 1;
    w.spawnTimer = 1;

    updateWaves(w); // spawns the single budgeted enemy
    expect(w.enemies.size).toBe(1);
    expect(w.enemiesToSpawn).toBe(0);

    // Simulate the enemy dying + being reaped.
    w.enemies.clear();
    w.events.length = 0;
    updateWaves(w);
    expect(w.events.some((e) => e.type === EV.WAVE_CLEAR)).toBe(true);
    expect(w.waveState).toBe('intermission');
  });

  it('scales the enemy budget with player count', () => {
    const solo = createWorld({ seed: 1 }); addShip(solo, 1, 0, 0); solo.waveTimer = 1; updateWaves(solo);
    const duo = createWorld({ seed: 1 }); addShip(duo, 1, 0, 0); addShip(duo, 2, 0, 0); duo.waveTimer = 1; updateWaves(duo);
    expect(duo.enemiesToSpawn).toBeGreaterThan(solo.enemiesToSpawn);
  });
});

describe('run over', () => {
  it('declares game over on team wipe, then restarts after the delay', () => {
    const w = createWorld({ seed: 1 });
    const s = addShip(w, 1, 500, 500);
    s.alive = false; s.downed = true; // wiped

    w.events.length = 0;
    updateWaves(w);
    expect(w.waveState).toBe('gameover');
    expect(w.events.some((e) => e.type === EV.GAME_OVER)).toBe(true);

    w.waveTimer = 1; // fast-forward the restart delay
    w.events.length = 0;
    updateWaves(w);
    expect(w.events.some((e) => e.type === EV.RUN_RESTART)).toBe(true);
    expect(s.alive).toBe(true);
    expect(s.downed).toBe(false);
    expect(s.hp).toBe(s.maxHp);
    expect(w.wave).toBe(0);
    expect(w.waveState).toBe('intermission');
  });
});
