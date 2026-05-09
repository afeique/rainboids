//! Per-WS task: hello/version handshake, fans messages between matchmaking
//! and the player's current room.
//!
//! On disconnect, registers the session with [`SessionRegistry`] keyed by
//! the UUID issued in `Welcome`. A subsequent `Hello` carrying that UUID
//! reattaches to the same room slot if the grace timer hasn't fired.

use std::sync::Arc;
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio::time::interval;
use tracing::{debug, info, warn};

use crate::config::Config;
use crate::matchmaking::Matchmaker;
use crate::protocol::{
    self, codec, ClientMsg, ErrCode, ServerMsg, SIM_VERSION, WIRE_VERSION,
};
use crate::room::{RoomHandle, RoomInbound};
use crate::server::auth;
use crate::server::session::{SessionEntry, SessionRegistry};
use crate::util::id::PlayerId;
use crate::util::time::now_ms;

const HELLO_TIMEOUT: Duration = Duration::from_secs(3);
const OUTBOUND_BUFFER: usize = 256;
const PING_INTERVAL: Duration = Duration::from_secs(5);

pub async fn run(
    ws: WebSocket,
    mm: Matchmaker,
    sessions: Arc<SessionRegistry>,
    cfg: Arc<Config>,
) {
    let (mut ws_tx, mut ws_rx) = ws.split();
    let (out_tx, mut out_rx) = mpsc::channel::<ServerMsg>(OUTBOUND_BUFFER);

    // Writer task — drains outbound queue and writes binary frames.
    let writer = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            let bytes = match codec::encode_server(&msg) {
                Ok(b) => b,
                Err(e) => {
                    warn!(?e, "encode failed");
                    continue;
                }
            };
            if ws_tx.send(Message::Binary(bytes)).await.is_err() {
                break;
            }
        }
    });

    // Hello with timeout. On any failure path we drop `out_tx` and await
    // the writer so any queued Error frame actually reaches the wire
    // before the socket tears down.
    let hello = match tokio::time::timeout(HELLO_TIMEOUT, read_hello(&mut ws_rx)).await {
        Ok(Ok(h)) => h,
        _ => {
            warn!("client failed Hello");
            drop(out_tx);
            let _ = writer.await;
            return;
        }
    };

    let (wire_version, sim_version, display_name, hello_session) = match hello {
        ClientMsg::Hello {
            wire_version,
            sim_version,
            display_name,
            session,
            ..
        } => (wire_version, sim_version, display_name, session),
        _ => {
            let _ = out_tx
                .send(ServerMsg::Error {
                    code: ErrCode::BadHello,
                    msg: "expected Hello".into(),
                })
                .await;
            drop(out_tx);
            let _ = writer.await;
            return;
        }
    };

    if !protocol::is_compatible(wire_version, sim_version) {
        let _ = out_tx
            .send(ServerMsg::Error {
                code: ErrCode::Version,
                msg: format!("server v{}/{}", WIRE_VERSION, SIM_VERSION),
            })
            .await;
        drop(out_tx);
        let _ = writer.await;
        return;
    }

    // Resolve player id + room (reattach path vs fresh path).
    let mut current_room: Option<RoomHandle> = None;
    let player_id = match hello_session.and_then(|sid| sessions.take_alive(&sid)) {
        Some(SessionEntry { player_id, room, .. }) => {
            // Try reattach. If the room rejects (grace expired in-flight,
            // closed room, etc.) we still keep the same player_id but the
            // client lands at the title screen with no room.
            if room
                .send(RoomInbound::Reattach {
                    player_id,
                    display_name: display_name.clone(),
                    out: out_tx.clone(),
                })
                .await
                .is_ok()
            {
                current_room = Some(room);
                metrics::counter!("rainboids_reconnect_attempts_total", "ok" => "true")
                    .increment(1);
            } else {
                metrics::counter!("rainboids_reconnect_attempts_total", "ok" => "false")
                    .increment(1);
            }
            player_id
        }
        None => PlayerId::new(),
    };

    // Issue a fresh session UUID for the *next* potential reconnect.
    let session = auth::new_session();
    let _ = out_tx
        .send(ServerMsg::Welcome {
            player_id,
            session,
            server_t_ms: now_ms(),
        })
        .await;
    info!(player_id = %player_id, %display_name, reconnect = current_room.is_some(), "client welcomed");
    metrics::gauge!("rainboids_players_online").increment(1.0);

    // Periodic Ping for RTT measurement. Echoes back as ClientMsg::Pong.
    let mut ping = interval(PING_INTERVAL);
    ping.tick().await; // skip immediate fire
    let mut last_ping_client_t: u32 = 0;

    loop {
        tokio::select! {
            biased;
            // Application messages from client.
            frame = ws_rx.next() => {
                let Some(Ok(frame)) = frame else { break };
                let Message::Binary(buf) = frame else {
                    if matches!(frame, Message::Close(_)) { break }
                    continue
                };
                let msg = match codec::decode_client(&buf) {
                    Ok(m) => m,
                    Err(e) => {
                        debug!(?e, "decode error");
                        metrics::counter!("rainboids_decode_errors_total", "kind" => "client").increment(1);
                        continue;
                    }
                };
                match (&msg, &current_room) {
                    (ClientMsg::Input { tick, packed }, Some(room)) => {
                        let _ = room.send(RoomInbound::Input {
                            player_id,
                            tick: *tick,
                            packed: *packed,
                        }).await;
                    }
                    (ClientMsg::Ack { snapshot_tick }, Some(room)) => {
                        let _ = room.send(RoomInbound::Ack {
                            player_id,
                            snapshot_tick: *snapshot_tick,
                        }).await;
                    }
                    (ClientMsg::Pong { client_t, server_t: _ }, _) => {
                        // RTT = now - the client_t we sent in our Ping.
                        if *client_t == last_ping_client_t {
                            let rtt_ms = (now_ms() & 0xFFFF_FFFF) as u32 - last_ping_client_t;
                            metrics::histogram!("rainboids_rtt_ms")
                                .record(rtt_ms as f64);
                        }
                    }
                    (ClientMsg::LeaveRoom, Some(room)) => {
                        let _ = room.send(RoomInbound::Leave {
                            player_id,
                            reason: protocol::LeaveReason::Voluntary,
                        }).await;
                        current_room = None;
                    }
                    (ClientMsg::QuickMatch, _)
                    | (ClientMsg::BrowseRooms, _)
                    | (ClientMsg::CreateRoom { .. }, _)
                    | (ClientMsg::JoinRoom { .. }, _)
                    | (ClientMsg::JoinRoomByCode { .. }, _) => {
                        if current_room.is_none() {
                            if let Some(handle) = mm.handle(player_id, &display_name, msg, out_tx.clone()).await {
                                current_room = Some(handle);
                            }
                        }
                    }
                    _ => {
                        // Ignored: input/ack/etc. with no room, or chat (unimplemented).
                    }
                }
            }
            // Periodic ping for RTT.
            _ = ping.tick() => {
                let now32 = (now_ms() & 0xFFFF_FFFF) as u32;
                last_ping_client_t = now32;
                if out_tx.try_send(ServerMsg::Ping {
                    client_t: now32,
                    server_t: now32,
                }).is_err() {
                    // Outbound queue is full or closed — connection is failing.
                    debug!(player_id = %player_id, "outbound queue stalled; closing");
                    break;
                }
            }
        }
    }

    // Disconnect path.
    if let Some(room) = current_room.as_ref() {
        let _ = room.send(RoomInbound::Disconnected { player_id }).await;
        let entry = SessionEntry {
            player_id,
            room: room.clone(),
            expires_at_ms: now_ms() + cfg.grace_secs * 1000,
        };
        sessions.register(session, entry);
    }
    metrics::gauge!("rainboids_players_online").decrement(1.0);
    writer.abort();
}

async fn read_hello(
    rx: &mut futures_util::stream::SplitStream<WebSocket>,
) -> anyhow::Result<ClientMsg> {
    while let Some(frame) = rx.next().await {
        match frame? {
            Message::Binary(buf) => {
                let msg: ClientMsg = codec::decode(&buf)?;
                return Ok(msg);
            }
            Message::Ping(_) | Message::Pong(_) => continue,
            Message::Close(_) => anyhow::bail!("closed before hello"),
            Message::Text(_) => anyhow::bail!("text frame on binary protocol"),
        }
    }
    anyhow::bail!("eof before hello")
}
