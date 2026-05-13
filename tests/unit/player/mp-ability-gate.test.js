/**
 * tests/unit/player/mp-ability-gate.test.js — unit tests for the MP
 * feature-flag suppression gate at the Player ability fire-site.
 *
 * The gate wires `js/net/mp-feature-flags.js::isAbilityMpSafe(id)` into
 * `Player.firePower()` and `Player.activateSkill()` so that, when the
 * engine driver reports `isOnline === true`, abilities lacking full
 * Rust-mirror parity early-return without spawning entities / consuming
 * cooldown / playing audio.
 *
 * Strategy: instead of module-mocking (ESM module exports are read-only
 * in Jest, so jest.spyOn() can't replace them), the tests observe
 * concrete side-effects of the underlying weapons/skills implementation:
 *
 *   • activateSkill → `activeSkillCooldown` flips from 0 to config.cooldown
 *     and `activeSkillEffects` gains an entry, OR neither does if gated.
 *   • firePower (NOVA_BLAST) → `powerCooldown` flips to non-zero and
 *     `novaRings` gains an entry, OR neither does if gated.
 *
 * These tests pin the contract:
 *   • MP-unsafe id + online → state unchanged (gated)
 *   • MP-unsafe id + solo → state changes (unchanged behavior)
 *   • MP-safe id + online → state changes (allowlist path)
 *   • Unknown id + online → state changes (conservative-permissive default)
 *   • All 6 power weapons + all 6 defense skills are individually gated.
 *
 * The lists themselves track Phase 2.5 collision-pair progress in
 * `docs/Multiplayer Coordination – 2026-05-09.md`; as Rust mirrors land,
 * abilities migrate from MP_UNSAFE → MP_SAFE and these tests should
 * be updated alongside js/net/mp-feature-flags.js.
 */

// ---------------------------------------------------------------------------
// Browser shims — must happen before any game module import (player.js
// reads `window.innerWidth` in its constructor). Same pattern as
// tests/unit/pool.test.js.
// ---------------------------------------------------------------------------
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({ getContext: () => ({}), style: {}, addEventListener: () => {} }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined };
}

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import { Player } from '../../../js/modules/player/player.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setOnline(value) {
    globalThis.window.engineDriver = value
        ? { isOnline: true }
        : { isOnline: false };
}

function clearDriver() {
    delete globalThis.window.engineDriver;
}

/**
 * Snapshot the observable side-effect fields the gate guards. After
 * calling firePower / activateSkill, comparing snapshots tells us whether
 * the underlying weapons/skills implementation actually ran.
 */
function snapshotState(player) {
    return {
        powerCooldown: player.powerCooldown,
        activeSkillCooldown: player.activeSkillCooldown,
        novaRingCount: player.novaRings.length,
        activeMineCount: player.activeMines.length,
        skillEffectCount: player.activeSkillEffects.size,
    };
}

function stateUnchanged(before, after) {
    return JSON.stringify(before) === JSON.stringify(after);
}

/** Minimal audio manager shape that weapons.firePower can call into. */
function mockAudio() {
    return {
        playShoot: () => {},
        playSound: () => true,
        startLoop: () => {},
    };
}

/** Minimal particle pool shape for spawnMuzzleFlare / fireNova. */
function mockParticlePool() {
    return {
        get: () => ({ life: 0, length: 0 }),
    };
}

// ---------------------------------------------------------------------------
// Tests — firePower gate
// ---------------------------------------------------------------------------

