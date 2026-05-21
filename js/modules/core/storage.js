// Lightweight localStorage helpers for Rainboids persistence (5.79.0).
//
// Two namespaces live here:
//   1. Settings   — user preferences that survive across runs (volumes,
//      assists). Read/written eagerly; never destructive.
//   2. Game save  — a serialized run snapshot, taken at the start of each
//      wave. The title screen's Continue button reads this; New Game
//      clears it.
//
// All access is wrapped in try/catch — localStorage may be unavailable
// (private mode, disabled by user) and the game must keep running.

const SETTINGS_KEY = 'rainboidsSettings';
const SAVE_KEY = 'rainboidsSave';

// Bumped any time the save schema changes incompatibly so older saves
// can be detected and ignored instead of crashing the game.
const SAVE_SCHEMA = 1;

// ── Settings (volumes, etc.) ───────────────────────────────────────────

export function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
}

export function saveSettings(patch) {
    try {
        const current = loadSettings();
        const merged = { ...current, ...patch };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
        return merged;
    } catch { return null; }
}

// ── Run save (wave-start checkpoint) ───────────────────────────────────

export function hasSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!parsed && parsed.schema === SAVE_SCHEMA && typeof parsed.wave === 'number';
    } catch { return false; }
}

export function loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schema !== SAVE_SCHEMA) return null;
        return parsed;
    } catch { return null; }
}

export function writeSave(snapshot) {
    try {
        const payload = { ...snapshot, schema: SAVE_SCHEMA, savedAt: Date.now() };
        localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
        return payload;
    } catch { return null; }
}

export function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
}

// ── Meta progression (6.35.0) ──────────────────────────────────────────
// Persistent account-level progression that survives across runs (the
// "keep coming back" hook): player level, total XP toward the next
// level, unspent SP, and per-stat SP allocations. NOT cleared by New
// Game — only an explicit reset would wipe it.
const META_KEY = 'rainboidsMeta';

export function loadMeta() {
    try {
        const raw = localStorage.getItem(META_KEY);
        if (!raw) return null;
        const m = JSON.parse(raw);
        return (m && typeof m === 'object') ? m : null;
    } catch { return null; }
}

// Merge-write so partial updates don't clobber other meta fields — the
// level/XP/SP path (saveMetaState) and the persistent-profile path
// (money / upgrades / gear) both write into the same `rainboidsMeta`.
export function saveMeta(patch) {
    try {
        const cur = loadMeta() || {};
        localStorage.setItem(META_KEY, JSON.stringify({ ...cur, ...patch }));
    } catch {}
}
