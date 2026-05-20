//! Phase 4 step 6 player-mine entity (2026-05-19). Player-owned
//! persistent seeker mines dropped by the MINE_LAYER power weapon.
//! A player mine spawns at the firing ship, slowly homes toward the
//! nearest alive enemy, and detonates on contact or when its HP
//! hits zero. It lives until one of four things happens:
//!
//! - It contacts an alive enemy within `PLAYER_MINE_TRIGGER_RADIUS`
//!   (Wave 2 will add the `player_mine × enemy` collision pair;
//!   detonation deals `blast_damage` to all enemies within
//!   `blast_radius` and flips the mine inactive).
//! - An enemy bullet damages it down to 0 HP (Wave 2 may add the
//!   `enemy_bullet × player_mine` pair if Phase 5+ wants shoot-able
//!   player mines; the `apply_damage_to_mine` contract is in place
//!   either way).
//! - The lifetime counter reaches zero (handled here in
//!   `update_mine` — mine flips inactive without detonating).
//! - HP <= 0 from any source (`dead()` reports true, retain pass culls).
//!
//! Key differences from `EnemyMineState` (sister type, separate
//! struct so each can evolve independently):
//!
//! - **Player-owned** via `owner_player_id`. Wave 2 collision uses
//!   this to suppress friendly-fire (player mines never damage the
//!   owning player or any ally — friendly-fire is OFF globally for
//!   MP MVP). The field is plumbed for kill-credit attribution and
//!   future friendly-fire toggles.
//! - **Seeking, not stationary** — has `vx`/`vy` and an `angle`
//!   heading that lerps toward the closest alive enemy each tick,
//!   clamped to `PLAYER_MINE_TURN_RATE`. Position drifts by
//!   `PLAYER_MINE_SEEK_SPEED` along the heading.
//! - **Triggers on enemy contact** — `trigger_radius` is the AoE
//!   for detonation (enemy enters → boom), distinct from `radius`
//!   which is the bullet-vs-mine hitbox for any enemy projectile
//!   that wants to shoot it.
//! - **Blast damages enemies** — solo MINE_LAYER's `mineDamage` (3)
//!   maps to `blast_damage`, applied to every enemy inside
//!   `blast_radius` on detonation. The detonation itself happens
//!   in Wave 2's collision pass; this module just holds the
//!   parameters.
//!
//! MVP simplifications (deferred to Phase 5+):
//! - **No bullets-from-mines.** Solo MINE_LAYER + RAPID_DEPLOY etc.
//!   can fire intercept bullets between deployments; MP MVP skips
//!   that — a mine is purely a seek-and-detonate entity.
//! - **No shield zone.** Solo's TRACTOR_SHIELD synergy gives mines
//!   a small protective bubble; MP MVP omits it.
//! - **No daisy-chain.** Solo's DAISY_CHAIN upgrade detonates
//!   nearby mines together; MP MVP detonates each mine
//!   independently. Wave 2 collision can revisit if needed.
//!
//! Deterministic — server and WASM client construct identical mines
//! from the same `(id, owner_player_id, x, y)` parameters. The
//! `sub_seed` parameter on `spawn_from_seed` is reserved for Phase 5+
//! (planned: random initial heading wobble) and is currently unused.
//!
//! Determinism contract for `update_mine`:
//! - NO RNG inside the steering loop. Target pick + heading update
//!   are pure functions of (mine state, enemies slice, field size).
//! - Wave 2's dispatcher MUST pass the SAME enemies slice on server
//!   and WASM client so trajectories stay bit-identical. Order
//!   matters: `closest_alive_enemy` tie-breaks on lower index when
//!   two enemies are equidistant.
//! - All trig goes through `trig::cos64` / `sin64` / `atan2_64`
//!   (polynomial, bit-exact cross-runtime).

use crate::trig::{atan2_64, cos64, sin64, PI, TAU};

/// Default HP when a mine spawns. 5.0 makes the mine fairly durable
/// against stray enemy fire — a player commits a power-weapon
/// charge to deploy it, so it shouldn't pop to a single bullet.
pub const PLAYER_MINE_DEFAULT_HP: f64 = 5.0;

