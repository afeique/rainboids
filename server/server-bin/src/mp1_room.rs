//! Phase-2 multiplayer room actor. Lives as a single global room
//! (no matchmaking yet — Phase 5). Wraps a multi-ship state derived
//! from `rainboids_sim::mp1`, accepts inputs by `player_id`, ticks at
//! 60 Hz, broadcasts `Snapshot`s at 20 Hz.
//!
//! Parallel to the legacy `room/mod.rs` (which serves `/ws`). This
//! actor lives at `/mp/ws` and uses the fresh `mp1` wire format
//! throughout. It is intentionally simpler than the legacy room:
//! no `Matchmaker` integration, no `SessionRegistry`, no grace timer,
//! no `PeerInfo`, no RNG (no random spawns yet) — see
//! `docs/Multiplayer WASM Pivot Phase 2 – 2026-05-17.md`.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use rainboids_sim::mp1::{
    codec,
    ship::update_ship,
    state::{FIELD_HEIGHT, FIELD_WIDTH, SHIP_SIZE},
    wire::{ClientMsg, ServerMsg, SnapshotShip},
    PlayerInput, ShipState,
};
use tokio::sync::{mpsc, Mutex};
use tokio::time::{interval, MissedTickBehavior};

/// Simulation tick rate (Hz). Matches the mp1 ship physics calibration.
const SIM_HZ: u64 = 60;
/// Snapshot broadcast divisor: every Nth tick we encode + send a
/// `Snapshot` to all connected players. 60 / 3 = 20 Hz snapshots.
const SNAPSHOT_DIVISOR: u32 = 3;

/// One occupied slot in the room. Owns the ship state, the latest
/// input observed from this player, and the outbound channel back to
/// the connection task that owns this slot's WebSocket writer.
pub struct Slot {
    /// Server-assigned id this player was issued in `Welcome`.
    pub player_id: u32,
    /// Authoritative ship physics state for this player.
    pub ship: ShipState,
    /// Most recently received input from this player (replayed each
    /// tick until a newer one arrives).
    pub latest_input: PlayerInput,
    /// `client_tick` from the last `Input` we applied — echoed back
    /// in `Snapshot::acked_input_tick` so Phase 4 prediction can
    /// reconcile against the right server tick.
    pub last_input_tick: u32,
    /// Sender end of the per-connection outbound queue. The connection
    /// task drains this and forwards bytes to its WS writer.
    pub out_tx: mpsc::UnboundedSender<Vec<u8>>,
}

/// Authoritative multi-ship state held inside the room actor's
/// `Arc<Mutex<…>>`. The legacy server's `Room` struct keeps far more
/// (RNG, encode buffer, grace timers, etc.); Phase 2 deliberately
/// stays minimal.
pub struct Mp1RoomState {
    /// Monotonically increasing tick counter — wraps at `u32::MAX`
    /// (same convention as `mp1::state::GameState::tick`).
    pub tick: u32,
    /// Next id to hand out on join. Starts at 1 so `0` can serve as
    /// a sentinel client-side.
    pub next_player_id: u32,
    /// All currently connected players, keyed by their assigned id.
    pub slots: HashMap<u32, Slot>,
}

impl Mp1RoomState {
    /// Construct an empty room.
    pub fn new() -> Self {
        Self {
            tick: 0,
            next_player_id: 1,
            slots: HashMap::new(),
        }
    }

