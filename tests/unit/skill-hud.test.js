/**
 * tests/unit/skill-hud.test.js — Phase B.S3 4-slot skill bar HUD smoke test.
 *
 * Canvas rendering can't be visually asserted in Jest, so this is a
 * SMOKE test: it drives `drawSkillSlotBar` (the exported 4-slot skill-bar
 * renderer in hud/status.js) with a mock 2D context whose every method is
 * a recording no-op, plus a mock player carrying the 4-slot skill model
 * (equippedSkills / skillCooldowns / skillCooldownsMax). It pins:
 *   - the render does not throw with a mix of filled + empty slots
 *   - it issues draw calls (fill/stroke/etc.) for the non-empty slots
 *   - the keybind labels 1–4 are emitted (one per slot, via fillText)
 *   - a slot mid-cooldown emits its remaining-seconds text
 *
 * We don't assert pixels — only that the contract (icon + label + cooldown
 * overlay path) is exercised against the 4-slot arrays as source of truth.
 */

// ── Browser shims — must happen before any game module import. ─────────
// Mirrors status-effects.test.js, plus a canvas/Path2D stub so the icon
// rasterizer (getIconImage → _rasterize) takes its synchronous Path2D
// branch instead of the async Blob/Image fallback (which would reference
// undefined globals in Node).
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' },
    };
}
function makeNoopCtx() {
    // Every method call is a no-op; settable props (fillStyle, etc.) just stick.
    return new Proxy({}, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return () => {};
        },
        set(target, prop, value) { target[prop] = value; return true; },
    });
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: (tag) => {
            if (tag === 'canvas') {
                return { width: 0, height: 0, style: {}, getContext: () => makeNoopCtx() };
            }
            return { getContext: () => ({}), style: {}, addEventListener: () => {} };
        },
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, maxTouchPoints: 0 };
}
if (typeof globalThis.Path2D === 'undefined') {
    // Minimal stub so _rasterize takes the synchronous draw path.
    globalThis.Path2D = function Path2D() {};
}

import { describe, expect, test, jest } from '@jest/globals';
import { drawSkillSlotBar } from '../../js/modules/hud/status.js';

// ── Recording mock 2D context ──────────────────────────────────────────
// Tracks fillText invocations + a few key method names so the smoke test
// can assert "draw calls happened" without inspecting pixels. Unknown
// methods auto-resolve to jest.fn() no-ops via the Proxy.
function makeRecordingCtx() {
    const calls = { fillText: [], strokeText: [], fillRect: [], fill: 0, stroke: 0, clip: 0, save: 0, restore: 0 };
    const fns = {
        fillText: jest.fn((txt) => { calls.fillText.push(String(txt)); }),
        strokeText: jest.fn((txt) => { calls.strokeText.push(String(txt)); }),
        fillRect: jest.fn((...a) => { calls.fillRect.push(a); }),
        fill: jest.fn(() => { calls.fill++; }),
        stroke: jest.fn(() => { calls.stroke++; }),
        clip: jest.fn(() => { calls.clip++; }),
        save: jest.fn(() => { calls.save++; }),
        restore: jest.fn(() => { calls.restore++; }),
        drawImage: jest.fn(),
    };
    const ctx = new Proxy(fns, {
        get(target, prop) {
            if (prop in target) return target[prop];
            // Settable props read back; unknown methods are no-op fns.
            if (typeof prop === 'string' && /^[a-z]/.test(prop) &&
                ['fillStyle', 'strokeStyle', 'lineWidth', 'lineJoin', 'lineCap',
                 'globalAlpha', 'font', 'textAlign', 'textBaseline', 'shadowColor',
                 'shadowBlur'].includes(prop)) {
                return target[prop];
            }
            return jest.fn();
        },
        set(target, prop, value) { target[prop] = value; return true; },
    });
    return { ctx, calls };
}

function makePlayer(overrides = {}) {
    return {
        equippedSkills: ['BULWARK', 'REPAIR_NANITES', null, null],
        skillCooldowns: [0, 5000, 0, 0],
        skillCooldownsMax: [20000, 25000, 0, 0],
        ...overrides,
    };
}

describe('B.S3 — 4-slot skill bar HUD render (drawSkillSlotBar)', () => {
    test('exports a callable renderer', () => {
        expect(typeof drawSkillSlotBar).toBe('function');
    });

    test('does not throw with a mix of filled + empty slots', () => {
        const { ctx } = makeRecordingCtx();
        const self = { player: makePlayer() };
        expect(() => drawSkillSlotBar.call(self, ctx, 36, 600)).not.toThrow();
    });

    test('issues draw calls for the non-empty slots (background + border fills/strokes)', () => {
        const { ctx, calls } = makeRecordingCtx();
        const self = { player: makePlayer() };
        drawSkillSlotBar.call(self, ctx, 36, 600);
        // Every slot fills its background panel (4 fills minimum); filled
        // slots add a colored border stroke; empty slots add a dim stroke.
        expect(calls.fill).toBeGreaterThanOrEqual(2);   // ≥ 2 non-empty backgrounds
        expect(calls.stroke).toBeGreaterThanOrEqual(2); // borders for both filled slots
    });

    test('emits a keybind label 1–4 for every slot', () => {
        const { ctx, calls } = makeRecordingCtx();
        const self = { player: makePlayer() };
        drawSkillSlotBar.call(self, ctx, 36, 600);
        // Keybind labels are drawn with fillText (and stroked behind).
        for (const key of ['1', '2', '3', '4']) {
            expect(calls.fillText).toContain(key);
        }
    });

    test('a slot mid-cooldown emits its remaining-seconds text', () => {
        const { ctx, calls } = makeRecordingCtx();
        // Slot 1 is at 5000ms remaining → ceil(5000/1000) = "5".
        const self = { player: makePlayer() };
        drawSkillSlotBar.call(self, ctx, 36, 600);
        expect(calls.clip).toBeGreaterThanOrEqual(1);     // cooldown overlay clip
        expect(calls.fillRect.length).toBeGreaterThanOrEqual(1); // overlay fill
        expect(calls.fillText).toContain('5');            // seconds readout
    });

    test('no cooldown text when all cooldowns are zero', () => {
        const { ctx, calls } = makeRecordingCtx();
        const self = { player: makePlayer({ skillCooldowns: [0, 0, 0, 0] }) };
        drawSkillSlotBar.call(self, ctx, 36, 600);
        // No clip/fillRect overlay should fire for ready skills.
        expect(calls.clip).toBe(0);
        expect(calls.fillRect.length).toBe(0);
    });

    test('safely no-ops when player is missing', () => {
        const { ctx, calls } = makeRecordingCtx();
        const self = { player: null };
        expect(() => drawSkillSlotBar.call(self, ctx, 36, 600)).not.toThrow();
        expect(calls.fill).toBe(0);
    });

    test('tolerates missing skill arrays (treats slots as empty)', () => {
        const { ctx, calls } = makeRecordingCtx();
        const self = { player: {} };
        expect(() => drawSkillSlotBar.call(self, ctx, 36, 600)).not.toThrow();
        // Four empty placeholders → four background fills, zero cooldown text.
        expect(calls.fill).toBe(4);
        expect(calls.clip).toBe(0);
    });
});
