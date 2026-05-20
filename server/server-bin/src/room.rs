//! Phase-3 multiplayer room actor — drives the deterministic sim
//! sim. Single global room (matchmaking is Phase 5). Wraps a
//! `rainboids_sim::state::RoomState` and ticks it at 60 Hz.
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

use rainboids_sim::{
    asteroid::{self, AsteroidState, MIN_AST_RAD},
    bullet::{self, BulletState, BULLET_SPEED},
    codec,
    collision::{self, CollisionEvent},
    damage::{self, REVIVE_RADIUS},
    drops::{self, OrbState, ORB_KIND_GOLD, ORB_KIND_HEALTH},
    enemy::{self, EnemyState, KIND_HUNTER},
    enemy_bullet,
    enemy_bullet_patterns,
    enemy_drifter,
    enemy_guardian::{self, GUARDIAN_FIRE_COOLDOWN_TICKS, GUARDIAN_SPREAD_COUNT,
        GUARDIAN_SPREAD_RADIANS},
    enemy_mine::{self, EnemyMineState},
    enemy_missile::{self, EnemyMissileState},
    enemy_prowler::{self, PROWLER_FIRE_COOLDOWN_TICKS},
    enemy_sentinel::{self, SENTINEL_FIRE_COOLDOWN_TICKS},
    enemy_stalker::{self, STALKER_FIRE_COOLDOWN_TICKS},
    enemy_tangerine::{self, TANGERINE_MINE_COOLDOWN_TICKS},
    enemy_titan::{self, TITAN_BULLET_DAMAGE, TITAN_BULLET_RADIUS},
    enemy_wasp::{self, WASP_FIRE_COOLDOWN_TICKS},
    enemy_weaver::{self, WEAVER_FIRE_COOLDOWN_TICKS},
    enemy_drifter::DRIFTER_FIRE_COOLDOWN_TICKS,
    player_mine::{self, PlayerMineState},
    player_missile::{self, PlayerMissileState},
    power_weapon,
    power_weapon_charge_shot,
    power_weapon_lance_beam,
    power_weapon_lightning_arc,
    power_weapon_mine_layer,
    power_weapon_missile_salvo,
    power_weapon_nova_blast,
    ship::update_ship,
    state::{
        RoomState, ShipState, FIELD_HEIGHT, FIELD_WIDTH, MAX_ENEMY_BULLETS, MAX_ENEMY_MINES,
        MAX_ENEMY_MISSILES, MAX_ORBS, MAX_PLAYER_MINES, MAX_PLAYER_MISSILES, SHIP_SIZE,
    },
    trig::{atan2_64, cos64, sin64},
    wave::{self, WaveConfig, WavePhase, WaveSpawnRequest},
    wave_table::{
        self, KIND_DRIFTER as TABLE_KIND_DRIFTER, KIND_GUARDIAN as TABLE_KIND_GUARDIAN,
        KIND_HUNTER as TABLE_KIND_HUNTER, KIND_PROWLER as TABLE_KIND_PROWLER,
        KIND_SENTINEL as TABLE_KIND_SENTINEL, KIND_STALKER as TABLE_KIND_STALKER,
        KIND_TANGERINE as TABLE_KIND_TANGERINE, KIND_TITAN as TABLE_KIND_TITAN,
        KIND_WASP as TABLE_KIND_WASP, KIND_WEAVER as TABLE_KIND_WEAVER,
    },
    weapon as sim_weapon,
    wire::{
        AsteroidWire, BulletWire, ClientMsg, EnemyBulletWire, EnemyMineWire, EnemyMissileWire,
        EnemyWire, EventPayload, OrbWire, ServerMsg, SnapshotShip,
    },
    PlayerInput,
};
use tokio::sync::{mpsc, Mutex};
use tokio::time::{interval, MissedTickBehavior};

/// Simulation tick rate (Hz). Matches the sim ship physics calibration.
const SIM_HZ: u64 = 60;

/// Snapshot broadcast divisor: every Nth tick we encode + send a
/// `Snapshot` to all connected players. 60 / 3 = 20 Hz snapshots.
const SNAPSHOT_DIVISOR: u32 = 3;

/// StateChecksum broadcast divisor: every Nth tick we send the
/// safety heartbeat. 60 ticks ≈ 1 Hz.
const CHECKSUM_DIVISOR: u32 = 60;

/// Enemy fire-rate cooldown (ticks). Solo HUNTER's cooldown is
/// 600–2200 ms randomized; Phase 4 step 1 uses a fixed 90 ticks
/// (1.5 s) for predictability. Per-enemy cooldown tuning lands in
/// Phase 4 step 5 alongside the other 9 enemy types.
const ENEMY_FIRE_COOLDOWN_TICKS: u32 = 90;

/// Drop probability — chance an enemy kill spawns a gold orb.
/// Mirrors solo's basic kill-drop rate (no PAYDAY etc. powerups).
const ENEMY_GOLD_DROP_CHANCE: f64 = 0.65;
/// Drop probability — chance an enemy kill spawns a health orb.
/// Lower than gold since health is the higher-value drop.
const ENEMY_HEALTH_DROP_CHANCE: f64 = 0.10;
/// Drop probability — chance a small asteroid (size tier) spawns
/// a gold orb on destruction.
const ASTEROID_GOLD_DROP_CHANCE: f64 = 0.35;

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
    /// Phase 4 step 6 — most recent `power_fire` bit from the client.
    /// `process_power_fire` reads this each tick and compares to
    /// `last_power_fire` for rising-edge detection (one activation per
    /// press, not one per tick held).
    pub latest_power_fire: bool,
    /// Phase 4 step 6 — most recent `power_weapon` kind from the client
    /// (see `power_weapon::KIND_*`). Persisted onto `ShipState.power_weapon_kind`
    /// in `apply_input` so Snapshot reflects HUD state on the receiver side.
    pub latest_power_weapon: u8,
    /// Phase 4 step 6 — prior tick's `latest_power_fire`, captured at the
    /// end of `process_power_fire` so the next tick can detect a rising
    /// edge (`!last_power_fire && latest_power_fire`).
    pub last_power_fire: bool,
}

/// Authoritative room state. Wraps the canonical `RoomState` from
/// the sim crate (the actual entity vecs + RNG live there) plus
/// the per-connection slots.
pub struct SimRoomState {
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

impl SimRoomState {
    /// Construct a fresh room. Seeds the sim's RNG from `seed`; the
    /// server typically picks this at boot time and broadcasts it to
    /// each joining client via `Welcome.rng_seed`.
    pub fn from_seed(seed: u64) -> Self {
        // Phase 4: room boots with NO asteroids — they spawn at
        // WaveStart (Intro → Spawning transition for wave 1, ~1.5 s
        // after room boot).
        Self {
            room: RoomState::from_seed(seed),
            next_player_id: 1,
            slots: HashMap::new(),
            pending_events: Vec::new(),
        }
    }

