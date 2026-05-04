// UI management for overlays, messages, and interface elements
import { MusicPlayer } from '../audio/music-player.js';
import { POWERUP_TYPES } from '../world/powerup.js';

export class UIManager {
    constructor() {
        this.elements = {};
        this.musicPlayer = new MusicPlayer();
        this.audioManager = null; // Will be set by the game
        this.initializeElements();
        this.setupMusicPlayer();
    }
    
    initializeElements() {
        // Get all UI elements
        this.elements = {
            score: document.getElementById('score'),
            livesDisplay: document.getElementById('lives-display'),
            waveDisplay: document.getElementById('wave-display'),
            pauseOverlay: document.getElementById('pause-overlay'),
            messageTitle: document.getElementById('message-title'), // Commented out in HTML
            messageSubtitle: document.getElementById('message-subtitle'), // Commented out in HTML
            // titleScreen: document.getElementById('title-screen'),
            // gameTitle: document.getElementById('game-title'),
            // highScoreDisplay: document.getElementById('high-score-display'),
            // Music elements (removed from main UI, only in pause menu)
            musicInfo: null, // Removed from main display
            trackName: null, // Removed from main display
            trackNameText: null, // Removed from main display
            musicProgress: null, // Removed from main display
            musicInfoCurrentTime: null, // Removed from main display
            musicInfoDuration: null, // Removed from main display
            shopButton: document.getElementById('shop-button'), // Commented out in HTML
            pauseShopButton: document.getElementById('pause-shop-button'),
            pauseResumeButton: document.getElementById('pause-resume-button'),
            // Music tab elements
            pauseTabs: document.querySelectorAll('.pause-tab'),
            tabContents: document.querySelectorAll('.pause-tab-content'),
            currentTrackName: document.getElementById('current-track-name'),
            musicCurrentTime: document.getElementById('music-current-time'),
            musicDuration: document.getElementById('music-duration'),
            musicPlayerProgress: document.getElementById('music-player-progress'),
            musicPlayerBuffered: document.getElementById('music-player-buffered'),
            musicPlayerProgressBar: document.getElementById('music-player-progress-bar'),
            musicPlayPause: document.getElementById('music-play-pause'),
            musicPrev: document.getElementById('music-prev'),
            musicNext: document.getElementById('music-next'),
            musicShuffle: document.getElementById('music-shuffle'),
            musicRandom: document.getElementById('music-random'),
            musicRepeat: document.getElementById('music-repeat'),
            playlistTracks: document.getElementById('playlist-tracks'),
            // Music volume elements
            musicVolumeSlider: document.getElementById('music-volume-slider'),
            musicVolumeValue: document.getElementById('music-volume-value'),
            // SFX elements
            sfxVolumeSlider: document.getElementById('sfx-volume-slider'),
            sfxVolumeValue: document.getElementById('sfx-volume-value'),
            sfxTogglesContainer: document.getElementById('sfx-toggles'),
            // Powerups tab elements
            // Powerups pause-tab (lives in the tab strip alongside Music
            // / SFX / Skills). Renders the same Offense/Drops sub-tabs +
            // card list that the standalone overlay used to show.
            powerupsItemsList: document.getElementById('powerups-items-list'),
            powerupsSubtabs: document.querySelectorAll('.powerups-subtab'),
            // HUD pause button (top-left)
            hudPauseBtn: document.getElementById('hud-pause-btn'),
            hudShopBtn: document.getElementById('hud-shop-btn')
        };
    }
    
    setupEventListeners() {
        // Reserved — currently no UIManager-owned listeners. Pause / shop /
        // music inputs are wired in setupMusicPlayer().
    }
    
    updateScore(money) {
        if (this.elements.score) {
            this.elements.score.textContent = `${Math.floor(money)}`;
        }
    }
    
    updateLives(lives) {
        // Lives are now rendered on the game canvas in drawCanvasTriforce() / updateHUD()
        if (this.elements.livesDisplay) {
            this.elements.livesDisplay.style.display = 'none';
        }
    }
    
    positionLivesDisplay() {
        // Check if lives display element exists (it's commented out in HTML)
        if (!this.elements.livesDisplay) {
            return;
        }
        
        // Position triforce all the way on the left, before the health bar
        const livesX = 10; // Far left position with small margin from edge
        
        // Position the lives display
        this.elements.livesDisplay.style.left = `${livesX}px`;
        this.elements.livesDisplay.style.top = '20px'; // Same as other HUD elements
    }
    
