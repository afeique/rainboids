/**
 * AI QA Bot — Main Bot Orchestrator
 *
 * Wires together all layers (motor, perception, strategy, detection, analysis)
 * and runs a complete play session. This is the primary entry point for
 * programmatic usage.
 *
 * Usage:
 *   const bot = new QABot(page, config);
 *   const report = await bot.run();
 */

import { buildConfig } from './core/config.js';
import { SessionLogger } from './core/session-logger.js';
import { StateReader } from './perception/state-reader.js';
import { RainboidsDriver, GenericDriver } from './motor/rainboids-driver.js';
import { CombatAI } from './strategy/combat-ai.js';
import { ShopAI } from './strategy/shop-ai.js';
import { InvariantChecker } from './detection/invariant-checker.js';
import { StuckDetector } from './detection/stuck-detector.js';
import { PerformanceMonitor } from './detection/performance-monitor.js';
import { ReportGenerator } from './analysis/report-generator.js';
import { getAdapter } from './adapters/index.js';
import { join } from 'path';

export class QABot {
    constructor(page, userConfig = {}) {
        this.page = page;
        this.config = buildConfig(userConfig);
        this.sessionId = this._generateSessionId();

        // Core components
        this.logger = new SessionLogger(this.sessionId, this.config);
        this.stateReader = new StateReader(page);
        this.adapter = getAdapter(this.config.gameAdapter);

        // Motor
        if (this.adapter.driverType === 'api-direct') {
            this.driver = new RainboidsDriver(page);
        } else {
            this.driver = new GenericDriver(page, this.adapter.controls);
        }

        // Strategy
        this.combatAI = new CombatAI(this.driver, this.config);
        this.shopAI = new ShopAI(this.driver, this.logger, this.config);

        // Detection
        this.invariantChecker = new InvariantChecker(this.logger);
        this.stuckDetector = new StuckDetector(this.logger, this.config);
        this.perfMonitor = new PerformanceMonitor(page, this.logger, this.config);

        // Analysis
        this.reportGen = new ReportGenerator(this.config.reportsDir);

        // Internal state
        this._running = false;
        this._tickCount = 0;
        this._lastInvariantCheck = 0;
        this._lastPerfSample = 0;
        this._lastScreenshot = 0;
        this._jsErrors = [];

        // Callbacks for external hooks (LLM or human)
        this._onTick = null;
        this._onBug = null;
        this._onEvent = null;
        this._onSessionEnd = null;
    }

    // ── Hooks API ────────────────────────────────────────────────
    // These enable integration with an automated tuning loop or
    // human-in-the-loop workflow.

    /** Called every tick with (state, events, tickCount). */
    onTick(fn) { this._onTick = fn; return this; }

    /** Called when a bug is detected with (bug). */
    onBug(fn) { this._onBug = fn; return this; }

    /** Called on game events with (event). */
    onEvent(fn) { this._onEvent = fn; return this; }

    /** Called when session ends with (sessionReport). */
    onSessionEnd(fn) { this._onSessionEnd = fn; return this; }

    // ── Main Run Loop ────────────────────────────────────────────

    /**
     * Run a complete play session.
     * @returns {object} Session report JSON
     */
    async run() {
        this._running = true;
        this._setupErrorCapture();

        try {
            // Navigate and start game
            await this.page.goto(this.adapter.url);
            await this.adapter.startSequence(this.page);
            this.logger.logEvent('session_start');

            const startTime = Date.now();
            const endTime = startTime + this.config.sessionDurationMs;

            // Main loop
            while (this._running && Date.now() < endTime) {
                await this._tick();
                await this._sleep(this.config.tickIntervalMs);
            }
        } catch (err) {
            this.logger.logBug({
                id: 'bot_crash',
                title: `Bot crashed: ${err.message}`,
                category: 'internal',
                severity: 'critical',
                details: err.stack,
            });
        } finally {
            await this._cleanup();
        }

        // Generate reports
        const report = this.logger.toJSON();
        report.jsErrors = this._jsErrors;
        report.performance = this.perfMonitor.getStats();

        // Save to disk
        const sessionDir = this.logger.save(this.config.reportsDir);
        report.sessionDir = sessionDir;

        // Generate LLM analysis prompt
        const llmPrompt = this.reportGen.generateLLMAnalysisPrompt(report);
        const { writeFileSync } = await import('fs');
        writeFileSync(join(sessionDir, 'llm-analysis-prompt.md'), llmPrompt);

        if (this._onSessionEnd) {
            await this._onSessionEnd(report);
        }

        return report;
    }

    /**
     * Stop the bot mid-session.
     */
    stop() {
        this._running = false;
    }

    // ── Internal Tick ────────────────────────────────────────────

