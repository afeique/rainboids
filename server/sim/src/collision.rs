//! Phase-3 collision detection for /mp.
//!
//! Authored fresh 2026-05-17 from `js/modules/combat/collision-system.js`,
//! pulling only the four Phase-3-relevant pairs:
//!
//! - bullet × enemy    (bullet damages enemy; enemy may die)
//! - bullet × asteroid (bullet damages asteroid; asteroid may split deterministically)
//! - ship   × enemy    (contact damage)
//! - ship   × asteroid (contact damage, smaller)
//!
//! Pure circle-vs-circle (radius sum check). Field is small enough
//! that N² over the worst-case ~50 entities (~2500 ops/tick) is
//! trivial — no quadtree needed in Phase 3. Phase 4+ adds broadphase
//! when entity counts grow.
//!
//! Bullets are projected from their spawn point each call via
//! `BulletState::position_at(current_tick)` — they don't carry a
//! per-tick position field. This keeps the deterministic-projectile
//! contract honest (server and client compute the same hit-test
//! against the same projected position).
//!
//! Friendly fire is OFF: bullet × ship is intentionally not a pair.
//! Phase 3 has no enemy bullets; friendly-bullet × friendly-ship
//! gets filtered at the spawn point (bullet.owner_player_id is set
//! but no pair test against ships of the same owner — there's no
//! pair test at all).

use super::asteroid::{compute_split_children, AsteroidState};
use super::bullet::{BulletState, BULLET_RADIUS};
#[cfg(test)]
use super::bullet::PULSE_CANNON_DAMAGE;
use super::damage::{apply_damage, DamageOutcome, ShipState};
use super::drops::{OrbState, ORB_KIND_HEALTH, ORB_RADIUS};
use super::enemy::{EnemyState, HUNTER_CONTACT_DAMAGE};
use super::enemy_bullet::EnemyBulletState;
use super::enemy_mine::{apply_damage_to_mine, EnemyMineState};
use super::enemy_missile::EnemyMissileState;
use super::rng_ctx::RngCtx;

// Re-exported for downstream test fixtures that build mock entities;
// the production code paths use these via their own modules but tests
// in this file (and Wave 3+ integration tests) want them in scope here.
#[cfg(test)]
#[allow(unused_imports)]
use super::asteroid::MIN_AST_RAD;
#[cfg(test)]
#[allow(unused_imports)]
use super::enemy::KIND_HUNTER;

/// Contact-damage rate for ship × asteroid. Smaller than enemy
/// damage to keep asteroids as environmental hazards, not main
/// threats. Mirrors solo's PLAYER_ASTEROID_COLLISION_DAMAGE
/// (approximately).
pub const ASTEROID_CONTACT_DAMAGE: f64 = 2.0;

/// HP healed when a ship picks up a health orb. Solo's basic health
/// orb heals 25 (per `js/modules/levels/health-orb-config.js`-era
/// numbers); mirrored here as the Phase 4 step 1 starting value.
/// Clamped to `ship.max_hp` on apply.
pub const ORB_HEALTH_HEAL: f64 = 25.0;

/// Event variant emitted by the collision pass. Caller (room actor)
/// maps these to wire-protocol EventPayload variants and broadcasts.
#[derive(Debug, Clone)]
pub enum CollisionEvent {
    /// A bullet struck a target this tick at the named world point.
    BulletHit {
        bullet_id: u32,
        hit_x: f64,
        hit_y: f64,
    },
    /// An enemy reached <= 0 HP from a bullet hit this tick.
    EnemyDestroyed {
        enemy_id: u32,
        by_bullet_id: u32,
        x: f64,
        y: f64,
        kind: u8,
    },
    /// An asteroid reached <= 0 HP this tick; `children` holds the
    /// deterministic split result (empty if base_radius was too small).
    AsteroidDestroyed {
        asteroid_id: u32,
        x: f64,
        y: f64,
        split_subseed: u64,
        child_id_start: u32,
        children: Vec<AsteroidState>,
    },
    /// A ship absorbed damage from an enemy or asteroid contact.
    ShipDamaged {
        player_id: u32,
        by_kind: u8, // 0 = enemy, 1 = asteroid
        by_id: u32,
        amount: f64,
        x: f64,
        y: f64,
    },
    /// A ship transitioned to the downed state this tick.
    ShipDowned {
        player_id: u32,
        at_x: f64,
        at_y: f64,
    },
    /// A ship picked up an orb this tick. Health orbs already mutated
    /// the ship's `hp` field (the room actor's tick translates this
    /// event into a wire `OrbCollected` payload; the ship's HP delta
    /// shows up in the next Snapshot). Gold orbs only emit the event
    /// (no score accounting in sim state.rs yet — Phase 4 step 9).
    OrbCollected {
        orb_id: u32,
        by_player_id: u32,
        kind: u8,
        x: f64,
        y: f64,
    },
    /// An enemy bullet struck a ship this tick. Damage already applied
    /// via `damage::apply_damage` (ship's hp delta lands in the next
    /// Snapshot). Wire event so the client can play a hit-spark
    /// cosmetic at the impact point + despawn the named bullet.
    ShipHitByEnemyBullet {
        bullet_id: u32,
        player_id: u32,
        x: f64,
        y: f64,
    },
    /// Phase 4 step 5 — a player bullet damaged a mine.
    BulletDamagedMine {
        bullet_id: u32,
        mine_id: u32,
        x: f64,
        y: f64,
    },
    /// Phase 4 step 5 — a mine reached <= 0 HP from a bullet hit, OR
    /// a ship contacted it (in which case `by_bullet_id == 0`). Caller
    /// (room actor) translates this into the wire `EnemyMineDeath`
    /// payload.
    MineDestroyed {
        mine_id: u32,
        by_bullet_id: u32, // 0 if killed by ship contact / lifetime
        x: f64,
        y: f64,
    },
    /// Phase 4 step 5 — an enemy missile struck a ship. Mirrors the
    /// `ShipHitByEnemyBullet` shape; missile is single-hit.
    ShipHitByEnemyMissile {
        missile_id: u32,
        player_id: u32,
        x: f64,
        y: f64,
    },
    /// Phase 4 step 6 — a player mine detonated from enemy contact (or
    /// from HP-killed). `by_bullet_id == 0` if the detonation was triggered
    /// by an enemy entering the mine's trigger_radius; otherwise it's the
    /// id of the enemy bullet that killed it. Caller emits one
    /// `EventPayload::PlayerMineDeath` per event.
    PlayerMineDetonate {
        mine_id: u32,
        owner_player_id: u32,
        x: f64,
        y: f64,
        by_bullet_id: u32,
    },
    /// Phase 4 step 6 — a player missile hit an enemy. Caller emits one
    /// `EventPayload::PlayerMissileHit`.
    PlayerMissileHitEnemy {
        missile_id: u32,
        enemy_id: u32,
        x: f64,
        y: f64,
    },
}

