/**
 * Frame clock — call advance() once per frame to cache Date.now().
 * All game code reads `frameClock.now` instead of calling Date.now() repeatedly.
 * Eliminates 50-100+ syscalls per frame across entities.
 *
 * Path A / S1 — deterministic mode: when enabled, advance() derives `now` from
 * the tick counter (`now += dtMs`) instead of reading the wall clock, so the
 * headless server (and replay/golden tests) run reproducibly. It is OFF by
 * default, so single-player behavior is byte-identical to before — the
 * wall-clock advance() path is unchanged.
 */
export const frameClock = {
    now: Date.now(),
    // Incrementing tick counter — used for cheap frame-parity checks
    // (e.g. throttling enemy AI to alternating frames in late waves).
    // Wraps at 2^31 which won't realistically be reached in a session.
    tick: 0,

    // Deterministic/headless state (default OFF → wall-clock behavior).
    _deterministic: false,
    _dtMs: 1000 / 60, // LOGIC_TICK_MS default; override via setDeterministic({ dtMs })

    advance() {
        if (this._deterministic) {
            this.now += this._dtMs;
        } else {
            this.now = Date.now();
        }
        this.tick = (this.tick + 1) | 0;
    },

    /**
     * Enable tick-driven time (headless server / replay). While enabled,
     * advance() steps `now` by `dtMs` each call instead of reading Date.now().
     */
    setDeterministic(enabled, { startNow = 0, dtMs = 1000 / 60 } = {}) {
        this._deterministic = !!enabled;
        if (enabled) {
            this.now = startNow;
            this._dtMs = dtMs;
        }
    },

    /** Restore default wall-clock mode (and optionally reseed now/tick). */
    reset(now = Date.now()) {
        this._deterministic = false;
        this._dtMs = 1000 / 60;
        this.now = now;
        this.tick = 0;
    },
};