/// Hitbox radius for any "shoot the mine" collision pair. Smaller
/// than `trigger_radius` so an enemy walking into the mine triggers
/// detonation well before any of its bullets clip the body.
pub const PLAYER_MINE_DEFAULT_RADIUS: f64 = 10.0;

/// Enemy-contact threshold (px). Matches solo's MINE_LAYER
/// `mineRadius: 60`. An enemy whose centre comes within this
/// distance of the mine's centre triggers detonation.
pub const PLAYER_MINE_TRIGGER_RADIUS: f64 = 60.0;

/// AoE radius for detonation damage (px). Matches solo's MINE_LAYER
/// `blastRadius: 80`. On detonation every enemy within this radius
/// of the mine takes `blast_damage`.
pub const PLAYER_MINE_BLAST_RADIUS: f64 = 80.0;

/// Per-enemy damage on detonation. Matches solo's MINE_LAYER
/// `mineDamage: 3` (post-balance scale-down for power-weapon parity).
pub const PLAYER_MINE_BLAST_DAMAGE: f64 = 3.0;

/// Per-tick seek speed (px/tick at 60 Hz). 0.6 px/tick ≈ 36 px/sec —
/// intentionally slow so mines feel like creeping seekers, not
/// missiles. Solo's mines also accelerate slowly toward targets.
pub const PLAYER_MINE_SEEK_SPEED: f64 = 0.6;

/// Lifetime in ticks at 60 Hz → 10 seconds before the mine self-
/// despawns (without detonation). Long enough to be a threat across
/// a sweep of enemies, short enough that abandoned mines don't pile
/// up. Solo's `lifeTimer` is 12s post-arm; we trim 2s here because
/// the MVP has no arm delay.
pub const PLAYER_MINE_LIFETIME_TICKS: u32 = 600;

/// Max radians the mine can rotate its heading toward the target
/// per tick. 0.06 rad/tick ≈ 3.4°/tick ≈ 206°/sec at 60 Hz —
/// sluggish enough that a sidestepping enemy can dodge a poorly-
/// placed mine, snappy enough that the mine is meaningfully
/// homing rather than line-drifting. Tunable.
pub const PLAYER_MINE_TURN_RATE: f64 = 0.06;

/// Deterministic player-mine state. Seeker + bullet-targetable +
/// player-owned.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlayerMineState {
    /// Server-assigned mine id; stable across spawn → death/expiry.
    pub id: u32,
    /// Player id of the ship that deployed this mine. Used to
    /// suppress friendly-fire (friendly-fire is OFF globally; this
    /// field is plumbed for future toggles + kill-credit attribution).
    pub owner_player_id: u32,
    /// World x in pixels. Updated per tick by `update_mine`.
    pub x: f64,
    /// World y in pixels. Updated per tick by `update_mine`.
    pub y: f64,
    /// Per-tick x velocity (px/tick). Recomputed each tick from
    /// the homed heading × `PLAYER_MINE_SEEK_SPEED`.
    pub vx: f64,
    /// Per-tick y velocity (px/tick).
    pub vy: f64,
    /// Current heading in radians. Lerps toward target each tick
    /// (clamped to `PLAYER_MINE_TURN_RATE`).
    pub angle: f64,
    /// Current hit points. Reduced by `apply_damage_to_mine` (Wave 2
    /// `enemy_bullet × player_mine` collision pair, if added). Mine
    /// is considered dead when this hits 0 (see `dead()`).
    pub hp: f64,
    /// HP at spawn — kept around so the client can render a health
    /// bar (mirroring solo's `mine.maxHealth` field).
    pub max_hp: f64,
    /// Collision radius for `enemy_bullet × player_mine` pair.
    pub radius: f64,
    /// Enemy-contact threshold for detonation. Wave 2's
    /// `player_mine × enemy` collision pair reads this.
    pub trigger_radius: f64,
    /// AoE radius for blast damage on detonation.
    pub blast_radius: f64,
    /// Per-enemy damage applied within `blast_radius` on detonation.
    pub blast_damage: f64,
    /// Lifetime ticks remaining. Decremented by `update_mine` each
    /// tick; mine flips inactive at 0 (without detonating —
    /// detonation is the collision pass's job).
    pub life_remaining: u32,
    /// Whether the mine is still alive in the sim. Wave 2 retain
    /// pass will cull mines for which `dead()` is true.
    pub active: bool,
}

