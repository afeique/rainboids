// Unit tests for the Reynolds steering substrate (js/modules/enemy/steering.js).
// These pin the physical invariants the enemy AI relies on: momentum scales
// with mass, speed/force are capped, lead prediction works, flocking repels.
import { describe, it, expect } from '@jest/globals';
import {
    v2, seek, flee, arrive, pursue, evade, separation, containment, integrate, v2len,
} from '../../../js/modules/enemy/steering.js';

describe('seek / flee', () => {
    it('seek points the steering force toward the target', () => {
        const out = v2();
        // At origin, still, target to the right → desired velocity is +x.
        seek(out, 0, 0, 100, 0, 0, 0, 3);
        expect(out.x).toBeCloseTo(3, 5);
        expect(out.y).toBeCloseTo(0, 5);
    });

    it('flee points opposite to seek', () => {
        const s = v2(), f = v2();
        seek(s, 0, 0, 100, 0, 0, 0, 3);
        flee(f, 0, 0, 100, 0, 0, 0, 3);
        expect(f.x).toBeCloseTo(-s.x, 5);
        expect(f.y).toBeCloseTo(-s.y, 5);
    });

    it('seek force accounts for current velocity (force = desired - vel)', () => {
        const out = v2();
        // Already moving at full speed toward target → little/no force needed.
        seek(out, 0, 0, 100, 0, 3, 0, 3);
        expect(v2len(out)).toBeCloseTo(0, 5);
    });
});

describe('arrive', () => {
    it('brakes: desired speed shrinks inside the slowing radius', () => {
        const farOut = v2(), nearOut = v2();
        // Far away (beyond slowRadius=50): full-speed desired.
        arrive(farOut, 0, 0, 200, 0, 0, 0, 3, 50);
        // Close (inside slowRadius): reduced desired speed.
        arrive(nearOut, 0, 0, 10, 0, 0, 0, 3, 50);
        expect(v2len(farOut)).toBeGreaterThan(v2len(nearOut));
    });

    it('produces a braking force when overshooting at the target', () => {
        const out = v2();
        // Sitting on the target but moving → force should oppose motion.
        arrive(out, 0, 0, 0, 0, 3, 0, 3, 50);
        expect(out.x).toBeLessThan(0);
    });
});

describe('pursue / evade (lead prediction)', () => {
    it('pursue aims ahead of a moving target', () => {
        const direct = v2(), lead = v2();
        // Target at (100,0) moving +y fast. Direct seek aims at current pos;
        // pursue should bias the force upward (+y) to intercept.
        seek(direct, 0, 0, 100, 0, 0, 0, 3);
        pursue(lead, 0, 0, 0, 0, 100, 0, 0, 5, 3, 30);
        expect(lead.y).toBeGreaterThan(direct.y);
    });

    it('evade biases away from the predicted intercept', () => {
        const out = v2();
        // Target approaching from the right moving -x (toward us); evade +x...
        // here target at (100,0) moving +y, evade should push -y-ish (away from lead).
        evade(out, 0, 0, 0, 0, 100, 0, 0, 5, 3, 30);
        expect(out.x).toBeLessThan(0); // flee the target's x as well
    });
});

describe('separation', () => {
    it('pushes away from a close neighbor, harder when closer', () => {
        const self = { x: 0, y: 0, vel: v2() };
        const near = [self, { x: 5, y: 0, vel: v2() }];
        const far = [self, { x: 40, y: 0, vel: v2() }];
        const nOut = v2(), fOut = v2();
        separation(nOut, 0, 0, near, 50, self);
        separation(fOut, 0, 0, far, 50, self);
        expect(nOut.x).toBeLessThan(0);                 // pushed -x (away from +x neighbor)
        expect(v2len(nOut)).toBeGreaterThan(v2len(fOut)); // closer → stronger
    });

    it('ignores self and out-of-range neighbors', () => {
        const self = { x: 0, y: 0, vel: v2() };
        const out = v2();
        separation(out, 0, 0, [self, { x: 1000, y: 0, vel: v2() }], 50, self);
        expect(v2len(out)).toBeCloseTo(0, 5);
    });
});

describe('containment', () => {
    it('steers inward only near a wall', () => {
        const middle = v2(), edge = v2();
        containment(middle, 500, 500, 0, 0, 1000, 1000, 100, 3); // center: no force
        containment(edge, 20, 500, 0, 0, 1000, 1000, 100, 3);    // near left wall
        expect(v2len(middle)).toBeCloseTo(0, 5);
        expect(edge.x).toBeGreaterThan(0); // pushed +x, back inward
    });
});

describe('integrate (momentum / limits)', () => {
    it('caps resulting speed at maxSpeed', () => {
        const agent = { vel: v2(0, 0) };
        // Huge force, but maxSpeed=3 → speed must clamp.
        integrate(agent, v2(1000, 0), { mass: 1, maxForce: 1000, maxSpeed: 3 });
        expect(v2len(agent.vel)).toBeCloseTo(3, 5);
    });

    it('caps the applied force at maxForce', () => {
        const light = { vel: v2(0, 0) };
        // force 1000 but maxForce 1 → accel = 1/mass = 1.
        integrate(light, v2(1000, 0), { mass: 1, maxForce: 1, maxSpeed: 100 });
        expect(light.vel.x).toBeCloseTo(1, 5);
    });

    it('heavier mass accelerates slower for the same force (momentum)', () => {
        const heavy = { vel: v2(0, 0) };
        const lightAgent = { vel: v2(0, 0) };
        const force = v2(10, 0);
        integrate(heavy, force, { mass: 10, maxForce: 100, maxSpeed: 100 });
        integrate(lightAgent, force, { mass: 1, maxForce: 100, maxSpeed: 100 });
        expect(lightAgent.vel.x).toBeGreaterThan(heavy.vel.x);
        expect(lightAgent.vel.x).toBeCloseTo(10 * heavy.vel.x, 5); // 10x lighter → 10x accel
    });

    it('turn-rate limits how fast heading can change', () => {
        // Moving +x at speed 3; force demands a hard reverse toward -x.
        const agent = { vel: v2(3, 0) };
        integrate(agent, v2(-1000, 0), { mass: 1, maxForce: 1000, maxSpeed: 3, maxTurnRate: 0.1 });
        // Heading should have rotated only ~0.1 rad this tick, not flipped 180°.
        const angle = Math.atan2(agent.vel.y, agent.vel.x);
        expect(Math.abs(angle)).toBeLessThanOrEqual(0.1 + 1e-6);
        expect(v2len(agent.vel)).toBeCloseTo(3, 5); // speed preserved, only direction limited
    });

    it('without a turn-rate limit, force can reverse heading freely', () => {
        const agent = { vel: v2(3, 0) };
        integrate(agent, v2(-1000, 0), { mass: 1, maxForce: 1000, maxSpeed: 3 });
        expect(agent.vel.x).toBeLessThan(0); // free to reverse
    });
});
