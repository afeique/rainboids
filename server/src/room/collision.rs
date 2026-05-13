//! Room-actor collision wrapper. Bridges the pure `sim::collision::detect_*`
//! steps to authoritative `GameState`.
//!
//! ─── Why this lives here, not in `sim/mod.rs` ───────────────────────
//!
//! The pure detect-steps in `sim::collision` take view types
//! (`CollisionBullet`, `CollisionAsteroid`, `CollisionEnemy`, ...) and emit
//! sim-layer `CollisionEvent`s — distinct from the wire-format `GameEvent`
//! that flows out of `simulate_tick` to clients. Bridging between the two
//! is fundamentally a *wrapper* concern: build views from the authoritative
//! storage, drive the pure steps, drain events, mutate storage.
//!
//! `simulate_tick` in `sim/mod.rs` already calls `collision::detect_and_resolve`
//! as a no-op stub (Phase 3 wire-bridge). We layer the room-actor drain on
//! top of `simulate_tick` rather than hijacking the stub, so the pure-step
//! signature stays clean (`&mut Vec<GameEvent>`) and the wrapper owns the
//! sim-layer `Vec<CollisionEvent>` lifetime.
//!
//! ─── MVD scope ──────────────────────────────────────────────────────
//!
//! For the MVD slice (ships only — `simulate_tick` populates `state.ships`,
//! and the other entity Vecs stay empty), the drain runs but emits zero
//! events because the input collections are empty. Wiring is in place so
//! that when bullets / enemies / asteroids / drops get synced into
//! `GameState`, this slice doesn't need re-architecting — only the view-
//! builders need to round-trip the new wire fields, and the drain handlers
//! flip from no-op stubs to real damage application.
//!
//! ─── Side-table HP storage ──────────────────────────────────────────
//!
//! Wire-format `AsteroidState` carries only `{id, size, x, y}` — NO `hp` —
//! because asteroids are deterministic from seed + tick on the client and
//! HP doesn't need to traverse the wire. The room actor still needs a
//! local HP store to drive the despawn decision, so we track it in a
//! side-table on `Room` (`asteroid_hp`). Same applies to drops (wire has
//! no `active` flag — local side-state holds the pickup latch).
//!
//! Enemy HP IS on the wire (`EnemyState.hp`), so we mutate it in-place on
//! `GameState.enemies` directly; no side-table needed.

use std::collections::HashMap;

use crate::protocol::{AsteroidId, DropId, EnemyId, GameEvent};
use crate::sim::collision::{
    detect_bullet_asteroid_hits, detect_bullet_enemy_hits, detect_enemy_asteroid_hits,
    detect_nova_blast_hits, detect_player_asteroid_hits, detect_player_drop_pickups,
    detect_player_enemy_bullet_hits, detect_player_enemy_hits, CollisionAsteroid, CollisionBullet,
    CollisionContext, CollisionDrop, CollisionEnemy, CollisionEnemyBullet, CollisionEvent,
    CollisionPlayer, TriggerKind,
};
use crate::sim::drops::DropKind;
use crate::sim::state::GameState;

/// Side-state the wrapper keeps per-entity to bridge wire-format gaps.
///
/// The wire `AsteroidState` / `DropState` types don't carry every field
/// the collision drain needs (asteroid HP, drop active-latch, etc.).
/// Rather than rewiring the wire schema, the room actor holds the gap-
/// filling state here and joins it to `GameState` when building Collision
/// views. Keyed by the narrowed-to-`u32` id space the pure step expects.
#[derive(Debug, Default)]
pub struct CollisionSideState {
    /// Per-asteroid HP, keyed by `AsteroidId.0 as u32`. Asteroids missing
    /// from this map default to `1.0` HP (one-shot kill) — matches the
    /// minimum-viable behavior for follow-up PRs to override.
    pub asteroid_hp: HashMap<u32, f32>,
    /// Per-drop active-latch, keyed by `DropId.0 as u32`. `false` ⇒ pickup
    /// already claimed this tick (filter out from the next collision pass).
    pub drop_active: HashMap<u32, bool>,
    /// Per-bullet pierced-asteroid id set, carried across ticks.
    /// Keyed by `BulletId.0 as u32`. Bullets missing from this map
    /// start with an empty set on their next detect-call.
    pub bullet_pierced_asteroid_ids: HashMap<u32, std::collections::HashSet<u32>>,
    /// Per-bullet pierced-enemy id set, carried across ticks.
    pub bullet_pierced_enemy_ids: HashMap<u32, std::collections::HashSet<u32>>,
    /// Per-bullet pierced-target counter (shared across asteroid+enemy
    /// passes). Mirrors `bullet.pierced_enemies` in the JS source.
    pub bullet_pierced_count: HashMap<u32, i32>,
}

