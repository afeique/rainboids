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
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
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
    },
    /// Voluntary disconnect. Server can also detect WS close.
    Bye,
}

/// Wire-format version. Bump on any breaking schema change. Server
/// rejects Hello with a mismatched version (sends Error variant and
/// closes the WS).
pub const WIRE_VERSION: u32 = 1;

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
                },
                SnapshotShip {
                    player_id: 2,
                    x: 300.0,
                    y: 400.0,
                    vx: 0.0,
                    vy: 0.0,
                    angle: 1.5,
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
