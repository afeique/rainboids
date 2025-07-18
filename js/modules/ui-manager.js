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
            waveDisplay: document.getElementById('wave-display'),
            pauseOverlay: document.getElementById('pause-overlay'),
            messageTitle: document.getElementById('message-title'),
            messageSubtitle: document.getElementById('message-subtitle'),
            mobileControls: document.getElementById('mobile-controls'),
            titleScreen: document.getElementById('title-screen'),
            gameTitle: document.getElementById('game-title'),
            orientationOverlay: document.getElementById('orientation-overlay'),
            highScoreDisplay: document.getElementById('high-score-display'),
            // Music elements
            musicInfo: document.getElementById('music-info'),
            trackName: document.getElementById('track-name'),
            trackNameText: document.getElementById('track-name-text'),
            musicProgress: document.getElementById('music-progress'),
            musicInfoCurrentTime: document.getElementById('music-info-current-time'),
            musicInfoDuration: document.getElementById('music-info-duration'),
            pauseButton: document.getElementById('pause-button'),
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
            rerollAllSfxButton: document.getElementById('reroll-all-sfx')
        };
    }
    
    setupEventListeners() {
        // Mobile event listeners removed - using unified pause system
    }
    
    updateScore(money) {
        this.elements.score.textContent = `${Math.floor(money)}`;
    }
    
    updateWave(wave) {
        this.elements.waveDisplay.textContent = `WAVE: ${wave}`;
    }
    
    showMessage(title, subtitle = '', duration = 0) {
        this.elements.messageTitle.textContent = title;
        this.elements.messageTitle.style.display = 'block';
        this.elements.messageSubtitle.innerHTML = subtitle.replace(/\n/g, '<br>');
        this.elements.messageSubtitle.style.display = subtitle ? 'block' : 'none';
        
        if (duration > 0) {
            setTimeout(() => this.hideMessage(), duration);
        }
    }
    
    hideMessage() {
        this.elements.messageTitle.style.display = 'none';
        this.elements.messageSubtitle.style.display = 'none';
    }
    
    togglePause() {
        const isPaused = this.elements.pauseOverlay.style.display === 'flex';
        if (isPaused) {
            this.elements.pauseOverlay.style.display = 'none';
        } else {
            this.elements.pauseOverlay.style.display = 'flex';
            
            // Sync music player button state when pause menu is shown
            this.syncMusicPlayerState();
            
            // Check marquee for playing track when pause menu is shown
            this.checkPlaylistMarquees();
        }
        return !isPaused;
    }
    
    showTitleScreen() {
        this.elements.titleScreen.style.display = 'flex';
    }
    
    hideTitleScreen() {
        this.elements.titleScreen.style.display = 'none';
    }
    
    setupTitleScreen() {
        const titleText = "RAINBOIDS";
        this.elements.gameTitle.innerHTML = '';
        titleText.split('').forEach((char, index) => {
            const span = document.createElement('span');
            span.textContent = char;
            span.className = 'title-char';
            span.style.animationDelay = `${index * 0.1}s`;
            this.elements.gameTitle.appendChild(span);
        });
    }
    
    updateHighScore(highScore) {
        this.elements.highScoreDisplay.textContent = `HIGH SCORE: ${highScore}`;
    }
    
    checkOrientation() {
        // Portrait mode now supported
        this.elements.orientationOverlay.style.display = 'none';
        return false;
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
        
        // Set up event listeners
        this.elements.musicInfo.addEventListener('click', () => {
            this.showMusicTab();
        });
        
        this.elements.pauseButton.addEventListener('click', () => {
            if (window.game) {
                window.game.togglePause();
            }
        });
        
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
        
        // Update music info box
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
        this.elements.musicProgress.style.width = `${progress * 100}%`;
        this.elements.musicPlayerProgress.style.width = `${progress * 100}%`;
        
        // Update both music info and pause menu times
        this.elements.musicInfoCurrentTime.textContent = this.formatTime(currentTime);
        this.elements.musicInfoDuration.textContent = this.formatTime(duration);
        this.elements.musicCurrentTime.textContent = this.formatTime(currentTime);
        this.elements.musicDuration.textContent = this.formatTime(duration);
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