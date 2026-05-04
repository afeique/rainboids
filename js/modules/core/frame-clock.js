/**
 * Frame clock — call tick() once per frame to cache Date.now().
 * All game code reads `frameClock.now` instead of calling Date.now() repeatedly.
 * Eliminates 50-100+ syscalls per frame across entities.
 */
export const frameClock = {
    now: Date.now(),
    // Incrementing tick counter — used for cheap frame-parity checks
    // (e.g. throttling enemy AI to alternating frames in late waves).
    // Wraps at 2^31 which won't realistically be reached in a session.
    tick: 0,
    advance() { this.now = Date.now(); this.tick = (this.tick + 1) | 0; },
};
