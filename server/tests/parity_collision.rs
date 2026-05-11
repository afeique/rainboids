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
    detect_bullet_asteroid_hits, detect_bullet_enemy_hits, detect_enemy_asteroid_hits,
    detect_player_asteroid_hits, detect_player_enemy_bullet_hits, detect_player_enemy_hits,
    CollisionAsteroid, CollisionBullet, CollisionContext, CollisionEnemy, CollisionEnemyBullet,
    CollisionEvent, CollisionPlayer, ASTEROID_ENEMY_PUSH, ASTEROID_KNOCKBACK_MULTIPLIER,
    BOUNCE_FORCE_MULTIPLIER, BOUNCE_RESTITUTION, ENEMY_ASTEROID_PUSH, OVERLAP_PUSH_FORCE,
    OVERLAP_SEPARATION_RATIO, PLAYER_ASTEROID_COLLISION_DAMAGE, PLAYER_ENEMY_COLLISION_DAMAGE,
    SEPARATION_BUFFER,
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

// ═════════════════════════════════════════════════════════════════════
// Bullet-vs-enemy fixtures (dispatch 3 — this PR).
// ═════════════════════════════════════════════════════════════════════
//
// Mirrors `js/sim/collision.js::detectBulletEnemyHits` and the Jest suite
// at `tests/unit/sim/collision.test.js` (the bullet-enemy describe block
// added in PR #38). Coverage:
//
//   11. `bullet_enemy_single_hit`
//       — basic overlap → 1 event with all 9 fields.
//   12. `bullet_enemy_piercing_within_tick`
//       — piercing=2 → 3 events, last has will_despawn=true.
//   13. `bullet_enemy_geometry_miss`
//       — 200 px apart → 0 events.
//   14. `bullet_enemy_pierced_set_distinct_from_asteroid`
//       — bullet has pierced_asteroid_ids={42}; same bullet still hits
//         enemy id=42 because the Sets are distinct (different id spaces).

// ---------------------------------------------------------------------
// Helpers — build minimal bullet/enemy pairs that overlap (or not).
// ---------------------------------------------------------------------

/// Build an enemy at (x, y) with the live HUNTER default radius of 18.
fn make_enemy(id: u32, x: f32, y: f32) -> CollisionEnemy {
    let mut e = CollisionEnemy::fresh(id);
    e.x = x;
    e.y = y;
    e
}

// ---------------------------------------------------------------------
// Fixture 11 — single bullet hits single enemy.
//
// Mirrors `tests/unit/sim/collision.test.js::"overlapping bullet + enemy
// emits one event with all 9 fields"`. JS asserts:
//   - 1 event
//   - bullet_id=1, enemy_id=101, damage=3
//   - bullet velocity (vx=8, vy=-3) and position (100, 100) carried through
//   - bullet_will_despawn=true, bullet_piercing_remaining=-1 (non-piercing)
// ---------------------------------------------------------------------

#[test]
fn bullet_enemy_single_hit() {
    // Bullet radius 4 + enemy radius 18 = sum_r 22. Place enemy 10 px east
    // of bullet ⇒ overlap = 12 (clear hit).
    let mut bullet = make_bullet(1, 100.0, 100.0);
    bullet.vx = 8.0;
    bullet.vy = -3.0;
    bullet.damage = 3.0;

    let enemy = make_enemy(101, 110.0, 100.0);

    let mut bullets = vec![bullet];
    let enemies = vec![enemy];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_bullet_enemy_hits(&mut bullets, &enemies, &ctx, &mut events);

    assert_eq!(events.len(), 1, "expected exactly one bullet-hit-enemy event");

    match events[0] {
        CollisionEvent::BulletHitEnemy {
            bullet_id,
            enemy_id,
            damage,
            bullet_x,
            bullet_y,
            bullet_vx,
            bullet_vy,
            bullet_piercing_remaining,
            bullet_will_despawn,
        } => {
            assert_eq!(bullet_id, 1, "bullet_id");
            assert_eq!(enemy_id, 101, "enemy_id");
            assert!((damage - 3.0).abs() < 1e-6, "damage carries through");
            assert!((bullet_x - 100.0).abs() < 1e-6, "bullet_x");
            assert!((bullet_y - 100.0).abs() < 1e-6, "bullet_y");
            assert!((bullet_vx - 8.0).abs() < 1e-6, "bullet_vx");
            assert!((bullet_vy - (-3.0)).abs() < 1e-6, "bullet_vy");
            assert_eq!(
                bullet_piercing_remaining, -1,
                "non-piercing bullet → -1 remaining"
            );
            assert!(bullet_will_despawn, "non-piercing bullet despawns on hit");
        }
        ev => panic!("expected BulletHitEnemy, got {:?}", ev),
    }

    // Bullet should now remember the pierce — but only in the enemy Set,
    // not the asteroid Set (distinct id spaces).
    assert!(
        bullets[0].pierced_enemy_ids.contains(&101),
        "pierced_enemy_ids should include the hit enemy"
    );
    assert!(
        bullets[0].pierced_asteroid_ids.is_empty(),
        "pierced_asteroid_ids should remain untouched by an enemy hit"
    );
    assert_eq!(
        bullets[0].pierced_enemies, 1,
        "pierced_enemies counter incremented"
    );
}

// ---------------------------------------------------------------------
// Fixture 12 — piercing=2 bullet hits 3 overlapping enemies in same tick.
//
// Mirrors `tests/unit/sim/collision.test.js::"piercing=2 bullet hits 3
// overlapping enemies in same tick"`.
// ---------------------------------------------------------------------

