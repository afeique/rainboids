#!/usr/bin/env node
// CD-17 — standalone analyzer for a dumped director-telemetry JSON log.
//
// Reads a telemetry JSON file (the output of game.dumpDirectorTelemetry(), which
// is { summary, runStartedAt, records }), prints the aggregate summary + a
// compact per-wave table (wave / pwr / D_hp / D_thr / Po / Pd / clearTime /
// hpRetained) to stdout. This is the consumption side of the RUN-07 balance
// pass: dump a run's telemetry from the browser console, save it to a file, run
// this to read the difficulty curve the director produced.
//
// Dependency-free (node built-ins only). Importable for testing — the formatting
// functions are pure and exported; the CLI body only runs when invoked directly.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { argv, stdout, exit } from 'node:process';

// Recompute the summary locally from records so the analyzer works even on a raw
// records-only dump (and so it never blindly trusts a stale embedded summary).
// Mirrors summarizeDirectorTelemetry in js/modules/wave/director-telemetry.js,
// kept dependency-free here (no cross-import into the game module tree).
function aggregate(records, key) {
    let count = 0, sum = 0, min = Infinity, max = -Infinity;
    for (const r of records) {
        const v = r ? r[key] : undefined;
        if (Number.isFinite(v)) {
            count += 1; sum += v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    if (count === 0) return { count: 0, avg: null, min: null, max: null };
    return { count, avg: sum / count, min, max };
}

export function summarize(records) {
    const recs = Array.isArray(records) ? records : [];
    let waveMin = Infinity, waveMax = -Infinity, nearDeathCount = 0;
    const threatHistogram = {};
    for (const r of recs) {
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
    return {
        count: recs.length,
        waveRange: recs.length && waveMin !== Infinity ? { min: waveMin, max: waveMax } : { min: null, max: null },
        D_hp: aggregate(recs, 'D_hp'),
        D_thr: aggregate(recs, 'D_thr'),
        Po: aggregate(recs, 'Po'),
        Pd: aggregate(recs, 'Pd'),
        meanClearTimeMs: aggregate(recs, 'clearTimeMs').avg,
        meanHpRetainedFrac: aggregate(recs, 'hpRetainedFrac').avg,
        nearDeathCount,
        threatHistogram,
    };
}

// Format a number to `d` decimals, or a placeholder when not finite.
function fmt(v, d = 2) {
    return Number.isFinite(v) ? v.toFixed(d) : '—';
}

// Right-pad / left-pad to a column width.
function padL(s, w) { s = String(s); return s.length >= w ? s : ' '.repeat(w - s.length) + s; }
function padR(s, w) { s = String(s); return s.length >= w ? s : s + ' '.repeat(w - s.length); }

// Build the human-readable summary block as a string.
export function formatSummary(summary) {
    const L = [];
    L.push('=== Director Telemetry Summary ===');
    L.push(`records:    ${summary.count}`);
    const wr = summary.waveRange || { min: null, max: null };
    L.push(`wave range: ${wr.min ?? '—'} .. ${wr.max ?? '—'}`);
    const axis = (name, a) => `${padR(name, 7)} avg ${fmt(a.avg, 3)}  min ${fmt(a.min, 3)}  max ${fmt(a.max, 3)}  (n=${a.count})`;
    L.push(axis('D_hp', summary.D_hp));
    L.push(axis('D_thr', summary.D_thr));
    L.push(axis('Po', summary.Po));
    L.push(axis('Pd', summary.Pd));
    L.push(`mean clearTime: ${fmt(summary.meanClearTimeMs, 0)} ms`);
    L.push(`mean hpRetained: ${fmt(summary.meanHpRetainedFrac, 3)}`);
    L.push(`near-death waves: ${summary.nearDeathCount}`);
    const hist = summary.threatHistogram || {};
    const histStr = Object.keys(hist).sort((a, b) => Number(a) - Number(b))
        .map((k) => `${k}:${hist[k]}`).join('  ') || '(none)';
    L.push(`threat-level histogram: ${histStr}`);
    return L.join('\n');
}

// Build the compact per-wave table as a string.
export function formatTable(records) {
    const recs = Array.isArray(records) ? records : [];
    const cols = [
        ['wave', 5], ['pwr', 7], ['D_hp', 7], ['D_thr', 7],
        ['Po', 7], ['Pd', 7], ['clearMs', 9], ['hpRet', 7],
    ];
    const header = cols.map(([h, w]) => padL(h, w)).join(' ');
    const lines = [header, '-'.repeat(header.length)];
    for (const r of recs) {
        if (!r) continue;
        lines.push([
            padL(Number.isFinite(r.wave) ? r.wave : '—', 5),
            padL(fmt(r.pwr, 1), 7),
            padL(fmt(r.D_hp, 3), 7),
            padL(fmt(r.D_thr, 3), 7),
            padL(fmt(r.Po, 3), 7),
            padL(fmt(r.Pd, 3), 7),
            padL(fmt(r.clearTimeMs, 0), 9),
            padL(fmt(r.hpRetainedFrac, 3), 7),
        ].join(' '));
    }
    return lines.join('\n');
}

// Parse a dump payload (string or object). Accepts { summary, records } or a
// bare array of records. Returns { summary, records } — summary always
// recomputed from records for trust.
export function parseDump(raw) {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const records = Array.isArray(data) ? data
        : (data && Array.isArray(data.records) ? data.records : []);
    return { summary: summarize(records), records };
}

export function renderReport(raw) {
    const { summary, records } = parseDump(raw);
    return `${formatSummary(summary)}\n\n=== Per-Wave Table ===\n${formatTable(records)}\n`;
}

// ── CLI ──────────────────────────────────────────────────────────────
function main() {
    const path = argv[2];
    if (!path) {
        stdout.write('usage: node tools/analyze-director-telemetry.mjs <telemetry.json>\n');
        exit(1);
        return;
    }
    let raw;
    try {
        raw = readFileSync(path, 'utf8');
    } catch (err) {
        stdout.write(`error: cannot read "${path}": ${err.message}\n`);
        exit(1);
        return;
    }
    let report;
    try {
        report = renderReport(raw);
    } catch (err) {
        stdout.write(`error: invalid telemetry JSON in "${path}": ${err.message}\n`);
        exit(1);
        return;
    }
    stdout.write(report);
}

// Only run the CLI when executed directly (not when imported by a test).
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
    main();
}
