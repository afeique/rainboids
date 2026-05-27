/**
 * tests/unit/bounty-engine.test.js — Looter-Economy Pivot T15: bounty engine.
 *
 * Pure logic over a passed-in board (injected rng). Covers:
 *   - rollBoard gives 3 dailies + 2 contracts, all distinct templateIds
 *   - recordEvent advances a matching bounty and completes it at target
 *   - recordEvent respects element/weapon tag requirements
 *   - claim returns the reward exactly once, then null
 *   - rerollBounty swaps in a same-kind bounty
 *   - activeBountyTags surfaces in-progress qualifier tags
 */

import { describe, expect, test } from '@jest/globals';
import {
    rollBoard,
    recordEvent,
    claim,
    rerollBounty,
    activeBountyTags,
} from '../../js/modules/world/bounty-engine.js';

// A deterministic stub rng: cycles a fixed sequence in [0,1).
function seqRng(values) {
    let i = 0;
    return () => values[(i++) % values.length];
}

// A small helper: a hand-built rolled bounty so progress tests don't depend on
// which template the roller happens to draw.
function fakeBounty(overrides = {}) {
    return {
        id: overrides.id ?? `fake#${Math.random().toString(36).slice(2)}`,
        templateId: overrides.templateId ?? 'combat_kills_total',
        category: overrides.category ?? 'combat',
        kind: overrides.kind ?? 'daily',
        text: overrides.text ?? 'Destroy 3 enemies',
        progressType: overrides.progressType ?? 'kill',
        target: overrides.target ?? 3,
        fills: overrides.fills ?? {},
        reward: overrides.reward ?? { rainshards: 1000 },
        progress: overrides.progress ?? 0,
        ...overrides,
    };
}

function boardOf(dailies, contracts = []) {
    return { dailies, contracts, rolledAt: 0 };
}

