// Weapon radial - held-key (Q) overlay for mid-run PRIMARY weapon swapping.
// The mouse cursor angle picks the slice; a left-click / tap (or releasing the
// held key while hovering a slice) commits the choice. Releasing without a
// hover, clicking the dead zone, or pressing Escape closes it unchanged.
//
// 9.6.x - recovered + adapted from the pre-9.5.0 radial (which also handled
// power weapons + abilities). The reboot dropped the ABILITIES export and the
// Player.equipPower/equipAbility wrappers, so this version is PRIMARY-ONLY:
// the loadout is the player's `ownedPrimaries` set and selection routes through
// `player.equipPrimary(id)` (which already drives firing, since the firing
// dispatch in weapons.js keys off `player.activePrimary`).

import { PRIMARY_WEAPONS, POWER_WEAPONS } from '../combat/weapon-data.js';
import { getIconImage, resolveIconSlug } from './icons.js';

export class RadialMenu {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.open = false;
        this.options = [];      // [{id, name, icon, color}]
        this.currentId = null;  // currently equipped id for the open slot (highlighted)
        this.kind = 'primary';  // 'primary' | 'power' — which slot this ring edits
    }

    isOpen() { return this.open; }

    // Open the radial over the player's owned primaries. No-op when fewer than
    // two primaries are owned (nothing to switch to) so the key feels inert
    // rather than flashing an empty menu.
    openFor(kind = 'primary') {
        if (this.open) return;
        const player = this.engine && this.engine.player;
        if (!player) return;
        const isPower = kind === 'power';
        const defs = isPower ? POWER_WEAPONS : PRIMARY_WEAPONS;
        const ownedSet = isPower ? player.ownedPowers : player.ownedPrimaries;
        const owned = ownedSet instanceof Set ? Array.from(ownedSet)
            : Array.isArray(ownedSet) ? ownedSet
            : Object.keys(defs);
        const options = owned
            .filter((id) => defs[id])
            .map((id) => defs[id]);
        if (options.length < 2) return;
        this.kind = kind;
        this.options = options;
        this.currentId = isPower ? player.activePower : player.activePrimary;
        this.open = true;
        // Drop any in-flight primary fire so a left-click can be used to pick.
        const input = this.engine.inputHandler && this.engine.inputHandler.input;
        if (input) input.fire = false;
    }

    // Close without changing the equipped weapon. Called on key-release/escape.
    cancel() {
        if (!this.open) return;
        this.open = false;
        this.options = [];
        this.currentId = null;
    }

    // Map cursor screen position to a slice index (or -1 inside the dead zone).
    getHoverIndex() {
        const eng = this.engine;
        const cx = eng.width / 2, cy = eng.height / 2;
        // Prefer the engine's screen-space cursor (kept current by the
        // mousemove handler in event-setup.js); fall back to the input
        // handler's aim, then to screen-center (dead zone = no hover).
        const input = eng.inputHandler && eng.inputHandler.input;
        const mx = (eng.mouseX != null) ? eng.mouseX
            : (input && input.screenAimX != null) ? input.screenAimX : cx;
        const my = (eng.mouseY != null) ? eng.mouseY
            : (input && input.screenAimY != null) ? input.screenAimY : cy;
        const dx = mx - cx, dy = my - cy;
        const r = this._innerRadius();
        if (dx * dx + dy * dy < r * r) return -1;
        const n = this.options.length;
        if (n === 0) return -1;
        // atan2 gives angle from +X axis; convert to "from top, clockwise":
        let a = Math.atan2(dy, dx) + Math.PI / 2;
        if (a < 0) a += Math.PI * 2;
        const slice = (Math.PI * 2) / n;
        return Math.floor((a + slice / 2) / slice) % n;
    }

    // Click / tap handler - selects the slice under the cursor and closes.
    // Clicks inside the dead zone close without changing. Returns true when it
    // handled the event (so the caller can preventDefault).
    handleClick() {
        if (!this.open) return false;
        const idx = this.getHoverIndex();
        if (idx < 0) { this.cancel(); return true; }
        this.selectIndex(idx);
        return true;
    }

    // Commit the option at `idx`, equip it, and close. Shared by mouse-click
    // and the key-release fallback.
    selectIndex(idx) {
        const opt = this.options[idx];
        const eng = this.engine;
        const player = eng && eng.player;
        if (player && opt) {
            const fn = this.kind === 'power' ? 'equipPower' : 'equipPrimary';
            if (typeof player[fn] === 'function') {
                const changed = player[fn](opt.id);
                if (changed && eng.events) eng.events.emit('audio:coin');
            }
        }
        this.cancel();
    }

    _outerRadius() {
        return Math.min(this.engine.width, this.engine.height) * 0.24;
    }
    _innerRadius() {
        return this._outerRadius() * 0.38;
    }

    draw(ctx) {
        if (!this.open) return;
        const eng = this.engine;
        const cx = eng.width / 2, cy = eng.height / 2;
        const outer = this._outerRadius();
        const inner = this._innerRadius();
        const n = this.options.length;
        if (n === 0) return;
        const slice = (Math.PI * 2) / n;
        const startAngle = -Math.PI / 2 - slice / 2; // first slice centered at top
        const hover = this.getHoverIndex();

        ctx.save();

        // Dim backdrop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, eng.width, eng.height);

        // Slices
        for (let i = 0; i < n; i++) {
            const opt = this.options[i];
            const a0 = startAngle + i * slice;
            const a1 = a0 + slice;
            const isHover = i === hover;
            const isCurrent = opt.id === this.currentId;

            ctx.beginPath();
            ctx.arc(cx, cy, outer, a0, a1);
            ctx.arc(cx, cy, inner, a1, a0, true);
            ctx.closePath();

            if (isHover) {
                ctx.fillStyle = hexToRgba(opt.color || '#ffffff', 0.55);
            } else if (isCurrent) {
                ctx.fillStyle = hexToRgba(opt.color || '#ffffff', 0.22);
            } else {
                ctx.fillStyle = 'rgba(20, 22, 30, 0.85)';
            }
            ctx.fill();

            ctx.strokeStyle = isHover ? '#ffffff' : (opt.color || '#ffffff');
            ctx.lineWidth = isHover ? 3 : 1.5;
            ctx.stroke();

            // Icon only - the option name is shown in the center hub on hover,
            // so each slice just gets a centered glyph.
            const mid = (a0 + a1) / 2;
            const anchorR = (inner + outer) / 2;
            const ax = cx + Math.cos(mid) * anchorR;
            const ay = cy + Math.sin(mid) * anchorR;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Icon drawn from the SVG cache (slug -> cached canvas via
            // getIconImage). Falls back to font rendering for unmigrated entries.
            const slug = resolveIconSlug(opt.icon);
            const iconPx = 32;
            if (slug) {
                const img = getIconImage(slug, iconPx, '#ffffff');
                if (img) ctx.drawImage(img, ax - iconPx / 2, ay - iconPx / 2, iconPx, iconPx);
            } else {
                ctx.font = `${iconPx}px sans-serif`;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(opt.icon || '?', ax, ay);
            }
        }

        // Center hub. A WEAPON label sits above; the hovered option's name
        // (or the prompt) renders below it, wrapped onto multiple pixel-font
        // lines if it doesn't fit on one within the inner circle.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lineH = 16;                 // 14px font + 2px gap
        const hubMaxWidth = inner * 1.7;  // text may bleed slightly into the
                                          // adjacent slices, which is fine since
                                          // the icons are anchored further out.

        const headerY = cy - inner * 0.55;
        drawPixelText(ctx, this.kind === 'power' ? 'POWER' : 'PRIMARY', cx, headerY, 'rgba(190, 195, 215, 0.95)');

        const label = hover >= 0 ? (this.options[hover].name || '') : 'CLICK TO SELECT';
        const labelColor = hover >= 0 ? '#ffffff' : 'rgba(190, 195, 215, 0.7)';
        // Two-word names (e.g. "Pulse Cannon") render as two lines in the hub,
        // one word per line. Other lengths fall back to the wrap path.
        const upper = label.toUpperCase();
        const words = upper.split(' ').filter((w) => w.length > 0);
        const lines = (words.length === 2) ? words : wrapPixelText(ctx, upper, hubMaxWidth);
        const blockH = lines.length * lineH;
        const startY = cy + lineH * 0.4 - blockH / 2 + lineH / 2;
        for (let i = 0; i < lines.length; i++) {
            drawPixelText(ctx, lines[i], cx, startY + i * lineH, labelColor);
        }

        ctx.restore();
    }
}

