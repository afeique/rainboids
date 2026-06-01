/**
 * CameraManager — camera position, screen shake, kick, and flash effects.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

import { isPortrait } from '../platform/platform-detect.js';
import { GAME_CONFIG } from '../core/constants.js';

// The platform's resting zoom — desktop 1.0; mobile portrait/landscape pulled
// back. Centralized so the per-frame easing converges to the SAME rest value
// (no fight with _refreshCameraZoom on resize).
function platformBaseZoom(isMobileFlag, isPortraitFlag) {
    if (!isMobileFlag) return GAME_CONFIG.BASE_ZOOM_DESKTOP;
    return isPortraitFlag ? GAME_CONFIG.BASE_ZOOM_PORTRAIT : GAME_CONFIG.BASE_ZOOM_LANDSCAPE;
}

export function updateCamera() {
    if (!this.player || !this.player.active) return;

    // Set camera target to follow player (so player stays at canvas center
    // after the world transform, regardless of zoom — the zoom transform
    // scales around the canvas center).
    this.camera.targetX = this.player.x - this.width / 2;
    this.camera.targetY = this.player.y - this.height / 2;

    // Ease the zoom toward the platform base (desktop 1.0 / mobile 0.78–0.88)
    // so there's no fight with _refreshCameraZoom.
    const isMob = !!this.mobile;
    const baseZoom = platformBaseZoom(isMob, isPortrait());
    const ease = 0.05;
    this.camera.zoom = (this.camera.zoom || baseZoom) + (baseZoom - (this.camera.zoom || baseZoom)) * ease;

    // 5.96.0 — Clamp camera to game field boundaries with zoom awareness.
    //   The visible world window has size `width/zoom × height/zoom`
    //   centered on `camera.{x,y} + {width/2, height/2}` in world coords.
    //   We want the visible window inside the field where possible.
    //   When the visible window is LARGER than the field on an axis
    //   (zoomed-out small field), centre the field on the screen.
    const zoom = (this.camera && this.camera.zoom) || 1;
    const visW = this.width / zoom;
    const visH = this.height / zoom;
    // Visible-window half-extent offset from camera.x/y (which is the
    // top-left of the canvas in world coords). The visible window center
    // sits at camera.x + width/2; its half-width is visW/2; so the
    // window's left edge is at camera.x + width/2 - visW/2 in world.
    const halfPadW = (visW - this.width) / 2; // negative when zoom > 1
    const halfPadH = (visH - this.height) / 2;
    const minX = -halfPadW;
    const maxX = this.gameField.width - this.width + halfPadW;
    const minY = -halfPadH;
    const maxY = this.gameField.height - this.height + halfPadH;
    if (maxX < minX) {
        // visible window wider than the field — centre the field
        this.camera.targetX = (this.gameField.width - this.width) / 2;
    } else {
        this.camera.targetX = Math.max(minX, Math.min(maxX, this.camera.targetX));
    }
    if (maxY < minY) {
        this.camera.targetY = (this.gameField.height - this.height) / 2;
    } else {
        this.camera.targetY = Math.max(minY, Math.min(maxY, this.camera.targetY));
    }

    // Smooth camera movement
    this.camera.x += (this.camera.targetX - this.camera.x) * this.camera.smoothing;
    this.camera.y += (this.camera.targetY - this.camera.y) * this.camera.smoothing;
}

export function screenToWorldCoordinates(screenX, screenY) {
    // 5.96.0 — Inverse of the zoom-around-canvas-center + camera-translate
    //   transform applied in game-engine.js draw():
    //     world = (screen - center) / zoom + center + camera
    //   At zoom=1 this collapses to `screen + camera` (desktop path).
    //   Sanity: screen=(cx,cy) at the canvas center maps to
    //     (cx + camera.x, cy + camera.y) — the world coord at screen
    //     center, which matches the player target (camera.x = player.x -
    //     width/2 means screen-center world.x = camera.x + width/2 = player.x).
    const zoom = (this.camera && this.camera.zoom) || 1;
    const cx = this.width / 2;
    const cy = this.height / 2;
    return {
        x: (screenX - cx) / zoom + cx + this.camera.x,
        y: (screenY - cy) / zoom + cy + this.camera.y,
    };
}

export function isEntityOnScreen(entity, buffer = 50) {
    if (!entity || !entity.active) return false;

    // Calculate entity bounds
    const entityLeft = entity.x - entity.radius - buffer;
    const entityRight = entity.x + entity.radius + buffer;
    const entityTop = entity.y - entity.radius - buffer;
    const entityBottom = entity.y + entity.radius + buffer;

    // 5.96.0 — Visible screen bounds in world coords account for camera
    //   zoom. At zoom < 1 the visible window is LARGER than the canvas
    //   pixel size; entities outside the canvas-sized rect but inside the
    //   zoomed-out rect ARE visible and should be considered on-screen.
    const zoom = (this.camera && this.camera.zoom) || 1;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const visW = cw / zoom;
    const visH = ch / zoom;
    const halfPadW = (visW - cw) / 2;
    const halfPadH = (visH - ch) / 2;
    const screenLeft = this.camera.x - halfPadW;
    const screenRight = this.camera.x + cw + halfPadW;
    const screenTop = this.camera.y - halfPadH;
    const screenBottom = this.camera.y + ch + halfPadH;

    // Check if entity overlaps with screen
    return !(entityRight < screenLeft ||
            entityLeft > screenRight ||
            entityBottom < screenTop ||
            entityTop > screenBottom);
}

export function getVisibleStars(stars) {
    // Calculate viewport bounds with some padding for smooth transitions.
    // 5.96.0 — Honour camera zoom: zoomed-out views see more world, so
    //   the cull rect expands by 1/zoom around the canvas center.
    const padding = 100;
    const zoom = (this.camera && this.camera.zoom) || 1;
    const visW = this.width / zoom;
    const visH = this.height / zoom;
    const halfPadW = (visW - this.width) / 2;
    const halfPadH = (visH - this.height) / 2;
    const viewLeft = this.camera.x - halfPadW - padding;
    const viewRight = this.camera.x + this.width + halfPadW + padding;
    const viewTop = this.camera.y - halfPadH - padding;
    const viewBottom = this.camera.y + this.height + halfPadH + padding;

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
