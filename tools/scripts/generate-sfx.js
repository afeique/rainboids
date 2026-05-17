// Pre-render every SFX in SOUND_DEFS to /sfx/<name>_v{1..N}.wav variants,
// then write /sfx/manifest.json mapping sound names → variant lists.
//
// Run:  node tools/scripts/generate-sfx.js [--clean] [--variants=N]
//
// SOUND_DEFS shapes:
//   { preset: 'name' [, overrides] } → one sfxr.generate(preset) render
//   { params: {...} }                → one render from explicit params
//   { layers: [{ params, gain? }] }  → render each, sum-mix, normalize
//   Add { variants: N }              → override per-sound variant count
//   Add { noVariants: true }         → emit only {name}.wav (no variants)
//
// 6.1.4 — Each sound now renders N variants (default 4). Variant index 1
// is the canonical (unmutated) render; indices 2..N apply small seeded
// perturbations to each layer's SFXR params (freq ±5%, env ±4%, etc.)
// so the AudioManager can pick a different variant PER SESSION, giving
// each run a subtly different sonic palette without changing identity.
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

// CLI --variants=N override; defaults to 8 (was 4 in 6.1.4). Per-sound
// `variants: N` in SOUND_DEFS takes precedence.
const DEFAULT_VARIANTS = (() => {
    for (const a of args) {
        const m = /^--variants=(\d+)$/.exec(a);
        if (m) return Math.max(1, Math.min(16, parseInt(m[1], 10)));
    }
    return 8;
})();

// 6.1.5 — WIDER seeded mutations + AWAKEN mechanic for real variety.
// Each variant index still produces a deterministic render (re-runs
// stable; only the session's runtime pick is random), but the
// perturbations are now ~3× wider than 6.1.4 so each variant has a
// genuinely different sonic character:
//
//   freq      ±0.15   (was 0.05) — noticeable pitch shifts
//   envelope  ±0.12   (was 0.04) — different attack/decay shapes
//   timbre    ±0.12   (was 0.04) — duty / arp / repeat variations
//   filter    ±0.10   (was 0.03) — LPF/HPF sweeps
//   vibrato   ±0.10   (was 0.03) — vibrato depth + speed
//
// AWAKEN: zero-valued params previously stayed at 0 (meaning "off"
// in SFXR semantics). Now they have a small chance (AWAKEN_CHANCE
// = 22%) per variant of being turned ON to a random non-zero value,
// adding NEW timbral elements that weren't in the canonical (e.g.,
// surprise vibrato, arpeggio sparkle, duty modulation). The awaken
// budgets are narrower than the mutation budgets so the new element
// blends rather than dominating.
//
// v1 is still canonical (identity) for back-compat: { name }.wav copies
// it. Variants v2..vN get the wide mutations + awakens.
const MUTATION_BUDGET = {
    p_base_freq:    { range: 0.15, min: 0, max: 1 },
    p_freq_ramp:    { range: 0.15, min: -1, max: 1 },
    p_freq_dramp:   { range: 0.12, min: -1, max: 1 },
    p_env_attack:   { range: 0.12, min: 0, max: 1 },
    p_env_sustain:  { range: 0.12, min: 0, max: 1 },
    p_env_decay:    { range: 0.12, min: 0, max: 1 },
    p_env_punch:    { range: 0.14, min: 0, max: 1 },
    p_duty:         { range: 0.12, min: 0, max: 1 },
    p_duty_ramp:    { range: 0.12, min: -1, max: 1 },
    p_arp_speed:    { range: 0.12, min: 0, max: 1 },
    p_arp_mod:      { range: 0.12, min: -1, max: 1 },
    p_repeat_speed: { range: 0.12, min: 0, max: 1 },
    p_lpf_freq:     { range: 0.10, min: 0, max: 1 },
    p_lpf_ramp:     { range: 0.10, min: -1, max: 1 },
    p_lpf_resonance:{ range: 0.10, min: 0, max: 1 },
    p_hpf_freq:     { range: 0.10, min: 0, max: 1 },
    p_hpf_ramp:     { range: 0.10, min: -1, max: 1 },
    p_vib_strength: { range: 0.10, min: 0, max: 1 },
    p_vib_speed:    { range: 0.10, min: 0, max: 1 },
    p_pha_offset:   { range: 0.10, min: -1, max: 1 },
    p_pha_ramp:     { range: 0.10, min: -1, max: 1 },
};

// 6.1.5 — Awaken budgets: when a zero param "wakes up", clamp its
// new value to this range (kept narrower than mutation budgets so
// the surprise element blends rather than dominates the sound).
const AWAKEN_CHANCE = 0.22;
const AWAKEN_BUDGET = {
    p_duty_ramp:    { min: -0.20, max: 0.20 },
    p_arp_speed:    { min: 0.10,  max: 0.40 },
    p_arp_mod:      { min: -0.30, max: 0.30 },
    p_repeat_speed: { min: 0.10,  max: 0.35 },
    p_vib_strength: { min: 0.05,  max: 0.25 },
    p_vib_speed:    { min: 0.10,  max: 0.45 },
    p_pha_offset:   { min: -0.20, max: 0.20 },
    p_pha_ramp:     { min: -0.20, max: 0.20 },
    p_freq_dramp:   { min: -0.15, max: 0.15 },
};

// Mulberry32 — deterministic seeded RNG. Returns a function that
// produces uniform [0, 1) floats. Tiny + decent distribution; fine
// for mutation seeds.
function makeRng(seed) {
    let s = (seed | 0) >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
}

