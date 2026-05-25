/**
 * QA-20: NON-DEFAULT RUN SHAPE — boss spawning + past-30 content (H2)
 *
 * Bug-Pass 2026-05-25 H2: with a non-default wavesPerStage (6), boss spawning
 * broke (the authored `isBoss` table sits at the fixed 3/6/9 positions, so the
 * stage-final boss vanished) and runs went trivial past wave 30 (getWaveConfig
 * fell back to wave-1 content). This spec drives the LIVE engine with a wps=6
 * run shape and asserts:
 *
 *   (a) wave 6 (the first real stage-final for wps=6) spawns a modular boss,
 *       and wave 3 (mid-stage for wps=6) does NOT.
 *   (b) past wave 30 the wave config is NOT the trivial wave-1 content, and a
 *       boss still spawns on a stage-final (wave 36).
 *
 * Mirrors the QA-17 boss harness (drive the engine via page.evaluate; detect a
 * boss in the active enemy pool by isBoss + bossId). Sub-wave pacing is forced
 * by repeatedly clearing the non-boss field then ticking updateWaveSystem
 * (the live loop's wave driver) so the LAST sub-wave — where the stage-final
 * boss lives — actually spawns, without needing an AI to pilot it.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

// Configure a wps=6 run, jump the engine to `wave`, spawn that wave's entities,
// then force every sub-wave to spawn by clearing the non-boss field + ticking
// the live wave driver. Returns whether a modular boss landed in the pool.
async function spawnFullWave(page, { wave, stages, wavesPerStage }) {
    return page.evaluate(({ w, st, wps }) => {
        const ge = window.gameEngine;
        ge.game.runConfig = { stages: st, wavesPerStage: wps, mode: 'NORMAL' };
        ge.game.currentWave = w;
        ge._modularBossSpawnedWave = null;
        ge._waveState = null; // reset tryAdvanceSubWave's per-wave state
        // Clear the field so we measure only THIS wave's spawns.
        ge.enemyPool.activeObjects.slice().forEach((e) => ge.enemyPool.release(e));
        ge.game.state = 'PLAYING';
        ge.game.waveComplete = false;
        // Sub-wave 0 (+ the stage-final boss if this wave has only one sub-wave).
        ge.spawnWaveEntities();
        // Force-advance the remaining sub-waves: empty the non-boss field then
        // tick the live wave driver (updateWaveSystem → tryAdvanceSubWave). The
        // ≤2-enemy advance trigger fires immediately on an empty field, so each
        // iteration promotes one sub-wave. Budget covers the deepest wave (3).
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
            wavesPerStage: ge.game.runConfig.wavesPerStage,
            hasBoss: !!boss,
            bossId: boss ? boss.bossId : null,
        };
    }, { w: wave, st: stages, wps: wavesPerStage });
}

// Read the synthesized wave config for a wave under a long wps=6 run.
async function waveConfigIsTrivial(page, wave) {
    return page.evaluate(async (w) => {
        const ge = window.gameEngine;
        ge.game.runConfig = { stages: 100, wavesPerStage: 6, mode: 'NORMAL' };
        const mod = await import('/js/modules/wave/wave-data.js');
        const cfg = mod.getWaveConfig(w, 100 * 6);
        return { isWave1Config: cfg === mod.WAVE_DATA[1] };
    }, wave);
}

test.describe('QA-20: non-default run shape bosses', () => {
    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    test('(a) wps=6: a boss spawns on the stage-final (wave 6), not at wave 3', async ({ page }) => {
        const w6 = await spawnFullWave(page, { wave: 6, stages: 100, wavesPerStage: 6 });
        expect(w6.wavesPerStage).toBe(6);
        expect(w6.hasBoss).toBe(true);     // stage-final → modular boss present
        expect(w6.bossId).toBeTruthy();

        const w3 = await spawnFullWave(page, { wave: 3, stages: 100, wavesPerStage: 6 });
        expect(w3.hasBoss).toBe(false);    // mid-stage for wps=6 → no boss
    });

    test('(b) wps=6 past wave 30: config is NOT trivial wave-1 + a boss spawns on a stage-final', async ({ page }) => {
        // Wave 33 cycles to authored late-game content, NOT the trivial wave-1
        // 3-HUNTER opener (the old past-30 fallback bug).
        const shape = await waveConfigIsTrivial(page, 33);
        expect(shape.isWave1Config).toBe(false);

        // Wave 36 is a real stage-final for wps=6 (36 % 6 === 0) → a boss spawns
        // even though it's past the authored 30-wave table (cycled content).
        const w36 = await spawnFullWave(page, { wave: 36, stages: 100, wavesPerStage: 6 });
        expect(w36.hasBoss).toBe(true);
        expect(w36.bossId).toBeTruthy();
    });

    test('default 10×3 run still spawns its boss on wave 3 (default-safe)', async ({ page }) => {
        const r = await spawnFullWave(page, { wave: 3, stages: 10, wavesPerStage: 3 });
        expect(r.wavesPerStage).toBe(3);
        expect(r.hasBoss).toBe(true);
        expect(r.bossId).toBeTruthy();
    });
});
