//! Phase-2 binary codec: bincode 1.x encode/decode helpers for the
//! `mp1::wire` message types. Matches the existing project convention
//! (DefaultOptions + fixint + little-endian) so the JS-side decoder
//! ports forward from the legacy `js/sim/codec.js` shape.
//!
//! Why bincode and not JSON: smaller wire frames (~6x reduction for
//! Phase 2 snapshots), faster decode, and Phase 4+ reconciliation
//! benefits from a stable byte-level format we can checksum / diff.
//! See docs/Multiplayer WASM Pivot Phase 2 – 2026-05-17.md.

use bincode::Options;
use serde::{de::DeserializeOwned, Serialize};

use super::wire::{ClientMsg, ServerMsg};

/// Construct the bincode `Options` used everywhere in mp1.
/// Pulled out so the JS side and Rust side use IDENTICAL settings.
fn options() -> impl Options {
    bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_little_endian()
}

/// Encode any serde type into a length-tagged binary frame suitable
/// for a single WebSocket binary message. Returns `Vec<u8>`.
pub fn encode<T: Serialize>(msg: &T) -> Result<Vec<u8>, bincode::Error> {
    options().serialize(msg)
}

/// Decode a binary frame into the named serde type.
pub fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, bincode::Error> {
    options().deserialize(bytes)
}

/// Convenience: server encodes a ServerMsg, returns the binary frame.
pub fn encode_server(msg: &ServerMsg) -> Result<Vec<u8>, bincode::Error> {
    encode(msg)
}

/// Convenience: server decodes a ClientMsg from a received frame.
pub fn decode_client(bytes: &[u8]) -> Result<ClientMsg, bincode::Error> {
    decode(bytes)
}

/// Convenience: client encodes a ClientMsg (used by the WASM client
/// for symmetric testing; the actual WS send happens from JS).
pub fn encode_client(msg: &ClientMsg) -> Result<Vec<u8>, bincode::Error> {
    encode(msg)
}

/// Convenience: client decodes a ServerMsg.
pub fn decode_server(bytes: &[u8]) -> Result<ServerMsg, bincode::Error> {
    decode(bytes)
}

#[cfg(test)]
mod tests {
    use super::super::wire::{ClientMsg, ServerMsg, SnapshotShip, WIRE_VERSION};
    use super::*;

    #[test]
    fn hello_roundtrip_binary() {
        let m = ClientMsg::Hello {
            name: "pilot".into(),
            client_version: "0.2.1".into(),
            wire_version: WIRE_VERSION,
        };
        let bytes = encode(&m).unwrap();
        let back: ClientMsg = decode(&bytes).unwrap();
        match back {
            ClientMsg::Hello {
                name,
                wire_version,
                ..
            } => {
                assert_eq!(name, "pilot");
                assert_eq!(wire_version, WIRE_VERSION);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn input_roundtrip_binary() {
        let m = ClientMsg::Input {
            client_tick: 12345,
            up: true,
            down: false,
            left: false,
            right: true,
            aim_x: 800.0,
            aim_y: 450.0,
            weapon: 0,
            fire: false,
        };
        let bytes = encode(&m).unwrap();
        let back: ClientMsg = decode(&bytes).unwrap();
        match back {
            ClientMsg::Input {
                client_tick,
                up,
                right,
                ..
            } => {
                assert_eq!(client_tick, 12345);
                assert!(up && right);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn snapshot_roundtrip_binary() {
        let m = ServerMsg::Snapshot {
            tick: 1000,
            acked_input_tick: 998,
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
        let bytes = encode(&m).unwrap();
        let back: ServerMsg = decode(&bytes).unwrap();
        match back {
            ServerMsg::Snapshot {
                tick,
                acked_input_tick,
                ships,
            } => {
                assert_eq!(tick, 1000);
                assert_eq!(acked_input_tick, 998);
                assert_eq!(ships.len(), 2);
                assert_eq!(ships[0].player_id, 1);
            }
            _ => panic!("wrong variant"),
        }
    }

    /// Pin the snapshot byte size so wire-volume regressions are caught.
    /// At Phase 2 (4 ships × 24 bytes per ship + 4 + 4 + 8 = ~108 bytes)
    /// any change pushing this past ~150 bytes deserves a comment.
    #[test]
    fn snapshot_size_floor_check() {
        let m = ServerMsg::Snapshot {
            tick: 0,
            acked_input_tick: 0,
            ships: vec![
                SnapshotShip {
                    player_id: 1,
                    x: 0.0,
                    y: 0.0,
                    vx: 0.0,
                    vy: 0.0,
                    angle: 0.0,
                    ..Default::default()
                },
                SnapshotShip {
                    player_id: 2,
                    x: 0.0,
                    y: 0.0,
                    vx: 0.0,
                    vy: 0.0,
                    angle: 0.0,
                    ..Default::default()
                },
                SnapshotShip {
                    player_id: 3,
                    x: 0.0,
                    y: 0.0,
                    vx: 0.0,
                    vy: 0.0,
                    angle: 0.0,
                    ..Default::default()
                },
                SnapshotShip {
                    player_id: 4,
                    x: 0.0,
                    y: 0.0,
                    vx: 0.0,
                    vy: 0.0,
                    angle: 0.0,
                    ..Default::default()
                },
            ],
        };
        let bytes = encode(&m).unwrap();
        // WIRE_VERSION 6 — SnapshotShip carries hp + max_hp + shield +
        // max_shield (4 × 8 = 32 B), spare_tanks (1 B), weapon_kind (1 B),
        // downed (1 B). That's 35 extra bytes per ship vs the Phase 3
        // shape. 4 ships at WIRE_VERSION 6 = ~336 bytes total. Threshold
        // raised to 500 to keep room for Phase 4+ growth without thrash.
        assert!(
            bytes.len() < 500,
            "snapshot grew unexpectedly: {} bytes",
            bytes.len()
        );
    }

    /// Cross-format invariant: bincode and serde_json decode the SAME
    /// in-memory value. Lets the JS-side test fixture share goldens.
    #[test]
    fn welcome_cross_format_invariant() {
        let m = ServerMsg::Welcome {
            player_id: 42,
            server_tick: 1234,
            spawn_x: 960.0,
            spawn_y: 540.0,
            rng_seed: 0x1234_5678_9ABC_DEF0,
        };
        let bin = encode(&m).unwrap();
        let json = serde_json::to_string(&m).unwrap();
        let from_bin: ServerMsg = decode(&bin).unwrap();
        let from_json: ServerMsg = serde_json::from_str(&json).unwrap();
        // Compare via debug-printed forms; PartialEq isn't derived.
        assert_eq!(format!("{:?}", from_bin), format!("{:?}", from_json));
    }
}
