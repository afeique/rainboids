//! Phase-2 wire-format types for `/mp/ws` (rainboids-server <→
//! rainboids-client-wasm). Authored 2026-05-17 as part of the WASM
//! pivot Phase 2.
//!
//! Design choices:
//!
//! - **Binary wire (bincode 1.x) with f64 scalars.** Encoding helpers
//!   live in `codec.rs`. JSON encoding stays available via `serde_json`
//!   for tests and the Tier-1 debug logger that pretty-prints decoded
//!   messages to the browser console behind `?mp-debug=1`. The wire
//!   itself is always binary in production — ~6× smaller than JSON
//!   for snapshots, faster to decode, and gives Phase 4+ reconciliation
//!   a stable byte-level format to checksum.
//!
//! - **f64 throughout** to match JavaScript Number precision. No
//!   implicit narrowing at the wasm-bindgen boundary; WASM-side
//!   prediction matches native server math bit-for-bit. The wire cost
//!   is doubled per scalar (8 B vs 4 B) — at Phase 2 wire volume
//!   (~10 KB/s/client) this is invisible.
//!
//! - **Minimal types**: just what Phase 2 needs to ship two ships
//!   visible to each other. No room metadata, no peer list, no
//!   matchmaking, no events. Each later phase grows the wire format
//!   additively.
//!
//! - **Independent of the legacy `crate::protocol`** (codegen'd
//!   from `schema/protocol.toml`). The legacy wire still serves the
//!   legacy server-bin path; this Phase-2 wire is a fresh parallel
//!   surface. They converge in Phase 5+ when the legacy modules are
//!   archived.

use serde::{Deserialize, Serialize};

/// Compact ship state for a Snapshot variant. One per ship in the room.
/// Plain f64 for everything — no fixed-point yet, that's Phase 4+
/// when prediction reconciliation needs determinism.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct SnapshotShip {
    /// Server-assigned stable identifier for the ship's owner.
    pub player_id: u32,
    /// World-space x position (pixels).
    pub x: f64,
    /// World-space y position (pixels).
    pub y: f64,
    /// World-space x velocity (pixels per tick).
    pub vx: f64,
    /// World-space y velocity (pixels per tick).
    pub vy: f64,
    /// Facing angle in radians; 0 = +x axis (right). Matches `ShipState::angle`.
    pub angle: f64,
    /// Phase 4 step 2 — current HP. Added so HUD reads authoritative
    /// value without waiting for an Event frame.
    pub hp: f64,
    /// Phase 4 step 2 — max HP.
    pub max_hp: f64,
    /// Phase 4 step 2 — shield value (absorbs damage before HP).
    pub shield: f64,
    /// Phase 4 step 2 — shield maximum.
    pub max_shield: f64,
    /// Phase 4 step 2 — remaining spare tanks (extra lives).
    pub spare_tanks: u8,
    /// Phase 4 step 2 — currently equipped weapon. Server-authoritative
    /// echo of the client's selection so remote tabs can render the
    /// peer's bullet color correctly.
    pub weapon_kind: u8,
    /// Phase 4 step 2 — downed flag mirrored onto the wire so remote
    /// tabs don't have to wait on a ShipDowned event to know.
    pub downed: bool,
}

