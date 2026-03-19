# Rainboids — Claude Code Instructions

## Semantic Versioning & Changelog (MANDATORY)

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
