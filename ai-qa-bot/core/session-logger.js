/**
 * AI QA Bot — Session Logger
 *
 * Records all events, decisions, bugs, and metrics during a play session.
 * Outputs structured JSON consumable by analysis tools or LLMs.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export class SessionLogger {
    constructor(sessionId, config) {
        this.sessionId = sessionId;
        this.config = config;
        this.startTime = Date.now();

        // Event streams
        this.events = [];        // Game events (kills, damage, wave changes, etc.)
        this.decisions = [];     // Bot decisions (shop purchases, skill usage, etc.)
        this.bugs = [];          // Detected bugs
        this.metrics = [];       // Performance metrics (FPS, entity counts)
        this.screenshots = [];   // Screenshot paths with timestamps
        this.stateSnapshots = []; // Periodic full state snapshots

        // Running counters
        this.counters = {
            totalKills: 0,
            killsByType: {},
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            deaths: 0,
            deathWaves: [],
            totalMoneyEarned: 0,
            totalMoneySpent: 0,
            totalSPEarned: 0,
            totalSPSpent: 0,
            upgradesPurchased: [],
            weaponsBought: [],
            skillsBought: [],
            skillActivations: {},
            bulletsShot: 0,
            bulletsHit: 0,
            wavesReached: 0,
            shopVisits: 0,
            shopTimeMs: 0,
        };

        this._shopEnteredAt = null;
    }

    /** Relative timestamp from session start */
    _ts() {
        return Date.now() - this.startTime;
    }

    // ── Game Events ──────────────────────────────────────────────

    logEvent(type, data = {}) {
        this.events.push({ ts: this._ts(), type, ...data });
    }

    logKill(enemyType, wave) {
        this.counters.totalKills++;
        this.counters.killsByType[enemyType] = (this.counters.killsByType[enemyType] || 0) + 1;
        this.logEvent('kill', { enemyType, wave });
    }

    logDamageDealt(amount, target) {
        this.counters.totalDamageDealt += amount;
        this.logEvent('damage_dealt', { amount, target });
    }

    logDamageTaken(amount, source, healthAfter) {
        this.counters.totalDamageTaken += amount;
        this.logEvent('damage_taken', { amount, source, healthAfter });
    }

    logDeath(wave) {
        this.counters.deaths++;
        this.counters.deathWaves.push(wave);
        this.logEvent('death', { wave });
    }

    logWaveStart(wave) {
        this.counters.wavesReached = Math.max(this.counters.wavesReached, wave);
        this.logEvent('wave_start', { wave });
    }

    logWaveEnd(wave) {
        this.logEvent('wave_end', { wave });
    }

    logShopOpen(wave) {
        this.counters.shopVisits++;
        this._shopEnteredAt = Date.now();
        this.logEvent('shop_open', { wave });
    }

    logShopClose(wave) {
        if (this._shopEnteredAt) {
            this.counters.shopTimeMs += Date.now() - this._shopEnteredAt;
            this._shopEnteredAt = null;
        }
        this.logEvent('shop_close', { wave });
    }

    logGameOver(wave, finalState) {
        this.logEvent('game_over', { wave, ...finalState });
    }

    // ── Bot Decisions ────────────────────────────────────────────

    logDecision(type, data = {}) {
        this.decisions.push({ ts: this._ts(), type, ...data });
    }

    logPurchase(itemId, cost, currency) {
        this.counters.upgradesPurchased.push(itemId);
        if (currency === 'COINS') this.counters.totalMoneySpent += cost;
        else if (currency === 'SP') this.counters.totalSPSpent += cost;
        this.logDecision('purchase', { itemId, cost, currency });
    }

    logWeaponBuy(weaponId, weaponType) {
        this.counters.weaponsBought.push(weaponId);
        this.logDecision('weapon_buy', { weaponId, weaponType });
    }

    logSkillBuy(skillId) {
        this.counters.skillsBought.push(skillId);
        this.logDecision('skill_buy', { skillId });
    }

    logSkillActivation(skillId) {
        this.counters.skillActivations[skillId] = (this.counters.skillActivations[skillId] || 0) + 1;
        this.logDecision('skill_activate', { skillId });
    }

    // ── Bug Detection ────────────────────────────────────────────

    logBug(bug) {
        this.bugs.push({ ts: this._ts(), ...bug });
    }

    // ── Metrics ──────────────────────────────────────────────────

    logMetrics(data) {
        this.metrics.push({ ts: this._ts(), ...data });
    }

    logStateSnapshot(snapshot) {
        this.stateSnapshots.push({ ts: this._ts(), ...snapshot });
    }

    logScreenshot(path, context = '') {
        this.screenshots.push({ ts: this._ts(), path, context });
    }

    // ── Export ────────────────────────────────────────────────────

    /**
     * Build the complete session report object.
     */
    toJSON() {
        const totalDuration = Date.now() - this.startTime;
        return {
            meta: {
                sessionId: this.sessionId,
                startTime: new Date(this.startTime).toISOString(),
                durationMs: totalDuration,
                config: {
                    buildArchetype: this.config.buildArchetype,
                    skillLevel: this.config.skillLevel,
                    sessionDurationMs: this.config.sessionDurationMs,
                    gameAdapter: this.config.gameAdapter,
                },
            },
            summary: {
                ...this.counters,
                totalDurationMs: totalDuration,
                bugsFound: this.bugs.length,
                bugsBySeverity: this._bugsBySeverity(),
            },
            bugs: this.bugs,
            events: this.events,
            decisions: this.decisions,
            metrics: this.metrics,
            screenshots: this.screenshots,
        };
    }

    _bugsBySeverity() {
        const counts = { critical: 0, high: 0, medium: 0, low: 0 };
        for (const bug of this.bugs) {
            counts[bug.severity] = (counts[bug.severity] || 0) + 1;
        }
        return counts;
    }

    /**
     * Write session data to disk.
     * @param {string} baseDir - Reports directory
     * @returns {string} Path to the session directory
     */
    save(baseDir) {
        const dirName = `session-${this.sessionId}`;
        const sessionDir = join(baseDir, dirName);
        if (!existsSync(sessionDir)) {
            mkdirSync(sessionDir, { recursive: true });
        }

        const data = this.toJSON();

        // Full session data
        writeFileSync(join(sessionDir, 'session.json'), JSON.stringify(data, null, 2));

        // Bugs only (for quick scanning)
        if (this.bugs.length > 0) {
            writeFileSync(join(sessionDir, 'bugs.json'), JSON.stringify(this.bugs, null, 2));
        }

        // Summary counters
        writeFileSync(join(sessionDir, 'summary.json'), JSON.stringify(data.summary, null, 2));

        // Human-readable summary
        writeFileSync(join(sessionDir, 'summary.md'), this._buildMarkdownSummary(data));

        return sessionDir;
    }

    _buildMarkdownSummary(data) {
        const s = data.summary;
        const m = data.meta;
        const lines = [
            `# Session Report — ${m.sessionId}`,
            '',
            `**Date**: ${m.startTime}`,
            `**Duration**: ${(m.durationMs / 1000).toFixed(1)}s`,
            `**Build**: ${m.config.buildArchetype} | **Skill**: ${m.config.skillLevel}`,
            '',
            '## Results',
            `- Waves reached: ${s.wavesReached}`,
            `- Deaths: ${s.deaths}${s.deathWaves.length ? ` (waves: ${s.deathWaves.join(', ')})` : ''}`,
            `- Total kills: ${s.totalKills}`,
            `- Damage dealt: ${s.totalDamageDealt} | Damage taken: ${s.totalDamageTaken}`,
            `- Money earned: ${s.totalMoneyEarned} | spent: ${s.totalMoneySpent}`,
            `- SP earned: ${s.totalSPEarned} | spent: ${s.totalSPSpent}`,
            `- Shop visits: ${s.shopVisits} (${(s.shopTimeMs / 1000).toFixed(1)}s total)`,
            '',
            '## Kills by Type',
            ...Object.entries(s.killsByType).map(([t, c]) => `- ${t}: ${c}`),
            '',
            '## Upgrades Purchased',
            ...s.upgradesPurchased.map(u => `- ${u}`),
            '',
            `## Bugs Found: ${s.bugsFound}`,
            ...Object.entries(s.bugsBySeverity)
                .filter(([, c]) => c > 0)
                .map(([sev, c]) => `- ${sev}: ${c}`),
            '',
        ];

        if (data.bugs.length > 0) {
            lines.push('### Bug Details');
            for (const bug of data.bugs) {
                lines.push(`\n#### [${bug.severity.toUpperCase()}] ${bug.title}`);
                lines.push(`- **Category**: ${bug.category}`);
                lines.push(`- **Time**: ${(bug.ts / 1000).toFixed(1)}s`);
                if (bug.details) lines.push(`- **Details**: ${bug.details}`);
            }
        }

        return lines.join('\n');
    }
}
