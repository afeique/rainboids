// HUD status bar rendering — health, shields, lives, level, coins, XP.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { GAME_STATES } from '../core/constants.js';
import { drawCachedHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon } from '../core/utils.js';
import { PRIMARY_WEAPONS } from '../combat/weapon-data.js';
// 9.0.0 (reboot) — leveling/XP removed; xpForLevel/MAX_LEVEL no longer used.
import { WAVY_PALETTES } from './overlays.js';
import { drawHudButtons } from './hud-buttons.js';
import { drawItemFeed } from './item-feed.js';
import { drawBossHealthbarHook } from './boss-healthbar.js';
import { drawThreatLevelHook } from './threat-level.js';
import { drawBossFxHook } from '../enemy/boss-fx.js';
import { getIconImage, resolveIconSlug } from '../ui/icons.js';
// SYS-9 / ENMY-10 — skill-suppress aura (NULL_DRONE) HUD cue. isSuppressed is
// false unless an active suppression stamp is live, so the slot-bar tint below
// is a no-op for a player not standing in a drone's aura.
import { isSuppressed } from '../enemy/abilities/suppress-aura.js';
// 5.92.0 — Mobile HUD simplification: hide the coins readout,
// survival timer, and loadout/weapon meters in mobile mode so the
// player has a clean top-left status panel (health + triforce + XP)
// and the bottom-center action button bar — nothing else. Desktop
// is unchanged.
import { isMobile, isPortrait } from '../platform/platform-detect.js';

// ── FB-1 (P7) — AI Co-Pilot auto-cast feedback ────────────────────────────
// The Assist System writes `player._lastAssistCast = { id, slot, t }` on each
// ability auto-cast (assist-system.js). Nothing read it, so the Co-Pilot's
// automation was invisible. These pure helpers + the per-frame detection below
// surface that: a brief pip flash on the cast slot and a small "↑ NAME" toast.
//
// DEFAULT-SAFE: a player not running the Co-Pilot never has `_lastAssistCast`,
// so isNewAssistCast returns false and no feedback state is ever touched — the
// HUD render is byte-for-byte unchanged.

// How long a cast-slot pip stays lit, in ms. Bounded + cheap (one timer).
export const ASSIST_FLASH_MS = 500;
// How long the assist toast lingers, in ms (short by design).
export const ASSIST_TOAST_MS = 1000;

// Is `cast` a NEW auto-cast relative to the last timestamp we already handled?
// Guards a missing/empty cast and a missing timestamp. `lastSeenT` is whatever
// the renderer recorded last frame (undefined on the very first frame).
export function isNewAssistCast(cast, lastSeenT) {
    if (!cast || typeof cast.t !== 'number') return false;
    return cast.t !== lastSeenT;
}

// Resolve an ability id (e.g. 'BULWARK') to its display name (e.g. 'Bulwark').
// Falls back to the raw id when the ability has no `name`, and returns '' for a
// missing/unknown id so the toast can be skipped gracefully (no NPE).
// 9.0.0 (reboot) — abilities removed; no Co-Pilot ability casts fire, so this
// is only reached by dead paths. Return the raw id (ABILITIES lookup gone).
export function assistAbilityName(id) {
    return id ? String(id) : '';
}

export function drawHUD() {
        // 9.0.0 (reboot) — also skip the in-game HUD (triforce + spheres +
        // PRM/PWR squares + survival timer) on the pre-run screens (ARMORY /
        // LOADOUT / SETTINGS). The new-game picker is a full-screen DOM
        // overlay, but the canvas still draws the starfield behind it; without
        // this guard a default "▲ / ▲▲" triforce flashes top-left through it.
        const _s = this.game.state;
        const _skipHud = _s === GAME_STATES.TITLE_SCREEN
            || _s === GAME_STATES.SHOP
            || _s === GAME_STATES.ARMORY
            || _s === GAME_STATES.LOADOUT
            || _s === GAME_STATES.SETTINGS;
        if (!_skipHud) {
            // Draw health bar and UI elements
            this.updateHUD();
            // 5.79.2 — DOM hud-shop button is replaced by canvas-rendered
            //   bottom-center buttons (see drawHudButtons below). Pause
            //   button kept on DOM for now.
            this.events.emit('ui:hide-hud-shop-btn');
            this.events.emit('ui:show-pause-btn');
        } else {
            this.events.emit('ui:hide-shop-button');
            this.events.emit('ui:hide-pause-btn');
            this.events.emit('ui:hide-hud-shop-btn');
        }

        // 5.79.2 — bottom-center canvas-rendered button bar (SHOP +
        //   STATS). Drawn so the reticule cursor floats over them
        //   like any in-world entity. Skipped on TITLE_SCREEN +
        //   GAME_OVER + SHOP.
        if (this.game.state === GAME_STATES.PLAYING
            || this.game.state === GAME_STATES.WAVE_TRANSITION
            || this.game.state === GAME_STATES.PAUSED) {
            drawHudButtons(this.ctx, this);
            // 5.100.0 — Virtual analog stick (mobile only). Drawn AFTER
            // the canvas HUD buttons so its handle floats above the
            // bottom bar's visual layer. The stick reads input from
            // mobile-touch.js and writes its deflection vector to
            // engine.inputHandler.input.stickInput via the touch handler.
            if (this.mobile && this.analogStick && this.game.state !== GAME_STATES.TITLE_SCREEN) {
                this.analogStick.draw(this.ctx);
            }
            // 6.x — Left-edge item loot feed (replaces world pickup orbs).
            drawItemFeed.call(this, this.ctx);
            // BOSS-01 — Always-visible boss healthbar. Renders top-center
            // only while a boss-flagged enemy is alive (the hook scans the
            // active enemy pool and no-ops otherwise).
            drawBossHealthbarHook.call(this);
            // BOSS-03 — Boss intro/death canvas FX (name-card sweep +
            // death detonation). Co-located with the healthbar hook; the
            // hook scans the pool for a boss playing an intro/death
            // sequence and no-ops otherwise.
            drawBossFxHook.call(this);
            // CD-16 — Threat-Level meter (top-center); no-ops until the difficulty director is wired live.
            drawThreatLevelHook.call(this);
        } else {
            // Clear stale rects so input handlers don't act on them.
            this._hudButtonRects = null;
        }

        // 5.101.0 — Defensive ability HUD suspended along with the
        // defensive ability system. REFLEXES / LAST_STAND / STATIC_FIELD
        // are no longer offered as picks; if a save still carries
        // stacks the underlying effects still run, but no HUD chrome
        // surfaces them. Re-enable along with the ability system if
        // resurrected.
        // if (this.game.state !== GAME_STATES.TITLE_SCREEN
        //     && typeof this.drawDefenseIndicators === 'function') {
        //     this.drawDefenseIndicators(this.ctx);
        // }

        // Draw level up text if active
        if (this.player && this.player.levelUpTextInfo && this.player.levelUpTextInfo.active) {
            this.drawLevelUpText();
        }

        // Draw wave message if active. Wave-start messages with phase
        // 'intro' render as a full-screen dark overlay (see drawWaveIntro
        // below); the inline top-of-screen variant is reserved for shorter
        // notifications like WAVE COMPLETE and queued toasts.
        if (this.waveMessage.active && this.waveMessage.phase !== 'intro') {
            const now = Date.now();
            const elapsed = now - this.waveMessage.startTime;

            if (elapsed < this.waveMessage.duration) {
                // Fade-out across the last 35% of the message duration so
                // the WAVE COMPLETE text visibly drains BEFORE the shop UI
                // takes over (gives the player a temporal/visual pause).
                const fadeProgress = elapsed / this.waveMessage.duration;
                const alpha = fadeProgress < 0.65 ? 1 : (1 - fadeProgress) / 0.35;

                this.ctx.save();
                this.ctx.globalAlpha = alpha;

                // Draw title (larger, centered horizontally, well below the
                // top-center enemy-info band which now occupies y≈24-84).
                // 5.100.2 — Cap font sizes hard on mobile; the 48 px /
                // 24 px desktop values overflowed phone viewports. Use
                // the same Math.min/max/floor pattern that title-screen
                // and game-over already use.
                const centerX = this.width / 2;
                const _mob = isMobile();
                const _port = _mob && isPortrait();
                const titleFS = _port
                    ? Math.min(28, Math.max(20, Math.floor(this.width / 13)))
                    : (_mob
                        ? Math.min(36, Math.max(24, Math.floor(this.height / 12)))
                        : 48);
                const subtitleFS = _mob ? Math.max(12, Math.floor(titleFS * 0.55)) : 24;
                const topY = _port ? 130 : (_mob ? 150 : 200);
                const gap = _mob ? Math.floor(titleFS * 0.85) : 60;
                this.drawWavyText(this.waveMessage.title, centerX, topY, {
                    fontSize: titleFS,
                    colors: WAVY_PALETTES.waveTitle,
                    speed: 0.55,
                    colorSpeed: 0.22,
                });

                // Draw subtitle (smaller, below title) — softer palette and gentler motion
                if (this.waveMessage.subtitle) {
                    this.drawWavyText(this.waveMessage.subtitle, centerX, topY + gap, {
                        fontSize: subtitleFS,
                        colors: WAVY_PALETTES.waveSubtext,
                        amplitude: 0,
                        colorSpeed: 0.12,
                    });
                }

                this.ctx.restore();
            } else {
                // Message expired
                this.waveMessage.active = false;
            }
        }

        // Draw ability cooldown HUD + streak buff indicator
        if (this.player && this.game.state !== GAME_STATES.TITLE_SCREEN && this.game.state !== GAME_STATES.SHOP) {
            // FB-1 (P7) — detect any new AI Co-Pilot auto-cast and arm the pip
            // flash + assist toast. No-op for a player without a live Co-Pilot
            // (no _lastAssistCast) ⇒ HUD unchanged.
            detectAssistCast.call(this);
            this.drawAbilityCooldownHUD();
            this.drawStreakIndicator();
        }

        // 5.99.2 — Pickup toast (canvas-rendered). Renders during any
        // in-game state so the player sees the confirmation even mid-
        // wave-transition. See drawPickupToast for the rationale —
        // showMessage / ui:show-message is a no-op because
        // game-message-overlay is commented out in index.html.
        if (this._pickupToast && this.game.state !== GAME_STATES.TITLE_SCREEN) {
            this.drawPickupToast();
        }

        // FB-1 (P7) — AI Co-Pilot auto-cast toast. Parallel to the pickup
        // toast (own field) so the two never clobber each other. Only set
        // when the Co-Pilot actually casts; otherwise this is a no-op.
        if (this._assistToast && this.game.state !== GAME_STATES.TITLE_SCREEN) {
            drawAssistToast.call(this);
        }

        // Draw title screen with wavy text
        if (this.game.state === GAME_STATES.TITLE_SCREEN) {
            this.drawTitleScreen();
        }
}

