// Screen wake lock — thin wrapper around the Screen Wake Lock API
// (navigator.wakeLock) to keep mobile devices from dimming or sleeping
// during gameplay. Phase 1 ships the module + tests only; gameplay
// integration (calling requestWakeLock() when a run starts and
// releaseWakeLock() when the player returns to the menu) lands in a
// follow-up PR.
//
// Design notes:
// - We gate on isMobile() first. Desktop browsers usually have stable
//   power policies and we don't want to suppress monitor sleep during a
//   long pause. Calls from a desktop context no-op and return false.
// - The Wake Lock API is asynchronous: navigator.wakeLock.request('screen')
//   returns a Promise that resolves to a sentinel object with .release()
//   and a 'released' event. Some browsers reject the request (e.g. low
//   battery, system policy), so every acquisition goes through try/catch.
// - The browser itself releases wake locks aggressively. The two cases
//   we care about are:
//     1. Tab hidden (visibilitychange → 'hidden') — browser releases.
//     2. User toggles back to the tab — we want to silently re-acquire
//        if we were holding a lock before the tab was hidden.
//   We track an internal "should have a lock" flag separately from the
//   live sentinel so the auto-reacquire handler knows when to fire.
// - Browser support (as of 2026): Chromium-based browsers and Safari
//   16.4+ on iOS / macOS implement Screen Wake Lock. Firefox desktop
//   does NOT (Firefox Android does). All callers must tolerate a `false`
//   return without further side effects.

import { isMobile } from './platform-detect.js';

// The currently held sentinel object, or null if none. Set when a request
// succeeds; cleared on release() or on the sentinel's 'released' event
// (which fires when the browser releases the lock independently of us,
// e.g. on tab hide).
let _currentLock = null;

// True iff the caller has expressed intent to hold a lock (the most
// recent requestWakeLock() succeeded and there has been no matching
// releaseWakeLock() call). This is independent of _currentLock — when
// the browser auto-releases on tab hide, _currentLock goes null but
// _shouldHoldLock stays true so the visibilitychange handler knows to
// re-request.
let _shouldHoldLock = false;

/**
 * Internal: returns true iff the Screen Wake Lock API is wired up on
 * this navigator. Kept separate from isWakeLockSupported() so the latter
 * can stay a pure "should I even try" hint without becoming a place
 * where additional gates accumulate over time.
 */
function _hasWakeLockApi() {
    if (typeof navigator === 'undefined') return false;
    if (!navigator.wakeLock) return false;
    return typeof navigator.wakeLock.request === 'function';
}

/**
 * Check if the Screen Wake Lock API is available on this platform,
 * independent of isMobile(). Useful for diagnostics and for callers
 * that want to advertise capability before any user gesture.
 *
 * Note: capability !== "the next request will succeed". Browsers can
 * still reject under load, low-battery, or policy reasons. This is a
 * pre-check, not a guarantee.
 */
export function isWakeLockSupported() {
    return _hasWakeLockApi();
}

/**
 * Returns true iff a wake lock is currently held (i.e. we have a live
 * sentinel that the browser has not released). This tracks the actual
 * lock state, not the intent flag — if the tab is hidden and the browser
 * auto-releases, this returns false even though we'll try to reacquire
 * on visibility return.
 */
export function isWakeLockHeld() {
    return _currentLock !== null;
}

/**
 * Request a screen wake lock to prevent the device from dimming / sleeping.
 *
 * Behavior:
 * - No-ops on desktop (isMobile() false) → returns false.
 * - No-ops if navigator.wakeLock is unavailable → returns false.
 * - On a successful acquisition, stores the sentinel internally and
 *   returns true.
 * - Idempotent: if a lock is already held, returns true without
 *   re-requesting (the existing sentinel stays live).
 * - If navigator.wakeLock.request() rejects or throws (some browsers
 *   throw on low battery), returns false and leaves internal state
 *   untouched.
 *
 * @returns {Promise<boolean>} true if a lock is now held, false otherwise.
 */
