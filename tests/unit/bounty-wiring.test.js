/**
 * @jest-environment jsdom
 */
// T45 — bounty board wiring (game-engine orchestration over bounty-engine T15):
// the board persists in meta (rolled once, reused), recordBountyEvent advances +
// persists progress, claimBounty grants reward.rainshards into the account
// wallet with a double-claim guard. (The engine's recordEvent/claim math is
// covered by the bounty-engine unit tests.)

import { describe, expect, test, beforeEach } from '@jest/globals';
import { GameEngine } from '../../js/modules/game-engine.js';
import { loadMeta, saveMeta } from '../../js/modules/core/storage.js';

beforeEach(() => { localStorage.clear(); });

describe('T45 — bounty board persistence', () => {
    test('_bountyBoard rolls once and reuses the persisted board', () => {
        const eng = Object.create(GameEngine.prototype);
        const b1 = eng._bountyBoard();
        expect(Array.isArray(b1.dailies)).toBe(true);
        expect(Array.isArray(b1.contracts)).toBe(true);
        const b2 = eng._bountyBoard();
        expect(b2.rolledAt).toBe(b1.rolledAt); // same board, not re-rolled
        expect(loadMeta().bountyBoard).toBeTruthy();
    });

    test('recordBountyEvent persists the board after an event', () => {
        const eng = Object.create(GameEngine.prototype);
        eng.game = { accountGold: 0 };
        eng.recordBountyEvent({ type: 'kill', tags: [] });
        const board = loadMeta().bountyBoard;
        expect(board).toBeTruthy();
        expect([...board.dailies, ...board.contracts].length).toBeGreaterThan(0);
    });

    test('an unknown event type is a harmless no-op', () => {
        const eng = Object.create(GameEngine.prototype);
        eng.game = { accountGold: 0 };
        expect(eng.recordBountyEvent({ type: 'nonsense' })).toEqual([]);
        expect(eng.recordBountyEvent(null)).toEqual([]);
    });
});

describe('T45 — claimBounty grants the reward', () => {
    test('a completed bounty pays reward.rainshards into the wallet (once)', () => {
        saveMeta({ accountGold: 1000 });
        const eng = Object.create(GameEngine.prototype);
        eng.game = { accountGold: 1000 };
        const board = eng._bountyBoard();
        const b = board.dailies[0];
        b.completed = true;                       // force-complete for the claim path
        saveMeta({ bountyBoard: board });

        const reward = eng.claimBounty(b.id);
        expect(reward).toBeTruthy();
        expect(reward.rainshards).toBeGreaterThan(0);
        expect(eng.game.accountGold).toBe(1000 + reward.rainshards);
        expect(loadMeta().accountGold).toBe(1000 + reward.rainshards);

        // double-claim guard
        expect(eng.claimBounty(b.id)).toBeNull();
    });

    test('claiming an incomplete / unknown bounty returns null (no grant)', () => {
        saveMeta({ accountGold: 500 });
        const eng = Object.create(GameEngine.prototype);
        eng.game = { accountGold: 500 };
        const board = eng._bountyBoard();
        const incomplete = board.dailies[0]; // progress 0, not completed
        expect(eng.claimBounty(incomplete.id)).toBeNull();
        expect(eng.claimBounty('no-such-id')).toBeNull();
        expect(loadMeta().accountGold).toBe(500); // untouched
    });
});
