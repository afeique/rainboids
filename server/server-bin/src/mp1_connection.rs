//! Phase-2 per-connection task for `/mp/ws`.
//!
//! Reads binary WebSocket frames, decodes `mp1::ClientMsg`, dispatches
//! to the global `Mp1RoomHandle`. Forwards the per-slot outbound
//! queue (the server's already-encoded `ServerMsg` bytes) back out
//! over the WebSocket as binary frames.
//!
//! Parallel to the legacy `server/connection.rs`. Phase 2 has no
//! reconnect / session token logic, no matchmaking handshake, and no
//! ping/pong RTT loop — just Hello → Welcome → Input loop → Bye.

use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use rainboids_sim::mp1::{
    codec,
    wire::{ClientMsg, ServerMsg, WIRE_VERSION},
};
use tokio::sync::mpsc;

use crate::mp1_room::{Mp1RoomHandle, RoomCmd};

/// Maximum time the server waits for the client's `Hello` before
/// dropping the connection. Phase 2 doesn't auth — a missing Hello
/// is either a bad client or a probe; either way, close fast.
const HELLO_TIMEOUT: Duration = Duration::from_secs(5);

/// Per-connection entry point. Owns the WebSocket end-to-end:
///
/// 1. Read + validate `Hello` (timeout-guarded).
/// 2. Join the room, send `Welcome`, broadcast `PeerJoined` to peers.
/// 3. Spawn a writer task that drains the slot's outbound queue.
/// 4. Reader loop: decode frames, dispatch `Input` / `Bye` to room.
/// 5. On disconnect: send `Leave` to room (triggers `PeerLeft`).
pub async fn handle(ws: WebSocket, room: Mp1RoomHandle) {
    let (mut tx, mut rx) = ws.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    // ── 1. Wait for Hello ───────────────────────────────────────────
    let hello_bytes = match tokio::time::timeout(HELLO_TIMEOUT, rx.next()).await {
        Ok(Some(Ok(Message::Binary(b)))) => b,
        Ok(Some(Ok(Message::Close(_)))) => {
            tracing::info!("mp1: client closed before Hello");
            return;
        }
        Ok(Some(Ok(_))) => {
            tracing::warn!("mp1: non-binary first frame; expected Hello");
            return;
        }
        Ok(Some(Err(e))) => {
            tracing::warn!(error = %e, "mp1: ws error before Hello");
            return;
        }
        Ok(None) => {
            tracing::info!("mp1: stream ended before Hello");
            return;
        }
        Err(_) => {
            tracing::warn!("mp1: no Hello before timeout; closing");
            return;
        }
    };

    let hello = match codec::decode_client(&hello_bytes) {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!(error = %e, "mp1: decode Hello failed");
            return;
        }
    };

    let (client_name, client_wire_version) = match hello {
        ClientMsg::Hello {
            name, wire_version, ..
        } => (name, wire_version),
        other => {
            tracing::warn!(?other, "mp1: first msg not Hello");
            return;
        }
    };

    if client_wire_version != WIRE_VERSION {
        let err = ServerMsg::Error {
            code: "wire_version_mismatch".into(),
            message: format!(
                "server expects {}, client sent {}",
                WIRE_VERSION, client_wire_version
            ),
        };
        if let Ok(b) = codec::encode_server(&err) {
            let _ = tx.send(Message::Binary(b)).await;
        }
        return;
    }

    // ── 2. Join the room ────────────────────────────────────────────
    let (player_id, spawn_x, spawn_y) = {
        let mut s = room.state.lock().await;
        s.join(out_tx.clone())
    };
    tracing::info!(player_id, name = %client_name, "mp1: player joined");

    let server_tick = room.state.lock().await.tick;
    let welcome = ServerMsg::Welcome {
        player_id,
        server_tick,
        spawn_x,
        spawn_y,
    };
    if let Ok(b) = codec::encode_server(&welcome) {
        if tx.send(Message::Binary(b)).await.is_err() {
            tracing::warn!(player_id, "mp1: failed to send Welcome; aborting");
            // Best-effort leave so the slot is cleaned up.
            let _ = room.cmd_tx.send(RoomCmd::Leave { player_id });
            return;
        }
    }

    // Notify existing peers that a new player joined.
    {
        let s = room.state.lock().await;
        let evt = ServerMsg::PeerJoined { player_id };
        s.broadcast_peer_event(&evt, Some(player_id));
    }

    // ── 3. Writer task: drain outbound queue → WS ───────────────────
    let writer = tokio::spawn(async move {
        while let Some(bytes) = out_rx.recv().await {
            if tx.send(Message::Binary(bytes)).await.is_err() {
                break;
            }
        }
    });

    // ── 4. Reader loop ──────────────────────────────────────────────
    while let Some(frame) = rx.next().await {
        let msg = match frame {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!(player_id, error = %e, "mp1: ws read error");
                break;
            }
        };
        match msg {
            Message::Binary(b) => {
                let parsed = match codec::decode_client(&b) {
                    Ok(m) => m,
                    Err(e) => {
                        tracing::warn!(player_id, error = %e, "mp1: decode failed");
                        continue;
                    }
                };
                match parsed {
                    ClientMsg::Input { .. } => {
                        if room
                            .cmd_tx
                            .send(RoomCmd::Input {
                                player_id,
                                msg: parsed,
                            })
                            .is_err()
                        {
                            tracing::warn!(player_id, "mp1: room cmd channel closed");
                            break;
                        }
                    }
                    ClientMsg::Bye => {
                        tracing::info!(player_id, "mp1: client said Bye");
                        break;
                    }
                    ClientMsg::Hello { .. } => {
                        tracing::warn!(player_id, "mp1: duplicate Hello, ignoring");
                    }
                }
            }
            Message::Close(_) => break,
            // Axum auto-pongs Ping frames at the transport layer; we
            // intentionally don't handle Pong/Ping/Text here.
            _ => {}
        }
    }

    // ── 5. Cleanup ──────────────────────────────────────────────────
    let _ = room.cmd_tx.send(RoomCmd::Leave { player_id });
    writer.abort();
    tracing::info!(player_id, "mp1: connection closed");
}
