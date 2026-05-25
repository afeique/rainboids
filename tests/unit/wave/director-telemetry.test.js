/**
 * tests/unit/wave/director-telemetry.test.js — CD-17: the Adaptive Difficulty
 * Director's READ-ONLY per-wave telemetry buffer.
 *
 * Pure / deterministic. Pins:
 *   • createDirectorTelemetry shape (empty records, null runStartedAt)
 *   • recordDirectorWave appends a shallow COPY (no aliasing) + caps at MAX
 *     (push 250 → length stays ≤ 200, the oldest are dropped)
 *   • summarizeDirectorTelemetry computes correct count / wave-range / avg-min-max
 *     of D_hp/D_thr/Po/Pd + mean clearTime + mean hpRetained + near-death count
 *     + threat-level histogram on a known fixture
 *   • dumpDirectorTelemetryJSON round-trips (JSON.parse → { summary, records })
 */

import { describe, expect, test } from '@jest/globals';
import {
    MAX_TELEMETRY_RECORDS,
    createDirectorTelemetry,
    recordDirectorWave,
    summarizeDirectorTelemetry,
    dumpDirectorTelemetryJSON,
} from '../../../js/modules/wave/director-telemetry.js';

// A small, fully-known fixture: 4 waves with hand-computed aggregates.
function fixture() {
    const t = createDirectorTelemetry();
    recordDirectorWave(t, { wave: 1, pwr: 100, Po: 1.0, Pd: 1.0, D_hp: 1.0, D_thr: 1.0, threatLevel: 3, clearTimeMs: 30000, hpRetainedFrac: 0.9, nearDeath: false });
    recordDirectorWave(t, { wave: 2, pwr: 110, Po: 1.2, Pd: 0.8, D_hp: 1.1, D_thr: 0.9, threatLevel: 3, clearTimeMs: 20000, hpRetainedFrac: 0.5, nearDeath: false });
    recordDirectorWave(t, { wave: 3, pwr: 120, Po: 1.4, Pd: 0.6, D_hp: 1.3, D_thr: 0.8, threatLevel: 4, clearTimeMs: 10000, hpRetainedFrac: 0.05, nearDeath: true });
    recordDirectorWave(t, { wave: 4, pwr: 130, Po: 0.6, Pd: 1.4, D_hp: 0.9, D_thr: 1.2, threatLevel: 2, clearTimeMs: 40000, hpRetainedFrac: 0.7, nearDeath: false });
    return t;
}

