// Phase R3 / W4 — card draft pool/compose/cadence (pure, no DOM).
// W4: cards are EFFICACY-ONLY (mechanic mods excluded — they're upfront) and
// the draft is 1 primary + 1 power + 2 ability.
import {
    isCardStage, cardsPerRun, weaponCards, primaryCards, powerCards, abilityCards,
    composeDraft, buildDraft,
    CARDS_PER_RUN, CARD_PRIMARY_COUNT, CARD_POWER_COUNT, CARD_ABILITY_COUNT, CARD_TARGET,
} from '../../js/modules/combat/card-draft.js';

const PRIMARY_UPGRADES = {
    PULSE_MULTI:    { id: 'PULSE_MULTI',    maxStacks: 3, weapon: 'PULSE_CANNON' },
    PULSE_RAPID:    { id: 'PULSE_RAPID',    maxStacks: 3, weapon: 'PULSE_CANNON' },
    PULSE_PIERCING: { id: 'PULSE_PIERCING', maxStacks: 3, weapon: 'PULSE_CANNON' }, // MECHANIC MOD → excluded from cards
    NEEDLE_MULTI:   { id: 'NEEDLE_MULTI',   maxStacks: 3, weapon: 'STORM_NEEDLES' },
};
const POWER_UPGRADES = {
    CHARGE_POWER: { id: 'CHARGE_POWER', maxStacks: 3, weapon: 'CHARGE_SHOT' },
    NOVA_WIDE:    { id: 'NOVA_WIDE',    maxStacks: 3, weapon: 'NOVA_BLAST' },
};
const ABILITY_UPGRADES = {
    FORTIFY: { id: 'FORTIFY', maxStacks: 2, ability: 'BULWARK' },
    POTENCY: { id: 'POTENCY', maxStacks: 2, ability: 'FIELD_MEDIC' },
    WIDE_BAND: { id: 'WIDE_BAND', maxStacks: 2, ability: 'EMP_PULSE' },
};

const player = (over = {}) => ({
    ownedPrimaries: new Set(['PULSE_CANNON']),
    ownedPowers: new Set(['CHARGE_SHOT']),
    equippedAbilities: ['BULWARK', 'FIELD_MEDIC', null, null],
    getPowerupStacks: () => 0,
    ...over,
});

describe('Card draft — cadence (RUN-01b: every stage clear except the last)', () => {
    // 9.11.0 — the run is a FIXED 50-wave campaign (10 stages × 5 waves). Card
    // drafts fire on every stage clear EXCEPT the final stage, i.e. boss waves
    // 5,10,…,45 (stages 1–9), but NOT wave 50 (the final stage ends the run).
    test('fixed 50-wave run fires on stage clears 5,10,…,45 but NOT wave 50', () => {
        const fires = [];
        for (let w = 1; w <= 50; w++) if (isCardStage(w)) fires.push(w);
        expect(fires).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45]); // 9 drafts
        expect(fires.length).toBe(CARDS_PER_RUN);
        expect(isCardStage(50)).toBe(false); // final stage clear → no card
    });
    test('does not fire mid-stage', () => {
        expect(isCardStage(1)).toBe(false);
        expect(isCardStage(2)).toBe(false);
        expect(isCardStage(3)).toBe(false);
        expect(isCardStage(4)).toBe(false);
        expect(isCardStage(7)).toBe(false);
    });
    test('cardsPerRun(default) === 9 (stages − 1) and matches CARDS_PER_RUN', () => {
        expect(cardsPerRun()).toBe(9);
        expect(cardsPerRun(undefined)).toBe(9);
        expect(CARDS_PER_RUN).toBe(9);
    });

    describe('run shape is pinned — stage/waves-per-stage overrides are ignored', () => {
        // 9.11.0 — getRunConfig pins the run to the fixed 10×5=50 campaign and
        // ignores any stages/wavesPerStage override on runConfig. So a stale
        // 20×6 (or any other) override resolves back to the canonical 50-wave
        // cadence: card stages stay 5,10,…,45 and cardsPerRun stays 9.
        const game = { runConfig: { stages: 20, wavesPerStage: 6 } };
        test('the override does NOT move the card stages off 5,10,…,45', () => {
            // wave 114/120 (old 20×6 stage clears) are NOT card stages now.
            expect(isCardStage(114, game)).toBe(false);
            expect(isCardStage(120, game)).toBe(false);
            // The pinned cadence still fires on the canonical positions.
            expect(isCardStage(5, game)).toBe(true);   // stage 1 clear → card
            expect(isCardStage(45, game)).toBe(true);  // stage 9 clear → card
            expect(isCardStage(50, game)).toBe(false); // final stage → no card
            expect(isCardStage(7, game)).toBe(false);  // mid-stage → no card
        });
        test('fires on every stage clear except the final one (9 drafts)', () => {
            const fires = [];
            for (let w = 1; w <= 50; w++) if (isCardStage(w, game)) fires.push(w);
            expect(fires.length).toBe(9);
            expect(fires[0]).toBe(5);
            expect(fires[fires.length - 1]).toBe(45);
            expect(fires).not.toContain(50);
        });
        test('cardsPerRun(override) is still 9 (run is pinned to 10 stages)', () => {
            expect(cardsPerRun(game)).toBe(9);
        });
    });
});

