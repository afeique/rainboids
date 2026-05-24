// Left-edge item LOOT FEED + cool item glyph geometry (6.x).
//
// Item drops no longer spawn world-space pickup orbs. Each drop is
// registered into `player.lootFeed` (newest first, capped) and rendered
// here as a stack of cards pinned to the LEFT screen edge. Cards fade out
// after a few seconds (oldest first) so the feed clears during lulls and
// never clutters the HUD, and they also fade to near-transparent when the
// ship or the cursor is over the feed region, so they never block gameplay.
//
// `drawItemGlyph` is exported so the 'I' inventory screen reuses the same
// crystalline per-slot geometry (no big colored halo — that was removed).
//
// All functions that take the ctx are called with `.call(gameEngine)`.

const SLOT_BASE_COLOR = {
    cockpit:   '#33ddff',
    hull:      '#2bb6ff',
    shielding: '#ffae3a',
    chassis:   '#ff8c1a',
    nanites:   '#66ffaa',
};

// Darken/lighten a #rrggbb hex by `amt` in [-1, 1].
function _shade(hex, amt) {
    const h = (hex || '#cccccc').replace('#', '');
    let r = parseInt(h.slice(0, 2), 16);
    let g = parseInt(h.slice(2, 4), 16);
    let b = parseInt(h.slice(4, 6), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
    r = f(r); g = f(g); b = f(b);
    return `rgb(${r}, ${g}, ${b})`;
}

// Build a slot-specific angular path centered at (0,0), "radius" r.
// Each slot reads as a distinct crystalline silhouette.
function _slotPath(ctx, slot, r) {
    ctx.beginPath();
    switch (slot) {
        case 'cockpit': {
            // Upward crystal spike (nose-cone gem).
            ctx.moveTo(0, -r);
            ctx.lineTo(r * 0.7, -r * 0.1);
            ctx.lineTo(r * 0.42, r);
            ctx.lineTo(-r * 0.42, r);
            ctx.lineTo(-r * 0.7, -r * 0.1);
            ctx.closePath();
            break;
        }
        case 'hull': {
            // Flat-top hexagon (hull plate).
            for (let i = 0; i < 6; i++) {
                const a = -Math.PI / 2 + (i * Math.PI) / 3 + Math.PI / 6;
                const px = Math.cos(a) * r, py = Math.sin(a) * r;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;
        }
        case 'shielding': {
            // Heater shield (pentagon, point down).
            ctx.moveTo(-r * 0.85, -r * 0.8);
            ctx.lineTo(r * 0.85, -r * 0.8);
            ctx.lineTo(r * 0.85, r * 0.15);
            ctx.lineTo(0, r);
            ctx.lineTo(-r * 0.85, r * 0.15);
            ctx.closePath();
            break;
        }
        case 'chassis': {
            // Octagon plate (bolted chassis).
            for (let i = 0; i < 8; i++) {
                const a = (i * Math.PI) / 4 + Math.PI / 8;
                const px = Math.cos(a) * r, py = Math.sin(a) * r;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;
        }
        case 'nanites':
        default: {
            // Four-point star (nanite sigil).
            const outer = r, inner = r * 0.4;
            for (let i = 0; i < 8; i++) {
                const a = -Math.PI / 2 + (i * Math.PI) / 4;
                const rad = (i % 2 === 0) ? outer : inner;
                const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
            break;
        }
    }
}

// Draw a crystalline item glyph centered at (0,0). Caller translates.
// `size` is the half-extent (radius). Slot drives the silhouette + fill;
// rarity drives the stroke color. No halo/aura circle.
export function drawItemGlyph(ctx, slot, rarityColor, size) {
    const base = SLOT_BASE_COLOR[slot] || '#cccccc';
    ctx.save();
    ctx.lineJoin = 'round';

    // Faceted fill (slot color → darker) with a crisp rarity-colored edge.
    const grad = ctx.createLinearGradient(-size, -size, size, size);
    grad.addColorStop(0, base);
    grad.addColorStop(1, _shade(base, -0.42));
    ctx.fillStyle = grad;
    _slotPath(ctx, slot, size);
    ctx.fill();
    ctx.strokeStyle = rarityColor || '#cccccc';
    ctx.lineWidth = Math.max(1.5, size * 0.13);
    ctx.stroke();

    // Inner facet — a small bright inset for a faceted-crystal read.
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ffffff';
    _slotPath(ctx, slot, size * 0.4);
    ctx.fill();

    ctx.restore();
}

function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function _truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
}

const FEED_X = 12;
const FEED_TOP = 138;     // below the top-left health bar + level badge
const CARD_W = 214;
const CARD_H = 46;
const CARD_GAP = 7;
const FEED_LIFE = 12000;  // cards persist ~12s, then fade out
const FEED_FADE = 4000;   // fade over the final ~4s

// Draw the loot feed. `this` = gameEngine. Prunes expired entries.
export function drawItemFeed(ctx) {
    const player = this.player;
    if (!player || !Array.isArray(player.lootFeed) || player.lootFeed.length === 0) return;

    const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    // Prune expired drops.
    if (player.lootFeed.some((e) => now - e.born >= FEED_LIFE)) {
        player.lootFeed = player.lootFeed.filter((e) => now - e.born < FEED_LIFE);
    }
    const feed = player.lootFeed;
    if (feed.length === 0) return;

    // Proximity fade — drop to ~0.2 alpha when the ship or cursor is over
    // the feed region so cards never obstruct the action there.
    const cx = this.width / 2;
    const cy = this.height / 2;
    const zoom = (this.camera && this.camera.zoom) || 1;
    const shipSX = (player.x - cx - this.camera.x) * zoom + cx;
    const shipSY = (player.y - cy - this.camera.y) * zoom + cy;
    const feedRight = FEED_X + CARD_W + 16;
    const feedBottom = FEED_TOP + feed.length * (CARD_H + CARD_GAP);
    const input = this.inputHandler && this.inputHandler.input;
    const curSX = input ? input.screenAimX : -1;
    const curSY = input ? input.screenAimY : -1;
    const shipNear = shipSX < feedRight && shipSY > FEED_TOP - 40 && shipSY < feedBottom + 40;
    const curNear = curSX >= 0 && curSX < feedRight && curSY > FEED_TOP - 10 && curSY < feedBottom + 10;
    const regionFade = (shipNear || curNear) ? 0.2 : 1;

    ctx.save();
    ctx.textBaseline = 'middle';
    for (let i = 0; i < feed.length; i++) {
        const e = feed[i];
        const item = e.item || {};
        const age = now - e.born;
        let ageAlpha = 1;
        if (age > FEED_LIFE - FEED_FADE) ageAlpha = Math.max(0, (FEED_LIFE - age) / FEED_FADE);
        const a = ageAlpha * regionFade;
        if (a <= 0.02) continue;
        const y = FEED_TOP + i * (CARD_H + CARD_GAP);
        const rarity = item.rarityColor || '#cccccc';

        ctx.globalAlpha = a * 0.82;
        // Card body.
        ctx.fillStyle = 'rgba(8, 12, 20, 0.92)';
        _roundRect(ctx, FEED_X, y, CARD_W, CARD_H, 6);
        ctx.fill();
        // Rarity left accent bar.
        ctx.fillStyle = rarity;
        _roundRect(ctx, FEED_X, y, 4, CARD_H, 2);
        ctx.fill();
        // Border.
        ctx.globalAlpha = a * (e.equipped ? 0.9 : 0.4);
        ctx.strokeStyle = rarity;
        ctx.lineWidth = 1;
        _roundRect(ctx, FEED_X + 0.5, y + 0.5, CARD_W - 1, CARD_H - 1, 6);
        ctx.stroke();

        // Glyph.
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(FEED_X + 26, y + CARD_H / 2);
        drawItemGlyph(ctx, item.slot, rarity, 14);
        ctx.restore();

        // Text — name (rarity color) + top affix label.
        const tx = FEED_X + 50;
        ctx.textAlign = 'left';
        ctx.font = "9px 'Press Start 2P', monospace";
        ctx.fillStyle = rarity;
        const name = (item.rarityLabel ? item.rarityLabel + ' ' : '') + ((item.slot || '').toUpperCase());
        ctx.fillText(_truncate(ctx, name, CARD_W - 64), tx, y + 14);

        ctx.font = "8px 'Press Start 2P', monospace";
        ctx.fillStyle = '#cdd6e6';
        const affixes = Array.isArray(item.affixes) ? item.affixes : [];
        const affixText = affixes.slice(0, 2).map((af) => af.label).join('  ');
        ctx.fillText(_truncate(ctx, affixText || item.bonusLabel || '', CARD_W - 64), tx, y + 30);

        // Equipped check (top-right).
        if (e.equipped) {
            ctx.font = "8px 'Press Start 2P', monospace";
            ctx.fillStyle = '#7CFC9A';
            ctx.textAlign = 'right';
            ctx.fillText('✓', FEED_X + CARD_W - 8, y + 12);
        }
    }
    ctx.restore();
}
