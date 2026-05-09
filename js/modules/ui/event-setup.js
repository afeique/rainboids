// Event listener setup — keyboard, mouse, touch, shop interaction, cheats
import { GAME_STATES } from '../core/constants.js';
import { random } from '../core/utils.js';
import { hideHint } from './hint-system.js';

// 5.79.2 — Hit-test the bottom-center HUD button bar. Mirrors
// hudButtonHitTest in hud-buttons.js but kept inline here to avoid a
// circular import (hud/* imports happen at engine-init time).
function _hitHudButton(engine, sx, sy) {
    const rects = engine && engine._hudButtonRects;
    if (!rects) return null;
    for (const k of Object.keys(rects)) {
        const r = rects[k];
        if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.id;
    }
    return null;
}

export function setupEventListeners() {
    // Handle window resize
    window.addEventListener('resize', () => {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        if (this.particleRenderer) this.particleRenderer.resize(this.width, this.height);
        if (this.bulletRenderer && this.bulletRenderer.resize) this.bulletRenderer.resize(this.width, this.height);
        this.events.emit('ui:check-orientation');
    });

    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        this.events.emit('ui:check-orientation');
    });

    // Handle pause and test keys
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            // 5.79.0 — Esc closes the stats screen first if it's open.
            if (this.isStatsScreenOpen && this.isStatsScreenOpen()) {
                this.toggleStatsScreen();
                return;
            }
            this.togglePause();
        }
        // 5.79.0 — backtick (`) opens the Diablo-style stats screen.
        // Allowed in PLAYING / WAVE_TRANSITION / PAUSED. Pressing it
        // again closes the screen and resumes whatever state was prior.
        if (e.code === 'Backquote' && !e.repeat) {
            const allowed =
                this.game.state === GAME_STATES.PLAYING ||
                this.game.state === GAME_STATES.WAVE_TRANSITION ||
                this.game.state === GAME_STATES.PAUSED;
            if (allowed && this.toggleStatsScreen) {
                this.toggleStatsScreen();
                e.preventDefault();
                return;
            }
        }
        // Keybind layout:
        //   E (hold)  — radial menu: PRIMARY weapon (mouse picks, click commits)
        //   R (hold)  — radial menu: POWER weapon
        //   F (hold)  — radial menu: SKILL
        //   Q         — activate equipped skill (handled in input-handler.js)
        //   SPACE     — fire/charge POWER weapon (handled in input-handler.js)
        //   left-clk  — fire PRIMARY (or commit a radial selection while a
        //               radial menu is open)
        //   right-clk — alternate POWER weapon trigger
        //
        // Radial menus open on the first keydown (e.repeat is ignored so
        // browser auto-repeat doesn't reopen the menu) and close on keyup
        // or after a click selection. Allowed during PLAYING and
        // WAVE_TRANSITION so the player can re-equip between waves.
        const cycleAllowed =
            this.game.state === GAME_STATES.PLAYING ||
            this.game.state === GAME_STATES.WAVE_TRANSITION;

        // 5.79.3 — keybind reshuffle (per user request):
        //   F → primary weapon cycle
        //   E → power weapon cycle
        //   R → defense skill cycle
        // The radial-menu types stay 'primary' / 'power' / 'skill';
        // only the keys that open each are remapped.
        const radialKey =
            e.code === 'KeyF' ? 'primary' :
            e.code === 'KeyE' ? 'power'   :
            e.code === 'KeyR' ? 'skill'   : null;
        if (radialKey && !e.shiftKey && cycleAllowed && !e.repeat) {
            this.radialMenu.openFor(radialKey);
            hideHint();
        }
        // Tab is no longer a game binding (Q took over skill-activate
        // in 5.68.4) but we still preventDefault so an accidental TAB
        // doesn't shift browser focus off the canvas.
        if (e.code === 'Tab') {
            e.preventDefault();
        }
        // 5.74.17 — P-key powerup spawn cheat removed. Powerups are now
        // purchase-only via the POWERUPS pause-tab; ground pickups and
        // random grants are gone, so this debug spawner has no place.
        // Solo-key cheat codes (no shift required, gameplay only).
        //   [   → +1000 gold
        //   ]   → +5 SP   (5.79.3 — restored. SP currency came back
        //                  with the 5.78.0 powerupPicks → skillPoints
        //                  rename. Earlier the cheat had been
        //                  redirected to gold; now it grants picks
        //                  again to match the documented behavior.)
        if (this.game.state === GAME_STATES.PLAYING && !e.shiftKey) {
            if (e.code === 'BracketLeft') {
                this.game.money += 1000;
                this.events.emit('ui:show-message', { title: 'CHEAT', subtitle: '+1000 Gold', duration: 1200 });
            } else if (e.code === 'BracketRight') {
                if (this.player) {
                    this.player.skillPoints = (this.player.skillPoints || 0) + 5;
                }
                this.events.emit('ui:show-message', { title: 'CHEAT', subtitle: '+5 SP', duration: 1200 });
            }
        }

        // 5.64.11 — SHIFT+ cheat codes removed. They didn't fire reliably
        // (the SHIFT key is now the skill-cycle binding so shift+letter
        // combos are partially intercepted by the input handler's
        // shift-tap-to-cycle bookkeeping). The bracket cheats above are
        // the supported quick-test path now; full cheats live behind
        // dev-tools console (`window.gameEngine.cheats.*`).
    });

    // Radial-menu keyup — releasing F/E/R closes the menu without changing
    // the equipped item. Tied to the specific key that opened it so other
    // unrelated keyups don't dismiss it. (5.79.3 keybind reshuffle mirrors
    // the keydown above.)
    document.addEventListener('keyup', (e) => {
        if (!this.radialMenu || !this.radialMenu.isOpen()) return;
        const t = this.radialMenu.type;
        if ((e.code === 'KeyF' && t === 'primary') ||
            (e.code === 'KeyE' && t === 'power')   ||
            (e.code === 'KeyR' && t === 'skill')) {
            this.radialMenu.cancel();
        }
    });

    // Radial-menu click — when the menu is open, the next mousedown
    // commits the slice under the cursor. Use mousedown (capture phase)
    // so it runs before the input-handler's primary-fire mousedown and
    // before the canvas click handlers.
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (this.radialMenu && this.radialMenu.isOpen()) {
            this.radialMenu.handleClick();
            // Mark this click so the canvas click handler (which runs
            // after the radial closes) doesn't fall through to entity
            // targeting on the same press.
            this._radialClickConsumed = true;
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // 5.88.4 — GAME OVER screen routing. Hit-test the two buttons
    // (NEW GAME / RESTART WAVE) drawn by hud/overlays.js::drawGameOverScreen.
    // Hover/press state mirrors the title-screen system so the visual
    // feedback (depressed button, pulsing alpha) is identical.
    const _gameOverHitId = (e) => {
        if (this.game.state !== GAME_STATES.GAME_OVER) return null;
        const rects = this._gameOverButtonRects;
        if (!rects) return null;
        const rect = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (this.canvas.width  / rect.width);
        const my = (e.clientY - rect.top)  * (this.canvas.height / rect.height);
        for (const id of ['newGame', 'restartWave']) {
            const r = rects[id];
            if (!r || r.disabled) continue;
            if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return id;
        }
        return null;
    };

    const _runGameOverAction = (id) => {
        if (id === 'newGame') {
            // Fresh run: clear save + roll a new random loadout. Mirrors
            // the title-screen NEW GAME path.
            if (typeof this.startNewRun === 'function') this.startNewRun();
            else this.init();
        } else if (id === 'restartWave') {
            // Restart at the wave-start auto-save (the wave they died
            // on, with their pre-wave loadout + economy intact).
            if (typeof this.startContinueRun === 'function') {
                const ok = this.startContinueRun();
                if (!ok && typeof this.startNewRun === 'function') this.startNewRun();
                else if (!ok) this.init();
            } else {
                this.init();
            }
        }
    };

    // Handle game restart on click
    window.addEventListener('click', (e) => {
        if (this.game.state !== GAME_STATES.GAME_OVER) return;
        const id = _gameOverHitId(e);
        if (id) _runGameOverAction(id);
    });

    // Hover + press visual feedback on the GAME OVER buttons.
    window.addEventListener('mousemove', (e) => {
        if (this.game.state !== GAME_STATES.GAME_OVER) return;
        this._gameOverHoveredButton = _gameOverHitId(e);
    });
    window.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (this.game.state !== GAME_STATES.GAME_OVER) return;
        this._gameOverPressedButton = _gameOverHitId(e);
    });
    window.addEventListener('mouseup', () => {
        this._gameOverPressedButton = null;
    });

    document.addEventListener('keydown', (e) => {
        if (this.game.state !== GAME_STATES.GAME_OVER) return;
        if (e.code !== 'Enter' && e.code !== 'Space' && e.code !== 'NumpadEnter') return;
        e.preventDefault();
        // Enter/Space activate the hovered button if any; otherwise fall
        // back to RESTART WAVE when a save exists, else NEW GAME.
        const hovered = this._gameOverHoveredButton;
        if (hovered === 'newGame' || hovered === 'restartWave') {
            _runGameOverAction(hovered);
            return;
        }
        const hasSavedRun = !!(this.hasSavedRun && this.hasSavedRun());
        _runGameOverAction(hasSavedRun ? 'restartWave' : 'newGame');
    });

    // Auto-pause when window loses focus
    window.addEventListener('blur', () => {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.togglePause();
        }
    });

    // Entity targeting click handling (for gameplay)
    this.canvas.addEventListener('click', (e) => {
        // Swallow the click if the matching mousedown was a radial-menu
        // commit — the radial closed inside mousedown so isOpen() is now
        // false, but the canvas click handler must not fall through to
        // entity targeting on the same press.
        if (this._radialClickConsumed) {
            this._radialClickConsumed = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 5.79.2 — bottom-center HUD buttons (SHOP / STATS) live on the
        //   canvas. Hit-test FIRST so the click doesn't fall through to
        //   entity targeting. Same in-screen coords as the rect map
        //   `_hudButtonRects` produced by drawHudButtons().
        const rect0 = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect0.left;
        const sy = e.clientY - rect0.top;
        const hudHit = _hitHudButton(this, sx, sy);
        if (hudHit) {
            e.preventDefault();
            e.stopPropagation();
            if (hudHit === 'shop') {
                if (this.game.state === GAME_STATES.SHOP) this.closeShopAndReturn();
                else this.openShop();
            } else if (hudHit === 'stats') {
                if (this.toggleStatsScreen) this.toggleStatsScreen();
            } else if (hudHit === 'pause') {
                // 5.79.14 — Pause button moved from DOM to the canvas
                //   button bar. Same togglePause() entry point as the
                //   ESC key.
                if (this.togglePause) this.togglePause();
            }
            this._hudPressedButton = null;
            return;
        }

        if (this.game.state === GAME_STATES.PLAYING) {
            e.preventDefault();
            e.stopPropagation();

            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            const worldX = clickX + this.camera.x;
            const worldY = clickY + this.camera.y;

            this.handleEntityTargeting(worldX, worldY);
            return;
        }
    });

    // 5.79.2 — HUD button mousedown / mouseup feedback. Pressed state
    //   shows visual depression; click handler above commits the
    //   action. This block also intercepts mousedown so the radial
    //   menu doesn't open on a HUD-button press.
    this.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const hit = _hitHudButton(this, sx, sy);
        if (hit) {
            this._hudPressedButton = hit;
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
    this.canvas.addEventListener('mouseup', () => {
        this._hudPressedButton = null;
    });

    // Shop click handling with click-outside-to-close
    this.canvas.addEventListener('click', (e) => {
        if (this.game.state === GAME_STATES.SHOP) {
            e.preventDefault();
            e.stopPropagation();

            const rect = this.canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // (Click-outside-to-close removed — easy to misclick. The shop
            // closes only via the X button or the ESC key, both routed to
            // closeShopToPause so the player goes back to the pause menu.)

            // Check for close button click
            if (this.shopCloseBounds &&
                clickX >= this.shopCloseBounds.x &&
                clickX <= this.shopCloseBounds.x + this.shopCloseBounds.width &&
                clickY >= this.shopCloseBounds.y &&
                clickY <= this.shopCloseBounds.y + this.shopCloseBounds.height) {
                // Route to whichever state the shop was opened from
                // (mid-play → PLAYING, between waves → start next wave,
                // from pause menu → back to pause).
                this.closeShopAndReturn();
                return;
            }

            // Check for tab clicks first
            if (this.shopTabBounds) {
                for (const [key, bounds] of Object.entries(this.shopTabBounds)) {
                    if (clickX >= bounds.x && clickX <= bounds.x + bounds.width &&
                        clickY >= bounds.y && clickY <= bounds.y + bounds.height) {
                        this.shopCategory = key.toUpperCase();
                        this.shopScrollOffset = 0;
                        this._rebuildShopCache();
                        return;
                    }
                }
            }

            // Check for scrollbar interactions
            if (this.shopScrollbarBounds) {
                // Check up arrow
                if (clickX >= this.shopScrollbarBounds.upArrow.x &&
                    clickX <= this.shopScrollbarBounds.upArrow.x + this.shopScrollbarBounds.upArrow.width &&
                    clickY >= this.shopScrollbarBounds.upArrow.y &&
                    clickY <= this.shopScrollbarBounds.upArrow.y + this.shopScrollbarBounds.upArrow.height) {
                    this.shopScrollOffset = Math.max(0, this.shopScrollOffset - 40);
                    return;
                }

                // Check down arrow
                if (clickX >= this.shopScrollbarBounds.downArrow.x &&
                    clickX <= this.shopScrollbarBounds.downArrow.x + this.shopScrollbarBounds.downArrow.width &&
                    clickY >= this.shopScrollbarBounds.downArrow.y &&
                    clickY <= this.shopScrollbarBounds.downArrow.y + this.shopScrollbarBounds.downArrow.height) {
                    const filteredItems = this.shopFilteredItems;
                    const itemsPerRow = 2;
                    const rows = Math.ceil(filteredItems.length / itemsPerRow);
                    const itemHeight = 120;
                    const totalContentHeight = rows * (itemHeight + 10);
                    const maxScroll = Math.max(0, totalContentHeight - (this.shopWindowBounds.height - 140));

                    this.shopScrollOffset = Math.min(maxScroll, this.shopScrollOffset + 40);
                    return;
                }

                // Check thumb drag start
                if (clickX >= this.shopScrollbarBounds.x &&
                    clickX <= this.shopScrollbarBounds.x + this.shopScrollbarBounds.width &&
                    clickY >= this.shopScrollbarBounds.thumbY &&
                    clickY <= this.shopScrollbarBounds.thumbY + this.shopScrollbarBounds.thumbHeight) {
                    this.shopScrollThumbDrag = true;
                    this.shopScrollDragStartY = clickY;
                    this.shopScrollDragStartOffset = this.shopScrollOffset;
                    return;
                }

                // Check track click (jump to position)
                if (clickX >= this.shopScrollbarBounds.x &&
                    clickX <= this.shopScrollbarBounds.x + this.shopScrollbarBounds.width &&
                    clickY >= this.shopScrollbarBounds.trackY &&
                    clickY <= this.shopScrollbarBounds.trackY + this.shopScrollbarBounds.trackHeight) {
                    const filteredItems = this.shopFilteredItems;
                    const itemsPerRow = 2;
                    const rows = Math.ceil(filteredItems.length / itemsPerRow);
                    const itemHeight = 120;
                    const totalContentHeight = rows * (itemHeight + 10);
                    const maxScroll = Math.max(0, totalContentHeight - (this.shopWindowBounds.height - 140));

                    const clickRatio = (clickY - this.shopScrollbarBounds.trackY) / this.shopScrollbarBounds.trackHeight;
                    this.shopScrollOffset = Math.max(0, Math.min(maxScroll, clickRatio * maxScroll));
                    return;
                }
            }

            // Check for sell button clicks before buy clicks
            if (this.shopSellButtonBounds) {
                for (const sb of this.shopSellButtonBounds) {
                    if (clickX >= sb.x && clickX <= sb.x + sb.w &&
                        clickY >= sb.y && clickY <= sb.y + sb.h) {
                        this.sellShopItem(sb.itemId);
                        return;
                    }
                }
            }

            // Check for item clicks
            if (this.shopItemBounds) {
                for (const bound of this.shopItemBounds) {
                    if (clickX >= bound.x && clickX <= bound.x + bound.width &&
                        clickY >= bound.y && clickY <= bound.y + bound.height) {
                        const success = this.buyShopItem(bound.item.id);
                        if (success) {
                            this._shopFlash = { time: performance.now(), color: 'rgba(0, 255, 128, 0.15)' };
                        } else {
                            this._shopFlash = { time: performance.now(), color: 'rgba(255, 60, 60, 0.2)' };
                        }
                        break;
                    }
                }
            }
        }
    });

    // Mouse move tracking for hover effects and cursor.
    this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;

            // Update cursor position for canvas rendering
            this.cursor.x = this.mouseX;
            this.cursor.y = this.mouseY;

            // 5.79.2 — track HUD button hover for visual feedback.
            this._hudHoveredButton = _hitHudButton(this, this.mouseX, this.mouseY);

            // Handle scrollbar dragging
            if (this.shopScrollThumbDrag && this.game.state === GAME_STATES.SHOP) {
                const dragDelta = this.mouseY - this.shopScrollDragStartY;
                const filteredItems = this.shopFilteredItems;
                const itemsPerRow = 2;
                const rows = Math.ceil(filteredItems.length / itemsPerRow);
                const itemHeight = 120;
                const totalContentHeight = rows * (itemHeight + 10);
                const maxScroll = Math.max(0, totalContentHeight - (this.shopWindowBounds.height - 140));

                if (maxScroll > 0 && this.shopScrollbarBounds) {
                    const scrollRatio = dragDelta / this.shopScrollbarBounds.trackHeight;
                    const newOffset = this.shopScrollDragStartOffset + (scrollRatio * maxScroll);
                    this.shopScrollOffset = Math.max(0, Math.min(maxScroll, newOffset));
                }
            }

            // Update hover states for scrollbar arrows
            if (this.game.state === GAME_STATES.SHOP && this.shopScrollbarBounds) {
                this.shopScrollUpHover = this.mouseX >= this.shopScrollbarBounds.upArrow.x &&
                                       this.mouseX <= this.shopScrollbarBounds.upArrow.x + this.shopScrollbarBounds.upArrow.width &&
                                       this.mouseY >= this.shopScrollbarBounds.upArrow.y &&
                                       this.mouseY <= this.shopScrollbarBounds.upArrow.y + this.shopScrollbarBounds.upArrow.height;

                this.shopScrollDownHover = this.mouseX >= this.shopScrollbarBounds.downArrow.x &&
                                         this.mouseX <= this.shopScrollbarBounds.downArrow.x + this.shopScrollbarBounds.downArrow.width &&
                                         this.mouseY >= this.shopScrollbarBounds.downArrow.y &&
                                         this.mouseY <= this.shopScrollbarBounds.downArrow.y + this.shopScrollbarBounds.downArrow.height;
            }
    });

    // Mouse up to stop dragging
    this.canvas.addEventListener('mouseup', (e) => {
        this.shopScrollThumbDrag = false;
    });

    // Shop scroll support
    this.canvas.addEventListener('wheel', (e) => {
        if (this.game.state === GAME_STATES.SHOP) {
            e.preventDefault();

            if (this.shopWindowBounds && this.mouseX !== undefined && this.mouseY !== undefined) {
                const isOverShop = this.mouseX >= this.shopWindowBounds.x &&
                                 this.mouseX <= this.shopWindowBounds.x + this.shopWindowBounds.width &&
                                 this.mouseY >= this.shopWindowBounds.y &&
                                 this.mouseY <= this.shopWindowBounds.y + this.shopWindowBounds.height;

                if (isOverShop) {
                    const scrollSpeed = 40;
                    if (this.shopScrollOffset === undefined) {
                        this.shopScrollOffset = 0;
                    }
                    this.shopScrollOffset += e.deltaY > 0 ? scrollSpeed : -scrollSpeed;
                }
            }
        }
    }, { passive: false });

}
