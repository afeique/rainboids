// HUD overlay rendering — title screen, wavy text, timers, respawn, ghosts.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { rgba } from '../core/color-cache.js';
import { STREAK_TIERS as WEAPON_DATA_STREAK_TIERS, getStreakGoldMult } from '../combat/weapon-data.js';
import { VERSION } from '../core/version.js';
import { getIconImage, resolveIconSlug } from '../ui/icons.js';
import { deathCauseString } from './death-cause.js';
// 5.92.0 — Title screen responsive layout: in mobile-portrait mode
// the NEW GAME / CONTINUE / MULTIPLAYER buttons stack vertically so
// they fit a phone-sized viewport without truncation; landscape mobile
// keeps the desktop side-by-side layout but with slightly smaller
// dimensions to leave room for the title text above. Desktop unchanged.
import { isMobile, isPortrait } from '../platform/platform-detect.js';

export const _charWidthCache = new Map();

// Default rainbow palette. Stops wrap automatically (last → first), so callers
// do NOT need to repeat the first entry to close the loop.
const DEFAULT_WAVY_COLORS = ['#FF0000', '#FF8000', '#FFFF00', '#00FF00', '#0080FF', '#8000FF'];

// Build a 4-stop palette around a single base color (tint → base → shade → base).
// Used to give per-instance wavy text — like the powerup pickup label — a
// shimmering pulse around its own identifying color.
const _pulsePaletteCache = new Map();
export function pulsePalette(hex) {
    let p = _pulsePaletteCache.get(hex);
    if (p) return p;
    const h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    let r, g, b;
    if (h.length === 3) {
        r = parseInt(h[0] + h[0], 16);
        g = parseInt(h[1] + h[1], 16);
        b = parseInt(h[2] + h[2], 16);
    } else {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
    }
    const tint = (t) => `rgb(${Math.round(r + (255 - r) * t)},${Math.round(g + (255 - g) * t)},${Math.round(b + (255 - b) * t)})`;
    const shade = (t) => `rgb(${Math.round(r * (1 - t))},${Math.round(g * (1 - t))},${Math.round(b * (1 - t))})`;
    p = [hex, tint(0.55), hex, shade(0.4)];
    _pulsePaletteCache.set(hex, p);
    return p;
}

