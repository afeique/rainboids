// MP audio.
//
// Triggers SFX in response to sim events (shot fired, enemy hit,
// pickup grabbed, ship destroyed, etc.). The audio FILES under
// audio/sfx/*.mp3 are shared with solo by URL — both index.html and
// mp.html fetch from the same paths — but the trigger logic here is
// fresh, driven by snapshot events rather than solo's in-process
// event bus.
//
// Per the plan doc, if solo's audio module (js/modules/audio/) turns
// out to be loosely coupled and reusable, MP MAY import it directly
// in Phase 4+. Defer that decision until the event firehose shape is
// real.
//
// Phase 1+ scope. Phase 0 stub. See:
// docs/Multiplayer WASM Pivot - 2026-05-17.md

export function init() {
    // TODO Phase 1+: load SFX library, wire event -> playSound bindings.
}
