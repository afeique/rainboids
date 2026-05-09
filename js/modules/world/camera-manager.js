/**
 * CameraManager — camera position, screen shake, kick, and flash effects.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

export function updateCamera() {
    if (!this.player || !this.player.active) return;

    // Set camera target to follow player
    this.camera.targetX = this.player.x - this.width / 2;
    this.camera.targetY = this.player.y - this.height / 2;

    // Clamp camera to game field boundaries
    this.camera.targetX = Math.max(0, Math.min(this.gameField.width - this.width, this.camera.targetX));
    this.camera.targetY = Math.max(0, Math.min(this.gameField.height - this.height, this.camera.targetY));

    // Smooth camera movement
    this.camera.x += (this.camera.targetX - this.camera.x) * this.camera.smoothing;
    this.camera.y += (this.camera.targetY - this.camera.y) * this.camera.smoothing;
}

export function screenToWorldCoordinates(screenX, screenY) {
    // Convert screen coordinates to world coordinates accounting for camera
    return {
        x: screenX + this.camera.x,
        y: screenY + this.camera.y
    };
}

export function isEntityOnScreen(entity, buffer = 50) {
    if (!entity || !entity.active) return false;

    // Calculate entity bounds
    const entityLeft = entity.x - entity.radius - buffer;
    const entityRight = entity.x + entity.radius + buffer;
    const entityTop = entity.y - entity.radius - buffer;
    const entityBottom = entity.y + entity.radius + buffer;

    // Calculate screen bounds in world coordinates
    const screenLeft = this.camera.x;
    const screenRight = this.camera.x + this.canvas.width;
    const screenTop = this.camera.y;
    const screenBottom = this.camera.y + this.canvas.height;

    // Check if entity overlaps with screen
    return !(entityRight < screenLeft ||
            entityLeft > screenRight ||
            entityBottom < screenTop ||
            entityTop > screenBottom);
}

export function getVisibleStars(stars) {
    // Calculate viewport bounds with some padding for smooth transitions
    const padding = 100;
    const viewLeft = this.camera.x - padding;
    const viewRight = this.camera.x + this.width + padding;
    const viewTop = this.camera.y - padding;
    const viewBottom = this.camera.y + this.height + padding;

    return stars.filter(star => {
        if (!star.active) return false;

        // Check if star is within viewport bounds
        return star.x >= viewLeft &&
               star.x <= viewRight &&
               star.y >= viewTop &&
               star.y <= viewBottom;
    });
}

export function triggerCameraKick(dx, dy, magnitude) {
    const len = Math.hypot(dx, dy) || 1;
    this._cameraKickX = (dx / len) * magnitude;
    this._cameraKickY = (dy / len) * magnitude;
}

export function triggerScreenFlash(alpha, duration) {
    this._screenFlashAlpha = alpha;
    this._screenFlashDuration = duration;
    this._screenFlashTimer = duration;
}

// 5.85.0 — gold-tinted flash channel for the life-loss event. Runs in
// parallel with the main white flash so the two can layer.
export function triggerGoldScreenFlash(alpha, duration) {
    this._goldFlashAlpha = alpha;
    this._goldFlashDuration = duration;
    this._goldFlashTimer = duration;
}

export function triggerScreenShake(duration, magnitude, asteroidSize = 0) {
    // Enhanced screen shake based on asteroid size
    const baseMagnitude = magnitude;
    const sizeMultiplier = Math.max(1.5, asteroidSize / 20); // Larger asteroids = much more shake
    const enhancedMagnitude = baseMagnitude * sizeMultiplier;

    // Add more randomness and intensity for asteroid destructions
    const randomDuration = duration + Math.floor(Math.random() * 8);
    const randomMagnitude = enhancedMagnitude + Math.random() * 5;

    // Only apply new shake if it's stronger than current shake
    if (randomMagnitude > this.game.screenShakeMagnitude) {
        this.game.screenShakeDuration = randomDuration;
        this.game.screenShakeMagnitude = randomMagnitude;

        // Store the original values for smooth decay
        this.game.originalShakeMagnitude = randomMagnitude;
        this.game.shakeDecayRate = randomMagnitude / randomDuration;
    }
}

export function triggerHitstop(frames) {
    const now = performance.now();

    // ── Global budget: max 10 hitstop frames per second ──
    if (!this._hitstopBudget) {
        this._hitstopBudget = { frames: 0, windowStart: now };
    }
    if (now - this._hitstopBudget.windowStart > 1000) {
        this._hitstopBudget.frames = 0;
        this._hitstopBudget.windowStart = now;
    }
    const remaining = 10 - this._hitstopBudget.frames;
    if (remaining <= 0) return; // budget exhausted — skip
    frames = Math.min(frames, remaining);

    // Cooldown: light hits (< 4 frames) rate-limited to once per 200ms
    // Kill/death hitstop (4+ frames) always punches through
    if (frames < 4 && this._lastHitstopTime && (now - this._lastHitstopTime) < 200) {
        return;
    }
    this._lastHitstopTime = now;

    // Only apply if stronger than current hitstop (coalesce simultaneous hits via max)
    const applied = Math.max(this._hitstopFrames || 0, frames);
    const added = applied - (this._hitstopFrames || 0);
    this._hitstopFrames = applied;
    this._hitstopBudget.frames += added;
}
