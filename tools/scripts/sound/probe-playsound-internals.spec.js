// Deep runtime probe — replaces `audioManager.playSound` with a
// fully-instrumented version that logs every internal step:
//
//     1. found in MANIFEST
//     2. audio ready (audioContext + _loaded)
//     3. soundEnabled[name] check
//     4. throttle window check
//     5. buffer lookup (audioBuffers.get)
//     6. audioContext.state
//     7. createBufferSource → src.start(0)
//     8. src.onended fires (proves the buffer played end-to-end)
//
// Used in 5.69.3 to confirm every destruction WAV was running through
// the BufferSource → GainNode → destination chain to completion. The
// `onended` step is the proof of life — if it fires, the audio reached
// the speaker output (whether or not the speaker could reproduce it).
//
// After this probe confirmed the dispatch worked, the spectrum.mjs
// audit revealed that 87-98% of energy lived below 150Hz — the bug
// was perceptual / hardware, not in the dispatch chain.
//
// Run with:
//     npx playwright test tools/scripts/sound/probe-playsound-internals.spec.js \
//         --project=qa --workers=1 --reporter=line

import { test } from '@playwright/test';
import { loadGame, startGame } from '../../../tests/helpers/game-helpers.js';

test('deep probe — what actually happens inside playSound', async ({ page }) => {
    const browserLogs = [];
    page.on('console', msg => browserLogs.push(`[${msg.type()}] ${msg.text()}`));

    await loadGame(page);

    await page.evaluate(() => {
        window.__events = [];
        const am = window.gameEngine.audioManager;
        const SFX_BASE = 'sfx/';

        am.playSound = function (name) {
            const log = (step, extra = {}) => window.__events.push({ name, step, ...extra });

            const soundNames = this.getSoundNames();
            if (!soundNames.includes(name)) {
                log('REJECT: not in MANIFEST');
                return false;
            }
            log('1. found in MANIFEST');

            if (!this.audioContext) { log('REJECT: no audioContext'); return true; }
            if (!this._loaded)      { log('REJECT: not _loaded');      return true; }
            log('2. audio ready');

            if (this.soundEnabled[name] === false) {
                log('REJECT: soundEnabled=false');
                return true;
            }
            log('3. soundEnabled ok', { val: this.soundEnabled[name] });

            const now = performance.now();
            const last = this.lastPlayedAt.get(name) || 0;
            const dt = now - last;
            log('4. throttle check', { dt, last });
            this.lastPlayedAt.set(name, now);

            const path = SFX_BASE + name + '.wav';
            const buf = this.audioBuffers.get(path);
            log('5. buffer lookup', { path, hasBuf: !!buf, dur: buf?.duration });
            if (!buf) { log('REJECT: no buffer'); return true; }

            log('6. ctx state', { state: this.audioContext.state });
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => log('ctx resumed'));
            }

            try {
                const src = this.audioContext.createBufferSource();
                src.buffer = buf;
                const gain = this.audioContext.createGain();
                gain.gain.value = this.sfxMasterVol;
                src.connect(gain).connect(this.audioContext.destination);
                src.start(0);
                log('7. src.start() OK', { gain: gain.gain.value, masterVol: this.sfxMasterVol });
                src.onended = () => log('8. src.onended fired');
            } catch (e) {
                log('REJECT: exception', { msg: e.message });
            }
            return true;
        };
    });

    await startGame(page);
    await page.waitForTimeout(500);

    // Drive playSound directly for each per-enemy destruction
    await page.evaluate(async () => {
        const am = window.gameEngine.audioManager;
        const types = ['HUNTER','GUARDIAN','WASP','STALKER','DRIFTER','PROWLER','WEAVER','SENTINEL','TANGERINE','TITAN'];
        for (const t of types) {
            const name = `enemyDestroy_${t}`;
            console.log('--- direct call:', name);
            am.playSound(name);
            await new Promise(r => setTimeout(r, 60));
        }
    });

    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => ({
        events: window.__events,
        masterVol: window.gameEngine.audioManager.sfxMasterVol,
        audioCtxState: window.gameEngine.audioManager.audioContext.state,
        bufferKeys: Array.from(window.gameEngine.audioManager.audioBuffers.keys())
            .filter(k => k.includes('enemyDestroy'))
            .map(k => ({
                key: k,
                dur: window.gameEngine.audioManager.audioBuffers.get(k).duration,
            })),
    }));

    console.log('=== EVENTS ===');
    for (const e of result.events) console.log(JSON.stringify(e));
    console.log('=== MASTER VOL ===', result.masterVol);
    console.log('=== AUDIO CTX STATE ===', result.audioCtxState);
    console.log('=== BUFFERS ===');
    for (const b of result.bufferKeys) console.log(b.key, 'dur=' + b.dur);
});
