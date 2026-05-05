// Audit every WAV in `sfx/` for peak amplitude, RMS energy, and
// nonzero-sample ratio. Used to verify the offline jsfxr generator
// is producing audible content (not silent files due to a missing
// param default — see 5.68.10 silence-bug fix).
//
// Reads 16-bit PCM mono WAVs (the format `tools/scripts/generate-sfx.js`
// emits). Prints one row per file:
//
//     name                           samples=N  peak=V (dB) nz=A/N avgAbs=R
//
//   • samples — total PCM samples in the data section
//   • peak    — loudest 16-bit value (max 32767 = 0 dBFS, -0.4 dB ≈ 31129)
//   • nz      — count of nonzero samples / total (catches all-silent files)
//   • avgAbs  — mean absolute value (rough RMS proxy for perceived loudness)
//
// Run from repo root:
//     node tools/scripts/sound/check-wavs.mjs
//
// Optional: pass a glob-like prefix to filter
//     node tools/scripts/sound/check-wavs.mjs enemyDestroy

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SFX_DIR = join(REPO_ROOT, 'sfx');

const filter = process.argv[2] || '';
const files = readdirSync(SFX_DIR)
    .filter(f => f.endsWith('.wav') && f.includes(filter))
    .sort();

if (files.length === 0) {
    console.log(`No .wav files found in ${SFX_DIR}` + (filter ? ` matching "${filter}"` : ''));
    process.exit(0);
}

for (const f of files) {
    const buf = readFileSync(join(SFX_DIR, f));
    const samples = (buf.length - 44) / 2;
    let peak = 0, sumAbs = 0, nonzero = 0;
    for (let i = 0; i < samples; i++) {
        const v = buf.readInt16LE(44 + i * 2);
        const av = Math.abs(v);
        if (av > peak) peak = av;
        if (av > 0) nonzero++;
        sumAbs += av;
    }
    const peakDb = peak > 0 ? (20 * Math.log10(peak / 32767)).toFixed(1) : '-inf';
    const rms = sumAbs / Math.max(1, samples);
    console.log(
        `${f.padEnd(46)} samples=${String(samples).padStart(6)} ` +
        `peak=${String(peak).padStart(5)} (${peakDb} dB) ` +
        `nz=${nonzero}/${samples} avgAbs=${rms.toFixed(0)}`
    );
}
