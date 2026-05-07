// 5.79.37 — UI icon registry (Emoji → SVG transition).
//
// Each entry maps a slug to a 24×24 viewBox SVG `path` (or `paths`)
// string. All paths use `currentColor` so callers can tint via CSS
// `color` (DOM) or by setting `ctx.fillStyle` before drawing the
// rasterized canvas (Canvas2D).
//
// Two render helpers:
//   renderIconHTML(slug, opts) → SVG string for DOM innerHTML.
//   getIconImage(slug, sizePx, color) → cached HTMLCanvasElement, ready
//                                         for ctx.drawImage().
//
// Unknown slugs fall back to the legacy emoji passed via opts.fallback —
// keeps a half-migrated codebase rendering safely. The `EMOJI_TO_SLUG`
// map below also lets a render call site auto-resolve old emoji
// strings to the new slug ("🛡️" → "shield"), so call sites can be
// migrated incrementally.
//
// Paths are hand-authored to match the conceptual emoji from the
// 2026-05-07 transition plan. They're intentionally simple silhouettes
// (24×24 viewBox, no antialiased detail) so they read at 16-32 px
// against bright gradient cards.

// All paths use currentColor implicitly via the wrapper SVG's `fill`.
// `d` strings authored at viewBox=0 0 24 24.
export const ICON_PATHS = {
    // Defense / Combat
    shield: 'M12 2 L4 5 V11 C4 16 7.5 20.5 12 22 C16.5 20.5 20 16 20 11 V5 Z',
    bolt: 'M13 2 L4 14 H10 L9 22 L20 9 H13 Z',
    'multi-shot': 'M12 4 V20 M5.5 7 L18.5 17 M5.5 17 L18.5 7 M4 12 H20',
    wind: 'M3 9 H14 A3 3 0 1 0 11 6 M3 13 H18 A3 3 0 1 1 15 16 M3 17 H10',
    'circle-fill': 'M12 5 A7 7 0 1 1 12 19 A7 7 0 1 1 12 5 Z',
    'bow-arrow': 'M5 19 A14 14 0 0 1 19 5 M5 19 L9 15 M5 19 L9 19 M5 19 L5 15 M19 5 L13 11 M16 5 H19 V8',
    bomb: 'M11 21 A7 7 0 1 0 11 7 A7 7 0 0 0 11 21 Z M16 5 L19 2 M19 2 L21 4 M16 5 L18 7',
    target: 'M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4 Z M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 Z M12 11 A1 1 0 1 0 12 13 A1 1 0 1 0 12 11 Z',
    heart: 'M12 21 C5 16 2 12 2 8 A4 4 0 0 1 6 4 C8 4 10 5 12 8 C14 5 16 4 18 4 A4 4 0 0 1 22 8 C22 12 19 16 12 21 Z',
    dagger: 'M12 2 L9 14 H15 Z M12 14 V20 M9 17 H15 M11 20 H13',
    battery: 'M4 8 H17 V16 H4 Z M17 10 H19 V14 H17 Z M7 12 H10',

    // Time / Flow
    stopwatch: 'M12 6 A7 7 0 1 0 12 22 A7 7 0 1 0 12 6 Z M12 9 V14 L15 16 M9 3 H15 M11 3 V6',
    hourglass: 'M6 3 H18 L13 12 L18 21 H6 L11 12 Z',
    'fast-forward': 'M3 5 L11 12 L3 19 Z M12 5 L20 12 L12 19 Z',
    pause: 'M7 5 H10 V19 H7 Z M14 5 H17 V19 H14 Z',
    undo: 'M9 14 L4 9 L9 4 M4 9 H14 A6 6 0 0 1 14 21 H10',

    // Mystic / Themed
    skull: 'M6 11 A6 6 0 0 1 18 11 V15 H15 V19 H9 V15 H6 Z M9 11 A1 1 0 1 0 9 13 A1 1 0 1 0 9 11 Z M15 11 A1 1 0 1 0 15 13 A1 1 0 1 0 15 11 Z',
    fist: 'M6 8 H10 V6 A2 2 0 1 1 14 6 V8 H17 A2 2 0 0 1 19 10 V18 A2 2 0 0 1 17 20 H8 A2 2 0 0 1 6 18 V14 H4 V11 A2 2 0 0 1 6 9 Z',
    sparkle: 'M12 2 L13.5 9.5 L21 11 L13.5 12.5 L12 20 L10.5 12.5 L3 11 L10.5 9.5 Z',
    star: 'M12 3 L14.5 9.5 L22 10 L16 14.5 L18 22 L12 18 L6 22 L8 14.5 L2 10 L9.5 9.5 Z',
    vortex: 'M12 4 A8 8 0 1 1 4 12 A6 6 0 1 1 16 12 A4 4 0 1 1 8 12 A2 2 0 1 1 12 12',
    wave: 'M2 12 C5 8 7 16 10 12 C13 8 15 16 18 12 C20 9 22 12 22 12 M2 18 C5 14 7 22 10 18 C13 14 15 22 18 18 C20 15 22 18 22 18',
    rain: 'M8 18 L7 22 M12 17 L11 22 M16 18 L15 22 M5 14 A4 4 0 0 1 9 6 A6 6 0 0 1 19 8 A3 3 0 0 1 19 14 Z',
    tornado: 'M3 5 H21 M5 9 H19 M7 13 H17 M9 17 H15 M11 21 H13',

    // Awards / Status
    medal: 'M8 2 L12 10 L16 2 M12 10 A6 6 0 1 0 12 22 A6 6 0 1 0 12 10 Z M12 14 L13 17 H16 L13.5 19 L14.5 22 L12 20 L9.5 22 L10.5 19 L8 17 H11 Z',
    snail: 'M5 18 H17 A4 4 0 0 0 17 10 A6 6 0 0 0 5 14 V18 Z M14 14 A2 2 0 1 1 14 12 A2 2 0 1 1 14 14 Z M17 10 V6 M17 6 L19 4 M17 6 L15 4',
    ghost: 'M5 11 A7 7 0 0 1 19 11 V21 L17 19 L15 21 L13 19 L11 21 L9 19 L7 21 L5 19 Z M9 10 A1 1 0 1 0 9 12 A1 1 0 1 0 9 10 Z M15 10 A1 1 0 1 0 15 12 A1 1 0 1 0 15 10 Z',
    pill: 'M7 17 A4 4 0 0 1 7 7 L17 17 A4 4 0 0 1 7 17 Z M12 12 L7 7',
    gem: 'M5 9 H19 L12 21 Z M5 9 L8 3 H16 L19 9 M9 9 L12 21 L15 9 M9 9 L8 3 M15 9 L16 3',
    anger: 'M5 13 L9 9 L7 14 L11 11 L9 16 L13 13 M19 13 L15 9 L17 14 L13 11 L15 16 L11 13',
    explosion: 'M12 2 L14 8 L20 6 L16 12 L22 14 L16 16 L20 22 L14 16 L12 22 L10 16 L4 22 L8 16 L2 14 L8 12 L4 6 L10 8 Z',
    dizzy: 'M12 4 L15 9 L21 8 L17 13 L20 19 L14 17 L12 22 L10 17 L4 19 L7 13 L3 8 L9 9 Z M12 11 A1.5 1.5 0 1 1 12 14 A1.5 1.5 0 1 1 12 11',
    'money-bag': 'M9 6 H15 L17 4 H7 Z M5 14 A7 7 0 0 1 19 14 V18 A4 4 0 0 1 15 22 H9 A4 4 0 0 1 5 18 Z M12 10 V18 M9.5 12 H14 A1.5 1.5 0 0 1 14 15 H10 A1.5 1.5 0 0 0 10 18 H14.5',
    chart: 'M3 21 H21 M5 18 V12 H8 V18 M11 18 V8 H14 V18 M17 18 V14 H20 V18',
    ruler: 'M3 8 L8 3 L21 16 L16 21 Z M7 7 L9 9 M9 5 L11 7 M11 9 L13 11 M13 7 L15 9 M15 11 L17 13',
    satellite: 'M5 5 L9 9 L7 11 L5 9 Z M11 7 L17 13 L15 15 L9 9 Z M19 11 L21 13 L17 17 L15 15 Z M5 17 A2 2 0 1 1 9 21 M3 17 A4 4 0 1 1 11 21 M7 19 A0.5 0.5 0 1 1 7 20',

    // Audio / Music
    shuffle: 'M3 7 H7 L17 17 H21 M21 17 L19 15 M21 17 L19 19 M3 17 H7 L9 15 M14 9 L17 7 H21 M21 7 L19 5 M21 7 L19 9',
    loop: 'M5 9 A7 7 0 0 1 19 9 H22 L18 5 L14 9 H22 M19 15 A7 7 0 0 1 5 15 H2 L6 19 L10 15 H2',
    mute: 'M3 9 V15 H7 L13 20 V4 L7 9 Z M16 9 L22 15 M22 9 L16 15',
    volume: 'M3 9 V15 H7 L13 20 V4 L7 9 Z M16 8 A6 6 0 0 1 16 16 M19 5 A10 10 0 0 1 19 19',

    // Connections / Effects
    chain: 'M9 9 A3 3 0 0 0 6 12 V14 A3 3 0 0 0 12 14 V12 M15 15 A3 3 0 0 0 18 12 V10 A3 3 0 0 0 12 10 V12',
    fire: 'M12 2 C9 6 11 9 9 11 C7 13 5 14 5 17 A7 7 0 0 0 19 17 C19 13 16 12 15 9 C14 6 16 4 12 2 Z',
    flashlight: 'M9 2 H15 L13 8 H11 Z M11 8 H13 L13 22 H11 Z',
    wrench: 'M14 2 A5 5 0 0 0 9 9 L3 15 A2 2 0 0 0 5 17 L5 19 A2 2 0 0 0 7 21 L9 21 A2 2 0 0 0 11 19 L17 13 A5 5 0 0 0 14 2 Z M14 5 A2 2 0 1 1 18 5 A2 2 0 1 1 14 5 Z',
    pistol: 'M3 8 H17 V12 H21 V8 M14 12 V16 L11 21 H7 L4 16 V12',
    'crystal-ball': 'M12 5 A7 7 0 1 0 12 19 A7 7 0 1 0 12 5 Z M5 19 H19 V21 H5 Z M9 9 A2 2 0 1 0 12 12 M14 8 A0.5 0.5 0 1 0 14 9',

    // Vehicles / Movement
    rocket: 'M12 2 C16 6 18 10 18 14 V18 H14 V21 H10 V18 H6 V14 C6 10 8 6 12 2 Z M12 10 A2 2 0 1 0 12 14 A2 2 0 1 0 12 10 Z',
    'bullet-train': 'M3 17 H21 M5 17 V11 C5 8 8 6 12 6 C16 6 19 8 19 11 V17 M5 11 H19 M8 14 H10 M14 14 H16 M3 17 L5 21 H7 M21 17 L19 21 H17',
    siren: 'M5 17 A7 7 0 0 1 19 17 V19 H5 Z M12 4 A4 4 0 0 1 16 8 H12 Z M12 4 V8 M9 8 H15',
    cart: 'M3 4 H6 L8 16 H19 L21 8 H8 M9 20 A1.5 1.5 0 1 0 9 21 M17 20 A1.5 1.5 0 1 0 17 21',

    // Bio / Magnet
    dna: 'M7 3 C7 7 17 7 17 11 C17 15 7 15 7 19 M17 3 C17 7 7 7 7 11 C7 15 17 15 17 19 M9 5 H15 M9 9 H15 M9 13 H15 M9 17 H15',
    magnet: 'M5 4 V12 A7 7 0 0 0 19 12 V4 H15 V12 A3 3 0 0 1 9 12 V4 Z M5 4 H9 M15 4 H19 M3 8 H7 M17 8 H21',

    // Currency
    coin: 'M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4 Z M9.5 9 H14 A1.5 1.5 0 0 1 14 12 H10 A1.5 1.5 0 0 0 10 15 H14.5 M12 7 V17',
};

