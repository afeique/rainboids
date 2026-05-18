//! Phase-3 multiplayer room actor — drives the deterministic mp1
//! sim. Single global room (matchmaking is Phase 5). Wraps a
//! `rainboids_sim::mp1::state::RoomState` and ticks it at 60 Hz.
//!
//! Architectural shape vs Phase 2:
//!
//! - **Ship state moved out of `Slot`** — ships now live in
//!   `room_state.ships: Vec<ShipState>` keyed by `player_id`. `Slot`
//!   keeps only the per-connection metadata (outbound channel,
//!   latest input, last input tick).
//! - **Enemies / asteroids / bullets** all live in `room_state` too.
//!   Server is authoritative; clients reconstruct from spawn events
//!   + the deterministic sim (no per-snapshot entity state for the
//!   deterministic kinds).
//! - **Events**: every tick that produced sim events (spawn, hit,
//!   destroy, damage) is broadcast as a `ServerMsg::Event` frame
//!   coincident with the next snapshot.
//! - **StateChecksum**: every 60 ticks (~1 Hz) broadcast a small
//!   hash of deterministic state. Client requests `Resync` on
//!   mismatch.
//!
//! Per the Phase 3 plan: full determinism + safety net. See
//! `docs/Multiplayer WASM Pivot Phase 3 – 2026-05-17.md`.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::time::Duration;

use rainboids_sim::mp1::{
    asteroid::{self, AsteroidState, MIN_AST_RAD},
    bullet::{self, BulletState, BULLET_SPEED},
    codec,
    collision::{self, CollisionEvent},
    damage::{self, REVIVE_RADIUS},
    enemy::{self, EnemyState, KIND_HUNTER},
    ship::update_ship,
    state::{RoomState, ShipState, FIELD_HEIGHT, FIELD_WIDTH, SHIP_SIZE},
    trig::{cos64, sin64},
    wire::{
        AsteroidWire, BulletWire, ClientMsg, EnemyWire, EventPayload, ServerMsg, SnapshotShip,
    },
    PlayerInput,
};
use tokio::sync::{mpsc, Mutex};
use tokio::time::{interval, MissedTickBehavior};

/// Simulation tick rate (Hz). Matches the mp1 ship physics calibration.
const SIM_HZ: u64 = 60;

/// Snapshot broadcast divisor: every Nth tick we encode + send a
/// `Snapshot` to all connected players. 60 / 3 = 20 Hz snapshots.
const SNAPSHOT_DIVISOR: u32 = 3;

/// StateChecksum broadcast divisor: every Nth tick we send the
/// safety heartbeat. 60 ticks ≈ 1 Hz.
const CHECKSUM_DIVISOR: u32 = 60;

/// Initial asteroid count at room boot. Matches solo's lighter
/// per-wave start; Phase 3 has no waves yet.
const INITIAL_ASTEROIDS: usize = 4;

/// Enemy spawn cadence (ticks between spawns).
const ENEMY_SPAWN_PERIOD: u32 = 600; // 10 s at 60 Hz

/// PULSE_CANNON fire rate. Solo's `PULSE_CANNON.fireRateMs = 400` →
/// 400 ms = 24 ticks at 60 Hz.
const PULSE_CANNON_COOLDOWN_TICKS: u32 = 24;

/// Per-connection metadata. Ship state lives in `room_state.ships`,
/// indexed by `player_id`.
pub struct Slot {
    pub player_id: u32,
    pub latest_input: PlayerInput,
    pub last_input_tick: u32,
    /// Last tick we spawned a bullet for this player — gates fire
    /// rate against PULSE_CANNON_COOLDOWN_TICKS.
    pub last_fire_tick: u32,
    /// Outbound queue back to this connection's WS writer.
    pub out_tx: mpsc::UnboundedSender<Vec<u8>>,
}