    drawTriforceFormation(ctx, lives, width, height) {
        const triangleSize = 12;
        const spacing = 2;
        
        // Calculate positions for perfect triforce formation
        const centerX = width / 2; // Center within the canvas (no additional offset needed)
        const topY = 8;
        const bottomY = topY + triangleSize + spacing - 1; // Move bottom row up by 1px
        
        // Triangle positions
        const topTriangle = { x: centerX, y: topY };
        const bottomLeftTriangle = { x: centerX - (triangleSize / 2 + spacing / 2), y: bottomY };
        const bottomRightTriangle = { x: centerX + (triangleSize / 2 + spacing / 2), y: bottomY };
        
        // Set triangle style
        ctx.fillStyle = '#FFD700'; // Gold
        ctx.strokeStyle = '#B8860B'; // Goldenrod border
        ctx.lineWidth = 1;
        
        // Draw triangles based on lives count
        if (lives >= 3) {
            // Full triforce: all 3 triangles
            this.drawTriangle(ctx, topTriangle.x, topTriangle.y, triangleSize);
            this.drawTriangle(ctx, bottomLeftTriangle.x, bottomLeftTriangle.y, triangleSize);
            this.drawTriangle(ctx, bottomRightTriangle.x, bottomRightTriangle.y, triangleSize);
        } else if (lives === 2) {
            // Bottom two triangles
            this.drawTriangle(ctx, bottomLeftTriangle.x, bottomLeftTriangle.y, triangleSize);
            this.drawTriangle(ctx, bottomRightTriangle.x, bottomRightTriangle.y, triangleSize);
        } else if (lives === 1) {
            // Bottom left triangle only
            this.drawTriangle(ctx, bottomLeftTriangle.x, bottomLeftTriangle.y, triangleSize);
        }
        // No triangles drawn for 0 lives
    }
    
    drawTriangle(ctx, centerX, centerY, size) {
        const height = size * 0.866; // Equilateral triangle height
        
        ctx.beginPath();
        // Top point
        ctx.moveTo(centerX, centerY - height / 2);
        // Bottom left
        ctx.lineTo(centerX - size / 2, centerY + height / 2);
        // Bottom right
        ctx.lineTo(centerX + size / 2, centerY + height / 2);
        ctx.closePath();
        
        // Fill and stroke
        ctx.fill();
        ctx.stroke();
    }
    
    updateWave(wave) {
        // Wave display element no longer exists - wave info now shown via spawn timers
        if (this.elements.waveDisplay) {
            this.elements.waveDisplay.textContent = `WAVE: ${wave}`;
        }
    }
    
    hideShopButton() {
        if (this.elements.shopButton) {
            this.elements.shopButton.style.display = 'none';
        }
    }
    
    showShopButton() {
        if (this.elements.shopButton) {
            this.elements.shopButton.style.display = 'block';
        }
    }

    showHudPauseBtn() {
        if (this.elements.hudPauseBtn) {
            this.elements.hudPauseBtn.style.display = 'flex';
        }
    }

    hideHudPauseBtn() {
        if (this.elements.hudPauseBtn) {
            this.elements.hudPauseBtn.style.display = 'none';
        }
    }

    showHudShopBtn() {
        if (this.elements.hudShopBtn) {
            this.elements.hudShopBtn.style.display = 'flex';
        }
    }

    hideHudShopBtn() {
        if (this.elements.hudShopBtn) {
            this.elements.hudShopBtn.style.display = 'none';
        }
    }
    
    showMessage(title, subtitle = '', duration = 0, position = 'center') {
        console.log(`🎯 UI Manager showMessage called: "${title}" | "${subtitle}" | duration: ${duration} | position: ${position}`);
        
        // Check if message elements exist (they're commented out in HTML)
        if (!this.elements.messageTitle || !this.elements.messageSubtitle) {
            console.log('Message elements are commented out, skipping message display');
            return;
        }
        
        this.elements.messageTitle.textContent = title;
        this.elements.messageTitle.style.display = 'block';
        this.elements.messageSubtitle.innerHTML = subtitle.replace(/\n/g, '<br>');
        this.elements.messageSubtitle.style.display = subtitle ? 'block' : 'none';
        
        // Reset opacity for new message
        this.elements.messageTitle.style.opacity = '1';
        this.elements.messageSubtitle.style.opacity = '1';
        
        // Position the message overlay
        const overlay = document.getElementById('game-message-overlay');
        if (overlay && position === 'top') {
            overlay.style.justifyContent = 'flex-start';
            overlay.style.paddingTop = '12.5vh'; // 7/8 from top = 1/8 from top = 12.5% of viewport height
            // Reset font size for top messages
            this.elements.messageTitle.style.fontSize = '48px';
            this.elements.messageSubtitle.style.fontSize = '20px';
        } else if (overlay && position === 'shop') {
            overlay.style.justifyContent = 'flex-end';
            overlay.style.paddingTop = '0';
            overlay.style.paddingBottom = '120px'; // Position above shop button
            // Smaller font size for shop position
            this.elements.messageTitle.style.fontSize = '24px';
            this.elements.messageSubtitle.style.fontSize = '14px';
        } else if (overlay) {
            overlay.style.justifyContent = 'center';
            overlay.style.paddingTop = '0';
            overlay.style.paddingBottom = '0';
            // Reset font size for center messages
            this.elements.messageTitle.style.fontSize = '48px';
            this.elements.messageSubtitle.style.fontSize = '20px';
        }
        
        if (duration > 0) {
            // Check if this is a wave message or level up message to apply slow fade-out
            const isWaveMessage = title.startsWith('WAVE ');
            const isLevelUpMessage = title.startsWith('LEVEL ');
            if (isWaveMessage || isLevelUpMessage) {
                // Show for 60% of duration, then fade out over remaining 40%
                const fadeStartTime = duration * 0.6;
                const fadeOutDuration = duration * 0.4;
                
                setTimeout(() => {
                    this.fadeOutMessage(fadeOutDuration);
                }, fadeStartTime);
            } else {
                // Regular instant hide for non-wave/non-levelup messages
                setTimeout(() => this.hideMessage(), duration);
            }
        }
    }
    
