// T32 — run randomizer + stage draft wiring (game-engine).
//
// Exercises the REAL openStageDraft + _applyStageSpec (which call the real
// nextDraft + applyPick), stubbing only the DOM DraftOverlay so the test runs
// headless. Covers: the draft gates the next-stage advance (cb fires on pick,
// not before), the chosen option is normalized + stored on game.runStage, the
// no-repeat lastModifier is tracked, and a non-opening overlay never soft-locks.

import { describe, expect, test } from '@jest/globals';
import { GameEngine } from '../../js/modules/game-engine.js';

function makeEngine(over = {}) {
    const eng = Object.create(GameEngine.prototype);
    eng.game = {
        currentWave: 3,
        runConfig: { stages: 10, wavesPerStage: 3, mode: 'NORMAL' },
        runState: { lastModifier: null, activeBountyTags: [] },
        playerPWR: 1000,
        difficultyDirector: null,
    };
    return Object.assign(eng, over);
}

describe('T32 — _applyStageSpec stores the chosen stage + tracks state', () => {
    test('stores runStage, stageThreat, and the LAST modifier (no-repeat memory)', () => {
        const eng = makeEngine();
        eng._applyStageSpec({
            themeId: 'WILDFIRE', element: 'PYRO',
            modifierIds: ['SWARM', 'GLASS'], threat: 1200,
            reward: { rainshardMult: 1.3, dropBias: 1.4 },
        });
        expect(eng.game.runStage.themeId).toBe('WILDFIRE');
        expect(eng.game.stageThreat).toBe(1200);
        expect(eng.game.runState.lastModifier).toBe('GLASS'); // last in the list
    });

    test('an unmodified stage clears lastModifier', () => {
        const eng = makeEngine({ game: { runState: { lastModifier: 'FOG' }, difficultyDirector: null } });
        eng._applyStageSpec({ themeId: 'IRON_WALL', modifierIds: [], threat: 800, reward: { rainshardMult: 1 } });
        expect(eng.game.runState.lastModifier).toBeNull();
    });
});

describe('T32 — openStageDraft gates the advance + applies the pick', () => {
    test('opens with the real draft options, defers cb until a pick, then applies it', () => {
        const eng = makeEngine();
        let captured = null;
        eng.draftOverlay = { open: (opts, cfg) => { captured = { opts, cfg }; return true; } };

        let done = false;
        const opened = eng.openStageDraft(() => { done = true; });

        expect(opened).toBe(true);
        expect(done).toBe(false);                       // gated — waits for the pick
        expect(Array.isArray(captured.opts)).toBe(true);
        expect(captured.opts.length).toBeGreaterThanOrEqual(2); // 2–3 stage options
        expect(captured.cfg.pwr).toBe(1000);            // live PWR passed to the overlay
        // options are ordered safe→risky by threat (run-randomizer guarantee)
        for (let i = 1; i < captured.opts.length; i++) {
            expect(captured.opts[i].threat).toBeGreaterThanOrEqual(captured.opts[i - 1].threat);
        }

        // Simulate the player choosing the SAFE (first) option.
        captured.cfg.onPick(0);
        expect(done).toBe(true);                        // cb fires → stage advance unblocks
        expect(eng.game.runStage).toBeTruthy();
        expect(eng.game.runStage.threat).toBe(captured.opts[0].threat); // applyPick(opts[0])
        expect(typeof eng.game.runStage.reward.rainshardMult).toBe('number'); // the income hook field
    });

    test('a non-opening overlay returns false and never calls cb (no soft-lock)', () => {
        const eng = makeEngine({ draftOverlay: { open: () => false } });
        let done = false;
        const opened = eng.openStageDraft(() => { done = true; });
        expect(opened).toBe(false);
        expect(done).toBe(false); // caller proceeds on its own; the draft didn't fire cb
    });
});
