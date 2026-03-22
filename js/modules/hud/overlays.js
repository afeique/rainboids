// HUD overlay rendering — title screen, wavy text, timers, respawn, ghosts.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { rgba } from '../core/color-cache.js';

export const _charWidthCache = new Map();

// Method to draw wavy rainbow text for wave messages
// Mobile-aware: scales font to fit within screen width with padding.
export function drawWavyText(text, x, y, fontSize = 48) {
        if (!text) return;

        const time = Date.now() * 0.001;
        const chars = text.split('');
        const isMobile = this.inputHandler.isMobile();

        // ── Mobile-responsive font sizing ────────────────────────────────────
        // On mobile, clamp fontSize so the full string fits within the viewport
        // with 20px padding on each side.
        let effectiveFontSize = fontSize;
        if (isMobile) {
            const pad = 40; // 20px each side
            const availableWidth = this.width - pad;
            // 'Press Start 2P' is monospace — measured ratio ≈ 0.63 per char
            const estimatedWidth = text.length * fontSize * 0.63;
            if (estimatedWidth > availableWidth) {
                effectiveFontSize = Math.floor(availableWidth / (text.length * 0.63));
            }
            effectiveFontSize = Math.min(effectiveFontSize, fontSize);
            effectiveFontSize = Math.max(effectiveFontSize, 8); // floor
        }

        this.ctx.save();
        this.ctx.font = `${effectiveFontSize}px 'Press Start 2P', monospace`;

        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Calculate total text width for centering
        const totalWidth = this.ctx.measureText(text).width;
        let currentX = x - totalWidth / 2;

        // Wave amplitude scales with font size
        const waveAmp = effectiveFontSize * 20 / 72;

        chars.forEach((char, index) => {
            if (char === ' ') {
                currentX += effectiveFontSize * 0.5;
                return;
            }

            const waveOffset = Math.sin(time * 3 + index * 0.8) * waveAmp;

            // Rainbow color cycling
            const colorTime = (time * 0.15 + index * 0.1) % 1;
            let color;

	    if      (colorTime < 0.16) color = '#FF0000';
            else if (colorTime < 0.32) color = '#FF8000';
            else if (colorTime < 0.48) color = '#FFFF00';
            else if (colorTime < 0.64) color = '#00FF00';
            else if (colorTime < 0.80) color = '#0080FF';
            else                       color = '#8000FF';

            // Glow via double-draw: slightly larger translucent pass + crisp pass.
            // Cheaper than shadowBlur (1 extra fillText vs GPU blur kernel per char).
            this.ctx.globalAlpha = 0.35;
            this.ctx.fillStyle = color;
            this.ctx.font = `${effectiveFontSize + 2}px 'Press Start 2P', monospace`;
            this.ctx.fillText(char, currentX, y + waveOffset);

            this.ctx.globalAlpha = 1;
            this.ctx.font = `${effectiveFontSize}px 'Press Start 2P', monospace`;
            this.ctx.fillText(char, currentX, y + waveOffset);

            currentX += this.ctx.measureText(char).width;
        });

        this.ctx.restore();
}

export function drawTitleScreen() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const isMobile = this.inputHandler.isMobile();

        // Mobile-responsive helper: scale font to fit within screen width
        // 'Press Start 2P' is monospace — measured ratio ≈ 0.63 per char
        const CHAR_W = 0.63;
        const fitFont = (baseFontSize, text) => {
            if (!isMobile) return baseFontSize;
            const pad = 40;
            const availW = this.width - pad;
            const estimated = text.length * baseFontSize * CHAR_W;
            let fs = baseFontSize;
            if (estimated > availW) fs = Math.floor(availW / (text.length * CHAR_W));
            return Math.max(10, Math.min(fs, baseFontSize));
        };

        // Main title - RAINBOIDS
        this.drawWavyText('RAINBOIDS', centerX, centerY - 100, 72);

        // Subtitle
        const subFS = fitFont(24, 'SUPERCHARGED ASTEROIDS');
        this.ctx.save();
        this.ctx.font = `${subFS}px "Press Start 2P", monospace`;
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('SUPERCHARGED ASTEROIDS', centerX, centerY - 20);
        this.ctx.restore();

        // Animated "Press Any Key" text
        const time = Date.now() * 0.001;
        const pulseAlpha = 0.5 + Math.sin(time * 3) * 0.3;
        const startText = isMobile ? 'TAP TO START' : 'PRESS ANY KEY TO START';
        const startFS = fitFont(18, startText);

        this.ctx.save();
        this.ctx.font = `${startFS}px "Press Start 2P", monospace`;
        this.ctx.fillStyle = rgba(255, 255, 255, pulseAlpha);
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(startText, centerX, centerY + 80);
        this.ctx.restore();

        // Survival record display (if available)
        if (this.game.survivalRecord > 0) {
            const recText = `Survival Record: ${this.formatSurvivalTime(this.game.survivalRecord)}`;
            const recFS = fitFont(16, recText);
            this.ctx.save();
            this.ctx.font = `${recFS}px "Press Start 2P", monospace`;
            this.ctx.fillStyle = '#FFD700';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(recText, centerX, centerY + 120);
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