/// `by_kind` discriminator: damage source was an enemy body.
pub const BY_KIND_ENEMY: u8 = 0;
/// `by_kind` discriminator: damage source was an asteroid body.
pub const BY_KIND_ASTEROID: u8 = 1;

/// Run all four Phase-3 collision pairs. Mutates entity state
/// (HP changes, dead-marks). Appends events to `out_events`.
/// Caller passes the current tick so bullets can be position-
/// projected from their spawn parameters.
///
/// Caller is responsible for:
/// - reaping dead entities (`active = false` or `hp <= 0`) AFTER
///   collision returns (so deaths cascade correctly within a tick)
/// - assigning child asteroid IDs from `next_asteroid_id` BEFORE
///   calling (passed in as `child_id_start_next`)
/// - feeding the returned `child_count_total` back into the room's
///   next_asteroid_id counter
///
/// Returns the total count of new asteroid IDs the caller should
/// advance `next_asteroid_id` by.
pub fn run_collisions(
    ships: &mut [ShipState],
    enemies: &mut [EnemyState],
    asteroids: &mut [AsteroidState],
    bullets: &mut [BulletState],
    orbs: &mut [OrbState],
    enemy_bullets: &mut [EnemyBulletState],
    current_tick: u32,
    rng: &mut RngCtx,
    mut child_id_start_next: u32,
    out_events: &mut Vec<CollisionEvent>,
) -> u32 {
    let start_child_id = child_id_start_next;

    // --- bullet × enemy ---
    // Phase 4 step 4: each bullet carries its own `damage` and
    // `piercing_left`. Damage is applied per-hit; the bullet deactivates
    // only when `piercing_left == 0` (otherwise we decrement and keep
    // going so a RAIL_DRIVER shot can punch through multiple targets).
    for b in bullets.iter_mut() {
        if b.dead() {
            continue;
        }
        let (bx, by) = b.position_at(current_tick);
        for e in enemies.iter_mut() {
            if !e.active || e.hp <= 0.0 {
                continue;
            }
            let dx = bx - e.x;
            let dy = by - e.y;
            let r_sum = BULLET_RADIUS + e.radius;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            // Hit.
            e.hp -= b.damage;
            out_events.push(CollisionEvent::BulletHit {
                bullet_id: b.id,
                hit_x: bx,
                hit_y: by,
            });
            if e.hp <= 0.0 {
                e.hp = 0.0;
                e.active = false;
                out_events.push(CollisionEvent::EnemyDestroyed {
                    enemy_id: e.id,
                    by_bullet_id: b.id,
                    x: e.x,
                    y: e.y,
                    kind: e.kind,
                });
            }
            // Piercing: decrement; deactivate only when exhausted.
            if b.piercing_left == 0 {
                b.active = false;
                b.life_remaining = 0;
                break;
            }
            b.piercing_left -= 1;
            // Continue searching for more enemies along the same tick
            // — RAIL_DRIVER can chain through the whole array.
        }
    }

    // --- bullet × asteroid ---
    for b in bullets.iter_mut() {
        if b.dead() {
            continue;
        }
        let (bx, by) = b.position_at(current_tick);
        for a in asteroids.iter_mut() {
            if !a.active || a.hp <= 0.0 {
                continue;
            }
            let dx = bx - a.x;
            let dy = by - a.y;
            let r_sum = BULLET_RADIUS + a.radius;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            a.hp -= b.damage;
            out_events.push(CollisionEvent::BulletHit {
                bullet_id: b.id,
                hit_x: bx,
                hit_y: by,
            });
            if a.hp <= 0.0 {
                a.hp = 0.0;
                a.active = false;
                // Deterministic split via shared sub-seed.
                let sub_seed = rng.sub_seed();
                let children = compute_split_children(a, sub_seed, child_id_start_next);
                let n_children = children.len() as u32;
                out_events.push(CollisionEvent::AsteroidDestroyed {
                    asteroid_id: a.id,
                    x: a.x,
                    y: a.y,
                    split_subseed: sub_seed,
                    child_id_start: child_id_start_next,
                    children,
                });
                child_id_start_next += n_children;
            }
            // Piercing: same logic as enemies.
            if b.piercing_left == 0 {
                b.active = false;
                b.life_remaining = 0;
                break;
            }
            b.piercing_left -= 1;
        }
    }

    // --- ship × enemy (contact damage) ---
    for s in ships.iter_mut() {
        if !s.active || s.downed {
            continue;
        }
        for e in enemies.iter() {
            if !e.active || e.hp <= 0.0 {
                continue;
            }
            let dx = s.x - e.x;
            let dy = s.y - e.y;
            let r_sum = s.radius + e.radius;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            let outcome = apply_damage(s, HUNTER_CONTACT_DAMAGE);
            match outcome {
                DamageOutcome::Damaged => {
                    out_events.push(CollisionEvent::ShipDamaged {
                        player_id: s.player_id,
                        by_kind: BY_KIND_ENEMY,
                        by_id: e.id,
                        amount: HUNTER_CONTACT_DAMAGE,
                        x: s.x,
                        y: s.y,
                    });
                }
                DamageOutcome::JustDowned => {
                    out_events.push(CollisionEvent::ShipDamaged {
                        player_id: s.player_id,
                        by_kind: BY_KIND_ENEMY,
                        by_id: e.id,
                        amount: HUNTER_CONTACT_DAMAGE,
                        x: s.x,
                        y: s.y,
                    });
                    out_events.push(CollisionEvent::ShipDowned {
                        player_id: s.player_id,
                        at_x: s.x,
                        at_y: s.y,
                    });
                }
                DamageOutcome::NoOp => {}
            }
            // Don't break — multiple enemies can hit the same ship
            // in the same tick. Damage already applied; loop on.
            // (The downed check below will skip further damage after JustDowned.)
            if s.downed {
                break;
            }
        }
    }

    // --- ship × asteroid (contact damage) ---
    for s in ships.iter_mut() {
        if !s.active || s.downed {
            continue;
        }
        for a in asteroids.iter() {
            if !a.active || a.hp <= 0.0 {
                continue;
            }
            let dx = s.x - a.x;
            let dy = s.y - a.y;
            let r_sum = s.radius + a.radius;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            let outcome = apply_damage(s, ASTEROID_CONTACT_DAMAGE);
            match outcome {
                DamageOutcome::Damaged => {
                    out_events.push(CollisionEvent::ShipDamaged {
                        player_id: s.player_id,
                        by_kind: BY_KIND_ASTEROID,
                        by_id: a.id,
                        amount: ASTEROID_CONTACT_DAMAGE,
                        x: s.x,
                        y: s.y,
                    });
                }
                DamageOutcome::JustDowned => {
                    out_events.push(CollisionEvent::ShipDamaged {
                        player_id: s.player_id,
                        by_kind: BY_KIND_ASTEROID,
                        by_id: a.id,
                        amount: ASTEROID_CONTACT_DAMAGE,
                        x: s.x,
                        y: s.y,
                    });
                    out_events.push(CollisionEvent::ShipDowned {
                        player_id: s.player_id,
                        at_x: s.x,
                        at_y: s.y,
                    });
                }
                DamageOutcome::NoOp => {}
            }
            if s.downed {
                break;
            }
        }
    }

    // --- ship × enemy_bullet (hostile projectile damage) ---
    // Each enemy bullet checks against every alive non-downed ship.
    // On hit: bullet deactivates, ship takes `bullet.damage` via the
    // shared `apply_damage` flow (which routes through shield + spare
    // tanks per Phase 4 step 2). Emit ShipHitByEnemyBullet for the
    // wire-side cosmetic + bullet-despawn replay.
    for b in enemy_bullets.iter_mut() {
        if !b.active {
            continue;
        }
        for s in ships.iter_mut() {
            if !s.active || s.downed {
                continue;
            }
            let dx = s.x - b.x;
            let dy = s.y - b.y;
            let r_sum = s.radius + b.radius;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            let outcome = apply_damage(s, b.damage);
            match outcome {
                DamageOutcome::Damaged | DamageOutcome::JustDowned => {
                    out_events.push(CollisionEvent::ShipHitByEnemyBullet {
                        bullet_id: b.id,
                        player_id: s.player_id,
                        x: b.x,
                        y: b.y,
                    });
                    if matches!(outcome, DamageOutcome::JustDowned) {
                        out_events.push(CollisionEvent::ShipDowned {
                            player_id: s.player_id,
                            at_x: s.x,
                            at_y: s.y,
                        });
                    }
                }
                DamageOutcome::NoOp => {}
            }
            // Enemy bullets are single-hit (no piercing in Phase 4).
            b.active = false;
            b.life_remaining = 0;
            break;
        }
    }

    // --- ship × orb (pickup) ---
    // Health orbs heal the ship (clamped to max_hp) and despawn.
    // Gold orbs despawn and emit the event so the wire layer can
    // credit the picker; gameplay-side score accounting is Phase 4
    // step 9. Downed ships can't collect.
    for s in ships.iter_mut() {
        if !s.active || s.downed {
            continue;
        }
        for o in orbs.iter_mut() {
            if !o.active {
                continue;
            }
            let dx = s.x - o.x;
            let dy = s.y - o.y;
            let r_sum = s.radius + ORB_RADIUS;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            // Pickup.
            o.active = false;
            if o.kind == ORB_KIND_HEALTH {
                s.hp = (s.hp + ORB_HEALTH_HEAL).min(s.max_hp);
            }
            out_events.push(CollisionEvent::OrbCollected {
                orb_id: o.id,
                by_player_id: s.player_id,
                kind: o.kind,
                x: o.x,
                y: o.y,
            });
        }
    }

    child_id_start_next - start_child_id
}

