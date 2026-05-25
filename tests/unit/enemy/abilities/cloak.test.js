// SYS-5 / ENMY-03 — cloak / invisibility helper tests.
//
// Pure helper driven with an explicit `now`, mirroring the support-aura /
// boss-phases helper tests: an enemy runs an alternating visible↔cloaked cycle,
// skips render + drops targetability while cloaked, and is revealed by MARK or
// an AoE reveal stamp. Covers cycle timing, the non-mutating read, the fade
// alpha endpoints, targetability flips, and force-reveal.
import { describe, expect, test } from '@jest/globals';
import {
    createCloak,
    tickCloak,
    isCloaked,
    cloakAlpha,
    isTargetable,
    revealCloak,
    CLOAK_DEFAULTS,
    FADE_MS,
} from '../../../../js/modules/enemy/abilities/cloak.js';

describe('cloak — createCloak', () => {
    test('uses CLOAK_DEFAULTS when no opts given', () => {
        const s = createCloak();
        expect(s.visibleMs).toBe(CLOAK_DEFAULTS.visibleMs);
        expect(s.cloakedMs).toBe(CLOAK_DEFAULTS.cloakedMs);
        expect(s.cycleStart).toBeNull();
        expect(s.cloaked).toBe(false);
    });

    test('honors overrides', () => {
        const s = createCloak({ visibleMs: 500, cloakedMs: 800 });
        expect(s.visibleMs).toBe(500);
        expect(s.cloakedMs).toBe(800);
    });

    test('partial override falls back to default for the other field', () => {
        const s = createCloak({ visibleMs: 300 });
        expect(s.visibleMs).toBe(300);
        expect(s.cloakedMs).toBe(CLOAK_DEFAULTS.cloakedMs);
    });
});

describe('cloak — tickCloak cycle timing', () => {
    test('initializes cycleStart on first tick when unset', () => {
        const s = createCloak({ visibleMs: 1000, cloakedMs: 2000 });
        expect(s.cycleStart).toBeNull();
        tickCloak(s, 5000);
        expect(s.cycleStart).toBe(5000);
    });

    test('walks visible → cloaked → visible across a full period', () => {
        const s = createCloak({ visibleMs: 1000, cloakedMs: 2000 });
        const t0 = 10_000;
        tickCloak(s, t0); // first tick anchors cycleStart at t0

        // Visible window [0, 1000).
        expect(tickCloak(s, t0 + 0)).toBe(false);
        expect(tickCloak(s, t0 + 999)).toBe(false);
        // Cloaked window [1000, 3000).
        expect(tickCloak(s, t0 + 1000)).toBe(true);
        expect(tickCloak(s, t0 + 2999)).toBe(true);
        // Back to visible at the start of the next period.
        expect(tickCloak(s, t0 + 3000)).toBe(false);
        expect(tickCloak(s, t0 + 3500)).toBe(false);
        // Cloaked again in the next period.
        expect(tickCloak(s, t0 + 4000)).toBe(true);
    });

    test('records current cloaked-ness on state.cloaked', () => {
        const s = createCloak({ visibleMs: 1000, cloakedMs: 2000 });
        tickCloak(s, 0);
        expect(s.cloaked).toBe(false);
        tickCloak(s, 1500);
        expect(s.cloaked).toBe(true);
    });
});

describe('cloak — isCloaked (non-mutating)', () => {
    test('matches tickCloak across a period without mutating state', () => {
        const s = createCloak({ visibleMs: 1000, cloakedMs: 2000 });
        s.cycleStart = 0; // anchor explicitly so isCloaked is fully deterministic
        const snapshot = { ...s };
        for (const t of [0, 500, 999, 1000, 1500, 2999, 3000, 4000]) {
            expect(isCloaked(s, t)).toBe(tickCloak({ ...s }, t));
        }
        // isCloaked must not have mutated the original state.
        expect(s).toEqual(snapshot);
    });
});

