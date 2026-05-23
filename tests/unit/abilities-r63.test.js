// Phase R6.3 — new abilities (Blink / Gravity Snare / Designator). Tests the
// activate verbs against a stubbed engine.
import * as abilities from '../../js/modules/player/abilities.js';
import { ABILITIES } from '../../js/modules/combat/weapon-data.js';

function makePlayer(over = {}) {
    const enemies = over.enemies || [];
    const marked = [];
    const p = {
        x: 500, y: 400, angle: 0,
        equippedAbilities: [over.ability || 'BLINK', null, null, null],
        abilityCooldowns: [0, 0, 0, 0],
        abilityCooldownsMax: [0, 0, 0, 0],
        activeAbilityEffects: new Map(),
        getPowerupStacks: () => 0,
        _invincibleMs: 0,
        makeInvincible(ms) { this._invincibleMs = ms; },
        gameEngine: {
            gameField: { width: 1000, height: 800 },
            enemyPool: { activeObjects: enemies },
            applyMark(enemy, ms) { marked.push([enemy, ms]); },
            audioManager: null,
        },
        ...over,
    };
    p._marked = marked;
    return p;
}

const enemy = (x, y, extra = {}) => ({ x, y, active: true, isBoss: false, ...extra });

describe('R6.3 — BLINK', () => {
    test('teleports forward by blinkDist and grants i-frames', () => {
        const p = makePlayer({ ability: 'BLINK', x: 100, y: 400, angle: 0 });
        abilities.activateAbility.call(p, 0);
        expect(p.x).toBeCloseTo(100 + ABILITIES.BLINK.blinkDist, 1);
        expect(p.y).toBeCloseTo(400, 1);
        expect(p._invincibleMs).toBe(ABILITIES.BLINK.iFrameMs);
    });

    test('clamps the teleport to the game field', () => {
        const p = makePlayer({ ability: 'BLINK', x: 950, y: 400, angle: 0 }); // forward → past 1000
        abilities.activateAbility.call(p, 0);
        expect(p.x).toBeLessThanOrEqual(1000);
    });
});

describe('R6.3 — GRAVITY_SNARE', () => {
    test('pulls in-range non-boss enemies toward the player (not past minDist)', () => {
        const near = enemy(500 + 300, 400); // 300px to the right, in range
        const far = enemy(500 + 900, 400);  // out of range
        const boss = enemy(500 + 100, 400, { isBoss: true });
        const p = makePlayer({ ability: 'GRAVITY_SNARE', enemies: [near, far, boss] });
        abilities.activateAbility.call(p, 0);
        // near moved closer (x decreased toward 500) but not inside minDist
        expect(near.x).toBeLessThan(800);
        expect(near.x - 500).toBeGreaterThanOrEqual(ABILITIES.GRAVITY_SNARE.minDist - 1);
        // far unchanged, boss unchanged
        expect(far.x).toBe(500 + 900);
        expect(boss.x).toBe(500 + 100);
    });
});

describe('R6.3 — DESIGNATOR', () => {
    test('marks every in-range enemy', () => {
        const inRange = enemy(500 + 200, 400);
        const outRange = enemy(500 + 800, 400);
        const p = makePlayer({ ability: 'DESIGNATOR', enemies: [inRange, outRange] });
        abilities.activateAbility.call(p, 0);
        const markedEnemies = p._marked.map(([e]) => e);
        expect(markedEnemies).toContain(inRange);
        expect(markedEnemies).not.toContain(outRange);
    });
});

describe('R6.3 — SECOND_WIND', () => {
    test('arms a death save on activate', () => {
        const p = makePlayer({ ability: 'SECOND_WIND' });
        expect(!!p._secondWindArmed).toBe(false);
        abilities.activateAbility.call(p, 0);
        expect(p._secondWindArmed).toBe(true);
    });
});

describe('R6.3 — ELEMENTAL_INFUSION', () => {
    test('first cast infuses element[0]; the effect is active', () => {
        const p = makePlayer({ ability: 'ELEMENTAL_INFUSION' });
        abilities.activateAbility.call(p, 0);
        expect(p._infusedElement).toBe(ABILITIES.ELEMENTAL_INFUSION.elements[0]);
        expect(p.activeAbilityEffects.has('ELEMENTAL_INFUSION')).toBe(true);
    });

    test('successive casts cycle through the element list', () => {
        const p = makePlayer({ ability: 'ELEMENTAL_INFUSION' });
        const els = ABILITIES.ELEMENTAL_INFUSION.elements;
        abilities.activateAbility.call(p, 0);
        expect(p._infusedElement).toBe(els[0]);
        p.abilityCooldowns[0] = 0; // clear cd for the next cast
        abilities.activateAbility.call(p, 0);
        expect(p._infusedElement).toBe(els[1]);
    });
});

describe('R6.3 — roster registration', () => {
    test('new abilities exist in ABILITIES with cooldowns', () => {
        for (const id of ['BLINK', 'GRAVITY_SNARE', 'DESIGNATOR', 'SECOND_WIND', 'ELEMENTAL_INFUSION']) {
            expect(ABILITIES[id]).toBeDefined();
            expect(ABILITIES[id].cooldown).toBeGreaterThan(0);
        }
    });
});
