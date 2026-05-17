//! Wire and simulation versions.
//!
//! These constants now live in `generated.rs` (codegen'd from
//! `schema/protocol.toml`); this module re-exports them so existing
//! `crate::protocol::version::WIRE_VERSION` imports resolve.

pub use super::generated::{is_compatible, SIM_VERSION, WIRE_VERSION};
