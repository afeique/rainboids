/**
 * QA-32: CONDUIT_NODE (ENMY-08) — Volt HEAL-aura support, LIVE.
 *
 * The Conduit Node channels energy to MEND nearby ALLY enemies (the SYS-7
 * ally-aura `kind:'heal'` path — the HEAL counterpart to LUMEN_DRONE's SHIELD
 * aura). This spec proves it reaches the field and its aura is wired + ticks:
 *   (a) It spawns through the LIVE spawn path (gameEngine.spawnLeveledEnemies —
 *       the same call wave-manager.spawnSubWave uses), lands active in the pool
 *       with its `aura: {kind:'heal'}` config + VOLT element wired.
 *   (b) It debuts in the LIVE wave roster (WAVE_DATA) on its documented wave
 *       (25), on a NON-boss wave — a guard against a future edit dropping it to
 *       debug-only.
 *   (c) A wounded ally enemy inside the node's radius REGAINS HP when the aura
 *       ticks (driven through the live runAura against the real enemy pool),
 *       clamped to maxHealth.
 *   (d) Running real frames with the node + an ally live throws NO fatal JS
 *       errors (the heal aura ticks in enemy.update without crashing).
 *
 * Mirrors tests/qa/28-roster.spec.js (the new-type roster spec) and
 * tests/qa/24-suppress.spec.js (the NULL_DRONE aura spec).
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

const BOSS_WAVES = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

function attachErrorCollector(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    return errors;
}

test.describe('QA-32: CONDUIT_NODE heal-aura support', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Spawns live through the real spawn path with its aura + element wired.
    // ------------------------------------------------------------------
    test('spawns live with a heal aura + VOLT element wired', async ({ page }) => {
        const wired = await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.spawnLeveledEnemies('CONDUIT_NODE', 1, { onScreen: true, cap: 9999 });
            const node = ge.enemyPool.activeObjects.find((e) => e.type === 'CONDUIT_NODE' && e.active);
            return {
                active: !!node,
                hasAura: !!(node && node.aura),
                kind: node && node.aura ? node.aura.kind : null,
                radius: node && node.aura ? node.aura.radius : 0,
                amount: node && node.aura ? node.aura.amount : 0,
                element: node ? node.element : null,
            };
        });
        expect(wired.active).toBe(true);
        expect(wired.hasAura).toBe(true);
        expect(wired.kind).toBe('heal');
        expect(wired.radius).toBeGreaterThan(0);
        expect(wired.amount).toBeGreaterThan(0);
        expect(wired.element).toBe('VOLT');
    });

    // ------------------------------------------------------------------
    // (b) It's in the live roster on its documented debut wave, non-boss only.
    // ------------------------------------------------------------------
    test('debuts in the live WAVE_DATA roster on wave 25 (non-boss)', async ({ page }) => {
        const info = await page.evaluate(async () => {
            const { WAVE_DATA } = await import('/js/modules/wave/wave-data.js');
            const waves = [];
            for (const [w, cfg] of Object.entries(WAVE_DATA)) {
                const types = (cfg.subWaves || []).flat().map((g) => g.type);
                if (types.includes('CONDUIT_NODE')) waves.push({ w: Number(w), boss: !!cfg.isBossWave });
            }
            return waves;
        });
        // Appears somewhere, and its documented debut is wave 25.
        expect(info.length).toBeGreaterThan(0);
        expect(info.map((x) => x.w)).toContain(25);
        // Never on a boss wave.
        for (const x of info) {
            expect(BOSS_WAVES, `CONDUIT_NODE must not be on boss wave ${x.w}`).not.toContain(x.w);
            expect(x.boss).toBe(false);
        }
    });

    // ------------------------------------------------------------------
    // (c) A wounded ally inside the radius regains HP when the aura ticks
    //     (driven through the live runAura against the real enemy pool).
    // ------------------------------------------------------------------
    test('mends a wounded ally inside the radius (live runAura)', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const { runAura } = await import('/js/modules/enemy/support-aura.js');

            ge.spawnLeveledEnemies('CONDUIT_NODE', 1, { onScreen: true, cap: 9999 });
            ge.spawnLeveledEnemies('GUARDIAN', 1, { onScreen: true, cap: 9999 });
            const node = ge.enemyPool.activeObjects.find((e) => e.type === 'CONDUIT_NODE' && e.active);
            const ally = ge.enemyPool.activeObjects.find((e) => e.type === 'GUARDIAN' && e.active);

            // Co-locate the ally on the node so it is unambiguously in-radius,
            // and wound it well below max so a tick has room to mend.
            ally.x = node.x;
            ally.y = node.y;
            const before = ally.health = Math.max(1, Math.floor(ally.maxHealth * 0.4));

            // Tick the aura exactly as enemy.update does each cadence.
            const healed = runAura(node, ge.enemyPool.activeObjects, performance.now());

            return {
                before,
                after: ally.health,
                maxHealth: ally.maxHealth,
                healedCount: healed,
                amount: node.aura.amount,
            };
        });
        expect(result.healedCount).toBeGreaterThanOrEqual(1);   // ally counted as mended
        expect(result.after).toBeGreaterThan(result.before);     // HP went up
        expect(result.after).toBe(result.before + result.amount); // by exactly `amount`
        expect(result.after).toBeLessThanOrEqual(result.maxHealth); // clamped
    });

    // ------------------------------------------------------------------
    // (d) Real frames with the node + ally live → no fatal JS errors (the heal
    //     aura ticks in enemy.update without throwing).
    // ------------------------------------------------------------------
    test('no fatal JS errors while the node + ally run live frames', async ({ page }) => {
        const errors = attachErrorCollector(page);

        await page.evaluate(() => {
            const ge = window.gameEngine;
            ge.spawnLeveledEnemies('CONDUIT_NODE', 1, { onScreen: true, cap: 9999 });
            ge.spawnLeveledEnemies('GUARDIAN', 2, { onScreen: true, cap: 9999 });
            // Wound the allies so the aura has something to heal each tick.
            for (const e of ge.enemyPool.activeObjects) {
                if (e.type === 'GUARDIAN' && e.active) e.health = Math.max(1, Math.floor(e.maxHealth * 0.5));
            }
        });
        // Let the aura tick across several cadences (intervalMs ~650).
        await page.waitForTimeout(1600);

        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
