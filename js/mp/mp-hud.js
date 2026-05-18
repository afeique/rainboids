// MP HUD.
//
// Screen-coord overlay for the co-op session. Drawn after the
// renderer + particles so it sits on top of every world-space layer.
// Reads scalar state from the WASM `World` (local + remote ship hp,
// downed flag, revive meter, enemy count) and paints:
//
//   - Local HP bar (bottom center)
//   - DOWNED overlay + revive progress bar (when local ship is down)
//   - Peer status list (top right, palette-colored per player_id)
//   - HOSTILES counter (top left, only when enemy_count > 0)
//
// Solo's HUD (js/modules/hud/, js/modules/ui/) is NOT shared — it is
// interleaved with solo's modular UI system and assumes a single
// local player. MP gets this purpose-built layer that knows about
// remote ships from day one.
//
// The HUD draws at the SCREEN-COORD layer (not letterboxed world
// coords). mp-renderer leaves the canvas transform in its letterbox
// state, so on entry we reset to identity (and restore on exit) so
// every coordinate here is raw canvas pixels.
//
// Engine contract: mp-engine constructs `new Hud()` once at start,
// then calls `hud.draw(ctx, canvas, world)` once per frame after
// particles.draw().
//
// See docs/Multiplayer WASM Pivot Phase 3 – 2026-05-17.md.

// Matches mp-renderer.js REMOTE_PALETTE. Kept in sync by hand —
// renderer doesn't export it and we don't import from solo modules.
const REMOTE_PALETTE = [
    "#3df1ff",  // cyan
    "#ff5edc",  // magenta
    "#ffd84d",  // yellow
    "#7dff3d",  // lime
    "#ff8a3d",  // orange
    "#a880ff",  // purple
];

const HUD_FONT = "11px 'Press Start 2P', monospace";
const HUD_FONT_SMALL = "9px 'Press Start 2P', monospace";
const HUD_FONT_DOWNED = "24px 'Press Start 2P', monospace";

// Matches damage::REVIVE_FILL_FULL on the Rust side.
const REVIVE_FILL_FULL = 180.0;

// Local HP bar geometry.
const HP_BAR_W = 240;
const HP_BAR_H = 14;
const HP_BAR_MARGIN_BOTTOM = 30;

// Revive bar geometry (sits below the DOWNED text).
const REVIVE_BAR_W = 240;
const REVIVE_BAR_H = 8;
const DOWNED_TEXT_GAP = 32;  // px above the HP bar
const REVIVE_BAR_GAP = 14;   // px below the DOWNED text

// Peer list (top right).
const PEER_LIST_MARGIN_RIGHT = 16;
const PEER_LIST_MARGIN_TOP = 18;
const PEER_LINE_HEIGHT = 16;

// Hostiles counter (top left).
const HOSTILES_MARGIN_LEFT = 16;
const HOSTILES_MARGIN_TOP = 18;

const COLOR_HP_LOW = "#ff4444";
const COLOR_HP_MID = "#ffd84d";
const COLOR_HP_HIGH = "#88ff88";
const COLOR_BG = "rgba(0, 0, 0, 0.6)";
const COLOR_BORDER = "rgba(180, 180, 180, 0.7)";
const COLOR_WHITE = "#ffffff";
const COLOR_HINT = "rgba(220, 220, 220, 0.75)";
const COLOR_DOWNED = "#ff4444";
const COLOR_REVIVE_FILL = "#3df1ff";
const COLOR_HOSTILES = "#ff4444";
const COLOR_PEER_DOWN = "rgba(160, 160, 160, 0.65)";

export class Hud {
    constructor() {
        // Stateless for Phase 3. Reserved for caching glyph metrics or
        // animation phase in later phases.
    }

