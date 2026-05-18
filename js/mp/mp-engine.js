// MP engine.
//
// Phase-2 client driver: constructs a WASM `World` for local-ship
// prediction, opens a WebSocket to the rainboids-server (unless
// `?solo=1` is set), uploads input at 30 Hz, and renders remote
// ships interpolated ~100ms behind server time off snapshot tracks.
//
// Local prediction never stops. Snapshots feed per-player interp
// tracks (a small ring of recent `{t_ms, x, y, vx, vy, angle}`
// samples). Our own player_id is filtered out of incoming snapshots
// — the local World drives our ship visually.
//
// Out of scope for Phase 2:
//   - prediction reconciliation (Phase 4)
//   - reconnect / ping / timeout (Phase 5)
//   - HUD beyond the debug overlay
// See docs/Multiplayer WASM Pivot Phase 2 – 2026-05-17.md.

import * as mpInput from "./mp-input.js";
import { render } from "./mp-renderer.js";
import { connect as wsConnect } from "./mp-ws.js";
import { VERSION_MP } from "../modules/core/version.js";

const DT_CLAMP_MAX = 0.1;         // 100ms per tick max (anti-tab-hide spike)
const DEBUG_UPDATE_EVERY = 10;    // overlay refresh cadence in frames
const FPS_WINDOW = 30;            // rolling sample window for FPS estimate
const INPUT_SEND_INTERVAL_MS = 33; // ~30 Hz input upload throttle
const INTERP_DELAY_MS = 100;      // render remote ships 100ms behind realtime
const INTERP_SAMPLE_CAP = 6;      // ~300ms of history at 20Hz snapshot rate

/** Shortest-path angle interp; handles wrap-around at ±PI. */
function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
}

/**
 * Sample an interp track at `renderT` (ms). Returns either a brand-new
 * lerped pose object or one of the boundary samples (clamped). null
 * iff the track is empty.
 */
function sampleTrack(track, renderT) {
    const s = track.samples;
    if (s.length === 0) return null;
    if (s.length === 1 || renderT <= s[0].t_ms) return s[0];
    if (renderT >= s[s.length - 1].t_ms) return s[s.length - 1];
    for (let i = 0; i < s.length - 1; i++) {
        const a = s[i];
        const b = s[i + 1];
        if (renderT >= a.t_ms && renderT <= b.t_ms) {
            const span = b.t_ms - a.t_ms;
            const u = span > 0 ? (renderT - a.t_ms) / span : 0;
            return {
                x: a.x + (b.x - a.x) * u,
                y: a.y + (b.y - a.y) * u,
                vx: a.vx + (b.vx - a.vx) * u,
                vy: a.vy + (b.vy - a.vy) * u,
                angle: lerpAngle(a.angle, b.angle, u),
            };
        }
    }
    return s[s.length - 1];
}

function isSoloMode() {
    try {
        const q = new URLSearchParams(window.location.search);
        return q.get("solo") === "1";
    } catch {
        return false;
    }
}