/// Server-to-client messages. Externally-tagged serde enum:
///
/// - bincode encodes as `<u32 variant index><variant fields>`
/// - serde_json encodes as `{"VariantName": {field: ...}}` — readable
///   in DevTools when the Tier-1 debug logger pretty-prints decoded
///   messages.
///
/// (Internally-tagged `#[serde(tag = "kind")]` would be slightly
/// prettier JSON but bincode 1.x can't deserialize it — internally
/// tagged enums need `deserialize_any` which non-self-describing
/// formats don't support. Externally-tagged works in both.)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServerMsg {
    /// Acks a Hello. Tells the client its assigned player_id and the
    /// server's current tick at moment of welcome (useful for clock
    /// alignment estimates, though Phase 2 doesn't use it for anything
    /// load-bearing).
    Welcome {
        /// Stable id the server assigned to this connection.
        player_id: u32,
        /// Server's authoritative tick counter at moment of welcome.
        server_tick: u32,
        /// Initial spawn x — seeds the client WASM World matching the server.
        spawn_x: f64,
        /// Initial spawn y — seeds the client WASM World matching the server.
        spawn_y: f64,
        /// Room's RNG seed. Client passes this to `World::seed(...)`
        /// so its deterministic mirror produces the same RNG stream
        /// the server is consuming. Added in WIRE_VERSION 3.
        rng_seed: u64,
    },
    /// Periodic state broadcast. ~20Hz. Each ship's authoritative
    /// position. Phase 4+ will add delta-encoding; Phase 2 sends full.
    Snapshot {
        /// Server tick at which this snapshot was sampled.
        tick: u32,
        /// Last `client_tick` from this player's Input the server has
        /// applied. Phase 2 doesn't use it; Phase 4 reconciliation
        /// will replay pending inputs from `acked_input_tick + 1`
        /// forward when local prediction diverges from the server.
        /// Wire size: 4 bytes — cheap forward-compat.
        acked_input_tick: u32,
        /// All ships currently active in the room.
        ships: Vec<SnapshotShip>,
    },
    /// Another peer just joined the room.
    PeerJoined {
        /// The new peer's assigned id.
        player_id: u32,
    },
    /// Another peer disconnected from the room.
    PeerLeft {
        /// The departing peer's id.
        player_id: u32,
    },
    /// Server-initiated error or protocol violation. Connection may close.
    Error {
        /// Short machine-readable code (e.g. `"wire_version_mismatch"`).
        code: String,
        /// Human-readable explanation for logging / DevTools.
        message: String,
    },

    // ── Phase 3 additions ──

    /// One-shot moments the deterministic sim can't fully express.
    /// Bundled per-tick into a single `Event` frame; broadcast
    /// coincident with the next `Snapshot`. Client consumes each
    /// payload in order to update its deterministic state mirror.
    Event {
        /// Server tick at which these events occurred.
        tick: u32,
        /// Payload variants — see `EventPayload` below.
        payloads: Vec<EventPayload>,
    },

    /// Periodic safety net. Server broadcasts every ~60 ticks (~1 Hz).
    /// Client computes the same hash over its predicted state; on
    /// mismatch, sends `ClientMsg::Resync { client_tick }` and the
    /// server replies with a one-shot full `Resync` payload below.
    /// Wire cost: ~28 B / sec / client.
    StateChecksum {
        tick: u32,
        ships_hash: u64,
        enemies_hash: u64,
        asteroids_hash: u64,
        bullets_hash: u64,
    },

    /// Full-state recovery payload — sent only in response to
    /// `ClientMsg::Resync` when checksum mismatched. Carries the
    /// authoritative current state of every deterministic entity
    /// plus the room's RNG state so the client can re-seed
    /// identically and resume the deterministic stream.
    Resync {
        tick: u32,
        rng_seed: u64,
        ships: Vec<SnapshotShip>,
        enemies: Vec<EnemyWire>,
        asteroids: Vec<AsteroidWire>,
        bullets: Vec<BulletWire>,
        /// Added in WIRE_VERSION 4 (Phase 4 step 1).
        orbs: Vec<OrbWire>,
        /// Added in WIRE_VERSION 4. Wave state at resync moment so the
        /// client's wave machine resumes from the right phase.
        wave_number: u32,
        wave_sub_wave_idx: u8,
        wave_phase: u8, // 0=Intro, 1=Spawning, 2=Clearing, 3=Complete
        wave_phase_started_tick: u32,
    },
}

