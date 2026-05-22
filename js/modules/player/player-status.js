// A.E9-S1 — player-side elemental statuses. The mirror of the enemy E3 status
// engine, applied to the PLAYER by elemental enemy attacks (lifecycle.takeDamage
// reads opts.element). Kept LIGHT and cleansable (Second Wind). All helpers are
// pure given (player, now=frameClock.now) so they unit-test cleanly; the player
// holds the timer fields.
//
// S1 ships CHILL + CORRODE (no death-path interaction). PLAYER BURN (a DoT that
// can be lethal) lands in S1b once the takeDamage death pipeline is refactored
// to be reusable. SHOCK is deferred.

const CHILL_DUR = 1500;          // ms
const CHILL_SPEED = 0.7;         // thrust/speed ×this while chilled
const CORRODE_DUR = 3000;        // ms
const CORRODE_PER_STACK = 0.15;  // +15% incoming damage per stack
const CORRODE_MAX_STACKS = 2;

/** Reset all player status timers (spawn + Second Wind cleanse). */
export function initPlayerStatus(player) {
    if (!player) return;
    player.pChillUntil = 0;
    player.pCorrodeUntil = 0;
    player.pCorrodeStacks = 0;
}

/** Cleanse all player statuses (the Second Wind ability). */
export function cleansePlayerStatus(player) {
    initPlayerStatus(player);
}

/**
 * Apply the status matching an incoming hit's element. Light + refresh-style.
 * CRYO → CHILL (slows thrust); TOXIC → CORRODE (+damage taken, stacks). PYRO
 * burn (S1b) and VOLT shock are intentionally not applied yet.
 */
export function applyPlayerStatus(player, element, now) {
    if (!player || !element) return;
    if (element === 'CRYO') {
        player.pChillUntil = Math.max(player.pChillUntil || 0, now + CHILL_DUR);
    } else if (element === 'TOXIC') {
        player.pCorrodeStacks = Math.min(CORRODE_MAX_STACKS, (player.pCorrodeStacks || 0) + 1);
        player.pCorrodeUntil = now + CORRODE_DUR;
    }
}

/** Per-frame decay/expiry of timed player statuses (called from player.update). */
export function tickPlayerStatus(player, now) {
    if (!player) return;
    if (player.pCorrodeStacks > 0 && now > player.pCorrodeUntil) {
        player.pCorrodeStacks = 0;
        player.pCorrodeUntil = 0;
    }
    // CHILL needs no explicit decay — playerChillSpeedMult reads the timer.
}

/** Movement-speed multiplier from CHILL (1 = none). Read in getMovementSpeedMultiplier. */
export function playerChillSpeedMult(player, now) {
    return (player && player.pChillUntil > now) ? CHILL_SPEED : 1;
}

/** Incoming-damage multiplier from CORRODE (1 = none). Read in takeDamage. */
export function playerCorrodeMult(player, now) {
    if (player && player.pCorrodeStacks > 0 && player.pCorrodeUntil > now) {
        return 1 + CORRODE_PER_STACK * player.pCorrodeStacks;
    }
    return 1;
}