describe('rollBoard', () => {
    test('rolls 3 dailies + 2 contracts', () => {
        const board = rollBoard(seqRng([0.0, 0.3, 0.6, 0.1, 0.8, 0.45, 0.2, 0.9]));
        expect(board.dailies).toHaveLength(3);
        expect(board.contracts).toHaveLength(2);
        expect(typeof board.rolledAt).toBe('number');
    });

    test('dailies are all kind=daily, contracts all kind=contract', () => {
        const board = rollBoard(seqRng([0.05, 0.25, 0.55, 0.15, 0.75, 0.35]));
        for (const b of board.dailies) expect(b.kind).toBe('daily');
        for (const b of board.contracts) expect(b.kind).toBe('contract');
    });

    test('no duplicate templateIds within the board', () => {
        const board = rollBoard(seqRng([0.0, 0.12, 0.37, 0.61, 0.83, 0.07, 0.49, 0.91, 0.28]));
        const ids = [...board.dailies, ...board.contracts].map((b) => b.templateId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('every rolled bounty starts at 0 progress with a positive target', () => {
        const board = rollBoard(seqRng([0.0, 0.3, 0.6, 0.1, 0.8, 0.45]));
        for (const b of [...board.dailies, ...board.contracts]) {
            expect(b.progress).toBe(0);
            expect(b.target).toBeGreaterThan(0);
        }
    });
});

describe('recordEvent', () => {
    test('advances a matching kill bounty toward its target', () => {
        const board = boardOf([fakeBounty({ id: 'k', progressType: 'kill', target: 3 })]);
        const r1 = recordEvent(board, { type: 'kill', amount: 1 });
        expect(board.dailies[0].progress).toBe(1);
        expect(r1.completed).toEqual([]);
    });

    test('completes a bounty exactly at its target and reports it once', () => {
        const board = boardOf([fakeBounty({ id: 'k', progressType: 'kill', target: 2 })]);
        recordEvent(board, { type: 'kill', amount: 1 });
        const r = recordEvent(board, { type: 'kill', amount: 1 });
        expect(board.dailies[0].progress).toBe(2);
        expect(board.dailies[0].completed).toBe(true);
        expect(r.completed).toEqual(['k']);

        // further events do not advance or re-report a completed bounty
        const r2 = recordEvent(board, { type: 'kill', amount: 5 });
        expect(board.dailies[0].progress).toBe(2);
        expect(r2.completed).toEqual([]);
    });

    test('clamps progress to the target even on an over-shooting amount', () => {
        const board = boardOf([fakeBounty({ id: 'k', progressType: 'kill', target: 4 })]);
        const r = recordEvent(board, { type: 'kill', amount: 10 });
        expect(board.dailies[0].progress).toBe(4);
        expect(r.completed).toEqual(['k']);
    });

    test('respects an element tag requirement', () => {
        const board = boardOf([
            fakeBounty({ id: 'pyro', progressType: 'kill_element', target: 2, fills: { element: 'PYRO' } }),
        ]);
        // wrong element does not advance
        recordEvent(board, { type: 'kill', amount: 1, tags: ['CRYO'] });
        expect(board.dailies[0].progress).toBe(0);
        // right element advances (case-insensitive)
        recordEvent(board, { type: 'kill', amount: 1, tags: ['pyro', 'PULSE'] });
        expect(board.dailies[0].progress).toBe(1);
    });

    test('one kill event can advance multiple matching bounties at once', () => {
        const board = boardOf([
            fakeBounty({ id: 'total', progressType: 'kill', target: 5 }),
            fakeBounty({ id: 'pyro', progressType: 'kill_element', target: 5, fills: { element: 'PYRO' } }),
            fakeBounty({ id: 'pulse', progressType: 'kill_weapon', target: 5, fills: { weapon: 'Pulse' } }),
        ]);
        recordEvent(board, { type: 'kill', amount: 1, tags: ['PYRO', 'Pulse'] });
        expect(board.dailies[0].progress).toBe(1); // total
        expect(board.dailies[1].progress).toBe(1); // pyro element
        expect(board.dailies[2].progress).toBe(1); // pulse weapon
    });

    test('stage-clear advances the bounty matching its modifier tag', () => {
        const board = boardOf([
            fakeBounty({ id: 'nd', progressType: 'no_damage_stage', target: 1 }),
            fakeBounty({ id: 'sd', progressType: 'clear_modifier', target: 1 }),
        ]);
        const r = recordEvent(board, { type: 'stage-clear', tags: ['no-damage'] });
        expect(board.dailies[0].completed).toBe(true);
        expect(board.dailies[1].completed).toBeFalsy();
        expect(r.completed).toEqual(['nd']);
    });

    test('craft event advances a fabricate_rarity bounty matching the rarity', () => {
        const board = boardOf([], [
            fakeBounty({ id: 'fab', kind: 'contract', progressType: 'fabricate_rarity', target: 1, fills: { rarity: 'Legendary' } }),
        ]);
        recordEvent(board, { type: 'craft', tags: ['Epic'] });
        expect(board.contracts[0].progress).toBe(0); // wrong rarity
        const r = recordEvent(board, { type: 'craft', tags: ['Legendary'] });
        expect(board.contracts[0].completed).toBe(true);
        expect(r.completed).toEqual(['fab']);
    });

    test('elite-kill feeds both elite_kill and plain kill goals', () => {
        const board = boardOf([
            fakeBounty({ id: 'elite', progressType: 'elite_kill', target: 2 }),
            fakeBounty({ id: 'total', progressType: 'kill', target: 2 }),
        ]);
        recordEvent(board, { type: 'elite-kill', amount: 1 });
        expect(board.dailies[0].progress).toBe(1);
        expect(board.dailies[1].progress).toBe(1);
    });

    test('unknown event types are no-ops', () => {
        const board = boardOf([fakeBounty({ id: 'k', progressType: 'kill', target: 3 })]);
        const r = recordEvent(board, { type: 'totally-unknown' });
        expect(board.dailies[0].progress).toBe(0);
        expect(r.completed).toEqual([]);
    });
});

describe('claim', () => {
    test('returns the reward once for a completed bounty, then null', () => {
        const board = boardOf([fakeBounty({ id: 'k', progressType: 'kill', target: 1, reward: { rainshards: 1200 } })]);
        recordEvent(board, { type: 'kill', amount: 1 });

        const reward = claim(board, 'k');
        expect(reward).toEqual({ rainshards: 1200 });
        expect(board.dailies[0].claimed).toBe(true);

        // claiming again returns null
        expect(claim(board, 'k')).toBeNull();
    });

    test('returns null for an incomplete bounty', () => {
        const board = boardOf([fakeBounty({ id: 'k', progressType: 'kill', target: 3 })]);
        recordEvent(board, { type: 'kill', amount: 1 });
        expect(claim(board, 'k')).toBeNull();
    });

    test('returns null for an unknown id', () => {
        const board = boardOf([fakeBounty({ id: 'k' })]);
        expect(claim(board, 'nope')).toBeNull();
    });
});

describe('rerollBounty', () => {
    test('replaces an unclaimed daily with a fresh same-kind bounty', () => {
        const board = rollBoard(seqRng([0.0, 0.3, 0.6, 0.1, 0.8, 0.45, 0.2, 0.9]));
        const oldId = board.dailies[0].id;
        const fresh = rerollBounty(board, oldId, seqRng([0.5, 0.5, 0.5, 0.5]));
        expect(fresh).toBeTruthy();
        expect(fresh.kind).toBe('daily');
        expect(board.dailies[0].id).toBe(fresh.id);
        expect(board.dailies[0].id).not.toBe(oldId);
        expect(board.dailies).toHaveLength(3);
    });

    test('replaces a contract with another contract', () => {
        const board = rollBoard(seqRng([0.0, 0.3, 0.6, 0.1, 0.8, 0.45, 0.2, 0.9]));
        const oldId = board.contracts[0].id;
        const fresh = rerollBounty(board, oldId, seqRng([0.7, 0.2, 0.4, 0.9]));
        expect(fresh.kind).toBe('contract');
        expect(board.contracts[0].id).toBe(fresh.id);
        expect(board.contracts).toHaveLength(2);
    });

    test('refuses to reroll a claimed bounty', () => {
        const board = boardOf([fakeBounty({ id: 'k', progressType: 'kill', target: 1 })]);
        recordEvent(board, { type: 'kill', amount: 1 });
        claim(board, 'k');
        expect(rerollBounty(board, 'k', seqRng([0.5]))).toBeNull();
    });

    test('returns null for an unknown id', () => {
        const board = boardOf([fakeBounty({ id: 'k' })]);
        expect(rerollBounty(board, 'nope', seqRng([0.5]))).toBeNull();
    });
});

describe('activeBountyTags', () => {
    test('surfaces qualifier tokens + channels of in-progress bounties', () => {
        const board = boardOf([
            fakeBounty({ id: 'pyro', progressType: 'kill_element', category: 'combat', fills: { element: 'PYRO' } }),
        ]);
        const tags = activeBountyTags(board);
        expect(tags).toContain('PYRO');
        expect(tags).toContain('kill_element');
        expect(tags).toContain('combat');
    });

    test('omits completed and claimed bounties', () => {
        const board = boardOf([
            fakeBounty({ id: 'done', progressType: 'kill_element', target: 1, fills: { element: 'PYRO' } }),
            fakeBounty({ id: 'live', progressType: 'kill_weapon', fills: { weapon: 'Rail' } }),
        ]);
        recordEvent(board, { type: 'kill', amount: 1, tags: ['PYRO'] }); // completes 'done'
        const tags = activeBountyTags(board);
        expect(tags).not.toContain('PYRO');
        expect(tags).toContain('Rail');
    });

    test('de-duplicates repeated tags', () => {
        const board = boardOf([
            fakeBounty({ id: 'a', progressType: 'kill', category: 'combat', fills: {} }),
            fakeBounty({ id: 'b', progressType: 'kill', category: 'combat', fills: {} }),
        ]);
        const tags = activeBountyTags(board);
        const killCount = tags.filter((t) => t === 'kill').length;
        expect(killCount).toBe(1);
    });
});
