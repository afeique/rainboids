//! # rainboids-client-wasm — Phase 3 deterministic mirror
//!
//! WebAssembly bindings exposing the shared `rainboids_sim` crate's
//! `mp1` sim to the Rainboids multiplayer browser client at `/mp`
//! (see `js/mp/mp-main.js`). wasm-pack builds this crate to
//! `js/mp/wasm/` and the browser drives the simulation tick from JS.
//!
//! ## Phase 3 surface (2026-05-18)
//!
//! Wraps `mp1::state::RoomState`. The browser client:
//!
//!   1. Constructs one `World` on boot.
//!   2. On Welcome: calls `seed(welcome.rng_seed)` then
//!      `set_local_player(welcome.player_id)`.
//!   3. Per server `Event` frame: dispatches each `EventPayload` to
//!      the matching `consume_*` method.
//!   4. Per server `Snapshot` frame: calls `apply_snapshot_ship` for
//!      each `SnapshotShip` (skipping the local player's id — the
//!      local ship is locally-predicted; Phase 4 will reconcile).
//!   5. Per `PeerJoined` / `PeerLeft`: calls `ensure_ship` /
//!      `remove_ship`.
//!   6. Per render frame: calls `set_input(...)` + `tick(dt)` then
//!      reads ship/enemy/asteroid/bullet state via the per-entity
//!      accessors.
//!   7. Per server `StateChecksum` frame: compares `checksum_*` to
//!      the server's hashes; on mismatch JS sends `Resync` and on
//!      the reply calls `reset_for_resync` then re-populates via
//!      `apply_snapshot_ship` / `consume_*_spawn` for each entity
//!      in the Resync payload.
//!
//! The Phase-1/2 single-ship accessors (`ship_x`, `ship_y`, ...) are
//! preserved — they now read the LOCAL player's ship via lookup by
//! `local_player_id`. The Phase-1 `World::new()` + `set_input` +
//! `tick(dt)` surface still works for any caller that hasn't migrated
//! to Phase 3 yet (they just operate on an empty room).

use rainboids_sim::mp1::{
    asteroid::{self, AsteroidState},
    bullet::{self, BulletState, PULSE_CANNON_DAMAGE},
    collision,
    damage,
    drops::{self, OrbState},
    enemy::{self, EnemyState},
    ship::update_ship,
    state::{RoomState, ShipState, SHIP_SIZE},
    trig::atan2_64,
    wave::WavePhase,
    weapon::{
        KIND_PULSE_CANNON, KIND_RAIL_DRIVER, KIND_SCATTER_GUN, KIND_STORM_NEEDLES,
    },
    weapon_rail_driver, weapon_scatter_gun, weapon_storm_needles,
    PlayerInput,
};
use wasm_bindgen::prelude::*;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

/// Smoke test: returns `42` so the browser can confirm the WASM
/// module loaded and a call round-tripped through wasm-bindgen
/// successfully.
#[wasm_bindgen]
pub fn smoke_test() -> u32 {
    42
}

/// Static build identifier surfaced to the browser console for
/// debugging which `rainboids-client-wasm` build is loaded.
#[wasm_bindgen]
pub fn build_info() -> String {
    String::from(concat!(
        "rainboids-client-wasm ",
        env!("CARGO_PKG_VERSION"),
        " (Phase 3 mirror)"
    ))
}

/// Opaque handle wrapping a `RoomState` plus the local-player /
/// local-input context. The browser client constructs ONE of these
/// at `/mp` boot; everything in `js/mp/mp-main.js` flows through it.
///
/// JS never sees `RoomState` directly — this struct mediates all
/// reads + writes through scalar accessors.
#[wasm_bindgen]
pub struct World {
    /// Canonical deterministic sim state. Mirrors the server's.
    room: RoomState,
    /// Local player's id, set by JS after Welcome. The single-ship
    /// accessors (`ship_x`, `ship_y`, ...) resolve to this id.
    local_player_id: u32,
    /// Per-tick input for the local player. Updated by `set_input`,
    /// consumed by `tick`. Remote ships get `PlayerInput::neutral()`
    /// each tick (we don't have their inputs; their positions are
    /// corrected by Snapshot frames).
    local_input: PlayerInput,
    /// Server's `Welcome.rng_seed` (cached for reference; `seed()`
    /// stores it here while constructing the `RoomState`).
    rng_seed: u64,
}

#[wasm_bindgen]
impl World {
    /// Construct a fresh `World` with an empty room (seed=0, no
    /// ships, no entities). JS calls `seed()` + `set_local_player()`
    /// immediately after Welcome to bring the world online.
    #[wasm_bindgen(constructor)]
    pub fn new() -> World {
        World {
            room: RoomState::from_seed(0),
            local_player_id: 0,
            local_input: PlayerInput::neutral(),
            rng_seed: 0,
        }
    }