    fadeOutMessage(fadeOutDuration) {
        // Disable CSS animations that might interfere with fade-out
        this.elements.messageTitle.style.animation = 'none';
        this.elements.messageSubtitle.style.animation = 'none';
        
        // Force a reflow to ensure animation disable takes effect
        this.elements.messageTitle.offsetHeight;
        this.elements.messageSubtitle.offsetHeight;
        
        // Add smooth transition for opacity
        this.elements.messageTitle.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        this.elements.messageSubtitle.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        
        // Force another reflow to ensure transition is applied
        this.elements.messageTitle.offsetHeight;
        this.elements.messageSubtitle.offsetHeight;
        
        // Use requestAnimationFrame to ensure the transition starts properly
        requestAnimationFrame(() => {
            // Start fade out
            this.elements.messageTitle.style.opacity = '0';
            this.elements.messageSubtitle.style.opacity = '0';
        });
        
        // Hide completely after fade completes
        setTimeout(() => {
            this.hideMessage();
        }, fadeOutDuration);
    }

    hideMessage() {
        // Check if message elements exist (they're commented out in HTML)
        if (!this.elements.messageTitle || !this.elements.messageSubtitle) {
            return;
        }
        
        this.elements.messageTitle.style.display = 'none';
        this.elements.messageSubtitle.style.display = 'none';
        
        // Clear any transitions and restore animations
        this.elements.messageTitle.style.transition = '';
        this.elements.messageSubtitle.style.transition = '';
        this.elements.messageTitle.style.animation = '';
        this.elements.messageSubtitle.style.animation = '';
        
        // Reset positioning to center for next message
        const overlay = document.getElementById('game-message-overlay');
        if (overlay) {
            overlay.style.justifyContent = 'center';
            overlay.style.paddingTop = '0';
        }
    }
    
    togglePause() {
        if (!this.elements.pauseOverlay) {
            return;
        }
        
        const isPaused = this.elements.pauseOverlay.style.display === 'flex';
        if (isPaused) {
            this.elements.pauseOverlay.style.display = 'none';
        } else {
            this.elements.pauseOverlay.style.display = 'flex';

            // Update powerups list when pause menu is shown
            this.updatePowerupsList();

            // Sync music player button state when pause menu is shown
            this.syncMusicPlayerState();

            // Update controls tab for platform (mobile vs desktop)
            this.updateControlsTab();

            // Refresh weapon-equip tabs so the EQUIPPED badge stays current.
            this.updatePrimaryTab();
            this.updatePowerTab();
        }
        return !isPaused;
    }

    updateControlsTab() {
        const controlsTab = document.getElementById('controls-tab');
        if (!controlsTab) return;
        // Desktop-only build — single keyboard / mouse layout.
        controlsTab.innerHTML = `
            <h2>CONTROLS</h2>
            <div class="control-list">
                <div><span class="control-symbol">WASD</span> or <span class="control-symbol">ARROWS</span> Move</div>
                <div><span class="control-symbol">MOUSE</span> Aim</div>
                <div><span class="control-symbol">LEFT-CLICK</span><br>
                Fire primary weapon (keep holding)</div>
                <div><span class="control-symbol">RIGHT-CLICK</span> or <span class="control-symbol">SPACE</span><br>
                Fire power weapon (auto charges)</div>
                <div><span class="control-symbol">1</span> &ndash; <span class="control-symbol">4</span> Defense skills</div>
                <div><span class="control-symbol">ESC</span> Pause / Resume</div>
            </div>
        `;
    }

