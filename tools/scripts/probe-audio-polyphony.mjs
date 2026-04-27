// Headless probe: verify the WebAudio rewrite plays multiple SFX concurrently.
// Boots dev server externally; this script only drives the browser.
//
// Usage:
//   npm run dev            # in another shell
//   node tools/scripts/probe-audio-polyphony.mjs

import { chromium } from 'playwright';

const URL = process.env.PROBE_URL || 'http://localhost:5173/';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') {
        consoleErrors.push(`[${m.type()}] ${m.text()}`);
    }
});
page.on('pageerror', e => consoleErrors.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'load' });
// Trigger a user gesture to satisfy autoplay policy and start the game.
await page.keyboard.press('Enter');
await page.waitForTimeout(800);

const result = await page.evaluate(async () => {
    const ge = window.gameEngine;
    if (!ge || !ge.audioManager) return { ok: false, error: 'no gameEngine.audioManager' };
    const am = ge.audioManager;

    // Wait up to 2s for buffers to decode.
    const start = Date.now();
    while (am.audioBuffers.size < Object.keys(am.sounds).length && Date.now() - start < 2000) {
        await new Promise(r => setTimeout(r, 50));
    }

    const decoded = am.audioBuffers.size;
    const total = Object.keys(am.sounds).length;
    const ctxState = am.audioContext && am.audioContext.state;

    // Fire 12 sounds in the same tick — old pool would have dropped most.
    const names = ['shoot', 'hit', 'explosion', 'shoot', 'hit', 'explosion',
                   'playerHit_PULSE_CANNON', 'playerHit_STORM_NEEDLES',
                   'enemyHit_hunter_single', 'enemyHit_missile',
                   'shoot', 'hit'];
    let played = 0;
    for (const n of names) {
        try { am.playSound(n); played++; } catch (e) { /* count failure */ }
    }
    return { ok: true, decoded, total, ctxState, fired: played };
});

console.log('audio probe:', JSON.stringify(result, null, 2));
if (consoleErrors.length) {
    console.log('console issues:');
    consoleErrors.forEach(e => console.log('  ' + e));
}

await browser.close();
process.exit(result.ok && result.decoded === result.total ? 0 : 1);