// Method to draw wavy rainbow text. Options:
//   fontSize    — base font size in px (mobile auto-shrinks to fit). Default 48.
//   colors      — array of hex stops. Color is linearly interpolated between
//                 adjacent stops AND wraps from last→first, so the loop is seamless
//                 without duplicating the first entry.
//   amplitude   — peak-to-peak vertical motion in px. Defaults to ~0.55 × fontSize.
//                 Pass 0 to disable vertical motion entirely.
//   speed       — wave cycles per second (Hz). Lower = slower peak-to-peak motion.
//                 Default 0.48.
//   colorSpeed  — palette cycles per second. Default 0.15.
export function drawWavyText(text, x, y, options = {}) {
        if (!text) return;

        const {
            fontSize = 48,
            colors = DEFAULT_WAVY_COLORS,
            amplitude,
            speed = 0.48,
            colorSpeed = 0.15,
            // 5.79.0 — opt-in black outline. Title, subtitle, and
            //   record text on the title screen pass `outline: true`
            //   so they read clearly against the live starfield.
            outline = false,
            outlineWidth = 4,
            outlineColor = 'rgba(0, 0, 0, 0.92)',
        } = options;

        const palette = (colors && colors.length > 0) ? colors : DEFAULT_WAVY_COLORS;

        const time = Date.now() * 0.001;
        const chars = text.split('');
        const effectiveFontSize = fontSize;

        // Capture caller's outer alpha so fade animations (powerup pickup,
        // level-up text, etc.) survive our internal globalAlpha changes for
        // the glow pass.
        const baseAlpha = this.ctx.globalAlpha;

        this.ctx.save();
        this.ctx.font = `${effectiveFontSize}px 'Press Start 2P', monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        const totalWidth = Math.max(1, this.ctx.measureText(text).width);
        const startX = x - totalWidth / 2;
        let currentX = startX;

        const ptp = amplitude !== undefined ? amplitude : (effectiveFontSize * 40 / 72);
        const halfAmp = ptp / 2;
        const waveOmega = 2 * Math.PI * speed;
        const n = palette.length;

        // ── Painted gradient ────────────────────────────────────────────────
        // Build a single horizontal CanvasGradient that spans the whole text.
        // We lay TWO full palette cycles end-to-end inside a gradient that's
        // 2× the text width, then slide it left over time by `phase × textWidth`.
        // Because the visible text region [startX, startX+totalWidth] always
        // sits inside the gradient as it scrolls, colors flow smoothly across
        // every glyph and wrap seamlessly when phase rolls over.
        const phase = ((time * colorSpeed) % 1 + 1) % 1;
        const slide = phase * totalWidth;
        const gx0 = startX - slide;
        const gx1 = gx0 + 2 * totalWidth;
        const grad = this.ctx.createLinearGradient(gx0, y, gx1, y);
        for (let cycle = 0; cycle < 2; cycle++) {
            for (let i = 0; i < n; i++) {
                grad.addColorStop((cycle * n + i) / (2 * n), palette[i]);
            }
        }
        grad.addColorStop(1, palette[0]);

        // 5.99.0 — Centering fix. Pre-5.99 drew each glyph with
        // textAlign='center' at `currentX` (the cumulative left-edge
        // position) — which shifted the whole text block LEFT by
        // ~glyphWidth/2 (the first glyph's center landed at startX
        // instead of startX + glyphWidth/2). Title screens worked
        // around this with a manual `centerX + 10` nudge in the call
        // site, but landscape / different fonts broke that hack. Fix
        // the renderer instead: every glyph's center is placed at
        // `currentX + glyphWidth/2`, which matches left-align spacing
        // and centers the whole block on `x` correctly.
        chars.forEach((char, index) => {
            if (char === ' ') {
                currentX += effectiveFontSize * 0.5;
                return;
            }

            const waveOffset = halfAmp === 0 ? 0 : Math.sin(time * waveOmega + index * 0.8) * halfAmp;
            this.ctx.font = `${effectiveFontSize}px 'Press Start 2P', monospace`;
            const charWidth = this.ctx.measureText(char).width;
            const glyphCenterX = currentX + charWidth / 2;

            // 5.79.0 — black stroke pass under each glyph (when opted
            //   in). Drawn FIRST so the gradient fill stays on top.
            if (outline) {
                this.ctx.lineWidth = outlineWidth;
                this.ctx.lineJoin = 'round';
                this.ctx.strokeStyle = outlineColor;
                this.ctx.globalAlpha = baseAlpha;
                this.ctx.strokeText(char, glyphCenterX, y + waveOffset);
            }

            // Glow via double-draw: larger translucent pass + crisp pass.
            this.ctx.fillStyle = grad;
            this.ctx.globalAlpha = baseAlpha * 0.35;
            this.ctx.font = `${effectiveFontSize + 2}px 'Press Start 2P', monospace`;
            this.ctx.fillText(char, glyphCenterX, y + waveOffset);

            this.ctx.globalAlpha = baseAlpha;
            this.ctx.font = `${effectiveFontSize}px 'Press Start 2P', monospace`;
            this.ctx.fillText(char, glyphCenterX, y + waveOffset);

            currentX += charWidth;
        });

        this.ctx.restore();
}

// Distinct gradients per call site. Wrapping is automatic — do not duplicate
// the first stop at the end. Each palette is hand-tuned around the base color
// the corresponding text was originally rendered in.
export const WAVY_PALETTES = {
    // Big screen-overlay text — full vivid rainbow.
    title:         ['#FF1744', '#FF9100', '#FFEA00', '#00E676', '#00B0FF', '#D500F9'],
    waveTitle:     ['#00E5FF', '#18FFFF', '#69F0AE', '#B2FF59', '#FFEA00'],
    waveSubtext:   ['#FFD180', '#FF8A80', '#FF80AB', '#EA80FC', '#B388FF'],

    // Single-color pulses around a base hue. Use these for text that
    // originally rendered in one solid color so the identity is preserved.
    gold:          ['#FFD700', '#FFF8B0', '#FFB300', '#FFD700'],   // base #FFD700 (level-up "LEVEL X!", survival record)
    orange:        ['#FFA500', '#FFD180', '#FF6F00', '#FFA500'],   // base #FFA500 (level-up subtitle)
    combo:         ['#FFD700', '#FFFF8D', '#FF6F00', '#FFAB00'],   // base #FFD700, hotter — combo counter
    whiteShimmer:  ['#FFFFFF', '#E1F5FE', '#B3E5FC', '#FFFFFF'],   // base #FFFFFF (subtitles, prompts)
};

export function drawTitleScreen() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;

        // Title-launch animation. triggerTitleStart picks a random style
        // from {twister, explosion, wave, cascade, warpdrive, pinwheel} and
        // seeds per-letter random data so each press feels fresh even if
        // the same style rolls twice. While 'idle', render the normal
        // static title screen below.
        const anim = (typeof this._titleAnimState === 'function') ? this._titleAnimState() : null;
        const launching = anim && anim.phase === 'launch';
        const elapsed = launching ? (Date.now() - anim.startTime) : 0;
        const total = launching ? anim.duration : 0;

        // Subtitle / press-any-key / record stay visible during the launch
        // animation per user request — only the title letters themselves
        // animate; the surrounding chrome remains.
        const showSubtitle = true;
        const showPressKey = true;
        let fadeAlpha = 0;

        // 5.79.3 — when launching, defer the animated title until AFTER
        //   the chrome (subtitle, buttons, record, version) draws so
        //   the animated letters render ON TOP of everything else.
        //   The static idle title still draws here at its normal
        //   z-order.
        // 5.92.0 — Title + subtitle sizes scale down on narrow
        // viewports so the 72 px hero text doesn't overflow the screen
        // on a phone in portrait. Floor at 40 px so the title is still
        // unmistakably the focal point. Desktop is unchanged because
        // isMobile() is false off touch devices.
        // 5.92.1 — Layout is now positioned RELATIVE to a computed
        // total content block height so the chrome (title + subtitle +
        // buttons + record + version) always fits within the canvas on
        // any viewport, including narrow portrait phones (360x640) and
        // squat landscape (640x360).
        const _isMobile = isMobile();
        const _isPortrait = _isMobile && isPortrait();
        const _isLandscape = _isMobile && !isPortrait();

        // 5.97.0 — Tighter mobile sizing. The 5.92 caps were still too
        // chunky on a typical 390-wide phone in portrait (title ≈ 48 px
        // dominated the screen). Cut roughly a third off the cap and
        // raise the width divisor so the title reads as ONE element of
        // the layout, not the whole screen.
        const titleFontSize = _isPortrait
            ? Math.min(36, Math.max(22, Math.floor(this.width / 11)))
            : (_isLandscape
                ? Math.min(42, Math.max(26, Math.floor(this.height / 9)))
                : 72);
        const subtitleFontSize = _isMobile
            ? Math.min(14, Math.max(9, Math.floor(titleFontSize / 3.0)))
            : 24;

        // ── Button + spacing budgets (computed up front so we can place
        //    the title above the buttons rather than at a fixed offset).
        const hasSavedRun = !!(this.hasSavedRun && this.hasSavedRun());
        // 6.28.0 — MULTIPLAYER button removed from the title screen and
        // replaced by a TUTORIAL button (always shown).
        const mobilePortrait = _isPortrait;
        const mobileLandscape = _isLandscape;
        let buttonW, buttonH, buttonGap;
        if (mobilePortrait) {
            // 5.97.0 — Slimmer buttons (≤220px, 40px tall) — the 5.92
            // 48-px-tall stack felt oversized on phones once the title
            // shrank. Still well above the 44px tap-target floor when
            // measured with the implicit 8px padding rounding.
            buttonW = Math.min(220, Math.max(160, this.width * 0.75));
            buttonH = 40;
            buttonGap = 10;
        } else if (mobileLandscape) {
            // 5.97.0 — Pair with the smaller title; side-by-side stays.
            buttonW = Math.min(160, Math.max(120, this.width * 0.30));
            buttonH = 38;
            buttonGap = 14;
        } else {
            buttonW = 220;
            buttonH = 46;
            buttonGap = 36;
        }

        // Compute the buttons-block height so we can lay out the title
        // ABOVE it (instead of the old `centerY - 100` magic number that
        // pushed the title above the canvas on phones).
        // 6.28.0 — TUTORIAL row below the NEW GAME / CONTINUE pair.
        // MP — plus a MULTIPLAYER row at the very bottom (experimental co-op).
        let buttonsBlockH;
        if (mobilePortrait) {
            // Stack: NEW GAME + CONTINUE + TUTORIAL + HANGAR + SETTINGS + MULTIPLAYER.
            buttonsBlockH = buttonH * 6 + buttonGap * 5;
        } else if (mobileLandscape) {
            // Primary pair + a 2×2 secondary grid (TUTORIAL/HANGAR · SETTINGS/
            // MULTIPLAYER) so all six fit on a short 360px-tall landscape phone.
            buttonsBlockH = buttonH * 3 + 18 + 14;
        } else {
            // Desktop: side-by-side primary row + TUTORIAL + HANGAR + SETTINGS + MULTIPLAYER.
            buttonsBlockH = buttonH * 5 + 18 * 4;
        }
        // 5.99.1 — recordH shrinks on mobile to match the smaller record
        // font (10/12 px) so the layout block computes the correct
        // content height and the chrome doesn't end up bottom-clamped
        // with extra whitespace below it on a 640-tall portrait phone.
        const recordH = (this.game.survivalRecord > 0)
            ? (_isPortrait ? 18 : (_isLandscape ? 22 : 32))
            : 0;
        const subtitleH = subtitleFontSize + 8;
        const titleH = titleFontSize + 8;
        const titleSubtitleGap = mobilePortrait ? 20 : 28;
        const subtitleButtonsGap = mobilePortrait ? 24 : 36;
        const recordGap = recordH ? 24 : 0;

        const contentH = titleH + titleSubtitleGap + subtitleH + subtitleButtonsGap + buttonsBlockH + recordGap + recordH;
        // Anchor the content block so its vertical center sits at
        // centerY, clamped so the top doesn't go above 16px (room for
        // status-bar / notch) and the bottom doesn't drop below
        // canvas.height - 32 (room for the version tag).
        const minTop = 16;
        const maxBottom = this.canvas.height - 32;
        let contentTop = centerY - contentH / 2;
        if (contentTop < minTop) contentTop = minTop;
        if (contentTop + contentH > maxBottom) contentTop = maxBottom - contentH;
        if (contentTop < minTop) contentTop = minTop; // tiny viewport: prefer top alignment

        const titleY = contentTop + titleH / 2;
        const subtitleY = titleY + titleH / 2 + titleSubtitleGap + subtitleH / 2;
        const buttonsTop = subtitleY + subtitleH / 2 + subtitleButtonsGap;
        const recordY = buttonsTop + buttonsBlockH + recordGap + recordH / 2;

        if (!launching) {
            // Static idle title — RAINBOIDS centered, subtitle below.
            // 5.79.0 — outline:true adds a black stroke under each
            //   glyph so the title stays legible over the dynamic
            //   starfield/nebula.
            // 5.99.0 — Was `centerX + 10` to nudge the title right and
            // compensate for the now-fixed drawWavyText centering bug.
            // Now `centerX` is correct.
            this.drawWavyText('RAINBOIDS', centerX, titleY, {
                fontSize: titleFontSize,
                colors: WAVY_PALETTES.title,
                speed: 0.45,
                colorSpeed: 0.18,
                outline: true,
                outlineWidth: Math.max(3, Math.floor(titleFontSize / 12)),
            });
        }

        // ── Subtitle / Press Any Key / Record (visible during launch too) ──
        if (showSubtitle) {
            this.drawWavyText('SUPERCHARGED ASTEROIDS', centerX, subtitleY, {
                fontSize: subtitleFontSize,
                colors: WAVY_PALETTES.whiteShimmer,
                amplitude: 0,
                colorSpeed: 0.1,
                outline: true,
                outlineWidth: Math.max(2, Math.floor(subtitleFontSize / 6)),
            });
        }

        if (showPressKey) {
            // 5.79.0 — replaced "PRESS ANY KEY TO START" with NEW GAME +
            //   CONTINUE buttons. Continue is grayed out when no save
            //   exists. Bounds are stashed on the engine so the click
            //   listener in main.js can route mouse hits.
            //
            // 5.92.0 — Mobile-portrait stacks the buttons vertically
            //   (one per row, full-screen-width minus padding) so a
            //   narrow viewport never truncates the labels and each
            //   button comfortably exceeds the 44×44 px tap-target
            //   floor. Mobile-landscape keeps the side-by-side layout
            //   but shrinks the button width to leave room for the
            //   horizontal title. Desktop is byte-for-byte unchanged.
            const ctx = this.ctx;
            const labels = ['NEW GAME', 'CONTINUE'];

            const rects = {};
            if (mobilePortrait) {
                // Vertical stack anchored at the computed buttonsTop.
                const x0 = centerX - buttonW / 2;
                const yTop = buttonsTop;
                rects.newGame  = { id: 'newGame',  x: x0, y: yTop,                                w: buttonW, h: buttonH, disabled: false };
                rects.continue = { id: 'continue', x: x0, y: yTop + (buttonH + buttonGap),       w: buttonW, h: buttonH, disabled: !hasSavedRun };
                rects.tutorial = {
                    id: 'tutorial',
                    x: x0,
                    y: yTop + 2 * (buttonH + buttonGap),
                    w: buttonW,
                    h: buttonH,
                    disabled: false,
                };
                rects.hangar = {
                    id: 'hangar',
                    x: x0,
                    y: yTop + 3 * (buttonH + buttonGap),
                    w: buttonW,
                    h: buttonH,
                    disabled: false,
                };
                rects.settings = {
                    id: 'settings',
                    x: x0,
                    y: yTop + 4 * (buttonH + buttonGap),
                    w: buttonW,
                    h: buttonH,
                    disabled: false,
                };
                rects.multiplayer = {
                    id: 'multiplayer',
                    x: x0,
                    y: yTop + 5 * (buttonH + buttonGap),
                    w: buttonW,
                    h: buttonH,
                    disabled: false,
                };
            } else {
                // Landscape / desktop — side-by-side NEW GAME + CONTINUE
                // with optional MULTIPLAYER row beneath. This is the
                // original pre-5.92 layout, just with the dimensions
                // computed above (so landscape mobile gets a slightly
                // smaller version of the same shape).
                const totalW = buttonW * 2 + buttonGap;
                const yTop = buttonsTop;
                const x0 = centerX - totalW / 2;
                rects.newGame  = { id: 'newGame',  x: x0,                       y: yTop, w: buttonW, h: buttonH, disabled: false };
                rects.continue = { id: 'continue', x: x0 + buttonW + buttonGap, y: yTop, w: buttonW, h: buttonH, disabled: !hasSavedRun };
                const tutY = yTop + buttonH + 18;
                const xRight = x0 + buttonW + buttonGap;
                if (mobileLandscape) {
                    // 2×2 secondary grid so all six buttons fit a short landscape
                    // phone: TUTORIAL | HANGAR  /  SETTINGS | MULTIPLAYER.
                    const row2 = tutY + buttonH + 14;
                    rects.tutorial    = { id: 'tutorial',    x: x0,     y: tutY, w: buttonW, h: buttonH, disabled: false };
                    rects.hangar      = { id: 'hangar',      x: xRight, y: tutY, w: buttonW, h: buttonH, disabled: false };
                    rects.settings    = { id: 'settings',    x: x0,     y: row2, w: buttonW, h: buttonH, disabled: false };
                    rects.multiplayer = { id: 'multiplayer', x: xRight, y: row2, w: buttonW, h: buttonH, disabled: false };
                } else {
                    // Desktop — full-width stacked rows (ample vertical room).
                    rects.tutorial    = { id: 'tutorial',    x: x0, y: tutY,                     w: totalW, h: buttonH, disabled: false };
                    rects.hangar      = { id: 'hangar',      x: x0, y: tutY + (buttonH + 18),     w: totalW, h: buttonH, disabled: false };
                    rects.settings    = { id: 'settings',    x: x0, y: tutY + 2 * (buttonH + 18), w: totalW, h: buttonH, disabled: false };
                    rects.multiplayer = { id: 'multiplayer', x: x0, y: tutY + 3 * (buttonH + 18), w: totalW, h: buttonH, disabled: false };
                }
            }

            this._titleButtonRects = rects;
            const hovered = this._titleHoveredButton;
            const pressed = this._titlePressedButton;

            const drawButton = (rect, label) => {
                ctx.save();
                const isHover = hovered === rect.id && !rect.disabled;
                const isPress = pressed === rect.id && !rect.disabled;
                const baseAlpha = rect.disabled ? 0.32 : 1.0;
                const time = Date.now() * 0.001;
                const pulse = rect.disabled ? 0 : Math.sin(time * 3) * 0.10;
                ctx.globalAlpha = baseAlpha + pulse;

                // Press state shifts the button down 1px and uses a
                // saturated fill so the click reads as physical contact.
                const yOffset = isPress ? 1 : 0;
                const x = rect.x;
                const y = rect.y + yOffset;
                const w = rect.w, h = rect.h;

                ctx.lineWidth = 2;
                if (rect.disabled) {
                    ctx.strokeStyle = 'rgba(150, 150, 150, 0.55)';
                    ctx.fillStyle   = 'rgba(40, 40, 40, 0.35)';
                } else if (isPress) {
                    ctx.strokeStyle = '#ffe5a0';
                    ctx.fillStyle   = 'rgba(255, 200, 64, 0.55)';
                } else if (isHover) {
                    ctx.strokeStyle = 'rgba(140, 220, 255, 1)';
                    ctx.fillStyle   = 'rgba(0, 80, 130, 0.55)';
                } else {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                    ctx.fillStyle   = 'rgba(0, 0, 0, 0.55)';
                }
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h);
                ctx.fill();
                ctx.stroke();

                // 5.79.0 — black text outline so labels stay legible
                //   over the dynamic starfield/nebula. strokeText first,
                //   then fillText.
                // 5.92.1 — Shrink label font on narrow mobile portraits
                //   so the longest label ("MULTIPLAYER") doesn't run
                //   into the rounded button edges on a 320-wide phone.
                const labelFontSize = mobilePortrait
                    ? (buttonW < 240 ? 12 : 13)
                    : (mobileLandscape ? 12 : 16);
                ctx.font = `${labelFontSize}px 'Press Start 2P', monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const tx = x + w / 2;
                const ty = y + h / 2 + 1;
                ctx.lineWidth = 4;
                ctx.lineJoin = 'round';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
                ctx.strokeText(label, tx, ty);
                ctx.fillStyle = rect.disabled
                    ? 'rgba(170, 170, 170, 0.85)'
                    : (isPress ? '#fffadf' : (isHover ? '#fff' : 'rgba(230, 240, 250, 0.95)'));
                ctx.fillText(label, tx, ty);
                ctx.restore();
            };
            drawButton(rects.newGame, labels[0]);
            drawButton(rects.continue, labels[1]);
            if (rects.tutorial) {
                drawButton(rects.tutorial, 'TUTORIAL');
            }
            if (rects.hangar) {
                drawButton(rects.hangar, 'HANGAR');
            }
            if (rects.settings) {
                drawButton(rects.settings, 'SETTINGS');
            }
            if (rects.multiplayer) {
                drawButton(rects.multiplayer, 'MULTIPLAYER');
            }

            if (this.game.survivalRecord > 0) {
                // 5.99.1 — Mobile uses a compact HH:MM:SS / M:SS form so
                // "Survival Record: 1 hours, 23 minutes" doesn't run off
                // the canvas on a 360-wide phone. Desktop keeps the
                // verbose phrase.
                let recText;
                if (_isMobile) {
                    const totalSec = Math.max(0, Math.floor(this.game.survivalRecord / 1000));
                    const hh = Math.floor(totalSec / 3600);
                    const mm = Math.floor((totalSec % 3600) / 60);
                    const ss = totalSec % 60;
                    const pad = (n) => String(n).padStart(2, '0');
                    const tStr = hh > 0
                        ? `${hh}:${pad(mm)}:${pad(ss)}`
                        : `${mm}:${pad(ss)}`;
                    recText = `RECORD ${tStr}`;
                } else {
                    recText = `Survival Record: ${this.formatSurvivalTime(this.game.survivalRecord)}`;
                }
                // 5.79.0 — outline:true gives a black stroke under the
                //   wavy gold text for legibility against starfields.
                // 5.99.1 — Tighter caps on mobile so the record always
                //   fits in portrait AND landscape phone viewports.
                const recFontSize = _isPortrait
                    ? Math.min(10, Math.max(8, Math.floor(this.width / 38)))
                    : (_isLandscape
                        ? Math.min(12, Math.max(9, Math.floor(this.height / 50)))
                        : 16);
                this.drawWavyText(recText, centerX, recordY, {
                    fontSize: recFontSize,
                    colors: WAVY_PALETTES.gold,
                    amplitude: 0,
                    colorSpeed: 0.14,
                    outline: true,
                    outlineWidth: Math.max(2, Math.floor(recFontSize / 5)),
                });
            }

            // 5.78.0 — version tag, bottom-right of the title screen.
            // Small Press-Start-2P at 60% alpha; sits above any HUD
            // padding the viewport adds. Mirrors the in-game gold /
            // timer corner so the player notices but it doesn't fight
            // for attention with the title text.
            this.ctx.save();
            this.ctx.font = "11px 'Press Start 2P', monospace";
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
            // 5.79.0 — thicker outline for the version tag too.
            this.ctx.lineWidth = 3;
            this.ctx.lineJoin = 'round';
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'bottom';
            // Single gold version tag, bottom-right. (Multiplayer was
            // shelved — see /multiplayer/RESTORE.md — so there's one
            // product again; no SP/MP prefix, just the version number.)
            const tx = this.canvas.width - 14;
            const tyBase = this.canvas.height - 12;
            const tag = `${VERSION}`;
            this.ctx.fillStyle = 'rgba(255, 200, 64, 1.0)';
            this.ctx.strokeText(tag, tx, tyBase);
            this.ctx.fillText(tag, tx, tyBase);
            this.ctx.restore();
        }

        // 5.79.3 — Animated title is drawn LAST (after the chrome) so
        //   the swirling letters render ON TOP of subtitle / buttons /
        //   record / version tag. The user explicitly wanted the
        //   animation to be the focal point of the launch transition.
        if (launching) {
            const text = 'RAINBOIDS';
            const seeds = anim.letterSeeds || [];
            const style = anim.style || 'twister';
            const titleX = centerX; // 5.99.0 — drawWavyText centering fixed
            // 5.92.1 — Use the responsive titleY computed above so the
            // launch animation lines up with the static title on mobile
            // (instead of a fixed `centerY - 100` that floats above the
            // viewport on phones). Animation font scaling stays at the
            // helper's 72 default so the dramatic swirl reads big.
            const staticPositions = _measureLetterPositions(this.ctx, text, titleFontSize, titleX, titleY);
            switch (style) {
                case 'explosion':
                    fadeAlpha = drawExplosionAnim.call(this, this.ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions);
                    break;
                case 'wave':
                    fadeAlpha = drawWaveAnim.call(this, this.ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions);
                    break;
                case 'cascade':
                    fadeAlpha = drawCascadeAnim.call(this, this.ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions);
                    break;
                case 'warpdrive':
                    fadeAlpha = drawWarpdriveAnim.call(this, this.ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions);
                    break;
                case 'pinwheel':
                    fadeAlpha = drawPinwheelAnim.call(this, this.ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions);
                    break;
                case 'twister':
                default:
                    fadeAlpha = drawTwisterAnim.call(this, this.ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions);
                    break;
            }
        }

        // ── Fade-to-black overlay (final phase of launch animation) ──
        // Drawn AFTER everything else so it covers the title + starfield.
        if (fadeAlpha > 0) {
            this.ctx.save();
            this.ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, fadeAlpha)})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();
        }
}

