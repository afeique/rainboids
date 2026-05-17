// MP engine.
//
// Drives the per-tick game loop, owns the WebSocket connection to the
// Rust server (`rainboids-server`), and calls into the WASM sim crate
// (`rainboids-client-wasm`) for local prediction. Receives authoritative
// snapshots from the server and reconciles them against the predicted
// state.
//
// Phase 1+ scope. Phase 0 ships an inert stub so mp-main.js can import
// the symbol without exploding. See:
// docs/Multiplayer WASM Pivot - 2026-05-17.md

export function init() {
    // TODO Phase 1: load wasm module, open WS, drive tick loop.
}
