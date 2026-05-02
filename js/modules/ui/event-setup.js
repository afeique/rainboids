// Event listener setup — keyboard, mouse, touch, shop interaction, cheats
import { GAME_STATES } from '../core/constants.js';
import { random } from '../core/utils.js';
import { hideHint } from './hint-system.js';

export function setupEventListeners() {
    // Handle window resize
    window.addEventListener('resize', () => {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.events.emit('ui:check-orientation');
    });

    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        this.events.emit('ui:check-orientation');
    });

    // Handle pause and test keys
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            // If the Powerups overlay is open, ESC closes it back to the
            // pause menu first instead of toggling pause directly.
            const pwOverlay = document.getElementById('powerups-overlay');
            if (pwOverlay && pwOverlay.style.display === 'flex') {
                this.uiManager.hidePowerupsOverlay();
                if (this.uiManager.elements.pauseOverlay) {
                    this.uiManager.elements.pauseOverlay.style.display = 'flex';
                }
                return;
            }
            this.togglePause();
        }
        // R-key reload was removed — auto-reload kicks in when the clip empties.
        // R now cycles through owned primary weapons (during gameplay only —
        // ignored if Shift is held so it doesn't conflict with Shift+R cheats).
        // Tab cycles owned PRIMARY weapons; R cycles owned POWER weapons.
        // Allowed during PLAYING and WAVE_TRANSITION so the player can
        // re-equip between waves too. Tab needs preventDefault so the
        // browser doesn't shift focus to the next page element.
        const cycleAllowed =
            this.game.state === GAME_STATES.PLAYING ||
            this.game.state === GAME_STATES.WAVE_TRANSITION;
        // Tab/R cycle through ALL primary/power weapons in the game (not
        // just the ones currently in the player's `ownedPrimaries` /
        // `ownedPowers` set). Mirrors the pause-menu behavior where every
        // weapon is selectable for free — pressing Tab/R auto-adds the
        // newly-equipped weapon to the owned set so the rest of the game
        // (shop upgrade trees, sell paths, etc.) treats it as owned.
        if (e.code === 'Tab' && !e.shiftKey && cycleAllowed) {
            e.preventDefault();
            this.triggerWeaponCycleAnim('primary');
            const all = Object.keys(this.PRIMARY_WEAPONS_LIST || {});
            if (all.length > 1) {
                const i = all.indexOf(this.player.activePrimary);
                const next = all[(i + 1) % all.length];
                if (this.player.ownedPrimaries && !this.player.ownedPrimaries.has(next)) {
                    this.player.ownedPrimaries.add(next);
                }
                this.player.equipPrimary(next);
                hideHint();
                this.events.emit('audio:coin');
            }
        }
        if (e.code === 'KeyR' && !e.shiftKey && cycleAllowed) {
            this.triggerWeaponCycleAnim('power');
            const all = Object.keys(this.POWER_WEAPONS_LIST || {});
            if (all.length > 1) {
                const i = all.indexOf(this.player.activePower);
                const next = all[(i + 1) % all.length];
                if (this.player.ownedPowers && !this.player.ownedPowers.has(next)) {
                    this.player.ownedPowers.add(next);
                }
                this.player.equipPower(next);
                hideHint();
                this.events.emit('audio:coin');
            }
        }
        // (Shift+R is still a cheat handled in the Shift block below.)
        // Test powerup spawn (for debugging) — pick a uniformly random
        // point inside the visible viewport (with a small margin from
        // the very edges so the powerup is fully visible), but reject
        // any point too close to the player so they actually have to
        // fly to it. Rejection sampling — simple, no edge logic.
        if (e.code === 'KeyP' && this.game.state === GAME_STATES.PLAYING) {
            const MARGIN = 80;       // keep the spawn at least this far from the screen edges
            const MIN_DIST = 250;    // and at least this far from the player

            const playerScreenX = this.player.x - this.camera.x;
            const playerScreenY = this.player.y - this.camera.y;

            let screenX, screenY;
            for (let attempt = 0; attempt < 20; attempt++) {
                screenX = random(MARGIN, this.width - MARGIN);
                screenY = random(MARGIN, this.height - MARGIN);
                const dx = screenX - playerScreenX;
                const dy = screenY - playerScreenY;
                if (Math.hypot(dx, dy) >= MIN_DIST) break; // good candidate
                // else: too close to player, try again
            }
            // If 20 attempts all failed (tiny viewport), fall through with
            // the last sample — still on-screen, just less ideal.

            this.dropPowerup(
                screenX + this.camera.x,
                screenY + this.camera.y,
            );
        }
        // Debug cheat codes (Shift+key, gameplay only)
        if (e.shiftKey && this.game.state === GAME_STATES.PLAYING) {
            // Shift+1–8: spawn individual enemy ship types
            const debugEnemyTypes = ['HUNTER','GUARDIAN','WASP','TITAN','STALKER','TANGERINE','DRIFTER','PROWLER'];
            const shipKeyMap = {'Digit1':0,'Digit2':1,'Digit3':2,'Digit4':3,'Digit5':4,'Digit6':5,'Digit7':6,'Digit8':7};
            if (shipKeyMap[e.code] !== undefined) {
                const type = debugEnemyTypes[shipKeyMap[e.code]];
                this.spawnLeveledEnemies(type, 1);
                this.events.emit('ui:show-message', { title: 'CHEAT', subtitle: `Spawned ${type}`, duration: 1500 });
            }
            // Shift+9: toggle one-hit kill
            if (e.code === 'Digit9') {
                this.cheats.onePunchMan = !this.cheats.onePunchMan;
                const status = this.cheats.onePunchMan ? 'ON' : 'OFF';
                this.events.emit('ui:show-message', { title: 'ONE PUNCH MAN', subtitle: `One-hit kills ${status}`, duration: 2000 });
            }
            // Shift+-: add 100,000 coins
            if (e.code === 'Minus') {
                this.game.money += 100000;
                this.events.emit('ui:show-message', { title: 'FREE WILLY', subtitle: '+100,000 Coins!', duration: 2000 });
            }
            // Shift+0: add 100 SP
            if (e.code === 'Digit0') {
                this.player.skillPoints += 100;
                this.events.emit('ui:show-message', { title: 'CHEAT', subtitle: '+100 SP', duration: 1500 });
            }
            // Shift+letter: drop specific powerup near player
            const powerupKeyMap = {
                'KeyQ': 'RAPID_FIRE',
                'KeyW': 'MULTI_SHOT',
                'KeyE': 'HOMING',
                'KeyR': 'BIG_BULLETS',
                'KeyT': 'SPEED_BOOST',
                'KeyY': 'PIERCING',
                'KeyU': 'LONG_RANGE',
                'KeyI': 'EXPLOSIVE',
                'KeyO': 'CRIT_CHANCE',
                'KeyP': 'CRIT_DAMAGE',
                'KeyA': 'SHIELD_BOOST',
                'KeyS': 'MEDPACK',
                'KeyD': 'CHARGE_DAMAGE',
            };
            if (powerupKeyMap[e.code] && this.player) {
                const type = powerupKeyMap[e.code];
                const offsetX = random(-40, 40);
                const offsetY = random(-40, 40);
                this.dropPowerup(this.player.x + offsetX, this.player.y + offsetY, type);
                this.events.emit('ui:show-message', { title: 'CHEAT', subtitle: `Dropped ${type.replace(/_/g, ' ')}`, duration: 1500 });
            }
        }
    });

    // Handle game restart
    window.addEventListener('click', () => {
        if (this.game.state === GAME_STATES.GAME_OVER) {
            this.init();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' && this.game.state === GAME_STATES.GAME_OVER) {
            this.init();
        }
        // ESC closing the shop is handled by the global Escape handler at
        // the top of this file — it calls togglePause(), which routes
        // GAME_STATES.SHOP → closeShopToPause(). The old SPACE → closeShop
        // shortcut is gone (along with click-outside-to-close).
    });

    // Auto-pause when window loses focus
    window.addEventListener('blur', () => {
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.togglePause();
        }
    });

    // Entity targeting click handling (for gameplay)
    this.canvas.addEventListener('click', (e) => {
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
