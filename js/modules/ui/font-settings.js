// ── Font system (6.158.0) ──────────────────────────────────────────
// Menu/overlay typography switcher. Two CSS variables on :root drive
// every DOM menu font — `--font-header` (titles + tabs) and `--font-body`
// (everything else). This module owns the font roster, persistence
// (rainboidsSettings.headerFont / .bodyFont), application to :root, and a
// shared picker-control builder reused by the pause DISPLAY tab and the
// title-screen SETTINGS overlay.
//
// Canvas-drawn text (the RAINBOIDS title, HUD, target labels) is NOT
// affected — it stays Press Start 2P. Switching is menus/overlays only.

import { loadSettings, saveSettings } from '../core/storage.js';

// Roster. `stack` is the CSS font-family value. Pixel fonts are bundled
// woff2 (offline). Modern fonts prefer a bundled/installed family then
// fall back to robust system sans, so they render well everywhere even
// when the named face isn't installed locally.
export const FONTS = [
    { id: 'press-start-2p', label: 'Press Start 2P', kind: 'pixel',  stack: "'Press Start 2P', monospace" },
    { id: 'silkscreen',     label: 'Silkscreen',     kind: 'pixel',  stack: "'Silkscreen', monospace" },
    { id: 'pixelify',       label: 'Pixelify Sans',  kind: 'pixel',  stack: "'Pixelify Sans', monospace" },
    { id: 'fira-code',      label: 'Fira Code',      kind: 'pixel',  stack: "'Fira Code', monospace" },
    { id: 'inter',          label: 'Inter',          kind: 'modern', stack: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
    { id: 'roboto',         label: 'Roboto',         kind: 'modern', stack: "'Roboto', 'Helvetica Neue', Arial, sans-serif" },
    { id: 'montserrat',     label: 'Montserrat',     kind: 'modern', stack: "'Montserrat', 'Helvetica Neue', Arial, sans-serif" },
    { id: 'helvetica',      label: 'Helvetica Neue', kind: 'modern', stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
    { id: 'system',         label: 'System UI',      kind: 'modern', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
];

export const DEFAULT_HEADER_FONT = 'press-start-2p';
export const DEFAULT_BODY_FONT = 'silkscreen';

const BY_ID = Object.create(null);
for (const f of FONTS) BY_ID[f.id] = f;

export function getFont(id) { return BY_ID[id] || null; }

export function getHeaderFontId() {
    try { const id = loadSettings().headerFont; return getFont(id) ? id : DEFAULT_HEADER_FONT; }
    catch { return DEFAULT_HEADER_FONT; }
}
export function getBodyFontId() {
    try { const id = loadSettings().bodyFont; return getFont(id) ? id : DEFAULT_BODY_FONT; }
    catch { return DEFAULT_BODY_FONT; }
}

/** Push the current header/body fonts onto :root as CSS variables. */
export function applyFonts() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const h = getFont(getHeaderFontId()) || getFont(DEFAULT_HEADER_FONT);
    const b = getFont(getBodyFontId()) || getFont(DEFAULT_BODY_FONT);
    root.style.setProperty('--font-header', h.stack);
    root.style.setProperty('--font-body', b.stack);
}

export function setHeaderFont(id) {
    if (!getFont(id)) return;
    try { saveSettings({ headerFont: id }); } catch {}
    applyFonts();
}
export function setBodyFont(id) {
    if (!getFont(id)) return;
    try { saveSettings({ bodyFont: id }); } catch {}
    applyFonts();
}
export function resetFonts() {
    try { saveSettings({ headerFont: DEFAULT_HEADER_FONT, bodyFont: DEFAULT_BODY_FONT }); } catch {}
    applyFonts();
}

function _makeSelect(currentId) {
    const sel = document.createElement('select');
    sel.className = 'font-select';
    const groups = [['pixel', 'Pixel / Retro'], ['modern', 'Modern']];
    for (const [kind, label] of groups) {
        const og = document.createElement('optgroup');
        og.label = label;
        for (const f of FONTS) {
            if (f.kind !== kind) continue;
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = f.label;
            if (f.id === currentId) opt.selected = true;
            og.appendChild(opt);
        }
        sel.appendChild(og);
    }
    return sel;
}

/**
 * Build the font-picker controls (header select, body select, live
 * preview, reset) into `container`. Reused by the pause DISPLAY tab and
 * the title SETTINGS overlay. Changes persist + apply immediately; the
 * preview updates live because it reads the same :root CSS variables.
 */
export function buildFontControls(container) {
    if (!container) return;
    container.replaceChildren();
    container.classList.add('font-controls');

    const headerField = document.createElement('div');
    headerField.className = 'font-field';
    const hl = document.createElement('div');
    hl.className = 'font-field-label';
    hl.textContent = 'HEADER & TAB FONT';
    const hsel = _makeSelect(getHeaderFontId());
    headerField.append(hl, hsel);

    const bodyField = document.createElement('div');
    bodyField.className = 'font-field';
    const bl = document.createElement('div');
    bl.className = 'font-field-label';
    bl.textContent = 'BODY FONT';
    const bsel = _makeSelect(getBodyFontId());
    bodyField.append(bl, bsel);

    const preview = document.createElement('div');
    preview.className = 'font-preview';
    const pH = document.createElement('div');
    pH.className = 'font-preview-header';
    pH.textContent = 'RAINBOIDS';
    const pB = document.createElement('div');
    pB.className = 'font-preview-body';
    pB.textContent = 'Pick a primary weapon, equip your gear, and survive the asteroid field. 0123456789';
    preview.append(pH, pB);

    hsel.addEventListener('change', () => setHeaderFont(hsel.value));
    bsel.addEventListener('change', () => setBodyFont(bsel.value));

    const footer = document.createElement('div');
    footer.className = 'font-settings-footer';
    const reset = document.createElement('button');
    reset.className = 'font-btn font-btn--reset';
    reset.textContent = 'RESET TO PIXEL';
    reset.addEventListener('click', () => {
        resetFonts();
        hsel.value = DEFAULT_HEADER_FONT;
        bsel.value = DEFAULT_BODY_FONT;
    });
    footer.appendChild(reset);

    container.append(headerField, bodyField, preview, footer);
}
