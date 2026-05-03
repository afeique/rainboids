// HUD overlay rendering — title screen, wavy text, timers, respawn, ghosts.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { rgba } from '../core/color-cache.js';
import { STREAK_TIERS as WEAPON_DATA_STREAK_TIERS } from '../combat/weapon-data.js';

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

        // Same gradient instance is used for every glyph — sampling happens by
        // canvas-space x, so each letter blends continuously into its neighbors.
        chars.forEach((char, index) => {
            if (char === ' ') {
                currentX += effectiveFontSize * 0.5;
                return;
            }

            const waveOffset = halfAmp === 0 ? 0 : Math.sin(time * waveOmega + index * 0.8) * halfAmp;

            // Glow via double-draw: larger translucent pass + crisp pass.
            this.ctx.fillStyle = grad;
            this.ctx.globalAlpha = baseAlpha * 0.35;
            this.ctx.font = `${effectiveFontSize + 2}px 'Press Start 2P', monospace`;
            this.ctx.fillText(char, currentX, y + waveOffset);

            this.ctx.globalAlpha = baseAlpha;
            this.ctx.font = `${effectiveFontSize}px 'Press Start 2P', monospace`;
            this.ctx.fillText(char, currentX, y + waveOffset);

            currentX += this.ctx.measureText(char).width;
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

        // Title-launch animation phases (driven by triggerTitleStart):
        //   spiral (0   -700ms): orbits + tightens around center
        //   zoom   (700-1200ms): scale rockets toward viewer
        //   fade   (1200-1700ms): full-screen black wash takes over
        // While 'idle', render the normal static title screen.
        const anim = (typeof this._titleAnimState === 'function') ? this._titleAnimState() : null;
        const launching = anim && anim.phase === 'launch';
        const elapsed = launching ? (Date.now() - anim.startTime) : 0;
        const total = launching ? anim.duration : 0;

        const SPIRAL_END = 700;
        const ZOOM_END   = 1200;

        // Default title state — no transform.
        let titleX = centerX + 10;
        let titleY = centerY - 100;
        let titleScale = 1;
        let titleAlpha = 1;
        let showSubtitle = true;
        let showPressKey = true;
        let fadeAlpha = 0;

        if (launching) {
            showSubtitle = false;
            showPressKey = false;

            if (elapsed < SPIRAL_END) {
                // Spiral: 2 turns, radius 220px → 0, easing into a tight knot
                const t = elapsed / SPIRAL_END;
                const eased = 1 - Math.pow(1 - t, 2.5);
                const turns = 2.0;
                const angle = -Math.PI / 2 + turns * Math.PI * 2 * eased;
                const radius = 220 * (1 - eased);
                titleX = centerX + Math.cos(angle) * radius;
                titleY = centerY + Math.sin(angle) * radius - 100 * (1 - eased);
                // Slight scale wobble during spiral for energy
                titleScale = 0.85 + 0.15 * (1 - eased);
            } else if (elapsed < ZOOM_END) {
                // Zoom: scale rockets from 1.0 → 6.0 as the title hurtles
                // toward the viewer. Position locked to center.
                const t = (elapsed - SPIRAL_END) / (ZOOM_END - SPIRAL_END);
                const eased = Math.pow(t, 1.6); // gentle accelerate
                titleX = centerX + 10;
                titleY = centerY;
                titleScale = 1 + 5 * eased;
                titleAlpha = 1 - eased * 0.35; // brighten core, edges fade
            } else {
                // Fade: title is offscreen-huge; opacity dropped, black wash
                // climbs to full to take over before init() fires.
                const t = Math.min(1, (elapsed - ZOOM_END) / (total - ZOOM_END));
                titleX = centerX + 10;
                titleY = centerY;
                titleScale = 6 + t * 4;
                titleAlpha = Math.max(0, 0.65 * (1 - t));
                fadeAlpha = t;
            }
        }

        // ── RAINBOIDS title ──
        if (titleAlpha > 0.01) {
            this.ctx.save();
            this.ctx.globalAlpha *= titleAlpha;
            if (titleScale !== 1) {
                this.ctx.translate(titleX, titleY);
                this.ctx.scale(titleScale, titleScale);
                this.drawWavyText('RAINBOIDS', 0, 0, {
                    fontSize: 72,
                    colors: WAVY_PALETTES.title,
                    speed: 0.45,
                    colorSpeed: 0.18,
                });
            } else {
                this.drawWavyText('RAINBOIDS', titleX, titleY, {
                    fontSize: 72,
                    colors: WAVY_PALETTES.title,
                    speed: 0.45,
                    colorSpeed: 0.18,
                });
            }
            this.ctx.restore();
        }

        // ── Subtitle / Press Any Key / Record (idle only) ──
        if (showSubtitle) {
            this.drawWavyText('SUPERCHARGED ASTEROIDS', centerX, centerY - 20, {
                fontSize: 24,
                colors: WAVY_PALETTES.whiteShimmer,
                amplitude: 0,
                colorSpeed: 0.1,
            });
        }

        if (showPressKey) {
            const time = Date.now() * 0.001;
            const pulseAlpha = 0.5 + Math.sin(time * 3) * 0.3;
            this.ctx.save();
            this.ctx.globalAlpha = pulseAlpha;
            this.drawWavyText('PRESS ANY KEY TO START', centerX, centerY + 80, {
                fontSize: 18,
                colors: WAVY_PALETTES.whiteShimmer,
                amplitude: 0,
                colorSpeed: 0.12,
            });
            this.ctx.restore();

            if (this.game.survivalRecord > 0) {
                const recText = `Survival Record: ${this.formatSurvivalTime(this.game.survivalRecord)}`;
                this.drawWavyText(recText, centerX, centerY + 120, {
                    fontSize: 16,
                    colors: WAVY_PALETTES.gold,
                    amplitude: 0,
                    colorSpeed: 0.14,
                });
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

export function drawSurvivalTimer(ctx) {
        // Position at bottom left of screen
        const timerX = 20;
        const timerY = this.canvas.height - 40;

        ctx.save();

        // Format survival time as H:M:SS:mmm
        const totalMs = this.game.survivalTime || 0;
        const hours = Math.floor(totalMs / (1000 * 60 * 60));
        const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
        const milliseconds = totalMs % 1000;

        const timeString = `${hours}:${minutes}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;

        // Draw stopwatch SVG icon
        const iconSize = 24;
        const iconX = timerX;
        const iconY = timerY - iconSize/2;

        this.drawStopwatchIcon(ctx, iconX, iconY, iconSize);

        // Draw time text
        ctx.font = "16px 'Press Start 2P', monospace";
        ctx.fillStyle = '#FFA500'; // Subdued orange color
        ctx.strokeStyle = '#CC8400'; // Darker orange for outline
        ctx.lineWidth = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const textX = iconX + iconSize + 8;

        // Draw text outline
        ctx.strokeText(timeString, textX, timerY);
        // Draw text fill
        ctx.fillText(timeString, textX, timerY);

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
        this.drawCircularTimer(ctx, timerX, spawnY, radius, spawnProgress, '#00ff88', '⚡', timeUntilSpawn);

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

// Streak indicator — top-right corner, clear of the pause button (top:16, h:56),
// minimap (bottom-right), enemy info (top-center), and wave message
// (top-center y=200). Two display modes:
//
//   ACTIVE (buff timer running): tier-colored pulse, glow halo, full info
//      "N KILLS / TIER_LABEL / +X% DMG / [progress bar to next tier]"
//
//   SAVED (streak ≥ 3 but buff faded — waiting on next kill to re-arm):
//      Dimmed grey-white, no glow, "N KILLS / SAVED" — reminds the player
//      that the streak is preserved (only damage breaks it now).
//
//   HIDDEN: streak below 3 OR streak is 0 (just took damage / fresh game).
export function drawStreakIndicator() {
    if (!this.player) return;
    const k = this.killStreakCount || 0;
    if (k < WEAPON_DATA_STREAK_TIERS[0].kills) return; // need at least the first tier's threshold

    const ctx = this.ctx;
    const player = this.player;
    const tiers = WEAPON_DATA_STREAK_TIERS;
    let currentTier = null;
    let currentIdx = -1;
    for (let i = 0; i < tiers.length; i++) {
        if (k >= tiers[i].kills) {
            currentTier = tiers[i];
            currentIdx = i;
        }
    }
    if (!currentTier) return;
    const nextTier = tiers[currentIdx + 1] || null;

    const buffActive = player.streakDamageMult > 1;
    // Fade-out only applies to the active-buff display, not the SAVED state.
    const remaining = Math.max(0, player.streakBuffEndTime - Date.now());
    const fadeAlpha = buffActive ? Math.min(1, remaining / 600) : 0.55;

    // Color: tier color when active, dim grey-white when SAVED.
    const tierColor = buffActive ? currentTier.color : '#BBBBBB';

    const x = this.width - 20;
    const y = 110;
    const pulse = buffActive ? 0.85 + Math.sin(Date.now() * 0.015) * 0.15 : 0;

    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    // Streak count (big number)
    if (buffActive) {
        ctx.shadowColor = tierColor;
        ctx.shadowBlur = 12 * pulse;
    }
    ctx.font = "bold 22px 'Press Start 2P', monospace";
    ctx.fillStyle = tierColor;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const streakText = `${k} KILL${k === 1 ? '' : 'S'}`;
    ctx.strokeText(streakText, x, y);
    ctx.fillText(streakText, x, y);

    // Tier label OR "SAVED" when buff faded
    ctx.font = "bold 12px 'Press Start 2P', monospace";
    ctx.shadowBlur = buffActive ? 6 : 0;
    ctx.fillStyle = tierColor;
    const labelText = buffActive ? currentTier.label : 'SAVED';
    ctx.strokeText(labelText, x, y + 26);
    ctx.fillText(labelText, x, y + 26);

    if (buffActive) {
        // Damage bonus
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        const bonusText = `+${Math.round((currentTier.mult - 1) * 100)}% DMG`;
        ctx.strokeText(bonusText, x, y + 42);
        ctx.fillText(bonusText, x, y + 42);

        // Progress bar toward next tier (or "MAX" pip if at top tier)
        const barW = 140, barH = 6;
        const barX = x - barW;
        const barY = y + 62;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(barX, barY, barW, barH);

        if (nextTier) {
            const span = nextTier.kills - currentTier.kills;
            const progress = Math.max(0, Math.min(1, (k - currentTier.kills) / span));
            ctx.fillStyle = tierColor;
            ctx.fillRect(barX, barY, Math.round(barW * progress), barH);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
            ctx.font = "8px 'Press Start 2P', monospace";
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.lineWidth = 2;
            const nextLabel = `→ ${nextTier.label} @ ${nextTier.kills}`;
            ctx.strokeText(nextLabel, x, barY + 12);
            ctx.fillText(nextLabel, x, barY + 12);
        } else {
            ctx.fillStyle = tierColor;
            ctx.fillRect(barX, barY, barW, barH);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);
            ctx.font = "8px 'Press Start 2P', monospace";
            ctx.fillStyle = tierColor;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.lineWidth = 2;
            ctx.strokeText('▲ MAX TIER', x, barY + 12);
            ctx.fillText('▲ MAX TIER', x, barY + 12);
        }
    } else {
        // SAVED state — show small note that next kill re-arms buff at the
        // appropriate tier, no progress bar (the streak number IS the
        // progress).
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 2;
        const reArmText = `▶ KILL TO RE-ARM`;
        ctx.strokeText(reArmText, x, y + 44);
        ctx.fillText(reArmText, x, y + 44);
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

        // Draw icon in center
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, x, y);

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