    // ── Pause-menu PRIMARY tab ─────────────────────────────────────────────
    // Lists every primary weapon. Click a row to equip it. Primaries are
    // free and always available — no `ownedPrimaries` gating.
    //
    // All DOM is built with createElement / textContent (no innerHTML) to
    // keep XSS risk impossible even if a future weapon-data entry contains
    // markup-flavored characters.
    updatePrimaryTab() {
        const list = document.getElementById('primary-weapon-list');
        if (!list) return;
        const player = this.gameEngine && this.gameEngine.player;
        if (!player) return;
        const PRIMARY = this.gameEngine.PRIMARY_WEAPONS_LIST;
        if (!PRIMARY) {
            list.replaceChildren();
            const placeholder = document.createElement('div');
            placeholder.style.color = '#888';
            placeholder.textContent = 'Weapon list unavailable.';
            list.appendChild(placeholder);
            return;
        }
        list.replaceChildren();
        for (const id of Object.keys(PRIMARY)) {
            const equipped = player.activePrimary === id;
            list.appendChild(this._buildWeaponRow(PRIMARY[id], id, equipped, '#00ccff', () => {
                if (player.ownedPrimaries && !player.ownedPrimaries.has(id)) {
                    player.ownedPrimaries.add(id);
                }
                player.equipPrimary(id);
                this.updatePrimaryTab();
            }));
        }
    }

    // ── Pause-menu POWER tab ───────────────────────────────────────────────
    // Lists every power weapon. Click a row to equip it. Powers are now
    // free and always available — same model as primaries. Upgrades are
    // still purchased in the shop's POWER tab (which surfaces the upgrades
    // for whichever power is currently equipped).
    updatePowerTab() {
        const list = document.getElementById('power-weapon-list');
        if (!list) return;
        const player = this.gameEngine && this.gameEngine.player;
        if (!player) return;
        const POWER = this.gameEngine.POWER_WEAPONS_LIST;
        if (!POWER) {
            list.replaceChildren();
            return;
        }
        list.replaceChildren();
        for (const id of Object.keys(POWER)) {
            const equipped = player.activePower === id;
            list.appendChild(this._buildWeaponRow(POWER[id], id, equipped, '#ffaa00', () => {
                // Auto-add to ownedPowers (set still gates equipPower).
                if (player.ownedPowers && !player.ownedPowers.has(id)) {
                    player.ownedPowers.add(id);
                }
                player.equipPower(id);
                this.updatePowerTab();
            }));
        }
    }

    // Shared row builder for both PRIMARY and POWER tabs.
    // No innerHTML anywhere — every text node is set via textContent.
    // The click listener wraps `onClick` with stopPropagation BEFORE calling
    // it, because `onClick` typically re-renders the tab via replaceChildren
    // — which detaches the clicked row. The bubbling click then reaches the
    // pause-overlay's dismissOnBackdrop handler, which calls
    // `e.target.closest('#pause-menu')`. On a detached node closest() walks
    // a null parent chain and returns null, so the backdrop misclassifies
    // the click as "outside menu" and toggles pause off. stopPropagation
    // prevents the bubble entirely.
    _buildWeaponRow(weaponDef, weaponId, equipped, defaultBorder, onClick) {
        const accent = (equipped && weaponDef.color) ? weaponDef.color : defaultBorder;
        const row = document.createElement('div');
        row.className = 'weapon-row';
        row.dataset.weaponId = weaponId;
        row.style.cssText = `
            display: flex; align-items: center; gap: 14px;
            padding: 12px 14px; border-radius: 8px; cursor: pointer;
            background: ${equipped ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.05)'};
            border: 2px solid ${equipped ? accent : 'rgba(255, 255, 255, 0.15)'};
            transition: background 0.15s, border-color 0.15s, transform 0.1s;
        `;

        const iconEl = document.createElement('span');
        iconEl.style.cssText = 'font-size: 28px; min-width: 36px; text-align: center;';
        iconEl.textContent = weaponDef.icon || '🔫';
        row.appendChild(iconEl);

        const body = document.createElement('div');
        body.style.cssText = 'flex: 1; text-align: left;';

        const nameRow = document.createElement('div');
        nameRow.style.cssText = `font-size: 14px; color: ${equipped ? accent : '#FFF'}; font-weight: bold;`;
        nameRow.textContent = weaponDef.name || weaponId;
        if (equipped) {
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size: 10px; color: #00ff88; margin-left: 8px;';
            badge.textContent = 'EQUIPPED';
            nameRow.appendChild(badge);
        }
        body.appendChild(nameRow);

        const descEl = document.createElement('div');
        descEl.style.cssText = 'font-size: 11px; color: #aaa; margin-top: 4px; line-height: 1.4;';
        descEl.textContent = weaponDef.description || '';
        body.appendChild(descEl);

        row.appendChild(body);

        row.addEventListener('mouseenter', () => {
            if (!equipped) row.style.background = 'rgba(255, 255, 255, 0.12)';
            row.style.transform = 'translateY(-1px)';
        });
        row.addEventListener('mouseleave', () => {
            if (!equipped) row.style.background = 'rgba(255, 255, 255, 0.05)';
            row.style.transform = 'none';
        });
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return row;
    }
    
