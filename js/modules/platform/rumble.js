// Gamepad rumble — a thin wrapper around the Gamepad API's
// `vibrationActuator.playEffect('dual-rumble', …)` for controller haptics
// (GP-4), mirroring platform/haptic.js's structure for mobile vibration.
//
// Design notes:
// - Off by DEFAULT (`rainboids:rumble` !== '1'): rumble feel needs per-device
//   validation (Xbox / DualSense / Switch × Chrome / Firefox), so we don't
//   enable it until a real-device pass signs off. A GAMEPAD-tab toggle flips it.
// - Best-effort: not all browsers/pads implement vibrationActuator, and
//   playEffect can reject. Every call is wrapped so an unsupported pad is a
//   silent no-op, never a thrown error.
// - We find the active pad ourselves (first connected pad with an actuator)
//   so call sites stay one-liners: `rumble(RUMBLE.MEDIUM)`.

// Intensity presets. `weak`/`strong` are the dual-rumble motor magnitudes
// (0..1); `duration` is milliseconds.
export const RUMBLE = Object.freeze({
    LIGHT: { duration: 60, weak: 0.25, strong: 0.0 },   // ability-ready / UI
    MEDIUM: { duration: 120, weak: 0.5, strong: 0.35 }, // dash / auto-dodge
    HEAVY: { duration: 200, weak: 0.7, strong: 0.9 },   // hit / explosion
});

const STORAGE_KEY = 'rainboids:rumble';

// User preference. Default OFF; '1' = enabled. Read lazily + guarded so a
// disabled-localStorage environment (private mode, tests) keeps the default.
let _rumbleEnabled = false;
try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') {
        _rumbleEnabled = true;
    }
} catch (_) { /* localStorage unavailable — keep default off */ }

export function isRumbleEnabled() { return _rumbleEnabled; }

export function setRumbleEnabled(on) {
    _rumbleEnabled = !!on;
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch (_) { /* ignore */ }
}

// Internal: the first connected pad that exposes a vibrationActuator, or null.
function _actuatorPad() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    let pads;
    try { pads = navigator.getGamepads() || []; } catch (_) { return null; }
    for (const p of pads) {
        if (p && p.connected && p.vibrationActuator && typeof p.vibrationActuator.playEffect === 'function') {
            return p;
        }
    }
    return null;
}

/**
 * True iff rumble could fire right now (enabled AND a pad with an actuator is
 * connected). A "should I even try" hint — not a guarantee playEffect resolves.
 */
export function isRumbleSupported() {
    return _rumbleEnabled && _actuatorPad() !== null;
}

/**
 * Play a rumble effect. Accepts a RUMBLE preset (or a compatible
 * {duration, weak, strong} object). No-ops — returning false — when rumble is
 * disabled, no actuator pad is connected, or the API rejects/throws.
 *
 * @returns {boolean} true if playEffect was invoked without throwing.
 */
export function rumble(preset = RUMBLE.MEDIUM) {
    if (!_rumbleEnabled) return false;
    const pad = _actuatorPad();
    if (!pad) return false;
    const p = preset || RUMBLE.MEDIUM;
    try {
        pad.vibrationActuator.playEffect('dual-rumble', {
            duration: p.duration || 0,
            weakMagnitude: Math.max(0, Math.min(1, p.weak || 0)),
            strongMagnitude: Math.max(0, Math.min(1, p.strong || 0)),
        });
        return true;
    } catch (_) {
        return false;
    }
}
