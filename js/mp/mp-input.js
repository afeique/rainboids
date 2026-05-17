// MP input.
//
// Captures keyboard / mouse / touch input, packs it into the wire
// format defined by schema/protocol.toml (PackedInput), and dispatches
// it to mp-engine for both local prediction (fed into the WASM sim)
// and network transmission (sent to the Rust server).
//
// Phase 1+ scope. Phase 0 stub. See:
// docs/Multiplayer WASM Pivot - 2026-05-17.md

export function init() {
    // TODO Phase 1: attach event listeners, build PackedInput frames.
}
