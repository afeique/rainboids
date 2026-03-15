#!/usr/bin/env node

/**
 * AI QA Bot — CLI Runner
 *
 * Usage:
 *   node ai-qa-bot/run.js                           # Default 10-min session
 *   node ai-qa-bot/run.js --duration 5              # 5-minute session
 *   node ai-qa-bot/run.js --build dps               # DPS build archetype
 *   node ai-qa-bot/run.js --skill novice            # Novice skill simulation
 *   node ai-qa-bot/run.js --headed                  # Show browser window
 *   node ai-qa-bot/run.js --sessions 5 --build all  # 5 sessions, one per build
 *   node ai-qa-bot/run.js --bugs-only               # Short session focused on bugs
 *   node ai-qa-bot/run.js --report                  # Generate aggregate report from existing sessions
 */

import { chromium } from '@playwright/test';
import { QABot } from './bot.js';
import { ReportGenerator } from './analysis/report-generator.js';
import { buildConfig } from './core/config.js';
import { resolve } from 'path';

// ── Parse CLI args ───────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name, defaultVal) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return defaultVal;
    if (typeof defaultVal === 'boolean') return true;
    return args[idx + 1] || defaultVal;
}

const duration = parseInt(getArg('duration', '10'), 10);
const buildArchetype = getArg('build', 'balanced');
const skillLevel = getArg('skill', 'advanced');
const headed = getArg('headed', false);
const sessionsCount = parseInt(getArg('sessions', '1'), 10);
const bugsOnly = getArg('bugs-only', false);
const reportOnly = getArg('report', false);
const reportsDir = resolve(getArg('reports-dir', 'ai-qa-bot/reports'));

// ── Report-only mode ─────────────────────────────────────────────

if (reportOnly) {
    console.log('Generating aggregate reports from existing sessions...');
    const reportGen = new ReportGenerator(reportsDir);
    const sessions = reportGen.loadAllSessions();
    if (sessions.length === 0) {
        console.log('No sessions found. Run a session first.');
        process.exit(1);
    }
    console.log(`Found ${sessions.length} sessions.`);
    const bugReportPath = reportGen.generateBugReport(sessions);
    console.log(`Bug report: ${bugReportPath}`);
    const balanceReportPath = reportGen.generateBalanceReport(sessions);
    console.log(`Balance report: ${balanceReportPath}`);
    process.exit(0);
}

// ── Determine build archetypes to run ────────────────────────────

const ALL_BUILDS = ['dps', 'tank', 'balanced', 'economy', 'random'];
let buildsToRun;
if (buildArchetype === 'all') {
    buildsToRun = ALL_BUILDS;
} else {
    buildsToRun = Array(sessionsCount).fill(buildArchetype);
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
    console.log(`\n=== AI QA Bot ===`);
    console.log(`Sessions: ${buildsToRun.length}`);
    console.log(`Duration: ${bugsOnly ? 3 : duration} min each`);
    console.log(`Builds: ${[...new Set(buildsToRun)].join(', ')}`);
    console.log(`Skill level: ${skillLevel}`);
    console.log(`Headed: ${headed}`);
    console.log(`Reports: ${reportsDir}`);
    console.log('');

    const allReports = [];

    for (let i = 0; i < buildsToRun.length; i++) {
        const build = buildsToRun[i];
        console.log(`--- Session ${i + 1}/${buildsToRun.length} (${build}) ---`);

        const config = buildConfig({
            sessionDurationMs: (bugsOnly ? 3 : duration) * 60 * 1000,
            buildArchetype: build,
            skillLevel,
            headless: !headed,
            reportsDir,
        });

        // Launch browser
        const browser = await chromium.launch({
            headless: config.headless,
        });
        const context = await browser.newContext({
            viewport: config.viewport,
        });
        const page = await context.newPage();

        try {
            const bot = new QABot(page, config);

            // Hook: print bugs as they're found
            bot.onBug((bug) => {
                console.log(`  [BUG] [${bug.severity}] ${bug.title}`);
            });

            // Hook: print wave progress
            bot.onEvent((event) => {
                if (event.type === 'wave_start') {
                    console.log(`  Wave ${event.wave} started`);
                }
                if (event.type === 'death') {
                    console.log(`  Player died at wave ${event.wave}`);
                }
                if (event.type === 'game_over') {
                    console.log(`  Game Over at wave ${event.wave}`);
                }
            });

            const report = await bot.run();
            allReports.push(report);

            // Print session summary
            const s = report.summary;
            console.log(`  Results: ${s.wavesReached} waves, ${s.totalKills} kills, ${s.deaths} deaths, ${s.bugsFound} bugs`);
            console.log(`  Saved to: ${report.sessionDir}`);
            console.log('');
        } catch (err) {
            console.error(`  Session failed: ${err.message}`);
        } finally {
            await browser.close();
        }
    }

    // Generate aggregate reports if multiple sessions
    if (allReports.length > 1) {
        console.log('--- Generating aggregate reports ---');
        const reportGen = new ReportGenerator(reportsDir);
        const bugReportPath = reportGen.generateBugReport(allReports);
        console.log(`Bug report: ${bugReportPath}`);
        const balanceReportPath = reportGen.generateBalanceReport(allReports);
        console.log(`Balance report: ${balanceReportPath}`);
    }

    // Also generate the LLM prompt for the latest session
    if (allReports.length > 0) {
        const latest = allReports[allReports.length - 1];
        console.log(`\nLLM analysis prompt saved to: ${latest.sessionDir}/llm-analysis-prompt.md`);
        console.log('Feed this to Claude or another LLM for qualitative gameplay analysis.\n');
    }

    console.log('=== Done ===\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