describe('CD-17 director-telemetry', () => {
    describe('createDirectorTelemetry', () => {
        test('returns a fresh empty buffer with null runStartedAt', () => {
            const t = createDirectorTelemetry();
            expect(t).toEqual({ records: [], runStartedAt: null });
            expect(Array.isArray(t.records)).toBe(true);
        });

        test('each call returns an independent buffer (no shared array)', () => {
            const a = createDirectorTelemetry();
            const b = createDirectorTelemetry();
            recordDirectorWave(a, { wave: 1 });
            expect(a.records.length).toBe(1);
            expect(b.records.length).toBe(0);
        });
    });

    describe('recordDirectorWave', () => {
        test('appends a snapshot and returns the telemetry', () => {
            const t = createDirectorTelemetry();
            const ret = recordDirectorWave(t, { wave: 5, D_hp: 1.2 });
            expect(ret).toBe(t);
            expect(t.records.length).toBe(1);
            expect(t.records[0].wave).toBe(5);
            expect(t.records[0].D_hp).toBe(1.2);
        });

        test('stores a shallow COPY (mutating the source does not mutate the record)', () => {
            const t = createDirectorTelemetry();
            const src = { wave: 7, D_hp: 1.0 };
            recordDirectorWave(t, src);
            src.D_hp = 99; // mutate the live source after recording
            expect(t.records[0].D_hp).toBe(1.0);
            expect(t.records[0]).not.toBe(src);
        });

        test('stamps runStartedAt from the first capturedAt only', () => {
            const t = createDirectorTelemetry();
            recordDirectorWave(t, { wave: 1, capturedAt: 1000 });
            recordDirectorWave(t, { wave: 2, capturedAt: 2000 });
            expect(t.runStartedAt).toBe(1000);
        });

        test('caps at MAX_TELEMETRY_RECORDS, dropping the oldest (push 250)', () => {
            const t = createDirectorTelemetry();
            for (let i = 1; i <= 250; i++) recordDirectorWave(t, { wave: i });
            expect(t.records.length).toBe(MAX_TELEMETRY_RECORDS);
            expect(t.records.length).toBeLessThanOrEqual(200);
            // Oldest dropped: first retained wave is 250 - 200 + 1 = 51; last is 250.
            expect(t.records[0].wave).toBe(250 - MAX_TELEMETRY_RECORDS + 1);
            expect(t.records[t.records.length - 1].wave).toBe(250);
        });
    });

    describe('summarizeDirectorTelemetry', () => {
        test('empty buffer yields a zero-count summary', () => {
            const s = summarizeDirectorTelemetry(createDirectorTelemetry());
            expect(s.count).toBe(0);
            expect(s.waveRange).toEqual({ min: null, max: null });
            expect(s.D_hp).toEqual({ count: 0, avg: null, min: null, max: null });
            expect(s.meanClearTimeMs).toBeNull();
            expect(s.nearDeathCount).toBe(0);
            expect(s.threatHistogram).toEqual({});
        });

        test('computes correct count / wave-range / aggregates on the fixture', () => {
            const s = summarizeDirectorTelemetry(fixture());
            expect(s.count).toBe(4);
            expect(s.waveRange).toEqual({ min: 1, max: 4 });

            // D_hp = [1.0, 1.1, 1.3, 0.9] → avg 1.075, min 0.9, max 1.3
            expect(s.D_hp.avg).toBeCloseTo(1.075, 6);
            expect(s.D_hp.min).toBeCloseTo(0.9, 6);
            expect(s.D_hp.max).toBeCloseTo(1.3, 6);

            // D_thr = [1.0, 0.9, 0.8, 1.2] → avg 0.975, min 0.8, max 1.2
            expect(s.D_thr.avg).toBeCloseTo(0.975, 6);
            expect(s.D_thr.min).toBeCloseTo(0.8, 6);
            expect(s.D_thr.max).toBeCloseTo(1.2, 6);

            // Po = [1.0, 1.2, 1.4, 0.6] → avg 1.05
            expect(s.Po.avg).toBeCloseTo(1.05, 6);
            expect(s.Po.min).toBeCloseTo(0.6, 6);
            expect(s.Po.max).toBeCloseTo(1.4, 6);

            // Pd = [1.0, 0.8, 0.6, 1.4] → avg 0.95
            expect(s.Pd.avg).toBeCloseTo(0.95, 6);

            // clearTime mean = (30000+20000+10000+40000)/4 = 25000
            expect(s.meanClearTimeMs).toBeCloseTo(25000, 6);
            // hpRetained mean = (0.9+0.5+0.05+0.7)/4 = 0.5375
            expect(s.meanHpRetainedFrac).toBeCloseTo(0.5375, 6);

            // one near-death wave (wave 3)
            expect(s.nearDeathCount).toBe(1);

            // threat histogram: 3 appears twice, 4 once, 2 once
            expect(s.threatHistogram).toEqual({ '2': 1, '3': 2, '4': 1 });
        });

        test('ignores non-finite numeric fields in aggregates', () => {
            const t = createDirectorTelemetry();
            recordDirectorWave(t, { wave: 1, D_hp: 1.0 });
            recordDirectorWave(t, { wave: 2, D_hp: undefined }); // missing
            recordDirectorWave(t, { wave: 3, D_hp: NaN });       // not finite
            const s = summarizeDirectorTelemetry(t);
            expect(s.count).toBe(3);
            expect(s.D_hp.count).toBe(1);
            expect(s.D_hp.avg).toBeCloseTo(1.0, 6);
        });
    });

    describe('dumpDirectorTelemetryJSON', () => {
        test('round-trips through JSON.parse → { summary, records }', () => {
            const t = fixture();
            const json = dumpDirectorTelemetryJSON(t);
            expect(typeof json).toBe('string');
            const parsed = JSON.parse(json);
            expect(parsed).toHaveProperty('summary');
            expect(parsed).toHaveProperty('records');
            expect(parsed.records.length).toBe(4);
            expect(parsed.summary.count).toBe(4);
            expect(parsed.summary.waveRange).toEqual({ min: 1, max: 4 });
            // records preserved verbatim
            expect(parsed.records[2].wave).toBe(3);
            expect(parsed.records[2].nearDeath).toBe(true);
        });

        test('empty buffer dumps valid JSON with a zero-count summary', () => {
            const json = dumpDirectorTelemetryJSON(createDirectorTelemetry());
            const parsed = JSON.parse(json);
            expect(parsed.summary.count).toBe(0);
            expect(parsed.records).toEqual([]);
        });
    });
});
