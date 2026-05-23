// Canvas-rendered bottom-center HUD buttons (5.79.2 → 5.79.14).
//
// Three canvas buttons centered along the bottom of the screen:
//   • SHOP   — 🛒  opens the shop overlay
//   • STATS  — 📊  opens the Diablo-style stats screen (` keyboard
//                 shortcut still works in parallel)
//   • PAUSE  — ⏸  toggles pause (Esc keyboard shortcut still works)
//
// 5.94.0 — In mobile tower-defense mode, two additional canvas buttons
// flank the playfield:
//   • PRM    — left-side, mid-height: opens primary-weapon radial
//   • PWR    — right-side, mid-height: opens power-weapon radial
//
// These replace the long-press radial gesture (deleted in 5.94 with the
// auto-pilot pivot). The buttons are square (60×60), drawn directly on
// canvas like the bottom bar, and live in the same _hudButtonRects map
// so mobile-touch.js's existing hit-test pattern picks them up first
// (before falling through to tap-to-aim-and-fire).
//
// Why canvas:
//   The reticule cursor is a custom canvas-drawn crosshair. DOM
//   buttons sat above the canvas, so the reticule disappeared when
//   hovering them. Lifting the buttons into the canvas means the
//   reticule renders right on top of them — same visual treatment as
//   asteroids / enemies.
//
// Click handling: the engine's mousedown / mouseup listeners feed
// into `handleMouseDown` / `handleMouseUp` here. We track press
// state for visual feedback and fire the action on mouseup if the
// mouseup is still inside the same button (drag-out cancels).

import { GAME_STATES } from '../core/constants.js';
import { getIconImage, resolveIconSlug } from '../ui/icons.js';
import { isMobile } from '../platform/platform-detect.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS } from '../combat/weapon-data.js';

// 5.79.39 — Button height bumped 56 → 64 and label slot reworked so
//   the text fits cleanly inside the rounded square. Was overlapping
//   the bottom border because the label's textBaseline was implicitly
//   inheriting `middle` from the icon block.
const BUTTON_W = 72;
const BUTTON_H = 64;
const BUTTON_GAP = 14;
const BOTTOM_MARGIN = 22;
const ICON_FONT = "26px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
const LABEL_FONT = "9px 'Press Start 2P', monospace";
const ICON_PX = 26;

// 5.94.0 — Mobile side-buttons (PRM / PWR). 5.99.3 — relocated from
// the vertical-center edges to the bottom-LEFT and bottom-RIGHT
// corners, sharing the same baseline as the central SHOP/STATS/PAUSE
// row. Frees the entire left + right edges of the canvas for tap-to-
// aim and stops the side buttons from collecting accidental drags
// during continuous-fire gestures.
const SIDE_BUTTON_SIZE = 60;          // square; meets 60-px touch-target floor
const SIDE_BUTTON_MARGIN = 10;        // gap from the canvas edge
const SIDE_ICON_PX = 26;
const SIDE_LABEL_FONT = "8px 'Press Start 2P', monospace";

// 5.99.3 — Mobile uses narrower central buttons so PRM + the 3 central
// buttons + PWR all fit on a 360-wide phone in one row. Desktop keeps
// the original 72×64.
const MOBILE_BUTTON_W = 56;
const MOBILE_BUTTON_H = 60;
const MOBILE_BUTTON_GAP = 8;

export function getHudButtonRects(canvasW, canvasH) {
    const mobile = isMobile();
    const bw = mobile ? MOBILE_BUTTON_W : BUTTON_W;
    const bh = mobile ? MOBILE_BUTTON_H : BUTTON_H;
    const bg = mobile ? MOBILE_BUTTON_GAP : BUTTON_GAP;

    // Layout: STATS, PAUSE centered at bottom. (Legacy SHOP/UPGRADES button
    // commented out — the gold upgrade-tree shop is retired in favor of the
    // per-run CARD draft + the pre-run ARMORY. shop-dom.js / openShop are kept
    // intact for reuse; the shop is just no longer reachable from the HUD.)
    const totalW = 2 * bw + 1 * bg;
    const startX = Math.round((canvasW - totalW) / 2);
    const y = canvasH - BOTTOM_MARGIN - bh;
    const slot = (i) => startX + i * (bw + bg);
    const rects = {
        // shop:  { id: 'shop',  x: slot(0), y, w: bw, h: bh, icon: 'cart',  label: 'UPGRADES' }, // legacy shop — commented out
        stats: { id: 'stats', x: slot(0), y, w: bw, h: bh, icon: 'chart', label: 'STATS' },
        pause: { id: 'pause', x: slot(1), y, w: bw, h: bh, icon: 'pause', label: 'PAUSE' },
    };

    // 5.100.0 — PRM / PWR side buttons retired on mobile. The new
    // drag-to-move + auto-fire + auto-aim + tap-for-power input model
    // doesn't need real-time weapon swap during action; players swap
    // via the pause menu's PRIMARY / POWER tabs between waves. Dropping
    // the side buttons also frees the bottom-LEFT / bottom-RIGHT
    // corners for the analog stick (configurable side).

    return rects;
}

/**
 * Draw the bottom-center button bar onto the engine's gameCanvas
 * context. Caller (drawHUD) provides ctx and the engine reference so
 * we can read game state + hover/press flags. Returns the rect map so
 * other systems (event-setup) can reuse it without recomputing.
 */
