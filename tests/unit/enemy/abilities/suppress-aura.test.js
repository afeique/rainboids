// SYS-9 / ENMY-06 — skill-suppress aura unit tests.
import {
    LINGER_MS,
    SUPPRESS_DEFAULTS,
    playerInAura,
    applySuppression,
    cooldownRegenScale,
    isActivationBlocked,
    isSuppressed,
} from '../../../../js/modules/enemy/abilities/suppress-aura.js';

function makeEnemy(overrides = {}) {
    return {
        x: 0,
        y: 0,
        suppressAura: {
            radius: 100,
            cooldownScale: 0.25,
            blocksActivation: false,
        },
        ...overrides,
    };
}

function makePlayer(x = 0, y = 0) {
    return { x, y };
}

describe('suppress-aura exported constants', () => {
    test('LINGER_MS is a positive number', () => {
        expect(typeof LINGER_MS).toBe('number');
        expect(LINGER_MS).toBeGreaterThan(0);
    });

    test('SUPPRESS_DEFAULTS has the expected shape', () => {
        expect(SUPPRESS_DEFAULTS).toEqual(
            expect.objectContaining({
                radius: expect.any(Number),
                cooldownScale: expect.any(Number),
                blocksActivation: expect.any(Boolean),
            })
        );
        // cooldownScale is a slow-down multiplier < 1
        expect(SUPPRESS_DEFAULTS.cooldownScale).toBeLessThan(1);
    });
});

describe('playerInAura', () => {
    test('true when player is inside the radius', () => {
        const enemy = makeEnemy();
        expect(playerInAura(enemy, makePlayer(50, 0))).toBe(true);
    });

    test('true exactly on the radius boundary (≤)', () => {
        const enemy = makeEnemy();
        expect(playerInAura(enemy, makePlayer(100, 0))).toBe(true);
    });

    test('false when player is outside the radius', () => {
        const enemy = makeEnemy();
        expect(playerInAura(enemy, makePlayer(101, 0))).toBe(false);
        expect(playerInAura(enemy, makePlayer(200, 200))).toBe(false);
    });

    test('uses 2D distance on x and y', () => {
        const enemy = makeEnemy();
        // (60,80) → distance 100, on the boundary
        expect(playerInAura(enemy, makePlayer(60, 80))).toBe(true);
        // (60,81) → just outside
        expect(playerInAura(enemy, makePlayer(60, 81))).toBe(false);
    });

    test('respects a non-origin enemy position', () => {
        const enemy = makeEnemy({ x: 500, y: 500 });
        expect(playerInAura(enemy, makePlayer(550, 500))).toBe(true);
        expect(playerInAura(enemy, makePlayer(650, 500))).toBe(false);
    });

    test('missing-aura guard returns false', () => {
        const enemy = makeEnemy({ suppressAura: undefined });
        expect(playerInAura(enemy, makePlayer(0, 0))).toBe(false);
    });

    test('missing enemy or player returns false', () => {
        expect(playerInAura(null, makePlayer(0, 0))).toBe(false);
        expect(playerInAura(makeEnemy(), null)).toBe(false);
    });
});

describe('applySuppression', () => {
    test('stamps until + scale and returns true when in aura', () => {
        const enemy = makeEnemy();
        const player = makePlayer(10, 0);
        const now = 1000;
        expect(applySuppression(enemy, player, now)).toBe(true);
        expect(player._skillSuppressedUntil).toBe(now + LINGER_MS);
        expect(player._skillCooldownScale).toBe(0.25);
        expect(player._skillActivationBlocked).toBe(false);
    });

    test('records blocksActivation flag from the aura config', () => {
        const enemy = makeEnemy({
            suppressAura: { radius: 100, cooldownScale: 0.5, blocksActivation: true },
        });
        const player = makePlayer(10, 0);
        expect(applySuppression(enemy, player, 0)).toBe(true);
        expect(player._skillActivationBlocked).toBe(true);
        expect(player._skillCooldownScale).toBe(0.5);
    });

    test('coerces blocksActivation to a strict boolean', () => {
        const enemy = makeEnemy({
            suppressAura: { radius: 100, cooldownScale: 0.5, blocksActivation: 1 },
        });
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 0);
        expect(player._skillActivationBlocked).toBe(true);
    });

    test('returns false and does not stamp when out of aura', () => {
        const enemy = makeEnemy();
        const player = makePlayer(500, 0);
        expect(applySuppression(enemy, player, 1000)).toBe(false);
        expect(player._skillSuppressedUntil).toBeUndefined();
        expect(player._skillCooldownScale).toBeUndefined();
    });

    test('re-applies a later stamp when applied again at a later now', () => {
        const enemy = makeEnemy();
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 1000);
        applySuppression(enemy, player, 2000);
        expect(player._skillSuppressedUntil).toBe(2000 + LINGER_MS);
    });
});