// ─── Title-launch animation helpers ────────────────────────────────────────
// Each helper returns the fade-to-black alpha for the current frame so the
// outer drawTitleScreen can paint the universal black wash. Common timing:
//   total = 1900ms, last 400ms is fade — animations should reach a clean
//   "off-screen / faded out" state by then.

const TITLE_FONT_SIZE = 72;
const TITLE_FOCAL     = 600;
const TITLE_FADE_MS   = 400;
// First N ms of every launch animation: the rendered position is a smooth
// lerp from the letter's static title position to the animation's "live"
// position. This way the on-screen RAINBOIDS letters appear to BECOME the
// animation instead of jumping to a new pose.
const TITLE_SETTLE_MS = 250;

// Measure the letters of `text` rendered with drawWavyText at (baseX, baseY)
// with the given font size. Returns an array of { x, y } that match the
// rendering origin _titleLetterDraw expects: when each per-letter call to
// drawWavyText runs (with textAlign='center', single-char text), its own
// internal startX = 0 - w/2 means the char ends up visually centered at
// (origin.x - w/2). The static drawWavyText, by contrast, places each
// char's visual center at `currentX` — so to make the animation positions
// overlap the static title we add w/2 to each origin. Without this
// compensation the title appears shifted ~half-a-letter-width to the left
// at the start of every animation.
function _measureLetterPositions(ctx, text, fontSize, baseX, baseY) {
    ctx.save();
    ctx.font = `${fontSize}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const totalWidth = Math.max(1, ctx.measureText(text).width);
    let currentX = baseX - totalWidth / 2;
    const positions = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const w = ctx.measureText(ch).width;
        positions.push({ x: currentX + w / 2, y: baseY, w });
        currentX += w;
    }
    ctx.restore();
    return positions;
}

// Smooth ease-in-out blend over the settle window.
function _settleBlend(elapsed) {
    const t = Math.min(1, Math.max(0, elapsed / TITLE_SETTLE_MS));
    // Smoothstep — gentle accelerate, gentle decelerate so the letters
    // glide into the animation pose without a jolt.
    return t * t * (3 - 2 * t);
}

function _titleLetterDraw(ctx, drawWavyText, ch, x, y, scale, alpha, opts = {}) {
    if (alpha <= 0.01 || scale <= 0.01) return;
    ctx.save();
    ctx.translate(x, y);
    if (scale !== 1) ctx.scale(scale, scale);
    if (opts.rotation) ctx.rotate(opts.rotation);
    ctx.globalAlpha *= alpha;
    // 6.13.1 — resolve per-letter rainbow color by position in the
    // word so the animated entry preserves the same vivid rainbow
    // the static title has. `drawWavyText` builds a horizontal gradient
    // over the text's measured width; a single-char call only spans
    // ~30 px and ends up showing one color from the palette at a time
    // (visibly drifting / monochromatic). By pre-resolving each letter
    // to its rainbow-position color and passing a single-element
    // palette, the animation matches the static look. The wave-offset
    // still applies on top so letters still wobble.
    let colors = opts.colors || WAVY_PALETTES.title;
    if (opts.letterIndex !== undefined && opts.totalLetters > 0) {
        const palette = WAVY_PALETTES.title;
        const idx = Math.floor((opts.letterIndex / opts.totalLetters) * palette.length);
        colors = [palette[idx % palette.length]];
    }
    // 6.x.0 — Keep the black stroke during fly-around animations. The
    // static title (drawTitleScreen) opts into `outline`; the animated
    // letters route through here, so enable it by default and size the
    // stroke off the font like the static title (max(3, fontSize/12)).
    const fontSize = opts.fontSize || TITLE_FONT_SIZE;
    drawWavyText(ch, 0, 0, {
        fontSize,
        colors,
        speed: opts.speed || 0.55,
        colorSpeed: opts.colorSpeed || 0.22,
        outline: opts.outline !== false,
        outlineWidth: opts.outlineWidth || Math.max(3, Math.floor(fontSize / 12)),
    });
    ctx.restore();
}

// Lerp the animation's intended pose against the letter's static title
// origin during the settle window. Returns the rendered pose for this frame.
function _settleLerp(elapsed, staticPos, animSx, animSy, animScale, animAlpha, animRotation) {
    const blend = _settleBlend(elapsed);
    return {
        x: staticPos.x + (animSx - staticPos.x) * blend,
        y: staticPos.y + (animSy - staticPos.y) * blend,
        scale: 1 + (animScale - 1) * blend,
        alpha: 1 + (animAlpha - 1) * blend,
        rotation: (animRotation || 0) * blend,
    };
}

// ── 1. Twister ────────────────────────────────────────────────────────────
// Letters orbit a vertical screen-center axis at staggered heights with
// proper 3D perspective; the column hurtles toward the camera over time.
function drawTwisterAnim(ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions) {
    const TWISTER_END = 1100;
    const ZOOM_END    = 1500;
    const baseZ = 800;
    let zoomAmount, radius, fadeAlpha = 0;

    if (elapsed < TWISTER_END) {
        const t = elapsed / TWISTER_END;
        const eased = 1 - Math.pow(1 - t, 1.6);
        radius = 240 * (1 - eased * 0.45);
        zoomAmount = eased * 0.45;
    } else if (elapsed < ZOOM_END) {
        const t = (elapsed - TWISTER_END) / (ZOOM_END - TWISTER_END);
        const eased = Math.pow(t, 1.4);
        radius = 132 * (1 - eased);
        zoomAmount = 0.45 + eased * 0.50;
    } else {
        const t = Math.min(1, (elapsed - ZOOM_END) / (total - ZOOM_END));
        radius = 0;
        zoomAmount = 0.95 + t * 0.04;
        fadeAlpha = Math.pow(t, 1.2);
    }

    const zCamera = baseZ * (1 - zoomAmount);
    const angularVelocity = 5.5;
    const N = text.length;
    const verticalSpread = 380;
    const yStep = N > 1 ? verticalSpread / (N - 1) : 0;
    const time = elapsed / 1000;
    // Project toward the title's actual visual center (centerX+10, titleY)
    // rather than centerX/centerY — so the twister hurtles toward where
    // the static title sits, not slightly off-axis below it.
    const titleMidX = (staticPositions[0].x + staticPositions[N - 1].x) / 2;
    const titleMidY = staticPositions[0].y;

    ctx.save();
    for (let i = 0; i < N; i++) {
        const angleOffset = (i / N) * Math.PI * 2 * 1.7;
        const angle = angleOffset + time * angularVelocity;
        const yBase = -verticalSpread / 2 + i * yStep;
        const x3d = Math.cos(angle) * radius;
        const z3d = Math.sin(angle) * radius + zCamera;
        if (z3d <= 30) continue;
        const yScale = 1 - zoomAmount * 0.35;
        const y3d = yBase * yScale;
        const projScale = TITLE_FOCAL / z3d;
        const sx = titleMidX + x3d * projScale;
        const sy = titleMidY + y3d * projScale;
        const drawScale = projScale * 1.6;
        const angleAlpha = (Math.cos(angle) * 0.5 + 0.5);
        const letterAlpha = Math.max(0.25, 0.45 + 0.55 * angleAlpha) * (1 - fadeAlpha * 0.85);
        const r = _settleLerp(elapsed, staticPositions[i], sx, sy, drawScale, letterAlpha, 0);
        _titleLetterDraw(ctx, this.drawWavyText.bind(this), text[i], r.x, r.y, r.scale, r.alpha, { rotation: r.rotation, letterIndex: i, totalLetters: N });
    }
    ctx.restore();
    return fadeAlpha;
}

// ── 2. Explosion ──────────────────────────────────────────────────────────
// Letters cluster at center, then fly outward in random 3D directions.
// All trajectories bias toward the camera (-z), so the debris zooms past
// the viewer at the end. Each letter spins around its own axis as it goes.
function drawExplosionAnim(ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions) {
    const FORM_END   = 220;
    const BURST_END  = 1500;
    const baseZ = 700;
    let fadeAlpha = 0;
    if (elapsed >= total - TITLE_FADE_MS) {
        fadeAlpha = Math.pow((elapsed - (total - TITLE_FADE_MS)) / TITLE_FADE_MS, 1.2);
    }

    let burstT;
    if (elapsed < FORM_END) {
        // Letters fade in at the same point with scale 0 → 1
        burstT = 0;
    } else if (elapsed < BURST_END) {
        burstT = (elapsed - FORM_END) / (BURST_END - FORM_END);
    } else {
        burstT = 1;
    }
    const formProgress = Math.min(1, elapsed / FORM_END);
    const N = text.length;
    // Project from the title's own visual center so the explosion is
    // anchored on the static title rather than a slightly off-axis point.
    const titleMidX = (staticPositions[0].x + staticPositions[N - 1].x) / 2;
    const titleMidY = staticPositions[0].y;

    ctx.save();
    for (let i = 0; i < N; i++) {
        const seed = seeds[i] || { angle: i, pitch: 0, speed: 1, phase: 0, spinDir: 1 };
        // Direction vector — evenly distribute the N letters around the
        // unit circle (so the burst is balanced left/right) plus a small
        // per-letter jitter from seed.angle so each launch still varies.
        const baseAngle = (i / N) * Math.PI * 2 + seed.angle * 0.35;
        const cosP = Math.cos(seed.pitch);
        const sinP = Math.sin(seed.pitch);
        const dirX = Math.cos(baseAngle) * cosP * 1.35;
        const dirY = Math.sin(baseAngle) * cosP * 0.85 + sinP * 0.4 - 0.05;
        const dirZ = -Math.abs(Math.sin(baseAngle * 0.5)) * 0.45 - 0.95;

        // Distance traveled — accelerates outward
        const dist = Math.pow(burstT, 1.55) * 750 * seed.speed;
        const x3d = dirX * dist;
        const y3d = dirY * dist;
        const z3d = baseZ + dirZ * dist;
        if (z3d <= 30) continue;

        const projScale = TITLE_FOCAL / z3d;
        const sx = titleMidX + x3d * projScale;
        const sy = titleMidY + y3d * projScale;

        // Scale: starts at 0 (formation), grows with both perspective + a
        // small intrinsic flare so the explosion feels energetic.
        const intrinsic = formProgress * (1 + burstT * 0.6);
        const drawScale = projScale * 1.4 * intrinsic;

        // Spin around the letter's local axis as it tumbles outward
        const rotation = seed.spinDir * burstT * (Math.PI * 2.3) + seed.phase * 0.4;

        const letterAlpha = (1 - fadeAlpha * 0.9);
        const r = _settleLerp(elapsed, staticPositions[i], sx, sy, drawScale, letterAlpha, rotation);
        _titleLetterDraw(ctx, this.drawWavyText.bind(this), text[i], r.x, r.y, r.scale, r.alpha, { rotation: r.rotation, letterIndex: i, totalLetters: N });
    }
    ctx.restore();
    return fadeAlpha;
}

// ── 3. Wave ───────────────────────────────────────────────────────────────
// Letters in a horizontal row oscillate vertically. Both wave amplitude
// AND angular frequency rise over time, building from a calm shimmer to
// a violent thrash. Final phase: row zooms toward camera + fade.
function drawWaveAnim(ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions) {
    const WAVE_END = 1450;
    const ZOOM_END = 1500;
    let zoomAmount = 0, fadeAlpha = 0;
    if (elapsed >= ZOOM_END) {
        const t = Math.min(1, (elapsed - ZOOM_END) / (total - ZOOM_END));
        zoomAmount = t;
        fadeAlpha = Math.pow(t, 1.2);
    }

    const N = text.length;
    // Amplitude + frequency ramp
    const t = Math.min(1, elapsed / WAVE_END);
    const eased = Math.pow(t, 1.3);
    const amplitude = 14 + eased * 130;        // 14 → ~144 px
    const frequency = 0.55 + eased * 6.5;       // wider wavelength → tight
    const phaseSpd  = 1.4 + eased * 6.5;        // wave moves faster too
    const time = elapsed / 1000;

    // Zoom: scale grows + per-letter outward drift from the title's
    // visual center. We compute that center directly from the static
    // positions so the row stays symmetric around its own midpoint
    // instead of drifting against an arbitrary centerX.
    const drawScaleBase = 1 + zoomAmount * 5;
    const titleMidX = (staticPositions[0].x + staticPositions[N - 1].x) / 2;

    ctx.save();
    for (let i = 0; i < N; i++) {
        const sp = staticPositions[i];
        const wavePhase = i * frequency * 0.55 + time * phaseSpd;
        // Anchor the wave to each letter's static y so blend=1 still has
        // letters in their idle row rather than drifting to centerY.
        const x = sp.x;
        const y = sp.y + Math.sin(wavePhase) * amplitude;
        // During zoom, letters drift outward from the title's midpoint
        // (symmetric around the row, not against off-anchor centerX).
        const dxToMid = x - titleMidX;
        const sx = titleMidX + dxToMid * (1 + zoomAmount * 0.6);
        const sy = y - zoomAmount * 60;
        const rotation = Math.cos(wavePhase) * 0.25 * eased;
        const letterAlpha = 1 - fadeAlpha * 0.9;
        const r = _settleLerp(elapsed, sp, sx, sy, drawScaleBase, letterAlpha, rotation);
        _titleLetterDraw(ctx, this.drawWavyText.bind(this), text[i], r.x, r.y, r.scale, r.alpha, { rotation: r.rotation, letterIndex: i, totalLetters: N });
    }
    ctx.restore();
    return fadeAlpha;
}

// ── 4. Cascade ────────────────────────────────────────────────────────────
// A bounce-wave ripples through the letters — each letter pops up and back
// down with a left-to-right stagger so the static row appears to ripple.
// After the wave finishes, the whole row zooms toward the viewer.
function drawCascadeAnim(ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions) {
    const KICK_DURATION = 520;
    const STAGGER = 70;
    const N = text.length;
    const RIPPLE_END = (N - 1) * STAGGER + KICK_DURATION + 120; // ≈ ~1200ms
    const ZOOM_END = 1500;

    let zoomAmount = 0, fadeAlpha = 0;
    if (elapsed >= ZOOM_END) {
        const t = Math.min(1, (elapsed - ZOOM_END) / (total - ZOOM_END));
        zoomAmount = t;
        fadeAlpha = Math.pow(t, 1.2);
    } else if (elapsed >= RIPPLE_END) {
        const t = Math.min(1, (elapsed - RIPPLE_END) / (ZOOM_END - RIPPLE_END));
        zoomAmount = t * 0.3;
    }

    ctx.save();
    for (let i = 0; i < N; i++) {
        const seed = seeds[i] || { spinDir: 1 };
        const sp = staticPositions[i];
        const startMs = i * STAGGER;
        const local = elapsed - startMs;

        // Bounce displacement: letter pops up ~70px then settles back via
        // a damped sine so the kick reads as a sharp pop and a soft return.
        let yOffset = 0;
        let rotation = 0;
        if (local > 0 && local < KICK_DURATION) {
            const t = local / KICK_DURATION;
            const damp = 1 - t;
            yOffset = -78 * Math.sin(t * Math.PI) * damp;
            rotation = seed.spinDir * Math.sin(t * Math.PI) * 0.18 * damp;
        }

        // Zoom outward from the title's own midpoint so the row scales
        // symmetrically (the static title sits at centerX+10, not centerX).
        const titleMidX = (staticPositions[0].x + staticPositions[N - 1].x) / 2;
        const animSx = sp.x + (sp.x - titleMidX) * zoomAmount * 1.0;
        const animSy = sp.y + yOffset - zoomAmount * 40;
        const drawScale = 1 + zoomAmount * 6;
        const letterAlpha = 1 - fadeAlpha * 0.9;
        const r = _settleLerp(elapsed, sp, animSx, animSy, drawScale, letterAlpha, rotation);
        _titleLetterDraw(ctx, this.drawWavyText.bind(this), text[i], r.x, r.y, r.scale, r.alpha, { rotation: r.rotation, letterIndex: i, totalLetters: N });
    }
    ctx.restore();
    return fadeAlpha;
}

// ── 5. Warpdrive ──────────────────────────────────────────────────────────
// Letters streak inward from the screen edges along straight-line vectors,
// converge at center, then the whole title zooms toward the viewer. Like
// dropping out of hyperspace into the title.
function drawWarpdriveAnim(ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions) {
    const STREAK_END = 1100;
    const HOLD_END   = 1500;
    let fadeAlpha = 0;

    let streakT, zoomAmount;
    if (elapsed < STREAK_END) {
        const t = elapsed / STREAK_END;
        streakT = 1 - Math.pow(1 - t, 2.4); // ease-out
        zoomAmount = 0;
    } else if (elapsed < HOLD_END) {
        streakT = 1;
        const t = (elapsed - STREAK_END) / (HOLD_END - STREAK_END);
        zoomAmount = Math.pow(t, 1.5);
    } else {
        streakT = 1;
        const t = Math.min(1, (elapsed - HOLD_END) / (total - HOLD_END));
        zoomAmount = 1 + t * 0.6;
        fadeAlpha = Math.pow(t, 1.2);
    }

    const N = text.length;
    // Streak destination = each letter's static title position. Using the
    // static row keeps the row centered on its own midpoint rather than on
    // the off-by-+10 centerX anchor.
    const titleMidX = (staticPositions[0].x + staticPositions[N - 1].x) / 2;

    ctx.save();
    for (let i = 0; i < N; i++) {
        const seed = seeds[i] || { angle: i, speed: 1 };
        const sp = staticPositions[i];
        const finalX = sp.x;
        const finalY = sp.y;
        // Source: far point along seed.angle direction, ~1500px out
        const srcDist = 1500;
        // Streak source: a far point along seed.angle, anchored to the
        // title's own midpoint (not centerX, which sits 10px left of the
        // title row's true center).
        const srcX = titleMidX + Math.cos(seed.angle) * srcDist;
        const srcY = sp.y + Math.sin(seed.angle) * srcDist;

        const x = srcX + (finalX - srcX) * streakT;
        const y = srcY + (finalY - srcY) * streakT;

        // Apply zoom — letters drift outward from the title's midpoint /
        // own y so the row scales symmetrically.
        const dxToMid = x - titleMidX;
        const dyToMid = y - sp.y;
        const sx = titleMidX + dxToMid * (1 + zoomAmount * 0.7);
        const sy = sp.y + dyToMid * (1 + zoomAmount * 0.5);
        const drawScale = (0.4 + 0.6 * streakT) * (1 + zoomAmount * 4.5);

        // During streak phase, letters are stretched faintly along motion
        const alpha = Math.min(1, 0.2 + streakT * 0.95) * (1 - fadeAlpha * 0.9);
        const r = _settleLerp(elapsed, staticPositions[i], sx, sy, drawScale, alpha, 0);
        _titleLetterDraw(ctx, this.drawWavyText.bind(this), text[i], r.x, r.y, r.scale, r.alpha, { rotation: r.rotation, letterIndex: i, totalLetters: N });
    }
    ctx.restore();
    return fadeAlpha;
}

// ── 6. Pinwheel ───────────────────────────────────────────────────────────
// Letters arranged in a ring around screen center, ring spins fast, ring
// radius pulses then collapses inward as the camera zooms in.
function drawPinwheelAnim(ctx, elapsed, total, text, seeds, centerX, centerY, staticPositions) {
    const SPIN_END = 1100;
    const COLLAPSE_END = 1500;
    let fadeAlpha = 0;
    let radius, zoomAmount;
    if (elapsed < SPIN_END) {
        const t = elapsed / SPIN_END;
        // Pulse out twice then settle
        radius = 230 + Math.sin(t * Math.PI * 2) * 40;
        zoomAmount = 0;
    } else if (elapsed < COLLAPSE_END) {
        const t = (elapsed - SPIN_END) / (COLLAPSE_END - SPIN_END);
        const eased = Math.pow(t, 1.3);
        radius = 230 * (1 - eased);
        zoomAmount = eased * 0.85;
    } else {
        const t = Math.min(1, (elapsed - COLLAPSE_END) / (total - COLLAPSE_END));
        radius = 0;
        zoomAmount = 0.85 + t * 0.6;
        fadeAlpha = Math.pow(t, 1.2);
    }

    const N = text.length;
    const angularVelocity = 6.0;
    const time = elapsed / 1000;
    // Anchor the ring on the static title's actual visual center (the
    // title row sits at centerX+10, not centerX).
    const titleMidX = (staticPositions[0].x + staticPositions[N - 1].x) / 2;
    const titleMidY = staticPositions[0].y;

    ctx.save();
    for (let i = 0; i < N; i++) {
        const baseAngle = (i / N) * Math.PI * 2 - Math.PI / 2;
        const angle = baseAngle + time * angularVelocity;
        const x = titleMidX + Math.cos(angle) * radius;
        const y = titleMidY + Math.sin(angle) * radius;
        // Letters tangentially rotate along with the ring
        const rotation = angle + Math.PI / 2;
        const drawScale = 1 + zoomAmount * 5.5;
        const alpha = 1 - fadeAlpha * 0.9;
        const r = _settleLerp(elapsed, staticPositions[i], x, y, drawScale, alpha, rotation);
        _titleLetterDraw(ctx, this.drawWavyText.bind(this), text[i], r.x, r.y, r.scale, r.alpha, { rotation: r.rotation, letterIndex: i, totalLetters: N });
    }
    ctx.restore();
    return fadeAlpha;
}

// 5.88.4 — Proper GAME OVER screen.
//
//   ┌─────────────────────────────┐
//   │      GAME OVER (wavy)       │
//   │       Wave 8 · 4:23         │
//   │                             │
//   │  [ NEW GAME ] [ RESTART WAVE ]
//   └─────────────────────────────┘
//
// RESTART WAVE loads the wave-start save (`startContinueRun()`) — i.e.
// the player retries the wave they died on with their pre-wave loadout
// and economy. NEW GAME clears the save and starts a fresh run. Button
// rects are stashed on `_gameOverButtonRects` so the click/keyboard
// handlers in event-setup.js can route hits using the same machinery
// that powers the title screen's buttons.
export function drawGameOverScreen() {
    const ctx = this.ctx;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;

    // 5.97.0 — Mobile-responsive layout. Portrait stacks buttons
    // vertically; both mobile orientations shrink the title text +
    // button sizes so the screen reads as one element instead of
    // dominating a 390-px phone viewport.
    const _isMobile = isMobile();
    const _isPortrait = _isMobile && isPortrait();
    const _isLandscape = _isMobile && !isPortrait();

    // Dim the playfield further (atop the 0.5 black overlay drawn by
    // game-engine's GAME_OVER block) so the screen reads as terminal
    // rather than a paused beat.
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    // GAME OVER title — wavy palette, sized responsively. The 72-px
    // desktop value overflowed narrow phones, so we cut it to a
    // viewport-relative cap on mobile (~40 px portrait, 48 px landscape).
    const titleFS = _isPortrait
        ? Math.min(40, Math.max(26, Math.floor(this.canvas.width / 10)))
        : (_isLandscape
            ? Math.min(48, Math.max(30, Math.floor(this.canvas.height / 8)))
            : 72);
    const summaryFS = _isMobile
        ? Math.max(11, Math.floor(titleFS / 3.0))
        : 22;
    // FB-3 — death-cause readout, one line under the summary. Slightly smaller
    // than the summary line so the hierarchy reads title → stats → cause.
    const causeFS = Math.max(9, Math.floor(summaryFS * 0.72));
    const causeText = (() => {
        const c = this._deathCause
            || deathCauseString(this.player && this.player.lastDamageSource);
        return typeof c === 'string' && c.length > 0 ? c : '';
    })();
    // Button sizing matches the title-screen mobile pattern.
    let buttonW, buttonH, buttonGap;
    if (_isPortrait) {
        buttonW = Math.min(220, Math.max(160, this.canvas.width * 0.75));
        buttonH = 40;
        buttonGap = 10;
    } else if (_isLandscape) {
        buttonW = Math.min(170, Math.max(130, this.canvas.width * 0.30));
        buttonH = 38;
        buttonGap = 14;
    } else {
        buttonW = 220;
        buttonH = 46;
        buttonGap = 36;
    }

    // Compute a balanced vertical layout block height so the content
    // sits centered on tiny viewports without overflowing.
    const titleH = titleFS + 12;
    const titleSummaryGap = _isMobile ? 18 : 32;
    const summaryH = summaryFS + 6;
    // FB-3 — reserve a line for the death-cause readout (only when present).
    const summaryCauseGap = causeText ? (_isMobile ? 8 : 12) : 0;
    const causeH = causeText ? causeFS + 4 : 0;
    const summaryButtonsGap = _isMobile ? 22 : 36;
    const buttonsBlockH = _isPortrait
        ? buttonH * 2 + buttonGap
        : buttonH;
    const contentH = titleH + titleSummaryGap + summaryH
        + summaryCauseGap + causeH + summaryButtonsGap + buttonsBlockH;
    let contentTop = (this.canvas.height - contentH) / 2;
    if (contentTop < 16) contentTop = 16;
    const titleY = contentTop + titleH / 2;
    const summaryY = titleY + titleH / 2 + titleSummaryGap + summaryH / 2;
    const causeY = summaryY + summaryH / 2 + summaryCauseGap + causeH / 2;
    const buttonsTop = causeY + causeH / 2 + summaryButtonsGap;

    this.drawWavyText('GAME OVER', centerX, titleY, {
        fontSize: titleFS,
        colors: WAVY_PALETTES.gold,
        speed: 0.45,
        colorSpeed: 0.18,
        outline: true,
        outlineWidth: Math.max(3, Math.floor(titleFS / 12)),
    });

    // Run summary line: wave reached + survival time.
    const wave = this.game?.currentWave | 0;
    const survivalMs = (this.game?.survivalTime | 0);
    const seconds = Math.floor(survivalMs / 1000);
    const mm = Math.floor(seconds / 60);
    const ss = String(seconds % 60).padStart(2, '0');
    const summary = `Wave ${wave} · ${mm}:${ss}`;
    this.drawWavyText(summary, centerX, summaryY, {
        fontSize: summaryFS,
        colors: WAVY_PALETTES.whiteShimmer,
        amplitude: 0,
        colorSpeed: 0.12,
        outline: true,
        outlineWidth: Math.max(2, Math.floor(summaryFS / 5)),
    });

    // FB-3 — death-cause readout, one line under the summary. Same wavy idiom,
    // smaller + a touch dimmer so it reads as an instructive subtitle. Guarded:
    // skipped entirely when there is no cause string.
    if (causeText) {
        this.drawWavyText(causeText, centerX, causeY, {
            fontSize: causeFS,
            colors: WAVY_PALETTES.whiteShimmer,
            amplitude: 0,
            colorSpeed: 0.12,
            outline: true,
            outlineWidth: Math.max(2, Math.floor(causeFS / 5)),
        });
    }

    // Buttons — vertical stack on portrait, side-by-side everywhere
    // else (matches the title screen mobile pattern).
    const hasSavedRun = !!(this.hasSavedRun && this.hasSavedRun());
    const labels = ['NEW GAME', 'RESTART WAVE'];
    let rects;
    if (_isPortrait) {
        const x0 = centerX - buttonW / 2;
        rects = {
            newGame:     { id: 'newGame',     x: x0, y: buttonsTop,                              w: buttonW, h: buttonH, disabled: false },
            restartWave: { id: 'restartWave', x: x0, y: buttonsTop + buttonH + buttonGap,        w: buttonW, h: buttonH, disabled: !hasSavedRun },
        };
    } else {
        const totalW = buttonW * 2 + buttonGap;
        const x0 = centerX - totalW / 2;
        rects = {
            newGame:     { id: 'newGame',     x: x0,                       y: buttonsTop, w: buttonW, h: buttonH, disabled: false },
            restartWave: { id: 'restartWave', x: x0 + buttonW + buttonGap, y: buttonsTop, w: buttonW, h: buttonH, disabled: !hasSavedRun },
        };
    }
    this._gameOverButtonRects = rects;

    const hovered = this._gameOverHoveredButton;
    const pressed = this._gameOverPressedButton;

    const drawButton = (rect, label) => {
        ctx.save();
        const isHover = hovered === rect.id && !rect.disabled;
        const isPress = pressed === rect.id && !rect.disabled;
        const baseAlpha = rect.disabled ? 0.32 : 1.0;
        const time = Date.now() * 0.001;
        const pulse = rect.disabled ? 0 : Math.sin(time * 3) * 0.10;
        ctx.globalAlpha = baseAlpha + pulse;

        const yOffset = isPress ? 1 : 0;
        const x = rect.x;
        const y = rect.y + yOffset;
        const w = rect.w, h = rect.h;

        ctx.lineWidth = 2;
        if (rect.disabled) {
            ctx.strokeStyle = 'rgba(150, 150, 150, 0.55)';
            ctx.fillStyle   = 'rgba(40, 40, 40, 0.35)';
        } else if (isPress) {
            ctx.strokeStyle = '#ffe5a0';
            ctx.fillStyle   = 'rgba(255, 200, 64, 0.55)';
        } else if (isHover) {
            ctx.strokeStyle = 'rgba(140, 220, 255, 1)';
            ctx.fillStyle   = 'rgba(0, 80, 130, 0.55)';
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillStyle   = 'rgba(0, 0, 0, 0.55)';
        }
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();

        // 5.97.0 — Scale the button label to match the (now responsive)
        // button width so "RESTART WAVE" doesn't run into the rounded
        // edges on a portrait phone.
        const labelFS = _isPortrait
            ? (buttonW < 200 ? 10 : 11)
            : (_isLandscape ? 11 : 16);
        ctx.font = `${labelFS}px 'Press Start 2P', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = x + w / 2;
        const ty = y + h / 2 + 1;
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.strokeText(label, tx, ty);
        ctx.fillStyle = rect.disabled
            ? 'rgba(170, 170, 170, 0.85)'
            : (isPress ? '#fffadf' : (isHover ? '#fff' : 'rgba(230, 240, 250, 0.95)'));
        ctx.fillText(label, tx, ty);
        ctx.restore();
    };
    drawButton(rects.newGame, labels[0]);
    drawButton(rects.restartWave, labels[1]);

    // Disabled-button hint so the player understands why RESTART WAVE
    // is greyed out (only happens before any wave-start save fires —
    // i.e. the player died inside their first ~second of wave 1).
    if (!hasSavedRun) {
        ctx.save();
        const hintFS = _isMobile ? 9 : 12;
        ctx.font = `${hintFS}px 'Press Start 2P', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(180, 180, 180, 0.7)';
        ctx.fillText('(no checkpoint yet)', rects.restartWave.x + rects.restartWave.w / 2, rects.restartWave.y + rects.restartWave.h + 8);
        ctx.restore();
    }
}

export function drawSurvivalTimer(ctx) {
        // 5.71.0 — moved to bottom-RIGHT (was bottom-left). Minimap
        // took over the bottom-left corner; HUD pause/shop buttons
        // sit above this timer in the bottom-right column.
        const timerX = this.canvas.width - 20;
        const timerY = this.canvas.height - 40;

        ctx.save();

        // Format survival time as H:M:SS:mmm
        // 6.26.3 — `survivalTime` accumulates LOGIC_TICK_MS (16.6667…, a
        //   float) per tick since 6.18.5, so it's no longer an integer
        //   millisecond count. Floor up front so every component — and
        //   especially `milliseconds` (a raw `% 1000`) — stays a clean
        //   integer instead of rendering "683.33340000000003".
        const totalMs = Math.floor(this.game.survivalTime || 0);
        const hours = Math.floor(totalMs / (1000 * 60 * 60));
        const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
        const milliseconds = totalMs % 1000;

        const timeString = `${hours}:${minutes}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;

        // 5.71.0 — right-aligned layout. timerX is the RIGHT edge; we
        // measure the text width, then place the stopwatch icon to its
        // left so the whole readout hugs the screen-right margin.
        ctx.font = "16px 'Press Start 2P', monospace";
        const iconSize = 24;
        const textWidth = ctx.measureText(timeString).width;

        ctx.fillStyle = '#FFA500';
        ctx.strokeStyle = '#CC8400';
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        ctx.strokeText(timeString, timerX, timerY);
        ctx.fillText(timeString, timerX, timerY);

        const iconX = timerX - textWidth - 8 - iconSize;
        const iconY = timerY - iconSize / 2;
        this.drawStopwatchIcon(ctx, iconX, iconY, iconSize);

        ctx.restore();
}

