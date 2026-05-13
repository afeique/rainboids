//! Room-actor collision drain wiring tests.
//!
//! Validates that `room::collision::drain` correctly:
//!   1. Calls the pure `detect_*_hits` steps for every entity-pair.
//!   2. Drains emitted `CollisionEvent`s into `GameState` mutations.
//!   3. Despawns dead asteroids / dead enemies / consumed drops.
//!   4. Emits matching wire-format `GameEvent`s for client visibility.
//!
//! MVD scope: bullets / enemy bullets are not yet stored on `GameState`
//! (the `simulate_tick` bullet update is stubbed). For the bullet-asteroid
//! scenario the test drives `apply_event` directly with a synthetic
//! `BulletHitAsteroid` event, exercising the same code path the drain
//! will hit once bullets are plumbed into the snapshot. The ship-vs-
//! asteroid scenario uses the full `drain` because ships and asteroids
//! both have wire-format storage today.

use rainboids_server::protocol::{
    AsteroidId, AsteroidState, DropId, DropState, EnemyId, EnemyState, GameEvent, PlayerId,
    ShipState,
};
use rainboids_server::room::collision::{
    apply_event, despawn_dead_asteroids, drain, CollisionSideState,
};
use rainboids_server::sim::collision::{CollisionEvent, PLAYER_ASTEROID_COLLISION_DAMAGE};
use rainboids_server::sim::drops::DropKind;
use rainboids_server::sim::state::GameState;

// ── Helpers ─────────────────────────────────────────────────────────

fn make_state() -> GameState {
    GameState::new()
}

fn make_asteroid(id: u64, x: f32, y: f32) -> AsteroidState {
    AsteroidState {
        id: AsteroidId(id),
        size: 1,
        x,
        y,
    }
}

fn make_ship(player_id: u64, x: f32, y: f32) -> ShipState {
    ShipState {
        player: PlayerId(player_id),
        x,
        y,
        vx: 0.0,
        vy: 0.0,
        angle: 0.0,
        hp: 100.0,
        shield: 100.0,
    }
}

fn make_enemy(id: u64, x: f32, y: f32, hp: f32) -> EnemyState {
    EnemyState {
        id: EnemyId(id),
        kind: 0,
        x,
        y,
        hp,
    }
}

fn make_drop(id: u64, x: f32, y: f32, kind: u8) -> DropState {
    DropState {
        id: DropId(id),
        kind,
        x,
        y,
    }
}

// ─── 1. Bullet-vs-asteroid via apply_event (HP drop + despawn) ─────

