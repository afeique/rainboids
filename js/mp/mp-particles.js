// MP particles.
//
// Consumes cosmetic events emitted by the WASM sim (HitFlash,
// DamageNumber, EnemyDestroy { fx_color }, etc.) and renders the
// corresponding particle effects. Events arrive via the snapshot
// channel rather than being computed locally so all clients see
// identical effects at the same logical tick.
//
// Per the plan doc, this is a fresh implementation; solo's particle
// system (js/modules/effects/particles/) is mature and tied to solo's
// entity pools and is NOT shared with MP.
//
// Phase 1+ scope. Phase 0 stub. See:
// docs/Multiplayer WASM Pivot - 2026-05-17.md

export function init() {
    // TODO Phase 1+: subscribe to sim events, allocate particle pools.
}
