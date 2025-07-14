// Music Player System with playlist management and controls
export class MusicPlayer {
    constructor() {
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.isShuffled = false;
        this.isRepeatOne = false;
        this.currentAudio = null;
        this.nextAudio = null;
        this.prevAudio = null;
        this.volume = 0.5;
        
        // UI update callbacks
        this.onTrackChange = null;
        this.onPlayStateChange = null;
        this.onProgressUpdate = null;
        
        // Initialize playlist
        this.initializePlaylist();
    }
    
    async initializePlaylist() {
        // Define all tracks in the music directory
        const tracks = [
            'acrylic-formaledehyde.mp3',
            'aura.mp3',
            'beyond-shadows.mp3',
            'blood-ties.mp3',
            'command-console.mp3',
            'cosmic-wander.mp3',
            'dangerous.mp3',
            'darkest-knight.mp3',
            'darkness-in-disguise.mp3',
            'death-star-valley.mp3',
            'do-you-wonder.mp3',
            'eastern-sinusoidia.mp3',
            'electrachu.mp3',
            'electrica.mp3',
            'electrobit.mp3',
            'exodus-de-novo.mp3',
            'incandescence.mp3',
            'inferno.mp3',
            'iridium.mp3',
            'legends.mp3',
            'lightsabre-raptor.mp3',
            'melodia-nostalgíque.mp3',
            'midnight.mp3',
            'never-enough.mp3',
            'out-for-blood.mp3',
            'rainbow-vision.mp3',
            'salvation.mp3',
            'samus.mp3',
            'solacia.mp3',
            'sparkly-glass-cannon.mp3',
            'steel-heart.mp3',
            'superhero-rodeo.mp3',
            'thundara.mp3',
            'violencia.mp3',
            'world-eater.mp3',
            'zypher.mp3'
        ];
        
        // Create playlist with full paths
        this.playlist = tracks.map(track => ({
            name: this.formatTrackName(track.replace('.mp3', '')),
            path: `music/${track}`,
            duration: 0
        }));
        
        // Shuffle playlist on initialization
        this.shufflePlaylist();
        
        // Load first track
        this.loadTrack(0);
    }
    
    formatTrackName(filename) {
        // Convert hyphenated filename to readable title
        return filename
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    shufflePlaylist() {
        // Fisher-Yates shuffle
        for (let i = this.playlist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
        }
        this.isShuffled = true;
    }
    
    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;
        
        this.currentTrackIndex = index;
        const track = this.playlist[index];
        
        // Create new audio element
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.removeEventListener('timeupdate', this.handleTimeUpdate);
            this.currentAudio.removeEventListener('ended', this.handleTrackEnd);
        }
        
        this.currentAudio = new Audio(track.path);
        this.currentAudio.volume = this.volume;
        this.currentAudio.addEventListener('timeupdate', this.handleTimeUpdate.bind(this));
        this.currentAudio.addEventListener('ended', this.handleTrackEnd.bind(this));
        this.currentAudio.addEventListener('loadedmetadata', () => {
            track.duration = this.currentAudio.duration;
        });
        
        // Preload next and previous tracks
        this.preloadAdjacentTracks();
        
        // Notify UI of track change
        if (this.onTrackChange) {
            this.onTrackChange(track);
        }
        
        // Log for debugging
        console.log('Now playing:', track.name);
        
        // Start playing if we were playing before
        if (this.isPlaying) {
            this.play();
        }
    }
    
    preloadAdjacentTracks() {
        // Preload next track
        const nextIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        if (this.nextAudio) {
            this.nextAudio.src = '';
        }
        this.nextAudio = new Audio(this.playlist[nextIndex].path);
        this.nextAudio.volume = this.volume;
        
        // Preload previous track
        const prevIndex = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
        if (this.prevAudio) {
            this.prevAudio.src = '';
        }
        this.prevAudio = new Audio(this.playlist[prevIndex].path);
        this.prevAudio.volume = this.volume;
    }
    
    play() {
        if (this.currentAudio) {
            this.currentAudio.play();
            this.isPlaying = true;
            if (this.onPlayStateChange) {
                this.onPlayStateChange(true);
            }
        }
    }
    
    pause() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.isPlaying = false;
            if (this.onPlayStateChange) {
                this.onPlayStateChange(false);
            }
        }
    }
    
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    next() {
        const nextIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        this.loadTrack(nextIndex);
    }
    
    previous() {
        // If more than 3 seconds into the track, restart it
        if (this.currentAudio && this.currentAudio.currentTime > 3) {
            this.currentAudio.currentTime = 0;
        } else {
            // Otherwise go to previous track
            const prevIndex = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
            this.loadTrack(prevIndex);
        }
    }
    
    seek(percentage) {
        if (this.currentAudio && this.currentAudio.duration) {
            this.currentAudio.currentTime = this.currentAudio.duration * percentage;
        }
    }
    
    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        if (this.isShuffled) {
            // Re-shuffle, keeping current track at the beginning
            const currentTrack = this.playlist[this.currentTrackIndex];
            this.playlist.splice(this.currentTrackIndex, 1);
            this.shufflePlaylist();
            this.playlist.unshift(currentTrack);
            this.currentTrackIndex = 0;
        }
        return this.isShuffled;
    }
    
    toggleRepeat() {
        this.isRepeatOne = !this.isRepeatOne;
        return this.isRepeatOne;
    }
    
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.currentAudio) {
            this.currentAudio.volume = this.volume;
        }
        if (this.nextAudio) {
            this.nextAudio.volume = this.volume;
        }
        if (this.prevAudio) {
            this.prevAudio.volume = this.volume;
        }
    }
    
    handleTimeUpdate() {
        if (this.currentAudio && this.onProgressUpdate) {
            const progress = this.currentAudio.currentTime / this.currentAudio.duration;
            this.onProgressUpdate(progress, this.currentAudio.currentTime, this.currentAudio.duration);
        }
    }
    
    handleTrackEnd() {
        if (this.isRepeatOne) {
            // Replay current track
            this.currentAudio.currentTime = 0;
            this.play();
        } else {
            // Move to next track
            this.next();
        }
    }
    
    getCurrentTrack() {
        return this.playlist[this.currentTrackIndex];
    }
    
    getCurrentTime() {
        return this.currentAudio ? this.currentAudio.currentTime : 0;
    }
    
    getDuration() {
        return this.currentAudio ? this.currentAudio.duration : 0;
    }
}