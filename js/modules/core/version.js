// Game versions, bumped alongside the root VERSION + VERSION-MP files.
// Used by the title screen to render small build tags in the bottom-
// right corner. Keep this module dependency-free so any consumer can
// import it.
//
// 5.105.0 — Version drifted (was 5.100.3 while the build was at 5.104.0).
// Now kept in sync with /VERSION on every release; see the bump section
// in CLAUDE.md.
//
// 2026-05-17 (WASM pivot, Phase 0) — VERSION_MP added. MP is now a
// separate product (`/mp`) that versions independently of solo. The
// title screen shows both as `sp X.X.X` / `mp 0.X.X`. Keep VERSION_MP
// in sync with the root /VERSION-MP file on every MP release.
export const VERSION = '6.13.2';
export const VERSION_MP = '0.8.0';
