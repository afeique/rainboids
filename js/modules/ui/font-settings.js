// ── Font system (6.158.0 fonts; 6.158.2 sizes) ─────────────────────
// Menu/overlay typography. Four CSS variables on :root drive every DOM
// menu font:
//   --font-header / --font-body          → family (titles+tabs vs the rest)
//   --font-header-scale / --font-body-scale → size multipliers
// Every UI font-size in styles.css is `calc(<px> * var(--font-*-scale))`,
// so the scales shrink/enlarge menu text for readability. Body base px
// were bumped for a large, readable default; the scales default to 1.0.
//
// This module owns the roster, persistence (rainboidsSettings.headerFont /
// .bodyFont / .headerScale / .bodyScale), application to :root, and a
// shared control builder reused by the pause DISPLAY tab and the title
// SETTINGS overlay. Canvas-drawn text (RAINBOIDS title, HUD) is NOT
// affected — switching is menus/overlays only.

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

// Size scale bounds. Default 1.0 = the (already readable) base sizes.
export const SCALE_MIN = 0.7;
export const SCALE_MAX = 1.6;
export const SCALE_STEP = 0.05;
export const DEFAULT_SCALE = 1.0;

const BY_ID = Object.create(null);
for (const f of FONTS) BY_ID[f.id] = f;

export function getFont(id) { return BY_ID[id] || null; }

function _clampScale(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return DEFAULT_SCALE;
    return Math.min(SCALE_MAX, Math.max(SCALE_MIN, n));
}

export function getHeaderFontId() {
    try { const id = loadSettings().headerFont; return getFont(id) ? id : DEFAULT_HEADER_FONT; }
    catch { return DEFAULT_HEADER_FONT; }
}
export function getBodyFontId() {
    try { const id = loadSettings().bodyFont; return getFont(id) ? id : DEFAULT_BODY_FONT; }
    catch { return DEFAULT_BODY_FONT; }
}
export function getHeaderScale() {
    try { const s = loadSettings().headerScale; return s == null ? DEFAULT_SCALE : _clampScale(s); }
    catch { return DEFAULT_SCALE; }
}
export function getBodyScale() {
    try { const s = loadSettings().bodyScale; return s == null ? DEFAULT_SCALE : _clampScale(s); }
    catch { return DEFAULT_SCALE; }
}

/** Push the current fonts + size scales onto :root as CSS variables. */
export function applyFonts() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const h = getFont(getHeaderFontId()) || getFont(DEFAULT_HEADER_FONT);
    const b = getFont(getBodyFontId()) || getFont(DEFAULT_BODY_FONT);
    root.style.setProperty('--font-header', h.stack);
    root.style.setProperty('--font-body', b.stack);
    root.style.setProperty('--font-header-scale', String(getHeaderScale()));
    root.style.setProperty('--font-body-scale', String(getBodyScale()));
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
export function setHeaderScale(v) {
    try { saveSettings({ headerScale: _clampScale(v) }); } catch {}
    applyFonts();
}
export function setBodyScale(v) {
    try { saveSettings({ bodyScale: _clampScale(v) }); } catch {}
    applyFonts();
}
export function resetFonts() {
    try {
        saveSettings({
            headerFont: DEFAULT_HEADER_FONT, bodyFont: DEFAULT_BODY_FONT,
            headerScale: DEFAULT_SCALE, bodyScale: DEFAULT_SCALE,
        });
    } catch {}
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

// A labelled size slider (header or body). Live-applies on input and shows
// the current scale as a percentage.
function _makeSizeField(labelText, getScale, setScale) {
    const field = document.createElement('div');
    field.className = 'font-field';
    const row = document.createElement('div');
    row.className = 'font-field-label font-size-row';
    const label = document.createElement('span');
    label.textContent = labelText;
    const pct = document.createElement('span');
    pct.className = 'font-size-pct';
    const setPct = (v) => { pct.textContent = `${Math.round(v * 100)}%`; };
    row.append(label, pct);
    const slider = document.createElement('input');
    slider.className = 'font-size-slider';
    slider.type = 'range';
    slider.min = String(SCALE_MIN);
    slider.max = String(SCALE_MAX);
    slider.step = String(SCALE_STEP);
    slider.value = String(getScale());
    setPct(getScale());
    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        setPct(v);
        setScale(v);
    });
    field.append(row, slider);
    return { field, slider, setPct };
}

/**
 * Build the font controls (header/body font selects, header/body size
 * sliders, a live preview, and reset) into `container`. Reused by the
 * pause DISPLAY tab and the title SETTINGS overlay. Changes persist +
 * apply immediately; the preview updates live via the :root variables.
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

    const hSize = _makeSizeField('HEADER SIZE', getHeaderScale, setHeaderScale);
    const bSize = _makeSizeField('BODY SIZE', getBodyScale, setBodyScale);

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
    reset.textContent = 'RESET TO DEFAULTS';
    reset.addEventListener('click', () => {
        resetFonts();
        hsel.value = DEFAULT_HEADER_FONT;
        bsel.value = DEFAULT_BODY_FONT;
        hSize.slider.value = String(DEFAULT_SCALE);
        bSize.slider.value = String(DEFAULT_SCALE);
        hSize.setPct(DEFAULT_SCALE);
        bSize.setPct(DEFAULT_SCALE);
    });
    footer.appendChild(reset);

    container.append(headerField, bodyField, hSize.field, bSize.field, preview, footer);
}