export function drawHudButtons(ctx, engine) {
    if (!engine || !engine.canvas) return null;
    // Don't draw on the title screen — the title flow has its own
    // NEW GAME / CONTINUE buttons.
    if (engine.game && engine.game.state === GAME_STATES.TITLE_SCREEN) return null;

    const rects = getHudButtonRects(engine.canvas.width, engine.canvas.height);
    engine._hudButtonRects = rects;

    const hovered = engine._hudHoveredButton;
    const pressed = engine._hudPressedButton;

    ctx.save();
    for (const key of Object.keys(rects)) {
        const r = rects[key];
        const isHover = hovered === r.id;
        const isPress = pressed === r.id;
        const yOffset = isPress ? 1 : 0;
        const x = r.x;
        const y = r.y + yOffset;
        const w = r.w, h = r.h;

        // Outer fill + border. Yellow accent on hover, brighter still
        // on press (matches title screen + DOM button feedback).
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        if (isPress) {
            ctx.strokeStyle = '#ffe5a0';
            ctx.fillStyle   = 'rgba(255, 200, 64, 0.55)';
        } else if (isHover) {
            ctx.strokeStyle = 'rgba(140, 220, 255, 1)';
            ctx.fillStyle   = 'rgba(0, 80, 130, 0.55)';
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.fillStyle   = 'rgba(0, 0, 0, 0.55)';
        }
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
        else ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();

        // ── PRM / PWR side-buttons (5.94.0) ──
        // Icon comes from the currently-equipped weapon; label sits at
        // the bottom of the square like the bottom-row buttons.
        if (r.kind === 'primary' || r.kind === 'power') {
            const player = engine.player;
            const id = player && (r.kind === 'primary' ? player.activePrimary : player.activePower);
            const cfg = r.kind === 'primary' ? PRIMARY_WEAPONS[id] : POWER_WEAPONS[id];
            const slug = cfg ? resolveIconSlug(cfg.icon) : null;
            const ix = x + w / 2;
            const iy = y + Math.round(h * 0.36);
            if (slug) {
                const img = getIconImage(slug, SIDE_ICON_PX, cfg.color || '#ffffff');
                if (img) ctx.drawImage(img, ix - SIDE_ICON_PX / 2, iy - SIDE_ICON_PX / 2, SIDE_ICON_PX, SIDE_ICON_PX);
            } else {
                // Fall back to first 3-4 letters of the weapon id.
                ctx.font = SIDE_LABEL_FONT;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff';
                const abbr = (id || '????').slice(0, 4);
                ctx.fillText(abbr, ix, iy);
            }

            ctx.font = SIDE_LABEL_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
            ctx.lineJoin = 'round';
            const labelY = y + h - 6;
            ctx.strokeText(r.label, x + w / 2, labelY);
            ctx.fillStyle = isPress ? '#fffadf' : (isHover ? '#fff' : 'rgba(230, 240, 250, 0.95)');
            ctx.fillText(r.label, x + w / 2, labelY);
            continue;
        }

        // 5.79.39 — Icon sits in the top portion of the button so the
        //   label has a dedicated bottom strip with no overlap. Icon
        //   center y is roughly 38% of the button height (vs the old
        //   center-minus-5 which crowded the label).
        const slug = resolveIconSlug(r.icon);
        const ix = x + w / 2;
        const iy = y + Math.round(h * 0.36);
        if (slug) {
            const img = getIconImage(slug, ICON_PX, '#ffffff');
            if (img) ctx.drawImage(img, ix - ICON_PX / 2, iy - ICON_PX / 2, ICON_PX, ICON_PX);
        } else {
            ctx.font = ICON_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(r.icon, ix, iy);
        }

        // Label — bottom-baselined inside a fixed strip at the bottom
        //   of the button. With baseline=bottom and y=button-bottom-7,
        //   the 9-px font fully clears the rounded border (8 px corner
        //   radius). Stroke pad is 3 px which still fits at the
        //   chosen 7-px bottom margin.
        ctx.font = LABEL_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.lineJoin = 'round';
        // 6.27.0 — Auto-shrink long labels (e.g. "UPGRADES") so they
        //   never clip the rounded button edge. Drop the font size by
        //   1px steps until the measured width fits inside w - 8px.
        let labelPx = 9;
        let labelW = ctx.measureText(r.label).width;
        while (labelW > w - 8 && labelPx > 6) {
            labelPx -= 1;
            ctx.font = `${labelPx}px 'Press Start 2P', monospace`;
            labelW = ctx.measureText(r.label).width;
        }
        const labelY = y + h - 7;
        ctx.strokeText(r.label, x + w / 2, labelY);
        ctx.fillStyle = isPress ? '#fffadf' : (isHover ? '#fff' : 'rgba(230, 240, 250, 0.95)');
        ctx.fillText(r.label, x + w / 2, labelY);
    }
    ctx.restore();
    return rects;
}

/** Hit-test: which button (if any) is at screen-pixel (mx, my)? */
export function hudButtonHitTest(engine, mx, my) {
    const rects = engine && engine._hudButtonRects;
    if (!rects) return null;
    for (const key of Object.keys(rects)) {
        const r = rects[key];
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return r.id;
    }
    return null;
}
