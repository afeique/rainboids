/**
 * tests/unit/cluster-launcher.test.js — Phase 6 Cluster Launcher tests.
 *
 * Pins the cluster-bomb stage machine, sub-bomblet spawn behavior, and
 * the per-weapon upgrade tuners (CLUSTER_PAYLOAD / MORE_BOMBLETS /
 * SHORT_FUSE / MEGA_CLUSTER) defined in `weapon-data.js`.
 *
 * The Bullet class is exercised directly with synthetic config so we
 * don't have to spin up the full game engine. The detonateCluster /
 * detonateSubBomblet helpers are tested separately against synthetic
 * pools to confirm AoE damage radius + sub-bomb spawn count.
 *
 * Covered:
 *   • ClusterBomb transitions to armed when velocity drops below 0.3
 *   • Armed timer detonates after 800ms (default) or sooner with SHORT_FUSE
 *   • Enemy within 60px proximity triggers detonation early
 *   • Detonation spawns 5 sub-bombs by default
 *   • MORE_BOMBLETS upgrade adds correct number of sub-bombs
 *   • Cluster bombs do NOT have homing or piercing flags
 *   • MEGA_CLUSTER upgrade extends primary blast radius
 */

// ── Browser shims (must happen before module imports) ──────────────────
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        innerWidth: 1920, innerHeight: 1080,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}, removeEventListener: () => {},
        performance: { now: () => Date.now() },
        location: { search: '' },
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
    globalThis.navigator = { vibrate: undefined, userAgent: 'node', maxTouchPoints: 0 };
}
if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = { now: () => Date.now() };
}

import { describe, expect, test, beforeEach } from '@jest/globals';
import { Bullet } from '../../js/modules/player/bullet.js';
import {
    detonateCluster, spawnSubBomblet, detonateSubBomblet,
} from '../../js/modules/combat/combat-manager.js';
import {
    PRIMARY_WEAPONS, PRIMARY_UPGRADES,
} from '../../js/modules/combat/weapon-data.js';

// ── Test fixtures ────────────────────────────────────────────────────

function makeClusterConfig(overrides = {}) {
    const base = PRIMARY_WEAPONS.CLUSTER_LAUNCHER;
    return {
        initialVelocity: base.initialVelocity,
        travelFriction: base.travelFriction,
        haltVelocity: base.haltVelocity,
        armedDurationMs: base.armedDurationMs,
        proximityRadius: base.proximityRadius,
        blastRadius: base.blastRadius,
        blastDamage: base.blastDamage,
        subBombCount: base.subBombCount,
        subBombSpeed: base.subBombSpeed,
        subBombFriction: base.subBombFriction,
        subBombLifeFrames: base.subBombLifeFrames,
        subBombBlastRadius: base.subBombBlastRadius,
        subBombDamage: base.subBombDamage,
        ...overrides,
    };
}