/// Phase 4 step 5 — bullet × mine collision pass. Mines have HP and
/// are destructible by player bullets. Bullets respect piercing
/// (`piercing_left`); mines deactivate when HP hits 0.
///
/// Emits `BulletDamagedMine` per hit, `MineDestroyed` per kill.
/// Caller (room actor) reaps dead mines + bullets after this returns.
pub fn run_bullet_mine_pairs(
    mines: &mut [EnemyMineState],
    bullets: &mut [BulletState],
    current_tick: u32,
    out_events: &mut Vec<CollisionEvent>,
) {
    for b in bullets.iter_mut() {
        if b.dead() {
            continue;
        }
        let (bx, by) = b.position_at(current_tick);
        for m in mines.iter_mut() {
            if m.dead() {
                continue;
            }
            let dx = m.x - bx;
            let dy = m.y - by;
            let r_sum = m.radius + BULLET_RADIUS;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            let killed = apply_damage_to_mine(m, b.damage);
            out_events.push(CollisionEvent::BulletDamagedMine {
                bullet_id: b.id,
                mine_id: m.id,
                x: bx,
                y: by,
            });
            if killed {
                out_events.push(CollisionEvent::MineDestroyed {
                    mine_id: m.id,
                    by_bullet_id: b.id,
                    x: m.x,
                    y: m.y,
                });
            }
            // Piercing rule mirrors bullet × enemy / asteroid.
            if b.piercing_left == 0 {
                b.active = false;
                b.life_remaining = 0;
                break;
            } else {
                b.piercing_left -= 1;
            }
        }
    }
}

/// Phase 4 step 5 — ship × mine collision pass. On contact the ship
/// takes the mine's `contact_damage` (routed through `apply_damage`)
/// and the mine deactivates (MineDestroyed with `by_bullet_id = 0`).
/// Downed ships are skipped.
pub fn run_ship_mine_pairs(
    ships: &mut [ShipState],
    mines: &mut [EnemyMineState],
    out_events: &mut Vec<CollisionEvent>,
) {
    for m in mines.iter_mut() {
        if m.dead() {
            continue;
        }
        for s in ships.iter_mut() {
            if !s.active || s.downed {
                continue;
            }
            let dx = s.x - m.x;
            let dy = s.y - m.y;
            let r_sum = s.radius + m.radius;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            let outcome = apply_damage(s, m.contact_damage);
            if matches!(outcome, DamageOutcome::Damaged | DamageOutcome::JustDowned) {
                out_events.push(CollisionEvent::ShipDamaged {
                    player_id: s.player_id,
                    by_kind: BY_KIND_ENEMY,
                    by_id: m.id,
                    amount: m.contact_damage,
                    x: m.x,
                    y: m.y,
                });
                if matches!(outcome, DamageOutcome::JustDowned) {
                    out_events.push(CollisionEvent::ShipDowned {
                        player_id: s.player_id,
                        at_x: s.x,
                        at_y: s.y,
                    });
                }
            }
            // Mine deactivates regardless of damage outcome (single-use).
            m.active = false;
            m.hp = 0.0;
            out_events.push(CollisionEvent::MineDestroyed {
                mine_id: m.id,
                by_bullet_id: 0,
                x: m.x,
                y: m.y,
            });
            break;
        }
    }
}