impl PlayerMineState {
    /// True if this mine should be culled at the next retain pass.
    /// Three independent failure modes — any one is sufficient:
    /// - `!active` (collision flipped it off this tick, or lifetime expired)
    /// - `hp <= 0.0` (bullets killed it; flag-flip is the Wave 2 pass's
    ///   responsibility but `dead()` returns true the moment HP hits 0)
    /// - `life_remaining == 0` (lifetime expired in `update_mine`)
    pub fn dead(&self) -> bool {
        !self.active || self.hp <= 0.0 || self.life_remaining == 0
    }
}

/// Spawn one mine at `(x, y)` with explicit per-call parameters.
/// Both server and WASM client construct from identical inputs and
/// produce bit-identical state (no trig, no RNG — pure field copies).
///
/// The mine starts stationary (`vx = vy = 0`, `angle = 0`). The
/// first `update_mine` tick picks a target and re-aims; that's when
/// movement actually begins.
///
/// Caller (Wave 2 MINE_LAYER fire dispatcher) is responsible for:
/// - assigning the `id` from `room.next_player_mine_id`
/// - pushing the mine onto `RoomState.player_mines`
/// - emitting `EventPayload::PlayerMineSpawn` so the WASM client mirrors it
#[allow(clippy::too_many_arguments)]
pub fn spawn_full(
    id: u32,
    owner_player_id: u32,
    x: f64,
    y: f64,
    hp: f64,
    radius: f64,
    trigger_radius: f64,
    blast_radius: f64,
    blast_damage: f64,
    lifetime_ticks: u32,
) -> PlayerMineState {
    PlayerMineState {
        id,
        owner_player_id,
        x,
        y,
        vx: 0.0,
        vy: 0.0,
        angle: 0.0,
        hp,
        max_hp: hp,
        radius,
        trigger_radius,
        blast_radius,
        blast_damage,
        life_remaining: lifetime_ticks,
        active: true,
    }
}

/// Public minimal-shape spawn: just position + ownership, all other
/// fields take module defaults. This is the constructor Wave 2's
/// MINE_LAYER fire dispatcher will call directly (per-call
/// customization for upgrades like BLAST_RADIUS is Phase 5+).
pub fn spawn(id: u32, owner_player_id: u32, x: f64, y: f64) -> PlayerMineState {
    spawn_full(
        id,
        owner_player_id,
        x,
        y,
        PLAYER_MINE_DEFAULT_HP,
        PLAYER_MINE_DEFAULT_RADIUS,
        PLAYER_MINE_TRIGGER_RADIUS,
        PLAYER_MINE_BLAST_RADIUS,
        PLAYER_MINE_BLAST_DAMAGE,
        PLAYER_MINE_LIFETIME_TICKS,
    )
}

/// Convenience: alias of `spawn` for consistency with sister modules
/// (`enemy_mine::spawn_default`, `enemy_missile::spawn_default`).
pub fn spawn_default(id: u32, owner_player_id: u32, x: f64, y: f64) -> PlayerMineState {
    spawn(id, owner_player_id, x, y)
}

/// Deterministic seeded spawn. The `_sub_seed` argument is currently
/// unused — Phase 4 step 6 mines have no random properties (no
/// heading wobble, no rotation jitter) so this delegates to `spawn`.
///
/// The parameter is kept in the API so callers (Wave 2 integration
/// in `room.rs`) can wire `room.rng.sub_seed()` through to mine
/// spawns today, and Phase 5+ can land wobble / initial-rotation
/// without breaking the call site. Bit-exact reproducibility holds
/// either way: today because the seed is ignored, tomorrow because
/// it'll drive `RngCtx::from_sub_seed` which is itself deterministic.
pub fn spawn_from_seed(
    id: u32,
    owner_player_id: u32,
    x: f64,
    y: f64,
    _sub_seed: u64,
) -> PlayerMineState {
    spawn(id, owner_player_id, x, y)
}

