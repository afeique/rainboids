//! Per-WS task: hello/version handshake, fans messages between matchmaking
//! and the player's current room.

use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use crate::matchmaking::Matchmaker;
use crate::protocol::{
    self, codec, ClientMsg, ErrCode, ServerMsg, SIM_VERSION, WIRE_VERSION,
};
use crate::room::{RoomHandle, RoomInbound};
use crate::server::auth;
use crate::util::id::PlayerId;
use crate::util::time::now_ms;

const HELLO_TIMEOUT: Duration = Duration::from_secs(3);
const OUTBOUND_BUFFER: usize = 256;

pub async fn run(ws: WebSocket, mm: Matchmaker) {
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

    // Hello with timeout.
    let hello = match tokio::time::timeout(HELLO_TIMEOUT, read_hello(&mut ws_rx)).await {
        Ok(Ok(h)) => h,
        _ => {
            warn!("client failed Hello");
            writer.abort();
            return;
        }
    };

    let (wire_version, sim_version, display_name) = match hello {
        ClientMsg::Hello {
            wire_version,
            sim_version,
            display_name,
            ..
        } => (wire_version, sim_version, display_name),
        _ => {
            let _ = out_tx
                .send(ServerMsg::Error {
                    code: ErrCode::BadHello,
                    msg: "expected Hello".into(),
                })
                .await;
            writer.abort();
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
        writer.abort();
        return;
    }

    let player_id = PlayerId::new();
    let session = auth::new_session();
    let _ = out_tx
        .send(ServerMsg::Welcome {
            player_id,
            session,
            server_t_ms: now_ms(),
        })
        .await;
    info!(player_id = %player_id, %display_name, "client welcomed");
    metrics::gauge!("rainboids_players_online").increment(1.0);

    let mut current_room: Option<RoomHandle> = None;
    while let Some(frame) = ws_rx.next().await {
        let Ok(frame) = frame else { break };
        let Message::Binary(buf) = frame else { continue };
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
                let _ = room
                    .send(RoomInbound::Input {
                        player_id,
                        tick: *tick,
                        packed: *packed,
                    })
                    .await;
            }
            (ClientMsg::Ack { snapshot_tick }, Some(room)) => {
                let _ = room
                    .send(RoomInbound::Ack {
                        player_id,
                        snapshot_tick: *snapshot_tick,
                    })
                    .await;
            }
            (ClientMsg::LeaveRoom, Some(room)) => {
                let _ = room
                    .send(RoomInbound::Leave {
                        player_id,
                        reason: protocol::LeaveReason::Voluntary,
                    })
                    .await;
                current_room = None;
            }
            (ClientMsg::QuickMatch, _)
            | (ClientMsg::BrowseRooms, _)
            | (ClientMsg::CreateRoom { .. }, _)
            | (ClientMsg::JoinRoom { .. }, _)
            | (ClientMsg::JoinRoomByCode { .. }, _) => {
                if let Some(handle) = mm
                    .handle(player_id, &display_name, msg, out_tx.clone())
                    .await
                {
                    current_room = Some(handle);
                }
            }
            _ => {
                // Other inputs only apply when in a room — drop silently.
            }
        }
    }

    if let Some(room) = current_room {
        let _ = room
            .send(RoomInbound::Disconnected { player_id })
            .await;
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
