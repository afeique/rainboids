// Single source of truth for SFX definitions.
//
// Both the offline generator (tools/scripts/generate-sfx.js) and the
// runtime AudioManager import this module. The generator turns each
// entry into one .wav file in /sfx/<name>.wav; the runtime fetches
// that file once per sound name.
//
// Three def shapes:
//   { preset: 'laserShoot', overrides?: {...} }
//     → call sfxr.generate(preset), optionally override fields
//   { params: {...} }
//     → render a single sfxr voice from explicit params
//   { layers: [{ params: {...}, gain?: number }, ...] }
//     → render each layer separately, sum-mix into one polyphonic-feeling
//       WAV (sfxr is monophonic per voice; layering lets a single SFX
//       carry a low body, a mid impact, and a high sparkle as one sound)
//
// Design language: futuristic / synthetic / techy. Each sound is built
// from 2-3 sfxr voices stacked to create chord-like depth. Common
// vocabulary:
//   - low body  : sine or low square, sub-bass thump
//   - mid impact: square (often duty-modulated) carrying the main note
//   - high tail : HPF'd square or sine arpeggio for sparkle/brightness
//   - sweeps    : p_freq_ramp for descending energy bursts or rising chimes
//   - arp_mod   : creates dyad/triad intervals from a single voice
//   - vibrato   : adds movement to sustained tones (beams, hums, rings)