// 14px Press Start 2P, outlined with a 3px black stroke for legibility on the
// dim radial backdrop. Rounded joins keep the blocky glyphs from growing
// spurious corners at small sizes.
const PIXEL_FONT = "14px 'Silkscreen', 'Press Start 2P', monospace";
function drawPixelText(ctx, text, x, y, fill) {
    if (!text) return;
    ctx.font = PIXEL_FONT;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
}

// Word-wrap into lines that each fit within `maxWidth` at PIXEL_FONT. Long
// single words are chopped character-by-character so they still fit.
function wrapPixelText(ctx, text, maxWidth) {
    ctx.font = PIXEL_FONT;
    if (!text) return [];
    if (ctx.measureText(text).width <= maxWidth) return [text];

    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    const pushCur = () => { if (cur) { lines.push(cur); cur = ''; } };

    for (const word of words) {
        const candidate = cur ? cur + ' ' + word : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            cur = candidate;
            continue;
        }
        pushCur();
        if (ctx.measureText(word).width > maxWidth) {
            let chunk = '';
            for (const ch of word) {
                const next = chunk + ch;
                if (ctx.measureText(next).width > maxWidth) {
                    if (chunk) lines.push(chunk);
                    chunk = ch;
                } else {
                    chunk = next;
                }
            }
            cur = chunk;
        } else {
            cur = word;
        }
    }
    pushCur();
    return lines;
}

function hexToRgba(hex, a) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    return `rgba(${r},${g},${b},${a})`;
}
