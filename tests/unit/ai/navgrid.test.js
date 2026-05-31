// Unit tests for NavGrid (js/modules/enemy/navgrid.js).
// The point of the A*/flow-field hybrid is to fix steering's blind spot:
// routing AROUND a large blocking body. These tests prove the flow field
// forms and points enemies around a blocked hull toward the goal.
import { describe, it, expect } from '@jest/globals';
import { NavGrid } from '../../../js/modules/enemy/navgrid.js';

describe('NavGrid flow field', () => {
    it('builds a field and points downhill toward the goal in open space', () => {
        const g = new NavGrid(50);
        g.resize(0, 0, 500, 500);
        g.clearBlocked();
        g.buildFlowField(450, 250); // goal on the right
        expect(g.valid).toBe(true);
        const out = { x: 0, y: 0 };
        const ok = g.sampleFlow(50, 250, out); // far left → should point +x
        expect(ok).toBe(true);
        expect(out.x).toBeGreaterThan(0.3);
    });

    it('routes around a blocking hull between agent and goal', () => {
        const g = new NavGrid(40);
        g.resize(0, 0, 800, 800);
        g.clearBlocked();
        // A big wall-like block in the middle (the "boss hull").
        g.blockCircle(400, 400, 160);
        g.buildFlowField(700, 400); // goal to the right of the block
        expect(g.valid).toBe(true);
        // An agent directly left of the block, on the line to the goal, must be
        // routed up or down (|y component| nonzero), NOT straight into the block.
        const out = { x: 0, y: 0 };
        const ok = g.sampleFlow(180, 400, out);
        expect(ok).toBe(true);
        expect(Math.abs(out.y)).toBeGreaterThan(0.2); // detours around, not through
    });

    it('handles a goal that lands inside the blocked region', () => {
        const g = new NavGrid(40);
        g.resize(0, 0, 600, 600);
        g.clearBlocked();
        g.blockCircle(300, 300, 100);
        // Goal exactly at the blocked center → nudged to nearest open cell.
        g.buildFlowField(300, 300);
        expect(g.valid).toBe(true);
        const out = { x: 0, y: 0 };
        // An open cell should still produce a usable flow toward the block edge.
        const ok = g.sampleFlow(80, 300, out);
        expect(ok).toBe(true);
        expect(out.x).toBeGreaterThan(0); // heads toward the goal region
    });
});
