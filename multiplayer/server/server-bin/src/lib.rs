//! Rainboids authoritative multiplayer server — library facade.
//!
//! The binary entry point lives in `main.rs`; this `lib.rs` re-exports
//! the same internal modules so integration tests (or external tooling)
//! can drive the room actor without going through the signal-handling
//! main loop.
//!
//! Wire-protocol and simulation types live in the workspace-sibling
//! `rainboids-sim` crate. Re-exported here as `protocol` and `sim` for
//! consumer convenience.

pub mod config;
pub mod error;
pub mod connection;
pub mod room;
pub mod obs;
pub mod server;

pub use rainboids_sim as sim;
pub use rainboids_sim::protocol;