    /// Create a new slot for a joining player. Returns the assigned
    /// `player_id` and the spawn coordinates the connection task
    /// should put in the `Welcome`.
    ///
    /// Spawn placement is intentionally crude for Phase 2: the first
    /// player lands at field center, additional players are offset by
    /// 100 px along the x axis so two browser tabs are visibly side
    /// by side. Phase 3+ will move to a proper safe-spawn search.
    pub fn join(&mut self, out_tx: mpsc::UnboundedSender<Vec<u8>>) -> (u32, f64, f64) {
        let pid = self.next_player_id;
        self.next_player_id = self.next_player_id.wrapping_add(1);

        let n = self.slots.len() as f64;
        let spawn_x = FIELD_WIDTH * 0.5 + (n - 0.5) * 100.0;
        let spawn_y = FIELD_HEIGHT * 0.5;

        let mut ship = ShipState::default();
        ship.x = spawn_x;
        ship.y = spawn_y;
        ship.radius = SHIP_SIZE * 0.5;

        let slot = Slot {
            player_id: pid,
            ship,
            latest_input: PlayerInput::neutral(),
            last_input_tick: 0,
            out_tx,
        };
        self.slots.insert(pid, slot);
        (pid, spawn_x, spawn_y)
    }

    /// Remove a player's slot. Caller is responsible for fanning out
    /// the resulting `PeerLeft` event to surviving slots.
    pub fn leave(&mut self, player_id: u32) {
        self.slots.remove(&player_id);
    }

    /// Apply a freshly decoded `Input` message to the named player's
    /// slot. Other `ClientMsg` variants (Hello, Bye) are no-ops at the
    /// state level and are handled in the connection task.
    pub fn apply_input(&mut self, player_id: u32, msg: ClientMsg) {
        if let ClientMsg::Input {
            client_tick,
            up,
            down,
            left,
            right,
            aim_x,
            aim_y,
        } = msg
        {
            if let Some(slot) = self.slots.get_mut(&player_id) {
                slot.latest_input.up = up;
                slot.latest_input.down = down;
                slot.latest_input.left = left;
                slot.latest_input.right = right;
                slot.latest_input.aim_x = aim_x;
                slot.latest_input.aim_y = aim_y;
                slot.last_input_tick = client_tick;
            }
        }
    }

    /// Advance one simulation tick. Each slot's `latest_input` is
    /// replayed against its `ship` until a new `Input` overwrites it.
    /// `dt` is passed as 0.0 because `update_ship` works in per-tick
    /// deltas (see `mp1::ship` doc).
    pub fn step(&mut self) {
        for slot in self.slots.values_mut() {
            update_ship(
                &mut slot.ship,
                &slot.latest_input,
                FIELD_WIDTH,
                FIELD_HEIGHT,
                0.0,
            );
        }
        self.tick = self.tick.wrapping_add(1);
    }

    /// Build the snapshot variant targeted at one specific receiver.
    /// The `ships` payload is identical across receivers in Phase 2;
    /// only `acked_input_tick` is per-receiver so each client sees
    /// the server's acknowledgment of *its own* most recent input.
    pub fn snapshot_for(&self, receiver_pid: u32) -> ServerMsg {
        let ships = self
            .slots
            .values()
            .map(|s| SnapshotShip {
                player_id: s.player_id,
                x: s.ship.x,
                y: s.ship.y,
                vx: s.ship.vx,
                vy: s.ship.vy,
                angle: s.ship.angle,
            })
            .collect();
        let acked = self
            .slots
            .get(&receiver_pid)
            .map(|s| s.last_input_tick)
            .unwrap_or(0);
        ServerMsg::Snapshot {
            tick: self.tick,
            acked_input_tick: acked,
            ships,
        }
    }

    /// Broadcast a snapshot to every connected slot. Each receiver
    /// gets a per-receiver `acked_input_tick` (see `snapshot_for`).
    /// Send failures are logged at debug level and otherwise ignored —
    /// the connection task is responsible for noticing its WS is dead.
    pub fn broadcast_snapshot(&self) {
        for (pid, slot) in &self.slots {
            let msg = self.snapshot_for(*pid);
            match codec::encode_server(&msg) {
                Ok(bytes) => {
                    let _ = slot.out_tx.send(bytes);
                }
                Err(e) => {
                    tracing::warn!(player_id = pid, error = %e, "mp1: snapshot encode failed");
                }
            }
        }
    }

