// BOSS-03 — Boss intro / death canvas FX.
//
// The shipped sequence runner (boss-intro.js) advances a boss's INTRO and DEATH
// beat lists by elapsed time and fires each beat's `onEnter`, but it deliberately
// does NO rendering. This module is the renderer + screen-shake contributor that
// READS that sequence state and paints:
//
//   • a NAME-CARD SWEEP — the boss name banner that sweeps in from the left,
//     holds dead-center, then sweeps out, driven by the intro's `name-card` beat
//     (BOSS-01's element tint reused so the card matches the healthbar).
//   • a DEATH DETONATION — an expanding shockwave ring + screen flash that grows
//     across the death sequence and peaks on the `supernova`/final beat.
//   • a CAMERA-SHAKE contribution — a decaying {dx,dy} jitter the engine can add
//     to its own per-frame screen offset (modelled on game-engine's Vlambeer-
//     style multi-frequency shake so it reads identically).
//
// Mirroring boss-healthbar.js's shipped pattern: PURE compute helpers
// (`computeNameCard`, `computeDetonation`, `bossFxCameraShake`) carry all the
// math and are unit-testable with no canvas; `drawBossIntroFx` / `drawBossDeathFx`
// do the 2D rendering; `drawBossFxHook` is the one engine-side hook. Everything
// skips cleanly when no sequence is active.
//
// Sequence state shape (see boss-intro.js `_buildState`): the boss carries
//   boss[INTRO_KEY] / boss[DEATH_KEY] = { script, starts, total, t0, index, done, ... }
// We read it via the boss-intro accessors so the two modules stay decoupled.

import {
    INTRO_KEY,
    DEATH_KEY,
    currentBeat,
    currentBeatIndex,
    beatProgress,
    sequenceProgress,
    isSequenceComplete,
} from './boss-intro.js';
import { bossElementColor, isDrawableBoss } from '../hud/boss-healthbar.js';

// ── Beat classification ─────────────────────────────────────────────────────
// Bosses tag intro/death beats with descriptive ids (e.g. 'name-card',
// 'supernova', 'bolts-blow'). We classify by id substring so the FX work for
// any boss without each one wiring FX by hand — and fall back gracefully when
// a stub uses generic ids.
function _id(beat) {
    return beat && typeof beat.id === 'string' ? beat.id.toLowerCase() : '';
}
function isNameCardBeat(beat) {
    return /name|card|title/.test(_id(beat));
}
function isDetonationBeat(beat) {
    return /supernova|nova|detonat|blow|crack|core|burst|explo/.test(_id(beat));
}

// ── Active-sequence guards ──────────────────────────────────────────────────
// An intro is "live" while its sequence exists and has not completed; a death
// is "live" the same way. (boss-intro keeps advancing a death even while the
// boss is dying/inactive, so we deliberately do NOT require isDrawableBoss for
// the death FX.)
function hasSequence(boss, key) {
    return !!(boss && boss[key]);
}
export function introFxActive(boss) {
    return hasSequence(boss, INTRO_KEY) && !isSequenceComplete(boss, INTRO_KEY);
}
export function deathFxActive(boss) {
    return hasSequence(boss, DEATH_KEY) && !isSequenceComplete(boss, DEATH_KEY);
}

// Resolve a display name for the card: the active beat's `name` (bosses set the
// name-card beat's `name` to the boss title), then the boss name, then 'BOSS'.
function resolveCardName(boss, beat) {
    const n = (beat && beat.name) || boss.name || (boss.config && boss.config.name) || 'BOSS';
    return String(n).toUpperCase();
}

