// HUD rendering methods extracted from GameEngine.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { GAME_CONFIG, GAME_STATES } from '../constants.js';
import { rgba, } from '../color-cache.js';
import { drawCachedHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon } from '../utils.js';
import { DEFENSE_SKILLS } from '../weapon-data.js';

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

export function drawPowerupDisplay() {
        if (!this.powerupDisplay.active) return;

        const ctx = this.ctx;
        ctx.save();

        // Position at top center, below HUD elements to avoid overlap
        const centerX = this.width / 2;
        const topY = 120; // Moved down to clear HUD elements (health bar + level/coins + margin)

        // Set font to Press Start 2P for consistency (avoid font loading flash)
        ctx.font = "32px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Apply fade opacity
        ctx.globalAlpha = this.powerupDisplay.opacity;

        // Glow effect removed for performance

        // Draw text with outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(this.powerupDisplay.text, centerX, topY);

        // Draw main text
        ctx.fillStyle = this.powerupDisplay.color;
        ctx.fillText(this.powerupDisplay.text, centerX, topY);

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

            // Draw powerup icon with enhanced visibility
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.font = `bold ${iconSize * 0.5}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeText(powerupData.config.icon, x + iconSize/2, y + iconSize/2);
            ctx.fillText(powerupData.config.icon, x + iconSize/2, y + iconSize/2);

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

export function drawHUD() {
        if (this.game.state !== GAME_STATES.TITLE_SCREEN && this.game.state !== GAME_STATES.SHOP) {
            // Draw health bar and UI elements
            this.updateHUD();
            // Show shop button during gameplay (but not when shop is open)
            this.events.emit('ui:show-shop-button');
            // Show DOM pause button on desktop; use canvas button on mobile
            if (this.inputHandler.isMobile()) {
                this.events.emit('ui:hide-pause-btn');
                this.drawPauseButton();
            } else {
                this.events.emit('ui:show-pause-btn');
            }
        } else {
            // Hide shop button on title screen and when shop is open
            this.events.emit('ui:hide-shop-button');
            this.events.emit('ui:hide-pause-btn');
        }

        // Draw level up text if active
        if (this.player && this.player.levelUpTextInfo && this.player.levelUpTextInfo.active) {
            this.drawLevelUpText();
        }

        // Draw wave message if active
        if (this.waveMessage.active) {
            const now = Date.now();
            const elapsed = now - this.waveMessage.startTime;

            if (elapsed < this.waveMessage.duration) {
                // Calculate fade effect
                const fadeProgress = elapsed / this.waveMessage.duration;
                const alpha = fadeProgress < 0.8 ? 1 : (1 - fadeProgress) / 0.2; // Fade out in last 20%

                this.ctx.save();
                this.ctx.globalAlpha = alpha;

                // Draw title (larger, centered horizontally, below HUD)
                const centerX = this.width / 2;
                const isMob = this.inputHandler.isMobile();
                // On mobile, push below HUD (health bar + level + coins ≈ 130px)
                // and use smaller base font sizes to avoid overlap
                const titleFS = isMob ? 28 : 48;
                const subFS2 = isMob ? 16 : 24;
                const topY = isMob ? 140 : 80;
                const gap = isMob ? 36 : 60;
                this.drawWavyText(this.waveMessage.title, centerX, topY, titleFS);

                // Draw subtitle (smaller, below title)
                if (this.waveMessage.subtitle) {
                    this.drawWavyText(this.waveMessage.subtitle, centerX, topY + gap, subFS2);
                }

                this.ctx.restore();
            } else {
                // Message expired
                this.waveMessage.active = false;
            }
        }

        // Draw skill cooldown HUD
        if (this.player && this.game.state !== GAME_STATES.TITLE_SCREEN && this.game.state !== GAME_STATES.SHOP) {
            this.drawSkillCooldownHUD();
        }

        // Draw title screen with wavy text
        if (this.game.state === GAME_STATES.TITLE_SCREEN) {
            this.drawTitleScreen();
        }
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

export function drawCursorCooldownTimer() {
        if (!this.player || !this.cursor || !this.player.isCharging) return;
        if (!this.cursor.x && !this.cursor.y) return;

        const charge = this.player.chargeLevel; // 0-1
        if (charge <= 0) return;

        const cursorX = this.cursor.x;
        const cursorY = this.cursor.y;
        const timerRadius = 20;

        this.ctx.save();

        // Background ring
        this.ctx.strokeStyle = 'rgba(100, 180, 255, 0.25)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(cursorX, cursorY, timerRadius, 0, Math.PI * 2);
        this.ctx.stroke();

        // Charge arc — fills as charge builds
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (charge * Math.PI * 2);

        if (this.player.isFullyCharged) {
            // Pulsing bright when ready to fire
            const pulse = 0.7 + Math.sin(Date.now() * 0.01) * 0.3;
            this.ctx.strokeStyle = `rgba(200, 255, 255, ${pulse})`;
            this.ctx.lineWidth = 5;
        } else {
            // Blue → cyan as charge builds
            const r = Math.floor(80 + charge * 175);
            const g = Math.floor(160 + charge * 95);
            this.ctx.strokeStyle = `rgb(${r}, ${g}, 255)`;
            this.ctx.lineWidth = 4;
        }
        this.ctx.lineCap = 'round';

        this.ctx.beginPath();
        this.ctx.arc(cursorX, cursorY, timerRadius, startAngle, endAngle);
        this.ctx.stroke();

        // Inner fill wedge for visibility
        if (charge > 0.1) {
            this.ctx.globalAlpha = this.player.isFullyCharged ? 0.15 : 0.1;
            this.ctx.fillStyle = this.player.isFullyCharged ? '#ccffff' : '#6688ff';
            this.ctx.beginPath();
            this.ctx.moveTo(cursorX, cursorY);
            this.ctx.arc(cursorX, cursorY, timerRadius - 1, startAngle, endAngle);
            this.ctx.closePath();
            this.ctx.fill();
        }

        this.ctx.restore();
}

export function drawOffScreenIndicators() {
        if (!this.player || !this.player.active) return;
        if (this.game.state !== GAME_STATES.PLAYING && this.game.state !== GAME_STATES.WAVE_TRANSITION) return;

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // ── Segment buffers (pre-allocated, cleared each frame) ──
        const SEGMENTS = 24;
        this._edgeGlow[0].fill(0);
        this._edgeGlow[1].fill(0);
        this._edgeGlow[2].fill(0);
        this._edgeGlow[3].fill(0);
        const edges = {
            top:    this._edgeGlow[0],
            bottom: this._edgeGlow[1],
            left:   this._edgeGlow[2],
            right:  this._edgeGlow[3],
        };

        // Fade-in margin: entities within this many px INSIDE the screen edge
        // contribute a partial glow so it doesn't pop in.
        const fadeMargin = 120;

        // Distance falloff — use screen diagonal so nearby = bright
        const screenDiag = Math.sqrt(w * w + h * h);
        const maxDist = screenDiag * 3;

        // ── Accumulate with sub-segment interpolation ──
        const addEntity = (entity) => {
            if (!entity || !entity.active) return;

            const sx = entity.x - this.camera.x;
            const sy = entity.y - this.camera.y;

            // How far past each edge (negative = still on-screen by that amount)
            const pastTop    = -sy;
            const pastBottom = sy - h;
            const pastLeft   = -sx;
            const pastRight  = sx - w;

            // Entity must be past (or within fadeMargin of) at least one edge
            const maxPast = Math.max(pastTop, pastBottom, pastLeft, pastRight);
            if (maxPast < -fadeMargin) return;

            // Distance from screen center for intensity falloff
            // Use squared falloff (1 - (d/max)^2) so nearby entities are much brighter,
            // and a single enemy just off-screen produces a clearly visible glow.
            const dx = sx - w * 0.5;
            const dy = sy - h * 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const t = Math.min(1, dist / maxDist);
            const distIntensity = Math.max(0.15, 1 - t * t); // floor of 0.15 per entity
            if (distIntensity < 0.01) return;

            // Helper: spread contribution across neighboring segments (tent filter)
            const contribute = (arr, t, intensity) => {
                // t is 0..1 position along edge; map to fractional segment index
                const fi = Math.max(0, Math.min(SEGMENTS - 0.001, t * SEGMENTS));
                const lo = Math.floor(fi);
                const frac = fi - lo;
                // Linear interpolation to two neighboring segments
                arr[lo] += intensity * (1 - frac);
                if (lo + 1 < SEGMENTS) arr[lo + 1] += intensity * frac;
            };

            // For each edge the entity is near/past, compute edge-proximity alpha
            // edgePast > 0 means off-screen; -fadeMargin..0 means approaching edge
            const addEdge = (edgePast, arr, alongT) => {
                if (edgePast < -fadeMargin) return;
                // Ramp: 0 at -fadeMargin, 1 at edge (0), stays 1 beyond
                const edgeFade = edgePast >= 0 ? 1 : (edgePast + fadeMargin) / fadeMargin;
                contribute(arr, alongT, distIntensity * edgeFade);
            };

            const tx = Math.max(0, Math.min(1, sx / w)); // normalized x along horiz edges
            const ty = Math.max(0, Math.min(1, sy / h)); // normalized y along vert edges
            addEdge(pastTop,    edges.top,    tx);
            addEdge(pastBottom, edges.bottom, tx);
            addEdge(pastLeft,   edges.left,   ty);
            addEdge(pastRight,  edges.right,  ty);
        };

        const enemies = this.enemyPool.activeObjects;
        for (let i = 0; i < enemies.length; i++) addEntity(enemies[i]);

        // ── Gaussian-ish blur pass (3-tap, two passes) for smooth spatial blending ──
        const blur = (arr) => {
            const tmp = this._blurTemp;
            for (let i = 0; i < SEGMENTS; i++) {
                const prev = i > 0 ? arr[i - 1] : 0;
                const next = i < SEGMENTS - 1 ? arr[i + 1] : 0;
                tmp[i] = prev * 0.25 + arr[i] * 0.5 + next * 0.25;
            }
            // Second pass for wider spread
            for (let i = 0; i < SEGMENTS; i++) {
                const prev = i > 0 ? tmp[i - 1] : 0;
                const next = i < SEGMENTS - 1 ? tmp[i + 1] : 0;
                arr[i] = prev * 0.25 + tmp[i] * 0.5 + next * 0.25;
            }
        };
        blur(edges.top);
        blur(edges.bottom);
        blur(edges.left);
        blur(edges.right);

        // ── Early-out if nothing to draw ──
        let hasAny = false;
        const allEdges = [edges.top, edges.bottom, edges.left, edges.right];
        for (let e = 0; e < 4 && !hasAny; e++) {
            for (let i = 0; i < SEGMENTS; i++) {
                if (allEdges[e][i] > 0.01) { hasAny = true; break; }
            }
        }
        if (!hasAny) return;

        // ── Render: ONE gradient per edge, vary globalAlpha per segment ──
        ctx.save();

        const glowDepth = 80;
        const r = 220, g = 50, b = 30;
        const segW = w / SEGMENTS;
        const segH = h / SEGMENTS;

        // Pre-create one gradient per edge direction (4 total, reused across segments)
        const gradTop    = ctx.createLinearGradient(0, 0, 0, glowDepth);
        const gradBottom = ctx.createLinearGradient(0, h, 0, h - glowDepth);
        const gradLeft   = ctx.createLinearGradient(0, 0, glowDepth, 0);
        const gradRight  = ctx.createLinearGradient(w, 0, w - glowDepth, 0);

        const setupGrad = (grad) => {
            grad.addColorStop(0, `rgb(${r},${g},${b})`);
            grad.addColorStop(0.4, `rgba(${r},${g},${b},0.4)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        };
        setupGrad(gradTop);
        setupGrad(gradBottom);
        setupGrad(gradLeft);
        setupGrad(gradRight);

        // Draw each edge: set fillStyle once, vary globalAlpha per segment.
        // sqrt curve boosts low values so a single enemy is noticeable,
        // while high values (many enemies) still cap at 0.9.
        const drawEdge = (arr, grad, fillRect) => {
            ctx.fillStyle = grad;
            for (let i = 0; i < SEGMENTS; i++) {
                const val = Math.min(arr[i], 1.0);
                if (val < 0.01) continue;
                ctx.globalAlpha = Math.min(0.9, Math.sqrt(val) * 0.7);
                fillRect(i);
            }
        };

        drawEdge(edges.top,    gradTop,    (i) => ctx.fillRect(i * segW, 0, segW + 1, glowDepth));
        drawEdge(edges.bottom, gradBottom, (i) => ctx.fillRect(i * segW, h - glowDepth, segW + 1, glowDepth));
        drawEdge(edges.left,   gradLeft,   (i) => ctx.fillRect(0, i * segH, glowDepth, segH + 1));
        drawEdge(edges.right,  gradRight,  (i) => ctx.fillRect(w - glowDepth, i * segH, glowDepth, segH + 1));

        ctx.globalAlpha = 1;
        ctx.restore();
}

