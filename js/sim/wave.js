// js/sim/wave.js — wave pacing, scaling, and the run-over/restart flow.
//
// State machine on `world.waveState`:
//   intermission → (timer) → active → (budget spawned + all enemies dead) →
//   intermission … ; any state → gameover when every ship is downed → (timer)
//   → restart → intermission.
//
// Only runs while at least one ship is present. Enemy budget and HP scale with
// the wave number and player count.

import { spawnEnemy } from './world.js';
import { EV, emit } from './events.js';
import {
  ENEMY_MAX_COUNT, ENEMY_CHASER_HP,
  WAVE_INTERMISSION, WAVE_SPAWN_PACING, GAMEOVER_DELAY,
  WAVE_BASE_COUNT, WAVE_PER_WAVE, WAVE_HP_PER_3_WAVES,
} from './constants.js';

function anyShipAlive(world) {
  for (const [, s] of world.ships) if (s.alive) return true;
  return false;
}

function edgePoint(world) {
  const edge = world.rng.int(0, 3);
  if (edge === 0) return { x: world.rng.range(0, world.width), y: 0 };
  if (edge === 1) return { x: world.rng.range(0, world.width), y: world.height };
  if (edge === 2) return { x: 0, y: world.rng.range(0, world.height) };
  return { x: world.width, y: world.rng.range(0, world.height) };
}

function startWave(world) {
  world.wave += 1;
  const players = Math.max(1, world.ships.size);
  const playerScale = 0.5 + 0.5 * players;
  world.enemiesToSpawn = Math.round((WAVE_BASE_COUNT + world.wave * WAVE_PER_WAVE) * playerScale);
  world.spawnTimer = 1; // first enemy spawns promptly
  world.waveState = 'active';
  emit(world, EV.WAVE_START, { wave: world.wave, count: world.enemiesToSpawn });
}

function spawnWaveEnemy(world) {
  const { x, y } = edgePoint(world);
  const hp = ENEMY_CHASER_HP + Math.floor(world.wave / 3) * WAVE_HP_PER_3_WAVES;
  spawnEnemy(world, x, y, 'chaser', hp);
}

function restartRun(world) {
  world.enemies.clear();
  world.bullets.clear();
  world.drops.clear();
  let i = 0;
  for (const [, s] of world.ships) {
    s.alive = true;
    s.downed = false;
    s.hp = s.maxHp;
    s.reviveProgress = 0;
    s.vx = 0; s.vy = 0;
    s.x = world.width / 2 + (i % 2 ? 80 : -80);
    s.y = world.height / 2;
    i += 1;
  }
  world.wave = 0;
  world.waveState = 'intermission';
  world.waveTimer = WAVE_INTERMISSION;
  emit(world, EV.RUN_RESTART, {});
}

export function updateWaves(world) {
  if (world.ships.size === 0) return; // no game without players

  // Team-wipe → game over (once).
  if (world.waveState !== 'gameover' && !anyShipAlive(world)) {
    world.waveState = 'gameover';
    world.waveTimer = GAMEOVER_DELAY;
    emit(world, EV.GAME_OVER, { wave: world.wave });
    return;
  }

  switch (world.waveState) {
    case 'gameover':
      if (--world.waveTimer <= 0) restartRun(world);
      return;

    case 'intermission':
      if (--world.waveTimer <= 0) startWave(world);
      return;

    case 'active':
      if (world.enemiesToSpawn > 0 && world.enemies.size < ENEMY_MAX_COUNT) {
        if (--world.spawnTimer <= 0) {
          spawnWaveEnemy(world);
          world.enemiesToSpawn -= 1;
          world.spawnTimer = WAVE_SPAWN_PACING;
        }
      }
      if (world.enemiesToSpawn === 0 && world.enemies.size === 0) {
        emit(world, EV.WAVE_CLEAR, { wave: world.wave });
        world.waveState = 'intermission';
        world.waveTimer = WAVE_INTERMISSION;
      }
      return;

    default:
      return;
  }
}