/// Authoritative room state. Wraps the canonical `RoomState` from
/// the sim crate (the actual entity vecs + RNG live there) plus
/// the per-connection slots.
pub struct Mp1RoomState {
    /// Canonical deterministic sim state. Authoritative on the
    /// server; mirrored on each client.
    pub room: RoomState,
    /// Next id to hand out on join. Starts at 1 so `0` is a sentinel.
    pub next_player_id: u32,
    /// Per-connection slot metadata, keyed by player_id.
    pub slots: HashMap<u32, Slot>,
    /// Pending events to flush as a single `ServerMsg::Event` frame
    /// at the end of this tick.
    pub pending_events: Vec<EventPayload>,
}

impl Mp1RoomState {
    /// Construct a fresh room. Seeds the sim's RNG from `seed`; the
    /// server typically picks this at boot time and broadcasts it to
    /// each joining client via `Welcome.rng_seed`.
    pub fn from_seed(seed: u64) -> Self {
        let mut s = Self {
            room: RoomState::from_seed(seed),
            next_player_id: 1,
            slots: HashMap::new(),
            pending_events: Vec::new(),
        };
        s.seed_initial_asteroids();
        s
    }

    /// Boot the room with a handful of asteroids drifting around.
    /// Each AsteroidSpawn event is queued for the first Event broadcast
    /// so any client joining before tick > 0 still sees them.
    fn seed_initial_asteroids(&mut self) {
        for _ in 0..INITIAL_ASTEROIDS {
            let id = self.room.next_asteroid_id;
            self.room.next_asteroid_id += 1;
            let sub_seed = self.room.rng.sub_seed();
            let a = asteroid::spawn_from_seed(
                id,
                sub_seed,
                self.room.field_w,
                self.room.field_h,
            );
            self.room.asteroids.push(a);
            self.pending_events.push(EventPayload::AsteroidSpawn {
                asteroid_id: id,
                rng_subseed: sub_seed,
            });
        }
    }

    /// Create a new ship slot for a joining player. Returns the
    /// assigned `player_id`, spawn coords, and the room's RNG seed
    /// (for `Welcome.rng_seed` so the client can mirror the stream).
    pub fn join(
        &mut self,
        seed: u64,
        out_tx: mpsc::UnboundedSender<Vec<u8>>,
    ) -> (u32, f64, f64, u64) {
        let pid = self.next_player_id;
        self.next_player_id = self.next_player_id.wrapping_add(1);

        // Spawn placement: first player at field center, additional
        // players offset by 100 px along x so two tabs are visibly
        // side by side. Phase 5+ adds proper safe-spawn search.
        let n = self.room.ships.len() as f64;
        let spawn_x = FIELD_WIDTH * 0.5 + (n - 0.5) * 100.0;
        let spawn_y = FIELD_HEIGHT * 0.5;

        let mut ship = ShipState::default();
        ship.player_id = pid;
        ship.x = spawn_x;
        ship.y = spawn_y;
        ship.radius = SHIP_SIZE * 0.5;
        self.room.ships.push(ship);

        let slot = Slot {
            player_id: pid,
            latest_input: PlayerInput::neutral(),
            last_input_tick: 0,
            last_fire_tick: 0,
            out_tx,
        };
        self.slots.insert(pid, slot);

        (pid, spawn_x, spawn_y, seed)
    }

    /// Remove a player's slot AND their ship from the room state.
    /// Caller fans out the resulting `PeerLeft` event.
    pub fn leave(&mut self, player_id: u32) {
        self.slots.remove(&player_id);
        self.room.ships.retain(|s| s.player_id != player_id);
    }

    /// Apply a freshly decoded `Input` message to the named player's
    /// slot. Updates slot.latest_input + slot.last_input_tick.
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