export function drawPauseButton() {
        const btnSize = 56; // larger touch target (Apple HIG recommends 44pt minimum)
        const margin = 12;
        const cx = this.canvas.width - margin - btnSize / 2;
        const cy = margin + btnSize / 2;

        // Hit rect is padded larger than visual for easier tapping
        const hitPad = 10;
        this.pauseButtonRect = {
            x: cx - btnSize / 2 - hitPad,
            y: cy - btnSize / 2 - hitPad,
            w: btnSize + hitPad * 2,
            h: btnSize + hitPad * 2
        };

        const ctx = this.ctx;
        ctx.save();

        // Subtle dark backing circle
        ctx.beginPath();
        ctx.arc(cx, cy, btnSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fill();

        // Two vertical bars — match timer color
        const barW = Math.round(btnSize * 0.16);
        const barH = Math.round(btnSize * 0.48);
        const gap  = Math.round(btnSize * 0.11);
        const barTop = cy - barH / 2;

        ctx.fillStyle = '#FFA500';
        ctx.strokeStyle = '#CC8400';
        ctx.lineWidth = 1;

        // Left bar
        ctx.beginPath();
        ctx.rect(cx - gap - barW, barTop, barW, barH);
        ctx.fill();
        ctx.stroke();

        // Right bar
        ctx.beginPath();
        ctx.rect(cx + gap, barTop, barW, barH);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
}

export function drawStopwatchIcon(ctx, x, y, size) {
        ctx.save();

        // Scale and position the SVG
        const scale = size / 24; // Original SVG is 24x24
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        // Set subdued orange color for the stopwatch
        ctx.strokeStyle = '#FFA500';
        ctx.fillStyle = 'none';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Main circle (outer)
        ctx.beginPath();
        ctx.arc(11.7, 13.5, 7, 0, Math.PI * 2);
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(11.2125, 13.965, 1.5, 0, Math.PI * 2);
        ctx.stroke();

        // Top button
        ctx.beginPath();
        ctx.moveTo(10.95, 6.5);
        ctx.lineTo(10.95, 3.5);
        ctx.lineTo(12.45, 3.5);
        ctx.lineTo(12.45, 6.5);
        ctx.stroke();

        // Clock hand
        ctx.beginPath();
        ctx.moveTo(11.2125, 13.965);
        ctx.lineTo(15.1279, 11.0236);
        ctx.stroke();

        // Top crown
        ctx.beginPath();
        ctx.moveTo(9.75, 2.75);
        ctx.lineTo(13.65, 2.75);
        ctx.stroke();

        // Side buttons (simplified)
        ctx.beginPath();
        ctx.moveTo(17.9637, 5.90252);
        ctx.lineTo(16.0137, 8.10252);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(4.338, 6.92358);
        ctx.lineTo(6.3855, 9.02358);
        ctx.stroke();

        ctx.restore();
}

export function drawSpawnTimer() {
        const ctx = this.ctx;
        const now = Date.now();

        // Calculate time until next spawn (based on last spawn + interval)
        const timeSinceLastSpawn = now - this.lastSpawnTime;
        const timeUntilSpawn = Math.max(0, this.spawnInterval - timeSinceLastSpawn);
        const spawnProgress = Math.min(1, timeSinceLastSpawn / this.spawnInterval);

        // Calculate time until next shop
        const timeUntilShop = Math.max(0, this.nextShopTime - now);
        const shopProgress = 1 - (timeUntilShop / this.shopInterval);

        // Timer position - vertically stacked on the right side
        const timerX = this.width - 60; // Right side of screen
        const startY = 40;
        const radius = 20; // Smaller radius
        const verticalSpacing = 60;

        ctx.save();
        ctx.globalAlpha = 0.7; // More in background

        // Draw spawn timer (top) - shows generic "entity" icon
        const spawnY = startY;
        this.drawCircularTimer(ctx, timerX, spawnY, radius, spawnProgress, '#00ff88', 'bolt', timeUntilSpawn);

        // Draw shop timer (bottom) - disabled per user request
        // if (timeUntilShop > 30000) {
        //     const shopY = startY + verticalSpacing;
        //     this.drawCircularTimer(ctx, timerX, shopY, radius, shopProgress, '#ffaa00', '🛒', timeUntilShop);
        // }

        // Draw hit streak combo counter (bottom right)
        if (this.player.hitStreak >= 2) {
            const comboX = this.width - 20;
            const comboY = this.height - 40;

            ctx.save();

            // shadowBlur on text — glow follows text shape
            const glowSize = Math.min(10, this.player.hitStreak * 0.5);
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = glowSize;

            // Draw combo text
            ctx.font = `${Math.min(32, 20 + this.player.hitStreak * 0.5)}px 'Press Start 2P', monospace`;
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';

            const comboText = `${this.player.hitStreak}x`;
            ctx.strokeText(comboText, comboX, comboY);
            ctx.fillText(comboText, comboX, comboY);

            // Draw "COMBO" label below
            ctx.font = '12px "Press Start 2P", monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowBlur = 0;
            ctx.strokeText('COMBO', comboX, comboY + 15);
            ctx.fillText('COMBO', comboX, comboY + 15);

        ctx.restore();
        }

        ctx.restore();
}

// Streak indicator (8.14.0) — appears only at 10+ kills. TOP-RIGHT on desktop
// (out of the play area), top-center on mobile (sans-serif). Rank label LARGE,
// kill-count small beneath; gold-find + tier/idle bars on desktop.
export function drawStreakIndicator() {
    if (!this.player) return;
    const k = this.killStreakCount || 0;
    // 8.14.0 — the streak HUD only appears once a real streak is going: 10+
    // kills, on BOTH desktop and mobile. Below that it stays hidden so the
    // opening of a run isn't cluttered. `_streakDrawn` is a queryable QA marker
    // (the kill count when shown, else null — mirrors _pwrDrawn).
    this._streakDrawn = null;
    if (k < 10) return;
    this._streakDrawn = k;

    const tiers = WEAPON_DATA_STREAK_TIERS;
    let currentTier = null;
    let currentIdx = -1;
    for (let i = 0; i < tiers.length; i++) {
        if (k >= tiers[i].kills) { currentTier = tiers[i]; currentIdx = i; }
    }
    const nextTier = currentTier ? (tiers[currentIdx + 1] || null) : tiers[0];
    const isMaxTier = currentTier && !nextTier;
    const tierColor = currentTier ? currentTier.color : '#7FE7FF';
    const rankLabel = currentTier
        ? (isMaxTier ? `${currentTier.label} (MAX)` : currentTier.label)
        : 'STREAK';

    const ctx = this.ctx;
    const player = this.player;
    const buffActive = player.streakDamageMult > 1;
    const pulse = buffActive ? 0.85 + Math.sin(Date.now() * 0.015) * 0.15 : 1;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    // ── MOBILE — sans-serif (no pixel font), top-center. Rank LARGE, count
    // small beneath. No bars/glow chrome (mobile players need to see through). ──
    if (isMobile()) {
        const x = this.width / 2;
        const y = 70;
        ctx.save();
        ctx.globalAlpha = buffActive ? 0.9 : 0.62;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        // Rank (large sans).
        if (buffActive) { ctx.shadowColor = tierColor; ctx.shadowBlur = 8 * pulse; }
        ctx.font = "700 23px Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
        ctx.fillStyle = tierColor;
        ctx.lineWidth = 4;
        ctx.strokeText(rankLabel, x, y);
        ctx.fillText(rankLabel, x, y);
        ctx.shadowBlur = 0;
        // Count (smaller sans) beneath.
        ctx.font = "600 13px Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.lineWidth = 3;
        ctx.strokeText(`${k} kills`, x, y + 27);
        ctx.fillText(`${k} kills`, x, y + 27);
        ctx.restore();
        return;
    }

    // ── DESKTOP — TOP-RIGHT (out of the play area). Rank LARGE, count small
    // beneath, then the gold-find readout + tier-progress + idle-countdown bars,
    // all right-aligned. (8.14.0 — moved from bottom-center, which blocked play.) ──
    const RIGHT = this.width - 18;
    const y = 58;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';

    // Rank label (big, tier-colored).
    if (buffActive) { ctx.shadowColor = tierColor; ctx.shadowBlur = 12 * pulse; }
    ctx.font = "bold 19px 'Press Start 2P', monospace";
    ctx.fillStyle = tierColor;
    ctx.lineWidth = 4;
    ctx.strokeText(rankLabel, RIGHT, y);
    ctx.fillText(rankLabel, RIGHT, y);
    ctx.shadowBlur = 0;

    // Kill count (small) beneath the rank.
    ctx.font = "bold 11px 'Press Start 2P', monospace";
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeText(`${k} KILLS`, RIGHT, y + 26);
    ctx.fillText(`${k} KILLS`, RIGHT, y + 26);

    let by = y + 42;

    // Gold-find readout (matches the drop math's streak gold curve).
    const goldMult = getStreakGoldMult(k);
    const pct = Math.round((goldMult - 1) * 100);
    if (pct > 0) {
        ctx.font = "bold 9px 'Press Start 2P', monospace";
        ctx.fillStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.strokeText(`+${pct}% R$`, RIGHT, by);
        ctx.fillText(`+${pct}% R$`, RIGHT, by);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000000';
        by += 14;
    }

    const barW = 150, barH = 5;
    const barX = RIGHT - barW;

    // Tier progress bar (toward next tier; full at MAX).
    {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(barX, by, barW, barH);
        let fillFrac;
        if (currentTier && nextTier && currentTier.kills < nextTier.kills) {
            fillFrac = clamp01((k - currentTier.kills) / (nextTier.kills - currentTier.kills));
        } else if (!currentTier && nextTier) {
            fillFrac = clamp01(k / nextTier.kills);
        } else {
            fillFrac = 1;
        }
        ctx.fillStyle = tierColor;
        ctx.fillRect(barX, by, Math.round(barW * fillFrac), barH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX + 0.5, by + 0.5, barW - 1, barH - 1);
        by += 9;
    }

    // Idle-countdown bar (green→red drain over 10s — land a kill before it empties).
    {
        const STREAK_IDLE_MS = 10000;
        const elapsed = Math.max(0, Date.now() - (this.killStreakTimer || 0));
        const remFrac = Math.max(0, 1 - elapsed / STREAK_IDLE_MS);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barX, by, barW, barH);
        ctx.fillStyle = `rgb(${Math.round(255 * (1 - remFrac))}, ${Math.round(220 * remFrac)}, 80)`;
        ctx.fillRect(barX, by, Math.round(barW * remFrac), barH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX + 0.5, by + 0.5, barW - 1, barH - 1);
    }

    ctx.restore();
}

