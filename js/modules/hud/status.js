// HUD status bar rendering — health, shields, lives, level, coins, XP.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { GAME_STATES } from '../core/constants.js';
import { drawCachedHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon } from '../core/utils.js';
import { DEFENSE_SKILLS } from '../combat/weapon-data.js';
import { WAVY_PALETTES } from './overlays.js';

export function drawHUD() {
        if (this.game.state !== GAME_STATES.TITLE_SCREEN && this.game.state !== GAME_STATES.SHOP) {
            // Draw health bar and UI elements
            this.updateHUD();
            // Show shop / pause / hud-shop buttons during gameplay
            this.events.emit('ui:show-shop-button');
            this.events.emit('ui:show-pause-btn');
            this.events.emit('ui:show-hud-shop-btn');
        } else {
            // Hide them on title screen and while shop is open
            this.events.emit('ui:hide-shop-button');
            this.events.emit('ui:hide-pause-btn');
            this.events.emit('ui:hide-hud-shop-btn');
        }

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
                // Calculate fade effect
                const fadeProgress = elapsed / this.waveMessage.duration;
                const alpha = fadeProgress < 0.8 ? 1 : (1 - fadeProgress) / 0.2; // Fade out in last 20%

                this.ctx.save();
                this.ctx.globalAlpha = alpha;

                // Draw title (larger, centered horizontally, well below the
                // top-center enemy-info band which now occupies y≈24-84).
                const centerX = this.width / 2;
                const titleFS = 48;
                const subtitleFS = 24;
                const topY = 200;  // pushed further down to clear enemy info comfortably
                const gap = 60;
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

        // Draw skill cooldown HUD + streak buff indicator
        if (this.player && this.game.state !== GAME_STATES.TITLE_SCREEN && this.game.state !== GAME_STATES.SHOP) {
            this.drawSkillCooldownHUD();
            this.drawStreakIndicator();
        }

        // Draw title screen with wavy text
        if (this.game.state === GAME_STATES.TITLE_SCREEN) {
            this.drawTitleScreen();
        }
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
    const titleY = Math.max(120, this.height * 0.18);
    const subtitleY = titleY + 64;
    const statsTop = subtitleY + 70;

    // Title — wavy multicolor "GAME COMPLETE!"
    this.drawWavyText('GAME COMPLETE!', cx, titleY, {
        fontSize: Math.min(110, Math.max(64, Math.floor(this.width / 14))),
        colors: WAVY_PALETTES.waveTitle,
        speed: 0.45,
        colorSpeed: 0.18,
    });

    // Subtitle — final time front and center (the speedrun stat).
    const totalMs = stats.finalTimeMs || (Date.now() - (stats.gameStartTime || Date.now()));
    const timeStr = formatDuration(totalMs);
    ctx.fillStyle = '#cfeaff';
    ctx.font = `bold ${Math.max(28, Math.floor(this.width / 36))}px monospace`;
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

    const lineFS = Math.max(18, Math.floor(this.width / 60));
    const lineH = lineFS + 12;
    const colWidth = Math.min(560, this.width * 0.62);
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

    // Three-phase fade: in (0-500ms), hold (500..total-700ms), out
    const fadeIn = 500;
    const fadeOut = 700;
    let alpha;
    if (elapsed < fadeIn) {
        alpha = elapsed / fadeIn;
    } else if (elapsed < total - fadeOut) {
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
    const titleFS = Math.min(120, Math.max(64, Math.floor(this.width / 14)));
    const subtitleFS = Math.max(20, Math.floor(titleFS / 4));
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

export function drawSkillCooldownHUD() {
        if (!this.player.skillSlots) return;

        const hasAnySkill = this.player.skillSlots.some(s => s !== null);
        if (!hasAnySkill) return;

        const slotSize = 40;
        const slotGap = 8;
        const totalWidth = 4 * slotSize + 3 * slotGap;
        const startX = this.width / 2 - totalWidth / 2;
        const slotY = this.height - 60;

        for (let i = 0; i < 4; i++) {
            const sx = startX + i * (slotSize + slotGap);
            const skillId = this.player.skillSlots[i];
            const skill = skillId ? DEFENSE_SKILLS[skillId] : null;

            // Background
            this.ctx.fillStyle = skill ? 'rgba(20, 20, 40, 0.8)' : 'rgba(20, 20, 40, 0.4)';
            this.ctx.beginPath();
            this.ctx.roundRect(sx, slotY, slotSize, slotSize, 6);
            this.ctx.fill();

            // Border
            this.ctx.strokeStyle = skill ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.roundRect(sx, slotY, slotSize, slotSize, 6);
            this.ctx.stroke();

            // Key number
            this.ctx.font = '8px "Press Start 2P", monospace';
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText(`${i + 1}`, sx + 3, slotY + 3);

            if (!skill) continue;

            // Cooldown overlay
            const cdRemaining = this.player.skillCooldowns[i] || 0;
            const cdTotal = skill.cooldown;
            const cdRatio = cdRemaining > 0 ? cdRemaining / cdTotal : 0;

            if (cdRatio > 0) {
                // Dark overlay proportional to cooldown
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                this.ctx.beginPath();
                this.ctx.rect(sx, slotY + slotSize * (1 - cdRatio), slotSize, slotSize * cdRatio);
                this.ctx.fill();
            }

            // Active effect glow
            if (this.player.activeSkillEffects && this.player.activeSkillEffects.has(skillId)) {
                this.ctx.save();
                this.ctx.shadowColor = skill.color;
                this.ctx.shadowBlur = 12;
                this.ctx.strokeStyle = skill.color;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.roundRect(sx, slotY, slotSize, slotSize, 6);
                this.ctx.stroke();
                this.ctx.restore();
            }

            // Skill icon
            this.ctx.font = '18px "Press Start 2P", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillStyle = cdRatio > 0 ? 'rgba(255, 255, 255, 0.4)' : '#FFFFFF';
            this.ctx.fillText(skill.icon, sx + slotSize / 2, slotY + slotSize / 2);

            // Cooldown seconds remaining
            if (cdRatio > 0) {
                const secs = Math.ceil(cdRemaining / 1000);
                this.ctx.font = 'bold 10px "Press Start 2P", monospace';
                this.ctx.fillStyle = '#FF8888';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'bottom';
                this.ctx.fillText(`${secs}s`, sx + slotSize / 2, slotY + slotSize - 2);
            }
        }
}

export function drawCanvasTriforce(ctx, lives, baseX, baseY) {
        const triangleSize = 12;
        const spacing = 2;
        const centerX = baseX + 30; // Center of the 60px-wide triforce slot
        const topY = baseY + 8;
        const bottomY = topY + triangleSize + spacing - 1;

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

        const topTri  = { x: centerX, y: topY };
        const btmLeft = { x: centerX - (triangleSize / 2 + spacing / 2), y: bottomY };
        const btmRight = { x: centerX + (triangleSize / 2 + spacing / 2), y: bottomY };

        if (lives >= 3) {
            drawTri(topTri.x, topTri.y);
            drawTri(btmLeft.x, btmLeft.y);
            drawTri(btmRight.x, btmRight.y);
        } else if (lives === 2) {
            drawTri(btmLeft.x, btmLeft.y);
            drawTri(btmRight.x, btmRight.y);
        } else if (lives === 1) {
            drawTri(btmLeft.x, btmLeft.y);
        }

        ctx.restore();
}

export function drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight) {
        const livesX = 36; // Same as lives display position (left HUD margin)
        const triforceWidth = 60; // Triforce canvas width from ui-manager.js
        const triforceCenterX = livesX + triforceWidth / 2; // Center of triforce at x=40

        ctx.save();

        // Level display beneath the triforce (lives) - first line
        const levelY = barY + barHeight + 26; // 20px below health bar for more space

        // Draw shield icon with "LV" text beneath lives, centered with triforce
        const shieldIconSize = 30; // Slightly larger shield icon
        const shieldIconX = triforceCenterX - shieldIconSize / 2; // Center shield with triforce
        const shieldCenterX = shieldIconX + shieldIconSize / 2;
        const shieldCenterY = levelY;

        // Draw shield icon
        drawCachedShieldIcon(ctx, shieldCenterX, shieldCenterY, shieldIconSize);

        // Draw "LV" text inside the shield icon
        ctx.save();
        ctx.font = "10px 'Press Start 2P', monospace"; // Larger font for larger icon
        ctx.fillStyle = '#102342'; // Dark blue color
        ctx.strokeStyle = '#155379'; // gray-blue stroke outline
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw "LV" text with stroke outline inside shield
        ctx.strokeText('LV', shieldCenterX, shieldCenterY);
        ctx.fillText('LV', shieldCenterX, shieldCenterY);
        ctx.restore();

        // Draw level number to the right of shield
        const levelNumberX = shieldIconX + shieldIconSize + 10;
        ctx.font = "14px 'Press Start 2P', monospace"; // Original level number size
        ctx.fillStyle = '#4A90E2'; // Blue color for level number
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const levelNumber = `${this.player.level}`;
        ctx.strokeText(levelNumber, levelNumberX, levelY);
        ctx.fillText(levelNumber, levelNumberX, levelY);

        // Coins display on its own line beneath the level - second line
        const coinsY = levelY + 40; // 30px below level for more spacing

        // Draw coin icon, centered with triforce
        const coinIconSize = 30; // Larger coin icon
        const coinIconX = triforceCenterX - coinIconSize / 2; // Center coin with triforce
        const coinIconY = coinsY - coinIconSize/2;

        drawCachedMoneyIcon(ctx, coinIconX + coinIconSize/2, coinIconY + coinIconSize/2, coinIconSize, '#FFD700', '#B8860B');

        // Draw coins text
        const coinsTextX = coinIconX + coinIconSize + 10;
        ctx.font = "14px 'Press Start 2P', monospace"; // Original coins text size
        ctx.fillStyle = '#FFD700'; // Gold color for coins
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const coinsText = `${Math.floor(this.game.money)}`;
        ctx.strokeText(coinsText, coinsTextX, coinsY);
        ctx.fillText(coinsText, coinsTextX, coinsY);

        ctx.restore();
}

export function drawXPBar(ctx, barX, barY, barWidth, barHeight) {
        // XP bar dimensions - positioned at the bottom of the health bar
        const xpBarHeight = 8;
        const xpBarY = barY + barHeight - xpBarHeight;
        const bevelSize = 12; // Match health bar bevel exactly

        // Calculate XP progress
        const xpProgress = this.player.getExperienceProgress();
        const filledWidth = barWidth * xpProgress;

        ctx.save();

        // Use the EXACT same health bar clipping path, then clip to bottom section
        const createHealthBarPath = (width) => {
            ctx.beginPath();
            // Exact copy of health bar path
            ctx.moveTo(barX + bevelSize, barY);
            ctx.lineTo(barX + width - bevelSize * 0.5, barY);
            ctx.lineTo(barX + width, barY + bevelSize);
            ctx.lineTo(barX + width, barY + barHeight - bevelSize);
            ctx.lineTo(barX + width - bevelSize, barY + barHeight);
            ctx.lineTo(barX + bevelSize * 0.5, barY + barHeight);
            ctx.lineTo(barX, barY + barHeight - bevelSize);
            ctx.lineTo(barX, barY + bevelSize);
            ctx.closePath();
        };

        // First, clip to the health bar shape
        createHealthBarPath(barWidth);
        ctx.clip();

        // Then clip to just the bottom portion for XP bar
        ctx.beginPath();
        ctx.rect(barX - 5, xpBarY, barWidth + 10, xpBarHeight);
        ctx.clip();

        // Draw XP bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(barX - 5, xpBarY, barWidth + 10, xpBarHeight);

        // Draw segmented XP fill with precise clipping
        if (filledWidth > 0) {
            // Lazily create and cache the XP bar gradient (constant coordinates)
            if (!this._xpBarGradient) {
                const g = ctx.createLinearGradient(barX, xpBarY, barX, xpBarY + xpBarHeight);
                g.addColorStop(0, '#FF6B35'); // Bright orange-vermilion top
                g.addColorStop(0.5, '#FF4500'); // Orange-red middle
                g.addColorStop(1, '#CC3300'); // Deep vermilion bottom
                this._xpBarGradient = g;
            }
            const gradient = this._xpBarGradient;

            // Draw the filled area as one solid shape
            ctx.fillStyle = gradient;
            ctx.fillRect(barX, xpBarY, filledWidth, xpBarHeight);

            // Add inner highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(barX, xpBarY, filledWidth, 1);

            // Draw segment separators over the filled area
            const segments = 20;
            const segmentWidth = barWidth / segments;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

            for (let i = 1; i < segments; i++) {
                const separatorX = barX + (i * segmentWidth);
                if (separatorX < barX + filledWidth) {
                    ctx.fillRect(separatorX, xpBarY, 0.5, xpBarHeight);
                }
            }
        }

        ctx.restore();
}

export function drawLevelUpText() {
        if (!this.player || !this.player.levelUpTextInfo || !this.player.levelUpTextInfo.active) {
            return;
        }

        const { level, progress } = this.player.levelUpTextInfo;
        const screenWidth = this.width;
        const screenHeight = this.height;

        // Position text at the bottom of the screen
        const textY = screenHeight - 80; // 80px from bottom
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

        // Wavy gold "LEVEL X!" — palette pulses around the original #FFD700.
        this.drawWavyText(`LEVEL ${level}!`, 0, -15, {
            fontSize: 32,
            colors: WAVY_PALETTES.gold,
            amplitude: 6,
            speed: 0.6,
            colorSpeed: 0.45,
        });

        // Wavy orange subtitle around the original #FFA500.
        this.drawWavyText('Skill Point Gained!', 0, 15, {
            fontSize: 16,
            colors: WAVY_PALETTES.orange,
            amplitude: 3,
            speed: 0.45,
            colorSpeed: 0.3,
        });

        this.ctx.restore();
}

export function updateHUD() {
        const ctx = this.ctx;
        const barX = 86; // Close to triforce (triforce rightmost pixel ≈ x=79 with livesX=36)
        const barY = 20;
        const barHeight = 30;
        const barWidth = 220;
        const bevelSize = 12;
        const segments = 10; // Number of segments for the bar

        ctx.save();

        // Draw triforce (lives indicator) on canvas — same layer as HP bar, coins, level
        this.drawCanvasTriforce(ctx, this.game.lives, 36, barY);

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

        // Calculate health percentage using effective max health
        const effectiveMaxHealth = this.player.getEffectiveMaxHealth();
        const healthPercentage = this.player.health / effectiveMaxHealth;
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

            // Lazily create and cache the 3 tier gradients (constant coordinates)
            if (!this._hpGradients) {
                const gHigh = ctx.createLinearGradient(60, 20, 60, 50);
                gHigh.addColorStop(0, 'rgba(0, 150, 255, 0.95)');
                gHigh.addColorStop(0.3, 'rgba(0, 120, 255, 0.9)');
                gHigh.addColorStop(0.7, 'rgba(0, 90, 255, 0.85)');
                gHigh.addColorStop(1, 'rgba(0, 60, 220, 0.8)');

                const gMid = ctx.createLinearGradient(60, 20, 60, 50);
                gMid.addColorStop(0, 'rgba(255, 255, 0, 0.95)');
                gMid.addColorStop(0.3, 'rgba(255, 220, 0, 0.9)');
                gMid.addColorStop(0.7, 'rgba(255, 180, 0, 0.85)');
                gMid.addColorStop(1, 'rgba(220, 140, 0, 0.8)');

                const gLow = ctx.createLinearGradient(60, 20, 60, 50);
                gLow.addColorStop(0, 'rgba(255, 50, 50, 0.95)');
                gLow.addColorStop(0.3, 'rgba(255, 20, 20, 0.9)');
                gLow.addColorStop(0.7, 'rgba(220, 0, 0, 0.85)');
                gLow.addColorStop(1, 'rgba(180, 0, 0, 0.8)');

                this._hpGradients = { high: gHigh, mid: gMid, low: gLow };
            }

            const tier = healthPercentage > 0.6 ? 'high' : healthPercentage > 0.3 ? 'mid' : 'low';
            const gradient = this._hpGradients[tier];

            createHealthBarPath(filledWidth);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Add subtle inner glow
            createHealthBarPath(filledWidth);
            ctx.strokeStyle = 'rgba(200, 240, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
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
        let shieldTanksContainer = document.getElementById('shield-tanks');
        if (!shieldTanksContainer) {
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
            shieldTanksContainer.innerHTML = '';
        }

        // Shield tanks display removed - was causing green square overlay
        // Tanks are now managed internally without DOM elements

        // Draw level and coins beneath lives and health bar
        this.drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight);

        // Equipped weapon squares (PRM / PWR) beneath the coins display.
        this.drawEquippedWeaponSquares(ctx, barX, barY, barHeight);

        // Draw survival timer at bottom left
        this.drawSurvivalTimer(ctx);
}

