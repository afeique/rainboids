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

After completing code changes, check whether `README.md` needs updating. The README is the public face of the project on GitHub and must stay in sync with the current game state.

**Always update README.md when:**
- New game features are added or removed (weapons, enemies, powerups, skills, game modes)
- Controls or input methods change
- The project structure changes significantly (new directories, renamed files)
- Build/dev commands change (new npm scripts, build tool changes)
- Test infrastructure changes (new test commands, new test types)
- Technical architecture changes (rendering, audio, performance systems)

**Do NOT update README.md for:**
- Internal bug fixes that don't change player-facing behavior
- Balance tuning (damage numbers, cooldown values, etc.)
- Code refactoring that doesn't change features
- Planning documents or non-code documentation changes

Keep README.md concise and accurate. When in doubt about whether a change warrants a README update, err on the side of updating — stale documentation is worse than a small extra edit.
