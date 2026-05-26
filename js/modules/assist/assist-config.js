// Assist / Co-Pilot persisted-config helpers (AS-1).
//
// `game-engine.js`'s `this.assists` is the single persisted source of truth
// for the player's assist preferences (localStorage 'rainboidsAssists'). It
// carries BOTH the boolean toggles (aimAssist / autoAim / autoFire /
// autoCastAbilities / laserSight) AND the richer Co-Pilot config the
// AssistSystem consumes (level / aggression / autoDodge).
//
// These pure helpers build the platform defaults and merge a stored blob so
// the load/merge/save path is unit-testable without instantiating the engine
// (which pulls the whole WebGL/canvas tree and can't load under jsdom).

import { ASSIST_LEVELS, DEFAULT_ASSIST_CONFIG } from './assist-system.js';

// Valid auto-dodge intensities (consumed by decideDodge: 'off' disables,
// 'conservative' = TTI 0.34, 'aggressive' = TTI 0.75).
export const AUTO_DODGE_LEVELS = Object.freeze(['off', 'conservative', 'aggressive']);

// The full default `assists` object. `mobile` selects the one-thumb baseline
// (Co-Pilot + conservative auto-dodge) over the desktop default (manual, no
// auto-dodge). Note: the boolean auto-* toggles default OFF on every platform
// — the mobile forced-Co-Pilot behavior is applied per-frame in the engine
// (touch override), not baked into the stored defaults, so the ASSISTS tab
// stays truthful once a gamepad reveals it.
export function defaultAssistConfig(mobile = false) {
    return {
        aimAssist: false,
        autoAim: false,
        autoFire: false,
        autoCastAbilities: false,
        laserSight: !mobile,
        // Richer Co-Pilot config (AS-1) — persisted so AS-2/3/4 can tune it.
        level: mobile ? ASSIST_LEVELS.CO_PILOT : ASSIST_LEVELS.MANUAL_TOUCH,
        autoDodge: mobile ? 'conservative' : 'off',
        aggression: DEFAULT_ASSIST_CONFIG.aggression, // 0.55
    };
}

// Clamp/validate the richer fields so a corrupt or stale localStorage blob
// can't push an out-of-range value into the live AssistSystem config.
function sanitize(cfg) {
    if (!Object.values(ASSIST_LEVELS).includes(cfg.level)) {
        cfg.level = ASSIST_LEVELS.MANUAL_TOUCH;
    }
    if (!AUTO_DODGE_LEVELS.includes(cfg.autoDodge)) {
        cfg.autoDodge = 'off';
    }
    const a = Number(cfg.aggression);
    cfg.aggression = Number.isFinite(a)
        ? Math.max(0.1, Math.min(1, a))
        : DEFAULT_ASSIST_CONFIG.aggression;
    return cfg;
}

// Merge a stored prefs blob over the platform defaults. Stored values win;
// missing keys fall back to the defaults; the retired `autoPower` field is
// stripped; the richer fields are sanitized.
export function mergeStoredAssists(stored, mobile = false) {
    const merged = Object.assign({}, defaultAssistConfig(mobile), stored || {});
    delete merged.autoPower;
    return sanitize(merged);
}
