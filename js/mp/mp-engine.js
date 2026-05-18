// MP engine.
//
// Phase-3 client driver. Constructs a WASM `World` configured as a
// deterministic mirror of the server's authoritative sim. The client
// runs the same Rust simulation every tick (ships + enemies +
// asteroids + bullets + collision + revive + cull), kept in sync via:
//
//   - Snapshot   (~20 Hz)  ship positions only — applied to non-local
//                          ships via `world.apply_snapshot_ship(...)`
//   - Event      (per tick) spawns / hits / destroys / split / damage
//                          / downed / revived — consumed in order by
//                          the local World to drive the deterministic
//                          stream
//   - StateChecksum (~1 Hz) four u64 hashes (ships / enemies /
//                          asteroids / bullets). On mismatch the
//                          client sends `ClientMsg::Resync` and
//                          throws away the deterministic state when
//                          the server's Resync reply lands.
//   - Resync     (one-shot) full state + RNG seed; client calls
//                          `world.reset_for_resync(seed, tick)` and
//                          rebuilds entities best-effort from wire.
//
// Local prediction never stops. Our own player_id is filtered out of
// Snapshot.ships — the local World drives our ship visually until
// Phase 4 reconciliation reconciles it against server truth.
//
// Out of scope for Phase 3:
//   - prediction reconciliation (Phase 4)
//   - reconnect / ping / timeout (Phase 5)
//   - tight Resync ingestion for enemies/asteroids/bullets (Phase 5;
//     wire doesn't yet carry rng_subseed on Resync records so we
//     ensure existence + position only and let the next checksum
//     gate confirm convergence)
//
// See docs/Multiplayer WASM Pivot Phase 3 – 2026-05-17.md.

import * as mpInput from "./mp-input.js";
import { render } from "./mp-renderer.js";
import { connect as wsConnect } from "./mp-ws.js";
import { Particles } from "./mp-particles.js";
import { Hud } from "./mp-hud.js";
import { VERSION_MP } from "../modules/core/version.js";

const DT_CLAMP_MAX = 0.1;             // 100ms per tick max (anti-tab-hide spike)
const DEBUG_UPDATE_EVERY = 10;        // overlay refresh cadence in frames
const FPS_WINDOW = 30;                // rolling sample window for FPS estimate
const INPUT_SEND_INTERVAL_MS = 33;    // ~30 Hz input upload throttle
const RESYNC_THROTTLE_MS = 2000;      // never request Resync more than once per 2s
const REVIVE_FILL_FULL = 1.0;         // matches sim's revive-meter normalization (0..1)

function isSoloMode() {
    try {
        const q = new URLSearchParams(window.location.search);
        return q.get("solo") === "1";
    } catch {
        return false;
    }
}

function isDebugEnabled() {
    try {
        const q = new URLSearchParams(window.location.search);
        if (q.get("mp-debug") === "1") return true;
    } catch {}
    try {
        if (localStorage.getItem("rainboidsMpDebug") === "1") return true;
    } catch {}
    return false;
}

const MP_DEBUG = isDebugEnabled();

