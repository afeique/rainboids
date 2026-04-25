// HUD combat rendering — damage numbers, target info, powerups, money pickups.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { GAME_STATES } from '../core/constants.js';
import { rgba } from '../core/color-cache.js';
import { pulsePalette } from './overlays.js';

export function drawDamageNumbers() {
        const ctx = this.ctx;

        this.damageNumbers.forEach(dmgNum => {
            ctx.save();

            // Calculate alpha based on life remaining
            const alpha = Math.max(0, dmgNum.life);

            // Convert world coordinates to screen coordinates
            const screenX = dmgNum.x - this.camera.x;
            const screenY = dmgNum.y - this.camera.y;

            // Only draw if on screen
            if (screenX >= -50 && screenX <= this.width + 50 &&
                screenY >= -50 && screenY <= this.height + 50) {

                // Golden damage number without stroke
                ctx.font = "16px 'Press Start 2P', monospace";
                ctx.fillStyle = rgba(255, 215, 0, alpha); // Golden
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const text = dmgNum.damage.toString();
                ctx.fillText(text, screenX, screenY);
            }

            ctx.restore();
        });
}

export function drawTargetInfo() {
        // Show info for currently targeted entity (clicked entity)
        if (!this.targetedEntity) return;

        const target = this.targetedEntity;
        const ctx = this.ctx;

        // Position flush with right border with padding
        const paddingRight = 15; // Padding from right edge
        const paddingTop = 25;   // Padding from top edge
        const x = this.width - paddingRight; // Flush with right border minus padding
        const y = paddingTop;  // Top padding

        ctx.save();

        // Draw target name (all caps) - GOLD STYLING TO MATCH ENEMY NAMES
        ctx.font = "16px 'Press Start 2P', monospace"; // Increased from 14px to 16px
        ctx.letterSpacing = '1px'; // Added letter spacing
        ctx.fillStyle = 'rgba(255, 215, 0, 1.0)'; // Same gold color as enemy names
        ctx.textAlign = 'right'; // Align right since positioned at top right
        ctx.textBaseline = 'top';

        const targetName = target.config ? target.config.name.toUpperCase() : 'ASTEROID';
        ctx.fillText(targetName, x, y);

        // Draw health bar
        const barWidth = 100;
        const barHeight = 4;
        const barY = y + 25;
        const barX = x - barWidth; // Align right edge with text (flush with right border)

        const healthPercentage = target.health / target.maxHealth;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Health bar gradient
        let healthGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
        if (healthPercentage > 0.5) {
            healthGradient.addColorStop(0, '#66ff66');
            healthGradient.addColorStop(1, '#00cc00');
        } else if (healthPercentage > 0.25) {
            healthGradient.addColorStop(0, '#ffff99');
            healthGradient.addColorStop(1, '#ffcc00');
        } else {
            healthGradient.addColorStop(0, '#ff6666');
            healthGradient.addColorStop(1, '#cc0000');
        }

        ctx.fillStyle = healthGradient;
        ctx.fillRect(barX, barY, barWidth * healthPercentage, barHeight);

        // Draw LV and HP numbers below health bar with proper spacing
        const displayHealth = target.health > 0 && target.health < 1 ? 1 : Math.round(target.health);
        const healthNumber = `${displayHealth}/${Math.round(target.maxHealth)}`;
        const levelText = `LV${target.level || 1}`;

        ctx.font = "12px 'Press Start 2P', monospace"; // Increased from 10px to 12px
        ctx.letterSpacing = '0.5px'; // Added letter spacing

        // Measure text widths for proper spacing
        const levelWidth = ctx.measureText(levelText).width;
        const healthWidth = ctx.measureText(healthNumber).width;
        const spacing = 20; // Minimum space between LV and HP text
        const totalWidth = levelWidth + spacing + healthWidth;

        // Calculate positions to align right with the text and health bar
        const startX = x - totalWidth;
        const levelX = startX;
        const healthX = startX + levelWidth + spacing;
        const numberY = barY + 18;

        // Level text in light blue
        ctx.fillStyle = '#88ccff';
        ctx.textAlign = 'left';
        ctx.strokeText(levelText, levelX, numberY);
        ctx.fillText(levelText, levelX, numberY);

        // Health number in gold
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left'; // Changed to left align for consistent positioning
        ctx.strokeText(healthNumber, healthX, numberY);
        ctx.fillText(healthNumber, healthX, numberY);

        ctx.restore();
}

