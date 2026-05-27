// js/mp/mp-main.js — MP client bootstrap + render loop.
//
// Flow: connect → Hello → Welcome (spawn predictor) → run a fixed-timestep loop
// that predicts the local ship, streams inputs to the server, interpolates
// remote ships from snapshots, and reconciles the local ship against the
// authoritative state in each snapshot.

import { WebSocketClientTransport } from './net/websocket-transport.js';
import { Predictor } from './netcode/predictor.js';
import { Interpolator } from './netcode/interpolator.js';
import { MpInput } from './mp-input.js';
import { render } from './mp-renderer.js';
import { WIRE_VERSION, C2S, S2C, WS_PATH, DEFAULT_PORT } from '../sim/protocol.js';
import { TICK_MS, FIELD_WIDTH, FIELD_HEIGHT } from '../sim/constants.js';
import { EV } from '../sim/events.js';

function resolveServerUrl() {
  const q = new URLSearchParams(location.search);
  const override = q.get('server'); // e.g. ?server=localhost:8091 or ?server=wss://host/mp/ws
  if (override) {
    if (override.startsWith('ws://') || override.startsWith('wss://')) return override;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${override}${WS_PATH}`;
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.hostname || 'localhost';
  return `${proto}//${host}:${DEFAULT_PORT}${WS_PATH}`;
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

async function main() {
  const canvas = document.getElementById('game');
  canvas.width = FIELD_WIDTH;
  canvas.height = FIELD_HEIGHT;
  const ctx = canvas.getContext('2d');
  const input = new MpInput(canvas);

  const transport = new WebSocketClientTransport();
  const interp = new Interpolator();
  let predictor = null;
  let playerId = null;
  let roster = [];
  let lastSnapshotTick = 0;
  let lastRemote = new Map();
  let lastAsteroids = new Map();
  let latestBullets = [];
  const effects = []; // ephemeral client-side juice: { x, y, r, born }

  // Debug/test hook: lets QA specs (and the console) inspect live client state
  // without coupling tests to internal module structure.
  window.__mp = {
    playerId: () => playerId,
    roster: () => roster.slice(),
    tick: () => lastSnapshotTick,
    connected: () => predictor != null,
    localShip: () => (predictor ? { x: predictor.ship.x, y: predictor.ship.y, angle: predictor.ship.angle } : null),
    remoteShips: () => [...lastRemote.entries()].map(([id, s]) => ({ id, x: s.x, y: s.y })),
    asteroidCount: () => lastAsteroids.size,
    bulletCount: () => latestBullets.length,
  };

  transport.onMessage((msg) => {
    switch (msg.t) {
      case S2C.WELCOME:
        playerId = msg.playerId;
        roster = msg.roster || [playerId];
        predictor = new Predictor(playerId, msg.spawnX, msg.spawnY, FIELD_WIDTH, FIELD_HEIGHT);
        setStatus(`connected — you are P${playerId}`);
        break;
      case S2C.SNAPSHOT: {
        lastSnapshotTick = msg.tick;
        latestBullets = msg.bullets || [];
        interp.add(msg);
        if (predictor) {
          const me = msg.ships.find((s) => s.id === playerId);
          if (me) {
            predictor.reconcile(
              { x: me.x, y: me.y, vx: me.vx, vy: me.vy, angle: me.a },
              me.li,
            );
          }
        }
        break;
      }
      case S2C.EVENT:
        for (const p of msg.payloads || []) {
          if (p.type === EV.ASTEROID_DESTROYED) {
            effects.push({ x: p.x, y: p.y, r: p.r || 30, born: performance.now() });
          }
        }
        break;
      case S2C.PEER_JOINED:
      case S2C.PEER_LEFT:
        roster = msg.roster || roster;
        break;
      case S2C.ERROR:
        setStatus(`server error: ${msg.code} — ${msg.message}`);
        break;
      default:
        break;
    }
  });
  transport.onClose(() => setStatus('disconnected'));
  transport.onError(() => setStatus('connection error'));

  const url = resolveServerUrl();
  setStatus(`connecting to ${url} …`);
  try {
    await transport.connect(url);
  } catch {
    setStatus(`could not connect to ${url} — is the server running? (cd server && npm start)`);
    return;
  }
  transport.send({ t: C2S.HELLO, wireVersion: WIRE_VERSION, name: 'pilot' });

  // Fixed-timestep loop: predict + send input at the sim rate, render at rAF.
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += now - last;
    last = now;
    // Guard against spiral-of-death after a tab stall.
    if (acc > 250) acc = 250;

    while (acc >= TICK_MS && predictor) {
      const inp = input.snapshot();
      const clientTick = predictor.step(inp);
      transport.sendInput({ t: C2S.INPUT, ...inp, clientTick });
      acc -= TICK_MS;
    }

    const remote = interp.sample(now, playerId);
    const asteroids = interp.sampleAsteroids(now);
    lastRemote = remote;
    lastAsteroids = asteroids;
    // Age out finished destruction rings (~500 ms lifetime).
    for (let i = effects.length - 1; i >= 0; i--) {
      if (now - effects[i].born > 500) effects.splice(i, 1);
    }
    render(ctx, canvas, {
      localShip: predictor ? predictor.ship : null,
      remoteShips: remote,
      asteroids,
      bullets: latestBullets,
      effects,
      now,
      localId: playerId,
    });

    // Lightweight HUD line.
    const hud = document.getElementById('hud');
    if (hud) hud.textContent = `tick ${lastSnapshotTick} · players ${roster.length} [${roster.join(',')}]`;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