/// Phase 4 step 5 — ship × enemy_missile collision pass. Mirrors the
/// ship × enemy_bullet pair: missile damages ship via `apply_damage`,
/// missile deactivates on first hit (no piercing). Downed ships are
/// skipped.
pub fn run_ship_missile_pairs(
    ships: &mut [ShipState],
    missiles: &mut [EnemyMissileState],
    out_events: &mut Vec<CollisionEvent>,
) {
    for m in missiles.iter_mut() {
        if !m.active {
            continue;
        }
        for s in ships.iter_mut() {
            if !s.active || s.downed {
                continue;
            }
            let dx = s.x - m.x;
            let dy = s.y - m.y;
            let r_sum = s.radius + m.radius;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            let outcome = apply_damage(s, m.damage);
            if matches!(outcome, DamageOutcome::Damaged | DamageOutcome::JustDowned) {
                out_events.push(CollisionEvent::ShipHitByEnemyMissile {
                    missile_id: m.id,
                    player_id: s.player_id,
                    x: m.x,
                    y: m.y,
                });
                if matches!(outcome, DamageOutcome::JustDowned) {
                    out_events.push(CollisionEvent::ShipDowned {
                        player_id: s.player_id,
                        at_x: s.x,
                        at_y: s.y,
                    });
                }
            }
            m.active = false;
            m.life_remaining = 0;
            break;
        }
    }
}

/// Phase 4 step 6 — player_mine × enemy collision pass. An enemy
/// within the mine's `trigger_radius` triggers detonation: the blast
/// damages every active enemy within the mine's `blast_radius`, then
/// the mine deactivates. Emits one `PlayerMineDetonate` event per
/// detonation. Caller reaps dead enemies + mines after this returns.
///
/// Friendly fire is OFF — the mine never damages player ships (the
/// blast only iterates `enemies`, not `ships`).
pub fn run_player_mine_enemy_pairs(
    mines: &mut [crate::player_mine::PlayerMineState],
    enemies: &mut [crate::enemy::EnemyState],
    out_events: &mut Vec<CollisionEvent>,
) {
    for m in mines.iter_mut() {
        if m.dead() {
            continue;
        }
        let mut triggered = false;
        let tr = m.trigger_radius * m.trigger_radius;
        for e in enemies.iter() {
            if !e.active {
                continue;
            }
            let dx = e.x - m.x;
            let dy = e.y - m.y;
            if dx * dx + dy * dy <= tr {
                triggered = true;
                break;
            }
        }
        if !triggered {
            continue;
        }
        // Apply blast damage to every enemy in the blast radius.
        let br = m.blast_radius * m.blast_radius;
        for e in enemies.iter_mut() {
            if !e.active {
                continue;
            }
            let dx = e.x - m.x;
            let dy = e.y - m.y;
            if dx * dx + dy * dy <= br {
                e.hp -= m.blast_damage;
                if e.hp <= 0.0 {
                    e.active = false;
                }
            }
        }
        out_events.push(CollisionEvent::PlayerMineDetonate {
            mine_id: m.id,
            owner_player_id: m.owner_player_id,
            x: m.x,
            y: m.y,
            by_bullet_id: 0,
        });
        m.active = false;
        m.hp = 0.0;
    }
}