    /// Seed the room's RNG and reset all entity vecs. Called by JS
    /// after receiving `Welcome.rng_seed` (or `Resync.rng_seed`) so
    /// the client's deterministic stream lines up with the server's.
    pub fn seed(&mut self, seed: u64) {
        self.rng_seed = seed;
        self.room = RoomState::from_seed(seed);
    }

    /// Set the local player's id (received in Welcome). The
    /// single-ship accessors (`ship_x`, `ship_y`, ...) resolve to
    /// this id; the `tick()` step uses it to decide which ship in
    /// `room.ships` consumes `local_input`.
    pub fn set_local_player(&mut self, player_id: u32) {
        self.local_player_id = player_id;
    }

    /// Push the local player's input for the next `tick()`. Movement
    /// booleans + world-space aim point. The internal
    /// `PlayerInput.thrust_power` / `speed_mult` defaults are kept
    /// from `PlayerInput::neutral()` so the local ship has solo's
    /// baseline acceleration profile.
    pub fn set_input(
        &mut self,
        up: bool,
        down: bool,
        left: bool,
        right: bool,
        aim_x: f64,
        aim_y: f64,
    ) {
        self.local_input.up = up;
        self.local_input.down = down;
        self.local_input.left = left;
        self.local_input.right = right;
        self.local_input.aim_x = aim_x;
        self.local_input.aim_y = aim_y;
    }

    /// Advance the full sim one tick. Mirrors `mp1_room.rs::step`
    /// exactly in order: ship physics → enemy AI → asteroid drift →
    /// bullet integration → collision (events discarded; entity
    /// mutations kept) → revive ticking → cull → tick++.
    ///
    /// No spawn / fire branches here — those are server-driven and
    /// arrive as `EventPayload`s the client consumes via
    /// `consume_enemy_spawn` / `consume_bullet_spawn` etc. Ditto for
    /// events: collision-side events are discarded; the server's
    /// authoritative events are what JS replays into us.
    ///
    /// `_dt` is accepted for symmetry with the Phase-1 surface but
    /// unused — the sim works in per-tick deltas.
    pub fn tick(&mut self, _dt: f64) {
        let local_pid = self.local_player_id;
        let local_input = self.local_input;

        // 1. Ship physics — drive each ship from its input. Local
        //    ship uses `local_input`; remote ships use neutral
        //    (their authoritative positions are corrected by
        //    Snapshot frames in `apply_snapshot_ship`). Downed local
        //    ship also gets neutral input (matches server's
        //    downed-ship branch in `mp1_room.rs::step`).
        for ship in self.room.ships.iter_mut() {
            let input = if ship.player_id == local_pid && !ship.downed {
                local_input
            } else {
                PlayerInput::neutral()
            };
            update_ship(ship, &input, self.room.field_w, self.room.field_h, 0.0);
        }

        // 2. Enemy AI — build target views from current ships.
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

        // 4.5. Orb drift + magnet + lifetime — mirrors the server's
        //      step 4.5 so the client's deterministic mirror stays
        //      aligned with server orb positions tick-by-tick.
        {
            let ships_snap = self.room.ships.clone();
            for o in self.room.orbs.iter_mut() {
                rainboids_sim::mp1::drops::update_orb(
                    o,
                    &ships_snap,
                    self.room.field_w,
                    self.room.field_h,
                );
            }
        }

        // 5. Collision detection. We discard the emitted events
        //    (server is authoritative for events; we get them back
        //    over the wire and replay via `consume_*`), but the
        //    entity-state mutations + `next_asteroid_id` advance
        //    MUST happen here so the client's deterministic state
        //    stays aligned with the server's tick-by-tick. The
        //    server's `AsteroidSplit` event provides the same
        //    `child_id_start` this call computes.
        let mut _ignored: Vec<collision::CollisionEvent> = Vec::new();
        let added = collision::run_collisions(
            &mut self.room.ships,
            &mut self.room.enemies,
            &mut self.room.asteroids,
            &mut self.room.bullets,
            &mut self.room.orbs,
            self.room.tick,
            &mut self.room.rng,
            self.room.next_asteroid_id,
            &mut _ignored,
        );
        self.room.next_asteroid_id = self.room.next_asteroid_id.wrapping_add(added);

        // 6. Revive ticking — mirrors the server's loop in
        //    `mp1_room.rs::tick_revive_meters` but emits no events.
        let positions: Vec<(u32, f64, f64, bool, bool)> = self
            .room
            .ships
            .iter()
            .map(|s| (s.player_id, s.x, s.y, s.active, s.downed))
            .collect();
        for ship in self.room.ships.iter_mut() {
            if !ship.downed {
                continue;
            }
            let others: Vec<(f64, f64, bool, bool)> = positions
                .iter()
                .filter(|(pid, _, _, _, _)| *pid != ship.player_id)
                .map(|&(_, x, y, a, d)| (x, y, a, d))
                .collect();
            let nearby = damage::count_eligible_revivers(ship.x, ship.y, &others);
            let outcome = damage::tick_revive_meter(ship, nearby);
            if matches!(outcome, damage::ReviveOutcome::JustRevived) {
                damage::revive_ship(ship);
            }
        }

        // 7. Cull dead entities — keeps vecs tight + matches the
        //    server's per-tick retain pass.
        self.room.enemies.retain(|e| e.active);
        self.room.asteroids.retain(|a| a.active);
        self.room.bullets.retain(|b| b.active);
        self.room.orbs.retain(|o| o.active);

        self.room.tick = self.room.tick.wrapping_add(1);
    }

