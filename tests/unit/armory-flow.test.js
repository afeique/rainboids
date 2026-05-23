// Phase R2.1 — pre-run flow state transitions (ARMORY / LOADOUT).
import { GameStateMachine } from '../../js/modules/core/game-state.js';
import { GAME_STATES } from '../../js/modules/core/constants.js';

describe('Pre-run flow — ARMORY / LOADOUT states', () => {
    test('GAME_STATES exposes ARMORY and LOADOUT', () => {
        expect(GAME_STATES.ARMORY).toBe('ARMORY');
        expect(GAME_STATES.LOADOUT).toBe('LOADOUT');
    });

    test('NEW GAME route: TITLE → ARMORY → run', () => {
        const sm = new GameStateMachine(GAME_STATES.TITLE_SCREEN);
        expect(sm.transition(GAME_STATES.ARMORY)).toBe(true);
        expect(sm.state).toBe(GAME_STATES.ARMORY);
        // START RUN from the armory begins a run (wave intro).
        expect(sm.transition(GAME_STATES.WAVE_TRANSITION)).toBe(true);
    });

    test('ARMORY → LOADOUT → run is a valid chain (R5 readiness)', () => {
        const sm = new GameStateMachine(GAME_STATES.ARMORY);
        expect(sm.transition(GAME_STATES.LOADOUT)).toBe(true);
        expect(sm.transition(GAME_STATES.WAVE_TRANSITION)).toBe(true);
    });

    test('BACK from ARMORY returns to the title screen', () => {
        const sm = new GameStateMachine(GAME_STATES.ARMORY);
        expect(sm.transition(GAME_STATES.TITLE_SCREEN)).toBe(true);
        expect(sm.state).toBe(GAME_STATES.TITLE_SCREEN);
    });

    test('post-run NEW GAME routes through the ARMORY', () => {
        const over = new GameStateMachine(GAME_STATES.GAME_OVER);
        expect(over.transition(GAME_STATES.ARMORY)).toBe(true);
        const done = new GameStateMachine(GAME_STATES.GAME_COMPLETE);
        expect(done.transition(GAME_STATES.ARMORY)).toBe(true);
    });

    test('PLAYING cannot jump straight to ARMORY (no mid-run armory)', () => {
        const sm = new GameStateMachine(GAME_STATES.PLAYING);
        expect(sm.canTransition(GAME_STATES.ARMORY)).toBe(false);
    });
});