    /// Spawn `count` asteroids for a wave start. Each gets a fresh
    /// sub-seed so client + server reconstruct identical positions.
    fn spawn_wave_asteroids(&mut self, count: usize) {
        for _ in 0..count {
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
            latest_power_fire: false,
            latest_power_weapon: 0,
            last_power_fire: false,
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
            weapon,
            fire,
            power_weapon,
            power_fire,
        } = msg
        {
            if let Some(slot) = self.slots.get_mut(&player_id) {
                slot.latest_input.up = up;
                slot.latest_input.down = down;
                slot.latest_input.left = left;
                slot.latest_input.right = right;
                slot.latest_input.aim_x = aim_x;
                slot.latest_input.aim_y = aim_y;
                slot.latest_input.fire = fire;
                slot.latest_input.weapon = weapon;
                slot.last_input_tick = client_tick;
                // Phase 4 step 6 — capture power-weapon input bits onto
                // the slot. `latest_power_fire` is sampled by
                // `process_power_fire` next tick; `latest_power_weapon`
                // chooses the dispatch branch.
                slot.latest_power_fire = power_fire;
                slot.latest_power_weapon = power_weapon;
            }
            // Persist weapon choice onto the ship for the fire dispatch.
            if let Some(ship) = self
                .room
                .ships
                .iter_mut()
                .find(|s| s.player_id == player_id)
            {
                ship.weapon_kind = weapon;
                // Phase 4 step 6 — also persist the equipped power
                // weapon kind so the Snapshot reflects it for HUD
                // rendering on the receiver side. Clamp to the dense
                // 0..=5 range (see `power_weapon::KIND_*`).
                ship.power_weapon_kind = power_weapon.min(5);
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

        // 4.5. Orb drift + magnet + lifetime.
        {
            let ships_snap = self.room.ships.clone();
            for o in self.room.orbs.iter_mut() {
                drops::update_orb(o, &ships_snap, self.room.field_w, self.room.field_h);
            }
        }

        // 4.6. Enemy-bullet drift + lifetime.
        for b in self.room.enemy_bullets.iter_mut() {
            enemy_bullet::update_enemy_bullet(b, self.room.field_w, self.room.field_h);
        }

        // 4.6.a. Enemy mine lifetime tick (mines are stationary).
        for m in self.room.enemy_mines.iter_mut() {
            enemy_mine::update_mine(m);
        }
        // 4.6.b. Enemy missile homing + drift + lifetime.
        {
            let missile_targets: Vec<enemy::TargetView> = self
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
            for m in self.room.enemy_missiles.iter_mut() {
                enemy_missile::update_missile(
                    m,
                    &missile_targets,
                    self.room.field_w,
                    self.room.field_h,
                );
            }
        }

        // 4.7. Enemy fire — per-kind dispatch (HUNTER aimed, GUARDIAN
        //      spread, WEAVER spiral, SENTINEL/TITAN sweep, PROWLER
        //      missile, TANGERINE mine drop, etc.).
        self.process_enemy_fire();

        // 5. Fire input → bullet spawns. Edge-detect plus cooldown.
        self.process_fire_inputs();

        // 5.b. Phase 4 step 6 — power-weapon dispatch. Mirrors the
        //      primary-weapon dispatch but routes through `power_weapon`'s
        //      per-kind activate / tick_* entry points and feeds the new
        //      `player_mines` / `player_missiles` vecs.
        self.process_power_fire();

        // 5.c. Phase 4 step 6 — stateful per-tick updates for the beam/arc
        //      power weapons and homing player-mines/missiles.
        self.tick_power_weapon_state();

        // 6. Wave cadence — drive the wave state machine and spawn
        //    enemies per its requests. Replaces Phase 3's fixed-period
        //    enemy spawn timer.
        self.drive_wave();

        // 7. Collision detection — mutates entity state + emits events.
        let mut coll_events: Vec<CollisionEvent> = Vec::new();
        let added_child_ids = collision::run_collisions(
            &mut self.room.ships,
            &mut self.room.enemies,
            &mut self.room.asteroids,
            &mut self.room.bullets,
            &mut self.room.orbs,
            &mut self.room.enemy_bullets,
            self.room.tick,
            &mut self.room.rng,
            self.room.next_asteroid_id,
            &mut coll_events,
        );
        self.room.next_asteroid_id = self
            .room
            .next_asteroid_id
            .wrapping_add(added_child_ids);

        // 7.b. Phase 4 step 5 — additional collision pairs for mines
        //      and missiles. Additive: signature of run_collisions is
        //      unchanged; these helpers append to the same event vec.
        let tick_for_collisions = self.room.tick;
        collision::run_bullet_mine_pairs(
            &mut self.room.enemy_mines,
            &mut self.room.bullets,
            tick_for_collisions,
            &mut coll_events,
        );
        collision::run_ship_mine_pairs(
            &mut self.room.ships,
            &mut self.room.enemy_mines,
            &mut coll_events,
        );
        collision::run_ship_missile_pairs(
            &mut self.room.ships,
            &mut self.room.enemy_missiles,
            &mut coll_events,
        );

        // 7.c. Phase 4 step 6 — player-mine × enemy + player-missile ×
        //      enemy pairs. Additive; reuses the same `coll_events` vec.
        collision::run_player_mine_enemy_pairs(
            &mut self.room.player_mines,
            &mut self.room.enemies,
            &mut coll_events,
        );
        collision::run_player_missile_enemy_pairs(
            &mut self.room.player_missiles,
            &mut self.room.enemies,
            &mut coll_events,
        );

        // 8. Map collision events → wire events; child asteroids
        //    pushed into room state. Kill events also roll for orb drops.
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
        self.room.orbs.retain(|o| o.active);
        self.room.enemy_bullets.retain(|b| b.active);
        self.room.enemy_mines.retain(|m| !m.dead());
        self.room.enemy_missiles.retain(|m| m.active);
        // Phase 4 step 6 — cull dead player mines / missiles. Mines use
        // `dead()` (active=false OR hp<=0); missiles use `active`.
        self.room.player_mines.retain(|m| !m.dead());
        self.room.player_missiles.retain(|m| m.active);

        self.room.tick = self.room.tick.wrapping_add(1);
    }

    /// Per-kind enemy fire dispatch — each alive enemy picks the nearest
    /// live ship and emits the kind-appropriate projectile(s) when its
    /// cooldown gate clears. Phase 4 step 5 extends Phase 4 step 1's
    /// HUNTER-only logic to all 10 kinds plus the new mine + missile
    /// entity types.
    ///
    /// Kind summary:
    /// - HUNTER, WASP, STALKER, DRIFTER — single aimed bullet
    /// - GUARDIAN — N-bullet spread (GUARDIAN_SPREAD_COUNT)
    /// - WEAVER — single spiral-aimed bullet; spiral phase advances per shot
    /// - SENTINEL — sweeping single bullet; sweep_phase advances every tick
    ///   (in update_sentinel_movement)
    /// - TITAN — explosive sweep bullet; rage-aware cooldown + amplitude;
    ///   sweep_phase advances on each fire via `advance_sweep`
    /// - PROWLER — homing missile (separate entity)
    /// - TANGERINE — drops a mine at its position (separate entity);
    ///   does NOT fire bullets
    fn process_enemy_fire(&mut self) {
        let tick = self.room.tick;
        // Build the TargetView slice once (same shape enemy AI uses).
        let target_views: Vec<enemy::TargetView> = self
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
        // Fast path: if no alive ships, no enemy fires.
        if !target_views.iter().any(|t| t.alive) {
            return;
        }

        // Helper: pick closest alive TargetView to (x, y).
        fn closest<'a>(targets: &'a [enemy::TargetView], x: f64, y: f64) -> Option<&'a enemy::TargetView> {
            let mut best: Option<(f64, &enemy::TargetView)> = None;
            for t in targets {
                if !t.alive {
                    continue;
                }
                let dx = t.x - x;
                let dy = t.y - y;
                let d2 = dx * dx + dy * dy;
                if best.is_none() || d2 < best.unwrap().0 {
                    best = Some((d2, t));
                }
            }
            best.map(|(_, t)| t)
        }

        // Per-tick fire intents — accumulated WITHOUT pushing onto the
        // room vecs (which would invalidate the enemy iter borrow).
        // Each variant captures the minimum state needed for the spawn pass below.
        enum FireIntent {
            Bullet {
                owner_id: u32,
                ox: f64,
                oy: f64,
                angle: f64,
            },
            Spread {
                owner_id: u32,
                ox: f64,
                oy: f64,
                base_angle: f64,
                count: u8,
                spread: f64,
            },
            Explosive {
                owner_id: u32,
                ox: f64,
                oy: f64,
                angle: f64,
                damage: f64,
                radius: f64,
            },
            Missile {
                owner_id: u32,
                ox: f64,
                oy: f64,
                angle: f64,
            },
            Mine {
                owner_id: u32,
                ox: f64,
                oy: f64,
            },
        }
        let mut intents: Vec<FireIntent> = Vec::new();

        for e in self.room.enemies.iter_mut() {
            if !e.active || e.hp <= 0.0 {
                continue;
            }
            // Per-kind cooldown const lookup. TITAN's cooldown is rage-
            // aware so we read it from its helper.
            let cooldown = match e.kind {
                KIND_HUNTER => ENEMY_FIRE_COOLDOWN_TICKS,
                k if k == enemy_wasp::KIND_WASP => WASP_FIRE_COOLDOWN_TICKS,
                k if k == enemy_guardian::KIND_GUARDIAN => GUARDIAN_FIRE_COOLDOWN_TICKS,
                k if k == enemy_stalker::KIND_STALKER => STALKER_FIRE_COOLDOWN_TICKS,
                k if k == enemy_drifter::KIND_DRIFTER => DRIFTER_FIRE_COOLDOWN_TICKS,
                k if k == enemy_prowler::KIND_PROWLER => PROWLER_FIRE_COOLDOWN_TICKS,
                k if k == enemy_weaver::KIND_WEAVER => WEAVER_FIRE_COOLDOWN_TICKS,
                k if k == enemy_sentinel::KIND_SENTINEL => SENTINEL_FIRE_COOLDOWN_TICKS,
                k if k == enemy_tangerine::KIND_TANGERINE => TANGERINE_MINE_COOLDOWN_TICKS,
                k if k == enemy_titan::KIND_TITAN => enemy_titan::current_fire_cooldown(e),
                _ => ENEMY_FIRE_COOLDOWN_TICKS,
            };
            if tick.wrapping_sub(e.last_fire_tick) < cooldown {
                continue;
            }
            // Pick the closest alive target.
            let target = match closest(&target_views, e.x, e.y) {
                Some(t) => *t,
                None => continue,
            };

            match e.kind {
                KIND_HUNTER => {
                    // TODO(Phase 4 step 5 follow-up): randomize HUNTER
                    // cooldown 36-132 ticks per solo (600-2200 ms). Needs a
                    // per-enemy next-fire-tick field or extending the
                    // last_fire_tick gate to read a stored jitter — both
                    // require EnemyState surgery, deferred to a follow-up
                    // patch to keep this dispatch additive.
                    let angle = atan2_64(target.y - e.y, target.x - e.x);
                    e.last_fire_tick = tick;
                    intents.push(FireIntent::Bullet {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        angle,
                    });
                }
                k if k == enemy_wasp::KIND_WASP => {
                    let angle = enemy_wasp::aim_wasp(e, &target);
                    e.last_fire_tick = tick;
                    intents.push(FireIntent::Bullet {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        angle,
                    });
                }
                k if k == enemy_stalker::KIND_STALKER => {
                    // STALKER needs charge_progress to have reached the
                    // windup threshold in addition to the cooldown gate.
                    if !enemy_stalker::is_charge_complete(e) {
                        continue;
                    }
                    let angle = enemy_stalker::aim_stalker(e, &target);
                    e.last_fire_tick = tick;
                    enemy_stalker::reset_charge(e);
                    intents.push(FireIntent::Bullet {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        angle,
                    });
                }
                k if k == enemy_drifter::KIND_DRIFTER => {
                    let angle = enemy_drifter::aim_drifter(e, &target);
                    e.last_fire_tick = tick;
                    intents.push(FireIntent::Bullet {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        angle,
                    });
                }
                k if k == enemy_guardian::KIND_GUARDIAN => {
                    let angle = enemy_guardian::aim_guardian(e, &target);
                    e.last_fire_tick = tick;
                    intents.push(FireIntent::Spread {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        base_angle: angle,
                        count: GUARDIAN_SPREAD_COUNT,
                        spread: GUARDIAN_SPREAD_RADIANS,
                    });
                }
                k if k == enemy_weaver::KIND_WEAVER => {
                    let base_angle = enemy_weaver::aim_weaver(e, &target);
                    let total_angle = base_angle + e.spiral_phase;
                    e.last_fire_tick = tick;
                    enemy_weaver::advance_spiral_phase(e);
                    intents.push(FireIntent::Bullet {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        angle: total_angle,
                    });
                }
                k if k == enemy_sentinel::KIND_SENTINEL => {
                    let base_angle = enemy_sentinel::aim_sentinel(e, &target);
                    let total_angle = base_angle + enemy_sentinel::current_sweep_offset(e);
                    e.last_fire_tick = tick;
                    intents.push(FireIntent::Bullet {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        angle: total_angle,
                    });
                }
                k if k == enemy_titan::KIND_TITAN => {
                    let raging = enemy_titan::is_raging(e);
                    let base_angle = enemy_titan::aim_titan(e, &target);
                    let total_angle = base_angle + enemy_titan::current_sweep_offset(e, raging);
                    e.last_fire_tick = tick;
                    enemy_titan::advance_sweep(e);
                    intents.push(FireIntent::Explosive {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        angle: total_angle,
                        damage: TITAN_BULLET_DAMAGE,
                        radius: TITAN_BULLET_RADIUS,
                    });
                }
                k if k == enemy_prowler::KIND_PROWLER => {
                    let angle = enemy_prowler::aim_prowler(e, &target);
                    e.last_fire_tick = tick;
                    intents.push(FireIntent::Missile {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                        angle,
                    });
                }
                k if k == enemy_tangerine::KIND_TANGERINE => {
                    // TANGERINE drops a mine at its current position
                    // instead of firing a projectile.
                    e.last_fire_tick = tick;
                    intents.push(FireIntent::Mine {
                        owner_id: e.id,
                        ox: e.x,
                        oy: e.y,
                    });
                }
                _ => {}
            }
        }

        // Spawn pass — materialize each intent + emit the wire event.
        for intent in intents {
            match intent {
                FireIntent::Bullet {
                    owner_id,
                    ox,
                    oy,
                    angle,
                } => {
                    if self.room.enemy_bullets.len() >= MAX_ENEMY_BULLETS {
                        continue;
                    }
                    let id = self.room.next_enemy_bullet_id;
                    self.room.next_enemy_bullet_id =
                        self.room.next_enemy_bullet_id.wrapping_add(1);
                    let b = enemy_bullet::spawn_aimed_default(id, owner_id, ox, oy, angle);
                    self.room.enemy_bullets.push(b);
                    self.pending_events.push(EventPayload::EnemyBulletSpawn {
                        bullet_id: id,
                        owner_enemy_id: owner_id,
                        origin_x: ox,
                        origin_y: oy,
                        angle,
                        spawn_tick: tick,
                    });
                }
                FireIntent::Spread {
                    owner_id,
                    ox,
                    oy,
                    base_angle,
                    count,
                    spread,
                } => {
                    let id_start = self.room.next_enemy_bullet_id;
                    let bullets = enemy_bullet_patterns::spawn_spread(
                        id_start, owner_id, ox, oy, base_angle, count, spread,
                    );
                    for b in bullets {
                        if self.room.enemy_bullets.len() >= MAX_ENEMY_BULLETS {
                            break;
                        }
                        let bid = b.id;
                        let angle = atan2_64(b.vy, b.vx);
                        self.room.enemy_bullets.push(b);
                        self.room.next_enemy_bullet_id =
                            self.room.next_enemy_bullet_id.wrapping_add(1);
                        self.pending_events.push(EventPayload::EnemyBulletSpawn {
                            bullet_id: bid,
                            owner_enemy_id: owner_id,
                            origin_x: ox,
                            origin_y: oy,
                            angle,
                            spawn_tick: tick,
                        });
                    }
                }
                FireIntent::Explosive {
                    owner_id,
                    ox,
                    oy,
                    angle,
                    damage,
                    radius,
                } => {
                    if self.room.enemy_bullets.len() >= MAX_ENEMY_BULLETS {
                        continue;
                    }
                    let id = self.room.next_enemy_bullet_id;
                    self.room.next_enemy_bullet_id =
                        self.room.next_enemy_bullet_id.wrapping_add(1);
                    let b = enemy_bullet_patterns::spawn_explosive(
                        id, owner_id, ox, oy, angle, damage, radius,
                    );
                    self.room.enemy_bullets.push(b);
                    self.pending_events.push(EventPayload::EnemyBulletSpawn {
                        bullet_id: id,
                        owner_enemy_id: owner_id,
                        origin_x: ox,
                        origin_y: oy,
                        angle,
                        spawn_tick: tick,
                    });
                }
                FireIntent::Missile {
                    owner_id,
                    ox,
                    oy,
                    angle,
                } => {
                    if self.room.enemy_missiles.len() >= MAX_ENEMY_MISSILES {
                        continue;
                    }
                    let id = self.room.next_enemy_missile_id;
                    self.room.next_enemy_missile_id =
                        self.room.next_enemy_missile_id.wrapping_add(1);
                    let m = enemy_missile::spawn_default(id, owner_id, ox, oy, angle);
                    self.room.enemy_missiles.push(m);
                    self.pending_events.push(EventPayload::EnemyMissileSpawn {
                        missile_id: id,
                        owner_enemy_id: owner_id,
                        origin_x: ox,
                        origin_y: oy,
                        initial_angle: angle,
                        spawn_tick: tick,
                    });
                }
                FireIntent::Mine {
                    owner_id,
                    ox,
                    oy,
                } => {
                    if self.room.enemy_mines.len() >= MAX_ENEMY_MINES {
                        continue;
                    }
                    let id = self.room.next_enemy_mine_id;
                    self.room.next_enemy_mine_id = self.room.next_enemy_mine_id.wrapping_add(1);
                    let sub_seed = self.room.rng.sub_seed();
                    let m = enemy_mine::spawn_from_seed(id, owner_id, ox, oy, sub_seed);
                    self.room.enemy_mines.push(m);
                    self.pending_events.push(EventPayload::EnemyMineSpawn {
                        mine_id: id,
                        owner_enemy_id: owner_id,
                        x: ox,
                        y: oy,
                        sub_seed,
                        spawn_tick: tick,
                    });
                }
            }
        }
    }

