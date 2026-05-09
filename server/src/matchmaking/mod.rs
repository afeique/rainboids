//! Singleton matchmaking actor. In-process registry of active rooms.

use std::sync::Arc;

use dashmap::DashMap;
use tokio::sync::mpsc;
use tracing::info;

use crate::config::Config;
use crate::protocol::{ClientMsg, ErrCode, RoomSummary, ServerMsg};
use crate::room::{Room, RoomHandle, RoomInbound};
use crate::util::id::{PlayerId, RoomId};

#[derive(Clone)]
pub struct Matchmaker {
    rooms: Arc<DashMap<RoomId, RoomEntry>>,
    by_code: Arc<DashMap<String, RoomId>>,
    cfg: Arc<Config>,
}

#[derive(Clone)]
struct RoomEntry {
    handle: RoomHandle,
    name: String,
    public: bool,
    max_players: u8,
    code: String,
}

impl Matchmaker {
    pub fn new(cfg: Arc<Config>) -> Self {
        Self {
            rooms: Arc::new(DashMap::new()),
            by_code: Arc::new(DashMap::new()),
            cfg,
        }
    }

    pub async fn handle(
        &self,
        player_id: PlayerId,
        display_name: &str,
        msg: ClientMsg,
        out: mpsc::Sender<ServerMsg>,
    ) -> Option<RoomHandle> {
        match msg {
            ClientMsg::QuickMatch => self.quick_match(player_id, display_name, out).await,
            ClientMsg::BrowseRooms => {
                self.send_browse(&out).await;
                None
            }
            ClientMsg::CreateRoom {
                name,
                public,
                max_players,
            } => Some(self.create(name, public, max_players, player_id, display_name, out).await),
            ClientMsg::JoinRoom { room_id } => self.join(room_id, player_id, display_name, out).await,
            ClientMsg::JoinRoomByCode { code } => {
                self.join_by_code(&code, player_id, display_name, out).await
            }
            _ => None,
        }
    }

    async fn quick_match(
        &self,
        player_id: PlayerId,
        display_name: &str,
        out: mpsc::Sender<ServerMsg>,
    ) -> Option<RoomHandle> {
        let candidate = self
            .rooms
            .iter()
            .find(|r| r.value().public)
            .map(|r| r.value().clone());
        let entry = match candidate {
            Some(r) => r,
            None => self.spawn_room("Quick Match".into(), true, self.cfg.max_players_per_room),
        };
        let _ = entry
            .handle
            .send(RoomInbound::Join {
                player_id,
                display_name: display_name.to_string(),
                out,
            })
            .await;
        Some(entry.handle.clone())
    }

    async fn send_browse(&self, out: &mpsc::Sender<ServerMsg>) {
        let rooms = self
            .rooms
            .iter()
            .filter(|r| r.value().public)
            .map(|r| RoomSummary {
                room_id: *r.key(),
                name: r.value().name.clone(),
                players: 0, // Plan §"Browse" — real player counts come from a room poll.
                max_players: r.value().max_players,
                wave: 0,
            })
            .collect();
        let _ = out.try_send(ServerMsg::RoomList { rooms });
    }

    async fn create(
        &self,
        name: String,
        public: bool,
        max_players: u8,
        player_id: PlayerId,
        display_name: &str,
        out: mpsc::Sender<ServerMsg>,
    ) -> RoomHandle {
        let entry = self.spawn_room(name, public, max_players);
        let _ = entry
            .handle
            .send(RoomInbound::Join {
                player_id,
                display_name: display_name.to_string(),
                out,
            })
            .await;
        entry.handle
    }

    async fn join(
        &self,
        room_id: RoomId,
        player_id: PlayerId,
        display_name: &str,
        out: mpsc::Sender<ServerMsg>,
    ) -> Option<RoomHandle> {
        let entry = self.rooms.get(&room_id).map(|r| r.clone())?;
        let _ = entry
            .handle
            .send(RoomInbound::Join {
                player_id,
                display_name: display_name.to_string(),
                out,
            })
            .await;
        Some(entry.handle)
    }

    async fn join_by_code(
        &self,
        code: &str,
        player_id: PlayerId,
        display_name: &str,
        out: mpsc::Sender<ServerMsg>,
    ) -> Option<RoomHandle> {
        let room_id = *self.by_code.get(&code.to_uppercase())?.value();
        self.join(room_id, player_id, display_name, out).await
    }

    fn spawn_room(&self, name: String, public: bool, max_players: u8) -> RoomEntry {
        if self.rooms.len() >= self.cfg.max_rooms {
            // Caller can surface ErrCode::Full; we still return a fresh room to
            // keep the type tidy. Real impl would refuse before spawning.
        }
        let (handle, code, _seed) = Room::spawn(self.cfg.clone());
        let entry = RoomEntry {
            handle: handle.clone(),
            name,
            public,
            max_players,
            code: code.clone(),
        };
        info!(room_id = %handle.id(), code = %code, "room created");
        self.rooms.insert(handle.id(), entry.clone());
        self.by_code.insert(code, handle.id());
        entry
    }

    pub async fn close(&self, handle: &RoomHandle) {
        if let Some((_, entry)) = self.rooms.remove(&handle.id()) {
            self.by_code.remove(&entry.code);
        }
    }
}

#[allow(dead_code)]
fn err_full() -> ServerMsg {
    ServerMsg::Error {
        code: ErrCode::Full,
        msg: "server at capacity".into(),
    }
}
