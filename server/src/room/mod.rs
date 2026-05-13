//! Per-room actor: owns authoritative GameState, runs the 60Hz simulation
//! tick, fans snapshots and events out to connected clients.
//!
//! See `Multiplayer Rust Server – 2026-05-07.md` §"Per-room simulation loop".

use std::collections::HashMap;
use std::time::{Duration, Instant};

use rand_pcg::Pcg64;
use tokio::sync::mpsc;
use tokio::time::{interval, MissedTickBehavior};
use tracing::{info, warn};

use crate::config::Config;
use crate::protocol::{
    GameEvent, LeaveReason, PackedInput, PeerInfo, ServerMsg,
};
use crate::sim::input::PlayerInput;
use crate::sim::{rng as sim_rng, simulate_tick, GameState, PlayerInputs};
use crate::util::id::{PlayerId, RoomId};

pub mod collision;
pub mod handle;
pub mod lifecycle;
pub mod safe_spawn;
pub mod snapshot;

pub use handle::RoomHandle;
pub use lifecycle::{GraceTimer, RoomState};

/// Messages an external task can send into a room.
#[derive(Debug)]
pub enum RoomInbound {
    Join {
        player_id: PlayerId,
        display_name: String,
        out: mpsc::Sender<ServerMsg>,
    },
    /// Re-attach an existing player slot whose connection dropped during
    /// the grace window. Replaces the player's outbound channel and clears
    /// their grace timer; on miss (player no longer in room) replies with
    /// `ServerMsg::Error { NotFound }` on `out`.
    Reattach {
        player_id: PlayerId,
        display_name: String,
        out: mpsc::Sender<ServerMsg>,
    },
    Leave {
        player_id: PlayerId,
        reason: LeaveReason,
    },
    Disconnected {
        player_id: PlayerId,
    },
    Input {
        player_id: PlayerId,
        tick: u32,
        packed: PackedInput,
    },
    Ack {
        player_id: PlayerId,
        snapshot_tick: u32,
    },
    /// Cheap snapshot of room population — used by matchmaking to render
    /// `RoomList` without taking the actor lock.
    Summary {
        reply: tokio::sync::oneshot::Sender<RoomSummarySnap>,
    },
    Shutdown,
}

/// Snapshot the matchmaker pulls every poll for `BrowseRooms`. Cheap to
/// build; no entity collections are copied.
#[derive(Debug, Clone, Copy)]
pub struct RoomSummarySnap {
    pub players: u8,
    pub wave: u32,
}

#[derive(Debug)]
struct Player {
    id: PlayerId,
    display_name: String,
    slot: u8,
    out: mpsc::Sender<ServerMsg>,
    last_ack_tick: u32,
    lagging: bool,
}

#[derive(Debug, Default, Clone, Copy)]
struct InputBuffer {
    latest: PlayerInput,
    last_tick: u32,
}

pub struct Room {
    id: RoomId,
    code: String,
    state: GameState,
    sim_state: RoomState,
    inputs: HashMap<PlayerId, InputBuffer>,
    rng: Pcg64,
    seed: u64,
    tick: u32,
    players: Vec<Player>,
    cmd_rx: mpsc::Receiver<RoomInbound>,
    pending_events: Vec<GameEvent>,
    /// Side-state bridging the gap between wire-format collections and the
    /// pure collision detect-steps (asteroid HP, drop active-latch, bullet
    /// pierce sets). See `room::collision::CollisionSideState`.
    collision_side: collision::CollisionSideState,
    grace: HashMap<PlayerId, GraceTimer>,
    cfg: std::sync::Arc<Config>,
    encode_buf: Vec<u8>,
}

impl Room {
    pub fn spawn(cfg: std::sync::Arc<Config>) -> (RoomHandle, String, u64) {
        let (tx, rx) = mpsc::channel::<RoomInbound>(256);
        let id = RoomId::new();
        let code = nanoid::nanoid!(6, &CODE_ALPHABET);
        let seed: u64 = rand::random();

        let room = Room {
            id,
            code: code.clone(),
            state: GameState::new(),
            sim_state: RoomState::WaitingForPlayers,
            inputs: HashMap::new(),
            rng: sim_rng::from_seed(seed),
            seed,
            tick: 0,
            players: Vec::new(),
            cmd_rx: rx,
            pending_events: Vec::new(),
            collision_side: collision::CollisionSideState::new(),
            grace: HashMap::new(),
            cfg,
            encode_buf: Vec::with_capacity(8 * 1024),
        };

        tokio::spawn(run(room));
        metrics::counter!("rainboids_rooms_created_total").increment(1);
        metrics::gauge!("rainboids_rooms_active").increment(1.0);
        (RoomHandle { tx, id }, code, seed)
    }