    /// Advance one simulation tick. The full Phase-3 pipeline:
    /// inputs → ship physics → enemy AI → asteroid drift → bullet
    /// integration → fire spawn → enemy spawn → collision →
    /// revive ticking → cull dead.
    pub fn step(&mut self) {
        // 1. Ship physics — drive each ship from its slot's input.
        for ship in self.room.ships.iter_mut() {
            if let Some(slot) = self.slots.get(&ship.player_id) {
                let input = if ship.downed {
                    // Downed ships ignore movement input (caller may
                    // still update slot.latest_input but the ship
                    // doesn't react).
                    PlayerInput::neutral()
                } else {
                    slot.latest_input
                };
                update_ship(ship, &input, self.room.field_w, self.room.field_h, 0.0);
            }
        }

        // 2. Enemy AI — build target views from current alive ships.
        let targets: Vec<enemy::TargetView> = self
            .room
            .ships
            .iter()
            .map(|s| enemy::TargetView {
                player_id: s.player_id,
                x: s.x,
                y: s.y,
                alive: s.active && !s.downed,
            })
            .collect();
        for e in self.room.enemies.iter_mut() {
            enemy::update_enemy(e, &targets, self.room.field_w, self.room.field_h);
        }

        // 3. Asteroid drift.
        for a in self.room.asteroids.iter_mut() {
            asteroid::update_asteroid(a, self.room.field_w, self.room.field_h);
        }

        // 4. Bullet integration.
        for b in self.room.bullets.iter_mut() {
            bullet::update_bullet(b, self.room.tick, self.room.field_w, self.room.field_h);
        }

        // 5. Fire input → bullet spawns. Edge-detect plus cooldown.
        self.process_fire_inputs();

        // 6. Enemy spawn cadence.
        if self.room.tick >= self.room.enemy_spawn_at_tick
            && self.room.enemies.len() < rainboids_sim::mp1::state::MAX_ENEMIES
        {
            self.spawn_enemy();
            self.room.enemy_spawn_at_tick = self
                .room
                .tick
                .wrapping_add(ENEMY_SPAWN_PERIOD);
        }

        // 7. Collision detection — mutates entity state + emits events.
        let mut coll_events: Vec<CollisionEvent> = Vec::new();
        let added_child_ids = collision::run_collisions(
            &mut self.room.ships,
            &mut self.room.enemies,
            &mut self.room.asteroids,
            &mut self.room.bullets,
            self.room.tick,
            &mut self.room.rng,
            self.room.next_asteroid_id,
            &mut coll_events,
        );
        self.room.next_asteroid_id = self
            .room
            .next_asteroid_id
            .wrapping_add(added_child_ids);

        // 8. Map collision events → wire events; child asteroids
        //    pushed into room state.
        let kill_tick = self.room.tick;
        for ev in coll_events {
            self.translate_collision_event(ev, kill_tick);
        }

        // 9. Revive ticking — for each downed ship, count nearby
        //    alive ships and tick the meter.
        self.tick_revive_meters();

        // 10. Cull dead entities (active=false) to keep vecs tight.
        self.room.enemies.retain(|e| e.active);
        self.room.asteroids.retain(|a| a.active);
        self.room.bullets.retain(|b| b.active);

        self.room.tick = self.room.tick.wrapping_add(1);
    }

    /// Detect fire-input → spawn bullet (with cooldown). Spawns
    /// emit BulletSpawn events for client mirror.
    fn process_fire_inputs(&mut self) {
        let tick = self.room.tick;
        // Collect (player_id, spawn_params) pairs without borrowing
        // self.room.ships during the iteration that we mutate.
        let mut spawns: Vec<(u32, f64, f64, f64, f64)> = Vec::new();
        for slot in self.slots.values_mut() {
            if !slot.latest_input.fire {
                continue;
            }
            // Skip if downed or off cooldown.
            let ship = self
                .room
                .ships
                .iter()
                .find(|s| s.player_id == slot.player_id);
            let ship = match ship {
                Some(s) if s.active && !s.downed => s,
                _ => continue,
            };
            if tick.wrapping_sub(slot.last_fire_tick) < PULSE_CANNON_COOLDOWN_TICKS {
                continue;
            }
            slot.last_fire_tick = tick;
            // Origin: ship center. Direction: ship.angle.
            spawns.push((slot.player_id, ship.x, ship.y, ship.angle, ship.radius));
        }

        for (owner_pid, ox, oy, angle, _radius) in spawns {
            let id = self.room.next_bullet_id;
            self.room.next_bullet_id = self.room.next_bullet_id.wrapping_add(1);
            let vx = cos64(angle) * BULLET_SPEED;
            let vy = sin64(angle) * BULLET_SPEED;
            let b = BulletState::spawn(id, owner_pid, ox, oy, angle, tick);
            self.room.bullets.push(b);
            self.pending_events.push(EventPayload::BulletSpawn {
                bullet_id: id,
                owner_player_id: owner_pid,
                origin_x: ox,
                origin_y: oy,
                vx,
                vy,
                spawn_tick: tick,
                weapon: 0, // PULSE_CANNON
            });
        }
    }

