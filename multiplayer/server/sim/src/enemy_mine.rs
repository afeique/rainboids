//! Phase 4 step 5 enemy-mine entity (2026-05-18). Stationary, damageable
//! hostile entities dropped by the TANGERINE enemy. A mine sits at the
//! drop coordinates with zero velocity, ticks down a lifetime counter,
//! and lives until one of three things happens:
//!
//! - A player bullet damages it down to 0 HP (Wave 2 will add the
//!   `bullet × mine` collision pair, calling `apply_damage_to_mine`).
//! - A player ship contacts it (Wave 2 will add the `ship × mine` pair,
//!   dealing `contact_damage` to the ship and flipping `active = false`).
//! - The lifetime counter reaches zero (handled here in `update_mine`).
//!
//! Key differences from `EnemyBulletState` (separate type on purpose so
//! each can evolve independently):
//!
//! - **Stationary** — no `vx`/`vy`, no per-tick drift, no off-field cull
//!   (a mine that was placed inside the field stays inside the field).
//! - **Bullet-targetable** — has its own `hp`/`max_hp` like an asteroid;
//!   player bullets can shoot mines out of the air before they detonate.
//! - **Contact damage, not point damage** — the field is `contact_damage`
//!   (semantic: "damage dealt to a ship that touches me"), not the
//!   bullet-style `damage`. The mine doesn't fire; it just sits there
//!   being dangerous.
//! - **Owned by an enemy** via `owner_enemy_id` — kill-credit attribution
//!   when a player dies on the mine flows back to the TANGERINE that
//!   dropped it (parallel to `EnemyBulletState::owner_enemy_id`).
//!
//! Deterministic — server and WASM client construct identical mines from
//! the same `(id, owner_enemy_id, x, y, ...)` parameters. The
//! `sub_seed` parameter on `spawn_from_seed` is reserved for Phase 5+
//! (planned: random initial rotation / pulse-phase / wobble) and is
//! currently unused; the API contract is in place so callers don't have
//! to change shape when the wobble lands.

/// Default HP when a mine spawns. 2.0 means a single PULSE_CANNON shot
/// (1 damage) doesn't quite kill it — takes two hits, which is the
/// solo-game feel for the Tangerine mine (durable enough to need
/// committed targeting, fragile enough that focused fire clears it).
pub const MINE_DEFAULT_HP: f64 = 2.0;

/// Collision radius. Larger than `ENEMY_BULLET_RADIUS` (9.0) so mines
/// are easier to hit with stray fire — they're meant to be shoot-able,
/// not microscopic.
pub const MINE_DEFAULT_RADIUS: f64 = 14.0;

/// Damage dealt to a ship on contact. Heavy — 6 hp is a 60% chunk out
/// of a baseline 10 hp ship, matching solo's "mines are scary if you
/// ignore them" tuning.
pub const MINE_DEFAULT_CONTACT_DAMAGE: f64 = 6.0;

/// Lifetime in ticks at 60 Hz → 10 seconds before the mine self-
/// despawns. Long enough to threaten the player meaningfully, short
/// enough that abandoned mines don't pile up in the field forever.
pub const MINE_DEFAULT_LIFETIME_TICKS: u32 = 600;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EnemyMineState {
    /// Server-assigned mine id; stable across spawn → death/expiry.
    pub id: u32,
    /// Enemy id of the TANGERINE that dropped this mine. Used for
    /// kill-credit when a player dies on the mine (parallel to
    /// `EnemyBulletState::owner_enemy_id`).
    pub owner_enemy_id: u32,
    /// World x in pixels. Set at spawn, never modified.
    pub x: f64,
    /// World y in pixels. Set at spawn, never modified.
    pub y: f64,
    /// Current hit points. Reduced by `apply_damage_to_mine`. Mine is
    /// considered dead when this hits 0 (see `dead()`).
    pub hp: f64,
    /// HP at spawn — kept around so the client can render a health bar
    /// (mirroring solo's `mine.maxHealth` field).
    pub max_hp: f64,
    /// Collision radius.
    pub radius: f64,
    /// Damage dealt to a player ship on contact. Wave 2's `ship × mine`
    /// collision pair will read this, apply it to the ship, then flip
    /// the mine to inactive.
    pub contact_damage: f64,
    /// Lifetime ticks remaining. Decremented by `update_mine` each tick;
    /// mine flips to inactive at 0.
    pub life_remaining: u32,
    /// Whether the mine is still alive in the sim. Wave 2 retain pass
    /// will cull mines for which `dead()` is true.
    pub active: bool,
}

