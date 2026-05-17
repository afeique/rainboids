# Rainboids — Claude Code Instructions

## Semantic Versioning & Changelog (MANDATORY)

Rainboids has **two parallel products** that version independently:

- **Solo** (`/`) → `VERSION` + `CHANGELOG.md` — the canonical single-player game
- **Multiplayer** (`/mp`) → `VERSION-MP` + `CHANGELOG-MP.md` — the WASM-backed co-op product (experimental)

A commit changes EITHER solo OR multiplayer, not both, unless it's a rare bridge change (e.g., a shared title-screen edit). Bridge commits bump BOTH files in the same commit.

Version bumps ONLY apply to **actual code changes** (source files, assets, configuration that affects runtime behavior). The following are NOT versionable changes and must NEVER trigger a version bump:
- Planning documents, research notes, deployment docs
- README, CLAUDE.md, or other non-code documentation
- Memory files, conversation artifacts
- Any file that has no effect on the running game

### Solo changes

After completing solo code changes (anything under `js/main.js`, `js/modules/`, `js/engine/`, `js/net/`, `css/`, `index.html`, solo-side `tests/`), you MUST:

1. **Determine the appropriate version bump** using [Semantic Versioning](https://semver.org/):
   - **MAJOR** = fundamental gameplay or architectural overhaul
   - **MINOR** = new features, systems, or significant content
   - **PATCH** = bug fixes, balance tuning, polish

2. **Update `CHANGELOG.md`** with a new entry at the top (below the header), using [Keep a Changelog](https://keepachangelog.com/) format:
   - Use only standard sections: `### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Deprecated`, `### Security`
   - Be concise but specific — describe what changed and why
   - Each bug fix, balance tweak, or polish change gets its own PATCH version
   - Do NOT lump bug fixes into MINOR feature versions

3. **Update the `VERSION` file** to match the new version number.

4. **Granularity**: Every separable change should be its own version. If you fix a bug and add a feature in the same session, that's at minimum two versions (one PATCH for the fix, one MINOR for the feature). Sequential patches on the same day are normal and expected.

### Multiplayer changes

After completing MP code changes (anything under `server/sim/`, `server/server-bin/`, `server/client-wasm/`, `js/mp/`, `mp.html`, `tests/mp-smoke/`), you MUST:

1. **Determine the appropriate version bump** using the same semver rules as solo.
2. **Update `CHANGELOG-MP.md`** with a new entry (same Keep a Changelog format).
3. **Update the `VERSION-MP` file** to match.
4. Same granularity rule: every separable change is its own version.

MP starts at `0.1.0` for the Phase 0 scaffold and stays in `0.x` while experimental. Promote to `1.0.0` only when MP is declared stable / no-longer-experimental by the user.

### Bridge commits

A commit that genuinely touches both products (e.g., adding the MULTIPLAYER button to the solo title screen, or sharing a static asset that both depend on) bumps BOTH `VERSION` and `VERSION-MP` and appends entries to BOTH changelogs. Avoid bridge commits when possible; the products are intentionally independent.

## README.md Maintenance (MANDATORY)

After completing code changes, you MUST check whether `README.md` needs updating. The README is the public face of the project on GitHub and must stay in sync with the current codebase. **Treat this as a blocking step before considering your work complete — just like updating VERSION and CHANGELOG.**

**Always update README.md when any of these are true (these OVERRIDE the "do NOT" list below):**
- New game features are added or removed (weapons, enemies, powerups, skills, game modes)
- Controls or input methods change
- **The project structure changes** (new directories, new module files, renamed/moved files, deleted files) — this includes refactors that reorganize the codebase
- Build/dev commands change (new npm scripts, build tool changes)
- Test infrastructure changes (new test commands, new test types, test count changes)
- Technical architecture changes (new systems, new patterns, rendering changes)

**Do NOT update README.md for (unless an "always" rule above also applies):**
- Internal bug fixes that don't change player-facing behavior or project structure
- Balance tuning (damage numbers, cooldown values, etc.)
- Pure logic refactors within existing files (moving code between methods, renaming private variables)
- Planning documents or non-code documentation changes

**Key clarification:** A refactor that creates new directories or files (e.g., extracting modules into `core/`, `systems/`, `rendering/`) IS a structural change and MUST be reflected in README.md's project structure section — even if the player-facing feature set is unchanged.

Keep README.md concise and accurate. When in doubt, update it — stale documentation is worse than a small extra edit.

## Directory Hygiene (MANDATORY)

The project root must stay clean. Only core game files and standard config files belong at the root level. Everything else has a designated home:

| Directory | Purpose | Examples |
|-----------|---------|---------|
| `js/` | Game source code | modules, entities, rendering, systems |
| `css/` | Stylesheets | styles.css |
| `docs/` | Planning docs, analysis, research | REFACTOR.md, SKU_deployment.md, performance analyses |
| `tools/` | Development tools and automation | benchmark/, ai-qa-bot/, scripts/, juice-capture.mjs |
| `tests/` | All test suites | unit/, qa/, e2e/, performance/, helpers/ |
| `music/` | Audio assets | MP3 tracks |
| `archive/` | Deprecated/superseded code | old benchmark runner, `sim-parity/` |
| `server/` | Rust workspace: `sim/` (shared sim), `server-bin/` (MP server), `client-wasm/` (WASM bindings) | Cargo workspace; runs natively + targets WASM |
| `schema/` | Cross-language wire-protocol schema (codegen source) | `protocol.toml` |

**Rules:**
- **New planning/analysis documents** → `docs/`, never the project root
- **New development tools, scripts, or automation** → `tools/`, never the project root
- **New test files** → appropriate subdirectory under `tests/`
- **Do NOT create new top-level directories** without explicit user approval — use the existing structure
- **Do NOT leave generated artifacts, scratch files, or analysis outputs** in the project root
- When creating new files, always check if an existing directory is the right home before defaulting to the root
