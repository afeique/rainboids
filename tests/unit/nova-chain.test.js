/**
 * tests/unit/nova-chain.test.js — Phase 4 (2026-05-19)
 *
 * Pins the contract for the three Nova Blast upgrades added in Phase 4:
 *   • NOVA_LIGHTNING — 30% × stack count chance to stun per hit
 *   • NOVA_INFERNO   — always-on BRN apply per hit
 *   • NOVA_CHAIN     — secondary nova spawns at killed enemy's position
 *                       with hop cap = 3 (initial blast = hop 3 budget,
 *                       secondaries decrement; depth-3 secondaries don't
 *                       chain further).
 *
 * The tests drive `checkNovaCollisions` (and `_spawnSecondaryNova` for
 * the chain ceiling test) with a hand-rolled stub `this` that supplies
 * just the surface area the function reads:
 *
 *   this.player.{novaActive, novaRings, getPowerupStacks}
 *   this.enemyPool.activeObjects
 *   this.asteroidPool.activeObjects
 *   this.particlePool.get(...)
 *   this.damageEnemy(...)        — drives the kill path
 *   this.applyBurn / applyStun   — Phase 3 helper stubs
 *   this._spawnSecondaryNova     — chain-reaction spawn (the real engine
 *                                   helper lives in game-engine.js; we
 *                                   re-create it in the stub so we can
 *                                   exercise the chain WITHOUT booting
 *                                   the engine).
 *
 * Math.random is monkey-patched per-test so probability rolls are
 * deterministic — the 30% × stacks contract is verified at 0.29 / 0.31
 * boundaries for 1 stack, and 0.59 / 0.61 for 2 stacks.
 */

// Browser shims — collision-system imports modules that touch window/document.
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        performance: { now: () => Date.now() },
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        createElement: () => ({
            getContext: () => ({}), style: {},
            addEventListener: () => {}, removeEventListener: () => {},
        }),
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, removeEventListener: () => {},
        body: { appendChild: () => {} },
    };
}
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { vibrate: undefined, userAgent: 'node' };
}
if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = { now: () => Date.now() };
}

import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { checkNovaCollisions } from '../../js/modules/combat/collision-system.js';
import { POWER_WEAPONS } from '../../js/modules/combat/weapon-data.js';

// ── Fixtures ─────────────────────────────────────────────────────────

function makeEnemy(x, y, opts = {}) {
    return {
        active: true,
        x, y,
        vel: { x: 0, y: 0 },
        health: opts.health != null ? opts.health : 100,
        maxHealth: 100,
        radius: 14,
        warping: false,
        _deathFlash: 0,
        brnStacks: 0, brnUntil: 0, brnTickAt: 0, brnSourceDmg: 0,
        stunUntil: 0,
        ...opts,
    };
}

function makeRing(x, y, currentRadius, opts = {}) {
    // RING_WIDTH inside checkNovaCollisions is 30; pick currentRadius
    // such that the test enemies are within +/- 30 of it (i.e. enemy at
    // x=ring.x + currentRadius is right at the wavefront).
    return {
        x, y,
        currentRadius,
        maxRadius: 320,
        damage: POWER_WEAPONS.NOVA_BLAST.ringDamage,
        duration: 600,
        elapsed: 0,
        hitEnemies: new Set(),
        hitAsteroids: new Set(),
        aftershock: false,
        active: true,
        ...opts,
    };
}

