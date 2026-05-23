// Phase R3 — card draft pool/compose/cadence (pure, no DOM).
import {
    isCardStage, weaponCards, abilityCards, composeDraft, buildDraft,
    CARDS_PER_RUN, CARD_WEAPON_COUNT, CARD_ABILITY_COUNT,
} from '../../js/modules/combat/card-draft.js';

const PRIMARY_UPGRADES = {
    PULSE_MULTI: { id: 'PULSE_MULTI', maxStacks: 3, weapon: 'PULSE_CANNON' },
    PULSE_RAPID: { id: 'PULSE_RAPID', maxStacks: 3, weapon: 'PULSE_CANNON' },
    NEEDLE_MULTI: { id: 'NEEDLE_MULTI', maxStacks: 3, weapon: 'STORM_NEEDLES' },
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

describe('Card draft — cadence', () => {
    test('fires at every 2nd stage clear (waves 6,12,18,24,30 = 5 drafts)', () => {
        const fires = [];
        for (let w = 1; w <= 30; w++) if (isCardStage(w)) fires.push(w);
        expect(fires).toEqual([6, 12, 18, 24, 30]);
        expect(fires.length).toBe(CARDS_PER_RUN);
    });
    test('does not fire mid-stage', () => {
        expect(isCardStage(5)).toBe(false);
        expect(isCardStage(7)).toBe(false);
    });
});

describe('Card draft — relevance filter', () => {
    test('weapon cards only for equipped weapons', () => {
        const cards = weaponCards(player(), PRIMARY_UPGRADES, POWER_UPGRADES).map(([id]) => id);
        expect(cards).toContain('PULSE_MULTI');
        expect(cards).toContain('CHARGE_POWER');
        expect(cards).not.toContain('NEEDLE_MULTI'); // not equipped
        expect(cards).not.toContain('NOVA_WIDE');    // not equipped
    });
    test('ability cards only for equipped abilities', () => {
        const cards = abilityCards(player(), ABILITY_UPGRADES).map(([id]) => id);
        expect(cards.sort()).toEqual(['FORTIFY', 'POTENCY']);
        expect(cards).not.toContain('WIDE_BAND'); // EMP_PULSE not equipped
    });
    test('maxed upgrades are excluded', () => {
        const p = player({ getPowerupStacks: (id) => (id === 'PULSE_MULTI' ? 3 : 0) });
        const cards = weaponCards(p, PRIMARY_UPGRADES, POWER_UPGRADES).map(([id]) => id);
        expect(cards).not.toContain('PULSE_MULTI'); // maxed
        expect(cards).toContain('PULSE_RAPID');
    });
});

describe('Card draft — composition', () => {
    const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

    test('offers 2 weapon + 1 ability when both pools are deep', () => {
        const draft = buildDraft(player(), { PRIMARY_UPGRADES, POWER_UPGRADES, ABILITY_UPGRADES }, seq([0]));
        expect(draft.length).toBe(CARD_WEAPON_COUNT + CARD_ABILITY_COUNT);
        // exactly one ability card (FORTIFY/POTENCY are abilities)
        const abilityIds = new Set(['FORTIFY', 'POTENCY', 'WIDE_BAND']);
        const abilityCount = draft.filter(([id]) => abilityIds.has(id)).length;
        expect(abilityCount).toBe(CARD_ABILITY_COUNT);
    });

    test('backfills from weapons when no ability cards are available', () => {
        const p = player({ equippedAbilities: [null, null, null, null] }); // no abilities
        const draft = buildDraft(p, { PRIMARY_UPGRADES, POWER_UPGRADES, ABILITY_UPGRADES }, seq([0]));
        // PULSE has 2 + CHARGE 1 = 3 weapon cards → fills to 3
        expect(draft.length).toBe(3);
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