#[test]
fn bullet_enemy_piercing_within_tick() {
    let mut bullet = make_bullet(1, 100.0, 100.0);
    bullet.piercing = 2;
    bullet.damage = 1.0;

    // All three enemies overlap (each radius 18, bullet radius 4 → sum_r
    // 22; bullet at (100, 100), enemies within 15 px on the x-axis).
    let e1 = make_enemy(101, 110.0, 100.0);
    let e2 = make_enemy(102, 115.0, 100.0);
    let e3 = make_enemy(103, 90.0, 100.0);

    let mut bullets = vec![bullet];
    let enemies = vec![e1, e2, e3];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_bullet_enemy_hits(&mut bullets, &enemies, &ctx, &mut events);

    assert_eq!(
        events.len(),
        3,
        "piercing=2 → 3 events (piercing + 1 targets)"
    );

    // Collect ids in event-emit order — should be array order: 101, 102, 103.
    let ids: Vec<u32> = events
        .iter()
        .map(|e| match *e {
            CollisionEvent::BulletHitEnemy { enemy_id, .. } => enemy_id,
            ev => panic!("expected BulletHitEnemy, got {:?}", ev),
        })
        .collect();
    assert_eq!(ids, vec![101, 102, 103], "enemies hit in array order");

    // First two events: bullet still alive.
    for (i, ev) in events.iter().take(2).enumerate() {
        match *ev {
            CollisionEvent::BulletHitEnemy {
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
            ev => panic!("expected BulletHitEnemy, got {:?}", ev),
        }
    }

    // Last event: budget exhausted → despawn.
    match events[2] {
        CollisionEvent::BulletHitEnemy {
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
        ev => panic!("expected BulletHitEnemy, got {:?}", ev),
    }

    // All three enemy ids should now live in the bullet's pierced set.
    assert_eq!(
        bullets[0].pierced_enemy_ids.len(),
        3,
        "pierced_enemy_ids should have all three"
    );
    // Asteroid Set must remain untouched — distinct from enemy Set.
    assert!(
        bullets[0].pierced_asteroid_ids.is_empty(),
        "pierced_asteroid_ids must NOT be modified by enemy hits"
    );
    assert_eq!(bullets[0].pierced_enemies, 3, "shared pierced_enemies counter");
}

// ---------------------------------------------------------------------
// Fixture 13 — bullet outside sum-of-radii emits no event.
// ---------------------------------------------------------------------

#[test]
fn bullet_enemy_geometry_miss() {
    let bullet = make_bullet(1, 0.0, 0.0);
    // dx=200, sum_r=4+18=22 → squared distance 40_000 ≫ 484 → no overlap.
    let enemy = make_enemy(101, 200.0, 0.0);

    let mut bullets = vec![bullet];
    let enemies = vec![enemy];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_bullet_enemy_hits(&mut bullets, &enemies, &ctx, &mut events);

    assert!(
        events.is_empty(),
        "bullet outside sum-of-radii should emit no event, got {:?}",
        events
    );
    // Pierce-tracking Sets should still be empty — no hit recorded.
    assert!(
        bullets[0].pierced_enemy_ids.is_empty(),
        "no enemy pierces recorded on miss"
    );
    assert!(
        bullets[0].pierced_asteroid_ids.is_empty(),
        "no asteroid pierces recorded on miss"
    );
    assert_eq!(bullets[0].pierced_enemies, 0, "no pierce-counter bump");
}

// ---------------------------------------------------------------------
// Fixture 14 — pierced_enemy_ids is DISTINCT from pierced_asteroid_ids.
//
// Mirrors `tests/unit/sim/collision.test.js::"a bullet that pierced
// asteroid X can still hit enemy with same id"`. Bullet has already
// pierced asteroid id=42 (seeded into pierced_asteroid_ids) earlier
// this tick; an enemy with id=42 still gets hit because the Sets cover
// different id spaces. The SHARED pierced_enemies counter increments,
// however, because the budget is one counter for both pair types.
// ---------------------------------------------------------------------

#[test]
fn bullet_enemy_pierced_set_distinct_from_asteroid() {
    // Pre-seed the bullet as if it had already pierced asteroid 42 in the
    // bullet-asteroid pass earlier this tick. The shared counter reflects
    // that prior pierce.
    let mut bullet = make_bullet(1, 100.0, 100.0);
    bullet.piercing = 3;
    bullet.damage = 1.0;
    bullet.pierced_asteroid_ids.insert(42);
    bullet.pierced_enemies = 1; // shared counter already at 1 from the asteroid pierce

    // Enemy ALSO with id=42 (different id space, different target). The
    // detector MUST hit this enemy — its id is in pierced_asteroid_ids
    // but NOT in pierced_enemy_ids.
    let enemy = make_enemy(42, 110.0, 100.0);

    let mut bullets = vec![bullet];
    let enemies = vec![enemy];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_bullet_enemy_hits(&mut bullets, &enemies, &ctx, &mut events);

    assert_eq!(
        events.len(),
        1,
        "enemy id=42 must be hit despite asteroid id=42 already pierced"
    );

    match events[0] {
        CollisionEvent::BulletHitEnemy { enemy_id, .. } => {
            assert_eq!(enemy_id, 42, "the hit enemy is id=42");
        }
        ev => panic!("expected BulletHitEnemy, got {:?}", ev),
    }

    // Now the bullet's enemy-pierce Set is populated.
    assert!(
        bullets[0].pierced_enemy_ids.contains(&42),
        "pierced_enemy_ids should now contain 42"
    );
    // Asteroid-pierce Set still holds the original 42 entry — untouched.
    assert!(
        bullets[0].pierced_asteroid_ids.contains(&42),
        "pierced_asteroid_ids should still contain 42 (untouched by enemy pair)"
    );
    assert_eq!(
        bullets[0].pierced_asteroid_ids.len(),
        1,
        "pierced_asteroid_ids should still have exactly one entry (42)"
    );
    // Shared counter ticked up by 1 — now 2 (one ast + one enemy).
    assert_eq!(
        bullets[0].pierced_enemies, 2,
        "shared pierced_enemies counter increments per pierce regardless of type"
    );
}

// ═════════════════════════════════════════════════════════════════════
// Player-vs-enemy fixtures (Phase 2.5 dispatch 4 — this PR).
// ═════════════════════════════════════════════════════════════════════
//
// Mirrors `js/sim/collision.js::detectPlayerEnemyHits` and the Jest suite
// at `tests/unit/sim/collision.test.js` (the player-enemy describe block).
//
// IMPORTANT: math model is DIFFERENT from the asteroid pair. The
// player-vs-enemy path uses a textbook restitution-based impulse model
// (`-(1 + R) · vN / totalMass`) gated on `velAlongNormal > 0`, with
// `BOUNCE_FORCE_MULTIPLIER = 12.0`, separation =
// `overlap × OVERLAP_SEPARATION_RATIO` SPLIT between both bodies, NO
// `OVERLAP_PUSH_FORCE` velocity nudge, NO atan2 jitter — fully
// deterministic. Damage is unconditional on overlap; bounce gates on
// approach.
//
// Coverage:
//   15. `player_enemy_single_hit_approaching`
//       — both-body impulse + separation when approaching; damage=5.
//   16. `player_enemy_geometry_miss`
//       — 200 px gap → 0 events.
//   17. `player_enemy_graze_separating`
//       — overlapping with velAlongNormal > 0 → damage-only event
//         (zero impulses, zero separations on the bounce; but separation
//         still applies because overlap > 0). Actually the JS code applies
//         separation independent of the bail-out — so impulses zero,
//         separations nonzero. Pin this asymmetry exactly.
//   18. `player_enemy_multiple_hits`
//       — player overlapping 2 enemies → 2 events.
//   19. `player_enemy_skip_gates`
//       — inactive player/enemy, warping, death_flash → 0 events.
//   20. `player_enemy_textbook_restitution_pin`
//       — zero-velocity player + zero-velocity enemy at known positions
//         → zero impulses (no jitter, no OVERLAP_PUSH_FORCE); damage
//         still emitted; separation matches `overlap × ratio` formula.

// ---------------------------------------------------------------------
// Helpers — build minimal player/enemy pairs. `make_player` is already
// defined for earlier dispatches; reuse it here. The enemy helper for
// the player-enemy pair sets an explicit `mass` field (the JS test suite
// pins mass=200 via `makeEnemy`).
// ---------------------------------------------------------------------

/// Build an enemy at (x, y) with explicit `mass = 200` (JS default in
/// `makeEnemy`). The bullet-enemy `make_enemy` helper above leaves mass
/// unset; the player-enemy pair needs mass explicit so the textbook
/// impulse math has a stable reference point.
fn make_enemy_with_mass(id: u32, x: f32, y: f32) -> CollisionEnemy {
    let mut e = CollisionEnemy::fresh(id);
    e.x = x;
    e.y = y;
    e.mass = Some(200.0);
    e
}

// ---------------------------------------------------------------------
// Fixture 15 — single overlapping player + enemy emits one event with
// both-body impulses + separations populated when bodies are approaching.
//
// Mirrors `tests/unit/sim/collision.test.js::"overlapping player + enemy
// emits one event with all 12 fields"`.
//
// Geometry:
//   - Player at (100, 100), radius 15, vx=8 (eastbound).
//   - Enemy at (120, 100), radius 18, mass 200, vx=0 (still).
//   - distance=20, sum_r=33 ⇒ overlap=13.
//   - Normal (enemy → player) = (-1, 0).
//   - relVx = 8 - 0 = 8, dot normal = -8 < 0 ⇒ APPROACHING ⇒ impulse fires.
//
// Expected sign / shape:
//   - Player impulse pushes west (negative dx).
//   - Enemy impulse pushes east (positive dx; mirror).
//   - Separation pushes player west, enemy east, both with magnitude
//     overlap × OVERLAP_SEPARATION_RATIO = 13 × 0.6 = 7.8.
// ---------------------------------------------------------------------

#[test]
fn player_enemy_single_hit_approaching() {
    let mut player = make_player(1, 100.0, 100.0);
    player.vx = 8.0;
    player.vy = 0.0;

    let enemy = make_enemy_with_mass(10, 120.0, 100.0);

    let players = vec![player];
    let enemies = vec![enemy];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_enemy_hits(&players, &enemies, &ctx, &mut events);

    assert_eq!(events.len(), 1, "expected exactly one player-hit-enemy event");

    match events[0] {
        CollisionEvent::PlayerHitEnemy {
            player_id,
            enemy_id,
            damage_to_enemy,
            player_impulse_dx,
            player_impulse_dy,
            enemy_impulse_dx,
            enemy_impulse_dy,
            separation_dx,
            separation_dy,
            enemy_separation_dx,
            enemy_separation_dy,
        } => {
            assert_eq!(player_id, 1, "player_id");
            assert_eq!(enemy_id, 10, "enemy_id");
            assert!(
                (damage_to_enemy - PLAYER_ENEMY_COLLISION_DAMAGE).abs() < 1e-6,
                "damage_to_enemy = PLAYER_ENEMY_COLLISION_DAMAGE = 5"
            );
            assert!(
                (damage_to_enemy - 5.0).abs() < 1e-6,
                "damage_to_enemy = 5 (verbatim)"
            );

            // All eight numeric delta fields must be finite.
            assert!(player_impulse_dx.is_finite(), "player_impulse_dx finite");
            assert!(player_impulse_dy.is_finite(), "player_impulse_dy finite");
            assert!(enemy_impulse_dx.is_finite(), "enemy_impulse_dx finite");
            assert!(enemy_impulse_dy.is_finite(), "enemy_impulse_dy finite");
            assert!(separation_dx.is_finite(), "separation_dx finite");
            assert!(separation_dy.is_finite(), "separation_dy finite");
            assert!(enemy_separation_dx.is_finite(), "enemy_separation_dx finite");
            assert!(enemy_separation_dy.is_finite(), "enemy_separation_dy finite");

            // Approaching bodies ⇒ impulses fire.
            // Player gets pushed west (negative dx); enemy gets pushed east.
            assert!(
                player_impulse_dx < 0.0,
                "player gets shoved west, got dx={}",
                player_impulse_dx
            );
            assert!(
                enemy_impulse_dx > 0.0,
                "enemy gets shoved east, got dx={}",
                enemy_impulse_dx
            );
            // Both on the x-axis ⇒ y-components ≈ 0.
            approx_eq(player_impulse_dy, 0.0, "player_impulse_dy");
            approx_eq(enemy_impulse_dy, 0.0, "enemy_impulse_dy");

            // Separation:
            //   overlap = 13, ratio = 0.6 ⇒ separationForce = 7.8.
            //   Player goes west: separation_dx = -7.8.
            //   Enemy goes east: enemy_separation_dx = +7.8.
            let expected_sep_force = 13.0 * OVERLAP_SEPARATION_RATIO; // 7.8
            approx_eq(separation_dx, -expected_sep_force, "separation_dx");
            approx_eq(separation_dy, 0.0, "separation_dy");
            approx_eq(
                enemy_separation_dx,
                expected_sep_force,
                "enemy_separation_dx",
            );
            approx_eq(enemy_separation_dy, 0.0, "enemy_separation_dy");

            // Newton's-law sanity: enemy separation mirrors player.
            approx_eq(
                enemy_separation_dx,
                -separation_dx,
                "enemy_separation_dx mirrors -separation_dx",
            );
        }
        ev => panic!("expected PlayerHitEnemy, got {:?}", ev),
    }
}

// ---------------------------------------------------------------------
// Fixture 16 — geometry miss: centers further than sum_r apart emits no
// event.
//
// Mirrors `tests/unit/sim/collision.test.js::"player outside (player.r +
// enemy.r) emits no event"`.
// ---------------------------------------------------------------------

#[test]
fn player_enemy_geometry_miss() {
    let player = make_player(1, 0.0, 0.0);
    // 200 px ≫ sum_r=33 ⇒ no overlap.
    let enemy = make_enemy_with_mass(10, 200.0, 0.0);

    let players = vec![player];
    let enemies = vec![enemy];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_enemy_hits(&players, &enemies, &ctx, &mut events);

    assert!(
        events.is_empty(),
        "player outside sum-of-radii should emit no event, got {:?}",
        events
    );
}

// ---------------------------------------------------------------------
// Fixture 17 — separating velocities (graze frame). Bodies overlap but
// their relative velocity already points outward ⇒ bounce impulses must
// be zero. Damage event STILL fires; separation STILL applies (overlap
// > 0 path runs independent of the bail-out — matches legacy lines
// 1796–1806).
//
// Mirrors `tests/unit/sim/collision.test.js::"player moving away from
// enemy still overlaps: damage + separation fire, impulse is zero"`.
//
// Geometry: player + enemy overlap (distance=20, sum_r=33). But player
// is moving AWAY now (player westbound vx=-5, enemy stationary). Normal
// = (-1, 0); relVx = -5, velAlongNormal = (-5) · (-1) = +5 > 0 ⇒
// separating ⇒ bail.
// ---------------------------------------------------------------------

#[test]
fn player_enemy_graze_separating() {
    let mut player = make_player(1, 100.0, 100.0);
    player.vx = -5.0;
    player.vy = 0.0;

    let enemy = make_enemy_with_mass(10, 120.0, 100.0);

    let players = vec![player];
    let enemies = vec![enemy];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_enemy_hits(&players, &enemies, &ctx, &mut events);

    assert_eq!(
        events.len(),
        1,
        "graze still emits an event (damage path runs unconditionally on overlap)"
    );

    match events[0] {
        CollisionEvent::PlayerHitEnemy {
            damage_to_enemy,
            player_impulse_dx,
            player_impulse_dy,
            enemy_impulse_dx,
            enemy_impulse_dy,
            separation_dx,
            separation_dy,
            enemy_separation_dx,
            enemy_separation_dy,
            ..
        } => {
            // Damage still applies on graze.
            assert!(
                (damage_to_enemy - 5.0).abs() < 1e-6,
                "damage still applied on graze frame"
            );
            // Impulses zero on both bodies — the bail-out branch.
            approx_eq(player_impulse_dx, 0.0, "player_impulse_dx (separating)");
            approx_eq(player_impulse_dy, 0.0, "player_impulse_dy (separating)");
            approx_eq(enemy_impulse_dx, 0.0, "enemy_impulse_dx (separating)");
            approx_eq(enemy_impulse_dy, 0.0, "enemy_impulse_dy (separating)");
            // But separation STILL applies — overlap > 0 path runs
            // independent of the velAlongNormal bail-out. Pin
            // the EXACT formula (overlap × ratio).
            let expected_sep_force = 13.0 * OVERLAP_SEPARATION_RATIO; // 7.8
            approx_eq(separation_dx, -expected_sep_force, "separation_dx (graze)");
            approx_eq(separation_dy, 0.0, "separation_dy (graze)");
            approx_eq(
                enemy_separation_dx,
                expected_sep_force,
                "enemy_separation_dx (graze)",
            );
            approx_eq(enemy_separation_dy, 0.0, "enemy_separation_dy (graze)");
        }
        ev => panic!("expected PlayerHitEnemy, got {:?}", ev),
    }
}

// ---------------------------------------------------------------------
// Fixture 18 — one player overlapping two enemies in the same tick ⇒
// two events.
//
// Mirrors `tests/unit/sim/collision.test.js::"player caught between two
// enemies emits two events"`.
//
// Geometry: player at (100, 100), enemies at east (120, 100) + west
// (80, 100). sum_r=33, each enemy 20 px out ⇒ both overlap.
// ---------------------------------------------------------------------

#[test]
fn player_enemy_multiple_hits() {
    let player = make_player(1, 100.0, 100.0);

    let east = make_enemy_with_mass(10, 120.0, 100.0);
    let west = make_enemy_with_mass(20, 80.0, 100.0);

    let players = vec![player];
    let enemies = vec![east, west];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_enemy_hits(&players, &enemies, &ctx, &mut events);

    assert_eq!(events.len(), 2, "expected two events (one per overlapping enemy)");

    // Both events should be for the same player.
    let mut ids: Vec<u32> = events
        .iter()
        .map(|e| match *e {
            CollisionEvent::PlayerHitEnemy {
                player_id,
                enemy_id,
                damage_to_enemy,
                ..
            } => {
                assert_eq!(player_id, 1, "all events should be for player 1");
                assert!(
                    (damage_to_enemy - 5.0).abs() < 1e-6,
                    "damage_to_enemy must be 5 on each event"
                );
                enemy_id
            }
            ev => panic!("expected PlayerHitEnemy, got {:?}", ev),
        })
        .collect();
    ids.sort();
    assert_eq!(ids, vec![10, 20], "expected enemies 10 and 20");
}

// ---------------------------------------------------------------------
// Fixture 19 — skip gates (inactive player / inactive enemy / warping /
// death-flash) emit no event.
//
// Mirrors the four `tests/unit/sim/collision.test.js::"skip"` scenarios
// in the player-enemy describe block. Combined into a single Rust test
// for brevity; each sub-block constructs the smallest possible failing
// state.
// ---------------------------------------------------------------------

#[test]
fn player_enemy_skip_gates() {
    let ctx = CollisionContext;

    // Sub-test (a): inactive player → no event.
    {
        let mut player = make_player(1, 100.0, 100.0);
        player.active = false;
        let enemy = make_enemy_with_mass(10, 120.0, 100.0);
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_enemy_hits(&[player], &[enemy], &ctx, &mut events);
        assert!(events.is_empty(), "inactive player must not emit event");
    }

    // Sub-test (b): inactive enemy → no event.
    {
        let player = make_player(1, 100.0, 100.0);
        let mut enemy = make_enemy_with_mass(10, 120.0, 100.0);
        enemy.active = false;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_enemy_hits(&[player], &[enemy], &ctx, &mut events);
        assert!(events.is_empty(), "inactive enemy must not emit event");
    }

    // Sub-test (c): warping enemy → no event.
    {
        let player = make_player(1, 100.0, 100.0);
        let mut enemy = make_enemy_with_mass(10, 120.0, 100.0);
        enemy.warping = true;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_enemy_hits(&[player], &[enemy], &ctx, &mut events);
        assert!(events.is_empty(), "warping enemy must not emit event");
    }

    // Sub-test (d): enemy mid-death-flash → no event.
    {
        let player = make_player(1, 100.0, 100.0);
        let mut enemy = make_enemy_with_mass(10, 120.0, 100.0);
        enemy.death_flash = 5;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_enemy_hits(&[player], &[enemy], &ctx, &mut events);
        assert!(
            events.is_empty(),
            "enemy mid-death-flash must not emit event"
        );
    }

    // Sub-test (e): empty inputs (defensive) → no event.
    {
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_player_enemy_hits(
            &[],
            &[make_enemy_with_mass(10, 0.0, 0.0)],
            &ctx,
            &mut events,
        );
        assert!(events.is_empty(), "empty players → no event");

        let mut events2: Vec<CollisionEvent> = Vec::new();
        detect_player_enemy_hits(&[make_player(1, 0.0, 0.0)], &[], &ctx, &mut events2);
        assert!(events2.is_empty(), "empty enemies → no event");
    }
}

// ---------------------------------------------------------------------
// Fixture 20 — textbook restitution pin. Zero-velocity player + zero-
// velocity enemy at known positions ⇒ velAlongNormal = 0 (the boundary
// case, NOT separating). With both bodies stationary, the impulse path
// fires with `vel_along_normal == 0`:
//   impulseScalar = -(1 + 0.9) · 0 / totalMass = 0
//   ⇒ all impulse deltas exactly zero.
//
// This is the asymmetry vs the asteroid pair: the asteroid path has
// NO impulse gate AND adds OVERLAP_PUSH_FORCE × normal to the player
// impulse. The enemy path has NEITHER — so with zero relative velocity
// the player impulse is exactly (0, 0), not (-5, 0) like the asteroid
// pair's separation fixture.
//
// Damage and separation still fire (overlap > 0 path runs
// unconditionally). This is the "no jitter, no OVERLAP_PUSH_FORCE"
// determinism pin.
//
// Geometry: player at (100, 100) r=15; enemy at (120, 100) r=18.
//   distance = 20, sum_r = 33 ⇒ overlap = 13.
//   Normal (enemy → player) = (-1, 0).
//   separationForce = 13 · 0.6 = 7.8.
//   Player separation: (-1, 0) · 7.8 = (-7.8, 0).
//   Enemy separation:  (+1, 0) · 7.8 = (+7.8, 0).
// ---------------------------------------------------------------------

#[test]
fn player_enemy_textbook_restitution_pin() {
    let player = make_player(1, 100.0, 100.0);
    let enemy = make_enemy_with_mass(10, 120.0, 100.0);

    let players = vec![player];
    let enemies = vec![enemy];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_player_enemy_hits(&players, &enemies, &ctx, &mut events);

    assert_eq!(events.len(), 1, "expected exactly one event");

    let expected_sep_force = 13.0 * OVERLAP_SEPARATION_RATIO; // 7.8

    match events[0] {
        CollisionEvent::PlayerHitEnemy {
            damage_to_enemy,
            player_impulse_dx,
            player_impulse_dy,
            enemy_impulse_dx,
            enemy_impulse_dy,
            separation_dx,
            separation_dy,
            enemy_separation_dx,
            enemy_separation_dy,
            ..
        } => {
            // Damage fires regardless.
            assert!(
                (damage_to_enemy - 5.0).abs() < 1e-6,
                "damage_to_enemy = 5"
            );
            // Zero relative velocity ⇒ impulseScalar = 0 ⇒ all impulse
            // deltas exactly zero. NO jitter, NO OVERLAP_PUSH_FORCE
            // — the player-enemy pair lacks both terms.
            approx_eq(player_impulse_dx, 0.0, "player_impulse_dx (zero v)");
            approx_eq(player_impulse_dy, 0.0, "player_impulse_dy (zero v)");
            approx_eq(enemy_impulse_dx, 0.0, "enemy_impulse_dx (zero v)");
            approx_eq(enemy_impulse_dy, 0.0, "enemy_impulse_dy (zero v)");
            // Separation still fires — overlap × ratio formula, split
            // between both bodies.
            approx_eq(separation_dx, -expected_sep_force, "separation_dx");
            approx_eq(separation_dy, 0.0, "separation_dy");
            approx_eq(
                enemy_separation_dx,
                expected_sep_force,
                "enemy_separation_dx",
            );
            approx_eq(enemy_separation_dy, 0.0, "enemy_separation_dy");
        }
        ev => panic!("expected PlayerHitEnemy, got {:?}", ev),
    }

    // Constant-parity guard: the player-enemy pair consumes these three
    // verbatim from `COLLISION_CONFIG` in the legacy module. Sanity-check
    // they still match the JS values.
    assert!(
        (BOUNCE_RESTITUTION - 0.9).abs() < 1e-6,
        "BOUNCE_RESTITUTION must mirror JS verbatim"
    );
    assert!(
        (BOUNCE_FORCE_MULTIPLIER - 12.0).abs() < 1e-6,
        "BOUNCE_FORCE_MULTIPLIER must mirror JS verbatim"
    );
    assert!(
        (OVERLAP_SEPARATION_RATIO - 0.6).abs() < 1e-6,
        "OVERLAP_SEPARATION_RATIO must mirror JS verbatim"
    );
    assert!(
        (PLAYER_ENEMY_COLLISION_DAMAGE - 5.0).abs() < 1e-6,
        "PLAYER_ENEMY_COLLISION_DAMAGE must mirror JS verbatim"
    );
}

// ═════════════════════════════════════════════════════════════════════
// Enemy-vs-asteroid fixtures (Phase 2.5 dispatch 5 — this PR).
// ═════════════════════════════════════════════════════════════════════
//
// Mirrors `js/sim/collision.js::detectEnemyAsteroidHits` and the Jest
// suite at `tests/unit/sim/collision.test.js` (the enemy-asteroid
// describe block added in PR #44).
//
// UNIQUE among the five pairs so far — pure push-impulse only:
//   - NO damage to either side.
//   - NO restitution / mass-aware impulse math (fixed-force scalar push).
//   - NO position separation (only velocity deltas).
//   - NO jitter / RNG (fully deterministic).
//
// Event shape: exactly 6 fields (enemy_id, asteroid_id, and the 2×2
// impulse delta block). Smallest event in the collision module.
//
// Coverage:
//   21. `enemy_asteroid_single_hit`
//       — basic overlap → 1 event; push direction + magnitudes pin to
//         (-ENEMY_ASTEROID_PUSH, 0) and (+ASTEROID_ENEMY_PUSH, 0).
//   22. `enemy_asteroid_geometry_miss`
//       — 200 px apart → 0 events.
//   23. `enemy_asteroid_multiple_hits`
//       — one enemy overlapping two asteroids → 2 events.
//   24. `enemy_asteroid_skip_gates`
//       — inactive enemy / inactive asteroid / warping enemy /
//         warping asteroid / asteroid mid-death-flash → 0 events.
//   25. `enemy_asteroid_push_direction_pin`
//       — enemy WEST of asteroid (so dx > 0 to asteroid) ⇒ enemy
//         impulse_dx < 0; asteroid impulse_dx > 0; signs opposite.
//   26. `enemy_asteroid_no_damage_no_separation_pin`
//       — verify event has EXACTLY 6 fields. No damage_*, no
//         separation_*. Tested by destructuring all 6 fields out and
//         confirming compile-time exhaustiveness (rustc will reject a
//         destructuring pattern that doesn't list every variant field).

// ---------------------------------------------------------------------
// Helpers — reuse `make_asteroid` from earlier dispatches. The
// bullet-enemy `make_enemy` helper above leaves mass unset, which is
// fine for the enemy-asteroid pair: this pair doesn't read mass at all
// (no mass-aware impulse math).
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Fixture 21 — single overlapping enemy + asteroid emits one event with
// exactly 6 fields populated, and push magnitudes pin to the
// constants verbatim.
//
// Mirrors `tests/unit/sim/collision.test.js::"overlapping enemy +
// asteroid emits one event with all 6 non-type fields"` and
// `"impulse magnitudes match the push-force constants verbatim"`.
//
// Geometry:
//   - Enemy at (100, 100), radius 18.
//   - Asteroid 20 px east at (120, 100), radius 30.
//   - sumR = 48, distance = 20 ⇒ overlap = 28 (clear hit).
//   - angle = atan2(0, +20) = 0 ⇒ cos=1, sin=0.
// Expected:
//   - enemy_impulse_dx = -1·4 = -4 (west — away from asteroid)
//   - enemy_impulse_dy = 0
//   - asteroid_impulse_dx = +1·2 = +2 (east — away from enemy)
//   - asteroid_impulse_dy = 0
// ---------------------------------------------------------------------

#[test]
fn enemy_asteroid_single_hit() {
    let enemy = make_enemy(7, 100.0, 100.0);
    let asteroid = make_asteroid(42, 120.0, 100.0);

    let enemies = vec![enemy];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_enemy_asteroid_hits(&enemies, &asteroids, &ctx, &mut events);

    assert_eq!(events.len(), 1, "expected exactly one enemy-hit-asteroid event");

    match events[0] {
        CollisionEvent::EnemyHitAsteroid {
            enemy_id,
            asteroid_id,
            enemy_impulse_dx,
            enemy_impulse_dy,
            asteroid_impulse_dx,
            asteroid_impulse_dy,
        } => {
            assert_eq!(enemy_id, 7, "enemy_id");
            assert_eq!(asteroid_id, 42, "asteroid_id");

            // All four numeric delta fields must be finite.
            assert!(enemy_impulse_dx.is_finite(), "enemy_impulse_dx finite");
            assert!(enemy_impulse_dy.is_finite(), "enemy_impulse_dy finite");
            assert!(asteroid_impulse_dx.is_finite(), "asteroid_impulse_dx finite");
            assert!(asteroid_impulse_dy.is_finite(), "asteroid_impulse_dy finite");

            // Push magnitudes pin to the constants verbatim.
            //   angle = atan2(0, +20) = 0 ⇒ cos=1, sin=0.
            //   enemy gets (-cos·4, -sin·4) = (-4, 0).
            //   asteroid gets (+cos·2, +sin·2) = (+2, 0).
            approx_eq(enemy_impulse_dx, -ENEMY_ASTEROID_PUSH, "enemy_impulse_dx");
            approx_eq(enemy_impulse_dy, 0.0, "enemy_impulse_dy");
            approx_eq(asteroid_impulse_dx, ASTEROID_ENEMY_PUSH, "asteroid_impulse_dx");
            approx_eq(asteroid_impulse_dy, 0.0, "asteroid_impulse_dy");
        }
        ev => panic!("expected EnemyHitAsteroid, got {:?}", ev),
    }

    // Constant-parity sanity: pin the two push forces verbatim.
    assert!(
        (ENEMY_ASTEROID_PUSH - 4.0).abs() < 1e-6,
        "ENEMY_ASTEROID_PUSH must mirror JS verbatim"
    );
    assert!(
        (ASTEROID_ENEMY_PUSH - 2.0).abs() < 1e-6,
        "ASTEROID_ENEMY_PUSH must mirror JS verbatim"
    );
}

// ---------------------------------------------------------------------
// Fixture 22 — geometry miss: centers further than sumR apart emits
// no event.
//
// Mirrors `tests/unit/sim/collision.test.js::"enemy outside (enemy.r +
// asteroid.r) emits no event"`.
// ---------------------------------------------------------------------

#[test]
fn enemy_asteroid_geometry_miss() {
    let enemy = make_enemy(7, 0.0, 0.0);
    // 200 px ≫ sumR=48 ⇒ no overlap.
    let asteroid = make_asteroid(42, 200.0, 0.0);

    let enemies = vec![enemy];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_enemy_asteroid_hits(&enemies, &asteroids, &ctx, &mut events);

    assert!(
        events.is_empty(),
        "enemy outside sum-of-radii should emit no event, got {:?}",
        events
    );
}

// ---------------------------------------------------------------------
// Fixture 23 — one enemy overlapping two asteroids in the same tick ⇒
// two events.
//
// Mirrors `tests/unit/sim/collision.test.js::"one enemy overlapping two
// asteroids emits two events"`.
//
// Geometry: enemy at (100, 100); asteroids east (120, 100) + west
// (80, 100). sumR=48; each rock 20 px out ⇒ both overlap.
// ---------------------------------------------------------------------

#[test]
fn enemy_asteroid_multiple_hits() {
    let enemy = make_enemy(7, 100.0, 100.0);

    let east = make_asteroid(10, 120.0, 100.0);
    let west = make_asteroid(20, 80.0, 100.0);

    let enemies = vec![enemy];
    let asteroids = vec![east, west];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_enemy_asteroid_hits(&enemies, &asteroids, &ctx, &mut events);

    assert_eq!(events.len(), 2, "expected two events (one per overlapping asteroid)");

    // Both events should be for the same enemy.
    let mut ids: Vec<u32> = events
        .iter()
        .map(|e| match *e {
            CollisionEvent::EnemyHitAsteroid {
                enemy_id,
                asteroid_id,
                ..
            } => {
                assert_eq!(enemy_id, 7, "all events should be for enemy 7");
                asteroid_id
            }
            ev => panic!("expected EnemyHitAsteroid, got {:?}", ev),
        })
        .collect();
    ids.sort();
    assert_eq!(ids, vec![10, 20], "expected asteroids 10 and 20");
}

// ---------------------------------------------------------------------
// Fixture 24 — skip gates (inactive enemy / inactive asteroid / warping
// enemy / warping asteroid / asteroid mid-death-flash) emit no event.
//
// Mirrors the six `tests/unit/sim/collision.test.js::"skipped pairs"`
// scenarios in the enemy-asteroid describe block. Combined into a
// single Rust test for brevity; each sub-block constructs the smallest
// possible failing state.
// ---------------------------------------------------------------------

#[test]
fn enemy_asteroid_skip_gates() {
    let ctx = CollisionContext;

    // Sub-test (a): inactive enemy → no event.
    {
        let mut enemy = make_enemy(7, 100.0, 100.0);
        enemy.active = false;
        let asteroid = make_asteroid(42, 120.0, 100.0);
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[enemy], &[asteroid], &ctx, &mut events);
        assert!(events.is_empty(), "inactive enemy must not emit event");
    }

    // Sub-test (b): inactive asteroid → no event.
    {
        let enemy = make_enemy(7, 100.0, 100.0);
        let mut asteroid = make_asteroid(42, 120.0, 100.0);
        asteroid.active = false;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[enemy], &[asteroid], &ctx, &mut events);
        assert!(events.is_empty(), "inactive asteroid must not emit event");
    }

    // Sub-test (c): warping enemy → no event.
    {
        let mut enemy = make_enemy(7, 100.0, 100.0);
        enemy.warping = true;
        let asteroid = make_asteroid(42, 120.0, 100.0);
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[enemy], &[asteroid], &ctx, &mut events);
        assert!(events.is_empty(), "warping enemy must not emit event");
    }

    // Sub-test (d): warping asteroid → no event.
    {
        let enemy = make_enemy(7, 100.0, 100.0);
        let mut asteroid = make_asteroid(42, 120.0, 100.0);
        asteroid.warping = true;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[enemy], &[asteroid], &ctx, &mut events);
        assert!(events.is_empty(), "warping asteroid must not emit event");
    }

    // Sub-test (e): asteroid mid death-flash → no event.
    {
        let enemy = make_enemy(7, 100.0, 100.0);
        let mut asteroid = make_asteroid(42, 120.0, 100.0);
        asteroid.death_flash = 5;
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[enemy], &[asteroid], &ctx, &mut events);
        assert!(
            events.is_empty(),
            "asteroid mid-death-flash must not emit event"
        );
    }

    // Sub-test (f): empty inputs (defensive) → no event.
    {
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[], &[make_asteroid(42, 0.0, 0.0)], &ctx, &mut events);
        assert!(events.is_empty(), "empty enemies → no event");

        let mut events2: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[make_enemy(7, 0.0, 0.0)], &[], &ctx, &mut events2);
        assert!(events2.is_empty(), "empty asteroids → no event");
    }
}

