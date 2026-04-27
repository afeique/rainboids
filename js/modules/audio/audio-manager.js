// Audio management for SFX and background music.
//
// SFX pipeline:
//   1. Offline: tools/scripts/generate-sfx.js renders one .wav per sound
//      under /sfx/<name>.wav, plus /sfx/manifest.json mapping name → URL.
//   2. init() fetches the manifest and decodes every WAV into an
//      AudioBuffer (one per sound — no variants).
//   3. playSound(name) creates a fresh AudioBufferSourceNode + GainNode
//      and starts it immediately. Polyphony is unbounded.
//
// Background music stays on HTMLAudioElement (single long track).

const MANIFEST_URL = 'sfx/manifest.json';

export class AudioManager {
    constructor() {
        this.audioReady = false;
        this.sfxMasterVol = 0.1;
        this.maxSfxVolume = 0.2;
        this.backgroundMusic = null;

        this.audioContext = null;
        this.audioBuffers = new Map();   // name → AudioBuffer
        this.soundEnabled = {};          // name → bool, populated when manifest loads
    }

    async init() {
        this._ensureAudioContext();

        let manifest;
        try {
            const res = await fetch(MANIFEST_URL);
            manifest = await res.json();
        } catch (e) {
            console.warn('Failed to load SFX manifest — sounds will be silent:', e);
            return;
        }

        const ctx = this.audioContext;
        if (!ctx) return;

        for (const [name, url] of Object.entries(manifest.sounds || {})) {
            this.soundEnabled[name] = true;
            try {
                const res = await fetch(url);
                const bytes = await res.arrayBuffer();
                const buf = await ctx.decodeAudioData(bytes);
                this.audioBuffers.set(name, buf);
            } catch (e) {
                console.warn(`Failed to load SFX ${url}:`, e);
            }
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

    // No-op kept for engine compatibility — see game-engine.js update loop.
    beginLogicTick(_dtMs) {}

    playSound(soundName) {
        if (!this.audioReady || !this.soundEnabled[soundName]) return;
        const ctx = this.audioContext;
        if (!ctx) return;
        const buffer = this.audioBuffers.get(soundName);
        if (!buffer) return;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = this.sfxMasterVol;
        src.connect(gain).connect(ctx.destination);
        src.start(0);
    }

    // Convenience aliases used throughout the codebase.
    playShoot()           { this.playSound('shoot'); }
    playHit()             { this.playSound('hit'); }
    playCoin()            { this.playSound('coin'); }
    playPowerup()         { this.playSound('powerup'); }
    playExplosion()       { this.playSound('explosion'); }
    playPlayerExplosion() { this.playSound('playerExplosion'); }
    playTractorBeam()     { this.playSound('tractorBeam'); }
    playShield()          { this.playSound('shield'); }
    playHealthRegen()     { this.playSound('healthRegen'); }
    playPickupSound(name) { this.playSound(name); }

    setSfxVolume(normalized) { this.sfxMasterVol = normalized * this.maxSfxVolume; }
    getSfxVolume()           { return this.sfxMasterVol / this.maxSfxVolume; }

    setSoundEnabled(name, enabled) {
        if (name in this.soundEnabled) this.soundEnabled[name] = !!enabled;
    }
    isSoundEnabled(name) { return this.soundEnabled[name] ?? true; }
    getSoundNames()      { return Object.keys(this.soundEnabled); }
}

export const audioManager = new AudioManager();