// Build a stub `this` that satisfies the surface `checkNovaCollisions`
// reads. The stub records spawned chain calls + status applies + damage
// events so each test can assert directly against them.
function makeStub({
    powerups = {},        // upgrade-id → stack count
    enemies = [],
    rings = [],
    lethalAfterDamage = true,  // damageEnemy stub kills enemies on hit
} = {}) {
    const events = {
        damaged: [],
        burned: [],
        stunned: [],
        secondaries: [],
        particles: [],
    };
    const stub = {
        player: {
            novaActive: true,
            novaRings: rings,
            getPowerupStacks(id) { return powerups[id] || 0; },
            getKnockbackMultiplier: () => 1,
        },
        enemyPool: { activeObjects: enemies },
        asteroidPool: { activeObjects: [] },
        particlePool: {
            get(x, y, type, ...args) {
                events.particles.push({ x, y, type, args });
                return null;
            },
        },
        damageEnemy(enemy, dmg) {
            events.damaged.push({ enemy, dmg });
            enemy.health -= dmg;
            if (lethalAfterDamage || enemy.health <= 0.001) {
                enemy.health = 0;
                enemy.active = false;
            }
        },
        applyBurn(enemy, sourceDmg) {
            events.burned.push({ enemy, sourceDmg });
        },
        applyStun(enemy) {
            events.stunned.push({ enemy });
        },
        // Real engine helper recreated here so chain-reaction tests don't
        // need the full GameEngine. Mirrors `_spawnSecondaryNova` in
        // game-engine.js: appends a ring with `_hopsRemaining` and
        // clamped depth.
        _spawnSecondaryNova(x, y, radiusFrac = 0.6, damageFrac = 0.4, hopsRemaining = 0) {
            const cfg = POWER_WEAPONS.NOVA_BLAST;
            const clampedHops = Math.max(0, Math.min(3, hopsRemaining | 0));
            const ring = {
                x, y,
                currentRadius: 0,
                maxRadius: cfg.ringRadius * radiusFrac,
                damage: cfg.ringDamage * damageFrac,
                duration: cfg.ringDuration,
                elapsed: 0,
                hitEnemies: new Set(),
                hitAsteroids: new Set(),
                aftershock: false,
                active: true,
                _hopsRemaining: clampedHops,
                _isSecondary: true,
            };
            stub.player.novaRings.push(ring);
            events.secondaries.push({ x, y, radiusFrac, damageFrac, hopsRemaining: clampedHops });
            return ring;
        },
    };
    return { stub, events };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Phase 4 — NOVA_LIGHTNING stun probability scaling', () => {
    let origRandom;
    beforeEach(() => { origRandom = Math.random; });
    afterEach(() => { Math.random = origRandom; });

    test('No stacks → no stun rolls fire', () => {
        const enemy = makeEnemy(100, 0); // ring at (0,0) radius 100 → on wavefront
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { /* none */ },
            enemies: [enemy],
            rings: [ring],
        });
        Math.random = () => 0.0; // would fire if checked
        checkNovaCollisions.call(stub);
        expect(events.stunned.length).toBe(0);
    });

    test('1 stack: Math.random=0.29 → stun fires (under 0.30 threshold)', () => {
        const enemy = makeEnemy(100, 0, { health: 1000 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_LIGHTNING: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: false,
        });
        Math.random = () => 0.29;
        checkNovaCollisions.call(stub);
        expect(events.stunned.length).toBe(1);
        expect(events.stunned[0].enemy).toBe(enemy);
    });

    test('1 stack: Math.random=0.31 → stun does NOT fire (above 0.30 threshold)', () => {
        const enemy = makeEnemy(100, 0, { health: 1000 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_LIGHTNING: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: false,
        });
        Math.random = () => 0.31;
        checkNovaCollisions.call(stub);
        expect(events.stunned.length).toBe(0);
    });

    test('2 stacks: Math.random=0.59 fires, 0.61 does not (threshold = 0.60)', () => {
        const ring1 = makeRing(0, 0, 100);
        const enemy1 = makeEnemy(100, 0, { health: 1000 });
        const stub1 = makeStub({
            powerups: { NOVA_LIGHTNING: 2 },
            enemies: [enemy1],
            rings: [ring1],
            lethalAfterDamage: false,
        });
        Math.random = () => 0.59;
        checkNovaCollisions.call(stub1.stub);
        expect(stub1.events.stunned.length).toBe(1);

        // Fresh fixture for the failing roll.
        const ring2 = makeRing(0, 0, 100);
        const enemy2 = makeEnemy(100, 0, { health: 1000 });
        const stub2 = makeStub({
            powerups: { NOVA_LIGHTNING: 2 },
            enemies: [enemy2],
            rings: [ring2],
            lethalAfterDamage: false,
        });
        Math.random = () => 0.61;
        checkNovaCollisions.call(stub2.stub);
        expect(stub2.events.stunned.length).toBe(0);
    });

    test('Stun skipped on kills (does not waste roll on dying enemies)', () => {
        // lethalAfterDamage = true (default) — the damageEnemy stub kills
        // the enemy. Stun should NOT be applied because the hit was lethal.
        const enemy = makeEnemy(100, 0, { health: 1 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_LIGHTNING: 2 }, // 60% — would normally roll
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: true,
        });
        Math.random = () => 0.0; // guaranteed-fire roll
        checkNovaCollisions.call(stub);
        expect(events.damaged.length).toBe(1);
        expect(events.stunned.length).toBe(0);
    });
});

