# Rainboids — Claude Code Instructions

## Semantic Versioning & Changelog (MANDATORY)

Version bumps ONLY apply to **actual code changes** (source files, assets, configuration that affects runtime behavior). The following are NOT versionable changes and must NEVER trigger a version bump:
- Planning documents, research notes, deployment docs
- README, CLAUDE.md, or other non-code documentation
- Memory files, conversation artifacts
- Any file that has no effect on the running game

After completing any code changes in this project, you MUST:

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