// 5.99.2 — Pickup toast. Tiny bottom-anchored banner with the pickup
// name and bonus, fades in over 120 ms and out over the last 30% of
// its lifetime. Lives outside the existing waveMessage flow so it
// doesn't conflict with the WAVE COMPLETE chrome. Designed for
// permanent stat pickups (HP_UP, TOUGHNESS) but generic enough that
// any in-game event can fire one via engine.triggerPickupToast.
export function drawPickupToast() {
    const t = this._pickupToast;
    if (!t) return;
    const now = Date.now();
    const elapsed = now - (t.startAt || now);
    const duration = t.duration || 1800;
    if (elapsed >= duration) {
        this._pickupToast = null;
        return;
    }
    // Fade-in over the first 120 ms, fade-out over the last 30%.
    const fadeOutFrom = duration * 0.7;
    const fadeIn = Math.min(1, elapsed / 120);
    const fadeOut = elapsed < fadeOutFrom
        ? 1
        : Math.max(0, 1 - (elapsed - fadeOutFrom) / (duration - fadeOutFrom));
    const alpha = fadeIn * fadeOut;

    const ctx = this.ctx;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const _mob = isMobile();
    const _port = _mob && isPortrait();

    // Sizing — small chip on portrait, slightly larger on landscape / desktop.
    const titleFS = _port ? 14 : (_mob ? 16 : 18);
    const subFS   = _port ? 9  : (_mob ? 10 : 12);
    const padX    = _port ? 14 : 18;
    const padY    = _port ? 8  : 10;
    const gap     = _port ? 4  : 6;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Measure title + subtitle to size the bg pill.
    ctx.font = `bold ${titleFS}px 'Press Start 2P', monospace`;
    const titleW = ctx.measureText(t.title || '').width;
    ctx.font = `${subFS}px 'Press Start 2P', monospace`;
    const subW = t.subtitle ? ctx.measureText(t.subtitle).width : 0;
    const blockW = Math.max(titleW, subW) + padX * 2;
    const blockH = titleFS + (t.subtitle ? gap + subFS : 0) + padY * 2;
    // 6.22.1 — Moved to LEFT-CENTER (was bottom-center). Bottom-center
    // overlapped the kill-streak block and the HUD action-button bar.
    // Left-center keeps the pickup feedback out of the streak/HUD path
    // while still being visible at a glance.
    const x0 = 24;                            // 24 px gutter from left edge
    const y0 = canvasH / 2 - blockH / 2;       // vertically centered
    const cx = x0 + blockW / 2;                // center for the title/subtitle text

    // Background pill — accent-tinted with a darker fill.
    const accent = t.accentColor || '#33ddff';
    ctx.fillStyle = 'rgba(8, 14, 24, 0.92)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, blockW, blockH, 10);
    else ctx.rect(x0, y0, blockW, blockH);
    ctx.fill();
    ctx.stroke();

    // Title — accent color.
    ctx.font = `bold ${titleFS}px 'Press Start 2P', monospace`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleY = t.subtitle
        ? y0 + padY + titleFS / 2
        : y0 + blockH / 2;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.strokeText(t.title || '', cx, titleY);
    ctx.fillText(t.title || '', cx, titleY);

    if (t.subtitle) {
        ctx.font = `${subFS}px 'Press Start 2P', monospace`;
        ctx.fillStyle = '#e8edf5';
        const subY = y0 + padY + titleFS + gap + subFS / 2;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.strokeText(t.subtitle, cx, subY);
        ctx.fillText(t.subtitle, cx, subY);
    }

    ctx.restore();
}

// ── FB-1 (P7) — AI Co-Pilot auto-cast detection + toast ───────────────────
// Run once per HUD frame (from drawHUD). Reads player._lastAssistCast — the
// { id, slot, t } stamp the Assist System writes on each ability auto-cast —
// and, when it sees a NEW one (a timestamp it hasn't handled), arms two cues:
//   1. a per-slot pip flash ({ slot, until }) rendered atop the cooldown bar,
//   2. a short "↑ NAME" assist toast (its own field so it never clobbers a
//      pickup toast).
// DEFAULT-SAFE: no _lastAssistCast (Co-Pilot off) ⇒ early return, no state set.
export function detectAssistCast() {
    const cast = this.player && this.player._lastAssistCast;
    if (!isNewAssistCast(cast, this._lastAssistCastSeenT)) return;
    // Record the timestamp first so a render exception can't re-fire it.
    this._lastAssistCastSeenT = cast.t;

    const now = Date.now();
    // Pip flash — only for a valid slot index (0–3). Bounded single timer.
    if (typeof cast.slot === 'number' && cast.slot >= 0 && cast.slot < 4) {
        this._assistCastFlash = { slot: cast.slot, until: now + ASSIST_FLASH_MS };
    }
    // Toast — only when we can name the ability (skip gracefully otherwise).
    const name = assistAbilityName(cast.id);
    if (name) {
        this._assistToast = {
            title: name,
            accentColor: '#7af0ff',
            startAt: now,
            duration: ASSIST_TOAST_MS,
        };
    }
}

