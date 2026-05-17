pub mod time;

// Entity IDs live in the sim crate (they're used by the codegen'd wire
// types). Re-exported here so existing `use crate::util::id::*` paths
// inside server-bin keep resolving.
pub use rainboids_sim::util::id;