/// Per-tick update: lifetime → home → drift.
///
/// 1. Decrements `life_remaining`; flips inactive when it hits 0.
/// 2. Picks the closest alive enemy (skipping `!active` enemies).
///    Tie-break on lower index when two enemies are equidistant
///    (deterministic given a consistently-ordered slice).
/// 3. Rotates `angle` toward the target, clamped to
///    `PLAYER_MINE_TURN_RATE`. Recomputes vx/vy from new angle ×
///    `PLAYER_MINE_SEEK_SPEED`.
/// 4. Advances position by vx/vy.
///
/// If there are no live enemies the mine coasts on its current
/// heading (or sits still on tick 1 since the spawn velocity is
/// zero). Field bounds are accepted as parameters for future use
/// (e.g., field-edge bounce or cull); MVP doesn't act on them — a
/// mine that drifts past the edge just keeps drifting until its
/// lifetime expires. Wave 2 can add a cull pass if needed.
///
/// NO RNG.
pub fn update_mine(
    m: &mut PlayerMineState,
    enemies: &[super::enemy::EnemyState],
    _field_w: f64,
    _field_h: f64,
) {
    if !m.active {
        return;
    }

    // Lifetime tick (decrement to zero → cull, no detonation —
    // detonation is the collision pass's job).
    if m.life_remaining == 0 {
        m.active = false;
        return;
    }
    m.life_remaining -= 1;
    if m.life_remaining == 0 {
        m.active = false;
        return;
    }

    // Home: pick closest alive enemy and rotate current heading
    // toward it, clamped to PLAYER_MINE_TURN_RATE. If no target,
    // coast on current vx/vy (which is zero on tick 1).
    if let Some(t) = closest_alive_enemy(enemies, m.x, m.y) {
        let desired = atan2_64(t.y - m.y, t.x - m.x);
        let new_heading = lerp_angle_clamped(m.angle, desired, PLAYER_MINE_TURN_RATE);
        m.angle = new_heading;
        m.vx = cos64(new_heading) * PLAYER_MINE_SEEK_SPEED;
        m.vy = sin64(new_heading) * PLAYER_MINE_SEEK_SPEED;
    }

    // Drift.
    m.x += m.vx;
    m.y += m.vy;
}

/// Internal: closest alive enemy by squared distance. Tie-break on
/// lower index (the first equally-close enemy wins). Returns `None`
/// when the slice is empty or every enemy is inactive.
///
/// Note: callers must order the enemy slice identically across
/// server + WASM client (typically: by `enemy_id` asc, which
/// `RoomState.enemies` preserves by construction since ids are
/// monotonic). The reference enemies-slice we operate on is
/// `RoomState.enemies` itself, which is read-only here.
fn closest_alive_enemy(
    enemies: &[super::enemy::EnemyState],
    x: f64,
    y: f64,
) -> Option<EnemyAimSample> {
    let mut best: Option<(f64, EnemyAimSample)> = None;
    for e in enemies {
        if !e.active {
            continue;
        }
        let dx = e.x - x;
        let dy = e.y - y;
        let d2 = dx * dx + dy * dy;
        // Strict `<` so the first-seen enemy wins ties — deterministic
        // when caller orders the slice consistently across runtimes.
        if best.is_none() || d2 < best.unwrap().0 {
            best = Some((d2, EnemyAimSample { x: e.x, y: e.y }));
        }
    }
    best.map(|(_, sample)| sample)
}

/// Internal: minimal projection of `EnemyState` we need for homing.
/// Pulling only `(x, y)` keeps the lookup loop tight and decouples
/// from the much-larger `EnemyState` shape.
#[derive(Debug, Clone, Copy)]
struct EnemyAimSample {
    x: f64,
    y: f64,
}

