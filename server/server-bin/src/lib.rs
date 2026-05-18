//! Rainboids authoritative multiplayer server — library facade.
//!
//! The binary entry point lives in `main.rs`; this `lib.rs` re-exports
//! the same internal modules so that integration tests under `tests/`
//! can drive the matchmaker and room actor without going through the
//! signal-handling main loop.
//!
//! Wire-protocol and simulation types live in the workspace-sibling
//! `rainboids-sim` crate. Re-exported here as `protocol` and `sim` so
//! existing tests written against the old single-crate layout (which
//! had `crate::protocol::*` and `crate::sim::*`) keep working. New code
//! should prefer `rainboids_sim::*` directly.

pub mod config;
pub mod error;
pub mod matchmaking;
pub mod mp1_connection;
pub mod mp1_room;
pub mod obs;
pub mod room;
pub mod server;
pub mod util;

// Back-compat re-exports so test code and any other consumer that wrote
// `use rainboids_server::protocol::*` / `use rainboids_server::sim::*`
// continues to compile.
pub use rainboids_sim as sim;
pub use rainboids_sim::protocol;