// ---------------------------------------------------------------------
// Fixture 25 — push direction pin. An enemy WEST of an asteroid should
// be pushed FURTHER WEST (negative dx); the asteroid should be pushed
// FURTHER EAST (positive dx). The two impulses must point in OPPOSITE
// directions along x.
//
// Mirrors `tests/unit/sim/collision.test.js::"enemy west of asteroid →
// enemy pushed west, asteroid pushed east"` and
// `"enemy north of asteroid → enemy pushed north, asteroid pushed
// south"`. We pin both axes (x and y) here for stronger coverage.
//
// Geometry case 1 — east/west:
//   Enemy at (100, 100); asteroid at (120, 100). Enemy is WEST of
//   asteroid.
//     dx = asteroid.x - enemy.x = +20 → angle = 0
//     cos(angle) = 1, sin(angle) = 0
//     enemy_impulse_dx = -1·4 = -4 (WEST)
//     asteroid_impulse_dx = +1·2 = +2 (EAST)
//
// Geometry case 2 — north/south (screen-coords y grows downward):
//   Enemy at (100, 80); asteroid at (100, 100). Enemy is NORTH (smaller
//   y) of asteroid.
//     dy = asteroid.y - enemy.y = +20 → angle = π/2
//     cos = 0, sin = 1
//     enemy_impulse_dy = -1·4 = -4 (NORTH)
//     asteroid_impulse_dy = +1·2 = +2 (SOUTH)
// ---------------------------------------------------------------------