describe('Card draft — relevance filter (efficacy-only)', () => {
    test('weapon cards only for equipped weapons, excluding mechanic mods', () => {
        const cards = weaponCards(player(), PRIMARY_UPGRADES, POWER_UPGRADES).map(([id]) => id);
        expect(cards).toContain('PULSE_MULTI');
        expect(cards).toContain('CHARGE_POWER');
        expect(cards).not.toContain('PULSE_PIERCING'); // mechanic mod → upfront, not a card
        expect(cards).not.toContain('NEEDLE_MULTI');    // not equipped
        expect(cards).not.toContain('NOVA_WIDE');       // not equipped
    });
    test('primaryCards / powerCards split the equipped pools', () => {
        expect(primaryCards(player(), PRIMARY_UPGRADES).map(([id]) => id).sort())
            .toEqual(['PULSE_MULTI', 'PULSE_RAPID']); // PIERCING excluded
        expect(powerCards(player(), POWER_UPGRADES).map(([id]) => id)).toEqual(['CHARGE_POWER']);
    });
    test('ability cards only for equipped abilities', () => {
        const cards = abilityCards(player(), ABILITY_UPGRADES).map(([id]) => id);
        expect(cards.sort()).toEqual(['FORTIFY', 'POTENCY']);
        expect(cards).not.toContain('WIDE_BAND'); // EMP_PULSE not equipped
    });
    test('maxed upgrades are excluded', () => {
        const p = player({ getPowerupStacks: (id) => (id === 'PULSE_MULTI' ? 3 : 0) });
        const cards = primaryCards(p, PRIMARY_UPGRADES).map(([id]) => id);
        expect(cards).not.toContain('PULSE_MULTI'); // maxed
        expect(cards).toContain('PULSE_RAPID');
    });
});

describe('Card draft — composition (1 primary + 1 power + 2 ability)', () => {
    const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

    test('offers 1 primary + 1 power + 2 ability when pools are deep', () => {
        const draft = buildDraft(player(), { PRIMARY_UPGRADES, POWER_UPGRADES, ABILITY_UPGRADES }, seq([0]));
        expect(draft.length).toBe(CARD_TARGET); // 4
        const ids = draft.map(([id]) => id);
        const abilityIds = new Set(['FORTIFY', 'POTENCY', 'WIDE_BAND']);
        expect(ids.filter((id) => abilityIds.has(id)).length).toBe(CARD_ABILITY_COUNT); // 2
        expect(ids).toContain('CHARGE_POWER'); // the one power efficacy card
        // exactly one primary efficacy card
        expect(ids.filter((id) => id === 'PULSE_MULTI' || id === 'PULSE_RAPID').length).toBe(CARD_PRIMARY_COUNT);
    });

    test('backfills from other pools when one is dry (no power equipped)', () => {
        const p = player({ ownedPowers: new Set() }); // no power → power pool empty
        const draft = buildDraft(p, { PRIMARY_UPGRADES, POWER_UPGRADES, ABILITY_UPGRADES }, seq([0]));
        // 1 primary + 0 power + 2 ability = 3, backfilled to CARD_TARGET from
        // the leftover primary (PULSE has 2 efficacy upgrades).
        expect(draft.length).toBe(CARD_TARGET);
        expect(draft.map(([id]) => id)).not.toContain('CHARGE_POWER'); // not owned
    });

    test('composeDraft takes (primary, power, ability) pools', () => {
        const prim = [['A', {}], ['B', {}]];
        const pow = [['C', {}]];
        const abil = [['D', {}], ['E', {}], ['F', {}]];
        const draft = composeDraft(prim, pow, abil, () => 0);
        expect(draft.length).toBe(CARD_TARGET);
        const ids = draft.map(([id]) => id);
        expect(ids.filter((id) => ['D', 'E', 'F'].includes(id)).length).toBe(CARD_ABILITY_COUNT);
        expect(ids).toContain('C'); // the only power
    });

    test('all offered cards are distinct', () => {
        const draft = buildDraft(player(), { PRIMARY_UPGRADES, POWER_UPGRADES, ABILITY_UPGRADES });
        const ids = draft.map(([id]) => id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('empty pools yield an empty draft (no crash)', () => {
        const p = player({ ownedPrimaries: new Set(), ownedPowers: new Set(), equippedAbilities: [] });
        expect(buildDraft(p, { PRIMARY_UPGRADES, POWER_UPGRADES, ABILITY_UPGRADES })).toEqual([]);
    });
});
