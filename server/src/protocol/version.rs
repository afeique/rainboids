//! Wire and simulation versions. Bumped together when breaking client compat.

pub const WIRE_VERSION: u16 = 1;
pub const SIM_VERSION: u16 = 1;

pub fn is_compatible(wire: u16, sim: u16) -> bool {
    wire == WIRE_VERSION && sim == SIM_VERSION
}
