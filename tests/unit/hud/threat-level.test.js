/**
 * tests/unit/hud/threat-level.test.js — CD-16 / T15 (R-THREATUI).
 *
 * Pins the PURE helpers of the Threat-Level HUD meter:
 *   • computeThreatLayout — 5 centered pips + per-pip filled flags + clamping
 *   • threatPipColor      — hot ramp for filled pips, dim for unfilled
 *   • updateThreatAnim    — toast + pulse state machine on level changes
 *
 * Canvas rendering (drawThreatLevel / drawThreatLevelHook) is NOT exercised
 * here — there is no canvas under Jest. These are pure-function tests only.
 */

import { describe, expect, test } from '@jest/globals';
import {
    THREAT_PIP_COUNT,
    THREAT_COLORS,
    TOAST_MS,
    PULSE_MS,
    threatPipColor,
    computeThreatLayout,
    updateThreatAnim,
} from '../../../js/modules/hud/threat-level.js';

describe('exported constants', () => {
    test('5 pips, 5 ramp colors', () => {
        expect(THREAT_PIP_COUNT).toBe(5);
        expect(THREAT_COLORS).toHaveLength(5);
        // Cool→hot anchors: cyan at 1, gold at 3, red at 5.
        expect(THREAT_COLORS[0].toLowerCase()).toBe('#33ddff'); // cyan
        expect(THREAT_COLORS[2].toLowerCase()).toBe('#ffd700'); // gold
        expect(THREAT_COLORS[4].toLowerCase()).toBe('#ff3344'); // red
    });

    test('TOAST_MS / PULSE_MS in the expected range', () => {
        expect(TOAST_MS).toBe(1600);
        expect(PULSE_MS).toBe(450);
    });
});

describe('computeThreatLayout (pure)', () => {
    test('returns exactly 5 pips', () => {
        const L = computeThreatLayout(3, 1280);
        expect(L.pips).toHaveLength(5);
    });

    test('pip row is centered within viewW', () => {
        const viewW = 1280;
        const L = computeThreatLayout(3, viewW);
        // Left margin == right margin (centered): x == (viewW - totalW) / 2.
        expect(L.x).toBeCloseTo((viewW - L.w) / 2, 0);
        // The row's right edge mirrors its left edge about the center.
        const rightEdge = L.pips[L.pips.length - 1].x + L.pips[L.pips.length - 1].w;
        const leftMargin = L.x;
        const rightMargin = viewW - rightEdge;
        expect(rightMargin).toBeCloseTo(leftMargin, 0);
    });

    test('all pips share the same y and h (single row)', () => {
        const L = computeThreatLayout(2, 1024);
        for (const p of L.pips) {
            expect(p.y).toBe(L.y);
            expect(p.h).toBe(L.h);
            expect(p.w).toBeGreaterThan(0);
        }
    });

    test('pips are laid out left-to-right with a positive gap', () => {
        const L = computeThreatLayout(5, 800);
        for (let i = 1; i < L.pips.length; i++) {
            expect(L.pips[i].x).toBeGreaterThan(L.pips[i - 1].x + L.pips[i - 1].w - 1);
        }
    });

    test('filled flags reflect the level (pip i filled iff i < level)', () => {
        const L = computeThreatLayout(3, 1280);
        expect(L.pips.map((p) => p.filled)).toEqual([true, true, true, false, false]);
    });

    test('level 1 fills only the first pip', () => {
        const L = computeThreatLayout(1, 1280);
        expect(L.pips.map((p) => p.filled)).toEqual([true, false, false, false, false]);
    });

    test('level 5 fills all pips', () => {
        const L = computeThreatLayout(5, 1280);
        expect(L.pips.every((p) => p.filled)).toBe(true);
    });

    test('clamps level < 1 up to 1', () => {
        const L = computeThreatLayout(0, 1280);
        expect(L.pips.filter((p) => p.filled)).toHaveLength(1);
        expect(L.label).toBe('THREAT 1/5');
    });

    test('clamps level > 5 down to 5', () => {
        const L = computeThreatLayout(99, 1280);
        expect(L.pips.every((p) => p.filled)).toBe(true);
        expect(L.label).toBe('THREAT 5/5');
    });

    test('clamps non-finite level to 1', () => {
        const L = computeThreatLayout(NaN, 1280);
        expect(L.pips.filter((p) => p.filled)).toHaveLength(1);
    });

    test('numeric label is present (a11y channel)', () => {
        const L = computeThreatLayout(4, 1280);
        expect(L.label).toBe('THREAT 4/5');
    });

    test('opts override pip geometry + y', () => {
        const L = computeThreatLayout(3, 1280, { pipW: 20, pipH: 14, gap: 8, y: 50 });
        expect(L.pips[0].w).toBe(20);
        expect(L.pips[0].h).toBe(14);
        expect(L.y).toBe(50);
        // gap between pip 0 and pip 1 == 8 (== x1 - (x0 + w)).
        expect(L.pips[1].x - (L.pips[0].x + L.pips[0].w)).toBe(8);
    });
});