impl CollisionSideState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get HP for an asteroid id, defaulting to `1.0` if missing.
    pub fn get_asteroid_hp(&self, id: u32) -> f32 {
        self.asteroid_hp.get(&id).copied().unwrap_or(1.0)
    }

    /// Apply damage to an asteroid; return new HP. Inserts on first hit.
    pub fn damage_asteroid(&mut self, id: u32, damage: f32) -> f32 {
        let hp = self.asteroid_hp.entry(id).or_insert(1.0);
        *hp -= damage;
        *hp
    }
}

/// Drive all pair-detection passes and drain emitted `CollisionEvent`s
/// into `GameState` mutations.
///
/// Call order (matches `js/sim/collision.js` dispatch order):
///   1. bullet-vs-asteroid
///   2. bullet-vs-enemy
///   3. player-vs-asteroid
///   4. player-vs-enemy
///   5. enemy-vs-asteroid
///   6. player-vs-enemy-bullet
///   7. player-vs-drop pickup
///   8. nova-blast (if any active blasts; deferred — no NovaBlast source yet)
///
/// MVD scope: bullets, enemies, asteroids, and drops are all empty Vecs
/// on `GameState` until subsequent PRs sync them in. The detect-steps
/// short-circuit on empty input slices, so the drain is a guaranteed
/// no-op today and a fully-wired pipeline tomorrow.
///
/// `wire_events` is the wire-format event Vec already populated by
/// `simulate_tick` — the drain APPENDS wire events for damage / despawn
/// effects clients need to see, but never clears it.
pub fn drain(state: &mut GameState, side: &mut CollisionSideState, wire_events: &mut Vec<GameEvent>) {
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    // ── Build view collections from GameState + side-state ──
    //
    // MVD note: all of these Vecs are empty in the current ship-only slice.
    // The detect-steps no-op on empty slices, so this is cheap.

    let mut bullets: Vec<CollisionBullet> = build_bullets(state, side);
    let asteroids: Vec<CollisionAsteroid> = build_asteroids(state, side);
    let enemies: Vec<CollisionEnemy> = build_enemies(state);
    let players: Vec<CollisionPlayer> = build_players(state);
    let enemy_bullets: Vec<CollisionEnemyBullet> = build_enemy_bullets(state);
    let drops: Vec<CollisionDrop> = build_drops(state, side);

    // ── Pass 1: bullet-vs-asteroid ──
    detect_bullet_asteroid_hits(&mut bullets, &asteroids, &ctx, &mut events);

    // ── Pass 2: bullet-vs-enemy ──
    detect_bullet_enemy_hits(&mut bullets, &enemies, &ctx, &mut events);

    // ── Pass 3: player-vs-asteroid ──
    detect_player_asteroid_hits(&players, &asteroids, &ctx, &mut events);

    // ── Pass 4: player-vs-enemy ──
    detect_player_enemy_hits(&players, &enemies, &ctx, &mut events);

    // ── Pass 5: enemy-vs-asteroid ──
    detect_enemy_asteroid_hits(&enemies, &asteroids, &ctx, &mut events);

    // ── Pass 6: player-vs-enemy-bullet ──
    detect_player_enemy_bullet_hits(&players, &enemy_bullets, &ctx, &mut events);

    // ── Pass 7: player-vs-drop pickup ──
    detect_player_drop_pickups(&players, &drops, &ctx, &mut events);

    // ── Pass 8: nova-blast (deferred — no blast source plumbed yet) ──
    //
    // The pure step is callable today, but the room actor has no
    // `pending_nova_blasts` Vec yet (no power-weapon plumbing in MVD scope).
    // When NOVA_BLAST is wired in, the wrapper will iterate active blasts
    // and call `detect_nova_blast_hits` per blast.
    let _ = detect_nova_blast_hits; // silence unused-import warning

    // ── Persist mutated bullet pierce state back into side-table ──
    for bullet in bullets.iter() {
        side.bullet_pierced_asteroid_ids
            .insert(bullet.id, bullet.pierced_asteroid_ids.clone());
        side.bullet_pierced_enemy_ids
            .insert(bullet.id, bullet.pierced_enemy_ids.clone());
        side.bullet_pierced_count
            .insert(bullet.id, bullet.pierced_enemies);
    }

    // ── Drain events; apply effects to GameState ──
    for event in events.drain(..) {
        apply_event(event, state, side, wire_events);
    }

    // ── Despawn pass: remove asteroids/drops/enemies marked dead ──
    despawn_dead_asteroids(state, side, wire_events);
    despawn_dead_enemies(state, wire_events);
    despawn_consumed_drops(state, side);
}