    /// Drive the wave state machine for one tick. Emits enemy spawns
    /// for the wave's sub-waves; emits WaveStart / WaveClear events
    /// at the right boundaries. When a wave completes, bumps the
    /// `current_wave` and resets to Intro for the next one.
    fn drive_wave(&mut self) {
        let tick = self.room.tick;
        let prev_phase = self.room.wave.phase;
        let prev_wave = self.room.wave.current_wave;

        let config: WaveConfig = wave_table::get_wave_config(self.room.wave.current_wave);
        let alive: usize = self
            .room
            .enemies
            .iter()
            .filter(|e| e.active && e.hp > 0.0)
            .count();
        let requests = wave::tick_wave(&mut self.room.wave, &config, alive, tick);

        // Emit WaveStart on Intro → Spawning transition. Asteroids
        // are seeded at the same boundary.
        let just_started_spawning =
            prev_phase == WavePhase::Intro && self.room.wave.phase == WavePhase::Spawning;
        if just_started_spawning {
            self.spawn_wave_asteroids(config.asteroid_count as usize);
            self.pending_events.push(EventPayload::WaveStart {
                wave_number: config.wave_number as u32,
                asteroid_count: config.asteroid_count,
                is_boss_wave: config.is_boss_wave,
                boss_tier: config.boss_tier,
                at_tick: tick,
            });
        }

        // Apply each spawn request via the kind-appropriate helper.
        // Phase 4 step 1 only ships HUNTER — unimplemented kinds fall
        // back to HUNTER with a debug log so the wave still plays out.
        for req in requests {
            self.spawn_enemy_from_request(req);
        }

        // On Clearing → Complete: emit WaveClear, advance to next wave,
        // reset wave state to Intro.
        if prev_phase != WavePhase::Complete && self.room.wave.phase == WavePhase::Complete {
            self.pending_events.push(EventPayload::WaveClear {
                wave_number: prev_wave as u32,
                at_tick: tick,
            });
            // Advance to next wave; reset state. The next tick's
            // `tick_wave` call will run the Intro→Spawning hold for
            // the new wave.
            self.room.wave.current_wave = prev_wave.saturating_add(1);
            self.room.wave.sub_wave_idx = 0;
            self.room.wave.phase = WavePhase::Intro;
            self.room.wave.phase_started_tick = tick;
        }
    }

