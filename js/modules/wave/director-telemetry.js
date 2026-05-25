// CD-17 — Adaptive Difficulty Director telemetry. READ-ONLY instrumentation:
// once per wave-clear the wave-manager captures a structured snapshot of the
// director's internal state (Po/Pd/D_hp/D_thr/threatLevel) + the wave outcome
// (clearTime/hpRetained/hits/nearDeath) into a per-run buffer. This feeds the
// future RUN-07 balance-tuning pass — it lets us calibrate the §14 constants
// against real play data without perturbing the live director at all.
//
// Pure + side-effect-free (no globals, Date.now, Math.random, DOM, or game-
// module imports). The ONLY mutation anywhere is the push/shift inside
// recordDirectorWave (a bounded ring buffer). Everything else returns plain
// objects / strings. Unit-tests cleanly; the analyzer in tools/ re-imports the
// same summarize logic against a dumped JSON log.

/**
 * Hard cap on retained per-run telemetry records. Bounds memory on a very long
 * run (recordDirectorWave drops the oldest once this is exceeded). 200 waves is
 * far beyond any real run length, so in practice nothing is ever dropped — the
 * cap is purely a memory-safety backstop for an autonomous /loop or a soak test.
 */
export const MAX_TELEMETRY_RECORDS = 200;

/**
 * A fresh per-run telemetry buffer. Created at run-start (game-engine) alongside
 * the director, replaced on every new run so records never leak across runs.
 * @returns {{records: Array<object>, runStartedAt: number|null}}
 */
export function createDirectorTelemetry() {
    return {
        records: [],
        runStartedAt: null,
    };
}

// Shallow-copy a snapshot into a plain own-property object so the buffer never
// holds a live reference to the director state (which keeps mutating wave-over-
// wave). Only enumerable own keys are copied — exactly the fields the caller
// assembled.
function copySnapshot(snapshot) {
    const out = {};
    if (snapshot && typeof snapshot === 'object') {
        for (const k of Object.keys(snapshot)) out[k] = snapshot[k];
    }
    return out;
}

/**
 * Append one wave's snapshot to the telemetry buffer. The snapshot is shallow-
 * copied (the buffer never aliases live director state). If the buffer would
 * exceed MAX_TELEMETRY_RECORDS, the oldest record is dropped (ring-buffer cap),
 * keeping memory bounded. The first record stamps runStartedAt from the
 * snapshot's wall-clock field (capturedAt) if present.
 * @param {{records: Array, runStartedAt: number|null}} telemetry buffer.
 * @param {object} snapshot the per-wave snapshot to record.
 * @returns {object} the same telemetry buffer (for chaining).
 */
export function recordDirectorWave(telemetry, snapshot) {
    if (!telemetry || !Array.isArray(telemetry.records)) return telemetry;
    const rec = copySnapshot(snapshot);
    if (telemetry.runStartedAt == null && Number.isFinite(rec.capturedAt)) {
        telemetry.runStartedAt = rec.capturedAt;
    }
    telemetry.records.push(rec);
    // Cap: keep the buffer bounded by dropping the oldest record(s). Stay strict
    // at the cap even if many were pushed in one go (defensive while-loop).
    while (telemetry.records.length > MAX_TELEMETRY_RECORDS) {
        telemetry.records.shift();
    }
    return telemetry;
}

// Numeric-aggregate helper. Pulls a finite-number field out of every record,
// returns { count, avg, min, max } (zeros / nulls when no finite samples).
function aggregate(records, key) {
    let count = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const r of records) {
        const v = r ? r[key] : undefined;
        if (Number.isFinite(v)) {
            count += 1;
            sum += v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    if (count === 0) return { count: 0, avg: null, min: null, max: null };
    return { count, avg: sum / count, min, max };
}

/**
 * Pure aggregate summary over a telemetry buffer. No console output, no
 * mutation. Returns a plain object with:
 *   count            — number of records
 *   waveRange        — { min, max } wave numbers (null/null when empty)
 *   D_hp, D_thr,     — { count, avg, min, max } per difficulty axis
 *   Po, Pd           — { count, avg, min, max } per performance estimate
 *   meanClearTimeMs  — mean of clearTimeMs over records with a finite value
 *   meanHpRetainedFrac — mean of hpRetainedFrac
 *   nearDeathCount   — number of records flagged nearDeath
 *   threatHistogram  — { [threatLevel]: count } histogram over integer levels
 * @param {{records: Array}} telemetry buffer.
 */
export function summarizeDirectorTelemetry(telemetry) {
    const records = (telemetry && Array.isArray(telemetry.records)) ? telemetry.records : [];
    const count = records.length;

    // Wave range.
    let waveMin = Infinity;
    let waveMax = -Infinity;
    let nearDeathCount = 0;
    const threatHistogram = {};
    for (const r of records) {
        if (r && Number.isFinite(r.wave)) {
            if (r.wave < waveMin) waveMin = r.wave;
            if (r.wave > waveMax) waveMax = r.wave;
        }
        if (r && r.nearDeath) nearDeathCount += 1;
        if (r && Number.isFinite(r.threatLevel)) {
            const k = String(r.threatLevel);
            threatHistogram[k] = (threatHistogram[k] || 0) + 1;
        }
    }

    const clear = aggregate(records, 'clearTimeMs');
    const hp = aggregate(records, 'hpRetainedFrac');

    return {
        count,
        waveRange: count > 0 && waveMin !== Infinity
            ? { min: waveMin, max: waveMax }
            : { min: null, max: null },
        D_hp: aggregate(records, 'D_hp'),
        D_thr: aggregate(records, 'D_thr'),
        Po: aggregate(records, 'Po'),
        Pd: aggregate(records, 'Pd'),
        meanClearTimeMs: clear.avg,
        meanHpRetainedFrac: hp.avg,
        nearDeathCount,
        threatHistogram,
    };
}

/**
 * Serialize the telemetry buffer to a JSON string of
 * `{ summary, records }`. The summary is computed by summarizeDirectorTelemetry;
 * records are the raw per-wave snapshots. Round-trips through JSON.parse.
 * @param {{records: Array}} telemetry buffer.
 * @param {number} [space=2] JSON.stringify indent (2 for readable dumps).
 * @returns {string} JSON string.
 */
export function dumpDirectorTelemetryJSON(telemetry, space = 2) {
    const records = (telemetry && Array.isArray(telemetry.records)) ? telemetry.records : [];
    const payload = {
        summary: summarizeDirectorTelemetry(telemetry),
        runStartedAt: telemetry ? (telemetry.runStartedAt ?? null) : null,
        records,
    };
    return JSON.stringify(payload, null, space);
}