/// Phase 4 step 6 — player_missile × enemy collision pass. Missile
/// deactivates on first enemy contact (no piercing); enemy takes
/// `missile.damage`. Emits one `PlayerMissileHitEnemy` event per hit.
pub fn run_player_missile_enemy_pairs(
    missiles: &mut [crate::player_missile::PlayerMissileState],
    enemies: &mut [crate::enemy::EnemyState],
    out_events: &mut Vec<CollisionEvent>,
) {
    for m in missiles.iter_mut() {
        if !m.active {
            continue;
        }
        for e in enemies.iter_mut() {
            if !e.active {
                continue;
            }
            let dx = e.x - m.x;
            let dy = e.y - m.y;
            let r_sum = m.radius + e.radius;
            if dx * dx + dy * dy > r_sum * r_sum {
                continue;
            }
            e.hp -= m.damage;
            if e.hp <= 0.0 {
                e.active = false;
            }
            out_events.push(CollisionEvent::PlayerMissileHitEnemy {
                missile_id: m.id,
                enemy_id: e.id,
                x: m.x,
                y: m.y,
            });
            m.active = false;
            m.life_remaining = 0;
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asteroid::{HP_PER_RADIUS, MAX_AST_RAD};
    use crate::bullet::PULSE_CANNON_LIFETIME_TICKS;
    use crate::enemy::{HUNTER_MAX_HP, HUNTER_RADIUS};

    // ---------- helpers ----------

    fn make_ship(player_id: u32, x: f64, y: f64, hp: f64) -> ShipState {
        ShipState {
            player_id,
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp,
            max_hp: 100.0,
            radius: 14.0,
            active: true,
            downed: false,
            revive_meter: 0.0,
            weapon_kind: 0,
            shield: 0.0,
            max_shield: 0.0,
            spare_tanks: 0,
            ..ShipState::default()
        }
    }

    fn make_enemy(id: u32, x: f64, y: f64, hp: f64) -> EnemyState {
        EnemyState {
            id,
            kind: KIND_HUNTER,
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp,
            max_hp: HUNTER_MAX_HP,
            radius: HUNTER_RADIUS,
            arc_dir: 1.0,
            arc_radius: 150.0,
            arc_omega: 0.01,
            arc_phase: 0.0,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        }
    }

    fn make_asteroid(id: u32, x: f64, y: f64, radius: f64, hp: f64) -> AsteroidState {
        let max_hp = (radius * HP_PER_RADIUS).max(1.0);
        AsteroidState {
            id,
            x,
            y,
            vx: 1.0,
            vy: 0.5,
            rot: 0.0,
            rot_vel: 0.0,
            radius,
            base_radius: radius,
            hp,
            max_hp,
            active: true,
        }
    }

    /// Build a stationary bullet at a known world position. We
    /// construct directly rather than calling `BulletState::spawn`
    /// so the tests don't couple to the trig polynomial's exact
    /// output.
    fn make_bullet(id: u32, owner: u32, x: f64, y: f64) -> BulletState {
        BulletState {
            id,
            owner_player_id: owner,
            origin_x: x,
            origin_y: y,
            vx: 0.0,
            vy: 0.0,
            spawn_tick: 0,
            life_remaining: PULSE_CANNON_LIFETIME_TICKS,
            damage: PULSE_CANNON_DAMAGE,
            piercing_left: 0,
            active: true,
        }
    }

    // ---------- 1: bullet misses ----------

    #[test]
    fn bullet_misses_enemy_far_away() {
        let mut ships: [ShipState; 0] = [];
        let mut enemies = [make_enemy(1, 500.0, 500.0, HUNTER_MAX_HP)];
        let mut asteroids: [AsteroidState; 0] = [];
        let mut bullets = [make_bullet(1, 7, 0.0, 0.0)];
        let mut rng = RngCtx::from_seed(1);
        let mut events = Vec::new();
        let new_ids = run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            1000,
            &mut events,
        );
        assert_eq!(new_ids, 0);
        assert!(events.is_empty(), "no events expected, got {:?}", events);
        assert_eq!(enemies[0].hp, HUNTER_MAX_HP);
        assert!(bullets[0].active);
    }

    // ---------- 2: bullet hits enemy, damages HP ----------

    #[test]
    fn bullet_hits_enemy_damages_hp() {
        let mut ships: [ShipState; 0] = [];
        // HP big enough that one hit does not kill.
        let mut enemies = [make_enemy(1, 100.0, 100.0, 10.0)];
        let mut asteroids: [AsteroidState; 0] = [];
        // Bullet directly on top of the enemy at tick 0.
        let mut bullets = [make_bullet(42, 7, 100.0, 100.0)];
        let mut rng = RngCtx::from_seed(1);
        let mut events = Vec::new();
        run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            1000,
            &mut events,
        );
        assert_eq!(enemies[0].hp, 10.0 - PULSE_CANNON_DAMAGE);
        assert!(!bullets[0].active, "bullet should be consumed");
        // Expect exactly one BulletHit event.
        let hit_count = events
            .iter()
            .filter(|e| matches!(e, CollisionEvent::BulletHit { .. }))
            .count();
        assert_eq!(hit_count, 1, "expected 1 BulletHit, events: {:?}", events);
        let destroyed_count = events
            .iter()
            .filter(|e| matches!(e, CollisionEvent::EnemyDestroyed { .. }))
            .count();
        assert_eq!(destroyed_count, 0, "enemy should still be alive");
    }

    // ---------- 3: bullet kills enemy → BulletHit + EnemyDestroyed ----------

    #[test]
    fn bullet_kills_enemy_emits_destroyed() {
        let mut ships: [ShipState; 0] = [];
        let mut enemies = [make_enemy(5, 200.0, 300.0, 1.0)];
        let mut asteroids: [AsteroidState; 0] = [];
        let mut bullets = [make_bullet(11, 7, 200.0, 300.0)];
        let mut rng = RngCtx::from_seed(1);
        let mut events = Vec::new();
        run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            1000,
            &mut events,
        );
        assert!(!enemies[0].active, "enemy should be marked inactive");
        assert_eq!(enemies[0].hp, 0.0);
        let mut saw_hit = false;
        let mut saw_destroyed = false;
        for ev in &events {
            match ev {
                CollisionEvent::BulletHit { bullet_id, .. } => {
                    assert_eq!(*bullet_id, 11);
                    saw_hit = true;
                }
                CollisionEvent::EnemyDestroyed {
                    enemy_id,
                    by_bullet_id,
                    kind,
                    ..
                } => {
                    assert_eq!(*enemy_id, 5);
                    assert_eq!(*by_bullet_id, 11);
                    assert_eq!(*kind, KIND_HUNTER);
                    saw_destroyed = true;
                }
                other => panic!("unexpected event {:?}", other),
            }
        }
        assert!(saw_hit, "missing BulletHit");
        assert!(saw_destroyed, "missing EnemyDestroyed");
    }

    // ---------- 4: bullet hits asteroid, splits deterministically ----------

    #[test]
    fn bullet_hits_asteroid_splits_deterministically() {
        let mut ships: [ShipState; 0] = [];
        let mut enemies: [EnemyState; 0] = [];
        // Asteroid at radius 40 (above SPLIT_THRESHOLD = 20). HP set to
        // exactly PULSE_CANNON_DAMAGE so one bullet kills it.
        let mut asteroids = [make_asteroid(77, 400.0, 400.0, 40.0, PULSE_CANNON_DAMAGE)];
        let mut bullets = [make_bullet(2, 7, 400.0, 400.0)];
        let mut rng = RngCtx::from_seed(42);
        let child_id_start_in = 1000u32;
        let mut events = Vec::new();
        let new_ids = run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            child_id_start_in,
            &mut events,
        );
        assert!(!asteroids[0].active);
        let mut found_destroyed = false;
        for ev in &events {
            if let CollisionEvent::AsteroidDestroyed {
                asteroid_id,
                child_id_start,
                children,
                ..
            } = ev
            {
                assert_eq!(*asteroid_id, 77);
                assert_eq!(*child_id_start, child_id_start_in);
                let n = children.len();
                assert!(n == 3 || n == 4, "expected 3 or 4 children, got {}", n);
                // Returned advance count == children produced.
                assert_eq!(new_ids, n as u32);
                found_destroyed = true;
            }
        }
        assert!(found_destroyed, "missing AsteroidDestroyed event");
    }

    // ---------- 5: bullet hits small asteroid, no children ----------

    #[test]
    fn bullet_hits_small_asteroid_no_children() {
        let mut ships: [ShipState; 0] = [];
        let mut enemies: [EnemyState; 0] = [];
        // base_radius just below SPLIT_THRESHOLD (MIN_AST_RAD + 5 = 20).
        let small_radius = MIN_AST_RAD + 4.0;
        let mut asteroids = [make_asteroid(8, 500.0, 500.0, small_radius, PULSE_CANNON_DAMAGE)];
        let mut bullets = [make_bullet(3, 7, 500.0, 500.0)];
        let mut rng = RngCtx::from_seed(1);
        let mut events = Vec::new();
        let new_ids = run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            500,
            &mut events,
        );
        assert!(!asteroids[0].active);
        assert_eq!(new_ids, 0, "small asteroid should not split");
        let mut found = false;
        for ev in &events {
            if let CollisionEvent::AsteroidDestroyed { children, .. } = ev {
                assert!(children.is_empty(), "expected no children, got {}", children.len());
                found = true;
            }
        }
        assert!(found, "missing AsteroidDestroyed event");
    }

    // ---------- 6: ship × enemy contact damage ----------

    #[test]
    fn ship_overlaps_enemy_damages_ship() {
        let mut ships = [make_ship(1, 100.0, 100.0, 50.0)];
        let mut enemies = [make_enemy(2, 100.0, 100.0, HUNTER_MAX_HP)];
        let mut asteroids: [AsteroidState; 0] = [];
        let mut bullets: [BulletState; 0] = [];
        let mut rng = RngCtx::from_seed(1);
        let mut events = Vec::new();
        run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            1,
            &mut events,
        );
        assert_eq!(ships[0].hp, 50.0 - HUNTER_CONTACT_DAMAGE);
        assert!(!ships[0].downed);
        let mut found = false;
        for ev in &events {
            if let CollisionEvent::ShipDamaged {
                player_id,
                by_kind,
                by_id,
                amount,
                ..
            } = ev
            {
                assert_eq!(*player_id, 1);
                assert_eq!(*by_kind, BY_KIND_ENEMY);
                assert_eq!(*by_id, 2);
                assert_eq!(*amount, HUNTER_CONTACT_DAMAGE);
                found = true;
            }
        }
        assert!(found, "missing ShipDamaged event");
    }

    // ---------- 7: ship × asteroid contact deals smaller damage ----------

    #[test]
    fn ship_overlaps_asteroid_damages_smaller() {
        let mut ships = [make_ship(3, 200.0, 200.0, 50.0)];
        let mut enemies: [EnemyState; 0] = [];
        let mut asteroids = [make_asteroid(99, 200.0, 200.0, 40.0, 10.0)];
        let mut bullets: [BulletState; 0] = [];
        let mut rng = RngCtx::from_seed(1);
        let mut events = Vec::new();
        run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            1,
            &mut events,
        );
        assert_eq!(ships[0].hp, 50.0 - ASTEROID_CONTACT_DAMAGE);
        assert!(
            ASTEROID_CONTACT_DAMAGE < HUNTER_CONTACT_DAMAGE,
            "asteroid damage must be smaller than enemy damage"
        );
        let mut found = false;
        for ev in &events {
            if let CollisionEvent::ShipDamaged {
                player_id,
                by_kind,
                by_id,
                amount,
                ..
            } = ev
            {
                assert_eq!(*player_id, 3);
                assert_eq!(*by_kind, BY_KIND_ASTEROID);
                assert_eq!(*by_id, 99);
                assert_eq!(*amount, ASTEROID_CONTACT_DAMAGE);
                found = true;
            }
        }
        assert!(found, "missing ShipDamaged event");
    }

    // ---------- 8: ship at 2 HP + enemy contact → downed; further enemies skipped ----------

    #[test]
    fn ship_at_0_hp_emits_downed() {
        let mut ships = [make_ship(1, 100.0, 100.0, 2.0)];
        let mut enemies = [
            make_enemy(10, 100.0, 100.0, HUNTER_MAX_HP),
            make_enemy(11, 100.0, 100.0, HUNTER_MAX_HP),
        ];
        let mut asteroids: [AsteroidState; 0] = [];
        let mut bullets: [BulletState; 0] = [];
        let mut rng = RngCtx::from_seed(1);
        let mut events = Vec::new();
        run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            1,
            &mut events,
        );
        assert_eq!(ships[0].hp, 0.0);
        assert!(ships[0].downed);

        // Exactly one ShipDamaged + one ShipDowned (second enemy should
        // have been skipped because the ship is downed).
        let damaged = events
            .iter()
            .filter(|e| matches!(e, CollisionEvent::ShipDamaged { .. }))
            .count();
        let downed = events
            .iter()
            .filter(|e| matches!(e, CollisionEvent::ShipDowned { .. }))
            .count();
        assert_eq!(damaged, 1, "expected 1 ShipDamaged, got {} (events: {:?})", damaged, events);
        assert_eq!(downed, 1, "expected 1 ShipDowned, got {} (events: {:?})", downed, events);
    }

    // ---------- 9: friendly fire OFF — no bullet × ship pair test exists ----------

    #[test]
    fn friendly_fire_off_no_pair() {
        // A bullet positioned on top of its owner's ship. Because no
        // bullet × ship pair test exists in `run_collisions`, the
        // bullet should remain active and the ship's HP unchanged
        // even at zero distance.
        let mut ships = [make_ship(7, 250.0, 250.0, 50.0)];
        let mut enemies: [EnemyState; 0] = [];
        let mut asteroids: [AsteroidState; 0] = [];
        let mut bullets = [make_bullet(1, 7, 250.0, 250.0)];
        let mut rng = RngCtx::from_seed(1);
        let mut events = Vec::new();
        run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            1,
            &mut events,
        );
        assert!(bullets[0].active, "bullet should not have been consumed");
        assert_eq!(ships[0].hp, 50.0, "ship HP must be unchanged");
        assert!(events.is_empty(), "expected no events, got {:?}", events);
    }

    // ---------- 10: split is bit-deterministic across two identical runs ----------

    #[test]
    fn deterministic_split_same_seed_same_children() {
        fn run_once(seed: u64) -> Vec<CollisionEvent> {
            let mut ships: [ShipState; 0] = [];
            let mut enemies: [EnemyState; 0] = [];
            let mut asteroids = [make_asteroid(1, 400.0, 400.0, MAX_AST_RAD, PULSE_CANNON_DAMAGE)];
            let mut bullets = [make_bullet(1, 0, 400.0, 400.0)];
            let mut rng = RngCtx::from_seed(seed);
            let mut events = Vec::new();
            run_collisions(
                &mut ships,
                &mut enemies,
                &mut asteroids,
                &mut bullets,
                &mut [],
                &mut [],
                0,
                &mut rng,
                500,
                &mut events,
            );
            events
        }

        let evs_a = run_once(0xCAFEBABE);
        let evs_b = run_once(0xCAFEBABE);

        // Pull the AsteroidDestroyed event out of each run.
        fn extract_destroyed(evs: &[CollisionEvent]) -> (u64, Vec<AsteroidState>) {
            for ev in evs {
                if let CollisionEvent::AsteroidDestroyed {
                    split_subseed,
                    children,
                    ..
                } = ev
                {
                    return (*split_subseed, children.clone());
                }
            }
            panic!("missing AsteroidDestroyed");
        }

        let (seed_a, children_a) = extract_destroyed(&evs_a);
        let (seed_b, children_b) = extract_destroyed(&evs_b);
        assert_eq!(seed_a, seed_b, "split_subseed must be identical");
        assert_eq!(
            children_a.len(),
            children_b.len(),
            "children count must match"
        );
        for (ca, cb) in children_a.iter().zip(children_b.iter()) {
            assert_eq!(ca.id, cb.id);
            assert_eq!(ca.x.to_bits(), cb.x.to_bits(), "x bit-mismatch");
            assert_eq!(ca.y.to_bits(), cb.y.to_bits(), "y bit-mismatch");
            assert_eq!(ca.vx.to_bits(), cb.vx.to_bits(), "vx bit-mismatch");
            assert_eq!(ca.vy.to_bits(), cb.vy.to_bits(), "vy bit-mismatch");
            assert_eq!(ca.radius.to_bits(), cb.radius.to_bits(), "radius bit-mismatch");
            assert_eq!(ca.hp.to_bits(), cb.hp.to_bits(), "hp bit-mismatch");
            assert_eq!(ca.rot.to_bits(), cb.rot.to_bits(), "rot bit-mismatch");
            assert_eq!(
                ca.rot_vel.to_bits(),
                cb.rot_vel.to_bits(),
                "rot_vel bit-mismatch"
            );
        }
    }

    // ---------- 11: child-id counter advances correctly across multiple splits ----------

    #[test]
    fn child_id_counter_advances_correctly() {
        let mut ships: [ShipState; 0] = [];
        let mut enemies: [EnemyState; 0] = [];
        // Two splittable asteroids; both killed by one bullet each.
        let mut asteroids = [
            make_asteroid(1, 200.0, 200.0, MAX_AST_RAD, PULSE_CANNON_DAMAGE),
            make_asteroid(2, 800.0, 800.0, MAX_AST_RAD, PULSE_CANNON_DAMAGE),
        ];
        let mut bullets = [
            make_bullet(10, 0, 200.0, 200.0),
            make_bullet(11, 0, 800.0, 800.0),
        ];
        let mut rng = RngCtx::from_seed(7);
        let child_id_start_in = 1000u32;
        let mut events = Vec::new();
        let new_ids = run_collisions(
            &mut ships,
            &mut enemies,
            &mut asteroids,
            &mut bullets,
            &mut [],
            &mut [],
            0,
            &mut rng,
            child_id_start_in,
            &mut events,
        );

        // Collect the two AsteroidDestroyed events in encounter order.
        let mut destroyed: Vec<(u32, u32, usize)> = Vec::new();
        for ev in &events {
            if let CollisionEvent::AsteroidDestroyed {
                asteroid_id,
                child_id_start,
                children,
                ..
            } = ev
            {
                destroyed.push((*asteroid_id, *child_id_start, children.len()));
            }
        }
        assert_eq!(destroyed.len(), 2, "expected 2 splits, got {:?}", destroyed);

        // First split starts at child_id_start_in.
        assert_eq!(destroyed[0].1, child_id_start_in);
        // Second split starts after first's children.
        let first_count = destroyed[0].2 as u32;
        assert_eq!(destroyed[1].1, child_id_start_in + first_count);
        // Returned advance count == total children produced.
        let total_children = destroyed.iter().map(|d| d.2 as u32).sum::<u32>();
        assert_eq!(new_ids, total_children);
    }
}