    draw(ctx, canvas, world, opts) {
        if (!ctx || !canvas || !world) return;
        const gold = (opts && opts.gold) | 0;

        // mp-renderer leaves ctx with a letterbox transform. The HUD
        // is screen-coord, so reset to identity for the whole draw
        // and restore on the way out so we don't leak state to the
        // next frame.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        try {
            const cw = canvas.width;
            const ch = canvas.height;

            // Pull all world state up front in a single safe block.
            // Any single missing accessor degrades the HUD gracefully
            // rather than throwing per-frame.
            let hp = 0;
            let maxHp = 0;
            let downed = false;
            let reviveMeter = 0;
            let enemyCount = 0;
            let remoteCount = 0;
            try { hp = world.ship_hp(); } catch {}
            try { maxHp = world.ship_max_hp(); } catch {}
            try { downed = !!world.ship_downed(); } catch {}
            try { reviveMeter = world.ship_revive_meter(); } catch {}
            try { enemyCount = world.enemy_count(); } catch {}
            try { remoteCount = world.remote_ship_count(); } catch {}

            // ---- Hostiles counter (top left) ----
            if (enemyCount > 0) {
                drawHostiles(ctx, enemyCount, cw, ch);
            }

            // ---- Wave indicator (top center) ----
            let waveNum = 0;
            try { waveNum = world.wave_number(); } catch {}
            if (waveNum > 0) {
                drawWaveNumber(ctx, waveNum, cw);
            }

            // ---- Gold counter (top-right, above peer list) ----
            drawGoldCounter(ctx, gold, cw);

            // ---- Peer status (top right) ----
            if (remoteCount > 0) {
                drawPeerList(ctx, world, remoteCount, cw, ch);
            }

            // ---- Local HP bar (bottom center) ----
            const hpBarX = Math.round((cw - HP_BAR_W) / 2);
            const hpBarY = Math.round(ch - HP_BAR_MARGIN_BOTTOM - HP_BAR_H);
            drawHpBar(ctx, hpBarX, hpBarY, hp, maxHp);

            // ---- Downed overlay (above HP bar) ----
            if (downed) {
                const centerX = Math.round(cw / 2);
                const downedY = Math.round(hpBarY - DOWNED_TEXT_GAP);
                drawDowned(ctx, centerX, downedY, reviveMeter);
            }
        } finally {
            ctx.restore();
        }
    }
}

// Wave indicator — small yellow "WAVE: N" centered top.
function drawWaveNumber(ctx, n, cw) {
    ctx.save();
    ctx.font = HUD_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffd84d";
    ctx.fillText(`WAVE ${n}`, Math.round(cw / 2), HOSTILES_MARGIN_TOP);
    ctx.restore();
}

// Gold counter — top-right, above the peer list.
function drawGoldCounter(ctx, gold, cw) {
    ctx.save();
    ctx.font = HUD_FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffd84d";
    ctx.fillText(`GOLD ${gold}`, cw - 16, HOSTILES_MARGIN_TOP);
    ctx.restore();
}

// Hostiles counter — small red "HOSTILES: N" anchored top-left.
function drawHostiles(ctx, count, _cw, _ch) {
    const x = HOSTILES_MARGIN_LEFT;
    const y = HOSTILES_MARGIN_TOP;
    ctx.save();
    ctx.font = HUD_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = COLOR_HOSTILES;
    ctx.fillText(`HOSTILES: ${count}`, Math.round(x), Math.round(y));
    ctx.restore();
}