    // ── Snapshot + peer-list ingestion ──

    /// Apply one `SnapshotShip` from a server `Snapshot` frame. The
    /// snapshot is authoritative for ship positions; this corrects
    /// any drift from local prediction. JS calls this once per ship
    /// in the snapshot (including the local one if the JS chooses
    /// not to filter; Phase 4 reconciliation will gate writes to
    /// the local ship behind input replay).
    ///
    /// If no ship matches `player_id`, a placeholder is created with
    /// default HP / radius — the next Snapshot or events will
    /// correct any remaining fields.
    pub fn apply_snapshot_ship(
        &mut self,
        player_id: u32,
        x: f64,
        y: f64,
        vx: f64,
        vy: f64,
        angle: f64,
        hp: f64,
        max_hp: f64,
        shield: f64,
        max_shield: f64,
        spare_tanks: u32,
        weapon_kind: u32,
        downed: bool,
    ) {
        let spare_tanks_u8 = (spare_tanks & 0xff) as u8;
        let weapon_kind_u8 = (weapon_kind & 0xff) as u8;
        if let Some(ship) = self
            .room
            .ships
            .iter_mut()
            .find(|s| s.player_id == player_id)
        {
            ship.x = x;
            ship.y = y;
            ship.vx = vx;
            ship.vy = vy;
            ship.angle = angle;
            ship.hp = hp;
            ship.max_hp = max_hp;
            ship.shield = shield;
            ship.max_shield = max_shield;
            ship.spare_tanks = spare_tanks_u8;
            ship.weapon_kind = weapon_kind_u8;
            ship.downed = downed;
            return;
        }
        let mut new_ship = ShipState::default();
        new_ship.player_id = player_id;
        new_ship.x = x;
        new_ship.y = y;
        new_ship.vx = vx;
        new_ship.vy = vy;
        new_ship.angle = angle;
        new_ship.hp = hp;
        new_ship.max_hp = max_hp;
        new_ship.shield = shield;
        new_ship.max_shield = max_shield;
        new_ship.spare_tanks = spare_tanks_u8;
        new_ship.weapon_kind = weapon_kind_u8;
        new_ship.downed = downed;
        new_ship.radius = SHIP_SIZE * 0.5;
        self.room.ships.push(new_ship);
    }

    /// Ensure a ship slot exists locally. JS calls this on
    /// `PeerJoined` so peers appear in the client's mirror before
    /// the next Snapshot arrives. Idempotent — does nothing if a
    /// ship with the same `player_id` is already present.
    pub fn ensure_ship(&mut self, player_id: u32, spawn_x: f64, spawn_y: f64) {
        if self.room.ships.iter().any(|s| s.player_id == player_id) {
            return;
        }
        let mut new_ship = ShipState::default();
        new_ship.player_id = player_id;
        new_ship.x = spawn_x;
        new_ship.y = spawn_y;
        new_ship.radius = SHIP_SIZE * 0.5;
        self.room.ships.push(new_ship);
    }

    /// Remove a ship from the mirror. JS calls this on `PeerLeft`.
    pub fn remove_ship(&mut self, player_id: u32) {
        self.room.ships.retain(|s| s.player_id != player_id);
    }

    // ── EventPayload consumption ──
    //
    // Each method ingests one `EventPayload` from the server's
    // `Event` frame. They mutate the local `RoomState` identically
    // to the server's deterministic equivalent — so the next
    // `tick()` is consistent with the server's view.

