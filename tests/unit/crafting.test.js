// Looter-Economy Pivot — T13: Crafting engine (the Fabricator verbs).
//
// Pure-function tests over a SEEDED/STUB rng. Asserts each verb deducts the
// right R$ cost (from crafting-costs, T02), that "poor" is a no-op, the
// "narrow types, never values" rule (Calibrate keeps type, Target forces type),
// the per-item reroll escalation + its reset on upgrade, and that salvage is
// always less than a fresh fabricate of that rarity.
import {
    fabricate,
    rerollTrait,
    upgradeTier,
    combineMatrices,
    salvage,
} from '../../js/modules/shop/crafting.js';
import {
    fabricateCost,
    rerollCost,
    upgradeCost,
    combineCost,
    salvageRefund,
} from '../../js/modules/shop/crafting-costs.js';

// ---------------------------------------------------------------------------
// A deterministic rng. `seq([...])` cycles a fixed list of [0,1) values so a
// test can pin every random draw; `constant(v)` always returns v.
// ---------------------------------------------------------------------------
function seq(values) {
    let i = 0;
    return () => values[i++ % values.length];
}
const constant = (v) => () => v;

// A bottomless wallet for "verb succeeds" cases.
const RICH = 10_000_000;

describe('T13 — fabricate', () => {
    test('weapon: deducts blind fab cost + stamps _rerolls=0', () => {
        const r = fabricate(
            { kind: 'weapon', params: { archetype: 'PULSE', rarity: 'legendary' }, rng: constant(0) },
            RICH,
        );
        expect(r.ok).toBe(true);
        expect(r.item.archetype).toBe('PULSE');
        expect(Array.isArray(r.item.traits)).toBe(true);
        expect(r.item._rerolls).toBe(0);
        expect(r.rainshards).toBe(RICH - fabricateCost('Legendary'));
    });

    test('gear: deducts blind fab cost, returns affixes + _rerolls', () => {
        const r = fabricate(
            { kind: 'gear', params: { slot: 'cockpit', rarity: 'rare', template: 'assassin' }, rng: constant(0) },
            RICH,
        );
        expect(r.ok).toBe(true);
        expect(Array.isArray(r.item.affixes)).toBe(true);
        expect(r.item._rerolls).toBe(0);
        expect(r.rainshards).toBe(RICH - fabricateCost('Rare'));
    });

    test('lean + focus raise the price (Pure + Guarantee)', () => {
        const r = fabricate(
            {
                kind: 'gear',
                params: { slot: 'cockpit', rarity: 'legendary', template: 'assassin', lean: 'Pure', focus: 'CRIT_CHANCE' },
                rng: constant(0),
            },
            RICH,
        );
        expect(r.ok).toBe(true);
        // focus 'CRIT_CHANCE' is a stat id, not a None/Boost/Guarantee tier; the
        // cost map treats unknown focus as the None (×1) multiplier.
        const expected = fabricateCost('Legendary', { lean: 'Pure', focus: 'CRIT_CHANCE' });
        expect(r.rainshards).toBe(RICH - expected);
    });

    test('poor → no-op with reason "poor", wallet unchanged', () => {
        const wallet = 10; // far below any fab cost
        const r = fabricate(
            { kind: 'weapon', params: { archetype: 'PULSE', rarity: 'legendary' }, rng: constant(0) },
            wallet,
        );
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('poor');
        expect(r.rainshards).toBe(wallet);
        expect(r.item).toBeUndefined();
    });

    test('bad kind / bad rarity → no-op, wallet unchanged', () => {
        expect(fabricate({ kind: 'nope', params: { rarity: 'common' } }, RICH).reason).toBe('badKind');
        expect(fabricate({ kind: 'weapon', params: { rarity: 'mythic' } }, RICH).reason).toBe('badRarity');
        expect(fabricate({ kind: 'weapon', params: { rarity: 'mythic' } }, RICH).rainshards).toBe(RICH);
    });
});

