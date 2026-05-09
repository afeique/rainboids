/**
 * GameAI — a reactive AI playtester that drives the player via page.evaluate().
 *
 * All state mutations are applied atomically inside a single page.evaluate() call
 * so there are no race conditions between reading state and applying inputs.
 *
 * Usage:
 *   const ai = new GameAI(page);
 *   await ai.run(10_000); // pilot for 10 seconds
 *   await ai.stop();
 */

const DANGER_RADIUS = 180;   // px — dodge when a threat is closer than this
const WALL_MARGIN   = 100;   // px — start pushing away from walls at this distance
const TICK_INTERVAL = 100;   // ms between AI ticks

export class GameAI {
    /**
     * @param {import('@playwright/test').Page} page
     */
    constructor(page) {
        this.page    = page;
        this._timer  = null;
        this._running = false;
    }

    // -----------------------------------------------------------------------
    // Core tick — reads state + computes action + applies inputs atomically
    // -----------------------------------------------------------------------

    async tick() {
        return this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (!ge || !ge.player || ge.game.state !== 'PLAYING') return null;

            const player = ge.player;
            const input  = ge.inputHandler.input;
            const cx     = ge.gameField.width  / 2;
            const cy     = ge.gameField.height / 2;
            const px     = player.x;
            const py     = player.y;

            const DANGER  = 180;
            const MARGIN  = 100;
            const W       = ge.gameField.width;
            const H       = ge.gameField.height;

            // ── 1. Collect threats ────────────────────────────────────────
            const threats = [];

            for (const a of ge.asteroidPool.activeObjects) {
                if (!a.active) continue;
                threats.push({ x: a.x, y: a.y, type: 'asteroid' });
            }
            for (const e of ge.enemyPool.activeObjects) {
                if (!e.active) continue;
                threats.push({ x: e.x, y: e.y, type: 'enemy' });
            }
            for (const b of ge.enemyBulletPool.activeObjects) {
                if (!b.active) continue;
                threats.push({ x: b.x, y: b.y, type: 'bullet' });
            }

            // ── 2. Find nearest threat ────────────────────────────────────
            let nearestDist = Infinity;
            let nearestThreat = null;

            for (const t of threats) {
                const d = Math.hypot(t.x - px, t.y - py);
                if (d < nearestDist) {
                    nearestDist = d;
                    nearestThreat = t;
                }
            }

            // ── 3. Find nearest enemy/asteroid for aiming ─────────────────
            let aimTarget = null;
            let aimDist   = Infinity;

            for (const a of ge.asteroidPool.activeObjects) {
                if (!a.active) continue;
                const d = Math.hypot(a.x - px, a.y - py);
                if (d < aimDist) { aimDist = d; aimTarget = { x: a.x, y: a.y }; }
            }
            for (const e of ge.enemyPool.activeObjects) {
                if (!e.active) continue;
                const d = Math.hypot(e.x - px, e.y - py);
                if (d < aimDist) { aimDist = d; aimTarget = { x: e.x, y: e.y }; }
            }

            // ── 4. Reset movement inputs ───────────────────────────────────
            input.up    = false;
            input.down  = false;
            input.left  = false;
            input.right = false;

            // ── 5. Aiming ──────────────────────────────────────────────────
            if (aimTarget) {
                input.aimX = aimTarget.x;
                input.aimY = aimTarget.y;
            } else {
                // Aim at centre when idle
                input.aimX = cx;
                input.aimY = cy;
            }

            // ── 6. Movement ────────────────────────────────────────────────
            let moveX = 0;
            let moveY = 0;

            if (nearestThreat && nearestDist < DANGER) {
                // Dodge: move perpendicular-away from the nearest threat
                const dx = px - nearestThreat.x;
                const dy = py - nearestThreat.y;
                const len = Math.hypot(dx, dy) || 1;

                // Primary: move directly away
                moveX += dx / len;
                moveY += dy / len;

                // Perpendicular component to slide sideways as well
                moveX +=  dy / len * 0.5;
                moveY += -dx / len * 0.5;
            } else {
                // No immediate threat — drift back toward centre
                const dx = cx - px;
                const dy = cy - py;
                const dist = Math.hypot(dx, dy);
                if (dist > 80) {
                    moveX = dx / dist;
                    moveY = dy / dist;
                }
            }

            // ── 7. Wall avoidance ──────────────────────────────────────────
            if (px < MARGIN)      moveX += (MARGIN - px) / MARGIN;
            if (px > W - MARGIN)  moveX -= (px - (W - MARGIN)) / MARGIN;
            if (py < MARGIN)      moveY += (MARGIN - py) / MARGIN;
            if (py > H - MARGIN)  moveY -= (py - (H - MARGIN)) / MARGIN;

            // ── 8. Translate desired world-space movement to WASD inputs ───
            //   The game rotates the ship toward the aim point, so:
            //     W/S  = forward/back relative to facing angle
            //     A/D  = strafe left/right relative to facing angle
            //
            //   We approximate by using the aim angle to decompose the desired
            //   world-space moveVector into the ship's local frame.
            const aimAngle = Math.atan2(input.aimY - py, input.aimX - px);

            // World-space → ship-local projection
            const forward =  moveX * Math.cos(aimAngle) + moveY * Math.sin(aimAngle);
            const strafe  = -moveX * Math.sin(aimAngle) + moveY * Math.cos(aimAngle);

            const THRESH = 0.2;
            if (forward >  THRESH) input.up    = true;
            if (forward < -THRESH) input.down  = true;
            if (strafe  < -THRESH) input.left  = true;
            if (strafe  >  THRESH) input.right = true;

            // ── 9. Always fire ─────────────────────────────────────────────
            input.fire = true;

            return {
                px, py,
                nearestDist,
                threats: threats.length,
                inputs: { up: input.up, down: input.down, left: input.left, right: input.right }
            };
        });
    }

    // -----------------------------------------------------------------------
    // run — call tick() every TICK_INTERVAL ms for durationMs milliseconds
    // -----------------------------------------------------------------------

    /**
     * @param {number} durationMs   How long to run the AI (ms)
     * @param {(state: object) => void} [onTick]  Optional callback after each tick
     * @param {{ switchWeapons?: boolean, switchInterval?: number }} [opts]
     */
    async run(durationMs, onTick = null, opts = {}) {
        this._running = true;
        const deadline = Date.now() + durationMs;
        const switchWeapons = opts.switchWeapons ?? false;
        const switchInterval = opts.switchInterval ?? 5000;
        let lastSwitch = Date.now();

        while (this._running && Date.now() < deadline) {
            const state = await this.tick();
            if (onTick && state) onTick(state);

            // Periodically switch to a random owned primary weapon
            if (switchWeapons && Date.now() - lastSwitch > switchInterval) {
                await this.switchRandomPrimary();
                lastSwitch = Date.now();
            }

            await this.page.waitForTimeout(TICK_INTERVAL);
        }
    }

    // -----------------------------------------------------------------------
    // stop — halt the AI and release all inputs
    // -----------------------------------------------------------------------

    async stop() {
        this._running = false;
        await this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (!ge) return;
            const input = ge.inputHandler.input;
            input.up    = false;
            input.down  = false;
            input.left  = false;
            input.right = false;
            input.fire  = false;
        });
    }

    // -----------------------------------------------------------------------
    // waitForEnemyDeath — poll until a specific enemy type is gone
    // -----------------------------------------------------------------------

    /**
     * Wait until there are no active enemies of the specified type.
     * @param {string} enemyType  e.g. 'HUNTER'
     * @param {number} [timeoutMs=30_000]
     */
    async waitForEnemyDeath(enemyType, timeoutMs = 30_000) {
        const page = this.page;
        await page.waitForFunction(
            (type) => {
                const ge = window.gameEngine;
                if (!ge) return false;
                return !ge.enemyPool.activeObjects.some(
                    (e) => e.active && e.type === type
                );
            },
            enemyType,
            { timeout: timeoutMs }
        );
    }

    // -----------------------------------------------------------------------
    // waitForAsteroidCount — poll until active asteroid count matches
    // -----------------------------------------------------------------------

    /**
     * Wait until the active asteroid count equals the expected value.
     * @param {number} count
     * @param {number} [timeoutMs=15_000]
     */
    async waitForAsteroidCount(count, timeoutMs = 15_000) {
        const page = this.page;
        await page.waitForFunction(
            (n) => window.gameEngine?.asteroidPool?.activeObjects?.length === n,
            count,
            { timeout: timeoutMs }
        );
    }

    // -----------------------------------------------------------------------
    // getState — snapshot of the full game state
    // -----------------------------------------------------------------------

    /**
     * Switch to a random owned primary weapon (different from current if possible).
     * Returns the new weapon ID or null.
     */
    async switchRandomPrimary() {
        return this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (!ge || !ge.player) return null;
            const p = ge.player;
            const owned = [...p.ownedPrimaries];
            if (owned.length <= 1) return null;
            const others = owned.filter(id => id !== p.activePrimary);
            const pick = others[Math.floor(Math.random() * others.length)];
            p.equipPrimary(pick);
            return p.activePrimary;
        });
    }

    async getState() {
        return this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (!ge) return null;
            const p = ge.player;
            return {
                gameState:    ge.game.state,
                wave:         ge.game.currentWave,
                money:        ge.game.money,
                // 5.88.0 — lives replaced with energy tanks; old field
                // name kept on the AI snapshot for back-compat in case
                // any e2e/perf script reads `state.lives`.
                lives:        ge.shieldTanks,
                tanks:        ge.shieldTanks,
                player: {
                    x:        p?.x,
                    y:        p?.y,
                    health:   p?.health,
                    maxHealth: p?.maxHealth,
                    level:    p?.level,
                    shield:   p?.shield,
                    activePrimary: p?.activePrimary,
                    ownedPrimaries: p ? [...p.ownedPrimaries] : [],
                },
                counts: {
                    asteroids:    ge.asteroidPool?.activeObjects?.length  ?? 0,
                    enemies:      ge.enemyPool?.activeObjects?.length      ?? 0,
                    bullets:      ge.bulletPool?.activeObjects?.length     ?? 0,
                    enemyBullets: ge.enemyBulletPool?.activeObjects?.length ?? 0,
                    powerups:     ge.powerupPool?.activeObjects?.length    ?? 0,
                },
            };
        });
    }
}
