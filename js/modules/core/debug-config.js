// Debug / developer mode (6.x) — a single shared debug-state module that
// feeds three surfaces: a persisted `?debug=1` flag, a `window.dbg` console
// API, and the `?`-key overlay (ui/debug-menu.js). Everything dev-only routes
// through here so nothing drifts.
//
// Enable: load with `?debug=1` (persists to localStorage so reloads keep it).
// Disable: `?debug=0` (clears the flag). In normal play this module is inert —
// `isDebugMode()` is false and the `?` overlay never mounts.

const DEBUG_FLAG_KEY = 'rainboidsDebug';

function _resolveEnabled() {
    if (typeof window === 'undefined') return false;
    let urlVal = null;
    try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.has('debug')) {
            const v = (params.get('debug') || '').toLowerCase();
            urlVal = (v === '1' || v === 'true' || v === 'on' || v === 'yes');
        }
    } catch (_) { /* ignore */ }
    // A URL param flips the PERSISTED flag so the dev doesn't have to re-add
    // `?debug=1` on every reload (and `?debug=0` turns it back off).
    try {
        if (urlVal === true) localStorage.setItem(DEBUG_FLAG_KEY, '1');
        else if (urlVal === false) localStorage.removeItem(DEBUG_FLAG_KEY);
    } catch (_) { /* ignore */ }
    if (urlVal !== null) return urlVal;
    try { return localStorage.getItem(DEBUG_FLAG_KEY) === '1'; } catch (_) { return false; }
}

let _enabled = _resolveEnabled();

/** True when developer/debug mode is active (the `?` overlay + window.dbg). */
export function isDebugMode() { return _enabled; }

/** Force debug mode on/off and persist the choice. */
export function setDebugMode(on) {
    _enabled = !!on;
    try {
        if (_enabled) localStorage.setItem(DEBUG_FLAG_KEY, '1');
        else localStorage.removeItem(DEBUG_FLAG_KEY);
    } catch (_) { /* ignore */ }
}

// Live debug toggles. Consumed across the codebase ONLY behind isDebugMode()
// checks, so a normal build can never read a "true" here (the overlay that
// flips them never mounts). Defaults are all-off / safe.
export const debugState = {
    // Unlock-all groups (consumed by armory.getUnlockedSet via injected
    // resolver — see game-engine wiring). Non-destructive: real purchases are
    // untouched; toggling off reverts to the player's true ownership.
    unlockAllWeapons: false,   // primaries + powers + attunements
    unlockAllAbilities: false, // abilities + ability attunements
    unlockAllPassives: false,  // passives

    // Weapon-selection radials. Default OFF — F/E do nothing in normal play
    // (the radials are a dev affordance now). event-setup.js reads these.
    primaryRadial: false,
    powerRadial: false,

    // Combat cheats (replace the removed always-on console cheats).
    godMode: false,        // player takes no damage (lifecycle.takeDamage)
    instakill: false,      // mirrors gameEngine.cheats.onePunchMan
    infiniteEnergy: false, // power-weapon energy stays topped off (player.update)

    // Show the hidden pre-run bubble tree (shop-dom). Off = the compact
    // list selector; on = the old orbiting visualization, for previewing.
    showBubbleTree: false,
};

/**
 * Whether a debug "unlock all" currently covers the given unlock category.
 * Maps the fine-grained armory categories onto the three coarse checkboxes.
 */
export function debugUnlockAllFor(category) {
    switch (category) {
        case 'primaries':
        case 'powers':
        case 'attunements':
        case 'mods':
            return debugState.unlockAllWeapons;
        case 'abilities':
        case 'abilityAttunements':
            return debugState.unlockAllAbilities;
        case 'passives':
            return debugState.unlockAllPassives;
        default:
            return false;
    }
}
