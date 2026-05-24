// Phase W6 — ability-attunement RUNTIME application. Pins that an ability with
// an active attunement element lands that element on the enemies its verb
// affects (area-on-activate verbs) and that drone rounds carry it. The
// element→verb dispatch itself (Pyro burn, Cryo freeze, …) is pinned via
// applyWeaponElementStatus, the same applicator abilities reuse.
import * as abilities from '../../js/modules/player/abilities.js';
import { applyWeaponElementStatus } from '../../js/modules/combat/collision-system.js';
import { ABILITIES } from '../../js/modules/combat/weapon-data.js';

const enemy = (x, y, extra = {}) => ({ x, y, active: true, isBoss: false, ...extra });

function makePlayer(over = {}) {
    const enemies = over.enemies || [];
    const elemHits = []; // [enemy, element] pairs from applyAbilityElement
    const p = {
        x: 500, y: 400, angle: 0,
        equippedAbilities: [over.ability || 'EMP_PULSE', null, null, null],
        abilityCooldowns: [0, 0, 0, 0],
        abilityCooldownsMax: [0, 0, 0, 0],
        activeAbilityEffects: new Map(),
        getPowerupStacks: () => 0,
        getEffectiveMaxHealth: () => 100,
        health: 100,
        _invincibleMs: 0,
        makeInvincible(ms) { this._invincibleMs = ms; },
        novaRings: [], singularities: [], cryoRings: [], lightningChains: [],
        orbitalStrikes: [], deflectorOrbs: [], sentryDrones: [],
        isDashing: false,
        activeAbilityAttuneElement: over.attune || {},
        gameEngine: {
            gameField: { width: 1000, height: 800 },
            enemyPool: { activeObjects: enemies },
            applyMark() {}, applyFreeze() {}, applyChill() {}, applyStun() {},
            applyAbilityElement(e, el) { elemHits.push([e, el]); },
            audioManager: null,
        },
        ...over,
    };
    p._elemHits = elemHits;
    return p;
}

describe('W6 runtime — area-on-activate abilities land their element', () => {
    test('EMP_PULSE (PYRO) burns in-range enemies; spares out-of-range', () => {
        const near = enemy(500 + 80, 400);
        const far = enemy(500 + 900, 400);
        const p = makePlayer({ ability: 'EMP_PULSE', enemies: [near, far], attune: { EMP_PULSE: 'PYRO' } });
        abilities.activateAbility.call(p, 0);
        const hit = p._elemHits;
        expect(hit.some(([e, el]) => e === near && el === 'PYRO')).toBe(true);
        expect(hit.some(([e]) => e === far)).toBe(false);
    });

    test('GRAVITY_SNARE (CRYO) lands CRYO on snared enemies', () => {
        const near = enemy(500 + 200, 400);
        const p = makePlayer({ ability: 'GRAVITY_SNARE', enemies: [near], attune: { GRAVITY_SNARE: 'CRYO' } });
        abilities.activateAbility.call(p, 0);
        expect(p._elemHits.some(([e, el]) => e === near && el === 'CRYO')).toBe(true);
    });

    test('DESIGNATOR (TOXIC) lands TOXIC on marked enemies', () => {
        const inR = enemy(500 + 150, 400);
        const outR = enemy(500 + 800, 400);
        const p = makePlayer({ ability: 'DESIGNATOR', enemies: [inR, outR], attune: { DESIGNATOR: 'TOXIC' } });
        abilities.activateAbility.call(p, 0);
        expect(p._elemHits.some(([e, el]) => e === inR && el === 'TOXIC')).toBe(true);
        expect(p._elemHits.some(([e]) => e === outR)).toBe(false);
    });

    test('FIELD_MEDIC (PYRO) erupts a fire burst on nearby enemies', () => {
        const near = enemy(500 + 100, 400);
        const p = makePlayer({ ability: 'FIELD_MEDIC', enemies: [near], attune: { FIELD_MEDIC: 'PYRO' } });
        abilities.activateAbility.call(p, 0);
        expect(p._elemHits.some(([e, el]) => e === near && el === 'PYRO')).toBe(true);
    });

    test('BLINK (VOLT) leaves a discharge at the arrival point', () => {
        // BLINK teleports forward blinkDist along angle 0; an enemy near the
        // landing spot should take VOLT.
        const dist = ABILITIES.BLINK.blinkDist;
        const atExit = enemy(500 + dist + 40, 400);
        const p = makePlayer({ ability: 'BLINK', enemies: [atExit], attune: { BLINK: 'VOLT' } });
        abilities.activateAbility.call(p, 0);
        expect(p._elemHits.some(([e, el]) => e === atExit && el === 'VOLT')).toBe(true);
    });

    test('no attunement → no element applied', () => {
        const near = enemy(500 + 80, 400);
        const p = makePlayer({ ability: 'EMP_PULSE', enemies: [near], attune: {} });
        abilities.activateAbility.call(p, 0);
        expect(p._elemHits.length).toBe(0);
    });
});