/**
 * PURE — name-card sweep state for the current intro frame. No canvas access.
 *
 * The card has three visual phases mapped onto the active beat's 0..1 progress:
 *   • 'in'   (first 30%)  — sweeps in from the left, alpha ramps 0→1.
 *   • 'hold' (middle 40%) — parked dead-center, fully opaque.
 *   • 'out'  (last 30%)   — sweeps out to the right, alpha ramps 1→0.
 * Outside the name-card beat the card is inactive.
 *
 * @param {object} boss  a boss carrying an INTRO sequence (or stub)
 * @param {number} now   ms timestamp
 * @returns {{
 *   active: boolean,
 *   name: string,
 *   phase: 'in'|'hold'|'out',
 *   alpha: number,         // 0..1
 *   offset: number,        // -1 (off-left) .. 0 (centered) .. +1 (off-right)
 *   progress: number,      // 0..1 within the name-card beat
 *   color: string,         // element tint
 * }}
 */
export function computeNameCard(boss, now) {
    const idle = {
        active: false, name: '', phase: 'in', alpha: 0, offset: -1,
        progress: 0, color: '#dfe7f0',
    };
    if (!introFxActive(boss)) return idle;
    const beat = currentBeat(boss, INTRO_KEY);
    if (!isNameCardBeat(beat)) return idle;

    const p = beatProgress(boss, INTRO_KEY, now); // 0..1 within this beat
    const IN_END = 0.3;
    const OUT_START = 0.7;

    let phase, alpha, offset;
    if (p < IN_END) {
        // Sweep in from the left. Ease-out so it decelerates into center.
        const t = p / IN_END;                 // 0..1
        const e = 1 - (1 - t) * (1 - t);       // easeOutQuad
        phase = 'in';
        alpha = e;
        offset = -(1 - e);                     // -1 → 0
    } else if (p < OUT_START) {
        phase = 'hold';
        alpha = 1;
        offset = 0;
    } else {
        // Sweep out to the right. Ease-in so it accelerates away.
        const t = (p - OUT_START) / (1 - OUT_START); // 0..1
        const e = t * t;                              // easeInQuad
        phase = 'out';
        alpha = 1 - e;
        offset = e;                                   // 0 → +1
    }

    return {
        active: true,
        name: resolveCardName(boss, beat),
        phase,
        alpha: Math.max(0, Math.min(1, alpha)),
        offset: Math.max(-1, Math.min(1, offset)),
        progress: p,
        color: bossElementColor(boss.element),
    };
}

/**
 * PURE — death-detonation state for the current death frame. No canvas access.
 *
 * A single expanding shockwave whose radius grows monotonically across the
 * WHOLE death sequence (sequenceProgress), peaking right at the end. A flash
 * spikes on each detonation beat (supernova/core-crack/etc) via the in-beat
 * progress so multi-stage deaths pulse rather than fade once. Radius is given as
 * a fraction of a caller-supplied reference size so the helper stays resolution-
 * agnostic and pure.
 *
 * @param {object} boss  a boss carrying a DEATH sequence (or stub)
 * @param {number} now   ms timestamp
 * @returns {{
 *   active: boolean,
 *   radiusScale: number,   // 0..1, grows over the sequence (multiply by a ref radius)
 *   flash: number,         // 0..1, spikes on detonation beats
 *   alpha: number,         // 0..1, ring opacity (fades as it expands)
 *   detonating: boolean,   // true while inside a detonation beat
 *   color: string,         // element tint
 * }}
 */
export function computeDetonation(boss, now) {
    const idle = {
        active: false, radiusScale: 0, flash: 0, alpha: 0,
        detonating: false, color: '#dfe7f0',
    };
    if (!deathFxActive(boss)) return idle;

    const seq = sequenceProgress(boss, DEATH_KEY, now); // 0..1 across the death
    // Ring expands ease-out (fast then settles) and fades as it grows.
    const radiusScale = Math.max(0, Math.min(1, 1 - (1 - seq) * (1 - seq)));
    const alpha = Math.max(0, 1 - seq);

    // Flash spikes mid-beat on detonation beats: a sine bell over the beat's
    // own progress so each blow-out stage gives its own pop.
    const beat = currentBeat(boss, DEATH_KEY);
    const detonating = isDetonationBeat(beat);
    let flash = 0;
    if (detonating) {
        const bp = beatProgress(boss, DEATH_KEY, now);
        flash = Math.sin(Math.min(1, bp) * Math.PI); // 0 → 1 → 0
    }

    return {
        active: true,
        radiusScale,
        flash: Math.max(0, Math.min(1, flash)),
        alpha: Math.max(0, Math.min(1, alpha)),
        detonating,
        color: bossElementColor(boss.element),
    };
}