export function drawPowerupDisplay() {
        if (!this.powerupDisplay.active) return;

        const ctx = this.ctx;
        ctx.save();

        // Position at top center, below HUD elements to avoid overlap
        const centerX = this.width / 2;
        const topY = 120; // Clears health bar + level/coins + margin

        // Apply fade opacity (drawWavyText respects outer globalAlpha).
        ctx.globalAlpha = this.powerupDisplay.opacity;

        // Wavy text with a gradient pulse around the powerup's identifying
        // color — preserves the "this is the X powerup" visual while adding
        // shimmer. pulsePalette is cached per base color.
        this.drawWavyText(this.powerupDisplay.text, centerX, topY, {
            fontSize: 32,
            colors: pulsePalette(this.powerupDisplay.color),
            amplitude: 8,
            speed: 0.55,
            colorSpeed: 0.4,
        });

        ctx.restore();
}

export function drawPowerupIndicators() {
        if (!this.player || !this.player.powerups || this.player.powerups.size === 0) return;

        const ctx = this.ctx;
        const margin = 20;
        const iconSize = 40;
        const spacing = 50;
        const bottomY = this.height - margin - iconSize;

        let index = 0;

        ctx.save();

        for (const [type, powerupData] of this.player.powerups.entries()) {
            const x = margin + index * spacing;
            const y = bottomY;

            // Draw background circle
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(x + iconSize/2, y + iconSize/2, iconSize/2 + 3, 0, Math.PI * 2);
            ctx.fill();

            // Draw powerup border with gradient
            const borderGradient = ctx.createRadialGradient(
                x + iconSize/2, y + iconSize/2, 0,
                x + iconSize/2, y + iconSize/2, iconSize/2
            );
            const gradientColors = powerupData.config.gradientColors || ['#ff0000', '#990000'];
            borderGradient.addColorStop(0, gradientColors[0]);
            borderGradient.addColorStop(1, gradientColors[1]);

            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x + iconSize/2, y + iconSize/2, iconSize/2, 0, Math.PI * 2);
            ctx.stroke();

            // Draw powerup icon, vertically centered by actual glyph bounds.
            // textBaseline:'middle' isn't reliable for emoji — the glyph's
            // visual center isn't the em-box midpoint, so icons like ⭐ ride
            // low in the circle. Measure the glyph and offset by its real
            // (ascent − descent) / 2 from the alphabetic baseline.
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.font = `bold ${iconSize * 0.5}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            const cx = x + iconSize / 2;
            const cy = y + iconSize / 2;
            const m = ctx.measureText(powerupData.config.icon);
            // Fallback fudge factors if a browser doesn't report bounding box
            // metrics for emoji (older Safari).
            const ascent = m.actualBoundingBoxAscent || iconSize * 0.4;
            const descent = m.actualBoundingBoxDescent || iconSize * 0.05;
            const iconY = cy + (ascent - descent) / 2;
            ctx.strokeText(powerupData.config.icon, cx, iconY);
            ctx.fillText(powerupData.config.icon, cx, iconY);

            // Draw stack count if > 1
            if (powerupData.stacks > 1) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${iconSize * 0.3}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.strokeText(powerupData.stacks.toString(), x + iconSize - 8, y + iconSize - 8);
                ctx.fillText(powerupData.stacks.toString(), x + iconSize - 8, y + iconSize - 8);
            }

            // Draw timer bar (only for temporary powerups, not permanent shop items)
            if (powerupData.timeRemaining !== Infinity && powerupData.config.duration !== Infinity) {
            const timePercent = powerupData.timeRemaining / powerupData.config.duration;

                // Ensure timePercent is finite and valid
                if (isFinite(timePercent) && timePercent >= 0 && timePercent <= 1) {
            const barWidth = iconSize * 0.8;
            const barHeight = 4;
            const barX = x + (iconSize - barWidth) / 2;
            const barY = y + iconSize + 5;

            // Background bar
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

                    // Timer bar with gradient - ensure gradient coordinates are finite
                    const gradientEndX = barX + barWidth * timePercent;
                    if (isFinite(gradientEndX)) {
                        const timerGradient = ctx.createLinearGradient(barX, barY, gradientEndX, barY);
            if (timePercent > 0.3) {
                const gradientColors = powerupData.config.gradientColors || ['#ff0000', '#990000'];
                timerGradient.addColorStop(0, gradientColors[0]);
                timerGradient.addColorStop(1, gradientColors[1]);
            } else {
                timerGradient.addColorStop(0, '#ff9999');
                timerGradient.addColorStop(1, '#ff3333');
            }
            ctx.fillStyle = timerGradient;
            ctx.fillRect(barX, barY, barWidth * timePercent, barHeight);
                    }
                }
            }

            index++;
        }

        ctx.restore();
}

export function syncPowerupHUD() {
        const hudEl = document.getElementById('powerup-hud');
        if (!hudEl) return;

        if (!this.player || !this.player.powerups ||
                this.game.state === GAME_STATES.TITLE_SCREEN) {
            hudEl.innerHTML = '';
            this._powerupHudCache.clear();
            return;
        }

        const currentTypes = new Set(this.player.powerups.keys());

        // Remove DOM items for expired powerups
        hudEl.querySelectorAll('.powerup-hud-item').forEach(item => {
            if (!currentTypes.has(item.dataset.type)) {
                this._powerupHudCache.delete(item.dataset.type);
                item.remove();
            }
        });

        // Add or update one item per active powerup
        for (const [type, powerupData] of this.player.powerups.entries()) {
            const colors = powerupData.config.gradientColors || ['#ff4444', '#990000'];
            const isTemporary = powerupData.timeRemaining !== Infinity &&
                                powerupData.config.duration !== Infinity;

            let cached = this._powerupHudCache.get(type);

            if (!cached) {
                const item = document.createElement('div');
                item.className = 'powerup-hud-item';
                item.dataset.type = type;

                // Countdown label above circle (temporary powerups only)
                let countdown = null;
                if (isTemporary) {
                    countdown = document.createElement('div');
                    countdown.className = 'powerup-hud-countdown';
                    item.appendChild(countdown);
                }

                const circle = document.createElement('div');
                circle.className = 'powerup-hud-circle';
                circle.style.borderColor = colors[0];
                circle.style.boxShadow = `0 0 8px ${colors[0]}80`;
                circle.textContent = powerupData.config.icon || '⭐';
                item.appendChild(circle);

                let bar = null;
                if (isTemporary) {
                    const timerWrap = document.createElement('div');
                    timerWrap.className = 'powerup-hud-timer';
                    bar = document.createElement('div');
                    bar.className = 'powerup-hud-timer-bar';
                    bar.style.background = colors[0];
                    timerWrap.appendChild(bar);
                    item.appendChild(timerWrap);
                }

                // Powerup name label beneath timer bar
                const nameEl = document.createElement('div');
                nameEl.className = 'powerup-hud-name';
                nameEl.textContent = (powerupData.config.name || type).toUpperCase();
                item.appendChild(nameEl);

                hudEl.appendChild(item);

                cached = { item, countdown, bar, lastSec: -1, lastPct: -1 };
                this._powerupHudCache.set(type, cached);
            }

            // Sync countdown text (seconds remaining) with colour: green → yellow → red
            if (isTemporary && cached.countdown && isFinite(powerupData.timeRemaining)) {
                const newSec = Math.ceil(powerupData.timeRemaining / 1000);
                if (cached.lastSec !== newSec) {
                    cached.lastSec = newSec;
                    cached.countdown.textContent = newSec + 's';
                    const frac = isFinite(powerupData.config.duration)
                        ? Math.max(0, powerupData.timeRemaining / powerupData.config.duration)
                        : 1;
                    cached.countdown.style.color = frac > 0.6 ? '#44ff88'   // green
                                                 : frac > 0.25 ? '#ffdd44'  // yellow
                                                 : '#ff4444';                // red
                }
            }

            // Sync stack count badge — "2x" format, anchored to bottom-right of circle
            let stacksEl = cached.item.querySelector('.powerup-hud-stacks');
            if (powerupData.stacks > 1) {
                if (!stacksEl) {
                    stacksEl = document.createElement('div');
                    stacksEl.className = 'powerup-hud-stacks';
                    const circleEl = cached.item.querySelector('.powerup-hud-circle');
                    (circleEl || cached.item).appendChild(stacksEl);
                }
                stacksEl.textContent = powerupData.stacks + 'x';
            } else if (stacksEl) {
                stacksEl.remove();
            }

            // Sync timer bar width — only write style when value changes by >0.1%
            if (isTemporary && cached.bar && isFinite(powerupData.timeRemaining) && isFinite(powerupData.config.duration)) {
                const newPct = Math.round((powerupData.timeRemaining / powerupData.config.duration) * 1000) / 10;
                if (Math.abs(cached.lastPct - newPct) > 0.1) {
                    cached.lastPct = newPct;
                    const pct = Math.max(0, Math.min(100, newPct));
                    cached.bar.style.width = `${pct}%`;
                    cached.bar.style.background = pct < 30 ? '#ff3333' : colors[0];
                }
            }
        }
}

export function drawMoneyPickupDisplay() {
        if (this.moneyPickupDisplay.amount <= 0) return;

        const ctx = this.ctx;
        ctx.save();

        // Position to the right of the coin number in HUD (matching drawLevelAndCoinsDisplay exactly)
        const barX = 80; // From updateHUD
        const barY = 20; // From updateHUD
        const barHeight = 30; // From updateHUD
        const livesX = 10;
        const triforceWidth = 60;
        const triforceCenterX = livesX + triforceWidth / 2;
        const levelY = barY + barHeight + 26;
        const coinsY = levelY + 40; // Exact match from drawLevelAndCoinsDisplay

        const coinIconSize = 30;
        const coinIconX = triforceCenterX - coinIconSize / 2;
        const coinsTextX = coinIconX + coinIconSize + 10;

        // Calculate width of coins text to position pickup display after it
        ctx.font = "14px 'Press Start 2P', monospace";
        const coinsText = `${Math.floor(this.game.money)}`;
        const coinsTextWidth = ctx.measureText(coinsText).width;

        const x = coinsTextX + coinsTextWidth + 15; // 15px margin after coins text
        const y = coinsY; // Exact same Y position as coins display

        // Calculate fade effect
        let alpha = 1;
        if (this.moneyPickupDisplay.displayTime > this.moneyPickupDisplay.fadeStartTime) {
            const fadeProgress = (this.moneyPickupDisplay.displayTime - this.moneyPickupDisplay.fadeStartTime) /
                               (this.moneyPickupDisplay.maxDisplayTime - this.moneyPickupDisplay.fadeStartTime);
            alpha = 1 - fadeProgress;
        }

        // Draw darker gold +amount text
        ctx.font = "14px 'Press Start 2P', monospace";
        ctx.fillStyle = rgba(184, 134, 11, alpha); // Darker gold
        ctx.strokeStyle = rgba(0, 0, 0, alpha * 0.8);
        ctx.lineWidth = 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        const text = `+${this.moneyPickupDisplay.amount}`;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);

        ctx.restore();
}