export function drawMinimap() {
        // Scale minimap on small screens so it doesn't clip
        const minDim = Math.min(this.width, this.height);
        const minimapSize = minDim < 500 ? Math.max(80, Math.floor(minDim * 0.22)) : 150;
        const margin = minimapSize < 120 ? 10 : 20;
        const minimapX = this.width - minimapSize - margin;
        const minimapY = this.height - minimapSize - margin; // Move to bottom right
        const scaleX = minimapSize / this.gameField.width;
        const scaleY = minimapSize / this.gameField.height;

        this.ctx.save();

        // Draw minimap background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);

        // Draw minimap border
        this.ctx.strokeStyle = '#666666';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);

        // Draw camera view area
        const cameraViewX = minimapX + this.camera.x * scaleX;
        const cameraViewY = minimapY + this.camera.y * scaleY;
        const cameraViewW = this.width * scaleX;
        const cameraViewH = this.height * scaleY;

        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(cameraViewX, cameraViewY, cameraViewW, cameraViewH);

        // Draw player as blue dot
        if (this.player && this.player.active) {
            const playerX = minimapX + this.player.x * scaleX;
            const playerY = minimapY + this.player.y * scaleY;

            this.ctx.fillStyle = '#00ffff';
            this.ctx.beginPath();
            this.ctx.arc(playerX, playerY, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Draw asteroids as gray dots
        this.asteroidPool.activeObjects.forEach(asteroid => {
            if (asteroid.active) {
                const astX = minimapX + asteroid.x * scaleX;
                const astY = minimapY + asteroid.y * scaleY;

                this.ctx.fillStyle = '#888888';
                this.ctx.beginPath();
                this.ctx.arc(astX, astY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        // Draw enemies as red dots
        this.enemyPool.activeObjects.forEach(enemy => {
            if (enemy.active) {
                const enemyX = minimapX + enemy.x * scaleX;
                const enemyY = minimapY + enemy.y * scaleY;

                this.ctx.fillStyle = '#ff4444';
                this.ctx.beginPath();
                this.ctx.arc(enemyX, enemyY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        // Minimap label removed - it's obvious what it is

        this.ctx.restore();
}

export function drawJitterCircle() {
        const input = this.inputHandler.getInput();
        const intensity = this.player.shootingIntensity || 0;

        // Initialize fade tracking if needed
        if (!this.jitterCircleFade) {
            this.jitterCircleFade = {
                visible: false,
                alpha: 0,
                targetAlpha: 0
            };
        }

        // Update target alpha based on shooting intensity
        if (intensity > 0) {
            this.jitterCircleFade.targetAlpha = Math.min(0.4, 0.1 + intensity * 0.3); // Fade to 0.1-0.4 alpha
            this.jitterCircleFade.visible = true;
        } else {
            this.jitterCircleFade.targetAlpha = 0;
        }

        // Smooth fade transition with gentle fade-out (60fps assumed, ~16ms per frame)
        if (this.jitterCircleFade.alpha < this.jitterCircleFade.targetAlpha) {
            // Fade-in: moderate speed
            const fadeInSpeed = 0.08;
            this.jitterCircleFade.alpha = Math.min(this.jitterCircleFade.targetAlpha,
                this.jitterCircleFade.alpha + fadeInSpeed);
        } else if (this.jitterCircleFade.alpha > this.jitterCircleFade.targetAlpha) {
            // Fade-out: gentle, non-linear fade using easing
            const fadeOutSpeed = 0.04; // Slower base speed for gentler fade
            const alphaRatio = this.jitterCircleFade.alpha / 0.4; // Normalize to 0-1 range
            const easedSpeed = fadeOutSpeed * (0.3 + 0.7 * alphaRatio); // Slower as it gets more transparent

            this.jitterCircleFade.alpha = Math.max(this.jitterCircleFade.targetAlpha,
                this.jitterCircleFade.alpha - easedSpeed);
        }

        // Hide when fully faded out
        if (this.jitterCircleFade.alpha <= 0.01) {
            this.jitterCircleFade.visible = false;
            this.jitterCircleFade.alpha = 0;
        }

        // Draw circle if visible
        if (this.jitterCircleFade.visible && this.jitterCircleFade.alpha > 0) {
            // Base radius starts at 20px, scales up to 80px based on intensity
            const baseRadius = 20;
            const maxRadius = 80;
            const currentRadius = baseRadius + (maxRadius - baseRadius) * intensity;

            this.ctx.save();
            this.ctx.globalAlpha = this.jitterCircleFade.alpha;
            this.ctx.fillStyle = '#666666'; // Gray color
            this.ctx.beginPath();
            this.ctx.arc(input.screenAimX, input.screenAimY, currentRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
}

export function drawCustomCursor() {
        // Never show cursor on mobile — touch devices don't have a visible pointer
        if (this.inputHandler.isMobile()) return;
        if (!this.cursor.x && !this.cursor.y) return; // Don't draw if no mouse position

        const ctx = this.ctx;
        ctx.save();

        if (this.cursor.isOverTarget) {
            // Red targeting cursor (like the original asteroid-hover)
            this.drawRedTargetingCursor(ctx, this.cursor.x, this.cursor.y);
        } else {
            // Default cyan crosshair (like the original canvas cursor)
            this.drawDefaultCrosshair(ctx, this.cursor.x, this.cursor.y);
        }

        ctx.restore();
}

export function drawDefaultCrosshair(ctx, x, y) {
        // Original cyan crosshair design
        const color = '#00ffff';
        const size = 12;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer circle
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();

        // Cross lines
        ctx.beginPath();
        // Vertical line (top)
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x, y - 21);
        // Vertical line (bottom)
        ctx.moveTo(x, y + 7);
        ctx.lineTo(x, y + 21);
        // Horizontal line (left)
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x - 21, y);
        // Horizontal line (right)
        ctx.moveTo(x + 7, y);
        ctx.lineTo(x + 21, y);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
}

export function drawRedTargetingCursor(ctx, x, y) {
        // Red targeting cursor design (like original asteroid-hover)
        const color = '#ff0000';
        const size = 12;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Outer targeting circle
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();

        // Inner targeting circle
        ctx.beginPath();
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
        ctx.stroke();

        // Targeting lines (like crosshairs but with gaps)
        ctx.beginPath();
        // Top
        ctx.moveTo(x, y - size - 5);
        ctx.lineTo(x, y - size - 12);
        // Bottom
        ctx.moveTo(x, y + size + 5);
        ctx.lineTo(x, y + size + 12);
        // Left
        ctx.moveTo(x - size - 5, y);
        ctx.lineTo(x - size - 12, y);
        // Right
        ctx.moveTo(x + size + 5, y);
        ctx.lineTo(x + size + 12, y);
        ctx.stroke();

        // Center dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
}

export function updateHUD() {
        const ctx = this.ctx;
        const barX = 60; // Close to triforce (triforce rightmost pixel ≈ x=53)
        const barY = 20;
        const barHeight = 30;
        const barWidth = 220;
        const bevelSize = 12;
        const segments = 10; // Number of segments for the bar

        ctx.save();

        // Draw triforce (lives indicator) on canvas — same layer as HP bar, coins, level
        this.drawCanvasTriforce(ctx, this.game.lives, 10, barY);

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

        // Draw survival timer at bottom left
        this.drawSurvivalTimer(ctx);
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
        const livesX = 10; // Same as lives display position
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

        // Draw level up text with outline
        this.ctx.font = 'bold 32px "Press Start 2P", monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Text outline (black)
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.lineWidth = 4;
        this.ctx.strokeText(`LEVEL ${level}!`, 0, -15);

        // Main text (gold)
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillText(`LEVEL ${level}!`, 0, -15);

        // Subtitle text
        this.ctx.font = '16px "Press Start 2P", monospace';
        this.ctx.fillStyle = '#FFA500';
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeText('Skill Point Gained!', 0, 15);
        this.ctx.fillText('Skill Point Gained!', 0, 15);

        this.ctx.restore();
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
