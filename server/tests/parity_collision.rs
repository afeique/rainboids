//! Cross-language parity vectors for collision pair-detection
//! (Phase 2.5, dispatch 1 + dispatch 2).
//!
//! Mirrors `js/sim/collision.js::detectBulletAsteroidHits` and
//! `detectPlayerAsteroidHits`. The JS pure step has its own Jest suite at
//! `tests/unit/sim/collision.test.js`; the fixtures here drive the Rust
//! mirror through the equivalent scenarios and assert the same event
//! counts / ids / damage / despawn flags / impulse-and-separation deltas.
//!
//! ─── Bullet-vs-asteroid coverage ─────────────────────────────────────
//!   1. `collision_single_hit`           — basic overlap → 1 event
//!   2. `collision_piercing_within_tick` — piercing=2 → 3 events, last
//!                                          despawns
//!   3. `collision_geometry_miss`        — outside sum-of-radii → 0 events
//!   4. `collision_pierced_set_carryover`— second tick doesn't re-hit
//!
//! ─── Player-vs-asteroid coverage ─────────────────────────────────────
//!   5. `player_asteroid_single_hit`         — basic overlap → 1 event w/
//!                                             all 9 fields populated
//!   6. `player_asteroid_geometry_miss`      — outside sum-of-radii → 0 events
//!   7. `player_asteroid_bounce_direction`   — eastbound vs westbound
//!                                             ⇒ playerImpulseDx < 0
//!   8. `player_asteroid_multiple_hits_one_tick`
//!                                           — wedged between two rocks
//!                                             ⇒ 2 events, both for same player
//!   9. `player_asteroid_skip_gates`         — inactive / warping /
//!                                             death-flash gates → 0 events
//!  10. `player_asteroid_separation_magnitude`
//!                                           — separation distance ==
//!                                             overlap + SEPARATION_BUFFER
//!
//! Why no floating-point goldens for bullet-asteroid: pair-discovery only,
//! no accumulated multiplication, so no f32-vs-f64 drift to tolerate.
//! Player-asteroid uses a 0.01 tolerance on impulse / separation deltas
//! because the math involves trig + mass-fallback formulas that diverge
//! between JS (f64) and Rust (f32) at the last decimal places.
//!
//! Reference: `js/sim/collision.js` (PR #30 for bullet-asteroid,
//! PR #32 for player-asteroid).

use rainboids_server::sim::collision::{
    detect_bullet_asteroid_hits, detect_player_asteroid_hits, CollisionAsteroid, CollisionBullet,
    CollisionContext, CollisionEvent, CollisionPlayer, ASTEROID_KNOCKBACK_MULTIPLIER,
    OVERLAP_PUSH_FORCE, PLAYER_ASTEROID_COLLISION_DAMAGE, SEPARATION_BUFFER,
};

// ─── Helpers ─────────────────────────────────────────────────────────

/// Build a player-style bullet at (x, y). Defaults pin a small player
/// bullet sized like the live game (radius 4, damage 1).
fn make_bullet(id: u32, x: f32, y: f32) -> CollisionBullet {
    let mut b = CollisionBullet::fresh(id);
    b.x = x;
    b.y = y;
    b
}

/// Build an asteroid at (x, y) with the live game's mid-size default
/// radius of 30 and zero velocity (override after construction).
fn make_asteroid(id: u32, x: f32, y: f32) -> CollisionAsteroid {
    let mut a = CollisionAsteroid::fresh(id);
    a.x = x;
    a.y = y;
    a
}

/// Build a player ship at (x, y) with the live game's default radius of 15.
fn make_player(id: u32, x: f32, y: f32) -> CollisionPlayer {
    let mut p = CollisionPlayer::fresh(id);
    p.x = x;
    p.y = y;
    p
}

/// Float-tolerance assertion helper for impulse/separation math.
fn approx_eq(actual: f32, expected: f32, what: &str) {
    let delta = (actual - expected).abs();
    assert!(
        delta < 0.01,
        "{} diverged: rust={}, expected={}, |Δ|={}",
        what,
        actual,
        expected,
        delta,
    );
}

// ═════════════════════════════════════════════════════════════════════
// Bullet-vs-asteroid fixtures (dispatch 1).
// ═════════════════════════════════════════════════════════════════════

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
        ev => panic!("expected BulletHitAsteroid, got {:?}", ev),
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
// overlapping asteroids in same tick"`.
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
            ev => panic!("expected BulletHitAsteroid, got {:?}", ev),
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
            ev => panic!("expected BulletHitAsteroid, got {:?}", ev),
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
        ev => panic!("expected BulletHitAsteroid, got {:?}", ev),
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

