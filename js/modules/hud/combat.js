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

            const alpha = Math.max(0, dmgNum.life);
            const screenX = dmgNum.x - this.camera.x;
            const screenY = dmgNum.y - this.camera.y;

            if (screenX < -50 || screenX > this.width + 50 ||
                screenY < -50 || screenY > this.height + 50) {
                ctx.restore();
                return;
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (dmgNum.isCrit) {
                // CRITs: bigger font, hot orange-red, white outline, with a
                // tiny "CRIT!" tag above so they're impossible to miss.
                const fontSize = 26;
                ctx.font = `bold ${fontSize}px 'Press Start 2P', monospace`;
                ctx.lineWidth = 3;
                ctx.strokeStyle = rgba(0, 0, 0, alpha);
                ctx.fillStyle = rgba(255, 80, 30, alpha);
                const text = dmgNum.damage.toString();
                ctx.strokeText(text, screenX, screenY);
                ctx.fillText(text, screenX, screenY);

                ctx.font = "10px 'Press Start 2P', monospace";
                ctx.fillStyle = rgba(255, 220, 80, alpha);
                ctx.fillText('CRIT!', screenX, screenY - fontSize * 0.85);
            } else if (dmgNum.isEmpowered) {
                // Empowered (perfect-reload buff active): cyan tint, slightly
                // bigger than normal, no CRIT tag.
                ctx.font = "20px 'Press Start 2P', monospace";
                ctx.lineWidth = 2;
                ctx.strokeStyle = rgba(0, 0, 0, alpha);
                ctx.fillStyle = rgba(120, 240, 255, alpha);
                const text = dmgNum.damage.toString();
                ctx.strokeText(text, screenX, screenY);
                ctx.fillText(text, screenX, screenY);
            } else {
                // Standard hit: gold, 16px (unchanged from before).
                ctx.font = "16px 'Press Start 2P', monospace";
                ctx.fillStyle = rgba(255, 215, 0, alpha);
                ctx.fillText(dmgNum.damage.toString(), screenX, screenY);
            }

            ctx.restore();
        });
}

export function drawTargetInfo() {
        // Layout (top → bottom):
        //   row 1:  "LV.N  ENEMYNAME"   — LV. blue, N maroon, name gold
        //   row 2:  health bar
        //   row 3:  "X / Y" health numbers
        //
        // Reads health LIVE from the entity ref when it's still alive (no
        // 1-frame staleness, which used to read as bar/number jitter on
        // every Storm-Needles tick). Falls back to the snapshot health
        // during the grace period after death. No alpha fade — hide hard
        // when the snapshot expires; partial alpha caused per-frame
        // anti-aliasing differences that looked like flicker.
        const info = this.lastHitInfo;
        if (!info) return;
        if (Date.now() > info.expireAt) return;

        const refAlive = info.ref && info.ref.active;
        const liveHealth = refAlive ? info.ref.health : info.health;
        const liveMax = refAlive ? info.ref.maxHealth : info.maxHealth;
        if (typeof liveHealth !== 'number' || typeof liveMax !== 'number') return;

        const ctx = this.ctx;
        const centerX = this.width / 2;

        // Font sizes — name larger than LV, both smaller than the old 28px.
        const nameFontSize = 22;
        const lvFontSize = 14;

        const headerY = 24;
        const barY = headerY + nameFontSize + 8;     // ~54
        const numberY = barY + 16;                    // ~70
        const barWidth = 240;
        const barHeight = 7;

        ctx.save();
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';

        // ── Row 1: NAME centered, LV.N hanging off to its LEFT ───────────
        // The enemy NAME stays centered on screen regardless of level digit
        // count. The "LV.N" indicator sits flush against the name's left
        // edge with a small gap — so the eye reads NAME first, then notices
        // the level tag attached on the side.
        const lvLabel = 'LV.';
        const lvNum = String(info.level || 1);
        const name = info.name;

        // Measure name first so we know where its left edge sits.
        ctx.font = `bold ${nameFontSize}px 'Press Start 2P', monospace`;
        const nameW = ctx.measureText(name).width;
        const nameLeft = Math.round(centerX - nameW / 2);

        // Bottom-align LV. row with name baseline so the smaller text sits
        // at the bottom of the larger glyph height, not at its top.
        const nameBottom = headerY + nameFontSize;
        const lvY = nameBottom - lvFontSize;

        // Measure the LV.N block at LV font size.
        ctx.font = `bold ${lvFontSize}px 'Press Start 2P', monospace`;
        const lvLabelW = ctx.measureText(lvLabel).width;
        const lvNumW = ctx.measureText(lvNum).width;
        const lvBlockW = lvLabelW + lvNumW;
        const lvGap = 14;
        const lvBlockRight = nameLeft - lvGap;
        const lvBlockLeft = lvBlockRight - lvBlockW;

        // "LV." in blue (left half of the block)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#5DA9FF';
        ctx.strokeText(lvLabel, lvBlockLeft, lvY);
        ctx.fillText(lvLabel, lvBlockLeft, lvY);

        // Level number in lighter maroon — was #7A1F2A (too dark), now a
        // brighter rose-red that still reads as "warning" but isn't muddy.
        ctx.fillStyle = '#E74057';
        ctx.strokeText(lvNum, lvBlockLeft + lvLabelW, lvY);
        ctx.fillText(lvNum, lvBlockLeft + lvLabelW, lvY);

        // Name in gold (centered on screen)
        ctx.font = `bold ${nameFontSize}px 'Press Start 2P', monospace`;
        ctx.fillStyle = '#FFD700';
        ctx.strokeText(name, nameLeft, headerY);
        ctx.fillText(name, nameLeft, headerY);

        // ── Row 2: health bar ────────────────────────────────────────────
        const barX = Math.round(centerX - barWidth / 2);
        const healthPercentage = Math.max(0, Math.min(1, liveHealth / liveMax));

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        const healthGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
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
        ctx.fillRect(barX, barY, Math.round(barWidth * healthPercentage), barHeight);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX + 0.5, barY + 0.5, barWidth - 1, barHeight - 1);

        // ── Row 3: HP numbers ────────────────────────────────────────────
        const displayHealth = liveHealth > 0 && liveHealth < 1 ? 1 : Math.round(liveHealth);
        const healthNumber = `${displayHealth} / ${Math.round(liveMax)}`;
        ctx.font = "12px 'Press Start 2P', monospace";
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.strokeText(healthNumber, centerX, numberY);
        ctx.fillText(healthNumber, centerX, numberY);

        ctx.restore();
}

export function drawPowerupDisplay() {
        if (!this.powerupDisplay.active) return;

        const ctx = this.ctx;
        ctx.save();

        // Stack order top-to-bottom:
        //   enemy info  (y≈24-84)
        //   wave title  (y≈176-224)
        //   wave subtitle (y≈248-272)
        //   powerup pickup label (this — y≈300)
        const centerX = this.width / 2;
        const topY = 300;

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
