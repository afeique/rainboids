//! Pure drop-orb update step. Authoritative mirror of `js/sim/drops.js`.
//!
//! Mirrors the JS pure function `updateDrop` extracted from
//! `js/modules/world/color-star.js`'s collectible-orb branch (health and
//! money orbs). The decorative-starfield branch lives elsewhere and is not
//! ported here.
//!
//! What this module owns (parity-checked against `js/sim/drops.js`):
//!   - Lifetime tick (life-- ; deactivate when ≤ 0)
//!   - Friction (0.92 if health, else 0.985 — per-tick, not dt-scaled)
//!   - Position update (x += vx)
//!   - Opacity fade-in/fade-out (`min(1, life / 120)`)
//!   - Health-orb passive magnet (two-tier: 320 px gentle, 120 px snap)
//!   - Tractor-beam pull (any kind when `tractor_engaged = true`)
//!
//! What is **deferred** (stays out of this pure step):
//!   - Pickup attribution → owned by `collision.rs` (collision-extract
//!     session). No `Pickup` events fire today; `DropEvent` is reserved
//!     for the future `drop_expired` signal when life hits 0.
//!   - Drop spawning → driven by enemy/asteroid death events.
//!   - Rendering (3D-shape orb overlay, twinkle/shimmer, sparkle particles).
//!   - Decorative starfield (handled by `color-star.js` wrapper).
//!
//! Divergences from the JS:
//!   - JS `Date.now()` references and frame-clock-driven shimmer phases are
//!     NOT used by the pure step; the server doesn't read wall-clock time
//!     in physics. Every parity-affecting computation in `updateDrop` is
//!     deterministic on tick count and inputs only, so this divergence is
//!     a non-issue here.
//!   - `DropUpdateContext.field` is currently unused on both sides (drops
//!     don't bounce off the field; they expire via lifetime). Carried for
//!     API symmetry with `ship`.
//!   - The wire `protocol::DropState` (id, kind, x, y) is intentionally
//!     a slim snapshot subset; the rich `Drop` struct here mirrors the JS
//!     `DropState` typedef (`js/sim/state.js` line 274+) used by the pure
//!     simulation. The wrapper layer is responsible for projecting `Drop`
//!     down to `DropState` for snapshots.
//!   - `update` (the legacy stub at the bottom) is kept as-is so
//!     `sim::simulate_tick` (mod.rs:39) still compiles. It calls into
//!     `update_drops` once the wrapper integration lands.

use crate::protocol::{DropState, GameEvent, ShipState};

// ── Drop physics tuning constants — verbatim from `js/sim/drops.js` ─────
//
// All values here are byte-for-byte equivalent to the JS exports. Order and
// comments mirror the JS source so `git blame` lines up across files.

/// Friction multiplier for health orbs. Mirrors `DROP_FRICTION_HEALTH` in
/// `js/sim/drops.js` line 52. Heavier than the default so the magnet's
/// per-tick force pump doesn't accelerate them to absurd speeds — steady
/// state v ≈ F/(1 − f).
pub const DROP_FRICTION_HEALTH: f32 = 0.92;

/// Friction multiplier for non-health orbs (gold shape, gold pixel).
/// Mirrors `DROP_FRICTION_DEFAULT` in `js/sim/drops.js` line 55. Lighter
/// because these orbs are tractor-only and need to drift more freely.
pub const DROP_FRICTION_DEFAULT: f32 = 0.985;

/// Outer magnet radius — gentle pull starts here. Health orbs only.
/// Mirrors `DROP_MAGNET_FAR_RADIUS` in `js/sim/drops.js` line 58.
pub const DROP_MAGNET_FAR_RADIUS: f32 = 320.0;

/// Inner magnet radius — strong snap kicks in here. Health orbs only.
/// Mirrors `DROP_MAGNET_NEAR_RADIUS` in `js/sim/drops.js` line 61.
pub const DROP_MAGNET_NEAR_RADIUS: f32 = 120.0;