    /// Spawn one HUNTER enemy via the deterministic spawn helper.
    fn spawn_enemy(&mut self) {
        let id = self.room.next_enemy_id;
        self.room.next_enemy_id = self.room.next_enemy_id.wrapping_add(1);
        let sub_seed = self.room.rng.sub_seed();
        let e = enemy::spawn_hunter_from_seed(
            id,
            sub_seed,
            self.room.field_w,
            self.room.field_h,
        );
        self.room.enemies.push(e);
        self.pending_events.push(EventPayload::EnemySpawn {
            enemy_id: id,
            kind: KIND_HUNTER,
            rng_subseed: sub_seed,
        });
    }

    /// Convert one CollisionEvent into wire EventPayload(s) and push
    /// child asteroids spawned by splits into room state.
    fn translate_collision_event(&mut self, ev: CollisionEvent, kill_tick: u32) {
        match ev {
            CollisionEvent::BulletHit {
                bullet_id,
                hit_x,
                hit_y,
            } => {
                // target_kind / target_id are not currently carried by
                // CollisionEvent::BulletHit (the collision module emits
                // a BulletHit event PLUS a separate EnemyDestroyed or
                // AsteroidDestroyed event when the target died). For
                // the wire BulletHit we don't know which kind hit;
                // mark as "unknown" (255) — client only uses it for
                // cosmetic spark + bullet despawn. Phase 4 can enrich
                // CollisionEvent::BulletHit with target metadata if
                // needed.
                self.pending_events.push(EventPayload::BulletHit {
                    bullet_id,
                    target_kind: 255,
                    target_id: 0,
                    hit_tick: kill_tick,
                    hit_x,
                    hit_y,
                });
            }
            CollisionEvent::EnemyDestroyed {
                enemy_id,
                by_bullet_id,
                x,
                y,
                kind,
            } => {
                self.pending_events.push(EventPayload::EnemyDestroy {
                    enemy_id,
                    by_bullet_id,
                    kill_tick,
                    x,
                    y,
                    kind,
                });
            }
            CollisionEvent::AsteroidDestroyed {
                asteroid_id,
                x,
                y,
                split_subseed,
                child_id_start,
                children,
            } => {
                // Push children into the room's asteroid vec; client
                // computes the same children locally from sub_seed.
                for c in children {
                    self.room.asteroids.push(c);
                }
                self.pending_events.push(EventPayload::AsteroidSplit {
                    parent_id: asteroid_id,
                    kill_tick,
                    x,
                    y,
                    rng_subseed: split_subseed,
                    child_id_start,
                });
            }
            CollisionEvent::ShipDamaged {
                player_id,
                by_kind,
                by_id,
                amount,
                x,
                y,
            } => {
                self.pending_events.push(EventPayload::ShipDamaged {
                    player_id,
                    by_kind,
                    by_id,
                    hit_tick: kill_tick,
                    amount,
                    x,
                    y,
                });
            }
            CollisionEvent::ShipDowned {
                player_id,
                at_x,
                at_y,
            } => {
                self.pending_events.push(EventPayload::ShipDowned {
                    player_id,
                    at_tick: kill_tick,
                    x: at_x,
                    y: at_y,
                });
            }
        }
    }