    /// `EventPayload::EnemySpawn`. Instantiates the deterministic
    /// enemy from the same `rng_subseed` the server used. `_kind`
    /// is accepted for forward compatibility; Phase 3 only ships
    /// HUNTER (`KIND_HUNTER = 0`).
    pub fn consume_enemy_spawn(&mut self, enemy_id: u32, _kind: u8, rng_subseed: u64) {
        let e = enemy::spawn_hunter_from_seed(
            enemy_id,
            rng_subseed,
            self.room.field_w,
            self.room.field_h,
        );
        self.room.enemies.push(e);
        if enemy_id >= self.room.next_enemy_id {
            self.room.next_enemy_id = enemy_id.wrapping_add(1);
        }
    }

    /// `EventPayload::AsteroidSpawn`. Instantiates the asteroid via
    /// the same seeded spawn helper the server used so both sides
    /// produce identical state.
    pub fn consume_asteroid_spawn(&mut self, asteroid_id: u32, rng_subseed: u64) {
        let a = asteroid::spawn_from_seed(
            asteroid_id,
            rng_subseed,
            self.room.field_w,
            self.room.field_h,
        );
        self.room.asteroids.push(a);
        if asteroid_id >= self.room.next_asteroid_id {
            self.room.next_asteroid_id = asteroid_id.wrapping_add(1);
        }
    }

    /// `EventPayload::BulletSpawn`. Reconstructs the bullet via the
    /// shared `BulletState::spawn` (same constructor the server uses),
    /// deriving the spawn angle from `(vy, vx)` via the polynomial
    /// `atan2_64`. Phase 4 step 4 — uses `weapon` to look up the
    /// per-weapon damage / piercing / lifetime / speed multipliers via
    /// `mp1::weapon` constants so the client's bullet state matches
    /// the server's bit-for-bit.
    pub fn consume_bullet_spawn(
        &mut self,
        bullet_id: u32,
        owner_player_id: u32,
        origin_x: f64,
        origin_y: f64,
        vx: f64,
        vy: f64,
        spawn_tick: u32,
        weapon: u8,
    ) {
        let angle = atan2_64(vy, vx);
        let (damage, piercing, speed_mult, lifetime_mult) = weapon_constants(weapon);
        let b = BulletState::spawn(
            bullet_id,
            owner_player_id,
            origin_x,
            origin_y,
            angle,
            spawn_tick,
            damage,
            piercing,
            speed_mult,
            lifetime_mult,
        );
        self.room.bullets.push(b);
        if bullet_id >= self.room.next_bullet_id {
            self.room.next_bullet_id = bullet_id.wrapping_add(1);
        }
    }

    /// `EventPayload::BulletHit`. Marks the bullet inactive so it's
    /// culled at the next tick boundary. `_hit_tick` is accepted
    /// for forward compatibility (Phase 4+ may use it for client-
    /// side hit-spark scheduling).
    pub fn consume_bullet_hit(&mut self, bullet_id: u32, _hit_tick: u32) {
        if let Some(b) = self.room.bullets.iter_mut().find(|b| b.id == bullet_id) {
            b.active = false;
            b.life_remaining = 0;
        }
    }

    /// `EventPayload::EnemyDestroy`. Marks the enemy dead so it's
    /// culled at the next tick boundary.
    pub fn consume_enemy_destroy(&mut self, enemy_id: u32) {
        if let Some(e) = self.room.enemies.iter_mut().find(|e| e.id == enemy_id) {
            e.hp = 0.0;
            e.active = false;
        }
    }

    /// `EventPayload::AsteroidSplit`. Finds the parent, computes
    /// the deterministic children via `compute_split_children`
    /// (same fn the server's collision pass calls), pushes the
    /// children, and marks the parent dead. Advances
    /// `next_asteroid_id` by the number of children produced so the
    /// counter stays in sync with the server's monotonic counter.
    pub fn consume_asteroid_split(
        &mut self,
        parent_id: u32,
        rng_subseed: u64,
        child_id_start: u32,
    ) {
        // Snapshot the parent before any mutation (avoids borrow
        // conflict between read + iter_mut).
        let parent_snapshot = self
            .room
            .asteroids
            .iter()
            .find(|a| a.id == parent_id)
            .copied();
        if let Some(parent) = parent_snapshot {
            let children = asteroid::compute_split_children(&parent, rng_subseed, child_id_start);
            let n_children = children.len() as u32;
            for c in children {
                self.room.asteroids.push(c);
            }
            if let Some(p) = self.room.asteroids.iter_mut().find(|a| a.id == parent_id) {
                p.hp = 0.0;
                p.active = false;
            }
            let next_after = child_id_start.wrapping_add(n_children);
            if next_after > self.room.next_asteroid_id {
                self.room.next_asteroid_id = next_after;
            }
        }
    }

