// Entry point for Rainboids Multiplayer (WASM-pivot architecture).
//
// Phase-1 responsibilities (replaces the Phase-0 smoke harness):
//   - Dynamically import the wasm-pack glue at ./wasm/rainboids_client_wasm.js
//   - Await the default init() so the wasm-bindgen exports become callable
//   - Hand the `World` class to mp-engine.start(), which owns the RAF loop
//   - Keep the friendly "run `npm run wasm:build` first" overlay on import
//     failure so a fresh checkout doesn't confuse anyone
//   - Log smoke_test() + build_info() to the devtools console exactly once
//     on boot, so even an engine bug still proves the WASM boundary works
//
// See: docs/Multiplayer WASM Pivot - 2026-05-17.md, "Phase 1 - WASM
// round-trip" for the canonical spec.

import { start } from "./mp-engine.js";

const overlay = document.getElementById("mp-debug");
const canvas = document.getElementById("mp-canvas");

const log = (line) => {
    if (!overlay) return;
    overlay.textContent += (overlay.textContent ? "\n" : "") + line;
};

// Full-bleed canvas. mp.html already sets CSS width/height to the
// viewport; we mirror that into the canvas backing-store so the 2D
// context paints at native resolution. Re-fit on resize so a window
// drag doesn't blur the field.
const resizeCanvas = () => {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
};
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

log("Rainboids MP - Phase 1");
log("Loading WASM module...");

try {
    const wasm = await import("./wasm/rainboids_client_wasm.js");

    // wasm-pack --target web emits a default export that must be
    // awaited before any other export is callable. It fetches and
    // instantiates the .wasm binary alongside the glue file.
    if (typeof wasm.default === "function") {
        await wasm.default();
    }

    // Boot-time sanity log. Lives in console (not the overlay) so it
    // doesn't compete with the engine's per-frame stats; if the engine
    // explodes, this still proves the WASM boundary itself is alive.
    const smoke = typeof wasm.smoke_test === "function" ? wasm.smoke_test() : "(missing)";
    const build = typeof wasm.build_info === "function" ? wasm.build_info() : "(missing)";
    console.log(`[mp-main] smoke_test() = ${smoke}`);
    console.log(`[mp-main] build_info() = ${build}`);

    if (typeof wasm.World !== "function") {
        log("WASM loaded but World export missing - rebuild required.");
    } else if (!canvas) {
        log("Canvas #mp-canvas missing from DOM - check mp.html.");
    } else {
        // Engine takes over the overlay from here.
        if (overlay) overlay.textContent = "";
        start(wasm.World, overlay, canvas);
    }
} catch (err) {
    log("WASM not yet built - run `npm run wasm:build` first.");
    log("");
    log(`(import error: ${err && err.message ? err.message : err})`);
    log("");
    log("Once built, press Ctrl+R to reload this page.");
    console.warn("[mp-main] WASM glue failed to load:", err);
}
