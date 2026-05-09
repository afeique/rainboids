// Wire and simulation versions for the multiplayer protocol.
//
// MUST agree with `server/src/protocol/version.rs`. The Hello handshake
// closes the socket with ErrCode.Version on any mismatch.
//
// - WIRE_VERSION: bump on byte-layout changes (add/remove/reorder variants,
//   change a field type, bump bincode config).
// - SIM_VERSION: bump on simulation-rule changes that affect deterministic
//   replay (new rules, new constants, new RNG consumers).

export const WIRE_VERSION = 1;
export const SIM_VERSION = 1;

export function isCompatible(wire, sim) {
    return wire === WIRE_VERSION && sim === SIM_VERSION;
}