/// Client-to-server messages. Externally-tagged serde enum (see
/// `ServerMsg` doc for the bincode-compatibility rationale).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClientMsg {
    /// First message on a fresh WS. Carries client identification.
    /// Server replies with Welcome or Error.
    Hello {
        /// Player-visible display name (no auth in Phase 2; trust on first use).
        name: String,
        /// `CARGO_PKG_VERSION` of `rainboids-client-wasm`.
        client_version: String,
        /// `WIRE_VERSION` const (see below). Server rejects mismatches.
        wire_version: u32,
    },
    /// Per-tick input upload. Client sends at ~30Hz.
    Input {
        /// Client tick counter (for future reconciliation; Phase 2
        /// doesn't reconcile — server just applies and broadcasts).
        client_tick: u32,
        /// Movement key state — forward / thrust.
        up: bool,
        /// Movement key state — reverse / brake.
        down: bool,
        /// Movement key state — strafe / turn left.
        left: bool,
        /// Movement key state — strafe / turn right.
        right: bool,
        /// World-space aim target x (mouse projected to world coords).
        aim_x: f64,
        /// World-space aim target y (mouse projected to world coords).
        aim_y: f64,
        /// Phase 4 step 4 — currently-equipped weapon. Server persists
        /// onto `ShipState.weapon_kind` and dispatches fire via
        /// `mp1::weapon::fire(weapon, ship, rng)`. See
        /// `mp1::weapon::KIND_*` for the dense u8 enumeration.
        /// Default = 0 (PULSE_CANNON).
        weapon: u8,
        /// Fire button held this tick. Edge-detection lives in the
        /// server's per-weapon cooldown gate.
        fire: bool,
    },
    /// Voluntary disconnect. Server can also detect WS close.
    Bye,

    // ── Phase 3 additions ──

    /// Client requests a full-state Resync. Sent when our local
    /// `StateChecksum` doesn't match the server's. Carries the
    /// client's current tick for diagnostic logging.
    Resync {
        client_tick: u32,
    },
}

/// Wire-format version. Bump on any breaking schema change. Server
/// rejects Hello with a mismatched version (sends Error variant and
/// closes the WS).
///
/// - 6: Phase 4 step 2 — HP/death parity. `SnapshotShip` gains
///   `hp`, `max_hp`, `shield`, `max_shield`, `spare_tanks`,
///   `weapon_kind`, `downed`. Each ship snapshot grows by ~35 bytes.
/// - 5: Phase 4 step 4 — base weapons. `ClientMsg::Input` gains
///   `weapon: u8` so the server knows which fire pattern to dispatch.
///   `BulletSpawn` already carries `weapon: u8` (reserved since Phase 3),
///   so no per-bullet shape change.
/// - 4: Phase 4 step 1 — wave-driven enemy spawns + drop-orbs. Adds
///   `EventPayload::{OrbSpawn, OrbCollected, WaveStart, WaveClear}`,
///   `OrbWire`, and the orbs / wave fields on `Resync`.
/// - 3: Phase 3 follow-up — `Welcome.rng_seed: u64` added so the
///   client can mirror the server's RNG stream deterministically.
/// - 1: Phase 2 (ships only, Welcome / Snapshot / Input / Bye).
/// - 2: Phase 3 — adds Event / StateChecksum / Resync; client may
///   send Resync in response to a checksum miss. Snapshot still
///   ship-only (deterministic kinds reconstructed client-side).
pub const WIRE_VERSION: u32 = 6;

// ── Phase 3 — EventPayload variants ──