describe('T13 — rerollTrait (weapon)', () => {
    // A small fixed weapon: two traits, one of which is an Element.
    const weapon = () => ({
        archetype: 'PULSE',
        rarity: 'legendary',
        traits: [
            { id: 'DAMAGE_PCT', class: 'STAT', value: 10 },
            { id: 'PYRO', class: 'ELEMENT' },
        ],
        element: 'PYRO',
        _rerolls: 0,
    });

    test('Calibrate keeps the trait TYPE but rerolls the VALUE', () => {
        // value band for DAMAGE_PCT is 4..36; pick a draw that lands above 10.
        const r = rerollTrait(weapon(), 0, 'Calibrate', { rng: constant(0.999) }, RICH);
        expect(r.ok).toBe(true);
        expect(r.item.traits[0].id).toBe('DAMAGE_PCT'); // type preserved
        expect(r.item.traits[0].value).not.toBe(10);    // value changed
        expect(r.rainshards).toBe(RICH - rerollCost('Legendary', 'Calibrate', 0));
    });

    test('Target forces the requested trait id', () => {
        const r = rerollTrait(weapon(), 0, 'Target', { targetType: 'HOMING', rng: constant(0) }, RICH);
        expect(r.ok).toBe(true);
        expect(r.item.traits[0].id).toBe('HOMING');
        expect(r.item.traits[0].class).toBe('BEHAVIOR');
        expect(r.rainshards).toBe(RICH - rerollCost('Legendary', 'Target', 0));
    });

    test('Target with an unknown id → no-op (badTarget), wallet unchanged', () => {
        const r = rerollTrait(weapon(), 0, 'Target', { targetType: 'NOT_A_TRAIT', rng: constant(0) }, RICH);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('badTarget');
        expect(r.rainshards).toBe(RICH);
    });

    test('Reroll gives a (possibly) new random type + bumps _rerolls', () => {
        const r = rerollTrait(weapon(), 0, 'Reroll', { rng: seq([0.5, 0.5]) }, RICH);
        expect(r.ok).toBe(true);
        expect(r.item._rerolls).toBe(1);
        expect(r.rainshards).toBe(RICH - rerollCost('Legendary', 'Reroll', 0));
    });

    test('reroll cost escalates with _rerolls (1.4^n)', () => {
        let w = weapon();
        let wallet = RICH;
        const costs = [];
        for (let i = 0; i < 3; i++) {
            const expectedCost = rerollCost('Legendary', 'Calibrate', w._rerolls);
            const r = rerollTrait(w, 0, 'Calibrate', { rng: constant(0.5) }, wallet);
            expect(r.ok).toBe(true);
            costs.push(wallet - r.rainshards);
            expect(wallet - r.rainshards).toBeCloseTo(expectedCost, 4);
            w = r.item;
            wallet = r.rainshards;
        }
        // strictly increasing
        expect(costs[1]).toBeGreaterThan(costs[0]);
        expect(costs[2]).toBeGreaterThan(costs[1]);
        expect(w._rerolls).toBe(3);
    });

    test('does not mutate the input item', () => {
        const w = weapon();
        const before = JSON.stringify(w);
        rerollTrait(w, 0, 'Calibrate', { rng: constant(0.5) }, RICH);
        expect(JSON.stringify(w)).toBe(before);
    });

    test('poor → no-op, wallet unchanged', () => {
        const r = rerollTrait(weapon(), 0, 'Calibrate', { rng: constant(0.5) }, 5);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('poor');
        expect(r.rainshards).toBe(5);
    });

    test('bad index / bad mode → no-op', () => {
        expect(rerollTrait(weapon(), 9, 'Reroll', { rng: constant(0) }, RICH).reason).toBe('badIndex');
        expect(rerollTrait(weapon(), 0, 'Nope', { rng: constant(0) }, RICH).reason).toBe('badMode');
    });
});

describe('T13 — rerollTrait (gear)', () => {
    const gear = () => ({
        slot: 'cockpit',
        rarity: 'legendary',
        template: 'assassin',
        affixes: [
            { stat: 'CRIT_CHANCE', pct: 12 },
            { stat: 'SPEED', pct: 8 },
        ],
        sockets: 1,
        _rerolls: 0,
    });

    test('Calibrate keeps the affix STAT, rerolls the pct', () => {
        const r = rerollTrait(gear(), 0, 'Calibrate', { rng: constant(0.999) }, RICH);
        expect(r.ok).toBe(true);
        expect(r.item.affixes[0].stat).toBe('CRIT_CHANCE');
        expect(r.item.affixes[0].pct).not.toBe(12);
        expect(r.rainshards).toBe(RICH - rerollCost('Legendary', 'Calibrate', 0));
    });

    test('Target forces the requested stat', () => {
        const r = rerollTrait(gear(), 0, 'Target', { targetType: 'TOUGHNESS', rng: constant(0.2) }, RICH);
        expect(r.ok).toBe(true);
        expect(r.item.affixes[0].stat).toBe('TOUGHNESS');
        expect(r.rainshards).toBe(RICH - rerollCost('Legendary', 'Target', 0));
    });

    test('detects gear by shape (works on affixes, bumps _rerolls)', () => {
        const r = rerollTrait(gear(), 1, 'Reroll', { rng: constant(0.5) }, RICH);
        expect(r.ok).toBe(true);
        expect(r.item._rerolls).toBe(1);
        expect(Array.isArray(r.item.affixes)).toBe(true);
    });
});

