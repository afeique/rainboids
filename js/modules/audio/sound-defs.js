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

export const SOUND_DEFS = {
    // ── Core gameplay ────────────────────────────────────────────────
    shoot:           { preset: 'laserShoot' },
    hit:             { preset: 'hitHurt' },
    coin:            { preset: 'pickupCoin' },
    explosion:       { preset: 'explosion' },
    playerExplosion: { preset: 'explosion', overrides: { p_env_sustain: 0.4, p_base_freq: 0.2 } },

    // ── Powerup pickup — magical ascending chime ─────────────────────
    // Three layers paint a satisfying "blessed" pickup: a sine bell that
    // rises in pitch (the chime body), a square shimmer with vibrato
    // (sparkle), and a high arpeggiated triangle (twinkle). Together
    // they read as a chord rather than one synth voice.
    powerup: {
        layers: [
            // Bell body — rising sine with a chord-y arpeggio
            { params: {
                wave_type: 1, p_base_freq: 0.42, p_freq_ramp: 0.18,
                p_env_attack: 0.0, p_env_sustain: 0.28, p_env_decay: 0.55,
                p_arp_mod: 0.55, p_arp_speed: 0.62,
                sound_vol: 0.4, sample_rate: 44100, sample_size: 8,
            }, gain: 0.55 },
            // Shimmer — square + vibrato slightly above
            { params: {
                wave_type: 0, p_base_freq: 0.68, p_freq_ramp: 0.06,
                p_env_attack: 0.05, p_env_sustain: 0.22, p_env_decay: 0.45,
                p_vib_strength: 0.42, p_vib_speed: 0.7,
                p_duty: 0.3,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
            // Twinkle — high square arp tail with HPF for sparkle
            { params: {
                wave_type: 0, p_base_freq: 0.84, p_freq_ramp: -0.05,
                p_env_attack: 0.18, p_env_sustain: 0.06, p_env_decay: 0.55,
                p_arp_mod: 0.7, p_arp_speed: 0.85,
                p_hpf_freq: 0.22,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.32 },
        ],
    },

    tractorBeam: {
        params: {
            wave_type: 0, p_base_freq: 0.15,
            p_env_attack: 0, p_env_sustain: 0.3, p_env_decay: 0.1,
            sound_vol: 0.18, sample_rate: 44100, sample_size: 8,
        },
    },
    shield: {
        params: {
            wave_type: 3, p_base_freq: 0.3,
            p_env_attack: 0.01, p_env_sustain: 0.1, p_env_decay: 0.2,
            p_freq_ramp: -0.2, p_hpf_freq: 0.2,
            sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
        },
    },
    healthRegen: {
        params: {
            wave_type: 1, p_base_freq: 0.8,
            p_env_attack: 0.3, p_env_sustain: 0.4, p_env_decay: 0.6,
            p_freq_ramp: 0.1, p_vib_speed: 6, p_vib_strength: 0.1,
            p_lpf_freq: 0.7, p_lpf_ramp: 0.2,
            sound_vol: 0.15, sample_rate: 44100, sample_size: 8,
        },
    },

    // ── Player ship rams asteroid — heavy rocky thud + low rumble ────
    playerHitAsteroid: {
        layers: [
            // Punchy noise impact
            { params: {
                wave_type: 3, p_base_freq: 0.12, p_freq_ramp: -0.32,
                p_env_attack: 0, p_env_sustain: 0.05, p_env_decay: 0.28,
                p_lpf_freq: 0.32, p_env_punch: 0.45,
                sound_vol: 0.5, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            // Sub-bass rumble tail (sine, low freq, slight downward drift)
            { params: {
                wave_type: 1, p_base_freq: 0.07, p_freq_ramp: -0.12,
                p_env_attack: 0, p_env_sustain: 0.18, p_env_decay: 0.42,
                sound_vol: 0.32, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },

    // ── Player ship rams enemy — sharp metallic clang + alarm zap ────
    playerHitEnemy: {
        layers: [
            // Metallic clang — square with arp downward and punch
            { params: {
                wave_type: 0, p_base_freq: 0.5, p_freq_ramp: -0.22,
                p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.22,
                p_arp_mod: -0.5, p_arp_speed: 0.7, p_env_punch: 0.5,
                p_duty: 0.4,
                sound_vol: 0.4, sample_rate: 44100, sample_size: 8,
            }, gain: 0.55 },
            // High alarm pip — bright square zap, very short
            { params: {
                wave_type: 0, p_base_freq: 0.78, p_freq_ramp: -0.18,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.16,
                p_hpf_freq: 0.28,
                sound_vol: 0.26, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },

    // ── Enemy bullet HIT-PLAYER (one per shootPattern) ───────────────
    // Each pattern gets a distinctive character so the player learns to
    // read what's about to hurt them by ear alone.

    // Hunter single shot — clean kinetic ping
    enemyHit_hunter_single: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.55, p_freq_ramp: -0.22,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.13,
                p_env_punch: 0.3, p_arp_mod: -0.2, p_arp_speed: 0.6,
                sound_vol: 0.28, sample_rate: 44100, sample_size: 8,
            }, gain: 0.65 },
            { params: {
                wave_type: 1, p_base_freq: 0.22, p_freq_ramp: -0.15,
                p_env_attack: 0, p_env_sustain: 0.03, p_env_decay: 0.1,
                sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
            }, gain: 0.35 },
        ],
    },
    // Guardian spread — warm chord-y harmonic
    enemyHit_guardian_spread: {
        layers: [
            { params: {
                wave_type: 1, p_base_freq: 0.36, p_freq_ramp: -0.12,
                p_env_attack: 0, p_env_sustain: 0.07, p_env_decay: 0.18,
                p_arp_mod: 0.35, p_arp_speed: 0.62,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 0, p_base_freq: 0.55, p_freq_ramp: -0.1,
                p_env_attack: 0.02, p_env_sustain: 0.05, p_env_decay: 0.15,
                p_duty: 0.3,
                sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Wasp machinegun — rapid metallic chitter, single layer (already busy)
    enemyHit_wasp_machinegun: {
        params: {
            wave_type: 0, p_base_freq: 0.7, p_freq_ramp: -0.35,
            p_env_attack: 0, p_env_sustain: 0.018, p_env_decay: 0.07,
            p_env_punch: 0.4, p_hpf_freq: 0.18,
            sound_vol: 0.22, sample_rate: 44100, sample_size: 8,
        },
    },
    // Charged laser — heavy beam impact with sustained drone
    enemyHit_charged_laser: {
        layers: [
            { params: {
                wave_type: 1, p_base_freq: 0.3, p_freq_ramp: 0.15,
                p_env_attack: 0, p_env_sustain: 0.18, p_env_decay: 0.32,
                p_vib_strength: 0.32, p_vib_speed: 0.78,
                sound_vol: 0.36, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 0, p_base_freq: 0.45, p_freq_ramp: 0.05,
                p_env_attack: 0.01, p_env_sustain: 0.12, p_env_decay: 0.22,
                p_hpf_freq: 0.2,
                sound_vol: 0.24, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Arc lightning — electric crackle (noise + zap)
    enemyHit_arc_lightning: {
        layers: [
            { params: {
                wave_type: 3, p_base_freq: 0.5, p_freq_ramp: 0,
                p_env_attack: 0, p_env_sustain: 0.08, p_env_decay: 0.2,
                p_hpf_freq: 0.32, p_vib_strength: 0.55, p_vib_speed: 0.92,
                sound_vol: 0.34, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 0, p_base_freq: 0.78, p_freq_ramp: -0.25,
                p_env_attack: 0, p_env_sustain: 0.02, p_env_decay: 0.1,
                p_arp_mod: 0.5, p_arp_speed: 0.85, p_hpf_freq: 0.3,
                sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Missile — deep boom with ringing tail
    enemyHit_missile: {
        layers: [
            { params: {
                wave_type: 3, p_base_freq: 0.1, p_freq_ramp: -0.12,
                p_env_attack: 0, p_env_sustain: 0.18, p_env_decay: 0.45,
                p_lpf_freq: 0.28, p_lpf_ramp: -0.2, p_env_punch: 0.55,
                sound_vol: 0.5, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 1, p_base_freq: 0.06, p_freq_ramp: -0.05,
                p_env_attack: 0, p_env_sustain: 0.22, p_env_decay: 0.5,
                sound_vol: 0.35, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Spiral laser — spinning fizz
    enemyHit_spiral_laser: {
        params: {
            wave_type: 1, p_base_freq: 0.46, p_freq_ramp: 0.18,
            p_env_attack: 0, p_env_sustain: 0.07, p_env_decay: 0.2,
            p_vib_strength: 0.32, p_vib_speed: 0.72,
            p_hpf_freq: 0.12,
            sound_vol: 0.28, sample_rate: 44100, sample_size: 8,
        },
    },
    // Sentinel sweep — descending mechanical tone
    enemyHit_sentinel_sweep: {
        params: {
            wave_type: 0, p_base_freq: 0.46, p_freq_ramp: -0.18,
            p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.16,
            p_arp_mod: -0.3, p_arp_speed: 0.55, p_duty: 0.35,
            sound_vol: 0.26, sample_rate: 44100, sample_size: 8,
        },
    },
    // Lay mine — bassy thud + ring
    enemyHit_lay_mine: {
        layers: [
            { params: {
                wave_type: 3, p_base_freq: 0.12, p_freq_ramp: -0.08,
                p_env_attack: 0, p_env_sustain: 0.22, p_env_decay: 0.5,
                p_lpf_freq: 0.22, p_env_punch: 0.45,
                sound_vol: 0.45, sample_rate: 44100, sample_size: 8,
            }, gain: 0.65 },
            { params: {
                wave_type: 1, p_base_freq: 0.18, p_freq_ramp: -0.05,
                p_env_attack: 0.02, p_env_sustain: 0.18, p_env_decay: 0.4,
                sound_vol: 0.28, sample_rate: 44100, sample_size: 8,
            }, gain: 0.35 },
        ],
    },
    // Sweep laser — ascending whoosh
    enemyHit_sweep_laser: {
        params: {
            wave_type: 1, p_base_freq: 0.28, p_freq_ramp: 0.18,
            p_env_attack: 0.05, p_env_sustain: 0.22, p_env_decay: 0.35,
            p_vib_strength: 0.42, p_vib_speed: 0.5,
            sound_vol: 0.34, sample_rate: 44100, sample_size: 8,
        },
    },

    // ── Player bullet HIT-ENEMY/ASTEROID (per primary weapon) ────────
    // Each weapon's hit sound layered to land with weight appropriate
    // to its damage profile — small needle = thin tick, rail driver =
    // heavy clang with low body.

    // Pulse Cannon — punchy plasma blast
    playerHit_PULSE_CANNON: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.55, p_freq_ramp: -0.32,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.15,
                p_env_punch: 0.4, p_arp_mod: -0.32, p_arp_speed: 0.6,
                p_duty: 0.4,
                sound_vol: 0.38, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 1, p_base_freq: 0.2, p_freq_ramp: -0.18,
                p_env_attack: 0, p_env_sustain: 0.03, p_env_decay: 0.12,
                sound_vol: 0.26, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Storm Needles — tiny needle prick, single layer (it's a fast SFX)
    playerHit_STORM_NEEDLES: {
        params: {
            wave_type: 0, p_base_freq: 0.85, p_freq_ramp: -0.42,
            p_env_attack: 0, p_env_sustain: 0.012, p_env_decay: 0.05,
            p_env_punch: 0.35, p_hpf_freq: 0.18, p_duty: 0.25,
            sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
        },
    },
    // Scatter Gun — gritty crunch (noise + low body)
    playerHit_SCATTER_GUN: {
        layers: [
            { params: {
                wave_type: 3, p_base_freq: 0.4, p_freq_ramp: -0.28,
                p_env_attack: 0, p_env_sustain: 0.05, p_env_decay: 0.2,
                p_lpf_freq: 0.5, p_env_punch: 0.32,
                sound_vol: 0.4, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 1, p_base_freq: 0.16, p_freq_ramp: -0.1,
                p_env_attack: 0, p_env_sustain: 0.04, p_env_decay: 0.15,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Rail Driver — heavy metal crash
    playerHit_RAIL_DRIVER: {
        layers: [
            { params: {
                wave_type: 0, p_base_freq: 0.24, p_freq_ramp: -0.18,
                p_env_attack: 0, p_env_sustain: 0.1, p_env_decay: 0.32,
                p_arp_mod: -0.4, p_arp_speed: 0.55, p_env_punch: 0.55,
                p_duty: 0.4,
                sound_vol: 0.5, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 3, p_base_freq: 0.13, p_freq_ramp: -0.22,
                p_env_attack: 0, p_env_sustain: 0.06, p_env_decay: 0.22,
                p_lpf_freq: 0.38,
                sound_vol: 0.36, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
    // Lance Beam — energy fizz with high zap
    playerHit_LANCE_BEAM: {
        layers: [
            { params: {
                wave_type: 1, p_base_freq: 0.5, p_freq_ramp: 0.05,
                p_env_attack: 0.02, p_env_sustain: 0.06, p_env_decay: 0.14,
                p_vib_strength: 0.32, p_vib_speed: 0.85, p_hpf_freq: 0.15,
                sound_vol: 0.3, sample_rate: 44100, sample_size: 8,
            }, gain: 0.6 },
            { params: {
                wave_type: 0, p_base_freq: 0.78, p_freq_ramp: -0.22,
                p_env_attack: 0, p_env_sustain: 0.025, p_env_decay: 0.1,
                p_hpf_freq: 0.28,
                sound_vol: 0.2, sample_rate: 44100, sample_size: 8,
            }, gain: 0.4 },
        ],
    },
};