// Maps the legacy emoji glyphs (and a few common variants) onto the
// new slug system so call sites can pass either the old emoji or the
// new slug to the renderer and get the right SVG.
export const EMOJI_TO_SLUG = {
    '🛡️': 'shield',
    '🛡':  'shield',
    '⚡':  'bolt',
    '✳️': 'multi-shot',
    '💨':  'wind',
    '🔵':  'circle-fill',
    '🏹':  'bow-arrow',
    '💣':  'bomb',
    '🎯':  'target',
    '❤️': 'heart',
    '💚':  'heart',
    '🗡️': 'dagger',
    '🔋':  'battery',
    '⏱️': 'stopwatch',
    '⏳':  'hourglass',
    '⏩':  'fast-forward',
    '⏸':   'pause',
    '↩️': 'undo',
    '☠️': 'skull',
    '✊':  'fist',
    '✨':  'sparkle',
    '⭐':  'star',
    '🌀':  'vortex',
    '🌊':  'wave',
    '🌧️': 'rain',
    '🌪️': 'tornado',
    '🎖️': 'medal',
    '🐌':  'snail',
    '👻':  'ghost',
    '💊':  'pill',
    '💎':  'gem',
    '💢':  'anger',
    '💥':  'explosion',
    '💫':  'dizzy',
    '💰':  'money-bag',
    '📊':  'chart',
    '📐':  'ruler',
    '📡':  'satellite',
    '🔀':  'shuffle',
    '🔁':  'loop',
    '🔇':  'mute',
    '🔊':  'volume',
    '🔗':  'chain',
    '🔥':  'fire',
    '🔦':  'flashlight',
    '🔧':  'wrench',
    '🔫':  'pistol',
    '🔮':  'crystal-ball',
    '🚀':  'rocket',
    '🚄':  'bullet-train',
    '🚨':  'siren',
    '🛒':  'cart',
    '🧬':  'dna',
    '🧲':  'magnet',
};