/// Dispatch a single `CollisionEvent` to a `GameState` mutation. Each variant
/// is currently a minimal stub — for MVD scope what matters is the LOOP is
/// wired so that bullet / enemy / asteroid PRs landing later can flesh out
/// damage formulas, impulse application, and drop-effect resolution without
/// re-architecting the drain.
///
/// Public so integration tests can drive individual events through the
/// drain without going through the (currently empty) view-builder path.
pub fn apply_event(
    event: CollisionEvent,
    state: &mut GameState,
    side: &mut CollisionSideState,
    wire_events: &mut Vec<GameEvent>,
) {
    match event {
        CollisionEvent::BulletHitAsteroid {
            asteroid_id,
            damage,
            bullet_id,
            bullet_will_despawn,
            ..
        } => {
            // Apply asteroid HP loss. Despawn pass will prune at hp <= 0.
            side.damage_asteroid(asteroid_id, damage);

            // Bullet despawn — emit wire event so clients can release the FX.
            // BulletId is a wire-format newtype around u64; the pure step
            // narrowed to u32 for storage. Restore by widening.
            if bullet_will_despawn {
                wire_events.push(GameEvent::BulletDespawn {
                    id: crate::protocol::BulletId(bullet_id as u64),
                    reason: crate::protocol::DespawnReason::Hit,
                });
            }
        }
        CollisionEvent::PlayerHitAsteroid {
            player_id,
            damage_to_asteroid,
            asteroid_id,
            // Impulses + separation are wrapper-side velocity / position
            // mutations. MVD ship-only scope has no asteroids; left as
            // a stub so the slice can be filled when asteroid sync lands.
            ..
        } => {
            // Asteroid takes a chip of damage from the ramming player.
            side.damage_asteroid(asteroid_id, damage_to_asteroid);
            // Player damage on ramming — the JS event does NOT carry a
            // damage_to_player field (asteroid-ramming damage is computed
            // wrapper-side from `PLAYER_ASTEROID_COLLISION_DAMAGE`). For
            // MVD scope we leave it as a no-op; the asteroid-ramming PR
            // will plug in the player HP loss + impulse application.
            let _ = player_id;
        }
        CollisionEvent::BulletHitEnemy {
            enemy_id,
            damage,
            bullet_id,
            bullet_will_despawn,
            ..
        } => {
            // Apply enemy HP loss in-place on GameState.enemies.
            if let Some(enemy) = state.enemies.iter_mut().find(|e| e.id.0 as u32 == enemy_id) {
                enemy.hp -= damage;
            }
            if bullet_will_despawn {
                wire_events.push(GameEvent::BulletDespawn {
                    id: crate::protocol::BulletId(bullet_id as u64),
                    reason: crate::protocol::DespawnReason::Hit,
                });
            }
        }
        CollisionEvent::PlayerHitEnemy {
            player_id,
            enemy_id,
            damage_to_enemy,
            ..
        } => {
            // Enemy HP loss from player ramming.
            if let Some(enemy) = state.enemies.iter_mut().find(|e| e.id.0 as u32 == enemy_id) {
                enemy.hp -= damage_to_enemy;
            }
            // Player damage from ramming the enemy. The JS event carries
            // `damage_to_enemy` but the player's reciprocal damage is the
            // const `PLAYER_ENEMY_COLLISION_DAMAGE` applied wrapper-side.
            // MVD scope: no-op stub — enemy sync PR will plumb it in.
            let _ = player_id;
        }
        CollisionEvent::EnemyHitAsteroid {
            enemy_id,
            asteroid_id,
            ..
        } => {
            // Pure push-impulse pair: no HP changes, only velocity nudges.
            // The wire-format `EnemyState` / `AsteroidState` carry no
            // velocity field, so the impulse is currently a no-op. When the
            // wire schema gains velocity (or when the room actor caches it
            // separately for prediction), this slice plugs in the
            // `enemy.vx += ev.enemy_impulse_dx` mutations.
            let _ = (enemy_id, asteroid_id);
        }
        CollisionEvent::PlayerHitByEnemyBullet {
            player_id,
            damage,
            bullet_id,
            ..
        } => {
            // Player HP loss from enemy bullet.
            if let Some(ship) =
                state.ships.iter_mut().find(|s| s.player.0 as u32 == player_id)
            {
                ship.hp -= damage;
                wire_events.push(GameEvent::PlayerDamaged {
                    player: ship.player,
                    hp: ship.hp,
                });
            }
            // Enemy bullet despawns on hit.
            wire_events.push(GameEvent::BulletDespawn {
                id: crate::protocol::BulletId(bullet_id as u64),
                reason: crate::protocol::DespawnReason::Hit,
            });
        }
        CollisionEvent::PlayerPickupDrop {
            player_id,
            drop_id,
            drop_kind,
            value,
            ..
        } => {
            // Mark drop consumed (despawn pass removes from GameState).
            side.drop_active.insert(drop_id, false);

            // Apply pickup effect to the picking-up ship.
            if let Some(ship) =
                state.ships.iter_mut().find(|s| s.player.0 as u32 == player_id)
            {
                match drop_kind {
                    DropKind::Health => {
                        ship.hp += value as f32;
                    }
                    DropKind::MoneyShape | DropKind::MoneyPixel => {
                        // Coin pickup — emit wire event for client UI. The
                        // server has no per-room coin authority yet
                        // (currency lives client-side); emit the event so
                        // clients update their HUD.
                        wire_events.push(GameEvent::OrbCollect {
                            id: DropId(drop_id as u64),
                            by: ship.player,
                            value: value as u32,
                        });
                    }
                    DropKind::Powerup => {
                        // Powerup dispatch is a future-PR concern.
                    }
                }
            }
        }
        CollisionEvent::NovaHitEnemy {
            enemy_id, damage, ..
        } => {
            if let Some(enemy) = state.enemies.iter_mut().find(|e| e.id.0 as u32 == enemy_id) {
                enemy.hp -= damage;
            }
        }
        CollisionEvent::NovaHitAsteroid {
            asteroid_id,
            damage,
            ..
        } => {
            side.damage_asteroid(asteroid_id, damage);
        }
        CollisionEvent::MineDetonated {
            damage,
            trigger_kind,
            trigger_id,
            ..
        } => {
            // Mine-trigger AoE: apply flat blast damage to the trigger
            // target. Daisy-chain detonation of other mines inside the
            // explosion is the wrapper's responsibility — for MVD scope
            // we apply the trigger-target damage only.
            match trigger_kind {
                TriggerKind::Enemy => {
                    if let Some(enemy) =
                        state.enemies.iter_mut().find(|e| e.id.0 as u32 == trigger_id)
                    {
                        enemy.hp -= damage;
                    }
                }
                TriggerKind::Asteroid => {
                    side.damage_asteroid(trigger_id, damage);
                }
            }
        }
        CollisionEvent::LanceHitEnemy {
            target_id, damage, ..
        } => {
            if let Some(enemy) =
                state.enemies.iter_mut().find(|e| e.id.0 as u32 == target_id)
            {
                enemy.hp -= damage;
            }
        }
        CollisionEvent::LanceHitAsteroid {
            target_id, damage, ..
        } => {
            side.damage_asteroid(target_id, damage);
        }
        CollisionEvent::MissileHitEnemy {
            target_id, damage, ..
        } => {
            if let Some(enemy) =
                state.enemies.iter_mut().find(|e| e.id.0 as u32 == target_id)
            {
                enemy.hp -= damage;
            }
        }
        CollisionEvent::MissileHitAsteroid {
            target_id, damage, ..
        } => {
            side.damage_asteroid(target_id, damage);
        }
    }
}

