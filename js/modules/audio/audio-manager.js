// Audio management — currently SILENT for all sound effects.
//
// SFX history: the original implementation used jsfxr-generated WAV
// files baked offline (tools/scripts/generate-sfx.js). Those caused
// audio glitches and have been removed. The audio layer (this class)
// is preserved so callers like `audioManager.playShoot()` still work
// — they just no-op until external WAV assets are wired up.
//
// Background music continues to play through HTMLAudioElement (see
// MusicPlayer / startBackgroundMusic in main.js). That path is
// independent of the SFX system below.

export class AudioManager {
    constructor() {
        this.audioReady = false;
        this.sfxMasterVol = 0.1;
        this.maxSfxVolume = 0.2;
        this.backgroundMusic = null;

        // Kept for compatibility with the old WebAudio path. Both empty.
        this.audioContext = null;
        this.audioBuffers = new Map();
        this.soundEnabled = {};
    }

    // No SFX assets to load right now — kept async so existing
    // `await audioManager.init()` callers don't break.
    async init() {
        // Pre-create an AudioContext so background music + future WAVs
        // both share it once we re-introduce SFX.
        this._ensureAudioContext();
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

    // No-op kept for engine compatibility.
    beginLogicTick(_dtMs) {}

    // SFX entry point — currently silent. When external WAV assets are
    // added, decode them at init() time into `audioBuffers` and play
    // here via createBufferSource(). Until then, do nothing.
    playSound(_soundName) { /* SFX silent — see header */ }

    // Convenience aliases used throughout the codebase. All silent.
    playShoot()           {}
    playHit()             {}
    playCoin()            {}
    playPowerup()         {}
    playExplosion()       {}
    playPlayerExplosion() {}
    playTractorBeam()     {}
    playShield()          {}
    playHealthRegen()     {}
    playPickupSound(_name) {}

    setSfxVolume(normalized) { this.sfxMasterVol = normalized * this.maxSfxVolume; }
    getSfxVolume()           { return this.sfxMasterVol / this.maxSfxVolume; }

    setSoundEnabled(name, enabled) {
        if (name in this.soundEnabled) this.soundEnabled[name] = !!enabled;
    }
    isSoundEnabled(name) { return this.soundEnabled[name] ?? true; }
    getSoundNames()      { return Object.keys(this.soundEnabled); }
}

export const audioManager = new AudioManager();