// FB-1 (P7) — assist toast render. A small top-left "↑ NAME" cue marking an
// AI Co-Pilot auto-cast. Mirrors the pickup-toast fade (fade-in 120 ms, fade
// out over the last 30%) but anchors top-left + prefixes an up-arrow glyph so
// it reads as "the Co-Pilot just used this," distinct from a pickup. Cleared
// from its own _assistToast field when the duration elapses.
export function drawAssistToast() {
    const t = this._assistToast;
    if (!t) return;
    const now = Date.now();
    const elapsed = now - (t.startAt || now);
    const duration = t.duration || ASSIST_TOAST_MS;
    if (elapsed >= duration) {
        this._assistToast = null;
        return;
    }
    const fadeOutFrom = duration * 0.7;
    const fadeIn = Math.min(1, elapsed / 120);
    const fadeOut = elapsed < fadeOutFrom
        ? 1
        : Math.max(0, 1 - (elapsed - fadeOutFrom) / (duration - fadeOutFrom));
    const alpha = fadeIn * fadeOut;

    const ctx = this.ctx;
    const _mob = isMobile();
    const _port = _mob && isPortrait();
    const titleFS = _port ? 11 : (_mob ? 13 : 14);
    const padX = _port ? 10 : 14;
    const padY = _port ? 6 : 8;

    const label = `↑ ${(t.title || '').toUpperCase()}`; // "↑ BULWARK"

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${titleFS}px 'Press Start 2P', monospace`;
    const labelW = ctx.measureText(label).width;
    const blockW = labelW + padX * 2;
    const blockH = titleFS + padY * 2;
    // Top-left, just below the status panel area. Distinct anchor from the
    // left-CENTER pickup toast so both can coexist.
    const x0 = 24;
    const y0 = 96;
    const cx = x0 + blockW / 2;
    const cy = y0 + blockH / 2;

    const accent = t.accentColor || '#7af0ff';
    ctx.fillStyle = 'rgba(8, 14, 24, 0.92)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, blockW, blockH, 9);
    else ctx.rect(x0, y0, blockW, blockH);
    ctx.fill();
    ctx.stroke();

    ctx.font = `bold ${titleFS}px 'Press Start 2P', monospace`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.strokeText(label, cx, cy);
    ctx.fillText(label, cx, cy);

    ctx.restore();
}

// ── Game Complete screen ──────────────────────────────────────────────────
// Full-screen statistics readout shown when the player clears the final
// wave. The campaign meta is "finish as fast as possible," so total time is
// the headline stat — accuracy / damage / favored weapon back it up.
export function drawGameComplete() {
    if (this.game.state !== GAME_STATES.GAME_COMPLETE) return;
    const stats = this.game.stats || {};
    const ctx = this.ctx;

    // Solid dark backdrop so the world fades out behind the readout.
    ctx.save();
    ctx.fillStyle = 'rgba(0, 6, 18, 0.94)';
    ctx.fillRect(0, 0, this.width, this.height);

    const cx = this.width / 2;
    // 5.97.0 — Mobile-responsive layout. Pull the title higher and use
    // a smaller cap so portrait phones don't show a 64-px title eating
    // the screen.
    const _mob = isMobile();
    const _port = _mob && isPortrait();
    const titleFS = _port
        ? Math.min(36, Math.max(22, Math.floor(this.width / 12)))
        : (_mob
            ? Math.min(44, Math.max(28, Math.floor(this.height / 10)))
            : Math.min(64, Math.max(40, Math.floor(this.width / 22))));
    const subtitleFS = _port
        ? Math.max(14, Math.floor(titleFS * 0.65))
        : (_mob
            ? Math.max(16, Math.floor(titleFS * 0.6))
            : Math.max(28, Math.floor(this.width / 36)));
    const titleY = Math.max(_mob ? 60 : 120, this.height * (_port ? 0.10 : 0.18));
    const subtitleGap = _mob ? Math.floor(titleFS * 0.9) : 64;
    const subtitleY = titleY + subtitleGap;
    const statsGap = _mob ? Math.floor(subtitleFS * 1.6) : 70;
    const statsTop = subtitleY + statsGap;

    this.drawWavyText('GAME COMPLETE!', cx, titleY, {
        fontSize: titleFS,
        colors: WAVY_PALETTES.waveTitle,
        speed: 0.45,
        colorSpeed: 0.18,
    });

    // Subtitle — final time front and center (the speedrun stat).
    const totalMs = stats.finalTimeMs || (Date.now() - (stats.gameStartTime || Date.now()));
    const timeStr = formatDuration(totalMs);
    ctx.fillStyle = '#cfeaff';
    ctx.font = `bold ${subtitleFS}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`TIME  ${timeStr}`, cx, subtitleY);

    // Stat lines — two-column layout, left-justified labels and right-aligned values.
    const accuracy = stats.shotsFired > 0
        ? Math.round((stats.shotsHit / stats.shotsFired) * 1000) / 10
        : 0;
    const preferredWeaponId = pickPreferredWeapon(stats.weaponShots || {});
    const lines = [
        ['Accuracy',           `${accuracy.toFixed(1)}%`],
        ['Total Shots Fired',  String(stats.shotsFired || 0)],
        ['Shots On Target',    String(stats.shotsHit || 0)],
        ['Damage Dealt',       formatNumber(stats.totalDamageDealt || 0)],
        ['Damage Taken',       formatNumber(stats.totalDamageTaken || 0)],
        ['Enemies Killed',     String(stats.enemiesKilled || 0)],
        ['Asteroids Destroyed',String(stats.asteroidsDestroyed || 0)],
        ['Bosses Defeated',    String(stats.bossesKilled || 0)],
        ['Coins Earned',       String(stats.coinsEarned || 0)],
        ['Preferred Weapon',   preferredWeaponId || '—'],
    ];

    // 5.97.0 — Smaller stat lines on portrait so the 10-row block fits
    // inside the canvas under the title without overflowing.
    const lineFS = _port
        ? Math.max(11, Math.floor(this.width / 30))
        : (_mob
            ? Math.max(13, Math.floor(this.width / 50))
            : Math.max(18, Math.floor(this.width / 60)));
    const lineH = lineFS + (_mob ? 6 : 12);
    const colWidth = _port
        ? Math.min(this.width - 32, this.width * 0.92)
        : Math.min(560, this.width * 0.62);
    const labelX = cx - colWidth / 2;
    const valueX = cx + colWidth / 2;
    ctx.font = `${lineFS}px monospace`;
    ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
        const y = statsTop + i * lineH;
        ctx.fillStyle = '#a9c5e8';
        ctx.textAlign = 'left';
        ctx.fillText(lines[i][0], labelX, y);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        ctx.fillText(lines[i][1], valueX, y);
    }

    // Footer — speedrun framing.
    const footerY = statsTop + lines.length * lineH + 30;
    ctx.fillStyle = '#88a8d4';
    ctx.font = `${Math.max(14, Math.floor(lineFS * 0.85))}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('Refresh to start a new run.', cx, footerY);

    ctx.restore();
}

function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return hh > 0
        ? `${hh}:${pad(mm)}:${pad(ss)}.${tenths}`
        : `${pad(mm)}:${pad(ss)}.${tenths}`;
}

function formatNumber(n) {
    return Math.floor(n).toLocaleString();
}

function pickPreferredWeapon(weaponShots) {
    let best = null;
    let bestCount = -1;
    for (const id in weaponShots) {
        if (weaponShots[id] > bestCount) {
            bestCount = weaponShots[id];
            best = id;
        }
    }
    return best;
}

// ── Wave intro overlay ────────────────────────────────────────────────────
// Full-screen darken with WAVE N text shown while wave entities warp in.
// Drawn AFTER all other HUD elements so it covers the world cleanly.
export function drawWaveIntroOverlay() {
    const msg = this.waveMessage;
    if (!msg || !msg.active || msg.phase !== 'intro') return;
    const now = Date.now();
    const elapsed = now - msg.startTime;
    const total = msg.duration || 2800;
    if (elapsed >= total) {
        msg.active = false;
        return;
    }

    // Snap to opaque on frame 1 — fading IN would briefly show the world
    // (or shop) through a near-transparent layer, which read as a flash.
    // Only the fade OUT is animated, so the player gets a clean cut to
    // black followed by a smooth reveal of the warped-in entities.
    const fadeOut = 700;
    let alpha;
    if (elapsed < total - fadeOut) {
        alpha = 1;
    } else {
        alpha = 1 - (elapsed - (total - fadeOut)) / fadeOut;
    }
    if (alpha <= 0.001) return;

    this.ctx.save();
    // Dark overlay — near-opaque at peak so the playfield is hidden
    // while entities warp into place.
    this.ctx.fillStyle = `rgba(0, 0, 0, ${0.95 * alpha})`;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // WAVE N + subtitle, dead center.
    this.ctx.globalAlpha = alpha;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    // 5.97.0 — Cap the wave-intro title much smaller on mobile. The
    // 120/64 cap was eating most of a portrait phone viewport for a
    // moment that the player can't even interact with.
    const _mob = isMobile();
    const _port = _mob && isPortrait();
    const titleFS = _port
        ? Math.min(46, Math.max(28, Math.floor(this.width / 10)))
        : (_mob
            ? Math.min(64, Math.max(38, Math.floor(this.height / 9)))
            : Math.min(120, Math.max(64, Math.floor(this.width / 14))));
    const subtitleFS = Math.max(_mob ? 12 : 20, Math.floor(titleFS / 4));
    const gap = Math.floor(titleFS * 0.85);

    this.drawWavyText(msg.title, centerX, centerY, {
        fontSize: titleFS,
        colors: WAVY_PALETTES.waveTitle,
        speed: 0.55,
        colorSpeed: 0.22,
    });
    if (msg.subtitle) {
        this.drawWavyText(msg.subtitle, centerX, centerY + gap, {
            fontSize: subtitleFS,
            colors: WAVY_PALETTES.waveSubtext,
            amplitude: 0,
            colorSpeed: 0.12,
        });
    }
    this.ctx.restore();
}

// 5.64.11 — old 4-slot bottom-center ability bar removed. Ability HUD is
// now a single square BELOW the PRM/PWR pair (see drawEquippedWeaponSquares
// below). This shim is kept so existing call sites don't crash; it's a
// no-op now that the third square is drawn alongside PRM/PWR.
export function drawAbilityCooldownHUD() { /* no-op */ }

// 5.85.0 — triforce geometry shared between draw + vaporize-spawn so
// the burst lines up exactly with the triangle that just disappeared.
// 5.88.3 — triforce + healthTanks fully unified. Each triangle is one
// spare energy tank. The healthbar to the right is the *active* tank
// (the "last" one in the user's framing — the one with no triangle).
// Total effective tanks = healthTanks + 1 (the active tank), capped at
// 4 effective = 3 spares (full triforce) + 1 active. The standalone
// battery icon I introduced in 5.88.0–5.88.2 is gone; nothing stands
// between the triforce and the screen edge anymore.
//
//   [triforce]  [healthbar]  [LV-shield][level]
//
// Loss order across the three spares: top → btm-right → btm-left.
const TRIFORCE_TRIANGLE_SIZE = 12;
const TRIFORCE_SPACING = 2;

// triforceLeftX is the leftmost pixel of the triforce widget.
// centerY is the vertical center (set by the caller to the healthbar's
// vertical center so the triforce sits inline with the bar).
function triforceLayout(triforceLeftX, centerY) {
    const halfHalf = TRIFORCE_TRIANGLE_SIZE / 2 + TRIFORCE_SPACING / 2;
    const centerX = triforceLeftX + halfHalf + TRIFORCE_TRIANGLE_SIZE / 2;
    // Vertically centered: triangle bounding (~10.4 px tall) + a 13px
    // row offset means topY = centerY - 6.5; bottomY = centerY + 6.5.
    const topY = centerY - (TRIFORCE_TRIANGLE_SIZE + TRIFORCE_SPACING - 1) / 2;
    const bottomY = topY + TRIFORCE_TRIANGLE_SIZE + TRIFORCE_SPACING - 1;
    return {
        topTri:   { x: centerX,           y: topY },
        btmLeft:  { x: centerX - halfHalf, y: bottomY },
        btmRight: { x: centerX + halfHalf, y: bottomY },
        size: TRIFORCE_TRIANGLE_SIZE,
    };
}

// 5.88.3 — Returns the (x, y, size) of the triangle that vanishes when
// the player drops from `tanksBefore` → `tanksBefore - 1`. Loss order:
//   3 → top triangle, 2 → btm-right, 1 → btm-left.
// `tanksBefore` here is the SPARE count; the active (healthbar) tank
// has no triangle to vaporize, so spares=0 with HP=0 just transitions
// to game-over without an FX call.
export function getDisappearingTankPos(tanksBefore, triforceLeftX = 36, centerY = 35) {
    const L = triforceLayout(triforceLeftX, centerY);
    if (tanksBefore >= 3) return { x: L.topTri.x,   y: L.topTri.y,   size: L.size };
    if (tanksBefore === 2) return { x: L.btmRight.x, y: L.btmRight.y, size: L.size };
    if (tanksBefore === 1) return { x: L.btmLeft.x,  y: L.btmLeft.y,  size: L.size };
    return { x: L.btmLeft.x, y: L.btmLeft.y, size: L.size };
}

// 5.88.0 — Recharge sparkle, fired when a spare tank is *gained* via
// overflow healing. Mirrors spawnTriforceVaporize but with a green/cyan
// palette so the visual reads as a refill, not a loss.
export function spawnTankRecharge(slotIndex, triforceLeftX = 36, centerY = 35) {
    const L = triforceLayout(triforceLeftX, centerY);
    let pos;
    if (slotIndex === 1) pos = L.btmLeft;
    else if (slotIndex === 2) pos = L.btmRight;
    else if (slotIndex === 3) pos = L.topTri;
    else return;

    if (!this._triforceVaporize) this._triforceVaporize = [];

    // 5.114.0 — Beefed sparkling appearance animation. Three layers
    // so the new triforce piece reads as a clear "+1 reward":
    //   1. Burst of 40 outward sparkle motes (was 24).
    //   2. Radiating sparkle rays — 8 elongated streaks oriented
    //      outward from the triangle center so the eye reads the
    //      appearance as a starburst.
    //   3. Slow-rising halo motes that drift up past the triforce so
    //      the triangle looks "settled into existence".
    // Plus the bright flash sprite layered on top.

    // 1. Outward sparkle burst.
    const BURST = 40;
    for (let i = 0; i < BURST; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.8 + Math.random() * 2.6;
        const ox = (Math.random() - 0.5) * L.size;
        const oy = (Math.random() - 0.5) * L.size;
        const roll = Math.random();
        const color = roll < 0.50 ? '#7cffc8'
            : roll < 0.78 ? '#bfffe6'
            : roll < 0.92 ? '#ffffff'
            :              '#ffe87c'; // rare gold accent
        this._triforceVaporize.push({
            x: pos.x + ox,
            y: pos.y + oy,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed - 0.25,
            life: 1.0,
            decay: 0.022 + Math.random() * 0.020,
            radius: 0.8 + Math.random() * 1.6,
            color,
        });
    }

    // 2. Radiating sparkle rays — 8 elongated motes flying straight
    // outward in a starburst pattern. Distinct visual layer from the
    // chaotic burst above so the appearance reads as a "+1 STAR".
    const RAYS = 8;
    for (let i = 0; i < RAYS; i++) {
        const a = (i / RAYS) * Math.PI * 2 + Math.random() * 0.15;
        const speed = 3.2 + Math.random() * 0.8;
        this._triforceVaporize.push({
            x: pos.x,
            y: pos.y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            life: 1.0,
            decay: 0.038,           // fade faster — they should streak briefly
            radius: 2.2 + Math.random() * 0.6,
            color: '#ffffff',
        });
    }

    // 3. Rising halo — 6 motes drifting upward past the triforce,
    // settle slowly so the new triangle looks like it materialized
    // out of falling magic dust.
    const HALO = 6;
    for (let i = 0; i < HALO; i++) {
        const ox = (Math.random() - 0.5) * (L.size * 1.6);
        const oy = (Math.random() - 0.3) * L.size;
        this._triforceVaporize.push({
            x: pos.x + ox,
            y: pos.y + oy,
            vx: (Math.random() - 0.5) * 0.4,
            vy: -1.2 - Math.random() * 0.8, // upward drift
            life: 1.0,
            decay: 0.013 + Math.random() * 0.008, // long-lived
            radius: 1.0 + Math.random() * 1.4,
            color: '#aaffea',
        });
    }

    this._triforceFlash = { x: pos.x, y: pos.y, t: 0, palette: 'green' };
}

// Spawn the gold/white particle blast + flash sprite at the triangle's
// center. Stored on the engine instance so the HUD draw path can tick
// and render them on top of the (now-shorter) triforce next frame.
export function spawnTriforceVaporize(x, y, size = TRIFORCE_TRIANGLE_SIZE) {
    if (!this._triforceVaporize) this._triforceVaporize = [];
    const PARTICLES = 36;
    for (let i = 0; i < PARTICLES; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.7 + Math.random() * 2.6;
        const ox = (Math.random() - 0.5) * size;
        const oy = (Math.random() - 0.5) * size;
        const roll = Math.random();
        const color = roll < 0.5 ? '#FFD700'
            : roll < 0.8 ? '#FFEC8B'
            : roll < 0.95 ? '#FFFFFF'
            : '#FFB000';
        this._triforceVaporize.push({
            x: x + ox,
            y: y + oy,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed - 0.4,
            life: 1.0,
            decay: 0.018 + Math.random() * 0.018,
            radius: 0.8 + Math.random() * 1.7,
            color,
        });
    }
    // Companion flash sprite at the triangle's former center.
    this._triforceFlash = { x, y, t: 0 };
}

export function updateAndDrawTriforceVaporize(ctx) {
    // Flash sprite (radial gradient halo + bright ring) — short, snappy.
    if (this._triforceFlash) {
        const f = this._triforceFlash;
        f.t += 0.09;
        if (f.t >= 1.0) {
            this._triforceFlash = null;
        } else {
            const r = 4 + f.t * 20;
            const a = (1 - f.t) * 0.95;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
            // 5.88.0 — palette switch: gold for vaporize, green for recharge.
            if (f.palette === 'green') {
                grad.addColorStop(0,   `rgba(195, 255, 220, ${a})`);
                grad.addColorStop(0.55, `rgba(80, 220, 140, ${a * 0.55})`);
                grad.addColorStop(1,   'rgba(80, 220, 140, 0)');
            } else {
                grad.addColorStop(0,   `rgba(255, 245, 180, ${a})`);
                grad.addColorStop(0.55, `rgba(255, 200, 60, ${a * 0.55})`);
                grad.addColorStop(1,   'rgba(255, 200, 60, 0)');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = f.palette === 'green'
                ? `rgba(220, 255, 230, ${a})`
                : `rgba(255, 245, 200, ${a})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(f.x, f.y, r * 0.62, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    if (!this._triforceVaporize || this._triforceVaporize.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this._triforceVaporize.length - 1; i >= 0; i--) {
        const p = this._triforceVaporize[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.vy += 0.04;
        p.life -= p.decay;
        if (p.life <= 0) {
            this._triforceVaporize.splice(i, 1);
            continue;
        }
        const a = Math.max(0, p.life);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.radius * a), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

export function drawCanvasTriforce(ctx, spareTanks, triforceLeftX, centerY) {
        const L = triforceLayout(triforceLeftX, centerY);
        const triangleSize = L.size;

        const drawTri = (cx, cy) => {
            const h = triangleSize * 0.866;
            ctx.beginPath();
            ctx.moveTo(cx, cy - h / 2);
            ctx.lineTo(cx - triangleSize / 2, cy + h / 2);
            ctx.lineTo(cx + triangleSize / 2, cy + h / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        };

        ctx.save();
        ctx.fillStyle = '#FFD700';
        ctx.strokeStyle = '#B8860B';
        ctx.lineWidth = 1;

        // 5.88.3 — render order: btm-left → btm-right → top, so loss
        // order is top FIRST (matches getDisappearingTankPos) and the
        // bottom-left triangle is the final spare before game over.
        if (spareTanks >= 1) drawTri(L.btmLeft.x, L.btmLeft.y);
        if (spareTanks >= 2) drawTri(L.btmRight.x, L.btmRight.y);
        if (spareTanks >= 3) drawTri(L.topTri.x, L.topTri.y);

        ctx.restore();

        // Vaporize FX (gold blast on loss, green sparkle on gain) draws
        // on top of whatever triangles remain.
        updateAndDrawTriforceVaporize.call(this, ctx);
}

export function drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight) {
        // 6.34.0 — Shield badge shows the player LEVEL again ("LV" inside
        // the shield + the level number to its right), and the power-
        // weapon energy SPHERE sits to the right of that.
        const level = ((this.player && this.player.level) | 0) || 1;
        const shieldIconSize = 28;
        const shieldCenterX = barX + 220 + 10 + shieldIconSize / 2; // 10px gap right of bar (barWidth=220)
        const shieldCenterY = barY + barHeight / 2;

        ctx.save();

        drawCachedShieldIcon(ctx, shieldCenterX, shieldCenterY, shieldIconSize);

        // "LV" inside the shield.
        ctx.save();
        ctx.font = "9px 'Press Start 2P', monospace";
        ctx.fillStyle = '#102342';
        ctx.strokeStyle = '#155379';
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText('LV', shieldCenterX, shieldCenterY);
        ctx.fillText('LV', shieldCenterX, shieldCenterY);
        ctx.restore();

        const levelLabelX = shieldCenterX + shieldIconSize / 2 + 8;
        ctx.font = "14px 'Press Start 2P', monospace";
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const levelText = `${level}`;
        ctx.strokeText(levelText, levelLabelX, shieldCenterY);
        ctx.fillText(levelText, levelLabelX, shieldCenterY);
        const levelTextW = ctx.measureText(levelText).width;

        // 6.148.0 — persistent "SP available" pip. When the player has unspent
        // Stat Points, a pulsing green "+N SP" badge sits right of the level
        // number so the reward stays visible after the LEVEL UP banner fades
        // (SP are spent on the STATS screen at wave-clear / from the menu).
        let spPipW = 0;
        const sp = ((this.player && this.player.sp) | 0) || 0;
        if (sp > 0) {
            const pulse = 0.65 + 0.35 * Math.abs(Math.sin(Date.now() * 0.005));
            const spText = `+${sp} SP`;
            const spX = levelLabelX + levelTextW + 10;
            ctx.save();
            ctx.font = "10px 'Press Start 2P', monospace";
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const padX = 5;
            const tw = ctx.measureText(spText).width;
            const pillH = 16;
            const pillY = shieldCenterY - pillH / 2;
            // Pulsing green pill background.
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(0, 80, 30, 0.85)';
            ctx.strokeStyle = '#39ff88';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const pillW = tw + padX * 2;
            if (ctx.roundRect) ctx.roundRect(spX, pillY, pillW, pillH, 4);
            else ctx.rect(spX, pillY, pillW, pillH);
            ctx.fill();
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#aaffcc';
            ctx.fillText(spText, spX + padX, shieldCenterY + 1);
            ctx.restore();
            spPipW = pillW + 10;
        }

        // Energy sphere — right of the level number (and the SP pip if shown).
        const sphereR = barHeight * 0.6;
        const sphereCX = levelLabelX + levelTextW + 16 + spPipW + sphereR;
        drawEnergySphere.call(this, ctx, sphereCX, shieldCenterY, sphereR);

        // DIR-06 (§13.6) — Power Level (PWR) readout. A compact "P {value}"
        // beside the level/shield cluster (right of the energy sphere) so the
        // player sees their build strength climb — the competence scoreboard
        // that pairs with the CD-16 THREAT meter ("PWR vs THREAT"). DIR-05
        // computes + caches `game.playerPWR` at each wave start; here we only
        // READ it. Defensive: if it's undefined/NaN (a save mid-migration, or
        // before DIR-05 runs) we fall back to the neutral reference (≈100) so
        // the readout never throws and never reads blank.
        const PWR_FALLBACK = 100;
        const rawPwr = this.game ? this.game.playerPWR : undefined;
        const pwrVal = Number.isFinite(rawPwr) ? Math.round(rawPwr) : PWR_FALLBACK;
        // Queryable marker for QA (mirrors `_threatLevelDrawn`).
        this._pwrDrawn = pwrVal;
        const pwrText = `P ${pwrVal}`;
        const pwrX = sphereCX + sphereR + 12;
        ctx.save();
        ctx.font = "10px 'Press Start 2P', monospace";
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        // Warm violet-gold — reads as "your power", distinct from the THREAT
        // meter's cool→hot pip ramp. Subtle, like the level number.
        ctx.fillStyle = '#c9a6ff';
        ctx.strokeText(pwrText, pwrX, shieldCenterY);
        ctx.fillText(pwrText, pwrX, shieldCenterY);
        ctx.restore();

        ctx.restore();
}

// 6.34.0 — Power-weapon energy SPHERE. A glass orb whose interior fills
// from the center outward (like a brightening light) as energy banks.
// The fill is tinted by the active primary weapon's color and styled
// like a Bose-Einstein condensate — a glowing gaseous core with faint
// laser-diffraction streaks. Pulses a gold rim once enough energy is
// banked to fire the active power weapon.
const _ENERGY_HEX_CACHE = {};
function _energyRgb(hex) {
    if (_ENERGY_HEX_CACHE[hex]) return _ENERGY_HEX_CACHE[hex];
    let h = (hex || '#00ccff').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    const rgb = { r, g, b };
    _ENERGY_HEX_CACHE[hex] = rgb;
    return rgb;
}
function drawEnergySphere(ctx, cx, cy, r) {
    const player = this.player;
    if (!player) return;
    const maxE = player.maxEnergy || 100;
    const frac = Math.max(0, Math.min(1, (player.energy || 0) / maxE));
    const cfg = PRIMARY_WEAPONS[player.activePrimary];
    const color = (cfg && cfg.color) || '#00ccff';
    const { r: cr, g: cg, b: cb } = _energyRgb(color);
    const now = Date.now();

    ctx.save();

    // Dark glass interior backdrop.
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 12, 22, 0.78)';
    ctx.fill();

    // Inner condensate — clip to the glass, fill center-outward.
    if (frac > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
        ctx.clip();

        const coreR = Math.max(1, r * frac);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        // The colored body stays solid out to `solidStop`, then feathers to
        // transparent in the remaining sliver. solidStop ramps with frac so
        // at full charge (frac=1) the body reaches the rim and the orb reads
        // as COMPLETELY full; at partial charge it keeps a soft gaseous edge.
        // (Previously the colored stop was at 0.45 → fully transparent at the
        // rim, so the orb never visually filled even when energy was maxed.)
        const solidStop = Math.min(0.97, 0.5 + 0.47 * frac);
        grad.addColorStop(0,         `rgba(255,255,255,${0.85 * frac + 0.15})`);
        grad.addColorStop(solidStop, `rgba(${cr},${cg},${cb},0.8)`);
        grad.addColorStop(1,         `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

        // Laser-diffraction streaks through the gas (additive).
        ctx.globalCompositeOperation = 'lighter';
        const t = now * 0.001;
        for (let i = 0; i < 5; i++) {
            const a = t * 0.6 + i * (Math.PI / 5);
            const alpha = (0.10 + 0.07 * Math.sin(t * 2 + i)) * frac;
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * coreR, cy + Math.sin(a) * coreR);
            ctx.lineTo(cx - Math.cos(a) * coreR, cy - Math.sin(a) * coreR);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Glass rim + specular highlight.
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(200, 230, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy - r * 0.34, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();

    // Ready pulse — gold rim once a power shot is affordable.
    const cost = (typeof player.getPowerEnergyCost === 'function') ? player.getPowerEnergyCost() : 30;
    const ready = (player.energy || 0) >= cost;
    if (ready) {
        const pulse = 0.4 + 0.3 * Math.sin(now * 0.012);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255, 240, 160, ${pulse})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Numeric readout beneath the orb: current / total energy. Goes gold
    // once a power shot is affordable (matches the ready-pulse cue), soft
    // blue-white while still banking.
    const energyText = `${Math.floor(player.energy || 0)}/${Math.round(maxE)}`;
    ctx.font = "9px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillStyle = ready ? '#FFE0A0' : 'rgba(210, 232, 255, 0.92)';
    const textY = cy + r + 5;
    ctx.strokeText(energyText, cx, textY);
    ctx.fillText(energyText, cx, textY);

    ctx.restore();
}

// 5.72.2 — Gold readout: bottom-right above the timer, with two
// animations stacked on top:
//   1. A "+N" popup floats up + fades on every gain (mirrors the
//      damage-number popup style).
//   2. The numeric counter ROLLS toward the real money value like a
//      casino slot reel, instead of snapping. Lerp speed is tuned so
//      a +5 trickle feels brisk and a wave-clear bonus feels meaty.
export function drawBottomRightGold(ctx) {
        if (!this.game) return;
        const margin = 20;
        const rowY = this.canvas.height - 40 - 36;
        const x = this.canvas.width - margin;

        // ── 1. Detect gains, coalesce popups ──────────────────────────
        // First-frame init (avoids a phantom +game.money popup on boot).
        if (!this._goldInit) {
            this._lastSeenMoney = this.game.money;
            this._displayedMoney = this.game.money;
            this._goldInit = true;
            this._goldPending = 0;
            this._goldPendingDeadline = 0;
        }
        const real = this.game.money;
        const delta = real - this._lastSeenMoney;
        const nowMs = Date.now();
        // 5.79.1 — Coalesce gold-pickup popups. Instead of pushing a
        //   "+N" popup on every per-orb delta (which produced 4-30
        //   stacked popups during a multi-orb collection burst), we
        //   accumulate deltas into a running total and flush ONE big
        //   popup after a short quiet window (250 ms of no new gains).
        //   Counter flash + slot-roll still fire per-gain so the gold
        //   reads "active"; only the floating popups are deduped.
        const COALESCE_MS = 250;
        if (delta > 0) {
            this._goldPending = (this._goldPending || 0) + delta;
            this._goldPendingDeadline = nowMs + COALESCE_MS;
            this._goldFlashUntil = nowMs + 280; // counter flash on every tick
        }
        this._lastSeenMoney = real;

        // Flush the pending burst once the quiet window expires.
        if (this._goldPending > 0 && nowMs >= this._goldPendingDeadline) {
            const amount = Math.round(this._goldPending);
            this._goldPending = 0;

            // Two spawn points: HUD-anchored (bottom-right) + player-
            // anchored (over the ship). Both are arc-trajectory floaters.
            const jitter = (Math.random() - 0.5) * 30;
            this.goldPopups.push({
                amount, x: x - 60 + jitter, y: rowY - 8,
                vx: (Math.random() - 0.5) * 2.4,
                vy: -3.6,
                gravity: 0.18,
                life: 1.0,
                maxLife: 1300,
                age: 0,
                big: amount >= 50,        // 5.79.1 — bigger glyph for chunky payouts
            });
            if (this.player && this.player.active && this.camera) {
                const ps = (Math.random() - 0.5) * 24;
                this.goldPopups.push({
                    amount,
                    x: (this.player.x - this.camera.x) + ps,
                    y: (this.player.y - this.camera.y) - 40,
                    vx: (Math.random() - 0.5) * 2.4,
                    vy: -3.6,
                    gravity: 0.18,
                    life: 1.0,
                    maxLife: 1300,
                    age: 0,
                    big: amount >= 50,
                });
            }
            if (this.goldPopups.length > 16) {
                this.goldPopups.splice(0, this.goldPopups.length - 16);
            }
        }

        // ── 2. Slot-roll smoothing ────────────────────────────────────
        // Lerp by 18%/frame toward real, with a minimum step so small
        // gains finish quickly. Snap when within 0.5 to avoid creeping.
        const diff = real - this._displayedMoney;
        if (Math.abs(diff) < 0.5) {
            this._displayedMoney = real;
        } else {
            const lerpStep = diff * 0.18;
            const minStep = Math.sign(diff) * Math.min(2, Math.abs(diff));
            this._displayedMoney += Math.abs(lerpStep) > Math.abs(minStep) ? lerpStep : minStep;
        }

        // ── 3. Draw counter (rolling + flash) ─────────────────────────
        // 5.72.3 — counter pulses + tints bright white on every gain.
        // Flash window is 280 ms; we ease both scale (1 → 1.18 → 1) and
        // tint (gold → white-hot → gold) across that window.
        const now = Date.now();
        const flashRemaining = Math.max(0, (this._goldFlashUntil || 0) - now);
        const flashT = flashRemaining > 0 ? flashRemaining / 280 : 0; // 1 → 0
        // Bell curve so the flash peaks mid-window.
        const flashPulse = flashT > 0 ? Math.sin(flashT * Math.PI) : 0;
        const scale = 1 + 0.18 * flashPulse;
        const flashFill = flashPulse > 0
            ? `rgba(255, ${Math.round(215 + 40 * flashPulse)}, ${Math.round(40 + 200 * flashPulse)}, 1)`
            : '#FFD700';
        const rolling = Math.abs(real - this._displayedMoney) >= 1;
        const glowActive = rolling || flashPulse > 0;

        ctx.save();

        const displayed = Math.floor(this._displayedMoney);
        const coinsText = `${displayed}`;

        ctx.font = "16px 'Press Start 2P', monospace";
        ctx.fillStyle = flashFill;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        if (glowActive) {
            ctx.shadowColor = flashPulse > 0 ? '#FFFFFF' : '#FFD700';
            ctx.shadowBlur = 10 + 14 * flashPulse;
        }

        const textWidth = ctx.measureText(coinsText).width;

        // Apply scale-pulse around the text's right anchor (since textAlign='right',
        // the rotation/scale anchor is at (x, rowY)).
        if (scale !== 1) {
            ctx.translate(x, rowY);
            ctx.scale(scale, scale);
            ctx.strokeText(coinsText, 0, 0);
            ctx.fillText(coinsText, 0, 0);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
            ctx.strokeText(coinsText, x, rowY);
            ctx.fillText(coinsText, x, rowY);
        }

        // Coin icon to the left of the text — also pulses on flash.
        ctx.shadowBlur = 0;
        const coinIconSize = 26;
        const coinIconCx = x - textWidth - 10 - coinIconSize / 2;
        drawCachedMoneyIcon(ctx, coinIconCx, rowY, coinIconSize, '#FFD700', '#B8860B');

        ctx.restore();

        // ── 4. Tick + draw popups (parabolic arc) ─────────────────────
        const dt = 16; // approximate frame ms
        for (let i = this.goldPopups.length - 1; i >= 0; i--) {
            const p = this.goldPopups[i];
            p.age += dt;
            p.life = Math.max(0, 1 - p.age / p.maxLife);
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity || 0.18; // gravity pulls back down → arc
            if (p.life <= 0) {
                this.goldPopups.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = p.life;
            // 5.79.1 — chunky payouts (≥50 gold) get a 24px glyph,
            //   smaller drips stay at 18px. The coalesced popup is
            //   the only "+N" the player sees per pickup burst.
            ctx.font = p.big
                ? "bold 24px 'Press Start 2P', monospace"
                : "bold 18px 'Press Start 2P', monospace";
            ctx.fillStyle = '#FFD700';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
            ctx.lineWidth = p.big ? 4 : 3;
            ctx.lineJoin = 'round';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Slight scale grow at spawn → fade so the popup feels poppy.
            const popScale = 1 + (p.big ? 0.32 : 0.25) * Math.min(1, p.age / 120);
            ctx.translate(p.x, p.y);
            ctx.scale(popScale, popScale);
            const txt = `+${p.amount}`;
            ctx.strokeText(txt, 0, 0);
            ctx.fillText(txt, 0, 0);
            ctx.restore();
        }
}

export function drawXPBar() {
        // 6.34.0 — Health-strip bar retired. Power-weapon energy moved to
        // the glass sphere (drawEnergySphere) and the level XP bar moved
        // to the page bottom (drawXPLevelBar). This is now a no-op so the
        // health bar's bottom strip reads clean.
}

// 6.34.0 — Level XP bar: a thin segmented gold bar across the very
// 9.0.0 (reboot) — leveling/XP removed; bottom XP bar gone (no-op stub kept so
// any lingering caller doesn't throw).
export function drawXPLevelBar(/* ctx */) { /* no-op (9.0.0) */ }

export function drawLevelUpText() {
        if (!this.player || !this.player.levelUpTextInfo || !this.player.levelUpTextInfo.active) {
            return;
        }

        const { level, progress } = this.player.levelUpTextInfo;
        const screenWidth = this.width;
        const screenHeight = this.height;

        // 5.72.0 — moved from near-bottom (screenHeight - 80) to upper
        // third so the LEVEL X! announce never overlaps the killstreak
        // text that now lives at the bottom-center.
        const textY = Math.floor(screenHeight * 0.30);
        const centerX = screenWidth / 2;

        this.ctx.save();

        // Calculate fade in/out effect
        let textAlpha = 1;
        if (progress < 0.2) {
            // Fade in for first 20% of animation
            textAlpha = progress / 0.2;
        } else if (progress > 0.7) {
            // Fade out for last 30% of animation
            textAlpha = (1 - progress) / 0.3;
        }

        // Pulsing effect
        const pulseIntensity = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
        const scale = 1 + pulseIntensity * 0.1;

        this.ctx.globalAlpha = textAlpha * pulseIntensity;
        this.ctx.translate(centerX, textY);
        this.ctx.scale(scale, scale);

        // 5.100.2 — Mobile cap on level-up text. The desktop 32 / 16
        // pair overflows portrait phones; cut to fit the viewport.
        const _mobLU = isMobile();
        const _portLU = _mobLU && isPortrait();
        const lvlFS = _portLU ? 20 : (_mobLU ? 24 : 32);
        const subFS = _portLU ? 11 : (_mobLU ? 13 : 16);

        // Wavy gold "LEVEL UP!" — palette pulses around the original #FFD700.
        this.drawWavyText(`LEVEL UP!  LV ${level}`, 0, -15, {
            fontSize: lvlFS,
            colors: WAVY_PALETTES.gold,
            amplitude: 6,
            speed: 0.6,
            colorSpeed: 0.45,
        });

        // 6.148.0 — subtitle announces the Stat Point award + how many are
        // now available to spend (was the stale "Ability Point Gained!").
        const sp = (this.player && this.player.sp | 0) || 0;
        const spText = sp > 0
            ? `+1 STAT POINT  ·  ${sp} SP TO SPEND`
            : '+1 STAT POINT';
        this.drawWavyText(spText, 0, 15, {
            fontSize: subFS,
            colors: WAVY_PALETTES.orange,
            amplitude: 3,
            speed: 0.45,
            colorSpeed: 0.3,
        });

        this.ctx.restore();
}

export function updateHUD() {
        const ctx = this.ctx;
        // 5.96.0 — Reverted the 5.95.0 mobile-only early-return.
        //   Mobile is an RPG; the player NEEDS to see HP, triforce (spare
        //   tanks), and XP/level. The loadout / gold / survival-timer
        //   widgets stay hidden on mobile (see the `mobileSimplified`
        //   block below at the 5.92.0 simplification) but the core
        //   top-left status cluster is shared between desktop and mobile.
        // 5.88.3 — top-left cluster:
        //   [triforce] [healthbar] [LV-shield] [level-num]
        //   All share the bar's vertical center (barCenterY = 35). The
        //   triforce IS the spare-tank visualization (each triangle =
        //   1 spare); the active tank is the healthbar itself.
        //   Left margin matches the bottom-left loadout squares' left
        //   margin (livesX=36 in drawEquippedWeaponSquares) so the two
        //   HUD clusters align flush against an invisible left rail.
        const triforceLeftX = 36;
        // bar starts 8 px right of the triforce's rightmost pixel.
        // triforce occupies 26 px → barX = 36 + 26 + 8 = 70.
        const barX = 70;
        const barHeight = 30;
        const barWidth = 220;
        const barY = 20;
        const barCenterY = barY + barHeight / 2;
        const bevelSize = 12;
        const segments = 10; // Number of segments for the bar

        ctx.save();

        // Draw triforce (= spare energy-tank indicator) on canvas,
        // vertically centered with the healthbar so the row reads as
        // one HUD widget. healthTanks (= spare count, 0..3) is the
        // source of truth.
        this.drawCanvasTriforce(ctx, this.healthTanks | 0, triforceLeftX, barCenterY);

        // Create futuristic angled health bar geometry
        const createHealthBarPath = (width) => {
            ctx.beginPath();
            // Start from top-left with angled corner
            ctx.moveTo(barX + bevelSize, barY);
            // Top edge with slight angle
            ctx.lineTo(barX + width - bevelSize * 0.5, barY);
            // Angled top-right corner
            ctx.lineTo(barX + width, barY + bevelSize);
            // Right edge
            ctx.lineTo(barX + width, barY + barHeight - bevelSize);
            // Angled bottom-right corner
            ctx.lineTo(barX + width - bevelSize, barY + barHeight);
            // Bottom edge with angle
            ctx.lineTo(barX + bevelSize * 0.5, barY + barHeight);
            // Angled bottom-left corner
            ctx.lineTo(barX, barY + barHeight - bevelSize);
            // Left edge
            ctx.lineTo(barX, barY + bevelSize);
            // Close back to start
            ctx.closePath();
        };

        // Outer glow effect removed for performance

        // Draw background container
        createHealthBarPath(barWidth);
        ctx.fillStyle = 'rgba(10, 40, 80, 0.8)';
        ctx.fill();

        // Draw subtle border
        ctx.strokeStyle = 'rgba(120, 200, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Shadow effects removed for performance

        // Calculate health percentage using effective max health.
        // The bar animates: `_displayedHealth` is a smoothed value that
        // eases toward the real health each frame. Damage spikes show a
        // visible drain instead of an instant drop. Lazily initialized
        // here so we don't have to thread it through engine init.
        const effectiveMaxHealth = this.player.getEffectiveMaxHealth();
        if (this._displayedHealth === undefined) this._displayedHealth = this.player.health;
        // Asymmetric ease — drain (damage) plays slightly slower than
        // gain (heal/respawn) so hits read as a clear chunk leaving the
        // bar.
        const target = this.player.health;
        const delta = target - this._displayedHealth;
        const speed = delta < 0 ? 0.16 : 0.30; // drain 16%/frame, gain 30%/frame
        this._displayedHealth += delta * speed;
        // Snap when within 0.5 HP so the bar doesn't crawl forever.
        if (Math.abs(target - this._displayedHealth) < 0.5) {
            this._displayedHealth = target;
        }
        const healthPercentage = this._displayedHealth / effectiveMaxHealth;
        const filledWidth = barWidth * healthPercentage;

        // Add warning glow effect for low health
        if (healthPercentage <= 0.3) {
            ctx.save();
            // Static red glow for low health warning (performance optimized)

            // Draw warning glow around the entire health bar area
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)'; // Fixed opacity instead of undefined pulseIntensity
            ctx.lineWidth = 3;
            createHealthBarPath(barWidth);
            ctx.stroke();
            ctx.restore();
        }

        // Draw filled health bar with gradient
        if (filledWidth > 0) {

            // 5.72.1 — gradients are cached PER-barY because the bar can
            // now move (5.72.0 moved it bottom-anchored). The previous
            // implementation cached gradients at fixed coordinates (60,20,60,50),
            // so when barY changed the gradient ended up rendered above
            // the bar's actual screen position — bar appeared unfilled.
            // Cache keyed on barY: we keep the perf benefit when the
            // window isn't resizing.
            if (!this._hpGradients || this._hpGradientsBarY !== barY) {
                const y0 = barY;
                const y1 = barY + barHeight;

                const gHigh = ctx.createLinearGradient(60, y0, 60, y1);
                gHigh.addColorStop(0, 'rgba(0, 150, 255, 0.95)');
                gHigh.addColorStop(0.3, 'rgba(0, 120, 255, 0.9)');
                gHigh.addColorStop(0.7, 'rgba(0, 90, 255, 0.85)');
                gHigh.addColorStop(1, 'rgba(0, 60, 220, 0.8)');

                const gMid = ctx.createLinearGradient(60, y0, 60, y1);
                gMid.addColorStop(0, 'rgba(255, 255, 0, 0.95)');
                gMid.addColorStop(0.3, 'rgba(255, 220, 0, 0.9)');
                gMid.addColorStop(0.7, 'rgba(255, 180, 0, 0.85)');
                gMid.addColorStop(1, 'rgba(220, 140, 0, 0.8)');

                const gLow = ctx.createLinearGradient(60, y0, 60, y1);
                gLow.addColorStop(0, 'rgba(255, 50, 50, 0.95)');
                gLow.addColorStop(0.3, 'rgba(255, 20, 20, 0.9)');
                gLow.addColorStop(0.7, 'rgba(220, 0, 0, 0.85)');
                gLow.addColorStop(1, 'rgba(180, 0, 0, 0.8)');

                this._hpGradients = { high: gHigh, mid: gMid, low: gLow };
                this._hpGradientsBarY = barY;
            }

            const tier = healthPercentage > 0.6 ? 'high' : healthPercentage > 0.3 ? 'mid' : 'low';
            const gradient = this._hpGradients[tier];

            // 5.105.0 — Healthbar geometry has angled bevel corners on
            // both ends. The previous `createHealthBarPath(filledWidth)`
            // call malformed at low HP: when filledWidth < 2 * bevelSize,
            // the top-right corner `barX + width - bevelSize*0.5` slid
            // LEFT of `barX`, producing a self-intersecting polygon whose
            // fill bled past the left edge of the bar silhouette.
            //
            // Fix: clip to the FULL-WIDTH bar silhouette, then fill a
            // simple rectangle from barX to barX+filledWidth. The clip
            // crops the rectangle to the bevel silhouette automatically,
            // so the angled left edge is preserved AND the fill can
            // never extend past the bar's outer shape.
            ctx.save();
            createHealthBarPath(barWidth);
            ctx.clip();
            ctx.fillStyle = gradient;
            ctx.fillRect(barX, barY, Math.max(0, filledWidth), barHeight);
            ctx.restore();

            // Subtle inner glow stroke along the filled portion. Use the
            // simple rect inside the clip too so the stroke doesn't
            // double-trace the bevel left edge at low HP (the malformed
            // polygon stroke was extending past barX in the legacy code).
            ctx.save();
            createHealthBarPath(barWidth);
            ctx.clip();
            ctx.strokeStyle = 'rgba(200, 240, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, Math.max(0, filledWidth), barHeight);
            ctx.restore();
        }

        // 6.149.0 — overflow → tank progress, made VISIBLE. Healing past max HP
        // banks toward the next spare tank (accumulateOverflowToTank); show that
        // surplus as a bright pulsing cyan fill layered over the full bar, so the
        // player literally sees the health bar "overflow and fill with the
        // surplus" as it builds toward regaining a tank.
        const tankProg = Math.max(0, Math.min(1, (this.player._tankProgress) || 0));
        if (tankProg > 0) {
            const ovW = barWidth * tankProg;
            const pulse = 0.55 + 0.45 * Math.abs(Math.sin(Date.now() * 0.006));
            ctx.save();
            createHealthBarPath(barWidth);
            ctx.clip();
            ctx.globalAlpha = pulse;
            const og = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
            og.addColorStop(0, 'rgba(200, 255, 255, 0.95)');
            og.addColorStop(1, 'rgba(0, 220, 255, 0.85)');
            ctx.fillStyle = og;
            ctx.fillRect(barX, barY, Math.max(0, ovW), barHeight);
            ctx.restore();
        }

        // Remove segmentation lines for cleaner look

        // Draw XP bar at the bottom of the health bar
        this.drawXPBar(ctx, barX, barY, barWidth, barHeight);

        // Draw HP text below the health bar with matching colors
        ctx.font = "12px 'Press Start 2P', monospace";

        // Match text color to health bar color
        const textHealthPercentage = this.player.health / effectiveMaxHealth;
        let textColor, strokeColor;
        if (textHealthPercentage > 0.6) {
            textColor = 'rgba(100, 220, 255, 0.9)';
            strokeColor = 'rgba(60, 180, 255, 0.6)';
        } else if (textHealthPercentage > 0.3) {
            textColor = 'rgba(150, 220, 255, 0.9)';
            strokeColor = 'rgba(120, 180, 200, 0.6)';
            } else {
            textColor = 'rgba(255, 150, 150, 0.9)';
            strokeColor = 'rgba(220, 120, 150, 0.6)';
        }

        ctx.fillStyle = textColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const hpText = `${Math.round(this.player.health)}/${effectiveMaxHealth}`;
        const textX = barX + barWidth / 2;
        const textY = barY + barHeight + 12; // Position below the bar with more margin

        // Draw heart icon to the left of health text
        const hpTextWidth = ctx.measureText(hpText).width;

        const heartIconSize = 24;
        const heartIconX = textX - hpTextWidth/2 - heartIconSize - 4; // Position to the left of health text with margin
        const heartIconY = textY + 5;

        drawCachedHeartIcon(ctx, heartIconX, heartIconY, heartIconSize, '#800000', '#DC143C');

        // Draw text outline
        ctx.strokeText(hpText, textX, textY);
        // Draw text fill
        ctx.fillText(hpText, textX, textY);

        // Shield icon and level display moved to bottom bar next to coins for cleaner layout

        // Draw shield tanks
        const tankSize = 25;
        const tankMargin = 8;
        const tanksY = barY + barHeight + 10;

        // Update shield tanks display
        let healthTanksContainer = document.getElementById('shield-tanks');
        if (!healthTanksContainer) {
            // Create shield tanks container if it doesn't exist
            const container = document.createElement('div');
            container.id = 'shield-tanks';
            container.style.position = 'absolute';
            container.style.top = '40px';
            container.style.left = '70px'; // Align with shield bar (24px base + 45px margin)
            container.style.display = 'flex';
            container.style.gap = '3px';
            container.style.zIndex = '90';
            document.body.appendChild(container);
        } else {
            // Clear existing tanks
            healthTanksContainer.innerHTML = '';
        }

        // Shield tanks display removed - was causing green square overlay
        // Tanks are now managed internally without DOM elements

        // Draw level and coins beneath lives and health bar
        this.drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight);

        // 5.92.0 — Mobile HUD simplification: hide the loadout squares,
        // gold readout, and survival timer. The bottom-center action
        // button bar (drawHudButtons) is the only HUD chrome we keep
        // outside the top-left status cluster (triforce + healthbar +
        // XP). Tap-to-shoot + auto-fire mean the player never needs to
        // glance at a weapon meter; the simpler HUD makes more of the
        // playfield usable on a phone-sized viewport.
        const mobileSimplified = isMobile();

        // Equipped weapon squares (PRM / PWR / SKL) ABOVE the bar (5.72.0).
        if (!mobileSimplified) {
            this.drawEquippedWeaponSquares(ctx, barX, barY, barHeight);
        }

        // Survival timer (bottom-right) + gold readout above it (5.72.0).
        if (!mobileSimplified) {
            this.drawSurvivalTimer(ctx);
            this.drawBottomRightGold(ctx);
        }

        // 6.34.0 — Level XP bar across the very bottom of the screen.
        this.drawXPLevelBar(ctx);

        // 5.78.0 — defense indicators moved to drawHUD's outer scope so
        // they render during PAUSED / SHOP / WAVE_TRANSITION too.
}

// 5.76.1 — defense HUD widgets. Three small icons stacked vertically
// on the left edge above the loadout squares. Each appears only if
// the player owns the corresponding upgrade.
//   • REFLEXES — green ring fills as the 30s cooldown ticks down to
//                ready; full ring + glow when armed.
//   • LAST_STAND — ✊ icon. Full-color when armed; greyed once spent.
//   • STATIC_FIELD — shield meter (vertical bar) showing current /
//                    cap with the cap = stacks × 2.
export function drawDefenseIndicators(ctx) {
    if (!this.player || !this.player.getPowerupStacks) return;
    const reflexStacks = this.player.getPowerupStacks('REFLEXES');
    const lastStandStacks = this.player.getPowerupStacks('LAST_STAND');
    const staticStacks = this.player.getPowerupStacks('STATIC_FIELD');
    if (reflexStacks + lastStandStacks + staticStacks === 0) return;

    const ICON = 32;
    const GAP = 8;
    const baseX = 36;                                  // align with triforce/loadout
    let baseY = this.canvas.height - 50 - 80 - 24 - ICON; // sit above the loadout row
    // Push up further if multiple icons stack so they don't overlap loadout.
    const totalCount = (reflexStacks > 0 ? 1 : 0) + (lastStandStacks > 0 ? 1 : 0) + (staticStacks > 0 ? 1 : 0);
    baseY -= (totalCount - 1) * (ICON + GAP);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let y = baseY;
    if (reflexStacks > 0) {
        const now = Date.now();
        const readyAt = this.player._reflexesReadyAt || 0;
        // 1.0 = ready, 0.0 = just used.
        const readyFrac = readyAt > now
            ? Math.max(0, 1 - (readyAt - now) / 30000)
            : 1;
        const cx = baseX + ICON / 2;
        const cy = y + ICON / 2;
        // Track ring (dim).
        ctx.beginPath();
        ctx.arc(cx, cy, ICON / 2 - 2, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(60, 90, 80, 0.6)';
        ctx.stroke();
        // Fill ring (cooldown progress).
        ctx.beginPath();
        ctx.arc(cx, cy, ICON / 2 - 2, -Math.PI / 2, -Math.PI / 2 + readyFrac * Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = readyFrac >= 1 ? '#7FFFB0' : '#44ccaa';
        if (readyFrac >= 1) {
            ctx.shadowColor = '#7FFFB0';
            ctx.shadowBlur = 10;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Center icon.
        ctx.font = "16px 'Press Start 2P', monospace";
        ctx.fillStyle = readyFrac >= 1 ? '#7FFFB0' : 'rgba(127, 255, 176, 0.55)';
        ctx.fillText('🌀', cx, cy);
        y += ICON + GAP;
    }
    if (lastStandStacks > 0) {
        const used = !!this.player._lastStandUsed;
        const cx = baseX + ICON / 2;
        const cy = y + ICON / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ICON / 2 - 2, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = used ? 'rgba(120, 60, 60, 0.5)' : '#ff8888';
        if (!used) {
            ctx.shadowColor = '#ff5555';
            ctx.shadowBlur = 8;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = "16px 'Press Start 2P', monospace";
        ctx.fillStyle = used ? 'rgba(120, 60, 60, 0.5)' : '#ff8888';
        ctx.fillText('✊', cx, cy);
        y += ICON + GAP;
    }
    if (staticStacks > 0) {
        const cap = staticStacks * 2;
        const cur = Math.max(0, Math.min(cap, this.player._staticShield ?? cap));
        const frac = cap > 0 ? cur / cap : 0;
        const cx = baseX + ICON / 2;
        const cy = y + ICON / 2;
        // Square outline.
        ctx.strokeStyle = '#88ccff';
        ctx.lineWidth = 2;
        ctx.strokeRect(baseX + 2, y + 2, ICON - 4, ICON - 4);
        // Vertical fill from bottom.
        const fillH = (ICON - 6) * frac;
        const grad = ctx.createLinearGradient(0, y + ICON - 3, 0, y + 3);
        grad.addColorStop(0, '#aae6ff');
        grad.addColorStop(1, '#3399ff');
        ctx.fillStyle = grad;
        ctx.fillRect(baseX + 3, y + ICON - 3 - fillH, ICON - 6, fillH);
        // Numeric overlay.
        ctx.font = "9px 'Press Start 2P', monospace";
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        const txt = `${cur|0}/${cap}`;
        ctx.strokeText(txt, cx, cy);
        ctx.fillText(txt, cx, cy);
    }
    ctx.restore();
}

// Three loadout squares — Primary, Power, Ability — that sit directly
// ABOVE the healthbar in the bottom-left HUD (5.72.0; was below the
// coins display in the top-left). Show the equipped icon in its
// weapon color, with PRM / PWR / SKL labels underneath. The Primary
// square pulses briefly when the player cycles weapons via R (driven
// by `gameEngine._weaponCycleAnim` set in event-setup.js).
export function drawEquippedWeaponSquares(ctx, barX, barY, barHeight) {
    if (!this.player) return;
    const livesX = 36;

    const squareSize = 50;
    const gap = 12;
    const cornerRadius = 12;
    // 5.72.1 — loadout stays in the BOTTOM-LEFT corner regardless of
    // where the healthbar lives (the bar moved back to top-left in
    // 5.72.1). Anchor: 32 px from left, ~80 px from bottom (clears
    // the labels printed beneath each square + a margin).
    const groupX = livesX;
    const groupY = this.canvas.height - squareSize - 80;

    const primaryCfg = this.player.getActivePrimaryConfig?.() || {};
    const powerCfg = this.player.getActivePowerConfig?.() || {};
    // 9.0.0 (reboot) — abilityCfg dropped (ability system removed).

    // Animation: brief scale + glow pulse on whichever square just
    // cycled. State lives on the game engine. anim.slot is one of
    // 'primary' / 'power' / 'ability'.
    let primaryScale = 1, primaryGlow = 0;
    let powerScale = 1, powerGlow = 0;
    let abilityScale = 1, abilityGlow = 0;
    const anim = this._weaponCycleAnim;
    if (anim && Date.now() - anim.start < anim.duration) {
        const t = (Date.now() - anim.start) / anim.duration; // 0..1
        const pulse = Math.sin(t * Math.PI); // 0 → 1 → 0
        const scale = 1 + 0.18 * pulse;
        if (anim.slot === 'power') {
            powerScale = scale; powerGlow = pulse;
        } else if (anim.slot === 'ability') {
            abilityScale = scale; abilityGlow = pulse;
        } else {
            primaryScale = scale; primaryGlow = pulse;
        }
    } else if (anim) {
        this._weaponCycleAnim = null;
    }

    // ── Primary square (top-left) ──────────────────────────────────
    drawWeaponSquare.call(
        this, ctx,
        groupX + squareSize / 2, groupY + squareSize / 2,
        squareSize, cornerRadius,
        primaryCfg.icon || '?',
        primaryCfg.color || '#00ccff',
        'PRM',
        primaryScale,
        primaryGlow,
    );

    // ── Power square (top-right) ───────────────────────────────────
    drawWeaponSquare.call(
        this, ctx,
        groupX + squareSize + gap + squareSize / 2, groupY + squareSize / 2,
        squareSize, cornerRadius,
        powerCfg.icon || '?',
        powerCfg.color || '#ffcc44',
        'PWR',
        powerScale,
        powerGlow,
    );

    // 9.0.0 (reboot) — defense abilities removed; ability HUD bar gone.

    // 5.101.0 — Defensive ABILITY square suspended. Defensive abilities are
    // retired (game is primary + power weapons only); defensive picks
    // now live in the pause-menu POWERUPS tab + survivor cards +
    // Diablo-style inventory. The square + cooldown + active-effect
    // ring stay commented for reference if the ability system ever
    // returns.
    // const abilityRowY = groupY;
    // const abilityCx = groupX + 2 * (squareSize + gap) + squareSize / 2;
    // drawWeaponSquare.call(
    //     this, ctx,
    //     abilityCx, abilityRowY + squareSize / 2,
    //     squareSize, cornerRadius,
    //     abilityCfg.icon || '?',
    //     abilityCfg.color || '#ff88dd',
    //     'ABILITY',
    //     abilityScale,
    //     abilityGlow,
    // );
    //
    // const cdRemaining = this.player.activeAbilityCooldown || 0;
    // const cdTotal = abilityCfg.cooldown || 1;
    // const cdRatio = cdRemaining > 0 ? cdRemaining / cdTotal : 0;
    // if (cdRatio > 0) {
    //     const half = squareSize / 2;
    //     ctx.save();
    //     ctx.beginPath();
    //     _roundedRectPath(ctx, abilityCx - half, abilityRowY, squareSize, squareSize, cornerRadius);
    //     ctx.clip();
    //     ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    //     ctx.fillRect(
    //         abilityCx - half,
    //         abilityRowY + squareSize * (1 - cdRatio),
    //         squareSize,
    //         squareSize * cdRatio,
    //     );
    //     ctx.restore();
    //     const secs = Math.ceil(cdRemaining / 1000);
    //     ctx.font = 'bold 10px "Press Start 2P", monospace';
    //     ctx.fillStyle = '#FF8888';
    //     ctx.textAlign = 'center';
    //     ctx.textBaseline = 'bottom';
    //     ctx.fillText(`${secs}s`, abilityCx, abilityRowY + squareSize - 4);
    // }
    // if (this.player.activeAbilityEffects && this.player.activeAbilityEffects.has(this.player.activeAbility)) {
    //     const half = squareSize / 2;
    //     ctx.save();
    //     ctx.shadowColor = abilityCfg.color || '#ff88dd';
    //     ctx.shadowBlur = 14;
    //     ctx.strokeStyle = abilityCfg.color || '#ff88dd';
    //     ctx.lineWidth = 2;
    //     _roundedRectPath(ctx, abilityCx - half, abilityRowY, squareSize, squareSize, cornerRadius);
    //     ctx.stroke();
    //     ctx.restore();
    // }
}

// B.S3 — 4-slot ability bar. Renders player.equippedAbilities[0..3] as a row
// of adjacent squares whose BOTTOM edge sits at `bottomY` (the bar grows
// upward from there). Each slot shows the equipped ability's icon (reusing
// the same resolveIconSlug + getIconImage cached-SVG mechanism as the
// PRM/PWR loadout squares), a keybind label (1–4) in the corner, and a
// bottom-up cooldown fill driven by abilityCooldowns / abilityCooldownsMax
// (the same dark-overlay clip the old single-ability HUD used). Empty
// slots render a dim placeholder so the player can see all four slots.
// Exported so the unit smoke test can drive it with a mock ctx/player.
export function drawAbilitySlotBar() { /* 9.0.0 (reboot) — defense abilities removed; ability bar gone */ }

function _roundedRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

function drawWeaponSquare(ctx, cx, cy, size, radius, icon, color, label, scale = 1, glow = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    if (scale !== 1) ctx.scale(scale, scale);

    const half = size / 2;
    // Background fill — rounded rect.
    _roundedRectPath(ctx, -half, -half, size, size, radius);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();

    // Glow halo during cycle animation
    if (glow > 0) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18 * glow;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        _roundedRectPath(ctx, -half, -half, size, size, radius);
        ctx.stroke();
        ctx.restore();
    }

    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    _roundedRectPath(ctx, -half, -half, size, size, radius);
    ctx.stroke();

    // Icon — 5.79.37 SVG-cached image when slug is known, fallback to text.
    const slug = resolveIconSlug(icon);
    const iconPx = Math.round(size * 0.55);
    if (slug) {
        const img = getIconImage(slug, iconPx, '#ffffff');
        if (img) ctx.drawImage(img, -iconPx / 2, -iconPx / 2, iconPx, iconPx);
    } else {
        ctx.font = `${iconPx}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(icon, 0, 1);
    }

    // Label below the square (un-scaled so text size doesn't pulse).
    // Shifted slightly farther down to match the larger square.
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy + half + 14);
    ctx.font = "9px 'Press Start 2P', monospace";
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.strokeText(label, 0, 0);
    ctx.fillText(label, 0, 0);
    ctx.restore();
}

// Ammo gauge was removed — the cursor ring (hud/cursor.js) is now the sole
// ammo indicator. Fewer HUD elements, all attention stays on the action.
