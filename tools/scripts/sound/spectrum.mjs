// Spectral distribution audit for every WAV in `sfx/`. Computes a
// sliding-window FFT across each clip and lumps energy into 6 bands:
//
//     sub <150       — sub-bass: chest-thump on a real subwoofer; most
//                      laptop / phone speakers cannot reproduce this.
//                      A sound that's mostly here will be inaudible
//                      on integrated speakers (see 5.69.3 fix).
//     bass 150-400   — felt-not-heard band on small speakers; full
//                      body on decent speakers / headphones.
//     lmid 400-1k    — fully audible everywhere. The "body" range.
//     mid 1k-3k      — fully audible everywhere. The "presence" range.
//     hmid 3k-8k     — fully audible everywhere. Sizzle / crackle.
//     high >8k       — air content; rolls off on small speakers.
//
// Outputs % of total energy per band per file. A balanced explosion
// has substantial content in lmid + mid (audible on every speaker)
// AND optionally sub / bass (extra weight on woofers + headphones).
//
// Run from repo root:
//     node tools/scripts/sound/spectrum.mjs
//
// Optional: pass a glob-like prefix to filter
//     node tools/scripts/sound/spectrum.mjs enemyDestroy

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SFX_DIR = join(REPO_ROOT, 'sfx');

function loadWav(path) {
    const buf = readFileSync(path);
    const sr = buf.readUInt32LE(24);
    const dataSize = buf.readUInt32LE(40);
    const n = dataSize / 2;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(44 + i * 2) / 32767;
    return { samples: out, sr };
}

// Sliding-window naive DFT — averages over the entire clip.
// N=2048 is a sweet spot: ~46Hz resolution at 44.1kHz, fast enough
// for ~10-second clips without becoming the slow part.
function spectrumByBand(samples, sr) {
    const N = 2048;
    const hop = 512;
    const bins = N / 2;
    const binHz = sr / N;

    const bands = {
        'sub<150':       0,
        'bass150-400':   0,
        'lmid400-1k':    0,
        'mid1k-3k':      0,
        'hmid3k-8k':     0,
        'high>8k':       0,
    };

    for (let start = 0; start + N <= samples.length; start += hop) {
        const chunk = new Float32Array(N);
        // Hann window
        for (let i = 0; i < N; i++) {
            chunk[i] = samples[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
        }
        // DFT
        const re = new Float64Array(bins);
        const im = new Float64Array(bins);
        for (let k = 0; k < bins; k++) {
            let r = 0, ii = 0;
            for (let n = 0; n < N; n++) {
                const t = -2 * Math.PI * k * n / N;
                r += chunk[n] * Math.cos(t);
                ii += chunk[n] * Math.sin(t);
            }
            re[k] = r;
            im[k] = ii;
        }
        // Sum power per band
        for (let k = 1; k < bins; k++) {
            const f = k * binHz;
            const p = re[k] * re[k] + im[k] * im[k];
            if (f < 150)        bands['sub<150']     += p;
            else if (f < 400)   bands['bass150-400'] += p;
            else if (f < 1000)  bands['lmid400-1k']  += p;
            else if (f < 3000)  bands['mid1k-3k']    += p;
            else if (f < 8000)  bands['hmid3k-8k']   += p;
            else                bands['high>8k']     += p;
        }
    }

    let total = 0;
    for (const v of Object.values(bands)) total += v;
    const pct = {};
    for (const [k, v] of Object.entries(bands)) {
        pct[k] = total > 0 ? (v / total * 100).toFixed(1) : '0';
    }
    return pct;
}

const filter = process.argv[2] || '';
const files = readdirSync(SFX_DIR)
    .filter(f => f.endsWith('.wav') && f.includes(filter))
    .sort();

if (files.length === 0) {
    console.log(`No .wav files found in ${SFX_DIR}` + (filter ? ` matching "${filter}"` : ''));
    process.exit(0);
}

console.log('File'.padEnd(38) + '  sub  bass  lmid   mid  hmid  high');
for (const f of files) {
    const { samples, sr } = loadWav(join(SFX_DIR, f));
    const b = spectrumByBand(samples, sr);
    const row = [
        b['sub<150'],
        b['bass150-400'],
        b['lmid400-1k'],
        b['mid1k-3k'],
        b['hmid3k-8k'],
        b['high>8k'],
    ].map(x => x.padStart(5)).join(' ');
    console.log(f.padEnd(38) + ' ' + row);
}