/// Constructs a `GameState` with 1 asteroid (hp=10) and drives a synthetic
/// `BulletHitAsteroid` event with damage=4 through `apply_event`. Repeats
/// the event until the asteroid's HP <= 0, calls the despawn pass, and
/// verifies:
///   - HP decreases by `damage` on each call
///   - Asteroid is removed from `state.asteroids` when HP <= 0
///   - `AsteroidDestroy` wire event is emitted
///   - `BulletDespawn` wire event is emitted (non-piercing bullet)
#[test]
fn bullet_hit_asteroid_drains_hp_and_despawns() {
    let mut state = make_state();
    state.asteroids.push(make_asteroid(101, 100.0, 100.0));

    let mut side = CollisionSideState::new();
    side.asteroid_hp.insert(101, 10.0);

    let mut wire_events: Vec<GameEvent> = Vec::new();

    // Hit 1: hp 10 → 6.
    apply_event(
        CollisionEvent::BulletHitAsteroid {
            bullet_id: 1,
            asteroid_id: 101,
            damage: 4.0,
            bullet_x: 100.0,
            bullet_y: 100.0,
            bullet_vx: 8.0,
            bullet_vy: 0.0,
            bullet_piercing_remaining: -1,
            bullet_will_despawn: true,
        },
        &mut state,
        &mut side,
        &mut wire_events,
    );
    assert!(
        (side.get_asteroid_hp(101) - 6.0).abs() < 1e-6,
        "after first hit, hp should be 6, got {}",
        side.get_asteroid_hp(101)
    );

    // Hit 2: hp 6 → 2.
    apply_event(
        CollisionEvent::BulletHitAsteroid {
            bullet_id: 2,
            asteroid_id: 101,
            damage: 4.0,
            bullet_x: 100.0,
            bullet_y: 100.0,
            bullet_vx: 8.0,
            bullet_vy: 0.0,
            bullet_piercing_remaining: -1,
            bullet_will_despawn: true,
        },
        &mut state,
        &mut side,
        &mut wire_events,
    );
    assert!(
        (side.get_asteroid_hp(101) - 2.0).abs() < 1e-6,
        "after second hit, hp should be 2, got {}",
        side.get_asteroid_hp(101)
    );

    // Asteroid still in GameState (despawn pass hasn't run yet).
    assert_eq!(
        state.asteroids.len(),
        1,
        "asteroid should remain in GameState until despawn pass runs"
    );

    // Hit 3: hp 2 → -2.
    apply_event(
        CollisionEvent::BulletHitAsteroid {
            bullet_id: 3,
            asteroid_id: 101,
            damage: 4.0,
            bullet_x: 100.0,
            bullet_y: 100.0,
            bullet_vx: 8.0,
            bullet_vy: 0.0,
            bullet_piercing_remaining: -1,
            bullet_will_despawn: true,
        },
        &mut state,
        &mut side,
        &mut wire_events,
    );

    // Run the despawn pass.
    despawn_dead_asteroids(&mut state, &mut side, &mut wire_events);

    assert!(
        state.asteroids.is_empty(),
        "asteroid should be removed when hp <= 0; remaining: {:?}",
        state.asteroids
    );
    assert!(
        !side.asteroid_hp.contains_key(&101),
        "side-table hp entry should be cleaned up on despawn"
    );

    // Check wire events: 3 BulletDespawn + 1 AsteroidDestroy.
    let bullet_despawns = wire_events
        .iter()
        .filter(|e| matches!(e, GameEvent::BulletDespawn { .. }))
        .count();
    let asteroid_destroys = wire_events
        .iter()
        .filter(|e| matches!(e, GameEvent::AsteroidDestroy { .. }))
        .count();
    assert_eq!(
        bullet_despawns, 3,
        "expected 3 BulletDespawn events (one per non-piercing hit)"
    );
    assert_eq!(
        asteroid_destroys, 1,
        "expected 1 AsteroidDestroy event for the killed asteroid"
    );
}

// ─── 2. Drain integration with overlapping ship + asteroid ──────────

/// Place a ship and an asteroid at coordinates that produce a circle-
/// circle overlap (ship radius 15 + asteroid radius 30 = sum_r 45;
/// place them 30 px apart along x ⇒ overlap of 15 px). The drain should:
///   - Build views from `GameState`
///   - Call `detect_player_asteroid_hits` → emit `PlayerHitAsteroid`
///   - Apply `PLAYER_ASTEROID_COLLISION_DAMAGE = 2` to asteroid HP
///
/// Verifies the full wiring (view-builder → detect-step → drain → mutation)
/// rather than just the apply-event slice.
#[test]
fn drain_applies_player_asteroid_damage_via_overlap() {
    let mut state = make_state();
    state.ships.push(make_ship(1, 100.0, 100.0));
    state.asteroids.push(make_asteroid(101, 130.0, 100.0));

    let mut side = CollisionSideState::new();
    // Seed HP at 10 so a single chip leaves it alive; the despawn pass
    // should leave the asteroid in `state.asteroids` after the drain.
    side.asteroid_hp.insert(101, 10.0);

    let mut wire_events: Vec<GameEvent> = Vec::new();

    drain(&mut state, &mut side, &mut wire_events);

    // After one drain, asteroid should have taken
    // PLAYER_ASTEROID_COLLISION_DAMAGE = 2.0 of damage.
    let expected = 10.0 - PLAYER_ASTEROID_COLLISION_DAMAGE;
    let actual = side.get_asteroid_hp(101);
    assert!(
        (actual - expected).abs() < 1e-6,
        "asteroid hp should drop by PLAYER_ASTEROID_COLLISION_DAMAGE ({}); got hp={}, expected={}",
        PLAYER_ASTEROID_COLLISION_DAMAGE,
        actual,
        expected,
    );
    // Asteroid should still be in GameState (hp > 0).
    assert_eq!(
        state.asteroids.len(),
        1,
        "asteroid should remain in GameState while hp > 0"
    );
}

