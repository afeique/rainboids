// Audio manager — loads jsfxr-generated WAVs from `sfx/` and plays the
// right clip per event. Every SFX in the game is now jsfxr (no Kenney
// mp3s remain). Background music is independent (see MusicPlayer + the
// <audio> element wiring in main.js).
//
// Architecture:
//   • MANIFEST maps logical sound names → an array of WAV file paths.
//     Currently every entry is a single jsfxr WAV (the offline
//     generator pre-mixes 2-3 sfxr voices into each file), but the
//     playback path still supports flat-array (pick one) and layered-
//     bucket (pick one bucket, play all simultaneously) forms.
//   • init() fetches every unique file once, decodes into AudioBuffers,
//     stores in `audioBuffers` keyed by relative path. Resilient: if a
//     fetch or decode fails the rest still load and the missing entries
//     just degrade to silence.
//   • playSound(name) creates a BufferSource per play, attached to a
//     gain node sized by `sfxMasterVol`. AudioContext is created on
//     first user gesture (initializeAudio).
//   • A simple per-name min-interval throttle prevents the same sound
//     stacking on top of itself when rapid-fire events fire faster than
//     the human ear can distinguish (e.g. Storm Needles at 130ms fire
//     rate, particle hit sparks every collision).
//
// To regenerate the WAVs from `sound-defs.js`:
//     npm run generate-sfx

const SFX_BASE = 'sfx/';

