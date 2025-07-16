// Audio management for sound effects and music

export class AudioManager {
    constructor() {
        this.audioReady = false;
        this.sfxMasterVol = 0.1; // Start at 10% volume
        this.maxSfxVolume = 0.2; // Maximum 20% volume
        this.sounds = {};
        this.audioCache = {};
        this.backgroundMusic = null;
        // Track which sounds are enabled
        this.soundEnabled = {
            shoot: true,
            hit: true,
            coin: true,
            explosion: true,
            playerExplosion: true,
            thruster: true,
            tractorBeam: true,
            shield: true // Added shield sound
        };
    }
    
    init() {
        // Initialize sound effects using sfxr CDN API
        this.sounds = {
            shoot: sfxr.generate("laserShoot"),
            hit: sfxr.generate("hitHurt"),
            coin: sfxr.generate("pickupCoin"),
            explosion: sfxr.generate("explosion"),
            playerExplosion: sfxr.generate("explosion"),
            thruster: sfxr.generate("explosion"),
            tractorBeam: {
                wave_type: 0,
                p_base_freq: 0.15,
                p_env_attack: 0,
                p_env_sustain: 0.3,
                p_env_decay: 0.1,
                sound_vol: 0.18,
                sample_rate: 44100,
                sample_size: 8
            },
            shield: {
                wave_type: 3, // Noise
                p_base_freq: 0.3,
                p_env_attack: 0.01,
                p_env_sustain: 0.1,
                p_env_decay: 0.2,
                p_freq_ramp: -0.2,
                p_hpf_freq: 0.2,
                sound_vol: 0.3,
                sample_rate: 44100,
                sample_size: 8
            }
        };
        
        // Customize specific sounds further
        this.sounds.playerExplosion.p_env_sustain = 0.4;
        this.sounds.playerExplosion.p_base_freq = 0.2;
        
        // Pre-generate audio elements for all sounds
        this.audioCache = {};
        for (const [name, params] of Object.entries(this.sounds)) {
            this.audioCache[name] = params;
        }
    }
    
    setBackgroundMusic(audioElement) {
        this.backgroundMusic = audioElement;
    }
    
    initializeAudio() {
        if (this.audioReady) return;
        this.audioReady = true;
        if (this.backgroundMusic) {
            this.backgroundMusic.play().catch(e => console.error("Music playback failed:", e));
        }
    }

    playSound(soundName) {
        if (!this.audioReady || !this.audioCache[soundName] || !this.soundEnabled[soundName]) return;
        
        try {
            const params = this.audioCache[soundName];
            
            let snd;
            if (typeof params === 'object' && params.wave_type !== undefined) {
                // This is a parameter object, use sfxr.toAudio
                const soundParams = Object.assign({}, params);
                // Apply the master volume to the sound_vol parameter
                soundParams.sound_vol = (params.sound_vol || 0.5) * this.sfxMasterVol;
                snd = sfxr.toAudio(soundParams);
            } else {
                // This is a generated sound object, use it directly
                snd = sfxr.toAudio(params);
            }
            
            if (snd && snd.play) {
                try {
                    const playResult = snd.play();
                    // Check if play() returns a Promise (has .catch method)
                    if (playResult && typeof playResult.catch === 'function') {
                        playResult.catch(e => {
                            console.warn(`Failed to play sound ${soundName}:`, e);
                        });
                    }
                } catch (e) {
                    console.warn(`Failed to play sound ${soundName}:`, e);
                }
            }
        } catch (error) {
            console.warn(`Failed to create sound ${soundName}:`, error);
        }
    }
    
    playShoot() { this.playSound('shoot'); }
    playHit() { this.playSound('hit'); }
    playCoin() { this.playSound('coin'); }
    playExplosion() { this.playSound('explosion'); }
    playPlayerExplosion() { this.playSound('playerExplosion'); }
    playThruster() { this.playSound('thruster'); }
    playTractorBeam() { this.playSound('tractorBeam'); }
    playShield() { this.playSound('shield'); }

    setSfxVolume(normalizedVolume) {
        // normalizedVolume is 0-1 from the slider, map it to 0-maxSfxVolume
        this.sfxMasterVol = normalizedVolume * this.maxSfxVolume;
    }

    getSfxVolume() {
        // Return the normalized value (0-1) for the slider
        return this.sfxMasterVol / this.maxSfxVolume;
    }
    
    setSoundEnabled(soundName, enabled) {
        if (this.soundEnabled.hasOwnProperty(soundName)) {
            this.soundEnabled[soundName] = enabled;
        }
    }
    
    isSoundEnabled(soundName) {
        return this.soundEnabled[soundName] ?? true;
    }
    
    getSoundNames() {
        return Object.keys(this.soundEnabled);
    }
} 

export const audioManager = new AudioManager(); 