    /// For each downed ship: count nearby alive revivers, tick the
    /// revive meter, and emit ShipRevived event on completion.
    fn tick_revive_meters(&mut self) {
        // Snapshot positions to avoid borrow issues.
        let positions: Vec<(u32, f64, f64, bool, bool)> = self
            .room
            .ships
            .iter()
            .map(|s| (s.player_id, s.x, s.y, s.active, s.downed))
            .collect();

        let mut just_revived: Vec<u32> = Vec::new();
        for ship in self.room.ships.iter_mut() {
            if !ship.downed {
                continue;
            }
            // Eligible revivers: every OTHER ship that's active + not downed,
            // within REVIVE_RADIUS.
            let others: Vec<(f64, f64, bool, bool)> = positions
                .iter()
                .filter(|(pid, _, _, _, _)| *pid != ship.player_id)
                .map(|&(_, x, y, a, d)| (x, y, a, d))
                .collect();
            let nearby = damage::count_eligible_revivers(ship.x, ship.y, &others);
            let outcome = damage::tick_revive_meter(ship, nearby);
            if matches!(outcome, damage::ReviveOutcome::JustRevived) {
                damage::revive_ship(ship);
                just_revived.push(ship.player_id);
            }
        }
        // Emit ShipRevived events for each newly-revived ship.
        let revive_tick = self.room.tick;
        for pid in just_revived {
            // by_player_id: pick any nearby reviver. For Phase 3,
            // we just attribute to "the first eligible reviver" —
            // good enough for the wire event; HUD can credit any of
            // the actual revivers.
            let by_pid = positions
                .iter()
                .find(|(p, x, y, a, d)| {
                    *p != pid && *a && !*d && {
                        let target = positions.iter().find(|(tp, _, _, _, _)| *tp == pid);
                        if let Some(&(_, tx, ty, _, _)) = target {
                            let dx = *x - tx;
                            let dy = *y - ty;
                            dx * dx + dy * dy <= REVIVE_RADIUS * REVIVE_RADIUS
                        } else {
                            false
                        }
                    }
                })
                .map(|&(p, _, _, _, _)| p)
                .unwrap_or(0);
            self.pending_events.push(EventPayload::ShipRevived {
                revived_player_id: pid,
                by_player_id: by_pid,
                at_tick: revive_tick,
            });
        }
    }

    /// Build the Snapshot payload for one receiver. Phase 3 carries
    /// ships only; deterministic kinds (enemies, asteroids, bullets)
    /// are reconstructed client-side from events.
    pub fn snapshot_for(&self, receiver_pid: u32) -> ServerMsg {
        let ships = self
            .room
            .ships
            .iter()
            .map(|s| SnapshotShip {
                player_id: s.player_id,
                x: s.x,
                y: s.y,
                vx: s.vx,
                vy: s.vy,
                angle: s.angle,
            })
            .collect();
        let acked = self
            .slots
            .get(&receiver_pid)
            .map(|s| s.last_input_tick)
            .unwrap_or(0);
        ServerMsg::Snapshot {
            tick: self.room.tick,
            acked_input_tick: acked,
            ships,
        }
    }

    /// Build the periodic StateChecksum heartbeat. Hashes ship +
    /// enemy + asteroid + bullet state into four u64s; client computes
    /// the same hashes over its predicted state and Resyncs on mismatch.
    pub fn build_checksum(&self) -> ServerMsg {
        ServerMsg::StateChecksum {
            tick: self.room.tick,
            ships_hash: hash_ships(&self.room.ships),
            enemies_hash: hash_enemies(&self.room.enemies),
            asteroids_hash: hash_asteroids(&self.room.asteroids),
            bullets_hash: hash_bullets(&self.room.bullets),
        }
    }