// All entries are single-file jsfxr WAVs. Each WAV was rendered by the
// offline generator (sound-defs.js → tools/scripts/generate-sfx.js)
// from 2-3 stacked sfxr voices and peak-normalized.
const MANIFEST = {
    // ── Player firing / actions ─────────────────────────────────────
    shoot:                   ['shoot.wav'],
    tractorBeam:             ['tractorBeam.wav'],
    // 5.79.5 — Arc Lightning audio rework. The continuous loop is now
    //   a quiet ambient rumble (presence). On top of it we randomly
    //   trigger one of four distinct strike-and-thunder one-shots
    //   (arcStrike1..4) at randomized intervals, so each fire-press
    //   sounds like a sequence of unique strikes instead of a flat
    //   monotonous loop.
    // 5.79.11 — Arc Lightning loop uses the high-quality recorded
    //   thunder/lightning asset (5.79.35 — renamed from
    //   `thunderous_lightning_laser.mp3` to `arcLightningLoop.mp3` to
    //   match the camelCase convention used elsewhere in sfx/).
    //   Web Audio's decodeAudioData handles MP3 natively.
    arcLightningLoop:        ['arcLightningLoop.mp3'],
    arcStrike1:              ['arcStrike1.wav'],
    arcStrike2:              ['arcStrike2.wav'],
    arcStrike3:              ['arcStrike3.wav'],
    arcStrike4:              ['arcStrike4.wav'],
    // 5.79.10 — Heavier arc strike variants used when the beam is
    //   locked on a target (vs the lighter idle arcStrike1..4).
    arcHit1:                 ['arcHit1.wav'],
    arcHit2:                 ['arcHit2.wav'],
    arcHit3:                 ['arcHit3.wav'],
    // 5.79.11 — Lance Beam loop uses the high-quality recorded laser
    //   hum (5.79.35 — renamed from `Laser_Beam_Weapon_Active.mp3` to
    //   `laserBeamLoop.mp3` to match the camelCase convention used
    //   elsewhere in sfx/). The hit-sizzle variants (laserBeamHit1..3)
    //   stay synth-generated since they're short one-shots.
    laserBeamLoop:           ['laserBeamLoop.mp3'],
    laserBeamHit1:           ['laserBeamHit1.wav'],
    laserBeamHit2:           ['laserBeamHit2.wav'],
    laserBeamHit3:           ['laserBeamHit3.wav'],

    // ── Pickups ─────────────────────────────────────────────────────
    coin:                    ['coin.wav'],
    powerup:                 ['powerup.wav'],
    healthRegen:             ['healthRegen.wav'],

    // ── Player hit / killed ─────────────────────────────────────────
    playerHitAsteroid:       ['playerHitAsteroid.wav'],
    playerHitEnemy:          ['playerHitEnemy.wav'],
    playerExplosion:         ['playerExplosion.wav'],
    shield:                  ['shield.wav'],

    // ── Generic combat (fallbacks) ──────────────────────────────────
    hit:                     ['hit.wav'],
    enemyHit:                ['enemyHit.wav'],
    explosion:               ['explosion.wav'],

    // ── Destruction ─────────────────────────────────────────────────
    asteroidDestroy:         ['asteroidDestroy.wav'],
    enemyDestroy:            ['enemyDestroy.wav'],
    // Per-enemy destructions — game-engine tries `enemyDestroy_<TYPE>`
    // first and falls back to the generic `enemyDestroy` above.
    enemyDestroy_HUNTER:     ['enemyDestroy_HUNTER.wav'],
    enemyDestroy_GUARDIAN:   ['enemyDestroy_GUARDIAN.wav'],
    enemyDestroy_WASP:       ['enemyDestroy_WASP.wav'],
    enemyDestroy_STALKER:    ['enemyDestroy_STALKER.wav'],
    enemyDestroy_DRIFTER:    ['enemyDestroy_DRIFTER.wav'],
    enemyDestroy_PROWLER:    ['enemyDestroy_PROWLER.wav'],
    enemyDestroy_WEAVER:     ['enemyDestroy_WEAVER.wav'],
    enemyDestroy_SENTINEL:   ['enemyDestroy_SENTINEL.wav'],
    enemyDestroy_TANGERINE:  ['enemyDestroy_TANGERINE.wav'],
    enemyDestroy_TITAN:      ['enemyDestroy_TITAN.wav'],

    // ── Per-weapon enemy-hit sounds ─────────────────────────────────
    playerHit_PULSE_CANNON:  ['playerHit_PULSE_CANNON.wav'],
    playerHit_STORM_NEEDLES: ['playerHit_STORM_NEEDLES.wav'],
    playerHit_SCATTER_GUN:   ['playerHit_SCATTER_GUN.wav'],
    playerHit_RAIL_DRIVER:   ['playerHit_RAIL_DRIVER.wav'],
    playerHit_LANCE_BEAM:    ['playerHit_LANCE_BEAM.wav'],
    playerHit_LIGHTNING_ARC: ['playerHit_LIGHTNING_ARC.wav'],

    // ── Per-pattern enemy-bullet-hit sounds ─────────────────────────
    enemyHit_hunter_single:    ['enemyHit_hunter_single.wav'],
    enemyHit_guardian_spread:  ['enemyHit_guardian_spread.wav'],
    enemyHit_wasp_machinegun:  ['enemyHit_wasp_machinegun.wav'],
    enemyHit_charged_laser:    ['enemyHit_charged_laser.wav'],
    enemyHit_arc_lightning:    ['enemyHit_arc_lightning.wav'],
    enemyHit_missile:          ['enemyHit_missile.wav'],
    enemyHit_spiral_laser:     ['enemyHit_spiral_laser.wav'],
    enemyHit_sentinel_sweep:   ['enemyHit_sentinel_sweep.wav'],
    enemyHit_lay_mine:         ['enemyHit_lay_mine.wav'],
    enemyHit_sweep_laser:      ['enemyHit_sweep_laser.wav'],

    // ── Defense skill activations ───────────────────────────────────
    bulwark:                 ['bulwark.wav'],
    repairNanites:           ['repairNanites.wav'],
    phaseDash:               ['phaseDash.wav'],
    deflectorOrbs:           ['deflectorOrbs.wav'],
    empPulse:                ['empPulse.wav'],
    tractorShield:           ['tractorShield.wav'],

    // ── UI ──────────────────────────────────────────────────────────
    menuClick:               ['menuClick.wav'],
};

