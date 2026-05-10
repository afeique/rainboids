//! Cross-language parity vectors for bullet-vs-asteroid collision detection
//! (Phase 2.5, dispatch 1).
//!
//! Mirrors `js/sim/collision.js::detectBulletAsteroidHits`. The JS pure step
//! has its own Jest suite at `tests/unit/sim/collision.test.js`; the fixtures
//! here drive the Rust mirror through the equivalent scenarios and assert the
//! same event counts / ids / damage / despawn flags.
//!
//! Why no floating-point goldens: bullet-asteroid collision detection is a
//! pair-discovery problem; once the geometry overlap test fires, the event
//! payload is just (ids + damage + the bullet's already-computed state).
//! There's no accumulated multiplication, so no f32-vs-f64 drift to tolerate.
//!
//! Scenario coverage (mirrors `tests/unit/sim/collision.test.js`):
//!   1. `collision_single_hit`         — basic overlap → 1 event
//!   2. `collision_piercing_within_tick` — piercing=2 → 3 events, last
//!                                          despawns
//!   3. `collision_geometry_miss`      — outside sum-of-radii → 0 events
//!   4. `collision_pierced_set_carryover` — second tick doesn't re-hit
//!
//! Reference: `js/sim/collision.js` (PR #30, branch `mp/sim-collision-bullet-asteroid`).

use rainboids_server::sim::collision::{
    detect_bullet_asteroid_hits, CollisionAsteroid, CollisionBullet, CollisionContext,
    CollisionEvent,
};

/// Helper — build a player-style bullet with overridable fields. Defaults
/// pin a small player bullet sized like the live game (radius 4, damage 1).
fn make_bullet(id: u32, x: f32, y: f32) -> CollisionBullet {
    let mut b = CollisionBullet::fresh(id);
    b.x = x;
    b.y = y;
    b
}

/// Helper — build an asteroid at (x, y) with the live game's mid-size
/// default radius of 30.
fn make_asteroid(id: u32, x: f32, y: f32) -> CollisionAsteroid {
    let mut a = CollisionAsteroid::fresh(id);
    a.x = x;
    a.y = y;
    a
}

// ---------------------------------------------------------------------
// Fixture 1 — single bullet hits single asteroid.
//
// Mirrors `tests/unit/sim/collision.test.js::"overlapping bullet + asteroid
// emits one event with correct fields"`. JS asserts:
//   - 1 event
//   - bulletId=1, asteroidId=101, damage=3
//   - bullet_will_despawn=true, bullet_piercing_remaining=-1 (non-piercing)
//   - bullet velocity + position carried through to event
// ---------------------------------------------------------------------

#[test]
fn collision_single_hit() {
    // Bullet at (100, 100), asteroid at (110, 100). dx=10, sum_r=4+30=34 →
    // squared distance 100 < 1156 → overlap.
    let mut bullet = make_bullet(1, 100.0, 100.0);
    bullet.vx = 8.0;
    bullet.vy = 0.0;
    bullet.damage = 3.0;

    let asteroid = make_asteroid(101, 110.0, 100.0);

    let mut bullets = vec![bullet];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_bullet_asteroid_hits(&mut bullets, &asteroids, &ctx, &mut events);

    assert_eq!(events.len(), 1, "expected exactly one bullet-hit-asteroid event");

    match events[0] {
        CollisionEvent::BulletHitAsteroid {
            bullet_id,
            asteroid_id,
            damage,
            bullet_x,
            bullet_y,
            bullet_vx,
            bullet_vy,
            bullet_piercing_remaining,
            bullet_will_despawn,
        } => {
            assert_eq!(bullet_id, 1, "bullet_id");
            assert_eq!(asteroid_id, 101, "asteroid_id");
            assert!((damage - 3.0).abs() < 1e-6, "damage carries through");
            assert!((bullet_x - 100.0).abs() < 1e-6, "bullet_x");
            assert!((bullet_y - 100.0).abs() < 1e-6, "bullet_y");
            assert!((bullet_vx - 8.0).abs() < 1e-6, "bullet_vx");
            assert!((bullet_vy - 0.0).abs() < 1e-6, "bullet_vy");
            assert_eq!(
                bullet_piercing_remaining, -1,
                "non-piercing bullet → -1 remaining"
            );
            assert!(bullet_will_despawn, "non-piercing bullet despawns on hit");
        }
    }

    // Bullet should now remember the pierce.
    assert!(
        bullets[0].pierced_asteroid_ids.contains(&101),
        "pierced_asteroid_ids should include the hit asteroid"
    );
    assert_eq!(
        bullets[0].pierced_enemies, 1,
        "pierced_enemies counter incremented"
    );
}

// ---------------------------------------------------------------------
// Fixture 2 — piercing=2 bullet hits 3 overlapping asteroids in the same tick.
//
// Mirrors `tests/unit/sim/collision.test.js::"piercing=2 bullet hits 3
// overlapping asteroids in same tick"`. JS asserts:
//   - 3 events (piercing + 1 = 3 targets)
//   - asteroidIds {101, 102, 103}
//   - last event has bullet_will_despawn=true
//   - earlier events have bullet_will_despawn=false
// ---------------------------------------------------------------------