    async _tick() {
        this._tickCount++;
        const now = Date.now();

        // Read state + events
        const { state, events } = await this.stateReader.readWithEvents();
        if (!state) return;

        // Process events
        for (const event of events) {
            this._handleEvent(event, state);
            if (this._onEvent) await this._onEvent(event);
        }

        // Game over — stop
        if (state.gameState === 'GAME_OVER') {
            this.logger.logGameOver(state.wave, {
                health: state.player?.health,
                money: state.money,
                lives: state.lives,
            });
            this._running = false;
            return;
        }

        // Shop state — delegate to shop AI
        if (state.gameState === 'SHOP' && this.config.useShop) {
            await this.shopAI.visit(state);
            return;
        }

        // Wave transition — open shop if we have money/SP to spend.
        // Note: For real players, shop is accessed via pause menu. The bot
        // calls openShop() directly which works from any gameplay state.
        if (state.gameState === 'WAVE_TRANSITION' && this.config.useShop) {
            const canSpend = state.money > 0 || (state.player?.skillPoints || 0) > 0;
            if (canSpend) {
                await this.driver.openShop();
                const shopState = await this.stateReader.read();
                if (shopState?.gameState === 'SHOP') {
                    await this.shopAI.visit(shopState);
                }
            }
            return;
        }

        // Playing state — combat AI
        if (state.gameState === 'PLAYING') {
            const inputs = this.combatAI.computeInputs(state);
            if (inputs) {
                await this.driver.setInputs(inputs);
            }
        }

        // Bug detection (throttled)
        if (this.config.enableInvariantChecks &&
            now - this._lastInvariantCheck > this.config.invariantCheckIntervalMs) {
            const violations = this.invariantChecker.check(state);
            for (const bug of violations) {
                if (this._onBug) await this._onBug(bug);
            }
            this._lastInvariantCheck = now;
        }

        // Stuck detection
        if (this.config.enableStuckDetection) {
            this.stuckDetector.check(state);
        }

        // Performance monitoring (throttled)
        if (this.config.enablePerformanceMonitoring &&
            now - this._lastPerfSample > this.config.fpsSampleIntervalMs) {
            await this.perfMonitor.sample(state);
            this._lastPerfSample = now;
        }

        // Periodic screenshots
        if (this.config.screenshotIntervalMs &&
            now - this._lastScreenshot > this.config.screenshotIntervalMs) {
            await this._takeScreenshot(state, 'periodic');
            this._lastScreenshot = now;
        }

        // Periodic state snapshots (every 5s)
        if (this._tickCount % 50 === 0) {
            this.logger.logStateSnapshot({
                wave: state.wave,
                gameState: state.gameState,
                health: state.player?.health,
                money: state.money,
                enemies: state.entities.enemies.length,
                asteroids: state.entities.asteroids.length,
            });
        }

        if (this._onTick) {
            await this._onTick(state, events, this._tickCount);
        }
    }

    _handleEvent(event, state) {
        switch (event.type) {
            case 'wave_start':
                this.logger.logWaveStart(event.wave);
                break;
            case 'shop_open':
                this.logger.logShopOpen(event.wave || state.wave);
                break;
            case 'shop_close':
                this.logger.logShopClose(event.wave || state.wave);
                break;
            case 'damage_taken':
                this.logger.logDamageTaken(event.amount, 'unknown', event.healthAfter);
                break;
            case 'death':
                this.logger.logDeath(event.wave);
                if (this.config.screenshotOnBug) {
                    this._takeScreenshot(state, 'death').catch(() => {});
                }
                break;
            case 'enemy_killed':
                this.logger.logKill(event.enemyType, state.wave);
                break;
            case 'money_earned':
                this.logger.counters.totalMoneyEarned += event.amount;
                break;
            case 'sp_earned':
                this.logger.counters.totalSPEarned += event.amount;
                break;
            case 'level_up':
                this.logger.logEvent('level_up', { level: event.level });
                break;
            case 'game_over':
                this.logger.logGameOver(event.wave, {});
                this._running = false;
                break;
        }
    }

    async _takeScreenshot(state, context) {
        try {
            const filename = `screenshot-${this._tickCount}-${context}.png`;
            const dir = join(this.config.reportsDir, `session-${this.sessionId}`);
            const { mkdirSync, existsSync } = await import('fs');
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            const filepath = join(dir, filename);
            await this.page.screenshot({ path: filepath });
            this.logger.logScreenshot(filepath, context);
        } catch {
            // Screenshot failure is non-critical
        }
    }

    _setupErrorCapture() {
        this.page.on('pageerror', (err) => {
            const msg = err.message || String(err);
            this._jsErrors.push({ ts: Date.now() - this.logger.startTime, message: msg });

            // Ignore known benign errors
            if (msg.includes('sfxr') || msg.includes('AudioContext') || msg.includes('net::ERR')) return;

            this.logger.logBug({
                id: `js_error:${msg.slice(0, 50)}`,
                title: `JS Error: ${msg.slice(0, 100)}`,
                category: 'crash',
                severity: 'high',
                details: msg,
            });
        });

        // Capture console warnings/errors from the game (e.g., auto-fire watchdog)
        this.page.on('console', (consoleMsg) => {
            const type = consoleMsg.type();
            if (type !== 'warning' && type !== 'error') return;
            const text = consoleMsg.text();
            if (text.includes('AUTO-FIRE WATCHDOG')) {
                console.log(`  [WATCHDOG] ${text}`);
                this.logger.logBug({
                    id: 'auto_fire_watchdog',
                    title: 'Auto-fire watchdog triggered — primary fire stalled',
                    category: 'state_invariant',
                    severity: 'high',
                    details: text,
                });
            }
        });
    }

    async _cleanup() {
        try {
            await this.driver.releaseAll();
        } catch {
            // Page may be closed
        }
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _generateSessionId() {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
        return `${date}-${time}`;
    }
}