describe('T13 — upgradeTier', () => {
    test('weapon: +1 rarity, keeps existing traits + adds one, charges upgradeCost, resets _rerolls', () => {
        const w = {
            archetype: 'PULSE',
            rarity: 'legendary',
            traits: [{ id: 'DAMAGE_PCT', class: 'STAT', value: 10 }],
            element: 'KINETIC',
            _rerolls: 4,
        };
        const r = upgradeTier(w, { rng: seq([0.3, 0.3, 0.3]) }, RICH);
        expect(r.ok).toBe(true);
        expect(r.item.rarity).toBe('epic'); // next tier, lowercase preserved
        expect(r.item.traits.length).toBe(2); // kept 1, added 1
        expect(r.item.traits[0]).toEqual({ id: 'DAMAGE_PCT', class: 'STAT', value: 10 });
        expect(r.item._rerolls).toBe(0); // reset
        expect(r.rainshards).toBe(RICH - upgradeCost('Legendary'));
    });

    test('gear: +1 rarity + one new affix in the wider band, resets _rerolls', () => {
        const g = {
            slot: 'cockpit',
            rarity: 'rare',
            template: 'assassin',
            affixes: [{ stat: 'CRIT_CHANCE', pct: 10 }],
            sockets: 1,
            _rerolls: 2,
        };
        const r = upgradeTier(g, { rng: constant(0.5) }, RICH);
        expect(r.ok).toBe(true);
        expect(r.item.rarity).toBe('exceptional');
        expect(r.item.affixes.length).toBe(2);
        expect(r.item.affixes[0]).toEqual({ stat: 'CRIT_CHANCE', pct: 10 }); // kept
        expect(r.item._rerolls).toBe(0);
        expect(r.rainshards).toBe(RICH - upgradeCost('Rare'));
    });

    test('reroll escalation RESETS on upgrade (next reroll back to n=0 price)', () => {
        // reroll twice to bump _rerolls to 2...
        let w = {
            archetype: 'PULSE',
            rarity: 'legendary',
            traits: [{ id: 'DAMAGE_PCT', class: 'STAT', value: 10 }],
            element: 'KINETIC',
            _rerolls: 0,
        };
        let wallet = RICH;
        for (let i = 0; i < 2; i++) {
            const r = rerollTrait(w, 0, 'Calibrate', { rng: constant(0.5) }, wallet);
            w = r.item;
            wallet = r.rainshards;
        }
        expect(w._rerolls).toBe(2);
        // ...upgrade resets to 0...
        const up = upgradeTier(w, { rng: constant(0.3) }, wallet);
        expect(up.item._rerolls).toBe(0);
        wallet = up.rainshards;
        // ...so the very next reroll is priced at n=0 (now at Epic rarity).
        const after = rerollTrait(up.item, 0, 'Calibrate', { rng: constant(0.5) }, wallet);
        expect(wallet - after.rainshards).toBeCloseTo(rerollCost('Epic', 'Calibrate', 0), 4);
    });

    test('top of the ladder → no-op (maxTier), wallet unchanged', () => {
        const w = {
            archetype: 'PULSE',
            rarity: 'transcendental',
            traits: [{ id: 'DAMAGE_PCT', class: 'STAT', value: 30 }],
            element: 'KINETIC',
            _rerolls: 0,
        };
        const r = upgradeTier(w, { rng: constant(0) }, RICH);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('maxTier');
        expect(r.rainshards).toBe(RICH);
    });

    test('poor → no-op', () => {
        const g = { slot: 'cockpit', rarity: 'rare', template: 'assassin', affixes: [{ stat: 'CRIT_CHANCE', pct: 10 }], sockets: 1 };
        const r = upgradeTier(g, { rng: constant(0.5) }, 50);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('poor');
        expect(r.rainshards).toBe(50);
    });
});

describe('T13 — combineMatrices', () => {
    test('3× same type+tier → tier+1, charges combineCost(resultTier)', () => {
        const matrices = [
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
        ];
        const r = combineMatrices(matrices, RICH);
        expect(r.ok).toBe(true);
        expect(r.matrix).toEqual({ id: 'vital', tier: 2 });
        expect(r.rainshards).toBe(RICH - combineCost(2));
    });

    test('bad recipe (mixed tiers) → no-op (badRecipe), wallet unchanged', () => {
        const r = combineMatrices(
            [{ id: 'vital', tier: 1 }, { id: 'vital', tier: 2 }, { id: 'vital', tier: 1 }],
            RICH,
        );
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('badRecipe');
        expect(r.rainshards).toBe(RICH);
    });

    test('poor → no-op even with a valid recipe', () => {
        const matrices = [
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
            { id: 'vital', tier: 1 },
        ];
        const r = combineMatrices(matrices, 10);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('poor');
        expect(r.rainshards).toBe(10);
    });
});

describe('T13 — salvage', () => {
    test('weapon: adds salvageRefund(rarity) to the wallet', () => {
        const w = { archetype: 'PULSE', rarity: 'legendary', traits: [], element: 'KINETIC' };
        const r = salvage(w, 1000);
        expect(r.ok).toBe(true);
        expect(r.refund).toBeCloseTo(salvageRefund('Legendary'), 4);
        expect(r.rainshards).toBeCloseTo(1000 + salvageRefund('Legendary'), 4);
    });

    test('gear salvage refund is strictly LESS than a fresh fabricate of that rarity', () => {
        const g = { slot: 'cockpit', rarity: 'epic', template: 'assassin', affixes: [], sockets: 1 };
        const r = salvage(g, 0);
        expect(r.ok).toBe(true);
        expect(r.refund).toBeLessThan(fabricateCost('Epic'));
    });

    test('bad item → no-op', () => {
        const r = salvage({ nope: true }, 500);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('badItem');
        expect(r.rainshards).toBe(500);
    });
});