#[test]
fn enemy_asteroid_push_direction_pin() {
    let ctx = CollisionContext;

    // Case 1: east/west.
    {
        let enemy = make_enemy(7, 100.0, 100.0);
        let asteroid = make_asteroid(42, 120.0, 100.0);
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[enemy], &[asteroid], &ctx, &mut events);
        assert_eq!(events.len(), 1, "case 1: expected one event");

        match events[0] {
            CollisionEvent::EnemyHitAsteroid {
                enemy_impulse_dx,
                enemy_impulse_dy,
                asteroid_impulse_dx,
                asteroid_impulse_dy,
                ..
            } => {
                // Enemy gets pushed west (negative x).
                assert!(
                    enemy_impulse_dx < 0.0,
                    "case 1: enemy_impulse_dx must be negative (westward), got {}",
                    enemy_impulse_dx
                );
                approx_eq(enemy_impulse_dy, 0.0, "case 1: enemy_impulse_dy");
                // Asteroid gets pushed east (positive x).
                assert!(
                    asteroid_impulse_dx > 0.0,
                    "case 1: asteroid_impulse_dx must be positive (eastward), got {}",
                    asteroid_impulse_dx
                );
                approx_eq(asteroid_impulse_dy, 0.0, "case 1: asteroid_impulse_dy");
                // Opposite signs along x.
                assert_eq!(
                    enemy_impulse_dx.signum(),
                    -asteroid_impulse_dx.signum(),
                    "case 1: impulses must point opposite directions along x"
                );
            }
            ev => panic!("case 1: expected EnemyHitAsteroid, got {:?}", ev),
        }
    }

    // Case 2: north/south (screen-coords y grows downward).
    {
        let enemy = make_enemy(7, 100.0, 80.0);
        let asteroid = make_asteroid(42, 100.0, 100.0);
        let mut events: Vec<CollisionEvent> = Vec::new();
        detect_enemy_asteroid_hits(&[enemy], &[asteroid], &ctx, &mut events);
        assert_eq!(events.len(), 1, "case 2: expected one event");

        match events[0] {
            CollisionEvent::EnemyHitAsteroid {
                enemy_impulse_dx,
                enemy_impulse_dy,
                asteroid_impulse_dx,
                asteroid_impulse_dy,
                ..
            } => {
                approx_eq(enemy_impulse_dx, 0.0, "case 2: enemy_impulse_dx");
                // Enemy gets pushed north (negative y in screen coords).
                assert!(
                    enemy_impulse_dy < 0.0,
                    "case 2: enemy_impulse_dy must be negative (northward), got {}",
                    enemy_impulse_dy
                );
                approx_eq(asteroid_impulse_dx, 0.0, "case 2: asteroid_impulse_dx");
                // Asteroid gets pushed south (positive y in screen coords).
                assert!(
                    asteroid_impulse_dy > 0.0,
                    "case 2: asteroid_impulse_dy must be positive (southward), got {}",
                    asteroid_impulse_dy
                );
                // Opposite signs along y.
                assert_eq!(
                    enemy_impulse_dy.signum(),
                    -asteroid_impulse_dy.signum(),
                    "case 2: impulses must point opposite directions along y"
                );
            }
            ev => panic!("case 2: expected EnemyHitAsteroid, got {:?}", ev),
        }
    }
}

