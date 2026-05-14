// Haptic feedback — thin wrapper around the Web Vibration API for mobile
// gameplay events (hits, kills, level-ups, game-over). Phase 1 ships the
// module + tests only; gameplay integration lands in a follow-up PR.
//
// Design notes:
// - We always gate on isMobile() first. Desktop browsers may technically
//   implement navigator.vibrate (Chrome on Linux historically did), but we
//   don't want shake-the-laptop feedback on a desktop session.
// - We treat the Vibration API as best-effort. iOS Safari has never
//   implemented it, and some Android WebViews will throw on certain
//   pattern shapes (negative values, oversized arrays). All API calls go
//   through a try/catch so a thrown error becomes a `false` return.
// - vibrate(0) is the documented way to cancel an ongoing vibration; we
//   expose that as cancelVibrate() for readability at call sites.

import { isMobile } from './platform-detect.js';

/**
 * Predefined haptic patterns matching common game events. Callers pass
 * these directly to vibrate(); see the constants for the intended use.
 *
 * Durations are in milliseconds. Arrays follow the Web Vibration API
 * convention of alternating vibrate / pause / vibrate / pause / ...
 */
export const HAPTIC = {
    LIGHT: 10,            // brief tick (UI tap, projectile fire)
    MEDIUM: 25,           // hit confirmation (enemy struck)
    HEAVY: 50,            // explosion / kill
    DOUBLE: [15, 30, 15], // achievement / level up
    LONG: 100,            // game over
};

/**
 * Internal: returns true iff the Vibration API is wired up on this
 * navigator. We keep this separate from isHapticSupported() because the
 * latter also enforces the isMobile() gate; this just answers "is the
 * function callable".
 */
function _hasVibrateApi() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Check if haptic feedback is supported on the current platform.
 * Returns true if isMobile() is true AND navigator.vibrate is a function.
 *
 * This does NOT guarantee a subsequent vibrate() call will succeed — iOS
 * Safari is famously absent from the support matrix, and some Android
 * builds throw on specific pattern shapes — but it's a useful "should I
 * even try" hint for callers that want to skip work entirely on desktop.
 */
export function isHapticSupported() {
    if (!isMobile()) return false;
    return _hasVibrateApi();
}

/**
 * Vibrate the device using the Web Vibration API.
 *
 * @param {number | number[]} pattern - Either a single duration in
 *   milliseconds, or an array of alternating vibrate/pause durations.
 * @returns {boolean} true if navigator.vibrate(pattern) was invoked and
 *   did not throw; false if we bailed out (desktop, no API, or a thrown
 *   error from the underlying implementation).
 *
 * Note: a `true` return only means we successfully *called* the API. The
 * spec allows navigator.vibrate to itself return false (e.g. for an empty
 * pattern); we treat that as "we tried" and still return true, because
 * the caller's contract is "did I trigger a haptic attempt", not "did
 * the device physically buzz".
 */
export function vibrate(pattern) {
    if (!isMobile()) return false;
    if (!_hasVibrateApi()) return false;
    try {
        navigator.vibrate(pattern);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Cancel any ongoing vibration. Per the Web Vibration API spec, calling
 * navigator.vibrate(0) (or with an empty array) cancels the active
 * pattern. We use 0 because it's the most widely supported form.
 *
 * @returns {boolean} same semantics as vibrate(): true if the API call
 *   was made, false if we bailed out or it threw.
 */
export function cancelVibrate() {
    return vibrate(0);
}
