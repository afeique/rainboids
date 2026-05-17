// MP HUD.
//
// Heads-up display for the co-op session: own ship status, partner
// ship status, shared wave indicator, connection / partner state
// (connected, lagging, disconnected, reconnecting).
//
// Solo's HUD (js/modules/hud/, js/modules/ui/) is interleaved with the
// modular solo UI system and assumes a single local player; it is NOT
// shared with MP. MP gets this purpose-built layer that knows about
// the partner ship from day one.
//
// Phase 1+ scope. Phase 0 stub. See:
// docs/Multiplayer WASM Pivot - 2026-05-17.md

export function init() {
    // TODO Phase 1+: build HUD DOM/canvas overlay, bind to snapshot state.
}
