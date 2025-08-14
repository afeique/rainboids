// Audio management for sound effects and music

export class AudioManager {
    constructor() {
        this.audioReady = false;
        this.sfxMasterVol = 0.1; // Start at 10% volume
        this.maxSfxVolume = 0.2; // Maximum 20% volume
        this.sounds = {};
        this.audioCache = {};
        this.backgroundMusic = null;
        
        // Audio pool system for simultaneous playback
        this.audioPool = new Map(); // Map of soundName -> Array of audio elements
        this.poolSize = 2; // Reduced from 3 to 2 for better performance
        
        // Audio throttling to prevent overload
        this.soundThrottles = new Map(); // Track last play time for each sound
        this.minSoundInterval = 50; // Minimum 50ms between same sound effects
        
        // Track which sounds are enabled
        this.soundEnabled = {
            shoot: true,
            hit: true,
            coin: true,
            powerup: true,
            explosion: true,
            playerExplosion: true,
            tractorBeam: true,
            shield: true,
            healthRegen: true // Added health regeneration sound
        };
    }
    
    init() {
        // Initialize sound effects using sfxr CDN API
        this.sounds = {
            shoot: sfxr.generate("laserShoot"),
            hit: sfxr.generate("hitHurt"),
            coin: sfxr.generate("pickupCoin"),
            powerup: {
                wave_type: 0, // Square wave for bright, magical sound
                p_base_freq: 0.6, // Higher pitch for bright magical feel
                p_freq_ramp: 0.3, // Rising pitch sweep
                p_freq_dramp: -0.1, // Slight dip
                p_env_attack: 0.0, // Instant attack
                p_env_sustain: 0.15, // Short sustain
                p_env_decay: 0.4, // Medium decay for sparkle effect
                p_vib_strength: 0.3, // Vibrato for magical shimmer
                p_vib_speed: 0.5, // Fast vibrato
                p_arp_mod: 0.4, // Arpeggio for chord effect
                p_arp_speed: 0.7, // Fast arpeggio
                sound_vol: 0.25, // Moderate volume
                sample_rate: 44100,
                sample_size: 8
            },
            explosion: sfxr.generate("explosion"),
            playerExplosion: sfxr.generate("explosion"),
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
            },
            healthRegen: {
                wave_type: 1, // Sawtooth for warm tone
                p_base_freq: 0.8, // Higher frequency for bright, healing sound
                p_env_attack: 0.3, // Gentle fade in
                p_env_sustain: 0.4, // Medium sustain
                p_env_decay: 0.6, // Long, gentle fade out
                p_freq_ramp: 0.1, // Slight upward frequency sweep
                p_vib_speed: 6, // Gentle vibrato
                p_vib_strength: 0.1, // Light vibrato
                p_lpf_freq: 0.7, // Low pass filter for warmth
                p_lpf_ramp: 0.2, // Gentle filter sweep
                sound_vol: 0.15, // Quiet and soothing
                sample_rate: 44100,
                sample_size: 8
            },

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
        
        // Throttle sounds to prevent audio overload
        const now = Date.now();
        const lastPlayTime = this.soundThrottles.get(soundName) || 0;
        if (now - lastPlayTime < this.minSoundInterval) {
            return; // Skip this sound to prevent spam
        }
        this.soundThrottles.set(soundName, now);
        
        try {
            // Get or create audio pool for this sound
            if (!this.audioPool.has(soundName)) {
                this.audioPool.set(soundName, []);
            }
            
            const pool = this.audioPool.get(soundName);
            let snd = null;
            
            // Find an available audio element in the pool
            for (let audio of pool) {
                if (audio.paused || audio.ended || audio.currentTime === 0) {
                    snd = audio;
                    break;
                }
            }
            
            // If no available audio element, create a new one (if pool not full)
            if (!snd && pool.length < this.poolSize) {
                const params = this.audioCache[soundName];
                
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
                
                if (snd) {
                    pool.push(snd);
                }
            }
            
            // If still no sound available, use the oldest one in the pool
            if (!snd && pool.length > 0) {
                snd = pool[0];
                snd.currentTime = 0; // Reset to beginning
            }
            
            // Play the sound
            if (snd && snd.play) {
                try {
                    const playResult = snd.play();
                    // Check if play() returns a Promise (has .catch method)
                    if (playResult && typeof playResult.catch === 'function') {
                        playResult.catch(e => {
                            // Ignore autoplay policy errors - they're expected
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
    playPowerup() { this.playSound('powerup'); }
    playExplosion() { this.playSound('explosion'); }
    playPlayerExplosion() { this.playSound('playerExplosion'); }
    playTractorBeam() { this.playSound('tractorBeam'); }
    playShield() { this.playSound('shield'); }
    playHealthRegen() { this.playSound('healthRegen'); }
    
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
    
    rerollSound(soundName) {
        if (!this.sounds.hasOwnProperty(soundName)) {
            console.warn(`Unknown sound: ${soundName}`);
            return;
        }
        
        // Generate new sound effect based on the sound type
        let newSound;
        switch (soundName) {
            case 'shoot':
                newSound = sfxr.generate("laserShoot");
                break;
            case 'hit':
                newSound = sfxr.generate("hitHurt");
                break;
            case 'coin':
                newSound = sfxr.generate("pickupCoin");
                break;
            case 'explosion':
            case 'playerExplosion':
                newSound = sfxr.generate("explosion");
                break;
            case 'tractorBeam':
                // Generate a custom tractor beam sound with some randomization
                newSound = {
                    wave_type: 0,
                    p_base_freq: 0.1 + Math.random() * 0.1, // 0.1-0.2
                    p_env_attack: 0,
                    p_env_sustain: 0.2 + Math.random() * 0.2, // 0.2-0.4
                    p_env_decay: 0.05 + Math.random() * 0.1, // 0.05-0.15
                    sound_vol: 0.15 + Math.random() * 0.1, // 0.15-0.25
                    sample_rate: 44100,
                    sample_size: 8
                };
                break;
            case 'shield':
                // Generate a custom shield sound with some randomization
                newSound = {
                    wave_type: 3, // Noise
                    p_base_freq: 0.2 + Math.random() * 0.2, // 0.2-0.4
                    p_env_attack: 0.01,
                    p_env_sustain: 0.05 + Math.random() * 0.1, // 0.05-0.15
                    p_env_decay: 0.1 + Math.random() * 0.2, // 0.1-0.3
                    p_freq_ramp: -0.3 + Math.random() * 0.2, // -0.3 to -0.1
                    p_hpf_freq: 0.1 + Math.random() * 0.2, // 0.1-0.3
                    sound_vol: 0.2 + Math.random() * 0.2, // 0.2-0.4
                    sample_rate: 44100,
                    sample_size: 8
                };
                break;
            case 'healthRegen':
                // Generate a custom healing sound with some randomization
                newSound = {
                    wave_type: 1, // Sawtooth for warm tone
                    p_base_freq: 0.7 + Math.random() * 0.3, // 0.7-1.0 for bright healing sound
                    p_env_attack: 0.2 + Math.random() * 0.2, // 0.2-0.4 gentle fade in
                    p_env_sustain: 0.3 + Math.random() * 0.2, // 0.3-0.5 medium sustain
                    p_env_decay: 0.4 + Math.random() * 0.4, // 0.4-0.8 gentle fade out
                    p_freq_ramp: Math.random() * 0.2, // 0-0.2 slight upward sweep
                    p_vib_speed: 4 + Math.random() * 4, // 4-8 gentle vibrato
                    p_vib_strength: 0.05 + Math.random() * 0.1, // 0.05-0.15 light vibrato
                    p_lpf_freq: 0.6 + Math.random() * 0.2, // 0.6-0.8 low pass for warmth
                    p_lpf_ramp: 0.1 + Math.random() * 0.2, // 0.1-0.3 gentle filter sweep
                    sound_vol: 0.1 + Math.random() * 0.1, // 0.1-0.2 quiet and soothing
                    sample_rate: 44100,
                    sample_size: 8
                };
                break;
            default:
                console.warn(`No reroll logic for sound: ${soundName}`);
                return;
        }
        
        // Update the sound
        this.sounds[soundName] = newSound;
        
        // Apply specific customizations based on sound type
        if (soundName === 'playerExplosion') {
            this.sounds.playerExplosion.p_env_sustain = 0.3 + Math.random() * 0.2; // 0.3-0.5
            this.sounds.playerExplosion.p_base_freq = 0.15 + Math.random() * 0.1; // 0.15-0.25
        }
        
        if (soundName === 'powerup') {
            // Randomize powerup sound for magical variety each pickup
            this.sounds.powerup.p_base_freq = 0.55 + Math.random() * 0.15; // 0.55-0.7 for pitch variety
            this.sounds.powerup.p_freq_ramp = 0.25 + Math.random() * 0.15; // 0.25-0.4 for sweep variety
            this.sounds.powerup.p_vib_strength = 0.2 + Math.random() * 0.2; // 0.2-0.4 for shimmer variety
        }
        
        // Update audio cache
        this.audioCache[soundName] = newSound;
        
        console.log(`Rerolled sound: ${soundName}`);
    }
    
    rerollAllSounds() {
        const soundNames = Object.keys(this.sounds);
        console.log('Rerolling all sound effects...');
        
        soundNames.forEach(soundName => {
            this.rerollSound(soundName);
        });
        
        console.log('All sound effects rerolled!');
    }
} 

export const audioManager = new AudioManager(); 