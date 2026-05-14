// Platform / device detection — single source of truth for "is this a
// mobile session" used across the input + Player movement gate + HUD
// subsystems. (Auto-pilot was retired in 5.94.0; the player is now
// stationary on mobile.)
//
// Detection is intentionally simple: a touch-capable device with a small
// viewport is mobile. Anything else is desktop. The `?mobile=0|1` URL
// override exists so we can force-test mobile-mode on a desktop browser
// (and force desktop mode on a mobile device that triggers the small-
// viewport branch incorrectly).
//
// All three helpers are pure functions that read the live `window` /
// `navigator` so the result tracks the device state at call time. Cache
// the answer in your own caller if you need it stable across a frame.

/**
 * Returns true if the current document is touch-capable.
 * Equivalent to "the user has a finger pointer available", not "the user
 * has no mouse" — laptops with a touchscreen will return true here.
 */
export function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    if ('ontouchstart' in window) return true;
    if (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0) return true;
    return false;
}

/**
 * Returns true if the viewport is currently in portrait orientation
 * (taller than wide). Used for the portrait-mode HUD adjustments.
 */
export function isPortrait() {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
}

// Internal cache for the URL-param override. Reading window.location.search
// every call is cheap, but we read it once at module load so a programmatic
// `history.pushState` later in the session can't accidentally flip the mode.
let _urlOverride = null; // null = not set; true / false = forced
function _readUrlOverride() {
    if (typeof window === 'undefined' || !window.location) return null;
    try {
        const params = new URLSearchParams(window.location.search || '');
        if (!params.has('mobile')) return null;
        const v = (params.get('mobile') || '').toLowerCase();
        if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
        if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
    } catch (_) {
        return null;
    }
    return null;
}
_urlOverride = _readUrlOverride();

/**
 * Returns true if the game should run in mobile mode (stationary-ship
 * tower-defense controls: tap-to-aim-and-fire, PRM/PWR HUD buttons,
 * portrait HUD adjustments — see 5.94.0).
 *
 * Order of precedence:
 *   1. `?mobile=1` URL param forces true
 *   2. `?mobile=0` URL param forces false
 *   3. Touch capability AND a small viewport (min-dimension < 900px)
 *
 * The 900px threshold matches the device-class breakpoint used by the
 * existing desktop-only gate in main.js (which uses 1024px for an
 * even stricter "definitely a phone / tablet" classification). We use
 * 900 here because mobile-mode is a richer experience than the desktop-
 * only block, so we want it to engage slightly more aggressively.
 */
export function isMobile() {
    if (_urlOverride !== null) return _urlOverride;
    if (!isTouchDevice()) return false;
    if (typeof window === 'undefined') return false;
    return Math.min(window.innerWidth || 0, window.innerHeight || 0) < 900;
}

/**
 * Test-only: reset the cached URL-param override. Used by unit tests to
 * simulate different URL params without reloading the page.
 */
export function _resetUrlOverrideForTests(value) {
    _urlOverride = value === undefined ? _readUrlOverride() : value;
}
