// HUD cursor rendering — crosshairs, targeting cursor, jitter circle, charge timer.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

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
