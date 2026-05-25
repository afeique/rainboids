// SYS-10 / ENMY-07 — enemy teleport / burrow movement helper tests.
//
// Pure helper driven with an explicit `now` + an injected deterministic rng,
// mirroring the cloak / support-aura helper tests. Covers: createBlink defaults
// + overrides + the embedded telegraph; the canBlink gate (frozen / interval);
// tickBlink starting a telegraph, relocating EXACTLY once on the strike
// transition, the freeze guard; chooseBlinkDestination staying within range for
// both kinds (deterministic with a stubbed rng); and isVanished phase mapping.
import { describe, expect, test } from '@jest/globals';
import {
    createBlink,
    canBlink,
    tickBlink,
    chooseBlinkDestination,
    isVanished,
    BLINK_DEFAULTS,
} from '../../../../js/modules/enemy/abilities/blink-burrow.js';
import { telegraphPhase, TELEGRAPH_DEFAULTS } from '../../../../js/modules/enemy/telegraph.js';

// An rng stub that walks a fixed sequence (looping), so destinations are fully
// deterministic. Each chooseBlinkDestination call pulls two values: angle, dist.
function seqRng(values) {
    let i = 0;
    return () => values[i++ % values.length];
}

// Build an enemy carrying a blink config, positioned at (px, py).
function makeEnemy(opts = {}, px = 100, py = 100) {
    return { x: px, y: py, active: true, blink: createBlink(opts) };
}

describe('blink — createBlink', () => {
    test('uses BLINK_DEFAULTS when no opts given', () => {
        const b = createBlink();
        expect(b.intervalMs).toBe(BLINK_DEFAULTS.intervalMs);
        expect(b.range).toBe(BLINK_DEFAULTS.range);
        expect(b.kind).toBe(BLINK_DEFAULTS.kind);
        expect(b.lastBlinkAt).toBeNull();
        expect(b._executed).toBe(false);
    });

    test('honors overrides', () => {
        const b = createBlink({ intervalMs: 1000, range: 50, kind: 'burrow' });
        expect(b.intervalMs).toBe(1000);
        expect(b.range).toBe(50);
        expect(b.kind).toBe('burrow');
    });

    test('embeds a telegraph with default timings', () => {
        const b = createBlink();
        expect(b.telegraph).toBeTruthy();
        expect(b.telegraph.windupMs).toBe(BLINK_DEFAULTS.windupMs);
        expect(b.telegraph.strikeMs).toBe(BLINK_DEFAULTS.strikeMs);
        expect(b.telegraph.recoverMs).toBe(BLINK_DEFAULTS.recoverMs);
        expect(b.telegraph.phase).toBe('idle');
        expect(b.telegraph.startedAt).toBeNull();
    });

    test('overrides telegraph timings independently', () => {
        const b = createBlink({ windupMs: 50, strikeMs: 10, recoverMs: 20 });
        expect(b.telegraph.windupMs).toBe(50);
        expect(b.telegraph.strikeMs).toBe(10);
        expect(b.telegraph.recoverMs).toBe(20);
    });

    test('partial telegraph override falls back to BLINK_DEFAULTS for the rest', () => {
        const b = createBlink({ windupMs: 99 });
        expect(b.telegraph.windupMs).toBe(99);
        expect(b.telegraph.strikeMs).toBe(BLINK_DEFAULTS.strikeMs);
        expect(b.telegraph.recoverMs).toBe(BLINK_DEFAULTS.recoverMs);
    });

    test('BLINK_DEFAULTS telegraph timings are sane (cross-check vs telegraph defaults exist)', () => {
        // Not required to match, but both constants should be available + numeric.
        expect(typeof BLINK_DEFAULTS.windupMs).toBe('number');
        expect(typeof TELEGRAPH_DEFAULTS.windupMs).toBe('number');
    });
});

describe('blink — canBlink gate', () => {
    test('no blink config → false', () => {
        expect(canBlink({}, 1000)).toBe(false);
        expect(canBlink(null, 1000)).toBe(false);
    });

    test('first blink (lastBlinkAt null) is allowed when not frozen', () => {
        const e = makeEnemy({ intervalMs: 1000 });
        expect(canBlink(e, 0)).toBe(true);
    });

    test('false while frozen via enemy.frozen flag', () => {
        const e = makeEnemy({ intervalMs: 1000 });
        e.frozen = true;
        expect(canBlink(e, 0)).toBe(false);
    });

    test('false while frozen via _frozenUntil > now', () => {
        const e = makeEnemy({ intervalMs: 1000 });
        e._frozenUntil = 5000;
        expect(canBlink(e, 1000)).toBe(false);
        // After the freeze lapses it is allowed again.
        expect(canBlink(e, 5001)).toBe(true);
    });

    test('false before intervalMs elapsed since lastBlinkAt, true after', () => {
        const e = makeEnemy({ intervalMs: 1000 });
        e.blink.lastBlinkAt = 2000;
        expect(canBlink(e, 2500)).toBe(false);   // only 500ms elapsed
        expect(canBlink(e, 2999)).toBe(false);   // 999ms elapsed
        expect(canBlink(e, 3000)).toBe(true);    // exactly intervalMs elapsed
        expect(canBlink(e, 4000)).toBe(true);    // well past
    });
});

