/**
 * tests/unit/cd-resonant-surge.test.js — RESONANT_SURGE energy-synergy powerup.
 *
 * Pins:
 *   • the RESONANT_SURGE_ENERGY constant (=== 6)
 *   • the POWERUP_TYPES['RESONANT_SURGE'] entry (energy/offense, bolt icon, desc)
 *   • the gated, new-application-only grant in the 5 status applicators
 *     (applyBurn / applyCorrode / applyChill / applyConduct / applyMark):
 *       - holder + NEW status → addEnergy(+6) fires once
 *       - holder + RE-apply on an already-afflicted enemy → NO grant (no spam)
 *       - no powerup → NO grant (DEFAULT-SAFE)
 *
 * The applicators are exported plain functions; their `this` is the engine/combat
 * context. We drive them via `.call(ctx)` with a fake player exposing
 * getPowerupStacks + addEnergy (mirroring how the E3 suite calls them with CTX).
 */

// Browser shims — combat-manager pulls in modules that touch window/navigator
// at import time.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
}

import { describe, expect, test, beforeEach } from '@jest/globals';
import {
    applyBurn, applyCorrode, applyChill, applyConduct, applyMark,
} from '../../js/modules/combat/combat-manager.js';
import { frameClock } from '../../js/modules/core/frame-clock.js';
import { RESONANT_SURGE_ENERGY } from '../../js/modules/core/constants.js';
import { POWERUP_TYPES } from '../../js/modules/world/powerup.js';

function mkEnemy(extra = {}) {
    return {
        active: true, health: 100, maxHealth: 100, resist: {},
        brnStacks: 0, brnUntil: 0, brnTickAt: 0, brnSourceDmg: 0,
        corrodeStacks: 0, corrodeUntil: 0, chillUntil: 0, freezeUntil: 0,
        conductUntil: 0, oilUntil: 0, markUntil: 0,
        ...extra,
    };
}

// Fake engine/combat context with a player that holds (or doesn't hold) the
// powerup. addEnergy just accumulates so we can read the granted total.
function mkCtx({ held = true } = {}) {
    const player = {
        energy: 0,
        getPowerupStacks: (type) => (held && type === 'RESONANT_SURGE' ? 1 : 0),
        addEnergy(amount) { this.energy += amount; },
    };
    return { player };
}

beforeEach(() => { frameClock.now = 10000; });

describe('RESONANT_SURGE — constant + powerup entry', () => {
    test('RESONANT_SURGE_ENERGY === 6', () => {
        expect(RESONANT_SURGE_ENERGY).toBe(6);
    });

    test('POWERUP_TYPES.RESONANT_SURGE entry exists, energy/offense, bolt icon', () => {
        const e = POWERUP_TYPES.RESONANT_SURGE;
        expect(e).toBeDefined();
        expect(e.category).toBe('OFFENSE');
        expect(e.icon).toBe('bolt');
        expect(e.effect).toBe('resonantSurge');
        expect(e.maxStacks).toBe(1);
        expect(typeof e.description).toBe('string');
        expect(e.description).toMatch(/\+6 energy/);
    });
});

describe('RESONANT_SURGE — gated grant on NEW status application', () => {
    // ── applyBurn ───────────────────────────────────────────────────────────
    test('applyBurn: holder + fresh burn grants +6 once', () => {
        const ctx = mkCtx({ held: true });
        const e = mkEnemy();
        applyBurn.call(ctx, e, 10);
        expect(ctx.player.energy).toBe(RESONANT_SURGE_ENERGY); // 6
    });

    test('applyBurn: re-apply on an already-burning enemy does NOT grant again', () => {
        const ctx = mkCtx({ held: true });
        const e = mkEnemy();
        applyBurn.call(ctx, e, 10);                 // new → +6
        expect(ctx.player.energy).toBe(6);
        applyBurn.call(ctx, e, 10);                 // re-proc while burning → no grant
        applyBurn.call(ctx, e, 10);
        expect(ctx.player.energy).toBe(6);          // still 6 — no spam
    });

    test('applyBurn: no powerup → no grant (DEFAULT-SAFE)', () => {
        const ctx = mkCtx({ held: false });
        const e = mkEnemy();
        applyBurn.call(ctx, e, 10);
        expect(ctx.player.energy).toBe(0);
    });

    test('applyBurn: a NEW burn after the prior one expired grants again', () => {
        const ctx = mkCtx({ held: true });
        const e = mkEnemy();
        applyBurn.call(ctx, e, 10);                 // +6
        frameClock.now = 99999;                     // let the burn window expire
        applyBurn.call(ctx, e, 10);                 // fresh again → +6
        expect(ctx.player.energy).toBe(12);
    });

    // ── applyCorrode ──────────────────────────────────────────────────────
    test('applyCorrode: fresh grants once, re-apply does not, no-powerup safe', () => {
        const held = mkCtx({ held: true });
        const e = mkEnemy();
        applyCorrode.call(held, e);                 // new → +6
        applyCorrode.call(held, e);                 // re-apply → no grant
        expect(held.player.energy).toBe(6);

        const none = mkCtx({ held: false });
        applyCorrode.call(none, mkEnemy());
        expect(none.player.energy).toBe(0);
    });

    // ── applyChill ────────────────────────────────────────────────────────
    test('applyChill: fresh grants once, re-apply does not, no-powerup safe', () => {
        const held = mkCtx({ held: true });
        const e = mkEnemy();
        applyChill.call(held, e);                   // new → +6
        applyChill.call(held, e);                   // re-apply → no grant
        expect(held.player.energy).toBe(6);

        const none = mkCtx({ held: false });
        applyChill.call(none, mkEnemy());
        expect(none.player.energy).toBe(0);
    });

    // ── applyConduct ──────────────────────────────────────────────────────
    test('applyConduct: fresh grants once, re-apply does not, no-powerup safe', () => {
        const held = mkCtx({ held: true });
        const e = mkEnemy();
        applyConduct.call(held, e);                 // new → +6
        applyConduct.call(held, e);                 // re-apply → no grant
        expect(held.player.energy).toBe(6);

        const none = mkCtx({ held: false });
        applyConduct.call(none, mkEnemy());
        expect(none.player.energy).toBe(0);
    });

    // ── applyMark ─────────────────────────────────────────────────────────
    test('applyMark: fresh grants once, re-apply does not, no-powerup safe', () => {
        const held = mkCtx({ held: true });
        const e = mkEnemy();
        applyMark.call(held, e);                    // new → +6
        applyMark.call(held, e);                    // re-apply → no grant
        expect(held.player.energy).toBe(6);

        const none = mkCtx({ held: false });
        applyMark.call(none, mkEnemy());
        expect(none.player.energy).toBe(0);
    });

    // ── guard: missing player ────────────────────────────────────────────
    test('all applicators: missing player context → no throw, no-op grant', () => {
        const e = mkEnemy();
        expect(() => {
            applyBurn.call({}, e, 10);
            applyCorrode.call({}, mkEnemy());
            applyChill.call({}, mkEnemy());
            applyConduct.call({}, mkEnemy());
            applyMark.call({}, mkEnemy());
        }).not.toThrow();
    });
});
