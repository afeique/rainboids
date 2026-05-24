// Phase D.B0 — declarative boss phase-script runner.
//
// Pure, engine-agnostic: a boss carries an ordered `phaseScript`; the runner
// advances phases as their gates trip, fires each `onEnter` once and in order,
// and opens a transition invuln window so a phase shift can't be overkilled.
// Driven here with a stub boss + an explicit `now`, mirroring the boss-rage
// helper tests.
import { describe, expect, test } from '@jest/globals';
import {
    initBossPhases,
    updateBossPhases,
    phaseBlocksDamage,
    currentPhase,
    currentPhaseIndex,
    isFinalPhase,
    DEFAULT_TRANSITION_INVULN_MS,
} from '../../../js/modules/enemy/boss-phases.js';

const stubBoss = (maxHealth = 100) => ({
    isBoss: true, active: true, _deathFlash: 0, warping: false,
    health: maxHealth, maxHealth,
});

// 3-phase HP-gated script (1.0 → 0.66 → 0.33), logging onEnter order.
function hpScript(log) {
    return [
        { id: 'p0', name: 'Opening', onEnter: (b) => log.push(['p0', b.health]) },
        { id: 'p1', name: 'Mid', enterAtHpFraction: 0.66, onEnter: (b) => log.push(['p1', b.health]) },
        { id: 'p2', name: 'Enrage', enterAtHpFraction: 0.33, onEnter: (b) => log.push(['p2', b.health]) },
    ];
}

describe('boss-phases — init', () => {
    test('enters phase 0, fires its onEnter once, no transition invuln', () => {
        const log = []; const b = stubBoss();
        expect(initBossPhases(b, hpScript(log), null, 1000)).toBe(true);
        expect(currentPhaseIndex(b)).toBe(0);
        expect(currentPhase(b).id).toBe('p0');
        expect(log.map(e => e[0])).toEqual(['p0']);
        expect(phaseBlocksDamage(b, 1000)).toBe(false); // phase 0 = no invuln
    });

    test('a missing/empty script is a safe no-op', () => {
        const b = stubBoss();
        expect(initBossPhases(b, null)).toBe(false);
        expect(initBossPhases(b, [])).toBe(false);
        expect(currentPhase(b)).toBeNull();
        expect(currentPhaseIndex(b)).toBe(0);
        expect(() => updateBossPhases(b)).not.toThrow();
        expect(phaseBlocksDamage(b)).toBe(false);
    });
});

describe('boss-phases — advance + invuln', () => {
    test('crossing a gate enters the next phase once and opens an invuln window', () => {
        const log = []; const b = stubBoss(100);
        initBossPhases(b, hpScript(log), null, 0);
        b.health = 60; // ≤ 66% → phase 1
        updateBossPhases(b, null, 5000);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(log.map(e => e[0])).toEqual(['p0', 'p1']);
        // Transition invuln is open for DEFAULT_TRANSITION_INVULN_MS.
        expect(phaseBlocksDamage(b, 5000)).toBe(true);
        expect(phaseBlocksDamage(b, 5000 + DEFAULT_TRANSITION_INVULN_MS - 1)).toBe(true);
        expect(phaseBlocksDamage(b, 5000 + DEFAULT_TRANSITION_INVULN_MS + 1)).toBe(false);
    });

    test('onEnter is idempotent — staying in a phase does not re-fire it', () => {
        const log = []; const b = stubBoss(100);
        initBossPhases(b, hpScript(log), null, 0);
        b.health = 60;
        updateBossPhases(b, null, 1000);
        updateBossPhases(b, null, 1001);
        updateBossPhases(b, null, 1002);
        expect(log.map(e => e[0])).toEqual(['p0', 'p1']); // p1 once
    });

    test('several thresholds crossed in ONE frame fire every onEnter once, in order', () => {
        const log = []; const b = stubBoss(100);
        initBossPhases(b, hpScript(log), null, 0);
        b.health = 10; // past both 66% and 33% at once
        updateBossPhases(b, null, 2000);
        expect(currentPhaseIndex(b)).toBe(2);
        expect(log.map(e => e[0])).toEqual(['p0', 'p1', 'p2']);
    });
});

describe('boss-phases — full run (reaches every phase + stays killable)', () => {
    test('stub boss steps through all phases and is not left perma-invuln', () => {
        const log = []; const b = stubBoss(100);
        initBossPhases(b, hpScript(log), null, 0);
        let now = 0;
        // Whittle HP down a chunk at a time, ticking the runner each step.
        for (const hp of [80, 60, 40, 20, 1]) {
            b.health = hp;
            now += 10000; // far past any prior invuln window
            updateBossPhases(b, null, now);
        }
        expect(log.map(e => e[0])).toEqual(['p0', 'p1', 'p2']);
        expect(isFinalPhase(b)).toBe(true);
        // Final phase is reachable and damage is NOT blocked once the last
        // transition window has elapsed → the boss can be finished off.
        expect(phaseBlocksDamage(b, now + DEFAULT_TRANSITION_INVULN_MS + 1)).toBe(false);
    });
});

describe('boss-phases — gates + guards', () => {
    test('a custom gate predicate overrides the HP fraction', () => {
        const log = [];
        const b = stubBoss(100);
        let open = false;
        const script = [
            { id: 'a', onEnter: () => log.push('a') },
            { id: 'b', gate: () => open, onEnter: () => log.push('b') },
        ];
        initBossPhases(b, script, null, 0);
        updateBossPhases(b, null, 100);
        expect(currentPhaseIndex(b)).toBe(0); // gate closed
        open = true;
        updateBossPhases(b, null, 200);
        expect(currentPhaseIndex(b)).toBe(1);
        expect(log).toEqual(['a', 'b']);
    });

    test('a dying or warping boss does not advance', () => {
        const log = []; const b = stubBoss(100);
        initBossPhases(b, hpScript(log), null, 0);
        b.health = 10;
        b._deathFlash = 1;
        updateBossPhases(b, null, 1000);
        expect(currentPhaseIndex(b)).toBe(0);
        b._deathFlash = 0; b.warping = true;
        updateBossPhases(b, null, 1000);
        expect(currentPhaseIndex(b)).toBe(0);
        b.warping = false; b.active = false;
        updateBossPhases(b, null, 1000);
        expect(currentPhaseIndex(b)).toBe(0);
    });
});