describe('blink — tickBlink lifecycle', () => {
    test('starts a telegraph when idle + eligible', () => {
        const e = makeEnemy({ windupMs: 100, strikeMs: 20, recoverMs: 50 });
        const r = tickBlink(e, null, 0, seqRng([0, 0]));
        // First tick begins the wind-up.
        expect(r.phase).toBe('windup');
        expect(r.relocated).toBe(false);
        expect(e.blink.telegraph.startedAt).toBe(0);
    });

    test('does NOT start a telegraph while frozen', () => {
        const e = makeEnemy({ windupMs: 100, strikeMs: 20, recoverMs: 50 });
        e.frozen = true;
        const r = tickBlink(e, null, 0, seqRng([0, 0]));
        expect(r.phase).toBe('idle');
        expect(r.relocated).toBe(false);
        expect(e.blink.telegraph.startedAt).toBeNull();
    });

    test('relocates EXACTLY once on the strike transition, stamps lastBlinkAt', () => {
        const e = makeEnemy({ windupMs: 100, strikeMs: 40, recoverMs: 50 }, 100, 100);
        const rng = seqRng([0, 1]); // angle=0 → cos=1,sin=0; dist = range*1 = range
        const range = e.blink.range;

        // t=0: start wind-up, no relocation yet.
        let r = tickBlink(e, null, 0, rng);
        expect(r.phase).toBe('windup');
        expect(r.relocated).toBe(false);
        expect(e.x).toBe(100);

        // t=50: still winding up (windup is [0,100)).
        r = tickBlink(e, null, 50, rng);
        expect(r.phase).toBe('windup');
        expect(r.relocated).toBe(false);

        // t=100: strike window opens → relocate once.
        r = tickBlink(e, null, 100, rng);
        expect(r.phase).toBe('strike');
        expect(r.relocated).toBe(true);
        expect(r.to).not.toBeNull();
        expect(e.x).toBeCloseTo(100 + range, 5); // cos(0)*range
        expect(e.y).toBeCloseTo(100, 5);         // sin(0)*range
        expect(e.blink.lastBlinkAt).toBe(100);
        const jumpedX = e.x;
        const jumpedY = e.y;

        // t=120: still inside the strike window but already executed → no 2nd jump.
        r = tickBlink(e, null, 120, rng);
        expect(r.phase).toBe('strike');
        expect(r.relocated).toBe(false);
        expect(e.x).toBe(jumpedX);
        expect(e.y).toBe(jumpedY);

        // t=160: recover window — still no jump.
        r = tickBlink(e, null, 160, rng);
        expect(r.phase).toBe('recover');
        expect(r.relocated).toBe(false);
        expect(e.x).toBe(jumpedX);
    });

    test('does not blink again until intervalMs elapses after the jump', () => {
        const e = makeEnemy({ intervalMs: 1000, windupMs: 100, strikeMs: 40, recoverMs: 50 }, 0, 0);
        const rng = seqRng([0, 0.5]);

        // Drive to the first jump.
        tickBlink(e, null, 0, rng);   // windup
        tickBlink(e, null, 100, rng); // strike → relocate
        expect(e.blink.lastBlinkAt).toBe(100);

        // After telegraph fully recovers (>= 100+40+50 = 190) it returns to idle.
        // At t=300 the interval (1000ms) has NOT elapsed since the jump at 100,
        // so no new telegraph should start.
        const r = tickBlink(e, null, 300, rng);
        expect(r.phase).toBe('idle');
        expect(r.relocated).toBe(false);
        expect(e.blink.telegraph.startedAt).toBeNull();

        // At t=1100 (>= 100 + 1000) it becomes eligible again → starts a new windup.
        const r2 = tickBlink(e, null, 1100, rng);
        expect(r2.phase).toBe('windup');
    });

    test('frozen mid-telegraph holds the phase and does NOT relocate', () => {
        const e = makeEnemy({ windupMs: 100, strikeMs: 40, recoverMs: 50 }, 100, 100);
        const rng = seqRng([0, 1]);

        // Start the wind-up.
        tickBlink(e, null, 0, rng);
        expect(e.blink.telegraph.startedAt).toBe(0);

        // Freeze the enemy, then tick into the strike window: must NOT relocate.
        e._frozenUntil = 10_000;
        const r = tickBlink(e, null, 100, rng);
        expect(r.relocated).toBe(false);
        expect(e.x).toBe(100);
        expect(e.y).toBe(100);
        expect(e.blink.lastBlinkAt).toBeNull();
    });

    test('no blink config → inert status', () => {
        const r = tickBlink({ x: 0, y: 0 }, null, 0, seqRng([0, 0]));
        expect(r).toEqual({ phase: 'idle', relocated: false, to: null });
    });
});

