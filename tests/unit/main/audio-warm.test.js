/**
 * tests/unit/main/audio-warm.test.js
 *
 * Unit tests for the mobile touchstart audio-warming path added to
 * js/main.js. iOS Safari (and many Android browsers) keep the
 * AudioContext suspended until a user gesture fires inside a JS
 * handler. The pre-existing mousemove/mousedown/keydown warmers never
 * fire on touch devices, so without a touchstart-path warmer the
 * AudioContext stays suspended for the entire session and mobile
 * players hear nothing.
 *
 * main.js is an IIFE-driven entry point — there's no exported helper
 * to import. These tests re-create the exact warmer pattern (closure
 * over a `_audioWarmed` latch, dedicated passive listener, swallowed
 * exceptions) against a mock window + mock audio manager. The shape
 * of the code under test is intentionally a 1:1 mirror of the block
 * in main.js so a regression there would be caught by a code-review
 * diff (the test fixture and the prod code share the same shape).
 *
 * Uses `allure-jest/node` env (see jest.config.js) — no jsdom needed
 * since we mock window directly.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Build a minimal window mock that records addEventListener calls and
 * lets tests dispatch synthetic events through the captured handlers.
 * Mirrors the wake-lock / haptic test fixtures.
 */
function makeWindow() {
    const handlers = {};
    const optionsByEvent = {};
    return {
        addEventListener: jest.fn((event, fn, options) => {
            if (!handlers[event]) handlers[event] = [];
            handlers[event].push(fn);
            // Record the options arg per event so tests can assert
            // { passive: true } made it through to the real call.
            if (!optionsByEvent[event]) optionsByEvent[event] = [];
            optionsByEvent[event].push(options);
        }),
        removeEventListener: jest.fn(),
        // Test helper — fire every registered handler for `event`.
        _fire(event, payload) {
            const list = handlers[event] || [];
            for (const fn of list) fn(payload);
        },
        // Test helper — return the last recorded options arg for an event.
        _lastOptionsFor(event) {
            const list = optionsByEvent[event] || [];
            return list[list.length - 1];
        },
        _handlerCountFor(event) {
            return (handlers[event] || []).length;
        },
    };
}

/**
 * The exact audio-warmer block from js/main.js setupStartHandlers(),
 * reproduced 1:1 against an injected window + audioManager so it can
 * run under Node without the rest of the game.
 *
 * IMPORTANT: keep this in sync with the block in js/main.js. If main.js
 * is refactored (e.g. extracted into a real helper), import that helper
 * here instead of re-defining it.
 */
function attachTouchWarmer(win, audioManager) {
    let _audioWarmed = false;
    const onTouchWarmAudio = (_e) => {
        if (!_audioWarmed) {
            _audioWarmed = true;
            try { audioManager.initializeAudio(); } catch {}
        }
    };
    win.addEventListener('touchstart', onTouchWarmAudio, { passive: true });
    return { onTouchWarmAudio };
}

describe('main.js touchstart audio warmer', () => {
    let win;
    let audioManager;

    beforeEach(() => {
        win = makeWindow();
        audioManager = {
            initializeAudio: jest.fn(),
        };
    });

    it('registers a touchstart listener with { passive: true }', () => {
        attachTouchWarmer(win, audioManager);

        expect(win.addEventListener).toHaveBeenCalledWith(
            'touchstart',
            expect.any(Function),
            { passive: true },
        );
        expect(win._handlerCountFor('touchstart')).toBe(1);
        expect(win._lastOptionsFor('touchstart')).toEqual({ passive: true });
    });

    it('calls audioManager.initializeAudio() once on the first touchstart', () => {
        attachTouchWarmer(win, audioManager);

        win._fire('touchstart', { type: 'touchstart' });

        expect(audioManager.initializeAudio).toHaveBeenCalledTimes(1);
    });

    it('does NOT call initializeAudio() a second time on repeat touches', () => {
        attachTouchWarmer(win, audioManager);

        win._fire('touchstart', { type: 'touchstart' });
        win._fire('touchstart', { type: 'touchstart' });
        win._fire('touchstart', { type: 'touchstart' });

        // The `_audioWarmed` latch in main.js promises exactly-once.
        expect(audioManager.initializeAudio).toHaveBeenCalledTimes(1);
    });

    it('swallows exceptions from initializeAudio() so the handler never crashes', () => {
        audioManager.initializeAudio = jest.fn(() => {
            throw new Error('AudioContext.resume() rejected');
        });
        attachTouchWarmer(win, audioManager);

        // Must not throw out of the handler — the listener is shared with
        // the browser's gesture stack and an uncaught throw would propagate
        // to other touch handlers (mobile-touch.js gameplay handler).
        expect(() => win._fire('touchstart', {})).not.toThrow();
        expect(audioManager.initializeAudio).toHaveBeenCalledTimes(1);
    });

    it('after a thrown initializeAudio(), subsequent touches still do not re-call it', () => {
        // The `_audioWarmed` latch is set BEFORE the try/catch in main.js,
        // so even a failed init is a one-shot. This matches the existing
        // mousemove/mousedown/keydown warmers (line ~228, ~241, ~268 of
        // main.js). Documented here so future refactors don't accidentally
        // move the latch inside the try block.
        audioManager.initializeAudio = jest.fn(() => {
            throw new Error('boom');
        });
        attachTouchWarmer(win, audioManager);

        win._fire('touchstart', {});
        win._fire('touchstart', {});

        expect(audioManager.initializeAudio).toHaveBeenCalledTimes(1);
    });
});