export function start(World, debugEl, canvas, { name = "Pilot" } = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        if (debugEl) debugEl.textContent = "mp-engine: 2D context unavailable";
        return;
    }

    mpInput.init(canvas);

    // wasm-bindgen's #[wasm_bindgen(constructor)] exposes the Rust
    // `pub fn new() -> World` as a JS constructor (use `new World()`),
    // NOT as a static `World.new()` method.
    const world = new World();
    const particles = new Particles();
    const hud = new Hud();

    // Cache field size once; Phase 3 still uses a fixed-size world.
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
    let lastEventTick = null;
    let lastChecksumTick = null;
    let lastResyncRequestAt = -Infinity;
    let lastResyncAppliedTick = null;
    let resyncMismatchCount = 0;
    let errorOverlay = null; // { code, message } when fatal protocol error

    // Compare a server-provided BigInt hash against a WASM-side hash.
    // Coerce both sides to BigInt — the WASM bindings may return
    // either BigInt or Number depending on the wasm-bindgen target;
    // BigInt(x) handles either safely.
    const hashEq = (a, b) => {
        try {
            return BigInt(a) === BigInt(b);
        } catch {
            return false;
        }
    };

    // ── WS wiring ──────────────────────────────────────────────────
    if (!solo) {
        ws = wsConnect({
            name,
            onWelcome(msg) {
                localPlayerId = msg.player_id;
                wsConnected = true;
                wsState = "open";

                // WIRE_VERSION 3: Welcome carries the room's RNG seed.
                // Mirror it into our WASM World so the deterministic
                // PCG-64 stream advances in lockstep with the server's.
                try {
                    world.seed(msg.rng_seed);
                } catch (e) {
                    console.warn("[mp/engine] world.seed failed", e);
                }
                try {
                    world.set_local_player(msg.player_id);
                } catch (e) {
                    console.warn("[mp/engine] world.set_local_player failed", e);
                }
                try {
                    world.ensure_ship(msg.player_id, msg.spawn_x, msg.spawn_y);
                } catch (e) {
                    console.warn("[mp/engine] world.ensure_ship failed", e);
                }

                if (MP_DEBUG) {
                    console.log(
                        `[mp/engine] welcome pid=${msg.player_id} server_tick=${msg.server_tick} spawn=(${msg.spawn_x.toFixed(1)}, ${msg.spawn_y.toFixed(1)})`,
                    );
                }
            },
            onSnapshot(msg) {
                lastSnapshotTick = msg.tick;
                for (const ship of msg.ships) {
                    // Local ship trusts local prediction — Phase 4
                    // will reconcile it against server truth.
                    if (localPlayerId !== null && ship.player_id === localPlayerId) {
                        continue;
                    }
                    try {
                        world.apply_snapshot_ship(
                            ship.player_id,
                            ship.x,
                            ship.y,
                            ship.vx,
                            ship.vy,
                            ship.angle,
                        );
                    } catch (e) {
                        if (MP_DEBUG) {
                            console.warn(
                                "[mp/engine] apply_snapshot_ship failed",
                                ship.player_id,
                                e,
                            );
                        }
                    }
                }
            },
            onPeerJoined(msg) {
                if (MP_DEBUG) console.log(`[mp/engine] peer joined pid=${msg.player_id}`);
                // Optimistically stand up an empty ship at field
                // center so the renderer has something to draw before
                // the first Snapshot for this peer lands.
                try {
                    world.ensure_ship(msg.player_id, fieldW * 0.5, fieldH * 0.5);
                } catch (e) {
                    if (MP_DEBUG) console.warn("[mp/engine] ensure_ship on join failed", e);
                }
            },
            onPeerLeft(msg) {
                if (MP_DEBUG) console.log(`[mp/engine] peer left pid=${msg.player_id}`);
                try {
                    world.remove_ship(msg.player_id);
                } catch (e) {
                    if (MP_DEBUG) console.warn("[mp/engine] remove_ship failed", e);
                }
            },
            onError(msg) {
                console.error(`[mp/engine] server error ${msg.code}: ${msg.message}`);
                wsState = `error:${msg.code}`;
                if (msg.code === "wire_version_mismatch") {
                    errorOverlay = {
                        code: msg.code,
                        message:
                            "Wire version mismatch — your client is out of date with the server.\nReload the page (Cmd/Ctrl+Shift+R) to pick up the latest build.",
                    };
                } else {
                    errorOverlay = { code: msg.code, message: msg.message };
                }
            },
            onClose() {
                wsConnected = false;
                wsState = "closed";
                // Loop keeps running in solo mode (local prediction
                // continues, no remote ships). No reconnect in Phase 3.
            },

            // ── Phase 3 callbacks ──
            // Pre-wired; mp-ws.js may or may not dispatch these yet.
            // If it doesn't, the unknown-kind warning fires and these
            // are simply never invoked — no crash, just no resync.
            onEvent(msg) {
                lastEventTick = msg.tick;
                if (MP_DEBUG) {
                    console.log(
                        `[mp/engine] event tick=${msg.tick} payloads=${msg.payloads.length}`,
                    );
                }
                for (const p of msg.payloads) {
                    try {
                        dispatchEvent(p);
                    } catch (e) {
                        console.warn("[mp/engine] event dispatch failed", p?.kind, e);
                    }
                }
            },
            onStateChecksum(msg) {
                lastChecksumTick = msg.tick;
                let localShips, localEnemies, localAsteroids, localBullets;
                try {
                    localShips = world.checksum_ships();
                    localEnemies = world.checksum_enemies();
                    localAsteroids = world.checksum_asteroids();
                    localBullets = world.checksum_bullets();
                } catch (e) {
                    console.warn("[mp/engine] world.checksum_* failed", e);
                    return;
                }
                const mismatches = [];
                if (!hashEq(msg.ships_hash, localShips)) mismatches.push("ships");
                if (!hashEq(msg.enemies_hash, localEnemies)) mismatches.push("enemies");
                if (!hashEq(msg.asteroids_hash, localAsteroids)) mismatches.push("asteroids");
                if (!hashEq(msg.bullets_hash, localBullets)) mismatches.push("bullets");

                if (mismatches.length === 0) return;

                resyncMismatchCount += 1;

                const now = performance.now();
                if (now - lastResyncRequestAt < RESYNC_THROTTLE_MS) {
                    if (MP_DEBUG) {
                        console.log(
                            `[mp/engine] checksum mismatch (${mismatches.join(",")}) tick=${msg.tick} — throttled`,
                        );
                    }
                    return;
                }

                console.warn(
                    `[mp/engine] state mismatch at tick ${msg.tick}, requested Resync (mismatched: ${mismatches.join(",")})`,
                );

                // Best effort — if mp-ws.js hasn't been extended with
                // sendResync yet, we log and wait for Phase 5 to wire
                // the recovery path. We DO NOT poll; one request per
                // checksum miss with 2s throttle (per spec).
                if (ws && typeof ws.sendResync === "function") {
                    try {
                        ws.sendResync(world.tick_count());
                        lastResyncRequestAt = now;
                    } catch (e) {
                        console.warn("[mp/engine] sendResync failed", e);
                    }
                } else {
                    if (MP_DEBUG) {
                        console.warn(
                            "[mp/engine] mp-ws.sendResync unavailable — checksum drift cannot auto-recover (Phase 5)",
                        );
                    }
                }
            },
            onResync(msg) {
                if (MP_DEBUG) {
                    console.log(
                        `[mp/engine] resync tick=${msg.tick} seed=${msg.rng_seed} ships=${msg.ships.length} enemies=${msg.enemies.length} asteroids=${msg.asteroids.length} bullets=${msg.bullets.length}`,
                    );
                }
                try {
                    world.reset_for_resync(BigInt(msg.rng_seed), msg.tick >>> 0);
                } catch (e) {
                    console.error("[mp/engine] world.reset_for_resync failed", e);
                    return;
                }

                // Ships: ensure existence, then snap to server pose.
                // The local ship is included so we re-seat ourselves
                // at the authoritative position — same call path as
                // remote ships, since reset_for_resync wiped the
                // RoomState.
                for (const ship of msg.ships) {
                    try {
                        world.ensure_ship(ship.player_id, ship.x, ship.y);
                        world.apply_snapshot_ship(
                            ship.player_id,
                            ship.x,
                            ship.y,
                            ship.vx,
                            ship.vy,
                            ship.angle,
                        );
                    } catch (e) {
                        if (MP_DEBUG) {
                            console.warn(
                                "[mp/engine] resync ship reseat failed",
                                ship.player_id,
                                e,
                            );
                        }
                    }
                }

                // Enemies: best-effort. The Resync wire carries
                // position + hp but no rng_subseed, so we can't fully
                // reconstruct deterministic state. We synthesize a
                // sub-seed from (room_seed, entity_id) so consume_*
                // still has something deterministic to feed RngCtx;
                // subsequent ticks will diverge from server in any
                // RNG-driven enemy state until Phase 5 widens the
                // Resync record. The next checksum gate will confirm
                // convergence or trigger another Resync.
                for (const e of msg.enemies) {
                    const subseed = synthSubseed(msg.rng_seed, 0xE1, e.id);
                    try {
                        world.consume_enemy_spawn(e.id, e.kind, subseed);
                    } catch (err) {
                        if (MP_DEBUG) {
                            console.warn(
                                "[mp/engine] resync enemy reconstruct failed",
                                e.id,
                                err,
                            );
                        }
                    }
                }

                // Asteroids: same caveat as enemies.
                for (const a of msg.asteroids) {
                    const subseed = synthSubseed(msg.rng_seed, 0xA5, a.id);
                    try {
                        world.consume_asteroid_spawn(a.id, subseed);
                    } catch (err) {
                        if (MP_DEBUG) {
                            console.warn(
                                "[mp/engine] resync asteroid reconstruct failed",
                                a.id,
                                err,
                            );
                        }
                    }
                }

                // Bullets: carry full trajectory state on the wire,
                // so reconstruction is exact.
                for (const b of msg.bullets) {
                    try {
                        world.consume_bullet_spawn(
                            b.id,
                            b.owner_player_id,
                            b.origin_x,
                            b.origin_y,
                            b.vx,
                            b.vy,
                            b.spawn_tick >>> 0,
                            0, // weapon kind not in BulletWire (Phase 5 TODO)
                        );
                    } catch (err) {
                        if (MP_DEBUG) {
                            console.warn(
                                "[mp/engine] resync bullet reconstruct failed",
                                b.id,
                                err,
                            );
                        }
                    }
                }

                lastResyncAppliedTick = msg.tick;
            },
        });
    }

    // Dispatch a single decoded EventPayload into the WASM mirror.
    // Cosmetic emission via mp-particles is deferred to Wave 5 — for
    // now we just keep the deterministic state in lockstep and log
    // behind the mp-debug flag.
    function dispatchEvent(p) {
        switch (p.kind) {
            case "EnemySpawn":
                world.consume_enemy_spawn(p.enemy_id, p.kind_u8, BigInt(p.rng_subseed));
                break;
            case "AsteroidSpawn":
                world.consume_asteroid_spawn(p.asteroid_id, BigInt(p.rng_subseed));
                break;
            case "BulletSpawn":
                world.consume_bullet_spawn(
                    p.bullet_id,
                    p.owner_player_id,
                    p.origin_x,
                    p.origin_y,
                    p.vx,
                    p.vy,
                    p.spawn_tick >>> 0,
                    p.weapon,
                );
                break;
            case "BulletHit":
                world.consume_bullet_hit(p.bullet_id, p.hit_tick >>> 0);
                particles.spawnBulletHit(p.hit_x, p.hit_y);
                if (MP_DEBUG) {
                    console.log(
                        `[mp/engine] bullet ${p.bullet_id} hit ${p.target_kind === 0 ? "enemy" : "asteroid"} ${p.target_id} @ (${p.hit_x.toFixed(0)}, ${p.hit_y.toFixed(0)})`,
                    );
                }
                break;
            case "EnemyDestroy":
                world.consume_enemy_destroy(p.enemy_id);
                particles.spawnEnemyDestroy(p.x, p.y);
                break;
            case "AsteroidSplit":
                world.consume_asteroid_split(
                    p.parent_id,
                    BigInt(p.rng_subseed),
                    p.child_id_start,
                );
                particles.spawnAsteroidSplit(p.x, p.y);
                break;
            case "ShipDamaged":
                world.consume_ship_damaged(p.player_id, p.amount);
                particles.spawnShipDamaged(p.x, p.y);
                break;
            case "ShipDowned":
                world.consume_ship_downed(p.player_id);
                particles.spawnShipDowned(p.x, p.y);
                break;
            case "ShipRevived":
                world.consume_ship_revived(p.revived_player_id);
                // Spawn at the revived player's current position
                // (we don't have position on the wire for ShipRevived
                // — pulling from local mirror).
                try {
                    if (p.revived_player_id === localPlayerId) {
                        particles.spawnShipRevived(world.ship_x(), world.ship_y());
                    } else {
                        const rc = world.remote_ship_count();
                        for (let i = 0; i < rc; i++) {
                            if (world.remote_ship_player_id(i) === p.revived_player_id) {
                                particles.spawnShipRevived(world.remote_ship_x(i), world.remote_ship_y(i));
                                break;
                            }
                        }
                    }
                } catch {}
                break;
            default:
                if (MP_DEBUG) {
                    console.warn("[mp/engine] unknown event payload kind", p.kind);
                }
        }
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
        // The full WASM sim advances here (ships+enemies+asteroids+
        // bullets+collision+revive+cull), not just the local ship.
        world.set_input(
            !!input.up,
            !!input.down,
            !!input.left,
            !!input.right,
            aimWorldX,
            aimWorldY,
        );
        world.tick(dt);
        particles.update(dt);
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

        // Build remote-ship view by querying WASM accessors. The
        // engine no longer maintains its own interp tracks — the
        // WASM mirror is the source of truth, kept up to date by
        // apply_snapshot_ship from incoming Snapshots.
        const remoteShipsArray = [];
        let rcount = 0;
        try {
            rcount = world.remote_ship_count();
        } catch {}
        for (let i = 0; i < rcount; i++) {
            try {
                remoteShipsArray.push({
                    player_id: world.remote_ship_player_id(i),
                    x: world.remote_ship_x(i),
                    y: world.remote_ship_y(i),
                    angle: world.remote_ship_angle(i),
                    hp: world.remote_ship_hp(i),
                    max_hp: world.remote_ship_max_hp(i),
                    downed: world.remote_ship_downed(i),
                });
            } catch {
                // Index slipped under us between count() and accessor —
                // skip silently; next frame re-queries.
                break;
            }
        }

        render(ctx, canvas, world, lastAim, remoteShipsArray);

        // Particles draw INSIDE the renderer's letterbox transform
        // (world coords). The renderer leaves the transform set when
        // it returns; we draw, then HUD resets to identity.
        particles.draw(ctx, scale);

        // HUD draws in SCREEN coords (resets the transform internally).
        hud.draw(ctx, canvas, world);

        // Fatal error overlay (drawn on top of whatever the renderer
        // produced). Kept here in the engine because the renderer is
        // owned by a sibling agent.
        if (errorOverlay) {
            drawErrorOverlay(ctx, canvas, errorOverlay);
        }

        frameCount += 1;
        if (debugEl && frameCount % DEBUG_UPDATE_EVERY === 0) {
            const sx = world.ship_x();
            const sy = world.ship_y();
            const avgFrame = frameDurations.reduce((a, b) => a + b, 0) / Math.max(frameDurations.length, 1);
            const fps = avgFrame > 0 ? (1 / avgFrame) : 0;
            const pidStr = localPlayerId !== null ? String(localPlayerId) : "–";
            const srvTickStr = lastSnapshotTick !== null ? String(lastSnapshotTick) : "–";
            const evTickStr = lastEventTick !== null ? String(lastEventTick) : "–";
            const cksumTickStr = lastChecksumTick !== null ? String(lastChecksumTick) : "–";

            let enemiesCount = 0;
            let asteroidsCount = 0;
            let bulletsCount = 0;
            let hp = 0, maxHp = 0;
            let downed = false;
            let reviveMeter = 0;
            try { enemiesCount = world.enemy_count(); } catch {}
            try { asteroidsCount = world.asteroid_count(); } catch {}
            try { bulletsCount = world.bullet_count(); } catch {}
            try { hp = world.ship_hp(); } catch {}
            try { maxHp = world.ship_max_hp(); } catch {}
            try { downed = !!world.ship_downed(); } catch {}
            try { reviveMeter = world.ship_revive_meter(); } catch {}

            let extra = "";
            if (downed) {
                const pct = Math.max(0, Math.min(100, (reviveMeter / REVIVE_FILL_FULL) * 100));
                extra = `\ndowned:   yes\nrevive:   ${pct.toFixed(0)}%`;
            }

            debugEl.textContent =
                `Rainboids MP - Phase 3 (mp ${VERSION_MP})\n` +
                `tick:     ${tickCount}\n` +
                `pos:      ${sx.toFixed(1)}, ${sy.toFixed(1)}\n` +
                `aim:      ${aimWorldX.toFixed(0)}, ${aimWorldY.toFixed(0)}\n` +
                `fps:      ${fps.toFixed(1)}\n` +
                `ws:       ${wsState}\n` +
                `peers:    ${remoteShipsArray.length}\n` +
                `pid:      ${pidStr}\n` +
                `srv tick: ${srvTickStr}\n` +
                `ev tick:  ${evTickStr}\n` +
                `cks tick: ${cksumTickStr}\n` +
                `resync:   ${resyncMismatchCount} miss / last@t${lastResyncAppliedTick ?? "–"}\n` +
                `enemies:  ${enemiesCount}\n` +
                `asteroids:${asteroidsCount}\n` +
                `bullets:  ${bulletsCount}\n` +
                `hp:       ${hp.toFixed(0)}/${maxHp.toFixed(0)}` +
                extra;
        }

        requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
}

