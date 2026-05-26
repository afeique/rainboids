// FB-3 — death-cause readout.
//
// Pure source→string mapping for the GAME OVER screen's one-line cause
// readout. Given a compact descriptor of the LAST lethal damage source, it
// returns a short, descriptive/instructive phrase that teaches positioning
// (e.g. "Cornered by Hunters", "Caught in a Titan barrage"). The tone is
// always about the threat, NEVER about the Co-Pilot.
//
// `source` shape: { kind, enemyType? }
//   kind ∈ 'enemy' | 'asteroid' | 'enemy-bullet' | 'burn' | 'hazard' | 'unknown'
//   enemyType?: one of the ENEMY type keys (HUNTER, TITAN, …) when known.
//
// Self-contained: no DOM, no engine imports. Default-safe — a missing /
// malformed source resolves to a generic phrase and never throws.

// Per-enemy evocative phrases. Keyed by the enemy `type` string used across the
// game (see core/constants.js enemy-type keys). Plural / barrage framing is
// chosen per enemy to read like a debrief line.
const ENEMY_PHRASES = {
    HUNTER:    'Cornered by Hunters',
    GUARDIAN:  'Overrun by a Guardian',
    WASP:      'Stung down by Wasps',
    STALKER:   'Ambushed by a Stalker',
    DRIFTER:   'Cut down by a Drifter beam',
    PROWLER:   'Run down by a Prowler',
    WEAVER:    'Tangled in Weaver fire',
    SENTINEL:  'Pinned by a Sentinel',
    TANGERINE: 'Swarmed by Tangerines',
    TITAN:     'Caught in a Titan barrage',
};

// Generic fallbacks per kind. Used when no more specific phrase applies.
const GENERIC = {
    enemy:          'Overwhelmed by enemies',
    asteroid:       'Crushed by an asteroid',
    'enemy-bullet': 'Shot down',
    burn:           'Burned to death',
    hazard:         'Lost to a hazard field',
    unknown:        'Ship destroyed',
};

const SAFE_DEFAULT = 'Ship destroyed';

// Resolve the one-line death-cause string for a source descriptor.
export function deathCauseString(source) {
    if (!source || typeof source !== 'object') return SAFE_DEFAULT;

    const kind = source.kind;

    if (kind === 'enemy') {
        const t = source.enemyType;
        if (t && ENEMY_PHRASES[t]) return ENEMY_PHRASES[t];
        return GENERIC.enemy;
    }

    if (kind === 'enemy-bullet') {
        // If the bullet's firing enemy type is known, frame it by that enemy;
        // otherwise the plain "Shot down".
        const t = source.enemyType;
        if (t && ENEMY_PHRASES[t]) return ENEMY_PHRASES[t];
        return GENERIC['enemy-bullet'];
    }

    if (kind && Object.prototype.hasOwnProperty.call(GENERIC, kind)) {
        return GENERIC[kind];
    }

    return SAFE_DEFAULT;
}