    /// Resolve a wave spawn request into an actual EnemyState. Phase 4
    /// step 5 dispatches to each kind's `spawn_xxx_from_seed`; unknown
    /// kinds fall back to HUNTER with a warn log so the wave still plays.
    fn spawn_enemy_from_request(&mut self, req: WaveSpawnRequest) {
        // MAX_ENEMIES soft cap: drop excess spawns (matches solo's
        // pool soft-cap behavior).
        if self.room.enemies.len() >= rainboids_sim::state::MAX_ENEMIES {
            return;
        }
        let id = self.room.next_enemy_id;
        self.room.next_enemy_id = self.room.next_enemy_id.wrapping_add(1);
        let sub_seed = self.room.rng.sub_seed();
        let fw = self.room.field_w;
        let fh = self.room.field_h;

        let e = match req.kind_u8 {
            TABLE_KIND_HUNTER => enemy::spawn_hunter_from_seed(id, sub_seed, fw, fh),
            TABLE_KIND_WASP => enemy_wasp::spawn_wasp_from_seed(id, sub_seed, fw, fh),
            TABLE_KIND_GUARDIAN => enemy_guardian::spawn_guardian_from_seed(id, sub_seed, fw, fh),
            TABLE_KIND_STALKER => enemy_stalker::spawn_stalker_from_seed(id, sub_seed, fw, fh),
            TABLE_KIND_DRIFTER => enemy_drifter::spawn_drifter_from_seed(id, sub_seed, fw, fh),
            TABLE_KIND_PROWLER => enemy_prowler::spawn_prowler_from_seed(id, sub_seed, fw, fh),
            TABLE_KIND_WEAVER => enemy_weaver::spawn_weaver_from_seed(id, sub_seed, fw, fh),
            TABLE_KIND_SENTINEL => enemy_sentinel::spawn_sentinel_from_seed(id, sub_seed, fw, fh),
            TABLE_KIND_TANGERINE => {
                enemy_tangerine::spawn_tangerine_from_seed(id, sub_seed, fw, fh)
            }
            TABLE_KIND_TITAN => enemy_titan::spawn_titan_from_seed(id, sub_seed, fw, fh),
            other => {
                tracing::warn!(
                    requested_kind = other,
                    "sim: unknown enemy kind, substituting HUNTER"
                );
                enemy::spawn_hunter_from_seed(id, sub_seed, fw, fh)
            }
        };
        let kind = e.kind;
        self.room.enemies.push(e);
        self.pending_events.push(EventPayload::EnemySpawn {
            enemy_id: id,
            kind,
            rng_subseed: sub_seed,
        });
    }

    /// Detect fire-input → spawn bullet (with cooldown). Spawns
    /// emit BulletSpawn events for client mirror. Phase 4 step 4:
    /// dispatches via `sim::weapon::fire(weapon_kind, ship, rng)` so
    /// each weapon emits its own spawn pattern (1 needle / 5 pellets /
    /// 1 piercing rail / 1 pulse).
    fn process_fire_inputs(&mut self) {
        let tick = self.room.tick;
        // Collect firing intents — capture both ship state + weapon
        // selection without holding a mutable ship borrow during the
        // bullet push pass.
        let mut intents: Vec<(u32, ShipState, u8)> = Vec::new();
        for slot in self.slots.values_mut() {
            if !slot.latest_input.fire {
                continue;
            }
            let ship = self
                .room
                .ships
                .iter()
                .find(|s| s.player_id == slot.player_id);
            let ship = match ship {
                Some(s) if s.active && !s.downed => s,
                _ => continue,
            };
            let weapon = ship.weapon_kind;
            let cooldown = sim_weapon::cooldown_ticks(weapon);
            if tick.wrapping_sub(slot.last_fire_tick) < cooldown {
                continue;
            }
            slot.last_fire_tick = tick;
            intents.push((slot.player_id, *ship, weapon));
        }

        for (owner_pid, ship, weapon) in intents {
            let spawns = sim_weapon::fire(weapon, &ship, &mut self.room.rng);
            for s in spawns {
                let id = self.room.next_bullet_id;
                self.room.next_bullet_id = self.room.next_bullet_id.wrapping_add(1);
                let speed = BULLET_SPEED * s.speed_mult;
                let vx = cos64(s.angle) * speed;
                let vy = sin64(s.angle) * speed;
                let b = BulletState::spawn(
                    id,
                    owner_pid,
                    s.origin_x,
                    s.origin_y,
                    s.angle,
                    tick,
                    s.damage,
                    s.piercing,
                    s.speed_mult,
                    s.lifetime_mult,
                );
                self.room.bullets.push(b);
                self.pending_events.push(EventPayload::BulletSpawn {
                    bullet_id: id,
                    owner_player_id: owner_pid,
                    origin_x: s.origin_x,
                    origin_y: s.origin_y,
                    vx,
                    vy,
                    spawn_tick: tick,
                    weapon,
                });
            }
        }
    }