describe('cloak — cloakAlpha fade', () => {
    const s = createCloak({ visibleMs: 1000, cloakedMs: 2000 });
    s.cycleStart = 0;
    const period = s.visibleMs + s.cloakedMs; // 3000

    test('== 1 mid-visible', () => {
        expect(cloakAlpha(s, 400)).toBe(1);
    });

    test('== 0 mid-cloaked', () => {
        expect(cloakAlpha(s, 2000)).toBe(0);
    });

    test('fades out across FADE_MS before the visible→cloaked boundary', () => {
        // Boundary at t=1000; fade window is (1000-FADE_MS, 1000).
        expect(cloakAlpha(s, 1000 - FADE_MS)).toBe(1); // window edge still fully visible
        expect(cloakAlpha(s, 1000 - FADE_MS / 2)).toBeCloseTo(0.5, 5);
        // Just before the boundary alpha is near 0.
        expect(cloakAlpha(s, 1000 - 1)).toBeCloseTo(1 / FADE_MS, 5);
    });

    test('fades back in across FADE_MS before the end of the period', () => {
        // Period ends at t=3000 (= next visible). Fade window (3000-FADE_MS, 3000).
        expect(cloakAlpha(s, period - FADE_MS)).toBe(0); // still fully cloaked at the edge
        expect(cloakAlpha(s, period - FADE_MS / 2)).toBeCloseTo(0.5, 5);
        expect(cloakAlpha(s, period - 1)).toBeCloseTo((FADE_MS - 1) / FADE_MS, 5);
    });

    test('alpha stays within [0,1]', () => {
        for (let t = 0; t <= period; t += 37) {
            const a = cloakAlpha(s, t);
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(1);
        }
    });
});

describe('cloak — isTargetable', () => {
    const cfg = () => {
        const c = createCloak({ visibleMs: 1000, cloakedMs: 2000 });
        c.cycleStart = 0;
        return c;
    };

    test('no cloak config → always targetable', () => {
        expect(isTargetable({}, 9999)).toBe(true);
    });

    test('visible → targetable', () => {
        const enemy = { cloak: cfg() };
        expect(isCloaked(enemy.cloak, 500)).toBe(false);
        expect(isTargetable(enemy, 500)).toBe(true);
    });

    test('cloaked → NOT targetable', () => {
        const enemy = { cloak: cfg() };
        expect(isCloaked(enemy.cloak, 1500)).toBe(true);
        expect(isTargetable(enemy, 1500)).toBe(false);
    });

    test('cloaked + marked flag → targetable (MARK reveals)', () => {
        const enemy = { cloak: cfg(), marked: true };
        expect(isTargetable(enemy, 1500)).toBe(true);
    });

    test('cloaked + _markUntil > now → targetable', () => {
        const enemy = { cloak: cfg(), _markUntil: 2000 };
        expect(isTargetable(enemy, 1500)).toBe(true);
        // Once the mark lapses, it's untargetable again.
        expect(isTargetable(enemy, 2500)).toBe(false);
    });

    test('cloaked + _revealedUntil > now → targetable (AoE reveal)', () => {
        const enemy = { cloak: cfg(), _revealedUntil: 2000 };
        expect(isTargetable(enemy, 1500)).toBe(true);
        expect(isTargetable(enemy, 2500)).toBe(false);
    });

    test('null enemy → not targetable', () => {
        expect(isTargetable(null, 0)).toBe(false);
    });
});

describe('cloak — revealCloak', () => {
    test('stamps _revealedUntil = now + durationMs and returns it', () => {
        const enemy = {};
        const until = revealCloak(null, enemy, 1000, 600);
        expect(until).toBe(1600);
        expect(enemy._revealedUntil).toBe(1600);
    });

    test('flips a cloaked enemy to targetable for the reveal window', () => {
        const enemy = { cloak: createCloak({ visibleMs: 1000, cloakedMs: 2000 }) };
        enemy.cloak.cycleStart = 0;
        // Cloaked at t=1500, not yet revealed → untargetable.
        expect(isTargetable(enemy, 1500)).toBe(false);
        revealCloak(enemy.cloak, enemy, 1500, 800); // reveal until 2300
        expect(isTargetable(enemy, 1500)).toBe(true);
        expect(isTargetable(enemy, 2200)).toBe(true);
        // After the reveal lapses, back to untargetable (still cloaked at 2400).
        expect(isCloaked(enemy.cloak, 2400)).toBe(true);
        expect(isTargetable(enemy, 2400)).toBe(false);
    });
});