/**
 * PURE — camera-shake contribution for a boss in intro/death. Returns a screen-
 * pixel offset the engine can ADD to its own per-frame shake (it does not touch
 * `game.screenShakeMagnitude`). Modelled on game-engine's Vlambeer-style multi-
 * frequency shake: a sin/cos base plus a deterministic pseudo-random jitter,
 * scaled by a magnitude that DECAYS over the driving sequence.
 *
 * Magnitude sources, strongest wins:
 *   • death detonation  → strong, peaks on detonation beats, decays over the seq
 *   • intro warp-in     → mild rumble, decays as the intro completes
 *
 * @param {object} boss  a boss carrying an intro/death sequence (or stub)
 * @param {number} now   ms timestamp
 * @returns {{ dx: number, dy: number, magnitude: number }}
 */
export function bossFxCameraShake(boss, now) {
    const zero = { dx: 0, dy: 0, magnitude: 0 };
    if (!boss) return zero;

    let magnitude = 0;

    // Death shake — dominant. Base envelope decays as the sequence ends; each
    // detonation beat adds a punch on top.
    if (deathFxActive(boss)) {
        const det = computeDetonation(boss, now);
        // Up to 12px base that drains as the ring expands, +10px per detonation.
        magnitude = Math.max(magnitude, det.alpha * 12 + det.flash * 10);
    }

    // Intro warp-in rumble — mild, only before the boss is fully present. Fades
    // out across the whole intro so it's gone by fight-start.
    if (introFxActive(boss)) {
        const seq = sequenceProgress(boss, INTRO_KEY, now);
        const introMag = (1 - seq) * 4; // 4px → 0 over the intro
        magnitude = Math.max(magnitude, introMag);
    }

    if (magnitude <= 0) return zero;

    // Vlambeer-style: deterministic multi-frequency base + pseudo-random jitter.
    // Reproduces game-engine.js's 0.25 structured / 0.75 jitter split, but uses
    // a `now`-seeded hash instead of Math.random so the helper stays PURE and
    // unit-testable (same `now` → same offset).
    const time = now * 0.01;
    const j1 = _hashNoise(now * 0.013) - 0.5;
    const j2 = _hashNoise(now * 0.017 + 11.7) - 0.5;
    const dx = Math.sin(time * 17) * magnitude * 0.25 + j1 * magnitude * 0.75;
    const dy = Math.cos(time * 13) * magnitude * 0.25 + j2 * magnitude * 0.75;
    return { dx, dy, magnitude };
}

// Cheap deterministic 0..1 hash for the shake jitter (keeps the helper pure).
function _hashNoise(x) {
    const s = Math.sin(x) * 43758.5453;
    return s - Math.floor(s);
}

// ── Renderers ───────────────────────────────────────────────────────────────

/**
 * Render the boss intro FX (the name-card sweep) centered on a `viewW`-wide
 * canvas. Skips cleanly when no intro / no name-card beat is active. Engine-
 * agnostic: raw 2D context + boss + viewport width + now.
 */