describe('W6 runtime — SENTRY_DRONE rounds carry the element', () => {
    function makeDroneShooter(attune) {
        let last = null;
        const p = {
            activeAbilityAttuneElement: attune,
            gameEngine: {
                bulletPool: { get(x, y, ang) { last = { x, y, ang, elements: undefined }; return last; } },
                particlePool: null,
            },
        };
        p._last = () => last;
        return p;
    }
    test('Tesla Drones stamp VOLT on the round', () => {
        const p = makeDroneShooter({ SENTRY_DRONE: 'VOLT' });
        abilities.spawnSentryDroneBullet.call(p, { x: 0, y: 0, aimAngle: 0 }, 5);
        expect(p._last().element).toBe('VOLT');
        expect(p._last().elements).toEqual(['VOLT']);
    });
    test('un-attuned drones stay KINETIC', () => {
        const p = makeDroneShooter({});
        abilities.spawnSentryDroneBullet.call(p, { x: 0, y: 0, aimAngle: 0 }, 5);
        expect(p._last().element).toBe('KINETIC');
        expect(p._last().elements).toBeNull();
    });
});

describe('W6 runtime — element → verb dispatch (shared applicator)', () => {
    function spyEngine() {
        const calls = {};
        const rec = (k) => (e, ...a) => { (calls[k] = calls[k] || []).push([e, ...a]); };
        return {
            calls,
            applyBurn: rec('burn'), applyChill: rec('chill'), applyFreeze: rec('freeze'),
            applyConduct: rec('conduct'), applyStun: rec('stun'), applyCorrode: rec('corrode'),
            applyBleed: rec('bleed'), applyMark: rec('mark'),
        };
    }
    const target = () => ({ x: 0, y: 0, active: true, brnUntil: 0, chillUntil: 0, corrodeUntil: 0, markUntil: 0 });

    test('PYRO → burn', () => {
        const ge = spyEngine();
        applyWeaponElementStatus.call(ge, target(), 'PYRO', 30);
        expect(ge.calls.burn).toHaveLength(1);
    });
    test('CRYO at high dealt → freeze', () => {
        const ge = spyEngine();
        applyWeaponElementStatus.call(ge, target(), 'CRYO', 30);
        expect(ge.calls.freeze).toHaveLength(1);
    });
    test('VOLT → conduct', () => {
        const ge = spyEngine();
        applyWeaponElementStatus.call(ge, target(), 'VOLT', 30);
        expect(ge.calls.conduct).toHaveLength(1);
    });
    test('TOXIC → corrode', () => {
        const ge = spyEngine();
        applyWeaponElementStatus.call(ge, target(), 'TOXIC', 30);
        expect(ge.calls.corrode).toHaveLength(1);
    });
    test('VOID → mark', () => {
        const ge = spyEngine();
        applyWeaponElementStatus.call(ge, target(), 'VOID', 30);
        expect(ge.calls.mark).toHaveLength(1);
    });
});