    /// `EventPayload::ShipDamaged`. Applies HP loss via the shared
    /// `damage::apply_damage` helper so the downed-transition logic
    /// runs identically to the server's path. The server's
    /// authoritative `ShipDowned` event is delivered separately and
    /// is the source of truth for the downed transition; this call
    /// will mark `downed = true` on its own if the damage takes HP
    /// to zero, which matches the server's collision-pass behavior.
    pub fn consume_ship_damaged(&mut self, player_id: u32, amount: f64) {
        if let Some(s) = self.room.ships.iter_mut().find(|s| s.player_id == player_id) {
            let _ = damage::apply_damage(s, amount);
        }
    }

    /// `EventPayload::ShipDowned`. Forces the ship into the downed
    /// state even if local prediction hadn't reached zero HP yet
    /// (drift recovery). Mirrors the side-effects of
    /// `damage::apply_damage` returning `JustDowned`.
    pub fn consume_ship_downed(&mut self, player_id: u32) {
        if let Some(s) = self.room.ships.iter_mut().find(|s| s.player_id == player_id) {
            s.hp = 0.0;
            s.downed = true;
            s.vx = 0.0;
            s.vy = 0.0;
            s.revive_meter = 0.0;
        }
    }

    /// `EventPayload::ShipRevived`. Revives the ship via the shared
    /// `damage::revive_ship` helper so HP / meter / downed-flag end
    /// up identical to the server's post-revive state.
    pub fn consume_ship_revived(&mut self, player_id: u32) {
        if let Some(s) = self.room.ships.iter_mut().find(|s| s.player_id == player_id) {
            damage::revive_ship(s);
        }
    }

    // ── Phase 4 — Orb + Wave EventPayload consumers ──

    /// `EventPayload::OrbSpawn`. Reconstructs the orb via the same
    /// deterministic helper the server used (`spawn_orb_from_seed`)
    /// so both sides produce identical state.
    pub fn consume_orb_spawn(&mut self, orb_id: u32, kind: u8, x: f64, y: f64, rng_subseed: u64) {
        let o = drops::spawn_orb_from_seed(orb_id, kind, x, y, rng_subseed);
        self.room.orbs.push(o);
        if orb_id >= self.room.next_orb_id {
            self.room.next_orb_id = orb_id.wrapping_add(1);
        }
    }

    /// `EventPayload::OrbCollected`. Marks the orb inactive so it's
    /// culled at the next tick boundary. The picker's HP delta (for
    /// health orbs) lands via the next Snapshot.
    pub fn consume_orb_collected(&mut self, orb_id: u32) {
        if let Some(o) = self.room.orbs.iter_mut().find(|o| o.id == orb_id) {
            o.active = false;
        }
    }

    /// `EventPayload::WaveStart`. Resets the local wave-state mirror
    /// so the HUD wave number stays in sync. Server is authoritative
    /// for the phase machine; the client's local `wave` state is
    /// purely for HUD display + Resync.
    pub fn consume_wave_start(
        &mut self,
        wave_number: u32,
        _asteroid_count: u8,
        _is_boss_wave: bool,
        _boss_tier: u8,
        at_tick: u32,
    ) {
        self.room.wave.current_wave = wave_number as u16;
        self.room.wave.sub_wave_idx = 0;
        self.room.wave.phase = WavePhase::Spawning;
        self.room.wave.phase_started_tick = at_tick;
    }

    /// `EventPayload::WaveClear`. Marks the wave as complete so the
    /// HUD can play its stinger. Server bumps `current_wave` on the
    /// next WaveStart; this just flips the phase.
    pub fn consume_wave_clear(&mut self, _wave_number: u32, at_tick: u32) {
        self.room.wave.phase = WavePhase::Complete;
        self.room.wave.phase_started_tick = at_tick;
    }

    // ── Local-ship accessors (Phase-1 surface; preserved) ──
    //
    // These were the Phase-1/2 single-ship accessors. They now
    // resolve to the LOCAL player's ship via `local_player_id`
    // lookup — the JS HUD / camera / aim code keeps working
    // unchanged.

    /// Look up the local player's ship in the room, returning a
    /// default ShipState if no match (the caller will read 0s,
    /// which is the same fallback the Phase-1 API had on construct).
    fn local_ship(&self) -> ShipState {
        self.room
            .ships
            .iter()
            .find(|s| s.player_id == self.local_player_id)
            .copied()
            .unwrap_or_default()
    }