/**
 * Resolve a possibly-emoji icon string to its slug. Accepts either:
 *   - an existing slug (returned as-is if found in ICON_PATHS)
 *   - an emoji glyph (mapped via EMOJI_TO_SLUG)
 * Returns null if neither matches.
 */
export function resolveIconSlug(input) {
    if (!input) return null;
    if (ICON_PATHS[input]) return input;
    if (EMOJI_TO_SLUG[input]) return EMOJI_TO_SLUG[input];
    return null;
}

/**
 * Build an inline SVG string for a slug. Use as DOM innerHTML.
 * `size` is rendered px (defaults 24). `color` is any CSS color
 * (defaults `currentColor` so the surrounding CSS `color` controls it).
 * `title` becomes both the SVG `<title>` (a11y) and the slug shown
 * in tooltips.
 *
 * If the slug is unknown, returns the fallback string (typically the
 * original emoji) wrapped in a span — keeps half-migrated UIs safe.
 */
export function renderIconHTML(input, opts = {}) {
    const { size = 24, color = 'currentColor', title, fallback } = opts;
    const slug = resolveIconSlug(input);
    if (!slug) {
        const text = fallback ?? input ?? '';
        return `<span class="icon-fallback">${escapeHTML(text)}</span>`;
    }
    const d = ICON_PATHS[slug];
    const titleAttr = title ? `<title>${escapeHTML(title)}</title>` : '';
    // Stroke-and-fill rendering: outline-style paths get stroke, filled
    // shapes get fill. We cheaply support both by setting fill to the
    // requested color AND stroke to the same color with a small width.
    // Paths intentionally written as filled silhouettes where possible;
    // line-style icons (bolt, hourglass) close their outlines so fill
    // produces a sensible silhouette either way.
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="${title ? 'false' : 'true'}" focusable="false">${titleAttr}<path d="${d}" fill="${color}" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, ch => (
        ch === '&' ? '&amp;' :
        ch === '<' ? '&lt;'  :
        ch === '>' ? '&gt;'  :
        ch === '"' ? '&quot;' :
                     '&#39;'
    ));
}