// Throttle window per sound name. Some sounds are spammed (Storm
// Needles ~7Hz, Lance Beam per-frame contact). Without this they pile
// up into noise. Values are min-ms-between-plays for the SAME name.
//
// Default for unlisted names (per-weapon, per-pattern variants etc.)
// is 30ms — fine for typical fire rates.
const SOUND_THROTTLE_MS = {
    shoot:             30,
    hit:               40,
    enemyHit:          40,
    explosion:         60,
    coin:              70,  // 5.79.28 — bumped 50 → 70ms so a 30-pixel coin shower doesn't pile up into a buzz; the new richer bell needs a touch of breathing room to read as distinct chimes.
    powerup:           120,
    healthRegen:       150,
    shield:            150,
    phaseDash:         200,
    bulwark:           200,
    empPulse:          200,
    deflectorOrbs:     200,
    repairNanites:     200,
    tractorShield:     200,
    playerHitAsteroid: 100,
    playerHitEnemy:    100,
    playerExplosion:   500,
    tractorBeam:       300,
    // 5.79.5 — arc strike one-shots throttled per-name so two of the
    //   same variant don't fire back-to-back. The scheduling logic
    //   below also enforces a global 200ms minimum between strikes.
    arcStrike1:        80,
    arcStrike2:        80,
    arcStrike3:        80,
    arcStrike4:        80,
    // 5.79.10 — heavier hit variants throttled the same.
    arcHit1:           80,
    arcHit2:           80,
    arcHit3:           80,
    // Lance Beam hit-sizzle variants throttled to 100 ms so a contact
    //   streak doesn't buzz.
    laserBeamHit1:     100,
    laserBeamHit2:     100,
    laserBeamHit3:     100,
    // 5.69.0 — UI tick throttled to ~50ms so a multi-click streak
    // (like rapidly tabbing the shop) doesn't build into a buzz.
    menuClick:         50,
    asteroidDestroy:   60,
    enemyDestroy:      60,
    // Per-enemy throttles — heavier ships have longer destruction
    // tails, so widen the gap to avoid stacking when a chain-kill
    // happens. Light ships keep the default 30 ms so a streak still
    // pops crisply.
    enemyDestroy_HUNTER:    40,
    enemyDestroy_WASP:      40,
    enemyDestroy_DRIFTER:   60,
    enemyDestroy_STALKER:   60,
    enemyDestroy_WEAVER:    60,
    enemyDestroy_TANGERINE: 80,
    enemyDestroy_SENTINEL:  100,
    enemyDestroy_PROWLER:   100,
    enemyDestroy_GUARDIAN:  120,
    enemyDestroy_TITAN:     200,
    // Per-weapon enemy-hit + per-pattern bullet-hit fall through to
    // the 30ms default — adequate for the highest-fire-rate guns.
};

// Build the unique-files set so we only fetch each mp3 once even when
// multiple manifest entries reference it. Walks both flat-array and
// layered-bucket forms.
function uniquePaths() {
    const out = new Set();
    for (const list of Object.values(MANIFEST)) {
        for (const item of list) {
            if (typeof item === 'string') {
                out.add(SFX_BASE + item);
            } else if (Array.isArray(item)) {
                for (const f of item) out.add(SFX_BASE + f);
            }
        }
    }
    return Array.from(out);
}

// 6.18.x — Eager-preload set. Only these sound names get fetched +
// decoded at boot; everything else lazy-loads on first play (and is
// cached thereafter). Keeps boot near-instant (~14 files / ~600 KB)
// instead of waiting on the full 23 MB / 515-file library.
//
// Selection rule: immediate-response combat SFX where first-play
// latency would be audible as missing-sound. Long-tail sounds
// (per-weapon hit variants, boss death roars, defense-skill triggers,
// loops) lazy-load on first use; the player accepts ~50-150 ms one-
// time fetch delay the first time each fires.
const EAGER_SOUNDS = new Set([
    // Player firing + actions (every-frame-ish)
    'shoot',
    // Pickups (frequent, must feel snappy + used as title-screen chimes)
    'coin', 'powerup', 'healthRegen',
    // Player damage / death (must fire on the exact damage frame)
    'playerHitAsteroid', 'playerHitEnemy', 'playerExplosion', 'shield',
    // Generic combat fallbacks (specific weapon names fall through to these)
    'hit', 'enemyHit', 'explosion', 'enemyDestroy', 'asteroidDestroy',
]);

export class AudioManager {
    constructor() {
        this.audioReady = false;
        // 5.68.9 — default boots at 80% slider so freshly-installed
        // builds are clearly audible; the slider still lets the player
        // dial down (or push to 100%). Gain 0..1 mapping is direct.
        this.sfxMasterVol = 0.8;
        this.maxSfxVolume = 1.0;
        this.backgroundMusic = null;

        this.audioContext = null;
        this.audioBuffers = new Map();   // path → AudioBuffer
        this.lastPlayedAt = new Map();   // name → last performance.now()
        this.soundEnabled = {};          // name → bool (default true)
        this._loaded = false;
        // 6.1.4 — Session-locked SFX variants. `_variantSounds` is the
        // set of MANIFEST names whose entries were expanded from
        // generator-produced variants (sound_v1.wav .. sound_vN.wav).
        // `_sessionVariant` caches the random pick per name on first
        // play, so each session uses ONE chosen variant per sound for
        // its entire lifetime — giving every run a subtly different
        // sonic palette without per-call jitter.
        this._variantSounds = new Set();
        this._sessionVariant = new Map();
        // 6.18.x — In-flight lazy-load promises keyed by path. Prevents
        // double-fetching when a rapid-fire sound triggers `playSound`
        // before the first fetch has resolved. Once the buffer lands
        // it's stored in `audioBuffers` and removed from this map.
        this._loadingPromises = new Map();
    }