// ─── View builders — GameState → CollisionView ──────────────────────
//
// MVD scope: bullets / enemy bullets / drops / nova-blast sources have
// no `GameState` storage yet (the wire-format collections are limited
// to ships, enemies, asteroids, drops, and none of them carry the full
// physics field set the pure detect-steps need). The builders below
// produce empty Vecs today; subsequent PRs add the field plumbing as
// each entity gets wired into the snapshot.

fn build_bullets(_state: &GameState, _side: &mut CollisionSideState) -> Vec<CollisionBullet> {
    // No player-bullet collection on GameState yet — the simulate_tick
    // bullet update is stubbed in `sim/bullet.rs`. When bullets get
    // their wire field set, this builder joins it with the
    // side-table's pierced sets.
    Vec::new()
}

fn build_asteroids(state: &GameState, side: &CollisionSideState) -> Vec<CollisionAsteroid> {
    state
        .asteroids
        .iter()
        .map(|a| {
            let id_u32 = a.id.0 as u32;
            let _hp = side.get_asteroid_hp(id_u32);
            CollisionAsteroid {
                id: id_u32,
                x: a.x,
                y: a.y,
                vx: 0.0,
                vy: 0.0,
                // Asteroid size → radius mapping. The wire schema uses a
                // `size` discriminator (u8 0..N); for MVD scope we use a
                // fixed 30 px radius (matches the live game's mid-size
                // default). Subsequent PRs key this on `size`.
                radius: 30.0,
                mass: None,
                active: true,
                warping: false,
                death_flash: 0,
            }
        })
        .collect()
}

