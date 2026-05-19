//! Wire-protocol module.
//!
//! `types::*` is the source of truth for client ↔ server messages,
//! snapshot payloads, and event envelopes. `codec` provides bincode
//! encode/decode helpers; `ids` defines the strongly-typed entity
//! newtypes (`PlayerId`, `BulletId`, …).

pub mod codec;
pub mod ids;
pub mod types;
pub mod version;

pub use codec::{decode, decode_client, encode, encode_into, encode_server};
pub use ids::{AsteroidId, BulletId, DropId, EnemyId, PlayerId, RoomId};
pub use types::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_round_trips() {
        let msg = ClientMsg::Hello {
            wire_version: WIRE_VERSION,
            sim_version: SIM_VERSION,
            client_version: "5.79.62".into(),
            display_name: "Pilot".into(),
            session: None,
        };
        let bytes = encode(&msg).unwrap();
        let back: ClientMsg = decode(&bytes).unwrap();
        match back {
            ClientMsg::Hello { wire_version, .. } => assert_eq!(wire_version, WIRE_VERSION),
            _ => panic!("wrong variant"),
        }
    }
}