// Two small squares — Primary and Power — below the coins display in
// the top-left HUD. Show the equipped weapon's icon in its weapon
// color, with PRM / PWR labels underneath. The Primary square pulses
// briefly when the player cycles weapons via R (driven by
// `gameEngine._weaponCycleAnim` set in event-setup.js).
export function drawEquippedWeaponSquares(ctx, barX, barY, barHeight) {
    if (!this.player) return;
    const livesX = 36;
    const triforceCenterX = livesX + 30;     // matches drawLevelAndCoinsDisplay
    const coinIconSize = 30;
    const coinIconX = triforceCenterX - coinIconSize / 2; // left edge of the coin icon

    const levelY = barY + barHeight + 26;
    const coinsY = levelY + 40;

    const squareSize = 38;
    const gap = 8;
    // Align the Primary square's LEFT EDGE with the coin icon's LEFT EDGE
    // — visually anchors the weapon row to the gold display directly above.
    const groupX = coinIconX;
    // Match the visual edge-to-edge gap of the column above. The shield
    // icon (level) and coin icon are both 30px tall and their centers
    // sit 40px apart, so the gap between shield-bottom and coin-top is
    // 40 - 15 - 15 = 10px. We use the same 10px gap from coin-bottom to
    // square-top: groupY = (coinsY + coinIconSize/2) + 10.
    const groupY = coinsY + coinIconSize / 2 + 10;

    const primaryCfg = this.player.getActivePrimaryConfig?.() || {};
    const powerCfg = this.player.getActivePowerConfig?.() || {};

    // Animation: brief scale + glow pulse on whichever square just
    // cycled. State lives on the game engine so any input source can
    // trigger it. anim.slot is 'primary' or 'power'.
    let primaryScale = 1, primaryGlow = 0;
    let powerScale = 1, powerGlow = 0;
    const anim = this._weaponCycleAnim;
    if (anim && Date.now() - anim.start < anim.duration) {
        const t = (Date.now() - anim.start) / anim.duration; // 0..1
        const pulse = Math.sin(t * Math.PI); // 0 → 1 → 0
        const scale = 1 + 0.18 * pulse;
        if (anim.slot === 'power') {
            powerScale = scale; powerGlow = pulse;
        } else {
            primaryScale = scale; primaryGlow = pulse;
        }
    } else if (anim) {
        this._weaponCycleAnim = null;
    }

    // ── Primary square ──────────────────────────────────────────────
    drawWeaponSquare.call(
        this, ctx,
        groupX + squareSize / 2, groupY + squareSize / 2,
        squareSize,
        primaryCfg.icon || '?',
        primaryCfg.color || '#00ccff',
        'PRM',
        primaryScale,
        primaryGlow,
    );

    // ── Power square ────────────────────────────────────────────────
    drawWeaponSquare.call(
        this, ctx,
        groupX + squareSize + gap + squareSize / 2, groupY + squareSize / 2,
        squareSize,
        powerCfg.icon || '?',
        powerCfg.color || '#ffcc44',
        'PWR',
        powerScale,
        powerGlow,
    );
}

function drawWeaponSquare(ctx, cx, cy, size, icon, color, label, scale = 1, glow = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    if (scale !== 1) ctx.scale(scale, scale);

    const half = size / 2;
    // Background fill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(-half, -half, size, size);

    // Glow halo during cycle animation
    if (glow > 0) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 16 * glow;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(-half, -half, size, size);
        ctx.restore();
    }

    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(-half, -half, size, size);

    // Icon
    ctx.font = `${Math.round(size * 0.55)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(icon, 0, 1);

    // Label below the square (un-scaled so text size doesn't pulse)
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy + half + 12);
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
