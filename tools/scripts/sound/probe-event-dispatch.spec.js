// Runtime probe — verifies the audio event dispatch chain end-to-end.
//
// Hooks `audioManager.playSound` and `events.emit` with logging
// wrappers, spawns a HUNTER, kills it via the collision system, and
// dumps every audio:* event and playSound name that fired.
//
// Used in 5.69.2/.3 to prove the dispatch was working before
// debugging perceptual / spectral issues — confirmed enemy.type was
// being passed correctly and `enemyDestroy_HUNTER` was being called.
//
// Run with:
//     npx playwright test tools/scripts/sound/probe-event-dispatch.spec.js \
//         --project=qa --workers=1 --reporter=line
//
// (Also requires the dev server on http://localhost:8090 — Playwright's
// `webServer` config in playwright.config.js handles this automatically.)
//
// This file is NOT part of the regular test suite; the qa project's
// `testDir` is `./tests`. It only runs when explicitly invoked.

import { test } from '@playwright/test';
import { loadGame, startGame } from '../../../tests/helpers/game-helpers.js';

test('probe enemy destruction sound dispatch', async ({ page }) => {
    const browserLogs = [];
    page.on('console', msg => browserLogs.push(`[${msg.type()}] ${msg.text()}`));

    await loadGame(page);

    await page.evaluate(() => {
        window.__playSoundCalls = [];
        window.__emitCalls = [];

        const am = window.gameEngine.audioManager;
        const origPlay = am.playSound.bind(am);
        am.playSound = function (name) {
            window.__playSoundCalls.push(name);
            return origPlay(name);
        };

        const evs = window.gameEngine.events;
        const origEmit = evs.emit.bind(evs);
        evs.emit = function (event, data) {
            if (event && typeof event === 'string' && event.startsWith('audio:')) {
                window.__emitCalls.push({ event, data });
            }
            return origEmit(event, data);
        };
    });

    await startGame(page);
    await page.waitForTimeout(500);

    // Spawn HUNTER and kill it via collision-system.damageEnemy
    await page.evaluate(() => {
        const ge = window.gameEngine;
        const x = ge.gameField.width / 2;
        const y = ge.gameField.height / 2;
        const enemy = ge.enemyPool.get(x, y, 'HUNTER', 1);
        console.log('spawn enemy:', !!enemy, 'type:', enemy?.type);
        if (!enemy) return;

        const cm = ge.collisionManager || ge.collisionSystem;
        if (cm?.damageEnemy) {
            cm.damageEnemy(enemy, 99999);
            console.log('post-kill active:', enemy.active, 'health:', enemy.health);
        }
    });
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => ({
        emitCalls: window.__emitCalls,
        playSoundCalls: window.__playSoundCalls,
        audioReady: window.gameEngine.audioManager._loaded,
        audioCtxState: window.gameEngine.audioManager.audioContext?.state,
        bufferKeys: Array.from(window.gameEngine.audioManager.audioBuffers.keys())
            .filter(k => k.includes('enemyDestroy')),
    }));

    console.log('=== BROWSER LOGS ===');
    for (const l of browserLogs) console.log(l);
    console.log('=== PROBE RESULT ===');
    console.log(JSON.stringify(result, null, 2));
});