    /// Phase 4 step 6 — power-weapon dispatch. Mirrors `process_fire_inputs`
    /// for the secondary (power) weapon slot. Per-kind branches:
    ///
    /// - CHARGE_SHOT: tick the charge state machine every frame regardless
    ///   of the held bit; the module reads the bit + emits a spawn on the
    ///   falling edge once the min-charge threshold has been reached.
    /// - MINE_LAYER / NOVA_BLAST / MISSILE_SALVO: instant activations
    ///   gated on a rising edge (`!last_power_fire && latest_power_fire`)
    ///   AND `current_tick >= ship.power_weapon_cooldown_tick`.
    /// - LANCE_BEAM / LIGHTNING_ARC: same rising-edge + cooldown gate,
    ///   plus a "no beam currently active" gate (`beam_remaining_ticks == 0`).
    ///   The per-tick beam/arc update lands in `tick_power_weapon_state`.
    fn process_power_fire(&mut self) {
        let tick = self.room.tick;
        // Snapshot per-slot (player_id, latest_power_fire, last_power_fire)
        // up front so we can mutate `ship` + `slot.last_power_fire` in the
        // same loop without overlapping borrows.
        let snapshot: Vec<(u32, bool, bool)> = self
            .slots
            .values()
            .map(|s| (s.player_id, s.latest_power_fire, s.last_power_fire))
            .collect();
        for (pid, power_fire, last_power_fire) in snapshot {
            let rising_edge = power_fire && !last_power_fire;
            // Resolve ship (mut). Skip if missing / inactive / downed.
            let kind = match self.room.ships.iter().find(|s| s.player_id == pid) {
                Some(s) if s.active && !s.downed => s.power_weapon_kind,
                _ => {
                    if let Some(slot) = self.slots.get_mut(&pid) {
                        slot.last_power_fire = power_fire;
                    }
                    continue;
                }
            };

            match kind {
                k if k == power_weapon::KIND_CHARGE_SHOT => {
                    // Charge state machine ticks every frame; module
                    // returns Some on falling edge ≥ min-charge.
                    let spawn = {
                        let ship = self
                            .room
                            .ships
                            .iter_mut()
                            .find(|s| s.player_id == pid)
                            .expect("ship existed above");
                        power_weapon_charge_shot::tick_charge(ship, power_fire)
                    };
                    if let Some(s) = spawn {
                        let id = self.room.next_bullet_id;
                        self.room.next_bullet_id = self.room.next_bullet_id.wrapping_add(1);
                        let speed = bullet::BULLET_SPEED * s.speed_mult;
                        let vx = cos64(s.angle) * speed;
                        let vy = sin64(s.angle) * speed;
                        let charge_ticks = {
                            // The module reset progress on release; for
                            // the wire event we approximate via damage
                            // lerp inverse. Simpler: pass damage straight
                            // through and let the client treat
                            // charge_ticks as advisory. We don't have
                            // the pre-reset progress here, so use the
                            // CHARGE_MAX_TICKS-saturated proxy.
                            let frac = (s.damage - power_weapon_charge_shot::CHARGE_BASE_DAMAGE)
                                / (power_weapon_charge_shot::CHARGE_MAX_DAMAGE
                                    - power_weapon_charge_shot::CHARGE_BASE_DAMAGE);
                            let frac = frac.clamp(0.0, 1.0);
                            (frac * power_weapon_charge_shot::CHARGE_MAX_TICKS as f64) as u32
                        };
                        let b = BulletState::spawn(
                            id,
                            pid,
                            s.origin_x,
                            s.origin_y,
                            s.angle,
                            tick,
                            s.damage,
                            s.piercing,
                            s.speed_mult,
                            s.lifetime_mult,
                        );
                        self.room.bullets.push(b);
                        self.pending_events.push(EventPayload::BulletSpawn {
                            bullet_id: id,
                            owner_player_id: pid,
                            origin_x: s.origin_x,
                            origin_y: s.origin_y,
                            vx,
                            vy,
                            spawn_tick: tick,
                            // weapon=0 (CHARGE_SHOT) — client renders
                            // the charge-shot trail cosmetic.
                            weapon: 0,
                        });
                        self.pending_events.push(EventPayload::ChargeShotFire {
                            player_id: pid,
                            charge_ticks,
                            damage: s.damage,
                            at_tick: tick,
                            x: s.origin_x,
                            y: s.origin_y,
                        });
                    }
                }
                k if k == power_weapon::KIND_MINE_LAYER => {
                    if !rising_edge {
                        // fall through to last_power_fire update
                    } else {
                        let (ship_pos, cooldown_ok) = {
                            let ship = self
                                .room
                                .ships
                                .iter()
                                .find(|s| s.player_id == pid)
                                .expect("ship existed above");
                            (
                                (ship.x, ship.y),
                                tick >= ship.power_weapon_cooldown_tick,
                            )
                        };
                        if cooldown_ok {
                            let active_mines: u8 = self
                                .room
                                .player_mines
                                .iter()
                                .filter(|m| m.owner_player_id == pid && !m.dead())
                                .count()
                                .min(u8::MAX as usize)
                                as u8;
                            // Borrow ship immutably for activate (it
                            // doesn't mutate). Cooldown bump happens
                            // after.
                            let spawn = {
                                let ship = self
                                    .room
                                    .ships
                                    .iter()
                                    .find(|s| s.player_id == pid)
                                    .expect("ship existed above");
                                let _ = ship_pos;
                                power_weapon_mine_layer::activate(ship, active_mines)
                            };
                            if let Some(ms) = spawn {
                                if self.room.player_mines.len() < MAX_PLAYER_MINES {
                                    let mine_id = self.room.next_player_mine_id;
                                    self.room.next_player_mine_id =
                                        self.room.next_player_mine_id.wrapping_add(1);
                                    let mine = player_mine::spawn_default(
                                        mine_id,
                                        ms.owner_player_id,
                                        ms.x,
                                        ms.y,
                                    );
                                    self.room.player_mines.push(mine);
                                    self.pending_events.push(EventPayload::PlayerMineSpawn {
                                        mine_id,
                                        owner_player_id: ms.owner_player_id,
                                        x: ms.x,
                                        y: ms.y,
                                        at_tick: tick,
                                    });
                                    self.pending_events.push(EventPayload::PowerWeaponActivate {
                                        player_id: pid,
                                        power_weapon_kind: power_weapon::KIND_MINE_LAYER,
                                        at_tick: tick,
                                    });
                                }
                                // Set cooldown regardless of cap rejection
                                // so spamming the button doesn't bypass it
                                // (matches the dispatcher contract — see
                                // power_weapon_mine_layer::activate doc).
                                let ship = self
                                    .room
                                    .ships
                                    .iter_mut()
                                    .find(|s| s.player_id == pid)
                                    .expect("ship existed above");
                                ship.power_weapon_cooldown_tick = tick
                                    + power_weapon::cooldown_ticks(
                                        power_weapon::KIND_MINE_LAYER,
                                    );
                            }
                        }
                    }
                }
                k if k == power_weapon::KIND_NOVA_BLAST => {
                    if rising_edge {
                        let (ship_x, ship_y, cooldown_ok) = {
                            let ship = self
                                .room
                                .ships
                                .iter()
                                .find(|s| s.player_id == pid)
                                .expect("ship existed above");
                            (ship.x, ship.y, tick >= ship.power_weapon_cooldown_tick)
                        };
                        if cooldown_ok {
                            // Snapshot enemies for the activate() call,
                            // then apply damage + push by id back into
                            // self.room.enemies.
                            let enemies_snap: Vec<EnemyState> =
                                self.room.enemies.iter().copied().collect();
                            let hits = {
                                let ship = self
                                    .room
                                    .ships
                                    .iter()
                                    .find(|s| s.player_id == pid)
                                    .expect("ship existed above");
                                power_weapon_nova_blast::activate(ship, &enemies_snap)
                            };
                            for h in hits {
                                if let Some(e) = self
                                    .room
                                    .enemies
                                    .iter_mut()
                                    .find(|e| e.id == h.enemy_id)
                                {
                                    e.hp -= h.damage;
                                    e.vx += h.push_vx;
                                    e.vy += h.push_vy;
                                    if e.hp <= 0.0 {
                                        e.active = false;
                                    }
                                }
                            }
                            self.pending_events.push(EventPayload::NovaBlast {
                                player_id: pid,
                                x: ship_x,
                                y: ship_y,
                                radius: power_weapon_nova_blast::NOVA_RING_RADIUS,
                                at_tick: tick,
                            });
                            self.pending_events.push(EventPayload::PowerWeaponActivate {
                                player_id: pid,
                                power_weapon_kind: power_weapon::KIND_NOVA_BLAST,
                                at_tick: tick,
                            });
                            let ship = self
                                .room
                                .ships
                                .iter_mut()
                                .find(|s| s.player_id == pid)
                                .expect("ship existed above");
                            ship.power_weapon_cooldown_tick = tick
                                + power_weapon::cooldown_ticks(
                                    power_weapon::KIND_NOVA_BLAST,
                                );
                        }
                    }
                }
                k if k == power_weapon::KIND_MISSILE_SALVO => {
                    if rising_edge {
                        let cooldown_ok = {
                            let ship = self
                                .room
                                .ships
                                .iter()
                                .find(|s| s.player_id == pid)
                                .expect("ship existed above");
                            tick >= ship.power_weapon_cooldown_tick
                        };
                        if cooldown_ok {
                            let spawns = {
                                let ship = self
                                    .room
                                    .ships
                                    .iter()
                                    .find(|s| s.player_id == pid)
                                    .expect("ship existed above");
                                power_weapon_missile_salvo::activate(ship)
                            };
                            for s in spawns {
                                if self.room.player_missiles.len() >= MAX_PLAYER_MISSILES {
                                    break;
                                }
                                let mid = self.room.next_player_missile_id;
                                self.room.next_player_missile_id =
                                    self.room.next_player_missile_id.wrapping_add(1);
                                let m = player_missile::spawn_default(
                                    mid,
                                    s.owner_player_id,
                                    s.origin_x,
                                    s.origin_y,
                                    s.angle,
                                );
                                self.room.player_missiles.push(m);
                                self.pending_events.push(EventPayload::PlayerMissileSpawn {
                                    missile_id: mid,
                                    owner_player_id: s.owner_player_id,
                                    origin_x: s.origin_x,
                                    origin_y: s.origin_y,
                                    initial_angle: s.angle,
                                    at_tick: tick,
                                });
                            }
                            self.pending_events.push(EventPayload::PowerWeaponActivate {
                                player_id: pid,
                                power_weapon_kind: power_weapon::KIND_MISSILE_SALVO,
                                at_tick: tick,
                            });
                            let ship = self
                                .room
                                .ships
                                .iter_mut()
                                .find(|s| s.player_id == pid)
                                .expect("ship existed above");
                            ship.power_weapon_cooldown_tick = tick
                                + power_weapon::cooldown_ticks(
                                    power_weapon::KIND_MISSILE_SALVO,
                                );
                        }
                    }
                }
                k if k == power_weapon::KIND_LANCE_BEAM => {
                    if rising_edge {
                        let (aim, cooldown_ok, no_beam) = {
                            let ship = self
                                .room
                                .ships
                                .iter()
                                .find(|s| s.player_id == pid)
                                .expect("ship existed above");
                            (
                                ship.angle,
                                tick >= ship.power_weapon_cooldown_tick,
                                ship.beam_remaining_ticks == 0,
                            )
                        };
                        if cooldown_ok && no_beam {
                            {
                                let ship = self
                                    .room
                                    .ships
                                    .iter_mut()
                                    .find(|s| s.player_id == pid)
                                    .expect("ship existed above");
                                power_weapon_lance_beam::activate(ship);
                                ship.power_weapon_cooldown_tick = tick
                                    + power_weapon::cooldown_ticks(
                                        power_weapon::KIND_LANCE_BEAM,
                                    );
                            }
                            self.pending_events.push(EventPayload::BeamStart {
                                player_id: pid,
                                kind: power_weapon::KIND_LANCE_BEAM,
                                aim_angle: aim,
                                duration_ticks:
                                    power_weapon_lance_beam::LANCE_BEAM_DURATION_TICKS,
                                at_tick: tick,
                            });
                            self.pending_events.push(EventPayload::PowerWeaponActivate {
                                player_id: pid,
                                power_weapon_kind: power_weapon::KIND_LANCE_BEAM,
                                at_tick: tick,
                            });
                        }
                    }
                }
                k if k == power_weapon::KIND_LIGHTNING_ARC => {
                    if rising_edge {
                        let (aim, cooldown_ok, no_beam) = {
                            let ship = self
                                .room
                                .ships
                                .iter()
                                .find(|s| s.player_id == pid)
                                .expect("ship existed above");
                            (
                                ship.angle,
                                tick >= ship.power_weapon_cooldown_tick,
                                ship.beam_remaining_ticks == 0,
                            )
                        };
                        if cooldown_ok && no_beam {
                            {
                                let ship = self
                                    .room
                                    .ships
                                    .iter_mut()
                                    .find(|s| s.player_id == pid)
                                    .expect("ship existed above");
                                power_weapon_lightning_arc::activate(ship);
                                ship.power_weapon_cooldown_tick = tick
                                    + power_weapon::cooldown_ticks(
                                        power_weapon::KIND_LIGHTNING_ARC,
                                    );
                            }
                            self.pending_events.push(EventPayload::BeamStart {
                                player_id: pid,
                                kind: power_weapon::KIND_LIGHTNING_ARC,
                                // ARC is auto-targeted; aim_angle isn't
                                // used by clients for chain rendering
                                // (they use ArcStrike's polyline) but
                                // we forward ship.angle as advisory.
                                aim_angle: aim,
                                duration_ticks:
                                    power_weapon_lightning_arc::ARC_DURATION_TICKS,
                                at_tick: tick,
                            });
                            self.pending_events.push(EventPayload::PowerWeaponActivate {
                                player_id: pid,
                                power_weapon_kind: power_weapon::KIND_LIGHTNING_ARC,
                                at_tick: tick,
                            });
                        }
                    }
                }
                _ => {
                    // Unknown kind — no-op. The clamp in apply_input
                    // shouldn't allow this branch in practice.
                }
            }

            // Commit the held-bit for next-tick rising-edge detection.
            if let Some(slot) = self.slots.get_mut(&pid) {
                slot.last_power_fire = power_fire;
            }
        }
    }