/// Gentle-pull force constant (the `8` in the original `color-star.js`).
/// Mirrors `DROP_MAGNET_FAR_FORCE` in `js/sim/drops.js` line 64.
pub const DROP_MAGNET_FAR_FORCE: f32 = 8.0;

/// Snap-pull force constant (the `22` in the original `color-star.js`).
/// Mirrors `DROP_MAGNET_NEAR_FORCE` in `js/sim/drops.js` line 67.
pub const DROP_MAGNET_NEAR_FORCE: f32 = 22.0;

/// Opacity fade window — opacity is `min(1, life / 120)`. With `life`
/// starting at 7200 and decrementing per tick, opacity stays at 1.0 for
/// the first ~7080 ticks, then fades out over the last 120 ticks (~2 s
/// @60 Hz) before deactivation. Mirrors `DROP_OPACITY_FADE_FRAMES` in
/// `js/sim/drops.js` line 76.
pub const DROP_OPACITY_FADE_FRAMES: f32 = 120.0;

/// Drop kind discriminator. Mirrors the JS string discriminator
/// (`'health' | 'money_shape' | 'money_pixel' | 'powerup'` — see
/// `DropState` typedef in `js/sim/state.js` line 274+). Encoded as `u8`
/// for compactness; the wrapper translates between the JS string form
/// and these tags.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DropKind {
    /// Blue 3D-shape orb, magnet-attractive (the two-tier 320/120 magnet).
    Health = 0,
    /// Gold shape orb (the 1–3 "big" gold drops per kill, tractor-only).
    MoneyShape = 1,
    /// Gold pixel orb (the 10–25 "tiny" gold drops per kill, tractor-only).
    MoneyPixel = 2,
    /// Reserved for future powerup pickups (no pure-sim consumer today).
    Powerup = 3,
}

impl Default for DropKind {
    fn default() -> Self {
        DropKind::Health
    }
}

/// Working drop state used by the pure drop sim. Mirrors the JS
/// `DropState` typedef in `js/sim/state.js` line 274+. Distinct from the
/// wire `protocol::DropState` (which is the slim prediction subset).
#[derive(Debug, Clone, Copy)]
pub struct Drop {
    /// Per-spawn id.
    pub id: u32,
    /// Drop kind discriminator. Drives friction selection and magnet gating.
    pub kind: DropKind,
    /// World x (px).
    pub x: f32,
    /// World y (px).
    pub y: f32,
    /// Velocity x (px/tick).
    pub vx: f32,
    /// Velocity y (px/tick).
    pub vy: f32,
    /// Ticks remaining until despawn. Default 7200 ticks (~120 s @60 Hz).
    pub life: i32,
    /// Collision radius for pickup (reserved for collision-extract).
    pub radius: f32,
    /// Heal-amount or money-value (reserved for collision-extract).
    pub value: i32,
    /// 0..1 fade output, computed by `update_drop`; renderer reads it.
    pub opacity: f32,
    /// Parallax depth (1.5..3.0 for collectibles); used by tractor pull
    /// as a force scale.
    pub z: f32,
    /// Active flag — `update_drop` skips inactive drops; lifetime expiry
    /// flips this off.
    pub active: bool,
}

impl Default for Drop {
    fn default() -> Self {
        Self {
            id: 0,
            kind: DropKind::Health,
            x: 0.0,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            life: 7200,
            radius: 14.0,
            value: 1,
            opacity: 1.0,
            z: 2.0,
            active: true,
        }
    }
}