    pub fn ship_x(&self) -> f64 {
        self.local_ship().x
    }
    pub fn ship_y(&self) -> f64 {
        self.local_ship().y
    }
    pub fn ship_vx(&self) -> f64 {
        self.local_ship().vx
    }
    pub fn ship_vy(&self) -> f64 {
        self.local_ship().vy
    }
    pub fn ship_angle(&self) -> f64 {
        self.local_ship().angle
    }
    pub fn ship_radius(&self) -> f64 {
        self.local_ship().radius
    }
    pub fn ship_hp(&self) -> f64 {
        self.local_ship().hp
    }
    pub fn ship_max_hp(&self) -> f64 {
        self.local_ship().max_hp
    }
    pub fn ship_downed(&self) -> bool {
        self.local_ship().downed
    }
    pub fn ship_shield(&self) -> f64 {
        self.local_ship().shield
    }
    pub fn ship_max_shield(&self) -> f64 {
        self.local_ship().max_shield
    }
    pub fn ship_spare_tanks(&self) -> u32 {
        self.local_ship().spare_tanks as u32
    }
    pub fn ship_revive_meter(&self) -> f64 {
        self.local_ship().revive_meter
    }

    /// World bounds — matches the room's field width (1920).
    pub fn field_width(&self) -> f64 {
        self.room.field_w
    }
    /// World bounds — matches the room's field height (1080).
    pub fn field_height(&self) -> f64 {
        self.room.field_h
    }
    /// Current local tick counter. Advances each `tick()`. Server's
    /// authoritative tick may be ahead/behind; JS uses both for
    /// reconciliation diagnostics.
    pub fn tick_count(&self) -> u32 {
        self.room.tick
    }

    // ── Remote-ship accessors (index by Vec position, skipping local) ──

    /// Count of OTHER ships in the room (excludes the local player).
    /// JS iterates by index `[0, remote_ship_count())` and pulls
    /// per-ship fields via the `remote_ship_*` accessors.
    pub fn remote_ship_count(&self) -> u32 {
        self.room
            .ships
            .iter()
            .filter(|s| s.player_id != self.local_player_id)
            .count() as u32
    }

    fn remote_ship_at(&self, idx: u32) -> Option<ShipState> {
        self.room
            .ships
            .iter()
            .filter(|s| s.player_id != self.local_player_id)
            .nth(idx as usize)
            .copied()
    }

    pub fn remote_ship_player_id(&self, idx: u32) -> u32 {
        self.remote_ship_at(idx).map(|s| s.player_id).unwrap_or(0)
    }
    pub fn remote_ship_x(&self, idx: u32) -> f64 {
        self.remote_ship_at(idx).map(|s| s.x).unwrap_or(0.0)
    }
    pub fn remote_ship_y(&self, idx: u32) -> f64 {
        self.remote_ship_at(idx).map(|s| s.y).unwrap_or(0.0)
    }
    pub fn remote_ship_angle(&self, idx: u32) -> f64 {
        self.remote_ship_at(idx).map(|s| s.angle).unwrap_or(0.0)
    }
    pub fn remote_ship_hp(&self, idx: u32) -> f64 {
        self.remote_ship_at(idx).map(|s| s.hp).unwrap_or(0.0)
    }
    pub fn remote_ship_max_hp(&self, idx: u32) -> f64 {
        self.remote_ship_at(idx).map(|s| s.max_hp).unwrap_or(1.0)
    }
    pub fn remote_ship_downed(&self, idx: u32) -> bool {
        self.remote_ship_at(idx)
            .map(|s| s.downed)
            .unwrap_or(false)
    }

    // ── Enemy accessors ──

    /// Count of live enemies in the room.
    pub fn enemy_count(&self) -> u32 {
        self.room.enemies.len() as u32
    }

    fn enemy_at(&self, idx: u32) -> Option<EnemyState> {
        self.room.enemies.get(idx as usize).copied()
    }

    pub fn enemy_id(&self, idx: u32) -> u32 {
        self.enemy_at(idx).map(|e| e.id).unwrap_or(0)
    }
    pub fn enemy_kind(&self, idx: u32) -> u8 {
        self.enemy_at(idx).map(|e| e.kind).unwrap_or(0)
    }
    pub fn enemy_x(&self, idx: u32) -> f64 {
        self.enemy_at(idx).map(|e| e.x).unwrap_or(0.0)
    }
    pub fn enemy_y(&self, idx: u32) -> f64 {
        self.enemy_at(idx).map(|e| e.y).unwrap_or(0.0)
    }
    pub fn enemy_angle(&self, idx: u32) -> f64 {
        self.enemy_at(idx).map(|e| e.angle).unwrap_or(0.0)
    }
    pub fn enemy_hp(&self, idx: u32) -> f64 {
        self.enemy_at(idx).map(|e| e.hp).unwrap_or(0.0)
    }
    pub fn enemy_max_hp(&self, idx: u32) -> f64 {
        self.enemy_at(idx).map(|e| e.max_hp).unwrap_or(1.0)
    }
    pub fn enemy_radius(&self, idx: u32) -> f64 {
        self.enemy_at(idx).map(|e| e.radius).unwrap_or(0.0)
    }

