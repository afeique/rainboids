// Unit tests for context steering (js/modules/enemy/context-steering.js).
// Pins the core guarantee: the agent steers toward its goal but slides around
// obstacles, and finds an escape route when boxed in.
import { describe, it, expect } from '@jest/globals';
import {
    ContextMap, addInterest, addDanger, chooseDirection,
} from '../../../js/modules/enemy/context-steering.js';

describe('context steering', () => {
    it('with no obstacles, picks the heading toward the goal', () => {
        const map = new ContextMap(12);
        map.reset();
        addInterest(map, 1, 0, 1, 2); // goal is +x
        const out = { x: 0, y: 0, blocked: false };
        chooseDirection(map, out);
        expect(out.blocked).toBe(false);
        // Chosen heading should point mostly +x.
        expect(out.x).toBeGreaterThan(0.8);
        expect(Math.abs(out.y)).toBeLessThan(0.5);
    });

    it('slides around an obstacle dead ahead instead of driving into it', () => {
        const map = new ContextMap(24);
        map.reset();
        addInterest(map, 1, 0, 1, 2);                 // want to go +x
        addDanger(map, 0, 0, 60, 0, 30, 200);         // rock straight ahead at +x
        const out = { x: 0, y: 0, blocked: false };
        chooseDirection(map, out, 0.4);
        // Should NOT pick straight +x; should veer off-axis to get around.
        expect(Math.abs(out.y)).toBeGreaterThan(0.2);
    });

    it('reports blocked + returns an escape route when surrounded', () => {
        const map = new ContextMap(12);
        map.reset();
        addInterest(map, 1, 0, 1, 1);
        // Ring the agent with danger in every direction.
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            addDanger(map, 0, 0, Math.cos(a) * 20, Math.sin(a) * 20, 18, 200);
        }
        const out = { x: 0, y: 0, blocked: false };
        chooseDirection(map, out, 0.3);
        expect(out.blocked).toBe(true);
        // Still returns a unit-ish heading to escape along.
        expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 3);
    });

    it('ignores obstacles beyond the avoid radius', () => {
        const map = new ContextMap(12);
        map.reset();
        addInterest(map, 1, 0, 1, 2);
        addDanger(map, 0, 0, 500, 0, 30, 200); // far away → no danger
        let maxD = 0;
        for (let i = 0; i < 12; i++) maxD = Math.max(maxD, map.danger[i]);
        expect(maxD).toBeCloseTo(0, 5);
    });
});