export const SOUND_DEFS = {

    // ── Player primary fire — futuristic energy pulse ────────────────
    // Square pew with downward sweep + sub-bass thump + bright HPF
    // transient. Reads as "energy weapon" rather than the bare laserShoot
    // preset, with weight from the sub layer.
    shoot: {
        layers: [
            // Main pew — square with downward freq sweep, slight punch
            { params: {
                wave_type: 0, p_base_freq: 0.55, p_freq_ramp: -0.45,
                p_env_attack: 0, p_env_sustain: 0.08, p_env_decay: 0.18,
                p_env_punch: 0.35, p_duty: 0.4, p_duty_ramp: -0.1,
                sound_vol: 0.4, sample_rate: 44100, sample_size: 8,
            }, gain: 0.55 },
            // Sub-bass thump — sine, very low
            { params: {
                wave_type: 1, p_base_freq: 0.18, p_freq_ramp: -0.2,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.12,
                p_env_punch: 0.4,
                sound_vol: 0.35, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            // High brightness — HPF'd square, very short
            { params: {
                wave_type: 0, p_base_freq: 0.85, p_freq_ramp: -0.5,
                p_env_attack: 0, p_env_sustain: 0.01, p_env_decay: 0.05,
                p_hpf_freq: 0.3, p_env_punch: 0.5,
                sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },

    // ── Generic hit (fallback) — synthetic kinetic slap ──────────────
    hit: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.42, p_freq_ramp: -0.28,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.14,
                p_arp_mod: -0.3, p_arp_speed: 0.65, p_env_punch: 0.4,
                p_duty: 0.45,
                sound_vol: 0.36, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 3, p_base_freq: 0.5, p_freq_ramp: -0.3,
                p_env_attack: 0, p_env_sustain: 0.02, p_env_decay: 0.08,
                p_hpf_freq: 0.2,
                sound_vol: 0.25, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },

    // ── Coin / money pickup — crystalline ascending tinkle ───────────
    // Three-tone bell stack tuned to a bright major-ish interval.
    coin: {
        layers: [
            // Root tone — sine with quick rising sweep
            { params: {
                wave_type: 1, p_base_freq: 0.55, p_freq_ramp: 0.25,
                p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.32,
                p_arp_mod: 0.5, p_arp_speed: 0.75,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.55 },
            // Mid harmonic — square with vibrato
            { params: {
                wave_type: 0, p_base_freq: 0.75, p_freq_ramp: 0.1,
                p_env_attack: 0.02, p_env_sustain: 0.05, p_env_decay: 0.28,
                p_vib_strength: 0.35, p_vib_speed: 0.7, p_duty: 0.3,
                sound_vol: 0.24, sample_rate: 44100, sample_size: 8,
            }, gain: 0.35 },
            // Top sparkle — high arp tail, HPF'd
            { params: {
                wave_type: 0, p_base_freq: 0.9, p_freq_ramp: -0.05,
                p_env_attack: 0.05, p_env_sustain: 0.02, p_env_decay: 0.32,
                p_arp_mod: 0.7, p_arp_speed: 0.88, p_hpf_freq: 0.28,
                sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
            }, gain: 0.25 },
        ],
    },

    // ── Asteroid explosion — bass boom + noise body + crackle ────────
    explosion: {
        layers: [
            // Sub-bass boom — sine sweeping down hard
            { params: {
                wave_type: 1, p_base_freq: 0.25, p_freq_ramp: -0.4,
                p_env_attack: 0, p_env_sustain: 0.18, p_env_decay: 0.55,
                p_env_punch: 0.6,
                sound_vol: 0.5, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            // Noise body — full-spectrum debris with LPF dropping
            { params: {
                wave_type: 3, p_base_freq: 0.35, p_freq_ramp: -0.25,
                p_env_attack: 0, p_env_sustain: 0.15, p_env_decay: 0.5,
                p_lpf_freq: 0.55, p_lpf_ramp: -0.15, p_env_punch: 0.5,
                sound_vol: 0.45, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
            // High crackle — short HPF'd noise burst
            { params: {
                wave_type: 3, p_base_freq: 0.6, p_freq_ramp: -0.35,
                p_env_attack: 0, p_env_sustain: 0.03, p_env_decay: 0.18,
                p_hpf_freq: 0.4,
                sound_vol: 0.28, sample_rate: 44100, sample_size: 8,
            }, gain: 0.25 },
        ],
    },

    // ── Player ship explosion — cataclysmic version of explosion ─────
    playerExplosion: {
        layers: [
            // Massive sub-boom
            { params: {
                wave_type: 1, p_base_freq: 0.18, p_freq_ramp: -0.35,
                p_env_attack: 0, p_env_sustain: 0.32, p_env_decay: 0.85,
                p_env_punch: 0.7,
                sound_vol: 0.55, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
            // Noise debris with long tail
            { params: {
                wave_type: 3, p_base_freq: 0.3, p_freq_ramp: -0.2,
                p_env_attack: 0, p_env_sustain: 0.32, p_env_decay: 0.8,
                p_lpf_freq: 0.5, p_lpf_ramp: -0.2, p_env_punch: 0.5,
                sound_vol: 0.5, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
            // Power-down whine — sawtooth descending
            { params: {
                wave_type: 1, p_base_freq: 0.5, p_freq_ramp: -0.45,
                p_env_attack: 0.02, p_env_sustain: 0.18, p_env_decay: 0.55,
                p_vib_strength: 0.3, p_vib_speed: 0.3,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
        ],
    },

    // ── Powerup pickup — magical ascending chime (3-layer chord) ─────
    powerup: {
        layers: [
            // Bell body — sine with rising sweep + arp
            { params: {
                wave_type: 1, p_base_freq: 0.42, p_freq_ramp: 0.22,
                p_env_attack: 0.0, p_env_sustain: 0.32, p_env_decay: 0.6,
                p_arp_mod: 0.55, p_arp_speed: 0.62,
                sound_vol: 0.42, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            // Shimmer harmonic — square + vibrato above
            { params: {
                wave_type: 0, p_base_freq: 0.68, p_freq_ramp: 0.08,
                p_env_attack: 0.06, p_env_sustain: 0.25, p_env_decay: 0.5,
                p_vib_strength: 0.45, p_vib_speed: 0.7, p_duty: 0.3,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.35 },
            // Crystal twinkle — high arp tail with HPF
            { params: {
                wave_type: 0, p_base_freq: 0.86, p_freq_ramp: -0.05,
                p_env_attack: 0.18, p_env_sustain: 0.06, p_env_decay: 0.55,
                p_arp_mod: 0.72, p_arp_speed: 0.85, p_hpf_freq: 0.25,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
        ],
    },

    // ── Tractor beam — sustained energy hum with shimmer ─────────────
    tractorBeam: {
        layers: [
            // Low hum — square with slow vibrato
            { params: {
                wave_type: 0, p_base_freq: 0.14, p_freq_ramp: 0,
                p_env_attack: 0.03, p_env_sustain: 0.32, p_env_decay: 0.12,
                p_vib_strength: 0.25, p_vib_speed: 0.18, p_duty: 0.5,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            // Mid harmonic — sine with faster vibrato
            { params: {
                wave_type: 1, p_base_freq: 0.32, p_freq_ramp: 0.04,
                p_env_attack: 0.05, p_env_sustain: 0.28, p_env_decay: 0.15,
                p_vib_strength: 0.4, p_vib_speed: 0.45,
                sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },

    // ── Shield activation — crystalline force field bloom ────────────
    shield: {
        layers: [
            // Noise wash — wide-band activation
            { params: {
                wave_type: 3, p_base_freq: 0.32, p_freq_ramp: -0.18,
                p_env_attack: 0.01, p_env_sustain: 0.1, p_env_decay: 0.25,
                p_hpf_freq: 0.22, p_env_punch: 0.3,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            // Crystal ping — sine with rising sweep
            { params: {
                wave_type: 1, p_base_freq: 0.55, p_freq_ramp: 0.18,
                p_env_attack: 0, p_env_sustain: 0.08, p_env_decay: 0.3,
                p_arp_mod: 0.4, p_arp_speed: 0.7,
                sound_vol: 0.28, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
        ],
    },

    // ── Health regen — warm gentle swell ─────────────────────────────
    healthRegen: {
        layers: [
            // Warm body — sawtooth low-passed
            { params: {
                wave_type: 1, p_base_freq: 0.55, p_freq_ramp: 0.12,
                p_env_attack: 0.25, p_env_sustain: 0.42, p_env_decay: 0.55,
                p_vib_strength: 0.12, p_vib_speed: 0.4,
                p_lpf_freq: 0.55, p_lpf_ramp: 0.18,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            // Healing harmonic — sine higher
            { params: {
                wave_type: 1, p_base_freq: 0.78, p_freq_ramp: 0.08,
                p_env_attack: 0.32, p_env_sustain: 0.4, p_env_decay: 0.6,
                p_vib_strength: 0.15, p_vib_speed: 0.5,
                p_arp_mod: 0.3, p_arp_speed: 0.4,
                sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },

    // ── Player ship rams asteroid — heavy thud + ringing impact ──────
    playerHitAsteroid: {
        layers: [
            // Punchy noise impact
            { params: {
                wave_type: 3, p_base_freq: 0.12, p_freq_ramp: -0.32,
                p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.3,
                p_lpf_freq: 0.32, p_env_punch: 0.5,
                sound_vol: 0.5, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
            // Sub-bass rumble tail
            { params: {
                wave_type: 1, p_base_freq: 0.07, p_freq_ramp: -0.12,
                p_env_attack: 0, p_env_sustain: 0.18, p_env_decay: 0.45,
                p_env_punch: 0.4,
                sound_vol: 0.35, sample_rate: 44100, sample_size: 8,
            }, gain: 0.35 },
            // Metallic ring — square with downward arp
            { params: {
                wave_type: 0, p_base_freq: 0.42, p_freq_ramp: -0.18,
                p_env_attack: 0.01, p_env_sustain: 0.05, p_env_decay: 0.25,
                p_arp_mod: -0.4, p_arp_speed: 0.6, p_hpf_freq: 0.18,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },

    // ── Player ship rams enemy — sharp metallic clang + alarm ────────
    playerHitEnemy: {
        layers: [
            // Clang body — square arp downward
            { params: {
                wave_type: 0, p_base_freq: 0.5, p_freq_ramp: -0.22,
                p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.25,
                p_arp_mod: -0.5, p_arp_speed: 0.7, p_env_punch: 0.55,
                p_duty: 0.4,
                sound_vol: 0.4, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
            // Sub-bass impact
            { params: {
                wave_type: 1, p_base_freq: 0.16, p_freq_ramp: -0.18,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.18,
                p_env_punch: 0.45,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            // Alarm pip — bright high zap
            { params: {
                wave_type: 0, p_base_freq: 0.78, p_freq_ramp: -0.18,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.18,
                p_hpf_freq: 0.3, p_arp_mod: -0.3, p_arp_speed: 0.7,
                sound_vol: 0.26, sample_rate: 44100, sample_size: 8,
            }, gain: 0.25 },
        ],
    },

    // ── Enemy bullet HIT-PLAYER (one per shootPattern) ───────────────

    // Hunter — clean kinetic ping (3-layer)
    enemyHit_hunter_single: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.55, p_freq_ramp: -0.22,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.14,
                p_env_punch: 0.35, p_arp_mod: -0.2, p_arp_speed: 0.6,
                p_duty: 0.4,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            { params: {
                wave_type: 1, p_base_freq: 0.22, p_freq_ramp: -0.15,
                p_env_attack: 0, p_env_sustain: 0.03, p_env_decay: 0.12,
                p_env_punch: 0.4,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            { params: {
                wave_type: 0, p_base_freq: 0.78, p_freq_ramp: -0.3,
                p_env_attack: 0, p_env_sustain: 0.012, p_env_decay: 0.06,
                p_hpf_freq: 0.25,
                sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },
    // Guardian spread — warm chord-y harmonic (3-layer)
    enemyHit_guardian_spread: {
        layers: [
            { params: {
                wave_type: 1, p_base_freq: 0.36, p_freq_ramp: -0.12,
                p_env_attack: 0, p_env_sustain: 0.08, p_env_decay: 0.2,
                p_arp_mod: 0.4, p_arp_speed: 0.62,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
            { params: {
                wave_type: 0, p_base_freq: 0.55, p_freq_ramp: -0.1,
                p_env_attack: 0.02, p_env_sustain: 0.06, p_env_decay: 0.18,
                p_duty: 0.32, p_arp_mod: 0.3, p_arp_speed: 0.5,
                sound_vol: 0.24, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            { params: {
                wave_type: 1, p_base_freq: 0.72, p_freq_ramp: -0.05,
                p_env_attack: 0.05, p_env_sustain: 0.04, p_env_decay: 0.18,
                p_vib_strength: 0.25, p_vib_speed: 0.55,
                sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
            }, gain: 0.25 },
        ],
    },
    // Wasp machinegun — rapid metallic chitter with HPF transient
    enemyHit_wasp_machinegun: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.7, p_freq_ramp: -0.35,
                p_env_attack: 0, p_env_sustain: 0.018, p_env_decay: 0.08,
                p_env_punch: 0.45, p_hpf_freq: 0.2, p_duty: 0.35,
                sound_vol: 0.26, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 3, p_base_freq: 0.6, p_freq_ramp: -0.4,
                p_env_attack: 0, p_env_sustain: 0.01, p_env_decay: 0.04,
                p_hpf_freq: 0.35,
                sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Charged laser — heavy beam impact with sustained drone
    enemyHit_charged_laser: {
        layers: [
            { params: {
                wave_type: 1, p_base_freq: 0.3, p_freq_ramp: 0.15,
                p_env_attack: 0, p_env_sustain: 0.2, p_env_decay: 0.35,
                p_vib_strength: 0.35, p_vib_speed: 0.78,
                sound_vol: 0.36, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
            { params: {
                wave_type: 0, p_base_freq: 0.45, p_freq_ramp: 0.05,
                p_env_attack: 0.01, p_env_sustain: 0.14, p_env_decay: 0.25,
                p_hpf_freq: 0.18, p_duty: 0.35,
                sound_vol: 0.26, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            { params: {
                wave_type: 1, p_base_freq: 0.65, p_freq_ramp: 0.08,
                p_env_attack: 0.02, p_env_sustain: 0.12, p_env_decay: 0.25,
                p_vib_strength: 0.28, p_vib_speed: 0.85, p_hpf_freq: 0.22,
                sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
            }, gain: 0.25 },
        ],
    },
    // Arc lightning — electric crackle (noise + zap stack)
    enemyHit_arc_lightning: {
        layers: [
            { params: {
                wave_type: 3, p_base_freq: 0.5, p_freq_ramp: 0,
                p_env_attack: 0, p_env_sustain: 0.08, p_env_decay: 0.22,
                p_hpf_freq: 0.32, p_vib_strength: 0.55, p_vib_speed: 0.92,
                sound_vol: 0.34, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            { params: {
                wave_type: 0, p_base_freq: 0.78, p_freq_ramp: -0.25,
                p_env_attack: 0, p_env_sustain: 0.02, p_env_decay: 0.1,
                p_arp_mod: 0.5, p_arp_speed: 0.85, p_hpf_freq: 0.3,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            { params: {
                wave_type: 0, p_base_freq: 0.92, p_freq_ramp: -0.4,
                p_env_attack: 0, p_env_sustain: 0.008, p_env_decay: 0.06,
                p_hpf_freq: 0.45, p_arp_mod: -0.6, p_arp_speed: 0.95,
                sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },
    // Missile — deep boom + ringing tail + sub
    enemyHit_missile: {
        layers: [
            { params: {
                wave_type: 3, p_base_freq: 0.1, p_freq_ramp: -0.12,
                p_env_attack: 0, p_env_sustain: 0.18, p_env_decay: 0.5,
                p_lpf_freq: 0.28, p_lpf_ramp: -0.2, p_env_punch: 0.6,
                sound_vol: 0.5, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
            { params: {
                wave_type: 1, p_base_freq: 0.06, p_freq_ramp: -0.05,
                p_env_attack: 0, p_env_sustain: 0.25, p_env_decay: 0.55,
                p_env_punch: 0.5,
                sound_vol: 0.4, sample_rate: 44100, sample_size: 8,
            }, gain: 0.35 },
            { params: {
                wave_type: 1, p_base_freq: 0.32, p_freq_ramp: -0.18,
                p_env_attack: 0.04, p_env_sustain: 0.18, p_env_decay: 0.4,
                p_vib_strength: 0.22, p_vib_speed: 0.32,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },
    // Spiral laser — spinning fizz with shimmer
    enemyHit_spiral_laser: {
        layers: [
            { params: {
                wave_type: 1, p_base_freq: 0.46, p_freq_ramp: 0.18,
                p_env_attack: 0, p_env_sustain: 0.08, p_env_decay: 0.22,
                p_vib_strength: 0.4, p_vib_speed: 0.78,
                p_hpf_freq: 0.12,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.55 },
            { params: {
                wave_type: 0, p_base_freq: 0.68, p_freq_ramp: 0.1,
                p_env_attack: 0.01, p_env_sustain: 0.06, p_env_decay: 0.2,
                p_vib_strength: 0.35, p_vib_speed: 0.85, p_duty: 0.3,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
        ],
    },
    // Sentinel sweep — descending mechanical tone with sub
    enemyHit_sentinel_sweep: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.46, p_freq_ramp: -0.2,
                p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.18,
                p_arp_mod: -0.35, p_arp_speed: 0.55, p_duty: 0.35,
                p_env_punch: 0.35,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 1, p_base_freq: 0.2, p_freq_ramp: -0.12,
                p_env_attack: 0, p_env_sustain: 0.05, p_env_decay: 0.16,
                sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Lay mine — bassy thud + deep ring
    enemyHit_lay_mine: {
        layers: [
            { params: {
                wave_type: 3, p_base_freq: 0.12, p_freq_ramp: -0.08,
                p_env_attack: 0, p_env_sustain: 0.22, p_env_decay: 0.55,
                p_lpf_freq: 0.22, p_env_punch: 0.55,
                sound_vol: 0.45, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            { params: {
                wave_type: 1, p_base_freq: 0.18, p_freq_ramp: -0.05,
                p_env_attack: 0.02, p_env_sustain: 0.2, p_env_decay: 0.45,
                p_env_punch: 0.45,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            { params: {
                wave_type: 1, p_base_freq: 0.36, p_freq_ramp: -0.1,
                p_env_attack: 0.04, p_env_sustain: 0.18, p_env_decay: 0.38,
                p_vib_strength: 0.18, p_vib_speed: 0.25,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },
    // Sweep laser — ascending whoosh with shimmer harmonic
    enemyHit_sweep_laser: {
        layers: [
            { params: {
                wave_type: 1, p_base_freq: 0.28, p_freq_ramp: 0.2,
                p_env_attack: 0.05, p_env_sustain: 0.22, p_env_decay: 0.38,
                p_vib_strength: 0.4, p_vib_speed: 0.5,
                sound_vol: 0.34, sample_rate: 44100, sample_size: 8,
            }, gain: 0.55 },
            { params: {
                wave_type: 0, p_base_freq: 0.48, p_freq_ramp: 0.15,
                p_env_attack: 0.08, p_env_sustain: 0.18, p_env_decay: 0.35,
                p_vib_strength: 0.32, p_vib_speed: 0.6, p_duty: 0.32,
                p_hpf_freq: 0.15,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
        ],
    },

    // ── Player bullet HIT-ENEMY/ASTEROID (per primary weapon) ────────

    // Pulse Cannon — punchy plasma blast (3-layer for richness)
    playerHit_PULSE_CANNON: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.55, p_freq_ramp: -0.32,
                p_env_attack: 0, p_env_sustain: 0.05, p_env_decay: 0.18,
                p_env_punch: 0.45, p_arp_mod: -0.32, p_arp_speed: 0.6,
                p_duty: 0.4,
                sound_vol: 0.4, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            { params: {
                wave_type: 1, p_base_freq: 0.2, p_freq_ramp: -0.18,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.14,
                p_env_punch: 0.5,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            { params: {
                wave_type: 0, p_base_freq: 0.78, p_freq_ramp: -0.42,
                p_env_attack: 0, p_env_sustain: 0.012, p_env_decay: 0.06,
                p_hpf_freq: 0.28,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },
    // Storm Needles — tiny sharp prick, but now stacked for crispness
    playerHit_STORM_NEEDLES: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.85, p_freq_ramp: -0.42,
                p_env_attack: 0, p_env_sustain: 0.012, p_env_decay: 0.05,
                p_env_punch: 0.4, p_hpf_freq: 0.2, p_duty: 0.25,
                sound_vol: 0.24, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 0, p_base_freq: 0.95, p_freq_ramp: -0.5,
                p_env_attack: 0, p_env_sustain: 0.006, p_env_decay: 0.04,
                p_hpf_freq: 0.4,
                sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Scatter Gun — gritty multi-pellet crunch
    playerHit_SCATTER_GUN: {
        layers: [
            { params: {
                wave_type: 3, p_base_freq: 0.4, p_freq_ramp: -0.28,
                p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.22,
                p_lpf_freq: 0.5, p_env_punch: 0.4,
                sound_vol: 0.42, sample_rate: 44100, sample_size: 8,
            }, gain: 0.45 },
            { params: {
                wave_type: 1, p_base_freq: 0.16, p_freq_ramp: -0.1,
                p_env_attack: 0, p_env_sustain: 0.05, p_env_decay: 0.18,
                p_env_punch: 0.45,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.35 },
            { params: {
                wave_type: 0, p_base_freq: 0.62, p_freq_ramp: -0.38,
                p_env_attack: 0, p_env_sustain: 0.018, p_env_decay: 0.12,
                p_hpf_freq: 0.3, p_arp_mod: -0.3, p_arp_speed: 0.7,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },
    // Rail Driver — heavy industrial slam
    playerHit_RAIL_DRIVER: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.24, p_freq_ramp: -0.18,
                p_env_attack: 0, p_env_sustain: 0.12, p_env_decay: 0.35,
                p_arp_mod: -0.45, p_arp_speed: 0.55, p_env_punch: 0.6,
                p_duty: 0.4,
                sound_vol: 0.5, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            { params: {
                wave_type: 3, p_base_freq: 0.13, p_freq_ramp: -0.22,
                p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.25,
                p_lpf_freq: 0.4, p_env_punch: 0.5,
                sound_vol: 0.4, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            { params: {
                wave_type: 1, p_base_freq: 0.08, p_freq_ramp: -0.05,
                p_env_attack: 0, p_env_sustain: 0.18, p_env_decay: 0.5,
                p_env_punch: 0.55,
                sound_vol: 0.36, sample_rate: 44100, sample_size: 8,
            }, gain: 0.25 },
        ],
    },
    // Lance Beam — energy fizz with high zap and warble
    playerHit_LANCE_BEAM: {
        layers: [
            { params: {
                wave_type: 1, p_base_freq: 0.5, p_freq_ramp: 0.05,
                p_env_attack: 0.02, p_env_sustain: 0.08, p_env_decay: 0.16,
                p_vib_strength: 0.35, p_vib_speed: 0.85, p_hpf_freq: 0.15,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.5 },
            { params: {
                wave_type: 0, p_base_freq: 0.78, p_freq_ramp: -0.22,
                p_env_attack: 0, p_env_sustain: 0.025, p_env_decay: 0.1,
                p_hpf_freq: 0.28, p_duty: 0.3,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.3 },
            { params: {
                wave_type: 0, p_base_freq: 0.95, p_freq_ramp: -0.35,
                p_env_attack: 0.01, p_env_sustain: 0.012, p_env_decay: 0.08,
                p_hpf_freq: 0.45, p_vib_strength: 0.3, p_vib_speed: 0.95,
                sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
            }, gain: 0.2 },
        ],
    },
};