    /// Broadcast a `PeerJoined` / `PeerLeft` event to every slot
    /// except (optionally) the affected player itself — the joiner
    /// gets `Welcome` instead, and the leaver is already gone.
    pub fn broadcast_peer_event(&self, msg: &ServerMsg, exclude: Option<u32>) {
        let bytes = match codec::encode_server(msg) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(error = %e, "mp1: peer-event encode failed");
                return;
            }
        };
        for (pid, slot) in &self.slots {
            if Some(*pid) == exclude {
                continue;
            }
            let _ = slot.out_tx.send(bytes.clone());
        }
    }
}

impl Default for Mp1RoomState {
    fn default() -> Self {
        Self::new()
    }
}

/// Cloneable handle for connection tasks. Each connection task takes
/// the `state` lock to perform its own `join` (so it can read back
/// the assigned `player_id` and spawn coordinates) and pushes
/// per-frame `Input` / `Leave` commands through `cmd_tx`. The room
/// task drains the queue at the top of every tick.
#[derive(Clone)]
pub struct Mp1RoomHandle {
    /// Shared room state. Connection tasks hold this briefly during
    /// `join` to assign an id atomically; the room task holds it
    /// during each tick's drain + step + broadcast.
    pub state: Arc<Mutex<Mp1RoomState>>,
    /// Inbound command channel into the room actor.
    pub cmd_tx: mpsc::UnboundedSender<RoomCmd>,
}

/// Commands the connection task posts into the room actor.
pub enum RoomCmd {
    /// Apply a freshly decoded `Input` to the named slot.
    Input { player_id: u32, msg: ClientMsg },
    /// Player disconnected — drop their slot and notify peers.
    Leave { player_id: u32 },
}

impl Mp1RoomHandle {
    /// Spawn the room actor task and return a handle to it. Called
    /// once at server startup; the resulting handle is cloned into
    /// axum's `AppState` (orchestrator wires that up).
    pub fn spawn() -> Self {
        let state = Arc::new(Mutex::new(Mp1RoomState::new()));
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<RoomCmd>();
        let state_for_task = state.clone();

        tokio::spawn(async move {
            let tick_period = Duration::from_micros(1_000_000 / SIM_HZ);
            let mut tick_iv = interval(tick_period);
            // Burst: if the executor stalls (e.g. heavy GC in another
            // task) we'd rather catch up than skip ticks silently.
            tick_iv.set_missed_tick_behavior(MissedTickBehavior::Burst);

            loop {
                tokio::select! {
                    biased;
                    _ = tick_iv.tick() => {
                        let mut s = state_for_task.lock().await;
                        // Drain any queued commands without blocking.
                        while let Ok(cmd) = cmd_rx.try_recv() {
                            apply_cmd(&mut s, cmd);
                        }
                        s.step();
                        if s.tick % SNAPSHOT_DIVISOR == 0 {
                            s.broadcast_snapshot();
                        }
                    }
                    Some(cmd) = cmd_rx.recv() => {
                        // Channel-driven backstop: if the interval is
                        // momentarily idle (shouldn't happen at 60Hz,
                        // but covers test pauses + suspended runtimes)
                        // we still apply commands so Leave/Input never
                        // get stuck waiting for the next tick.
                        let mut s = state_for_task.lock().await;
                        apply_cmd(&mut s, cmd);
                    }
                }
            }
        });

        Self { state, cmd_tx }
    }
}

/// Dispatch one queued command against the locked room state. Pulled
/// out of the actor loop so both the tick-drain path and the
/// channel-driven backstop path apply identical semantics.
fn apply_cmd(s: &mut Mp1RoomState, cmd: RoomCmd) {
    match cmd {
        RoomCmd::Input { player_id, msg } => s.apply_input(player_id, msg),
        RoomCmd::Leave { player_id } => {
            s.leave(player_id);
            let evt = ServerMsg::PeerLeft { player_id };
            s.broadcast_peer_event(&evt, Some(player_id));
        }
    }
}
