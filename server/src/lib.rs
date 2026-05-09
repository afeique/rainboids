//! Rainboids authoritative multiplayer server — library facade.
//!
//! The binary entry point lives in `main.rs`; this `lib.rs` re-exports the
//! same internal modules so that integration tests under `tests/` can drive
//! the protocol, matchmaker, and room actor without going through the
//! signal-handling main loop.

pub mod config;
pub mod error;
pub mod matchmaking;
pub mod obs;
pub mod protocol;
pub mod room;
pub mod server;
pub mod sim;
pub mod util;
