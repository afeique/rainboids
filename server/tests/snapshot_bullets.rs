//! Snapshot bullet wire-format tests.
//!
//! `state_bullets.rs` covers the `GameState.bullets` collection plumbing
//! (push, drain prune, collision-vs-asteroid). This file covers the
//! *wire-format* projection: `snapshot::build(&state)` reads
//! `state.bullets: Vec<sim::state::BulletState>` and emits
//! `SnapshotPayload.bullets: Vec<protocol::BulletState>`, filtering out
//! inactive entries and dropping server-only fields (damage, pierce_count,
//! homing, helix params, age/max_age, active).
//!
//! Scope:
//!   1. Fresh `GameState` → snapshot payload has an empty `bullets` vec.
//!   2. One active bullet in state → payload contains it.
//!   3. Mix of active + inactive → only the active ones traverse.
//!   4. Field mapping (x/y/vx/vy/angle/radius) round-trips correctly.
//!   5. Ids are preserved through the projection.
//!
//! What this test does *not* cover:
//!   - Codec round-trip of the snapshot payload (covered by `wire_golden.rs`
//!     and `parity_*` tests).
//!   - Bullet physics (covered by `parity_bullet.rs`).
//!   - Collision drain side-effects on `bullets` (covered by
//!     `state_bullets.rs` and `collision_drain.rs`).

use rainboids_server::room::snapshot;
use rainboids_server::sim::state::{BulletId, BulletState, GameState};

// ─── Helpers ─────────────────────────────────────────────────────────

/// Construct a `BulletState` with explicit position + velocity so each test
/// can verify that exactly those fields round-trip through the projection.
fn make_bullet(id: u32, x: f32, y: f32, vx: f32, vy: f32) -> BulletState {
    let mut b = BulletState::fresh(BulletId(id));
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    // Non-default values for the remaining wire fields so we can confirm
    // they survive the mapping (rather than coincidentally matching the
    // `BulletState::fresh` defaults).
    b.angle = 1.25; // ≠ default 0.0
    b.radius = 7.5; // ≠ default 4.0
    b
}

// ─── 1. Fresh GameState → empty bullets ──────────────────────────────

#[test]
fn snapshot_bullets_default_empty() {
    let state = GameState::new();
    let payload = snapshot::build(&state);
    assert!(
        payload.bullets.is_empty(),
        "fresh GameState snapshot should have no bullets; got {} entries",
        payload.bullets.len()
    );
}

// ─── 2. One active bullet traverses the projection ───────────────────

#[test]
fn snapshot_bullets_includes_active() {
    let mut state = GameState::new();
    state.bullets.push(make_bullet(42, 100.0, 200.0, 3.0, -1.5));

    let payload = snapshot::build(&state);
    assert_eq!(
        payload.bullets.len(),
        1,
        "one active bullet pushed → exactly one bullet in payload; got {}",
        payload.bullets.len()
    );

    let b = &payload.bullets[0];
    assert_eq!(b.id, 42, "id should be preserved");
    assert_eq!(b.x, 100.0);
    assert_eq!(b.y, 200.0);
    assert_eq!(b.vx, 3.0);
    assert_eq!(b.vy, -1.5);
    assert_eq!(b.angle, 1.25);
    assert_eq!(b.radius, 7.5);
}

// ─── 3. Inactive bullets are filtered out ────────────────────────────

#[test]
fn snapshot_bullets_filters_inactive() {
    let mut state = GameState::new();

    // Active bullet — should appear in the payload.
    state
        .bullets
        .push(make_bullet(1, 50.0, 60.0, 1.0, 2.0));

    // Inactive bullet — should be filtered out. We push it after the active
    // one so we can assert the surviving entry is the active one specifically
    // (rather than the projection accidentally picking the first slot).
    let mut dead = make_bullet(2, 100.0, 200.0, 4.0, 5.0);
    dead.active = false;
    state.bullets.push(dead);

    // Another active bullet — confirms the filter doesn't short-circuit on
    // first inactive seen.
    state
        .bullets
        .push(make_bullet(3, 150.0, 160.0, 6.0, 7.0));

    assert_eq!(state.bullets.len(), 3, "sanity: 3 bullets stored");

    let payload = snapshot::build(&state);
    assert_eq!(
        payload.bullets.len(),
        2,
        "only active bullets should traverse; got {} (state had {} total, 1 inactive)",
        payload.bullets.len(),
        state.bullets.len()
    );

    let ids: Vec<u32> = payload.bullets.iter().map(|b| b.id).collect();
    assert!(ids.contains(&1), "active bullet 1 should be in payload; got {:?}", ids);
    assert!(ids.contains(&3), "active bullet 3 should be in payload; got {:?}", ids);
    assert!(!ids.contains(&2), "inactive bullet 2 should be filtered; got {:?}", ids);
}

// ─── 4. Field mapping x/y/vx/vy/angle/radius round-trips ─────────────

#[test]
fn snapshot_bullets_field_mapping() {
    let mut state = GameState::new();

    // Use distinguishable values for every wire field so a swapped mapping
    // (e.g. assigning state.x to wire.y) would surface immediately.
    let mut b = BulletState::fresh(BulletId(99));
    b.x = 11.0;
    b.y = 22.0;
    b.vx = 3.3;
    b.vy = -4.4;
    b.angle = 0.5;
    b.radius = 12.5;
    // Set a few server-only fields to non-default values to confirm they're
    // *not* in the wire payload (no field equivalence to silently project).
    b.damage = 99.0;
    b.pierce_count = 3;
    b.homing = true;
    b.helix_amplitude = 5.0;
    b.helix_freq = 0.25;
    b.age_ticks = 17;
    b.max_age_ticks = 200;
    state.bullets.push(b);

    let payload = snapshot::build(&state);
    assert_eq!(payload.bullets.len(), 1);

    let w = &payload.bullets[0];
    assert_eq!(w.x, 11.0, "x mapping");
    assert_eq!(w.y, 22.0, "y mapping");
    assert_eq!(w.vx, 3.3, "vx mapping");
    assert_eq!(w.vy, -4.4, "vy mapping");
    assert_eq!(w.angle, 0.5, "angle mapping");
    assert_eq!(w.radius, 12.5, "radius mapping");

    // Implicit assertion: the type `protocol::BulletState` doesn't have
    // damage / pierce_count / homing / helix_* / age_ticks / max_age_ticks /
    // active fields, so they can't traverse the wire. If a future schema
    // change adds any of these to the wire BulletState, this test will
    // need a deliberate update — flagging that it crosses the "minimal
    // wire footprint" line documented in the snapshot.rs header.
}

// ─── 5. Multiple bullets preserve their ids ──────────────────────────

#[test]
fn snapshot_bullets_id_preserved() {
    let mut state = GameState::new();

    // Push bullets with distinct, non-sequential ids to verify the
    // projection doesn't reassign or normalize ids.
    let ids = [7u32, 42, 100, u32::MAX, 1];
    for &id in &ids {
        state.bullets.push(make_bullet(id, 0.0, 0.0, 0.0, 0.0));
    }

    let payload = snapshot::build(&state);
    assert_eq!(payload.bullets.len(), ids.len());

    let payload_ids: Vec<u32> = payload.bullets.iter().map(|b| b.id).collect();
    assert_eq!(
        payload_ids, ids,
        "bullet ids should be preserved in original order; expected {:?}, got {:?}",
        ids, payload_ids
    );
}