// ─── 3. Drain is a no-op on empty entity Vecs (MVD scope sanity) ────

/// In the MVD ship-only slice, `GameState.asteroids`, `enemies`, `drops`
/// are all empty. The drain should run without panicking and produce no
/// wire events.
#[test]
fn drain_is_noop_on_empty_state() {
    let mut state = make_state();
    state.ships.push(make_ship(1, 100.0, 100.0));

    let mut side = CollisionSideState::new();
    let mut wire_events: Vec<GameEvent> = Vec::new();

    drain(&mut state, &mut side, &mut wire_events);

    assert!(
        wire_events.is_empty(),
        "MVD ship-only state should produce no collision wire events; got {:?}",
        wire_events
    );
    assert_eq!(state.ships.len(), 1, "ship should be preserved");
    assert!(state.asteroids.is_empty());
    assert!(state.enemies.is_empty());
    assert!(state.drops.is_empty());
}

// ─── 4. BulletHitEnemy applies HP loss in-place on GameState.enemies ─

/// Verify the enemy-HP-in-GameState path: BulletHitEnemy event should
/// decrement `enemy.hp` directly on the wire-format `EnemyState`.
#[test]
fn bullet_hit_enemy_drains_enemy_hp() {
    let mut state = make_state();
    state.enemies.push(make_enemy(201, 50.0, 50.0, 8.0));

    let mut side = CollisionSideState::new();
    let mut wire_events: Vec<GameEvent> = Vec::new();

    apply_event(
        CollisionEvent::BulletHitEnemy {
            bullet_id: 5,
            enemy_id: 201,
            damage: 3.0,
            bullet_x: 50.0,
            bullet_y: 50.0,
            bullet_vx: 0.0,
            bullet_vy: 0.0,
            bullet_piercing_remaining: -1,
            bullet_will_despawn: true,
        },
        &mut state,
        &mut side,
        &mut wire_events,
    );

    let hp = state.enemies.iter().find(|e| e.id.0 == 201).unwrap().hp;
    assert!(
        (hp - 5.0).abs() < 1e-6,
        "enemy hp should drop from 8 to 5 after damage=3, got {}",
        hp
    );

    let bullet_despawns = wire_events
        .iter()
        .filter(|e| matches!(e, GameEvent::BulletDespawn { .. }))
        .count();
    assert_eq!(bullet_despawns, 1, "non-piercing bullet should emit BulletDespawn");
}

// ─── 5. PlayerHitByEnemyBullet drops player HP + emits PlayerDamaged ─

/// Verify the player-damage path: enemy bullet hits a ship → ship.hp
/// decreases, `PlayerDamaged` wire event is emitted, bullet despawn is
/// emitted.
#[test]
fn player_hit_by_enemy_bullet_drops_hp_and_emits_events() {
    let mut state = make_state();
    state.ships.push(make_ship(7, 100.0, 100.0));

    let mut side = CollisionSideState::new();
    let mut wire_events: Vec<GameEvent> = Vec::new();

    apply_event(
        CollisionEvent::PlayerHitByEnemyBullet {
            player_id: 7,
            bullet_id: 42,
            damage: 25.0,
            bullet_x: 100.0,
            bullet_y: 100.0,
            bullet_vx: 0.0,
            bullet_vy: 0.0,
        },
        &mut state,
        &mut side,
        &mut wire_events,
    );

    let hp = state.ships.iter().find(|s| s.player.0 == 7).unwrap().hp;
    assert!(
        (hp - 75.0).abs() < 1e-6,
        "ship hp should drop from 100 to 75 after damage=25, got {}",
        hp
    );

    let player_damaged_count = wire_events
        .iter()
        .filter(|e| matches!(e, GameEvent::PlayerDamaged { .. }))
        .count();
    let bullet_despawn_count = wire_events
        .iter()
        .filter(|e| matches!(e, GameEvent::BulletDespawn { .. }))
        .count();
    assert_eq!(player_damaged_count, 1);
    assert_eq!(bullet_despawn_count, 1);
}