// Peer list — vertical right-aligned list of "P<id>: hp/max". Down
// ships get a dim "(down)" suffix in lower-contrast type. Each peer
// line uses the same REMOTE_PALETTE slot as the renderer paints the
// ship body in, so the color mapping is consistent across the canvas.
function drawPeerList(ctx, world, remoteCount, cw, _ch) {
    ctx.save();
    ctx.font = HUD_FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";

    const rightX = Math.round(cw - PEER_LIST_MARGIN_RIGHT);
    let y = PEER_LIST_MARGIN_TOP;

    for (let i = 0; i < remoteCount; i++) {
        let pid = 0;
        let hp = 0;
        let maxHp = 0;
        let down = false;
        try { pid = world.remote_ship_player_id(i); } catch { continue; }
        try { hp = world.remote_ship_hp(i); } catch {}
        try { maxHp = world.remote_ship_max_hp(i); } catch {}
        try { down = !!world.remote_ship_downed(i); } catch {}

        const color = REMOTE_PALETTE[pid % REMOTE_PALETTE.length];
        const hpText = `P${pid}: ${Math.round(hp)}/${Math.round(maxHp)}`;
        const lineY = Math.round(y);

        if (down) {
            // Dimmer base line + dim "(down)" suffix appended.
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.55;
            ctx.fillText(hpText, rightX, lineY);
            ctx.globalAlpha = 1;
            y += PEER_LINE_HEIGHT;

            ctx.fillStyle = COLOR_PEER_DOWN;
            ctx.fillText("(down)", rightX, Math.round(y));
            y += PEER_LINE_HEIGHT;
        } else {
            ctx.fillStyle = color;
            ctx.fillText(hpText, rightX, lineY);
            y += PEER_LINE_HEIGHT;
        }
    }

    ctx.restore();
}

// Local HP bar — gradient color tier based on fraction, with a
// numeric overlay ("HP: 7 / 10") centered on the bar.
function drawHpBar(ctx, x, y, hp, maxHp) {
    const safeMax = maxHp > 0 ? maxHp : 1;
    const fraction = Math.max(0, Math.min(1, hp / safeMax));

    let fillColor = COLOR_HP_HIGH;
    if (fraction < 0.34) fillColor = COLOR_HP_LOW;
    else if (fraction < 0.67) fillColor = COLOR_HP_MID;

    ctx.save();

    // Background.
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(x, y, HP_BAR_W, HP_BAR_H);

    // Filled portion.
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, Math.round(HP_BAR_W * fraction), HP_BAR_H);

    // Border.
    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, HP_BAR_W - 1, HP_BAR_H - 1);

    // Numeric overlay.
    ctx.font = HUD_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLOR_WHITE;
    const cx = Math.round(x + HP_BAR_W / 2);
    const cy = Math.round(y + HP_BAR_H / 2);
    ctx.fillText(`HP: ${Math.round(hp)} / ${Math.round(maxHp)}`, cx, cy);

    ctx.restore();
}

// DOWNED overlay — big red text + cyan revive progress bar below.
// Hint text appears only when the meter is empty / nearly empty so it
// disappears as soon as an ally starts the revive.
function drawDowned(ctx, centerX, baselineY, reviveMeter) {
    ctx.save();

    // "DOWNED" headline — thin black outline for legibility against
    // bright backgrounds (e.g., enemy fire, asteroids).
    ctx.font = HUD_FONT_DOWNED;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000000";
    ctx.fillStyle = COLOR_DOWNED;
    ctx.strokeText("DOWNED", centerX, baselineY);
    ctx.fillText("DOWNED", centerX, baselineY);

    // Revive progress bar — sits in the gap between DOWNED text and
    // the HP bar. Width matches HP bar so they read as a paired unit.
    const barX = Math.round(centerX - REVIVE_BAR_W / 2);
    const barY = Math.round(baselineY + REVIVE_BAR_GAP);
    const fraction = Math.max(0, Math.min(1, reviveMeter / REVIVE_FILL_FULL));

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(barX, barY, REVIVE_BAR_W, REVIVE_BAR_H);

    ctx.fillStyle = COLOR_REVIVE_FILL;
    ctx.fillRect(barX, barY, Math.round(REVIVE_BAR_W * fraction), REVIVE_BAR_H);

    ctx.strokeStyle = COLOR_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + 0.5, barY + 0.5, REVIVE_BAR_W - 1, REVIVE_BAR_H - 1);

    // Hint text — visible only when the meter is at / near zero, so
    // it fades out as soon as an ally engages the revive.
    if (fraction < 0.02) {
        ctx.font = HUD_FONT_SMALL;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = COLOR_HINT;
        ctx.fillText("Hold near an ally to revive", centerX, Math.round(barY + REVIVE_BAR_H + 6));
    }

    ctx.restore();
}
