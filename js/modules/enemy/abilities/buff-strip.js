// SYS-8 / ENMY-05 — player-buff removal. A "Leech" enemy that touches the player
// STRIPS one of their active powerups/skill-buffs and SUPPRESSES it for a short
// window so it can't be re-granted until the suppression lapses. The player holds
// an `activePowerups` map ({ [key]: { expiresAt, ... } }) and (optionally) a
// 4-slot `skillSlots` array; the leech deletes one active entry and stamps a
// `_buffSuppressed` map ({ [key]: until }) that the powerup system reads before
// re-granting. The result object is the FX/toast hook the caller fires from.
//
// "Active" = present AND not expired AND not flagged `unstrippable`. The
// suppression window is the defensive guardrail — same mindset as projectile-
// absorb's timed stamp — so a strip is always temporary and self-healing.
//
// Pure given (player, now, rng); no Date.now / Math.random (rng injected) /
// globals / DOM / imports. Mutates only the passed player. Unit-tests cleanly.

export const STRIP_DURATION_MS = 5000; // a stripped buff stays suppressed this long

export const LEECH_DEFAULTS = {
    durationMs: STRIP_DURATION_MS,
};

/**
 * Currently-active powerup keys eligible to strip: present in `activePowerups`,
 * not expired (no `expiresAt`, or `expiresAt > now`), and not flagged
 * `unstrippable`. Returns a fresh array (empty if `activePowerups` is absent).
 */
export function listStrippablePowerups(player, now) {
    if (!player || !player.activePowerups) return [];
    const out = [];
    for (const key of Object.keys(player.activePowerups)) {
        const buff = player.activePowerups[key];
        if (!buff || buff.unstrippable) continue;
        if (typeof buff.expiresAt === 'number' && !(buff.expiresAt > now)) continue;
        out.push(key);
    }
    return out;
}

/**
 * Pick one eligible powerup key at random via `rng` (defaults to Math.random).
 * Returns null when nothing is eligible. Deterministic given a stubbed rng
 * (e.g. `() => 0` → index 0).
 */
export function pickStripTarget(player, now, rng = Math.random) {
    const eligible = listStrippablePowerups(player, now);
    if (eligible.length === 0) return null;
    const idx = Math.min(eligible.length - 1, Math.floor(rng() * eligible.length));
    return eligible[idx];
}

/**
 * The main entry collision code calls when a Leech contacts the player. Picks a
 * target (or uses `opts.key` if given), DELETES it from `activePowerups`, and
 * stamps `player._buffSuppressed[key] = now + durationMs` so the powerup system
 * refuses to re-grant it until the window lapses. Also drops a matching
 * `skillSlots` buff if one carries that id (best-effort, guarded). Mutates only
 * `player`. Returns `{ stripped: key, until }` for the FX/toast, or
 * `{ stripped: null }` when nothing was eligible to strip.
 */
export function stripPlayerBuff(player, now, opts = {}) {
    if (!player) return { stripped: null };
    const durationMs = typeof opts.durationMs === 'number'
        ? opts.durationMs
        : LEECH_DEFAULTS.durationMs;
    const rng = opts.rng || Math.random;

    let key = opts.key;
    if (key == null) {
        key = pickStripTarget(player, now, rng);
    } else if (!listStrippablePowerups(player, now).includes(key)) {
        // An explicit key that isn't an eligible active powerup → nothing to strip.
        return { stripped: null };
    }
    if (key == null) return { stripped: null };

    const until = now + durationMs;
    player._buffSuppressed = player._buffSuppressed || {};
    player._buffSuppressed[key] = until;

    if (player.activePowerups) delete player.activePowerups[key];

    // Best-effort: also deactivate a skill-slot buff carrying the same id.
    if (Array.isArray(player.skillSlots)) {
        for (const slot of player.skillSlots) {
            if (slot && slot.id === key && slot.buffActive) slot.buffActive = false;
        }
    }

    return { stripped: key, until };
}

/**
 * True while `key` is still suppressed (`_buffSuppressed[key] > now`). The
 * powerup system reads this before re-granting a stripped buff. Safe when
 * `_buffSuppressed` is absent.
 */
export function isBuffSuppressed(player, key, now) {
    if (!player || !player._buffSuppressed) return false;
    return player._buffSuppressed[key] > now;
}
