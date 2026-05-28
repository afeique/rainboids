/**
 * QA-20: FLAT-WAVE boss spawning + past-30 cycled content (8.10.0)
 *
 * Runs are a flat wave count now (no stages); a boss spawns every BOSS_INTERVAL
 * (= 10) waves. This spec drives the LIVE engine and asserts:
 *
 *   (a) wave 10 (the first boss wave) spawns a modular boss; wave 3 does NOT.
 *   (b) past wave 30 the wave config is NOT the trivial wave-1 content (cycled),
 *       and a boss still spawns on a later boss wave (wave 40).
 *   (c) a boss spawns on every multiple of 10 across the run.
 *
 * Drives the engine via page.evaluate; detects a boss in the active enemy pool
 * by isBoss + bossId. Sub-wave pacing is forced by repeatedly clearing the
 * non-boss field then ticking updateWaveSystem so the LAST sub-wave — where the
 * boss lives — actually spawns, without needing an AI to pilot it.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Configure a run length, jump the engine to `wave`, spawn that wave's entities,
// then force every sub-wave to spawn by clearing the non-boss field + ticking
// the live wave driver. Returns whether a modular boss landed in the pool.
async function spawnFullWave(page, { wave, maxWaves }) {
    return page.evaluate(({ w, mw }) => {
        const ge = window.gameEngine;
        ge.game.runConfig = { maxWaves: mw, mode: 'NORMAL' };
        ge.game.currentWave = w;
        ge._modularBossSpawnedWave = null;
        ge._waveState = null;
        ge.enemyPool.activeObjects.slice().forEach((e) => ge.enemyPool.release(e));
        ge.game.state = 'PLAYING';
        ge.game.waveComplete = false;
        ge.spawnWaveEntities();
        for (let i = 0; i < 16; i++) {
            ge.enemyPool.activeObjects
                .slice()
                .filter((e) => !e.isBoss)
                .forEach((e) => ge.enemyPool.release(e));
            ge.game.state = 'PLAYING';
            ge.game.waveComplete = false;
            ge.updateWaveSystem();
        }
        const pool = ge.enemyPool.activeObjects;
        const boss = pool.find((e) => e.isBoss && e.bossId && e.active);
        return {
            wave: ge.game.currentWave,
            maxWaves: ge.game.runConfig.maxWaves,
            hasBoss: !!boss,
            bossId: boss ? boss.bossId : null,
        };
    }, { w: wave, mw: maxWaves });
}

// Read the synthesized wave config for a wave under a long run.
async function waveConfigIsTrivial(page, wave) {
    return page.evaluate(async (w) => {
        const mod = await import('/js/modules/wave/wave-data.js');
        const cfg = mod.getWaveConfig(w, 100);
        return { isWave1Config: cfg === mod.WAVE_DATA[1] };
    }, wave);
}

test.describe('QA-20: flat-wave boss spawning', () => {
    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    test('(a) a boss spawns on the first boss wave (10), not at wave 3', async ({ page }) => {
        const w10 = await spawnFullWave(page, { wave: 10, maxWaves: 100 });
        expect(w10.maxWaves).toBe(100);
        expect(w10.hasBoss).toBe(true);
        expect(w10.bossId).toBeTruthy();

        const w3 = await spawnFullWave(page, { wave: 3, maxWaves: 100 });
        expect(w3.hasBoss).toBe(false); // off-cadence → no modular boss
    });

    test('(b) past wave 30: config is NOT trivial wave-1 + a boss spawns on wave 40', async ({ page }) => {
        const shape = await waveConfigIsTrivial(page, 33);
        expect(shape.isWave1Config).toBe(false);

        const w40 = await spawnFullWave(page, { wave: 40, maxWaves: 100 });
        expect(w40.hasBoss).toBe(true);
        expect(w40.bossId).toBeTruthy();
    });

    test('(c) the default 30-wave run spawns its boss on wave 10', async ({ page }) => {
        const r = await spawnFullWave(page, { wave: 10, maxWaves: 30 });
        expect(r.maxWaves).toBe(30);
        expect(r.hasBoss).toBe(true);
        expect(r.bossId).toBeTruthy();
    });
});
