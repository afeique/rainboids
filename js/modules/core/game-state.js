/**
 * GameStateMachine — owns game state transitions with validation and epoch guards.
 *
 * Emits: 'state:changed' (via onEnter/onExit hooks)
 * Listens: nothing (pure state management)
 *
 * Epoch guard usage:
 *   const epoch = stateMachine.epoch;
 *   setTimeout(() => {
 *       if (stateMachine.epoch !== epoch) return; // stale callback
 *       // ... safe to proceed
 *   }, delay);
 */

import { GAME_STATES } from './constants.js';

// Valid state transitions — keys are source states, values are allowed targets
const TRANSITION_TABLE = {
    [GAME_STATES.TITLE_SCREEN]:    [GAME_STATES.PLAYING, GAME_STATES.WAVE_TRANSITION, GAME_STATES.ARMORY, GAME_STATES.HANGAR],
    // 6.157.0 — HANGAR is the cosmetic ship-skin selector, reached from the
    // title screen and returning to it (purely a menu detour, no run impact).
    [GAME_STATES.HANGAR]:          [GAME_STATES.TITLE_SCREEN],
    // Phase R2 — pre-run meta screens. NEW GAME: TITLE → ARMORY → LOADOUT
    // → WAVE_TRANSITION (run). Back-nav returns to the prior screen. ARMORY
    // → WAVE_TRANSITION is allowed too so the run can start before the
    // (R5) LOADOUT screen exists.
    [GAME_STATES.ARMORY]:          [GAME_STATES.TITLE_SCREEN, GAME_STATES.LOADOUT, GAME_STATES.WAVE_TRANSITION, GAME_STATES.PLAYING],
    [GAME_STATES.LOADOUT]:         [GAME_STATES.ARMORY, GAME_STATES.WAVE_TRANSITION, GAME_STATES.PLAYING, GAME_STATES.TITLE_SCREEN],
    [GAME_STATES.PLAYING]:         [GAME_STATES.PAUSED, GAME_STATES.SHOP, GAME_STATES.WAVE_TRANSITION, GAME_STATES.GAME_OVER, GAME_STATES.GAME_COMPLETE],
    [GAME_STATES.WAVE_TRANSITION]: [GAME_STATES.PLAYING, GAME_STATES.SHOP, GAME_STATES.PAUSED, GAME_STATES.GAME_OVER, GAME_STATES.GAME_COMPLETE],
    [GAME_STATES.PAUSED]:          [GAME_STATES.PLAYING, GAME_STATES.WAVE_TRANSITION, GAME_STATES.SHOP],
    // SHOP → PLAYING added 5.71.0: when the player opens the shop mid-
    // wave (HUD shop button) and clicks the X to close, closeShopToPlaying
    // returns to PLAYING. Without this entry the transition is silently
    // rejected and the state stays SHOP — game loop is gated on PLAYING/
    // WAVE_TRANSITION so the screen freezes (shop overlay hidden, but
    // entities don't update).
    [GAME_STATES.SHOP]:            [GAME_STATES.PLAYING, GAME_STATES.WAVE_TRANSITION, GAME_STATES.PAUSED, GAME_STATES.GAME_COMPLETE],
    [GAME_STATES.GAME_OVER]:       [GAME_STATES.TITLE_SCREEN, GAME_STATES.PLAYING, GAME_STATES.WAVE_TRANSITION, GAME_STATES.ARMORY],
    [GAME_STATES.GAME_COMPLETE]:   [GAME_STATES.TITLE_SCREEN, GAME_STATES.PLAYING, GAME_STATES.WAVE_TRANSITION, GAME_STATES.ARMORY],
    [GAME_STATES.ORIENTATION_LOCK]:[GAME_STATES.PLAYING, GAME_STATES.PAUSED, GAME_STATES.WAVE_TRANSITION, GAME_STATES.TITLE_SCREEN, GAME_STATES.SHOP],
};

export class GameStateMachine {
    constructor(initialState = GAME_STATES.TITLE_SCREEN) {
        this._state = initialState;
        this._epoch = 0;
        this._onEnter = {};  // { [state]: [callback, ...] }
        this._onExit = {};   // { [state]: [callback, ...] }
        this._onChange = [];  // [(oldState, newState) => void, ...]
    }

    /** Current game state */
    get state() {
        return this._state;
    }

    /** Epoch counter — increments on every state change. Use for stale-callback guards. */
    get epoch() {
        return this._epoch;
    }

    /**
     * Transition to a new state. Validates against the transition table.
     * Returns true if transition succeeded, false if rejected.
     */
    transition(newState) {
        if (newState === this._state) return true; // no-op, not an error

        const allowed = TRANSITION_TABLE[this._state];
        if (!allowed || !allowed.includes(newState)) {
            console.warn(`[GameState] Invalid transition: ${this._state} → ${newState}`);
            return false;
        }

        const oldState = this._state;

        // Run onExit hooks for the old state
        const exitHooks = this._onExit[oldState];
        if (exitHooks) {
            for (let i = 0; i < exitHooks.length; i++) {
                exitHooks[i](oldState, newState);
            }
        }

        // Update state and bump epoch
        this._state = newState;
        this._epoch++;

        // Run onEnter hooks for the new state
        const enterHooks = this._onEnter[newState];
        if (enterHooks) {
            for (let i = 0; i < enterHooks.length; i++) {
                enterHooks[i](oldState, newState);
            }
        }

        // Run onChange listeners
        for (let i = 0; i < this._onChange.length; i++) {
            this._onChange[i](oldState, newState);
        }

        return true;
    }

    /** Check if a transition is valid without performing it */
    canTransition(newState) {
        if (newState === this._state) return true;
        const allowed = TRANSITION_TABLE[this._state];
        return allowed ? allowed.includes(newState) : false;
    }

    /** Register a callback that runs when entering a specific state */
    onEnter(state, callback) {
        if (!this._onEnter[state]) this._onEnter[state] = [];
        this._onEnter[state].push(callback);
    }

    /** Register a callback that runs when exiting a specific state */
    onExit(state, callback) {
        if (!this._onExit[state]) this._onExit[state] = [];
        this._onExit[state].push(callback);
    }

    /** Register a callback that runs on any state change */
    onChange(callback) {
        this._onChange.push(callback);
    }

    /**
     * Force-set state without validation. Only for initialization/reset.
     * Still bumps epoch to invalidate stale callbacks.
     */
    forceState(newState) {
        this._state = newState;
        this._epoch++;
    }

    /** Check if currently in one of the given states */
    isIn(...states) {
        return states.includes(this._state);
    }
}