describe('Player.firePower — MP feature-flag gate', () => {
    let player;

    beforeEach(() => {
        player = new Player();
        // Force a deterministic state. `powerCooldown` is 0 from
        // initializePlayer(), and `novaRings`/`activeMines` start empty.
        player.powerCooldown = 0;
        player.novaRings = [];
        player.activeMines = [];
    });

    afterEach(() => {
        clearDriver();
    });

    test('NOVA_BLAST + online → no state change (suppressed)', () => {
        setOnline(true);
        player.activePower = 'NOVA_BLAST';
        const before = snapshotState(player);
        player.firePower({}, mockAudio(), mockParticlePool());
        const after = snapshotState(player);
        expect(stateUnchanged(before, after)).toBe(true);
        expect(after.powerCooldown).toBe(0);
        expect(after.novaRingCount).toBe(0);
    });

    test('NOVA_BLAST + solo → state changes (unchanged behavior)', () => {
        setOnline(false);
        player.activePower = 'NOVA_BLAST';
        player.firePower({}, mockAudio(), mockParticlePool());
        // fireNova sets powerCooldown and pushes a ring to novaRings —
        // both observable signals that the dispatch ran.
        expect(player.powerCooldown).toBeGreaterThan(0);
        expect(player.novaRings.length).toBe(1);
    });

    test('NOVA_BLAST + no driver attached → state changes (early-init safe)', () => {
        clearDriver();
        player.activePower = 'NOVA_BLAST';
        player.firePower({}, mockAudio(), mockParticlePool());
        expect(player.powerCooldown).toBeGreaterThan(0);
        expect(player.novaRings.length).toBe(1);
    });

    test('MINE_LAYER + online → no state change (suppressed)', () => {
        setOnline(true);
        player.activePower = 'MINE_LAYER';
        const before = snapshotState(player);
        player.firePower({}, mockAudio(), mockParticlePool());
        const after = snapshotState(player);
        expect(stateUnchanged(before, after)).toBe(true);
        expect(after.activeMineCount).toBe(0);
    });

    test('MINE_LAYER + solo → state changes (mine pushed, cooldown set)', () => {
        setOnline(false);
        player.activePower = 'MINE_LAYER';
        player.firePower({}, mockAudio(), mockParticlePool());
        expect(player.activeMines.length).toBe(1);
        expect(player.powerCooldown).toBeGreaterThan(0);
    });

    test('unknown power id + online → dispatch reached (conservative-permissive)', () => {
        // An unknown id doesn't match a real branch in weapons.firePower's
        // switch, so the dispatch falls through to `audioManager.playShoot()`
        // (the default tail of the function). We use that to assert the
        // gate let it through — if the gate had suppressed it, playShoot
        // would never be called.
        setOnline(true);
        player.activePower = 'TOTALLY_FAKE_WEAPON_XYZ';
        let played = false;
        const audio = { ...mockAudio(), playShoot: () => { played = true; } };
        player.firePower({}, audio, mockParticlePool());
        expect(played).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Tests — activateSkill gate
// ---------------------------------------------------------------------------

describe('Player.activateSkill — MP feature-flag gate', () => {
    let player;

    beforeEach(() => {
        player = new Player();
        // Fresh state; activateSkill checks cooldown > 0 as a precondition.
        player.activeSkillCooldown = 0;
        player.activeSkillEffects = new Map();
    });

    afterEach(() => {
        clearDriver();
    });

    test('BULWARK + online → no state change, returns false (suppressed)', () => {
        setOnline(true);
        player.activeSkill = 'BULWARK';
        const before = snapshotState(player);
        const result = player.activateSkill();
        const after = snapshotState(player);
        expect(result).toBe(false);
        expect(stateUnchanged(before, after)).toBe(true);
        expect(after.activeSkillCooldown).toBe(0);
        expect(after.skillEffectCount).toBe(0);
    });

    test('BULWARK + solo → state changes (cooldown + effect set)', () => {
        setOnline(false);
        player.activeSkill = 'BULWARK';
        const result = player.activateSkill();
        expect(result).toBe(true);
        expect(player.activeSkillCooldown).toBeGreaterThan(0);
        expect(player.activeSkillEffects.has('BULWARK')).toBe(true);
    });

    // 5.93.0 — PHASE_DASH was removed from DEFENSE_SKILLS and is now
    // a core SHIFT-key movement primitive on Player.update. The
    // activateSkill path no longer has a PHASE_DASH branch — selecting
    // it as `activeSkill` would fall through the DEFENSE_SKILLS lookup
    // miss and return false. See the shift-dash test suite for the
    // new dash trigger contract.
    test('PHASE_DASH is no longer recognized by activateSkill (5.93.0)', () => {
        setOnline(false);
        player.activeSkill = 'PHASE_DASH';
        const result = player.activateSkill();
        // DEFENSE_SKILLS no longer contains PHASE_DASH, so activateSkill
        // returns false at the lookup-miss branch even when solo. The
        // important contract: no skill effect is set, no cooldown is
        // burned. Dash is triggered via Player._triggerDash, not here.
        expect(result).toBe(false);
        expect(player.activeSkillCooldown).toBe(0);
        expect(player.activeSkillEffects.has('PHASE_DASH')).toBe(false);
    });

    test('every remaining defense skill is suppressed when online', () => {
        // 5.93.0 — PHASE_DASH removed from this list (now a SHIFT-key
        // core movement primitive). Five skills remain MP-gated.
        const defenseSkills = [
            'BULWARK',
            'REPAIR_NANITES',
            'DEFLECTOR_ORBS',
            'EMP_PULSE',
            'TRACTOR_SHIELD',
        ];
        for (const id of defenseSkills) {
            setOnline(true);
            const fresh = new Player();
            fresh.activeSkillCooldown = 0;
            fresh.activeSkillEffects = new Map();
            fresh.activeSkill = id;
            const result = fresh.activateSkill();
            expect(result).toBe(false);
            expect(fresh.activeSkillCooldown).toBe(0);
            expect(fresh.activeSkillEffects.size).toBe(0);
        }
    });

    test('unknown skill id + online → dispatch reached, lookup-misses internally', () => {
        // activateSkill returns false when DEFENSE_SKILLS[skillId] is
        // undefined — the gate-permissive path lets the dispatch run and
        // the inner lookup-miss returns false. Observable signal:
        // `activeSkillCooldown` stays 0 (the dispatch's own early-return
        // path), but the gate itself did NOT block — we'd only know that
        // by checking the helper. Cover both paths.
        setOnline(true);
        const fresh = new Player();
        fresh.activeSkill = 'FAKE_SKILL_FOR_TEST';
        fresh.activeSkillCooldown = 0;
        fresh.activeSkillEffects = new Map();
        // Helper returns false for unknown ids → not suppressed by gate.
        expect(fresh._isAbilitySuppressedByMp('FAKE_SKILL_FOR_TEST')).toBe(false);
        const result = fresh.activateSkill();
        // Inner activateSkill returns false because DEFENSE_SKILLS lookup
        // misses. The contract we care about is: the gate did NOT block.
        expect(result).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Tests — _isAbilitySuppressedByMp helper directly
// ---------------------------------------------------------------------------

describe('Player._isAbilitySuppressedByMp — direct helper contract', () => {
    let player;

    beforeEach(() => {
        player = new Player();
    });

    afterEach(() => {
        clearDriver();
    });

    test('no driver → returns false (solo init safe)', () => {
        clearDriver();
        expect(player._isAbilitySuppressedByMp('NOVA_BLAST')).toBe(false);
    });

    test('driver offline → returns false for unsafe ids', () => {
        setOnline(false);
        expect(player._isAbilitySuppressedByMp('NOVA_BLAST')).toBe(false);
        expect(player._isAbilitySuppressedByMp('BULWARK')).toBe(false);
    });

    test('driver online + MP-safe id → returns false', () => {
        setOnline(true);
        expect(player._isAbilitySuppressedByMp('PULSE_CANNON')).toBe(false);
        expect(player._isAbilitySuppressedByMp('STORM_NEEDLES')).toBe(false);
        expect(player._isAbilitySuppressedByMp('SCATTER_GUN')).toBe(false);
        expect(player._isAbilitySuppressedByMp('RAIL_DRIVER')).toBe(false);
    });

    test('driver online + MP-unsafe id → returns true', () => {
        setOnline(true);
        expect(player._isAbilitySuppressedByMp('NOVA_BLAST')).toBe(true);
        expect(player._isAbilitySuppressedByMp('MINE_LAYER')).toBe(true);
        expect(player._isAbilitySuppressedByMp('LANCE_BEAM')).toBe(true);
        expect(player._isAbilitySuppressedByMp('BULWARK')).toBe(true);
        expect(player._isAbilitySuppressedByMp('REPAIR_NANITES')).toBe(true);
    });

    test('driver online + unknown id → returns false (permissive)', () => {
        setOnline(true);
        expect(player._isAbilitySuppressedByMp('UNKNOWN_THING')).toBe(false);
        expect(player._isAbilitySuppressedByMp('')).toBe(false);
    });

    test('driver online + PHASE_DASH → returns false (no longer MP-unsafe in 5.93.0)', () => {
        // PHASE_DASH was removed from MP_UNSAFE_ABILITIES_LIST when it
        // was promoted to a core SHIFT-key movement primitive. The
        // helper now treats it as an unknown id and falls through to
        // the permissive default — i.e., the dash is allowed in MP.
        setOnline(true);
        expect(player._isAbilitySuppressedByMp('PHASE_DASH')).toBe(false);
    });
});
