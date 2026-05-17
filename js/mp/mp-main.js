// Entry point for Rainboids Multiplayer (WASM-pivot architecture).
//
// Phase 0 responsibilities:
//   - Dynamically load the wasm-pack glue at ./wasm/rainboids_client_wasm.js
//     (produced by `wasm-pack build server/client-wasm --target web
//      --out-dir ../../js/mp/wasm`).
//   - Call the default-init function (required by wasm-pack `--target web`
//     output before any exports can be invoked).
//   - Call smoke_test() and build_info() and render the results to the
//     #mp-debug overlay so a human can verify the JS<->WASM round-trip.
//
// This is a smoke harness, not real game code. The mp-engine /
// mp-renderer / mp-input / mp-particles / mp-audio / mp-hud modules
// are intentionally inert stubs for Phase 0. See:
// docs/Multiplayer WASM Pivot - 2026-05-17.md

const overlay = document.getElementById("mp-debug");

const log = (line) => {
    if (!overlay) return;
    overlay.textContent += (overlay.textContent ? "\n" : "") + line;
};

log("Rainboids MP - Phase 0 smoke harness");
log("Loading WASM module...");

try {
    const wasm = await import("./wasm/rainboids_client_wasm.js");

    // wasm-pack --target web emits a default export that must be
    // awaited before any other export is callable. It fetches and
    // instantiates the .wasm binary alongside the glue file.
    if (typeof wasm.default === "function") {
        await wasm.default();
    }

    const smoke = typeof wasm.smoke_test === "function" ? wasm.smoke_test() : "(missing)";
    const build = typeof wasm.build_info === "function" ? wasm.build_info() : "(missing)";

    log("WASM loaded.");
    log(`smoke_test() = ${smoke}`);
    log(`build_info() = ${build}`);
    log("");
    log("Rebuild with `npm run wasm:build` and press Ctrl+R to refresh.");
} catch (err) {
    log("WASM not yet built - run `npm run wasm:build` first.");
    log("");
    log(`(import error: ${err && err.message ? err.message : err})`);
    log("");
    log("Once built, press Ctrl+R to reload this page.");
    // Surface to devtools for deeper debugging without polluting the
    // visible overlay with a full stack trace.
    console.warn("[mp-main] WASM glue failed to load:", err);
}