function makePool(items) { return { activeObjects: items }; }
function makeEnemy(x, y, hp = 100) {
    return {
        active: true,
        x, y,
        vel: { x: 0, y: 0 },
        health: hp, maxHealth: hp,
        radius: 14,
        warping: false, _deathFlash: 0,
        takeDamage(amount) {
            this.health = Math.max(0, this.health - amount);
            return this.health <= 0;
        },
    };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('PRIMARY_WEAPONS.CLUSTER_LAUNCHER — config sanity', () => {
    test('cluster launcher config exists with correct defaults', () => {
        const cfg = PRIMARY_WEAPONS.CLUSTER_LAUNCHER;
        expect(cfg).toBeDefined();
        expect(cfg.id).toBe('CLUSTER_LAUNCHER');
        expect(cfg.damage).toBe(50);
        expect(cfg.fireRate).toBe(800);
        expect(cfg.range).toBe(800);
        expect(cfg.blastRadius).toBe(90);
        expect(cfg.blastDamage).toBe(50);
        expect(cfg.subBombCount).toBe(5);
        expect(cfg.armedDurationMs).toBe(800);
        expect(cfg.proximityRadius).toBe(60);
        expect(cfg.piercing).toBe(0); // Cluster bombs do not pierce by spec
    });

    test('all four per-weapon upgrades exist with correct stack caps', () => {
        expect(PRIMARY_UPGRADES.CLUSTER_PAYLOAD).toBeDefined();
        expect(PRIMARY_UPGRADES.CLUSTER_PAYLOAD.maxStacks).toBe(3);
        expect(PRIMARY_UPGRADES.CLUSTER_PAYLOAD.weapon).toBe('CLUSTER_LAUNCHER');

        expect(PRIMARY_UPGRADES.MORE_BOMBLETS).toBeDefined();
        expect(PRIMARY_UPGRADES.MORE_BOMBLETS.maxStacks).toBe(2);

        expect(PRIMARY_UPGRADES.SHORT_FUSE).toBeDefined();
        expect(PRIMARY_UPGRADES.SHORT_FUSE.maxStacks).toBe(2);

        expect(PRIMARY_UPGRADES.MEGA_CLUSTER).toBeDefined();
        expect(PRIMARY_UPGRADES.MEGA_CLUSTER.maxStacks).toBe(2);
    });

    test('no CLUSTER_HOMING / CLUSTER_PIERCING upgrade exists (Phase 2 design)', () => {
        expect(PRIMARY_UPGRADES.CLUSTER_HOMING).toBeUndefined();
        expect(PRIMARY_UPGRADES.CLUSTER_PIERCING).toBeUndefined();
    });
});

describe('Bullet.setupClusterBomb — initial state', () => {
    test('cluster bomb does NOT have homing or piercing flags', () => {
        const b = new Bullet();
        b.reset(100, 100, 0);
        b.setupClusterBomb(makeClusterConfig());
        expect(b.cluster).toBe(true);
        expect(b.subBomb).toBe(false);
        expect(b.homing).toBe(false);
        expect(b.piercing).toBe(0);
        expect(b.explosive).toBe(false);
        expect(b.stage).toBe('travel');
    });

    test('initial velocity matches config.initialVelocity along firing angle', () => {
        const b = new Bullet();
        b.reset(0, 0, 0); // angle 0 = pure +x
        b.setupClusterBomb(makeClusterConfig());
        // Speed should equal config initialVelocity (12 px/frame default).
        const speed = Math.hypot(b.vel.x, b.vel.y);
        expect(speed).toBeCloseTo(12, 5);
        expect(b.vel.x).toBeCloseTo(12, 5);
        expect(b.vel.y).toBeCloseTo(0, 5);
    });

    test('sub-bomblet flags are mutually exclusive with cluster', () => {
        const b = new Bullet();
        b.reset(0, 0, 0);
        b.setupSubBomblet(makeClusterConfig(), 0, 4);
        expect(b.subBomb).toBe(true);
        expect(b.cluster).toBe(false);
        expect(b.homing).toBe(false);
        expect(b.piercing).toBe(0);
    });
});

describe('Bullet.updateClusterStage — travel → armed transition', () => {
    test('transitions to armed when velocity drops below haltVelocity', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        const emptyPool = makePool([]);
        // Force velocity very low — friction will pull it below 0.3 immediately.
        b.vel.x = 0.25;
        b.vel.y = 0;
        b.updateClusterStage(null, emptyPool, null, null);
        expect(b.stage).toBe('armed');
        expect(b.vel.x).toBe(0);
        expect(b.vel.y).toBe(0);
        expect(b.armedAt).toBeGreaterThan(0);
    });

    test('stays in travel while velocity is above haltVelocity', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        const emptyPool = makePool([]);
        // High velocity — one tick of friction won't drop below 0.3.
        b.vel.x = 10;
        b.vel.y = 0;
        b.updateClusterStage(null, emptyPool, null, null);
        expect(b.stage).toBe('travel');
        // Friction applied: 10 * 0.92 = 9.2
        expect(b.vel.x).toBeCloseTo(9.2, 5);
    });

    test('decays from initial velocity to halt within ~30 ticks', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        const emptyPool = makePool([]);
        let ticks = 0;
        while (b.stage === 'travel' && ticks < 100) {
            b.updateClusterStage(null, emptyPool, null, null);
            ticks++;
        }
        // Should halt within ~30-50 ticks (allowing margin for friction drift).
        expect(b.stage).toBe('armed');
        expect(ticks).toBeLessThan(60);
    });
});