    // showTitleScreen() {
    //     this.elements.titleScreen.style.display = 'flex';
    // }
    
    // hideTitleScreen() {
    //     this.elements.titleScreen.style.display = 'none';
    // }
    
    // setupTitleScreen() {
    //     const titleText = "RAINBOIDS";
    //     this.elements.gameTitle.innerHTML = '';
    //     titleText.split('').forEach((char, index) => {
    //         const span = document.createElement('span');
    //         span.textContent = char;
    //         span.className = 'title-char';
    //         span.style.animationDelay = `${index * 0.1}s`;
    //         this.elements.gameTitle.appendChild(span);
    //     });
    // }
    
    // updateHighScore(highScore) {
    //     this.elements.highScoreDisplay.textContent = `HIGH SCORE: ${highScore}`;
    // }
    
    checkOrientation() {
        // Desktop-only build: no orientation handling. Kept as a no-op so the
        // ui:check-orientation event bus subscription stays valid.
        return false;
    }
    
    // Currently-active sub-tab in the Powerups pause-tab.
    // Persisted on the instance so subsequent renders remember it.
    _powerupsSubTab = 'OFFENSE';

    setPowerupsSubTab(sub) {
        this._powerupsSubTab = sub;
        if (this.elements.powerupsSubtabs) {
            this.elements.powerupsSubtabs.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.subtab === sub);
            });
        }
        this.renderPowerupsOverlay();
    }

    // Render the Powerups overlay — shows EVERY known powerup in the
    // selected category with its current stack count (0 for ones the
    // player hasn't picked up yet). Mirrors the shop-card visual so
    // the screen reads as a "collection" page.
    renderPowerupsOverlay() {
        if (!this.elements.powerupsItemsList || !this.gameEngine?.player) return;
        const list = this.elements.powerupsItemsList;
        list.replaceChildren();

        const player = this.gameEngine.player;
        const sub = this._powerupsSubTab;

        const entries = Object.entries(POWERUP_TYPES).filter(
            ([, cfg]) => (cfg.category || 'OFFENSE') === sub,
        );

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align: center; color: #888; padding: 40px; font-family: monospace;';
            empty.textContent = 'No powerups in this category.';
            list.appendChild(empty);
            return;
        }

        for (const [type, cfg] of entries) {
            const stacks = player.getPowerupStacks ? player.getPowerupStacks(type) : 0;
            const owned = stacks > 0;

            const card = document.createElement('div');
            card.className = 'powerup-card' + (owned ? ' powerup-card--owned' : ' powerup-card--locked');

            const iconWrap = document.createElement('div');
            iconWrap.className = 'powerup-card-icon';
            iconWrap.textContent = cfg.icon || '⭐';
            iconWrap.style.color = cfg.color || '#cccccc';
            card.appendChild(iconWrap);

            const body = document.createElement('div');
            body.className = 'powerup-card-body';

            const name = document.createElement('div');
            name.className = 'powerup-card-name';
            // Show full name + abbreviation parenthetically, e.g.
            // "Pierce (PRC)" — keeps the player learning the codes
            // they see on the bottom-of-screen HUD badges.
            const abbr = cfg.abbr || (cfg.name || type).slice(0, 3).toUpperCase();
            name.textContent = `${cfg.name || type} (${abbr})`;
            name.style.color = cfg.color || '#ffffff';
            body.appendChild(name);

            const desc = document.createElement('div');
            desc.className = 'powerup-card-desc';
            desc.textContent = cfg.description || '';
            body.appendChild(desc);

            card.appendChild(body);

            const right = document.createElement('div');
            right.className = 'powerup-card-stacks';
            right.textContent = owned ? `×${stacks}` : '—';
            card.appendChild(right);

            list.appendChild(card);
        }
    }

    // Back-compat shim — older event subscriptions still call this.
    updatePowerupsList() { this.renderPowerupsOverlay(); }
    
    setGameEngine(gameEngine) {
        this.gameEngine = gameEngine;
    }

    setAudioManager(audioManager) {
        this.audioManager = audioManager;
        this.setupSfxControls();
        this.setupMusicVolumeControl();
    }
    
    setupSfxControls() {
        if (!this.audioManager || !this.elements.sfxVolumeSlider) return;
        
        // Set initial value (50% on slider = 10% actual volume)
        const initialVolume = this.audioManager.getSfxVolume() * 100;
        this.elements.sfxVolumeSlider.value = initialVolume;
        this.updateSfxVolumeDisplay(initialVolume);
        
        // Handle slider changes
        this.elements.sfxVolumeSlider.addEventListener('input', (e) => {
            const sliderValue = e.target.value;
            const normalizedVolume = sliderValue / 100;
            this.audioManager.setSfxVolume(normalizedVolume);
            this.updateSfxVolumeDisplay(sliderValue);
        });
    }
    
    updateSfxVolumeDisplay(sliderValue) {
        // Convert slider value (0-100) to actual volume percentage (0-20%)
        const actualVolume = Math.round(sliderValue * 0.2);
        this.elements.sfxVolumeValue.textContent = `${actualVolume}%`;
    }
    
    setupMusicVolumeControl() {
        if (!this.elements.musicVolumeSlider) return;
        
        // Set initial value
        const initialVolume = this.musicPlayer.getVolume() * 100;
        this.elements.musicVolumeSlider.value = initialVolume;
        this.elements.musicVolumeValue.textContent = `${Math.round(initialVolume)}%`;
        
        // Handle slider changes
        this.elements.musicVolumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            this.musicPlayer.setVolume(volume);
            this.elements.musicVolumeValue.textContent = `${e.target.value}%`;
        });
        
        // Create sound effect toggles
        this.createSfxToggles();
    }
    
    createSfxToggles() {
        if (!this.audioManager || !this.elements.sfxTogglesContainer) return;
        
        const soundNames = this.audioManager.getSoundNames();
        const friendlyNames = {
            shoot: 'Shooting',
            hit: 'Hit/Damage',
            coin: 'Pickup',
            explosion: 'Asteroid Explosion',
            playerExplosion: 'Player Explosion',
            thruster: 'Thruster',
            tractorBeam: 'Tractor Beam'
        };
        
        soundNames.forEach(soundName => {
            const toggleDiv = document.createElement('div');
            toggleDiv.className = 'sfx-toggle';
            
            const label = document.createElement('span');
            label.className = 'sfx-toggle-label';
            label.textContent = friendlyNames[soundName] || soundName;
            
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'sfx-controls';
            
            // Test button
            const testButton = document.createElement('button');
            testButton.className = 'sfx-test-button';
            testButton.textContent = '♪';
            testButton.title = 'Test sound';
            testButton.addEventListener('click', () => {
                if (this.audioManager.isSoundEnabled(soundName)) {
                    this.audioManager.playSound(soundName);
                }
            });
            
            // Toggle switch
            const switchDiv = document.createElement('div');
            switchDiv.className = 'sfx-toggle-switch active';
            switchDiv.dataset.sound = soundName;
            
            // Handle toggle clicks
            switchDiv.addEventListener('click', () => {
                const isEnabled = !this.audioManager.isSoundEnabled(soundName);
                this.audioManager.setSoundEnabled(soundName, isEnabled);
                switchDiv.classList.toggle('active', isEnabled);
            });
            
            controlsDiv.appendChild(testButton);
            controlsDiv.appendChild(switchDiv);
            
            toggleDiv.appendChild(label);
            toggleDiv.appendChild(controlsDiv);
            this.elements.sfxTogglesContainer.appendChild(toggleDiv);
        });
    }
    
    setupMusicPlayer() {
        // Set up music player callbacks
        this.musicPlayer.onTrackChange = (track) => {
            this.updateTrackDisplay(track);
            this.updatePlaylistDisplay();
        };

        // Fires when the playlist array itself is reordered (e.g. shuffle).
        // We rebuild the rendered DOM list so the highlighted row and the
        // playing audio are always pointing at the same track.
        this.musicPlayer.onPlaylistChange = () => {
            this.populatePlaylist();
        };
        
        this.musicPlayer.onPlayStateChange = (isPlaying) => {
            if (this.elements.musicPlayPause) {
                this.elements.musicPlayPause.textContent = isPlaying ? '⏸' : '▶';
            }
        };
        
        this.musicPlayer.onProgressUpdate = (progress, currentTime, duration) => {
            this.updateProgress(progress, currentTime, duration);
        };

        // Buffered (downloaded) fraction — drives the ghost fill behind
        // the playback bar so the user can see how much is loaded.
        this.musicPlayer.onBufferedUpdate = (fraction) => {
            if (this.elements.musicPlayerBuffered) {
                this.elements.musicPlayerBuffered.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
            }
        };
        
        // Set up event listeners (skip music info since it's removed)
        if (this.elements.musicInfo) {
            this.elements.musicInfo.addEventListener('click', () => {
                this.showMusicTab();
            });
        }
        
        if (this.elements.shopButton) {
            this.elements.shopButton.addEventListener('click', () => {
                if (this.gameEngine) {
                    // Pause game and open shop
                    this.gameEngine.togglePause();
                    this.gameEngine.openShop();
                }
            });
        }
        
        // Pause overlay backdrop dismiss (tap outside menu unpauses)
        if (this.elements.pauseOverlay) {
            const dismissOnBackdrop = (e) => {
                if (!e.target.closest('#pause-menu')) {
                    if (this.gameEngine) this.gameEngine.togglePause();
                }
            };
            this.elements.pauseOverlay.addEventListener('click', dismissOnBackdrop);
        }

        // Pause menu action buttons
        if (this.elements.pauseShopButton) {
            this.elements.pauseShopButton.addEventListener('click', () => {
                if (this.gameEngine) {
                    this.elements.pauseOverlay.style.display = 'none';
                    this.gameEngine.openShop();
                } else {
                    console.error('❌ this.gameEngine not available for shop button');
                }
            });
        } else {
            console.error('❌ pauseShopButton element not found!');
        }

        // Powerups sub-tab buttons (Offense / Drops) inside the
        // Powerups pause-tab. Re-rendering hits the live cards.
        if (this.elements.powerupsSubtabs) {
            this.elements.powerupsSubtabs.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setPowerupsSubTab(btn.dataset.subtab);
                });
            });
        }

        if (this.elements.pauseResumeButton) {
            this.elements.pauseResumeButton.addEventListener('click', () => {
                if (this.gameEngine) {
                    this.gameEngine.togglePause();
                }
            });
        }

        if (this.elements.hudPauseBtn) {
            this.elements.hudPauseBtn.addEventListener('click', () => {
                if (this.gameEngine) {
                    this.gameEngine.togglePause();
                }
            });
        }

        // HUD shop button — top-right, sits next to the pause button.
        // Lets the player jump into the shop at any time during play
        // (also auto-opens between waves; see wave-manager.js).
        if (this.elements.hudShopBtn) {
            this.elements.hudShopBtn.addEventListener('click', () => {
                if (this.gameEngine) this.gameEngine.openShop();
            });
        }

        // Tab switching
        this.elements.pauseTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });
        
        // Music controls
        this.elements.musicPlayPause.addEventListener('click', () => {
            this.musicPlayer.togglePlayPause();
        });
        
        this.elements.musicPrev.addEventListener('click', () => {
            this.musicPlayer.previous();
        });
        
        this.elements.musicNext.addEventListener('click', () => {
            this.musicPlayer.next();
        });
        
        // Shuffle button: re-orders the playlist and starts the new track 0.
        // Snap the scroll position back to the top so the user sees the
        // freshly-shuffled order from the start, with the now-playing
        // track 0 sitting at the top. Brief 'active' flash gives visual
        // confirmation that something happened.
        this.elements.musicShuffle.addEventListener('click', () => {
            this.musicPlayer.shuffleAndPlay();
            if (this.elements.playlistTracks) {
                this.elements.playlistTracks.scrollTop = 0;
            }
            this.elements.musicShuffle.classList.add('active');
            setTimeout(() => this.elements.musicShuffle.classList.remove('active'), 250);
        });

        // Random button: jump straight to a random track without
        // touching playlist order. Scroll the playlist so the user can
        // see which track was picked. Same brief flash for feedback.
        if (this.elements.musicRandom) {
            this.elements.musicRandom.addEventListener('click', () => {
                this.musicPlayer.playRandomTrack();
                this.scrollToCurrentTrack();
                this.elements.musicRandom.classList.add('active');
                setTimeout(() => this.elements.musicRandom.classList.remove('active'), 250);
            });
        }
        
        this.elements.musicRepeat.addEventListener('click', () => {
            // Toggle repeat-one mode only
            const isRepeatOne = this.elements.musicRepeat.classList.toggle('active');
            this.elements.musicRepeat.classList.toggle('repeat-one', isRepeatOne);
            // Set repeat-one mode in the music player
            if (isRepeatOne) {
                this.musicPlayer.setRepeatOne(true);
            } else {
                this.musicPlayer.setRepeatOne(false);
            }
        });
        
        // Progress bar click
        this.elements.musicPlayerProgressBar.addEventListener('click', (e) => {
            const rect = this.elements.musicPlayerProgressBar.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            this.musicPlayer.seek(percentage);
        });
        
        // Display initial track if loaded
        const currentTrack = this.musicPlayer.getCurrentTrack();
        if (currentTrack) {
            this.updateTrackDisplay(currentTrack);
        }
        
        // Populate playlist
        this.populatePlaylist();
    }
    
    populatePlaylist() {
        if (!this.elements.playlistTracks) return;
        
        // Clear existing tracks
        this.elements.playlistTracks.innerHTML = '';
        
        // Add all tracks from the music player
        this.musicPlayer.playlist.forEach((track, index) => {
            const trackElement = document.createElement('div');
            trackElement.className = 'playlist-track';
            
            // Create inner span for content
            const contentSpan = document.createElement('span');
            contentSpan.className = 'playlist-track-content';
            contentSpan.innerHTML = `${track.name} · <span style="color: #00ccff;">${track.artist}</span>`;
            
            trackElement.appendChild(contentSpan);
            trackElement.dataset.index = index;

            // Mark current track as playing
            if (index === this.musicPlayer.currentTrackIndex) {
                trackElement.classList.add('playing');
            }

            // Add click handler
            trackElement.addEventListener('click', () => {
                this.musicPlayer.loadTrack(index);
                this.musicPlayer.play();
                this.updatePlaylistDisplay();
            });

            this.elements.playlistTracks.appendChild(trackElement);
        });
    }

    updateTrackDisplay(track) {
        // Format track display
        const trackDisplay = `<span style="color: #00ff00;">${track.name}</span>&nbsp;<span style="color: #666;">·</span>&nbsp;<span style="color: #00ccff;">${track.artist || 'unknown'}</span>`;

        // Update music info box (skip since removed from main UI)
        if (this.elements.trackNameText) {
            this.elements.trackNameText.innerHTML = trackDisplay;
        }

        // Update pause menu current track
        if (this.elements.currentTrackName) {
            this.elements.currentTrackName.innerHTML = trackDisplay;
        }
    }

    updateProgress(progress, currentTime, duration) {
        // Update main music info (skip since removed from main UI)
        if (this.elements.musicProgress) {
            this.elements.musicProgress.style.width = `${progress * 100}%`;
        }
        
        // Update pause menu music player
        if (this.elements.musicPlayerProgress) {
            this.elements.musicPlayerProgress.style.width = `${progress * 100}%`;
        }
        
        // Update time displays (skip main UI, only update pause menu)
        if (this.elements.musicInfoCurrentTime) {
            this.elements.musicInfoCurrentTime.textContent = this.formatTime(currentTime);
        }
        if (this.elements.musicInfoDuration) {
            this.elements.musicInfoDuration.textContent = this.formatTime(duration);
        }
        if (this.elements.musicCurrentTime) {
            this.elements.musicCurrentTime.textContent = this.formatTime(currentTime);
        }
        if (this.elements.musicDuration) {
            this.elements.musicDuration.textContent = this.formatTime(duration);
        }
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    showMusicTab() {
        // Pause the game
        if (this.gameEngine) {
            this.gameEngine.togglePause();
        }
        
        // Switch to music tab
        this.switchTab('music');
    }
    
    switchTab(tabName) {
        this.elements.pauseTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        this.elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
        
        if (tabName === 'music') {
            this.syncMusicPlayerState();
        }

        // Refresh equip lists when their tabs are opened.
        if (tabName === 'primary') this.updatePrimaryTab();
        if (tabName === 'power') this.updatePowerTab();
        if (tabName === 'skills') this.updateSkillsTab();

        // Re-render the Powerups card list whenever the tab is opened
        // so stack counts reflect current state.
        if (tabName === 'powerups') this.renderPowerupsOverlay();
    }
    
    startMusic() {
        this.musicPlayer.play();
    }
    
    syncMusicPlayerState() {
        // Update play/pause button to match current music player state
        const isPlaying = this.musicPlayer.isPlaying;
        this.elements.musicPlayPause.textContent = isPlaying ? '⏸' : '▶';
        
        // Ensure playlist display is correct for first track
        this.updatePlaylistDisplay();
    }
    
    updatePlaylistDisplay() {
        // Update playing status in playlist
        const tracks = this.elements.playlistTracks.querySelectorAll('.playlist-track');
        tracks.forEach((track, index) => {
            if (index === this.musicPlayer.currentTrackIndex) {
                track.classList.add('playing');
            } else {
                track.classList.remove('playing');
            }
        });
    }

    // Scroll the playlist container so the currently playing track is
    // visible (and roughly centered). Used when the user jumps via the
    // random button — without this, the player would silently start a
    // track buried far down in the list.
    scrollToCurrentTrack() {
        if (!this.elements.playlistTracks) return;
        const active = this.elements.playlistTracks.querySelector('.playlist-track.playing');
        if (active && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    // ── Pause-menu SKILLS tab (5.64.11) ────────────────────────────────────
    // Lists every defense skill. Click a row to equip it. Skills are now
    // free and always available — same model as primaries / powers.
    // Replaces the previous 4-slot assignment UI; a single equipped skill
    // is shown on the HUD and activated with Space.
    updateSkillsTab() {
        const list = document.getElementById('skill-list');
        if (!list) return;
        const ge = this.gameEngine;
        const player = ge && ge.player;
        if (!player) return;
        const SKILLS = ge._defenseSkillsRef;
        if (!SKILLS) {
            list.replaceChildren();
            return;
        }
        list.replaceChildren();
        for (const id of Object.keys(SKILLS)) {
            const equipped = player.activeSkill === id;
            list.appendChild(this._buildWeaponRow(SKILLS[id], id, equipped, '#ff88dd', () => {
                player.equipSkill(id);
                this.updateSkillsTab();
            }));
        }
    }
}