    /// Phase 4 step 6 — per-tick updates for the stateful power weapons:
    ///   - LANCE_BEAM / LIGHTNING_ARC beam ticks (damage application,
    ///     duration decrement, end-event emission)
    ///   - player_mine seek update (homing toward closest enemy)
    ///   - player_missile homing update
    fn tick_power_weapon_state(&mut self) {
        let tick = self.room.tick;

        // 1. Per-ship beam / arc tick. We need a snapshot of enemies for
        //    the `tick_beam` / `tick_arc` calls (they take &[EnemyState]),
        //    then apply damage back to the live enemies vec by id.
        let enemies_snapshot: Vec<EnemyState> = self.room.enemies.iter().copied().collect();
        // Buffer ArcStrike events we want to emit after the ship loop so
        // we're not borrowing self.pending_events while iterating ships.
        let mut arc_events: Vec<(u32, Vec<(f64, f64)>)> = Vec::new();
        let mut beam_end_events: Vec<(u32, u8)> = Vec::new();
        let mut damage_apply: Vec<(u32, f64)> = Vec::new();

        for ship in self.room.ships.iter_mut() {
            if ship.beam_remaining_ticks == 0 {
                continue;
            }
            let kind = ship.beam_kind;
            if kind == power_weapon::KIND_LANCE_BEAM {
                let hits = power_weapon_lance_beam::tick_beam(ship, &enemies_snapshot);
                for h in hits {
                    damage_apply.push((h.enemy_id, h.damage));
                }
            } else if kind == power_weapon::KIND_LIGHTNING_ARC {
                let hits = power_weapon_lightning_arc::tick_arc(ship, &enemies_snapshot);
                if !hits.is_empty() {
                    for h in &hits {
                        damage_apply.push((h.enemy_id, h.damage));
                    }
                    let chain: Vec<(f64, f64)> =
                        hits.iter().map(|h| (h.x, h.y)).collect();
                    arc_events.push((ship.player_id, chain));
                }
            }
            // BeamEnd: tick_beam / tick_arc decrement beam_remaining_ticks.
            // If it just reached zero, emit one BeamEnd. `kind` was read
            // pre-tick, which is correct: the JS client looks up the kind
            // from the matching BeamStart, so we forward the same value.
            if ship.beam_remaining_ticks == 0 {
                beam_end_events.push((ship.player_id, kind));
            }
        }

        // Apply collected damage back to live enemies. Multiple hits on
        // the same enemy in one tick (e.g. arc primary + chain) all stack.
        for (eid, dmg) in damage_apply {
            if let Some(e) = self.room.enemies.iter_mut().find(|e| e.id == eid) {
                e.hp -= dmg;
                if e.hp <= 0.0 {
                    e.active = false;
                }
            }
        }
        for (pid, chain) in arc_events {
            self.pending_events.push(EventPayload::ArcStrike {
                player_id: pid,
                chain,
                at_tick: tick,
            });
        }
        for (pid, kind) in beam_end_events {
            self.pending_events.push(EventPayload::BeamEnd {
                player_id: pid,
                kind,
                at_tick: tick,
            });
        }

        // 2. Player mine homing + lifetime tick.
        let enemies_view: Vec<EnemyState> = self.room.enemies.iter().copied().collect();
        for m in self.room.player_mines.iter_mut() {
            player_mine::update_mine(m, &enemies_view, self.room.field_w, self.room.field_h);
        }
        // 3. Player missile homing + lifetime tick.
        for m in self.room.player_missiles.iter_mut() {
            player_missile::update_missile(
                m,
                &enemies_view,
                self.room.field_w,
                self.room.field_h,
            );
        }
    }