describe('cooldownRegenScale', () => {
    test('returns the stamped scale while suppression is active', () => {
        const enemy = makeEnemy();
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 1000);
        // still inside the linger window
        expect(cooldownRegenScale(player, 1000)).toBe(0.25);
        expect(cooldownRegenScale(player, 1000 + LINGER_MS - 1)).toBe(0.25);
    });

    test('returns 1 (normal regen) after linger expiry', () => {
        const enemy = makeEnemy();
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 1000);
        expect(cooldownRegenScale(player, 1000 + LINGER_MS)).toBe(1);
        expect(cooldownRegenScale(player, 1000 + LINGER_MS + 500)).toBe(1);
    });

    test('returns 1 for a never-suppressed player', () => {
        expect(cooldownRegenScale(makePlayer(0, 0), 0)).toBe(1);
    });

    test('null-safe', () => {
        expect(cooldownRegenScale(null, 0)).toBe(1);
    });
});

describe('isActivationBlocked', () => {
    test('true only when blocksActivation is set AND suppression active', () => {
        const enemy = makeEnemy({
            suppressAura: { radius: 100, cooldownScale: 0.25, blocksActivation: true },
        });
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 1000);
        expect(isActivationBlocked(player, 1000)).toBe(true);
        expect(isActivationBlocked(player, 1000 + LINGER_MS - 1)).toBe(true);
    });

    test('false when active but aura does not block activation', () => {
        const enemy = makeEnemy(); // blocksActivation defaults to false
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 1000);
        expect(isActivationBlocked(player, 1000)).toBe(false);
    });

    test('false after linger expiry even if aura blocked activation', () => {
        const enemy = makeEnemy({
            suppressAura: { radius: 100, cooldownScale: 0.25, blocksActivation: true },
        });
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 1000);
        expect(isActivationBlocked(player, 1000 + LINGER_MS)).toBe(false);
    });

    test('null-safe / never-suppressed → false', () => {
        expect(isActivationBlocked(null, 0)).toBe(false);
        expect(isActivationBlocked(makePlayer(0, 0), 0)).toBe(false);
    });
});

describe('isSuppressed (HUD cue)', () => {
    test('true while the suppression window is active', () => {
        const enemy = makeEnemy();
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 1000);
        expect(isSuppressed(player, 1000)).toBe(true);
        expect(isSuppressed(player, 1000 + LINGER_MS - 1)).toBe(true);
    });

    test('false after linger expiry', () => {
        const enemy = makeEnemy();
        const player = makePlayer(0, 0);
        applySuppression(enemy, player, 1000);
        expect(isSuppressed(player, 1000 + LINGER_MS)).toBe(false);
    });

    test('false for a never-suppressed player and null-safe', () => {
        expect(isSuppressed(makePlayer(0, 0), 0)).toBe(false);
        expect(isSuppressed(null, 0)).toBe(false);
    });
});

describe('linger behavior — one apply keeps suppression for LINGER_MS', () => {
    test('a single applySuppression lingers after the player leaves', () => {
        const enemy = makeEnemy();
        const player = makePlayer(10, 0);
        const apply = 5000;
        applySuppression(enemy, player, apply);

        // Player has now left the aura (no further applies), but suppression
        // should persist across the whole linger window.
        player.x = 9999; // far outside; future applies would be no-ops
        expect(applySuppression(enemy, player, apply + 10)).toBe(false);

        // Still suppressed right up to (but not including) the expiry instant.
        expect(isSuppressed(player, apply + 1)).toBe(true);
        expect(isSuppressed(player, apply + LINGER_MS - 1)).toBe(true);
        expect(cooldownRegenScale(player, apply + LINGER_MS - 1)).toBe(0.25);

        // Then it lapses exactly at LINGER_MS.
        expect(isSuppressed(player, apply + LINGER_MS)).toBe(false);
        expect(cooldownRegenScale(player, apply + LINGER_MS)).toBe(1);
    });
});