/**
 * Canvas-side icon cache. `getIconImage(slug, size, color)` returns a
 * cached HTMLCanvasElement that can be drawn via `ctx.drawImage`. The
 * SVG is rasterized once per (slug, size, color) tuple so call sites
 * that swap an emoji `fillText` for an icon `drawImage` don't pay
 * per-frame parse cost.
 *
 * Color defaults to white (`#ffffff`) — caller composes via
 * globalAlpha or by drawing on top of a tinted background. For
 * per-color tinting (e.g. powerup banner), pass a hex color and
 * a fresh cache entry materializes.
 */
const _imageCache = new Map();

export function getIconImage(input, sizePx = 32, color = '#ffffff') {
    const slug = resolveIconSlug(input);
    if (!slug) return null;
    const key = `${slug}|${sizePx}|${color}`;
    let canvas = _imageCache.get(key);
    if (canvas) return canvas;
    canvas = _rasterize(slug, sizePx, color);
    if (canvas) _imageCache.set(key, canvas);
    return canvas;
}

function _rasterize(slug, sizePx, color) {
    if (typeof document === 'undefined') return null;
    const d = ICON_PATHS[slug];
    if (!d) return null;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 24 24">` +
        `<path d="${d}" fill="${color}" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` +
        `</svg>`;
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, sizePx, sizePx);
        ctx.drawImage(img, 0, 0, sizePx, sizePx);
        URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    return canvas;
}