    // ── Asteroid accessors ──

    /// Count of live asteroids in the room.
    pub fn asteroid_count(&self) -> u32 {
        self.room.asteroids.len() as u32
    }

    fn asteroid_at(&self, idx: u32) -> Option<AsteroidState> {
        self.room.asteroids.get(idx as usize).copied()
    }

    pub fn asteroid_id(&self, idx: u32) -> u32 {
        self.asteroid_at(idx).map(|a| a.id).unwrap_or(0)
    }
    pub fn asteroid_x(&self, idx: u32) -> f64 {
        self.asteroid_at(idx).map(|a| a.x).unwrap_or(0.0)
    }
    pub fn asteroid_y(&self, idx: u32) -> f64 {
        self.asteroid_at(idx).map(|a| a.y).unwrap_or(0.0)
    }
    pub fn asteroid_rot(&self, idx: u32) -> f64 {
        self.asteroid_at(idx).map(|a| a.rot).unwrap_or(0.0)
    }
    pub fn asteroid_radius(&self, idx: u32) -> f64 {
        self.asteroid_at(idx).map(|a| a.radius).unwrap_or(0.0)
    }
    pub fn asteroid_hp(&self, idx: u32) -> f64 {
        self.asteroid_at(idx).map(|a| a.hp).unwrap_or(0.0)
    }
    pub fn asteroid_max_hp(&self, idx: u32) -> f64 {
        self.asteroid_at(idx).map(|a| a.max_hp).unwrap_or(1.0)
    }

    // ── Bullet accessors ──

    /// Count of live bullets in the room.
    pub fn bullet_count(&self) -> u32 {
        self.room.bullets.len() as u32
    }

    fn bullet_at(&self, idx: u32) -> Option<BulletState> {
        self.room.bullets.get(idx as usize).copied()
    }

    pub fn bullet_id(&self, idx: u32) -> u32 {
        self.bullet_at(idx).map(|b| b.id).unwrap_or(0)
    }
    pub fn bullet_owner(&self, idx: u32) -> u32 {
        self.bullet_at(idx).map(|b| b.owner_player_id).unwrap_or(0)
    }
    /// Bullet x at the current tick — `position_at` is pure
    /// arithmetic (no trig, no RNG) so it's bit-exact across
    /// runtimes. JS reads this each render frame for the bullet
    /// sprite position.
    pub fn bullet_x(&self, idx: u32) -> f64 {
        self.bullet_at(idx)
            .map(|b| {
                let (x, _) = b.position_at(self.room.tick);
                x
            })
            .unwrap_or(0.0)
    }
    /// Bullet y at the current tick. See `bullet_x` for rationale.
    pub fn bullet_y(&self, idx: u32) -> f64 {
        self.bullet_at(idx)
            .map(|b| {
                let (_, y) = b.position_at(self.room.tick);
                y
            })
            .unwrap_or(0.0)
    }

    // ── Orb accessors ──

    pub fn orb_count(&self) -> u32 {
        self.room.orbs.len() as u32
    }
    fn orb_at(&self, idx: u32) -> Option<OrbState> {
        self.room.orbs.get(idx as usize).copied()
    }
    pub fn orb_id(&self, idx: u32) -> u32 {
        self.orb_at(idx).map(|o| o.id).unwrap_or(0)
    }
    pub fn orb_kind(&self, idx: u32) -> u8 {
        self.orb_at(idx).map(|o| o.kind).unwrap_or(0)
    }
    pub fn orb_x(&self, idx: u32) -> f64 {
        self.orb_at(idx).map(|o| o.x).unwrap_or(0.0)
    }
    pub fn orb_y(&self, idx: u32) -> f64 {
        self.orb_at(idx).map(|o| o.y).unwrap_or(0.0)
    }
    pub fn orb_opacity(&self, idx: u32) -> f64 {
        self.orb_at(idx).map(|o| o.opacity).unwrap_or(0.0)
    }

    // ── Wave accessors ──