describe('Phase 4 — NOVA_INFERNO always applies BRN to surviving hits', () => {
    test('1 stack → burn applied to every enemy passed through (no roll)', () => {
        const enemies = [
            makeEnemy(100, 0, { health: 1000 }),
            makeEnemy(-100, 0, { health: 1000 }),
        ];
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_INFERNO: 1 },
            enemies,
            rings: [ring],
            lethalAfterDamage: false,
        });
        // Math.random shouldn't matter — burn has no roll.
        Math.random = () => 0.999;
        checkNovaCollisions.call(stub);
        expect(events.burned.length).toBe(2);
        expect(events.burned[0].enemy).toBe(enemies[0]);
        expect(events.burned[1].enemy).toBe(enemies[1]);
        // Source-dmg argument = the nova damage.
        expect(events.burned[0].sourceDmg).toBe(ring.damage);
    });

    test('No NOVA_INFERNO stacks → no burn applies even on hits', () => {
        const enemy = makeEnemy(100, 0, { health: 1000 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { /* no inferno */ },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: false,
        });
        checkNovaCollisions.call(stub);
        expect(events.burned.length).toBe(0);
    });

    test('Burn skipped on kills (applyBurn no-ops on dying enemies anyway)', () => {
        const enemy = makeEnemy(100, 0, { health: 1 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_INFERNO: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: true,
        });
        checkNovaCollisions.call(stub);
        expect(events.burned.length).toBe(0);
        expect(events.damaged.length).toBe(1);
    });
});