    /// Build the one-shot Resync payload — full state of every
    /// deterministic entity + the current RNG seed-equivalent so
    /// the client can re-bootstrap. We don't carry the *current*
    /// PCG-64 internal state on the wire (it's not serializable
    /// here); instead we re-seed clients from the room's original
    /// `Welcome.rng_seed` and rely on the event replay to bring
    /// the stream forward. Phase 5+ will harden this with a proper
    /// RNG-state snapshot if needed.
    pub fn build_resync(&self, rng_seed: u64) -> ServerMsg {
        ServerMsg::Resync {
            tick: self.room.tick,
            rng_seed,
            ships: self
                .room
                .ships
                .iter()
                .map(|s| SnapshotShip {
                    player_id: s.player_id,
                    x: s.x,
                    y: s.y,
                    vx: s.vx,
                    vy: s.vy,
                    angle: s.angle,
                })
                .collect(),
            enemies: self
                .room
                .enemies
                .iter()
                .map(|e| EnemyWire {
                    id: e.id,
                    kind: e.kind,
                    x: e.x,
                    y: e.y,
                    vx: e.vx,
                    vy: e.vy,
                    angle: e.angle,
                    hp: e.hp,
                    max_hp: e.max_hp,
                    radius: e.radius,
                    arc_dir: e.arc_dir,
                    arc_radius: e.arc_radius,
                    arc_omega: e.arc_omega,
                    arc_phase: e.arc_phase,
                })
                .collect(),
            asteroids: self
                .room
                .asteroids
                .iter()
                .map(|a| AsteroidWire {
                    id: a.id,
                    x: a.x,
                    y: a.y,
                    vx: a.vx,
                    vy: a.vy,
                    rot: a.rot,
                    rot_vel: a.rot_vel,
                    radius: a.radius,
                    base_radius: a.base_radius,
                    hp: a.hp,
                    max_hp: a.max_hp,
                })
                .collect(),
            bullets: self
                .room
                .bullets
                .iter()
                .map(|b| BulletWire {
                    id: b.id,
                    owner_player_id: b.owner_player_id,
                    origin_x: b.origin_x,
                    origin_y: b.origin_y,
                    vx: b.vx,
                    vy: b.vy,
                    spawn_tick: b.spawn_tick,
                    life_remaining: b.life_remaining,
                })
                .collect(),
        }
    }

    /// Broadcast a snapshot to every connected slot. Each receiver
    /// gets a per-receiver `acked_input_tick`.
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

    /// Broadcast a generic ServerMsg to every connected slot.
    pub fn broadcast_to_all(&self, msg: &ServerMsg) {
        let bytes = match codec::encode_server(msg) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(error = %e, "mp1: encode failed");
                return;
            }
        };
        for slot in self.slots.values() {
            let _ = slot.out_tx.send(bytes.clone());
        }
    }

    /// Broadcast a `PeerJoined` / `PeerLeft` event to every slot
    /// except the optionally-excluded one.
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

    /// Flush pending sim events as a single `ServerMsg::Event` frame
    /// to all slots. Called once per tick after `step()`. Clears the
    /// pending queue.
    pub fn flush_events(&mut self) {
        if self.pending_events.is_empty() {
            return;
        }
        let msg = ServerMsg::Event {
            tick: self.room.tick,
            payloads: std::mem::take(&mut self.pending_events),
        };
        self.broadcast_to_all(&msg);
    }

    /// Reply to a single client's Resync request. Sends the full
    /// state payload directly to that slot only.
    pub fn send_resync_to(&self, player_id: u32, rng_seed: u64) {
        if let Some(slot) = self.slots.get(&player_id) {
            let msg = self.build_resync(rng_seed);
            match codec::encode_server(&msg) {
                Ok(bytes) => {
                    let _ = slot.out_tx.send(bytes);
                }
                Err(e) => {
                    tracing::warn!(
                        player_id,
                        error = %e,
                        "mp1: Resync encode failed"
                    );
                }
            }
        }
    }
}

// ── Hashing helpers for StateChecksum ──

fn hash_f64(state: &mut std::collections::hash_map::DefaultHasher, x: f64) {
    // Hash via raw bits — f64::to_bits is deterministic and stable
    // across runtimes (IEEE 754 layout).
    x.to_bits().hash(state);
}

fn hash_ships(ships: &[ShipState]) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for s in ships {
        s.player_id.hash(&mut h);
        hash_f64(&mut h, s.x);
        hash_f64(&mut h, s.y);
        hash_f64(&mut h, s.vx);
        hash_f64(&mut h, s.vy);
        hash_f64(&mut h, s.angle);
        hash_f64(&mut h, s.hp);
        s.downed.hash(&mut h);
    }
    h.finish()
}

fn hash_enemies(enemies: &[EnemyState]) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for e in enemies {
        e.id.hash(&mut h);
        e.kind.hash(&mut h);
        hash_f64(&mut h, e.x);
        hash_f64(&mut h, e.y);
        hash_f64(&mut h, e.hp);
        hash_f64(&mut h, e.arc_phase);
    }
    h.finish()
}