impl EnemyMineState {
    /// True if this mine should be culled at the next retain pass.
    /// Three independent failure modes — any one is sufficient:
    /// - `!active` (collision flipped it off this tick)
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
/// Caller (Wave 2 integration in `room.rs`) is responsible for:
/// - assigning the `id` from `room.next_enemy_mine_id`
/// - pushing the mine onto `RoomState.enemy_mines`
/// - emitting `EventPayload::EnemyMineSpawn` so the WASM client mirrors it
pub fn spawn(
    id: u32,
    owner_enemy_id: u32,
    x: f64,
    y: f64,
    hp: f64,
    radius: f64,
    contact_damage: f64,
    lifetime_ticks: u32,
) -> EnemyMineState {
    EnemyMineState {
        id,
        owner_enemy_id,
        x,
        y,
        hp,
        max_hp: hp,
        radius,
        contact_damage,
        life_remaining: lifetime_ticks,
        active: true,
    }
}

/// Convenience: spawn a mine with the module's default HP, radius,
/// contact damage, and lifetime. Use when the caller doesn't need
/// per-pattern customization (which is "always", in Phase 4 step 5 —
/// per-Tangerine-level customization is Phase 5+).
pub fn spawn_default(
    id: u32,
    owner_enemy_id: u32,
    x: f64,
    y: f64,
) -> EnemyMineState {
    spawn(
        id,
        owner_enemy_id,
        x,
        y,
        MINE_DEFAULT_HP,
        MINE_DEFAULT_RADIUS,
        MINE_DEFAULT_CONTACT_DAMAGE,
        MINE_DEFAULT_LIFETIME_TICKS,
    )
}

/// Deterministic seeded spawn. The `_sub_seed` argument is currently
/// unused — Phase 4 step 5 mines have no random properties (no wobble,
/// no initial rotation, no jitter) so this delegates to `spawn_default`.
///
/// The parameter is kept in the API so callers (Wave 2 integration in
/// `room.rs`) can wire `room.rng.sub_seed()` through to mine spawns
/// today and Phase 5+ can land wobble / rotation / pulse-phase without
/// breaking the call site. Bit-exact reproducibility holds either way:
/// today because the seed is ignored, tomorrow because it'll drive
/// `RngCtx::from_sub_seed` which is itself deterministic.
pub fn spawn_from_seed(
    id: u32,
    owner_enemy_id: u32,
    x: f64,
    y: f64,
    _sub_seed: u64,
) -> EnemyMineState {
    spawn_default(id, owner_enemy_id, x, y)
}

/// Per-tick update: lifetime decrement only. Mines don't move, so
/// there's no drift step and no off-field cull (a mine placed inside
/// the field stays inside the field — `update_mine` couldn't tell you
/// the field size if you asked it).
///
/// HP/death handling is the Wave 2 collision pass's job — `update_mine`
/// only watches the lifetime clock. When `life_remaining` hits 0 the
/// mine is flipped inactive; `dead()` will then report true and the
/// retain pass culls it.
pub fn update_mine(m: &mut EnemyMineState) {
    if !m.active {
        return;
    }
    if m.life_remaining == 0 {
        m.active = false;
        return;
    }
    m.life_remaining -= 1;
    if m.life_remaining == 0 {
        m.active = false;
    }
}

/// Apply `dmg` to the mine's HP. Returns `true` if and only if this
/// call is the one that pushed HP from positive to zero-or-below — the
/// "I just killed it" signal the Wave 2 `bullet × mine` collision pass
/// needs in order to emit exactly one `EnemyMineDeath` event per mine.
///
/// Subsequent damage calls against an already-dead mine return `false`
/// (idempotent — handy when several bullets land in the same tick: only
/// the killing-blow caller gets `true`).
///
/// Negative `dmg` is treated as zero (no healing — would silently break
/// the "just died" contract for over-damaged mines).
pub fn apply_damage_to_mine(m: &mut EnemyMineState, dmg: f64) -> bool {
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

    /// `spawn` populates every field correctly: id, owner, position,
    /// HP (both current and max), lifetime, active flag.
    #[test]
    fn spawn_at_origin_with_full_hp() {
        let m = spawn(
            7, 3, 100.0, 200.0,
            MINE_DEFAULT_HP, MINE_DEFAULT_RADIUS,
            MINE_DEFAULT_CONTACT_DAMAGE, MINE_DEFAULT_LIFETIME_TICKS,
        );
        assert_eq!(m.id, 7);
        assert_eq!(m.owner_enemy_id, 3);
        assert_eq!(m.x, 100.0);
        assert_eq!(m.y, 200.0);
        assert_eq!(m.hp, MINE_DEFAULT_HP);
        assert_eq!(m.max_hp, MINE_DEFAULT_HP);
        assert_eq!(m.radius, MINE_DEFAULT_RADIUS);
        assert_eq!(m.contact_damage, MINE_DEFAULT_CONTACT_DAMAGE);
        assert_eq!(m.life_remaining, MINE_DEFAULT_LIFETIME_TICKS);
        assert!(m.active);
    }

    /// `spawn_default` wires the module constants — guards against
    /// accidental const drift between header and convenience constructor.
    #[test]
    fn spawn_default_uses_consts() {
        let m = spawn_default(11, 5, 400.0, 500.0);
        assert_eq!(m.id, 11);
        assert_eq!(m.owner_enemy_id, 5);
        assert_eq!(m.x, 400.0);
        assert_eq!(m.y, 500.0);
        assert_eq!(m.hp, MINE_DEFAULT_HP);
        assert_eq!(m.max_hp, MINE_DEFAULT_HP);
        assert_eq!(m.radius, MINE_DEFAULT_RADIUS);
        assert_eq!(m.contact_damage, MINE_DEFAULT_CONTACT_DAMAGE);
        assert_eq!(m.life_remaining, MINE_DEFAULT_LIFETIME_TICKS);
        assert!(m.active);
    }

    /// `spawn_from_seed` must produce bit-identical state for identical
    /// inputs. The seed is currently unused but the API contract — "two
    /// callers with the same params get the same mine" — has to hold so
    /// Wave 2 can rely on cross-runtime determinism today.
    #[test]
    fn spawn_from_seed_is_deterministic() {
        let a = spawn_from_seed(42, 1, 123.5, 456.25, 0xDEAD_BEEF_CAFE_F00D);
        let b = spawn_from_seed(42, 1, 123.5, 456.25, 0xDEAD_BEEF_CAFE_F00D);
        assert_eq!(a, b, "identical params must produce identical mines");
        // Also: different sub-seed currently has no observable effect.
        // Phase 5+ will change this; the test will need an update then.
        let c = spawn_from_seed(42, 1, 123.5, 456.25, 0x1234_5678_9ABC_DEF0);
        assert_eq!(a, c, "sub_seed is reserved (Phase 5+); ignored today");
    }

    /// Mines are stationary — position must not drift across many
    /// updates. Bit-exact comparison: if the implementation accidentally
    /// adds `0.0` to position via some "vx" field, this still passes;
    /// but if it ever introduces a real velocity term, this catches it.
    #[test]
    fn update_no_drift() {
        let mut m = spawn_default(1, 0, 250.0, 750.0);
        for _ in 0..100 {
            update_mine(&mut m);
        }
        assert_eq!(m.x, 250.0, "x must not drift");
        assert_eq!(m.y, 750.0, "y must not drift");
    }

    /// `life_remaining` decrements by exactly 1 per `update_mine` call.
    #[test]
    fn update_lifetime_decrements() {
        let mut m = spawn_default(1, 0, 0.0, 0.0);
        let start = m.life_remaining;
        update_mine(&mut m);
        assert_eq!(m.life_remaining, start - 1);
        update_mine(&mut m);
        assert_eq!(m.life_remaining, start - 2);
    }

    /// After exactly `life_remaining` updates the mine flips inactive.
    /// Uses a small starting lifetime (3) to keep the loop tight.
    #[test]
    fn lifetime_expires_marks_inactive() {
        let mut m = spawn(1, 0, 500.0, 500.0,
            MINE_DEFAULT_HP, MINE_DEFAULT_RADIUS,
            MINE_DEFAULT_CONTACT_DAMAGE, 3);
        update_mine(&mut m);
        assert!(m.active, "active after 1 update (life=2)");
        update_mine(&mut m);
        assert!(m.active, "active after 2 updates (life=1)");
        update_mine(&mut m);
        assert!(!m.active, "inactive after 3 updates (life=0)");
        assert_eq!(m.life_remaining, 0);
    }

    /// `apply_damage_to_mine` subtracts the damage amount from HP.
    /// Pure subtraction on f64 — exact equality is fine.
    #[test]
    fn apply_damage_reduces_hp() {
        let mut m = spawn(1, 0, 0.0, 0.0, 5.0,
            MINE_DEFAULT_RADIUS, MINE_DEFAULT_CONTACT_DAMAGE,
            MINE_DEFAULT_LIFETIME_TICKS);
        let died = apply_damage_to_mine(&mut m, 1.5);
        assert_eq!(m.hp, 3.5);
        assert!(!died, "still alive after 1.5 damage to 5.0 HP mine");
    }

    /// Returns `true` exactly when the call pushes HP from positive to
    /// zero-or-below — the "killing blow" signal the Wave 2 collision
    /// pass uses to fire `EnemyMineDeath` events.
    #[test]
    fn apply_damage_returns_true_on_death() {
        let mut m = spawn(1, 0, 0.0, 0.0, 2.0,
            MINE_DEFAULT_RADIUS, MINE_DEFAULT_CONTACT_DAMAGE,
            MINE_DEFAULT_LIFETIME_TICKS);
        // First hit: 1.0 dmg → HP 1.0, still alive, returns false.
        assert!(!apply_damage_to_mine(&mut m, 1.0));
        assert_eq!(m.hp, 1.0);
        // Second hit: 1.0 dmg → HP 0.0, just died, returns true.
        assert!(apply_damage_to_mine(&mut m, 1.0));
        assert_eq!(m.hp, 0.0);

        // Overkill: HP 3.0 mine, 100.0 damage → still returns true once,
        // HP goes negative (and stays).
        let mut over = spawn(2, 0, 0.0, 0.0, 3.0,
            MINE_DEFAULT_RADIUS, MINE_DEFAULT_CONTACT_DAMAGE,
            MINE_DEFAULT_LIFETIME_TICKS);
        assert!(apply_damage_to_mine(&mut over, 100.0));
        assert!(over.hp <= 0.0);
    }

    /// Idempotent: damage calls against a mine that's already at zero
    /// HP return `false`. Wave 2 needs this so multiple bullets landing
    /// on a dying mine in the same tick don't emit duplicate death
    /// events.
    #[test]
    fn apply_damage_returns_false_when_already_dead() {
        let mut m = spawn(1, 0, 0.0, 0.0, 1.0,
            MINE_DEFAULT_RADIUS, MINE_DEFAULT_CONTACT_DAMAGE,
            MINE_DEFAULT_LIFETIME_TICKS);
        // Killing blow.
        assert!(apply_damage_to_mine(&mut m, 1.0));
        // Second-damage caller in the same tick: still false.
        assert!(!apply_damage_to_mine(&mut m, 1.0));
        // And again, just to be sure.
        assert!(!apply_damage_to_mine(&mut m, 100.0));
    }

    /// `dead()` reflects all three independent failure modes.
    #[test]
    fn dead_helper_reflects_state() {
        let alive = spawn_default(1, 0, 0.0, 0.0);
        assert!(!alive.dead(), "healthy mine is not dead");

        let inactive = EnemyMineState { active: false, ..alive };
        assert!(inactive.dead(), "inactive mine is dead");

        let zero_hp = EnemyMineState { hp: 0.0, ..alive };
        assert!(zero_hp.dead(), "hp=0 mine is dead");

        let neg_hp = EnemyMineState { hp: -0.5, ..alive };
        assert!(neg_hp.dead(), "negative-hp (overkilled) mine is dead");

        let expired = EnemyMineState { life_remaining: 0, ..alive };
        assert!(expired.dead(), "life=0 mine is dead");

        // All conditions at once: still dead.
        let all = EnemyMineState {
            active: false, hp: 0.0, life_remaining: 0, ..alive
        };
        assert!(all.dead());
    }

    /// Inactive mines are a no-op in `update_mine` — no field changes.
    /// (The Wave 2 retain pass culls them, so `update_mine` doesn't
    /// have to do anything; but it must also not corrupt their state.)
    #[test]
    fn inactive_mine_no_op_in_update() {
        let mut m = EnemyMineState {
            id: 1, owner_enemy_id: 0,
            x: 100.0, y: 100.0,
            hp: 2.0, max_hp: 2.0,
            radius: MINE_DEFAULT_RADIUS,
            contact_damage: MINE_DEFAULT_CONTACT_DAMAGE,
            life_remaining: 50,
            active: false,
        };
        update_mine(&mut m);
        assert_eq!(m.x, 100.0);
        assert_eq!(m.y, 100.0);
        assert_eq!(m.hp, 2.0);
        assert_eq!(m.life_remaining, 50, "lifetime untouched on inactive");
        assert!(!m.active);
    }
}