    async init() {
        const ctx = this._ensureAudioContext();
        if (!ctx) return;
        // 6.1.4 — Resolve variants BEFORE deciding which files to fetch.
        // Reads sfx/manifest.json (written by tools/scripts/generate-sfx.js)
        // and expands any single-canonical MANIFEST entry into its full
        // variant list. Failures (missing manifest, network error) fall
        // through gracefully — the hardcoded MANIFEST stays in effect.
        await this._expandVariantsFromManifest();
        // 6.18.x — Only fetch the EAGER_SOUNDS set at boot. Everything
        // else lazy-loads on first `playSound`/`startLoop` (cached for
        // subsequent calls). Pre-pick + load just ONE variant per
        // eager name so a sound with 8 variants only fetches 1 file at
        // boot; the rest are pulled on-demand when the player rerolls
        // via the SFX pause-tab.
        const eagerPaths = new Set();
        for (const name of EAGER_SOUNDS) {
            const item = this._pickItemForName(name);
            if (!item) continue;
            const files = (typeof item === 'string') ? [item] : item;
            for (const f of files) eagerPaths.add(SFX_BASE + f);
        }
        await Promise.all([...eagerPaths].map(p => this._loadOne(p)));
        this._loaded = true;
        // Default every named sound to enabled in `soundEnabled` so the
        // SFX pause-tab toggles can reflect them.
        for (const name of Object.keys(MANIFEST)) {
            if (!(name in this.soundEnabled)) this.soundEnabled[name] = true;
        }
    }

    // 6.18.x — Pick (and lock) the session variant for a name, returning
    // the chosen MANIFEST item (string filename or layered-bucket array).
    // Mirrors the same picker logic `playSound` uses, but extracted so
    // init() can pre-pick the variant before the first playSound call.
    _pickItemForName(name) {
        const list = MANIFEST[name];
        if (!list || list.length === 0) return null;
        if (this._sessionVariant.has(name)) {
            return this._sessionVariant.get(name);
        }
        const item = list[(Math.random() * list.length) | 0];
        if (this._variantSounds.has(name)) {
            this._sessionVariant.set(name, item);
        }
        return item;
    }

    // 6.1.4 — Reads sfx/manifest.json and rewrites MANIFEST entries
    // to include all generator-produced variant filenames. Only
    // touches entries that are EXACTLY `[<name>.wav]` (single
    // canonical reference) — multi-bucket entries, layered entries,
    // and entries pointing at unrelated filenames (e.g. MP3 loops)
    // are left alone.
    async _expandVariantsFromManifest() {
        let manifestJson = null;
        try {
            const res = await fetch(SFX_BASE + 'manifest.json');
            if (res.ok) manifestJson = await res.json();
        } catch (e) {
            // Manifest fetch failed — proceed with hardcoded MANIFEST.
            return;
        }
        if (!manifestJson || !manifestJson.sounds) return;

        for (const [name, list] of Object.entries(MANIFEST)) {
            // Only expand single-canonical entries: `[<name>.wav]`.
            if (list.length !== 1 || typeof list[0] !== 'string') continue;
            if (list[0] !== `${name}.wav`) continue;
            const entry = manifestJson.sounds[name];
            if (!entry || !entry.variants || entry.variants.length <= 1) continue;
            // Strip the `sfx/` prefix the manifest uses, since
            // MANIFEST entries are relative to SFX_BASE.
            const variantFiles = entry.variants
                .map(p => p.startsWith(SFX_BASE) ? p.slice(SFX_BASE.length) : p);
            MANIFEST[name] = variantFiles;
            this._variantSounds.add(name);
        }
    }