// ─── 6. PlayerPickupDrop applies heal + marks drop consumed ─────────

/// Verify the pickup path: a Health drop with value=20 should heal the
/// ship by 20 hp, and the drop should be marked consumed (despawned on
/// the next pass).
#[test]
fn player_pickup_health_drop_heals_ship() {
    let mut state = make_state();
    // Ship at 50 hp (damaged earlier in some hypothetical scenario).
    let mut ship = make_ship(9, 100.0, 100.0);
    ship.hp = 50.0;
    state.ships.push(ship);
    state.drops.push(make_drop(301, 100.0, 100.0, 0)); // 0 = Health

    let mut side = CollisionSideState::new();
    let mut wire_events: Vec<GameEvent> = Vec::new();

    apply_event(
        CollisionEvent::PlayerPickupDrop {
            player_id: 9,
            drop_id: 301,
            drop_kind: DropKind::Health,
            value: 20,
            drop_x: 100.0,
            drop_y: 100.0,
        },
        &mut state,
        &mut side,
        &mut wire_events,
    );

    let hp = state.ships.iter().find(|s| s.player.0 == 9).unwrap().hp;
    assert!(
        (hp - 70.0).abs() < 1e-6,
        "ship hp should heal from 50 to 70, got {}",
        hp
    );
    assert_eq!(
        side.drop_active.get(&301).copied(),
        Some(false),
        "drop should be marked consumed"
    );
}

// ─── 7. Dead enemy is removed from GameState by drain ──────────────

/// Verify the enemy despawn pass: place an enemy at hp=2, hit it with
/// damage=5, then run drain (which calls the despawn pass at the end).
/// The enemy should be removed and an `EnemyDestroy` wire event emitted.
#[test]
fn dead_enemy_is_pruned_from_gamestate() {
    let mut state = make_state();
    state.enemies.push(make_enemy(401, 50.0, 50.0, 2.0));

    let mut side = CollisionSideState::new();
    let mut wire_events: Vec<GameEvent> = Vec::new();

    // Drive a single bullet hit through apply_event, then run drain to
    // trigger the despawn pass on the now-dead enemy. Because drain
    // calls the despawn passes at its tail, we invoke it after
    // pre-damaging the enemy.
    apply_event(
        CollisionEvent::BulletHitEnemy {
            bullet_id: 1,
            enemy_id: 401,
            damage: 5.0,
            bullet_x: 0.0,
            bullet_y: 0.0,
            bullet_vx: 0.0,
            bullet_vy: 0.0,
            bullet_piercing_remaining: -1,
            bullet_will_despawn: true,
        },
        &mut state,
        &mut side,
        &mut wire_events,
    );

    // Enemy should be at -3 hp now, but still in the Vec.
    assert_eq!(state.enemies.len(), 1);
    assert!(state.enemies[0].hp < 0.0);

    // Now drive drain — the despawn passes at its tail should remove
    // the dead enemy.
    drain(&mut state, &mut side, &mut wire_events);

    assert!(
        state.enemies.is_empty(),
        "dead enemy should be pruned by drain's despawn pass"
    );
    let destroys = wire_events
        .iter()
        .filter(|e| matches!(e, GameEvent::EnemyDestroy { .. }))
        .count();
    assert_eq!(destroys, 1, "expected one EnemyDestroy wire event");
}