// Hash a (name, variantIndex, layerIndex) triple into a 32-bit seed.
function variantSeed(name, variantIdx, layerIdx) {
    let h = 2166136261 >>> 0;
    const s = `${name}|${variantIdx}|${layerIdx}`;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Returns a NEW params object with seeded perturbations applied.
// variantIdx=1 returns identity (no mutation) so v1 == canonical.
// variantIdx >= 2 applies WIDE mutations + AWAKEN chance (6.1.5).
function mutateParams(params, name, variantIdx, layerIdx) {
    if (variantIdx <= 1) return { ...params };
    const rng = makeRng(variantSeed(name, variantIdx, layerIdx));
    const out = { ...params };

    // Pass 1 — perturb already-set params within their mutation budget.
    for (const key of Object.keys(out)) {
        const budget = MUTATION_BUDGET[key];
        if (!budget) continue;
        const original = out[key];
        if (original === 0 || original == null) continue; // skip "off" — awakened in pass 2
        const delta = (rng() * 2 - 1) * budget.range;
        out[key] = clamp(original + delta, budget.min, budget.max);
    }

    // Pass 2 — AWAKEN: zero-valued params have a small chance to turn
    // ON to a random value in their awaken budget, surfacing a new
    // timbral element (vibrato, arp sparkle, duty modulation, etc.)
    // that wasn't in the canonical. Driven by the same seeded RNG so
    // re-runs are deterministic.
    for (const [key, awaken] of Object.entries(AWAKEN_BUDGET)) {
        const original = out[key];
        if (original !== 0 && original != null) continue; // already on
        if (rng() >= AWAKEN_CHANCE) continue;             // didn't wake up
        const v = awaken.min + rng() * (awaken.max - awaken.min);
        out[key] = v;
    }

    return out;
}

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

// Build the final float buffer for a sound def for a specific variant.
// variantIdx=1 is canonical (no param mutation); 2..N apply seeded
// perturbations per layer. `name` is the sound's MANIFEST key (used as
// part of the mutation seed so the same sound + same variant idx
// always produces the same WAV across re-runs).
function renderDefFloat(def, name, variantIdx) {
    if (def.preset) {
        const params = sfxr.generate(def.preset);
        if (def.overrides) Object.assign(params, def.overrides);
        return renderParamsFloat(mutateParams(params, name, variantIdx, 0));
    }
    if (def.params) {
        return renderParamsFloat(mutateParams(def.params, name, variantIdx, 0));
    }
    if (def.layers && def.layers.length) {
        const tracks = def.layers.map((l, layerIdx) => ({
            samples: renderParamsFloat(mutateParams(l.params, name, variantIdx, layerIdx)),
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

const manifest = {
    generatedAt: new Date().toISOString(),
    defaultVariantCount: DEFAULT_VARIANTS,
    sounds: {},
};
let totalBytes = 0;
let totalFiles = 0;

for (const [name, def] of Object.entries(SOUND_DEFS)) {
    // Per-sound override: `variants: 1` for no-variant sounds (loops,
    // UI ticks); `variants: 8` for sounds where you want extra variety.
    // `noVariants: true` is an alias for `variants: 1`.
    const variantCount = def.noVariants
        ? 1
        : (typeof def.variants === 'number'
            ? Math.max(1, Math.min(16, def.variants | 0))
            : DEFAULT_VARIANTS);

    const variantFiles = [];
    let soundBytes = 0;

    for (let v = 1; v <= variantCount; v++) {
        const samples = renderDefFloat(def, name, v);
        const wav = encodeWav16(samples, SAMPLE_RATE);
        // v1 keeps the bare `{name}.wav` name so backward-compat readers
        // (anything still referring to the un-variant'd filename) still
        // find a canonical render. v2..vN get the `_v{N}.wav` suffix.
        const file = (v === 1 && variantCount === 1)
            ? `${name}.wav`
            : `${name}_v${v}.wav`;
        writeFileSync(join(SFX_ROOT, file), wav);
        variantFiles.push(`sfx/${file}`);
        soundBytes += wav.length;
    }

    // Also write the canonical `{name}.wav` (= v1 buffer) for back-compat
    // if variants exist. Saves the audio-manager fallback path from
    // having to know about the variant naming convention if it ever
    // looks up the bare name.
    if (variantCount > 1) {
        const canonical = renderDefFloat(def, name, 1);
        const wav = encodeWav16(canonical, SAMPLE_RATE);
        writeFileSync(join(SFX_ROOT, `${name}.wav`), wav);
        soundBytes += wav.length;
        totalFiles += 1;
    }

    manifest.sounds[name] = { variants: variantFiles };
    totalBytes += soundBytes;
    totalFiles += variantCount;

    const layers = def.layers ? `${def.layers.length} layers` : (def.preset ? `preset:${def.preset}` : 'single voice');
    process.stdout.write(`  ${name.padEnd(32)}  ${variantCount}× variants  ${(soundBytes / 1024).toFixed(1).padStart(7)} KB  (${layers})\n`);
}

writeFileSync(join(SFX_ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const soundCount = Object.keys(manifest.sounds).length;
console.log(`\nGenerated ${totalFiles} files for ${soundCount} sounds (${(totalBytes / 1024).toFixed(1)} KB) → ${SFX_ROOT}`);
console.log(`Manifest: ${join(SFX_ROOT, 'manifest.json')}`);
