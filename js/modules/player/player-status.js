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
// S1b — PLAYER BURN (Pyro hits): a light DoT. Lethal-safe — applied via
// takeDamage's isPlayerBurn path so it runs the shared death pipeline.
const BURN_TICK_MS = 500;
const BURN_DUR = 2000;
const BURN_DMG = 1;              // per tick per stack
const BURN_MAX_STACKS = 3;

/** Reset all player status timers (spawn + Second Wind cleanse). */
export function initPlayerStatus(player) {
    if (!player) return;
    player.pChillUntil = 0;
    player.pCorrodeUntil = 0;
    player.pCorrodeStacks = 0;
    player.pBurnUntil = 0;
    player.pBurnStacks = 0;
    player.pBurnTickAt = 0;
}

/** Cleanse all player statuses (the Second Wind ability). */
export function cleansePlayerStatus(player) {
    initPlayerStatus(player);
}

/**
 * Apply the status matching an incoming hit's element. Light + refresh-style.
 * CRYO → CHILL (slows thrust); TOXIC → CORRODE (+damage taken, stacks);
 * PYRO → BURN (DoT, S1b). VOLT shock still deferred.
 */
export function applyPlayerStatus(player, element, now) {
    // v11.0.0 — elemental effects removed. The player never takes elemental
    // status (chill/corrode/burn) anymore; this is a no-op.
    return;
}

/**
 * Per-frame decay/expiry of timed player statuses. RETURNS the burn damage to
 * apply this frame (the engine update routes it through takeDamage's
 * isPlayerBurn path so it's lethal-safe). CHILL needs no decay (the speed mult
 * reads its timer).
 */
export function tickPlayerStatus(player, now) {
    if (!player) return 0;
    if (player.pCorrodeStacks > 0 && now > player.pCorrodeUntil) {
        player.pCorrodeStacks = 0;
        player.pCorrodeUntil = 0;
    }
    let burnDmg = 0;
    if (player.pBurnStacks > 0 && player.pBurnUntil > 0) {
        while (now >= player.pBurnTickAt && player.pBurnTickAt <= player.pBurnUntil) {
            burnDmg += BURN_DMG * player.pBurnStacks;
            player.pBurnTickAt += BURN_TICK_MS;
        }
        if (now > player.pBurnUntil) {
            player.pBurnStacks = 0; player.pBurnUntil = 0; player.pBurnTickAt = 0;
        }
    }
    return burnDmg;
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