export function drawRespawnCountdown() {
        const ctx = this.ctx;
        const now = Date.now();
        const elapsed = now - this.game.respawnStartTime;
        const progress = Math.min(1, elapsed / this.game.respawnDuration);
        const timeRemaining = this.game.respawnDuration - elapsed;

        // Draw at center of screen
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = 40;

        ctx.save();

        // Draw background circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw progress arc (countdown)
        ctx.strokeStyle = '#00aaff'; // Blue color
        ctx.lineWidth = 6;
        ctx.beginPath();
        // Start from top and go clockwise, showing remaining time
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + ((1 - progress) * Math.PI * 2));
        ctx.stroke();

        // Draw respawn icon in center
        ctx.font = '24px "Press Start 2P", monospace';
        ctx.fillStyle = '#00aaff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', centerX, centerY);

        // Draw countdown text below
        const totalSeconds = Math.ceil(timeRemaining / 1000);
        const timeText = `${totalSeconds}s`;

        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // Removed "RESPAWNING" text - only show countdown
        ctx.fillText(timeText, centerX, centerY + radius + 10);

        ctx.restore();
}

export function drawInvincibilityCountdown() {
        const ctx = this.ctx;
        const timeRemaining = this.player.invincibilityTimer;
        const totalDuration = this.game.respawnDuration; // 5 seconds
        const progress = 1 - (timeRemaining / totalDuration);

        // Draw at center of screen, smaller than respawn timer
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const radius = 30;

        ctx.save();

        // Draw background circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw progress arc (countdown) - showing remaining time
        ctx.strokeStyle = '#ffaa00'; // Orange color for invincibility
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Start from top and go clockwise, showing remaining time
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + ((1 - progress) * Math.PI * 2));
        ctx.stroke();

        // Draw shield icon in center
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffaa00';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛡', centerX, centerY);

        // Draw countdown text below
        const totalSeconds = Math.ceil(timeRemaining / 1000);
        const timeText = `${totalSeconds}s`;

        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('INVINCIBLE', centerX, centerY + radius + 8);
        ctx.fillText(timeText, centerX, centerY + radius + 24);

        ctx.restore();
}