// ---------------------------------------------------------------------
// Fixture 26 — event-shape pin: NO damage, NO separation, exactly 6
// fields.
//
// Mirrors `tests/unit/sim/collision.test.js::"overlapping enemy +
// asteroid emits one event with all 6 non-type fields"` — specifically
// the "explicit field-count guard" and the "defensive: no damage / no
// separation fields" expectations.
//
// The Rust mirror enforces this via the type system: the
// `CollisionEvent::EnemyHitAsteroid` variant is declared with EXACTLY
// 6 fields (enemy_id, asteroid_id, and the 2×2 impulse delta block).
// The destructuring pattern below lists all 6 fields by name — if a
// future change added (say) `damage` or `separation_dx` to the variant,
// rustc would either reject this destructuring as missing the new
// field, or the pattern would still compile but the new field would be
// silently shadowed under `..` — both situations produce test failures
// (compile error or follow-up assertion mismatch) that flag the change.
//
// To strengthen this further, we use a *complete* destructuring pattern
// with NO `..` rest binding — so rustc will fail compilation if a new
// field is ever added to the variant without updating this fixture.
// ---------------------------------------------------------------------

#[test]
fn enemy_asteroid_no_damage_no_separation_pin() {
    let enemy = make_enemy(7, 100.0, 100.0);
    let asteroid = make_asteroid(42, 120.0, 100.0);

    let enemies = vec![enemy];
    let asteroids = vec![asteroid];
    let ctx = CollisionContext;
    let mut events: Vec<CollisionEvent> = Vec::new();

    detect_enemy_asteroid_hits(&enemies, &asteroids, &ctx, &mut events);

    assert_eq!(events.len(), 1, "expected exactly one event");

    // Complete destructuring — NO `..` rest binding. If a new field is
    // ever added to the EnemyHitAsteroid variant (e.g. someone adds a
    // `damage` or `separation_dx`), rustc will reject this match and
    // surface the contract change at compile time. This is the Rust
    // equivalent of the JS test's `Object.keys(ev).sort()` field-count
    // guard.
    match events[0] {
        CollisionEvent::EnemyHitAsteroid {
            enemy_id,
            asteroid_id,
            enemy_impulse_dx,
            enemy_impulse_dy,
            asteroid_impulse_dx,
            asteroid_impulse_dy,
        } => {
            // All 6 fields present; sanity-check the ids and that the
            // impulse fields are finite.
            assert_eq!(enemy_id, 7, "enemy_id");
            assert_eq!(asteroid_id, 42, "asteroid_id");
            assert!(enemy_impulse_dx.is_finite());
            assert!(enemy_impulse_dy.is_finite());
            assert!(asteroid_impulse_dx.is_finite());
            assert!(asteroid_impulse_dy.is_finite());
        }
        ev => panic!("expected EnemyHitAsteroid, got {:?}", ev),
    }

    // Match-on-non-variants check: ensure this event is NOT being
    // mis-emitted as a different variant (which would carry damage or
    // separation fields). If a regression ever caused the detector to
    // emit a PlayerHitAsteroid/PlayerHitEnemy/etc. by mistake, the
    // strict-equality on the discriminant would catch it.
    if !matches!(events[0], CollisionEvent::EnemyHitAsteroid { .. }) {
        panic!(
            "regression: enemy-asteroid path emitted a non-EnemyHitAsteroid event: {:?}",
            events[0]
        );
    }
}