// ═════════════════════════════════════════════════════════════════════
// Player-vs-asteroid fixtures (dispatch 2).
// ═════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------
// Fixture 5 — single overlapping player + asteroid emits one event with
// all nine fields populated.
//
// Mirrors `tests/unit/sim/collision.test.js::"overlapping player + asteroid
// emits one event with all delta fields"`. JS asserts the event carries
// playerId, asteroidId, damage_to_asteroid=2, and six finite numeric
// delta fields with separationDx non-zero (overlap is on the x-axis).
// ---------------------------------------------------------------------

#[test]
fn player_asteroid_single_hit() {
    // Player radius 15, asteroid radius 30 ⇒ sum_r = 45.
    // Place 30 px apart on the x-axis ⇒ overlap = 15 (clear hit).
    let mut player = make_player(1, 100.0, 100.0);
    player.vx = 5.0;
    player.vy = 0.0;

    let mut asteroid = make_asteroid(10, 130.0, 100.0);
    asteroid.vx = 0.0;
    asteroid.vy = 0.0;

    let players = vec![player];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_asteroid_hits(&players, &asteroids, &ctx, &mut events);

    assert_eq!(
        events.len(),
        1,
        "expected exactly one player-hit-asteroid event"
    );

    match events[0] {
        CollisionEvent::PlayerHitAsteroid {
            player_id,
            asteroid_id,
            damage_to_asteroid,
            player_impulse_dx,
            player_impulse_dy,
            asteroid_impulse_dx,
            asteroid_impulse_dy,
            separation_dx,
            separation_dy,
        } => {
            assert_eq!(player_id, 1, "player_id");
            assert_eq!(asteroid_id, 10, "asteroid_id");
            assert!(
                (damage_to_asteroid - PLAYER_ASTEROID_COLLISION_DAMAGE).abs() < 1e-6,
                "damage_to_asteroid"
            );
            // All six numeric delta fields must be finite.
            assert!(player_impulse_dx.is_finite(), "player_impulse_dx finite");
            assert!(player_impulse_dy.is_finite(), "player_impulse_dy finite");
            assert!(asteroid_impulse_dx.is_finite(), "asteroid_impulse_dx finite");
            assert!(asteroid_impulse_dy.is_finite(), "asteroid_impulse_dy finite");
            assert!(separation_dx.is_finite(), "separation_dx finite");
            assert!(separation_dy.is_finite(), "separation_dy finite");
            // Overlap is on the x-axis only ⇒ separation has nonzero dx.
            assert!(
                separation_dx.abs() > 1e-6,
                "separation_dx must be nonzero on collision axis (got {})",
                separation_dx
            );
        }
        ev => panic!("expected PlayerHitAsteroid, got {:?}", ev),
    }
}

// ---------------------------------------------------------------------
// Fixture 6 — geometry miss: centers further than sum_r apart emits no event.
//
// Mirrors `tests/unit/sim/collision.test.js::"player outside (player.r +
// asteroid.r) emits no event"`.
// ---------------------------------------------------------------------

#[test]
fn player_asteroid_geometry_miss() {
    let player = make_player(1, 0.0, 0.0);
    // 200 px ≫ sum_r=45 ⇒ no overlap.
    let asteroid = make_asteroid(10, 200.0, 0.0);

    let players = vec![player];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_asteroid_hits(&players, &asteroids, &ctx, &mut events);

    assert!(
        events.is_empty(),
        "player outside sum-of-radii should emit no event, got {:?}",
        events
    );
}

// ---------------------------------------------------------------------
// Fixture 7 — bounce direction.
//
// Mirrors `tests/unit/sim/collision.test.js::"eastbound player ramming a
// westward rock gets impulse pushing west"`.
//
// Geometry:
//   - Player at (100, 100), radius 15, moving east (vx=10).
//   - Asteroid 30 px east at (130, 100), radius 30, moving west (vx=-2).
//   - distance=30, sum_r=45 ⇒ overlap=15.
//
// Expected delta directions:
//   - The separation normal points from asteroid → player, which is
//     westward → separationDx < 0.
//   - The OVERLAP_PUSH_FORCE term adds nx · 5 = -5 to playerImpulseDx
//     (westward).
//   - The knockback term is mass-dominated by the much heavier asteroid
//     (≈113k vs ≈353), making its contribution orders of magnitude
//     smaller than the OVERLAP_PUSH_FORCE term, so playerImpulseDx
//     stays strictly negative.
// ---------------------------------------------------------------------

