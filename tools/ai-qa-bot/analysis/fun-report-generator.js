/**
 * AI QA Bot — Fun Report Generator
 *
 * Generates human-readable and machine-readable fun analysis reports.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

export class FunReportGenerator {
    /**
     * Generate fun report files in the session directory.
     * @param {object} funAnalysis - Result from FunAnalyzer.analyze()
     * @param {Array} waveBucketsJSON - WaveBucket.toJSON() array
     * @param {object} sessionMeta - Session metadata
     * @param {string} sessionDir - Directory to write reports
     */
    static generate(funAnalysis, waveBucketsJSON, sessionMeta, sessionDir) {
        // JSON report
        const jsonReport = {
            meta: sessionMeta,
            funScore: funAnalysis,
            waveBuckets: waveBucketsJSON,
        };
        writeFileSync(
            join(sessionDir, 'fun-report.json'),
            JSON.stringify(jsonReport, null, 2)
        );

        // Markdown report
        const md = FunReportGenerator._buildMarkdown(funAnalysis, waveBucketsJSON, sessionMeta);
        writeFileSync(join(sessionDir, 'fun-report.md'), md);

        return join(sessionDir, 'fun-report.md');
    }

    /**
     * Generate aggregate fun report across multiple sessions.
     */
    static generateAggregate(sessions, reportsDir) {
        const lines = [
            '# Aggregate Fun Report',
            '',
            `**Sessions**: ${sessions.length}`,
            `**Date**: ${new Date().toISOString().split('T')[0]}`,
            '',
        ];

        // Collect all fun scores
        const scores = sessions
            .filter(s => s.funScore)
            .map(s => ({
                id: s.meta.sessionId,
                build: s.meta.config.buildArchetype,
                overall: s.funScore.overall,
                ...Object.fromEntries(
                    Object.entries(s.funScore.dimensions)
                        .map(([k, v]) => [k, v.score])
                ),
            }));

        if (scores.length === 0) {
            lines.push('No sessions with fun data found.');
            writeFileSync(join(reportsDir, 'fun-report-aggregate.md'), lines.join('\n'));
            return;
        }

        // Overall scores
        const overalls = scores.map(s => s.overall);
        lines.push('## Overall Fun Scores');
        lines.push(`- **Average**: ${avg(overalls).toFixed(1)}`);
        lines.push(`- **Range**: ${Math.min(...overalls)} – ${Math.max(...overalls)}`);
        lines.push(`- **Rating**: ${ratingLabel(avg(overalls))}`);
        lines.push('');

        // Per-dimension averages
        lines.push('## Dimension Averages');
        lines.push('| Dimension | Average | Min | Max |');
        lines.push('|-----------|---------|-----|-----|');
        for (const dim of ['engagement', 'challengeBalance', 'competenceGrowth', 'pacing', 'excitement']) {
            const vals = scores.map(s => s[dim]).filter(v => v != null);
            if (vals.length > 0) {
                lines.push(`| ${dim} | ${avg(vals).toFixed(1)} | ${Math.min(...vals)} | ${Math.max(...vals)} |`);
            }
        }
        lines.push('');

        // Per-build breakdown
        const byBuild = {};
        for (const s of scores) {
            if (!byBuild[s.build]) byBuild[s.build] = [];
            byBuild[s.build].push(s.overall);
        }
        if (Object.keys(byBuild).length > 1) {
            lines.push('## Fun Score by Build Archetype');
            lines.push('| Build | Sessions | Avg Score | Rating |');
            lines.push('|-------|----------|-----------|--------|');
            for (const [build, vals] of Object.entries(byBuild)) {
                const a = avg(vals);
                lines.push(`| ${build} | ${vals.length} | ${a.toFixed(1)} | ${ratingLabel(a)} |`);
            }
            lines.push('');
        }

        // Collect all hotspots across sessions
        const allHotspots = [];
        for (const s of sessions) {
            if (s.funScore?.hotspots) {
                for (const h of s.funScore.hotspots) {
                    allHotspots.push(h);
                }
            }
        }
        if (allHotspots.length > 0) {
            // Count hotspot frequency by wave
            const hotspotFreq = {};
            for (const h of allHotspots) {
                const key = `wave_${h.wave}_${h.dimension}`;
                if (!hotspotFreq[key]) hotspotFreq[key] = { ...h, count: 0 };
                hotspotFreq[key].count++;
            }
            const sorted = Object.values(hotspotFreq).sort((a, b) => b.count - a.count);

            lines.push('## Recurring Hotspots');
            lines.push('| Wave | Dimension | Occurrences | Diagnosis |');
            lines.push('|------|-----------|-------------|-----------|');
            for (const h of sorted.slice(0, 10)) {
                lines.push(`| ${h.wave} | ${h.dimension} | ${h.count}/${sessions.length} | ${h.diagnosis} |`);
            }
            lines.push('');
        }

        // Collect all recommendations
        const allRecs = [];
        for (const s of sessions) {
            if (s.funScore?.recommendations) {
                for (const r of s.funScore.recommendations) {
                    allRecs.push(r);
                }
            }
        }
        if (allRecs.length > 0) {
            const recFreq = {};
            for (const r of allRecs) {
                if (!recFreq[r.suggestion]) recFreq[r.suggestion] = { ...r, count: 0 };
                recFreq[r.suggestion].count++;
            }
            const sortedRecs = Object.values(recFreq).sort((a, b) => b.count - a.count);

            lines.push('## Top Recommendations');
            for (let i = 0; i < Math.min(8, sortedRecs.length); i++) {
                const r = sortedRecs[i];
                lines.push(`${i + 1}. **[${r.dimension}]** ${r.suggestion} *(${r.count}/${sessions.length} sessions, impact: ${r.expectedImpact})*`);
            }
            lines.push('');
        }

        writeFileSync(join(reportsDir, 'fun-report-aggregate.md'), lines.join('\n'));
        writeFileSync(
            join(reportsDir, 'fun-report-aggregate.json'),
            JSON.stringify({ scores, byBuild, hotspots: allHotspots }, null, 2)
        );
    }

    // ── Internal ────────────────────────────────────────────

    static _buildMarkdown(fun, waveBuckets, meta) {
        const lines = [
            `# Fun Report — ${meta.sessionId || 'session'}`,
            '',
            `**Date**: ${meta.startTime || new Date().toISOString()}`,
            `**Build**: ${meta.config?.buildArchetype || 'unknown'} | **Skill**: ${meta.config?.skillLevel || 'unknown'}`,
            `**Duration**: ${((meta.durationMs || 0) / 1000).toFixed(0)}s`,
            '',
            `## Overall Fun Score: ${fun.overall}/100 — ${fun.rating}`,
            '',
            '## Dimension Scores',
            '| Dimension | Score | Rating |',
            '|-----------|-------|--------|',
        ];

        for (const [dim, data] of Object.entries(fun.dimensions)) {
            const score = data.score != null ? data.score : '—';
            const rating = data.score != null ? ratingLabel(data.score) : '—';
            lines.push(`| ${dim} | ${score} | ${rating} |`);
        }
        lines.push('');

        // Issues per dimension
        lines.push('## Issues');
        for (const [dim, data] of Object.entries(fun.dimensions)) {
            if (data.issues && data.issues.length > 0) {
                lines.push(`### ${dim}`);
                for (const issue of data.issues) {
                    lines.push(`- ${issue}`);
                }
                lines.push('');
            }
        }

        // Hotspots
        if (fun.hotspots && fun.hotspots.length > 0) {
            lines.push('## Hotspots (Problem Waves)');
            lines.push('| Wave | Dimension | Score | Diagnosis |');
            lines.push('|------|-----------|-------|-----------|');
            for (const h of fun.hotspots) {
                lines.push(`| ${h.wave} | ${h.dimension} | ${h.score} | ${h.diagnosis} |`);
            }
            lines.push('');
        }

        // Per-wave data table
        if (waveBuckets && waveBuckets.length > 0) {
            lines.push('## Per-Wave Metrics');
            lines.push('| Wave | Duration | Action Density | Damage Ratio | Health Floor | Near Misses | Kills | Deaths | Idle% |');
            lines.push('|------|----------|---------------|-------------|-------------|-------------|-------|--------|-------|');
            for (const w of waveBuckets) {
                lines.push(`| ${w.wave} | ${w.durationS.toFixed(1)}s | ${w.actionDensity.toFixed(2)} | ${w.damageRatio.toFixed(1)} | ${(w.healthFloor * 100).toFixed(0)}% | ${w.nearMisses} | ${w.kills} | ${w.deaths} | ${(w.idleRatio * 100).toFixed(0)}% |`);
            }
            lines.push('');
        }

        // Recommendations
        if (fun.recommendations && fun.recommendations.length > 0) {
            lines.push('## Recommendations');
            for (const r of fun.recommendations) {
                lines.push(`${r.priority}. **[${r.dimension}]** ${r.suggestion} *(impact: ${r.expectedImpact})*`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }
}

function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function ratingLabel(score) {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 55) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Critical';
}
