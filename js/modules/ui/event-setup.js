// Event listener setup — keyboard, mouse, touch, shop interaction, cheats
import { GAME_STATES } from '../core/constants.js';
import { random } from '../core/utils.js';
import { hideHint } from './hint-system.js';
import { isMobile } from '../platform/platform-detect.js';

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
        // 5.100.0 — Re-anchor the analog stick on any resize / orient.
        if (this.analogStick && this.analogStick.resize) {
            this.analogStick.resize(this.width, this.height);
        }
        this.events.emit('ui:check-orientation');
        // 5.91 — re-evaluate the portrait body class so the CSS HUD
        // adjustments track real-time rotation on mobile.
        if (this._updateMobileBodyClasses) this._updateMobileBodyClasses();
    });

    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        this.events.emit('ui:check-orientation');
        if (this._updateMobileBodyClasses) this._updateMobileBodyClasses();
    });

    // Handle pause and test keys
    document.addEventListener('keydown', (e) => {
        // 9.9.0 — Two weapon radials: hold F for the PRIMARY ring, E for the
        // POWER ring. While one is open, Escape or the held key closes it
        // (instead of pausing); other keys are ignored until release.
        // `_radialKeyHeld` stores the OPEN key's code so keyup commits the
        // matching ring.
        const RADIAL_KEYS = { KeyF: 'primary', KeyE: 'power' };
        const radial = this.radialMenu;
        if (radial && radial.isOpen()) {
            if (e.code === 'Escape' || e.code === this._radialKeyHeld) {
                e.preventDefault();
                radial.cancel();
                this._radialKeyHeld = null;
            }
            return;
        }
        if (e.code === 'Escape') {
            // 9.0.0 (reboot) — the inventory ('I') + stats ('`') screens and
            // their key bindings are removed; Esc routes straight to pause.
            this.togglePause();
        }
        // Hold F (primary) / E (power) to open the matching radial mid-run
        // (PLAYING only). openFor(kind) no-ops with no player or <2 owned of
        // that slot, so the key feels inert when there's nothing to switch to.
        const _radialKind = RADIAL_KEYS[e.code];
        if (_radialKind && !e.repeat && !this._radialKeyHeld
            && radial && this.game.state === GAME_STATES.PLAYING) {
            radial.openFor(_radialKind);
            if (radial.isOpen()) {
                this._radialKeyHeld = e.code;
                e.preventDefault();
            }
            return;
        }
        // Keybind layout:
        //   F (hold)  — radial menu: PRIMARY weapon (mouse picks, release commits)
        //   E (hold)  — radial menu: POWER weapon (handled above, 9.9.0)
        //   SPACE     — fire/charge POWER weapon (handled in input-handler.js)
        //   left-clk  — fire PRIMARY (or commit a radial selection while a
        //               radial menu is open)
        //   right-clk — alternate POWER weapon trigger
        // TAB activates the equipped defense ability/ability (6.x; the
        // pulse is set in input-handler.handleKeyDown). preventDefault
        // here too so TAB never shifts browser focus off the canvas.
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
        // (the SHIFT key is now the ability-cycle binding so shift+letter
        // combos are partially intercepted by the input handler's
        // shift-tap-to-cycle bookkeeping). The bracket cheats above are
        // the supported quick-test path now; full cheats live behind
        // dev-tools console (`window.gameEngine.cheats.*`).
    });

    // 9.9.0 — Weapon radial: releasing the SAME key that opened it (F or E)
    // commits the slice under the cursor (if any) and closes; otherwise unchanged.
    document.addEventListener('keyup', (e) => {
        if (!this._radialKeyHeld || e.code !== this._radialKeyHeld) return;
        const radial = this.radialMenu;
        this._radialKeyHeld = null;
        if (radial && radial.isOpen()) {
            const idx = radial.getHoverIndex();
            if (idx >= 0) radial.selectIndex(idx);
            else radial.cancel();
        }
    });

    // 9.6.x — While the radial is open a left-click / tap commits the hovered
    // slice. Registered in the CAPTURE phase so it pre-empts the entity-
    // targeting / HUD-button click handlers below. screenAimX/Y for the radial
    // angle are kept in sync from the mousemove handler (this.mouseX/Y).
    this.canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const radial = this.radialMenu;
        if (radial && radial.isOpen()) {
            radial.handleClick();
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

    // Delegates to the engine's canonical action so desktop + mobile
    // (mobile-touch.js) share one code path.
    const _runGameOverAction = (id) => this.triggerGameOverAction(id);

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

    // Auto-pause when the window loses focus (alt-tab). Defer one tick
    // and confirm the document really lost focus — a transient blur
    // (intra-page focus shift, devtools docking, etc.) where focus
    // returns immediately should NOT spuriously pause the game.
    window.addEventListener('blur', () => {
        if (this.game.state !== GAME_STATES.PLAYING && this.game.state !== GAME_STATES.WAVE_TRANSITION) return;
        setTimeout(() => {
            if (typeof document.hasFocus === 'function' && document.hasFocus()) return;
            if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.togglePause();
            }
        }, 0);
    });

    // 6.x — Flush progress when the tab is hidden / closed (mobile app
    // switch, desktop tab close) so accumulated gold / XP / SP / upgrades
    // and the resume bookmark survive even without a clean wave-clear or
    // death. visibilitychange→hidden is the reliable mobile signal;
    // pagehide covers desktop unload.
    const flushOnExit = () => {
        // 6.226.0 — force an immediate meta flush (commit loot + write the
        // profile), bypassing the ~1s coalesce throttle, then write the
        // run-snapshot bookmark. Guarantees gear/powerups/loot/gold are
        // persisted even on an abrupt tab-hide between coalesced flushes.
        if (this.flushMeta) { this._metaDirty = false; this.flushMeta(); }
        if (this.saveProgress) this.saveProgress();
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushOnExit();
    });
    window.addEventListener('pagehide', flushOnExit);

    // Entity targeting click handling (for gameplay)
    this.canvas.addEventListener('click', (e) => {
        // 5.99.0 — On mobile, ALL canvas interaction is owned by
        // mobile-touch.js (touchstart → preventDefault → custom logic).
        // The browser may STILL synthesize a `click` event after the
        // touch even though preventDefault was called (especially on
        // iOS Safari with `touch-action: none`). Without bailing here,
        // a single HUD-button tap fires togglePause TWICE — once via
        // mobile-touch.js and once via this click handler — which
        // leaves the user's pause toggle effectively a no-op and can
        // double-toggle wave-pick / shop hits too.
        if (isMobile()) return;


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
            if (hudHit === 'pause') {
                // 5.79.14 — Pause button moved from DOM to the canvas
                //   button bar. Same togglePause() entry point as the
                //   ESC key. (9.0.0: SHOP + STATS buttons removed.)
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