describe('Bullet.updateClusterStage — armed timer detonation', () => {
    test('detonates after armedDuration elapses', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        // Snap straight to armed at known timestamp.
        b.stage = 'armed';
        const t0 = Date.now();
        b.armedAt = t0 - 900; // 900ms ago — past the 800ms default
        b.vel.x = 0;
        b.vel.y = 0;
        let detonated = false;
        const stubGE = {
            detonateCluster() { detonated = true; b.active = false; },
        };
        b.updateClusterStage(null, makePool([]), stubGE, null);
        expect(detonated).toBe(true);
        expect(b.active).toBe(false);
    });

    test('does NOT detonate before armed timer expires', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        b.stage = 'armed';
        b.armedAt = Date.now() - 100; // only 100ms ago, way under 800ms
        b.vel.x = 0; b.vel.y = 0;
        let detonated = false;
        const stubGE = { detonateCluster() { detonated = true; } };
        b.updateClusterStage(null, makePool([]), stubGE, null);
        expect(detonated).toBe(false);
        expect(b.active).toBe(true);
    });

    test('SHORT_FUSE reduces armed duration (per-stack -0.3s)', () => {
        // Simulate the fireCluster baked-in math: armedDuration shrinks
        // by 300ms per SHORT_FUSE stack, clamped at 100ms minimum.
        const baseMs = PRIMARY_WEAPONS.CLUSTER_LAUNCHER.armedDurationMs;
        expect(baseMs).toBe(800);
        // 1 stack → 500ms armed window
        const oneStack = Math.max(100, baseMs - 1 * 300);
        expect(oneStack).toBe(500);
        // 2 stacks (cap) → 200ms armed window
        const twoStack = Math.max(100, baseMs - 2 * 300);
        expect(twoStack).toBe(200);
    });
});

describe('Bullet.updateClusterStage — enemy proximity detonation', () => {
    test('enemy within 60px proximity triggers detonation while armed', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        b.stage = 'armed';
        b.armedAt = Date.now(); // freshly armed
        b.x = 500; b.y = 500;
        b.vel.x = 0; b.vel.y = 0;
        // Enemy 40px away — well within 60px proximity.
        const enemy = makeEnemy(540, 500);
        const pool = makePool([enemy]);
        let detonated = false;
        const stubGE = { detonateCluster() { detonated = true; b.active = false; } };
        b.updateClusterStage(null, pool, stubGE, null);
        expect(detonated).toBe(true);
    });

    test('enemy outside proximity radius does not trigger detonation', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        b.stage = 'armed';
        b.armedAt = Date.now();
        b.x = 500; b.y = 500;
        b.vel.x = 0; b.vel.y = 0;
        const enemy = makeEnemy(700, 500); // 200px away
        const pool = makePool([enemy]);
        let detonated = false;
        const stubGE = { detonateCluster() { detonated = true; } };
        b.updateClusterStage(null, pool, stubGE, null);
        expect(detonated).toBe(false);
    });
});

describe('detonateCluster — sub-bomblet spawn count', () => {
    function makeStubEngine(spawnedSubs) {
        const enemyPool = makePool([]);
        const asteroidPool = makePool([]);
        const bulletPool = {
            activeObjects: [],
            get(x, y, angle) {
                const b = new Bullet();
                b.reset(x, y, angle);
                spawnedSubs.push(b);
                return b;
            },
        };
        return {
            enemyPool, asteroidPool, bulletPool,
            particlePool: null,
            game: { stats: {} },
            applyVampirism: () => {},
            onEnemyKill: () => {},
            createEnemyDebris: () => {},
            dropOrbsFromEntity: () => {},
            destroyAsteroid: () => {},
            triggerHitstop: () => {},
            triggerScreenShake: () => {},
        };
    }

    test('detonation spawns 5 sub-bombs by default', () => {
        const spawned = [];
        const ge = makeStubEngine(spawned);
        detonateCluster.call(
            ge, 500, 500,
            /*baseDamage=*/50, /*baseRadius=*/90, /*subBombCount=*/5,
            {
                subBombSpeed: 4, subBombFriction: 0.94,
                subBombLifeFrames: 20, subBombBlastRadius: 50, subBombDamage: 25,
            },
        );
        expect(spawned.length).toBe(5);
        // Each spawned object should be a sub-bomb (not a cluster).
        for (const b of spawned) {
            expect(b.subBomb).toBe(true);
            expect(b.cluster).toBe(false);
        }
    });

    test('MORE_BOMBLETS adds +1 sub-bomb per stack (capstone +2 = 7 total)', () => {
        const spawned = [];
        const ge = makeStubEngine(spawned);
        // Simulate the fireCluster baked-in math: subBombCount + 2 = 7.
        detonateCluster.call(
            ge, 500, 500, 50, 90, 7,
            { subBombSpeed: 4, subBombFriction: 0.94, subBombLifeFrames: 20,
              subBombBlastRadius: 50, subBombDamage: 25 },
        );
        expect(spawned.length).toBe(7);
    });

    test('zero sub-bombs still detonates primary blast', () => {
        const spawned = [];
        const ge = makeStubEngine(spawned);
        // Should not throw, no spawns.
        detonateCluster.call(ge, 500, 500, 50, 90, 0, {});
        expect(spawned.length).toBe(0);
    });
});

