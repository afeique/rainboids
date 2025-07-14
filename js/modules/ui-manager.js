// UI management for overlays, messages, and interface elements
import { checkOrientation } from './utils.js';
import { MusicPlayer } from './music-player.js';

export class UIManager {
    constructor() {
        this.elements = {};
        this.musicPlayer = new MusicPlayer();
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
            mobilePauseButton: document.getElementById('mobile-pause-button'),
            mobileControls: document.getElementById('mobile-controls'),
            titleScreen: document.getElementById('title-screen'),
            gameTitle: document.getElementById('game-title'),
            orientationOverlay: document.getElementById('orientation-overlay'),
            highScoreDisplay: document.getElementById('high-score-display'),
            // Music elements
            musicInfo: document.getElementById('music-info'),
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
            playlistTracks: document.getElementById('playlist-tracks')
        };
    }
    
    setupEventListeners() {
        this.elements.mobilePauseButton.addEventListener('click', () => {
            // Let the game handle pause
        });
    }
    
    updateScore(score) {
        this.elements.score.textContent = Math.floor(score);
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
            this.elements.mobilePauseButton.innerHTML = '||';
        } else {
            this.elements.pauseOverlay.style.display = 'flex';
            this.elements.mobilePauseButton.innerHTML = '▶';
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
            const isRepeat = this.musicPlayer.toggleRepeat();
            this.elements.musicRepeat.classList.toggle('active', isRepeat);
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
            trackElement.textContent = track.name;
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
    
    updateTrackDisplay(track) {
        // Set the track name only once
        this.elements.trackNameText.textContent = track.name;
        this.elements.currentTrackName.textContent = track.name;
        // Always (re)start the JS-driven marquee
        this.ensureMarquee(this.elements.trackNameText, this.elements.trackName);
        this.ensureMarquee(this.elements.currentTrackName, this.elements.currentTrackName.parentElement);
    }

    ensureMarquee(textEl, containerEl) {
        if (!textEl || !containerEl) return;
        // Remove any previous animation frame
        if (textEl._marqueeRAF) cancelAnimationFrame(textEl._marqueeRAF);
        // Reset transform
        textEl.style.transform = 'translateX(0)';
        // Only animate if overflow
        const containerWidth = containerEl.offsetWidth;
        const textWidth = textEl.scrollWidth;
        if (textWidth <= containerWidth) return;
        let pos = 0;
        const speed = 1.2; // px per frame
        function step() {
            pos -= speed;
            if (pos <= -textWidth) {
                pos = containerWidth;
            }
            textEl.style.transform = `translateX(${pos}px)`;
            textEl._marqueeRAF = requestAnimationFrame(step);
        }
        step();
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
    }
    
    startMusic() {
        this.musicPlayer.play();
    }
} 