// ═════════════════════════════════════════════════════════════════════
// Player-vs-enemy-bullet fixtures (Phase 2.5 dispatch — this PR).
// ═════════════════════════════════════════════════════════════════════

fn make_enemy_bullet(id: u32, x: f32, y: f32) -> CollisionEnemyBullet {
    CollisionEnemyBullet {
        id,
        x,
        y,
        vx: 0.0,
        vy: 0.0,
        radius: 9.0,
        damage: 2.0,
        active: true,
    }
}

#[test]
fn player_enemy_bullet_single_hit() {
    let players = vec![make_player(1, 100.0, 100.0)];
    let bullets = vec![make_enemy_bullet(101, 105.0, 100.0)]; // overlap

    let mut events = Vec::new();
    let ctx = CollisionContext;
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);

    assert_eq!(events.len(), 1);
    match events[0] {
        CollisionEvent::PlayerHitByEnemyBullet {
            player_id,
            bullet_id,
            damage,
            bullet_x,
            bullet_y,
            bullet_vx,
            bullet_vy,
        } => {
            assert_eq!(player_id, 1);
            assert_eq!(bullet_id, 101);
            approx_eq(damage, 2.0, "damage");
            approx_eq(bullet_x, 105.0, "bullet_x");
            approx_eq(bullet_y, 100.0, "bullet_y");
            approx_eq(bullet_vx, 0.0, "bullet_vx");
            approx_eq(bullet_vy, 0.0, "bullet_vy");
        }
        _ => panic!("expected PlayerHitByEnemyBullet event"),
    }
}

