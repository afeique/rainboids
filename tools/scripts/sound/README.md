# Sound diagnostics scripts

Standalone scripts for debugging the SFXR audio pipeline. None of these
are part of the regular test suite — they're diagnostic utilities used
to investigate specific audio bugs (silence, perceptibility, dispatch).

| Script | Purpose |
|--------|---------|
| `check-wavs.mjs` | Audit every WAV in `sfx/` for peak amplitude, RMS energy, nonzero-sample ratio. Catches silent files. |
| `spectrum.mjs` | Sliding-window FFT per WAV, lumped into 6 frequency bands (sub / bass / lmid / mid / hmid / high). Catches sounds whose energy lives in bands small speakers can't reproduce. |
| `probe-event-dispatch.spec.js` | Playwright probe that hooks `events.emit` and `audioManager.playSound` to verify the dispatch chain end-to-end (e.g. `audio:enemy-destroy` → `enemyDestroy_HUNTER`). |
| `probe-playsound-internals.spec.js` | Playwright probe that replaces `playSound` with an instrumented version logging every internal step (manifest hit, throttle, buffer lookup, `src.start()`, `src.onended`). |

## Usage

```bash
# Static audits (offline — read sfx/ directly)
node tools/scripts/sound/check-wavs.mjs                 # all WAVs
node tools/scripts/sound/check-wavs.mjs enemyDestroy    # filter by prefix
node tools/scripts/sound/spectrum.mjs                   # all WAVs
node tools/scripts/sound/spectrum.mjs enemyDestroy      # filter by prefix

# Runtime probes (need Playwright + dev server)
npx playwright test tools/scripts/sound/probe-event-dispatch.spec.js \
    --project=qa --workers=1 --reporter=line

npx playwright test tools/scripts/sound/probe-playsound-internals.spec.js \
    --project=qa --workers=1 --reporter=line
```

## History

These scripts were written during the 5.68.7 → 5.69.4 audio overhaul:

- **5.68.10** — `check-wavs.mjs` revealed every jsfxr WAV was silent
  (peak=0, nonzero=0). Root cause: the generator was passing partial
  param objects into `SoundEffect()`; `p_lpf_freq` defaulted to 0
  instead of 1, so the synth's low-pass filter zeroed every sample.
- **5.69.2/.3** — `probe-event-dispatch.spec.js` and
  `probe-playsound-internals.spec.js` confirmed the destruction
  audio dispatch chain was working perfectly (every WAV reached
  `BufferSource.onended`). The bug was elsewhere.
- **5.69.3** — `spectrum.mjs` revealed the actual bug: 87-98% of each
  destruction WAV's energy lived below 150 Hz, a band most laptop /
  phone speakers cannot reproduce. The audio chain was fine; the
  destinations couldn't render the band the energy was in.
- **5.69.4** — multi-band redesign uses `spectrum.mjs` to verify each
  destruction has substantial sub-bass (woofer thump) AND mid-band
  content (audible everywhere).
