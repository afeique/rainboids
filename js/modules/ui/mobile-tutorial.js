// Mobile first-run tutorial overlay.
//
// A self-contained, opt-in overlay that briefly teaches a mobile player the
// three things the mobile mode does differently from a desktop session:
//   * Tap-to-shoot (target selection by touch)
//   * Auto-pilot dodging (the ship handles immediate-threat evasion)
//   * Long-press radial menu (weapon switching)
//   * Power weapons auto-fire when charged
//
// The overlay is built entirely in JS — no CSS file edits, no index.html
// edits — so it can be added as a self-contained module without touching
// the rest of the boot flow. The orchestrator (main.js / game-engine.js)
// is responsible for calling `mountMobileTutorial()` at the right time
// (typically after the title screen renders). Phase 1: just the function.
//
// Persistence: once the user dismisses the overlay we set a localStorage
// flag so we never show it again. A `resetTutorialSeen()` helper exists
// for testing and for a future "replay tutorial" feature.

import { isMobile } from '../platform/platform-detect.js';

export const STORAGE_KEY = 'rainboids:mobile-tutorial-seen';

// DOM ids used both for idempotency checks and as test hooks. Keeping
// them stable means a future integration test can find the overlay
// without scraping CSS-in-JS class names.
const OVERLAY_ID = 'mobile-tutorial-overlay';
const STYLE_ID = 'mobile-tutorial-style';
const DISMISS_BUTTON_ID = 'mobile-tutorial-dismiss';

// The four instructional items shown on the overlay. Order matches the
// priority of what a fresh mobile player needs to learn first.
const TUTORIAL_ITEMS = [
    { icon: '🎯', text: 'Tap enemies and asteroids to shoot at them' },
    { icon: '🤖', text: 'Your ship auto-dodges nearby threats' },
    { icon: '⚡', text: 'Long-press anywhere to change weapons' },
    { icon: '🔋', text: 'Power weapons auto-fire when charged' },
];

// CSS injected into <head>. Kept as a single template literal so the
// styling stays co-located with the markup it targets — easier to audit
// than scattering inline styles across the DOM-builder. The landscape
// media query downsizes text + tightens padding so the card fits a
// short viewport without scrolling.
const CSS_TEXT = `
#${OVERLAY_ID} {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #ffffff;
}
#${OVERLAY_ID} .mt-card {
    background: rgba(20, 20, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 20px;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    text-align: left;
}
#${OVERLAY_ID} .mt-title {
    margin: 0 0 16px 0;
    font-size: 22px;
    font-weight: 600;
    text-align: center;
    letter-spacing: 0.5px;
}
#${OVERLAY_ID} .mt-list {
    list-style: none;
    margin: 0 0 20px 0;
    padding: 0;
}
#${OVERLAY_ID} .mt-item {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 18px;
    line-height: 1.4;
    padding: 8px 0;
}
#${OVERLAY_ID} .mt-icon {
    font-size: 26px;
    flex: 0 0 auto;
    width: 36px;
    text-align: center;
}
#${OVERLAY_ID} .mt-text {
    flex: 1 1 auto;
}
#${OVERLAY_ID} button.mt-dismiss {
    display: block;
    width: 100%;
    min-height: 60px;
    margin-top: 8px;
    padding: 14px 24px;
    background: linear-gradient(180deg, #4a9eff 0%, #2a7edc 100%);
    color: #ffffff;
    border: none;
    border-radius: 10px;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
}
#${OVERLAY_ID} button.mt-dismiss:active {
    background: linear-gradient(180deg, #3a8eef 0%, #1a6ecc 100%);
}
@media (orientation: landscape) {
    #${OVERLAY_ID} .mt-card {
        padding: 14px 20px;
        max-height: 90vh;
    }
    #${OVERLAY_ID} .mt-title {
        font-size: 18px;
        margin-bottom: 10px;
    }
    #${OVERLAY_ID} .mt-item {
        font-size: 15px;
        padding: 5px 0;
    }
    #${OVERLAY_ID} .mt-icon {
        font-size: 20px;
        width: 28px;
    }
    #${OVERLAY_ID} button.mt-dismiss {
        min-height: 60px;
        font-size: 16px;
        padding: 10px 20px;
    }
}
`;

function injectStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS_TEXT;
    doc.head.appendChild(style);
}