/// Internal: rotate `current` toward `desired` by at most `max_step`
/// radians, taking the shortest path around the circle (handles ±π
/// wrap). Mirrors `enemy_missile::lerp_angle_clamped`; duplicated
/// rather than shared to keep modules independent.
fn lerp_angle_clamped(current: f64, desired: f64, max_step: f64) -> f64 {
    let mut d = desired - current;
    // Wrap into (-π, π] so we always turn the short way.
    while d > PI {
        d -= TAU;
    }
    while d < -PI {
        d += TAU;
    }
    if d > max_step {
        current + max_step
    } else if d < -max_step {
        current - max_step
    } else {
        current + d
    }
}

/// Apply `dmg` to the mine's HP. Returns `true` if and only if this
/// call is the one that pushed HP from positive to zero-or-below —
/// the "I just killed it" signal Wave 2's optional
/// `enemy_bullet × player_mine` collision pass would use to emit
/// exactly one `PlayerMineDeath` event per mine.
///
/// Subsequent damage calls against an already-dead mine return
/// `false` (idempotent — handy when several bullets land in the
/// same tick: only the killing-blow caller gets `true`).
///
/// Negative `dmg` is treated as zero (no healing — would silently
/// break the "just died" contract for over-damaged mines).
///
/// NOTE: this is the bullet-vs-mine HP contract. Mines blowing up
/// from enemy contact are handled by Wave 2's
/// `player_mine × enemy` collision pair (which sets
/// `mine.active = false` directly after applying `blast_damage` to
/// every enemy in `blast_radius`).
pub fn apply_damage_to_mine(m: &mut PlayerMineState, dmg: f64) -> bool {
    // Already-dead guard: don't transition twice.
    if m.hp <= 0.0 {
        return false;
    }
    let applied = if dmg < 0.0 { 0.0 } else { dmg };
    m.hp -= applied;
    m.hp <= 0.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enemy::EnemyState;

    /// Build a minimal EnemyState at (x, y) with `active`. All other
    /// fields zeroed via `EnemyState::default()` — the mine-update
    /// path only reads `active`, `x`, `y` so the rest is irrelevant.
    fn make_enemy(id: u32, x: f64, y: f64, active: bool) -> EnemyState {
        EnemyState {
            id,
            x,
            y,
            active,
            hp: 1.0,
            max_hp: 1.0,
            radius: 10.0,
            ..EnemyState::default()
        }
    }

    /// `spawn` populates every field correctly: id, owner, position,
    /// HP (both current and max), trigger/blast radii, blast damage,
    /// lifetime, active flag. Velocity + angle start at zero.
    #[test]
    fn spawn_at_position_with_full_hp() {
        let m = spawn(7, 3, 100.0, 200.0);
        assert_eq!(m.id, 7);
        assert_eq!(m.owner_player_id, 3);
        assert_eq!(m.x, 100.0);
        assert_eq!(m.y, 200.0);
        assert_eq!(m.vx, 0.0);
        assert_eq!(m.vy, 0.0);
        assert_eq!(m.angle, 0.0);
        assert_eq!(m.hp, PLAYER_MINE_DEFAULT_HP);
        assert_eq!(m.max_hp, PLAYER_MINE_DEFAULT_HP);
        assert_eq!(m.radius, PLAYER_MINE_DEFAULT_RADIUS);
        assert_eq!(m.trigger_radius, PLAYER_MINE_TRIGGER_RADIUS);
        assert_eq!(m.blast_radius, PLAYER_MINE_BLAST_RADIUS);
        assert_eq!(m.blast_damage, PLAYER_MINE_BLAST_DAMAGE);
        assert_eq!(m.life_remaining, PLAYER_MINE_LIFETIME_TICKS);
        assert!(m.active);
    }

    /// `spawn_default` wires the module constants — guards against
    /// accidental const drift between header and convenience constructor.
    #[test]
    fn spawn_default_uses_consts() {
        let m = spawn_default(11, 5, 400.0, 500.0);
        assert_eq!(m.id, 11);
        assert_eq!(m.owner_player_id, 5);
        assert_eq!(m.x, 400.0);
        assert_eq!(m.y, 500.0);
        assert_eq!(m.hp, PLAYER_MINE_DEFAULT_HP);
        assert_eq!(m.max_hp, PLAYER_MINE_DEFAULT_HP);
        assert_eq!(m.radius, PLAYER_MINE_DEFAULT_RADIUS);
        assert_eq!(m.trigger_radius, PLAYER_MINE_TRIGGER_RADIUS);
        assert_eq!(m.blast_radius, PLAYER_MINE_BLAST_RADIUS);
        assert_eq!(m.blast_damage, PLAYER_MINE_BLAST_DAMAGE);
        assert_eq!(m.life_remaining, PLAYER_MINE_LIFETIME_TICKS);
        assert!(m.active);
    }

    /// `spawn_from_seed` must produce bit-identical state for identical
    /// inputs, and (today) be invariant under the sub_seed. The API
    /// contract — "two callers with the same params get the same mine" —
    /// has to hold so Wave 2 can rely on cross-runtime determinism.
    #[test]
    fn spawn_from_seed_is_deterministic() {
        let a = spawn_from_seed(42, 1, 123.5, 456.25, 0xDEAD_BEEF_CAFE_F00D);
        let b = spawn_from_seed(42, 1, 123.5, 456.25, 0xDEAD_BEEF_CAFE_F00D);
        assert_eq!(a, b, "identical params must produce identical mines");
        // Different sub_seed currently has no observable effect.
        // Phase 5+ will change this; the test will need an update.
        let c = spawn_from_seed(42, 1, 123.5, 456.25, 0x1234_5678_9ABC_DEF0);
        assert_eq!(a, c, "sub_seed is reserved (Phase 5+); ignored today");
    }

    /// With no enemies, the mine just decrements lifetime and stays
    /// put (vx/vy stay zero since spawn). No NaN, no drift.
    #[test]
    fn update_no_enemies_idles_predictably() {
        let mut m = spawn_default(1, 0, 500.0, 500.0);
        let enemies: [EnemyState; 0] = [];
        for _ in 0..30 {
            update_mine(&mut m, &enemies, 1920.0, 1080.0);
        }
        assert_eq!(m.x, 500.0, "x must not drift without a target");
        assert_eq!(m.y, 500.0, "y must not drift without a target");
        assert_eq!(m.vx, 0.0);
        assert_eq!(m.vy, 0.0);
        assert!(!m.x.is_nan());
        assert!(!m.y.is_nan());
        assert_eq!(m.life_remaining, PLAYER_MINE_LIFETIME_TICKS - 30);
        assert!(m.active);
    }

    /// Over many ticks with a stationary alive enemy, the mine's
    /// distance to the enemy decreases (it homes + moves toward it).
    #[test]
    fn update_seeks_nearest_enemy() {
        // Mine at (500, 500). Enemy directly south.
        let mut m = spawn_default(1, 0, 500.0, 500.0);
        let enemies = [make_enemy(1, 500.0, 900.0, true)];
        let d_before = ((m.x - 500.0).powi(2) + (m.y - 900.0).powi(2)).sqrt();
        for _ in 0..120 {
            update_mine(&mut m, &enemies, 5000.0, 5000.0);
        }
        let d_after = ((m.x - 500.0).powi(2) + (m.y - 900.0).powi(2)).sqrt();
        assert!(
            d_after < d_before,
            "distance should decrease: before={}, after={}",
            d_before, d_after,
        );
        // And the mine should actually have moved.
        assert!(m.y > 500.0, "mine should have moved south, y = {}", m.y);
    }

    /// With two alive enemies at different distances, the mine
    /// heads toward the closer one.
    #[test]
    fn update_picks_closest_enemy_when_two() {
        let mut m = spawn_default(1, 0, 500.0, 500.0);
        // Near enemy south (d=100). Far enemy north (d=2000).
        let enemies = [
            make_enemy(1, 500.0, 600.0, true),
            make_enemy(2, 500.0, -1500.0, true),
        ];
        for _ in 0..30 {
            update_mine(&mut m, &enemies, 5000.0, 5000.0);
        }
        // Mine should have moved south (toward the close enemy).
        assert!(m.y > 500.0, "should head south toward closer enemy, y = {}", m.y);
        assert!(m.vy > 0.0, "vy should be positive (heading south), vy = {}", m.vy);
    }

    /// An inactive enemy is ignored even if it would be closer.
    /// The mine homes on the alive enemy instead.
    #[test]
    fn update_skips_inactive_enemy() {
        let mut m = spawn_default(1, 0, 500.0, 500.0);
        // Inactive close-south enemy; alive far-north enemy.
        let enemies = [
            make_enemy(1, 500.0, 510.0, false),
            make_enemy(2, 500.0, 0.0, true),
        ];
        for _ in 0..30 {
            update_mine(&mut m, &enemies, 5000.0, 5000.0);
        }
        // Mine should head north (toward the alive enemy), NOT south.
        assert!(m.y < 500.0, "should head north toward alive enemy, y = {}", m.y);
        assert!(m.vy < 0.0, "vy should be negative (heading north), vy = {}", m.vy);
    }

    /// `life_remaining` decrements by exactly 1 per `update_mine` call.
    #[test]
    fn update_lifetime_decrements_to_zero() {
        let mut m = spawn_default(1, 0, 500.0, 500.0);
        let enemies: [EnemyState; 0] = [];
        let start = m.life_remaining;
        update_mine(&mut m, &enemies, 1920.0, 1080.0);
        assert_eq!(m.life_remaining, start - 1);
        update_mine(&mut m, &enemies, 1920.0, 1080.0);
        assert_eq!(m.life_remaining, start - 2);
    }

    /// After exactly `life_remaining` updates the mine flips inactive.
    /// Uses a small starting lifetime to keep the loop tight.
    #[test]
    fn lifetime_expires_marks_inactive() {
        let mut m = spawn_full(
            1, 0, 500.0, 500.0,
            PLAYER_MINE_DEFAULT_HP,
            PLAYER_MINE_DEFAULT_RADIUS,
            PLAYER_MINE_TRIGGER_RADIUS,
            PLAYER_MINE_BLAST_RADIUS,
            PLAYER_MINE_BLAST_DAMAGE,
            3,
        );
        let enemies: [EnemyState; 0] = [];
        update_mine(&mut m, &enemies, 1920.0, 1080.0);
        assert!(m.active, "active after 1 update (life=2)");
        update_mine(&mut m, &enemies, 1920.0, 1080.0);
        assert!(m.active, "active after 2 updates (life=1)");
        update_mine(&mut m, &enemies, 1920.0, 1080.0);
        assert!(!m.active, "inactive after 3 updates (life=0)");
        assert_eq!(m.life_remaining, 0);
    }

    /// `apply_damage_to_mine` subtracts the damage amount from HP.
    /// Pure subtraction on f64 — exact equality is fine.
    #[test]
    fn apply_damage_reduces_hp() {
        let mut m = spawn_default(1, 0, 0.0, 0.0);
        let died = apply_damage_to_mine(&mut m, 1.5);
        assert_eq!(m.hp, PLAYER_MINE_DEFAULT_HP - 1.5);
        assert!(!died, "still alive after 1.5 damage to 5.0 HP mine");
    }

    /// Returns `true` exactly when the call pushes HP from positive to
    /// zero-or-below — the "killing blow" signal Wave 2's optional
    /// `enemy_bullet × player_mine` pair would use to fire exactly
    /// one `PlayerMineDeath` event per mine. Idempotent against
    /// already-dead.
    #[test]
    fn apply_damage_returns_true_only_on_killing_blow() {
        // HP 5.0 → first 4.0 damage: alive, returns false.
        let mut m = spawn_default(1, 0, 0.0, 0.0);
        assert!(!apply_damage_to_mine(&mut m, 4.0));
        assert_eq!(m.hp, 1.0);
        // Killing blow.
        assert!(apply_damage_to_mine(&mut m, 1.0));
        assert_eq!(m.hp, 0.0);
        // Subsequent damage calls return false.
        assert!(!apply_damage_to_mine(&mut m, 1.0));
        assert!(!apply_damage_to_mine(&mut m, 100.0));

        // Overkill: 100 dmg to a fresh 5-HP mine → returns true once,
        // HP goes negative (and stays).
        let mut over = spawn_default(2, 0, 0.0, 0.0);
        assert!(apply_damage_to_mine(&mut over, 100.0));
        assert!(over.hp <= 0.0);
        // Second hit on overkilled mine: false.
        assert!(!apply_damage_to_mine(&mut over, 1.0));
    }

    /// `dead()` reflects all three independent failure modes.
    #[test]
    fn dead_helper_reflects_active_or_zero_hp_or_zero_life() {
        let alive = spawn_default(1, 0, 0.0, 0.0);
        assert!(!alive.dead(), "healthy mine is not dead");

        let inactive = PlayerMineState { active: false, ..alive };
        assert!(inactive.dead(), "inactive mine is dead");

        let zero_hp = PlayerMineState { hp: 0.0, ..alive };
        assert!(zero_hp.dead(), "hp=0 mine is dead");

        let neg_hp = PlayerMineState { hp: -0.5, ..alive };
        assert!(neg_hp.dead(), "negative-hp (overkilled) mine is dead");

        let expired = PlayerMineState { life_remaining: 0, ..alive };
        assert!(expired.dead(), "life=0 mine is dead");

        // All conditions at once: still dead.
        let all = PlayerMineState {
            active: false, hp: 0.0, life_remaining: 0, ..alive
        };
        assert!(all.dead());
    }

    /// Inactive mines are a no-op in `update_mine` — no field
    /// changes. (The Wave 2 retain pass culls them, so `update_mine`
    /// doesn't have to do anything; but it must also not corrupt
    /// their state.)
    #[test]
    fn inactive_mine_no_op_in_update() {
        let mut m = PlayerMineState {
            id: 1,
            owner_player_id: 0,
            x: 100.0,
            y: 100.0,
            vx: 5.0,
            vy: 5.0,
            angle: 1.0,
            hp: 4.0,
            max_hp: 5.0,
            radius: PLAYER_MINE_DEFAULT_RADIUS,
            trigger_radius: PLAYER_MINE_TRIGGER_RADIUS,
            blast_radius: PLAYER_MINE_BLAST_RADIUS,
            blast_damage: PLAYER_MINE_BLAST_DAMAGE,
            life_remaining: 50,
            active: false,
        };
        let enemies = [make_enemy(1, 200.0, 200.0, true)];
        update_mine(&mut m, &enemies, 1920.0, 1080.0);
        // All fields untouched.
        assert_eq!(m.x, 100.0);
        assert_eq!(m.y, 100.0);
        assert_eq!(m.vx, 5.0);
        assert_eq!(m.vy, 5.0);
        assert_eq!(m.angle, 1.0);
        assert_eq!(m.hp, 4.0);
        assert_eq!(m.life_remaining, 50, "lifetime untouched on inactive");
        assert!(!m.active);
    }

    /// One tick can't rotate the heading past `PLAYER_MINE_TURN_RATE`.
    /// Place an enemy 180° behind the mine's spawn-angle (0) and
    /// verify the heading swings by at most the clamp.
    #[test]
    fn seek_turn_rate_is_clamped() {
        let mut m = spawn_default(1, 0, 500.0, 500.0);
        // Target directly south (desired heading = π/2, current = 0).
        let enemies = [make_enemy(1, 500.0, 1000.0, true)];
        let angle_before = m.angle;
        update_mine(&mut m, &enemies, 5000.0, 5000.0);
        let delta = (m.angle - angle_before).abs();
        // Algebraic clamp is exact in `lerp_angle_clamped`. Tiny
        // tolerance to account for f64 noise (no trig in the angle
        // computation itself — pure subtraction + comparison).
        assert!(
            delta <= PLAYER_MINE_TURN_RATE + 1e-12,
            "heading delta {} should be ≤ PLAYER_MINE_TURN_RATE ({})",
            delta, PLAYER_MINE_TURN_RATE,
        );
        // And it actually rotated by close to the max.
        assert!(
            delta >= PLAYER_MINE_TURN_RATE - 1e-12,
            "heading delta {} should be near PLAYER_MINE_TURN_RATE ({})",
            delta, PLAYER_MINE_TURN_RATE,
        );
    }
}