/// Per-tick context bag for `update_drop`. Mirrors the JS
/// `DropUpdateContext` typedef in `js/sim/state.js` line 332+.
///
/// Not `Copy` — `Field` is `Clone`-only, mirroring sibling A's
/// `AsteroidContext` (`asteroid.rs`).
#[derive(Debug, Clone)]
pub struct DropContext<'a> {
    /// Active player ships. The pure step picks the nearest as the
    /// magnet/tractor anchor.
    pub ships: &'a [ShipState],
    /// World bounds. Currently unused (drops don't bounce off the field;
    /// they expire via the lifetime tick) — carried for API symmetry.
    pub field: super::state::Field,
    /// Seconds (typically 1/60). Currently unused by the pure step (the
    /// JS pipeline is per-tick, not dt-scaled), kept for API symmetry.
    pub dt: f32,
    /// True when the player's tractor skill is engaged this tick.
    pub tractor_engaged: bool,
    /// Tractor force scalar — `GAME_CONFIG.ACTIVE_STAR_ATTR * 1500` in
    /// the legacy code. Multiplied by the per-orb `z` and the per-orb
    /// fall-off `(1 - dist/range)`.
    pub tractor_attraction: f32,
    /// Tractor reach (px). Mirrors `GAME_CONFIG.ACTIVE_STAR_ATTRACT_DIST`.
    pub tractor_range: f32,
}

/// Out-buffer event surface for `update_drop`. Reserved for future
/// `drop_expired` signal when life hits 0; no events fire today (matches
/// the JS pure step, which writes nothing into its `_events` slot).
#[derive(Debug, Clone, Copy)]
pub enum DropEvent {
    /// Reserved for the collision-extract session. Fires when a ship
    /// scoops a drop. `drop_id` identifies the drop; `ship_index` points
    /// at the ship in `DropContext::ships`.
    #[allow(dead_code)]
    Pickup { drop_id: u32, ship_index: usize },
}