fn hash_asteroids(asteroids: &[AsteroidState]) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for a in asteroids {
        a.id.hash(&mut h);
        hash_f64(&mut h, a.x);
        hash_f64(&mut h, a.y);
        hash_f64(&mut h, a.rot);
        hash_f64(&mut h, a.hp);
    }
    h.finish()
}

fn hash_bullets(bullets: &[BulletState]) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for b in bullets {
        b.id.hash(&mut h);
        b.owner_player_id.hash(&mut h);
        hash_f64(&mut h, b.origin_x);
        hash_f64(&mut h, b.origin_y);
        b.spawn_tick.hash(&mut h);
        b.life_remaining.hash(&mut h);
    }
    h.finish()
}

// Avoid the unused MIN_AST_RAD warning by referencing it once at the
// module level (used in collision; we re-import for completeness).
const _: f64 = MIN_AST_RAD;

/// Cloneable handle for connection tasks. The room's seed is stored
/// here so the connection task can include it in `Welcome.rng_seed`
/// without re-locking the state.
#[derive(Clone)]
pub struct Mp1RoomHandle {
    pub state: Arc<Mutex<Mp1RoomState>>,
    pub cmd_tx: mpsc::UnboundedSender<RoomCmd>,
    /// Room's RNG seed. Sent to clients in Welcome so they can mirror
    /// the deterministic stream. Picked once at `spawn()`.
    pub rng_seed: u64,
}

/// Commands the connection task posts into the room actor.
pub enum RoomCmd {
    Input { player_id: u32, msg: ClientMsg },
    Leave { player_id: u32 },
    /// Client requested a full-state Resync (checksum miss).
    /// Reply goes only to the requesting connection.
    Resync { player_id: u32 },
}

impl Mp1RoomHandle {
    /// Spawn the room actor with a fresh seed. The seed is derived
    /// from `SystemTime` at server boot — deterministic within a
    /// single server lifetime, fresh across restarts.
    pub fn spawn() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0xC0FFEE);
        Self::spawn_with_seed(seed)
    }

    /// Spawn with an explicit seed — used by tests for reproducibility.
    pub fn spawn_with_seed(seed: u64) -> Self {
        let state = Arc::new(Mutex::new(Mp1RoomState::from_seed(seed)));
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<RoomCmd>();
        let state_for_task = state.clone();

        tokio::spawn(async move {
            let tick_period = Duration::from_micros(1_000_000 / SIM_HZ);
            let mut tick_iv = interval(tick_period);
            tick_iv.set_missed_tick_behavior(MissedTickBehavior::Burst);

            loop {
                tokio::select! {
                    biased;
                    _ = tick_iv.tick() => {
                        let mut s = state_for_task.lock().await;
                        while let Ok(cmd) = cmd_rx.try_recv() {
                            apply_cmd(&mut s, cmd, seed);
                        }
                        s.step();
                        s.flush_events();
                        if s.room.tick % SNAPSHOT_DIVISOR == 0 {
                            s.broadcast_snapshot();
                        }
                        if s.room.tick % CHECKSUM_DIVISOR == 0 {
                            let cs = s.build_checksum();
                            s.broadcast_to_all(&cs);
                        }
                    }
                    Some(cmd) = cmd_rx.recv() => {
                        let mut s = state_for_task.lock().await;
                        apply_cmd(&mut s, cmd, seed);
                    }
                }
            }
        });

        Self { state, cmd_tx, rng_seed: seed }
    }
}

fn apply_cmd(s: &mut Mp1RoomState, cmd: RoomCmd, room_seed: u64) {
    match cmd {
        RoomCmd::Input { player_id, msg } => s.apply_input(player_id, msg),
        RoomCmd::Leave { player_id } => {
            s.leave(player_id);
            let evt = ServerMsg::PeerLeft { player_id };
            s.broadcast_peer_event(&evt, Some(player_id));
        }
        RoomCmd::Resync { player_id } => {
            s.send_resync_to(player_id, room_seed);
        }
    }
}
