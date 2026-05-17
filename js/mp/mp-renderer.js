// MP renderer.
//
// Thin canvas/WebGL renderer that consumes snapshot state from WASM
// linear memory (typed-array views over `wasm.memory.buffer`, no
// per-call copies). Renders ships, enemies, bullets, asteroids from
// the data the sim hands us.
//
// Solo's renderer (js/modules/render/, js/modules/effects/, etc.) is
// NOT shared. Per the plan doc ("Asset and shared-layer decisions"),
// solo's render path is tightly coupled to its entity classes; MP gets
// a fresh, purpose-built renderer that reads from snapshot deltas.
//
// Phase 1+ scope. Phase 0 stub. See:
// docs/Multiplayer WASM Pivot - 2026-05-17.md

export function init() {
    // TODO Phase 1: acquire canvas context, build draw pipeline.
}
