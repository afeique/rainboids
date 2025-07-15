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
            tractorBeam: true
        };
        this.initSounds();
    }
    
    initSounds() {
        // Initialize sound effects using sfxr
        this.sounds = {
            shoot: sfxr.generate("laserShoot"),
            hit: sfxr.generate("hitHurt"),
            coin: sfxr.generate("pickupCoin"),
            explosion: sfxr.generate("explosion"),
            playerExplosion: sfxr.generate("explosion"),
            thruster: sfxr.generate("explosion"),
            tractorBeam: sfxr.generate("tone", {
                wave_type: 2, // Sine
                p_env_attack: 0.05,
                p_env_sustain: 0.5,
                p_env_decay: 0.3,
                p_base_freq: 0.15, // Low frequency
                sound_vol: 0.18
            })
        };
        
        // Set default volumes for all sounds
        this.sounds.shoot.sound_vol = 0.3;
        this.sounds.hit.sound_vol = 0.4;
        this.sounds.coin.sound_vol = 0.3;
        this.sounds.explosion.sound_vol = 0.5;
        
        // Customize specific sounds
        this.sounds.playerExplosion.attackTime = 0.2;
        this.sounds.playerExplosion.sustainTime = 0.3;
        this.sounds.playerExplosion.startFrequency = 400;
        this.sounds.playerExplosion.minFrequency = 100;
        this.sounds.playerExplosion.sound_vol = 0.6;
        
        this.sounds.thruster.wave_type = NOISE;
        this.sounds.thruster.p_env_attack = 0.1;
        this.sounds.thruster.p_env_sustain = 0.3;
        this.sounds.thruster.p_env_decay = 0.2;
        this.sounds.thruster.p_base_freq = 0.8;
        this.sounds.thruster.p_freq_ramp = -0.05;
        this.sounds.thruster.p_hpf_freq = 0.4;
        this.sounds.thruster.p_lpf_freq = 0.9;
        this.sounds.thruster.sound_vol = 0.25;
        
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
        
        const params = this.audioCache[soundName];
        // Clone the params to avoid modifying the cached version
        const soundParams = Object.assign({}, params);
        // Apply the master volume to the sound_vol parameter
        soundParams.sound_vol = (params.sound_vol || 0.5) * this.sfxMasterVol;
        
        const snd = sfxr.toAudio(soundParams);
        snd.play();
    }
    
    playShoot() {
        this.playSound('shoot');
    }
    
    playHit() {
        this.playSound('hit');
    }
    
    playCoin() {
        this.playSound('coin');
    }
    
    playExplosion() {
        this.playSound('explosion');
    }
    
    playPlayerExplosion() {
        this.playSound('playerExplosion');
    }
    
    playThruster() {
        this.playSound('thruster');
    }

    playTractorBeam() {
        this.playSound('tractorBeam');
    }
    
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