// SYS-9 / ENMY-06 — skill-suppress aura. The player-facing MIRROR of the SYS-7
// ally support aura (support-aura.js): where that buffs nearby ALLY enemies,
// this DEBUFFS the player. A "Null Drone" projects an aura that, while the
// player stands inside it, STALLS the player's skill-cooldown regen (a scale
// multiplier < 1 applied to the regen tick) and/or HARD-LOCKS skill activation.
// A HUD cue reads the active suppression. Reads the 4-slot skill model — it is
// agnostic to which slot, suppression is global while inside.
//
// The debuff is a timed stamp that LINGERS briefly (mirror of AURA_LINGER_MS),
// so leaving the radius doesn't instantly clear it — and killing the drone lets
// it lapse. Pure given (enemy, player, now): the enemy holds the `suppressAura`
// config, the player holds the stamped fields. No Date.now, no globals, no
// render/DOM side-effects. Unit-tests cleanly.

export const LINGER_MS = 350; // suppression outlives leaving the radius by this

export const SUPPRESS_DEFAULTS = {
    radius: 220,
    cooldownScale: 0.25, // regen at quarter speed while suppressed
    blocksActivation: false,
};

/**
 * Is the player inside the enemy's suppress aura? distance(enemy, player) ≤
 * `enemy.suppressAura.radius` (uses x/y on both). Missing aura → false.
 */
export function playerInAura(enemy, player) {
    if (!enemy || !enemy.suppressAura || !player) return false;
    const r = enemy.suppressAura.radius;
    const dx = player.x - enemy.x, dy = player.y - enemy.y;
    return dx * dx + dy * dy <= r * r;
}

/**
 * Apply the suppression to the player if they're inside the aura (mutates
 * player fields). Stamps a timed `_skillSuppressedUntil = now + LINGER_MS` and
 * records the `_skillCooldownScale` + `_skillActivationBlocked` from the aura
 * config. Returns true if applied, false if the player isn't in the aura.
 */
export function applySuppression(enemy, player, now) {
    if (!playerInAura(enemy, player)) return false;
    const a = enemy.suppressAura;
    player._skillSuppressedUntil = now + LINGER_MS;
    player._skillCooldownScale = a.cooldownScale;
    player._skillActivationBlocked = !!a.blocksActivation;
    return true;
}

/**
 * Multiplier the skill-cooldown regen tick should apply right now:
 * `player._skillCooldownScale` while suppression is active, else 1 (normal
 * full-speed regen).
 */
export function cooldownRegenScale(player, now) {
    if (player && player._skillSuppressedUntil > now) {
        return player._skillCooldownScale;
    }
    return 1;
}

/**
 * Should the skill-activation path refuse activation right now? TRUE only while
 * suppression is active AND the aura hard-locks activation.
 */
export function isActivationBlocked(player, now) {
    return !!(player && player._skillSuppressedUntil > now && player._skillActivationBlocked);
}

/** HUD cue: is any suppression active right now? */
export function isSuppressed(player, now) {
    return !!(player && player._skillSuppressedUntil > now);
}