describe('blink — chooseBlinkDestination', () => {
    test("kind 'blink' stays within range of the enemy", () => {
        const e = makeEnemy({ kind: 'blink', range: 200 }, 500, 500);
        const range = e.blink.range;
        for (let a = 0; a < 1; a += 0.1) {
            for (const d of [0, 0.25, 0.5, 0.99]) {
                const dest = chooseBlinkDestination(e, null, seqRng([a, d]));
                const dist = Math.hypot(dest.x - 500, dest.y - 500);
                expect(dist).toBeLessThanOrEqual(range + 1e-9);
            }
        }
    });

    test("kind 'blink' is deterministic with a stubbed rng", () => {
        const e = makeEnemy({ kind: 'blink', range: 100 }, 0, 0);
        // angle=0 → cos=1, sin=0; dist=100 → (100, 0)
        const dest = chooseBlinkDestination(e, null, seqRng([0, 1]));
        expect(dest.x).toBeCloseTo(100, 5);
        expect(dest.y).toBeCloseTo(0, 5);
    });

    test("kind 'burrow' lands within range of the PLAYER", () => {
        const e = makeEnemy({ kind: 'burrow', range: 150 }, 0, 0);
        const player = { x: 800, y: 600 };
        const range = e.blink.range;
        for (let a = 0; a < 1; a += 0.13) {
            for (const d of [0, 0.5, 0.95]) {
                const dest = chooseBlinkDestination(e, player, seqRng([a, d]));
                const dist = Math.hypot(dest.x - player.x, dest.y - player.y);
                expect(dist).toBeLessThanOrEqual(range + 1e-9);
            }
        }
    });

    test("kind 'burrow' is deterministic and centered on the player", () => {
        const e = makeEnemy({ kind: 'burrow', range: 100 }, 0, 0);
        const player = { x: 300, y: 300 };
        // angle=0.25 → cos(pi/2)=0, sin(pi/2)=1; dist=100 → player + (0, 100)
        const dest = chooseBlinkDestination(e, player, seqRng([0.25, 1]));
        expect(dest.x).toBeCloseTo(300, 5);
        expect(dest.y).toBeCloseTo(400, 5);
    });

    test("kind 'burrow' with no player falls back to relocating near self", () => {
        const e = makeEnemy({ kind: 'burrow', range: 100 }, 50, 50);
        const dest = chooseBlinkDestination(e, null, seqRng([0, 1]));
        expect(dest.x).toBeCloseTo(150, 5); // 50 + 100
        expect(dest.y).toBeCloseTo(50, 5);
    });
});

describe('blink — isVanished', () => {
    test('false when idle (no telegraph running)', () => {
        const e = makeEnemy();
        expect(isVanished(e, 0)).toBe(false);
    });

    test('true during windup and strike, false during recover/idle', () => {
        const e = makeEnemy({ windupMs: 100, strikeMs: 40, recoverMs: 50 });
        e.blink.telegraph.startedAt = 0;
        e.blink.telegraph.phase = 'windup';
        // windup [0,100)
        expect(telegraphPhase(e.blink.telegraph, 50)).toBe('windup');
        expect(isVanished(e, 50)).toBe(true);
        // strike [100,140)
        expect(telegraphPhase(e.blink.telegraph, 120)).toBe('strike');
        expect(isVanished(e, 120)).toBe(true);
        // recover [140,190) — re-emerged, visible again
        expect(telegraphPhase(e.blink.telegraph, 160)).toBe('recover');
        expect(isVanished(e, 160)).toBe(false);
        // back to idle
        expect(isVanished(e, 500)).toBe(false);
    });

    test('no blink config → never vanished', () => {
        expect(isVanished({}, 0)).toBe(false);
        expect(isVanished(null, 0)).toBe(false);
    });
});
