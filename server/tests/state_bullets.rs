//! `GameState.bullets` collection plumbing tests.
//!
//! Verifies the sim-internal bullet collection added to `GameState` and the
//! `build_bullets` view-builder in `room::collision` that consumes it.
//! Distinct from `parity_bullet.rs` (which pins the per-bullet step physics)
//! and `collision_drain.rs` (which covers the event-dispatch path).
//!
//! Scope:
//!   1. `GameState::new()` produces an empty `bullets` Vec.
//!   2. Bullets can be pushed and the `len` reflects the push.
//!   3. `drain` populates `CollisionBullet`s from `state.bullets` and the
//!      bullet-vs-asteroid pair fires when geometry overlaps.
//!   4. Inactive bullets are pruned by the drain's despawn pass.

use rainboids_server::protocol::{AsteroidId, AsteroidState, GameEvent};
use rainboids_server::room::collision::{drain, CollisionSideState};
use rainboids_server::sim::state::{BulletId, BulletState, GameState};

// ─── Helpers ─────────────────────────────────────────────────────────

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

fn make_bullet(id: u32, x: f32, y: f32) -> BulletState {
    let mut b = BulletState::fresh(BulletId(id));
    b.x = x;
    b.y = y;
    b.damage = 4.0;
    b
}

// ─── 1. GameState::new() yields an empty bullets Vec ────────────────

#[test]
fn gamestate_bullets_field_default_empty() {
    let state = GameState::new();
    assert!(
        state.bullets.is_empty(),
        "fresh GameState should have no bullets; got {} entries",
        state.bullets.len()
    );
}

// ─── 2. Pushing bullets works and length reflects the push ──────────

#[test]
fn gamestate_can_add_bullets() {
    let mut state = make_state();
    assert_eq!(state.bullets.len(), 0);

    state.bullets.push(make_bullet(1, 100.0, 100.0));
    assert_eq!(state.bullets.len(), 1);

    state.bullets.push(make_bullet(2, 200.0, 100.0));
    state.bullets.push(make_bullet(3, 300.0, 100.0));
    assert_eq!(state.bullets.len(), 3);

    // Bullets should retain the data we passed in.
    assert_eq!(state.bullets[0].id, BulletId(1));
    assert_eq!(state.bullets[0].x, 100.0);
    assert_eq!(state.bullets[2].id, BulletId(3));
    assert_eq!(state.bullets[2].x, 300.0);
}

// ─── 3. drain fires bullet-vs-asteroid when geometry overlaps ───────

/// Place a bullet and an asteroid at the same coordinates so the
/// circle-circle pair always intersects (bullet radius 4 + asteroid
/// radius 30 = 34; centers 0 px apart ⇒ overlap of 34 px). The drain
/// should:
///   - Build a non-empty `CollisionBullet` view from `state.bullets`.
///   - Call `detect_bullet_asteroid_hits` → emit `BulletHitAsteroid`.
///   - Damage the asteroid (HP ↓ by `bullet.damage`).
///   - Mark the (non-piercing) bullet inactive in `state.bullets`.
///   - Prune the dead bullet via `despawn_dead_bullets`.
///   - Emit a `BulletDespawn` wire event.
///
/// Before this PR `build_bullets` returned an empty Vec → no hit ever
/// fired. This test pins the bullet-collision integration.
#[test]
fn drain_fires_bullet_asteroid_collision_with_populated_bullets() {
    let mut state = make_state();

    // Asteroid at (100, 100) with HP=10 — alive but easy to hit.
    state.asteroids.push(make_asteroid(101, 100.0, 100.0));
    let mut side = CollisionSideState::new();
    side.asteroid_hp.insert(101, 10.0);

    // Bullet overlapping the asteroid with damage=4.
    state.bullets.push(make_bullet(42, 100.0, 100.0));

    let mut wire_events: Vec<GameEvent> = Vec::new();
    drain(&mut state, &mut side, &mut wire_events);

    // Asteroid HP should have dropped by `bullet.damage` (4.0).
    let hp = side.get_asteroid_hp(101);
    assert!(
        (hp - 6.0).abs() < 1e-6,
        "asteroid HP should drop from 10 to 6 after bullet hit (damage=4); got {}",
        hp
    );

    // Bullet should be pruned by the despawn pass (non-piercing → dies on hit).
    assert!(
        state.bullets.is_empty(),
        "non-piercing bullet should be despawned and pruned after hit; remaining: {:?}",
        state.bullets.iter().map(|b| b.id).collect::<Vec<_>>()
    );

    // Exactly one BulletDespawn wire event should have been emitted.
    let bullet_despawns = wire_events
        .iter()
        .filter(|e| matches!(e, GameEvent::BulletDespawn { .. }))
        .count();
    assert_eq!(
        bullet_despawns, 1,
        "expected exactly 1 BulletDespawn wire event for the consumed bullet"
    );
}

// ─── 4. Inactive bullets get pruned by drain ────────────────────────

#[test]
fn drain_prunes_inactive_bullets() {
    let mut state = make_state();
    // Pre-emptively mark a bullet as inactive (simulating a prior tick's
    // off-screen / lifetime expiry). The drain's despawn pass should
    // prune it even when no collision-vs-anything fires.
    let mut dead = make_bullet(5, 100.0, 100.0);
    dead.active = false;
    state.bullets.push(dead);

    // Also include a live bullet to confirm the prune is selective.
    state.bullets.push(make_bullet(6, 500.0, 500.0));

    assert_eq!(state.bullets.len(), 2);

    let mut side = CollisionSideState::new();
    let mut wire_events: Vec<GameEvent> = Vec::new();

    drain(&mut state, &mut side, &mut wire_events);

    assert_eq!(state.bullets.len(), 1, "only the inactive bullet should be pruned");
    assert_eq!(
        state.bullets[0].id,
        BulletId(6),
        "the surviving bullet should be the active one"
    );
}

// ─── 5. Empty bullets Vec is still a clean no-op (regression guard) ─

#[test]
fn drain_with_empty_bullets_is_noop() {
    // Sanity guard: removing the bullet collection plumbing must not break
    // the existing "MVD ship-only no-op" behavior — the drain still
    // succeeds with an empty `state.bullets` and produces no extra events.
    let mut state = make_state();
    let mut side = CollisionSideState::new();
    let mut wire_events: Vec<GameEvent> = Vec::new();

    drain(&mut state, &mut side, &mut wire_events);

    assert!(state.bullets.is_empty());
    assert!(
        wire_events.is_empty(),
        "empty-bullets drain should produce no wire events; got {:?}",
        wire_events
    );
}