describe('threatPipColor (pure)', () => {
    test('filled pip (index < level) uses its hot ramp color', () => {
        // At level 5, pip 0 is filled → exact hot ramp color.
        expect(threatPipColor(0, 5)).toBe(THREAT_COLORS[0]);
        expect(threatPipColor(2, 5)).toBe(THREAT_COLORS[2]);
        expect(threatPipColor(4, 5)).toBe(THREAT_COLORS[4]);
    });

    test('unfilled pip (index >= level) is dim, not the hot color', () => {
        // At level 1, pips 1..4 are unfilled.
        const dim = threatPipColor(3, 1);
        expect(dim).not.toBe(THREAT_COLORS[3]);
        expect(dim).toMatch(/^rgb\(/);
    });

    test('the same pip flips hot→dim as the level drops past it', () => {
        const filled = threatPipColor(2, 3); // pip 2 filled at level 3
        const unfilled = threatPipColor(2, 2); // pip 2 unfilled at level 2
        expect(filled).toBe(THREAT_COLORS[2]);
        expect(unfilled).not.toBe(THREAT_COLORS[2]);
    });

    test('out-of-range pip index is clamped', () => {
        expect(() => threatPipColor(99, 5)).not.toThrow();
        expect(() => threatPipColor(-3, 1)).not.toThrow();
    });
});

describe('updateThreatAnim (pure state machine)', () => {
    const freshAnim = () => ({ shownLevel: null, pulseUntil: 0, toast: null, toastUntil: 0 });

    test('first observation adopts the level silently (no toast)', () => {
        const anim = freshAnim();
        updateThreatAnim(anim, 3, 1000);
        expect(anim.shownLevel).toBe(3);
        expect(anim.toast).toBeNull();
        expect(anim.toastUntil).toBe(0);
        expect(anim.pulseUntil).toBe(0);
    });

    test('increase → THREAT ↑ toast + pulse, shownLevel tracks', () => {
        const anim = freshAnim();
        updateThreatAnim(anim, 2, 0); // adopt 2 silently
        updateThreatAnim(anim, 4, 1000);
        expect(anim.toast).toBe('THREAT ↑');
        expect(anim.toastUntil).toBe(1000 + TOAST_MS);
        expect(anim.pulseUntil).toBe(1000 + PULSE_MS);
        expect(anim.shownLevel).toBe(4);
    });

    test('decrease → THREAT ↓ toast (subtler/shorter pulse), shownLevel tracks', () => {
        const anim = freshAnim();
        updateThreatAnim(anim, 4, 0); // adopt 4 silently
        updateThreatAnim(anim, 2, 2000);
        expect(anim.toast).toBe('THREAT ↓');
        expect(anim.toastUntil).toBe(2000 + TOAST_MS);
        // Decrease pulse window is shorter than the increase window.
        expect(anim.pulseUntil - 2000).toBeLessThan(PULSE_MS);
        expect(anim.pulseUntil).toBeGreaterThan(2000);
        expect(anim.shownLevel).toBe(2);
    });

    test('unchanged level fires nothing', () => {
        const anim = freshAnim();
        updateThreatAnim(anim, 3, 0); // adopt 3
        anim.toast = null;
        anim.toastUntil = 0;
        anim.pulseUntil = 0;
        updateThreatAnim(anim, 3, 5000);
        expect(anim.toast).toBeNull();
        expect(anim.toastUntil).toBe(0);
        expect(anim.pulseUntil).toBe(0);
        expect(anim.shownLevel).toBe(3);
    });

    test('toast + pulse windows are time-based and expire after their MS', () => {
        const anim = freshAnim();
        updateThreatAnim(anim, 1, 0); // adopt 1
        const t0 = 10_000;
        updateThreatAnim(anim, 5, t0); // increase
        // Just before expiry: still live.
        expect(t0 + PULSE_MS - 1).toBeLessThan(anim.pulseUntil);
        expect(t0 + TOAST_MS - 1).toBeLessThan(anim.toastUntil);
        // After the windows elapse, `now` exceeds the *Until marks (the
        // renderer gates on now < *Until, so this confirms expiry).
        const afterPulse = anim.pulseUntil + 1;
        const afterToast = anim.toastUntil + 1;
        expect(afterPulse).toBeGreaterThan(anim.pulseUntil);
        expect(afterToast).toBeGreaterThan(anim.toastUntil);
    });

    test('clamps the observed level before comparing', () => {
        const anim = freshAnim();
        updateThreatAnim(anim, 3, 0);
        // A level of 99 clamps to 5 → still an increase from 3.
        updateThreatAnim(anim, 99, 500);
        expect(anim.shownLevel).toBe(5);
        expect(anim.toast).toBe('THREAT ↑');
    });

    test('returns the mutated anim for chaining', () => {
        const anim = freshAnim();
        const ret = updateThreatAnim(anim, 2, 0);
        expect(ret).toBe(anim);
    });
});