#[cfg(test)]
mod tests_phase4_step6 {
    //! Tests for the Phase 4 step 6 player-mine and player-missile
    //! collision helpers added in this file. Kept in their own module
    //! so the existing `tests` module above can stay focused on the
    //! original `run_collisions` pairs.

    use super::*;
    use crate::enemy::{EnemyState, HUNTER_MAX_HP, HUNTER_RADIUS, KIND_HUNTER};
    use crate::player_mine::{
        spawn_default as spawn_player_mine, PlayerMineState, PLAYER_MINE_BLAST_DAMAGE,
        PLAYER_MINE_BLAST_RADIUS, PLAYER_MINE_TRIGGER_RADIUS,
    };
    use crate::player_missile::{
        spawn_default as spawn_player_missile, PlayerMissileState,
        PLAYER_MISSILE_DEFAULT_DAMAGE,
    };

    // ---------- helpers ----------

    fn make_enemy_for_test(id: u32, x: f64, y: f64, hp: f64) -> EnemyState {
        EnemyState {
            id,
            kind: KIND_HUNTER,
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            angle: 0.0,
            hp,
            max_hp: HUNTER_MAX_HP,
            radius: HUNTER_RADIUS,
            arc_dir: 1.0,
            arc_radius: 150.0,
            arc_omega: 0.01,
            arc_phase: 0.0,
            active: true,
            last_fire_tick: 0,
            ..EnemyState::default()
        }
    }

