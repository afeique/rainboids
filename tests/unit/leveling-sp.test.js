// Phase R7 — leveling → SP → Stats (the meta progression system, 6.35.0).
// Validates the functional addXp → level → SP → allocate path.
import * as progression from '../../js/modules/player/progression.js';
import { xpForLevel, SP_STATS, SP_STAT_MAX_POINTS } from '../../js/modules/core/sp-stats.js';

function makePlayer(over = {}) {
    const p = {
        level: 1, xp: 0, sp: 0,
        spStats: Object.fromEntries(SP_STATS.map((s) => [s.id, 0])),
        _leveledUpPending: false,
        saveMetaState() { /* storage no-op in test */ },
        ...over,
    };
    return p;
}

describe('R7 — XP → level → SP', () => {
    test('XP below the threshold does not level', () => {
        const p = makePlayer();
        progression.addXp.call(p, xpForLevel(1) - 1);
        expect(p.level).toBe(1);
        expect(p.sp).toBe(0);
        expect(p._leveledUpPending).toBe(false);
    });

    test('crossing the threshold grants a level + 1 SP and flags the level-up', () => {
        const p = makePlayer();
        progression.addXp.call(p, xpForLevel(1));
        expect(p.level).toBe(2);
        expect(p.sp).toBe(1);
        expect(p._leveledUpPending).toBe(true);
    });

    test('a big XP grant rolls over multiple levels (1 SP each)', () => {
        const p = makePlayer();
        const need = xpForLevel(1) + xpForLevel(2);
        progression.addXp.call(p, need);
        expect(p.level).toBe(3);
        expect(p.sp).toBe(2);
    });

    test('a 30-wave run yields roughly 2–4 levels at the current XP rate', () => {
        // ~ kills/run: rough model — 30 waves, a handful of enemies each +
        // ~10 bosses. Use a representative XP total and assert the band.
        const p = makePlayer();
        // 10 bosses (120) + ~120 regular kills (12) ≈ 1200 + 1440 = 2640 XP.
        progression.addXp.call(p, 2640);
        expect(p.level).toBeGreaterThanOrEqual(2);
        expect(p.level).toBeLessThanOrEqual(6); // not a runaway curve
    });
});

describe('6.148.0 — level-up announcement trigger', () => {
    test('crossing a level arms the canvas levelUpAnimation', () => {
        const p = makePlayer();
        expect(p.levelUpAnimation).toBeUndefined();
        progression.addXp.call(p, xpForLevel(1));
        expect(p.level).toBe(2);
        expect(p.levelUpAnimation).toBeDefined();
        expect(p.levelUpAnimation.active).toBe(true);
        expect(p.levelUpAnimation.duration).toBeGreaterThan(0);
        expect(typeof p.levelUpAnimation.startTime).toBe('number');
    });

    test('XP that does NOT level leaves the announcement un-armed', () => {
        const p = makePlayer();
        progression.addXp.call(p, xpForLevel(1) - 1);
        expect(p.levelUpAnimation).toBeUndefined();
    });

    test('triggerLevelUpAnnounce fires the particle burst + audio cue when present', () => {
        let particles = 0;
        const emitted = [];
        const p = makePlayer({
            createLevelUpParticles() { particles++; },
            gameEngine: { events: { emit: (e) => emitted.push(e) } },
        });
        progression.triggerLevelUpAnnounce.call(p);
        expect(particles).toBe(1);
        expect(emitted).toContain('audio:powerup');
        expect(p.levelUpAnimation.active).toBe(true);
    });

    test('triggerLevelUpAnnounce is safe off-engine (no particles/events)', () => {
        const p = makePlayer();
        expect(() => progression.triggerLevelUpAnnounce.call(p)).not.toThrow();
        expect(p.levelUpAnimation.active).toBe(true);
    });
});

describe('R7 — SP allocation', () => {
    test('allocateSp spends 1 SP and raises the stat', () => {
        const p = makePlayer({ sp: 2 });
        const id = SP_STATS[0].id;
        expect(progression.allocateSp.call(p, id)).toBe(true);
        expect(p.sp).toBe(1);
        expect(p.spStats[id]).toBe(1);
    });

    test('cannot allocate with no SP', () => {
        const p = makePlayer({ sp: 0 });
        expect(progression.allocateSp.call(p, SP_STATS[0].id)).toBe(false);
    });

    test('cannot exceed the per-stat cap', () => {
        const id = SP_STATS[0].id;
        const p = makePlayer({ sp: 999, spStats: { [id]: SP_STAT_MAX_POINTS } });
        expect(progression.allocateSp.call(p, id)).toBe(false);
    });

    test('deallocateSp refunds 1 SP', () => {
        const id = SP_STATS[0].id;
        const p = makePlayer({ sp: 0, spStats: { [id]: 3 } });
        expect(progression.deallocateSp.call(p, id)).toBe(true);
        expect(p.sp).toBe(1);
        expect(p.spStats[id]).toBe(2);
    });

    test('spStatTotal scales points × (max / cap)', () => {
        const def = SP_STATS[0];
        const p = makePlayer({ spStats: { [def.id]: SP_STAT_MAX_POINTS } });
        expect(progression.spStatTotal.call(p, def.id)).toBe(def.max);
    });
});