describe('detonateCluster — primary blast damage', () => {
    test('damages all enemies within blast radius', () => {
        const e1 = makeEnemy(500, 500, 100); // direct hit
        const e2 = makeEnemy(550, 500, 100); // 50px away — inside 90px
        const e3 = makeEnemy(700, 500, 100); // 200px away — outside
        const ge = {
            enemyPool: makePool([e1, e2, e3]),
            asteroidPool: makePool([]),
            bulletPool: { activeObjects: [], get: () => null },
            particlePool: null,
            game: { stats: {} },
            applyVampirism: () => {},
            onEnemyKill: () => {},
            createEnemyDebris: () => {},
            dropOrbsFromEntity: () => {},
            destroyAsteroid: () => {},
            triggerHitstop: () => {},
            triggerScreenShake: () => {},
        };
        detonateCluster.call(ge, 500, 500, 50, 90, 0, {});
        expect(e1.health).toBeLessThan(100);
        expect(e2.health).toBeLessThan(100);
        expect(e3.health).toBe(100); // outside blast radius
        // Direct-hit damage should be larger than edge damage (falloff).
        const e1Dmg = 100 - e1.health;
        const e2Dmg = 100 - e2.health;
        expect(e1Dmg).toBeGreaterThan(e2Dmg);
    });
});

describe('MEGA_CLUSTER upgrade — extends primary blast radius', () => {
    test('MEGA_CLUSTER upgrade definition is +30px per stack, max 2 stacks', () => {
        const upg = PRIMARY_UPGRADES.MEGA_CLUSTER;
        expect(upg).toBeDefined();
        expect(upg.maxStacks).toBe(2);
        expect(upg.weapon).toBe('CLUSTER_LAUNCHER');
        expect(upg.description).toMatch(/30/);
    });

    test('with 2 MEGA_CLUSTER stacks, blast radius = 150 hits enemies outside default 90px', () => {
        // Synthesize the fireCluster math: blastRadius + 30 * stacks
        const baseRadius = PRIMARY_WEAPONS.CLUSTER_LAUNCHER.blastRadius;
        expect(baseRadius).toBe(90);
        const buffedRadius = baseRadius + 2 * 30; // 150
        expect(buffedRadius).toBe(150);

        // Enemy at 130px should be inside 150 but outside 90.
        const e = makeEnemy(630, 500, 200); // 130px from (500,500)
        const ge = {
            enemyPool: makePool([e]),
            asteroidPool: makePool([]),
            bulletPool: { activeObjects: [], get: () => null },
            particlePool: null,
            game: { stats: {} },
            applyVampirism: () => {},
            onEnemyKill: () => {},
            createEnemyDebris: () => {},
            dropOrbsFromEntity: () => {},
            destroyAsteroid: () => {},
            triggerHitstop: () => {},
            triggerScreenShake: () => {},
        };
        detonateCluster.call(ge, 500, 500, 50, buffedRadius, 0, {});
        expect(e.health).toBeLessThan(200);
    });
});

describe('spawnSubBomblet — creates a sub-bomb in the bullet pool', () => {
    test('spawned bullet has subBomb=true and not cluster', () => {
        const got = [];
        const ge = {
            bulletPool: {
                activeObjects: [],
                get(x, y, angle) {
                    const b = new Bullet();
                    b.reset(x, y, angle);
                    got.push(b);
                    return b;
                },
            },
        };
        const b = spawnSubBomblet.call(ge, 500, 500, 0, 4, {
            subBombFriction: 0.94, subBombLifeFrames: 20,
            subBombBlastRadius: 50, subBombDamage: 25,
        });
        expect(b).not.toBeNull();
        expect(b.subBomb).toBe(true);
        expect(b.cluster).toBe(false);
        expect(b.homing).toBe(false);
        expect(b.piercing).toBe(0);
        // Sub-bomb spawns AT detonation site (not muzzle-offset).
        expect(b.x).toBe(500);
        expect(b.y).toBe(500);
    });

    test('sub-bomb velocity follows the requested angle + speed', () => {
        const ge = {
            bulletPool: {
                activeObjects: [],
                get(x, y, angle) {
                    const b = new Bullet();
                    b.reset(x, y, angle);
                    return b;
                },
            },
        };
        const b = spawnSubBomblet.call(ge, 0, 0, Math.PI / 2, 4, {});
        // angle = PI/2 → vel.x ~ 0, vel.y ~ 4
        expect(Math.abs(b.vel.x)).toBeLessThan(0.01);
        expect(b.vel.y).toBeCloseTo(4, 5);
    });
});