    fn enqueue(&mut self, msg: RoomInbound) {
        match msg {
            RoomInbound::Join {
                player_id,
                display_name,
                out,
            } => self.handle_join(player_id, display_name, out),
            RoomInbound::Reattach {
                player_id,
                display_name,
                out,
            } => self.handle_reattach(player_id, display_name, out),
            RoomInbound::Leave { player_id, reason } => self.handle_leave(player_id, reason),
            RoomInbound::Disconnected { player_id } => self.handle_disconnect(player_id),
            RoomInbound::Input {
                player_id,
                tick,
                packed,
            } => {
                let buf = self.inputs.entry(player_id).or_default();
                if tick >= buf.last_tick {
                    buf.latest = packed.into();
                    buf.last_tick = tick;
                }
            }
            RoomInbound::Ack {
                player_id,
                snapshot_tick,
            } => {
                if let Some(p) = self.players.iter_mut().find(|p| p.id == player_id) {
                    p.last_ack_tick = snapshot_tick;
                }
            }
            RoomInbound::Summary { reply } => {
                let _ = reply.send(RoomSummarySnap {
                    players: self.players.len() as u8,
                    wave: self.state.wave.current,
                });
            }
            RoomInbound::Shutdown => self.sim_state = RoomState::Closing,
        }
    }

    fn handle_reattach(
        &mut self,
        player_id: PlayerId,
        display_name: String,
        out: mpsc::Sender<ServerMsg>,
    ) {
        let Some(p) = self.players.iter_mut().find(|p| p.id == player_id) else {
            // Slot isn't here anymore — caller should mint a fresh player.
            let _ = out.try_send(ServerMsg::Error {
                code: crate::protocol::ErrCode::NotFound,
                msg: "session expired".into(),
            });
            return;
        };
        p.out = out.clone();
        p.display_name = display_name;
        p.lagging = false;
        let slot = p.slot;
        self.grace.remove(&player_id);

        let peers: Vec<PeerInfo> = self
            .players
            .iter()
            .filter(|other| other.id != player_id)
            .map(|p| PeerInfo {
                player_id: p.id,
                display_name: p.display_name.clone(),
                slot: p.slot,
            })
            .collect();

        let _ = out.try_send(ServerMsg::RoomJoined {
            room_id: self.id,
            code: self.code.clone(),
            slot,
            peers,
            wave: self.state.wave.current,
            seed: self.seed,
        });

        info!(player_id = %player_id, slot, "player reattached after grace");
        metrics::counter!("rainboids_players_reattached_total").increment(1);
    }

    fn handle_join(
        &mut self,
        player_id: PlayerId,
        display_name: String,
        out: mpsc::Sender<ServerMsg>,
    ) {
        if self.players.len() >= self.cfg.max_players_per_room as usize {
            let _ = out.try_send(ServerMsg::Error {
                code: crate::protocol::ErrCode::Full,
                msg: "room full".into(),
            });
            return;
        }
        let slot = self.players.len() as u8;
        let spawn = if matches!(self.sim_state, RoomState::Playing) {
            safe_spawn::find_safe_spawn(&self.state)
        } else {
            glam::Vec2::new(self.state.field.width * 0.5, self.state.field.height * 0.5)
        };
        self.state.add_ship(player_id, spawn.x, spawn.y);
        self.inputs.insert(player_id, InputBuffer::default());
        self.grace.remove(&player_id);

        let peers = self
            .players
            .iter()
            .map(|p| PeerInfo {
                player_id: p.id,
                display_name: p.display_name.clone(),
                slot: p.slot,
            })
            .collect();

        let _ = out.try_send(ServerMsg::RoomJoined {
            room_id: self.id,
            code: self.code.clone(),
            slot,
            peers,
            wave: self.state.wave.current,
            seed: self.seed,
        });

        let new_peer = PeerInfo {
            player_id,
            display_name: display_name.clone(),
            slot,
        };
        for p in &self.players {
            let _ = p.out.try_send(ServerMsg::PeerJoined {
                peer: new_peer.clone(),
                slot,
            });
        }

        self.players.push(Player {
            id: player_id,
            display_name,
            slot,
            out,
            last_ack_tick: 0,
            lagging: false,
        });

        if matches!(self.sim_state, RoomState::WaitingForPlayers | RoomState::Paused) {
            self.sim_state = RoomState::Playing;
        }
        metrics::counter!("rainboids_players_joined_total").increment(1);
    }

    fn handle_leave(&mut self, player_id: PlayerId, reason: LeaveReason) {
        let Some(idx) = self.players.iter().position(|p| p.id == player_id) else {
            return;
        };
        let p = self.players.remove(idx);
        self.state.remove_ship(player_id);
        self.inputs.remove(&player_id);
        let _ = p.out.try_send(ServerMsg::RoomLeft { reason });
        for other in &self.players {
            let _ = other.out.try_send(ServerMsg::PeerLeft {
                slot: p.slot,
                reason,
            });
        }
        if self.players.is_empty() && self.grace.is_empty() {
            self.sim_state = RoomState::Closing;
        }
    }