export function drawBossIntroFx(ctx, boss, viewW, viewH, now = Date.now()) {
    const card = computeNameCard(boss, now);
    if (!card.active || card.alpha <= 0.001) return;

    const cx = viewW / 2;
    const cardY = Math.round(viewH * 0.42); // upper-middle, clear of the top-center healthbar

    // The sweep travels a little over half the viewport so the card visibly
    // slides in from off-left and out to off-right.
    const travel = viewW * 0.55;
    const x = cx + card.offset * travel;

    const fontSize = Math.max(20, Math.min(56, Math.round(viewW / 18)));

    ctx.save();
    ctx.globalAlpha = card.alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Backing sweep bar so the name reads against the playfield.
    ctx.font = `${fontSize}px 'Press Start 2P', monospace`;
    const textW = ctx.measureText(card.name).width;
    const barW = textW + fontSize * 2;
    const barH = fontSize * 1.9;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x - barW / 2, cardY - barH / 2, barW, barH);
    // Element-tinted top/bottom rules.
    ctx.fillStyle = card.color;
    ctx.fillRect(x - barW / 2, cardY - barH / 2, barW, 2);
    ctx.fillRect(x - barW / 2, cardY + barH / 2 - 2, barW, 2);

    // Name text — heavy black outline + element fill (matches the healthbar).
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.strokeText(card.name, x, cardY);
    ctx.fillStyle = card.color;
    ctx.fillText(card.name, x, cardY);

    ctx.restore();
}

/**
 * Render the boss death FX (expanding shockwave ring + flash) centered on the
 * boss's world-anchored screen position. The caller passes the boss's already-
 * screen-space center (sx, sy) so this stays camera-agnostic. Skips cleanly
 * when no death sequence is active. `refRadius` scales the ring.
 */
export function drawBossDeathFx(ctx, boss, sx, sy, refRadius, now = Date.now()) {
    const det = computeDetonation(boss, now);
    if (!det.active) return;

    const r = Math.max(1, refRadius) * det.radiusScale;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Expanding shockwave ring — element-tinted, fades as it grows.
    if (det.alpha > 0.001 && r > 1) {
        ctx.globalAlpha = det.alpha;
        ctx.strokeStyle = det.color;
        ctx.lineWidth = Math.max(2, refRadius * 0.04 * det.alpha + 2);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
        // A fainter trailing ring inside it for depth.
        ctx.globalAlpha = det.alpha * 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 0.7, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Detonation flash — a bright radial bloom that spikes on each blow-out beat.
    if (det.flash > 0.001) {
        ctx.globalAlpha = det.flash;
        const flashR = Math.max(2, refRadius * (0.6 + 0.8 * det.flash));
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, flashR);
        grad.addColorStop(0, `rgba(255, 255, 255, ${det.flash})`);
        grad.addColorStop(0.4, det.color);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, flashR, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

/**
 * Engine-side hook — co-located with the boss-healthbar hook in the HUD draw
 * path. Scans the active enemy pool for a boss playing an intro or death
 * sequence and draws the corresponding FX. Tiny + no-op when nothing is active.
 *
 * Called with `.call(engine)` from hud/status.js, alongside drawBossHealthbarHook.
 */
export function drawBossFxHook() {
    const pool = this.enemyPool;
    if (!pool || !pool.activeObjects) return;
    const now = Date.now();

    for (const e of pool.activeObjects) {
        if (!e || !e.isBoss) continue;

        // Intro name-card — full-screen, drawn while the intro plays (the boss
        // may still be warping in, so we do NOT gate on isDrawableBoss here).
        if (introFxActive(e)) {
            drawBossIntroFx(this.ctx, e, this.width, this.height, now);
        }

        // Death detonation — anchored on the boss's screen position. The boss
        // may be mid-death (inactive) so, again, no isDrawableBoss gate.
        if (deathFxActive(e)) {
            const cam = this.camera || { x: 0, y: 0 };
            const sx = (e.x || 0) - (cam.x || 0);
            const sy = (e.y || 0) - (cam.y || 0);
            const refRadius = Math.max(48, (e.size || 96) * 2.2);
            drawBossDeathFx(this.ctx, e, sx, sy, refRadius, now);
        }
    }
}
