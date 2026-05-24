/**
 * tests/unit/mechanic-mods-w3.test.js — Phase W3 mechanic-mod vs efficacy split.
 *
 * Pins the classification that W4 (efficacy-only cards) + W5 (upfront mod nodes)
 * consume: pierce/explode/home/stun/knock procs + weapon capstones are MECHANIC
 * MODS (upfront); everything else (more/faster/bigger) is EFFICACY (cards).
 */

if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1280, innerHeight: 720,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        location: { search: '' }, devicePixelRatio: 1,
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
}

import { describe, expect, test } from '@jest/globals';
import {
    isMechanicMod, getMechanicMods, getEfficacyUpgrades,
    getPrimaryUpgrades, getPowerUpgrades, PRIMARY_WEAPONS, POWER_WEAPONS,
} from '../../js/modules/combat/weapon-data.js';

describe('isMechanicMod — classification', () => {
    test('the generic procs are mechanic mods', () => {
        for (const id of ['PULSE_PIERCING', 'NEEDLE_EXPLODE', 'SCATTER_HOMING', 'RAIL_STUN', 'PULSE_KNOCK']) {
            expect(isMechanicMod(id)).toBe(true);
        }
    });

    test('weapon capstones are mechanic mods', () => {
        for (const id of ['MEIOSIS', 'CHARGED_CAROMS', 'RAZOR_EDGE', 'IMPLOSION',
            'DAISY_CHAIN', 'CLUSTER_WARHEAD', 'REFRACTION', 'EVENT_HORIZON',
            'SHATTER', 'AFTERBURN', 'NOVA_CHAIN', 'CHARGE_OVERCHARGE', 'MISSILE_PIERCING']) {
            expect(isMechanicMod(id)).toBe(true);
        }
    });

    test('amplifier-style upgrades are efficacy (not mods)', () => {
        for (const id of ['PULSE_MULTI', 'PULSE_RAPID', 'PULSE_BIG', 'SPLIT_CELLS',
            'EXTRA_BOUNCE', 'LONG_THROW', 'FLYWHEEL', 'OVERSPIN', 'FLECHETTE',
            'EVENT_WAKE', 'SINGULAR_PULL', 'SHOCKWAVE', 'BEAM_WIDTH', 'AMPLIFIER',
            'PROXIMITY_FUSE', 'EXTRA_PAYLOAD', 'EXTRA_ORDNANCE', 'PRISM_BEAMS']) {
            expect(isMechanicMod(id)).toBe(false);
        }
    });

    test('null / unknown ids are not mods', () => {
        expect(isMechanicMod(null)).toBe(false);
        expect(isMechanicMod('TOTALLY_MADE_UP')).toBe(false);
    });
});

describe('getMechanicMods / getEfficacyUpgrades — partition', () => {
    test('Pulse Cannon: 5 mods (procs) + 3 efficacy', () => {
        expect(getMechanicMods('PULSE_CANNON').map((u) => u.id).sort()).toEqual(
            ['PULSE_EXPLODE', 'PULSE_HOMING', 'PULSE_KNOCK', 'PULSE_PIERCING', 'PULSE_STUN']);
        expect(getEfficacyUpgrades('PULSE_CANNON').map((u) => u.id).sort()).toEqual(
            ['PULSE_BIG', 'PULSE_MULTI', 'PULSE_RAPID']);
    });

    test('every weapon partitions cleanly (mods + efficacy = all, no overlap)', () => {
        const ids = [...Object.keys(PRIMARY_WEAPONS), ...Object.keys(POWER_WEAPONS)];
        for (const wid of ids) {
            const all = PRIMARY_WEAPONS[wid] ? getPrimaryUpgrades(wid) : getPowerUpgrades(wid);
            const mods = getMechanicMods(wid);
            const eff = getEfficacyUpgrades(wid);
            expect(mods.length + eff.length).toBe(all.length);
            const modIds = new Set(mods.map((u) => u.id));
            expect(eff.every((u) => !modIds.has(u.id))).toBe(true); // no overlap
        }
    });
});