export async function requestWakeLock() {
    if (!isMobile()) return false;
    if (!_hasWakeLockApi()) return false;
    // Idempotent: if we already hold a lock, the caller's intent is met.
    // Re-record the "should hold" flag in case it was cleared by a
    // previous release; this keeps the auto-reacquire path consistent.
    if (_currentLock !== null) {
        _shouldHoldLock = true;
        return true;
    }
    try {
        const sentinel = await navigator.wakeLock.request('screen');
        _currentLock = sentinel;
        _shouldHoldLock = true;
        // The browser may release the lock on its own (tab hidden, etc.).
        // When that happens the sentinel fires a 'released' event; we
        // clear our reference so isWakeLockHeld() reflects reality. We
        // intentionally do NOT clear _shouldHoldLock here — that's how
        // the visibility handler knows to reacquire on return.
        if (sentinel && typeof sentinel.addEventListener === 'function') {
            sentinel.addEventListener('release', () => {
                if (_currentLock === sentinel) {
                    _currentLock = null;
                }
            });
        }
        return true;
    } catch (_) {
        // Acquisition failed; some browsers throw synchronously here
        // when the request is denied. Leave the intent flag alone so a
        // later retry from the caller still works.
        return false;
    }
}

/**
 * Release the current screen wake lock, if any.
 *
 * Behavior:
 * - No-ops if no lock is held → returns false.
 * - Calls sentinel.release(), clears internal state, and returns true.
 * - Also clears the "should hold" intent flag so the auto-reacquire
 *   handler will not refire on the next visibilitychange.
 * - If sentinel.release() throws (rare; some early implementations
 *   threw on double-release), state is cleared anyway and we return
 *   true — the caller's intent is "release", and a thrown release is
 *   effectively still released.
 *
 * @returns {Promise<boolean>} true if a release was attempted, false
 *   if no lock was held to begin with.
 */
export async function releaseWakeLock() {
    if (_currentLock === null) {
        // Still clear the intent flag in case it drifted; a no-op
        // release should leave the world in a consistent "no lock,
        // no intent" state.
        _shouldHoldLock = false;
        return false;
    }
    const sentinel = _currentLock;
    _currentLock = null;
    _shouldHoldLock = false;
    try {
        if (sentinel && typeof sentinel.release === 'function') {
            await sentinel.release();
        }
    } catch (_) {
        // Ignore; state is already cleared.
    }
    return true;
}

/**
 * Attach a visibilitychange handler that re-acquires the wake lock when
 * the document becomes visible again. The browser releases wake locks
 * automatically when the tab is hidden, so without this handler the
 * lock would silently die the first time the user task-switches.
 *
 * Behavior:
 * - Only re-requests if _shouldHoldLock is true (i.e. the caller most
 *   recently expressed intent to hold a lock, and has not since called
 *   releaseWakeLock()).
 * - Safe to call once at init; the handler stays installed for the
 *   document's lifetime.
 *
 * @param {{document?: Document}} [opts] - Inject a document for tests.
 *   Defaults to window.document.
 */
export function attachAutoReacquireHandler({ document = (typeof window !== 'undefined' ? window.document : undefined) } = {}) {
    if (!document || typeof document.addEventListener !== 'function') return;
    document.addEventListener('visibilitychange', () => {
        // Only reacquire on return to foreground, and only if the
        // caller still wants a lock. We don't re-check isMobile() here
        // because the original request already did, and a desktop
        // browser wouldn't have set _shouldHoldLock in the first place.
        if (document.visibilityState !== 'visible') return;
        if (!_shouldHoldLock) return;
        if (_currentLock !== null) return; // already reacquired
        // Fire-and-forget; the promise resolution doesn't matter here.
        // requestWakeLock() handles its own errors internally.
        requestWakeLock();
    });
}

/**
 * Test-only: reset the internal state. Used by unit tests to start each
 * case from a known baseline without ESM module-cache gymnastics.
 */
export function _resetForTests() {
    _currentLock = null;
    _shouldHoldLock = false;
}
