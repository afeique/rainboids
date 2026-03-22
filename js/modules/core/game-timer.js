/**
 * GameTimer — frame-counted timer that only advances when tick() is called.
 *
 * Unlike setTimeout, these timers freeze when the game is paused because
 * no manager calls tick() during PAUSED/SHOP states.
 *
 * Usage:
 *   const timer = new GameTimer(2000, () => this.spawnWave());
 *   // In update loop (only runs during PLAYING/WAVE_TRANSITION):
 *   timer.tick(dt);
 */

export class GameTimer {
    /**
     * @param {number} durationMs - Timer duration in milliseconds
     * @param {Function} [callback] - Optional callback when timer completes
     */
    constructor(durationMs, callback) {
        this._duration = durationMs;
        this._remaining = durationMs;
        this._callback = callback || null;
        this._done = false;
        this._active = true;
    }

    /**
     * Advance the timer by dt milliseconds.
     * Fires callback (once) when remaining reaches 0.
     * @param {number} dt - Delta time in milliseconds
     */
    tick(dt) {
        if (this._done || !this._active) return;
        this._remaining -= dt;
        if (this._remaining <= 0) {
            this._remaining = 0;
            this._done = true;
            if (this._callback) this._callback();
        }
    }

    /** Whether the timer has completed */
    get done() {
        return this._done;
    }

    /** Whether the timer is active (not cancelled) */
    get active() {
        return this._active;
    }

    /** Remaining time in milliseconds */
    get remaining() {
        return this._remaining;
    }

    /** Original duration in milliseconds */
    get duration() {
        return this._duration;
    }

    /** Progress from 0 to 1 */
    get progress() {
        return this._duration > 0 ? 1 - (this._remaining / this._duration) : 1;
    }

    /** Reset the timer with a new (or same) duration */
    reset(durationMs) {
        this._duration = durationMs !== undefined ? durationMs : this._duration;
        this._remaining = this._duration;
        this._done = false;
        this._active = true;
    }

    /** Cancel the timer — it will no longer tick or fire its callback */
    cancel() {
        this._active = false;
        this._done = true;
    }
}