#[test]
fn player_enemy_bullet_geometry_miss() {
    let players = vec![make_player(1, 100.0, 100.0)];
    let bullets = vec![make_enemy_bullet(101, 300.0, 100.0)]; // 200 px apart

    let mut events = Vec::new();
    let ctx = CollisionContext;
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);

    assert_eq!(events.len(), 0);
}

#[test]
fn player_enemy_bullet_multiple_bullets() {
    let players = vec![make_player(1, 100.0, 100.0)];
    let bullets = vec![
        make_enemy_bullet(101, 105.0, 100.0),  // hit
        make_enemy_bullet(102, 95.0, 100.0),   // hit
        make_enemy_bullet(103, 500.0, 500.0),  // miss
    ];

    let mut events = Vec::new();
    let ctx = CollisionContext;
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);

    assert_eq!(events.len(), 2);
}

#[test]
fn player_enemy_bullet_skip_gates() {
    // inactive player
    let players = vec![CollisionPlayer { active: false, ..make_player(1, 100.0, 100.0) }];
    let bullets = vec![make_enemy_bullet(101, 105.0, 100.0)];
    let mut events = Vec::new();
    let ctx = CollisionContext;
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);
    assert_eq!(events.len(), 0, "inactive player should skip");

    // inactive bullet
    let players = vec![make_player(1, 100.0, 100.0)];
    let bullets = vec![CollisionEnemyBullet { active: false, ..make_enemy_bullet(101, 105.0, 100.0) }];
    let mut events = Vec::new();
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);
    assert_eq!(events.len(), 0, "inactive bullet should skip");

    // empty inputs
    let mut events = Vec::new();
    detect_player_enemy_bullet_hits(&[], &bullets, &ctx, &mut events);
    assert_eq!(events.len(), 0, "empty players should emit nothing");
    detect_player_enemy_bullet_hits(&players, &[], &ctx, &mut events);
    assert_eq!(events.len(), 0, "empty bullets should emit nothing");
}

