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
    coin:              50,
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
    }

    async init() {
        const ctx = this._ensureAudioContext();
        if (!ctx) return;
        // Fire-and-forget per-file decode. Each failure is logged
        // individually but never blocks the rest of the load.
        const paths = uniquePaths();
        await Promise.all(paths.map(p => this._loadOne(p)));
        this._loaded = true;
        // Default every named sound to enabled in `soundEnabled` so the
        // SFX pause-tab toggles can reflect them.
        for (const name of Object.keys(MANIFEST)) {
            if (!(name in this.soundEnabled)) this.soundEnabled[name] = true;
        }
    }

    async _loadOne(path) {
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
        this.lastPlayedAt.set(name, now);

        // Pick a random bucket.
        const item = list[(Math.random() * list.length) | 0];
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

        for (const f of files) {
            const path = SFX_BASE + f;
            const buf = this.audioBuffers.get(path);
            if (!buf) continue;
            try {
                const src = this.audioContext.createBufferSource();
                src.buffer = buf;
                const gain = this.audioContext.createGain();
                gain.gain.value = gainAmount;
                src.connect(gain).connect(this.audioContext.destination);
                src.start(0);
            } catch (e) {
                // Browser may throw on rapid play during context state shifts;
                // soft-fail so a bad call never crashes gameplay.
            }
        }
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

    setSoundEnabled(name, enabled) {
        this.soundEnabled[name] = !!enabled;
    }
    isSoundEnabled(name) { return this.soundEnabled[name] ?? true; }
    getSoundNames()      { return Object.keys(MANIFEST); }
}

export const audioManager = new AudioManager();

// Expose the manifest so the SFX pause-tab can build per-sound toggles.
export { MANIFEST as SFX_MANIFEST };
