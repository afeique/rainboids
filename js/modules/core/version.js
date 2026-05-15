// Game version, bumped alongside the root /VERSION file. Used by the
// title screen to render a small build tag in the bottom-right corner.
// Keep this module dependency-free so any consumer can import it.
//
// 5.105.0 — Version drifted (was 5.100.3 while the build was at 5.104.0).
// Now kept in sync with /VERSION on every release; see the bump section
// in CLAUDE.md.
export const VERSION = '5.112.0';