export function start(World, debugEl, canvas, { name = "Pilot" } = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        if (debugEl) debugEl.textContent = "mp-engine: 2D context unavailable";
        return;
    }

    mpInput.init(canvas);

    const world = World.new();

    // Cache field size once; Phase 2 still uses a fixed-size world.
    const fieldW = world.field_width();
    const fieldH = world.field_height();

    let lastTime = performance.now();
    let frameCount = 0;
    let tickCount = 0;
    const frameDurations = [];

    // Aim memo for renderer (paint crosshair at the same world point
    // we fed into the sim this frame).
    const lastAim = { x: fieldW * 0.5, y: fieldH * 0.5 };

    // ── Network state ──────────────────────────────────────────────
    const solo = isSoloMode();
    let wsConnected = false;
    let wsState = solo ? "solo" : "connecting";
    let ws = null;

    let localPlayerId = null;
    let clientTick = 0;
    let lastInputSentAt = 0;
    let lastSnapshotTick = null;

    /** Map<player_id, { samples: Array<{t_ms,x,y,vx,vy,angle}> }> */
    const remoteShips = new Map();

    // ── WS wiring ──────────────────────────────────────────────────
    if (!solo) {
        ws = wsConnect({
            name,
            onWelcome(msg) {
                localPlayerId = msg.player_id;
                wsConnected = true;
                wsState = "open";
                // The WASM `World` API does not expose a position setter,
                // so we cannot teleport our local ship to (spawn_x,
                // spawn_y). Phase 2 accepts the cosmetic mismatch — once
                // the player starts moving, local prediction proceeds
                // from the WASM default spawn. Phase 4 reconciliation
                // will pin our ship to the server view anyway. Log so a
                // dev opening the page knows what they're seeing.
                console.warn(
                    `[mp-engine] welcome pid=${msg.player_id} spawn=(${msg.spawn_x.toFixed(1)}, ${msg.spawn_y.toFixed(1)}) — local World has no position setter; ignoring spawn coords`,
                );
            },
            onSnapshot(msg) {
                lastSnapshotTick = msg.tick;
                const now = performance.now();
                for (const ship of msg.ships) {
                    if (localPlayerId !== null && ship.player_id === localPlayerId) {
                        continue;
                    }
                    let track = remoteShips.get(ship.player_id);
                    if (!track) {
                        track = { samples: [] };
                        remoteShips.set(ship.player_id, track);
                    }
                    track.samples.push({
                        t_ms: now,
                        x: ship.x,
                        y: ship.y,
                        vx: ship.vx,
                        vy: ship.vy,
                        angle: ship.angle,
                    });
                    while (track.samples.length > INTERP_SAMPLE_CAP) {
                        track.samples.shift();
                    }
                }
            },
            onPeerJoined(msg) {
                console.log(`[mp-engine] peer joined pid=${msg.player_id}`);
            },
            onPeerLeft(msg) {
                console.log(`[mp-engine] peer left pid=${msg.player_id}`);
                remoteShips.delete(msg.player_id);
            },
            onError(msg) {
                console.error(`[mp-engine] server error ${msg.code}: ${msg.message}`);
                wsState = `error:${msg.code}`;
            },
            onClose() {
                wsConnected = false;
                wsState = "closed";
                // Loop keeps running in solo mode (local prediction
                // continues, no remote ships). No reconnect in Phase 2.
            },
        });
    }

    // ── RAF loop ───────────────────────────────────────────────────
    const frame = (now) => {
        const rawDt = (now - lastTime) / 1000;
        lastTime = now;
        const dt = Math.max(0, Math.min(rawDt, DT_CLAMP_MAX));

        // FPS sampling.
        frameDurations.push(rawDt);
        if (frameDurations.length > FPS_WINDOW) frameDurations.shift();

        const input = mpInput.getState();

        // Canvas-pixel mouse -> world coords. The renderer letterboxes
        // the 1920x1080 field with Math.min(cw/fw, ch/fh); invert that
        // here so set_input() receives field-space aim.
        const cw = canvas.width;
        const ch = canvas.height;
        const scale = Math.min(cw / fieldW, ch / fieldH);
        const offsetX = (cw - fieldW * scale) * 0.5;
        const offsetY = (ch - fieldH * scale) * 0.5;
        const aimWorldX = scale > 0 ? (input.mouseX - offsetX) / scale : fieldW * 0.5;
        const aimWorldY = scale > 0 ? (input.mouseY - offsetY) / scale : fieldH * 0.5;
        lastAim.x = aimWorldX;
        lastAim.y = aimWorldY;

        // Local prediction — runs every frame regardless of WS state.
        world.set_input(
            !!input.up,
            !!input.down,
            !!input.left,
            !!input.right,
            aimWorldX,
            aimWorldY,
        );
        world.tick(dt);
        tickCount += 1;

        // Throttled input upload (30 Hz).
        if (ws && ws.isOpen() && now - lastInputSentAt >= INPUT_SEND_INTERVAL_MS) {
            ws.sendInput(
                clientTick,
                !!input.up,
                !!input.down,
                !!input.left,
                !!input.right,
                aimWorldX,
                aimWorldY,
            );
            clientTick += 1;
            lastInputSentAt = now;
        }

        // Build interpolated remote-ship array for the renderer.
        const renderT = now - INTERP_DELAY_MS;
        const remoteShipsArray = [];
        for (const [player_id, track] of remoteShips) {
            const pose = sampleTrack(track, renderT);
            if (!pose) continue;
            remoteShipsArray.push({
                player_id,
                x: pose.x,
                y: pose.y,
                vx: pose.vx,
                vy: pose.vy,
                angle: pose.angle,
            });
        }

        render(ctx, canvas, world, lastAim, remoteShipsArray);

        frameCount += 1;
        if (debugEl && frameCount % DEBUG_UPDATE_EVERY === 0) {
            const sx = world.ship_x();
            const sy = world.ship_y();
            const avgFrame = frameDurations.reduce((a, b) => a + b, 0) / Math.max(frameDurations.length, 1);
            const fps = avgFrame > 0 ? (1 / avgFrame) : 0;
            const pidStr = localPlayerId !== null ? String(localPlayerId) : "–";
            const srvTickStr = lastSnapshotTick !== null ? String(lastSnapshotTick) : "–";
            debugEl.textContent =
                `Rainboids MP - Phase 2 (mp ${VERSION_MP})\n` +
                `tick:     ${tickCount}\n` +
                `pos:      ${sx.toFixed(1)}, ${sy.toFixed(1)}\n` +
                `aim:      ${aimWorldX.toFixed(0)}, ${aimWorldY.toFixed(0)}\n` +
                `fps:      ${fps.toFixed(1)}\n` +
                `ws:       ${wsState}\n` +
                `peers:    ${remoteShips.size}\n` +
                `pid:      ${pidStr}\n` +
                `srv tick: ${srvTickStr}`;
        }

        requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
}
