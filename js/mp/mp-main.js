// js/mp/mp-main.js — MP client bootstrap + render loop.
//
// Flow: connect → Hello → Welcome (spawn predictor) → run a fixed-timestep loop
// that predicts the local ship, streams inputs to the server, interpolates
// remote ships from snapshots, and reconciles the local ship against the
// authoritative state in each snapshot.

import { WebSocketClientTransport } from './net/websocket-transport.js';
import { WebTransportClientTransport } from './net/webtransport-transport.js';
import { Predictor } from './netcode/predictor.js';
import { Interpolator } from './netcode/interpolator.js';
import { MpInput } from './mp-input.js';
import { SnapshotStream } from './netcode/snapshot-stream.js';
import { RenderBridge } from './render-bridge.js';
import { WIRE_VERSION, C2S, S2C, WS_PATH, DEFAULT_PORT } from '../sim/protocol.js';
import { TICK_MS, FIELD_WIDTH, FIELD_HEIGHT, SHIP_RADIUS } from '../sim/constants.js';
import { EV } from '../sim/events.js';
import { AudioManager } from '../modules/audio/audio-manager.js';

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

function resolveRoomCode() {
  const q = new URLSearchParams(location.search);
  const fromUrl = q.get('room');
  if (fromUrl != null) return fromUrl.trim();
  const input = document.getElementById('room');
  return input ? input.value.trim() : '';
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

async function main() {
  const canvas = document.getElementById('game');

  // The canvas HUD draws with SP's 'Press Start 2P' pixel font; a webfont isn't
  // fetched until something uses it, and ctx.font alone doesn't trigger a load —
  // so kick the fetch here. Until it resolves the HUD falls back to monospace.
  if (document.fonts && document.fonts.load) {
    document.fonts.load("12px 'Press Start 2P'").catch(() => {});
  }

  // Camera follows the local ship (SP framing: the arena is larger than the
  // viewport, the player stays centered, the camera is clamped to the field).
  // zoom>1 keeps the framing tight on large monitors so the action reads
  // "zoomed in on the player" the way SP does on a smaller window.
  const camera = { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, zoom: 1 };
  let cameraInit = false; // first valid follow target snaps; afterwards it eases
  const VIEW_TARGET_W = 1366;  // cap visible world width → guaranteed zoom-in
  const MAX_ZOOM = 2.2;
  function resize() {
    canvas.width = Math.max(640, window.innerWidth);
    canvas.height = Math.max(360, window.innerHeight);
  }
  resize();
  window.addEventListener('resize', resize);
  function updateCamera(tx, ty) {
    const cw = canvas.width, ch = canvas.height;
    const zoom = Math.max(1, Math.min(MAX_ZOOM, cw / VIEW_TARGET_W));
    camera.zoom = zoom;
    const visW = cw / zoom, visH = ch / zoom;
    // Center the player; clamp so the visible window stays inside the field
    // (and center the field on any axis where it's smaller than the window).
    let cx = tx - cw / 2;
    let cy = ty - ch / 2;
    const minX = (visW - cw) / 2, maxX = FIELD_WIDTH - (cw + visW) / 2;
    const minY = (visH - ch) / 2, maxY = FIELD_HEIGHT - (ch + visH) / 2;
    cx = maxX < minX ? (FIELD_WIDTH - cw) / 2 : Math.max(minX, Math.min(maxX, cx));
    cy = maxY < minY ? (FIELD_HEIGHT - ch) / 2 : Math.max(minY, Math.min(maxY, cy));
    if (!cameraInit) { camera.x = cx; camera.y = cy; cameraInit = true; }
    else { camera.x += (cx - camera.x) * 0.18; camera.y += (cy - camera.y) * 0.18; }
  }

  const input = new MpInput(canvas, camera);
  // Seams: snapshot reconstruction + render backend (see their modules).
  const snapStream = new SnapshotStream();
  const bridge = new RenderBridge(canvas);

  // SP audio (shared audio-manager). init() loads SFX asynchronously; playSound
  // is a guarded no-op until loaded, so calling it on events is always safe.
  // The AudioContext starts suspended — resume on the first user gesture per
  // browser autoplay policy.
  const audio = new AudioManager();
  audio.init().catch(() => {});
  const warmAudio = () => {
    try { audio.initializeAudio(); } catch { /* ignore */ }
    window.removeEventListener('pointerdown', warmAudio);
    window.removeEventListener('keydown', warmAudio);
  };
  window.addEventListener('pointerdown', warmAudio);
  window.addEventListener('keydown', warmAudio);

  // Room-code field: pre-fill from ?room=, and on Enter reload into that room
  // (a full reload is the simplest, reliable "switch rooms" — no reconnect
  // bookkeeping). The actual join code is read by resolveRoomCode() at connect.
  const roomInput = document.getElementById('room');
  if (roomInput) {
    roomInput.value = new URLSearchParams(location.search).get('room') || '';
    roomInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const params = new URLSearchParams(location.search);
      const code = roomInput.value.trim();
      if (code) params.set('room', code); else params.delete('room');
      location.search = params.toString();
    });
  }

  let transport = null;
  let reconnectTimer = null;
  const interp = new Interpolator();
  let predictor = null;
  let playerId = null;
  let roster = [];
  let lastSnapshotTick = 0;
  let lastRemote = new Map();
  let lastAsteroids = new Map();
  let lastEnemies = new Map();
  let latestBullets = [];
  let localHp = null;
  let localMaxHp = null;
  let localDowned = false;
  let localReviveProgress = 0;
  let localGold = 0;
  let localLevel = 1;       // account/run level (HUD XP bar + readout)
  let localXp = 0;          // XP banked toward the next level
  let localEnergy = 0;      // power-weapon energy (energy sphere)
  let localMaxEnergy = 100;
  let localTanks = 0;       // spare health tanks (triforce)
  let lastDrops = new Map();
  let wave = 0;
  let waveState = 'intermission';
  let banner = null; // { text, born }
  const effects = []; // ephemeral client-side juice: { x, y, r, born }

  // Client-authored explosion particles, re-derived from the server's semantic
  // event stream (the sim never sends particles — it sends deaths/downs, and the
  // client bursts shrapnel + embers, SP-style). Canvas2D + additive blending to
  // match the mp-renderer pipeline. Velocity is px/ms; life is ms.
  const particles = [];
  function spawnBurst(x, y, baseR = 24, big = false) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const n = (big ? 18 : 11) + Math.floor(Math.random() * 7);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const ember = Math.random() < 0.35;
      const spd = (ember ? 0.04 : 0.09) + Math.random() * (ember ? 0.12 : 0.26);
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        born: performance.now(),
        life: ember ? 520 + Math.random() * 340 : 240 + Math.random() * 240,
        size: (ember ? 2.4 : 1.3) + Math.random() * (ember ? 1.8 : 1.4) + baseR * 0.012,
        hue: ember ? 28 + Math.random() * 16 : 16 + Math.random() * 34,
      });
    }
  }

  // Engine thrust trail: a moving ship sheds cyan exhaust out its rear (SP's
  // engine is particle-based, so this reuses the same particle layer). Velocity
  // is in px/tick; below ~0.6 the ship is effectively coasting → no plume.
  function emitThrust(x, y, angle, vx, vy) {
    const speed = Math.hypot(vx || 0, vy || 0);
    if (speed < 0.6 || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const rear = angle + Math.PI;
    const rx = x + Math.cos(rear) * SHIP_RADIUS * 0.6;
    const ry = y + Math.sin(rear) * SHIP_RADIUS * 0.6;
    const count = speed > 2.4 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const dir = rear + (Math.random() - 0.5) * 0.6;
      const ps = 0.05 + Math.random() * 0.1;
      particles.push({
        x: rx, y: ry,
        vx: Math.cos(dir) * ps + vx * 0.01,
        vy: Math.sin(dir) * ps + vy * 0.01,
        born: performance.now(),
        life: 150 + Math.random() * 150,
        size: 1.0 + Math.random() * 1.1,
        hue: 190 + Math.random() * 22, // cyan-blue engine glow
      });
    }
  }

  // ── Camera-feel + impact juice (client-side, SP-style) ─────────────────────
  // The sim is authoritative and can't be frozen, so these are render-only:
  // screen SHAKE (random offset), camera KICK (directional impulse away from a
  // nearby blast), and two full-screen FLASH channels (white for big events, red
  // damage vignette when the local ship takes a hit). All decay toward 0.
  let shakeMag = 0;
  let kickX = 0, kickY = 0;
  let flashWhite = 0; // 0..1
  let flashRed = 0;   // 0..1
  const prevEnemyHp = new Map(); // id → last-seen hp, for positioned hit sparks

  // Floating feedback (SP-style): world-space damage numbers + gold "+N" popups
  // that drift up and fade, plus a screen-space LEVEL UP! announce. All derived
  // from snapshot diffs (the event stream carries no amounts).
  const worldFloaters = []; // { x, y, vx, vy, text, color, size, born, life }
  let levelText = null;     // { text, born }
  let bossCard = null;      // { name, born } — cinematic name-card when a boss appears
  const enemyHitFlash = new Map(); // enemy id → expire time (white hit flash)

  function addShake(mag) { if (mag > shakeMag) shakeMag = Math.min(34, mag); }
  // Blast feedback scaled by radius + proximity to the local ship (distant
  // explosions shouldn't rock the camera). Adds a kick pushing AWAY from it.
  function blastFeedback(x, y, r = 24) {
    const s = predictor && predictor.ship;
    if (!s) return;
    const dx = s.x - x, dy = s.y - y;
    const dist = Math.hypot(dx, dy);
    const prox = Math.max(0, 1 - dist / 640);
    if (prox <= 0) return;
    addShake((3 + r * 0.16) * prox);
    const len = dist || 1;
    const kmag = (1.4 + r * 0.05) * prox;
    kickX += (dx / len) * kmag;
    kickY += (dy / len) * kmag;
  }

  // Small bright spark burst at an impact point (non-lethal hits). Reuses the
  // particle layer with a short life + hot hue so it reads as a strike spark.
  function spawnSpark(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.12 + Math.random() * 0.22;
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        born: performance.now(),
        life: 120 + Math.random() * 120,
        size: 0.9 + Math.random() * 1.2,
        hue: 48 + Math.random() * 14, // hot yellow-white spark
      });
    }
  }

  // Muzzle flash at the local ship's nose when a shot leaves the barrel.
  function spawnMuzzle() {
    const s = predictor && predictor.ship;
    if (!s) return;
    const nx = s.x + Math.cos(s.angle) * SHIP_RADIUS * 1.1;
    const ny = s.y + Math.sin(s.angle) * SHIP_RADIUS * 1.1;
    for (let i = 0; i < 3; i++) {
      const dir = s.angle + (Math.random() - 0.5) * 0.8;
      const ps = 0.06 + Math.random() * 0.12;
      particles.push({
        x: nx, y: ny,
        vx: Math.cos(dir) * ps, vy: Math.sin(dir) * ps,
        born: performance.now(),
        life: 70 + Math.random() * 60,
        size: 1.1 + Math.random() * 1.0,
        hue: 190 + Math.random() * 30, // cyan muzzle bloom
      });
    }
  }

  // Floating "-N" damage number at a hit (world space, drifts up + fades).
  function spawnDamageNumber(x, y, amount) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || amount <= 0) return;
    worldFloaters.push({
      x: x + (Math.random() - 0.5) * 10, y: y - 6,
      vx: (Math.random() - 0.5) * 0.012, vy: -0.045,
      text: `${Math.round(amount)}`,
      color: '#ffd0d0', size: 15,
      born: performance.now(), life: 720,
    });
    if (worldFloaters.length > 80) worldFloaters.splice(0, worldFloaters.length - 80);
  }
  // Floating "+N" gold popup over the local ship (world space).
  function spawnGoldPopup(amount) {
    const s = predictor && predictor.ship;
    if (!s || amount <= 0) return;
    worldFloaters.push({
      x: s.x + (Math.random() - 0.5) * 18, y: s.y - SHIP_RADIUS - 14,
      vx: (Math.random() - 0.5) * 0.02, vy: -0.06,
      text: `+${Math.round(amount)}`,
      color: '#FFD700', size: amount >= 50 ? 20 : 16,
      born: performance.now(), life: 1100,
    });
    if (worldFloaters.length > 80) worldFloaters.splice(0, worldFloaters.length - 80);
  }

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
    enemyCount: () => lastEnemies.size,
    enemyTypes: () => [...new Set([...lastEnemies.values()].map((e) => e.type))],
    bossCount: () => [...lastEnemies.values()].filter((e) => e.boss).length,
    bossPartCount: () => [...lastEnemies.values()].reduce((n, e) => n + (e.parts ? e.parts.length : 0), 0),
    particleCount: () => particles.length,
    bulletCount: () => latestBullets.length,
    dropCount: () => lastDrops.size,
    localHp: () => localHp,
    localGold: () => localGold,
    localLevel: () => localLevel,
    localEnergy: () => localEnergy,
    localMaxEnergy: () => localMaxEnergy,
    localTanks: () => localTanks,
    wave: () => wave,
    waveState: () => waveState,
  };

  function handleMessage(msg) {
    switch (msg.t) {
      case S2C.WELCOME:
        playerId = msg.playerId;
        roster = msg.roster || [playerId];
        predictor = new Predictor(playerId, msg.spawnX, msg.spawnY, FIELD_WIDTH, FIELD_HEIGHT);
        setStatus(`connected — P${playerId} · room "${msg.room || 'public'}"`);
        break;
      case S2C.SNAPSHOT: {
        const full = snapStream.ingest(msg);
        if (!full) break; // delta before a keyframe — wait for the next keyframe
        lastSnapshotTick = full.tick;
        latestBullets = full.bullets || [];
        if (typeof full.wave === 'number') wave = full.wave;
        if (full.ws) waveState = full.ws;
        interp.add(full);
        // Positioned hit sparks: any enemy whose HP dropped since the last
        // snapshot took a hit → strike spark at its position (the hit events
        // carry no coords, but the snapshot HP does).
        if (full.enemies) {
          for (const e of full.enemies) {
            const prev = prevEnemyHp.get(e.id);
            // A boss appearing for the first time → cinematic name-card.
            if (prev == null && e.b > 0) bossCard = { name: e.ty || 'BOSS', born: performance.now() };
            if (prev != null && e.hp < prev - 0.01) {
              spawnSpark(e.x, e.y);
              spawnDamageNumber(e.x, e.y, prev - e.hp);
              enemyHitFlash.set(e.id, performance.now() + 100); // brief white flash
            }
            prevEnemyHp.set(e.id, e.hp);
          }
          if (prevEnemyHp.size > full.enemies.length + 64) {
            const live = new Set(full.enemies.map((e) => e.id));
            for (const id of prevEnemyHp.keys()) if (!live.has(id)) prevEnemyHp.delete(id);
            for (const id of enemyHitFlash.keys()) if (!live.has(id)) enemyHitFlash.delete(id);
          }
        }
        if (predictor) {
          const me = full.ships.find((s) => s.id === playerId);
          if (me) {
            // Local damage feedback: HP fell → red vignette + a small shake.
            if (localHp != null && me.hp < localHp - 0.5) {
              flashRed = Math.min(1, flashRed + 0.55);
              addShake(7);
            }
            localHp = me.hp;
            localMaxHp = me.mhp;
            localDowned = !!me.dn;
            localReviveProgress = me.rp || 0;
            // Gold gain → "+N" popup over the ship (skip the first snapshot so a
            // join with banked gold doesn't fire a phantom popup).
            const newGold = me.g || 0;
            if (localGold > 0 && newGold > localGold) spawnGoldPopup(newGold - localGold);
            localGold = newGold;
            // Level up → centered announce.
            if (me.lv != null) {
              if (me.lv > localLevel) levelText = { text: `LEVEL ${me.lv}`, born: performance.now() };
              localLevel = me.lv;
            }
            if (me.xp != null) localXp = me.xp;
            if (me.e != null) localEnergy = me.e;
            if (me.me != null) localMaxEnergy = me.me;
            if (me.tk != null) localTanks = me.tk;
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
          switch (p.type) {
            case EV.ASTEROID_DESTROYED:
            case EV.ENEMY_DEATH:
              effects.push({ x: p.x, y: p.y, r: p.r || 24, born: performance.now() });
              spawnBurst(p.x, p.y, p.r || 24, false);
              blastFeedback(p.x, p.y, p.r || 24); // shake + kick by size/proximity
              audio.playExplosion();
              break;
            case EV.ASTEROID_HIT:
            case EV.ENEMY_HIT:
            case EV.SHIP_HIT:
              audio.playHit();
              break;
            case EV.BULLET_SPAWN:
              spawnMuzzle(); // nose bloom at the local ship
              audio.playShoot();
              break;
            case EV.SHIP_DOWNED:
              spawnBurst(p.x, p.y, 40, true); // bigger burst for a ship going down
              blastFeedback(p.x, p.y, 60);
              addShake(22);
              flashWhite = Math.max(flashWhite, 0.5);
              audio.playPlayerExplosion();
              break;
            case EV.SHIP_REVIVED:
              audio.playPowerup();
              break;
            case EV.DROP_COLLECTED:
              if (p.kind === 'gold') audio.playCoin(); else audio.playPowerup();
              break;
            case EV.WAVE_START:
              banner = { text: `WAVE ${p.wave}`, born: performance.now() };
              break;
            case EV.WAVE_CLEAR:
              banner = { text: `WAVE ${p.wave} CLEAR`, born: performance.now() };
              break;
            case EV.GAME_OVER:
              banner = { text: 'GAME OVER', born: performance.now() };
              break;
            case EV.RUN_RESTART:
              banner = { text: 'NEW RUN', born: performance.now() };
              break;
            default:
              break;
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
  }

  // Transport selection: WebSocket today. WebTransport is tried only when
  // explicitly requested (?transport=webtransport) and available; the WT
  // transport is a deferred Phase-8 placeholder, so connect() falls back to
  // WebSocket if it isn't implemented.
  function makeTransport(preferWt) {
    if (preferWt && typeof window.WebTransport !== 'undefined') {
      return new WebTransportClientTransport();
    }
    return new WebSocketClientTransport();
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 2000);
  }

  function wire(t) {
    t.onMessage(handleMessage);
    t.onError(() => {});
    t.onClose(() => {
      predictor = null; // drop prediction; rebuilt on the next Welcome
      setStatus('disconnected — reconnecting…');
      scheduleReconnect();
    });
  }

  async function connect() {
    const url = resolveServerUrl();
    const preferWt = new URLSearchParams(location.search).get('transport') === 'webtransport';

    transport = makeTransport(preferWt);
    wire(transport);
    setStatus(`connecting to ${url} …`);
    try {
      await transport.connect(url);
    } catch {
      // WebTransport requested but unavailable → fall back to WebSocket once.
      if (preferWt) {
        transport = new WebSocketClientTransport();
        wire(transport);
        try {
          await transport.connect(url);
        } catch {
          setStatus(`can't reach ${url} — retrying… (start it: cd server && npm start)`);
          scheduleReconnect();
          return;
        }
      } else {
        setStatus(`can't reach ${url} — retrying… (start it: cd server && npm start)`);
        scheduleReconnect();
        return;
      }
    }
    transport.send({ t: C2S.HELLO, wireVersion: WIRE_VERSION, name: 'pilot', room: resolveRoomCode() });
  }

  connect();

  // Fixed-timestep loop: predict + send input at the sim rate, render at rAF.
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dtMs = Math.min(50, now - last); // per-frame delta (clamped for tab stalls)
    acc += now - last;
    last = now;
    // Guard against spiral-of-death after a tab stall.
    if (acc > 250) acc = 250;

    while (acc >= TICK_MS && predictor) {
      // While downed, the server holds the ship still; feed neutral input so
      // local prediction matches (no jittery snap-back on reconcile).
      const inp = localDowned
        ? { up: false, down: false, left: false, right: false, fire: false, aimX: null, aimY: null }
        : input.snapshot();
      const clientTick = predictor.step(inp);
      if (transport && transport.isOpen) transport.sendInput({ t: C2S.INPUT, ...inp, clientTick });
      acc -= TICK_MS;
    }

    const remote = interp.sample(now, playerId);
    const asteroids = interp.sampleAsteroids(now);
    const enemies = interp.sampleEnemies(now);
    const drops = interp.sampleDrops(now);
    const bullets = interp.sampleBullets(now); // smooth + trail-able (was raw snapshot points)
    lastRemote = remote;
    lastAsteroids = asteroids;
    lastEnemies = enemies;
    lastDrops = drops;
    // Engine trails for moving ships (local predicted + remote interpolated).
    if (predictor && !localDowned) {
      const s = predictor.ship;
      emitThrust(s.x, s.y, s.angle, s.vx, s.vy);
    }
    for (const [, s] of remote) {
      if (!s.downed) emitThrust(s.x, s.y, s.angle, s.vx, s.vy);
    }
    // Age out finished destruction rings (~500 ms lifetime).
    for (let i = effects.length - 1; i >= 0; i--) {
      if (now - effects[i].born > 500) effects.splice(i, 1);
    }
    // Advance + cull explosion particles (drag-decayed; time-based fade).
    const drag = Math.pow(0.9, dtMs / 16.67);
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      if (now - pt.born >= pt.life) { particles.splice(i, 1); continue; }
      pt.x += pt.vx * dtMs;
      pt.y += pt.vy * dtMs;
      pt.vx *= drag;
      pt.vy *= drag;
    }
    // Banner fades after ~2.5 s.
    if (banner && now - banner.born > 2500) banner = null;
    // Level-up announce fades after ~1.8 s.
    if (levelText && now - levelText.born > 1800) levelText = null;
    // Boss name-card fades after ~2.8 s.
    if (bossCard && now - bossCard.born > 2800) bossCard = null;
    // Advance + cull floating feedback (damage numbers / gold popups).
    for (let i = worldFloaters.length - 1; i >= 0; i--) {
      const fl = worldFloaters[i];
      if (now - fl.born >= fl.life) { worldFloaters.splice(i, 1); continue; }
      fl.x += fl.vx * dtMs;
      fl.y += fl.vy * dtMs;
      fl.vy += 0.00012 * dtMs; // gentle gravity → arc
    }

    // Camera tracks the local predicted ship (falls back to arena center until
    // we have a ship — e.g. while connecting or fully downed).
    if (predictor) updateCamera(predictor.ship.x, predictor.ship.y);

    // Decay the camera-feel FX (frame-rate independent) and roll a fresh shake
    // offset. Shake + kick are passed to the renderer as a render-only camera
    // nudge (kept out of camera.{x,y} so aim mapping stays steady).
    shakeMag *= Math.pow(0.86, dtMs / 16.67); if (shakeMag < 0.15) shakeMag = 0;
    const kd = Math.pow(0.88, dtMs / 16.67);
    kickX *= kd; kickY *= kd;
    if (Math.abs(kickX) < 0.05) kickX = 0;
    if (Math.abs(kickY) < 0.05) kickY = 0;
    flashWhite *= Math.pow(0.88, dtMs / 16.67); if (flashWhite < 0.01) flashWhite = 0;
    flashRed *= Math.pow(0.90, dtMs / 16.67); if (flashRed < 0.01) flashRed = 0;
    const fx = {
      shakeX: (Math.random() * 2 - 1) * shakeMag + kickX,
      shakeY: (Math.random() * 2 - 1) * shakeMag + kickY,
      flashWhite,
      flashRed,
    };

    bridge.present({
      localShip: predictor ? predictor.ship : null,
      remoteShips: remote,
      asteroids,
      enemies,
      drops,
      bullets,
      effects,
      particles,
      now,
      localId: playerId,
      localDowned,
      localReviveProgress,
      localHp,
      localMaxHp,
      localLevel,
      localXp,
      localEnergy,
      localMaxEnergy,
      localTanks,
      wave,
      gold: localGold,
      players: roster.length,
      banner,
      camera,
      fx,
      worldFloaters,
      levelText,
      bossCard,
      enemyHitFlash,
    });

    // Lightweight HUD line.
    const hud = document.getElementById('hud');
    if (hud) {
      const hp = localHp != null ? `· hp ${Math.ceil(localHp)}${localDowned ? ' DOWNED' : ''} ` : '';
      hud.textContent = `wave ${wave} (${waveState}) · players ${roster.length} ${hp}· gold ${localGold} · enemies ${enemies.size}`;
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