#[test]
fn collision_piercing_within_tick() {
    let mut bullet = make_bullet(1, 100.0, 100.0);
    bullet.piercing = 2;
    bullet.damage = 1.0;

    // All three asteroids overlap (each radius 30, bullet radius 4 →
    // sum_r 34; bullet at (100, 100), asteroids within 20 px).
    let a1 = make_asteroid(101, 110.0, 100.0);
    let a2 = make_asteroid(102, 120.0, 100.0);
    let a3 = make_asteroid(103, 90.0, 100.0);

    let mut bullets = vec![bullet];
    let asteroids = vec![a1, a2, a3];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_bullet_asteroid_hits(&mut bullets, &asteroids, &ctx, &mut events);

    assert_eq!(events.len(), 3, "piercing=2 → 3 events (piercing + 1 targets)");

    // Collect ids in event-emit order — should be array order: 101, 102, 103.
    let ids: Vec<u32> = events
        .iter()
        .map(|e| match *e {
            CollisionEvent::BulletHitAsteroid { asteroid_id, .. } => asteroid_id,
        })
        .collect();
    assert_eq!(ids, vec![101, 102, 103], "asteroids hit in array order");

    // First two events: bullet still alive.
    for (i, ev) in events.iter().take(2).enumerate() {
        match *ev {
            CollisionEvent::BulletHitAsteroid {
                bullet_will_despawn,
                bullet_piercing_remaining,
                ..
            } => {
                assert!(
                    !bullet_will_despawn,
                    "event[{}] should not despawn (budget remaining)",
                    i
                );
                // After hit 1: remaining=1; after hit 2: remaining=0.
                let expected = (2 - (i as i32 + 1)).max(0);
                assert_eq!(
                    bullet_piercing_remaining, expected,
                    "event[{}] piercing_remaining",
                    i
                );
            }
        }
    }

    // Last event: budget exhausted → despawn.
    match events[2] {
        CollisionEvent::BulletHitAsteroid {
            bullet_will_despawn,
            bullet_piercing_remaining,
            ..
        } => {
            assert!(bullet_will_despawn, "third hit exhausts piercing budget");
            assert_eq!(
                bullet_piercing_remaining, 0,
                "piercing_remaining clamps to 0 on last hit"
            );
        }
    }

    // All three asteroid ids should now live in the bullet's pierced set.
    assert_eq!(
        bullets[0].pierced_asteroid_ids.len(),
        3,
        "pierced_asteroid_ids should have all three"
    );
    assert_eq!(bullets[0].pierced_enemies, 3, "pierced_enemies counter");
}

// ---------------------------------------------------------------------
// Fixture 3 — bullet outside sum-of-radii emits no event.
//
// Mirrors `tests/unit/sim/collision.test.js::"bullet outside (radius +
// asteroid.radius) emits no event"`. We use a far-apart placement here
// (200 px gap, sum_r=34) so the test is robust to any radius drift.
// ---------------------------------------------------------------------

#[test]
fn collision_geometry_miss() {
    let bullet = make_bullet(1, 0.0, 0.0);
    // dx=200, sum_r=4+30=34 → squared distance 40_000 ≫ 1156 → no overlap.
    let asteroid = make_asteroid(101, 200.0, 0.0);

    let mut bullets = vec![bullet];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_bullet_asteroid_hits(&mut bullets, &asteroids, &ctx, &mut events);

    assert!(
        events.is_empty(),
        "bullet outside sum-of-radii should emit no event, got {:?}",
        events
    );
    // Pierce-tracking Set should still be empty — no hit recorded.
    assert!(
        bullets[0].pierced_asteroid_ids.is_empty(),
        "no pierces recorded on miss"
    );
    assert_eq!(bullets[0].pierced_enemies, 0, "no pierce-counter bump");
}

// ---------------------------------------------------------------------
// Fixture 4 — piercedAsteroidIds carries across ticks.
//
// Mirrors `tests/unit/sim/collision.test.js::"a piercing bullet that hit
// asteroid X last frame does NOT re-hit it this frame"`. The JS test calls
// `detectBulletAsteroidHits` twice on the same bullet/asteroid pair and
// asserts the second call emits 0 events.
//
// This is the critical safety net for piercing-bullet stability: without
// it, a slow-moving piercing bullet sitting inside an asteroid hitbox would
// stack hits frame-after-frame.
// ---------------------------------------------------------------------

#[test]
fn collision_pierced_set_carryover() {
    let mut bullet = make_bullet(1, 100.0, 100.0);
    bullet.piercing = 5;
    bullet.damage = 1.0;

    let asteroid = make_asteroid(101, 110.0, 100.0);

    let mut bullets = vec![bullet];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;

    // ── Tick 1 — fresh bullet, fresh asteroid, should hit. ──
    let mut events_tick1: Vec<CollisionEvent> = Vec::new();
    detect_bullet_asteroid_hits(&mut bullets, &asteroids, &ctx, &mut events_tick1);
    assert_eq!(events_tick1.len(), 1, "tick 1 should emit one hit event");
    assert!(
        bullets[0].pierced_asteroid_ids.contains(&101),
        "tick 1 should record the asteroid in the pierce set"
    );
    assert_eq!(bullets[0].pierced_enemies, 1, "tick 1 bumps counter to 1");

    // ── Tick 2 — same bullet, same asteroid. Pierce set should
    //    short-circuit the geometry check. ──
    let mut events_tick2: Vec<CollisionEvent> = Vec::new();
    detect_bullet_asteroid_hits(&mut bullets, &asteroids, &ctx, &mut events_tick2);
    assert!(
        events_tick2.is_empty(),
        "tick 2 should NOT re-hit the already-pierced asteroid, got {:?}",
        events_tick2
    );
    // Pierce counter should be unchanged — no new hits.
    assert_eq!(
        bullets[0].pierced_enemies, 1,
        "tick 2 should not bump the pierce counter"
    );
    // Pierce set unchanged.
    assert_eq!(
        bullets[0].pierced_asteroid_ids.len(),
        1,
        "pierce set should still have exactly one entry"
    );
}