#[test]
fn player_asteroid_bounce_direction() {
    let mut player = make_player(1, 100.0, 100.0);
    player.vx = 10.0;
    player.vy = 0.0;

    let mut asteroid = make_asteroid(10, 130.0, 100.0);
    asteroid.vx = -2.0;
    asteroid.vy = 0.0;

    let players = vec![player];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_asteroid_hits(&players, &asteroids, &ctx, &mut events);

    assert_eq!(events.len(), 1, "expected exactly one event");
    match events[0] {
        CollisionEvent::PlayerHitAsteroid {
            player_impulse_dx,
            separation_dx,
            separation_dy,
            ..
        } => {
            // Separation points westward (away from the east-of-player rock).
            assert!(
                separation_dx < 0.0,
                "separation_dx should be westward (negative), got {}",
                separation_dx
            );
            // Player + asteroid both on the x-axis ⇒ no y-component.
            approx_eq(separation_dy, 0.0, "separation_dy");
            // Net player impulse dominated by westward overlap push.
            assert!(
                player_impulse_dx < 0.0,
                "player_impulse_dx should be westward (negative), got {}",
                player_impulse_dx
            );
        }
        ev => panic!("expected PlayerHitAsteroid, got {:?}", ev),
    }
}

// ---------------------------------------------------------------------
// Fixture 8 — one player overlapping two rocks emits two events.
//
// Mirrors `tests/unit/sim/collision.test.js::"player wedged between two
// asteroids emits two events"`.
// ---------------------------------------------------------------------

#[test]
fn player_asteroid_multiple_hits_one_tick() {
    let player = make_player(1, 100.0, 100.0);

    // East rock: dx=+30, sum_r=45 ⇒ overlap.
    let east = make_asteroid(10, 130.0, 100.0);
    // West rock: dx=-30, sum_r=45 ⇒ overlap.
    let west = make_asteroid(20, 70.0, 100.0);

    let players = vec![player];
    let asteroids = vec![east, west];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_asteroid_hits(&players, &asteroids, &ctx, &mut events);

    assert_eq!(events.len(), 2, "expected two events (one per overlapping rock)");

    // Both events should be for the same player.
    let mut ids: Vec<u32> = events
        .iter()
        .map(|e| match *e {
            CollisionEvent::PlayerHitAsteroid {
                player_id,
                asteroid_id,
                ..
            } => {
                assert_eq!(player_id, 1, "all events should be for player 1");
                asteroid_id
            }
            ev => panic!("expected PlayerHitAsteroid, got {:?}", ev),
        })
        .collect();
    ids.sort();
    assert_eq!(ids, vec![10, 20], "expected asteroids 10 and 20");
}

// ---------------------------------------------------------------------
// Fixture 9 — skip gates (inactive / warping / death-flash) emit no event.
//
// Mirrors the five `tests/unit/sim/collision.test.js::"skip"`-flavored
// scenarios. We combine all four gate types into a single fixture for
// brevity; each sub-block constructs the smallest possible failing state.
// ---------------------------------------------------------------------

