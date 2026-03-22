/**
 * EventBus — lightweight synchronous pub/sub for cross-system events.
 *
 * Use for: enemy:killed, wave:complete, purchase:complete, etc.
 * Do NOT use for: per-frame updates, collision results, rendering (hot paths).
 */

export class EventBus {
    constructor() {
        this._listeners = {};
    }

    /**
     * Subscribe to an event. Returns an unsubscribe function.
     * @param {string} event - Event name (e.g., 'enemy:killed')
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return () => this.off(event, callback);
    }

    /** Unsubscribe a specific callback from an event */
    off(event, callback) {
        const list = this._listeners[event];
        if (!list) return;
        const idx = list.indexOf(callback);
        if (idx !== -1) list.splice(idx, 1);
    }

    /** Emit an event synchronously to all subscribers */
    emit(event, data) {
        const list = this._listeners[event];
        if (!list) return;
        for (let i = 0; i < list.length; i++) {
            list[i](data);
        }
    }

    /** Remove all listeners (useful for cleanup/reset) */
    clear() {
        this._listeners = {};
    }
}