/// One-shot moment the deterministic sim can't fully express.
/// Bundled into `ServerMsg::Event { tick, payloads }` and broadcast
/// every tick that had events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EventPayload {
    /// New enemy spawned. Client instantiates from the sub-seed via
    /// `mp1::enemy::spawn_hunter_from_seed`. Both sides produce the
    /// same enemy.
    EnemySpawn {
        enemy_id: u32,
        kind: u8,
        rng_subseed: u64,
    },

    /// New asteroid spawned. Client instantiates from the sub-seed
    /// via `mp1::asteroid::spawn_from_seed`. Used at room boot
    /// (3-4 initial asteroids) and any time the server spawns more.
    AsteroidSpawn {
        asteroid_id: u32,
        rng_subseed: u64,
    },

    /// Player fired a bullet. Client integrates trajectory locally
    /// from `(origin_x, origin_y, vx, vy, spawn_tick)`.
    BulletSpawn {
        bullet_id: u32,
        owner_player_id: u32,
        origin_x: f64,
        origin_y: f64,
        vx: f64,
        vy: f64,
        spawn_tick: u32,
        weapon: u8,
    },

    /// Authoritative hit confirmation. Client snaps the named
    /// bullet to inactive and triggers spark cosmetic at hit_tick.
    /// `target_kind`: 0 = enemy, 1 = asteroid.
    BulletHit {
        bullet_id: u32,
        target_kind: u8,
        target_id: u32,
        hit_tick: u32,
        hit_x: f64,
        hit_y: f64,
    },

    /// Enemy died. Client marks inactive + triggers death cosmetic.
    EnemyDestroy {
        enemy_id: u32,
        by_bullet_id: u32,
        kill_tick: u32,
        x: f64,
        y: f64,
        kind: u8,
    },

    /// Asteroid died and (if large enough) split into children.
    /// Client computes the same children via the shared sub-seed.
    /// `child_id_start` is the first id the room will assign; the
    /// client matches by consuming events in order, identical to
    /// server.
    AsteroidSplit {
        parent_id: u32,
        kill_tick: u32,
        x: f64,
        y: f64,
        rng_subseed: u64,
        child_id_start: u32,
    },

    /// Ship took damage. Cosmetic — actual HP delta is reflected
    /// in the next Snapshot's `SnapshotShip.hp`. Used for damage-
    /// flash trigger timing.
    ShipDamaged {
        player_id: u32,
        by_kind: u8, // 0=enemy, 1=asteroid
        by_id: u32,
        hit_tick: u32,
        amount: f64,
        x: f64,
        y: f64,
    },

    /// Ship just transitioned to downed (HP 0). Cosmetic — Snapshot
    /// also reflects `downed = true`. Useful for one-shot wreck
    /// animation timing.
    ShipDowned {
        player_id: u32,
        at_tick: u32,
        x: f64,
        y: f64,
    },

    /// Ship was revived (downed → alive). Cosmetic; Snapshot also
    /// reflects `downed = false` + `hp = REVIVE_HP_FRACTION * max_hp`.
    ShipRevived {
        revived_player_id: u32,
        by_player_id: u32,
        at_tick: u32,
    },

    // ── Phase 4 step 1 — drops + waves ──

    /// A pickup orb spawned at a death site. Client instantiates from
    /// `(orb_id, kind, x, y, rng_subseed)` via
    /// `mp1::drops::spawn_orb_from_seed` so both sides produce the
    /// same outward kick. `kind`: 0 = gold, 1 = health.
    OrbSpawn {
        orb_id: u32,
        kind: u8,
        x: f64,
        y: f64,
        rng_subseed: u64,
    },

    /// An orb was collected by a ship. Client marks the orb inactive
    /// + applies the local cosmetic (sparkle particle). Heal / score
    /// effect is reflected in the next Snapshot (ship.hp for health,
    /// future per-player score field for gold).
    OrbCollected {
        orb_id: u32,
        by_player_id: u32,
        kind: u8,
        at_tick: u32,
        x: f64,
        y: f64,
    },

    /// A new wave just started. Client updates its HUD wave number
    /// and resets local wave-machine state. Carries the wave number
    /// (1-indexed) and the asteroid count seeded at wave start.
    WaveStart {
        wave_number: u32,
        asteroid_count: u8,
        is_boss_wave: bool,
        boss_tier: u8,
        at_tick: u32,
    },

    /// The current wave was cleared (all sub-waves spawned + all
    /// enemies dead). Server is about to advance to the next wave on
    /// the next tick. Client can play the wave-clear stinger.
    WaveClear {
        wave_number: u32,
        at_tick: u32,
    },
}