    pub fn wave_number(&self) -> u32 {
        self.room.wave.current_wave as u32
    }
    /// 0 = Intro, 1 = Spawning, 2 = Clearing, 3 = Complete.
    pub fn wave_phase(&self) -> u8 {
        match self.room.wave.phase {
            WavePhase::Intro => 0,
            WavePhase::Spawning => 1,
            WavePhase::Clearing => 2,
            WavePhase::Complete => 3,
        }
    }

    // ── StateChecksum ──
    //
    // Four u64 hashes — JS reads each one and compares to the
    // server's `ServerMsg::StateChecksum` heartbeat fields. On
    // mismatch, JS sends `ClientMsg::Resync` and the resulting
    // `Resync` reply is fed back via `reset_for_resync` +
    // `apply_snapshot_ship` + `consume_*_spawn` for each entity.
    //
    // Each helper MUST hash the SAME fields in the SAME order as
    // the server's `mp1_room.rs::hash_*` functions — any divergence
    // turns the heartbeat into a Resync flood.

    pub fn checksum_ships(&self) -> u64 {
        hash_ships(&self.room.ships)
    }
    pub fn checksum_enemies(&self) -> u64 {
        hash_enemies(&self.room.enemies)
    }
    /// WIRE_VERSION 4: this hash now bundles orbs after asteroids so
    /// the server's `hash_asteroids_and_orbs` and the client's hash
    /// stay in sync.
    pub fn checksum_asteroids(&self) -> u64 {
        hash_asteroids_and_orbs(&self.room.asteroids, &self.room.orbs)
    }
    pub fn checksum_bullets(&self) -> u64 {
        hash_bullets(&self.room.bullets)
    }

    // ── Resync ingestion ──

    /// Reset the room for a fresh `Resync` payload. JS calls this
    /// with `Resync.rng_seed` + `Resync.tick`, then iterates the
    /// payload's ships / enemies / asteroids / bullets and calls
    /// `apply_snapshot_ship` + `consume_*_spawn` for each. Keeps
    /// the WASM ↔ JS boundary string-free (no bincode here; JS's
    /// decoder owns the wire shape).
    pub fn reset_for_resync(&mut self, seed: u64, tick: u32) {
        self.rng_seed = seed;
        self.room = RoomState::from_seed(seed);
        self.room.tick = tick;
    }
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}

// ── Hash helpers — MUST match `server-bin/src/mp1_room.rs::hash_*` ──
//
// Same `DefaultHasher`, same field order, same `to_bits()` for f64.
// Any change here MUST be paired with a matching change in
// `mp1_room.rs`; otherwise the StateChecksum heartbeat will trigger
// false-positive Resync requests every second.

/// Hash an f64 by its IEEE 754 bit pattern. `to_bits()` is
/// deterministic across runtimes, unlike floating-point arithmetic
/// itself. Server's helper uses the same form.
fn hash_f64(state: &mut DefaultHasher, x: f64) {
    x.to_bits().hash(state);
}

fn hash_ships(ships: &[ShipState]) -> u64 {
    let mut h = DefaultHasher::new();
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
    let mut h = DefaultHasher::new();
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

fn hash_asteroids_and_orbs(asteroids: &[AsteroidState], orbs: &[OrbState]) -> u64 {
    let mut h = DefaultHasher::new();
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
    h.finish()
}

fn hash_bullets(bullets: &[BulletState]) -> u64 {
    let mut h = DefaultHasher::new();
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

/// Look up the per-weapon (damage, piercing, speed_mult, lifetime_mult)
/// from a `weapon: u8` discriminator. Mirrors the per-weapon module
/// constants exactly; unknown weapons fall back to PULSE_CANNON.
fn weapon_constants(weapon: u8) -> (f64, u8, f64, f64) {
    match weapon {
        KIND_PULSE_CANNON => (PULSE_CANNON_DAMAGE, 0, 1.0, 1.0),
        KIND_STORM_NEEDLES => (
            weapon_storm_needles::DAMAGE,
            weapon_storm_needles::PIERCING,
            weapon_storm_needles::BULLET_SPEED_MULT,
            weapon_storm_needles::BULLET_LIFETIME_MULT,
        ),
        KIND_SCATTER_GUN => (
            weapon_scatter_gun::DAMAGE,
            weapon_scatter_gun::PIERCING,
            weapon_scatter_gun::BULLET_SPEED_MULT,
            weapon_scatter_gun::BULLET_LIFETIME_MULT,
        ),
        KIND_RAIL_DRIVER => (
            weapon_rail_driver::DAMAGE,
            weapon_rail_driver::PIERCING,
            weapon_rail_driver::BULLET_SPEED_MULT,
            weapon_rail_driver::BULLET_LIFETIME_MULT,
        ),
        _ => (PULSE_CANNON_DAMAGE, 0, 1.0, 1.0),
    }
}