fn build_enemies(state: &GameState) -> Vec<CollisionEnemy> {
    state
        .enemies
        .iter()
        .map(|e| CollisionEnemy {
            id: e.id.0 as u32,
            x: e.x,
            y: e.y,
            vx: 0.0,
            vy: 0.0,
            // Enemy radius defaults to 18 (HUNTER). Subsequent PRs key on
            // `kind` for per-type radii.
            radius: 18.0,
            mass: None,
            hp: e.hp,
            active: e.hp > 0.0,
            warping: false,
            death_flash: 0,
        })
        .collect()
}

fn build_players(state: &GameState) -> Vec<CollisionPlayer> {
    state
        .ships
        .iter()
        .map(|s| CollisionPlayer {
            id: s.player.0 as u32,
            x: s.x,
            y: s.y,
            vx: s.vx,
            vy: s.vy,
            // Ship radius matches the live `Player` class default of 15.
            radius: 15.0,
            mass: None,
            active: s.hp > 0.0,
        })
        .collect()
}

fn build_enemy_bullets(_state: &GameState) -> Vec<CollisionEnemyBullet> {
    // No enemy-bullet collection on GameState yet — the simulate_tick
    // enemy-bullet update is stubbed in `sim/bullet.rs`. Same plumbing
    // story as `build_bullets`.
    Vec::new()
}

fn build_drops(state: &GameState, side: &CollisionSideState) -> Vec<CollisionDrop> {
    state
        .drops
        .iter()
        .map(|d| {
            let id_u32 = d.id.0 as u32;
            let active = side.drop_active.get(&id_u32).copied().unwrap_or(true);
            CollisionDrop {
                id: id_u32,
                x: d.x,
                y: d.y,
                radius: 14.0,
                kind: drop_kind_from_u8(d.kind),
                value: 1,
                active,
            }
        })
        .collect()
}

fn drop_kind_from_u8(tag: u8) -> DropKind {
    match tag {
        0 => DropKind::Health,
        1 => DropKind::MoneyShape,
        2 => DropKind::MoneyPixel,
        3 => DropKind::Powerup,
        _ => DropKind::Health,
    }
}

// ─── Despawn passes ────────────────────────────────────────────────

/// Drain dead asteroids from `GameState.asteroids`, emit `AsteroidDestroy`
/// wire events, and clean up side-state. Public so integration tests can
/// drive the despawn pass without going through `drain`.
pub fn despawn_dead_asteroids(
    state: &mut GameState,
    side: &mut CollisionSideState,
    wire_events: &mut Vec<GameEvent>,
) {
    let mut survivors = Vec::with_capacity(state.asteroids.len());
    for a in state.asteroids.drain(..) {
        let id_u32 = a.id.0 as u32;
        let hp = side.asteroid_hp.get(&id_u32).copied().unwrap_or(1.0);
        if hp <= 0.0 {
            wire_events.push(GameEvent::AsteroidDestroy {
                id: AsteroidId(a.id.0),
                by: None,
                fragments: Vec::new(),
            });
            side.asteroid_hp.remove(&id_u32);
        } else {
            survivors.push(a);
        }
    }
    state.asteroids = survivors;
}

fn despawn_dead_enemies(state: &mut GameState, wire_events: &mut Vec<GameEvent>) {
    let mut survivors = Vec::with_capacity(state.enemies.len());
    for e in state.enemies.drain(..) {
        if e.hp <= 0.0 {
            wire_events.push(GameEvent::EnemyDestroy {
                id: EnemyId(e.id.0),
                by: None,
                drops: Vec::new(),
            });
        } else {
            survivors.push(e);
        }
    }
    state.enemies = survivors;
}

fn despawn_consumed_drops(state: &mut GameState, side: &mut CollisionSideState) {
    state.drops.retain(|d| {
        let id_u32 = d.id.0 as u32;
        side.drop_active.get(&id_u32).copied().unwrap_or(true)
    });
    // Side-table cleanup for drops that no longer exist in GameState.
    let live_ids: std::collections::HashSet<u32> =
        state.drops.iter().map(|d| d.id.0 as u32).collect();
    side.drop_active.retain(|id, _| live_ids.contains(id));
}
