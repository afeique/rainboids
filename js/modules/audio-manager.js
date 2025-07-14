// Audio management for sound effects and music
export class AudioManager {
    constructor() {
        this.audioReady = false;
        this.sfxMasterVol = 0.4;
        this.sounds = {};
        this.audioCache = {};
        this.backgroundMusic = null;
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
        
        // Customize specific sounds
        this.sounds.playerExplosion.attackTime = 0.2;
        this.sounds.playerExplosion.sustainTime = 0.3;
        this.sounds.playerExplosion.startFrequency = 400;
        this.sounds.playerExplosion.minFrequency = 100;
        
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
        if (!this.audioReady || !this.audioCache[soundName]) return;
        
        const params = this.audioCache[soundName];
        const vol = params.sound_vol * this.sfxMasterVol;
        const snd = sfxr.toAudio(params);
        snd.volume = vol;
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
} 