#[test]
fn player_enemy_bullet_damage_passthrough() {
    let players = vec![make_player(1, 100.0, 100.0)];
    // damage = 7 — pure passthrough
    let bullets = vec![CollisionEnemyBullet { damage: 7.0, ..make_enemy_bullet(101, 105.0, 100.0) }];

    let mut events = Vec::new();
    let ctx = CollisionContext;
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);

    assert_eq!(events.len(), 1);
    if let CollisionEvent::PlayerHitByEnemyBullet { damage, .. } = events[0] {
        approx_eq(damage, 7.0, "damage passthrough");
    } else {
        panic!("expected PlayerHitByEnemyBullet");
    }

    // damage = 25 — also pure passthrough
    let bullets = vec![CollisionEnemyBullet { damage: 25.0, ..make_enemy_bullet(102, 105.0, 100.0) }];
    let mut events = Vec::new();
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);

    assert_eq!(events.len(), 1);
    if let CollisionEvent::PlayerHitByEnemyBullet { damage, .. } = events[0] {
        approx_eq(damage, 25.0, "damage passthrough 25");
    } else {
        panic!("expected PlayerHitByEnemyBullet");
    }
}

#[test]
fn player_enemy_bullet_damage_default() {
    let players = vec![make_player(1, 100.0, 100.0)];

    // damage = 0 — defaults to 1
    let bullets = vec![CollisionEnemyBullet { damage: 0.0, ..make_enemy_bullet(101, 105.0, 100.0) }];
    let mut events = Vec::new();
    let ctx = CollisionContext;
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);

    assert_eq!(events.len(), 1);
    if let CollisionEvent::PlayerHitByEnemyBullet { damage, .. } = events[0] {
        approx_eq(damage, 1.0, "damage 0 → default 1");
    } else {
        panic!("expected PlayerHitByEnemyBullet");
    }

    // damage = -3 — also defaults to 1
    let bullets = vec![CollisionEnemyBullet { damage: -3.0, ..make_enemy_bullet(102, 105.0, 100.0) }];
    let mut events = Vec::new();
    detect_player_enemy_bullet_hits(&players, &bullets, &ctx, &mut events);

    assert_eq!(events.len(), 1);
    if let CollisionEvent::PlayerHitByEnemyBullet { damage, .. } = events[0] {
        approx_eq(damage, 1.0, "damage -3 → default 1");
    } else {
        panic!("expected PlayerHitByEnemyBullet");
    }
}
