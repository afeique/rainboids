// Lightweight contextual-hint system. One hint visible at a time,
// auto-dismissed after a duration, persisted per hint-id so each
// hint shows at most once per player (across sessions). Trust the
// caller's text — hints are author-provided strings, not user input,
// so they may include simple HTML like <strong> for key glyphs.

const PERSIST_KEY = 'rainboids:hints-shown:v1';

let overlayEl = null;
let textEl = null;
let hideTimer = null;
let visible = false;

function loadPersisted() {
    try {
        return new Set(JSON.parse(localStorage.getItem(PERSIST_KEY) || '[]'));
    } catch {
        return new Set();
    }
}

function savePersisted(set) {
    try {
        localStorage.setItem(PERSIST_KEY, JSON.stringify([...set]));
    } catch { /* localStorage may be disabled — fall through */ }
}

function ensureElements() {
    if (overlayEl) return;
    overlayEl = document.getElementById('hint-overlay');
    if (overlayEl) {
        textEl = overlayEl.querySelector('.hint-text');
    }
}

/**
 * Display a hint. By default shows each `id` at most once per browser
 * (via localStorage). Pass `{ once: false }` to bypass that.
 *
 * @param {string} id   Stable identifier for persistence + dedup
 * @param {string} text Hint text — may contain simple HTML
 * @param {number} durationMs How long to display before auto-hiding
 * @param {object} opts  { once: boolean }
 * @returns {boolean} true if shown, false if suppressed (already seen)
 */
export function showHint(id, text, durationMs = 6000, opts = {}) {
    ensureElements();
    if (!overlayEl || !textEl) return false;

    const once = opts.once !== false;
    if (once) {
        const persisted = loadPersisted();
        if (persisted.has(id)) return false;
        persisted.add(id);
        savePersisted(persisted);
    }

    textEl.innerHTML = text;
    overlayEl.style.display = 'flex';
    // Force a frame so the transition kicks in.
    requestAnimationFrame(() => overlayEl.classList.add('visible'));
    visible = true;

    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideHint, durationMs);
    return true;
}

export function hideHint() {
    ensureElements();
    if (!overlayEl) return;
    overlayEl.classList.remove('visible');
    visible = false;
    clearTimeout(hideTimer);
    setTimeout(() => {
        if (!visible) overlayEl.style.display = 'none';
    }, 300);
}

// For testing / dev — clears persisted state so hints re-fire.
export function resetHints() {
    try { localStorage.removeItem(PERSIST_KEY); } catch {}
}

/**
 * Per-frame check: dim the hint overlay if the player ship or the mouse
 * cursor is overlapping its bounding rect. Keeps tooltips out of the
 * way when they're parked over gameplay action without forcing them to
 * dismiss entirely. Add the `.dimmed` class to the overlay when either
 * condition is true; CSS handles the alpha transition.
 *
 * Coordinates are SCREEN space (canvas pixels relative to the viewport
 * top-left), since the overlay uses `position: fixed`. Padding adds a
 * small buffer so the dim kicks in just before overlap is exact.
 */
export function updateHintDimming(playerScreenX, playerScreenY, playerRadius, mouseScreenX, mouseScreenY) {
    ensureElements();
    if (!overlayEl || !visible) return;
    const rect = overlayEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const PAD = 24;          // generous fade buffer outside the visible box
    const left   = rect.left   - PAD;
    const right  = rect.right  + PAD;
    const top    = rect.top    - PAD;
    const bottom = rect.bottom + PAD;
    // Player overlap (treat ship as a circle of radius `playerRadius`).
    const px = playerScreenX, py = playerScreenY;
    const playerOverlap = !!(playerRadius >= 0
        && px + playerRadius >= left  && px - playerRadius <= right
        && py + playerRadius >= top   && py - playerRadius <= bottom);
    // Mouse overlap.
    const mouseOverlap = (
        mouseScreenX >= left  && mouseScreenX <= right &&
        mouseScreenY >= top   && mouseScreenY <= bottom
    );
    if (playerOverlap || mouseOverlap) {
        overlayEl.classList.add('dimmed');
    } else {
        overlayEl.classList.remove('dimmed');
    }
}
