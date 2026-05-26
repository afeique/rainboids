// Game versions, bumped alongside the root VERSION + VERSION-MP files.
// Used by the title screen to render small build tags in the bottom-
// right corner. Keep this module dependency-free so any consumer can
// import it.
//
// 5.105.0 — Version drifted (was 5.100.3 while the build was at 5.104.0).
// Now kept in sync with /VERSION on every release; see the bump section
// in CLAUDE.md.
//
// 2026-05-19 — Multiplayer shelved (see /multiplayer/RESTORE.md). The
// title screen now renders a single gold version tag (no sp/mp prefix);
// VERSION is the only one displayed.
export const VERSION = '6.213.0';
// VERSION_MP retained (unused while multiplayer is shelved — see
// /multiplayer/RESTORE.md) so restoring MP doesn't need to re-add it.
export const VERSION_MP = '0.12.1';