function buildOverlay(doc, onDismiss) {
    const overlay = doc.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Mobile controls tutorial');

    const card = doc.createElement('div');
    card.className = 'mt-card';

    const title = doc.createElement('h2');
    title.className = 'mt-title';
    title.textContent = 'Welcome to Rainboids';
    card.appendChild(title);

    const list = doc.createElement('ul');
    list.className = 'mt-list';
    for (const item of TUTORIAL_ITEMS) {
        const li = doc.createElement('li');
        li.className = 'mt-item';

        const iconSpan = doc.createElement('span');
        iconSpan.className = 'mt-icon';
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.textContent = item.icon;
        li.appendChild(iconSpan);

        const textSpan = doc.createElement('span');
        textSpan.className = 'mt-text';
        textSpan.textContent = item.text;
        li.appendChild(textSpan);

        list.appendChild(li);
    }
    card.appendChild(list);

    const button = doc.createElement('button');
    button.id = DISMISS_BUTTON_ID;
    button.type = 'button';
    button.className = 'mt-dismiss';
    button.textContent = 'Got it!';
    button.addEventListener('click', onDismiss);
    card.appendChild(button);

    overlay.appendChild(card);
    return overlay;
}

function safeGetItem(storage, key) {
    if (!storage) return null;
    try { return storage.getItem(key); }
    catch { return null; }
}

function safeSetItem(storage, key, value) {
    if (!storage) return;
    try { storage.setItem(key, value); }
    catch { /* localStorage may be disabled — silent no-op */ }
}

function safeRemoveItem(storage, key) {
    if (!storage) return;
    try { storage.removeItem(key); }
    catch { /* silent no-op */ }
}

function mountInternal(doc, storage) {
    // Idempotency: if the overlay is already in the DOM, bail out instead
    // of stacking duplicates. Callers may legitimately re-trigger a
    // forceMount during debug.
    if (doc.getElementById(OVERLAY_ID)) {
        return { mounted: false, reason: 'already-mounted' };
    }
    injectStyle(doc);
    const overlay = buildOverlay(doc, () => {
        safeSetItem(storage, STORAGE_KEY, '1');
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    doc.body.appendChild(overlay);
    return { mounted: true };
}

/**
 * Mount the mobile tutorial overlay if:
 *   - isMobile() returns true
 *   - localStorage does NOT have STORAGE_KEY set
 *
 * @param {object} [opts]
 * @param {Document} [opts.document] - Target document (defaults to window.document).
 * @param {Storage} [opts.storage] - Storage backend (defaults to window.localStorage).
 * @returns {{ mounted: boolean, reason?: string }}
 */
export function mountMobileTutorial({
    document: doc = (typeof window !== 'undefined' ? window.document : null),
    storage = (typeof window !== 'undefined' ? window.localStorage : null),
} = {}) {
    if (!isMobile()) {
        return { mounted: false, reason: 'not-mobile' };
    }
    if (safeGetItem(storage, STORAGE_KEY)) {
        return { mounted: false, reason: 'already-seen' };
    }
    if (!doc || !doc.body) {
        return { mounted: false, reason: 'no-document' };
    }
    return mountInternal(doc, storage);
}

/**
 * Clear the "seen tutorial" flag (for testing or a future
 * "show tutorial again" feature).
 *
 * @param {object} [opts]
 * @param {Storage} [opts.storage] - Storage backend (defaults to window.localStorage).
 */
export function resetTutorialSeen({
    storage = (typeof window !== 'undefined' ? window.localStorage : null),
} = {}) {
    safeRemoveItem(storage, STORAGE_KEY);
}

/**
 * Manually mount the tutorial regardless of the "seen" flag and regardless
 * of the mobile-detection check. Intended for debug, replay, and tests.
 *
 * @param {object} [opts]
 * @param {Document} [opts.document] - Target document (defaults to window.document).
 * @param {Storage} [opts.storage] - Storage backend (defaults to window.localStorage).
 * @returns {{ mounted: boolean, reason?: string }}
 */
export function forceMountTutorial({
    document: doc = (typeof window !== 'undefined' ? window.document : null),
    storage = (typeof window !== 'undefined' ? window.localStorage : null),
} = {}) {
    if (!doc || !doc.body) {
        return { mounted: false, reason: 'no-document' };
    }
    return mountInternal(doc, storage);
}

// Test-only constants. Exported so the unit suite can locate elements
// without re-encoding hard-coded id strings.
export const __TEST_ONLY__ = Object.freeze({
    OVERLAY_ID,
    STYLE_ID,
    DISMISS_BUTTON_ID,
    TUTORIAL_ITEMS,
});
