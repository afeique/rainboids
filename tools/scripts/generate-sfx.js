// Pre-render every SFX in SOUND_DEFS to a single .wav under /sfx/<name>.wav,
// then write /sfx/manifest.json mapping sound names to their file paths.
//
// Run:  node tools/scripts/generate-sfx.js [--clean]
//
// SOUND_DEFS shapes:
//   { preset: 'name' [, overrides] } → one sfxr.generate(preset) render
//   { params: {...} }                → one render from explicit params
//   { layers: [{ params, gain? }] }  → render each, sum-mix, normalize
//
// All output is mono 16-bit PCM at 44.1 kHz. Layered defs use SoundEffect's
// normalized float buffer directly, summed sample-wise then peak-normalized
// to 0.95 to leave a hair of headroom; single-voice defs go through the
// same path so the encoding is uniform across the library.

import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SOUND_DEFS } from '../../js/modules/audio/sound-defs.js';

const require = createRequire(import.meta.url);
const jsfxr = require('jsfxr');
const { sfxr, SoundEffect, Params } = jsfxr;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SFX_ROOT = join(REPO_ROOT, 'sfx');
const TARGET_PEAK = 0.95;
const SAMPLE_RATE = 44100;

const args = new Set(process.argv.slice(2));
if (args.has('--clean') && existsSync(SFX_ROOT)) {
    rmSync(SFX_ROOT, { recursive: true, force: true });
}
mkdirSync(SFX_ROOT, { recursive: true });

// Render one params object to a Float32Array of normalized samples (-1..1).
//
// CRITICAL: SoundEffect must receive a *fully-defaulted* Params instance.
// The sound-defs entries supply only the fields they care about
// (wave_type, p_base_freq, etc.) — any field they leave out becomes
// `undefined` inside SoundEffect's internal math. The killer is
// `p_lpf_freq`, which the Params default sets to `1` (LPF wide open) —
// when undefined it's treated as 0 and the engine's low-pass filter
// silences the entire output. Same trap for sound_vol, p_vib_*, p_lpf_*,
// etc. Merging onto `new Params()` inherits every documented default and
// then lets our partial params override only what we want to set.
function renderParamsFloat(params) {
    const merged = Params ? Object.assign(new Params(), params) : params;
    const sfx = new SoundEffect(merged);
    const raw = sfx.getRawBuffer();
    const norm = raw.normalized;
    // Some jsfxr versions return a plain Array; coerce to Float32Array.
    return norm instanceof Float32Array ? norm : Float32Array.from(norm);
}

// Build the final float buffer for a sound def (single voice or layered).
function renderDefFloat(def) {
    if (def.preset) {
        const params = sfxr.generate(def.preset);
        if (def.overrides) Object.assign(params, def.overrides);
        return renderParamsFloat(params);
    }
    if (def.params) {
        return renderParamsFloat(def.params);
    }
    if (def.layers && def.layers.length) {
        const tracks = def.layers.map(l => ({
            samples: renderParamsFloat(l.params),
            gain: typeof l.gain === 'number' ? l.gain : 1 / def.layers.length,
        }));
        const totalLen = Math.max(...tracks.map(t => t.samples.length));
        const out = new Float32Array(totalLen);
        for (const { samples, gain } of tracks) {
            for (let i = 0; i < samples.length; i++) out[i] += samples[i] * gain;
        }
        // Peak-normalize so layered sounds don't clip after sum-mixing.
        let peak = 0;
        for (let i = 0; i < out.length; i++) {
            const v = Math.abs(out[i]);
            if (v > peak) peak = v;
        }
        if (peak > TARGET_PEAK) {
            const scale = TARGET_PEAK / peak;
            for (let i = 0; i < out.length; i++) out[i] *= scale;
        }
        return out;
    }
    throw new Error('SOUND_DEFS entry must have preset, params, or layers');
}

// Write a Float32Array of samples (-1..1) as 16-bit PCM mono WAV bytes.
function encodeWav16(samples, sampleRate) {
    const numSamples = samples.length;
    const dataSize = numSamples * 2;
    const buf = Buffer.alloc(44 + dataSize);
    let p = 0;
    buf.write('RIFF', p); p += 4;
    buf.writeUInt32LE(36 + dataSize, p); p += 4;
    buf.write('WAVE', p); p += 4;
    buf.write('fmt ', p); p += 4;
    buf.writeUInt32LE(16, p); p += 4;            // fmt chunk size
    buf.writeUInt16LE(1, p);  p += 2;            // PCM format
    buf.writeUInt16LE(1, p);  p += 2;            // mono
    buf.writeUInt32LE(sampleRate, p); p += 4;
    buf.writeUInt32LE(sampleRate * 2, p); p += 4; // byte rate
    buf.writeUInt16LE(2, p);  p += 2;            // block align
    buf.writeUInt16LE(16, p); p += 2;            // bits per sample
    buf.write('data', p); p += 4;
    buf.writeUInt32LE(dataSize, p); p += 4;
    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        buf.writeInt16LE(Math.round(s * 0x7FFF), p);
        p += 2;
    }
    return buf;
}

const manifest = { generatedAt: new Date().toISOString(), sounds: {} };
let totalBytes = 0;

for (const [name, def] of Object.entries(SOUND_DEFS)) {
    const samples = renderDefFloat(def);
    const wav = encodeWav16(samples, SAMPLE_RATE);
    const file = `${name}.wav`;
    writeFileSync(join(SFX_ROOT, file), wav);
    manifest.sounds[name] = `sfx/${file}`;
    totalBytes += wav.length;
    const layers = def.layers ? `${def.layers.length} layers` : (def.preset ? `preset:${def.preset}` : 'single voice');
    process.stdout.write(`  ${name.padEnd(32)}  ${(wav.length / 1024).toFixed(1).padStart(6)} KB  (${layers})\n`);
}

writeFileSync(join(SFX_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const count = Object.keys(manifest.sounds).length;
console.log(`\nGenerated ${count} files (${(totalBytes / 1024).toFixed(1)} KB) → ${SFX_ROOT}`);
console.log(`Manifest: ${join(SFX_ROOT, 'manifest.json')}`);
