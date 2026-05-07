// Canvas-rendered bottom-center HUD buttons (5.79.2 → 5.79.14).
//
// Three canvas buttons centered along the bottom of the screen:
//   • SHOP   — 🛒  opens the shop overlay
//   • STATS  — 📊  opens the Diablo-style stats screen (` keyboard
//                 shortcut still works in parallel)
//   • PAUSE  — ⏸  toggles pause (Esc keyboard shortcut still works)
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

const BUTTON_W = 64;
const BUTTON_H = 56;
const BUTTON_GAP = 14;
const BOTTOM_MARGIN = 22;
const ICON_FONT = "28px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
const LABEL_FONT = "9px 'Press Start 2P', monospace";

export function getHudButtonRects(canvasW, canvasH) {
    // Layout: SHOP, STATS, PAUSE centered at bottom. Total width =
    //   3 × BUTTON_W + 2 × BUTTON_GAP. Buttons share a baseline.
    // 5.79.14 — added PAUSE as the third canvas button.
    const totalW = 3 * BUTTON_W + 2 * BUTTON_GAP;
    const startX = Math.round((canvasW - totalW) / 2);
    const y = canvasH - BOTTOM_MARGIN - BUTTON_H;
    const slot = (i) => startX + i * (BUTTON_W + BUTTON_GAP);
    return {
        shop:  { id: 'shop',  x: slot(0), y, w: BUTTON_W, h: BUTTON_H, icon: 'cart',  label: 'SHOP'  },
        stats: { id: 'stats', x: slot(1), y, w: BUTTON_W, h: BUTTON_H, icon: 'chart', label: 'STATS' },
        pause: { id: 'pause', x: slot(2), y, w: BUTTON_W, h: BUTTON_H, icon: 'pause', label: 'PAUSE' },
    };
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

        // 5.79.37 — Icon now drawn from the SVG cache (slug → cached
        //   canvas via getIconImage). Falls back to font rendering for
        //   unknown slugs.
        const slug = resolveIconSlug(r.icon);
        const iconPx = 28;
        const ix = x + w / 2;
        const iy = y + h / 2 - 5;
        if (slug) {
            const img = getIconImage(slug, iconPx, '#ffffff');
            if (img) ctx.drawImage(img, ix - iconPx / 2, iy - iconPx / 2, iconPx, iconPx);
        } else {
            ctx.font = ICON_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(r.icon, ix, iy);
        }

        // Label
        ctx.font = LABEL_FONT;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.lineJoin = 'round';
        ctx.strokeText(r.label, x + w / 2, y + h - 9);
        ctx.fillStyle = isPress ? '#fffadf' : (isHover ? '#fff' : 'rgba(230, 240, 250, 0.95)');
        ctx.fillText(r.label, x + w / 2, y + h - 9);
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