#[test]
fn player_asteroid_skip_gates() {
    let ctx = CollisionContext;

    // Sub-test (a): inactive player → no event.
    {
        let mut player = make_player(1, 100.0, 100.0);
        player.active = false;
        let asteroid = make_asteroid(10, 130.0, 100.0);
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_asteroid_hits(&[player], &[asteroid], &ctx, &mut events);
        assert!(events.is_empty(), "inactive player must not emit event");
    }

    // Sub-test (b): inactive asteroid → no event.
    {
        let player = make_player(1, 100.0, 100.0);
        let mut asteroid = make_asteroid(10, 130.0, 100.0);
        asteroid.active = false;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_asteroid_hits(&[player], &[asteroid], &ctx, &mut events);
        assert!(events.is_empty(), "inactive asteroid must not emit event");
    }

    // Sub-test (c): warping asteroid → no event.
    {
        let player = make_player(1, 100.0, 100.0);
        let mut asteroid = make_asteroid(10, 130.0, 100.0);
        asteroid.warping = true;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_asteroid_hits(&[player], &[asteroid], &ctx, &mut events);
        assert!(events.is_empty(), "warping asteroid must not emit event");
    }

    // Sub-test (d): asteroid mid-death-flash → no event.
    {
        let player = make_player(1, 100.0, 100.0);
        let mut asteroid = make_asteroid(10, 130.0, 100.0);
        asteroid.death_flash = 5;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_asteroid_hits(&[player], &[asteroid], &ctx, &mut events);
        assert!(
            events.is_empty(),
            "asteroid mid-death-flash must not emit event"
        );
    }

    // Sub-test (e): empty inputs (defensive) → no event.
    {
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_asteroid_hits(&[], &[make_asteroid(10, 0.0, 0.0)], &ctx, &mut events);
        assert!(events.is_empty(), "empty players → no event");

        let mut events2: Vec<CollisionEvent> = Vec::new();
        detect_player_asteroid_hits(&[make_player(1, 0.0, 0.0)], &[], &ctx, &mut events2);
        assert!(events2.is_empty(), "empty asteroids → no event");
    }
}

// ---------------------------------------------------------------------
// Fixture 10 — separation magnitude equals `overlap + SEPARATION_BUFFER`
// along the (asteroid → player) normal.
//
// Mirrors `tests/unit/sim/collision.test.js::"separation distance =
// overlap + SEPARATION_BUFFER along (asteroid → player) normal"`.
//
// Geometry: player at (100, 100) r=15; asteroid at (130, 100) r=30.
//   distance = 30, sum_r = 45 ⇒ overlap = 15.
//   Normal (asteroid → player) = (-1, 0).
//   Expected separation = (-1, 0) · (15 + 6) = (-21, 0).
//
// We also sanity-check that:
//   - player_impulse_dx includes the OVERLAP_PUSH_FORCE term
//     (nx · 5 = -5) PLUS the (tiny) knockback contribution.
//   - asteroid_impulse_dx is in the opposite direction
//     (-knockback · 0.3 · player_mass · cos_a).
// ---------------------------------------------------------------------

#[test]
fn player_asteroid_separation_magnitude() {
    let player = make_player(1, 100.0, 100.0);
    let asteroid = make_asteroid(10, 130.0, 100.0);

    let players = vec![player];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_asteroid_hits(&players, &asteroids, &ctx, &mut events);

    assert_eq!(events.len(), 1, "expected exactly one event");

    let expected_separation_dx = -(15.0 + SEPARATION_BUFFER); // = -21
    let expected_separation_dy: f32 = 0.0;

    match events[0] {
        CollisionEvent::PlayerHitAsteroid {
            separation_dx,
            separation_dy,
            player_impulse_dx,
            player_impulse_dy,
            asteroid_impulse_dx,
            asteroid_impulse_dy,
            damage_to_asteroid,
            ..
        } => {
            approx_eq(separation_dx, expected_separation_dx, "separation_dx");
            approx_eq(separation_dy, expected_separation_dy, "separation_dy");

            // Both players have zero velocity here ⇒ dvn = 0 ⇒ knockback = 0
            // ⇒ player_impulse comes purely from OVERLAP_PUSH_FORCE along
            // the westward normal: (-1, 0) · 5 = (-5, 0).
            approx_eq(player_impulse_dx, -OVERLAP_PUSH_FORCE, "player_impulse_dx");
            approx_eq(player_impulse_dy, 0.0, "player_impulse_dy");

            // Zero relative velocity ⇒ knockback term vanishes ⇒ asteroid
            // impulse is exactly zero (no jitter, no knockback contribution).
            approx_eq(asteroid_impulse_dx, 0.0, "asteroid_impulse_dx");
            approx_eq(asteroid_impulse_dy, 0.0, "asteroid_impulse_dy");

            assert!(
                (damage_to_asteroid - PLAYER_ASTEROID_COLLISION_DAMAGE).abs() < 1e-6,
                "damage_to_asteroid"
            );
        }
        ev => panic!("expected PlayerHitAsteroid, got {:?}", ev),
    }

    // Sanity: ensure the multipliers we exposed pin to their JS values
    // (caught indirectly by the math above, but a direct assert documents
    // intent).
    assert!(
        (ASTEROID_KNOCKBACK_MULTIPLIER - 22.0).abs() < 1e-6,
        "ASTEROID_KNOCKBACK_MULTIPLIER must mirror JS verbatim"
    );
}
