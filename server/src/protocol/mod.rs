//! Wire protocol module.
//!
//! All wire types — newtypes, enums, structs, and tagged-union messages —
//! are codegen'd from `schema/protocol.toml` into `generated.rs`. This
//! module re-exports them along with the `codec` helpers and version
//! constants so callers continue to `use crate::protocol::*` exactly as
//! before.
//!
//! To add or change a variant, edit `schema/protocol.toml`, run
//! `node tools/codegen-protocol.mjs` from the project root, and commit
//! the resulting `generated.rs` diff. CI verifies this with
//! `node tools/codegen-protocol.mjs --check` so the schema and the
//! generated code can never drift in PRs.
//!
//! `version.rs` is kept as a one-liner re-export of the generated
//! constants so existing imports (`crate::protocol::version::WIRE_VERSION`)
//! still resolve.

pub mod codec;
pub mod generated;
pub mod version;

pub use codec::{decode, decode_client, encode, encode_into, encode_server};
pub use generated::*;

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