export function drawGhostPreviews(spawnProgress) {
        const ctx = this.ctx;

        // Only show ghost when progress is > 0.5 (last 50% of countdown)
        if (spawnProgress > 0.5) {
            // Randomly show either enemy or asteroid ghost (50/50 chance)
            if (Math.random() < 0.5) {
                this.drawGhostEnemy(spawnProgress);
            } else {
                this.drawGhostAsteroid(spawnProgress);
            }
        }
}

export function drawGhostEnemy(progress) {
        const ctx = this.ctx;

        // Use stored ghost position
        const ghostX = this.ghostEnemyPosition.x;
        const ghostY = this.ghostEnemyPosition.y;

        ctx.save();

        // Ghost effect - semi-transparent and flickering
        const alpha = 0.3 + (Math.sin(Date.now() * 0.01) * 0.1);
        ctx.globalAlpha = alpha * (progress - 0.3) / 0.7; // Fade in as progress increases

        // Draw ghost enemy outline
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed outline

        // Draw basic enemy shape (triangle)
        const size = 15;
        ctx.beginPath();
        ctx.moveTo(ghostX, ghostY - size);
        ctx.lineTo(ghostX - size, ghostY + size);
        ctx.lineTo(ghostX + size, ghostY + size);
        ctx.closePath();
        ctx.stroke();

        // Draw construction progress indicator
        ctx.setLineDash([]);
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ghostX, ghostY, size + 5, -Math.PI / 2, -Math.PI / 2 + ((progress - 0.3) / 0.7) * Math.PI * 2);
        ctx.stroke();

        ctx.restore();
}

