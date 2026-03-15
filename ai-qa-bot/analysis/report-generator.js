/**
 * AI QA Bot — Report Generator
 *
 * Generates structured reports from session data.
 * Output formats: JSON (machine-readable) and Markdown (human/LLM-readable).
 *
 * Reports are designed to be consumed by:
 * 1. A human developer reviewing bugs and balance
 * 2. An LLM (e.g., Claude Code) in an automated tuning loop
 * 3. A CI pipeline for regression detection
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export class ReportGenerator {
    constructor(reportsDir) {
        this.reportsDir = reportsDir;
        if (!existsSync(reportsDir)) {
            mkdirSync(reportsDir, { recursive: true });
        }
    }

    /**
     * Generate a bug report from one or more sessions.
     * @param {Array} sessions - Array of session JSON objects
     * @returns {string} Path to generated report
     */
    generateBugReport(sessions) {
        const allBugs = [];
        for (const session of sessions) {
            for (const bug of session.bugs || []) {
                allBugs.push({ ...bug, sessionId: session.meta.sessionId });
            }
        }

        // Deduplicate by bug ID
        const uniqueBugs = new Map();
        for (const bug of allBugs) {
            const key = bug.id || bug.title;
            if (!uniqueBugs.has(key)) {
                uniqueBugs.set(key, { ...bug, occurrences: 1, sessions: [bug.sessionId] });
            } else {
                const existing = uniqueBugs.get(key);
                existing.occurrences++;
                if (!existing.sessions.includes(bug.sessionId)) {
                    existing.sessions.push(bug.sessionId);
                }
            }
        }

        const bugs = [...uniqueBugs.values()].sort((a, b) => {
            const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return (sevOrder[a.severity] || 4) - (sevOrder[b.severity] || 4);
        });

        // Build markdown
        const lines = [
            '# Bug Report',
            '',
            `**Sessions analyzed**: ${sessions.length}`,
            `**Unique bugs found**: ${bugs.length}`,
            `**Date**: ${new Date().toISOString().split('T')[0]}`,
            '',
        ];

        const bySeverity = { critical: [], high: [], medium: [], low: [] };
        for (const bug of bugs) {
            (bySeverity[bug.severity] || bySeverity.low).push(bug);
        }

        for (const [sev, bugList] of Object.entries(bySeverity)) {
            lines.push(`## ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${bugList.length})`);
            if (bugList.length === 0) {
                lines.push('(none)', '');
                continue;
            }
            for (const bug of bugList) {
                lines.push(`### ${bug.title}`);
                lines.push(`- **Category**: ${bug.category}`);
                lines.push(`- **Occurrences**: ${bug.occurrences} across ${bug.sessions.length} session(s)`);
                if (bug.wave !== undefined) lines.push(`- **Wave**: ${bug.wave}`);
                if (bug.details) lines.push(`- **Details**: ${bug.details}`);
                lines.push('');
            }
        }

        // Write
        const reportPath = join(this.reportsDir, 'bug-report.md');
        writeFileSync(reportPath, lines.join('\n'));

        // Also write JSON for machine consumption
        writeFileSync(
            join(this.reportsDir, 'bug-report.json'),
            JSON.stringify({ bugs, meta: { sessions: sessions.length, date: new Date().toISOString() } }, null, 2)
        );

        return reportPath;
    }

    /**
     * Generate a balance report from multiple sessions.
     * @param {Array} sessions - Array of session JSON objects
     * @returns {string} Path to generated report
     */
    generateBalanceReport(sessions) {
        const stats = {
            totalSessions: sessions.length,
            wavesReached: [],
            survivalTimes: [],
            deaths: [],
            buildArchetypes: {},
            upgradeFrequency: {},
            weaponsBought: {},
            killsByType: {},
            totalMoneyEarned: [],
            totalMoneySpent: [],
        };

        for (const session of sessions) {
            const s = session.summary;
            stats.wavesReached.push(s.wavesReached);
            stats.survivalTimes.push(s.totalDurationMs);
            stats.deaths.push(s.deaths);

            const arch = session.meta.config.buildArchetype;
            if (!stats.buildArchetypes[arch]) {
                stats.buildArchetypes[arch] = { sessions: 0, avgWaves: 0, avgDeaths: 0, totalWaves: 0, totalDeaths: 0 };
            }
            stats.buildArchetypes[arch].sessions++;
            stats.buildArchetypes[arch].totalWaves += s.wavesReached;
            stats.buildArchetypes[arch].totalDeaths += s.deaths;

            for (const upgrade of s.upgradesPurchased) {
                stats.upgradeFrequency[upgrade] = (stats.upgradeFrequency[upgrade] || 0) + 1;
            }
            for (const weapon of s.weaponsBought) {
                stats.weaponsBought[weapon] = (stats.weaponsBought[weapon] || 0) + 1;
            }
            for (const [type, count] of Object.entries(s.killsByType)) {
                stats.killsByType[type] = (stats.killsByType[type] || 0) + count;
            }
            stats.totalMoneyEarned.push(s.totalMoneyEarned);
            stats.totalMoneySpent.push(s.totalMoneySpent);
        }

        // Compute archetype averages
        for (const arch of Object.values(stats.buildArchetypes)) {
            arch.avgWaves = (arch.totalWaves / arch.sessions).toFixed(1);
            arch.avgDeaths = (arch.totalDeaths / arch.sessions).toFixed(1);
        }

        // Build markdown
        const lines = [
            '# Balance Report',
            '',
            `**Sessions**: ${stats.totalSessions}`,
            `**Date**: ${new Date().toISOString().split('T')[0]}`,
            '',
            '## Survival Statistics',
            `- Average waves reached: ${avg(stats.wavesReached).toFixed(1)}`,
            `- Average deaths: ${avg(stats.deaths).toFixed(1)}`,
            `- Max waves: ${Math.max(...stats.wavesReached)}`,
            `- Average session duration: ${(avg(stats.survivalTimes) / 1000).toFixed(0)}s`,
            '',
            '## Build Archetype Performance',
            '| Archetype | Sessions | Avg Waves | Avg Deaths |',
            '|-----------|----------|-----------|------------|',
            ...Object.entries(stats.buildArchetypes).map(([name, data]) =>
                `| ${name} | ${data.sessions} | ${data.avgWaves} | ${data.avgDeaths} |`
            ),
            '',
            '## Upgrade Purchase Frequency',
            '| Upgrade | Times Bought |',
            '|---------|-------------|',
            ...Object.entries(stats.upgradeFrequency)
                .sort((a, b) => b[1] - a[1])
                .map(([id, count]) => `| ${id} | ${count} |`),
            '',
            '## Weapons Purchased',
            ...Object.entries(stats.weaponsBought)
                .sort((a, b) => b[1] - a[1])
                .map(([id, count]) => `- ${id}: ${count} times`),
            '',
            '## Enemy Kill Distribution',
            '| Enemy Type | Total Kills |',
            '|-----------|-------------|',
            ...Object.entries(stats.killsByType)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => `| ${type} | ${count} |`),
            '',
            '## Economy',
            `- Average money earned: ${avg(stats.totalMoneyEarned).toFixed(0)}`,
            `- Average money spent: ${avg(stats.totalMoneySpent).toFixed(0)}`,
            `- Average unspent money: ${(avg(stats.totalMoneyEarned) - avg(stats.totalMoneySpent)).toFixed(0)}`,
            '',
        ];

        const reportPath = join(this.reportsDir, 'balance-report.md');
        writeFileSync(reportPath, lines.join('\n'));
        writeFileSync(
            join(this.reportsDir, 'balance-report.json'),
            JSON.stringify(stats, null, 2)
        );

        return reportPath;
    }

    /**
     * Generate LLM-consumable analysis prompt from session data.
     * This can be piped to Claude or another LLM for qualitative analysis.
     * @param {object} session - Single session JSON
     * @returns {string} Analysis prompt
     */
    generateLLMAnalysisPrompt(session) {
        const s = session.summary;
        const m = session.meta;

        return `You are a game design consultant analyzing a play session of "Rainboids", a browser-based arcade shooter with asteroids, enemy ships, a wave system, and a shop with upgrades/weapons/skills.

## Session Data
- Duration: ${(m.durationMs / 1000).toFixed(0)}s
- Build: ${m.config.buildArchetype}
- Waves reached: ${s.wavesReached}
- Deaths: ${s.deaths} (waves: ${s.deathWaves.join(', ') || 'none'})
- Total kills: ${s.totalKills}
- Damage dealt: ${s.totalDamageDealt} | Damage taken: ${s.totalDamageTaken}
- Money earned: ${s.totalMoneyEarned} | spent: ${s.totalMoneySpent}
- Upgrades purchased: ${s.upgradesPurchased.join(', ') || 'none'}
- Weapons bought: ${s.weaponsBought.join(', ') || 'none'}
- Skills bought: ${s.skillsBought.join(', ') || 'none'}
- Shop visits: ${s.shopVisits} (${(s.shopTimeMs / 1000).toFixed(1)}s total)

## Kills by Enemy Type
${Object.entries(s.killsByType).map(([t, c]) => `- ${t}: ${c}`).join('\n')}

## Bugs Found: ${s.bugsFound}
${session.bugs.map(b => `- [${b.severity}] ${b.title}: ${b.details || ''}`).join('\n') || 'None'}

## Key Events (first 50)
${session.events.slice(0, 50).map(e => `[${(e.ts / 1000).toFixed(1)}s] ${e.type}${e.wave !== undefined ? ` (wave ${e.wave})` : ''}${e.amount !== undefined ? ` amount=${e.amount}` : ''}`).join('\n')}

---

Analyze this session and provide:

1. **BUGS**: For each bug found, assess severity and suggest a fix approach
2. **PACING**: Was the action density consistent? Any boring stretches or overwhelming spikes?
3. **BALANCE**: Were upgrades/weapons meaningful? Any dominant or useless choices?
4. **ECONOMY**: Was money/SP flow appropriate? Could the player afford useful upgrades?
5. **DIFFICULTY**: Was the difficulty curve smooth? Any unfair spikes?
6. **SUGGESTIONS**: Top 5 specific, actionable improvements ranked by impact

Respond with structured JSON matching this schema:
{
  "bugs": [{ "title": "", "severity": "", "fix_approach": "" }],
  "pacing": { "rating": 1-10, "analysis": "", "issues": [] },
  "balance": { "rating": 1-10, "dominant_strategies": [], "underperforming": [], "analysis": "" },
  "economy": { "rating": 1-10, "analysis": "", "issues": [] },
  "difficulty": { "rating": 1-10, "curve_description": "", "spikes": [] },
  "suggestions": [{ "priority": 1, "title": "", "description": "", "impact": "high|medium|low" }]
}`;
    }

    /**
     * Load all session files from the reports directory.
     * @returns {Array} Session JSON objects
     */
    loadAllSessions() {
        const sessions = [];
        if (!existsSync(this.reportsDir)) return sessions;

        for (const entry of readdirSync(this.reportsDir)) {
            if (entry.startsWith('session-')) {
                const sessionPath = join(this.reportsDir, entry, 'session.json');
                if (existsSync(sessionPath)) {
                    try {
                        sessions.push(JSON.parse(readFileSync(sessionPath, 'utf8')));
                    } catch { /* skip corrupt files */ }
                }
            }
        }
        return sessions;
    }
}

function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}
