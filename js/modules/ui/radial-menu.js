// Radial menu — held-key (E/R/F) overlay for picking the equipped primary
// weapon, power weapon, or defense skill. Pauses gameplay while open;
// mouse cursor angle picks the slice and a left-click commits the choice.
// Releasing the held key without clicking closes the menu without changing
// the equipped item.

import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS } from '../combat/weapon-data.js';

const TYPE_LABELS = {
    primary: 'PRM',
    power:   'PWR',
    skill:   'SKILL',
};

export class RadialMenu {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.open = false;
        this.type = null;       // 'primary' | 'power' | 'skill'
        this.options = [];      // [{id, name, icon, color}]
        this.currentId = null;  // currently equipped id (highlighted)
    }

    isOpen() { return this.open; }

    openFor(type) {
        if (this.open) return;
        const player = this.engine.player;
        if (!player) return;
        let map, currentId;
        if (type === 'primary') { map = PRIMARY_WEAPONS; currentId = player.activePrimary; }
        else if (type === 'power') { map = POWER_WEAPONS; currentId = player.activePower; }
        else if (type === 'skill') { map = DEFENSE_SKILLS; currentId = player.activeSkill; }
        else return;
        this.type = type;
        this.options = Object.values(map);
        this.currentId = currentId;
        this.open = true;
        // Drop any in-flight primary fire so left-click can be used to pick.
        const input = this.engine.inputHandler && this.engine.inputHandler.input;
        if (input) input.fire = false;
    }

    // Close without changing equipment. Called on key-release.
    cancel() {
        if (!this.open) return;
        this.open = false;
        this.type = null;
        this.options = [];
        this.currentId = null;
    }

    // Map cursor screen position to a slice index (or -1 inside the dead zone).
    getHoverIndex() {
        const eng = this.engine;
        const cx = eng.width / 2, cy = eng.height / 2;
        const input = eng.inputHandler && eng.inputHandler.input;
        const mx = input ? input.screenAimX : cx;
        const my = input ? input.screenAimY : cy;
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

    // Click handler — selects the slice under the cursor and closes.
    // Clicks inside the dead zone close without changing.
    handleClick() {
        if (!this.open) return false;
        const idx = this.getHoverIndex();
        if (idx < 0) { this.cancel(); return true; }
        const opt = this.options[idx];
        const eng = this.engine;
        const player = eng.player;
        if (player && opt) {
            if (this.type === 'primary') {
                if (player.ownedPrimaries && !player.ownedPrimaries.has(opt.id)) {
                    player.ownedPrimaries.add(opt.id);
                }
                player.equipPrimary(opt.id);
            } else if (this.type === 'power') {
                if (player.ownedPowers && !player.ownedPowers.has(opt.id)) {
                    player.ownedPowers.add(opt.id);
                }
                player.equipPower(opt.id);
            } else if (this.type === 'skill') {
                player.equipSkill(opt.id);
            }
            if (eng.events) eng.events.emit('audio:coin');
        }
        this.cancel();
        return true;
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
        const startAngle = -Math.PI / 2 - slice / 2; // first slice centered at the top
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

            // Icon only — the option name is shown in the center hub on
            // hover, so each slice just gets a centered glyph.
            const mid = (a0 + a1) / 2;
            const anchorR = (inner + outer) / 2;
            const ax = cx + Math.cos(mid) * anchorR;
            const ay = cy + Math.sin(mid) * anchorR;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Emoji icons render through the system emoji face regardless
            // of the requested family — pixel-font override is unnecessary.
            ctx.font = '32px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(opt.icon || '?', ax, ay);
        }

        // Center hub. Type label sits above; the hovered option's name
        // (or the prompt) renders below it, wrapped onto multiple pixel-
        // font lines if it doesn't fit on one within the inner circle.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lineH = 16;                     // 14px font + 2px gap
        const hubMaxWidth = inner * 1.7;      // bigger than the chord at the
                                              // edge of the inner circle so the
                                              // text bleeds slightly into the
                                              // adjacent slices, which is fine
                                              // because the slice icons are
                                              // anchored further out.

        const headerY = cy - inner * 0.55;
        drawPixelText(ctx, TYPE_LABELS[this.type] || '', cx, headerY,
            'rgba(190, 195, 215, 0.95)');

        const label = hover >= 0 ? (this.options[hover].name || '') : 'CLICK TO SELECT';
        const labelColor = hover >= 0 ? '#ffffff' : 'rgba(190, 195, 215, 0.7)';
        // 5.76.0 — two-word names (e.g. "Pulse Cannon", "Charge Shot",
        // "Phase Dash") always render as two lines in the radial center,
        // one word per line. Cleaner read at the small hub diameter and
        // matches the visual rhythm of the icon grid. Three-word or
        // single-word labels fall back to the regular wrap path.
        const upper = label.toUpperCase();
        const words = upper.split(' ').filter(w => w.length > 0);
        const lines = (words.length === 2)
            ? words
            : wrapPixelText(ctx, upper, hubMaxWidth);
        const blockH = lines.length * lineH;
        const startY = cy + lineH * 0.4 - blockH / 2 + lineH / 2;
        for (let i = 0; i < lines.length; i++) {
            drawPixelText(ctx, lines[i], cx, startY + i * lineH, labelColor);
        }

        ctx.restore();
    }
}

// 14px Press Start 2P, outlined with a 3px black stroke for legibility on
// the dim radial backdrop. The stroke is drawn with rounded joins so the
// blocky pixel glyphs don't grow spurious corners at small sizes.
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

// Word-wrap into lines that each fit within `maxWidth` at PIXEL_FONT.
// Long single words are chopped character-by-character so they still fit
// (e.g. an unusually long ID without spaces).
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
        // Word alone exceeds maxWidth — chop it.
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
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
    const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
    return `rgba(${r},${g},${b},${a})`;
}

