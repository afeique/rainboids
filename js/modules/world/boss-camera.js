// world/boss-camera.js — dynamic-framing camera helpers for boss fights (9.1.0).
//
// Pure + engine-agnostic (no DOM, no canvas) so it's unit-testable. The
// camera-manager calls these each frame while a modular boss is active to ease
// `camera.zoom` from the player↔boss distance: pull BACK when the player backs
// off to read the whole screen-filling body, ease IN toward 1.0 when they close
// in to thread a tight pattern. Mobile is handled by composing the boss framing
// with the platform base zoom and HARD-CLAMPING the effective zoom so the ship
// never shrinks into a speck (the platform is already zoomed out on phones).

import { GAME_CONFIG as C } from '../core/constants.js';

// Smooth Hermite step in [0,1] across [edge0, edge1].
export function smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x < edge0 ? 0 : 1;
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// The platform's resting zoom — the value game-engine._refreshCameraZoom sets.
// Desktop 1.0; mobile portrait/landscape pulled back. Centralized here so the
// per-frame easing converges to the SAME rest value (no fight on resize).
export function platformBaseZoom(isMobileFlag, isPortraitFlag) {
    if (!isMobileFlag) return C.BASE_ZOOM_DESKTOP;
    return isPortraitFlag ? C.BASE_ZOOM_PORTRAIT : C.BASE_ZOOM_LANDSCAPE;
}

// Target camera zoom for the current frame given player + boss positions.
//   distance ≤ nearR  → baseZoom (closed-in: full fidelity)
//   distance ≥ farR   → zoomMin  (pulled back: read the whole boss)
// On mobile the pull-back is GENTLE (BOSS_ZOOM_MOBILE_FACTOR) and the result is
// clamped to MIN_EFFECTIVE_ZOOM so platform-zoom × boss-zoom can't go microscopic.
export function computeBossFraming({ px, py, bx, by, baseZoom, isMobile = false }) {
    const d = Math.hypot((bx || 0) - (px || 0), (by || 0) - (py || 0));
    const t = smoothstep(C.BOSS_ZOOM_NEAR_R, C.BOSS_ZOOM_FAR_R, d);

    let pulledBack;
    if (isMobile) {
        // Gentle: ease from the platform base toward base*factor only.
        pulledBack = lerp(baseZoom, baseZoom * C.BOSS_ZOOM_MOBILE_FACTOR, t);
    } else {
        // Desktop: full band from MAX (1.0) down to MIN.
        pulledBack = lerp(C.BOSS_ZOOM_MAX, C.BOSS_ZOOM_MIN, t);
    }
    return clampEffectiveZoom(pulledBack);
}

// Hard floor + ceiling on the effective zoom (the speck-prevention clamp).
export function clampEffectiveZoom(zoom) {
    return Math.max(C.MIN_EFFECTIVE_ZOOM, Math.min(C.BOSS_ZOOM_MAX, zoom));
}

// Ship-size guardrail: never let the rendered ship radius fall below
// MIN_SHIP_SCREEN_R. Returns a zoom raised just enough to keep the ship legible.
export function guardShipZoom(zoom, shipRadius) {
    if (!(shipRadius > 0)) return zoom;
    const floor = C.MIN_SHIP_SCREEN_R / shipRadius;
    return Math.max(zoom, floor);
}