    fn handle_disconnect(&mut self, player_id: PlayerId) {
        let now = crate::util::time::now_ms();
        self.grace.insert(
            player_id,
            GraceTimer {
                started_at_ms: now,
                deadline_ms: now + self.cfg.grace_secs * 1000,
            },
        );
        // Player stays in `players` list with frozen ship until grace expires.
    }

    fn drain_inbound(&mut self) {
        while let Ok(msg) = self.cmd_rx.try_recv() {
            self.enqueue(msg);
        }
    }

    fn simulate_one_tick(&mut self) {
        if !matches!(self.sim_state, RoomState::Playing) {
            return;
        }
        let dt = 1.0 / self.cfg.tick_hz as f32;
        let inputs: PlayerInputs = self
            .inputs
            .iter()
            .map(|(id, buf)| (*id, buf.latest))
            .collect();
        simulate_tick(
            &mut self.state,
            &inputs,
            dt,
            &mut self.rng,
            &mut self.pending_events,
        );
        // Collision drain: build view-types from GameState, run pair-detection
        // pure steps, drain `CollisionEvent`s into HP / despawn / wire-event
        // mutations. MVD scope: bullets / enemies / asteroids / drops are
        // empty Vecs on GameState, so the drain is a guaranteed no-op today
        // and a fully-wired pipeline when later PRs populate the collections.
        collision::drain(
            &mut self.state,
            &mut self.collision_side,
            &mut self.pending_events,
        );
        self.tick = self.tick.wrapping_add(1);
    }

    fn broadcast_snapshot(&mut self) {
        let payload = snapshot::build(&self.state);
        let msg = ServerMsg::Snapshot {
            tick: self.tick,
            base_tick: None,
            payload,
        };
        // v1: re-encode per recipient (small N). The plan calls out
        // switching to ref-counted Bytes broadcast post-v1.
        for p in &mut self.players {
            if p.lagging {
                continue;
            }
            match p.out.try_send(msg.clone()) {
                Ok(_) => {}
                Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
                    p.lagging = true;
                    warn!(player_id = %p.id, "client lagging; dropping snapshots");
                }
                Err(_) => {}
            }
        }
        let _ = bincode::serialize_into(&mut self.encode_buf, &msg);
        metrics::histogram!("rainboids_snapshot_size_bytes").record(self.encode_buf.len() as f64);
        self.encode_buf.clear();
    }

    fn broadcast_pending_events(&mut self) {
        if self.pending_events.is_empty() {
            return;
        }
        for ev in self.pending_events.drain(..) {
            let msg = ServerMsg::Event {
                tick: self.tick,
                event: ev,
            };
            for p in &self.players {
                if p.lagging {
                    continue;
                }
                let _ = p.out.try_send(msg.clone());
            }
        }
    }

    fn reap_grace(&mut self) {
        let now = crate::util::time::now_ms();
        let expired: Vec<PlayerId> = self
            .grace
            .iter()
            .filter(|(_, t)| now >= t.deadline_ms)
            .map(|(id, _)| *id)
            .collect();
        for id in expired {
            self.grace.remove(&id);
            self.handle_leave(id, LeaveReason::GraceExpired);
        }
    }

    fn should_shutdown(&self) -> bool {
        matches!(self.sim_state, RoomState::Closing)
    }

    fn cleanup(self) {
        info!(room_id = %self.id, "room actor exiting");
        metrics::counter!("rainboids_rooms_destroyed_total").increment(1);
        metrics::gauge!("rainboids_rooms_active").decrement(1.0);
    }
}

const CODE_ALPHABET: [char; 28] = [
    '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'M',
    'N', 'P', 'Q', 'R', 'T', 'V', 'W', 'X', 'Y',
];

async fn run(mut room: Room) {
    let tick_dur = Duration::from_secs_f64(1.0 / room.cfg.tick_hz as f64);
    let mut tick_interval = interval(tick_dur);
    tick_interval.set_missed_tick_behavior(MissedTickBehavior::Burst);
    let snapshot_every = (room.cfg.tick_hz / room.cfg.snapshot_hz).max(1);
    let mut tick_counter: u32 = 0;

    loop {
        tokio::select! {
            biased;
            cmd = room.cmd_rx.recv() => {
                match cmd {
                    Some(c) => room.enqueue(c),
                    None => break,
                }
            }
            _ = tick_interval.tick() => {
                room.drain_inbound();
                let started = Instant::now();
                room.simulate_one_tick();
                metrics::histogram!("rainboids_tick_duration_seconds")
                    .record(started.elapsed().as_secs_f64());

                tick_counter = tick_counter.wrapping_add(1);
                if tick_counter % snapshot_every == 0 {
                    room.broadcast_snapshot();
                }
                room.broadcast_pending_events();
                room.reap_grace();
                if room.should_shutdown() {
                    break;
                }
            }
        }
    }
    room.cleanup();
}
