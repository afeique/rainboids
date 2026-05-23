/**
 * tests/unit/cluster-launcher.test.js — Phase 6 Cluster Launcher tests.
 *
 * Pins the cluster-bomb flight model, sub-bomblet spawn behavior, and
 * the per-weapon upgrades defined in `weapon-data.js`.
 *
 * 6.28.0 weapon redesign — the bespoke cluster tuners (CLUSTER_PAYLOAD /
 * MORE_BOMBLETS / SHORT_FUSE / MEGA_CLUSTER) were RETIRED. Cluster
 * Launcher now gets only the shared-trait set: Multishot (CLUSTER_MULTI),
 * Stun% (CLUSTER_STUN), and Knockback% (CLUSTER_KNOCK). The detonation
 * MECHANICS (5 sub-bombs by default, blast-radius falloff) are unchanged
 * and still exercised directly via detonateCluster with synthetic config.
 *
 * The Bullet class is exercised directly with synthetic config so we
 * don't have to spin up the full game engine. The detonateCluster /
 * detonateSubBomblet helpers are tested separately against synthetic
 * pools to confirm AoE damage radius + sub-bomb spawn count.
 *
 * Covered:
 *   • Cluster bomb flies straight (single 'flying' stage, 6.26.0)
 *   • Enemy/asteroid within contact radius triggers detonation
 *   • Detonation spawns 5 sub-bombs by default; count param respected
 *   • detonateCluster blast-radius damage + falloff
 *   • Cluster bombs do NOT have homing or piercing flags
 *   • Cluster upgrades = CLUSTER_MULTI / CLUSTER_STUN / CLUSTER_KNOCK
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
    clusterLaunchDistance, clusterLaunchVelocity,
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
        // 6.26.0 — nucleus-cluster rework: range effectively unlimited
        // (9999), no friction halt, no armed window. Detonates on first
        // contact with any enemy / asteroid / mine.
        const cfg = PRIMARY_WEAPONS.CLUSTER_LAUNCHER;
        expect(cfg).toBeDefined();
        expect(cfg.id).toBe('CLUSTER_LAUNCHER');
        expect(cfg.damage).toBe(50);
        expect(cfg.fireRate).toBe(800);
        expect(cfg.range).toBe(9999);
        expect(cfg.blastRadius).toBe(90);
        expect(cfg.blastDamage).toBe(50);
        expect(cfg.subBombCount).toBe(5);
        expect(cfg.travelFriction).toBe(1.0);
        expect(cfg.armedDurationMs).toBe(0);
        expect(cfg.proximityRadius).toBe(18);
        expect(cfg.piercing).toBe(0); // Cluster bombs do not pierce by spec
    });

    test('cluster gets the shared Multishot / Stun / Knockback upgrades (6.28.0)', () => {
        expect(PRIMARY_UPGRADES.CLUSTER_MULTI).toBeDefined();
        expect(PRIMARY_UPGRADES.CLUSTER_MULTI.maxStacks).toBe(2);
        expect(PRIMARY_UPGRADES.CLUSTER_MULTI.weapon).toBe('CLUSTER_LAUNCHER');

        expect(PRIMARY_UPGRADES.CLUSTER_STUN).toBeDefined();
        expect(PRIMARY_UPGRADES.CLUSTER_STUN.maxStacks).toBe(3);
        expect(PRIMARY_UPGRADES.CLUSTER_STUN.weapon).toBe('CLUSTER_LAUNCHER');

        expect(PRIMARY_UPGRADES.CLUSTER_KNOCK).toBeDefined();
        expect(PRIMARY_UPGRADES.CLUSTER_KNOCK.maxStacks).toBe(3);
        expect(PRIMARY_UPGRADES.CLUSTER_KNOCK.weapon).toBe('CLUSTER_LAUNCHER');
    });

    test('retired bespoke cluster tuners are gone (6.28.0 redesign)', () => {
        // Cluster gets only the shared-trait set now; the bespoke
        // damage/sub-bomb/fuse/blast tuners were retired.
        expect(PRIMARY_UPGRADES.CLUSTER_PAYLOAD).toBeUndefined();
        expect(PRIMARY_UPGRADES.MORE_BOMBLETS).toBeUndefined();
        expect(PRIMARY_UPGRADES.SHORT_FUSE).toBeUndefined();
        expect(PRIMARY_UPGRADES.MEGA_CLUSTER).toBeUndefined();
    });

    test('no CLUSTER_HOMING / CLUSTER_PIERCING upgrade exists (cluster has no seek/pierce)', () => {
        expect(PRIMARY_UPGRADES.CLUSTER_HOMING).toBeUndefined();
        expect(PRIMARY_UPGRADES.CLUSTER_PIERCING).toBeUndefined();
    });
});

describe('clusterLaunchDistance / clusterLaunchVelocity — charge scaling', () => {
    const cfg = PRIMARY_WEAPONS.CLUSTER_LAUNCHER;
    const VW = 1280, VH = 720;

    test('a quick tap (frac 0) lobs to the minimum launch distance', () => {
        expect(clusterLaunchDistance(cfg, 0, VW, VH)).toBeCloseTo(cfg.minLaunchDist, 5);
    });

    test('a full charge (frac 1) reaches ~0.55× the viewport diagonal', () => {
        const expected = Math.hypot(VW, VH) * 0.55;
        expect(clusterLaunchDistance(cfg, 1, VW, VH)).toBeCloseTo(expected, 5);
    });

    test('launch distance grows monotonically with charge', () => {
        const d0 = clusterLaunchDistance(cfg, 0, VW, VH);
        const dHalf = clusterLaunchDistance(cfg, 0.5, VW, VH);
        const d1 = clusterLaunchDistance(cfg, 1, VW, VH);
        expect(dHalf).toBeGreaterThan(d0);
        expect(d1).toBeGreaterThan(dHalf);
    });

    test('frac is clamped to [0,1]', () => {
        expect(clusterLaunchDistance(cfg, -5, VW, VH)).toBeCloseTo(cfg.minLaunchDist, 5);
        expect(clusterLaunchDistance(cfg, 99, VW, VH)).toBeCloseTo(clusterLaunchDistance(cfg, 1, VW, VH), 5);
    });

    test('a tap launches slow (floaty) and a full charge launches fast', () => {
        expect(clusterLaunchVelocity(cfg, 0)).toBeCloseTo(cfg.minLaunchVelocity, 5);
        expect(clusterLaunchVelocity(cfg, 1)).toBeCloseTo(cfg.initialVelocity, 5);
        // The floaty tap is meaningfully slower than the full-charge throw.
        expect(clusterLaunchVelocity(cfg, 0)).toBeLessThan(clusterLaunchVelocity(cfg, 1));
    });

    test('launch velocity grows monotonically with charge', () => {
        const v0 = clusterLaunchVelocity(cfg, 0);
        const vHalf = clusterLaunchVelocity(cfg, 0.5);
        const v1 = clusterLaunchVelocity(cfg, 1);
        expect(vHalf).toBeGreaterThan(v0);
        expect(v1).toBeGreaterThan(vHalf);
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
        // 6.26.0 — single-stage 'flying' (no travel/armed split).
        expect(b.stage).toBe('flying');
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

// 6.26.0 — flight model: constant-velocity straight-line flight at
// initialVelocity (no friction, no halt). The old travel→armed FSM and
// armed-timer detonation paths were removed; the bomb is "always armed"
// and detonates on the first contact with any enemy or asteroid.
describe('Bullet.updateClusterStage — flight model (6.26.0)', () => {
    test('flies at constant velocity (no friction deceleration)', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        const emptyPool = makePool([]);
        const v0 = Math.hypot(b.vel.x, b.vel.y);
        for (let i = 0; i < 30; i++) {
            b.updateClusterStage(null, emptyPool, null, null);
        }
        const v30 = Math.hypot(b.vel.x, b.vel.y);
        // Friction = 1.0, so velocity stays constant across 30 ticks.
        expect(v30).toBeCloseTo(v0, 5);
        // Stage stays 'flying' (no transition to 'armed').
        expect(b.stage).toBe('flying');
    });

    test('stage stays "flying" indefinitely without contact', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        const emptyPool = makePool([]);
        for (let i = 0; i < 100; i++) {
            b.updateClusterStage(null, emptyPool, null, null);
        }
        // No friction halt → never transitions to 'armed' / 'detonated'.
        expect(b.stage).toBe('flying');
        expect(b.active).toBe(true);
    });

    test('SHORT_FUSE is vestigial (no armed window to shorten)', () => {
        // 6.26.0 — armedDurationMs is 0 in the new config; SHORT_FUSE
        // stacks still exist as a no-op so existing save runs don't
        // break, but they no longer change behavior.
        expect(PRIMARY_WEAPONS.CLUSTER_LAUNCHER.armedDurationMs).toBe(0);
    });
});

describe('Bullet.updateClusterStage — enemy / asteroid contact detonation', () => {
    test('enemy within contact radius triggers detonation immediately', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        b.x = 500; b.y = 500;
        // Enemy 12px away — within the 18px contact radius.
        const enemy = makeEnemy(512, 500);
        const pool = makePool([enemy]);
        let detonated = false;
        const stubGE = { detonateCluster() { detonated = true; b.active = false; } };
        b.updateClusterStage(null, pool, stubGE, null);
        expect(detonated).toBe(true);
    });

    test('enemy outside contact radius does not trigger detonation', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        b.x = 500; b.y = 500;
        const enemy = makeEnemy(700, 500); // 200px away
        const pool = makePool([enemy]);
        let detonated = false;
        const stubGE = { detonateCluster() { detonated = true; } };
        b.updateClusterStage(null, pool, stubGE, null);
        expect(detonated).toBe(false);
    });

    test('asteroid contact also triggers detonation', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupClusterBomb(makeClusterConfig());
        b.x = 500; b.y = 500;
        // Asteroid with radius 30 at distance 40 → centers 40px apart,
        // combined radii (18 + 30 = 48) overlap → detonate.
        const asteroid = { x: 540, y: 500, radius: 30, active: true };
        const asteroidPool = makePool([asteroid]);
        let detonated = false;
        const stubGE = { detonateCluster() { detonated = true; b.active = false; } };
        b.updateClusterStage(null, makePool([]), stubGE, null, asteroidPool);
        expect(detonated).toBe(true);
    });
});

describe('Bullet.updateClusterStage — sub-bomblet contact / timeout detonation', () => {
    const subCfg = { subBombFriction: 0.96, subBombLifeFrames: 30, subBombBlastRadius: 50, subBombDamage: 25 };

    test('sub-bomblet detonates on asteroid contact (explodes when it hits something)', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupSubBomblet({ ...subCfg }, 0, 5);
        b.x = 500; b.y = 500;
        // contactR = max(12, 50*0.4) = 20; asteroid r=30 at ~45px → 20+30=50 overlaps.
        const asteroid = { x: 545, y: 500, radius: 30, active: true };
        let detonated = false;
        const stubGE = { detonateSubBomblet() { detonated = true; b.active = false; } };
        b.updateClusterStage(null, makePool([]), stubGE, { width: 1e5, height: 1e5 }, makePool([asteroid]));
        expect(detonated).toBe(true);
    });

    test('sub-bomblet keeps flying when nothing is in range', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupSubBomblet({ ...subCfg }, 0, 5);
        let detonated = false;
        const stubGE = { detonateSubBomblet() { detonated = true; b.active = false; } };
        // A handful of ticks, no targets, well within the flight window.
        for (let i = 0; i < 5; i++) {
            b.updateClusterStage(null, makePool([]), stubGE, { width: 1e5, height: 1e5 }, makePool([]));
        }
        expect(detonated).toBe(false);
        expect(b.active).toBe(true);
    });

    test('sub-bomblet detonates after its fixed flight window (timeout)', () => {
        const b = new Bullet();
        b.reset(500, 500, 0);
        b.setupSubBomblet({ ...subCfg, subBombLifeFrames: 5 }, 0, 5);
        let detonated = false;
        const stubGE = { detonateSubBomblet() { detonated = true; b.active = false; } };
        for (let i = 0; i < 6 && !detonated; i++) {
            b.updateClusterStage(null, makePool([]), stubGE, { width: 1e5, height: 1e5 }, makePool([]));
        }
        expect(detonated).toBe(true);
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

    test('detonateCluster spawns exactly the sub-bomb count it is given (e.g. 7)', () => {
        const spawned = [];
        const ge = makeStubEngine(spawned);
        // detonateCluster spawns whatever count the caller passes.
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

describe('detonateCluster — blast radius scales the AoE hit', () => {
    test('a larger blastRadius arg reaches enemies outside the default 90px', () => {
        // 6.28.0 — MEGA_CLUSTER (the +30px/stack blast-radius tuner) was
        // retired, but detonateCluster still honors whatever blastRadius
        // it's handed. Pin that radius→AoE relationship directly.
        const baseRadius = PRIMARY_WEAPONS.CLUSTER_LAUNCHER.blastRadius;
        expect(baseRadius).toBe(90);
        const buffedRadius = 150;

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