/**
 * Synthesize a deterministic 64-bit subseed from (room_seed, tag,
 * entity_id). Used only on Resync ingestion where the wire doesn't
 * carry per-entity rng_subseeds yet. Splitmix64-style avalanche keeps
 * the result well-distributed; the actual value won't match server's
 * true subseed (we don't know it) but at least both sides of a
 * single client are consistent across the Resync handoff. The next
 * StateChecksum will detect any RNG-driven drift and re-Resync.
 *
 * Phase 5: drop this once Resync wire carries enemy_subseed /
 * asteroid_subseed and the bullet weapon kind.
 */
function synthSubseed(roomSeed, tag, entityId) {
    let x = BigInt(roomSeed) ^ (BigInt(tag) << 56n) ^ BigInt(entityId);
    const MASK = (1n << 64n) - 1n;
    x = (x + 0x9E3779B97F4A7C15n) & MASK;
    x = ((x ^ (x >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
    x = ((x ^ (x >> 27n)) * 0x94D049BB133111EBn) & MASK;
    x = (x ^ (x >> 31n)) & MASK;
    return x;
}

/**
 * Fatal-error overlay. Drawn over the canvas when the server sends
 * an Error variant we can't recover from (currently only
 * `wire_version_mismatch` gets the friendly long-form message).
 */
function drawErrorOverlay(ctx, canvas, err) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#ff5252";
    ctx.font = "bold 28px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`MP error: ${err.code}`, w * 0.5, h * 0.5 - 40);

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px monospace";
    const lines = String(err.message).split("\n");
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], w * 0.5, h * 0.5 + i * 22);
    }
    ctx.restore();
}
