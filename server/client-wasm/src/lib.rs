//! # rainboids-client-wasm
//!
//! WebAssembly bindings that expose the shared `rainboids_sim` crate
//! to the browser. Consumed by the Rainboids multiplayer client at
//! `/mp` (see `js/mp/mp-main.js` and `js/mp/mp-engine.js`), which
//! loads the wasm-pack output from `js/mp/wasm/` and drives the
//! simulation tick from JS.
//!
//! Phase 0 of the WASM pivot only ships smoke functions: just enough
//! surface for the browser to verify the module loaded and that calls
//! round-trip cleanly. The actual `rainboids_sim` integration
//! (`simulate_tick`, state accessors over linear memory, packed-input
//! ingest) arrives in Phase 1. The `rainboids-sim` dependency is
//! declared here in Phase 0 so the workspace edge exists, but nothing
//! from the sim crate is imported yet.

use wasm_bindgen::prelude::*;

/// Smoke test entry point: returns the constant `42` so the browser
/// can confirm the WASM module loaded and a call round-tripped
/// through wasm-bindgen successfully.
#[wasm_bindgen]
pub fn smoke_test() -> u32 {
    42
}

/// Static build identifier, surfaced to the browser console for
/// debugging which `rainboids-client-wasm` build is loaded.
#[wasm_bindgen]
pub fn build_info() -> String {
    String::from("rainboids-client-wasm 0.1.0 (Phase 0 stub)")
}