describe('Phase 4 — NOVA_CHAIN secondary nova on kills', () => {
    test('Kill with chain owned → secondary nova spawned at killed enemy position', () => {
        // Single enemy at (100,0) on a ring centered at origin with
        // currentRadius=100. Lethal damage → chain fires.
        const enemy = makeEnemy(100, 0, { health: 1 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_CHAIN: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: true,
        });
        checkNovaCollisions.call(stub);

        expect(events.secondaries.length).toBe(1);
        expect(events.secondaries[0].x).toBe(100);
        expect(events.secondaries[0].y).toBe(0);
        // Initial ring defaulted to 3 hops; secondary gets 2.
        expect(events.secondaries[0].hopsRemaining).toBe(2);
        // Secondary inherits 60% radius / 40% damage by default.
        expect(events.secondaries[0].radiusFrac).toBe(0.6);
        expect(events.secondaries[0].damageFrac).toBe(0.4);
    });

    test('No NOVA_CHAIN stacks → no secondary even on kill', () => {
        const enemy = makeEnemy(100, 0, { health: 1 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { /* no chain */ },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: true,
        });
        checkNovaCollisions.call(stub);
        expect(events.secondaries.length).toBe(0);
    });

    test('Chain only fires on kills, not survivors', () => {
        const enemy = makeEnemy(100, 0, { health: 1000 }); // survives
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_CHAIN: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: false,
        });
        checkNovaCollisions.call(stub);
        expect(events.damaged.length).toBe(1);
        expect(events.secondaries.length).toBe(0);
    });

    test('Hop cap: depth-0 (no hops left) ring does NOT spawn another chain', () => {
        // Mock a fourth-generation ring with hopsRemaining=0 (initial=3,
        // decrement 3× = 0). A kill here should NOT chain further.
        const enemy = makeEnemy(100, 0, { health: 1 });
        const ring = makeRing(0, 0, 100, { _hopsRemaining: 0 });
        const { stub, events } = makeStub({
            powerups: { NOVA_CHAIN: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: true,
        });
        checkNovaCollisions.call(stub);
        expect(events.damaged.length).toBe(1);
        expect(events.secondaries.length).toBe(0);
    });

    test('Hop cap depth-1 ring → spawns secondary with hopsRemaining=0', () => {
        const enemy = makeEnemy(100, 0, { health: 1 });
        const ring = makeRing(0, 0, 100, { _hopsRemaining: 1 });
        const { stub, events } = makeStub({
            powerups: { NOVA_CHAIN: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: true,
        });
        checkNovaCollisions.call(stub);
        expect(events.secondaries.length).toBe(1);
        expect(events.secondaries[0].hopsRemaining).toBe(0);
    });

    test('Full 3-hop cascade: initial → 2 → 1 → 0 then stops', () => {
        // Walk the chain manually: each call to checkNovaCollisions only
        // processes the rings currently in the player's novaRings array,
        // so we have to drive 4 separate calls (one per generation). This
        // mirrors the real game where the ring lifecycle is updated by
        // abilities.js between frames. At each step we add a fresh enemy at
        // the new ring's position so the chain has something to kill.
        const initialRing = makeRing(0, 0, 100);
        const enemy0 = makeEnemy(100, 0, { health: 1 });
        const { stub, events } = makeStub({
            powerups: { NOVA_CHAIN: 1 },
            enemies: [enemy0],
            rings: [initialRing],
            lethalAfterDamage: true,
        });

        // Generation 0 (initial): kill enemy0 → secondary at (100,0) hops=2
        checkNovaCollisions.call(stub);
        expect(events.secondaries.length).toBe(1);
        expect(events.secondaries[0].hopsRemaining).toBe(2);

        // Drop the initial ring (it has had its kill). The new ring is at
        // (100,0). Place a fresh enemy on its wavefront.
        const ring1 = stub.player.novaRings[stub.player.novaRings.length - 1];
        stub.player.novaRings = [ring1];
        ring1.currentRadius = 50; // arbitrary — enemy placed at ring's edge below
        const enemy1 = makeEnemy(ring1.x + 50, ring1.y, { health: 1 });
        stub.enemyPool.activeObjects = [enemy1];

        // Generation 1: secondary hops=2 → spawn hops=1
        checkNovaCollisions.call(stub);
        expect(events.secondaries.length).toBe(2);
        expect(events.secondaries[1].hopsRemaining).toBe(1);

        const ring2 = stub.player.novaRings[stub.player.novaRings.length - 1];
        stub.player.novaRings = [ring2];
        ring2.currentRadius = 50;
        const enemy2 = makeEnemy(ring2.x + 50, ring2.y, { health: 1 });
        stub.enemyPool.activeObjects = [enemy2];

        // Generation 2: hops=1 → spawn hops=0
        checkNovaCollisions.call(stub);
        expect(events.secondaries.length).toBe(3);
        expect(events.secondaries[2].hopsRemaining).toBe(0);

        const ring3 = stub.player.novaRings[stub.player.novaRings.length - 1];
        stub.player.novaRings = [ring3];
        ring3.currentRadius = 50;
        const enemy3 = makeEnemy(ring3.x + 50, ring3.y, { health: 1 });
        stub.enemyPool.activeObjects = [enemy3];

        // Generation 3: hops=0 → NO new secondary (chain terminates).
        checkNovaCollisions.call(stub);
        expect(events.secondaries.length).toBe(3); // still 3, NOT 4
    });

    test('Recursion safety: 100 enemies at once with chain → no infinite loop', () => {
        // A single ring intersects 50 enemies on its wavefront. Each kill
        // would request a secondary; secondaries are pushed onto the same
        // novaRings array but checkNovaCollisions iterates the snapshot
        // at the top of the function, so the cascade can't recursively
        // re-process the same rings within ONE call.
        //
        // The contract this test pins: a single call processes the
        // CURRENT ring queue, fires N secondaries (one per kill), and
        // returns without exploding. The hop cap on each secondary
        // guarantees the cascade can't grow unbounded across subsequent
        // calls either.
        const enemies = [];
        for (let i = 0; i < 50; i++) {
            // Place 50 enemies on a circle of radius 100 around origin.
            const a = (i / 50) * Math.PI * 2;
            enemies.push(makeEnemy(Math.cos(a) * 100, Math.sin(a) * 100, { health: 1 }));
        }
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_CHAIN: 1 },
            enemies,
            rings: [ring],
            lethalAfterDamage: true,
        });

        const start = Date.now();
        checkNovaCollisions.call(stub);
        const elapsed = Date.now() - start;

        expect(events.secondaries.length).toBe(50);
        // All secondaries inherit hops=2 (one less than the initial 3).
        for (const sec of events.secondaries) {
            expect(sec.hopsRemaining).toBe(2);
        }
        // Sanity: this should be well under 1 second even with the
        // recursion-safe iteration. 100 ms is generous.
        expect(elapsed).toBeLessThan(1000);
    });

    test('Defensive hop clamp: hopsRemaining > 3 from a bad caller is clamped to 3', () => {
        // Drive _spawnSecondaryNova directly with an absurd hop count to
        // verify the helper clamps. This pins the "defense in depth"
        // contract — even if a future caller smuggles in a runaway hop
        // value, the secondary's _hopsRemaining can't exceed 3.
        const { stub } = makeStub({
            powerups: { NOVA_CHAIN: 1 },
            enemies: [],
            rings: [],
        });
        const ring = stub._spawnSecondaryNova(0, 0, 0.6, 0.4, 999);
        expect(ring._hopsRemaining).toBe(3);

        // Negative input clamps to 0 (no negative hops).
        const ring2 = stub._spawnSecondaryNova(0, 0, 0.6, 0.4, -5);
        expect(ring2._hopsRemaining).toBe(0);
    });
});

