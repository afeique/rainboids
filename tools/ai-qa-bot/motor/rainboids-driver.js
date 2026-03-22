/**
 * AI QA Bot — Rainboids Input Driver
 *
 * Drives game inputs via direct injection into inputHandler.input.
 * This is the fast, API-direct approach for Rainboids specifically.
 */

export class RainboidsDriver {
    constructor(page) {
        this.page = page;
    }

    /**
     * Set all movement + combat inputs atomically.
     * @param {object} inputs
     *   - up, down, left, right: boolean (movement)
     *   - fire: boolean (primary weapon)
     *   - fireSecondary: boolean (power weapon)
     *   - skill1..skill4: boolean (defense skills)
     *   - aimX, aimY: number (world coordinates)
     */
    async setInputs(inputs) {
        await this.page.evaluate((inp) => {
            const input = window.gameEngine?.inputHandler?.input;
            if (!input) return;
            if (inp.up !== undefined) input.up = inp.up;
            if (inp.down !== undefined) input.down = inp.down;
            if (inp.left !== undefined) input.left = inp.left;
            if (inp.right !== undefined) input.right = inp.right;
            if (inp.fire !== undefined) input.fire = inp.fire;
            if (inp.fireSecondary !== undefined) input.fireSecondary = inp.fireSecondary;
            if (inp.skill1 !== undefined) input.skill1 = inp.skill1;
            if (inp.skill2 !== undefined) input.skill2 = inp.skill2;
            if (inp.skill3 !== undefined) input.skill3 = inp.skill3;
            if (inp.skill4 !== undefined) input.skill4 = inp.skill4;
            if (inp.aimX !== undefined) input.aimX = inp.aimX;
            if (inp.aimY !== undefined) input.aimY = inp.aimY;
            // Ensure fire is allowed
            if (inp.fire) window.gameEngine.playerCanFire = true;
        }, inputs);
    }

    /**
     * Release all inputs (stop moving, stop firing).
     */
    async releaseAll() {
        await this.setInputs({
            up: false, down: false, left: false, right: false,
            fire: false, fireSecondary: false,
            skill1: false, skill2: false, skill3: false, skill4: false,
        });
    }

    // ── Shop Interaction ─────────────────────────────────────────

    async openShop() {
        await this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (ge.game.state === 'WAVE_TRANSITION' || ge.game.state === 'PLAYING') {
                ge.openShop();
            }
        });
    }

    async closeShop() {
        await this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (ge.game.state === 'SHOP') ge.closeShop();
        });
    }

    /**
     * Close the shop without calling startNextWave().
     * Used when shopping during WAVE_TRANSITION — the wave transition
     * timer should continue naturally after the shop closes.
     */
    async closeShopSilent() {
        await this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (ge.game.state !== 'SHOP') return;

            // Adjust spawn timers for time in shop (same as closeShop)
            if (ge.shopOpenTime) {
                const timeInShop = Date.now() - ge.shopOpenTime;
                ge.lastSpawnTime += timeInShop;
                ge.lastEmergencySpawn += timeInShop;
                ge.nextShopTime += timeInShop;
            }

            // Restore to WAVE_TRANSITION without calling startNextWave
            ge.game.state = 'WAVE_TRANSITION';
            document.body.classList.remove('shop-open');

            if (ge.player) ge.player.resumeChargeShot();
            ge.shopItemBounds = null;
        });
    }

    async setShopCategory(category) {
        await this.page.evaluate((cat) => {
            const ge = window.gameEngine;
            ge.shopCategory = cat;
            ge._rebuildShopCache();
        }, category);
    }

    async buyItem(itemId) {
        return this.page.evaluate((id) => {
            return window.gameEngine.buyShopItem(id);
        }, itemId);
    }

    async getShopItems() {
        return this.page.evaluate(() => {
            const ge = window.gameEngine;
            const items = ge.shopFilteredItems || [];
            return items.map(item => ({
                id: item.id,
                name: item.name,
                cost: item.cost,
                currency: item.currency || 'COINS',
                maxStacks: item.maxStacks,
                isWeapon: !!item.isWeapon,
                isSkill: !!item.isSkill,
                owned: !!item.owned,
                equipped: !!item.equipped,
                category: item.category,
            }));
        });
    }

    // ── Game Control ─────────────────────────────────────────────

    async startGame() {
        await this.page.evaluate(() => {
            const ge = window.gameEngine;
            if (ge.game.state === 'TITLE_SCREEN') {
                ge.startGameTransition();
            }
        });
    }

    async loadAndStart() {
        // Wait for game engine to be ready
        await this.page.waitForFunction(
            () => window.gameEngine?.game?.state === 'TITLE_SCREEN',
            { timeout: 15_000 }
        );
        // Start game
        await this.page.evaluate(() => {
            const ge = window.gameEngine;
            try { ge.audioManager?.initializeAudio?.(); } catch (_) {}
            ge.init();
            ge.game.state = 'PLAYING';
        });
        // Wait for PLAYING state
        await this.page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PLAYING',
            { timeout: 10_000 }
        );
    }

    async getGameState() {
        return this.page.evaluate(() => window.gameEngine?.game?.state);
    }
}

/**
 * Generic input driver interface (for cross-game adapters).
 * Uses Playwright keyboard/mouse events instead of direct injection.
 */
export class GenericDriver {
    constructor(page, controlMap = {}) {
        this.page = page;
        this.controls = {
            up: 'w', down: 's', left: 'a', right: 'd',
            fire: 'mouse_left',
            ...controlMap,
        };
        this._heldKeys = new Set();
        this._mouseDown = false;
    }

    async setInputs(inputs) {
        // Movement keys
        for (const dir of ['up', 'down', 'left', 'right']) {
            if (inputs[dir] === undefined) continue;
            const key = this.controls[dir];
            if (inputs[dir] && !this._heldKeys.has(key)) {
                await this.page.keyboard.down(key);
                this._heldKeys.add(key);
            } else if (!inputs[dir] && this._heldKeys.has(key)) {
                await this.page.keyboard.up(key);
                this._heldKeys.delete(key);
            }
        }

        // Fire
        if (inputs.fire !== undefined) {
            if (inputs.fire && !this._mouseDown) {
                await this.page.mouse.down();
                this._mouseDown = true;
            } else if (!inputs.fire && this._mouseDown) {
                await this.page.mouse.up();
                this._mouseDown = false;
            }
        }

        // Aim (screen coordinates for generic driver)
        if (inputs.aimX !== undefined && inputs.aimY !== undefined) {
            await this.page.mouse.move(inputs.aimX, inputs.aimY);
        }
    }

    async releaseAll() {
        for (const key of this._heldKeys) {
            await this.page.keyboard.up(key);
        }
        this._heldKeys.clear();
        if (this._mouseDown) {
            await this.page.mouse.up();
            this._mouseDown = false;
        }
    }
}
