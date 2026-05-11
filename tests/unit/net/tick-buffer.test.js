/**
 * tests/unit/net/tick-buffer.test.js — unit tests for the client-side
 * snapshot ring buffer.
 *
 * TickBuffer is a thin data structure that powers Phase 3 of the
 * multiplayer client work: storing recent server snapshots by tick number
 * and interpolating between adjacent ticks for smooth rendering. These
 * tests cover insertion, eviction, exact lookup, interpolation, and edge
 * cases (out-of-order inserts, missing interpolate fn, out-of-range
 * queries). Prediction and reconciliation are handled separately in
 * `js/net/prediction.js`.
 */

import { describe, expect, jest, test } from '@jest/globals';

import { TickBuffer } from '../../../js/net/tick-buffer.js';

// Simple 1-D linear interpolator for tests. State shape is `{x: number}`.
const lerpX = (s1, s2, t) => ({ x: s1.x + (s2.x - s1.x) * t });

describe('TickBuffer', () => {
    test('new buffer is empty', () => {
        const buf = new TickBuffer();
        expect(buf.size()).toBe(0);
        expect(buf.getLatest()).toBeNull();
        expect(buf.getByTick(0)).toBeNull();
    });

    test('default capacity is 32 and can be overridden', () => {
        const def = new TickBuffer();
        expect(def.capacity).toBe(32);
        const custom = new TickBuffer({ capacity: 8 });
        expect(custom.capacity).toBe(8);
    });

    test('constructor rejects non-positive capacity', () => {
        expect(() => new TickBuffer({ capacity: 0 })).toThrow(RangeError);
        expect(() => new TickBuffer({ capacity: -3 })).toThrow(RangeError);
        expect(() => new TickBuffer({ capacity: NaN })).toThrow(RangeError);
    });

    test('insert one entry — size and getLatest', () => {
        const buf = new TickBuffer();
        const state = { x: 10 };
        buf.insert(5, state);
        expect(buf.size()).toBe(1);
        const latest = buf.getLatest();
        expect(latest).not.toBeNull();
        expect(latest.tick).toBe(5);
        expect(latest.state).toBe(state);
    });

    test('insert beyond capacity evicts the oldest entry', () => {
        const buf = new TickBuffer({ capacity: 3 });
        buf.insert(1, { x: 1 });
        buf.insert(2, { x: 2 });
        buf.insert(3, { x: 3 });
        buf.insert(4, { x: 4 }); // evicts tick=1
        expect(buf.size()).toBe(3);
        expect(buf.getByTick(1)).toBeNull();
        expect(buf.getByTick(2)).toEqual({ x: 2 });
        expect(buf.getByTick(4)).toEqual({ x: 4 });
        expect(buf.getLatest().tick).toBe(4);
    });

    test('getByTick — exact match returns stored state', () => {
        const buf = new TickBuffer();
        const s7 = { x: 70 };
        buf.insert(7, s7);
        buf.insert(8, { x: 80 });
        expect(buf.getByTick(7)).toBe(s7);
    });

    test('getByTick — miss returns null', () => {
        const buf = new TickBuffer();
        buf.insert(10, { x: 100 });
        buf.insert(12, { x: 120 });
        expect(buf.getByTick(11)).toBeNull();
        expect(buf.getByTick(99)).toBeNull();
        expect(buf.getByTick(-1)).toBeNull();
    });

    test('getInterpolated — exact tick match returns state without calling interpolate', () => {
        const interpolate = jest.fn(lerpX);
        const buf = new TickBuffer({ interpolate });
        const s5 = { x: 50 };
        buf.insert(4, { x: 40 });
        buf.insert(5, s5);
        buf.insert(6, { x: 60 });
        const out = buf.getInterpolated(5);
        expect(out).toBe(s5);
        expect(interpolate).not.toHaveBeenCalled();
    });

    test('getInterpolated — between adjacent ticks lerps with correct t', () => {
        const interpolate = jest.fn(lerpX);
        const buf = new TickBuffer({ interpolate });
        buf.insert(10, { x: 0 });
        buf.insert(20, { x: 100 });
        const out = buf.getInterpolated(13);
        // t = (13 - 10) / (20 - 10) = 0.3 → x = 0 + 0.3*(100-0) = 30
        expect(out).toEqual({ x: 30 });
        expect(interpolate).toHaveBeenCalledTimes(1);
        const [a, b, t] = interpolate.mock.calls[0];
        expect(a).toEqual({ x: 0 });
        expect(b).toEqual({ x: 100 });
        expect(t).toBeCloseTo(0.3);
    });

    test('getInterpolated — fractional tick between adjacent integers', () => {
        const buf = new TickBuffer({ interpolate: lerpX });
        buf.insert(0, { x: 0 });
        buf.insert(1, { x: 100 });
        expect(buf.getInterpolated(0.25)).toEqual({ x: 25 });
        expect(buf.getInterpolated(0.5)).toEqual({ x: 50 });
        expect(buf.getInterpolated(0.75)).toEqual({ x: 75 });
    });

    test('getInterpolated — outside buffered range returns null', () => {
        const buf = new TickBuffer({ interpolate: lerpX });
        buf.insert(10, { x: 100 });
        buf.insert(20, { x: 200 });
        expect(buf.getInterpolated(9)).toBeNull();
        expect(buf.getInterpolated(21)).toBeNull();
        expect(buf.getInterpolated(1000)).toBeNull();
    });

    test('getInterpolated — without interpolate fn returns null', () => {
        const buf = new TickBuffer(); // no interpolate
        buf.insert(1, { x: 1 });
        buf.insert(2, { x: 2 });
        // Even with a valid bracketing tick, no interpolate fn → null.
        expect(buf.getInterpolated(1.5)).toBeNull();
        // And exact match also returns null when no interpolate fn is set —
        // callers should use getByTick for that path.
        expect(buf.getInterpolated(1)).toBeNull();
    });

    test('getInterpolated — empty buffer returns null', () => {
        const buf = new TickBuffer({ interpolate: lerpX });
        expect(buf.getInterpolated(0)).toBeNull();
        expect(buf.getInterpolated(5)).toBeNull();
    });

    test('clear empties the buffer', () => {
        const buf = new TickBuffer();
        buf.insert(1, { x: 1 });
        buf.insert(2, { x: 2 });
        buf.insert(3, { x: 3 });
        expect(buf.size()).toBe(3);
        buf.clear();
        expect(buf.size()).toBe(0);
        expect(buf.getLatest()).toBeNull();
        expect(buf.getByTick(2)).toBeNull();
    });

    test('out-of-order inserts are sorted by tick', () => {
        const buf = new TickBuffer({ interpolate: lerpX });
        buf.insert(20, { x: 200 });
        buf.insert(10, { x: 100 });
        buf.insert(30, { x: 300 });
        buf.insert(15, { x: 150 });

        expect(buf.size()).toBe(4);
        // Latest should be tick=30.
        expect(buf.getLatest().tick).toBe(30);
        // Internal order: 10, 15, 20, 30 — interpolating tick=17.5 should
        // bracket between 15 and 20.
        const out = buf.getInterpolated(17.5);
        // t = (17.5 - 15) / (20 - 15) = 0.5 → x = 150 + 0.5*(200-150) = 175
        expect(out).toEqual({ x: 175 });
    });

    test('inserting at an existing tick replaces the stored state (latest-write-wins)', () => {
        const buf = new TickBuffer();
        buf.insert(5, { x: 50, v: 'old' });
        buf.insert(5, { x: 55, v: 'new' });
        expect(buf.size()).toBe(1);
        expect(buf.getByTick(5)).toEqual({ x: 55, v: 'new' });
    });

    test('eviction order is FIFO by tick after out-of-order inserts', () => {
        const buf = new TickBuffer({ capacity: 3 });
        buf.insert(10, { x: 10 });
        buf.insert(30, { x: 30 });
        buf.insert(20, { x: 20 });
        // Buffer now holds {10,20,30}. Adding 40 evicts tick=10 (oldest).
        buf.insert(40, { x: 40 });
        expect(buf.size()).toBe(3);
        expect(buf.getByTick(10)).toBeNull();
        expect(buf.getByTick(20)).toEqual({ x: 20 });
        expect(buf.getByTick(30)).toEqual({ x: 30 });
        expect(buf.getByTick(40)).toEqual({ x: 40 });
    });

    test('insert rejects non-finite ticks', () => {
        const buf = new TickBuffer();
        expect(() => buf.insert(NaN, {})).toThrow(TypeError);
        expect(() => buf.insert(Infinity, {})).toThrow(TypeError);
        expect(() => buf.insert(-Infinity, {})).toThrow(TypeError);
    });

    test('getInterpolated picks the correct bracket among many entries', () => {
        const interpolate = jest.fn(lerpX);
        const buf = new TickBuffer({ interpolate });
        for (let i = 0; i < 10; i++) buf.insert(i, { x: i * 10 });
        const out = buf.getInterpolated(6.5);
        // Brackets 6 and 7: t=0.5 → x = 60 + 0.5*(70-60) = 65
        expect(out).toEqual({ x: 65 });
        const [a, b, t] = interpolate.mock.calls[0];
        expect(a).toEqual({ x: 60 });
        expect(b).toEqual({ x: 70 });
        expect(t).toBeCloseTo(0.5);
    });
});