    fn make_player_mine(id: u32, owner: u32, x: f64, y: f64) -> PlayerMineState {
        spawn_player_mine(id, owner, x, y)
    }

    fn make_player_missile(id: u32, owner: u32, x: f64, y: f64) -> PlayerMissileState {
        // Aim east (angle 0): vx > 0, vy ≈ 0. The collision pass we
        // exercise here doesn't care about heading — only position
        // overlap with enemies — so the angle is cosmetic.
        spawn_player_missile(id, owner, x, y, 0.0)
    }

    // ---------- player_mine × enemy ----------

    /// An enemy whose centre is strictly inside the mine's trigger
    /// radius must trigger detonation: mine flips inactive, exactly
    /// one PlayerMineDetonate event lands with `by_bullet_id == 0`.
    #[test]
    fn mine_detonates_on_enemy_contact() {
        let mut mines = [make_player_mine(1, 7, 500.0, 500.0)];
        // Enemy inside trigger_radius (60). Distance = 30.
        let mut enemies = [make_enemy_for_test(10, 500.0, 530.0, HUNTER_MAX_HP)];
        let mut events = Vec::new();
        run_player_mine_enemy_pairs(&mut mines, &mut enemies, &mut events);

        assert!(!mines[0].active, "mine must deactivate on detonation");
        assert_eq!(mines[0].hp, 0.0, "mine hp must zero out on detonation");

        let detonations: Vec<_> = events
            .iter()
            .filter(|e| matches!(e, CollisionEvent::PlayerMineDetonate { .. }))
            .collect();
        assert_eq!(detonations.len(), 1, "expected one detonation event");
        if let CollisionEvent::PlayerMineDetonate {
            mine_id,
            owner_player_id,
            by_bullet_id,
            x,
            y,
        } = detonations[0]
        {
            assert_eq!(*mine_id, 1);
            assert_eq!(*owner_player_id, 7);
            assert_eq!(*by_bullet_id, 0, "contact detonation: bullet_id 0");
            assert_eq!(*x, 500.0);
            assert_eq!(*y, 500.0);
        }
    }