/// One logic tick of pure drop-orb kinematics. Mirrors `updateDrop` in
/// `js/sim/drops.js` line 112+.
///
/// **Order of operations is load-bearing for parity** — this matches the
/// JS exactly:
///   1. Lifetime tick (deactivate on expiry)
///   2. Friction
///   3. Position update
///   4. Opacity fade
///   5. Find nearest ship for magnet/tractor calculations
///   6. Health-orb passive magnet (two-tier: gentle then snap)
///   7. Tractor-beam pull (any kind, gated by `tractor_engaged`)
///
/// Do not reorder without a matching change in `js/sim/drops.js`.
pub fn update_drop(drop: &mut Drop, ctx: &DropContext, _events: &mut Vec<DropEvent>) {
    if !drop.active {
        return;
    }

    // ── Lifetime tick ──────────────────────────────────────────────────
    // Mirrors `js/sim/drops.js` line 120-124. Once life reaches 0 the
    // wrapper removes the drop from the active pool on the next cleanup
    // pass.
    drop.life -= 1;
    if drop.life <= 0 {
        drop.active = false;
        return;
    }

    // ── Friction ───────────────────────────────────────────────────────
    // Mirrors `js/sim/drops.js` line 131-134. Health orbs use the
    // heavier 0.92; everything else uses 0.985.
    let is_health = drop.kind == DropKind::Health;
    let friction = if is_health {
        DROP_FRICTION_HEALTH
    } else {
        DROP_FRICTION_DEFAULT
    };
    drop.vx *= friction;
    drop.vy *= friction;

    // ── Position update ────────────────────────────────────────────────
    // Mirrors `js/sim/drops.js` line 139-140. Per-tick delta, not
    // per-second integration (legacy behavior).
    drop.x += drop.vx;
    drop.y += drop.vy;

    // ── Opacity fade ───────────────────────────────────────────────────
    // Mirrors `js/sim/drops.js` line 147. Stays at 1.0 for the long tail
    // and fades over the last `DROP_OPACITY_FADE_FRAMES` ticks.
    let fade = (drop.life as f32) / DROP_OPACITY_FADE_FRAMES;
    drop.opacity = if fade < 1.0 { fade } else { 1.0 };

    // ── Find the nearest ship ──────────────────────────────────────────
    // Mirrors `js/sim/drops.js` line 154-174. The legacy code reads off
    // a single `playerPos`; for co-op we scan the ship list and pick
    // the nearest. For solo the loop trivially picks the only ship.
    let ships = ctx.ships;
    if ships.is_empty() {
        return;
    }

    let mut nearest_dx: f32 = 0.0;
    let mut nearest_dy: f32 = 0.0;
    let mut nearest_dist: f32 = f32::INFINITY;
    let mut found = false;
    for s in ships.iter() {
        // ShipState has no `active` flag in the wire protocol today; the
        // wrapper is expected to filter inactive ships before passing
        // the slice in. (Matches sibling A's ship.rs assumption.)
        let dx = s.x - drop.x;
        let dy = s.y - drop.y;
        let dist = (dx * dx + dy * dy).sqrt();
        if dist < nearest_dist {
            nearest_dist = dist;
            nearest_dx = dx;
            nearest_dy = dy;
            found = true;
        }
    }
    if !found {
        return;
    }
    let dist = nearest_dist;

    // ── Health-orb passive magnet (two-tier) ───────────────────────────
    // Mirrors `js/sim/drops.js` line 182-192. Health orbs only — gold
    // orbs (shape and pixel) drift freely until the player's tractor
    // beam scoops them. The `dist > 1` guard prevents a divide-by-near-
    // zero pull when the ship is right on top of the orb.
    if is_health && dist > 1.0 && dist < DROP_MAGNET_FAR_RADIUS {
        let inv = 1.0 / dist;
        let far_factor = (DROP_MAGNET_FAR_RADIUS - dist) / DROP_MAGNET_FAR_RADIUS;
        drop.vx += nearest_dx * inv * DROP_MAGNET_FAR_FORCE * far_factor;
        drop.vy += nearest_dy * inv * DROP_MAGNET_FAR_FORCE * far_factor;
        if dist < DROP_MAGNET_NEAR_RADIUS {
            let near_factor = (DROP_MAGNET_NEAR_RADIUS - dist) / DROP_MAGNET_NEAR_RADIUS;
            drop.vx += nearest_dx * inv * DROP_MAGNET_NEAR_FORCE * near_factor;
            drop.vy += nearest_dy * inv * DROP_MAGNET_NEAR_FORCE * near_factor;
        }
    }

    // ── Tractor beam pull ──────────────────────────────────────────────
    // Mirrors `js/sim/drops.js` line 199-208. When the player's tractor
    // skill is engaged, every drop within `tractor_range` gets a fall-off
    // pull scaled by the orb's `z` parallax depth. Stacks on top of the
    // health magnet for an even snappier scoop.
    if dist > 1.0 && ctx.tractor_engaged {
        let tractor_attraction = ctx.tractor_attraction;
        let tractor_dist = ctx.tractor_range;
        if tractor_dist > 0.0 && dist < tractor_dist {
            let tractor_force = tractor_attraction * (1.0 - dist / tractor_dist);
            let z = drop.z;
            drop.vx += (nearest_dx / dist) * tractor_force * z;
            drop.vy += (nearest_dy / dist) * tractor_force * z;
        }
    }
}

/// Loop helper. Calls `update_drop` over a slice of drops.
///
/// Provided for parity with `updateDrops` in `js/sim/drops.js` and with
/// `update_all` in `ship.rs` — the wrapper passes its active-orb
/// collection in one shot and the pure layer iterates internally.
pub fn update_drops(drops: &mut [Drop], ctx: &DropContext, events: &mut Vec<DropEvent>) {
    for drop in drops.iter_mut() {
        if drop.active {
            update_drop(drop, ctx, events);
        }
    }
}

// ── Legacy stub kept for `simulate_tick` integration ──────────────────
//
// `sim::simulate_tick` (mod.rs:39) still calls `drops::update` against
// the wire-shaped `protocol::DropState` collection. Until the wrapper
// projects the rich `Drop` pool down to wire `DropState` (and feeds the
// rich `Drop` to `update_drops` instead), this empty stub keeps the
// build green. Do not remove until the wrapper integration lands.
pub fn update(
    _drops: &mut Vec<DropState>,
    _ships: &[ShipState],
    _dt: f32,
    _events: &mut Vec<GameEvent>,
) {
}
