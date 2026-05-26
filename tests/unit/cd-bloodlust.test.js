// CD-11 — BLOODLUST (no-downside, passive-gated). Each enemy kill grants a stack
// of Bloodlust; stacks give +4% outgoing damage each (cap +40% at 10 stacks) and
// decay (one stack lost per BLOODLUST_DECAY_MS without a kill). The offensive
// complement to BLOODSHIELD. Headline guarantee is DEFAULT-SAFE: a player without
// the passive / with 0 stacks deals damage byte-for-byte as before — bloodlustMult
// returns ×1 at 0 stacks and the on-kill gain is gated on hasPassive('BLOODLUST').
// These tests isolate the pure curve + the stack/decay model:
//   • bloodlustMult — the pure stacks→multiplier curve (used on-demand at the hook)
//   • the kill-gain clamp (mirrors combat-manager.onEnemyKill)
//   • the per-interval decay (mirrors player.update)
import { describe, expect, test } from '@jest/globals';
import { bloodlustMult } from '../../js/modules/combat/collision-system.js';
import {
    BLOODLUST_MAX_STACKS,
    BLOODLUST_PER_STACK,
    BLOODLUST_DECAY_MS,
} from '../../js/modules/core/constants.js';

// ── Pure stacks → multiplier curve ───────────────────────────────────────────
describe('CD-11 — bloodlustMult (count → multiplier curve)', () => {
    test('0 stacks → ×1 (DEFAULT-SAFE)', () => {
        expect(bloodlustMult(0)).toBe(1);
    });

    test('+4% per stack', () => {
        expect(bloodlustMult(1)).toBeCloseTo(1 + BLOODLUST_PER_STACK, 5);
        expect(bloodlustMult(5)).toBeCloseTo(1 + 5 * BLOODLUST_PER_STACK, 5);
    });

    test('caps at +40% (10 stacks)', () => {
        expect(bloodlustMult(BLOODLUST_MAX_STACKS))
            .toBeCloseTo(1 + BLOODLUST_MAX_STACKS * BLOODLUST_PER_STACK, 5);
        expect(bloodlustMult(BLOODLUST_MAX_STACKS)).toBeCloseTo(1.4, 5);
    });

    test('clamps past the max stack ceiling', () => {
        expect(bloodlustMult(50)).toBeCloseTo(1.4, 5);
        expect(bloodlustMult(BLOODLUST_MAX_STACKS + 7)).toBe(bloodlustMult(BLOODLUST_MAX_STACKS));
    });

    test('negative / garbage count clamps to ×1', () => {
        expect(bloodlustMult(-3)).toBe(1);
        expect(bloodlustMult(undefined)).toBe(1); // (undefined | 0) === 0
    });
});

// ── Kill gain (mirrors combat-manager.onEnemyKill) ───────────────────────────
describe('CD-11 — on-kill stack gain (clamped to the cap)', () => {
    // The exact gain step from onEnemyKill: +1 stack, clamped to the ceiling.
    function gainStep(p) {
        p.bloodlustStacks = Math.min(BLOODLUST_MAX_STACKS, (p.bloodlustStacks || 0) + 1);
    }

    test('each kill grants one stack', () => {
        const p = { bloodlustStacks: 0 };
        gainStep(p); expect(p.bloodlustStacks).toBe(1);
        gainStep(p); expect(p.bloodlustStacks).toBe(2);
    });

    test('never exceeds BLOODLUST_MAX_STACKS', () => {
        const p = { bloodlustStacks: BLOODLUST_MAX_STACKS - 1 };
        gainStep(p); expect(p.bloodlustStacks).toBe(BLOODLUST_MAX_STACKS);
        gainStep(p); expect(p.bloodlustStacks).toBe(BLOODLUST_MAX_STACKS); // clamped
    });
});

// ── Decay (mirrors player.update) ────────────────────────────────────────────
describe('CD-11 — stack decay: one stack per interval, floors at 0', () => {
    // Minimal stand-in for the update() decay block (mirrors player.js): shed one
    // stack per BLOODLUST_DECAY_MS elapsed since the last kill, advancing the
    // timestamp by one interval per shed, down to 0.
    function decayStep(p, eNow, dtMs) {
        if (p.bloodlustStacks > 0 && dtMs > 0) {
            let last = p._bloodlustRefreshMs || 0;
            while (p.bloodlustStacks > 0 && eNow - last >= BLOODLUST_DECAY_MS) {
                p.bloodlustStacks--;
                last += BLOODLUST_DECAY_MS;
            }
            p._bloodlustRefreshMs = last;
        }
    }

    test('no decay within the interval since the last kill', () => {
        const p = { bloodlustStacks: 5, _bloodlustRefreshMs: 0 };
        decayStep(p, BLOODLUST_DECAY_MS - 1, 16);
        expect(p.bloodlustStacks).toBe(5);
    });

    test('sheds one stack per interval elapsed', () => {
        const p = { bloodlustStacks: 5, _bloodlustRefreshMs: 0 };
        decayStep(p, BLOODLUST_DECAY_MS, 16);
        expect(p.bloodlustStacks).toBe(4);
    });

    test('a long frame gap sheds multiple but never over-drains', () => {
        const p = { bloodlustStacks: 3, _bloodlustRefreshMs: 0 };
        decayStep(p, BLOODLUST_DECAY_MS * 10, 16); // 10 intervals, only 3 stacks
        expect(p.bloodlustStacks).toBe(0);
    });

    test('empty stack count is a no-op (no negative drift)', () => {
        const p = { bloodlustStacks: 0, _bloodlustRefreshMs: 0 };
        decayStep(p, BLOODLUST_DECAY_MS * 5, 16);
        expect(p.bloodlustStacks).toBe(0);
    });

    test('dtMs <= 0 (paused / tab-gap) does not decay', () => {
        const p = { bloodlustStacks: 4, _bloodlustRefreshMs: 0 };
        decayStep(p, BLOODLUST_DECAY_MS * 5, 0);
        expect(p.bloodlustStacks).toBe(4);
    });
});

// ── Default-safe integration sanity ──────────────────────────────────────────
describe('CD-11 — DEFAULT-SAFE damage multiplier', () => {
    test('0 stacks → no damage change at the hook', () => {
        const dmg = 100;
        expect(dmg * bloodlustMult(0)).toBe(dmg);
    });

    test('full stacks scale damage by exactly 1 + MAX × PER', () => {
        const dmg = 100;
        expect(dmg * bloodlustMult(BLOODLUST_MAX_STACKS))
            .toBeCloseTo(dmg * (1 + BLOODLUST_MAX_STACKS * BLOODLUST_PER_STACK), 5);
    });
});