    /// On detonation, every alive enemy inside `blast_radius` takes
    /// `blast_damage`. Enemies outside the radius are untouched.
    #[test]
    fn mine_blast_damages_all_enemies_in_radius() {
        let mut mines = [make_player_mine(1, 7, 500.0, 500.0)];
        // 3 enemies inside blast_radius (80), 1 outside. The first
        // (trigger) is inside trigger_radius (60) so detonation fires.
        // We give every enemy enough HP that one blast doesn't kill,
        // so we can read the post-blast HP cleanly.
        let big_hp = 50.0;
        let mut enemies = [
            make_enemy_for_test(10, 500.0, 540.0, big_hp), // d=40, triggers + blasted
            make_enemy_for_test(11, 560.0, 500.0, big_hp), // d=60, blasted
            make_enemy_for_test(12, 500.0, 575.0, big_hp), // d=75, blasted
            make_enemy_for_test(13, 500.0, 800.0, big_hp), // d=300, OUTSIDE
        ];
        let mut events = Vec::new();
        run_player_mine_enemy_pairs(&mut mines, &mut enemies, &mut events);

        assert_eq!(enemies[0].hp, big_hp - PLAYER_MINE_BLAST_DAMAGE);
        assert_eq!(enemies[1].hp, big_hp - PLAYER_MINE_BLAST_DAMAGE);
        assert_eq!(enemies[2].hp, big_hp - PLAYER_MINE_BLAST_DAMAGE);
        assert_eq!(enemies[3].hp, big_hp, "outside-radius enemy untouched");
        // Sanity-check the constants haven't drifted away from the
        // test setup (trigger inside trigger_radius, etc.).
        assert!(PLAYER_MINE_TRIGGER_RADIUS >= 40.0);
        assert!(PLAYER_MINE_BLAST_RADIUS >= 75.0);
    }

    /// An enemy beyond the trigger radius leaves the mine intact —
    /// no detonation, no event, no HP changes.
    #[test]
    fn mine_outside_trigger_doesnt_detonate() {
        let mut mines = [make_player_mine(1, 7, 500.0, 500.0)];
        // Enemy at d=300, well beyond trigger_radius (60).
        let mut enemies = [make_enemy_for_test(10, 800.0, 500.0, HUNTER_MAX_HP)];
        let mut events = Vec::new();
        run_player_mine_enemy_pairs(&mut mines, &mut enemies, &mut events);

        assert!(mines[0].active, "mine must stay active when no enemy in trigger");
        assert!(events.is_empty(), "no events expected, got {:?}", events);
        assert_eq!(enemies[0].hp, HUNTER_MAX_HP);
    }

    /// A mine flagged dead (active=false) is a no-op even if an
    /// enemy is sitting on top of it. The retain pass culls it next.
    #[test]
    fn inactive_mine_no_op() {
        let mut mine = make_player_mine(1, 7, 500.0, 500.0);
        mine.active = false;
        let mut mines = [mine];
        let mut enemies = [make_enemy_for_test(10, 500.0, 500.0, HUNTER_MAX_HP)];
        let mut events = Vec::new();
        run_player_mine_enemy_pairs(&mut mines, &mut enemies, &mut events);

        assert!(events.is_empty(), "dead mine must emit no events");
        assert_eq!(enemies[0].hp, HUNTER_MAX_HP, "dead mine must not damage enemies");
    }

    // ---------- player_missile × enemy ----------

    /// On overlap, the missile damages the enemy and deactivates.
    /// Exactly one PlayerMissileHitEnemy event lands carrying the
    /// missile id and enemy id.
    #[test]
    fn missile_hits_first_enemy() {
        let mut missiles = [make_player_missile(42, 7, 100.0, 100.0)];
        let mut enemies = [make_enemy_for_test(10, 100.0, 100.0, HUNTER_MAX_HP)];
        let mut events = Vec::new();
        run_player_missile_enemy_pairs(&mut missiles, &mut enemies, &mut events);

        assert_eq!(enemies[0].hp, HUNTER_MAX_HP - PLAYER_MISSILE_DEFAULT_DAMAGE);
        assert!(!missiles[0].active, "missile must deactivate on hit");
        assert_eq!(missiles[0].life_remaining, 0);

        let hits: Vec<_> = events
            .iter()
            .filter(|e| matches!(e, CollisionEvent::PlayerMissileHitEnemy { .. }))
            .collect();
        assert_eq!(hits.len(), 1, "expected one hit event");
    }

    /// A missile that doesn't overlap any enemy stays active and
    /// no events are emitted.
    #[test]
    fn missile_misses_distant_enemy() {
        let mut missiles = [make_player_missile(42, 7, 100.0, 100.0)];
        let mut enemies = [make_enemy_for_test(10, 900.0, 900.0, HUNTER_MAX_HP)];
        let mut events = Vec::new();
        run_player_missile_enemy_pairs(&mut missiles, &mut enemies, &mut events);

        assert!(missiles[0].active, "missile must stay active on miss");
        assert_eq!(enemies[0].hp, HUNTER_MAX_HP);
        assert!(events.is_empty());
    }

    /// An inactive missile sitting on top of an enemy is a no-op.
    #[test]
    fn missile_inactive_no_op() {
        let mut missile = make_player_missile(42, 7, 100.0, 100.0);
        missile.active = false;
        let mut missiles = [missile];
        let mut enemies = [make_enemy_for_test(10, 100.0, 100.0, HUNTER_MAX_HP)];
        let mut events = Vec::new();
        run_player_missile_enemy_pairs(&mut missiles, &mut enemies, &mut events);

        assert!(events.is_empty());
        assert_eq!(enemies[0].hp, HUNTER_MAX_HP);
    }

    /// The emitted PlayerMissileHitEnemy event must carry the
    /// missile's id, the enemy's id, and the missile's position at
    /// impact — so the room actor can replay the wire event cleanly.
    #[test]
    fn missile_event_carries_ids() {
        let mut missiles = [make_player_missile(123, 7, 250.0, 350.0)];
        let mut enemies = [make_enemy_for_test(456, 250.0, 350.0, HUNTER_MAX_HP)];
        let mut events = Vec::new();
        run_player_missile_enemy_pairs(&mut missiles, &mut enemies, &mut events);

        let hit = events
            .iter()
            .find_map(|e| match e {
                CollisionEvent::PlayerMissileHitEnemy {
                    missile_id,
                    enemy_id,
                    x,
                    y,
                } => Some((*missile_id, *enemy_id, *x, *y)),
                _ => None,
            })
            .expect("expected PlayerMissileHitEnemy event");
        assert_eq!(hit.0, 123, "missile_id");
        assert_eq!(hit.1, 456, "enemy_id");
        assert_eq!(hit.2, 250.0, "hit x = missile.x");
        assert_eq!(hit.3, 350.0, "hit y = missile.y");
    }
}