    async _loadOne(path) {
        // De-dupe concurrent fetches of the same path. The boot-time
        // path goes through `init()`'s direct `Promise.all`; runtime
        // `_ensureLoaded` paths go through `_loadingPromises`. This
        // method is shared by both.
        if (this.audioBuffers.has(path)) return;
        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = await res.arrayBuffer();
            const decoded = await this.audioContext.decodeAudioData(buf);
            this.audioBuffers.set(path, decoded);
        } catch (e) {
            console.warn(`[AudioManager] failed to load ${path}:`, e?.message || e);
        }
    }

    // 6.18.x — Lazy-load a single SFX path on demand. Returns a Promise
    // that resolves when the buffer is in `audioBuffers` (or rejected
    // load completed silently). Cheap if already cached. De-dupes
    // concurrent callers so rapid-fire sounds only trigger one fetch.
    _ensureLoaded(path) {
        if (this.audioBuffers.has(path)) return Promise.resolve();
        const existing = this._loadingPromises.get(path);
        if (existing) return existing;
        if (!this.audioContext) return Promise.resolve();
        const p = this._loadOne(path).finally(() => {
            this._loadingPromises.delete(path);
        });
        this._loadingPromises.set(path, p);
        return p;
    }

    _ensureAudioContext() {
        if (this.audioContext) return this.audioContext;
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try {
            this.audioContext = new Ctor();
        } catch (e) {
            console.warn('AudioContext unavailable:', e);
        }
        return this.audioContext;
    }

    setBackgroundMusic(audioElement) {
        this.backgroundMusic = audioElement;
    }

    initializeAudio() {
        if (this.audioReady) return;
        this.audioReady = true;
        // Browser autoplay policy: AudioContext starts suspended; resume()
        // must run inside a user-gesture stack (main.js startGame).
        const ctx = this._ensureAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(e => console.warn('AudioContext resume failed:', e));
        }
        if (this.backgroundMusic) {
            this.backgroundMusic.play().catch(e => console.error('Music playback failed:', e));
        }
    }

    beginLogicTick(_dtMs) {}

    /**
     * Core SFX playback. Looks up `name` in the MANIFEST, picks a random
     * file, throttles by SOUND_THROTTLE_MS, and plays via a fresh
     * BufferSource.
     *
     * @returns {boolean} true if the sound was queued (or throttled — name
     *   was valid). false if the name doesn't exist in MANIFEST. Lets
     *   callers do specific→generic fallback like
     *   `if (!am.playSound('hit_RAIL_DRIVER')) am.playSound('hit')`.
     */
    playSound(name) {
        const list = MANIFEST[name];
        if (!list || list.length === 0) return false;
        if (!this.audioContext || !this._loaded) return true;
        if (this.soundEnabled[name] === false) return true;

        // Throttle.
        const now = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
        const minInterval = SOUND_THROTTLE_MS[name] || 30;
        const last = this.lastPlayedAt.get(name) || 0;
        if (now - last < minInterval) return true;
        // NOTE: lastPlayedAt is committed AFTER a buffer actually plays
        // (below) — a cache-miss that only kicks off a lazy-load must NOT
        // consume the throttle window, or the sound stays silent until the
        // window passes even though the buffer is now ready.

        // 6.1.4 — Pick a random bucket. For variant-expanded sounds
        // (the manifest gave us N alternates of one underlying SFX),
        // lock the pick to ONE variant per session so each run has a
        // consistent palette. For everything else (explicit multi-file
        // buckets like arcStrike1/2/3/4 are SEPARATE MANIFEST keys —
        // see the bucket grouping at module top), keep per-call random
        // so the existing per-impact variety stays alive.
        let item;
        if (this._variantSounds.has(name) && this._sessionVariant.has(name)) {
            item = this._sessionVariant.get(name);
        } else {
            item = list[(Math.random() * list.length) | 0];
            if (this._variantSounds.has(name)) {
                this._sessionVariant.set(name, item);
            }
        }
        // String entry → single file. Array entry → layered (play all
        // files in the bucket simultaneously). Layered buckets use a
        // small per-file gain reduction so 3 layers don't peak.
        const files = (typeof item === 'string') ? [item] : item;
        if (!files || files.length === 0) return true;

        // Resume context lazily — first call may have happened pre-gesture.
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }

        // Slight gain bias when layering: 1 file at 1.0, 2 at 0.78,
        // 3 at 0.62. Keeps peaks in check while letting layered
        // explosions read as richer than single-file ones.
        const layerScale = files.length === 1 ? 1.0 : (1 / Math.sqrt(files.length));
        const gainAmount = this.sfxMasterVol * layerScale;

        // 5.79.9 — Schedule sounds at `currentTime` instead of `0`. On
        //   browsers (especially Safari) where the context resumed
        //   recently, currentTime is monotonic-positive and `0` is in
        //   the past, which can introduce a small dispatch lag. Using
        //   currentTime guarantees immediate playback the moment the
        //   context is processing samples.
        const startAt = this.audioContext.currentTime;
        let played = false;
        for (const f of files) {
            const path = SFX_BASE + f;
            const buf = this.audioBuffers.get(path);
            if (!buf) {
                // 6.18.x — Lazy-load on cache miss. This particular call
                // doesn't play (no buffer to schedule); the next call
                // for the same sound after the fetch resolves will. Web
                // Audio doesn't queue playback against a pending buffer
                // and trying to delay-then-play here would create
                // audible latency anyway — better to skip + cache for
                // the next trigger.
                this._ensureLoaded(path);
                continue;
            }
            try {
                const src = this.audioContext.createBufferSource();
                src.buffer = buf;
                const gain = this.audioContext.createGain();
                gain.gain.value = gainAmount;
                src.connect(gain).connect(this.audioContext.destination);
                src.start(startAt);
                played = true;
            } catch (e) {
                // Browser may throw on rapid play during context state shifts;
                // soft-fail so a bad call never crashes gameplay.
            }
        }
        // Only consume the throttle window if a buffer actually played.
        if (played) this.lastPlayedAt.set(name, now);
        return true;
    }

    // Convenience aliases — every event the codebase fires routes through one.
    playShoot()           { this.playSound('shoot'); }
    playHit()             { this.playSound('hit'); }
    playCoin()            { this.playSound('coin'); }
    playPowerup()         { this.playSound('powerup'); }
    playExplosion()       { this.playSound('explosion'); }
    playPlayerExplosion() { this.playSound('playerExplosion'); }
    playTractorBeam()     { this.playSound('tractorBeam'); }
    playShield()          { this.playSound('shield'); }
    playHealthRegen()     { this.playSound('healthRegen'); }
    playPickupSound(name) { this.playSound(name || 'powerup'); }

    setSfxVolume(normalized) { this.sfxMasterVol = normalized * this.maxSfxVolume; }
    getSfxVolume()           { return this.sfxMasterVol / this.maxSfxVolume; }

    // 5.79.4 — Looping SFX (e.g. arc-lightning continuous static).
    //   `startLoop(name, gain, opts)` plays the bound WAV on a buffer
    //   source set to `loop = true` and stores the source so
    //   `stopLoop(name)` can stop it later. Idempotent — calling
    //   startLoop while already playing is a no-op.
    //
    // 5.79.12 — `opts` supports loop-region splicing:
    //     loopStart: seconds into the buffer where the loop region
    //                BEGINS. The source plays the full track once
    //                (including the attack envelope), then on the
    //                first wrap loops to `loopStart` instead of 0.
    //                Skips the leading transient on every repeat.
    //     loopEnd:   optional seconds into the buffer where the loop
    //                region ENDS. Defaults to the end of the buffer.
    //   Use loopStart for tracks with a percussive/attack opening
    //   that would create a "click-click-click" loop seam if rewound.
    startLoop(name, gainScale = 1, opts = {}) {
        if (!this.audioContext || !this._loaded) return false;
        if (this.soundEnabled[name] === false) return false;
        if (!this._loops) this._loops = new Map();
        if (this._loops.has(name)) return true; // already playing
        const list = MANIFEST[name];
        if (!list || list.length === 0) return false;
        const item = list[0];
        const files = (typeof item === 'string') ? [item] : item;
        if (!files || files.length === 0) return false;
        const path = SFX_BASE + files[0];
        const buf = this.audioBuffers.get(path);
        if (!buf) {
            // 6.18.x — Lazy-load on cache miss. Loops are typically
            // started on a player gesture (weapon-trigger) so the
            // ~100 ms first-time fetch is acceptable; caller is
            // expected to re-invoke `startLoop` once the asset lands
            // (which weapon code already does — the loop is restarted
            // every fire-down event until stopped on fire-up).
            this._ensureLoaded(path);
            return false;
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
        try {
            const src = this.audioContext.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            // Splice the loop region. loopStart > 0 makes the source
            // skip the leading attack on every wrap; loopEnd defaults
            // to the buffer's full duration so the entire tail-end
            // remains audible before the wrap point.
            if (typeof opts.loopStart === 'number' && opts.loopStart > 0) {
                src.loopStart = Math.min(opts.loopStart, buf.duration - 0.05);
            }
            if (typeof opts.loopEnd === 'number' && opts.loopEnd > 0) {
                src.loopEnd = Math.min(opts.loopEnd, buf.duration);
            }
            const gain = this.audioContext.createGain();
            gain.gain.value = this.sfxMasterVol * gainScale;
            src.connect(gain).connect(this.audioContext.destination);
            // 5.79.9 — schedule at currentTime, not 0 (avoids past-time
            //   dispatch lag on Safari).
            src.start(this.audioContext.currentTime);
            this._loops.set(name, { src, gain });
            return true;
        } catch (e) {
            return false;
        }
    }

    stopLoop(name) {
        if (!this._loops) return false;
        const entry = this._loops.get(name);
        if (!entry) return false;
        try { entry.src.stop(0); } catch {}
        try { entry.src.disconnect(); entry.gain.disconnect(); } catch {}
        this._loops.delete(name);
        return true;
    }

    isLoopPlaying(name) {
        return !!(this._loops && this._loops.has(name));
    }

    setSoundEnabled(name, enabled) {
        this.soundEnabled[name] = !!enabled;
    }
    isSoundEnabled(name) { return this.soundEnabled[name] ?? true; }
    getSoundNames()      { return Object.keys(MANIFEST); }

    // ── 6.1.5 — Session-variant inspection / control API ──────────────
    // Used by the SFX pause-tab so the player can cycle through the
    // 8 generator-produced variants per sound and lock in their
    // favorite for the rest of the session.

    /** Returns the variant file list for a sound, or null if the sound
     *  doesn't have generator-produced variants (loops, MP3s, etc.). */
    getVariants(name) {
        if (!this._variantSounds.has(name)) return null;
        return MANIFEST[name].slice();
    }

    /** Returns the currently-active variant filename for a sound. If
     *  no variant has been picked yet this session, returns the first
     *  variant in the list (deterministic default). */
    getCurrentVariant(name) {
        if (!this._variantSounds.has(name)) return null;
        if (this._sessionVariant.has(name)) return this._sessionVariant.get(name);
        const list = MANIFEST[name];
        return list && list.length ? list[0] : null;
    }

    /** Returns the current variant's 1-based index (1..N) within the
     *  variant list, or 0 if the sound has no variants. */
    getCurrentVariantIndex(name) {
        const list = this.getVariants(name);
        if (!list) return 0;
        const current = this.getCurrentVariant(name);
        const idx = list.indexOf(current);
        return idx < 0 ? 1 : idx + 1;
    }

    /** Pin the session variant to a specific 1-based index (1..N).
     *  6.18.x — proactively kicks off a lazy fetch of the chosen
     *  variant file so the player's next `playSound(name)` (or the
     *  pause-tab preview button) plays immediately. */
    setVariantIndex(name, idx) {
        const list = this.getVariants(name);
        if (!list) return false;
        const i = Math.max(1, Math.min(list.length, idx | 0));
        const chosen = list[i - 1];
        this._sessionVariant.set(name, chosen);
        if (typeof chosen === 'string') {
            this._ensureLoaded(SFX_BASE + chosen);
        }
        return true;
    }

    /** Cycle forward (delta=+1) or back (delta=-1) through the variant
     *  list, wrapping at the ends. Returns the new 1-based index.
     *  6.18.x — also kicks off a lazy fetch of the chosen variant
     *  file so the next playSound for this name fires without latency. */
    cycleVariant(name, delta = 1) {
        const list = this.getVariants(name);
        if (!list) return 0;
        const cur = this.getCurrentVariantIndex(name); // 1..N
        const next = ((cur - 1 + delta) % list.length + list.length) % list.length;
        const chosen = list[next];
        this._sessionVariant.set(name, chosen);
        if (typeof chosen === 'string') {
            this._ensureLoaded(SFX_BASE + chosen);
        }
        return next + 1;
    }
}

export const audioManager = new AudioManager();

// Expose the manifest so the SFX pause-tab can build per-sound toggles.
export { MANIFEST as SFX_MANIFEST };
