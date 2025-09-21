// UI management for overlays, messages, and interface elements
import { checkOrientation } from './utils.js';
import { MusicPlayer } from './music-player.js';

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
            messageTitle: document.getElementById('message-title'),
            messageSubtitle: document.getElementById('message-subtitle'),
            mobileControls: document.getElementById('mobile-controls'),
            // titleScreen: document.getElementById('title-screen'),
            // gameTitle: document.getElementById('game-title'),
            orientationOverlay: document.getElementById('orientation-overlay'),
            // highScoreDisplay: document.getElementById('high-score-display'),
            // Music elements (removed from main UI, only in pause menu)
            musicInfo: null, // Removed from main display
            trackName: null, // Removed from main display
            trackNameText: null, // Removed from main display
            musicProgress: null, // Removed from main display
            musicInfoCurrentTime: null, // Removed from main display
            musicInfoDuration: null, // Removed from main display
            shopButton: document.getElementById('shop-button'),
            pauseShopButton: document.getElementById('pause-shop-button'),
            pauseResumeButton: document.getElementById('pause-resume-button'),
            // Music tab elements
            pauseTabs: document.querySelectorAll('.pause-tab'),
            tabContents: document.querySelectorAll('.pause-tab-content'),
            currentTrackName: document.getElementById('current-track-name'),
            musicCurrentTime: document.getElementById('music-current-time'),
            musicDuration: document.getElementById('music-duration'),
            musicPlayerProgress: document.getElementById('music-player-progress'),
            musicPlayerProgressBar: document.getElementById('music-player-progress-bar'),
            musicPlayPause: document.getElementById('music-play-pause'),
            musicPrev: document.getElementById('music-prev'),
            musicNext: document.getElementById('music-next'),
            musicShuffle: document.getElementById('music-shuffle'),
            musicRepeat: document.getElementById('music-repeat'),
            playlistTracks: document.getElementById('playlist-tracks'),
            // Music volume elements
            musicVolumeSlider: document.getElementById('music-volume-slider'),
            musicVolumeValue: document.getElementById('music-volume-value'),
            // SFX elements
            sfxVolumeSlider: document.getElementById('sfx-volume-slider'),
            sfxVolumeValue: document.getElementById('sfx-volume-value'),
            sfxTogglesContainer: document.getElementById('sfx-toggles'),
            rerollAllSfxButton: document.getElementById('reroll-all-sfx'),
            // Powerups tab elements
            powerupsList: document.getElementById('powerups-list'),
            noPowerups: document.getElementById('no-powerups')
        };
    }
    
    setupEventListeners() {
        // Mobile event listeners removed - using unified pause system
    }
    
    updateScore(money) {
        this.elements.score.textContent = `${Math.floor(money)}`;
    }
    
    updateLives(lives) {
        if (this.elements.livesDisplay) {
            // Show the lives display when game starts
            this.elements.livesDisplay.style.display = 'block';
            
            // Position lives display relative to other HUD elements
            this.positionLivesDisplay();
            
            // Clear existing content and render triangles manually
            this.elements.livesDisplay.innerHTML = '';
            
            // Create canvas for manual triangle rendering
            const canvas = document.createElement('canvas');
            canvas.width = 60;
            canvas.height = 40;
            canvas.style.display = 'block';
            canvas.style.background = 'transparent'; // Ensure transparent background
            
            const ctx = canvas.getContext('2d');
            
            // Clear canvas with transparent background
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw triangles based on lives count
            this.drawTriforceFormation(ctx, lives, canvas.width, canvas.height);
            
            // Add canvas to lives display
            this.elements.livesDisplay.appendChild(canvas);
            
            // Change intensity based on lives remaining
            if (lives <= 1) {
                this.elements.livesDisplay.style.filter = 'brightness(1.2)';
            } else if (lives <= 2) {
                this.elements.livesDisplay.style.filter = 'brightness(1.1)';
            } else {
                this.elements.livesDisplay.style.filter = 'brightness(1.0)';
            }
        }
    }
    
    positionLivesDisplay() {
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
    
    showMessage(title, subtitle = '', duration = 0, position = 'center') {
        this.elements.messageTitle.textContent = title;
        this.elements.messageTitle.style.display = 'block';
        this.elements.messageSubtitle.innerHTML = subtitle.replace(/\n/g, '<br>');
        this.elements.messageSubtitle.style.display = subtitle ? 'block' : 'none';
        
        // Reset opacity for new message
        this.elements.messageTitle.style.opacity = '1';
        this.elements.messageSubtitle.style.opacity = '1';
        
        // Position the message overlay
        const overlay = document.getElementById('game-message-overlay');
        if (position === 'top') {
            overlay.style.justifyContent = 'flex-start';
            overlay.style.paddingTop = '12.5vh'; // 7/8 from top = 1/8 from top = 12.5% of viewport height
            // Reset font size for top messages
            this.elements.messageTitle.style.fontSize = '48px';
            this.elements.messageSubtitle.style.fontSize = '20px';
        } else if (position === 'shop') {
            overlay.style.justifyContent = 'flex-end';
            overlay.style.paddingTop = '0';
            overlay.style.paddingBottom = '180px'; // Position well above shop button to avoid overlap
            // Smaller font size for shop position
            this.elements.messageTitle.style.fontSize = '24px';
            this.elements.messageSubtitle.style.fontSize = '14px';
        } else {
            overlay.style.justifyContent = 'center';
            overlay.style.paddingTop = '0';
            overlay.style.paddingBottom = '0';
            // Reset font size for center messages
            this.elements.messageTitle.style.fontSize = '48px';
            this.elements.messageSubtitle.style.fontSize = '20px';
        }
        
        if (duration > 0) {
            // Check if this is a wave message to apply slow fade-out
            const isWaveMessage = title.startsWith('WAVE ');
            if (isWaveMessage) {
                // Show for 60% of duration, then fade out over remaining 40%
                const fadeStartTime = duration * 0.6;
                const fadeOutDuration = duration * 0.4;
                
                setTimeout(() => {
                    this.fadeOutMessage(fadeOutDuration);
                }, fadeStartTime);
            } else {
                // Regular instant hide for non-wave messages
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
        this.elements.messageTitle.style.display = 'none';
        this.elements.messageSubtitle.style.display = 'none';
        
        // Clear any transitions and restore animations
        this.elements.messageTitle.style.transition = '';
        this.elements.messageSubtitle.style.transition = '';
        this.elements.messageTitle.style.animation = '';
        this.elements.messageSubtitle.style.animation = '';
        
        // Reset positioning to center for next message
        const overlay = document.getElementById('game-message-overlay');
        overlay.style.justifyContent = 'center';
        overlay.style.paddingTop = '0';
    }
    
    togglePause() {
        const isPaused = this.elements.pauseOverlay.style.display === 'flex';
        if (isPaused) {
            this.elements.pauseOverlay.style.display = 'none';
        } else {
            this.elements.pauseOverlay.style.display = 'flex';
            
            // Update powerups list when pause menu is shown
            this.updatePowerupsList();
            
            // Sync music player button state when pause menu is shown
            this.syncMusicPlayerState();
            
            // Check marquee for playing track when pause menu is shown
            this.checkPlaylistMarquees();
        }
        return !isPaused;
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
        // Portrait mode now supported
        this.elements.orientationOverlay.style.display = 'none';
        return false;
    }
    
    updatePowerupsList() {
        if (!this.elements.powerupsList || !window.game?.player) return;
        
        const player = window.game.player;
        const powerups = Array.from(player.powerups.entries());
        
        if (powerups.length === 0) {
            this.elements.noPowerups.style.display = 'block';
            // Clear any existing powerup items
            const existingItems = this.elements.powerupsList.querySelectorAll('.powerup-item');
            existingItems.forEach(item => item.remove());
            return;
        }
        
        this.elements.noPowerups.style.display = 'none';
        
        // Clear existing items
        const existingItems = this.elements.powerupsList.querySelectorAll('.powerup-item');
        existingItems.forEach(item => item.remove());
        
        // Add each powerup
        powerups.forEach(([type, powerupData]) => {
            const item = document.createElement('div');
            item.className = 'powerup-item';
            item.style.cssText = `
                display: flex;
                align-items: center;
                margin-bottom: 15px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                font-family: 'Silkscreen', monospace;
            `;
            
            const icon = document.createElement('div');
            icon.style.cssText = `
                font-size: 24px;
                margin-right: 15px;
                min-width: 30px;
                text-align: center;
            `;
            icon.textContent = powerupData.config.icon || '⭐';
            
            const info = document.createElement('div');
            info.style.cssText = `
                flex: 1;
                font-size: 12px;
                line-height: 1.4;
            `;
            
            const name = document.createElement('div');
            name.style.cssText = `
                color: #00ccff;
                font-weight: bold;
                margin-bottom: 4px;
                font-size: 14px;
            `;
            name.textContent = powerupData.config.name || type;
            
            const details = document.createElement('div');
            details.style.cssText = `
                color: #cccccc;
                font-size: 11px;
            `;
            
            if (powerupData.isPermanent) {
                if (powerupData.stacks > 1) {
                    details.innerHTML = `Level ${powerupData.stacks}<br>🔒 Permanent`;
                } else {
                    details.innerHTML = '🔒 Permanent';
                }
            } else {
                const timeLeft = Math.ceil(powerupData.timeRemaining / 1000);
                if (powerupData.stacks > 1) {
                    details.innerHTML = `Level ${powerupData.stacks}<br>⏰ ${timeLeft}s remaining`;
                } else {
                    details.innerHTML = `⏰ ${timeLeft}s remaining`;
                }
            }
            
            info.appendChild(name);
            info.appendChild(details);
            item.appendChild(icon);
            item.appendChild(info);
            
            this.elements.powerupsList.appendChild(item);
        });
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
        
        // Setup reroll all button
        this.setupRerollAllButton();
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
            
            // Re-roll button
            const rerollButton = document.createElement('button');
            rerollButton.className = 'sfx-reroll-button';
            rerollButton.textContent = '🎲';
            rerollButton.title = 'Generate new sound';
            rerollButton.addEventListener('click', () => {
                this.audioManager.rerollSound(soundName);
                
                // Visual feedback - brief animation
                const originalText = rerollButton.textContent;
                rerollButton.textContent = '✨';
                rerollButton.style.background = 'rgba(0, 255, 0, 0.3)';
                rerollButton.style.borderColor = 'rgba(0, 255, 0, 0.7)';
                rerollButton.style.transform = 'scale(1.1)';
                
                setTimeout(() => {
                    rerollButton.textContent = originalText;
                    rerollButton.style.background = 'rgba(255, 165, 0, 0.2)';
                    rerollButton.style.borderColor = 'rgba(255, 165, 0, 0.5)';
                    rerollButton.style.transform = 'scale(1)';
                }, 300);
                
                // Optionally play the new sound for immediate feedback
                if (this.audioManager.isSoundEnabled(soundName)) {
                    setTimeout(() => {
                        this.audioManager.playSound(soundName);
                    }, 100);
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
            controlsDiv.appendChild(rerollButton);
            controlsDiv.appendChild(switchDiv);
            
            toggleDiv.appendChild(label);
            toggleDiv.appendChild(controlsDiv);
            this.elements.sfxTogglesContainer.appendChild(toggleDiv);
        });
    }
    
    setupRerollAllButton() {
        if (!this.elements.rerollAllSfxButton || !this.audioManager) return;
        
        this.elements.rerollAllSfxButton.addEventListener('click', () => {
            this.audioManager.rerollAllSounds();
            
            // Visual feedback - brief flash effect
            const originalText = this.elements.rerollAllSfxButton.textContent;
            this.elements.rerollAllSfxButton.textContent = '✨ REROLLED!';
            this.elements.rerollAllSfxButton.style.background = 'rgba(0, 255, 0, 0.3)';
            this.elements.rerollAllSfxButton.style.borderColor = 'rgba(0, 255, 0, 0.7)';
            
            setTimeout(() => {
                this.elements.rerollAllSfxButton.textContent = originalText;
                this.elements.rerollAllSfxButton.style.background = 'rgba(255, 165, 0, 0.2)';
                this.elements.rerollAllSfxButton.style.borderColor = 'rgba(255, 165, 0, 0.5)';
            }, 1000);
        });
        
        // Add hover effect
        this.elements.rerollAllSfxButton.addEventListener('mouseenter', () => {
            this.elements.rerollAllSfxButton.style.background = 'rgba(255, 165, 0, 0.3)';
            this.elements.rerollAllSfxButton.style.borderColor = 'rgba(255, 165, 0, 0.7)';
            this.elements.rerollAllSfxButton.style.transform = 'scale(1.05)';
        });
        
        this.elements.rerollAllSfxButton.addEventListener('mouseleave', () => {
            this.elements.rerollAllSfxButton.style.background = 'rgba(255, 165, 0, 0.2)';
            this.elements.rerollAllSfxButton.style.borderColor = 'rgba(255, 165, 0, 0.5)';
            this.elements.rerollAllSfxButton.style.transform = 'scale(1)';
        });
    }
    
    setupMusicPlayer() {
        // Set up music player callbacks
        this.musicPlayer.onTrackChange = (track) => {
            this.updateTrackDisplay(track);
            this.updatePlaylistDisplay();
        };
        
        this.musicPlayer.onPlayStateChange = (isPlaying) => {
            this.elements.musicPlayPause.textContent = isPlaying ? '⏸' : '▶';
        };
        
        this.musicPlayer.onProgressUpdate = (progress, currentTime, duration) => {
            this.updateProgress(progress, currentTime, duration);
        };
        
        // Set up event listeners (skip music info since it's removed)
        if (this.elements.musicInfo) {
            this.elements.musicInfo.addEventListener('click', () => {
                this.showMusicTab();
            });
        }
        
        this.elements.shopButton.addEventListener('click', () => {
            if (window.game) {
                // Pause game and open shop
                window.game.game.state = window.game.GAME_STATES?.PAUSED || 'PAUSED';
                window.game.openShop();
            }
        });
        
        // Pause menu action buttons
        if (this.elements.pauseShopButton) {
            this.elements.pauseShopButton.addEventListener('click', () => {
                if (window.game) {
                    // Close pause menu and open shop
                    this.elements.pauseOverlay.style.display = 'none';
                    window.game.openShop();
                } else {
                    console.error('❌ window.game not available for shop button');
                }
            });
        } else {
            console.error('❌ pauseShopButton element not found!');
        }
        
        // if (this.elements.pauseResumeButton) {
        //     this.elements.pauseResumeButton.addEventListener('click', () => {
        //         if (window.game) {
        //             window.game.togglePause();
        //         } else {
        //             console.error('❌ window.game not available for resume button');
        //         }
        //     });
        // } else {
        //     console.error('❌ pauseResumeButton element not found!');
        // }
        
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
        
        this.elements.musicShuffle.addEventListener('click', () => {
            const isShuffled = this.musicPlayer.toggleShuffle();
            this.elements.musicShuffle.classList.toggle('active', isShuffled);
        });
        
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
                // Store references for later marquee check
                trackElement._contentSpan = contentSpan;
                trackElement._marqueeChecked = false;
            }
            
            // Add click handler
            trackElement.addEventListener('click', () => {
                this.musicPlayer.loadTrack(index);
                this.musicPlayer.play();
                this.updatePlaylistDisplay();
            });
            
            // Add hover handlers for marquee effect (only for non-playing tracks)
            this.addPlaylistTrackHoverEffects(trackElement, contentSpan);
            
            this.elements.playlistTracks.appendChild(trackElement);
        });
    }
    
    addPlaylistTrackHoverEffects(trackElement, contentSpan) {
        trackElement.addEventListener('mouseenter', () => {
            // Don't apply hover marquee if this is the playing track (already has marquee)
            if (trackElement.classList.contains('playing')) return;
            
            // Check if content overflows
            const trackWidth = trackElement.offsetWidth - 30; // Subtract padding
            const contentWidth = contentSpan.scrollWidth;
            
            if (contentWidth > trackWidth) {
                // Apply marquee using the same logic as ensureMarquee
                this.applyPlaylistMarquee(contentSpan, trackElement);
            }
        });
        
        trackElement.addEventListener('mouseleave', () => {
            // Don't stop marquee if this is the playing track
            if (trackElement.classList.contains('playing')) return;
            
            // Stop marquee and reset
            if (contentSpan._marqueeRAF) {
                cancelAnimationFrame(contentSpan._marqueeRAF);
                contentSpan._marqueeRAF = null;
            }
            
            trackElement.classList.remove('has-marquee');
            contentSpan.style.transform = 'translateX(0)';
        });
    }
    
    updateTrackDisplay(track) {
        // Format track display
        const trackDisplay = `<span style="color: #00ff00;">${track.name}</span>&nbsp;<span style="color: #666;">·</span>&nbsp;<span style="color: #00ccff;">${track.artist || 'unknown'}</span>`;
        
        // Update music info box (skip since removed from main UI)
        if (this.elements.trackNameText) {
            this.elements.trackNameText.innerHTML = trackDisplay;
            // Start marquee after a delay
            setTimeout(() => {
                this.ensureMarquee(this.elements.trackNameText, this.elements.trackName);
            }, 200);
        }
        
        // Update pause menu current track
        if (this.elements.currentTrackName) {
            const marqueeText = this.elements.currentTrackName.querySelector('.marquee-text');
            if (marqueeText) {
                marqueeText.innerHTML = trackDisplay;
                // Store for deferred marquee check
                this.elements.currentTrackName._marqueeText = marqueeText;
                this.elements.currentTrackName._marqueeChecked = false;
                
                // Only check marquee if pause menu is visible
                if (this.elements.pauseOverlay.style.display === 'flex') {
                    this.elements.currentTrackName._marqueeChecked = true;
                    setTimeout(() => {
                        this.ensureMarquee(marqueeText, this.elements.currentTrackName);
                    }, 100);
                }
            }
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
        if (window.game) {
            window.game.togglePause();
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
        
        // Check marquees when switching to music tab
        if (tabName === 'music') {
            this.syncMusicPlayerState();
            this.checkPlaylistMarquees();
        }
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
    
    checkPlaylistMarquees() {
        // Check marquee for all playing tracks that haven't been checked yet
        const playingTracks = this.elements.playlistTracks.querySelectorAll('.playlist-track.playing');
        playingTracks.forEach(track => {
            if (!track._marqueeChecked && track._contentSpan) {
                track._marqueeChecked = true;
                // Small delay to ensure layout is complete
                setTimeout(() => {
                    // Only apply marquee if text actually overflows
                    const padding = 30;
                    const containerWidth = track.offsetWidth - padding;
                    const textWidth = track._contentSpan.scrollWidth;
                    
                    if (textWidth > containerWidth) {
                        this.applyPlaylistMarquee(track._contentSpan, track);
                    }
                }, 50);
            }
        });
        
        // Also check the current track name marquee
        if (this.elements.currentTrackName && 
            !this.elements.currentTrackName._marqueeChecked && 
            this.elements.currentTrackName._marqueeText) {
            this.elements.currentTrackName._marqueeChecked = true;
            setTimeout(() => {
                this.ensureMarquee(
                    this.elements.currentTrackName._marqueeText, 
                    this.elements.currentTrackName
                );
            }, 50);
        }
    }

    ensureMarquee(textEl, containerEl) {
        if (!textEl || !containerEl) return;
        
        // Stop any existing animation
        if (textEl._marqueeRAF) {
            cancelAnimationFrame(textEl._marqueeRAF);
            textEl._marqueeRAF = null;
        }
        
        // Reset position
        textEl.style.transform = 'translateX(0)';
        
        // Force a reflow to ensure styles are applied
        containerEl.offsetHeight;
        
        // Wait a bit for render
        setTimeout(() => {
            // Get computed styles to account for padding
            const containerStyle = window.getComputedStyle(containerEl);
            const paddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
            const paddingRight = parseFloat(containerStyle.paddingRight) || 0;
            
            // Get fresh measurements
            const containerWidth = containerEl.clientWidth - paddingLeft - paddingRight;
            const textWidth = textEl.scrollWidth;
            
            
            // Only start marquee if text overflows
            if (textWidth > containerWidth) {
                let position = 0;
                let direction = -1;
                const speed = 0.5;
                const pauseTime = 1000;
                let pauseTimer = 0;
                const maxScroll = textWidth - containerWidth + 20; // Add some padding
                
                const animate = () => {
                    // Handle pause
                    if (pauseTimer > 0) {
                        pauseTimer -= 16;
                        textEl._marqueeRAF = requestAnimationFrame(animate);
                        return;
                    }
                    
                    // Move
                    position += speed * direction;
                    
                    // Bounce at edges
                    if (position <= -maxScroll) {
                        position = -maxScroll;
                        direction = 1;
                        pauseTimer = pauseTime;
                    } else if (position >= 0) {
                        position = 0;
                        direction = -1;
                        pauseTimer = pauseTime;
                    }
                    
                    textEl.style.transform = `translateX(${position}px)`;
                    textEl._marqueeRAF = requestAnimationFrame(animate);
                };
                
                animate();
            }
        }, 300); // Increased delay
    }

    applyPlaylistMarquee(textEl, containerEl) {
        if (!textEl || !containerEl) return;
        
        // Stop any existing animation
        if (textEl._marqueeRAF) {
            cancelAnimationFrame(textEl._marqueeRAF);
            textEl._marqueeRAF = null;
        }
        
        // Reset position
        textEl.style.transform = 'translateX(0)';
        
        // Remove marquee class initially
        containerEl.classList.remove('has-marquee');
        
        // Wait for render
        setTimeout(() => {
            const padding = 30; // Account for padding
            const containerWidth = containerEl.offsetWidth - padding;
            const textWidth = textEl.scrollWidth;
            
            
            // Only start marquee if text overflows
            if (textWidth > containerWidth) {
                // Add marquee class only when we know we need it
                containerEl.classList.add('has-marquee');
                let position = 0;
                let direction = -1;
                const speed = 0.5;
                const pauseTime = 1000;
                let pauseTimer = 0;
                const maxScroll = textWidth - containerWidth + 10;
                
                const animate = () => {
                    // Handle pause
                    if (pauseTimer > 0) {
                        pauseTimer -= 16;
                        textEl._marqueeRAF = requestAnimationFrame(animate);
                        return;
                    }
                    
                    // Move
                    position += speed * direction;
                    
                    // Bounce at edges
                    if (position <= -maxScroll) {
                        position = -maxScroll;
                        direction = 1;
                        pauseTimer = pauseTime;
                    } else if (position >= 0) {
                        position = 0;
                        direction = -1;
                        pauseTimer = pauseTime;
                    }
                    
                    textEl.style.transform = `translateX(${position}px)`;
                    textEl._marqueeRAF = requestAnimationFrame(animate);
                };
                
                animate();
            }
        }, 100);
    }
    
    updatePlaylistDisplay() {
        // Update playing status in playlist
        const tracks = this.elements.playlistTracks.querySelectorAll('.playlist-track');
        tracks.forEach((track, index) => {
            const contentSpan = track.querySelector('.playlist-track-content');
            if (index === this.musicPlayer.currentTrackIndex) {
                track.classList.add('playing');
                // Store references for deferred marquee check
                track._contentSpan = contentSpan;
                track._marqueeChecked = false;
                
                // Reset any existing marquee state first
                track.classList.remove('has-marquee');
                if (contentSpan._marqueeRAF) {
                    cancelAnimationFrame(contentSpan._marqueeRAF);
                    contentSpan._marqueeRAF = null;
                }
                contentSpan.style.transform = 'translateX(0)';
                
                // Only check marquee if pause menu is visible AND text actually overflows
                if (this.elements.pauseOverlay.style.display === 'flex') {
                    track._marqueeChecked = true;
                    setTimeout(() => {
                        // Only apply marquee if text is too long
                        const padding = 30;
                        const containerWidth = track.offsetWidth - padding;
                        const textWidth = contentSpan.scrollWidth;
                        
                        if (textWidth > containerWidth) {
                            this.applyPlaylistMarquee(contentSpan, track);
                        }
                    }, 100);
                }
            } else {
                track.classList.remove('playing');
                track.classList.remove('has-marquee');
                // Remove marquee from non-playing tracks
                if (contentSpan._marqueeRAF) {
                    cancelAnimationFrame(contentSpan._marqueeRAF);
                    contentSpan._marqueeRAF = null;
                }
                contentSpan.style.transform = 'translateX(0)';
            }
        });
    }
} 