export function drawGhostAsteroid(progress) {
        const ctx = this.ctx;

        // Use stored ghost position
        const ghostX = this.ghostAsteroidPosition.x;
        const ghostY = this.ghostAsteroidPosition.y;

        ctx.save();

        // Ghost effect - semi-transparent and flickering
        const alpha = 0.3 + (Math.sin(Date.now() * 0.008) * 0.1);
        ctx.globalAlpha = alpha * (progress - 0.3) / 0.7; // Fade in as progress increases

        // Draw ghost asteroid outline
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]); // Dashed outline

        // Draw basic asteroid shape (irregular polygon)
        const size = 20;
        const sides = 8;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const variance = 0.7 + Math.sin(i * 2.3) * 0.3; // Irregular shape
            const x = ghostX + Math.cos(angle) * size * variance;
            const y = ghostY + Math.sin(angle) * size * variance;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.stroke();

        // Draw construction progress indicator
        ctx.setLineDash([]);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ghostX, ghostY, size + 5, -Math.PI / 2, -Math.PI / 2 + ((progress - 0.3) / 0.7) * Math.PI * 2);
        ctx.stroke();

        ctx.restore();
}

export function drawCircularTimer(ctx, x, y, radius, progress, color, icon, timeRemaining) {
        // Draw background circle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw progress arc
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + (progress * Math.PI * 2));
        ctx.stroke();

        // 5.79.37 — SVG icon when slug resolves, font fallback otherwise.
        const slug = resolveIconSlug(icon);
        const iconPx = 16;
        if (slug) {
            const img = getIconImage(slug, iconPx, color);
            if (img) ctx.drawImage(img, x - iconPx / 2, y - iconPx / 2, iconPx, iconPx);
        } else {
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(icon, x, y);
        }

        // Draw countdown text below
        const totalSeconds = Math.ceil(timeRemaining / 1000);
        let timeText;
        if (totalSeconds >= 60) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
            timeText = `${totalSeconds}s`;
        }

        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(timeText, x, y + radius + 6);
}
