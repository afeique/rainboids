/**
 * Frame clock — call tick() once per frame to cache Date.now().
 * All game code reads `frameClock.now` instead of calling Date.now() repeatedly.
 * Eliminates 50-100+ syscalls per frame across entities.
 */
export const frameClock = {
    now: Date.now(),
    tick() { this.now = Date.now(); }
};