    /// Roll for a drop orb at a death site. Returns the orb spawned (if
    /// any) so the caller can emit the OrbSpawn event with the same
    /// rng_subseed both sides reconstruct from.
    fn maybe_spawn_orb(
        &mut self,
        kind: u8,
        gold_chance: f64,
        health_chance: f64,
        x: f64,
        y: f64,
    ) -> Option<(u32, u8, u64)> {
        let _ = kind; // reserved for Phase 4 step 5 enemy-specific drop tables
        // Cap.
        if self.room.orbs.len() >= MAX_ORBS {
            return None;
        }
        // Roll: gold first (more common), then health (rarer).
        let gold_roll = self.room.rng.bool_at_prob(gold_chance);
        let health_roll = self.room.rng.bool_at_prob(health_chance);
        let drop_kind = if health_roll {
            ORB_KIND_HEALTH
        } else if gold_roll {
            ORB_KIND_GOLD
        } else {
            return None;
        };
        let id = self.room.next_orb_id;
        self.room.next_orb_id = self.room.next_orb_id.wrapping_add(1);
        let sub_seed = self.room.rng.sub_seed();
        let orb: OrbState = drops::spawn_orb_from_seed(id, drop_kind, x, y, sub_seed);
        self.room.orbs.push(orb);
        Some((id, drop_kind, sub_seed))
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
                // Roll for an orb drop at the kill site.
                if let Some((orb_id, drop_kind, sub_seed)) = self.maybe_spawn_orb(
                    kind,
                    ENEMY_GOLD_DROP_CHANCE,
                    ENEMY_HEALTH_DROP_CHANCE,
                    x,
                    y,
                ) {
                    self.pending_events.push(EventPayload::OrbSpawn {
                        orb_id,
                        kind: drop_kind,
                        x,
                        y,
                        rng_subseed: sub_seed,
                    });
                }
            }
            CollisionEvent::AsteroidDestroyed {
                asteroid_id,
                x,
                y,
                split_subseed,
                child_id_start,
                children,
            } => {
                let was_terminal = children.is_empty();
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
                // Only terminal asteroid kills (those that didn't split
                // further) drop an orb — matches solo's behavior where
                // splitting rocks give children, not loot.
                if was_terminal {
                    if let Some((orb_id, drop_kind, sub_seed)) = self.maybe_spawn_orb(
                        0,
                        ASTEROID_GOLD_DROP_CHANCE,
                        0.0,
                        x,
                        y,
                    ) {
                        self.pending_events.push(EventPayload::OrbSpawn {
                            orb_id,
                            kind: drop_kind,
                            x,
                            y,
                            rng_subseed: sub_seed,
                        });
                    }
                }
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
            CollisionEvent::OrbCollected {
                orb_id,
                by_player_id,
                kind,
                x,
                y,
            } => {
                self.pending_events.push(EventPayload::OrbCollected {
                    orb_id,
                    by_player_id,
                    kind,
                    at_tick: kill_tick,
                    x,
                    y,
                });
            }
            CollisionEvent::ShipHitByEnemyBullet {
                bullet_id,
                player_id,
                x,
                y,
            } => {
                self.pending_events.push(EventPayload::EnemyBulletHit {
                    bullet_id,
                    player_id,
                    hit_tick: kill_tick,
                    x,
                    y,
                });
            }
            // Phase 4 step 5 — bullet × mine: HP delta lands in the
            // next Resync if the client cares; we don't currently emit
            // a per-hit wire event for mine damage cosmetics. The
            // MineDestroyed event below covers the kill case.
            CollisionEvent::BulletDamagedMine { .. } => {}
            CollisionEvent::MineDestroyed {
                mine_id,
                by_bullet_id,
                x,
                y,
            } => {
                self.pending_events.push(EventPayload::EnemyMineDeath {
                    mine_id,
                    x,
                    y,
                    killed_by_bullet_id: by_bullet_id,
                    kill_tick,
                });
            }
            CollisionEvent::ShipHitByEnemyMissile {
                missile_id,
                player_id,
                x,
                y,
            } => {
                self.pending_events.push(EventPayload::EnemyMissileHit {
                    missile_id,
                    player_id,
                    hit_tick: kill_tick,
                    x,
                    y,
                });
            }
            // Phase 4 step 6 — player mine detonated. Owner / bullet
            // attribution lives on the collision event but the wire
            // EventPayload::PlayerMineDeath only carries the cosmetic
            // fields (mine_id + position + tick).
            CollisionEvent::PlayerMineDetonate {
                mine_id, x, y, ..
            } => {
                self.pending_events.push(EventPayload::PlayerMineDeath {
                    mine_id,
                    x,
                    y,
                    at_tick: kill_tick,
                });
            }
            // Phase 4 step 6 — player missile hit an enemy. Missile is
            // deactivated by the collision pass; HP delta on the enemy
            // shows up in the next Snapshot.
            CollisionEvent::PlayerMissileHitEnemy {
                missile_id,
                enemy_id,
                x,
                y,
            } => {
                self.pending_events.push(EventPayload::PlayerMissileHit {
                    missile_id,
                    enemy_id,
                    hit_tick: kill_tick,
                    x,
                    y,
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
                hp: s.hp,
                max_hp: s.max_hp,
                shield: s.shield,
                max_shield: s.max_shield,
                spare_tanks: s.spare_tanks,
                weapon_kind: s.weapon_kind,
                downed: s.downed,
                power_weapon_kind: s.power_weapon_kind,
                charge_progress: s.charge_progress,
                beam_remaining_ticks: s.beam_remaining_ticks,
                beam_kind: s.beam_kind,
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
        // Note: WIRE_VERSION 4 adds orbs to the deterministic state.
        // The wire `StateChecksum` keeps the four-hash shape for now
        // (no schema change); orbs fold into `asteroids_hash` since
        // both are "field debris" semantically. Phase 4 step 9 may
        // add a dedicated `orbs_hash` if drift becomes hard to debug.
        ServerMsg::StateChecksum {
            tick: self.room.tick,
            ships_hash: hash_ships(&self.room.ships),
            enemies_hash: hash_enemies(&self.room.enemies),
            asteroids_hash: hash_asteroids_and_orbs(
                &self.room.asteroids,
                &self.room.orbs,
                &self.room.enemy_mines,
                &self.room.enemy_missiles,
                &self.room.player_mines,
                &self.room.player_missiles,
            ),
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
                    hp: s.hp,
                    max_hp: s.max_hp,
                    shield: s.shield,
                    max_shield: s.max_shield,
                    spare_tanks: s.spare_tanks,
                    weapon_kind: s.weapon_kind,
                    downed: s.downed,
                    power_weapon_kind: s.power_weapon_kind,
                    charge_progress: s.charge_progress,
                    beam_remaining_ticks: s.beam_remaining_ticks,
                    beam_kind: s.beam_kind,
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
                    last_fire_tick: e.last_fire_tick,
                    arc_dir: e.arc_dir,
                    arc_radius: e.arc_radius,
                    arc_omega: e.arc_omega,
                    arc_phase: e.arc_phase,
                    zigzag_phase: e.zigzag_phase,
                    zigzag_amplitude: e.zigzag_amplitude,
                    square_corner_idx: e.square_corner_idx,
                    square_dir: e.square_dir,
                    charge_progress: e.charge_progress,
                    wave_phase: e.wave_phase,
                    wave_amplitude: e.wave_amplitude,
                    spinup_progress: e.spinup_progress,
                    orbit_phase: e.orbit_phase,
                    spiral_phase: e.spiral_phase,
                    sweep_phase: e.sweep_phase,
                    momentum_dir: e.momentum_dir,
                    momentum_t: e.momentum_t,
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
            orbs: self
                .room
                .orbs
                .iter()
                .map(|o| OrbWire {
                    id: o.id,
                    kind: o.kind,
                    x: o.x,
                    y: o.y,
                    vx: o.vx,
                    vy: o.vy,
                    life_ticks: o.life_ticks,
                    opacity: o.opacity,
                })
                .collect(),
            wave_number: self.room.wave.current_wave as u32,
            wave_sub_wave_idx: self.room.wave.sub_wave_idx,
            wave_phase: wave_phase_to_u8(self.room.wave.phase),
            wave_phase_started_tick: self.room.wave.phase_started_tick,
            enemy_bullets: self
                .room
                .enemy_bullets
                .iter()
                .map(|b| EnemyBulletWire {
                    id: b.id,
                    owner_enemy_id: b.owner_enemy_id,
                    x: b.x,
                    y: b.y,
                    vx: b.vx,
                    vy: b.vy,
                    damage: b.damage,
                    radius: b.radius,
                    life_remaining: b.life_remaining,
                })
                .collect(),
            enemy_mines: self
                .room
                .enemy_mines
                .iter()
                .map(|m| EnemyMineWire {
                    id: m.id,
                    owner_enemy_id: m.owner_enemy_id,
                    x: m.x,
                    y: m.y,
                    hp: m.hp,
                    max_hp: m.max_hp,
                    radius: m.radius,
                    contact_damage: m.contact_damage,
                    life_remaining: m.life_remaining,
                })
                .collect(),
            enemy_missiles: self
                .room
                .enemy_missiles
                .iter()
                .map(|m| EnemyMissileWire {
                    id: m.id,
                    owner_enemy_id: m.owner_enemy_id,
                    x: m.x,
                    y: m.y,
                    vx: m.vx,
                    vy: m.vy,
                    damage: m.damage,
                    radius: m.radius,
                    life_remaining: m.life_remaining,
                })
                .collect(),
            // Phase 4 step 6 — Resync carries the full player-mine /
            // player-missile state so clients catching up on a desync
            // can rebuild every active power-weapon entity. Wave 2D
            // power_weapon integration agent owns the actual spawning
            // path; this Resync wiring is the minimal mirror.
            player_mines: self
                .room
                .player_mines
                .iter()
                .map(|m| rainboids_sim::wire::PlayerMineWire {
                    id: m.id,
                    owner_player_id: m.owner_player_id,
                    x: m.x,
                    y: m.y,
                    vx: m.vx,
                    vy: m.vy,
                    angle: m.angle,
                    hp: m.hp,
                    max_hp: m.max_hp,
                    radius: m.radius,
                    trigger_radius: m.trigger_radius,
                    blast_radius: m.blast_radius,
                    blast_damage: m.blast_damage,
                    life_remaining: m.life_remaining,
                })
                .collect(),
            player_missiles: self
                .room
                .player_missiles
                .iter()
                .map(|m| rainboids_sim::wire::PlayerMissileWire {
                    id: m.id,
                    owner_player_id: m.owner_player_id,
                    x: m.x,
                    y: m.y,
                    vx: m.vx,
                    vy: m.vy,
                    damage: m.damage,
                    radius: m.radius,
                    life_remaining: m.life_remaining,
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
                    tracing::warn!(player_id = pid, error = %e, "sim: snapshot encode failed");
                }
            }
        }
    }

    /// Broadcast a generic ServerMsg to every connected slot.
    pub fn broadcast_to_all(&self, msg: &ServerMsg) {
        let bytes = match codec::encode_server(msg) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!(error = %e, "sim: encode failed");
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
                tracing::warn!(error = %e, "sim: peer-event encode failed");
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
                        "sim: Resync encode failed"
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

fn hash_asteroids_and_orbs(
    asteroids: &[AsteroidState],
    orbs: &[OrbState],
    mines: &[EnemyMineState],
    missiles: &[EnemyMissileState],
    player_mines: &[PlayerMineState],
    player_missiles: &[PlayerMissileState],
) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    // Asteroids first — preserves the Phase 3 hash domain for the
    // asteroid portion. Orbs / mines / missiles append in stable order
    // so the same sim state always hashes to the same u64.
    for a in asteroids {
        a.id.hash(&mut h);
        hash_f64(&mut h, a.x);
        hash_f64(&mut h, a.y);
        hash_f64(&mut h, a.rot);
        hash_f64(&mut h, a.hp);
    }
    for o in orbs {
        o.id.hash(&mut h);
        o.kind.hash(&mut h);
        hash_f64(&mut h, o.x);
        hash_f64(&mut h, o.y);
        hash_f64(&mut h, o.vx);
        hash_f64(&mut h, o.vy);
        o.life_ticks.hash(&mut h);
    }
    // Mines + missiles, WIRE_VERSION 8 — field order MUST mirror the
    // client's `hash_asteroids_and_orbs` in `client-wasm/src/lib.rs`
    // (mine: id, x, y, hp, life_remaining; missile: id, x, y, vx, vy,
    // life_remaining) or the checksum will mismatch every heartbeat.
    for m in mines {
        m.id.hash(&mut h);
        hash_f64(&mut h, m.x);
        hash_f64(&mut h, m.y);
        hash_f64(&mut h, m.hp);
        m.life_remaining.hash(&mut h);
    }
    for m in missiles {
        m.id.hash(&mut h);
        hash_f64(&mut h, m.x);
        hash_f64(&mut h, m.y);
        hash_f64(&mut h, m.vx);
        hash_f64(&mut h, m.vy);
        m.life_remaining.hash(&mut h);
    }
    // Phase 4 step 6 (WIRE_VERSION 9) — player mines + player missiles
    // append AFTER enemy mines + missiles. Field order MUST mirror
    // `client-wasm/src/lib.rs::hash_asteroids_and_orbs`:
    //   player_mine:    (id, x, y, hp, life_remaining)
    //   player_missile: (id, x, y, vx, vy, life_remaining)
    // — identical schema to the enemy_mine / enemy_missile slabs above
    // so the checksum stays a single u64 even after the wave expansion.
    for m in player_mines {
        m.id.hash(&mut h);
        hash_f64(&mut h, m.x);
        hash_f64(&mut h, m.y);
        hash_f64(&mut h, m.hp);
        m.life_remaining.hash(&mut h);
    }
    for m in player_missiles {
        m.id.hash(&mut h);
        hash_f64(&mut h, m.x);
        hash_f64(&mut h, m.y);
        hash_f64(&mut h, m.vx);
        hash_f64(&mut h, m.vy);
        m.life_remaining.hash(&mut h);
    }
    h.finish()
}

/// Wire-encode a WavePhase as the discriminator used by `wire.rs`
/// (0=Intro, 1=Spawning, 2=Clearing, 3=Complete). Kept private here
/// since only `build_resync` consumes it.
fn wave_phase_to_u8(p: WavePhase) -> u8 {
    match p {
        WavePhase::Intro => 0,
        WavePhase::Spawning => 1,
        WavePhase::Clearing => 2,
        WavePhase::Complete => 3,
    }
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
pub struct SimRoomHandle {
    pub state: Arc<Mutex<SimRoomState>>,
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

impl SimRoomHandle {
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
        let state = Arc::new(Mutex::new(SimRoomState::from_seed(seed)));
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

fn apply_cmd(s: &mut SimRoomState, cmd: RoomCmd, room_seed: u64) {
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