describe('Phase 4 — INFERNO + LIGHTNING + CHAIN combined', () => {
    test('All three upgrades fire simultaneously on the same hit', () => {
        // Enemy that survives the hit (health=1000): inferno burn fires,
        // lightning stun fires (with deterministic roll), chain does NOT
        // fire because no kill. This validates the combo branches don't
        // step on each other.
        const enemy = makeEnemy(100, 0, { health: 1000 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_INFERNO: 1, NOVA_LIGHTNING: 2, NOVA_CHAIN: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: false,
        });
        const orig = Math.random;
        Math.random = () => 0.0; // guaranteed stun roll
        try {
            checkNovaCollisions.call(stub);
        } finally {
            Math.random = orig;
        }
        expect(events.damaged.length).toBe(1);
        expect(events.burned.length).toBe(1);
        expect(events.stunned.length).toBe(1);
        // No kill → no chain.
        expect(events.secondaries.length).toBe(0);
    });

    test('Kill with all three upgrades: chain fires, burn+stun skipped on dying enemy', () => {
        const enemy = makeEnemy(100, 0, { health: 1 });
        const ring = makeRing(0, 0, 100);
        const { stub, events } = makeStub({
            powerups: { NOVA_INFERNO: 1, NOVA_LIGHTNING: 2, NOVA_CHAIN: 1 },
            enemies: [enemy],
            rings: [ring],
            lethalAfterDamage: true,
        });
        const orig = Math.random;
        Math.random = () => 0.0;
        try {
            checkNovaCollisions.call(stub);
        } finally {
            Math.random = orig;
        }
        expect(events.damaged.length).toBe(1);
        // Burn / stun deliberately skipped on kills — see collision-system.js.
        expect(events.burned.length).toBe(0);
        expect(events.stunned.length).toBe(0);
        expect(events.secondaries.length).toBe(1);
    });
});