// ── Phase 3 — Resync wire records ──
//
// These are full-state recovery payloads, NOT per-snapshot fields.
// `EnemyWire` / `AsteroidWire` / `BulletWire` carry every field
// needed to bootstrap the deterministic sim's state mirror. Sent
// only in response to `ClientMsg::Resync`.

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct EnemyWire {
    pub id: u32,
    pub kind: u8,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub angle: f64,
    pub hp: f64,
    pub max_hp: f64,
    pub radius: f64,
    pub arc_dir: f64,
    pub arc_radius: f64,
    pub arc_omega: f64,
    pub arc_phase: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct AsteroidWire {
    pub id: u32,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub rot: f64,
    pub rot_vel: f64,
    pub radius: f64,
    pub base_radius: f64,
    pub hp: f64,
    pub max_hp: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BulletWire {
    pub id: u32,
    pub owner_player_id: u32,
    pub origin_x: f64,
    pub origin_y: f64,
    pub vx: f64,
    pub vy: f64,
    pub spawn_tick: u32,
    pub life_remaining: u32,
}

/// Resync record for one orb. Carries every field the WASM client
/// needs to bootstrap its deterministic mirror's `OrbState`.
/// Added in WIRE_VERSION 4 (Phase 4 step 1).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct OrbWire {
    pub id: u32,
    pub kind: u8,
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
    pub life_ticks: u32,
    pub opacity: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_roundtrip() {
        let m = ClientMsg::Hello {
            name: "test".into(),
            client_version: "0.2.1".into(),
            wire_version: WIRE_VERSION,
        };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"Hello\""));
        let back: ClientMsg = serde_json::from_str(&json).unwrap();
        match back {
            ClientMsg::Hello { wire_version, .. } => {
                assert_eq!(wire_version, WIRE_VERSION);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn snapshot_roundtrip() {
        let m = ServerMsg::Snapshot {
            tick: 42,
            acked_input_tick: 41,
            ships: vec![
                SnapshotShip {
                    player_id: 1,
                    x: 100.0,
                    y: 200.0,
                    vx: 1.0,
                    vy: -2.0,
                    angle: 0.5,
                    ..Default::default()
                },
                SnapshotShip {
                    player_id: 2,
                    x: 300.0,
                    y: 400.0,
                    vx: 0.0,
                    vy: 0.0,
                    angle: 1.5,
                    ..Default::default()
                },
            ],
        };
        let json = serde_json::to_string(&m).unwrap();
        let back: ServerMsg = serde_json::from_str(&json).unwrap();
        match back {
            ServerMsg::Snapshot { ships, .. } => assert_eq!(ships.len(), 2),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn welcome_roundtrip() {
        let m = ServerMsg::Welcome {
            player_id: 7,
            server_tick: 1234,
            spawn_x: 960.0,
            spawn_y: 540.0,
            rng_seed: 0xDEAD_BEEF_CAFE_F00D,
        };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"Welcome\""));
        let back: ServerMsg = serde_json::from_str(&json).unwrap();
        match back {
            ServerMsg::Welcome { player_id, .. } => assert_eq!(player_id, 7),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn input_roundtrip() {
        let m = ClientMsg::Input {
            client_tick: 99,
            up: true,
            down: false,
            left: false,
            right: true,
            aim_x: 123.5,
            aim_y: -45.25,
            weapon: 2, // SCATTER_GUN
            fire: true,
        };
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"Input\""));
        let back: ClientMsg = serde_json::from_str(&json).unwrap();
        match back {
            ClientMsg::Input {
                client_tick,
                up,
                right,
                ..
            } => {
                assert_eq!(client_tick, 99);
                assert!(up);
                assert!(right);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn bye_roundtrip() {
        let m = ClientMsg::Bye;
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"Bye\""));
        let back: ClientMsg = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, ClientMsg::Bye));
    }
}
